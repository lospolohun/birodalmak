# ÁTADÓ — PORTAL HUB TYCOON · v1.1

> **Ez az egyetlen fájl, amit el kell olvasnod, ha most kapcsolódsz be.**
> A 0. és az 5. pont a lényeg. A többi akkor kell, ha hozzá is nyúlsz.

| | |
|---|---|
| **Verzió** | `portal/src/mag/config.js` → `VERZIO` (a `package.json` verziója NEM ez) |
| **Ág** | `claude/portal-hub-tycoon-doo7mq` |
| **Mappa** | `portal/` — **önálló alprojekt**, saját `index.html`-lel és `vite.config.js`-szel |
| **Kirakás** | `skynet.lospolo.hu/portal` — lásd [`KIRAKAS.md`](KIRAKAS.md) |
| **Játék** | `npm run portal:dev` → http://localhost:5274 |

⚠️ **A repóban KÉT játék van.** A gyökér `src/` az AGE OF THE CRYSTALS-é, a
`portal/` ezé. Diszjunkt fájlkészleten élnek — ha az egyiken dolgozol, a
másikhoz ne nyúlj. A gyökér `CLAUDE.md` erről szól.

---

## 0. Hol tart a projekt

**Kész, játszható, mérve.** Böngészőben futó 3D tycoon: dimenziókapu-állomást
igazgatsz, ahová tíz faj érkezik, mindegyik más igénnyel és fogyó türelemmel.
Hét fejezetes történet két visszafordíthatatlan döntéssel, utána végtelen mód
növekvő nehézségű korszakokkal.

Az ív: v0.1 motor-mag → v0.2 mentés → v0.3 emeletek → v0.4 csatornák →
v0.5 végtelen mód → v0.6 kosz → v0.7 tanácsadó → v0.8 bevezető →
v0.9 kiadás-ellenőrző → **v1.0** (mind a hat kapu együtt zöld) →
**v1.1** (nagyobb pálya, textúrák, SFX-hangolás, UI-hangolás + QA-kör).

### Amit a v1.1 hozott

| sáv | mi |
|---|---|
| **pálya** | rács 64×48 → **96×72**, kezdő csarnok 22×16 → **30×22** |
| **textúrák** | 13 procedurális textúra, canvasból, **nulla képfájl** |
| **hang** | monóból sztereó, torlódás-védelem, ducking, ismétlődés-variáció |
| **felület** | QA-kör: **3 kritikus + 4 súlyos** hiba javítva |
| **kirakás** | `npm run portal:csomag` + [`KIRAKAS.md`](KIRAKAS.md) |

---

## 1. A LEGFONTOSABB SZABÁLY

**A `src/sim/` alatt a determinizmus mindent felülír.** Nincs `Math.random`,
`Date.now`, `performance.now`, nincs `Math.sin/cos/pow/exp/log/hypot`, nincs
`three`/DOM, és nincs sorrendfüggő objektum-iteráció. Az `npm run portal:det`
1. vizsgálata ezt statikusan is ellenőrzi — **ha bukik, ne a szondát írd át.**

Ebből következik minden más: a mentés = **seed + parancsnapló**, a betöltés
= újrajátszás, és ezért lesz bitre ugyanaz.

**A render, a felület és a hang SOSEM ír a simbe.** Ha hatni akarnak a
világra, parancsot adnak: `sim.parancs({ fajta: 'menet', … })`.

⚠️ A `Math.random` a **render/hang oldalon MEGENGEDETT** — a hang-sáv él is
vele a hangvariációhoz. Csak a `sim/` és a `mag/` alatt tilos.

---

## 2. A HÉT KAPU

```bash
npm run portal:szonda      # mind egyben
```

| parancs | mit mér | vizsgálat |
|---|---|---|
| `portal:det` | determinizmus, működés, gazdaság, végigjátszás | 11 |
| `portal:mertan` | 23 épülettípus, 23 különböző sziluett | 6 |
| `portal:hang` | katalógus, jelszint, **sztereó/torlódás/dinamika** | 6 |
| `portal:bongeszo` | elindul-e, működik-e, ment-e bitre azonosan | 9 |
| `portal:latvany` | napszak, szellemszint, részecskekeret | 6 |
| `portal:textura` | mintázottság, uv, textúra-készlet, képkocka-ár | 8 |
| `portal:kiadas` | verzió, nyomok, külső hivatkozás, build | 7 |

