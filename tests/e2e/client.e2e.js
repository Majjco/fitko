const { chromium } = require('playwright');
const { createMock, route } = require('./mock.js');
const OUT = process.argv[2];
function assert(c, msg) { if (!c) throw new Error('FAIL: ' + msg); console.log('ok -', msg); }
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const mock = createMock();
  await route(page, mock);
  await page.addInitScript(() => localStorage.setItem('fitko.config', JSON.stringify({ sheetId: '', sheetName: '', gid: '', scriptUrl: 'https://script.google.com/macros/s/TEST/exec', token: 't' })));
  await page.goto('http://localhost:8765/index.html');
  await page.waitForSelector('.weekbar');
  // týždeň 2, deň 1 (všetko zapísané) → súhrn
  while (!(await page.textContent('.weekbar .label')).includes('Týždeň 2')) await page.click('[data-action=week][data-dir="-1"]');
  await page.click('[data-action=open-day][data-day="1"]');
  await page.click('[data-action=summary]');
  await page.waitForSelector('.sheet .tiles');
  const txt = await page.textContent('.sheet');
  // 1000 + 1920 + 360 = 3280
  assert(!/objem tréningu/i.test(txt), 'súhrn bez celkového objemu tréningu');
  assert(txt.includes('objem 1 000 kg') && txt.includes('+5,3 % oproti minule'), 'bench: objem 1 000 kg, +5,3 % oproti týždňu 1 (950 kg)');
  await page.click('[data-action=close-sheet].icon-btn');
  await page.click('[data-action=back]');
  await page.click('[data-action=settings]');
  assert(await page.isVisible('[data-action=copy-coach]'), 'nastavenia: tlačidlo odkaz pre trénera');
  assert((await page.textContent('.app-version')).includes('16'), 'verzia 16');
    await browser.close();
  assert(errors.length === 0, 'žiadne JS chyby' + (errors.length ? ': ' + errors.join(' | ') : ''));
})().catch((e) => { console.error(e.message); process.exit(1); });
