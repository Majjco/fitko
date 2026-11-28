/**
 * Fitko – most medzi apkou a trénerovou Google tabuľkou.
 *
 * Tento skript beží pod TVOJÍM Google účtom (ktorý má právo upravovať tabuľku)
 * a robí len dve veci:
 *   GET  – vráti obsah aktuálneho tréningového hárku (aby apka vedela plán)
 *   POST – zapíše tvoje EXECUTED hodnoty (série×opak., váha, RPE, poznámka)
 *          do správnych buniek. Trénerove PLANNED stĺpce sa nikdy neprepisujú.
 *
 * Nastavenie: pozri README.md v repozitári (sekcia „Zápis do tabuľky").
 */

// ID tabuľky – časť URL medzi /d/ a /edit
const SPREADSHEET_ID = 'SEM_VLOZ_ID_TABULKY';

// Ľubovoľné tajné heslo. To isté zadáš v nastaveniach apky.
const TOKEN = 'SEM_VLOZ_SVOJE_HESLO';

// Prihlásenie trénera do portálu (trener.html). Tréner smie meniť PLANNED stĺpce,
// pridávať cviky a plánovať ďalšie týždne. Nechaj prázdne = portál vypnutý.
const COACH_USER = 'trener';
const COACH_PASS = 'SEM_VLOZ_HESLO_TRENERA';

// Rozloženie hárku (1-based stĺpce). Cvik 1 začína v D, každý cvik má 9 stĺpcov:
// 0 názov | 1-4 PLANNED (série, váha, RPE, poznámka) | 5-8 EXECUTED (série, váha, RPE, poznámka)
const FIRST_EX_COL = 4;
const EX_WIDTH = 9;
const EX_COUNT = 6;
const LAST_COL = 60; // BH
const COL_WORKOUT_TIME = 58; // BF
const COL_SESSION_RPE_DONE = 60; // BH

const DONE_OFFSETS = { sets: 5, weight: 6, rpe: 7, note: 8 };
const PLAN_OFFSETS = { name: 0, sets: 1, weight: 2, rpe: 3, note: 4 };

// 'client' | 'coach' | null
function role_(p) {
  if (p.token === TOKEN) return 'client';
  if (COACH_PASS && COACH_PASS.indexOf('SEM_VLOZ') !== 0 && p.token === COACH_PASS &&
      String(p.user || '').trim().toLowerCase() === COACH_USER.toLowerCase()) return 'coach';
  return null;
}

// Záložka pre rannú váhu (skript ju založí sám pri prvom zápise).
const WEIGHT_SHEET = 'Váha';

// Fotky progresu: ukladajú sa na TVOJ Google Drive do tohto priečinka (po dňoch)
// a priečinok sa zdieľa len s vlastníkom tabuľky (trénerom). Do tabuľky ide
// záložka „Fotky“ s dátumom, počtom a odkazom.
const PHOTO_FOLDER = 'Fitko – progres fotky';
const PHOTO_SHEET = 'Fotky';

// Nastavenia trénerovho portálu (cieľový rast objemu, kroky váhy pri cvikoch).
const SETTINGS_SHEET = 'Fitko nastavenia';

