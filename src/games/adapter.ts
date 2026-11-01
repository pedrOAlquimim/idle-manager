import type { ProbeReading } from '../shared/types';
import { genericAdapter } from './generic';
import { POKEIDLE_ID, pokeidleAdapter } from './pokeidle';

export type ReadableDocument = Pick<Document, 'querySelector'>;
export type ReadableStorage = Pick<Storage, 'getItem'>;

// Everything that is specific to one game lives behind this interface: what its page looks like when it
// is connected, and when the Escape key still belongs to it.
export interface GameAdapter {
  read(doc: ReadableDocument, storage: ReadableStorage): ProbeReading;
  escapeIsFree(doc: ReadableDocument): boolean;
}

const ADAPTERS = new Map<string, GameAdapter>([[POKEIDLE_ID, pokeidleAdapter]]);

export function adapterFor(id: string): GameAdapter {
  return ADAPTERS.get(id) ?? genericAdapter;
}
