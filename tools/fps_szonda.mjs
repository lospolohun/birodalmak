// AGE OF THE CRYSTALS — FPS- ÉS RÉTEG-SZONDA (a v0.1 kiadási kapuja).
//
// ── MIÉRT VAN ─────────────────────────────────────────────────────────────
// A v0.1 egyetlen kérdésre válaszol: elbír-e a motor 1600 egységet 60 FPS-en?
// De a puszta „igen/nem" kevés. Ha nem bírja, tudni kell, MI viszi el az időt,
// mert a rossz helyen optimalizálás hetekbe kerül. Ezért ez a szonda nemcsak
// mér, hanem BONT: minden egységszámon lefut egyszer mindennel, majd a
// rétegeket EGYESÉVEL kikapcsolva — a különbség az adott réteg költsége.
//
// Ez a szonda LÉNYEGE: külön kell látni, mennyi megy a DÍSZLETRE (terep, props,
// víz) és mennyi a FIGURÁKRA. A TELEPESEK-nél a „ultrán 25-30 FPS" szám hónapokig
// állt anélkül, hogy bárki tudta volna, a fű vagy az egységek viszik-e el —
// és kiderült, hogy nyolc agent futott közben a gépen, tehát a szám hamis volt.
//
// ── MÉRÉSI HIGIÉNIA ───────────────────────────────────────────────────────
//   · KIADÁSI build (`vite build` + `vite preview`), nem a dev-szerver: a dev
//     modul-grafikonja és a HMR mást mér, mint amit a játékos kap.
//   · VALÓDI GPU: a rendszer-Chrome ANGLE/Metal alatt (lásd `bongeszo.mjs`).
//     A fejetlen SwiftShader szoftveres — azon mért FPS semmit nem jelent.
//   · VSYNC KI (`GPU_ARGS`): különben minden mérés 16,7 ms lenne, és a kapu
//     magától teljesülne.
//   · A `preview` gyerekfolyamatot a végén MINDIG leállítjuk — hibánál és
//     Ctrl+C-nél is. Egy ottfelejtett szerver a következő futást megfogja.
//
// ── ÍTÉLET ───────────────────────────────────────────────────────────────
//   GO          — 1600 egységnél p95 képkocka-idő ≤ 16,7 ms (60 FPS tartva)
//   FELTÉTELES  — ≤ 25 ms (40 FPS; játszható, de a v0.2 tartalma nem fér bele)
//   NO-GO       — fölötte
// Az ítélet mellé mindig odaírjuk, MELYIK réteg a szűk keresztmetszet.
//
// HASZNÁLAT:  node tools/fps_szonda.mjs   ·   npm run fps
//   --port=N --mp=N --ablacio=N --szel=N --mag=N --dpr=N --fejetlen=1
// Kilépési kód: 0 = GO vagy FELTÉTELES · 1 = NO-GO · 2 = a szonda nem tudott mérni.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { chromeOpt, chromeLeiras, GPU_ARGS } from './bongeszo.mjs';

const GYOKER = dirname(dirname(fileURLToPath(import.meta.url)));

const erv = (nev, alap) => {
  const a = process.argv.find((x) => x.startsWith('--' + nev + '='));
  return a === undefined ? alap : Number(a.split('=')[1]);
};
const PORT = erv('port', 5273);
const MERES_MP = erv('mp', 6);       // a fő mérés hossza — a szerződés szerint 6
const ABLACIO_MP = erv('ablacio', 3); // a réteg-bontás mérései rövidebbek
const SZEL = erv('szel', 1600);
const MAG = erv('mag', 900);
const DPR = erv('dpr', 1);
// ⚠️ `localhost` és NEM `127.0.0.1`. A `vite preview` alapból a `localhost`
// névre köt, ami a modern node/macOS párosban ELŐSZÖR `::1` (IPv6) — a
// 127.0.0.1-re küldött kérés ilyenkor `ECONNREFUSED`-dal hal meg, és a szonda
// „a szerver nem válaszolt" hibával áll le egy TÖKÉLETESEN futó szerver mellett.
// (Pontosan ez történt az első éles próbán.)
// A név NEM `URL`: az leárnyékolná a globális `URL` konstruktort.
const CIM = 'http://localhost:' + PORT + '/';

