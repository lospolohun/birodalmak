// AGE OF THE CRYSTALS — DETERMINIZMUS-SZONDA.
//
// ── MIÉRT VAN ─────────────────────────────────────────────────────────────
// A játék lockstep multiplayerre készül (v0.8): minden gépen ugyanaz a
// parancs-sor fut, és az eredménynek BITRE azonosnak kell lennie. Ha nem az,
// a meccsek széttartanak, és nincs az a hálózati kód, ami ezt megjavítja —
// ilyenkor a SZIMULÁCIÓT kell újraírni. Ezért a determinizmus nem „majd
// ellenőrizzük" kérdés, hanem KAPU, ami már a v0.1-ben zár.
//
// Ez a szonda TISZTA NODE — nincs böngésző, nincs `three`, nincs DOM. Pont
// ez a lényege: ha a `src/sim/` node-ban fejen állva is lefut, akkor tényleg
// nem szivárgott bele render-függőség.
//
// ── TIZENÖT VIZSGÁLAT ─────────────────────────────────────────────────────
//   1. STATIKUS  — tiltott hívások keresése a `src/sim/` forrásában
//   2. FUTÁSI    — két friss `Sim`, azonos seed, 10 000 tick, hash-egyezés
//   3. KEVERT    — ugyanaz, de a tickek közé IDEGEN munkát ékelünk
//   4. KÖLTSÉG   — a sim tiszta tick-ideje 1600 egységnél (ms/tick)
//   5–9. VERZIÓ-KÖRÖK — v0.2 irányítás, v0.3 gazdaság, v0.4 harc,
//        v0.5 építkezés+technológia, v0.6 gépi ellenfél + v0.7 hadi köd
//   10. MENTÉS   — mentés/betöltés, majd FOLYTATÁS: a hash a formátum leírása
//   11. LOCKSTEP — két gép közös parancs-soron, késleltetéssel és desynccel
//   12. CIVEK    — nyolc nép; a záró gát az, hogy civ NÉLKÜL más világ jön ki
//   13. TÉRKÉPEK — hat preset; mind a hat JÁTSZHATÓ (bázistól bázisig van út)
//   14. A MECCS VÉGE — győzelem, feladás, és a vég UTÁNI parancsok elutasítása
//   15. v0.18 — képzési sor törlése és korszak-gát az építésnél
//
// ⚠️ A DETERMINIZMUS-KAPU NEM MŰKÖDÉS-KAPU. A semmittevés tökéletesen
// reprodukálható: a v0.3 gazdasága, a v0.4 épület-célzása és beszállásolása
// egyaránt ZÖLD kapu mellett volt halott. Ezért az 5–9. kör mindegyike
// tartalmaz MŰKÖDÉS-SZÁMOKAT is, amik nullánál buktatnak. A v0.6-ban ez már
// nem is elég: ott a KIADOTT SZÁNDÉK és az EREDMÉNY is össze van vetve (100
// építési parancs → 1 ház), mert a csendben elvesző parancsot a puszta
// „csinált-e valamit" kérdés sem fogja meg.
//
// A 3. a legalattomosabb hiba ellen véd: ha a sim bármit a GLOBÁLIS állapotból
// olvasna (megosztott gyorsítótár, `Math.random` sorozat-állása, GC-időzítés),
// akkor az eredmény attól függene, mi MÁS fut a gépen. Egy játékban ez pont
// úgy néz ki, mint egy „véletlenszerű, nem reprodukálható" desync.
//
// HASZNÁLAT:  node tools/determinizmus_szonda.mjs   ·   npm run det
//   --tick=N --parancs=N --hash=N --egyseg=N   (alap: 10000 / 250 / 100 / 1600)
// Kilépési kód: 0 = rendben, 1 = bukás.
//
// ⏱️ A teljes kör ~2 perc 20 mp (mérve, v0.6/3). A „~25 mp" itt sokáig ELAVULT
//    adatként állt — a kör azóta öt verzió-körrel bővült. A két legdrágább:
//    a 6. (v0.3 gazdaság, 29 mp: 1600 egység, 400 munkás, kimerülő lelőhelyek)
//    és a 9. (v0.6 gépi ellenfél, 22 mp: két AI, valódi csatákkal). Ez tudatos
//    költség — a lefedettség fontosabb, mint a kör hossza. Füstteszthez a
//    `--v06tick=4000` és társai lejjebb veszik.
//
// TÖRTÉNETI JEGYZET, mert tanulság: az első futásnál
//    ~9 PERC volt, és nem a tick-szám miatt — egyetlen `szondaParancs()` 1600
//    egységnél 4065 ms CPU-t vitt el (minden egység a SAJÁT alakzat-helyére kért
//    áramlási mezőt, a 8 elemű gyorstár csapkodott). A 4. vizsgálat mutatta ki;
//    a `Sim._vegrehajt` javítása után 3 ms. Ha ez a szám megint elszáll, ugyanaz
//    a hiba jött vissza.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const GYOKER = dirname(dirname(fileURLToPath(import.meta.url)));
// A `--simdir=` felülírás CSAK a statikus ellenőrzésre hat, és egyetlen célja
// van: a szonda ÖNVIZSGÁLATA. Egy szűrő, amiről sosem láttuk BUKNI, semmit nem
// bizonyít — mesterséges rossz fájlon ellenőrizhető, hogy tényleg fog.
const ervSzoveg = (nev) => {
  const a = process.argv.find((x) => x.startsWith('--' + nev + '='));
  return a === undefined ? null : a.slice(nev.length + 3);
};
const SIM_DIR = join(GYOKER, 'src', 'sim');
const STAT_DIR = ervSzoveg('simdir') || SIM_DIR;   // amit a statikus ellenőrzés néz

// `pathToFileURL` és nem nyers útvonal: a dinamikus `import()` URL-t vár, és
// szóközös/ékezetes könyvtárnévnél a nyers út csendben elszáll.
const { Sim } = await import(pathToFileURL(join(SIM_DIR, 'sim.js')).href);
const { SEED, CEL_EGYSEG } = await import(
  pathToFileURL(join(GYOKER, 'src', 'core', 'config.js')).href);
const { NEHEZSEG_NEV } = await import(pathToFileURL(join(SIM_DIR, 'ai.js')).href);
// v0.18 — a korszak-gát BEKAPCSOLT táblája. A `felallit` horognak a
// forgatókönyv-táblában kell, tehát modul-szinten kérjük be, nem a körben.
const { EPULET, EP_MERET, EP_KORSZAK, EP_KORSZAK_IGENY } = await import(
  pathToFileURL(join(SIM_DIR, 'epuletek.js')).href);

/**
 * A futás beállításai. Az ALAPÉRTELMEZÉS a teljes szerződés (10 000 tick),
 * de parancssorból lejjebb vehető füstteszthez:
 *   node tools/determinizmus_szonda.mjs --tick=2000
 * A rövid kör is kiszúrja a legtöbb desyncet; a teljes kör a kiadási kapu.
 * (A futásidő erősen függ a parancs-kezelés költségétől — lásd a 4. vizsgálat
 * történeti jegyzetét: egy útkeresés-regresszió percekre hizlalta a kört.)
 */
const ervSzam = (nev, alap) => {
  const a = process.argv.find((x) => x.startsWith('--' + nev + '='));
  return a === undefined ? alap : Number(a.split('=')[1]);
};
const TICKEK = ervSzam('tick', 10000);
const PARANCS_KOZ = ervSzam('parancs', 250);  // ennyi tickenként küldjük át a két sereget
const HASH_KOZ = ervSzam('hash', 100);        // ennyi tickenként hasonlítunk állapot-hasht
const EGYSEG = ervSzam('egyseg', CEL_EGYSEG); // 1600
/**
 * A v0.2 parancs-felület köre RÖVIDEBB, és ez tudatos költség-döntés: az a kör
 * tickenként nagyságrenddel több ÁLLAPOTOT mozgat (célzás, üldözés, állás-váltás
 * 1600 egységen), tehát drágább. A desyncek túlnyomó része az első pár száz
 * ticken belül kiütközik — a hosszú futás a v0.1 magjára van fenntartva.
 */
const V02_TICKEK = ervSzam('v02tick', 4000);
/**
 * A v0.3 gazdasági kör HOSSZABB, mint a v0.2-es. Nem a kód mérete miatt, hanem
 * mert a gazdaság lassú folyamat: a korszakváltás 400-600 tick, egy lelőhely
 * kimerülése több ezer, és épp a KIMERÜLÉS a legkockázatosabb ág (ott változik
 * a pálya járhatósága futás közben). Rövid körrel az sosem futna le.
 */
const V03_TICKEK = ervSzam('v03tick', 6000);
/**
 * A v0.4 harci kör RÖVIDEBB lehet: a seregek gyorsan összeérnek, és onnantól
 * tickenként több száz csapás esik. A halál — a szimuláció legdurvább
 * állapotváltozása — az első pár száz ticken belül tömegesen lefut.
 */
const V04_TICKEK = ervSzam('v04tick', 3000);

let bukas = 0;
const sor = (a, b, c) => console.log('  ' + String(a).padEnd(34) + String(b).padEnd(14) + (c ?? ''));
const cim = (t) => console.log('\n' + t + '\n' + '─'.repeat(78));

// ════════════════════════════════════════════════════════════════════════════
// 1) STATIKUS ELLENŐRZÉS
// ════════════════════════════════════════════════════════════════════════════
//
// MIT KERESÜNK ÉS MIÉRT:
//
//   · Math.sin/cos/tan/asin/acos/atan/atan2/exp/log/pow/hypot/cbrt
//     A TRANSZCENDENS függvények pontosságát az ECMAScript szabvány NYITVA
//     HAGYJA. A V8, a JSC és a SpiderMonkey más-más közelítést használ, sőt
//     ugyanaz a V8 is válthat verzió között. Egyetlen utolsó-bit eltérés egy
//     egység irányszögében néhány száz tick alatt látható szétcsúszássá nő.
//     Helyettük: `src/sim/fx.js` saját, csak `+ - * /`-ből épített közelítései.
//
//   · Math.random — gépenként MÁS sorozat. Helyette: `src/sim/rng.js` seedelt
//     generátora, ami a meccs-seedből indul.
//
//   · Date.now / performance.now — a sim csak TICK-számot ismerhet. Ha valós
//     időt olvasna, a lassabb gép más eredményt kapna, mint a gyorsabb.
//
//   · for…in — az objektum-kulcsok bejárási sorrendje szám-kulcsoknál és
//     törölt mezőknél motorfüggő tud lenni. Sorrendfüggő logikában ez desync.
//
// AMI VISZONT ENGEDÉLYEZETT (és NEM buktathat):
//   Math.floor, abs, min, max, ceil, round, imul, sqrt, sign
//   Ezek az IEEE-754 / ECMAScript szerint EGZAKTAN definiáltak: a `sqrt`
//   helyesen kerekített, a többi egész- vagy összehasonlítás-művelet. A
//   `Math.imul` ráadásul pont azért létezik, hogy 32 bites szorzás gépfüggetlen
//   legyen — az `allapotHash()` FNV-1a-ja is erre épül.
//
// ⚠️ KOMMENTEK ÉS STRINGEK NEM SZÁMÍTANAK. A `fx.js` fejléce hosszan SOROLJA a
//    tiltott neveket (épp azért, hogy ne használjuk őket), a `grid.js`/`sim.js`
//    pedig SAJÁT sin-közelítést tartalmaz, aminek a magyarázatában szintén
//    szerepel a „Math.sin". Ha ezekre buknánk, a szonda a saját dokumentációnkat
//    büntetné — ezért a forrást előbb megtisztítjuk.

/**
 * Kommentek és string-literálok kiürítése. A karaktereket SZÓKÖZRE cseréljük
 * (a sortöréseket meghagyva), így a sor- és oszlopszámok érvényesek maradnak.
 * @param {string} f a forrás
 * @returns {string} a tisztított forrás
 */
function tisztit(f) {
  const ki = new Array(f.length);
  let all = 0;   // 0 kód · 1 sor-komment · 2 blokk-komment · 3 ' · 4 " · 5 `
  for (let i = 0; i < f.length; i++) {
    const c = f[i], k = f[i + 1];
    const ujsor = c === '\n';
    if (all === 0) {
      if (c === '/' && k === '/') { all = 1; ki[i] = ' '; continue; }
      if (c === '/' && k === '*') { all = 2; ki[i] = ' '; continue; }
      if (c === "'") { all = 3; ki[i] = ' '; continue; }
      if (c === '"') { all = 4; ki[i] = ' '; continue; }
      if (c === '`') { all = 5; ki[i] = ' '; continue; }
      ki[i] = c;
      continue;
    }
    if (all === 1) { if (ujsor) all = 0; ki[i] = ujsor ? '\n' : ' '; continue; }
    if (all === 2) {
      if (c === '*' && k === '/') { ki[i] = ' '; ki[++i] = ' '; all = 0; continue; }
      ki[i] = ujsor ? '\n' : ' ';
      continue;
    }
    // string-literálok: az escape-elt idézőjel nem zár
    if (c === '\\') { ki[i] = ' '; ki[++i] = ' '; continue; }
    if ((all === 3 && c === "'") || (all === 4 && c === '"') || (all === 5 && c === '`')) all = 0;
    ki[i] = ujsor ? '\n' : ' ';
  }
  return ki.join('');
}

/**
 * A tiltott minták. A `Math.` előtagot KÖTELEZŐVÉ tesszük, különben a saját
 * `fxSin` / `fxAtan2` / `atanSzuk` neveink is buknának — pedig épp ők a
 * megoldás. Az alternációban a HOSSZABB név áll elöl (`atan2` az `atan` előtt,
 * `log10` a `log` előtt), különben a rövid nyerne és a `\b` elrontaná.
 */
const MINTAK = [
  [/\bMath\s*\.\s*(atan2|asin|acos|atan|sin|cos|tan|expm1|exp|log10|log1p|log2|log|pow|hypot|cbrt|random)\b/g,
    'tiltott Math-hívás (transzcendens vagy véletlen — motorfüggő)'],
  [/\bDate\s*\.\s*now\b/g, 'Date.now — a sim csak tick-számot ismerhet'],
  [/\bperformance\s*\.\s*now\b/g, 'performance.now — valós idő a simben'],
  [/\bfor\s*\(\s*(?:var|let|const)?\s*[A-Za-z_$][\w$]*\s+in\s/g,
    'for…in — motorfüggő kulcs-sorrend'],
];

/** Minden .js a `src/sim/` alatt, rekurzívan. */
function jsFajlok(dir) {
  const ki = [];
  for (const nev of readdirSync(dir).sort()) {
    const p = join(dir, nev);
    if (statSync(p).isDirectory()) ki.push(...jsFajlok(p));
    else if (nev.endsWith('.js')) ki.push(p);
  }
  return ki;
}

function statikus() {
  cim('1) STATIKUS ELLENŐRZÉS — tiltott hívások itt: ' + relative(GYOKER, STAT_DIR) + '/');
  const fajlok = jsFajlok(STAT_DIR);
  const talalat = [];
  console.log('  fájl                    sor  találat');
  console.log('  ' + '─'.repeat(74));
  for (const p of fajlok) {
    const nyers = readFileSync(p, 'utf8');
    const tiszta = tisztit(nyers);
    const sorok = tiszta.split('\n');
    let db = 0;
    for (let i = 0; i < sorok.length; i++) {
      for (const [re, magyarazat] of MINTAK) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(sorok[i])) !== null) {
          db++;
          talalat.push({ fajl: relative(GYOKER, p), sor: i + 1, mit: m[0].trim(), magyarazat });
        }
      }
    }
    const nev = relative(GYOKER, p);
    console.log('  ' + nev.padEnd(24) + String(sorok.length).padStart(4)
      + '  ' + (db === 0 ? 'tiszta' : db + ' TILTOTT'));
  }
  if (talalat.length) {
    console.log('\n  ⛔ TILTOTT HÍVÁSOK:');
    for (const t of talalat) {
      console.log(`     ${t.fajl}:${t.sor}  →  ${t.mit}`);
      console.log(`        ${t.magyarazat}`);
    }
    bukas++;
  } else {
    console.log('\n  ✓ ' + fajlok.length + ' fájl, egyetlen tiltott hívás sem.');
    console.log('    (engedélyezett és NEM bukik: Math.floor/abs/min/max/ceil/round/imul/sqrt/sign');
    console.log('     — ezek IEEE-754 szerint egzaktak; a kommentekben szereplő tiltott nevek sem)');
  }
  return talalat.length === 0;
}

// ════════════════════════════════════════════════════════════════════════════
// 2-3) FUTÁSI ELLENŐRZÉS
// ════════════════════════════════════════════════════════════════════════════

/**
 * Haladás-jelző a HIBA-kimenetre. MIÉRT: a teljes kör több perc (a parancs-
 * tüske miatt, lásd a 4. vizsgálatot), és egy néma, percekig álló szonda
 * megkülönböztethetetlen egy lefagyottól. A `stderr`-re megy, hogy a `> log`
 * átirányítás a táblázatot tisztán hagyja.
 */
function halad(t, osszes) {
  if (!process.stderr.isTTY) return;
  process.stderr.write('\r  … ' + t + '/' + osszes + ' tick   ');
}

/**
 * A FORGATÓKÖNYVEK — mit parancsolunk a seregeknek a futás közben.
 *
 * MIÉRT KETTŐ: a `v01` a motor-mag regresszió-őre, és SOSEM változhat, különben
 * a v0.1 mérései elveszítik az összehasonlítási alapjukat. A `v02` az irányítás
 * teljes felületét járja körbe (menet, támadó menet, megállás, tartás, állás,
 * alakzat) — az új kód a kockázatos kód, tehát annak is a kapun BELÜL a helye.
 */
const FORGATOKONYVEK = {
  v01: { nev: 'v0.1 menet-parancs', tickek: TICKEK, fut: (sim) => sim.szondaParancs() },
  v02: { nev: 'v0.2 teljes parancs-felület', tickek: V02_TICKEK, fut: (sim, kor) => sim.szondaParancsV02(kor) },
  v03: { nev: 'v0.3 gazdaság', tickek: V03_TICKEK, fut: (sim, kor) => sim.szondaParancsV03(kor) },
  v05: {
    nev: 'v0.5 építkezés, képzés, torony, piac, technológia', tickek: ervSzam('v05tick', 12000),
    egysegSzam: 60,
    // Minden MÁSODIK egység munkás. A négyelt alapfelállás mérve csapatonként
    // 7 munkást adott, és annyiból a piac (175 fa) sosem épült fel — piac
    // nélkül nincs kő, kő nélkül nincs torony, vagyis a v0.5/3 két új
    // alrendszere a determinizmus-kapun KÍVÜL maradt volna.
    felallas: { munkasMinden: 2 },
    fut: (sim, kor) => sim.szondaParancsV05(kor),
  },
  // A v0.6 köre KÜLÖNBÖZIK a többitől: nincs kézi parancs-lista, mert a
  // FORGATÓKÖNYV MAGA AZ AI. Pont ezt kell a kapunak őriznie — hogy a gép
  // döntései bitre reprodukálhatók. A `fut` ezért üres.
  v06: {
    nev: 'v0.6 gépi ellenfél (könnyű vs nehéz)', tickek: ervSzam('v06tick', 16000),
    egysegSzam: 24,
    felallit: (sim, db) => sim.szondaFelallasV06(db),
    fut: () => {},
  },
  // A v0.9 köre a v0.6-é, KÉT KÜLÖNBÖZŐ CIVVEL és azonos nehézséggel. Külön
  // kör, nem a v0.6 kibővítése: a v0.6-os számok a gépi ellenfél viszonyítási
  // alapjai, és ha a civ-bónuszok ráülnének, a nehézség-gátak (ki épít többet,
  // ki kutat) egy csapásra mást mérnének, mint amire íródtak.
  v09: {
    nev: 'v0.9 civilizációk (hegyi bányász vs folyami kereskedő)',
    tickek: ervSzam('v09tick', 16000),
    egysegSzam: 24,
    felallit: (sim, db) => sim.szondaFelallasV09(db),
    fut: () => {},
  },
  v04: {
    nev: 'v0.4 harc', tickek: V04_TICKEK,
    // Csapatonként 30 ostromgép — enélkül a v0.4/6 ága ki sem futna.
    felallas: { ostrom: 30 },
    fut: (sim, kor) => sim.szondaParancsV04(kor),
  },
  // ── v0.17: A MECCS VÉGE ─────────────────────────────────────────────
  // KÉT külön kör, mert egy meccs EGYSZER ér véget: ha ugyanabban a futásban
  // adnánk fel, a központ-rombolás ága ki sem futna. Így mindkét ok
  // végigmegy a kapun.
  //
  // ⚠️ A FELÁLLÁS ITT IS SZÁMÍT. A központ 1200 életerő, és az ostromgép az
  // egyetlen, ami ezt belátható időn belül lebontja (90 alapsebzés × 400 %
  // épületre). Ostromgép nélkül a kör 3000 tick alatt sem érne véget — a
  // győzelmi ág maradna a kapun kívül, és a zöld szonda egy soha el nem dőlő
  // meccset igazolna. Mérve: 60 egység, csapatonként 8 ostromgép → a 2014.
  // ticken dől el.
  v17: {
    nev: 'v0.17 győzelem — a központ elvesztése', tickek: ervSzam('v17tick', 3000),
    egysegSzam: 60,
    felallas: { ostrom: 8 },
    fut: (sim, kor) => sim.szondaParancsV17(kor),
  },
  v17f: {
    nev: 'v0.17 feladás', tickek: ervSzam('v17ftick', 1100),
    egysegSzam: 60,
    fut: (sim, kor) => sim.szondaParancsV17Feladas(kor),
  },
  // ── v0.18: SOR-TÖRLÉS ÉS KORSZAK-GÁT ────────────────────────────────
  //
  // EGY kör, KÉT új ág — és ez tudatos: a kettő ugyanabból a gazdaságból él.
  // A törléshez SOR kell (tehát képzés, tehát népesség és nyersanyag), a
  // korszak-gáthoz ÉPÍTÉSI KÍSÉRLET kell olyan épületre, amit a kor még nem
  // enged. A v0.5 köre mindkettőt megtermeli, ezért annak a motorját hívjuk,
  // és csak a két ÚJ parancsot tesszük mellé.
  //
  // ⚠️ A GÁT ITT BE VAN KAPCSOLVA (`felallit` → `korszakGat`), a JÁTÉKBAN NEM.
  // Az `epuletek.js` fejléce mondja el, miért: a gépi ellenfél ma egyetlen
  // korszakot sem vált, tehát élesen a gát nem visszafogná, hanem megszüntetné
  // mint ellenfelet (mérve: 13 → 4 álló épület, 156 építési parancsból 4). A
  // szabály ettől még KÉSZ, és a legrosszabb, amit tehetnénk, hogy a kapun
  // kívül hagyjuk — egy ki nem próbált ág az élesítés napján derülne ki.
  // Ezért járatja EZ a kör bekapcsolva, a saját sim-jén.
  v18: {
    nev: 'v0.18 képzési sor törlése + korszak-gát',
    tickek: ervSzam('v18tick', 6000),
    egysegSzam: 60,
    felallit: (sim, db) => {
      // Ugyanaz a felállás, mint a v0.5-é: a képzésnek népesség-fejtér kell,
      // különben a sor MINDIG üres marad, és nem lesz mit törölni.
      const n = sim.szondaFelallas(db, { munkasMinden: 2 });
      sim.epuletek.korszakGat(EP_KORSZAK_IGENY);
      // ⚠️ NYITÓ KÉSZLET, ÉS EZ IS MÉRÉS EREDMÉNYE. A kör NEM a gazdaságról
      // szól — az a 6. és a 8. vizsgálat dolga —, hanem két parancs-ágról. A
      // v0.5 nyitó készletével mérve 6000 tick alatt csapatonként 3 törlés
      // futott le, mert a sor a NYERSANYAG hiányában sosem nőtt kettőre (a
      // munkás 50 étel, a kör pedig az ételének a harmadát gyűjti). Egy
      // háromnál álló működés-szám hullámzó kapu: elég egy apró balansz-
      // mozdulat, és némán nullára esik — az ATADO 6. tanulsága szerint az
      // ilyen kapu rosszabb a bukónál, mert újrafuttatásra tanít.
      //
      // A készlet BEÁLLÍTÁSA nem kerüli meg a parancs-sort: felállás-idejű, a
      // két lockstep-futásban betűre ugyanaz, és a hash a 0. ticken már ezt
      // látja. Ugyanaz a fajta beavatkozás, mint a `felallas: { ostrom: 8 }`.
      for (let cs = 0; cs < 2; cs++) {
        sim.gazdasag.keszlet[cs * 4 + 0] = 1500;   // étel — ebből lesz sor
        sim.gazdasag.keszlet[cs * 4 + 1] = 1500;   // fa   — ebből lesz ház
      }
      return n;
    },
    fut: (sim, kor) => v18Kor(sim, kor),
  },
  // ⚠️ 1100 ÉS NEM 1000, ÉS EZ NEM KEREKÍTÉS. A parancsok `PARANCS_KOZ`-önként
  // (250) mennek ki, tehát a 4. kör — a vég UTÁNI, ELUTASÍTANDÓ feladás — a
  // 1000. ticken kerül beadásra, és a `KESLELTETES` miatt a 1002.-on hajtódna
  // végre. Ezer ticknél tehát pont az az ág maradt kívül, amiért a kör van:
  // a szonda ki is írta („A VÉG UTÁNI FELADÁST SENKI NEM UTASÍTOTTA EL").
  // Ha valaki a `--v17ftick` kapcsolóval 1002 alá viszi, ez az ág újra néma
  // lesz — a gát viszont szólni fog, nem hallgat.
};

