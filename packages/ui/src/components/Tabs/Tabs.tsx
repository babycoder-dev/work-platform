import type { ReactNode } from 'react';
import { cx } from '../shared';

export function Tabs<T extends string>({
  value,
  items,
  onChange,
}: {
  value: T;
  items: Array<{ value: T; label: ReactNode }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="work-tabs" role="tablist">
      {items.map((item) => (
        <button
          className={cx('work-tab', item.value === value && 'work-tab--active')}
          key={item.value}
          onClick={() => onChange(item.value)}
          role="tab"
          type="button"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
