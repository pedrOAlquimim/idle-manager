import type { Locator, Page } from 'playwright-core';
import { afterEach, describe, expect, test } from 'vitest';
import { accountId } from '../../src/shared/types';
import type { StoredAccount } from '../../src/shared/types';
import { account, dataWith, launchApp, serveOtherSite } from './helpers';
import type { OtherSite, TestApp } from './helpers';

let running: TestApp | undefined;
let site: OtherSite | undefined;

afterEach(async () => {
  await running?.close();
  running = undefined;
  site?.close();
  site = undefined;
});

async function start(...accounts: StoredAccount[]): Promise<{ app: TestApp; page: Page }> {
  const app = await launchApp({ data: dataWith(...accounts) });
  running = app;
  return { app, page: await app.ui() };
}

const newGroupDialog = (page: Page): Locator => page.getByRole('dialog', { name: 'Novo grupo de jogo' });
const addAccountDialog = (page: Page): Locator => page.getByRole('dialog', { name: 'Adicionar conta' });

async function openNewGroup(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Novo grupo de jogo' }).first().click();
  const dialog = newGroupDialog(page);
  await dialog.waitFor();
  return dialog;
}

async function openAddAccount(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Adicionar conta ao grupo' }).first().click();
  const dialog = addAccountDialog(page);
  await dialog.waitFor();
  return dialog;
}

const isFocused = (field: Locator): Promise<boolean> => field.evaluate((element) => element === document.activeElement);

describe('Novo grupo de jogo', () => {
  test('opens with Principal filled and the game name focused', async () => {
    const { page } = await start();
    const dialog = await openNewGroup(page);
    expect(await dialog.getByLabel('Nome da primeira conta').inputValue()).toBe('Principal');
    expect(await isFocused(dialog.getByLabel('Nome do jogo'))).toBe(true);
    await dialog.getByText('Cole o endereço que você abre no navegador para jogar.').waitFor();
    await dialog.getByText('Um grupo reúne as contas de um mesmo jogo.').waitFor();
  });

  test('creating a group selects the new account', async () => {
    site = await serveOtherSite();
    const { app, page } = await start(account('a'));
    const dialog = await openNewGroup(page);
    await dialog.getByLabel('Nome do jogo').fill('Outro');
    await dialog.getByLabel('URL do jogo').fill(site.url);
    await dialog.getByRole('button', { name: 'Criar grupo' }).click();
    await dialog.waitFor({ state: 'detached' });
    await page.locator('[data-account="principal"]').waitFor();
    expect((await app.view()).preferences.selectedId).toBe('principal');
    expect(app.storedData().games.map((game) => game.name)).toEqual(['PokeIdle', 'Outro']);
  });

  test.each([
    ['not a url', 'Esse endereço não parece uma URL. Exemplo: https://pokeidle.io/'],
    ['ftp://a.b/', 'Use um endereço de site, começando com https://'],
  ])('the address %s shows its message until it changes', async (url, message) => {
    const { app, page } = await start();
    const dialog = await openNewGroup(page);
    await dialog.getByLabel('Nome do jogo').fill('Outro');
    const field = dialog.getByLabel('URL do jogo');
    await field.fill(url);
    await field.press('Enter');
    await dialog.getByText(message).waitFor();
    expect(await field.getAttribute('aria-invalid')).toBe('true');
    expect(await dialog.getByText('Cole o endereço que você abre no navegador para jogar.').count()).toBe(0);

    await field.fill('outro.example.com');
    await dialog.getByText('Cole o endereço que você abre no navegador para jogar.').waitFor();
    expect((await app.view()).groups).toHaveLength(1);
  });

  test('a site already in a group is refused and the modal stays open', async () => {
    const { app, page } = await start();
    const dialog = await openNewGroup(page);
    await dialog.getByLabel('Nome do jogo').fill('De novo');
    await dialog.getByLabel('URL do jogo').fill(`http://127.0.0.1:${app.gamePort}/`);
    await dialog.getByLabel('URL do jogo').press('Enter');
    await dialog.getByText('Já existe um grupo para esse site').waitFor();
    expect((await app.view()).groups).toHaveLength(1);
  });

  test('a name already in use is refused next to the name', async () => {
    site = await serveOtherSite();
    const { page } = await start();
    const dialog = await openNewGroup(page);
    const name = dialog.getByLabel('Nome do jogo');
    await name.fill('pokeidle');
    await dialog.getByLabel('URL do jogo').fill(site.url);
    await dialog.getByLabel('URL do jogo').press('Enter');
    await dialog.getByText('Já existe um grupo com esse nome').waitFor();
    expect(await name.getAttribute('aria-invalid')).toBe('true');
    expect(await isFocused(name)).toBe(true);
  });

  test('empty fields are marked without a message', async () => {
    const { page } = await start();
    const dialog = await openNewGroup(page);
    await dialog.getByRole('button', { name: 'Criar grupo' }).click();
    await dialog.locator('[aria-invalid="true"]').waitFor();
    expect(await dialog.getByLabel('Nome do jogo').getAttribute('aria-invalid')).toBe('true');
  });

  test('pressing Enter twice creates one group and closes the modal', async () => {
    site = await serveOtherSite();
    const { app, page } = await start();
    const dialog = await openNewGroup(page);
    await dialog.getByLabel('Nome do jogo').fill('Outro');
    await dialog.getByLabel('URL do jogo').fill(site.url);
    await dialog.locator('form').evaluate((form: HTMLFormElement) => {
      form.requestSubmit();
      form.requestSubmit();
    });
    await dialog.waitFor({ state: 'detached' });
    expect((await app.view()).groups).toHaveLength(2);
    expect((await app.view()).accounts).toHaveLength(1);
  });
});

