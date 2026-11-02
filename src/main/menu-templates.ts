import type { MenuItemConstructorOptions, MessageBoxOptions } from 'electron';

export function accountMenuTemplate(handlers: { rename(): void; remove(): void }): MenuItemConstructorOptions[] {
  return [
    { label: 'Renomear', click: () => handlers.rename() },
    { type: 'separator' },
    { label: 'Remover conta', click: () => handlers.remove() },
  ];
}

export function groupMenuTemplate(handlers: {
  enableAll(): void;
  disableAll(): void;
  remove(): void;
}): MenuItemConstructorOptions[] {
  return [
    { label: 'Ligar todas', click: () => handlers.enableAll() },
    { label: 'Desligar todas', click: () => handlers.disableAll() },
    { type: 'separator' },
    { label: 'Remover grupo', click: () => handlers.remove() },
  ];
}

// Cancelar is the default here too. `keepsNicks` is for a game that limits nicks: removing the group does not
// give them back.
export function groupRemovalDialogOptions(name: string, accountCount: number, keepsNicks: boolean): MessageBoxOptions {
  const leaving =
    accountCount === 0
      ? 'O grupo está vazio.'
      : accountCount === 1
        ? '1 conta e o login dela saem deste computador. Nas contas do jogo, nada muda.'
        : `${accountCount} contas e os logins delas saem deste computador. Nas contas do jogo, nada muda.`;
  return {
    type: 'warning',
    title: 'Remover grupo',
    message: `Remover o grupo "${name}"?`,
    detail: keepsNicks ? `${leaving} Os nicks usados seguem contando no limite.` : leaving,
    buttons: ['Remover', 'Cancelar'],
    defaultId: 1,
    cancelId: 1,
  };
}

export function trayMenuTemplate(handlers: { show(): void; quit(): void }): MenuItemConstructorOptions[] {
  return [
    { label: 'Mostrar IdleManager', click: () => handlers.show() },
    { type: 'separator' },
    { label: 'Sair', click: () => handlers.quit() },
  ];
}

// Cancelar is the default and the answer to Esc: a stray key press must never delete an account.
export function removalDialogOptions(name: string): MessageBoxOptions {
  return {
    type: 'warning',
    title: 'Remover conta',
    message: `Remover a conta "${name}"?`,
    detail: 'A conta segue contando no limite do jogo se não for excluída.',
    buttons: ['Remover', 'Cancelar'],
    defaultId: 1,
    cancelId: 1,
  };
}
