import type { InputHTMLAttributes, ReactNode } from 'react';

export function Switch({
  label,
  ...props
}: { label?: ReactNode } & Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  return (
    <label className="work-switch">
      <input type="checkbox" {...props} />
      <span className="work-switch__track">
        <span className="work-switch__thumb" />
      </span>
      {label ? <span>{label}</span> : null}
    </label>
  );
}