/** A bontandó rétegek. Az 'ui' szándékosan kimarad: nem a képkocka tétele. */
const RETEGEK = ['terep', 'props', 'egysegek', 'viz'];

const { SZONDA_LEPCSOK, VERZIO, CEL_EGYSEG } = await import(
  new URL('../src/core/config.js', import.meta.url).href);

// ════════════════════════════════════════════════════════════════════════════
// SEGÉDLETEK
// ════════════════════════════════════════════════════════════════════════════

/**
 * A vite indítója. A helyi `node_modules/.bin/vite`-ot részesítjük előnyben az
 * `npx`-szel szemben: az `npx` KÖZBEIKTAT egy folyamatot, és a `kill()` csak őt
 * érné el — a valódi szerver ottmaradna a porton, a következő futás pedig
 * `--strictPort` miatt azonnal bukna. Ha nincs helyi bináris, marad az npx
 * (akkor a folyamatcsoportot lőjük ki, lásd `takarit`).
 */
const VITE = existsSync(join(GYOKER, 'node_modules', '.bin', 'vite'))
  ? { p: join(GYOKER, 'node_modules', '.bin', 'vite'), elo: [] }
  : { p: 'npx', elo: ['vite'] };

function fut(parancs, argok, opciok = {}) {
  return new Promise((kesz, hiba) => {
    const p = spawn(parancs, argok, { cwd: GYOKER, stdio: 'inherit', ...opciok });
    p.on('error', hiba);
    p.on('exit', (kod) => (kod === 0 ? kesz() : hiba(new Error(
      parancs + ' ' + argok.join(' ') + ' → kilépési kód ' + kod))));
  });
}

/**
 * Vár, amíg a `preview` válaszol. NEM fix `sleep`: a `vite preview` indulási
 * ideje gépenként és hidegcache-nél nagyságrendekkel eltér, egy fix várakozás
 * vagy pazarol, vagy néha korán fut bele — mindkettő megbízhatatlan mérőpad.
 */
