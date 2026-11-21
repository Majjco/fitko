/* Fitko – tréningový plán z Google tabuľky v peknom mobilnom UI. */
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Konštanty – rozloženie hárku (0-based stĺpce)
  // ---------------------------------------------------------------------------
  const FIRST_EX_COL = 3; // D
  const EX_WIDTH = 9;
  const EX_COUNT = 6;
  const COL_DATE = 1; // B
  const COL_DAY_NOTE = 2; // C
  const COL_TIME = 57; // BF
  const COL_SESH_PLANNED = 58; // BG
  const COL_SESH_DONE = 59; // BH
  const DAY_NAMES = ['Ne', 'Po', 'Ut', 'St', 'Št', 'Pi', 'So'];
  const RPE_VALUES = ['6', '7', '7.5', '8', '8.5', '9', '9.5', '10'];
  const REST_PRESETS = [60, 90, 120, 150, 180, 240];
  const LS = {
    config: 'fitko.config',
    plan: 'fitko.plan',
    local: 'fitko.local',
    queue: 'fitko.queue',
    sessions: 'fitko.sessions',
    rest: 'fitko.rest',
  };

  // ---------------------------------------------------------------------------
  // Stav
  // ---------------------------------------------------------------------------
  const state = {
    config: load(LS.config, { sheetId: '', sheetName: '', gid: '', scriptUrl: '', token: '' }),
    plan: load(LS.plan, null), // { sheet, weeks, fetchedAt, source }
    local: load(LS.local, {}), // key -> { fields, status, error }
    queue: load(LS.queue, []),
    sessions: load(LS.sessions, {}), // dayKey -> { startedAt, finishedAt }
    view: { name: 'week', weekIdx: null, dayKey: null },
    loading: false,
    error: null,
    sheetOpen: null, // 'rest' | 'finish' | null
    rest: load(LS.rest, { endsAt: 0, duration: 90, last: 90 }),
    flushing: false,
  };

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

  function formatDate(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return `${DAY_NAMES[date.getDay()]} ${d}.${m}.`;
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
  function prettyRpe(r) {
    const s = String(r || '').trim();
    return s ? s.replace(/-/g, '–') : '–';
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
  // Načítanie plánu
  // ---------------------------------------------------------------------------
  async function fetchGrid() {
    const c = state.config;
    if (hasWrite()) {
      const url = new URL(c.scriptUrl);
      url.searchParams.set('token', c.token);
      if (c.sheetName) url.searchParams.set('sheet', c.sheetName);
      const res = await fetch(url.toString(), { redirect: 'follow' });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Chyba skriptu');
      return { sheet: data.sheet, rows: data.rows.map((r) => r.c), source: 'script' };
    }
    if (!c.sheetId) throw new Error('Chýba odkaz na tabuľku');
    const names = c.sheetName ? [c.sheetName, c.sheetName + ' ', c.sheetName.trim()] : [''];
    let lastErr = null;
    for (const name of [...new Set(names)]) {
      try {
        const rows = await fetchGviz(c.sheetId, name, c.gid);
        return { sheet: name || 'Hárok', rows, source: 'public' };
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
    url.searchParams.set('range', 'A1:BH1500');
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

  function parsePlan(rows) {
    const weeks = [];
    let week = null;
    for (const c of rows) {
      const a = String(c[0] || '').trim();
      const w = a.match(/^WEEK\s*(\d+)/i);
      if (w) {
        week = { n: +w[1], days: [] };
        weeks.push(week);
        continue;
      }
      const d = a.match(/^DAY\s*(\d+)/i);
      if (!week || !d) continue;
      const day = {
        n: +d[1],
        date: parseDate(c[COL_DATE]),
        note: String(c[COL_DAY_NOTE] || '').trim(),
        time: String(c[COL_TIME] || '').trim(),
        seshPlanned: String(c[COL_SESH_PLANNED] || '').trim(),
        seshDone: String(c[COL_SESH_DONE] || '').trim(),
        exercises: [],
      };
      for (let i = 0; i < EX_COUNT; i++) {
        const b = FIRST_EX_COL + i * EX_WIDTH;
        const name = String(c[b] || '').trim();
        if (!name) continue;
        const v = (k) => String(c[b + k] || '').trim();
        day.exercises.push({
          idx: i,
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
      state.plan = { sheet: grid.sheet, weeks, fetchedAt: Date.now(), source: grid.source };
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

  function saveExercise(week, day, ex, fields) {
    const key = exKey(week.n, day.n, ex.idx);
    state.local[key] = { fields, status: hasWrite() ? 'pending' : 'local' };
    save(LS.local, state.local);
    if (hasWrite()) {
      state.queue = state.queue.filter((q) => q.key !== key);
      state.queue.push({ key, sheet: state.plan.sheet, week: week.n, day: day.n, ex: ex.idx, name: ex.name, fields });
      save(LS.queue, state.queue);
      flushQueue().then(render);
    }
  }

  function saveSession(week, day, session) {
    if (!hasWrite()) return;
    const key = 'session|' + dayKey(week.n, day.n);
    state.queue = state.queue.filter((q) => q.key !== key);
    state.queue.push({ key, sheet: state.plan.sheet, week: week.n, day: day.n, session });
    save(LS.queue, state.queue);
    flushQueue().then(render);
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
  // Výber týždňa / dňa
  // ---------------------------------------------------------------------------
  function defaultWeekIdx() {
    const weeks = state.plan.weeks;
    const today = todayIso();
    const idx = weeks.findIndex((w) => w.days.some((d) => d.date === today));
    if (idx >= 0) return idx;
    // Inak posledný týždeň, v ktorom je niečo naplánované.
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

  function findLast(weekIdx, dayN, ex) {
    const target = norm(ex.name);
    const weeks = state.plan.weeks;
    for (let wi = weekIdx; wi >= 0; wi--) {
      const w = weeks[wi];
      const days = w.days.slice().reverse();
      for (const d of days) {
        if (wi === weekIdx && d.n >= dayN) continue;
        for (const e of d.exercises) {
          if (norm(e.name) !== target) continue;
          const done = getDone(w, d, e);
          if (hasAny(done)) return { week: w, day: d, done, planned: e.planned };
        }
      }
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
    timer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/></svg>',
    check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const app = document.getElementById('app');

  function render() {
    // Zachovaj rozpísané hodnoty a fokus, aby sa pri prekreslení nestratili.
    const drafts = collectDrafts();
    const focused = document.activeElement && document.activeElement.id;
    const scroll = window.scrollY;

    let html;
    if (state.view.name === 'settings' || !isConfigured()) html = renderSettings();
    else if (!state.plan) html = renderLoading();
    else if (state.view.name === 'workout') html = renderWorkout();
    else html = renderWeek();

    app.innerHTML = html + renderFab() + renderSheet();
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
      const ring = `<svg class="ring" viewBox="0 0 36 36"><circle class="bg" cx="18" cy="18" r="15"/><circle class="fg" cx="18" cy="18" r="15" transform="rotate(-90 18 18)" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - doneCount / total)}"/></svg>`;
      const preview = d.exercises.map((e) => e.name.split('+')[0].trim().toLowerCase()).slice(0, 3).join(' · ');
      return `<button class="day ${isToday ? 'today' : ''} ${allDone ? 'done' : ''}" data-action="open-day" data-day="${d.n}">
        <div class="num">${allDone ? ICON.check.replace('14', '22').replace('14', '22') : d.n}</div>
        <div class="info">
          <div class="title">Deň ${d.n} <span style="color:var(--muted);font-weight:500">${esc(formatDate(d.date))}</span> ${isToday ? '<span class="badge">Dnes</span>' : ''}</div>
          <div class="meta">${total} cvikov · ${esc(preview)}</div>
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
      <div class="weekbar">
        <button class="icon-btn" data-action="week" data-dir="-1" ${wi <= 0 ? 'disabled' : ''} aria-label="Predchádzajúci týždeň">${ICON.back}</button>
        <div class="label">Týždeň ${week.n}<small>${esc(range)}</small></div>
        <button class="icon-btn" data-action="week" data-dir="1" ${wi >= weeks.length - 1 ? 'disabled' : ''} aria-label="Ďalší týždeň">${ICON.next}</button>
      </div>
      <div class="days">${days}</div>`;
  }

  function findDay() {
    const week = currentWeek();
    const day = week && week.days.find((d) => d.n === state.view.dayN);
    return { week, day };
  }

  function renderWorkout() {
    const { week, day } = findDay();
    if (!day) { state.view.name = 'week'; return renderWeek(); }
    const dk = dayKey(week.n, day.n);
    const session = state.sessions[dk] || {};
    const doneCount = day.exercises.filter((e) => hasAny(getDone(week, day, e))).length;
    const pct = day.exercises.length ? (doneCount / day.exercises.length) * 100 : 0;

    let sessionHtml;
    if (session.startedAt && !session.finishedAt) {
      sessionHtml = `<div class="session"><div class="clock"><span data-elapsed="${session.startedAt}">${fmtElapsed(Date.now() - session.startedAt)}</span><small>Trvanie tréningu</small></div><button class="btn small" data-action="finish">Dokončiť</button></div>`;
    } else if (session.finishedAt || day.time) {
      const mins = session.finishedAt ? Math.round((session.finishedAt - session.startedAt) / 60000) + ' min' : day.time;
      sessionHtml = `<div class="session"><div class="clock">${esc(mins)}<small>Hotovo${day.seshDone || session.rpe ? ' · RPE tréningu ' + esc(session.rpe || day.seshDone) : ''}</small></div><button class="btn small ghost" data-action="finish">Upraviť</button></div>`;
    } else {
      sessionHtml = `<div class="session"><div class="clock">0:00<small>Stopky tréningu</small></div><button class="btn small" data-action="start">Začať tréning</button></div>`;
    }

    const exHtml = day.exercises.map((ex, i) => renderExercise(week, day, ex, i)).join('');

    return `
      <div class="topbar">
        <button class="icon-btn" data-action="back" aria-label="Späť">${ICON.back}</button>
        <h1>Deň ${day.n}<span class="sub">Týždeň ${week.n} · ${esc(formatDate(day.date))} · ${doneCount}/${day.exercises.length} hotovo</span></h1>
      </div>
      <div class="progress"><div style="width:${pct}%"></div></div>
      ${renderBanners()}
      ${sessionHtml}
      ${day.note ? `<div class="day-note">${esc(day.note)}</div>` : ''}
      ${exHtml}`;
  }

  function renderExercise(week, day, ex, i) {
    const id = `${week.n}-${day.n}-${ex.idx}`;
    const done = getDone(week, day, ex);
    const local = state.local[exKey(week.n, day.n, ex.idx)];
    const isDone = hasAny(done);
    const parts = ex.name.split(/\s+\+\s+/);
    const nameHtml = parts.length > 1
      ? `<span class="ex-tag">Superset</span>` + parts.map((p) => `<span class="part">${esc(cap(p))}</span>`).join('<span class="plus">+</span>')
      : esc(cap(ex.name));

    const wi = state.plan.weeks.indexOf(week);
    const last = findLast(wi, day.n, ex);
    const lastHtml = last
      ? `<div class="last">Minule (T${last.week.n}): <b>${esc([last.done.sets && last.done.sets !== 'Ok' ? prettySets(last.done.sets) : '', last.done.weight ? prettyWeight(last.done.weight) : '', last.done.rpe ? 'RPE ' + last.done.rpe : ''].filter(Boolean).join(' · ') || 'splnené')}</b>${last.done.note ? ' – ' + esc(last.done.note) : ''}</div>`
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

    const rpeChips = RPE_VALUES.map((v) => `<button class="chip ${String(done.rpe) === v ? 'on' : ''}" data-action="rpe" data-target="rpe-${id}" data-value="${v}">${v}</button>`).join('');

    return `
      <section class="ex ${isDone ? 'is-done' : ''}" id="ex-${id}">
        <div class="ex-head">
          <div class="ex-idx">${isDone ? ICON.check : i + 1}</div>
          <div class="ex-name">${nameHtml}</div>
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
                <input id="sets-${id}" data-draft value="${esc(done.sets)}" placeholder="${esc(ex.planned.sets || '2x8')}" autocomplete="off" enterkeyhint="next">
                <button class="mini" data-action="ok" data-target="sets-${id}" aria-label="Podľa plánu">Ok</button>
              </div>
            </div>
            <div class="field">
              <label for="weight-${id}">Váha (kg)</label>
              <input id="weight-${id}" data-draft value="${esc(done.weight)}" placeholder="${esc(/choose/i.test(ex.planned.weight) ? (last && last.done.weight) || 'kg' : ex.planned.weight || 'kg')}" inputmode="decimal" autocomplete="off" enterkeyhint="next">
            </div>
          </div>
          <div class="field">
            <label for="rpe-${id}">RPE</label>
            <input id="rpe-${id}" data-draft type="hidden" value="${esc(done.rpe)}">
            <div class="chips" role="group" aria-label="RPE">${rpeChips}</div>
          </div>
          <div class="field">
            <label for="note-${id}">Poznámka pre trénera</label>
            <textarea id="note-${id}" data-draft rows="1" placeholder="Ako to išlo?">${esc(done.note)}</textarea>
          </div>
          <div class="actions">
            <button class="btn" data-action="save-ex" data-ex="${ex.idx}" data-id="${id}">${isDone ? 'Uložiť zmeny' : 'Uložiť'}</button>
            ${status}
          </div>
        </div>
      </section>`;
  }

  function cap(s) {
    const t = String(s || '').trim().toLowerCase();
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  function fmtElapsed(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
  }

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
            <div class="hint">Záložka s aktuálnym plánom. Keď tréner začne nový blok, zmeň ju tu. So zapnutým zápisom (nižšie) sa nájde sama.</div>
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

  function renderFab() {
    if (!state.plan || state.view.name !== 'workout') return '';
    const left = state.rest.endsAt - Date.now();
    if (left > 0) return `<button class="fab running" data-action="rest" id="fab">${ICON.timer}<span data-rest>${fmtElapsed(left + 999)}</span></button>`;
    if (state.rest.alarm) return `<button class="fab running alarm" data-action="rest-stop" id="fab">${ICON.timer}Pauza skončila</button>`;
    return `<button class="fab" data-action="rest" id="fab">${ICON.timer}Pauza</button>`;
  }

  function renderSheet() {
    if (state.sheetOpen === 'rest') {
      const left = state.rest.endsAt - Date.now();
      const running = left > 0;
      return `<div class="sheet-backdrop" data-action="close-sheet"><div class="sheet" role="dialog" aria-label="Časovač pauzy">
        <div class="grab"></div>
        <h2>Pauza medzi sériami</h2>
        <div class="big-clock" data-rest>${running ? fmtElapsed(left + 999) : fmtElapsed(state.rest.last * 1000)}</div>
        ${running ? `<div class="actions" style="margin-bottom:14px"><button class="btn ghost" data-action="rest-add" data-value="-15">−15 s</button><button class="btn ghost" data-action="rest-add" data-value="15">+15 s</button></div><button class="btn" data-action="rest-stop">Zastaviť</button>` : `
        <div class="presets">${REST_PRESETS.map((s) => `<button class="preset" data-action="rest-start" data-value="${s}">${fmtElapsed(s * 1000)}</button>`).join('')}</div>`}
      </div></div>`;
    }
    if (state.sheetOpen === 'finish') {
      const { week, day } = findDay();
      const dk = dayKey(week.n, day.n);
      const s = state.sessions[dk] || {};
      const mins = s.startedAt ? Math.max(1, Math.round(((s.finishedAt || Date.now()) - s.startedAt) / 60000)) : '';
      return `<div class="sheet-backdrop" data-action="close-sheet"><div class="sheet" role="dialog" aria-label="Dokončiť tréning">
        <div class="grab"></div>
        <h2>Dokončiť tréning</h2>
        <p>Zapíše sa do stĺpcov WORKOUT TIME a SESH RPE (executed).</p>
        <div class="form">
          <div class="field"><label for="fin-time">Trvanie (min)</label><input id="fin-time" inputmode="numeric" value="${esc(mins || String(day.time).replace(/\D+/g, ''))}"></div>
          <div class="field"><label>Ako náročný bol celý tréning? (RPE)</label>
            <input id="fin-rpe" type="hidden" value="${esc(s.rpe || day.seshDone)}">
            <div class="chips">${['5', '6', '7', '8', '9', '10'].map((v) => `<button class="chip ${(s.rpe || day.seshDone) === v ? 'on' : ''}" data-action="rpe" data-target="fin-rpe" data-value="${v}">${v}</button>`).join('')}</div>
          </div>
          <button class="btn" data-action="finish-save">Uložiť tréning</button>
        </div>
      </div></div>`;
    }
    return '';
  }

  // ---------------------------------------------------------------------------
  // Udalosti
  // ---------------------------------------------------------------------------
  app.addEventListener('input', (e) => {
    if (e.target.matches('[data-draft]')) e.target.dataset.dirty = '1';
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
    state.view = { name: 'week', weekIdx: null };
    refresh();
  });

  app.addEventListener('click', (e) => {
    const t = e.target.closest('[data-action]');
    if (!t) return;
    const action = t.dataset.action;
    if (action === 'close-sheet' && t !== e.target) return; // klik dovnútra sheetu
    handle(action, t, e);
  });

  function handle(action, t, e) {
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
      case 'open-day':
        state.view = { ...state.view, name: 'workout', dayN: Number(t.dataset.day) };
        render();
        window.scrollTo(0, 0);
        break;
      case 'ok': {
        const input = document.getElementById(t.dataset.target);
        input.value = 'Ok';
        input.dataset.dirty = '1';
        break;
      }
      case 'rpe': {
        const input = document.getElementById(t.dataset.target);
        const same = input.value === t.dataset.value;
        input.value = same ? '' : t.dataset.value;
        input.dataset.dirty = '1';
        t.parentElement.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', !same && c === t));
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
        saveExercise(week, day, ex, fields);
        if (navigator.vibrate) navigator.vibrate(30);
        render();
        // Ponúkni pauzu po uložení cviku.
        if (!(state.rest.endsAt > Date.now())) startRest(state.rest.last || 90, true);
        break;
      }
      case 'start': {
        const { week, day } = findDay();
        state.sessions[dayKey(week.n, day.n)] = { startedAt: Date.now() };
        save(LS.sessions, state.sessions);
        render();
        break;
      }
      case 'finish':
        state.sheetOpen = 'finish';
        render();
        break;
      case 'finish-save': {
        const { week, day } = findDay();
        const dk = dayKey(week.n, day.n);
        const s = state.sessions[dk] || {};
        const mins = document.getElementById('fin-time').value.trim();
        const rpe = document.getElementById('fin-rpe').value.trim();
        if (!s.startedAt) s.startedAt = Date.now() - (Number(mins) || 0) * 60000;
        s.finishedAt = s.startedAt + (Number(mins) || 0) * 60000;
        s.rpe = rpe;
        state.sessions[dk] = s;
        save(LS.sessions, state.sessions);
        saveSession(week, day, { time: mins ? mins + ' min' : '', rpe });
        state.sheetOpen = null;
        toast(hasWrite() ? 'Tréning uložený 💪' : 'Tréning uložený v telefóne 💪');
        render();
        break;
      }
      case 'rest':
        unlockAudio();
        state.sheetOpen = 'rest';
        render();
        break;
      case 'rest-start':
        unlockAudio();
        startRest(Number(t.dataset.value));
        state.sheetOpen = null;
        render();
        break;
      case 'rest-add':
        state.rest.endsAt += Number(t.dataset.value) * 1000;
        save(LS.rest, state.rest);
        render();
        break;
      case 'rest-stop':
        state.rest.endsAt = 0;
        state.rest.alarm = false;
        save(LS.rest, state.rest);
        state.sheetOpen = null;
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
  // Časovač pauzy
  // ---------------------------------------------------------------------------
  let audioCtx = null;
  function unlockAudio() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (_) { /* bez zvuku */ }
  }
  function beep() {
    if (!audioCtx) return;
    [0, 0.25, 0.5].forEach((delay) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, audioCtx.currentTime + delay);
      g.gain.exponentialRampToValueAtTime(0.4, audioCtx.currentTime + delay + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + delay + 0.18);
      o.connect(g).connect(audioCtx.destination);
      o.start(audioCtx.currentTime + delay);
      o.stop(audioCtx.currentTime + delay + 0.2);
    });
  }
  function startRest(seconds, quiet) {
    unlockAudio();
    state.rest = { endsAt: Date.now() + seconds * 1000, duration: seconds, last: seconds, alarm: false };
    save(LS.rest, state.rest);
    if (!quiet) toast(`Pauza ${fmtElapsed(seconds * 1000)}`);
    render();
  }

  setInterval(() => {
    // Tick: stopky tréningu a odpočet pauzy bez prekresľovania celej stránky.
    document.querySelectorAll('[data-elapsed]').forEach((el) => {
      el.textContent = fmtElapsed(Date.now() - Number(el.dataset.elapsed));
    });
    if (state.rest.endsAt) {
      const left = state.rest.endsAt - Date.now();
      if (left > 0) {
        document.querySelectorAll('[data-rest]').forEach((el) => { el.textContent = fmtElapsed(left + 999); });
      } else {
        state.rest.endsAt = 0;
        state.rest.alarm = true;
        save(LS.rest, state.rest);
        beep();
        if (navigator.vibrate) navigator.vibrate([300, 120, 300, 120, 300]);
        if (state.sheetOpen === 'rest') state.sheetOpen = null;
        render();
        setTimeout(() => { if (state.rest.alarm) { state.rest.alarm = false; save(LS.rest, state.rest); render(); } }, 8000);
      }
    }
  }, 500);

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
