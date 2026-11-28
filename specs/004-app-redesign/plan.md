# Implementation Plan: Redizajn klientskej apky

**Spec**: [spec.md](spec.md) · **Prototyp**: [prototype.html](prototype.html) (vybraný štýl Volt)

## Riešenie

- Nový `app.css` len pre klientsku apku (trénerov panel ostáva na `styles.css` + `coach.css`,
  aby ho redizajn neovplyvnil). Písmo Barlow Condensed lokálne v `fonts/` (OFL) a v cache SW –
  funguje offline, žiadne cudzie servery (constitution VI).
- `app.js`: dátová vrstva (načítanie, fronta, váha, fotky, história) zachovaná; nové obrazovky
  Dnes / Týždeň / Progres, tréning po sériách so stavom v `localStorage` (`fitko.live`), pauza z
  časových značiek (sedí aj po zamknutí), rekord = najvyššia váha cviku pred týmto dňom,
  zápis do tabuľky v existujúcom formáte (`composeFields`).
- Verzia 17 v `app.js`, `sw.js`, `version.json`, `trener.html`.

## Constitution Check

I ✅ (formát zápisu nezmenený) · II ✅ (len EXECUTED, kontrola názvu cviku) · III ✅ (offline,
rozpracovaný tréning v telefóne) · IV ✅ (žiadne závislosti; písmo ako statický súbor) · V ✅ (mobil,
jedna ruka, slovensky) · VI ✅ (písmo lokálne, žiadna analytika).

## Overenie

- `tests/e2e/client.e2e.js` – 26 kontrol (Dnes, váha, séria, pauza 2:00 z poznámky, rekord, RPE,
  formát zápisu, rýchly zápis, obnovenie uprostred cviku, súhrn, Progres, Týždeň, nastavenia).
- `tests/e2e/panel.e2e.js` (38) a `node --test tests/*.test.js` (23) bez zmeny správania panela.
