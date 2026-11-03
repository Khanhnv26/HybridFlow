import type { RouterConditionItem } from '../types';

export const conflictVariables = ['recordId', 'columnName', 'baseValue', 'valueA', 'valueB', 'id', 'column'];

export function invalidTemplateVariables(template: string, columns: string[]) {
  return [...new Set([...template.matchAll(/\{([^}]+)\}/g)].map(match => match[1].trim()).filter(name => !columns.includes(name)))];
}

export function renderTemplatePreview(template: string, row: Record<string, string>) {
  return template.replace(/\{([^}]+)\}/g, (_, name: string) => row[name.trim()] ?? '');
}

export function isNumericOperator(operator: string) {
  return ['GREATER_THAN', 'LESS_THAN', 'GREATER_OR_EQUAL', 'LESS_OR_EQUAL'].includes(operator);
}

export function requiresConditionValue(operator: string) {
  return !['IS_NOT_EMPTY', 'IS_EMPTY', 'COLUMN_CHANGED'].includes(operator);
}

export function isEventOperator(operator: string) {
  return operator === 'CHANGED_TO' || operator === 'COLUMN_CHANGED';
}

export function isValidRuleNumber(value: string | undefined) {
  if (!value?.trim() || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim())) return false;
  const significant = value.trim().split(/[eE]/)[0].replace(/^[+-]/, '').replace('.', '').replace(/^0+/, '').replace(/0+$/, '');
  const number = Number(value);
  return Number.isFinite(number) && significant.length <= 15 && (number !== 0 || significant.length === 0);
}

// Current rows cannot establish event kinds, before images or verification status.
export function matchesCurrentValues(conditions: RouterConditionItem[], mode: 'ALL' | 'ANY', row: Record<string, string>) {
  if (conditions.some(condition => isEventOperator(condition.operator)
    || isNumericOperator(condition.operator) && (!isValidRuleNumber(row[condition.columnName]) || !isValidRuleNumber(condition.value)))) return false;
  const matches = conditions.map(condition => {
    const value = row[condition.columnName] ?? '';
    const expected = condition.value ?? '';
    switch (condition.operator) {
      case 'EQUALS': return value === expected;
      case 'NOT_EQUALS': return value !== expected;
      case 'CONTAINS': return value.toLowerCase().includes(expected.toLowerCase());
      case 'IS_NOT_EMPTY': return value.trim() !== '';
      case 'IS_EMPTY': return value.trim() === '';
      case 'GREATER_THAN': return Number(value) > Number(expected);
      case 'LESS_THAN': return Number(value) < Number(expected);
      case 'GREATER_OR_EQUAL': return Number(value) >= Number(expected);
      case 'LESS_OR_EQUAL': return Number(value) <= Number(expected);
      default: return false;
    }
  });
  return matches.length > 0 && (mode === 'ALL' ? matches.every(Boolean) : matches.some(Boolean));
}
