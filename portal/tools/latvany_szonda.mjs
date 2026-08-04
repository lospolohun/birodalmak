// PORTAL HUB TYCOON — LÁTVÁNY-SZONDA (v0.7).
//
// ── MIT MÉR ÉS MIT NEM ────────────────────────────────────────────────────
// A böngésző-szonda azt kérdezi, hogy ELINDUL-e a játék. Ez azt, hogy a
// LÁTVÁNYRÉTEG betartja-e a saját ígéreteit — mert azok mind olyanok, amiket
// ránézésre nem lehet ellenőrizni, viszont csendben el tudnak romlani:
//
//   1. nincs konzol-hiba a látvánnyal,
//   2. a rajzolási hívások száma az ÉPÜLETEK számától FÜGGETLEN
//      (a példányosítás bármikor elromolhat egy „csak egy mesh-t adok hozzá"
//      változtatással, és utána semmi nem szól, csak lassul),
//   3. a nappal–éjszaka tényleg VÁLTOZTAT a képen — nemcsak számokat mozgat,
//      hanem a képpontok átlagfényessége is más (ezt olvasott képpontokkal
//      méri, nem hittel),
//   4. a szellemszint tényleg átveszi a fölső emeleteket a szintváltáskor,
//   5. a részecske-keret ZÁRT: túlcsordulás helyett szikrát dob el, és soha
//      nem enged NaN-t a GPU-pufferbe (egyetlen NaN pozíció az EGÉSZ
//      részecskerendszert eltünteti — és semmi nem jelezné).
//
// ⚠️ FPS-T NEM MÉR, ÉS NEM IS FOG. A felhőben nincs GPU: a Chrome szoftveres
// raszterizálóra (SwiftShader) esik, és az ott mért képkocka-szám SEMMIT nem
// jelent. A rajzolási hívások száma, a példányszámok és a képpont-fényesség
// viszont GÉPFÜGGETLEN — ezért csak ilyeneket mérünk. (Lásd a CLAUDE.md
// „Hol dolgozol?" táblázatát.)
//
// ── MIÉRT A FEJLESZTŐI KISZOLGÁLÓ ─────────────────────────────────────────
// Ahogy a `kep.mjs`-nél: a forgatókönyvet és a hatásréteget a lapon BELÜL
// importáljuk, hogy pontosan az a kód fusson, amit írtunk. A `dist/` bundle
// csak azt tartalmazza, amit a `fo.js` behúz.

import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const GYOKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 5276;
const CIM = `http://localhost:${PORT}/?seed=4242`;

let hiba = 0;
const ok = (s) => console.log(`  \x1b[32m✓\x1b[0m ${s}`);
const rossz = (s) => { console.log(`  \x1b[31m✗ ${s}\x1b[0m`); hiba++; };
const megj = (s) => console.log(`  \x1b[33m•\x1b[0m ${s}`);
const adat = (s) => console.log(`    \x1b[90m${s}\x1b[0m`);
const cim = (s) => console.log(`\n\x1b[1m${s}\x1b[0m`);

