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

// Rozloženie hárku (1-based stĺpce). Cvik 1 začína v D, každý cvik má 9 stĺpcov:
// 0 názov | 1-4 PLANNED (série, váha, RPE, poznámka) | 5-8 EXECUTED (série, váha, RPE, poznámka)
const FIRST_EX_COL = 4;
const EX_WIDTH = 9;
const EX_COUNT = 6;
const LAST_COL = 60; // BH
const COL_WORKOUT_TIME = 58; // BF
const COL_SESSION_RPE_DONE = 60; // BH

const DONE_OFFSETS = { sets: 5, weight: 6, rpe: 7, note: 8 };

function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    if (p.token !== TOKEN) return json_({ ok: false, error: 'Nesprávny token' });
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

    return json_({ ok: true, sheet: sheet.getName(), history: history, rows: rows });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/**
 * Telo (JSON, posielané ako text/plain kvôli CORS):
 * { token, sheet, week, day, ex, col, name, fields: { sets, weight, rpe, note } }
 * alebo pre celý tréning:
 * { token, sheet, week, day, session: { time, rpe, timeCol, rpeCol } }
 */
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const body = JSON.parse(e.postData.contents);
    if (body.token !== TOKEN) return json_({ ok: false, error: 'Nesprávny token' });

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
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

function norm_(s) {
  return String(s || '').toUpperCase().replace(/\s+/g, ' ').trim();
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
