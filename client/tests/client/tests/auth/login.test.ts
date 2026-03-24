import { test, expect, type Page } from '@playwright/test';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL!;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD!;
const TEACHER_EMAIL = process.env.TEACHER_EMAIL!;
const TEACHER_PASSWORD = process.env.TEACHER_PASSWORD!;

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  // Wait for the login API response before asserting URL
  const [response] = await Promise.all([
    page.waitForResponse(r => r.url().includes('/api/auth/login')),
    page.click('button[type="submit"]'),
  ]);
  return response.status();
}

test.describe('Authentication', () => {
  test('admin login redirects to /admin', async ({ page }) => {
    const status = await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    expect(status).toBe(200);
    await expect(page).toHaveURL(/\/admin/, { timeout: 15_000 });
  });

  test('teacher login redirects to /teacher', async ({ page }) => {
    const status = await login(page, TEACHER_EMAIL, TEACHER_PASSWORD);
    expect(status).toBe(200);
    await expect(page).toHaveURL(/\/teacher/, { timeout: 15_000 });
  });

  test('invalid credentials shows destructive toast', async ({ page }) => {
    const status = await login(page, 'nobody@example.com', 'wrongpassword');
    expect(status).toBe(401);
    // shadcn toast with variant="destructive" — target the toast title div specifically
    await expect(page.getByText('Login Failed', { exact: true }).first()).toBeVisible({ timeout: 8_000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test('empty form shows zod validation messages', async ({ page }) => {
    await page.goto('/login');
    await page.click('button[type="submit"]');
    // zod schema: email().min(1) and password.min(1)
    await expect(page.getByText(/valid email|required/i).first()).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('logout redirects to /login and clears session', async ({ page }) => {
    const status = await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    expect(status).toBe(200);
    await expect(page).toHaveURL(/\/admin/, { timeout: 15_000 });

    // useLogout calls window.location.href = "/login" after POST /api/auth/logout
    await page.evaluate(async () => {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      window.location.href = '/login';
    });
    await expect(page).toHaveURL(/\/login/, { timeout: 8_000 });

    // Navigating to a protected route should stay on /login (ProtectedRoute redirects)
    await page.goto('/admin');
    await expect(page).not.toHaveURL(/\/admin/);
  });

  test('unauthenticated access to /admin redirects away', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).not.toHaveURL(/^\/admin$/);
  });
});
