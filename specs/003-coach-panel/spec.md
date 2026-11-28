# Feature Specification: Trénerov panel – jeden pohľad na klienta

**Feature Branch**: `claude/funny-wright-hg586l`

**Created**: 2026-11-28

**Status**: Implemented (apka v15, Apps Script v3) – čaká na nasadenie skriptu a test s trénerom

**Input**: User description: "Trénerov dashboard prekopať od začiatku. Tréner nemá klikať
záložky. Otvorí si portál, vidí svojich klientov, klikne na klienta a vidí to isté ako v
Exceli: ako plynie čas (týždeň 1, 2, 3, 4…), cviky a ako sa pri nich vyvíja váha a
opakovania. Insighty – ide to hore, dolu, stagnuje – a komentáre jeho aj klienta. Snapshot na
prvý pohľad. A v tom istom pohľade pridá ďalší týždeň (nový stĺpec), upraví váhy a
opakovania a keď je hotový, pošle to klientovi."

**Nahrádza**: rozhranie portálu z baseline (US8, US9 – záložky Progres / Plán / Klient) a
náhľad návrhu zo [spec 002](../002-next-week-suggestions/spec.md). Pravidlá progresie a objem
zo spec 002 ostávajú a použijú sa na predvyplnenie nového týždňa.

## Princíp

Tréner dnes pracuje v Exceli: všetko vidí na jednej ploche, skopíruje posledný týždeň vedľa a
prepíše čísla. Panel robí presne to isté, len prehľadnejšie a s pomocou:

- **jedna plocha**: riadky = cviky (po dňoch), stĺpce = týždne bloku;
- **na prvý pohľad** vidno, čo ide hore, čo stagnuje a čo klesá, a kde klient niečo napísal;
- **posledný stĺpec** je rozpracovaný ďalší týždeň, ktorý tréner priamo upravuje;
- **jedno tlačidlo** pošle týždeň klientovi (zapíše do tabuľky).

## User Scenarios & Testing *(mandatory)*

### User Story 1 – Zoznam klientov (Priority: P1)

Tréner otvorí portál a vidí svojich klientov ako karty: meno, kedy naposledy cvičil, koľko
tréningov tento týždeň splnil a krátke upozornenia (napr. „2 cviky stagnujú“, „5 dní bez
tréningu“, „nová poznámka“). Klikne na klienta a otvorí sa jeho panel.

**Why this priority**: Vstupný bod; aj s jedným klientom musí byť jasné, kam kliknúť, a pri
viacerých klientoch tréner hneď vidí, kto potrebuje pozornosť.

**Independent Test**: Pridať dvoch klientov (dva odkazy), overiť karty a otvorenie panelu.

**Acceptance Scenarios**:

1. **Given** tréner má uložených klientov, **When** otvorí portál, **Then** vidí ich karty so
   stavom a upozorneniami, zoradené podľa toho, kto potrebuje pozornosť.
2. **Given** klient pošle trénerovi svoj odkaz, **When** ho tréner otvorí, **Then** klient sa
   pridá do zoznamu (pri prvom otvorení zadá meno a heslo trénera, ďalej už nie).
3. **Given** tréner má jedného klienta, **When** otvorí portál, **Then** stále vidí zoznam
   s jednou kartou (nie automatický prechod), aby bolo rozhranie rovnaké aj pri viacerých.

---

### User Story 2 – Časová os klienta na jednej ploche (Priority: P1)

Po kliknutí na klienta tréner vidí celý aktuálny blok na jednej ploche: v riadkoch cviky
zoskupené po dňoch (Deň 1, Deň 2…), v stĺpcoch týždne (T1, T2, T3…). V každej bunke je, čo
klient odcvičil: váha, série × opakovania, RPE; ak ešte necvičil, plán svetlejšie. Farba
ukazuje zmenu oproti predošlému týždňu (viac / menej / rovnako). Pri každom cviku je trend
celého bloku.

**Why this priority**: Toto je „Excel, ale prehľadnejší“ – hlavná hodnota panelu.

**Independent Test**: Na tabuľke so 4 týždňami overiť, že každý zapísaný výkon je v správnej
bunke a farby a trendy zodpovedajú číslam.

**Acceptance Scenarios**:

1. **Given** blok má 4 týždne, **When** tréner otvorí klienta, **Then** vidí 4 stĺpce týždňov
   s dátumami a všetky cviky po dňoch bez prepínania záložiek.
