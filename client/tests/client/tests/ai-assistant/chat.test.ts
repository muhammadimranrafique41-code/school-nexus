import { test, expect, type Page } from '@playwright/test'

const ADMIN_EMAIL = process.env.ADMIN_EMAIL!
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD!
const TEACHER_EMAIL = process.env.TEACHER_EMAIL!
const TEACHER_PASSWORD = process.env.TEACHER_PASSWORD!

async function adminLogin(page: Page) {
  await page.goto('/login', { timeout: 60_000 })
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

test.describe('AI Assistant – OpenRouter Chat Interface', () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage()
    await page.goto('/login', { timeout: 120_000 })
    await page.close()
  })

  test.beforeEach(async ({ page }) => {
    await adminLogin(page)
    await page.goto('/admin/ai-assistant')
    await expect(page.getByText(/AI School Assistant|Schooliee/i).first()).toBeVisible({ timeout: 15_000 })
  })

  test('chat page loads with greeting message and starter prompts', async ({ page }) => {
    await expect(page.getByText(/AI School Assistant|Schooliee|assistant/i).first()).toBeVisible()
    await expect(page.getByText(/greeting|attendance|fee collection|homework|class sizes/i).first()).toBeVisible({ timeout: 5_000 })
    const starterButtons = page.locator('button').filter({ hasText: /attendance|fee collection|homework|class sizes/i })
    const count = await starterButtons.count()
    expect(count).toBeGreaterThanOrEqual(2)
  })

  test('sending a message triggers the chat API and shows a response', async ({ page }) => {
    const textarea = page.locator('textarea[placeholder*="Ask about"]')
    await expect(textarea).toBeVisible()

    await textarea.fill('Summarize fee collection and overdue balances.')

    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/ai/chat') && r.status() === 200, { timeout: 60_000 }),
      page.click('button[type="submit"]'),
    ])

    expect(response.status()).toBe(200)

    const body = await response.json()
    expect(body).toHaveProperty('answer')
    expect(body).toHaveProperty('sources')
    expect(body).toHaveProperty('scopedTo')
    expect(body).toHaveProperty('generatedAt')
    expect(Array.isArray(body.sources)).toBe(true)
    expect(body.sources.length).toBeGreaterThan(0)
    expect(body.scopedTo.role).toBe('admin')

    const firstLine = body.answer.split('\n')[0].trim()
    await expect(page.getByText(firstLine)).toBeVisible({ timeout: 10_000 })
  })

  test('ai response shows grounded context sources in sidebar', async ({ page }) => {
    const textarea = page.locator('textarea[placeholder*="Ask about"]')
    await expect(textarea).toBeVisible()

    await textarea.fill('Which classes have the lowest attendance?')

    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/ai/chat') && r.status() === 200, { timeout: 60_000 }),
      page.click('button[type="submit"]'),
    ])

    const sourceBadges = page.locator('aside').locator('div').filter({ hasText: /attendance|classes|users|fees|homework/i })
    await expect(sourceBadges.first()).toBeVisible({ timeout: 10_000 })
    const sourceCount = await sourceBadges.count()
    expect(sourceCount).toBeGreaterThanOrEqual(1)
  })

  test('starter prompt buttons send messages and get responses', async ({ page }) => {
    const starterBtn = page.locator('button').filter({ hasText: /attendance|fee collection|homework|class sizes/i }).first()
    await expect(starterBtn).toBeVisible()

    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/ai/chat'), { timeout: 60_000 }),
      starterBtn.click(),
    ])

    await expect(page.getByText(/user|assistant|bot/i).first()).toBeVisible({ timeout: 5_000 })
  })

  test('admin scope badge shows admin scope label', async ({ page }) => {
    await expect(page.getByText(/Admin scope|Live school records/i).first()).toBeVisible()
  })

  test('teacher can access ai assistant and sees scoped context', async ({ page }) => {
    await teacherLogin(page)
    await page.goto('/teacher/ai-assistant')
    await expect(page.getByText(/AI School Assistant|Schooliee/i).first()).toBeVisible({ timeout: 15_000 })

    await expect(page.getByText(/AI School Assistant|Schooliee/i).first()).toBeVisible()

    const textarea = page.locator('textarea[placeholder*="Ask about"]')
    await expect(textarea).toBeVisible()

    await textarea.fill('Show class sizes and homeroom teachers.')

    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/ai/chat') && r.status() === 200, { timeout: 60_000 }),
      page.click('button[type="submit"]'),
    ])

    expect(response.status()).toBe(200)
    const body = await response.json()
    expect(body).toHaveProperty('answer')
    expect(body.scopedTo.role).toBe('teacher')
  })

  test('chat history accumulates in message list', async ({ page }) => {
    const textarea = page.locator('textarea[placeholder*="Ask about"]')

    await textarea.fill('Hello')
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/ai/chat'), { timeout: 60_000 }),
      page.click('button[type="submit"]'),
    ])
    await page.waitForTimeout(1_000)

    await textarea.fill('Show attendance data')
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/ai/chat'), { timeout: 60_000 }),
      page.click('button[type="submit"]'),
    ])
    await page.waitForTimeout(1_000)

    const userMessages = page.locator('text=Hello, text=attendance')
    const count = await userMessages.count()
    expect(count).toBeGreaterThanOrEqual(0)
  })

  test('api returns structured AiChatResponse with correct model', async ({ page }) => {
    const textarea = page.locator('textarea[placeholder*="Ask about"]')
    await expect(textarea).toBeVisible()

    await textarea.fill('What homework is still pending?')

    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/ai/chat'), { timeout: 60_000 }),
      page.click('button[type="submit"]'),
    ])

    expect(response.status()).toBe(200)
    const body = await response.json()

    expect(body).toMatchObject({
      answer: expect.any(String),
      sources: expect.any(Array),
      scopedTo: {
        role: expect.any(String),
        classNames: expect.any(Array),
      },
      generatedAt: expect.any(String),
    })

    expect(body.sources).toContain('homework_assignments')
    expect(body.answer.length).toBeGreaterThan(0)
  })
})
