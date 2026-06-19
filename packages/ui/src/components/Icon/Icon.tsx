import type { ReactNode, SVGProps } from 'react';
import { cx } from '../shared';

/**
 * Line-icon set lifted verbatim from the design handoff
 * (`docs/design/ui-handoff/design/{工作台,企业工作台设计规范}.html`).
 * Replaces emoji/first-letter placeholders so icons render identically
 * across platforms (fidelity gate A2: zero emoji as icons).
 *
 * All icons share a 24×24 viewBox, `fill="none"`, `stroke="currentColor"`;
 * colour comes from the consumer via `currentColor`, size from consumer CSS
 * (mirrors the design, e.g. `.icon-btn svg{width:18px}`, `.btn svg{width:15px}`).
 */
interface IconDef {
  body: ReactNode;
  strokeWidth?: number;
}

const ICONS = {
  dashboard: {
    body: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </>
    ),
  },
  message: { body: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /> },
  todo: {
    body: (
      <>
        <path d="M9 11l3 3 8-8" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </>
    ),
  },
  appbox: {
    body: (
      <>
        <path d="M3 7l9-4 9 4-9 4-9-4z" />
        <path d="M3 7v10l9 4 9-4V7" />
      </>
    ),
  },
  approval: {
    body: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 9h18M9 4v16" />
      </>
    ),
  },
  doc: {
    body: (
      <>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6M9 13h6M9 17h6" />
      </>
    ),
  },
  users: {
    body: (
      <>
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13A4 4 0 0 1 16 11" />
      </>
    ),
  },
  settings: {
    body: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 2h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 0 0 5 12a7 7 0 0 0 .1 1.2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 22h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6A7 7 0 0 0 19 12z" />
      </>
    ),
  },
  menu: { body: <path d="M4 6h16M4 12h16M4 18h16" /> },
  search: {
    body: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4-4" />
      </>
    ),
    strokeWidth: 2,
  },
  bell: {
    body: (
      <>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.7 21a2 2 0 0 1-3.4 0" />
      </>
    ),
  },
  help: {
    body: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" />
        <path d="M12 17h.01" />
      </>
    ),
  },
  user: {
    body: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
      </>
    ),
  },
  lock: {
    body: (
      <>
        <rect x="5" y="11" width="14" height="9" rx="2" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </>
    ),
  },
  clock: {
    body: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
  },
  status: {
    body: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v4l3 2" />
      </>
    ),
  },
  finance: {
    body: (
      <>
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M2 10h20" />
      </>
    ),
  },
  calendar: {
    body: (
      <>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </>
    ),
  },
  checkCircle: {
    body: (
      <>
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <path d="M22 4L12 14.01l-3-3" />
      </>
    ),
  },
  preference: {
    body: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      </>
    ),
  },
  logout: { body: <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /> },
  check: { body: <path d="M5 12l5 5L20 6" />, strokeWidth: 3 },
  chevronRight: { body: <path d="M9 18l6-6-6-6" />, strokeWidth: 2 },
  refresh: {
    body: (
      <>
        <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
        <path d="M21 3v5h-5" />
      </>
    ),
    strokeWidth: 2,
  },
  plus: { body: <path d="M12 5v14M5 12h14" />, strokeWidth: 2 },
  alert: {
    body: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v4M12 16h.01" />
      </>
    ),
    strokeWidth: 2,
  },
} satisfies Record<string, IconDef>;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  className,
  ...props
}: { name: IconName } & Omit<SVGProps<SVGSVGElement>, 'name'>) {
  const def: IconDef = ICONS[name];
  return (
    <svg
      aria-hidden="true"
      className={cx('work-icon', className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={def.strokeWidth ?? 1.8}
      viewBox="0 0 24 24"
      {...props}
    >
      {def.body}
    </svg>
  );
}
