# TODO — AGE OF THE CRYSTALS

Állapot: **v0.16** (`95c5abc`, 2026-08-04). A helyzetkép és a MIÉRT-ek az
[`ATADO.md`](ATADO.md)-ben; ez a lista csak azt mondja meg, **mit kell csinálni
és milyen sorrendben**.

Jelölés: `[ ]` nyitott · `[~]` félkész, van kód · `[x]` kész
Sáv: **SIM** = `src/sim/` (determinizmus-szabály!) · **UI** = `src/ui/` ·
**RND** = `src/render/` · **QA** = `tools/`

---

## P0 — enélkül nem játék

### [ ] SIM · A játékot nem lehet megnyerni
Nincs `gyoztes`, nincs `vegeTick`, a `lep()` a végtelenségig lép.

- [ ] Győzelmi szabály. A legkézenfekvőbb a központ elvesztése — az
      `epuletek.sebez()` már tudja, mikor pusztul el egy `EPULET.KOZPONT`.
- [ ] `sim.gyoztes` / `sim.vegeTick` állapotmező, **és bele az `allapotHash()`-be**.
      ⚠️ Ha kimarad, a lockstep két gépen MÁS tickre teszi a meccs végét — pont
      az a desync-fajta, amit a `parancsallapot.js` fejléce leír.
- [ ] A `lep()` viselkedése vége után: megáll, vagy csak jelez?
- [ ] Feladás-parancsfajta a `parancsok.js`-ben.
- [ ] **Fel kell venni a determinizmus-forgatókönyvbe** (`tools/determinizmus_szonda.mjs`),
      különben a legfrissebb, tehát legkockázatosabb kód marad kapun kívül.
- [ ] Ha kész: a `panel_statisztika_adat.js` `vegallapot()`-jában a
      `hivatalos: false` lesz `true`, és a panel eredményt hirdet, nem állást.

### [~] RND · A látvány-sávok három félbehagyott hibája
A nyolc látvány-agentet a kvóta ölte meg önellenőrzés közben. Írtak, de nem
zártak le. Mind kód-kérdés, felhőben is megoldható.

- [ ] **Napszak-váltásnál a terep feketébe fordul, a figurák nem.** A figurák
      `toneMapped:false`-szal mennek, a terep ACES-en — a kettő nem ugyanaz a
      csővezeték. Mérve: éjjel terep (5,19,11), figura (21,30,83).
      Fájl: `src/render/fenyek_ciklus.js`, `core3d.js`.
- [ ] **A pálya sarkánál a kamera a ködlap ALÁ kerül, és a köd eltűnik.** A
      javítás iránya megvan: a ködlap kövesse a kamerát. Fájl: `kod3d.js`.
- [ ] **A törmelék nem süllyed elég mélyre és túl világos.** Fájl:
      `effekt_harc.js`, `effekt_keszlet.js`.

---

## P1 — a játék minősége

- [ ] **SIM/AI · A gép 7,5 perc alatt egyszer sem vált korszakot.** Az ételt
      elköltik képzésre, mire az 500-as váltási ár összejönne. Balansz, nem
      programhiba — de a gép így sosem jut fejlettebb egységekhez. `src/sim/ai.js`.
