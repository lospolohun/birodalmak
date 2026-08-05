// PORTAL HUB TYCOON — TEXTÚRA-SZONDA.
//
// ── MIÉRT NEM ELÉG MEGNÉZNI ───────────────────────────────────────────────
// A látvány-sávnak van egy tanulsága, amit ez a szonda örökölt: a csillagok
// hónapokig „ott voltak" a kódban — létezett az objektum, volt anyaga, be volt
// téve a jelenetbe —, és közben SÖTÉTÍTETTEK, mert a köd befedte őket. Semmi
// nem szólt róla. A képpont-mérés kapta el.
//
// A textúránál pontosan ugyanez a csapda vár, csak csöndesebben:
//
//   • `map` beállítva, de a geometrián NINCS uv → minden csúcs (0,0)-t olvas,
//     az egész felület a textúra egyetlen képpontjának színét veszi fel.
//     Ez nem hibaüzenet, hanem egy szép, LAPOS folt — pont az, amit a textúra
//     meg akart szüntetni.
//   • a textúra ott van, de a példány-szín, a fény vagy a köd elmossa,
//   • a textúra ott van, de SÖTÉTÍT: a felület mintás lett, viszont fakóbb.
//   • a textúra ott van, de példányonkénti anyagot csinált valaki, és a
//     rajzolási hívások száma megnégyszereződött. Ez CSAK méréssel látszik.
//
// Ezért ez a szonda nem objektumokat számol, hanem KÉPPONTOKAT mér:
//
//   1. nincs konzol-hiba, és nincs egyetlen betöltött KÉPFÁJL sem
//      (a `dist/` bemásolhatóságának ígérete),
//   2. a textúra-készlet KORLÁTOS: darabszám, méret, összes képpont,
//   3. a PADLÓ képpont-SZÓRÁSA érdemben nagyobb textúrával, mint nélküle —
//      és közben az ÁTLAGA nem esik (nem sötétít),
//   4. az ÉPÜLETEK ugyanez, plusz minden típus geometriáján van érvényes uv,
//   5. a rajzolási hívások száma nem nőtt, és nem nő az épületek számával,
//   6. a textúrák EGYSZER készülnek: hatvan képkocka alatt egy sem születik.
//
// ⚠️ FPS-T NEM MÉR. A felhőben nincs GPU (SwiftShader) — a szórás, az átlag,
// a hívásszám és a textúraszám viszont gépfüggetlen. Lásd a CLAUDE.md
// „Hol dolgozol?" táblázatát.

import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const GYOKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 5277;
const CIM = `http://localhost:${PORT}/?seed=4242`;

let hiba = 0;
const ok = (s) => console.log(`  \x1b[32m✓\x1b[0m ${s}`);
const rossz = (s) => { console.log(`  \x1b[31m✗ ${s}\x1b[0m`); hiba++; };
const adat = (s) => console.log(`    \x1b[90m${s}\x1b[0m`);
const cim = (s) => console.log(`\n\x1b[1m${s}\x1b[0m`);

/** Ugyanaz a felderítés, mint a többi böngésző-szondában. */
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

