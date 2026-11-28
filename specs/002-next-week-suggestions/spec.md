# Feature Specification: Návrh ďalšieho týždňa

**Feature Branch**: `claude/funny-wright-hg586l`

**Created**: 2026-11-28

**Status**: Draft

**Input**: User description: "Aby trénerovi portál navrhoval, čo má zverenec mať ďalší týždeň,
a aby to jedným klikom vedel vložiť do svojej tabuľky. Návrhy podľa pravidiel (nie AI)."

**Nadväzuje na**: [001 baseline](../001-fitko-baseline/spec.md) – rozširuje FR-026
(„Naplánovať ďalší týždeň“), ostatné správanie portálu nemení.

## Ako to dnes funguje a čo sa zmení

Dnes tréner v portáli ťukne „Naplánovať ďalší týždeň“: skopíruje sa plán posledného týždňa
s rovnakými váhami a tréner potom pri každom cviku sám porovná, čo klient zvládol, a ručne
prepíše váhy. Pri 4 dňoch × 5–6 cvikoch je to 20+ rozhodnutí každý týždeň.

Po novom portál pri každom cviku **navrhne** série, váhu a RPE na ďalší týždeň podľa toho, čo
klient reálne odcvičil, **vysvetlí prečo** („všetky opakovania pri RPE 7 namiesto 8 → +2,5
kg“) a tréner návrh prijme, upraví alebo zamietne. Všetko potom jedným klikom vloží do
tabuľky.

## User Scenarios & Testing *(mandatory)*

### User Story 1 – Pozrieť návrh a vložiť ho jedným klikom (Priority: P1)

Tréner otvorí v portáli záložku Plán na poslednom naplánovanom týždni a ťukne „Navrhnúť ďalší
týždeň“. Zobrazí sa náhľad ďalšieho týždňa: pri každom cviku pôvodný plán, čo klient
odcvičil, návrh a krátky dôvod. Zmenené hodnoty sú zvýraznené. Tréner ťukne „Vložiť do
tabuľky“ a týždeň je naplánovaný.

**Why this priority**: Toto je jadro funkcie – ušetrí trénerovi väčšinu práce pri plánovaní.

**Independent Test**: Na testovacej tabuľke s jedným odcvičeným týždňom otvoriť návrh,
skontrolovať dôvody pri 3 cvikoch (zvýšiť / nechať / znížiť), vložiť a overiť v tabuľke nový
týždeň s navrhnutými hodnotami a dátumami posunutými o 7 dní.

**Acceptance Scenarios**:

1. **Given** posledný naplánovaný týždeň má zapísané výsledky klienta, **When** tréner ťukne
   „Navrhnúť ďalší týždeň“, **Then** do niekoľkých sekúnd vidí náhľad všetkých dní a cvikov
   ďalšieho týždňa s návrhom a dôvodom pri každom cviku; do tabuľky sa zatiaľ nič nezapíše.
2. **Given** náhľad návrhu, **When** sa zobrazí, **Then** pri každom cviku vidno: plán tohto
   týždňa, čo klient odcvičil (série, váha, RPE, poznámka), návrh (série, váha, RPE) a dôvod;
   hodnoty, ktoré sa líšia od tohto týždňa, sú zvýraznené a pri váhe je rozdiel („+2,5 kg“).
3. **Given** náhľad návrhu, **When** tréner ťukne „Vložiť do tabuľky“, **Then** ďalší týždeň sa
   vytvorí rovnako ako dnes pri „Naplánovať ďalší týždeň“ (najbližší prázdny týždeň, inak nový
   blok pod posledným; dátumy +7 dní), ale s navrhnutými hodnotami; po dokončení portál
   ukáže nový týždeň a hlášku, koľko cvikov sa zmenilo.
4. **Given** vkladanie prebieha, **When** niektorý zápis zlyhá, **Then** tréner vidí, ktoré
   cviky sa nevložili a prečo, a môže vkladanie zopakovať len pre ne; už vložené hodnoty sa
   neduplikujú.
