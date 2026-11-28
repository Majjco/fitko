# Feature Specification: Fitko – súčasný stav (baseline)

**Feature Branch**: `claude/funny-wright-hg586l`

**Created**: 2026-11-28

**Status**: Implemented (baseline k verzii apky 13; zmeny od verzie 14 sú v ďalších spec)

**Input**: User description: "Spätne zdokumentovať, čo apka Fitko a trénerov portál vedia dnes,
aby nové funkcie nič nerozbili."

> Tento dokument popisuje **existujúce** správanie, nie nový návrh. Slúži ako referencia pre
> budúce špecifikácie: nová spec môže odkazovať na požiadavky odtiaľto (napr. „mení FR-014“).
> Ak sa správanie apky zmení, treba aktualizovať aj tento dokument.

## User Scenarios & Testing *(mandatory)*

**Aktéri**

- **Klient** – cvičí podľa plánu, zapisuje výsledky v mobile, často bez signálu.
- **Tréner** – píše plán do svojej Google tabuľky; voliteľne používa trénerov portál.

### User Story 1 – Zapísať tréning vo fitku (Priority: P1)

Klient otvorí apku vo fitku, vidí dnešný tréning a cvik po cviku zapisuje, čo odcvičil
(série × opakovania, váhu, RPE, poznámku). Pri každom cviku vidí plán od trénera a svoj
minulý výkon, takže hneď vie, akú váhu nahodiť. Výsledky sa objavia v trénerovej tabuľke.

**Why this priority**: Toto je dôvod, prečo apka existuje. Všetko ostatné je nadstavba.

**Independent Test**: Nastaviť apku na testovaciu tabuľku, otvoriť dnešný deň, zapísať
jeden cvik a overiť, že hodnoty sú v EXECUTED stĺpcoch správneho riadku.

**Acceptance Scenarios**:

1. **Given** plán má deň s dnešným dátumom, **When** klient otvorí apku, **Then** zobrazí sa
   týždeň s týmto dňom a deň je označený „Dnes“.
2. **Given** klient otvorí deň, **When** sa zobrazí tréning, **Then** je rozbalený len prvý
   nezapísaný cvik a hore je prehľad cvikov 1 · 2 · 3… s vyznačenými hotovými.
3. **Given** cvik bol v minulosti zapísaný (aj v staršom bloku), **When** je cvik rozbalený,
   **Then** pod plánom trénera je riadok „Minule“ v tých istých stĺpcoch (série, váha, RPE),
   prípadne minulá poznámka klienta.
4. **Given** existuje minulý výkon, **When** klient ťukne „Ako minule“, **Then** série a váha
   sa vyplnia z minula.
5. **Given** existuje minulá váha, **When** klient píše novú váhu, **Then** priebežne vidí
   porovnanie „↑ +5 kg / ↓ −2,5 kg / = ako minule“.
6. **Given** klient vyplní aspoň série, váhu alebo RPE, **When** ťukne „Uložiť a ďalej“,
   **Then** hodnoty sa uložia, cvik sa zbalí do riadku so súhrnom a otvorí sa ďalší
   nezapísaný cvik.
7. **Given** klient nevyplnil nič, **When** ťukne „Uložiť“, **Then** zápis sa odmietne s
   hláškou „Najprv vyplň aspoň váhu alebo RPE“.
8. **Given** cvik je superset (`CVIK A + CVIK B`), **When** klient zapisuje, **Then** zapisuje
   do jedného políčka v tvare tabuľky (napr. `2x8 a 2x9`, RPE `8 a 7`) a rýchla voľba RPE
   pridáva hodnoty postupne pre 1. a 2. cvik.
9. **Given** tréner medzičasom zmenil cvik v tabuľke, **When** apka posiela zápis, **Then**
   zápis sa odmietne s hláškou, aby si klient obnovil plán, a nič sa neprepíše.

---

### User Story 2 – Cvičiť bez signálu (Priority: P1)

