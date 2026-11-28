# Implementation Plan: Návrh ďalšieho týždňa (objem + progresia)

**Branch**: `claude/funny-wright-hg586l` | **Date**: 2026-11-28 | **Spec**: [spec.md](spec.md)

## Summary

Nový zdieľaný súbor `calc.js` s čistými funkciami (parsovanie sérií, objem, návrh progresie)
použitý v klientskej apke aj v portáli. Portál dostane náhľad návrhu ďalšieho týždňa
(úpravy, alternatívy, nastavenia, rozpracovaný stav v `localStorage`) a vkladanie jednou
požiadavkou na Apps Script (nová operácia `applyWeek`, ktorá znovu použije existujúce
`copyWeek_`). Nastavenia progresie sa ukladajú do záložky „Fitko nastavenia“. Klientsky súhrn
a trénerov Progres zobrazia objem.

## Technical Context

**Language/Version**: JavaScript (ES2020, bez build kroku) v prehliadači; Google Apps Script
(V8) pre backend
**Primary Dependencies**: žiadne
**Storage**: Google tabuľka trénera (nová záložka „Fitko nastavenia“: Nastavenie | Hodnota);
rozpracovaný náhľad v `localStorage` portálu
**Testing**: `node --test tests/*.test.js` (vstavaný test runner Node, bez npm balíčkov) pre `calc.js`;
Playwright s podvrhnutým Apps Scriptom (route) pre UI; ručné kroky pre `Code.gs`
**Target Platform**: mobilný prehliadač (klient, PWA), desktop + mobil (portál)
**Project Type**: statická webová apka + Apps Script
**Performance Goals**: návrh pre 4 dni × 6 cvikov sa vypočíta okamžite (< 100 ms); vloženie
jednou požiadavkou
**Constraints**: offline klient (calc.js musí byť v cache SW); spätná kompatibilita skriptu
**Scale/Scope**: 1 klient, desiatky týždňov, ~25 cvikov týždenne

## Constitution Check

| Princíp | Splnené? | Ako |
|---|---|---|
| I. Tabuľka = zdroj pravdy | ✅ | nastavenia v novej záložke; štruktúra hárkov sa nemení; náhľad je len dočasný stav v portáli |
| II. Nikto neprepíše cudzie dáta | ✅ | `applyWeek` zapisuje len PLANNED do týždňa, ktorý `copyWeek_` práve vybral ako prázdny alebo vytvoril; každý riadok overí názov cviku (`expect`); beží pod zámkom |
| III. Offline-first | ✅ | `calc.js` v `SHELL` service workera; klientske zápisy sa nemenia |
| IV. Jednoduchosť | ⚠️ | nový súbor `calc.js` a priečinok `tests/` – zdôvodnené v Complexity Tracking; žiadne závislosti; starší skript → portál ukáže výzvu na aktualizáciu |
| V. Mobil, slovenčina | ✅ | všetky texty po slovensky, kg s čiarkou; náhľad použiteľný aj v mobile (karty pod sebou) |
| VI. Súkromie | ✅ | žiadne nové služby; všetky hodnoty cez `esc` |

## Project Structure

### Documentation (this feature)

```text
specs/002-next-week-suggestions/
├── spec.md
├── plan.md        # tento súbor
├── tasks.md
└── checklists/requirements.md
```

### Source Code (repository root)

```text
calc.js               # NOVÝ: objem + progresia (čisté funkcie, prehliadač aj Node)
tests/calc.test.js    # NOVÝ: testy calc.js (node --test)
app.js                # súhrn: objem cvikov a celkový objem
coach.js              # náhľad návrhu, nastavenia, Progres: prepínač váha/objem
coach.css             # štýly náhľadu
index.html, trener.html  # načítanie calc.js
sw.js                 # calc.js do SHELL, CACHE v14
apps-script/Code.gs   # doGet: settings; doPost (coach): applyWeek, setting
README.md             # nová funkcia + aktualizácia skriptu
```

## Návrh riešenia

### calc.js (`window.FitkoCalc` / `module.exports`)

- `parseSets(str)` → `{ reps: number[], extra: string }` alebo `null` (`2x10`, `2 × 10`,
  `10, 9, 8`, `10/9/8`, `2x10 + 1x8`, doplnky `BOTH`).
- `parsePlanSets(str)` → `{ sets, min, max, extra }` (`3x8-10`, `2x10`).
- `parseRpe(str)` → `[min, max]` alebo `null` (`8`, `7-8`, `7,5`).
- `parseWeight(str)` → `{ lo, hi, comma }` (`47,5`, `40-45`, `CHOOSE` → null).
- `splitParts(name)`, `splitValues(str)` (superset: `A + B`, hodnoty „ a “).
- `volume(setsStr, weightStr, plannedSetsStr)` → `[{ value, unit: 'kg'|'opak.' }]` po
  častiach; „Ok“ = plán (spodná hranica).
