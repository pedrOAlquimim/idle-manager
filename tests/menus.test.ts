import { describe, expect, test } from 'vitest';
import {
  accountMenuTemplate,
  groupMenuTemplate,
  groupRemovalDialogOptions,
  removalDialogOptions,
  trayMenuTemplate,
} from '../src/main/menu-templates';

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
  test('offers Ligar todas, Desligar todas and Remover grupo, each calling its own handler', () => {
    const calls: string[] = [];
    const template = groupMenuTemplate({
      enableAll: () => calls.push('enable'),
      disableAll: () => calls.push('disable'),
      remove: () => calls.push('remove'),
    });
    const items = template.filter((item) => item.type !== 'separator');
    expect(items.map((item) => item.label)).toEqual(['Ligar todas', 'Desligar todas', 'Remover grupo']);
    expect(template.filter((item) => item.type === 'separator')).toHaveLength(1);
    expect(template[template.length - 2]?.type).toBe('separator');
    click(items[2]);
    click(items[1]);
    click(items[0]);
    expect(calls).toEqual(['remove', 'disable', 'enable']);
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

describe('group removal dialog', () => {
  test('names the group and says what leaves this computer', () => {
    const options = groupRemovalDialogOptions('Jogo', 2, false);
    expect(options.message).toBe('Remover o grupo "Jogo"?');
    expect(options.detail).toBe('2 contas e os logins delas saem deste computador. Nas contas do jogo, nada muda.');
    expect(groupRemovalDialogOptions('Jogo', 1, false).detail).toBe(
      '1 conta e o login dela saem deste computador. Nas contas do jogo, nada muda.',
    );
    expect(groupRemovalDialogOptions('Jogo', 0, false).detail).toBe('O grupo está vazio.');
  });

  test('warns that the nicks keep counting when the game limits them', () => {
    expect(groupRemovalDialogOptions('Jogo', 2, true).detail).toContain('Os nicks usados seguem contando no limite.');
    expect(groupRemovalDialogOptions('Jogo', 2, false).detail).not.toContain('nicks');
  });

  test('defaults to Cancelar, so a stray Enter or Esc keeps the group', () => {
    const options = groupRemovalDialogOptions('Jogo', 2, true);
    expect([options.buttons, options.defaultId, options.cancelId, options.type]).toEqual([['Remover', 'Cancelar'], 1, 1, 'warning']);
  });
});
