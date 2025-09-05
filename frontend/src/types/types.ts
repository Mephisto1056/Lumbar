// types.ts
// types.ts
export interface Message {
  type: "text" | "image" | "file" | "thinking" | "baseFile";
  content: string | null;
  thinking?: string;
  fileName?: string; // 新增文件名字段
  fileType?: string; // 新增文件类型字段
  minioUrl?: string;
  messageId?: string;
  baseId?: string;
  score?: number;
  imageMinioUrl?: string;
  token_number?: {
    total_token: number;
    completion_tokens: number;
    prompt_tokens: number;
  };
  from: "user" | "ai"; // 消息的来源
  // 新增媒体相关字段
  timestamp?: number; // 视频帧时间戳
  timestamp_start?: number; // 音频/视频分段开始时间
  timestamp_end?: number; // 音频/视频分段结束时间
  duration?: number; // 分段时长
  media_type?: 'image' | 'audio' | 'video' | 'video_frame' | 'video_audio' | 'document';
}

export interface Chat {
  name: string;
  conversationId: string;
  lastModifyTime: string;
  isRead: boolean;
  createTime: string;
  messages: Message[];
}

export interface Base {
  name: string;
  baseId: string;
  lastModifyTime: string;
  createTime: string;
  fileNumber: number;
}

export interface KnowledgeBase {
  id: string;
  name: string;
  selected: boolean;
}

export interface BaseUsed {
  name: string;
  baseId: string;
}

export interface FileRespose {
  id: string;
  minio_filename: string;
  filename: string;
  url: string;
}

// 更新类型定义
export interface ModelConfig {
  modelId: string;
  baseUsed: BaseUsed[];
  modelName: string;
  modelURL: string;
  apiKey: string;
  systemPrompt: string;
  temperature: number;
  maxLength: number;
  topP: number;
  topK: number;
  scoreThreshold: number;
  useTemperatureDefault: boolean;
  useMaxLengthDefault: boolean;
  useTopPDefault: boolean;
  useTopKDefault: boolean;
  useScoreThresholdDefault: boolean;
}

export interface McpConfig {
  mcpServerUrl: string;
  headers?: {
    [key: string]: string; // 允许动态属性
  };
  timeout?: number;
  sseReadTimeout?: number;
  mcpTools: {
    [key: string]: string; // 允许动态属性
  }[];
}

export interface UploadFile {
  id: string;
  name: string;
  progress: number;
  error?: string;
}

export interface KnowledgeFile {
  file_id: string;
  filename: string;
  url: string;
  upload_time: string;
  kb_id: string;
  minio_filename: string;
  media_type?: 'image' | 'audio' | 'video' | 'document';
  media_metadata?: {
    duration?: number;
    sample_rate?: number;
    channels?: number;
    resolution?: string;
    fps?: number;
    file_size?: number;
    format?: string;
    has_audio?: boolean;
  };
  segments?: MediaSegment[];
}

export interface MediaSegment {
  segment_id: string;
  start_time: number;
  end_time: number;
  duration: number;
  timestamp?: number;
  frame_idx?: number;
}

export interface FileUsed {
  knowledge_db_id: string;
  file_name: string;
  image_url?: string;
  file_url: string;
  score: number;
  media_type?: 'image' | 'audio' | 'video' | 'video_frame' | 'video_audio' | 'document';
  timestamp?: number;
  timestamp_start?: number;
  timestamp_end?: number;
  duration?: number;
  frame_info?: string;
  segment_info?: string;
}

// types.ts
import { Node, Edge, NodeProps, EdgeProps } from "@xyflow/react";

export type NodeTypeKey = "start" | "loop" | "condition" | "vlm" | "code";

// 完整节点类型（继承基础节点属性）
export type CustomNode = Node<{
  label: string;
  status: string;
  nodeType: NodeTypeKey;
  code?: string;
  output?: string;
  description?: string;
  conditionCount?: number;
  conditions?: {
    [key: number]: string; // 允许动态属性
  };
  modelConfig?: ModelConfig;
  prompt?: string;
  loopType?: string;
  maxCount?: number;
  condition?: string;
  pip?: {
    [key: string]: string; // 允许动态属性
  };
  imageUrl?: string;
  vlmInput?: string;
  chat?: string;
  debug?: boolean;
  isChatflowInput?: boolean;
  isChatflowOutput?: boolean;
  useChatHistory?: boolean;
  chatflowOutputVariable?: string;
  mcpConfig?: {
    [key: string]: McpConfig; // 允许动态属性
  };
  mcpUse?: {
    [key: string]: string[]; // 允许动态属性
  };
}>;

// 组件 Props 类型
export type CustomNodeProps = NodeProps<CustomNode>;

// 边类型
export type CustomEdge = Edge<{
  conditionLabel?: string;
  loopType?: string;
}>;

export type CustomEdgeProps = EdgeProps<CustomEdge>;

export interface sendNode {
  id: string;
  type: string;
  data: {
    code?: string;
  };
}

export interface sendEdges {
  source: string;
  target: string;
  sourceHandle?: string;
}

// 节点类型配置
export const nodeTypesInfo: Record<
  NodeTypeKey,
  {
    label: string;
  }
> = {
  start: { label: "Start" },
  loop: { label: "Loop" },
  condition: { label: "Condition" },
  vlm: { label: "LLM" },
  code: { label: "Code" },
};

export interface Flow {
  name: string;
  flowId: string;
  lastModifyTime: string;
  createTime: string;
}

export interface WorkflowAll {
  workflowId: string;
  workflowName: string;
  workflowConfig: {
    [key: string]: string;
  };
  nodes: CustomNode[];
  edges: CustomEdge[];
  startNode: string;
  globalVariables: {
    [key: string]: string;
  };
  createTime: string;
  lastModifyTime: string;
}

export interface Chatflow {
  name: string;
  chatflowId: string;
  lastModifyTime: string;
  isRead: boolean;
  createTime: string;
  messages: Message[];
}
