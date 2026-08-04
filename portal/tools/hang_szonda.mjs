// PORTAL HUB TYCOON — HANG-SZONDA.
//
// ── MIÉRT VAN EZ AZ ESZKÖZ ────────────────────────────────────────────────
// A hangot nem lehet automatikusan „meghallgatni", tehát a szonda nem is ezt
// próbálja. Azt őrzi, ami MÉRHETŐ, és ami elromolva észrevétlen maradna:
//
//   1. KATALÓGUS  — minden `jelez()`-kódhoz van definíció, nincs elgépelt
//      mező, nincs tartományon kívüli szám, nincs duplikált kulcs. Egy
//      elgépelt mezőnév a WebAudióban NEM hiba: csendben figyelmen kívül
//      marad, és a hang „valamiért fakóbb lesz". Ez a fajta hiba évekig
//      megülhet egy projektben.
//   2. NINCS KÜLSŐ FÁJL — a `dist/` bárhová másolható kell legyen, második
//      hálózati kérés nélkül. Egy `fetch('kassza.mp3')` ezt az ígéretet
//      csendben felmondaná, és csak az offline gépen derülne ki.
//   3. NEM ÍR A SIMBE — a hang a RENDER oldal. Egy `sim.valami = …` a
//      hangkódban a determinizmust törné el, méghozzá olyan helyen, ahol a
//      determinizmus-szonda soha nem keresné.
//   4. FELÜLET — a `Hang` publikus metódusai megvannak, és a konstruktor
//      NEM hoz létre AudioContext-et (autoplay-szabály).
//   5. BÖNGÉSZŐ — indul-e a lap konzol-hiba nélkül a hanggal együtt.
//
// ⚠️ AZ 5. VIZSGÁLAT KIHAGYHATÓ. Amíg a hangrendszer nincs bekötve a
// `fo.js`-be, nincs `window.PHT.hang`, és a böngészős rész értelmetlen. Ilyenkor
// KIÍRJA, hogy kimarad, és NEM bukik el tőle — különben a sáv fejlesztése
// közben végig piros lenne a kapu, és megtanulnánk átnézni rajta.
//
// ⚠️ HA BUKIK, NE A SZONDÁT ÍRD ÁT.

import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const GYOKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const AUDIO = join(GYOKER, 'src/audio');
const PORT = 5276;
const CIM = `http://localhost:${PORT}/?seed=4242`;

let hiba = 0;
const cim = (s) => console.log(`\n\x1b[1m${s}\x1b[0m`);
const ok = (s) => console.log(`  \x1b[32m✓\x1b[0m ${s}`);
const rossz = (s) => { console.log(`  \x1b[31m✗ ${s}\x1b[0m`); hiba++; };
const info = (s) => console.log(`    ${s}`);

/**
 * Melyik Chrome-ot indítsuk?
 *
 * A playwright a SAJÁT verziójához tartozó build-számot keresi, a környezet
 * viszont mást tehet a `PLAYWRIGHT_BROWSERS_PATH` alá — és ilyenkor a hibaüzenet
 * („futtasd a playwright install-t") félrevezet: a böngésző ott van, csak más
 * a mappa neve. Ezért magunk keressük meg. A `npx playwright install` több
 * környezetben (pl. macOS 12) egyenesen elbukik, tehát nem is megoldás.
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

const varj = (ms) => new Promise((r) => setTimeout(r, ms));

// ══════════════════════════════════════════════════════════════════════════
//  1. KATALÓGUS
// ══════════════════════════════════════════════════════════════════════════

cim('1. KATALÓGUS — a hangok adatként épek-e');

const KAT_UT = join(AUDIO, 'hang_katalogus.js');
let KAT = null;
if (!existsSync(KAT_UT)) {
  rossz('nincs meg a src/audio/hang_katalogus.js');
} else {
  KAT = await import(pathToFileURL(KAT_UT).href);
}

const HANG_MEZOK = ['nev', 'hangero', 'elsobbseg', 'retegek'];
const RETEG_MEZOK = ['fajta', 'hullam', 'barna', 'f', 'fVeg', 'csuszas', 'elhangolas',
  'keses', 'hossz', 'hangero', 'burok', 'szuro', 'jegyek'];
const BUROK_MEZOK = ['tamad', 'lecseng', 'tart', 'elenged'];
const SZURO_MEZOK = ['fajta', 'f', 'fVeg', 'q'];

const HULLAMOK = ['sine', 'triangle', 'sawtooth', 'square'];
const SZURO_FAJTAK = ['lowpass', 'highpass', 'bandpass', 'notch'];

/** Ennél hosszabb egylövetű hang már nem effekt, hanem baleset. */
const MAX_HOSSZ = 4.0;

