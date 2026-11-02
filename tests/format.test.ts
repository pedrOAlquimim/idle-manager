import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  accountColor,
  formatDuration,
  formatNumber,
  formatTime,
  initialsOf,
  statusColor,
  statusText,
  groupColor,
} from '../src/shared/format';
import { accountId, gameId } from '../src/shared/types';
import type { AccountStatus, AccountView } from '../src/shared/types';

const view = (partial: Partial<AccountView> = {}): AccountView => ({
  id: accountId('principal'),
  gameId: gameId('pokeidle'),
  name: 'Principal',
  initials: 'PR',
  color: accountColor(0),
  status: 'connected',
  message: null,
  attempts: 0,
  enabledSince: 0,
  readsSession: true,
  muted: true,
  detached: false,
  host: 'pokeidle.io',
  partition: 'persist:pokeidle-principal',
  memoryMb: [],
  cpu: [],
  history: [],
  ...partial,
});

describe('numbers and time', () => {
  test('formats user-facing values in pt-BR', () => {
    expect(formatDuration(9000)).toBe('9 s');
    expect(formatDuration(65000)).toBe('1 min');
    expect(formatDuration(3900000)).toBe('1 h 5 min');
    expect(formatNumber(1234)).toBe('1.234');
    expect(formatNumber(0.4, 1)).toBe('0,4');
    expect(initialsOf('Principal')).toBe('PR');
    expect(initialsOf('Alt 1')).toBe('A1');
  });

  test('formatDuration handles the boundaries and negative spans', () => {
    expect(formatDuration(0)).toBe('0 s');
    expect(formatDuration(59_999)).toBe('59 s');
    expect(formatDuration(60_000)).toBe('1 min');
    expect(formatDuration(3_599_000)).toBe('59 min');
    expect(formatDuration(3_600_000)).toBe('1 h 0 min');
    expect(formatDuration(-5000)).toBe('0 s');
  });

  test('formatNumber rounds to the requested decimals', () => {
    expect(formatNumber(1234.567)).toBe('1.235');
    expect(formatNumber(1234.567, 1)).toBe('1.234,6');
    expect(formatNumber(0, 1)).toBe('0,0');
  });

  test('formatTime shows hours and minutes with two digits', () => {
    expect(formatTime(new Date(2026, 10, 1, 14, 5).getTime())).toBe('14:05');
    expect(formatTime(new Date(2026, 10, 1, 9, 3).getTime())).toBe('09:03');
  });
});

describe('initialsOf', () => {
  test.each([
    ['Principal', 'PR'],
    ['Alt 1', 'A1'],
    ['Alt 2', 'A2'],
    ['conta três', 'CT'],
    ['x', 'X'],
    ['ünico', 'ÜN'],
    ['  Alt   9  ', 'A9'],
    ['Slime Farm Extra', 'SF'],
    ['🔥 Fire', '🔥F'],
    ['', '?'],
    ['   ', '?'],
  ])('%j => %s', (name, expected) => {
    expect(initialsOf(name)).toBe(expected);
  });
});

describe('accountColor', () => {
  test('accountColor cycles the 4 design colors', () => {
    expect(accountColor(0)).toEqual({ background: '#3b3466', foreground: '#d6ccff', accent: '#f5c84c' });
    expect(accountColor(1)).toEqual({ background: '#243049', foreground: '#a5c8ff', accent: '#a5c8ff' });
    expect(accountColor(2)).toEqual({ background: '#163a3a', foreground: '#7fe0d0', accent: '#7fe0d0' });
    expect(accountColor(3)).toEqual({ background: '#3a2a1a', foreground: '#ffc98a', accent: '#ffc98a' });
    expect(accountColor(4)).toEqual(accountColor(0));
    expect(accountColor(9)).toEqual(accountColor(1));
  });

  test('accountColor falls back to the first color for a bad index and wraps negatives', () => {
    expect(accountColor(-1)).toEqual(accountColor(3));
    expect(accountColor(Number.NaN)).toEqual(accountColor(0));
  });
});

describe('groupColor', () => {
  test('walks the sequence of the design and starts over', () => {
    expect([0, 1, 2, 3, 4, 5].map(groupColor)).toEqual(['#a78bfa', '#22d3ee', '#f472b6', '#34d399', '#fb923c', '#60a5fa']);
    expect(groupColor(6)).toBe('#a78bfa');
  });
});

describe('statusText', () => {
  test('a game that cannot tell if the account is logged in says aberta', () => {
    expect(statusText(view({ status: 'connected', readsSession: false, enabledSince: null }), 10_000)).toBe('aberta');
    expect(statusText(view({ status: 'connected', readsSession: false, enabledSince: 0 }), 300_000)).toBe('aberta · ligada há 5 min');
  });

  test('connected shows how long the account has been enabled', () => {
    expect(statusText(view({ status: 'connected', enabledSince: 4_000 }), 14_000)).toBe('conectada · ligada há 10 s');
    expect(statusText(view({ status: 'connected', enabledSince: 0 }), 3_900_000)).toBe('conectada · ligada há 1 h 5 min');
    expect(statusText(view({ status: 'connected', enabledSince: null }), 10_000)).toBe('conectada');
  });

  test('statusText covers every status', () => {
    const cases: readonly [AccountStatus, Partial<AccountView>, string][] = [
      ['off', {}, 'desligada'],
      ['loading', {}, 'carregando'],
      ['login', {}, 'aguardando login'],
      ['login', { message: 'Login expirado' }, 'Login expirado'],
      ['notice', { message: 'Rede cheia' }, 'Rede cheia'],
      ['notice', {}, 'aviso do jogo'],
      ['reloading', { attempts: 2 }, 'recarregando (2/3)'],
      ['down', { attempts: 3, message: 'Não voltou depois de 3 tentativas' }, 'não voltou depois de 3 tentativas'],
      ['down', { attempts: 0, message: 'Esse jogo levou para outro.com. Crie o grupo com esse endereço.' }, 'saiu para outro site'],
      ['blocked', { message: '5º nick bloqueado' }, '5º nick bloqueado'],
    ];
    for (const [status, extra, expected] of cases) {
      expect(statusText(view({ status, ...extra }), 10_000)).toBe(expected);
    }
  });
});

describe('statusColor', () => {
  test.each([
    ['off', 'var(--off)'],
    ['loading', 'var(--mem)'],
    ['login', 'var(--xp)'],
    ['connected', 'var(--on)'],
    ['notice', 'var(--xp)'],
    ['reloading', 'var(--mem)'],
    ['down', 'var(--err)'],
    ['blocked', 'var(--err)'],
  ] as const)('%s => %s', (status, expected) => {
    expect(statusColor(status)).toBe(expected);
  });
});

describe('renderer safety', () => {
  test('format.ts only imports sibling shared modules, so it can run in the renderer', () => {
    const source = readFileSync(new URL('../src/shared/format.ts', import.meta.url), 'utf8');
    const specifiers = [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]);
    expect(specifiers.length).toBeGreaterThan(0);
    for (const specifier of specifiers) expect(specifier).toMatch(/^\.\//);
  });
});
