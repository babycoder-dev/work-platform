import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '../shared';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'default' | 'text' | 'danger';
  size?: 'default' | 'lg' | 'sm';
  block?: boolean;
  icon?: ReactNode;
}

export function Button({
  variant = 'default',
  size = 'default',
  block,
  icon,
  children,
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      className={cx(
        'work-button',
        `work-button--${variant}`,
        size !== 'default' && `work-button--${size}`,
        block && 'work-button--block',
        className,
      )}
      type={type}
      {...props}
    >
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      {children}
    </button>
  );
}
