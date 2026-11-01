import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, test } from 'vitest';

const SOURCE_ROOT = join(import.meta.dirname, '..', 'src');
const GAMES_FOLDER = join(SOURCE_ROOT, 'games');

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : [path];
  });
}

describe('game boundary', () => {
  test('nothing outside src/games cites Pokeidle, its selectors or its session key', () => {
    const offenders = sourceFiles(SOURCE_ROOT)
      .filter((file) => !file.startsWith(GAMES_FOLDER))
      .filter((file) => /pokeidle|sessao|#portal|alerta-conta/i.test(readFileSync(file, 'utf8')))
      .map((file) => relative(SOURCE_ROOT, file));
    expect(offenders).toEqual([]);
  });
});
