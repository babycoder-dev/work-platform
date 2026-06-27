export function formatCustomFieldDisplay(value: unknown): string {
  if (value === undefined || value === null || value === '') {
    return '—';
  }
  if (Array.isArray(value)) {
    return value.length > 0 ? value.map(formatDisplayItem).join('、') : '—';
  }
  return formatDisplayItem(value);
}

function formatDisplayItem(value: unknown): string {
  if (isRecord(value)) {
    if (typeof value.label === 'string') {
      return value.label;
    }
    if (typeof value.name === 'string') {
      return value.name;
    }
    return JSON.stringify(value);
  }
  return String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
