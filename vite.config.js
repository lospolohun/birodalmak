// AGE OF THE CRYSTALS — BUILD-BEÁLLÍTÁS.
//
// ── MIÉRT RELATÍV A `base`, ÉS NEM `/aotc/` ───────────────────────────────
// A kirakás célja a `PLAN.md` v0.15-e szerint `https://skynet.lospolo.hu/aotc`,
// tehát ALKÖNYVTÁR. Az alapértelmezett `base: '/'` itt biztos halál: a
// `dist/index.html` gyökérből (`/assets/…`) hivatkozná a JS-t és a CSS-t, az
// alkönyvtár alatt pedig az 404. Ez az a hiba, ami helyi `vite preview`-val
// SOSEM jön elő, mert a preview a gyökérből szolgál ki — csak élesben.
//
// Két megoldás van rá, és MINDKETTŐ működik: `base: '/aotc/'` (abszolút, a
// kirakási útvonalra kötve) vagy `base: './'` (relatív, bárhonnan). A projekt
// a RELATÍVAT választotta, mert az ígéretet, amit ez ad, már máshol is
// kimondtuk és be is tartjuk:
//
//   · az `index.html` favicon-blokkja adat-URI, KIMONDOTTAN azzal az
//     indoklással, hogy „a `dist/` másolható bárhová";
//   · az `ikonok.js` fejléce (és az ikon-szonda) azt ígéri, hogy nincs
//     képfájl és nincs külső betűtípus — nincs második kérés, ami 404-re
//     futhat;
//   · a `npx vite build --outDir dist-qa` kimenetét a szondák és a QA
//     helyben, `file://`-ról is meg tudják nyitni.
//
// Az abszolút `base` mindezt egyetlen konkrét URL-hez kötné: ha a SkyNet alatt
// az alkönyvtár neve megváltozik, vagy valaki a `dist/`-et máshova másolja, a
// build némán fehér lapot ad. A relatív `base`-nek nincs ilyen feltétele.
//
// ⚠️ MIKOR KELL EZT ÚJRAGONDOLNI: a v1.0 PWA-jánál. Egy service worker SCOPE-ot
// kap, a manifest `start_url`-je pedig útvonalat — azok nem lehetnek
// relatívak. Ha a PWA bekerül, itt abszolút `base` kell, és akkor a `PLAN.md`
// v0.15-ös szakaszát ÉS ezt a fejlécet együtt kell átírni. Addig a kettő
// egyezik, és a kiadás-ellenőrző 57. elvárása őrzi, hogy így is maradjon.

import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
  },
  server: { port: 5273 },
  preview: { port: 5273 },
});
