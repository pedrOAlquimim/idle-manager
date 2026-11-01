import type { AccountId, AppView, GameId, Layout, Rect } from './types';

export const CHANNELS = {
  command: 'ui:command',
  view: 'ui:view',
  requestView: 'ui:request-view',
  probeReading: 'probe:reading',
  probeEscape: 'probe:escape',
} as const;

export interface MeasuredScreen { accountId: AccountId; rect: Rect }

export type Command =
  | { type: 'select' | 'enable' | 'disable' | 'go-home' | 'reload' | 'toggle-sound'
      | 'detach' | 'reattach' | 'retry' | 'back-to-login'
      | 'open-account-menu'; accountId: AccountId }
  | { type: 'add-account'; gameId: GameId; name: string }
  | { type: 'rename-account'; accountId: AccountId; name: string }
  | { type: 'open-group-menu'; gameId: GameId }
  | { type: 'set-layout'; layout: Layout }
  | { type: 'toggle-focus'; accountId: AccountId }
  | { type: 'toggle-sidebar' | 'open-data-folder' }
  | { type: 'set-notifications'; enabled: boolean }
  | { type: 'screens'; screens: MeasuredScreen[] };

export interface WindowApi {
  requestView(): Promise<AppView>;
  onChange(listener: (view: AppView) => void): () => void;
  send(command: Command): void;
}

declare global { interface Window { idleManager: WindowApi } }
