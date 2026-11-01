import { describe, expect, test } from 'vitest';
import { accountMenuTemplate, groupMenuTemplate, removalDialogOptions, trayMenuTemplate } from '../src/main/menu-templates';

const click = (item: { click?: unknown } | undefined): void => {
  (item?.click as (...args: unknown[]) => void)(undefined, undefined, undefined);
};

describe('account menu', () => {
  test('offers Renomear and Remover conta, each calling its own handler', () => {
    const calls: string[] = [];
    const template = accountMenuTemplate({ rename: () => calls.push('rename'), remove: () => calls.push('remove') });
    const items = template.filter((item) => item.type !== 'separator');
    expect(items.map((item) => item.label)).toEqual(['Renomear', 'Remover conta']);
    click(items[0]);
    click(items[1]);
    expect(calls).toEqual(['rename', 'remove']);
  });
});

describe('group menu', () => {
  test('offers Ligar todas and Desligar todas, each calling its own handler', () => {
    const calls: string[] = [];
    const template = groupMenuTemplate({ enableAll: () => calls.push('enable'), disableAll: () => calls.push('disable') });
    expect(template.map((item) => item.label)).toEqual(['Ligar todas', 'Desligar todas']);
    click(template[1]);
    click(template[0]);
    expect(calls).toEqual(['disable', 'enable']);
  });
});

describe('tray menu', () => {
  test('offers Mostrar IdleManager and Sair, each calling its own handler', () => {
    const calls: string[] = [];
    const template = trayMenuTemplate({ show: () => calls.push('show'), quit: () => calls.push('quit') });
    const items = template.filter((item) => item.type !== 'separator');
    expect(items.map((item) => item.label)).toEqual(['Mostrar IdleManager', 'Sair']);
    click(items[1]);
    click(items[0]);
    expect(calls).toEqual(['quit', 'show']);
  });
});

describe('removal dialog', () => {
  test('names the account and warns that it still counts for the game', () => {
    const options = removalDialogOptions('Alt 1');
    expect(options.message).toContain('"Alt 1"');
    expect(options.detail).toBe('A conta segue contando no limite do jogo se não for excluída.');
  });

  test('defaults to Cancelar, so a stray Enter or Esc keeps the account', () => {
    const options = removalDialogOptions('Alt 1');
    expect(options.buttons).toEqual(['Remover', 'Cancelar']);
    expect(options.defaultId).toBe(1);
    expect(options.cancelId).toBe(1);
  });
});