describe('Adicionar conta', () => {
  test('the plus of a group opens it with the suggestion and the host', async () => {
    const { app, page } = await start(account('a', { name: 'Principal' }));
    const dialog = await openAddAccount(page);
    await dialog.getByText('A conta entra no grupo PokeIdle e abre 127.0.0.1 com login separado.').waitFor();
    const field = dialog.getByLabel('Nome da conta');
    expect(await field.inputValue()).toBe('Alt 1');
    expect(await isFocused(field)).toBe(true);
    expect(await field.evaluate((input: HTMLInputElement) => [input.selectionStart, input.selectionEnd])).toEqual([0, 5]);
    await field.press('Enter');
    await dialog.waitFor({ state: 'detached' });
    await page.locator('[data-account="alt-1"]').waitFor();
    expect((await app.view()).preferences.selectedId).toBe('alt-1');
  });

  test('a repeated name shows the error', async () => {
    const { app, page } = await start(account('a', { name: 'Principal' }));
    const dialog = await openAddAccount(page);
    await dialog.getByLabel('Nome da conta').fill('principal');
    await dialog.getByRole('button', { name: 'Adicionar conta' }).click();
    await dialog.getByText('Já existe uma conta com esse nome').waitFor();
    expect((await app.view()).accounts).toHaveLength(1);
  });
});

describe('both modals', () => {
  test('X, Cancelar, Esc and a click outside close them', async () => {
    const { page } = await start(account('a'));
    const closers: ((dialog: Locator) => Promise<void>)[] = [
      (dialog) => dialog.getByRole('button', { name: 'Fechar' }).click(),
      (dialog) => dialog.getByRole('button', { name: 'Cancelar' }).click(),
      () => page.keyboard.press('Escape'),
      () => page.mouse.click(4, 4),
    ];
    for (const close of closers) {
      const dialog = await openNewGroup(page);
      await close(dialog);
      await dialog.waitFor({ state: 'detached' });
    }
    const dialog = await openAddAccount(page);
    await page.mouse.click(4, 4);
    await dialog.waitFor({ state: 'detached' });
  });

  test('Esc does not leave the focus layout', async () => {
    const { app, page } = await start(account('a'));
    await app.execute({ type: 'set-layout', layout: 'focus' });
    const dialog = await openNewGroup(page);
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    expect((await app.view()).preferences.layout).toBe('focus');
  });

  test('views hide while one is open and return without reloading', async () => {
    const { app, page } = await start(account('a'));
    await app.waitForStatus('a', 'login');
    await app.waitFor(async () => (await app.viewBounds('a'))?.visible === true, 5000);
    await app.inPage('a', 'window.__alive = 1; null');

    const dialog = await openNewGroup(page);
    await app.waitFor(async () => (await app.viewBounds('a'))?.visible === false, 3000);
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    await app.waitFor(async () => (await app.viewBounds('a'))?.visible === true, 3000);
    expect(await app.inPage('a', 'window.__alive')).toBe(1);
  });

  test('the keyboard leaves the game for the interface', async () => {
    const { app, page } = await start(account('a'));
    await app.waitForStatus('a', 'login');
    await app.focus('a');
    await openNewGroup(page);
    await app.waitFor(() => app.interfaceHasKeyboard(), 3000);
  });

  test('Ctrl+2 does nothing while one is open', async () => {
    const { app, page } = await start(account('a'), account('b'));
    await openNewGroup(page);
    await app.pressInWindow('2', ['control']);
    await app.pressInWindow('Escape');
    expect((await app.view()).preferences.selectedId).toBe('a');
  });

  test('a crash keeps the views hidden until the modal closes', async () => {
    const { app, page } = await start(account('a'));
    await app.waitForStatus('a', 'login');
    const dialog = await openNewGroup(page);
    await app.waitFor(async () => (await app.viewBounds('a'))?.visible === false, 3000);

    await app.crash('a');
    await app.waitForStatus('a', 'reloading');
    expect((await app.viewBounds('a'))?.visible).toBe(false);
    await app.waitForStatus('a', 'login', 15000);
    expect((await app.viewBounds('a'))?.visible).toBe(false);

    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await app.waitFor(async () => (await app.viewBounds('a'))?.visible === true, 3000);
  });
});

