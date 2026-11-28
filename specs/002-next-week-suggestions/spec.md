# Feature Specification: Návrh ďalšieho týždňa (progresívne preťaženie podľa objemu)

**Feature Branch**: `claude/funny-wright-hg586l`

**Created**: 2026-11-28

**Status**: Draft (v2 – doplnený objem a cieľové % rastu)

**Input**: User description: "Aby trénerovi portál navrhoval, čo má zverenec mať ďalší týždeň,
a aby to jedným klikom vedel vložiť do svojej tabuľky. Návrhy podľa pravidiel (nie AI).
Pre každý cvik rátať celkový objem (váha × opakovania × série) a navrhovať progresívne
preťaženie, napr. +5 % objemu."

**Nadväzuje na**: [001 baseline](../001-fitko-baseline/spec.md) – rozširuje FR-026
(„Naplánovať ďalší týždeň“) a súhrn tréningu (FR-010), ostatné správanie nemení.

## Ako to dnes funguje a čo sa zmení

Dnes tréner v portáli ťukne „Naplánovať ďalší týždeň“: skopíruje sa plán posledného týždňa
s rovnakými váhami a tréner potom pri každom cviku sám porovná, čo klient zvládol, a ručne
prepíše váhy. Pri 4 dňoch × 5–6 cvikoch je to 20+ rozhodnutí každý týždeň.

Po novom:

1. Pri každom cviku sa počíta **objem** = súčet (opakovania × váha) cez všetky série.
   Príklad: 2×10 × 50 kg = 1 000 kg; 3×10 × 45 kg = 1 350 kg.
2. Portál **navrhne** ďalší týždeň tak, aby objem každého cviku stúpol o cieľové percento
   (predvolene **5 %**), ak to výkon klienta dovoľuje, a **vysvetlí prečo**.
3. Tréner návrh prijme, upraví alebo zamietne a jedným klikom ho vloží do tabuľky.

## User Scenarios & Testing *(mandatory)*

### User Story 1 – Pozrieť návrh a vložiť ho jedným klikom (Priority: P1)

Tréner otvorí v portáli záložku Plán na poslednom naplánovanom týždni a ťukne „Navrhnúť ďalší
týždeň“. Zobrazí sa náhľad ďalšieho týždňa: pri každom cviku čo klient odcvičil a jeho
objem, návrh a jeho objem s percentom zmeny a krátky dôvod. Tréner ťukne „Vložiť do tabuľky“
a týždeň je naplánovaný.

**Why this priority**: Jadro funkcie – ušetrí trénerovi väčšinu práce pri plánovaní.

**Independent Test**: Na testovacej tabuľke s jedným odcvičeným týždňom otvoriť návrh,
skontrolovať 3 cviky (zvýšiť / ponechať / znížiť), vložiť a overiť v tabuľke nový týždeň
s navrhnutými hodnotami a dátumami posunutými o 7 dní.

**Acceptance Scenarios**:

1. **Given** posledný naplánovaný týždeň má zapísané výsledky klienta, **When** tréner ťukne
   „Navrhnúť ďalší týždeň“, **Then** do niekoľkých sekúnd vidí náhľad všetkých dní a cvikov
   s návrhom a dôvodom; do tabuľky sa zatiaľ nič nezapíše.
2. **Given** náhľad, **When** sa zobrazí, **Then** pri každom cviku vidno: plán tohto týždňa,
   odcvičené hodnoty (série, váha, RPE, poznámka klienta) a ich objem, návrh (série, váha,
   RPE) a jeho objem so zmenou v % a dôvod; zmenené hodnoty sú zvýraznené.
3. **Given** náhľad, **When** tréner ťukne „Vložiť do tabuľky“, **Then** ďalší týždeň sa
   vytvorí rovnako ako dnes pri „Naplánovať ďalší týždeň“ (najbližší prázdny týždeň, inak nový
   blok pod posledným; dátumy +7 dní), ale s hodnotami z náhľadu; portál potom ukáže nový
   týždeň a hlášku, koľko cvikov sa zmenilo.
4. **Given** vkladanie prebieha, **When** niektorý zápis zlyhá, **Then** tréner vidí, ktoré
   cviky sa nevložili a prečo, a môže vkladanie zopakovať len pre ne.
5. **Given** tréner nechce návrhy, **When** použije doterajšie „Naplánovať ďalší týždeň“ (kópia
   bez zmien), **Then** funguje ako doteraz.

---

### User Story 2 – Upraviť, vybrať alternatívu alebo zamietnuť (Priority: P1)

