import { accountId, gameId } from '../shared/types';
import type { AccountId, AppData, Game, GameId, Result, StoredAccount } from '../shared/types';

const MAX_ID_LENGTH = 40;
const FALLBACK_ID = 'conta';
const FALLBACK_GAME_ID = 'jogo';

export const sameText = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_ID_LENGTH)
    .replace(/-+$/g, '');
}

export function partitionFor(game: GameId, account: string): string {
  return `persist:${game}-${account}`;
}

function uniqueId(base: string, isTaken: (candidate: string) => boolean): string {
  if (!isTaken(base)) return base;
  for (let n = 2; ; n += 1) {
    const suffix = `-${n}`;
    const candidate = `${base.slice(0, MAX_ID_LENGTH - suffix.length)}${suffix}`;
    if (!isTaken(candidate)) return candidate;
  }
}

export function generateAccountId(
  name: string,
  existing: readonly AccountId[],
  clashes: (candidate: string) => boolean = () => false,
): AccountId {
  const taken = new Set<string>(existing);
  return accountId(uniqueId(slugify(name) || FALLBACK_ID, (candidate) => taken.has(candidate) || clashes(candidate)));
}

export function generateGameId(name: string, taken: readonly string[]): GameId {
  return gameId(uniqueId(slugify(name) || FALLBACK_GAME_ID, (candidate) => taken.includes(candidate)));
}

export function accountsForGame(data: AppData, game: GameId): StoredAccount[] {
  return data.accounts.filter((account) => account.gameId === game);
}

export function suggestName(data: AppData, game: Game): string {
  const used = accountsForGame(data, game.id).map((account) => account.name.trim().toLowerCase());
  for (let n = 0; ; n += 1) {
    const candidate = n === 0 ? 'Principal' : `Alt ${n}`;
    if (!used.includes(candidate.toLowerCase())) return candidate;
  }
}

export function addAccount(
  data: AppData,
  game: Game,
  name: string,
): Result<{ data: AppData; account: StoredAccount }> {
  const trimmed = name.trim();
  if (trimmed === '') return { ok: false, error: 'empty-name' };
  const inGame = accountsForGame(data, game.id);
  if (game.accountLimit !== null && inGame.length >= game.accountLimit) return { ok: false, error: 'limit-reached' };
  if (inGame.some((account) => sameText(account.name, trimmed))) return { ok: false, error: 'duplicate-name' };

  // Ids hold letters, digits and hyphens, so game `a` with account `b-c` and game `a-b` with account `c`
  // would land in one partition, and with it one login.
  const partitions = new Set(data.accounts.map((existing) => partitionFor(existing.gameId, existing.id)));
  const account: StoredAccount = {
    id: generateAccountId(
      trimmed,
      data.accounts.map((existing) => existing.id),
      (candidate) => partitions.has(partitionFor(game.id, candidate)),
    ),
    gameId: game.id,
    name: trimmed,
    enabled: true,
    muted: true,
    nick: null,
  };
  const next: AppData = {
    ...data,
    accounts: [...data.accounts, account],
    preferences: { ...data.preferences, selectedId: data.preferences.selectedId ?? account.id },
  };
  return { ok: true, value: { data: next, account } };
}

export function renameAccount(data: AppData, id: AccountId, name: string): Result<AppData> {
  const trimmed = name.trim();
  if (trimmed === '') return { ok: false, error: 'empty-name' };
  const target = data.accounts.find((account) => account.id === id);
  if (target === undefined) return { ok: true, value: data };
  const clash = data.accounts.some(
    (account) => account.id !== id && account.gameId === target.gameId && sameText(account.name, trimmed),
  );
  if (clash) return { ok: false, error: 'duplicate-name' };
  const accounts = data.accounts.map((account) => (account.id === id ? { ...account, name: trimmed } : account));
  return { ok: true, value: { ...data, accounts } };
}

function releaseNick(
  nicks: AppData['nicks'],
  removed: StoredAccount,
  remaining: readonly StoredAccount[],
): AppData['nicks'] {
  const nick = removed.nick;
  const list = nicks[removed.gameId];
  if (nick === null || list === undefined) return nicks;
  const stillUsed = remaining.some(
    (account) => account.gameId === removed.gameId && account.nick !== null && sameText(account.nick, nick),
  );
  if (stillUsed) return nicks;
  const { [removed.gameId]: _released, ...others } = nicks;
  const kept = list.filter((known) => !sameText(known, nick));
  return kept.length === 0 ? others : { ...others, [removed.gameId]: kept };
}

export function removeAccount(data: AppData, id: AccountId): AppData {
  const target = data.accounts.find((account) => account.id === id);
  if (target === undefined) return data;
  const accounts = data.accounts.filter((account) => account.id !== id);
  const selectedId = data.preferences.selectedId === id ? (accounts[0]?.id ?? null) : data.preferences.selectedId;
  return {
    ...data,
    accounts,
    nicks: releaseNick(data.nicks, target, accounts),
    preferences: { ...data.preferences, selectedId },
  };
}

// Unlike removing one account, this keeps the nicks: the game keeps counting them, and a group made again
// for the same game must still know them.
export function removeGame(data: AppData, game: GameId): AppData {
  if (!data.games.some((candidate) => candidate.id === game)) return data;
  const accounts = data.accounts.filter((account) => account.gameId !== game);
  const selected = data.accounts.find((account) => account.id === data.preferences.selectedId);
  const selectedId = selected !== undefined && selected.gameId !== game ? selected.id : (accounts[0]?.id ?? null);
  return {
    ...data,
    games: data.games.filter((candidate) => candidate.id !== game),
    accounts,
    preferences: { ...data.preferences, selectedId },
  };
}

export function registerNick(
  data: AppData,
  game: Game,
  id: AccountId,
  nick: string,
): { data: AppData; accepted: boolean } {
  const trimmed = nick.trim();
  const target = data.accounts.find((account) => account.id === id);
  if (trimmed === '' || target === undefined || target.gameId !== game.id) return { data, accepted: false };

  const known = data.nicks[game.id] ?? [];
  const alreadyKnown = known.some((entry) => sameText(entry, trimmed));
  if (!alreadyKnown && game.accountLimit !== null && known.length >= game.accountLimit) {
    return { data, accepted: false };
  }
  if (alreadyKnown && target.nick === trimmed) return { data, accepted: true };

  const nicks = alreadyKnown ? data.nicks : { ...data.nicks, [game.id]: [...known, trimmed] };
  const accounts = data.accounts.map((account) => (account.id === id ? { ...account, nick: trimmed } : account));
  return { data: { ...data, accounts, nicks }, accepted: true };
}
