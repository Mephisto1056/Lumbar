import ChatMessage from "@/components/AiChat/ChatMessage";
import { deleteChatflow, getChatflowContent } from "@/lib/api/chatflowApi";
import { getAllKnowledgeBase } from "@/lib/api/knowledgeBaseApi";
import { useAuthStore } from "@/stores/authStore";
import {
  BaseUsed,
  FileUsed,
  KnowledgeBase,
  Message,
  ModelConfig,
} from "@/types/types";
import { parseToBeijingTime } from "@/utils/date";
import { getFileExtension } from "@/utils/file";
import { useState } from "react";
import ConfirmDialog from "../ConfirmDialog";
import { createPortal } from "react-dom";

interface ChatflowHistoryProps {
  chatflowId: string;
  lastModifyTime: string;
  deleteChatflow: (chatflowId: string) => void;
}

const ChatflowHistoryComponent: React.FC<ChatflowHistoryProps> = ({
  chatflowId,
  lastModifyTime,
  deleteChatflow,
}) => {
  const [showRefFile, setShowRefFile] = useState<string[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [modelConfig, setModelConfig] = useState<ModelConfig>();
  const [showConfirmDeleteChatflow, setShowConfirmDeleteChatflow] =
    useState(false);
  const { user } = useAuthStore();

  const confirmDeleteChatflow = () => {
    if (showConfirmDeleteChatflow) {
      deleteChatflow(chatflowId);
      setShowConfirmDeleteChatflow(false); // 关闭对话框
    }
  };

  const cancelDeleteChatflow = () => {
    if (showConfirmDeleteChatflow) {
      setShowConfirmDeleteChatflow(false); // 关闭对话框
    }
  };

  const handleSelectChatflow = () => {
    const fetchChatflowHistoryMessage = async () => {
      if (user?.name) {
        try {
          const responseBase = await getAllKnowledgeBase(user.name);
          const bases: BaseUsed[] = responseBase.data.map((item: any) => ({
            name: item.knowledge_base_name,
            baseId: item.knowledge_base_id,
          }));

          setModelConfig({
            modelId: "",
            baseUsed: bases,
            modelName: "",
            modelURL: "",
            apiKey: "",
            systemPrompt: "",
            temperature: 0,
            maxLength: 0,
            topP: 0,
            topK: 0,
            scoreThreshold: 0,
            useTemperatureDefault: false,
            useMaxLengthDefault: false,
            useTopPDefault: false,
            useTopKDefault: false,
            useScoreThresholdDefault: false,
          });

          const response = await getChatflowContent(chatflowId);
          const messages: Message[] = response.data.turns
            .map((item: any) => {
              const text = item.user_message.content.find(
                (content: { type: string }) => content.type == "text"
              );
              const file_used = item.file_used;
              const images = item.user_file.filter(
                (file: { filename: string }) =>
                  ["png", "jpg", "jpeg", "gif"].includes(
                    getFileExtension(file.filename)
                  )
              );
              const files = item.user_file.filter(
                (file: { filename: string }) =>
                  !["png", "jpg", "jpeg", "gif"].includes(
                    getFileExtension(file.filename)
                  )
              );

              return [
                ...images.map((file: any) => ({
                  type: "image",
                  content: file.filename,
                  minioUrl: file.url,
                  from: "user",
                })),
                ...files.map((file: any) => ({
                  type: "file",
                  content: "image",
                  fileName: file.filename,
                  fileType: getFileExtension(file.filename), // 新增文件类型字段
                  minioUrl: file.url,
                  from: "user",
                })),
                {
                  type: "text",
                  content: `${text.text}`,
                  from: "user",
                },
                {
                  type: "text",
                  content: `${item.ai_message.content}`,
                  messageId: `${item.message_id}`,
                  from: "ai",
                  token_number: {
                    total_token: `${item.total_token}`,
                    completion_tokens: `${item.completion_tokens}`,
                    prompt_tokens: `${item.prompt_tokens}`,
                  },
                },

                ...file_used.map((file: FileUsed, index: number) => {
                  // 根据媒体类型确定content和相关属性
                  let content = `image_${index}`;
                  let additionalProps = {};
                  
                  if (file.media_type === 'video_frame') {
                    content = 'video_frame';
                    additionalProps = {
                      timestamp: file.timestamp,
                      timestamp_start: file.timestamp_start,
                      timestamp_end: file.timestamp_end,
                      duration: file.duration,
                      media_type: 'video_frame',
                    };
                  } else if (file.media_type === 'audio' || file.media_type === 'video_audio') {
                    content = 'audio_segment';
                    additionalProps = {
                      timestamp_start: file.timestamp_start,
                      timestamp_end: file.timestamp_end,
                      duration: file.duration,
                      media_type: file.media_type,
                    };
                  }

                  return {
                    type: "baseFile",
                    content,
                    imageMinioUrl: file.image_url,
                    fileName: file.file_name,
                    messageId: `${item.message_id}`,
                    baseId: file.knowledge_db_id,
                    minioUrl: file.file_url,
                    score: file.score,
                    from: "ai",
                    ...additionalProps,
                  };
                }),
              ];
            })
            .flat(); // 使用 flat 将嵌套数组平铺
          setMessages(messages);
        } catch (error) {
          console.error("Error fetching chat history:", error);
        }
      }
    };

    fetchChatflowHistoryMessage(); // 调用获取聊天记录的函数
  };

  return (
    <div className="relative w-full">
      <details className="group w-full">
        <summary
          className="flex items-center cursor-pointer font-medium w-full"
          onClick={handleSelectChatflow}
        >
          <div className="py-1 px-2 flex mt-1 items-center justify-between w-full font-medium">
            <div className="flex items-center justify-start gap-1">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="size-5"
              >
                <path
                  fillRule="evenodd"
                  d="M4.848 2.771A49.144 49.144 0 0 1 12 2.25c2.43 0 4.817.178 7.152.52 1.978.292 3.348 2.024 3.348 3.97v6.02c0 1.946-1.37 3.678-3.348 3.97a48.901 48.901 0 0 1-3.476.383.39.39 0 0 0-.297.17l-2.755 4.133a.75.75 0 0 1-1.248 0l-2.755-4.133a.39.39 0 0 0-.297-.17 48.9 48.9 0 0 1-3.476-.384c-1.978-.29-3.348-2.024-3.348-3.97V6.741c0-1.946 1.37-3.68 3.348-3.97ZM6.75 8.25a.75.75 0 0 1 .75-.75h9a.75.75 0 0 1 0 1.5h-9a.75.75 0 0 1-.75-.75Zm.75 2.25a.75.75 0 0 0 0 1.5H12a.75.75 0 0 0 0-1.5H7.5Z"
                  clipRule="evenodd"
                />
              </svg>{" "}
              {
                parseToBeijingTime(lastModifyTime + "Z")
                  .toISOString()
                  .split("T")[0]
              }{" "}
              {
                parseToBeijingTime(lastModifyTime + "Z")
                  .toISOString()
                  .split("T")[1]
                  .split(".")[0]
              }
              <svg
                className="ml-1 w-4 h-4 transition-transform group-open:rotate-180"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </div>
          </div>
        </summary>
        <div className={`rounded-2xl shadow-lg overflow-auto w-full mb-2 p-2`}>
          <div
            className="flex-1 overflow-y-scroll scrollbar-hide"
            style={{ overscrollBehavior: "contain" }}
          >
            {messages.length > 0 ? (
              (() => {
                // 预处理：找出每个messageId的第一个baseFile消息的索引
                const messageIdFirstBaseFileMap = new Map<string, number>();
                
                // 遍历消息，记录每个messageId的第一个baseFile消息索引
                messages.forEach((message, index) => {
                  if (message.type === "baseFile") {
                    const messageId = message.messageId || "default";
                    if (!messageIdFirstBaseFileMap.has(messageId)) {
                      messageIdFirstBaseFileMap.set(messageId, index);
                    }
                  }
                });

                return messages.map((message, index) => {
                  // 只有每个messageId的第一个baseFile才显示按钮
                  let shouldShowButton = false;
                  if (message.type === "baseFile") {
                    const messageId = message.messageId || "default";
                    const firstIndex = messageIdFirstBaseFileMap.get(messageId);
                    shouldShowButton = firstIndex === index;
                  }
                  
                  return (
                    <ChatMessage
                      modelConfig={modelConfig}
                      key={index}
                      message={message}
                      showRefFile={showRefFile}
                      setShowRefFile={setShowRefFile}
                      shouldShowViewReferencesButton={shouldShowButton}
                    />
                  );
                });
              })()
            ) : (
              <ChatMessage
                modelConfig={undefined}
                message={{
                  type: "text" as const,
                  content: "No messages found",
                  from: "ai" as const,
                }}
                showRefFile={showRefFile}
                setShowRefFile={setShowRefFile}
              />
            )}
          </div>
        </div>
      </details>
      <div className="hover:text-indigo-700 z-10 absolute right-2 top-0 py-[6px] mt-1">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="1.5"
          stroke="currentColor"
          className="size-5 my-auto cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            setShowConfirmDeleteChatflow(true);
          }}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
          />
        </svg>
      </div>
      {showConfirmDeleteChatflow &&
        createPortal(
          <ConfirmDialog
            message={`Confirm the deletion of this Chatflow？`}
            onConfirm={confirmDeleteChatflow}
            onCancel={cancelDeleteChatflow}
          />,
          document.body
        )}
    </div>
  );
};

export default ChatflowHistoryComponent;
