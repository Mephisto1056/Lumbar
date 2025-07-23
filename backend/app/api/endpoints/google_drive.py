import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from fastapi.responses import RedirectResponse

from app.core.logging import logger
from app.core.security import get_current_user, verify_username_match
from app.db.mongo import MongoDB, get_mongo
from app.models.user import User
from app.models.google_drive import (
    GoogleDriveAuthUrl,
    GoogleDriveCallback,
    GoogleDriveFileList,
    GoogleDriveImportRequest,
    GoogleDriveFile,
)
from app.services.google_drive import GoogleDriveService
from app.rag.convert_file import save_file_to_minio
from app.utils.kafka_producer import kafka_producer_manager
from app.db.redis import redis
from fastapi import UploadFile
from io import BytesIO

router = APIRouter()


@router.get("/auth/google", response_model=GoogleDriveAuthUrl)
async def get_google_auth_url(
    current_user: User = Depends(get_current_user),
    db: MongoDB = Depends(get_mongo),
):
    """获取 Google Drive 授权 URL"""
    try:
        service = GoogleDriveService(db)
        auth_url_data = await service.get_auth_url(current_user.username)
        return auth_url_data
    except Exception as e:
        logger.error(f"Failed to get Google auth URL for user {current_user.username}: {str(e)}")
        raise HTTPException(status_code=500, detail="获取授权链接失败")


@router.post("/auth/google/callback")
async def handle_google_callback(
    callback_data: GoogleDriveCallback,
    db: MongoDB = Depends(get_mongo),
):
    """处理 Google Drive OAuth 回调"""
    try:
        service = GoogleDriveService(db)
        result = await service.handle_callback(callback_data.code, callback_data.state)
        return result
    except Exception as e:
        logger.error(f"Failed to handle Google callback: {str(e)}")
        raise HTTPException(status_code=400, detail="授权失败")


@router.get("/auth/google/status")
async def check_google_auth_status(
    current_user: User = Depends(get_current_user),
    db: MongoDB = Depends(get_mongo),
):
    """检查 Google Drive 授权状态"""
    try:
        service = GoogleDriveService(db)
        is_authorized = await service.check_auth_status(current_user.username)
        return {"authorized": is_authorized}
    except Exception as e:
        logger.error(f"Failed to check auth status for user {current_user.username}: {str(e)}")
        raise HTTPException(status_code=500, detail="检查授权状态失败")


@router.delete("/auth/google")
async def revoke_google_auth(
    current_user: User = Depends(get_current_user),
    db: MongoDB = Depends(get_mongo),
):
    """撤销 Google Drive 授权"""
    try:
        await db.delete_google_drive_auth(current_user.username)
        return {"status": "success", "message": "授权已撤销"}
    except Exception as e:
        logger.error(f"Failed to revoke Google auth for user {current_user.username}: {str(e)}")
        raise HTTPException(status_code=500, detail="撤销授权失败")


@router.get("/files", response_model=GoogleDriveFileList)
async def list_google_drive_files(
    current_user: User = Depends(get_current_user),
    db: MongoDB = Depends(get_mongo),
    folder_id: Optional[str] = Query(None, description="文件夹ID，不指定则列出根目录"),
    page_token: Optional[str] = Query(None, description="分页令牌"),
    page_size: int = Query(50, ge=1, le=100, description="每页文件数量"),
):
    """列出 Google Drive 文件"""
    try:
        service = GoogleDriveService(db)
        
        # 检查授权状态
        is_authorized = await service.check_auth_status(current_user.username)
        if not is_authorized:
            raise HTTPException(status_code=401, detail="请先授权 Google Drive")
        
        file_list = await service.list_files(
            current_user.username,
            folder_id=folder_id,
            page_token=page_token,
            page_size=page_size
        )
        return file_list
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to list Google Drive files for user {current_user.username}: {str(e)}")
        raise HTTPException(status_code=500, detail="获取文件列表失败")


@router.get("/files/{file_id}/metadata", response_model=GoogleDriveFile)
async def get_google_drive_file_metadata(
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: MongoDB = Depends(get_mongo),
):
    """获取 Google Drive 文件元数据"""
    try:
        service = GoogleDriveService(db)
        
        # 检查授权状态
        is_authorized = await service.check_auth_status(current_user.username)
        if not is_authorized:
            raise HTTPException(status_code=401, detail="请先授权 Google Drive")
        
        metadata = await service.get_file_metadata(current_user.username, file_id)
        return metadata
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get file metadata for {file_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="获取文件信息失败")


