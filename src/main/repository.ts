import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { AppDataSchema, INITIAL_DATA } from '../shared/schemas';
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
    try {
      return AppDataSchema.parse(JSON.parse(readFileSync(this.path, 'utf8')));
    } catch (error) {
      throw new Error(`Invalid data file ${this.path}: ${String(error)}`, { cause: error });
    }
  }

  // Written to a temporary file and renamed, so a crash mid-write cannot leave half a file behind.
  write(data: AppData): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.tmp`;
    writeFileSync(temporary, JSON.stringify(data, null, 2));
    renameSync(temporary, this.path);
  }
}