function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    const role = role_(p);
    if (!role) return json_({ ok: false, error: 'Nesprávne meno alebo heslo' });
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = findPlanSheet_(ss, p.sheet);
    if (!sheet) return json_({ ok: false, error: 'Nenašiel som tréningový hárok (bunka „WEEK 1“).' });

    const lastRow = sheet.getLastRow();
    const range = sheet.getRange(1, 1, lastRow, Math.max(LAST_COL, sheet.getLastColumn()));
    const display = range.getDisplayValues();
    const raw = sheet.getRange(1, 2, lastRow, 1).getValues(); // stĺpec B = dátumy
    const tz = ss.getSpreadsheetTimeZone();

    const rows = [];
    for (let i = 0; i < display.length; i++) {
      const row = display[i];
      if (!row.some(function (v) { return v !== ''; })) continue;
      const b = raw[i][0];
      if (b instanceof Date) row[1] = Utilities.formatDate(b, tz, 'yyyy-MM-dd');
      rows.push({ r: i + 1, c: row });
    }

    // Ostatné hárky s plánom (aj skryté staršie bloky) – apka z nich kreslí graf progresu.
    const history = ss.getSheets()
      .filter(function (s) { return s.getSheetId() !== sheet.getSheetId() && looksLikePlan_(s); })
      .map(function (s) { return s.getName(); });

    return json_({ ok: true, sheet: sheet.getName(), history: history, rows: rows, weights: readWeights_(ss), photos: readPhotos_(ss), settings: readSettings_(ss), role: role, title: ss.getName() });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/**
 * Telo (JSON, posielané ako text/plain kvôli CORS):
 * { token, sheet, week, day, ex, col, name, fields: { sets, weight, rpe, note } }
 * alebo pre celý tréning:
 * { token, sheet, week, day, session: { time, rpe, timeCol, rpeCol } }
 * alebo rannú váhu:
 * { token, weight: { date: 'yyyy-MM-dd', kg } }
 * alebo jednu fotku progresu (JPEG v base64):
 * { token, photo: { date: 'yyyy-MM-dd', data } }
 */
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const body = JSON.parse(e.postData.contents);
    const role = role_(body);
    if (!role) return json_({ ok: false, error: 'Nesprávne meno alebo heslo' });

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    if (role === 'coach') return json_(coachOp_(ss, body));
    if (body.weight) return json_(saveWeight_(ss, body.weight));
    if (body.photo) return json_(savePhoto_(ss, body.photo));

    const sheet = findPlanSheet_(ss, body.sheet);
    if (!sheet) return json_({ ok: false, error: 'Hárok sa nenašiel' });

    const row = findDayRow_(sheet, Number(body.week), Number(body.day));
    if (!row) return json_({ ok: false, error: 'Týždeň ' + body.week + ' / deň ' + body.day + ' sa v tabuľke nenašiel' });

    if (body.session) {
      const timeCol = Number(body.session.timeCol) || COL_WORKOUT_TIME;
      const rpeCol = Number(body.session.rpeCol) || COL_SESSION_RPE_DONE;
      if (body.session.time != null) sheet.getRange(row, timeCol).setValue(String(body.session.time));
      if (body.session.rpe != null) sheet.getRange(row, rpeCol).setValue(String(body.session.rpe));
      return json_({ ok: true, row: row });
    }

    // Apka posiela stĺpec názvu cviku (zistený z hlavičky „EXERCISE n“);
    // starší spôsob – poradové číslo cviku – ostáva ako záloha.
    let baseCol = Number(body.col);
    if (!(baseCol >= 1)) {
      const ex = Number(body.ex);
      if (!(ex >= 0 && ex < EX_COUNT)) return json_({ ok: false, error: 'Zlé číslo cviku' });
      baseCol = FIRST_EX_COL + ex * EX_WIDTH;
    }

    // Poistka: ak tréner medzičasom zmenil cvik, nič neprepíšeme.
    const currentName = sheet.getRange(row, baseCol).getDisplayValue();
    if (body.name && norm_(currentName) !== norm_(body.name)) {
      return json_({ ok: false, error: 'Cvik sa v tabuľke zmenil („' + currentName + '“). Obnov plán.', conflict: true });
    }

    const fields = body.fields || {};
    Object.keys(DONE_OFFSETS).forEach(function (key) {
      if (fields[key] === undefined) return;
      const cell = sheet.getRange(row, baseCol + DONE_OFFSETS[key]);
      cell.setNumberFormat('@'); // ulož ako text, nech „7-8“ nie je dátum
      cell.setValue(String(fields[key]));
    });
    return json_({ ok: true, row: row });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function findPlanSheet_(ss, name) {
  if (name) {
    const s = ss.getSheetByName(name);
    if (s) return s;
  }
  // Prvý viditeľný hárok, ktorý vyzerá ako tréningový plán.
  const sheets = ss.getSheets();
  for (let i = 0; i < sheets.length; i++) {
    const s = sheets[i];
    if (!s.isSheetHidden() && looksLikePlan_(s)) return s;
  }
  return null;
}

