import { describe, expect, test } from 'vitest';
import { canOptimize, isInUse, nextAutoOptimization, optimizeDueAt, parseOptimizeHours } from '../src/core/optimize';
import type { OptimizeCandidate } from '../src/core/optimize';
import { HOUR_MS } from '../src/shared/constants';
import { accountId } from '../src/shared/types';
import type { AccountStatus } from '../src/shared/types';

describe('parseOptimizeHours', () => {
  test.each([['12', 12], [' 12 ', 12], ['1', 1], ['72', 72]])('accepts %j', (raw, hours) => {
    expect(parseOptimizeHours(raw)).toBe(hours);
  });

  test.each(['', '0', '73', '6,5', '6.5', 'abc', '-1', '1e1'])('refuses %j', (raw) => {
    expect(parseOptimizeHours(raw)).toBeNull();
  });
});

describe('canOptimize', () => {
  test.each([
    ['connected', true], ['login', true], ['notice', true], ['loading', false],
    ['reloading', false], ['off', false], ['down', false], ['blocked', false],
  ] as const)('%s is %s', (status, expected) => {
    expect(canOptimize(status)).toBe(expected);
  });
});

describe('optimizeDueAt and isInUse', () => {
  test('the due time is the start of the page plus the interval', () => {
    expect(optimizeDueAt(6, 1000)).toBe(1000 + 6 * HOUR_MS);
    expect(optimizeDueAt(null, 1000)).toBeNull();
    expect(optimizeDueAt(6, null)).toBeNull();
  });

  test('in use means a click or a key in the last 5 minutes', () => {
    const now = 10_000_000;
    expect(isInUse(now - 299_999, now)).toBe(true);
    expect(isInUse(now - 300_000, now)).toBe(false);
    expect(isInUse(null, now)).toBe(false);
  });
});

describe('nextAutoOptimization', () => {
  const T = 10 * HOUR_MS;
  const ready = (id: string, changes: Partial<OptimizeCandidate> = {}): OptimizeCandidate => ({
    id: accountId(id), hours: 6, freshSince: 0, lastUsedAt: null, status: 'connected', ...changes,
  });

  test('picks an account whose time has come', () => {
    expect(nextAutoOptimization([ready('a')], null, T)).toBe('a');
  });

  test.each([
    ['no interval', { hours: null }],
    ['a page that never started', { freshSince: null }],
    ['1 ms early', { freshSince: T - 6 * HOUR_MS + 1 }],
    ['used a minute ago', { lastUsedAt: T - 60_000 }],
  ] as const)('skips %s', (_name, changes) => {
    expect(nextAutoOptimization([ready('a', changes)], null, T)).toBeNull();
  });

  test.each(['loading', 'reloading', 'off', 'down', 'blocked'] as const)('skips an account %s', (status: AccountStatus) => {
    expect(nextAutoOptimization([ready('a', { status })], null, T)).toBeNull();
  });

  test('waits a minute after the last automatic optimization', () => {
    expect(nextAutoOptimization([ready('a')], T - 59_999, T)).toBeNull();
    expect(nextAutoOptimization([ready('a')], T - 60_000, T)).toBe('a');
  });

  test('of two that are due, the one that was due first goes first', () => {
    expect(nextAutoOptimization([ready('a', { freshSince: 1000 }), ready('b', { freshSince: 0 })], null, T)).toBe('b');
  });
});
