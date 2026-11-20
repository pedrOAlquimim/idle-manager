import { describe, expect, test } from 'vitest';
import {
  accountsForGame,
  addAccount,
  generateAccountId,
  registerNick,
  removeAccount,
  removeGame,
  setAutoOptimize,
  renameAccount,
  suggestName,
} from '../src/core/accounts';
import { POKEIDLE } from '../src/games/catalog';
import { INITIAL_DATA } from '../src/shared/schemas';
import { accountId, gameId } from '../src/shared/types';
import type { AccountId, AppData, Game, Result } from '../src/shared/types';

const OTHER_GAME: Game = {
  id: gameId('other'),
  name: 'Other',
  startUrl: 'https://example.com/',
  hosts: ['example.com'],
  domain: 'example.com',
  allowHttp: false,
  accountLimit: 2,
  sessionKey: null,
  readsSession: false,
  dot: null,
};

const UNLIMITED_GAME: Game = { ...OTHER_GAME, id: gameId('unlimited'), accountLimit: null };

// Every fixture is deep-frozen: a rule that mutates its input throws instead of passing silently.
function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`setup failed: ${result.error}`);
  return result.value;
}

function emptyData(): AppData {
  return deepFreeze(structuredClone(INITIAL_DATA));
}

function withAccounts(names: readonly string[], game: Game = POKEIDLE, from: AppData = emptyData()): AppData {
  let data = from;
  for (const name of names) data = deepFreeze(unwrap(addAccount(data, game, name)).data);
  return data;
}

function idAt(data: AppData, index: number): AccountId {
  const id = data.accounts[index]?.id;
  if (id === undefined) throw new Error(`no account at index ${index}`);
  return id;
}

function register(data: AppData, id: AccountId, nick: string, game: Game = POKEIDLE): AppData {
  const result = registerNick(data, game, id, nick);
  if (!result.accepted) throw new Error(`setup failed: nick ${nick} was refused`);
  return deepFreeze(result.data);
}

function nickOf(data: AppData, id: AccountId): string | null | undefined {
  return data.accounts.find((account) => account.id === id)?.nick;
}

describe('a game without a limit', () => {
  test('takes more accounts than any limit', () => {
    let data = emptyData();
    for (const name of ['a', 'b', 'c', 'd', 'e', 'f']) data = unwrap(addAccount(data, UNLIMITED_GAME, name)).data;
    expect(data.accounts).toHaveLength(6);
  });
});

describe('generateAccountId', () => {
  test('generateAccountId strips accents and avoids duplicates', () => {
    expect(generateAccountId('Conta Três', [])).toBe('conta-tres');
    expect(generateAccountId('Alt 1', [accountId('alt-1')])).toBe('alt-1-2');
    expect(generateAccountId('!!!', [])).toBe('conta');
  });

  test('generateAccountId skips suffixes that are already taken', () => {
    const taken = [accountId('alt-1'), accountId('alt-1-2')];
    expect(generateAccountId('Alt 1', taken)).toBe('alt-1-3');
  });

  test('generateAccountId stays within 40 characters, even with a suffix', () => {
    const first = generateAccountId('a'.repeat(60), []);
    expect(first).toHaveLength(40);
    const second = generateAccountId('a'.repeat(60), [first]);
    expect(second).toHaveLength(40);
    expect(second.endsWith('-2')).toBe(true);
    expect(second).toMatch(/^[a-z0-9-]{1,40}$/);
  });
});

describe('suggestName', () => {
  test('suggestName follows Principal, Alt 1, Alt 2', () => {
    expect(suggestName(emptyData(), POKEIDLE)).toBe('Principal');
    expect(suggestName(withAccounts(['Principal']), POKEIDLE)).toBe('Alt 1');
    expect(suggestName(withAccounts(['Principal', 'Alt 1']), POKEIDLE)).toBe('Alt 2');
  });

  test('suggestName reuses a name that was freed', () => {
    expect(suggestName(withAccounts(['Principal', 'Alt 2']), POKEIDLE)).toBe('Alt 1');
  });

  test('suggestName only looks at accounts of the same game', () => {
    expect(suggestName(withAccounts(['Principal'], OTHER_GAME), POKEIDLE)).toBe('Principal');
  });
});

describe('addAccount', () => {
  test('addAccount enforces the game limit', () => {
    const full = withAccounts(['a', 'b', 'c', 'd']);
    expect(full.accounts).toHaveLength(4);
    expect(addAccount(full, POKEIDLE, 'e')).toEqual({ ok: false, error: 'limit-reached' });
  });

  test('addAccount rejects empty and duplicate names in the same game', () => {
    const data = withAccounts(['Principal']);
    expect(addAccount(data, POKEIDLE, '   ')).toEqual({ ok: false, error: 'empty-name' });
    expect(addAccount(data, POKEIDLE, ' principal ')).toEqual({ ok: false, error: 'duplicate-name' });
  });

  test('addAccount allows the same name in another game', () => {
    const data = withAccounts(['Principal']);
    const result = addAccount(data, OTHER_GAME, 'Principal');
    expect(result.ok).toBe(true);
    expect(unwrap(result).account.id).toBe('principal-2');
  });

  test('addAccount creates an enabled muted account and selects it if nothing is selected', () => {
    const { data, account } = unwrap(addAccount(emptyData(), POKEIDLE, '  Principal '));
    expect(account).toEqual({
      id: 'principal',
      gameId: 'pokeidle',
      name: 'Principal',
      enabled: true,
      muted: true,
      nick: null,
      autoOptimizeHours: null,
    });
    expect(data.accounts).toEqual([account]);
    expect(data.preferences.selectedId).toBe('principal');
  });

  test('addAccount keeps an existing selection', () => {
    const data = withAccounts(['Principal', 'Alt 1']);
    expect(data.preferences.selectedId).toBe('principal');
  });
});

