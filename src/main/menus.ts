import { dialog, Menu } from 'electron';
import type { BrowserWindow } from 'electron';
import { CHANNELS } from '../shared/ipc';
import type { AccountId, GameId, GroupView } from '../shared/types';
import type { AccountManager } from './account-manager';
import { accountMenuTemplate, groupMenuTemplate, groupRemovalDialogOptions, removalDialogOptions } from './menu-templates';

export async function confirmRemoval(window: BrowserWindow, name: string): Promise<boolean> {
  const { response } = await dialog.showMessageBox(window, removalDialogOptions(name));
  return response === 0;
}

export async function confirmGroupRemoval(window: BrowserWindow, group: GroupView): Promise<boolean> {
  const options = groupRemovalDialogOptions(group.name, group.accountIds.length, group.limit !== null);
  const { response } = await dialog.showMessageBox(window, options);
  return response === 0;
}

// Menus are native: the game views sit above any HTML of the window, a native menu sits above both.
export function openAccountMenu(manager: AccountManager, window: BrowserWindow, id: AccountId): void {
  const name = manager.view().accounts.find((account) => account.id === id)?.name;
  if (name === undefined) return;
  const menu = Menu.buildFromTemplate(
    accountMenuTemplate({
      rename: () => window.webContents.send(CHANNELS.renameRequest, id),
      remove: () => {
        void confirmRemoval(window, name)
          .then((confirmed) => (confirmed ? manager.removeAccount(id) : undefined))
          .catch((error: unknown) => console.error(error));
      },
    }),
  );
  menu.popup({ window });
}

export function openGroupMenu(manager: AccountManager, window: BrowserWindow, game: GameId): void {
  const menu = Menu.buildFromTemplate(
    groupMenuTemplate({
      enableAll: () => manager.enableAll(game),
      disableAll: () => manager.disableAll(game),
      remove: () => {
        const group = manager.view().groups.find((candidate) => candidate.gameId === game);
        if (group === undefined) return;
        void confirmGroupRemoval(window, group)
          .then((confirmed) => (confirmed ? manager.removeGame(game) : undefined))
          .catch((error: unknown) => console.error(error));
      },
    }),
  );
  menu.popup({ window });
}
