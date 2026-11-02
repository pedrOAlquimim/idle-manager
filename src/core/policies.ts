import { MIN_ZOOM, UNSCALED_HEIGHT, USER_GESTURE_WINDOW_MS } from '../shared/constants';
import type { AccountStatus, AccountView, Layout } from '../shared/types';

export type NavigationDecision = 'inside' | 'external' | 'block';

// Only the game's own hosts stay inside an account, plus its whole `domain` when it has one. Everything
// else on the web goes to the default browser, and anything that is not http(s) never loads. `allowHttp`
// is for a game whose own address is http.
export function decideNavigation(
  url: string,
  hosts: readonly string[],
  allowHttp = false,
  domain: string | null = null,
): NavigationDecision {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'block';
  }
  const secure = parsed.protocol === 'https:';
  if (!secure && parsed.protocol !== 'http:') return 'block';
  const { hostname } = parsed;
  const ownHost = hosts.includes(hostname) || (domain !== null && (hostname === domain || hostname.endsWith(`.${domain}`)));
  return ownHost && (secure || allowHttp) ? 'inside' : 'external';
}

export function canOpenExternal(lastInputAt: number | null, now: number): boolean {
  if (lastInputAt === null) return false;
  const elapsed = now - lastInputAt;
  return elapsed >= 0 && elapsed <= USER_GESTURE_WINDOW_MS;
}

export interface KeyPress {
  type: string;
  key: string;
  control: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
}

// Ctrl+1 to Ctrl+9 pick an account by position. Plain digits stay with the game, which has a chat.
export function accountShortcut(input: KeyPress): number | null {
  if (input.type !== 'keyDown' || !input.control || input.shift || input.alt || input.meta) return null;
  return /^[1-9]$/.test(input.key) ? Number(input.key) : null;
}

// In the grid the game is scaled down so a whole 828px-tall game fits the smaller tile. The game's own
// automatic scaling stays idle at that size. Other layouts use the game at full size.
export function zoomForScreen(layout: Layout, areaHeight: number): number {
  if (layout !== 'grid' || !Number.isFinite(areaHeight)) return 1;
  return Math.min(1, Math.max(MIN_ZOOM, areaHeight / UNSCALED_HEIGHT));
}

const GRID_COLUMN_LIMITS: readonly { upTo: number; columns: number }[] = [
  { upTo: 1, columns: 1 },
  { upTo: 4, columns: 2 },
  { upTo: 9, columns: 3 },
];
const MOST_GRID_COLUMNS = 4;

export function gridShape(count: number, layout: Layout): { columns: number; rows: number } {
  if (layout === 'focus') return { columns: 1, rows: 1 };
  if (layout === 'row') return { columns: count, rows: 1 };
  const columns = GRID_COLUMN_LIMITS.find((limit) => count <= limit.upTo)?.columns ?? MOST_GRID_COLUMNS;
  return { columns, rows: Math.ceil(count / columns) };
}

const HIDDEN_STATUSES: readonly AccountStatus[] = ['off', 'down', 'blocked'];

export function isScreenHidden(account: Pick<AccountView, 'status' | 'detached'>): boolean {
  return account.detached || HIDDEN_STATUSES.includes(account.status);
}
