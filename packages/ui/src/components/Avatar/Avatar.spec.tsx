import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Avatar } from './Avatar';

describe('Avatar', () => {
  it('renders the first character and size class', () => {
    render(<Avatar name="张三" size="lg" />);

    expect(screen.getByText('张')).toHaveClass('work-avatar--lg');
  });

  it('falls back when the name is blank', () => {
    render(<Avatar name="" size="sm" />);

    expect(screen.getByText('?')).toHaveClass('work-avatar--sm');
  });
});
