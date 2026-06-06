import { useEffect } from 'react';

export function Toast({
  message,
  durationMs = 3000,
  onClose,
}: {
  message: string;
  durationMs?: number;
  onClose?: () => void;
}) {
  useEffect(() => {
    if (!onClose || durationMs <= 0) {
      return undefined;
    }
    const timer = window.setTimeout(onClose, durationMs);
    return () => window.clearTimeout(timer);
  }, [durationMs, onClose]);

  return (
    <div className="work-toast" role="status">
      {message}
    </div>
  );
}
