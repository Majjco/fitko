/* Fitko – tréningový plán z Google tabuľky v peknom mobilnom UI. */
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Konštanty
  // ---------------------------------------------------------------------------
  const DAY_NAMES = ['Ne', 'Po', 'Ut', 'St', 'Št', 'Pi', 'So'];
  const RPE_VALUES = ['6', '7', '7.5', '8', '8.5', '9', '9.5', '10'];
  const HISTORY_TTL = 24 * 60 * 60 * 1000;
  const LS = {
    config: 'fitko.config',
    plan: 'fitko.plan',
    history: 'fitko.history',
    local: 'fitko.local',
    queue: 'fitko.queue',
    sessions: 'fitko.sessions',
  };

  // ---------------------------------------------------------------------------
  // Stav
  // ---------------------------------------------------------------------------
  const state = {
    config: load(LS.config, { sheetId: '', sheetName: '', gid: '', scriptUrl: '', token: '' }),
    plan: load(LS.plan, null), // { sheet, weeks, fetchedAt, source, history: [names] }
    history: load(LS.history, { fetchedAt: 0, sheets: [] }), // staršie bloky pre graf a „Minule“
    local: load(LS.local, {}), // key -> { fields, status, error }
    queue: load(LS.queue, []),
    sessions: load(LS.sessions, {}), // dayKey -> { startedAt, finishedAt, rpe, minutes }
    view: { name: 'week', weekIdx: null, dayN: null, openEx: null },
    sheetOpen: null, // 'summary' | 'progress' | null
    progress: null, // { name, sel }
    loading: false,
    error: null,
    flushing: false,
  };
  if (state.plan && !state.plan.v2) state.plan = null; // starý formát cache

  function load(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch (_) {
      return fallback;
    }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* plný alebo blokovaný storage */ }
  }

  const hasWrite = () => Boolean(state.config.scriptUrl && state.config.token);
  const isConfigured = () => Boolean(state.config.sheetId || hasWrite());

  // ---------------------------------------------------------------------------
  // Pomocné funkcie
  // ---------------------------------------------------------------------------
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const norm = (s) => String(s || '').toUpperCase().replace(/\s+/g, ' ').trim();
  const pad = (n) => String(n).padStart(2, '0');
  const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayIso = () => isoDate(new Date());
  const splitParts = (name) => String(name || '').split(/\s+\+\s+/).map((p) => p.trim()).filter(Boolean);
  // Voľnejšie porovnanie názvov cvikov naprieč blokmi (len pre „Minule“ a graf):
  // „CABLE LAT PULLDOWN - NEUTRAL GRIP“ = „CABLE LAT PULLDOWN“, „DUMBELL“ = „DB“…
  const matchKey = (s) => norm(s)
    .replace(/\(.*?\)/g, ' ')
    .replace(/\s+-\s+.*$/, '')
    .replace(/\bOF CHOICE\b/g, ' ')
    .replace(/\bDUMB+ELLS?\b/g, 'DB')
    .replace(/\s+/g, ' ')
    .trim();
  const nameKey = (name) => splitParts(name).map(matchKey).join(' + ');

  function parseDate(raw) {
    const s = String(raw || '').trim();
    if (!s) return null;
    let m = s.match(/^Date\((\d+),(\d+),(\d+)/);
    if (m) return isoDate(new Date(+m[1], +m[2], +m[3]));
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/^(\d{1,2})\.\s*(\d{1,2})\.?\s*(\d{4})?$/);
    if (m) {
      const day = +m[1], mon = +m[2] - 1;
      if (m[3]) return isoDate(new Date(+m[3], mon, day));
      // Rok chýba (formát d.m) – vyber rok, pri ktorom je dátum najbližšie k dnešku.
      const now = new Date();
      let best = null;
      for (const y of [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]) {
        const d = new Date(y, mon, day);
        if (!best || Math.abs(d - now) < Math.abs(best - now)) best = d;
      }
      return isoDate(best);
    }
    return null;
  }

  function formatDate(iso, withDay = true) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return withDay ? `${DAY_NAMES[date.getDay()]} ${d}.${m}.` : `${d}.${m}.`;
  }

  function prettySets(s) {
    if (!s) return '–';
    return String(s)
      .replace(/\s*[xX×]\s*/g, ' × ')
      .replace(/BOTH/gi, ' obe')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function prettyWeight(w) {
    const s = String(w || '').trim();
    if (!s) return '–';
    if (/^choose$/i.test(s)) return 'podľa seba';
    if (/^[\d\s.,\-–+]+$/.test(s)) return s.replace(/-/g, '–') + ' kg';
    return s;
  }
  const prettyRpe = (r) => (String(r || '').trim() ? String(r).trim().replace(/-/g, '–') : '–');

  // „45 a 12“ -> [45, 12];  „50 a 2x6“ -> [50, 6];  „Ok“ -> [null]
  function weightParts(w) {
    const s = String(w || '').trim();
    if (!s) return [];
    return s.split(/\s+a\s+|\s*\+\s*|\s*\/\s*|\s*;\s*|\s*&\s*/i).map((seg) => {
      const clean = seg.replace(/\d+\s*[x×]\s*(?=\d)/gi, '');
      const m = clean.match(/\d+(?:[.,]\d+)?/);
      return m ? parseFloat(m[0].replace(',', '.')) : null;
    });
  }
  const fmtKg = (n) => (Math.round(n * 10) / 10).toString().replace('.', ',');

  function doneSummary(done) {
    const parts = [];
    if (done.sets) parts.push(done.sets === 'Ok' ? 'Ok' : prettySets(done.sets));
    if (done.weight) parts.push(prettyWeight(done.weight));
    if (done.rpe) parts.push('RPE ' + done.rpe);
    return parts.join(' · ');
  }

  function cap(s) {
    const t = String(s || '').trim().toLowerCase();
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 2600);
  }

  function parseSheetUrl(input) {
    const s = String(input || '').trim();
    const id = (s.match(/\/d\/([a-zA-Z0-9_-]{20,})/) || [])[1] || (/^[a-zA-Z0-9_-]{30,}$/.test(s) ? s : '');
    const gid = (s.match(/[#&?]gid=(\d+)/) || [])[1] || '';
    return { id, gid };
  }

  // ---------------------------------------------------------------------------
  // Načítanie a parsovanie hárku
  // ---------------------------------------------------------------------------
  async function scriptGet(params) {
    const url = new URL(state.config.scriptUrl);
    url.searchParams.set('token', state.config.token);
    for (const [k, v] of Object.entries(params || {})) if (v) url.searchParams.set(k, v);
    const res = await fetch(url.toString(), { redirect: 'follow' });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Chyba skriptu');
    return data;
  }

  async function fetchGrid() {
    const c = state.config;
    if (hasWrite()) {
      const data = await scriptGet({ sheet: c.sheetName });
      return { sheet: data.sheet, rows: data.rows.map((r) => r.c), source: 'script', history: data.history || null, weights: Array.isArray(data.weights) ? data.weights : null };
    }
    if (!c.sheetId) throw new Error('Chýba odkaz na tabuľku');
    const names = c.sheetName ? [c.sheetName, c.sheetName + ' ', c.sheetName.trim()] : [''];
    let lastErr = null;
    for (const name of [...new Set(names)]) {
      try {
        const rows = await fetchGviz(c.sheetId, name, c.gid);
        return { sheet: name || 'Hárok', rows, source: 'public', history: null };
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr;
  }

  async function fetchGviz(id, sheetName, gid) {
    const url = new URL(`https://docs.google.com/spreadsheets/d/${id}/gviz/tq`);
    url.searchParams.set('tqx', 'out:json');
    url.searchParams.set('headers', '0');
    url.searchParams.set('range', 'A1:CZ1500');
    if (sheetName) url.searchParams.set('sheet', sheetName);
    else if (gid) url.searchParams.set('gid', gid);
    url.searchParams.set('_', Date.now());
    const res = await fetch(url.toString());
    const text = await res.text();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0) throw new Error('Tabuľka nie je zdieľaná pre „každého s odkazom“');
    const data = JSON.parse(text.slice(start, end + 1));
    if (data.status === 'error') throw new Error((data.errors && data.errors[0] && data.errors[0].detailed_message) || 'Chyba tabuľky');
    const rows = data.table.rows.map((r) => (r.c || []).map((cell) => {
      if (!cell || cell.v == null) return '';
      if (cell.f != null) return String(cell.f);
      return String(cell.v);
    }));
    if (!parsePlan(rows).length) throw new Error('V hárku som nenašiel „WEEK 1“ – skontroluj názov hárku');
    return rows;
  }

  /*
   * Rozloženie stĺpcov sa zisťuje z hlavičiek („EXERCISE 1“, „DATE“, „NOTES“,
   * „WORKOUT TIME“, „SESH RPE“), takže apka zvládne aj staršie bloky, kde cviky
   * začínajú inde. Každý cvik má 9 stĺpcov: názov, 4× PLANNED, 4× EXECUTED.
   */
  function parsePlan(rows) {
    const weeks = [];
    let week = null;
    let layout = { exCols: [3, 12, 21, 30, 39, 48].map((col, i) => ({ n: i + 1, col })), date: 1, note: 2, time: 57, seshPlanned: 58, seshDone: 59 };
    for (const c of rows) {
      const cells = c.map((v) => String(v || '').trim());
      const exCols = [];
      cells.forEach((v, i) => {
        const m = v.match(/^EXERCISE\s*(\d+)$/i);
        if (m) exCols.push({ n: +m[1], col: i });
      });
      if (exCols.length) {
        const first = exCols[0].col;
        const find = (re, before) => cells.findIndex((v, i) => re.test(v) && (before == null || i < before));
        const sesh = cells.map((v, i) => (/^SESH RPE$/i.test(v) ? i : -1)).filter((i) => i >= 0);
        layout = {
          exCols,
          date: Math.max(0, find(/^DATE$/i, first)) || 1,
          note: find(/^NOTES$/i, first),
          time: find(/^WORKOUT TIME$/i),
          seshPlanned: sesh[0] != null ? sesh[0] : -1,
          seshDone: sesh[1] != null ? sesh[1] : -1,
        };
      }
      const a = cells[0] || '';
      const w = a.match(/^WEEK\s*(\d+)/i);
      if (w) {
        week = { n: +w[1], days: [] };
        weeks.push(week);
        continue;
      }
      const d = a.match(/^DAY\s*(\d+)/i);
      if (!week || !d) continue;
      const at = (i) => (i >= 0 ? cells[i] || '' : '');
      const day = {
        n: +d[1],
        date: parseDate(at(layout.date)),
        note: at(layout.note),
        time: at(layout.time),
        seshPlanned: at(layout.seshPlanned),
        seshDone: at(layout.seshDone),
        timeCol: layout.time >= 0 ? layout.time + 1 : null,
        rpeCol: layout.seshDone >= 0 ? layout.seshDone + 1 : null,
        exercises: [],
      };
      for (const { n, col } of layout.exCols) {
        const name = at(col);
        if (!name) continue;
        const v = (k) => at(col + k);
        day.exercises.push({
          idx: n - 1,
          col: col + 1, // 1-based stĺpec názvu cviku (pre zápis)
          name,
          planned: { sets: v(1), weight: v(2), rpe: v(3), note: v(4) },
          done: { sets: v(5), weight: v(6), rpe: v(7), note: v(8) },
        });
      }
      week.days.push(day);
    }
    return weeks;
  }

  async function refresh(silent) {
    if (!isConfigured()) return;
    state.loading = true;
    state.error = null;
    if (!silent) render();
    try {
      await flushQueue();
      const grid = await fetchGrid();
      const weeks = parsePlan(grid.rows);
      if (!weeks.length) throw new Error('Plán je prázdny – nenašiel som žiadny „WEEK“ blok');
      state.plan = { v2: true, sheet: grid.sheet, weeks, fetchedAt: Date.now(), source: grid.source, history: grid.history, weights: grid.weights || null };
      save(LS.plan, state.plan);
      // Hodnoty, ktoré už sú v tabuľke, netreba držať lokálne.
      for (const [k, e] of Object.entries(state.local)) {
        if (e.status === 'saved') delete state.local[k];
      }
      save(LS.local, state.local);
    } catch (e) {
      state.error = e.message || String(e);
    } finally {
      state.loading = false;
      render();
    }
    loadHistory();
  }

  // Staršie bloky (napr. MESOCYCLE 1.0) – len pre graf a „Minule“. Raz za deň.
  async function loadHistory() {
    if (!hasWrite() || !state.plan || !Array.isArray(state.plan.history)) return;
    const names = state.plan.history.filter((n) => n !== state.plan.sheet);
    const cachedNames = state.history.sheets.map((s) => s.name).join('|');
    if (Date.now() - state.history.fetchedAt < HISTORY_TTL && cachedNames === names.join('|')) return;
    const sheets = [];
    for (const name of names) {
      try {
        const data = await scriptGet({ sheet: name });
        const weeks = parsePlan(data.rows.map((r) => r.c));
        if (weeks.length) sheets.push({ name, weeks });
      } catch (_) { /* hárok preskočíme */ }
    }
    state.history = { fetchedAt: Date.now(), sheets };
    save(LS.history, state.history);
    render();
  }

  // ---------------------------------------------------------------------------
  // Zápis do tabuľky (front + offline)
  // ---------------------------------------------------------------------------
  const exKey = (week, day, idx) => `${state.plan.sheet}|${week}|${day}|${idx}`;
  const dayKey = (week, day) => `${state.plan.sheet}|${week}|${day}`;

  function getDone(week, day, ex) {
    const l = state.local[exKey(week.n, day.n, ex.idx)];
    return l ? { ...ex.done, ...l.fields } : ex.done;
  }
  const hasAny = (f) => Boolean(f && (f.sets || f.weight || f.rpe));

  function enqueue(item) {
    state.queue = state.queue.filter((q) => q.key !== item.key);
    state.queue.push(item);
    save(LS.queue, state.queue);
    flushQueue().then(render);
  }

  function saveExercise(week, day, ex, fields) {
    const key = exKey(week.n, day.n, ex.idx);
    state.local[key] = { fields, status: hasWrite() ? 'pending' : 'local' };
    save(LS.local, state.local);
    if (hasWrite()) {
      enqueue({ key, sheet: state.plan.sheet, week: week.n, day: day.n, ex: ex.idx, col: ex.col, name: ex.name, fields });
    }
  }

  function saveSession(week, day, session) {
    if (!hasWrite()) return;
    const key = 'session|' + dayKey(week.n, day.n);
    enqueue({ key, sheet: state.plan.sheet, week: week.n, day: day.n, session: { ...session, timeCol: day.timeCol, rpeCol: day.rpeCol } });
  }

  // ----- Ranná váha (záložka „Váha“ v tabuľke) -----
  const weightSupported = () => hasWrite() && state.plan && Array.isArray(state.plan.weights);

  function getWeights() {
    const map = new Map();
    for (const w of (state.plan && state.plan.weights) || []) map.set(w.date, { date: w.date, kg: w.kg });
    for (const [k, e] of Object.entries(state.local)) {
      if (k.startsWith('weight|')) map.set(e.fields.date, { date: e.fields.date, kg: e.fields.kg, status: e.status });
    }
    return [...map.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  }

  function saveWeight(date, kg) {
    const key = 'weight|' + date;
    state.local[key] = { fields: { date, kg }, status: 'pending' };
    save(LS.local, state.local);
    enqueue({ key, weight: { date, kg } });
  }

  function avgBetween(list, fromIso, toIso) {
    const vals = list.filter((w) => w.date >= fromIso && w.date <= toIso).map((w) => w.kg);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }
  function isoMinus(days) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return isoDate(d);
  }

  async function flushQueue() {
    if (!hasWrite() || state.flushing || !state.queue.length) return;
    state.flushing = true;
    try {
      while (state.queue.length) {
        const item = state.queue[0];
        const { key, ...payload } = item;
        let data;
        try {
          const res = await fetch(state.config.scriptUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ ...payload, token: state.config.token }),
          });
          data = await res.json();
        } catch (_) {
          break; // offline – skúsime neskôr
        }
        state.queue.shift();
        save(LS.queue, state.queue);
        if (state.local[key]) {
          state.local[key].status = data.ok ? 'saved' : 'error';
          state.local[key].error = data.ok ? null : data.error;
          save(LS.local, state.local);
        }
        if (!data.ok) toast(data.error || 'Uloženie zlyhalo');
      }
    } finally {
      state.flushing = false;
    }
  }

  window.addEventListener('online', () => flushQueue().then(render));

  // ---------------------------------------------------------------------------
  // História cvikov (aktuálny blok + staršie bloky)
  // ---------------------------------------------------------------------------
  function allEntries() {
    const out = [];
    state.history.sheets.forEach((s, si) => {
      for (const w of s.weeks) for (const d of w.days) for (const e of d.exercises) {
        out.push({ sheet: s.name, order: si, week: w.n, day: d.n, date: d.date, name: e.name, planned: e.planned, done: e.done });
      }
    });
    for (const w of state.plan.weeks) for (const d of w.days) for (const e of d.exercises) {
      out.push({ sheet: state.plan.sheet, order: 999, week: w.n, day: d.n, date: d.date, name: e.name, planned: e.planned, done: getDone(w, d, e), current: true });
    }
    const key = (x) => `${x.date || '0000-00-00'}|${pad(x.order).padStart(3, '0')}|${pad(x.week)}|${pad(x.day)}`;
    out.forEach((x) => { x.key = key(x); });
    out.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    return out;
  }

  function findLast(week, day, ex) {
    const target = nameKey(ex.name);
    const here = `${day.date || '0000-00-00'}|999|${pad(week.n)}|${pad(day.n)}`;
    const list = allEntries().filter((x) => nameKey(x.name) === target && hasAny(x.done) && x.key < here);
    return list[list.length - 1] || null;
  }

  function lastLabel(entry) {
    if (entry.current) return `T${entry.week}`;
    return entry.date ? formatDate(entry.date, false) : `T${entry.week}`;
  }

  // Séria hodnôt pre graf jednej časti cviku (pri supersete každá časť zvlášť).
  function progressSeries(part) {
    const target = matchKey(part);
    const points = [];
    for (const x of allEntries()) {
      const parts = splitParts(x.name).map(matchKey);
      const pi = parts.indexOf(target);
      if (pi < 0) continue;
      const w = weightParts(x.done.weight);
      const val = w.length === 1 && parts.length > 1 ? (pi === 0 ? w[0] : null) : w[pi];
      if (val == null || !(val > 0)) continue;
      points.push({ date: x.date, week: x.week, sheet: x.sheet, value: val, done: x.done, current: x.current });
    }
    return points;
  }

  // ---------------------------------------------------------------------------
  // Výber týždňa / dňa
  // ---------------------------------------------------------------------------
  function defaultWeekIdx() {
    const weeks = state.plan.weeks;
    const today = todayIso();
    const idx = weeks.findIndex((w) => w.days.some((d) => d.date === today));
    if (idx >= 0) return idx;
    for (let i = weeks.length - 1; i >= 0; i--) {
      if (weeks[i].days.some((d) => d.exercises.length)) return i;
    }
    return 0;
  }

  function currentWeek() {
    if (!state.plan) return null;
    if (state.view.weekIdx == null || !state.plan.weeks[state.view.weekIdx]) state.view.weekIdx = defaultWeekIdx();
    return state.plan.weeks[state.view.weekIdx];
  }

  function findDay() {
    const week = currentWeek();
    const day = week && week.days.find((d) => d.n === state.view.dayN);
    return { week, day };
  }

  function nextOpenEx(week, day, afterIdx) {
    const list = day.exercises;
    const start = afterIdx == null ? 0 : list.findIndex((e) => e.idx === afterIdx) + 1;
    for (let i = 0; i < list.length; i++) {
      const e = list[(start + i) % list.length];
      if (!hasAny(getDone(week, day, e))) return e.idx;
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Ikony
  // ---------------------------------------------------------------------------
  const ICON = {
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/></svg>',
    check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
    checkBig: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
    chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    up: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const app = document.getElementById('app');

  function render() {
    const drafts = collectDrafts();
    const focused = document.activeElement && document.activeElement.id;
    const scroll = window.scrollY;
    const oldSheet = app.querySelector('.sheet');
    const sheetScroll = oldSheet ? oldSheet.scrollTop : 0;
    const sameSheet = Boolean(oldSheet) && render.lastSheet === state.sheetOpen;

    let html;
    if (state.view.name === 'settings' || !isConfigured()) html = renderSettings();
    else if (!state.plan) html = renderLoading();
    else if (state.view.name === 'workout') html = renderWorkout();
    else html = renderWeek();

    app.innerHTML = html + renderSheet();
    render.lastSheet = state.sheetOpen;
    document.body.classList.toggle('sheet-open', Boolean(state.sheetOpen));
    const newSheet = app.querySelector('.sheet');
    if (newSheet && sameSheet) {
      newSheet.classList.add('no-anim');
      newSheet.scrollTop = sheetScroll;
    }
    restoreDrafts(drafts);
    if (focused) {
      const el = document.getElementById(focused);
      if (el) el.focus({ preventScroll: true });
    }
    window.scrollTo(0, scroll);
  }

  function collectDrafts() {
    const out = {};
    app.querySelectorAll('[data-draft]').forEach((el) => { if (el.dataset.dirty) out[el.id] = el.value; });
    return out;
  }
  function restoreDrafts(drafts) {
    for (const [id, v] of Object.entries(drafts)) {
      const el = document.getElementById(id);
      if (el) { el.value = v; el.dataset.dirty = '1'; }
    }
  }

  function renderBanners() {
    let out = '';
    if (state.error) {
      out += `<div class="banner err"><div style="flex:1"><b>Nepodarilo sa načítať plán.</b><br>${esc(state.error)}</div><button data-action="refresh">Skúsiť znova</button></div>`;
    }
    if (state.queue.length) {
      out += `<div class="banner warn"><div style="flex:1">Čaká na odoslanie do tabuľky: <b>${state.queue.length}</b></div><button data-action="flush">Odoslať</button></div>`;
    }
    return out;
  }

  function renderLoading() {
    if (state.error) {
      return `<div class="topbar"><h1>Fitko</h1><button class="icon-btn" data-action="settings" aria-label="Nastavenia">${ICON.gear}</button></div>${renderBanners()}`;
    }
    return `<div class="empty"><div class="spinner"></div>Načítavam plán od trénera…</div>`;
  }

  // ----- Týždeň -----
  function renderWeek() {
    const week = currentWeek();
    const weeks = state.plan.weeks;
    const wi = state.view.weekIdx;
    const today = todayIso();
    const range = week.days.length && week.days[0].date
      ? `${formatDate(week.days[0].date)} – ${formatDate(week.days[week.days.length - 1].date)}`
      : '';

    const days = week.days.map((d) => {
      const isToday = d.date === today;
      if (!d.exercises.length) {
        return `<div class="day rest ${isToday ? 'today' : ''}"><div class="num">${d.n}</div><div class="info"><div class="title">Voľno ${isToday ? '<span class="badge">Dnes</span>' : ''}</div></div><div class="meta">${esc(formatDate(d.date))}</div></div>`;
      }
      const doneCount = d.exercises.filter((e) => hasAny(getDone(week, d, e))).length;
      const total = d.exercises.length;
      const allDone = doneCount === total;
      const C = 2 * Math.PI * 15;
      const ring = allDone ? '' : `<svg class="ring" viewBox="0 0 36 36" aria-label="${doneCount} z ${total}"><circle class="bg" cx="18" cy="18" r="15"/><circle class="fg" cx="18" cy="18" r="15" transform="rotate(-90 18 18)" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - doneCount / total)}"/></svg>`;
      const preview = d.exercises.map((e) => splitParts(e.name)[0].toLowerCase()).slice(0, 3).join(' · ');
      const s = state.sessions[dayKey(week.n, d.n)];
      const mins = s && s.minutes ? `${s.minutes} min` : d.time;
      return `<button class="day ${isToday ? 'today' : ''} ${allDone ? 'done' : ''}" data-action="open-day" data-day="${d.n}">
        <div class="num">${allDone ? ICON.checkBig : d.n}</div>
        <div class="info">
          <div class="title">Deň ${d.n} <span style="color:var(--muted);font-weight:500">${esc(formatDate(d.date))}</span> ${isToday ? '<span class="badge">Dnes</span>' : ''}</div>
          <div class="meta">${allDone ? `Hotovo${mins ? ' · ' + esc(mins) : ''}` : `${total} cvikov · ${esc(preview)}`}</div>
        </div>
        ${ring}
      </button>`;
    }).join('');

    return `
      <div class="topbar">
        <h1>Tréning<span class="sub">${esc(state.plan.sheet.trim())}${state.loading ? ' · načítavam…' : ''}</span></h1>
        <button class="icon-btn" data-action="refresh" aria-label="Obnoviť">${ICON.refresh}</button>
        <button class="icon-btn" data-action="settings" aria-label="Nastavenia">${ICON.gear}</button>
      </div>
      ${renderBanners()}
      ${!hasWrite() ? `<div class="banner"><div style="flex:1">Režim <b>len na čítanie</b> – výsledky sa ukladajú iba v telefóne.</div><button data-action="settings">Zapnúť zápis</button></div>` : ''}
      ${renderWeightCard()}
      <div class="weekbar">
        <button class="icon-btn" data-action="week" data-dir="-1" ${wi <= 0 ? 'disabled' : ''} aria-label="Predchádzajúci týždeň">${ICON.back}</button>
        <div class="label">Týždeň ${week.n}<small>${esc(range)}</small></div>
        <button class="icon-btn" data-action="week" data-dir="1" ${wi >= weeks.length - 1 ? 'disabled' : ''} aria-label="Ďalší týždeň">${ICON.next}</button>
      </div>
      <div class="days">${days}</div>`;
  }

  // ----- Ranná váha -----
  function renderWeightCard() {
    if (!hasWrite() || !state.plan) return '';
    if (!weightSupported()) {
      return `<div class="banner"><div style="flex:1"><b>Ranná váha:</b> na zapisovanie treba aktualizovať Apps Script (návod v README).</div></div>`;
    }
    const today = todayIso();
    const list = getWeights();
    const todayW = list.find((w) => w.date === today);
    const editing = !todayW || state.view.weightEdit;

    const avg7 = avgBetween(list, isoMinus(6), today);
    const avgPrev = avgBetween(list, isoMinus(13), isoMinus(7));
    let stats = '';
    if (avg7 != null) {
      const diff = avgPrev != null ? avg7 - avgPrev : null;
      const diffHtml = diff == null ? '' : ` <span class="wdiff">${diff > 0 ? '+' : diff < 0 ? '−' : '±'}${fmtKg(Math.abs(diff))}</span>`;
      stats = `<span>7-dňový priemer <b>${fmtKg(avg7)} kg</b>${diffHtml}</span>`;
    }
    const recent = list.filter((w) => w.date >= isoMinus(29));
    const spark = recent.length >= 2 ? sparkline(recent) : '';

    const status = todayW && todayW.status === 'pending' ? '<span class="status pending">Odosielam…</span>'
      : todayW && todayW.status === 'error' ? '<span class="status err">Neuložené</span>' : '';

    const head = editing
      ? `<div class="wrow">
          <div class="wlabel">Ranná váha<small>${esc(formatDate(today))}</small></div>
          <div class="winput"><input id="w-today" data-draft inputmode="decimal" autocomplete="off" placeholder="${esc(list.length ? fmtKg(list[list.length - 1].kg) : '0,0')}" value="${todayW ? esc(fmtKg(todayW.kg)) : ''}"><span>kg</span></div>
          <button class="btn small" data-action="weight-save">Uložiť</button>
        </div>`
      : `<div class="wrow">
          <div class="wlabel">Dnes <b>${esc(fmtKg(todayW.kg))} kg</b> ${status || `<span class="wok">${ICON.check}</span>`}</div>
          <button class="btn small ghost" data-action="weight-edit">Upraviť</button>
        </div>`;

    return `<div class="wcard">
      ${head}
      ${stats || spark ? `<button class="wstats" data-action="weight-open" aria-label="Graf váhy">${spark}<div class="wmeta">${stats}<span class="wmore">Graf ${ICON.next}</span></div></button>` : ''}
    </div>`;
  }

  function sparkline(list) {
    const W = 300, H = 36;
    const vals = list.map((w) => w.kg);
    let min = Math.min(...vals), max = Math.max(...vals);
    if (max - min < 1) { min -= 0.5; max += 0.5; }
    const t0 = new Date(list[0].date).getTime(), t1 = new Date(list[list.length - 1].date).getTime();
    const x = (w) => (t1 === t0 ? W / 2 : 3 + ((new Date(w.date).getTime() - t0) / (t1 - t0)) * (W - 6));
    const y = (v) => 4 + (1 - (v - min) / (max - min)) * (H - 8);
    const d = list.map((w, i) => `${i ? 'L' : 'M'}${x(w).toFixed(1)},${y(w.kg).toFixed(1)}`).join(' ');
    const lastW = list[list.length - 1];
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path d="${d}"/><circle cx="${x(lastW)}" cy="${y(lastW.kg)}" r="3"/></svg>`;
  }

  function renderWeightSheet() {
    const list = getWeights();
    const pts = list.slice(-90).map((w) => ({ date: w.date, value: w.kg, done: {} }));
    const rows = list.slice().reverse().slice(0, 30).map((w) => `<tr><td>${esc(formatDate(w.date))}</td><td><b>${esc(fmtKg(w.kg))}</b> kg</td></tr>`).join('');
    const today = todayIso();
    const avg7 = avgBetween(list, isoMinus(6), today);
    const avg30 = avgBetween(list, isoMinus(29), today);
    return `<div class="sheet-backdrop" data-action="close-sheet"><div class="sheet" role="dialog" aria-label="Ranná váha">
      <div class="grab"></div>
      <div class="sheet-head"><h2>Ranná váha</h2><button class="icon-btn" data-action="close-sheet" aria-label="Zavrieť">${ICON.close}</button></div>
      <p>Ukladá sa do záložky „Váha“ v trénerovej tabuľke.</p>
      <div class="tiles">
        <div class="tile"><div class="tile-v">${list.length ? fmtKg(list[list.length - 1].kg) : '–'}</div><div class="tile-k">posledná</div></div>
        <div class="tile"><div class="tile-v">${avg7 != null ? fmtKg(avg7) : '–'}</div><div class="tile-k">priemer 7 dní</div></div>
        <div class="tile"><div class="tile-v">${avg30 != null ? fmtKg(avg30) : '–'}</div><div class="tile-k">priemer 30 dní</div></div>
      </div>
      <div class="chart-block" style="margin-top:14px">${pts.length ? chartSvg(pts, 0) : '<div class="hint">Zatiaľ žiadne váženie.</div>'}</div>
      ${rows ? `<table class="ptable"><thead><tr><th>Dátum</th><th>Váha</th></tr></thead><tbody>${rows}</tbody></table>` : ''}
    </div></div>`;
  }

  // ----- Tréning (po jednom cviku) -----
  function renderWorkout() {
    const { week, day } = findDay();
    if (!day) { state.view.name = 'week'; return renderWeek(); }
    const doneCount = day.exercises.filter((e) => hasAny(getDone(week, day, e))).length;
    const total = day.exercises.length;
    const open = state.view.openEx;
    const session = state.sessions[dayKey(week.n, day.n)] || {};
    const finished = Boolean(session.finishedAt) || Boolean(day.time);

    const stepper = day.exercises.map((e, i) => {
      const isDone = hasAny(getDone(week, day, e));
      return `<button class="step ${isDone ? 'done' : ''} ${e.idx === open ? 'on' : ''}" data-action="open-ex" data-ex="${e.idx}" aria-label="Cvik ${i + 1}">${isDone ? ICON.check : i + 1}</button>`;
    }).join('<span class="step-line"></span>');

    const list = day.exercises.map((ex, i) => (ex.idx === open ? renderExercise(week, day, ex, i) : renderExerciseRow(week, day, ex, i))).join('');

    let footer = '';
    if (finished) {
      const mins = session.minutes ? `${session.minutes} min` : day.time;
      const rpe = session.rpe || day.seshDone;
      footer = `<div class="finished"><div><b>Tréning hotový</b><span>${esc([mins, rpe ? 'RPE ' + rpe : ''].filter(Boolean).join(' · '))}</span></div><button class="btn small ghost" data-action="summary">Súhrn</button></div>`;
    } else if (doneCount > 0) {
      footer = `<button class="btn ${doneCount === total ? '' : 'ghost'} finish" data-action="summary">Dokončiť tréning</button>`;
    }

    return `
      <div class="topbar">
        <button class="icon-btn" data-action="back" aria-label="Späť">${ICON.back}</button>
        <h1>Deň ${day.n}<span class="sub">Týždeň ${week.n} · ${esc(formatDate(day.date))} · ${doneCount}/${total} hotovo</span></h1>
      </div>
      ${renderBanners()}
      <div class="stepper">${stepper}</div>
      ${day.note ? `<div class="day-note">${esc(day.note)}</div>` : ''}
      ${list}
      ${footer}`;
  }

  function exNameHtml(name) {
    const parts = splitParts(name);
    return parts.length > 1
      ? `<span class="ex-tag">Superset</span>` + parts.map((p) => `<span class="part">${esc(cap(p))}</span>`).join('<span class="plus">+</span>')
      : esc(cap(name));
  }

  function renderExerciseRow(week, day, ex, i) {
    const done = getDone(week, day, ex);
    const isDone = hasAny(done);
    const local = state.local[exKey(week.n, day.n, ex.idx)];
    const pending = local && local.status === 'pending';
    const err = local && local.status === 'error';
    const detail = isDone
      ? doneSummary(done)
      : [prettySets(ex.planned.sets), prettyWeight(ex.planned.weight)].filter((x) => x !== '–').join(' · ');
    return `<button class="ex-row ${isDone ? 'is-done' : ''}" id="ex-${week.n}-${day.n}-${ex.idx}" data-action="open-ex" data-ex="${ex.idx}">
      <div class="ex-idx">${isDone ? ICON.check : i + 1}</div>
      <div class="ex-row-main">
        <div class="ex-row-name">${esc(splitParts(ex.name).map(cap).join(' + '))}</div>
        <div class="ex-row-detail ${err ? 'err' : ''}">${err ? 'Neuložené – ťukni a skús znova' : esc(detail)}${pending ? ' · odosielam…' : ''}</div>
      </div>
      ${ICON.next}
    </button>`;
  }

  function renderExercise(week, day, ex, i) {
    const id = `${week.n}-${day.n}-${ex.idx}`;
    const done = getDone(week, day, ex);
    const local = state.local[exKey(week.n, day.n, ex.idx)];
    const isDone = hasAny(done);
    const isSuperset = splitParts(ex.name).length > 1;

    const last = findLast(week, day, ex);
    const lastHtml = last
      ? `<div class="last">Minule (${esc(lastLabel(last))}): <b>${esc(doneSummary(last.done) || 'splnené')}</b>${last.done.note ? ' – ' + esc(last.done.note) : ''}</div>`
      : '';

    let status = '';
    if (local) {
      const map = {
        pending: ['pending', 'Odosielam…'],
        saved: ['ok', 'Uložené v tabuľke'],
        error: ['err', local.error || 'Chyba'],
        local: ['local', 'Uložené v telefóne'],
      };
      const [cls, txt] = map[local.status] || ['', ''];
      status = `<span class="status ${cls}">${local.status === 'saved' ? ICON.check : ''}${esc(txt)}</span>`;
    } else if (isDone) {
      status = `<span class="status ok">${ICON.check}V tabuľke</span>`;
    }

    const rpeVals = String(done.rpe || '').split(/\s+a\s+/).map((s) => s.trim());
    const rpeChips = RPE_VALUES.map((v) => `<button class="chip ${rpeVals.includes(v) ? 'on' : ''}" data-action="rpe" data-target="rpe-${id}" data-value="${v}" data-multi="${isSuperset ? 1 : 0}">${v}</button>`).join('');
    const hasHistory = splitParts(ex.name).some((p) => progressSeries(p).length > 0);

    return `
      <section class="ex open ${isDone ? 'is-done' : ''}" id="ex-${id}">
        <div class="ex-head">
          <div class="ex-idx">${isDone ? ICON.check : i + 1}</div>
          <div class="ex-name">${exNameHtml(ex.name)}</div>
          ${hasHistory ? `<button class="icon-btn small" data-action="progress" data-name="${esc(ex.name)}" aria-label="Graf progresu">${ICON.chart}</button>` : ''}
        </div>
        <div class="plan">
          <div class="cell"><div class="k">Série</div><div class="v">${esc(prettySets(ex.planned.sets))}</div></div>
          <div class="cell"><div class="k">Váha</div><div class="v">${esc(prettyWeight(ex.planned.weight))}</div></div>
          <div class="cell"><div class="k">RPE</div><div class="v">${esc(prettyRpe(ex.planned.rpe))}</div></div>
        </div>
        ${ex.planned.note ? `<div class="coach"><b>Tréner:</b><span>${esc(ex.planned.note)}</span></div>` : ''}
        ${lastHtml}
        <div class="log">
          <div class="row">
            <div class="field">
              <label for="sets-${id}">Série × opak.</label>
              <div class="with-btn">
                <input id="sets-${id}" data-draft value="${esc(done.sets)}" placeholder="${esc(ex.planned.sets || '2x8')}" autocomplete="off" autocorrect="off" enterkeyhint="next">
                <button class="mini" data-action="ok" data-target="sets-${id}" aria-label="Podľa plánu">Ok</button>
              </div>
            </div>
            <div class="field">
              <label for="weight-${id}">Váha (kg)</label>
              <input id="weight-${id}" data-draft value="${esc(done.weight)}" placeholder="${esc(/choose/i.test(ex.planned.weight) ? (last && last.done.weight) || 'kg' : ex.planned.weight || 'kg')}" ${isSuperset ? '' : 'inputmode="decimal"'} autocomplete="off" autocorrect="off" enterkeyhint="next">
            </div>
          </div>
          <div class="field">
            <label for="rpe-${id}">RPE${isSuperset ? ' <span class="lbl-hint">pri supersete napr. „8 a 7“</span>' : ''}</label>
            <input id="rpe-${id}" data-draft value="${esc(done.rpe)}" placeholder="${esc(ex.planned.rpe || '')}" ${isSuperset ? '' : 'inputmode="decimal"'} autocomplete="off" autocorrect="off">
            <div class="chips" role="group" aria-label="Rýchly výber RPE">${rpeChips}</div>
          </div>
          <div class="field">
            <label for="note-${id}">Poznámka pre trénera</label>
            <textarea id="note-${id}" data-draft rows="1" placeholder="Ako to išlo?">${esc(done.note)}</textarea>
          </div>
          <div class="actions">
            <button class="btn" data-action="save-ex" data-ex="${ex.idx}" data-id="${id}">${isDone ? 'Uložiť zmeny' : 'Uložiť a ďalej'}</button>
            ${status}
          </div>
        </div>
      </section>`;
  }

  // ----- Súhrn tréningu -----
  function summaryData(week, day) {
    const rows = day.exercises.map((ex) => {
      const done = getDone(week, day, ex);
      const last = findLast(week, day, ex);
      const now = weightParts(done.weight);
      const before = last ? weightParts(last.done.weight) : [];
      const parts = splitParts(ex.name);
      const gains = [];
      now.forEach((v, i) => {
        const b = before[i];
        if (v != null && b != null && v > b) gains.push({ part: parts[i] || parts[0], from: b, to: v, diff: v - b });
      });
      return { ex, done, last, isDone: hasAny(done), gains };
    });
    return { rows, done: rows.filter((r) => r.isDone).length, gains: rows.flatMap((r) => r.gains) };
  }

  function renderSummary() {
    const { week, day } = findDay();
    if (!day) return '';
    const s = state.sessions[dayKey(week.n, day.n)] || {};
    const data = summaryData(week, day);
    const autoMins = s.startedAt ? Math.max(1, Math.round((Date.now() - s.startedAt) / 60000)) : '';
    const mins = s.minutes || String(day.time).replace(/\D+/g, '') || autoMins;
    const rpe = s.rpe || day.seshDone || '';

    const gains = data.gains.length
      ? `<div class="section-title">Zlepšenia oproti minule</div><div class="gains">${data.gains.map((g) => `
          <div class="gain"><span class="gain-name">${esc(cap(g.part))}</span><span class="gain-val">${fmtKg(g.from)} → <b>${fmtKg(g.to)} kg</b></span><span class="gain-diff">${ICON.up}${fmtKg(g.diff)}</span></div>`).join('')}</div>`
      : '';

    const list = data.rows.map((r) => `
      <div class="sum-row ${r.isDone ? '' : 'skipped'}">
        <div class="sum-name">${esc(splitParts(r.ex.name).map(cap).join(' + '))}</div>
        <div class="sum-val">${r.isDone ? esc(doneSummary(r.done)) : 'nevyplnené'}</div>
        ${r.last ? `<div class="sum-last">minule ${esc(doneSummary(r.last.done))}</div>` : ''}
      </div>`).join('');

    return `<div class="sheet-backdrop" data-action="close-sheet"><div class="sheet" role="dialog" aria-label="Súhrn tréningu">
      <div class="grab"></div>
      <div class="sheet-head"><h2>Tréning hotový 💪</h2><button class="icon-btn" data-action="close-sheet" aria-label="Zavrieť">${ICON.close}</button></div>
      <p>Týždeň ${week.n} · Deň ${day.n} · ${esc(formatDate(day.date))}</p>
      <div class="tiles">
        <div class="tile"><div class="tile-v">${data.done}<small>/${day.exercises.length}</small></div><div class="tile-k">cvikov</div></div>
        <div class="tile"><div class="tile-v">${data.gains.length}</div><div class="tile-k">zlepšení</div></div>
        <div class="tile"><div class="tile-v">${mins || '–'}<small>${mins ? ' min' : ''}</small></div><div class="tile-k">trvanie</div></div>
      </div>
      ${gains}
      <div class="section-title">Prehľad</div>
      <div class="sum-list">${list}</div>
      <div class="form" style="margin-top:18px">
        <div class="field"><label for="fin-time">Trvanie (min)</label><input id="fin-time" inputmode="numeric" value="${esc(mins)}"></div>
        <div class="field"><label for="fin-rpe">Náročnosť celého tréningu (RPE)</label>
          <input id="fin-rpe" type="hidden" value="${esc(rpe)}">
          <div class="chips">${['5', '6', '7', '8', '9', '10'].map((v) => `<button class="chip ${rpe === v ? 'on' : ''}" data-action="rpe" data-target="fin-rpe" data-value="${v}" data-multi="0">${v}</button>`).join('')}</div>
        </div>
        <button class="btn" data-action="finish-save">Uložiť tréning</button>
      </div>
    </div></div>`;
  }

  // ----- Graf progresu -----
  function renderProgress() {
    const name = state.progress.name;
    const parts = splitParts(name);
    const charts = parts.map((p, pi) => {
      const pts = progressSeries(p);
      return `<div class="chart-block">
        ${parts.length > 1 ? `<div class="chart-title">${esc(cap(p))}</div>` : ''}
        ${pts.length ? chartSvg(pts, pi) : '<div class="hint">Zatiaľ žiadne zapísané váhy.</div>'}
        ${pts.length ? progressTable(pts) : ''}
      </div>`;
    }).join('');
    return `<div class="sheet-backdrop" data-action="close-sheet"><div class="sheet" role="dialog" aria-label="Progres cviku">
      <div class="grab"></div>
      <div class="sheet-head"><h2>Progres</h2><button class="icon-btn" data-action="close-sheet" aria-label="Zavrieť">${ICON.close}</button></div>
      <p>${esc(parts.map(cap).join(' + '))} · váha v kg</p>
      ${charts}
    </div></div>`;
  }

  function chartSvg(pts, pi) {
    const W = 340, H = 180, L = 34, R = 14, T = 22, B = 26;
    const vals = pts.map((p) => p.value);
    let min = Math.min(...vals), max = Math.max(...vals);
    if (min === max) { min -= 5; max += 5; }
    const padV = (max - min) * 0.15;
    min = Math.max(0, min - padV); max += padV;
    const step = niceStep((max - min) / 3);
    const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
    const x = (i) => (pts.length === 1 ? (L + W - R) / 2 : L + (i * (W - L - R)) / (pts.length - 1));
    const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
    const grid = [];
    for (let v = lo; v <= hi + 1e-9; v += step) {
      grid.push(`<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${fmtKg(v)}</text>`);
    }
    const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
    const sel = state.progress.sel && state.progress.sel.pi === pi ? state.progress.sel.i : pts.length - 1;
    const dots = pts.map((p, i) => `
      <g class="pt ${i === sel ? 'sel' : ''}" data-action="chart-pt" data-pi="${pi}" data-i="${i}">
        <circle class="hit" cx="${x(i)}" cy="${y(p.value)}" r="16"/>
        <circle class="dot" cx="${x(i)}" cy="${y(p.value)}" r="${i === sel ? 6 : 4.5}"/>
      </g>`).join('');
    const sp = pts[sel];
    const label = `${fmtKg(sp.value)} kg · ${sp.date ? formatDate(sp.date, false) : 'T' + sp.week}`;
    const lx = Math.min(Math.max(x(sel), L + 50), W - R - 50);
    const xLabels = [0, pts.length - 1].filter((v, i, a) => a.indexOf(v) === i).map((i) =>
      `<text class="axis" x="${x(i)}" y="${H - 6}" text-anchor="${pts.length === 1 ? 'middle' : i === 0 ? 'start' : 'end'}">${esc(pts[i].date ? formatDate(pts[i].date, false) : 'T' + pts[i].week)}</text>`).join('');
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Graf váhy">
      ${grid.join('')}
      <path class="line" d="${path}"/>
      ${dots}
      <text class="tip" x="${lx}" y="${Math.max(14, y(sp.value) - 12)}" text-anchor="middle">${esc(label)}</text>
      ${xLabels}
    </svg>`;
  }

  function niceStep(raw) {
    const p = Math.pow(10, Math.floor(Math.log10(raw || 1)));
    const n = raw / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  }

  function progressTable(pts) {
    const rows = pts.slice().reverse().slice(0, 12).map((p) => `
      <tr><td>${esc(p.date ? formatDate(p.date, false) : 'T' + p.week)}</td><td>${esc(p.done.sets === 'Ok' ? 'Ok' : prettySets(p.done.sets))}</td><td><b>${fmtKg(p.value)}</b></td><td>${esc(p.done.rpe || '–')}</td></tr>`).join('');
    return `<table class="ptable"><thead><tr><th>Dátum</th><th>Série</th><th>kg</th><th>RPE</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  // ----- Nastavenia -----
  function renderSettings() {
    const c = state.config;
    const sheetUrl = c.sheetId ? `https://docs.google.com/spreadsheets/d/${c.sheetId}/edit${c.gid ? '#gid=' + c.gid : ''}` : '';
    const first = !isConfigured();
    return `
      <div class="topbar">
        ${first ? '' : `<button class="icon-btn" data-action="back" aria-label="Späť">${ICON.back}</button>`}
        <h1>${first ? 'Vitaj vo Fitku' : 'Nastavenia'}<span class="sub">${first ? 'Prepoj apku s plánom od trénera' : 'Prepojenie s Google tabuľkou'}</span></h1>
      </div>
      <form class="form" id="settings-form" autocomplete="off">
        <div class="section-title">Plán od trénera</div>
        <div class="card form">
          <div class="field">
            <label for="cfg-url">Odkaz na Google tabuľku</label>
            <input id="cfg-url" name="url" value="${esc(sheetUrl)}" placeholder="https://docs.google.com/spreadsheets/d/…" inputmode="url">
            <div class="hint">Tabuľka musí byť zdieľaná ako „Ktokoľvek s odkazom“. Apka z nej len číta.</div>
          </div>
          <div class="field">
            <label for="cfg-sheet">Názov hárku (záložky)</label>
            <input id="cfg-sheet" name="sheet" value="${esc(c.sheetName)}" placeholder="napr. COMEBACK NOV">
            <div class="hint">So zapnutým zápisom (nižšie) môže ostať prázdne – aktuálny hárok sa nájde sám.</div>
          </div>
        </div>

        <div class="section-title">Zápis výsledkov do tabuľky</div>
        <div class="card form">
          <div class="field">
            <label for="cfg-script">URL Apps Script webovej aplikácie</label>
            <input id="cfg-script" name="script" value="${esc(c.scriptUrl)}" placeholder="https://script.google.com/macros/s/…/exec" inputmode="url">
          </div>
          <div class="field">
            <label for="cfg-token">Heslo (TOKEN zo skriptu)</label>
            <input id="cfg-token" name="token" value="${esc(c.token)}" type="password" placeholder="••••••">
            <div class="hint">Voliteľné. Bez toho apka funguje, ale tvoje váhy/RPE ostanú len v telefóne. Návod je v README v repozitári.</div>
          </div>
        </div>

        <button class="btn" type="submit" style="margin-top:8px">${first ? 'Načítať plán' : 'Uložiť a načítať'}</button>
        ${first ? '' : `<button class="btn ghost" type="button" data-action="copy-setup">Skopírovať odkaz na nastavenie pre iný mobil</button>`}
      </form>`;
  }

  function renderSheet() {
    if (state.sheetOpen === 'summary') return renderSummary();
    if (state.sheetOpen === 'progress' && state.progress) return renderProgress();
    if (state.sheetOpen === 'weight') return renderWeightSheet();
    return '';
  }

  // ---------------------------------------------------------------------------
  // Udalosti
  // ---------------------------------------------------------------------------
  app.addEventListener('input', (e) => {
    if (e.target.matches('[data-draft]')) e.target.dataset.dirty = '1';
    if (e.target.id && e.target.id.startsWith('rpe-')) {
      const vals = e.target.value.split(/\s+a\s+/).map((s) => s.trim());
      e.target.parentElement.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', vals.includes(c.dataset.value)));
    }
  });

  app.addEventListener('submit', (e) => {
    if (e.target.id !== 'settings-form') return;
    e.preventDefault();
    const f = e.target.elements;
    const { id, gid } = parseSheetUrl(f.url.value);
    if (f.url.value.trim() && !id) { toast('Toto nevyzerá ako odkaz na Google tabuľku'); return; }
    const scriptUrl = f.script.value.trim();
    if (scriptUrl && !/^https:\/\/script\.google\.com\/.+\/exec/.test(scriptUrl)) { toast('URL skriptu má končiť na /exec'); return; }
    if (!id && !scriptUrl) { toast('Vlož odkaz na tabuľku'); return; }
    if (!scriptUrl && !f.sheet.value.trim() && !gid) { toast('Zadaj názov hárku s plánom'); return; }
    state.config = { sheetId: id, gid, sheetName: f.sheet.value, scriptUrl, token: f.token.value.trim() };
    save(LS.config, state.config);
    state.plan = null;
    state.history = { fetchedAt: 0, sheets: [] };
    save(LS.history, state.history);
    state.view = { name: 'week', weekIdx: null };
    refresh();
  });

  app.addEventListener('click', (e) => {
    const t = e.target.closest('[data-action]');
    if (!t) return;
    const action = t.dataset.action;
    if (action === 'close-sheet' && t.classList.contains('sheet-backdrop') && t !== e.target) return; // klik dovnútra sheetu
    handle(action, t);
  });

  function scrollToEx(week, day, idx) {
    requestAnimationFrame(() => {
      const el = document.getElementById(`ex-${week.n}-${day.n}-${idx}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function handle(action, t) {
    switch (action) {
      case 'refresh':
        refresh();
        break;
      case 'flush':
        flushQueue().then(render);
        break;
      case 'settings':
        state.view = { ...state.view, name: 'settings', prev: state.view.name === 'settings' ? state.view.prev : state.view.name };
        render();
        break;
      case 'back':
        state.view = { ...state.view, name: state.view.name === 'settings' && state.view.prev === 'workout' ? 'workout' : 'week' };
        render();
        window.scrollTo(0, 0);
        break;
      case 'week':
        state.view.weekIdx = Math.max(0, Math.min(state.plan.weeks.length - 1, state.view.weekIdx + Number(t.dataset.dir)));
        render();
        break;
      case 'open-day': {
        state.view = { ...state.view, name: 'workout', dayN: Number(t.dataset.day) };
        const { week, day } = findDay();
        state.view.openEx = nextOpenEx(week, day, null);
        render();
        window.scrollTo(0, 0);
        break;
      }
      case 'open-ex': {
        const idx = Number(t.dataset.ex);
        const { week, day } = findDay();
        state.view.openEx = state.view.openEx === idx && t.classList.contains('step') ? null : idx;
        render();
        if (state.view.openEx != null) scrollToEx(week, day, idx);
        break;
      }
      case 'ok': {
        const input = document.getElementById(t.dataset.target);
        input.value = 'Ok';
        input.dataset.dirty = '1';
        break;
      }
      case 'rpe': {
        const input = document.getElementById(t.dataset.target);
        const v = t.dataset.value;
        let vals = input.value.split(/\s+a\s+/).map((s) => s.trim()).filter(Boolean);
        if (t.dataset.multi === '1') {
          // Superset: prvé ťuknutie = 1. cvik, druhé = 2. cvik („8 a 7“), tretie začne odznova.
          vals = vals.length >= 2 ? [v] : vals.concat(v);
        } else {
          vals = vals.length === 1 && vals[0] === v ? [] : [v];
        }
        input.value = vals.join(' a ');
        input.dataset.dirty = '1';
        t.parentElement.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', vals.includes(c.dataset.value)));
        break;
      }
      case 'save-ex': {
        const { week, day } = findDay();
        const ex = day.exercises.find((x) => x.idx === Number(t.dataset.ex));
        const id = t.dataset.id;
        const val = (k) => document.getElementById(`${k}-${id}`).value.trim();
        const fields = { sets: val('sets'), weight: val('weight'), rpe: val('rpe'), note: val('note') };
        if (!hasAny(fields) && !fields.note) { toast('Najprv vyplň aspoň váhu alebo RPE'); return; }
        ['sets', 'weight', 'rpe', 'note'].forEach((k) => { delete document.getElementById(`${k}-${id}`).dataset.dirty; });
        const dk = dayKey(week.n, day.n);
        if (!state.sessions[dk]) {
          state.sessions[dk] = { startedAt: Date.now() }; // trvanie tréningu sa počíta od prvého uloženého cviku
          save(LS.sessions, state.sessions);
        }
        saveExercise(week, day, ex, fields);
        if (navigator.vibrate) navigator.vibrate(30);
        const next = nextOpenEx(week, day, ex.idx);
        state.view.openEx = next;
        if (next == null && !state.sessions[dk].finishedAt && !day.time) state.sheetOpen = 'summary';
        render();
        if (next != null) scrollToEx(week, day, next);
        break;
      }
      case 'summary':
        state.sheetOpen = 'summary';
        render();
        break;
      case 'finish-save': {
        const { week, day } = findDay();
        const dk = dayKey(week.n, day.n);
        const s = state.sessions[dk] || {};
        const mins = document.getElementById('fin-time').value.trim();
        const rpe = document.getElementById('fin-rpe').value.trim();
        s.minutes = mins;
        s.rpe = rpe;
        s.finishedAt = Date.now();
        state.sessions[dk] = s;
        save(LS.sessions, state.sessions);
        saveSession(week, day, { time: mins ? mins + ' min' : '', rpe });
        state.sheetOpen = null;
        toast(hasWrite() ? 'Tréning uložený 💪' : 'Tréning uložený v telefóne 💪');
        render();
        break;
      }
      case 'weight-save': {
        const input = document.getElementById('w-today');
        const kg = parseFloat(String(input.value).replace(',', '.'));
        if (!(kg > 20 && kg < 400)) { toast('Zadaj váhu v kg, napr. 84,6'); return; }
        delete input.dataset.dirty;
        saveWeight(todayIso(), Math.round(kg * 10) / 10);
        state.view.weightEdit = false;
        if (navigator.vibrate) navigator.vibrate(30);
        render();
        break;
      }
      case 'weight-edit':
        state.view.weightEdit = true;
        render();
        requestAnimationFrame(() => { const el = document.getElementById('w-today'); if (el) el.focus(); });
        break;
      case 'weight-open':
        state.progress = { kind: 'weight', sel: null };
        state.sheetOpen = 'weight';
        render();
        break;
      case 'progress':
        state.progress = { name: t.dataset.name, sel: null };
        state.sheetOpen = 'progress';
        render();
        break;
      case 'chart-pt':
        state.progress.sel = { pi: Number(t.dataset.pi), i: Number(t.dataset.i) };
        render();
        break;
      case 'close-sheet':
        state.sheetOpen = null;
        render();
        break;
      case 'copy-setup': {
        const payload = btoa(unescape(encodeURIComponent(JSON.stringify(state.config))));
        const link = `${location.origin}${location.pathname}#setup=${payload}`;
        (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject())
          .then(() => toast('Odkaz skopírovaný – obsahuje aj heslo, nikomu ho neposielaj'))
          .catch(() => prompt('Skopíruj si odkaz:', link));
        break;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Štart
  // ---------------------------------------------------------------------------
  function importSetupFromHash() {
    const m = location.hash.match(/#setup=([^&]+)/);
    if (!m) return;
    try {
      const cfg = JSON.parse(decodeURIComponent(escape(atob(m[1]))));
      state.config = { ...state.config, ...cfg };
      save(LS.config, state.config);
      state.plan = null;
      toast('Nastavenie načítané');
    } catch (_) {
      toast('Neplatný odkaz na nastavenie');
    }
    history.replaceState(null, '', location.pathname + location.search);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.plan && Date.now() - (state.plan.fetchedAt || 0) > 5 * 60 * 1000) refresh(true);
  });

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  importSetupFromHash();
  render();
  refresh(Boolean(state.plan));
})();