- `suggest({ name, planned, done, prevDone, step, pct })` → `{ fields, rule, reason, review,
  base, proposed, alternatives[] }` podľa R1–R6; superset po častiach a spojenie hodnôt
  „ a “.
- `formatKg`, `formatPct` pre zobrazenie.

### Apps Script

- `doGet` pridá `settings: { pct, steps: { [cvik]: kg } }` (len čítanie záložky; neexistuje
  → predvolené). Klient pole ignoruje.
- Coach `op: 'setting'` `{ key, value }` – zapíše/aktualizuje riadok v „Fitko nastavenia“
  (záložku založí).
- Coach `op: 'applyWeek'` `{ from, target?, rows: [{ day, col, expect, fields }] }`:
  bez `target` zavolá `copyWeek_(sheet, from)` a cieľom je vrátený týždeň; potom pre každý
  riadok nájde riadok dňa, overí názov (`expect`) a zapíše PLANNED polia (ako `savePlan_`,
  bez mazania). Vráti `{ ok, week, created, results: [{ day, col, ok, error }] }`. Opakovanie
  pošle `target` a len neúspešné riadky.

### Portál

- Tlačidlo „Navrhnúť ďalší týždeň“ vedľa existujúcej kópie (len na poslednom naplánovanom
  týždni) → celostránkový náhľad (sheet) s kartami dní a cvikov.
- Stav náhľadu `{ sheet, from, pct, steps, rows: { key: { mode, alt, fields } }, target?,
  failed? }` v `localStorage` (`fitko.coach.draft`); návrhy sa vždy dopočítajú z aktuálnych
  dát + uložených rozhodnutí.
- Pred vložením `apiGet()` a porovnanie podpisu odcvičených hodnôt zdrojového a predošlého
  týždňa; pri zmene banner „Klient medzitým zapísal…“ s „Prepočítať“.
- Bez podpory v skripte (`settings` chýba v GET) → tlačidlo ukáže výzvu na aktualizáciu
  skriptu.
- Progres: prepínač „Váha / Objem“.

### Klientska apka

- Súhrn: dlaždica „objem“ (celkový objem tréningu v kg) a pri každom cviku „objem X kg ·
  +Y %“ oproti minule.
- `APP_VERSION` 14, `CACHE` `fitko-v14`, `calc.js` v `SHELL`.

## Overenie

1. `node --test tests/*.test.js` – parsovanie, objem, každé pravidlo R1–R6, superset, alternatívy,
   desatinná čiarka, rozsah váhy.
2. Playwright: `trener.html` s podvrhnutými odpoveďami skriptu → náhľad, alternatíva, úprava,
   ponechanie, reload zachová úpravy, vloženie pošle správne riadky, čiastočné zlyhanie a
   opakovanie, prepínač objemu. `index.html` → súhrn s objemom.
3. Ručne v Apps Script editore (vlastník): nasadiť novú verziu, v portáli vygenerovať návrh a
   vložiť; skontrolovať nový týždeň, dátumy, nezmenené EXECUTED a záložku „Fitko nastavenia“.

## Complexity Tracking

| Odchýlka | Prečo je potrebná | Prečo nestačí jednoduchšie riešenie |
|---|---|---|
| Nový súbor `calc.js` | objem musí byť rovnaký v apke aj v portáli (SC-005) | kopírovanie do `app.js` a `coach.js` by zdvojilo zložitú logiku a hrozil by rozdiel |
| Priečinok `tests/` (Node test runner) | pravidlá progresie majú veľa vetiev; chyba by navrhla zlú váhu | ručné overovanie všetkých vetiev pri každej zmene je nespoľahlivé; nepridáva žiadnu závislosť ani build krok |

## Výsledok overenia (2026-11-28)

- `node --test tests/*.test.js`: 21/21.
- Playwright s podvrhnutým Apps Scriptom: 27 kontrol portálu (desktop aj mobil – návrh, pravidlá
  R3/R4/R5/R6, na kontrolu, alternatíva, ručná úprava, ponechanie, krok, cieľ %, obnovenie
  stránky, vloženie, čiastočné zlyhanie a opakovanie, Progres v objeme) a súhrn klientskej apky
  s objemom; bez JS chýb.
- Zistené pri teste: pri rozsahu opakovaní (`3x8-10`) je najmenší krok k cieľu často +1
  opakovanie pri tej istej váhe – v tabuľke sa nič nezmení a cieľ („cieľ 3×9 opak.“) je len
  v dôvode. Tréner ho môže dopísať do poznámky pre klienta.
- Zostáva: ručné overenie `Code.gs` po nasadení (vlastník).
