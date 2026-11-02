import { totalmem } from 'node:os';
import { join } from 'node:path';
import { app, ipcMain, session, WebContentsView } from 'electron';
import type { BaseWindow, BrowserWindow, IpcMainEvent, WebContents } from 'electron';
import {
  addAccount,
  partitionFor,
  registerNick,
  removeAccount,
  removeGame,
  renameAccount,
  suggestName,
} from '../core/accounts';
import { accountShortcut, canOpenExternal, decideNavigation, isScreenHidden, zoomForScreen } from '../core/policies';
import type { KeyPress } from '../core/policies';
import { initialSupervisorState, transition } from '../core/supervisor';
import { appendEvent, appendSample, totalUsage, usageForProcess } from '../core/usage';
import type { SupervisorAction, SupervisorEvent, SupervisorState } from '../core/supervisor';
import { gameFromStored } from '../games/catalog';
import { createGame } from '../games/new-game';
import { METRICS_INTERVAL_MS, OPEN_INTERVAL_MS } from '../shared/constants';
import { accountColor, groupColor, initialsOf } from '../shared/format';
import { CHANNELS } from '../shared/ipc';
import type { ManagerCommand, MeasuredScreen } from '../shared/ipc';
import { ProbeReadingSchema } from '../shared/schemas';
import type {
  AccountId,
  AccountStatus,
  AccountView,
  AppData,
  AppView,
  Game,
  GameId,
  GroupView,
  HistoryEvent,
  Layout,
  NewGameError,
  NewGameInput,
  ProbeReading,
  StoredAccount,
  UsageSample,
} from '../shared/types';
import { detachAccount } from './detach';
import { readProcessUsage } from './metrics';
import type { Repository } from './repository';

export interface AccountManagerDeps {
  window: BrowserWindow;
  repository: Repository;
  notify(title: string, body: string): void;
  openExternal(url: string): void;
  onChange(view: AppView): void;
}

interface Slot {
  accountId: AccountId;
  game: Game;
  view: WebContentsView | null;
  contentsId: number | null;
  supervisor: SupervisorState;
  host: string;
  lastInputAt: number | null;
  openTimer: NodeJS.Timeout | null;
  memoryMb: number[];
  cpu: number[];
  history: HistoryEvent[];
  detached: BaseWindow | null;
  pageLoaded: boolean;
  restarting: boolean;
}

const TICK_MS = 1000;
const BYTES_PER_MB = 1024 * 1024;
const ATTENTION_STATUSES: readonly AccountStatus[] = ['login', 'notice', 'down', 'blocked'];
const ALLOWED_PERMISSIONS: readonly string[] = ['clipboard-sanitized-write', 'fullscreen'];
const VIEW_BACKGROUND = '#0d111b';

// Failures of a load are reported by did-fail-load, so the promise of loadURL carries no extra news.
const load = (contents: WebContents, url: string): void => {
  contents.loadURL(url).catch(() => undefined);
};

export class AccountManager {
  private readonly deps: AccountManagerDeps;
  private readonly slots = new Map<AccountId, Slot>();
  private readonly slotBySender = new Map<number, Slot>();
  private readonly preparedPartitions = new Set<string>();
  private readonly ticker: NodeJS.Timeout;
  private readonly sampler: NodeJS.Timeout;
  private data: AppData;
  private screens = new Map<AccountId, MeasuredScreen>();
  private modalOpen = false;
  private nextOpenAt = 0;
  private nextEventId = 1;
  private totals: UsageSample = { memoryMb: 0, cpu: 0 };

  private readonly onProbeReading = (event: IpcMainEvent, raw: unknown): void => {
    const slot = this.slotBySender.get(event.sender.id);
    const reading = ProbeReadingSchema.safeParse(raw);
    if (slot !== undefined && reading.success) this.handleReading(slot, reading.data);
  };

  constructor(deps: AccountManagerDeps) {
    this.deps = deps;
    this.data = deps.repository.read();
    for (const account of this.data.accounts) this.createSlot(account);
    ipcMain.on(CHANNELS.probeReading, this.onProbeReading);
    this.ticker = setInterval(() => this.tick(), TICK_MS);
    this.sampler = setInterval(() => this.sample(), METRICS_INTERVAL_MS);
  }

