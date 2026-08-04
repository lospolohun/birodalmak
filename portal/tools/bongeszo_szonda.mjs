// PORTAL HUB TYCOON — BÖNGÉSZŐ-SZONDA.
//
// ── MIT MÉR ÉS MIT NEM ────────────────────────────────────────────────────
// Ez a szonda azt ellenőrzi, hogy a játék ELINDUL-E és MŰKÖDIK-E a
// böngészőben: nincs-e konzol-hiba, felépül-e a felület, rajzol-e a WebGL,
// reagál-e az építés, és halad-e az idő.
//
// ⚠️ FPS-T NEM MÉR, ÉS NEM IS FOG. A felhőben nincs GPU: a Chrome szoftveres
// raszterizálóra (SwiftShader) esik, és az ott mért képkocka-szám SEMMIT nem
// jelent. Ha ez a fájl valaha FPS-ítéletet mondana, az hamis biztonságérzet
// lenne — a teljesítményt csak valódi GPU-n szabad mérni. (Lásd a CLAUDE.md
// „Hol dolgozol?" táblázatát.)
//
// Amit viszont ITT is érdemes nézni: a konzol-hibák és a DOM-állapot gépfüggetlen.

import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const GYOKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 5274;
const CIM = `http://localhost:${PORT}/?seed=4242`;

let hiba = 0;
const ok = (s) => console.log(`  \x1b[32m✓\x1b[0m ${s}`);
const rossz = (s) => { console.log(`  \x1b[31m✗ ${s}\x1b[0m`); hiba++; };
const cim = (s) => console.log(`\n\x1b[1m${s}\x1b[0m`);

/**
 * Melyik Chrome-ot indítsuk?
 *
 * A playwright a SAJÁT verziójához tartozó build-számot keresi, a környezet
 * viszont mást tehet a `PLAYWRIGHT_BROWSERS_PATH` alá — és ilyenkor a hibaüzenet
 * („futtasd a playwright install-t") félrevezet: a böngésző ott van, csak más
 * a mappa neve. Ezért magunk keressük meg. A `npx playwright install` több
 * környezetben (pl. macOS 12) egyenesen elbukik, tehát nem is megoldás.
 *
 * Sorrend: kézi felülbírálás → a rendszer alá telepített playwright-Chromium →
 * a playwright saját letöltése (undefined = találja ki ő).
 */
function chromeUtvonal() {
  if (process.env.AOC_CHROME) return process.env.AOC_CHROME;
  const alap = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!existsSync(alap)) return undefined;
  const jeloltek = readdirSync(alap).filter((n) => n.startsWith('chromium-')).sort();
  for (const j of jeloltek.reverse()) {
    const p = join(alap, j, 'chrome-linux', 'chrome');
    if (existsSync(p)) return p;
  }
  return undefined;
}

/**
 * A kiszolgáló indítása és MEGBÍZHATÓ leállítása.
 *
 * ⚠️ EZ EGY VALÓDI, MEGTALÁLT HIBA VOLT. A `spawn('npx', …)` + `kill()` csak az
 * `npx`-et állítja meg; a vite GYEREKFOLYAMATA életben marad, és megtartja a
 * portot. A következő futás `--strictPort` mögül a MÁR FUTÓ, elavult
 * kiszolgálót kapja — vagyis zöld szonda a RÉGI `dist/`-re. Ennél kevés
 * álnokabb hiba van egy mérőeszközben.
 *
 * A megoldás: saját folyamatcsoport (`detached`), és a csoport egészének
 * kilövése (`process.kill(-pid)`).
 */
function kiszolgalotIndit(args) {
  const p = spawn('npx', args, { cwd: join(GYOKER, '..'), stdio: 'ignore', detached: true });
  p.unref();
  return p;
}

function kiszolgalotLeallit(p) {
  if (!p || !p.pid) return;
  try { process.kill(-p.pid, 'SIGTERM'); } catch (e) { try { p.kill(); } catch (e2) { /* már halott */ } }
}

