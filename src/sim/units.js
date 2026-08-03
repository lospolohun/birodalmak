// AGE OF THE CRYSTALS — EGYSÉGEK (SoA tárolás + mozgás).
//
// ── MIÉRT NINCS `Unit` OSZTÁLY ────────────────────────────────────────────
// 1600 egységnél az objektum-per-egység minta három sebet üt: szétszórt
// memória (minden tick 1600 pointer-ugrás), GC-nyomás, és a `Map`/`Set`
// iterációs sorrend, ami determinizmus-kockázat. Ezért minden mező SAJÁT
// tipizált tömb (Structure of Arrays), az egység maga csak egy INDEX.
// Ugyanez a szemlélet, mint a TELEPESEK `units3d.js`-ében a render oldalon.
//
// ── A MOZGÁS HÁROM RÉTEGE ─────────────────────────────────────────────────
//   1. GLOBÁLIS   — áramlási mező: merre van a cél, akadályokat megkerülve
//   2. RÖVIDÍTÉS  — ha a célig szabad az egyenes, ne lépcsőzzünk a rács 8
//                   irányán, hanem menjünk egyenesen (ez teszi „élővé")
//   3. LOKÁLIS    — szeparáció: a szomszédok ellökik egymást, így a sereg nem
//                   egyetlen pontba tömörül és nem áll egymáson
//
// A 3. réteg nélkül 200 egység egyetlen cellába gyűlne — ez az a hiba, amitől
// egy RTS „olcsónak" néz ki, hiába jó az útkeresés.
//
// ── DETERMINIZMUS ─────────────────────────────────────────────────────────
// A tick KÉT menetben fut: előbb MINDEN egység sebességét kiszámoljuk a tick
// ELEJI pozíciókból, és csak utána mozgatunk. Így az eredmény nem függ attól,
// milyen sorrendben dolgozzuk fel őket — és nem csúszik be „aki előbb lép, az
// nyer" jellegű aszimmetria.

import { fxSqrt, fxAtan2, fxHossz } from './fx.js';
import { szabadVonal } from './flowfield.js';

/** A szimuláció fix lépésköze — 20 Hz. Literál, nem számolás eredménye. */
export const DT = 0.05;

export const ALLAPOT = { ALL: 0, MEGY: 1, HARCOL: 2 };
export const TIPUS = { MUNKAS: 0, LANDZSAS: 1, IJASZ: 2, LOVAG: 3 };

/** Világegység / másodperc. */
const SEBESSEG = [3.2, 3.6, 3.4, 5.4];
/** Ütközési sugár — ebből jön a szeparáció ereje is. */
const SUGAR = [0.30, 0.34, 0.32, 0.42];

/** Ennél közelebb a célhoz megérkezettnek számít. */
const ERKEZES = 0.55;
/** A szeparáció ekkora sugárban keres szomszédot. */
const SZEP_SUGAR = 1.05;
/** A szeparáció súlya az áramlási irányhoz képest. */
const SZEP_SULY = 1.7;
/** Hány tickenként nézzük újra, hogy szabad-e az egyenes út a célig. */
const VONAL_PERIODUS = 15;