2. **Given** cvik v týždni klient odcvičil, **When** sa zobrazí bunka, **Then** obsahuje váhu
   (výrazne), série × opakovania, RPE a **objem cviku** so zmenou v % oproti minulému týždňu;
   pri vyššom objeme je zelená, pri nižšom červená, rovnaký neutrálna.
3. **Given** cvik ešte nie je odcvičený, **When** sa zobrazí bunka, **Then** ukazuje plán
   trénera svetlo (odlíšene od výkonu).
4. **Given** klient alebo tréner k cviku napísal poznámku, **When** sa zobrazí bunka, **Then**
   má značku poznámky a po kliknutí (v mobile ťuknutí) sa zobrazí text oboch poznámok.
5. **Given** tréner v tabuľke zmenil cvik (iný názov v neskoršom týždni), **When** sa zobrazí
   plocha, **Then** nový cvik má vlastný riadok a bunky starého cviku v ďalších týždňoch sú
   prázdne.
6. **Given** riadok cviku, **When** tréner klikne na jeho názov, **Then** otvorí sa detail:
   graf váhy a objemu aj zo starších blokov a všetky poznámky k cviku.

---

### User Story 3 – Snapshot a insighty (Priority: P1)

Nad plochou je súhrn na prvý pohľad: priebeh tohto týždňa (koľko tréningov odcvičil), ranná
váha a jej vývoj, posledné fotky. Celkový objem týždňa sa nezobrazuje – súčet za všetky cviky
trénerovi nič nehovorí; objem je vždy pri konkrétnom cviku. Pod ním insighty: koľko
cvikov ide hore, ktoré stagnujú, ktoré klesajú a na čo si dať pozor (napr. rastúce RPE pri
rovnakej váhe, nezvládnuté opakovania, nová poznámka klienta). Klik na insight zvýrazní
dotknuté riadky.

**Why this priority**: Tréner má do 10 sekúnd vedieť, ako sa klientovi darí a kde zasiahnuť.

**Independent Test**: Na pripravených dátach (cvik hore, cvik stagnujúci 3 týždne, cvik
dole) overiť správne insighty a zvýraznenie riadkov.

**Acceptance Scenarios**:

1. **Given** cvik má za posledné 3 odcvičené týždne rastúci objem, **When** sa vyhodnotí,
   **Then** je „ide hore“ (↑).
2. **Given** cvik má 3 odcvičené týždne bez rastu objemu (±2 %), **When** sa vyhodnotí,
   **Then** je „stagnuje“ (→).
3. **Given** cvik má v poslednom týždni nižší objem ako v predošlom o viac ako 5 %, alebo
   nezvládnuté opakovania, **When** sa vyhodnotí, **Then** je „klesá“ (↓) s dôvodom.
4. **Given** pri rovnakej váhe stúpa RPE 2 týždne po sebe, **When** sa vyhodnotí, **Then**
   insight „rastie únava“ upozorní na cvik.
5. **Given** klient napísal poznámku od posledného otvorenia panelu, **When** tréner otvorí
   klienta, **Then** insight „nové poznámky“ ich ukáže.

---

### User Story 4 – Ďalší týždeň priamo na ploche a odoslanie klientovi (Priority: P1)

Tréner na ploche klikne „+ Pridať týždeň“. Vedľa posledného týždňa pribudne nový stĺpec
s políčkami, predvyplnený návrhom podľa výkonov (pravidlá spec 002, +5 % objemu), každé
navrhnuté zvýšenie s malou značkou a dôvodom. Tréner prepisuje váhy, série, RPE a poznámky,
môže cvik pridať alebo vymeniť, a stále vidí všetky predošlé týždne vedľa seba. Keď je hotový,
klikne „Odoslať klientovi“ a týždeň sa zapíše do tabuľky; klient ho uvidí v apke.

**Why this priority**: Toto nahrádza trénerovu prácu v Exceli („skopíruj týždeň, prepíš
čísla“).

**Independent Test**: Pridať týždeň, prepísať dve hodnoty, pridať jeden cvik, odoslať a overiť
v tabuľke nový týždeň s posunutými dátumami a hodnotami z panelu.

**Acceptance Scenarios**:

1. **Given** posledný naplánovaný týždeň, **When** tréner klikne „+ Pridať týždeň“, **Then**
   pribudne stĺpec ďalšieho týždňa predvyplnený návrhom; tréner môže prepnúť na „kópiu bez
   zmien“.
2. **Given** rozpracovaný stĺpec, **When** tréner zmení hodnotu, **Then** zmena je hneď
   viditeľná (zvýraznenie, rozdiel oproti minulému týždňu, objem) a nestratí sa ani po zavretí
   prehliadača.
