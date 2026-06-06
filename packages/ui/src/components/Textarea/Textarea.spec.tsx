import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Textarea } from './Textarea';

describe('Textarea', () => {
  it('renders labeled textarea', () => {
    render(<Textarea label="说明" value="备注" readOnly />);

    expect(screen.getByLabelText('说明')).toHaveValue('备注');
  });

  it('supports controlled typing and disabled state', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<Textarea label="备注" onChange={onChange} value="" />);

    await userEvent.type(screen.getByLabelText('备注'), 'a');
    expect(onChange).toHaveBeenCalled();

    rerender(<Textarea disabled label="备注" onChange={onChange} value="a" />);
    expect(screen.getByLabelText('备注')).toBeDisabled();
  });
});
