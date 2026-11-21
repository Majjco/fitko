# Fitko 💪

Mobilná apka (PWA) na tréning vo fitku. **Tréner ďalej píše plán do svojej Google tabuľky
presne ako doteraz** – apka si ho z nej načíta a zobrazí pekne, s veľkými tlačidlami.
Tvoje výsledky (série, váha, RPE, poznámka) vie zapisovať späť do stĺpcov **EXECUTED**,
takže ich tréner vidí v tabuľke ako predtým.

## Čo apka vie

- Automaticky otvorí **aktuálny týždeň** a zvýrazní **dnešný tréning**
- Pri každom cviku: plán od trénera (série × opak., váha, RPE), jeho poznámka a **čo si dal minule**
- Supersety (`CVIK A + CVIK B`) zobrazené prehľadne pod sebou
- Rýchly zápis: tlačidlo **Ok** (podľa plánu), váha, RPE na ťuknutie, poznámka pre trénera
- **Časovač pauzy** (spustí sa sám po uložení cviku, pípne a zavibruje)
- **Stopky tréningu** + RPE celého tréningu → zapíše sa do `WORKOUT TIME` a `SESH RPE`
- Funguje **offline** – keď vo fitku nie je signál, zápisy počkajú a odošlú sa neskôr
- Dá sa pridať na plochu ako appka (iPhone: Zdieľať → Pridať na plochu)

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

Apka očakáva rozloženie hárku, aké tréner používa: bloky `WEEK n`, riadky `DAY 1–7`,
dátum v stĺpci B a 6 cvikov po 9 stĺpcoch od stĺpca D
(názov, PLANNED série/váha/RPE/poznámka, EXECUTED série/váha/RPE/poznámka).

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

Keď skript neskôr upravíš: *Nasadiť → Spravovať nasadenia → upraviť → Verzia: Nová*.

So zapnutým zápisom si apka nájde aktuálny hárok sama (prvý viditeľný hárok s `WEEK 1`),
takže keď tréner založí nový blok a starý skryje, netreba nič meniť.

### Prenos nastavení na iný mobil

V nastaveniach je tlačidlo **Skopírovať odkaz na nastavenie** – odkaz obsahuje aj heslo,
takže ho posielaj len sebe.

## Súbory

| Súbor | Čo robí |
|---|---|
| `index.html`, `styles.css`, `app.js` | celá apka (bez build kroku, čistý JS) |
| `sw.js`, `manifest.webmanifest`, `icons/` | offline režim a inštalácia na plochu |
| `apps-script/Code.gs` | skript pre zápis do Google tabuľky |
