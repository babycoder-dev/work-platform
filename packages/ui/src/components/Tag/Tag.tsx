import type { ReactNode } from 'react';
import { cx } from '../shared';

export function Tag({
  color = 'gray',
  dot,
  children,
}: {
  color?: 'blue' | 'green' | 'orange' | 'red' | 'gray' | 'purple' | 'cyan';
  dot?: boolean;
  children: ReactNode;
}) {
  return (
    <span className={cx('work-tag', `work-tag--${color}`)}>
      {dot ? <span className="work-tag__dot" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}
