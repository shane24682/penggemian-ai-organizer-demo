// Baseline / after screenshots of the real penggemian app (desktop workbench layout)
const { chromium } = require('playwright');

const BASE = process.env.OUT_DIR || 'shots-baseline';
const fs = require('fs');
fs.mkdirSync(BASE, { recursive: true });

const views = [
  { name: '01-home',        fn: () => {} },
  { name: '02-onboarding',  fn: async (page) => { await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForTimeout(1200); } },
  { name: '03-match',       fn: async (page) => { await page.evaluate(() => { document.querySelector('.onboarding-actions .save-preferences')?.click(); }); await page.waitForTimeout(600); await page.evaluate(() => { document.querySelector('.workspace-rail .match-entry')?.click(); }); await page.waitForTimeout(800); } },
  { name: '04-plaza',       fn: async (page) => { await page.evaluate(() => { [...document.querySelectorAll('.workspace-rail button')].find(b => b.textContent.includes('活动广场'))?.click(); }); await page.waitForTimeout(800); } },
  { name: '05-quiz',        fn: async (page) => { await page.evaluate(() => { [...document.querySelectorAll('.workspace-rail button')].find(b => b.textContent.includes('测试中心'))?.click(); }); await page.waitForTimeout(800); } },
  { name: '06-friends',     fn: async (page) => { await page.evaluate(() => { [...document.querySelectorAll('.workspace-rail button')].find(b => b.textContent.includes('好友'))?.click(); }); await page.waitForTimeout(800); } },
  { name: '07-history',     fn: async (page) => { await page.evaluate(() => { [...document.querySelectorAll('.workspace-rail button')].find(b => b.textContent.includes('活动记录'))?.click(); }); await page.waitForTimeout(800); } },
  { name: '08-partners',    fn: async (page) => { await page.evaluate(() => { [...document.querySelectorAll('.workspace-rail button')].find(b => b.textContent.includes('组织'))?.click(); }); await page.waitForTimeout(800); } },
];

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://localhost:3001/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1500);

  for (const v of views) {
    try {
      await v.fn(page);
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${BASE}/${v.name}.png` });
      console.log(`OK ${v.name}`);
    } catch (e) {
      console.log(`FAIL ${v.name}: ${e.message.split('\n')[0]}`);
    }
  }
  await browser.close();
  console.log('DONE');
})();
