import { AppDataSchema, AppDataV1Schema } from '../shared/schemas';
import { gameId } from '../shared/types';
import type { AppData } from '../shared/types';
import { POKEIDLE_ID, POKEIDLE_NAME, POKEIDLE_URL } from './pokeidle';

const isVersionOne = (raw: unknown): boolean =>
  typeof raw === 'object' && raw !== null && 'version' in raw && raw.version === 1;

// Version 1 had a single game, written in the code, and its ids are kept: the partitions that hold the
// logins are named after them.
export function upgradeData(raw: unknown): { data: AppData; upgraded: boolean } {
  if (!isVersionOne(raw)) return { data: AppDataSchema.parse(raw), upgraded: false };

  const old = AppDataV1Schema.parse(raw);
  const stray = old.accounts.find((account) => account.gameId !== POKEIDLE_ID);
  if (stray !== undefined) throw new Error(`Account ${stray.id} belongs to an unknown game: ${stray.gameId}`);

  const hasGame = old.accounts.length > 0 || old.nicks[POKEIDLE_ID] !== undefined;
  return {
    upgraded: true,
    data: {
      version: 2,
      games: hasGame ? [{ id: gameId(POKEIDLE_ID), name: POKEIDLE_NAME, startUrl: POKEIDLE_URL }] : [],
      accounts: old.accounts,
      nicks: old.nicks,
      preferences: { ...old.preferences, panelOpen: true },
    },
  };
}
