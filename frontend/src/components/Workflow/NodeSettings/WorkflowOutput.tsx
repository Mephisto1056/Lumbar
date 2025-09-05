import ChatMessage from "@/components/AiChat/ChatMessage";
import { deleteFile } from "@/lib/api/knowledgeBaseApi";
import { uploadFiles } from "@/lib/api/chatApi";
import { useAuthStore } from "@/stores/authStore";
import { useGlobalStore } from "@/stores/WorkflowVariableStore";
import {
  Chatflow,
  CustomNode,
  FileRespose,
  Message,
  WorkflowAll,
} from "@/types/types";
import {
  getFileExtension,
  getFileIcon,
  SupportFileFormat,
  SupportUploadFormat,
} from "@/utils/file";
import {
  Dispatch,
  SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import Cookies from "js-cookie";
import { EventSourceParserStream } from "eventsource-parser/stream";
import useChatStore from "@/stores/chatStore";
import ChatflowHistory from "../ChatflowHistory";
import {
  deleteAllChatflow,
  deleteChatflow,
  getChatflowHistory,
} from "@/lib/api/chatflowApi";
import ConfirmDialog from "@/components/ConfirmDialog";
import { createPortal } from "react-dom";

interface WorkflowOutputProps {
  workflow: WorkflowAll;
  runningLLMNodes: CustomNode[];
  messagesWithCount: { [key: string]: Message[] };
  isDebugMode: boolean;
  setCodeFullScreenFlow: Dispatch<SetStateAction<boolean>>;
  codeFullScreenFlow: boolean;
  sendDisabled: boolean;
  onSendMessage: (
    message: string,
    files: FileRespose[],
    tempBaseId: string
  ) => void;
  tempBaseId: string;
  setTempBaseId: Dispatch<SetStateAction<string>>;
  sendingFiles: FileRespose[];
  setSendingFiles: Dispatch<SetStateAction<FileRespose[]>>;
  cleanTempBase: boolean;
}

const WorkflowOutputComponent: React.FC<WorkflowOutputProps> = ({
  workflow,
  runningLLMNodes,
  messagesWithCount,
  isDebugMode,
  setCodeFullScreenFlow,
  codeFullScreenFlow,
  onSendMessage,
  sendDisabled,
  tempBaseId,
  setTempBaseId,
  sendingFiles,
  setSendingFiles,
  cleanTempBase,
}) => {
  const {
    globalVariables,
    globalDebugVariables,
    addProperty,
    removeProperty,
    updateProperty,
    updateDebugProperty,
  } = useGlobalStore();
  const [variable, setVariable] = useState("");
  const handleVariableChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    isDebugMode: boolean
  ) => {
    const { name, value } = e.target;
    isDebugMode
      ? updateDebugProperty(name, value)
      : updateProperty(name, value);
  };

  const [inputMessage, setInputMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement | null>(null); // 创建引用
  const fileInputRef = useRef<HTMLInputElement>(null); // 新增文件输入引用
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [fileDivStyle, setFileDivStyle] = useState({});
  const { user } = useAuthStore();
  const [uploadProgress, setUploadProgress] = useState<number | null>(0);
  const [taskStatus, setTaskStatus] = useState<
    "processing" | "completed" | "failed" | null
  >(null);
  const [taskProgress, setTaskProgress] = useState<number>(0);
  const [uploadFile, setUploadFile] = useState<boolean>(false);
  const [showRefFile, setShowRefFile] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [chatflowHistory, setChatflowHistory] = useState<Chatflow[]>([]);
  const [chatflowName, setChatflowName] = useState("");
  const [showConfirmDeleteAllChatflow, setShowConfirmDeleteAllChatflow] =
    useState(false);

  // 修改发送按钮逻辑
  const isUploadComplete = uploadProgress === 100;
  const isTaskComplete = taskStatus === "completed";
  const isSendDisabled = (!isUploadComplete || !isTaskComplete) && uploadFile;

  let buttonText;
  let buttonTextFullScreen;
  if (!uploadFile) {
    buttonText = "Send";
    buttonTextFullScreen = "Send";
  } else if (!isUploadComplete) {
    buttonText = `Upload:${uploadProgress}%`;
    buttonTextFullScreen = `Upload:${uploadProgress}%`;
  } else if (!isTaskComplete) {
    buttonText = taskStatus === "failed" ? "Failed" : `${taskProgress}%`;
    buttonTextFullScreen =
      taskStatus === "failed" ? "Upload Failed" : `Processing:${taskProgress}%`;
  } else {
    buttonText = "Send";
    buttonTextFullScreen = "Send";
  }

  const { chatflowId, setChatflowId } = useChatStore();
  // 支持的文件类型
  const supportedExtensions = SupportFileFormat;

  const handleSend = () => {
    if (inputMessage.trim()) {
      // 发送用户消息
      onSendMessage(inputMessage, sendingFiles, tempBaseId);
      setInputMessage("");
      setSendingFiles([]);
      setTempBaseId("");
      setUploadFile(false);
      // 重置高度
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    }
  };

  // 使用 useEffect 监测 messages 的变化
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" }); // 平滑滚动到底部
    }
  }, [messagesWithCount]);

  // 触发文件选择对话框
  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const handleDeleteFile = async (id: string) => {
    try {
      setSendingFiles((prevFiles) =>
        prevFiles.filter((file) => file.id !== id)
      );
      await deleteFile(tempBaseId, id);
    } catch (error) {
      console.error("Error delete file:", error);
    }
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles = files.filter((file) => {
      const ext = getFileExtension(file.name);
      return supportedExtensions.includes(ext);
    });

    const invalidFiles = files.filter((file) => {
      const ext = getFileExtension(file.name);
      return !supportedExtensions.includes(ext);
    });

    if (invalidFiles.length > 0) {
      alert(
        `Unsupport file type: \n${invalidFiles.map((f) => f.name).join("\n")}`
      );
    }

    if (validFiles.length > 0 && user?.name) {
      setUploadProgress(0); // 重置上传进度
      setTaskStatus(null); // 重置任务状态
      setUploadFile(true);

      uploadFiles(validFiles, user.name, chatflowId, (percent) => {
        setUploadProgress(percent); // 更新上传进度
      })
        .then(async (response) => {
          setSendingFiles((prev) => [...prev, ...response?.data.files]);
          setTempBaseId(response?.data.knowledge_db_id);

          // 使用fetch代替EventSource
          const token = Cookies.get("token"); // 确保已引入cookie库
          const taskId = response?.data.task_id;

          try {
            const response = await fetch(
              `${process.env.NEXT_PUBLIC_API_BASE_URL}/sse/task/${user.name}/${taskId}`,
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              }
            );

            if (!response.ok) throw new Error("Request failed");
            if (!response.body) return;

            // 使用EventSourceParserStream处理流
            const eventStream = response.body
              ?.pipeThrough(new TextDecoderStream())
              .pipeThrough(new EventSourceParserStream());

            const eventReader = eventStream.getReader();
            while (true) {
              const { done, value } = (await eventReader?.read()) || {};
              if (done) break;

              const payload = JSON.parse(value.data);
              // 处理事件数据
              if (payload.event === "progress") {
                const progress = payload.total > 0 ? payload.progress : 0;

                setTaskProgress(progress);
                setTaskStatus(payload.status);

                if (["completed", "failed"].includes(payload.status)) {
                  if (payload.status === "failed") {
                    alert("Embedding error!");
                  }
                  eventReader.cancel();
                  break;
                }
              }
            }
          } catch (error) {
            console.error("SSE错误:", error);
            setTaskStatus("failed");
          }
        })
        .catch((error) => {
          alert("Upload error");
        });
    }

    e.target.value = "";
  };

  const handleDownload = async (url: string) => {
    try {
      window.open(url, "_blank");
    } catch (error) {
      console.error("Download failed:", error);
      alert("Download failed!");
    }
  };

  useEffect(() => {
    if (textareaRef.current) {
      const height = textareaRef.current.getBoundingClientRect().height;
      setFileDivStyle({ bottom: `calc(55% + ${height}px/2` });
      // 如果需要，还可以设置 left 或其他样式属性
    }
  }, [inputMessage]); // 这个 effect 只在组件挂载时运行一次

  const fetchChatHistory = useCallback(async () => {
    if (user?.name) {
      try {
        const response = await getChatflowHistory(workflow.workflowId);
        const chatflows = response.data.map((item: any) => ({
          name: item.chatflow_name,
          chatflowId: item.chatflow_id,
          isRead: item.is_read,
          lastModifyTime: item.last_modify_at,
          createTime: item.created_at,
          messages: [],
        }));
        setChatflowHistory(chatflows);
      } catch (error) {
        console.error("Error fetching chat history:", error);
      }
    }
  }, [user?.name, workflow.workflowId]); // Dependency added

  useEffect(() => {
    fetchChatHistory();
  }, [
    user?.name,
    chatflowId,
    chatflowName,
    setChatflowId,
    fetchChatHistory,
    workflow,
  ]); // Added fetchChatHistory

  const handleDeleteChatflow = (chatflowId: string) => {
    const fetchdeleteChat = async () => {
      if (user?.name) {
        try {
          // 从 chatHistory 中移除已删除的聊天记录
          setChatflowHistory((prevChatflowHistory: Chatflow[]) =>
            prevChatflowHistory.filter((c) => c.chatflowId !== chatflowId)
          );
          await deleteChatflow(chatflowId);
        } catch (error) {
          console.error("Error fetching chat history:", error);
        }
      }
    };

    fetchdeleteChat(); // 调用获取聊天记录的函数
  };

  const handleDeleteAllChatflow = () => {
    const fetchdeleteChat = async () => {
      if (user?.name) {
        try {
          // 从 chatHistory 中移除已删除的聊天记录
          setChatflowHistory([]);
          await deleteAllChatflow(workflow.workflowId);
        } catch (error) {
          console.error("Error fetching chat history:", error);
        }
      }
    };

    fetchdeleteChat(); // 调用获取聊天记录的函数
  };

  const confirmDeleteAllChatflow = () => {
    if (showConfirmDeleteAllChatflow) {
      handleDeleteAllChatflow();
      setShowConfirmDeleteAllChatflow(false); // 关闭对话框
    }
  };

  const cancelDeleteAllChatflow = () => {
    if (showConfirmDeleteAllChatflow) {
      setShowConfirmDeleteAllChatflow(false); // 关闭对话框
    }
  };

  return (
    <div className="overflow-auto h-full flex flex-col items-start justify-start gap-1">
      <div className="px-2 py-1 flex items-center justify-between w-full mt-1 font-medium">
        <div className="text-xl flex items-center justify-start max-w-[80%] gap-1">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="1.5"
            stroke="currentColor"
            className="size-6 shrink-0"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z"
            />
          </svg>
          <div className="focus:outline-none cursor-text overflow-auto whitespace-nowrap">
            Chatflow
          </div>
        </div>
        {showHistory && (
          <button
            className="cursor-pointer disabled:cursor-not-allowed px-4 py-2 rounded-full hover:bg-indigo-600 hover:text-white disabled:opacity-50 flex items-center justify-center gap-1"
            onClick={() => setCodeFullScreenFlow((prev: boolean) => !prev)}
          >
            {codeFullScreenFlow ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="1.5"
                stroke="currentColor"
                className="size-6"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25"
                />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="1.5"
                stroke="currentColor"
                className="size-6"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15"
                />
              </svg>
            )}
          </button>
        )}
        <button
          onClick={() => {
            setShowHistory((prev) => !prev);
          }}
          className="text-indigo-500 cursor-pointer disabled:cursor-not-allowed py-2 px-3 rounded-full hover:bg-indigo-600 hover:text-white disabled:opacity-50 flex items-center justify-center gap-1"
        >
          {showHistory ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
              className="size-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3"
              />
            </svg>
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
              className="size-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
              />
            </svg>
          )}

          <span className="whitespace-nowrap">
            {showHistory ? "Return" : "Chatflow History"}
          </span>
        </button>
      </div>
      {!showHistory && (
        <details className="group w-full open">
          <summary className="flex items-center cursor-pointer font-medium w-full">
            <div className="px-2 py-1 flex items-center justify-between w-full mt-1">
              <div className="flex items-center justify-center gap-1">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="size-5"
                >
                  <path
                    fillRule="evenodd"
                    d="M19.253 2.292a.75.75 0 0 1 .955.461A28.123 28.123 0 0 1 21.75 12c0 3.266-.547 6.388-1.542 9.247a.75.75 0 1 1-1.416-.494c.94-2.7 1.458-5.654 1.458-8.753s-.519-6.054-1.458-8.754a.75.75 0 0 1 .461-.954Zm-14.227.013a.75.75 0 0 1 .414.976A23.183 23.183 0 0 0 3.75 12c0 3.085.6 6.027 1.69 8.718a.75.75 0 0 1-1.39.563c-1.161-2.867-1.8-6-1.8-9.281 0-3.28.639-6.414 1.8-9.281a.75.75 0 0 1 .976-.414Zm4.275 5.052a1.5 1.5 0 0 1 2.21.803l.716 2.148L13.6 8.246a2.438 2.438 0 0 1 2.978-.892l.213.09a.75.75 0 1 1-.584 1.381l-.214-.09a.937.937 0 0 0-1.145.343l-2.021 3.033 1.084 3.255 1.445-.89a.75.75 0 1 1 .786 1.278l-1.444.889a1.5 1.5 0 0 1-2.21-.803l-.716-2.148-1.374 2.062a2.437 2.437 0 0 1-2.978.892l-.213-.09a.75.75 0 0 1 .584-1.381l.214.09a.938.938 0 0 0 1.145-.344l2.021-3.032-1.084-3.255-1.445.89a.75.75 0 1 1-.786-1.278l1.444-.89Z"
                    clipRule="evenodd"
                  />
                </svg>
                Global Variable
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
              <button
                className="cursor-pointer disabled:cursor-not-allowed px-4 py-2 rounded-full hover:bg-indigo-600 hover:text-white disabled:opacity-50 flex items-center justify-center gap-1"
                onClick={() => setCodeFullScreenFlow((prev: boolean) => !prev)}
              >
                {codeFullScreenFlow ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth="1.5"
                    stroke="currentColor"
                    className="size-6"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25"
                    />
                  </svg>
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth="1.5"
                    stroke="currentColor"
                    className="size-6"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15"
                    />
                  </svg>
                )}
              </button>
            </div>
          </summary>
          <div
            className={`space-y-2 p-4 rounded-2xl shadow-lg ${
              codeFullScreenFlow ? "w-full" : "w-full"
            }`}
          >
            <div className="flex items-center w-full px-2 gap-6 border-gray-200">
              <input
                name={"addVariable"}
                value={variable}
                placeholder="Variable Name"
                onChange={(e) => setVariable(e.target.value)}
                className="w-full px-3 py-1 border-2 border-gray-200 rounded-xl
              focus:outline-none focus:ring-2 focus:ring-indigo-500
              disabled:opacity-50"
                onKeyDown={(e: React.KeyboardEvent<HTMLSpanElement>) => {
                  if (e.key === "Enter") {
                    // 按下回车时保存并退出编辑模式
                    e.preventDefault();
                    if (variable === "") {
                      return;
                    } else {
                      addProperty(variable, "");
                      setVariable("");
                    }
                  }
                }}
              />
              <div
                onClick={() => {
                  if (variable === "") {
                    return;
                  } else {
                    addProperty(variable, "");
                    setVariable("");
                  }
                }}
                className="whitespace-nowrap cursor-pointer hover:text-indigo-700 pr-2 flex items-center gap-1 text-indigo-500"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="size-5"
                >
                  <path
                    fillRule="evenodd"
                    d="M12 3.75a.75.75 0 0 1 .75.75v6.75h6.75a.75.75 0 0 1 0 1.5h-6.75v6.75a.75.75 0 0 1-1.5 0v-6.75H4.5a.75.75 0 0 1 0-1.5h6.75V4.5a.75.75 0 0 1 .75-.75Z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>Click to Add</span>
              </div>
            </div>
            {Object.keys(isDebugMode ? globalDebugVariables : globalVariables)
              .length === 0 && (
              <div className="px-2 flex w-full items-center gap-2 text-gray-500">
                No variable found.
              </div>
            )}
            {Object.keys(
              isDebugMode ? globalDebugVariables : globalVariables
            ).map((key) => {
              // 获取当前值和初始值
              const currentValue = isDebugMode
                ? globalDebugVariables[key]
                : globalVariables[key];
              const initialValue = globalVariables[key];

              // 判断是否是未修改状态
              const isUnchanged = isDebugMode && currentValue === initialValue;
              return (
                <div className="px-2 flex w-full items-center gap-2" key={key}>
                  <div className="max-w-[50%] whitespace-nowrap overflow-auto">
                    {key}
                  </div>
                  <div>=</div>
                  {/* 输入框容器添加相对定位 */}
                  <div className="flex-1 relative">
                    <input
                      name={key}
                      value={currentValue}
                      onChange={(e) => handleVariableChange(e, isDebugMode)}
                      className={`w-full px-3 py-1 border-2 rounded-xl border-gray-200
            focus:outline-none focus:ring-2 focus:ring-indigo-500
            disabled:opacity-50 ${
              isUnchanged ? "text-gray-400" : "text-black"
            }`}
                      onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                      }}
                    />
                    {/* 初始值提示（仅在调试模式且未修改时显示） */}
                    {isDebugMode && (
                      <div className="absolute right-1 top-0 px-3 py-1 pointer-events-none text-gray-400">
                        Init: {initialValue}
                      </div>
                    )}
                  </div>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth="1.5"
                    stroke="currentColor"
                    className="size-5 text-indigo-500 cursor-pointer shrink-0"
                    onClick={() => removeProperty(key)}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                    />
                  </svg>
                </div>
              );
            })}
          </div>
        </details>
      )}
      {!showHistory && (
        <details className="group w-full" open>
          <summary className="flex items-center cursor-pointer font-medium w-full">
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
                </svg>
                LLM Response
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
          <div
            className={`rounded-2xl shadow-lg overflow-auto w-full mb-2 p-2`}
          >
            <div
              className="flex-1 overflow-y-scroll scrollbar-hide"
              style={{ overscrollBehavior: "contain" }}
            >
              {messagesWithCount && runningLLMNodes.length > 0 ? (
                Object.entries(messagesWithCount).map(
                  ([count, messages], messagesIndex) => {
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
                          modelConfig={
                            runningLLMNodes[Number(count) - 1].data.modelConfig
                          }
                          key={messagesIndex + index}
                          message={message}
                          showRefFile={showRefFile}
                          setShowRefFile={setShowRefFile}
                          shouldShowViewReferencesButton={shouldShowButton}
                        />
                      );
                    });
                  }
                )
              ) : (
                <ChatMessage
                  modelConfig={undefined}
                  message={{
                    type: "text" as const,
                    content:
                      'The send button becomes active when reaching an LM/VLM node with the "Set As Chatflow User Input" checkbox selected. To enable user input, check the "Set As Chatflow User Input" option in the LLM/VLM node.',
                    from: "ai" as const,
                  }}
                  showRefFile={showRefFile}
                  setShowRefFile={setShowRefFile}
                />
              )}
              <div ref={messagesEndRef} />
            </div>
            {/* 输入框 */}
            <div
              className={`relative ${
                codeFullScreenFlow ? "w-[80%] mt-1 mb-1" : "w-[100%] mt-4 mb-4"
              } mt-4 mb-4 max-h-[25%] flex items-center justify-center ${
                codeFullScreenFlow ? "gap-10" : "gap-2"
              }  mx-auto`}
            >
              <div className="relative flex-1 h-[100%]">
                <div className="flex justify-center items-center h-full">
                  <textarea
                    ref={textareaRef}
                    className={`pl-11 pr-8 w-full py-3 min-h-[40%] max-h-[100%] ${
                      !isSendDisabled && !sendDisabled
                        ? "border-indigo-500 focus:border-indigo-700"
                        : "border-indigo-200 focus:border-indigo-400"
                    } border-2 rounded-xl $ text-base focus:outline-hidden focus:border-[2.5px] resize-none overflow-y-auto`}
                    placeholder={
                      isSendDisabled || sendDisabled
                        ? "Waiting for 'Run'"
                        : codeFullScreenFlow
                        ? "Press Shift+Enter to send..."
                        : "Send: Shift+Enter"
                    }
                    value={inputMessage}
                    rows={1}
                    onChange={(e) => {
                      setInputMessage(e.target.value);
                      e.target.style.height = "auto";
                      e.target.style.height = e.target.scrollHeight + "px";
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && e.shiftKey) {
                        e.preventDefault();
                        if (!isSendDisabled && !sendDisabled) {
                          handleSend();
                        }
                      }
                    }}
                  />
                </div>

                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="size-5 absolute right-3 top-1/2 transform -translate-y-1/2 cursor-pointer text-gray-400"
                  onClick={() => {
                    setInputMessage("");
                    // 重置高度
                    if (textareaRef.current) {
                      textareaRef.current.style.height = "auto";
                    }
                  }} // 点击时清空输入框内容
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM8.28 7.22a.75.75 0 0 0-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 1 0 1.06 1.06L10 11.06l1.72 1.72a.75.75 0 1 0 1.06-1.06L11.06 10l1.72-1.72a.75.75 0 0 0-1.06-1.06L10 8.94 8.28 7.22Z"
                    clipRule="evenodd"
                  />
                </svg>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className={`size-6 absolute left-3 top-1/2 transform -translate-y-1/2 ${
                    isSendDisabled || sendDisabled || cleanTempBase
                      ? "cursor-not-allowed"
                      : "cursor-pointer"
                  }`}
                  onClick={() => {
                    if (!isSendDisabled && !sendDisabled && !cleanTempBase) {
                      return triggerFileInput();
                    }
                  }} // 点击时清空输入框内容
                >
                  <path
                    fillRule="evenodd"
                    d="M18.97 3.659a2.25 2.25 0 0 0-3.182 0l-10.94 10.94a3.75 3.75 0 1 0 5.304 5.303l7.693-7.693a.75.75 0 0 1 1.06 1.06l-7.693 7.693a5.25 5.25 0 1 1-7.424-7.424l10.939-10.94a3.75 3.75 0 1 1 5.303 5.304L9.097 18.835l-.008.008-.007.007-.002.002-.003.002A2.25 2.25 0 0 1 5.91 15.66l7.81-7.81a.75.75 0 0 1 1.061 1.06l-7.81 7.81a.75.75 0 0 0 1.054 1.068L18.97 6.84a2.25 2.25 0 0 0 0-3.182Z"
                    clipRule="evenodd"
                  />
                </svg>
                <div className="text-xs absolute left-[calc(12px+18px)] top-[calc(50%+10px)] transform -translate-y-1/2">
                  {sendingFiles.length}
                </div>
                {/* 隐藏的文件输入 */}
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  multiple
                  accept={SupportUploadFormat}
                  onChange={handleFileSelected}
                />
                <div
                  className="flex-col gap-1 absolute left-[1%]"
                  style={fileDivStyle}
                >
                  {sendingFiles &&
                    sendingFiles.map((file, index) => (
                      <div
                        className="w-full overflow-hidden flex gap-1 mt-1 text-xs bg-white"
                        key={index}
                      >
                        <span>
                          {getFileIcon(getFileExtension(file.filename))}
                        </span>
                        <span
                          onClick={() =>
                            handleDownload(file.url ? file.url : "")
                          }
                          className="hover:text-indigo-500 hover:cursor-pointer"
                        >
                          {file.filename}
                        </span>
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth="1.5"
                          stroke="currentColor"
                          className={`size-4 text-indigo-500 hover:text-indigo-700 ${
                            isSendDisabled || sendDisabled || cleanTempBase
                              ? "cursor-not-allowed"
                              : "cursor-pointer"
                          }`}
                          onClick={() => {
                            if (!isSendDisabled && !sendDisabled && !cleanTempBase) {
                              return handleDeleteFile(file.id);
                            }
                          }}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M6 18 18 6M6 6l12 12"
                          />
                        </svg>
                      </div>
                    ))}
                </div>
              </div>
              <button
                className={`flex gap-1 ${
                  isSendDisabled || sendDisabled
                    ? "bg-indigo-300 cursor-not-allowed"
                    : "bg-indigo-500 hover:bg-indigo-600 cursor-pointer "
                } rounded-full text-base item-center justify-center ${
                  codeFullScreenFlow ? "px-6" : "px-3"
                } py-2 text-white`}
                onClick={handleSend}
                disabled={isSendDisabled || sendDisabled}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="size-5 shrink-0 my-auto"
                >
                  <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
                </svg>
                {codeFullScreenFlow ? buttonTextFullScreen : buttonText}
              </button>
            </div>
          </div>
        </details>
      )}
      {showHistory && (
        <div
          onClick={() => setShowConfirmDeleteAllChatflow(true)}
          className="border-b border-gray-200 cursor-pointer px-auto py-1 w-full flex items-center justify-center gap-1 text-indigo-500 hover:text-indigo-700"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="1.5"
            stroke="currentColor"
            className="size-5 my-auto cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              setShowConfirmDeleteAllChatflow(true);
            }}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
            />
          </svg>
          <span>Clear History</span>
        </div>
      )}
      {showHistory &&
        chatflowHistory.map((chatflow, index) => (
          <ChatflowHistory
            key={index}
            deleteChatflow={handleDeleteChatflow}
            chatflowId={chatflow.chatflowId}
            lastModifyTime={chatflow.lastModifyTime}
          />
        ))}
      {showConfirmDeleteAllChatflow &&
        createPortal(
          <ConfirmDialog
            message={`Confirm the deletion of All Chatflow？`}
            onConfirm={confirmDeleteAllChatflow}
            onCancel={cancelDeleteAllChatflow}
          />,
          document.body
        )}
    </div>
  );
};

export default WorkflowOutputComponent;