Vo fitku často nie je signál. Klient musí vidieť plán a zapisovať výsledky aj offline;
zápisy sa odošlú samy, keď sa pripojenie vráti.

**Why this priority**: Bez toho by bola P1 v reálnom fitku nepoužiteľná.

**Independent Test**: Načítať plán, vypnúť sieť, zapísať dva cviky, zavrieť a otvoriť apku,
zapnúť sieť a overiť, že oba zápisy sú v tabuľke.

**Acceptance Scenarios**:

1. **Given** plán bol aspoň raz načítaný, **When** klient otvorí apku bez signálu, **Then**
   apka sa otvorí okamžite a ukáže posledný známy plán.
2. **Given** klient je offline, **When** uloží cvik, **Then** cvik je zobrazený ako zapísaný so
   stavom „Odosielam…“ a hore je pruh „Čaká na odoslanie do tabuľky: N“ s tlačidlom „Odoslať“.
3. **Given** vo fronte čakajú zápisy, **When** sa vráti pripojenie alebo klient ťukne
   „Odoslať“ či obnoví plán, **Then** zápisy sa odošlú v poradí a stav sa zmení na „Uložené v
   tabuľke“ alebo na chybu s dôvodom.
4. **Given** klient rozpísal hodnoty, **When** sa obrazovka prekreslí (obnovenie plánu,
   výber fotky), **Then** rozpísané hodnoty ostanú.
5. **Given** vyšla nová verzia apky, **When** klient práve niečo rozpisuje alebo má neodoslané
   zápisy, **Then** apka sa nereštartuje, len ukáže hlášku, že je dostupná nová verzia.

---

### User Story 3 – Prehľad týždňa a dokončenie tréningu (Priority: P2)

Klient vidí celý týždeň (dni s cvikmi, voľné dni, priebeh), prepína týždne a po tréningu
dostane súhrn so zlepšeniami. Trvanie a celková náročnosť sa zapíšu do tabuľky.

**Why this priority**: Motivácia a údaje pre trénera, ale zápis cvikov funguje aj bez toho.

**Independent Test**: Zapísať všetky cviky dňa a overiť, že sa ukáže súhrn a po uložení sú
`WORKOUT TIME` a `SESH RPE` v tabuľke.

**Acceptance Scenarios**:

1. **Given** týždeň v pláne, **When** klient vidí úvodnú obrazovku, **Then** každý deň ukazuje
   číslo, dátum, počet cvikov a prvé cviky, priebeh (krúžok) alebo „Hotovo · N min“; dni bez
   cvikov sú „Voľno“.
2. **Given** klient uloží posledný nezapísaný cvik dňa, **When** tréning ešte nebol dokončený,
   **Then** automaticky sa otvorí súhrn.
3. **Given** súhrn, **When** sa zobrazí, **Then** obsahuje počet zapísaných cvikov, počet
   zlepšení váhy oproti minule, trvanie (počítané od prvého uloženého cviku, dá sa upraviť) a
   výber celkového RPE 5–10.
4. **Given** klient ťukne „Uložiť tréning“, **When** je zapnutý zápis, **Then** trvanie
   („N min“) a RPE sa zapíšu do riadku dňa; deň sa ďalej zobrazuje ako „Tréning hotový“.

---

### User Story 4 – Graf progresu cviku (Priority: P2)

Pri cviku si klient otvorí graf, ako mu rástla váha, aj naprieč staršími blokmi (hárkami).

**Why this priority**: Motivačné a užitočné pri voľbe váhy, ale nie nevyhnutné.

**Independent Test**: Pri cviku so zápismi v dvoch hárkoch otvoriť graf a overiť body z oboch.

**Acceptance Scenarios**:

1. **Given** cvik má zapísané váhy, **When** klient ťukne na ikonu grafu, **Then** zobrazí sa
   graf váhy v čase a tabuľka posledných 12 zápisov (dátum, série, kg, RPE).
