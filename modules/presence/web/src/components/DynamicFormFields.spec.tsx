import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { FormsDefinitionMirror } from '../api/forms-mirror';
import { DynamicFormFields, hasRequiredUnsupportedPresenceFields } from './DynamicFormFields';
import { describe, expect, it, vi } from 'vitest';

const fields: FormsDefinitionMirror['fields'] = [
  { fieldKey: 'reason', label: '事由', fieldType: 'text', required: true, sortOrder: 1, status: 'active' },
  { fieldKey: 'detail', label: '详情', fieldType: 'textarea', required: false, sortOrder: 2, status: 'active' },
  { fieldKey: 'days', label: '天数', fieldType: 'number', required: false, sortOrder: 3, status: 'active' },
  { fieldKey: 'date', label: '拜访日期', fieldType: 'date', required: false, sortOrder: 4, status: 'active' },
  {
    fieldKey: 'transport',
    label: '交通方式',
    fieldType: 'single_select',
    required: false,
    sortOrder: 5,
    status: 'active',
    options: [{ key: 'train', label: '火车' }],
  },
  {
    fieldKey: 'tags',
    label: '标签',
    fieldType: 'multi_select',
    required: false,
    sortOrder: 6,
    status: 'active',
    options: [{ key: 'urgent', label: '紧急' }],
  },
  { fieldKey: 'receipt', label: '凭证', fieldType: 'file', required: true, sortOrder: 7, status: 'active' },
];

describe('DynamicFormFields', () => {
  it('renders six supported field controls and reports value changes', () => {
    const onChange = vi.fn();
    render(
      <DynamicFormFields
        fields={fields}
        onChange={onChange}
        values={{ reason: '', detail: '', days: '', date: '', transport: '', tags: [] }}
      />,
    );

    expect(screen.getByLabelText('事由')).toBeRequired();
    expect(screen.getByLabelText('详情')).toBeInTheDocument();
    expect(screen.getByLabelText('天数')).toHaveAttribute('type', 'number');
    expect(screen.getByLabelText('拜访日期')).toHaveAttribute('type', 'date');
    expect(screen.getByLabelText('交通方式')).toBeInTheDocument();
    expect(screen.getByLabelText('紧急')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('事由'), { target: { value: '客户拜访' } });
    fireEvent.click(screen.getByLabelText('紧急'));

    expect(onChange).toHaveBeenCalledWith('reason', '客户拜访');
    expect(onChange).toHaveBeenCalledWith('tags', ['urgent']);
  });

  it('shows an honest unsupported-field placeholder and identifies required blockers', () => {
    render(<DynamicFormFields fields={fields} onChange={vi.fn()} values={{}} />);

    expect(screen.getByText('凭证')).toBeInTheDocument();
    expect(screen.getByText('暂不支持的字段类型')).toBeInTheDocument();
    expect(hasRequiredUnsupportedPresenceFields(fields)).toBe(true);
    expect(hasRequiredUnsupportedPresenceFields([{ ...fields[6], required: false }])).toBe(false);
  });
});
