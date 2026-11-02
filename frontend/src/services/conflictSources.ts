import type { OrchestrationNodeData, SyncConflictDto } from '../types';

export interface ConflictSource {
  key: string;
  number: number;
  spreadsheetId?: string;
  spreadsheetTitle?: string;
  sheetName?: string;
  legacyLabel?: string;
  value: string;
}
export function conflictSources(
  conflict: SyncConflictDto,
  sources: OrchestrationNodeData[] = [],
): ConflictSource[] {
  try {
    const endpoints: unknown = JSON.parse(conflict.endpointsJson || 'null');
    const observations: unknown = JSON.parse(conflict.observationsJson || 'null');
    if (
      Array.isArray(endpoints) &&
      observations &&
      typeof observations === 'object' &&
      !Array.isArray(observations)
    ) {
      const values = observations as { [key: string]: unknown };
      const result: ConflictSource[] = [];
      for (const [index, endpoint] of endpoints.entries()) {
        if (typeof endpoint?.spreadsheetId !== 'string' || typeof endpoint?.sheetName !== 'string')
          return [];
        const key = `${endpoint.spreadsheetId.length}:${endpoint.spreadsheetId}${endpoint.sheetName}`;
        const value = values[key];
        if (typeof value !== 'string') return [];
        const sourceIndex = sources.findIndex(
          (source) =>
            source.spreadsheetId === endpoint.spreadsheetId &&
            source.sheetName === endpoint.sheetName,
        );
        result.push({
          key,
          number: sourceIndex >= 0 ? sourceIndex + 1 : index + 1,
          spreadsheetId: endpoint.spreadsheetId,
          sheetName: endpoint.sheetName,
          spreadsheetTitle: sources[sourceIndex]?.spreadsheetTitle || endpoint.spreadsheetTitle,
          value,
        });
      }
      if (result.length) return result;
    }
  } catch {
    /* Older conflicts may only contain a label/value mapping. */
  }
  try {
    const parsed: unknown = JSON.parse(conflict.candidatesJson || 'null');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return [];
    return Object.entries(parsed)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
      .map(([legacyLabel, value], index) => ({
        key: `legacy-${index}`,
        number: index + 1,
        legacyLabel,
        value,
      }));
  } catch {
    return [];
  }
}