3. **Given** rozpracovaný stĺpec, **When** tréner pridá cvik do dňa alebo prepíše názov cviku,
   **Then** cvik pribudne do voľného miesta v dni (najviac toľko cvikov, koľko má tabuľka
   stĺpcov).
4. **Given** stĺpec je hotový, **When** tréner klikne „Odoslať klientovi“, **Then** týždeň sa
   zapíše do tabuľky (dátumy +7 dní, len PLANNED hodnoty), stĺpec sa zmení na bežný týždeň a
   tréner dostane potvrdenie.
5. **Given** odoslanie zlyhá úplne alebo čiastočne, **When** sa zobrazí výsledok, **Then**
   tréner vidí, čo sa nezapísalo, a môže to odoslať znova; nič sa nezapíše dvakrát.
6. **Given** tréner chce zmeniť už odoslaný týždeň, ktorý klient ešte necvičil, **When**
   klikne na bunku, **Then** môže hodnoty upraviť priamo (uloží sa hneď).
7. **Given** posledný týždeň je naplánovaný, ale klient ho ešte necvičil (tréner ho napr.
   skopíroval v Exceli), **When** tréner otvorí klienta, **Then** panel to jasne povie a hlavná
   akcia je „Upraviť T{n}“: stĺpec týždňa sa zmení na políčka s aktuálnym plánom (prepínač
   „Aktuálny plán / Návrh podľa výkonov“), tréner upraví čo treba a „Uložiť a poslať klientovi“
   zapíše zmeny do toho istého týždňa (nevznikne nový). „Pridať týždeň n+1“ ostáva ako druhá
   možnosť. *(doplnené po spätnej väzbe 2026-11-28)*

---

### User Story 5 – Telo, fotky a poznámky (Priority: P2)

V snapshot je ranná váha s krivkou a odkaz na fotky; detail (graf váhy, zoznam fotiek, všetky
poznámky) sa otvorí v bočnom paneli bez opustenia plochy.

**Why this priority**: Doplnkové údaje, ktoré dnes sú v samostatnej záložke.

**Independent Test**: Otvoriť bočný panel váhy a fotiek a vrátiť sa na plochu bez straty
rozpracovaného týždňa.

**Acceptance Scenarios**:

1. **Given** klient zapisuje váhu, **When** tréner otvorí klienta, **Then** snapshot ukazuje
   poslednú váhu, 7-dňový priemer a zmenu za týždeň.
2. **Given** tréner klikne na váhu alebo fotky, **When** sa otvorí bočný panel, **Then**
   rozpracovaný týždeň ostane nezmenený.

### Edge Cases

- Klient s viac ako 6 týždňami v bloku → plocha sa posúva vodorovne, stĺpec cvikov a
  rozpracovaný týždeň ostávajú viditeľné.
- Staršie bloky (skryté hárky) → na ploche je aktuálny blok; staršie sú v detaile cviku a
  v prepínači „predošlý blok“.
- Mobil → plocha sa posúva vodorovne s pevným stĺpcom cvikov; panel je navrhnutý hlavne pre
  počítač a tablet.
- Klientov odkaz prestane fungovať (zmenené heslo, zmazaný skript) → karta klienta ukáže chybu
  a ponúkne odstránenie zo zoznamu.
- Dva otvorené panely toho istého klienta → pred odoslaním sa overí, že sa tabuľka medzitým
  nezmenila (ako v spec 002).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Portál MUSÍ zobraziť zoznam klientov ako karty so stavom a upozorneniami a
  otvoriť panel klienta jedným klikom; bez záložiek.
- **FR-002**: Klient sa MUSÍ dať pridať otvorením jeho odkazu; zoznam si portál pamätá
  v trénerovom prehliadači, prihlasovacie údaje trénera sa zadávajú raz.
- **FR-003**: Panel klienta MUSÍ zobraziť aktuálny blok ako mriežku: riadky = cviky po dňoch,
  stĺpce = týždne s dátumami; bunka = odcvičená váha, série × opakovania, RPE a objem cviku so
  zmenou oproti minulému týždňu, alebo plán, ak ešte nie je odcvičené. Rozpracovaný týždeň
  ukazuje pri každom cviku plánovaný objem a zmenu oproti poslednému výkonu.
- **FR-003a**: Panel NESMIE zobrazovať celkový objem týždňa ani tréningu (súčet cez cviky).
- **FR-004**: Bunky MUSIA farebne ukazovať zmenu oproti predošlému týždňu a značku poznámky
  (klienta aj trénera) s textom na klik.
