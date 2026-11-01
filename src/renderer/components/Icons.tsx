import type { ReactNode } from 'react';

interface IconProps {
  size: number;
  children: ReactNode;
}

function Stroke({ size, children }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const CollapseIcon = () => <Stroke size={16}><path d="M11 17l-5-5 5-5M18 17l-5-5 5-5" /></Stroke>;
export const ExpandSidebarIcon = () => <Stroke size={14}><path d="M13 17l5-5-5-5M6 17l5-5-5-5" /></Stroke>;
export const DownIcon = () => <Stroke size={14}><path d="M6 9l6 6 6-6" /></Stroke>;
export const PlusIcon = () => <Stroke size={14}><path d="M12 5v14M5 12h14" /></Stroke>;
export const ExpandIcon = () => <Stroke size={13}><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></Stroke>;
export const HistoryIcon = () => <Stroke size={15}><path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 8v4l3 2" /></Stroke>;

export const GearIcon = () => (
  <Stroke size={15}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
  </Stroke>
);

export const GridIcon = () => (
  <Stroke size={15}>
    <rect x="3" y="3" width="7.5" height="7.5" rx="1" />
    <rect x="13.5" y="3" width="7.5" height="7.5" rx="1" />
    <rect x="3" y="13.5" width="7.5" height="7.5" rx="1" />
    <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1" />
  </Stroke>
);

export const FocusIcon = () => <Stroke size={15}><rect x="3" y="4" width="18" height="16" rx="1.5" /></Stroke>;

export const RowIcon = () => (
  <Stroke size={15}>
    <rect x="2" y="4" width="20" height="16" rx="1.5" />
    <path d="M7 4v16M12 4v16M17 4v16" />
  </Stroke>
);

export const LockIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--on)" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);

export const MoreIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="5" cy="12" r="1.7" />
    <circle cx="12" cy="12" r="1.7" />
    <circle cx="19" cy="12" r="1.7" />
  </svg>
);
