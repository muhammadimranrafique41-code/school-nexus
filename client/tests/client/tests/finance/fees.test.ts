import { test, expect, type Page } from '@playwright/test';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL!;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD!;

async function adminLogin(page: Page) {
  await page.goto('/login');
  await page.fill('input[name="email"]', ADMIN_EMAIL);
  await page.fill('input[name="password"]', ADMIN_PASSWORD);
  const [response] = await Promise.all([
    page.waitForResponse(r => r.url().includes('/api/auth/login')),
    page.click('button[type="submit"]'),
  ]);
  expect(response.status()).toBe(200);
  await expect(page).toHaveURL(/\/admin/, { timeout: 15_000 });
}

test.describe('Finance — Fee Management', () => {
  test.beforeEach(async ({ page }) => {
    await adminLogin(page);
    await page.goto('/admin/finance');
    // Wait for the page to settle — finance page fetches multiple queries
    await page.waitForLoadState('networkidle', { timeout: 15_000 });
  });

  test('finance page renders without crashing', async ({ page }) => {
    // Page title or any top-level heading
    await expect(page.getByRole('heading').first()).toBeVisible();
    // No unhandled error boundary
    await expect(page.getByText(/something went wrong/i)).not.toBeVisible();
  });

  test('invoice table or empty state is visible', async ({ page }) => {
    const table = page.getByRole('table');
    const emptyState = page.getByText(/no (invoices|fees|records)/i);
    await expect(table.or(emptyState)).toBeVisible({ timeout: 10_000 });
  });

  test('create invoice button opens a dialog', async ({ page }) => {
    const createBtn = page
      .getByRole('button', { name: /create|new invoice|add fee/i })
      .first();
    // Skip if button not present (feature flag / empty state)
    if ((await createBtn.count()) === 0) return;
    await createBtn.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    // Close it
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('generate monthly fees button opens a dialog with month selector', async ({ page }) => {
    const btn = page.getByRole('button', { name: /generate monthly/i });
    if ((await btn.count()) === 0) return;
    await btn.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    // Month input or select must exist inside the dialog
    const monthInput = dialog.locator('input, select, [role="combobox"]').first();
    await expect(monthInput).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('invoice rows link to detail view', async ({ page }) => {
    const rows = page.getByRole('row');
    if ((await rows.count()) < 2) return; // no data rows
    // Click the first data row's action button or the row itself
    const actionBtn = rows.nth(1).getByRole('button').first();
    if ((await actionBtn.count()) > 0) {
      await actionBtn.click();
      // Either a dialog or navigation should occur
      const dialogOrNewContent = page
        .getByRole('dialog')
        .or(page.getByText(/invoice|receipt|INV-/i));
      await expect(dialogOrNewContent).toBeVisible({ timeout: 8_000 });
    }
  });
});
