import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from '../Button/Button';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('renders title, description and optional action', () => {
    render(<EmptyState action={<Button>刷新</Button>} description="数据待接入。" title="暂无数据" />);

    expect(screen.getByText('暂无数据')).toBeInTheDocument();
    expect(screen.getByText('数据待接入。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '刷新' })).toBeInTheDocument();
  });
});
