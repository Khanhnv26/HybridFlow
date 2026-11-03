import type { RouterConditionItem } from '../types';

export const conflictVariables = ['recordId', 'columnName', 'baseValue', 'valueA', 'valueB', 'id', 'column'];

export function invalidTemplateVariables(template: string, columns: string[]) {
  return [...new Set([...template.matchAll(/\{([^}]+)\}/g)].map(match => match[1].trim()).filter(name => !columns.includes(name)))];
}

export function renderTemplatePreview(template: string, row: Record<string, string>) {
  return template.replace(/\{([^}]+)\}/g, (_, name: string) => row[name.trim()] ?? '');
}

// This preview only filters current values; event kinds and CHANGED_TO require a stored before image.
export function matchesCurrentValues(conditions: RouterConditionItem[], mode: 'ALL' | 'ANY', row: Record<string, string>) {
  const matches = conditions.map(condition => {
    const value = row[condition.columnName] ?? '';
    const expected = condition.value ?? '';
    switch (condition.operator) {
      case 'EQUALS': case 'CHANGED_TO': return value === expected;
      case 'NOT_EQUALS': return value !== expected;
      case 'CONTAINS': return value.toLowerCase().includes(expected.toLowerCase());
      case 'IS_NOT_EMPTY': return value.trim() !== '';
    }
  });
  return matches.length > 0 && (mode === 'ALL' ? matches.every(Boolean) : matches.some(Boolean));
}
