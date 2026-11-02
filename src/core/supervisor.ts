import { GAME_MISSING_MS, PROBE_SILENCE_MS, RELOAD_DELAYS_MS, SLEEP_GAP_MS, STABLE_MS } from '../shared/constants';
import type { AccountStatus, ProbeReading } from '../shared/types';

export interface SupervisorState {
  status: AccountStatus;
  message: string | null;
  attempts: number;
  nextReloadAt: number | null;
  lastProbeAt: number;
  lastTickAt: number;
  gameMissingSince: number | null;
  connectedSince: number | null;
  enabledSince: number | null;
  hadSession: boolean;
  hung: boolean;
}

export type SupervisorEvent =
  | { type: 'probe'; reading: ProbeReading; now: number }
  | {
      type: 'enable' | 'disable' | 'block' | 'load-started' | 'load-failed' | 'crash' | 'hung'
        | 'recovered' | 'tick' | 'resumed' | 'retry';
      now: number;
    }
  // The game's first page sent the account to another site: the app does not follow it.
  | { type: 'left-site'; host: string; now: number };

// `title` is the headline of the notification. `body` is extra detail only: the game's own notice
// title for notices, empty otherwise. The account manager adds the account name when it shows it.
// `restart` is a reload in a new process, for a page that may not be answering: a plain reload goes through
// the page's own renderer, so it would wait for that page forever.
export type SupervisorAction = { type: 'reload' } | { type: 'restart' } | { type: 'notify'; title: string; body: string };

export interface SupervisorTransition {
  state: SupervisorState;
  actions: SupervisorAction[];
}

const MESSAGES = {
  sessionTaken: 'Conta aberta em outro lugar',
  loginExpired: 'Login expirado',
  gaveUp: `Não voltou depois de ${RELOAD_DELAYS_MS.length} tentativas`,
  blocked: '5º nick bloqueado',
  gameNotice: 'Aviso do jogo',
  leftSiteTitle: 'Jogo levou para outro site',
} as const;

const leftSiteMessage = (host: string): string => `Esse jogo levou para ${host}. Crie o grupo com esse endereço.`;

export function initialSupervisorState(): SupervisorState {
  return {
    status: 'off',
    message: null,
    attempts: 0,
    nextReloadAt: null,
    lastProbeAt: 0,
    lastTickAt: 0,
    gameMissingSince: null,
    connectedSince: null,
    enabledSince: null,
    hadSession: false,
    hung: false,
  };
}

// off, blocked and down hold the account still: only an explicit command brings it back.
const isParked = (status: AccountStatus): boolean => status === 'off' || status === 'blocked' || status === 'down';

const stay = (state: SupervisorState): SupervisorTransition => ({ state, actions: [] });
const notification = (title: string, body = ''): SupervisorAction => ({ type: 'notify', title, body });

function scheduleReload(state: SupervisorState, now: number): SupervisorTransition {
  const delay = RELOAD_DELAYS_MS[state.attempts];
  if (delay === undefined) {
    const down: SupervisorState = {
      ...state,
      status: 'down',
      message: MESSAGES.gaveUp,
      nextReloadAt: null,
      gameMissingSince: null,
      connectedSince: null,
      hung: false,
    };
    return { state: down, actions: [notification(MESSAGES.gaveUp)] };
  }
  return stay({
    ...state,
    status: 'reloading',
    message: null,
    attempts: state.attempts + 1,
    nextReloadAt: now + delay,
    connectedSince: null,
  });
}

function cancelPendingReload(state: SupervisorState): SupervisorState {
  return {
    ...state,
    status: 'loading',
    message: null,
    nextReloadAt: null,
    attempts: Math.max(0, state.attempts - 1),
    hung: false,
  };
}

// While the machine slept neither probes nor ticks ran, so the time that passed says nothing about the page.
const afterSleep = (state: SupervisorState, now: number): SupervisorState => ({
  ...state,
  lastProbeAt: now,
  gameMissingSince: state.gameMissingSince === null ? null : now,
});

interface Verdict {
  status: AccountStatus;
  message: string | null;
  hadSession: boolean;
  notify: SupervisorAction | null;
}

function judge(state: SupervisorState, reading: ProbeReading): Verdict {
  if (!reading.gamePresent) {
    const status = state.status === 'reloading' ? 'reloading' : 'loading';
    return { status, message: null, hadSession: state.hadSession, notify: null };
  }
  if (reading.sessionTaken) {
    return {
      status: 'notice',
      message: MESSAGES.sessionTaken,
      hadSession: state.hadSession || reading.hasSession,
      notify: notification(MESSAGES.sessionTaken),
    };
  }
  if (reading.hasSession && reading.notice !== null) {
    return {
      status: 'notice',
      message: reading.notice,
      hadSession: true,
      notify: notification(MESSAGES.gameNotice, reading.notice),
    };
  }
  if (!reading.hasSession) {
    if (state.hadSession) {
      return {
        status: 'login',
        message: MESSAGES.loginExpired,
        hadSession: false,
        notify: notification(MESSAGES.loginExpired),
      };
    }
    const keepExpired = state.status === 'login' && state.message === MESSAGES.loginExpired;
    return { status: 'login', message: keepExpired ? MESSAGES.loginExpired : null, hadSession: false, notify: null };
  }
  return { status: reading.gameVisible ? 'connected' : 'loading', message: null, hadSession: true, notify: null };
}

