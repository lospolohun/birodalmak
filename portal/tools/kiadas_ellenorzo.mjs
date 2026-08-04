// PORTAL HUB TYCOON — KIADÁS-ELLENŐRZŐ.
//
// ── MIÉRT KELL EGY KÜLÖN KAPU A KIADÁSHOZ ─────────────────────────────────
// A többi szonda azt méri, hogy a játék MŰKÖDIK-e. Ez azt, hogy KIADHATÓ-e.
// A kettő nem ugyanaz, és a különbség pont azokból a hibákból áll, amiket
// működés közben soha nem vesz észre az ember:
//
//   • ottfelejtett `console.log`, `debugger`, `TODO`,
//   • verziószám, ami három helyen három különbözőt mond,
//   • `npm run` parancs, ami nem létező fájlra mutat,
//   • külső hivatkozás (betűtípus, CDN), amitől a `dist/` nem másolható,
//   • dokumentáció, ami egy régi verzióról beszél.
//
// Az AGE OF THE CRYSTALS-nál a kiadás-ellenőrző HÁROM valódi hibát fogott meg
// a lezárás előtt. Ez a fajta ellenőrzés azért éri meg, mert a fenti hibák
// mind olyanok, amiket a játékos vesz észre először, nem a fejlesztő.
//
// ⚠️ EZ NEM HELYETTESÍTI A TÖBBI SZONDÁT. A determinizmus, a mértan, a hang és
// a böngésző-szonda külön kapu; ez az utolsó átfésülés a kiadás előtt.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const GYOKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = join(GYOKER, '..');

let hiba = 0, figyelem = 0;
const cim = (s) => console.log(`\n\x1b[1m${s}\x1b[0m`);
const ok = (s) => console.log(`  \x1b[32m✓\x1b[0m ${s}`);
const rossz = (s) => { console.log(`  \x1b[31m✗ ${s}\x1b[0m`); hiba++; };
const sarga = (s) => { console.log(`  \x1b[33m!\x1b[0m ${s}`); figyelem++; };
const info = (s) => console.log(`    ${s}`);

function fajlok(dir, kiterjesztes = ['.js', '.mjs', '.css']) {
  const ki = [];
  if (!existsSync(dir)) return ki;
  for (const n of readdirSync(dir).sort()) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) ki.push(...fajlok(p, kiterjesztes));
    else if (kiterjesztes.some((k) => n.endsWith(k))) ki.push(p);
  }
  return ki;
}

const forrasok = fajlok(join(GYOKER, 'src'));

// ══════════════════════════════════════════════════════════════════════════
cim('1. VERZIÓ — egy igazság, nem három');
const config = readFileSync(join(GYOKER, 'src/mag/config.js'), 'utf8');
const verzioEgyezes = config.match(/export const VERZIO = '([^']+)'/);
const VERZIO = verzioEgyezes ? verzioEgyezes[1] : null;
{
  if (!VERZIO) rossz('nincs VERZIO a config.js-ben');
  else {
    ok(`config.js → VERZIO = ${VERZIO}`);
    // A README és a terv NE mondjon konkrét, elavuló verziószámot — a
    // projekt szabálya az, hogy a config az igazság. Azt viszont ellenőrizzük,
    // hogy legalább hivatkoznak rá.
    const terv = readFileSync(join(GYOKER, 'PORTAL_TERV.md'), 'utf8');
    if (terv.includes('config.js') && terv.includes('VERZIO')) ok('a PORTAL_TERV.md a configra mutat, nem másol számot');
    else rossz('a PORTAL_TERV.md nem mondja meg, hol az igazi verziószám');
  }
}

