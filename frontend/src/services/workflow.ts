import { isValidRuleNumber } from './notificationPreview';
import type {
  ActionPlanPayload,
  ColumnTransformConfig,
  OrchestrationNodeData,
  RouterPlanPayload,
  RunSyncRequestPayload,
  SheetEndpointPayload,
} from '../types';

type WorkflowNode = { id: string; type?: string; data: OrchestrationNodeData };
type WorkflowEdge = {
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
};
const supported = new Set([
  'sheetsTrigger',
  'scheduleTrigger',
  'diffEngine',
  'storageAction',
  'telegramAction',
  'routerCondition',
]);

// A transform receives one or more Sheets and feeds exactly one comparison node.
function transformPaths(nodes: WorkflowNode[], edges: WorkflowEdge[]) {
  const settings = new Map<string, { transforms: ColumnTransformConfig[]; writeBackCleanData: boolean }>();
  let resolved = [...edges];
  for (const node of nodes.filter(n => n.type === 'dataTransform')) {
    const incoming = edges.filter(e => e.target === node.id);
    const outgoing = edges.filter(e => e.source === node.id);
    const target = nodes.find(n => n.id === outgoing[0]?.target);
    if (incoming.length === 0 || outgoing.length !== 1 || target?.type !== 'diffEngine'
      || outgoing[0].sourceHandle !== 'out' || outgoing[0].targetHandle !== 'in')
      throw new Error('Nối Sheet → Chuẩn Hóa Dữ Liệu → So khớp; không nối song song hoặc nối chuỗi.');

    const sourceIds = new Set<string>();
    for (const inEdge of incoming) {
      const source = nodes.find(n => n.id === inEdge.source);
      if (source?.type !== 'sheetsTrigger' || inEdge.sourceHandle !== 'out' || inEdge.targetHandle !== 'in'
        || sourceIds.has(source.id) || settings.has(source.id) || edges.some(e => (e.source === source.id && e.target === target.id)
          || (e.source === target.id && e.target === source.id)))
        throw new Error('Nối Sheet → Chuẩn Hóa Dữ Liệu → So khớp; không nối trùng, song song hoặc nối chuỗi.');
      sourceIds.add(source.id);
    }

    const transforms = node.data.transforms || [];
    const seen = new Set<string>();
    for (const config of transforms) {
      if (!config.columnName || seen.has(config.columnName) || !Array.isArray(config.rules)
        || config.rules.some(rule => !['TRIM','UPPERCASE','LOWERCASE','CAPITALIZE','PHONE_VN','DEFAULT_IF_EMPTY'].includes(rule)))
        throw new Error('Cột hoặc quy tắc chuẩn hóa không hợp lệ.');
      seen.add(config.columnName);
    }

    for (const inEdge of incoming) {
      settings.set(inEdge.source, { transforms, writeBackCleanData: node.data.writeBackBySource?.[inEdge.source] ?? !!node.data.writeBackCleanData });
      resolved.push({ source: inEdge.source, target: target.id, sourceHandle: 'out', targetHandle: 'in' });
    }
    resolved = resolved.filter(e => e.source !== node.id && e.target !== node.id);
  }
  return { nodes: nodes.filter(n => n.type !== 'dataTransform'), edges: resolved, settings };
}

export function workflowConfig(nodes: WorkflowNode[], edges: WorkflowEdge[]) {
  const ids = new Set<string>();
  for (const node of nodes) {
    if (!node.id || ids.has(node.id)) throw new Error('Mã khối không hợp lệ hoặc bị trùng.');
    ids.add(node.id);
  }
  const normalized = transformPaths(nodes, edges);
  const config = baseWorkflowConfig(normalized.nodes, normalized.edges);
  if ('sheets' in config && config.sheets) return { ...config, sheets: config.sheets.map((sheet: any) => ({ ...sheet, ...normalized.settings.get(sheet.nodeId) })) };
  const source = normalized.nodes.find(n => n.type === 'sheetsTrigger');
  return { ...config, ...normalized.settings.get(source?.id || '') };
}

