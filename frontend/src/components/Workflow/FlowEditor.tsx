// components/FlowEditor.tsx
import {
  useCallback,
  useRef,
  useEffect,
  Dispatch,
  SetStateAction,
  useState,
  useMemo,
} from "react";
import {
  ReactFlow,
  addEdge,
  MiniMap,
  Controls,
  Background,
  applyNodeChanges,
  applyEdgeChanges,
  type Connection,
  NodeChange,
  EdgeChange,
} from "@xyflow/react";
import {
  CustomNode,
  nodeTypesInfo,
  NodeTypeKey,
  CustomEdge,
  WorkflowAll,
  KnowledgeBase,
  ModelConfig,
  Message,
  FileUsed,
  FileRespose,
  McpConfig,
} from "@/types/types";
import Cookies from "js-cookie";
import { useFlowStore } from "@/stores/flowStore";
import CustomEdgeComponent from "@/components/Workflow/CustomEdge";
import CustomNodeComponent from "@/components/Workflow/CustomNode";
import "@xyflow/react/dist/base.css";
import ConnectionLine from "@/components/Workflow/ConnectionLine";
import FunctionNodeComponent from "@/components/Workflow/NodeSettings/FunctionNode";
import StartNodeComponent from "@/components/Workflow/NodeSettings/StartNode";
import { useAuthStore } from "@/stores/authStore";
import { v4 as uuidv4 } from "uuid";
import {
  cancelWorkflow,
  createWorkflow,
  deleteCustomNodes,
  executeWorkflow,
  getCustomNodes,
  saveCustomNodes,
} from "@/lib/api/workflowApi";
import { useGlobalStore } from "@/stores/WorkflowVariableStore";
import ConditionNodeComponent from "@/components/Workflow/NodeSettings/ConditionNode";
import LoopNodeComponent from "@/components/Workflow/NodeSettings/LoopNode";
import { EventSourceParserStream } from "eventsource-parser/stream";
import VlmNodeComponent from "@/components/Workflow/NodeSettings/VlmNode";
import {
  deleteTempKnowledgeBase,
  getAllKnowledgeBase,
} from "@/lib/api/knowledgeBaseApi";
import { getAllModelConfig } from "@/lib/api/configApi";
import ConfirmAlert from "../ConfirmAlert";
import NodeTypeSelector from "./NodeTypeSelector";
import SaveCustomNode from "./SaveNode";
import WorkflowOutputComponent from "./NodeSettings/WorkflowOutput";
import useChatStore from "@/stores/chatStore";
import { getFileExtension } from "@/utils/file";
import { createChatflow } from "@/lib/api/chatflowApi";
import ConfirmDialog from "../ConfirmDialog";
import { replaceTemplate } from "@/utils/convert";

const getId = (type: string): string => `node_${type}_${uuidv4()}`;
interface FlowEditorProps {
  workFlow: WorkflowAll;
  setFullScreenFlow: Dispatch<SetStateAction<boolean>>;
  fullScreenFlow: boolean;
}

const splitFirstColon = (str: string) => {
  const index = str.indexOf(":");
  if (index === -1) return [str, ""]; // 没有冒号时返回原字符串和空字符串
  return [str.substring(0, index), str.substring(index + 1)];
};