export class Egysegek {
  /**
   * @param {number} maxDb felső korlát (a tömbök ekkorák)
   * @param {import('./grid.js').Racs} racs
   * @param {import('./flowfield.js').MezoTar} mezoTar
   */
  constructor(maxDb, racs, mezoTar) {
    this.maxDb = maxDb | 0;
    this.db = 0;
    this.racs = racs;
    this.mezoTar = mezoTar;

    const m = this.maxDb;
    this.px = new Float64Array(m);
    this.py = new Float64Array(m);
    this.vx = new Float64Array(m);
    this.vy = new Float64Array(m);
    this.szog = new Float64Array(m);      // nézésirány
    this.celX = new Float64Array(m);
    this.celY = new Float64Array(m);
    this.mezoId = new Int32Array(m);
    this.allapot = new Uint8Array(m);
    this.tipus = new Uint8Array(m);
    this.csapat = new Uint8Array(m);
    this.egyenes = new Uint8Array(m);     // 1 = szabad az egyenes a célig

    this.mezoId.fill(-1);

    // ── Térbeli hasítótábla a szeparációhoz ──────────────────────────
    this.hCella = 2.0;
    this.hSzel = Math.ceil(racs.n / this.hCella) | 0;
    const hDb = this.hSzel * this.hSzel;
    this._hSzam = new Int32Array(hDb + 1);
    this._hElem = new Int32Array(m);

    /** Újrahasznosított kimenő objektum — hogy ne szemeteljünk tickenként. */
    this._ir = { x: 0, y: 0 };

    /**
     * v0.4 — élet-jelző, a `Harc` rétegtől (`Uint8Array`, 1 = él). A `Sim` köti
     * be. Ha nincs (csupasz szonda, v0.3 és korábbi mentés), MINDENKI élőnek
     * számít, és a mozgás-mag a v0.1 viselkedését adja.
     *
     * MIÉRT ITT ÉS NEM MÁSHOL: a halottat EGYETLEN helyen kell kivenni a
     * világból — a térbeli hasítótáblából. Onnan olvas a szeparáció ÉS a
     * célkeresés is, tehát egy feltétellel egyszerre szűnik meg lökdösődni és
     * célponttá válni. Ha külön-külön szűrnénk, előbb-utóbb az egyik kimaradna.
     */
    this.elo = null;

    /**
     * v0.4 — BESZÁLLÁSOLT jelző (`Uint8Array`, 1 = épületben van). Ugyanaz a
     * kivétel, mint a halálnál, csak VISSZAFORDÍTHATÓ — ezért külön tömb, nem
     * az `elo` átírása: a kiszállás különben feltámasztásnak látszana a
     * harcrendszer felől.
     */
    this.bent = null;
  }

  /**
   * Új egység.
   * @returns {number} az egység indexe, vagy -1 ha betelt
   */
  hozzaad(x, y, tipus, csapat) {
    if (this.db >= this.maxDb) return -1;
    const i = this.db++;
    this.px[i] = x; this.py[i] = y;
    this.vx[i] = 0; this.vy[i] = 0;
    this.szog[i] = 0;
    this.celX[i] = x; this.celY[i] = y;
    this.mezoId[i] = -1;
    this.allapot[i] = ALLAPOT.ALL;
    this.tipus[i] = tipus;
    this.csapat[i] = csapat;
    this.egyenes[i] = 0;
    return i;
  }

  /**
   * Menetparancs egy egységnek.
   *
   * ⚠️ A `mezoId`-t a HÍVÓ adja, és a CSOPORT közös céljára szól — NEM az
   * egység saját alakzat-helyére. Ez a különbség dönti el, hogy működik-e
   * egyáltalán az áramlási mező:
   *
   *   rosszul  — minden egység a saját alakzat-helyére kér mezőt → 800 egység
   *              = 800 külön mező, a 8 elemű gyorstár azonnal csapkod, és a
   *              tick-idő 40 ms-re ugrik. (Ez a hiba MEGTÖRTÉNT, mérve.)
   *   jól      — EGY mező a csoport céljára, mind a 800 azt olvassa; a saját
   *              alakzat-helyére csak a becsatlakozás végén, a szabad-egyenes
   *              rövidítéssel áll rá.
   *
   * @param {number} i egység
   * @param {number} celX az egység SAJÁT végpontja (alakzat-hely)
   * @param {number} celY
   * @param {number} mezoId a CSOPORT közös áramlási mezője
   */
  menetparancs(i, celX, celY, mezoId) {
    this.celX[i] = celX;
    this.celY[i] = celY;
    this.mezoId[i] = mezoId;
    this.allapot[i] = ALLAPOT.MEGY;
    this.egyenes[i] = szabadVonal(this.racs, this.px[i], this.py[i], celX, celY) ? 1 : 0;
  }