/**
 * A v0.18 KÖRE — egy parancs-forduló a sor-törlésre és a korszak-gátra.
 *
 * ⚠️ MIÉRT ITT VAN, ÉS NEM A `sim.js`-BEN, mint a többi forgatókönyv. A
 * `szondaParancsV05` és társai a sim példány-metódusai; ez a kör szándékosan a
 * MEGLÉVŐ felületből dolgozik (`szondaParancsV05` + nyers `sim.parancs()`),
 * mert így egyetlen új sim-metódus nélkül járatja a két új ágat. Ha valaha
 * `Sim.szondaParancsV18()` lesz belőle, ez a függvény egy sorra fogy — a
 * forgatókönyv tartalma nem változik.
 *
 * @param {import('../src/sim/sim.js').Sim} sim
 * @param {number} kor a hányadik parancs-forduló
 */
function v18Kor(sim, kor) {
  // A gazdaság, az építkezés és a képzés motorja a v0.5 köre. Abból lesz SOR,
  // amit törölni lehet, és abból lesz PIAC/TORONY-rendelés, amit a sötét korban
  // a gát elutasít.
  sim.szondaParancsV05(kor);

  for (let cs = 0; cs < 2; cs++) {
    const bx = (cs === 0 ? sim.n * 0.22 : sim.n * 0.78) | 0;
    const by = (sim.n * 0.5) | 0;

    // ⚠️ TÖBB HÁZ, MINT A v0.5 KÖRÉBEN — ÉS EZ MÉRÉS EREDMÉNYE. A törlés csak
    // akkor tud lefutni, ha VAN legalább kételemű sor, a sor hosszát viszont a
    // NÉPESSÉG szabja meg: a v0.5 négy házával mérve 6000 tick alatt összesen
    // 2 törlés jött össze csapatonként, mert a képzés sorbaállásai a
    // népesség-plafonon utasítódtak el (88 elutasítás 20 sikeres mellett). Négy
    // további ház a plafont 40-nel emeli, és onnan a sor tényleg megnő.
    //
    // A fát ehhez ITT VAN MIBŐL fizetni: ebben a körben a gát BE VAN
    // KAPCSOLVA, tehát a piac (175 fa) és a torony (50 fa + 125 kő) rendelése
    // úgyis elutasításba fut — az a fa amúgy is a raktárban maradna.
    for (let k = 0; k < 4; k++) {
      sim.parancs({ fajta: 'epit', csapat: cs, tipus: EPULET.HAZ,
        x: bx - 5 - k * 3, y: by - 8 });
    }

    // ⚠️ OSTROMMŰHELY MINDEN KÖRBEN — SZÁNDÉKOSAN A KORSZAK-GÁTNAK. A kör
    // gazdaságával mérve mindkét csapat eljut a HAJNAL koráig (a piac és a
    // torony onnantól már felépül), a KRISTÁLY koráig viszont nem — az 800
    // étel + 200 kristály nagyságrenddel több. Ez a rendelés tehát az EGÉSZ
    // futás alatt a gátba fut, és nem attól függ, milyen gyorsan gyűlik a
    // nyersanyag: enélkül a működés-szám a korszakváltás pillanatában
    // ELAPADNA, és egy gyorsuló gazdaság némán nullára vinné.
    sim.parancs({ fajta: 'epit', csapat: cs, tipus: EPULET.OSTROMMUHELY,
      x: bx + 12, y: by + 12 });

    // KORSZAKVÁLTÁS MINDEN KÖRBEN. Enélkül a gát MINDIG igaz maradna, és egy
    // örökké tiltó gát pont annyit bizonyít, mint egy örökké engedő: semmit.
    // A `korszakIndit` magától elutasít, ha nem telik rá — vak parancs, de a
    // v0.5 építési sora is így dolgozik, és pont ez a mintája.
    sim.parancs({ fajta: 'korszak', csapat: cs });

    // MINDEN saját sorból törlünk egyet, RÖGZÍTETT index-sorrendben — nem csak
    // a leghosszabból. Nem bőség: a leghosszabb sorra szűkítve mérve 6000 tick
    // alatt összesen 2 törlés futott le csapatonként, és egy KETTŐ-nél álló
    // működés-szám a legrosszabb fajta gát: elég egy apró balansz-mozdulat
    // (drágább lándzsás, szűkebb népesség), és némán nullára esik.
    //
    // ⚠️ CSAK KETTŐTŐL TÖRLÜNK, ÉS EZ NEM ÓVATOSSÁG. Ha minden körben az
    // egyelemű sort is ürítenénk, a kör SOHA nem képezne ki egyetlen egységet
    // sem — a törlés-ág zölden futna, közben a képzés-ág halna meg alatta, és
    // a szonda pont azt nem venné észre, amiért van. Így a sor ELEJE végig
    // dolgozik, a törlés pedig a mögötte állót viszi el.
    let ep = -1;
    for (let i = 0; i < sim.epuletek.db; i++) {
      if (sim.epuletek.csapat[i] !== cs || !sim.epuletek.el(i)) continue;
      const db = sim.kepzes.sorDb[i];
      if (db < 2) continue;
      ep = i;   // a legutolsó ilyen épület kell az érvénytelen próbákhoz is
      sim.parancs({ fajta: 'kepzes_torles', csapat: cs, epulet: i, index: db - 1 });
    }
    if (ep < 0) {
      // Ha egyetlen sor sem nőtt kettőre, a saját központ kell az érvénytelen
      // törlésekhez — azoknak ATTÓL FÜGGETLENÜL le kell futniuk, hogy van-e mit
      // törölni: pont az elutasító ágat vizsgálják.
      for (let i = 0; i < sim.epuletek.db; i++) {
        if (sim.epuletek.csapat[i] === cs && sim.epuletek.el(i)) { ep = i; break; }
      }
    }

    // SZÁNDÉKOSAN ÉRVÉNYTELEN TÖRLÉSEK, negyedik körönként. Az elutasító ág a
    // legveszélyesebb: ha az egyik gépen átmegy, amit a másik eldob, az azonnali
    // desync — ugyanaz a fajta, mint a v0.17 vég utáni parancsainál.
    if (ep >= 0 && (kor % 4) === 3) {
      // (a) az ELLENFÉL sorára — ez ingyenes szabotázs lenne
      sim.parancs({ fajta: 'kepzes_torles', csapat: 1 - cs, epulet: ep, index: 0 });
      // (b) tartományon kívüli sor-index
      sim.parancs({ fajta: 'kepzes_torles', csapat: cs, epulet: ep, index: 99 });
    }
  }
}

/** Friss sim, felállítva. A `Sim` konstruktora MINDENT újraépít (rács, mező). */
function ujSim(fk) {
  const s = new Sim({ seed: SEED, n: 256, maxEgyseg: 2000 });
  // A forgatókönyv megadhat FELÁLLÁS-beállítást. A v0.1-é üres marad: az a
  // motor-mag regresszió-őre, és a mérési alapja sem változhat.
  // A forgatókönyv felülírhatja az egységszámot. A v0.5-nek KIS sereg kell:
  // 1600 egység önmagában 800 népesség csapatonként, és ott a képzés MINDIG
  // elutasításba futna — vagyis a legfrissebb kód maradna a kapun kívül.
  // A v0.6 köre SAJÁT felállítót hoz: ott mindkét csapatot a GÉP veszi át, és
  // az átadás a felállás UTÁN kell történjen (a `szondaFelallas` nullázza az
  // AI-t). Ezért kaphat a forgatókönyv `felallit` horgot a szokásos helyett.
  const db = (fk && fk.felallit)
    ? fk.felallit(s, (fk.egysegSzam) || EGYSEG)
    : s.szondaFelallas((fk && fk.egysegSzam) || EGYSEG, fk && fk.felallas);
  return { sim: s, db };
}

/**
 * Két friss sim lockstepben. Az ELSŐ eltérésnél megáll, és a PONTOS ticket
 * adja vissza — ez az, amit egy desync-jelentésnél tudni kell.
 * @returns {{ok:boolean, tick:number, a:number, b:number, hashek:Map<number,number>}}
 */
function ketFutas(fk) {
  const A = ujSim(fk), B = ujSim(fk);
  const hashek = new Map();
  hashek.set(0, A.sim.allapotHash());
  if (A.sim.allapotHash() !== B.sim.allapotHash()) {
    return { ok: false, tick: 0, a: A.sim.allapotHash(), b: B.sim.allapotHash(), hashek, db: A.db };
  }
  let kor = 0;
  for (let t = 1; t <= fk.tickek; t++) {
    if ((t % PARANCS_KOZ) === 0) { fk.fut(A.sim, kor); fk.fut(B.sim, kor); kor++; halad(t, fk.tickek); }
    A.sim.lep();
    B.sim.lep();
    if ((t % HASH_KOZ) === 0) {
      const ha = A.sim.allapotHash(), hb = B.sim.allapotHash();
      hashek.set(t, ha);
      if (ha !== hb) return { ok: false, tick: t, a: ha, b: hb, hashek, db: A.db };
    }
  }
  return { ok: true, tick: fk.tickek, a: 0, b: 0, hashek, db: A.db };
}

/**
 * KEVERT futás: ugyanaz a forgatókönyv, de a tickek közé IDEGEN munkát
 * ékelünk — nagy tömb-allokáció (GC-nyomás), `Math.random` hívások a simen
 * KÍVÜL, és `JSON.stringify`. Ha a sim bármit a globális állapotból olvasna,
 * itt szétcsúszna. Az elvárás: BITRE ugyanaz a hash-sorozat.
 * @param {Map<number,number>} vart a tiszta futás hash-sorozata
 */
function kevertFutas(vart, fk) {
  const { sim } = ujSim(fk);
  let szemet = 0;   // hogy a JIT ne optimalizálja ki az idegen munkát
  const zavar = (t) => {
    const tomb = new Float64Array(20000);
    for (let i = 0; i < tomb.length; i += 97) tomb[i] = Math.random() * 1e6;
    szemet += tomb[t % tomb.length];
    // szándékosan objektum-kulcs bejárás + JSON — a legzajosabb globális munka
    const o = { a: Math.random(), b: [1, 2, 3], c: 'zaj' + t };
    szemet += JSON.stringify(o).length;
    for (const k in o) szemet += k.length;
  };
  const h0 = sim.allapotHash();
  if (h0 !== vart.get(0)) return { ok: false, tick: 0, a: vart.get(0), b: h0, szemet };
  let kor = 0;
  for (let t = 1; t <= fk.tickek; t++) {
    zavar(t);
    if ((t % PARANCS_KOZ) === 0) { fk.fut(sim, kor); kor++; halad(t, fk.tickek); }
    sim.lep();
    if ((t % HASH_KOZ) === 0) {
      const h = sim.allapotHash();
      if (h !== vart.get(t)) return { ok: false, tick: t, a: vart.get(t), b: h, szemet };
    }
  }
  return { ok: true, tick: fk.tickek, a: 0, b: 0, szemet };
}

// ════════════════════════════════════════════════════════════════════════════
// 4) TICK-KÖLTSÉG
// ════════════════════════════════════════════════════════════════════════════
//
// MIÉRT ITT MÉRJÜK: a képkocka-büdzsé 16,7 ms. Ebből a sim FIX részt visz el,
// és az a rész NEM a GPU-tól függ. Ha a tiszta tick-idő már önmagában 8 ms,
// akkor a rendernek 8 ms marad — ezt az FPS-szonda előtt kell tudni, mert
// utólag a render-optimalizálás nem segítene rajta.
//
// ⚠️ A sim 20 Hz-en fut, a render 60-on: EGY képkockára átlagosan HARMAD tick
//    jut. Ezért a „képkockánkénti sim-teher" a mért ms/tick harmada — de a
//    tickes képkocka a TELJES tick-időt nyeli le, tehát az AKADÁS mértéke a
//    teljes ms/tick. Mindkettőt kiírjuk.
//
// ⚠️⚠️ KÉT KÜLÖN SZÁM, ÖSSZEKEVERNI HIBA VOLNA:
//   · MOZGÓ tick — menetelő sereg, parancs nélkül. Ez a KÉPKOCKA-BÜDZSÉ tétele.
//   · PARANCS-tick — a `szondaParancs()` tickje, vagyis az útkeresés ára.
//   Ha ezt a kettőt átlagolnánk, egy szép, hamis „ms/tick" jönne ki, ami épp a
//   játék legdurvább akadását tüntetné el. Ezért mérjük külön — és ez a szonda
//   ELSŐ éles futásán azonnal ki is fogott egy valódi hibát:
//
//     A `Sim._vegrehajt` minden egységnek a SAJÁT alakzat-helyére kért mezőt,
//     így 1600 egység ~1500 különböző célcellát kért, a `MezoTar` viszont 8-at
//     tart → ~1500 teljes Dijkstra EGYETLEN ticken belül: 4065 ms, azaz ~243
//     kihagyott képkocka. A javítás (EGY közös mező a csoportnak) után: 3 ms.
//
//   Ezért marad benne a mérés: ez most már REGRESSZIÓ-ŐR. Ha újra száz ms fölé
//   megy, ugyanaz a hiba jött vissza.
function tickKoltseg() {
  const { sim, db } = ujSim();
  sim.szondaParancs();
  for (let i = 0; i < 400; i++) sim.lep();   // bemelegítés: JIT + mozgásban lévő sereg

  // a) MOZGÓ SEREG, parancs nélkül. A mérés előtt friss parancsot adunk, és
  //    megvárjuk, hogy hasson (`KESLELTETES` = 2 tick) — így a teljes ablakban
  //    minden egység MEGY állapotban van. MIÉRT: az álló egység a
  //    `_sebessegek()` elején kiesik, tehát az álló sereg olcsó. Ha a mérés
  //    beleérne a megérkezés utáni időbe, egy hamisan alacsony ms/tick jönne ki,
  //    épp arra az esetre, ami a játékban sosem érdekes.
  const MERT = 1000;
  sim.szondaParancs();
  sim.lep(); sim.lep(); sim.lep();     // a parancs-tüske NEM része a mérésnek
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < MERT; i++) sim.lep();
  const t1 = process.hrtime.bigint();
  const msPerTick = Number(t1 - t0) / 1e6 / MERT;
  // hány egység van tényleg mozgásban a mérés végén — a szám hitelesítése
  let mozgo = 0;
  for (let i = 0; i < sim.egysegek.db; i++) if (sim.egysegek.allapot[i] === 1) mozgo++;

  // b) parancs-tüske — háromszor, a szórás miatt a MEDIÁNT vesszük
  const tuskek = [];
  for (let r = 0; r < 3; r++) {
    const p0 = process.hrtime.bigint();
    sim.szondaParancs();
    sim.lep();   // a parancs a KESLELTETES miatt nem itt, hanem 2 tick múlva hat
    sim.lep();
    sim.lep();
    tuskek.push(Number(process.hrtime.bigint() - p0) / 1e6);
    for (let i = 0; i < 120; i++) sim.lep();   // hagyjuk elrendeződni a sereget
  }
  tuskek.sort((a, b) => a - b);
  return { db, msPerTick, mozgo, parancsMs: tuskek[1], mezoSzamitas: sim.mezoTar.szamitasok };
}

// ════════════════════════════════════════════════════════════════════════════
// FUTTATÁS
// ════════════════════════════════════════════════════════════════════════════

console.log('AGE OF THE CRYSTALS — determinizmus-szonda');
console.log('seed ' + SEED + ' · ' + EGYSEG + ' egység · ' + TICKEK + ' tick · '
  + 'parancs/' + PARANCS_KOZ + ' · hash/' + HASH_KOZ + ' · node ' + process.version);

const statOk = statikus();

cim('2) FUTÁSI ELLENŐRZÉS — két friss Sim, azonos seed, lockstep');
const t2 = Date.now();
const ket = ketFutas(FORGATOKONYVEK.v01);
const ido2 = ((Date.now() - t2) / 1000).toFixed(1);
sor('forgatókönyv', FORGATOKONYVEK.v01.nev);
sor('felállított egység', ket.db, '(kért: ' + EGYSEG + ')');
sor('lefutott tick', ket.tick, '(' + ido2 + ' mp, két sim párhuzamosan)');
if (ket.ok) {
  sor('hash-összevetés', 'AZONOS', (TICKEK / HASH_KOZ) + ' ellenőrzőpont, mind egyezik');
  sor('záró hash', '0x' + ket.hashek.get(TICKEK).toString(16).padStart(8, '0'));
  console.log('\n  ✓ A két futás BITRE azonos.');
} else {
  sor('hash-összevetés', 'ELTÉRÉS');
  console.log('\n  ⛔ DESYNC a(z) ' + ket.tick + '. ticken:');
  console.log('       A: 0x' + (ket.a >>> 0).toString(16).padStart(8, '0'));
  console.log('       B: 0x' + (ket.b >>> 0).toString(16).padStart(8, '0'));
  console.log('     Az eltérés a(z) ' + Math.max(0, ket.tick - HASH_KOZ) + '. és '
    + ket.tick + '. tick KÖZÖTT keletkezett.');
  bukas++;
}

cim('3) KEVERT FUTÁS — idegen munka a tickek között (globális szivárgás)');
let kevert = { ok: false, tick: 0, a: 0, b: 0, szemet: 0 };
if (ket.ok) {
  const t3 = Date.now();
  kevert = kevertFutas(ket.hashek, FORGATOKONYVEK.v01);
  const ido3 = ((Date.now() - t3) / 1000).toFixed(1);
  sor('zavarás', 'Float64Array(20000) + Math.random + JSON.stringify + for…in');
  sor('lefutott tick', kevert.tick, '(' + ido3 + ' mp)');
  if (kevert.ok) {
    sor('hash-összevetés', 'AZONOS', 'a tiszta futás sorozatával');
    console.log('\n  ✓ A sim NEM olvas a globális állapotból: az eredmény független attól,');
    console.log('    mi más fut a gépen. (Ez zárja ki a „nem reprodukálható" desyncet.)');
  } else {
    console.log('\n  ⛔ ELTÉRÉS a(z) ' + kevert.tick + '. ticken — a sim KISZIVÁROG a globális állapotba:');
    console.log('       tiszta: 0x' + (kevert.a >>> 0).toString(16).padStart(8, '0'));
    console.log('       kevert: 0x' + (kevert.b >>> 0).toString(16).padStart(8, '0'));
    bukas++;
  }
} else {
  console.log('  — kihagyva: a 2) vizsgálat már bukott, előbb azt kell megjavítani.');
}

cim('4) TICK-KÖLTSÉG — a sim tiszta CPU-ideje ' + EGYSEG + ' egységnél');
const k = tickKoltseg();
const BUDZSE = 16.7;
sor('tick (mozgó sereg)', k.msPerTick.toFixed(3) + ' ms',
  k.db + ' egység, 1000 mért tick · a végén ' + k.mozgo + ' van még úton');
sor('tick / mp (elméleti max)', Math.round(1000 / k.msPerTick));
sor('sim-teher képkockánként', (k.msPerTick / 3).toFixed(3) + ' ms',
  '(20 Hz sim / 60 Hz render → 1/3 tick per képkocka)');
sor('a 16,7 ms büdzséből', (100 * k.msPerTick / 3 / BUDZSE).toFixed(1) + ' %',
  'marad a rendernek: ' + (BUDZSE - k.msPerTick / 3).toFixed(2) + ' ms');
if (k.msPerTick > BUDZSE) {
  console.log('\n  ⚠️ Egy TICKES képkocka önmagában túllépi a büdzsét (' + k.msPerTick.toFixed(2)
    + ' ms > 16,7 ms) → látható akadás 20 Hz-enként, render nélkül is.');
}
console.log('');
sor('PARANCS-tüske', k.parancsMs.toFixed(0) + ' ms', 'egyetlen menetparancs 1600 egységre');
sor('  ez hány képkocka 60 Hz-en', Math.round(k.parancsMs / 16.7) + ' képkocka',
  'kihagyva — ennyi ideig BEFAGY a lap');
sor('  kiszámolt áramlási mező', k.mezoSzamitas, 'a MezoTar kapacitása 8');
if (k.parancsMs > 100) {
  console.log('\n  ⛔ ÚTKERESÉS-REGRESSZIÓ (nem determinizmus-hiba, a kapu nem bukik rá):');
  console.log('     Egy menetparancsnak ~3 ms-ba kell kerülnie, mert EGY áramlási mező');
  console.log('     szolgálja ki az egész csoportot. A fenti „kiszámolt áramlási mező"');
  console.log('     szám elárulja, mi történt: ha nem 1-2, hanem sok száz, akkor megint');
  console.log('     minden egység a SAJÁT alakzat-helyére kér mezőt, a 8 elemű gyorstár');
  console.log('     csapkod, és ticként több száz Dijkstra fut le.');
  console.log('     Ez a hiba EGYSZER MÁR MEGVOLT (4065 ms = ~243 kihagyott képkocka).');
  console.log('     JAVÍTÁS: a `Sim._vegrehajt` a KÖZÖS célcellára kérje a mezőt, és azt');
  console.log('     adja át minden egységnek; az alakzat-eltolás csak a végpont legyen.');
}

