// components/ChatMessage.tsx
"use client";
import React, { Dispatch, useState } from "react";
import { BaseUsed, Message, ModelConfig } from "@/types/types";
import Image from "next/image";
import { useAuthStore } from "@/stores/authStore";
import LoadingCircle from "./LoadingCircle";
import { getFileIcon } from "@/utils/file";
import MarkdownDisplay from "./MarkdownDisplay";
import dynamic from 'next/dynamic';
import { createPortal } from "react-dom";

// 使用动态导入确保组件被包含在构建中
const VideoSegmentPreview = dynamic(
  () => import('@/components/VideoSegmentPreview/VideoSegmentPreview'),
  {
    ssr: false,
    loading: () => <div className="p-4 text-gray-500">加载中...</div>
  }
);

interface ChatMessageProps {
  modelConfig: ModelConfig | undefined;
  message: Message;
  showRefFile: string[];
  setShowRefFile: Dispatch<React.SetStateAction<string[]>>;
  shouldShowViewReferencesButton?: boolean;
}

const ChatMessage: React.FC<ChatMessageProps> = ({
  modelConfig,
  message,
  showRefFile,
  setShowRefFile,
  shouldShowViewReferencesButton = false,
}) => {
  const isUser = message.from === "user"; // 判断是否是用户消息
  const [isOpen, setIsOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState("");

  const handleImageClick = (selctImage: string) => {
    setSelectedImage(selctImage);
    setIsOpen(true);
  };

  const handleCloseModal = () => {
    setIsOpen(false);
  };

  const handleDownload = async (url: string) => {
    try {
      window.open(url, "_blank");
    } catch (error) {
      console.error("Download failed:", error);
      alert("Download failed!");
    }
  };

  return (
    <div
      className={`m-1 rounded-3xl max-w-[95%] w-fit break-words flex flex-col 
        ${isUser ? "ml-auto" : "mr-auto"} ${
        isUser && message.type === "text"
          ? "bg-indigo-300 shadow-lg"
          : message.type === "image"
          ? "bg-white mb-3 shadow-lg"
          : "bg-white mb-0.5"
      } ${
        message.type === "text"
          ? "px-4 py-3 mb-2 text-gray-800"
          : "overflow-hidden"
      }`}
    >
      <div>
        {message.type === "text" && message.thinking && (
          <MarkdownDisplay
            md_text={message.thinking}
            message={message}
            showTokenNumber={false}
            isThinking={true}
          />
        )}
        {message.type === "text" && message.content && (
          <MarkdownDisplay
            md_text={message.content}
            message={message}
            showTokenNumber={true}
            isThinking={false}
          />
        )}

        {message.type === "file" && (
          <div className="flex items-center gap-0.5">
            <span className="text-sm">{getFileIcon(message.fileType)}</span>
            <div className="flex">
              <span
                onClick={() =>
                  handleDownload(message.minioUrl ? message.minioUrl : "")
                }
                className="pr-2 text-xs font-medium hover:text-indigo-500 hover:cursor-pointer"
              >
                {message.fileName}
              </span>
            </div>
          </div>
        )}

        {message.type === "image" && (
          <div className="flex items-center justify-center">
            {message.content === "loading" ? (
              <LoadingCircle />
            ) : (
              <div>
                <Image
                  src={message.minioUrl || ""}
                  alt={`image`}
                  width={200}
                  height={200}
                  onClick={() => handleImageClick(message.minioUrl || "")}
                  className="cursor-pointer"
                />
              </div>
            )}
          </div>
        )}
        {message.type === "baseFile" &&
          shouldShowViewReferencesButton && (
            <div
              className={`pl-2 flex gap-1 items-center text-sm text-indigo-500 hover:text-indigo-700 cursor-pointer ${
                showRefFile.includes(message.messageId || "baseFiles") ? "pb-2" : "pb-6"
              }`}
              onClick={() => {
                setShowRefFile((prev) => {
                  // 使用messageId作为标识符控制特定消息组的展开状态
                  const identifier = message.messageId || "baseFiles";
                  if (prev.includes(identifier)) {
                    // 如果存在：创建新数组（过滤掉目标元素）
                    return prev.filter((item) => item !== identifier);
                  } else {
                    // 如果不存在：创建新数组（添加新元素）
                    return [...prev, identifier];
                  }
                });
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="size-4"
              >
                <path d="M19.5 21a3 3 0 0 0 3-3v-4.5a3 3 0 0 0-3-3h-15a3 3 0 0 0-3 3V18a3 3 0 0 0 3 3h15ZM1.5 10.146V6a3 3 0 0 1 3-3h5.379a2.25 2.25 0 0 1 1.59.659l2.122 2.121c.14.141.331.22.53.22H19.5a3 3 0 0 1 3 3v1.146A4.483 4.483 0 0 0 19.5 9h-15a4.483 4.483 0 0 0-3 1.146Z" />
              </svg>

              <div>
                {showRefFile.includes(message.messageId || "baseFiles")
                  ? "Close References"
                  : "View References"}
              </div>
              {showRefFile.includes(message.messageId || "baseFiles") ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="size-4"
                >
                  <path
                    fillRule="evenodd"
                    d="M11.47 7.72a.75.75 0 0 1 1.06 0l7.5 7.5a.75.75 0 1 1-1.06 1.06L12 9.31l-6.97 6.97a.75.75 0 0 1-1.06-1.06l7.5-7.5Z"
                    clipRule="evenodd"
                  />
                </svg>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="size-5"
                >
                  <path
                    fillRule="evenodd"
                    d="M12.53 16.28a.75.75 0 0 1-1.06 0l-7.5-7.5a.75.75 0 0 1 1.06-1.06L12 14.69l6.97-6.97a.75.75 0 1 1 1.06 1.06l-7.5 7.5Z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </div>
          )}
        {message.type === "baseFile" &&
          showRefFile.includes(message.messageId || "baseFiles") && (
            <div className="pl-2 flex flex-col gap-2 items-start justify-center mb-3">
              <div className="flex items-center justify-center gap-1">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="size-4"
                >
                  <path
                    fillRule="evenodd"
                    d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.006 5.404.434c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.434 2.082-5.005Z"
                    clipRule="evenodd"
                  />
                </svg>
                <div className="text-gray-600 text-sm">
                  Score: {message.score}
                </div>
              </div>
              
              {/* 根据媒体类型显示不同内容 */}
              {(() => {
                // 调试信息
                console.log('BaseFile message:', {
                  content: message.content,
                  media_type: message.media_type,
                  timestamp: message.timestamp,
                  timestamp_start: message.timestamp_start,
                  timestamp_end: message.timestamp_end,
                  fileName: message.fileName,
                  minioUrl: message.minioUrl,
                  imageMinioUrl: message.imageMinioUrl
                });
                return null;
              })()}
              
              {/* 检查是否为视频文件（通过文件扩展名判断） */}
              {(() => {
                const isVideoFile = message.fileName &&
                  (message.fileName.toLowerCase().endsWith('.mp4') ||
                   message.fileName.toLowerCase().endsWith('.avi') ||
                   message.fileName.toLowerCase().endsWith('.mov') ||
                   message.fileName.toLowerCase().endsWith('.mkv') ||
                   message.fileName.toLowerCase().endsWith('.webm'));
                
                const isAudioFile = message.fileName &&
                  (message.fileName.toLowerCase().endsWith('.mp3') ||
                   message.fileName.toLowerCase().endsWith('.wav') ||
                   message.fileName.toLowerCase().endsWith('.m4a') ||
                   message.fileName.toLowerCase().endsWith('.ogg'));
                
                if (message.content === "video_frame" || (isVideoFile && message.media_type === 'video_frame')) {
                  return (
                    <>
                      {/* 视频帧预览 */}
                      <VideoSegmentPreview
                        videoUrl={message.minioUrl || ""}
                        thumbnailUrl={message.imageMinioUrl || ""}
                        filename={message.fileName || "Video"}
                        startTime={message.timestamp_start !== undefined ? message.timestamp_start : (message.timestamp || 0)}
                        endTime={message.timestamp_end !== undefined ? message.timestamp_end : ((message.timestamp || 0) + 10)}
                        score={message.score}
                        onSegmentClick={(start, end) => {
                          console.log(`Jumping to video segment: ${start}s - ${end}s`);
                        }}
                      />
                    </>
                  );
                } else if (message.content === "audio_segment" || (isAudioFile && (message.media_type === 'audio' || message.media_type === 'video_audio'))) {
                  return (
                    <>
                      {/* 音频分段预览 */}
                      <VideoSegmentPreview
                        videoUrl={message.minioUrl || ""}
                        thumbnailUrl={message.imageMinioUrl}
                        filename={message.fileName || "Audio"}
                        startTime={message.timestamp_start !== undefined ? message.timestamp_start : 0}
                        endTime={message.timestamp_end !== undefined ? message.timestamp_end : (message.timestamp_start || 0) + 30}
                        score={message.score}
                        onSegmentClick={(start, end) => {
                          console.log(`Jumping to audio segment: ${start}s - ${end}s`);
                        }}
                      />
                    </>
                  );
                } else if (isVideoFile && (message.media_type === 'video' || !message.media_type)) {
                  return (
                    <>
                      {/* 视频文件预览 */}
                      <VideoSegmentPreview
                        videoUrl={message.minioUrl || ""}
                        thumbnailUrl={message.imageMinioUrl || ""}
                        filename={message.fileName || "Video"}
                        startTime={message.timestamp_start !== undefined ? message.timestamp_start : 0}
                        endTime={message.timestamp_end !== undefined ? message.timestamp_end : (message.timestamp_start || 0) + 30}
                        score={message.score}
                        onSegmentClick={(start, end) => {
                          console.log(`Jumping to video segment: ${start}s - ${end}s`);
                        }}
                      />
                    </>
                  );
                } else {
                  // 原有图片显示
                  return (
                    <div>
                      <Image
                        src={message.imageMinioUrl || ""}
                        alt={`image`}
                        width={100}
                        height={100}
                        onClick={() => handleImageClick(message.imageMinioUrl || "")}
                        className="cursor-pointer"
                      />
                    </div>
                  );
                }
              })()}
              
              {/* 原来的条件渲染代码已经移到上面的函数中 */}
              {false && message.content === "video_frame" ? (
                <>
                  {/* 视频帧使用新的视频片段预览组件 */}
                  <VideoSegmentPreview
                    videoUrl={message.minioUrl || ""}
                    thumbnailUrl={message.imageMinioUrl || ""}
                    filename={message.fileName || "Video"}
                    startTime={message.timestamp || 0}
                    endTime={(message.timestamp || 0) + 3} // 视频帧显示3秒片段
                    score={message.score}
                    onSegmentClick={(start, end) => {
                      console.log(`Jumping to video segment: ${start}s - ${end}s`);
                    }}
                  />
                </>
              ) : null}
              
              <div
                onClick={() => {
                  return handleDownload(
                    message.minioUrl ? message.minioUrl : ""
                  );
                }}
                className="text-gray-600 text-sm hover:text-indigo-700 cursor-pointer"
              >
                {message.fileName}
              </div>
              <div className="flex items-center justify-start gap-1 text-gray-600 pb-2 border-b-2 border-gray-200 w-full">
                <div className="text-sm font-semibold">From: </div>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="size-4"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 1c3.866 0 7 1.79 7 4s-3.134 4-7 4-7-1.79-7-4 3.134-4 7-4Zm5.694 8.13c.464-.264.91-.583 1.306-.952V10c0 2.21-3.134 4-7 4s-7-1.79-7-4V8.178c.396.37.842.688 1.306.953C5.838 10.006 7.854 10.5 10 10.5s4.162-.494 5.694-1.37ZM3 13.179V15c0 2.21 3.134 4 7 4s7-1.79 7-4v-1.822c-.396.37-.842.688-1.306.953-1.532.875-3.548 1.369-5.694 1.369s-4.162-.494-5.694-1.37A7.009 7.009 0 0 1 3 13.179Z"
                    clipRule="evenodd"
                    transform="translate(0, 1)"
                  />
                </svg>
                <div className="text-sm font-semibold">
                  {
                    modelConfig?.baseUsed.find(
                      (item) => item.baseId === message.baseId
                    )?.name
                  }
                </div>
              </div>
            </div>
          )}
        {/* 大图弹窗 */}
        {isOpen &&
          createPortal(
            <div
              className="overflow-visible top-0 left-0 w-[100vw] h-[100vh] flex items-center justify-center fixed !z-[50000] bg-black/80"
              onClick={handleCloseModal}
            >
              <Image
                src={selectedImage}
                alt="Selected large"
                fill // 使用 fill 布局
                style={{ objectFit: "contain" }} // 使用 style 来设置 objectFitobjectFit="contain" // 保持图像比例
                className="max-h-[90%] m-auto"
              />
            </div>,
            document.body
          )}
      </div>
    </div>
  );
};

export default ChatMessage;
