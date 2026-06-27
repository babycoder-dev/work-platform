import { describe, expect, it } from 'vitest';
import { formatCustomFieldDisplay } from './custom-field-display';

describe('formatCustomFieldDisplay', () => {
  it('formats option and employee snapshots as readable text', () => {
    expect(formatCustomFieldDisplay({ key: 'a', label: '选项A' })).toBe('选项A');
    expect(
      formatCustomFieldDisplay([
        { key: 'one', label: '标签1' },
        { key: 'two', label: '标签2' },
      ]),
    ).toBe('标签1、标签2');
    expect(formatCustomFieldDisplay([{ id: 'employee-001', name: '张伟' }])).toBe('张伟');
  });

  it('preserves primitive and file-id display while safely serializing unknown objects', () => {
    expect(formatCustomFieldDisplay(['file-001', 'file-002'])).toBe('file-001、file-002');
    expect(formatCustomFieldDisplay({ key: 'value' })).toBe('{"key":"value"}');
    expect(formatCustomFieldDisplay(3)).toBe('3');
    expect(formatCustomFieldDisplay('')).toBe('—');
    expect(formatCustomFieldDisplay([])).toBe('—');
  });
});