Tréner nesúhlasí s každým návrhom. Pri cviku môže vybrať jednu z alternatív (napr. „+2,5 kg“
/ „+1 opakovanie“ / „+1 séria“), hodnoty prepísať alebo návrh zamietnuť (ponechá sa plán
tohto týždňa). Do tabuľky sa vloží presne to, čo vidí.

**Why this priority**: Rozhoduje vždy tréner; bez kontroly by návrhy boli nepoužiteľné.

**Independent Test**: V náhľade vybrať alternatívu pri jednom cviku, prepísať váhu pri
druhom, zamietnuť tretí, vložiť a overiť v tabuľke všetky tri.

**Acceptance Scenarios**:

1. **Given** náhľad, **When** tréner ťukne na alternatívu, **Then** návrh cviku sa nahradí
   alternatívou a objem s % sa prepočíta.
2. **Given** náhľad, **When** tréner prepíše série, váhu, RPE alebo poznámku, **Then** cvik sa
   označí ako „upravené trénerom“, objem sa prepočíta a vloží sa s jeho hodnotami.
3. **Given** náhľad, **When** tréner pri cviku ťukne „Ponechať“, **Then** vloží sa plán tohto
   týždňa bez zmeny.
4. **Given** náhľad, **When** tréner ťukne „Ponechať všetko“ alebo „Prijať všetky návrhy“,
   **Then** zmena sa aplikuje na všetky cviky okrem ručne upravených.
5. **Given** tréner rozpracoval úpravy, **When** zavrie náhľad alebo obnoví stránku, **Then**
   úpravy sa nestratia, kým ich nevloží alebo nezahodí.

---

### User Story 3 – Nastaviť cieľový rast a krok váhy (Priority: P2)

Tréner nastaví, o koľko % má objem rásť (predvolene 5 %), a pri cviku krok váhy (jednoručky
po 2 kg, stroje po 5 kg, kladka po 1,25 kg). Portál si nastavenia zapamätá.

**Why this priority**: Zlepší presnosť návrhov; predvolené hodnoty stačia na začiatok.

**Independent Test**: Zmeniť cieľ na 10 % a krok cviku na 2 kg, overiť prepočítaný návrh;
po obnovení stránky (aj na inom zariadení) nastavenia ostanú.

**Acceptance Scenarios**:

1. **Given** náhľad, **When** tréner zmení cieľový rast (napr. 0–15 %), **Then** všetky návrhy
   sa hneď prepočítajú.
2. **Given** náhľad, **When** tréner pri cviku zmení krok, **Then** návrh tohto cviku sa hneď
   prepočíta.
3. **Given** tréner zmenil nastavenia, **When** neskôr generuje návrh (aj z iného zariadenia),
   **Then** použijú sa uložené nastavenia.

---

### User Story 4 – Objem vidno všade, kde sa porovnáva výkon (Priority: P2)

Klient po tréningu vidí v súhrne objem každého cviku a zmenu oproti minule. Tréner v prehľade
progresu prepína medzi zobrazením váhy a objemu.

**Why this priority**: Objem je nová hlavná miera záťaže – má byť vidieť nielen pri
plánovaní.

**Independent Test**: Zapísať cvik s vyšším objemom ako minule a overiť percento v súhrne;
v portáli prepnúť Progres na objem a overiť hodnoty a trend.

**Acceptance Scenarios**:

1. **Given** klient dokončí tréning, **When** sa zobrazí súhrn, **Then** pri každom zapísanom
   cviku vidí objem a zmenu oproti minule v % a v hlavičke súhrnu celkový objem tréningu.
2. **Given** záložka Progres v portáli, **When** tréner prepne na „Objem“, **Then** bunky
   ukazujú objem cviku v danom týždni, farba a trend sa počítajú z objemu.

### Výpočet objemu

- **Objem cviku** = súčet cez série (opakovania × váha). `2x10` pri 50 kg = 1 000 kg;
  `10, 9, 8` pri 40 kg = 1 080 kg; `2x10 + 1x8` sa sčíta.
- „Ok“ v sériách = odcvičené podľa plánu; pri rozsahu (`3x8-10`) sa počíta spodná hranica.
- **Superset** (`A + B`): objem každej časti zvlášť (hodnoty oddelené „ a “).
- Cvik bez číselnej váhy (vlastná váha, „podľa seba“ bez zapísanej váhy): objem = počet
  opakovaní (zobrazí sa ako „opak.“, nie „kg“).
- Textové doplnky v sériách (`BOTH`, `/strana`) sa pri výpočte ignorujú a pri návrhu
  zachovajú.

### Pravidlá progresie

