import { useAuthStore } from "@/stores/authStore";
import { useFlowStore } from "@/stores/flowStore";
import { useGlobalStore } from "@/stores/WorkflowVariableStore";
import {
  CustomNode,
  McpConfig,
  Message,
  ModelConfig,
  WorkflowAll,
} from "@/types/types";
import { Dispatch, SetStateAction, useState } from "react";
import KnowledgeConfigModal from "./KnowledgeConfigModal";
import { updateModelConfig } from "@/lib/api/configApi";
import Cookies from "js-cookie";
import { EventSourceParserStream } from "eventsource-parser/stream";
import ChatMessage from "@/components/AiChat/ChatMessage";
import MarkdownDisplay from "@/components/AiChat/MarkdownDisplay";
import McpConfigComponent from "./McpConfig";
import { createPortal } from "react-dom";
import { replaceTemplate } from "@/utils/convert";

interface VlmNodeProps {
  messages: Message[];
  setMessages: Dispatch<
    SetStateAction<{
      [key: string]: Message[];
    }>
  >;
  saveNode: (node: CustomNode) => void;
  isDebugMode: boolean;
  node: CustomNode;
  setCodeFullScreenFlow: Dispatch<SetStateAction<boolean>>;
  codeFullScreenFlow: boolean;
  showError: (error: string) => void;
}

