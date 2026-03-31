import { test, expect } from '@playwright/test';

const pages = [
  { name: 'home',            path: '/index.html',                          title: 'Home' },
  { name: 'work-experience', path: '/reference/WORKEXPERIENCE.html',       title: 'Work Experience' },
  { name: 'publications',    path: '/reference/PUBLICATIONS.html',          title: 'Publications' },
  { name: 'conferences',     path: '/reference/CONFERENCES.html',           title: 'Conferences' },
  { name: 'learning',        path: '/reference/LEARNING.html',              title: 'Learning Resources' },
  { name: 'apps',            path: '/reference/APPS.html',                  title: 'Apps' },
  { name: 'aws-obs-summary', path: '/reference/sums/AWS_OBS_SUM.html',     title: 'AWS Observability Day' },
  { name: 'support',         path: '/support/SUPPORTLIST.html',             title: 'Support Materials' },
  { name: 'fake-numbers',    path: '/support/FAKENUMBERS.html',             title: 'Fake Phone Numbers' },
  { name: 'connections',     path: '/people/CONNECTIONS.html',              title: 'Connections' },
];

test.describe('Visual regression — full page', () => {
  for (const pg of pages) {
    test(`${pg.title}`, async ({ page }, testInfo) => {
      await page.goto(pg.path, { waitUntil: 'domcontentloaded' });

      // Allow time for fonts and layout to settle
      await page.waitForTimeout(500);

      // Hide sticky header so scroll position doesn't affect baseline diffs
      await page.addStyleTag({
        content: `
          .mega-menu { position: relative !important; }
          .mega-menu-2 { position: relative !important; }
        `
      });

      const screenshot = await page.screenshot({ fullPage: true, animations: 'disabled' });

      // Attach to the test report so it's visible in CI artifacts
      await testInfo.attach(`${pg.name}-screenshot`, {
        body: screenshot,
        contentType: 'image/png',
      });

      await expect(page).toHaveScreenshot(`${pg.name}.png`, { fullPage: true });
    });
  }
});

test.describe('Navigation — links and titles', () => {
  for (const pg of pages) {
    test(`${pg.title} loads correctly`, async ({ page }) => {
      await page.goto(pg.path);
      await page.waitForLoadState('domcontentloaded');

      // Page must have a visible hero h1
      const heading = page.locator('h1').first();
      await expect(heading).toBeVisible();

      // On desktop the horizontal nav bar is visible; on mobile it is hidden and
      // replaced by the burger menu. Check whichever is present.
      const isMobile = page.viewportSize()?.width !== undefined && page.viewportSize()!.width < 768;
      if (isMobile) {
        await expect(page.locator('.burger')).toBeVisible();
        await expect(page.locator('.mobile-menu-items a[href*="WORKEXPERIENCE"]')).toBeAttached();
      } else {
        await expect(page.locator('.mega-menu-2')).toBeVisible();
        await expect(page.locator('.mega-menu-2 a[href*="WORKEXPERIENCE"]')).toBeVisible();
      }

      // Footer must contain SLO Education link
      await expect(page.locator('footer a[href*="slo-education"]')).toBeVisible();
    });
  }
});

test.describe('Navigation — back links', () => {
  test('Work Experience has back link to home', async ({ page }) => {
    await page.goto('/reference/WORKEXPERIENCE.html');
    await expect(page.locator('.back-link')).toHaveAttribute('href', '/');
  });

  test('AWS Obs Summary has back link to Conferences', async ({ page }) => {
    await page.goto('/reference/sums/AWS_OBS_SUM.html');
    await expect(page.locator('.back-link')).toHaveAttribute('href', '/reference/CONFERENCES.html');
  });

  test('Fake Numbers has back link to Support', async ({ page }) => {
    await page.goto('/support/FAKENUMBERS.html');
    await expect(page.locator('.back-link')).toHaveAttribute('href', '/support/SUPPORTLIST.html');
  });
});

test.describe('Home page — key sections', () => {
  test('SLO Education banner is visible with correct link', async ({ page }) => {
    await page.goto('/index.html');
    const banner = page.locator('.slo-banner');
    await expect(banner).toBeVisible();
    await expect(banner.locator('a')).toHaveAttribute('href', 'https://slo-education.com.au');
    await expect(banner.locator('.slo-banner-badge')).toContainText('Editor');
  });

  test('Role cards are visible', async ({ page }) => {
    await page.goto('/index.html');
    const cards = page.locator('.role-card');
    await expect(cards).toHaveCount(3);
  });

  test('Achievements list has 4 items', async ({ page }) => {
    await page.goto('/index.html');
    const items = page.locator('.achievements-list li');
    await expect(items).toHaveCount(4);
  });

  test('LinkedIn and GitHub social links present', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('.hero-social a[href*="linkedin"]')).toBeVisible();
    await expect(page.locator('.hero-social a[href*="github"]')).toBeVisible();
  });
});
