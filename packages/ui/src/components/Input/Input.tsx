import { forwardRef, type InputHTMLAttributes, useId } from 'react';
import type { FieldProps } from '../field';
import { cx } from '../shared';

export type InputProps = FieldProps & Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix' | 'size'>;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, prefix, size = 'default', className, id, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hasPrefix = Boolean(prefix);
  const input = (
    <div className="work-control-wrap">
      {hasPrefix ? <span className="work-control-affix">{prefix}</span> : null}
      <input
        aria-label={label}
        className={cx(
          'work-input',
          size === 'lg' && 'work-input--lg',
          hasPrefix && 'work-input--affix',
          className,
        )}
        id={inputId}
        ref={ref}
        {...props}
      />
    </div>
  );

  if (!label) {
    return input;
  }

  return (
    <label className="work-field" htmlFor={inputId}>
      <span className="work-field__label">{label}</span>
      {input}
    </label>
  );
});