// ════════════════════════════════════════════════════════════════════════════
// 5) v0.2 PARANCS-FELÜLET
// ════════════════════════════════════════════════════════════════════════════
//
// MIÉRT KÜLÖN VIZSGÁLAT: a 2-3. a v0.1 menet-parancsát járatja, ami a motor-mag
// regresszió-őre — azt szándékosan nem bántjuk. De attól, hogy a mag stabil, az
// irányítás rétege (célzás, üldözés, állás-váltás, alakzat) még bármit
// csinálhat: ÚJ, hasított állapotot ír (`parancs`, `allas`, `celEgyseg`), és
// pont az új kód a kockázatos. Ez a kör azt a felületet járja végig.
//
// A célkeresés a legesélyesebb desync-forrás az egész v0.2-ben: két, egymásra
// tükrözött sereg tele van BITRE azonos távolságokkal, és ha a döntetlent nem
// az index oldaná fel, a vödör-bejárás sorrendje döntene — gépenként másképp.
cim('5) v0.2 PARANCS-FELÜLET — teljes irányítás-kör, két friss Sim');
const t5 = Date.now();
const ketV02 = ketFutas(FORGATOKONYVEK.v02);
let kevertV02 = { ok: false, tick: 0, a: 0, b: 0 };
sor('forgatókönyv', FORGATOKONYVEK.v02.nev);
sor('parancsok', 'menet · támadó menet · megállás · tartás · állás · alakzat');
sor('lefutott tick', ketV02.tick, '(' + ((Date.now() - t5) / 1000).toFixed(1) + ' mp)');
if (ketV02.ok) {
  sor('két futás', 'AZONOS', (V02_TICKEK / HASH_KOZ) + ' ellenőrzőpont');
  sor('záró hash', '0x' + ketV02.hashek.get(V02_TICKEK).toString(16).padStart(8, '0'));
  kevertV02 = kevertFutas(ketV02.hashek, FORGATOKONYVEK.v02);
  if (kevertV02.ok) {
    sor('kevert futás', 'AZONOS', 'a tiszta futás sorozatával');
    console.log('\n  ✓ Az irányítás rétege is determinisztikus: a célzás, az üldözés,');
    console.log('    az állás-váltás és az alakzat-hozzárendelés bitre reprodukálható.');
  } else {
    console.log('\n  ⛔ ELTÉRÉS a(z) ' + kevertV02.tick + '. ticken a KEVERT futásban:');
    console.log('       tiszta: 0x' + (kevertV02.a >>> 0).toString(16).padStart(8, '0'));
    console.log('       kevert: 0x' + (kevertV02.b >>> 0).toString(16).padStart(8, '0'));
    bukas++;
  }
} else {
  console.log('\n  ⛔ DESYNC a(z) ' + ketV02.tick + '. ticken:');
  console.log('       A: 0x' + (ketV02.a >>> 0).toString(16).padStart(8, '0'));
  console.log('       B: 0x' + (ketV02.b >>> 0).toString(16).padStart(8, '0'));
  console.log('     ELSŐNEK NÉZD MEG: a `parancsallapot.js` célkeresésének döntetlen-');
  console.log('     szabályát (azonos távolságnál a KISEBB index nyer), és az');
  console.log('     `alakzat.js` rendezés-komparátorát (a harmadik kulcs az index).');
  console.log('     Ez a két hely dönt sorrendről, tehát ez a két hely tud desyncelni.');
  bukas++;
}

// ════════════════════════════════════════════════════════════════════════════
// 6) v0.3 GAZDASÁG
// ════════════════════════════════════════════════════════════════════════════
//
// MIÉRT A LEGKOCKÁZATOSABB KÖR: itt VÁLTOZIK A PÁLYA futás közben. A kimerült
// erdő cellája megnyílik, a lerakott raktáré bezárul — és az áramlási mezők a
// járhatóságból épülnek, gyorsítótárból. Ha az érvénytelenítés akár egy ticket
// késik, a két futás ugyanazt a hibát csinálja (tehát nem itt bukik), de a
// lockstepben egy MÁSIK gép, ami épp más ütemben ért oda, mást lát.
//
// A második veszélyforrás a munkás-óra: a gyűjtés nem egész sebességű, és ha
// lebegőpontos akkumulátorral számolnánk, tízezer tick alatt gépenként más
// maradék jönne ki. Ezért egész számláló — és ezért van benne a hashben.
cim('6) v0.3 GAZDASÁG — gyűjtés, építés, korszakváltás, két friss Sim');
const t6 = Date.now();
const ketV03 = ketFutas(FORGATOKONYVEK.v03);
let kevertV03 = { ok: false, tick: 0, a: 0, b: 0 };
sor('forgatókönyv', FORGATOKONYVEK.v03.nev);
sor('parancsok', 'gyűjtés (4 nyersanyag) · raktár-építés · korszakváltás · félbeszakítás');
sor('lefutott tick', ketV03.tick, '(' + ((Date.now() - t6) / 1000).toFixed(1) + ' mp)');
if (ketV03.ok) {
  sor('két futás', 'AZONOS', (V03_TICKEK / HASH_KOZ) + ' ellenőrzőpont');
  sor('záró hash', '0x' + ketV03.hashek.get(V03_TICKEK).toString(16).padStart(8, '0'));
  kevertV03 = kevertFutas(ketV03.hashek, FORGATOKONYVEK.v03);
  if (kevertV03.ok) {
    sor('kevert futás', 'AZONOS', 'a tiszta futás sorozatával');
    console.log('\n  ✓ A gazdaság is determinisztikus: a gyűjtés, a lelőhely-kimerülés,');
    console.log('    az építés és a korszakváltás bitre reprodukálható — a futás közben');
    console.log('    változó járhatóság mellett is.');
  } else {
    console.log('\n  ⛔ ELTÉRÉS a(z) ' + kevertV03.tick + '. ticken a KEVERT futásban:');
    console.log('       tiszta: 0x' + (kevertV03.a >>> 0).toString(16).padStart(8, '0'));
    console.log('       kevert: 0x' + (kevertV03.b >>> 0).toString(16).padStart(8, '0'));
    bukas++;
  }
} else {
  console.log('\n  ⛔ DESYNC a(z) ' + ketV03.tick + '. ticken:');
  console.log('       A: 0x' + (ketV03.a >>> 0).toString(16).padStart(8, '0'));
  console.log('       B: 0x' + (ketV03.b >>> 0).toString(16).padStart(8, '0'));
  console.log('     ELSŐNEK NÉZD MEG: a `Sim._mezoErvenytelenites()`-t (a járhatóság');
  console.log('     futás közbeni változása), a `munkas.js` egész gyűjtő-óráját, és az');
  console.log('     `eroforras.js` keresésének döntetlen-szabályát. Ez a három hely');
  console.log('     nyúl olyasmihez, ami tickenként és gépenként elcsúszhat.');
  bukas++;
}

