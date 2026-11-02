import { app, ipcMain, shell } from 'electron';
import type { BrowserWindow, IpcMainEvent, IpcMainInvokeEvent } from 'electron';
import { CHANNELS } from '../shared/ipc';
import type { Command } from '../shared/ipc';
import type { NewGameInput } from '../shared/types';
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
  // The pages of the games run arbitrary sites. If one of them ever breaks out of its renderer, these
  // channels are what it would reach for, so they answer only the interface.
  const fromInterface = (event: IpcMainEvent | IpcMainInvokeEvent): boolean => event.sender === window.webContents;
  const refuseOthers = (event: IpcMainInvokeEvent): void => {
    if (!fromInterface(event)) throw new Error('Only the interface may use this channel');
  };

  ipcMain.handle(CHANNELS.requestView, (event) => {
    refuseOthers(event);
    return manager.view();
  });
  ipcMain.handle(CHANNELS.createGame, (event, input: NewGameInput) => {
    refuseOthers(event);
    return manager.createGame(input);
  });
  ipcMain.on(CHANNELS.command, (event, command: Command) => {
    if (!fromInterface(event)) return;
    // One bad command must not become an uncaught exception that takes the main process down.
    try {
      run(manager, window, command);
    } catch (error) {
      console.error(`Command ${command.type} failed`, error);
    }
  });
  ipcMain.on(CHANNELS.probeEscape, (event) => manager.leaveFocusFrom(event.sender));

  window.webContents.on('before-input-event', (event, input) => {
    if (manager.handleShortcut(input)) event.preventDefault();
  });
  // A modal cannot say it closed if its page goes away, and it would leave the views hidden.
  window.webContents.on('did-start-loading', () => manager.execute({ type: 'set-modal-open', open: false }));
  window.webContents.on('render-process-gone', () => window.webContents.reload());
}
