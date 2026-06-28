from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field

from api.support import require_admin
from services.auth_service import auth_service
from services.cdk_service import cdk_service


class BatchCreateCDKRequest(BaseModel):
    count: int = Field(..., ge=1, le=1000, description="生成数量，1-1000")
    expires_at: str | None = Field(None, description="过期时间（ISO 8601）")
    quota_config: dict = Field(..., description="配额配置")
    usage_type: str = Field("single", description="使用类型：single（单次）或 multiple（多次）")
    max_uses: int = Field(0, ge=0, description="最大使用次数（usage_type=multiple 时有效，0=无限）")
    custom_code: str | None = Field(None, description="自定义 CDK 码（仅当 count=1 且 usage_type=multiple 时有效）")


class RedeemCDKRequest(BaseModel):
    code: str = Field(..., description="CDK 兑换码")
    user_name: str = Field(..., description="用户名")


class ListCDKRequest(BaseModel):
    status: str | None = Field(None, description="筛选状态：active/used/expired")
    limit: int = Field(100, ge=1, le=500)
    offset: int = Field(0, ge=0)


class UpdateCDKRequest(BaseModel):
    expires_at: str | None = Field(None, description="过期时间（ISO 8601），null 表示永不过期")
    quota_config: dict | None = Field(None, description="配额配置")
    max_uses: int | None = Field(None, ge=0, description="最大使用次数（仅 multiple 类型，0=无限）")


def create_router() -> APIRouter:
    router = APIRouter(prefix="/api/cdk", tags=["cdk"])

    @router.post("/batch-create")
    async def batch_create_cdk(
        body: BatchCreateCDKRequest,
        authorization: str | None = Header(None),
    ):
        """批量生成 CDK（仅管理员）"""
        require_admin(authorization)
        try:
            items = cdk_service.batch_create(
                count=body.count,
                quota_config=body.quota_config,
                expires_at=body.expires_at,
                usage_type=body.usage_type,
                max_uses=body.max_uses,
                custom_code=body.custom_code,
            )
            stats = cdk_service.get_stats()
            return {
                "items": items,
                "stats": stats,
            }
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/list")
    async def list_cdk(
        authorization: str | None = Header(None),
        body: ListCDKRequest | None = None,
    ):
        """列出 CDK 列表（仅管理员）"""
        require_admin(authorization)
        if body is None:
            body = ListCDKRequest()
        try:
            result = cdk_service.list_codes(
                status=body.status if body.status else None,
                limit=body.limit,
                offset=body.offset,
            )
            return result
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/stats")
    async def get_cdk_stats(authorization: str | None = Header(None)):
        """获取 CDK 统计信息（仅管理员）"""
        require_admin(authorization)
        try:
            stats = cdk_service.get_stats()
            return {"stats": stats}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/redeem")
    async def redeem_cdk(body: RedeemCDKRequest):
        """兑换 CDK（公开接口，无需鉴权）"""
        try:
            # 兑换 CDK
            redeem_result = cdk_service.redeem(body.code, body.user_name)

            # 创建用户密钥
            quota_config = redeem_result["quota_config"]
            created_key, raw_key = auth_service.create_key(
                role="user",
                name=redeem_result["user_name"],
                account_tier=quota_config.get("account_tier", "free"),
                image_daily_quota=quota_config.get("image_daily_quota", 0),
                image_daily_unlimited=quota_config.get("image_daily_unlimited", True),
                image_monthly_quota=quota_config.get("image_monthly_quota", 0),
                image_monthly_unlimited=quota_config.get("image_monthly_unlimited", True),
                image_total_quota=quota_config.get("image_total_quota", 0),
                image_total_unlimited=quota_config.get("image_total_unlimited", False),
                chat_daily_quota=quota_config.get("chat_daily_quota", 0),
                chat_daily_unlimited=quota_config.get("chat_daily_unlimited", True),
                chat_monthly_quota=quota_config.get("chat_monthly_quota", 0),
                chat_monthly_unlimited=quota_config.get("chat_monthly_unlimited", True),
                chat_total_quota=quota_config.get("chat_total_quota", 0),
                chat_total_unlimited=quota_config.get("chat_total_unlimited", True),
            )

            # 更新 CDK 记录的 key_id
            usage_record_index = redeem_result.get("usage_record_index")
            cdk_service.update_used_key_id(
                redeem_result["cdk_id"],
                created_key["id"],
                usage_record_index,
            )

            return {
                "success": True,
                "user_key": created_key,
                "key": raw_key,
                "message": "兑换成功！请妥善保管您的密钥，此密钥仅显示一次。",
            }
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @router.delete("/{code_id}")
    async def delete_cdk(
        code_id: str,
        authorization: str | None = Header(None),
        force: bool = Query(False, description="是否强制删除（允许删除已使用的 CDK）"),
    ):
        """删除 CDK（仅管理员）

        Args:
            code_id: CDK ID
            force: 是否强制删除（允许删除已使用的 CDK）
        """
        require_admin(authorization)
        try:
            success = cdk_service.delete_code(code_id, allow_used=force)
            if not success:
                raise HTTPException(status_code=404, detail="CDK 不存在")
            stats = cdk_service.get_stats()
            return {"success": True, "stats": stats}
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @router.put("/{code_id}")
    async def update_cdk(
        code_id: str,
        body: UpdateCDKRequest,
        authorization: str | None = Header(None),
    ):
        """更新 CDK（仅管理员）"""
        require_admin(authorization)
        try:
            updated_item = cdk_service.update_code(
                code_id=code_id,
                expires_at=body.expires_at,
                quota_config=body.quota_config,
                max_uses=body.max_uses,
            )
            if not updated_item:
                raise HTTPException(status_code=404, detail="CDK 不存在")
            stats = cdk_service.get_stats()
            return {"success": True, "item": updated_item, "stats": stats}
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    return router
