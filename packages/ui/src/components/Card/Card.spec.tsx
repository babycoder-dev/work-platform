import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Card } from './Card';

describe('Card', () => {
  it('renders title, count and action in the header and content in the body', () => {
    render(
      <Card title="待处理事项" count={9} action={<span>全部待办</span>}>
        <p>内容</p>
      </Card>,
    );

    expect(screen.getByRole('heading', { name: '待处理事项' })).toHaveClass('work-card__title');
    expect(screen.getByText('9')).toHaveClass('work-card__count');
    expect(screen.getByText('全部待办').closest('.work-card__action')).toBeInTheDocument();
    expect(screen.getByText('内容').closest('.work-card__body')).toBeInTheDocument();
  });

  it('omits the header when no title or action is given and supports a flush body', () => {
    const { container } = render(<Card flush>纯内容</Card>);

    expect(container.querySelector('.work-card__head')).not.toBeInTheDocument();
    expect(container.querySelector('.work-card__body')).toHaveClass('work-card__body--flush');
  });
});