2. **Given** superset, **When** sa otvorí graf, **Then** každá časť má vlastný graf.
3. **Given** názov cviku sa medzi blokmi mierne líši (napr. doplnok za pomlčkou, text v
   zátvorke, „DUMBELL“ vs. „DB“, „OF CHOICE“), **When** sa hľadá história, **Then** zápisy sa
   považujú za ten istý cvik.

---

### User Story 5 – Ranná váha (Priority: P2)

Klient ráno zapíše svoju váhu na úvodnej obrazovke a vidí trend. Tréner ju vidí v záložke
„Váha“ v tabuľke.

**Why this priority**: Dôležité pre trénera pri riadení diéty, nezávislé od tréningu.

**Independent Test**: Zapísať váhu, overiť riadok v záložke „Váha“ a zobrazenie 7-dňového
priemeru.

**Acceptance Scenarios**:

1. **Given** dnes ešte nie je váha, **When** klient otvorí apku, **Then** vidí políčko „Ranná
   váha“; po uložení vidí „Dnes X kg“ s možnosťou upraviť.
2. **Given** klient zadá hodnotu mimo 20–400 kg, **When** ukladá, **Then** zápis sa odmietne.
3. **Given** váha za dnešok už existuje, **When** klient uloží novú, **Then** hodnota sa v
   tabuľke prepíše (nevznikne druhý riadok); riadky sú zoradené podľa dátumu.
4. **Given** sú dáta, **When** klient vidí kartu váhy, **Then** vidí krivku za 30 dní,
   7-dňový priemer a rozdiel oproti predošlým 7 dňom; po ťuknutí graf za 90 dní, priemery 7
   a 30 dní a zoznam posledných 30 vážení.
5. **Given** záložka „Váha“ neexistuje, **When** sa zapisuje prvá váha, **Then** záložka sa
   založí automaticky.

---

### User Story 6 – Fotky progresu (Priority: P3)

V nedeľu apka pripomenie odfotiť sa. Fotky sa zmenšia a uložia na Google Drive klienta,
zdieľané len s trénerom; v tabuľke pribudne odkaz.

**Why this priority**: Raz týždenne, doplnková funkcia.

**Independent Test**: Nahrať dve fotky, overiť priečinok s dátumom na Drive, zdieľanie s
vlastníkom tabuľky a riadok v záložke „Fotky“.

**Acceptance Scenarios**:

1. **Given** je nedeľa, **When** klient otvorí apku, **Then** vidí kartu „Nedeľné fotky
   progresu“ (po odoslaní „Fotky odoslané trénerovi · N fotiek ✓“); v iné dni je dole
   tlačidlo „Fotky progresu“.
2. **Given** klient pridá fotky (fotoaparát alebo galéria, naraz max. 8), **When** ich odošle,
   **Then** každá fotka sa zmenší a uloží do priečinka dňa a stav sa ukáže pri každej
   miniatúre.
3. **Given** priečinok ešte neexistuje, **When** sa nahrá prvá fotka, **Then** priečinok sa
   založí a nazdieľa len vlastníkovi tabuľky; ak zdieľanie zlyhá, apka dá odkaz na ručné
   nazdieľanie.
4. **Given** odoslanie zlyhá, **When** sa zobrazí chyba, **Then** klient vidí zrozumiteľný
   dôvod (chýbajúce povolenie Drive / sieť / iné) aj presný technický detail a môže to skúsiť
   znova.

---

### User Story 7 – Nastavenie a prenos na iný mobil (Priority: P1)

Klient pri prvom spustení prepojí apku s tabuľkou: buď len na čítanie (verejný odkaz +
názov hárku), alebo so zápisom (URL Apps Scriptu + heslo).

**Why this priority**: Bez nastavenia apka nefunguje.

**Independent Test**: Na čistom zariadení zadať údaje, overiť načítanie plánu; skopírovať
odkaz na nastavenie a otvoriť ho na inom zariadení.

**Acceptance Scenarios**:

