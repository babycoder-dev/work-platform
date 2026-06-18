import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Card } from './Card';

describe('Card', () => {
  it('renders a token-backed card with heading and action slot', () => {
    render(
      <Card action={<button type="button">更多</button>} title="最新消息">
        <p>暂无消息</p>
      </Card>,
    );

    expect(screen.getByRole('heading', { name: '最新消息' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '更多' })).toBeInTheDocument();
    expect(screen.getByText('暂无消息')).toBeInTheDocument();
  });
});