  openEnabled(): void {
    for (const account of this.data.accounts) {
      const slot = this.slots.get(account.id);
      if (slot !== undefined && account.enabled) this.start(slot);
    }
  }

  execute(command: ManagerCommand): void {
    switch (command.type) {
      case 'select':
        this.select(command.accountId);
        return;
      case 'enable':
        this.setEnabled(command.accountId, true);
        return;
      case 'disable':
        this.setEnabled(command.accountId, false);
        return;
      case 'go-home':
        this.withPage(command.accountId, (contents, slot) => {
          load(contents, slot.game.startUrl);
          this.record(slot, 'Voltou ao início');
        });
        return;
      case 'reload':
        this.withPage(command.accountId, (contents, slot) => {
          contents.reload();
          this.record(slot, 'Recarregada');
        });
        return;
      case 'toggle-sound':
        this.toggleSound(command.accountId);
        return;
      case 'retry':
        this.feedAccount(command.accountId, 'retry');
        return;
      case 'back-to-login':
        this.backToLogin(command.accountId);
        return;
      case 'add-account':
        this.add(command.gameId, command.name);
        return;
      case 'rename-account': {
        const renamed = renameAccount(this.data, command.accountId, command.name);
        if (renamed.ok) this.commit(renamed.value);
        return;
      }
      case 'set-layout':
        this.setLayout(command.layout);
        return;
      case 'toggle-focus':
        this.toggleFocus(command.accountId);
        return;
      case 'leave-focus':
        this.leaveFocus();
        return;
      case 'toggle-sidebar':
        this.updatePreferences({ sidebarOpen: !this.data.preferences.sidebarOpen });
        return;
      case 'toggle-panel':
        this.updatePreferences({ panelOpen: !this.data.preferences.panelOpen });
        return;
      case 'screens':
        this.screens = new Map(command.screens.map((screen) => [screen.accountId, screen]));
        this.applyScreens();
        return;
      case 'detach':
        this.detach(command.accountId);
        return;
      case 'reattach':
        this.slots.get(command.accountId)?.detached?.close();
        return;
      case 'set-notifications':
        this.updatePreferences({ notifications: command.enabled });
        return;
      case 'set-modal-open':
        this.setModalOpen(command.open);
        return;
      default: {
        const _exhaustive: never = command;
        throw new Error(`Unknown command ${String(_exhaustive)}`);
      }
    }
  }

  // Returns what is wrong with the input, for the form to show, or null once the group exists.
  createGame(input: NewGameInput): NewGameError | null {
    const result = createGame(this.data, input);
    if (!result.ok) return result.error;
    this.commit(result.data);
    this.startNewAccount(result.account, `Grupo ${result.game.name} criado`);
    return null;
  }

  enableAll(game: GameId): void {
    for (const account of this.data.accounts) if (account.gameId === game) this.setEnabled(account.id, true);
  }

  disableAll(game: GameId): void {
    for (const account of this.data.accounts) if (account.gameId === game) this.setEnabled(account.id, false);
  }

  view(): AppView {
    const accounts = this.accountViews();
    const games = this.data.games.map(gameFromStored);
    const uncolored = games.filter((game) => game.dot === null);
    const groups = games.map((game) => this.groupView(game, accounts, game.dot ?? groupColor(uncolored.indexOf(game))));
    return {
      groups,
      accounts,
      preferences: this.data.preferences,
      totalMemoryMb: this.totals.memoryMb,
      totalCpu: this.totals.cpu,
      ramFraction: Math.min(1, this.totals.memoryMb / (totalmem() / BYTES_PER_MB)),
      attentionCount: accounts.filter((account) => ATTENTION_STATUSES.includes(account.status)).length,
      version: app.getVersion(),
      now: Date.now(),
    };
  }

  async removeAccount(id: AccountId): Promise<void> {
    if (!(await this.dropSlot(id))) return;
    this.commit(removeAccount(this.data, id));
  }

  // Every account of the game goes, and so do their logins. One commit at the end, after all of them: the
  // data never lists a game whose accounts are half gone.
  async removeGame(id: GameId): Promise<void> {
    const members = this.data.accounts.filter((account) => account.gameId === id);
    await Promise.all(members.map((account) => this.dropSlot(account.id)));
    this.commit(removeGame(this.data, id));
  }

