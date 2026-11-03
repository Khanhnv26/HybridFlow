export interface SheetDataResponse {
  spreadsheetId: string;
  spreadsheetTitle?: string;
  sheetName: string;
  headers: string[];
  rows: Record<string, string>[];
  totalRows: number;
}

export interface SpreadsheetMetadataResponse {
  spreadsheetId: string;
  title: string;
  sheets: { sheetId: number; title: string }[];
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
  type: 'success' | 'conflict' | 'error' | 'info';
  message: string;
  details?: string;
  latency?: string;
  recordsCount?: number;
  conflictIds?: number[];
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
  spreadsheetTitle?: string;
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
  sourceNumber?: number;
  readStatus?: SheetReadStatus;
  readError?: string;
  readAt?: string;
  onOpenData?: () => void;
  hasConflict?: boolean;
  conflictCount?: number;
  onOpenConflict?: () => void;
  connectedSheets?: ConnectedSheetSource[];
  hasLegacyStorageConnection?: boolean;
  // Natural language parameters
  uniqueKey?: string;
  sharedColumns?: string;
  conflictPolicy?: string;
  spreadsheetId?: string;
  spreadsheetTitle?: string;
  spreadsheetUrl?: string;
  sheetName?: string;
  chatId?: string;
  tableName?: string;
  scheduleTime?: string;
  scheduleIntervalMinutes?: number;
  scheduleType?: 'interval' | 'daily' | 'cron';
  scheduleEnabled?: boolean;
  userAccount?: string;
  botName?: string;
  telegramRecipientType?: 'PRIVATE' | 'GROUP';
  telegramRecipientName?: string;
}

export interface TelegramBotInfo {
  configured: boolean;
  username: string | null;
  displayName: string | null;
  canJoinGroups: boolean;
  message: string;
}
export interface TelegramRecipient {
  chatId: string;
  name: string;
  recipientType: 'PRIVATE' | 'GROUP';
}
export interface TelegramLink {
  id: string;
  status: 'WAITING' | 'CONNECTED' | 'EXPIRED';
  url: string;
  command: string;
  expiresAt: string;
  recipient: TelegramRecipient | null;
}

export interface SheetEndpointPayload {
  nodeId: string;
  label: string;
  spreadsheetId: string;
  spreadsheetTitle?: string;
  sheetName: string;
}

export interface SyncConflictDto {
  id: number;
  flowId?: string;
  spreadsheetId?: string;
  spreadsheetTitle?: string;
  sheetName?: string;
  idColumn?: string;
  endpointsJson?: string;
  candidatesJson?: string;
  observationsJson?: string;
  recordId: string;
  columnName: string;
  baseValue?: string;
  valueA?: string;
  valueB?: string;
  resolvedValue?: string;
  status: 'OPEN' | 'RESOLVED' | string;
  createdAt?: string;
  resolvedAt?: string;
}

export interface RunSyncRequestPayload {
  flowId: string;
  accessToken: string;
  spreadsheetId: string;
  spreadsheetTitle?: string;
  sheetName?: string;
  sheets?: SheetEndpointPayload[];
  idColumn?: string;
  syncColumns?: string[];
  bootstrapConfirmed?: boolean;
  notifyConflicts: boolean;
  chatId?: string;
  conflictPolicy: 'ASK_TELEGRAM' | 'SOURCE_WINS' | 'DESTINATION_WINS';
  storageName: string;
}

export interface RunSyncResponse {
  flowId: string;
  totalRowsProcessed: number;
  cleanRecordIds: string[];
  conflicts: SyncConflictDto[];
  comparedColumns: string[];
  latency: string;
  executionId: string;
  status: string;
  sheetName: string;
  bootstrapRequired: boolean;
  notificationsSent: number;
  notificationsFailed: number;
}

export interface ExecutionHistoryDto {
  id: string;
  status: string;
  result: string | null;
  error: string | null;
  started_at: string;
  finished_at: string | null;
}

export interface TelegramAlertResponse {
  id: number;
  success: boolean;
  message: string;
}

export type SheetReadStatus = 'idle' | 'loading' | 'success' | 'error';
export interface SheetReadState {
  status: SheetReadStatus;
  data: SheetDataResponse | null;
  error?: string;
  readAt?: string;
}

export interface ConnectedSheetSource {
  nodeId: string;
  number: number;
  spreadsheetId: string;
  spreadsheetTitle?: string;
  sheetName: string;
}
