import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Tabs } from './Tabs';

describe('Tabs', () => {
  it('renders active tab and emits controlled value', async () => {
    const onChange = vi.fn();
    render(
      <Tabs
        items={[
          { value: 'all', label: '全部' },
          { value: 'todo', label: '待办' },
        ]}
        onChange={onChange}
        value="all"
      />,
    );

    expect(screen.getByRole('tab', { name: '全部' })).toHaveClass('work-tab--active');
    await userEvent.click(screen.getByRole('tab', { name: '待办' }));
    expect(onChange).toHaveBeenCalledWith('todo');
  });
});
