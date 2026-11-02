import { describe, expect, test } from 'vitest';
import { initialSupervisorState, transition } from '../src/core/supervisor';
import type { SupervisorAction, SupervisorEvent, SupervisorState } from '../src/core/supervisor';
import type { ProbeReading } from '../src/shared/types';

type NotifyAction = Extract<SupervisorAction, { type: 'notify' }>;

const GAVE_UP = 'Não voltou depois de 3 tentativas';

const reading = (partial: Partial<ProbeReading> = {}): ProbeReading => ({
  gamePresent: true,
  gameVisible: true,
  hasSession: true,
  nick: 'Ash',
  sessionTaken: false,
  notice: null,
  ...partial,
});

const ev = (type: Exclude<SupervisorEvent['type'], 'probe' | 'left-site'>, now: number): SupervisorEvent => ({ type, now });
const leftSite = (host: string, now: number): SupervisorEvent => ({ type: 'left-site', host, now });
const probe = (now: number, partial: Partial<ProbeReading> = {}): SupervisorEvent => ({
  type: 'probe',
  reading: reading(partial),
  now,
});
const notify = (title: string, body = ''): NotifyAction => ({ type: 'notify', title, body });
// The manager's clock ticks every second, and a tick after a longer gap reads as sleep: this is the tick
// right after the one a second earlier.
const tickAt = (state: SupervisorState, now: number) => transition({ ...state, lastTickAt: now - 1000 }, ev('tick', now));

// What the login form looks like: the page is alive, the game's UI is the login portal, no session yet.
const LOGIN_FORM: Partial<ProbeReading> = { hasSession: false, gameVisible: false, nick: null };

function apply(start: SupervisorState, events: readonly SupervisorEvent[]) {
  let state = start;
  const actions: SupervisorAction[] = [];
  for (const event of events) {
    const result = transition(state, event);
    state = result.state;
    actions.push(...result.actions);
  }
  return { state, actions };
}

function loading(now = 0): SupervisorState {
  return apply(initialSupervisorState(), [ev('enable', now), ev('load-started', now)]).state;
}

function connected(now = 0): SupervisorState {
  return apply(loading(now), [probe(now)]).state;
}

// Runs the clock second by second, like the account manager does: a tick every 1s, a probe every 2s.
// A reload action is followed by the navigation it causes.
function simulate(
  start: SupervisorState,
  from: number,
  to: number,
  readingFor: (now: number) => Partial<ProbeReading> | null = () => ({}),
) {
  let state = start;
  const reloads: number[] = [];
  const notifications: NotifyAction[] = [];
  const feed = (event: SupervisorEvent, now: number): void => {
    const result = transition(state, event);
    state = result.state;
    for (const action of result.actions) {
      if (action.type === 'notify') {
        notifications.push(action);
      } else {
        reloads.push(now);
        feed(ev('load-started', now), now);
      }
    }
  };
  for (let now = from; now <= to; now += 1000) {
    const partial = now % 2000 === 0 ? readingFor(now) : null;
    if (partial !== null) feed(probe(now, partial), now);
    feed(ev('tick', now), now);
  }
  return { state, reloads, notifications };
}

function reachDown(): { state: SupervisorState; at: number } {
  let state = connected(0);
  let now = 0;
  for (const delay of [5000, 15000, 60000]) {
    state = transition(state, ev('crash', now)).state;
    now += delay;
    state = transition(tickAt(state, now).state, ev('load-started', now)).state;
  }
  const last = transition(state, ev('crash', now + 1));
  return { state: last.state, at: now + 1 };
}

describe('lifecycle', () => {
  test('enable moves to loading; load-started sets enabledSince', () => {
    const off = initialSupervisorState();
    expect(off.status).toBe('off');
    const enabled = transition(off, ev('enable', 100)).state;
    expect(enabled).toMatchObject({ status: 'loading', enabledSince: null });
    const started = transition(enabled, ev('load-started', 200)).state;
    expect(started.enabledSince).toBe(200);
    expect(transition(started, ev('load-started', 900)).state.enabledSince).toBe(200);
  });

  test('enable on an account that is already running changes nothing', () => {
    const state = connected(0);
    expect(transition(state, ev('enable', 10)).state).toBe(state);
  });

  test('disable cancels a scheduled reload and ignores ticks', () => {
    const crashed = apply(connected(0), [ev('crash', 0)]);
    const off = apply(crashed.state, [ev('disable', 1), ev('tick', 5000), ev('crash', 6000), probe(7000)]);
    expect(off.state).toEqual(initialSupervisorState());
    expect(off.actions).toEqual([]);
  });
});

