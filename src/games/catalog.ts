import { baseDomain, siteHost } from '../core/game-url';
import { gameId } from '../shared/types';
import type { Game, GameId, StoredGame } from '../shared/types';
import { POKEIDLE_ID, POKEIDLE_NAME, POKEIDLE_SESSION_KEY, POKEIDLE_URL } from './pokeidle';

export interface KnownGame {
  id: GameId;
  host: string;
  startUrl: string;
  accountLimit: number;
  sessionKey: string;
  dot: string;
}

// IDLEMANAGER_GAME_URL points the Pokeidle entry at a local fake game in end-to-end tests.
const POKEIDLE_START_URL = process.env.IDLEMANAGER_GAME_URL || POKEIDLE_URL;

// The games the app knows how to read. Everything else on the web runs without an adapter.
const KNOWN_GAMES: readonly KnownGame[] = [
  {
    id: gameId(POKEIDLE_ID),
    host: new URL(POKEIDLE_START_URL).hostname,
    startUrl: POKEIDLE_START_URL,
    accountLimit: 4,
    sessionKey: POKEIDLE_SESSION_KEY,
    dot: '#f5c84c',
  },
];

export function knownGameIds(): readonly GameId[] {
  return KNOWN_GAMES.map((known) => known.id);
}

export function recognizeGame(hostname: string): KnownGame | null {
  const host = hostname.toLowerCase();
  return KNOWN_GAMES.find((known) => host === known.host || host.endsWith(`.${known.host}`)) ?? null;
}

export function gameFromStored(stored: StoredGame): Game {
  const known = KNOWN_GAMES.find((candidate) => candidate.id === stored.id);
  if (known !== undefined) {
    return {
      id: stored.id,
      name: stored.name,
      startUrl: known.startUrl,
      hosts: [known.host],
      domain: null,
      allowHttp: new URL(known.startUrl).protocol === 'http:',
      accountLimit: known.accountLimit,
      sessionKey: known.sessionKey,
      readsSession: true,
      dot: known.dot,
    };
  }
  const { hostname, protocol } = new URL(stored.startUrl);
  return {
    id: stored.id,
    name: stored.name,
    startUrl: stored.startUrl,
    hosts: [siteHost(hostname)],
    domain: baseDomain(hostname),
    allowHttp: protocol === 'http:',
    accountLimit: null,
    sessionKey: null,
    readsSession: false,
    dot: null,
  };
}

export const POKEIDLE: Game = gameFromStored({
  id: gameId(POKEIDLE_ID),
  name: POKEIDLE_NAME,
  startUrl: POKEIDLE_START_URL,
});