1. **Given** apka nie je nastavená, **When** sa otvorí, **Then** zobrazí sa obrazovka „Vitaj
   vo Fitku“ s nastavením.
2. **Given** len odkaz na tabuľku, **When** klient uloží, **Then** apka číta plán z verejne
   zdieľanej tabuľky a jasne ukazuje režim „len na čítanie – výsledky sa ukladajú iba v
   telefóne“.
3. **Given** URL skriptu a heslo, **When** klient uloží, **Then** názov hárku môže ostať
   prázdny; aktuálny hárok sa nájde sám (prvý viditeľný hárok s `WEEK 1`).
4. **Given** neplatný odkaz na tabuľku alebo URL skriptu bez `/exec`, **When** klient ukladá,
   **Then** dostane konkrétnu hlášku.
5. **Given** nastavená apka, **When** klient ťukne „Skopírovať odkaz na nastavenie“, **Then**
   dostane odkaz, ktorý na inom zariadení nastaví apku rovnako (s upozornením, že obsahuje
   heslo).

---

### User Story 8 – Tréner: prehľad progresu klienta (Priority: P2)

Tréner sa v portáli prihlási menom a heslom a vidí všetky cviky × týždne aktuálneho bloku so
zapísanými váhami, RPE a trendom; klikom na cvik otvorí graf a históriu.

**Why this priority**: Šetrí trénerovi prechádzanie tabuľky, ale tabuľka funguje aj bez toho.

**Independent Test**: Otvoriť odkaz od klienta, prihlásiť sa, overiť tabuľku progresu.

**Acceptance Scenarios**:

1. **Given** tréner otvorí odkaz `trener.html#s=…` od klienta, **When** zadá meno a heslo
   trénera, **Then** vidí záložky Progres, Plán, Klient; zlé údaje alebo klientske heslo
   prihlásenie odmietnu.
2. **Given** záložka Progres, **When** sa zobrazí, **Then** riadky sú cviky, stĺpce týždne s
   plánom; bunky ukazujú zapísanú váhu a RPE, farebne vyššie / nižšie / rovnako ako minule,
   sivo „plán“, ak ešte nie je zapísané; posledný stĺpec je trend od prvého po posledný zápis.
3. **Given** záložka Klient, **When** sa zobrazí, **Then** tréner vidí rannú váhu (posledná,
   priemer 7 a 30 dní, graf), zoznam fotiek s odkazmi a posledných 25 poznámok klienta k
   cvikom.

---

### User Story 9 – Tréner: úprava a plánovanie (Priority: P2)

Tréner v portáli upravuje plán (cviky, série, váha, RPE, poznámka), pridáva a odoberá cviky,
kopíruje dni a plánuje ďalší týždeň. Všetko sa hneď prejaví v tabuľke.

**Why this priority**: Zrýchľuje trénerovi prácu; tabuľku však môže ďalej upravovať priamo.

**Independent Test**: Upraviť cvik, pridať cvik, naplánovať ďalší týždeň a overiť zmeny v
tabuľke vrátane posunutých dátumov.

**Acceptance Scenarios**:

1. **Given** záložka Plán, **When** sa otvorí, **Then** ukazuje posledný naplánovaný týždeň a
   pri každom cviku plán a „Minule“ klienta.
2. **Given** tréner zmení hodnoty a uloží, **When** sa cvik v tabuľke medzičasom nezmenil,
   **Then** zapíšu sa len PLANNED bunky; inak sa zápis odmietne s výzvou obnoviť stránku.
3. **Given** deň má voľný stĺpec cviku, **When** tréner ťukne „Pridať cvik“ a vyplní názov,
   **Then** cvik pribudne do prvého voľného stĺpca.
4. **Given** klient už cvik zapísal, **When** ho chce tréner odstrániť, **Then** odstránenie sa
   odmietne.
5. **Given** cieľový deň je prázdny, **When** tréner skopíruje deň z minulého týždňa alebo do
   ďalšieho, **Then** cviky s PLANNED hodnotami sa prenesú; ak niečo zlyhá, kopírovanie sa
   zastaví s hláškou.