const FlowEditor: React.FC<FlowEditorProps> = ({
  workFlow,
  setFullScreenFlow,
  fullScreenFlow,
}) => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [codeFullScreenFlow, setCodeFullScreenFlow] = useState<boolean>(false);
  const { user } = useAuthStore();
  const {
    globalVariables,
    setGlobalVariables,
    reset,
    setGlobalDebugVariables,
    globalDebugVariables,
    DockerImageUse,
  } = useGlobalStore();
  const {
    nodes,
    edges,
    history,
    future,
    selectedNodeId,
    setSelectedEdgeId,
    setSelectedNodeId,
    setNodes,
    setEdges,
    pushHistory,
    undo,
    redo,
    deleteNode,
    deleteEdge,
    setSelectedType,
    getConditionCount,
    updateConditions,
    removeCondition,
    updateOutput,
    updateChat,
    updateConditionCount,
    updateStatus,
    updateVlmModelConfig,
    updateVlmInput,
  } = useFlowStore();
  const [taskId, setTaskId] = useState("");
  const [running, setRunning] = useState(false);
  const [resumeDebugTaskId, setResumeDebugTaskId] = useState("");
  const [resumeInputTaskId, setResumeInputTaskId] = useState("");
  const [showAlert, setShowAlert] = useState(false);
  const [workflowMessage, setWorkflowMessage] = useState("");
  const [workflowStatus, setWorkflowStatus] = useState("");
  const [customNodes, setCustomNodes] = useState<{ [key: string]: CustomNode }>(
    {}
  );
  const [showAddNode, setShowAddNode] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [newNodeName, setNewNodeName] = useState("");
  const [newCustomNode, setNewCustomNode] = useState<CustomNode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [canceling, setCanceling] = useState(false);
  const [showOutput, setShowOutput] = useState(false);
  const [messages, setMessages] = useState<{ [key: string]: Message[] }>({});
  const [sendInputDisabled, setSendInputDisabled] = useState(true);
  const [sendingFiles, setSendingFiles] = useState<FileRespose[]>([]);
  const [tempBaseId, setTempBaseId] = useState<string>(""); //后台用来存放上传文件的临时知识库
  const [cleanTempBase, setCleanTempBase] = useState<boolean>(false);
  const [currentInputNodeId, setCurrentInputNodeId] = useState<string>(); //后台用来存放上传文件的临时知识库
  const [fileMessages, setFileMessages] = useState<Message[]>([]); //后台用来存放上传文件的临时知识库
  const { chatflowId, setChatflowId } = useChatStore();
  const [showConfirmClear, setShowConfirmClear] = useState(false);
  const [saveImage, setSaveImage] = useState<boolean>(false);
  const [saveImageName, setSaveImageName] = useState<string>("");
  const [saveImageTag, setSaveImageTag] = useState<string>("");
  const [saveStatus, setSaveStatus] = useState<{
    visible: boolean;
    message: string;
    type: "success" | "error";
  }>({ visible: false, message: "", type: "success" });
  const [refreshDockerImages, setRefreshDockerImages] =
    useState<boolean>(false);

  const [runningChatflowLLMNodes, setRunningChatflowLLMNodes] = useState<
    CustomNode[]
  >([]);
  //这个是按顺序每次收到的消息，而messages是归纳到每个节点里，如messages{a:[1,3],b:[2]}，输出循环顺序a,b,a,则eachMessages[1,2,3]
  const [eachMessages, setEachMessages] = useState<{
    [key: string]: Message[];
  }>({});
  const countRef = useRef(1);
  const countListRef = useRef<string[]>([]);
  // 使用 useMemo 优化查找
  const currentNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId),
    [nodes, selectedNodeId] // 依赖精准控制
  );

  const eachMessagesRef = useRef(eachMessages);
  const variableReturn = useRef<{
    [key: string]: Message[];
  }>({});

  const confirmClear = () => {
    if (showConfirmClear) {
      setNodes([]);
      setEdges([]);
      reset();
      setShowConfirmClear(false); // 关闭对话框
    }
  };

  const cancelClear = () => {
    if (showConfirmClear) {
      setShowConfirmClear(false); // 关闭对话框
    }
  };

  useEffect(() => {
    const cleanTempKnowledgeBase = async () => {
      if (user?.name) {
        try {
          setCleanTempBase(true);
          const response = await deleteTempKnowledgeBase(user.name);
        } catch (error) {
          console.error("Error clean temp knowledge base:", error);
        } finally {
          setCleanTempBase(false);
        }
      }
    };
    cleanTempKnowledgeBase();
  }, [user?.name]); // 添加 user?.name 作为依赖

  useEffect(() => {
    setSendingFiles([]);
    setTempBaseId("");
  }, [chatflowId]);

  const handleNewChatflow = useCallback(() => {
    setChatflowId("");
  }, [setChatflowId]);

  //刷新页面
  useEffect(() => {
    // 从 store 获取最新状态
    const { history, nodes } = useFlowStore.getState();

    if (history.length === 0) {
      pushHistory();
    }
    handleNewChatflow();
    setMessages({});
    setEachMessages({});
    setSendInputDisabled(true);
    setResumeDebugTaskId("");
    setResumeInputTaskId("");
    countListRef.current = [];
    setCurrentInputNodeId(undefined);
    setRunningChatflowLLMNodes([]);
    countRef.current = 1;
    nodes.forEach((node) => {
      if (node.data.nodeType == "vlm") {
        updateOutput(
          node.id,
          "This area displays the Node output during workflow execution."
        );
      } else {
        updateOutput(node.id, "Await for running...");
      }
      updateStatus(node.id, "init");
      if (node.data.nodeType == "vlm") {
        updateChat(
          node.id,
          'To extract global variables from the output, ensure prompt LLM/VLM to output them with json format, e.g.,\n {"output":"AIoutput"}.\n\nAdditionally, you can directly assign the LLM response to a global variable below:'
        );
      } else {
        updateChat(node.id, "Await for running...");
      }
    });
  }, [
    workFlow,
    handleNewChatflow,
    pushHistory,
    updateChat,
    updateOutput,
    updateStatus,
  ]); // 只需要依赖 workFlow

  // 刷新按钮的处理函数
  const handleRefresh = () => {
    // 与上面相同的刷新逻辑
    if (history.length === 0) {
      pushHistory();
    }
    handleNewChatflow();
    setMessages({});
    setEachMessages({});
    setSendInputDisabled(true);
    setResumeDebugTaskId("");
    setResumeInputTaskId("");
    countListRef.current = [];
    setCurrentInputNodeId(undefined);
    setRunningChatflowLLMNodes([]);
    countRef.current = 1;
    nodes.forEach((node) => {
      if (node.data.nodeType == "vlm") {
        updateOutput(
          node.id,
          "This area displays the Node output during workflow execution."
        );
      } else {
        updateOutput(node.id, "Await for running...");
      }
      updateStatus(node.id, "init");
      if (node.data.nodeType == "vlm") {
        updateChat(
          node.id,
          'To extract global variables from the output, ensure prompt LLM/VLM to output them with json format, e.g.,\n {"output":"AIoutput"}.\n\nAdditionally, you can directly assign the LLM response to a global variable below:'
        );
      } else {
        updateChat(node.id, "Await for running...");
      }
    });
    // // 可选：显示成功消息
    // setShowAlert(true);
    // setWorkflowMessage("Workflow refreshed!");
    // setWorkflowStatus("success");
  };

  useEffect(() => {
    //fetchChatflowHistory();
    if (chatflowId === "") {
      const uniqueId = uuidv4();
      setChatflowId(user?.name + "_" + uniqueId);
    }
  }, [user?.name, chatflowId, setChatflowId]); // Added fetchChatHistory fetchChatHistory

  useEffect(() => {
    //fetchChatflowHistory();
    setShowOutput(false);
  }, [workFlow]); // Added fetchChatHistory fetchChatHistory

  // 初始化自定义节点
  const fetchAllCustomNodes = useCallback(async () => {
    if (user?.name) {
      try {
        const response = await getCustomNodes(user.name);
        const reponseNodes: { [key: string]: CustomNode } = response.data;
        setCustomNodes(reponseNodes);
      } catch (error) {
        console.error("Error fetching custom nodes:", error);
      }
    }
  }, [user?.name]); // Add dependencies

  useEffect(() => {
    fetchAllCustomNodes();
  }, [user?.name, fetchAllCustomNodes]); // Add fetchAllWorkflow

  const handleDeleteCustomNode = async (custom_node_name: string) => {
    if (user?.name) {
      try {
        await deleteCustomNodes(user.name, custom_node_name);
        fetchAllCustomNodes();
      } catch (error) {
        console.error("Error fetching custom nodes:", error);
      }
    }
  };

  const checkChatflowInput = () => {
    if (countListRef.current.length > 0) {
      const lastNodeMessages =
        eachMessagesRef.current[
          countListRef.current[countListRef.current.length - 1]
        ];
      if (lastNodeMessages.length > 0) {
        if (lastNodeMessages[lastNodeMessages.length - 1].from === "user") {
          setWorkflowMessage("错误: 连续的输入节点");
          setWorkflowStatus("error");
          setShowAlert(true);
          //eventReader.cancel();
          return false;
        }
      }
    }
    return true;
  };

  const checkChatflowOutput = () => {
    if (countListRef.current.length > 0) {
      const lastNodeMessages =
        eachMessagesRef.current[
          countListRef.current[countListRef.current.length - 1]
        ];
      if (lastNodeMessages.length > 0) {
        if (lastNodeMessages[lastNodeMessages.length - 1].from === "ai") {
          setWorkflowMessage("错误: 连续的输出节点");
          setWorkflowStatus("error");
          setShowAlert(true);
          //eventReader.cancel();
          return false;
        }
      }
    } else {
      setWorkflowMessage("输出节点之前找不到输入节点！");
      setWorkflowStatus("error");
      setShowAlert(true);
      //   eventReader.cancel();
      return false;
    }
    return true;
  };

  const nodeStatesRef = useRef(
    new Map<
      number,
      {
        aiMessage: string;
        aiThinking: string;
        messageId: string;
        total_token: number;
        completion_tokens: number;
        prompt_tokens: number;
        file_used: any[];
        vlmNewLoop: boolean;
      }
    >()
  );

  // 只将不稳定的值放入 ref
  const unstableDependenciesRef = useRef({
    fileMessages,
    globalDebugVariables,
    nodes,
    selectedNodeId,
  });

  // 更新不稳定的依赖项
  useEffect(() => {
    unstableDependenciesRef.current = {
      fileMessages,
      globalDebugVariables,
      nodes,
      selectedNodeId,
    };
  });

  useEffect(() => {
    if (taskId !== "") {
      setResumeDebugTaskId("");
      setResumeInputTaskId("");

      // 从 ref 中获取不稳定的最新值
      const { fileMessages, globalDebugVariables, nodes, selectedNodeId } =
        unstableDependenciesRef.current;

      const workFlowSSE = async () => {
        if (user?.name) {
          const token = Cookies.get("token"); // 确保已引入cookie库
          try {
            const response = await fetch(
              `${process.env.NEXT_PUBLIC_API_BASE_URL}/sse/workflow/${user.name}/${taskId}`,
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
              //处理事件数据
              if (payload.event === "workflow") {
                if (payload.workflow.status == "failed") {
                  const errorNode = splitFirstColon(payload.workflow.error);
                  const errorNodeId = errorNode[0];
                  const errorNodeMsg = splitFirstColon(errorNode[1])[1];
                  updateOutput(errorNodeId, errorNodeMsg);
                  updateStatus(errorNodeId, "failed");
                  setSelectedNodeId(errorNodeId);
                }
                if (
                  [
                    "completed",
                    "failed",
                    "pause",
                    "canceled",
                    "vlm_input",
                  ].includes(payload.workflow.status)
                ) {
                  if (payload.workflow.status === "completed") {
                    setWorkflowStatus("success");
                    setWorkflowMessage("Execution Succeeded");
                    setShowAlert(true);
                  } else if (payload.workflow.status === "pause") {
                    setWorkflowMessage("Debug Pause!");
                    setWorkflowStatus("success");
                    setShowAlert(true);
                  } else if (payload.workflow.status === "canceled") {
                    setWorkflowMessage("Workflow canceled by user!");
                    setWorkflowStatus("error");
                    setShowAlert(true);
                  } else if (payload.workflow.status === "vlm_input") {
                    if (selectedNodeId) {
                      setShowOutput(true);
                      setSelectedNodeId(null);
                      setSelectedEdgeId(null);
                    } else {
                      setShowOutput(true);
                    }
                    setSendInputDisabled(false);
                    // setWorkflowMessage("Please send question to AI!");
                    // setWorkflowStatus("success");
                  } else {
                    const errorMessage = payload.workflow.error;
                    setWorkflowMessage(errorMessage);
                    setWorkflowStatus("error");
                    setShowAlert(true);
                  }
                  eventReader.cancel();
                  //break;
                }
              } else if (payload.event === "node") {
                if (payload.node.status === true) {
                  if (payload.node.result !== '""') {
                    const resultList: any[] = JSON.parse(payload.node.result);
                    let result: string;
                    if (resultList.length > 1) {
                      result = resultList
                        .map(
                          (item, index) =>
                            `#### Global Loop ${index + 1}:\n${item.result}\n`
                        )
                        .join("\n");
                    } else {
                      result = resultList[0].result;
                    }
                    updateOutput(payload.node.id, result);
                  } else {
                    updateOutput(payload.node.id, "Node running success!");
                  }
                  if (payload.node.variables !== '""') {
                    const variables = JSON.parse(payload.node.variables);
                    setGlobalDebugVariables(variables);
                    variableReturn.current = variables;
                  }
                  updateStatus(payload.node.id, "ok");
                } else if (payload.node.status === "running") {
                  updateStatus(payload.node.id, "running");
                } else if (payload.node.status === "pause") {
                  setResumeDebugTaskId(taskId);
                  updateStatus(payload.node.id, "pause");
                  setSelectedNodeId(payload.node.id);
                } else if (payload.node.status === "vlm_input") {
                  setResumeInputTaskId(taskId);
                  updateStatus(payload.node.id, "input");
                  setCurrentInputNodeId(payload.node.id);
                } else if (payload.node.status === "vlm_input_debug") {
                  setResumeInputTaskId(taskId);
                  setResumeDebugTaskId(taskId);
                  updateStatus(payload.node.id, "running");
                  setCurrentInputNodeId(payload.node.id);
                } else if (payload.node.status === false) {
                  updateStatus(payload.node.id, "init");
                }
              } else if (
                payload.event === "ai_chunk" ||
                payload.event === "mcp"
              ) {
                const nodeId = payload.ai_chunk.id; // 获取节点ID
                const aiChunkResult = JSON.parse(payload.ai_chunk.result);
                // 获取或初始化该节点的状态
                let state = nodeStatesRef.current.get(countRef.current);
                const nodeToAdd = nodes.find((node) => node.id === nodeId);
                if (!state) {
                  state = {
                    aiMessage: "",
                    aiThinking: "",
                    messageId: "",
                    total_token: 0,
                    completion_tokens: 0,
                    prompt_tokens: 0,
                    file_used: [],
                    vlmNewLoop: true,
                  };
                  setRunningChatflowLLMNodes((prev) => {
                    return nodeToAdd ? [...prev, nodeToAdd] : prev;
                  });
                }

                if (aiChunkResult.type === "file_used") {
                  if (payload.event === "ai_chunk") {
                    state.file_used = aiChunkResult.data; // 自动处理原始换行符
                    state.messageId = aiChunkResult.message_id;
                  }
                }
                if (aiChunkResult.type === "thinking") {
                  state.aiThinking += aiChunkResult.data; // 自动处理原始换行符
                  state.messageId = aiChunkResult.message_id;
                }

                if (aiChunkResult.type === "text") {
                  if (payload.event === "mcp") {
                    state.aiThinking += aiChunkResult.data; // 自动处理原始换行符
                    state.messageId = aiChunkResult.message_id;
                  } else {
                    state.aiMessage += aiChunkResult.data; // 自动处理原始换行符
                    if (Object.entries(globalDebugVariables).length > 0) {
                      state.aiMessage = replaceTemplate(
                        state.aiMessage,
                        variableReturn.current
                      );
                    }
                    state.messageId = aiChunkResult.message_id;
                  }
                }

                if (aiChunkResult.type === "token") {
                  state.total_token += aiChunkResult.total_token;
                  state.completion_tokens += aiChunkResult.completion_tokens;
                  state.prompt_tokens += aiChunkResult.prompt_tokens;
                }

                const currentCount = countRef.current;
                if (aiChunkResult !== '""') {
                  //if （首次循环）
                  // else （其他循环 if（ai消息正常更新）
                  //                else （aiChunkResult.type === "token"时额外更新知识库引用 ））
                  //首次循环
                  if (state.vlmNewLoop) {
                    let newFileMessages: Message[] = [];
                    state.vlmNewLoop = false;
                    if (nodeToAdd?.data.isChatflowInput) {
                      newFileMessages = fileMessages;
                    }

                    const newMessage: Message = {
                      type: "text" as const,
                      content: replaceTemplate(
                        nodes.find((node) => node.id === nodeId)?.data
                          .vlmInput || "",
                        variableReturn.current
                      ),
                      from: "user" as const,
                    };

                    setMessages((prev) => {
                      const nodeMessages = prev[nodeId] || [];

                      // 直接创建最终AI消息
                      const aiMessage: Message = {
                        type: "text" as const,
                        content: state.aiMessage, // 直接使用最终内容
                        from: "ai" as const,
                        thinking: state.aiThinking,
                        messageId: state.messageId || "",
                        token_number: {
                          total_token: state.total_token,
                          completion_tokens: state.completion_tokens,
                          prompt_tokens: state.prompt_tokens,
                        },
                      };

                      return {
                        ...prev,
                        [nodeId]: [
                          ...nodeMessages,
                          ...newFileMessages,
                          newMessage,
                          aiMessage, // 直接添加完整消息对象
                        ],
                      };
                    });

                    if (nodeToAdd?.data.isChatflowInput) {
                      if (!checkChatflowInput()) {
                        updateStatus(nodeToAdd.id, "failed");
                        eventReader.cancel();
                      }

                      if (nodeToAdd?.data.isChatflowOutput) {
                        setEachMessages((prev) => {
                          // 直接创建最终AI消息
                          const aiMessage: Message = {
                            type: "text" as const,
                            content: state.aiMessage, // 直接使用最终内容
                            from: "ai" as const,
                            thinking: state.aiThinking,
                            messageId: state.messageId || "",
                            token_number: {
                              total_token: state.total_token,
                              completion_tokens: state.completion_tokens,
                              prompt_tokens: state.prompt_tokens,
                            },
                          };
                          eachMessagesRef.current = {
                            ...prev,
                            [currentCount.toString()]: [
                              ...newFileMessages,
                              newMessage,
                              aiMessage, // 直接添加完整消息对象
                            ],
                          };
                          return {
                            ...prev,
                            [currentCount.toString()]: [
                              ...newFileMessages,
                              newMessage,
                              aiMessage, // 直接添加完整消息对象
                            ],
                          };
                        });
                      } else {
                        setEachMessages((prev) => {
                          eachMessagesRef.current = {
                            ...prev,
                            [currentCount.toString()]: [
                              ...newFileMessages,
                              newMessage,
                            ],
                          };
                          return {
                            ...prev,
                            [currentCount.toString()]: [
                              ...newFileMessages,
                              newMessage,
                            ],
                          };
                        });
                      }
                      if (
                        !countListRef.current.includes(
                          countRef.current.toString()
                        )
                      ) {
                        countListRef.current.push(countRef.current.toString());
                      }
                    } else {
                      if (nodeToAdd?.data.isChatflowOutput) {
                        if (!checkChatflowOutput()) {
                          updateStatus(nodeToAdd.id, "failed");
                          eventReader.cancel();
                        }
                        setEachMessages((prev) => {
                          // 直接创建最终AI消息
                          const aiMessage: Message = {
                            type: "text" as const,
                            content: state.aiMessage, // 直接使用最终内容
                            from: "ai" as const,
                            thinking: state.aiThinking,
                            messageId: state.messageId || "",
                            token_number: {
                              total_token: state.total_token,
                              completion_tokens: state.completion_tokens,
                              prompt_tokens: state.prompt_tokens,
                            },
                          };
                          eachMessagesRef.current = {
                            ...prev,
                            [currentCount.toString()]: [
                              aiMessage, // 直接添加完整消息对象
                            ],
                          };
                          return {
                            ...prev,
                            [currentCount.toString()]: [
                              aiMessage, // 直接添加完整消息对象
                            ],
                          };
                        });
                        if (
                          !countListRef.current.includes(
                            countRef.current.toString()
                          )
                        ) {
                          countListRef.current.push(
                            countRef.current.toString()
                          );
                        }
                      }
                    }
                    // 更新状态存储
                    nodeStatesRef.current.set(countRef.current, state);
                  } else {
                    //ai消息正常更新
                    if (aiChunkResult.type !== "token") {
                      // 使用函数式更新确保基于最新状态
                      setMessages((prev) => {
                        const nodeMessages = prev[nodeId] || [];
                        const lastIndex = nodeMessages.length - 1;

                        const updatedMessages = [...nodeMessages];
                        updatedMessages[lastIndex] = {
                          ...updatedMessages[lastIndex],
                          content: state.aiMessage,
                          thinking: state.aiThinking,
                          messageId: state.messageId ? state.messageId : "",
                          token_number: {
                            total_token: state.total_token,
                            completion_tokens: state.completion_tokens,
                            prompt_tokens: state.prompt_tokens,
                          },
                        };
                        return { ...prev, [nodeId]: updatedMessages };
                      });
                      if (nodeToAdd?.data.isChatflowOutput) {
                        setEachMessages((prev) => {
                          const nodeMessages = prev[currentCount.toString()];
                          const lastIndex = nodeMessages.length - 1;

                          const updatedMessages = [...nodeMessages];
                          updatedMessages[lastIndex] = {
                            ...updatedMessages[lastIndex],
                            content: state.aiMessage,
                            thinking: state.aiThinking,
                            messageId: state.messageId ? state.messageId : "",
                            token_number: {
                              total_token: state.total_token,
                              completion_tokens: state.completion_tokens,
                              prompt_tokens: state.prompt_tokens,
                            },
                          };
                          eachMessagesRef.current = {
                            ...prev,
                            [currentCount.toString()]: updatedMessages,
                          };
                          return {
                            ...prev,
                            [currentCount.toString()]: updatedMessages,
                          };
                        });
                        if (
                          !countListRef.current.includes(
                            countRef.current.toString()
                          )
                        ) {
                          countListRef.current.push(
                            countRef.current.toString()
                          );
                        }
                      }
                    } else if (payload.event === "ai_chunk") {
                      // 额外更新知识库引用
                      setMessages((prev) => {
                        const nodeMessages = prev[nodeId] || [];
                        const lastIndex = nodeMessages.length - 1;

                        const updatedMessages = [...nodeMessages];
                        updatedMessages[lastIndex] = {
                          ...updatedMessages[lastIndex],
                          content: state.aiMessage,
                          thinking: state.aiThinking,
                          messageId: state.messageId ? state.messageId : "",
                          token_number: {
                            total_token: state.total_token,
                            completion_tokens: state.completion_tokens,
                            prompt_tokens: state.prompt_tokens,
                          },
                        };

                        const referenceMessages = [
                          ...state.file_used.map((file, index) => {
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
                              type: "baseFile" as const,
                              content,
                              messageId: state.messageId ? state.messageId : "",
                              imageMinioUrl: file.image_url,
                              fileName: file.file_name,
                              baseId: file.knowledge_db_id,
                              minioUrl: file.file_url,
                              score: file.score,
                              from: "ai" as const,
                              ...additionalProps,
                            };
                          }),
                        ];
                        return {
                          ...prev,
                          [nodeId]: updatedMessages.concat(referenceMessages),
                        };
                      });

                      if (nodeToAdd?.data.isChatflowOutput) {
                        setEachMessages((prev) => {
                          const nodeMessages = prev[currentCount.toString()];
                          const lastIndex = nodeMessages.length - 1;

                          const updatedMessages = [...nodeMessages];
                          updatedMessages[lastIndex] = {
                            ...updatedMessages[lastIndex],
                            content: state.aiMessage,
                            thinking: state.aiThinking,
                            messageId: state.messageId ? state.messageId : "",
                            token_number: {
                              total_token: state.total_token,
                              completion_tokens: state.completion_tokens,
                              prompt_tokens: state.prompt_tokens,
                            },
                          };
                          const referenceMessage = [
                            ...state.file_used.map((file, index) => {
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
                                type: "baseFile" as const,
                                content,
                                messageId: state.messageId ? state.messageId : "",
                                imageMinioUrl: file.image_url,
                                fileName: file.file_name,
                                baseId: file.knowledge_db_id,
                                minioUrl: file.file_url,
                                score: file.score,
                                from: "ai" as const,
                                ...additionalProps,
                              };
                            }),
                          ];
                          eachMessagesRef.current = {
                            ...prev,
                            [currentCount.toString()]:
                              updatedMessages.concat(referenceMessage),
                          };
                          return {
                            ...prev,
                            [currentCount.toString()]:
                              updatedMessages.concat(referenceMessage),
                          };
                        });
                        if (
                          !countListRef.current.includes(
                            countRef.current.toString()
                          )
                        ) {
                          countListRef.current.push(
                            countRef.current.toString()
                          );
                        }
                      }
                      countRef.current += 1;
                    } else {
                    }
                  }
                }
              }
            }
          } catch (error) {
            console.error("SSE错误:", error);
            setShowAlert(true);
            setWorkflowStatus("error");
            setWorkflowMessage("sse连接失败，请重试");
          } finally {
            setRunning(false);
            setTaskId("");
            setCanceling(false);
            setRefreshDockerImages((prev) => !prev);
          }
        }
      };
      workFlowSSE();
    }
  }, [
    taskId,
    setGlobalDebugVariables,
    setSelectedEdgeId,
    setSelectedNodeId,
    updateOutput,
    updateStatus,
    user?.name,
  ]);

  const fetchModelConfig = async (nodeId: string) => {
    if (user?.name) {
      const responseBase = await getAllKnowledgeBase(user.name);
      const bases: KnowledgeBase[] = responseBase.data.map((item: any) => ({
        name: item.knowledge_base_name,
        id: item.knowledge_base_id,
        selected: false,
      }));

      const response = await getAllModelConfig(user.name);

      const modelConfigsResponse: ModelConfig[] = response.data.models.map(
        (item: any) => ({
          modelId: item.model_id,
          modelName: item.model_name,
          modelURL: item.model_url,
          apiKey: item.api_key,
          baseUsed: item.base_used,
          systemPrompt: item.system_prompt,
          temperature: item.temperature === -1 ? 0.1 : item.temperature,
          maxLength: item.max_length === -1 ? 8192 : item.max_length,
          topP: item.top_P === -1 ? 0.01 : item.top_P,
          topK: item.top_K === -1 ? 3 : item.top_K,
          scoreThreshold:
            item.score_threshold === -1 ? 10 : item.score_threshold,
          useTemperatureDefault: item.temperature === -1 ? true : false,
          useMaxLengthDefault: item.max_length === -1 ? true : false,
          useTopPDefault: item.top_P === -1 ? true : false,
          useTopKDefault: item.top_K === -1 ? true : false,
          useScoreThresholdDefault: item.score_threshold === -1 ? true : false,
        })
      );

      const selected = modelConfigsResponse.find(
        (m) => m.modelId === response.data.selected_model
      );

      if (selected) {
        const filter_select = selected.baseUsed.filter((item) =>
          bases.some((base) => base.id === item.baseId)
        );
        updateVlmModelConfig(nodeId, (prev) => ({
          ...prev,
          ...selected,
          baseUsed: filter_select,
        }));
      }
    }
  };

  const onNodesChange = useCallback(
    (changes: NodeChange<CustomNode>[]) => {
      setNodes(applyNodeChanges(changes, nodes));
      if (
        changes.find((change) =>
          ["dimensions", "remove", "replace", "add"].includes(change.type)
        )
      ) {
        pushHistory();
      }
    },
    [nodes, setNodes, pushHistory]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<CustomEdge>[]) => {
      setEdges(applyEdgeChanges(changes, edges));
      if (
        changes.find((change) =>
          ["remove", "replace", "add"].includes(change.type)
        )
      ) {
        pushHistory();
      }
    },
    [edges, setEdges, pushHistory]
  );

  const onEdgesDelete = (edges: CustomEdge[]) => {
    edges.map((edge) => {
      if (edge.data?.conditionLabel) {
        const conditionNodeId = edge.source;
        removeCondition(conditionNodeId, parseInt(edge.data.conditionLabel));
      }
    });
  };

  const onConnect = useCallback(
    (connection: Connection) => {
      let newConnection;
      if (
        edges.find(
          (edge) =>
            edge.source === connection.source &&
            edge.target === connection.target
        )
      ) {
        return;
      }
      if (connection.source.startsWith("node_condition")) {
        const count = getConditionCount(connection.source);
        newConnection = {
          ...connection,
          data: {
            conditionLabel: `${count ? count + 1 : 1}`,
          },
        };
        setEdges(addEdge(newConnection, edges));
        updateConditionCount(connection.source, count ? count + 1 : 1);
        updateConditions(connection.source, count ? count + 1 : 1, "");
      } else if (connection.targetHandle === "target") {
        newConnection = {
          ...connection,
          data: {
            loopType: "next",
          },
        };
        setEdges(addEdge(newConnection, edges));
      } else if (connection.sourceHandle === "source") {
        newConnection = {
          ...connection,
          data: {
            loopType: "body",
          },
        };
        setEdges(addEdge(newConnection, edges));
      } else {
        setEdges(addEdge(connection, edges));
      }
      pushHistory();
    },
    [
      edges,
      setEdges,
      pushHistory,
      getConditionCount,
      updateConditionCount,
      updateConditions,
    ]
  );

  const addNode = (type: NodeTypeKey) => {
    let data;
    let id;
    if (type === "code") {
      data = {
        status: "init",
        label: nodeTypesInfo[type].label,
        nodeType: type,
        code: 'def my_func():\n    print("Hello Layra!")\n\nmy_func()\n',
        output: "Output will be show here",
      };
    } else if (type === "loop") {
      data = {
        status: "init",
        label: nodeTypesInfo[type].label,
        nodeType: type,
        loopType: "count",
        maxCount: 1,
        condition: "",
        output: "Output will be show here",
      };
    } else if (type === "vlm") {
      data = {
        status: "init",
        label: nodeTypesInfo[type].label,
        nodeType: type,
        output: "This area displays the Node output during workflow execution.",
        prompt: "Your are a helpful assistant.",
        vlmInput: "",
        chatflowOutputVariable: "",
        isChatflowInput: false,
        isChatflowOutput: false,
        useChatHistory: false,
        chat: 'To extract global variables from the output, ensure prompt LLM/VLM to output them with json format, e.g.,\n {"output":"AIoutput"}.\n\nAdditionally, you can directly assign the LLM response to a global variable below:',
      };
    } else {
      data = {
        status: "init",
        label: nodeTypesInfo[type].label,
        nodeType: type,
        output: "Output will be show here",
      };
    }
    if (type === "start") {
      if (nodes.find((node) => node.data.nodeType === "start")) {
        setShowAlert(true);
        setWorkflowStatus("error");
        setWorkflowMessage("Start node already exist!");
        return;
      }
      id = "node_start";
    } else {
      id = getId(type);
    }
    const newNode: CustomNode = {
      id: id,
      type: "default",
      position: { x: Math.random() * 100 - 100, y: Math.random() * 100 },
      data: data,
    };
    setNodes([...nodes, newNode]);
    if (type === "vlm") {
      fetchModelConfig(id);
    }
  };

  const addCustomNode = (name: string) => {
    const type = customNodes[name].type;
    if (type) {
      const id = getId(type);
      const newNode: CustomNode = {
        id: id,
        type: customNodes[name].type,
        position: { x: Math.random() * 100 - 100, y: Math.random() * 100 },
        data: { ...customNodes[name].data, label: name },
      };
      setNodes([...nodes, newNode]);
    } else {
      alert("Node Error");
    }
  };

  const onNodeClick = (_: any, node: CustomNode) => {
    setSelectedType(node.data.nodeType);
    setSelectedNodeId(node.id);
    setShowOutput(false);
  };

  const onEdgeClick = (_: any, edge: CustomEdge) => {
    setSelectedEdgeId(edge.id);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Delete") {
      const selectedNode = nodes.find((n) => n.selected);
      if (selectedNode) {
        deleteNode(selectedNode.id);
      }
      const selectedEdge = edges.find((e) => e.selected);
      if (selectedEdge) {
        deleteEdge(selectedEdge.id);
      }
    }
  };

  // input_resume:用户通过对话框输入后设置为true
  const handleRunWorkflow = async (
    debug: boolean = false,
    input_resume: boolean = false,
    userMessage: string = "",
    files: FileRespose[] = [],
    tempBaseId: string = ""
  ) => {
    if (saveImage) {
      if (saveImageName === "" || saveImageTag === "") {
        setShowAlert(true);
        setWorkflowMessage(
          'Please write your Image Name and Image Version or close "Commit Runtime Environment" checkbox before running LLM node!'
        );
        setWorkflowStatus("error");
        return;
      }
    }

    const sendSaveImage = saveImage ? saveImageName + ":" + saveImageTag : "";

    for (let node of nodes) {
      if (
        node.data.nodeType === "vlm" &&
        node.data.isChatflowInput === false &&
        node.data.vlmInput === ""
      ) {
        setShowAlert(true);
        setWorkflowMessage(
          'Please write your question to AI for node "' +
            node.data.label +
            '" before running LLM node!'
        );
        setWorkflowStatus("error");
        return;
      }
    }
    if (user?.name) {
      setRunning(true);
      if (
        (debug === false && input_resume === false) ||
        (resumeDebugTaskId === "" && resumeInputTaskId === "")
      ) {
        handleNewChatflow();
        nodeStatesRef.current = new Map();
        setMessages({});
        setEachMessages({});
        countListRef.current = [];
        setCurrentInputNodeId(undefined);
        setRunningChatflowLLMNodes([]);
        countRef.current = 1;
        nodes.forEach((node) => {
          updateOutput(node.id, "Await for running...");
          updateStatus(node.id, "init");
          updateChat(node.id, "Await for running...");
        });
      }
      if (files.length > 0) {
        const newFileMessages: Message[] = files.map((file) => {
          const fileType: string = getFileExtension(file.filename);
          if (["png", "jpg", "jpeg", "gif"].includes(fileType)) {
            const fileMessage: Message = {
              type: "image",
              content: file.filename,
              minioUrl: file.url,
              from: "user",
            };
            return fileMessage;
          } else {
            const fileMessage: Message = {
              type: "file",
              content: userMessage,
              fileName: file.filename,
              fileType: fileType, // 新增文件类型字段
              minioUrl: file.url,
              from: "user",
            };
            return fileMessage;
          }
        });
        setFileMessages(newFileMessages);
      } else {
        setFileMessages([]);
      }

      try {
        const sendNodes = nodes.map((node) => {
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

          return {
            id: node.id,
            type: node.data.nodeType,
            data: {
              name: node.data.label,
              code: node.data.code,
              conditions: node.data.conditions,
              loopType: node.data.loopType,
              maxCount: node.data.maxCount,
              condition: node.data.condition,
              pip: node.data.pip,
              imageUrl: node.data.imageUrl,
              modelConfig: modelConfig,
              prompt: node.data.prompt,
              vlmInput: node.data.vlmInput,
              chatflowOutputVariable: node.data.chatflowOutputVariable,
              isChatflowInput: node.data.isChatflowInput,
              isChatflowOutput: node.data.isChatflowOutput,
              useChatHistory: node.data.useChatHistory,
              mcpUse: mcpUse,
            },
          };
        });

        const sendEdges = edges.map((edge) => {
          if (edge.data?.conditionLabel) {
            return {
              source: edge.source,
              target: edge.target,
              sourceHandle: "condition-" + edge.data?.conditionLabel,
            };
          } else if (edge.sourceHandle === "source") {
            return {
              source: edge.source,
              target: edge.target,
              sourceHandle: "loop_body",
            };
          } else if (edge.targetHandle === "target") {
            return {
              source: edge.source,
              target: edge.target,
              sourceHandle: "loop_next",
            };
          } else {
            return {
              source: edge.source,
              target: edge.target,
            };
          }
        });
        let sendBreakpoints: string[];
        let sendDebugResumeTaskId: string;
        let sendInputResumeTaskId: string;
        let sendGlobalVariables = globalVariables;
        if (debug && !input_resume) {
          sendBreakpoints = nodes
            .filter((node) => node.data.debug === true)
            .map((node) => node.id);
          sendDebugResumeTaskId = resumeDebugTaskId;
          if (resumeDebugTaskId !== "") {
            sendGlobalVariables = globalDebugVariables;
          }
          sendInputResumeTaskId = "";
        } else if (input_resume && debug) {
          sendBreakpoints = nodes
            .filter((node) => node.data.debug === true)
            .map((node) => node.id);
          sendDebugResumeTaskId = "";
          if (resumeInputTaskId !== "") {
            sendGlobalVariables = globalDebugVariables;
          }
          sendInputResumeTaskId = resumeInputTaskId;
        } else if (input_resume && !debug) {
          sendDebugResumeTaskId = "";
          sendInputResumeTaskId = resumeInputTaskId;
          sendBreakpoints = [];
        } else {
          sendBreakpoints = [];
          sendDebugResumeTaskId = "";
          sendInputResumeTaskId = "";
        }

        let parentId: string = "";
        if (countListRef.current.length > 0) {
          const lastNodeMessages =
            eachMessagesRef.current[
              countListRef.current[countListRef.current.length - 1]
            ];
          if (lastNodeMessages.length > 0) {
            if (lastNodeMessages[lastNodeMessages.length - 1].from === "ai") {
              parentId =
                lastNodeMessages[lastNodeMessages.length - 1].messageId || "";
            }
          }
        }

        const response = await executeWorkflow(
          user.name,
          sendNodes,
          sendEdges,
          "node_start",
          sendGlobalVariables,
          sendDebugResumeTaskId,
          sendInputResumeTaskId,
          sendBreakpoints,
          userMessage,
          parentId,
          tempBaseId,
          chatflowId,
          sendSaveImage,
          DockerImageUse
        );
        if (response.data.code === 0) {
          setTaskId(response.data.task_id);
        } else {
          setShowAlert(true);
          setWorkflowMessage(response.data.msg);
          setWorkflowStatus("error");
          setRunning(false);
        }
      } catch (error) {
        console.error("Error connect:", error);
        setRunning(false);
      } finally {
      }
    }
  };

  const handleSaveWorkFlow = async () => {
    if (user?.name) {
      try {
        const response = await createWorkflow(
          workFlow.workflowId,
          user.name,
          workFlow.workflowName,
          { docker_image_use: DockerImageUse },
          workFlow.startNode,
          globalVariables,
          nodes,
          edges
        );
        if (response.status == 200) {
          setShowAlert(true);
          setWorkflowMessage("Save Success!");
          setWorkflowStatus("success");
        }
      } catch (error) {
        console.error("Auto-save failed:", error);
        setShowAlert(true);
        setWorkflowMessage("Save Failed!");
        setWorkflowStatus("error");
      }
    }
  };

  const handleAutoSaveWorkFlow = useCallback(
    async (
      DockerImageUse: string,
      globalVariables: {
        [key: string]: string;
      },
      nodes: CustomNode[],
      edges: CustomEdge[]
    ) => {
      if (user?.name) {
        try {
          const response = await createWorkflow(
            workFlow.workflowId,
            user.name,
            workFlow.workflowName,
            { docker_image_use: DockerImageUse },
            workFlow.startNode,
            globalVariables,
            nodes,
            edges
          );
          if (response.status == 200) {
            showTemporaryAlert(
              `Workflow "${workFlow.workflowName}" auto-saved successfully`,
              "success"
            );
          }
        } catch (error) {
          console.error("Auto-save failed:", error);
          showTemporaryAlert(
            `Workflow "${workFlow.workflowName}" auto-saved failed`,
            "error"
          );
        }
      }
    },
    [workFlow, user?.name]
  );

  // 固定1分钟保存一次
  useEffect(() => {
    const intervalId = setInterval(() => {
      // ✅ 每次执行时直接从 store 读取最新状态
      const currentDockerImageUse = useGlobalStore.getState().DockerImageUse;
      const currentGlobalVariables = useGlobalStore.getState().globalVariables;
      const currentNodes = useFlowStore.getState().nodes;
      const currentEdges = useFlowStore.getState().edges;
      handleAutoSaveWorkFlow(
        currentDockerImageUse,
        currentGlobalVariables,
        currentNodes,
        currentEdges
      );
    }, 60000);
    return () => clearInterval(intervalId);
  }, [workFlow, user?.name, handleAutoSaveWorkFlow]); // 无需依赖项

  const showTemporaryAlert = (message: string, type: "success" | "error") => {
    setSaveStatus({ visible: true, message, type });

    // 3秒后自动隐藏
    setTimeout(() => {
      setSaveStatus((prev) => ({ ...prev, visible: false }));
    }, 5000);
  };

  const handleImportWorkflow = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        const data = JSON.parse(content);

        // 验证数据格式
        if (!data.nodes || !data.edges || !data.globalVariables) {
          throw new Error("Invalid workflow file format");
        }

        // 确认提示
        const confirm = window.confirm("导入工作流将覆盖当前内容，是否继续？");
        if (!confirm) return;
        // 更新状态
        setNodes(data.nodes);
        setEdges(data.edges);
        setGlobalVariables(data.globalVariables);

        // 重置相关状态
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
        pushHistory();
      } catch (error) {
        console.error("导入失败:", error);
        setShowAlert(true);
        setWorkflowStatus("error");
        setWorkflowMessage("无效的工作流文件格式");
      }
    };

    reader.readAsText(file);
    event.target.value = ""; // 重置input以允许重复选择同一文件
  };

  const handleExportWorkflow = () => {
    const outputNodes = nodes.map((node) => {
      // 不满足条件的节点直接返回原节点（不修改）
      if (node.data.nodeType !== "vlm" || !node.data.modelConfig) {
        return node;
      }

      // 创建新对象避免修改原节点
      return {
        ...node, // 浅拷贝节点属性
        data: {
          ...node.data, // 浅拷贝data属性
          modelConfig: {
            ...node.data.modelConfig, // 浅拷贝modelConfig属性
            apiKey: "", // 仅修改apiKey字段
          },
        },
      };
    });
    const exportData = {
      nodes: outputNodes,
      edges,
      globalVariables,
      metadata: {
        exportedAt: new Date().toISOString(),
      },
    };

    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `${workFlow.workflowName}_${Date.now()}_layra.json`;
    document.body.appendChild(a);
    a.click();

    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSaveNodes = (newNode: CustomNode) => {
    setShowAddNode(true);
    setNewCustomNode(newNode);
  };

  const handleStopWorkflow = async () => {
    if (user?.name) {
      try {
        await cancelWorkflow(user.name, taskId);
        setCanceling(true);
      } catch (error) {
        console.error("取消失败:", error);
        setShowAlert(true);
        setWorkflowStatus("error");
        setWorkflowMessage("取消失败:" + error);
      }
    }
  };

  const handleCreateConfirm = async () => {
    if (!newNodeName.trim()) {
      setNameError("Node name can not be null!");
      return;
    }
    if (newNodeName.includes(" ")) {
      setNameError("Spaces are not allowed in node names!");
      return;
    }
    if (
      Object.entries(customNodes).find(([name, node]) => name === newNodeName)
    ) {
      setNameError("Node name already exist!");
      return;
    }
    if (newCustomNode && user?.name) {
      try {
        const response = await saveCustomNodes(
          user?.name,
          newNodeName,
          newCustomNode
        );
        if (response.data.status === "success") {
          setCustomNodes((prev) => ({
            ...prev,
            [newNodeName]: newCustomNode,
          }));
        } else {
          setShowAlert(true);
          setWorkflowStatus("error");
          setWorkflowMessage("保存失败，请导出工作流备份并检查网络！");
        }
      } catch (error) {
        console.error("Error save custom node:", error);
      }
    }
    setShowAddNode(false);
    setNewNodeName("");
    setNameError(null);
  };

  const handleSendMessage = async (
    message: string,
    files: FileRespose[],
    tempBaseId: string
  ) => {
    setSendInputDisabled(true);
    if (currentInputNodeId) {
      updateVlmInput(currentInputNodeId, message);
      if (user?.name) {
        try {
          await createChatflow(
            chatflowId,
            user?.name,
            "chatflow",
            workFlow.workflowId
          );
        } catch (error) {
          console.error("Error delete file:", error);
        }
      }
      resumeDebugTaskId
        ? handleRunWorkflow(true, true, message, files, tempBaseId)
        : handleRunWorkflow(false, true, message, files, tempBaseId);
    }
  };

  return (
    <div
      className="grid grid-cols-[15%_1fr] h-full w-full bg-white rounded-3xl shadow-sm p-6"
      ref={reactFlowWrapper}
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      <div className=" bg-white pr-4 h-full overflow-auto">
        <NodeTypeSelector
          deleteCustomNode={handleDeleteCustomNode}
          customNodes={customNodes}
          setCustomNodes={setCustomNodes}
          addCustomNode={addCustomNode}
          workflowName={workFlow.workflowName}
          lastModifyTime={workFlow.lastModifyTime}
          addNode={addNode}
        />
      </div>

      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center justify-center gap-[2px]">
            <button
              onClick={undo}
              disabled={history.length <= 1}
              className="cursor-pointer disabled:cursor-not-allowed p-2 rounded-full hover:bg-indigo-600 hover:text-white disabled:opacity-50 flex items-center justify-center gap-1"
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
                  d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3"
                />
              </svg>
              <span>({Math.min(history.length - 1, 50)})</span>
            </button>
            <button
              onClick={redo}
              disabled={future.length === 0}
              className="cursor-pointer disabled:cursor-not-allowed p-2 rounded-full hover:bg-indigo-600 hover:text-white disabled:opacity-50 flex items-center justify-center gap-1"
            >
              <span>({Math.min(future.length, 50)})</span>
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
                  d="m15 15 6-6m0 0-6-6m6 6H9a6 6 0 0 0 0 12h3"
                />
              </svg>
            </button>
            <input
              type="file"
              ref={fileInputRef}
              accept=".json"
              onChange={handleImportWorkflow}
              className="hidden"
            />

            <button
              onClick={() => fileInputRef.current?.click()}
              //disabled={nodes.length > 0}
              className="cursor-pointer disabled:cursor-not-allowed p-2 rounded-full hover:bg-indigo-600 hover:text-white disabled:opacity-50 flex items-center justify-center gap-1"
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
                  d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75"
                />
              </svg>

              <span>Import</span>
            </button>
            <button
              onClick={handleExportWorkflow}
              disabled={nodes.length === 0}
              className="cursor-pointer disabled:cursor-not-allowed p-2 rounded-full hover:bg-indigo-600 hover:text-white disabled:opacity-50 flex items-center justify-center gap-1"
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
                  d="M8.25 9V5.25A2.25 2.25 0 0 1 10.5 3h6a2.25 2.25 0 0 1 2.25 2.25v13.5A2.25 2.25 0 0 1 16.5 21h-6a2.25 2.25 0 0 1-2.25-2.25V15m-3 0-3-3m0 0 3-3m-3 3H15"
                />
              </svg>
              <span>Export</span>
            </button>
            <button
              onClick={() => {
                handleSaveWorkFlow();
                handleRefresh();
              }}
              className="cursor-pointer disabled:cursor-not-allowed p-2 rounded-full hover:bg-indigo-600 hover:text-white disabled:opacity-50 flex items-center justify-center gap-1"
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
                  d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18"
                />
              </svg>

              <span>Refresh</span>
            </button>
          </div>

          <button
            className="cursor-pointer disabled:cursor-not-allowed px-4 py-2 rounded-full hover:bg-indigo-600 hover:text-white disabled:opacity-50 flex items-center justify-center gap-1"
            onClick={() => setFullScreenFlow((prev: boolean) => !prev)}
          >
            {fullScreenFlow ? (
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

          <div className="flex items-center justify-center gap-2">
            <div className="flex items-center justify-center gap-1">
              <button
                //disabled={running}
                onClick={() => {
                  if (selectedNodeId) {
                    setShowOutput(true);
                    setSelectedNodeId(null);
                    setSelectedEdgeId(null);
                  } else {
                    setShowOutput((prev) => !prev);
                  }
                }}
                className={`${
                  !sendInputDisabled && !showOutput ? "text-indigo-700" : ""
                } cursor-pointer disabled:cursor-not-allowed p-2 rounded-full hover:bg-indigo-600 hover:text-white disabled:opacity-50 flex items-center justify-center gap-1`}
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
                    d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6"
                  />
                </svg>

                <span>
                  {!sendInputDisabled && !showOutput
                    ? "Click Here"
                    : "ChatFlow"}
                </span>
              </button>
              <button
                disabled={running}
                onClick={() => handleRunWorkflow(false)}
                className={`cursor-pointer disabled:cursor-not-allowed p-2 rounded-full hover:bg-indigo-600 hover:text-white disabled:opacity-50 flex items-center justify-center gap-1`}
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

                <span>Run</span>
              </button>
              <button
                disabled={running}
                className={`${
                  resumeDebugTaskId ? "text-red-500" : ""
                } cursor-pointer disabled:cursor-not-allowed p-2 rounded-full hover:bg-indigo-600 hover:text-white disabled:opacity-50 flex items-center justify-center gap-1`}
                onClick={() => {
                  handleRunWorkflow(true);
                }}
              >
                {resumeDebugTaskId ? (
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
                      d="M21 7.5V18M15 7.5V18M3 16.811V8.69c0-.864.933-1.406 1.683-.977l7.108 4.061a1.125 1.125 0 0 1 0 1.954l-7.108 4.061A1.125 1.125 0 0 1 3 16.811Z"
                    />
                  </svg>
                ) : (
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
                )}

                <span>Debug</span>
              </button>
            </div>
            <div className="flex items-center justify-center gap-1">
              <button
                onClick={handleSaveWorkFlow}
                className="cursor-pointer disabled:cursor-not-allowed p-2 rounded-full text-indigo-500 hover:bg-indigo-600 hover:text-white disabled:opacity-50 flex items-center justify-center gap-1"
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
                <span>Save</span>
              </button>
              {running ? (
                <button
                  disabled={!taskId || canceling}
                  className="text-red-500 cursor-pointer disabled:cursor-not-allowed p-2 rounded-full hover:bg-indigo-600 hover:text-white disabled:opacity-50 flex items-center justify-center gap-1"
                  onClick={handleStopWorkflow}
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
                      d="M5.25 7.5A2.25 2.25 0 0 1 7.5 5.25h9a2.25 2.25 0 0 1 2.25 2.25v9a2.25 2.25 0 0 1-2.25 2.25h-9a2.25 2.25 0 0 1-2.25-2.25v-9Z"
                    />
                  </svg>

                  <span>Stop</span>
                </button>
              ) : (
                <button
                  disabled={running || resumeDebugTaskId !== ""}
                  className="text-red-500 cursor-pointer disabled:cursor-not-allowed p-2 rounded-full hover:bg-indigo-600 hover:text-white disabled:opacity-50 flex items-center justify-center gap-1"
                  onClick={() => {
                    setShowConfirmClear(true);
                  }}
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
                      d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                    />
                  </svg>

                  <span>Clear</span>
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 rounded-3xl shadow-sm bg-white relative overflow-hidden">
          {currentNode ? (
            <div
              className={`p-2 z-10 max-h-[calc(100%-16px)] ${
                codeFullScreenFlow
                  ? "w-[96%] h-[98%] fixed  top-[1%] right-[2%]"
                  : "w-[40%]  h-[98%] absolute m-2 top-0 right-0"
              } shadow-lg rounded-3xl bg-white`}
            >
              {{
                code: (
                  <FunctionNodeComponent
                    refreshDockerImages={refreshDockerImages}
                    saveImage={saveImage}
                    setSaveImage={setSaveImage}
                    saveImageName={saveImageName}
                    setSaveImageName={setSaveImageName}
                    saveImageTag={saveImageTag}
                    setSaveImageTag={setSaveImageTag}
                    saveNode={handleSaveNodes}
                    isDebugMode={resumeDebugTaskId === "" ? false : true}
                    node={currentNode}
                    codeFullScreenFlow={codeFullScreenFlow}
                    setCodeFullScreenFlow={setCodeFullScreenFlow}
                  />
                ),
                start: (
                  <StartNodeComponent
                    isDebugMode={resumeDebugTaskId === "" ? false : true}
                    node={currentNode}
                    codeFullScreenFlow={codeFullScreenFlow}
                    setCodeFullScreenFlow={setCodeFullScreenFlow}
                  />
                ),
                vlm: (
                  <VlmNodeComponent
                    showError={(error) => {
                      setShowAlert(true);
                      setWorkflowStatus("error");
                      setWorkflowMessage(error);
                    }}
                    messages={messages[currentNode.id]}
                    setMessages={setMessages}
                    saveNode={handleSaveNodes}
                    isDebugMode={resumeDebugTaskId === "" ? false : true}
                    node={currentNode}
                    codeFullScreenFlow={codeFullScreenFlow}
                    setCodeFullScreenFlow={setCodeFullScreenFlow}
                  />
                ),
                condition: (
                  <ConditionNodeComponent
                    saveNode={handleSaveNodes}
                    isDebugMode={resumeDebugTaskId === "" ? false : true}
                    node={currentNode}
                    codeFullScreenFlow={codeFullScreenFlow}
                    setCodeFullScreenFlow={setCodeFullScreenFlow}
                  />
                ),
                loop: (
                  <LoopNodeComponent
                    saveNode={handleSaveNodes}
                    isDebugMode={resumeDebugTaskId === "" ? false : true}
                    node={currentNode}
                    codeFullScreenFlow={codeFullScreenFlow}
                    setCodeFullScreenFlow={setCodeFullScreenFlow}
                  />
                ),
              }[currentNode.data.nodeType] || <div></div>}
            </div>
          ) : showOutput ? (
            <div
              className={`p-2 z-10 max-h-[calc(100%-16px)] ${
                codeFullScreenFlow
                  ? "w-[96%] h-[98%] fixed  top-[1%] right-[2%]"
                  : "w-[40%]  h-[98%] absolute m-2 top-0 right-0"
              } shadow-lg rounded-3xl bg-white`}
            >
              <WorkflowOutputComponent
                workflow={workFlow}
                tempBaseId={tempBaseId}
                setTempBaseId={setTempBaseId}
                sendingFiles={sendingFiles}
                setSendingFiles={setSendingFiles}
                cleanTempBase={cleanTempBase}
                onSendMessage={handleSendMessage}
                sendDisabled={sendInputDisabled}
                messagesWithCount={eachMessages}
                runningLLMNodes={runningChatflowLLMNodes}
                isDebugMode={resumeDebugTaskId === "" ? false : true}
                codeFullScreenFlow={codeFullScreenFlow}
                setCodeFullScreenFlow={setCodeFullScreenFlow}
              />
            </div>
          ) : (
            ""
          )}
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onEdgesDelete={onEdgesDelete}
            deleteKeyCode={[]}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            onPaneClick={() => {
              setSelectedNodeId(null);
              setSelectedEdgeId(null);
              setShowOutput(false);
            }} // 添加这一行
            nodeTypes={{ default: CustomNodeComponent }}
            edgeTypes={{ default: CustomEdgeComponent }}
            connectionLineComponent={ConnectionLine}
            connectionRadius={20}
            fitView
            fitViewOptions={{
              padding: 0.2,
            }}
            className="!border-0 !bg-gray-50"
          >
            <MiniMap />
            <Controls />
            <Background gap={12} size={1} />
          </ReactFlow>
        </div>
      </div>
      {showAlert && (
        <ConfirmAlert
          type={workflowStatus}
          message={workflowMessage}
          onCancel={() => setShowAlert(false)}
        />
      )}
      {showAddNode && (
        <SaveCustomNode
          setShowSaveNode={setShowAddNode}
          nameError={nameError}
          setNameError={setNameError}
          newNodeName={newNodeName}
          setNewNodeName={setNewNodeName}
          onCreateConfirm={handleCreateConfirm}
        />
      )}
      {showConfirmClear && (
        <ConfirmDialog
          message={`Confirm clear this Chatflow？`}
          onConfirm={confirmClear}
          onCancel={cancelClear}
        />
      )}
      {saveStatus.visible && (
        <div
          className={`
          fixed top-16 left-1/2 transform -translate-x-1/2 px-4 py-2 rounded-lg shadow-lg text-sm
          transition-opacity duration-500
          ${
            saveStatus.type === "success"
              ? "bg-indigo-100 text-indigo-700"
              : "bg-red-100 text-red-700"
          }
          animate-fade-in-out
        `}
        >
          {saveStatus.message}
        </div>
      )}
    </div>
  );
};

export default FlowEditor;
