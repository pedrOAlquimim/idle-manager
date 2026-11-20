import { z } from 'zod';
import { accountId, gameId } from './types';
import type { AppData, ProbeReading } from './types';

// Stored data is validated on read. The schema must never be stricter than what the code writes,
// otherwise a value the app itself saved could lock the app out of its own data file.
const ID_PATTERN = /^[a-z0-9-]{1,40}$/;

const accountIdSchema = z.string().regex(ID_PATTERN).transform(accountId);
const gameIdSchema = z.string().regex(ID_PATTERN).transform(gameId);

const storedAccountSchema = z.object({
  id: accountIdSchema,
  gameId: gameIdSchema,
  name: z.string().min(1),
  enabled: z.boolean(),
  muted: z.boolean(),
  nick: z.string().nullable(),
  // Files written before this setting existed read as off.
  autoOptimizeHours: z.number().int().min(1).max(72).nullable().default(null),
});

const storedGameSchema = z.object({
  id: gameIdSchema,
  name: z.string().min(1),
  startUrl: z.string().refine((url) => URL.canParse(url)),
});

const preferencesV1Schema = z.object({
  layout: z.enum(['grid', 'focus', 'row']),
  selectedId: accountIdSchema.nullable(),
  sidebarOpen: z.boolean(),
  notifications: z.boolean(),
});

const preferencesSchema = preferencesV1Schema.extend({ panelOpen: z.boolean() });

// The file as the first release wrote it: one game, written in the code.
export const AppDataV1Schema = z.object({
  version: z.literal(1),
  accounts: z.array(storedAccountSchema),
  nicks: z.record(z.string(), z.array(z.string())),
  preferences: preferencesV1Schema,
});

export const AppDataSchema: z.ZodType<AppData> = z.object({
  version: z.literal(2),
  games: z.array(storedGameSchema),
  accounts: z.array(storedAccountSchema),
  nicks: z.record(z.string(), z.array(z.string())),
  preferences: preferencesSchema,
});

export const ProbeReadingSchema: z.ZodType<ProbeReading> = z.object({
  gamePresent: z.boolean(),
  gameVisible: z.boolean(),
  hasSession: z.boolean(),
  nick: z.string().nullable(),
  sessionTaken: z.boolean(),
  notice: z.string().nullable(),
});

export const INITIAL_DATA: AppData = {
  version: 2,
  games: [],
  accounts: [],
  nicks: {},
  preferences: { layout: 'grid', selectedId: null, sidebarOpen: true, panelOpen: true, notifications: true },
};
