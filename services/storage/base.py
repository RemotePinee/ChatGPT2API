from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class StorageBackend(ABC):
    """抽象存储后端基类"""

    @abstractmethod
    def load_accounts(self) -> list[dict[str, Any]]:
        """加载所有账号数据"""
        pass

    @abstractmethod
    def save_accounts(self, accounts: list[dict[str, Any]]) -> None:
        """保存所有账号数据"""
        pass

    @abstractmethod
    def load_auth_keys(self) -> list[dict[str, Any]]:
        """加载所有鉴权密钥数据"""
        pass

    @abstractmethod
    def save_auth_keys(self, auth_keys: list[dict[str, Any]]) -> None:
        """保存所有鉴权密钥数据"""
        pass

    @abstractmethod
    def load_gallery_items(self) -> list[dict[str, Any]]:
        """加载所有画廊条目"""
        pass

    @abstractmethod
    def save_gallery_items(self, items: list[dict[str, Any]]) -> None:
        """保存所有画廊条目"""
        pass

    def load_chat_conversations(self) -> list[dict[str, Any]]:
        """加载所有聊天会话；老后端没实现时返回空，避免启动失败。"""
        return []

    def save_chat_conversations(self, items: list[dict[str, Any]]) -> None:
        """保存所有聊天会话；默认 noop，子类按需覆盖。"""
        return None

    def load_cdk_codes(self) -> list[dict[str, Any]]:
        """加载所有 CDK 兑换码；默认返回空列表。"""
        return []

    def save_cdk_codes(self, items: list[dict[str, Any]]) -> None:
        """保存所有 CDK 兑换码；默认 noop，子类按需覆盖。"""
        return None

    @abstractmethod
    def health_check(self) -> dict[str, Any]:
        """健康检查，返回存储后端状态"""
        pass

    @abstractmethod
    def get_backend_info(self) -> dict[str, Any]:
        """获取存储后端信息"""
        pass
