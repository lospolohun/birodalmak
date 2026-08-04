// PORTAL HUB TYCOON — MENTÉSEK TÁROLÁSA A BÖNGÉSZŐBEN.
//
// ── MIÉRT KÜLÖN RÉTEG ─────────────────────────────────────────────────────
// A `sim/mentes.js` azt tudja, MI a mentés; ez a fájl azt, HOVA kerül. A
// kettő szétválasztása nem elvi finomkodás: a `sim/` alatt tilos a
// `localStorage` (a determinizmus-szonda ki is szűrné), és így a mentés
// később fájlba, felhőbe vagy szerverre is mehet anélkül, hogy a
// szimulációhoz hozzá kellene nyúlni.
//
// ── MIÉRT VAN AUTOMATA MENTÉS ─────────────────────────────────────────────
// Egy tycoonban a játszás hosszú, és a böngészőfül bezárása egy pillanat. Az
// automata mentés nem kényelmi funkció, hanem az, ami miatt a játékos mer
// belekezdeni egy hosszú partiba.
//
// ── A KVÓTA VALÓDI KORLÁT ─────────────────────────────────────────────────
// A `localStorage` néhány megabájt, és ha megtelik, a `setItem` KIVÉTELT dob.
// Ha ezt nem kapnánk el, egy megtelt tároló a játék közepén dobna hibát, és a
// játékos azt látná, hogy „lefagyott". Ezért minden írás védve van, és
// megtelt tárolónál a legrégebbi automata mentés esik ki először.

import { mentesKeszit, mentesEllenoriz } from '../sim/mentes.js';

const ELOTAG = 'pht:';
const AUTO = ELOTAG + 'auto';
const BETOLTENDO = ELOTAG + 'betoltendo';
/** Hány kézi mentőhely van. Három elég: a több csak zavart okoz. */
export const HELYEK = 3;

function kulcs(hely) { return `${ELOTAG}hely${hely}`; }

function ir(k, ertek) {
  try {
    localStorage.setItem(k, JSON.stringify(ertek));
    return { rendben: true };
  } catch (e) {
    // Megtelt tároló: az automata mentés a legkevésbé értékes, az megy először.
    try {
      localStorage.removeItem(AUTO);
      localStorage.setItem(k, JSON.stringify(ertek));
      return { rendben: true, ok: 'az automata mentés törlődött, hogy elférjen' };
    } catch (e2) {
      return { rendben: false, ok: 'megtelt a böngésző tárolója' };
    }
  }
}

function olvas(k) {
  try {
    const s = localStorage.getItem(k);
    if (!s) return null;
    return JSON.parse(s);
  } catch (e) {
    return null;
  }
}

/** @returns {{rendben:boolean, ok?:string}} */
export function ment(sim, hely, cimke) {
  const adat = mentesKeszit(sim, cimke || `${sim.nap}. nap`);
  return ir(kulcs(hely), adat);
}

export function automataMentes(sim) {
  return ir(AUTO, mentesKeszit(sim, 'automata'));
}

export function betolt(hely) {
  const a = olvas(hely === 'auto' ? AUTO : kulcs(hely));
  if (!a) return null;
  return mentesEllenoriz(a).rendben ? a : null;
}

export function torol(hely) {
  try { localStorage.removeItem(hely === 'auto' ? AUTO : kulcs(hely)); } catch (e) { /* nincs mit tenni */ }
}

/**
 * A mentőhelyek listája a betöltő-panelhez. Az `elonezet` mezőt a
 * `mentesKeszit()` írja bele, épp azért, hogy ehhez a listához NE kelljen
 * lejátszani a naplót.
 */
export function lista() {
  const ki = [];
  const a = olvas(AUTO);
  ki.push({ hely: 'auto', nev: 'Automata', adat: a && mentesEllenoriz(a).rendben ? a : null });
  for (let i = 1; i <= HELYEK; i++) {
    const m = olvas(kulcs(i));
    ki.push({ hely: i, nev: `${i}. hely`, adat: m && mentesEllenoriz(m).rendben ? m : null });
  }
  return ki;
}

// ── ÚJRATÖLTÉSSEL TÖRTÉNŐ BETÖLTÉS ────────────────────────────────────────
//
// MIÉRT NEM CSERÉLJÜK KI A SIM-ET MENET KÖZBEN: mert a render és a felület
// tucatnyi helyen tartja a hivatkozását, és egy elfelejtett hivatkozás a régi
// világra mutatna — a képernyőn két világ keveredne. Az újratöltés brutális,
// de HIBÁTLAN, és fél másodperc. A jelzőt a tárolóban hagyjuk, a boot pedig
// felveszi.

export function betoltestKer(hely) {
  try { localStorage.setItem(BETOLTENDO, String(hely)); } catch (e) { /* akkor nem */ }
  location.reload();
}

/** Boot-időben: van-e betöltendő mentés? A jelzőt egyben el is tünteti. */
export function kertBetoltes() {
  let hely = null;
  try {
    hely = localStorage.getItem(BETOLTENDO);
    localStorage.removeItem(BETOLTENDO);
  } catch (e) { return null; }
  if (!hely) return null;
  const adat = betolt(hely === 'auto' ? 'auto' : Number(hely));
  return adat;
}
