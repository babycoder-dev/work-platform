import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Icon } from './Icon';

describe('Icon', () => {
  it('renders the shared linear svg icon set', () => {
    render(<Icon aria-label="通知" decorative={false} name="bell" />);
    expect(screen.getByRole('img')).toHaveClass('work-icon');
    expect(screen.getByLabelText('通知')).toBeInTheDocument();
  });
});