6. **Given** tréner je na poslednom naplánovanom týždni, **When** ťukne „Naplánovať ďalší
   týždeň“, **Then** plán sa skopíruje do najbližšieho prázdneho týždňa a dátumy sa posunú o
   7 dní za každý týždeň; ak prázdny týždeň nie je, pod posledný sa pridá nový blok `WEEK n+1`
   s vyčistenými EXECUTED hodnotami, poznámkami dňa, časom a RPE tréningu.

### Edge Cases

- Dátum v tabuľke bez roka (`d.m.`) → zvolí sa rok, pri ktorom je dátum najbližšie k dnešku.
- Dnešný dátum v pláne nie je → otvorí sa posledný týždeň, ktorý má nejaké cviky.
- Starší blok má stĺpce inde → poloha sa zistí z hlavičiek `EXERCISE n`, `DATE`, `NOTES`,
  `WORKOUT TIME`, `SESH RPE`; bez hlavičiek platí predvolené rozloženie (6 cvikov × 9
  stĺpcov od D).
- Tréner založí nový hárok a starý skryje → apka so zápisom prejde na nový sama.
- Tabuľka nie je zdieľaná verejne (režim len na čítanie) → hláška „Tabuľka nie je zdieľaná pre
  každého s odkazom“.
- V hárku nie je `WEEK 1` → hláška, aby klient skontroloval názov hárku.
- Hodnota „7-8“ alebo „3.5“ → uloží sa ako text, nie dátum ani číslo.
- Váha s textom (napr. „50 a 2x6“, „Ok“, „choose“) → do grafu a porovnaní ide len číselná
  časť; „choose“ sa zobrazí ako „podľa seba“ a ako návrh sa ponúkne minulá váha.
- Starší Apps Script bez podpory váhy a fotiek → apka ukáže banner, že treba aktualizovať
  skript, a skryje tieto funkcie.
- Súbežné zápisy klienta a trénera → skript ich spracuje postupne pod zámkom.
- Plné alebo blokované úložisko v telefóne → apka nespadne (zápis do pamäte sa ticho
  preskočí).
- Apka sa vráti z pozadia po viac ako 5 minútach → plán sa potichu obnoví.

## Requirements *(mandatory)*

### Functional Requirements

**Načítanie plánu**

- **FR-001**: Apka MUSÍ načítať plán z trénerovej tabuľky buď cez verejný odkaz (len čítanie),
  alebo cez Apps Script klienta (čítanie aj zápis).
- **FR-002**: Apka MUSÍ rozpoznať týždne (`WEEK n`), dni (`DAY n`) a cviky po 9 stĺpcoch
  (názov, 4× PLANNED, 4× EXECUTED) a polohu stĺpcov zistiť z hlavičiek.
- **FR-003**: So zápisom MUSÍ apka nájsť aktuálny hárok sama, ak názov nie je zadaný, a načítať
  aj ostatné hárky s plánom (aj skryté) ako históriu, najviac raz za 24 hodín.
- **FR-004**: Apka MUSÍ predvolene otvoriť týždeň s dnešným dňom a zvýrazniť ho.

**Zápis tréningu**

- **FR-005**: Klient MUSÍ môcť zapísať pre každý cvik série × opakovania, váhu, RPE a poznámku
  pre trénera; uloženie vyžaduje aspoň jednu z hodnôt série/váha/RPE alebo poznámku.
- **FR-006**: Zápis MUSÍ ísť len do EXECUTED buniek správneho cviku a dňa a MUSÍ sa odmietnuť,
  ak sa názov cviku v tabuľke líši od toho, ktorý klient videl.
- **FR-007**: Apka MUSÍ pri cviku zobraziť plán a posledný zapísaný výkon toho istého cviku
  (aj zo starších blokov, s tolerantným porovnaním názvov) a ponúknuť „Ako minule“, „Ok“ pre
  série a rýchlu voľbu RPE (6–10 po pol bode od 7).
