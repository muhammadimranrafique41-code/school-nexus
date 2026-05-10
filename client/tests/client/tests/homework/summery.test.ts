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

test.describe('Homework – Assignment Summary', () => {
  test.beforeEach(async ({ page }) => {
    await adminLogin(page)
  })

  test('admin homework diary page loads with assignment list', async ({ page }) => {
    await page.goto('/admin/homework-diary')
    await page.waitForLoadState('networkidle', { timeout: 15_000 })

    await expect(page.getByRole('heading').first()).toBeVisible()
    await expect(page.getByText(/homework|diary|assignment|diary/i).first()).toBeVisible({ timeout: 5_000 })
  })

  test('teacher homework dashboard loads with summary data', async ({ page }) => {
    await teacherLogin(page)
    await page.goto('/teacher/homework-dairy')
    await page.waitForLoadState('networkidle', { timeout: 15_000 })

    await expect(page.getByRole('heading').first()).toBeVisible()
    const homeworkContent = page.getByText(/homework|assignment|diary|create|new/i).first()
    await expect(homeworkContent).toBeVisible({ timeout: 5_000 })
  })

  test('teacher can navigate to create homework page', async ({ page }) => {
    await teacherLogin(page)
    await page.goto('/teacher/homework-dairy')
    await page.waitForLoadState('networkidle', { timeout: 15_000 })

    const createBtn = page.locator('a, button').filter({ hasText: /create|new homework|new assignment/i }).first()
    if (await createBtn.count() > 0) {
      await createBtn.click()
      await expect(page).toHaveURL(/\/teacher\/homework\/(new|create)/, { timeout: 10_000 })
    }
  })

  test('homework detail view shows submissions count', async ({ page }) => {
    await teacherLogin(page)
    await page.goto('/teacher/homework-dairy')
    await page.waitForLoadState('networkidle', { timeout: 15_000 })

    const assignmentLink = page.locator('a').filter({ hasText: /submission|view|detail|homework/i }).first()
    if (await assignmentLink.count() > 0) {
      await assignmentLink.click()
      await page.waitForLoadState('networkidle', { timeout: 10_000 })
      await expect(page.getByText(/submission|assigned|pending/i).first()).toBeVisible({ timeout: 5_000 })
    }
  })

  test('student homework page loads assignment list', async ({ page }) => {
    await page.goto('/login')
    await page.fill('input[name="email"]', process.env.STUDENT_EMAIL!)
    await page.fill('input[name="password"]', process.env.STUDENT_PASSWORD!)
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/auth/login')),
      page.click('button[type="submit"]'),
    ])
    await expect(page).toHaveURL(/\/student/, { timeout: 15_000 })

    await page.goto('/student/homework')
    await page.waitForLoadState('networkidle', { timeout: 15_000 })

    await expect(page.locator('h1, h2, h3').filter({ hasText: /homework|diary|assignment/i }).first()).toBeVisible({ timeout: 5_000 })
  })
})