function baseWorkflowConfig(nodes: WorkflowNode[], edges: WorkflowEdge[]) {
  if (nodes.some((n) => !supported.has(n.type || '')))
    throw new Error('Luồng có khối chưa được hỗ trợ thực thi.');

  const diffs = nodes.filter((n) => n.type === 'diffEngine');
  if (diffs.length !== 1) throw new Error('Luồng cần đúng một khối diffEngine.');
  const diff = diffs[0];
  const columnTypes = diff.data.columnTypes || {};
  if (Object.values(columnTypes).some(type => !['TEXT', 'NUMBER'].includes(type))) throw new Error('Kiểu cột không hợp lệ.');
  if (columnTypes[diff.data.uniqueKey?.trim() || 'id'] === 'NUMBER') throw new Error('Cột khóa phải giữ kiểu Văn bản.');

  const edgeSignatures = new Set<string>();
  for (const edge of edges) {
    const sig = `${edge.source}:${edge.sourceHandle || ''}->${edge.target}:${edge.targetHandle || ''}`;
    if (edgeSignatures.has(sig)) throw new Error('Có dây nối trùng lặp trong luồng.');
    edgeSignatures.add(sig);
  }

  const routerNodes = nodes.filter((n) => n.type === 'routerCondition');
  const telegramNodes = nodes.filter((n) => n.type === 'telegramAction');

  const routerPlans: RouterPlanPayload[] = [];
  for (const rNode of routerNodes) {
    if (!edges.some((e) => e.source === diff.id && e.sourceHandle === 'clean' && e.target === rNode.id && e.targetHandle === 'in')) {
      throw new Error('Khối Rẽ Nhánh Điều Kiện phải được nối từ cổng Hành động của khối So khớp.');
    }
    for (const e of edges) {
      if (e.target === rNode.id && (e.source !== diff.id || e.sourceHandle !== 'clean' || e.targetHandle !== 'in')) {
        throw new Error('Đường vào khối Rẽ Nhánh Điều Kiện không hợp lệ.');
      }
    }
    const actionTargets: string[] = [];
    for (const e of edges) {
      if (e.source === rNode.id) {
        if (e.sourceHandle !== 'out' || e.targetHandle !== 'in') {
          throw new Error('Đường ra khối Rẽ Nhánh Điều Kiện không hợp lệ.');
        }
        if (!telegramNodes.some((t) => t.id === e.target)) {
          throw new Error('Khối Rẽ Nhánh Điều Kiện chỉ được nối tới khối thông báo.');
        }
        actionTargets.push(e.target);
      }
    }
    if (actionTargets.length === 0) {
      throw new Error('Khối Rẽ Nhánh Điều Kiện cần nối tới ít nhất một khối thông báo.');
    }
    const conditions = (rNode.data.routerConditions || rNode.data.conditions || []);
    if (conditions.length === 0) {
      throw new Error('Khối Rẽ Nhánh Điều Kiện cần ít nhất một điều kiện.');
    }
    const trigger = rNode.data.routerTriggerOn || rNode.data.triggerOn || 'CHANGED';
    const mode = rNode.data.routerMatchMode || rNode.data.matchMode || 'ALL';
    if (!['CHANGED', 'CREATED', 'UPDATED'].includes(trigger) || !['ALL', 'ANY'].includes(mode)) throw new Error('Cấu hình KHI/NẾU không hợp lệ.');
    for (const condition of conditions) {
      if (!condition.columnName?.trim() || !['CHANGED_TO', 'EQUALS', 'NOT_EQUALS', 'CONTAINS', 'IS_NOT_EMPTY', 'IS_EMPTY', 'COLUMN_CHANGED', 'GREATER_THAN', 'LESS_THAN', 'GREATER_OR_EQUAL', 'LESS_OR_EQUAL'].includes(condition.operator)
          || !['IS_NOT_EMPTY', 'IS_EMPTY', 'COLUMN_CHANGED'].includes(condition.operator) && condition.value == null) throw new Error('Điều kiện rẽ nhánh thiếu cột, sai toán tử hoặc thiếu value.');
      if (['GREATER_THAN', 'LESS_THAN', 'GREATER_OR_EQUAL', 'LESS_OR_EQUAL'].includes(condition.operator)) {
        if (columnTypes[condition.columnName] !== 'NUMBER') throw new Error('Chọn kiểu Số cho cột ' + condition.columnName + ' trước khi so sánh số.');
        if (!isValidRuleNumber(condition.value))
          throw new Error('Giá trị so sánh số không hợp lệ.');
      }
    }
    routerPlans.push({
      nodeId: rNode.id,
      triggerOn: trigger,
      matchMode: mode,
      conditions,
      actionNodeIds: actionTargets,
    });
  }

  const actionPlans: ActionPlanPayload[] = [];
  const conflictActionIds: string[] = [];
  for (const tNode of telegramNodes) {
    const receivingConflict = edges.some(
      (e) =>
        e.source === diff.id &&
        e.sourceHandle === 'conflict' &&
        e.target === tNode.id &&
        e.targetHandle === 'in',
    );
    const receivingRouter = routerPlans.some((rp) => rp.actionNodeIds.includes(tNode.id));
    if (!receivingConflict && !receivingRouter) {
      throw new Error('Khối Telegram cần ít nhất một dây vào.');
    }
    const tChatId = tNode.data.chatId?.trim() || '';
    if (!tChatId) {
      throw new Error('Điền Telegram Chat ID hoặc bỏ dây nối đến Telegram.');
    }
    if (receivingConflict) {
      conflictActionIds.push(tNode.id);
    }
    for (const e of edges) {
      if (e.target === tNode.id) {
        const fromDiff = e.source === diff.id && e.sourceHandle === 'conflict' && e.targetHandle === 'in';
        const fromRouter = routerNodes.some((rn) => rn.id === e.source) && e.sourceHandle === 'out' && e.targetHandle === 'in';
        if (!fromDiff && !fromRouter) {
          throw new Error('Có dây nối không được hỗ trợ trong luồng.');
        }
      }
    }
    actionPlans.push({
      nodeId: tNode.id,
      channel: 'TELEGRAM',
      chatId: tChatId,
      recordTemplate: tNode.data.recordTemplate,
      conflictTemplate: tNode.data.conflictTemplate,
    });
  }

  const schedules = nodes.filter((n) => n.type === 'scheduleTrigger');
  if (schedules.length > 1) throw new Error('Chỉ hỗ trợ một khối hẹn giờ trong mỗi luồng.');
  const scheduleIds = new Set(schedules.map((s) => s.id));
  if (
    schedules.some(
      (s) =>
        !edges.some(
          (e) =>
            e.source === s.id &&
            e.target === diff.id &&
            e.sourceHandle === 'out' &&
            e.targetHandle === 'trigger',
        ),
    )
  )
    throw new Error('Luồng có khối chưa được hỗ trợ thực thi hoặc chưa nối vào cổng kích hoạt.');

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
      (scheduleIds.has(edge.source) &&
        edge.target === diff.id &&
        edge.sourceHandle === 'out' &&
        edge.targetHandle === 'trigger') ||
      (edge.targetHandle === 'in' &&
        ((sheetIds.has(edge.source) && edge.target === diff.id && edge.sourceHandle === 'out') ||
          (edge.source === diff.id &&
            sheetIds.has(edge.target) &&
            edge.sourceHandle === 'clean') ||
          (edge.source === diff.id &&
            edge.sourceHandle === 'clean' &&
            routerNodes.some((rn) => rn.id === edge.target)) ||
          (edge.source === diff.id &&
            edge.sourceHandle === 'conflict' &&
            telegramNodes.some((tn) => tn.id === edge.target)) ||
          (routerNodes.some((rn) => rn.id === edge.source) &&
            edge.sourceHandle === 'out' &&
            telegramNodes.some((tn) => tn.id === edge.target))));
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
        spreadsheetTitle: sNode.data.spreadsheetTitle,
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

    return {
      spreadsheetId: sheets[0].spreadsheetId,
      sheetName: sheets[0].sheetName,
      sheets,
      syncColumns,
      idColumn,
      storageName: 'multi_sheet',
      conflictPolicy,
      notifyConflicts: conflictActionIds.length > 0,
      chatId: actionPlans[0]?.chatId || telegramNodes[0]?.data.chatId?.trim(),
      ...(Object.keys(columnTypes).length ? { columnTypes } : {}),
      ...(routerPlans.length ? { routers: routerPlans } : {}),
      ...(actionPlans.length ? { actions: actionPlans } : {}),
      ...(conflictActionIds.length ? { conflictActionIds } : {}),
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
    (scheduleIds.has(edge.source) &&
      edge.target === diff.id &&
      edge.sourceHandle === 'out' &&
      edge.targetHandle === 'trigger') ||
    (edge.targetHandle === 'in' &&
      ((edge.source === source.id && edge.target === diff.id && edge.sourceHandle === 'out') ||
        (edge.source === diff.id && edge.target === storage.id && edge.sourceHandle === 'clean') ||
        (edge.source === diff.id &&
          edge.sourceHandle === 'clean' &&
          routerNodes.some((rn) => rn.id === edge.target)) ||
        (edge.source === diff.id &&
          edge.sourceHandle === 'conflict' &&
          telegramNodes.some((tn) => tn.id === edge.target)) ||
        (routerNodes.some((rn) => rn.id === edge.source) &&
          edge.sourceHandle === 'out' &&
          telegramNodes.some((tn) => tn.id === edge.target))));
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

  const syncColumns = [...new Set((diff.data.sharedColumns || '').split(',').map((column) => column.trim()).filter((column) => column && column !== idColumn))].sort();
  if ((diff.data.sharedColumns || '').trim() && !syncColumns.length)
    throw new Error('Chọn ít nhất một cột dữ liệu ngoài cột khóa.');

  return {
    spreadsheetId,
    sheetName,
    idColumn,
    storageName,
    conflictPolicy,
    notifyConflicts: conflictActionIds.length > 0,
    chatId: actionPlans[0]?.chatId || telegramNodes[0]?.data.chatId?.trim(),
    ...(syncColumns.length ? { syncColumns } : {}),
    ...(Object.keys(columnTypes).length ? { columnTypes } : {}),
      ...(routerPlans.length ? { routers: routerPlans } : {}),
    ...(actionPlans.length ? { actions: actionPlans } : {}),
    ...(conflictActionIds.length ? { conflictActionIds } : {}),
  };
}

export async function flowIdFor(config: {
  columnTypes?: Record<string, 'TEXT' | 'NUMBER'>;
  spreadsheetId: string;
  sheetName: string;
  sheets?: SheetEndpointPayload[];
  syncColumns?: string[];
  idColumn: string;
  storageName: string;
  transforms?: ColumnTransformConfig[];
  writeBackCleanData?: boolean;
}) {
  const payload: unknown[] =
    config.sheets && config.sheets.length >= 2
      ? [
          config.sheets.map((s) => [s.spreadsheetId, s.sheetName]),
          config.idColumn,
          [...(config.syncColumns || [])].sort(),
        ]
      : [config.spreadsheetId, config.sheetName, config.idColumn, config.storageName,
          ...((config.syncColumns || []).length ? [[...(config.syncColumns || [])].sort()] : [])];
  const settings = config.sheets && config.sheets.length >= 2 ? config.sheets : [config];
  if (settings.some(s => (s.transforms || []).length || s.writeBackCleanData))
    payload.push(settings.map(s => [
      (s.transforms || []).map(c => [c.columnName, c.rules, c.defaultValue || '']),
      !!s.writeBackCleanData,
    ]));
  const types = Object.entries(config.columnTypes || {}).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  if (types.length) payload.push(['columnTypes', types]);
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

// Count a Sheet once even when it is wired to both ports of the same comparison block.
export function connectedSheetSources(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  diffId: string,
) {
  const transformedEdges = nodes.filter(n => n.type === 'dataTransform').flatMap(transform =>
    edges.filter(e => e.source === transform.id && e.target === diffId && e.sourceHandle === 'out' && e.targetHandle === 'in')
      .flatMap(() => edges.filter(e => e.target === transform.id && e.sourceHandle === 'out' && e.targetHandle === 'in')
        .map(e => ({ ...e, target: diffId }))));
  edges = [...edges, ...transformedEdges];
  return nodes
    .filter((node) => node.type === 'sheetsTrigger')
    .map((node, index) => ({ node, number: index + 1 }))
    .filter(({ node }) =>
      edges.some(
        (edge) =>
          (edge.source === node.id &&
            edge.sourceHandle === 'out' &&
            edge.target === diffId &&
            edge.targetHandle === 'in') ||
          (edge.source === diffId &&
            edge.sourceHandle === 'clean' &&
            edge.target === node.id &&
            edge.targetHandle === 'in'),
      ),
    )
    .map(({ node, number }) => ({
      nodeId: node.id,
      number,
      spreadsheetId: node.data.spreadsheetId || '',
      spreadsheetTitle: node.data.spreadsheetTitle,
      sheetName: node.data.sheetName || '',
    }));
}