describe('sidebar and screens', () => {
  test('with no group the screen offers Novo grupo de jogo', async () => {
    const app = await launchApp();
    running = app;
    const page = await app.ui();
    await page.getByText('Crie seu primeiro grupo').waitFor();
    await page.getByRole('main').getByRole('button', { name: 'Novo grupo de jogo' }).click();
    await newGroupDialog(page).waitFor();
  });

  test('with an empty group Nova conta opens Adicionar conta', async () => {
    const { page } = await start();
    await page.getByText('Adicione sua primeira conta').waitFor();
    await page.getByRole('button', { name: 'Nova conta' }).click();
    expect(await addAccountDialog(page).getByLabel('Nome da conta').inputValue()).toBe('Principal');
  });

  test('at the limit the plus is disabled and Novo grupo de jogo stays enabled', async () => {
    const { page } = await start(...['a', 'b', 'c', 'd'].map((id) => account(id, { enabled: false })));
    const plus = page.getByRole('button', { name: 'Adicionar conta ao grupo' });
    await plus.waitFor();
    expect(await plus.isDisabled()).toBe(true);
    expect(await plus.getAttribute('title')).toBe('Limite de 4 contas do PokeIdle');
    expect(await page.getByRole('button', { name: 'Novo grupo de jogo' }).isEnabled()).toBe(true);
  });

  test('the group of the selected account stands out and groups have their own dot', async () => {
    site = await serveOtherSite();
    const { app, page } = await start(account('a'));
    await app.createGame({ name: 'Outro', url: site.url, accountName: 'Principal' });
    const groups = page.locator('.group');
    await app.waitFor(async () => (await groups.count()) === 2, 3000);
    await app.waitFor(async () => (await groups.nth(0).getAttribute('class')) === 'group inactive', 3000);
    expect(await groups.nth(1).getAttribute('class')).toBe('group');

    const dots = await page.locator('.gdot').evaluateAll((elements) => elements.map((element) => getComputedStyle(element).backgroundColor));
    expect(dots).toEqual(['rgb(245, 200, 76)', 'rgb(167, 139, 250)']);

    await app.execute({ type: 'select', accountId: accountId('a') });
    await app.waitFor(async () => (await groups.nth(0).getAttribute('class')) === 'group', 3000);
    expect(await groups.nth(1).getAttribute('class')).toBe('group inactive');
  });

  test('ten screens fit above the status bar', async () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
    const { app, page } = await start(...ids.map((id) => account(id, { enabled: false })));
    await app.resizeWindow(1000, 640);
    await page.locator('[data-account="j"]').waitFor();
    await app.waitFor(async () => {
      const bottom = await page.locator('.game').last().evaluate((element) => element.getBoundingClientRect().bottom);
      const status = await page.locator('.status').evaluate((element) => element.getBoundingClientRect().top);
      return bottom <= status;
    }, 3000);
    expect(await page.locator('.tile').count()).toBe(10);
  });
});
