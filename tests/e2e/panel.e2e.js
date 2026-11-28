const { chromium } = require('playwright');
const { createMock, route } = require('./mock.js');
const BASE = 'http://localhost:8765';
const U = (id) => `https://script.google.com/macros/s/${id}/exec`;
const link = (id) => `${BASE}/trener.html#s=${Buffer.from(U(id)).toString('base64')}`;
const OUT = process.argv[2];
function assert(c, msg) { if (!c) throw new Error('FAIL: ' + msg); console.log('ok -', msg); }
const iso = (d) => d.toISOString().slice(0, 10);
const days = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const A = createMock({ title: 'Marián', weights: [{ date: days(8), kg: 85 }, { date: days(3), kg: 84.6 }, { date: days(0), kg: 84.2 }], photos: [{ date: '2026-11-22', count: 3, url: 'https://drive.google.com/x' }] });
  const B = createMock({ title: 'Peter', version: 2 });
  const mocks = { A, B };
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 950 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await route(page, null, mocks);

  // 1) odkaz klienta A → prihlásenie → zoznam
  await page.goto(link('A'));
  await page.fill('#lg-user', 'trener'); await page.fill('#lg-pass', 'x');
  await page.click('button[type=submit]');
  await page.waitForSelector('.ccard[data-a=open]');
  // 2) pridanie klienta B vložením odkazu
  await page.click('[data-a=add-client]');
  await page.fill('#add-link', link('B'));
  await page.click('#add-form button[type=submit]');
  await page.waitForSelector('.ccard[data-a=open] >> text=Peter');
  assert(await page.locator('.ccard[data-a=open]').count() === 2, 'zoznam má 2 klientov');
  const cardA = await page.textContent('.ccard[data-a=open]:has-text("Marián")');
  assert(/klesá|klesajú/.test(cardA) && /nová|nové/.test(cardA), 'karta: pokles a nové poznámky');
  assert(cardA.includes('84,2'), 'karta: ranná váha');
  if (OUT) await page.screenshot({ path: `${OUT}/panel-clients.png` });

  // 3) panel klienta A
  await page.click('.ccard[data-a=open]:has-text("Marián")');
  await page.waitForSelector('table.g');
  const snap = await page.textContent('.snap');
  assert(/2\/2/.test(snap) && snap.includes('84,2') && snap.includes('22.11.'), 'snapshot: tréningy 2/2, váha, fotky');
  assert(!/objem/i.test(snap), 'snapshot bez celkového objemu');
  const benchT2 = await page.textContent('tr:has(.exname:text("Bench press")) td.cell:nth-of-type(2)');
  assert(benchT2.includes('1\u00a0000') && benchT2.includes('+5,3 %'), 'bunka: objem cviku 1 000 a +5,3 % oproti T1');
  await page.click('.ins.down');
  assert(await page.locator('tr.hl .exname:text("Deadlift")').count() === 1, 'insight klesá zvýrazní deadlift');
  await page.click('.ins.down');
  await page.click('tr:has(.exname:text("Deadlift")) td.cell:nth-of-type(2) .notebtn.nb-client');
  assert((await page.textContent('.pop')).includes('bolel chrbát'), 'poznámka klienta v bubline');
  await page.mouse.click(5, 5);
  await page.click('.exname:text("Squat")');
  await page.waitForSelector('.drawer .chart');
  assert((await page.textContent('.drawer')).includes('Objem cviku'), 'detail cviku s grafmi');
  await page.click('.drawer [data-a=close-drawer]');

  // 4) nový týždeň
  await page.click('[data-a=add-week]');
  await page.waitForSelector('th.draft');
  assert((await page.textContent('th.draft')).includes('T3'), 'nový stĺpec T3');
  const v = (k) => page.inputValue(`#dr-${k}`);
  assert(await v('1-4-weight') === '52.5', 'návrh bench 52.5');
  assert(await v('2-4-weight') === '97.5', 'návrh deadlift 97.5 (2× nezvládnuté)');
  await page.fill('#dr-1-4-weight', '51'); await page.locator('#dr-1-4-weight').blur();
  await page.waitForTimeout(100);
  assert((await page.textContent('tr:has(.exname:text("Bench press")) td.draft')).includes('upravené tebou'), 'úprava označená');
  await page.click('tr:has(.exname:text("Lateral raise")) td.draft [data-a=skip]');
  assert((await page.textContent('tr:has(.exname:text("Lateral raise")) td.draft')).includes('vynechané'), 'vynechanie');
  await page.click('[data-a=add-extra][data-day="1"]');
  const nameInput = page.locator('tr.newrow input[data-f=name]');
  await nameInput.fill('Face pull'); await nameInput.blur();
  await page.locator('tr.newrow input[data-f=weight]').fill('20'); await page.locator('tr.newrow input[data-f=weight]').blur();
  await page.waitForTimeout(100);
  assert((await page.textContent('#bar')).includes('4 zmeny'), 'lišta: 4 zmeny (úprava, vynechanie, nový cvik, návrh deadliftu)');
  if (OUT) await page.screenshot({ path: `${OUT}/panel-draft.png`, fullPage: true });

  // 5) obnovenie stránky zachová rozpracovaný týždeň aj otvoreného klienta
  await page.reload();
  await page.waitForSelector('th.draft');
  assert(await v('1-4-weight') === '51', 'po reloade ostala úprava');
  assert(await page.inputValue('tr.newrow input[data-f=name]') === 'Face pull', 'po reloade ostal nový cvik');

  // 6) odoslanie
  await page.click('#bar [data-a=send]');
  await page.waitForSelector('th.draft', { state: 'detached' });
  const ap = A.posts.find((p) => p.op === 'applyWeek');
  const row = (d, c) => ap.rows.find((r) => r.day === d && r.col === c);
  assert(row(1, 4).fields.weight === '51', 'odoslaná úprava');
  assert(row(1, 22).fields.name === '' && row(1, 22).expect === 'LATERAL RAISE', 'odoslané vynechanie');
  const extra = ap.rows.find((r) => r.expect === '');
  assert(extra && extra.fields.name === 'FACE PULL' && extra.col === 31, 'odoslaný nový cvik do voľného stĺpca');
  assert(!row(1, 13), 'nezmenený cvik sa neposiela');
  const t3 = await page.textContent('thead');
  assert(t3.includes('T3'), 'T3 je po odoslaní bežný týždeň');
  assert((await page.textContent('table.g')).includes('Face pull'), 'nový cvik je v mriežke');

  // 7) úprava budúcej bunky
  await page.click('tr:has(.exname:text("Bench press")) td.cell.plan [data-a=cell] .s');
  await page.fill('#pc-weight', '52');
  await page.click('[data-a=cell-save]');
  await page.waitForSelector('.pop', { state: 'detached' });
  const pl = A.posts.find((p) => p.op === 'plan');
  assert(pl && pl.week === 3 && pl.fields.weight === '52' && pl.expect === 'BENCH PRESS', 'úprava budúcej bunky uložená');

  // 7b) T3 je naplánovaný a ešte necvičený → Upraviť T3 na tej istej ploche
  assert((await page.textContent('.plan-hint')).includes('T3 je naplánovaný'), 'nápoveda: T3 naplánovaný, ešte necvičený');
  await page.click('.toolbar [data-a=edit-week]');
  await page.waitForSelector('th.draft');
  assert((await page.textContent('th.draft')).includes('T3 · úprava'), 'stĺpec T3 v úprave');
  assert(await page.locator('thead th.wk').count() === 2, 'T3 nie je zobrazený dvakrát');
  assert(await v('1-4-weight') === '52', 'políčko má aktuálny plán T3');
  await page.click('[data-a=mode][data-m=suggest]');
  assert(await v('1-4-weight') === '52.5', 'návrh podľa výkonov v T2');
  await page.fill('#dr-1-4-weight', '53'); await page.locator('#dr-1-4-weight').blur();
  await page.waitForTimeout(100);
  assert((await page.textContent('#bar')).includes('Uložiť a poslať klientovi'), 'lišta: uložiť úpravu');
  await page.click('#bar [data-a=send]');
  await page.waitForSelector('th.draft', { state: 'detached' });
  const ap2 = A.posts.filter((p) => p.op === 'applyWeek')[1];
  assert(ap2.target === 3 && ap2.rows.some((r) => r.col === 4 && r.fields.weight === '53'), 'úprava zapísaná do existujúceho T3 (bez nového týždňa)');
  if (OUT) await page.screenshot({ path: `${OUT}/panel-after.png` });

  // 8) späť na zoznam – poznámky videné
  await page.click('[data-a=clients]');
  await page.waitForSelector('.ccard[data-a=open]');
  assert(!/nová poznámka|nové poznámky/.test(await page.textContent('.ccard[data-a=open]:has-text("Marián")')), 'poznámky po otvorení videné');

  // 9) klient so starým skriptom: nový cvik vypnutý
  await page.click('.ccard[data-a=open]:has-text("Peter")');
  await page.waitForSelector('table.g');
  await page.click('[data-a=add-week]');
  assert((await page.textContent('table.g')).includes('treba aktualizovať Apps Script'), 'starý skript: nový cvik vypnutý');
  await ctx.close();

  // 10) mobil
  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const mp = await m.newPage();
  mp.on('pageerror', (e) => errors.push(e.message));
  await route(mp, null, { A: createMock({ title: 'Marián' }) });
  await mp.goto(link('A'));
  await mp.fill('#lg-user', 'trener'); await mp.fill('#lg-pass', 'x'); await mp.click('button[type=submit]');
  await mp.click('.ccard[data-a=open]');
  await mp.waitForSelector('table.g');
  const overflow = await mp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  assert(!overflow, 'mobil: stránka sa nescrolluje do strany');
  if (OUT) await mp.screenshot({ path: `${OUT}/panel-mobile.png` });
  await browser.close();
  assert(errors.length === 0, 'žiadne JS chyby' + (errors.length ? ': ' + errors.join(' | ') : ''));
})().catch((e) => { console.error(e.message); process.exit(1); });