function mezoket(hol, obj, engedett) {
  for (const k of Object.keys(obj)) {
    if (!engedett.includes(k)) rossz(`${hol}: ismeretlen mező „${k}" (elgépelés?) — engedett: ${engedett.join(', ')}`);
  }
}

function szamot(hol, ertek, min, max, kotelezo) {
  if (ertek == null) {
    if (kotelezo) rossz(`${hol}: hiányzik`);
    return;
  }
  if (typeof ertek !== 'number' || !Number.isFinite(ertek)) { rossz(`${hol}: nem szám (${ertek})`); return; }
  if (ertek < min || ertek > max) rossz(`${hol}: ${ertek} kívül van a ${min}…${max} tartományon`);
}

if (KAT) {
  const { JELZES_KODOK, HANGOK, AMBIENS, ZENE, ZENE_HANGNEMEK, KEVERES } = KAT;

  // ── minden jelzés-kódhoz van hang ──────────────────────────────────────
  let hianyzo = 0;
  for (const kod of JELZES_KODOK) {
    if (!HANGOK[kod]) { rossz(`a „${kod}" jelzés-kódhoz NINCS hang a katalógusban`); hianyzo++; }
  }
  if (hianyzo === 0) ok(`mind a ${JELZES_KODOK.length} jelzés-kódnak van definíciója`);

  // ── nincs duplikált kulcs a forrásban ──────────────────────────────────
  // Az objektum-literálban a második `gomb:` CSENDBEN felülírja az elsőt, és
  // a futásidejű `Object.keys` már csak egyet lát. Tehát a SZÖVEGET kell nézni.
  const forras = readFileSync(KAT_UT, 'utf8');
  const eleje = forras.indexOf('export const HANGOK = {');
  const vege = forras.indexOf('\n};', eleje);
  const blokk = eleje >= 0 && vege > eleje ? forras.slice(eleje, vege) : '';
  const kulcsok = [...blokk.matchAll(/^ {2}([A-Za-z_][\w]*):\s*\{/gm)].map((m) => m[1]);
  const latott = new Set();
  let duplak = 0;
  for (const k of kulcsok) {
    if (latott.has(k)) { rossz(`duplikált hangkód a katalógusban: „${k}"`); duplak++; }
    latott.add(k);
  }
  if (kulcsok.length === 0) rossz('nem sikerült beolvasni a HANGOK blokkot a forrásból');
  else if (duplak === 0) ok(`${kulcsok.length} hangkód, nincs duplikátum`);

  // ── mezőnkénti átvizsgálás ─────────────────────────────────────────────
  let retegDb = 0;
  let leghosszabb = 0, leghosszabbKod = '';
  for (const [kod, h] of Object.entries(HANGOK)) {
    mezoket(`HANGOK.${kod}`, h, HANG_MEZOK);
    if (typeof h.nev !== 'string' || h.nev.length === 0) rossz(`HANGOK.${kod}.nev: üres`);
    szamot(`HANGOK.${kod}.hangero`, h.hangero, 0, 2, true);
    szamot(`HANGOK.${kod}.elsobbseg`, h.elsobbseg, 0, 3, true);
    if (!Array.isArray(h.retegek) || h.retegek.length === 0) { rossz(`HANGOK.${kod}.retegek: üres`); continue; }

    let hangVege = 0;
    for (let i = 0; i < h.retegek.length; i++) {
      const r = h.retegek[i];
      const hol = `HANGOK.${kod}.retegek[${i}]`;
      retegDb++;
      mezoket(hol, r, RETEG_MEZOK);

      if (r.fajta !== 'osc' && r.fajta !== 'zaj') rossz(`${hol}.fajta: „${r.fajta}" (osc | zaj)`);
      if (r.fajta === 'osc') {
        if (!HULLAMOK.includes(r.hullam)) rossz(`${hol}.hullam: „${r.hullam}" (${HULLAMOK.join(' | ')})`);
        if ('barna' in r) rossz(`${hol}.barna: csak zaj-rétegnek van értelme`);
        szamot(`${hol}.f`, r.f, 10, 14000, true);
        szamot(`${hol}.fVeg`, r.fVeg, 10, 14000, false);
        if (r.csuszas != null && r.csuszas !== 'lin' && r.csuszas !== 'exp') rossz(`${hol}.csuszas: „${r.csuszas}" (lin | exp)`);
        szamot(`${hol}.elhangolas`, r.elhangolas, -1200, 1200, false);
      } else {
        if ('hullam' in r) rossz(`${hol}.hullam: zaj-rétegnek nincs hullámformája`);
        if ('barna' in r && typeof r.barna !== 'boolean') rossz(`${hol}.barna: nem logikai`);
      }

      szamot(`${hol}.hossz`, r.hossz, 0.005, MAX_HOSSZ, true);
      szamot(`${hol}.keses`, r.keses, 0, 3, false);
      szamot(`${hol}.hangero`, r.hangero, 0, 2, true);

      if (!r.burok || typeof r.burok !== 'object') { rossz(`${hol}.burok: hiányzik`); continue; }
      mezoket(`${hol}.burok`, r.burok, BUROK_MEZOK);
      szamot(`${hol}.burok.tamad`, r.burok.tamad, 0.0005, 2, true);
      szamot(`${hol}.burok.lecseng`, r.burok.lecseng, 0.0005, 3, true);
      szamot(`${hol}.burok.tart`, r.burok.tart, 0, 1, true);
      szamot(`${hol}.burok.elenged`, r.burok.elenged, 0.001, 3, true);
      // A nulla felfutás KATTAN. Ez az egyetlen hiba, amitől az egész
      // hangkép olcsónak hallatszik, és nem hallható meg egyenként.
      if (r.burok.tamad === 0) rossz(`${hol}.burok.tamad: 0 → kattanás`);

      if (r.szuro) {
        mezoket(`${hol}.szuro`, r.szuro, SZURO_MEZOK);
        if (!SZURO_FAJTAK.includes(r.szuro.fajta)) rossz(`${hol}.szuro.fajta: „${r.szuro.fajta}"`);
        szamot(`${hol}.szuro.f`, r.szuro.f, 20, 16000, true);
        szamot(`${hol}.szuro.fVeg`, r.szuro.fVeg, 20, 16000, false);
        szamot(`${hol}.szuro.q`, r.szuro.q, 0.05, 24, false);
      }

      let utolsoJegy = 0;
      if (r.jegyek != null) {
        if (!Array.isArray(r.jegyek) || r.jegyek.length === 0) { rossz(`${hol}.jegyek: üres tömb`); continue; }
        for (let j = 0; j < r.jegyek.length; j++) {
          const jg = r.jegyek[j];
          if (!Array.isArray(jg) || jg.length !== 2) { rossz(`${hol}.jegyek[${j}]: [keses, szorzo] alakú kell legyen`); continue; }
          szamot(`${hol}.jegyek[${j}][0]`, jg[0], 0, 3, true);
          szamot(`${hol}.jegyek[${j}][1]`, jg[1], 0.05, 8, true);
          if (jg[0] > utolsoJegy) utolsoJegy = jg[0];
        }
      }

      const veg = (r.keses || 0) + utolsoJegy + Math.max(r.hossz, r.burok.tamad + r.burok.lecseng) + r.burok.elenged;
      if (veg > hangVege) hangVege = veg;
    }

    if (hangVege > MAX_HOSSZ) rossz(`HANGOK.${kod}: ${hangVege.toFixed(2)} s hosszú — egylövetű hang legfeljebb ${MAX_HOSSZ} s`);
    if (hangVege > leghosszabb) { leghosszabb = hangVege; leghosszabbKod = kod; }
  }
  ok(`${retegDb} réteg átvizsgálva, minden mező ismert és tartományban van`);
  info(`leghosszabb effekt: ${leghosszabbKod} — ${leghosszabb.toFixed(2)} s`);

  // ── folyamatos rétegek és zene ─────────────────────────────────────────
  szamot('AMBIENS.portal.alapF', AMBIENS.portal.alapF, 20, 400, true);
  szamot('AMBIENS.portal.szuroMin', AMBIENS.portal.szuroMin, 40, 4000, true);
  szamot('AMBIENS.portal.szuroMax', AMBIENS.portal.szuroMax, 40, 16000, true);
  szamot('AMBIENS.portal.lfoMin', AMBIENS.portal.lfoMin, 0.02, 20, true);
  szamot('AMBIENS.portal.lfoMax', AMBIENS.portal.lfoMax, 0.02, 20, true);
  szamot('AMBIENS.tomeg.viszony', AMBIENS.tomeg.viszony, 10, 100000, true);
  szamot('AMBIENS.aramszunet.tompitasBe', AMBIENS.aramszunet.tompitasBe, 100, 16000, true);
  if (AMBIENS.portal.szuroMax <= AMBIENS.portal.szuroMin) rossz('AMBIENS.portal: a szuroMax nem nagyobb a szuroMin-nél — az instabilitás nem hallatszana');
  if (AMBIENS.portal.lfoMax <= AMBIENS.portal.lfoMin) rossz('AMBIENS.portal: az lfoMax nem nagyobb az lfoMin-nél — a lüktetés nem gyorsulna');
  if (AMBIENS.aramszunet.tompitasBe >= AMBIENS.aramszunet.tompitasKi) rossz('AMBIENS.aramszunet: a tompítás nem tompít');
  ok('a folyamatos rétegek paraméterei értelmes tartományban vannak');

  if (!Array.isArray(ZENE_HANGNEMEK) || ZENE_HANGNEMEK.length < 2) {
    rossz('ZENE_HANGNEMEK: legalább két hangnem kell (világos / sötét)');
  } else {
    let rendben = true;
    let elozoKuszob = -1;
    for (const hn of ZENE_HANGNEMEK) {
      szamot(`ZENE_HANGNEMEK.${hn.kod}.alapF`, hn.alapF, 40, 800, true);
      if (!Array.isArray(hn.lepesek) || hn.lepesek.length < 5) { rossz(`ZENE_HANGNEMEK.${hn.kod}.lepesek: kevés fok`); rendben = false; }
      if (hn.hirnevAlatt <= elozoKuszob) { rossz(`ZENE_HANGNEMEK.${hn.kod}: a hirnevAlatt küszöbök nem növekvők`); rendben = false; }
      elozoKuszob = hn.hirnevAlatt;
    }
    // A legsötétebb hangnem legyen tényleg sötétebb: alacsonyabb szűrő.
    if (ZENE_HANGNEMEK[0].szuroF >= ZENE_HANGNEMEK[ZENE_HANGNEMEK.length - 1].szuroF) {
      rossz('ZENE_HANGNEMEK: a rossz hírnévhez tartozó hangnem nem sötétebb a jónál');
      rendben = false;
    }
    if (rendben) ok(`${ZENE_HANGNEMEK.length} hangnem, a hírnév-küszöbök növekvők, a sötét tényleg sötétebb`);
  }

  szamot('ZENE.akkordHossz', ZENE.akkordHossz, 2, 60, true);
  szamot('ZENE.padSzint', ZENE.padSzint, 0, 0.5, true);
  szamot('KEVERES.maxEgyloveses', KEVERES.maxEgyloveses, 4, 32, true);
  if (KEVERES.maxEgyloveses > 24) rossz('KEVERES.maxEgyloveses túl nagy — csúcsforgalomban sárrá mosódna a hangkép');
  else ok(`egyszerre legfeljebb ${KEVERES.maxEgyloveses} egylövetű hang`);
}

// ══════════════════════════════════════════════════════════════════════════
//  2. NINCS KÜLSŐ HANGFÁJL
// ══════════════════════════════════════════════════════════════════════════

cim('2. NINCS KÜLSŐ HANGFÁJL — a dist bárhová másolható');

const TILTOTT = [
  [/\bfetch\s*\(/, 'fetch('],
  [/XMLHttpRequest/, 'XMLHttpRequest'],
  [/new\s+Audio\s*\(/, 'new Audio('],
  [/createElement\s*\(\s*['"]audio['"]/i, "createElement('audio')"],
  [/decodeAudioData/, 'decodeAudioData'],
  [/\.(mp3|ogg|wav|m4a|flac|aac|opus)\b/i, 'hangfájl-hivatkozás'],
  [/data:audio\//i, 'beágyazott base64 hang'],
];

const audioFajlok = existsSync(AUDIO)
  ? readdirSync(AUDIO).filter((n) => n.endsWith('.js')).map((n) => join(AUDIO, n))
  : [];

if (audioFajlok.length === 0) {
  rossz('nincs egyetlen .js fájl sem a src/audio/ alatt');
} else {
  let talalat = 0;
  for (const ut of audioFajlok) {
    const sorok = readFileSync(ut, 'utf8').split('\n');
    for (let i = 0; i < sorok.length; i++) {
      const sor = sorok[i];
      // A kommentek magyarázhatják a tilalmat — azokat nem büntetjük.
      if (/^\s*(\/\/|\*|\/\*)/.test(sor)) continue;
      for (const [minta, nev] of TILTOTT) {
        if (minta.test(sor)) { rossz(`${ut.replace(GYOKER + '/', '')}:${i + 1} — ${nev}`); talalat++; }
      }
    }
  }
  if (talalat === 0) ok(`${audioFajlok.length} fájl, egyetlen külső hang-hivatkozás sincs — minden procedurális`);
}

// ══════════════════════════════════════════════════════════════════════════
//  3. A HANG NEM ÍR A SIMBE
// ══════════════════════════════════════════════════════════════════════════

cim('3. A HANG NEM ÍR A SIMBE — a render sosem mozdítja el a világot');

if (audioFajlok.length > 0) {
  let talalat = 0;
  let simImport = 0;
  for (const ut of audioFajlok) {
    const sorok = readFileSync(ut, 'utf8').split('\n');
    for (let i = 0; i < sorok.length; i++) {
      const sor = sorok[i];
      const hol = `${ut.replace(GYOKER + '/', '')}:${i + 1}`;
      if (/^\s*import\s.*['"]\.\.\/sim\//.test(sor)) {
        // A típus-hivatkozás (JSDoc) rendben van; a futásidejű import gyanús.
        simImport++;
        info(`import a sim-ből: ${hol}`);
      }
      if (/^\s*(\/\/|\*|\/\*)/.test(sor)) continue;
      if (/\bsim\s*\.\s*parancs\s*\(/.test(sor)) { rossz(`${hol} — sim.parancs() hívás a hangrétegben`); talalat++; }
      // Értékadás a simre: `sim.x =`, `sim.a.b =`, `sim[…] =` (de nem `==`, `=>`).
      if (/\bsim\s*(\.\s*[\w$]+|\[[^\]]*\])\s*(\.\s*[\w$]+|\[[^\]]*\])*\s*(=[^=>]|\+\+|--|[+\-*/]=)/.test(sor)) {
        rossz(`${hol} — értékadás a sim állapotára`);
        talalat++;
      }
    }
  }
  if (talalat === 0) ok('nincs sim.parancs() és nincs értékadás a sim-re — a hang csak olvas');
  if (simImport === 0) ok('a hangréteg futásidőben nem is importál a sim/-ből');
}

// ══════════════════════════════════════════════════════════════════════════
//  4. A PUBLIKUS FELÜLET
// ══════════════════════════════════════════════════════════════════════════

cim('4. FELÜLET — amihez a fo.js és a hud.js illeszkedik');

const HANG_UT = join(AUDIO, 'hang.js');
let Hang = null;
if (!existsSync(HANG_UT)) {
  rossz('nincs meg a src/audio/hang.js');
} else {
  try {
    ({ Hang } = await import(pathToFileURL(HANG_UT).href));
  } catch (e) {
    rossz(`a hang.js nem importálható tiszta node-ban: ${e.message}`);
  }
}

if (Hang) {
  const h = new Hang();
  for (const nev of ['inditas', 'frissit', 'jelez', 'hangero', 'nemit', 'zeneHangero']) {
    if (typeof h[nev] === 'function') ok(`Hang.${nev}()`);
    else rossz(`hiányzik: Hang.${nev}()`);
  }
  for (const nev of ['be', 'elindult']) {
    const leiro = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(h), nev);
    if (leiro && typeof leiro.get === 'function') ok(`Hang.${nev} (getter)`);
    else rossz(`hiányzik a getter: Hang.${nev}`);
  }

  // ── az autoplay-szabály ────────────────────────────────────────────────
  // Ha a konstruktor AudioContext-et hozna létre, az a böngészőben csendben
  // `suspended` maradna, és a hangrendszer NÉMÁN, hibaüzenet nélkül dőlne el.
  if (h.ctx == null && h.elindult === false) ok('a konstruktor nem hoz létre AudioContext-et');
  else rossz('a konstruktor AudioContext-et hozott létre — az autoplay-szabály elnémítaná');
  if (h.be === false) ok('indítás előtt a `be` hamis');
  else rossz('indítás előtt a `be` igaz');

  // Node-ban nincs WebAudio: minden hívásnak csendben ki kell szállnia,
  // nem kivételt dobnia — különben egy régi böngészőben az egész játék dől.
  try {
    h.inditas();
    h.hangero(0.5);
    h.zeneHangero(0.3);
    h.nemit(true);
    h.nemit(false);
    h.jelez('gomb');
    h.jelez('nincs_ilyen_kod');
    h.frissit(null, 0.016);
    ok('WebAudio nélkül minden hívás csendben kiszáll (nem dob kivételt)');
  } catch (e) {
    rossz(`WebAudio nélkül kivételt dobott: ${e.message}`);
  }
}

// ══════════════════════════════════════════════════════════════════════════
//  5. BÖNGÉSZŐ — csak ha a hang MÁR be van kötve
// ══════════════════════════════════════════════════════════════════════════

cim('5. BÖNGÉSZŐ');

let chromium = null;
try {
  ({ chromium } = await import('playwright'));
} catch (e) {
  info('a playwright nincs telepítve — a böngészős vizsgálat kimarad');
}

if (chromium) {
  // `detached: true` + csoportos kilövés. A `kill()` az `npx`-et állítaná meg,
  // a valódi vite-folyamat viszont a GYEREKE — az életben maradna, és a
  // következő futásnál a RÉGI `dist/`-et szolgálná ki a `--strictPort` mögül.
  // Zöld szonda, elavult kód: ennél alattomosabb hamis biztonságérzet nincs.
  const kiszolgalo = spawn('npx', ['vite', 'preview', '--config', join(GYOKER, 'vite.config.js'), '--port', String(PORT), '--strictPort'], {
    cwd: join(GYOKER, '..'), stdio: 'ignore', detached: true,
  });
  let bongeszo = null;
  try {
    await varj(2500);
    bongeszo = await chromium.launch({
      executablePath: chromeUtvonal(),
      args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
    });
    const lap = await bongeszo.newPage({ viewport: { width: 1280, height: 800 } });

    const hibak = [];
    lap.on('console', (m) => { if (m.type() === 'error') hibak.push(m.text()); });
    lap.on('pageerror', (e) => hibak.push('pageerror: ' + e.message));

    await lap.goto(CIM, { waitUntil: 'networkidle' });
    await varj(1800);

    const van = await lap.evaluate(() => !!(window.PHT && window.PHT.hang));
    if (!van) {
      info('a hangrendszer még nincs bekötve — a böngészős vizsgálat kimarad');
      if (hibak.length === 0) ok('a lap hang nélkül is konzol-hiba nélkül tölt be');
      else for (const h of hibak.slice(0, 6)) rossz(h);
    } else {
      // Valódi kattintás: ez a felhasználói gesztus, ami nélkül az
      // AudioContext `suspended` maradna.
      await lap.mouse.click(640, 400);
      await varj(300);

      const allapot = await lap.evaluate(async () => {
        const h = window.PHT.hang;
        h.inditas();
        h.inditas();                    // idempotencia
        return { elindult: h.elindult, be: h.be, ctx: h.ctx ? h.ctx.state : null };
      });
      if (allapot.elindult) ok(`az AudioContext elindult (állapot: ${allapot.ctx})`);
      else rossz('az inditas() után sem jött létre AudioContext');

      // Minden jelzés-kód lefuttatása: ami itt kivételt dob, az a játékban
      // pont a legrosszabb pillanatban dobna (összeomlás, csőd, győzelem).
      const kodok = KAT ? KAT.JELZES_KODOK : [];
      const dobott = await lap.evaluate((lista) => {
        const h = window.PHT.hang;
        const bajok = [];
        for (const k of lista) {
          try { h.jelez(k); } catch (e) { bajok.push(k + ': ' + e.message); }
        }
        return bajok;
      }, kodok);
      if (dobott.length === 0) ok(`mind a ${kodok.length} jelzés-kód lefutott kivétel nélkül`);
      else for (const d of dobott) rossz(d);

      // Hangszál-korlát: 200 jelzés se indíthasson 200 hangot.
      const arasztas = await lap.evaluate(() => {
        const h = window.PHT.hang;
        for (let i = 0; i < 200; i++) h.jelez('gomb');
        return h._helyek ? h._helyek.filter((x) => x.aktiv).length : -1;
      });
      if (arasztas < 0) info('a hangszál-nyilvántartás nem érhető el — a korlát nem mérhető');
      else if (arasztas <= 24) ok(`200 egyidejű jelzésből ${arasztas} hangszál él — a korlát tart`);
      else rossz(`200 jelzésből ${arasztas} hangszál él — a korlát nem tart`);

      // ── SZÓL-E EGYÁLTALÁN, ÉS A JÓ IRÁNYBA MOZDUL-E ────────────────────
      // Ez a hangrendszer „6. vizsgálata". Minden eddigi ellenőrzés
      // átmenne egy TÖKÉLETESEN NÉMA rendszeren is: a katalógus ép lenne, a
      // kontextus elindulna, kivétel sem lenne. Ezért a kimenetre kötünk egy
      // elemzőt, és megnézzük a csúcsszintet két állapotban. A nyüzsgő,
      // instabil állomásnak MÉRHETŐEN hangosabbnak kell lennie az üresnél —
      // ez az a szám, ami elárulja, hogy tényleg csinál is valamit.
      //
      // Az álállapot csak a hangnak megy be, a simhez nem nyúlunk.
      const szint = await lap.evaluate(async () => {
        const h = window.PHT.hang;
        if (!h.mester || !h.ctx) return null;
        // A játék hurka minden képkockában a VALÓDI világhoz hangolja a
        // rétegeket. Amíg ez fut, a befecskendezett álállapot azonnal
        // felülíródik — és a mérés két azonos számot adna. Ezért a mérés
        // idejére kikapcsoljuk a hurok hangolását.
        if (window.PHT.beallitas) window.PHT.beallitas.hangAuto = false;
        h.nemit(false); h.hangero(0.8);
        const a = h.ctx.createAnalyser();
        a.fftSize = 2048;
        h.mester.connect(a);
        const puf = new Float32Array(a.fftSize);
        const merd = async (allapot, elokeszit, meres) => {
          for (let i = 0; i < elokeszit; i++) { h.frissit(allapot, 0.05); await new Promise((r) => setTimeout(r, 12)); }
          let csucs = 0;
          const vege = performance.now() + meres;
          while (performance.now() < vege) {
            a.getFloatTimeDomainData(puf);
            for (let i = 0; i < puf.length; i++) { const v = Math.abs(puf[i]); if (v > csucs) csucs = v; }
            await new Promise((r) => setTimeout(r, 20));
          }
          return csucs;
        };
        const ures = { dimenziok: [{ nyitva: false, instabilitas: 0 }], utasSzam: 0, duhosTavozok: 0, hirnev: 60, aramszunet: false, tick: 0 };
        const nyuzsgo = { dimenziok: [{ nyitva: true, instabilitas: 900 }, { nyitva: true, instabilitas: 500 }], utasSzam: 800, duhosTavozok: 0, hirnev: 15, aramszunet: false, tick: 600 };
        const csendes = await merd(ures, 40, 700);
        const hangos = await merd(nyuzsgo, 60, 900);
        if (window.PHT.beallitas) window.PHT.beallitas.hangAuto = true;
        return { csendes, hangos };
      });
      if (!szint) {
        info('a keverő kimenete nem érhető el — a jelszint nem mérhető');
      } else {
        info(`csúcsszint: üres állomás ${szint.csendes.toFixed(3)} · nyüzsgő+instabil ${szint.hangos.toFixed(3)}`);
        if (szint.hangos > 0.01) ok('a hangrendszer valóban ad ki jelet (nem néma)');
        else rossz('a kimenet néma — a gráf nem szól, hiába ép minden más');
        if (szint.hangos > szint.csendes * 1.3) ok('a baj HALLATSZIK: a nyüzsgő, instabil állomás mérhetően hangosabb');
        else rossz('az üres és a bajban lévő állomás ugyanolyan hangos — a rétegek nem követik a világot');
      }

      await lap.evaluate(() => { window.PHT.hang.nemit(true); });
      await varj(1500);
      if (hibak.length === 0) ok('nincs konzol-hiba a hanggal együtt');
      else for (const h of hibak.slice(0, 8)) rossz(h);
    }
  } catch (e) {
    rossz(`a böngészős vizsgálat elszállt: ${e.message}`);
  } finally {
    if (bongeszo) await bongeszo.close();
    try { process.kill(-kiszolgalo.pid); } catch (e) { kiszolgalo.kill(); }
  }
}

console.log('');
if (hiba === 0) { console.log('\x1b[42m\x1b[30m  A HANGRENDSZER RENDBEN  \x1b[0m\n'); process.exit(0); }
console.log(`\x1b[41m\x1b[37m  ${hiba} HIBA  \x1b[0m\n`);
process.exit(1);
