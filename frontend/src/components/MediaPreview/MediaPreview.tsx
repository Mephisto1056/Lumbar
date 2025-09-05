import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, SkipBack, SkipForward } from 'lucide-react';
import { formatDuration, getMediaType } from '@/utils/file';

interface MediaPreviewProps {
  url: string;
  filename: string;
  mediaType?: 'audio' | 'video';
  className?: string;
  autoPlay?: boolean;
  controls?: boolean;
  showTimestamp?: boolean;
  startTime?: number; // 新增：指定开始播放时间
  onTimeUpdate?: (currentTime: number, duration: number) => void;
}

const MediaPreview: React.FC<MediaPreviewProps> = ({
  url,
  filename,
  mediaType,
  className = '',
  autoPlay = false,
  controls = true,
  showTimestamp = true,
  startTime = 0,
  onTimeUpdate
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const mediaRef = useRef<HTMLAudioElement | HTMLVideoElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  
  // 自动检测媒体类型
  const detectedMediaType = mediaType || getMediaType(filename);
  
  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;
    
    const handleLoadedMetadata = () => {
      setDuration(media.duration);
      setIsLoading(false);
      // 设置开始时间
      if (startTime > 0 && startTime < media.duration) {
        media.currentTime = startTime;
        setCurrentTime(startTime);
      }
    };
    
    const handleTimeUpdate = () => {
      setCurrentTime(media.currentTime);
      onTimeUpdate?.(media.currentTime, media.duration);
    };
    
    const handleError = () => {
      setError('Failed to load media file');
      setIsLoading(false);
    };
    
    const handleLoadStart = () => {
      setIsLoading(true);
      setError(null);
    };
    
    media.addEventListener('loadedmetadata', handleLoadedMetadata);
    media.addEventListener('timeupdate', handleTimeUpdate);
    media.addEventListener('error', handleError);
    media.addEventListener('loadstart', handleLoadStart);
    
    return () => {
      media.removeEventListener('loadedmetadata', handleLoadedMetadata);
      media.removeEventListener('timeupdate', handleTimeUpdate);
      media.removeEventListener('error', handleError);
      media.removeEventListener('loadstart', handleLoadStart);
    };
  }, [url, startTime, onTimeUpdate]);
  
  const togglePlayPause = () => {
    const media = mediaRef.current;
    if (!media) return;
    
    if (isPlaying) {
      media.pause();
    } else {
      media.play();
    }
    setIsPlaying(!isPlaying);
  };
  
  const toggleMute = () => {
    const media = mediaRef.current;
    if (!media) return;
    
    media.muted = !isMuted;
    setIsMuted(!isMuted);
  };
  
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    const media = mediaRef.current;
    if (!media) return;
    
    media.volume = newVolume;
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
  };
  
  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const media = mediaRef.current;
    const progressBar = progressBarRef.current;
    if (!media || !progressBar) return;
    
    const rect = progressBar.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const newTime = percentage * duration;
    
    media.currentTime = newTime;
    setCurrentTime(newTime);
  };
  
  const skipTime = (seconds: number) => {
    const media = mediaRef.current;
    if (!media) return;
    
    const newTime = Math.max(0, Math.min(duration, currentTime + seconds));
    media.currentTime = newTime;
    setCurrentTime(newTime);
  };
  
  if (error) {
    return (
      <div className={`flex items-center justify-center p-4 bg-red-50 border border-red-200 rounded-lg ${className}`}>
        <div className="text-center">
          <div className="text-red-500 mb-2">❌</div>
          <p className="text-red-600 text-sm">{error}</p>
          <p className="text-gray-500 text-xs mt-1">{filename}</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className={`bg-white border border-gray-200 rounded-lg overflow-hidden ${className}`}>
      {/* 媒体元素 */}
      {detectedMediaType === 'audio' ? (
        <audio
          ref={mediaRef as React.RefObject<HTMLAudioElement>}
          src={url}
          autoPlay={autoPlay}
          style={{ display: 'none' }}
        />
      ) : (
        <video
          ref={mediaRef as React.RefObject<HTMLVideoElement>}
          src={url}
          autoPlay={autoPlay}
          className="w-full h-auto max-h-96"
          style={{ backgroundColor: '#000' }}
        />
      )}
      
      {/* 音频可视化区域 */}
      {detectedMediaType === 'audio' && (
        <div className="flex items-center justify-center p-8 bg-gradient-to-r from-indigo-50 to-purple-50">
          <div className="text-center">
            <div className="text-4xl mb-2">🎵</div>
            <p className="font-medium text-gray-800">{filename}</p>
            {duration > 0 && (
              <p className="text-gray-500 text-sm mt-1">
                {formatDuration(duration)}
              </p>
            )}
          </div>
        </div>
      )}
      
      {/* 控制栏 */}
      {controls && (
        <div className="p-4 bg-gray-50 border-t border-gray-200">
          {/* 进度条 */}
          {showTimestamp && duration > 0 && (
            <div className="mb-3">
              <div
                ref={progressBarRef}
                className="w-full h-2 bg-gray-200 rounded-full cursor-pointer"
                onClick={handleProgressClick}
              >
                <div
                  className="h-full bg-indigo-500 rounded-full transition-all duration-150"
                  style={{ width: `${(currentTime / duration) * 100}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>{formatDuration(currentTime)}</span>
                <span>{formatDuration(duration)}</span>
              </div>
            </div>
          )}
          
          {/* 控制按钮 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              {/* 后退按钮 */}
              <button
                onClick={() => skipTime(-10)}
                className="p-2 text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors"
                title="Backward 10s"
              >
                <SkipBack className="w-4 h-4" />
              </button>
              
              {/* 播放/暂停按钮 */}
              <button
                onClick={togglePlayPause}
                disabled={isLoading}
                className="p-3 text-white bg-indigo-500 hover:bg-indigo-600 disabled:bg-gray-400 rounded-full transition-colors"
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : isPlaying ? (
                  <Pause className="w-5 h-5" />
                ) : (
                  <Play className="w-5 h-5 ml-0.5" />
                )}
              </button>
              
              {/* 前进按钮 */}
              <button
                onClick={() => skipTime(10)}
                className="p-2 text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors"
                title="Forward 10s"
              >
                <SkipForward className="w-4 h-4" />
              </button>
            </div>
            
            {/* 音量控制 */}
            <div className="flex items-center space-x-2">
              <button
                onClick={toggleMute}
                className="p-2 text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors"
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-4 h-4" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </button>
              
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-20 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                title="Volume"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MediaPreview;