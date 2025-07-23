import React, { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle, ExternalLink, Loader2 } from 'lucide-react';

interface GoogleDriveConnectorProps {
  onAuthSuccess?: () => void;
  onAuthError?: (error: string) => void;
}

interface AuthStatus {
  authorized: boolean;
  loading: boolean;
  error: string | null;
}

const GoogleDriveConnector: React.FC<GoogleDriveConnectorProps> = ({
  onAuthSuccess,
  onAuthError,
}) => {
  const [authStatus, setAuthStatus] = useState<AuthStatus>({
    authorized: false,
    loading: true,
    error: null,
  });
  const [isConnecting, setIsConnecting] = useState(false);

  // 检查授权状态
  const checkAuthStatus = async () => {
    try {
      setAuthStatus(prev => ({ ...prev, loading: true, error: null }));
      
      const response = await fetch('/api/v1/google-drive/auth/google/status', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (!response.ok) {
        throw new Error('检查授权状态失败');
      }

      const data = await response.json();
      setAuthStatus({
        authorized: data.authorized,
        loading: false,
        error: null,
      });
    } catch (error) {
      setAuthStatus({
        authorized: false,
        loading: false,
        error: error instanceof Error ? error.message : '未知错误',
      });
    }
  };

  // 开始授权流程
  const startAuth = async () => {
    try {
      setIsConnecting(true);
      
      const response = await fetch('/api/v1/google-drive/auth/google', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (!response.ok) {
        throw new Error('获取授权链接失败');
      }

      const data = await response.json();
      
      // 打开授权窗口
      const authWindow = window.open(
        data.auth_url,
        'google-auth',
        'width=500,height=600,scrollbars=yes,resizable=yes'
      );

      // 监听授权完成
      const checkClosed = setInterval(() => {
        if (authWindow?.closed) {
          clearInterval(checkClosed);
          setIsConnecting(false);
          // 重新检查授权状态
          setTimeout(checkAuthStatus, 1000);
        }
      }, 1000);

      // 监听来自授权窗口的消息
      const handleMessage = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        
        if (event.data.type === 'GOOGLE_AUTH_SUCCESS') {
          clearInterval(checkClosed);
          authWindow?.close();
          setIsConnecting(false);
          setAuthStatus(prev => ({ ...prev, authorized: true }));
          onAuthSuccess?.();
        } else if (event.data.type === 'GOOGLE_AUTH_ERROR') {
          clearInterval(checkClosed);
          authWindow?.close();
          setIsConnecting(false);
          const errorMsg = event.data.error || '授权失败';
          setAuthStatus(prev => ({ ...prev, error: errorMsg }));
          onAuthError?.(errorMsg);
        }
      };

      window.addEventListener('message', handleMessage);
      
      // 清理事件监听器
      setTimeout(() => {
        window.removeEventListener('message', handleMessage);
      }, 300000); // 5分钟后清理

    } catch (error) {
      setIsConnecting(false);
      const errorMsg = error instanceof Error ? error.message : '授权失败';
      setAuthStatus(prev => ({ ...prev, error: errorMsg }));
      onAuthError?.(errorMsg);
    }
  };

  // 撤销授权
  const revokeAuth = async () => {
    try {
      const response = await fetch('/api/v1/google-drive/auth/google', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (!response.ok) {
        throw new Error('撤销授权失败');
      }

      setAuthStatus(prev => ({ ...prev, authorized: false }));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '撤销授权失败';
      setAuthStatus(prev => ({ ...prev, error: errorMsg }));
    }
  };

  useEffect(() => {
    checkAuthStatus();
  }, []);

  if (authStatus.loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        <span className="text-gray-600">检查 Google Drive 授权状态...</span>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center mb-4">
        <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center mr-3">
          <svg className="w-5 h-5 text-blue-600" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6.28 3l5.24 9.07L15.76 3h2.88l-7.12 12.35L4.4 3h1.88zm7.44 18L9.48 12.93 15.76 21H12.88l-4.24-7.35L4.4 21H1.52l7.12-12.35L13.72 21z"/>
          </svg>
        </div>
        <div>
          <h3 className="text-lg font-medium text-gray-900">Google Drive</h3>
          <p className="text-sm text-gray-500">连接您的 Google Drive 以导入文件</p>
        </div>
      </div>

      {authStatus.error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start">
          <AlertCircle className="w-5 h-5 text-red-500 mr-2 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-red-700">{authStatus.error}</div>
        </div>
      )}

      {authStatus.authorized ? (
        <div className="space-y-4">
          <div className="flex items-center p-3 bg-green-50 border border-green-200 rounded-lg">
            <CheckCircle className="w-5 h-5 text-green-500 mr-2" />
            <span className="text-sm text-green-700 font-medium">已连接到 Google Drive</span>
          </div>
          
          <div className="flex space-x-3">
            <button
              onClick={revokeAuth}
              className="px-4 py-2 text-sm text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition-colors"
            >
              断开连接
            </button>
            <button
              onClick={checkAuthStatus}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              刷新状态
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            连接 Google Drive 后，您可以直接从云端导入文件到知识库中。
          </p>
          
          <button
            onClick={startAuth}
            disabled={isConnecting}
            className="w-full flex items-center justify-center px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isConnecting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                连接中...
              </>
            ) : (
              <>
                <ExternalLink className="w-4 h-4 mr-2" />
                连接 Google Drive
              </>
            )}
          </button>
          
          <p className="text-xs text-gray-500">
            点击连接后将打开 Google 授权页面，请按照提示完成授权。
          </p>
        </div>
      )}
    </div>
  );
};

export default GoogleDriveConnector;