import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Segmented } from './Segmented';

describe('Segmented', () => {
  it('renders active item and emits selected value', async () => {
    const onChange = vi.fn();
    render(
      <Segmented
        items={[
          { value: 'week', label: '本周' },
          { value: 'month', label: '本月' },
        ]}
        onChange={onChange}
        value="week"
      />,
    );

    expect(screen.getByRole('button', { name: '本周' })).toHaveClass('work-segmented__item--active');
    await userEvent.click(screen.getByRole('button', { name: '本月' }));
    expect(onChange).toHaveBeenCalledWith('month');
  });
});
