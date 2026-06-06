import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Toast } from './Toast';

describe('Toast', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders status message', () => {
    render(<Toast message="已保存" />);

    expect(screen.getByRole('status')).toHaveTextContent('已保存');
  });

  it('auto dismisses when onClose is provided', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(<Toast durationMs={500} message="已保存" onClose={onClose} />);

    vi.advanceTimersByTime(499);
    expect(onClose).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
