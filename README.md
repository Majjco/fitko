# Fitko 💪

Mobilná apka (PWA) na tréning vo fitku. **Tréner ďalej píše plán do svojej Google tabuľky
presne ako doteraz** – apka si ho z nej načíta a zobrazí pekne, s veľkými tlačidlami.
Tvoje výsledky (série, váha, RPE, poznámka) vie zapisovať späť do stĺpcov **EXECUTED**,
takže ich tréner vidí v tabuľke ako predtým.

## Čo apka vie

Vzhľad „Volt“ – tmavá športová apka s výraznými číslami, funguje aj bez signálu (vrátane písma).
V **Nastaveniach → Vzhľad** sa dá prepnúť na **Matrix** (čierna, zelený „terminál“ a padajúci kód
v pozadí); voľba platí len v danom telefóne. Dole tri obrazovky: **Dnes · Týždeň · Progres**.

- **Dnes**: karta dnešného tréningu s tlačidlom **Začať tréning** (alebo „Dnes voľno“ a najbližší
  tréning), ranná váha na jedno ťuknutie (predvyplnená poslednou, ± 0,1 kg), pás dní týždňa,
  séria týždňov v rade a **proaktívne tipy** – tréner pridal váhu, minule nezvládnuté opakovania,
  dni bez tréningu, nedeľné fotky.
- **Tréning po sériách**: pri cviku plán od trénera a minulý výkon pod sebou, tip, poznámka trénera.
  Každá séria má veľké ovládače váhy a opakovaní (predvyplnené plánom); **Séria hotová** ju uloží a
  **spustí pauzu** (z poznámky trénera, napr. „pauza 2 min“, inak 90 s) s odpočtom, +30 s,
  vibráciou a zvukom na konci. Po poslednej sérii RPE a poznámka → **Uložiť cvik**. Do tabuľky sa
  zapíše v doterajšom tvare (`3x10` alebo `10, 9, 8`, váha, RPE). **Osobný rekord** sa ohlási hneď.
  Rozpracovaný tréning prežije zatvorenie apky. Supersety a „Ok“ cez **rýchly zápis** celého cviku.
- **Súhrn po tréningu**: čas, počet sérií, rekordy, objem pri každom cviku (série × opakovania × kg)
  so zmenou oproti minule; zapíše `WORKOUT TIME` a `SESH RPE`.
- **Týždeň**: plán týždňa po dňoch, prepínanie týždňov, ľubovoľný deň sa dá otvoriť a zapísať.
- **Progres**: cviky s mini grafom a trendom, detail cviku (rekord, graf aj zo starších blokov),
  ranná váha, fotky progresu.
- **Ranná váha** sa ukladá do záložky **„Váha“** a **fotky progresu** na **tvoj Google Drive**
  (zdieľané len s vlastníkom tabuľky, záložka **„Fotky“**).
- Funguje **offline** – zápisy počkajú a odošlú sa neskôr. Dá sa pridať na plochu ako appka.

## Trénerov panel (voliteľný)

Na adrese `trener.html` je panel pre trénera nad **tými istými tabuľkami** – čo v ňom zmení, je hneď
v tabuľke klienta a naopak, takže môže kľudne ďalej používať aj Excel.

- **Moji klienti** – karty klientov: koľko tréningov tento týždeň odcvičil, kedy naposledy, ranná váha
  a upozornenia (cviky klesajú / stagnujú, rastie únava, nové poznámky, dni bez tréningu).
  Kto potrebuje pozornosť, je prvý.
- **Panel klienta – jedna plocha ako v Exceli**: riadky = cviky po dňoch, stĺpce = týždne bloku.
  V bunke váha, série × opakovania, RPE a **objem cviku** (série × opakovania × kg) so zmenou oproti
  minulému týždňu. Pri cviku trend bloku (↑ ide hore / → stagnuje / ↓ klesá, únava), poznámky klienta
  aj trénera na klik, klik na cvik = graf váhy a objemu aj zo starších blokov.
- Hore **súhrn**: tréningy tento týždeň, ranná váha s vývojom, fotky progresu (detail v bočnom paneli).
- **+ Pridať týždeň** – vedľa posledného týždňa pribudne nový stĺpec predvyplnený návrhom
  (+5 % objemu, ak klient cvik zvládol a RPE nebolo nad plánom; pri vysokom RPE ponechá, pri
  2× nezvládnutých opakovaniach zníži váhu) alebo kópiou. Tréner prepisuje čísla, pridá alebo
  vynechá cvik a **Odoslať klientovi** zapíše celý týždeň do tabuľky (dátumy +7 dní).
  Rozpracovaný týždeň ostane uložený v prehliadači. Cieľ % a krok váhy pri cviku sa ukladajú do
  záložky „Fitko nastavenia“. Pravidlá: [`specs/002-next-week-suggestions/spec.md`](specs/002-next-week-suggestions/spec.md),
  panel: [`specs/003-coach-panel/spec.md`](specs/003-coach-panel/spec.md).
- Svetlé bunky (plán, ktorý klient ešte necvičil) sa dajú upraviť priamo kliknutím.

**Pridanie klienta:** klient v apke dá *Nastavenia → Skopírovať odkaz pre trénera* a pošle ho
trénerovi. Tréner ho otvorí, prvýkrát sa prihlási (meno a heslo trénera) a klient pribudne do
zoznamu. V `Code.gs` každého klienta musia byť nastavené `COACH_USER` a `COACH_PASS` – keď sú
u všetkých klientov rovnaké, tréner sa prihlasuje len raz. Tréner smie meniť len PLANNED stĺpce;
cvik, ktorý už klient zapísal, sa nedá odstrániť.