// A gazdaság ELINDULT-e egyáltalán? Egy zöld determinizmus-kapu semmit nem ér,
// ha a munkások közben egy szem fát sem hoztak be — az is „reprodukálható".
{
  const { Sim } = await import(pathToFileURL(join(SIM_DIR, 'sim.js')).href);
  const s = new Sim({ seed: SEED, n: 256, maxEgyseg: 2000 });
  s.szondaFelallas(EGYSEG);
  for (let t = 1; t <= 3000; t++) {
    if ((t % PARANCS_KOZ) === 0) s.szondaParancsV03((t / PARANCS_KOZ) | 0);
    s.lep();
  }
  const g0 = s.gazdasag.allapot(0), g1 = s.gazdasag.allapot(1);
  const be = s.gazdasag.osszegyujtott;
  const ossz = be[0] + be[1] + be[2] + be[3] + be[4] + be[5] + be[6] + be[7];
  console.log('');
  sor('3000 tick alatt begyűjtve', ossz, 'étel/fa/kő/kristály, mindkét csapat');
  sor('csapat 0 készlete', g0.etel + ' / ' + g0.fa + ' / ' + g0.ko + ' / ' + g0.kristaly,
    'korszak: ' + g0.korszak + (g0.valtasHatra ? ' (vált, ' + g0.valtasHatra + ' tick)' : ''));
  sor('csapat 1 készlete', g1.etel + ' / ' + g1.fa + ' / ' + g1.ko + ' / ' + g1.kristaly,
    'korszak: ' + g1.korszak + (g1.valtasHatra ? ' (vált, ' + g1.valtasHatra + ' tick)' : ''));
  sor('épület', s.epuletek.db, 'kezdő központ csapatonként + épített raktárak');
  if (ossz === 0) {
    console.log('\n  ⛔ A GAZDASÁG NEM INDULT EL: nulla nyersanyag jött be 3000 tick alatt.');
    console.log('     A determinizmus-kapu ettől még zöld lehet — a semmittevés is');
    console.log('     tökéletesen reprodukálható. Nézd meg a `munkas.js` állapotgépét.');
    bukas++;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 7) v0.4 HARC
// ════════════════════════════════════════════════════════════════════════════
//
// MIÉRT A LEGDURVÁBB ÁLLAPOTVÁLTOZÁS: a HALÁL. Egy egység egyetlen ticken belül
// esik ki a mozgásból, a célzásból, a térbeli hasítótáblából és a képből —
// miközben mások épp őt célozták. Ha bármelyik ág egy tickkel később venné
// észre, a két gép más csatát vívna.
//
// A sebzés ezért végig EGÉSZ: az ellensúly-szorzó százalékban, egész osztással.
// Egyetlen életerő-pont eltérése dönti el, hogy egy katona túlél-e egy csapást.
cim('7) v0.4 HARC — ellensúlyok, páncél, halál, két friss Sim');
const t7 = Date.now();
const ketV04 = ketFutas(FORGATOKONYVEK.v04);
let kevertV04 = { ok: false, tick: 0, a: 0, b: 0 };
sor('forgatókönyv', FORGATOKONYVEK.v04.nev);
sor('lefutott tick', ketV04.tick, '(' + ((Date.now() - t7) / 1000).toFixed(1) + ' mp)');
if (ketV04.ok) {
  sor('két futás', 'AZONOS', (V04_TICKEK / HASH_KOZ) + ' ellenőrzőpont');
  sor('záró hash', '0x' + ketV04.hashek.get(V04_TICKEK).toString(16).padStart(8, '0'));
  kevertV04 = kevertFutas(ketV04.hashek, FORGATOKONYVEK.v04);
  if (kevertV04.ok) {
    sor('kevert futás', 'AZONOS', 'a tiszta futás sorozatával');
    console.log('\n  ✓ A harc is determinisztikus: a sebzés, a páncél, az ellensúlyok');
    console.log('    és a halál bitre reprodukálható.');
  } else {
    console.log('\n  ⛔ ELTÉRÉS a(z) ' + kevertV04.tick + '. ticken a KEVERT futásban.');
    bukas++;
  }
} else {
  console.log('\n  ⛔ DESYNC a(z) ' + ketV04.tick + '. ticken:');
  console.log('       A: 0x' + (ketV04.a >>> 0).toString(16).padStart(8, '0'));
  console.log('       B: 0x' + (ketV04.b >>> 0).toString(16).padStart(8, '0'));
  console.log('     ELSŐNEK NÉZD MEG: a `harc.js` sebzés-számítását (EGÉSZ osztás, a');
  console.log('     szorzó százalékban), és a halál ágát — az egyszerre nyúl a');
  console.log('     mozgáshoz, a célzáshoz és a hasítótáblához.');
  bukas++;
}

// VERT-E EGYÁLTALÁN VALAKI VALAKIT? A determinizmus-kapu erre sem felel: két
// egymás mellett ácsorgó sereg is tökéletesen reprodukálható. (Lásd a v0.3
// tanulságát: hat zöld vizsgálat mellett állt a gazdaság.)
{
  const { Sim } = await import(pathToFileURL(join(SIM_DIR, 'sim.js')).href);
  const s = new Sim({ seed: SEED, n: 256, maxEgyseg: 2000 });
  const kezdo = s.szondaFelallas(EGYSEG, { ostrom: 30 });
  for (let t = 1; t <= 2500; t++) {
    if ((t % PARANCS_KOZ) === 0) s.szondaParancsV04((t / PARANCS_KOZ) | 0);
    s.lep();
  }
  const o = s.harc.osszesites();
  const osszHalott = o.halottak[0] + o.halottak[1];
  console.log('');
  sor('2500 tick alatt elesett', osszHalott, 'csapat 0: ' + o.halottak[0] + ' · csapat 1: ' + o.halottak[1]);
  sor('élő létszám', o.elo[0] + ' / ' + o.elo[1], '(indulás: ' + kezdo + ' összesen)');
  sor('okozott sebzés', o.sebzes[0] + ' / ' + o.sebzes[1]);
  // A v0.4/3-5 ágai: épület-rombolás, fal/kapu, beszállásolás. Mindegyikhez
  // kell egy szám, ami elárulja, hogy TÖRTÉNT-e — a determinizmus-kapu erre
  // sosem felel (lásd a v0.3 tanulságát).
  let epAll = 0, epRom = 0, epSerult = 0, kapuDb = 0, falDb = 0;
  for (let i = 0; i < s.epuletek.db; i++) {
    if (s.epuletek.elo[i]) { epAll++; if (s.epuletek.hp[i] < s.epuletek.maxHp[i]) epSerult++; }
    else epRom++;
    if (s.epuletek.tipus[i] === 2) falDb++;
    if (s.epuletek.tipus[i] === 3) kapuDb++;
  }
  sor('épület', epAll + ' áll / ' + epRom + ' rom', epSerult + ' sérült · fal: ' + falDb + ' · kapu: ' + kapuDb);
  let ostromElo = 0, ostromOssz = 0;
  for (let i = 0; i < s.egysegek.db; i++) {
    if (s.egysegek.tipus[i] !== 4) continue;
    ostromOssz++;
    if (s.harc.elo[i]) ostromElo++;
  }
  sor('ostromgép', ostromElo + ' él / ' + ostromOssz, 'a felállás 30-at ad csapatonként');
  if (ostromOssz === 0) {
    console.log('\n  ⛔ NINCS OSTROMGÉP: a v0.4/6 ága ki sem futott.');
    console.log('     A forgatókönyv `felallas: { ostrom: N }` beállítását nézd meg.');
    bukas++;
  }
  sor('beszállásolás', s.beszallas.beDb + ' be / ' + s.beszallas.kiDb + ' ki',
    'kumulatív · a kör végén bent: ' + (s.beszallas.osszesites(0) + s.beszallas.osszesites(1)));
  if (s.beszallas.beDb === 0) {
    console.log('\n  ⛔ SENKI NEM SZÁLLT BE: a v0.4/5 ága ki sem futott.');
    console.log('     A pillanatnyi létszám nem bizonyít — ezért kumulatív a számláló.');
    bukas++;
  }
  if (falDb === 0) {
    console.log('\n  ⛔ NEM ÉPÜLT FAL: a v0.4/4 ága ki sem futott.');
    console.log('     Nézd meg a `szondaParancsV04` építés-körét és a fal árát —');
    console.log('     ha nem telik rá, a parancs CSENDBEN elvész, és a kód a kapun kívül marad.');
    bukas++;
  }
  if (osszHalott === 0) {
    console.log('\n  ⛔ A HARC NEM INDULT EL: nulla halott 2500 tick alatt.');
    console.log('     A determinizmus-kapu ettől még zöld — az ácsorgás is reprodukálható.');
    console.log('     Nézd meg a `harc.js` hatótáv-vizsgálatát és a `HATOTAV` táblát.');
    bukas++;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 8) v0.5 ÉPÍTKEZÉS ÉS EGYSÉG-KÉPZÉS
// ════════════════════════════════════════════════════════════════════════════
//
// MIÉRT KÜLÖN, ÉS MIÉRT KIS SEREGGEL: itt SZÜLETIK egység, tehát itt fut a
// slot-újrahasznosítás és a generációs számláló. A v0.1 stressz-felállása 1600
// egységet tesz ki (800 népesség csapatonként), ott a képzés MINDIG
// elutasításba futna — a legfrissebb kód maradna a kapun kívül. Ezért ez a kör
// 60 egységgel indul.
//
// A kör egyben a legegyszerűbb valódi BUILD ORDER is: gyűjtés → ház → laktanya
// → képzés. A v0.6 AI-ja ezt a mintát fogja bővíteni.
cim('8) v0.5 ÉPÍTKEZÉS, KÉPZÉS, TORONY, PIAC, TECHNOLÓGIA — két friss Sim');
const t8 = Date.now();
const ketV05 = ketFutas(FORGATOKONYVEK.v05);
let kevertV05 = { ok: false, tick: 0, a: 0, b: 0 };
sor('forgatókönyv', FORGATOKONYVEK.v05.nev);
sor('kezdő egységszám', FORGATOKONYVEK.v05.egysegSzam, '(a népesség-korlát miatt kicsi)');
sor('lefutott tick', ketV05.tick, '(' + ((Date.now() - t8) / 1000).toFixed(1) + ' mp)');
if (ketV05.ok) {
  sor('két futás', 'AZONOS', (FORGATOKONYVEK.v05.tickek / HASH_KOZ) + ' ellenőrzőpont');
  sor('záró hash', '0x' + ketV05.hashek.get(FORGATOKONYVEK.v05.tickek).toString(16).padStart(8, '0'));
  kevertV05 = kevertFutas(ketV05.hashek, FORGATOKONYVEK.v05);
  if (kevertV05.ok) {
    sor('kevert futás', 'AZONOS', 'a tiszta futás sorozatával');
    console.log('\n  \u2713 A képzés is determinisztikus: a sorbanállás, a népesség-korlát');
    console.log('    és a slot-újrahasznosítás bitre reprodukálható.');
  } else {
    console.log('\n  \u26d4 ELTÉRÉS a(z) ' + kevertV05.tick + '. ticken a KEVERT futásban.');
    bukas++;
  }
} else {
  console.log('\n  \u26d4 DESYNC a(z) ' + ketV05.tick + '. ticken:');
  console.log('       A: 0x' + (ketV05.a >>> 0).toString(16).padStart(8, '0'));
  console.log('       B: 0x' + (ketV05.b >>> 0).toString(16).padStart(8, '0'));
  console.log('     ELSŐNEK NÉZD MEG: a `kepzes.js` sor-léptetését és a');
  console.log('     `Egysegek.hozzaad()` szabad-lista sorrendjét. A slot-kiosztás');
  console.log('     a halálok sorrendjéből következik — ha az elcsúszik, minden elcsúszik.');
  bukas++;
}

// SZÜLETETT-E EGYÁLTALÁN EGYSÉG? A determinizmus-kapu erre sem felel: egy
// néma, elutasításba futó képzés is tökéletesen reprodukálható.
{
  const { Sim } = await import(pathToFileURL(join(SIM_DIR, 'sim.js')).href);
  const s = new Sim({ seed: SEED, n: 256, maxEgyseg: 2000 });
  const kezdo = s.szondaFelallas(FORGATOKONYVEK.v05.egysegSzam, FORGATOKONYVEK.v05.felallas);
  // UGYANANNYI TICK, mint a determinizmus-kör: ami itt lefut, annak ott is le
  // KELL futnia. Ha a működés-szám hosszabb futásból jönne, épp azt a hamis
  // biztonságot adná, ami ellen az egész vizsgálat szól — a torony és a piac
  // „működik", de a kapu sosem látta őket.
  const V05_TICK = FORGATOKONYVEK.v05.tickek;
  for (let t = 1; t <= V05_TICK; t++) {
    if ((t % PARANCS_KOZ) === 0) s.szondaParancsV05((t / PARANCS_KOZ) | 0);
    s.lep();
  }
  const k0 = s.kepzes.osszesites(0), k1 = s.kepzes.osszesites(1);
  const n0 = s.gazdasag.allapot(0), n1 = s.gazdasag.allapot(1);
  console.log('');
  sor('kiképzett egység', k0.keszult + ' / ' + k1.keszult, 'csapatonként (indulás: ' + kezdo + ' összesen)');
  sor('népesség', n0.nepesseg + '/' + n0.nepessegMax + '  ·  ' + n1.nepesseg + '/' + n1.nepessegMax);
  sor('képző épület', k0.kepzo + ' / ' + k1.kepzo, 'épület összesen: ' + s.epuletek.db);
  sor('elutasított sorbaállás', s.kepzes.elutasitva[0] + ' / ' + s.kepzes.elutasitva[1],
    '(nem telik, tele a sor, vagy nincs népesség)');

  // v0.5/3 — a torony és a piac SAJÁT működés-száma. Halmozott, nem
  // pillanatnyi: a beszállásolásnál (v0.4) pont az bukott meg, hogy a
  // pillanatnyi szám nullát mutatott akkor is, amikor az ág lefutott.
  let tornyok = 0, piacok = 0;
  for (let i = 0; i < s.epuletek.db; i++) {
    if (!s.epuletek.kesz(i)) continue;
    if (s.epuletek.tipus[i] === 9) tornyok++;
    else if (s.epuletek.tipus[i] === 10) piacok++;
  }
  const sortuz = s.harc.toronySortuz[0] + s.harc.toronySortuz[1];
  const nyil = s.harc.toronyNyil[0] + s.harc.toronyNyil[1];
  const cserek = s.gazdasag.csereDb[0] + s.gazdasag.csereDb[1];
  sor('kész torony / piac', tornyok + ' / ' + piacok, 'mindkét csapaté együtt');
  sor('torony-sortűz', s.harc.toronySortuz[0] + ' / ' + s.harc.toronySortuz[1],
    'kilőtt nyíl: ' + nyil + ' (üres torony = pontosan 1/sortűz)');
  sor('piaci csere', s.gazdasag.csereDb[0] + ' / ' + s.gazdasag.csereDb[1],
    'kapott nyersanyag: ' + (s.gazdasag.csereKapott[0] + s.gazdasag.csereKapott[1])
    + ', elutasítva: ' + (s.gazdasag.csereElutasitva[0] + s.gazdasag.csereElutasitva[1]));

  // v0.5/4 — a technológia működés-száma. Egy KÉSZ technológia az egyetlen
  // bizonyíték: a „folyik" állapot még lehet örökre beragadt visszaszámláló is.
  const tec0 = s.technologia.osszesites(0), tec1 = s.technologia.osszesites(1);
  const tech = tec0.keszult + tec1.keszult;
  sor('kész technológia', tec0.keszult + ' / ' + tec1.keszult,
    'folyik: ' + (tec0.folyik + tec1.folyik)
    + ', elutasítva: ' + (s.technologia.elutasitva[0] + s.technologia.elutasitva[1]));

  if (tech === 0) {
    console.log('\n  ⛔ EGYETLEN TECHNOLÓGIA SEM KÉSZÜLT EL: a v0.5/4 ága néma.');
    console.log('     A determinizmus-kapu ettől zöld — egy soha el nem induló');
    console.log('     kutatás is reprodukálható. Nézd meg a `TECH_EPULET` és a');
    console.log('     `TECH_KORSZAK` feltételeit, meg hogy telik-e egyáltalán rá.');
    bukas++;
  }

  if (cserek === 0) {
    console.log('\n  ⛔ EGYETLEN PIACI CSERE SEM MENT ÁT: a v0.5/3 piac-ága néma.');
    console.log('     A csere adja a követ a toronyhoz — ha ez áll, minden utána is áll.');
    console.log('     Nézd meg, épül-e a PIAC, és van-e elég fa a `csere` pillanatában.');
    bukas++;
  }
  if (tornyok === 0) {
    console.log('\n  ⛔ NEM ÉPÜLT TORONY: a kőre nem futotta, vagy a hely foglalt.');
    bukas++;
  } else if (sortuz === 0) {
    console.log('\n  ⛔ A TORONY ÁLL, DE SOHA NEM LŐTT: a sortűz-ág ki sem futott.');
    console.log('     A determinizmus-kapu ettől zöld — egy néma torony is');
    console.log('     reprodukálható. Nézd meg a `TORONY_HATOTAV`-ot és azt, hogy');
    console.log('     a támadó sereg tényleg a torony mellett megy-e el.');
    bukas++;
  } else if (nyil === sortuz) {
    // PONTOSAN egy nyíl sortüzenként = a torony végig ÜRES volt. A lövés
    // önmagában lefutott, de a v0.5/3 lényege — hogy a beszállásolás végre
    // TÖBBET ad a bújásnál — nem. Egy szám különbsége, és a legfrissebb ág
    // marad a kapun kívül.
    console.log('\n  ⛔ MINDEN SORTŰZ PONTOSAN EGY NYÍL: a torony sosem volt megrakva,');
    console.log('     tehát a beszállásolási bónusz ága ki sem futott.');
    console.log('     Nézd meg a `_szondaToronyOrseg`-et és a `KAPACITAS[TORONY]`-t.');
    bukas++;
  }

  if (k0.keszult + k1.keszult === 0) {
    console.log('\n  \u26d4 NEM SZÜLETETT EGYSÉG: a v0.5 képzés-ága ki sem futott.');
    console.log('     A determinizmus-kapu ettől még zöld — a néma elutasítás is');
    console.log('     reprodukálható. Nézd meg a népesség-korlátot és a nyersanyagot.');
    bukas++;
  }
  if (k0.kepzo === 0 && k1.kepzo === 0) {
    console.log('\n  \u26d4 NEM ÉPÜLT KÉPZŐ ÉPÜLET: a laktanya/íjászda ága ki sem futott.');
    bukas++;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 9) v0.6 — A GÉPI ELLENFÉL
// ════════════════════════════════════════════════════════════════════════════
//
// Ez a kör KÜLÖNBÖZIK az összes eddigitől: nincs benne kézzel írt parancs-
// sorozat. A forgatókönyv MAGA AZ AI — mindkét csapatot a gép viszi, könnyű
// a nehéz ellen. A determinizmus-kapunak pont ezt kell őriznie: a gép döntései
// ugyanabból az állapotból ugyanazok, tehát a v0.8 lockstepjében a két kliens
// AI-ja nem tarthat szét.
//
// ⚠️ A KÉT CSAPAT KÜLÖNBÖZŐ NEHÉZSÉGEN FUT. Ha mindkettő ugyanazon a szinten
// menne, minden nehézség-függő szám azonos lenne, és egy elrontott
// nehézség-indexelés SEMMIT nem változtatna a hash-en — a hiba a kapun belül
// maradna. Az aszimmetria itt vizsgálati eszköz, nem ízlés.
cim('9) v0.6 GÉPI ELLENFÉL + v0.7 HADI KÖD — a forgatókönyv maga az AI');
const t9 = Date.now();
const ketV06 = ketFutas(FORGATOKONYVEK.v06);
let kevertV06 = { ok: false, tick: 0, a: 0, b: 0 };
sor('forgatókönyv', FORGATOKONYVEK.v06.nev);
sor('lefutott tick', ketV06.tick, '(' + ((Date.now() - t9) / 1000).toFixed(1) + ' mp)');
if (ketV06.ok) {
  sor('két futás', 'AZONOS', (FORGATOKONYVEK.v06.tickek / HASH_KOZ) + ' ellenőrzőpont');
  sor('záró hash', '0x' + ketV06.hashek.get(FORGATOKONYVEK.v06.tickek).toString(16).padStart(8, '0'));
  kevertV06 = kevertFutas(ketV06.hashek, FORGATOKONYVEK.v06);
  if (kevertV06.ok) {
    sor('kevert futás', 'AZONOS', 'a tiszta futás sorozatával');
    console.log('\n  \u2713 A gépi ellenfél determinisztikus: a döntési ütem, a');
    console.log('    munkás-beosztás és az építési döntések bitre reprodukálhatók.');
  } else {
    console.log('\n  \u26d4 ELTÉRÉS a(z) ' + kevertV06.tick + '. ticken a KEVERT futásban.');
    bukas++;
  }
} else {
  console.log('\n  \u26d4 DESYNC a(z) ' + ketV06.tick + '. ticken:');
  console.log('       A: 0x' + (ketV06.a >>> 0).toString(16).padStart(8, '0'));
  console.log('       B: 0x' + (ketV06.b >>> 0).toString(16).padStart(8, '0'));
  console.log('     ELSŐNEK NÉZD MEG az `ai.js`-t: van-e benne `Math.random`,');
  console.log('     objektum-bejárás, vagy olyan döntetlen, aminek nincs szabálya.');
  bukas++;
}

// CSINÁL-E EGYÁLTALÁN VALAMIT A GÉP? A determinizmus-kapu erre sem felel: az az
// AI, ami minden körben úgy dönt, hogy nem csinál semmit, tökéletesen
// reprodukálható. Ez a projekt HÁROMSZOR égett meg zöld kapu melletti halott
// rendszeren — itt a nyersanyag és a munkás-szám az, ami elárulja.
{
  const { Sim } = await import(pathToFileURL(join(SIM_DIR, 'sim.js')).href);
  const s = new Sim({ seed: SEED, n: 256, maxEgyseg: 2000 });
  const kezdo = s.szondaFelallasV06(FORGATOKONYVEK.v06.egysegSzam);
  // A hullám legjobb megközelítése az ELLENSÉGES központhoz, futás közben mérve.
  const kozelites = [1e9, 1e9];
  const kozpont = [null, null];
  for (let t = 1; t <= FORGATOKONYVEK.v06.tickek; t++) {
    s.lep();
    if ((t % 100) !== 0) continue;
    for (let cs = 0; cs < 2; cs++) {
      if (!kozpont[cs]) {
        for (let k = 0; k < s.epuletek.db; k++) {
          if (s.epuletek.csapat[k] === cs && s.epuletek.tipus[k] === 0 && s.epuletek.elo[k]) {
            kozpont[cs] = { x: s.epuletek.x[k], y: s.epuletek.y[k] };
            break;
          }
        }
      }
    }
    for (let i = 0; i < s.egysegek.db; i++) {
      if (!s.harc.elo[i] || s.egysegek.tipus[i] === 0) continue;
      const cs = s.egysegek.csapat[i] & 1;
      const c = kozpont[1 - cs];
      if (!c) continue;
      const dx = s.egysegek.px[i] - c.x, dy = s.egysegek.py[i] - c.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < kozelites[cs]) kozelites[cs] = d;
    }
  }

  const a0 = s.ai.osszesites(0), a1 = s.ai.osszesites(1);
  const g0 = s.gazdasag.allapot(0), g1 = s.gazdasag.allapot(1);
  let mnk = [0, 0];
  for (let i = 0; i < s.egysegek.db; i++) {
    if (s.harc.elo[i] && s.egysegek.tipus[i] === 0) mnk[s.egysegek.csapat[i] & 1]++;
  }
  const gyujtott0 = s.gazdasag.osszegyujtott.slice(0, 4).reduce((a, b) => a + b, 0);
  const gyujtott1 = s.gazdasag.osszegyujtott.slice(4, 8).reduce((a, b) => a + b, 0);

  console.log('');
  sor('nehézség', NEHEZSEG_NEV[a0.nehezseg] + ' / ' + NEHEZSEG_NEV[a1.nehezseg],
    '(indulás: ' + kezdo + ' egység összesen)');
  sor('döntési kör', a0.dontes + ' / ' + a1.dontes, 'a nehezebb sűrűbben gondolkodik');
  sor('kiadott gyűjtés-parancs', a0.gyujt + ' / ' + a1.gyujt);
  sor('kiadott építés / képzés', a0.epit + '·' + a0.kepzes + ' / ' + a1.epit + '·' + a1.kepzes);
  sor('élő munkás', mnk[0] + ' / ' + mnk[1], 'a gép ennyit tart fenn');
  sor('összegyűjtött nyersanyag', gyujtott0 + ' / ' + gyujtott1);
  sor('népesség', g0.nepesseg + '/' + g0.nepessegMax + '  ·  ' + g1.nepesseg + '/' + g1.nepessegMax);

  // ÉPÜLT-E ANNYI HÁZ, AMENNYIT RENDELT? Ez a szám a v0.6/1 legdrágább hibáját
  // őrzi. A gép a BAL-FELSŐ cellát adta át az `epit`-nek, ami viszont a
  // KÖZÉPPONTOT várja és maga tolja vissza — a parancs egy cellával odébb, tipikusan
  // foglalt helyre esett, és CSENDBEN elveszett. Mérve: 100 építési parancs, EGY
  // ház. A determinizmus-kapu végig zöld volt, a „nulla ház" gát pedig azért nem
  // fogott volna, mert egy ház azért véletlenül összejött.
  //
  // A tanulság általános: nem az a kérdés, hogy CSINÁLT-E valamit a rendszer,
  // hanem hogy a KIADOTT SZÁNDÉK ÉS AZ EREDMÉNY összeér-e.
  //
  // ⚠️ MINDEN ÉPÜLETET SZÁMOLUNK, nem csak a házat — a kezdő központ kivételével.
  // A v0.6/1-ben a gép csak házat épített, ezért elég volt a házat nézni; a
  // v0.6/2 build ordere viszont laktanyát és piacot is rendel, és ha csak a
  // házat vetnénk össze az ÖSSZES rendeléssel, a szám magától „veszteséget"
  // mutatna. Egy hibás gát rosszabb, mint a hiányzó: hozzászokik az ember,
  // hogy piros, és megszűnik figyelni rá.
  let epult = [0, 0];
  for (let i = 0; i < s.epuletek.db; i++) {
    if (!s.epuletek.elo[i]) continue;
    if (s.epuletek.tipus[i] === 0) continue;   // a kezdő központot nem a gép építette
    epult[s.epuletek.csapat[i] & 1]++;
  }
  sor('rendelt / felépült épület', (a0.epit + '→' + epult[0]) + ' / ' + (a1.epit + '→' + epult[1]),
    'az elveszett parancs csendben vész el');

  // v0.6/2 — a BUILD ORDER, a hadsereg és a kutatás működés-számai.
  // A katonai épület a build order EREDMÉNYE: ha nulla, a `_buildOrder` néma
  // (vagy sosem telik rá), és a gépnek nincs hadserege azon túl, amit kapott.
  let katonaiEp = [0, 0], sereg = [0, 0];
  for (let i = 0; i < s.epuletek.db; i++) {
    const t = s.epuletek.tipus[i];
    if (!s.epuletek.elo[i]) continue;
    if (t === 5 || t === 6 || t === 7 || t === 8) katonaiEp[s.epuletek.csapat[i] & 1]++;
  }
  for (let i = 0; i < s.egysegek.db; i++) {
    if (s.harc.elo[i] && s.egysegek.tipus[i] !== 0) sereg[s.egysegek.csapat[i] & 1]++;
  }
  const tec0 = s.technologia.osszesites(0), tec1 = s.technologia.osszesites(1);
  sor('katonai épület', katonaiEp[0] + ' / ' + katonaiEp[1], 'a build order eredménye');
  sor('élő katona', sereg[0] + ' / ' + sereg[1], 'sereg-cél: 10 / 32');
  sor('kikutatott technológia', tec0.kesz + ' / ' + tec1.kesz,
    'kutatás-cél: 0 / 6 — a könnyű gép SZÁNDÉKOSAN egyet sem kutat');

  // A NEHÉZ GÉP TÖBBET ÉPÍT ÉS TÖBBET KUTAT — ez a három szint valódi
  // különbsége. Ha nem így van, a `BUILD_ORDER` / `KUTATAS_CEL` indexelés nem
  // ér el a nehézségig, és a szintek a gyakorlatban EGY szintté olvadnak. A
  // hash ettől még végig zöld maradna.
  if (katonaiEp[1] <= katonaiEp[0]) {
    console.log('\n  \u26d4 A NEHÉZ GÉP NEM ÉPÍTETT TÖBB KATONAI ÉPÜLETET A KÖNNYŰNÉL:');
    console.log('     a `BUILD_ORDER` nehézség-indexelése nem hat.');
    bukas++;
  }
  if (tec1.kesz === 0) {
    console.log('\n  \u26d4 A NEHÉZ GÉP EGYETLEN TECHNOLÓGIÁT SEM KUTATOTT KI:');
    console.log('     a `_kutat` ága néma. Nézd meg a `KUTATAS_CEL`-t és azt,');
    console.log('     hogy felépült-e egyáltalán a kutató épület.');
    bukas++;
  }
  if (tec0.kesz !== 0) {
    // Fordított irányú gát: a könnyű szint ígérete az, hogy NEM kutat. Ha
    // mégis, a `KUTATAS_CEL[0] = 0` nem hat, és a szintek megint összemosódnak.
    console.log('\n  \u26d4 A KÖNNYŰ GÉP KUTATOTT, PEDIG NEM SZABADNA: a KUTATAS_CEL[0]');
    console.log('     nulla, tehát a `_kutat` korai kilépése nem működik.');
    bukas++;
  }
  if (a1.kutatas === 0) {
    console.log('\n  \u26d4 A NEHÉZ GÉP EGYSZER SEM ADOTT KI KUTATÁS-PARANCSOT.');
    bukas++;
  }

  // v0.6/3 — FELDERÍTÉS ÉS HADMŰVELET.
  //
  // ⚠️ AZ UTOLSÓ SZÁM A LEGFONTOSABB. A „hány támadást indított" önmagában
  // ugyanabba a csapdába sétál, amibe a v0.4 épület-célzása: a parancs
  // kiadható úgy is, hogy egyetlen egység sem ér oda. Az EGYETLEN bizonyíték
  // az, hogy az ellenséges épületek TÉNYLEG sérültek — vagyis a hullám
  // megérkezett és ütött.
  // A mérés a FUTÁS KÖZBEN gyűlt (`kozelites`): a hullám legjobb megközelítése
  // az ellenséges központhoz. A végállapot erre nem alkalmas — a támadók addigra
  // vagy elestek, vagy visszavonultak, és a nyoma sem látszana.
  //
  // Az „okozott épület-sérülés" első ötlet volt, és HIBÁS gát: ha a védő serege
  // kiáll, a támadók vele verekszenek, és épületig el sem jutnak — pedig a
  // hullám tökéletesen megérkezett.
  sor('felderítő kiküldve', a0.felderit + ' / ' + a1.felderit,
    'felfedezte a bázist: ' + (a0.felfedez > 0 ? 'igen' : 'NEM')
    + ' / ' + (a1.felfedez > 0 ? 'igen' : 'NEM'));
  sor('indított támadás', a0.tamadas + ' / ' + a1.tamadas,
    'védekezésre váltás: ' + a0.vedekezes + ' / ' + a1.vedekezes);
  sor('legjobb megközelítés', kozelites[0].toFixed(1) + ' / ' + kozelites[1].toFixed(1),
    'az ELLENSÉGES központtól — ez bizonyítja, hogy a hullám odaért');

  if (a0.felfedez === 0 && a1.felfedez === 0) {
    console.log('\n  \u26d4 EGYIK GÉP SEM TALÁLTA MEG AZ ELLENSÉGET: a `_felderit`');
    console.log('     látás-ága néma. A gép SZÁNDÉKOSAN nem olvashatja ki az');
    console.log('     `epuletek`-ből, hol az ellenfél — ha a felderítés nem megy,');
    console.log('     sosem indul támadás. Nézd meg a `LATOTAV`-ot és azt, hogy');
    console.log('     elindul-e egyáltalán a felderítő.');
    bukas++;
  }
  if (a0.tamadas === 0 && a1.tamadas === 0) {
    console.log('\n  \u26d4 EGYIK GÉP SEM INDÍTOTT TÁMADÁST: a `_hadmuvelet` ága néma.');
    console.log('     Nézd meg a `TAMADAS_KUSZOB`-ot és azt, hogy elér-e a sereg');
    console.log('     egyáltalán akkora létszámot.');
    bukas++;
  } else {
    for (let cs = 0; cs < 2; cs++) {
      const tam = cs === 0 ? a0.tamadas : a1.tamadas;
      if (tam > 0 && kozelites[cs] > 30) {
        console.log('\n  \u26d4 A ' + cs + '. GÉP TÁMADÁST INDÍTOTT, DE A SEREGE SOSEM JUTOTT');
        console.log('     ' + kozelites[cs].toFixed(1) + ' egységnél közelebb az ellenséges központhoz.');
        console.log('     A parancs kiment, a hullám nem ért oda — pontosan az a hiba,');
        console.log('     amit a v0.4-ben már egyszer megfogtunk (nulla egység indult');
        console.log('     el egy 1200 életerejű célpont felé). Nézd meg a');
        console.log('     `_seregParancs` célpontját és a `_jarhatoKozel` eredményét.');
        bukas++;
      }
    }
  }

  // ── v0.7/1 — HADI KÖD ──────────────────────────────────────────────
  //
  // Három szám, és mind a három más hibát fog meg:
  //
  //   · a frissítés lefutott-e egyáltalán (`frissitesDb`)
  //   · nőtt-e a felfedezett terület a kezdő bázison túl
  //   · és — ez a legfontosabb — MARADT-E FELFEDEZETLEN TERÜLET
  //
  // Az utolsó nélkül a köd „működne" akkor is, ha egy hibás sugár- vagy
  // index-számítás az egész pályát felfedezettnek jelölné. Az ilyen köd
  // determinisztikus, a számai nem nullák, és mégis PONTOSAN SEMMIT nem takar
  // el — a gépi ellenfél felderítése pedig egy csapásra értelmét vesztené,
  // mert a v0.6/3 óta ezen a rácson keresztül tudja meg, hol az ellenfél.
  const k0 = s.kod.osszesites(0), k1 = s.kod.osszesites(1);
  sor('köd-frissítés', s.kod.frissitesDb, 'köd-rács: ' + s.kod.kn + '×' + s.kod.kn
    + ' (' + k0.osszes + ' cella)');
  sor('felfedezett terület', k0.szazalek + ' % / ' + k1.szazalek + ' %',
    'éppen látható: ' + k0.lathato + ' / ' + k1.lathato + ' cella');

  if (s.kod.frissitesDb === 0) {
    console.log('\n  \u26d4 A KÖD EGYSZER SEM FRISSÜLT: a `Kod.lep()` ága néma.');
    console.log('     Nézd meg a `KOD_KOZ` maradékos szűrőjét és a `Sim.lep()` hívást.');
    bukas++;
  } else if (k0.latott === 0 || k1.latott === 0) {
    console.log('\n  \u26d4 VALAMELYIK CSAPAT NULLA CELLÁT LÁTOTT: a `_folt` nem ír.');
    bukas++;
  } else if (k0.szazalek >= 100 && k1.szazalek >= 100) {
    console.log('\n  \u26d4 MINDKÉT CSAPAT A TELJES PÁLYÁT FELFEDEZTE: a köd nem takar el');
    console.log('     SEMMIT. Determinisztikus, a számai nem nullák, és mégis haszontalan.');
    console.log('     Nézd meg a `LATOTAV_*` értékeket és a `_folt` sugár-számítását.');
    bukas++;
  } else if (k0.lathato === 0 && k1.lathato === 0) {
    console.log('\n  \u26d4 EGYIK CSAPAT SEM LÁT SEMMIT ÉPPEN MOST: a `lathato` rács üres,');
    console.log('     pedig a `latott` nem az. A frissítés nullázza, de nem tölti újra?');
    bukas++;
  }

  // ── v0.7/3 — A MINIMAP NEM SZIVÁROGTATHAT ──────────────────────────
  //
  // ⚠️ EZ A LEGKÖNNYEBBEN ELRONTHATÓ DOLOG A v0.7-BEN, ÉS A LEGNEHEZEBBEN
  // ÉSZREVEHETŐ. A minimap egyetlen elfelejtett feltétellel megmutatná az
  // ellenség minden mozdulatát, miközben a nagy képernyőn sötét van. A hadi
  // köd ilyenkor „működik" — a rácsa frissül, a textúrája rendben van, a
  // szonda köd-számai nem nullák —, csak épp SENKIT NEM ÉRDEKEL, mert a
  // valódi információ máshol elérhető. Se a hash, se a köd-számok nem
  // fognák meg.
  //
  // A `minimap_adat.js` ezért DOM-mentes: node-ban is lefut, tehát itt
  // ellenőrizhető, amit a felhőben szemmel úgysem lehetne (nincs GPU).
  {
    const { minimapAdat, MINIMAP_MERET } = await import(
      pathToFileURL(join(GYOKER, 'src', 'ui', 'minimap_adat.js')).href);
    const puffer = new Uint8ClampedArray(MINIMAP_MERET * MINIMAP_MERET * 4);
    const mm = minimapAdat(s, puffer, 0);
    sor('minimap kirajzolva', mm.egyseg + ' egység · ' + mm.epulet + ' épület',
      'terep ' + mm.terep + ' · nyersanyag ' + mm.nyers);
    sor('minimap köd', mm.sotet + ' sosem látott · ' + mm.kodos + ' emlékezett',
      'ködben REJTVE maradt: ' + mm.rejtett);

    if (mm.egyseg === 0 && mm.epulet === 0) {
      console.log('\n  \u26d4 A MINIMAP ÜRES: sem egység, sem épület nem került rá.');
      bukas++;
    }
    if (mm.sotet === 0) {
      console.log('\n  \u26d4 A MINIMAPON NINCS SÖTÉT TERÜLET: a köd nem hat rá,');
      console.log('     tehát a kis térkép a teljes pályát elárulja.');
      bukas++;
    }
    if (mm.rejtett === 0) {
      console.log('\n  \u26d4 A MINIMAP MINDENT KIRAJZOLT, AMI LÉTEZIK: egyetlen idegen');
      console.log('     egység vagy épület sem maradt a ködben. Vagy tényleg mindent');
      console.log('     látunk (akkor a köd a hibás), vagy a minimap MEGKERÜLI a ködöt.');
      console.log('     Nézd meg a `minimapAdat` láthatóság-feltételeit.');
      bukas++;
    }
  }

  // NAVIGÁCIÓ NÉLKÜL ÁLLÓ MUNKÁS — a v0.6/2 legdrágább hibájának őre.
  //
  // A mozgás-magnak KÉT módja van célba érni: áramlási mező, vagy szabad
  // egyenes. Ha egy egység úton van (`MEGY_LELOHELYRE`), de EGYIKE SINCS,
  // akkor nem elakadt, hanem MEG SEM TUD MOZDULNI — és ezt semmilyen
  // „csinált-e valamit" szám nem mutatja meg, mert a rendszer többi része
  // vidáman dolgozik körülötte.
  //
  // Így ragadt hat étel-munkás 12 000 ticken át: a `_ujLelohely` szándékosan
  // NEM kért mezőt (a v0.1-es „mező egységenként" csapdát kerülve), és arra
  // épített, hogy a rövid táv egyenesen megtehető. Amikor az egyenes zárt volt,
  // nem maradt semmi. Ez INVARIÁNS, nem heurisztika: nulla a megengedett érték.
  let navNelkul = 0;
  for (let i = 0; i < s.egysegek.db; i++) {
    if (!s.harc.elo[i] || s.egysegek.tipus[i] !== 0) continue;
    if (s.munkasok.allapot[i] !== 1) continue;   // MUNKA.MEGY_LELOHELYRE
    if (s.munkasok.nodeMezo[i] < 0 && s.egysegek.egyenes[i] === 0) navNelkul++;
  }
  sor('navigáció nélkül álló munkás', navNelkul, 'se mező, se egyenes — invariáns: 0');
  if (navNelkul > 0) {
    console.log('\n  \u26d4 ' + navNelkul + ' MUNKÁS SEM MEZŐVEL, SEM EGYENESSEL NEM RENDELKEZIK,');
    console.log('     miközben úton van. Ezek MEG SEM TUDNAK MOZDULNI. Nézd meg a');
    console.log('     `Munkasok._ujLelohely`-t: kér-e áramlási mezőt az új lelőhelyhez.');
    bukas++;
  }

  if (a0.dontes === 0 || a1.dontes === 0) {
    console.log('\n  \u26d4 VALAMELYIK GÉP EGYSZER SEM GONDOLKODOTT: az `Ai.lep()` ága néma.');
    console.log('     Nézd meg a `beallit()` hívást és a `DONTES_KOZ` maradékos szűrőt.');
    bukas++;
  } else if (gyujtott0 === 0 || gyujtott1 === 0) {
    console.log('\n  \u26d4 VALAMELYIK GÉP NEM GYŰJTÖTT SEMMIT: a döntés lefutott, de');
    console.log('     nem lett belőle munka. A determinizmus-kapu ettől zöld —');
    console.log('     a néma gép is reprodukálható. Nézd meg a `_munkaraFog`-ot:');
    console.log('     tétlennek látja-e egyáltalán a munkásokat, és talál-e lelőhelyet.');
    bukas++;
  } else if (a1.dontes <= a0.dontes) {
    // A nehéz szint SŰRŰBBEN gondolkodik. Ha ez nem látszik, a nehézség-index
    // nem ér el a `DONTES_KOZ`-ig — a három szint egyetlen szint lenne, és a
    // hash ettől még végig zöld maradna.
    console.log('\n  \u26d4 A NEHÉZ GÉP NEM GONDOLKODOTT SŰRŰBBEN A KÖNNYŰNÉL:');
    console.log('     a nehézség-szint nem ér el a `DONTES_KOZ`-ig, vagyis a három');
    console.log('     szint a gyakorlatban EGY szint.');
    bukas++;
  }
  // A gép a munkás-célszámig képez. Ha egyetlen munkás sem született, a
  // `_munkastKepez` ága néma — a kezdő felállás munkásaival is „működne".
  if (a0.kepzes === 0 && a1.kepzes === 0) {
    console.log('\n  \u26d4 A GÉP EGYSZER SEM RENDELT MUNKÁST: a `_munkastKepez` ága néma.');
    bukas++;
  }
  for (let cs = 0; cs < 2; cs++) {
    const rendelt = cs === 0 ? a0.epit : a1.epit;
    if (rendelt > 0 && epult[cs] * 2 < rendelt) {
      console.log('\n  \u26d4 A ' + cs + '. GÉP ÉPÍTÉSI PARANCSAI ELVESZNEK: ' + rendelt
        + ' rendelésből ' + epult[cs] + ' épület lett.');
      console.log('     A parancs csendben eldobódik — legvalószínűbb ok, hogy a');
      console.log('     koordináta a rossz rendszerben megy át (sarok kontra középpont),');
      console.log('     vagy hogy a gép foglalt helyre rendel újra meg újra.');
      bukas++;
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 10) v0.7/2 — MENTÉS ÉS BETÖLTÉS
// ════════════════════════════════════════════════════════════════════════════
//
// EZ A VIZSGÁLAT ÖNMAGÁT ÍRJA. A `Sim.allapotHash()` a v0.1 óta pontosan azt
// sorolja fel, ami a szimuláció állapota — a mentésnek UGYANEZT a halmazt kell
// tárolnia. A kettő tehát egymást ellenőrzi:
//
//   ments a T. ticken → tölts FRISS simbe → futtasd mindkettőt T+M-ig
//   → a két hash-nek BITRE egyeznie kell
//
// Ha bármi kimarad a mentésből, ez azonnal megbukik, és megmondja a pontos
// ticket. Nincs szükség kézzel karbantartott mező-listára — a lista maga a
// vizsgálat tárgya.
//
// ⚠️ A MENTÉS UTÁN TOVÁBB IS FUTTATUNK, nem csak összehasonlítjuk a
// pillanatnyi hasht. Az azonnali egyezés ugyanis SOKKAL gyengébb állítás: egy
// hiányzó belső számláló (egy visszaszámláló, egy szabad-lista) a mentés
// pillanatában még nem látszik a hashben, csak akkor, amikor a következő
// döntés RÁÉPÜL. A v0.5/1 slot-újrahasznosítása pont ilyen: a szabad-lista
// nincs a hashben, mégis eldönti, melyik indexre születik a következő egység.
cim('10) v0.7/2 MENTÉS ÉS BETÖLTÉS — a hash a mentés specifikációja');
const t10 = Date.now();
let mentesBukas = bukas;
{
  const { Sim } = await import(pathToFileURL(join(SIM_DIR, 'sim.js')).href);
  const { mentes, betoltes, mentesSzoveg, betoltesSzoveg } = await import(
    pathToFileURL(join(SIM_DIR, 'mentes.js')).href);

  const MENTES_TICK = ervSzam('mentestick', 3000);
  const FOLYTATAS = ervSzam('folytatas', 3000);

  // EREDETI futás: elmegy a mentés pontjáig, ott mentünk, majd fut tovább.
  // ⚠️ A v0.9 FELÁLLÁSÁVAL, NEM A v0.6-ÉVAL. A mentés-vizsgálat ereje abból
  // jön, hogy a mentett állapot NEM az alapértelmezés: civ nélkül a nyolc
  // civ-tömb mind a gyári értéken állna, és egy KIMARADÓ `civ` blokk a
  // betöltés után PONTOSAN ugyanazt a világot adná vissza — a vizsgálat zöld
  // maradna egy olyan mentésre, ami a civ-választást elveszti.
  const A = new Sim({ seed: SEED, n: 256, maxEgyseg: 2000 });
  A.szondaFelallasV09(FORGATOKONYVEK.v09.egysegSzam);
  for (let t = 1; t <= MENTES_TICK; t++) A.lep();
  const szoveg = mentesSzoveg(A);
  const mentesHash = A.allapotHash();

  // BETÖLTÖTT futás: friss sim, ugyanaz a seed, majd visszatöltés.
  const B = new Sim({ seed: SEED, n: 256, maxEgyseg: 2000 });
  const eredmeny = betoltesSzoveg(B, szoveg);
  sor('mentés mérete', (szoveg.length / 1024).toFixed(0) + ' kB',
    'a ' + MENTES_TICK + '. ticken, JSON');
  if (!eredmeny.ok) {
    console.log('\n  \u26d4 A BETÖLTÉS ELUTASÍTOTT: ' + eredmeny.hiba);
    bukas++;
  } else {
    const betoltottHash = B.allapotHash();
    sor('hash a mentés pillanatában',
      '0x' + (mentesHash >>> 0).toString(16).padStart(8, '0')
      + (betoltottHash === mentesHash ? '  =  ' : '  ≠  ')
      + '0x' + (betoltottHash >>> 0).toString(16).padStart(8, '0'));
    // A CIV-VÁLASZTÁS ÁTJÖTT-E? A hash-egyezés ezt már magában foglalja (a
    // civ-index benne van), de a SZÁRMAZTATOTT tömbök nincsenek — azok a
    // hashen kívül élnek, és egy hiányos visszatöltés csak akkor bukna ki,
    // amikor a folytatás egy másik áron épít. Ez a sor kimondja.
    const cA = [A.civ.osszesites(0), A.civ.osszesites(1)];
    const cB = [B.civ.osszesites(0), B.civ.osszesites(1)];
    sor('civ a betöltés után', cB[0].nev + ' / ' + cB[1].nev,
      'alaptól eltérő érték: ' + cB[0].elter + ' / ' + cB[1].elter);
    if (cA[0].civ !== cB[0].civ || cA[1].civ !== cB[1].civ
      || cA[0].elter !== cB[0].elter || cA[1].elter !== cB[1].elter) {
      console.log('\n  ⛔ A CIV-RÉTEG NEM JÖTT ÁT A MENTÉSEN: a betöltött meccs más');
      console.log('     néppel (vagy alapértékekkel) folytatódna. Nézd meg a `mentes.js`');
      console.log('     `civ` blokkját — a származtatott tömböket is menteni kell.');
      bukas++;
    }

    if (betoltottHash !== mentesHash) {
      console.log('\n  \u26d4 A BETÖLTÖTT ÁLLAPOT AZONNAL ELTÉR. Valami olyan hiányzik a');
      console.log('     mentésből, ami BENNE VAN az `allapotHash()`-ben. A két lista');
      console.log('     ugyanaz kell legyen — a `mentes.js` fejléce erről szól.');
      bukas++;
    } else {
      // FOLYTATÁS: itt derül ki, ami a pillanatnyi hashben nem látszik.
      let elteres = -1;
      for (let t = 1; t <= FOLYTATAS; t++) {
        A.lep(); B.lep();
        if ((t % HASH_KOZ) !== 0) continue;
        if (A.allapotHash() !== B.allapotHash()) { elteres = MENTES_TICK + t; break; }
      }
      sor('folytatás', elteres < 0 ? 'AZONOS' : 'ELTÉR',
        FOLYTATAS + ' tick, ' + (FOLYTATAS / HASH_KOZ) + ' ellenőrzőpont');
      if (elteres >= 0) {
        console.log('\n  \u26d4 A FOLYTATÁS ELTÉR a(z) ' + elteres + '. ticken.');
        console.log('     A mentés pillanatában még egyezett, tehát a hiányzó dolog NINCS');
        console.log('     benne a hashben, de a döntések RÁÉPÜLNEK. Elsőnek nézd meg a');
        console.log('     belső számlálókat: `Egysegek._szabad` (melyik slotba születik a');
        console.log('     következő egység), a `Munkasok.utolsoTav`, a `Kod` állapota,');
        console.log('     és a `Sim.rng` generátor-állása.');
        bukas++;
      } else {
        console.log('\n  \u2713 A mentés TELJES: a betöltött meccs bitre ugyanúgy folytatódik.');
      }
    }
  }

  // ROSSZ MENTÉSEK: a betöltésnek udvariasan el kell utasítania, nem összeomlania.
  const C = new Sim({ seed: SEED ^ 0xff, n: 256, maxEgyseg: 2000 });
  const masSeed = betoltesSzoveg(C, szoveg);
  const romlott = betoltesSzoveg(new Sim({ seed: SEED, n: 256, maxEgyseg: 2000 }), '{ nem json');
  sor('idegen seed / romlott fájl',
    (masSeed.ok ? 'ELFOGADVA' : 'elutasítva') + ' / ' + (romlott.ok ? 'ELFOGADVA' : 'elutasítva'),
    'mindkettőt el KELL utasítani');
  if (masSeed.ok || romlott.ok) {
    console.log('\n  \u26d4 A BETÖLTÉS ELFOGAD HIBÁS MENTÉST. A terep a SEEDBŐL épül, és');
    console.log('     nincs a mentésben — idegen seeddel a betöltött sereg más pályán');
    console.log('     állna, mint amin a meccs zajlott.');
    bukas++;
  }
}
sor('lefutott', ((Date.now() - t10) / 1000).toFixed(1) + ' mp');
mentesBukas = bukas - mentesBukas;

// ════════════════════════════════════════════════════════════════════════════
// 11) v0.8/1 — LOCKSTEP MAG
// ════════════════════════════════════════════════════════════════════════════
//
// A hálózat nem világállapotot küld, hanem PARANCSOKAT: ki mit adott ki és
// melyik körre. Minden gép ugyanazt a szimulációt futtatja ugyanarra a
// parancs-sorra — és ha a sim determinisztikus, az eredmény bitre azonos.
//
// Ezért volt a determinizmus KAPU a v0.1 óta: a teljes hálózati terv erre az
// egy feltevésre épül. Ez a vizsgálat az, ami végre KI IS PRÓBÁLJA.
//
// ⚠️ ÉS EZÉRT NEM ELÉG MEGNÉZNI, HOGY KÉT EGYEZŐ FUTÁS EGYEZŐNEK LÁTSZIK-E.
// Egy desync-detektor, ami sosem sül el, ROSSZABB A SEMMINÉL: biztonságérzetet
// ad. A vizsgálat második fele ezért SZÁNDÉKOSAN elrontja az egyik oldalt, és
// megköveteli, hogy a detektor kiszúrja.
cim('11) v0.8/1 LOCKSTEP — két gép, közös parancs-sor');
const t11 = Date.now();
let lockstepBukas = bukas;
{
  const { Sim } = await import(pathToFileURL(join(SIM_DIR, 'sim.js')).href);
  const { Lockstep, KOR_TICK, KESLELTETES_KOR, ALLAPOT } = await import(
    pathToFileURL(join(GYOKER, 'src', 'net', 'lockstep.js')).href);
  const { Hurok } = await import(pathToFileURL(join(GYOKER, 'src', 'net', 'hurok.js')).href);

  const KOROK = ervSzam('lskor', 900);

  /**
   * Két „gép", két friss sim, egy hurok. A parancsokat a KÖRSZÁMBÓL
   * származtatjuk, nem véletlenből — így a vizsgálat maga is reprodukálható,
   * és mindkét játékos ad parancsot (nem csak az egyik).
   */
  function ketGep(keses, rontas) {
    const h = new Hurok();
    const gepek = [];
    for (let j = 0; j < 2; j++) {
      const sim = new Sim({ seed: SEED, n: 256, maxEgyseg: 2000 });
      sim.szondaFelallasV06(FORGATOKONYVEK.v06.egysegSzam);
      const ls = new Lockstep(sim, {
        jatekos: j, jatekosDb: 2, kuld: (u) => h.kuld(u),
      });
      h.csatlakoz(j, (u) => ls.fogad(u), keses);
      gepek.push({ sim, ls });
    }
    // INDÍTÁS CSAK AZ ÖSSZES VÉGPONT BEKÖTÉSE UTÁN — lásd `Lockstep.indit()`.
    for (let j = 0; j < 2; j++) gepek[j].ls.indit();
    for (let k = 0; k < KOROK; k++) {
      for (let j = 0; j < 2; j++) {
        const g = gepek[j];
        // Minden 15. körben mindkét játékos menetparancsot ad a saját
        // seregének. A cél a körszámból jön — determinisztikus „játékos".
        if ((k % 15) === (j * 7)) {
          const e = g.sim.egysegek;
          const kik = [];
          for (let i = 0; i < e.db && kik.length < 5; i++) {
            if (e.csapat[i] === j && g.sim.harc.elo[i] && e.tipus[i] !== 0) kik.push(i);
          }
          if (kik.length) {
            g.ls.helyiParancs({
              fajta: 'menet', egysegek: kik,
              x: 40 + ((k * 13) % 170), y: 40 + ((k * 29) % 170),
            });
          }
        }
        g.ls.lep();
      }
      h.lep();
      // A ROMLÁS: egyetlen egység pozícióját elmozdítjuk az EGYIK gépen. Ez a
      // legkisebb elképzelhető eltérés — ha ezt nem fogja meg a detektor,
      // akkor egy valódi desyncet sem fogna meg.
      if (rontas > 0 && k === rontas && gepek[1].sim.egysegek.db > 0) {
        gepek[1].sim.egysegek.px[0] += 0.001;
      }
    }
    return { gepek, hurok: h };
  }

  // ── A) TISZTA FUTÁS, KÉSLELTETETT HÁLÓZATTAL ───────────────────────
  const A = ketGep(1, 0);
  const a0 = A.gepek[0].ls.osszesites(), a1 = A.gepek[1].ls.osszesites();
  const h0 = A.gepek[0].sim.allapotHash(), h1 = A.gepek[1].sim.allapotHash();
  sor('lefutott kör', a0.vegrehajtottKor + ' / ' + a1.vegrehajtottKor,
    KOR_TICK + ' tick/kör, bemenet-késleltetés ' + KESLELTETES_KOR + ' kör');
  sor('csomag', a0.kuldott + ' küldött · ' + a0.fogadott + ' fogadott',
    'hurok: ' + A.hurok.tovabbitott + ' továbbított, 1 kör késés');
  sor('végrehajtott parancs', a0.vegrehajtottParancs + ' / ' + a1.vegrehajtottParancs);
  sor('hash-vizsgálat', a0.hashVizsgalat + ' / ' + a1.hashVizsgalat, 'desync-detektor futásai');
  sor('záró hash', '0x' + (h0 >>> 0).toString(16).padStart(8, '0')
    + (h0 === h1 ? '  =  ' : '  ≠  ') + '0x' + (h1 >>> 0).toString(16).padStart(8, '0'));

  if (a0.vegrehajtottKor === 0 || a1.vegrehajtottKor === 0) {
    console.log('\n  \u26d4 A LOCKSTEP EGYETLEN KÖRT SEM HAJTOTT VÉGRE: örökre vár.');
    console.log('     Nézd meg a kezdő üres csomagokat (`KESLELTETES_KOR` darab)');
    console.log('     és a `_teljes()` feltételt.');
    bukas++;
  } else if (h0 !== h1) {
    console.log('\n  \u26d4 A KÉT GÉP SZÉTTARTOTT, pedig ugyanazt a parancs-sort kapta.');
    console.log('     Ez NEM hálózati hiba: vagy a sim nem determinisztikus, vagy a');
    console.log('     parancsok VÉGREHAJTÁSI SORRENDJE gépenként más. Elsőnek a');
    console.log('     `Lockstep.lep()` játékos-sorrendű ciklusát nézd meg.');
    bukas++;
  } else if (a0.vegrehajtottParancs === 0 || a1.vegrehajtottParancs === 0) {
    // A determinizmus-kapu NEM működés-kapu: két SEMMIT NEM CSINÁLÓ gép is
    // tökéletesen egyezik. Ha egyetlen parancs sem ment át, a vizsgálat a
    // parancs-útról semmit nem mondott.
    console.log('\n  \u26d4 EGYETLEN PARANCS SEM HAJTÓDOTT VÉGRE a lockstepen át.');
    console.log('     A két gép egyezik, de üresen: a `helyiParancs` → csomag →');
    console.log('     `parancsTickre` út nem futott le. Így a vizsgálat SEMMIT nem');
    console.log('     bizonyít a hálózati útról.');
    bukas++;
  } else if (a0.hashVizsgalat === 0) {
    console.log('\n  \u26d4 A DESYNC-DETEKTOR EGYSZER SEM FUTOTT LE: a csomagok nem');
    console.log('     hoztak hasht, vagy a `_ellenoriz` körszáma sosem talál.');
    bukas++;
  } else {
    console.log('\n  \u2713 Két gép, közös parancs-sor, késleltetett hálózat — bitre azonos.');
  }

  // ── B) LASSÚ HÁLÓZAT: MEGÁLL, MAJD FELZÁRKÓZIK ─────────────────────
  //
  // A lockstep legjellemzőbb viselkedése, hogy MEGÁLL, ha valakinek nem
  // érkezett meg a csomagja. Az azonnali huroknál ez az ág alig fut le, tehát
  // a kapun kívül maradna — egy öt körrel késleltetett hálózat viszont
  // körönként megállásra kényszerít. A követelmény kettős: a megállásnak meg
  // KELL történnie, és utána a két gépnek AZONOSAN kell folytatnia.
  const L = ketGep(5, 0);
  const l0 = L.gepek[0].ls.osszesites(), l1 = L.gepek[1].ls.osszesites();
  const lh0 = L.gepek[0].sim.allapotHash(), lh1 = L.gepek[1].sim.allapotHash();
  sor('lassú hálózat (5 kör)', l0.vegrehajtottKor + ' / ' + l1.vegrehajtottKor + ' kör',
    'megállás: ' + l0.varakozas + ' / ' + l1.varakozas);
  // v0.8/4 — ADAPTÍV KÖRHOSSZ. A rossz vonalon a körnek MEG KELL NYÚLNIA,
  // különben a lockstep körönként megáll és a játék szaggat. A gyorson viszont
  // maradjon rövid — a hosszú kör fölösleges bemenet-késleltetés.
  sor('körhossz', a0.korHossz + ' tick (gyors) → ' + l0.korHossz + ' tick (lassú)',
    'változás: ' + a0.korHosszValtas + ' / ' + l0.korHosszValtas + ' · kért: '
    + l0.kertKorHossz + ' / ' + l1.kertKorHossz);
  if (l0.korHossz !== l1.korHossz) {
    console.log('\n  \u26d4 A KÉT GÉP MÁS KÖRHOSSZAT HASZNÁL (' + l0.korHossz + ' / '
      + l1.korHossz + ').');
    console.log('     A körhossz szabja meg, MELYIK TICKRE esnek a parancsok — ha ez');
    console.log('     gépenként eltér, az azonnali desync. A megegyezésnek MINDENKI');
    console.log('     ugyanabból a csomag-halmazból kell kijönnie (`_korHosszTerv`).');
    bukas++;
  }
  if (l0.korHossz <= a0.korHossz) {
    console.log('\n  \u26d4 A LASSÚ HÁLÓZATON NEM NYÚLT MEG A KÖR (' + l0.korHossz
      + ' tick, ugyanannyi mint a gyorson).');
    console.log('     Az adaptív körhossz ága néma: vagy a mérési ablak nem zárul, vagy');
    console.log('     a kért hossz nem jut át a csomagban, vagy a menetrend nem hat.');
    bukas++;
  }
  if (a0.korHossz > 6) {
    // Fordított irányú gát: a JÓ vonalon a hosszú kör tiszta veszteség.
    console.log('\n  \u26d4 A GYORS HÁLÓZATON IS MEGNYÚLT A KÖR (' + a0.korHossz + ' tick).');
    console.log('     Ez fölösleges bemenet-késleltetés: a szabályozó akkor is emel,');
    console.log('     amikor nincs miért.');
    bukas++;
  }
  if (l0.varakozas === 0 && l1.varakozas === 0) {
    console.log('\n  \u26d4 A LOCKSTEP EGYSZER SEM ÁLLT MEG öt kör késés mellett sem.');
    console.log('     Vagy a hurok nem késleltet, vagy a `_teljes()` mindig igazat ad —');
    console.log('     mindkét esetben a lockstep LÉNYEGE nincs kipróbálva.');
    bukas++;
  } else if (lh0 !== lh1) {
    console.log('\n  \u26d4 LASSÚ HÁLÓZATON SZÉTTARTOTTAK. A késés nem befolyásolhatja az');
    console.log('     eredményt — a kör csak KÉSŐBB fut le, nem MÁSKÉPP.');
    bukas++;
  } else if (l0.vegrehajtottKor === 0) {
    console.log('\n  \u26d4 A LASSÚ HÁLÓZATON EGYETLEN KÖR SEM FUTOTT LE: nem lassulás,');
    console.log('     hanem holtpont. Nézd meg a `TURELEM_KOR`-t és a csomag-küldést.');
    bukas++;
  } else {
    console.log('  \u2713 Öt kör késésnél megáll és felzárkózik — az eredmény ugyanaz.');
  }

  // ── C) A DETEKTOR PRÓBÁJA ──────────────────────────────────────────
  const B = ketGep(1, 120);
  const b0 = B.gepek[0].ls.osszesites(), b1 = B.gepek[1].ls.osszesites();
  const elkapta = b0.allapot === ALLAPOT.DESYNC || b1.allapot === ALLAPOT.DESYNC;
  const kor = b0.desyncKor >= 0 ? b0.desyncKor : b1.desyncKor;
  sor('szándékos romlás', '0,001 egység elmozdulás a 120. körben',
    elkapta ? 'ELKAPVA a ' + kor + '. körnél' : 'ÉSZREVÉTLEN');
  if (!elkapta) {
    console.log('\n  \u26d4 A DESYNC-DETEKTOR NEM VETTE ÉSZRE a szándékos romlást.');
    console.log('     Egy detektor, ami sosem sül el, ROSSZABB A SEMMINÉL: pontosan');
    console.log('     ott ad biztonságérzetet, ahol a legnagyobb a baj. Nézd meg a');
    console.log('     `_ellenoriz` körszámítását és azt, hogy a csomag visz-e hasht.');
    bukas++;
  } else {
    console.log('  \u2713 A detektor a legkisebb elképzelhető eltérést is elkapta.');
  }
}
sor('lefutott', ((Date.now() - t11) / 1000).toFixed(1) + ' mp');
lockstepBukas = bukas - lockstepBukas;

// ════════════════════════════════════════════════════════════════════════════
// 12) v0.9/1 — CIVILIZÁCIÓK
// ════════════════════════════════════════════════════════════════════════════
//
// A civ-réteg CSAK ADAT: nyolc nép, ugyanaz az öt egység, más számokkal. Épp
// ezért ez a projekt legkönnyebben elnémuló alrendszere. Egy elmaradó
// `beallit()`, egy rossz csapat-index, egy elfelejtett beakasztási pont — és a
// nyolc nép mind a semleges alapon játszik. A determinizmus-kapu ebből SEMMIT
// nem venne észre: a semmittevés bitre reprodukálható.
//
// Ezért három, egymást fedő gát van itt:
//
//   A) DETERMINIZMUS — két friss futás és egy kevert futás, mint mindenhol.
//   B) MŰKÖDÉS — az `osszesites().elter` megmondja, hány lekérdező érték tér
//      el az alaptól. Ha ez nulla egy civet játszó csapatnál, a réteg néma.
//   C) HATÁS — ugyanaz a meccs, CIV NÉLKÜL is lefuttatva. Ha a két világ
//      záró hashe MEGEGYEZIK, akkor a bónuszok bejegyződtek a saját
//      tömbjeikbe, de a VILÁGHOZ nem értek hozzá: a beakasztási pontok
//      hiányoznak. Ez az egyetlen gát, ami a hiányzó HORGOT fogja meg — a
//      `civ.js` maga tökéletesen működhet mellette.
cim('12) v0.9 CIVILIZÁCIÓK ÉS EGYEDI EGYSÉGEK — nyolc nép, két oldal');
const t12 = Date.now();
let civBukas = bukas;
const ketV09 = ketFutas(FORGATOKONYVEK.v09);
let kevertV09 = { ok: false, tick: 0 };
sor('forgatókönyv', FORGATOKONYVEK.v09.nev);
sor('lefutott tick', ketV09.tick, '(' + ((Date.now() - t12) / 1000).toFixed(1) + ' mp)');
if (ketV09.ok) {
  sor('két futás', 'AZONOS', (FORGATOKONYVEK.v09.tickek / HASH_KOZ) + ' ellenőrzőpont');
  sor('záró hash', '0x' + ketV09.hashek.get(FORGATOKONYVEK.v09.tickek).toString(16).padStart(8, '0'));
  kevertV09 = kevertFutas(ketV09.hashek, FORGATOKONYVEK.v09);
  if (!kevertV09.ok) {
    console.log('\n  ⛔ ELTÉRÉS a(z) ' + kevertV09.tick + '. ticken a KEVERT futásban.');
    bukas++;
  }
} else {
  console.log('\n  ⛔ DESYNC a(z) ' + ketV09.tick + '. ticken:');
  console.log('       A: 0x' + (ketV09.a >>> 0).toString(16).padStart(8, '0'));
  console.log('       B: 0x' + (ketV09.b >>> 0).toString(16).padStart(8, '0'));
  console.log('     A `civ.js` csak egész aritmetikát használhat: a százalékok');
  console.log('     `Civ.szazalek`-en át mennek, épp azért, hogy a kerekítés');
  console.log('     EGY helyen dőljön el.');
  bukas++;
}

{
  const { Sim } = await import(pathToFileURL(join(SIM_DIR, 'sim.js')).href);
  const { CIV_NINCS, CIV_DB, CIV_NEV, HATAS, civBonuszai } = await import(
    pathToFileURL(join(SIM_DIR, 'civ.js')).href);
  const { NEHEZSEG } = await import(pathToFileURL(join(SIM_DIR, 'ai.js')).href);
  const DB = FORGATOKONYVEK.v09.egysegSzam;
  const TICK = FORGATOKONYVEK.v09.tickek;

  // ── B) MŰKÖDÉS + C) HATÁS: két meccs, civvel és civ nélkül ─────────
  // A civ NÉLKÜLI meccs mindenben azonos: ugyanaz a seed, ugyanaz a felállás,
  // ugyanaz a nehézség mindkét oldalon. Az EGYETLEN különbség a nyolc bónusz.
  const civvel = new Sim({ seed: SEED, n: 256, maxEgyseg: 2000 });
  civvel.szondaFelallasV09(DB);
  const nelkul = new Sim({ seed: SEED, n: 256, maxEgyseg: 2000 });
  nelkul.szondaFelallas(DB, { munkasMinden: 1 });
  nelkul.ai.beallit(0, NEHEZSEG.NEHEZ);
  nelkul.ai.beallit(1, NEHEZSEG.NEHEZ);
  for (let t = 1; t <= TICK; t++) { civvel.lep(); nelkul.lep(); }

  const c0 = civvel.civ.osszesites(0), c1 = civvel.civ.osszesites(1);
  console.log('');
  sor('választott nép', c0.nev + ' / ' + c1.nev,
    'a nyolcból (' + CIV_DB + ' elérhető)');
  sor('bejegyzett bónusz-sor', c0.bonuszDb + ' / ' + c1.bonuszDb,
    'elutasított beállítás: ' + c0.elutasitva + ' / ' + c1.elutasitva);
  sor('alaptól eltérő érték', c0.elter + ' / ' + c1.elter,
    'ha NULLA, a réteg néma');

  if (c0.civ === CIV_NINCS || c1.civ === CIV_NINCS) {
    console.log('\n  ⛔ VALAMELYIK CSAPAT SEMLEGES MARADT: a `civValaszt` nem ért el');
    console.log('     a `Civ.beallit`-ig, vagy a `szondaFelallas` nullázása után nem');
    console.log('     állt vissza. Ez a v0.5 technológia-nullázásának pontos mása.');
    bukas++;
  }
  if (c0.civ === c1.civ) {
    console.log('\n  ⛔ A KÉT CSAPAT UGYANAZT A NÉPET JÁTSSZA. Így egy elrontott');
    console.log('     csapat-indexelés SEMMIT nem változtatna a hash-en — a vizsgálat');
    console.log('     éppen azt veszítené el, amiért a két különböző civ bekerült.');
    bukas++;
  }
  if (c0.elter === 0 || c1.elter === 0) {
    console.log('\n  ⛔ VALAMELYIK CIV MINDEN ÉRTÉKE AZ ALAPON ÁLL: a `_hat()`');
    console.log('     switch-je nem ír, vagy a `CIV_BONUSZ` sora üres. Nyolc néma nép');
    console.log('     tökéletesen determinisztikus — és pontosan semmit nem ér.');
    bukas++;
  }
  if (c0.elutasitva + c1.elutasitva > 0) {
    console.log('\n  ⛔ VOLT ELUTASÍTOTT CIV-BEÁLLÍTÁS: rossz civ- vagy csapat-index');
    console.log('     ment be a `beallit()`-be. A meccs elindult, de nem azzal, amit kért.');
    bukas++;
  }

  // MINDEN NÉPNEK VAN HÁTRÁNYA IS. Nem stílus-kérdés: egy csupa pozitívumból
  // álló nép nem „erős civ", hanem a választás megszüntetése — mindenki azt
  // játszaná, és a másik hét nép halott kód lenne. Ez a szám a v0.13 hangolása
  // ELŐTT és UTÁN is ugyanazt kell mondja.
  //
  // ⚠️ AZ ELŐJEL NEM ÖNMAGÁBAN BESZÉL. Az ÁR és az IDŐ fordítva olvasandó: a
  // Kristálykovácsok +10 %-os egység-ára HÁTRÁNY, nem előny. A gát első
  // változata pont ezen bukott el — és igaza is volt abban, hogy szólt: egy
  // olyan ellenőrzés, ami a `-` jelet keresi, a v0.13 hangolása közben
  // rendszeresen hazudna, hol az egyik, hol a másik irányba.
  const FORDITOTT = [HATAS.EPULET_AR, HATAS.EGYSEG_AR, HATAS.EGYSEG_IDO];
  const hatrany = (hatas, ertek) => (FORDITOTT.indexOf(hatas) >= 0 ? ertek > 0 : ertek < 0);
  let csupaJo = -1;
  for (let c = 0; c < CIV_DB; c++) {
    const sorok = civBonuszai(c);
    let van = false;
    for (let s = 0; s < sorok.length; s++) if (hatrany(sorok[s][0], sorok[s][2])) { van = true; break; }
    if (!van) { csupaJo = c; break; }
  }
  sor('hátrány minden népnél', csupaJo < 0 ? 'igen' : 'NEM (' + CIV_NEV[csupaJo] + ')',
    'a hátrány nélküli nép megszünteti a választást');
  if (csupaJo >= 0) {
    console.log('\n  ⛔ A(Z) „' + CIV_NEV[csupaJo] + '" NÉPNEK NINCS EGYETLEN NEGATÍV');
    console.log('     tétele sem. Aki ezt választja, minden másnál jobban jár, tehát a');
    console.log('     többi hét nép a gyakorlatban kikerül a játékból.');
    bukas++;
  }

  // ── C) A HATÁS: a két VILÁGNAK kell szétválnia ─────────────────────
  //
  // ⚠️ A ZÁRÓ HASH ITT NEM HASZNÁLHATÓ, ÉS EZ MÉRÉS EREDMÉNYE. Első
  // változatban a gát azt kérdezte, hogy `allapotHash()` eltér-e civvel és
  // anélkül. Kipróbálva — mind a kilenc lekérdező semlegesre írva — a hash
  // AKKOR IS eltért: a civ-INDEX maga is benne van a hashben (épp azért, hogy
  // a lockstepben ne lehessen két gép más néppel). Vagyis a gát SOSEM sült
  // volna el, és pont azt a hibát nem fogta volna meg, amiért megírtuk.
  //
  // Ezért a összehasonlítás MÉRT VILÁG-SZÁMOKON megy, amikhez a civ CSAK a
  // horgokon át érhet hozzá. Ha mind a nyolc egyezik, a bónuszok bejegyződtek
  // a saját tömbjeikbe, de a világhoz nem értek hozzá.
  const ujjlenyomat = (s) => {
    const ki = [];
    for (let cs = 0; cs < 2; cs++) {
      let gy = 0;
      for (let f = 0; f < 4; f++) gy += s.gazdasag.osszegyujtott[cs * 4 + f];
      let epDb = 0, epHp = 0;
      for (let i = 0; i < s.epuletek.db; i++) {
        if (!s.epuletek.elo[i] || (s.epuletek.csapat[i] & 1) !== cs) continue;
        epDb++; epHp += s.epuletek.hp[i];
      }
      let egyDb = 0, egyHp = 0;
      for (let i = 0; i < s.egysegek.db; i++) {
        if (!s.harc.elo[i] || (s.egysegek.csapat[i] & 1) !== cs) continue;
        egyDb++; egyHp += s.harc.hp[i];
      }
      ki.push(gy, epDb, epHp, egyDb, egyHp,
        s.kepzes.keszult[cs], s.gazdasag.nepessegAllapot(cs).max,
        s.technologia.osszesites(cs).kesz);
    }
    return ki;
  };
  const uC = ujjlenyomat(civvel), uN = ujjlenyomat(nelkul);
  let eltero = 0;
  for (let i = 0; i < uC.length; i++) if (uC[i] !== uN[i]) eltero++;

  const gyujt = (u, cs) => u[cs * 8];
  sor('összegyűjtött nyersanyag', gyujt(uC, 0) + '·' + gyujt(uC, 1)
    + '  /  ' + gyujt(uN, 0) + '·' + gyujt(uN, 1), 'civvel / nélküle');
  sor('népesség-plafon', uC[6] + '·' + uC[14] + '  /  ' + uN[6] + '·' + uN[14],
    'a folyami kereskedő +10 főt bír el');
  sor('eltérő világ-szám', eltero + ' / ' + uC.length,
    'csak a horgokon át változhat');

  if (eltero === 0) {
    console.log('\n  ⛔ A CIVVEL ÉS A CIV NÉLKÜL JÁTSZOTT MECCS VILÁGA AZONOS.');
    console.log('     A bónuszok bejegyződtek a saját tömbjeikbe (`elter` nem nulla),');
    console.log('     de a VILÁGHOZ nem értek hozzá: a beakasztási pontok hiányoznak.');
    console.log('     Nézd meg a horgokat — `harc.js` (sebzés, páncél), `munkas.js`');
    console.log('     (ütem, cipelés), `epuletek.js` (életerő), `parancsok.js` és');
    console.log('     `kepzes.js` (ár, idő), `gazdasag.js` (népesség).');
    bukas++;
  }

  // ── A HORGOK MEGLÉTE, FORRÁSSZINTEN ────────────────────────────────
  //
  // A fenti hash-gát azt mondja meg, hogy VALAMI hatott — de nem azt, hogy
  // MIND A KILENC horog a helyén van-e. Két bónusz is elég ahhoz, hogy a hash
  // szétváljon, és a maradék hét némán elveszne. A forrás-szintű ellenőrzés
  // durva eszköz, viszont pont azt a hibát fogja meg, amit a mérés nem: a
  // csendben eltűnt hívást egy későbbi átírás után.
  const HORGOK = [
    ['harc.js', 'sebzesBonusz'], ['harc.js', 'pancelBonusz'],
    ['munkas.js', 'utemSzazalek'], ['munkas.js', 'cipelTobblet'],
    ['epuletek.js', 'epuletHpSzazalek'], ['parancsok.js', 'epuletArSzazalek'],
    ['kepzes.js', 'egysegArSzazalek'], ['kepzes.js', 'egysegIdoSzazalek'],
    ['gazdasag.js', 'nepessegEltolas'], ['ai.js', 'epuletArSzazalek'],
  ];
  let hianyzo = [];
  for (let i = 0; i < HORGOK.length; i++) {
    const forras = readFileSync(join(SIM_DIR, HORGOK[i][0]), 'utf8');
    if (!forras.includes(HORGOK[i][1])) hianyzo.push(HORGOK[i][0] + ':' + HORGOK[i][1]);
  }
  sor('beakasztási pont', (HORGOK.length - hianyzo.length) + ' / ' + HORGOK.length,
    hianyzo.length ? 'HIÁNYZIK: ' + hianyzo.join(', ') : 'mind a helyén');
  if (hianyzo.length) {
    console.log('\n  ⛔ HIÁNYZÓ CIV-HOROG: ' + hianyzo.join(', '));
    console.log('     A bónusz be van jegyezve, de senki nem kérdezi meg.');
    bukas++;
  }

  // ── v0.9/2 — AZ EGYEDI EGYSÉG ──────────────────────────────────────
  //
  // Egyetlen `TIPUS`, nyolc nép, csapatfüggő számokkal. A veszély itt nem a
  // desync, hanem a NÉMASÁG: ha a gép sosem képezi ki, vagy rossz épületben
  // próbálja, a réteg tökéletesen reprodukálhatóan nem csinál semmit.
  //
  // Négy szám, négy külön hibára:
  //   · a két csapat MÁS egységet kap (`hp`/`sebzes` eltér)
  //   · a meccsben RENDELT is, KÉSZÜLT is belőle
  //   · a képző épület civenként MÁS, és rossz épületben ELUTASÍT
  //   · mind a NYOLC nép sora ép, és mind a nyolcat sorba lehet állítani
  const e0 = civvel.egyedi.osszesites(0), e1 = civvel.egyedi.osszesites(1);
  console.log('');
  sor('egyedi egység', e0.nev + ' / ' + e1.nev,
    'életerő ' + e0.hp + '·' + e1.hp + ' · sebzés ' + e0.sebzes + '·' + e1.sebzes);
  sor('rendelt / elkészült', civvel.ai.egyediDb[0] + '→' + e0.keszult
    + ' / ' + civvel.ai.egyediDb[1] + '→' + e1.keszult,
    'rossz épületben elutasítva: ' + e0.elutasitva + ' / ' + e1.elutasitva);

  if (e0.hp === e1.hp && e0.sebzes === e1.sebzes && e0.utem === e1.utem) {
    console.log('\n  ⛔ A KÉT CSAPAT EGYEDI EGYSÉGE SZÁMRA AZONOS: a `beallit()` nem');
    console.log('     a civ sorát teríti ki, vagy mindkét csapat ugyanazt kapja.');
    bukas++;
  }
  if (civvel.ai.egyediDb[0] + civvel.ai.egyediDb[1] === 0) {
    console.log('\n  ⛔ EGYIK GÉP SEM RENDELT EGYETLEN EGYEDI EGYSÉGET SEM.');
    console.log('     Mérve már kétszer megtörtént: egyszer azért, mert a képző épület');
    console.log('     nem volt a build orderben, egyszer azért, mert a gép a SEMLEGES');
    console.log('     ár-sort nézte a civ sora helyett. Nézd meg a `KEPZES_SORREND`-et,');
    console.log('     az `Ai._buildOrder` egyedi-helyét és az `Ai._egysegAr`-t.');
    bukas++;
  } else if (e0.keszult + e1.keszult === 0) {
    console.log('\n  ⛔ RENDELÉS VOLT, EGYSÉG NEM LETT: a sorbaállás mindig elutasításba');
    console.log('     futott. A szándék és az eredmény nem ér össze — ugyanaz a hibafajta,');
    console.log('     mint a v0.6/1 száz építési parancsa és egy háza.');
    bukas++;
  }

  // MIND A NYOLC NÉP — gyors, meccs nélküli próba. A meccses mérés csak KETTŐT
  // járat meg; a maradék hat sora úgy maradhatna hibás, hogy semmi nem szól
  // érte. Itt minden népre kiterítjük az adatsort, és a KÉPZÉS ÚTJÁN próbáljuk
  // sorba állítani — a jó épületben és egy rosszban is.
  {
    const { EPULET } = await import(pathToFileURL(join(SIM_DIR, 'epuletek.js')).href);
    const { TIPUS } = await import(pathToFileURL(join(SIM_DIR, 'units.js')).href);
    let rossz = [];
    for (let c = 0; c < CIV_DB; c++) {
      const p = new Sim({ seed: SEED, n: 128, maxEgyseg: 200 });
      p.civValaszt(0, c);
      p.szondaFelallas(4, { munkasMinden: 1 });
      const o = p.egyedi.osszesites(0);
      if (!o.van || o.hp <= 0 || o.sebzes <= 0 || o.utem <= 0 || o.ido <= 0 || o.nep <= 0) {
        rossz.push(CIV_NEV[c] + ': hiányos adatsor'); continue;
      }
      let ar = 0;
      for (let f = 0; f < 4; f++) ar += p.egyedi.ar[f];
      if (ar <= 0) { rossz.push(CIV_NEV[c] + ': ingyen van'); continue; }
      // A jó épületben IGEN, egy másikban NEM. A „másik" a központ: az minden
      // meccsen áll, és sosem képez egyedi egységet.
      if (!p.kepzes.kepezheti(o.epulet, TIPUS.EGYEDI, 0)) {
        rossz.push(CIV_NEV[c] + ': a saját épülete sem képzi');
      }
      if (p.kepzes.kepezheti(EPULET.KOZPONT, TIPUS.EGYEDI, 0) && o.epulet !== EPULET.KOZPONT) {
        rossz.push(CIV_NEV[c] + ': a központ IS képzi');
      }
      if (p.kepzes.kepezheti(o.epulet, TIPUS.EGYEDI)) {
        rossz.push(CIV_NEV[c] + ': csapat nélkül is képezhető');
      }
    }
    sor('mind a nyolc nép sora', (CIV_DB - rossz.length) + ' / ' + CIV_DB,
      rossz.length ? 'HIBÁS: ' + rossz.join('; ') : 'ép, és a saját épülete képzi');
    if (rossz.length) {
      console.log('\n  ⛔ HIBÁS EGYEDI-ADATSOR: ' + rossz.join('; '));
      bukas++;
    }
  }

  if (bukas === civBukas) {
    console.log('\n  ✓ A nyolc nép determinisztikus, tényleg más számokkal játszik,');
    console.log('    a különbség a VILÁGON is meglátszik, és mindegyiknek van saját');
    console.log('    egysége, amit a gép ki is képez.');
  }
}
sor('lefutott', ((Date.now() - t12) / 1000).toFixed(1) + ' mp');
civBukas = bukas - civBukas;

// ════════════════════════════════════════════════════════════════════════════
// 13) v0.10/1 — TÉRKÉP-PRESETEK
// ════════════════════════════════════════════════════════════════════════════
//
// Hat preset, EGY generátor. A veszély itt nem a desync, hanem két másik:
//
//   A) A PRESET NEM CSINÁL SEMMIT. Hat név, hat leírás, és mögötte hatszor
//      ugyanaz a pálya. Tökéletesen determinisztikus, és a menüben hazugság.
//   B) A PRESET JÁTSZHATATLAN PÁLYÁT AD. Ez a rosszabb: egy térkép, ahol a két
//      bázis között nincs járható út, minden kapun átmegy — a hash stabil, a
//      számok nem nullák —, és a meccs mégis eldönthetetlen. A gépi ellenfél
//      örökké „támadásra készülne" úgy, hogy a serege el sem indul.
//
// Ezért a vizsgálat mind a hat presetet legenerálja, és mindegyikre KIMÉRI a
// járhatóságot, a nyersanyagokat és azt, hogy a két kezdő bázis egyáltalán
// eléri-e egymást. A „csak akkor játszható, ha a szonda látta" szabály itt
// szó szerint értendő: felhőben nincs GPU, ezt a pályát senki nem fogja
// szemmel megnézni.
cim('13) v0.10/1 TÉRKÉP-PRESETEK — hat pálya, egy generátor');
const t13 = Date.now();
let terkepBukas = bukas;
{
  const { Sim } = await import(pathToFileURL(join(SIM_DIR, 'sim.js')).href);
  const { TERKEP, TERKEP_DB, TERKEP_NEV, terkepBeallitas, terkepErvenyes } = await import(
    pathToFileURL(join(SIM_DIR, 'terkep.js')).href);
  const { TEREP } = await import(pathToFileURL(join(SIM_DIR, 'grid.js')).href);
  const { NYERS } = await import(pathToFileURL(join(SIM_DIR, 'eroforras.js')).href);

  /** Elér-e a 0. bázis az 1.-ig? Elárasztás a `jarhato` rácson. */
  const bazisElerheto = (s) => {
    const n = s.n, j = s.racs.jarhato;
    const rajt = s._jarhatoKozel(Math.round(n * 0.22), Math.round(n * 0.5));
    const cel = s._jarhatoKozel(Math.round(n * 0.78), Math.round(n * 0.5));
    if (!rajt || !cel) return { ok: false, resz: 0 };
    const latott = new Uint8Array(n * n);
    const sor = new Int32Array(n * n);
    let f = 0, v = 0, jarDb = 0;
    for (let i = 0; i < n * n; i++) if (j[i]) jarDb++;
    const si = (rajt.y | 0) * n + (rajt.x | 0);
    const ci = (cel.y | 0) * n + (cel.x | 0);
    sor[v++] = si; latott[si] = 1;
    let ok = false, elert = 0;
    while (f < v) {
      const c = sor[f++]; elert++;
      if (c === ci) ok = true;
      const cx = c % n, cy = (c / n) | 0;
      if (cx + 1 < n) { const i = c + 1; if (!latott[i] && j[i]) { latott[i] = 1; sor[v++] = i; } }
      if (cx > 0) { const i = c - 1; if (!latott[i] && j[i]) { latott[i] = 1; sor[v++] = i; } }
      if (cy + 1 < n) { const i = c + n; if (!latott[i] && j[i]) { latott[i] = 1; sor[v++] = i; } }
      if (cy > 0) { const i = c - n; if (!latott[i] && j[i]) { latott[i] = 1; sor[v++] = i; } }
    }
    return { ok, resz: jarDb ? (elert * 100 / jarDb) : 0 };
  };

  const hashek = new Set();
  const ujjak = new Set();
  console.log('  preset            járható%  víz%  szikla%   étel   fa    kő  kristály  bázis');
  console.log('  ' + '─'.repeat(76));
  for (let t = 0; t < TERKEP_DB; t++) {
    const s = new Sim({ seed: SEED, n: 256, maxEgyseg: 200, terkep: t });
    const n = s.n, cellak = n * n;
    let jar = 0, viz = 0, szik = 0;
    for (let i = 0; i < cellak; i++) {
      if (s.racs.jarhato[i]) jar++;
      if (s.racs.terep[i] === TEREP.VIZ) viz++;
      if (s.racs.terep[i] === TEREP.SZIKLA) szik++;
    }
    const db = [0, 0, 0, 0];
    for (let i = 0; i < s.eroforrasok.db; i++) db[s.eroforrasok.fajta[i]]++;
    const e = bazisElerheto(s);
    hashek.add(s.allapotHash() >>> 0);
    ujjak.add(jar + ':' + viz + ':' + szik + ':' + db.join(','));

    console.log('  ' + TERKEP_NEV[t].padEnd(16)
      + (jar * 100 / cellak).toFixed(1).padStart(8)
      + (viz * 100 / cellak).toFixed(1).padStart(7)
      + (szik * 100 / cellak).toFixed(1).padStart(8)
      + String(db[NYERS.ETEL]).padStart(7) + String(db[NYERS.FA]).padStart(6)
      + String(db[NYERS.KO]).padStart(6) + String(db[NYERS.KRISTALY]).padStart(9)
      + (e.ok ? '   elérhető' : '   NEM ÉRI EL'));

    // ── JÁTSZHATÓSÁGI INVARIÁNSOK ────────────────────────────────────
    if (!e.ok) {
      console.log('\n  ⛔ A(Z) „' + TERKEP_NEV[t] + '" PÁLYÁN A KÉT BÁZIS KÖZÖTT NINCS JÁRHATÓ ÚT.');
      console.log('     Minden kapun átmegy — a hash stabil, a számok nem nullák —, és a');
      console.log('     meccs mégis eldönthetetlen. Ez a preset így nem adható ki.');
      bukas++;
    }
    if (jar * 100 / cellak < 40) {
      console.log('\n  ⛔ A(Z) „' + TERKEP_NEV[t] + '" PÁLYA ' + (jar * 100 / cellak).toFixed(1)
        + ' %-A JÁRHATÓ — kevés a manőverhez.');
      bukas++;
    }
    for (let f = 0; f < 4; f++) {
      if (db[f] === 0) {
        console.log('\n  ⛔ A(Z) „' + TERKEP_NEV[t] + '" PÁLYÁN NINCS ' + f + '. NYERSANYAG.');
        console.log('     Négyből egy hiányzó nyersanyag egész épület- és technológia-ágakat');
        console.log('     tesz elérhetetlenné, a gép pedig örökre arra gyűjtene, ami nincs.');
        bukas++;
      }
    }
  }

  console.log('');
  sor('különböző kezdő hash', hashek.size + ' / ' + TERKEP_DB, 'presetenként más világ');
  sor('különböző világ-ujjlenyomat', ujjak.size + ' / ' + TERKEP_DB,
    'járhatóság + nyersanyag-eloszlás');
  if (hashek.size < TERKEP_DB || ujjak.size < TERKEP_DB) {
    console.log('\n  ⛔ KÉT PRESET UGYANAZT A PÁLYÁT ADJA. Hat név, hat leírás, és mögötte');
    console.log('     ugyanaz a világ — determinisztikus, és a menüben hazugság. Nézd meg a');
    console.log('     `terkep.js` paraméter-tábláját és azt, hogy a `grid.js` tényleg a');
    console.log('     preset számait használja-e a beégetett konstansok helyett.');
    bukas++;
  }

  // ── UGYANAZ A SEED + PRESET → BITRE UGYANAZ A PÁLYA ─────────────────
  // A lockstep LEGELSŐ feltétele, még a parancsok előtt. Két friss példány.
  let terepEltero = -1;
  for (let t = 0; t < TERKEP_DB && terepEltero < 0; t++) {
    const A = new Sim({ seed: SEED, n: 128, maxEgyseg: 50, terkep: t });
    const B = new Sim({ seed: SEED, n: 128, maxEgyseg: 50, terkep: t });
    for (let i = 0; i < A.n * A.n; i++) {
      if (A.racs.jarhato[i] !== B.racs.jarhato[i] || A.racs.terep[i] !== B.racs.terep[i]) {
        terepEltero = t; break;
      }
    }
    if (A.eroforrasok.db !== B.eroforrasok.db) terepEltero = t;
  }
  sor('két friss generálás', terepEltero < 0 ? 'AZONOS' : 'ELTÉR (' + TERKEP_NEV[terepEltero] + ')',
    'mind a ' + TERKEP_DB + ' preseten');
  if (terepEltero >= 0) {
    console.log('\n  ⛔ UGYANAZ A SEED ÉS PRESET KÉT KÜLÖNBÖZŐ PÁLYÁT ADOTT.');
    console.log('     Ez a lockstep legelső feltétele, a parancsok ELŐTT. Keress');
    console.log('     `Math.random`-ot vagy modul-szintű állapotot a `grid.js`-ben.');
    bukas++;
  }

  // ── A FOLYÓ ÁTÉRI-E A PÁLYÁT, ÉS VAN-E RAJTA GÁZLÓ ──────────────────
  //
  // ⚠️ KÉT IRÁNYBAN IS BUKTAT, ÉS EZ A LÉNYEGE. Egy folyó, ami nem éri át a
  // pályát, csak egy tó — a preset ígérete („aki a gázlót tartja…") hazugság
  // lenne. Egy folyó gázló nélkül viszont FAL: a fenti elérhetőség-gát ugyan
  // elkapná, de nem mondaná meg, mi a baj. A két szám együtt megnevezi a hibát.
  {
    const s = new Sim({ seed: SEED, n: 256, maxEgyseg: 50, terkep: TERKEP.FOLYAM });
    const n = s.n;
    const bal = (n * 0.30) | 0, jobb = (n * 0.70) | 0;
    let vizesSor = 0, szarazSor = 0, blokk = 0, futo = 0;
    for (let y = 0; y < n; y++) {
      let van = false;
      for (let x = bal; x < jobb; x++) {
        if (s.racs.terep[y * n + x] === TEREP.VIZ) { van = true; break; }
      }
      if (van) { vizesSor++; futo++; } else { szarazSor++; if (futo > 0) { blokk++; futo = 0; } }
    }
    if (futo > 0) blokk++;
    sor('folyó a középső sávban', vizesSor + ' / ' + n + ' sor',
      'megszakítás: ' + blokk + ' vízblokk · száraz sor: ' + szarazSor);
    if (vizesSor < n * 0.5) {
      console.log('\n  ⛔ A FOLYÓ NEM ÉRI ÁT A PÁLYÁT: ' + vizesSor + ' sor a ' + n + '-ből.');
      console.log('     Ez nem folyam, hanem tó — a preset leírása mást ígér a játékosnak.');
      bukas++;
    }
    if (blokk < 2) {
      console.log('\n  ⛔ A FOLYÓN NINCS GÁZLÓ: egyetlen összefüggő vízblokk.');
      console.log('     Fal, nem folyó. Nézd meg a `gazloEmeles()`-t és a `gazloDb`-t.');
      bukas++;
    }
  }

  // ── A NYÍLT MEZŐ A RÉGI SZÁMOKAT VISELI ─────────────────────────────
  //
  // Az alapértelmezés a v0.1 óta érvényes pálya, és minden addigi mérés ahhoz
  // van kötve. Ha a preset-tábla 0. sora elmozdul, a v0.1–v0.9 összes
  // forgatókönyve MÁS pályán futna — a szonda ettől még zöld lenne, hiszen
  // mindkét futása ugyanazon az új pályán menne.
  {
    const p = terkepBeallitas(TERKEP.NYILT_MEZO);
    const vart = {
      amplitudo: 5.0, emeles: 2.4, gerinc: 14.0, peremTav: 0.62, tengerTav: 0.95,
      sziklaLejto: 0.55, havasSzint: 9.5, folyoSzeles: 0, kristalyFurt: 14,
    };
    const rossz = [];
    for (const k of Object.keys(vart)) if (p[k] !== vart[k]) rossz.push(k);
    const furt = { etel: [13, 4, 5, 3], fa: [11, 34, 30, 6], ko: [7, 5, 5, 3] };
    for (const k of Object.keys(furt)) {
      for (let i = 0; i < 4; i++) if (p[k][i] !== furt[k][i]) { rossz.push(k); break; }
    }
    sor('nyílt mező = a v0.1 pálya', rossz.length ? 'ELMOZDULT' : 'változatlan',
      rossz.length ? 'eltérő mező: ' + rossz.join(', ') : 'mind a 12 szám');
    if (rossz.length) {
      console.log('\n  ⛔ AZ ALAPÉRTELMEZETT PRESET SZÁMAI ELMOZDULTAK: ' + rossz.join(', '));
      console.log('     A v0.1–v0.9 minden forgatókönyve ezen a pályán futott. A szonda');
      console.log('     ettől még zöld marad — mindkét futása az ÚJ pályán menne —, de a');
      console.log('     `qa/` mappa mért számai egy csapásra összehasonlíthatatlanná válnak.');
      bukas++;
    }
  }

  // ── A MENTÉS ELUTASÍTJA A MÁS PRESETTEL KÉSZÜLT ÁLLÁST ──────────────
  // A terepet nem mentjük, tehát ez az EGYETLEN védelem: ugyanaz a seed és
  // méret, más preset — a betöltött sereg egy másik térkép vizében állna.
  {
    const { mentesSzoveg, betoltesSzoveg } = await import(
      pathToFileURL(join(SIM_DIR, 'mentes.js')).href);
    const A = new Sim({ seed: SEED, n: 128, maxEgyseg: 50, terkep: TERKEP.FOLYAM });
    A.szondaFelallas(8, { munkasMinden: 1 });
    for (let t = 0; t < 200; t++) A.lep();
    const szoveg = mentesSzoveg(A);
    const jo = betoltesSzoveg(new Sim({ seed: SEED, n: 128, maxEgyseg: 50, terkep: TERKEP.FOLYAM }), szoveg);
    const rossz = betoltesSzoveg(new Sim({ seed: SEED, n: 128, maxEgyseg: 50, terkep: TERKEP.HEGYVIDEK }), szoveg);
    sor('mentés más preseten', (jo.ok ? 'egyezőre elfogadva' : 'EGYEZŐRE ELUTASÍTVA')
      + ' / ' + (rossz.ok ? 'ELTÉRŐRE IS ELFOGADVA' : 'eltérőre elutasítva'));
    if (!jo.ok || rossz.ok) {
      console.log('\n  ⛔ A BETÖLTÉS NEM SZŰRI A TÉRKÉP-PRESETET. A terep nincs a mentésben —');
      console.log('     a seedből épül —, tehát ez az egyetlen védelem. Enélkül a betöltött');
      console.log('     sereg egy MÁSIK pálya vizében állna, és a hiba a mozgásra mutatna.');
      bukas++;
    }
  }

  // Érvénytelen preset-index: a nyílt mezőre kell esnie, nem összeomlania.
  const csunya = new Sim({ seed: SEED, n: 64, maxEgyseg: 10, terkep: 99 });
  sor('érvénytelen preset (99)', TERKEP_NEV[csunya.terkep],
    'érvényes-e a 99: ' + terkepErvenyes(99));
  if (csunya.terkep !== TERKEP.NYILT_MEZO || terkepErvenyes(99)) {
    console.log('\n  ⛔ AZ ÉRVÉNYTELEN PRESET NEM A NYÍLT MEZŐRE ESIK VISSZA.');
    bukas++;
  }

  if (bukas === terkepBukas) {
    console.log('\n  ✓ Hat preset, hat különböző és mind a hat JÁTSZHATÓ pálya —');
    console.log('    a két bázis mindegyiken eléri egymást, és mind a négy nyersanyag megvan.');
  }
}
sor('lefutott', ((Date.now() - t13) / 1000).toFixed(1) + ' mp');
terkepBukas = bukas - terkepBukas;

// ════════════════════════════════════════════════════════════════════════════
// 14) v0.17 — A MECCS VÉGE
// ════════════════════════════════════════════════════════════════════════════
//
// A v0.16-ig a `lep()` a végtelenségig lépett. A győzelmi réteg az ELSŐ olyan
// alrendszer, amit a determinizmus önmagában NEM tud igazolni — és ez itt nem
// elméleti aggály:
//
//   A) EGY SOHA EL NEM DŐLŐ MECCS BITRE REPRODUKÁLHATÓ. Ha a győzelmi feltétel
//      soha nem sül el, mind a tizenhárom eddigi vizsgálat zöld marad, és a
//      játék pontosan annyira megnyerhetetlen, mint a v0.16-ban volt. Ezért
//      ennek a körnek KÖTELEZŐEN látnia kell, hogy a meccs véget ÉR.
//   B) A VÉGE UTÁNI PARANCS A LEGVESZÉLYESEBB ÁG. A vég a `vegeTick`-ben és a
//      hashben van, tehát ha az egyik gép elfogad egy parancsot, amit a másik
//      eldob, az azonnali desync — pont az a fajta, amit a `parancsallapot.js`
//      fejléce leír. Mindkét kör SZÁNDÉKOSAN ad parancsot a vége után.
//   C) A KÉSZ MECCS MENTÉSE. A győzelmi mezők bekerültek az `allapotHash()`-be;
//      ha a `mentes.js`-ből kimaradnának, egy lejátszott meccs a betöltés után
//      FUTÓKÉNT támadna fel. A 10. vizsgálat ezt csak akkor fogja meg, ha a
//      mentés egy MÁR ELDŐLT meccsen történik — a v0.1-es körben sosem dől el.
//      Ezért van itt egy saját mentés-kör a vég UTÁNI állapotra.
cim('14) v0.17 A MECCS VÉGE — győzelem, feladás, és a vég utáni parancsok');
const t14 = Date.now();
let vegeBukas = bukas;

const ketV17 = ketFutas(FORGATOKONYVEK.v17);
sor('forgatókönyv', FORGATOKONYVEK.v17.nev);
sor('kezdő egységszám', FORGATOKONYVEK.v17.egysegSzam, '(ostromgép kell a központhoz)');
let kevertV17 = { ok: true, tick: 0 };
if (ketV17.ok) {
  sor('két futás', 'AZONOS', (FORGATOKONYVEK.v17.tickek / HASH_KOZ) + ' ellenőrzőpont');
  kevertV17 = kevertFutas(ketV17.hashek, FORGATOKONYVEK.v17);
  sor('kevert futás', kevertV17.ok ? 'AZONOS' : 'ELTÉRT (tick ' + kevertV17.tick + ')');
  if (!kevertV17.ok) bukas++;
} else {
  console.log('\n  ⛔ A GYŐZELMI KÖR SZÉTCSÚSZOTT a ' + ketV17.tick + '. ticken.');
  bukas++;
}

const ketV17f = ketFutas(FORGATOKONYVEK.v17f);
sor('forgatókönyv', FORGATOKONYVEK.v17f.nev);
let kevertV17f = { ok: true, tick: 0 };
if (ketV17f.ok) {
  sor('két futás', 'AZONOS', (FORGATOKONYVEK.v17f.tickek / HASH_KOZ) + ' ellenőrzőpont');
  kevertV17f = kevertFutas(ketV17f.hashek, FORGATOKONYVEK.v17f);
  sor('kevert futás', kevertV17f.ok ? 'AZONOS' : 'ELTÉRT (tick ' + kevertV17f.tick + ')');
  if (!kevertV17f.ok) bukas++;
} else {
  console.log('\n  ⛔ A FELADÁS-KÖR SZÉTCSÚSZOTT a ' + ketV17f.tick + '. ticken.');
  bukas++;
}

// ── MŰKÖDÉS-VIZSGÁLAT ─────────────────────────────────────────────────────
// Innentől nem a determinizmust nézzük, hanem hogy a réteg CSINÁL-E VALAMIT.
// Ugyanannyi tick, mint a determinizmus-kör: ami itt lefut, annak ott is le
// KELL futnia (a v0.5 körének tanulsága).
{
  const { VEG_OK } = await import(pathToFileURL(join(SIM_DIR, 'gyozelem.js')).href);
  const { mentes, betoltes } = await import(pathToFileURL(join(SIM_DIR, 'mentes.js')).href);

  // — 1. A KÖZPONT ELVESZTÉSE —
  const s = new Sim({ seed: SEED, n: 256, maxEgyseg: 2000 });
  s.szondaFelallas(FORGATOKONYVEK.v17.egysegSzam, FORGATOKONYVEK.v17.felallas);
  let kor = 0;
  for (let t = 1; t <= FORGATOKONYVEK.v17.tickek; t++) {
    if ((t % PARANCS_KOZ) === 0) { s.szondaParancsV17(kor); kor++; }
    s.lep();
  }
  const gy = s.gyozelem.osszesites();
  sor('a meccs véget ért', gy.vege ? 'IGEN' : 'NEM',
    gy.vege ? 'tick ' + gy.vegeTick + ' — ' + gy.okNev : '3000 tick alatt sem dőlt el');
  sor('győztes', gy.gyoztes >= 0 ? ('a ' + gy.gyoztes + '. csapat') : 'döntetlen',
    'kiesett: ' + gy.kiesett.join('/'));
  sor('vég utáni parancs', gy.elutasitottParancs, 'elutasítva (a vége UTÁN adva)');

  if (!gy.vege) {
    console.log('\n  ⛔ A MECCS NEM ÉRT VÉGET — a győzelmi ág KI SEM FUTOTT.');
    console.log('     A determinizmus-kapu ettől zöld: egy örökké tartó meccs is');
    console.log('     bitre reprodukálható. Pontosan ez volt a v0.16 állapota.');
    console.log('     Nézd meg a `gyozelem.js` `lep()`-jét és azt, hogy az ostromgép');
    console.log('     eljut-e egyáltalán az ellenséges központig.');
    bukas++;
  } else if (gy.ok !== VEG_OK.KOZPONT) {
    console.log('\n  ⛔ A MECCS VÉGET ÉRT, DE NEM A KÖZPONT MIATT (ok=' + gy.ok + ').');
    console.log('     Ez a kör pont a központ-rombolás ágát hivatott járatni.');
    bukas++;
  }
  if (gy.vege && gy.elutasitottParancs === 0) {
    console.log('\n  ⛔ A VÉG UTÁN EGYETLEN PARANCS SEM LETT ELUTASÍTVA.');
    console.log('     A forgatókönyv a vége után is ad parancsot, tehát az elutasító');
    console.log('     ág (`parancsok.js`) ki sem futott — az a legkockázatosabb ág,');
    console.log('     mert ha két gép máshogy dönt róla, az azonnali desync.');
    bukas++;
  }

  // — 2. A KÉSZ MECCS MENTÉSE —
  // A 10. vizsgálat a v0.1 körén fut, ahol a meccs sosem dől el. A győzelmi
  // mezők tehát ott VÉGIG az alapértéken állnak, és egy hiányzó mentés-mező
  // nem látszana. Itt viszont a mentés egy MÁR ELDŐLT meccsről készül.
  const s2 = new Sim({ seed: SEED, n: 256, maxEgyseg: 2000 });
  s2.szondaFelallas(FORGATOKONYVEK.v17.egysegSzam, FORGATOKONYVEK.v17.felallas);
  const be2 = betoltes(s2, JSON.parse(JSON.stringify(mentes(s))));
  sor('kész meccs betöltése', be2.ok ? 'sikerült' : 'HIBA: ' + be2.hiba);
  if (!be2.ok) {
    bukas++;
  } else {
    const h1 = s.allapotHash(), h2 = s2.allapotHash();
    const g2 = s2.gyozelem.osszesites();
    sor('hash mentés után', '0x' + h1.toString(16).padStart(8, '0'),
      'betöltve: 0x' + h2.toString(16).padStart(8, '0'));
    sor('a betöltött meccs vége', g2.vege ? 'IGEN' : 'NEM',
      'tick ' + g2.vegeTick + ', győztes: ' + g2.gyoztes);
    if (h1 !== h2) {
      console.log('\n  ⛔ EGY LEJÁTSZOTT MECCS BETÖLTVE MÁS ÁLLAPOT.');
      console.log('     A győzelmi mezők a hashben vannak — ha a `mentes.js`-ből');
      console.log('     kimaradnak, a kész meccs FUTÓKÉNT támad fel. Nézd meg a');
      console.log('     `gyozelem.mentesAllapot()` és a `mentes()` párját.');
      bukas++;
    }
  }

  // — 3. A FELADÁS —
  const s3 = new Sim({ seed: SEED, n: 256, maxEgyseg: 2000 });
  s3.szondaFelallas(FORGATOKONYVEK.v17f.egysegSzam, FORGATOKONYVEK.v17f.felallas);
  let korF = 0;
  for (let t = 1; t <= FORGATOKONYVEK.v17f.tickek; t++) {
    if ((t % PARANCS_KOZ) === 0) { s3.szondaParancsV17Feladas(korF); korF++; }
    s3.lep();
  }
  const gyF = s3.gyozelem.osszesites();
  sor('feladás után vége', gyF.vege ? 'IGEN' : 'NEM',
    gyF.vege ? 'tick ' + gyF.vegeTick + ' — ' + gyF.okNev : '');
  sor('győztes', gyF.gyoztes >= 0 ? ('a ' + gyF.gyoztes + '. csapat') : 'döntetlen',
    'feladta: ' + gyF.feladta.join('/'));
  sor('elfogadott feladás', gyF.feladasDb,
    'vég utáni parancs elutasítva: ' + gyF.elutasitottParancs);

  if (!gyF.vege || gyF.ok !== VEG_OK.FELADAS) {
    console.log('\n  ⛔ A FELADÁS NEM ZÁRTA LE A MECCSET (vége=' + gyF.vege + ', ok=' + gyF.ok + ').');
    console.log('     A `feladas` parancsfajta ága ki sem futott, vagy nem hatott.');
    bukas++;
  } else if (gyF.gyoztes !== 1) {
    console.log('\n  ⛔ A 0. CSAPAT ADTA FEL, DE NEM AZ 1. NYERT (győztes=' + gyF.gyoztes + ').');
    bukas++;
  }
  // A MÁSODIK feladás a vég UTÁN érkezik: EL KELL halnia.
  //
  // ⚠️ ÉS AZ `elutasitottParancs`-OT NÉZZÜK, NEM A `feladasElutasitva`-T — ezt a
  // gát maga derítette ki, első futásra. A `parancsok.js` egy ÁLTALÁNOS kapuval
  // kezd: ha a meccsnek vége, minden parancsot eldob, és a `felad()` ágig el sem
  // jut. A `feladasElutasitva` tehát a FUTÓ meccs alatti érvénytelen vagy
  // ismételt feladást számolja (rossz csapatszám, kétszeri feladás) — a vég
  // utánit sosem. Aki azt a számot kéri számon itt, egy örökre nullán álló
  // számlálóra épít gátat.
  if (gyF.vege && gyF.elutasitottParancs === 0) {
    console.log('\n  ⛔ A VÉG UTÁNI PARANCSOT SENKI NEM UTASÍTOTTA EL.');
    console.log('     A kör szándékosan ad be egy második feladást; ha az átmegy, a');
    console.log('     győztes átbillen, és két gép két különböző meccset lát.');
    bukas++;
  }

  if (bukas === vegeBukas) {
    console.log('\n  ✓ A meccs mindkét okból véget ér, a vég utáni parancsok elhalnak,');
    console.log('    és egy lejátszott meccs mentése bitre ugyanazt az állapotot adja.');
  }
}
sor('lefutott', ((Date.now() - t14) / 1000).toFixed(1) + ' mp');
vegeBukas = bukas - vegeBukas;

// ════════════════════════════════════════════════════════════════════════════
// 15) v0.18 — KÉPZÉSI SOR TÖRLÉSE ÉS KORSZAK-GÁT AZ ÉPÍTÉSNÉL
// ════════════════════════════════════════════════════════════════════════════
//
// KÉT ÚJ ÁG, és mindkettő olyan, amit a determinizmus önmagában NEM igazol:
//
//   A) A SOR-TÖRLÉS EGYETLEN VESZÉLYE A NYERSANYAG-TEREMTÉS. A `kepzes.js`
//      fejléce a v0.5 óta ezért nem adott törlést: az ár a SORBAÁLLÁSKOR megy
//      le, tehát bármilyen visszatérítés egy `keszlet += …` ágat nyitna a
//      képzésben, és a v0.3 óta a gazdaság szigorúan egyirányú. A döntés az
//      lett, hogy a törlés INGYENES, de NEM AD VISSZA SEMMIT — és ezt itt
//      MÉRJÜK is: rendelés–törlés körökben a készlet csak csökkenhet.
//   B) A KORSZAK-GÁT KÉTFÉLEKÉPPEN LEHET HALOTT: ha sosem tilt, és ha MINDIG
//      tilt. A kör ezért mindkét irányt bizonyítja — a sötét korban elutasít,
//      a korszak megemelése után ugyanaz a parancs átmegy.
//
// ⚠️ A GÁT EBBEN A KÖRBEN BE VAN KAPCSOLVA, A JÁTÉKBAN NEM. Az indoklás és a
// mért számok az `epuletek.js` `EP_KORSZAK` tábláját megelőző blokkban állnak:
// élesen ma a gépi ellenfelet szüntetné meg, mert az egyetlen korszakot sem
// vált. A kód viszont KÉSZ, tehát a kapun BELÜL a helye.
cim('15) v0.18 SOR-TÖRLÉS ÉS KORSZAK-GÁT — a két új parancs-ág');
const t15 = Date.now();
let ujBukas = bukas;

const ketV18 = ketFutas(FORGATOKONYVEK.v18);
sor('forgatókönyv', FORGATOKONYVEK.v18.nev);
sor('korszak-gát a körben', 'BEKAPCSOLVA', 'igény: ' + EP_KORSZAK_IGENY.join(','));
sor('korszak-gát a játékban', EP_KORSZAK.some((x) => x > 0) ? 'BEKAPCSOLVA' : 'kikapcsolva',
  'élő tábla: ' + EP_KORSZAK.join(','));
let kevertV18 = { ok: true, tick: 0 };
if (ketV18.ok) {
  sor('két futás', 'AZONOS', (FORGATOKONYVEK.v18.tickek / HASH_KOZ) + ' ellenőrzőpont');
  sor('záró hash', '0x' + ketV18.hashek.get(FORGATOKONYVEK.v18.tickek).toString(16).padStart(8, '0'));
  kevertV18 = kevertFutas(ketV18.hashek, FORGATOKONYVEK.v18);
  sor('kevert futás', kevertV18.ok ? 'AZONOS' : 'ELTÉRT (tick ' + kevertV18.tick + ')');
  if (!kevertV18.ok) bukas++;
} else {
  console.log('\n  ⛔ A v0.18 KÖR SZÉTCSÚSZOTT a ' + ketV18.tick + '. ticken.');
  console.log('     ELSŐNEK NÉZD MEG a `Kepzes.torol()` sor-léptetését: ha a `hatra`');
  console.log('     csak az egyik gépen indul újra, a következő egység MÁS ticken');
  console.log('     születik meg, és onnantól minden slot-kiosztás elcsúszik.');
  bukas++;
}

// ── MŰKÖDÉS-VIZSGÁLAT ─────────────────────────────────────────────────────
{
  const { KORSZAK } = await import(pathToFileURL(join(SIM_DIR, 'gazdasag.js')).href);
  const { TIPUS } = await import(pathToFileURL(join(SIM_DIR, 'units.js')).href);

  // — 1. A FORGATÓKÖNYV SZÁMAI — ugyanannyi tick, mint a determinizmus-kör.
  const fk = FORGATOKONYVEK.v18;
  const s = new Sim({ seed: SEED, n: 256, maxEgyseg: 2000 });
  fk.felallit(s, fk.egysegSzam);
  let kor = 0;
  for (let t = 1; t <= fk.tickek; t++) {
    if ((t % PARANCS_KOZ) === 0) { fk.fut(s, kor); kor++; }
    s.lep();
  }
  const torolve = s.kepzes.torolve[0] + s.kepzes.torolve[1];
  const torlesEl = s.kepzes.torlesElutasitva[0] + s.kepzes.torlesElutasitva[1];
  const korszakEl = s.epuletek.korszakElutasitva[0] + s.epuletek.korszakElutasitva[1];
  const keszult = s.kepzes.keszult[0] + s.kepzes.keszult[1];
  console.log('');
  sor('törölt sor-elem', s.kepzes.torolve[0] + ' / ' + s.kepzes.torolve[1],
    'csapatonként, ' + fk.tickek + ' tick alatt');
  sor('elutasított törlés', s.kepzes.torlesElutasitva[0] + ' / ' + s.kepzes.torlesElutasitva[1],
    '(idegen sor vagy tartományon kívüli index)');
  sor('korszak miatt elutasított épít', s.epuletek.korszakElutasitva[0] + ' / '
    + s.epuletek.korszakElutasitva[1], 'a gát BEKAPCSOLVA fut ebben a körben');
  sor('kiképzett egység', s.kepzes.keszult[0] + ' / ' + s.kepzes.keszult[1],
    'a törlés MELLETT — a sor eleje végig dolgozott');
  // A GÁT A FORGATÓKÖNYVBEN IS KINYÍLIK. A piac és a torony HAJNAL kora előtt
  // tiltott; ha a kör végén áll belőlük, akkor a korszakváltás tényleg
  // feloldotta őket — nem csak a 4. pont mesterséges korszak-emelésétől.
  let kapunyilt = 0;
  for (let i = 0; i < s.epuletek.db; i++) {
    if (s.epuletek.elo[i] === 0) continue;
    if (s.epuletek.tipus[i] === EPULET.PIAC || s.epuletek.tipus[i] === EPULET.TORONY) kapunyilt++;
  }
  sor('elért korszak', s.gazdasag.korszak[0] + ' / ' + s.gazdasag.korszak[1],
    'álló épület: ' + s.epuletek.db + ' · ebből korszakhoz kötött: ' + kapunyilt);
  if (s.gazdasag.korszak[0] === 0 && s.gazdasag.korszak[1] === 0) {
    console.log('\n  ⛔ EGYIK CSAPAT SEM VÁLTOTT KORSZAKOT: a gát VÉGIG tiltott.');
    console.log('     Egy mindig igaz gát ugyanolyan halott, mint egy sosem igaz.');
    console.log('     A kör nyitó készlete (`felallit`) pont azért van, hogy a váltás');
    console.log('     beleférjen — ha ez nulla, a `korszak` parancs vagy a `KORSZAK_AR`');
    console.log('     mozdult el.');
    bukas++;
  } else if (kapunyilt === 0) {
    console.log('\n  ⛔ A KORSZAKVÁLTÁS UTÁN SEM ÉPÜLT KORSZAKHOZ KÖTÖTT ÉPÜLET.');
    console.log('     A csapat elérte a hajnal korát, a piac és a torony mégsem áll:');
    console.log('     a gát a korszak emelése után is tilt, vagy a `korszakKell()`');
    console.log('     mást olvas, mint amit az `epit` összehasonlít.');
    bukas++;
  }

  if (torolve === 0) {
    console.log('\n  ⛔ EGYETLEN SOR-ELEM SEM TÖRLŐDÖTT: a `kepzes_torles` ág NÉMA.');
    console.log('     A determinizmus-kapu ettől zöld — egy soha le nem futó törlés is');
    console.log('     bitre reprodukálható. Nézd meg, épül-e képző épület, áll-e valaki');
    console.log('     sorban (`Kepzes.sorDb`), és hogy a `parancsok.js` ismeri-e a fajtát:');
    console.log('     az ISMERETLEN `fajta` CSENDBEN elvész, hibaüzenet nélkül.');
    bukas++;
  }
  if (torlesEl === 0) {
    console.log('\n  ⛔ EGYETLEN ÉRVÉNYTELEN TÖRLÉS SEM LETT ELUTASÍTVA.');
    console.log('     A kör szándékosan töröl az ELLENFÉL sorából és tartományon kívüli');
    console.log('     indexszel. Ha ezek átmennek, egy kattintással üríthető a másik');
    console.log('     játékos képzési sora — és két gép két különböző meccset lát.');
    bukas++;
  }
  if (korszakEl === 0) {
    console.log('\n  ⛔ A KORSZAK-GÁT EGYETLEN ÉPÍTÉST SEM UTASÍTOTT EL, PEDIG BE VAN KAPCSOLVA.');
    console.log('     A v0.5 építési sora piacot és tornyot rendel a SÖTÉT KORBAN, tehát');
    console.log('     a gátnak muszáj elsülnie. Nézd meg a `parancsok.js` `epit` ágát és');
    console.log('     az `Epuletek.korszakKell()`-t.');
    bukas++;
  }
  if (keszult === 0) {
    console.log('\n  ⛔ NEM SZÜLETETT EGYSÉG, MIKÖZBEN A TÖRLÉS FUTOTT.');
    console.log('     A törlés-ág megette a képzés-ágat: ha minden sor kiürül, a kör');
    console.log('     zölden bizonyít egy halott képzést. A kör csak KÉT elemtől töröl,');
    console.log('     tehát ha ez nulla, a sor sosem nőtt kettőre — az a képzés baja.');
    bukas++;
  }

  // — 2. A TÖRLÉS NEM TEREMT NYERSANYAGOT —
  //
  // EZ A LEGFONTOSABB GÁT EBBEN A KÖRBEN. A `kepzes.js` fejléce a v0.5 óta
  // ezért nem adott törlést; ha valaki egyszer „kényelmi okból" visszatérítést
  // ír bele, itt bukik, nem fél évvel később egy balansz-vitában.
  const s2 = new Sim({ seed: SEED, n: 128, maxEgyseg: 200 });
  s2.szondaFelallas(8, { munkasMinden: 1 });
  for (let f = 0; f < 4; f++) s2.gazdasag.keszlet[f] = 5000;
  let kozp = -1;
  for (let i = 0; i < s2.epuletek.db; i++) {
    if (s2.epuletek.csapat[i] === 0 && s2.epuletek.tipus[i] === EPULET.KOZPONT) { kozp = i; break; }
  }
  const lepj = () => { for (let i = 0; i <= 3; i++) s2.lep(); };
  const kezdo = s2.gazdasag.keszlet[0];
  let novekedes = 0, csucs = kezdo;
  for (let k = 0; k < 40; k++) {
    s2.parancs({ fajta: 'kepzes', csapat: 0, epulet: kozp, egyseg: TIPUS.MUNKAS });
    lepj();
    const db = s2.kepzes.sorDb[kozp];
    const elotte = s2.gazdasag.keszlet[0];
    if (db > 0) {
      s2.parancs({ fajta: 'kepzes_torles', csapat: 0, epulet: kozp, index: db - 1 });
      lepj();
    }
    const utana = s2.gazdasag.keszlet[0];
    if (utana > elotte) novekedes++;
    if (utana > csucs) csucs = utana;
  }
  sor('40 rendelés–törlés kör', kezdo + '→' + s2.gazdasag.keszlet[0],
    'étel · növekedés: ' + novekedes + ' · csúcs: ' + csucs);
  if (novekedes > 0 || csucs > kezdo) {
    console.log('\n  ⛔ A TÖRLÉS NYERSANYAGOT TEREMTETT: ' + novekedes + ' körben nőtt a készlet.');
    console.log('     A gazdaság a v0.3 óta EGYIRÁNYÚ, és a rendelés–törlés kör így');
    console.log('     végtelen nyersanyag-forrás. Ha visszatérítés kell, a KIFIZETETT');
    console.log('     árat kell eltenni sor-elemenként — újraszámolni tilos.');
    bukas++;
  }
  if (s2.kepzes.torolve[0] === 0) {
    console.log('\n  ⛔ A 40 KÖRBŐL EGY TÖRLÉS SEM MENT ÁT — a fenti gát vak.');
    bukas++;
  }

  // — 3. A TÖRLÉS FELSZABADÍTJA A NÉPESSÉGET —
  // Ez a funkció EGYETLEN valódi haszna (visszatérítés nincs): a sorban álló
  // egység foglalja a férőhelyet. Ha ez nem szabadul fel, a gomb dísz.
  const sorbanElotte = s2.kepzes.sorbanNepesseg(0);
  for (let k = 0; k < 3; k++) {
    s2.parancs({ fajta: 'kepzes', csapat: 0, epulet: kozp, egyseg: TIPUS.MUNKAS });
  }
  lepj();
  const sorbanTele = s2.kepzes.sorbanNepesseg(0);
  while (s2.kepzes.sorDb[kozp] > 0) {
    s2.parancs({ fajta: 'kepzes_torles', csapat: 0, epulet: kozp, index: 0 });
    lepj();
  }
  const sorbanUtana = s2.kepzes.sorbanNepesseg(0);
  sor('sorban álló népesség', sorbanElotte + ' → ' + sorbanTele + ' → ' + sorbanUtana,
    'rendelés, majd a sor kiürítése');
  if (sorbanTele <= sorbanElotte || sorbanUtana !== 0) {
    console.log('\n  ⛔ A TÖRLÉS NEM ADJA VISSZA A NÉPESSÉG-HELYET (' + sorbanTele
      + ' → ' + sorbanUtana + ').');
    console.log('     Visszatérítés nincs, tehát a férőhely és a sor-hely a funkció');
    console.log('     EGYETLEN haszna. Ha az sem szabadul fel, a ✕ gomb dísz.');
    bukas++;
  }
  if (s2.kepzes.hatra[kozp] !== 0) {
    console.log('\n  ⛔ ÜRES SOR MELLETT IS FUT A VISSZASZÁMLÁLÓ (hatra='
      + s2.kepzes.hatra[kozp] + ').');
    console.log('     A következő sorbaállás így azonnal késznek látszó egységet adna.');
    bukas++;
  }

  // — 4. A KORSZAK-GÁT MINDKÉT IRÁNYBAN ELSÜL —
  // Egy gát, ami mindig igaz, ugyanolyan halott, mint az, ami sosem az. Ezért
  // UGYANAZT a parancsot adjuk be kétszer, csak a korszakot emeljük közben.
  const s3 = new Sim({ seed: SEED, n: 128, maxEgyseg: 200 });
  s3.szondaFelallas(8, { munkasMinden: 1 });
  s3.epuletek.korszakGat(EP_KORSZAK_IGENY);
  for (let f = 0; f < 4; f++) s3.gazdasag.keszlet[f] = 5000;
  /**
   * Az első szabad hely egy típusnak. ⚠️ MIÉRT KERESSÜK, ÉS MIÉRT NEM FIX
   * PONTRA ÉPÍTÜNK: ha a hely véletlenül járhatatlan, a parancs a `lerakhato`
   * miatt esne el, és a gát „elsütöttnek" látszana anélkül, hogy egyszer is
   * lefutott volna. A cella-számítás betűre a `parancsok.js` `epit` ágáé.
   */
  const szabadHely = (tipus) => {
    const meret = EP_MERET[tipus];
    for (let y = 5; y < s3.n - 6; y++) {
      for (let x = 5; x < s3.n - 6; x++) {
        if (s3.epuletek.lerakhato(tipus, x - (meret >> 1), y - (meret >> 1))) {
          return { x: x + 0.5, y: y + 0.5 };
        }
      }
    }
    return null;
  };
  const epitProba = (tipus) => {
    const h = szabadHely(tipus);
    if (!h) return false;
    const db = s3.epuletek.db;
    s3.parancs({ fajta: 'epit', csapat: 0, tipus, x: h.x, y: h.y });
    for (let i = 0; i <= 3; i++) s3.lep();
    return s3.epuletek.db > db;
  };
  const sotetPiac = epitProba(EPULET.PIAC);
  const sotetHaz = epitProba(EPULET.HAZ);
  s3.gazdasag.korszak[0] = KORSZAK.HAJNAL;
  const hajnalPiac = epitProba(EPULET.PIAC);
  const hajnalOstrom = epitProba(EPULET.OSTROMMUHELY);
  s3.gazdasag.korszak[0] = KORSZAK.KRISTALY;
  const kristalyOstrom = epitProba(EPULET.OSTROMMUHELY);
  sor('piac sötét / hajnal korban', (sotetPiac ? 'FELÉPÜLT' : 'tiltva') + ' / '
    + (hajnalPiac ? 'felépült' : 'TILTVA'), 'ugyanaz a parancs, más korszak');
  sor('ostromműhely hajnal/kristály', (hajnalOstrom ? 'FELÉPÜLT' : 'tiltva') + ' / '
    + (kristalyOstrom ? 'felépült' : 'TILTVA'), 'két korszakot kér');
  sor('ház sötét korban', sotetHaz ? 'felépült' : 'TILTVA', 'nincs korszak-igénye');
  if (sotetPiac || !hajnalPiac || hajnalOstrom || !kristalyOstrom || !sotetHaz) {
    console.log('\n  ⛔ A KORSZAK-GÁT NEM MINDKÉT IRÁNYBAN SÜL EL.');
    console.log('     Az elvárás: sötét korban tiltja a piacot, hajnalban engedi;');
    console.log('     az ostromműhelyt hajnalban még tiltja, kristály korban engedi;');
    console.log('     a házat pedig SOHA nem tiltja (nincs korszak-igénye). Ha valamelyik');
    console.log('     nem így van, a tábla vagy az `epit` összehasonlítása csúszott el.');
    bukas++;
  }

  // — 5. A GÁT NEM VONJA LE AZ ÁRAT —
  // Az `epit` ágban a korszak-ellenőrzés a `gazdasag.levon()` ELŐTT áll. Ha
  // valaha mögé kerülne, a tiltott épület árát is elvennénk, és a játékos
  // fizetne azért, amit meg sem kapott — némán.
  const s4 = new Sim({ seed: SEED, n: 128, maxEgyseg: 200 });
  s4.szondaFelallas(8, { munkasMinden: 1 });
  s4.epuletek.korszakGat(EP_KORSZAK_IGENY);
  for (let f = 0; f < 4; f++) s4.gazdasag.keszlet[f] = 5000;
  const elotteFa = s4.gazdasag.keszlet[1];
  for (let k = 0; k < 5; k++) {
    s4.parancs({ fajta: 'epit', csapat: 0, tipus: EPULET.PIAC, x: 40.5 + k * 4, y: 40.5 });
    for (let i = 0; i <= 3; i++) s4.lep();
  }
  sor('tiltott építés ára', elotteFa + '→' + s4.gazdasag.keszlet[1],
    'fa · elutasítva: ' + s4.epuletek.korszakElutasitva[0]);
  if (s4.gazdasag.keszlet[1] !== elotteFa) {
    console.log('\n  ⛔ A KORSZAK MIATT ELUTASÍTOTT ÉPÍTÉS ÁRA MÉGIS LEMENT.');
    console.log('     A korszak-ellenőrzésnek a `gazdasag.levon()` ELŐTT a helye:');
    console.log('     a játékos különben fizet azért, amit meg sem kapott — némán.');
    bukas++;
  }

  if (bukas === ujBukas) {
    console.log('\n  ✓ A sor-törlés determinisztikus, nem teremt nyersanyagot, viszont');
    console.log('    felszabadítja a népesség- és a sor-helyet; a korszak-gát pedig');
    console.log('    mindkét irányban elsül, és nem vonja le a tiltott épület árát.');
  }
}
sor('lefutott', ((Date.now() - t15) / 1000).toFixed(1) + ' mp');
ujBukas = bukas - ujBukas;

cim('ÍTÉLET');
sor('1) statikus', statOk ? 'RENDBEN' : 'BUKOTT');
sor('2) két futás', ket.ok ? 'RENDBEN' : 'BUKOTT (tick ' + ket.tick + ')');
sor('3) kevert futás', ket.ok ? (kevert.ok ? 'RENDBEN' : 'BUKOTT (tick ' + kevert.tick + ')') : 'kihagyva');
sor('4) tick-költség', k.msPerTick.toFixed(3) + ' ms/tick', '(mérés, nem kapu)');
sor('   parancs-tüske', k.parancsMs.toFixed(0) + ' ms', '(útkeresés regresszió-őre, nem kapu)');
sor('5) v0.2 parancs-felület',
  ketV02.ok ? (kevertV02.ok ? 'RENDBEN' : 'BUKOTT (kevert, tick ' + kevertV02.tick + ')')
    : 'BUKOTT (tick ' + ketV02.tick + ')');
sor('6) v0.3 gazdaság',
  ketV03.ok ? (kevertV03.ok ? 'RENDBEN' : 'BUKOTT (kevert, tick ' + kevertV03.tick + ')')
    : 'BUKOTT (tick ' + ketV03.tick + ')');
sor('7) v0.4 harc',
  ketV04.ok ? (kevertV04.ok ? 'RENDBEN' : 'BUKOTT (kevert, tick ' + kevertV04.tick + ')')
    : 'BUKOTT (tick ' + ketV04.tick + ')');
sor('8) v0.5 építkezés+tech',
  ketV05.ok ? (kevertV05.ok ? 'RENDBEN' : 'BUKOTT (kevert, tick ' + kevertV05.tick + ')')
    : 'BUKOTT (tick ' + ketV05.tick + ')');
sor('9) v0.6 AI + v0.7 köd',
  ketV06.ok ? (kevertV06.ok ? 'RENDBEN' : 'BUKOTT (kevert, tick ' + kevertV06.tick + ')')
    : 'BUKOTT (tick ' + ketV06.tick + ')');
sor('10) v0.7 mentés/betöltés', mentesBukas === 0 ? 'RENDBEN' : 'BUKOTT');
sor('11) v0.8 lockstep', lockstepBukas === 0 ? 'RENDBEN' : 'BUKOTT');
sor('12) v0.9 civ + egyedi egység', civBukas === 0 ? 'RENDBEN' : 'BUKOTT');
sor('13) v0.10 térkép-presetek', terkepBukas === 0 ? 'RENDBEN' : 'BUKOTT');
sor('14) v0.17 a meccs vége',
  ketV17.ok && ketV17f.ok
    ? (kevertV17.ok && kevertV17f.ok
      ? (vegeBukas === 0 ? 'RENDBEN' : 'BUKOTT (működés)')
      : 'BUKOTT (kevert)')
    : 'BUKOTT (tick ' + (ketV17.ok ? ketV17f.tick : ketV17.tick) + ')');
sor('15) v0.18 törlés + korszak-gát',
  ketV18.ok
    ? (kevertV18.ok ? (ujBukas === 0 ? 'RENDBEN' : 'BUKOTT (működés)') : 'BUKOTT (kevert)')
    : 'BUKOTT (tick ' + ketV18.tick + ')');
console.log('\n  ' + (bukas === 0
  ? '✅ A SZIMULÁCIÓ DETERMINISZTIKUS — a lockstep alapja áll.'
  : '❌ ' + bukas + ' vizsgálat BUKOTT — a lockstep NEM építhető rá.'));
console.log('');
process.exit(bukas === 0 ? 0 : 1);
