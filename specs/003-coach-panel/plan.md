# Implementation Plan: Trénerov panel – jeden pohľad na klienta

**Branch**: `claude/funny-wright-hg586l` | **Date**: 2026-11-28 | **Spec**: [spec.md](spec.md) |
**Prototyp**: [prototype.html](prototype.html) (odsúhlasený, v2)

## Summary

`coach.js` sa prepíše od základu: zoznam klientov (viac odkazov na Apps Script, spoločné
prihlásenie trénera) a panel klienta = jedna mriežka cviky × týždne podľa prototypu, insighty,
snapshot (tréningy, ranná váha, fotky), rozpracovaný ďalší týždeň ako stĺpec (návrh z
`calc.js` alebo kópia) a odoslanie cez existujúce `applyWeek`. Záložky Progres / Plán / Klient
a náhľad zo spec 002 zanikajú. Apps Script dostane zápis názvu cviku v `applyWeek` (nový
a vynechaný cvik) a číslo verzie v GET.

## Technical Context

Rovnaký ako spec 002 (čistý JS bez build kroku, Apps Script, `calc.js`, `node --test`,
Playwright s podvrhnutým skriptom). Panel je pre počítač a tablet, v mobile vodorovné
posúvanie s pevným stĺpcom cvikov. Farby a písmo z existujúceho `styles.css` (tmavá téma apky).

## Constitution Check

| Princíp | Splnené? | Ako |
|---|---|---|
| I. Tabuľka = zdroj pravdy | ✅ | zoznam klientov je len zoznam odkazov v trénerovom prehliadači; všetky dáta sa čítajú a zapisujú do tabuliek klientov |
| II. Nikto neprepíše cudzie dáta | ✅ | zápis len PLANNED cez `applyWeek` (kontrola názvu, zámok); úprava budúcej bunky cez `plan` s kontrolou; neodcvičený cvik sa dá vynechať, odcvičený nie |
| III. Offline-first | ✅ | portál je online nástroj trénera; rozpracovaný týždeň je v `localStorage` a prežije zatvorenie |
| IV. Jednoduchosť | ✅ | žiadne nové závislosti; GET vracia `version`, portál podľa nej vypne nepodporované akcie (nový cvik) a ukáže výzvu na aktualizáciu |
| V. Mobil, slovenčina | ✅ | slovensky; mobil s posúvaním |
| VI. Súkromie | ✅ | heslo trénera len v jeho prehliadači; žiadne nové služby; `esc` všade |

## Návrh riešenia

### Dáta portálu

- `fitko.coach` → `{ user, pass }`; `fitko.coach.clients` → `[{ id, scriptUrl, title, sheet }]`
  (migrácia zo starého `{ scriptUrl, user, pass }`); `fitko.coach.seen.<id>` → videné poznámky;
  `fitko.coach.draft.<id>` → rozpracovaný týždeň.
- Riadok mriežky = deň + `nameKey(cvik)`; poradie podľa stĺpca v poslednom týždne, kde sa cvik
  vyskytuje. Stĺpce = týždne bloku, ktoré majú aspoň jeden cvik.
- Trend (US3): objem posledných odcvičených týždňov – pokles: nezvládnuté opakovania alebo
  −5 %; stagnácia: 3 týždne v rozpätí 2 %; hore: posledný > prvý o 2 %; únava: rovnaká váha
  a RPE rastie 2× po sebe. Výpočet v `calc.js` (`trend()`), testovaný.

### Rozpracovaný týždeň

- `{ from, mode: 'suggest'|'copy', rows: { key: { fields, edited, skip } }, extra: [{ id, day,
  col, fields }], target, failed, stale }`; návrh sa dopočítava z dát + uložených úprav (ako
  v 002).
- Odoslanie: `applyWeek` s riadkami, ktoré sa líšia od zdrojového týždňa (+ nové cviky s
  `expect: ''` a `name`, vynechané s prázdnymi poľami); kontrola zmien klienta pred odoslaním;
  čiastočné zlyhanie → `target` + opakovanie; výpadok spojenia → zistenie vytvoreného týždňa.

### Apps Script

- `doGet` vracia `version: 3`.
- `applyWeek_` zapisuje aj `name` (posun 0); pri `expect: ''` musí byť cieľová bunka prázdna.

### Klientska apka (v15)

- Súhrn bez celkového objemu tréningu (objem len pri cvikoch).
- Nastavenia: „Skopírovať odkaz pre trénera“ (`trener.html#s=<base64 URL skriptu>`).

## Overenie

- `node --test tests/*.test.js` (+ testy `trend()`).
- Playwright s dvoma podvrhnutými klientmi: zoznam, panel, insighty, poznámky, detail cviku,
  úprava budúcej bunky, pridanie týždňa (návrh/kópia), úprava, nový cvik, vynechanie, reload,
  odoslanie, čiastočné zlyhanie; mobil; klientska apka (súhrn, odkaz pre trénera).
- Ručne: nasadiť `Code.gs` a raz odoslať týždeň do skutočnej tabuľky.

## Complexity Tracking

Žiadne nové odchýlky (calc.js a tests/ sú zdôvodnené v spec 002).