Návrh sa určuje pre každý cvik (pri supersete pre každú časť) z **posledného odcvičenia**
(aj z predošlého týždňa, ak tento týždeň chýba). Prvé pravidlo, ktoré platí, vyhrá:

| # | Situácia | Cieľ objemu | Príklad dôvodu |
|---|---|---|---|
| R1 | Cvik nemá žiadny zápis klienta | ponechať plán | „Bez zápisu – ponechané“ |
| R2 | Váha v pláne je „podľa seba“ (`CHOOSE`) | ponechať plán | „Váha podľa seba; minule 40 kg, objem 800 kg“ |
| R3 | Nezvládnuté opakovania (pod spodnou hranicou) alebo RPE 10 | 2× po sebe → **−1 krok váhy**; inak ponechať | „2× po sebe nezvládnuté → −2,5 kg“ |
| R4 | RPE vyššie ako plán | ponechať plán | „RPE 9 nad plánom 8 → ponechané“ |
| R5 | Zvládnuté a RPE nižšie ako plán aspoň o 1 | **+2× cieľ** (pri 5 % → +10 %) | „Ľahké (RPE 6,5 pri pláne 8) → +10 % objemu“ |
| R6 | Zvládnuté (RPE v pláne, mierne pod ním alebo nezapísané) | **+cieľ** (5 %) | „Splnené pri RPE 8 → +5 % objemu“ |

Pri RPE v rozsahu (`7-8`) „v pláne“ znamená celý rozsah; „nižšie“ = pod spodnou hranicou.

**Ako sa dosiahne cieľ objemu (R5, R6):**

1. Hľadajú sa kombinácie s rovnakým počtom sérií ako v pláne: váha = odcvičená váha + 0, 1
   alebo 2 kroky; opakovania v rozsahu plánu (pri pevnom počte len ten), pri nezvýšenej váhe
   nie menej, ako klient odcvičil.
2. Návrh = **najmenší objem, ktorý dosiahne cieľ** (najmiernejšie zvýšenie, ktoré stačí).
3. Ak taká kombinácia neexistuje alebo by zvýšenie bolo viac ako dvojnásobok cieľa (napr. pri
   ľahkej váhe je krok 2,5 kg = +12,5 %), cvik sa **ponechá a označí na kontrolu** a tréner
   dostane alternatívy.
4. **Alternatívy** (vždy ponúknuté, ak dávajú zmysel): ďalšie najbližšie kombinácie z bodu 1,
   „+1 opakovanie“ (aj mimo rozsahu) a „+1 séria“ – každá s objemom a % zmeny.

Ďalšie pravidlá:

- Základom je **odcvičená** váha a opakovania (nie plánované).
- Plánované RPE a poznámka trénera sa preberajú z plánu tohto týždňa.
- Ak sa hodnoty nedajú prečítať, cvik sa ponechá s dôvodom „Nedá sa vyhodnotiť – skontroluj“.
- Poznámka klienta k cviku (napr. „bolelo rameno“) sa pri návrhu zobrazí výrazne; pravidlá ju
  nevyhodnocujú, rozhodne tréner.
- Znížením by váha klesla na 0 alebo menej → ponechať a označiť na kontrolu.
- Váha v pláne ako rozsah (`40-45`) → posúva sa celý rozsah.
- Desatinný oddeľovač váhy sa zachová podľa tabuľky (`47,5` alebo `47.5`).

### Edge Cases

- Klient tento týždeň deň vynechal → cviky sa vyhodnotia podľa posledného odcvičenia v bloku;
  ak nie je žiadne, platí R1.
- Klient zapísal výsledky len čiastočne (váha bez sérií, nie „Ok“) → cvik sa ponechá a označí
  na kontrolu.
- Klient zapíše výsledok počas prezerania návrhu → pred vložením portál načíta aktuálne dáta;
  ak sa zmenili, upozorní a ponúkne prepočítať.
- Ďalší týždeň už tréner začal plniť → použije sa najbližší úplne prázdny týždeň, inak nový
  blok (rovnako ako doterajšia kópia); vyplnené hodnoty sa neprepíšu.
- Nerovnomerné série (`10, 9, 8`) → pri návrhu sa vychádza z najnižšieho počtu opakovaní.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Portál MUSÍ na poslednom naplánovanom týždni ponúknuť akciu „Navrhnúť ďalší
  týždeň“ popri existujúcej kópii bez zmien.
- **FR-002**: Systém MUSÍ počítať objem cviku podľa sekcie „Výpočet objemu“, rovnako
  v portáli aj v klientskej apke.
