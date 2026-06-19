import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Icon } from '../Icon/Icon';
import { StatCard } from './StatCard';

describe('StatCard', () => {
  it('renders label, value, toned icon square and footer', () => {
    render(
      <StatCard
        footer={<span className="up">▲ 3</span>}
        icon={<Icon name="approval" />}
        label="待我审批"
        tone="warning"
        value={12}
      />,
    );

    expect(screen.getByText('待我审批')).toHaveClass('work-stat__label');
    expect(screen.getByText('12')).toHaveClass('work-stat__value', 'work-stat__value--warning');
    expect(screen.getByText('待我审批').previousSibling).toHaveClass('work-icon-square--warning');
    expect(screen.getByText('▲ 3')).toBeInTheDocument();
  });

  it('acts as a button when onClick is provided', async () => {
    const onClick = vi.fn();
    render(<StatCard icon={<Icon name="bell" />} label="未读消息" onClick={onClick} value={5} />);

    const card = screen.getByRole('button', { name: /未读消息/ });
    expect(card).toHaveClass('work-stat--interactive');
    await userEvent.click(card);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