  // Closes the account's page and window and wipes its partition. False when it was not running here.
  private async dropSlot(id: AccountId): Promise<boolean> {
    const slot = this.slots.get(id);
    if (slot === undefined) return false;
    this.stop(slot);
    this.slots.delete(id);
    const partition = session.fromPartition(partitionFor(slot.game.id, id));
    await partition.clearStorageData();
    await partition.clearCache();
    return true;
  }

  onResume(): void {
    for (const slot of this.slots.values()) this.feed(slot, { type: 'resumed', now: Date.now() });
  }

  anyConnected(): boolean {
    return [...this.slots.values()].some((slot) => slot.supervisor.status === 'connected');
  }

  leaveFocus(): void {
    if (this.data.preferences.layout === 'focus') this.setLayout('grid');
  }

  // For the Esc key of a game page: only a page of an account may ask.
  leaveFocusFrom(sender: WebContents): void {
    if (this.slotBySender.has(sender.id)) this.leaveFocus();
  }

  // Returns whether the key was used, so the caller keeps it from reaching the page.
  handleShortcut(input: KeyPress): boolean {
    const position = accountShortcut(input);
    if (position === null || this.modalOpen) return false;
    const target = this.activeAccounts()[position - 1];
    if (target === undefined) return false;
    this.select(target.id);
    return true;
  }

  webContentsOf(id: AccountId): WebContents | null {
    return this.slots.get(id)?.view?.webContents ?? null;
  }

  dispose(): void {
    clearInterval(this.ticker);
    clearInterval(this.sampler);
    ipcMain.off(CHANNELS.probeReading, this.onProbeReading);
    for (const slot of this.slots.values()) this.stop(slot);
  }

  private createSlot(account: StoredAccount): Slot | null {
    const game = this.gameOf(account.gameId);
    if (game === undefined) return null;
    const slot: Slot = {
      accountId: account.id,
      game,
      view: null,
      contentsId: null,
      supervisor: initialSupervisorState(),
      host: new URL(game.startUrl).hostname,
      lastInputAt: null,
      openTimer: null,
      memoryMb: [],
      cpu: [],
      history: [],
      detached: null,
      pageLoaded: false,
      restarting: false,
    };
    this.slots.set(account.id, slot);
    return slot;
  }

  // Accounts open one at a time, OPEN_INTERVAL_MS apart, whoever asked for them.
  private start(slot: Slot): void {
    const now = Date.now();
    const openAt = Math.max(now, this.nextOpenAt);
    this.nextOpenAt = openAt + OPEN_INTERVAL_MS;
    // The account's clock starts at its turn: a long queue must not read as a page that went silent.
    this.feed(slot, { type: 'enable', now: openAt });
    slot.openTimer = setTimeout(() => {
      slot.openTimer = null;
      this.open(slot);
    }, openAt - now);
  }

  private stop(slot: Slot): void {
    if (slot.openTimer !== null) clearTimeout(slot.openTimer);
    slot.openTimer = null;
    slot.memoryMb = [];
    slot.cpu = [];
    const view = slot.view;
    if (view !== null) {
      slot.view = null;
      if (slot.contentsId !== null) this.slotBySender.delete(slot.contentsId);
      const detached = slot.detached;
      slot.detached = null;
      if (detached !== null) {
        // The account is going away: its window must not hand the view back to the main window.
        detached.removeAllListeners('close');
        detached.contentView.removeChildView(view);
        detached.close();
      } else if (!this.deps.window.isDestroyed()) {
        this.deps.window.contentView.removeChildView(view);
      }
      const contents = view.webContents as WebContents | undefined;
      if (contents !== undefined && !contents.isDestroyed()) contents.close();
    }
  }

