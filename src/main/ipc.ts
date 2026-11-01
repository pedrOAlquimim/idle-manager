import { ipcMain } from 'electron';
import type { BrowserWindow } from 'electron';
import { CHANNELS } from '../shared/ipc';
import type { Command } from '../shared/ipc';
import type { AccountManager } from './account-manager';

export function registerIpc(manager: AccountManager, window: BrowserWindow): void {
  ipcMain.handle(CHANNELS.requestView, () => manager.view());
  ipcMain.on(CHANNELS.command, (_event, command: Command) => manager.execute(command));
  ipcMain.on(CHANNELS.probeEscape, () => manager.leaveFocus());
  window.webContents.on('before-input-event', (event, input) => {
    if (manager.handleShortcut(input)) event.preventDefault();
  });
}
