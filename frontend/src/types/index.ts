export interface SheetDataResponse {
  spreadsheetId: string;
  sheetName: string;
  headers: string[];
  rows: Record<string, string>[];
  totalRows: number;
}

export interface UpdateCellRequest {
  accessToken: string;
  spreadsheetId: string;
  range: string;
  value: string;
}

export interface UpdateCellResponse {
  range: string;
  updatedValue: string;
  success: boolean;
  message: string;
}

export interface RunHistoryItem {
  id: string;
  time: string;
  type: 'success' | 'conflict' | 'error';
  message: string;
  details?: string;
  latency?: string;
  recordsCount?: number;
}

// Backward compatibility types for older components
export interface ExecutionLog {
  id: string;
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS';
  message: string;
  details?: any;
}

export interface ActivityEvent {
  id: string;
  timestamp?: string;
  time?: string;
  type: string;
  title: string;
  description: string;
  details?: any;
  status: 'SUCCESS' | 'WARNING' | 'ERROR';
}

export interface WorkflowNodeData extends Record<string, unknown> {
  label: string;
  status?: string;
  sheetName?: string;
  spreadsheetId?: string;
  tableName?: string;
  chatId?: string;
  conflictPolicy?: string;
}

export type OrchestrationNodeType =
  // Nhóm 1: Nguồn dữ liệu (Triggers)
  | 'sheetsTrigger'
  | 'scheduleTrigger'
  | 'webhookTrigger'
  // Nhóm 2: Bộ não điều phối (Logic)
  | 'diffEngine'
  | 'routerCondition'
  | 'dataTransform'
  // Nhóm 3: Hành động (Actions)
  | 'storageAction'
  | 'telegramAction'
  | 'sheetWriteAction';

export interface OrchestrationNodeData extends Record<string, unknown> {
  label: string;
  category: 'trigger' | 'logic' | 'action';
  type: OrchestrationNodeType;
  subtitle: string;
  icon?: string;
  status?: string;
  isRunning?: boolean;
  recordsCount?: number;
  hasConflict?: boolean;
  onOpenConflict?: () => void;
  // Natural language parameters
  uniqueKey?: string;
  conflictPolicy?: string;
  spreadsheetId?: string;
  sheetName?: string;
  chatId?: string;
  tableName?: string;
  scheduleTime?: string;
  userAccount?: string;
  botName?: string;
}
