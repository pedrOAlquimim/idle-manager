import type { Locator, Page } from 'playwright-core';
import { afterEach, describe, expect, test } from 'vitest';
import { accountId } from '../../src/shared/types';
import { account, dataWith, launchApp } from './helpers';
import type { TestApp } from './helpers';

let running: TestApp | undefined;

afterEach(async () => {
  await running?.close();
  running = undefined;
});

async function start(...accounts: ReturnType<typeof account>[]): Promise<{ app: TestApp; page: Page; panel: Locator }> {
  const app = await launchApp({ data: dataWith(...accounts) });
  running = app;
  const page = await app.ui();
  return { app, page, panel: page.getByRole('complementary', { name: 'Detalhes da conta' }) };
}

const named = (id: string, name: string) => account(id, { name });

// A page that is navigating cannot run a script: treat that as "not yet".
const readPage = (app: TestApp, id: string, script: string): Promise<string> =>
  app.inPage<string>(id, script).catch(() => '');

describe('account panel', () => {
  test('panel shows status, memory and CPU of the selected account', async () => {
    const { app, page, panel } = await start(named('a', 'Principal'), named('b', 'Alt 1'));
    await app.waitFor(() => app.hasPage('b'), 10000);
    await app.waitForStatus('a', 'login');
    await panel.getByText('Principal').first().waitFor();
    await panel.getByText('aguardando login').waitFor();
    await app.waitFor(async () => {
      const text = await panel.innerText();
      return /Memória\s+\d[\d.]* MB/.test(text) && /CPU\s+\d+,\d%/.test(text);
    }, 15000);
    expect(await panel.locator('svg.spark').count()).toBe(2);
    await app.waitFor(async () => ((await panel.locator('svg.spark polyline').first().getAttribute('points')) ?? '') !== '', 10000);

    await page.getByRole('navigation', { name: 'Contas' }).getByRole('button', { name: /Alt 1/ }).click();
    await panel.getByText('Alt 1').first().waitFor();
  });

  test('next account cycles through the list', async () => {
    const { app, panel } = await start(named('a', 'Principal'), named('b', 'Alt 1'));
    await panel.getByText('Principal').first().waitFor();
    await panel.getByRole('button', { name: 'Próxima conta' }).click();
    await app.waitFor(async () => (await app.view()).preferences.selectedId === 'b', 3000);
    await panel.getByRole('button', { name: 'Próxima conta' }).click();
    await app.waitFor(async () => (await app.view()).preferences.selectedId === 'a', 3000);
  });

  test('Início loads the game URL and Recarregar reloads', async () => {
    const { app, panel } = await start(account('a'));
    await app.waitForStatus('a', 'login');
    await app.inPage('a', `window.mark = 1; history.pushState(null, '', '/elsewhere'); null`);
    await panel.getByRole('button', { name: 'Início' }).click();
    await app.waitFor(async () => (await readPage(app, 'a', `location.pathname + ' ' + typeof window.mark`)) === '/ undefined', 8000);

    await app.waitForStatus('a', 'login');
    await app.inPage('a', `window.second = 1; null`);
    await panel.getByRole('button', { name: 'Recarregar' }).click();
    await app.waitFor(async () => (await readPage(app, 'a', `typeof window.second`)) === 'undefined', 8000);
  });

  test('Som/Mudo changes the view, the icon and persists', async () => {
    const { app, panel } = await start(account('a'));
    await app.waitForStatus('a', 'login');
    const muted = panel.getByRole('button', { name: 'Mudo' });
    await muted.waitFor();
    expect(await muted.getAttribute('aria-pressed')).toBe('true');
    expect(await app.isMuted('a')).toBe(true);

    await muted.click();
    await panel.getByRole('button', { name: 'Som', exact: true }).waitFor();
    await app.waitFor(async () => (await app.isMuted('a')) === false, 3000);
    expect(app.storedData().accounts[0]?.muted).toBe(false);

    await panel.getByRole('button', { name: 'Som', exact: true }).click();
    await panel.getByRole('button', { name: 'Mudo' }).waitFor();
    await app.waitFor(async () => (await app.isMuted('a')) === true, 3000);
    expect(app.storedData().accounts[0]?.muted).toBe(true);
  });

  test('panel history shows the 6 most recent events', async () => {
    const { app, panel } = await start(account('a'));
    await app.waitForStatus('a', 'login');
    for (let index = 0; index < 8; index += 1) await app.execute({ type: 'toggle-sound', accountId: accountId('a') });
    await app.waitFor(async () => (await panel.locator('.hist .row').count()) === 6, 3000);
    const first = panel.locator('.hist .row').first();
    expect(await first.innerText()).toContain('Som desligado');
    expect(await first.innerText()).toMatch(/\d\d:\d\d/);
  });

  test('Foco expands the selected account and Desligar turns it off', async () => {
    const { app, panel } = await start(account('a'));
    await app.waitForStatus('a', 'login');
    const focus = panel.getByRole('button', { name: 'Foco' });
    await focus.click();
    await app.waitFor(async () => (await app.view()).preferences.layout === 'focus', 3000);
    expect(await focus.getAttribute('aria-pressed')).toBe('true');

    await panel.getByRole('button', { name: 'Desligar' }).click();
    await app.waitForStatus('a', 'off');
    await panel.getByRole('button', { name: 'Ligar' }).waitFor();
  });

  test('a turned-off account has no page to go home to or reload', async () => {
    const { app, panel } = await start(account('a', { enabled: false }));
    expect(await panel.getByRole('button', { name: 'Início' }).isDisabled()).toBe(true);
    expect(await panel.getByRole('button', { name: 'Recarregar' }).isDisabled()).toBe(true);
    await panel.getByRole('button', { name: 'Ligar' }).click();
    await app.waitForStatus('a', 'login');
    expect(await panel.getByRole('button', { name: 'Início' }).isDisabled()).toBe(false);
  });

  test('with no accounts the panel says so', async () => {
    const { panel } = await start();
    await panel.getByText('Nenhuma conta').waitFor();
  });
});