- **FR-008**: Apka MUSÍ podporovať supersety (`A + B`) s hodnotami oddelenými „ a “.
- **FR-009**: Po uložení cviku MUSÍ apka otvoriť ďalší nezapísaný cvik; po poslednom otvoriť
  súhrn tréningu.
- **FR-010**: Súhrn MUSÍ ukázať počet zapísaných cvikov, zlepšenia váhy oproti minule a
  trvanie; uloženie súhrnu MUSÍ zapísať trvanie a celkové RPE do riadku dňa. *(Rozšírené v
  [002](../002-next-week-suggestions/spec.md): objem tréningu a cvikov.)*

**Offline a spoľahlivosť**

- **FR-011**: Apka MUSÍ fungovať offline z poslednej načítanej verzie plánu a samotnej apky.
- **FR-012**: Zápisy (cviky, súhrn, váha) MUSIA ísť do trvalej fronty, ktorá prežije zatvorenie
  apky a odošle sa po obnovení pripojenia, ručne alebo pri obnovení plánu; novší zápis toho
  istého cviku nahradí starší vo fronte.
- **FR-013**: Apka MUSÍ zobraziť stav zápisu (odosiela sa / uložené v tabuľke / chyba s dôvodom
  / uložené len v telefóne) a počet čakajúcich zápisov.
- **FR-014**: Rozpísané hodnoty MUSIA prežiť prekreslenie obrazovky.
- **FR-015**: Nová verzia apky sa MUSÍ nainštalovať automaticky a reštartovať apku len vtedy,
  keď klient nič nerozpisuje, nemá otvorené okno, neodoslané zápisy ani nenahráva fotky.

**Ranná váha**

- **FR-016**: Klient MUSÍ môcť zapísať a upraviť dnešnú váhu (20–400 kg, s presnosťou 0,1 kg);
  váha sa uloží do záložky „Váha“ (jeden riadok na deň, chronologicky).
- **FR-017**: Apka MUSÍ ukázať 7-dňový priemer, rozdiel oproti predošlým 7 dňom, krivku za 30
  dní a detail (graf za 90 dní, priemery 7/30 dní, posledných 30 vážení).

**Fotky progresu**

- **FR-018**: Klient MUSÍ môcť odfotiť alebo vybrať z galérie najviac 8 fotiek naraz; fotky sa
  pred odoslaním zmenšia (najviac 1600 px na dlhšej strane).
- **FR-019**: Fotky sa MUSIA uložiť na Drive klienta do priečinka „Fitko – progres fotky“ podľa
  dňa, priečinok zdieľaný len s vlastníkom tabuľky; v záložke „Fotky“ MUSÍ byť dátum, počet a
  odkaz.
- **FR-020**: V nedeľu MUSÍ úvodná obrazovka ukázať pripomienku fotiek.

**Nastavenie**

- **FR-021**: Apka MUSÍ uložiť nastavenie len v zariadení a umožniť ho preniesť odkazom.
- **FR-022**: Bez zápisu MUSÍ apka jasne ukázať režim len na čítanie a výsledky držať len v
  zariadení.

**Trénerov portál**

- **FR-023**: Portál MUSÍ overiť trénera menom a heslom (oddeleným od hesla klienta); bez
  nastaveného hesla trénera je portál vypnutý.
- **FR-024**: Portál MUSÍ ukázať prehľad progresu (cviky × týždne aktuálneho hárku) s grafom a
  históriou cviku, rannú váhu, fotky a poznámky klienta.
- **FR-025**: Tréner MUSÍ môcť upraviť PLANNED hodnoty, pridať cvik do voľného stĺpca a
  odstrániť cvik, ktorý klient ešte nezapísal; zápis sa odmietne pri konflikte.
