// AGE OF THE CRYSTALS — KÖZÖS BÖNGÉSZŐ-FELOLDÓ a mérőpadoknak.
//
// ── MIÉRT VAN ─────────────────────────────────────────────────────────────
// A `playwright` csomag a SAJÁT build-számához tartozó Chromiumot keresi
// (pl. `chromium-1234`). Ha az nincs meg, a `chromium.launch()` ezzel bukik:
//
//   browserType.launch: Executable doesn't exist at …/chromium-1234/…
//
// …és ettől az FPS-szonda meg se indul. Ez a modul egy helyen oldja fel:
// megkeresi a tényleg meglévő böngészőt, és visszaad egy `launch()`-ba
// szórható objektumot.
//
// ── EZEN A GÉPEN (macOS 12.7.6, Intel iMac) EZ NEM OPCIONÁLIS ─────────────
// Az `npx playwright install chromium` itt BUKIK:
//
//   Error: Playwright does not support chromium on mac12
//
// A Playwright a macOS 13-tól épített binárisokat szállítja, tehát ezen a
// gépen SOHA nem lesz saját Chromiuma. A megoldás a RENDSZER-CHROME:
//
//   /Applications/Google Chrome.app/Contents/MacOS/Google Chrome
//
// És ez nem kényszer-kompromisszum, hanem ELŐNY: a rendszer-Chrome valódi
// GPU-t kap (ANGLE/Metal), nem a fejetlen shell SwiftShaderjét. Szoftveres
// raszterizálón mért „FPS" semmit nem mondana a játékról — így viszont a
// mérés ÉRVÉNYES, és a képkocka-büdzsé valódi számokra épül.
//
// ── SORREND (az első létező nyer) ─────────────────────────────────────────
//   1. `AOC_CHROME` — e projekt kézi felülírása
//   2. `TP_CHROME`  — ugyanaz a gép, ugyanaz a Chrome (TELEPESEK-örökség),
//                     ezért visszaesünk rá, ne kelljen kétszer beállítani
//   3. a `playwright` saját útvonala, HA tényleg létezik (más gépen ez a normál)
//   4. `PLAYWRIGHT_BROWSERS_PATH` alatti legfrissebb TELJES chromium build
//   5. a rendszerre telepített Chrome / Chromium / Edge ismert helyei
//
// HASZNÁLAT:
//   import { chromeOpt, chromeLeiras } from './bongeszo.mjs';
//   const b = await chromium.launch({ ...chromeOpt(), args: [...] });
//
// Ha SEMMI nincs, `chromeOpt()` DOB — a hibaüzenet tartalmazza a megoldást is,
// mert a néma bukás óráknyi keresést jelentene.

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

/** Ide gyűjtjük, honnan lett a böngésző — a szonda ezt kiírja a fejlécbe. */
let _forras = 'ismeretlen';

/** A `playwright` által várt útvonal — hibát is dobhat, ezért be van kerítve. */
function sajatUt() {
  try { return chromium.executablePath() || ''; } catch (e) { return ''; }
}

/**
 * A `PLAYWRIGHT_BROWSERS_PATH` alatt a legfrissebb TELJES chromium build.
 * A `chromium_headless_shell-*` mappákat SZÁNDÉKOSAN kihagyjuk: a headless
 * shell nem tud rendes WebGL-t, tehát FPS-mérésre alkalmatlan.
 * @returns {string} abszolút útvonal vagy üres
 */
function telepitettUt() {
  const gyoker = process.env.PLAYWRIGHT_BROWSERS_PATH
    || join(process.env.HOME || '', 'Library/Caches/ms-playwright');
  if (!gyoker || !existsSync(gyoker)) return '';
  let jelolt = '';
  let legjobb = -1;
  let nevek = [];
  try { nevek = readdirSync(gyoker); } catch (e) { return ''; }
  for (const nev of nevek) {
    const m = /^chromium-(\d+)$/.exec(nev);   // a headless_shell nem illeszkedik
    if (!m) continue;
    const szam = Number(m[1]);
    if (szam <= legjobb) continue;
    for (const alut of [
      'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
      'chrome-linux/chrome', 'chrome-linux64/chrome', 'chrome-win/chrome.exe',
    ]) {
      const p = join(gyoker, nev, alut);
      if (existsSync(p)) { jelolt = p; legjobb = szam; break; }
    }
  }
  return jelolt;
}

