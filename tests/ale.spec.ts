import { test, expect } from '@playwright/test';

test('Alej Page Check', async ({ page }) => {
  await page.goto('/');

  await page.click('#contact a[href="/reference/work-experience.html"]');
  await page.click('text=Back Home');

  await page.click('#contact a[href="/reference/publications.html"]');
  await page.click('text=Back Home');

  await page.click('#contact a[href="/reference/conferences.html"]');
  await page.click('text=Back Home');

  await page.click('#contact a[href="/reference/learning.html"]');
  await page.click('text=Back Home');

  await page.click('#contact a[href="/support/support-list.html"]');
  await page.click('text=Back Home');
});