const kiszolgalo = kiszolgalotIndit(['vite', 'preview', '--config', join(GYOKER, 'vite.config.js'), '--port', String(PORT), '--strictPort']);
const varj = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  await varj(2500);
  const bongeszo = await chromium.launch({
    executablePath: chromeUtvonal(),
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
  });
  const lap = await bongeszo.newPage({ viewport: { width: 1440, height: 900 } });

  const hibak = [];
  lap.on('console', (m) => { if (m.type() === 'error') hibak.push(m.text()); });
  lap.on('pageerror', (e) => hibak.push('pageerror: ' + e.message));

  cim('1. BETÖLTÉS');
  await lap.goto(CIM, { waitUntil: 'networkidle' });
  await varj(2500);
  if (hibak.length === 0) ok('nincs konzol-hiba');
  else for (const h of hibak.slice(0, 6)) rossz(h);

  cim('2. FELÜLET');
  for (const [valaszto, nev] of [['#felso', 'felső sáv'], ['#fejezet', 'fejezet-kártya'], ['#epites', 'építés-sáv'], ['#oldal', 'oldalgombok'], ['#fatyol.nyitva', 'nyitó fejezet-ablak']]) {
    if (await lap.$(valaszto)) ok(nev); else rossz(`hiányzik: ${nev} (${valaszto})`);
  }

  cim('3. A FEJEZET-ABLAK ELENGEDHETŐ');
  await lap.click('#modal .valasz');
  await varj(400);
  const nyitva = await lap.$('#fatyol.nyitva');
  if (!nyitva) ok('a bevezető bezárult, a játék fut'); else rossz('a bevezető ablak nem záródott be');

  cim('4. HALAD AZ IDŐ');
  const t1 = await lap.evaluate(() => window.PHT.sim.tick);
  await varj(2000);
  const t2 = await lap.evaluate(() => window.PHT.sim.tick);
  if (t2 > t1 + 20) ok(`${t1} → ${t2} tick két másodperc alatt`);
  else rossz(`az idő nem halad: ${t1} → ${t2}`);

  cim('5. ÉRKEZNEK UTASOK ÉS RAJZOLÓDNAK');
  const allapot = await lap.evaluate(() => {
    // A v0.2 óta fajonként/típusonként külön példányosított mesh van, ezért a
    // „hány lény rajzolódik" kérdést össze kell adni a fajok fölött.
    let rajzoltTest = 0;
    for (const b of window.PHT.lenyek.fajMesh.values()) rajzoltTest += b.test.count;
    let epuletPeldany = 0;
    for (const b of window.PHT.allomas.tipusMesh.values()) epuletPeldany += b.test.count;
    return {
      utas: window.PHT.sim.utasSzam,
      rajzoltTest,
      epuletPeldany,
      padloCella: window.PHT.allomas.padlo.count,
      hivas: window.PHT.szinter.renderelo.info.render.calls,
      haromszog: window.PHT.szinter.renderelo.info.render.triangles,
    };
  });
  console.log(`    utas ${allapot.utas} · rajzolt lény ${allapot.rajzoltTest} · padlócella ${allapot.padloCella}`);
  console.log(`    rajzolási hívás ${allapot.hivas} · háromszög ${allapot.haromszog}`);
  if (allapot.utas > 0) ok('vannak utasok az állomáson'); else rossz('egyetlen utas sem érkezett');
  if (allapot.padloCella > 300) ok('a padló felépült'); else rossz('a padló nem rajzolódott ki');
  if (allapot.hivas > 0 && allapot.haromszog > 1000) ok('a WebGL rajzol'); else rossz('a WebGL nem rajzolt semmit');
  // ⚠️ A KÜSZÖB A v0.2-BEN MEGVÁLTOZOTT, és ez tudatos csere volt. Amíg minden
  // épület ugyanaz a doboz és minden lény ugyanaz a kapszula volt, tizenkét
  // hívásból kijött az egész jelenet — de akkor minden egyformán is nézett ki.
  // A típusonkénti sziluett ára az, hogy a hívások száma a TÍPUSOK számától
  // függ (≈20 épület + 10 faj, testtel-dísszel). Ami NEM változhat: a hívás
  // száma nem függhet az ÉPÜLETEK és a LÉNYEK számától. A küszöb ezért 120 —
  // bőven a típus-alapú felső korlát fölött, és bőven az alatt, amit egy
  // elrontott, példányonként rajzoló változat produkálna.
  if (allapot.hivas < 120) ok(`${allapot.hivas} rajzolási hívás — a példányosítás működik`);
  else rossz(`${allapot.hivas} rajzolási hívás — valami nincs példányosítva`);

  cim('6. AZ ÉPÍTÉS MŰKÖDIK A FELÜLETRŐL');
  await lap.click('#kategoriak button:nth-child(4)');   // Kényelem
  await varj(200);
  await lap.click('#epuletek .epgomb:nth-child(1)');    // első épület
  await varj(200);
  const elotte = await lap.evaluate(() => window.PHT.sim.epuletek.filter(Boolean).length);
  await lap.mouse.click(720, 470);
  await varj(600);
  const utana = await lap.evaluate(() => window.PHT.sim.epuletek.filter(Boolean).length);
  if (utana > elotte) ok(`épület lerakva a felületről (${elotte} → ${utana})`);
  else rossz(`az építés nem működött (${elotte} → ${utana})`);

  cim('7. PANELEK');
  const panelDb = await lap.$$eval('#oldal button', (l) => l.length);
  for (let i = 1; i <= panelDb; i++) {
    await lap.click(`#oldal button:nth-child(${i})`);
    await varj(180);
    const van = await lap.$eval('#panel', (e) => e.classList.contains('nyitva') && e.childElementCount > 0);
    if (van) ok(`panel ${i} megnyílt és van tartalma`); else rossz(`panel ${i} üres`);
    await lap.click(`#oldal button:nth-child(${i})`);
  }

  cim('8. MENTÉS ÉS BETÖLTÉS');
  // Ez a vizsgálat a v0.2 legfontosabb ígéretét méri: a mentés a seed + a
  // parancsnapló, tehát a betöltött világnak BITRE ugyanannak kell lennie.
  // Ha ez elcsúszik, arról a játékos csak órákkal később értesülne.
  await lap.evaluate(() => { window.PHT.sim.parancs({ fajta: 'padlo', x: 2, y: 2, sz: 3, m: 3 }); });
  await varj(2500);
  const elotteAllapot = await lap.evaluate(() => {
    const s = window.PHT.sim;
    window.PHT.tarolo.ment(s, 1, 'szonda');
    return { tick: s.tick, osszeg: s.ellenorzoOsszeg(), nap: s.nap, parancs: s.napló.length };
  });
  console.log(`    mentve: ${elotteAllapot.tick}. tick, ${elotteAllapot.parancs} parancs, összeg ${elotteAllapot.osszeg}`);
  await lap.evaluate(() => window.PHT.tarolo.betoltestKer(1));
  await lap.waitForLoadState('networkidle');
  await varj(3500);
  const utanaAllapot = await lap.evaluate(() => {
    const s = window.PHT.sim;
    return { tick: s.tick, osszeg: s.ellenorzoOsszeg(), nap: s.nap };
  });
  // A betöltés után a hurok azonnal továbbfut, ezért a tick már nagyobb lehet.
  // Az összeget a mentés tickjén kell összevetni — a visszajátszó pont addig
  // megy, ezért a pillanatot a lap belsejéből, újrajátszással ellenőrizzük.
  const horgony = await lap.evaluate(() => window.PHT.betoltottAllapot);
  if (!horgony || !horgony.betoltve) rossz('a lap nem betöltésből indult — a mentés-jelző elveszett');
  else if (horgony.tick !== elotteAllapot.tick) rossz(`a visszajátszás más tickig ért: ${horgony.tick} ≠ ${elotteAllapot.tick}`);
  else if (horgony.osszeg !== elotteAllapot.osszeg) rossz(`a betöltött világ ELTÉR: ${horgony.osszeg} ≠ ${elotteAllapot.osszeg}`);
  else ok(`a betöltött világ BITRE azonos a mentettel (${horgony.tick}. tick, összeg ${horgony.osszeg})`);
  if (utanaAllapot.tick >= elotteAllapot.tick) ok(`és a játék folytatódik (${elotteAllapot.tick} → ${utanaAllapot.tick}. tick)`);
  else rossz(`a betöltés után nem halad az idő: ${utanaAllapot.tick} < ${elotteAllapot.tick}`);
  await lap.evaluate(() => window.PHT.tarolo.torol(1));

  const utolsoHibak = hibak.slice();
  if (utolsoHibak.length > 0) {
    cim('KONZOL-HIBÁK');
    for (const h of utolsoHibak.slice(0, 10)) rossz(h);
  }

  await lap.screenshot({ path: join(GYOKER, 'qa/bongeszo.png') });
  console.log(`\n    képernyőkép: portal/qa/bongeszo.png`);
  await bongeszo.close();
} finally {
  kiszolgalotLeallit(kiszolgalo);
}

console.log('');
if (hiba === 0) { console.log('\x1b[42m\x1b[30m  A JÁTÉK ELINDUL ÉS MŰKÖDIK  \x1b[0m\n'); process.exit(0); }
console.log(`\x1b[41m\x1b[37m  ${hiba} HIBA  \x1b[0m\n`);
process.exit(1);
