import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { STORED_ITEMS } from '../features/privacy/privacy-page';

/**
 * Guards the Privacy Notice (#416): every file that touches browser storage or cookies must be one we've reviewed and
 * listed in the notice. A new one fails here, so it's checked for consent and added to the notice (and to
 * docs/privacy/data-inventory.md) before it ships.
 */
const REVIEWED = new Set([
  'app/core/auth/auth.store.ts',
  'app/core/invitations/pending-invitation.ts',
  'app/core/theme/appearance.service.ts',
  'app/core/theme/event-themes.service.ts',
  'app/features/calendar/calendar-page.ts',
  'app/features/profiles/parent-pin-reset-page.ts',
]);

const KEY_PREFIXES = [
  'parenthesis.appearance.',
  'parenthesis.event-themes.',
  'parenthesis.calendar-filters.',
  'parenthesis.sharedDevice.declined:',
  'parenthesis.pendingInvitation',
  'parenthesis.parentPinReset',
];

const STORAGE_USE = /\b(localStorage|sessionStorage|indexedDB|document\.cookie|cookieStore)\b/;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return sources(path);
    }
    return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
  });
}

describe('browser storage inventory', () => {
  const root = join(process.cwd(), 'src');

  it('only reviewed files use browser storage or cookies', () => {
    const using = sources(join(root, 'app'))
      .filter((file) => STORAGE_USE.test(readFileSync(file, 'utf8')))
      .map((file) => relative(root, file).replaceAll('\\', '/'))
      .sort();

    expect(using).toEqual([...REVIEWED].sort());
  });

  it('lists every storage key in the Privacy Notice', () => {
    const listed = STORED_ITEMS.map((item) => item.name.replace('…', ''));
    for (const prefix of KEY_PREFIXES) {
      expect(listed).toContain(prefix);
    }
  });

  it('uses only the listed storage keys', () => {
    const keys = sources(join(root, 'app'))
      .flatMap((file) =>
        [...readFileSync(file, 'utf8').matchAll(/['`](parenthesis[.][A-Za-z-]+[.:]?)/g)].map(
          (m) => m[1],
        ),
      )
      .filter((key, index, all) => all.indexOf(key) === index);

    for (const key of keys) {
      expect(
        KEY_PREFIXES.some((prefix) => key.startsWith(prefix) || prefix.startsWith(key)),
        key,
      ).toBe(true);
    }
  });
});