describe('readings', () => {
  test('connected when the game is visible with a session', () => {
    expect(connected(1000)).toMatchObject({ status: 'connected', message: null, connectedSince: 1000, hadSession: true });
  });

  test('a session whose game UI is not visible yet is still loading', () => {
    const state = apply(loading(0), [probe(1000, { gameVisible: false })]).state;
    expect(state.status).toBe('loading');
  });

  test('login form without session stays in login, without notifying', () => {
    const result = apply(loading(0), [probe(1000, LOGIN_FORM)]);
    expect(result.state).toMatchObject({ status: 'login', message: null });
    expect(result.actions).toEqual([]);
  });

  test('taken session does not reload and notifies once', () => {
    const taken = apply(connected(0), [probe(2000, { sessionTaken: true })]);
    expect(taken.state).toMatchObject({ status: 'notice', message: 'Conta aberta em outro lugar', nextReloadAt: null });
    expect(taken.actions).toEqual([notify('Conta aberta em outro lugar')]);
    const later = simulate(taken.state, 3000, 600_000, () => ({ sessionTaken: true }));
    expect(later.notifications).toEqual([]);
    expect(later.reloads).toEqual([]);
    expect(later.state.status).toBe('notice');
  });

  test('notice with session does not reload and uses the title', () => {
    const noticed = apply(connected(0), [probe(2000, { notice: 'Rede cheia' })]);
    expect(noticed.state).toMatchObject({ status: 'notice', message: 'Rede cheia' });
    expect(noticed.actions).toEqual([notify('Aviso do jogo', 'Rede cheia')]);
    const same = apply(noticed.state, [probe(4000, { notice: 'Rede cheia' })]);
    expect(same.actions).toEqual([]);
    const other = apply(noticed.state, [probe(4000, { notice: 'Conta banida' })]);
    expect(other.actions).toEqual([notify('Aviso do jogo', 'Conta banida')]);
  });

  test('a notice that goes away returns to connected without notifying', () => {
    const noticed = apply(connected(0), [probe(2000, { notice: 'Rede cheia' })]).state;
    const cleared = apply(noticed, [probe(4000)]);
    expect(cleared.state).toMatchObject({ status: 'connected', message: null });
    expect(cleared.actions).toEqual([]);
  });

  test('notice without session stays in login without notifying', () => {
    const result = apply(loading(0), [probe(1000, { ...LOGIN_FORM, notice: 'Senha incorreta' })]);
    expect(result.state).toMatchObject({ status: 'login', message: null });
    expect(result.actions).toEqual([]);
  });

  test('losing the session after connecting notifies expired login once', () => {
    const lost = apply(connected(0), [probe(2000, LOGIN_FORM)]);
    expect(lost.state).toMatchObject({ status: 'login', message: 'Login expirado', hadSession: false });
    expect(lost.actions).toEqual([notify('Login expirado')]);

    const again = apply(lost.state, [probe(4000, LOGIN_FORM)]);
    expect(again.actions).toEqual([]);
    expect(again.state.message).toBe('Login expirado');

    const signedIn = apply(again.state, [probe(6000)]);
    expect(signedIn.state).toMatchObject({ status: 'connected', message: null });
    expect(signedIn.actions).toEqual([]);
  });
});

describe('a machine that slept', () => {
  test('a gap between ticks is sleep, not silence, even when the resume event comes later', () => {
    let state = connected(0);
    state = transition(state, ev('tick', 1000)).state;
    const woke = transition(state, ev('tick', 3_600_000));
    expect(woke.actions).toEqual([]);
    expect(woke.state).toMatchObject({ status: 'connected', attempts: 0, nextReloadAt: null, lastProbeAt: 3_600_000 });
    expect(transition(woke.state, ev('resumed', 3_600_100)).state.status).toBe('connected');
  });

  test('an account that used all its attempts is not taken down by the sleep', () => {
    let state: SupervisorState = { ...connected(0), attempts: 3 };
    state = transition(state, ev('tick', 1000)).state;
    const woke = transition(state, ev('tick', 3_600_000));
    expect(woke.state.status).toBe('connected');
    expect(woke.actions).toEqual([]);
  });

  test('the time a missing game waited does not count across the sleep', () => {
    let state = connected(0);
    state = transition(state, probe(1000, { gamePresent: false })).state;
    state = transition(state, ev('tick', 2000)).state;
    const woke = transition(state, ev('tick', 3_600_000));
    expect(woke.actions).toEqual([]);
    expect(woke.state.gameMissingSince).toBe(3_600_000);
  });

  test('a pause too short to be sleep still counts as silence', () => {
    const start = connected(0);
    const ticked = transition(start, ev('tick', start.lastProbeAt + 59_000)).state;
    expect(transition(ticked, ev('tick', start.lastProbeAt + 60_000)).state.status).toBe('reloading');
  });
});

