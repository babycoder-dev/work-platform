import { type TextareaHTMLAttributes, useId } from 'react';
import type { FieldProps } from '../field';
import { cx } from '../shared';

export type TextareaProps = Omit<FieldProps, 'prefix' | 'size'> &
  TextareaHTMLAttributes<HTMLTextAreaElement>;

export function Textarea({
  label,
  className,
  id,
  ...props
}: TextareaProps) {
  const generatedId = useId();
  const textareaId = id ?? generatedId;
  const textarea = (
    <textarea aria-label={label} className={cx('work-textarea', className)} id={textareaId} {...props} />
  );

  if (!label) {
    return textarea;
  }

  return (
    <label className="work-field" htmlFor={textareaId}>
      <span className="work-field__label">{label}</span>
      {textarea}
    </label>
  );
}