  private open(slot: Slot): void {
    const account = this.stored(slot.accountId);
    if (account === undefined) return;
    const partition = partitionFor(slot.game.id, slot.accountId);
    this.prepareSession(partition);
    const view = new WebContentsView({
      webPreferences: {
        partition,
        preload: join(__dirname, 'probe.js'),
        additionalArguments: [`--idlemanager-game=${slot.game.id}`],
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    });
    view.setBackgroundColor(VIEW_BACKGROUND);
    slot.view = view;
    slot.contentsId = view.webContents.id;
    this.slotBySender.set(view.webContents.id, slot);
    view.webContents.setAudioMuted(account.muted);
    this.watchPage(slot, view);
    this.deps.window.contentView.addChildView(view);
    this.applyScreens();
    load(view.webContents, slot.game.startUrl);
  }

  private prepareSession(partition: string): void {
    if (this.preparedPartitions.has(partition)) return;
    this.preparedPartitions.add(partition);
    const accountSession = session.fromPartition(partition);
    accountSession.on('will-download', (event, _item, contents) => {
      event.preventDefault();
      // A download can outlive the page that started it.
      const slot = this.slotBySender.get(contents?.id);
      if (slot !== undefined) this.record(slot, 'Download bloqueado');
    });
    accountSession.setPermissionRequestHandler((_contents, permission, callback) => {
      callback(ALLOWED_PERMISSIONS.includes(permission));
    });
    // Requests are only half of it: without this, a page asking what it may do hears "granted" for everything.
    accountSession.setPermissionCheckHandler((_contents, permission) => ALLOWED_PERMISSIONS.includes(permission));
  }

  private watchPage(slot: Slot, view: WebContentsView): void {
    const contents = view.webContents;
    const report = (type: Exclude<SupervisorEvent['type'], 'probe' | 'left-site'>): void => {
      if (slot.view?.webContents === contents) this.feed(slot, { type, now: Date.now() });
    };
    const noteInput = (): void => {
      slot.lastInputAt = Date.now();
    };

    contents.on('render-process-gone', () => {
      if (!slot.restarting) {
        report('crash');
        return;
      }
      slot.restarting = false;
      load(contents, slot.game.startUrl);
    });
    contents.once('destroyed', () => this.forgetClosedPage(slot, view));
    // A page must not be able to refuse a reload, a return to the start or being closed by a block.
    contents.on('will-prevent-unload', (event) => event.preventDefault());
    contents.on('unresponsive', () => report('hung'));
    contents.on('responsive', () => report('recovered'));
    contents.on('did-fail-load', (_event, code, _description, _url, isMainFrame) => {
      if (isMainFrame && code !== -3) report('load-failed');
    });
    contents.on('did-start-navigation', (details) => {
      if (!details.isMainFrame || details.isSameDocument) return;
      // A load the app started (open, reload, back to the start) has no initiator. A navigation the page
      // asked for does, and it must not make a page that already loaded look new: its start event comes
      // before will-navigate, where the exit is judged.
      if (details.initiator == null) slot.pageLoaded = false;
      report('load-started');
    });
    contents.on('did-finish-load', () => {
      slot.pageLoaded = true;
    });
    contents.on('did-navigate', (_event, url) => {
      slot.host = URL.canParse(url) ? new URL(url).hostname : slot.host;
    });
    contents.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown') noteInput();
      if (this.handleShortcut(input)) event.preventDefault();
    });
    // Selection follows the click, not the focus event: a view also gets focus when it opens.
    contents.on('before-mouse-event', (_event, mouse) => {
      if (mouse.type !== 'mouseDown') return;
      noteInput();
      this.select(slot.accountId);
    });

