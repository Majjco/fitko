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
| C | Redizajn klientskej apky (vzhľad, pauzy medzi sériami, proaktívne tipy) | klient | čaká | — |
| E | Viac klientov – **zoznam klientov hotový** (každý klient pošle odkaz); zostáva jeden skript pod trénerovým účtom namiesto skriptu u každého klienta | tréner | čiastočne | [003](003-coach-panel/spec.md) |

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