## Ako to funguje

```
Tréner ──píše──▶ Google tabuľka ◀──číta (verejný odkaz)── Fitko apka
                       ▲                                       │
                       └──── Apps Script (tvoj účet) ◀──zápis──┘
```

- **Čítanie** funguje hneď – stačí, že je tabuľka zdieľaná „Ktokoľvek s odkazom“.
- **Zápis** potrebuje malý Google Apps Script (zadarmo, 5 minút nastavovania, viď nižšie).
  Skript beží pod tvojím Google účtom a zapisuje **iba** do EXECUTED stĺpcov.
  Trénerove PLANNED stĺpce nikdy nemení a ak tréner medzitým cvik prepíše, zápis odmietne.

Apka očakáva rozloženie hárku, aké tréner používa: bloky `WEEK n`, riadky `DAY 1–7`
a cviky po 9 stĺpcoch (názov, PLANNED série/váha/RPE/poznámka, EXECUTED série/váha/RPE/poznámka).
Polohu stĺpcov si zisťuje z hlavičiek `EXERCISE 1, 2…`, `DATE`, `NOTES`, `WORKOUT TIME`, `SESH RPE`,
takže zvládne aj staršie bloky s inými stĺpcami.

## 1. Spustenie apky (GitHub Pages)

1. Nahraj tento priečinok do GitHub repozitára.
2. V repozitári: **Settings → Pages → Source: Deploy from a branch → `main` / root**.
3. Po minúte bude apka na `https://<tvoj-github>.github.io/<repo>/`.
4. Otvor ju v mobile, vlož odkaz na tabuľku a názov hárku (napr. `COMEBACK NOV`).
5. Pridaj si ju na plochu.

V kóde nie je uložený žiadny odkaz ani heslo – všetko sa zadáva v nastaveniach apky
a ostáva len v tvojom telefóne.

Lokálne sa dá spustiť napr. `python3 -m http.server` v tomto priečinku.

## 2. Zápis do tabuľky (voliteľné)

Potrebuješ mať v trénerovej tabuľke **právo upravovať** (to už máš, keď tam píšeš EXECUTED).

1. Choď na <https://script.google.com> → **Nový projekt**.
   (Samostatný projekt – do trénerovej tabuľky sa nič nepridáva.)
2. Zmaž obsah `Code.gs` a vlož obsah súboru [`apps-script/Code.gs`](apps-script/Code.gs).
3. Hore v súbore vyplň:
   - `SPREADSHEET_ID` – časť odkazu na tabuľku medzi `/d/` a `/edit`
   - `TOKEN` – vymysli si heslo (napr. 20 náhodných znakov)
4. **Nasadiť → Nové nasadenie → typ: Webová aplikácia**
   - Spustiť ako: **Ja**
   - Kto má prístup: **Ktokoľvek**
5. Klikni **Nasadiť**, povoľ prístup (pri varovaní *Rozšírené → Prejsť na projekt*).
6. Skopíruj URL končiacu na `/exec`.
7. V apke: **Nastavenia → URL Apps Script** + **Heslo** (TOKEN) → Uložiť.

**Fotky progresu** potrebujú navyše prístup ku Google Drive: v editore vyber funkciu
`povolitDrive`, klikni **Run** a v okne s povoleniami **zaškrtni „Select all“** (políčka nemusia
byť predvolene zaškrtnuté). Ak beh skončí chybou „Nemáte povolenie…“, odstráň prístup aplikácie
Fitko na <https://myaccount.google.com/connections> a povoľ znova so všetkými políčkami.

Keď skript neskôr upravíš (napr. nová verzia z tohto repozitára): vlož nový kód, ulož a
*Nasadiť → Spravovať nasadenia → ✏️ upraviť → Verzia: Nová → Nasadiť*. URL sa nezmení.

So zapnutým zápisom si apka nájde aktuálny hárok sama (prvý viditeľný hárok s `WEEK 1`),
takže keď tréner založí nový blok a starý skryje, netreba nič meniť.

### Prenos nastavení na iný mobil

V nastaveniach je tlačidlo **Skopírovať odkaz na nastavenie** – odkaz obsahuje aj heslo,
takže ho posielaj len sebe.

## Súbory

| Súbor | Čo robí |
|---|---|
| `index.html`, `app.css`, `app.js`, `fonts/` | klientska apka (bez build kroku, čistý JS; písmo Barlow Condensed, licencia OFL v `fonts/OFL.txt`) |
| `calc.js` | výpočet objemu a návrh progresie – spoločný pre apku aj portál |
| `trener.html`, `styles.css`, `coach.js`, `coach.css` | trénerov panel |
| `tests/` | testy výpočtov: `node --test tests/*.test.js`; `tests/e2e/` – testy v prehliadači s podvrhnutým Apps Scriptom (Playwright, `python3 -m http.server 8765` v koreni repa) |
| `specs/`, `.specify/` | špecifikácie (spec-driven development cez GitHub Spec Kit) |
| `sw.js`, `manifest.webmanifest`, `icons/` | offline režim a inštalácia na plochu |
| `apps-script/Code.gs` | skript pre zápis do Google tabuľky |
