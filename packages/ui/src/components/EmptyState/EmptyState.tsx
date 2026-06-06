import type { ReactNode } from 'react';

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <section className="work-empty">
      <div className="work-empty__art" aria-hidden="true">
        <div className="work-empty__card" />
      </div>
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      {action}
    </section>
  );
}
