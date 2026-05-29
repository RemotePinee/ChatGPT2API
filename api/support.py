from __future__ import annotations

from pathlib import Path
from threading import Event, Thread

from fastapi import HTTPException, Request

from services.account_service import account_service
from services.auth_service import auth_service
from services.config import config

BASE_DIR = Path(__file__).resolve().parents[1]
WEB_DIST_DIR = BASE_DIR / "web_dist"


def extract_bearer_token(authorization: str | None) -> str:
    scheme, _, value = str(authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not value.strip():
        return ""
    return value.strip()


def _legacy_admin_identity(token: str) -> dict[str, object] | None:
    auth_key = str(config.auth_key or "").strip()
    if auth_key and token == auth_key:
        return {"id": "admin", "name": "管理员", "role": "admin"}
    return None


def require_identity(authorization: str | None) -> dict[str, object]:
    token = extract_bearer_token(authorization)
    identity = _legacy_admin_identity(token) or auth_service.authenticate(token)
    if identity is None:
        raise HTTPException(status_code=401, detail={"error": "密钥无效或已失效，请重新登录"})
    return identity


def require_auth_key(authorization: str | None) -> None:
    require_identity(authorization)


def require_admin(authorization: str | None) -> dict[str, object]:
    identity = require_identity(authorization)
    if identity.get("role") != "admin":
        raise HTTPException(status_code=403, detail={"error": "需要管理员权限才能执行这个操作"})
    return identity


def resolve_image_base_url(request: Request) -> str:
    return config.base_url or f"{request.url.scheme}://{request.headers.get('host', request.url.netloc)}"


def raise_image_quota_error(exc: Exception) -> None:
    message = str(exc)
    if "no available image quota" in message.lower():
        raise HTTPException(status_code=429, detail={"error": "no available image quota"}) from exc
    raise HTTPException(status_code=502, detail={"error": message}) from exc


def consume_user_quota(identity: dict[str, object], amount: int) -> None:
    """画图入口处扣减用户密钥的画图额度。admin / image_unlimited 直接放行；
    普通用户额度不足直接 402，让前端把按钮禁用并提示联系管理员加额度。"""
    role = str(identity.get("role") or "").strip().lower()
    item_id = str(identity.get("id") or "").strip()
    if role == "admin" or not item_id or item_id == "admin":
        return
    result = auth_service.consume_image_quota(item_id, max(1, int(amount or 1)))
    if not result.get("ok"):
        reason = str(result.get("reason") or "画图额度不足")
        raise HTTPException(status_code=402, detail={"error": reason})


def refund_user_quota(identity: dict[str, object], amount: int) -> None:
    """画图上游真失败时把预扣的画图额度退回去。
    与 [consume_user_quota] 对称：admin / image_unlimited 直接 noop。

    调用时机限定在"上游真实失败"分支（content_policy / 5xx / 上游超时 / 任务取消）。
    用户输入错误（400 / 文本审查不过）走 fail-fast 路径，已经在扣费前就 raise，
    走不到这里——所以这里不需要再区分原因。
    任何异常吞掉：退款失败也不该影响错误响应本身。
    """
    role = str(identity.get("role") or "").strip().lower()
    item_id = str(identity.get("id") or "").strip()
    if role == "admin" or not item_id or item_id == "admin":
        return
    try:
        auth_service.refund_image_quota(item_id, max(1, int(amount or 1)))
    except Exception:
        # 退款失败也不抛——主流程已经在返回错误响应了，再叠一个错误更糟
        pass


def consume_user_chat_quota(identity: dict[str, object], amount: int = 1) -> None:
    """对话入口处扣减用户密钥的对话额度（日 / 月 / 总同时扣）。
    admin 直接放行；任一档剩余不够直接 402，让前端把发送按钮禁用并提示用户。"""
    role = str(identity.get("role") or "").strip().lower()
    item_id = str(identity.get("id") or "").strip()
    if role == "admin" or not item_id or item_id == "admin":
        return
    result = auth_service.consume_chat_quota(item_id, max(1, int(amount or 1)))
    if not result.get("ok"):
        reason = str(result.get("reason") or "对话额度不足")
        raise HTTPException(status_code=402, detail={"error": reason})


def refund_user_chat_quota(identity: dict[str, object], amount: int = 1) -> None:
    """对话上游真失败（连接失败 / 上游 5xx）时把预扣的对话额度退回去。
    任何异常吞掉：退款失败不该影响错误响应本身。"""
    role = str(identity.get("role") or "").strip().lower()
    item_id = str(identity.get("id") or "").strip()
    if role == "admin" or not item_id or item_id == "admin":
        return
    try:
        auth_service.refund_chat_quota(item_id, max(1, int(amount or 1)))
    except Exception:
        pass


def sanitize_cpa_pool(pool: dict | None) -> dict | None:
    if not isinstance(pool, dict):
        return None
    return {key: value for key, value in pool.items() if key != "secret_key"}


def sanitize_cpa_pools(pools: list[dict]) -> list[dict]:
    return [sanitized for pool in pools if (sanitized := sanitize_cpa_pool(pool)) is not None]


def sanitize_sub2api_server(server: dict | None) -> dict | None:
    if not isinstance(server, dict):
        return None
    sanitized = {key: value for key, value in server.items() if key not in {"password", "api_key"}}
    sanitized["has_api_key"] = bool(str(server.get("api_key") or "").strip())
    return sanitized


def sanitize_sub2api_servers(servers: list[dict]) -> list[dict]:
    return [sanitized for server in servers if (sanitized := sanitize_sub2api_server(server)) is not None]


def start_limited_account_watcher(stop_event: Event) -> Thread:
    interval_seconds = config.refresh_account_interval_minute * 60

    def worker() -> None:
        while not stop_event.is_set():
            try:
                limited_tokens = account_service.list_limited_tokens()
                if limited_tokens:
                    print(f"[account-limited-watcher] checking {len(limited_tokens)} limited accounts")
                    account_service.refresh_accounts(limited_tokens)
            except Exception as exc:
                print(f"[account-limited-watcher] fail {exc}")
            stop_event.wait(interval_seconds)

    thread = Thread(target=worker, name="limited-account-watcher", daemon=True)
    thread.start()
    return thread


def resolve_web_asset(requested_path: str) -> Path | None:
    if not WEB_DIST_DIR.exists():
        return None
    clean_path = requested_path.strip("/")
    base_dir = WEB_DIST_DIR.resolve()
    candidates = [base_dir / "index.html"] if not clean_path else [
        base_dir / Path(clean_path),
        base_dir / clean_path / "index.html",
        base_dir / f"{clean_path}.html",
    ]
    for candidate in candidates:
        try:
            candidate.resolve().relative_to(base_dir)
        except ValueError:
            continue
        if candidate.is_file():
            return candidate
    return None
