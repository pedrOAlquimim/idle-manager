// Runs in the renderer as well as in the main process: import only sibling shared modules here.
import { RELOAD_DELAYS_MS } from './constants';
import type { AccountColor, AccountStatus, AccountView } from './types';

export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

export function formatNumber(value: number, decimals = 0): string {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// Two initials: the first letters of the first two words, or the first two letters of a single word.
export function initialsOf(name: string): string {
  const [first, second] = name.trim().split(/\s+/).filter((word) => word !== '');
  if (first === undefined) return '?';
  const letters = second === undefined ? [...first].slice(0, 2) : [...first].slice(0, 1).concat([...second].slice(0, 1));
  return letters.join('').toUpperCase();
}

const PRINCIPAL_COLOR: AccountColor = { background: '#3b3466', foreground: '#d6ccff', accent: '#f5c84c' };
const PALETTE: readonly AccountColor[] = [
  PRINCIPAL_COLOR,
  { background: '#243049', foreground: '#a5c8ff', accent: '#a5c8ff' },
  { background: '#163a3a', foreground: '#7fe0d0', accent: '#7fe0d0' },
  { background: '#3a2a1a', foreground: '#ffc98a', accent: '#ffc98a' },
];

export function accountColor(index: number): AccountColor {
  const slot = ((Math.trunc(index) % PALETTE.length) + PALETTE.length) % PALETTE.length;
  return PALETTE[slot] ?? PRINCIPAL_COLOR;
}

// `down` and `blocked` use the spec's fixed copy: the supervisor's message for them is the notification
// headline, which is capitalised for a title and not for a status line.
export function statusText(account: AccountView, now: number): string {
  switch (account.status) {
    case 'off':
      return 'desligada';
    case 'loading':
      return 'carregando';
    case 'login':
      return account.message ?? 'aguardando login';
    case 'connected':
      return account.enabledSince === null
        ? 'conectada'
        : `conectada · ligada há ${formatDuration(now - account.enabledSince)}`;
    case 'notice':
      return account.message ?? 'aviso do jogo';
    case 'reloading':
      return `recarregando (${account.attempts}/${RELOAD_DELAYS_MS.length})`;
    case 'down':
      return `não voltou depois de ${RELOAD_DELAYS_MS.length} tentativas`;
    case 'blocked':
      return '5º nick bloqueado';
    default: {
      const _exhaustive: never = account.status;
      return _exhaustive;
    }
  }
}

export function statusColor(status: AccountStatus): string {
  switch (status) {
    case 'off':
      return 'var(--off)';
    case 'loading':
    case 'reloading':
      return 'var(--mem)';
    case 'login':
    case 'notice':
      return 'var(--xp)';
    case 'connected':
      return 'var(--on)';
    case 'down':
    case 'blocked':
      return 'var(--err)';
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}
