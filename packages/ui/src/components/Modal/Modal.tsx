import type { ReactNode } from 'react';
import { useEscape } from '../shared';

export function Modal({
  title,
  description,
  open,
  children,
  footer,
  onClose,
}: {
  title: string;
  description?: string;
  open: boolean;
  children?: ReactNode;
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
      <div className="work-modal-shell">
        <section className="work-modal" role="dialog">
          <div className="work-modal__body">
            <h2 className="work-modal__title">{title}</h2>
            {description ? <p className="work-modal__description">{description}</p> : null}
            {children}
          </div>
          {footer ? <footer className="work-modal__footer">{footer}</footer> : null}
        </section>
      </div>
    </>
  );
}
