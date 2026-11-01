import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { account, dataWith, launchApp } from './helpers';
import type { TestApp } from './helpers';

const SCRIPT = join(import.meta.dirname, '..', '..', 'scripts', 'measure.sh');
const HEADER = 'timestamp,elapsed_min,processes,cpu_percent,rss_mb,pss_mb,mem_available_mb,swap_used_mb';

let running: TestApp | undefined;
const scratch: string[] = [];

afterEach(async () => {
  await running?.close();
  running = undefined;
  for (const directory of scratch.splice(0)) rmSync(directory, { recursive: true, force: true });
});

const outputFile = (): string => {
  const directory = mkdtempSync(join(tmpdir(), 'idlemanager-measure-'));
  scratch.push(directory);
  return join(directory, 'measure.csv');
};

const measure = (...args: string[]) => spawnSync('bash', [SCRIPT, ...args], { encoding: 'utf8', timeout: 60000 });

function rowsOf(file: string): Record<string, number>[] {
  const [header, ...rows] = readFileSync(file, 'utf8').trim().split('\n');
  expect(header).toBe(HEADER);
  const names = (header ?? '').split(',');
  return rows.map((row) => Object.fromEntries(row.split(',').map((value, index) => [names[index] ?? '', index === 0 ? 0 : Number(value)])));
}

describe('scripts/measure.sh', () => {
  test('writes one CSV row per sample for the running app', async () => {
    running = await launchApp({ data: dataWith(account('a'), account('b')) });
    await running.waitForStatus('a', 'login');
    await running.waitForStatus('b', 'login', 15000);

    const out = outputFile();
    const result = measure('--samples', '3', '--interval', '2', '--out', out);
    expect(result.status).toBe(0);

    const rows = rowsOf(out);
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      // browser, GPU, network service, the interface and two accounts
      expect(row.processes).toBeGreaterThanOrEqual(6);
      expect(row.cpu_percent).toBeGreaterThanOrEqual(0);
      expect(row.rss_mb).toBeGreaterThan(150);
      expect(row.pss_mb).toBeGreaterThan(100);
      expect(row.pss_mb).toBeLessThanOrEqual(row.rss_mb ?? 0);
      expect(row.mem_available_mb).toBeGreaterThan(0);
      expect(row.swap_used_mb).toBeGreaterThanOrEqual(0);
    }
    expect(rows[0]?.elapsed_min).toBeGreaterThan(0);
    expect(rows[2]?.elapsed_min).toBeGreaterThan(rows[0]?.elapsed_min ?? Number.POSITIVE_INFINITY);
  });

  test('counts only the processes that run the app\'s own program, not helpers or the script itself', async () => {
    running = await launchApp({ data: dataWith(account('a')) });
    await running.waitForStatus('a', 'login');
    const program = String(running.app.process().spawnfile);
    // The app's tree also holds desktop helpers (icon loaders, sandboxes) that run other programs.
    const own = spawnSync(
      'bash',
      ['-c', `pstree -p -T ${running.app.process().pid} | grep -o '([0-9]*)' | tr -d '()' | while read p; do ps -o args= -p $p | awk '{print $1}'; done | grep -c -x '${program}'`],
      { encoding: 'utf8' },
    );
    const expected = Number(own.stdout.trim());
    expect(expected).toBeGreaterThanOrEqual(5);

    const out = outputFile();
    expect(measure('--samples', '1', '--interval', '1', '--out', out, '--match', program).status).toBe(0);
    expect(Math.abs((rowsOf(out)[0]?.processes ?? -1) - expected)).toBeLessThanOrEqual(1);
  });
});
