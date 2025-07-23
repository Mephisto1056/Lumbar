import React, { useState, useEffect } from 'react';
import { File, Folder, Download, Plus, Loader2, AlertCircle, RefreshCw } from 'lucide-react';

interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: number;
  modifiedTime: string;
  webViewLink?: string;
  thumbnailLink?: string;
  parents?: string[];
}

interface GoogleDriveFileBrowserProps {
  onFilesSelect: (files: GoogleDriveFile[]) => void;
  selectedFiles: GoogleDriveFile[];
  isImporting?: boolean;
}

const GoogleDriveFileBrowser: React.FC<GoogleDriveFileBrowserProps> = ({
  onFilesSelect,
  selectedFiles,
  isImporting = false,
}) => {
  const [files, setFiles] = useState<GoogleDriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  // 支持的文件类型
  const supportedTypes = new Set([
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/msword',
    'application/vnd.ms-excel',
    'application/vnd.ms-powerpoint',
    'text/plain',
    'image/jpeg',
    'image/png',
    'image/gif',
    'application/vnd.google-apps.document',
    'application/vnd.google-apps.spreadsheet',
    'application/vnd.google-apps.presentation',
  ]);

  // 获取文件图标
  const getFileIcon = (mimeType: string) => {
    if (mimeType.includes('folder')) {
      return <Folder className="w-5 h-5 text-blue-500" />;
    }
    return <File className="w-5 h-5 text-gray-500" />;
  };

  // 格式化文件大小
  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '-';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  };

  // 格式化修改时间
  const formatModifiedTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // 加载文件列表
  const loadFiles = async (folderId?: string, pageToken?: string, append = false) => {
    try {
      if (!append) {
        setLoading(true);
        setError(null);
      }

      const params = new URLSearchParams();
      if (folderId) params.append('folder_id', folderId);
      if (pageToken) params.append('page_token', pageToken);
      params.append('page_size', '50');

      const response = await fetch(`/api/v1/google-drive/files?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (!response.ok) {
        throw new Error('获取文件列表失败');
      }

      const data = await response.json();
      
      if (append) {
        setFiles(prev => [...prev, ...data.files]);
      } else {
        setFiles(data.files);
      }
      
      setNextPageToken(data.nextPageToken);
      setHasMore(!!data.nextPageToken);
      setLoading(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : '未知错误');
      setLoading(false);
    }
  };

  // 处理文件选择
  const handleFileSelect = (file: GoogleDriveFile) => {
    if (!supportedTypes.has(file.mimeType)) {
      return; // 不支持的文件类型
    }

    const isSelected = selectedFiles.some(f => f.id === file.id);
    if (isSelected) {
      onFilesSelect(selectedFiles.filter(f => f.id !== file.id));
    } else {
      onFilesSelect([...selectedFiles, file]);
    }
  };

  // 处理文件夹导航
  const handleFolderClick = (folderId: string) => {
    setCurrentFolder(folderId);
    loadFiles(folderId);
  };

  // 返回上级目录
  const goBack = () => {
    setCurrentFolder(null);
    loadFiles();
  };

  // 加载更多文件
  const loadMore = () => {
    if (nextPageToken && !loading) {
      loadFiles(currentFolder || undefined, nextPageToken, true);
    }
  };

  // 刷新文件列表
  const refresh = () => {
    loadFiles(currentFolder || undefined);
  };

  useEffect(() => {
    loadFiles();
  }, []);

  if (loading && files.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        <span className="text-gray-600">加载 Google Drive 文件...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <div className="flex items-start">
          <AlertCircle className="w-5 h-5 text-red-500 mr-2 mt-0.5 flex-shrink-0" />
          <div>
            <div className="text-sm text-red-700 font-medium">加载失败</div>
            <div className="text-sm text-red-600 mt-1">{error}</div>
            <button
              onClick={refresh}
              className="mt-2 text-sm text-red-600 hover:text-red-800 underline"
            >
              重试
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      {/* 头部工具栏 */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center space-x-2">
          {currentFolder && (
            <button
              onClick={goBack}
              className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded hover:bg-gray-50"
            >
              ← 返回
            </button>
          )}
          <h3 className="text-lg font-medium text-gray-900">
            {currentFolder ? '文件夹' : 'Google Drive'}
          </h3>
        </div>
        
        <div className="flex items-center space-x-2">
          {selectedFiles.length > 0 && (
            <span className="text-sm text-gray-600">
              已选择 {selectedFiles.length} 个文件
            </span>
          )}
          <button
            onClick={refresh}
            disabled={loading}
            className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 文件列表 */}
      <div className="max-h-96 overflow-y-auto">
        {files.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <Folder className="w-12 h-12 mx-auto mb-2 text-gray-300" />
            <p>此文件夹为空</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {files.map((file) => {
              const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
              const isSupported = supportedTypes.has(file.mimeType);
              const isSelected = selectedFiles.some(f => f.id === file.id);

              return (
                <div
                  key={file.id}
                  className={`flex items-center p-3 hover:bg-gray-50 cursor-pointer ${
                    isSelected ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                  } ${!isSupported && !isFolder ? 'opacity-50' : ''}`}
                  onClick={() => {
                    if (isFolder) {
                      handleFolderClick(file.id);
                    } else if (isSupported && !isImporting) {
                      handleFileSelect(file);
                    }
                  }}
                >
                  <div className="flex-shrink-0 mr-3">
                    {getFileIcon(file.mimeType)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {file.name}
                    </div>
                    <div className="text-xs text-gray-500 flex items-center space-x-2">
                      <span>{formatModifiedTime(file.modifiedTime)}</span>
                      {file.size && <span>• {formatFileSize(file.size)}</span>}
                      {!isSupported && !isFolder && (
                        <span className="text-red-500">• 不支持的文件类型</span>
                      )}
                    </div>
                  </div>

                  {isSelected && (
                    <div className="flex-shrink-0 ml-2">
                      <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                        <Plus className="w-3 h-3 text-white rotate-45" />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* 加载更多按钮 */}
        {hasMore && (
          <div className="p-4 border-t border-gray-100">
            <button
              onClick={loadMore}
              disabled={loading}
              className="w-full py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                  加载中...
                </>
              ) : (
                '加载更多'
              )}
            </button>
          </div>
        )}
      </div>

      {/* 底部信息 */}
      {selectedFiles.length > 0 && (
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <div className="text-sm text-gray-600">
            <strong>{selectedFiles.length}</strong> 个文件已选择，准备导入到知识库
          </div>
        </div>
      )}
    </div>
  );
};

export default GoogleDriveFileBrowser;