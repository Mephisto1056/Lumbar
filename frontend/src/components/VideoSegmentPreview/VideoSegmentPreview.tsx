import React, { useState } from 'react';
import { Play, Clock, Film } from 'lucide-react';
import MediaPreview from '@/components/MediaPreview/MediaPreview';
import { createPortal } from 'react-dom';

interface VideoSegmentPreviewProps {
  videoUrl: string;
  thumbnailUrl?: string;
  filename: string;
  startTime: number;
  endTime: number;
  score?: number;
  className?: string;
  onSegmentClick?: (startTime: number, endTime: number) => void;
}

const VideoSegmentPreview: React.FC<VideoSegmentPreviewProps> = ({
  videoUrl,
  thumbnailUrl,
  filename,
  startTime,
  endTime,
  score,
  className = '',
  onSegmentClick
}) => {
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);
  const [playerStartTime, setPlayerStartTime] = useState(startTime);

  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const handleSegmentClick = () => {
    setPlayerStartTime(startTime);
    setIsPlayerOpen(true);
    onSegmentClick?.(startTime, endTime);
  };

  const handleClosePlayer = () => {
    setIsPlayerOpen(false);
  };

  const duration = endTime - startTime;

  return (
    <>
      {/* 视频片段预览卡片 */}
      <div 
        className={`
          flex items-center gap-3 p-3 bg-gradient-to-r from-blue-50 to-indigo-50 
          border-2 border-blue-200 rounded-lg cursor-pointer transition-all duration-200
          hover:from-blue-100 hover:to-indigo-100 hover:border-blue-300 hover:shadow-md
          ${className}
        `}
        onClick={handleSegmentClick}
      >
        {/* 缩略图区域 */}
        <div className="relative flex-shrink-0">
          {thumbnailUrl ? (
            <div className="relative w-16 h-12 rounded overflow-hidden bg-gray-200">
              <img 
                src={thumbnailUrl} 
                alt="Video thumbnail"
                className="w-full h-full object-cover"
              />
              {/* 播放按钮覆盖层 */}
              <div className="absolute inset-0 bg-black bg-opacity-30 flex items-center justify-center">
                <Play className="w-6 h-6 text-white" fill="white" />
              </div>
            </div>
          ) : (
            <div className="w-16 h-12 bg-gray-300 rounded flex items-center justify-center">
              <Film className="w-6 h-6 text-gray-500" />
            </div>
          )}
        </div>

        {/* 时间信息和元数据 */}
        <div className="flex-grow min-w-0">
          {/* 时间范围 */}
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-blue-600" />
            <span className="font-mono text-sm font-semibold text-blue-800">
              {formatTime(startTime)} - {formatTime(endTime)}
            </span>
            <span className="text-xs text-gray-500">
              ({duration.toFixed(1)}s)
            </span>
          </div>

          {/* 文件名 */}
          <div className="text-xs text-gray-600 truncate">
            🎬 {filename}
          </div>

          {/* 分数显示 */}
          {score && (
            <div className="flex items-center gap-1 mt-1">
              <span className="text-xs text-yellow-600">⭐</span>
              <span className="text-xs text-gray-500">
                Score: {score.toFixed(3)}
              </span>
            </div>
          )}
        </div>

        {/* 播放指示器 */}
        <div className="flex-shrink-0">
          <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white hover:bg-blue-600 transition-colors">
            <Play className="w-4 h-4" fill="white" />
          </div>
        </div>
      </div>

      {/* 视频播放器模态窗口 */}
      {isPlayerOpen && createPortal(
        <div 
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50"
          onClick={handleClosePlayer}
        >
          <div 
            className="relative max-w-4xl max-h-[90vh] w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 关闭按钮 */}
            <button
              onClick={handleClosePlayer}
              className="absolute -top-10 right-0 text-white hover:text-gray-300 text-xl font-bold z-10"
            >
              ✕ 关闭
            </button>
            
            {/* 视频播放器 */}
            <div className="bg-white rounded-lg overflow-hidden">
              <MediaPreview
                url={videoUrl}
                filename={filename}
                mediaType="video"
                autoPlay={true}
                controls={true}
                showTimestamp={true}
                startTime={playerStartTime}
                className="w-full"
                onTimeUpdate={(currentTime, duration) => {
                  // 可以在这里添加时间更新逻辑，比如高亮当前片段
                }}
              />
              
              {/* 片段信息栏 */}
              <div className="p-4 bg-gray-50 border-t">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-gray-700">
                      召回片段: {formatTime(startTime)} - {formatTime(endTime)}
                    </span>
                    <span className="ml-2 text-xs text-gray-500">
                      (时长: {duration.toFixed(1)}s)
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      // 跳转到片段开始时间的逻辑
                      const videoElement = document.querySelector('video') as HTMLVideoElement;
                      if (videoElement) {
                        videoElement.currentTime = startTime;
                      }
                    }}
                    className="px-3 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 transition-colors"
                  >
                    跳转到片段开始
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default VideoSegmentPreview;