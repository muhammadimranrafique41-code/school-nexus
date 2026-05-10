import { test, expect } from "@playwright/test"

test.describe("School Nexus Module Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/")
  })

  test("navigates from /dashboard to /attendance", async ({ page }) => {
    await page.goto("/dashboard")
    await expect(page.locator("h1")).toContainText("Dashboard")

    await page.click('a[href="/attendance"]')
    await expect(page).toHaveURL(/\/attendance/)
    await expect(page.locator("h1")).toContainText("Attendance")
  })

  test("navigates from /attendance to /finance", async ({ page }) => {
    await page.goto("/attendance")
    await expect(page.locator("h1")).toContainText("Attendance")

    await page.click('a[href="/finance"]')
    await expect(page).toHaveURL(/\/finance/)
    await expect(page.locator("h1")).toContainText("Finance")
  })

  test("navigates from /finance to /homework", async ({ page }) => {
    await page.goto("/finance")
    await expect(page.locator("h1")).toContainText("Finance")

    await page.click('a[href="/homework"]')
    await expect(page).toHaveURL(/\/homework/)
    await expect(page.locator("h1")).toContainText("Homework")
  })

  test("completes full navigation flow: /dashboard → /attendance → /finance → /homework", async ({ page }) => {
    await page.goto("/dashboard")
    await expect(page.locator("h1")).toContainText("Dashboard")

    await page.click('a[href="/attendance"]')
    await expect(page).toHaveURL(/\/attendance/)
    await expect(page.locator("h1")).toContainText("Attendance")

    await page.click('a[href="/finance"]')
    await expect(page).toHaveURL(/\/finance/)
    await expect(page.locator("h1")).toContainText("Finance")

    await page.click('a[href="/homework"]')
    await expect(page).toHaveURL(/\/homework/)
    await expect(page.locator("h1")).toContainText("Homework")
  })

  test("sidebar navigation links are visible", async ({ page }) => {
    await page.goto("/dashboard")
    await expect(page.locator('a[href="/dashboard"]')).toBeVisible()
    await expect(page.locator('a[href="/attendance"]')).toBeVisible()
    await expect(page.locator('a[href="/finance"]')).toBeVisible()
    await expect(page.locator('a[href="/homework"]')).toBeVisible()
  })
})
