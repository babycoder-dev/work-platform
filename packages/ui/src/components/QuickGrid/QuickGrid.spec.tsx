import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QuickGrid } from './QuickGrid';

describe('QuickGrid', () => {
  it('renders quick entry items without owning routing concerns', () => {
    render(<QuickGrid items={[{ key: 'presence', title: '在位看板', description: 'presence' }]} />);

    expect(screen.getByRole('button', { name: /在位看板/ })).toBeInTheDocument();
    expect(screen.getByText('presence')).toBeInTheDocument();
  });
});
