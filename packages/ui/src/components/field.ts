import type { ReactNode } from 'react';

export interface FieldProps {
  label?: string;
  prefix?: ReactNode;
  size?: 'default' | 'lg';
  className?: string;
}
