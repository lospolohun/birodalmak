// PORTAL HUB TYCOON — BELÉPÉSI PONT.
//
// ── MIT CSINÁL EZ A FÁJL ──────────────────────────────────────────────────
// Összeköti a három réteget, és semmi mást. A világ a `sim`-ben van, a kép a
// `render`-ben, a felület az `ui`-ban; itt csak a huzalozás és a hurok lakik.
//
// ── A HUROK FIX LÉPÉSKÖZŰ ─────────────────────────────────────────────────
// A szimuláció 20 Hz-en jár, a rajzolás annyin, amennyit a gép bír. Ez nem
// stílus kérdése: ha a tick a képkockához lenne kötve, akkor a gazdaság
// sebessége a videokártyától függene, és két gépen máshogy telne a nap. A
// maradékidő gyűlik, és annyi tick fut le belőle, amennyi belefér — de
// legfeljebb 40, hogy egy háttérbe tett fül visszatéréskor ne fagyassza le a
// böngészőt egy órányi felhalmozott tickkel („halálspirál").

import './ui/stilus.css';
import { Sim } from './sim/sim.js';
import { TICK_MS, SEBESSEGEK } from './mag/config.js';
import { EPULETEK, epuletTipus } from './sim/epuletek.js';
import { Szinter } from './render/szinter.js';
import { Allomas3d } from './render/allomas3d.js';
import { Lenyek3d } from './render/lenyek3d.js';
import { Hud } from './ui/hud.js';
import { EpitesSav } from './ui/epites.js';
import { Panelek } from './ui/panelek.js';
import { Modalok } from './ui/modalok.js';

// ── SEED ────────────────────────────────────────────────────────────────
// A `?seed=` paraméterrel ugyanaz a világ újrajátszható — ez a hibajelentés
// legfontosabb eszköze. Enélkül a `Date.now()` ad újat; a `Date.now()` itt
// szabad, mert a RENDER oldalon vagyunk: a sim csak a kész számot kapja meg.
const url = new URLSearchParams(location.search);
const seed = (Number(url.get('seed')) | 0) || (Date.now() & 0x7fffffff);
history.replaceState(null, '', `?seed=${seed}`);

const sim = new Sim({ seed });
const vaszon = document.getElementById('vaszon');
const uiGyoker = document.getElementById('ui');

const szinter = new Szinter(vaszon);
const allomas = new Allomas3d(szinter, sim);
const lenyek = new Lenyek3d(szinter, sim);

// A kamera a kezdő kapura néz — az üres rács közepe semmit nem mondana.
szinter.cel.set(sim.kezdoX + 9, 0, sim.kezdoY + 8);
szinter.tav = 32;
szinter._kamerat();

let sebIdx = 1;
const vezerlo = {
  sebesseg(i) { sebIdx = Math.max(0, Math.min(SEBESSEGEK.length - 1, i)); hud.sebessegJeloles(sebIdx); },
  sebessegIdx() { return sebIdx; },
};

const hud = new Hud(uiGyoker, sim, vezerlo);
const epitesSav = new EpitesSav(uiGyoker, sim, hud);
const panelek = new Panelek(uiGyoker, sim, hud);
const modalok = new Modalok(uiGyoker, sim, hud, vezerlo);

// ══════════════════════════════════════════════════════════════════════════
//  BEVITEL
// ══════════════════════════════════════════════════════════════════════════

let huzKezdet = null;   // padló/bontás téglalap kezdőcellája

/** Az aktuális eszköz által elfoglalt terület mérete cellában. */
function eszkozMeret() {
  const e = epitesSav.eszkoz;
  if (e.fajta === 'epit') {
    const t = epuletTipus(e.tipus);
    return t ? { sz: t.sz, m: t.m, magas: t.magas } : { sz: 1, m: 1, magas: 1 };
  }
  return { sz: 1, m: 1, magas: 0.35 };
}

/** A húzott téglalap normalizálva (a húzás bármelyik irányban mehet). */
function huzottTeglalap(cella) {
  const a = huzKezdet, b = cella;
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, sz: Math.abs(a.x - b.x) + 1, m: Math.abs(a.y - b.y) + 1 };
}

function ervenyesE(cella, meret) {
  const e = epitesSav.eszkoz;
  if (e.fajta === 'epit') {
    const t = epuletTipus(e.tipus);
    if (!t) return false;
    if (t.kutatas && !sim.kesz(t.kutatas)) return false;
    if (sim.penz < t.ar) return false;
    return sim.racs.szabadTerulet(cella.x, cella.y, meret.sz, meret.m);
  }
  if (e.fajta === 'padlo') return sim.penz > 0;
  if (e.fajta === 'bont') return sim.racs.vanPadlo(cella.x, cella.y) || sim.racs.epuletAzon(cella.x, cella.y) >= 0;
  return false;
}

vaszon.addEventListener('pointerdown', (ev) => {
  if (ev.button !== 0) return;
  const cella = szinter.egerCella();
  if (!cella) return;
  const e = epitesSav.eszkoz;

  if (e.fajta === 'kez') {
    const azon = sim.racs.epuletAzon(cella.x, cella.y);
    if (azon >= 0) panelek.epuletet(azon);
    else panelek.nyit(null);
    return;
  }
  if (e.fajta === 'padlo' || e.fajta === 'bont') { huzKezdet = cella; return; }
  if (e.fajta === 'epit') {
    const p = { fajta: 'epit', tipus: e.tipus, x: cella.x, y: cella.y };
    if (e.dim) p.dim = e.dim;
    sim.parancs(p);
  }
});

