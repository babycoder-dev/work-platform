import type { ReactNode, SVGProps } from 'react';
import { cx } from '../shared';

export type IconName =
  | 'app'
  | 'bell'
  | 'building'
  | 'calendar'
  | 'check'
  | 'chevron-right'
  | 'file'
  | 'grid'
  | 'help'
  | 'home'
  | 'inbox'
  | 'lock'
  | 'menu'
  | 'message'
  | 'notification'
  | 'platform'
  | 'presence'
  | 'search'
  | 'shield'
  | 'user'
  | 'users';

export interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
  decorative?: boolean;
  size?: number;
}

const iconPaths: Record<IconName, ReactNode> = {
  app: (
    <>
      <rect height="7" rx="1.5" width="7" x="3" y="3" />
      <rect height="7" rx="1.5" width="7" x="14" y="3" />
      <rect height="7" rx="1.5" width="7" x="3" y="14" />
      <path d="M16 17.5h4" />
      <path d="M18 15.5v4" />
    </>
  ),
  bell: (
    <>
      <path d="M6.5 10.5a5.5 5.5 0 0 1 11 0v3.2l1.6 2.3H4.9l1.6-2.3z" />
      <path d="M9.8 19a2.4 2.4 0 0 0 4.4 0" />
    </>
  ),
  building: (
    <>
      <path d="M5 21V4.8c0-.9.7-1.6 1.6-1.6h7.8c.9 0 1.6.7 1.6 1.6V21" />
      <path d="M16 9h2.5c.8 0 1.5.7 1.5 1.5V21" />
      <path d="M8 7h5M8 11h5M8 15h5" />
    </>
  ),
  calendar: (
    <>
      <rect height="16" rx="2" width="16" x="4" y="5" />
      <path d="M8 3v4M16 3v4M4 10h16" />
    </>
  ),
  check: <path d="m5 12 4.2 4.2L19 6.8" />,
  'chevron-right': <path d="m9 6 6 6-6 6" />,
  file: (
    <>
      <path d="M7 3h7l4 4v14H7z" />
      <path d="M14 3v5h4M9.5 13h5M9.5 17h5" />
    </>
  ),
  grid: (
    <>
      <rect height="6" rx="1.5" width="6" x="4" y="4" />
      <rect height="6" rx="1.5" width="6" x="14" y="4" />
      <rect height="6" rx="1.5" width="6" x="4" y="14" />
      <rect height="6" rx="1.5" width="6" x="14" y="14" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.8 9.4a2.4 2.4 0 1 1 3.6 2.1c-.8.5-1.4 1.2-1.4 2.2" />
      <path d="M12 17.2v.1" />
    </>
  ),
  home: (
    <>
      <path d="m4 11 8-7 8 7" />
      <path d="M6.5 10v10h11V10" />
      <path d="M10 20v-5h4v5" />
    </>
  ),
  inbox: (
    <>
      <path d="M5 5h14l2 8v6H3v-6z" />
      <path d="M3 13h5l1.5 2h5L16 13h5" />
    </>
  ),
  lock: (
    <>
      <rect height="10" rx="2" width="14" x="5" y="10" />
      <path d="M8 10V7.8a4 4 0 0 1 8 0V10" />
      <path d="M12 14.2v2.4" />
    </>
  ),
  menu: (
    <>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </>
  ),
  message: (
    <>
      <path d="M5 5h14v10H9l-4 4z" />
      <path d="M8 9h8M8 12h5" />
    </>
  ),
  notification: (
    <>
      <path d="M6.5 10.5a5.5 5.5 0 0 1 11 0v3.2l1.6 2.3H4.9l1.6-2.3z" />
      <path d="M9.8 19a2.4 2.4 0 0 0 4.4 0" />
    </>
  ),
  platform: (
    <>
      <rect height="7" rx="1.5" width="7" x="3" y="3" />
      <rect height="7" rx="1.5" width="7" x="14" y="3" />
      <rect height="7" rx="1.5" width="7" x="3" y="14" />
      <rect height="7" rx="1.5" width="7" x="14" y="14" />
    </>
  ),
  presence: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
      <path d="m17.5 5.5 2 2 3-3" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 5.5 5.5v5.2c0 4.2 2.7 7.9 6.5 9.3 3.8-1.4 6.5-5.1 6.5-9.3V5.5z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M16 11a3 3 0 1 0-.8-5.9" />
      <path d="M16.5 18.5a4.8 4.8 0 0 0-2-4" />
    </>
  ),
};

export function Icon({ className, decorative = true, name, size = 18, ...props }: IconProps) {
  return (
    <svg
      aria-hidden={decorative ? 'true' : undefined}
      className={cx('work-icon', className)}
      fill="none"
      height={size}
      role={decorative ? undefined : 'img'}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      width={size}
      {...props}
    >
      {iconPaths[name]}
    </svg>
  );
}
