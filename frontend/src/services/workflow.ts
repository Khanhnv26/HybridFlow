import type { OrchestrationNodeData, RunSyncRequestPayload, SheetEndpointPayload } from '../types';

type WorkflowNode = { id: string; type?: string; data: OrchestrationNodeData };
type WorkflowEdge = {
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
};
const supported = new Set(['sheetsTrigger', 'diffEngine', 'storageAction', 'telegramAction']);

export function workflowConfig(nodes: WorkflowNode[], edges: WorkflowEdge[]) {
  if (nodes.some((n) => !supported.has(n.type || '')))
    throw new Error('Luồng có khối chưa được hỗ trợ thực thi.');

  const diffs = nodes.filter((n) => n.type === 'diffEngine');
  if (diffs.length !== 1) throw new Error('Luồng cần đúng một khối diffEngine.');
  const diff = diffs[0];

  const telegram = nodes.filter((n) => n.type === 'telegramAction');
  if (telegram.length > 1) throw new Error('Chỉ hỗ trợ một khối Telegram trong mỗi luồng.');

  const sheetNodes = nodes.filter((n) => n.type === 'sheetsTrigger');
  const storages = nodes.filter((n) => n.type === 'storageAction');

  const connects = (from: string, to: string, handle: string) =>
    edges.some(
      (e) =>
        e.source === from &&
        e.target === to &&
        e.sourceHandle === handle &&
        e.targetHandle === 'in',
    );

  // Chế độ Multi-Sheet: Nối từ 2 khối Google Sheet trở lên (2, 3, 4... N bảng) với khối So Khớp
  if (sheetNodes.length >= 2 && storages.length === 0) {
    const sheetIds = new Set(sheetNodes.map((s) => s.id));
    for (const sNode of sheetNodes) {
      const connectedIn = connects(sNode.id, diff.id, 'out');
      const connectedOut = connects(diff.id, sNode.id, 'clean');
      if (!connectedIn && !connectedOut) {
        throw new Error(`Hãy nối khối "${sNode.data.label || 'Google Sheet'}" vào Bộ Não So Khớp.`);
      }
    }

    const allowedMultiEdge = (edge: WorkflowEdge) =>
      edge.targetHandle === 'in' &&
      ((sheetIds.has(edge.source) && edge.target === diff.id && edge.sourceHandle === 'out') ||
        (edge.source === diff.id && sheetIds.has(edge.target) && edge.sourceHandle === 'clean') ||
        (edge.source === diff.id &&
          edge.target === telegram[0]?.id &&
          edge.sourceHandle === 'conflict'));
    if (edges.some((e) => !allowedMultiEdge(e)))
      throw new Error('Có dây nối không được hỗ trợ trong luồng đồng bộ.');

    const sheets: SheetEndpointPayload[] = sheetNodes.map((sNode, idx) => {
      const spreadsheetId = sNode.data.spreadsheetId?.trim() || '';
      const sheetName = sNode.data.sheetName?.trim() || '';
      if (!spreadsheetId || !sheetName) {
        throw new Error(`Điền đủ file và tên tab cho bảng Google Sheet thứ ${idx + 1}.`);
      }
      return {
        nodeId: sNode.id,
        label: sNode.data.label
          ? `${sNode.data.label} (${sheetName})`
          : `Sheet ${idx + 1} (${sheetName})`,
        spreadsheetId,
        sheetName,
      };
    });

    const idColumn = diff.data.uniqueKey?.trim() || '';
    if (!idColumn) throw new Error('Điền tên cột khóa so sánh.');

    const syncColumns = [
      ...new Set(
        (diff.data.sharedColumns || '')
          .split(',')
          .map((column) => column.trim())
          .filter((column) => column && column !== idColumn),
      ),
    ].sort();
    if (syncColumns.length === 0)
      throw new Error('Chọn các cột được phép chia sẻ trong khối So khớp trước khi chạy.');

    const conflictPolicy = diff.data.conflictPolicy as RunSyncRequestPayload['conflictPolicy'];
    if (!['ASK_TELEGRAM', 'SOURCE_WINS', 'DESTINATION_WINS'].includes(conflictPolicy))
      throw new Error('Chọn chính sách xung đột hợp lệ.');

    const notifyConflicts = !!telegram[0] && connects(diff.id, telegram[0].id, 'conflict');
    const chatId = telegram[0]?.data.chatId?.trim();
    if (notifyConflicts && !chatId)
      throw new Error('Điền Telegram Chat ID hoặc bỏ dây nối đến Telegram.');

    return {
      spreadsheetId: sheets[0].spreadsheetId,
      sheetName: sheets[0].sheetName,
      sheets,
      syncColumns,
      idColumn,
      storageName: 'multi_sheet',
      conflictPolicy,
      notifyConflicts,
      chatId,
    };
  }

  // Chế độ 1 Sheet <-> Vault (giữ tương thích ngược 100%)
  const one = (type: string) => {
    const matches = nodes.filter((n) => n.type === type);
    if (matches.length !== 1) throw new Error(`Luồng cần đúng một khối ${type}.`);
    return matches[0];
  };
  const source = one('sheetsTrigger');
  const storage = one('storageAction');

  if (!connects(source.id, diff.id, 'out') || !connects(diff.id, storage.id, 'clean'))
    throw new Error('Nối Google Sheet → So khớp → Kho lưu trữ trước khi chạy.');

  const allowed = (edge: WorkflowEdge) =>
    edge.targetHandle === 'in' &&
    ((edge.source === source.id && edge.target === diff.id && edge.sourceHandle === 'out') ||
      (edge.source === diff.id && edge.target === storage.id && edge.sourceHandle === 'clean') ||
      (edge.source === diff.id &&
        edge.target === telegram[0]?.id &&
        edge.sourceHandle === 'conflict'));
  if (edges.some((e) => !allowed(e)))
    throw new Error('Có dây nối không được hỗ trợ trong luồng đồng bộ.');

  const spreadsheetId = source.data.spreadsheetId?.trim() || '';
  const sheetName = source.data.sheetName?.trim() || '';
  const idColumn = diff.data.uniqueKey?.trim() || '';
  const storageName = storage.data.tableName?.trim() || '';
  if (!spreadsheetId || !sheetName || !idColumn || !storageName)
    throw new Error('Điền mã file, tên tab, cột khóa và vùng lưu trữ.');

  const conflictPolicy = diff.data.conflictPolicy as RunSyncRequestPayload['conflictPolicy'];
  if (!['ASK_TELEGRAM', 'SOURCE_WINS', 'DESTINATION_WINS'].includes(conflictPolicy))
    throw new Error('Chọn chính sách xung đột hợp lệ.');

  const notifyConflicts = !!telegram[0] && connects(diff.id, telegram[0].id, 'conflict');
  const chatId = telegram[0]?.data.chatId?.trim();
  if (notifyConflicts && !chatId)
    throw new Error('Điền Telegram Chat ID hoặc bỏ dây nối đến Telegram.');

  return {
    spreadsheetId,
    sheetName,
    idColumn,
    storageName,
    conflictPolicy,
    notifyConflicts,
    chatId,
  };
}

export async function flowIdFor(config: {
  spreadsheetId: string;
  sheetName: string;
  sheets?: SheetEndpointPayload[];
  syncColumns?: string[];
  idColumn: string;
  storageName: string;
}) {
  const payload =
    config.sheets && config.sheets.length >= 2
      ? [
          config.sheets.map((s) => [s.spreadsheetId, s.sheetName]),
          config.idColumn,
          [...(config.syncColumns || [])].sort(),
        ]
      : [config.spreadsheetId, config.sheetName, config.idColumn, config.storageName];
  const data = JSON.stringify(payload);
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  return `flow-${Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

export function cellRange(sheetName: string, columnIndex: number, rowIndex: number) {
  let col = columnIndex + 1;
  let letters = '';
  while (col > 0) {
    col--;
    letters = String.fromCharCode(65 + (col % 26)) + letters;
    col = Math.floor(col / 26);
  }
  return `'${sheetName.replace(/'/g, "''")}'!${letters}${rowIndex + 2}`;
}
