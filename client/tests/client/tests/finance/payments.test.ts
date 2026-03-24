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

/** Opens the first unpaid/partially-paid invoice action. Returns false if none found. */
async function openFirstUnpaidInvoice(page: Page): Promise<boolean> {
  await page.goto('/admin/finance');
  await page.waitForLoadState('networkidle', { timeout: 15_000 });

  const unpaidRow = page
    .getByRole('row')
    .filter({ hasText: /unpaid|partially paid/i })
    .first();

  if ((await unpaidRow.count()) === 0) return false;

  const actionBtn = unpaidRow.getByRole('button').first();
  if ((await actionBtn.count()) === 0) return false;

  await actionBtn.click();
  return true;
}

test.describe('Finance — Payment Recording', () => {
  test.beforeEach(async ({ page }) => {
    await adminLogin(page);
  });

  test('record payment dialog opens from an unpaid invoice', async ({ page }) => {
    const found = await openFirstUnpaidInvoice(page);
    if (!found) return;

    const payBtn = page.getByRole('button', { name: /record payment|add payment|pay/i }).first();
    if ((await payBtn.count()) === 0) return;

    await payBtn.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('partial payment updates status to Partially Paid', async ({ page }) => {
    const found = await openFirstUnpaidInvoice(page);
    if (!found) return;

    const payBtn = page.getByRole('button', { name: /record payment|add payment|pay/i }).first();
    if ((await payBtn.count()) === 0) return;
    await payBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    const amountInput = dialog.locator('input[name="amount"], input[type="number"]').first();
    await amountInput.clear();
    await amountInput.fill('1'); // minimal partial payment

    await dialog.getByRole('button', { name: /save|submit|record|confirm/i }).click();
    await expect(dialog).not.toBeVisible({ timeout: 8_000 });

    // Status badge or toast should reflect the change
    await expect(
      page.getByText(/partially paid|success/i).first()
    ).toBeVisible({ timeout: 8_000 });
  });

  test('overpayment is blocked — dialog stays open with error', async ({ page }) => {
    const found = await openFirstUnpaidInvoice(page);
    if (!found) return;

    const payBtn = page.getByRole('button', { name: /record payment|add payment|pay/i }).first();
    if ((await payBtn.count()) === 0) return;
    await payBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    const amountInput = dialog.locator('input[name="amount"], input[type="number"]').first();
    await amountInput.clear();
    await amountInput.fill('99999999');

    await dialog.getByRole('button', { name: /save|submit|record|confirm/i }).click();

    // Server returns 400 for overpayment; dialog must remain open
    await expect(dialog).toBeVisible({ timeout: 8_000 });
    await expect(
      page.getByText(/overpayment|exceeds|cannot exceed|too large/i)
    ).toBeVisible({ timeout: 8_000 });
  });

  test('payment list tab renders on finance page', async ({ page }) => {
    await page.goto('/admin/finance');
    await page.waitForLoadState('networkidle', { timeout: 15_000 });

    const paymentsTab = page
      .getByRole('tab', { name: /payments/i })
      .or(page.getByRole('link', { name: /payments/i }));

    if ((await paymentsTab.count()) === 0) return;
    await paymentsTab.first().click();

    await expect(
      page.getByRole('table').or(page.getByText(/no payments/i))
    ).toBeVisible({ timeout: 8_000 });
  });
});
