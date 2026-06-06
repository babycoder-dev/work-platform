import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';

describe('Button', () => {
  it('renders variants, icon slot, block and size classes', () => {
    render(
      <Button block icon="+" size="lg" variant="primary">
        保存
      </Button>,
    );

    expect(screen.getByRole('button', { name: '保存' })).toHaveClass(
      'work-button--primary',
      'work-button--lg',
      'work-button--block',
    );
  });

  it('does not fire when disabled', async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick} variant="danger">
        删除
      </Button>,
    );

    await userEvent.click(screen.getByRole('button', { name: '删除' }));
    expect(onClick).not.toHaveBeenCalled();
  });
});
