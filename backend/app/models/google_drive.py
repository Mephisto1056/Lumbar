from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime


class GoogleDriveAuth(BaseModel):
    """Google Drive 授权信息"""
    user_id: str
    access_token: str
    refresh_token: str
    expires_at: datetime
    scope: str


class GoogleDriveFile(BaseModel):
    """Google Drive 文件信息"""
    id: str
    name: str
    mimeType: str
    size: Optional[int] = None
    modifiedTime: str
    webViewLink: Optional[str] = None
    thumbnailLink: Optional[str] = None
    parents: Optional[List[str]] = None


class GoogleDriveImportRequest(BaseModel):
    """Google Drive 文件导入请求"""
    knowledge_base_id: str
    file_ids: List[str]


class GoogleDriveImportRecord(BaseModel):
    """Google Drive 导入记录"""
    import_id: str
    user_id: str
    knowledge_base_id: str
    google_file_id: str
    google_file_name: str
    status: str  # pending, processing, completed, failed
    error_message: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None


class GoogleDriveAuthUrl(BaseModel):
    """Google Drive 授权URL响应"""
    auth_url: str
    state: str


class GoogleDriveCallback(BaseModel):
    """Google Drive 回调请求"""
    code: str
    state: str


class GoogleDriveFileList(BaseModel):
    """Google Drive 文件列表响应"""
    files: List[GoogleDriveFile]
    nextPageToken: Optional[str] = None