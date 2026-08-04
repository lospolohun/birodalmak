// PORTAL HUB TYCOON — DETERMINIZMUS-SZONDA.
//
// ── MIÉRT VAN EZ AZ ESZKÖZ ────────────────────────────────────────────────
// Ez a projekt legfontosabb kapuja, és az egyetlen, ami a felhőben is
// teljes értékű (tiszta node, nem kell GPU). Hat vizsgálatot futtat:
//
//   1. STATIKUS — tiltott hívások a sim alatt (Math.random, Math.sin, …)
//   2. ISMÉTELHETŐSÉG — ugyanaz a seed kétszer: bitre ugyanaz az állapot
//   3. ÉRZÉKENYSÉG — más seed: MÁS állapot (a mérőeszköz nem konstans)
//   4. SEBESSÉG — ms/tick terhelés alatt
//   5. VISSZAJÁTSZÁS — a parancsnaplóból újrajátszva ugyanaz jön ki
//   6. MŰKÖDÉS — csinál-e egyáltalán valamit a gazdaság
//
// ⚠️ A 6. VIZSGÁLAT NEM DÍSZ. A determinizmus-kapu nem működés-kapu: a
// semmittevés is tökéletesen reprodukálható. Az AoC-nál a v0.3 mind a hat
// vizsgálaton átment, miközben 400 munkásból 285 beragadt. Itt is előfordult:
// egy korábbi változatban az állomás TARTÓS áramszünetben ült, minden épület
// 40 %-on ment, a hírnév spirálba került — és a determinizmus közben hibátlan
// volt. Ha új alrendszert írsz, kérdezd meg: mi az a szám, ami elárulja, hogy
// tényleg CSINÁL is valamit?
//
// ⚠️ HA BUKIK, NE A SZONDÁT ÍRD ÁT.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Sim } from '../src/sim/sim.js';
import { v01Uj } from './forgatokonyv.mjs';

const GYOKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const TICKEK = Number(process.env.PHT_TICK || 24000);
const MINTA = 1000;

let hiba = 0;
const cim = (s) => console.log(`\n\x1b[1m${s}\x1b[0m`);
const ok = (s) => console.log(`  \x1b[32m✓\x1b[0m ${s}`);
const rossz = (s) => { console.log(`  \x1b[31m✗ ${s}\x1b[0m`); hiba++; };
const info = (s) => console.log(`    ${s}`);

// ══════════════════════════════════════════════════════════════════════════
//  1. STATIKUS ELLENŐRZÉS
// ══════════════════════════════════════════════════════════════════════════