/**
 * ⚠️ SAJÁT FOLYAMATCSOPORT. A `spawn('npx', …)` + `kill()` csak az `npx`-et
 * állítja meg; a vite gyerekfolyamata megtartja a portot, és a következő futás
 * `--strictPort` mögül a MÁR FUTÓ, elavult kiszolgálót kapja — vagyis zöld
 * szonda a régi kódra.
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

const kiszolgalo = kiszolgalotIndit(['vite', '--config', join(GYOKER, 'vite.config.js'), '--port', String(PORT), '--strictPort']);
const varj = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  await varj(3000);
  const bongeszo = await chromium.launch({
    executablePath: chromeUtvonal(),
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
  });
  const lap = await bongeszo.newPage({ viewport: { width: 1280, height: 800 } });

  const hibak = [];
  lap.on('console', (m) => { if (m.type() === 'error') hibak.push(m.text()); });
  lap.on('pageerror', (e) => hibak.push('pageerror: ' + e.message));

  // A HMR-t ki kell lőni: ha bárki ment egy forrásfájlt a mérés alatt, a vite
  // újratölti a lapot, és a szonda egy FRISS világot mér a fele mérés után.
  await lap.addInitScript(() => {
    const Eredeti = window.WebSocket;
    window.WebSocket = function (cim2, protokoll) {
      const p = Array.isArray(protokoll) ? protokoll.join(',') : String(protokoll || '');
      if (p.includes('vite') || String(cim2).includes('vite')) {
        return { readyState: 3, addEventListener() {}, removeEventListener() {}, send() {}, close() {} };
      }
      return new Eredeti(cim2, protokoll);
    };
    window.WebSocket.prototype = Eredeti.prototype;
  });

  // ════════════════════════════════════════════════════════════════════════
  cim('0. INDULÁS');
  await lap.goto(CIM, { waitUntil: 'networkidle' });
  await varj(2200);
  await lap.click('#modal .valasz').catch(() => {});
  await varj(400);
  // Szüneteltetve mérünk: a mozgó világ (utasok, szikrák) minden szórást
  // elmosna, és a két A/B-oldal más világot látna.
  await lap.keyboard.press('1');
  await varj(200);
  ok('a játék elindult, a világ szünetel');

  // ── A MÉRŐ ──────────────────────────────────────────────────────────────
  // Átlag ÉS szórás egyetlen `readPixels`-ből, közvetlenül a `rajzol()` után
  // (nincs `preserveDrawingBuffer`, tehát máskor nem is olvasható).
  //
  // A SZÓRÁS a lényeg: az „van-e egyáltalán minta ezen a felületen?" kérdésre
  // ez az egyetlen szám válaszol. Egy lapos, egyszínű felület szórása a
  // fényárnyalatokból jön; egy textúrázotté ennél nagyságrendekkel nagyobb.
  await lap.evaluate(() => {
    const sz = window.PHT.szinter;
    window.__mertek = (elokeszit, w = 300, h = 220, eltolY = 0) => new Promise((r) => requestAnimationFrame(() => {
      if (elokeszit) elokeszit();
      sz.rajzol();
      const gl = sz.renderelo.getContext();
      const x = Math.max(0, ((gl.drawingBufferWidth - w) / 2) | 0);
      const y = Math.max(0, (((gl.drawingBufferHeight - h) / 2) + (eltolY || 0)) | 0);
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let s = 0, s2 = 0;
      const n = w * h;
      for (let i = 0; i < px.length; i += 4) {
        const f = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
        s += f; s2 += f * f;
      }
      const atlag = s / n;
      r({
        atlag,
        szoras: Math.sqrt(Math.max(0, s2 / n - atlag * atlag)),
        hivas: sz.renderelo.info.render.calls,
      });
    }));
    /** Napszak-befagyasztás — enélkül a hurok visszaírja a beállított időt. */
    window.__oratAllit = (a) => {
      const valodi = Object.getPrototypeOf(sz).napszak;
      valodi.call(sz, a * 1200);
      sz.napszak = () => {};
    };
    window.__oratElenged = () => { delete sz.napszak; };
  });

  // ════════════════════════════════════════════════════════════════════════
  cim('1. NINCS KONZOL-HIBA ÉS NINCS BETÖLTÖTT KÉPFÁJL');
  if (hibak.length === 0) ok('tiszta konzol az indulás után');
  else for (const h of hibak.slice(0, 6)) rossz(h);

  // A projekt ígérete: a `dist/` bemásolható bárhová. Egy textúra-png ezt
  // azonnal megtörné, és a `kiadas_ellenorzo.mjs` csak a FORRÁSBAN keres
  // URL-t — egy futás közben összerakott útvonalat nem látna. Itt viszont a
  // böngésző maga mondja meg, mit töltött le.
  const kepFajlok = await lap.evaluate(() => performance.getEntriesByType('resource')
    .map((e) => e.name)
    .filter((n) => /\.(png|jpe?g|webp|gif|bmp|ktx2?|basis|dds|hdr|exr)(\?|$)/i.test(n)));
  if (kepFajlok.length === 0) ok('nulla képfájl-kérés — minden felület kódból készült');
  else for (const f of kepFajlok.slice(0, 5)) rossz(`külső képfájl betöltve: ${f}`);

  // ════════════════════════════════════════════════════════════════════════
  cim('2. A TEXTÚRA-KÉSZLET KORLÁTOS');
  const keszlet = await lap.evaluate(async () => {
    // ⚠️ A lapon belül NEM lehet `import('three')`-t írni: csupasz modulnév,
    // a böngésző nem oldja fel. A `texturak.js`-t viszont URL-lel be tudjuk
    // húzni, és mivel a `fo.js` ugyanezt az URL-t importálta, UGYANAZT a
    // modulpéldányt kapjuk — tehát a leltár a valóban használt készleté.
    const m = await import('/src/render/texturak.js');
    const lista = m.texturaLista();
    return {
      lista,
      db: lista.length,
      keppont: lista.reduce((s, t) => s + t.keppont, 0),
      max: lista.reduce((s, t) => Math.max(s, t.sz, t.m), 0),
      vaszonbol: lista.filter((t) => t.vaszon).length,
      // A két réteg (állomás és lények) UGYANAZT a készletet kell hogy kapja.
      // Ha nem, akkor a gyorstár nem működik, és minden textúra kétszer ült ki
      // a GPU-ra.
      gyorstarazott: window.PHT.allomas.tex === window.PHT.lenyek.tex,
      gpu: window.PHT.szinter.renderelo.info.memory.textures,
    };
  });
  adat(keszlet.lista.map((t) => `${t.nev} ${t.sz}×${t.m}`).join(' · '));
  adat(`összesen ${keszlet.db} textúra, ${(keszlet.keppont / 1e6).toFixed(2)} M képpont, legnagyobb él ${keszlet.max} · GPU-n ${keszlet.gpu} textúra`);
  if (keszlet.db <= 20) ok(`${keszlet.db} textúra (keret: 20)`);
  else rossz(`${keszlet.db} textúra — túl sok`);
  if (keszlet.max <= 1024) ok(`a legnagyobb él ${keszlet.max} képpont (keret: 1024)`);
  else rossz(`${keszlet.max} képpontos textúra — ez már pazarlás`);
  if (keszlet.keppont <= 4e6) ok(`${(keszlet.keppont / 1e6).toFixed(2)} M képpont összesen (keret: 4 M)`);
  else rossz(`${(keszlet.keppont / 1e6).toFixed(2)} M képpont — a textúra-memória elszaladt`);
  if (keszlet.vaszonbol === keszlet.db) ok('mind a … textúra VÁSZONBÓL készült (procedurális, nulla fájl)'.replace('…', keszlet.db));
  else rossz(`${keszlet.db - keszlet.vaszonbol} textúra nem vászonból jött — külső fájl szivárgott be`);
  if (keszlet.gyorstarazott) ok('az állomás- és a lényréteg UGYANAZT a készletet kapta (a gyorstár működik)');
  else rossz('a két réteg külön textúra-készletet generált — minden felület kétszer ül a GPU-n');

  // ════════════════════════════════════════════════════════════════════════
  cim('3. A PADLÓ TÉNYLEG TEXTÚRÁZOTT (és nem sötétít)');
  const padlo = await lap.evaluate(async () => {
    const P = window.PHT, sim = P.sim, sz = P.szinter;
    // Külön, ÜRES padlómező a méréshez: a kezdő csarnokban épületek állnak,
    // és azok szórása összekeveredne a burkolatéval.
    sim.penz = 900000;
    const bx = sim.kezdoX + 34, by = sim.kezdoY + 2;
    sim.parancs({ fajta: 'padlo', x: bx, y: by, sz: 16, m: 14, z: 0 });
    sim.lep(); sim.lep();
    // Majdnem felülnézet, delelő nap: a burkolatot nézzük, nem az árnyékokat.
    window.__oratAllit(0.5);
    sz.cel.set(bx + 8, 0, by + 7);
    sz.tav = 17; sz.dolt = 0.16; sz.szog = 0.4;
    sz._kamerat();
    P.allomas.frissit(1);

    const anyag = P.allomas.padlo.material;
    const terkep = anyag.map;
    const vele = await window.__mertek(() => { anyag.map = terkep; anyag.needsUpdate = true; });
    const nelkule = await window.__mertek(() => { anyag.map = null; anyag.needsUpdate = true; });
    await window.__mertek(() => { anyag.map = terkep; anyag.needsUpdate = true; });
    return {
      vele, nelkule,
      cellak: P.allomas.padlo.count,
      komp: P.allomas.padloFenyKomp,
      uvSkala: !!anyag.onBeforeCompile,
    };
  });
  adat(`padlócella ${padlo.cellak} · fénykompenzáció ×${padlo.komp.toFixed(3)}`);
  adat(`LAPOS  átlag ${padlo.nelkule.atlag.toFixed(2)} · szórás ${padlo.nelkule.szoras.toFixed(2)}`);
  adat(`TEXTÚRÁS átlag ${padlo.vele.atlag.toFixed(2)} · szórás ${padlo.vele.szoras.toFixed(2)}`);
  const padloArany = padlo.vele.szoras / Math.max(0.01, padlo.nelkule.szoras);
  if (padloArany >= 1.6) ok(`a burkolat szórása ${padloArany.toFixed(2)}× a lapos felületének (küszöb 1,6×)`);
  else rossz(`a padlón alig van minta: a szórás csak ${padloArany.toFixed(2)}× a laposé`);
  // A csillagok tanulsága: a dísz nem vihet el fényt.
  const padloFeny = padlo.vele.atlag / Math.max(0.01, padlo.nelkule.atlag);
  if (padloFeny > 0.85 && padloFeny < 1.20) ok(`a textúra nem sötétít: az átlagfényesség ${(padloFeny * 100 - 100).toFixed(1)} %-kal tér el`);
  else rossz(`a textúra elmozdítja a padló fényességét: ×${padloFeny.toFixed(3)} — ez ugyanaz a hiba, mint a sötétítő csillagok`);
  if (padlo.vele.hivas === padlo.nelkule.hivas) ok(`a burkolat nem került rajzolási hívásba (${padlo.vele.hivas} mindkét oldalon)`);
  else rossz(`a textúra megváltoztatta a hívásszámot: ${padlo.nelkule.hivas} → ${padlo.vele.hivas}`);
  if (padlo.uvSkala) ok('a padló VILÁG-uv-t használ (nyolc cellánként ismétlődik, nem cellánként)');
  else rossz('a padló a doboz saját uv-jét használja — minden cella ugyanaz a csempe');

  // ════════════════════════════════════════════════════════════════════════
  cim('4. AZ ÉPÜLETEK TEXTÚRÁZOTTAK, ÉS VAN ÉRVÉNYES UV-JÜK');
  const epuletek = await lap.evaluate(async () => {
    const P = window.PHT, sim = P.sim, sz = P.szinter;
    sim.penz = 900000;
    // Vegyes sor: más-más felületű típusok egymás mellett. Így egyetlen
    // mérésben benne van a fém, a fa, a csempe, a vakolat és a kristály.
    const bx = sim.kezdoX + 34, by = sim.kezdoY + 2;
    const sor = ['wc', 'bolt', 'konyvesbolt', 'energiamag', 'jegkamra', 'karbantarto'];
    for (let i = 0; i < sor.length; i++) {
      sim.parancs({ fajta: 'epit', tipus: sor[i], x: bx + 1 + i * 4, y: by + 5, z: 0 });
    }
    sim.lep(); sim.lep();

    // Az uv-fedettség: minden típus geometriáján legyen uv, és NE legyen
    // elfajult (min === max azt jelenti, hogy minden csúcs ugyanoda mutat —
    // pontosan az a lapos folt, amit el akarunk kerülni).
    const uvGond = [];
    let uvRendben = 0;
    for (const [kod, b] of P.allomas.tipusMesh) {
      for (const [mit, mesh] of [['test', b.test], ['dísz', b.disz]]) {
        if (!mesh) continue;
        if (!mesh.material.map) continue;
        const uv = mesh.geometry.attributes.uv;
        if (!uv) { uvGond.push(`${kod}/${mit}: nincs uv`); continue; }
        let umin = 1e9, umax = -1e9, vmin = 1e9, vmax = -1e9;
        for (let i = 0; i < uv.count; i++) {
          const u = uv.getX(i), w = uv.getY(i);
          if (u < umin) umin = u; if (u > umax) umax = u;
          if (w < vmin) vmin = w; if (w > vmax) vmax = w;
        }
        if (umax - umin < 0.05 || vmax - vmin < 0.05) uvGond.push(`${kod}/${mit}: elfajult uv`);
        else uvRendben++;
      }
    }
    // Ugyanez a lényeken: 1600 mozgó lény esetén ez a leggyakoribb felejtés.
    let lenyUv = 0, lenyGond = 0;
    for (const [, b] of P.lenyek.fajMesh) {
      for (const mesh of [b.test, b.fej]) {
        if (!mesh.material.map) continue;
        if (mesh.geometry.attributes.uv) lenyUv++; else lenyGond++;
      }
    }

    sz.cel.set(bx + 12, 1.2, by + 5);
    sz.tav = 15; sz.dolt = 1.02; sz.szog = 1.35;
    sz._kamerat();
    P.allomas.frissit(1);

    const anyagok = [];
    for (const [, b] of P.allomas.tipusMesh) {
      for (const mesh of [b.test, b.disz]) if (mesh && mesh.material.map) anyagok.push(mesh.material);
    }
    const terkepek = anyagok.map((a) => a.map);
    const vele = await window.__mertek(() => {
      anyagok.forEach((a, i) => { a.map = terkepek[i]; a.needsUpdate = true; });
    }, 420, 220);
    const nelkule = await window.__mertek(() => {
      anyagok.forEach((a) => { a.map = null; a.needsUpdate = true; });
    }, 420, 220);
    await window.__mertek(() => {
      anyagok.forEach((a, i) => { a.map = terkepek[i]; a.needsUpdate = true; });
    }, 420, 220);
    return { vele, nelkule, uvRendben, uvGond, lenyUv, lenyGond, anyagDb: anyagok.length };
  });
  adat(`textúrázott épület-anyag ${epuletek.anyagDb} · érvényes uv ${epuletek.uvRendben} · lény-mesh uv-val ${epuletek.lenyUv}`);
  adat(`LAPOS  átlag ${epuletek.nelkule.atlag.toFixed(2)} · szórás ${epuletek.nelkule.szoras.toFixed(2)}`);
  adat(`TEXTÚRÁS átlag ${epuletek.vele.atlag.toFixed(2)} · szórás ${epuletek.vele.szoras.toFixed(2)}`);
  if (epuletek.uvGond.length === 0) ok(`mind a ${epuletek.uvRendben} textúrázott épület-mesh érvényes uv-t kapott`);
  else for (const g of epuletek.uvGond.slice(0, 8)) rossz(g);
  if (epuletek.lenyGond === 0 && epuletek.lenyUv > 0) ok(`mind a ${epuletek.lenyUv} textúrázott lény-mesh érvényes uv-t kapott`);
  else rossz(`${epuletek.lenyGond} lény-mesh textúrázott, de uv nélkül`);
  const epArany = epuletek.vele.szoras / Math.max(0.01, epuletek.nelkule.szoras);
  if (epArany >= 1.15) ok(`az épületsor szórása ${epArany.toFixed(2)}× a laposé (küszöb 1,15×)`);
  else rossz(`az épületeken alig látszik a felület: szórás ${epArany.toFixed(2)}×`);
  const epFeny = epuletek.vele.atlag / Math.max(0.01, epuletek.nelkule.atlag);
  if (epFeny > 0.80) ok(`a felületek nem sötétítik el az állomást (×${epFeny.toFixed(3)})`);
  else rossz(`a textúrák ${((1 - epFeny) * 100).toFixed(0)} %-kal sötétebbé tették az épületeket`);

  // ════════════════════════════════════════════════════════════════════════
  cim('5. A PÉLDÁNYOSÍTÁS ÉP: A HÍVÁSSZÁM NEM NŐ AZ ÉPÜLETEKKEL');
  // ⚠️ Ez a vizsgálat a textúra-sáv legfontosabb önkorlátozása. Textúrát adni
  // egy anyagnak ingyen van; textúrát adni egy PÉLDÁNYNAK viszont csak úgy
  // lehet, hogy minden példány saját anyagot (tehát saját rajzolási hívást)
  // kap. A kettő a kódban egy sor különbség, a képernyőn semmi — a hívásszám
  // az egyetlen hely, ahol látszik.
  const hivasok = await lap.evaluate(async (adag) => {
    const P = window.PHT, sim = P.sim;
    const kep = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    sim.penz = 2000000;
    const bx = sim.kezdoX + 34, by = sim.kezdoY + 24;
    sim.parancs({ fajta: 'padlo', x: bx, y: by, sz: 20, m: 16, z: 0 });
    sim.lep();
    await kep();
    const ki = [{ ep: sim.epuletek.filter(Boolean).length, hivas: P.szinter.renderelo.info.render.calls }];
    let n = 0;
    for (let kor = 0; kor < 2; kor++) {
      for (let j = 0; j < adag; j++) {
        const i = n % 9, k = (n / 9) | 0;
        sim.parancs({ fajta: 'epit', tipus: 'wc', x: bx + i * 2, y: by + k * 2, z: 0 });
        n++;
      }
      sim.lep(); sim.lep();
      await kep();
      ki.push({ ep: sim.epuletek.filter(Boolean).length, hivas: P.szinter.renderelo.info.render.calls });
    }
    let anyagDb = 0;
    const latott = new Set();
    P.szinter.jelenet.traverse((o) => { if (o.material && !latott.has(o.material.uuid)) { latott.add(o.material.uuid); anyagDb++; } });
    return { ki, anyagDb, haromszog: P.szinter.renderelo.info.render.triangles };
  }, 32);
  const [h0, h1, h2] = hivasok.ki;
  adat(`${h0.ep} épület → ${h0.hivas} hívás · ${h1.ep} → ${h1.hivas} · ${h2.ep} → ${h2.hivas}`);
  adat(`különböző anyag a jelenetben ${hivasok.anyagDb} · háromszög ${hivasok.haromszog}`);
  if (h2.ep - h1.ep >= 20) ok(`a második adag felépült (+${h2.ep - h1.ep} épület)`);
  else rossz(`nem épült elég épület a méréshez (+${h2.ep - h1.ep})`);
  if (h2.hivas === h1.hivas) ok(`+${h2.ep - h1.ep} azonos típusú, textúrázott épület: ${h1.hivas} → ${h2.hivas} hívás (változatlan)`);
  else rossz(`a hívások száma az ÉPÜLETEK számával nő: ${h1.hivas} → ${h2.hivas}`);
  if (h2.hivas <= 60) ok(`${h2.hivas} rajzolási hívás az egész, textúrázott jelenetre (keret: 60)`);
  else rossz(`${h2.hivas} rajzolási hívás — a textúrázás elrontotta a példányosítást`);

  // ════════════════════════════════════════════════════════════════════════
  cim('6. A TEXTÚRÁK EGYSZER KÉSZÜLNEK');
  // Ha egy `frissit()` textúrát generálna, azt a `three` textúra-számlálója
  // azonnal elárulja. Hatvan képkocka bőven elég: a világ közben JÁR, tehát a
  // padló, az épületek, a lények és a kapuk mind frissülnek.
  const egyszer = await lap.evaluate(async () => {
    const P = window.PHT;
    const elotte = P.szinter.renderelo.info.memory.textures;
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      P.sim.lep();
    }
    return { elotte, utana: P.szinter.renderelo.info.memory.textures };
  });
  adat(`GPU-textúra ${egyszer.elotte} → ${egyszer.utana} hatvan képkocka alatt`);
  if (egyszer.utana === egyszer.elotte) ok('hatvan képkocka alatt egyetlen új textúra sem született');
  else rossz(`${egyszer.utana - egyszer.elotte} textúra keletkezett futás közben — ez képkocka-akadás`);

  // ════════════════════════════════════════════════════════════════════════
  cim('7. KÉPERNYŐKÉPEK');
  // Ugyanaz a forgatókönyv, mint a többi szondánál — pont az a kód rendezze be
  // a csarnokot, amit a determinizmus-kapu is használ.
  await lap.evaluate(async () => {
    const m = await import('/tools/forgatokonyv.mjs');
    const sim = window.PHT.sim;
    const fk = m.v01Uj();
    for (let t = sim.tick; t < 5200; t++) { fk(sim, t); sim.lep(); }
  });
  for (let i = 0; i < 3; i++) { await lap.click('#modal .valasz').catch(() => {}); await varj(200); }

  const kepek = [
    // név, napszak, távolság, dőlés, szög, célpont-eltolás
    ['textura_allomas.png', 0.42, 42, 0.78, 0.95, [12, 8]],
    ['textura_padlo.png', 0.46, 13, 0.30, 0.7, [10, 7]],
    ['textura_epuletek.png', 0.40, 11, 1.05, 1.35, [9, 6]],
    ['textura_kapu.png', 0.08, 12, 1.00, 0.6, [9, 8]],
  ];
  for (const [nevKep, arany, tav, dolt, szog, [ex, ey]] of kepek) {
    await lap.evaluate(({ a, t, d, s, x, y }) => {
      const sz = window.PHT.szinter, sim = window.PHT.sim;
      window.PHT.allomas.szintet(0); window.PHT.lenyek.aktivSzint = 0;
      sz.tav = t; sz.dolt = d; sz.szog = s;
      sz.cel.set(sim.kezdoX + x, 0, sim.kezdoY + y);
      sz._kamerat();
      window.__oratElenged();
      window.__oratAllit(a);
    }, { a: arany, t: tav, d: dolt, s: szog, x: ex, y: ey });
    await lap.keyboard.press('2');
    await varj(800);
    await lap.keyboard.press('1');
    for (let i = 0; i < 2; i++) { await lap.click('#modal .valasz').catch(() => {}); await varj(150); }
    await lap.screenshot({ path: join(GYOKER, 'qa', nevKep) });
  }
  await lap.evaluate(() => window.__oratElenged());
  adat('portal/qa/textura_allomas.png · textura_padlo.png · textura_epuletek.png · textura_kapu.png');
  ok('képek elkészültek (anyagot és színt mutatnak — sebességet NEM)');

  if (hibak.length > 0) {
    cim('KONZOL-HIBÁK');
    for (const h of hibak.slice(0, 10)) rossz(h);
  }

  await bongeszo.close();
} finally {
  kiszolgalotLeallit(kiszolgalo);
}

console.log('');
if (hiba === 0) { console.log('\x1b[42m\x1b[30m  A TEXTÚRÁK OTT VANNAK, ÉS NEM KERÜLTEK SEMMIBE  \x1b[0m\n'); process.exit(0); }
console.log(`\x1b[41m\x1b[37m  ${hiba} HIBA  \x1b[0m\n`);
process.exit(1);
