import { app, ipcMain, shell } from 'electron';
import type { BrowserWindow } from 'electron';
import { CHANNELS } from '../shared/ipc';
import type { Command } from '../shared/ipc';
import type { AccountManager } from './account-manager';
import { openAccountMenu, openGroupMenu } from './menus';

function run(manager: AccountManager, window: BrowserWindow, command: Command): void {
  switch (command.type) {
    case 'open-account-menu':
      openAccountMenu(manager, window, command.accountId);
      return;
    case 'open-group-menu':
      openGroupMenu(manager, window, command.gameId);
      return;
    case 'open-data-folder':
      void shell.openPath(app.getPath('userData'));
      return;
    default:
      manager.execute(command);
  }
}

export function registerIpc(manager: AccountManager, window: BrowserWindow): void {
  ipcMain.handle(CHANNELS.requestView, () => manager.view());
  ipcMain.on(CHANNELS.command, (_event, command: Command) => {
    // One bad command must not become an uncaught exception that takes the main process down.
    try {
      run(manager, window, command);
    } catch (error) {
      console.error(`Command ${command.type} failed`, error);
    }
  });
  ipcMain.on(CHANNELS.probeEscape, () => manager.leaveFocus());
  window.webContents.on('before-input-event', (event, input) => {
    if (manager.handleShortcut(input)) event.preventDefault();
  });
}
