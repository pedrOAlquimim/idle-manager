import { describe, expect, test } from 'vitest';
import { inhibitArguments, INHIBIT_COMMAND, SleepInhibitor } from '../src/main/sleep-inhibitor';

interface FakeChild {
  killed: number;
  errorHandlers: ((error: Error) => void)[];
  kill(): boolean;
  on(event: 'error', handler: (error: Error) => void): FakeChild;
}

function fakeSpawn() {
  const calls: { command: string; args: string[] }[] = [];
  const children: FakeChild[] = [];
  const spawn = (command: string, args: string[]) => {
    calls.push({ command, args });
    const child: FakeChild = {
      killed: 0,
      errorHandlers: [],
      kill() {
        this.killed += 1;
        return true;
      },
      on(_event, handler) {
        this.errorHandlers.push(handler);
        return this;
      },
    };
    children.push(child);
    return child as never;
  };
  return { spawn, calls, children };
}

describe('inhibitArguments', () => {
  test('blocks only sleep, in block mode, and waits for the app process to end', () => {
    expect(inhibitArguments(4242)).toEqual([
      '--what=sleep',
      '--who=IdleManager',
      '--why=Contas do jogo conectadas',
      '--mode=block',
      'tail',
      '--pid=4242',
      '-f',
      '/dev/null',
    ]);
  });

  test('never asks to block idle, shutdown or the screen', () => {
    const text = inhibitArguments(1).join(' ');
    expect(text).not.toMatch(/idle|shutdown|handle-|screen/);
  });
});

describe('SleepInhibitor', () => {
  test('start runs systemd-inhibit for the app process and returns an id', () => {
    const { spawn, calls } = fakeSpawn();
    const inhibitor = new SleepInhibitor(spawn, 777);
    const id = inhibitor.start('prevent-app-suspension');
    expect(id).toBeGreaterThan(0);
    expect(calls).toEqual([{ command: INHIBIT_COMMAND, args: inhibitArguments(777) }]);
  });

  test('stop ends exactly the process of that id, once', () => {
    const { spawn, children } = fakeSpawn();
    const inhibitor = new SleepInhibitor(spawn, 1);
    const first = inhibitor.start('prevent-app-suspension');
    const second = inhibitor.start('prevent-app-suspension');
    expect(second).not.toBe(first);

    inhibitor.stop(first);
    inhibitor.stop(first);
    expect(children.map((child) => child.killed)).toEqual([1, 0]);
    inhibitor.stop(second);
    expect(children.map((child) => child.killed)).toEqual([1, 1]);
  });

  test('stopping an id that was never started does nothing', () => {
    const { spawn, children } = fakeSpawn();
    const inhibitor = new SleepInhibitor(spawn, 1);
    inhibitor.start('prevent-app-suspension');
    inhibitor.stop(999);
    expect(children[0]?.killed).toBe(0);
  });

  test('a failing process is reported to the console instead of crashing the app', () => {
    const { spawn, children } = fakeSpawn();
    const inhibitor = new SleepInhibitor(spawn, 1);
    inhibitor.start('prevent-app-suspension');
    expect(children[0]?.errorHandlers).toHaveLength(1);
    expect(() => children[0]?.errorHandlers[0]?.(new Error('spawn failed'))).not.toThrow();
  });
});
