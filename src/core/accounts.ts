import { accountId } from '../shared/types';
import type { AccountId, AppData, Game, GameId, Result, StoredAccount } from '../shared/types';

const MAX_ID_LENGTH = 40;
const FALLBACK_ID = 'conta';

const sameText = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

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

export function generateAccountId(name: string, existing: readonly AccountId[]): AccountId {
  const base = slugify(name) || FALLBACK_ID;
  const taken = new Set<string>(existing);
  if (!taken.has(base)) return accountId(base);
  for (let n = 2; ; n += 1) {
    const suffix = `-${n}`;
    const candidate = `${base.slice(0, MAX_ID_LENGTH - suffix.length)}${suffix}`;
    if (!taken.has(candidate)) return accountId(candidate);
  }
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

  const account: StoredAccount = {
    id: generateAccountId(trimmed, data.accounts.map((existing) => existing.id)),
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