function onProbe(state: SupervisorState, reading: ProbeReading, now: number): SupervisorTransition {
  if (isParked(state.status)) return stay(state);

  let base: SupervisorState = { ...state, lastProbeAt: now };
  // A page that shows the game again is alive: the reload it was waiting for is no longer needed.
  if (reading.gamePresent && base.nextReloadAt !== null) base = cancelPendingReload(base);
  base = { ...base, gameMissingSince: reading.gamePresent ? null : (base.gameMissingSince ?? now) };

  const verdict = judge(base, reading);
  const next: SupervisorState = {
    ...base,
    status: verdict.status,
    message: verdict.message,
    hadSession: verdict.hadSession,
    connectedSince: verdict.status === 'connected' ? (base.status === 'connected' ? (base.connectedSince ?? now) : now) : null,
  };
  const entered = next.status !== state.status || next.message !== state.message;
  return { state: next, actions: entered && verdict.notify !== null ? [verdict.notify] : [] };
}

function onTick(previous: SupervisorState, now: number): SupervisorTransition {
  if (isParked(previous.status)) return stay(previous);

  // A tick that comes this late means the machine slept. Telling it from here matters because nothing
  // decides whether this tick or the system's resume event arrives first after waking up.
  const slept = previous.lastTickAt !== 0 && now - previous.lastTickAt >= SLEEP_GAP_MS;
  const state: SupervisorState = { ...previous, lastTickAt: now };
  if (slept) return stay(afterSleep(state, now));

  if (state.nextReloadAt !== null) {
    if (now < state.nextReloadAt) return stay(state);
    const waiting: SupervisorState = {
      ...state,
      status: 'reloading',
      nextReloadAt: null,
      lastProbeAt: now,
      gameMissingSince: null,
      connectedSince: null,
      hung: false,
    };
    return { state: waiting, actions: [{ type: state.hung ? 'restart' : 'reload' }] };
  }

  // A login form or a game notice is the page working as intended: never reload it on a timer.
  if (state.status === 'login' || state.status === 'notice') return stay(state);

  if (now - state.lastProbeAt >= PROBE_SILENCE_MS) return scheduleReload({ ...state, hung: true }, now);
  if (state.gameMissingSince !== null && now - state.gameMissingSince >= GAME_MISSING_MS) {
    return scheduleReload(state, now);
  }
  const stable =
    state.status === 'connected' &&
    state.attempts > 0 &&
    state.connectedSince !== null &&
    now - state.connectedSince >= STABLE_MS;
  return stay(stable ? { ...state, attempts: 0 } : state);
}

export function transition(state: SupervisorState, event: SupervisorEvent): SupervisorTransition {
  switch (event.type) {
    case 'probe':
      return onProbe(state, event.reading, event.now);
    case 'tick':
      return onTick(state, event.now);
    case 'enable':
      if (state.status !== 'off' && state.status !== 'blocked') return stay(state);
      return stay({ ...initialSupervisorState(), status: 'loading', lastProbeAt: event.now });
    case 'disable':
      return stay(initialSupervisorState());
    case 'block':
      if (state.status === 'off' || state.status === 'blocked') return stay(state);
      return {
        state: { ...initialSupervisorState(), status: 'blocked', message: MESSAGES.blocked },
        actions: [notification(MESSAGES.blocked)],
      };
    case 'load-started': {
      if (isParked(state.status)) return stay(state);
      const started: SupervisorState = {
        ...state,
        lastProbeAt: event.now,
        gameMissingSince: null,
        enabledSince: state.enabledSince ?? event.now,
      };
      // Still waiting for a scheduled reload: keep the schedule and the "reloading" status.
      if (state.nextReloadAt !== null) return stay(started);
      return stay({ ...started, status: 'loading', message: null, connectedSince: null });
    }
    case 'crash':
    case 'load-failed':
      if (isParked(state.status) || state.nextReloadAt !== null) return stay(state);
      return scheduleReload(state, event.now);
    case 'hung': {
      if (isParked(state.status)) return stay(state);
      const flagged: SupervisorState = { ...state, hung: true };
      if (flagged.nextReloadAt !== null) return stay(flagged);
      return scheduleReload(flagged, event.now);
    }
    case 'recovered': {
      if (!state.hung) return stay(state);
      const cleared: SupervisorState = { ...state, hung: false };
      const cancel = cleared.nextReloadAt !== null && cleared.status === 'reloading';
      return stay(cancel ? cancelPendingReload(cleared) : cleared);
    }
    case 'resumed':
      if (isParked(state.status)) return stay(state);
      return stay(afterSleep(state, event.now));
    case 'left-site': {
      if (isParked(state.status)) return stay(state);
      // Down without retries: reloading would end up in the same place.
      const parked: SupervisorState = {
        ...state,
        status: 'down',
        message: leftSiteMessage(event.host),
        nextReloadAt: null,
        gameMissingSince: null,
        connectedSince: null,
        hung: false,
      };
      return { state: parked, actions: [notification(MESSAGES.leftSiteTitle, event.host)] };
    }
    case 'retry':
      if (state.status !== 'down') return stay(state);
      return {
        state: { ...initialSupervisorState(), status: 'loading', lastProbeAt: event.now, enabledSince: state.enabledSince },
        actions: [{ type: 'restart' }],
      };
    default: {
      const _exhaustive: never = event;
      return _exhaustive;
    }
  }
}
