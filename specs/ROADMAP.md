# Fitko – roadmapa

Veľká vízia: klientska apka „vytunená“ do posledného detailu a trénerov portál, v ktorom
tréner vidí všetky dáta klienta, dostáva návrhy ďalšieho tréningu a nepotrebuje Excel – pre
všetkých svojich klientov. Dáta ďalej žijú v Google tabuľkách (constitution I).

Každá položka ide cez spec-kit samostatne (spec → plan → tasks → implement) a po každej je
apka funkčná.

| # | Funkcia | Pre koho | Stav | Spec |
|---|---|---|---|---|
| — | Súčasný stav (baseline) | všetci | hotové | [001](001-fitko-baseline/spec.md) |
| A | Návrh ďalšieho týždňa (objem, +X % progresia, vloženie jedným klikom) | tréner | hotové (v14), čaká na test s trénerom | [002](002-next-week-suggestions/spec.md) |
| B+D | **Trénerov panel** – zoznam klientov, týždne vedľa seba ako v Exceli, insighty, plánovanie ďalšieho týždňa na tej istej ploche (nahrádza záložky) | tréner | hotové (v15), čaká na nasadenie skriptu | [003](003-coach-panel/spec.md) |
| C | Redizajn klientskej apky (vzhľad, tréning po sériách, pauzy, proaktívne tipy, rekordy) | klient | hotové (v17, Volt) | [004](004-app-redesign/spec.md) |
| E | Viac klientov – **zoznam klientov hotový** (každý klient pošle odkaz); zostáva jeden skript pod trénerovým účtom namiesto skriptu u každého klienta | tréner | **pozastavené** (viď rozhodnutia) | [003](003-coach-panel/spec.md) |

## Rozhodnutia

- 2026-11-28: Začíname funkciou A – najsilnejší argument, aby tréner začal portál používať.
- 2026-11-28: Návrhy progresie sú **pravidlové** (predvídateľné, zadarmo, offline,
  s vysvetlením). AI sa môže doplniť neskôr ako voliteľné tlačidlo.
- 2026-11-28: Tabuľky klientov **vlastní tréner** → pre funkciu E stačí jeden Apps Script pod
  trénerovým účtom so zoznamom klientov (zmení predpoklad „1 skript = 1 klient“ z baseline;
  bude treba doplniť constitution).
- 2026-11-28: Hlavná miera záťaže je **objem** = série × opakovania × kg. Návrh cieli na +5 %
  objemu týždenne (nastaviteľné 0–10 %); pri vysokom RPE alebo nezvládnutí sa nezvyšuje.
- 2026-11-28: Portál so záložkami sa zahadzuje. Nový panel = jedna plocha ako trénerov Excel
  (cviky × týždne), insighty a nový týždeň ako upraviteľný stĺpec. Prototyp:
  `specs/003-coach-panel/prototype.html`.
- 2026-11-28: Vzhľad apky „Volt“ (vybraný z 3 smerov). Nápad na neskôr: téma „Matrix“ ako voliteľný vzhľad.
- 2026-11-28: Progres prerobiť (spec 005) – prototyp `specs/005-progress-redesign/prototype.html`.
  Hotové vo v21: Sila · Telo, čo najmenej textu (rekord = číslo, názov, trend).
- 2026-11-28: Apka v21–v23 hotová a nasadená (nový Progres, zjednodušené obrazovky, panel trénera
  vo vzhľade Volt s vývojom cvikov v mriežke).
- 2026-11-28: **Funkcia E pozastavená.** Google Apps Script nie je technická prekážka pre jedného
  trénera s desiatkami klientov (hlavný problém je nastavovanie skriptu u každého klienta). Vlastník
  ale zvažuje, že budúce riešenie bude **bez Google tabuľky** (vlastný backend s databázou
  a prihlasovaním) – to by zmenilo princíp I constitution. Rozhodne sa neskôr; dovtedy sa na E
  nepracuje.
