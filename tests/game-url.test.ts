import { describe, expect, test } from 'vitest';
import { baseDomain, parseGameUrl, siteHost } from '../src/core/game-url';

describe('parseGameUrl', () => {
  test.each([
    [' HTTPS://Jogo.COM/x ', 'https://jogo.com/x'],
    ['jogo.com', 'https://jogo.com/'],
    ['http://jogo.com/', 'http://jogo.com/'],
    ['jogo.com/a?b=1#c', 'https://jogo.com/a?b=1#c'],
    ['127.0.0.2:8000', 'https://127.0.0.2:8000/'],
    ['https://pokeidle.io./app', 'https://pokeidle.io/app'],
    ['jogo.com..', 'https://jogo.com/'],
  ])('accepts %j as %s', (raw, href) => {
    const parsed = parseGameUrl(raw);
    expect(parsed.ok && parsed.url.href).toBe(href);
  });

  test.each([
    [''],
    ['not a url'],
    ['https://user:senha@jogo.com/'],
    ['https://user@jogo.com/'],
  ])('refuses %j as not being a URL', (raw) => {
    expect(parseGameUrl(raw)).toEqual({ ok: false, error: 'invalid-url' });
  });

  test.each([
    ['ftp://jogo.com/'],
    ['file:///etc/passwd'],
    ['localhost:3000'],
    ['https://localhost/'],
    ['https://./'],
  ])('refuses %j as not being a site', (raw) => {
    expect(parseGameUrl(raw)).toEqual({ ok: false, error: 'not-a-site' });
  });
});

describe('siteHost', () => {
  test('drops a leading www only', () => {
    expect(siteHost('www.jogo.com')).toBe('jogo.com');
    expect(siteHost('jogo.com')).toBe('jogo.com');
    expect(siteHost('wwwjogo.com')).toBe('wwwjogo.com');
    expect(siteHost('app.www.jogo.com')).toBe('app.www.jogo.com');
  });
});

describe('baseDomain', () => {
  test.each([
    ['jogo.com', 'jogo.com'],
    ['app.jogo.com', 'jogo.com'],
    ['a.b.jogo.com', 'jogo.com'],
    ['jogo.com.br', 'jogo.com.br'],
    ['app.jogo.com.br', 'jogo.com.br'],
    ['app.jogo.co.uk', 'jogo.co.uk'],
    ['jogo.io', 'jogo.io'],
    ['app.jogo.io', 'jogo.io'],
    // Errs on the narrow side on purpose: a two-letter ending after a short word looks like com.br.
    ['app.abc.io', 'app.abc.io'],
  ])('%s => %s', (hostname, domain) => {
    expect(baseDomain(hostname)).toBe(domain);
  });

  test('an IP address has no domain', () => {
    expect(baseDomain('127.0.0.2')).toBeNull();
  });
});
