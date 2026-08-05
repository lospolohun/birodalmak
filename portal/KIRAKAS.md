# PORTAL HUB TYCOON — kirakás SkyNetre

> **TL;DR:** `npm run portal:build`, aztán a `portal/dist/` TARTALMÁT másold a
> SkyNet alkönyvtárába. Nincs Node, nincs adatbázis, nincs build a szerveren.

---

## Miért egyszerű ez

A játék **statikus**: a `vite build` egyetlen HTML-t, egy JS-t és egy CSS-t ad,
és semmi mást nem kér. Ebből következik, hogy a SkyNet PHP-s kiszolgálója
bőven elég — nem kell futó Node-processz, mint az AGE OF THE CRYSTALS
relay-szerveréhez.

Három dolog garantálja, hogy tényleg bárhová bemásolható, és mindhármat
**gép ellenőrzi**, nem emlékezet:

| | mit garantál | mi őrzi |
|---|---|---|
| `base: './'` | relatív útvonalak → alkönyvtárban is megtalálja az assetet | `kiadas_ellenorzo` 7. vizsgálat |
| nulla külső hivatkozás | nincs CDN, nincs Google Font, nincs `fetch` | `kiadas_ellenorzo` 3. vizsgálat |
| nulla médiafájl | a hang WebAudio, az ikon adat-URI, a textúra kódból készül | ugyanaz |

⚠️ **Az alkönyvtár a klasszikus buktató**, és a `PLAN.md` jogosan figyelmeztet
rá: ha a `base` `'/'` volna, a `dist/index.html` gyökérből (`/assets/…`)
hivatkozná a JS-t, ami `/portal/` alatt 404. Ez a hiba **`vite preview`-val
SOHA nem jön elő**, mert a preview a gyökérből szolgál ki.

Ezért ezt nem elhittük, hanem **lemértük**: a build egy sima
`python3 -m http.server` mögött, `/portal/` alkönyvtárból kiszolgálva
elindult, a világ futott (73. tick), 13 rajzolási hívás, **nulla 404 és nulla
konzolhiba** — és pontosan ugyanez gyökérből is. A két eset megkülönböztethetetlen.

---

## A lépések

```bash
# 1. a gépeden, a repó gyökeréből
npm ci
npm run portal:build          # → portal/dist/

# 2. ellenőrzés kirakás előtt (ez a kapu, ne hagyd ki)
npm run portal:kiadas
```

Ha a `portal:kiadas` **KIADHATÓ**-t ír, mehet:

```
portal/dist/index.html   →   skynet.lospolo.hu/<alkönyvtár>/index.html
portal/dist/assets/      →   skynet.lospolo.hu/<alkönyvtár>/assets/
```

A `dist/` **tartalmát** másold, ne magát a `dist` mappát — különben
`/<alkönyvtár>/dist/` lesz belőle.

⚠️ A `dist/` **nincs verziókövetve** (a `.gitignore` kizárja), tehát a
repóból nem tudod letölteni: mindig frissen kell buildelni.

### Milyen alkönyvtárba?

A `PLAN.md` az AGE OF THE CRYSTALS-nak a `/aotc`-t szánja. A PORTAL HUB TYCOON
**másik játék**, tehát másik alkönyvtár kell neki — `/portal` a kézenfekvő. A
játék bármelyikkel működik: a relatív `base` miatt a névnek nincs jelentősége,
és nem kell hozzá se konfigot, se buildet módosítani.

---

## Amit a szerveren érdemes beállítani

Egyik sem kötelező — a játék enélkül is elindul.

- **Gzip/Brotli.** A JS 878 kB nyersen, **243 kB gzippel**. Ha a kiszolgáló
  nem tömörít, a betöltés négyszer annyi adat. Ez az egyetlen beállítás, ami
  érezhetően számít.
- **Cache.** Az `assets/` fájlnevekben tartalom-hash van (`index-BbGtRiV1.js`),
  tehát nyugodtan cache-elhető hosszan. Az `index.html`-t viszont **ne**
  cache-eld sokáig, különben a frissítés után is a régi assetre mutat.

---

## Ha nem indul el — mit nézz meg először

| tünet | szinte biztosan |
|---|---|
| fehér lap, konzolban 404 az `assets/`-re | a `dist` mappát másoltad, nem a tartalmát |
| fehér lap, konzol tiszta | a böngésző cache-eli a régi `index.html`-t — `Ctrl+Shift+R` |
| elindul, de nem mozdul semmi | **ez nem hiba**: a játék fejezet-modálissal indul, ami a világot szünetelteti, amíg rá nem kattintasz |
| „ismeretlen mentésformátum (v2)" | helyes viselkedés: a rács a v1.0 óta 96×72, a régi mentések koordinátái nem érvényesek |

Az utolsó előtti sor nem elméleti: a kirakás tesztelése közben pont ez
tévesztett meg — a világ „állni látszott", holott csak a nyitó modálisra várt.

---

## Hibajelentéshez

A mentés = **seed + parancsnapló**, tehát egy mentésfájl a tökéletes
hibajelentés: bitre újrajátszható. A 💾 panelen `Mentés fájlba`. A `?seed=…`
paraméterrel bármelyik világ újraindítható.
