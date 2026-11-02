import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';
import { CHANNELS } from '../shared/ipc';
import type { Command, WindowApi } from '../shared/ipc';
import type { AccountId, AppView, NewGameError } from '../shared/types';

const api: WindowApi = {
  requestView: () => ipcRenderer.invoke(CHANNELS.requestView) as Promise<AppView>,
  onChange(listener) {
    const forward = (_event: IpcRendererEvent, view: AppView): void => listener(view);
    ipcRenderer.on(CHANNELS.view, forward);
    return () => ipcRenderer.off(CHANNELS.view, forward);
  },
  onRenameRequest(listener) {
    const forward = (_event: IpcRendererEvent, id: AccountId): void => listener(id);
    ipcRenderer.on(CHANNELS.renameRequest, forward);
    return () => ipcRenderer.off(CHANNELS.renameRequest, forward);
  },
  createGame: (input) => ipcRenderer.invoke(CHANNELS.createGame, input) as Promise<NewGameError | null>,
  send(command: Command) {
    ipcRenderer.send(CHANNELS.command, command);
  },
};

contextBridge.exposeInMainWorld('idleManager', api);