    // A new window cannot exist inside an account: at most the link opens in the default browser.
    contents.setWindowOpenHandler(({ url }) => {
      this.leaveToBrowser(slot, url);
      return { action: 'deny' };
    });
    const keepInside = (event: { url: string; isMainFrame: boolean; preventDefault(): void }): void => {
      const decision = this.decide(slot, event.url);
      if (!event.isMainFrame || decision === 'inside') return;
      event.preventDefault();
      if (this.leaveToBrowser(slot, event.url) || decision !== 'external' || slot.game.readsSession) return;
      this.noteBlockedExit(slot, event.url);
    };
    contents.on('will-navigate', keepInside);
    contents.on('will-redirect', keepInside);
  }

  // A page can close itself with window.close(), which leaves the view without contents. To the account it
  // is the same as a crash, so the same path reopens it. stop() lets go of the view first, and ends here.
  private forgetClosedPage(slot: Slot, view: WebContentsView): void {
    if (slot.view !== view) return;
    slot.view = null;
    if (slot.contentsId !== null) this.slotBySender.delete(slot.contentsId);
    if (slot.detached !== null) slot.detached.close();
    else if (!this.deps.window.isDestroyed()) this.deps.window.contentView.removeChildView(view);
    this.feed(slot, { type: 'crash', now: Date.now() });
  }

  private decide(slot: Slot, url: string): ReturnType<typeof decideNavigation> {
    return decideNavigation(url, slot.game.hosts, slot.game.allowHttp, slot.game.domain);
  }

  // One click opens one link: the input is spent here, so a page cannot open several from a single click.
  // Returns whether the link was opened.
  private leaveToBrowser(slot: Slot, url: string): boolean {
    if (this.decide(slot, url) === 'block' || !canOpenExternal(slot.lastInputAt, Date.now())) return false;
    slot.lastInputAt = null;
    this.deps.openExternal(url);
    return true;
  }

  // A game the app cannot read has no login screen to explain a blank page: if its first page is sent to
  // another site the account says so, and a page that already loaded keeps running with a note.
  private noteBlockedExit(slot: Slot, url: string): void {
    const host = URL.canParse(url) ? new URL(url).hostname : url;
    if (slot.pageLoaded) this.record(slot, `Saída para ${host} bloqueada`);
    else this.feed(slot, { type: 'left-site', host, now: Date.now() });
  }

  private handleReading(slot: Slot, reading: ProbeReading): void {
    if (reading.hasSession && reading.nick !== null) {
      const result = registerNick(this.data, slot.game, slot.accountId, reading.nick);
      if (!result.accepted) {
        if (slot.supervisor.status !== 'blocked') this.block(slot);
        return;
      }
      if (result.data !== this.data) this.commit(result.data);
    }
    this.feed(slot, { type: 'probe', reading, now: Date.now() });
  }

  private block(slot: Slot): void {
    const contents = slot.view?.webContents;
    this.feed(slot, { type: 'block', now: Date.now() });
    if (contents === undefined) return;
    const sessionKey = slot.game.sessionKey;
    const signOut = sessionKey === null ? '' : `localStorage.removeItem(${JSON.stringify(sessionKey)});`;
    contents
      .executeJavaScript(signOut)
      .catch(() => undefined)
      .finally(() => {
        if (!contents.isDestroyed()) load(contents, 'about:blank');
      });
  }

  private backToLogin(id: AccountId): void {
    const slot = this.slots.get(id);
    if (slot === undefined || slot.supervisor.status !== 'blocked') return;
    this.feed(slot, { type: 'enable', now: Date.now() });
    if (slot.view === null) this.open(slot);
    else load(slot.view.webContents, slot.game.startUrl);
  }

  private tick(): void {
    const now = Date.now();
    for (const slot of this.slots.values()) this.feed(slot, { type: 'tick', now });
  }

  private feedAccount(id: AccountId, type: Exclude<SupervisorEvent['type'], 'probe' | 'left-site'>): void {
    const slot = this.slots.get(id);
    if (slot !== undefined) this.feed(slot, { type, now: Date.now() });
  }

  private feed(slot: Slot, event: SupervisorEvent): void {
    const previous = slot.supervisor;
    const { state, actions } = transition(previous, event);
    slot.supervisor = state;
    for (const action of actions) this.perform(slot, action);
    const visible =
      state.status !== previous.status ||
      state.message !== previous.message ||
      state.attempts !== previous.attempts ||
      state.enabledSince !== previous.enabledSince;
    if (!visible) return;
    // A hidden status (down, blocked) has an action on the main window's screen: bring the account back to it.
    if (slot.detached !== null && isScreenHidden({ status: state.status, detached: false })) slot.detached.close();
    this.applyScreens();
    this.publish();
  }

  private perform(slot: Slot, action: SupervisorAction): void {
    switch (action.type) {
      case 'reload':
        // The start URL, not reload(): a page that lost the game may be sitting on another address.
        if (slot.view === null) this.open(slot);
        else load(slot.view.webContents, slot.game.startUrl);
        return;
      case 'restart':
        this.restartPage(slot);
        return;
      case 'notify': {
        if (!this.data.preferences.notifications) return;
        const name = this.stored(slot.accountId)?.name ?? '';
        this.deps.notify(action.title, action.body === '' ? name : `${name} · ${action.body}`);
        return;
      }
      default: {
        const _exhaustive: never = action;
        throw new Error(`Unknown action ${String(_exhaustive)}`);
      }
    }
  }

  // The renderer is killed first, so the page does not need to answer, and the load waits for the news that
  // it is gone: a load sent earlier would die with it. That crash is not a new failure, because the attempt
  // was already counted.
  private restartPage(slot: Slot): void {
    if (slot.view === null) {
      this.open(slot);
      return;
    }
    const contents = slot.view.webContents;
    if (contents.isCrashed()) {
      load(contents, slot.game.startUrl);
      return;
    }
    slot.restarting = true;
    contents.forcefullyCrashRenderer();
  }

  private setEnabled(id: AccountId, enabled: boolean): void {
    const slot = this.slots.get(id);
    const account = this.stored(id);
    if (slot === undefined || account === undefined || account.enabled === enabled) return;
    this.commit(this.withAccount(id, { enabled }));
    if (enabled) {
      this.record(slot, 'Ligada');
      this.start(slot);
    } else {
      this.record(slot, 'Desligada');
      this.stop(slot);
      this.feed(slot, { type: 'disable', now: Date.now() });
    }
  }

  private toggleSound(id: AccountId): void {
    const account = this.stored(id);
    if (account === undefined) return;
    const muted = !account.muted;
    this.commit(this.withAccount(id, { muted }));
    this.webContentsOf(id)?.setAudioMuted(muted);
    const slot = this.slots.get(id);
    if (slot !== undefined) this.record(slot, muted ? 'Som desligado' : 'Som ligado');
  }

  private add(gameId: Game['id'], name: string): void {
    const game = this.gameOf(gameId);
    if (game === undefined) return;
    const result = addAccount(this.data, game, name);
    if (!result.ok) return;
    this.commit(result.value.data);
    this.startNewAccount(result.value.account, 'Conta adicionada');
  }

  // The new account comes to the front, next to the other screens of its group.
  private startNewAccount(account: StoredAccount, text: string): void {
    const slot = this.createSlot(account);
    if (slot === null) return;
    this.record(slot, text);
    this.select(account.id);
    this.leaveFocus();
    this.start(slot);
  }

  private detach(id: AccountId): void {
    const slot = this.slots.get(id);
    const view = slot?.view;
    if (slot === undefined || view == null || slot.detached !== null) return;
    if (isScreenHidden({ status: slot.supervisor.status, detached: false })) return;
    const name = this.stored(id)?.name ?? id;
    this.deps.window.contentView.removeChildView(view);
    slot.detached = detachAccount(view, `${name} · ${slot.game.name}`, () => this.takeBack(slot));
    this.record(slot, 'Destacada em janela');
    this.applyScreens();
  }

  // Runs from the detached window's own close event, while that window is still alive.
  private takeBack(slot: Slot): void {
    slot.detached = null;
    if (slot.view !== null && !this.deps.window.isDestroyed()) this.deps.window.contentView.addChildView(slot.view);
    this.record(slot, 'Trazida de volta');
    this.applyScreens();
  }

  // A modal is HTML, and every view sits above HTML: the views step aside while it is open. They keep
  // running, because they are hidden, not closed. The keyboard may be inside one of them, so it moves too.
  private setModalOpen(open: boolean): void {
    this.modalOpen = open;
    this.applyScreens();
    if (open) this.deps.window.webContents.focus();
  }

  private select(id: AccountId): void {
    if (this.data.preferences.selectedId !== id && this.slots.has(id)) this.updatePreferences({ selectedId: id });
  }

  private setLayout(layout: Layout): void {
    if (this.data.preferences.layout !== layout) this.updatePreferences({ layout });
  }

  private toggleFocus(id: AccountId): void {
    const inFocus = this.data.preferences.layout === 'focus';
    this.updatePreferences(inFocus ? { layout: 'grid' } : { layout: 'focus', selectedId: id });
  }

  private updatePreferences(changes: Partial<AppData['preferences']>): void {
    this.commit({ ...this.data, preferences: { ...this.data.preferences, ...changes } });
  }

  private withAccount(id: AccountId, changes: Partial<StoredAccount>): AppData {
    const accounts = this.data.accounts.map((account) => (account.id === id ? { ...account, ...changes } : account));
    return { ...this.data, accounts };
  }

  private withPage(id: AccountId, action: (contents: WebContents, slot: Slot) => void): void {
    const slot = this.slots.get(id);
    if (slot?.view != null) action(slot.view.webContents, slot);
  }

  private commit(data: AppData): void {
    this.data = data;
    this.deps.repository.write(data);
    this.applyScreens();
    this.publish();
  }

  private record(slot: Slot, text: string): void {
    const event: HistoryEvent = { id: this.nextEventId, accountId: slot.accountId, text, at: Date.now() };
    this.nextEventId += 1;
    slot.history = appendEvent(slot.history, event);
    this.publish();
  }

  // One sample per enabled account: its own renderer process. The totals cover every process of the app.
  private sample(): void {
    const usage = readProcessUsage();
    this.totals = totalUsage(usage);
    for (const slot of this.slots.values()) {
      const contents = slot.view?.webContents;
      if (contents === undefined || contents.isDestroyed()) continue;
      const own = usageForProcess(usage, contents.getOSProcessId());
      if (own === null) continue;
      slot.memoryMb = appendSample(slot.memoryMb, own.memoryMb);
      slot.cpu = appendSample(slot.cpu, own.cpu);
    }
    this.publish();
  }

  private publish(): void {
    this.deps.onChange(this.view());
  }

  // The accounts on screen: those of the selected account's game.
  private activeAccounts(): StoredAccount[] {
    const selectedId = this.data.preferences.selectedId;
    const game = (selectedId === null ? undefined : this.stored(selectedId))?.gameId ?? this.data.games[0]?.id;
    return this.data.accounts.filter((account) => account.gameId === game && this.slots.has(account.id));
  }

  private gameOf(id: GameId): Game | undefined {
    const stored = this.data.games.find((game) => game.id === id);
    return stored === undefined ? undefined : gameFromStored(stored);
  }

  private stored(id: AccountId): StoredAccount | undefined {
    return this.data.accounts.find((account) => account.id === id);
  }

  private applyScreens(): void {
    for (const slot of this.slots.values()) {
      const view = slot.view;
      if (view === null || slot.detached !== null) continue;
      // One bad view must not stop the others from being placed.
      const contents = view.webContents as WebContents | undefined;
      if (contents === undefined || contents.isDestroyed()) continue;
      const screen = this.screens.get(slot.accountId);
      const hidden = isScreenHidden({ status: slot.supervisor.status, detached: false });
      view.setVisible(screen !== undefined && !hidden && !this.modalOpen);
      if (screen === undefined) continue;
      view.setBounds(screen.rect);
      contents.setZoomFactor(zoomForScreen(this.data.preferences.layout, screen.rect.height));
    }
  }

  private accountViews(): AccountView[] {
    const views: AccountView[] = [];
    for (const account of this.data.accounts) {
      const slot = this.slots.get(account.id);
      if (slot === undefined) continue;
      const position = this.data.accounts.filter((other) => other.gameId === account.gameId).indexOf(account);
      views.push({
        id: account.id,
        gameId: account.gameId,
        name: account.name,
        initials: initialsOf(account.name),
        color: accountColor(position),
        status: slot.supervisor.status,
        message: slot.supervisor.message,
        attempts: slot.supervisor.attempts,
        enabledSince: slot.supervisor.enabledSince,
        muted: account.muted,
        detached: slot.detached !== null,
        host: slot.host,
        partition: partitionFor(account.gameId, account.id),
        readsSession: slot.game.readsSession,
        memoryMb: slot.memoryMb,
        cpu: slot.cpu,
        history: slot.history,
      });
    }
    return views;
  }

  private groupView(game: Game, accounts: readonly AccountView[], dot: string): GroupView {
    const members = accounts.filter((account) => account.gameId === game.id);
    return {
      gameId: game.id,
      name: game.name,
      host: new URL(game.startUrl).hostname,
      dot,
      limit: game.accountLimit,
      suggestedName: suggestName(this.data, game),
      accountIds: members.map((account) => account.id),
      enabledCount: members.filter((account) => account.status !== 'off').length,
      memoryMb: members.reduce((sum, account) => sum + (account.memoryMb.at(-1) ?? 0), 0),
    };
  }
}