⚠️ **A determinizmus-kapu NEM működés-kapu.** A semmittevés is tökéletesen
reprodukálható: a v0.3 első változatában mind a hat vizsgálat zöld volt,
miközben 400 munkásból 285 beragadt. Ezért van minden szondában legalább egy
olyan szám, ami azt méri, hogy az alrendszer **csinál** is valamit. Új
alrendszernél mindig kérdezd meg: *mi az a szám, ami ezt elárulja?*

⚠️ **Új parancsfajta → vedd bele a `tools/forgatokonyv.mjs`-be.** A szonda
forgatókönyvekből dolgozik, magától nem találja meg az új kódot. A `v01`
forgatókönyv viszont **sosem változhat** — az a motor-mag regresszió-őre.

---

## 3. HOL DOLGOZOL — ez eldönti, mit tudsz ellenőrizni

| | felhő | otthoni iMac |
|---|---|---|
| kód, `vite build`, mind a 7 szonda | ✅ | ✅ |
| **`npm run portal:fps`** | ❌ nincs GPU | ✅ |

A felhőben a Chrome szoftveres raszterizálóra (SwiftShader) esik. **Az ott
mért FPS semmit nem jelent** — soha ne jelents felhőben mért FPS-t
eredményként.

⚠️ **A képkocka-idő és a tick-idő két futás között sem összehasonlítható**: a
felhő-gép osztott CPU-n fut. A/B-t **egy munkameneten belül** mérj. És ahogy
a textúra-sáv megtanulta: **fordított sorrendben is** — a fix sorrendű A/B-jük
ugyanarra a kódra egyszer +17 %-ot, egyszer +73 %-ot mutatott, mert a gép
terhelése közben csökkent.

---

## 4. A KÓD SZERKEZETE

```
  src/mag/     config, determinizmus-biztos matek, seedelt véletlen
  src/sim/     A VILÁG. Nincs benne three, DOM, Math.random, Date.now.
  src/render/  three.js. Csak OLVASSA a simet.
  src/ui/      DOM. Csak OLVASSA a simet.
  src/audio/   WebAudio. Csak OLVASSA a simet.
  src/fo.js    huzalozás + fix lépésközű hurok
```

- Magyar azonosítók és kommentek. A fejléc-komment a **MIÉRT**-et magyarázza.
- Nulla per-frame allokáció a render `frissit()`-jében és a sim `lep()`-jében.
- Új réteg → új fájl. A meglévőt ne írd át, ha bővítés is elég.
- Több agenttel dolgozunk: **diszjunkt fájlkészlet**, mindenki a saját sávjában.

---

## 5. AMI NYITOTT — ezt vidd tovább

Sorrendben. Az első kettő **adósság**, nem ötlet: olyan állítás, amit ma nem
tudunk méréssel alátámasztani.

### 5.1 ⚠️ FPS valódi GPU-n — EZ A LEGFONTOSABB

A render a v0.1 óta gyökeresen megváltozott (típusonkénti mértan, három szint,
portálfények, napszak, részecskék, **és most 13 textúra**), és azóta
**egyszer sem futott rá `npm run portal:fps` GPU-s gépen.**

Amit tudunk: a textúrák **+15 %** képkocka-időt kérnek szoftveres
raszterizálón (271 vs 236 ms, A/B egy futáson belül). Hogy ez valódi GPU-n
mennyi, azt **nem tudjuk** — és a szoftveres szám nem is arányos vele.

```bash
export AOC_CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
npm run portal:fps
```

### 5.2 ⚠️ EMBER MÉG NEM JÁTSZOTTA VÉGIG

A gépi játékos sokszor végigvitte a történetet, de ember még nem. A tempó, a
szövegek érthetősége és a bevezető haszna **csak így ítélhető meg**. Botot nem
lehet megkérdezni, hogy unatkozott-e. Ugyanez a hangra: **ember még nem
hallotta.**

### 5.3 A legnagyobb nyitott TERVEZÉSI kérdés: mindenki dühös

**Minden győztes stratégia 66–80 %-os dühös aránnyal fejezi be.** A játék ma
úgy nyerhető meg, hogy az állomás vendégeinek kétharmada dühösen távozik. Ez
nem szám-hiba (a győzelem feltételét teljesítik), de szemben megy a
„varázslatos, nyüzsgő átszállóállomás" ígéretével.

**A nagyobb pálya NEM oldotta meg** — lemértük: 64×48-ról 96×72-re nőtt a
rács, a dühös arány nem mozdult. Tehát nem helyhiány, hanem
**kiszolgáló-kapacitás**: a tömeg a SORBAN állókból keletkezik, és több padló
nem rövidít sort.

