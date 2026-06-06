import {
  cloneElement,
  isValidElement,
  type HTMLAttributes,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';

export function Dropdown({
  trigger,
  children,
  open,
  onOpenChange,
}: {
  trigger: ReactElement;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const isOpen = open ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    function handlePointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isOpen, setOpen]);

  return (
    <div className="work-dropdown" ref={rootRef}>
      {isValidElement(trigger)
        ? cloneElement(trigger as ReactElement<HTMLAttributes<HTMLElement>>, {
            onClick: (event: ReactMouseEvent) => {
              (trigger.props as { onClick?: (event: ReactMouseEvent) => void }).onClick?.(event);
              setOpen(!isOpen);
            },
            'aria-expanded': isOpen,
          })
        : trigger}
      {isOpen ? <div className="work-dropdown__overlay">{children}</div> : null}
    </div>
  );
}