/**
 * Melyik Chrome-ot indítsuk? (Átvéve a `bongeszo_szonda.mjs`-ből — ott van a
 * hosszabb magyarázat: a playwright saját mappaneve környezetenként más, a
 * `npx playwright install` pedig több gépen egyenesen elbukik.)
 */
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
 * állítja meg; a vite GYEREKFOLYAMATA életben marad és megtartja a portot, a
 * következő futás pedig `--strictPort` mögül a MÁR FUTÓ, elavult kiszolgálót
 * kapja — vagyis zöld szonda a régi kódra. A `detached` + `process.kill(-pid)`
 * az egész csoportot leviszi.
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

  // ── A HMR-T KI KELL LŐNI ────────────────────────────────────────────────
  // ⚠️ EZ EGY VALÓDI, MEGTALÁLT PROBLÉMA. A fejlesztői kiszolgáló él: ha
  // BÁRKI ment egy forrásfájlt a mérés alatt, a vite kliense újratölti a
  // lapot — és onnantól a szonda egy FRISS, üres világot mér, miközben az
  // előző mérések számai már megvannak. A jelentés így önmagában ellentmondó
  // lesz, és semmi nem szól róla. (Párhuzamos munkában ez percenként
  // megtörténik, de egy sima szerkesztő-mentés is elég hozzá.)
  //
  // A kliens `new WebSocket(url, 'vite-hmr')`-rel csatlakozik; itt egy néma
  // álobjektumot kap helyette. A modulbetöltés (`import()`) HTTP-n megy,
  // tehát az továbbra is működik — csak az élő újratöltés áll le.
  await lap.addInitScript(() => {
    const Eredeti = window.WebSocket;
    window.WebSocket = function (cim, protokoll) {
      const p = Array.isArray(protokoll) ? protokoll.join(',') : String(protokoll || '');
      if (p.includes('vite') || String(cim).includes('vite')) {
        return { readyState: 3, addEventListener() {}, removeEventListener() {}, send() {}, close() {} };
      }
      return new Eredeti(cim, protokoll);
    };
    window.WebSocket.prototype = Eredeti.prototype;
  });

  // ════════════════════════════════════════════════════════════════════════
  cim('0. INDULÁS ÉS A LÁTVÁNYRÉTEG BEKÖTÉSE');
  await lap.goto(CIM, { waitUntil: 'networkidle' });
  await varj(2000);
  await lap.click('#modal .valasz').catch(() => {});
  await varj(400);

  // A hatásréteg akkor is mérhető, ha a `fo.js` még nem kötötte be: ilyenkor
  // a szonda maga hozza létre és maga hajtja. A KÜLÖNBSÉGET kiírjuk, mert az
  // egyik esetben a JÁTÉKOT mérjük, a másikban csak a MODULT.
  const bekotes = await lap.evaluate(async () => {
    const P = window.PHT;
    const jel = { hatasokBekotve: !!P.hatasok, napszakBekotve: false };
    if (!P.hatasok) {
      const m = await import('/src/render/hatasok3d.js');
      P.hatasok = new m.Hatasok3d(P.szinter, P.sim);
      let elozo = performance.now();
      const hurok = (most) => {
        requestAnimationFrame(hurok);
        const dt = (most - elozo) / 1000; elozo = most;
        P.hatasok.frissit(most / 1000, dt);
      };
      requestAnimationFrame(hurok);
      P.szondaHajtja = true;
    }
    return jel;
  });
  ok('a hatásréteg fut');
  if (bekotes.hatasokBekotve) ok('a `fo.js` maga köti be a Hatasok3d-t');
  else megj('a `fo.js` MÉG NEM köti be a Hatasok3d-t — a szonda hajtja (lásd a jelentést)');

  // A napszakot a hurok hajtja-e? Léptetjük a világot egy fél nappal, és
  // megnézzük, elmozdul-e magától a napszak.
  const auto = await lap.evaluate(async () => {
    const P = window.PHT;
    const elotte = P.szinter.napszakArany;
    for (let i = 0; i < 620; i++) P.sim.lep();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return { elotte, utana: P.szinter.napszakArany };
  });
  if (Math.abs(auto.utana - auto.elotte) > 0.01) { ok('a napszakot a hurok hajtja'); bekotes.napszakBekotve = true; }
  else megj('a `fo.js` MÉG NEM hívja a `szinter.napszak(sim.tick)`-et — a szonda hajtja');

  // Innentől szüneteltetve mérünk: a mozgó világ minden számot elmosna.
  // Az „1" a legkisebb sebesség (=0), a „2" az alap — a `fo.js` billentyűi.
  await lap.keyboard.press('1');
  await varj(200);

  // ── KÉPPONT-MÉRŐ ────────────────────────────────────────────────────────
  // A látványnál a legkönnyebb hazugság az, hogy „létezik az objektum, tehát
  // látszik". Nem következik: rossz sorrend, nulla méret, takarás, elrontott
  // anyag — mind úgy néz ki a JavaScript felől, mintha rendben lenne. Ezért a
  // fontos állításokat KÉPPONTBÓL igazoljuk: lerajzoljuk a jelenetet a
  // vizsgált réteggel és nélküle, és összevetjük a fényességet.
  //
  // A `readPixels` csak UGYANABBAN a képkockában olvasható ki, közvetlenül a
  // `rajzol()` után — nincs `preserveDrawingBuffer`.
  await lap.evaluate(() => {
    const sz = window.PHT.szinter;
    const fenyesseg = (w, h, eltolY) => {
      const gl = sz.renderelo.getContext();
      const x = Math.max(0, ((gl.drawingBufferWidth - w) / 2) | 0);
      const y = Math.max(0, (((gl.drawingBufferHeight - h) / 2) + (eltolY || 0)) | 0);
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let s = 0;
      for (let i = 0; i < px.length; i += 4) s += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
      return s / (w * h);
    };
    /** Egy képkocka: `elokeszit()` fut, rajzolunk, és MÉRÜNK. */
    window.__mer = (elokeszit, w = 200, h = 150, eltolY = 0) => new Promise((r) => requestAnimationFrame(() => {
      if (elokeszit) elokeszit();
      sz.rajzol();
      r(fenyesseg(w, h, eltolY));
    }));
  });

  // ════════════════════════════════════════════════════════════════════════
  cim('1. NINCS KONZOL-HIBA A LÁTVÁNNYAL');
  if (hibak.length === 0) ok('tiszta konzol az indulás és a bekötés után');
  else for (const h of hibak.slice(0, 6)) rossz(h);

  // ════════════════════════════════════════════════════════════════════════
  cim('2. A RAJZOLÁSI HÍVÁS NEM NŐ AZ ÉPÜLETEK SZÁMÁVAL');
  // ⚠️ A pénzt közvetlenül írjuk. Ez MÉRŐÁLLVÁNY, nem játékmenet: a
  // példányosítást csak sok épülettel lehet megfogni, kigazdálkodni pedig
  // több ezer tickig tartana — és akkor nem ezt mérnénk, hanem a gazdaságot.
  const mertek = await lap.evaluate(async (adag) => {
    const P = window.PHT, sim = P.sim;
    const kep = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    const hivas = () => P.szinter.renderelo.info.render.calls;
    sim.penz = 900000;

    // Külön padlómező a tömeges építéshez — a kezdő csarnok tele van.
    const bx = sim.kezdoX + 24, by = sim.kezdoY;
    sim.parancs({ fajta: 'padlo', x: bx, y: by, sz: 22, m: 16, z: 0 });
    sim.lep();

    const eredmeny = [];
    await kep();
    eredmeny.push({ ep: sim.epuletek.filter(Boolean).length, hivas: hivas() });

    let n = 0;
    for (let kor = 0; kor < 2; kor++) {
      for (let j = 0; j < adag && n < adag * 2; j++) {
        const i = n % 8, k = (n / 8) | 0;
        sim.parancs({ fajta: 'epit', tipus: 'wc', x: bx + i * 2, y: by + k * 2, z: 0 });
        n++;
      }
      sim.lep(); sim.lep();
      await kep();
      eredmeny.push({ ep: sim.epuletek.filter(Boolean).length, hivas: hivas() });
    }
    let lenyDb = 0;
    for (const b of P.lenyek.fajMesh.values()) lenyDb += b.test.count;
    return { eredmeny, lenyDb, utas: sim.utasSzam, haromszog: P.szinter.renderelo.info.render.triangles };
  }, 32);
  const [m0, m1, m2] = mertek.eredmeny;
  adat(`${m0.ep} épület → ${m0.hivas} hívás · ${m1.ep} épület → ${m1.hivas} hívás · ${m2.ep} épület → ${m2.hivas} hívás`);
  adat(`rajzolt lény ${mertek.lenyDb} · utas ${mertek.utas} · háromszög ${mertek.haromszog}`);
  if (m2.ep - m1.ep >= 20) ok(`a második adag is felépült (+${m2.ep - m1.ep} épület)`);
  else rossz(`nem épült elég épület a méréshez (+${m2.ep - m1.ep})`);
  // A LÉNYEG: az azonos típusú második adag EGYETLEN hívást sem adhat hozzá.
  if (m2.hivas === m1.hivas) ok(`+${m2.ep - m1.ep} azonos típusú épület: ${m1.hivas} → ${m2.hivas} hívás (változatlan)`);
  else rossz(`a hívások száma az ÉPÜLETEK számával nő: ${m1.hivas} → ${m2.hivas}`);
  // Az első adag hozhat új TÍPUST (test + dísz + szellem = legfeljebb 3).
  if (m1.hivas - m0.hivas <= 3) ok(`az első adag legfeljebb a típus árát fizette (+${m1.hivas - m0.hivas})`);
  else rossz(`az első adag ${m1.hivas - m0.hivas} hívást adott hozzá — ez nem típus-alapú`);

  // ════════════════════════════════════════════════════════════════════════
  cim('3. A NAPPAL–ÉJSZAKA TÉNYLEG VÁLTOZTAT');
  const merve = await lap.evaluate(async () => {
    const P = window.PHT, sz = P.szinter;
    const NAP_TICK = 1200;   // TICK_HZ * 60 — a config-beli érték
    const ki = [];
    for (const a of [0.0, 0.27, 0.5, 0.74, 0.86]) {
      const keppont = await window.__mer(() => sz.napszak(a * NAP_TICK));
      ki.push({
        arany: sz.napszakArany,
        napEro: sz.nap.intensity,
        napSzin: sz.nap.color.getHexString(),
        napY: sz.nap.position.y,
        kod: sz.jelenet.fog.color.getHexString(),
        egAlso: sz.egAnyag.uniforms.also.value.getHexString(),
        felgomb: sz.egiFeny.intensity,
        allomasFeny: sz.allomasFeny.intensity,
        csillag: sz.csillagok.material.opacity,
        keppont,
      });
    }
    // A csillagok tényleg RAJZOLÓDNAK-e? Éjfélkor az égboltra nézünk, a
    // csillagmezővel és nélküle. Ha a két szám ugyanaz, akkor a csillag
    // „létezik", de nem látszik — és a napszak fele elveszett.
    //
    // ⚠️ A KAMERÁT MEG KELL DÖNTENI. A játék alapállása majdnem felülnézet
    // (`dolt = 0,30`), ott a képen EGYÁLTALÁN nincs égbolt — a szonda első
    // változata emiatt mérte ugyanazt a két számot, és jogosan bukott meg.
    const kam = { tav: sz.tav, dolt: sz.dolt, szog: sz.szog };
    sz.dolt = 1.30; sz.tav = 40; sz._kamerat();
    sz.napszak(0);
    // A minta a képernyő FELSŐ HARMADA, teljes szélességben: egy szűk sávban
    // csak egy-két csillag lenne, és a mérés a saját zajában fulladna meg.
    const egVan = await window.__mer(() => { sz.csillagok.visible = true; }, 1200, 280, 260);
    const egNincs = await window.__mer(() => { sz.csillagok.visible = false; }, 1200, 280, 260);
    sz.csillagok.visible = true;
    sz.tav = kam.tav; sz.dolt = kam.dolt; sz.szog = kam.szog; sz._kamerat();
    return { napszakok: ki, egVan, egNincs };
  });
  const napszakok = merve.napszakok;
  const nev = ['éjfél ', 'hajnal', 'dél   ', 'alkony', 'este  '];
  for (let i = 0; i < napszakok.length; i++) {
    const n = napszakok[i];
    adat(`${nev[i]} nap ${n.napEro.toFixed(2)} #${n.napSzin} · félgömb ${n.felgomb.toFixed(2)} · köd #${n.kod} · ég #${n.egAlso} · csillag ${n.csillag.toFixed(2)} · állomásfény ${n.allomasFeny.toFixed(2)} · KÉPPONT ${n.keppont.toFixed(1)}`);
  }
  const ejjel = napszakok[0], del = napszakok[2];
  if (Math.abs(del.napEro - ejjel.napEro) > 0.5) ok(`a nap ereje ${ejjel.napEro.toFixed(2)} → ${del.napEro.toFixed(2)}`);
  else rossz(`a nap ereje alig változik (${ejjel.napEro} → ${del.napEro})`);
  if (del.kod !== ejjel.kod && del.egAlso !== ejjel.egAlso) ok(`a köd és az ég színe más (#${ejjel.egAlso} → #${del.egAlso})`);
  else rossz('az ég vagy a köd színe nem változik a napszakkal');
  if (ejjel.csillag > 0.5 && del.csillag < 0.05) ok(`a csillagok éjjel látszanak, nappal nem (${ejjel.csillag.toFixed(2)} → ${del.csillag.toFixed(2)})`);
  else rossz(`a csillagok nem követik a napszakot (${ejjel.csillag} → ${del.csillag})`);
  if (ejjel.allomasFeny > 0.5 && del.allomasFeny < 0.2) ok('éjjel ég az állomás saját világítása, nappal nem');
  else rossz(`az állomásfény nem kapcsol (${ejjel.allomasFeny} → ${del.allomasFeny})`);
  if (Math.abs(del.napY - ejjel.napY) > 10) ok(`a nap pályája mozog (y ${ejjel.napY.toFixed(1)} → ${del.napY.toFixed(1)})`);
  else rossz('a nap nem mozdul el az égen');
  // A KEMÉNY vizsgálat: a KÉP is más lett, nemcsak a számok.
  const kulonbseg = Math.abs(del.keppont - ejjel.keppont) / Math.max(1, ejjel.keppont);
  if (kulonbseg > 0.15) ok(`a képpont-fényesség ${ejjel.keppont.toFixed(1)} → ${del.keppont.toFixed(1)} (${(kulonbseg * 100).toFixed(0)} % eltérés)`);
  else rossz(`a KÉP alig változik: ${ejjel.keppont.toFixed(1)} → ${del.keppont.toFixed(1)} (${(kulonbseg * 100).toFixed(0)} %)`);
  if (merve.egVan > merve.egNincs + 0.2) ok(`a csillagmező tényleg rajzolódik (ég ${merve.egNincs.toFixed(2)} → ${merve.egVan.toFixed(2)})`);
  else rossz(`a csillagok nem látszanak a képen (${merve.egNincs.toFixed(2)} → ${merve.egVan.toFixed(2)})`);

  // ════════════════════════════════════════════════════════════════════════
  cim('4. SZELLEMSZINT: AZ ÁTTETSZŐ FÖLSŐ EMELETEK');
  const szintek = await lap.evaluate(async () => {
    const P = window.PHT, sim = P.sim;
    const kep = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    const allapot = () => {
      let szellem = 0, szilard = 0;
      for (const b of P.allomas.tipusMesh.values()) { szellem += b.szellem.count; szilard += b.test.count; }
      return {
        padlo: P.allomas.padlo.count,
        padloSzellem: P.allomas.padloSzellem.count,
        epSzellem: szellem,
        epSzilard: szilard,
        lenySzellem: P.lenyek.szellemMesh.count,
      };
    };
    const szintre = async (z) => { P.allomas.szintet(z); P.lenyek.aktivSzint = z; await kep(); return allapot(); };

    sim.penz = 900000;
    // Emeleti padló a kezdő csarnok fölé (csak alátámasztás fölé lehet),
    // rajta néhány épület — enélkül nincs mit szellemként mutatni.
    sim.parancs({ fajta: 'padlo', x: sim.kezdoX, y: sim.kezdoY, sz: 20, m: 14, z: 1 });
    sim.lep(); sim.lep();
    for (let i = 0; i < 6; i++) sim.parancs({ fajta: 'epit', tipus: 'wc', x: sim.kezdoX + 2 + i * 3, y: sim.kezdoY + 2, z: 1 });
    sim.lep(); sim.lep();

    const anyag = [...P.allomas.tipusMesh.values()][0].szellem.material;
    return {
      alul: await szintre(0),
      felul: await szintre(1),
      vissza: await szintre(0),
      anyag: { atlatszo: anyag.transparent, melyseg: anyag.depthWrite, attetszoseg: anyag.opacity },
      padloAnyag: {
        atlatszo: P.allomas.padloSzellem.material.transparent,
        melyseg: P.allomas.padloSzellem.material.depthWrite,
      },
      lenyAnyag: {
        atlatszo: P.lenyek.szellemMesh.material.transparent,
        melyseg: P.lenyek.szellemMesh.material.depthWrite,
      },
    };
  });
  adat(`aktív szint 0 → padló ${szintek.alul.padlo} szilárd + ${szintek.alul.padloSzellem} szellem · épület ${szintek.alul.epSzilard} + ${szintek.alul.epSzellem}`);
  adat(`aktív szint 1 → padló ${szintek.felul.padlo} szilárd + ${szintek.felul.padloSzellem} szellem · épület ${szintek.felul.epSzilard} + ${szintek.felul.epSzellem}`);
  if (szintek.alul.padloSzellem > 100) ok(`a földszintről látszik a fölső padló (${szintek.alul.padloSzellem} szellemcella)`);
  else rossz(`a fölső padló nem jelenik meg szellemként (${szintek.alul.padloSzellem} cella)`);
  if (szintek.alul.epSzellem >= 6) ok(`a fölső épületek is látszanak (${szintek.alul.epSzellem} szellempéldány)`);
  else rossz(`a fölső épületek nem látszanak szellemként (${szintek.alul.epSzellem})`);
  if (szintek.felul.padloSzellem === 0 && szintek.felul.epSzellem === 0) ok('a legfölső szinten állva nincs szellemréteg');
  else rossz(`a legfölső szinten is maradt szellem (${szintek.felul.padloSzellem} padló, ${szintek.felul.epSzellem} épület)`);
  if (szintek.felul.padlo > szintek.alul.padlo && szintek.felul.epSzilard > szintek.alul.epSzilard) {
    ok(`fölmenve a szellem SZILÁRDDÁ vált (padló ${szintek.alul.padlo} → ${szintek.felul.padlo})`);
  } else rossz('a szintváltás nem tette szilárddá a fölső szintet');
  if (szintek.vissza.padloSzellem === szintek.alul.padloSzellem && szintek.vissza.padlo === szintek.alul.padlo) {
    ok('a visszaváltás pontosan visszaadja az előző állapotot');
  } else rossz('a szintváltás nem megfordítható');
  const a = szintek.anyag;
  if (a.atlatszo && a.melyseg === false) ok(`a szellemanyag áttetsző és NEM ír mélységet (opacity ${a.attetszoseg})`);
  else rossz(`a szellemanyag rossz: transparent=${a.atlatszo}, depthWrite=${a.melyseg}`);
  if (szintek.padloAnyag.melyseg === false && szintek.lenyAnyag.melyseg === false) ok('a szellempadló és a szellemtömeg sem ír mélységet (nincs villogás)');
  else rossz('valamelyik szellemréteg mélységet ír — villogni fog');

  // ════════════════════════════════════════════════════════════════════════
  cim('4/b. KIJELÖLÉS-KIEMELÉS');
  const kiemeles = await lap.evaluate(async () => {
    const P = window.PHT, sim = P.sim;
    // Egy földszinti, nem-portál épületre mutatunk — arra, amire a „kéz"
    // eszköz is mutatna.
    let azon = -1;
    for (const ep of sim.epuletek) {
      if (ep && ep.z === 0 && ep.kod !== 'portal') { azon = ep.azon; break; }
    }
    const ep = sim.epuletek[azon];
    // A kamerát a kiemelt épületre visszük, hogy a képpont-mérés lássa is.
    P.szinter.cel.set(ep.x + 1, 0, ep.y + 1);
    P.szinter.tav = 16; P.szinter.dolt = 0.9;
    P.szinter._kamerat();
    // ⚠️ A `kiemel()` csak SZÁNDÉKOT rögzít; a gyűrűt az `allomas.frissit()`
    // helyezi el. A mérés a saját rAF-jában rajzol, ami megelőzheti a játék
    // hurkát — ezért itt magunk futtatjuk a rétegfrissítést, különben egy
    // képkockányi késést mérnénk hibának.
    const rajzKesz = () => P.allomas.frissit(performance.now() / 1000);
    const nelkule = await window.__mer(() => { P.allomas.kiemel(-1); rajzKesz(); }, 260, 200);
    const vele = await window.__mer(() => { P.allomas.kiemel(azon); rajzKesz(); }, 260, 200);
    const k = P.allomas.kiemeles;
    const allapot = {
      azon,
      lathato: k.visible,
      x: k.position.x, z: k.position.z,
      celX: ep.x + ep.sz * 0.5, celZ: ep.y + ep.m * 0.5,
      nelkule, vele,
    };
    // …és a kikapcsolás tényleg eltünteti-e
    await window.__mer(() => { P.allomas.kiemel(-1); rajzKesz(); });
    allapot.utanaLathato = k.visible;
    // Ismeretlen azonosító ne dobjon hibát, és ne is villantson.
    await window.__mer(() => { P.allomas.kiemel(99999); rajzKesz(); });
    allapot.ismeretlenLathato = k.visible;
    P.allomas.kiemel(azon);
    return allapot;
  });
  adat(`kiemelt épület ${kiemeles.azon} · gyűrű (${kiemeles.x.toFixed(1)}, ${kiemeles.z.toFixed(1)}) · épület közepe (${kiemeles.celX.toFixed(1)}, ${kiemeles.celZ.toFixed(1)})`);
  adat(`képpont kiemelés nélkül ${kiemeles.nelkule.toFixed(2)} · kiemeléssel ${kiemeles.vele.toFixed(2)}`);
  if (kiemeles.lathato) ok('a `kiemel(azon)` megjeleníti a gyűrűt');
  else rossz('a `kiemel(azon)` nem jelenít meg semmit');
  if (Math.abs(kiemeles.x - kiemeles.celX) < 0.01 && Math.abs(kiemeles.z - kiemeles.celZ) < 0.01) ok('a gyűrű pontosan az épület közepén ül');
  else rossz('a gyűrű nem az épületnél van');
  if (kiemeles.vele > kiemeles.nelkule + 0.2) ok('a kiemelés a KÉPEN is látszik');
  else rossz(`a kiemelés nem változtat a képen (${kiemeles.nelkule.toFixed(2)} → ${kiemeles.vele.toFixed(2)})`);
  if (!kiemeles.utanaLathato) ok('a `kiemel(-1)` eltünteti');
  else rossz('a kiemelés nem kapcsolható ki');
  if (!kiemeles.ismeretlenLathato) ok('ismeretlen azonosítóra némán elrejtőzik (nem dob hibát)');
  else rossz('ismeretlen azonosítóra is kiemel valamit');

  // ════════════════════════════════════════════════════════════════════════
  cim('5. RÉSZECSKE-KERET ÉS NaN-VÉDELEM');
  const reszecskek = await lap.evaluate(async () => {
    const P = window.PHT, sim = P.sim, h = P.hatasok;
    const kep = (n = 1) => new Promise((r) => {
      let i = 0;
      const l = () => (++i >= n ? r() : requestAnimationFrame(l));
      requestAnimationFrame(l);
    });

    // ⚠️ MÉRŐÁLLVÁNY: az utasokat közvetlenül keltjük életre a sim SAJÁT
    // érkeztetőjével. A kapuk természetes üteme több tízezer tick lenne, és
    // akkor nem a részecskekeretet mérnénk, hanem a gazdaságot.
    let portal = null, dim = null;
    for (const ep of sim.epuletek) {
      if (ep && ep.kod === 'portal' && ep.dimenzio >= 0) { portal = ep; dim = sim.dimenziok[ep.dimenzio]; break; }
    }
    if (portal) for (let i = 0; i < 1400; i++) sim._utastErkeztet(portal, dim);
    sim.lep();
    await kep(3);

    // A kamera a csarnokra néz, hogy a képpont-mérés (lentebb) lássa is a
    // szikrákat — a keret-vizsgálat számai enélkül is jók lennének, de a
    // „látszik-e" kérdésre csak innen lehet válaszolni.
    P.szinter.tav = 40; P.szinter.dolt = 0.8; P.szinter.szog = 0.95;
    P.szinter.cel.set(sim.kezdoX + 11, 0, sim.kezdoY + 8);
    P.szinter._kamerat();

    // Erőltetett túlcsordulás: ötezer szikra egy keretbe, ami 1800-at bír.
    h._kvota = 999999;
    let sikeres = 0;
    for (let i = 0; i < 5000; i++) {
      if (h.szikra(sim.kezdoX + (i % 22), 1.5 + (i % 5) * 0.5, sim.kezdoY + (i % 16), 0, 0.4, 0, 0xffffff, 0.4, 4)) sikeres++;
    }
    const teleDb = h.db;
    // …és NaN-mérgezés: a védelemnek a HATÁRON kell megfognia.
    const nanElutasitva = !h.szikra(NaN, 2, 5, 0, 1, 0, 0xffffff, 0.3, 1)
      && !h.szikra(5, Infinity, 5, 0, 1, 0, 0xffffff, 0.3, 1);

    await kep(6);
    let rosszSzam = 0;
    for (let i = 0; i < h.db * 3; i++) if (!Number.isFinite(h.poz[i])) rosszSzam++;
    for (let i = 0; i < h.db; i++) {
      if (!Number.isFinite(h.meret[i]) || !Number.isFinite(h.alfa[i])) rosszSzam++;
    }
    // …és LÁTSZIK-e egyáltalán? A szikrák additívak, tehát a bekapcsolt
    // részecskerétegnek fényesíteni kell a képet. Enélkül a fenti számok csak
    // annyit bizonyítanának, hogy a memória rendben van.
    const nelkule = await window.__mer(() => { h.pontok.visible = false; }, 300, 220);
    const vele = await window.__mer(() => { h.pontok.visible = true; }, 300, 220);

    return {
      utas: sim.utasSzam,
      lenySzellem: P.lenyek.szellemMesh.count,
      keret: h.keret,
      teleDb,
      sikeres,
      eldobott: h.eldobott,
      nanElutasitva,
      rosszSzam,
      elo: h.db,
      rajzSav: h.geometria.drawRange.count,
      hivas: P.szinter.renderelo.info.render.calls,
      nelkule, vele,
    };
  });
  adat(`utas ${reszecskek.utas} · keret ${reszecskek.keret} · 5000 kérésből ${reszecskek.sikeres} született, ${reszecskek.eldobott} eldobva`);
  adat(`élő szikra ${reszecskek.elo} · rajzolási sáv ${reszecskek.rajzSav} · rajzolási hívás ${reszecskek.hivas}`);
  if (reszecskek.utas >= 1000) ok(`${reszecskek.utas} utas az állomáson`);
  else rossz(`nem sikerült 1000 utast előállítani (${reszecskek.utas})`);
  if (reszecskek.teleDb <= reszecskek.keret) ok(`a keret ZÁRT: ${reszecskek.teleDb} ≤ ${reszecskek.keret}`);
  else rossz(`a keret TÚLCSORDULT: ${reszecskek.teleDb} > ${reszecskek.keret}`);
  if (reszecskek.eldobott > 0) ok(`a fölös szikra eldobódik, nem foglal újra (${reszecskek.eldobott} db)`);
  else rossz('a túlcsordulást nem sikerült kiváltani — a mérés nem bizonyít semmit');
  if (reszecskek.nanElutasitva) ok('a NaN/Infinity pozíciót a határon elutasítja');
  else rossz('NaN pozíciót be lehetett tenni a pufferbe');
  if (reszecskek.rosszSzam === 0) ok('egyetlen NaN sincs az élő szikrák pozícióiban');
  else rossz(`${reszecskek.rosszSzam} nem-véges érték a részecskepufferben`);
  if (reszecskek.rajzSav === reszecskek.elo) ok('a rajzolási sáv pontosan az élő szikrákra szűkül');
  else rossz(`a rajzolási sáv (${reszecskek.rajzSav}) nem egyezik az élő szikrákkal (${reszecskek.elo})`);
  if (reszecskek.hivas < 140) ok(`${reszecskek.hivas} rajzolási hívás 1000+ lénnyel és teli részecskekerettel`);
  else rossz(`${reszecskek.hivas} rajzolási hívás — túl sok`);
  adat(`képpont szikra nélkül ${reszecskek.nelkule.toFixed(2)} · szikrával ${reszecskek.vele.toFixed(2)}`);
  if (reszecskek.vele > reszecskek.nelkule + 0.5) ok('a szikrák a KÉPEN is ott vannak');
  else rossz(`a részecskeréteg nem látszik a képen (${reszecskek.nelkule.toFixed(2)} → ${reszecskek.vele.toFixed(2)})`);

  // ════════════════════════════════════════════════════════════════════════
  cim('6. KÉPERNYŐKÉP A LÁTVÁNYRÓL');
  // Szüneteltetve fényképezünk, és a modálokat elengedjük — egy fölugró
  // fejezet-ablak elhomályosítja a vásznat, és pont azt takarja el, amiért a
  // kép készül. (Ez a szonda első változatában megtörtént.)
  // Egy félkész állomásról nem lehet megítélni a látványt, ezért ugyanazt a
  // forgatókönyvet játsszuk le, amit a `kep.mjs` és a determinizmus-szonda —
  // pont az a kód rendezze be a csarnokot, amit a többi mérés is használ.
  await lap.evaluate(async () => {
    const m = await import('/tools/forgatokonyv.mjs');
    const sim = window.PHT.sim;
    const fk = m.v01Uj();
    for (let t = sim.tick; t < 7000; t++) { fk(sim, t); sim.lep(); }
  });
  await lap.click('#modal .valasz').catch(() => {});
  await varj(300);
  await lap.click('#modal .valasz').catch(() => {});
  await varj(300);
  await lap.evaluate(() => {
    const sz = window.PHT.szinter;
    window.PHT.allomas.szintet(0); window.PHT.lenyek.aktivSzint = 0;
    sz.tav = 44; sz.dolt = 0.8; sz.szog = 0.95;
    sz.cel.set(window.PHT.sim.kezdoX + 12, 0, window.PHT.sim.kezdoY + 8);
    sz._kamerat();
  });
  // A világ MENJEN a képek alatt: az érkezés- és kiszolgálás-jelek csak élő
  // forgalomban születnek, és pont azokat kell látni.
  const kepek = [
    ['latvany_nappal.png', 0.42, 44, 0.80],
    ['latvany_ejjel.png', 0.00, 44, 0.80],
    ['latvany_alkony.png', 0.755, 44, 0.80],
    ['latvany_kozeli.png', 0.10, 15, 1.02],
  ];
  for (const [nevKep, arany, tav, dolt] of kepek) {
    // A napszakot minden képkockában visszaírjuk, mert ha a `fo.js` már
    // bekötötte, a hurok azonnal felülírná a beállított értéket.
    await lap.evaluate(({ a, t, d }) => {
      const sz = window.PHT.szinter;
      sz.tav = t; sz.dolt = d;
      sz.cel.set(window.PHT.sim.kezdoX + (t < 20 ? 6 : 12), 0, window.PHT.sim.kezdoY + (t < 20 ? 5 : 8));
      sz._kamerat();
      if (window.PHT._szondaNapszak) cancelAnimationFrame(window.PHT._szondaNapszak);
      const l = () => { sz.napszak(a * 1200); window.PHT._szondaNapszak = requestAnimationFrame(l); };
      l();
    }, { a: arany, t: tav, d: dolt });
    // Futunk egy keveset (kellenek az élő szikrák), majd MEGÁLLUNK és
    // elengedjük a modálokat. Egy fölugró fejezet-ablak elhomályosítja a
    // vásznat, és pont azt takarja el, amiért a kép készül — a szonda első
    // változatában így lett a „nappali" kép egy elmosott sötét folt.
    await lap.keyboard.press('2');
    await varj(1400);
    await lap.keyboard.press('1');
    for (let i = 0; i < 3; i++) { await lap.click('#modal .valasz').catch(() => {}); await varj(160); }
    await lap.screenshot({ path: join(GYOKER, 'qa', nevKep) });
  }
  adat('portal/qa/latvany_nappal.png · latvany_ejjel.png · latvany_alkony.png · latvany_kozeli.png');
  ok('képek elkészültek (geometriát és színt mutatnak — sebességet NEM)');

  if (hibak.length > 0) {
    cim('KONZOL-HIBÁK');
    for (const h of hibak.slice(0, 10)) rossz(h);
  }

  await bongeszo.close();

  if (!bekotes.hatasokBekotve || !bekotes.napszakBekotve) {
    cim('BEKÖTÉS-JELENTÉS (nem hiba — a `fo.js` nem ennek a sávnak a fájlja)');
    if (!bekotes.hatasokBekotve) megj('hiányzik: `const hatasok = new Hatasok3d(szinter, sim);` + `hatasok.frissit(ido, dt);`');
    if (!bekotes.napszakBekotve) megj('hiányzik: `szinter.napszak(sim.tick);` a rajzolás előtt');
  }
} finally {
  kiszolgalotLeallit(kiszolgalo);
}

console.log('');
if (hiba === 0) { console.log('\x1b[42m\x1b[30m  A LÁTVÁNYRÉTEG ÁLLJA AZ ÍGÉRETEIT  \x1b[0m\n'); process.exit(0); }
console.log(`\x1b[41m\x1b[37m  ${hiba} HIBA  \x1b[0m\n`);
process.exit(1);
