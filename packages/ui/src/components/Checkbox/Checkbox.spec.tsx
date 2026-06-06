import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Checkbox } from './Checkbox';

describe('Checkbox', () => {
  it('supports controlled checked and disabled state', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<Checkbox checked={false} label="记住登录" onChange={onChange} />);

    await userEvent.click(screen.getByLabelText('记住登录'));
    expect(onChange).toHaveBeenCalled();

    rerender(<Checkbox checked disabled label="记住登录" onChange={onChange} />);
    expect(screen.getByLabelText('记住登录')).toBeDisabled();
  });
});
