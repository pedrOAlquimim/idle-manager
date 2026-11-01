export interface SuspensionBlocker {
  start(type: 'prevent-app-suspension'): number;
  stop(id: number): void;
}

// Keeps the computer from suspending while at least one account is connected: a suspended PC drops every
// game connection. The monitor may turn off and the session may lock; only the suspension is blocked.
export class PowerGuard {
  private readonly blocker: SuspensionBlocker;
  private blockId: number | null = null;

  constructor(blocker: SuspensionBlocker) {
    this.blocker = blocker;
  }

  get active(): boolean {
    return this.blockId !== null;
  }

  update(anyConnected: boolean): void {
    if (anyConnected && this.blockId === null) {
      this.blockId = this.blocker.start('prevent-app-suspension');
    } else if (!anyConnected && this.blockId !== null) {
      this.blocker.stop(this.blockId);
      this.blockId = null;
    }
  }

  dispose(): void {
    this.update(false);
  }
}