  /**
   * Egy szimulációs tick.
   *
   * A `parancsAllapot` a hasítótábla felépítése UTÁN, a sebesség-számítás ELŐTT
   * kap szót — ez a v0.2 óta a célzás és az állás-logika helye. A sorrend nem
   * ízlés kérdése: a célkeresés a most felépült térbeli táblát olvassa, és amit
   * eldönt (kit üldöz, hol áll meg), annak még EBBEN a tickben hatnia kell a
   * sebességre. Ha a hívó nem ad ilyet, a tick a v0.1 viselkedését futtatja.
   *
   * @param {number} tick
   * @param {{lep:(t:number)=>void}} [parancsAllapot]
   */
  lep(tick, parancsAllapot) {
    this._hasitoEpit();
    if (parancsAllapot) parancsAllapot.lep(tick);
    this._sebessegek(tick);
    this._mozgat();
  }

  /** Térbeli hasítótábla újraépítése számláló-rendezéssel (O(n)). */
  _hasitoEpit() {
    const db = this.db;
    const szel = this.hSzel;
    const cm = this.hCella;
    const szam = this._hSzam;
    const elem = this._hElem;
    const elo = this.elo;
    const bent = this.bent;
    szam.fill(0);
    // 1. menet: hány elem esik egy vödörbe. A HALOTTAK kimaradnak — így sem
    // lökdösik a többieket, sem célponttá nem válnak (lásd az `elo` mezőt).
    for (let i = 0; i < db; i++) {
      if (elo && elo[i] === 0) continue;
      if (bent && bent[i] === 1) continue;
      let gx = (this.px[i] / cm) | 0;
      let gy = (this.py[i] / cm) | 0;
      if (gx < 0) gx = 0; else if (gx >= szel) gx = szel - 1;
      if (gy < 0) gy = 0; else if (gy >= szel) gy = szel - 1;
      szam[gy * szel + gx + 1]++;
    }
    // 2. menet: prefix-összeg → kezdőindexek
    for (let k = 1; k <= szel * szel; k++) szam[k] += szam[k - 1];
    // 3. menet: beszórás. Az egységeket NÖVEKVŐ index szerint járjuk be, tehát
    // a vödrön belüli sorrend is determinisztikus.
    const kurzor = this._hKurzor || (this._hKurzor = new Int32Array(szel * szel));
    kurzor.set(szam.subarray(0, szel * szel));
    for (let i = 0; i < db; i++) {
      if (elo && elo[i] === 0) continue;
      if (bent && bent[i] === 1) continue;
      let gx = (this.px[i] / cm) | 0;
      let gy = (this.py[i] / cm) | 0;
      if (gx < 0) gx = 0; else if (gx >= szel) gx = szel - 1;
      if (gy < 0) gy = 0; else if (gy >= szel) gy = szel - 1;
      elem[kurzor[gy * szel + gx]++] = i;
    }
  }