@router.post("/import")
async def import_google_drive_files(
    import_request: GoogleDriveImportRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: MongoDB = Depends(get_mongo),
):
    """从 Google Drive 导入文件到知识库"""
    try:
        # 验证知识库权限
        knowledge_base_id = import_request.knowledge_base_id
        if "temp" in knowledge_base_id:
            username = knowledge_base_id.split("_")[1]
        else:
            username = knowledge_base_id.split("_")[0]
        await verify_username_match(current_user, username)
        
        service = GoogleDriveService(db)
        
        # 检查授权状态
        is_authorized = await service.check_auth_status(current_user.username)
        if not is_authorized:
            raise HTTPException(status_code=401, detail="请先授权 Google Drive")
        
        # 生成任务ID
        task_id = f"{current_user.username}_{uuid.uuid4()}"
        total_files = len(import_request.file_ids)
        
        # 初始化任务状态
        redis_connection = await redis.get_task_connection()
        await redis_connection.hset(
            f"task:{task_id}",
            mapping={
                "status": "processing",
                "total": total_files,
                "processed": 0,
                "message": "开始从 Google Drive 导入文件...",
            },
        )
        await redis_connection.expire(f"task:{task_id}", 3600)  # 1小时过期
        
        # 添加后台任务处理文件导入
        background_tasks.add_task(
            process_google_drive_import,
            service,
            current_user.username,
            knowledge_base_id,
            import_request.file_ids,
            task_id
        )
        
        return {
            "task_id": task_id,
            "knowledge_base_id": knowledge_base_id,
            "total_files": total_files,
            "message": "导入任务已开始"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to start Google Drive import: {str(e)}")
        raise HTTPException(status_code=500, detail="启动导入任务失败")


async def process_google_drive_import(
    service: GoogleDriveService,
    username: str,
    knowledge_base_id: str,
    file_ids: List[str],
    task_id: str
):
    """处理 Google Drive 文件导入的后台任务"""
    redis_connection = await redis.get_task_connection()
    
    try:
        for i, file_id in enumerate(file_ids):
            try:
                # 更新进度
                await redis_connection.hset(
                    f"task:{task_id}",
                    mapping={
                        "message": f"正在处理文件 {i+1}/{len(file_ids)}...",
                    }
                )
                
                # 获取文件元数据
                file_metadata = await service.get_file_metadata(username, file_id)
                
                # 下载文件
                file_content, filename = await service.download_file(username, file_id)
                
                # 创建 UploadFile 对象
                file_obj = UploadFile(
                    filename=filename,
                    file=BytesIO(file_content),
                    size=len(file_content)
                )
                
                # 保存到 MinIO
                minio_filename, minio_url = await save_file_to_minio(username, file_obj)
                
                # 生成文件ID
                layra_file_id = f"{username}_{uuid.uuid4()}"
                
                # 准备文件元数据
                file_meta = {
                    "file_id": layra_file_id,
                    "minio_filename": minio_filename,
                    "original_filename": filename,
                    "minio_url": minio_url,
                    "google_drive_file_id": file_id,
                }
                
                # 发送到 Kafka 进行处理
                await kafka_producer_manager.send_embedding_task(
                    task_id=task_id,
                    username=username,
                    knowledge_db_id=knowledge_base_id,
                    file_meta=file_meta,
                    priority=1,
                )
                
                # 更新处理进度
                await redis_connection.hincrby(f"task:{task_id}", "processed", 1)
                
                logger.info(f"Successfully processed Google Drive file {file_id} for task {task_id}")
                
            except Exception as e:
                logger.error(f"Failed to process Google Drive file {file_id} in task {task_id}: {str(e)}")
                # 继续处理下一个文件，不中断整个任务
                continue
        
        # 检查是否所有文件都处理完成
        current = int(await redis_connection.hget(f"task:{task_id}", "processed"))
        total = int(await redis_connection.hget(f"task:{task_id}", "total"))
        
        if current == total:
            await redis_connection.hset(
                f"task:{task_id}",
                mapping={
                    "status": "completed",
                    "message": "所有文件导入完成"
                }
            )
        else:
            await redis_connection.hset(
                f"task:{task_id}",
                mapping={
                    "status": "partial_success",
                    "message": f"部分文件导入完成 ({current}/{total})"
                }
            )
        
        logger.info(f"Google Drive import task {task_id} completed: {current}/{total} files processed")
        
    except Exception as e:
        logger.error(f"Google Drive import task {task_id} failed: {str(e)}")
        await redis_connection.hset(
            f"task:{task_id}",
            mapping={
                "status": "failed",
                "message": f"导入失败: {str(e)}"
            }
        )


@router.get("/import/status/{task_id}")
async def get_import_status(
    task_id: str,
    current_user: User = Depends(get_current_user),
):
    """获取导入任务状态"""
    try:
        # 验证任务归属
        if not task_id.startswith(current_user.username):
            raise HTTPException(status_code=403, detail="无权访问此任务")
        
        redis_connection = await redis.get_task_connection()
        task_data = await redis_connection.hgetall(f"task:{task_id}")
        
        if not task_data:
            raise HTTPException(status_code=404, detail="任务不存在")
        
        return {
            "task_id": task_id,
            "status": task_data.get("status", "unknown"),
            "total": int(task_data.get("total", 0)),
            "processed": int(task_data.get("processed", 0)),
            "message": task_data.get("message", ""),
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get import status for task {task_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="获取任务状态失败")