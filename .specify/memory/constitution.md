# Fitko Constitution

Záväzné pravidlá projektu Fitko. Každá zmena (malá aj veľká) ich musí dodržať; každá spec
a plán v `specs/` sa voči nim kontroluje.

## Core Principles

### I. Tabuľka trénera je jediný zdroj pravdy

- Všetky trvalé dáta žijú v trénerovej Google tabuľke (plán, výsledky, ranná váha, odkazy na
  fotky) a na Google Drive klienta (súbory fotiek). Apka NESMIE mať vlastnú databázu ani server
  okrem Apps Scriptu klienta.
- Tréner MUSÍ môcť pracovať v tabuľke presne ako doteraz. Apka sa prispôsobuje tabuľke, nie
  naopak: rozloženie stĺpcov sa zisťuje z hlavičiek (`WEEK n`, `DAY n`, `EXERCISE n`, `DATE`,
  `NOTES`, `WORKOUT TIME`, `SESH RPE`) a staršie bloky s iným rozložením MUSIA ostať čitateľné.
- Nová funkcia, ktorá potrebuje zmenu štruktúry existujúcich hárkov, je zakázaná. Nové dáta
  idú do samostatnej záložky, ktorú skript založí sám (vzor: „Váha“, „Fotky“).
- Lokálne úložisko v telefóne je len cache a fronta na odoslanie, nie zdroj pravdy.

Prečo: tréner tabuľku používa roky a s ďalšími klientmi; apka je nadstavba, nie náhrada.

### II. Nikto neprepíše cudzie dáta

- Klient (apka) zapisuje len EXECUTED stĺpce, `WORKOUT TIME`, vykonané `SESH RPE` a vlastné
  záložky („Váha“, „Fotky“). PLANNED stĺpce NESMIE zmeniť.
- Tréner (portál) zapisuje len PLANNED stĺpce (názov, série, váha, RPE, poznámka) a kopíruje
  plán. EXECUTED hodnoty klienta NESMIE prepísať ani zmazať; cvik, ktorý klient už zapísal, sa
  nedá odstrániť.
- Každý zápis do bunky cviku MUSÍ najprv overiť, že cvik v tabuľke je stále ten, ktorý
  používateľ videl (porovnanie názvu). Pri nezhode sa zápis odmietne s jasnou hláškou
  „obnov plán“, nikdy sa nezapíše naslepo.
- Hodnoty sa ukladajú ako text (formát `@`), aby sa „7-8“ nezmenilo na dátum.
- Zápisy v Apps Scripte bežia pod zámkom (`LockService`), aby sa súbežné zápisy nepobili.

### III. Offline-first: nič sa nestratí

- Tréning MUSÍ fungovať bez signálu: plán sa zobrazí z cache a zápisy idú do trvalej fronty,
  ktorá sa odošle po obnovení pripojenia.
- Používateľ MUSÍ vidieť stav každého zápisu: odosiela sa / uložené v tabuľke / chyba /
  uložené len v telefóne. Chyba sa nikdy nezamlčí.
- Rozpísaný text vo formulároch MUSÍ prežiť prekreslenie obrazovky, obnovenie plánu aj výber
  fotiek.
- Aktualizácia apky (service worker) NESMIE reštartovať apku, keď používateľ niečo rozpisuje,
  má otvorené okno alebo neodoslanú frontu.

### IV. Jednoduchosť: bez build kroku a bez závislostí

- Apka je čistý HTML/CSS/JavaScript bez frameworku, bundlera a npm závislostí; beží ako
  statické súbory na GitHub Pages. Backend je jediný súbor `apps-script/Code.gs`.
- Každá nová knižnica, nástroj alebo služba tretej strany MUSÍ byť zdôvodnená v pláne
  (sekcia Complexity Tracking) a schválená vlastníkom projektu.
- Zmeny `Code.gs` MUSIA byť spätne kompatibilné: novšia apka so starším nasadením skriptu
  (a naopak) nesmie spadnúť. Chýbajúcu funkciu skriptu apka zistí a ukáže návod na
  aktualizáciu (vzor: banner „treba aktualizovať Apps Script“).
- Radšej menej funkcií, ktoré spoľahlivo fungujú, než veľa polovičatých (YAGNI).

### V. Mobil vo fitku, po slovensky

- Klientska apka je navrhnutá pre telefón v jednej ruke medzi sériami: veľké tlačidlá,
  čo najmenej písania (rýchle voľby RPE, „Ako minule“, „Ok“), jeden cvik naraz.
