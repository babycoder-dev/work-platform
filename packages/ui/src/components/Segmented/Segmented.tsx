import type { ReactNode } from 'react';
import { cx } from '../shared';

export function Segmented<T extends string>({
  value,
  items,
  onChange,
}: {
  value: T;
  items: Array<{ value: T; label: ReactNode }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="work-segmented">
      {items.map((item) => (
        <button
          className={cx('work-segmented__item', item.value === value && 'work-segmented__item--active')}
          key={item.value}
          onClick={() => onChange(item.value)}
          type="button"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
