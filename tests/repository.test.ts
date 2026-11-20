import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { Repository } from '../src/main/repository';
import { INITIAL_DATA } from '../src/shared/schemas';
import { accountId, gameId } from '../src/shared/types';
import type { AppData } from '../src/shared/types';

let directory: string;
let file: string;

const DATA: AppData = {
  ...INITIAL_DATA,
  accounts: [
    { id: accountId('principal'), gameId: gameId('pokeidle'), name: 'Principal', enabled: true, muted: true, nick: 'Ash', autoOptimizeHours: null },
  ],
  nicks: { pokeidle: ['Ash'] },
};

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'idlemanager-repository-'));
  file = join(directory, 'nested', 'data.json');
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe('upgrading the file', () => {
  const versionOne = JSON.stringify({
    version: 1,
    accounts: [{ id: 'principal', gameId: 'pokeidle', name: 'Principal', enabled: true, muted: true, nick: null, autoOptimizeHours: null }],
    nicks: {},
    preferences: { layout: 'grid', selectedId: 'principal', sidebarOpen: true, notifications: true },
  });
  const copy = (): string => join(directory, 'nested', 'data.v1.json');
  const place = (content: string): void => {
    mkdirSync(join(directory, 'nested'), { recursive: true });
    writeFileSync(file, content);
  };

  test('reading a version 1 file keeps a copy and rewrites it as version 2', () => {
    place(versionOne);
    expect(new Repository(file).read().version).toBe(2);
    expect(readFileSync(copy(), 'utf8')).toBe(versionOne);
    expect((JSON.parse(readFileSync(file, 'utf8')) as AppData).version).toBe(2);
  });

  test('a copy that already exists is never replaced', () => {
    place(versionOne);
    writeFileSync(copy(), 'the first copy');
    new Repository(file).read();
    expect(readFileSync(copy(), 'utf8')).toBe('the first copy');
  });

  test('reading a version 2 file writes no copy', () => {
    new Repository(file).write(DATA);
    new Repository(file).read();
    expect(existsSync(copy())).toBe(false);
  });

  test('an invalid file is neither copied nor rewritten', () => {
    place('{"version":1');
    expect(() => new Repository(file).read()).toThrow(/Invalid data file/);
    expect(readFileSync(file, 'utf8')).toBe('{"version":1');
    expect(existsSync(copy())).toBe(false);
  });
});

describe('Repository', () => {
  test('missing file returns INITIAL_DATA', () => {
    expect(new Repository(file).read()).toEqual(INITIAL_DATA);
  });

  test('the initial data handed out is a copy, not the shared constant', () => {
    expect(new Repository(file).read()).not.toBe(INITIAL_DATA);
  });

  test('writes and reads the same data', () => {
    const repository = new Repository(file);
    repository.write(DATA);
    expect(new Repository(file).read()).toEqual(DATA);
  });

  test('corrupted file throws with "data" in the message', () => {
    const repository = new Repository(file);
    repository.write(DATA);
    writeFileSync(file, '{broken');
    expect(() => repository.read()).toThrow(/data/);
  });

  test('valid JSON with the wrong shape also throws, and leaves the file alone', () => {
    const repository = new Repository(file);
    repository.write(DATA);
    writeFileSync(file, '{"version":2}');
    expect(() => repository.read()).toThrow(/data/);
    expect(readFileSync(file, 'utf8')).toBe('{"version":2}');
  });

  test('write leaves no temporary file', () => {
    const repository = new Repository(file);
    repository.write(DATA);
    repository.write(DATA);
    expect(readdirSync(join(directory, 'nested'))).toEqual(['data.json']);
    expect(existsSync(file)).toBe(true);
  });
});
