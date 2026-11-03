type LayoutNode = {
  id: string;
  type?: string;
  position: { x: number; y: number };
  measured?: { width?: number; height?: number };
};
type LayoutEdge = { source: string; target: string };

// Arrange the existing graph without changing its data or connections.
export function arrangeWorkflowNodes<T extends LayoutNode>(nodes: T[], edges: LayoutEdge[]): T[] {
  const positions = new Map<string, { x: number; y: number }>();
  const height = (node: T) => node.measured?.height || (node.type === 'sheetsTrigger' ? 210 : 190);
  const sheets = nodes.filter(node => node.type === 'sheetsTrigger');
  const transforms = nodes.filter(node => node.type === 'dataTransform');
  let sheetY = 60;
  for (const sheet of sheets) {
    positions.set(sheet.id, { x: 40, y: sheetY });
    sheetY += height(sheet) + 70;
  }
  let nextTransformY = 60;
  for (const transform of transforms) {
    const sources = sheets.filter(sheet => edges.some(edge => edge.source === sheet.id && edge.target === transform.id));
    const centers = sources.map(sheet => positions.get(sheet.id)!.y + height(sheet) / 2);
    const desired = centers.length ? (Math.min(...centers) + Math.max(...centers)) / 2 - height(transform) / 2 : nextTransformY;
    const y = Math.max(nextTransformY, desired);
    positions.set(transform.id, { x: 380, y });
    nextTransformY = y + height(transform) + 70;
  }
  const diffX = transforms.length ? 720 : 380;
  const center = Math.max(sheetY - 70, nextTransformY - 70, 250) / 2 + 30;
  const diffs = nodes.filter(node => node.type === 'diffEngine');
  let diffY = center - 95;
  for (const diff of diffs) {
    positions.set(diff.id, { x: diffX, y: diffY });
    diffY += height(diff) + 70;
  }
  const mainDiff = diffs[0];
  const mainY = mainDiff ? positions.get(mainDiff.id)!.y : center - 95;
  let triggerY = mainY - 270;
  let actionY = mainY + (mainDiff ? height(mainDiff) : 190) + 100;
  let midColY = mainY;
  let rightColY = mainY;

  // 1. Triggers
  for (const node of nodes.filter(n => n.type === 'scheduleTrigger')) {
    positions.set(node.id, { x: diffX, y: triggerY });
    triggerY -= height(node) + 70;
  }

  // 2. Mid column (diffX + 340): storageAction, then routerCondition
  for (const node of nodes.filter(n => n.type === 'storageAction')) {
    positions.set(node.id, { x: diffX + 340, y: midColY });
    midColY += height(node) + 70;
  }
  for (const node of nodes.filter(n => n.type === 'routerCondition')) {
    positions.set(node.id, { x: diffX + 340, y: midColY });
    midColY += height(node) + 70;
  }

  // 3. Telegram action nodes
  const routerIds = new Set(nodes.filter(n => n.type === 'routerCondition').map(n => n.id));
  for (const node of nodes.filter(n => n.type === 'telegramAction')) {
    const isDownstreamOfRouter = edges.some(e => e.target === node.id && routerIds.has(e.source));
    if (isDownstreamOfRouter) {
      positions.set(node.id, { x: diffX + 680, y: rightColY });
      rightColY += height(node) + 70;
    } else {
      positions.set(node.id, { x: diffX, y: actionY });
      actionY += height(node) + 70;
    }
  }

  // 4. Remaining nodes
  for (const node of nodes) {
    if (positions.has(node.id)) continue;
    positions.set(node.id, { x: diffX + 680, y: rightColY });
    rightColY += height(node) + 70;
  }

  return nodes.map(node => ({ ...node, position: positions.get(node.id)! }));
}
