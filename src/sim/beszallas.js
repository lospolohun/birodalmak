// AGE OF THE CRYSTALS — BESZÁLLÁSOLÁS (garrison).
//
// ── MIÉRT NEM ELÉG „ELREJTENI" AZ EGYSÉGET ────────────────────────────────
// A beszállásolt egység ÉL, de nincs a világban: nem lökdösi a többieket, nem
// célozható, nem rajzolódik ki, és nem kap parancsot. Ez pontosan ugyanaz a
// kivétel-halmaz, mint a halálnál — ezért ugyanazon az EGY helyen intézzük el:
// a térbeli hasítótáblából marad ki (`units.js`). Onnan olvas a szeparáció és a
// célkeresés is, tehát egy feltétellel megszűnik mindkettő.
//
// A különbség a halálhoz képest: ez VISSZAFORDÍTHATÓ. Ezért nem az `elo`
// jelzőt írjuk át (az a harcé), hanem egy külön `bent` tömböt. Ha a kettőt
// összevonnánk, a kiszállás feltámasztásnak látszana a harcrendszer felől.
//
// ── AMI A v0.4-BEN SZÁNDÉKOSAN NINCS ──────────────────────────────────────
// A beszállásolt íjász NEM lő ki az épületből. A műfajban ez jár (a torony
// „megtelik" nyilakkal), de az önálló mechanika: célkeresés az épület
// pozíciójából, saját hatótávval, saját ütemmel. A v0.5 roster hozza a
// tornyot, és ott lesz értelme egyben megcsinálni — félig előrehozva csak egy
// második, párhuzamos harc-ág lenne.
//
// ── AZ ÉPÜLET PUSZTULÁSA MEGÖLI A BENT LÉVŐKET ────────────────────────────
// Ez nem büntetés, hanem a mechanika ára: a beszállásolás védelmet ad (a bent
// lévőt nem lehet célozni), és ennek kockázata van. A `Epuletek.sebez()`
// pusztulás-ága ezért szól ide.

import { fxHossz } from './fx.js';
import { EPULET } from './epuletek.js';

/**
 * Hány egység fér be épülettípusonként. A fal és a kapu nem fogad senkit —
 * abba nincs mit beszállásolni —, és az istállóba meg az ostromműhelybe sem
 * menekül gyalogos (ott nincs hova).
 */
const KAPACITAS = [15, 5, 0, 0, 8, 10, 10, 0, 0];

/** Ennél közelebb az egység már be tud lépni az épületbe. */
const BELEPES_TAV = 2.4;

export class Beszallas {
  /**
   * @param {number} maxDb
   * @param {import('./sim.js').Sim} sim
   */
  constructor(maxDb, sim) {
    this.maxDb = maxDb | 0;
    this.sim = sim;
    /** 1 = az egység épületben van. A `units.js` ezt olvassa. */
    this.bent = new Uint8Array(this.maxDb);
    /** Melyik épületben, vagy -1. */
    this.hol = new Int32Array(this.maxDb);
    this.hol.fill(-1);
    /** Épületenkénti létszám — a kapacitás-ellenőrzéshez és a HUD-hoz. */
    this.letszam = new Int32Array(256);
    /**
     * KUMULATÍV számlálók. A pillanatnyi létszám nem bizonyít semmit: ha a
     * forgatókönyv ugyanabban a körben be- és kiszállít, a kör végén nulla áll
     * — miközben az ág lefutott. A szonda működés-ellenőrzésének ezek kellenek.
     */
    this.beDb = 0;
    this.kiDb = 0;
  }

  nullaz() {
    this.bent.fill(0);
    this.hol.fill(-1);
    this.letszam.fill(0);
    this.beDb = 0;
    this.kiDb = 0;
  }

  /** Befér-e még? A fal és a kapu kapacitása 0, tehát azokra mindig hamis. */
  ferohely(ep) {
    const e = this.sim.epuletek;
    if (!e.kesz(ep)) return false;
    return this.letszam[ep] < KAPACITAS[e.tipus[ep]];
  }

