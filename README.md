# Fitko 💪

Mobilná apka (PWA) na tréning vo fitku. **Tréner ďalej píše plán do svojej Google tabuľky
presne ako doteraz** – apka si ho z nej načíta a zobrazí pekne, s veľkými tlačidlami.
Tvoje výsledky (série, váha, RPE, poznámka) vie zapisovať späť do stĺpcov **EXECUTED**,
takže ich tréner vidí v tabuľke ako predtým.

## Čo apka vie

- Automaticky otvorí **aktuálny týždeň** a zvýrazní **dnešný tréning**
- Tréning **po jednom cviku**: hore prehľad 1 · 2 · 3…, rozbalený je len aktuálny cvik,
  po uložení apka prejde na ďalší. Hotové cviky sa zbalia do riadku s výsledkom.
- Pri každom cviku: **plán od trénera a minulý výkon pod sebou** (série, váha, RPE), poznámka trénera,
  tlačidlo **„Ako minule“** (vyplní série a váhu z minula) a pri váhe živé porovnanie **↑ +5 kg / ↓ −2,5 kg oproti minule**
- Supersety (`CVIK A + CVIK B`) – jedno políčko ako v tabuľke, napr. `2x8 a 2x9`, RPE `8 a 7`
- **Súhrn po tréningu**: počet cvikov, trvanie, zlepšenia oproti minule a **objem** každého cviku
  (série × opakovania × kg) so zmenou v % oproti minule; zapíše `WORKOUT TIME` a `SESH RPE`
- **Graf progresu** váhy pri každom cviku – aj zo starších blokov (napr. MESOCYCLE 1.0)
- **Ranná váha**: na úvodnej obrazovke zapíšeš dnešnú váhu, vidíš trend a 7-dňový priemer.
  Ukladá sa do záložky **„Váha“** v tej istej tabuľke (skript ju založí sám pri prvom zápise).
- **Fotky progresu**: v nedeľu sa na úvodnej obrazovke ukáže karta (inak tlačidlo dole).
  Fotky sa zmenšia a uložia na **tvoj Google Drive** do priečinka „Fitko – progres fotky“ (po dňoch).
  Priečinok sa automaticky zdieľa **len s vlastníkom tabuľky** (trénerom) a do tabuľky
  pribudne záložka **„Fotky“** s dátumom, počtom a odkazom.
- Funguje **offline** – keď vo fitku nie je signál, zápisy počkajú a odošlú sa neskôr
- Dá sa pridať na plochu ako appka (iPhone: Zdieľať → Pridať na plochu)

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
| `index.html`, `styles.css`, `app.js` | celá apka (bez build kroku, čistý JS) |
| `calc.js` | výpočet objemu a návrh progresie – spoločný pre apku aj portál |
| `trener.html`, `coach.js`, `coach.css` | trénerov panel |
| `tests/` | testy výpočtov: `node --test tests/*.test.js`; `tests/e2e/` – testy v prehliadači s podvrhnutým Apps Scriptom (Playwright, `python3 -m http.server 8765` v koreni repa) |
| `specs/`, `.specify/` | špecifikácie (spec-driven development cez GitHub Spec Kit) |
| `sw.js`, `manifest.webmanifest`, `icons/` | offline režim a inštalácia na plochu |
| `apps-script/Code.gs` | skript pre zápis do Google tabuľky |
