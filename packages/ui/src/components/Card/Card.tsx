import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '../shared';

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}

export function Card({ action, children, className, title, ...props }: CardProps) {
  return (
    <section className={cx('work-card', className)} {...props}>
      {title || action ? (
        <header className="work-card__head">
          {title ? <h2>{title}</h2> : <span />}
          {action}
        </header>
      ) : null}
      <div className="work-card__body">{children}</div>
    </section>
  );
}
