import { describe, expect, test } from 'vitest';
import { PowerGuard } from '../src/main/power';
import type { SuspensionBlocker } from '../src/main/power';

function fakeBlocker() {
  const calls: string[] = [];
  let lastId = 100;
  const blocker: SuspensionBlocker = {
    start: (type) => {
      lastId += 1;
      calls.push(`start:${type}:${lastId}`);
      return lastId;
    },
    stop: (id) => {
      calls.push(`stop:${id}`);
    },
  };
  return { blocker, calls };
}

describe('PowerGuard', () => {
  test('blocks suspension once while accounts are connected', () => {
    const { blocker, calls } = fakeBlocker();
    const guard = new PowerGuard(blocker);
    guard.update(true);
    guard.update(true);
    guard.update(true);
    expect(calls).toEqual(['start:prevent-app-suspension:101']);
    expect(guard.active).toBe(true);
  });

  test('lets suspension go when no account is connected, and only once', () => {
    const { blocker, calls } = fakeBlocker();
    const guard = new PowerGuard(blocker);
    guard.update(true);
    guard.update(false);
    guard.update(false);
    expect(calls).toEqual(['start:prevent-app-suspension:101', 'stop:101']);
    expect(guard.active).toBe(false);
  });

  test('does nothing while nobody is connected', () => {
    const { blocker, calls } = fakeBlocker();
    const guard = new PowerGuard(blocker);
    guard.update(false);
    expect(calls).toEqual([]);
  });

  test('blocks again after letting go, with a new blocker', () => {
    const { blocker, calls } = fakeBlocker();
    const guard = new PowerGuard(blocker);
    guard.update(true);
    guard.update(false);
    guard.update(true);
    expect(calls).toEqual(['start:prevent-app-suspension:101', 'stop:101', 'start:prevent-app-suspension:102']);
  });

  test('dispose releases an active block and is harmless otherwise', () => {
    const { blocker, calls } = fakeBlocker();
    const guard = new PowerGuard(blocker);
    guard.dispose();
    expect(calls).toEqual([]);
    guard.update(true);
    guard.dispose();
    guard.dispose();
    expect(calls).toEqual(['start:prevent-app-suspension:101', 'stop:101']);
  });
});