5. **Given** tréner nechce návrhy, **When** použije doterajšie „Naplánovať ďalší týždeň“ (kópia
   bez zmien), **Then** funguje ako doteraz.

---

### User Story 2 – Upraviť alebo zamietnuť jednotlivé návrhy (Priority: P1)

Tréner nesúhlasí s každým návrhom. V náhľade môže pri ľubovoľnom cviku hodnoty prepísať
alebo návrh zamietnuť (ponechá sa plán tohto týždňa). Do tabuľky sa vloží presne to, čo
vidí.

**Why this priority**: Bez kontroly trénera by návrhy boli nepoužiteľné – rozhoduje vždy
tréner.

**Independent Test**: V náhľade prepísať váhu pri jednom cviku, zamietnuť druhý, vložiť a
overiť v tabuľke obe zmeny.

**Acceptance Scenarios**:

1. **Given** náhľad, **When** tréner prepíše série, váhu, RPE alebo poznámku pri cviku,
   **Then** cvik sa označí ako „upravené trénerom“ a vloží sa s jeho hodnotami.
2. **Given** náhľad, **When** tréner pri cviku ťukne „Ponechať“, **Then** vloží sa plán tohto
   týždňa bez zmeny.
3. **Given** náhľad, **When** tréner ťukne „Ponechať všetko“ alebo „Prijať všetko“, **Then**
   zmena sa aplikuje na všetky cviky naraz (okrem ručne upravených).
4. **Given** tréner rozpracoval úpravy, **When** omylom zavrie náhľad alebo obnoví stránku,
   **Then** úpravy sa nestratia, kým ich nevloží alebo nezahodí.

---

### User Story 3 – Nastaviť krok váhy pri cviku (Priority: P2)

Nie každý cvik sa dá zvýšiť o 2,5 kg (jednoručky po 2 kg, stroje po 5 kg, kladka po 1,25 kg).
Tréner môže pri cviku zmeniť krok zvýšenia; portál si ho zapamätá pre ďalšie návrhy toho
istého cviku.

**Why this priority**: Zlepší presnosť návrhov, ale predvolený krok stačí na začiatok.

**Independent Test**: Pri cviku zmeniť krok na 2 kg, vygenerovať návrh znova a overiť, že
zvýšenie je +2 kg; po obnovení stránky krok ostane.

**Acceptance Scenarios**:

1. **Given** náhľad, **When** tréner pri cviku zmení krok (napr. 1,25 / 2 / 2,5 / 5 kg),
   **Then** návrh tohto cviku sa hneď prepočíta.
2. **Given** tréner nastavil krok pri cviku, **When** neskôr generuje návrh ďalšieho týždňa
   (aj z iného zariadenia), **Then** použije sa uložený krok.

### Pravidlá progresie

Návrh pre každý cvik sa určuje z **posledného odcvičenia tohto cviku** (aj z predošlého
týždňa, ak tento týždeň chýba) v porovnaní s jeho plánom. Prvé pravidlo, ktoré platí, vyhrá:

| # | Situácia | Návrh | Príklad dôvodu |
|---|---|---|---|
| R1 | Cvik nemá žiadny zápis klienta | ponechať plán | „Bez zápisu – ponechané“ |
| R2 | Váha v pláne je „podľa seba“ (`CHOOSE`) | ponechať `CHOOSE` | „Váha podľa seba, minule 40 kg“ |
| R3 | Klient nezvládol plánované opakovania (menej ako spodná hranica) alebo RPE 10 | **znížiť** váhu o krok, ak sa to stalo 2× po sebe; inak ponechať | „2× po sebe nezvládnuté opakovania → −2,5 kg“ |
| R4 | Rozsah opakovaní (napr. `2x8-10`) a klient nedosiahol hornú hranicu | ponechať váhu | „8 z 8–10 opak. → najprv viac opakovaní“ |
| R5 | Zvládnuté opakovania (horná hranica, „Ok“), RPE **nižšie** ako plán aspoň o 1 | **zvýšiť** o 2 kroky | „Všetky opak. pri RPE 6,5 (plán 8) → +5 kg“ |
| R6 | Zvládnuté opakovania, RPE nižšie ako plán alebo v pláne (alebo RPE nezapísané) | **zvýšiť** o krok | „Všetky opak. pri RPE 7,5 (plán 8) → +2,5 kg“ |
| R7 | Zvládnuté opakovania, RPE vyššie ako plán | ponechať | „RPE 9 nad plánom 8 → ponechané“ |

