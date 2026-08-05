# PORTAL HUB TYCOON — kirakás SkyNetre

**A cél: `https://skynet.lospolo.hu/portal/`**

> **TL;DR:** `npm run portal:csomag`, aztán a `portal/dist/` TARTALMÁT másold
> a szerver `portal/` mappájába. Nincs Node, nincs adatbázis, nincs build a
> szerveren.

⚠️ Ez **nem** ugyanaz a hely, mint az AGE OF THE CRYSTALS-é (`/aotc`). A két
játék diszjunkt fájlkészleten él a repóban, és a szerveren is külön mappát
kap — enélkül az egyik build felülírná a másik `assets/`-ét, mert mindkettő
`index-<hash>.js` néven ír.

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
npm ci
npm run portal:csomag
```

Ez a három lépést csinálja meg egyben: **build** → **kiadás-ellenőrzés** (a
forrást vizsgálja) → **csomag-ellenőrzés** (a kimenetet vizsgálja: minden
hivatkozott fájl megvan-e, relatívak-e az útvonalak, nem szivárgott-e ki
forrástérkép, mekkora lesz tömörítve). A végén kiírja a pontos másolási
lépést.

Ha **A CSOMAG KIRAKHATÓ** felirat jön, mehet:

```
portal/dist/index.html   →   skynet.lospolo.hu/portal/index.html
portal/dist/assets/      →   skynet.lospolo.hu/portal/assets/
```

Utána: **https://skynet.lospolo.hu/portal/**

A `dist/` **tartalmát** másold, ne magát a `dist` mappát — különben
`/portal/dist/` lesz belőle, és fehér lapot kapsz.

⚠️ **Frissítéskor töröld a régi `assets/`-et.** A fájlnevekben tartalom-hash
van, tehát az új build MÁS néven ír, a régi pedig ottmarad örökre. Nem hiba,
csak szemét — de pár kiadás után nem fogod tudni, melyik az élő.

⚠️ A `dist/` **nincs verziókövetve** (a `.gitignore` kizárja), tehát a
repóból nem tudod letölteni: mindig frissen kell buildelni.

### Ha később máshova kerülne

A mappa neve a játéknak **közömbös**: a relatív `base` miatt nem kell se
konfigot, se buildet módosítani, ugyanaz a `dist/` bárhonnan elindul —
gyökérből is. Ha átnevezed, itt és a `tools/csomag.mjs` kiírásában érdemes
átvezetni, hogy a doksi ne hazudjon.

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
