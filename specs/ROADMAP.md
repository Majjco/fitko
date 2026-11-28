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
| B | Trénerský dashboard (grafy všetkých cvikov naprieč blokmi, objem, dochádzka, váha, fotky) | tréner | čaká | — |
| C | Redizajn klientskej apky (vzhľad, pauzy medzi sériami, proaktívne tipy) | klient | čaká | — |
| D | Plánovanie bez Excelu (celé bloky, šablóny, presúvanie cvikov) | tréner | čaká | — |
| E | Viac klientov v jednom portáli | tréner | čaká | — |

## Rozhodnutia

- 2026-11-28: Začíname funkciou A – najsilnejší argument, aby tréner začal portál používať.
- 2026-11-28: Návrhy progresie sú **pravidlové** (predvídateľné, zadarmo, offline,
  s vysvetlením). AI sa môže doplniť neskôr ako voliteľné tlačidlo.
- 2026-11-28: Tabuľky klientov **vlastní tréner** → pre funkciu E stačí jeden Apps Script pod
  trénerovým účtom so zoznamom klientov (zmení predpoklad „1 skript = 1 klient“ z baseline;
  bude treba doplniť constitution).
- 2026-11-28: Hlavná miera záťaže je **objem** = série × opakovania × kg. Návrh cieli na +5 %
  objemu týždenne (nastaviteľné 0–10 %); pri vysokom RPE alebo nezvládnutí sa nezvyšuje.