- **FR-003**: Portál MUSÍ pre každý cvik vypočítať návrh podľa pravidiel R1–R6 a postupu
  dosiahnutia cieľa, s dôvodom po slovensky a s alternatívami.
- **FR-004**: Náhľad MUSÍ pri každom cviku zobraziť plán, odcvičené hodnoty s poznámkou
  klienta a objemom, návrh s objemom a % zmeny, dôvod a alternatívy; zmenené cviky a cviky
  na kontrolu MUSIA byť vizuálne odlíšené.
- **FR-005**: Tréner MUSÍ môcť pri každom cviku návrh prijať, vybrať alternatívu, prepísať
  alebo zamietnuť, aj hromadne.
- **FR-006**: Rozpracované úpravy MUSIA prežiť zatvorenie náhľadu aj obnovenie stránky.
- **FR-007**: „Vložiť do tabuľky“ MUSÍ vytvoriť ďalší týždeň ako doterajšie plánovanie
  (FR-026 baseline) a zapísať doň hodnoty z náhľadu – len PLANNED hodnoty, bez prepísania
  existujúcich hodnôt trénera alebo klienta.
- **FR-008**: Pri čiastočnom zlyhaní MUSÍ portál ukázať, čo sa nevložilo, a umožniť opakovať
  len chýbajúce časti.
- **FR-009**: Pred vložením MUSÍ portál overiť, či sa výsledky klienta medzitým nezmenili, a
  ak áno, upozorniť a ponúknuť prepočítanie.
- **FR-010**: Tréner MUSÍ môcť nastaviť cieľový rast objemu (predvolene 5 %) a krok váhy pri
  cviku (predvolene 2,5 kg); nastavenia sa MUSIA uložiť do trénerovej tabuľky (samostatná
  záložka, constitution I) a platiť na každom zariadení.
- **FR-011**: Súhrn tréningu v klientskej apke MUSÍ ukázať objem každého cviku so zmenou oproti
  minule a celkový objem tréningu.
- **FR-012**: Prehľad progresu v portáli MUSÍ umožniť prepnúť zobrazenie medzi váhou a
  objemom.
- **FR-013**: Výpočty NESMÚ vyžadovať iné služby okrem existujúceho Apps Scriptu
  (constitution IV).

### Key Entities

- **Objem**: číslo v kg (alebo počet opakovaní pri cviku bez váhy) pre jeden cvik (časť
  supersetu) v jeden deň.
- **Návrh týždňa**: zdrojový týždeň, cieľový rast, návrhy cvikov; existuje len v portáli, kým
  sa nevloží.
- **Návrh cviku**: deň, cvik, plán, odcvičené hodnoty a objem, navrhnuté hodnoty a objem,
  pravidlo, dôvod, alternatívy, stav (navrhnuté / alternatíva / upravené / ponechané / na
  kontrolu).
- **Nastavenia progresie**: cieľový rast v % a kroky váhy pre cviky; v záložke „Fitko
  nastavenia“.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Tréner naplánuje ďalší týždeň (4 dni × 6 cvikov) vrátane kontroly návrhov do 2
  minút.
- **SC-002**: Po 4 týždňoch používania tréner prijme aspoň 70 % návrhov bez úpravy.
- **SC-003**: Pri každom návrhu tréner do 5 sekúnd pochopí z dôvodu a objemu, prečo bol
  navrhnutý.
- **SC-004**: Žiadne vloženie neprepíše hodnotu, ktorú do cieľového týždňa už zapísal tréner
  alebo klient.
- **SC-005**: Objem v klientskej apke a v portáli je pre ten istý zápis vždy rovnaký.

## Assumptions

- Pravidlá sú konzervatívne (pri vysokom RPE alebo nezvládnutí sa objem nezvyšuje). Pred
  nasadením je vhodné ukázať ich trénerovi; zmena pravidla alebo percenta je malá zmena.
- Trvalé zvyšovanie o 5 % týždenne nie je udržateľné donekonečna; deload a periodizáciu rieši
  tréner (prípadne funkcia D). Cieľ 0 % = udržiavanie.
- Pri jednostranných cvikoch (`BOTH`) sa objem počíta raz; porovnanie týždňov je tak stále
  korektné.
- Historické hárky (staršie bloky) sa pre návrh nepoužívajú – stačí aktuálny blok.
- Zatiaľ jeden klient (jedna tabuľka); viac klientov rieši funkcia E.
- Treba aktualizovať Apps Script (nastavenia, hromadné vloženie); so starším skriptom ostanú
  doterajšie funkcie funkčné a portál ukáže, že treba aktualizovať.
