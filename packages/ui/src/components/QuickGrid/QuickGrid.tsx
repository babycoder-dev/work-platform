import { Fragment, type ReactNode } from 'react';

export interface QuickGridItem {
  key: string;
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
}

export interface QuickGridProps<TItem extends QuickGridItem = QuickGridItem> {
  items: TItem[];
  renderItem?: (item: TItem) => ReactNode;
}

export function QuickGrid<TItem extends QuickGridItem = QuickGridItem>({ items, renderItem }: QuickGridProps<TItem>) {
  return (
    <div className="work-quick-grid">
      {items.map((item) =>
        renderItem ? (
          <Fragment key={item.key}>{renderItem(item)}</Fragment>
        ) : (
          <button className="work-quick-grid__item" key={item.key} type="button">
            {item.icon ? <span className="work-quick-grid__icon">{item.icon}</span> : null}
            <span>{item.title}</span>
            {item.description ? <small>{item.description}</small> : null}
          </button>
        ),
      )}
    </div>
  );
}