addEventListener('pointerup', (ev) => {
  if (ev.button !== 0 || !huzKezdet) return;
  const cella = szinter.egerCella() || huzKezdet;
  const r = huzottTeglalap(cella);
  const e = epitesSav.eszkoz;
  if (e.fajta === 'padlo') {
    sim.parancs({ fajta: 'padlo', x: r.x, y: r.y, sz: r.sz, m: r.m });
  } else if (e.fajta === 'bont') {
    // A bontás cellánként megy: az épület bárhol elkapható, a padló is.
    // Ez több parancs, de a `bont` szemantikája így marad egyszerű.
    for (let j = 0; j < r.m; j++) {
      for (let i = 0; i < r.sz; i++) sim.parancs({ fajta: 'bont', x: r.x + i, y: r.y + j });
    }
  }
  huzKezdet = null;
});

addEventListener('keydown', (ev) => {
  if (ev.target && /INPUT|TEXTAREA|SELECT/.test(ev.target.tagName)) return;
  if (ev.code === 'Space') { ev.preventDefault(); vezerlo.sebesseg(sebIdx === 0 ? 1 : 0); }
  else if (ev.key >= '1' && ev.key <= '4') vezerlo.sebesseg(Number(ev.key) - 1);
});

// ══════════════════════════════════════════════════════════════════════════
//  HUROK
// ══════════════════════════════════════════════════════════════════════════

let utolsoIdo = performance.now();
let maradek = 0;
let ido = 0;
let elozoValasz = null;
let elozoDimAllapot = '';

function keret(most) {
  requestAnimationFrame(keret);
  const dt = Math.min(0.25, (most - utolsoIdo) / 1000);
  utolsoIdo = most;
  ido += dt;

  szinter.billentyu(dt);

  // ── SZIMULÁCIÓ ────────────────────────────────────────────────────────
  maradek += dt * 1000 * SEBESSEGEK[sebIdx];
  let n = 0;
  while (maradek >= TICK_MS && n < 40) { sim.lep(); maradek -= TICK_MS; n++; }
  if (maradek > TICK_MS * 40) maradek = 0;

  // ── PARANCS-VISSZAJELZÉS ──────────────────────────────────────────────
  // A parancs a tick elején fut le, tehát az elutasítás oka csak UTÁNA
  // olvasható. Ez a néhány sor az, ami miatt a játékos nem azt látja, hogy
  // „nem történt semmi", hanem azt, hogy MIÉRT nem.
  if (sim.utolsoValasz !== elozoValasz) {
    if (sim.utolsoValasz && !sim.utolsoValasz.rendben) hud.uzen(sim.utolsoValasz.ok, 'gond');
    elozoValasz = sim.utolsoValasz;
  }

  // ── ÉPÍTÉSI ELŐNÉZET ──────────────────────────────────────────────────
  const cella = szinter.egerCella();
  const e = epitesSav.eszkoz;
  if (cella && e.fajta !== 'kez') {
    let m = eszkozMeret();
    let hely = cella;
    if (huzKezdet && (e.fajta === 'padlo' || e.fajta === 'bont')) {
      const r = huzottTeglalap(cella);
      hely = { x: r.x, y: r.y }; m = { sz: r.sz, m: r.m, magas: 0.35 };
    }
    allomas.elonezet(hely, m.sz, m.m, m.magas, ervenyesE(hely, m));
  } else {
    allomas.elonezet(null);
  }

  // ── SÚGÓBUBORÉK A KÉZ ESZKÖZNÉL ───────────────────────────────────────
  if (cella && e.fajta === 'kez') {
    const azon = sim.racs.epuletAzon(cella.x, cella.y);
    if (azon >= 0) {
      const ep = sim.epuletek[azon];
      const t = EPULETEK[ep.tipusIdx];
      hud.buborekot(
        `<b>${t.ikon} ${t.nev}</b><br>` +
        `terhelés ${Math.round(ep.hatekonysag * 100)} % · személyzet ${ep.dolgozok.length}/${t.szemelyzet}<br>` +
        (t.igeny ? `sor ${ep.sor.length} · bent ${ep.bent.length}/${t.kapacitas}<br>` : '') +
        `bevétel ${Math.round(ep.bevetel)} 💎`,
        egerX, egerY,
      );
    } else hud.buborekot(null);
  } else if (e.fajta !== 'kez') hud.buborekot(null);

  // ── FELÜLET ───────────────────────────────────────────────────────────
  hud.frissit();
  epitesSav.frissit();
  panelek.frissit(dt);
  modalok.frissit();

  // A „Kapuk" fül tartalma a dimenziók állapotától függ (felfedezés,
  // megnyitás, lezárás). Csak akkor építjük újra, ha tényleg változott —
  // különben minden képkockán DOM-ot cserélnénk a sáv alatt.
  const dimAllapot = sim.dimenziok.map((d) => (d.felfedezve ? 1 : 0) + (d.nyitva ? 2 : 0) + (d.lezarva ? 4 : 0)).join('');
  if (dimAllapot !== elozoDimAllapot) {
    elozoDimAllapot = dimAllapot;
    if (epitesSav.kategoria === 'kapuk') epitesSav.ujraEpit();
  }

  // ── RAJZOLÁS ──────────────────────────────────────────────────────────
  allomas.frissit(ido);
  lenyek.frissit(ido);
  szinter.rajzol();
}

let egerX = 0, egerY = 0;
addEventListener('pointermove', (ev) => { egerX = ev.clientX; egerY = ev.clientY; });

requestAnimationFrame(keret);

// Kényelmi kapaszkodó hibakereséshez: a konzolból elérhető a világ.
// (Csak olvasásra — írni a `parancs()`-on át szabad, mint bárhonnan.)
window.PHT = { sim, szinter, allomas, lenyek, hud, panelek, epitesSav };
console.log(`%cPORTAL HUB TYCOON%c  seed=${seed}`, 'color:#9b6bff;font-weight:700', 'color:#93a0c8');
