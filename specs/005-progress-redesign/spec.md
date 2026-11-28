# Feature Specification: Nový Progres

**Feature Branch**: `claude/funny-wright-hg586l`

**Created**: 2026-11-28

**Status**: Draft – prototyp na odsúhlasenie

**Input**: User description: "Záložku Progres celú prerobiť, určite sa dá spraviť lepšie."

**Nadväzuje na**: [004](../004-app-redesign/spec.md) US6 (Progres) – nahrádza ho.

## Princíp

Progres má odpovedať na tri otázky, v tomto poradí:

1. **Zlepšujem sa?** – jedno číslo a jedna veta na prvý pohľad.
2. **V čom áno a v čom nie?** – cviky podľa trendu, rekordy, na čo si dať pozor.
3. **Ako sa mení telo?** – ranná váha (s priemerom) a fotky.

Sila sa porovnáva cez **odhad maxima na 1 opakovanie (e1RM)** = váha × (1 + opakovania / 30)
(Epleyho vzorec). Umožní porovnať napr. 50 kg × 10 a 55 kg × 8 – samotná váha to nedokáže.

## User Scenarios & Testing *(mandatory)*

### User Story 1 – Prehľad (Priority: P1)

Hore prepínač **Prehľad · Cviky · Telo**. Prehľad ukáže: hlavné číslo (priemerná zmena sily
cvikov v bloku v %, s vetou), tréningy odcvičené / naplánované, počet rekordov, zmenu rannej
váhy; **dochádzku** ako mriežku týždňov × dní (odcvičené / vynechané / voľno); posledné
**rekordy** ako karty; **top progres** (3 cviky s najväčším rastom) a **pozor** (cviky, ktoré
stagnujú alebo klesajú, s dôvodom).

### User Story 2 – Cviky (Priority: P1)

Zoznam všetkých cvikov s mini grafom, poslednou hodnotou a zmenou; filter **Všetky · Hore ·
Stagnujú · Klesajú**. Detail cviku: prepínač **Váha · Objem · 1RM**, graf (aj zo starších
blokov), rekord, najlepšia séria, posledný výkon, história.

### User Story 3 – Telo (Priority: P2)

Ranná váha: graf denných vážení s čiarou 7-dňového priemeru, posledná, priemer 7 dní, zmena za
4 týždne; fotky progresu ako časová os s odkazmi.

### Edge Cases

- Málo dát (menej ako 2 tréningy cviku) → cvik bez trendu, s textom „málo dát“.
- Cviky bez váhy (vlastná váha) → e1RM sa nepočíta, trend podľa opakovaní.
- Supersety → každá časť zvlášť.
- Bez rannej váhy / fotiek → Telo ukáže, ako začať.

## Requirements *(mandatory)*

- **FR-001**: Progres MUSÍ mať prepínač Prehľad · Cviky · Telo.
- **FR-002**: Prehľad MUSÍ ukázať hlavné číslo (priemerná zmena e1RM cvikov v aktuálnom bloku),
  dochádzku, rekordy a top progres / pozor.
- **FR-003**: Cviky MUSIA ísť filtrovať podľa trendu; detail s grafom váhy, objemu a e1RM.
- **FR-004**: Telo MUSÍ ukázať rannú váhu so 7-dňovým priemerom a fotky.
- **FR-005**: Výpočty (e1RM, trend) v `calc.js` s testami; rovnaké pravidlá trendu ako v paneli
  trénera (spec 003).

## Success Criteria *(mandatory)*

- **SC-001**: Klient do 3 sekúnd povie, či sa v bloku zlepšuje.
- **SC-002**: Klient nájde svoj rekord v ľubovoľnom cviku do 2 ťuknutí.

## Assumptions

- e1RM je odhad; pri vysokom počte opakovaní (>12) je menej presný – zobrazuje sa ako „odhad“.
- Hlavné číslo počíta len cviky s aspoň 2 záznamami v aktuálnom bloku.

## Zmena po spätnej väzbe (prototyp v2)

- V zoznamoch cvikov **bez čiarových mini grafov** (pôsobili divne). Namiesto nich:
  **štítok** so šípkou a % (zelený rast „za blok“, sivá stagnácia / červený pokles „oproti
  minule“) a **rad štvorčekov po týždňoch** (zelený = lepšie ako minulý týždeň, sivý = rovnako,
  červený = horšie). Graf ostáva len v detaile cviku.

## Rozhodnutia (prototyp v4)

- **Trend cviku = štýl E**: riadok cviku je sám pruhom – pozadie sa zľava napĺňa zelenou (rast
  za blok) alebo červenou (pokles oproti minulému týždňu), na konci svietiaca hrana; dĺžka
  zodpovedá zmene (±20 % = celý riadok). Žiadne ďalšie prvky v riadku.
- **Rekordy** (vždy oproti všetkým predošlým záznamom cviku vrátane starších blokov):
  1. **váhový rekord** – najťažšia odcvičená váha (hlavné číslo na karte, „koľko dávaš“);
  2. **rekord v opakovaniach** – pri rovnakej alebo vyššej váhe viac opakovaní ako kedykoľvek;
  3. **rekord v objeme** – najväčší objem cviku za jeden tréning (série × opakovania × kg).
  Rovnaké pravidlá platia pre ohlásenie rekordu pri zápise cviku a v súhrne tréningu.

## Rozhodnutia (prototyp v6) – jednoduchosť

- **Čo najmenej textu.** Karta rekordu = **číslo** (váha) + **názov cviku** + **jeden štítok
  trendu**: „↑ +2,5 kg“ (váhový rekord), „↑ +2 opak.“ (rekord v opakovaniach) alebo
  „↑ +8 % objem“ (rekord v objeme). Žiadne ďalšie popisy.
- Riadok cviku: názov, pod ním len váha (v „Pozor na“ + krátky dôvod: „stagnuje“,
  „nezvládnuté opak.“, „bolia kolená“), vpravo %.
- Hlavné číslo: „Sila“ + % + „silnejší ako na začiatku bloku“. Dlaždice bez podpisov navyše.

## Rozhodnutia (prototyp v7) – menej sekcií

Nahrádza rozloženie US1–US3 (Prehľad · Cviky · Telo):

- Prepínač len **Sila · Telo**. Prehľad a Cviky sú zlúčené.
- **Sila**: jedna karta – % sily za blok + riadok dochádzky (pásik tréningov bloku a „10/11“).
  Potom **Rekordy** (karty) a **Cviky** – jeden zoznam zoradený od najväčšieho rastu po pokles
  (štýl E, pri probléme krátky dôvod). Bez dlaždíc, filtrov, mriežky dochádzky a sekcií
  „Najväčší progres“ / „Pozor na“.
- **Telo**: veľké číslo (priemer 7 dní) + štítok zmeny za 4 týždne, graf (body = dni, čiara =
  priemer), fotky ako mriežka náhľadov s dátumom. Bez dlaždíc a legendy.
- **Detail cviku**: názov, veľká aktuálna váha + štítok zmeny v bloku, prepínač **Váha · Objem**
  (e1RM ostáva len vnútorne pre % trendu), graf, história (dátum · kg · série × opak., pohár pri
  rekorde). Bez tabuľky, dlaždíc a poznámok.
