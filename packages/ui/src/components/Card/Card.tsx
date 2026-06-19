import type { ReactNode } from 'react';
import { cx } from '../shared';

/**
 * White rounded content card matching the design handoff `.card` / `.card-head`
 * (`docs/design/ui-handoff/design/企业工作台设计规范.html`). Header is optional;
 * `flush` drops body padding so edge-to-edge lists (feeds, tables) sit correctly.
 */
export function Card({
  title,
  count,
  action,
  flush,
  className,
  children,
}: {
  title?: ReactNode;
  count?: ReactNode;
  action?: ReactNode;
  flush?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const hasHeader = title != null || action != null;
  return (
    <section className={cx('work-card', className)}>
      {hasHeader ? (
        <header className="work-card__head">
          {title != null ? <h3 className="work-card__title">{title}</h3> : null}
          {count != null ? <span className="work-card__count">{count}</span> : null}
          {action != null ? <div className="work-card__action">{action}</div> : null}
        </header>
      ) : null}
      <div className={cx('work-card__body', flush && 'work-card__body--flush')}>{children}</div>
    </section>
  );
}
