import { totalmem } from 'node:os';
import { join } from 'node:path';
import { app, ipcMain, session, WebContentsView } from 'electron';
import type { BrowserWindow, IpcMainEvent, WebContents } from 'electron';
import { addAccount, registerNick, removeAccount, renameAccount } from '../core/accounts';
import { canOpenExternal, decideNavigation, isScreenHidden, zoomForScreen } from '../core/policies';
import { initialSupervisorState, transition } from '../core/supervisor';
import { appendEvent, appendSample, totalUsage, usageForProcess } from '../core/usage';
import type { SupervisorAction, SupervisorEvent, SupervisorState } from '../core/supervisor';
import { partitionFor } from '../games/catalog';
import { METRICS_INTERVAL_MS, OPEN_INTERVAL_MS } from '../shared/constants';
import { accountColor, initialsOf } from '../shared/format';
import { CHANNELS } from '../shared/ipc';
import type { Command, MeasuredScreen } from '../shared/ipc';
import { ProbeReadingSchema } from '../shared/schemas';
import type {
  AccountId,
  AccountStatus,
  AccountView,
  AppData,
  AppView,
  Game,
  GroupView,
  HistoryEvent,
  Layout,
  ProbeReading,
  StoredAccount,
  UsageSample,
} from '../shared/types';
import { readProcessUsage } from './metrics';
import type { Repository } from './repository';

export interface AccountManagerDeps {
  window: BrowserWindow;
  repository: Repository;
  games: readonly Game[];
  notify(title: string, body: string): void;
  openExternal(url: string): void;
  onChange(view: AppView): void;
}

interface Slot {
  accountId: AccountId;
  game: Game;
  view: WebContentsView | null;
  supervisor: SupervisorState;
  host: string;
  lastInputAt: number | null;
  openTimer: NodeJS.Timeout | null;
  memoryMb: number[];
  cpu: number[];
  history: HistoryEvent[];
}

const TICK_MS = 1000;
const BYTES_PER_MB = 1024 * 1024;
const ATTENTION_STATUSES: readonly AccountStatus[] = ['login', 'notice', 'down', 'blocked'];
const ALLOWED_PERMISSIONS: readonly string[] = ['clipboard-sanitized-write', 'fullscreen'];

// Failures of a load are reported by did-fail-load, so the promise of loadURL carries no extra news.
const load = (contents: WebContents, url: string): void => {
  contents.loadURL(url).catch(() => undefined);
};

export class AccountManager {
  private readonly deps: AccountManagerDeps;
  private readonly allowHttp = Boolean(process.env.IDLEMANAGER_GAME_URL);
  private readonly slots = new Map<AccountId, Slot>();
  private readonly slotBySender = new Map<number, Slot>();
  private readonly preparedPartitions = new Set<string>();
  private readonly ticker: NodeJS.Timeout;
  private readonly sampler: NodeJS.Timeout;
  private data: AppData;
  private screens = new Map<AccountId, MeasuredScreen>();
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