const VlmNodeComponent: React.FC<VlmNodeProps> = ({
  messages,
  setMessages,
  saveNode,
  isDebugMode,
  node,
  setCodeFullScreenFlow,
  codeFullScreenFlow,
  showError,
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
  const [outputVariable, setOutputVariable] = useState("");
  const handleVariableChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    isDebugMode: boolean
  ) => {
    const { name, value } = e.target;
    isDebugMode
      ? updateDebugProperty(name, value)
      : updateProperty(name, value);
  };
  const {
    updateNodeLabel,
    updateVlmModelConfig,
    updatePrompt,
    updateVlmInput,
    changeChatflowInput,
    changeChatflowOutput,
    changeUseChatHistory,
    changeChatflowOutputVariable,
    updateDebug,
    updateChat,
    updateDescription,
  } = useFlowStore();
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showMcpConfig, setShowMcpConfig] = useState(false);
  const { user } = useAuthStore();
  const [runTest, setRunTest] = useState(false);
  const [showRefFile, setShowRefFile] = useState<string[]>([]);
  const [isEditing, setIsEditing] = useState(false);

  const configureKnowledgeDB = () => {
    setShowConfigModal(true);
  };

  const handleSaveConfig = async (config: ModelConfig) => {
    if (user?.name) {
      try {
        //更新数据库使用
        updateVlmModelConfig(node.id, config);
        await updateModelConfig(user.name, config);
      } catch (error) {
        console.error("保存配置失败:", error);
      }
    }
  };

  const handleRunTest = async () => {
    if (!node.data.vlmInput) {
      showError("Please write your question to AI before running LLM node!");
      return;
    }
    setMessages((prev) => ({ ...prev, [node.id]: [] }));
    if (user?.name) {
      setRunTest(true);
      try {
        const token = Cookies.get("token");
        const modelConfig = {
          model_name: node.data.modelConfig?.modelName,
          model_url: node.data.modelConfig?.modelURL,
          api_key: node.data.modelConfig?.apiKey,
          base_used: node.data.modelConfig?.baseUsed,
          system_prompt: node.data.modelConfig?.systemPrompt,
          temperature: node.data.modelConfig?.useTemperatureDefault
            ? -1
            : node.data.modelConfig?.temperature,
          max_length: node.data.modelConfig?.useMaxLengthDefault
            ? -1
            : node.data.modelConfig?.maxLength,
          top_P: node.data.modelConfig?.useTopPDefault
            ? -1
            : node.data.modelConfig?.topP,
          top_K: node.data.modelConfig?.useTopKDefault
            ? -1
            : node.data.modelConfig?.topK,
          score_threshold: node.data.modelConfig?.useScoreThresholdDefault
            ? -1
            : node.data.modelConfig?.scoreThreshold,
        };

        const filterMcpConfig = (
          mcpConfig: {
            [key: string]: McpConfig;
          },
          mcpUse: {
            [key: string]: string[];
          }
        ) => {
          const filteredConfig: {
            [key: string]: McpConfig;
          } = {};
          // 遍历 mcpUse 中的所有配置键（如 mcp1）
          for (const key of Object.keys(mcpUse)) {
            if (mcpConfig[key]) {
              // 获取原始配置
              const originalConfig = mcpConfig[key];
              // 过滤工具列表，仅保留在 mcpUse 中声明的工具
              const filteredTools = originalConfig.mcpTools.filter((tool) =>
                mcpUse[key].includes(tool.name)
              );
              // 构造新的配置项（保留 mcpServerUrl 等属性）
              filteredConfig[key] = {
                ...originalConfig,
                mcpTools: filteredTools,
              };
            }
          }
          return filteredConfig;
        };

        let mcpUse: { [key: string]: McpConfig };
        if (node.data.mcpConfig && node.data.mcpUse) {
          mcpUse = filterMcpConfig(node.data.mcpConfig, node.data.mcpUse);
        } else {
          mcpUse = {};
        }

        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_BASE_URL}/sse/llm/once`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              username: user.name,
              user_message: node.data.vlmInput,
              llm_model_config: modelConfig,
              system_prompt: node.data.prompt,
              mcp_use: mcpUse,
              global_variables: globalVariables,
            }),
          }
        );

        if (!response.ok) throw new Error("Request failed");
        if (!response.body) return;
        let aiResponse = "";
        // 使用EventSourceParserStream处理流
        const eventStream = response.body
          ?.pipeThrough(new TextDecoderStream())
          .pipeThrough(new EventSourceParserStream());

        const eventReader = eventStream.getReader();
        while (true) {
          const { done, value } = (await eventReader?.read()) || {};
          if (done) break;
          const payload = JSON.parse(value.data);
          if (payload.type === "text") {
            aiResponse += payload.data;
            if (Object.entries(globalVariables).length > 0) {
              aiResponse = replaceTemplate(aiResponse, globalVariables);
            }
            updateChat(node.id, aiResponse);
          }
          if (payload.type === "token") {
            aiResponse += "\n\n Total token usage: ";
            aiResponse += payload.total_token;
            aiResponse += "\n Completion token usage: ";
            aiResponse += payload.completion_tokens;
            aiResponse += "\n Prompt token usage: ";
            aiResponse += payload.prompt_tokens;
            updateChat(node.id, aiResponse);
          }
        }
      } catch (error) {
        //console.error("Error connect:", error);
        updateChat(node.id, "Error connect:" + error);
      } finally {
        //updateOutput(node.id, "Message generated!");
        setRunTest(false);
      }
    }
  };

  return (
    <div className="overflow-auto h-full flex flex-col items-start justify-start gap-1">
      <div className="px-2 py-1 flex items-center justify-between w-full mt-1 font-medium">
        <div className="text-xl flex items-center justify-start max-w-[60%] gap-1">
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
          <div
            contentEditable
            suppressContentEditableWarning // 避免React警告
            className="focus:outline-none cursor-text overflow-auto whitespace-nowrap" // 移除聚焦时的默认轮廓
            onBlur={(e) => {
              if (e.currentTarget.innerText.length > 1) {
                return updateNodeLabel(node.id, e.currentTarget.innerText);
              } else {
                e.currentTarget.innerText = node.data.label;
              }
            }}
            onKeyDown={(e: React.KeyboardEvent<HTMLSpanElement>) => {
              if (e.key === "Enter") {
                // 按下回车时保存并退出编辑模式
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
          >
            {node.data.label}
          </div>
        </div>
        <button
          onClick={() => saveNode(node)}
          className="cursor-pointer disabled:cursor-not-allowed py-2 px-3 rounded-full hover:bg-indigo-600 hover:text-white disabled:opacity-50 flex items-center justify-center gap-1"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="size-5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m.75 12 3 3m0 0 3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
            />
          </svg>
          <span className="whitespace-nowrap">Save Node</span>
        </button>
      </div>
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
                  d="M2.25 5.25a3 3 0 0 1 3-3h13.5a3 3 0 0 1 3 3V15a3 3 0 0 1-3 3h-3v.257c0 .597.237 1.17.659 1.591l.621.622a.75.75 0 0 1-.53 1.28h-9a.75.75 0 0 1-.53-1.28l.621-.622a2.25 2.25 0 0 0 .659-1.59V18h-3a3 3 0 0 1-3-3V5.25Zm1.5 0v7.5a1.5 1.5 0 0 0 1.5 1.5h13.5a1.5 1.5 0 0 0 1.5-1.5v-7.5a1.5 1.5 0 0 0-1.5-1.5H5.25a1.5 1.5 0 0 0-1.5 1.5Z"
                  clipRule="evenodd"
                />
              </svg>
              Description
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
              onClick={(e) => {
                e.preventDefault();
                setIsEditing(!isEditing);
              }}
              className="hover:bg-indigo-600 hover:text-white cursor-pointer disabled:cursor-not-allowed py-2 px-3 rounded-full disabled:opacity-50"
            >
              {isEditing ? (
                <div className="flex items-center justify-center gap-1">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth="1.5"
                    stroke="currentColor"
                    className="size-5"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 0 1-2.25 2.25M16.5 7.5V18a2.25 2.25 0 0 0 2.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 0 0 2.25 2.25h13.5M6 7.5h3v3H6v-3Z"
                    />
                  </svg>
                  <span>Preview</span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-1">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth="1.5"
                    stroke="currentColor"
                    className="size-5"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
                    />
                  </svg>
                  <span>Edit</span>
                </div>
              )}
            </button>
          </div>
        </summary>

        {isEditing ? (
          <div
            className={`rounded-2xl shadow-lg overflow-auto w-full mb-2 p-4 bg-white`}
          >
            <textarea
              className={`mt-1 w-full px-2 py-2 border border-gray-200 rounded-xl min-h-[10vh] ${
                codeFullScreenFlow ? "max-h-[50vh]" : "max-h-[30vh]"
              } resize-none overflow-y-auto focus:outline-hidden focus:ring-2 focus:ring-indigo-500`}
              value={node.data.description || ""}
              onChange={(e) => updateDescription(node.id, e.target.value)}
              placeholder="Enter Markdown content here..."
            />
          </div>
        ) : (
          <div
            className={`rounded-2xl shadow-lg overflow-auto w-full mb-2 p-4 bg-gray-100`}
          >
            <MarkdownDisplay
              md_text={node.data.description || "No decription found"}
              message={{
                type: "text",
                content: node.data.description || "",
                from: "ai",
              }}
              showTokenNumber={true}
              isThinking={false}
            />
          </div>
        )}
      </details>
      <details className="group w-full" open>
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
                <path d="M12 .75a8.25 8.25 0 0 0-4.135 15.39c.686.398 1.115 1.008 1.134 1.623a.75.75 0 0 0 .577.706c.352.083.71.148 1.074.195.323.041.6-.218.6-.544v-4.661a6.714 6.714 0 0 1-.937-.171.75.75 0 1 1 .374-1.453 5.261 5.261 0 0 0 2.626 0 .75.75 0 1 1 .374 1.452 6.712 6.712 0 0 1-.937.172v4.66c0 .327.277.586.6.545.364-.047.722-.112 1.074-.195a.75.75 0 0 0 .577-.706c.02-.615.448-1.225 1.134-1.623A8.25 8.25 0 0 0 12 .75Z" />
                <path
                  fillRule="evenodd"
                  d="M9.013 19.9a.75.75 0 0 1 .877-.597 11.319 11.319 0 0 0 4.22 0 .75.75 0 1 1 .28 1.473 12.819 12.819 0 0 1-4.78 0 .75.75 0 0 1-.597-.876ZM9.754 22.344a.75.75 0 0 1 .824-.668 13.682 13.682 0 0 0 2.844 0 .75.75 0 1 1 .156 1.492 15.156 15.156 0 0 1-3.156 0 .75.75 0 0 1-.668-.824Z"
                  clipRule="evenodd"
                />
              </svg>
              Prompt
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
              className=" hover:bg-indigo-600 rounded-full text-base px-4 py-2 hover:text-white flex gap-1 cursor-pointer"
              onClick={configureKnowledgeDB}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="size-5 my-auto"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-11.25a.75.75 0 0 0-1.5 0v2.5h-2.5a.75.75 0 0 0 0 1.5h2.5v2.5a.75.75 0 0 0 1.5 0v-2.5h2.5a.75.75 0 0 0 0-1.5h-2.5v-2.5Z"
                  clipRule="evenodd"
                />
              </svg>
              <div>More Settings</div>
            </button>
          </div>
        </summary>
        <div className={`rounded-2xl shadow-lg overflow-auto p-3 w-full mb-2`}>
          <textarea
            className={`mt-1 w-full px-2 py-2 border border-gray-200 rounded-xl min-h-[10vh] ${
              codeFullScreenFlow ? "max-h-[50vh]" : "max-h-[30vh]"
            } resize-none overflow-y-auto focus:outline-hidden focus:ring-2 focus:ring-indigo-500`}
            placeholder={node.data.prompt}
            rows={1}
            value={node.data.prompt}
            onChange={(e) => {
              e.target.style.height = "auto";
              e.target.style.height = e.target.scrollHeight + "px";
              updatePrompt(node.id, e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.shiftKey) {
                e.preventDefault();
              }
            }}
          />
        </div>
      </details>
      <details className="group w-full" open>
        <summary className="flex items-center cursor-pointer font-medium w-full">
          <div className="py-1 px-2 flex mt-1 items-center justify-between w-full font-medium">
            <div className="flex items-center justify-start gap-1">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="size-5 my-auto"
              >
                <path d="M21.731 2.269a2.625 2.625 0 0 0-3.712 0l-1.157 1.157 3.712 3.712 1.157-1.157a2.625 2.625 0 0 0 0-3.712ZM19.513 8.199l-3.712-3.712-8.4 8.4a5.25 5.25 0 0 0-1.32 2.214l-.8 2.685a.75.75 0 0 0 .933.933l2.685-.8a5.25 5.25 0 0 0 2.214-1.32l8.4-8.4Z" />
                <path d="M5.25 5.25a3 3 0 0 0-3 3v10.5a3 3 0 0 0 3 3h10.5a3 3 0 0 0 3-3V13.5a.75.75 0 0 0-1.5 0v5.25a1.5 1.5 0 0 1-1.5 1.5H5.25a1.5 1.5 0 0 1-1.5-1.5V8.25a1.5 1.5 0 0 1 1.5-1.5h5.25a.75.75 0 0 0 0-1.5H5.25Z" />
              </svg>
              Input
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
              className=" hover:bg-indigo-600 rounded-full text-base px-3 py-2 hover:text-white flex gap-1 cursor-pointer"
              onClick={() =>
                changeChatflowInput(node.id, !node.data.isChatflowInput)
              }
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="size-5 my-auto"
              >
                <path
                  fillRule="evenodd"
                  d="M12 5.25c1.213 0 2.415.046 3.605.135a3.256 3.256 0 0 1 3.01 3.01c.044.583.077 1.17.1 1.759L17.03 8.47a.75.75 0 1 0-1.06 1.06l3 3a.75.75 0 0 0 1.06 0l3-3a.75.75 0 0 0-1.06-1.06l-1.752 1.751c-.023-.65-.06-1.296-.108-1.939a4.756 4.756 0 0 0-4.392-4.392 49.422 49.422 0 0 0-7.436 0A4.756 4.756 0 0 0 3.89 8.282c-.017.224-.033.447-.046.672a.75.75 0 1 0 1.497.092c.013-.217.028-.434.044-.651a3.256 3.256 0 0 1 3.01-3.01c1.19-.09 2.392-.135 3.605-.135Zm-6.97 6.22a.75.75 0 0 0-1.06 0l-3 3a.75.75 0 1 0 1.06 1.06l1.752-1.751c.023.65.06 1.296.108 1.939a4.756 4.756 0 0 0 4.392 4.392 49.413 49.413 0 0 0 7.436 0 4.756 4.756 0 0 0 4.392-4.392c.017-.223.032-.447.046-.672a.75.75 0 0 0-1.497-.092c-.013.217-.028.434-.044.651a3.256 3.256 0 0 1-3.01 3.01 47.953 47.953 0 0 1-7.21 0 3.256 3.256 0 0 1-3.01-3.01 47.759 47.759 0 0 1-.1-1.759L6.97 15.53a.75.75 0 0 0 1.06-1.06l-3-3Z"
                  clipRule="evenodd"
                />
              </svg>
              <div>Change Input Style</div>
            </button>
          </div>
        </summary>
        {node.data.isChatflowInput ? (
          <div
            className={`rounded-2xl shadow-lg overflow-auto p-4 w-full mb-2`}
          >
            <div className="mb-1">Use Chatflow User Input</div>
          </div>
        ) : (
          <div
            className={`rounded-2xl shadow-lg overflow-auto p-3 w-full mb-2`}
          >
            <div className="mb-1">Predefined Input:</div>
            <textarea
              className={`mt-1 w-full px-2 py-2 border border-gray-200 rounded-xl min-h-[10vh] ${
                codeFullScreenFlow ? "max-h-[50vh]" : "max-h-[30vh]"
              } resize-none overflow-y-auto focus:outline-hidden focus:ring-2 focus:ring-indigo-500`}
              placeholder={
                "Global variables in the input should be wrapped with double curly braces, e.g., {{variable}}."
              }
              rows={1}
              value={node.data.vlmInput}
              onChange={(e) => {
                e.target.style.height = "auto";
                e.target.style.height = e.target.scrollHeight + "px";
                updateVlmInput(node.id, e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.shiftKey) {
                  e.preventDefault();
                }
              }}
            />
          </div>
        )}
      </details>
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
            <button
              onClick={handleRunTest}
              disabled={runTest}
              className="cursor-pointer disabled:cursor-not-allowed py-2 px-3 rounded-full hover:bg-indigo-600 hover:text-white disabled:opacity-50 flex items-center justify-center gap-1"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="1.5"
                stroke="currentColor"
                className="size-5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z"
                />
              </svg>

              <span>Run Test</span>
            </button>
          </div>
        </summary>
        <div className={`rounded-2xl shadow-lg overflow-auto w-full mb-2 p-2`}>
          <div
            className="flex-1 overflow-y-scroll scrollbar-hide"
            style={{ overscrollBehavior: "contain" }}
          >
            {messages && messages.length > 0 ? (
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
                      modelConfig={node.data.modelConfig}
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
              <div className="px-2">
                <MarkdownDisplay
                  md_text={node.data.chat || ""}
                  message={{
                    type: "text",
                    content: node.data.chat || "",
                    from: "ai", // 消息的来源
                  }}
                  showTokenNumber={true}
                  isThinking={false}
                />
              </div>
            )}
          </div>
        </div>
        <div className="w-full flex items-center justify-between p-2 gap-2">
          <span className="whitespace-nowrap">LLM Reponse =</span>
          <div className="flex-1">
            <select
              name="addVariable"
              value={node.data.chatflowOutputVariable || ""}
              onChange={(e) =>
                changeChatflowOutputVariable(node.id, e.target.value)
              }
              className="w-full px-3 py-1 border-2 border-gray-200 rounded-xl
                focus:outline-none focus:ring-2 focus:ring-indigo-500
                disabled:opacity-50 appearance-none"
            >
              {/* 遍历 globalVariables 的 key */}
              {Object.keys(globalVariables).map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
              <option value={""}>--</option>
            </select>
          </div>
        </div>
      </details>
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
                  d="M2.25 5.25a3 3 0 0 1 3-3h13.5a3 3 0 0 1 3 3V15a3 3 0 0 1-3 3h-3v.257c0 .597.237 1.17.659 1.591l.621.622a.75.75 0 0 1-.53 1.28h-9a.75.75 0 0 1-.53-1.28l.621-.622a2.25 2.25 0 0 0 .659-1.59V18h-3a3 3 0 0 1-3-3V5.25Zm1.5 0v7.5a1.5 1.5 0 0 0 1.5 1.5h13.5a1.5 1.5 0 0 0 1.5-1.5v-7.5a1.5 1.5 0 0 0-1.5-1.5H5.25a1.5 1.5 0 0 0-1.5 1.5Z"
                  clipRule="evenodd"
                />
              </svg>
              Output
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
              onClick={() => {
                updateDebug(node.id, node.data.debug ? !node.data.debug : true);
              }}
              disabled={runTest}
              className={`${
                node.data.debug
                  ? "bg-red-500 text-white hover:bg-red-700"
                  : "hover:bg-indigo-600 hover:text-white"
              } cursor-pointer disabled:cursor-not-allowed py-2 px-3 rounded-full disabled:opacity-50 flex items-center justify-center gap-1`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="1.5"
                stroke="currentColor"
                className="size-5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 12.75c1.148 0 2.278.08 3.383.237 1.037.146 1.866.966 1.866 2.013 0 3.728-2.35 6.75-5.25 6.75S6.75 18.728 6.75 15c0-1.046.83-1.867 1.866-2.013A24.204 24.204 0 0 1 12 12.75Zm0 0c2.883 0 5.647.508 8.207 1.44a23.91 23.91 0 0 1-1.152 6.06M12 12.75c-2.883 0-5.647.508-8.208 1.44.125 2.104.52 4.136 1.153 6.06M12 12.75a2.25 2.25 0 0 0 2.248-2.354M12 12.75a2.25 2.25 0 0 1-2.248-2.354M12 8.25c.995 0 1.971-.08 2.922-.236.403-.066.74-.358.795-.762a3.778 3.778 0 0 0-.399-2.25M12 8.25c-.995 0-1.97-.08-2.922-.236-.402-.066-.74-.358-.795-.762a3.734 3.734 0 0 1 .4-2.253M12 8.25a2.25 2.25 0 0 0-2.248 2.146M12 8.25a2.25 2.25 0 0 1 2.248 2.146M8.683 5a6.032 6.032 0 0 1-1.155-1.002c.07-.63.27-1.222.574-1.747m.581 2.749A3.75 3.75 0 0 1 15.318 5m0 0c.427-.283.815-.62 1.155-.999a4.471 4.471 0 0 0-.575-1.752M4.921 6a24.048 24.048 0 0 0-.392 3.314c1.668.546 3.416.914 5.223 1.082M19.08 6c.205 1.08.337 2.187.392 3.314a23.882 23.882 0 0 1-5.223 1.082"
                />
              </svg>

              <span>Debug</span>
            </button>
          </div>
        </summary>
        <div
          className={`rounded-2xl shadow-lg overflow-auto w-full mb-2 p-4 bg-gray-100`}
        >
          <MarkdownDisplay
            md_text={node.data.output || ""}
            message={{
              type: "text",
              content: node.data.output || "",
              from: "ai", // 消息的来源
            }}
            showTokenNumber={true}
            isThinking={false}
          />
        </div>
      </details>
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
                  d="M4.804 21.644A6.707 6.707 0 0 0 6 21.75a6.721 6.721 0 0 0 3.583-1.029c.774.182 1.584.279 2.417.279 5.322 0 9.75-3.97 9.75-9 0-5.03-4.428-9-9.75-9s-9.75 3.97-9.75 9c0 2.409 1.025 4.587 2.674 6.192.232.226.277.428.254.543a3.73 3.73 0 0 1-.814 1.686.75.75 0 0 0 .44 1.223ZM8.25 10.875a1.125 1.125 0 1 0 0 2.25 1.125 1.125 0 0 0 0-2.25ZM10.875 12a1.125 1.125 0 1 1 2.25 0 1.125 1.125 0 0 1-2.25 0Zm4.875-1.125a1.125 1.125 0 1 0 0 2.25 1.125 1.125 0 0 0 0-2.25Z"
                  clipRule="evenodd"
                />
              </svg>
              ChatFlow
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
              onClick={() => {
                setShowMcpConfig(true);
              }}
              disabled={runTest}
              className={`
                 hover:bg-indigo-600 hover:text-white
              } cursor-pointer disabled:cursor-not-allowed py-2 px-3 rounded-full disabled:opacity-50 flex items-center justify-center gap-1`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="1.5"
                stroke="currentColor"
                className="size-5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437 1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008Z"
                />
              </svg>
              <span>MCP Tools</span>
            </button>
          </div>
        </summary>
        <div className={`rounded-2xl shadow-lg overflow-auto p-3 w-full mb-2`}>
          <div className="relative flex flex-col items-start justify-center gap-2">
            {" "}
            <label className="w-full overflow-auto relative inline-flex items-center group p-2 border border-gray-200 rounded-xl hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={node.data.isChatflowInput}
                onChange={() =>
                  changeChatflowInput(node.id, !node.data.isChatflowInput)
                }
                className="shrink-0 appearance-none h-5 w-5 border-2 border-gray-300 rounded-lg transition-colors checked:bg-indigo-500 checked:border-indigo-500 focus:outline-hidden focus:ring-2 focus:ring-indigo-200"
              />
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="absolute size-4 text-white shrink-0"
              >
                <path
                  fillRule="evenodd"
                  d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
                  clipRule="evenodd"
                  transform="translate(2.8, 0.2)"
                />
              </svg>
              <div className="ml-2 flex gap-1 items-center">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="size-4 shrink-0 my-auto"
                >
                  <path d="M21.731 2.269a2.625 2.625 0 0 0-3.712 0l-1.157 1.157 3.712 3.712 1.157-1.157a2.625 2.625 0 0 0 0-3.712ZM19.513 8.199l-3.712-3.712-8.4 8.4a5.25 5.25 0 0 0-1.32 2.214l-.8 2.685a.75.75 0 0 0 .933.933l2.685-.8a5.25 5.25 0 0 0 2.214-1.32l8.4-8.4Z" />
                  <path d="M5.25 5.25a3 3 0 0 0-3 3v10.5a3 3 0 0 0 3 3h10.5a3 3 0 0 0 3-3V13.5a.75.75 0 0 0-1.5 0v5.25a1.5 1.5 0 0 1-1.5 1.5H5.25a1.5 1.5 0 0 1-1.5-1.5V8.25a1.5 1.5 0 0 1 1.5-1.5h5.25a.75.75 0 0 0 0-1.5H5.25Z" />
                </svg>
                <span>Set As Chatflow User Input</span>
              </div>
            </label>
            <label className="w-full overflow-auto relative inline-flex items-center group p-2 border border-gray-200 rounded-xl hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={node.data.isChatflowOutput}
                onChange={() => {
                  if (node.data.isChatflowOutput) {
                    changeUseChatHistory(node.id, false);
                  }
                  changeChatflowOutput(node.id, !node.data.isChatflowOutput);
                }}
                className="shrink-0 appearance-none h-5 w-5 border-2 border-gray-300 rounded-lg transition-colors checked:bg-indigo-500 checked:border-indigo-500 focus:outline-hidden focus:ring-2 focus:ring-indigo-200"
              />
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="absolute size-4 text-white shrink-0"
              >
                <path
                  fillRule="evenodd"
                  d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
                  clipRule="evenodd"
                  transform="translate(2.8, 0.2)"
                />
              </svg>
              <div className="ml-2 flex gap-1 items-center">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="size-4"
                >
                  <path
                    fillRule="evenodd"
                    d="M4.804 21.644A6.707 6.707 0 0 0 6 21.75a6.721 6.721 0 0 0 3.583-1.029c.774.182 1.584.279 2.417.279 5.322 0 9.75-3.97 9.75-9 0-5.03-4.428-9-9.75-9s-9.75 3.97-9.75 9c0 2.409 1.025 4.587 2.674 6.192.232.226.277.428.254.543a3.73 3.73 0 0 1-.814 1.686.75.75 0 0 0 .44 1.223ZM8.25 10.875a1.125 1.125 0 1 0 0 2.25 1.125 1.125 0 0 0 0-2.25ZM10.875 12a1.125 1.125 0 1 1 2.25 0 1.125 1.125 0 0 1-2.25 0Zm4.875-1.125a1.125 1.125 0 1 0 0 2.25 1.125 1.125 0 0 0 0-2.25Z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>Set As Chatflow AI Response</span>
              </div>
            </label>
            {node.data.isChatflowOutput && (
              <label className="w-full overflow-auto relative inline-flex items-center group p-2 border border-gray-200 rounded-xl hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={node.data.useChatHistory}
                  onChange={() =>
                    changeUseChatHistory(node.id, !node.data.useChatHistory)
                  }
                  className="shrink-0 appearance-none h-5 w-5 border-2 border-gray-300 rounded-lg transition-colors checked:bg-indigo-500 checked:border-indigo-500 focus:outline-hidden focus:ring-2 focus:ring-indigo-200"
                />
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="absolute size-4 text-white shrink-0"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
                    clipRule="evenodd"
                    transform="translate(2.8, 0.2)"
                  />
                </svg>
                <div className="ml-2 flex gap-1 items-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="size-4 shrink-0"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 1c3.866 0 7 1.79 7 4s-3.134 4-7 4-7-1.79-7-4 3.134-4 7-4Zm5.694 8.13c.464-.264.91-.583 1.306-.952V10c0 2.21-3.134 4-7 4s-7-1.79-7-4V8.178c.396.37.842.688 1.306.953C5.838 10.006 7.854 10.5 10 10.5s4.162-.494 5.694-1.37ZM3 13.179V15c0 2.21 3.134 4 7 4s7-1.79 7-4v-1.822c-.396.37-.842.688-1.306.953-1.532.875-3.548 1.369-5.694 1.369s-4.162-.494-5.694-1.37A7.009 7.009 0 0 1 3 13.179Z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>Use Conversation Memory</span>
                </div>
              </label>
            )}
          </div>
        </div>
      </details>
      {createPortal(
        <McpConfigComponent
          node={node}
          visible={showMcpConfig}
          setVisible={setShowMcpConfig}
        />,
        document.body
      )}
      {createPortal(
        <KnowledgeConfigModal
          node={node}
          visible={showConfigModal}
          setVisible={setShowConfigModal}
          onSave={handleSaveConfig}
        />,
        document.body
      )}
    </div>
  );
};

export default VlmNodeComponent;
