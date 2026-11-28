# Tasks: Návrh ďalšieho týždňa (objem + progresia)

**Input**: [spec.md](spec.md), [plan.md](plan.md)

## Phase 1: Foundational

- [ ] T001 `calc.js`: parsovanie sérií, plánu, RPE, váhy, superset hodnôt
- [ ] T002 `calc.js`: `volume()` po častiach (kg / opak.), „Ok“ podľa plánu
- [ ] T003 `calc.js`: `suggest()` – pravidlá R1–R6, hľadanie kombinácie, alternatívy, superset,
  formátovanie váhy (čiarka, rozsah)
- [ ] T004 [P] `tests/calc.test.js`: testy T001–T003 (`node --test tests/`)
- [ ] T005 `index.html`, `trener.html`, `sw.js`: načítať `calc.js`, SHELL, CACHE v14

## Phase 2: User Story 1 + 2 – náhľad, úpravy, vloženie (P1) 🎯 MVP

- [ ] T006 `Code.gs`: `doGet` vracia `settings`; `readSettings_`
- [ ] T007 `Code.gs`: coach `op: 'applyWeek'` (copyWeek_ + zápis riadkov s kontrolou názvu,
  výsledky po riadkoch, opakovanie s `target`)
- [ ] T008 `coach.js`: výpočet návrhu týždňa z dát (posledné odcvičenie, predošlé pre R3)
- [ ] T009 `coach.js`: náhľad – karty dní a cvikov, plán / odcvičené / návrh / objem / % /
  dôvod / alternatívy, zvýraznenie, „na kontrolu“
- [ ] T010 `coach.js`: rozhodnutia (prijať, alternatíva, upraviť, ponechať, hromadne), uloženie
  rozpracovaného stavu do `localStorage`
- [ ] T011 `coach.js`: vloženie (kontrola zmien klienta, `applyWeek`, čiastočné zlyhanie a
  opakovanie, obnovenie dát, hláška)
- [ ] T012 `coach.js`: výzva na aktualizáciu skriptu, keď GET nevracia `settings`
- [ ] T013 [P] `coach.css`: štýly náhľadu (desktop aj mobil)

## Phase 3: User Story 3 – nastavenia (P2)

- [ ] T014 `Code.gs`: coach `op: 'setting'` (záložka „Fitko nastavenia“)
- [ ] T015 `coach.js`: cieľový rast % a krok pri cviku v náhľade, uloženie do tabuľky,
  prepočet

## Phase 4: User Story 4 – objem všade (P2)

- [ ] T016 `app.js`: súhrn – celkový objem, objem cviku a % oproti minule
- [ ] T017 `coach.js`: Progres – prepínač Váha / Objem

## Phase 5: Polish

- [ ] T018 `README.md`: nová funkcia, aktualizácia Apps Scriptu
- [ ] T019 `app.js` `APP_VERSION` 14
- [ ] T020 Playwright overenie (portál s podvrhnutým skriptom, klientsky súhrn)
- [ ] T021 Aktualizovať baseline spec 001 (FR-010, FR-024, FR-026) a ROADMAP

## Dependencies

- T001–T003 → všetko ostatné; T006–T007 → T011, T012; T014 → T015.
- T004, T013 paralelne.