- [ ] **SIM · A kristály és a fény korához nincs technológia kötve.** A fa ezt
      őszintén kiírja („Ebben a korban nem nyílik meg új technológia…"), de
      balansz-döntés kell. `src/sim/technologia.js`.
- [ ] **UI/RND · Épület-kijelölés nincs.** A `kijeloles.js` csak egységeket
      jelöl. A kijelölés-panel épület-nézete KÉSZ és szondázott — csak a
      `bevitel.kijeloltEpulet` mező kell hozzá, plusz a 3D-s épület-kattintás.
- [ ] **UI · Az építés-panel a `bevitel._celPont()` PRIVÁT metódusára
      támaszkodik.** Ha bárki átnevezi, a lerakás NÉMÁN elhal. Publikus
      `celPont()` kell a `bevitel.js`-be, a panel már keresi is.
- [ ] **Böngészős ránézés minden panelre.** Az adat- és szerződés-kapuk zöldek,
      de a tördelést és a tényleges kattintásokat élőben még senki nem nézte meg.
      ⚠️ Ez csak valódi GPU-s gépen ér valamit.
- [ ] **QA · `favicon.ico`.** Minden szonda-futáson „1 konzol-hibát" jelent.
      Egyperces javítás, és megszünteti az örök hamis riasztást.
- [ ] **SIM · Képzési sor törlése.** Ma nincs; a `kepzes.js` fejléce indokolja
      (a visszatérítés nyersanyagot teremtene). A képzés-panel gombja és
      parancs-ága KÉSZEN ÁLL (`kepzes_torles`), képesség-felismeréssel — ha a
      sim megkapja, a gomb magától életre kel.
- [ ] **Korszak-gát az építésnél.** A sim `epit` ága nem néz korszakot, és az AI
      sem — egy csak-UI-ban működő gát CSAK AZ EMBERT büntetné, és csendben
      átírná a balanszt. Az ág kész és bizonyított (`EP_KORSZAK_JAVASLAT`), egy
      sor kell hozzá, ha a követelmény bekerül a simbe.

---

## P2 — a terv többi része

- [ ] **v0.10/2 kampány** — el sem kezdődött.
- [ ] **v0.14 magyar + angol** — el sem kezdődött. A UI most csupa magyar
      szöveg; a panelek szövegei egy helyre gyűjtendők.
- [ ] **v0.15 SkyNet deploy.** ⚠️ A `vite.config.js` `base`-e `'./'` (relatív),
      a `PLAN.md` v0.15-ös kikötése viszont `/aotc/` — a kettő közül csak az
      egyik lehet a terv. Ez a kiadás-ellenőrző 57. figyelmeztetése.
- [ ] **v0.9/2b vége:** az egyedi egység saját alakja megvan (alabárdos bajnok,
      civenként példány-adatból változó), de a NYOLC NÉP külön modellje nincs.
- [ ] **Balansz:** a Hegyi bányász azonos nehézségen alulmarad a Folyami
      kereskedővel szemben (2050 vs 6885 összegyűjtött nyersanyag).
- [ ] **A gépi gazdaság étel-szűkös:** 12 000 tick után 15 étel áll raktáron
      2767 fa, 555 kő és 460 kristály mellett.
- [ ] **A kapu `nyitva` állapota nem látszik** — mindig nyitott átjáróként
      rajzolódik. `epulet_formak.js`.
- [ ] **Sérülés/rom nem látszik az épületeken** — vagy áll, vagy eltűnik.
- [ ] **Az épületek nem veszik figyelembe a hadi ködöt** (a v0.3 óta így van).

---

## Örökölt figyelmeztetések (a `npm run kiadas` 5 sárgája)

Egyik sem buktat, de mind valódi:

- [ ] 16. a sim-fejlécek nem mind követik a MIÉRT-idiómát
- [ ] 24. az `INTERFACES.md` `__aoc.verzio` példája elavult verziót mutat
- [ ] 39. a tudatosan rövid `EPULET`-táblák védettsége (lágy gát)
- [ ] 56. van halott fájl a `src/` alatt (main.js-ből vagy szondából elérhetetlen)
- [ ] 57. a `vite.config.js` `base`-e és a `PLAN.md` kirakási kikötése nem ér össze

---

## Amit NE csinálj

- **Ne írd át a szondát, ha bukik.** Hétszer égett meg ez a projekt zöld kapu
  melletti halott rendszeren; a szonda a barátod.
- **Ne kerüld meg az `fps_szonda.mjs` SwiftShader-szűrőjét**, és soha ne
  jelents felhőben mért FPS-t eredményként.
- **Ne hasonlíts össze tick-időt vagy FPS-t két külön alkalom között.** Ma
  mérve, ugyanaz a kód: load 43-on p95 20,8 ms, load 3-on 10,3 ms. Mérés előtt
  nézd meg a load average-t.
- **Ne tegyél render-oldali állapotot a simbe** — a lockstepen az azonnal
  desync.