describe('history and settings panels', () => {
  test('global history and settings replace the panel', async () => {
    const { app, page, panel } = await start(named('a', 'Principal'), named('b', 'Alt 1'));
    await app.waitFor(() => app.hasPage('b'), 10000);
    await app.execute({ type: 'toggle-sound', accountId: accountId('a') });
    await app.execute({ type: 'toggle-sound', accountId: accountId('b') });

    await page.getByRole('button', { name: 'Histórico' }).click();
    await panel.getByText('Histórico', { exact: true }).waitFor();
    await app.waitFor(async () => (await panel.locator('.hist .row').count()) === 2, 3000);
    const text = await panel.innerText();
    expect(text).toContain('Principal');
    expect(text).toContain('Alt 1');
    expect(await panel.locator('.hist .row').first().innerText()).toContain('Alt 1');
    expect(await panel.locator('.hist .row').last().innerText()).toContain('Principal');
    expect(await panel.getByRole('button', { name: 'Próxima conta' }).count()).toBe(0);

    await page.getByRole('button', { name: 'Configurações' }).click();
    await panel.getByText('Notificações').first().waitFor();
    expect(await panel.locator('.hist').count()).toBe(0);

    await page.getByRole('button', { name: 'Configurações' }).click();
    await panel.getByRole('button', { name: 'Próxima conta' }).waitFor();
    await page.getByRole('button', { name: 'Histórico' }).click();
    await panel.getByRole('button', { name: 'Voltar' }).click();
    await panel.getByRole('button', { name: 'Próxima conta' }).waitFor();
  });

  test('disabling notifications persists', async () => {
    const { app, page, panel } = await start(account('a'));
    await page.getByRole('button', { name: 'Configurações' }).click();
    const toggle = panel.getByRole('switch', { name: 'Notificações' });
    expect(await toggle.getAttribute('aria-checked')).toBe('true');
    await toggle.click();
    await app.waitFor(async () => app.storedData().preferences.notifications === false, 3000);
    await app.waitFor(async () => (await toggle.getAttribute('aria-checked')) === 'false', 3000);
    expect(await panel.getByRole('button', { name: 'Abrir pasta de dados' }).isVisible()).toBe(true);
  });
});

describe('renaming', () => {
  test('renaming keeps id and partition', async () => {
    const { app, page, panel } = await start(named('a', 'Principal'), named('b', 'Alt 1'));
    await app.waitForStatus('a', 'login');
    await app.requestRename('a');
    const field = panel.getByLabel('Nome da conta');
    await field.waitFor();
    expect(await field.inputValue()).toBe('Principal');

    await field.fill('Alt 1');
    await field.press('Enter');
    await panel.getByText('Já existe uma conta com esse nome').waitFor();
    expect(app.storedData().accounts[0]?.name).toBe('Principal');

    await field.fill('Farm');
    await field.press('Enter');
    await app.waitFor(async () => app.storedData().accounts[0]?.name === 'Farm', 3000);
    await field.waitFor({ state: 'detached' });
    expect(app.storedData().accounts[0]?.id).toBe('a');
    await page.locator('[data-account="a"]').getByText('persist:pokeidle-a').waitFor();
    await page.locator('[data-account="a"]').getByText('Farm').first().waitFor();
    expect((await app.accountView('a')).status).toBe('login');
  });

  test('Esc cancels a rename without leaving focus mode', async () => {
    const { app, panel } = await start(account('a'));
    await app.waitForStatus('a', 'login');
    await app.execute({ type: 'toggle-focus', accountId: accountId('a') });
    await app.requestRename('a');
    const field = panel.getByLabel('Nome da conta');
    await field.fill('Outro');
    await field.press('Escape');
    await field.waitFor({ state: 'detached' });
    expect(app.storedData().accounts[0]?.name).toBe('a');
    expect((await app.view()).preferences.layout).toBe('focus');
  });

  test('a rename request for another account selects it first', async () => {
    const { app, panel } = await start(named('a', 'Principal'), named('b', 'Alt 1'));
    await panel.getByText('Principal').first().waitFor();
    await app.requestRename('b');
    expect(await panel.getByLabel('Nome da conta').inputValue()).toBe('Alt 1');
    await app.waitFor(async () => (await app.view()).preferences.selectedId === 'b', 3000);
  });
});

describe('turning a whole group on and off', () => {
  test('enableAll opens every account one after another and disableAll closes them', async () => {
    const app = await launchApp({ data: dataWith(...['a', 'b', 'c'].map((id) => account(id, { enabled: false }))) });
    running = app;
    await app.enableAll('pokeidle');
    expect(app.storedData().accounts.map((stored) => stored.enabled)).toEqual([true, true, true]);
    await app.waitForStatus('a', 'login');
    await app.waitForStatus('c', 'login', 20000);

    await app.disableAll('pokeidle');
    for (const id of ['a', 'b', 'c']) {
      expect((await app.accountView(id)).status).toBe('off');
      expect(await app.hasPage(id)).toBe(false);
    }
    expect(app.storedData().accounts.map((stored) => stored.enabled)).toEqual([false, false, false]);
  });
});
