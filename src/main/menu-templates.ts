import type { MenuItemConstructorOptions, MessageBoxOptions } from 'electron';

export function accountMenuTemplate(handlers: { rename(): void; remove(): void }): MenuItemConstructorOptions[] {
  return [
    { label: 'Renomear', click: () => handlers.rename() },
    { type: 'separator' },
    { label: 'Remover conta', click: () => handlers.remove() },
  ];
}

export function groupMenuTemplate(handlers: { enableAll(): void; disableAll(): void }): MenuItemConstructorOptions[] {
  return [
    { label: 'Ligar todas', click: () => handlers.enableAll() },
    { label: 'Desligar todas', click: () => handlers.disableAll() },
  ];
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
