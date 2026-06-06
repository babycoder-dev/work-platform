import type { ReactNode } from 'react';

export function Menu({
  items,
  onSelect,
}: {
  items: Array<{ key: string; label: ReactNode; disabled?: boolean; icon?: ReactNode }>;
  onSelect?: (key: string) => void;
}) {
  return (
    <div className="work-menu" role="menu">
      {items.map((item) => (
        <button
          className="work-menu__item"
          disabled={item.disabled}
          key={item.key}
          onClick={() => onSelect?.(item.key)}
          role="menuitem"
          type="button"
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>
  );
}
