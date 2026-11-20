import { describe, expect, test } from 'vitest';
import { gameFromStored, knownGameIds, POKEIDLE, recognizeGame } from '../src/games/catalog';
import { partitionFor } from '../src/core/accounts';
import {
  EVENTS_IN_PANEL,
  EVENTS_PER_ACCOUNT,
  GAME_MISSING_MS,
  METRICS_INTERVAL_MS,
  MIN_ZOOM,
  OPEN_INTERVAL_MS,
  PROBE_INTERVAL_MS,
  PROBE_SILENCE_MS,
  RELOAD_DELAYS_MS,
  STABLE_MS,
  UNSCALED_HEIGHT,
  USAGE_SAMPLES,
  USER_GESTURE_WINDOW_MS,
} from '../src/shared/constants';
import { AppDataSchema, INITIAL_DATA, ProbeReadingSchema } from '../src/shared/schemas';
import { accountId, gameId } from '../src/shared/types';
import type { AccountId } from '../src/shared/types';

describe('game catalog', () => {
  test('Pokeidle keeps its limit, session key and exact host', () => {
    expect(knownGameIds()).toEqual(['pokeidle']);
    expect(POKEIDLE).toMatchObject({
      accountLimit: 4,
      sessionKey: 'sessao',
      hosts: ['pokeidle.io'],
      domain: null,
      allowHttp: false,
      readsSession: true,
      dot: '#f5c84c',
    });
  });

  test('any other site becomes a game without an adapter, reaching its whole domain', () => {
    const stored = { id: gameId('jogo'), name: 'Jogo', startUrl: 'http://app.jogo.com.br/x' };
    expect(gameFromStored(stored)).toEqual({
      ...stored,
      hosts: ['app.jogo.com.br'],
      domain: 'jogo.com.br',
      allowHttp: true,
      accountLimit: null,
      sessionKey: null,
      readsSession: false,
      dot: null,
    });
  });

  test('a known game keeps the name given to it and uses its own address', () => {
    const game = gameFromStored({ id: gameId('pokeidle'), name: 'Meu jogo', startUrl: 'https://outro.com/' });
    expect(game.name).toBe('Meu jogo');
    expect(game.startUrl).toBe('https://pokeidle.io/app');
    expect(game.hosts).toEqual(['pokeidle.io']);
  });

  test.each(['pokeidle.io', 'www.pokeidle.io', 'app.pokeidle.io', 'POKEIDLE.IO'])('recognizes %s', (hostname) => {
    expect(recognizeGame(hostname)?.id).toBe('pokeidle');
  });

  test.each(['notpokeidle.io', 'pokeidle.io.evil.com', 'pokeidle.com'])('does not recognize %s', (hostname) => {
    expect(recognizeGame(hostname)).toBeNull();
  });

  test('partitionFor combines game and account', () => {
    expect(partitionFor(gameId('pokeidle'), accountId('alt-1'))).toBe('persist:pokeidle-alt-1');
  });
});

describe('stored data schema', () => {
  test('AppDataSchema accepts valid and initial data', () => {
    expect(AppDataSchema.parse(INITIAL_DATA)).toEqual(INITIAL_DATA);
  });

  test('AppDataSchema rejects unknown version and invalid id', () => {
    expect(() => AppDataSchema.parse({ ...INITIAL_DATA, version: 3 })).toThrow();
    const account = { id: 'A B', gameId: 'pokeidle', name: 'x', enabled: true, muted: true, nick: null };
    expect(() => AppDataSchema.parse({ ...INITIAL_DATA, accounts: [account] })).toThrow();
  });

  test('an account saved before the optimization setting reads as off, and its limits hold', () => {
    const saved = { id: 'a', gameId: 'pokeidle', name: 'a', enabled: true, muted: true, nick: null };
    const parse = (account: Record<string, unknown>) => AppDataSchema.parse({ ...INITIAL_DATA, accounts: [account] });
    expect(parse(saved).accounts[0]?.autoOptimizeHours).toBeNull();
    expect(parse({ ...saved, autoOptimizeHours: 6 }).accounts[0]?.autoOptimizeHours).toBe(6);
    expect(() => parse({ ...saved, autoOptimizeHours: 0 })).toThrow();
    expect(() => parse({ ...saved, autoOptimizeHours: 73 })).toThrow();
  });

  test('ProbeReadingSchema rejects missing fields', () => {
    expect(() => ProbeReadingSchema.parse({ gamePresent: true })).toThrow();
  });
});

describe('typing', () => {
  test('branded ids are not interchangeable and plain strings are not ids', () => {
    // @ts-expect-error a GameId is not an AccountId
    const wrongBrand: AccountId = gameId('pokeidle');
    // @ts-expect-error a plain string is not an AccountId
    const plain: AccountId = 'principal';
    expect([wrongBrand, plain]).toEqual(['pokeidle', 'principal']);
  });
});

describe('constants', () => {
  test('hold the values the spec pins', () => {
    expect(RELOAD_DELAYS_MS).toEqual([5000, 15000, 60000]);
    expect([
      OPEN_INTERVAL_MS,
      PROBE_INTERVAL_MS,
      PROBE_SILENCE_MS,
      GAME_MISSING_MS,
      STABLE_MS,
      METRICS_INTERVAL_MS,
      USER_GESTURE_WINDOW_MS,
    ]).toEqual([5000, 2000, 60000, 30000, 60000, 2000, 3000]);
    expect([USAGE_SAMPLES, EVENTS_PER_ACCOUNT, EVENTS_IN_PANEL, UNSCALED_HEIGHT, MIN_ZOOM]).toEqual([
      30, 50, 6, 828, 0.25,
    ]);
  });
});
