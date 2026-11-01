import { describe, expect, test } from 'vitest';
import { accountShortcut, canOpenExternal, decideNavigation, isScreenHidden, zoomForScreen } from '../src/core/policies';
import type { AccountStatus } from '../src/shared/types';

describe('decideNavigation', () => {
  test.each([
    ['https://pokeidle.io/app', 'inside'],
    ['https://discord.gg/pokeidle', 'external'],
    ['https://evil.com/?https://pokeidle.io', 'external'],
    ['https://pokeidle.io.evil.com/', 'external'],
    ['http://pokeidle.io/app', 'external'],
    ['file:///etc/passwd', 'block'],
    ['javascript:alert(1)', 'block'],
    ['not a url', 'block'],
  ])('%s => %s', (url, expected) => {
    expect(decideNavigation(url, ['pokeidle.io'])).toBe(expected);
  });

  test.each([
    ['https://pokeidle.io@evil.com/', 'external'],
    ['https://POKEIDLE.IO/app', 'inside'],
    ['https://pokeidle.io./app', 'external'],
    ['https://notpokeidle.io/app', 'external'],
    ['https://sub.pokeidle.io/app', 'external'],
    ['about:blank', 'block'],
    ['data:text/html,<b>x</b>', 'block'],
    ['blob:https://pokeidle.io/abc', 'block'],
    ['ftp://pokeidle.io/file', 'block'],
    ['', 'block'],
  ])('tricky url %s => %s', (url, expected) => {
    expect(decideNavigation(url, ['pokeidle.io'])).toBe(expected);
  });

  test('http stays inside only with test permission', () => {
    expect(decideNavigation('http://127.0.0.1:5000/', ['127.0.0.1'], true)).toBe('inside');
    expect(decideNavigation('http://127.0.0.1:5000/', ['127.0.0.1'])).toBe('external');
    expect(decideNavigation('http://evil.com/', ['127.0.0.1'], true)).toBe('external');
  });

  test('with no hosts everything web is external', () => {
    expect(decideNavigation('https://pokeidle.io/', [])).toBe('external');
  });
});

describe('canOpenExternal', () => {
  test('external links need user input within 3s', () => {
    expect(canOpenExternal(null, 10000)).toBe(false);
    expect(canOpenExternal(null, 1000)).toBe(false);
    expect(canOpenExternal(7000, 10000)).toBe(true);
    expect(canOpenExternal(6999, 10000)).toBe(false);
  });

  test('input at the same instant counts, input from the future does not', () => {
    expect(canOpenExternal(10000, 10000)).toBe(true);
    expect(canOpenExternal(10001, 10000)).toBe(false);
  });
});

describe('accountShortcut', () => {
  const press = (key: string, modifiers: Partial<Record<'control' | 'shift' | 'alt' | 'meta', boolean>> = {}) => ({
    type: 'keyDown',
    key,
    control: true,
    shift: false,
    alt: false,
    meta: false,
    ...modifiers,
  });

  test.each([
    ['1', 1],
    ['2', 2],
    ['9', 9],
  ])('Ctrl+%s is position %i', (key, position) => {
    expect(accountShortcut(press(key))).toBe(position);
  });

  test('only Ctrl with a digit from 1 to 9 counts', () => {
    expect(accountShortcut(press('0'))).toBeNull();
    expect(accountShortcut(press('a'))).toBeNull();
    expect(accountShortcut(press('10'))).toBeNull();
    expect(accountShortcut(press('2', { control: false }))).toBeNull();
  });

  test('other modifiers and key releases leave the key alone', () => {
    expect(accountShortcut(press('2', { shift: true }))).toBeNull();
    expect(accountShortcut(press('2', { alt: true }))).toBeNull();
    expect(accountShortcut(press('2', { meta: true }))).toBeNull();
    expect(accountShortcut({ ...press('2'), type: 'keyUp' })).toBeNull();
  });
});

describe('zoomForScreen', () => {
  test('grid zoom follows height, with ceiling and floor', () => {
    expect(zoomForScreen('grid', 411)).toBeCloseTo(0.496, 3);
    expect(zoomForScreen('grid', 2000)).toBe(1);
    expect(zoomForScreen('grid', 50)).toBe(0.25);
  });

  test('grid zoom is exactly 1 at the unscaled height and never negative', () => {
    expect(zoomForScreen('grid', 828)).toBe(1);
    expect(zoomForScreen('grid', 0)).toBe(0.25);
    expect(zoomForScreen('grid', -40)).toBe(0.25);
  });

  test('a height that could not be measured leaves the zoom alone', () => {
    expect(zoomForScreen('grid', Number.NaN)).toBe(1);
  });

  test('focus and row use zoom 1', () => {
    expect(zoomForScreen('focus', 300)).toBe(1);
    expect(zoomForScreen('row', 300)).toBe(1);
  });
});

describe('isScreenHidden', () => {
  const statuses: readonly AccountStatus[] = [
    'off', 'loading', 'login', 'connected', 'notice', 'reloading', 'down', 'blocked',
  ];

  test.each(statuses)('view is hidden when off, down, blocked or detached: %s', (status) => {
    const hiddenByStatus = status === 'off' || status === 'down' || status === 'blocked';
    expect(isScreenHidden({ status, detached: false })).toBe(hiddenByStatus);
    expect(isScreenHidden({ status, detached: true })).toBe(true);
  });
});
