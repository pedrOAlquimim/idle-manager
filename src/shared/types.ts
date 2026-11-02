export type GameId = string & { readonly __brand: 'GameId' };
export type AccountId = string & { readonly __brand: 'AccountId' };
export const gameId = (value: string): GameId => value as GameId;
export const accountId = (value: string): AccountId => value as AccountId;

export type Layout = 'grid' | 'focus' | 'row';
export type AccountStatus =
  | 'off' | 'loading' | 'login' | 'connected'
  | 'notice' | 'reloading' | 'down' | 'blocked';

export interface Rect { x: number; y: number; width: number; height: number }

export interface StoredGame {
  id: GameId;
  name: string;
  startUrl: string;
}

export interface Game {
  id: GameId;
  name: string;
  startUrl: string;
  hosts: readonly string[];
  domain: string | null;
  allowHttp: boolean;
  accountLimit: number | null;
  sessionKey: string | null;
  readsSession: boolean;
  dot: string | null;
}

export interface StoredAccount {
  id: AccountId;
  gameId: GameId;
  name: string;
  enabled: boolean;
  muted: boolean;
  nick: string | null;
}

export interface Preferences {
  layout: Layout;
  selectedId: AccountId | null;
  sidebarOpen: boolean;
  panelOpen: boolean;
  notifications: boolean;
}

export interface AppData {
  version: 2;
  games: StoredGame[];
  accounts: StoredAccount[];
  nicks: Record<string, string[]>;
  preferences: Preferences;
}

export interface ProbeReading {
  gamePresent: boolean;
  gameVisible: boolean;
  hasSession: boolean;
  nick: string | null;
  sessionTaken: boolean;
  notice: string | null;
}

export interface UsageSample { memoryMb: number; cpu: number }
export interface HistoryEvent { id: number; accountId: AccountId; text: string; at: number }
export interface AccountColor { background: string; foreground: string; accent: string }

export interface AccountView {
  id: AccountId;
  gameId: GameId;
  name: string;
  initials: string;
  color: AccountColor;
  status: AccountStatus;
  message: string | null;
  attempts: number;
  enabledSince: number | null;
  muted: boolean;
  detached: boolean;
  host: string;
  partition: string;
  memoryMb: number[];
  cpu: number[];
  history: HistoryEvent[];
}

export interface GroupView {
  gameId: GameId;
  name: string;
  limit: number | null;
  suggestedName: string;
  accountIds: AccountId[];
  enabledCount: number;
  memoryMb: number;
}

export interface AppView {
  groups: GroupView[];
  accounts: AccountView[];
  preferences: Preferences;
  totalMemoryMb: number;
  totalCpu: number;
  ramFraction: number;
  attentionCount: number;
  version: string;
  now: number;
}

export type AccountError = 'limit-reached' | 'empty-name' | 'duplicate-name';
export type Result<T> = { ok: true; value: T } | { ok: false; error: AccountError };
