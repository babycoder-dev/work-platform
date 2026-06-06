import type { ReactNode } from 'react';
import { Button } from '../Button/Button';
import { cx, useEscape } from '../shared';

export function Drawer({
  title,
  open,
  width = 'default',
  children,
  footer,
  onClose,
}: {
  title: string;
  open: boolean;
  width?: 'default' | 'narrow';
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
}) {
  useEscape(open, onClose);
  if (!open) {
    return null;
  }

  return (
    <>
      <div className="work-scrim" onClick={onClose} />
      <aside className={cx('work-drawer', width === 'narrow' && 'work-drawer--narrow')} role="dialog">
        <header className="work-drawer__header">
          <strong>{title}</strong>
          <Button onClick={onClose} variant="text">
            关闭
          </Button>
        </header>
        <div className="work-drawer__body">{children}</div>
        {footer ? <footer className="work-drawer__footer">{footer}</footer> : null}
      </aside>
    </>
  );
}
