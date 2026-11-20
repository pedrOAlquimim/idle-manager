import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { upgradeData } from '../games/migrate';
import { INITIAL_DATA } from '../shared/schemas';
import type { AppData } from '../shared/types';

export class Repository {
  private readonly path: string;

  constructor(path: string) {
    this.path = path;
  }

  // An invalid file throws instead of falling back to empty data: starting over would silently forget
  // the known nicks and switch off the account limit.
  read(): AppData {
    if (!existsSync(this.path)) return structuredClone(INITIAL_DATA);
    let result: ReturnType<typeof upgradeData>;
    try {
      result = upgradeData(JSON.parse(readFileSync(this.path, 'utf8')));
    } catch (error) {
      throw new Error(`Invalid data file ${this.path}: ${String(error)}`, { cause: error });
    }
    if (result.upgraded) {
      this.keepOriginal();
      this.write(result.data);
    }
    return result.data;
  }

  // The file as it was before the upgrade, once: a second upgrade must not replace the first copy.
  // A copy keeps the original's permissions, which older versions left readable by the group.
  private keepOriginal(): void {
    const copy = join(dirname(this.path), 'data.v1.json');
    if (existsSync(copy)) return;
    copyFileSync(this.path, copy);
    chmodSync(copy, 0o600);
  }

  // Written to a temporary file and renamed, so a crash mid-write cannot leave half a file behind.
  write(data: AppData): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.tmp`;
    writeFileSync(temporary, JSON.stringify(data, null, 2), { mode: 0o600 });
    renameSync(temporary, this.path);
  }
}