describe('renameAccount', () => {
  test('renameAccount changes the name and keeps the id', () => {
    const data = withAccounts(['Principal']);
    const renamed = unwrap(renameAccount(data, idAt(data, 0), '  Farm  '));
    expect(renamed.accounts[0]).toMatchObject({ id: 'principal', name: 'Farm' });
  });

  test('renameAccount rejects empty and duplicate names', () => {
    const data = withAccounts(['Principal', 'Alt 1']);
    expect(renameAccount(data, idAt(data, 1), ' ')).toEqual({ ok: false, error: 'empty-name' });
    expect(renameAccount(data, idAt(data, 1), 'PRINCIPAL')).toEqual({ ok: false, error: 'duplicate-name' });
  });

  test('renameAccount lets an account change only the case of its own name', () => {
    const data = withAccounts(['Principal']);
    const renamed = unwrap(renameAccount(data, idAt(data, 0), 'PRINCIPAL'));
    expect(renamed.accounts[0]?.name).toBe('PRINCIPAL');
  });
});

describe('registerNick', () => {
  test('accepts up to 4 nicks and rejects the fifth', () => {
    let data = withAccounts(['a', 'b', 'c', 'd']);
    ['Ash', 'Misty', 'Brock', 'Gary'].forEach((nick, index) => {
      data = register(data, idAt(data, index), nick);
    });
    expect(data.nicks['pokeidle']).toEqual(['Ash', 'Misty', 'Brock', 'Gary']);

    const rejected = registerNick(data, POKEIDLE, idAt(data, 0), 'Oak');
    expect(rejected.accepted).toBe(false);
    expect(data.nicks['pokeidle']).toEqual(['Ash', 'Misty', 'Brock', 'Gary']);
  });

  test('known nick passes on any account, case-insensitively', () => {
    let data = withAccounts(['a', 'b']);
    data = register(data, idAt(data, 0), 'Ash');
    const result = registerNick(data, POKEIDLE, idAt(data, 1), 'ASH');
    expect(result.accepted).toBe(true);
    expect(result.data.nicks['pokeidle']).toEqual(['Ash']);
  });

  test('registerNick stores the nick on the account', () => {
    let data = withAccounts(['a', 'b']);
    data = register(data, idAt(data, 1), ' Misty ');
    expect(nickOf(data, idAt(data, 1))).toBe('Misty');
    expect(nickOf(data, idAt(data, 0))).toBeNull();
  });

  test('rejected nick leaves data unchanged', () => {
    let data = withAccounts(['a', 'b', 'c', 'd']);
    ['Ash', 'Misty', 'Brock', 'Gary'].forEach((nick, index) => {
      data = register(data, idAt(data, index), nick);
    });
    const rejected = registerNick(data, POKEIDLE, idAt(data, 0), 'Oak');
    expect(rejected.data).toBe(data);
  });

  test('registering the nick an account already has returns the same data object', () => {
    const data = register(withAccounts(['a']), accountId('a'), 'Ash');
    const again = registerNick(data, POKEIDLE, accountId('a'), 'Ash');
    expect(again.accepted).toBe(true);
    expect(again.data).toBe(data);
  });

  test('registerNick ignores unknown accounts and accounts of another game', () => {
    const data = withAccounts(['a']);
    expect(registerNick(data, POKEIDLE, accountId('ghost'), 'Ash')).toEqual({ data, accepted: false });
    expect(registerNick(data, OTHER_GAME, idAt(data, 0), 'Ash')).toEqual({ data, accepted: false });
    expect(data.nicks).toEqual({});
  });

  test('nicks from different games stay separate', () => {
    let data = withAccounts(['a', 'b', 'c', 'd']);
    ['Ash', 'Misty', 'Brock', 'Gary'].forEach((nick, index) => {
      data = register(data, idAt(data, index), nick);
    });
    data = withAccounts(['x'], OTHER_GAME, data);
    // Pokeidle is full and already knows "Ash"; the other game keeps its own list and its own room.
    data = register(data, accountId('x'), 'Ash', OTHER_GAME);
    expect(data.nicks).toEqual({ pokeidle: ['Ash', 'Misty', 'Brock', 'Gary'], other: ['Ash'] });
  });
});

