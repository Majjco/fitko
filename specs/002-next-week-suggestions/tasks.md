# Tasks: Návrh ďalšieho týždňa (objem + progresia)

**Input**: [spec.md](spec.md), [plan.md](plan.md)

## Phase 1: Foundational

- [x] T001 `calc.js`: parsovanie sérií, plánu, RPE, váhy, superset hodnôt
- [x] T002 `calc.js`: `volume()` po častiach (kg / opak.), „Ok“ podľa plánu
- [x] T003 `calc.js`: `suggest()` – pravidlá R1–R6, hľadanie kombinácie, alternatívy, superset,
  formátovanie váhy (čiarka, rozsah)
- [x] T004 [P] `tests/calc.test.js`: testy T001–T003 (`node --test tests/*.test.js`)
- [x] T005 `index.html`, `trener.html`, `sw.js`: načítať `calc.js`, SHELL, CACHE v14

## Phase 2: User Story 1 + 2 – náhľad, úpravy, vloženie (P1) 🎯 MVP

- [x] T006 `Code.gs`: `doGet` vracia `settings`; `readSettings_`
- [x] T007 `Code.gs`: coach `op: 'applyWeek'` (copyWeek_ + zápis riadkov s kontrolou názvu,
  výsledky po riadkoch, opakovanie s `target`)
- [x] T008 `coach.js`: výpočet návrhu týždňa z dát (posledné odcvičenie, predošlé pre R3)
- [x] T009 `coach.js`: náhľad – karty dní a cvikov, plán / odcvičené / návrh / objem / % /
  dôvod / alternatívy, zvýraznenie, „na kontrolu“
- [x] T010 `coach.js`: rozhodnutia (prijať, alternatíva, upraviť, ponechať, hromadne), uloženie
  rozpracovaného stavu do `localStorage`
- [x] T011 `coach.js`: vloženie (kontrola zmien klienta, `applyWeek`, čiastočné zlyhanie a
  opakovanie, obnovenie dát, hláška)
- [x] T012 `coach.js`: výzva na aktualizáciu skriptu, keď GET nevracia `settings`
- [x] T013 [P] `coach.css`: štýly náhľadu (desktop aj mobil)

## Phase 3: User Story 3 – nastavenia (P2)

- [x] T014 `Code.gs`: coach `op: 'setting'` (záložka „Fitko nastavenia“)
- [x] T015 `coach.js`: cieľový rast % a krok pri cviku v náhľade, uloženie do tabuľky,
  prepočet

## Phase 4: User Story 4 – objem všade (P2)

- [x] T016 `app.js`: súhrn – celkový objem, objem cviku a % oproti minule
- [x] T017 `coach.js`: Progres – prepínač Váha / Objem

## Phase 5: Polish

- [x] T018 `README.md`: nová funkcia, aktualizácia Apps Scriptu
- [x] T019 `app.js` `APP_VERSION` 14
- [x] T020 Playwright overenie (portál s podvrhnutým skriptom, klientsky súhrn)
- [x] T021 Aktualizovať baseline spec 001 (FR-010, FR-024, FR-026) a ROADMAP

## Dependencies

- T001–T003 → všetko ostatné; T006–T007 → T011, T012; T014 → T015.
- T004, T013 paralelne.
