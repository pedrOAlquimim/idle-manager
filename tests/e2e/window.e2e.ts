import type { Page } from 'playwright-core';
import { afterEach, describe, expect, test } from 'vitest';
import { accountId } from '../../src/shared/types';
import type { AccountStatus, Layout, Rect } from '../../src/shared/types';
import { account, dataWith, launchApp } from './helpers';
import type { TestApp } from './helpers';

let running: TestApp | undefined;

afterEach(async () => {
  await running?.close();
  running = undefined;
});

async function start(...accounts: ReturnType<typeof account>[]): Promise<{ app: TestApp; page: Page }> {
  const app = await launchApp({ data: dataWith(...accounts) });
  running = app;
  return { app, page: await app.ui() };
}

const gameAreaOf = (page: Page, id: string): Promise<Rect> =>
  page.locator(`[data-account="${id}"] .game`).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
  });

async function expectViewOverGameArea(app: TestApp, page: Page, id: string, timeoutMs = 5000): Promise<void> {
  await app.waitFor(async () => {
    const screen = await app.viewBounds(id);
    const area = await gameAreaOf(page, id);
    return screen !== null && screen.visible && JSON.stringify(screen.bounds) === JSON.stringify(area);
  }, timeoutMs);
}

const LAYOUT_BUTTONS: readonly [Layout, string][] = [
  ['focus', 'Uma tela (foco)'],
  ['row', 'Lado a lado em linha'],
  ['grid', 'Grade 2×2'],
];

describe('sidebar', () => {
  test('sidebar lists group and accounts with memory', async () => {
    const { app, page } = await start(account('a', { name: 'Principal' }), account('b', { name: 'Alt 1' }));
    await app.waitFor(() => app.hasPage('b'), 10000);
    const sidebar = page.getByRole('navigation', { name: 'Contas' });
    await sidebar.getByText('PokeIdle').waitFor();
    await sidebar.getByRole('button', { name: /Principal/ }).waitFor();
    await sidebar.getByRole('button', { name: /Alt 1/ }).waitFor();
    await app.waitFor(async () => /\d+ MB/.test(await sidebar.getByRole('button', { name: /Principal/ }).innerText()), 10000);
    expect(await sidebar.innerText()).toContain('Todas as contas');
  });

  test('with no accounts, the grid shows Adicione sua primeira conta', async () => {
    const { page } = await start();
    await page.getByText('Adicione sua primeira conta').waitFor();
    expect(await page.locator('.tile').count()).toBe(0);
  });

  test('adding through the inline field creates a screen', async () => {
    const { app, page } = await start();
    await page.getByRole('button', { name: 'Adicionar conta' }).first().click();
    const field = page.getByLabel('Nome da conta');
    expect(await field.inputValue()).toBe('Principal');
    await field.press('Enter');
    await page.locator('[data-account="principal"]').waitFor();
    await app.waitForStatus('principal', 'login');
    expect(app.storedData().accounts.map((stored) => stored.name)).toEqual(['Principal']);

    await page.getByRole('button', { name: 'Adicionar conta' }).first().click();
    expect(await page.getByLabel('Nome da conta').inputValue()).toBe('Alt 1');
    await page.getByLabel('Nome da conta').fill('principal');
    await page.getByLabel('Nome da conta').press('Enter');
    await page.getByText('Já existe uma conta com esse nome').waitFor();
    expect((await app.view()).accounts).toHaveLength(1);
  });

  test('at the limit, add is disabled with the limit text', async () => {
    const { page } = await start(...['a', 'b', 'c', 'd'].map((id) => account(id, { enabled: false })));
    const limit = page.getByRole('button', { name: 'Limite de 4 contas do PokeIdle' });
    await limit.waitFor();
    expect(await limit.isDisabled()).toBe(true);
    expect(await page.getByRole('button', { name: 'Adicionar conta ao grupo' }).isDisabled()).toBe(true);
  });

  test('collapsing the sidebar resizes the views', async () => {
    const { app, page } = await start(account('a'));
    await app.waitForStatus('a', 'login');
    await expectViewOverGameArea(app, page, 'a');
    const before = await gameAreaOf(page, 'a');

    await page.getByRole('button', { name: 'Recolher barra lateral' }).click();
    await page.getByRole('button', { name: 'Mostrar contas' }).waitFor();
    await app.waitFor(async () => (await gameAreaOf(page, 'a')).width !== before.width, 3000);
    await expectViewOverGameArea(app, page, 'a');
    await app.waitFor(async () => app.storedData().preferences.sidebarOpen === false, 3000);
  });
});

