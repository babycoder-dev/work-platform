import type { ReactNode } from 'react';
import { cx } from '../shared';

export type StatTone = 'blue' | 'warning' | 'success' | 'purple' | 'cyan' | 'danger' | 'neutral';

/**
 * Overview metric card matching the design handoff `.stat` block
 * (`docs/design/ui-handoff/design/工作台.html`): tinted icon square + label,
 * large tabular number, optional delta footer. `tone` drives the icon square
 * and number colour; all values resolve to tokens.
 */
export function StatCard({
  label,
  icon,
  tone = 'blue',
  value,
  footer,
  onClick,
  className,
}: {
  label: ReactNode;
  icon: ReactNode;
  tone?: StatTone;
  value: ReactNode;
  footer?: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const interactive = Boolean(onClick);
  return (
    <article
      className={cx('work-stat', interactive && 'work-stat--interactive', className)}
      onClick={onClick}
      onKeyDown={
        interactive
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
    >
      <div className="work-stat__top">
        <span className={cx('work-icon-square', `work-icon-square--${tone}`)} aria-hidden="true">
          {icon}
        </span>
        <span className="work-stat__label">{label}</span>
      </div>
      <div className={cx('work-stat__value', `work-stat__value--${tone}`)}>{value}</div>
      {footer != null ? <div className="work-stat__footer">{footer}</div> : null}
    </article>
  );
}
