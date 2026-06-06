import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Pager } from './Pager';

describe('Pager', () => {
  it('emits previous and next page and disables boundaries', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<Pager onChange={onChange} page={2} pageSize={10} total={25} />);

    await userEvent.click(screen.getByRole('button', { name: '上一页' }));
    await userEvent.click(screen.getByRole('button', { name: '下一页' }));
    expect(onChange).toHaveBeenCalledWith(1);
    expect(onChange).toHaveBeenCalledWith(3);

    rerender(<Pager onChange={onChange} page={1} pageSize={10} total={25} />);
    expect(screen.getByRole('button', { name: '上一页' })).toBeDisabled();
  });
});
