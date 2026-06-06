import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Input } from './Input';

describe('Input', () => {
  it('renders label, prefix and lg class', () => {
    render(<Input label="账号" prefix="@" size="lg" value="admin" readOnly />);

    expect(screen.getByLabelText('账号')).toHaveClass('work-input--lg', 'work-input--affix');
    expect(screen.getByLabelText('账号')).toHaveValue('admin');
  });

  it('supports controlled change and disabled state', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<Input label="姓名" onChange={onChange} value="" />);

    await userEvent.type(screen.getByLabelText('姓名'), '张');
    expect(onChange).toHaveBeenCalled();

    rerender(<Input disabled label="姓名" onChange={onChange} value="张三" />);
    expect(screen.getByLabelText('姓名')).toBeDisabled();
  });
});