function looksLikePlan_(s) {
  if (s.getLastRow() < 3) return false;
  const head = s.getRange('A1:A10').getDisplayValues().map(function (r) { return r[0]; }).join('|');
  return /WEEK\s*1\b/i.test(head);
}

// ----- Trénerov portál -----
function coachOp_(ss, body) {
  const sheet = findPlanSheet_(ss, body.sheet);
  if (!sheet) return { ok: false, error: 'Hárok sa nenašiel' };
  if (body.op === 'plan') return savePlan_(sheet, body);
  if (body.op === 'copyWeek') return copyWeek_(sheet, Number(body.from));
  if (body.op === 'applyWeek') return applyWeek_(sheet, body);
  if (body.op === 'setting') return saveSetting_(ss, String(body.key || ''), body.value);
  return { ok: false, error: 'Neznáma operácia' };
}

// Návrh ďalšieho týždňa: bez `target` najprv naplánuje týždeň kópiou (copyWeek_ – najbližší
// prázdny týždeň alebo nový blok), potom do neho zapíše PLANNED hodnoty z náhľadu.
// Opakovanie po čiastočnom zlyhaní pošle `target` a len neúspešné riadky.
// rows: [{ day, col, expect, fields: { sets, weight, rpe, note } }]
function applyWeek_(sheet, b) {
  let week = Number(b.target);
  let created = false;
  if (!(week >= 1)) {
    const copy = copyWeek_(sheet, Number(b.from));
    if (!copy.ok) return copy;
    week = copy.week;
    created = copy.created;
    SpreadsheetApp.flush();
  }
  const rows = Array.isArray(b.rows) ? b.rows : [];
  const results = rows.map(function (r) {
    try {
      const row = findDayRow_(sheet, week, Number(r.day));
      if (!row) return { day: r.day, col: r.col, ok: false, error: 'Deň sa v tabuľke nenašiel' };
      const col = Number(r.col);
      if (!(col >= 1)) return { day: r.day, col: r.col, ok: false, error: 'Chýba stĺpec cviku' };
      const current = sheet.getRange(row, col).getDisplayValue();
      if (norm_(current) !== norm_(r.expect)) {
        return { day: r.day, col: r.col, ok: false, error: 'Cvik v tabuľke je iný („' + current + '“)' };
      }
      const f = r.fields || {};
      ['sets', 'weight', 'rpe', 'note'].forEach(function (k) {
        if (f[k] === undefined) return;
        const cell = sheet.getRange(row, col + PLAN_OFFSETS[k]);
        cell.setNumberFormat('@');
        cell.setValue(String(f[k]));
      });
      return { day: r.day, col: r.col, ok: true };
    } catch (err) {
      return { day: r.day, col: r.col, ok: false, error: String(err) };
    }
  });
  return { ok: true, week: week, created: created, results: results };
}

// Zapíše PLANNED hodnoty (názov, série, váha, RPE, poznámka) jedného cviku.
function savePlan_(sheet, b) {
  const row = findDayRow_(sheet, Number(b.week), Number(b.day));
  if (!row) return { ok: false, error: 'Týždeň/deň sa v tabuľke nenašiel' };
  const col = Number(b.col);
  if (!(col >= 1)) return { ok: false, error: 'Chýba stĺpec cviku' };
  const current = sheet.getRange(row, col).getDisplayValue();
  if (b.expect != null && norm_(current) !== norm_(b.expect)) {
    return { ok: false, conflict: true, error: 'Cvik sa medzičasom zmenil v tabuľke („' + current + '“). Obnov stránku.' };
  }
  const f = b.fields || {};
  const removing = f.name === '' && Object.keys(PLAN_OFFSETS).every(function (k) { return !f[k]; });
  if (removing) {
    const done = sheet.getRange(row, col + 5, 1, 4).getDisplayValues()[0].join('');
    if (done.trim()) return { ok: false, error: 'Klient už tento cvik zapísal – nedá sa odstrániť.' };
  }
  Object.keys(PLAN_OFFSETS).forEach(function (k) {
    if (f[k] === undefined) return;
    const cell = sheet.getRange(row, col + PLAN_OFFSETS[k]);
    cell.setNumberFormat('@');
    cell.setValue(String(f[k]));
  });
  return { ok: true };
}

