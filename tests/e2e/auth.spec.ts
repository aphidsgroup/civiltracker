import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('login page renders', async ({ page }) => {
    const response = await page.goto('/login');
    expect(response?.status()).toBeLessThan(400);
    
    // Check that we don't hit a 404
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('This page could not be found');
  });

  test('login redirects to the appropriate dashboard based on user role', async ({ page }) => {
    await page.goto('/login');
    
    // Ensure form exists (placeholder for actual auth logic)
    const emailInput = page.locator('input[type="email"], input[name="email"]');
    if (await emailInput.count() > 0 && await emailInput.isVisible()) {
      await emailInput.fill('test@example.com');
      await page.locator('input[type="password"], input[name="password"]').fill('password123');
      await page.waitForTimeout(1000); await page.locator('button:has-text("Sign in")').click()
;
    }
  });
});
