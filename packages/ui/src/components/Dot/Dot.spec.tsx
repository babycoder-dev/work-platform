import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Dot } from './Dot';

describe('Dot', () => {
  it('renders an accessible unread dot', () => {
    render(<Dot label="通知角标预留" />);

    expect(screen.getByLabelText('通知角标预留')).toHaveClass('work-dot');
  });
});
