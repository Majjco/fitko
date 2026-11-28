# Feature Specification: Redizajn klientskej apky

**Feature Branch**: `claude/funny-wright-hg586l`

**Created**: 2026-11-28

**Status**: Implemented (apka v17, štýl Volt) – voliteľná téma „Matrix“ ako ďalší krok

**Input**: User description: "Komplet UI redesign, aby to vyzeralo mega cool. Krásna, super sa
používa, intuitívna, proaktívna."

**Nadväzuje na**: [001 baseline](../001-fitko-baseline/spec.md) (US1–US7) – funkcie ostávajú,
mení sa vzhľad a priebeh tréningu. Dáta v tabuľke sa nemenia (constitution I).

## Princíp

Apka sa používa vo fitku medzi sériami, jednou rukou, často s potom na prstoch. Má:

- **vyzerať ako športová apka**, nie ako formulár: veľké čísla, výrazná typografia, energia;
- **viesť tréningom**: vždy je jasné, čo robiť teraz (ktorý cvik, ktorá séria, koľko pauza);
- **myslieť za klienta (proaktívna)**: sama pripomenie, poradí a pochváli.

## User Scenarios & Testing *(mandatory)*

### User Story 1 – Domov „Dnes“ (Priority: P1)

Po otvorení apka ukáže, čo je dnes: veľkú kartu dnešného tréningu (deň, zameranie, počet
cvikov, odhad času) s jedným tlačidlom „Začať tréning“, pás dní týždňa so stavom, rannú váhu
na jedno ťuknutie a proaktívne karty (tip k tréningu, nedeľné fotky, pripomenutie váženia).

**Acceptance Scenarios**:

1. **Given** dnes je tréningový deň, **When** klient otvorí apku, **Then** prvé, čo vidí, je
   karta dnešného tréningu s tlačidlom „Začať tréning“.
2. **Given** dnes nie je tréningový deň, **When** otvorí apku, **Then** vidí „Dnes voľno“
   a najbližší tréning (napr. „Zajtra Deň 3 · Pull“).
3. **Given** dnes ešte nie je zapísaná ranná váha, **When** otvorí apku ráno, **Then** karta
   váhy je hore a stačí upraviť číslo (predvyplnené včerajšou hodnotou) a ťuknúť „Uložiť“.

### User Story 2 – Tréning po sériách (Priority: P1)

Tréning ide po cvikoch a v rámci cviku **po sériách**. Pri aktuálnej sérii sú veľké ovládače
váhy (± krok) a opakovaní (±), predvyplnené plánom trénera. „Séria hotová“ ju uloží a spustí
pauzu. Po poslednej sérii klient ťukne RPE a ide na ďalší cvik. Do tabuľky sa zapíše v
doterajšom tvare (`3x10`, ak sú všetky série rovnaké, inak `10, 9, 8`).

**Acceptance Scenarios**:

1. **Given** cvik 3 × 10 pri 62,5 kg, **When** klient otvorí cvik, **Then** vidí plán, minulý
   výkon a 3 série; aktuálna má predvyplnené 62,5 kg a 10 opakovaní.
2. **Given** aktuálna séria, **When** klient ťukne „Séria hotová“, **Then** séria sa označí,
   spustí sa pauza a ďalšia séria sa predvyplní hodnotami práve dokončenej.
3. **Given** posledná séria je hotová, **When** klient vyberie RPE, **Then** výsledok cviku sa
   zapíše do tabuľky (offline do fronty) a apka ponúkne ďalší cvik.
4. **Given** superset alebo nerovnaký zápis, **When** klient chce zapísať po starom, **Then**
   má k dispozícii rýchly zápis celého cviku (ako doteraz).

### User Story 3 – Pauza medzi sériami (Priority: P1)

Po sérii sa automaticky spustí odpočet pauzy (z poznámky trénera, napr. „pauza 2 min“, inak
90 s). Veľký kruh s časom, +30 s, Preskočiť, a čo nasleduje. Na konci telefón zavibruje.
Odpočet sedí aj po zamknutí obrazovky a návrate do apky.

### User Story 4 – Proaktívne tipy a rekordy (Priority: P2)

- pri cviku: porovnanie s minulom a povzbudenie („minule ľahko pri RPE 7 – dnes +2,5 kg“),
  upozornenie na poznámku trénera;
- **osobný rekord** (najvyššia váha alebo objem cviku) sa ukáže hneď pri sérii aj v súhrne;
- domov: pripomenutie váženia, nedeľných fotiek, „4 dni bez tréningu“.

### User Story 5 – Súhrn s oslavou (Priority: P2)

Po tréningu: čas, počet sérií a cvikov, rekordy, objem pri každom cviku so zmenou oproti
minulému týždňu (bez celkového objemu – spec 003), RPE tréningu a uloženie.

### User Story 6 – Progres (Priority: P2)

Samostatná obrazovka: zoznam cvikov s mini grafom a trendom (ako v trénerovom paneli), detail
cviku (váha, objem, rekord), ranná váha a fotky.

### Edge Cases

- Žiadny signál → všetko funguje, zápisy čakajú vo fronte (constitution III).
- Klient zatvorí apku uprostred cviku → po otvorení pokračuje na tej istej sérii.
- Tréner zmení cvik počas tréningu → zápis sa odmietne ako doteraz (constitution II).
- Superset a „Ok“ → rýchly zápis celého cviku ostáva.

## Requirements *(mandatory)*

- **FR-001**: Nový vizuálny štýl (typografia, farby, ikony, animácie) pre všetky obrazovky.
- **FR-002**: Navigácia: spodná lišta Dnes · Týždeň · Progres; tréning ako režim na celú
  obrazovku.
- **FR-003**: Zápis po sériách s ovládačmi ±, predvyplnenými plánom a predošlou sériou; zápis do
  tabuľky v existujúcom formáte.
- **FR-004**: Automatická pauza po sérii (z poznámky trénera alebo predvolená), vibrácia,
  +30 s, preskočiť; prežije zamknutie obrazovky.
- **FR-005**: Proaktívne karty a tipy (US4); osobné rekordy.
- **FR-006**: Rozpracovaný tréning prežije zatvorenie apky.
- **FR-007**: Všetky doterajšie funkcie (baseline 001) ostanú dostupné.
- **FR-008**: Funguje offline vrátane písma (žiadne písma ani skripty z cudzích serverov počas
  behu – constitution VI).

## Success Criteria *(mandatory)*

- **SC-001**: Zápis jednej série = 1 ťuknutie (ak klient robí podľa plánu).
- **SC-002**: Klient do 2 sekúnd od otvorenia vie, čo má dnes robiť.
- **SC-003**: Klient hodnotí novú apku ako „mega cool“ (subjektívne, porovnanie s v16).

## Assumptions

- Jedna váha na cvik (rovnaká pre všetky série); rôzna váha po sériách sa zapíše do poznámky.
- Smer vzhľadu sa vyberie z prototypu (3 farebné varianty).
- Zvuk na konci pauzy len pri otvorenej apke (iOS nedovolí viac bez push notifikácií).