// Naplánuje ďalší týždeň: skopíruje plán (cviky + PLANNED) z týždňa `from` do
// najbližšieho prázdneho týždňa a posunie dátumy o 7 dní. Keď prázdny týždeň
// neexistuje, skopíruje celý blok týždňa pod posledný a vyčistí EXECUTED.
function copyWeek_(sheet, from) {
  const lastRow = sheet.getLastRow();
  const colA = sheet.getRange(1, 1, lastRow, 1).getDisplayValues().map(function (r) { return String(r[0]).trim(); });
  const weeks = [];
  colA.forEach(function (v, i) {
    const m = v.match(/^WEEK\s*(\d+)/i);
    if (m) weeks.push({ n: Number(m[1]), row: i + 1 });
  });
  const src = weeks.filter(function (w) { return w.n === from; })[0];
  if (!src) return { ok: false, error: 'Týždeň ' + from + ' sa nenašiel' };
  const dayRows = function (w) {
    const out = {};
    for (let r = w.row + 1; r <= lastRow; r++) {
      const v = colA[r - 1];
      if (/^WEEK\s*\d+/i.test(v)) break;
      const d = v.match(/^DAY\s*(\d+)/i);
      if (d) out[Number(d[1])] = r;
      if (/^WEEKLY/i.test(v)) break;
    }
    return out;
  };
  const exCols = exCols_(sheet, src.row);
  const srcDays = dayRows(src);
  const isEmpty = function (w) {
    const rows = dayRows(w);
    return Object.keys(rows).every(function (d) {
      return exCols.every(function (c) { return !String(sheet.getRange(rows[d], c).getDisplayValue()).trim(); });
    });
  };
  let target = weeks.filter(function (w) { return w.n > from && isEmpty(w); }).sort(function (a, b) { return a.n - b.n; })[0];
  let created = false;
  if (!target) {
    // Nový blok: hlavička (riadok s EXERCISE 1 nad WEEK) až prázdny riadok za WEEKLY AVG.
    const last = weeks[weeks.length - 1];
    let start = last.row;
    if (last.row > 1 && /^EXERCISE/i.test(sheet.getRange(last.row - 1, exCols[0]).getDisplayValue())) start = last.row - 1;
    let end = last.row;
    while (end < lastRow && !/^WEEKLY/i.test(colA[end - 1])) end++;
    end++; // prázdny riadok za blokom
    const height = end - start + 1;
    const width = sheet.getLastColumn();
    const dest = end + 1;
    sheet.getRange(start, 1, height, width).copyTo(sheet.getRange(dest, 1, height, width));
    const newWeekRow = dest + (last.row - start);
    const n = Math.max.apply(null, weeks.map(function (w) { return w.n; })) + 1;
    sheet.getRange(newWeekRow, 1).setValue('WEEK ' + n);
    target = { n: n, row: newWeekRow };
    created = true;
    SpreadsheetApp.flush();
  }
  // Pri novo vytvorenom bloku treba čítať stĺpec A znova.
  const colA2 = created ? sheet.getRange(1, 1, sheet.getLastRow(), 1).getDisplayValues().map(function (r) { return String(r[0]).trim(); }) : colA;
  const tgtDays = {};
  for (let r = target.row + 1; r <= colA2.length; r++) {
    const v = colA2[r - 1];
    if (/^WEEKLY/i.test(v) || /^WEEK\s*\d+/i.test(v)) break;
    const d = v.match(/^DAY\s*(\d+)/i);
    if (d) tgtDays[Number(d[1])] = r;
  }
  Object.keys(srcDays).forEach(function (d) {
    const sr = srcDays[d], tr = tgtDays[d];
    if (!tr) return;
    exCols.forEach(function (c) {
      const planned = sheet.getRange(sr, c, 1, 5).getDisplayValues();
      sheet.getRange(tr, c, 1, 5).setNumberFormat('@').setValues(planned);
      sheet.getRange(tr, c + 5, 1, 4).clearContent(); // EXECUTED
    });
    const sd = sheet.getRange(sr, 2).getValue();
    if (sd instanceof Date) {
      const nd = new Date(sd.getTime());
      nd.setDate(nd.getDate() + 7 * (target.n - from));
      sheet.getRange(tr, 2).setValue(nd);
    }
    if (created) {
      sheet.getRange(tr, 3).clearContent(); // poznámka dňa
      if (sheet.getLastColumn() >= COL_WORKOUT_TIME) sheet.getRange(tr, COL_WORKOUT_TIME).clearContent();
      if (sheet.getLastColumn() >= COL_SESSION_RPE_DONE) sheet.getRange(tr, COL_SESSION_RPE_DONE).clearContent();
    }
  });
  return { ok: true, week: target.n, created: created };
}

