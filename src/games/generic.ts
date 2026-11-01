import type { GameAdapter } from './adapter';

// For games without an adapter of their own: the page is assumed healthy, so only a crash, a hang or a
// failed load (reported by Electron, not by the page) can trigger a reload.
export const genericAdapter: GameAdapter = {
  read: () => ({
    gamePresent: true,
    gameVisible: true,
    hasSession: true,
    nick: null,
    sessionTaken: false,
    notice: null,
  }),
  escapeIsFree: () => true,
};
