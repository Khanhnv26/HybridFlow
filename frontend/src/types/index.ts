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

export type TransformRule = 'TRIM' | 'UPPERCASE' | 'LOWERCASE' | 'CAPITALIZE' | 'PHONE_VN' | 'DEFAULT_IF_EMPTY';
export interface ColumnTransformConfig {
  columnName: string;
  rules: TransformRule[];
  defaultValue?: string;
}

export type RouterOperator = 'CHANGED_TO' | 'EQUALS' | 'NOT_EQUALS' | 'CONTAINS' | 'IS_NOT_EMPTY';
export type RouterTriggerOn = 'CHANGED' | 'CREATED' | 'UPDATED';
export type RouterMatchMode = 'ALL' | 'ANY';

export interface RouterConditionItem {
  columnName: string;
  operator: RouterOperator;
  value?: string;
}

export interface RouterPlanPayload {
  nodeId: string;
  triggerOn: RouterTriggerOn;
  matchMode: RouterMatchMode;
  conditions: RouterConditionItem[];
  actionNodeIds: string[];
}

export interface ActionPlanPayload {
  nodeId: string;
  channel: 'TELEGRAM';
  chatId: string;
  recordTemplate?: string;
  conflictTemplate?: string;
}

export interface NotificationOutboxItem {
  id: string;
  flowId: string;
  executionId?: string;
  actionNodeId: string;
  channel: string;
  destination: string;
  sourceType: 'RECORD' | 'CONFLICT';
  sourceKey: string;
  message: string;
  state: 'PENDING' | 'SENDING' | 'SENT' | 'FAILED' | 'DEAD' | 'SKIPPED';
  attempts: number;
  availableAt: string;
  lastError?: string;
  createdAt: string;
  sentAt?: string;
}

export interface DataTransformNodeData extends OrchestrationNodeData {
  transforms?: ColumnTransformConfig[];
  writeBackCleanData?: boolean;
}

export interface OrchestrationNodeData extends Record<string, unknown> {
  writeBackBySource?: Record<string, boolean>;
  transformSourceCount?: number;
  transformWriteBackCount?: number;
  transforms?: ColumnTransformConfig[];
  writeBackCleanData?: boolean;
  routerTriggerOn?: RouterTriggerOn;
  routerMatchMode?: RouterMatchMode;
  routerConditions?: RouterConditionItem[];
  triggerOn?: RouterTriggerOn;
  matchMode?: RouterMatchMode;
  conditions?: RouterConditionItem[];
  recordTemplate?: string;
  conflictTemplate?: string;
  incomingSourcesCount?: number;
  notificationItems?: NotificationOutboxItem[];
  label: string;
  category: 'trigger' | 'logic' | 'action';
  type: OrchestrationNodeType;
  subtitle: string;
  icon?: string;
  status?: string;
  isRunning?: boolean;
  executionState?: NodeExecutionState;
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
  hasLegacySheetConnection?: boolean;
  // Natural language parameters
  uniqueKey?: string;
  sharedColumns?: string;
  syncColumns?: string[];
  conflictPolicy?: string;
  spreadsheetId?: string;
  spreadsheetTitle?: string;
  spreadsheetUrl?: string;
  sheetName?: string;
  chatId?: string;
  tableName?: string;
  scheduleTime?: string;
  scheduleIntervalMinutes?: number;
  scheduleType?: 'interval' | 'daily';
  scheduleEnabled?: boolean;
  scheduleTimezone?: string;
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
  transforms?: ColumnTransformConfig[];
  writeBackCleanData?: boolean;
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
  transforms?: ColumnTransformConfig[];
  writeBackCleanData?: boolean;
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
  routers?: RouterPlanPayload[];
  actions?: ActionPlanPayload[];
  conflictActionIds?: string[];
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
  notificationsQueued?: number;
}

export interface ExecutionHistoryDto {
  progress?: string | ExecutionPhase[] | null;
  id: string;
  status: string;
  result: string | null;
  error: string | null;
  started_at: string;
  finished_at: string | null;
}

export interface ExecutionPhase { nodes: string[]; stage: string; label: string }
export interface NodeExecutionState {
  state: 'idle' | 'running' | 'success' | 'warning' | 'error' | 'skipped';
  label: string;
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
