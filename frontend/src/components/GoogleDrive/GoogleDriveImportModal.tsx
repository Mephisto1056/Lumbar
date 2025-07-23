import React, { useState } from 'react';
import { X, Upload, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import GoogleDriveConnector from './GoogleDriveConnector';
import GoogleDriveFileBrowser from './GoogleDriveFileBrowser';

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

interface GoogleDriveImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  knowledgeBaseId: string;
  knowledgeBaseName: string;
  onImportSuccess?: () => void;
}

interface ImportStatus {
  status: 'idle' | 'importing' | 'success' | 'error';
  message: string;
  taskId?: string;
  progress?: {
    total: number;
    processed: number;
  };
}

const GoogleDriveImportModal: React.FC<GoogleDriveImportModalProps> = ({
  isOpen,
  onClose,
  knowledgeBaseId,
  knowledgeBaseName,
  onImportSuccess,
}) => {
  const [selectedFiles, setSelectedFiles] = useState<GoogleDriveFile[]>([]);
  const [importStatus, setImportStatus] = useState<ImportStatus>({
    status: 'idle',
    message: '',
  });
  const [isAuthorized, setIsAuthorized] = useState(false);

  // 开始导入
  const startImport = async () => {
    if (selectedFiles.length === 0) return;

    try {
      setImportStatus({
        status: 'importing',
        message: '正在开始导入...',
      });

      const response = await fetch('/api/v1/google-drive/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          knowledge_base_id: knowledgeBaseId,
          file_ids: selectedFiles.map(f => f.id),
        }),
      });

      if (!response.ok) {
        throw new Error('导入请求失败');
      }

      const data = await response.json();
      
      setImportStatus({
        status: 'importing',
        message: '文件导入中，请稍候...',
        taskId: data.task_id,
        progress: {
          total: data.total_files,
          processed: 0,
        },
      });

      // 开始轮询任务状态
      pollImportStatus(data.task_id);

    } catch (error) {
      setImportStatus({
        status: 'error',
        message: error instanceof Error ? error.message : '导入失败',
      });
    }
  };

  // 轮询导入状态
  const pollImportStatus = async (taskId: string) => {
    const poll = async () => {
      try {
        const response = await fetch(`/api/v1/google-drive/import/status/${taskId}`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
          },
        });

        if (!response.ok) {
          throw new Error('获取导入状态失败');
        }

        const data = await response.json();
        
        setImportStatus(prev => ({
          ...prev,
          message: data.message,
          progress: {
            total: data.total,
            processed: data.processed,
          },
        }));

        if (data.status === 'completed') {
          setImportStatus({
            status: 'success',
            message: '所有文件导入完成！',
            progress: {
              total: data.total,
              processed: data.processed,
            },
          });
          onImportSuccess?.();
        } else if (data.status === 'failed') {
          setImportStatus({
            status: 'error',
            message: data.message || '导入失败',
          });
        } else if (data.status === 'partial_success') {
          setImportStatus({
            status: 'success',
            message: `部分文件导入完成 (${data.processed}/${data.total})`,
            progress: {
              total: data.total,
              processed: data.processed,
            },
          });
          onImportSuccess?.();
        } else {
          // 继续轮询
          setTimeout(poll, 2000);
        }
      } catch (error) {
        setImportStatus({
          status: 'error',
          message: '获取导入状态失败',
        });
      }
    };

    poll();
  };

  // 重置状态
  const resetState = () => {
    setSelectedFiles([]);
    setImportStatus({
      status: 'idle',
      message: '',
    });
  };

  // 关闭模态框
  const handleClose = () => {
    if (importStatus.status !== 'importing') {
      resetState();
      onClose();
    }
  };

  // 处理授权成功
  const handleAuthSuccess = () => {
    setIsAuthorized(true);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              从 Google Drive 导入文件
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              导入到知识库: {knowledgeBaseName}
            </p>
          </div>
          <button
            onClick={handleClose}
            disabled={importStatus.status === 'importing'}
            className="p-2 text-gray-400 hover:text-gray-600 disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 内容区域 */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          {/* 导入状态显示 */}
          {importStatus.status !== 'idle' && (
            <div className="mb-6">
              {importStatus.status === 'importing' && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center">
                    <Loader2 className="w-5 h-5 text-blue-500 animate-spin mr-3" />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-blue-900">
                        正在导入文件...
                      </div>
                      <div className="text-sm text-blue-700 mt-1">
                        {importStatus.message}
                      </div>
                      {importStatus.progress && (
                        <div className="mt-2">
                          <div className="flex justify-between text-xs text-blue-600 mb-1">
                            <span>进度</span>
                            <span>
                              {importStatus.progress.processed} / {importStatus.progress.total}
                            </span>
                          </div>
                          <div className="w-full bg-blue-200 rounded-full h-2">
                            <div
                              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                              style={{
                                width: `${(importStatus.progress.processed / importStatus.progress.total) * 100}%`,
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {importStatus.status === 'success' && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center">
                    <CheckCircle className="w-5 h-5 text-green-500 mr-3" />
                    <div>
                      <div className="text-sm font-medium text-green-900">
                        导入成功！
                      </div>
                      <div className="text-sm text-green-700 mt-1">
                        {importStatus.message}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {importStatus.status === 'error' && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <div className="flex items-center">
                    <AlertCircle className="w-5 h-5 text-red-500 mr-3" />
                    <div>
                      <div className="text-sm font-medium text-red-900">
                        导入失败
                      </div>
                      <div className="text-sm text-red-700 mt-1">
                        {importStatus.message}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Google Drive 连接器 */}
          {!isAuthorized && (
            <div className="mb-6">
              <GoogleDriveConnector
                onAuthSuccess={handleAuthSuccess}
                onAuthError={(error) => {
                  setImportStatus({
                    status: 'error',
                    message: `授权失败: ${error}`,
                  });
                }}
              />
            </div>
          )}

          {/* 文件浏览器 */}
          {isAuthorized && importStatus.status === 'idle' && (
            <GoogleDriveFileBrowser
              onFilesSelect={setSelectedFiles}
              selectedFiles={selectedFiles}
              isImporting={importStatus.status === 'importing'}
            />
          )}
        </div>

        {/* 底部操作栏 */}
        {isAuthorized && importStatus.status === 'idle' && (
          <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
            <div className="text-sm text-gray-600">
              {selectedFiles.length > 0 ? (
                <>已选择 <strong>{selectedFiles.length}</strong> 个文件</>
              ) : (
                '请选择要导入的文件'
              )}
            </div>
            
            <div className="flex space-x-3">
              <button
                onClick={handleClose}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100"
              >
                取消
              </button>
              <button
                onClick={startImport}
                disabled={selectedFiles.length === 0}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
              >
                <Upload className="w-4 h-4 mr-2" />
                开始导入
              </button>
            </div>
          </div>
        )}

        {/* 导入完成后的操作栏 */}
        {(importStatus.status === 'success' || importStatus.status === 'error') && (
          <div className="flex items-center justify-end p-6 border-t border-gray-200 bg-gray-50">
            <div className="flex space-x-3">
              {importStatus.status === 'error' && (
                <button
                  onClick={() => setImportStatus({ status: 'idle', message: '' })}
                  className="px-4 py-2 text-blue-600 border border-blue-300 rounded-lg hover:bg-blue-50"
                >
                  重试
                </button>
              )}
              <button
                onClick={handleClose}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
              >
                关闭
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GoogleDriveImportModal;