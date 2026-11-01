import { gameId } from '../shared/types';
import type { AccountId, Game, GameId } from '../shared/types';
import { POKEIDLE_ID, POKEIDLE_SESSION_KEY } from './pokeidle';

// IDLEMANAGER_GAME_URL points the Pokeidle entry at a local fake game in end-to-end tests.
const POKEIDLE_START_URL = process.env.IDLEMANAGER_GAME_URL || 'https://pokeidle.io/app';

export const POKEIDLE: Game = {
  id: gameId(POKEIDLE_ID),
  name: 'PokeIdle',
  startUrl: POKEIDLE_START_URL,
  hosts: [new URL(POKEIDLE_START_URL).hostname],
  accountLimit: 4,
  sessionKey: POKEIDLE_SESSION_KEY,
};

export const GAMES: readonly Game[] = [POKEIDLE];

export function partitionFor(game: GameId, account: AccountId): string {
  return `persist:${game}-${account}`;
}
