import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from 'playwright-core';
import { afterEach, describe, expect, test } from 'vitest';
import { accountId, gameId } from '../../src/shared/types';
import type { StoredAccount } from '../../src/shared/types';
import { account, dataWith, launchApp, serveOtherSite } from './helpers';
import type { OtherSite, TestApp } from './helpers';

let running: TestApp | undefined;
let site: OtherSite | undefined;
const scratch: string[] = [];

afterEach(async () => {
  await running?.close();
  running = undefined;
  site?.close();
  site = undefined;
  for (const directory of scratch.splice(0)) rmSync(directory, { recursive: true, force: true });
});

async function start(...accounts: StoredAccount[]): Promise<{ app: TestApp; page: Page; other: OtherSite }> {
  site = await serveOtherSite();
  const app = await launchApp({ data: dataWith(...accounts) });
  running = app;
  return { app, page: await app.ui(), other: site };
}

const group = (other: OtherSite) => ({ name: 'Outro', url: other.url, accountName: 'Principal' });

describe('a group of another site', () => {
  test('opens the site and reads aberta', async () => {
    const { app, page, other } = await start();
    expect(await app.createGame(group(other))).toBeNull();
    await app.waitForStatus('principal', 'connected', 15000);
    await page.locator('[data-account="principal"]').getByText('aberta').waitFor();
    await page.getByText('Tudo certo').waitFor();

    const view = await app.view();
    expect(view.accounts[0]?.host).toBe('127.0.0.2');
    expect(view.preferences.selectedId).toBe('principal');
    expect(view.groups[1]).toMatchObject({ name: 'Outro', host: '127.0.0.2', dot: '#a78bfa', limit: null });
    expect(view.accounts[0]?.history.map((event) => event.text)).toContain('Grupo Outro criado');
  });

  test('keeps the accounts of the group apart', async () => {
    const { app, other } = await start();
    await app.createGame(group(other));
    await app.execute({ type: 'add-account', gameId: gameId('outro'), name: 'Alt 1' });
    await app.waitForStatus('principal', 'connected', 15000);
    await app.waitForStatus('alt-1', 'connected', 20000);

    await app.inPage('principal', `localStorage.setItem('mark', 'one'); null`);
    expect(await app.inPage('principal', `localStorage.getItem('mark')`)).toBe('one');
    expect(await app.inPage('alt-1', `localStorage.getItem('mark')`)).toBeNull();
  });

  test('runs next to the accounts of another group', async () => {
    const { app, other } = await start(account('a'));
    await app.waitForStatus('a', 'login');
    await app.createGame(group(other));
    await app.waitForStatus('principal', 'connected', 20000);
    await app.waitFor(async () => (await app.viewBounds('principal'))?.visible === true, 5000);
    expect((await app.viewBounds('a'))?.visible).toBe(false);

    await app.execute({ type: 'select', accountId: (await app.view()).accounts[0]?.id ?? ('' as never) });
    await app.waitFor(async () => (await app.viewBounds('a'))?.visible === true, 5000);
    expect((await app.viewBounds('principal'))?.visible).toBe(false);
    expect(await app.hasPage('a')).toBe(true);
    expect(await app.hasPage('principal')).toBe(true);
  });

  test('a site that redirects away shows the warning instead of hanging', async () => {
    const { app, page, other } = await start();
    await app.createGame({ name: 'Outro', url: `${other.url}redirect-away`, accountName: 'Principal' });
    await app.waitForStatus('principal', 'down', 15000);

    const tile = page.locator('[data-account="principal"]');
    await tile.getByText('Esse jogo levou para 127.0.0.3. Crie o grupo com esse endereço.').waitFor();
    await tile.getByRole('button', { name: 'Tentar de novo' }).waitFor();
    await tile.getByText('saiu para outro site').waitFor();
    expect(await app.openedUrls()).toEqual([]);
    expect((await app.accountView('principal')).attempts).toBe(0);
  });

  test('a site that leaves after loading keeps running and records it', async () => {
    const { app, other } = await start();
    await app.createGame(group(other));
    await app.waitForStatus('principal', 'connected', 15000);
    await app.inPage('principal', `location.href = 'http://127.0.0.3:9/'; null`);
    await app.waitFor(
      async () =>
        (await app.accountView('principal')).history.some((event) => event.text === 'Saída para 127.0.0.3 bloqueada'),
      5000,
    );
    // The cancelled navigation shows as loading until the next probe finds the page as it was.
    await app.waitForStatus('principal', 'connected', 8000);
    expect(await app.openedUrls()).toEqual([]);
  });

  test('a click on a link to another site opens it in the browser', async () => {
    const { app, other } = await start();
    await app.createGame(group(other));
    await app.waitForStatus('principal', 'connected', 15000);
    await app.clickAt('principal', 50, 50);
    await app.waitFor(async () => (await app.openedUrls()).length > 0, 5000);
    expect(await app.openedUrls()).toEqual(['http://127.0.0.3:9/link']);
  });

  test('a click on a link in the same tab opens the other site in the browser and leaves the page', async () => {
    const { app, other } = await start();
    await app.createGame(group(other));
    await app.waitForStatus('principal', 'connected', 15000);
    await app.clickAt('principal', 50, 200);
    await app.waitFor(async () => (await app.openedUrls()).length > 0, 5000);
    expect(await app.openedUrls()).toEqual(['http://127.0.0.3:9/same-tab']);
    expect(await app.inPage('principal', 'location.hostname')).toBe('127.0.0.2');
  });

  test('a game the app can read gets no warning for an exit it cancelled', async () => {
    const { app } = await start(account('a'));
    await app.waitForStatus('a', 'login');
    await app.inPage('a', `location.href = 'http://127.0.0.3:9/'; null`);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const view = await app.accountView('a');
    expect(view.history.filter((event) => event.text.startsWith('Saída'))).toEqual([]);
    expect(view.status).not.toBe('down');
  });

  test('keeps its own http pages inside the account', async () => {
    const { app, other } = await start();
    await app.createGame(group(other));
    await app.waitForStatus('principal', 'connected', 15000);
    await app.inPage('principal', `location.href = '/segunda-pagina'; null`);
    await app.waitFor(async () => (await app.inPage('principal', 'location.pathname')) === '/segunda-pagina', 5000);
    expect(await app.openedUrls()).toEqual([]);
  });

  test('sends the focus layout back to the grid', async () => {
    const { app, other } = await start(account('a'));
    await app.execute({ type: 'set-layout', layout: 'focus' });
    await app.createGame(group(other));
    expect((await app.view()).preferences.layout).toBe('grid');
  });

  test('survives a restart', async () => {
    site = await serveOtherSite();
    const dataDir = mkdtempSync(join(tmpdir(), 'idlemanager-groups-'));
    scratch.push(dataDir);
    const first = await launchApp({ data: dataWith(), dataDir });
    running = first;
    await first.createGame(group(site));
    await first.waitForStatus('principal', 'connected', 15000);
    await first.quitApp();
    expect(await first.exited(8000)).toBe(true);
    await first.close();

    running = await launchApp({ dataDir });
    await running.waitForStatus('principal', 'connected', 15000);
    expect((await running.view()).groups.map((candidate) => candidate.name)).toEqual(['PokeIdle', 'Outro']);
  });

  test('never reads aberta while its site does not answer', async () => {
    const { app, other } = await start();
    other.close();
    await app.createGame(group(other));
    await app.waitForStatus('principal', 'reloading', 15000);
    for (let check = 0; check < 6; check += 1) {
      expect((await app.accountView('principal')).status).not.toBe('connected');
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  });

  test('blocks suspension while an account is open', async () => {
    const { app, other } = await start();
    await app.createGame(group(other));
    await app.waitForStatus('principal', 'connected', 15000);
    await app.waitFor(() => app.powerActive(), 3000);
  });

  test('has no limit of accounts', async () => {
    const { app, other } = await start();
    await app.createGame(group(other));
    for (const name of ['Alt 1', 'Alt 2', 'Alt 3', 'Alt 4']) {
      await app.execute({ type: 'add-account', gameId: gameId('outro'), name });
    }
    const view = await app.view();
    expect(view.accounts).toHaveLength(5);
    expect(view.groups[1]?.limit).toBeNull();
  });

  test('is refused with the reason when the site already has a group', async () => {
    const { app, other } = await start();
    expect(await app.createGame(group(other))).toBeNull();
    expect(await app.createGame({ ...group(other), name: 'De novo' })).toBe('duplicate-site');
    expect((await app.view()).groups).toHaveLength(2);
  });
});

describe('removing a group', () => {
  test('clears its logins', async () => {
    const { app, other } = await start();
    await app.createGame(group(other));
    await app.waitForStatus('principal', 'connected', 15000);
    await app.inPage('principal', `localStorage.setItem('mark', 'one'); null`);

    await app.removeGame('outro');
    expect((await app.view()).groups.map((candidate) => candidate.gameId)).toEqual(['pokeidle']);
    expect(await app.hasPage('principal')).toBe(false);

    expect(await app.createGame(group(other))).toBeNull();
    await app.waitForStatus('principal', 'connected', 20000);
    expect(await app.inPage('principal', `localStorage.getItem('mark')`)).toBeNull();
  });

  test('keeps the nicks of the PokeIdle group', async () => {
    const { app } = await start(account('a'));
    await app.waitForStatus('a', 'login');
    await app.inPage('a', `signIn('Ash')`);
    await app.waitForStatus('a', 'connected');
    expect(app.storedData().nicks).toEqual({ pokeidle: ['Ash'] });

    await app.removeGame('pokeidle');
    expect(app.storedData().nicks).toEqual({ pokeidle: ['Ash'] });
    expect(app.storedData().accounts).toEqual([]);
    expect(app.storedData().games).toEqual([]);
  });

  test('shows the next group when the selected one goes', async () => {
    const { app, other } = await start(account('a'));
    await app.createGame(group(other));
    expect((await app.view()).preferences.selectedId).toBe('principal');
    await app.removeGame('outro');
    expect((await app.view()).preferences.selectedId).toBe('a');
  });

  test('removing the last group shows the first group screen', async () => {
    const { app, page } = await start(account('a'));
    await app.removeGame('pokeidle');
    await page.getByText('Crie seu primeiro grupo').waitFor();
    expect((await app.view()).preferences.selectedId).toBeNull();
  });

  test('removing the last account keeps the group', async () => {
    const { app, page } = await start(account('a'));
    await app.removeAccount('a');
    await page.getByText('Adicione sua primeira conta').waitFor();
    expect((await app.view()).groups).toHaveLength(1);
    expect(app.storedData().accounts).toEqual([]);
    expect(app.storedData().games.map((game) => game.id)).toEqual(['pokeidle']);
  });

  test('a detached account and one waiting to open go with no error and nothing opens later', async () => {
    const { app } = await start(account('a'));
    await app.waitForStatus('a', 'login');
    await app.execute({ type: 'detach', accountId: accountId('a') });
    await app.waitFor(async () => (await app.accountView('a')).detached, 5000);
    await app.execute({ type: 'add-account', gameId: gameId('pokeidle'), name: 'Alt 1' });
    expect((await app.detachedState('a')).windows).toBe(2);

    await app.removeGame('pokeidle');
    await new Promise((resolve) => setTimeout(resolve, 6500));
    expect((await app.detachedState('a')).windows).toBe(1);
    expect(await app.hasPage('a')).toBe(false);
    expect(await app.hasPage('alt-1')).toBe(false);
    expect(app.mainProcessErrors()).toEqual([]);
  });
});
