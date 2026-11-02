import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { account, dataWith, launchApp } from './helpers';
import type { TestApp } from './helpers';

let running: TestApp | undefined;
const scratch: string[] = [];

afterEach(async () => {
  await running?.close();
  running = undefined;
  for (const directory of scratch.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('upgrade', () => {
  test('an installation from version 1 opens logged in', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'idlemanager-upgrade-'));
    scratch.push(dataDir);
    const first = await launchApp({ data: dataWith(account('a')), dataDir });
    running = first;
    await first.waitForStatus('a', 'login');
    await first.inPage('a', `signIn('Ash')`);
    await first.waitForStatus('a', 'connected');
    const port = first.gamePort;
    await first.quitApp();
    expect(await first.exited(8000)).toBe(true);
    await first.close();

    const file = join(dataDir, 'data.json');
    const saved = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown> & { preferences: Record<string, unknown> };
    const { games: _games, ...rest } = saved;
    const { panelOpen: _panelOpen, ...oldPreferences } = saved.preferences;
    const original = JSON.stringify({ ...rest, version: 1, preferences: oldPreferences });
    writeFileSync(file, original);

    running = await launchApp({ dataDir, port });
    await running.waitForStatus('a', 'connected', 15000);
    expect((await running.view()).groups.map((group) => group.gameId)).toEqual(['pokeidle']);
    expect(running.storedData().version).toBe(2);
    expect(readFileSync(join(dataDir, 'data.v1.json'), 'utf8')).toBe(original);
    expect(existsSync(file)).toBe(true);
  });
});