describe('failures and reloads', () => {
  test.each(['crash', 'load-failed', 'hung'] as const)('%s schedules a reload in 5s and fires only on the right tick', (type) => {
    const failed = apply(connected(0), [ev(type, 0)]);
    expect(failed.state).toMatchObject({ status: 'reloading', attempts: 1, nextReloadAt: 5000 });
    expect(failed.actions).toEqual([]);
    expect(transition(failed.state, ev('tick', 4999)).actions).toEqual([]);
    expect(transition(failed.state, ev('tick', 5000)).actions).toEqual([{ type: type === 'hung' ? 'restart' : 'reload' }]);
  });

  test('a navigation starts the reload that was scheduled: loading again, schedule consumed', () => {
    const fired = apply(connected(0), [ev('crash', 0), ev('tick', 5000), ev('load-started', 5100)]);
    expect(fired.state).toMatchObject({ status: 'loading', nextReloadAt: null, attempts: 1 });
  });

  test('three failures use 5s, 15s and 60s, then go down and notify once', () => {
    let state = connected(0);
    let now = 0;
    for (const delay of [5000, 15000, 60000]) {
      const failed = transition(state, ev('crash', now));
      expect(failed.state.nextReloadAt).toBe(now + delay);
      const fired = tickAt(failed.state, now + delay);
      expect(fired.actions).toEqual([{ type: 'reload' }]);
      now += delay;
      state = transition(fired.state, ev('load-started', now)).state;
    }
    const last = transition(state, ev('crash', now + 1));
    expect(last.state).toMatchObject({ status: 'down', nextReloadAt: null, message: GAVE_UP });
    expect(last.actions).toEqual([notify(GAVE_UP)]);

    const after = apply(last.state, [ev('crash', now + 2), ev('load-failed', now + 3), ev('hung', now + 4), probe(now + 5), ev('tick', now + 999_999)]);
    expect(after.actions).toEqual([]);
    expect(after.state).toEqual(last.state);
  });

  test('a second failure while a reload is pending does not burn another attempt', () => {
    const first = apply(connected(0), [ev('crash', 0)]);
    const second = apply(first.state, [ev('load-failed', 100), ev('crash', 200)]);
    expect(second.state).toMatchObject({ attempts: 1, nextReloadAt: 5000 });
  });

  test('a navigation while a reload is pending keeps the schedule', () => {
    const failed = apply(connected(0), [ev('load-failed', 0)]).state;
    const navigated = transition(failed, ev('load-started', 100)).state;
    expect(navigated).toMatchObject({ status: 'reloading', nextReloadAt: 5000 });
  });

  test('hung reloads, but recovered before the deadline cancels it', () => {
    const hung = apply(connected(0), [ev('hung', 0)]);
    expect(hung.state).toMatchObject({ status: 'reloading', hung: true, nextReloadAt: 5000, attempts: 1 });
    expect(transition(hung.state, ev('tick', 5000)).actions).toEqual([{ type: 'restart' }]);

    const recovered = apply(hung.state, [ev('recovered', 1000), ev('tick', 5000)]);
    expect(recovered.actions).toEqual([]);
    expect(recovered.state).toMatchObject({ status: 'loading', hung: false, nextReloadAt: null, attempts: 0 });
  });

  test('recovered without a hang changes nothing', () => {
    const state = connected(0);
    expect(transition(state, ev('recovered', 10)).state).toBe(state);
  });

  test('60s of probe silence reloads, after the 5s backoff', () => {
    const state = connected(0);
    expect(transition(state, ev('tick', 59_999)).actions).toEqual([]);
    const silent = transition(state, ev('tick', 60_000));
    expect(silent.state).toMatchObject({ status: 'reloading', attempts: 1, nextReloadAt: 65_000 });
    expect(transition(silent.state, ev('tick', 65_000)).actions).toEqual([{ type: 'restart' }]);
  });

  test('a healthy probe cancels a pending reload and gives the attempt back', () => {
    const silent = transition(connected(0), ev('tick', 60_000)).state;
    expect(silent.nextReloadAt).toBe(65_000);
    const back = transition(silent, probe(61_000));
    expect(back.state).toMatchObject({ status: 'connected', nextReloadAt: null, attempts: 0 });
    expect(transition(back.state, ev('tick', 65_000)).actions).toEqual([]);
  });

  test('a probe from a page without the game does not cancel a pending reload', () => {
    const failed = apply(connected(0), [ev('crash', 0)]).state;
    const errorPage = transition(failed, probe(1000, { gamePresent: false, gameVisible: false, hasSession: false, nick: null }));
    expect(errorPage.state).toMatchObject({ status: 'reloading', nextReloadAt: 5000, attempts: 1 });
  });

  test('resumed resets the probe clock and does not reload', () => {
    const woke = apply(connected(0), [ev('resumed', 7_200_000), ev('tick', 7_200_001)]);
    expect(woke.actions).toEqual([]);
    expect(woke.state.status).toBe('connected');
  });

  test('resumed also restarts the clock of a page that has no game', () => {
    const missing = apply(loading(0), [probe(1000, { gamePresent: false, gameVisible: false, hasSession: false, nick: null })]).state;
    expect(missing.gameMissingSince).toBe(1000);
    const woke = apply(missing, [ev('resumed', 7_200_000), ev('tick', 7_200_001)]);
    expect(woke.actions).toEqual([]);
    expect(woke.state.nextReloadAt).toBeNull();
  });

  test('WebSocket drop with a live page produces no action', () => {
    // The game reconnects by itself: the page stays alive and keeps answering probes for 10 minutes.
    const run = simulate(connected(0), 1000, 600_000);
    expect(run.reloads).toEqual([]);
    expect(run.notifications).toEqual([]);
    expect(run.state.status).toBe('connected');
  });

  test('page without the game for 30s reloads up to 3 times and stops at down', () => {
    // A Cloudflare error page: alive, answering probes, but there is never a game on it.
    const run = simulate(loading(0), 0, 1_000_000, () => ({ gamePresent: false, gameVisible: false, hasSession: false, nick: null }));
    expect(run.reloads).toHaveLength(3);
    expect(run.state.status).toBe('down');
    expect(run.notifications).toEqual([notify(GAVE_UP)]);
  });

  test('page without the game waits the 30s before the first reload is scheduled', () => {
    const missing = { gamePresent: false, gameVisible: false, hasSession: false, nick: null };
    const run = simulate(loading(0), 0, 29_000, () => missing);
    expect(run.state).toMatchObject({ status: 'loading', nextReloadAt: null });
    const next = simulate(run.state, 30_000, 30_000, () => missing);
    expect(next.state).toMatchObject({ status: 'reloading', nextReloadAt: 35_000 });
  });

  test('attempts reset after 60s connected', () => {
    const afterReload = apply(connected(0), [ev('crash', 0), ev('tick', 5000), ev('load-started', 5000)]).state;
    const early = simulate(afterReload, 6000, 65_000);
    expect(early.state).toMatchObject({ status: 'connected', attempts: 1 });
    const stable = simulate(early.state, 66_000, 66_000);
    expect(stable.state).toMatchObject({ status: 'connected', attempts: 0 });
  });

  test.each([
    ['login', () => apply(loading(0), [probe(1000, LOGIN_FORM)]).state],
    ['notice', () => apply(connected(0), [probe(1000, { notice: 'Rede cheia' })]).state],
    ['down', () => reachDown().state],
  ] as const)('%s never reloads on its own, however long the silence', (_status, build) => {
    const state = build();
    const run = simulate(state, 2000, 600_000, () => null);
    expect(run.reloads).toEqual([]);
    expect(run.notifications).toEqual([]);
    expect({ ...run.state, lastTickAt: state.lastTickAt }).toEqual(state);
  });

  test('hung while a reload is already pending only flags the hang', () => {
    const failed = apply(connected(0), [ev('load-failed', 0)]).state;
    const hung = transition(failed, ev('hung', 100)).state;
    expect(hung).toMatchObject({ hung: true, attempts: 1, nextReloadAt: 5000 });
  });
});

