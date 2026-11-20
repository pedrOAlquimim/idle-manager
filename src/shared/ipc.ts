import type { AccountId, AppView, GameId, Layout, NewGameError, NewGameInput, Rect } from './types';

export const CHANNELS = {
  command: 'ui:command',
  view: 'ui:view',
  requestView: 'ui:request-view',
  probeReading: 'probe:reading',
  probeEscape: 'probe:escape',
  renameRequest: 'ui:rename-request',
  createGame: 'ui:create-game',
} as const;

export interface MeasuredScreen { accountId: AccountId; rect: Rect }

// Commands the account manager carries out.
export type ManagerCommand =
  | { type: 'select' | 'enable' | 'disable' | 'go-home' | 'reload' | 'toggle-sound'
      | 'detach' | 'reattach' | 'retry' | 'back-to-login'; accountId: AccountId }
  | { type: 'add-account'; gameId: GameId; name: string }
  | { type: 'rename-account'; accountId: AccountId; name: string }
  | { type: 'set-layout'; layout: Layout }
  | { type: 'toggle-focus'; accountId: AccountId }
  | { type: 'toggle-sidebar' | 'toggle-panel' | 'leave-focus' }
  | { type: 'set-notifications'; enabled: boolean }
  | { type: 'set-modal-open'; open: boolean }
  | { type: 'optimize'; accountId: AccountId }
  | { type: 'set-auto-optimize'; accountId: AccountId; hours: number | null; scope: 'account' | 'group' }
  | { type: 'screens'; screens: MeasuredScreen[] };

// Commands that need a native menu or the operating system: the window layer handles them, never the manager.
export type UiCommand =
  | { type: 'open-account-menu'; accountId: AccountId }
  | { type: 'open-group-menu'; gameId: GameId }
  | { type: 'open-data-folder' };

export type Command = ManagerCommand | UiCommand;

export interface WindowApi {
  requestView(): Promise<AppView>;
  onChange(listener: (view: AppView) => void): () => void;
  onRenameRequest(listener: (id: AccountId) => void): () => void;
  createGame(input: NewGameInput): Promise<NewGameError | null>;
  send(command: Command): void;
}

declare global { interface Window { idleManager: WindowApi } }
