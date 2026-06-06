import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Select } from './Select';

describe('Select', () => {
  it('renders options and lg class', () => {
    render(
      <Select label="类型" size="lg" value="a" onChange={() => undefined}>
        <option value="a">选项 A</option>
      </Select>,
    );

    expect(screen.getByLabelText('类型')).toHaveClass('work-select--lg');
    expect(screen.getByRole('option', { name: '选项 A' })).toBeInTheDocument();
  });

  it('supports controlled selection and disabled state', async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <Select label="类型" value="a" onChange={onChange}>
        <option value="a">选项 A</option>
        <option value="b">选项 B</option>
      </Select>,
    );

    await userEvent.selectOptions(screen.getByLabelText('类型'), 'b');
    expect(onChange).toHaveBeenCalled();

    rerender(
      <Select disabled label="类型" value="a" onChange={onChange}>
        <option value="a">选项 A</option>
      </Select>,
    );
    expect(screen.getByLabelText('类型')).toBeDisabled();
  });
});
