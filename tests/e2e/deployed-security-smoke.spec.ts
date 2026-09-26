import { expect, test } from '@playwright/test'

test.describe('deployed security smoke checks', () => {
  test('health is reachable without exposing maintenance details', async ({ request }) => {
    const response = await request.get('/api/health')
    expect(response.status()).toBe(200)
    const body = await response.json()
    expect(body.status).toBe('ok')
  })

  test('dashboard requires authentication', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login/)
  })

  test('removed force-migration endpoint is not publicly successful', async ({ request }) => {
    const response = await request.get('/api/health/db-force-migrate')
    expect(response.status()).not.toBe(200)
    expect(response.status()).not.toBe(201)
    expect(response.status()).not.toBe(202)
    expect(response.status()).not.toBe(204)
  })
})