// Stĺpce (1-based) názvov cvikov podľa hlavičky „EXERCISE n“ nad/v riadku týždňa.
function exCols_(sheet, weekRow) {
  const width = sheet.getLastColumn();
  for (let r = weekRow; r >= Math.max(1, weekRow - 1); r--) {
    const vals = sheet.getRange(r, 1, 1, width).getDisplayValues()[0];
    const cols = [];
    vals.forEach(function (v, i) { if (/^EXERCISE\s*\d+$/i.test(String(v).trim())) cols.push(i + 1); });
    if (cols.length) return cols;
  }
  const out = [];
  for (let i = 0; i < EX_COUNT; i++) out.push(FIRST_EX_COL + i * EX_WIDTH);
  return out;
}

function findDayRow_(sheet, week, day) {
  const colA = sheet.getRange(1, 1, sheet.getLastRow(), 1).getDisplayValues();
  let inWeek = false;
  for (let i = 0; i < colA.length; i++) {
    const v = String(colA[i][0]).trim();
    const w = v.match(/^WEEK\s*(\d+)/i);
    if (w) { inWeek = Number(w[1]) === week; continue; }
    if (!inWeek) continue;
    const d = v.match(/^DAY\s*(\d+)/i);
    if (d && Number(d[1]) === day) return i + 1;
  }
  return null;
}

function readWeights_(ss) {
  const ws = ss.getSheetByName(WEIGHT_SHEET);
  if (!ws || ws.getLastRow() < 2) return [];
  const tz = ss.getSpreadsheetTimeZone();
  return ws.getRange(2, 1, ws.getLastRow() - 1, 2).getValues()
    .filter(function (r) { return r[0] instanceof Date && r[1] !== '' && !isNaN(Number(r[1])); })
    .map(function (r) { return { date: Utilities.formatDate(r[0], tz, 'yyyy-MM-dd'), kg: Number(r[1]) }; });
}

