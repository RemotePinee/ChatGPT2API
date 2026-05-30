from __future__ import annotations

import json
import threading
import time
from typing import Any, Iterator

from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from api.support import consume_user_chat_quota, refund_user_chat_quota, require_identity
from services.chat_service import chat_service
from services.protocol.conversation import (
    ConversationRequest,
    delete_conversation_safely,
    stream_chat_events,
)


class ChatStreamRequest(BaseModel):
    model: str = "auto"
    messages: list[dict[str, Any]] = Field(default_factory=list)
    conversation_id: str | None = None
    force_switch_account: bool = False


class ChatConversationUpsertRequest(BaseModel):
    id: str | None = None
    title: str = ""
    messages: list[dict[str, Any]] = Field(default_factory=list)
    upstream_conversation_id: str | None = None


# 进程内 (upstream_cid -> (account_token, recorded_at))。
# 用户 stream 完成后立即保存就能命中；进程重启后丢失也只是这一轮失去续聊的"粘住号"，
# 用户输入下一轮时 chat_service 会重新写入新的 token，可以自然恢复。
# 1 小时窗口够把 stream→save 的常见间隔覆盖掉，又不至于无限堆。
_TOKEN_CACHE_TTL_SECONDS = 3600
_token_cache: dict[str, tuple[str, float]] = {}
_token_cache_lock = threading.Lock()


def _remember_token(conversation_id: str, account_token: str) -> None:
    if not conversation_id or not account_token:
        return
    now = time.time()
    with _token_cache_lock:
        _token_cache[conversation_id] = (account_token, now)
        # 顺手做下惰性清理，避免长期运行涨内存
        expired = [cid for cid, (_, ts) in _token_cache.items() if now - ts > _TOKEN_CACHE_TTL_SECONDS]
        for cid in expired:
            _token_cache.pop(cid, None)


def _peek_token(conversation_id: str) -> str:
    if not conversation_id:
        return ""
    now = time.time()
    with _token_cache_lock:
        item = _token_cache.get(conversation_id)
        if not item:
            return ""
        token, recorded_at = item
        if now - recorded_at > _TOKEN_CACHE_TTL_SECONDS:
            _token_cache.pop(conversation_id, None)
            return ""
        return token


def _sse(event: dict[str, Any]) -> str:
    return f"data: {json.dumps(event, ensure_ascii=False)}\n\n"


def _resolve_preferred_token(user_id: str, upstream_cid: str) -> str:
    """续聊'粘住号'：优先查进程内缓存，再落到 chat_conversations 持久化反查。
    缓存命中率高、读 IO 接近零；持久化兜底覆盖重启 / 跨实例场景。"""
    if not upstream_cid:
        return ""
    cached = _peek_token(upstream_cid)
    if cached:
        return cached
    return chat_service.find_token_by_upstream(user_id, upstream_cid)


def _stream(body: ChatStreamRequest, identity: dict[str, Any]) -> Iterator[str]:
    """把内部 conversation.* 事件薄薄一层映射成 SSE。
    收尾时无论上游成功失败都异步 DELETE，避免在用户号下留下"临时聊天"痕迹；
    同时把 (cid, token) 存到 token cache，前端落库时再回填，用于换号续聊。
    每轮都开新上游 cid，历史靠 messages 全量带回去；这样和 done 后的异步 DELETE
    不冲突，也避免上游因 parent_message_id 不连续而 404。
    入口处已经预扣 1 份对话额度；上游真失败（一个字也没吐出来）时退回。"""
    user_id = str(identity.get("id") or "")
    request = ConversationRequest(model=body.model, messages=body.messages or None)
    upstream_cid_in = str(body.conversation_id or "").strip()
    preferred_token = "" if body.force_switch_account else _resolve_preferred_token(user_id, upstream_cid_in)
    excluded: set[str] = set()
    if body.force_switch_account:
        prev = _resolve_preferred_token(user_id, upstream_cid_in)
        if prev:
            excluded.add(prev)
    conversation_id = ""
    account_token = ""
    delivered_any = False
    try:
        for event in stream_chat_events(
            request,
            preferred_token=preferred_token,
            excluded_tokens=excluded,
        ):
            account_token = str(event.get("account_token") or account_token)
            cid = str(event.get("conversation_id") or "")
            if cid and cid != conversation_id:
                conversation_id = cid
                yield _sse({"type": "conversation.id", "conversation_id": cid})
            etype = str(event.get("type") or "")
            if etype == "conversation.delta":
                delta = str(event.get("delta") or "")
                if delta:
                    delivered_any = True
                    yield _sse({"type": "delta", "text": delta})
            elif etype == "conversation.done":
                yield _sse({"type": "done"})
    except Exception as exc:
        # 一个字都没吐出来就挂了，按"真失败"退回预扣的 1 份。
        # 已经吐过 token 的中途断流不退——用户已经拿到了价值。
        if not delivered_any:
            refund_user_chat_quota(identity, 1)
        yield _sse({"type": "error", "message": str(exc)})
    finally:
        if account_token and conversation_id:
            _remember_token(conversation_id, account_token)
            threading.Thread(
                target=delete_conversation_safely,
                args=(account_token, conversation_id),
                name="chat-cleanup",
                daemon=True,
            ).start()


def create_router() -> APIRouter:
    router = APIRouter()

    @router.post("/api/chat/stream")
    async def chat_stream(body: ChatStreamRequest, authorization: str | None = Header(default=None)):
        identity = require_identity(authorization)
        if not body.messages:
            raise HTTPException(status_code=400, detail={"error": "messages is required"})
        # 入口处预扣 1 份对话额度；任一档（日 / 月 / 总）不足都直接 402。
        # 上游真失败（一个字未吐出）时由 _stream 内部退回。
        consume_user_chat_quota(identity, 1)
        return StreamingResponse(_stream(body, identity), media_type="text/event-stream")

    @router.get("/api/chat/conversations")
    async def list_conversations(authorization: str | None = Header(default=None)):
        identity = require_identity(authorization)
        items = chat_service.list_for_user(str(identity.get("id") or ""))
        return {"items": items}

    @router.post("/api/chat/conversations")
    async def upsert_conversation(
        body: ChatConversationUpsertRequest,
        authorization: str | None = Header(default=None),
    ):
        identity = require_identity(authorization)
        upstream_cid = str(body.upstream_conversation_id or "").strip()
        # 前端拿不到 account_token；就近从 _token_cache 里查回填，给换号续聊用。
        upstream_token = _peek_token(upstream_cid) if upstream_cid else ""
        record = chat_service.upsert_for_user(
            str(identity.get("id") or ""),
            {
                "id": body.id,
                "title": body.title,
                "messages": body.messages,
                "upstream_conversation_id": upstream_cid,
                "upstream_account_token": upstream_token,
            },
        )
        return {"item": record}

    @router.delete("/api/chat/conversations/{conversation_id}")
    async def delete_conversation(
        conversation_id: str,
        authorization: str | None = Header(default=None),
    ):
        identity = require_identity(authorization)
        ok = chat_service.delete_for_user(str(identity.get("id") or ""), conversation_id)
        return {"ok": ok}

    return router
