import { spawn as nodeSpawn } from 'node:child_process';
import type { ChildProcess, SpawnOptions } from 'node:child_process';
import { existsSync } from 'node:fs';
import type { SuspensionBlocker } from './power';

type Spawn = (command: string, args: string[], options: SpawnOptions) => ChildProcess;

export const INHIBIT_COMMAND = 'systemd-inhibit';

// Electron's own blocker also asks a Wayland compositor to keep the screen awake, which would stop the
// monitor from turning off and the session from locking. This one blocks only sleep: `tail --pid` holds the
// lock for as long as the app lives, so even a crash cannot leave the computer unable to sleep.
export function inhibitArguments(appPid: number): string[] {
  return [
    '--what=sleep',
    '--who=IdleManager',
    '--why=Contas do jogo conectadas',
    '--mode=block',
    'tail',
    `--pid=${appPid}`,
    '-f',
    '/dev/null',
  ];
}

export function hasSystemdInhibit(): boolean {
  return process.platform === 'linux' && ['/usr/bin', '/bin'].some((folder) => existsSync(`${folder}/${INHIBIT_COMMAND}`));
}

export class SleepInhibitor implements SuspensionBlocker {
  private readonly spawn: Spawn;
  private readonly appPid: number;
  private readonly children = new Map<number, ChildProcess>();
  private nextId = 1;

  constructor(spawn: Spawn = nodeSpawn, appPid: number = process.pid) {
    this.spawn = spawn;
    this.appPid = appPid;
  }

  start(_type: 'prevent-app-suspension'): number {
    const child = this.spawn(INHIBIT_COMMAND, inhibitArguments(this.appPid), { stdio: 'ignore' });
    child.on('error', (error) => console.error(`${INHIBIT_COMMAND} failed: ${String(error)}`));
    const id = this.nextId;
    this.nextId += 1;
    this.children.set(id, child);
    return id;
  }

  stop(id: number): void {
    this.children.get(id)?.kill();
    this.children.delete(id);
  }
}
