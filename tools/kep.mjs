// AGE OF THE CRYSTALS — képernyőkép a v0.1 motor-szondáról.
//
// Nem mérőeszköz: a szemnek szól. A `fps_szonda.mjs` ugyanezt a lapot méri,
// itt csak megvárjuk a boot végét, beállítunk egy kamerát, és lefényképezzük.
// Használat: node tools/kep.mjs [--egyseg=1600] [--ki=qa/v0.1.png]

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { chromeOpt } from './bongeszo.mjs';

const erv = (nev, alap) => {
  const a = process.argv.find((x) => x.startsWith('--' + nev + '='));
  return a ? a.split('=')[1] : alap;
};
const EGYSEG = Number(erv('egyseg', 1600));
const KI = erv('ki', 'qa/v0.1.png');
const PORT = Number(erv('port', 5311));

// ⚠️ ELŐBB BUILD. A `vite preview` a `dist/`-et szolgálja ki, NEM a forrást.
// Build nélkül a kép a legutóbbi build állapotát mutatja, és csendben hazudik:
// egyszer már készült így két bitre azonos kép egy megváltozott terepről.
await new Promise((kesz, hiba) => {
  const b = spawn('npx', ['vite', 'build'], { stdio: 'inherit' });
  b.on('exit', (k) => (k === 0 ? kesz() : hiba(new Error('a build bukott: ' + k))));
});

const szerver = spawn('npx', ['vite', 'preview', '--port', String(PORT)], {
  stdio: 'ignore', detached: false,
});
const takarit = () => { try { szerver.kill('SIGTERM'); } catch (e) { /* már halott */ } };
process.on('exit', takarit);

// A `vite preview` `localhost`-ra köt, ami macOS-en ::1 is lehet — ezért
// névvel várjuk, ne 127.0.0.1-gyel (ezen a szonda már egyszer elhasalt).
const cim = 'http://localhost:' + PORT + '/';
// ⚠️ A KÉP A `?szonda=1` CÍMRŐL KÉSZÜL. A v0.11 óta a játék főmenüvel indul, és
// a világ csak az „Indítás" gombra épül fel — a kép különben a kezdőképernyőt
// mutatná, a `waitForFunction(keszen)` pedig 60 mp után elszállna. A megkerülő
// út a menü nélkül, azonnal a v0.1 óta fényképezett világot építi fel.
const jatekCim = cim + '?szonda=1';
let bongeszo;
try {
  for (let i = 0; i < 60; i++) {
    try { const v = await fetch(cim); if (v.ok) break; } catch (e) { /* még nem áll */ }
    await new Promise((r) => setTimeout(r, 500));
  }

  bongeszo = await chromium.launch({ ...chromeOpt(), args: ['--use-gl=angle'] });
  const lap = await bongeszo.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
  await lap.goto(jatekCim, { waitUntil: 'load' });
  await lap.waitForFunction(() => window.__aoc && window.__aoc.keszen === true, { timeout: 60000 });

  await lap.evaluate((n) => window.__aoc.egysegSzam(n), EGYSEG);
  // Hagyjuk a seregeket elindulni, hogy ne a kezdő kupacot fényképezzük.
  await lap.waitForTimeout(6000);
  await lap.screenshot({ path: KI });
  console.log('kép: ' + KI + '  (' + EGYSEG + ' egység)');
} finally {
  if (bongeszo) await bongeszo.close();
  takarit();
}
