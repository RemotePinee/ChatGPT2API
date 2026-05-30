"""聊天会话持久化：按 user_id 隔离，挂在 storage 抽象上做"统一备份"。

底层 backend 不感知用户，所有会话扁平存在同一份 chat_conversations 集合里；
service 层在内存里按 user_id 过滤、按 updated_at 倒排。
读写都拿全量、改一条、再整把覆盖回去——量级是个人级别（同一用户几百条），
跟 accounts/auth_keys 的写法对齐，省掉额外索引。
"""
from __future__ import annotations

import threading
import time
import uuid
from typing import Any

from services.config import config


def _utcnow_ms() -> int:
    return int(time.time() * 1000)


def _normalize_message(value: object) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    role = str(value.get("role") or "").strip()
    if role not in {"user", "assistant", "system"}:
        return None
    content = value.get("content")
    if not isinstance(content, str):
        return None
    return {"role": role, "content": content}


def _normalize_messages(value: object) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    out: list[dict[str, Any]] = []
    for item in value:
        normalized = _normalize_message(item)
        if normalized is not None:
            out.append(normalized)
    return out


def _normalize_record(value: object) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    cid = str(value.get("id") or "").strip()
    user_id = str(value.get("user_id") or "").strip()
    if not cid or not user_id:
        return None
    return {
        "id": cid,
        "user_id": user_id,
        "title": str(value.get("title") or "").strip(),
        "messages": _normalize_messages(value.get("messages")),
        "upstream_conversation_id": str(value.get("upstream_conversation_id") or "").strip(),
        "upstream_account_token": str(value.get("upstream_account_token") or "").strip(),
        "created_at": int(value.get("created_at") or 0) or _utcnow_ms(),
        "updated_at": int(value.get("updated_at") or 0) or _utcnow_ms(),
    }


def _public_view(record: dict[str, Any]) -> dict[str, Any]:
    """对外不暴露 upstream_account_token——后端拿来做换号续聊就够了，
    前端没用上还会被一起备份/同步出去，没必要。"""
    return {
        "id": record["id"],
        "title": record["title"],
        "messages": list(record["messages"]),
        "upstream_conversation_id": record["upstream_conversation_id"],
        "created_at": record["created_at"],
        "updated_at": record["updated_at"],
    }


class ChatService:
    def __init__(self) -> None:
        self._lock = threading.RLock()

    def _load_all(self) -> list[dict[str, Any]]:
        backend = config.get_storage_backend()
        items = backend.load_chat_conversations() or []
        normalized: list[dict[str, Any]] = []
        for item in items:
            record = _normalize_record(item)
            if record is not None:
                normalized.append(record)
        return normalized

    def _save_all(self, items: list[dict[str, Any]]) -> None:
        config.get_storage_backend().save_chat_conversations(items)

    def list_for_user(self, user_id: str) -> list[dict[str, Any]]:
        if not user_id:
            return []
        with self._lock:
            items = [r for r in self._load_all() if r["user_id"] == user_id]
        items.sort(key=lambda r: r["updated_at"], reverse=True)
        return [_public_view(r) for r in items]

    def get_for_user(self, user_id: str, conversation_id: str) -> dict[str, Any] | None:
        if not user_id or not conversation_id:
            return None
        with self._lock:
            for record in self._load_all():
                if record["user_id"] == user_id and record["id"] == conversation_id:
                    return _public_view(record)
        return None

    def upsert_for_user(self, user_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        if not user_id:
            raise ValueError("user_id is required")
        cid = str(payload.get("id") or "").strip() or uuid.uuid4().hex
        title = str(payload.get("title") or "").strip()
        messages = _normalize_messages(payload.get("messages"))
        upstream_cid = str(payload.get("upstream_conversation_id") or "").strip()
        upstream_token = str(payload.get("upstream_account_token") or "").strip()

        now_ms = _utcnow_ms()
        with self._lock:
            items = self._load_all()
            existing = next((r for r in items if r["id"] == cid and r["user_id"] == user_id), None)
            if existing is None:
                # 不要让前端伪造 user_id 改别人的会话——直接以登录身份覆盖。
                if any(r["id"] == cid for r in items):
                    cid = uuid.uuid4().hex
                record = {
                    "id": cid,
                    "user_id": user_id,
                    "title": title,
                    "messages": messages,
                    "upstream_conversation_id": upstream_cid,
                    "upstream_account_token": upstream_token,
                    "created_at": now_ms,
                    "updated_at": now_ms,
                }
                items.append(record)
            else:
                record = existing
                record["title"] = title or record["title"]
                record["messages"] = messages
                if upstream_cid:
                    record["upstream_conversation_id"] = upstream_cid
                if upstream_token:
                    record["upstream_account_token"] = upstream_token
                record["updated_at"] = now_ms
            self._save_all(items)
            return _public_view(record)

    def delete_for_user(self, user_id: str, conversation_id: str) -> bool:
        if not user_id or not conversation_id:
            return False
        with self._lock:
            items = self._load_all()
            kept = [r for r in items if not (r["user_id"] == user_id and r["id"] == conversation_id)]
            if len(kept) == len(items):
                return False
            self._save_all(kept)
            return True

    def find_token_by_upstream(self, user_id: str, upstream_conversation_id: str) -> str:
        """换号续聊'粘住号'用：通过 upstream cid 反查保存过的账号 token。
        命中本用户的记录才返回，避免越权拿到别人的号。"""
        if not user_id or not upstream_conversation_id:
            return ""
        with self._lock:
            for record in self._load_all():
                if (
                    record["user_id"] == user_id
                    and record["upstream_conversation_id"] == upstream_conversation_id
                    and record["upstream_account_token"]
                ):
                    return record["upstream_account_token"]
        return ""


chat_service = ChatService()