const TILTOTT = [
  { re: /\bMath\.random\b/, mit: 'Math.random (helyette: mag/rng.js)' },
  { re: /\bMath\.(sin|cos|tan|asin|acos|atan2?|exp|log2?|pow|hypot|cbrt)\b/, mit: 'transzcendens Math-függvény (helyette: mag/fx.js)' },
  { re: /\bDate\.now\b/, mit: 'Date.now (a sim csak tick-számot ismer)' },
  { re: /\bperformance\.now\b/, mit: 'performance.now' },
  { re: /\bnew Date\b/, mit: 'new Date' },
  { re: /from\s+['"]three['"]/, mit: 'three import (a sim nem tud a képernyőről)' },
  { re: /\b(document|window)\./, mit: 'DOM-hozzáférés' },
  { re: /\bfor\s*\(\s*(?:const|let|var)\s+\w+\s+in\s+/, mit: 'for…in (sorrendfüggő bejárás)' },
  { re: /\bObject\.keys\s*\(/, mit: 'Object.keys (sorrendfüggő bejárás)' },
];

function fajlok(dir) {
  const ki = [];
  for (const n of readdirSync(dir).sort()) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) ki.push(...fajlok(p));
    else if (n.endsWith('.js')) ki.push(p);
  }
  return ki;
}

cim('1. STATIKUS — tiltott hívások a szimulációban');
{
  const cel = [...fajlok(join(GYOKER, 'src/sim')), ...fajlok(join(GYOKER, 'src/mag'))];
  let talalat = 0;
  for (const f of cel) {
    const rovid = relative(GYOKER, f);
    // A `mag/fx.js` MAGA a helyettesítés: ott a `Math.sqrt`/`Math.floor`
    // szabad, és a fejlécében fel is sorolja a tiltottakat — a kommentben
    // szereplő nevekre nem szabad ráugrani.
    const forras = readFileSync(f, 'utf8')
      .split('\n')
      .map((sor) => (sor.trim().startsWith('//') || sor.trim().startsWith('*') || sor.trim().startsWith('/*') ? '' : sor));
    for (let i = 0; i < forras.length; i++) {
      for (const t of TILTOTT) {
        if (t.re.test(forras[i])) { rossz(`${rovid}:${i + 1} — ${t.mit}`); talalat++; }
      }
    }
  }
  if (talalat === 0) ok(`${cel.length} fájl tiszta`);
}

// ══════════════════════════════════════════════════════════════════════════
//  SEGÉD: egy teljes futás
// ══════════════════════════════════════════════════════════════════════════

function futas(seed, tickek = TICKEK, gyujtNaplot = false) {
  const sim = new Sim({ seed });
  const fk = v01Uj();
  const minta = [];
  for (let t = 0; t < tickek; t++) {
    fk(sim, t);
    sim.lep();
    if (sim.tick % MINTA === 0) minta.push(sim.ellenorzoOsszeg());
  }
  // ⚠️ A ZÁRÓ ÖSSZEGET ITT KELL ELTENNI, nem később. A 4. vizsgálat tovább
  // lépteti ezt a simet, tehát a `sim.ellenorzoOsszeg()` később MÁST ad — az
  // első változatban emiatt bukott a visszajátszás, holott az volt a helyes.
  return { sim, minta, zaro: sim.ellenorzoOsszeg(), napló: gyujtNaplot ? sim.napló.slice() : null };
}

// ══════════════════════════════════════════════════════════════════════════
//  2. ISMÉTELHETŐSÉG
// ══════════════════════════════════════════════════════════════════════════

cim('2. ISMÉTELHETŐSÉG — ugyanaz a seed kétszer');
const A = futas(31337, TICKEK, true);
const B = futas(31337);
{
  let elso = -1;
  for (let i = 0; i < A.minta.length; i++) {
    if (A.minta[i] !== B.minta[i]) { elso = i; break; }
  }
  if (elso < 0) ok(`${TICKEK} tick, ${A.minta.length} mintavétel — minden összeg egyezik`);
  else rossz(`szétcsúszás a ${elso * MINTA}. ticknél: ${A.minta[elso]} ≠ ${B.minta[elso]}`);
  info(`záró összeg: ${A.zaro}`);
}

// ══════════════════════════════════════════════════════════════════════════
//  3. ÉRZÉKENYSÉG
// ══════════════════════════════════════════════════════════════════════════

cim('3. ÉRZÉKENYSÉG — más seed, más világ');
{
  const C = futas(90210, 6000);
  const D = futas(31337, 6000);
  if (C.zaro !== D.zaro) ok('a két seed külön világot ad');
  else rossz('KÉT KÜLÖNBÖZŐ SEED UGYANAZT ADTA — az összeg nem méri a világot');
}

// ══════════════════════════════════════════════════════════════════════════
//  4. SEBESSÉG
// ══════════════════════════════════════════════════════════════════════════

cim('4. SEBESSÉG — ms/tick terhelés alatt');
{
  const sim = A.sim;
  const fk = v01Uj();
  const t0 = process.hrtime.bigint();
  const N = 2000;
  for (let t = 0; t < N; t++) { fk(sim, TICKEK + t); sim.lep(); }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / N;
  ok(`${ms.toFixed(3)} ms/tick — ${sim.utasSzam} utas, ${sim.epuletek.filter(Boolean).length} épület`);
  info('⚠️ EZ A SZÁM KÉT FUTÁS KÖZÖTT NEM ÖSSZEHASONLÍTHATÓ: a felhő-gép');
  info('   osztott CPU-n fut. A/B-t egy munkameneten belül mérj (git stash).');
  if (ms > 8) rossz(`${ms.toFixed(2)} ms/tick — 20 Hz-en ez a képkocka-idő 16 %-a fölött van`);
}

// ══════════════════════════════════════════════════════════════════════════
//  5. VISSZAJÁTSZÁS — a mentés valójában a parancsnapló
// ══════════════════════════════════════════════════════════════════════════

cim('5. VISSZAJÁTSZÁS — seed + parancsnapló = ugyanaz a világ');
{
  const naplo = A.napló;
  const sim = new Sim({ seed: 31337 });
  let n = 0;
  for (let t = 0; t < TICKEK; t++) {
    while (n < naplo.length && naplo[n].tick === t) { sim.parancs(naplo[n].p); n++; }
    sim.lep();
  }
  if (sim.ellenorzoOsszeg() === A.zaro) {
    ok(`${naplo.length} parancs visszajátszva — azonos végállapot`);
  } else {
    rossz(`a visszajátszás mást adott: ${sim.ellenorzoOsszeg()} ≠ ${A.zaro}`);
  }
}

// ══════════════════════════════════════════════════════════════════════════
//  6. MŰKÖDÉS — csinál-e egyáltalán valamit
// ══════════════════════════════════════════════════════════════════════════

cim('6. MŰKÖDÉS — a zöld determinizmus nem elég');
{
  const s = A.sim;
  const k = s.kivonat();
  info(`nap ${k.nap} · pénz ${k.penz} · hírnév ${k.hirnev} · utas ${k.utas} (csúcs ${k.csucs})`);
  info(`távozó ${k.tavozo} (elégedett ${k.elegedett}, dühös ${k.duhos}) · kapu ${k.nyitottKapu} · fejezet ${k.fejezet}`);

  const varosok = [
    ['érkeztek utasok', k.tavozo > 100],
    ['az utasok többsége elégedetten távozott', k.elegedett > k.duhos],
    ['a szolgáltatások kiszolgáltak', s.epuletek.some((e) => e && e.kiszolgalt > 50)],
    ['a gazdaság termelt bevételt', s.epuletek.some((e) => e && e.bevetel > 500)],
    ['több kapu nyílt meg', k.nyitottKapu >= 2],
    ['a történet haladt', k.fejezet >= 2],
    ['futott kutatás', s.keszTechek.size >= 2],
    ['történtek események', s.naplok.some((n) => n.szoveg.startsWith('ESEMÉNY'))],
    ['nem ült tartós áramszünetben', !s.aramszunet],
    ['nem ment csődbe', s.jatekVege !== 'csod'],
  ];
  for (const [nev, all] of varosok) {
    if (all) ok(nev); else rossz(`NEM teljesült: ${nev}`);
  }

  // Beragadás-ellenőrzés: hány utas nem mozdult az utolsó 200 tickben.
  const elozo = s.utasok.filter((u) => u.aktiv).map((u) => ({ u, x: u.x, y: u.y, a: u.allapot }));
  const fk = v01Uj();
  for (let t = 0; t < 200; t++) { fk(s, TICKEK + 2000 + t); s.lep(); }
  let beragadt = 0;
  for (const e of elozo) {
    if (!e.u.aktiv) continue;
    if (e.u.allapot === 4 || e.u.allapot === 3) continue; // kiszolgálás/sor: állnia KELL
    const d = Math.abs(e.u.x - e.x) + Math.abs(e.u.y - e.y);
    if (d < 0.05) beragadt++;
  }
  const mozgo = elozo.filter((e) => e.u.aktiv && e.u.allapot !== 4 && e.u.allapot !== 3).length;
  if (mozgo === 0) rossz('senki nem volt úton — nincs mit mérni a beragadáson');
  else if (beragadt / mozgo > 0.15) rossz(`a mozgásban lévők ${Math.round(beragadt / mozgo * 100)} %-a beragadt (${beragadt}/${mozgo})`);
  else ok(`beragadás: ${beragadt}/${mozgo} mozgásban lévő utas (${Math.round(beragadt / mozgo * 100)} %)`);
}

// ══════════════════════════════════════════════════════════════════════════

console.log('');
if (hiba === 0) {
  console.log('\x1b[42m\x1b[30m  MIND A HAT VIZSGÁLAT ZÖLD  \x1b[0m\n');
  process.exit(0);
} else {
  console.log(`\x1b[41m\x1b[37m  ${hiba} HIBA  \x1b[0m\n`);
  process.exit(1);
}
