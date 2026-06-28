from __future__ import annotations

from contextlib import asynccontextmanager
from threading import Event

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from api import accounts, ai, chat, cdk, gallery, image_tasks, register, system, video
from api.support import resolve_web_asset, start_limited_account_watcher
from services.backup_service import backup_service
from services.config import config


def create_app() -> FastAPI:
    app_version = config.app_version

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        stop_event = Event()
        thread = start_limited_account_watcher(stop_event)
        backup_service.start()
        config.cleanup_old_images()
        try:
            yield
        finally:
            stop_event.set()
            thread.join(timeout=1)
            backup_service.stop()

    app = FastAPI(title="chatgpt2api", version=app_version, lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # 动态接口禁缓存：/api/* 与 /v1/* 都是后端业务数据，浏览器若自行启发式缓存
    # 会出现"改了配置/数据但 UI 不更新"的诡异现象。一律 no-store 让每次都打到后端。
    @app.middleware("http")
    async def _no_store_for_api(request: Request, call_next):
        response = await call_next(request)
        path = request.url.path
        if path.startswith("/api/") or path.startswith("/v1/"):
            response.headers["Cache-Control"] = "no-store"
        return response

    app.include_router(ai.create_router())
    app.include_router(chat.create_router())
    app.include_router(accounts.create_router())
    app.include_router(cdk.create_router())
    app.include_router(gallery.create_router())
    app.include_router(image_tasks.create_router())
    app.include_router(register.create_router())
    app.include_router(video.create_router())
    app.include_router(system.create_router(app_version))
    if config.images_dir.exists():
        app.mount("/images", StaticFiles(directory=str(config.images_dir)), name="images")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_web(full_path: str):
        asset = resolve_web_asset(full_path)
        if asset is not None:
            return FileResponse(asset)
        if full_path.strip("/").startswith("_next/"):
            raise HTTPException(status_code=404, detail="Not Found")
        fallback = resolve_web_asset("")
        if fallback is None:
            raise HTTPException(status_code=404, detail="Not Found")
        return FileResponse(fallback)

    return app

app = create_app()
