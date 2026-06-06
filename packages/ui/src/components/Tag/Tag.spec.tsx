import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Tag } from './Tag';

describe('Tag', () => {
  it('renders color variants and optional dot', () => {
    render(
      <>
        <Tag color="green" dot>
          在岗
        </Tag>
        <Tag color="purple">内置</Tag>
      </>,
    );

    expect(screen.getByText('在岗')).toHaveClass('work-tag--green');
    expect(screen.getByText('在岗').querySelector('.work-tag__dot')).toBeInTheDocument();
    expect(screen.getByText('内置')).toHaveClass('work-tag--purple');
  });
});
