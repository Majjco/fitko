/* Fitko · Tréner – portál pre trénera nad tou istou Google tabuľkou.
 * Číta a zapisuje cez Apps Script klienta (rola „coach“ = meno + heslo trénera).
 * Tréner môže meniť PLANNED stĺpce, pridávať/odoberať cviky a plánovať ďalší týždeň. */
(function () {
  'use strict';

  const LS_KEY = 'fitko.coach';
  const DAY_NAMES = ['Ne', 'Po', 'Ut', 'St', 'Št', 'Pi', 'So'];

  const state = {
    cfg: load(LS_KEY, { scriptUrl: '', user: '', pass: '' }),
    data: null, // { sheet, title, weeks, weights, photos }
    tab: 'progress',
    weekIdx: null,
    loading: false,
    error: null,
    modal: null, // { name, sel }
    newRows: {}, // "week|day" -> [col, ...] rozpracované nové cviky
    busy: {},
  };

  // ---------------------------------------------------------------------------
  // Pomocné funkcie
  // ---------------------------------------------------------------------------
  function load(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (_) { return fallback; }
  }
  function save(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (_) { /* nič */ } }
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const norm = (s) => String(s || '').toUpperCase().replace(/\s+/g, ' ').trim();
  const pad = (n) => String(n).padStart(2, '0');
  const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const splitParts = (name) => String(name || '').split(/\s+\+\s+/).map((p) => p.trim()).filter(Boolean);
  const matchKey = (s) => norm(s).replace(/\(.*?\)/g, ' ').replace(/\s+-\s+.*$/, '').replace(/\bOF CHOICE\b/g, ' ').replace(/\bDUMB+ELLS?\b/g, 'DB').replace(/\s+/g, ' ').trim();
  const nameKey = (name) => splitParts(name).map(matchKey).join(' + ');
  const cap = (s) => { const t = String(s || '').trim().toLowerCase(); return t.charAt(0).toUpperCase() + t.slice(1); };
  const fmtKg = (n) => (Math.round(n * 10) / 10).toString().replace('.', ',');
  const hasAny = (f) => Boolean(f && (f.sets || f.weight || f.rpe));

  function parseDate(raw) {
    const s = String(raw || '').trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/^(\d{1,2})\.\s*(\d{1,2})\.?\s*(\d{4})?$/);
    if (m) {
      const now = new Date();
      const y = m[3] ? +m[3] : now.getFullYear();
      return isoDate(new Date(y, +m[2] - 1, +m[1]));
    }
    return null;
  }
  function formatDate(iso, withDay = true) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return withDay ? `${DAY_NAMES[dt.getDay()]} ${d}.${m}.` : `${d}.${m}.`;
  }
  const prettySets = (s) => (s ? String(s).replace(/\s*[xX×]\s*/g, ' × ').replace(/BOTH/gi, ' obe').replace(/\s+/g, ' ').trim() : '');
  function prettyWeight(w) {
    const s = String(w || '').trim();
    if (!s) return '';
    if (/^choose$/i.test(s)) return 'podľa seba';
    if (/^[\d\s.,\-–+]+$/.test(s)) return s.replace(/-/g, '–') + ' kg';
    return s;
  }
  function weightParts(w) {
    const s = String(w || '').trim();
    if (!s) return [];
    return s.split(/\s+a\s+|\s*\+\s*|\s*\/\s*|\s*;\s*|\s*&\s*/i).map((seg) => {
      const m = seg.replace(/\d+\s*[x×]\s*(?=\d)/gi, '').match(/\d+(?:[.,]\d+)?/);
      return m ? parseFloat(m[0].replace(',', '.')) : null;
    });
  }
  function doneSummary(d) {
    const out = [];
    if (d.sets) out.push(d.sets === 'Ok' ? 'Ok' : prettySets(d.sets));
    if (d.weight) out.push(prettyWeight(d.weight));
    if (d.rpe) out.push('RPE ' + d.rpe);
    return out.join(' · ');
  }
  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 2800);
  }

  // Rovnaké parsovanie hárku ako v apke klienta (stĺpce podľa hlavičiek „EXERCISE n“).
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
  // Komunikácia so skriptom
  // ---------------------------------------------------------------------------
  async function apiGet() {
    const url = new URL(state.cfg.scriptUrl);
    url.searchParams.set('token', state.cfg.pass);
    url.searchParams.set('user', state.cfg.user);
    const res = await fetch(url.toString());
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Chyba');
    if (data.role !== 'coach') throw new Error('Tieto údaje nie sú prihlásenie trénera');
    return data;
  }
  async function apiPost(body) {
    const res = await fetch(state.cfg.scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...body, sheet: state.data && state.data.sheet, token: state.cfg.pass, user: state.cfg.user }),
    });
    return res.json();
  }

  async function reload(keepWeek) {
    state.loading = true;
    state.error = null;
    render();
    try {
      const d = await apiGet();
      state.data = { sheet: d.sheet, title: d.title, weeks: parsePlan(d.rows.map((r) => r.c)), weights: d.weights || [], photos: (d.photos && d.photos.list) || [] };
      if (!keepWeek || state.weekIdx == null) state.weekIdx = defaultWeekIdx();
    } catch (e) {
      state.error = e.message;
    } finally {
      state.loading = false;
      render();
    }
  }

  // Plán sa otvorí na poslednom naplánovanom týždni – tam tréner reálne pracuje.
  function defaultWeekIdx() {
    const weeks = state.data.weeks;
    for (let k = weeks.length - 1; k >= 0; k--) if (weeks[k].days.some((d) => d.exercises.length)) return k;
    return 0;
  }

  // Všetky záznamy cvikov chronologicky (pre „Minule“, graf a prehľad).
  function entries() {
    const out = [];
    state.data.weeks.forEach((w, wi) => w.days.forEach((d) => d.exercises.forEach((e) => {
      out.push({ wi, week: w.n, day: d.n, date: d.date, name: e.name, key: nameKey(e.name), planned: e.planned, done: e.done });
    })));
    return out;
  }
  function lastBefore(name, wi, dayN) {
    const k = nameKey(name);
    const list = entries().filter((x) => x.key === k && hasAny(x.done) && (x.wi < wi || (x.wi === wi && x.day < dayN)));
    return list[list.length - 1] || null;
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const app = document.getElementById('app');
  const ICON = {
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
    logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4h4v16h-4M10 17l5-5-5-5M15 12H3"/></svg>',
  };

  function render() {
    const scroll = window.scrollY;
    const drafts = {};
    app.querySelectorAll('[data-field]').forEach((el) => { if (el.dataset.dirty) drafts[el.id] = el.value; });
    let html;
    if (!state.cfg.scriptUrl) html = renderNoLink();
    else if (!state.cfg.pass) html = renderLogin(state.error);
    else if (!state.data) html = state.error ? renderLogin(state.error) : '<div class="empty"><div class="spinner"></div>Načítavam tabuľku…</div>';
    else html = renderMain();
    app.innerHTML = html + (state.modal ? renderModal() : '');
    for (const [id, v] of Object.entries(drafts)) {
      const el = document.getElementById(id);
      if (el) { el.value = v; el.dataset.dirty = '1'; markRow(el); }
    }
    document.body.classList.toggle('sheet-open', Boolean(state.modal));
    window.scrollTo(0, scroll);
  }

  function renderNoLink() {
    return `<div class="empty"><h2>Fitko · Tréner</h2>Otvor odkaz, ktorý ti poslal klient – obsahuje prepojenie na jeho tabuľku.</div>`;
  }

  function renderLogin(err) {
    return `<div class="login">
      <h1>Fitko · Tréner</h1>
      <p>Prehľad a plánovanie tréningov nad tou istou Google tabuľkou. Všetko, čo tu zmeníš, je hneď aj v tabuľke.</p>
      ${err ? `<div class="banner err">${esc(err)}</div>` : ''}
      <form id="login-form" class="form card" autocomplete="on">
        <div class="field"><label for="lg-user">Meno</label><input id="lg-user" name="user" autocomplete="username" value="${esc(state.cfg.user)}"></div>
        <div class="field"><label for="lg-pass">Heslo</label><input id="lg-pass" name="pass" type="password" autocomplete="current-password"></div>
        <button class="btn" type="submit">Prihlásiť sa</button>
      </form>
    </div>`;
  }

  function renderMain() {
    const tabs = [['progress', 'Progres'], ['plan', 'Plán'], ['client', 'Klient']];
    let body = '';
    if (state.tab === 'progress') body = renderProgress();
    else if (state.tab === 'plan') body = renderPlan();
    else body = renderClient();
    return `
      <div class="topbar">
        <h1>${esc(state.data.title || 'Klient')}<span class="sub">Fitko · Tréner · ${esc(state.data.sheet.trim())}${state.loading ? ' · načítavam…' : ''}</span></h1>
        <button class="icon-btn" data-action="reload" aria-label="Obnoviť">${ICON.refresh}</button>
        <button class="icon-btn" data-action="logout" aria-label="Odhlásiť">${ICON.logout}</button>
      </div>
      ${state.error ? `<div class="banner err">${esc(state.error)}</div>` : ''}
      <nav class="tabs">${tabs.map(([k, l]) => `<button class="tab ${state.tab === k ? 'on' : ''}" data-action="tab" data-tab="${k}">${l}</button>`).join('')}</nav>
      ${body}`;
  }

  // ----- Progres: cviky × týždne -----
  function renderProgress() {
    const weeks = state.data.weeks;
    const cols = weeks.map((w, wi) => ({ w, wi })).filter(({ w }) => w.days.some((d) => d.exercises.length));
    const order = [];
    const byKey = {};
    entries().forEach((x) => {
      if (!byKey[x.key]) { byKey[x.key] = { name: x.name, cells: {} }; order.push(x.key); }
      (byKey[x.key].cells[x.wi] = byKey[x.key].cells[x.wi] || []).push(x);
    });
    const head = `<tr><th class="sticky">Cvik</th>${cols.map(({ w }) => `<th>T${w.n}<small>${esc(w.days[0] && w.days[0].date ? formatDate(w.days[0].date, false) : '')}</small></th>`).join('')}<th>Trend</th></tr>`;
    const rows = order.map((k) => {
      const r = byKey[k];
      let prev = null, first = null, lastV = null;
      const tds = cols.map(({ wi }) => {
        const list = r.cells[wi];
        if (!list) return '<td class="na"></td>';
        const parts = list.map((x) => {
          if (hasAny(x.done)) {
            const v = weightParts(x.done.weight)[0];
            let cls = '';
            if (v != null) {
              if (prev != null) cls = v > prev ? 'up' : v < prev ? 'down' : 'same';
              prev = v;
              if (first == null) first = v;
              lastV = v;
            }
            return `<div class="pc ${cls}"><b>${esc(x.done.weight || x.done.sets || '✓')}</b>${x.done.rpe ? `<small>RPE ${esc(x.done.rpe)}</small>` : ''}</div>`;
          }
          return `<div class="pc planned">${esc(x.planned.weight && !/choose/i.test(x.planned.weight) ? x.planned.weight : 'plán')}</div>`;
        });
        return `<td>${parts.join('')}</td>`;
      }).join('');
      const diff = first != null && lastV != null ? lastV - first : null;
      const trend = diff == null ? '' : diff > 0 ? `<span class="up">↑ +${fmtKg(diff)} kg</span>` : diff < 0 ? `<span class="down">↓ −${fmtKg(-diff)} kg</span>` : '<span class="same">=</span>';
      return `<tr><th class="sticky"><button class="linkish" data-action="chart" data-name="${esc(r.name)}">${esc(splitParts(r.name).map(cap).join(' + '))}</button></th>${tds}<td class="trend">${trend}</td></tr>`;
    }).join('');
    return `<p class="hint">Zapísané váhy klienta po týždňoch. Zelená = viac ako minule, červená = menej, sivá = zatiaľ len plán. Klikni na cvik pre graf.</p>
      <div class="ptable-wrap"><table class="grid-table">${head}${rows}</table></div>`;
  }

  // ----- Plán: úprava týždňa -----
  function renderPlan() {
    const weeks = state.data.weeks;
    const wi = state.weekIdx;
    const week = weeks[wi];
    const lastPlanned = weeks.reduce((m, w, i) => (w.days.some((d) => d.exercises.length) ? i : m), -1);
    const range = week.days[0] && week.days[0].date ? `${formatDate(week.days[0].date)} – ${formatDate(week.days[week.days.length - 1].date)}` : 'zatiaľ bez dátumov';
    const days = week.days.map((d) => renderPlanDay(week, wi, d)).join('');
    return `
      <div class="weekbar">
        <button class="icon-btn" data-action="week" data-dir="-1" ${wi <= 0 ? 'disabled' : ''} aria-label="Predchádzajúci týždeň">${ICON.back}</button>
        <div class="label">Týždeň ${week.n}<small>${esc(range)}</small></div>
        <button class="icon-btn" data-action="week" data-dir="1" ${wi >= weeks.length - 1 ? 'disabled' : ''} aria-label="Ďalší týždeň">${ICON.next}</button>
      </div>
      ${wi === lastPlanned ? `<button class="btn ghost copy-week" data-action="copy-week" data-from="${week.n}" ${state.busy.copy ? 'disabled' : ''}>${state.busy.copy ? 'Kopírujem…' : `+ Naplánovať ďalší týždeň (kópia týždňa ${week.n})`}</button>` : ''}
      <div class="plan-days">${days}</div>`;
  }

  function renderPlanDay(week, wi, d) {
    const key = `${week.n}|${d.n}`;
    const used = new Set(d.exercises.map((e) => e.col));
    const pending = (state.newRows[key] || []).filter((c) => !used.has(c));
    const free = d.slots.filter((c) => !used.has(c) && !pending.includes(c));
    const rows = d.exercises.map((e) => renderPlanRow(week, wi, d, e)).join('') +
      pending.map((col) => renderPlanRow(week, wi, d, { col, name: '', planned: { sets: '', weight: '', rpe: '', note: '' }, done: {} }, true)).join('');
    return `<section class="pday ${d.exercises.length || pending.length ? '' : 'rest'}">
      <div class="pday-head"><b>Deň ${d.n}</b> <span>${esc(formatDate(d.date))}</span>${d.exercises.length || pending.length ? '' : ' <span class="muted">· voľno</span>'}</div>
      ${rows ? `<div class="prow-head"><span>Cvik</span><span>Série × opak.</span><span>Váha</span><span>RPE</span><span>Poznámka pre klienta</span><span></span></div>${rows}` : ''}
      ${free.length ? `<button class="add-ex" data-action="add-ex" data-key="${key}" data-col="${free[0]}">+ Pridať cvik</button>` : ''}
    </section>`;
  }

  function renderPlanRow(week, wi, d, e, isNew) {
    const id = `${week.n}-${d.n}-${e.col}`;
    const last = e.name ? lastBefore(e.name, wi, d.n) : null;
    const f = (k, ph, cls) => `<input id="f-${k}-${id}" class="${cls || ''}" data-field="${k}" data-row="${id}" value="${esc(k === 'name' ? e.name : e.planned[k])}" placeholder="${esc(ph)}" autocomplete="off">`;
    const info = [];
    if (hasAny(e.done) || (e.done && e.done.note)) info.push(`<span class="cl">Klient tento týždeň: <b>${esc(doneSummary(e.done) || '—')}</b>${e.done.note ? ` – „${esc(e.done.note)}“` : ''}</span>`);
    if (last) info.push(`<span class="ls">Minule (T${last.week}): <b>${esc(doneSummary(last.done))}</b></span>`);
    const canRemove = !isNew && !hasAny(e.done) && !(e.done && e.done.note);
    return `<div class="prow ${isNew ? 'new' : ''}" id="row-${id}" data-week="${week.n}" data-day="${d.n}" data-col="${e.col}" data-expect="${esc(isNew ? '' : e.name)}">
      ${f('name', 'Názov cviku', 'nm')}${f('sets', '2x8')}${f('weight', 'kg / CHOOSE')}${f('rpe', '7-8')}${f('note', 'Poznámka')}
      <div class="pactions">
        <button class="btn small" data-action="save-row" data-row="${id}" disabled>Uložiť</button>
        ${canRemove ? `<button class="icon-btn small" data-action="remove-row" data-row="${id}" aria-label="Odstrániť cvik">${ICON.trash}</button>` : ''}
        ${isNew ? `<button class="icon-btn small" data-action="cancel-row" data-row="${id}" aria-label="Zrušiť">${ICON.close}</button>` : ''}
      </div>
      ${info.length ? `<div class="pinfo">${info.join('')}</div>` : ''}
    </div>`;
  }

  // ----- Klient: váha, fotky, poznámky -----
  function renderClient() {
    const ws = state.data.weights.slice().sort((a, b) => (a.date < b.date ? -1 : 1));
    const today = isoDate(new Date());
    const minus = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return isoDate(d); };
    const avg = (from) => { const v = ws.filter((w) => w.date >= from && w.date <= today).map((w) => w.kg); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
    const a7 = avg(minus(6)), a30 = avg(minus(29));
    const notes = entries().filter((x) => x.done.note).reverse().slice(0, 25);
    return `<div class="client-grid">
      <section class="card">
        <h3>Ranná váha</h3>
        <div class="tiles">
          <div class="tile"><div class="tile-v">${ws.length ? fmtKg(ws[ws.length - 1].kg) : '–'}</div><div class="tile-k">posledná${ws.length ? ' · ' + formatDate(ws[ws.length - 1].date, false) : ''}</div></div>
          <div class="tile"><div class="tile-v">${a7 != null ? fmtKg(a7) : '–'}</div><div class="tile-k">priemer 7 dní</div></div>
          <div class="tile"><div class="tile-v">${a30 != null ? fmtKg(a30) : '–'}</div><div class="tile-k">priemer 30 dní</div></div>
        </div>
        ${ws.length ? `<div style="margin-top:12px">${chartSvg(ws.slice(-90).map((w) => ({ date: w.date, value: w.kg })), 'w')}</div>` : '<p class="hint">Klient zatiaľ nezapísal váhu.</p>'}
      </section>
      <section class="card">
        <h3>Fotky progresu</h3>
        ${state.data.photos.length ? `<div class="plist">${state.data.photos.slice().reverse().map((p) => `<a class="prow-link" href="${esc(p.url)}" target="_blank" rel="noopener"><span>${esc(formatDate(p.date))}</span><span class="muted">${p.count} ${p.count === 1 ? 'fotka' : p.count < 5 ? 'fotky' : 'fotiek'}</span><span class="accent">Otvoriť ›</span></a>`).join('')}</div>` : '<p class="hint">Zatiaľ žiadne fotky.</p>'}
      </section>
      <section class="card wide">
        <h3>Poznámky klienta k cvikom</h3>
        ${notes.length ? `<div class="notes">${notes.map((x) => `<div class="note"><span class="muted">T${x.week} · Deň ${x.day}${x.date ? ' · ' + formatDate(x.date, false) : ''}</span><b>${esc(splitParts(x.name).map(cap).join(' + '))}</b><span>„${esc(x.done.note)}“</span></div>`).join('')}</div>` : '<p class="hint">Zatiaľ žiadne poznámky.</p>'}
      </section>
    </div>`;
  }

  // ----- Graf -----
  function renderModal() {
    const name = state.modal.name;
    const parts = splitParts(name);
    const k = nameKey(name);
    const list = entries().filter((x) => x.key === k && hasAny(x.done));
    const charts = parts.map((p, pi) => {
      const pts = list.map((x) => {
        const w = weightParts(x.done.weight);
        const v = w.length === 1 && parts.length > 1 ? (pi === 0 ? w[0] : null) : w[pi];
        return v > 0 ? { date: x.date, value: v, week: x.week } : null;
      }).filter(Boolean);
      return `${parts.length > 1 ? `<div class="chart-title">${esc(cap(p))}</div>` : ''}${pts.length ? chartSvg(pts, pi) : '<p class="hint">Bez zapísaných váh.</p>'}`;
    }).join('');
    const rows = list.slice().reverse().map((x) => `<tr><td>T${x.week} · ${esc(x.date ? formatDate(x.date, false) : 'D' + x.day)}</td><td>${esc(x.done.sets === 'Ok' ? 'Ok' : prettySets(x.done.sets))}</td><td><b>${esc(x.done.weight)}</b></td><td>${esc(x.done.rpe || '–')}</td><td class="muted">${esc(x.done.note || '')}</td></tr>`).join('');
    return `<div class="sheet-backdrop" data-action="close-modal"><div class="sheet wide-sheet" role="dialog">
      <div class="sheet-head"><h2>${esc(parts.map(cap).join(' + '))}</h2><button class="icon-btn" data-action="close-modal" aria-label="Zavrieť">${ICON.close}</button></div>
      ${charts}
      <table class="ptable"><thead><tr><th>Kedy</th><th>Série</th><th>Váha</th><th>RPE</th><th>Poznámka</th></tr></thead><tbody>${rows}</tbody></table>
    </div></div>`;
  }

  function chartSvg(pts, pi) {
    const W = 340, H = 170, L = 34, R = 14, T = 22, B = 24;
    const vals = pts.map((p) => p.value);
    let min = Math.min(...vals), max = Math.max(...vals);
    if (min === max) { min -= 5; max += 5; }
    const padV = (max - min) * 0.15; min = Math.max(0, min - padV); max += padV;
    const raw = (max - min) / 3, p10 = Math.pow(10, Math.floor(Math.log10(raw || 1))), n = raw / p10;
    const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p10;
    const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
    const x = (i) => (pts.length === 1 ? (L + W - R) / 2 : L + (i * (W - L - R)) / (pts.length - 1));
    const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
    let grid = '';
    for (let v = lo; v <= hi + 1e-9; v += step) grid += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${fmtKg(v)}</text>`;
    const sel = state.modal && state.modal.sel && state.modal.sel.pi === pi ? state.modal.sel.i : pts.length - 1;
    const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
    const dots = pts.map((p, i) => `<g class="pt ${i === sel ? 'sel' : ''}" data-action="chart-pt" data-pi="${pi}" data-i="${i}"><circle class="hit" cx="${x(i)}" cy="${y(p.value)}" r="14"/><circle class="dot" cx="${x(i)}" cy="${y(p.value)}" r="${i === sel ? 6 : 4.5}"/></g>`).join('');
    const sp = pts[sel];
    const lx = Math.min(Math.max(x(sel), L + 50), W - R - 50);
    const lbl = (p) => (p.date ? formatDate(p.date, false) : 'T' + p.week);
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">${grid}<path class="line" d="${path}"/>${dots}
      <text class="tip" x="${lx}" y="${Math.max(14, y(sp.value) - 12)}" text-anchor="middle">${fmtKg(sp.value)} kg · ${esc(lbl(sp))}</text>
      <text class="axis" x="${x(0)}" y="${H - 6}" text-anchor="${pts.length === 1 ? 'middle' : 'start'}">${esc(lbl(pts[0]))}</text>
      ${pts.length > 1 ? `<text class="axis" x="${x(pts.length - 1)}" y="${H - 6}" text-anchor="end">${esc(lbl(pts[pts.length - 1]))}</text>` : ''}</svg>`;
  }

  // ---------------------------------------------------------------------------
  // Udalosti
  // ---------------------------------------------------------------------------
  function markRow(el) {
    const btn = document.querySelector(`[data-action="save-row"][data-row="${el.dataset.row}"]`);
    if (btn) btn.disabled = false;
    const row = document.getElementById('row-' + el.dataset.row);
    if (row) row.classList.add('dirty');
  }

  app.addEventListener('input', (e) => {
    if (e.target.dataset.field) { e.target.dataset.dirty = '1'; markRow(e.target); }
  });
  app.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.dataset.field) {
      e.preventDefault();
      const btn = document.querySelector(`[data-action="save-row"][data-row="${e.target.dataset.row}"]`);
      if (btn && !btn.disabled) btn.click();
    }
  });

  app.addEventListener('submit', async (e) => {
    if (e.target.id !== 'login-form') return;
    e.preventDefault();
    state.cfg.user = e.target.elements.user.value.trim();
    state.cfg.pass = e.target.elements.pass.value;
    state.data = null;
    state.error = null;
    render();
    await reload();
    if (state.data) save(LS_KEY, state.cfg);
    else { state.cfg.pass = ''; render(); }
  });

  app.addEventListener('click', (e) => {
    const t = e.target.closest('[data-action]');
    if (!t) return;
    if ((t.dataset.action === 'close-modal') && t.classList.contains('sheet-backdrop') && t !== e.target) return;
    handle(t.dataset.action, t);
  });

  async function handle(action, t) {
    switch (action) {
      case 'reload': reload(true); break;
      case 'logout':
        state.cfg.pass = ''; state.data = null; save(LS_KEY, state.cfg); render(); break;
      case 'tab': state.tab = t.dataset.tab; render(); window.scrollTo(0, 0); break;
      case 'week':
        state.weekIdx = Math.max(0, Math.min(state.data.weeks.length - 1, state.weekIdx + Number(t.dataset.dir)));
        render(); break;
      case 'chart': state.modal = { name: t.dataset.name, sel: null }; render(); break;
      case 'chart-pt': state.modal.sel = { pi: Number(t.dataset.pi), i: Number(t.dataset.i) }; render(); break;
      case 'close-modal': state.modal = null; render(); break;
      case 'add-ex': {
        (state.newRows[t.dataset.key] = state.newRows[t.dataset.key] || []).push(Number(t.dataset.col));
        render();
        const [w, d] = t.dataset.key.split('|');
        const el = document.getElementById(`f-name-${w}-${d}-${t.dataset.col}`);
        if (el) el.focus();
        break;
      }
      case 'cancel-row': {
        const row = document.getElementById('row-' + t.dataset.row);
        const key = `${row.dataset.week}|${row.dataset.day}`;
        state.newRows[key] = (state.newRows[key] || []).filter((c) => c !== Number(row.dataset.col));
        render(); break;
      }
      case 'save-row': await saveRow(t.dataset.row, false); break;
      case 'remove-row':
        if (confirm('Odstrániť tento cvik z plánu?')) await saveRow(t.dataset.row, true);
        break;
      case 'copy-week': {
        state.busy.copy = true; render();
        try {
          const out = await apiPost({ op: 'copyWeek', from: Number(t.dataset.from) });
          if (!out.ok) throw new Error(out.error);
          await reload(true);
          const idx = state.data.weeks.findIndex((w) => w.n === out.week);
          if (idx >= 0) state.weekIdx = idx;
          toast(`Týždeň ${out.week} naplánovaný – uprav, čo treba`);
        } catch (err) { toast('Nepodarilo sa: ' + err.message); }
        state.busy.copy = false; render();
        break;
      }
    }
  }

  async function saveRow(id, remove) {
    const row = document.getElementById('row-' + id);
    const val = (k) => document.getElementById(`f-${k}-${id}`).value.trim();
    const fields = remove ? { name: '', sets: '', weight: '', rpe: '', note: '' } : { name: val('name'), sets: val('sets'), weight: val('weight'), rpe: val('rpe'), note: val('note') };
    if (!remove && !fields.name) { toast('Zadaj názov cviku'); return; }
    const btn = row.querySelector('[data-action="save-row"]');
    btn.disabled = true; btn.textContent = 'Ukladám…';
    try {
      const out = await apiPost({ op: 'plan', week: Number(row.dataset.week), day: Number(row.dataset.day), col: Number(row.dataset.col), expect: row.dataset.expect, fields });
      if (!out.ok) throw new Error(out.error);
      // Lokálne aktualizuj model, aby sa nemuselo čakať na celé načítanie.
      const week = state.data.weeks.find((w) => w.n === Number(row.dataset.week));
      const day = week.days.find((d) => d.n === Number(row.dataset.day));
      const col = Number(row.dataset.col);
      day.exercises = day.exercises.filter((e) => e.col !== col);
      if (!remove) {
        day.exercises.push({ col, name: fields.name, planned: { sets: fields.sets, weight: fields.weight, rpe: fields.rpe, note: fields.note }, done: findDone(id) });
        day.exercises.sort((a, b) => a.col - b.col);
      }
      const key = `${row.dataset.week}|${row.dataset.day}`;
      state.newRows[key] = (state.newRows[key] || []).filter((c) => c !== col);
      row.querySelectorAll('[data-field]').forEach((el) => delete el.dataset.dirty);
      render();
      toast(remove ? 'Cvik odstránený' : 'Uložené do tabuľky ✓');
    } catch (err) {
      btn.disabled = false; btn.textContent = 'Uložiť';
      toast('Neuložené: ' + err.message);
    }
  }
  function findDone(id) {
    const [w, d, c] = id.split('-').map(Number);
    const week = state.data.weeks.find((x) => x.n === w);
    const day = week && week.days.find((x) => x.n === d);
    const ex = day && day.exercises.find((x) => x.col === c);
    return ex ? ex.done : {};
  }

  // ---------------------------------------------------------------------------
  // Štart: odkaz má tvar trener.html#s=<base64 URL skriptu>
  // ---------------------------------------------------------------------------
  const m = location.hash.match(/#s=([^&]+)/);
  if (m) {
    try {
      const url = decodeURIComponent(escape(atob(m[1])));
      if (/^https:\/\/script\.google\.com\/.+\/exec$/.test(url)) { state.cfg.scriptUrl = url; save(LS_KEY, state.cfg); }
    } catch (_) { /* neplatný odkaz */ }
    history.replaceState(null, '', location.pathname);
  }
  render();
  if (state.cfg.scriptUrl && state.cfg.pass) reload();
})();