async function varSzerverre(url, elhalt, maxMp = 60) {
  const hatarido = Date.now() + maxMp * 1000;
  let utolsoHiba = '';
  while (Date.now() < hatarido) {
    // Ha a szerver már KILÉPETT (pl. foglalt port), értelmetlen tovább várni:
    // azonnal szóljunk, ne egy percig tegyünk úgy, mintha még indulna.
    if (elhalt()) throw new Error('a preview szerver azonnal kilépett');
    try {
      const v = await fetch(url, { method: 'GET' });
      if (v.ok) { await v.text(); return true; }
      utolsoHiba = 'HTTP ' + v.status;
    } catch (e) { utolsoHiba = e.message; }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('a preview szerver nem válaszolt ' + maxMp + ' mp alatt (' + utolsoHiba + ')');
}

/** N képkocka lefutásának megvárása a lapon — a mérés előtti bemelegítéshez. */
async function bemelegit(lap, kepkockak = 90, maxMp = 30) {
  await lap.evaluate(([db, ms]) => new Promise((kesz) => {
    let n = 0;
    const hatarido = performance.now() + ms;
    const l = () => {
      if (++n >= db || performance.now() > hatarido) return kesz(n);
      requestAnimationFrame(l);
    };
    requestAnimationFrame(l);
  }), [kepkockak, maxMp * 1000]);
}

const sz = (v, h) => String(v).padStart(h);
const b = (v, h) => String(v).padEnd(h);
const kerek = (v, t = 2) => (typeof v === 'number' && isFinite(v) ? +v.toFixed(t) : null);

// ════════════════════════════════════════════════════════════════════════════
// FUTÁS
// ════════════════════════════════════════════════════════════════════════════

console.log('AGE OF THE CRYSTALS — FPS- és réteg-szonda · v' + VERZIO);
console.log('lépcsők: ' + SZONDA_LEPCSOK.join(' / ') + ' egység · ablak ' + SZEL + '×' + MAG
  + ' · dpr ' + DPR + ' · fő mérés ' + MERES_MP + ' mp · réteg-bontás ' + ABLACIO_MP + ' mp\n');

let szerver = null;
let bongeszo = null;
let kilepesKod = 2;

/**
 * A takarítás IDEMPOTENS: hibaágon és jelre is lefuthat, kétszer is.
 * A FOLYAMATCSOPORTOT lőjük ki (`-pid`), nem csak a gyereket: `npx` esetén a
 * tényleges vite egy unokafolyamat, és ha az életben marad, a port foglalt
 * marad — a következő futás `--strictPort`-tal azonnal elszáll.
 */
function takarit() {
  if (szerver && !szerver.killed) {
    try { process.kill(-szerver.pid, 'SIGTERM'); } catch (e) {
      try { szerver.kill('SIGTERM'); } catch (e2) {}
    }
  }
  szerver = null;
}
process.on('SIGINT', () => { takarit(); process.exit(130); });
process.on('SIGTERM', () => { takarit(); process.exit(143); });
process.on('exit', takarit);

try {
  // ── 1. KIADÁSI BUILD ────────────────────────────────────────────────────
  console.log('── build ──────────────────────────────────────────────────────────────');
  await fut(VITE.p, [...VITE.elo, 'build']);

  // ── 2. PREVIEW SZERVER ──────────────────────────────────────────────────
  console.log('\n── preview szerver (' + CIM + ') ───────────────────────────────────');
  szerver = spawn(VITE.p, [...VITE.elo, 'preview', '--port', String(PORT), '--strictPort'],
    { cwd: GYOKER, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  let szerverNaplo = '';
  szerver.stdout.on('data', (d) => { szerverNaplo += d; });
  szerver.stderr.on('data', (d) => { szerverNaplo += d; });
  let szerverElhalt = false;
  szerver.on('exit', () => { szerverElhalt = true; });
  try {
    await varSzerverre(CIM, () => szerverElhalt);
  } catch (e) {
    // A szerver SAJÁT naplója mondja meg az okot (tipikusan „Port … is already
    // in use"). Enélkül csak annyit látnánk, hogy „nem válaszolt", és a
    // következő fél óra a rossz helyen keresgéléssel telne.
    console.error('\n[preview] a szerver naplója:\n' + (szerverNaplo.trim() || '(üres)'));
    if (/already in use/i.test(szerverNaplo)) {
      console.error('\n  A ' + PORT + '-as port FOGLALT — tipikusan egy `npm run dev` fut rajta.');
      console.error('  Állítsd le, vagy mérj másik porton:  npm run fps -- --port=5299');
    }
    throw e;
  }
  console.log('  válaszol.');

  // ── 3. BÖNGÉSZŐ ─────────────────────────────────────────────────────────
  // ⚠️ FEJES (headless: false) AZ ALAPÉRTELMEZÉS, és ez nem kényelmi kérdés.
  // Fejetlenül a Chrome könnyen SwiftShaderre (szoftveres raszterizáló) esik
  // vissza, és akkor nem a JÁTÉKOT mérnénk, hanem a CPU-t — a TELEPESEK-nél
  // pontosan ez tett használhatatlanná egy egész mérés-sorozatot. Valódi
  // ablakban valódi GPU-t kapunk. `--fejetlen=1`-gyel felülírható, de a mért
  // GPU-nevet MINDIG kiírjuk, hogy utólag is ellenőrizhető legyen.
  const opt = chromeOpt();
  bongeszo = await chromium.launch({
    ...opt, headless: erv('fejetlen', 0) === 1, args: GPU_ARGS,
  });
  console.log('  böngésző: ' + chromeLeiras());
  const lap = await bongeszo.newPage({
    viewport: { width: SZEL, height: MAG }, deviceScaleFactor: DPR,
  });
  const konzolHibak = [];
  lap.on('console', (m) => { if (m.type() === 'error') konzolHibak.push(m.text()); });
  lap.on('pageerror', (e) => konzolHibak.push('pageerror: ' + e.message));

  await lap.goto(CIM, { waitUntil: 'domcontentloaded' });

  // A szerződés (INTERFACES.md): a `src/main.js` állítja be a horgot.
  try {
    await lap.waitForFunction(() => window.__aoc && window.__aoc.keszen === true,
      null, { timeout: 60000 });
  } catch (e) {
    console.error('\n⛔ A `window.__aoc.keszen` 60 mp alatt nem lett igaz.');
    console.error('   A szonda CSAK ezt a horgot használja (lásd INTERFACES.md).');
    console.error('   Ellenőrizd, hogy a `src/main.js` beállítja-e, és nézd meg a lap hibáit:');
    for (const h of konzolHibak.slice(0, 12)) console.error('     · ' + h);
    if (!konzolHibak.length) console.error('     (a lap nem adott hibát — lehet, hogy a boot még fut)');
    // NEM `process.exit()`: az kihagyná a `finally`-t, és ottfelejtene egy
    // Chrome-ot meg egy preview szervert a porton.
    throw new Error('a `window.__aoc` horog nem állt fel');
  }

  const gpu = await lap.evaluate(() => {
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      const d = gl.getExtension('WEBGL_debug_renderer_info');
      return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'ismeretlen';
    } catch (e) { return 'nem olvasható'; }
  });
  const verzio = await lap.evaluate(() => window.__aoc.verzio);
  console.log('  GPU: ' + gpu);
  // A SwiftShader/„Software" jelző MINDENT érvénytelenít, ami utána jön:
  // szoftveres raszterizálón a képkocka-idő a CPU-ról szól, nem a játékról.
  const szoftveres = /swiftshader|software|llvmpipe/i.test(String(gpu));
  if (szoftveres) {
    console.error('\n⛔ SZOFTVERES RASZTERIZÁLÓ (' + gpu + ') — a mérés ÉRVÉNYTELEN volna.');
    console.error('   Indítsd fejes módban (ez az alap), és állítsd be a rendszer-Chrome-ot:');
    console.error('     export AOC_CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"');
    throw new Error('szoftveres raszterizáló: ' + gpu);
  }
  console.log('  __aoc.verzio: ' + verzio + (verzio === VERZIO ? '' : '  ⚠️ eltér a config.js-től!'));

  // ── 4. MÉRÉS LÉPCSŐNKÉNT ────────────────────────────────────────────────
  const eredmenyek = [];
  for (const n of SZONDA_LEPCSOK) {
    console.log('\n── ' + n + ' egység ────────────────────────────────────────────────────');
    // Minden réteg vissza, MIELŐTT újra felállunk — különben az előző lépcső
    // kikapcsolt rétege csendben átszivárogna a következőbe.
    for (const r of RETEGEK) await lap.evaluate((x) => window.__aoc.reteg(x, true), r);
    const tenyleges = await lap.evaluate((x) => window.__aoc.egysegSzam(x), n);
    // ⚠️ HOSSZÚ bemelegítés: az újrafelállás a simet is újraindítja, és az
    //    első menetparancs 1600 egységnél ~4 mp CPU-t visz el (áramlási mezők).
    //    Rövid bemelegítéssel ezt a tüskét MÉRNÉNK BELE a képkocka-időbe.
    await bemelegit(lap, 150, 30);

    const fo = await lap.evaluate((mp) => window.__aoc.meres(mp), MERES_MP);
    console.log('  minden réteg:  ' + kerek(fo.fps, 1) + ' FPS · átlag '
      + kerek(fo.atlagMs) + ' ms · p95 ' + kerek(fo.p95Ms) + ' ms');

    // ── RÉTEG-BONTÁS ──────────────────────────────────────────────────────
    // Külön alapmérés AZONOS hosszal: a fő mérés 6 mp, az ablációk 3 mp — a
    // kettő átlaga összevethető, de az azonos hosszú alap tisztább különbséget ad.
    const alap = await lap.evaluate((mp) => window.__aoc.meres(mp), ABLACIO_MP);
    const bontas = {};
    for (const r of RETEGEK) {
      // A `reteg()` HAMISAT ad, ha nincs ilyen réteg. Ezt meg kell különböztetni
      // a „0 ms költségű rétegtől", különben egy hiányzó vízréteg úgy nézne ki,
      // mintha ingyen volna — és senki nem venné észre, hogy nem is mértük.
      const letezik = await lap.evaluate((x) => window.__aoc.reteg(x, false) !== false, r);
      if (!letezik) {
        bontas[r] = { letezik: false, koltsegMs: 0, szazalek: null };
        console.log('  ' + b(r + ':', 17) + 'nincs ilyen réteg — kihagyva');
        continue;
      }
      await bemelegit(lap, 40, 15);
      const m = await lap.evaluate((mp) => window.__aoc.meres(mp), ABLACIO_MP);
      await lap.evaluate((x) => window.__aoc.reteg(x, true), r);
      bontas[r] = {
        letezik: true,
        nelkuleMs: kerek(m.atlagMs), nelkuleFps: kerek(m.fps, 1),
        koltsegMs: kerek(alap.atlagMs - m.atlagMs, 3),
        haromszog: m.haromszog, rajzhivas: m.rajzhivas,
      };
      console.log('  ' + b(r + ' nélkül:', 17) + kerek(m.fps, 1) + ' FPS · átlag '
        + kerek(m.atlagMs) + ' ms · megspórolt ' + kerek(alap.atlagMs - m.atlagMs, 2) + ' ms');
    }
    for (const r of RETEGEK) {
      if (!bontas[r].letezik) continue;
      bontas[r].szazalek = alap.atlagMs > 0
        ? kerek(100 * bontas[r].koltsegMs / alap.atlagMs, 1) : null;
    }
    // A maradék az, amit egyik réteg kikapcsolása sem vitt el: a közös
    // költség (vászon-törlés, kamera, utófeldolgozás, böngésző-oldali munka).
    const osszKoltseg = RETEGEK.reduce((a, r) => a + (bontas[r].koltsegMs || 0), 0);
    const maradek = kerek(alap.atlagMs - osszKoltseg, 3);

    // ── ZAJKÜSZÖB ─────────────────────────────────────────────────────────
    // Két, UGYANAZON az állapoton végzett mérés (a fő és az abláció-alap)
    // különbsége a mérőpad saját szórása. Minden ennél kisebb réteg-költség
    // ZAJ, nem eredmény. Enélkül egy −0,3 ms-os „megtakarítás" úgy nézne ki,
    // mintha a réteg kikapcsolása LASSÍTANA — és valaki elkezdené magyarázni.
    // …DE ennél van egy erősebb, adatból jövő becslés is: egy réteg költsége
    // FIZIKAILAG nem lehet negatív (kikapcsolni valamit nem lassíthat). Amikor
    // mégis negatívat mérünk, az a szórás — tehát a LEGNAGYOBB negatív érték
    // alsó korlátot ad a mérőpad zajára. A kettő közül a nagyobbat vesszük.
    const nyersZaj = Math.abs(fo.atlagMs - alap.atlagMs);
    const negativCsucs = RETEGEK.reduce((a, r) =>
      (bontas[r].letezik ? Math.max(a, -bontas[r].koltsegMs) : a), 0);
    const zaj = kerek(Math.max(nyersZaj, negativCsucs), 3);
    for (const r of RETEGEK) {
      if (!bontas[r].letezik) continue;
      bontas[r].zajAlatt = Math.abs(bontas[r].koltsegMs) <= zaj;
    }

    eredmenyek.push({
      egyseg: n, tenylegesEgyseg: tenyleges,
      fps: kerek(fo.fps, 1), kepkocka: fo.kepkocka,
      atlagMs: kerek(fo.atlagMs), p95Ms: kerek(fo.p95Ms),
      simMs: kerek(fo.simMs, 3), renderMs: kerek(fo.renderMs, 3),
      haromszog: fo.haromszog, rajzhivas: fo.rajzhivas,
      ablacioAlapMs: kerek(alap.atlagMs), zajMs: zaj, bontas, egyebMs: maradek,
    });
  }

  // ── 5. TÁBLÁZAT ─────────────────────────────────────────────────────────
  console.log('\n\n══ KÉPKOCKA-MÉRÉS ═══════════════════════════════════════════════════════════');
  console.log(b('egység', 8) + sz('FPS', 7) + sz('átlag ms', 10) + sz('p95 ms', 9)
    + sz('sim ms', 9) + sz('render ms', 11) + sz('háromszög', 12) + sz('rajzhívás', 11));
  console.log('─'.repeat(78));
  for (const e of eredmenyek) {
    console.log(b(e.egyseg, 8) + sz(e.fps, 7) + sz(e.atlagMs, 10) + sz(e.p95Ms, 9)
      + sz(e.simMs ?? '—', 9) + sz(e.renderMs ?? '—', 11)
      + sz((e.haromszog ?? 0).toLocaleString('hu-HU'), 12) + sz(e.rajzhivas ?? '—', 11));
  }

  console.log('\n══ RÉTEG-BONTÁS (a réteg kikapcsolásával megspórolt idő) ═══════════════════════════════');
  console.log(b('egység', 8) + RETEGEK.map((r) => sz(r, 17)).join('') + sz('egyéb', 17) + sz('zaj ±', 9));
  console.log('─'.repeat(94));
  for (const e of eredmenyek) {
    const cellak = RETEGEK.map((r) => {
      const x = e.bontas[r];
      if (!x.letezik) return sz('nincs', 17);
      // A `~` jelöli: a szám a mérőpad saját szórásán BELÜL van, tehát nem
      // értelmezhető réteg-költségként.
      return sz((x.zajAlatt ? '~' : '') + kerek(x.koltsegMs) + ' ms (' + x.szazalek + '%)', 17);
    }).join('');
    const egyebSzaz = e.ablacioAlapMs > 0 ? kerek(100 * e.egyebMs / e.ablacioAlapMs, 1) : null;
    console.log(b(e.egyseg, 8) + cellak
      + sz(kerek(e.egyebMs) + ' ms (' + egyebSzaz + '%)', 17) + sz(e.zajMs + ' ms', 9));
  }
  console.log('\n  „egyéb" = amit egyik réteg kikapcsolása sem vitt el: vászon-törlés, kamera,');
  console.log('  utófeldolgozás, böngésző-oldali munka. Ha ez a legnagyobb tétel, a bontás');
  console.log('  nem a rétegekben keresendő.');
  console.log('  „zaj ±" = két azonos állapotú mérés eltérése ugyanazon a lépcsőn. A `~`-mal');
  console.log('  jelölt (és minden negatív) réteg-költség ezen BELÜL van: nem eredmény, zaj.');
  console.log('  Ha sok a `~`, emeld a mérés-hosszt: `--ablacio=6`.');

  // ── 6. ÍTÉLET ───────────────────────────────────────────────────────────
  const cel = eredmenyek.find((e) => e.egyseg === CEL_EGYSEG)
    || eredmenyek[eredmenyek.length - 1];
  let itelet, indok;
  if (cel.p95Ms <= 16.7) { itelet = 'GO'; indok = '60 FPS tartva a cél-egységszámon'; }
  else if (cel.p95Ms <= 25) { itelet = 'FELTÉTELES'; indok = '40+ FPS, de nincs tartalék a v0.2-re'; }
  else { itelet = 'NO-GO'; indok = 'a képkocka-büdzsé jelentősen túllépve'; }

  const rangsor = RETEGEK.filter((r) => cel.bontas[r].letezik)
    .map((r) => [r, cel.bontas[r].koltsegMs || 0])
    .sort((x, y) => y[1] - x[1]);
  if (!rangsor.length) rangsor.push(['(nincs mérhető réteg)', 0]);
  const [szukNev, szukMs] = rangsor[0];
  const szukSzaz = cel.ablacioAlapMs > 0 ? kerek(100 * szukMs / cel.ablacioAlapMs, 1) : null;
  const egyebNagyobb = cel.egyebMs > szukMs;

  console.log('\n══ ÍTÉLET ═══════════════════════════════════════════════════════════════════');
  console.log('  ' + itelet + ' — ' + indok);
  console.log('  ' + cel.egyseg + ' egység: p95 = ' + cel.p95Ms + ' ms (kapu: ≤ 16,7 GO · ≤ 25 FELTÉTELES)'
    + ' · átlag ' + cel.atlagMs + ' ms · ' + cel.fps + ' FPS');
  console.log('  SZŰK KERESZTMETSZET: ' + szukNev + ' — ' + kerek(szukMs) + ' ms ('
    + szukSzaz + '% a képkockából)'
    + (cel.bontas[szukNev] && cel.bontas[szukNev].zajAlatt
      ? '  ⚠️ ZAJSZINT ALATT (±' + cel.zajMs + ' ms) — nincs valódi szűk keresztmetszet' : ''));
  console.log('  sorrend: ' + rangsor.map(([r, ms]) => r + ' ' + kerek(ms) + ' ms').join(' > '));
  if (egyebNagyobb) {
    console.log('  ⚠️ Az „egyéb" (' + cel.egyebMs + ' ms) NAGYOBB, mint bármelyik réteg — a fő');
    console.log('     költség NEM egy rétegben van, hanem a közös képkocka-munkában.');
  }
  if (cel.simMs != null && cel.simMs > cel.renderMs) {
    console.log('  ⚠️ A SIM (' + cel.simMs + ' ms) többe kerül, mint a RENDER (' + cel.renderMs
      + ' ms) — render-optimalizálással itt nem lehet nyerni.');
  }
  if (konzolHibak.length) {
    console.log('\n  ⚠️ ' + konzolHibak.length + ' konzol-hiba a mérés alatt (az első 5):');
    for (const h of konzolHibak.slice(0, 5)) console.log('     · ' + h);
  }

  // ── 7. MENTÉS ───────────────────────────────────────────────────────────
  const kimenet = {
    verzio: VERZIO, aocVerzio: verzio, ido: new Date().toISOString(),
    gep: { platform: process.platform, node: process.version, gpu, bongeszo: chromeLeiras() },
    beallitas: { url: CIM, szelesseg: SZEL, magassag: MAG, dpr: DPR,
      meresMp: MERES_MP, ablacioMp: ABLACIO_MP, retegek: RETEGEK },
    lepcsok: eredmenyek,
    itelet: {
      dontes: itelet, indok, celEgyseg: cel.egyseg, p95Ms: cel.p95Ms,
      atlagMs: cel.atlagMs, fps: cel.fps,
      szukKeresztmetszet: szukNev, szukMs, szukSzazalek: szukSzaz,
      rangsor: rangsor.map(([r, ms]) => ({ reteg: r, ms })),
      egyebMs: cel.egyebMs, egyebNagyobbMintBarmelyReteg: egyebNagyobb,
    },
    konzolHibak,
  };
  const utvonal = join(GYOKER, 'qa', 'v0.1_szonda.json');
  mkdirSync(dirname(utvonal), { recursive: true });
  writeFileSync(utvonal, JSON.stringify(kimenet, null, 2) + '\n', 'utf8');
  console.log('\n  mentve: qa/v0.1_szonda.json');

  kilepesKod = itelet === 'NO-GO' ? 1 : 0;
} catch (e) {
  console.error('\n⛔ A szonda nem tudott mérni: ' + (e && e.message ? e.message : e));
  if (e && e.stack) console.error(e.stack.split('\n').slice(1, 5).join('\n'));
  kilepesKod = 2;
} finally {
  if (bongeszo) { try { await bongeszo.close(); } catch (e) {} }
  takarit();
}
process.exit(kilepesKod);
