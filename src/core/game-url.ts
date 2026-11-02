export type GameUrlError = 'invalid-url' | 'not-a-site';

const SHORT_SECOND_LEVEL = 3;
const COUNTRY_CODE = 2;

// What the user pasted into the new group form. A URL carrying a user or a password is refused, because
// the app stores this address and must never store a password.
export function parseGameUrl(raw: string): { ok: true; url: URL } | { ok: false; error: GameUrlError } {
  const trimmed = raw.trim();
  const withScheme = /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  if (!URL.canParse(withScheme)) return { ok: false, error: 'invalid-url' };
  const url = new URL(withScheme);
  if (url.username !== '' || url.password !== '') return { ok: false, error: 'invalid-url' };
  // `jogo.com.` is the same site as `jogo.com`, and it must not slip past the comparisons made on the host.
  const hostname = url.hostname.replace(/\.+$/, '');
  const isWeb = url.protocol === 'https:' || url.protocol === 'http:';
  if (!isWeb || !hostname.includes('.')) return { ok: false, error: 'not-a-site' };
  url.hostname = hostname;
  return { ok: true, url };
}

export function siteHost(hostname: string): string {
  return hostname.replace(/^www\./, '');
}

// The registered domain, as far as can be told without the public suffix list: `jogo.com.br` keeps three
// labels because `com.br` is not a domain anyone owns. The guess can come out too narrow, which only sends
// a page to the browser, but never as wide as a whole country ending.
export function baseDomain(hostname: string): string | null {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return null;
  const labels = hostname.split('.');
  const [secondToLast = '', last = ''] = labels.slice(-2);
  const looksLikeCountrySuffix = secondToLast.length <= SHORT_SECOND_LEVEL && last.length === COUNTRY_CODE;
  return labels.slice(labels.length >= 3 && looksLikeCountrySuffix ? -3 : -2).join('.');
}
