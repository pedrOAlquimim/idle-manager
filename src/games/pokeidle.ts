import type { ProbeReading } from '../shared/types';
import type { GameAdapter, ReadableDocument, ReadableStorage } from './adapter';

export const POKEIDLE_ID = 'pokeidle';
export const POKEIDLE_SESSION_KEY = 'sessao';

const SELECTORS = {
  portal: '#portal',
  app: '#app',
  sessionTaken: '#sessao-tomada',
  notice: '#alerta-conta',
  noticeTitle: '#alerta-conta-titulo',
  modal: '#modal',
} as const;

const FALLBACK_NOTICE = 'Aviso do jogo';
const MAX_NOTICE_LENGTH = 200;

// The game marks whatever is not on screen with the `hidden` class and keeps it in the document.
function isOpen(doc: ReadableDocument, selector: string): boolean {
  const element = doc.querySelector(selector);
  return element !== null && !element.classList.contains('hidden');
}

// The game's own rule for a usable session: a stored object with both a nick and a token.
function readNick(storage: ReadableStorage): string | null {
  try {
    const raw = storage.getItem(POKEIDLE_SESSION_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { nick, token } = parsed as { nick?: unknown; token?: unknown };
    return typeof nick === 'string' && nick !== '' && typeof token === 'string' && token !== '' ? nick : null;
  } catch {
    return null;
  }
}

function readNotice(doc: ReadableDocument): string | null {
  if (!isOpen(doc, SELECTORS.notice)) return null;
  const title = doc.querySelector(SELECTORS.noticeTitle)?.textContent?.trim() ?? '';
  return (title === '' ? FALLBACK_NOTICE : title).slice(0, MAX_NOTICE_LENGTH);
}

export const pokeidleAdapter: GameAdapter = {
  read(doc, storage): ProbeReading {
    const nick = readNick(storage);
    return {
      gamePresent: doc.querySelector(SELECTORS.portal) !== null,
      gameVisible: isOpen(doc, SELECTORS.app),
      hasSession: nick !== null,
      nick,
      sessionTaken: isOpen(doc, SELECTORS.sessionTaken),
      notice: readNotice(doc),
    };
  },

  escapeIsFree(doc): boolean {
    return !isOpen(doc, SELECTORS.modal) && !isOpen(doc, SELECTORS.notice);
  },
};