  /** ELSŐ menet: minden egység sebessége a tick ELEJI pozíciókból. */
  _sebessegek(tick) {
    const db = this.db;
    const racs = this.racs;
    const n = racs.n;
    const ir = this._ir;

    const bent2 = this.bent;
    for (let i = 0; i < db; i++) {
      if (this.allapot[i] !== ALLAPOT.MEGY || (bent2 && bent2[i] === 1)) {
        this.vx[i] = 0; this.vy[i] = 0;
        continue;
      }
      const x = this.px[i], y = this.py[i];

      // Megérkezett?
      const tcx = this.celX[i] - x, tcy = this.celY[i] - y;
      const tav = fxHossz(tcx, tcy);
      if (tav < ERKEZES) {
        this.allapot[i] = ALLAPOT.ALL;
        this.vx[i] = 0; this.vy[i] = 0;
        continue;
      }

      // A szabad-egyenes vizsgálatot SZAKASZOSAN futtatjuk: egységenként
      // eltolt fázisban, tickenként a sereg ~1/15-ére. Enélkül a supercover
      // Bresenham 1600-szor futna képkockánként.
      if (((tick + i) % VONAL_PERIODUS) === 0) {
        this.egyenes[i] = szabadVonal(racs, x, y, this.celX[i], this.celY[i]) ? 1 : 0;
      }

      // ── 1-2. réteg: globális irány ─────────────────────────────────
      let dx, dy;
      if (this.egyenes[i] === 1) {
        dx = tcx / tav; dy = tcy / tav;
      } else {
        const ci = racs.idx(x | 0, y | 0);
        if (ci < 0 || this.mezoId[i] < 0) { dx = 0; dy = 0; }
        else {
          this.mezoTar.irany(this.mezoId[i], ci, ir);
          dx = ir.x; dy = ir.y;
          // Zsákutcában (nincs mezőirány) engedjük a nyers célirányt, hogy az
          // egység ne fagyjon oda — inkább nekimenjen a falnak, mint álljon.
          if (dx === 0 && dy === 0) { dx = tcx / tav; dy = tcy / tav; }
        }
      }

      // ── 3. réteg: szeparáció a szomszédoktól ───────────────────────
      let sx = 0, sy = 0;
      const sugarI = SUGAR[this.tipus[i]];
      const szel = this.hSzel, cm = this.hCella;
      let gx = (x / cm) | 0, gy = (y / cm) | 0;
      if (gx < 0) gx = 0; else if (gx >= szel) gx = szel - 1;
      if (gy < 0) gy = 0; else if (gy >= szel) gy = szel - 1;
      for (let oy = -1; oy <= 1; oy++) {
        const ny = gy + oy;
        if (ny < 0 || ny >= szel) continue;
        for (let ox = -1; ox <= 1; ox++) {
          const nx = gx + ox;
          if (nx < 0 || nx >= szel) continue;
          const vodor = ny * szel + nx;
          const kezd = this._hSzam[vodor];
          const veg = this._hSzam[vodor + 1];
          for (let k = kezd; k < veg; k++) {
            const j = this._hElem[k];
            if (j === i) continue;
            const ddx = x - this.px[j];
            const ddy = y - this.py[j];
            const d2 = ddx * ddx + ddy * ddy;
            const hatar = SZEP_SUGAR + sugarI;
            if (d2 >= hatar * hatar) continue;
            let d = fxSqrt(d2);
            if (d < 1e-6) {
              // Pontosan egymáson állnak — az index-különbségből adunk
              // determinisztikus, de „véletlenszerű" szétlökést.
              sx += ((i - j) & 1) ? 0.7071 : -0.7071;
              sy += ((i + j) & 1) ? 0.7071 : -0.7071;
              continue;
            }
            // Minél közelebb, annál erősebb (lineáris kifutás a határig)
            const ero = (hatar - d) / hatar;
            sx += (ddx / d) * ero;
            sy += (ddy / d) * ero;
          }
        }
      }

      // ── Összegzés ──────────────────────────────────────────────────
      let kx = dx + sx * SZEP_SULY;
      let ky = dy + sy * SZEP_SULY;
      const kh = fxHossz(kx, ky);
      if (kh > 1e-6) { kx /= kh; ky /= kh; } else { kx = dx; ky = dy; }

      const seb = SEBESSEG[this.tipus[i]];
      this.vx[i] = kx * seb;
      this.vy[i] = ky * seb;
      // Nézésirány — a tényleges haladás felé fordul
      if (kx !== 0 || ky !== 0) this.szog[i] = fxAtan2(ky, kx);
    }
  }

  /** MÁSODIK menet: pozíciók léptetése, fal-csúsztatással. */
  _mozgat() {
    const db = this.db;
    const racs = this.racs;
    for (let i = 0; i < db; i++) {
      const vx = this.vx[i], vy = this.vy[i];
      if (vx === 0 && vy === 0) continue;
      const x = this.px[i], y = this.py[i];
      const ux = x + vx * DT;
      const uy = y + vy * DT;
      if (racs.jarhatoPont(ux, uy)) {
        this.px[i] = ux; this.py[i] = uy;
        continue;
      }
      // Falba futott: próbáljunk MELLETTE elcsúszni — előbb csak X, aztán
      // csak Y. Enélkül az egység beleragad az akadály sarkába.
      if (racs.jarhatoPont(ux, y)) { this.px[i] = ux; continue; }
      if (racs.jarhatoPont(x, uy)) { this.py[i] = uy; continue; }
      // Mindkettő zárt — állunk. (A v0.2-ben itt jön majd az „elkerülhetetlen
      // torlódás" feloldás: átmeneti átjárhatóság a saját csapat egységein.)
    }
  }
}
