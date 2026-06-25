const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.playwright.local', override: true });

const viewports = [
  { width: 375, height: 667, name: '375px' },
  { width: 390, height: 844, name: '390px' },
  { width: 768, height: 1024, name: '768px' },
  { width: 1440, height: 900, name: '1440px' }
];

const paths = [
  '/super-admin/companies',
  '/super-admin/companies/new',
  '/super-admin/companies/clr7abc123', // Will be replaced by actual ID if needed, or 404
  '/super-admin/companies/clr7abc123/users',
  '/super-admin/companies/clr7abc123/sites',
  '/sites',
  '/sites/new',
  '/sites/clr8xyz456',
  '/settings/users',
  '/mobile/sites'
];

async function captureScreenshots() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    baseURL: process.env.BASE_URL,
    extraHTTPHeaders: {
      'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
      'x-vercel-set-bypass-cookie': 'true'
    }
  });

  const outDir = path.join(__dirname, 'test-results', 'screenshots', 'phase-9-preview');
  fs.mkdirSync(outDir, { recursive: true });

  const page = await context.newPage();
  
  // Login first as Super Admin
  await page.goto('/login');
  await page.fill('input[name="email"]', 'super@admin.com');
  await page.fill('input[name="password"]', 'Super@123456');
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/super-admin/);

  // Get a real company ID
  await page.goto('/super-admin/companies');
  await page.waitForSelector('a[href^="/super-admin/companies/"]');
  const companyLink = await page.getAttribute('a[href^="/super-admin/companies/"]', 'href');
  const companyId = companyLink ? companyLink.split('/').pop() : 'dummy-id';

  const actualPaths = paths.map(p => p.replace('clr7abc123', companyId));

  for (const urlPath of actualPaths) {
    await page.goto(urlPath);
    // wait for network idle to ensure page loaded
    await page.waitForLoadState('networkidle');
    
    // For each viewport
    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(500); // allow resize reflow
      
      const safePathName = urlPath.replace(/\//g, '-').replace(/^-|-$/g, '') || 'home';
      const fileName = `${safePathName}-${vp.name}.png`;
      await page.screenshot({ path: path.join(outDir, fileName), fullPage: true });
      console.log(`Captured ${fileName}`);
    }
  }

  await browser.close();
}

captureScreenshots().catch(console.error);
