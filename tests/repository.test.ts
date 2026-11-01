import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
    { id: accountId('principal'), gameId: gameId('pokeidle'), name: 'Principal', enabled: true, muted: true, nick: 'Ash' },
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