describe('layouts', () => {
  test('the three layouts change the grid and persist', async () => {
    const { app, page } = await start(account('a'), account('b'));
    await app.waitFor(() => app.hasPage('b'), 10000);
    const expectedTiles: Record<Layout, number> = { focus: 1, row: 2, grid: 2 };
    for (const [layout, label] of LAYOUT_BUTTONS) {
      await page.getByRole('button', { name: label }).click();
      await app.waitFor(async () => app.storedData().preferences.layout === layout, 3000);
      await app.waitFor(async () => (await page.locator('.tile').count()) === expectedTiles[layout], 3000);
    }
  });

  test('expand toggles focus and grid', async () => {
    const { app, page } = await start(account('a'), account('b'));
    await page.locator('[data-account="b"]').waitFor();
    await page.getByRole('button', { name: 'Expandir b' }).click();
    await app.waitFor(async () => (await page.locator('.tile').count()) === 1, 3000);
    await page.locator('[data-account="b"]').waitFor();
    expect((await app.view()).preferences).toMatchObject({ layout: 'focus', selectedId: 'b' });

    await page.getByRole('button', { name: 'Expandir b' }).click();
    await app.waitFor(async () => (await page.locator('.tile').count()) === 2, 3000);
    expect((await app.view()).preferences.layout).toBe('grid');
  });

  test('view sits exactly over the .game area', async () => {
    const { app, page } = await start(account('a'), account('b'));
    await app.waitFor(() => app.hasPage('b'), 10000);
    for (const [layout, label] of LAYOUT_BUTTONS) {
      await page.getByRole('button', { name: label }).click();
      await app.waitFor(async () => app.storedData().preferences.layout === layout, 3000);
      await expectViewOverGameArea(app, page, 'a');
      if (layout === 'focus') {
        await app.waitFor(async () => (await app.viewBounds('b'))?.visible === false, 3000);
      } else {
        await expectViewOverGameArea(app, page, 'b');
      }
    }
  });
});

describe('following the layout', () => {
  test('resizing the window moves the views right away', async () => {
    const { app, page } = await start(account('a'), account('b'));
    await app.waitForStatus('b', 'login', 15000);
    await expectViewOverGameArea(app, page, 'b');
    const before = await gameAreaOf(page, 'b');

    await app.resizeWindow(1100, 700);
    await app.waitFor(async () => (await gameAreaOf(page, 'b')).width !== before.width, 3000);
    // Shorter than the 2s between samples: the next render must not be what fixes the position.
    await expectViewOverGameArea(app, page, 'b', 1000);
  });

  test('removing an account moves the next screen into its place', async () => {
    const { app, page } = await start(account('a'), account('b'));
    await app.waitForStatus('b', 'login', 15000);
    await expectViewOverGameArea(app, page, 'b');
    const before = await gameAreaOf(page, 'b');

    await app.removeAccount('a');
    await app.waitFor(async () => (await gameAreaOf(page, 'b')).x !== before.x, 3000);
    expect((await gameAreaOf(page, 'b')).width).toBe(before.width);
    await expectViewOverGameArea(app, page, 'b');
  });
});

describe('keyboard', () => {
  test('Ctrl+2 selects the second account, focused on the window or a view', async () => {
    const { app } = await start(account('a'), account('b'));
    await app.waitForStatus('a', 'login');
    await app.waitForStatus('b', 'login', 15000);

    await app.pressInWindow('2', ['control']);
    await app.waitFor(async () => (await app.view()).preferences.selectedId === 'b', 3000);

    await app.pressInView('b', '1', ['control']);
    await app.waitFor(async () => (await app.view()).preferences.selectedId === 'a', 3000);
    expect(await app.inPage('b', 'window.keys')).toEqual([]);
  });

  test('a number without Ctrl reaches the game in a view', async () => {
    const { app } = await start(account('a'), account('b'));
    await app.waitForStatus('a', 'login');
    await app.waitForStatus('b', 'login', 15000);
    await app.pressInView('a', '2');
    await app.waitFor(async () => ((await app.inPage<string[]>('a', 'window.keys')).includes('2')), 3000);
    expect((await app.view()).preferences.selectedId).toBe('a');
  });

  test('free Esc leaves focus, and Esc with #modal open stays in the game', async () => {
    const { app } = await start(account('a'));
    await app.waitForStatus('a', 'login');
    await app.execute({ type: 'toggle-focus', accountId: accountId('a') });
    await app.inPage('a', 'openModal()');

    await app.pressInView('a', 'Escape');
    await app.waitFor(() => app.inPage<boolean>('a', 'document.getElementById("modal").classList.contains("hidden")'), 3000);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect((await app.view()).preferences.layout).toBe('focus');

    await app.pressInView('a', 'Escape');
    await app.waitFor(async () => (await app.view()).preferences.layout === 'grid', 3000);
  });

  test('Esc with the focus on the window also leaves focus', async () => {
    const { app, page } = await start(account('a'));
    await app.waitForStatus('a', 'login');
    await page.getByRole('button', { name: 'Expandir a' }).click();
    await app.waitFor(async () => (await app.view()).preferences.layout === 'focus', 3000);
    await app.pressInWindow('Escape');
    await app.waitFor(async () => (await app.view()).preferences.layout === 'grid', 3000);
  });
});

