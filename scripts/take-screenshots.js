/* eslint-disable */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3000';
const OUT_DIR = 'test-results/screenshots/phase-5-1';

const PAGES = [
  '/login',
  '/super-admin/dashboard',
  '/dashboard',
  '/client-portal',
  '/sites',
  '/bills',
  '/bills/upload',
  '/expenses',
  '/labour/attendance',
  '/labour/salary',
  '/materials',
  '/approvals',
  '/reports',
  '/mobile/home',
  '/mobile/add',
  '/mobile/upload-bill',
  '/mobile/dpr'
];

const VIEWPORTS = [
  { width: 375, height: 812, name: '375px' },
  { width: 390, height: 844, name: '390px' },
  { width: 768, height: 1024, name: '768px' },
  { width: 1440, height: 900, name: '1440px' }
];

async function run() {
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });
  
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await context.newPage();
    
    // Login
    console.log(`[${vp.name}] Logging in...`);
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', 'admin@civiltracker.in');
    await page.fill('input[type="password"]', 'Admin@123456');
    await page.click('button[type="submit"]');
    
    try {
      await page.waitForURL('**/super-admin/dashboard*', { timeout: 15000 });
    } catch (e) {
      console.log('Timeout waiting for login redirect. Checking if logged in...');
    }
    
    for (const p of PAGES) {
      if (p === '/login') continue; // Skip login as we just did it
      
      console.log(`[${vp.name}] Capturing ${p}...`);
      await page.goto(`${BASE_URL}${p}`);
      await page.waitForTimeout(1500); // Wait for data to load
      
      const safeName = p.replace(/\//g, '_');
      await page.screenshot({ path: `${OUT_DIR}/${vp.name}-${safeName}.png`, fullPage: true });
    }
    
    // Capture login page separately by logging out or just clearing cookies
    await context.clearCookies();
    await page.goto(`${BASE_URL}/login`);
    await page.screenshot({ path: `${OUT_DIR}/${vp.name}-_login.png`, fullPage: true });

    await context.close();
  }
  
  await browser.close();
  console.log('Done capturing screenshots!');
}

run().catch(console.error);
