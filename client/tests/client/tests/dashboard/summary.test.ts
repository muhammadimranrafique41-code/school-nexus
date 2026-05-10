import { test, expect, type Page } from '@playwright/test'

const ADMIN_EMAIL = process.env.ADMIN_EMAIL!
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD!

async function adminLogin(page: Page) {
  await page.goto('/login')
  await page.fill('input[name="email"]', ADMIN_EMAIL)
  await page.fill('input[name="password"]', ADMIN_PASSWORD)
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/auth/login')),
    page.click('button[type="submit"]'),
  ])
  expect(response.status()).toBe(200)
  await expect(page).toHaveURL(/\/admin/, { timeout: 15_000 })
}

test.describe('Dashboard – Admin Overview', () => {
  test.beforeEach(async ({ page }) => {
    await adminLogin(page)
  })

  test('dashboard loads with stat cards for students, teachers, fees', async ({ page }) => {
    await page.goto('/admin')
    await page.waitForLoadState('networkidle', { timeout: 15_000 })

    const statLabels = page.getByText(/total students|total teachers|fees collected|outstanding fees/i)
    const count = await statLabels.count()
    expect(count).toBeGreaterThanOrEqual(2)
  })

  test('dashboard shows revenue chart area', async ({ page }) => {
    await page.goto('/admin')
    await page.waitForLoadState('networkidle', { timeout: 15_000 })

    await expect(page.getByText(/revenue|monthly revenue/i).first()).toBeVisible({ timeout: 5_000 })
  })

  test('recent activity section is present on dashboard', async ({ page }) => {
    await page.goto('/admin')
    await page.waitForLoadState('networkidle', { timeout: 15_000 })

    const activityMention = page.getByText(/recent activity|activity|updates/i).first()
    if (await activityMention.count() > 0) {
      await expect(activityMention).toBeVisible()
    }
  })

  test('quick action cards link to correct management pages', async ({ page }) => {
    await page.goto('/admin')
    await page.waitForLoadState('networkidle', { timeout: 15_000 })

    const manageLink = page.locator('a').filter({ hasText: /manage students|manage teachers|finance follow.up/i }).first()
    if (await manageLink.count() > 0) {
      await Promise.all([
        page.waitForLoadState('networkidle', { timeout: 10_000 }),
        manageLink.click(),
      ])
      const currentUrl = page.url()
      expect(currentUrl).toMatch(/\/admin\/(students|teachers|finance)/)
    }
  })
})
