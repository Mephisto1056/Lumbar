from fastapi import APIRouter
from app.api.endpoints import sse
from app.api.endpoints import auth
from app.api.endpoints import chat
from app.api.endpoints import config
from app.api.endpoints import base
from app.api.endpoints import workflow
from app.api.endpoints import chatflow
from app.api.endpoints import health
from app.api.endpoints import google_drive
from app.core.config import settings

api_router = APIRouter(prefix=settings.api_version_url)
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(chat.router, prefix="/chat", tags=["chat"])
api_router.include_router(base.router, prefix="/base", tags=["base"])
api_router.include_router(sse.router, prefix="/sse", tags=["chat"])
api_router.include_router(config.router, prefix="/config", tags=["config"])
api_router.include_router(workflow.router, prefix="/workflow", tags=["workflow"])
api_router.include_router(chatflow.router, prefix="/chatflow", tags=["chatflow"])
api_router.include_router(health.router, prefix="/health", tags=["health"])
api_router.include_router(google_drive.router, prefix="/google-drive", tags=["google-drive"])