describe('retry and block', () => {
  test('retry from down reloads and resets attempts', () => {
    const down = reachDown();
    const retried = transition(down.state, ev('retry', down.at + 1000));
    expect(retried.actions).toEqual([{ type: 'restart' }]);
    expect(retried.state).toMatchObject({ status: 'loading', attempts: 0, message: null, nextReloadAt: null });
  });

  test('left-site parks the account as down, with the host in the message', () => {
    const left = transition(loading(0), leftSite('outro.com', 100));
    expect(left.state).toMatchObject({
      status: 'down',
      message: 'Esse jogo levou para outro.com. Crie o grupo com esse endereço.',
      attempts: 0,
      nextReloadAt: null,
      connectedSince: null,
    });
    expect(left.actions).toEqual([notify('Jogo levou para outro site', 'outro.com')]);
  });

  test('left-site cancels a reload that was waiting', () => {
    const waiting = apply(connected(0), [ev('crash', 0)]).state;
    expect(waiting.nextReloadAt).not.toBeNull();
    expect(transition(waiting, leftSite('outro.com', 100)).state).toMatchObject({ status: 'down', nextReloadAt: null });
  });

  test.each(['off', 'blocked', 'down'] as const)('left-site does nothing to a parked account (%s)', (status) => {
    const state: SupervisorState = { ...initialSupervisorState(), status, message: 'x' };
    expect(transition(state, leftSite('outro.com', 100))).toEqual({ state, actions: [] });
  });

  test('retry after left-site loads the page again', () => {
    const left = transition(loading(0), leftSite('outro.com', 100)).state;
    const retried = transition(left, ev('retry', 200));
    expect(retried.actions).toEqual([{ type: 'restart' }]);
    expect(retried.state).toMatchObject({ status: 'loading', attempts: 0, message: null });
  });

  test('a page that stopped answering is restarted, not reloaded in place', () => {
    const hung = transition(connected(0), ev('hung', 100)).state;
    expect(transition(hung, ev('tick', 5100)).actions).toEqual([{ type: 'restart' }]);
  });

  test('a page that went silent is restarted, because a reload would wait for it too', () => {
    const start = connected(0);
    const silent = transition(start, ev('tick', start.lastProbeAt + 60_000)).state;
    expect(silent.status).toBe('reloading');
    expect(transition(silent, ev('tick', silent.nextReloadAt ?? 0)).actions).toEqual([{ type: 'restart' }]);
  });

  test('a page that crashed only needs a load', () => {
    const crashed = transition(connected(0), ev('crash', 100)).state;
    expect(transition(crashed, ev('tick', 5100)).actions).toEqual([{ type: 'reload' }]);
  });

  test('a restart leaves no trace of the hang behind', () => {
    const hung = transition(connected(0), ev('hung', 100)).state;
    const fired = transition(hung, ev('tick', 5100)).state;
    expect(fired.hung).toBe(false);
    const again = transition(fired, ev('crash', 6000)).state;
    expect(tickAt(again, 21_000).actions).toEqual([{ type: 'reload' }]);
  });

  test('retry outside down does nothing', () => {
    const state = connected(0);
    expect(transition(state, ev('retry', 10))).toEqual({ state, actions: [] });
  });

  test('block absorbs probes and cancels reloads', () => {
    const crashed = apply(connected(0), [ev('crash', 0)]);
    const blocked = transition(crashed.state, ev('block', 100));
    expect(blocked.state).toMatchObject({ status: 'blocked', nextReloadAt: null, message: '5º nick bloqueado' });
    expect(blocked.actions).toEqual([notify('5º nick bloqueado')]);

    const after = apply(blocked.state, [ev('load-started', 200), probe(2000), ev('crash', 3000), ev('hung', 3500), ev('tick', 999_999)]);
    expect(after.actions).toEqual([]);
    expect(after.state).toEqual(blocked.state);
  });

  test('enable after block goes back to loading, which is how Voltar ao login works', () => {
    const blocked = transition(connected(0), ev('block', 100)).state;
    const back = transition(blocked, ev('enable', 5000));
    expect(back.state).toMatchObject({ status: 'loading', message: null, nextReloadAt: null });
  });

  test('block on an account that is off does nothing', () => {
    const off = initialSupervisorState();
    expect(transition(off, ev('block', 10))).toEqual({ state: off, actions: [] });
  });
});
