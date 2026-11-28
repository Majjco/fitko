// Falošná trénerova tabuľka + Apps Script pre Playwright testy.
const W = 60;
const row = (a, b, c, exs) => {
  const r = Array(W).fill('');
  r[0] = a; r[1] = b || ''; r[2] = c || '';
  (exs || []).forEach((ex, i) => ex && ex.forEach((v, k) => { r[3 + i * 9 + k] = v; }));
  return r;
};
function makeGrid() {
  const head = row('', 'DATE', 'NOTES');
  [0, 1, 2, 3, 4, 5].forEach((i) => { head[3 + i * 9] = 'EXERCISE ' + (i + 1); });
  return [
    head,
    row('WEEK 1'),
    row('DAY 1', '2026-11-09', '', [
      ['BENCH PRESS', '2x~10', '47.5', '8', '', 'Ok', '47.5', '8', ''],
      ['SQUAT', '3x8-10', '80', '7-8', '', '3x8', '80', '8', ''],
    ]),
    row('DAY 2', '2026-11-11', '', [
      ['DEADLIFT', '3x5', '100', '8', '', '5, 5, 4', '100', '9', ''],
    ]),
    row('WEEK 2'),
    row('DAY 1', '2026-11-16', '', [
      ['BENCH PRESS', '2x10', '50', '8', 'pauza 2 min', '2x10', '50', '8', ''],
      ['SQUAT', '3x8-10', '80', '7-8', '', '3x8', '80', '6', ''],
      ['LATERAL RAISE', '3x12', '10', '8', '', '3x12', '10', '8', 'ľahké'],
    ]),
    row('DAY 2', '2026-11-18', '', [
      ['DEADLIFT', '3x5', '100', '8', '', '5, 5, 4', '100', '9', 'bolel chrbát'],
      ['DB CURL + DIPS', '2x10', '12', '8', '', '2x10 a 2x12', '12', '8 a 9', ''],
    ]),
    row('DAY 3', '2026-11-20'),
    row('WEEK 3'),
    row('DAY 1', ''),
    row('DAY 2', ''),
    row('DAY 3', ''),
  ];
}
function findDayRow(grid, week, day) {
  let inWeek = false;
  for (let i = 0; i < grid.length; i++) {
    const a = grid[i][0];
    const w = a.match(/^WEEK (\d+)/); if (w) { inWeek = +w[1] === week; continue; }
    const d = a.match(/^DAY (\d+)/); if (inWeek && d && +d[1] === day) return i;
  }
  return -1;
}
function createMock({ failCol, title, weights, photos, version } = {}) {
  const m = { grid: makeGrid(), posts: [], settings: { pct: 5, steps: {} } };
  m.get = (role) => ({ ok: true, sheet: 'BLOK TEST', history: [], rows: m.grid.map((c, i) => ({ r: i + 1, c })), weights: weights || [], photos: { list: photos || [] }, settings: role === 'coach' ? m.settings : undefined, role, title: title || 'Klient Test', version: version || 3 });
  m.post = (b) => {
    m.posts.push(b);
    if (b.op === 'setting') { if (b.key === 'progres_percent') m.settings.pct = b.value; else m.settings.steps[b.key.slice(5)] = b.value; return { ok: true }; }
    if (b.op === 'applyWeek') {
      let week = b.target;
      if (!week) {
        week = 3;
        for (const d of [1, 2]) {
          const src = m.grid[findDayRow(m.grid, 2, d)], dst = m.grid[findDayRow(m.grid, 3, d)];
          for (let i = 0; i < 3; i++) for (let k = 0; k < 5; k++) dst[3 + i * 9 + k] = src[3 + i * 9 + k];
          dst[1] = d === 1 ? '2026-11-23' : '2026-11-25';
        }
      }
      const results = b.rows.map((r) => {
        if (failCol && r.col === failCol && !m.failedOnce) { m.failedOnce = true; return { day: r.day, col: r.col, ok: false, error: 'Simulovaná chyba' }; }
        const ri = findDayRow(m.grid, week, r.day);
        const off = { name: 0, sets: 1, weight: 2, rpe: 3, note: 4 };
        if ((m.grid[ri][r.col - 1] || '') !== (r.expect || '')) return { day: r.day, col: r.col, ok: false, error: 'Cvik v tabuľke je iný' };
        for (const k of Object.keys(r.fields)) m.grid[ri][r.col - 1 + off[k]] = r.fields[k];
        return { day: r.day, col: r.col, ok: true };
      });
      return { ok: true, week, created: false, results };
    }
    // klientske zápisy: cvik, súhrn tréningu, ranná váha
    if (b.weight) return { ok: true };
    if (b.session) return { ok: true, row: 1 };
    if (b.fields && b.week && !b.op) {
      const ri = findDayRow(m.grid, b.week, b.day);
      if (m.grid[ri][b.col - 1] !== b.name) return { ok: false, error: 'Cvik sa zmenil', conflict: true };
      const off = { sets: 5, weight: 6, rpe: 7, note: 8 };
      for (const k of Object.keys(b.fields)) m.grid[ri][b.col - 1 + off[k]] = b.fields[k];
      return { ok: true, row: ri + 1 };
    }
    if (b.op === 'plan') {
      const ri = findDayRow(m.grid, b.week, b.day);
      const off = { sets: 1, weight: 2, rpe: 3, note: 4 };
      if (m.grid[ri][b.col - 1] !== b.expect) return { ok: false, error: 'Cvik sa zmenil' };
      for (const k of Object.keys(b.fields)) m.grid[ri][b.col - 1 + off[k]] = b.fields[k];
      return { ok: true };
    }
    return { ok: false, error: 'Neznáma operácia' };
  };
  return m;
}
async function route(page, mock, mocks) {
  await page.route('https://script.google.com/**', async (r) => {
    const req = r.request();
    if (mocks) { const id = new URL(req.url()).pathname.split('/')[3]; mock = mocks[id]; }
    let body;
    if (req.method() === 'POST') body = mock.post(JSON.parse(req.postData()));
    else {
      const u = new URL(req.url());
      body = mock.get(u.searchParams.get('user') ? 'coach' : 'client');
    }
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}
module.exports = { createMock, route };
