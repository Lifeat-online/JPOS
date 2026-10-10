import { test, expect, type Page } from "@playwright/test";

// Regression specs for the mobile-first terminal overhaul (commit 1545f52).
// These pin the layout contracts at phone/tablet/desktop viewports so
// future changes cannot silently reintroduce the "chrome covers the
// screen" problem on small devices.
//
// Deliberately data-independent: no products/customers are created, so
// these run against any freshly-bootstrapped database.

const DEV_EMAIL = process.env.E2E_EMAIL || "dev@masepos.local";
const DEV_PASSWORD = process.env.E2E_PASSWORD || "dev-change-me";

async function signIn(page: Page) {
  // Narrow viewports hide the login entry inside the header menu.
  const adminLogin = page.getByRole("button", { name: /admin login/i }).first();
  if (!(await adminLogin.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: /open menu/i }).click();
  }
  await adminLogin.click();
  await page.locator("#login-email").fill(DEV_EMAIL);
  await page.locator("#login-password").fill(DEV_PASSWORD);
  await page.locator("button:has-text('Sign In')").click();
}

// Authenticated POS shell marker: the cart FAB renders only in the header
// on <lg viewports; the "Current Order" side panel renders on lg+. Either
// confirms a successful login into the terminal.
const POS_SHELL = 'button[aria-label="Open cart"], aside:has-text("Current Order")';

async function login(page: Page) {
  await page.goto("/");
  await signIn(page);
  await page.locator(POS_SHELL).first().waitFor({ timeout: 20000 });
}

test.describe("phone viewport (375x667)", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("navigation docks to the bottom, not under the header", async ({ page }) => {
    await login(page);
    const tabBar = page.locator("nav.order-last");
    await expect(tabBar).toBeVisible();
    const box = await tabBar.boundingBox();
    expect(box).not.toBeNull();
    // Bottom tab bar must live in the lower quarter of the screen.
    expect(box!.y).toBeGreaterThan(667 * 0.7);
    // And must not extend past the viewport (safe-area respected).
    expect(box!.y + box!.height).toBeLessThanOrEqual(667);
  });

  test("POS header stays compact: desktop-only controls are hidden", async ({ page }) => {
    await login(page);
    // Exactly one reachable "Last receipt" control at this width: the
    // compact chip — not the desktop sm:w-44 button.
    const receiptButtons = page.getByRole("button", { name: /last receipt/i });
    await expect(receiptButtons.first()).toBeVisible();
    const visibleCount = await receiptButtons.evaluateAll(
      (els) => els.filter((el) => (el as HTMLElement).offsetParent !== null).length,
    );
    expect(visibleCount).toBe(1);
  });

  test("cart sheet opens capped well below the viewport height", async ({ page }) => {
    await login(page);
    await page.locator('button[aria-label="Open cart"]').click();
    await page.getByText("Current Order").first().waitFor({ timeout: 10000 });
    const sheet = page.locator('aside', { hasText: 'Current Order' }).first();
    await expect(sheet).toBeVisible();
    const box = await sheet.boundingBox();
    expect(box).not.toBeNull();
    // 70dvh cap: the sheet must never swallow the whole screen.
    expect(box!.height).toBeLessThanOrEqual(667 * 0.72);
  });
});

test.describe("tablet viewport (820x1180)", () => {
  test.use({ viewport: { width: 820, height: 1180 } });

  test("bottom navigation remains available", async ({ page }) => {
    await login(page);
    await expect(page.locator("nav.order-last")).toBeVisible();
  });
});

test.describe("desktop viewport (1440x900)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("cart is a persistent side panel docked right", async ({ page }) => {
    await login(page);
    const sheet = page.locator('aside', { hasText: 'Current Order' }).first();
    await expect(sheet).toBeVisible();
    const box = await sheet.boundingBox();
    expect(box).not.toBeNull();
    // Side panel width ≈ 360px, docked right.
    expect(box!.width).toBeGreaterThan(300);
    expect(box!.width).toBeLessThan(420);
    expect(box!.x).toBeGreaterThan(1440 - 400);
  });
});
