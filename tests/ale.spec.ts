import { test, expect } from '@playwright/test';

test('Alej Page Check', async ({ page }) => {
  await page.goto('/');

  await page.click('text=Work Experience');
  await page.click('text=Back Home');

  (await page.waitForSelector('text=Publication')).click();
  await page.click('text=Back Home');

  (await page.waitForSelector('text=Conferences')).click();
  await page.click('text=Back Home');

  (await page.waitForSelector('text=Learning')).click();
  await page.click('text=Back Home');

  (await page.waitForSelector('text=Support')).click();
  await page.click('text=Back Home');
});