describe('keyboard timing', () => {
  test('Esc right after entering focus still leaves it, before the interface hears of the change', async () => {
    const { app } = await start(account('a'));
    await app.waitForStatus('a', 'login');
    await app.pressInWindow('Shift');
    await app.app.evaluate(({ BrowserWindow }) => {
      const test = (globalThis as unknown as { idleManagerTest: { manager: { execute(command: object): void } } }).idleManagerTest;
      test.manager.execute({ type: 'toggle-focus', accountId: 'a' });
      const contents = BrowserWindow.getAllWindows()[0]?.webContents;
      contents?.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
      contents?.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
    });
    await app.waitFor(async () => (await app.view()).preferences.layout === 'grid', 3000);
  });
});

describe('status', () => {
  test('disabled account shows Conta desligada and Ligar', async () => {
    const { app, page } = await start(account('a', { enabled: false }));
    await page.getByText('Conta desligada').waitFor();
    await page.getByRole('button', { name: 'Ligar' }).click();
    await app.waitForStatus('a', 'login');
    await page.getByText('Conta desligada').waitFor({ state: 'detached' });
    await expectViewOverGameArea(app, page, 'a');
  });

  test('a status that hides the view shows its own action', async () => {
    const { app, page } = await start(account('a'), account('b'), account('c'), account('d'));
    await app.waitForStatus('d', 'login', 20000);
    for (const [id, nick] of [['a', 'Ash'], ['b', 'Misty'], ['c', 'Brock'], ['d', 'Gary']] as const) {
      await app.inPage(id, `signIn('${nick}')`);
      await app.waitForStatus(id, 'connected');
    }
    await app.inPage('a', `signOut(); signIn('Oak')`);
    await app.waitForStatus('a', 'blocked');
    await page.locator('[data-account="a"]').getByText('5º nick bloqueado').first().waitFor();
    await app.waitFor(async () => (await app.viewBounds('a'))?.visible === false, 3000);
    await page.getByRole('button', { name: 'Voltar ao login' }).click();
    await app.waitForStatus('a', 'login');
    await expectViewOverGameArea(app, page, 'a');
  });

  test('status shows Tudo certo or N contas precisam de você', async () => {
    const { app, page } = await start(account('a'), account('b'));
    await app.waitForStatus('a', 'login');
    await app.waitForStatus('b', 'login', 15000);
    await page.getByText('2 contas precisam de você').waitFor();
    await app.inPage('a', `signIn('Ash')`);
    await page.getByText('1 conta precisa de você').waitFor();
    await app.inPage('b', `signIn('Misty')`);
    await page.getByText('Tudo certo').waitFor();
  });

  test('each screen shows the host, the partition and the status line', async () => {
    const { app, page } = await start(account('a'));
    await app.waitForStatus('a', 'login');
    const screen = page.locator('[data-account="a"]');
    await screen.getByText('aguardando login').waitFor();
    await screen.getByText('persist:pokeidle-a').waitFor();
    await screen.getByText('127.0.0.1').waitFor();
    const expected: AccountStatus = 'login';
    expect((await app.accountView('a')).status).toBe(expected);
  });
});

describe('window', () => {
  test('closing the window ends the app without an error', async () => {
    const { app } = await start(account('a'));
    await app.waitForStatus('a', 'login');
    await app.closeWindow();
    expect(await app.exited(5000)).toBe(true);
  });
});