function saveWeight_(ss, w) {
  const kg = Number(w.kg);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(w.date)) || !(kg > 20 && kg < 400)) {
    return { ok: false, error: 'Neplatná váha alebo dátum' };
  }
  const tz = ss.getSpreadsheetTimeZone();
  let ws = ss.getSheetByName(WEIGHT_SHEET);
  if (!ws) {
    ws = ss.insertSheet(WEIGHT_SHEET, ss.getSheets().length);
    ws.getRange(1, 1, 1, 2).setValues([['Dátum', 'Ranná váha (kg)']]).setFontWeight('bold');
    ws.setFrozenRows(1);
    ws.setColumnWidth(1, 110);
    ws.setColumnWidth(2, 140);
  }
  const last = ws.getLastRow();
  if (last >= 2) {
    const dates = ws.getRange(2, 1, last - 1, 1).getValues();
    for (let i = 0; i < dates.length; i++) {
      const d = dates[i][0];
      if (d instanceof Date && Utilities.formatDate(d, tz, 'yyyy-MM-dd') === w.date) {
        ws.getRange(i + 2, 2).setValue(kg);
        return { ok: true, updated: true };
      }
    }
  }
  const row = ws.getLastRow() + 1;
  ws.getRange(row, 1).setValue(Utilities.parseDate(w.date, tz, 'yyyy-MM-dd')).setNumberFormat('d.m.yyyy');
  ws.getRange(row, 2).setValue(kg).setNumberFormat('0.0');
  if (row > 2) ws.getRange(2, 1, row - 1, 2).sort(1); // chronologicky
  return { ok: true };
}

// ----- Nastavenia portálu (záložka „Fitko nastavenia“: Nastavenie | Hodnota) -----
// Kľúče: „progres_percent“ (napr. 5) a „krok:<NÁZOV CVIKU>“ (kg).
function readSettings_(ss) {
  const out = { pct: 5, steps: {} };
  const ws = ss.getSheetByName(SETTINGS_SHEET);
  if (!ws || ws.getLastRow() < 2) return out;
  ws.getRange(2, 1, ws.getLastRow() - 1, 2).getValues().forEach(function (r) {
    const key = String(r[0]).trim();
    const val = Number(String(r[1]).replace(',', '.'));
    if (!key || isNaN(val)) return;
    if (key === 'progres_percent') out.pct = val;
    else if (key.indexOf('krok:') === 0) out.steps[key.slice(5).trim()] = val;
  });
  return out;
}

function saveSetting_(ss, key, value) {
  const val = Number(String(value).replace(',', '.'));
  if (!/^(progres_percent|krok:.+)$/.test(key) || isNaN(val) || val < 0 || val > 100) {
    return { ok: false, error: 'Neplatné nastavenie' };
  }
  let ws = ss.getSheetByName(SETTINGS_SHEET);
  if (!ws) {
    ws = ss.insertSheet(SETTINGS_SHEET, ss.getSheets().length);
    ws.getRange(1, 1, 1, 2).setValues([['Nastavenie', 'Hodnota']]).setFontWeight('bold');
    ws.setFrozenRows(1);
    ws.setColumnWidth(1, 260);
  }
  const last = ws.getLastRow();
  if (last >= 2) {
    const keys = ws.getRange(2, 1, last - 1, 1).getValues();
    for (let i = 0; i < keys.length; i++) {
      if (String(keys[i][0]).trim() === key) {
        ws.getRange(i + 2, 2).setValue(val);
        return { ok: true };
      }
    }
  }
  ws.getRange(last + 1, 1, 1, 2).setValues([[key, val]]);
  return { ok: true };
}

// ----- Fotky progresu -----
function photoFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('photoFolderId');
  if (id) {
    try {
      const f = DriveApp.getFolderById(id);
      if (!f.isTrashed()) return f;
    } catch (_) { /* priečinok zmazaný – založíme nový */ }
  }
  const folder = DriveApp.createFolder(PHOTO_FOLDER);
  props.setProperty('photoFolderId', folder.getId());
  // Zdieľaj len s vlastníkom tabuľky (trénerom), nie s „kýmkoľvek s odkazom“.
  let sharedWith = '';
  try {
    const owner = DriveApp.getFileById(SPREADSHEET_ID).getOwner();
    const me = Session.getEffectiveUser().getEmail();
    if (owner && owner.getEmail() && owner.getEmail() !== me) {
      folder.addViewer(owner.getEmail());
      sharedWith = owner.getEmail();
    }
  } catch (_) { /* zdieľanie sa nepodarilo – dá sa spraviť ručne na Drive */ }
  props.setProperty('photoSharedWith', sharedWith);
  return folder;
}