- **FR-026**: Tréner MUSÍ môcť skopírovať deň do prázdneho dňa iného týždňa a naplánovať ďalší
  týždeň (s posunom dátumov, prípadne s pridaním nového bloku). *(Rozšírené v
  [002](../002-next-week-suggestions/spec.md): návrh ďalšieho týždňa podľa objemu.)*

### Key Entities

- **Tabuľka (spreadsheet)**: trénerova Google tabuľka; obsahuje hárky s plánom a záložky
  „Váha“, „Fotky“.
- **Hárok s plánom (blok)**: hárok, ktorý má v prvých riadkoch `WEEK 1`; aktuálny je prvý
  viditeľný, ostatné sú história.
- **Týždeň**: `WEEK n`, obsahuje dni.
- **Deň**: `DAY n`, má dátum, poznámku trénera, trvanie tréningu a plánované / vykonané RPE
  tréningu; obsahuje cviky.
- **Cvik**: názov (prípadne superset `A + B`), plán (série, váha, RPE, poznámka) a vykonanie
  (série, váha, RPE, poznámka klienta).
- **Ranná váha**: dátum + kg, najviac jedna na deň.
- **Fotky dňa**: dátum, počet fotiek, odkaz na priečinok na Drive.
- **Zápis vo fronte**: čakajúci zápis cviku / súhrnu / váhy s kľúčom, aby sa novší zápis toho
  istého nahradil.
- **Nastavenie**: odkaz na tabuľku, názov hárku, URL skriptu, heslo; len v zariadení.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Klient zapíše jeden cvik (s „Ako minule“ alebo rýchlou voľbou RPE) najviac
  tromi ťuknutiami po otvorení cviku.
- **SC-002**: Zapísané hodnoty sú v tabuľke do niekoľkých sekúnd pri pripojení; offline sa
  nestratí žiadny zápis ani po zatvorení apky.
- **SC-003**: Tréner nemusel kvôli apke zmeniť štruktúru tabuľky ani spôsob práce.
- **SC-004**: Apka sa po prvom načítaní otvorí aj bez signálu a ukáže plán.
- **SC-005**: Žiadny zápis klienta neprepísal PLANNED hodnotu a žiadny zápis trénera
  neprepísal EXECUTED hodnotu.

## Assumptions

- Jeden nasadený Apps Script = jedna tabuľka = jeden klient. Tréner s viacerými klientmi
  dostane od každého samostatný odkaz.
- Klient má v trénerovej tabuľke právo upravovať; skript beží pod jeho účtom.
- Tabuľka dodržiava trénerove rozloženie (bloky `WEEK`, riadky `DAY`, hlavičky `EXERCISE n`).
- Apka beží na GitHub Pages cez HTTPS; offline režim a inštalácia na plochu vyžadujú HTTPS.

## Známe medzery (podnet pre budúce špecifikácie)

Zistené pri spätnom popise; nie sú to chyby, ktoré treba hneď opraviť, ale kandidáti na
budúce zmeny:

- **Fotky nejdú cez offline frontu**: bez signálu odoslanie zlyhá a fotky ostanú len v
  otvorenej obrazovke (po zatvorení apky sa stratia). Čiastočne v rozpore s constitution III.
- **Súhrn v režime len na čítanie** sa uloží len v zariadení a nikam sa neprenesie.
- **Ranná váha** sa dá zapísať len za dnešok, nie spätne.
- **Progres v portáli** ukazuje len aktuálny hárok, nie staršie bloky (klientsky graf ich
  ukazuje).
- **Heslo klienta pri čítaní** ide v URL požiadavky na Apps Script (môže sa objaviť v logoch);
  zápisy ho posielajú v tele.
- **Žiadne automatické testy**: overuje sa ručne. Čisté funkcie (parsovanie plánu, dátumov,
  váh, porovnanie názvov cvikov) by sa dali otestovať bez build kroku.
- **Zdvojený kód**: parsovanie plánu a pomocné funkcie sú skopírované v `app.js` aj
  `coach.js`; zmena formátu tabuľky sa musí urobiť na oboch miestach.