Doplňujúce pravidlá:

- Základom pre zmenu váhy je **odcvičená** váha (nie plánovaná); ak klient odcvičil viac ako
  plán, ide sa od jeho váhy.
- Pri RPE v rozsahu (`7-8`) sa „v pláne“ rozumie celý rozsah; „nižšie“ = pod spodnou hranicou.
- Série a plánované RPE sa preberajú z plánu tohto týždňa bez zmeny; mení sa len váha.
  Poznámka trénera k cviku sa prenesie.
- **Superset** (`A + B`): pravidlá sa použijú pre každú časť zvlášť a výsledok sa spojí
  v tvare tabuľky („45 a 12“).
- Ak sa hodnoty nedajú prečítať (text namiesto čísla), cvik sa ponechá s dôvodom „Nedá sa
  vyhodnotiť – skontroluj“ a označí sa na kontrolu.
- Keď klient napísal k cviku poznámku, zobrazí sa pri návrhu výrazne (napr. „bolelo
  rameno“) – pravidlá ju nevyhodnocujú, rozhodne tréner.

### Edge Cases

- Klient tento týždeň nejaký deň vynechal → cviky tohto dňa sa vyhodnotia podľa posledného
  odcvičenia (aj z predošlého týždňa); ak nie je žiadne, platí R1.
- Klient zapísal výsledky len čiastočne (váha bez sérií) → vyhodnotí sa, čo sa dá; chýbajúce
  série sa berú ako „podľa plánu“ len keď je zapísané „Ok“, inak sa cvik označí na kontrolu.
- Klient zapísal výsledok práve počas prezerania návrhu → pred vložením portál načíta
  aktuálne dáta; ak sa zmenili, upozorní a ponúkne prepočítať návrh.
- Ďalší týždeň už nie je prázdny (tréner ho medzitým začal plniť) → návrh sa ponúkne len pre
  prázdne dni a cviky; existujúce hodnoty trénera sa neprepíšu.
- Znížením by váha klesla na 0 alebo menej → ponechá sa pôvodná a cvik sa označí na kontrolu.
- Váhy v pláne ako rozsah („40-45“) → zvyšuje sa celý rozsah o krok („42,5-47,5“).
- Jednostranné cviky a iné textové doplnky v sériách (`BOTH`, `/strana`) → zachovajú sa bez
  zmeny.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Portál MUSÍ na poslednom naplánovanom týždni ponúknuť akciu „Navrhnúť ďalší
  týždeň“ popri existujúcej kópii bez zmien.
- **FR-002**: Portál MUSÍ pre každý cvik ďalšieho týždňa vypočítať návrh váhy podľa pravidiel
  R1–R7 a doplňujúcich pravidiel a uviesť zrozumiteľný dôvod po slovensky.
- **FR-003**: Náhľad MUSÍ zobraziť pri každom cviku plán tohto týždňa, odcvičené hodnoty
  vrátane poznámky klienta, návrh, rozdiel a dôvod; zmenené hodnoty a cviky na kontrolu
  MUSIA byť vizuálne odlíšené.
- **FR-004**: Tréner MUSÍ môcť pri každom cviku návrh prijať, prepísať alebo zamietnuť
  (ponechať plán), aj hromadne pre všetky cviky.
