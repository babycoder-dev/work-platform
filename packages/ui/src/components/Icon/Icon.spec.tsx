import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Icon } from './Icon';

describe('Icon', () => {
  it('renders a line SVG that inherits colour and is decorative by default', () => {
    const { container } = render(<Icon name="search" />);
    const svg = container.querySelector('svg');

    expect(svg).toBeInTheDocument();
    expect(svg).toHaveClass('work-icon');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('stroke', 'currentColor');
    expect(svg).toHaveAttribute('fill', 'none');
    // no emoji / text glyph fallbacks — icons must be vector paths
    expect(svg?.textContent).toBe('');
    expect(svg?.querySelector('path, rect, circle')).toBeInTheDocument();
  });

  it('passes through a custom class and renders distinct shapes per name', () => {
    const search = render(<Icon name="search" className="x" />).container.querySelector('svg');
    const dashboard = render(<Icon name="dashboard" />).container.querySelector('svg');

    expect(search).toHaveClass('work-icon', 'x');
    expect(dashboard?.querySelectorAll('rect')).toHaveLength(4);
  });
});
