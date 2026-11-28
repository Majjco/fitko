/* Fitko · Tréner – panel trénera nad tabuľkami klientov (specs/003-coach-panel).
 * Zoznam klientov → panel klienta: cviky × týždne na jednej ploche, insighty, snapshot
 * a rozpracovaný ďalší týždeň ako posledný stĺpec, ktorý sa jedným klikom pošle klientovi.
 * Každý klient = jeho Apps Script (rola „coach“ = meno + heslo trénera). */
(function () {
  'use strict';

  const C = window.FitkoCalc;
  // Verzia panela = ?v= v odkaze na tento skript (trener.html); porovnáva sa s version.json.
  const PANEL_VERSION = (() => { try { return Number(new URL(document.currentScript.src).searchParams.get('v')) || 0; } catch (_) { return 0; } })();
  const KEY = { cred: 'fitko.coach', clients: 'fitko.coach.clients', settings: 'fitko.coach.settings', view: 'fitko.coach.view' };
  const draftKey = (id) => 'fitko.coach.draft.' + id;
  const seenKey = (id) => 'fitko.coach.seen.' + id;
  const DAY_NAMES = ['Ne', 'Po', 'Ut', 'St', 'Št', 'Pi', 'So'];
  const PCT_OPTIONS = [0, 2.5, 5, 7.5, 10];
  const STEP_OPTIONS = [1, 1.25, 2, 2.5, 5, 10];
  const FIELDS = ['sets', 'weight', 'rpe', 'note'];

  // ---------------------------------------------------------------------------
  // Pomocné funkcie
  // ---------------------------------------------------------------------------
  function load(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (_) { return fallback; }
  }
  function save(key, v) {
    try { if (v == null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(v)); } catch (_) { /* nič */ }
  }
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const norm = (s) => String(s || '').toUpperCase().replace(/\s+/g, ' ').trim();
  const pad = (n) => String(n).padStart(2, '0');
  const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayIso = () => isoDate(new Date());
  const isoPlus = (iso, days) => { const [y, m, d] = iso.split('-').map(Number); return isoDate(new Date(y, m - 1, d + days)); };
  const splitParts = (name) => String(name || '').split(/\s+\+\s+/).map((p) => p.trim()).filter(Boolean);
  const matchKey = (s) => norm(s).replace(/\(.*?\)/g, ' ').replace(/\s+-\s+.*$/, '').replace(/\bOF CHOICE\b/g, ' ').replace(/\bDUMB+ELLS?\b/g, 'DB').replace(/\s+/g, ' ').trim();
  const nameKey = (name) => splitParts(name).map(matchKey).join(' + ');
  const cap = (s) => { const t = String(s || '').trim().toLowerCase(); return t.charAt(0).toUpperCase() + t.slice(1); };
  const nice = (name) => splitParts(name).map(cap).join(' + ');
  const fmtKg = (n) => (Math.round(n * 100) / 100).toString().replace('.', ',');
  const hasAny = (f) => Boolean(f && (f.sets || f.weight || f.rpe));
  const prettySets = (s) => (s ? String(s).replace(/\s*[xX×]\s*/g, '×').replace(/BOTH/gi, ' obe').replace(/\s+/g, ' ').trim() : '');
  const prettyNum = (s) => String(s || '').replace(/(\d)\.(\d)/g, '$1,$2');
  const isNumW = (s) => /^[\d.,\s–-]+$/.test(String(s || '').trim()) && /\d/.test(String(s || ''));
  const sameFields = (a, b) => FIELDS.every((k) => String((a || {})[k] || '').trim() === String((b || {})[k] || '').trim());
  const idFor = (url) => { let h = 0; for (const ch of String(url)) h = (h * 31 + ch.charCodeAt(0)) | 0; return 'c' + (h >>> 0).toString(36); };
  const plural = (n, one, few, many) => (n === 1 ? one : n >= 2 && n <= 4 ? few : many);

  function parseDate(raw) {
    const s = String(raw || '').trim();
    if (!s) return null;
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
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
  const dateOf = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
  function formatDate(iso, withDay = true) {
    if (!iso) return '';
    const date = dateOf(iso);
    return withDay ? `${DAY_NAMES[date.getDay()]} ${date.getDate()}.${date.getMonth() + 1}.` : `${date.getDate()}.${date.getMonth() + 1}.`;
  }
  const daysAgo = (iso) => Math.round((new Date(new Date().toDateString()) - dateOf(iso)) / 86400000);
  function doneSummary(d) {
    const parts = [];
    if (d.sets) parts.push(d.sets === 'Ok' ? 'Ok' : prettySets(d.sets));
    if (d.weight) parts.push(prettyNum(d.weight) + (isNumW(d.weight) ? ' kg' : ''));
    if (d.rpe) parts.push('RPE ' + prettyNum(d.rpe));
    return parts.join(' · ');
  }
  // Potvrdenie priamo v paneli (namiesto systémového okna prehliadača).
  function confirmBox(text, okLabel, cancelLabel) {
    return new Promise((resolve) => {
      const el = document.createElement('div');
      el.className = 'modal-bg';
      el.innerHTML = `<div class="modal" role="alertdialog" aria-modal="true"><p>${esc(text)}</p><div class="pacts"><button class="btn small ghost" data-m="0">${esc(cancelLabel || 'Zrušiť')}</button><button class="btn small" data-m="1">${esc(okLabel || 'Áno')}</button></div></div>`;
      const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(false); } };
      const done = (v) => { el.remove(); document.removeEventListener('keydown', key, true); resolve(v); };
      el.addEventListener('click', (e) => { const b = e.target.closest('[data-m]'); if (b) done(b.dataset.m === '1'); else if (e.target === el) done(false); });
      document.addEventListener('keydown', key, true);
      document.body.appendChild(el);
      el.querySelector('[data-m="1"]').focus();
    });
  }

  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 3200);
  }

  // Rozloženie hárku podľa hlavičiek (rovnako ako apka): WEEK n / DAY n / EXERCISE n × 9 stĺpcov.
  function parsePlan(rows) {
    const weeks = [];
    let week = null;
    let layout = { exCols: [3, 12, 21, 30, 39, 48], date: 1, note: 2 };
    for (const c of rows) {
      const cells = c.map((v) => String(v || '').trim());
      const exCols = [];
      cells.forEach((v, i) => { if (/^EXERCISE\s*\d+$/i.test(v)) exCols.push(i); });
      if (exCols.length) {
        const first = exCols[0];
        const dIdx = cells.findIndex((v, i) => /^DATE$/i.test(v) && i < first);
        const nIdx = cells.findIndex((v, i) => /^NOTES$/i.test(v) && i < first);
        layout = { exCols, date: dIdx > 0 ? dIdx : 1, note: nIdx };
      }
      const a = cells[0] || '';
      const w = a.match(/^WEEK\s*(\d+)/i);
      if (w) { week = { n: +w[1], days: [] }; weeks.push(week); continue; }
      const d = a.match(/^DAY\s*(\d+)/i);
      if (!week || !d) continue;
      const at = (i) => (i >= 0 ? cells[i] || '' : '');
      const day = { n: +d[1], date: parseDate(at(layout.date)), note: at(layout.note), slots: layout.exCols.map((col) => col + 1), exercises: [] };
      for (const col of layout.exCols) {
        const name = at(col);
        if (!name) continue;
        const v = (k) => at(col + k);
        day.exercises.push({
          col: col + 1, name,
          planned: { sets: v(1), weight: v(2), rpe: v(3), note: v(4) },
          done: { sets: v(5), weight: v(6), rpe: v(7), note: v(8) },
        });
      }
      week.days.push(day);
    }
    return weeks;
  }

  // ---------------------------------------------------------------------------
  // Stav
  // ---------------------------------------------------------------------------
  const oldCfg = load(KEY.cred, {}) || {};
  const state = {
    cred: { user: oldCfg.user || '', pass: oldCfg.pass || '' },
    clients: load(KEY.clients, null) || (oldCfg.scriptUrl ? [{ id: idFor(oldCfg.scriptUrl), scriptUrl: oldCfg.scriptUrl }] : []),
    data: {}, // id -> { loading, error, d }
    history: {}, // id -> { loading, sheets: [{ name, weeks }] }
    view: 'clients',
    clientId: null,
    focus: null, // insight, ktorý zvýrazňuje riadky
    drawer: null, // { kind: 'ex', key } | { kind: 'body' }
    pop: null, // { kind: 'note' | 'cell', r, w, top, left }
    busy: {},
    loginError: null,
    localSettings: load(KEY.settings, { pct: 5, steps: {} }),
  };
  save('fitko.coach.draft', null); // náhľad zo spec 002 už neexistuje
  if (oldCfg.scriptUrl) save(KEY.cred, state.cred); // migrácia starého nastavenia
  save(KEY.clients, state.clients);

  const client = () => state.clients.find((c) => c.id === state.clientId) || null;
  const dataOf = (id) => (state.data[id] && state.data[id].d) || null;

  // ---------------------------------------------------------------------------
  // Komunikácia so skriptom klienta
  // ---------------------------------------------------------------------------
  async function apiGet(c, sheet) {
    const url = new URL(c.scriptUrl);
    url.searchParams.set('token', state.cred.pass);
    url.searchParams.set('user', state.cred.user);
    if (sheet) url.searchParams.set('sheet', sheet);
    const res = await fetch(url.toString());
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Chyba skriptu');
    if (data.role !== 'coach') throw new Error('Tieto údaje nie sú prihlásenie trénera');
    return data;
  }
  async function apiPost(c, body) {
    const d = dataOf(c.id);
    const res = await fetch(c.scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...body, sheet: d && d.sheet, token: state.cred.pass, user: state.cred.user }),
    });
    return res.json();
  }

  async function loadClient(c, quiet) {
    const prev = state.data[c.id] || {};
    state.data[c.id] = { ...prev, loading: true, error: null };
    if (!quiet) render();
    try {
      const r = await apiGet(c);
      const d = {
        sheet: r.sheet, title: r.title || 'Klient', weeks: parsePlan(r.rows.map((x) => x.c)),
        weights: (r.weights || []).slice().sort((a, b) => (a.date < b.date ? -1 : 1)),
        photos: ((r.photos && r.photos.list) || []).slice().sort((a, b) => (a.date < b.date ? -1 : 1)),
        settings: r.settings ? { pct: Number(r.settings.pct), steps: r.settings.steps || {} } : null,
        version: Number(r.version) || (r.settings ? 2 : 1),
        historyNames: (r.history || []).filter((n) => n !== r.sheet),
      };
      state.data[c.id] = { loading: false, error: null, d };
      if (c.title !== d.title || c.sheet !== d.sheet) { c.title = d.title; c.sheet = d.sheet; save(KEY.clients, state.clients); }
    } catch (e) {
      state.data[c.id] = { ...prev, loading: false, error: e.message || String(e) };
    }
    render();
    return state.data[c.id];
  }
  const loadAll = () => Promise.all(state.clients.map((c) => loadClient(c, true))).then(render);

  // Staršie bloky (skryté hárky) pre graf cviku – raz za otvorenie klienta.
  async function loadHistory(c) {
    const d = dataOf(c.id);
    if (!d || state.history[c.id]) return;
    state.history[c.id] = { loading: true, sheets: [] };
    const sheets = [];
    for (const name of d.historyNames) {
      try {
        const r = await apiGet(c, name);
        const weeks = parsePlan(r.rows.map((x) => x.c));
        if (weeks.length) sheets.push({ name, weeks });
      } catch (_) { /* hárok preskočíme */ }
    }
    state.history[c.id] = { loading: false, sheets };
    render();
  }

  // ---------------------------------------------------------------------------
  // Model plochy: riadky = deň + cvik, stĺpce = týždne
  // ---------------------------------------------------------------------------
  const weekHasEx = (w) => w.days.some((d) => d.exercises.length);
  function weekRange(w) {
    const dates = w.days.map((d) => d.date).filter(Boolean);
    return dates.length ? `${formatDate(dates[0], false)} – ${formatDate(dates[dates.length - 1], false)}` : '';
  }
  function currentWeekIdx(d) {
    const t = todayIso();
    const i = d.weeks.findIndex((w) => w.days.some((x) => x.date === t));
    if (i >= 0 && weekHasEx(d.weeks[i])) return i;
    for (let k = d.weeks.length - 1; k >= 0; k--) {
      const dates = d.weeks[k].days.map((x) => x.date).filter(Boolean);
      if (weekHasEx(d.weeks[k]) && dates.length && dates[0] <= t) return k;
    }
    for (let k = d.weeks.length - 1; k >= 0; k--) if (weekHasEx(d.weeks[k])) return k;
    return -1;
  }
  const lastPlannedIdx = (d) => d.weeks.reduce((m, w, i) => (weekHasEx(w) ? i : m), -1);

  // Všetky záznamy cvikov chronologicky (pre „posledný výkon“ a návrh).
  function entries(d) {
    const out = [];
    d.weeks.forEach((w, wi) => w.days.forEach((day) => day.exercises.forEach((e) => {
      out.push({ wi, week: w.n, day: day.n, date: day.date, name: e.name, key: nameKey(e.name), planned: e.planned, done: e.done });
    })));
    return out;
  }
  function lastBefore(d, name, wi, dayN) {
    const k = nameKey(name);
    const list = entries(d).filter((x) => x.key === k && hasAny(x.done) && (x.wi < wi || (x.wi === wi && x.day < dayN)));
    return list[list.length - 1] || null;
  }

  function buildModel(d) {
    const cols = d.weeks.map((w, wi) => ({ w, wi })).filter(({ w }) => weekHasEx(w));
    const rows = new Map();
    cols.forEach(({ w, wi }) => w.days.forEach((day) => day.exercises.forEach((e) => {
      const key = `${day.n}|${nameKey(e.name)}`;
      let r = rows.get(key);
      if (!r) { r = { key, day: day.n, name: e.name, cells: {} }; rows.set(key, r); }
      r.cells[w.n] = { e, day, w, wi };
      r.name = e.name;
      r.order = e.col; // poradie podľa posledného týždňa, v ktorom cvik je
      r.lastWi = wi;
    })));
    const list = [...rows.values()].sort((a, b) => a.day - b.day || b.lastWi - a.lastWi || a.order - b.order);
    for (const r of list) {
      const done = cols.map(({ w }) => r.cells[w.n]).filter((c) => c && hasAny(c.e.done)).map((c) => ({ planned: c.e.planned, done: c.e.done }));
      r.trend = C.trend(r.name, done);
    }
    const days = [...new Set(list.map((r) => r.day))].sort((a, b) => a - b);
    return { cols, rows: list, days };
  }

  const noteId = (w, day, e) => `${w}|${day}|${e.col}|${e.done.note}`;
  function insightsOf(c, d, model) {
    const seen = new Set(load(seenKey(c.id), []));
    const g = { up: [], same: [], down: [], fatigue: [], notes: [], unseen: [] };
    for (const r of model.rows) {
      if (r.trend.kind === 'up') g.up.push(r.key);
      else if (r.trend.kind === 'down') g.down.push(r.key);
      else if (r.trend.kind === 'same') g.same.push(r.key);
      if (r.trend.fatigue) g.fatigue.push(r.key);
      for (const cell of Object.values(r.cells)) {
        const id = noteId(cell.w.n, cell.day.n, cell.e);
        if (cell.e.done.note && !seen.has(id)) { if (!g.notes.includes(r.key)) g.notes.push(r.key); g.unseen.push(id); }
      }
    }
    return g;
  }
  function markNotesSeen(c) {
    const d = dataOf(c.id);
    if (!d) return;
    const ids = [];
    d.weeks.forEach((w) => w.days.forEach((day) => day.exercises.forEach((e) => { if (e.done.note) ids.push(noteId(w.n, day.n, e)); })));
    save(seenKey(c.id), ids);
  }

  // Stav týždňa: koľko tréningových dní má niečo zapísané, posledný tréning, čo čaká.
  function weekStatus(d) {
    const wi = currentWeekIdx(d);
    if (wi < 0) return null;
    const w = d.weeks[wi];
    const days = w.days.filter((x) => x.exercises.length);
    const doneDays = days.filter((x) => x.exercises.some((e) => hasAny(e.done)));
    const next = days.find((x) => !x.exercises.some((e) => hasAny(e.done)));
    let last = null;
    d.weeks.forEach((ww) => ww.days.forEach((x) => { if (x.date && x.exercises.some((e) => hasAny(e.done)) && (!last || x.date > last)) last = x.date; }));
    return { w, done: doneDays.length, total: days.length, next, last };
  }
  function weightStatus(d) {
    const ws = d.weights;
    if (!ws.length) return null;
    const last = ws[ws.length - 1];
    const ref = ws.filter((x) => x.date <= isoPlus(last.date, -7)).pop();
    const avg = (from) => { const v = ws.filter((x) => x.date >= from).map((x) => x.kg); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
    return { last, diff: ref ? last.kg - ref.kg : null, avg7: avg(isoPlus(todayIso(), -6)), avg30: avg(isoPlus(todayIso(), -29)), recent: ws.filter((x) => x.date >= isoPlus(todayIso(), -29)) };
  }

  // ---------------------------------------------------------------------------
  // Nastavenia progresie (cieľ %, krok pri cviku) – v tabuľke, pri starom skripte lokálne
  // ---------------------------------------------------------------------------
  const settingsOf = (d) => (d && d.settings) || state.localSettings;
  const stepFor = (d, name) => Number(settingsOf(d).steps[nameKey(name)]) || 2.5;
  async function saveSetting(c, key, value) {
    const d = dataOf(c.id);
    const st = settingsOf(d);
    if (key === 'progres_percent') st.pct = value; else st.steps[key.slice(5)] = value;
    render();
    if (!d || !d.settings) { save(KEY.settings, state.localSettings); return; }
    try {
      const out = await apiPost(c, { op: 'setting', key, value });
      if (!out.ok) throw new Error(out.error);
    } catch (err) { toast('Nastavenie sa neuložilo do tabuľky: ' + err.message); }
  }

  // ---------------------------------------------------------------------------
  // Rozpracovaný týždeň (posledný stĺpec)
  // ---------------------------------------------------------------------------
  function getDraft(c) {
    const d = c && dataOf(c.id);
    const dr = c && load(draftKey(c.id), null);
    return dr && d && dr.sheet === d.sheet && d.weeks.some((w) => w.n === dr.from) ? dr : null;
  }
  const putDraft = (c, dr) => save(draftKey(c.id), dr);

  function expectedTarget(d, wi) {
    for (let k = wi + 1; k < d.weeks.length; k++) if (!weekHasEx(d.weeks[k])) return d.weeks[k].n;
    return Math.max(...d.weeks.map((w) => w.n)) + 1;
  }

  // Návrhy pre cviky zdrojového týždňa (rovnaké pravidlá ako spec 002 – calc.js).
  function draftRows(c, d, dr) {
    const wi = d.weeks.findIndex((w) => w.n === dr.from);
    const pct = settingsOf(d).pct / 100;
    const out = [];
    for (const day of d.weeks[wi].days) {
      for (const e of day.exercises) {
        const src = hasAny(e.done) ? { planned: e.planned, done: e.done, wi, day: day.n, week: dr.from } : lastBefore(d, e.name, wi, day.n);
        const prev = src ? lastBefore(d, e.name, src.wi, src.day) : null;
        const s = C.suggest({
          name: e.name, planned: e.planned, done: src ? src.done : {},
          prevMissed: prev ? C.missed(e.name, prev.planned, prev.done) : false,
          step: stepFor(d, e.name), pct,
        });
        const key = `${day.n}|${e.col}`;
        const st = dr.rows[key] || {};
        const fields = st.edited && st.fields ? { ...st.fields } : dr.mode === 'copy' ? { ...e.planned } : { ...s.fields };
        out.push({ key, day, e, src, s, st, fields, skip: Boolean(st.skip), rowKey: `${day.n}|${nameKey(e.name)}` });
      }
    }
    return out;
  }
  function draftChanges(drows, dr) {
    return drows.filter((r) => r.skip || !sameFields(r.fields, r.e.planned)).length + (dr.extra || []).filter((x) => x.fields.name.trim()).length;
  }
  function freeSlot(d, dr, dayN) {
    const w = d.weeks.find((x) => x.n === dr.from);
    const day = w && w.days.find((x) => x.n === dayN);
    if (!day) return null;
    const used = new Set(day.exercises.map((e) => e.col).concat((dr.extra || []).filter((x) => x.day === dayN).map((x) => x.col)));
    return day.slots.find((col) => !used.has(col)) || null;
  }
  function doneSignature(d, from) {
    const wi = d.weeks.findIndex((w) => w.n === from);
    return JSON.stringify([d.weeks[wi - 1], d.weeks[wi]].filter(Boolean).map((w) => w.days.map((x) => x.exercises.map((e) => [e.col, e.name, e.done]))));
  }

  async function sendDraft(c, retry) {
    let d = dataOf(c.id);
    let dr = getDraft(c);
    if (!d || !dr || state.busy.send) return;
    state.busy.send = true;
    render();
    const lastN = () => { const dd = dataOf(c.id); return dd ? dd.weeks.reduce((m, w) => (weekHasEx(w) ? Math.max(m, w.n) : m), 0) : 0; };
    const beforeLast = lastN();
    try {
      // Klient mohol medzitým zapísať výsledky – načítaj aktuálne dáta a porovnaj.
      const sig = doneSignature(d, dr.from);
      await loadClient(c, true);
      d = dataOf(c.id);
      dr = getDraft(c);
      if (!d || !dr) throw new Error(state.data[c.id].error || 'Nepodarilo sa načítať tabuľku');
      if (!retry && doneSignature(d, dr.from) !== sig) { dr.stale = true; putDraft(c, dr); return; }
      dr.stale = false;
      const failedKeys = new Set((dr.failed || []).map((f) => f.key));
      const want = (k, changed) => (retry ? failedKeys.has(k) : changed);
      const send = [];
      for (const r of draftRows(c, d, dr)) {
        if (r.skip) {
          if (want(r.key, true)) send.push({ key: r.key, day: r.day.n, col: r.e.col, expect: r.e.name, fields: { name: '', sets: '', weight: '', rpe: '', note: '' } });
          continue;
        }
        if (want(r.key, !sameFields(r.fields, r.e.planned))) {
          send.push({ key: r.key, day: r.day.n, col: r.e.col, expect: r.e.name, fields: { sets: r.fields.sets, weight: r.fields.weight, rpe: r.fields.rpe, note: r.fields.note } });
        }
      }
      for (const x of dr.extra || []) {
        const k = 'x:' + x.id;
        if (x.fields.name.trim() && want(k, true)) {
          send.push({ key: k, day: x.day, col: x.col, expect: '', fields: { name: x.fields.name.trim().toUpperCase(), sets: x.fields.sets, weight: x.fields.weight, rpe: x.fields.rpe, note: x.fields.note } });
        }
      }
      let out;
      try {
        out = await apiPost(c, { op: 'applyWeek', from: dr.from, target: dr.target || undefined, rows: send.map(({ key, ...rest }) => rest) });
      } catch (err) {
        // Spojenie spadlo – ak sa týždeň už vytvoril, ďalší pokus nesmie vytvoriť druhý.
        await loadClient(c, true);
        if (dataOf(c.id) && lastN() > beforeLast && !dr.target) {
          dr.target = lastN();
          dr.failed = send.map((x) => ({ key: x.key, error: 'Spojenie sa prerušilo' }));
          putDraft(c, dr);
        }
        throw err;
      }
      if (!out.ok) throw new Error(/Neznáma operácia/.test(out.error || '') ? 'Apps Script je starý – aktualizuj ho podľa README' : out.error);
      dr.target = out.week;
      const failed = (out.results || []).map((res, i) => (res.ok ? null : { key: send[i].key, error: res.error })).filter(Boolean);
      if (failed.length) {
        dr.failed = failed;
        putDraft(c, dr);
        await loadClient(c, true);
        toast(`Týždeň ${out.week} je v tabuľke, ${failed.length} ${plural(failed.length, 'cvik sa nezapísal', 'cviky sa nezapísali', 'cvikov sa nezapísalo')}`);
        return;
      }
      const wasEdit = dr.edit;
      putDraft(c, null);
      await loadClient(c, true);
      toast(wasEdit ? `Týždeň ${out.week} upravený – klient ho vidí ✓` : `Týždeň ${out.week} je u klienta ✓`);
    } catch (err) {
      toast('Nepodarilo sa odoslať: ' + err.message);
    } finally {
      state.busy.send = false;
      render();
    }
  }

  // Úprava budúcej, ešte neodcvičenej bunky – uloží sa hneď (operácia „plan“).
  async function saveCell(c, weekN, dayN, col, fields) {
    const d = dataOf(c.id);
    const w = d.weeks.find((x) => x.n === weekN);
    const day = w && w.days.find((x) => x.n === dayN);
    const e = day && day.exercises.find((x) => x.col === col);
    if (!e) return;
    state.busy.cell = true;
    render();
    try {
      const out = await apiPost(c, { op: 'plan', week: weekN, day: dayN, col, expect: e.name, fields });
      if (!out.ok) throw new Error(out.error);
      Object.assign(e.planned, fields);
      state.pop = null;
      toast('Uložené do tabuľky ✓');
    } catch (err) {
      toast('Neuložené: ' + err.message);
    } finally {
      state.busy.cell = false;
      render();
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const app = document.getElementById('app');
  const layer = document.getElementById('layer');
  const ICON = {
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4h4v16h-4M10 17l5-5-5-5M15 12H3"/></svg>',
  };

  function render() {
    // zachovaj fokus, kurzor a posun mriežky aj stránky
    const act = document.activeElement;
    const focusId = act && act.id && (app.contains(act) || layer.contains(act)) ? act.id : null;
    const sel = focusId && typeof act.selectionStart === 'number' ? [act.selectionStart, act.selectionEnd] : null;
    const gw = app.querySelector('.gridwrap');
    const gx = gw ? gw.scrollLeft : null;
    const sx = window.scrollX, sy = window.scrollY;
    const dw = layer.querySelector('.drawer');
    const dsy = dw ? dw.scrollTop : 0;

    let html;
    if (!state.clients.length) html = renderNoClients();
    else if (!state.cred.pass) html = renderLogin();
    else if (state.view === 'client' && client()) html = renderClient(client());
    else html = renderClients();
    app.innerHTML = html;
    layer.innerHTML = renderLayer();
    renderBar();
    document.body.classList.toggle('sheet-open', Boolean(state.drawer));

    const gw2 = app.querySelector('.gridwrap');
    if (gw2 && gx != null) gw2.scrollLeft = gx;
    const dw2 = layer.querySelector('.drawer');
    if (dw2) dw2.scrollTop = dsy;
    window.scrollTo(sx, sy);
    if (focusId) {
      const el = document.getElementById(focusId);
      if (el) {
        el.focus({ preventScroll: true });
        if (sel && el.setSelectionRange) try { el.setSelectionRange(sel[0], sel[1]); } catch (_) { /* nič */ }
      }
    }
  }

  function addClientForm() {
    return `<ol class="steps">
        <li>Klient v apke Fitko otvorí <b>Nastavenia</b> a klikne <b>„Skopírovať odkaz pre trénera“</b>.</li>
        <li>Pošle ti odkaz (správa, e-mail…).</li>
        <li>Odkaz otvoríš – alebo ho vložíš sem:</li>
      </ol>
      <form id="add-form" class="addform" autocomplete="off">
        <input id="add-link" placeholder="https://…/trener.html#s=…" aria-label="Odkaz od klienta">
        <button class="btn small" type="submit">Pridať</button>
      </form>
      <p class="hint">Na prihlásenie použiješ svoje trénerské meno a heslo – rovnaké ako pri ostatných klientoch.</p>`;
  }
  function renderNoClients() {
    return `<div class="login"><h1>Fitko · Tréner</h1><p>Zatiaľ tu nemáš žiadneho klienta.</p><div class="card">${addClientForm()}</div></div>`;
  }
  function addClientFromLink(raw) {
    const s = String(raw || '').trim();
    let url = s;
    const m = s.match(/#s=([^&\s]+)/);
    if (m) { try { url = decodeURIComponent(escape(atob(m[1]))); } catch (_) { url = ''; } }
    if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(url)) { toast('Toto nevyzerá ako odkaz od klienta z apky Fitko'); return false; }
    if (state.clients.some((x) => x.scriptUrl === url)) { toast('Tento klient už v zozname je'); return true; }
    const c = { id: idFor(url), scriptUrl: url };
    state.clients.push(c);
    save(KEY.clients, state.clients);
    toast('Klient pridaný');
    if (state.cred.pass) loadClient(c);
    return true;
  }

  function renderLogin() {
    return `<div class="login">
      <h1>Fitko · Tréner</h1>
      <p>Prehľad a plánovanie tréningov tvojich klientov. Všetko, čo tu zmeníš, je hneď aj v ich tabuľke.</p>
      ${state.loginError ? `<div class="banner err"><div>${esc(state.loginError)}</div></div>` : ''}
      <form id="login-form" class="form card" autocomplete="on">
        <div class="field"><label for="lg-user">Meno</label><input id="lg-user" name="user" autocomplete="username" value="${esc(state.cred.user)}"></div>
        <div class="field"><label for="lg-pass">Heslo</label><input id="lg-pass" name="pass" type="password" autocomplete="current-password"></div>
        <button class="btn" type="submit" ${state.busy.login ? 'disabled' : ''}>${state.busy.login ? 'Prihlasujem…' : 'Prihlásiť sa'}</button>
      </form>
    </div>`;
  }

  // ----- Zoznam klientov -----
  function clientCard(c) {
    const st = state.data[c.id] || {};
    const d = st.d;
    const title = (d && d.title) || c.title || 'Klient';
    const head = `<div class="ccard-top"><div class="avatar">${esc(title.trim().charAt(0).toUpperCase() || '?')}</div><div class="ccard-id"><div class="ccard-name">${esc(title)}</div><div class="ccard-sub">${esc(((d && d.sheet) || c.sheet || '').trim())}</div></div></div>`;
    if (!d) {
      if (st.error) {
        return { score: 50, html: `<div class="ccard err">${head}<div class="banner err"><div>${esc(st.error)}</div></div><div class="ccard-actions"><button class="btn small ghost" data-a="retry" data-id="${c.id}">Skúsiť znova</button><button class="btn small ghost" data-a="remove" data-id="${c.id}">Odstrániť</button></div></div>` };
      }
      return { score: 0, html: `<div class="ccard">${head}<div class="ccard-sub">Načítavam…</div></div>` };
    }
    const model = buildModel(d);
    const g = insightsOf(c, d, model);
    const ws = weekStatus(d);
    const wst = weightStatus(d);
    const idle = ws && ws.last ? daysAgo(ws.last) : null;
    const flags = [];
    if (idle != null && idle >= 5) flags.push(['warn', `${idle} dní pauza`]);
    if (g.down.length) flags.push(['down', `↓ ${g.down.length} ${plural(g.down.length, 'klesá', 'klesajú', 'klesá')}`]);
    if (g.fatigue.length) flags.push(['warn', `únava ${g.fatigue.length}`]);
    if (g.unseen.length) flags.push(['notes', `${g.unseen.length} ${plural(g.unseen.length, 'nová poznámka', 'nové poznámky', 'nových poznámok')}`]);
    if (g.same.length) flags.push(['', `→ ${g.same.length} ${plural(g.same.length, 'stagnuje', 'stagnujú', 'stagnuje')}`]);
    if (g.up.length) flags.push(['up', `↑ ${g.up.length} hore`]);
    const score = (idle >= 5 ? 40 : 0) + g.down.length * 10 + g.fatigue.length * 8 + g.unseen.length * 5 + g.same.length * 2;
    const html = `<button class="ccard" data-a="open" data-id="${c.id}">${head}
      <div class="ccard-stats">
        ${ws ? `<div class="st"><b class="num">${ws.done}<small>/${ws.total}</small></b><span>T${ws.w.n}</span></div>` : ''}
        ${wst ? `<div class="st"><b class="num">${esc(fmtKg(wst.last.kg))}<small> kg</small></b><span>váha</span></div>` : ''}
      </div>
      ${flags.length ? `<div class="flags">${flags.map(([cls, t]) => `<span class="flag ${cls}">${esc(t)}</span>`).join('')}</div>` : ''}
    </button>`;
    return { score, html };
  }

  function renderClients() {
    const cards = state.clients.map(clientCard).sort((a, b) => b.score - a.score).map((x) => x.html).join('');
    return `
      <div class="topbar">
        <h1>Klienti</h1>
        <button class="icon-btn" data-a="reload-all" aria-label="Obnoviť">${ICON.refresh}</button>
        <button class="icon-btn" data-a="logout" aria-label="Odhlásiť">${ICON.logout}</button>
      </div>
      <div class="clients">${cards}
        <button class="ccard add-client" data-a="add-client"><span class="plus">+</span><b>Pridať klienta</b></button>
      </div>
      <div class="app-version">Fitko · Tréner · verzia ${PANEL_VERSION || '?'}</div>`;
  }

  // ----- Panel klienta -----
  function sparkline(list) {
    if (list.length < 2) return '';
    const W = 200, H = 26, vals = list.map((x) => x.kg);
    let mn = Math.min(...vals), mx = Math.max(...vals);
    if (mx - mn < 1) { mn -= 0.5; mx += 0.5; }
    const x = (i) => 2 + (i * (W - 4)) / (vals.length - 1), y = (v) => 3 + (1 - (v - mn) / (mx - mn)) * (H - 6);
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path d="${vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}"/><circle cx="${x(vals.length - 1)}" cy="${y(vals[vals.length - 1])}" r="2.5"/></svg>`;
  }

  function renderClient(c) {
    const st = state.data[c.id] || {};
    const d = st.d;
    const model = d ? buildModel(d) : null;
    const top = `<div class="topbar phead"><button class="icon-btn" data-a="clients" aria-label="Späť na klientov">${ICON.back}</button>
      <h1>${esc((d && d.title) || c.title || 'Klient')}<span class="sub">${d ? esc(d.sheet.trim()) : ''}${st.loading ? ' · načítavam…' : ''}</span></h1>
      <button class="icon-btn" data-a="reload" aria-label="Obnoviť">${ICON.refresh}</button></div>`;
    if (!d) return top + (st.error ? `<div class="banner err"><div>${esc(st.error)}</div><button data-a="reload">Skúsiť znova</button></div>` : '<div class="empty"><div class="spinner"></div>Načítavam tabuľku…</div>');
    const g = insightsOf(c, d, model);
    const dr = getDraft(c);

    // Snapshot: tréningy, ranná váha, fotky
    const ws = weekStatus(d);
    const wst = weightStatus(d);
    const lastPhoto = d.photos[d.photos.length - 1];
    const wd = wst && wst.diff != null ? Math.round(wst.diff * 10) / 10 : null;
    const snap = `<div class="snap">
      <div class="tile hero"><div class="in"><span class="tile-k">Tréningy${ws ? ` · T${ws.w.n}` : ''}</span>
        <span class="tile-v gtext">${ws ? `${ws.done}<small>/${ws.total}</small>` : '–'}</span></div></div>
      <button class="tile" data-a="body"><div class="row"><span class="tile-k">Váha</span>${wd ? `<span class="tchip ${wd < 0 ? 'dn' : ''}">${wd > 0 ? '↑ +' : '↓ −'}${esc(fmtKg(Math.abs(wd)))} kg</span>` : ''}</div>
        <span class="tile-v">${wst ? `${esc(fmtKg(wst.last.kg))}<small> kg</small>` : '–'}</span>
        ${wst ? sparkline(wst.recent) : ''}</button>
      <button class="tile" data-a="body"><div class="row"><span class="tile-k">Fotky</span>${lastPhoto ? `<span class="tchip">${lastPhoto.count}</span>` : ''}</div>
        <span class="tile-v">${lastPhoto ? esc(formatDate(lastPhoto.date, false)) : '–'}</span></button>
    </div>`;

    const chip = (k, cls, label) => (g[k].length ? `<button class="ins ${cls} ${state.focus === k ? 'on' : ''}" data-a="focus" data-k="${k}"><b>${k === 'notes' ? g.unseen.length : g[k].length}</b> ${label}</button>` : '');
    const ins = `<div class="insights">
      ${chip('up', 'up', 'hore')}
      ${chip('same', 'same', plural(g.same.length, 'stagnuje', 'stagnujú', 'stagnuje'))}
      ${chip('down', 'down', plural(g.down.length, 'klesá', 'klesajú', 'klesá'))}
      ${chip('fatigue', 'warn', 'únava')}
      ${chip('notes', 'note', plural(g.unseen.length, 'nová poznámka', 'nové poznámky', 'nových poznámok'))}
    </div>`;

    const lp = lastPlannedIdx(d);
    const nextN = lp >= 0 ? expectedTarget(d, lp) : null;
    const lpW = lp >= 0 ? d.weeks[lp] : null;
    const unstarted = lpW && !lpW.days.some((x) => x.exercises.some((e) => hasAny(e.done)));
    const who = esc(((d.title || '').trim().split(/\s+/)[0]) || 'klient');
    let actions = '';
    if (!dr && lpW) {
      actions = unstarted
        ? `<button class="btn add-week" data-a="edit-week" data-w="${lpW.n}">Upraviť T${lpW.n}</button><button class="btn ghost add-week" data-a="add-week">+ Pridať týždeň ${nextN}</button>`
        : `<button class="btn add-week" data-a="add-week">+ Pridať týždeň ${nextN}</button>`;
    }
    const tb = `<div class="toolbar"><div class="legend">
        ${!dr && unstarted ? `<div class="plan-hint"><b>T${lpW.n} je naplánovaný</b> – ${who} ho ešte necvičil.</div>` : ''}</div>
      ${actions}</div>`;

    return top + snap + ins + (dr ? draftBanners(d, dr) : '') + tb + (model.rows.length ? `<div class="gridwrap">${renderGrid(c, d, model, g, dr)}</div>` : '<div class="empty">V tabuľke zatiaľ nie je žiadny plán.</div>') +
      `<div class="app-version">Fitko · Tréner · verzia ${PANEL_VERSION || '?'}</div>`;
  }

  function draftBanners(d, dr) {
    let out = '';
    if (!d.settings) out += '<div class="banner warn"><div><b>Na odoslanie treba aktualizovať Apps Script klienta</b> (návod v README). Týždeň si môžeš pripraviť aj teraz – ostane uložený v prehliadači.</div></div>';
    if (dr.stale) out += '<div class="banner warn"><div><b>Klient medzitým zapísal nové výsledky.</b> Návrh sa prepočítal – skontroluj ho a odošli znova.</div></div>';
    if (dr.failed && dr.failed.length) {
      const src = d.weeks.find((w) => w.n === dr.from);
      const nameOf = (key) => {
        if (key.startsWith('x:')) { const x = (dr.extra || []).find((q) => 'x:' + q.id === key); return 'nový cvik ' + nice(x ? x.fields.name : ''); }
        const [dayN, col] = key.split('|').map(Number);
        const day = src.days.find((x) => x.n === dayN);
        const e = day && day.exercises.find((x) => x.col === col);
        return `Deň ${dayN} · ${nice(e ? e.name : '')}`;
      };
      out += `<div class="banner err"><div><b>${dr.edit ? 'Tieto zmeny sa nezapísali:' : `Týždeň ${dr.target} je v tabuľke, ale tieto cviky sa nezapísali:`}</b><ul class="failed">${dr.failed.map((f) => `<li>${esc(nameOf(f.key))} – ${esc(f.error || 'chyba')}</li>`).join('')}</ul></div></div>`;
    }
    return out;
  }

  function cellHtml(r, col, prevCol) {
    const cell = r.cells[col.w.n];
    if (!cell) return '<td class="cell empty"></td>';
    const e = cell.e;
    let notes = '';
    // span s role=button: v neodcvičenej bunke je značka vnútri tlačidla bunky (button v buttone nejde)
    if (e.done.note) notes += `<span class="notebtn nb-client" role="button" tabindex="0" data-a="note" data-r="${esc(r.key)}" data-w="${col.w.n}" aria-label="Poznámka klienta">!</span>`;
    if (e.planned.note) notes += `<span class="notebtn nb-coach" role="button" tabindex="0" data-a="note" data-r="${esc(r.key)}" data-w="${col.w.n}" aria-label="Poznámka trénera">T</span>`;
    if (!hasAny(e.done)) {
      return `<td class="cell plan"><button class="cellbtn" data-a="cell" data-r="${esc(r.key)}" data-w="${col.w.n}" aria-label="Upraviť plán">
        <span class="w">${esc(prettyNum(e.planned.weight) || '–')}${isNumW(e.planned.weight) ? ' kg' : ''}${notes ? `<span class="nts">${notes}</span>` : ''}</span>
        <span class="s">plán ${esc(prettySets(e.planned.sets))}${e.planned.rpe ? ' · RPE ' + esc(prettyNum(e.planned.rpe)) : ''}</span></button></td>`;
    }
    const v = C.totalKg(C.volume(e.name, e.planned, e.done));
    const pc = prevCol && r.cells[prevCol.w.n];
    const pv = pc && hasAny(pc.e.done) ? C.totalKg(C.volume(pc.e.name, pc.e.planned, pc.e.done)) : 0;
    const cls = pv && v ? (v > pv * 1.005 ? 'up' : v < pv * 0.995 ? 'down' : '') : '';
    const vl = v ? `<span class="v">objem <b>${esc(C.formatVolume(v))}</b>${pv ? ` <span class="p ${cls}">${esc(C.formatPct(v / pv - 1))}</span>` : ''}</span>` : '';
    return `<td class="cell ${cls}"><span class="w">${esc(prettyNum(e.done.weight) || '–')}${isNumW(e.done.weight) ? ' kg' : ''}${notes ? `<span class="nts">${notes}</span>` : ''}</span>
      <span class="s">${esc(e.done.sets === 'Ok' ? 'Ok' : prettySets(e.done.sets))}${e.done.rpe ? ' · RPE ' + esc(prettyNum(e.done.rpe)) : ''}</span>${vl}</td>`;
  }

  function shortWhy(r, pct) {
    const s = r.s;
    const target = /cieľ (\d+×\d+) opak/.exec(s.reason);
    if (s.review) return 'skontroluj – krok je veľký';
    if (s.rule === 'R0') return 'nedá sa vyhodnotiť';
    if (s.rule === 'R1') return 'bez zápisu – ponechané';
    if (s.rule === 'R2') return 'váha podľa seba';
    if (s.rule === 'R3') return /2× po sebe/.test(s.reason) ? '2× nezvládnuté → ľahšie' : 'nezvládnuté – ponechané';
    if (s.rule === 'R4') return 'RPE nad plánom – ponechané';
    if (target) return `cieľ ${target[1]} opak.`;
    if (s.rule === 'R5') return `ľahké → +${fmtKg(pct * 2)} % objemu`;
    if (s.rule === 'R6') return `splnené → +${fmtKg(pct)} % objemu`;
    return '';
  }

  function draftCell(d, dr, dRow) {
    const key = dRow.key;
    const id = `dr-${key.replace('|', '-')}`;
    if (dRow.skip) {
      return `<td class="draft skipped"><div class="dcell"><span class="muted">vynechané</span><button class="link" data-a="unskip" data-k="${key}">vrátiť</button></div></td>`;
    }
    const f = dRow.fields, base = dRow.e.planned;
    const wNew = C.parseWeight(String(f.weight).split(/\s+a\s+/)[0]), wOld = C.parseWeight(String(base.weight).split(/\s+a\s+/)[0]);
    const dw = wNew && wOld && wNew.lo && wOld.lo ? wNew.lo - wOld.lo : 0;
    const lastDone = dRow.src ? C.totalKg(C.volume(dRow.e.name, dRow.src.planned, dRow.src.done)) : 0;
    const nv = C.totalKg(C.volume(dRow.e.name, f, f));
    const volLine = nv ? `<span class="v">objem <b>${esc(C.formatVolume(nv))}</b>${lastDone ? ` <span class="p ${nv > lastDone * 1.005 ? 'up' : nv < lastDone * 0.995 ? 'down' : ''}">${esc(C.formatPct(nv / lastDone - 1))}</span>` : ''}</span>` : '';
    const why = dRow.st.edited ? '<span class="why">upravené</span>'
      : dr.mode === 'copy' ? `<span class="why">${dr.edit ? 'aktuálny plán' : `kópia T${dr.from}`}</span>`
      : `<span class="why ${dRow.s.review ? 'rev' : ''}" title="${esc(dRow.s.reason)}">${dw ? `<span class="d ${dw > 0 ? 'up' : 'down'}">${dw > 0 ? '+' : '−'}${esc(fmtKg(Math.abs(dw)))} kg</span> ` : ''}${esc(shortWhy(dRow, settingsOf(d).pct))}</span>`;
    const inp = (k, cls, label, ph) => `<input id="${id}-${k}" class="${cls} ${String(f[k] || '') !== String(base[k] || '') ? 'chg' : ''}" data-dk="${key}" data-f="${k}" value="${esc(f[k] || '')}" placeholder="${esc(ph)}" aria-label="${esc(label + ' – ' + nice(dRow.e.name))}" autocomplete="off">`;
    return `<td class="draft"><div class="dcell">
      <div class="dline">${inp('weight', 'wt', 'Váha', 'kg')}<span class="unit">kg</span></div>
      <div class="dline">${inp('sets', 'sets', 'Série', '3x10')}${inp('rpe', 'rpe', 'RPE', 'RPE')}</div>
      ${inp('note', 'note', 'Poznámka pre klienta', 'poznámka pre klienta')}
      ${volLine}${why}
      <span class="dacts">${dRow.st.edited ? `<button class="link" data-a="unedit" data-k="${key}">späť na ${dr.mode === 'copy' ? (dr.edit ? 'plán' : 'kópiu') : 'návrh'}</button>` : ''}<button class="link muted" data-a="skip" data-k="${key}">vynechať</button></span>
    </div></td>`;
  }

  function renderGrid(c, d, model, g, dr) {
    const allCols = model.cols;
    const cols = dr && dr.edit ? allCols.filter(({ w }) => w.n !== dr.from) : allCols;
    const lpIdx = lastPlannedIdx(d);
    const lpUnstarted = lpIdx >= 0 && !d.weeks[lpIdx].days.some((x) => x.exercises.some((e) => hasAny(e.done)));
    const curIdx = currentWeekIdx(d);
    const drows = dr ? draftRows(c, d, dr) : [];
    const dByRow = new Map(drows.map((x) => [x.rowKey, x]));
    const target = dr ? dr.target || expectedTarget(d, d.weeks.findIndex((w) => w.n === dr.from)) : null;
    const focusSet = state.focus ? g[state.focus] : null;
    const srcWeek = dr ? d.weeks.find((w) => w.n === dr.from) : null;
    const srcDates = srcWeek ? srcWeek.days.map((x) => x.date).filter(Boolean) : [];
    const draftRange = !srcDates.length ? '' : dr && dr.edit ? weekRange(srcWeek) : `${formatDate(isoPlus(srcDates[0], 7), false)} – ${formatDate(isoPlus(srcDates[srcDates.length - 1], 7), false)}`;
    const st = settingsOf(d);
    const head = `<thead><tr><th class="exc">Cvik</th>${cols.map(({ w, wi }) => `<th class="wk ${wi === curIdx ? 'cur' : ''}"><b>T${w.n}</b>${esc(weekRange(w))}${wi === curIdx ? ' · teraz' : wi > curIdx ? ' · naplánovaný' : ''}${!dr && wi === lpIdx && lpUnstarted ? ` <button class="link" data-a="edit-week" data-w="${w.n}">upraviť</button>` : ''}</th>`).join('')}
      ${dr ? `<th class="draft"><div class="draft-head"><b>T${target} · ${dr.edit ? 'úprava' : 'nový'}</b><span>${esc(draftRange)}</span>
        <div class="seg" role="group" aria-label="Predvyplnenie"><button class="${dr.mode === 'copy' ? 'on' : ''}" data-a="mode" data-m="copy">${dr.edit ? 'Aktuálny plán' : `Kópia T${dr.from}`}</button><button class="${dr.mode === 'suggest' ? 'on' : ''}" data-a="mode" data-m="suggest">${dr.edit ? 'Návrh podľa výkonov' : 'Návrh'}</button></div>
        ${dr.mode === 'suggest' ? `<label class="pct">cieľ objemu <select id="dr-pct" data-pct="1">${PCT_OPTIONS.map((v) => `<option value="${v}" ${Number(st.pct) === v ? 'selected' : ''}>+${String(v).replace('.', ',')} %</option>`).join('')}</select></label>` : ''}
      </div></th>` : ''}</tr></thead>`;
    const nCols = cols.length + 1 + (dr ? 1 : 0);
    const body = model.days.map((dayN) => {
      const rows = model.rows.filter((r) => r.day === dayN);
      const latest = rows.map((r) => r.cells[allCols[allCols.length - 1].w.n]).find(Boolean);
      const dayDate = latest && latest.day.date;
      let out = `<tr class="dayrow"><th class="exc">Deň ${dayN}${dayDate ? ` · ${DAY_NAMES[dateOf(dayDate).getDay()]}` : ''}</th><td colspan="${nCols - 1}"></td></tr>`;
      out += rows.map((r) => {
        const cls = focusSet ? (focusSet.includes(r.key) ? 'hl' : 'dim') : '';
        const latestCell = allCols.slice().reverse().map(({ w }) => r.cells[w.n]).find(Boolean);
        const t = r.trend;
        const trendHtml = t.kind === 'none' ? '' : `<span class="trend ${t.kind}" title="${esc(t.why)}">${t.kind === 'up' ? '↑ hore' : t.kind === 'down' ? '↓ klesá' : '→ stagnuje'}</span>`;
        const dRow = dByRow.get(r.key);
        return `<tr class="${cls}"><th class="exc"><button class="exname" data-a="ex" data-r="${esc(r.key)}">${esc(nice(r.name))}</button>
          <div class="exmeta">${trendHtml}${t.fatigue ? '<span class="trend down" title="RPE rastie pri rovnakej váhe">únava</span>' : ''}<span>${esc(prettySets(latestCell.e.planned.sets))}${latestCell.e.planned.rpe ? ' · RPE ' + esc(prettyNum(latestCell.e.planned.rpe)) : ''}</span></div></th>
          ${cols.map((col, i) => cellHtml(r, col, cols[i - 1])).join('')}
          ${dr ? (dRow ? draftCell(d, dr, dRow) : '<td class="draft none"></td>') : ''}</tr>`;
      }).join('');
      if (dr) {
        out += (dr.extra || []).filter((x) => x.day === dayN).map((x) => {
          const id = `x-${x.id}`;
          const inp = (k, cls, ph) => `<input id="${id}-${k}" class="${cls} chg" data-x="${x.id}" data-f="${k}" value="${esc(x.fields[k] || '')}" placeholder="${esc(ph)}" autocomplete="off">`;
          return `<tr class="newrow"><th class="exc">${inp('name', 'nameinput', 'Názov nového cviku')}<div class="exmeta"><span class="trend up">nový cvik</span><button class="link muted" data-a="drop-extra" data-x="${x.id}">odstrániť</button></div></th>
            ${cols.map(() => '<td class="cell empty"></td>').join('')}
            <td class="draft"><div class="dcell"><div class="dline">${inp('weight', 'wt', 'kg')}<span class="unit">kg</span></div><div class="dline">${inp('sets', 'sets', '3x10')}${inp('rpe', 'rpe', 'RPE')}</div>${inp('note', 'note', 'poznámka pre klienta')}<span class="why">nový cvik</span></div></td></tr>`;
        }).join('');
        const slot = freeSlot(d, dr, dayN);
        const canAdd = slot && d.version >= 3;
        out += `<tr class="addrow"><th class="exc">${canAdd ? `<button class="link" data-a="add-extra" data-day="${dayN}">+ cvik do Dňa ${dayN}</button>` : `<span class="muted small">${slot ? 'Nový cvik: treba aktualizovať Apps Script' : 'Deň je plný'}</span>`}</th><td colspan="${nCols - 1}"></td></tr>`;
      }
      return out;
    }).join('');
    return `<table class="g">${head}<tbody>${body}</tbody></table>`;
  }

  function barText(c, d, dr) {
    const n = draftChanges(draftRows(c, d, dr), dr);
    return `${n} ${plural(n, 'zmena', 'zmeny', 'zmien')}`;
  }
  function renderBar() {
    let bar = document.getElementById('bar');
    const c = client();
    const d = c && dataOf(c.id);
    const dr = d && state.view === 'client' && state.cred.pass ? getDraft(c) : null;
    if (!dr) { if (bar) bar.remove(); document.body.classList.remove('has-bar'); return; }
    if (!bar) { bar = document.createElement('div'); bar.id = 'bar'; bar.className = 'bar'; document.body.appendChild(bar); }
    document.body.classList.add('has-bar');
    const target = dr.target || expectedTarget(d, d.weeks.findIndex((w) => w.n === dr.from));
    const failed = dr.failed && dr.failed.length;
    const busy = state.busy.send;
    bar.innerHTML = `<div class="bar-in"><div class="info"><b>${failed ? `T${target}: ${dr.failed.length} ${plural(dr.failed.length, 'cvik čaká', 'cviky čakajú', 'cvikov čaká')}` : dr.edit ? `Úprava T${target}` : `Nový T${target}`}</b><span id="bar-sub">${esc(barText(c, d, dr))}</span></div>
      <button class="btn ghost" data-a="discard" ${busy ? 'disabled' : ''}>Zahodiť</button>
      <button class="btn" data-a="${failed ? 'retry-send' : 'send'}" ${busy || !d.settings ? 'disabled' : ''}>${busy ? 'Odosielam…' : failed ? 'Odoslať chýbajúce' : dr.edit ? 'Uložiť a poslať klientovi' : 'Odoslať klientovi'}</button></div>`;
  }

  // ----- Vrstva: poznámka, úprava bunky, detail cviku, telo -----
  const rowByKey = (d, key) => buildModel(d).rows.find((r) => r.key === key);

  function renderLayer() {
    if (state.drawer && state.drawer.kind === 'add') {
      return `<div class="drawer-bg" data-a="close-drawer"></div><aside class="drawer" role="dialog" aria-label="Pridať klienta">
        <div class="drawer-head"><h2>Pridať klienta</h2><button class="icon-btn" data-a="close-drawer" aria-label="Zavrieť">${ICON.close}</button></div>
        ${addClientForm()}</aside>`;
    }
    const c = client();
    const d = c && dataOf(c.id);
    if (!d || state.view !== 'client' || !state.cred.pass) return '';
    let out = '';
    if (state.pop) {
      const p = state.pop;
      const r = rowByKey(d, p.r);
      const cell = r && r.cells[p.w];
      if (cell) {
        const style = `top:${Math.round(p.top)}px;left:${Math.round(p.left)}px`;
        if (p.kind === 'note') {
          out += `<div class="pop" style="${style}" role="dialog"><b>${esc(nice(r.name))} · T${p.w}</b>
            ${cell.e.done.note ? `<div><span class="who">Klient</span>„${esc(cell.e.done.note)}“</div>` : ''}
            ${cell.e.planned.note ? `<div><span class="who">Tréner</span>${esc(cell.e.planned.note)}</div>` : ''}</div>`;
        } else {
          const f = cell.e.planned;
          const field = (k, label, ph) => `<label class="pf pf-${k}"><span>${label}</span><input id="pc-${k}" value="${esc(f[k] || '')}" placeholder="${esc(ph)}" autocomplete="off"></label>`;
          out += `<div class="pop edit" style="${style}" role="dialog"><b>${esc(nice(r.name))} · plán T${p.w}, Deň ${cell.day.n}</b>
            <div class="pgrid">${field('weight', 'Váha', 'kg')}${field('sets', 'Série', '3x10')}${field('rpe', 'RPE', '8')}</div>${field('note', 'Poznámka pre klienta', '')}
            <div class="pacts"><button class="btn small ghost" data-a="pop-close">Zrušiť</button><button class="btn small" data-a="cell-save" ${state.busy.cell ? 'disabled' : ''}>${state.busy.cell ? 'Ukladám…' : 'Uložiť do tabuľky'}</button></div></div>`;
        }
      }
    }
    if (state.drawer && state.drawer.kind === 'ex') out += renderExDrawer(c, d, state.drawer.key);
    if (state.drawer && state.drawer.kind === 'body') out += renderBodyDrawer(d);
    return out;
  }

  function chartSvg(pts, opts) {
    const W = 380, H = 170, L = 46, R = 12, T = 14, B = 26;
    if (!pts.length) return '<p class="hint">Zatiaľ žiadne dáta.</p>';
    const vals = pts.map((p) => p.value);
    let mn = Math.min(...vals), mx = Math.max(...vals);
    if (mn === mx) { mn -= 1; mx += 1; }
    const padV = (mx - mn) * 0.15; mn -= padV; mx += padV;
    const x = (i) => (pts.length === 1 ? (L + W - R) / 2 : L + (i * (W - L - R)) / (pts.length - 1));
    const y = (v) => T + (1 - (v - mn) / (mx - mn)) * (H - T - B);
    const fmt = opts && opts.vol ? (v) => C.formatVolume(Math.round(v)) : (v) => fmtKg(Math.round(v * 10) / 10);
    const grid = [0, 0.5, 1].map((f) => { const v = mn + (mx - mn) * f; return `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${L - 6}" y="${y(v) + 3}" text-anchor="end">${esc(fmt(v))}</text>`; }).join('');
    const seps = pts.map((p, i) => (i && p.block !== pts[i - 1].block ? `<line class="sep" x1="${(x(i) + x(i - 1)) / 2}" x2="${(x(i) + x(i - 1)) / 2}" y1="${T}" y2="${H - B}"/>` : '')).join('');
    const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
    const dots = pts.map((p, i) => `<circle class="dot ${p.cur ? '' : 'old'}" cx="${x(i)}" cy="${y(p.value)}" r="3.5"><title>${esc(p.label)}: ${esc(fmt(p.value))}</title></circle>`).join('');
    const lbl = [0, pts.length - 1].filter((v, i, a) => a.indexOf(v) === i).map((i) => `<text class="axis" x="${x(i)}" y="${H - 8}" text-anchor="${pts.length === 1 ? 'middle' : i === 0 ? 'start' : 'end'}">${esc(pts[i].label)}</text>`).join('');
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">${grid}${seps}<path class="line" d="${path}"/>${dots}${lbl}</svg>`;
  }

  function renderExDrawer(c, d, key) {
    const r = rowByKey(d, key);
    if (!r) return '';
    const k = nameKey(r.name);
    const hist = state.history[c.id];
    const pts = [];
    const add = (weeks, block, cur) => weeks.forEach((w) => w.days.forEach((day) => day.exercises.forEach((e) => {
      if (nameKey(e.name) !== k || !hasAny(e.done)) return;
      const wp = C.parseWeight(String(e.done.weight).split(/\s+a\s+/)[0]);
      pts.push({ date: day.date || '', block, cur, week: w.n, e, w: wp && wp.lo ? wp.lo : null, v: C.totalKg(C.volume(e.name, e.planned, e.done)), label: day.date ? formatDate(day.date, false) : 'T' + w.n });
    })));
    if (hist) hist.sheets.forEach((s) => add(s.weeks, s.name, false));
    add(d.weeks, d.sheet, true);
    pts.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const wPts = pts.filter((p) => p.w).map((p) => ({ value: p.w, label: p.label, block: p.block, cur: p.cur }));
    const vPts = pts.filter((p) => p.v).map((p) => ({ value: p.v, label: p.label, block: p.block, cur: p.cur }));
    const notes = [];
    for (const p of pts.slice().reverse()) if (p.e.done.note) notes.push([`Klient · ${p.cur ? 'T' + p.week : p.block.trim() + ' · T' + p.week}${p.date ? ' · ' + p.label : ''}`, `„${p.e.done.note}“`]);
    for (const col of buildModel(d).cols.slice().reverse()) { const cell = r.cells[col.w.n]; if (cell && cell.e.planned.note) notes.push([`Tréner · T${col.w.n}`, cell.e.planned.note]); }
    const t = r.trend;
    const step = stepFor(d, r.name);
    return `<div class="drawer-bg" data-a="close-drawer"></div><aside class="drawer" role="dialog" aria-label="Detail cviku">
      <div class="drawer-head"><h2>${esc(nice(r.name))}</h2><button class="icon-btn" data-a="close-drawer" aria-label="Zavrieť">${ICON.close}</button></div>
      <div class="flags">${t.kind !== 'none' ? `<span class="flag ${t.kind}">${t.kind === 'up' ? '↑ hore' : t.kind === 'down' ? '↓ klesá' : '→ stagnuje'} · ${esc(t.why)}</span>` : ''}${t.fatigue ? '<span class="flag warn">rastie únava</span>' : ''}</div>
      <section><h3>Váha (kg)</h3>${chartSvg(wPts)}</section>
      <section><h3>Objem cviku (kg)</h3>${chartSvg(vPts, { vol: true })}</section>
      <p class="hint">${hist && hist.loading ? 'Načítavam staršie bloky…' : hist && hist.sheets.length ? `Vrátane starších blokov (${esc(hist.sheets.map((s) => s.name.trim()).join(', '))}) – svetlé body, zvislá čiara = nový blok.` : 'Aktuálny blok.'}</p>
      <label class="stepset">Krok váhy pre návrhy <select id="step-select" data-step="${esc(k)}">${STEP_OPTIONS.map((v) => `<option value="${v}" ${v === step ? 'selected' : ''}>${fmtKg(v)} kg</option>`).join('')}${STEP_OPTIONS.includes(step) ? '' : `<option selected value="${step}">${fmtKg(step)} kg</option>`}</select></label>
      <section><h3>Poznámky</h3><div class="notes">${notes.length ? notes.map(([who, txt]) => `<div class="note"><span class="who">${esc(who)}</span>${esc(txt)}</div>`).join('') : '<div class="note">Zatiaľ žiadne.</div>'}</div></section>
    </aside>`;
  }

  function renderBodyDrawer(d) {
    const wst = weightStatus(d);
    const pts = d.weights.slice(-90).map((w) => ({ value: w.kg, label: formatDate(w.date, false), block: '', cur: true }));
    const photos = d.photos.slice().reverse().map((p) => `<a class="note link-row" href="${esc(p.url)}" target="_blank" rel="noopener"><span class="who">${esc(formatDate(p.date))}</span>${p.count} ${plural(p.count, 'fotka', 'fotky', 'fotiek')} · otvoriť na Drive ›</a>`).join('');
    const avg = (v) => (v != null ? esc(fmtKg(Math.round(v * 10) / 10)) : '–');
    return `<div class="drawer-bg" data-a="close-drawer"></div><aside class="drawer" role="dialog" aria-label="Váha a fotky">
      <div class="drawer-head"><h2>Ranná váha a fotky</h2><button class="icon-btn" data-a="close-drawer" aria-label="Zavrieť">${ICON.close}</button></div>
      <div class="tiles"><div class="tile"><div class="tile-v">${wst ? esc(fmtKg(wst.last.kg)) : '–'}</div><div class="tile-k">posledná</div></div>
        <div class="tile"><div class="tile-v">${wst ? avg(wst.avg7) : '–'}</div><div class="tile-k">priemer 7 dní</div></div>
        <div class="tile"><div class="tile-v">${wst ? avg(wst.avg30) : '–'}</div><div class="tile-k">priemer 30 dní</div></div></div>
      <section><h3>Ranná váha (kg)</h3>${chartSvg(pts)}</section>
      <section><h3>Fotky progresu</h3><div class="notes">${photos || '<div class="note">Zatiaľ žiadne fotky.</div>'}</div></section>
    </aside>`;
  }

  // ---------------------------------------------------------------------------
  // Udalosti
  // ---------------------------------------------------------------------------
  function openClient(id) {
    state.view = 'client';
    state.clientId = id;
    state.focus = null;
    state.drawer = null;
    state.pop = null;
    save(KEY.view, id);
    render();
    window.scrollTo(0, 0);
    const c = client();
    if (c) loadClient(c, true);
  }
  function leaveClient() {
    const c = client();
    if (c) markNotesSeen(c);
    state.view = 'clients';
    state.drawer = null;
    state.pop = null;
    save(KEY.view, null);
    render();
    window.scrollTo(0, 0);
  }
  function updateDraft(fn) {
    const c = client();
    const dr = getDraft(c);
    if (!dr) return;
    fn(dr, c);
    putDraft(c, dr);
  }

  document.addEventListener('submit', (e) => {
    if (e.target.id !== 'add-form') return;
    e.preventDefault();
    if (addClientFromLink(document.getElementById('add-link').value)) { state.drawer = null; render(); }
  });
  app.addEventListener('submit', async (e) => {
    if (e.target.id !== 'login-form') return;
    e.preventDefault();
    state.cred = { user: e.target.elements.user.value.trim(), pass: e.target.elements.pass.value };
    state.busy.login = true;
    state.loginError = null;
    render();
    const results = await Promise.all(state.clients.map((c) => loadClient(c, true)));
    state.busy.login = false;
    if (results.some((r) => r && r.d)) save(KEY.cred, state.cred);
    else {
      state.loginError = (results[0] && results[0].error) || 'Prihlásenie zlyhalo';
      state.cred.pass = '';
    }
    render();
  });

  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.dk) {
      // Úprava rozpracovaného týždňa – ulož hneď, prekresli až po dopísaní (change).
      updateDraft((dr, c) => {
        const r = draftRows(c, dataOf(c.id), dr).find((x) => x.key === el.dataset.dk);
        if (!r) return;
        dr.rows[r.key] = { ...(dr.rows[r.key] || {}), edited: true, fields: { ...r.fields, [el.dataset.f]: el.value } };
      });
      el.classList.add('chg');
      const c = client();
      const sub = document.getElementById('bar-sub');
      if (sub) sub.textContent = barText(c, dataOf(c.id), getDraft(c));
    } else if (el.dataset.x) {
      updateDraft((dr) => { const x = (dr.extra || []).find((q) => q.id === el.dataset.x); if (x) x.fields[el.dataset.f] = el.value; });
    }
  });
  document.addEventListener('change', (e) => {
    const el = e.target;
    const c = client();
    if (el.dataset.dk || el.dataset.x) render();
    else if (el.dataset.pct != null && c) saveSetting(c, 'progres_percent', Number(el.value));
    else if (el.dataset.step != null && c) saveSetting(c, 'krok:' + el.dataset.step, Number(el.value));
  });
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('notebtn')) { e.preventDefault(); handle('note', e.target); return; }
    if (e.key === 'Escape' && (state.pop || state.drawer)) { state.pop = null; state.drawer = null; render(); }
    if (e.key === 'Enter' && e.target.closest && e.target.closest('.pop.edit')) { e.preventDefault(); handle('cell-save'); }
  });
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-a]');
    if (!t) {
      if (state.pop && !e.target.closest('.pop')) { state.pop = null; render(); }
      return;
    }
    if (t.dataset.a === 'close-drawer' && t.classList.contains('drawer-bg') && t !== e.target) return;
    handle(t.dataset.a, t);
  });

  function popAt(t, kind) {
    const rect = t.getBoundingClientRect();
    const w = kind === 'cell' ? 320 : 300;
    return { top: Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - (kind === 'cell' ? 250 : 160))), left: Math.max(8, Math.min(rect.left - 40, window.innerWidth - w - 8)) };
  }

  async function handle(action, t) {
    const c = client();
    switch (action) {
      case 'open': openClient(t.dataset.id); break;
      case 'clients': leaveClient(); break;
      case 'reload-all': loadAll(); break;
      case 'reload': if (c) { state.history[c.id] = null; loadClient(c); } break;
      case 'retry': { const cc = state.clients.find((x) => x.id === t.dataset.id); if (cc) loadClient(cc); break; }
      case 'remove': {
        const cc = state.clients.find((x) => x.id === t.dataset.id);
        if (!cc || !(await confirmBox(`Odstrániť klienta ${cc.title || ''} zo zoznamu? Jeho tabuľka ostane nezmenená.`, 'Odstrániť', 'Nechať'))) break;
        state.clients = state.clients.filter((x) => x.id !== cc.id);
        save(KEY.clients, state.clients);
        render();
        break;
      }
      case 'logout': state.cred.pass = ''; state.data = {}; save(KEY.cred, state.cred); leaveClient(); break;
      case 'focus': state.focus = state.focus === t.dataset.k ? null : t.dataset.k; render(); break;
      case 'note': state.pop = { kind: 'note', r: t.dataset.r, w: Number(t.dataset.w), ...popAt(t, 'note') }; render(); break;
      case 'cell': {
        state.pop = { kind: 'cell', r: t.dataset.r, w: Number(t.dataset.w), ...popAt(t, 'cell') };
        render();
        const el = document.getElementById('pc-weight');
        if (el) el.focus();
        break;
      }
      case 'pop-close': state.pop = null; render(); break;
      case 'cell-save': {
        const p = state.pop;
        const d = c && dataOf(c.id);
        const r = p && d && rowByKey(d, p.r);
        const cell = r && r.cells[p.w];
        if (!cell) break;
        const val = (k) => ((document.getElementById('pc-' + k) || {}).value || '').trim();
        await saveCell(c, p.w, cell.day.n, cell.e.col, { sets: val('sets'), weight: val('weight'), rpe: val('rpe'), note: val('note') });
        break;
      }
      case 'ex': state.drawer = { kind: 'ex', key: t.dataset.r }; state.pop = null; render(); loadHistory(c); break;
      case 'body': state.drawer = { kind: 'body' }; state.pop = null; render(); break;
      case 'close-drawer': state.drawer = null; render(); break;
      case 'add-client': state.drawer = { kind: 'add' }; render(); { const el = document.getElementById('add-link'); if (el) el.focus(); } break;
      case 'edit-week': {
        const d = dataOf(c.id);
        const n = Number(t.dataset.w);
        putDraft(c, { sheet: d.sheet, from: n, target: n, edit: true, mode: 'copy', rows: {}, extra: [] });
        render();
        const gw = app.querySelector('.gridwrap');
        if (gw) gw.scrollLeft = gw.scrollWidth;
        break;
      }
      case 'add-week': {
        const d = dataOf(c.id);
        const lp = lastPlannedIdx(d);
        if (lp < 0) break;
        putDraft(c, { sheet: d.sheet, from: d.weeks[lp].n, mode: 'suggest', rows: {}, extra: [] });
        render();
        const gw = app.querySelector('.gridwrap');
        if (gw) gw.scrollLeft = gw.scrollWidth;
        break;
      }
      case 'mode': {
        const dr = getDraft(c);
        const edited = Object.values(dr.rows).some((x) => x.edited);
        if (edited && !(await confirmBox('Tvoje ručné úpravy v tomto stĺpci sa nahradia. Pokračovať?', 'Nahradiť', 'Ponechať úpravy'))) break;
        updateDraft((x) => { x.mode = t.dataset.m; x.rows = {}; });
        render();
        break;
      }
      case 'unedit': updateDraft((dr) => { const s = dr.rows[t.dataset.k] || {}; dr.rows[t.dataset.k] = { skip: s.skip }; }); render(); break;
      case 'skip': updateDraft((dr) => { dr.rows[t.dataset.k] = { ...(dr.rows[t.dataset.k] || {}), skip: true }; }); render(); break;
      case 'unskip': updateDraft((dr) => { dr.rows[t.dataset.k] = { ...(dr.rows[t.dataset.k] || {}), skip: false }; }); render(); break;
      case 'add-extra': {
        const dayN = Number(t.dataset.day);
        let newId = null;
        updateDraft((dr) => {
          const col = freeSlot(dataOf(c.id), dr, dayN);
          if (!col) return;
          newId = Date.now().toString(36);
          dr.extra = dr.extra || [];
          dr.extra.push({ id: newId, day: dayN, col, fields: { name: '', sets: '3x10', weight: '', rpe: '8', note: '' } });
        });
        render();
        if (newId) { const el = document.getElementById(`x-${newId}-name`); if (el) el.focus(); }
        break;
      }
      case 'drop-extra': updateDraft((dr) => { dr.extra = (dr.extra || []).filter((x) => x.id !== t.dataset.x); }); render(); break;
      case 'discard':
        if (await confirmBox('Zahodiť rozpracovaný týždeň? Do tabuľky sa nič nezapísalo.', 'Zahodiť', 'Pokračovať v úpravách')) { putDraft(c, null); render(); }
        break;
      case 'send': await sendDraft(c, false); break;
      case 'retry-send': await sendDraft(c, true); break;
    }
  }

  // ---------------------------------------------------------------------------
  // Štart: odkaz od klienta má tvar trener.html#s=<base64 URL skriptu>
  // ---------------------------------------------------------------------------
  const m = location.hash.match(/#s=([^&]+)/);
  if (m) {
    try {
      const url = decodeURIComponent(escape(atob(m[1])));
      if (/^https:\/\/script\.google\.com\/.+\/exec$/.test(url) && !state.clients.some((x) => x.scriptUrl === url)) {
        state.clients.push({ id: idFor(url), scriptUrl: url });
        save(KEY.clients, state.clients);
        setTimeout(() => toast('Klient pridaný do zoznamu'), 300);
      }
    } catch (_) { /* neplatný odkaz */ }
    history.replaceState(null, '', location.pathname);
  }
  // Nová verzia panela: version.json sa číta vždy zo siete; pri novšej verzii ponúkni načítanie
  // s ?v=… (obíde 10-minútovú pamäť GitHub Pages). Rozpracovaný týždeň je v localStorage, nestratí sa.
  async function checkVersion() {
    if (!PANEL_VERSION || document.getElementById('upd')) return;
    try {
      const res = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
      const v = Number((await res.json()).version) || 0;
      if (v <= PANEL_VERSION) return;
      const el = document.createElement('div');
      el.id = 'upd';
      el.className = 'upd';
      el.innerHTML = `<span>Je dostupná nová verzia panela (${v}).</span><button class="btn small" type="button">Načítať</button>`;
      el.querySelector('button').addEventListener('click', () => location.replace(location.pathname + '?v=' + v));
      document.body.appendChild(el);
    } catch (_) { /* offline – skúsime nabudúce */ }
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkVersion(); });
  checkVersion();

  const lastView = load(KEY.view, null);
  if (lastView && state.clients.some((x) => x.id === lastView)) { state.view = 'client'; state.clientId = lastView; }
  render();
  if (state.cred.pass) loadAll();
})();
