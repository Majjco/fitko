/* Fitko – tréningový plán z Google tabuľky, štýl „Volt“ (specs/004-app-redesign).
 * Dnes · Týždeň · Progres; tréning po sériách s pauzou, tipmi a rekordmi.
 * Dáta: tabuľka trénera (Apps Script / verejný odkaz), offline fronta zápisov. */
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Konštanty
  // ---------------------------------------------------------------------------
  const C = window.FitkoCalc; // objem, série, trendy (calc.js)
  const DAY_NAMES = ['Ne', 'Po', 'Ut', 'St', 'Št', 'Pi', 'So'];
  const DAY_LONG = ['Nedeľa', 'Pondelok', 'Utorok', 'Streda', 'Štvrtok', 'Piatok', 'Sobota'];
  const RPE_VALUES = ['6', '7', '7.5', '8', '8.5', '9', '9.5', '10'];
  const HISTORY_TTL = 24 * 60 * 60 * 1000;
  const APP_VERSION = 20; // zvýš pri každom vydaní spolu s sw.js, version.json a trener.html
  const LS = {
    config: 'fitko.config',
    plan: 'fitko.plan',
    history: 'fitko.history',
    local: 'fitko.local',
    queue: 'fitko.queue',
    sessions: 'fitko.sessions',
    live: 'fitko.live', // rozpracovaný cvik
    theme: 'fitko.theme', // 'volt' | 'ember' | 'ice' | 'matrix' – len v tomto telefóne
  };
  const THEMES = {
    volt: { name: 'Volt', color: '#0a0c0f', desc: 'limetková energia' },
    ember: { name: 'Ember', color: '#0d0908', desc: 'oranžový oheň' },
    ice: { name: 'Ice', color: '#070b14', desc: 'ľadová modrá' },
    matrix: { name: 'Matrix', color: '#000000', desc: 'zelený kód v tme' },
  };

  // ---------------------------------------------------------------------------
  // Stav
  // ---------------------------------------------------------------------------
  const state = {
    config: load(LS.config, { sheetId: '', sheetName: '', gid: '', scriptUrl: '', token: '' }),
    plan: load(LS.plan, null), // { sheet, title, weeks, fetchedAt, source, history, weights, photos }
    history: load(LS.history, { fetchedAt: 0, sheets: [] }),
    local: load(LS.local, {}), // key -> { fields, status, error }
    queue: load(LS.queue, []),
    sessions: load(LS.sessions, {}), // dayKey -> { startedAt, finishedAt, rpe, minutes }
    live: load(LS.live, null), // { key, ex: { idx: { cur: {sets, reps, kg}, rpe, note, quick, edit, touched } }, rest }
    view: { name: 'today', weekIdx: null, dayN: null, exIdx: null },
    sheetOpen: null, // 'summary' | 'progress' | 'weight' | 'photos' | null
    progress: null,
    photoDrafts: [],
    uploading: false,
    loading: false,
    error: null,
    flushing: false,
  };
  if (state.plan && !state.plan.v2) state.plan = null;

  function load(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (_) { return fallback; }
  }
  function save(key, value) {
    try { if (value == null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* plný alebo blokovaný storage */ }
  }
  const hasWrite = () => Boolean(state.config.scriptUrl && state.config.token);
  const isConfigured = () => Boolean(state.config.sheetId || hasWrite());

  // ---------------------------------------------------------------------------
  // Pomocné funkcie
  // ---------------------------------------------------------------------------
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const norm = (s) => String(s || '').toUpperCase().replace(/\s+/g, ' ').trim();
  const pad = (n) => String(n).padStart(2, '0');
  const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayIso = () => isoDate(new Date());
  const dateOf = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
  const daysBetween = (a, b) => Math.round((dateOf(b) - dateOf(a)) / 86400000);
  const splitParts = (name) => String(name || '').split(/\s+\+\s+/).map((p) => p.trim()).filter(Boolean);
  const matchKey = (s) => norm(s).replace(/\(.*?\)/g, ' ').replace(/\s+-\s+.*$/, '').replace(/\bOF CHOICE\b/g, ' ').replace(/\bDUMB+ELLS?\b/g, 'DB').replace(/\s+/g, ' ').trim();
  const nameKey = (name) => splitParts(name).map(matchKey).join(' + ');
  const plural = (n, one, few, many) => (n === 1 ? one : n >= 2 && n <= 4 ? few : many);

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
    const date = dateOf(iso);
    return withDay ? `${DAY_NAMES[date.getDay()]} ${date.getDate()}.${date.getMonth() + 1}.` : `${date.getDate()}.${date.getMonth() + 1}.`;
  }
  function prettySets(s) {
    if (!s) return '–';
    return String(s).replace(/\s*[xX×]\s*/g, '×').replace(/BOTH/gi, ' obe').replace(/\s+/g, ' ').trim();
  }
  function prettyWeight(w) {
    const s = String(w || '').trim();
    if (!s) return '–';
    if (/^choose$/i.test(s)) return 'podľa seba';
    if (/^[\d\s.,\-–+]+$/.test(s)) return s.replace(/-/g, '–').replace(/(\d)\.(\d)/g, '$1,$2') + ' kg';
    return s.replace(/(\d)\.(\d)/g, '$1,$2');
  }
  const prettyRpe = (r) => (String(r || '').trim() ? String(r).trim().replace(/-/g, '–').replace(/(\d)\.(\d)/g, '$1,$2') : '–');
  function weightParts(w) {
    const s = String(w || '').trim();
    if (!s) return [];
    return s.split(/\s+a\s+|\s*\+\s*|\s*\/\s*|\s*;\s*|\s*&\s*/i).map((seg) => {
      const clean = seg.replace(/\d+\s*[x×]\s*(?=\d)/gi, '');
      const m = clean.match(/\d+(?:[.,]\d+)?/);
      return m ? parseFloat(m[0].replace(',', '.')) : null;
    });
  }
  const fmtKg = (n) => (Math.round(n * 100) / 100).toString().replace('.', ',');
  const toNum = (s) => parseFloat(String(s).replace(',', '.'));
  function doneSummary(done) {
    const parts = [];
    if (done.sets) parts.push(done.sets === 'Ok' ? 'Ok' : prettySets(done.sets));
    if (done.weight) parts.push(prettyWeight(done.weight));
    if (done.rpe) parts.push('RPE ' + prettyRpe(done.rpe));
    return parts.join(' · ');
  }
  function cap(s) {
    const t = String(s || '').trim().toLowerCase();
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  const niceName = (name) => splitParts(name).map(cap).join(' + ');
  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 2600);
  }
  const buzz = (p) => { try { if (navigator.vibrate) navigator.vibrate(p); } catch (_) { /* nič */ } };
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
      return { sheet: data.sheet, title: data.title || '', rows: data.rows.map((r) => r.c), source: 'script', history: data.history || null, weights: Array.isArray(data.weights) ? data.weights : null, photos: data.photos || null };
    }
    if (!c.sheetId) throw new Error('Chýba odkaz na tabuľku');
    const names = c.sheetName ? [c.sheetName, c.sheetName + ' ', c.sheetName.trim()] : [''];
    let lastErr = null;
    for (const name of [...new Set(names)]) {
      try {
        const rows = await fetchGviz(c.sheetId, name, c.gid);
        return { sheet: name || 'Hárok', title: '', rows, source: 'public', history: null };
      } catch (e) { lastErr = e; }
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

  // Rozloženie stĺpcov podľa hlavičiek („EXERCISE 1“, „DATE“, „NOTES“, „WORKOUT TIME“, „SESH RPE“).
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
      if (w) { week = { n: +w[1], days: [] }; weeks.push(week); continue; }
      const d = a.match(/^DAY\s*(\d+)/i);
      if (!week || !d) continue;
      const at = (i) => (i >= 0 ? cells[i] || '' : '');
      const day = {
        n: +d[1], date: parseDate(at(layout.date)), note: at(layout.note), time: at(layout.time),
        seshPlanned: at(layout.seshPlanned), seshDone: at(layout.seshDone),
        timeCol: layout.time >= 0 ? layout.time + 1 : null, rpeCol: layout.seshDone >= 0 ? layout.seshDone + 1 : null,
        exercises: [],
      };
      for (const { n, col } of layout.exCols) {
        const name = at(col);
        if (!name) continue;
        const v = (k) => at(col + k);
        day.exercises.push({
          idx: n - 1, col: col + 1, name,
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
      state.plan = { v2: true, sheet: grid.sheet, title: grid.title, weeks, fetchedAt: Date.now(), source: grid.source, history: grid.history, weights: grid.weights || null, photos: grid.photos || null };
      save(LS.plan, state.plan);
      for (const [k, e] of Object.entries(state.local)) if (e.status === 'saved') delete state.local[k];
      save(LS.local, state.local);
    } catch (e) {
      state.error = e.message || String(e);
    } finally {
      state.loading = false;
      render();
    }
    loadHistory();
  }

  // Staršie bloky – len pre graf, „Minule“ a rekordy. Raz za deň.
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
  // Zápis do tabuľky (offline fronta)
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
    if (hasWrite()) enqueue({ key, sheet: state.plan.sheet, week: week.n, day: day.n, ex: ex.idx, col: ex.col, name: ex.name, fields });
  }
  function saveSession(week, day, session) {
    if (!hasWrite()) return;
    const key = 'session|' + dayKey(week.n, day.n);
    enqueue({ key, sheet: state.plan.sheet, week: week.n, day: day.n, session: { ...session, timeCol: day.timeCol, rpeCol: day.rpeCol } });
  }

  // ----- Ranná váha -----
  const weightSupported = () => hasWrite() && state.plan && Array.isArray(state.plan.weights);
  function getWeights() {
    const map = new Map();
    for (const w of (state.plan && state.plan.weights) || []) map.set(w.date, { date: w.date, kg: w.kg });
    for (const [k, e] of Object.entries(state.local)) if (k.startsWith('weight|')) map.set(e.fields.date, { date: e.fields.date, kg: e.fields.kg, status: e.status });
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
  function isoMinus(days) { const d = new Date(); d.setDate(d.getDate() - days); return isoDate(d); }

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
    const key = (x) => `${x.date || '0000-00-00'}|${String(x.order).padStart(3, '0')}|${pad(x.week)}|${pad(x.day)}`;
    out.forEach((x) => { x.key = key(x); });
    out.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    return out;
  }
  const hereKey = (week, day) => `${day.date || '0000-00-00'}|999|${pad(week.n)}|${pad(day.n)}`;
  function findLast(week, day, ex) {
    const target = nameKey(ex.name);
    const here = hereKey(week, day);
    const list = allEntries().filter((x) => nameKey(x.name) === target && hasAny(x.done) && x.key < here);
    return list[list.length - 1] || null;
  }
  // Doterajší rekord (najvyššia odcvičená váha prvej časti) pred týmto dňom.
  function bestBefore(week, day, ex) {
    const target = nameKey(ex.name);
    const here = hereKey(week, day);
    let best = 0;
    for (const x of allEntries()) {
      if (x.key >= here || nameKey(x.name) !== target || !hasAny(x.done)) continue;
      const v = weightParts(x.done.weight)[0];
      if (v > best) best = v;
    }
    return best;
  }
  function lastLabel(entry) {
    if (entry.current) return `T${entry.week}`;
    return entry.date ? formatDate(entry.date, false) : `T${entry.week}`;
  }
  // Séria hodnôt pre graf jednej časti cviku.
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
      const dates = weeks[i].days.map((d) => d.date).filter(Boolean);
      if (weeks[i].days.some((d) => d.exercises.length) && dates.length && dates[0] <= today) return i;
    }
    for (let i = weeks.length - 1; i >= 0; i--) if (weeks[i].days.some((d) => d.exercises.length)) return i;
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
  function todayEntry() {
    const t = todayIso();
    for (const week of state.plan.weeks) for (const day of week.days) if (day.date === t) return { week, day };
    return null;
  }
  function nextTraining() {
    const t = todayIso();
    let best = null;
    for (const week of state.plan.weeks) for (const day of week.days) {
      if (day.exercises.length && day.date && day.date > t && (!best || day.date < best.day.date)) best = { week, day };
    }
    return best;
  }
  const dayDone = (week, day) => day.exercises.length > 0 && day.exercises.every((e) => hasAny(getDone(week, day, e)));
  const dayStarted = (week, day) => day.exercises.some((e) => hasAny(getDone(week, day, e)));
  function lastTrainingDate() {
    let last = null;
    for (const week of state.plan.weeks) for (const day of week.days) {
      if (day.date && day.date <= todayIso() && dayStarted(week, day) && (!last || day.date > last)) last = day.date;
    }
    return last;
  }
  // Koľko týždňov po sebe (končiac aktuálnym alebo minulým) má aspoň jeden tréning.
  function weekStreak() {
    const weeks = state.plan.weeks;
    let i = defaultWeekIdx();
    if (!weeks[i] || !weeks[i].days.some((d) => dayStarted(weeks[i], d))) i--;
    let n = 0;
    for (; i >= 0; i--) {
      if (weeks[i].days.some((d) => dayStarted(weeks[i], d))) n++;
      else break;
    }
    return n;
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
  // Tréning po sériách (rozpracovaný stav v localStorage)
  // ---------------------------------------------------------------------------
  function planInfo(ex) {
    if (splitParts(ex.name).length > 1) return null; // superset – rýchly zápis
    const p = C.parseSets(ex.planned.sets);
    if (!p || p.ok || !p.sets.length) return null;
    return { count: p.sets.length, min: p.sets[0].min, max: p.sets[0].max, list: p.sets, extra: p.extra };
  }
  function liveFor(week, day) {
    const key = dayKey(week.n, day.n);
    if (!state.live || state.live.key !== key) state.live = { key, ex: {}, rest: null };
    return state.live;
  }
  const saveLive = () => save(LS.live, state.live);
  function defaultKg(ex, last) {
    const w = C.parseWeight(ex.planned.weight);
    if (w && w.lo > 0) return w.lo;
    const lw = last ? weightParts(last.done.weight)[0] : null;
    return lw > 0 ? lw : 0;
  }
  function exState(week, day, ex) {
    const live = liveFor(week, day);
    const cur = live.ex[ex.idx];
    if (!cur || !cur.cur || cur.cur.sets == null) {
      const info = planInfo(ex);
      const last = findLast(week, day, ex);
      const lastSets = last ? C.parseSets(last.done.sets) : null;
      let reps = 10;
      if (info) {
        const lr = lastSets && !lastSets.ok && lastSets.sets[0] ? lastSets.sets[0].min : null;
        reps = lr != null && lr >= info.min && lr <= info.max ? lr : info.min;
      }
      live.ex[ex.idx] = { cur: { sets: info ? info.count : 3, reps, kg: defaultKg(ex, last) }, rpe: '', note: '', quick: !info, edit: false, touched: false };
    }
    return live.ex[ex.idx];
  }
  function kgStep(ex, kg) {
    if (/\b(DB|DUMB+ELLS?)\b/i.test(ex.name)) return 2;
    return kg > 0 && kg < 15 ? 1 : 2.5;
  }
  // Pauza z poznámky trénera („pauza 2 min“, „90 s“), inak podľa opakovaní.
  function restSeconds(ex, day) {
    const txt = `${ex.planned.note} ${day.note}`.toLowerCase();
    let m = txt.match(/(\d+(?:[.,]\d+)?)\s*(?:min|m\b|minúty|minút)/);
    if (m) return Math.round(toNum(m[1]) * 60);
    m = txt.match(/(\d+)\s*(?:s\b|sek|sekúnd)/);
    if (m) return Number(m[1]);
    m = txt.match(/pauza\s*(\d+(?:[.,]\d+)?)/);
    if (m) { const v = toNum(m[1]); return Math.round(v <= 5 ? v * 60 : v); }
    const info = planInfo(ex);
    return info && info.max <= 6 ? 150 : 90;
  }
  // Zápis do tabuľky v doterajšom tvare: „3x10“, váha, RPE.
  function composeFields(ex, st) {
    const info = planInfo(ex);
    const extra = info && info.extra ? (info.extra.startsWith('/') ? info.extra : ' ' + info.extra) : '';
    return { sets: `${st.cur.sets}x${st.cur.reps}${extra}`, weight: st.cur.kg > 0 ? fmtKg(st.cur.kg) : '', rpe: st.rpe, note: st.note.trim() };
  }
  const fmtTime = (sec) => `${Math.floor(sec / 60)}:${pad(sec % 60)}`;
  function setRest(week, day, ex) {
    const live = liveFor(week, day);
    const s = restSeconds(ex, day);
    live.rest = { until: Date.now() + s * 1000, total: s, exIdx: ex.idx };
    saveLive();
  }
  function startSession(week, day) {
    const dk = dayKey(week.n, day.n);
    if (!state.sessions[dk]) {
      state.sessions[dk] = { startedAt: Date.now() };
      save(LS.sessions, state.sessions);
    }
  }

  // ---------------------------------------------------------------------------
  // Ikony
  // ---------------------------------------------------------------------------
  const ICON = {
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V5M4 19h16"/><path d="m8 15 4-4 3 3 5-6"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/></svg>',
    image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z"/></svg>',
    flame: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2s5 4.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 1-3.5S9 11 11 11c0-4 1-9 1-9zm0 20a7 7 0 0 0 7-7c0-1.2-.3-2.3-.7-3.3C17.6 15 15 16 15 16s.5 6-3 6z"/></svg>',
    bolt: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/></svg>',
    trophy: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 3h10v2h3v3a4 4 0 0 1-4 4h-.3A5 5 0 0 1 13 15v3h3v3H8v-3h3v-3a5 5 0 0 1-2.7-3H8a4 4 0 0 1-4-4V5h3zm-1 4v1a2 2 0 0 0 1 1.7V7zm11 0v2.7A2 2 0 0 0 18 8V7z"/></svg>',
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
    cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>',
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const app = document.getElementById('app');
  let ticker = null;

  function render() {
    const drafts = collectDrafts();
    const act = document.activeElement;
    const focused = act && act.id && app.contains(act) ? act.id : null;
    const sel = focused && typeof act.selectionStart === 'number' ? [act.selectionStart, act.selectionEnd] : null;
    const scroll = window.scrollY;
    const oldSheet = app.querySelector('.sheet');
    const sheetScroll = oldSheet ? oldSheet.scrollTop : 0;
    const sameSheet = Boolean(oldSheet) && render.lastSheet === state.sheetOpen;

    let html;
    const v = state.view.name;
    if (v === 'settings' || !isConfigured()) html = renderSettings();
    else if (!state.plan) html = renderLoading();
    else if (v === 'workout') html = renderWorkout();
    else html = (v === 'week' ? renderWeekView() : v === 'progress' ? renderProgressView() : renderToday()) + renderTabs();

    app.innerHTML = '<div class="glow" aria-hidden="true"></div>' + html + renderSheet() + renderRest();
    render.lastSheet = state.sheetOpen;
    document.body.classList.toggle('sheet-open', Boolean(state.sheetOpen));
    document.body.classList.toggle('wo-open', state.view.name === 'workout');
    const newSheet = app.querySelector('.sheet');
    if (newSheet && sameSheet) { newSheet.classList.add('no-anim'); newSheet.scrollTop = sheetScroll; }
    restoreDrafts(drafts);
    app.querySelectorAll('input[data-last-weight]').forEach(updateDelta);
    if (focused) {
      const el = document.getElementById(focused);
      if (el) { el.focus({ preventScroll: true }); if (sel && el.setSelectionRange) try { el.setSelectionRange(sel[0], sel[1]); } catch (_) { /* nič */ } }
    }
    window.scrollTo(0, scroll);
    clearInterval(ticker);
    if (state.view.name === 'workout') ticker = setInterval(tick, 1000);
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
    if (state.error) out += `<div class="banner err"><div style="flex:1"><b>Nepodarilo sa načítať plán.</b><br>${esc(state.error)}</div><button data-action="refresh">Skúsiť znova</button></div>`;
    if (state.queue.length) out += `<div class="banner warn"><div style="flex:1">Čaká na odoslanie do tabuľky: <b>${state.queue.length}</b></div><button data-action="flush">Odoslať</button></div>`;
    return out;
  }
  function renderLoading() {
    if (state.error) return `<div class="top"><div class="who"><b>Fitko</b></div><button class="icon-btn" data-action="settings" aria-label="Nastavenia">${ICON.gear}</button></div>${renderBanners()}`;
    return '<div class="empty"><div class="spinner"></div>Načítavam plán od trénera…</div>';
  }
  function renderTabs() {
    const t = (k, ic, l) => `<button class="${state.view.name === k ? 'on' : ''}" data-action="tab" data-tab="${k}">${ic}${l}</button>`;
    return `<nav class="tabs" aria-label="Navigácia">${t('today', ICON.home, 'Dnes')}${t('week', ICON.cal, 'Týždeň')}${t('progress', ICON.chart, 'Progres')}</nav>`;
  }
  function sparkline(vals) {
    if (vals.length < 2) return '';
    const W = 76, H = 30;
    let mn = Math.min(...vals), mx = Math.max(...vals);
    if (mx === mn) { mn -= 1; mx += 1; }
    const x = (i) => 3 + (i * (W - 6)) / (vals.length - 1), y = (v) => 4 + (1 - (v - mn) / (mx - mn)) * (H - 8);
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" aria-hidden="true"><path d="${vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}"/></svg>`;
  }
  const estMinutes = (day) => Math.max(10, Math.round(day.exercises.reduce((a, e) => { const p = planInfo(e); return a + (p ? p.count : 3) * 3.2; }, 0) / 5) * 5);
  const setsCount = (day) => day.exercises.reduce((a, e) => { const p = C.parseSets(e.planned.sets); return a + (p && !p.ok ? p.sets.length : 3); }, 0);

  // ----- Dnes -----
  function renderToday() {
    const now = new Date();
    const first = ((state.plan.title || '').trim().split(/\s+/)[0]) || '';
    const streak = weekStreak();
    const top = `<div class="top"><div class="who"><span class="eyebrow">${DAY_LONG[now.getDay()]} ${now.getDate()}. ${now.getMonth() + 1}.</span><b>${first ? 'Ahoj, ' + esc(first) : 'Ahoj'}</b></div>
      ${streak >= 2 ? `<span class="pill">${ICON.flame}${streak} ${plural(streak, 'týždeň', 'týždne', 'týždňov')} v rade</span>` : ''}
      <button class="icon-btn" data-action="settings" aria-label="Nastavenia">${ICON.gear}</button></div>`;
    const ro = !hasWrite() ? '<div class="banner"><div style="flex:1">Režim <b>len na čítanie</b> – výsledky sa ukladajú iba v telefóne.</div><button data-action="settings">Zapnúť zápis</button></div>' : '';
    return top + renderBanners() + ro + renderWeightCard() + renderHero() + renderTips() + renderStrip() +
      `<div class="app-version">Fitko · verzia ${APP_VERSION}${state.loading ? ' · načítavam…' : ''}</div>`;
  }

  function renderHero() {
    const te = todayEntry();
    if (te && te.day.exercises.length) {
      const { week, day } = te;
      const done = dayDone(week, day);
      const liveStarted = state.live && state.live.key === dayKey(week.n, day.n) && Object.values(state.live.ex).some((x) => x.touched);
      const started = dayStarted(week, day) || liveStarted;
      const count = day.exercises.length;
      const doneCount = day.exercises.filter((e) => hasAny(getDone(week, day, e))).length;
      return `<div class="hero"><div class="hero-in">
        <div class="eyebrow">Dnes · Týždeň ${week.n} · Deň ${day.n}</div>
        <h1 class="h-xl">${done ? 'Hotovo' : 'Deň ' + day.n}<br><span class="gtext">${done ? 'dobrá práca' : esc(cap(splitParts(day.exercises[0].name)[0]))}</span></h1>
        <div class="meta"><span><b>${count}</b> ${plural(count, 'cvik', 'cviky', 'cvikov')}</span><span><b>${setsCount(day)}</b> sérií</span><span>~<b>${estMinutes(day)}</b> min</span>${started && !done ? `<span><b>${doneCount}/${count}</b> hotovo</span>` : ''}</div>
        ${day.note ? `<div class="hint" style="margin:-6px 0 12px">${esc(day.note)}</div>` : ''}
        <div class="chips">${day.exercises.map((e) => `<span class="chip">${esc(niceName(e.name))}</span>`).join('')}</div>
        <button class="btn cta" data-action="open-day" data-week="${state.plan.weeks.indexOf(week)}" data-day="${day.n}">${done ? ICON.check + 'Pozrieť tréning' : ICON.play + (started ? 'Pokračovať' : 'Začať tréning')}</button>
      </div></div>`;
    }
    const nx = nextTraining();
    return `<div class="hero calm"><div class="hero-in">
      <div class="eyebrow">Dnes</div><h1 class="h-xl">Voľno<br><span class="gtext">regenerácia</span></h1>
      <div class="meta">${nx ? `<span>Najbližšie: <b>${esc(formatDate(nx.day.date))}</b> · Deň ${nx.day.n} · ${nx.day.exercises.length} ${plural(nx.day.exercises.length, 'cvik', 'cviky', 'cvikov')}</span>` : '<span>Ďalší tréning ti pripraví tréner.</span>'}</div>
      ${nx ? `<button class="btn ghost" data-action="open-day" data-week="${state.plan.weeks.indexOf(nx.week)}" data-day="${nx.day.n}">Pozrieť plán</button>` : ''}
    </div></div>`;
  }

  // Proaktívne tipy: väčšia váha od trénera, nezvládnuté minule, dlhšia pauza, fotky.
  function renderTips() {
    const tips = [];
    const te = todayEntry();
    if (te && te.day.exercises.length && !dayDone(te.week, te.day)) {
      for (const ex of te.day.exercises) {
        if (hasAny(getDone(te.week, te.day, ex))) continue;
        const last = findLast(te.week, te.day, ex);
        if (!last) continue;
        const pw = C.parseWeight(ex.planned.weight), lw = weightParts(last.done.weight)[0];
        const lr = C.parseRpe(last.done.rpe);
        if (pw && pw.lo > 0 && lw > 0 && pw.lo > lw) {
          tips.push(['grad', ICON.bolt, `${niceName(ex.name)}: dnes ${fmtKg(pw.lo)} kg`, `Minule ${fmtKg(lw)} kg${lr ? ` pri RPE ${fmtKg(lr[1])}` : ''}. ${lr && lr[1] <= 8 ? 'Máš rezervu – zvládneš.' : 'Tréner ťa posúva ďalej.'}`]);
          break;
        }
        if (C.missed(ex.name, last.planned, last.done)) {
          tips.push(['grad', ICON.bolt, `${niceName(ex.name)}: dnes všetky opakovania`, `Minule ${prettySets(last.done.sets)} pri ${prettyWeight(last.done.weight)}. Dnes skús celý plán ${prettySets(ex.planned.sets)}.`]);
          break;
        }
      }
    }
    const lt = lastTrainingDate();
    if (lt && daysBetween(lt, todayIso()) >= 4 && !(te && dayStarted(te.week, te.day))) {
      tips.push(['calm', ICON.flame, `${daysBetween(lt, todayIso())} dní bez tréningu`, 'Telo je oddýchnuté – ideálny čas sa vrátiť.']);
    }
    const dow = new Date().getDay();
    if (photosSupported()) {
      const todayPh = (state.plan.photos.list || []).find((x) => x.date === todayIso());
      if (dow === 0) {
        tips.push(todayPh && todayPh.count
          ? ['calm', ICON.camera, 'Fotky odoslané trénerovi', `Dnes ${todayPh.count} ${plural(todayPh.count, 'fotka', 'fotky', 'fotiek')} ✓`, 'photos-open']
          : ['grad', ICON.camera, 'Nedeľné fotky progresu', 'Odfoť sa a pošli ich trénerovi.', 'photos-open', 'Pridať']);
      } else if (dow === 6) {
        tips.push(['calm', ICON.camera, 'Zajtra sú nedeľné fotky', 'Ráno nalačno, rovnaké svetlo ako minule.']);
      }
    }
    return tips.map(([cls, ic, b, s, action, go]) => {
      const inner = `<div class="ic ${cls}">${ic}</div><div><b>${esc(b)}</b><span>${esc(s)}</span></div>${go ? `<span class="go">${esc(go)}</span>` : ''}`;
      return action ? `<button class="card tip" data-action="${action}">${inner}</button>` : `<div class="card tip">${inner}</div>`;
    }).join('');
  }

  function renderStrip() {
    const wi = defaultWeekIdx();
    const week = state.plan.weeks[wi];
    if (!week) return '';
    const t = todayIso();
    const days = week.days.map((d) => {
      const rest = !d.exercises.length;
      const done = !rest && dayDone(week, d);
      const part = !rest && !done && dayStarted(week, d);
      const isToday = d.date === t;
      const label = d.date ? DAY_NAMES[dateOf(d.date).getDay()] : rest ? 'voľno' : 'D' + d.n;
      const inner = rest ? '·' : done ? ICON.check : d.n;
      const cls = `sd ${done ? 'done' : ''} ${part ? 'part' : ''} ${isToday ? 'today' : ''}`;
      return rest ? `<div class="${cls}"><i>${inner}</i>${label}</div>`
        : `<button class="${cls}" data-action="open-day" data-week="${wi}" data-day="${d.n}"><i class="${isToday && !done ? 'grad' : ''}">${inner}</i>${label}</button>`;
    }).join('');
    return `<div class="sec"><h3>Týždeň ${week.n}</h3><button data-action="tab" data-tab="week">Celý plán</button></div><div class="strip">${days}</div>`;
  }

  // ----- Ranná váha -----
  function renderWeightCard() {
    if (!hasWrite() || !state.plan) return '';
    if (!weightSupported()) return '<div class="banner"><div style="flex:1"><b>Ranná váha a fotky:</b> treba aktualizovať Apps Script (návod v README).</div></div>';
    const today = todayIso();
    const list = getWeights();
    const todayW = list.find((w) => w.date === today);
    const avg7 = avgBetween(list, isoMinus(6), today);
    const avgPrev = avgBetween(list, isoMinus(13), isoMinus(7));
    const diff = avg7 != null && avgPrev != null ? avg7 - avgPrev : null;
    const trend = diff == null ? '' : `trend ${diff > 0 ? '+' : diff < 0 ? '−' : '±'}${fmtKg(Math.abs(Math.round(diff * 10) / 10))} kg/týž.`;
    if (todayW && !state.view.weightEdit) {
      const status = todayW.status === 'pending' ? ' · odosielam…' : todayW.status === 'error' ? ' · neuložené' : '';
      const recent = list.filter((w) => w.date >= isoMinus(29)).map((w) => w.kg);
      return `<div class="card"><div class="wdone"><button class="ic grad" data-action="weight-edit" aria-label="Upraviť váhu">${ICON.check}</button>
        <button class="t" data-action="weight-open" style="text-align:left"><b>Ranná váha ${esc(fmtKg(todayW.kg))} kg${esc(status)}</b><span>${avg7 != null ? `7-dňový priemer ${esc(fmtKg(Math.round(avg7 * 10) / 10))} kg` : ''}${trend ? ' · ' + esc(trend) : ''}</span></button>
        <button data-action="weight-open" aria-label="Graf váhy">${sparkline(recent)}</button></div></div>`;
    }
    const lastW = list.filter((w) => w.date < today).pop();
    const val = todayW ? todayW.kg : lastW ? lastW.kg : '';
    return `<div class="card weigh">
      <div class="lbl"><b>Ranná váha</b><span>${lastW ? `naposledy ${esc(fmtKg(lastW.kg))} kg` : 'prvé váženie'}${trend ? ' · ' + esc(trend) : ''}</span></div>
      <div class="stepper"><button data-action="w-step" data-d="-0.1" aria-label="Menej">−</button><input id="w-today" data-draft inputmode="decimal" autocomplete="off" value="${val !== '' ? esc(fmtKg(val)) : ''}" placeholder="0,0" aria-label="Ranná váha v kg"><span class="unit">kg</span><button data-action="w-step" data-d="0.1" aria-label="Viac">+</button></div>
      <button class="btn small" data-action="weight-save">Uložiť</button></div>`;
  }

  // ----- Týždeň -----
  function renderWeekView() {
    const week = currentWeek();
    const weeks = state.plan.weeks;
    const wi = state.view.weekIdx;
    const today = todayIso();
    const dates = week.days.map((d) => d.date).filter(Boolean);
    const range = dates.length ? (dates.length > 1 ? `${formatDate(dates[0], false)} – ${formatDate(dates[dates.length - 1], false)}` : formatDate(dates[0], false)) : '';
    const days = week.days.map((d) => {
      const isToday = d.date === today;
      if (!d.exercises.length) {
        return `<div class="card dayc rest"><div class="n num">${ICON.moon}</div><div class="t"><b>Voľno</b><span>${esc(formatDate(d.date))}</span></div></div>`;
      }
      const doneCount = d.exercises.filter((e) => hasAny(getDone(week, d, e))).length;
      const total = d.exercises.length;
      const allDone = doneCount === total;
      const s = state.sessions[dayKey(week.n, d.n)];
      const mins = s && s.minutes ? `${s.minutes} min` : d.time;
      const C2 = 2 * Math.PI * 14;
      const ringSvg = !allDone && doneCount ? `<svg class="ring" viewBox="0 0 36 36" aria-label="${doneCount} z ${total}"><circle class="bg" cx="18" cy="18" r="14"/><circle class="fg" cx="18" cy="18" r="14" transform="rotate(-90 18 18)" stroke-dasharray="${C2}" stroke-dashoffset="${C2 * (1 - doneCount / total)}"/></svg>` : '';
      const badge = allDone ? '<span class="badge ok">Hotovo</span>' : isToday ? '<span class="badge now">Dnes</span>' : ringSvg;
      const preview = d.exercises.map((e) => niceName(splitParts(e.name)[0])).join(' · ');
      return `<button class="card dayc ${allDone ? 'done' : ''}" data-action="open-day" data-week="${wi}" data-day="${d.n}">
        <div class="n num ${isToday && !allDone ? 'grad' : ''}">${allDone ? ICON.check : d.n}</div>
        <div class="t"><b>Deň ${d.n} · ${esc(formatDate(d.date))}</b><span>${esc(preview)}</span><span>${allDone ? `Hotovo${mins ? ' · ' + esc(mins) : ''}${d.seshDone ? ' · RPE ' + esc(prettyRpe(d.seshDone)) : ''}` : `${total} ${plural(total, 'cvik', 'cviky', 'cvikov')} · ${setsCount(d)} sérií`}</span></div>${badge}</button>`;
    }).join('');
    return `<div class="top"><div class="who"><span class="eyebrow">${esc(state.plan.sheet.trim())}</span><b>Plán od trénera</b></div><button class="icon-btn" data-action="refresh" aria-label="Obnoviť">${ICON.refresh}</button></div>
      ${renderBanners()}
      <div class="weekbar"><button class="icon-btn" data-action="week" data-dir="-1" ${wi <= 0 ? 'disabled' : ''} aria-label="Predchádzajúci týždeň">${ICON.back}</button>
        <div class="label"><div class="h-l">Týždeň <span class="gtext">${week.n}</span></div><small>${esc(range)}</small></div>
        <button class="icon-btn" data-action="week" data-dir="1" ${wi >= weeks.length - 1 ? 'disabled' : ''} aria-label="Ďalší týždeň">${ICON.next}</button></div>
      ${days}`;
  }

  // ----- Progres -----
  function progressParts() {
    const seen = new Map();
    for (const x of allEntries()) {
      if (!hasAny(x.done)) continue;
      for (const p of splitParts(x.name)) {
        const k = matchKey(p);
        if (!seen.has(k) || (x.date || '') >= (seen.get(k).date || '')) seen.set(k, { name: p, date: x.date });
      }
    }
    return [...seen.values()].map((v) => ({ name: v.name, pts: progressSeries(v.name) })).filter((v) => v.pts.length)
      .sort((a, b) => ((b.pts[b.pts.length - 1].date || '') < (a.pts[a.pts.length - 1].date || '') ? -1 : 1));
  }
  function renderProgressView() {
    const parts = progressParts();
    let ups = 0, prs = 0;
    const rows = parts.map((p) => {
      const vals = p.pts.map((x) => x.value);
      const last = vals[vals.length - 1], first = vals[0], max = Math.max(...vals);
      const cur = p.pts.filter((x) => x.current).map((x) => x.value);
      const prev = p.pts.filter((x) => !x.current).map((x) => x.value);
      if (cur.length && prev.length && Math.max(...cur) > Math.max(...prev)) prs++;
      let tr = ['same', '→ drží'];
      if (vals.length >= 2 && last < vals[vals.length - 2]) tr = ['down', '↓ klesá'];
      else if (vals.length >= 2 && last > first) { tr = ['up', `↑ +${fmtKg(last - first)} kg`]; ups++; }
      return `<button class="pex" data-action="progress" data-name="${esc(p.name)}"><div class="nm"><b>${esc(cap(p.name))}</b><span>${esc(fmtKg(last))} kg · rekord ${esc(fmtKg(max))} kg</span></div>${sparkline(vals.slice(-8))}<span class="trend ${tr[0]}">${esc(tr[1])}</span></button>`;
    }).join('');
    const ws = getWeights();
    const wlast = ws[ws.length - 1];
    const wref = wlast ? ws.filter((w) => w.date <= isoMinus(21)).pop() : null;
    const wdiff = wlast && wref ? wlast.kg - wref.kg : null;
    const wpts = ws.slice(-60).map((w) => ({ date: w.date, value: w.kg, done: {} }));
    const ph = photosSupported() ? (state.plan.photos.list || []) : [];
    const lastPh = ph[ph.length - 1];
    return `<div class="top"><div class="who"><span class="eyebrow">Progres</span><b>Ako ti to ide</b></div></div>
      <h1 class="h-l page-title">Ideš <span class="gtext">${ups ? 'hore' : 'ďalej'}</span></h1>
      <div class="tiles flat"><div class="tile"><span class="num gtext">${ups}</span><span class="k">cvikov hore</span></div>
        <div class="tile"><span class="num">${prs}</span><span class="k">rekordy v bloku</span></div>
        <div class="tile"><span class="num">${wdiff != null ? (wdiff > 0 ? '+' : wdiff < 0 ? '−' : '') + esc(fmtKg(Math.abs(Math.round(wdiff * 10) / 10))) : '–'}</span><span class="k">kg za 3 týž.</span></div></div>
      ${wpts.length >= 2 ? `<button class="card" data-action="weight-open" style="display:block;width:100%;text-align:left"><div class="sec" style="margin:0 0 6px"><h3>Ranná váha</h3><span class="r muted">${esc(fmtKg(wlast.kg))} kg</span></div>${chartSvg(wpts, 9, true)}</button>` : ''}
      <div class="sec"><h3>Cviky</h3><span class="r muted">ťukni pre detail</span></div>
      ${rows ? `<div class="list">${rows}</div>` : '<div class="card muted">Grafy sa ukážu po prvých zapísaných tréningoch.</div>'}
      ${photosSupported() ? `<button class="card tip" data-action="photos-open"><div class="ic calm">${ICON.camera}</div><div><b>Fotky progresu</b><span>${lastPh ? `${esc(formatDate(lastPh.date))} · ${lastPh.count} ${plural(lastPh.count, 'fotka', 'fotky', 'fotiek')}` : 'zatiaľ žiadne'}</span></div><span class="go">Otvoriť</span></button>` : ''}`;
  }

  // ----- Tréning -----
  function renderWorkout() {
    const { week, day } = findDay();
    if (!day) { state.view.name = 'today'; return renderToday() + renderTabs(); }
    const list = day.exercises;
    if (!list.length) { state.view.name = 'week'; return renderWeekView() + renderTabs(); }
    let exIdx = state.view.exIdx;
    if (exIdx == null || !list.some((e) => e.idx === exIdx)) { exIdx = nextOpenEx(week, day, null); if (exIdx == null) exIdx = list[0].idx; state.view.exIdx = exIdx; }
    const pos = list.findIndex((e) => e.idx === exIdx);
    const ex = list[pos];
    const s = state.sessions[dayKey(week.n, day.n)] || {};
    const running = s.startedAt && !s.finishedAt && !day.time;
    const steps = list.map((e, i) => {
      const dn = hasAny(getDone(week, day, e));
      return `<button class="${dn ? 'done' : ''} ${e.idx === exIdx ? 'cur' : ''}" data-action="go-ex" data-ex="${e.idx}" aria-label="Cvik ${i + 1}: ${esc(niceName(e.name))}" ${e.idx === exIdx ? 'aria-current="step"' : ''}>${dn ? ICON.check : i + 1}</button>`;
    }).join('<span class="stepline"></span>');
    const prev = list[pos - 1], next = list[pos + 1];
    const slide = state.view.slide;
    state.view.slide = 0;
    const finished = Boolean(s.finishedAt) || Boolean(day.time);
    const allDone = list.every((e) => hasAny(getDone(week, day, e)));
    return `<div class="wo-top"><div class="wo-bar"><button class="icon-btn" data-action="back" aria-label="Späť">${ICON.close}</button>
        <span class="eyebrow">Deň ${day.n} · Cvik ${pos + 1} z ${list.length}</span>
        <span class="clock num" id="clock">${running ? clockText(s.startedAt) : esc(formatDate(day.date, false))}</span></div>
        <div class="steps">${steps}</div></div>
      ${renderBanners()}
      <div class="wo-body ${slide > 0 ? 'slide-l' : slide < 0 ? 'slide-r' : ''}">${day.note && pos === 0 ? `<div class="daynote">${esc(day.note)}</div>` : ''}${renderExercise(week, day, ex)}
        <div class="exnav"><button class="btn ghost small" data-action="go-ex" data-ex="${prev ? prev.idx : ''}" ${prev ? '' : 'disabled'} aria-label="Predošlý cvik">${ICON.back}Predošlý</button>
          <span>${pos + 1} / ${list.length}<small>potiahni ← →</small></span>
          <button class="btn ghost small" data-action="go-ex" data-ex="${next ? next.idx : ''}" ${next ? '' : 'disabled'} aria-label="Ďalší cvik">Ďalší${ICON.next}</button></div></div>
      ${(allDone || finished) ? `<div class="wo-foot">${finished
        ? `<button class="btn ghost" data-action="summary">${ICON.check}Tréning hotový – súhrn</button>`
        : '<button class="btn cta" data-action="summary">Dokončiť tréning</button>'}</div>` : ''}`;
  }
  const clockText = (from) => { const sec = Math.max(0, Math.floor((Date.now() - from) / 1000)); return `${Math.floor(sec / 60)}:${pad(sec % 60)}`; };

  function exHeader(week, day, ex) {
    const parts = splitParts(ex.name);
    const hasHistory = parts.some((p) => progressSeries(p).length > 0);
    const name = parts.length > 1 ? parts.map((p) => esc(cap(p))).join('<span class="plus">+ superset</span>') : esc(cap(ex.name));
    const last = findLast(week, day, ex);
    const lastSets = last && last.done.sets ? (last.done.sets === 'Ok' ? 'Ok' : prettySets(last.done.sets)) : '–';
    const lastW = last && last.done.weight ? prettyWeight(last.done.weight).replace(/ kg$/, '') : '–';
    const lastR = last && last.done.rpe ? prettyRpe(last.done.rpe) : '–';
    const pw = prettyWeight(ex.planned.weight).replace(/ kg$/, '');
    const cmp = `<div class="cmp"><span></span><span class="k">Série</span><span class="k">Váha</span><span class="k">RPE</span>
      <span class="k">Plán</span><span class="v num">${esc(prettySets(ex.planned.sets))}</span><span class="v num">${esc(pw)}</span><span class="v num">${esc(prettyRpe(ex.planned.rpe))}</span>
      ${last ? `<span class="k">Minule<small>${esc(lastLabel(last))}</small></span><span class="v num last">${esc(lastSets)}</span><span class="v num last">${esc(lastW)}</span><span class="v num last">${esc(lastR)}</span>` : ''}</div>`;
    return `<div class="exn"><h1 class="h-xl">${name}</h1>${hasHistory ? `<button class="icon-btn small" data-action="progress" data-name="${esc(ex.name)}" aria-label="Graf progresu">${ICON.chart}</button>` : ''}</div>
      ${ex.planned.note ? `<div class="coachnote"><b>Tréner:</b><span>${esc(ex.planned.note)}</span></div>` : ''}
      ${cmp}${last && last.done.note ? `<div class="lastnote">Minule si poznamenal: „${esc(last.done.note)}“</div>` : ''}${exTip(week, day, ex, last)}`;
  }
  function exTip(week, day, ex, last) {
    if (!last) return '';
    const pw = C.parseWeight(ex.planned.weight), lw = weightParts(last.done.weight)[0];
    const lr = C.parseRpe(last.done.rpe);
    let t = '';
    if (pw && pw.lo > 0 && lw > 0 && pw.lo > lw) t = `Tréner pridal <b>+${esc(fmtKg(pw.lo - lw))} kg</b>.${lr ? ` Minule RPE ${esc(fmtKg(lr[1]))}${lr[1] <= 8 ? ' – máš rezervu.' : '.'}` : ''}`;
    else if (C.missed(ex.name, last.planned, last.done)) t = `Minule ${esc(prettySets(last.done.sets))} – dnes skús dať celý plán.`;
    else if (pw && pw.lo > 0 && lw > 0 && pw.lo === lw && lr && lr[1] <= 7) t = 'Minule to bolo ľahké – ak ide technika, skús o krok viac.';
    const best = bestBefore(week, day, ex);
    if (!t && best > 0 && pw && pw.lo > best) t = `Plán je nad tvojím rekordom (${esc(fmtKg(best))} kg) – ideš na nový.`;
    return t ? `<div class="ptip">${ICON.bolt}<span>${t}</span></div>` : '';
  }

  function renderExercise(week, day, ex) {
    const done = getDone(week, day, ex);
    const isDone = hasAny(done);
    const st = exState(week, day, ex);
    const local = state.local[exKey(week.n, day.n, ex.idx)];
    const head = exHeader(week, day, ex);
    if (isDone && !st.edit) {
      const map = { pending: ['pending', 'Odosielam…'], saved: ['ok', 'Uložené v tabuľke'], error: ['err', (local && local.error) || 'Chyba'], local: ['local', 'Uložené v telefóne'] };
      const [cls, txt] = local ? (map[local.status] || ['', '']) : ['ok', 'V tabuľke'];
      const nextIdx = nextOpenEx(week, day, ex.idx);
      return head + `<div class="card exdone"><span class="eyebrow">Zapísané</span><span class="res num">${esc(doneSummary(done))}</span>
        ${done.note ? `<span class="muted">„${esc(done.note)}“</span>` : ''}<span class="status ${cls}">${cls === 'ok' ? ICON.check : ''}${esc(txt)}</span>
        <div class="row2"><button class="btn ghost" data-action="ex-edit" data-ex="${ex.idx}">Upraviť</button>${nextIdx != null ? `<button class="btn" data-action="go-ex" data-ex="${nextIdx}">Ďalší cvik</button>` : ''}</div></div>`;
    }
    if (st.quick || !planInfo(ex)) return head + renderQuick(week, day, ex, done);
    return head + renderSimple(week, day, ex, st);
  }

  // Zápis celého cviku naraz: Série · Opakovania · Váha (± predvyplnené plánom), RPE, poznámka.
  function renderSimple(week, day, ex, st) {
    const info = planInfo(ex);
    const id = `${week.n}-${day.n}-${ex.idx}`;
    const last = findLast(week, day, ex);
    const lastKg = last ? weightParts(last.done.weight)[0] : null;
    const range = info.max > info.min ? ` <small>${info.min}–${info.max}</small>` : '';
    const ctl = (key, label, val, mode) => `<div class="fld"><div class="lbl">${label}</div><div class="big">
      <button data-action="cur" data-k="${key}" data-d="-1" data-ex="${ex.idx}" aria-label="Menej">−</button>
      <input id="${key}-${id}" inputmode="${mode}" autocomplete="off" value="${esc(val)}" data-cur="${key}" data-ex="${ex.idx}" aria-label="${esc(label.replace(/<[^>]+>/g, ''))}">
      <button data-action="cur" data-k="${key}" data-d="1" data-ex="${ex.idx}" aria-label="Viac">+</button></div></div>`;
    const kgDelta = lastKg > 0 && st.cur.kg > 0 && st.cur.kg !== lastKg ? `<span class="${st.cur.kg > lastKg ? 'up' : 'down'}">${st.cur.kg > lastKg ? '↑ +' : '↓ −'}${esc(fmtKg(Math.abs(st.cur.kg - lastKg)))} kg oproti minule</span>` : lastKg > 0 && st.cur.kg === lastKg ? '= ako minule' : '';
    const rest = restSeconds(ex, day);
    return `<div class="card logc">
      <div class="ctrl">${ctl('sets', 'Série', st.cur.sets, 'numeric')}${ctl('reps', 'Opakovania' + range, st.cur.reps, 'numeric')}</div>
      ${ctl('kg', 'Váha (kg)', st.cur.kg ? fmtKg(st.cur.kg) : '', 'decimal')}
      <div class="delta" id="kgdelta-${id}">${kgDelta}</div>
      <div class="lbl">RPE <small>ako ťažké to bolo</small></div>
      <div class="rpe-row">${RPE_VALUES.map((v) => `<button class="${st.rpe === v ? 'on' : ''}" data-action="ex-rpe" data-ex="${ex.idx}" data-value="${v}">${esc(v.replace('.', ','))}</button>`).join('')}</div>
      <textarea class="note" id="note-${id}" data-ex="${ex.idx}" data-live-note="1" rows="1" placeholder="Poznámka pre trénera (nepovinné)">${esc(st.note)}</textarea>
      <button class="btn cta" data-action="ex-save" data-ex="${ex.idx}">${ICON.check}Uložiť cvik</button>
    </div>
    <div class="row2 tools"><button class="btn ghost" data-action="rest-start" data-ex="${ex.idx}">⏱ Pauza ${fmtTime(rest)}</button><button class="btn ghost" data-action="ex-quick" data-ex="${ex.idx}">Iný zápis</button></div>
    <div class="hint center">„Iný zápis“ – nerovnaké série (napr. 10, 9, 8) alebo superset.</div>`;
  }

  // Porovnanie zadanej váhy s minulou (rýchly zápis).
  function deltaHtml(now, before) {
    const a = weightParts(now), b = weightParts(before);
    const items = [];
    a.forEach((v, i) => { if (v != null && b[i] != null) items.push(Math.round((v - b[i]) * 10) / 10); });
    if (!items.length) return '';
    if (items.every((d) => d === 0)) return '= ako minule';
    return items.map((d) => (d > 0 ? `<span class="up">↑ +${fmtKg(d)} kg</span>` : d < 0 ? `<span class="down">↓ −${fmtKg(-d)} kg</span>` : '=')).join(' · ') + ' oproti minule';
  }
  function updateDelta(input) {
    const el = document.getElementById(input.id.replace(/^weight-/, 'delta-'));
    if (el) el.innerHTML = input.dataset.lastWeight ? deltaHtml(input.value, input.dataset.lastWeight) : '';
  }

  function renderQuick(week, day, ex, done) {
    const id = `${week.n}-${day.n}-${ex.idx}`;
    const isSuperset = splitParts(ex.name).length > 1;
    const last = findLast(week, day, ex);
    const canCopy = last && (last.done.sets || last.done.weight);
    const rpeVals = String(done.rpe || '').split(/\s+a\s+/).map((s) => s.trim());
    return `<div class="card form">
      ${canCopy ? `<button class="btn ghost" data-action="copy-last" data-id="${id}" data-sets="${esc(last.done.sets)}" data-weight="${esc(last.done.weight)}">↺ Ako minule · ${esc([last.done.sets ? prettySets(last.done.sets) : '', last.done.weight ? prettyWeight(last.done.weight) : ''].filter(Boolean).join(' · '))}</button>` : ''}
      <div class="row2">
        <div class="field"><label for="sets-${id}">Série × opak.</label><div class="with-btn"><input id="sets-${id}" data-draft value="${esc(done.sets)}" placeholder="${esc(ex.planned.sets || '2x8')}" autocomplete="off" autocorrect="off"><button class="mini" data-action="ok" data-target="sets-${id}" aria-label="Podľa plánu">Ok</button></div></div>
        <div class="field"><label for="weight-${id}">Váha (kg)</label><input id="weight-${id}" data-draft value="${esc(done.weight)}" placeholder="${esc(/choose/i.test(ex.planned.weight) ? (last && last.done.weight) || 'kg' : ex.planned.weight || 'kg')}" ${isSuperset ? '' : 'inputmode="decimal"'} autocomplete="off" ${last && last.done.weight ? `data-last-weight="${esc(last.done.weight)}"` : ''}><div class="delta" id="delta-${id}"></div></div>
      </div>
      <div class="field"><label for="rpe-${id}">RPE${isSuperset ? ' – pri supersete napr. „8 a 7“' : ''}</label>
        <input id="rpe-${id}" data-draft value="${esc(done.rpe)}" placeholder="${esc(ex.planned.rpe || '')}" ${isSuperset ? '' : 'inputmode="decimal"'} autocomplete="off">
        <div class="chipsel" role="group" aria-label="Rýchly výber RPE">${RPE_VALUES.map((v) => `<button class="${rpeVals.includes(v) ? 'on' : ''}" data-action="rpe" data-target="rpe-${id}" data-value="${v}" data-multi="${isSuperset ? 1 : 0}">${v.replace('.', ',')}</button>`).join('')}</div></div>
      <div class="field"><label for="note-${id}">Poznámka pre trénera</label><textarea id="note-${id}" data-draft rows="1" placeholder="Ako to išlo?">${esc(done.note)}</textarea></div>
      <button class="btn cta" data-action="save-ex" data-ex="${ex.idx}" data-id="${id}">${ICON.check}Uložiť cvik</button>
    </div>${planInfo(ex) ? `<button class="quicklink" data-action="ex-sets" data-ex="${ex.idx}">Späť na jednoduchý zápis</button>` : ''}`;
  }

  // ----- Pauza -----
  function renderRest() {
    if (state.view.name !== 'workout' || !state.live || !state.live.rest) return '';
    const { week, day } = findDay();
    if (!day || state.live.key !== dayKey(week.n, day.n)) return '';
    const r = state.live.rest;
    const left = Math.max(0, Math.ceil((r.until - Date.now()) / 1000));
    const C2 = 2 * Math.PI * 118;
    const ex = day.exercises.find((e) => e.idx === r.exIdx);
    const st = ex && state.live.ex[ex.idx];
    const nextTxt = st && st.cur ? `Ďalšia séria: <b>${st.cur.kg ? esc(fmtKg(st.cur.kg)) + ' kg × ' : ''}${st.cur.reps}</b>` : '';
    return `<div class="pause ${left === 0 ? 'end' : ''}" role="dialog" aria-label="Pauza"><div><div class="eyebrow">Pauza</div>
      <div class="rring"><svg viewBox="0 0 260 260"><defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--a1)"/><stop offset="1" style="stop-color:var(--a2)"/></linearGradient></defs><circle class="bgc" cx="130" cy="130" r="118"/><circle class="fg" id="rfg" cx="130" cy="130" r="118" stroke-dasharray="${C2}" stroke-dashoffset="${C2 * (1 - left / r.total)}"/></svg>
      <div class="t"><span class="num" id="rleft">${Math.floor(left / 60)}:${pad(left % 60)}</span><span>${left === 0 ? 'poď na to' : 'oddychuj'}</span></div></div>
      <div class="next">${nextTxt}</div>
      <div class="acts"><button class="btn ghost" data-action="rest-plus">+30 s</button><button class="btn" data-action="rest-skip">${left === 0 ? 'Pokračovať' : 'Preskočiť'}</button></div></div></div>`;
  }
  let audioCtx = null;
  function beep() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.25].forEach((t) => {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.frequency.value = 880; o.connect(g); g.connect(audioCtx.destination);
        g.gain.setValueAtTime(0.0001, audioCtx.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.3, audioCtx.currentTime + t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + t + 0.18);
        o.start(audioCtx.currentTime + t); o.stop(audioCtx.currentTime + t + 0.2);
      });
    } catch (_) { /* zvuk nie je k dispozícii */ }
  }
  function tick() {
    const { week, day } = findDay();
    if (!day) return;
    const s = state.sessions[dayKey(week.n, day.n)] || {};
    const c = document.getElementById('clock');
    if (c && s.startedAt && !s.finishedAt && !day.time) c.textContent = clockText(s.startedAt);
    const r = state.live && state.live.rest;
    if (!r) return;
    const left = Math.max(0, Math.ceil((r.until - Date.now()) / 1000));
    const C2 = 2 * Math.PI * 118;
    const fg = document.getElementById('rfg'), t = document.getElementById('rleft');
    if (fg) fg.setAttribute('stroke-dashoffset', C2 * (1 - left / r.total));
    if (t) t.textContent = `${Math.floor(left / 60)}:${pad(left % 60)}`;
    if (left === 0 && !r.buzzed) {
      r.buzzed = true;
      saveLive();
      buzz([250, 120, 250]);
      if (document.visibilityState === 'visible') beep();
      render();
    }
  }

  // ----- Súhrn tréningu -----
  function summaryData(week, day) {
    const rows = day.exercises.map((ex) => {
      const done = getDone(week, day, ex);
      const last = findLast(week, day, ex);
      const vol = hasAny(done) ? C.totalKg(C.volume(ex.name, ex.planned, done)) : 0;
      const lastVol = last ? C.totalKg(C.volume(ex.name, last.planned, last.done)) : 0;
      const top = weightParts(done.weight)[0];
      const best = bestBefore(week, day, ex);
      const pr = hasAny(done) && best > 0 && top > best ? { top, best } : null;
      const ps = C.parseSets(done.sets);
      const pl = C.parseSets(ex.planned.sets);
      const sets = ps && !ps.ok ? ps.sets.length : ps && ps.ok && pl && !pl.ok ? pl.sets.length : 0;
      return { ex, done, last, isDone: hasAny(done), vol, lastVol, pr, sets };
    });
    return { rows, done: rows.filter((r) => r.isDone).length, prs: rows.filter((r) => r.pr), sets: rows.reduce((a, r) => a + r.sets, 0) };
  }
  function renderSummary() {
    const { week, day } = findDay();
    if (!day) return '';
    const s = state.sessions[dayKey(week.n, day.n)] || {};
    const data = summaryData(week, day);
    const autoMins = s.startedAt ? Math.max(1, Math.round(((s.finishedAt || Date.now()) - s.startedAt) / 60000)) : '';
    const mins = s.minutes || String(day.time).replace(/\D+/g, '') || autoMins;
    const rpe = s.rpe || day.seshDone || '';
    const prs = data.prs.map((r) => `<div class="prc grad">${ICON.trophy}<div><b>Nový rekord: ${esc(niceName(r.ex.name))}</b><span>${esc(fmtKg(r.pr.top))} kg (doteraz ${esc(fmtKg(r.pr.best))} kg)</span></div></div>`).join('');
    const list = data.rows.map((r) => {
      const p = r.vol && r.lastVol ? r.vol / r.lastVol - 1 : null;
      return `<div class="srow ${r.isDone ? '' : 'skipped'}"><div class="nm"><b>${esc(niceName(r.ex.name))}</b><span>${r.isDone ? esc(doneSummary(r.done)) : 'nevyplnené'}</span></div>
        ${r.vol ? `<div class="vol"><b>${esc(C.formatVolume(r.vol))} kg</b>${p != null ? `<span class="${p > 0.0005 ? 'up' : p < -0.0005 ? 'down' : ''}">${esc(C.formatPct(p))}</span> objem` : 'objem'}</div>` : ''}</div>`;
    }).join('');
    return `<div class="sheet-backdrop" data-action="close-sheet"><div class="sheet" role="dialog" aria-label="Súhrn tréningu">
      <div class="grab"></div>
      <div class="sheet-head"><span style="flex:1"></span><button class="icon-btn small" data-action="close-sheet" aria-label="Zavrieť">${ICON.close}</button></div>
      <div class="sum-head"><div class="medal grad">${ICON.trophy}</div><div class="eyebrow">Týždeň ${week.n} · Deň ${day.n} · ${esc(formatDate(day.date))}</div><h2 class="h-xl">Tréning <span class="gtext">hotový</span></h2></div>
      <div class="tiles"><div class="tile"><span class="num">${mins || '–'}</span><span class="k">${mins ? plural(Number(mins), 'minúta', 'minúty', 'minút') : 'minút'}</span></div><div class="tile"><span class="num">${data.sets || data.done}</span><span class="k">${data.sets ? 'sérií' : 'cvikov'}</span></div><div class="tile"><span class="num gtext">${data.prs.length}</span><span class="k">${plural(data.prs.length, 'rekord', 'rekordy', 'rekordov')}</span></div></div>
      ${prs}
      <div class="sec"><h3>Cviky</h3><span class="r muted">objem oproti minule</span></div>
      <div class="list">${list}</div>
      <div class="form" style="margin-top:16px">
        <div class="field"><label for="fin-time">Trvanie (min)</label><input id="fin-time" inputmode="numeric" value="${esc(mins)}"></div>
        <div class="field"><label>Celý tréning bol (RPE)</label><input id="fin-rpe" type="hidden" value="${esc(rpe)}">
          <div class="rpe-row five">${['6', '7', '8', '9', '10'].map((v) => `<button class="${rpe === v ? 'on' : ''}" data-action="rpe" data-target="fin-rpe" data-value="${v}" data-multi="0">${v}</button>`).join('')}</div></div>
        <button class="btn cta" data-action="finish-save">${ICON.check}Uložiť tréning</button>
      </div></div></div>`;
  }

  // ----- Graf -----
  function chartSvg(pts, pi, compact) {
    const W = 340, H = compact ? 140 : 180, L = 36, R = 14, T = 22, B = 26;
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
    for (let v = lo; v <= hi + 1e-9; v += step) grid.push(`<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${fmtKg(v)}</text>`);
    const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
    const area = `${path} L${x(pts.length - 1).toFixed(1)},${H - B} L${x(0).toFixed(1)},${H - B} Z`;
    const sel = !compact && state.progress && state.progress.sel && state.progress.sel.pi === pi ? state.progress.sel.i : pts.length - 1;
    const dots = compact ? `<g class="pt sel"><circle class="dot" cx="${x(pts.length - 1)}" cy="${y(pts[pts.length - 1].value)}" r="5"/></g>`
      : pts.map((p, i) => `<g class="pt ${i === sel ? 'sel' : ''}" data-action="chart-pt" data-pi="${pi}" data-i="${i}"><circle class="hit" cx="${x(i)}" cy="${y(p.value)}" r="16"/><circle class="dot" cx="${x(i)}" cy="${y(p.value)}" r="${i === sel ? 6 : 4.5}"/></g>`).join('');
    const sp = pts[sel];
    const label = `${fmtKg(sp.value)} kg · ${sp.date ? formatDate(sp.date, false) : 'T' + sp.week}`;
    const lx = Math.min(Math.max(x(sel), L + 50), W - R - 50);
    const xLabels = [0, pts.length - 1].filter((v, i, a) => a.indexOf(v) === i).map((i) =>
      `<text class="axis" x="${x(i)}" y="${H - 6}" text-anchor="${pts.length === 1 ? 'middle' : i === 0 ? 'start' : 'end'}">${esc(pts[i].date ? formatDate(pts[i].date, false) : 'T' + pts[i].week)}</text>`).join('');
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Graf">
      <defs><linearGradient id="cg${pi}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" style="stop-color:var(--a2)"/><stop offset="1" style="stop-color:var(--a1)"/></linearGradient><linearGradient id="ca${pi}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--a1);stop-opacity:.25"/><stop offset="1" style="stop-color:var(--a1);stop-opacity:0"/></linearGradient></defs>
      ${grid.join('')}<path d="${area}" fill="url(#ca${pi})"/><path class="line" d="${path}" style="stroke:url(#cg${pi})"/>${dots}
      ${compact ? '' : `<text class="tip" x="${lx}" y="${Math.max(14, y(sp.value) - 12)}" text-anchor="middle">${esc(label)}</text>`}${xLabels}</svg>`;
  }
  function niceStep(raw) {
    const p = Math.pow(10, Math.floor(Math.log10(raw || 1)));
    const n = raw / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  }
  function progressTable(pts) {
    const rows = pts.slice().reverse().slice(0, 12).map((p) => `<tr><td>${esc(p.date ? formatDate(p.date, false) : 'T' + p.week)}</td><td>${esc(p.done.sets === 'Ok' ? 'Ok' : prettySets(p.done.sets))}</td><td><b>${fmtKg(p.value)}</b></td><td>${esc(prettyRpe(p.done.rpe))}</td></tr>`).join('');
    return `<table class="ptable"><thead><tr><th>Dátum</th><th>Série</th><th>kg</th><th>RPE</th></tr></thead><tbody>${rows}</tbody></table>`;
  }
  function renderProgress() {
    const name = state.progress.name;
    const parts = splitParts(name);
    const charts = parts.map((p, pi) => {
      const pts = progressSeries(p);
      const max = pts.length ? Math.max(...pts.map((x) => x.value)) : 0;
      const d = pts.length > 1 ? pts[pts.length - 1].value - pts[0].value : null;
      return `<div class="chart-block">${parts.length > 1 ? `<div class="chart-title">${esc(cap(p))}</div>` : ''}
        ${pts.length ? `<div class="tiles"><div class="tile"><span class="num gtext">${esc(fmtKg(max))}</span><span class="k">rekord kg</span></div><div class="tile"><span class="num">${esc(fmtKg(pts[pts.length - 1].value))}</span><span class="k">posledne</span></div><div class="tile"><span class="num">${d == null ? '–' : (d > 0 ? '+' : d < 0 ? '−' : '') + esc(fmtKg(Math.abs(d)))}</span><span class="k">kg od začiatku</span></div></div>${chartSvg(pts, pi)}${progressTable(pts)}` : '<div class="hint">Zatiaľ žiadne zapísané váhy.</div>'}</div>`;
    }).join('');
    return `<div class="sheet-backdrop" data-action="close-sheet"><div class="sheet" role="dialog" aria-label="Progres cviku">
      <div class="grab"></div><div class="sheet-head"><h2>${esc(parts.map(cap).join(' + '))}</h2><button class="icon-btn small" data-action="close-sheet" aria-label="Zavrieť">${ICON.close}</button></div>
      <p>Váha v kg – aj zo starších blokov</p>${charts}</div></div>`;
  }
  function renderWeightSheet() {
    const list = getWeights();
    const pts = list.slice(-90).map((w) => ({ date: w.date, value: w.kg, done: {} }));
    const rows = list.slice().reverse().slice(0, 30).map((w) => `<tr><td>${esc(formatDate(w.date))}</td><td><b>${esc(fmtKg(w.kg))}</b> kg</td></tr>`).join('');
    const today = todayIso();
    const avg7 = avgBetween(list, isoMinus(6), today), avg30 = avgBetween(list, isoMinus(29), today);
    return `<div class="sheet-backdrop" data-action="close-sheet"><div class="sheet" role="dialog" aria-label="Ranná váha">
      <div class="grab"></div><div class="sheet-head"><h2>Ranná váha</h2><button class="icon-btn small" data-action="close-sheet" aria-label="Zavrieť">${ICON.close}</button></div>
      <p>Ukladá sa do záložky „Váha“ v trénerovej tabuľke.</p>
      <div class="tiles"><div class="tile"><span class="num">${list.length ? esc(fmtKg(list[list.length - 1].kg)) : '–'}</span><span class="k">posledná</span></div>
        <div class="tile"><span class="num">${avg7 != null ? esc(fmtKg(Math.round(avg7 * 10) / 10)) : '–'}</span><span class="k">priemer 7 dní</span></div>
        <div class="tile"><span class="num">${avg30 != null ? esc(fmtKg(Math.round(avg30 * 10) / 10)) : '–'}</span><span class="k">priemer 30 dní</span></div></div>
      ${pts.length ? chartSvg(pts, 0) : '<div class="hint">Zatiaľ žiadne váženie.</div>'}
      ${rows ? `<table class="ptable"><thead><tr><th>Dátum</th><th>Váha</th></tr></thead><tbody>${rows}</tbody></table>` : ''}
    </div></div>`;
  }

  // ----- Fotky progresu -----
  const photosSupported = () => hasWrite() && state.plan && state.plan.photos && Array.isArray(state.plan.photos.list);
  function renderPhotoSheet() {
    const ph = state.plan.photos || { list: [] };
    const drafts = state.photoDrafts;
    const ready = drafts.filter((d) => d.status === 'ready' || d.status === 'error').length;
    const grid = drafts.length ? `<div class="pgrid">${drafts.map((d) => `
      <div class="pthumb ${d.status}"><img src="${d.url}" alt="">
        ${d.status === 'uploading' ? '<div class="pstate"><div class="spinner small"></div></div>' : ''}
        ${d.status === 'done' ? `<div class="pstate ok">${ICON.check}</div>` : ''}
        ${d.status === 'error' ? '<div class="pstate err">!</div>' : ''}
        ${d.status === 'ready' || d.status === 'error' ? `<button class="premove" data-action="photo-remove" data-id="${d.id}" aria-label="Odstrániť">${ICON.close}</button>` : ''}
      </div>`).join('')}</div>` : '';
    const past = (ph.list || []).slice().reverse().map((x) => `<a class="prow" href="${esc(x.url)}" target="_blank" rel="noopener"><span>${esc(formatDate(x.date))}</span><span class="muted">${x.count} ${plural(x.count, 'fotka', 'fotky', 'fotiek')}</span><span class="pmore">Otvoriť ${ICON.next}</span></a>`).join('');
    let share = 'Uložia sa na tvoj Google Drive do priečinka „Fitko – progres fotky“. Vidí ich len tréner.';
    if (ph.sharedWith) share = `Uložia sa na tvoj Google Drive. Priečinok je zdieľaný len s <b>${esc(ph.sharedWith)}</b>.`;
    else if (ph.sharedWith === '' && ph.folderUrl) share = `Priečinok sa nepodarilo nazdieľať automaticky. <a href="${esc(ph.folderUrl)}" target="_blank" rel="noopener">Otvor ho na Drive</a> a nazdieľaj ho trénerovi.`;
    return `<div class="sheet-backdrop" data-action="close-sheet"><div class="sheet" role="dialog" aria-label="Fotky progresu">
      <div class="grab"></div><div class="sheet-head"><h2>Fotky progresu</h2><button class="icon-btn small" data-action="close-sheet" aria-label="Zavrieť">${ICON.close}</button></div>
      <p>${share}</p>
      <div class="pick"><label class="btn ghost" for="photo-camera">${ICON.camera}Odfotiť</label><label class="btn ghost" for="photo-gallery">${ICON.image}Z galérie</label></div>
      ${grid}
      ${state.photoError && drafts.some((d) => d.status === 'error') ? `<div class="banner err"><div>${esc(state.photoError.hint)}<div class="err-detail">Detail: ${esc(state.photoError.detail)}</div></div></div>` : ''}
      ${ready ? `<button class="btn" data-action="photos-upload" ${state.uploading ? 'disabled' : ''}>${state.uploading ? 'Odosielam…' : `Odoslať trénerovi (${ready})`}</button>` : ''}
      ${past ? `<div class="sec"><h3>Odoslané</h3></div><div class="list">${past}</div>` : ''}
    </div></div>`;
  }
  async function resizeImage(file) {
    const src = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
      const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      return await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.82));
    } finally { URL.revokeObjectURL(src); }
  }
  const blobToBase64 = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); });
  async function addPhotoFiles(files) {
    for (const file of files) {
      if (state.photoDrafts.length >= 8) { toast('Naraz najviac 8 fotiek'); break; }
      try {
        const blob = await resizeImage(file);
        state.photoDrafts.push({ id: Math.random().toString(36).slice(2), blob, url: URL.createObjectURL(blob), status: 'ready' });
      } catch (_) { toast('Fotku sa nepodarilo načítať'); }
      render();
    }
  }
  async function uploadPhotos() {
    if (state.uploading) return;
    state.uploading = true;
    state.photoError = null;
    const date = todayIso();
    let okCount = 0;
    for (const d of state.photoDrafts) {
      if (d.status !== 'ready' && d.status !== 'error') continue;
      d.status = 'uploading';
      render();
      try {
        const data = await blobToBase64(d.blob);
        const res = await fetch(state.config.scriptUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ token: state.config.token, photo: { date, data } }) });
        const out = await res.json();
        if (!out.ok) throw new Error(out.error || 'Chyba');
        d.status = 'done';
        okCount++;
        const ph = state.plan.photos;
        const entry = ph.list.find((x) => x.date === out.date);
        if (entry) { entry.count = out.count; entry.url = out.url; } else ph.list.push({ date: out.date, count: out.count, url: out.url });
        ph.list.sort((a, b) => (a.date < b.date ? -1 : 1));
        if (out.sharedWith != null) ph.sharedWith = out.sharedWith;
        save(LS.plan, state.plan);
      } catch (e) { d.status = 'error'; d.error = e.message; }
      render();
    }
    state.uploading = false;
    render();
    const failed = state.photoDrafts.find((d) => d.status === 'error');
    if (okCount && !failed) toast(`Odoslané trénerovi: ${okCount} 📸`);
    else if (failed) {
      const msg = String(failed.error || '');
      const hint = /permission|authoriz|povolen/i.test(msg)
        ? 'Skript nemá povolený prístup k Google Drive. V Apps Script editore vyber funkciu povolitDrive, klikni Run a povoľ prístup (zaškrtni všetko). Potom skús znova.'
        : /failed to fetch|load failed|network/i.test(msg) ? 'Nepodarilo sa spojiť so serverom – skontroluj pripojenie a skús znova.' : 'Odoslanie zlyhalo.';
      state.photoError = { hint, detail: msg };
      render();
    }
  }
  function clearDoneDrafts() {
    state.photoDrafts = state.photoDrafts.filter((d) => { if (d.status === 'done') { URL.revokeObjectURL(d.url); return false; } return true; });
  }

  // ----- Nastavenia -----
  function renderSettings() {
    const c = state.config;
    const sheetUrl = c.sheetId ? `https://docs.google.com/spreadsheets/d/${c.sheetId}/edit${c.gid ? '#gid=' + c.gid : ''}` : '';
    const first = !isConfigured();
    return `<div class="top">${first ? '' : `<button class="icon-btn" data-action="back" aria-label="Späť">${ICON.back}</button>`}
        <div class="who"><span class="eyebrow">${first ? 'Vitaj vo Fitku' : 'Nastavenia'}</span><b>${first ? 'Prepoj apku s plánom od trénera' : 'Prepojenie s Google tabuľkou'}</b></div></div>
      <form class="form" id="settings-form" autocomplete="off">
        <div class="sec" style="margin-top:4px"><h3>Plán od trénera</h3></div>
        <div class="card form">
          <div class="field"><label for="cfg-url">Odkaz na Google tabuľku</label><input id="cfg-url" name="url" value="${esc(sheetUrl)}" placeholder="https://docs.google.com/spreadsheets/d/…" inputmode="url"><div class="hint">Tabuľka musí byť zdieľaná ako „Ktokoľvek s odkazom“. Apka z nej len číta.</div></div>
          <div class="field"><label for="cfg-sheet">Názov hárku (záložky)</label><input id="cfg-sheet" name="sheet" value="${esc(c.sheetName)}" placeholder="napr. COMEBACK NOV"><div class="hint">So zapnutým zápisom (nižšie) môže ostať prázdne – aktuálny hárok sa nájde sám.</div></div>
        </div>
        <div class="sec"><h3>Zápis výsledkov</h3></div>
        <div class="card form">
          <div class="field"><label for="cfg-script">URL Apps Script webovej aplikácie</label><input id="cfg-script" name="script" value="${esc(c.scriptUrl)}" placeholder="https://script.google.com/macros/s/…/exec" inputmode="url"></div>
          <div class="field"><label for="cfg-token">Heslo (TOKEN zo skriptu)</label><input id="cfg-token" name="token" value="${esc(c.token)}" type="password" placeholder="••••••"><div class="hint">Voliteľné. Bez toho apka funguje, ale tvoje váhy/RPE ostanú len v telefóne. Návod je v README v repozitári.</div></div>
        </div>
        <button class="btn" type="submit">${first ? 'Načítať plán' : 'Uložiť a načítať'}</button>
        ${first ? '' : `<button class="btn ghost" type="button" data-action="copy-setup">Skopírovať odkaz na nastavenie pre iný mobil</button>`}
        ${hasWrite() ? `<button class="btn ghost" type="button" data-action="copy-coach">Skopírovať odkaz pre trénera</button>
        <div class="hint">Pošli ho trénerovi – otvorí ním svoj panel (trener.html) a pridá si ťa medzi klientov. Prihlási sa svojím menom a heslom trénera, tvoje heslo odkaz neobsahuje.</div>` : ''}
      </form>
      <div class="sec"><h3>Vzhľad</h3><span class="r muted">len v tomto telefóne</span></div>
      <div class="looks">${Object.entries(THEMES).map(([k, t]) => `<button class="look ${currentTheme() === k ? 'on' : ''}" data-action="theme" data-theme="${k}" aria-pressed="${currentTheme() === k}"><div class="swatch ${k}">${k === 'matrix' ? '&gt;_ fitko' : ''}</div><b>${t.name}</b><span>${t.desc}</span></button>`).join('')}</div>
      <div class="app-version">Fitko · verzia ${APP_VERSION}</div>`;
  }

  function renderSheet() {
    if (state.sheetOpen === 'summary') return renderSummary();
    if (state.sheetOpen === 'progress' && state.progress) return renderProgress();
    if (state.sheetOpen === 'weight') return renderWeightSheet();
    if (state.sheetOpen === 'photos' && state.plan) return renderPhotoSheet();
    return '';
  }

  // ---------------------------------------------------------------------------
  // Udalosti
  // ---------------------------------------------------------------------------
  app.addEventListener('input', (e) => {
    const t = e.target;
    if (t.matches('[data-draft]')) t.dataset.dirty = '1';
    if (t.dataset && t.dataset.lastWeight != null) updateDelta(t);
    if (t.id && t.id.startsWith('rpe-')) {
      const vals = t.value.split(/\s+a\s+/).map((s) => s.trim());
      t.parentElement.querySelectorAll('.chipsel button').forEach((c) => c.classList.toggle('on', vals.includes(c.dataset.value)));
    }
    // ovládače aktuálnej série a poznámka – priamo do rozpracovaného stavu
    if (t.dataset.cur && state.live) {
      const st = state.live.ex[t.dataset.ex];
      if (st) {
        const v = toNum(t.value);
        if (t.dataset.cur === 'kg') st.cur.kg = v >= 0 ? v : 0;
        else st.cur[t.dataset.cur] = Math.max(0, Math.round(v) || 0);
        st.touched = true;
        saveLive();
      }
    }
    if (t.dataset.liveNote && state.live) {
      const st = state.live.ex[t.dataset.ex];
      if (st) { st.note = t.value; st.touched = true; saveLive(); }
    }
  });
  document.addEventListener('change', (e) => {
    if (e.target.matches('[data-photo-input]') && e.target.files && e.target.files.length) {
      const files = [...e.target.files];
      e.target.value = '';
      addPhotoFiles(files);
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
    state.view = { name: 'today', weekIdx: null };
    refresh();
  });
  app.addEventListener('click', (e) => {
    const t = e.target.closest('[data-action]');
    if (!t) return;
    const action = t.dataset.action;
    if (action === 'close-sheet' && t.classList.contains('sheet-backdrop') && t !== e.target) return;
    handle(action, t);
  });

  function curEx(t) {
    const { week, day } = findDay();
    const ex = day && day.exercises.find((x) => x.idx === Number(t.dataset.ex));
    return { week, day, ex, st: ex ? exState(week, day, ex) : null };
  }
  function openDay(wi, dayN) {
    state.view = { ...state.view, name: 'workout', weekIdx: wi, dayN, exIdx: null };
    const { week, day } = findDay();
    if (day) state.view.exIdx = nextOpenEx(week, day, null);
    render();
    window.scrollTo(0, 0);
  }
  function goEx(idx) {
    state.view.exIdx = idx;
    render();
    window.scrollTo(0, 0);
  }
  // Po uložení cviku: ďalší nezapísaný, inak súhrn.
  function afterSave(week, day, ex) {
    const next = nextOpenEx(week, day, ex.idx);
    const dk = dayKey(week.n, day.n);
    if (next == null) {
      if (!(state.sessions[dk] && state.sessions[dk].finishedAt) && !day.time) state.sheetOpen = 'summary';
      render();
    } else goEx(next);
  }

  // Swipe doľava/doprava medzi cvikmi (ako na sociálnych sieťach).
  let touch = null;
  app.addEventListener('touchstart', (e) => {
    touch = null;
    if (state.view.name !== 'workout' || state.sheetOpen || (state.live && state.live.rest) || e.touches.length !== 1) return;
    if (e.target.closest('input, textarea, .big, .rpe-row, .chipsel, .steps')) return;
    touch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: true });
  app.addEventListener('touchend', (e) => {
    if (!touch) return;
    const dx = e.changedTouches[0].clientX - touch.x, dy = e.changedTouches[0].clientY - touch.y;
    touch = null;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    swipeEx(dx < 0 ? 1 : -1);
  }, { passive: true });
  function swipeEx(dir) {
    const { day } = findDay();
    if (!day) return;
    const list = day.exercises;
    const pos = list.findIndex((e) => e.idx === state.view.exIdx);
    const np = pos + dir;
    if (np < 0 || np >= list.length) return;
    state.view.slide = dir;
    goEx(list[np].idx);
  }

  function handle(action, t) {
    switch (action) {
      case 'refresh': refresh(); break;
      case 'flush': flushQueue().then(render); break;
      case 'tab':
        state.view = { ...state.view, name: t.dataset.tab, weekIdx: t.dataset.tab === 'week' ? state.view.weekIdx : null };
        render();
        window.scrollTo(0, 0);
        break;
      case 'settings':
        state.view = { ...state.view, name: 'settings', prev: state.view.name === 'settings' ? state.view.prev : state.view.name };
        render();
        break;
      case 'back': {
        const prev = state.view.name === 'settings' ? state.view.prev : null;
        state.view = { ...state.view, name: prev && prev !== 'settings' ? prev : 'today', exIdx: prev === 'workout' ? state.view.exIdx : null };
        render();
        window.scrollTo(0, 0);
        break;
      }
      case 'week':
        state.view.weekIdx = Math.max(0, Math.min(state.plan.weeks.length - 1, state.view.weekIdx + Number(t.dataset.dir)));
        render();
        break;
      case 'open-day': openDay(Number(t.dataset.week), Number(t.dataset.day)); break;
      case 'go-ex': {
        if (t.dataset.ex === '') break;
        const { day } = findDay();
        const from = day ? day.exercises.findIndex((e) => e.idx === state.view.exIdx) : 0;
        const to = day ? day.exercises.findIndex((e) => e.idx === Number(t.dataset.ex)) : 0;
        state.view.slide = to > from ? 1 : to < from ? -1 : 0;
        goEx(Number(t.dataset.ex));
        break;
      }
      case 'cur': {
        const { ex, st } = curEx(t);
        if (!st) break;
        const k = t.dataset.k, d = Number(t.dataset.d);
        if (k === 'kg') st.cur.kg = Math.max(0, Math.round((st.cur.kg + d * kgStep(ex, st.cur.kg)) * 100) / 100);
        else st.cur[k] = Math.max(k === 'sets' ? 1 : 0, (st.cur[k] || 0) + d);
        st.touched = true;
        saveLive();
        render();
        break;
      }
      case 'rest-start': {
        const { week, day, ex } = curEx(t);
        if (!ex) break;
        startSession(week, day);
        setRest(week, day, ex);
        render();
        break;
      }
      case 'ex-rpe': {
        const { st } = curEx(t);
        if (!st) break;
        st.rpe = st.rpe === t.dataset.value ? '' : t.dataset.value;
        st.touched = true;
        saveLive();
        render();
        break;
      }
      case 'ex-save': {
        const { week, day, ex, st } = curEx(t);
        if (!st) break;
        if (!(st.cur.sets > 0 && st.cur.reps > 0)) { toast('Zadaj počet sérií a opakovaní'); break; }
        const best = bestBefore(week, day, ex);
        startSession(week, day);
        saveExercise(week, day, ex, composeFields(ex, st));
        if (best > 0 && st.cur.kg > best) toast(`Nový osobný rekord! ${fmtKg(st.cur.kg)} kg 🏆`);
        delete state.live.ex[ex.idx];
        if (state.live.rest && state.live.rest.exIdx === ex.idx) state.live.rest = null;
        saveLive();
        buzz(30);
        afterSave(week, day, ex);
        break;
      }
      case 'ex-quick': { const { st } = curEx(t); if (st) { st.quick = true; saveLive(); render(); } break; }
      case 'ex-sets': { const { st } = curEx(t); if (st) { st.quick = false; saveLive(); render(); } break; }
      case 'ex-edit': {
        const { week, day, ex, st } = curEx(t);
        if (!st) break;
        st.edit = true;
        // jednoduchý zápis s hodnotami zo zápisu; nerovnaké série a supersety „iným zápisom“
        const done = getDone(week, day, ex);
        const ps = C.parseSets(done.sets);
        const kg = weightParts(done.weight)[0];
        const uniform = ps && !ps.ok && ps.sets.every((x) => x.min === ps.sets[0].min);
        if (planInfo(ex) && uniform) {
          st.cur = { sets: ps.sets.length, reps: ps.sets[0].min, kg: kg || 0 };
          st.rpe = String(done.rpe || '');
          st.note = done.note || '';
          st.quick = false;
        } else st.quick = true;
        saveLive();
        render();
        break;
      }
      case 'rest-plus': if (state.live && state.live.rest) { state.live.rest.until += 30000; state.live.rest.total += 30; state.live.rest.buzzed = false; saveLive(); render(); } break;
      case 'rest-skip': if (state.live) { state.live.rest = null; saveLive(); render(); } break;
      case 'copy-last': {
        const id = t.dataset.id;
        const sets = document.getElementById(`sets-${id}`);
        const weight = document.getElementById(`weight-${id}`);
        if (t.dataset.sets) { sets.value = t.dataset.sets; sets.dataset.dirty = '1'; }
        if (t.dataset.weight) { weight.value = t.dataset.weight; weight.dataset.dirty = '1'; updateDelta(weight); }
        buzz(20);
        break;
      }
      case 'ok': { const input = document.getElementById(t.dataset.target); input.value = 'Ok'; input.dataset.dirty = '1'; break; }
      case 'rpe': {
        const input = document.getElementById(t.dataset.target);
        const v = t.dataset.value;
        let vals = input.value.split(/\s+a\s+/).map((s) => s.trim()).filter(Boolean);
        if (t.dataset.multi === '1') vals = vals.length >= 2 ? [v] : vals.concat(v);
        else vals = vals.length === 1 && vals[0] === v ? [] : [v];
        input.value = vals.join(' a ');
        input.dataset.dirty = '1';
        t.parentElement.querySelectorAll('button').forEach((c) => c.classList.toggle('on', vals.includes(c.dataset.value)));
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
        startSession(week, day);
        saveExercise(week, day, ex, fields);
        if (state.live) { delete state.live.ex[ex.idx]; saveLive(); }
        buzz(30);
        afterSave(week, day, ex);
        break;
      }
      case 'summary': state.sheetOpen = 'summary'; render(); break;
      case 'finish-save': {
        const { week, day } = findDay();
        const dk = dayKey(week.n, day.n);
        const s = state.sessions[dk] || {};
        const mins = document.getElementById('fin-time').value.trim();
        const rpe = document.getElementById('fin-rpe').value.trim();
        s.minutes = mins; s.rpe = rpe; s.finishedAt = Date.now();
        state.sessions[dk] = s;
        save(LS.sessions, state.sessions);
        saveSession(week, day, { time: mins ? mins + ' min' : '', rpe });
        if (state.live && state.live.key === dk) { state.live = null; save(LS.live, null); }
        state.sheetOpen = null;
        state.view = { ...state.view, name: 'today', exIdx: null };
        toast(hasWrite() ? 'Tréning uložený 💪' : 'Tréning uložený v telefóne 💪');
        render();
        window.scrollTo(0, 0);
        break;
      }
      case 'w-step': {
        const input = document.getElementById('w-today');
        const cur = toNum(input.value || input.placeholder) || 0;
        input.value = fmtKg(Math.max(0, Math.round((cur + Number(t.dataset.d)) * 10) / 10));
        input.dataset.dirty = '1';
        break;
      }
      case 'weight-save': {
        const input = document.getElementById('w-today');
        const kg = toNum(input.value);
        if (!(kg > 20 && kg < 400)) { toast('Zadaj váhu v kg, napr. 84,6'); return; }
        delete input.dataset.dirty;
        saveWeight(todayIso(), Math.round(kg * 10) / 10);
        state.view.weightEdit = false;
        buzz(30);
        render();
        break;
      }
      case 'weight-edit': state.view.weightEdit = true; render(); requestAnimationFrame(() => { const el = document.getElementById('w-today'); if (el) el.focus(); }); break;
      case 'weight-open': state.progress = { kind: 'weight', sel: null }; state.sheetOpen = 'weight'; render(); break;
      case 'progress': state.progress = { name: t.dataset.name, sel: null }; state.sheetOpen = 'progress'; render(); break;
      case 'chart-pt': state.progress.sel = { pi: Number(t.dataset.pi), i: Number(t.dataset.i) }; render(); break;
      case 'close-sheet': if (state.sheetOpen === 'photos') clearDoneDrafts(); state.sheetOpen = null; render(); break;
      case 'photos-open': state.sheetOpen = 'photos'; render(); break;
      case 'photo-remove': {
        const d = state.photoDrafts.find((x) => x.id === t.dataset.id);
        if (d) URL.revokeObjectURL(d.url);
        state.photoDrafts = state.photoDrafts.filter((x) => x.id !== t.dataset.id);
        render();
        break;
      }
      case 'photos-upload': uploadPhotos(); break;
      case 'theme': applyTheme(t.dataset.theme, true); render(); toast(`Vzhľad ${THEMES[t.dataset.theme].name}`); break;
      case 'copy-coach': {
        const link = new URL('trener.html', location.href).href.split('#')[0].split('?')[0] + '#s=' + btoa(unescape(encodeURIComponent(state.config.scriptUrl)));
        (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject())
          .then(() => toast('Odkaz pre trénera skopírovaný'))
          .catch(() => prompt('Skopíruj odkaz pre trénera:', link));
        break;
      }
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
  // Vzhľad (Volt / Matrix) a „padajúci kód“ v pozadí Matrixu
  // ---------------------------------------------------------------------------
  function currentTheme() { const t = load(LS.theme, 'volt'); return THEMES[t] ? t : 'volt'; }
  function applyTheme(name, persist) {
    const t = THEMES[name] ? name : 'volt';
    if (persist) save(LS.theme, t);
    document.documentElement.dataset.theme = t;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', THEMES[t].color);
    if (t === 'matrix') rain.start(); else rain.stop();
  }
  const rain = (() => {
    let canvas = null, ctx = null, cols = [], timer = null, fs = 16;
    const chars = '0123456789ﾊﾐﾋｰｳｼﾅﾓﾆｻﾜﾂｵﾘｱﾎﾃﾏｹﾒｴｶｷﾑﾕﾗｾﾈｽﾀﾇﾍ:・.=*+-<>¦';
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function size() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
      canvas.style.width = innerWidth + 'px'; canvas.style.height = innerHeight + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Array.from({ length: Math.ceil(innerWidth / fs) }, () => Math.random() * -40);
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, innerWidth, innerHeight);
    }
    function frame() {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
      ctx.fillRect(0, 0, innerWidth, innerHeight);
      ctx.font = `${fs}px ui-monospace, Menlo, monospace`;
      cols.forEach((y, i) => {
        const ch = chars[Math.floor(Math.random() * chars.length)];
        ctx.fillStyle = Math.random() > 0.96 ? '#d6ffe0' : '#00ff41';
        ctx.fillText(ch, i * fs, y * fs);
        cols[i] = y * fs > innerHeight && Math.random() > 0.975 ? 0 : y + 1;
      });
    }
    function loop() { if (document.visibilityState === 'visible') frame(); }
    return {
      start() {
        if (!canvas) {
          canvas = document.createElement('canvas');
          canvas.id = 'rain';
          canvas.setAttribute('aria-hidden', 'true');
          document.body.prepend(canvas);
          ctx = canvas.getContext('2d');
          window.addEventListener('resize', () => { if (timer || reduce) size(); });
        }
        size();
        if (reduce) { for (let k = 0; k < 60; k++) frame(); return; } // bez animácie – len statický obrazec
        if (!timer) timer = setInterval(loop, 70);
      },
      stop() { clearInterval(timer); timer = null; },
    };
  })();

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
    } catch (_) { toast('Neplatný odkaz na nastavenie'); }
    history.replaceState(null, '', location.pathname + location.search);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (state.view.name === 'workout') { tick(); render(); return; } // pauza mohla dobehnúť na pozadí
    if (!state.sheetOpen && state.plan && Date.now() - (state.plan.fetchedAt || 0) > 5 * 60 * 1000) refresh(true);
  });

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    const hadController = Boolean(navigator.serviceWorker.controller);
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloading) return;
      const busy = state.sheetOpen || document.querySelector('[data-draft][data-dirty]') || state.queue.length || state.uploading || state.view.name === 'workout';
      if (busy) { toast('Je dostupná nová verzia – zavri a otvor apku'); return; }
      reloading = true;
      location.reload();
    });
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        reg.update().catch(() => {});
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
      })
      .catch(() => {});
  }

  // Rozpracovaný tréning: po otvorení apky pokračuj tam, kde si skončil.
  if (state.plan && state.live && state.live.key && Object.values(state.live.ex || {}).some((x) => x.touched)) {
    const [sheet, w, d] = state.live.key.split('|');
    const wi = state.plan.sheet === sheet ? state.plan.weeks.findIndex((x) => x.n === Number(w)) : -1;
    if (wi >= 0) state.view = { name: 'workout', weekIdx: wi, dayN: Number(d), exIdx: null };
  }
  applyTheme(currentTheme(), false);
  importSetupFromHash();
  render();
  refresh(Boolean(state.plan));
})();
