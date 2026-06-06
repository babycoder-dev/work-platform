import { cx } from '../shared';

export function Avatar({ name, size = 'default' }: { name: string; size?: 'sm' | 'default' | 'lg' }) {
  const initial = name.trim().slice(0, 1) || '?';
  return <span className={cx('work-avatar', size !== 'default' && `work-avatar--${size}`)}>{initial}</span>;
}
