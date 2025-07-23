import uuid
import asyncio
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from io import BytesIO

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

from app.core.config import settings
from app.core.logging import logger
from app.models.google_drive import (
    GoogleDriveAuth,
    GoogleDriveFile,
    GoogleDriveImportRecord,
    GoogleDriveAuthUrl,
    GoogleDriveFileList,
)
from app.db.mongo import MongoDB


class GoogleDriveService:
    """Google Drive 服务类"""
    
    SCOPES = [
        'https://www.googleapis.com/auth/drive.readonly',
        'https://www.googleapis.com/auth/drive.metadata.readonly'
    ]
    
    # 支持的文件类型映射
    SUPPORTED_MIME_TYPES = {
        'application/pdf': 'pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
        'application/msword': 'doc',
        'application/vnd.ms-excel': 'xls',
        'application/vnd.ms-powerpoint': 'ppt',
        'text/plain': 'txt',
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/gif': 'gif',
        # Google Workspace 文件类型
        'application/vnd.google-apps.document': 'gdoc',
        'application/vnd.google-apps.spreadsheet': 'gsheet',
        'application/vnd.google-apps.presentation': 'gslides',
    }
    
    # Google Workspace 文件导出格式
    EXPORT_FORMATS = {
        'application/vnd.google-apps.document': 'application/pdf',
        'application/vnd.google-apps.spreadsheet': 'application/pdf',
        'application/vnd.google-apps.presentation': 'application/pdf',
    }

    def __init__(self, db: MongoDB):
        self.db = db

    async def get_auth_url(self, user_id: str) -> GoogleDriveAuthUrl:
        """获取 Google Drive 授权 URL"""
        try:
            # 创建 OAuth 流程
            flow = Flow.from_client_config(
                {
                    "web": {
                        "client_id": settings.google_client_id,
                        "client_secret": settings.google_client_secret,
                        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                        "token_uri": "https://oauth2.googleapis.com/token",
                        "redirect_uris": [settings.google_redirect_uri]
                    }
                },
                scopes=self.SCOPES
            )
            flow.redirect_uri = settings.google_redirect_uri
            
            # 生成状态参数
            state = f"{user_id}_{uuid.uuid4()}"
            
            # 获取授权 URL
            auth_url, _ = flow.authorization_url(
                access_type='offline',
                include_granted_scopes='true',
                state=state,
                prompt='consent'  # 强制显示同意屏幕以获取 refresh_token
            )
            
            logger.info(f"Generated Google Drive auth URL for user {user_id}")
            return GoogleDriveAuthUrl(auth_url=auth_url, state=state)
            
        except Exception as e:
            logger.error(f"Failed to generate auth URL for user {user_id}: {str(e)}")
            raise

    async def handle_callback(self, code: str, state: str) -> Dict[str, Any]:
        """处理 Google Drive OAuth 回调"""
        try:
            # 解析状态参数获取用户ID
            user_id = state.split('_')[0]
            
            # 创建 OAuth 流程
            flow = Flow.from_client_config(
                {
                    "web": {
                        "client_id": settings.google_client_id,
                        "client_secret": settings.google_client_secret,
                        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                        "token_uri": "https://oauth2.googleapis.com/token",
                        "redirect_uris": [settings.google_redirect_uri]
                    }
                },
                scopes=self.SCOPES,
                state=state
            )
            flow.redirect_uri = settings.google_redirect_uri
            
            # 获取访问令牌
            flow.fetch_token(code=code)
            credentials = flow.credentials
            
            # 保存授权信息到数据库
            auth_data = GoogleDriveAuth(
                user_id=user_id,
                access_token=credentials.token,
                refresh_token=credentials.refresh_token,
                expires_at=credentials.expiry,
                scope=' '.join(self.SCOPES)
            )
            
            await self.db.save_google_drive_auth(auth_data.model_dump())
            
            logger.info(f"Successfully saved Google Drive auth for user {user_id}")
            return {"status": "success", "message": "Google Drive 授权成功"}
            
        except Exception as e:
            logger.error(f"Failed to handle Google Drive callback: {str(e)}")
            raise

    async def _get_credentials(self, user_id: str) -> Optional[Credentials]:
        """获取用户的 Google Drive 凭据"""
        try:
            auth_data = await self.db.get_google_drive_auth(user_id)
            if not auth_data:
                return None
            
            credentials = Credentials(
                token=auth_data['access_token'],
                refresh_token=auth_data['refresh_token'],
                token_uri="https://oauth2.googleapis.com/token",
                client_id=settings.google_client_id,
                client_secret=settings.google_client_secret,
                scopes=self.SCOPES
            )
            
            # 检查并刷新令牌
            if credentials.expired and credentials.refresh_token:
                credentials.refresh(Request())
                
                # 更新数据库中的令牌
                await self.db.update_google_drive_auth(
                    user_id,
                    {
                        'access_token': credentials.token,
                        'expires_at': credentials.expiry
                    }
                )
            
            return credentials
            
        except Exception as e:
            logger.error(f"Failed to get credentials for user {user_id}: {str(e)}")
            return None

    async def list_files(
        self, 
        user_id: str, 
        folder_id: Optional[str] = None,
        page_token: Optional[str] = None,
        page_size: int = 50
    ) -> GoogleDriveFileList:
        """列出 Google Drive 文件"""
        try:
            credentials = await self._get_credentials(user_id)
            if not credentials:
                raise ValueError("用户未授权 Google Drive")
            
            # 在线程池中执行同步操作
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                None,
                self._list_files_sync,
                credentials,
                folder_id,
                page_token,
                page_size
            )
            
            return result
            
        except Exception as e:
            logger.error(f"Failed to list files for user {user_id}: {str(e)}")
            raise

    def _list_files_sync(
        self,
        credentials: Credentials,
        folder_id: Optional[str],
        page_token: Optional[str],
        page_size: int
    ) -> GoogleDriveFileList:
        """同步方式列出文件"""
        service = build('drive', 'v3', credentials=credentials)
        
        # 构建查询条件
        query_parts = []
        
        # 只显示支持的文件类型
        mime_types = list(self.SUPPORTED_MIME_TYPES.keys())
        mime_query = ' or '.join([f"mimeType='{mt}'" for mt in mime_types])
        query_parts.append(f"({mime_query})")
        
        # 排除回收站文件
        query_parts.append("trashed=false")
        
        # 如果指定了文件夹
        if folder_id:
            query_parts.append(f"'{folder_id}' in parents")
        
        query = ' and '.join(query_parts)
        
        # 调用 API
        results = service.files().list(
            q=query,
            pageSize=page_size,
            pageToken=page_token,
            fields="nextPageToken, files(id, name, mimeType, size, modifiedTime, webViewLink, thumbnailLink, parents)"
        ).execute()
        
        files = results.get('files', [])
        next_page_token = results.get('nextPageToken')
        
        # 转换为模型
        drive_files = [
            GoogleDriveFile(
                id=file['id'],
                name=file['name'],
                mimeType=file['mimeType'],
                size=int(file.get('size', 0)) if file.get('size') else None,
                modifiedTime=file['modifiedTime'],
                webViewLink=file.get('webViewLink'),
                thumbnailLink=file.get('thumbnailLink'),
                parents=file.get('parents', [])
            )
            for file in files
        ]
        
        return GoogleDriveFileList(
            files=drive_files,
            nextPageToken=next_page_token
        )

    async def download_file(self, user_id: str, file_id: str) -> tuple[bytes, str]:
        """下载 Google Drive 文件"""
        try:
            credentials = await self._get_credentials(user_id)
            if not credentials:
                raise ValueError("用户未授权 Google Drive")
            
            # 在线程池中执行同步操作
            loop = asyncio.get_event_loop()
            file_content, filename = await loop.run_in_executor(
                None,
                self._download_file_sync,
                credentials,
                file_id
            )
            
            return file_content, filename
            
        except Exception as e:
            logger.error(f"Failed to download file {file_id} for user {user_id}: {str(e)}")
            raise

    def _download_file_sync(self, credentials: Credentials, file_id: str) -> tuple[bytes, str]:
        """同步方式下载文件"""
        service = build('drive', 'v3', credentials=credentials)
        
        # 获取文件元数据
        file_metadata = service.files().get(fileId=file_id).execute()
        filename = file_metadata['name']
        mime_type = file_metadata['mimeType']
        
        # 检查是否需要导出（Google Workspace 文件）
        if mime_type in self.EXPORT_FORMATS:
            # 导出为 PDF
            request = service.files().export_media(
                fileId=file_id,
                mimeType=self.EXPORT_FORMATS[mime_type]
            )
            filename = f"{filename}.pdf"
        else:
            # 直接下载
            request = service.files().get_media(fileId=file_id)
        
        # 下载文件
        file_io = BytesIO()
        downloader = MediaIoBaseDownload(file_io, request)
        
        done = False
        while done is False:
            status, done = downloader.next_chunk()
        
        file_content = file_io.getvalue()
        file_io.close()
        
        return file_content, filename

    async def get_file_metadata(self, user_id: str, file_id: str) -> GoogleDriveFile:
        """获取文件元数据"""
        try:
            credentials = await self._get_credentials(user_id)
            if not credentials:
                raise ValueError("用户未授权 Google Drive")
            
            # 在线程池中执行同步操作
            loop = asyncio.get_event_loop()
            metadata = await loop.run_in_executor(
                None,
                self._get_file_metadata_sync,
                credentials,
                file_id
            )
            
            return metadata
            
        except Exception as e:
            logger.error(f"Failed to get metadata for file {file_id} for user {user_id}: {str(e)}")
            raise

    def _get_file_metadata_sync(self, credentials: Credentials, file_id: str) -> GoogleDriveFile:
        """同步方式获取文件元数据"""
        service = build('drive', 'v3', credentials=credentials)
        
        file_metadata = service.files().get(
            fileId=file_id,
            fields="id, name, mimeType, size, modifiedTime, webViewLink, thumbnailLink, parents"
        ).execute()
        
        return GoogleDriveFile(
            id=file_metadata['id'],
            name=file_metadata['name'],
            mimeType=file_metadata['mimeType'],
            size=int(file_metadata.get('size', 0)) if file_metadata.get('size') else None,
            modifiedTime=file_metadata['modifiedTime'],
            webViewLink=file_metadata.get('webViewLink'),
            thumbnailLink=file_metadata.get('thumbnailLink'),
            parents=file_metadata.get('parents', [])
        )

    async def check_auth_status(self, user_id: str) -> bool:
        """检查用户是否已授权 Google Drive"""
        try:
            credentials = await self._get_credentials(user_id)
            return credentials is not None
        except Exception:
            return False