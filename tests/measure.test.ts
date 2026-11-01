import { spawn, spawnSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';

const SCRIPT = join(import.meta.dirname, '..', 'scripts', 'measure.sh');
const HEADER = 'timestamp,elapsed_min,processes,cpu_percent,rss_mb,pss_mb,mem_available_mb,swap_used_mb';

const children: ChildProcess[] = [];
const scratch: string[] = [];

afterEach(() => {
  for (const child of children.splice(0)) child.kill('SIGKILL');
  for (const directory of scratch.splice(0)) rmSync(directory, { recursive: true, force: true });
});

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function outputFile(): string {
  const directory = mkdtempSync(join(tmpdir(), 'idlemanager-measure-'));
  scratch.push(directory);
  return join(directory, 'measure.csv');
}

const measure = (...args: string[]) => spawnSync('bash', [SCRIPT, ...args], { encoding: 'utf8', timeout: 60000 });

type Row = Record<string, number>;

function rowsOf(file: string): Row[] {
  const [header, ...rows] = readFileSync(file, 'utf8').trim().split('\n');
  expect(header).toBe(HEADER);
  const names = (header ?? '').split(',');
  return rows.map((row) => Object.fromEntries(row.split(',').map((value, index) => [names[index] ?? '', index === 0 ? 0 : Number(value)])));
}

// A process with a name of its own (argv[0]), so the script can be pointed at it and at nothing else.
async function startProbe(command: string): Promise<string> {
  const name = `/tmp/idlemanager-probe-${Math.random().toString(36).slice(2, 10)}`;
  const child = spawn('bash', ['-c', `exec -a ${name} ${command}`], { stdio: 'ignore' });
  children.push(child);
  await wait(3500);
  return name;
}

const BURN_USER = `python3 -I -c "while True: pass"`;
const BURN_SYSTEM = 'dd if=/dev/zero of=/dev/null bs=1';
// 200 MB really touched, plus 400 MB that is only reserved: the virtual size is far from the resident size.
const HOLD_MEMORY = `python3 -I -c "import mmap, time; a = bytearray(200 * 1024 * 1024); [a.__setitem__(i, 1) for i in range(0, len(a), 4096)]; b = mmap.mmap(-1, 400 * 1024 * 1024); time.sleep(120)"`;

describe('cpu_percent', { timeout: 30000 }, () => {
  test('is the usage between two samples: one busy core reads about 100', async () => {
    const probe = await startProbe(BURN_USER);
    const out = outputFile();
    expect(measure('--samples', '2', '--interval', '2', '--out', out, '--match', probe).status).toBe(0);
    for (const row of rowsOf(out)) {
      expect(row.processes).toBe(1);
      expect(row.cpu_percent).toBeGreaterThan(60);
      expect(row.cpu_percent).toBeLessThan(140);
    }
  });

  test('counts time spent in the system as well as in the program', async () => {
    const probe = await startProbe(BURN_SYSTEM);
    const out = outputFile();
    expect(measure('--samples', '1', '--interval', '2', '--out', out, '--match', probe).status).toBe(0);
    const [row] = rowsOf(out);
    expect(row?.cpu_percent).toBeGreaterThan(60);
    expect(row?.cpu_percent).toBeLessThan(140);
  });

  test('adds up several processes, one row for all of them', async () => {
    const first = await startProbe(BURN_USER);
    const out = outputFile();
    const second = await startProbe(BURN_USER);
    const shared = `(${first.split('/').pop()}|${second.split('/').pop()})`;
    expect(measure('--samples', '1', '--interval', '2', '--out', out, '--match', shared).status).toBe(0);
    const [row] = rowsOf(out);
    expect(row?.processes).toBe(2);
    expect(row?.cpu_percent).toBeGreaterThan(120);
  });
});

describe('memory columns', { timeout: 30000 }, () => {
  test('rss_mb and pss_mb match what the kernel reports for the same process, in MB', async () => {
    const probe = await startProbe(HOLD_MEMORY);
    const pid = spawnSync('bash', ['-c', `ps -eo pid=,args= | awk '$2 == "${probe}" { print $1 }'`], { encoding: 'utf8' }).stdout.trim();
    expect(pid).toMatch(/^\d+$/);
    const kernel = (file: string, key: string): number =>
      Number(spawnSync('awk', [`$1 == "${key}:" { print $2 }`, `/proc/${pid}/${file}`], { encoding: 'utf8' }).stdout.trim()) / 1024;

    const out = outputFile();
    expect(measure('--samples', '1', '--interval', '1', '--out', out, '--match', probe).status).toBe(0);
    const [row] = rowsOf(out);
    expect(row?.rss_mb).toBeGreaterThan(190);
    expect(Math.abs((row?.rss_mb ?? 0) - kernel('status', 'VmRSS'))).toBeLessThanOrEqual(2);
    expect(Math.abs((row?.pss_mb ?? 0) - kernel('smaps_rollup', 'Pss'))).toBeLessThanOrEqual(2);
    // Shared libraries are in the RSS in full and in the PSS only by share: the two must not be the same number.
    expect((row?.rss_mb ?? 0) - (row?.pss_mb ?? 0)).toBeGreaterThanOrEqual(1);
  });

  test('mem_available_mb and swap_used_mb match /proc/meminfo, in MB', () => {
    const meminfo = readFileSync('/proc/meminfo', 'utf8');
    const kb = (key: string): number => Number(new RegExp(`^${key}:\\s+(\\d+)`, 'm').exec(meminfo)?.[1] ?? Number.NaN);
    const out = outputFile();
    expect(measure('--samples', '1', '--interval', '1', '--out', out, '--match', '/no/such/program').status).toBe(0);
    const [row] = rowsOf(out);
    expect(Math.abs((row?.mem_available_mb ?? 0) - kb('MemAvailable') / 1024)).toBeLessThan(300);
    expect(Math.abs((row?.swap_used_mb ?? 0) - (kb('SwapTotal') - kb('SwapFree')) / 1024)).toBeLessThan(100);
  });
});

describe('time and rows', { timeout: 30000 }, () => {
  test('elapsed_min counts minutes since the script started, growing sample by sample', () => {
    const out = outputFile();
    expect(measure('--samples', '3', '--interval', '2', '--out', out, '--match', '/no/such/program').status).toBe(0);
    const rows = rowsOf(out);
    expect(rows.map((row) => row.elapsed_min)).toEqual(expect.arrayContaining([expect.any(Number)]));
    expect(rows[0]?.elapsed_min).toBeGreaterThan(0.02);
    expect(rows[0]?.elapsed_min).toBeLessThan(0.1);
    expect(rows[2]?.elapsed_min).toBeGreaterThan(0.08);
    expect(rows[2]?.elapsed_min).toBeLessThan(0.3);
    expect((rows[1]?.elapsed_min ?? 0) > (rows[0]?.elapsed_min ?? 1)).toBe(true);
  });

  test('records zeros when no process matches, instead of stopping', () => {
    const out = outputFile();
    const result = measure('--samples', '2', '--interval', '1', '--out', out, '--match', '/no/such/program');
    expect(result.status).toBe(0);
    const rows = rowsOf(out);
    expect(rows).toHaveLength(2);
    for (const row of rows) expect([row.processes, row.cpu_percent, row.rss_mb, row.pss_mb]).toEqual([0, 0, 0, 0]);
  });

  test('keeps going when the app dies between two samples', async () => {
    const probe = await startProbe(BURN_USER);
    const out = outputFile();
    const running = spawn('bash', [SCRIPT, '--samples', '3', '--interval', '2', '--out', out, '--match', probe], { stdio: 'ignore' });
    children.push(running);
    await wait(3000);
    spawnSync('bash', ['-c', `pkill -KILL -f -x '${probe} -I -c while True: pass'`]);
    await new Promise<void>((resolve) => running.on('exit', () => resolve()));
    const rows = rowsOf(out);
    expect(rows).toHaveLength(3);
    expect(rows[0]?.processes).toBe(1);
    expect(rows[2]?.processes).toBe(0);
  });

  test('appends to an existing file without repeating the header', () => {
    const out = outputFile();
    expect(measure('--samples', '1', '--interval', '1', '--out', out, '--match', '/no/such/program').status).toBe(0);
    expect(measure('--samples', '1', '--interval', '1', '--out', out, '--match', '/no/such/program').status).toBe(0);
    const lines = readFileSync(out, 'utf8').trim().split('\n');
    expect(lines.filter((line) => line === HEADER)).toHaveLength(1);
    expect(lines).toHaveLength(3);
  });
});

describe('arguments', () => {
  test.each([
    [['--samples', 'abc']],
    [['--samples', '0']],
    [['--interval', '-1']],
    [['--interval', '0']],
    [['--samples']],
    [['--unknown']],
  ])('refuses %j with exit code 2 and a usage line', (args) => {
    const result = measure(...args);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('uso:');
  });
});
