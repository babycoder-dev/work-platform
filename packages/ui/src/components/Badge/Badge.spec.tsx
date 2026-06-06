import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Badge } from './Badge';

describe('Badge', () => {
  it('renders count or explicit label', () => {
    const { rerender } = render(<Badge count={9} />);
    expect(screen.getByText('9')).toHaveClass('work-badge');

    rerender(<Badge count={9} label="通知角标预留" />);
    expect(screen.getByText('通知角标预留')).toHaveClass('work-badge');
  });
});
