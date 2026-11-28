// Klientska apka v17 (redizajn Volt): Dnes, tréning po sériách, pauza, rekord, rýchly zápis, súhrn.
const { chromium } = require('playwright');
const { createMock, route } = require('./mock.js');
const OUT = process.argv[2];
function assert(c, msg) { if (!c) throw new Error('FAIL: ' + msg); console.log('ok -', msg); }
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: OUT ? 2 : 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const mock = createMock({ title: 'Marian Schwarz', weights: [{ date: '2026-11-20', kg: 84.6 }] });
  mock.post({ op: 'applyWeek', from: 2, rows: [] }); // T3 naplánovaný (kópia T2), 23.11. a 25.11.
  mock.posts.length = 0;
  await route(page, mock);
  await page.clock.setFixedTime(new Date('2026-11-23T09:00:00'));
  await page.addInitScript(() => { if (!localStorage.getItem('fitko.config')) localStorage.setItem('fitko.config', JSON.stringify({ sheetId: '', sheetName: '', gid: '', scriptUrl: 'https://script.google.com/macros/s/TEST/exec', token: 't' })); });
  await page.goto('http://localhost:8765/index.html');
  await page.waitForSelector('.hero');
  const hero = await page.textContent('.hero');
  assert(hero.includes('Deň 1') && hero.includes('Začať tréning'), 'Dnes: karta dnešného tréningu');
  assert((await page.textContent('#app')).includes('Ahoj, Marian'), 'Dnes: pozdrav menom z tabuľky');
  assert((await page.textContent('#app')).includes('5 dní bez tréningu'), 'proaktívny tip: 5 dní bez tréningu');
  assert(await page.inputValue('#w-today') === '84,6', 'váha predvyplnená poslednou');
  await page.click('[data-action=w-step][data-d="0.1"]');
  await page.click('[data-action=weight-save]');
  await page.waitForTimeout(200);
  assert(mock.posts.some((p) => p.weight && p.weight.kg === 84.7), 'ranná váha 84,7 odoslaná');
  if (OUT) await page.screenshot({ path: `${OUT}/v17-today.png` });

  // tréning: jeden formulár na cvik (série · opakovania · váha)
  await page.click('.hero [data-action=open-day]');
  await page.waitForSelector('.logc');
  assert((await page.textContent('.exn')).includes('Bench press'), 'prvý cvik Bench press');
  assert(await page.locator('.steps button').count() === 3 && (await page.textContent('.steps')).includes('2'), 'hore očíslované krúžky cvikov');
  const v = (k) => page.inputValue(`.logc input[data-cur=${k}]`);
  assert(await v('sets') === '2' && await v('reps') === '10' && await v('kg') === '50', 'formulár predvyplnený plánom: 2 série × 10 × 50 kg');
  await page.click('[data-action=rest-start]');
  await page.waitForSelector('.pause');
  assert((await page.textContent('.pause')).includes('2:00'), 'pauza na tlačidlo: 2:00 z poznámky trénera');
  if (OUT) await page.screenshot({ path: `${OUT}/v19-rest.png` });
  await page.click('[data-action=rest-skip]');
  await page.click('.logc [data-action=cur][data-k=kg][data-d="1"]');
  assert(await v('kg') === '52,5', '+ zvýši váhu o 2,5 kg');
  assert((await page.textContent('.logc .delta')).includes('+2,5 kg'), 'porovnanie s minulom pri váhe');
  await page.click('[data-action=ex-rpe][data-value="8"]');
  if (OUT) await page.screenshot({ path: `${OUT}/v19-form.png`, fullPage: true });
  await page.click('[data-action=ex-save]');
  assert((await page.textContent('#toast')).includes('rekord'), 'nový osobný rekord ohlásený');
  await page.waitForTimeout(200);
  const bench = mock.posts.find((p) => p.fields && p.name === 'BENCH PRESS');
  assert(bench && bench.fields.sets === '2x10' && bench.fields.weight === '52,5' && bench.fields.rpe === '8', 'bench zapísaný v tvare tabuľky (2x10, 52,5, RPE 8)');

  // swipe a tlačidlá Predošlý / Ďalší
  assert((await page.textContent('.exn')).includes('Squat'), 'automaticky ďalší cvik Squat');
  const swipe = (dx) => page.evaluate((dx) => {
    const el = document.querySelector('.exn');
    const mk = (x) => new Touch({ identifier: 1, target: el, clientX: x, clientY: 300 });
    el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [mk(200)], changedTouches: [mk(200)] }));
    el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [], changedTouches: [mk(200 + dx)] }));
  }, dx);
  await swipe(-150);
  await page.waitForTimeout(100);
  assert((await page.textContent('.exn')).includes('Lateral raise'), 'swipe doľava → ďalší cvik');
  await swipe(150);
  await page.waitForTimeout(100);
  assert((await page.textContent('.exn')).includes('Squat'), 'swipe doprava → predošlý cvik');
  await page.click('.exnav [aria-label="Predošlý cvik"]');
  assert((await page.textContent('.exn')).includes('Bench press'), 'tlačidlo Predošlý');
  await page.click('.steps button:nth-of-type(2)');
  assert((await page.textContent('.exn')).includes('Squat'), 'ťuknutie na krúžok 2');

  // squat iným zápisom (nerovnaké série)
  await page.click('[data-action=ex-quick]');
  await page.fill('.card.form input[id^=sets-]', '9, 9, 8');
  await page.fill('.card.form input[id^=weight-]', '80');
  await page.click('.chipsel [data-value="8"]');
  await page.click('[data-action=save-ex]');
  await page.waitForTimeout(200);
  assert(mock.posts.some((p) => p.fields && p.name === 'SQUAT' && p.fields.sets === '9, 9, 8'), 'squat iným zápisom (9, 9, 8)');

  // lateral raise: úprava, obnovenie stránky, pokračovanie
  assert((await page.textContent('.exn')).includes('Lateral raise'), 'tretí cvik Lateral raise');
  await page.click('.logc [data-action=cur][data-k=reps][data-d="1"]');
  await page.reload();
  await page.waitForSelector('.logc');
  assert(await v('reps') === '13' && (await page.textContent('.exn')).includes('Lateral raise'), 'po obnovení pokračuje na tom istom cviku s úpravou (13 opak.)');
  await page.click('[data-action=ex-rpe][data-value="8.5"]');
  await page.click('[data-action=ex-save]');
  await page.waitForSelector('.sheet');
  assert(mock.posts.some((p) => p.fields && p.name === 'LATERAL RAISE' && p.fields.sets === '3x13'), 'lateral raise 3x13');
  const sum = await page.textContent('.sheet');
  assert(sum.includes('Tréning') && sum.includes('Nový rekord: Bench press'), 'súhrn s rekordom');
  assert(!/objem tréningu/i.test(sum), 'súhrn bez celkového objemu');
  if (OUT) await page.screenshot({ path: `${OUT}/v19-summary.png` });
  await page.click('.sheet [data-action=rpe][data-value="8"]');
  await page.click('[data-action=finish-save]');
  await page.waitForTimeout(200);
  assert(mock.posts.some((p) => p.session && p.session.rpe === '8'), 'tréning uložený (čas a RPE)');
  assert((await page.textContent('.hero')).includes('Hotovo'), 'Dnes: hotovo');

  // Progres a Týždeň
  await page.click('[data-action=tab][data-tab=progress]');
  await page.waitForSelector('.pex');
  assert((await page.textContent('.list')).includes('Bench press'), 'Progres: zoznam cvikov');
  if (OUT) await page.screenshot({ path: `${OUT}/v17-progress.png` });
  await page.click('.pex');
  await page.waitForSelector('.sheet .chart');
  await page.click('.sheet [data-action=close-sheet].icon-btn');
  await page.click('[data-action=tab][data-tab=week]');
  assert((await page.textContent('.weekbar')).includes('Týždeň'), 'Týždeň: prehľad');
  if (OUT) await page.screenshot({ path: `${OUT}/v17-week.png` });

  // Nastavenia
  await page.click('[data-action=tab][data-tab=today]');
  await page.click('[data-action=settings]');
  assert(await page.isVisible('[data-action=copy-coach]'), 'nastavenia: odkaz pre trénera');
  assert((await page.textContent('.app-version')).includes('20'), 'verzia 20');
  // téma Matrix
  await page.click('[data-action=theme][data-theme=matrix]');
  assert(await page.evaluate(() => document.documentElement.dataset.theme) === 'matrix', 'téma Matrix zapnutá');
  assert(await page.locator('#rain').count() === 1, 'Matrix: padajúci kód v pozadí');
  await page.reload();
  await page.waitForSelector('.hero');
  assert(await page.evaluate(() => document.documentElement.dataset.theme) === 'matrix', 'téma sa pamätá po obnovení');
  if (OUT) {
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/v18-matrix-today.png` });
    await page.click('.hero [data-action=open-day]');
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/v18-matrix-wo.png` });
    await page.click('[data-action=back]');
  }
  await page.click('[data-action=settings]');
  assert(await page.locator('[data-action=theme]').count() === 4, 'štyri vzhľady na výber');
  for (const th of ['ember', 'ice']) {
    await page.click(`[data-action=theme][data-theme=${th}]`);
    assert(await page.evaluate(() => document.documentElement.dataset.theme) === th && await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--a1').trim()) !== '#d4ff3a', `téma ${th} má vlastné farby`);
    if (OUT) { await page.click('[data-action=back]'); await page.waitForTimeout(200); await page.screenshot({ path: `${OUT}/v20-${th}.png` }); await page.click('[data-action=settings]'); }
  }
  await page.click('[data-action=theme][data-theme=volt]');
  assert(await page.evaluate(() => document.documentElement.dataset.theme) === 'volt', 'späť na Volt');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  assert(!overflow, 'žiadne vodorovné posúvanie');
  await browser.close();
  assert(errors.length === 0, 'žiadne JS chyby' + (errors.length ? ': ' + errors.join(' | ') : ''));
})().catch((e) => { console.error(e.message); process.exit(1); });