// ══════════════════════════════════════════════════════════════════════════
cim('2. OTTFELEJTETT NYOMOK');
{
  const minta = [
    { re: /\bdebugger\b/, mit: 'debugger utasítás', sulyos: true },
    { re: /\bTODO\b|\bFIXME\b|\bXXX\b/, mit: 'TODO/FIXME jelölés', sulyos: false },
    { re: /console\.(log|debug|warn)\s*\(/, mit: 'console kiírás', sulyos: false },
    { re: /\balert\s*\(/, mit: 'alert()', sulyos: true },
  ];
  let talalat = 0;
  for (const f of forrasok) {
    const rovid = relative(GYOKER, f);
    const sorok = readFileSync(f, 'utf8').split('\n');
    for (let i = 0; i < sorok.length; i++) {
      const sor = sorok[i];
      if (sor.trim().startsWith('//') || sor.trim().startsWith('*')) continue;
      for (const m of minta) {
        if (!m.re.test(sor)) continue;
        // A `fo.js` egyetlen indulási kiírása szándékos: a seed a
        // hibajelentés legfontosabb adata, és a konzolból másolható.
        if (rovid === 'src/fo.js' && sor.includes('PORTAL HUB TYCOON')) continue;
        talalat++;
        if (m.sulyos) rossz(`${rovid}:${i + 1} — ${m.mit}`);
        else sarga(`${rovid}:${i + 1} — ${m.mit}`);
      }
    }
  }
  if (talalat === 0) ok(`${forrasok.length} forrásfájl tiszta`);
}

// ══════════════════════════════════════════════════════════════════════════
cim('3. KÜLSŐ HIVATKOZÁS — a dist/ bárhová másolható marad?');
{
  const tiltott = [
    // ⚠️ A `www.w3.org` NEM külső hivatkozás: az SVG XML-névtere, ami soha
    // nem tölt le semmit. Az első változat emiatt pirosra váltott a saját,
    // adat-URI-ba ágyazott ikonunkra — vagyis pont arra, amit azért csináltunk
    // ilyenre, hogy NE legyen külső fájl. Egy hamis riasztás pont annyira
    // rombolja a mérőeszköz hitelét, mint egy elmulasztott hiba.
    { re: /https?:\/\/(?!localhost|127\.0\.0\.1|www\.w3\.org)/, mit: 'külső URL' },
    { re: /\bfetch\s*\(/, mit: 'fetch()' },
    { re: /@import\s+url\(/, mit: 'CSS @import' },
    { re: /fonts\.googleapis|cdn\.|unpkg|jsdelivr/, mit: 'CDN-hivatkozás' },
  ];
  let talalat = 0;
  for (const f of [...forrasok, join(GYOKER, 'index.html')]) {
    if (!existsSync(f)) continue;
    const rovid = relative(GYOKER, f);
    const sorok = readFileSync(f, 'utf8').split('\n');
    for (let i = 0; i < sorok.length; i++) {
      const sor = sorok[i];
      if (sor.trim().startsWith('//') || sor.trim().startsWith('*') || sor.trim().startsWith('<!--')) continue;
      for (const t of tiltott) {
        if (t.re.test(sor)) { rossz(`${rovid}:${i + 1} — ${t.mit}`); talalat++; }
      }
    }
  }
  if (talalat === 0) ok('nincs külső hivatkozás a forrásban');
}

// ══════════════════════════════════════════════════════════════════════════
cim('4. NPM-PARANCSOK — létező fájlra mutatnak?');
{
  const pkg = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'));
  const portalScriptek = Object.entries(pkg.scripts).filter(([k]) => k.startsWith('portal:'));
  if (portalScriptek.length === 0) rossz('nincs egyetlen portal: script sem a package.json-ban');
  let rossz2 = 0;
  for (const [nev, parancs] of portalScriptek) {
    const m = parancs.match(/(portal\/[\w./-]+\.mjs)/);
    if (m && !existsSync(join(REPO, m[1]))) { rossz(`npm run ${nev} → nincs ilyen fájl: ${m[1]}`); rossz2++; }
    const c = parancs.match(/--config\s+([\w./-]+)/);
    if (c && !existsSync(join(REPO, c[1]))) { rossz(`npm run ${nev} → nincs ilyen konfig: ${c[1]}`); rossz2++; }
  }
  if (rossz2 === 0) ok(`${portalScriptek.length} portal-script mind létező fájlra mutat`);
}

// ══════════════════════════════════════════════════════════════════════════
cim('5. AZ ALPROJEKT NEM SZIVÁROG');
{
  // A CLAUDE.md szabálya: a két játék diszjunkt fájlkészleten él. Ha a
  // portal/ bármit importál a repó gyökeréből, az a szabály sérülése — és
  // ami rosszabb, a két játék elkezd együtt romlani.
  let talalat = 0;
  for (const f of forrasok) {
    const sz = readFileSync(f, 'utf8');
    const re = /from\s+['"]((?:\.\.\/){3,}[^'"]+)['"]/g;
    let m;
    while ((m = re.exec(sz))) { rossz(`${relative(GYOKER, f)} — kifelé mutató import: ${m[1]}`); talalat++; }
  }
  if (talalat === 0) ok('a portal/ nem importál a repó gyökeréből');
}

// ══════════════════════════════════════════════════════════════════════════
cim('6. DOKUMENTÁCIÓ');
{
  const kell = ['README.md', 'PORTAL_TERV.md', 'qa/V0.1_EREDMENY.md', 'qa/V0.4_EREDMENY.md', 'qa/V1.0_EREDMENY.md', 'qa/EGYENSULY.md'];
  for (const k of kell) {
    if (existsSync(join(GYOKER, k))) ok(k);
    else rossz(`hiányzik: ${k}`);
  }
  const terv = readFileSync(join(GYOKER, 'PORTAL_TERV.md'), 'utf8');
  if (/fps/i.test(terv) && /nincs GPU|SwiftShader/i.test(terv)) {
    ok('a terv kimondja, hogy az FPS-t a felhőben nem lehet mérni');
  } else {
    rossz('a terv nem figyelmeztet az FPS-mérés korlátjára — ez az a hiba, ami hamis biztonságérzetet ad');
  }
}

// ══════════════════════════════════════════════════════════════════════════
cim('7. BUILD-KIMENET');
{
  const dist = join(GYOKER, 'dist');
  if (!existsSync(dist)) {
    sarga('nincs dist/ — futtasd előtte: npm run portal:build');
  } else {
    const eszkozok = fajlok(join(dist, 'assets'), ['.js', '.css']);
    let ossz = 0;
    for (const f of eszkozok) ossz += statSync(f).size;
    info(`${eszkozok.length} fájl, összesen ${(ossz / 1024).toFixed(0)} kB`);
    if (ossz > 3 * 1024 * 1024) rossz(`a build ${(ossz / 1024 / 1024).toFixed(1)} MB — valami fölöslegeset is becsomagoltunk`);
    else ok('a build mérete rendben');
    const html = readFileSync(join(dist, 'index.html'), 'utf8');
    if (html.includes('./assets/')) ok('a dist/index.html RELATÍV útvonalakat használ (alkönyvtárba is másolható)');
    else rossz('a dist/index.html nem relatív útvonalakat használ');
  }
}

// ══════════════════════════════════════════════════════════════════════════
console.log('');
if (hiba === 0) {
  console.log(`\x1b[42m\x1b[30m  KIADHATÓ  \x1b[0m${figyelem ? `  (${figyelem} figyelmeztetés)` : ''}\n`);
  process.exit(0);
}
console.log(`\x1b[41m\x1b[37m  ${hiba} HIBA  \x1b[0m${figyelem ? `  (${figyelem} figyelmeztetés)` : ''}\n`);
process.exit(1);