Az egyetlen kivétel a `csatornas` stratégia: **92,3 hírnév, KEVESEBB utassal.**
Ez a nyom, amin el lehet indulni.

### 5.4 Kisebb, konkrét tételek

- **Hosszú távú stabilitás.** A leghosszabb mért futás 80 játéknap. Hogy egy
  200 napos parti mit csinál a memóriával és a mentés méretével, nem tudjuk.
- **`ConvolverNode` CPU-ára** nincs mérve (hang-sáv, GPU-s gép kell hozzá).
- **A `bongeszo_szonda.mjs`-ből hiányzik a HMR-kilövés.** A `latvany` és a
  `textura` szondában van; enélkül párhuzamos agent-munka közben a szonda
  véletlenszerűen elszáll („Execution context was destroyed").
- **`vezerlo.kozpontba()`** — „vissza a csarnokhoz" gomb. Pontos kód:
  `qa/QA_KOR.md` 6. szakasz. Ma szándékosan nincs.
- **Ha a képkocka tartósan 250 ms fölött van**, a játékos ma nem tud róla —
  csak azt látja, hogy lassú. A `fo.js` `dt`-korlátja miatt a világ
  lassítottban megy. Egy egyszeri üzenet őszintébb, mint a néma csúszás.
- **Mobil / érintőképernyő.** A vezérlés egérre készült.
- **Negyedik-ötödik szint**, emeletenként eltérő bérleti díj.
- **Több nyelv.** Ma minden magyar, a kód is.

---

## 6. AMIT A MÉRÉS TANÍTOTT — olvasd el, mielőtt hangolsz

Ezek nem anekdoták; mindegyik konkrét hibába került, és mindegyik újra
megtörténhet.

1. **Egy jól diagnosztizált hiba javaslata is túllőhet.** A hírnév-gödörre az
   egyensúly-jelentés 60 → 300-at javasolt, mérésekkel alátámasztva. Beépítve
   **elvitte a nyerő stratégiák kétharmadát.** 150 lett belőle — csak az
   újramérés mutatta meg.
2. **A mérőeszköz is elromlik, és akkor JÁTÉK-hibának látszik.** A `berbeado`
   bot 8/8-ról 0/8-ra esett; nem a játék romlott el, hanem a bot feltétele a
   sim feltételének MÁSOLATA volt, és a sim szigorodott.
3. **Ne hangold a játékot a teszthez.** A végigjátszás-forgatókönyv a
   hírnév-szám söprésekor NEM MONOTON volt (100 ✗ · 150 ✗ · 200 ✓ · 250 ✗ ·
   300 ✓). Kísértés lett volna azt a számot választani, amelyiknél zöld.
4. **A képpont-mérés olyat fog meg, amit a kód nem árul el.** A csillagok
   hónapokig „ott voltak", és közben SÖTÉTÍTETTEK (a köd elnyelte őket). Az
   ég-shaderből hiányzott a `colorspace_fragment`.
5. **A szonda nem helyettesíti a végigkattintást.** A QA-kör kritikus hibája
   — egy hiányzó import, ami EGYETLEN kattintástól megfagyasztotta a partit —
   szondával nem volt megfogható: a cellanézet csak vászonra kattintással jön elő.
6. **A személyzet nélküli épület rosszabb, mint a semmi**, és ez a másik
   irányból is igaz: a bot elbocsátás-logikája MŰKÖDŐ épületeket fosztott meg
   a személyzetüktől, és 4 zöldből 3 lett.

---

## 7. Ha most ülsz le hozzá — mit csinálj

```bash
npm ci
npm run portal:dev        # játszd meg egy órát, ez hiányzik a legjobban
npm run portal:szonda     # mind a hét kapu (~15 perc)
```

Ha az iMac-en vagy, **az 5.1 az első dolog**: `npm run portal:fps`. Az az
egyetlen tétel, ami miatt a v1.1-et „részben mért" állapotban kell tartani.

Kirakás: `npm run portal:csomag`, aztán [`KIRAKAS.md`](KIRAKAS.md).

**Dokumentáció:** [`README.md`](README.md) (játékos + fejlesztő) ·
[`PORTAL_TERV.md`](PORTAL_TERV.md) (terv és állapot) ·
[`qa/`](qa/) (mérési jegyzőkönyvek: `V1.0_EREDMENY.md`, `EGYENSULY.md`,
`HANG.md`, `QA_KOR.md`)
