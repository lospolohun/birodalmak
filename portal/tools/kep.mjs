// PORTAL HUB TYCOON — KÉPERNYŐKÉP EGY FELÉPÍTETT ÁLLOMÁSRÓL.
//
// A böngésző-szonda azt méri, hogy MŰKÖDIK-e a játék. Ez azt mutatja meg,
// hogy MILYEN — egy üres kezdőpályáról készült képből semmit nem lehet
// eldönteni a látványról. Ugyanazt a forgatókönyvet játssza le, amit a
// determinizmus-szonda, majd fényképez.
//
// ⚠️ FPS-t ez sem mér: a felhőben SwiftShader fut. A kép viszont a
// geometriáról és a színekről gépfüggetlenül árulkodik.
//
// MIÉRT A FEJLESZTŐI KISZOLGÁLÓ ÉS NEM A `preview`: a forgatókönyvet a lapon
// BELÜL futtatjuk (`import('/tools/forgatokonyv.mjs')`), hogy pontosan az a
// kód építse az állomást, amit a szonda is használ. A `dist/` bundle-ben ez a
// modul nincs benne — a `vite dev` viszont a gyökér alól bármit kiszolgál.

import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const GYOKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 5275;
const TICK = Number(process.argv[2] || 9000);
const KIMENET = process.argv[3] || join(GYOKER, 'qa/allomas.png');

function chromeUtvonal() {
  if (process.env.AOC_CHROME) return process.env.AOC_CHROME;
  const alap = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!existsSync(alap)) return undefined;
  for (const j of readdirSync(alap).filter((n) => n.startsWith('chromium-')).sort().reverse()) {
    const p = join(alap, j, 'chrome-linux', 'chrome');
    if (existsSync(p)) return p;
  }
  return undefined;
}

const kiszolgalo = spawn('npx', ['vite', '--config', join(GYOKER, 'vite.config.js'), '--port', String(PORT), '--strictPort'], {
  cwd: join(GYOKER, '..'), stdio: 'ignore',
});
const varj = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  await varj(3000);
  const b = await chromium.launch({
    executablePath: chromeUtvonal(),
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
  });
  const lap = await b.newPage({ viewport: { width: 1600, height: 950 } });
  lap.on('pageerror', (e) => console.log('HIBA:', e.message));
  await lap.goto(`http://localhost:${PORT}/?seed=4242`, { waitUntil: 'networkidle' });
  await varj(1800);
  await lap.click('#modal .valasz').catch(() => {});
  await varj(300);

  const jelentes = await lap.evaluate(async (tick) => {
    const m = await import('/tools/forgatokonyv.mjs');
    const sim = window.PHT.sim;
    const fk = m.v01Uj();
    for (let t = sim.tick; t < tick; t++) { fk(sim, t); sim.lep(); }
    return sim.kivonat();
  }, TICK);
  console.log(jelentes);

  await varj(1400);
  await lap.evaluate(() => {
    const sz = window.PHT.szinter;
    sz.tav = 46; sz.dolt = 0.74; sz.szog = 0.95;
    sz.cel.set(window.PHT.sim.kezdoX + 12, 0, window.PHT.sim.kezdoY + 9);
    sz._kamerat();
  });
  await varj(1200);
  await lap.screenshot({ path: KIMENET });
  console.log('kép:', KIMENET);
  await b.close();
} finally { kiszolgalo.kill(); }
