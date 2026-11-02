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

export interface ActivityEvent {
  id: string;
  time: string;
  type: 'success' | 'warning' | 'info';
  title: string;
  description: string;
}

export interface SyncConflictItem {
  id: string;
  entityId: string;
  fieldName: string;
  baseValue: string;
  sourceValue: string;
  destinationValue: string;
  status: 'PENDING' | 'RESOLVED';
  resolvedChoice?: string;
}
