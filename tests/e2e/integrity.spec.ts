import { test, expect } from '@playwright/test';
import { pages } from './pages';

// Site-wide checks that hold on any machine: broken links and assets, script errors,
// and new-tab links that could control the page that opened them.
const SITE = 'https://ale-sanchez-g.github.io';

test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.route('https://fonts.gstatic.com/**', route => route.abort());
});

// Root-relative links always point into this repo. Absolute links to the live site only do when
// they are a page's own canonical or social metadata: other absolute links on the domain can be
// other repos' project sites (e.g. https://ale-sanchez-g.github.io/card/ from the Apps page).
// Everything else (external and in-page links) maps to null.
function localPath(ref: string, selfMetadata: boolean): string | null {
  const url = selfMetadata && ref.startsWith(SITE + '/') ? ref.slice(SITE.length) : ref;
  if (!url.startsWith('/') || url.startsWith('//')) return null;
  return url.split('#')[0].split('?')[0];
}

test.describe('Site integrity', () => {
  test('every internal link, image, stylesheet, script and social image resolves', async ({ page, request }, testInfo) => {
    test.skip(testInfo.project.name !== 'Desktop Chrome', 'Viewport-independent: one project is enough');
    const linkedFrom = new Map<string, string>();
    for (const pg of pages) {
      await page.goto(pg.path);
      const refs = await page.evaluate(() =>
        Array.from(document.querySelectorAll('a[href], img[src], link[href], script[src], meta[property^="og:"][content]'), el => ({
          ref: el.getAttribute('href') ?? el.getAttribute('src') ?? el.getAttribute('content') ?? '',
          selfMetadata: el.tagName === 'META' || el.getAttribute('rel') === 'canonical',
        })));
      for (const { ref, selfMetadata } of refs) {
        const path = localPath(ref, selfMetadata);
        if (path && !linkedFrom.has(path)) linkedFrom.set(path, pg.path);
      }
    }
    expect(linkedFrom.has('/assets/css/design.css'), 'the crawl found the shared stylesheet').toBe(true);
    for (const [path, from] of linkedFrom) {
      const response = await request.get(path);
      expect.soft(response.status(), `${path} (linked from ${from})`).toBe(200);
    }
  });

  test('in-page anchors point at an element on the same page', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Desktop Chrome', 'Viewport-independent: one project is enough');
    for (const pg of pages) {
      await page.goto(pg.path);
      const missing = await page.evaluate(() =>
        Array.from(document.querySelectorAll('a[href^="#"]'), a => a.getAttribute('href') ?? '')
          .filter(href => href.length > 1 && !document.getElementById(decodeURIComponent(href.slice(1)))));
      expect.soft(missing, `${pg.path} links to anchors that do not exist`).toEqual([]);
    }
  });

  test('every page loads without script errors or failed requests to this site', async ({ page, baseURL }) => {
    const origin = new URL(baseURL!).origin;
    const problems: string[] = [];
    page.on('pageerror', error => problems.push(`${page.url()}: ${error.message}`));
    page.on('console', message => {
      // Failed resource loads are reported by the response handler below.
      if (message.type() === 'error' && message.location().url.startsWith(origin) && !message.text().startsWith('Failed to load resource')) {
        problems.push(`${page.url()}: console error: ${message.text()}`);
      }
    });
    page.on('response', response => {
      if (response.url().startsWith(origin) && response.status() >= 400) {
        problems.push(`${page.url()}: HTTP ${response.status()} for ${response.url()}`);
      }
    });
    for (const pg of pages) {
      await page.goto(pg.path, { waitUntil: 'load' });
    }
    expect(problems).toEqual([]);
  });
});

test.describe('Security — links that open a new tab', () => {
  test('use rel="noopener", so the opened page cannot redirect this one', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Desktop Chrome', 'Viewport-independent: one project is enough');
    for (const pg of pages) {
      await page.goto(pg.path);
      const unsafe = await page.locator('a[target="_blank"]:not([rel~="noopener"]):not([rel~="noreferrer"])')
        .evaluateAll(links => links.map(a => a.getAttribute('href')));
      expect.soft(unsafe, `${pg.path} opens new tabs without rel="noopener"`).toEqual([]);
    }
  });
});
