import { test, expect } from '@playwright/test';

test('homepage loads and shows title', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/MasePOS/);
  await expect(page.locator('text=Staff Login')).toBeVisible();
});
