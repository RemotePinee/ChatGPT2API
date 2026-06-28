from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import datetime, timezone
from threading import Lock
from typing import Literal

from services.config import config
from services.storage.base import StorageBackend

CDKStatus = Literal["active", "used", "expired"]
CDKUsageType = Literal["single", "multiple"]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _generate_cdk_code() -> str:
    """生成 16 位随机 CDK 码（大写字母和数字）"""
    # 使用 secrets 生成加密安全的随机字符串
    charset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # 移除易混淆字符 0OI1
    return "".join(secrets.choice(charset) for _ in range(16))


def _hash_code(code: str) -> str:
    """对 CDK 码进行哈希存储"""
    return hashlib.sha256(code.encode("utf-8")).hexdigest()


class CDKService:
    def __init__(self, storage: StorageBackend):
        self.storage = storage
        self._lock = Lock()
        self._items = self._load()

    @staticmethod
    def _clean(value: object) -> str:
        return str(value or "").strip()

    @staticmethod
    def _coerce_int(value: object, default: int = 0) -> int:
        try:
            return max(0, int(value))
        except (TypeError, ValueError):
            return default

    @staticmethod
    def _coerce_bool(value: object, default: bool = False) -> bool:
        if value is None:
            return default
        return bool(value)

    def _normalize_item(self, raw: object) -> dict[str, object] | None:
        """规范化 CDK 条目"""
        if not isinstance(raw, dict):
            return None

        code_hash = self._clean(raw.get("code_hash"))
        if not code_hash:
            return None

        item_id = self._clean(raw.get("id")) or uuid.uuid4().hex[:12]
        status = self._clean(raw.get("status")).lower()
        if status not in {"active", "used", "expired"}:
            status = "active"

        # 使用类型
        usage_type = self._clean(raw.get("usage_type", "single")).lower()
        if usage_type not in {"single", "multiple"}:
            usage_type = "single"

        # 使用次数
        max_uses = self._coerce_int(raw.get("max_uses"), 0)  # 0 = 无限次
        current_uses = self._coerce_int(raw.get("current_uses"), 0)

        # 使用记录
        usage_records = raw.get("usage_records", [])
        if not isinstance(usage_records, list):
            usage_records = []

        # 配额配置
        quota_config = raw.get("quota_config", {})
        if not isinstance(quota_config, dict):
            quota_config = {}

        return {
            "id": item_id,
            "code": self._clean(raw.get("code")) or None,  # 保留明文 code（如果存在）
            "code_hash": code_hash,
            "status": status,
            "usage_type": usage_type,
            "max_uses": max_uses,
            "current_uses": current_uses,
            "usage_records": usage_records,
            "created_at": self._clean(raw.get("created_at")) or _now_iso(),
            "expires_at": self._clean(raw.get("expires_at")) or None,
            "used_at": self._clean(raw.get("used_at")) or None,  # 保留兼容性
            "used_by_name": self._clean(raw.get("used_by_name")) or None,  # 保留兼容性
            "used_by_key_id": self._clean(raw.get("used_by_key_id")) or None,  # 保留兼容性
            "quota_config": {
                "account_tier": self._clean(quota_config.get("account_tier", "free")),
                "image_daily_quota": self._coerce_int(quota_config.get("image_daily_quota"), 0),
                "image_daily_unlimited": self._coerce_bool(quota_config.get("image_daily_unlimited"), True),
                "image_monthly_quota": self._coerce_int(quota_config.get("image_monthly_quota"), 0),
                "image_monthly_unlimited": self._coerce_bool(quota_config.get("image_monthly_unlimited"), True),
                "image_total_quota": self._coerce_int(quota_config.get("image_total_quota"), 0),
                "image_total_unlimited": self._coerce_bool(quota_config.get("image_total_unlimited"), False),
                "chat_daily_quota": self._coerce_int(quota_config.get("chat_daily_quota"), 0),
                "chat_daily_unlimited": self._coerce_bool(quota_config.get("chat_daily_unlimited"), True),
                "chat_monthly_quota": self._coerce_int(quota_config.get("chat_monthly_quota"), 0),
                "chat_monthly_unlimited": self._coerce_bool(quota_config.get("chat_monthly_unlimited"), True),
                "chat_total_quota": self._coerce_int(quota_config.get("chat_total_quota"), 0),
                "chat_total_unlimited": self._coerce_bool(quota_config.get("chat_total_unlimited"), True),
            },
        }

    def _load(self) -> list[dict[str, object]]:
        try:
            items = self.storage.load_cdk_codes()
        except Exception:
            return []
        if not isinstance(items, list):
            return []
        return [normalized for item in items if (normalized := self._normalize_item(item)) is not None]

    def _save(self) -> None:
        self.storage.save_cdk_codes(self._items)

    def _reload_locked(self) -> None:
        self._items = self._load()

    @classmethod
    def _public_item(cls, item: dict[str, object], *, include_code: bool = False) -> dict[str, object]:
        """公开视图，不包含完整的 code_hash"""
        result: dict[str, object] = {
            "id": item.get("id"),
            "status": item.get("status"),
            "usage_type": item.get("usage_type", "single"),
            "max_uses": item.get("max_uses", 0),
            "current_uses": item.get("current_uses", 0),
            "created_at": item.get("created_at"),
            "expires_at": item.get("expires_at"),
            "used_at": item.get("used_at"),
            "used_by_name": item.get("used_by_name"),
            "quota_config": item.get("quota_config"),
            "usage_records": item.get("usage_records", []),
        }
        if include_code:
            # 仅在生成时返回明文 code
            result["code"] = item.get("code")
        return result

    def batch_create(
        self,
        count: int,
        *,
        quota_config: dict[str, object],
        expires_at: str | None = None,
        usage_type: str = "single",
        max_uses: int = 0,
        custom_code: str | None = None,
    ) -> list[dict[str, object]]:
        """批量生成 CDK

        Args:
            count: 生成数量
            quota_config: 配额配置
            expires_at: 过期时间
            usage_type: 使用类型 "single" 或 "multiple"
            max_uses: 最大使用次数（usage_type=multiple 时有效，0=无限）
            custom_code: 自定义 CDK 码（仅当 count=1 且 usage_type=multiple 时有效）
        """
        if count <= 0 or count > 1000:
            raise ValueError("CDK 数量必须在 1-1000 之间")

        normalized_usage_type = usage_type.lower()
        if normalized_usage_type not in {"single", "multiple"}:
            normalized_usage_type = "single"

        # 营销 CDK 支持自定义码
        if custom_code and normalized_usage_type == "multiple":
            if count != 1:
                raise ValueError("自定义 CDK 码仅支持生成 1 个营销 CDK")
            normalized_custom_code = self._clean(custom_code).upper()
            if len(normalized_custom_code) < 4 or len(normalized_custom_code) > 32:
                raise ValueError("自定义 CDK 码长度必须在 4-32 字符之间")
            # 检查是否包含非法字符
            import re
            if not re.match(r'^[A-Z0-9]+$', normalized_custom_code):
                raise ValueError("自定义 CDK 码仅支持大写字母和数字")

        created_items = []
        with self._lock:
            self._reload_locked()
            for _ in range(count):
                # 生成唯一的 CDK 码
                if custom_code and normalized_usage_type == "multiple" and count == 1:
                    code = normalized_custom_code
                    code_hash = _hash_code(code)
                    # 检查自定义码是否已存在
                    if any(item.get("code_hash") == code_hash for item in self._items):
                        raise ValueError(f"CDK 码 {code} 已存在")
                else:
                    while True:
                        code = _generate_cdk_code()
                        code_hash = _hash_code(code)
                        # 检查是否重复
                        if not any(item.get("code_hash") == code_hash for item in self._items):
                            break

                item = {
                    "id": uuid.uuid4().hex[:12],
                    "code_hash": code_hash,
                    "status": "active",
                    "usage_type": normalized_usage_type,
                    "max_uses": max(0, int(max_uses)) if normalized_usage_type == "multiple" else 0,
                    "current_uses": 0,
                    "usage_records": [],
                    "created_at": _now_iso(),
                    "expires_at": expires_at,
                    "used_at": None,
                    "used_by_name": None,
                    "used_by_key_id": None,
                    "quota_config": quota_config,
                    "code": code,  # 临时字段，仅用于返回
                }
                self._items.append(item)
                created_items.append(self._public_item(item, include_code=True))

            self._save()

        return created_items

    def list_codes(
        self,
        *,
        status: CDKStatus | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> dict[str, object]:
        """列出 CDK 列表"""
        with self._lock:
            self._reload_locked()
            filtered = self._items
            if status:
                filtered = [item for item in filtered if item.get("status") == status]

            # 按创建时间倒序
            sorted_items = sorted(
                filtered,
                key=lambda x: self._clean(x.get("created_at")),
                reverse=True,
            )

            total = len(sorted_items)
            paginated = sorted_items[offset : offset + limit]

            return {
                "items": [self._public_item(item, include_code=True) for item in paginated],
                "total": total,
                "limit": limit,
                "offset": offset,
            }

    def redeem(self, code: str, user_name: str) -> dict[str, object]:
        """兑换 CDK，返回创建的用户密钥配置"""
        normalized_code = self._clean(code).upper()
        normalized_name = self._clean(user_name)

        if not normalized_code:
            raise ValueError("请输入 CDK 兑换码")
        if not normalized_name:
            raise ValueError("请输入用户名")

        code_hash = _hash_code(normalized_code)

        with self._lock:
            self._reload_locked()
            for index, item in enumerate(self._items):
                if item.get("code_hash") != code_hash:
                    continue

                # 检查基本状态
                status = item.get("status")
                if status == "expired":
                    raise ValueError("此 CDK 已过期")

                # 检查过期时间
                expires_at = self._clean(item.get("expires_at"))
                if expires_at:
                    try:
                        expire_time = datetime.fromisoformat(expires_at)
                        if datetime.now(timezone.utc) > expire_time:
                            # 标记为过期
                            item["status"] = "expired"
                            self._save()
                            raise ValueError("此 CDK 已过期")
                    except Exception:
                        pass

                usage_type = item.get("usage_type", "single")

                # 单次使用 CDK
                if usage_type == "single":
                    if status == "used":
                        raise ValueError("此 CDK 已被使用")

                    # 标记为已使用
                    next_item = dict(item)
                    next_item["status"] = "used"
                    next_item["used_at"] = _now_iso()
                    next_item["used_by_name"] = normalized_name
                    self._items[index] = next_item
                    self._save()

                    return {
                        "cdk_id": next_item.get("id"),
                        "user_name": normalized_name,
                        "quota_config": next_item.get("quota_config"),
                    }

                # 多次使用 CDK（营销 CDK）
                elif usage_type == "multiple":
                    max_uses = item.get("max_uses", 0)
                    current_uses = item.get("current_uses", 0)
                    usage_records = item.get("usage_records", [])

                    # 检查是否达到使用上限（0 = 无限）
                    if max_uses > 0 and current_uses >= max_uses:
                        raise ValueError(f"此 CDK 已达到使用上限（{max_uses} 次）")

                    # 可选：检查同一用户是否重复兑换（防止刷额度）
                    # if any(r.get("user_name") == normalized_name for r in usage_records):
                    #     raise ValueError("您已经使用过此 CDK")

                    # 记录本次使用
                    next_item = dict(item)
                    next_item["current_uses"] = current_uses + 1

                    # 添加使用记录
                    if not isinstance(next_item.get("usage_records"), list):
                        next_item["usage_records"] = []
                    next_item["usage_records"].append({
                        "used_at": _now_iso(),
                        "user_name": normalized_name,
                        "key_id": None,  # 稍后更新
                    })

                    # 如果达到上限，标记为已用完
                    if max_uses > 0 and next_item["current_uses"] >= max_uses:
                        next_item["status"] = "used"

                    self._items[index] = next_item
                    self._save()

                    return {
                        "cdk_id": next_item.get("id"),
                        "user_name": normalized_name,
                        "quota_config": next_item.get("quota_config"),
                        "usage_record_index": len(next_item["usage_records"]) - 1,  # 用于更新 key_id
                    }

            raise ValueError("CDK 兑换码无效")

    def update_used_key_id(self, cdk_id: str, key_id: str, usage_record_index: int | None = None) -> None:
        """更新 CDK 使用后生成的 key_id（关联用）

        Args:
            cdk_id: CDK ID
            key_id: 生成的用户密钥 ID
            usage_record_index: 使用记录索引（多次使用 CDK 时需要）
        """
        with self._lock:
            for index, item in enumerate(self._items):
                if item.get("id") == cdk_id:
                    next_item = dict(item)

                    # 单次使用 CDK：直接更新
                    if item.get("usage_type") == "single":
                        next_item["used_by_key_id"] = key_id

                    # 多次使用 CDK：更新对应的使用记录
                    else:
                        usage_records = next_item.get("usage_records", [])
                        if isinstance(usage_records, list) and usage_record_index is not None:
                            if 0 <= usage_record_index < len(usage_records):
                                usage_records[usage_record_index]["key_id"] = key_id
                                next_item["usage_records"] = usage_records

                    self._items[index] = next_item
                    self._save()
                    return

    def delete_code(self, code_id: str, allow_used: bool = False) -> bool:
        """删除 CDK

        Args:
            code_id: CDK ID
            allow_used: 是否允许删除已使用的 CDK
        """
        with self._lock:
            self._reload_locked()
            for item in self._items:
                if item.get("id") == code_id:
                    if item.get("status") == "used" and not allow_used:
                        raise ValueError("已使用的 CDK 无法删除，如需强制删除请使用 allow_used=True 参数")
                    break
            else:
                return False

            before = len(self._items)
            self._items = [item for item in self._items if item.get("id") != code_id]
            if len(self._items) < before:
                self._save()
                return True
            return False

    def update_code(
        self,
        code_id: str,
        *,
        expires_at: str | None = None,
        quota_config: dict | None = None,
        max_uses: int | None = None,
    ) -> dict[str, object] | None:
        """更新 CDK 配置"""
        with self._lock:
            self._reload_locked()

            # 查找 CDK
            item = None
            for i in self._items:
                if i.get("id") == code_id:
                    item = i
                    break

            if not item:
                return None

            # 更新字段
            if expires_at is not None:
                item["expires_at"] = expires_at

            if quota_config is not None:
                # 合并配额配置
                current_config = item.get("quota_config", {})
                if not isinstance(current_config, dict):
                    current_config = {}
                current_config.update(quota_config)
                item["quota_config"] = current_config

            if max_uses is not None:
                if item.get("usage_type") != "multiple":
                    raise ValueError("只有多次使用类型的 CDK 可以设置最大使用次数")
                item["max_uses"] = max_uses

            self._save()
            return self._public_item(item, include_code=True)

    def get_stats(self) -> dict[str, object]:
        """获取统计信息"""
        with self._lock:
            self._reload_locked()
            total = len(self._items)
            active = sum(1 for item in self._items if item.get("status") == "active")
            used = sum(1 for item in self._items if item.get("status") == "used")
            expired = sum(1 for item in self._items if item.get("status") == "expired")

            return {
                "total": total,
                "active": active,
                "used": used,
                "expired": expired,
            }


cdk_service = CDKService(config.get_storage_backend())