  /**
   * Belépés. A hívó már ellenőrizte a távolságot.
   * @returns {boolean} sikerült-e
   */
  be(i, ep) {
    const sim = this.sim;
    const e = sim.egysegek;
    if (this.bent[i] === 1) return false;
    if (!this.ferohely(ep)) return false;
    if (sim.epuletek.csapat[ep] !== e.csapat[i]) return false;

    this.bent[i] = 1;
    this.hol[i] = ep;
    this.letszam[ep]++;
    this.beDb++;
    // Az egység megáll és „eltűnik": a mozgás-mag a hasítótáblából már
    // kihagyja, de a sebességét itt nullázzuk, hogy a `_mozgat` se vigye.
    e.allapot[i] = 0;               // ALLAPOT.ALL
    e.vx[i] = 0; e.vy[i] = 0;
    e.mezoId[i] = -1;
    sim.parancsAllapot.celEgyseg[i] = -1;
    sim.parancsAllapot.celEpulet[i] = -1;
    sim.munkasok.elenged(i);
    return true;
  }

  /**
   * Kilépés — az egység az épület melletti szabad cellára kerül.
   *
   * A `valtozat` a körbeosztás miatt kell (ugyanaz a tanulság, mint a
   * munkásoknál): ha mind a tizenöten ugyanarra a cellára lépnének ki, egymáson
   * állnának, és a szeparáció egy tickben lökné szét őket a fél pályára.
   */
  ki(i, valtozat) {
    const sim = this.sim;
    const e = sim.egysegek;
    const ep = this.hol[i];
    if (this.bent[i] === 0 || ep < 0) return false;
    const hely = sim.epuletek.allohely(ep, this._p || (this._p = { x: 0, y: 0 }), valtozat);
    this.bent[i] = 0;
    this.hol[i] = -1;
    this.kiDb++;
    if (this.letszam[ep] > 0) this.letszam[ep]--;
    if (hely) {
      e.px[i] = hely.x;
      e.py[i] = hely.y;
      e.celX[i] = hely.x;
      e.celY[i] = hely.y;
    }
    e.allapot[i] = 0;
    return true;
  }

  /** Mindenki ki egy épületből. Rögzített sorrend: növekvő egység-index. */
  mindKi(ep) {
    const e = this.sim.egysegek;
    let n = 0;
    for (let i = 0; i < e.db; i++) {
      if (this.bent[i] === 1 && this.hol[i] === ep) { this.ki(i, n); n++; }
    }
    return n;
  }

  /**
   * Az épület elpusztult — a bent lévők vele halnak. A `Epuletek.sebez()`
   * pusztulás-ága hívja a `Sim`-en keresztül.
   */
  epuletPusztult(ep) {
    const sim = this.sim;
    const e = sim.egysegek;
    for (let i = 0; i < e.db; i++) {
      if (this.bent[i] !== 1 || this.hol[i] !== ep) continue;
      this.bent[i] = 0;
      this.hol[i] = -1;
      // A harcrendszer öli meg, hogy a halálhoz tartozó MINDEN következmény
      // (statisztika, célpont-elengedés) egy helyen fusson le.
      sim.harc.sebez(i, sim.harc.hp[i], sim.epuletek.csapat[ep] ^ 1);
    }
    this.letszam[ep] = 0;
  }

  /** Elég közel van-e az egység a belépéshez? */
  belephet(i, ep) {
    const sim = this.sim;
    const e = sim.egysegek;
    const epu = sim.epuletek;
    if (!this.ferohely(ep)) return false;
    const hat = BELEPES_TAV + 0.5 * epu.meret(ep);
    return fxHossz(epu.x[ep] - e.px[i], epu.y[ep] - e.py[i]) <= hat;
  }

  /** Összesítés a HUD-nak. */
  osszesites(csapat) {
    const e = this.sim.egysegek;
    let db = 0;
    for (let i = 0; i < e.db; i++) if (this.bent[i] === 1 && e.csapat[i] === csapat) db++;
    return db;
  }
}

export { KAPACITAS, EPULET };
