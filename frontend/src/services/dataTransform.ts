import type { ColumnTransformConfig } from '../types';

export const transformRules = [
  ['TRIM', 'Gọn khoảng trắng'], ['UPPERCASE', 'IN HOA'], ['LOWERCASE', 'chữ thường'],
  ['CAPITALIZE', 'Hoa Đầu Từ'], ['PHONE_VN', 'SĐT +84'], ['DEFAULT_IF_EMPTY', 'Điền ô trống'],
] as const;

export function transformValue(input: string | null | undefined, config: ColumnTransformConfig) {
  let value = input;
  for (const rule of config.rules) {
    if (rule === 'DEFAULT_IF_EMPTY') {
      if (value == null || !value.trim()) value = config.defaultValue || '';
    } else if (value != null) {
      switch (rule) {
        case 'TRIM': value = value.replace(/\s+/gu, ' ').trim(); break;
        case 'UPPERCASE': value = value.toUpperCase(); break;
        case 'LOWERCASE': value = value.toLowerCase(); break;
        case 'CAPITALIZE': value = value.toLowerCase().replace(/(^|\s)(\S)/gu, (_, space: string, letter: string) => space + letter.toUpperCase()); break;
        case 'PHONE_VN': {
          const compact = value.replace(/[\s().-]/gu, '');
          if (/^0[1-9][0-9]{8,9}$/.test(compact)) value = '+84' + compact.slice(1);
          else if (/^(?:84|\+84|0084)[1-9][0-9]{8,9}$/.test(compact)) value = '+84' + compact.replace(/^(?:\+84|0084|84)/, '');
          break;
        }
      }
    }
  }
  return value;
}