- **FR-005**: Pri každom cviku MUSÍ byť trend bloku (↑ / → / ↓) podľa objemu a pravidiel
  US3; nad mriežkou MUSÍ byť snapshot a zoznam insightov, ktoré po kliknutí zvýraznia riadky.
- **FR-006**: „+ Pridať týždeň“ MUSÍ pridať upraviteľný stĺpec ďalšieho týždňa predvyplnený
  návrhom zo spec 002 (s možnosťou kópie bez zmien); rozpracovaný stĺpec MUSÍ prežiť zatvorenie
  prehliadača.
- **FR-007**: V rozpracovanom stĺpci MUSÍ ísť meniť série, váhu, RPE, poznámku a názov cviku a
  pridať cvik do voľného miesta dňa.
- **FR-008**: „Odoslať klientovi“ MUSÍ zapísať týždeň do tabuľky jednou akciou (dátumy +7 dní,
  len PLANNED), s kontrolou zmien a opakovaním neúspešných častí (FR-007–009 spec 002).
- **FR-009**: Bunky budúceho, ešte neodcvičeného týždňa MUSIA ísť upraviť priamo, jednotlivo
  aj celý týždeň naraz („Upraviť T{n}“, US4 scenár 7).
- **FR-012**: „Pridať klienta“ MUSÍ byť klikateľné: krátky návod a políčko na vloženie odkazu
  od klienta.
- **FR-013**: Stĺpce týždňov MAJÚ pevnú šírku (bez medzier pri širokej obrazovke).
- **FR-014**: Série s približným počtom opakovaní (`2x~8`) sa MUSIA počítať ako 2×8.
- **FR-010**: Detail cviku (graf váhy a objemu aj zo starších blokov, poznámky) a detail tela
  (váha, fotky) sa MUSIA otvárať bez opustenia plochy.
- **FR-011**: Klientska apka sa nemení.

### Key Entities

- **Klient (v portáli)**: meno (z tabuľky), odkaz na jeho Apps Script, posledné otvorenie
  (pre „nové poznámky“); uložené v trénerovom prehliadači.
- **Riadok cviku**: deň + cvik (tolerantné porovnanie názvu naprieč týždňami), bunky po
  týždňoch, trend.
- **Insight**: typ (hore / stagnácia / pokles / únava / poznámka), dotknuté cviky, text.
- **Rozpracovaný týždeň**: hodnoty nového stĺpca a ich pôvod (návrh / kópia / úprava).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Tréner do 10 sekúnd od otvorenia klienta povie, ktoré cviky idú hore a ktoré
  stagnujú.
- **SC-002**: Tréner naplánuje ďalší týždeň (4 dni × 6 cvikov) do 3 minút bez otvorenia
  Excelu.
- **SC-003**: Tréner počas plánovania ani raz neopustí plochu klienta.
- **SC-004**: Po 4 týždňoch používania tréner plánuje cez panel namiesto Excelu (jeho slovami
  „Excel už nepotrebujem“).

## Assumptions

- Viac klientov zatiaľ znamená viac odkazov (každý klient má svoj Apps Script, tréner má
  v každom rovnaké meno a heslo). Jeden skript pod trénerovým účtom pre všetkých (roadmapa E)
  zmení len pripájanie, nie toto rozhranie.
- Panel je navrhnutý pre počítač a tablet; v mobile funguje s vodorovným posúvaním.
- Na pridanie a premenovanie cviku pri odoslaní treba rozšíriť `applyWeek` v Apps Scripte
  (zápis názvu do voľného stĺpca) – bude treba ešte raz aktualizovať skript.
- Predvolené prahy insightov (stagnácia ±2 % za 3 týždne, pokles −5 %) sú nastaviteľné neskôr.

## Vzhľad a zjednodušenie (v23, 2026-11-28)

- Panel má rovnaký vzhľad ako klientska apka (Volt): tmavé pozadie so žiarou, písmo Barlow
  Condensed na nadpisy a čísla, zeleno-tyrkysový gradient, zaoblené karty.
- Menej textu: karta klienta = meno, tréningy týždňa, váha a krátke štítky (napr. „10 dní pauza“,
  „↓ 1 klesá“); v paneli klienta tri dlaždice bez popisov (Tréningy, Váha so štítkom zmeny,
  Fotky), insighty bez nadpisu, bez legendy „V bunke…“, krátka nápoveda pri naplánovanom
  týždni, lišta „Nový T3 · 4 zmeny“.
