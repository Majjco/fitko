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
- **Súhrn po tréningu**: počet cvikov, trvanie, zlepšenia oproti minule a **objem** (série × opakovania × kg)
  celého tréningu aj každého cviku so zmenou v % oproti minule; zapíše `WORKOUT TIME` a `SESH RPE`
- **Graf progresu** váhy pri každom cviku – aj zo starších blokov (napr. MESOCYCLE 1.0)
- **Ranná váha**: na úvodnej obrazovke zapíšeš dnešnú váhu, vidíš trend a 7-dňový priemer.
  Ukladá sa do záložky **„Váha“** v tej istej tabuľke (skript ju založí sám pri prvom zápise).
- **Fotky progresu**: v nedeľu sa na úvodnej obrazovke ukáže karta (inak tlačidlo dole).
  Fotky sa zmenšia a uložia na **tvoj Google Drive** do priečinka „Fitko – progres fotky“ (po dňoch).
  Priečinok sa automaticky zdieľa **len s vlastníkom tabuľky** (trénerom) a do tabuľky
  pribudne záložka **„Fotky“** s dátumom, počtom a odkazom.
- Funguje **offline** – keď vo fitku nie je signál, zápisy počkajú a odošlú sa neskôr
- Dá sa pridať na plochu ako appka (iPhone: Zdieľať → Pridať na plochu)

## Trénerov portál (voliteľný)

Na adrese `trener.html` je portál pre trénera nad **tou istou tabuľkou** – čo v ňom zmení, je hneď
v tabuľke a naopak, takže môže kľudne ďalej používať aj Excel.

- **Progres** – všetky cviky × týždne v jednej tabuľke (zapísané váhy klienta, RPE, trend), klik na cvik = graf;
  prepínač **Váha / Objem**
- **Návrh ďalšieho týždňa** – na poslednom naplánovanom týždni tlačidlo „Navrhnúť ďalší týždeň“. Pri každom
  cviku ukáže, čo klient odcvičil, jeho objem a návrh na ďalší týždeň tak, aby objem stúpol o cieľové %
  (predvolene 5 %) – ak klient cvik zvládol a RPE nebolo nad plánom. Pri vysokom RPE ponechá, pri 2× po sebe
  nezvládnutých opakovaniach zníži váhu. Pri každom návrhu je dôvod a alternatívy (+krok, +1 opakovanie,
  +1 séria); tréner môže čokoľvek prepísať alebo ponechať a potom **jedným klikom vloží celý týždeň do
  tabuľky**. Cieľové % a krok váhy pri cviku (napr. jednoručky po 2 kg) sa ukladajú do záložky
  **„Fitko nastavenia“**. Presné pravidlá: [`specs/002-next-week-suggestions/spec.md`](specs/002-next-week-suggestions/spec.md).
- **Plán** – úprava cvikov (názov, série, váha, RPE, poznámka), pridanie/odobratie cviku,
  „Naplánovať ďalší týždeň“ (skopíruje plán do najbližšieho prázdneho týždňa a posunie dátumy o 7 dní;
  keď prázdny týždeň nie je, skopíruje celý blok pod posledný)
- **Klient** – ranná váha, fotky progresu, poznámky klienta k cvikom

Prístup: v `Code.gs` nastav `COACH_USER` a `COACH_PASS` a trénerovi pošli odkaz
`https://<github-meno>.github.io/fitko/trener.html#s=<base64 URL skriptu>` + meno a heslo.
Tréner smie meniť len PLANNED stĺpce; cvik, ktorý už klient zapísal, sa nedá odstrániť.

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
| `trener.html`, `coach.js`, `coach.css` | trénerov portál |
| `tests/` | testy výpočtov: `node --test tests/*.test.js` |
| `specs/`, `.specify/` | špecifikácie (spec-driven development cez GitHub Spec Kit) |
| `sw.js`, `manifest.webmanifest`, `icons/` | offline režim a inštalácia na plochu |
| `apps-script/Code.gs` | skript pre zápis do Google tabuľky |
