// eslint-disable-next-line @typescript-eslint/no-require-imports
const { chromium, devices } = require('playwright');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ ...devices['iPhone 12'] }); // 390x844
  const page = await context.newPage();
  
  const baseUrl = 'https://civiltracker.buildogram.in';
  const outDir = 'test-results/screenshots/phase-7-2b-production-audit/';
  fs.mkdirSync(outDir, { recursive: true });

  // Login as Company Admin to access pages
  await page.goto(`${baseUrl}/login`);
  await page.fill('input[name="email"]', 'admin@techcorp.com');
  await page.fill('input[name="password"]', 'password123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard');

  const pagesToScreenshot = [
    { name: 'dashboard', url: '/dashboard' },
    { name: 'approvals', url: '/approvals' },
    { name: 'mobile_approvals', url: '/mobile/approvals' },
    // we don't have seeded approval id handy, so skip detail unless we fetch it
  ];

  for (const p of pagesToScreenshot) {
    await page.goto(`${baseUrl}${p.url}`);
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${outDir}${p.name}.png` });
  }

  // Client Portal
  const clientContext = await browser.newContext({ ...devices['iPhone 12'] });
  const clientPage = await clientContext.newPage();
  await clientPage.goto(`${baseUrl}/login`);
  await clientPage.fill('input[name="email"]', 'contact@client.com');
  await clientPage.fill('input[name="password"]', 'password123');
  await clientPage.click('button[type="submit"]');
  await clientPage.waitForURL('**/client-portal');
  await clientPage.waitForTimeout(2000);
  await clientPage.screenshot({ path: `${outDir}client_portal.png` });

  await browser.close();
})();