- **FR-005**: Rozpracované úpravy náhľadu MUSIA prežiť zatvorenie náhľadu aj obnovenie
  stránky, kým ich tréner nevloží alebo nezahodí.
- **FR-006**: Akcia „Vložiť do tabuľky“ MUSÍ vytvoriť ďalší týždeň rovnakým spôsobom ako
  doterajšie plánovanie (FR-026 baseline) a zapísať doň hodnoty z náhľadu.
- **FR-007**: Vkladanie MUSÍ zapisovať len PLANNED hodnoty a NESMIE prepísať existujúce
  hodnoty trénera ani klienta v cieľovom týždni.
- **FR-008**: Pri čiastočnom zlyhaní vkladania MUSÍ portál ukázať, čo sa nevložilo, a
  umožniť opakovať len chýbajúce časti.
- **FR-009**: Pred vložením MUSÍ portál overiť, že sa dáta v tabuľke medzitým nezmenili; ak
  áno, upozorniť a ponúknuť prepočítanie.
- **FR-010**: Tréner MUSÍ môcť pri cviku nastaviť krok zmeny váhy (predvolene 2,5 kg); krok
  sa MUSÍ uložiť do trénerovej tabuľky (samostatná záložka, constitution I) a použiť pri
  ďalších návrhoch toho istého cviku na ľubovoľnom zariadení.
- **FR-011**: Výpočet návrhu NESMIE vyžadovať pripojenie na iné služby okrem existujúceho
  Apps Scriptu (constitution IV).

### Key Entities

- **Návrh týždňa**: zdrojový týždeň, cieľový týždeň, zoznam návrhov cvikov, čas vytvorenia;
  existuje len v portáli, kým sa nevloží.
- **Návrh cviku**: deň, cvik, pôvodný plán, odcvičené hodnoty, navrhnuté hodnoty, použité
  pravidlo, dôvod, stav (navrhnuté / upravené trénerom / ponechané / na kontrolu).
- **Krok cviku**: názov cviku (tolerantné porovnanie ako pri „Minule“) a krok v kg; uložené v
  záložke tabuľky, napr. „Fitko nastavenia“.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Tréner naplánuje ďalší týždeň (4 dni × 6 cvikov) vrátane kontroly návrhov do 2
  minút, oproti ručnému prepisovaniu každého cviku.
- **SC-002**: Po 4 týždňoch používania tréner prijme aspoň 70 % návrhov bez úpravy.
- **SC-003**: Pri každom návrhu tréner do 5 sekúnd pochopí z dôvodu, prečo bol navrhnutý.
- **SC-004**: Žiadne vloženie neprepíše hodnotu, ktorú do cieľového týždňa už zapísal tréner
  alebo klient.

## Assumptions

- Pravidlá R1–R7 vychádzajú z bežnej „dvojitej progresie“ s RPE; sú navrhnuté tak, aby boli
  konzervatívne (radšej ponechať ako zvýšiť príliš). Pred nasadením je vhodné ukázať tabuľku
  pravidiel trénerovi a doladiť ich podľa neho – zmena pravidla je malá zmena.
- Predvolený krok 2,5 kg; pravidlo R5 (2 kroky) len pri RPE nižšom aspoň o 1 bod.
- Návrh mení iba váhu; zmeny sérií, opakovaní, výmena cvikov a deload týždne sú mimo rozsahu
  (môžu prísť vo funkcii D).
- Funkcia je len v trénerovom portáli; klientska apka sa nemení (okrem toho, že uvidí nový
  týždeň ako doteraz).
- Zatiaľ jeden klient (jedna tabuľka) – viac klientov rieši funkcia E.
- Na novú záložku s nastaveniami a hromadné vkladanie bude treba aktualizovať Apps Script;
  starší skript ostane funkčný pre doterajšie funkcie a portál ukáže, že treba aktualizovať.
