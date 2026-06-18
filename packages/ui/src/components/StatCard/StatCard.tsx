import type { ReactNode } from 'react';
import { cx } from '../shared';

export interface StatCardProps {
  className?: string;
  delta?: ReactNode;
  deltaTone?: 'neutral' | 'up' | 'down';
  description?: ReactNode;
  icon?: ReactNode;
  label: ReactNode;
  value: ReactNode;
}

export function StatCard({
  className,
  delta,
  deltaTone = 'neutral',
  description,
  icon,
  label,
  value,
}: StatCardProps) {
  return (
    <article className={cx('work-stat-card', className)}>
      <div className="work-stat-card__main">
        <span>{label}</span>
        <strong>{value}</strong>
        {description ? <p>{description}</p> : null}
      </div>
      {icon ? <span className="work-stat-card__icon">{icon}</span> : null}
      {delta ? <span className={cx('work-stat-card__delta', `work-stat-card__delta--${deltaTone}`)}>{delta}</span> : null}
    </article>
  );
}
