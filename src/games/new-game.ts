import { addAccount, generateGameId, sameText } from '../core/accounts';
import { parseGameUrl, siteHost } from '../core/game-url';
import type { AppData, NewGameError, NewGameInput, StoredAccount, StoredGame } from '../shared/types';
import { gameFromStored, knownGameIds, recognizeGame } from './catalog';

export type NewGameResult =
  | { ok: true; data: AppData; game: StoredGame; account: StoredAccount }
  | { ok: false; error: NewGameError };

const refuse = (error: NewGameError): NewGameResult => ({ ok: false, error });

// A known game exists once, under its own id: that is what keeps its account limit whole, however its
// address is typed. Any other site is compared by host.
export function createGame(data: AppData, input: NewGameInput): NewGameResult {
  const name = input.name.trim();
  if (name === '') return refuse('empty-game-name');

  const parsed = parseGameUrl(input.url);
  if (!parsed.ok) return refuse(parsed.error);
  const { hostname, href } = parsed.url;

  const known = recognizeGame(hostname);
  const site = siteHost(hostname);
  const taken =
    known === null
      ? data.games.some((game) => siteHost(new URL(game.startUrl).hostname) === site)
      : data.games.some((game) => game.id === known.id);
  if (taken) return refuse('duplicate-site');
  if (data.games.some((game) => sameText(game.name, name))) return refuse('duplicate-game-name');

  const game: StoredGame = {
    id: known?.id ?? generateGameId(name, [...data.games.map((other) => other.id), ...knownGameIds()]),
    name,
    startUrl: known?.startUrl ?? href,
  };
  const added = addAccount({ ...data, games: [...data.games, game] }, gameFromStored(game), input.accountName);
  if (!added.ok) return refuse('empty-account-name');
  return { ok: true, data: added.value.data, game, account: added.value.account };
}
