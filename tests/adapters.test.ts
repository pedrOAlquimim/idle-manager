import { describe, expect, test } from 'vitest';
import { adapterFor } from '../src/games/adapter';
import type { ReadableDocument, ReadableStorage } from '../src/games/adapter';
import { genericAdapter } from '../src/games/generic';
import type { ProbeReading } from '../src/shared/types';

interface FakeElement {
  classList: { contains(name: string): boolean };
  textContent: string | null;
}

const element = (options: { hidden?: boolean; text?: string } = {}): FakeElement => ({
  classList: { contains: (name) => name === 'hidden' && options.hidden === true },
  textContent: options.text ?? '',
});

const fakeDoc = (elements: Record<string, FakeElement>): ReadableDocument =>
  ({ querySelector: (selector: string) => elements[selector] ?? null }) as unknown as ReadableDocument;

const fakeStorage = (values: Record<string, string>): ReadableStorage => ({
  getItem: (key: string) => values[key] ?? null,
});

// The shape of the real page: the login portal and the game share the document, the one on screen has
// no `hidden` class, and the overlays exist but stay hidden until the game needs them.
const overlays = (): Record<string, FakeElement> => ({
  '#sessao-tomada': element({ hidden: true }),
  '#alerta-conta': element({ hidden: true }),
  '#alerta-conta-titulo': element(),
});
const loginPage = (extra: Record<string, FakeElement> = {}): ReadableDocument =>
  fakeDoc({ '#portal': element(), '#app': element({ hidden: true }), ...overlays(), ...extra });
const gamePage = (extra: Record<string, FakeElement> = {}): ReadableDocument =>
  fakeDoc({ '#portal': element({ hidden: true }), '#app': element(), ...overlays(), ...extra });

const SIGNED_IN = fakeStorage({ sessao: '{"nick":"Ash","token":"x"}' });
const SIGNED_OUT = fakeStorage({});

const pokeidle = adapterFor('pokeidle');

describe('pokeidle adapter', () => {
  test('login: #portal present and no session', () => {
    expect(pokeidle.read(loginPage(), SIGNED_OUT)).toEqual<ProbeReading>({
      gamePresent: true,
      gameVisible: false,
      hasSession: false,
      nick: null,
      sessionTaken: false,
      notice: null,
    });
  });

  test('connected: #app without hidden and a valid sessao', () => {
    expect(pokeidle.read(gamePage(), SIGNED_IN)).toEqual<ProbeReading>({
      gamePresent: true,
      gameVisible: true,
      hasSession: true,
      nick: 'Ash',
      sessionTaken: false,
      notice: null,
    });
  });

  test.each([
    ['broken JSON', '{broken'],
    ['no token', '{"nick":"a"}'],
    ['no nick', '{"token":"x"}'],
    ['empty nick', '{"nick":"","token":"x"}'],
    ['empty token', '{"nick":"a","token":""}'],
    ['non-string nick', '{"nick":1,"token":"x"}'],
    ['a string', '"sessao"'],
    ['null', 'null'],
    ['an array', '[]'],
  ])('invalid sessao counts as no session: %s', (_label, raw) => {
    const reading = pokeidle.read(gamePage(), fakeStorage({ sessao: raw }));
    expect(reading).toMatchObject({ hasSession: false, nick: null });
  });

  test('taken session: #sessao-tomada without hidden', () => {
    expect(pokeidle.read(gamePage({ '#sessao-tomada': element() }), SIGNED_IN).sessionTaken).toBe(true);
    expect(pokeidle.read(gamePage(), SIGNED_IN).sessionTaken).toBe(false);
    expect(pokeidle.read(fakeDoc({ '#portal': element() }), SIGNED_IN).sessionTaken).toBe(false);
  });

  test('notice uses #alerta-conta-titulo only when #alerta-conta has no hidden', () => {
    const open = (title: string): ReadableDocument =>
      gamePage({ '#alerta-conta': element(), '#alerta-conta-titulo': element({ text: title }) });
    expect(pokeidle.read(open('  Rede cheia '), SIGNED_IN).notice).toBe('Rede cheia');

    const closed = gamePage({ '#alerta-conta-titulo': element({ text: 'Rede cheia' }) });
    expect(pokeidle.read(closed, SIGNED_IN).notice).toBeNull();
  });

  test('an open notice without a title still reports a notice, and a huge title is cut', () => {
    const untitled = gamePage({ '#alerta-conta': element(), '#alerta-conta-titulo': element({ text: '   ' }) });
    expect(pokeidle.read(untitled, SIGNED_IN).notice).toBe('Aviso do jogo');

    const missingTitle = fakeDoc({ '#portal': element(), '#alerta-conta': element() });
    expect(pokeidle.read(missingTitle, SIGNED_OUT).notice).toBe('Aviso do jogo');

    const huge = gamePage({ '#alerta-conta': element(), '#alerta-conta-titulo': element({ text: 'x'.repeat(500) }) });
    expect(pokeidle.read(huge, SIGNED_IN).notice).toHaveLength(200);
  });

  test('without #portal: gamePresent is false', () => {
    const errorPage = fakeDoc({});
    expect(pokeidle.read(errorPage, SIGNED_OUT)).toEqual<ProbeReading>({
      gamePresent: false,
      gameVisible: false,
      hasSession: false,
      nick: null,
      sessionTaken: false,
      notice: null,
    });
  });

  test('storage that throws does not break the reading', () => {
    const blocked: ReadableStorage = {
      getItem: () => {
        throw new Error('storage is blocked');
      },
    };
    expect(pokeidle.read(gamePage(), blocked)).toMatchObject({
      gamePresent: true,
      gameVisible: true,
      hasSession: false,
      nick: null,
    });
  });

  test('escapeIsFree is false with #modal or #alerta-conta open', () => {
    expect(pokeidle.escapeIsFree(gamePage())).toBe(true);
    expect(pokeidle.escapeIsFree(gamePage({ '#modal': element() }))).toBe(false);
    expect(pokeidle.escapeIsFree(gamePage({ '#modal': element({ hidden: true }) }))).toBe(true);
    expect(pokeidle.escapeIsFree(gamePage({ '#alerta-conta': element() }))).toBe(false);
    expect(pokeidle.escapeIsFree(gamePage({ '#alerta-conta': element({ hidden: true }) }))).toBe(true);
  });
});

describe('adapter lookup', () => {
  test('generic adapter reports connected without a nick', () => {
    expect(genericAdapter.read(fakeDoc({}), SIGNED_OUT)).toEqual<ProbeReading>({
      gamePresent: true,
      gameVisible: true,
      hasSession: true,
      nick: null,
      sessionTaken: false,
      notice: null,
    });
    expect(genericAdapter.escapeIsFree(fakeDoc({}))).toBe(true);
  });

  test('id without its own adapter gets the generic one', () => {
    expect(adapterFor('some-other-game')).toBe(genericAdapter);
    expect(adapterFor('')).toBe(genericAdapter);
    expect(adapterFor('constructor')).toBe(genericAdapter);
    expect(adapterFor('pokeidle')).not.toBe(genericAdapter);
  });
});
