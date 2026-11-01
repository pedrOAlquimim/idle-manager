import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const ROOT = join(import.meta.dirname, '..');
const config = readFileSync(join(ROOT, 'electron-builder.yml'), 'utf8');
const scripts = (JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> }).scripts;

// The config is a flat, hand-written file: a key, then its "- item" lines.
function listUnder(key: string): string[] {
  const block = new RegExp(`^${key}:\\n((?:[ ]+- .+\\n?)+)`, 'm').exec(config)?.[1] ?? '';
  return [...block.matchAll(/^[ ]+- (.+)$/gm)].map((match) => (match[1] ?? '').trim());
}

const scalar = (key: string): string | undefined => new RegExp(`^[ ]*${key}: (.+)$`, 'm').exec(config)?.[1]?.trim();

describe('electron-builder.yml', () => {
  test('packages only the built app: dist, assets and package.json', () => {
    expect(listUnder('files')).toEqual(['dist/**', 'assets/**', 'package.json']);
  });

  test('names the app', () => {
    expect(scalar('appId')).toBe('com.pedro.idlemanager');
    expect(scalar('productName')).toBe('IdleManager');
  });

  test('builds a deb for x64 in the Game category, with the executable idlemanager', () => {
    expect(config).toMatch(/- target: deb\s+arch:\s+- x64/);
    expect(scalar('category')).toBe('Game');
    expect(scalar('executableName')).toBe('idlemanager');
  });

  test('uses an icon that exists in the build resources folder', () => {
    expect(scalar('buildResources')).toBe('build');
    expect(existsSync(join(ROOT, 'build', scalar('icon') ?? 'missing'))).toBe(true);
  });

  test('writes the installer to release/, which git ignores', () => {
    expect(scalar('output')).toBe('release');
    expect(readFileSync(join(ROOT, '.gitignore'), 'utf8')).toMatch(/^release\/$/m);
  });
});

describe('package.json metadata', () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as Record<string, unknown>;

  test('has what a deb needs: a description, an author and a homepage', () => {
    for (const field of ['description', 'author', 'homepage']) {
      expect(typeof manifest[field], field).toBe('string');
      expect(String(manifest[field]).length, field).toBeGreaterThan(0);
    }
  });

  test('names its desktop file, so the window is grouped under its launcher icon', () => {
    expect(manifest.desktopName).toBe('idlemanager.desktop');
    expect(scalar('syncDesktopName')).toBe('true');
  });

  test('the homepage is a placeholder that cannot resolve, not a link to someone else', () => {
    expect(String(manifest.homepage)).toMatch(/^https:\/\/[a-z0-9.-]+\.invalid(\/|$)/);
  });
});

describe('package.json scripts', () => {
  test('dist:linux builds the app first and then packages it', () => {
    const script = scripts['dist:linux'] ?? '';
    expect(script).toContain('npm run build');
    expect(script.indexOf('npm run build')).toBeLessThan(script.indexOf('electron-builder'));
    expect(script).toMatch(/--linux deb/);
  });
});