/** A rendszerre telepített böngészők ismert helyei — ez a gép valódi útja. */
const RENDSZER_UTAK = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
];

function rendszerUt() {
  for (const p of RENDSZER_UTAK) if (existsSync(p)) return p;
  return '';
}

/**
 * A `chromium.launch()`-ba szórható beállítás.
 * @returns {{executablePath?: string}} üres = a playwright sajátja jó
 * @throws {Error} ha semmilyen böngésző nincs — a megoldással együtt
 */
export function chromeOpt() {
  const aoc = process.env.AOC_CHROME;
  if (aoc && existsSync(aoc)) { _forras = 'AOC_CHROME=' + aoc; return { executablePath: aoc }; }
  // Ugyanaz a gép, ugyanaz a Chrome: ha a TELEPESEK-hez már be van állítva,
  // ne kelljen újra. (Ha be van állítva, de NEM létezik, továbbmegyünk.)
  const tp = process.env.TP_CHROME;
  if (tp && existsSync(tp)) { _forras = 'TP_CHROME=' + tp; return { executablePath: tp }; }

  const sajat = sajatUt();
  if (sajat && existsSync(sajat)) { _forras = 'playwright saját: ' + sajat; return {}; }

  const telepitett = telepitettUt();
  if (telepitett) {
    _forras = 'letöltött chromium: ' + telepitett;
    console.warn('[bongeszo] a playwright böngészője hiányzik (' + (sajat || '—')
      + '), helyette: ' + telepitett);
    return { executablePath: telepitett };
  }

  const rendszer = rendszerUt();
  if (rendszer) {
    _forras = 'rendszer-böngésző: ' + rendszer;
    console.warn('[bongeszo] rendszer-böngésző használata (valódi GPU): ' + rendszer);
    return { executablePath: rendszer };
  }

  throw new Error(
    'Nem találok böngészőt az FPS-méréshez.\n'
    + '\n'
    + 'EZEN A GÉPEN (macOS 12, Intel iMac) az `npx playwright install chromium`\n'
    + 'MINDIG bukik: „Playwright does not support chromium on mac12". Ez nem\n'
    + 'javítható telepítéssel — a Playwright macOS 13+ binárisokat szállít.\n'
    + '\n'
    + 'MEGOLDÁS — a rendszer-Chrome (ez ráadásul VALÓDI GPU-t ad, nem\n'
    + 'SwiftShadert, tehát az FPS-mérés így érvényes):\n'
    + '\n'
    + '  export AOC_CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"\n'
    + '  npm run fps\n'
    + '\n'
    + 'Ha nincs Chrome telepítve: https://www.google.com/chrome/\n'
    + '(A `TP_CHROME` is jó — ugyanezt a gépet a TELEPESEK is így méri.)'
  );
}

/** Honnan lett a böngésző — CSAK a `chromeOpt()` hívása UTÁN értelmes. */
export function chromeLeiras() { return _forras; }

/**
 * A valódi GPU-hoz kért indítási kapcsolók. Külön exportálva, hogy minden
 * mérőpad UGYANAZOKKAL fusson — különben a számok nem hasonlíthatók össze.
 */
export const GPU_ARGS = [
  '--use-angle=metal',
  '--ignore-gpu-blocklist',
  '--enable-gpu-rasterization',
  '--enable-zero-copy',
  // ⚠️ VSYNC KI. Enélkül MINDEN mérés pont 16,7 ms-ot mutatna, és a
  // „p95 ≤ 16,7 ms" kapu magától teljesülne — vagyis semmit nem mérnénk.
  // Kikapcsolva a valódi képkocka-költséget látjuk, tartalékkal együtt.
  '--disable-gpu-vsync',
  '--disable-frame-rate-limit',
];