describe('removeAccount', () => {
  test('removeAccount frees a nick no other account uses', () => {
    let data = withAccounts(['a', 'b']);
    data = register(data, idAt(data, 0), 'Ash');
    data = register(data, idAt(data, 1), 'Misty');
    const after = removeAccount(data, idAt(data, 0));
    expect(after.accounts.map((account) => account.id)).toEqual(['b']);
    expect(after.nicks['pokeidle']).toEqual(['Misty']);
  });

  test('removeAccount keeps a nick another account uses', () => {
    let data = withAccounts(['a', 'b']);
    data = register(data, idAt(data, 0), 'Ash');
    data = register(data, idAt(data, 1), 'ash');
    const after = removeAccount(data, idAt(data, 0));
    expect(after.nicks['pokeidle']).toEqual(['Ash']);
  });

  test('removing the last account that uses a nick leaves no empty list behind', () => {
    let data = withAccounts(['a']);
    data = register(data, idAt(data, 0), 'Ash');
    expect(removeAccount(data, idAt(data, 0)).nicks).toEqual({});
  });

  test('removing the selected account selects the first remaining one, or null', () => {
    const data = withAccounts(['a', 'b', 'c']);
    expect(data.preferences.selectedId).toBe('a');
    expect(removeAccount(data, accountId('a')).preferences.selectedId).toBe('b');
    expect(removeAccount(data, accountId('c')).preferences.selectedId).toBe('a');
    const single = withAccounts(['a']);
    expect(removeAccount(single, accountId('a')).preferences.selectedId).toBeNull();
  });

  test('removeAccount of an unknown id returns the data unchanged', () => {
    const data = withAccounts(['a']);
    expect(removeAccount(data, accountId('ghost'))).toBe(data);
  });
});

describe('accountsForGame', () => {
  test('accountsForGame returns only the accounts of that game, in order', () => {
    const data = withAccounts(['x'], OTHER_GAME, withAccounts(['a', 'b']));
    expect(accountsForGame(data, POKEIDLE.id).map((account) => account.id)).toEqual(['a', 'b']);
    expect(accountsForGame(data, OTHER_GAME.id).map((account) => account.id)).toEqual(['x']);
  });
});

describe('removeGame', () => {
  const twoGames = (): AppData => {
    const first = withAccounts(['a', 'b'], POKEIDLE);
    const withGames: AppData = deepFreeze({
      ...structuredClone(first),
      games: [
        { id: POKEIDLE.id, name: 'PokeIdle', startUrl: POKEIDLE.startUrl },
        { id: OTHER_GAME.id, name: 'Other', startUrl: OTHER_GAME.startUrl },
      ],
    });
    return withAccounts(['x'], OTHER_GAME, withGames);
  };

  test('drops the game and its accounts and keeps the nicks', () => {
    const data = deepFreeze({ ...structuredClone(register(twoGames(), idAt(twoGames(), 0), 'Ash')) });
    const after = removeGame(data, POKEIDLE.id);
    expect(after.games.map((game) => game.id)).toEqual(['other']);
    expect(after.accounts.map((account) => account.id)).toEqual(['x']);
    expect(after.nicks).toEqual({ pokeidle: ['Ash'] });
  });

  test('moves the selection to the first remaining account when the selected one goes', () => {
    const data = twoGames();
    expect(data.preferences.selectedId).toBe(idAt(data, 0));
    expect(removeGame(data, POKEIDLE.id).preferences.selectedId).toBe('x');
  });

  test('leaves the selection alone when it is in another game', () => {
    const data = deepFreeze({ ...structuredClone(twoGames()), preferences: { ...twoGames().preferences, selectedId: accountId('x') } });
    expect(removeGame(data, POKEIDLE.id).preferences.selectedId).toBe('x');
  });

  test('removing the last game empties the selection', () => {
    const once = removeGame(twoGames(), POKEIDLE.id);
    expect(removeGame(once, OTHER_GAME.id).preferences.selectedId).toBeNull();
  });

  test('a game that does not exist changes nothing', () => {
    const data = twoGames();
    expect(removeGame(data, gameId('ghost'))).toEqual(data);
  });
});

describe('setAutoOptimize', () => {
  const twoGames = (): AppData => {
    const first = withAccounts(['a', 'b'], POKEIDLE);
    return withAccounts(['x'], OTHER_GAME, first);
  };

  test('new accounts start without an interval', () => {
    expect(twoGames().accounts.map((account) => account.autoOptimizeHours)).toEqual([null, null, null]);
  });

  test('changes only the account', () => {
    const data = twoGames();
    const after = setAutoOptimize(data, idAt(data, 0), 6, 'account');
    expect(after.accounts.map((account) => account.autoOptimizeHours)).toEqual([6, null, null]);
  });

  test('changes the whole group of the account, not other games', () => {
    const data = twoGames();
    const after = setAutoOptimize(data, idAt(data, 0), 6, 'group');
    expect(after.accounts.map((account) => account.autoOptimizeHours)).toEqual([6, 6, null]);
  });

  test('null turns it off', () => {
    const data = twoGames();
    const on = setAutoOptimize(data, idAt(data, 0), 6, 'group');
    expect(setAutoOptimize(on, idAt(data, 1), null, 'account').accounts.map((account) => account.autoOptimizeHours)).toEqual([6, null, null]);
  });
});
