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
// ── NÉGY VIZSGÁLAT ────────────────────────────────────────────────────────
//   1. STATIKUS  — tiltott hívások keresése a `src/sim/` forrásában
//   2. FUTÁSI    — két friss `Sim`, azonos seed, 10 000 tick, hash-egyezés
//   3. KEVERT    — ugyanaz, de a tickek közé IDEGEN munkát ékelünk
//   4. KÖLTSÉG   — a sim tiszta tick-ideje 1600 egységnél (ms/tick)
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
// ⏱️ A teljes kör ~25 mp. TÖRTÉNETI JEGYZET, mert tanulság: az első futásnál
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
};

/** Friss sim, felállítva. A `Sim` konstruktora MINDENT újraépít (rács, mező). */
function ujSim() {
  const s = new Sim({ seed: SEED, n: 256, maxEgyseg: 2000 });
  const db = s.szondaFelallas(EGYSEG);
  return { sim: s, db };
}

/**
 * Két friss sim lockstepben. Az ELSŐ eltérésnél megáll, és a PONTOS ticket
 * adja vissza — ez az, amit egy desync-jelentésnél tudni kell.
 * @returns {{ok:boolean, tick:number, a:number, b:number, hashek:Map<number,number>}}
 */
function ketFutas(fk) {
  const A = ujSim(), B = ujSim();
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
  const { sim } = ujSim();
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
console.log('\n  ' + (bukas === 0
  ? '✅ A SZIMULÁCIÓ DETERMINISZTIKUS — a lockstep alapja áll.'
  : '❌ ' + bukas + ' vizsgálat BUKOTT — a lockstep NEM építhető rá.'));
console.log('');
process.exit(bukas === 0 ? 0 : 1);
