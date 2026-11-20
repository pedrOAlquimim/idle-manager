import { describe, expect, test } from 'vitest';
import { partitionFor } from '../src/core/accounts';
import { gameFromStored } from '../src/games/catalog';
import { createGame } from '../src/games/new-game';
import { INITIAL_DATA } from '../src/shared/schemas';
import { accountId, gameId } from '../src/shared/types';
import type { AppData, NewGameInput, StoredGame } from '../src/shared/types';

// Frozen, so a rule that changes its input throws instead of passing silently.
function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

const stored = (id: string, name: string, startUrl: string): StoredGame => ({ id: gameId(id), name, startUrl });
const POKEIDLE_GROUP = stored('pokeidle', 'PokeIdle', 'https://pokeidle.io/app');
const JOGO_GROUP = stored('jogo', 'Jogo', 'https://www.jogo.com/x');

const dataWith = (...games: StoredGame[]): AppData => deepFreeze({ ...structuredClone(INITIAL_DATA), games });
const input = (changes: Partial<NewGameInput> = {}): NewGameInput => ({
  name: 'Idle Forest',
  url: 'https://forest.example.com/play',
  accountName: 'Principal',
  ...changes,
});

function created(data: AppData, changes: Partial<NewGameInput> = {}) {
  const result = createGame(data, input(changes));
  if (!result.ok) throw new Error(`setup failed: ${result.error}`);
  return result;
}

describe('createGame', () => {
  test('creates a group and its first account', () => {
    const { data, game, account } = created(dataWith());
    expect(game).toEqual({ id: 'idle-forest', name: 'Idle Forest', startUrl: 'https://forest.example.com/play' });
    expect(account).toMatchObject({ id: 'principal', gameId: 'idle-forest', name: 'Principal', enabled: true });
    expect(data.games).toEqual([game]);
    expect(data.accounts).toEqual([account]);
  });

  test('new groups go after the existing ones', () => {
    const { data } = created(dataWith(JOGO_GROUP));
    expect(data.games.map((game) => game.id)).toEqual(['jogo', 'idle-forest']);
  });

  test('a pasted address without a scheme is stored in full', () => {
    expect(created(dataWith(), { url: ' Forest.Example.com/a?b=1 ' }).game.startUrl).toBe('https://forest.example.com/a?b=1');
  });

  test('a pokeidle address becomes the known game whatever the name', () => {
    const { game } = created(dataWith(), { name: 'Meu jogo', url: 'www.pokeidle.io/qualquer' });
    expect(game).toEqual({ id: 'pokeidle', name: 'Meu jogo', startUrl: 'https://pokeidle.io/app' });
    expect(gameFromStored(game).readsSession).toBe(true);
  });

  test('a site named Pokeidle does not become the known game', () => {
    const { game } = created(dataWith(), { name: 'Pokeidle', url: 'https://outro.site.com/' });
    expect(game.id).toBe('pokeidle-2');
    expect(gameFromStored(game).readsSession).toBe(false);
  });

  test('a second address of a site in a group is refused', () => {
    expect(createGame(dataWith(JOGO_GROUP), input({ url: ' JOGO.com/ ' }))).toEqual({ ok: false, error: 'duplicate-site' });
  });

  test('another host of the same domain is another site', () => {
    expect(created(dataWith(JOGO_GROUP), { url: 'https://app.jogo.com/' }).game.id).toBe('idle-forest');
  });

  test('a trailing dot does not make it another site', () => {
    expect(createGame(dataWith(JOGO_GROUP), input({ url: 'https://jogo.com./' }))).toEqual({ ok: false, error: 'duplicate-site' });
  });

  test('a trailing dot does not hide the known game', () => {
    const { game } = created(dataWith(), { url: 'https://pokeidle.io./' });
    expect(game.id).toBe('pokeidle');
    expect(gameFromStored(game).accountLimit).toBe(4);
  });

  test('a second pokeidle address is refused', () => {
    const data = dataWith(POKEIDLE_GROUP);
    expect(createGame(data, input({ url: 'app.pokeidle.io' }))).toEqual({ ok: false, error: 'duplicate-site' });
  });

  test('accepts the same account name in two groups', () => {
    const first = created(dataWith());
    const second = created(deepFreeze(first.data), { name: 'Outro', url: 'https://outro.example.com/' });
    expect([first.account.id, second.account.id]).toEqual(['principal', 'principal-2']);
    expect(partitionFor(first.game.id, first.account.id)).not.toBe(partitionFor(second.game.id, second.account.id));
  });

  test('two groups never share a partition', () => {
    const data: AppData = deepFreeze({
      ...structuredClone(INITIAL_DATA),
      games: [stored('foo', 'Foo', 'https://foo.example.com/')],
      accounts: [{ id: accountId('bar-baz'), gameId: gameId('foo'), name: 'Bar Baz', enabled: true, muted: true, nick: null, autoOptimizeHours: null }],
    });
    const { game, account } = created(data, { name: 'Foo Bar', accountName: 'Baz' });
    expect(game.id).toBe('foo-bar');
    expect(partitionFor(game.id, account.id)).not.toBe('persist:foo-bar-baz');
  });

  test.each([
    [{ name: '', url: '', accountName: '' }, 'empty-game-name'],
    [{ name: '   ' }, 'empty-game-name'],
    [{ url: 'not a url' }, 'invalid-url'],
    [{ url: 'https://user:senha@jogo.com/' }, 'invalid-url'],
    [{ url: 'ftp://a.b/' }, 'not-a-site'],
    [{ name: ' jogo ' }, 'duplicate-game-name'],
    [{ accountName: '  ' }, 'empty-account-name'],
  ])('%j is refused with %s', (changes, error) => {
    expect(createGame(dataWith(JOGO_GROUP), input(changes))).toEqual({ ok: false, error });
  });

  test.each([
    ['!!!', 'jogo'],
    ['Pokémon Idle', 'pokemon-idle'],
  ])('the name %j gives the id %s', (name, id) => {
    expect(created(dataWith(), { name }).game.id).toBe(id);
  });

  test('two names with the same id stay apart', () => {
    const data = dataWith(stored('idle-forest', 'Idle-Forest', 'https://other.example.com/'));
    expect(created(data).game.id).toBe('idle-forest-2');
  });
});
