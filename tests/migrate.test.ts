import { describe, expect, test } from 'vitest';
import { upgradeData } from '../src/games/migrate';

const POKEIDLE_GROUP = { id: 'pokeidle', name: 'PokeIdle', startUrl: 'https://pokeidle.io/app' };
const OLD_PREFERENCES = { layout: 'row', selectedId: 'principal', sidebarOpen: false, notifications: false };
const PRINCIPAL = { id: 'principal', gameId: 'pokeidle', name: 'Principal', enabled: false, muted: true, nick: 'Ash' };

const versionOne = (changes: Record<string, unknown> = {}) => ({
  version: 1,
  accounts: [PRINCIPAL],
  nicks: { pokeidle: ['Ash'] },
  preferences: OLD_PREFERENCES,
  ...changes,
});

describe('upgradeData', () => {
  test('a version 1 file with accounts gets the PokeIdle group', () => {
    expect(upgradeData(versionOne())).toEqual({
      upgraded: true,
      data: {
        version: 2,
        games: [POKEIDLE_GROUP],
        accounts: [PRINCIPAL],
        nicks: { pokeidle: ['Ash'] },
        preferences: { ...OLD_PREFERENCES, panelOpen: true },
      },
    });
  });

  test('version 1 with nicks and no accounts keeps the group', () => {
    const { data } = upgradeData(versionOne({ accounts: [], preferences: { ...OLD_PREFERENCES, selectedId: null } }));
    expect(data.games).toEqual([POKEIDLE_GROUP]);
    expect(data.nicks).toEqual({ pokeidle: ['Ash'] });
  });

  test('an empty version 1 file starts with no groups', () => {
    const { data } = upgradeData(versionOne({ accounts: [], nicks: {}, preferences: { ...OLD_PREFERENCES, selectedId: null } }));
    expect(data.games).toEqual([]);
  });

  test('an account of an unknown game in version 1 is refused', () => {
    expect(() => upgradeData(versionOne({ accounts: [{ ...PRINCIPAL, gameId: 'other' }] }))).toThrow(/other/);
  });

  test('a version 1 file of the wrong shape is refused', () => {
    expect(() => upgradeData(versionOne({ accounts: 'none' }))).toThrow();
  });

  test('a version 2 file passes unchanged', () => {
    const current = {
      version: 2,
      games: [POKEIDLE_GROUP],
      accounts: [PRINCIPAL],
      nicks: {},
      preferences: { ...OLD_PREFERENCES, panelOpen: false },
    };
    expect(upgradeData(current)).toEqual({ upgraded: false, data: current });
  });

  test('an unknown version is refused', () => {
    expect(() => upgradeData(versionOne({ version: 3 }))).toThrow();
  });
});
