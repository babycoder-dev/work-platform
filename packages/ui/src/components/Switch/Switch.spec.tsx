import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Switch } from './Switch';

describe('Switch', () => {
  it('supports controlled checked and disabled state', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<Switch checked={false} label="启用" onChange={onChange} />);

    await userEvent.click(screen.getByLabelText('启用'));
    expect(onChange).toHaveBeenCalled();

    rerender(<Switch checked disabled label="启用" onChange={onChange} />);
    expect(screen.getByLabelText('启用')).toBeDisabled();
  });
});
