// PORTAL HUB TYCOON — KIRAKÁSI CSOMAG.
//
// ── MIÉRT VAN EZ, HA A `dist/` ÚGYIS KÉSZ ─────────────────────────────────
// Mert a kirakás két lépése közül a MÁSODIK a hibalehetőség, és arról a
// build nem tud semmit. A `dist/` létrejötte nem árulja el, hogy
//
//   • a `dist` MAPPÁT másoltad-e a szerverre a TARTALMA helyett
//     (ekkor `/portal/dist/index.html` lesz, és fehér lapot kapsz),
//   • ott van-e minden fájl, amire az `index.html` hivatkozik,
//   • relatívak-e még az útvonalak (egy `base` elállítása némán elrontja),
//   • mekkora, amit feltöltesz, és mennyi lesz tömörítve.
//
// Ez a szkript nem másol sehova — nincs hozzáférése a SkyNethez, és nem is
// kell neki. Azt csinálja, amit egy csomagolónak kell: MEGNÉZI, hogy amit
// átadunk, az önmagában megáll-e, és kiírja a pontos lépést.
//
// ⚠️ EZ NEM HELYETTESÍTI A `kiadas_ellenorzo`-t. Az a forrást vizsgálja
// (ottfelejtett `console.log`, külső hivatkozás, verzió); ez a KIMENETET.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const GYOKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(GYOKER, 'dist');

let hiba = 0;
const ok = (s) => console.log(`  \x1b[32m✓\x1b[0m ${s}`);
const rossz = (s) => { console.log(`  \x1b[31m✗ ${s}\x1b[0m`); hiba++; };
const info = (s) => console.log(`    \x1b[90m${s}\x1b[0m`);

console.log('\n\x1b[1mKIRAKÁSI CSOMAG\x1b[0m');

if (!existsSync(DIST)) {
  rossz('nincs dist/ — előbb: npm run portal:build');
  process.exit(1);
}

// ── 1. MEGVAN-E MINDEN, AMIRE AZ index.html HIVATKOZIK ────────────────────
const html = readFileSync(join(DIST, 'index.html'), 'utf8');
const hivatkozasok = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map((m) => m[1])
  .filter((u) => !u.startsWith('data:'));

let hianyzo = 0;
for (const h of hivatkozasok) {
  if (/^https?:\/\//.test(h)) { rossz(`KÜLSŐ hivatkozás a kimenetben: ${h}`); continue; }
  if (!h.startsWith('./')) { rossz(`NEM relatív útvonal: ${h} — alkönyvtárban 404 lesz`); continue; }
  if (!existsSync(join(DIST, h.slice(2)))) { rossz(`hivatkozott fájl hiányzik: ${h}`); hianyzo++; }
}
if (hianyzo === 0 && hiba === 0) ok(`${hivatkozasok.length} hivatkozás, mind relatív és mind megvan`);

// ── 2. MI KERÜL FEL, ÉS MEKKORA ───────────────────────────────────────────
function bejar(dir) {
  const ki = [];
  for (const n of readdirSync(dir).sort()) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) ki.push(...bejar(p));
    else ki.push(p);
  }
  return ki;
}
const fajlok = bejar(DIST);
let nyers = 0, tomor = 0;
for (const f of fajlok) {
  const b = readFileSync(f);
  nyers += b.length;
  tomor += gzipSync(b).length;
}
const kb = (n) => `${(n / 1024).toFixed(0)} kB`;
ok(`${fajlok.length} fájl · ${kb(nyers)} nyersen · ${kb(tomor)} gzippel`);
for (const f of fajlok) info(`${relative(DIST, f)} — ${kb(statSync(f).size)}`);
if (tomor > 400 * 1024) rossz(`${kb(tomor)} tömörítve sok — nézd meg, mi került bele fölöslegesen`);

// ── 3. NINCS-E OTT VALAMI, AMINEK NEM KELLENE ─────────────────────────────
const gyanus = fajlok.filter((f) => /\.(map|ts|md|json)$/.test(f) && !/manifest/.test(f));
if (gyanus.length) {
  for (const g of gyanus) rossz(`ez ne kerüljön ki: ${relative(DIST, g)}`);
} else {
  ok('nincs forrástérkép és nincs kiszivárgott forrásfájl');
}

// ── 4. A LÉPÉS, AMIT KÉZZEL KELL MEGCSINÁLNI ──────────────────────────────
console.log('');
if (hiba === 0) {
  console.log('\x1b[42m\x1b[30m  A CSOMAG KIRAKHATÓ  \x1b[0m\n');
  console.log('  A \x1b[1mdist/ TARTALMÁT\x1b[0m másold a SkyNet alkönyvtárába (ne a mappát!):\n');
  console.log(`    \x1b[36mportal/dist/index.html\x1b[0m  →  skynet.lospolo.hu/<alkönyvtár>/index.html`);
  console.log(`    \x1b[36mportal/dist/assets/\x1b[0m      →  skynet.lospolo.hu/<alkönyvtár>/assets/\n`);
  console.log('  Részletek és hibakeresés: portal/KIRAKAS.md\n');
  process.exit(0);
}
console.log(`\x1b[41m\x1b[37m  ${hiba} HIBA — ÍGY NE RAKD KI  \x1b[0m\n`);
process.exit(1);
