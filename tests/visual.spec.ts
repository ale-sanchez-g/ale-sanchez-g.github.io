import { test, expect } from '@playwright/test';

// Block external font requests in every test to avoid ~40s network timeouts
// in offline/CI environments where fonts.googleapis.com is unreachable.
test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.route('https://fonts.gstatic.com/**', route => route.abort());
});

const pages = [
  { name: 'home',            path: '/index.html',                          title: 'Home' },
  { name: 'work-experience', path: '/reference/work-experience.html',       title: 'Work Experience' },
  { name: 'publications',    path: '/reference/publications.html',          title: 'Publications' },
  { name: 'conferences',     path: '/reference/conferences.html',           title: 'Conferences' },
  { name: 'learning',        path: '/reference/learning.html',              title: 'Learning Resources' },
  { name: 'apps',            path: '/reference/apps.html',                  title: 'Apps' },
  { name: 'aws-obs-summary', path: '/reference/sums/aws-obs-sum.html',     title: 'AWS Observability Day' },
  { name: 'support',         path: '/support/support-list.html',            title: 'Support Materials' },
  { name: 'fake-numbers',    path: '/support/fake-numbers.html',            title: 'Fake Phone Numbers' },
  { name: 'connections',     path: '/people/connections.html',              title: 'Connections' },
];

test.describe('Visual regression — full page', () => {
  for (const pg of pages) {
    test(`${pg.title}`, async ({ page }, testInfo) => {
      await page.goto(pg.path, { waitUntil: 'domcontentloaded' });

      // Allow time for layout to settle
      await page.waitForTimeout(300);

      // Hide fixed nav so scroll position doesn't affect baseline diffs
      await page.addStyleTag({
        content: `nav { position: relative !important; }`
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

      // Every page must have a visible h1
      await expect(page.locator('h1').first()).toBeVisible();

      const isMobile = (page.viewportSize()?.width ?? 1280) < 768;

      // The new unified nav is present on all pages
      await expect(page.locator('nav')).toBeVisible();

      if (isMobile) {
        // On mobile the nav-links are hidden; just confirm the logo is visible
        await expect(page.locator('.nav-logo')).toBeVisible();
      } else if (pg.path === '/index.html') {
        // Home page nav has section anchors, not page links
        await expect(page.locator('nav a[href*="about"]')).toBeVisible();
      } else {
        // Reference pages: nav Work Experience link must be visible
        await expect(page.locator('nav a[href*="work-experience"]')).toBeVisible();
      }

      // Footer must contain SLO Education link on every page
      await expect(page.locator('footer a[href*="slo-education"]')).toBeVisible();
    });
  }
});

test.describe('Navigation — back links', () => {
  test('Work Experience has back link to home', async ({ page }) => {
    await page.goto('/reference/work-experience.html');
    await expect(page.locator('.back-link')).toHaveAttribute('href', '/');
  });

  test('AWS Obs Summary has back link to Conferences', async ({ page }) => {
    await page.goto('/reference/sums/aws-obs-sum.html');
    await expect(page.locator('.back-link')).toHaveAttribute('href', '/reference/conferences.html');
  });

  test('Fake Numbers has back link to Support', async ({ page }) => {
    await page.goto('/support/fake-numbers.html');
    await expect(page.locator('.back-link')).toHaveAttribute('href', '/support/support-list.html');
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

  test('Capability cards are visible (6 cards)', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('.cap-card')).toHaveCount(6);
  });

  test('Achievement cards show 4 items', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('.ach-card')).toHaveCount(4);
  });

  test('LinkedIn and GitHub CTA links present in hero', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('.hero-cta a[href*="linkedin"]')).toBeVisible();
    await expect(page.locator('.hero-cta a[href*="github"]')).toBeVisible();
  });

  test('Industries list has 7 items', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('.industry-item')).toHaveCount(7);
  });

  test('Contact section links to all reference pages', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('#contact a[href*="work-experience"]')).toBeVisible();
    await expect(page.locator('#contact a[href*="publications"]')).toBeVisible();
    await expect(page.locator('#contact a[href*="conferences"]')).toBeVisible();
    await expect(page.locator('#contact a[href*="learning"]')).toBeVisible();
    await expect(page.locator('#contact a[href*="support-list"]')).toBeVisible();
  });
});

test.describe('Inner pages — nav links', () => {
  const navPages = [
    '/reference/work-experience.html',
    '/reference/publications.html',
    '/reference/conferences.html',
    '/reference/learning.html',
    '/reference/apps.html',
    '/support/support-list.html',
  ];

  for (const path of navPages) {
    test(`${path} has full nav`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('domcontentloaded');
      // All main nav destinations must be linked
      await expect(page.locator('.nav-links a[href="/"]')).toBeAttached();
      await expect(page.locator('nav a[href*="work-experience"]')).toBeAttached();
      await expect(page.locator('nav a[href*="publications"]')).toBeAttached();
      await expect(page.locator('nav a[href*="conferences"]')).toBeAttached();
      await expect(page.locator('nav a[href*="learning"]')).toBeAttached();
      await expect(page.locator('nav a[href*="apps"]')).toBeAttached();
      await expect(page.locator('nav a[href*="support-list"]')).toBeAttached();
    });
  }
});