function savePhoto_(ss, p) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(p.date)) || !p.data) return { ok: false, error: 'Chýba fotka alebo dátum' };
  const root = photoFolder_();
  const days = root.getFoldersByName(p.date);
  const day = days.hasNext() ? days.next() : root.createFolder(p.date);
  let count = 0;
  const files = day.getFiles();
  while (files.hasNext()) { files.next(); count++; }
  const blob = Utilities.newBlob(Utilities.base64Decode(p.data), 'image/jpeg', p.date + '_' + (count + 1) + '.jpg');
  day.createFile(blob);
  count++;

  // Riadok v záložke „Fotky“: Dátum | Počet fotiek | Odkaz
  const tz = ss.getSpreadsheetTimeZone();
  let ws = ss.getSheetByName(PHOTO_SHEET);
  if (!ws) {
    ws = ss.insertSheet(PHOTO_SHEET, ss.getSheets().length);
    ws.getRange(1, 1, 1, 3).setValues([['Dátum', 'Počet fotiek', 'Fotky']]).setFontWeight('bold');
    ws.setFrozenRows(1);
    ws.setColumnWidth(1, 110);
    ws.setColumnWidth(3, 160);
  }
  const link = SpreadsheetApp.newRichTextValue().setText('Otvoriť fotky').setLinkUrl(day.getUrl()).build();
  let row = 0;
  const last = ws.getLastRow();
  if (last >= 2) {
    const dates = ws.getRange(2, 1, last - 1, 1).getValues();
    for (let i = 0; i < dates.length; i++) {
      if (dates[i][0] instanceof Date && Utilities.formatDate(dates[i][0], tz, 'yyyy-MM-dd') === p.date) { row = i + 2; break; }
    }
  }
  if (!row) {
    row = ws.getLastRow() + 1;
    ws.getRange(row, 1).setValue(Utilities.parseDate(p.date, tz, 'yyyy-MM-dd')).setNumberFormat('d.m.yyyy');
  }
  ws.getRange(row, 2).setValue(count);
  ws.getRange(row, 3).setRichTextValue(link);
  if (ws.getLastRow() > 2) ws.getRange(2, 1, ws.getLastRow() - 1, 3).sort(1);

  return { ok: true, date: p.date, count: count, url: day.getUrl(), sharedWith: PropertiesService.getScriptProperties().getProperty('photoSharedWith') || '' };
}

function readPhotos_(ss) {
  const props = PropertiesService.getScriptProperties();
  const out = { list: [], sharedWith: props.getProperty('photoSharedWith'), folderUrl: '' };
  if (props.getProperty('photoFolderId')) out.folderUrl = 'https://drive.google.com/drive/folders/' + props.getProperty('photoFolderId');
  const ws = ss.getSheetByName(PHOTO_SHEET);
  if (!ws || ws.getLastRow() < 2) return out;
  const tz = ss.getSpreadsheetTimeZone();
  const n = ws.getLastRow() - 1;
  const vals = ws.getRange(2, 1, n, 2).getValues();
  const links = ws.getRange(2, 3, n, 1).getRichTextValues();
  for (let i = 0; i < n; i++) {
    if (!(vals[i][0] instanceof Date)) continue;
    out.list.push({ date: Utilities.formatDate(vals[i][0], tz, 'yyyy-MM-dd'), count: Number(vals[i][1]) || 0, url: links[i][0].getLinkUrl() || '' });
  }
  return out;
}

/**
 * Spusti RAZ ručne v editore (vyber „povolitDrive“ → Run), aby si Google
 * vypýtal povolenie pre Google Drive (potrebné pre fotky progresu).
 * Na obrazovke s povoleniami zaškrtni všetko („Select all“).
 * Funkcia vytvorí skúšobný priečinok a hneď ho zahodí do koša – ak skončí
 * bez chyby, skript smie na Drive zapisovať.
 */
function povolitDrive() {
  DriveApp.createFolder('Fitko test').setTrashed(true);
}

function norm_(s) {
  return String(s || '').toUpperCase().replace(/\s+/g, ' ').trim();
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
