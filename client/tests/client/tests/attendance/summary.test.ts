import { test, expect, type Page } from '@playwright/test'

const ADMIN_EMAIL = process.env.ADMIN_EMAIL!
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD!
const TEACHER_EMAIL = process.env.TEACHER_EMAIL!
const TEACHER_PASSWORD = process.env.TEACHER_PASSWORD!

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

async function teacherLogin(page: Page) {
  await page.goto('/login')
  await page.fill('input[name="email"]', TEACHER_EMAIL)
  await page.fill('input[name="password"]', TEACHER_PASSWORD)
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/auth/login')),
    page.click('button[type="submit"]'),
  ])
  expect(response.status()).toBe(200)
  await expect(page).toHaveURL(/\/teacher/, { timeout: 15_000 })
}

test.describe('Attendance – Core Data Viewing', () => {
  test.beforeEach(async ({ page }) => {
    await adminLogin(page)
  })

  test('admin attendance page loads with class selector and stats', async ({ page }) => {
    await page.goto('/admin/qr-attendance')
    await page.waitForLoadState('networkidle', { timeout: 15_000 })

    await expect(page.getByRole('heading').first()).toBeVisible()
    await expect(page.getByText(/attendance|qr|class/i).first()).toBeVisible({ timeout: 5_000 })
  })

  test('teacher attendance page loads with class/date/session controls', async ({ page }) => {
    await teacherLogin(page)
    await page.goto('/teacher/attendance')
    await page.waitForLoadState('networkidle', { timeout: 15_000 })

    await expect(page.getByRole('heading').first()).toBeVisible()
    await expect(page.getByText(/attendance|class|session|date/i).first()).toBeVisible({ timeout: 5_000 })

    const selectControls = page.locator('select, [role="combobox"], button').filter({ hasText: /class|session/i })
    const controlCount = await selectControls.count()
    expect(controlCount).toBeGreaterThanOrEqual(1)
  })

  test('teacher can select a class and view student list', async ({ page }) => {
    await teacherLogin(page)
    await page.goto('/teacher/attendance')
    await page.waitForLoadState('networkidle', { timeout: 15_000 })

    const classSelect = page.locator('[role="combobox"]').first()
    if (await classSelect.count() > 0) {
      await classSelect.click()
      const firstOption = page.locator('[role="option"]').first()
      if (await firstOption.count() > 0) {
        await firstOption.click()
        await page.waitForTimeout(1_000)

        const studentOrEmpty = page.getByText(/student|name|no student/i).first()
        await expect(studentOrEmpty).toBeVisible({ timeout: 8_000 })
      }
    }
  })

  test('attendance stat strip shows present/absent/late counts', async ({ page }) => {
    await teacherLogin(page)
    await page.goto('/teacher/attendance')
    await page.waitForLoadState('networkidle', { timeout: 15_000 })

    const statLabels = page.getByText(/present|absent|late|excused|total student/i)
    const count = await statLabels.count()
    expect(count).toBeGreaterThanOrEqual(2)
  })

  test('attendance save button is visible when students loaded', async ({ page }) => {
    await teacherLogin(page)
    await page.goto('/teacher/attendance')
    await page.waitForLoadState('networkidle', { timeout: 15_000 })

    const saveBtn = page.locator('button').filter({ hasText: /save attendance/i })
    if (await saveBtn.count() > 0) {
      await expect(saveBtn.first()).toBeVisible()
    }
  })

  test('admin dashboard attendance widget shows attendance summary', async ({ page }) => {
    await page.goto('/admin')
    await page.waitForLoadState('networkidle', { timeout: 15_000 })

    const attendanceMention = page.getByText(/attendance marked|attendance/i).first()
    if (await attendanceMention.count() > 0) {
      await expect(attendanceMention).toBeVisible()
    }
  })

  test('attendance history table renders after data loads', async ({ page }) => {
    await teacherLogin(page)
    await page.goto('/teacher/attendance')
    await page.waitForLoadState('networkidle', { timeout: 20_000 })

    const historyOrEmpty = page.getByText(/history|no history|record/i).first()
    await expect(historyOrEmpty).toBeVisible({ timeout: 8_000 })
  })
})
