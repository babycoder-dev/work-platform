import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Icon } from '../Icon/Icon';
import { StatCard } from './StatCard';

describe('StatCard', () => {
  it('renders label, value, icon and delta state', () => {
    render(
      <StatCard
        delta="+2"
        deltaTone="up"
        description="来自真实未读数"
        icon={<Icon name="bell" />}
        label="未读消息"
        value={3}
      />,
    );

    expect(screen.getByText('未读消息')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('+2')).toHaveClass('work-stat-card__delta--up');
  });
});