  execute(command: Command): void {
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
      case 'toggle-sidebar':
        this.updatePreferences({ sidebarOpen: !this.data.preferences.sidebarOpen });
        return;
      case 'screens':
        this.screens = new Map(command.screens.map((screen) => [screen.accountId, screen]));
        this.applyScreens();
        return;
      case 'detach':
      case 'reattach':
        throw new Error(`Command ${command.type} arrives in Task 11`);
      case 'open-account-menu':
      case 'open-group-menu':
      case 'open-data-folder':
      case 'set-notifications':
        throw new Error(`Command ${command.type} arrives in Task 10`);
      default: {
        const _exhaustive: never = command;
        throw new Error(`Unknown command ${String(_exhaustive)}`);
      }
    }
  }

  view(): AppView {
    const accounts = this.accountViews();
    const groups = this.deps.games.map((game) => this.groupView(game, accounts));
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
    const slot = this.slots.get(id);
    if (slot === undefined) return;
    this.stop(slot);
    this.slots.delete(id);
    const partition = session.fromPartition(partitionFor(slot.game.id, id));
    await partition.clearStorageData();
    await partition.clearCache();
    this.commit(removeAccount(this.data, id));
  }

  onResume(): void {
    for (const slot of this.slots.values()) this.feed(slot, { type: 'resumed', now: Date.now() });
  }

  anyConnected(): boolean {
    return [...this.slots.values()].some((slot) => slot.supervisor.status === 'connected');
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
    const game = this.deps.games.find((candidate) => candidate.id === account.gameId);
    if (game === undefined) return null;
    const slot: Slot = {
      accountId: account.id,
      game,
      view: null,
      supervisor: initialSupervisorState(),
      host: new URL(game.startUrl).hostname,
      lastInputAt: null,
      openTimer: null,
      memoryMb: [],
      cpu: [],
      history: [],
    };
    this.slots.set(account.id, slot);
    return slot;
  }

  // Accounts open one at a time, OPEN_INTERVAL_MS apart, whoever asked for them.
  private start(slot: Slot): void {
    this.feed(slot, { type: 'enable', now: Date.now() });
    const now = Date.now();
    const openAt = Math.max(now, this.nextOpenAt);
    this.nextOpenAt = openAt + OPEN_INTERVAL_MS;
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
      this.slotBySender.delete(view.webContents.id);
      this.deps.window.contentView.removeChildView(view);
      if (!view.webContents.isDestroyed()) view.webContents.close();
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
    slot.view = view;
    this.slotBySender.set(view.webContents.id, slot);
    view.webContents.setAudioMuted(account.muted);
    this.watchPage(slot, view.webContents);
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
      const slot = this.slotBySender.get(contents.id);
      if (slot !== undefined) this.record(slot, 'Download bloqueado');
    });
    accountSession.setPermissionRequestHandler((_contents, permission, callback) => {
      callback(ALLOWED_PERMISSIONS.includes(permission));
    });
  }

  private watchPage(slot: Slot, contents: WebContents): void {
    const report = (type: Exclude<SupervisorEvent['type'], 'probe'>): void => {
      if (slot.view?.webContents === contents) this.feed(slot, { type, now: Date.now() });
    };
    const noteInput = (): void => {
      slot.lastInputAt = Date.now();
    };

    contents.on('render-process-gone', () => report('crash'));
    contents.on('unresponsive', () => report('hung'));
    contents.on('responsive', () => report('recovered'));
    contents.on('did-fail-load', (_event, code, _description, _url, isMainFrame) => {
      if (isMainFrame && code !== -3) report('load-failed');
    });
    contents.on('did-start-navigation', (details) => {
      if (details.isMainFrame && !details.isSameDocument) report('load-started');
    });
    contents.on('did-navigate', (_event, url) => {
      slot.host = URL.canParse(url) ? new URL(url).hostname : slot.host;
    });
    contents.on('before-input-event', (_event, input) => {
      if (input.type === 'keyDown') noteInput();
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
      if (!event.isMainFrame || this.decide(slot, event.url) === 'inside') return;
      event.preventDefault();
      this.leaveToBrowser(slot, event.url);
    };
    contents.on('will-navigate', keepInside);
    contents.on('will-redirect', keepInside);
  }

  private decide(slot: Slot, url: string): ReturnType<typeof decideNavigation> {
    return decideNavigation(url, slot.game.hosts, this.allowHttp);
  }

  // One click opens one link: the input is spent here, so a page cannot open several from a single click.
  private leaveToBrowser(slot: Slot, url: string): void {
    if (this.decide(slot, url) === 'block' || !canOpenExternal(slot.lastInputAt, Date.now())) return;
    slot.lastInputAt = null;
    this.deps.openExternal(url);
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

  private feedAccount(id: AccountId, type: Exclude<SupervisorEvent['type'], 'probe'>): void {
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
    const game = this.deps.games.find((candidate) => candidate.id === gameId);
    if (game === undefined) return;
    const result = addAccount(this.data, game, name);
    if (!result.ok) return;
    this.commit(result.value.data);
    const slot = this.createSlot(result.value.account);
    if (slot !== null) {
      this.record(slot, 'Ligada');
      this.start(slot);
    }
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

  private stored(id: AccountId): StoredAccount | undefined {
    return this.data.accounts.find((account) => account.id === id);
  }

  private applyScreens(): void {
    for (const slot of this.slots.values()) {
      const view = slot.view;
      if (view === null) continue;
      const screen = this.screens.get(slot.accountId);
      const hidden = isScreenHidden({ status: slot.supervisor.status, detached: false });
      view.setVisible(screen !== undefined && !hidden);
      if (screen === undefined) continue;
      view.setBounds(screen.rect);
      view.webContents.setZoomFactor(zoomForScreen(this.data.preferences.layout, screen.rect.height));
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
        detached: false,
        host: slot.host,
        partition: partitionFor(account.gameId, account.id),
        memoryMb: slot.memoryMb,
        cpu: slot.cpu,
        history: slot.history,
      });
    }
    return views;
  }

  private groupView(game: Game, accounts: readonly AccountView[]): GroupView {
    const members = accounts.filter((account) => account.gameId === game.id);
    return {
      gameId: game.id,
      name: game.name,
      limit: game.accountLimit,
      accountIds: members.map((account) => account.id),
      enabledCount: members.filter((account) => account.status !== 'off').length,
      memoryMb: members.reduce((sum, account) => sum + (account.memoryMb.at(-1) ?? 0), 0),
    };
  }
}
