import { type SelectHTMLAttributes, useId } from 'react';
import type { FieldProps } from '../field';
import { cx } from '../shared';

export type SelectProps = Omit<FieldProps, 'prefix'> &
  Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'>;

export function Select({ label, size = 'default', className, id, children, ...props }: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const select = (
    <select
      aria-label={label}
      className={cx('work-select', size === 'lg' && 'work-select--lg', className)}
      id={selectId}
      {...props}
    >
      {children}
    </select>
  );

  if (!label) {
    return select;
  }

  return (
    <label className="work-field" htmlFor={selectId}>
      <span className="work-field__label">{label}</span>
      {select}
    </label>
  );
}