- Celé rozhranie je po slovensky, vrátane chybových hlášok; čísla v kg sa zobrazujú
  s desatinnou čiarkou. Formáty z tabuľky sa rešpektujú (supersety `A + B`, hodnoty
  „`8 a 7`“).
- Trénerov portál je určený hlavne pre počítač, ale MUSÍ byť použiteľný aj v mobile.

### VI. Súkromie a bezpečnosť

- V repozitári NESMÚ byť žiadne odkazy na tabuľky, heslá, tokeny ani osobné údaje; v
  `Code.gs` sú len zástupné hodnoty (`SEM_VLOZ_…`). Nastavenia ostávajú v `localStorage`
  zariadenia.
- Fotky progresu sa zdieľajú len s vlastníkom tabuľky (trénerom), nikdy „s kýmkoľvek s
  odkazom“.
- Všetok text z tabuľky a od používateľa sa pred vložením do HTML MUSÍ escapovať (`esc`).
- Žiadna analytika, sledovanie ani skripty z cudzích CDN.

## Technické obmedzenia a nasadenie

- **Súbory**: `index.html` + `app.js` + `styles.css` (klient), `trener.html` + `coach.js` +
  `coach.css` (portál), `sw.js` + `manifest.webmanifest` + `icons/` (PWA),
  `apps-script/Code.gs` (backend). Nový súbor pribudne len so zdôvodnením v pláne.
- **Verzia apky**: pri každej zmene súborov klientskej apky sa MUSIA spolu zvýšiť
  `APP_VERSION` v `app.js` a `CACHE` v `sw.js` (napr. 13 → 14) a nový súbor sa pridá do `SHELL`.
  Súbory portálu sa necacheujú a idú vždy zo siete.
- **Nasadenie**: GitHub Pages z vetvy `main` (root). Zmenu `Code.gs` musí vlastník ručne
  vložiť do Apps Script editora a nasadiť novú verziu; README to MUSÍ popisovať pri každej
  zmene, ktorá to vyžaduje (vrátane nových povolení, napr. Drive).
- **Dokumentácia**: každá zmena viditeľná pre používateľa MUSÍ aktualizovať `README.md`
  (sekcie „Čo apka vie“, „Trénerov portál“).

## Postup vývoja

- **Malá zmena** (oprava, úprava textu alebo vzhľadu, drobné vylepšenie jednej obrazovky bez
  nových dát v tabuľke a bez zmeny API skriptu) sa robí priamo, bez spec-kitu.
- **Veľká zmena** ide cez spec-kit: `/speckit-specify` → (`/speckit-clarify`) →
  `/speckit-plan` → `/speckit-tasks` → `/speckit-implement`. Veľká je každá zmena, ktorá:
  pridáva nové dáta do tabuľky alebo na Drive, mení API alebo oprávnenia `Code.gs`, pridáva
  novú obrazovku alebo rolu, alebo mení predpoklady o rozložení tabuľky.
- **Overenie pred commitom**: apka sa spustí lokálne (`python3 -m http.server`) a zmenený tok
  sa prejde v mobilnom zobrazení (napr. Playwright, viewport telefónu), vrátane stavu offline,
  ak sa zmena týka zápisu. Zmeny `Code.gs` sa nedajú spustiť lokálne: plán MUSÍ uviesť
  ručné kroky na overenie v Apps Script editore.
- **Commity** sú po slovensky a popisujú zmenu z pohľadu používateľa (vzor: „Portál:
  kopírovanie dňa z minulého / do ďalšieho týždňa“).

## Governance

- Táto constitution má prednosť pred ostatnými zvyklosťami projektu. `/speckit-plan` MUSÍ
  obsahovať Constitution Check; každé porušenie sa zapíše do Complexity Tracking s dôvodom,
  inak sa plán neschváli.
- Zmenu constitution navrhuje Claude alebo vlastník; platí až po schválení vlastníkom
  projektu. Zmena sa robí cez `/speckit-constitution` a commituje samostatne.
- Verzovanie (semver): MAJOR = odstránenie alebo zásadná zmena princípu; MINOR = nový princíp
  alebo sekcia; PATCH = spresnenie formulácie.
- Pri každej veľkej zmene sa overí súlad so všetkými princípmi; pri malej aspoň s II, III a VI.

**Version**: 1.0.0 | **Ratified**: 2026-11-28 | **Last Amended**: 2026-11-28
