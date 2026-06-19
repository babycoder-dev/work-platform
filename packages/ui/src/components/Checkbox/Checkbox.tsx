import type { InputHTMLAttributes, ReactNode } from 'react';
import { Icon } from '../Icon/Icon';

/**
 * Custom-drawn checkbox matching the design handoff `.checkbox` / `.checkbox.on`
 * (blue fill + white check SVG when selected). The native input is kept for
 * accessibility (visually hidden) so it stays keyboard- and label-addressable.
 */
export function Checkbox({
  label,
  ...props
}: { label: ReactNode } & Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  return (
    <label className="work-checkbox">
      <input type="checkbox" {...props} />
      <span className="work-checkbox__box" aria-hidden="true">
        <Icon className="work-checkbox__check" name="check" />
      </span>
      <span className="work-checkbox__label">{label}</span>
    </label>
  );
}
