import { describe, expect, test } from 'vitest';
import { GAMES, POKEIDLE, partitionFor } from '../src/games/catalog';
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
  test('catalog has Pokeidle with limit 4 and session key', () => {
    expect(GAMES.map((game) => game.id)).toEqual(['pokeidle']);
    expect(POKEIDLE.accountLimit).toBe(4);
    expect(POKEIDLE.sessionKey).toBe('sessao');
    expect(POKEIDLE.hosts).toEqual(['pokeidle.io']);
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
    expect(() => AppDataSchema.parse({ ...INITIAL_DATA, version: 2 })).toThrow();
    const account = { id: 'A B', gameId: 'pokeidle', name: 'x', enabled: true, muted: true, nick: null };
    expect(() => AppDataSchema.parse({ ...INITIAL_DATA, accounts: [account] })).toThrow();
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
