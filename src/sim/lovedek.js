// AGE OF THE CRYSTALS — LÖVEDÉKEK REPÜLÉSI IDŐVEL.
//
// ── MIÉRT NEM AZONNALI A TÁVOLSÁGI SEBZÉS ─────────────────────────────────
// A v0.4 első szakaszában az íjász AZONNAL sebzett a hatótávján belül. Ez
// játékként rossz és mérnökileg is: a repülési idő nem látvány, hanem
// JÁTÉKMECHANIKA. Ettől lehet „túllőni" egy visszavonuló egységet, ezért éri
// meg a lovasnak berohanni az íjászok közé, és ez adja a v0.9 balanszának az
// egyik legfontosabb szabályozóját. Ha később vezetnénk be, minden korábbi
// balansz-mérés érvényét vesztené.
//
// ── A SEBZÉS A KILÖVÉSKOR DŐL EL ──────────────────────────────────────────
// A páncél- és ellensúly-számítást a KILÖVÉS pillanatában végezzük el, és az
// eredményt (egy egész szám) viszi magával a lövedék. Így a becsapódás olcsó,
// és — ami fontosabb — a sebzés nem változik meg attól, hogy a célpont közben
// mit csinál. A cél HALHAT repülés közben: a lövedék akkor is becsapódik,
// csak nem talál senkit. Ez a klasszikus AoE-viselkedés, és nem hiba.
//
// ── TÖMÖRÍTÉS SWAP-REMOVE-VAL ─────────────────────────────────────────────
// Az egységeknél a halál NEM tömörít, mert az egység-indexre mindenhonnan
// hivatkozunk. A lövedék más: rá SENKI nem hivatkozik kívülről, tehát a
// befejezett lövedék helyére nyugodtan beugorhat az utolsó. Az `db` így mindig
// a tényleges darabszám, a ciklus nem jár halott elemeken, és nem kell szabad-
// lista sem.
//
// ⚠️ A swap-remove miatt a ciklus VISSZAFELÉ megy. Előrefelé haladva a
// becsapódó elem helyére beugró utolsó elemet ugyanabban a körben kihagynánk.

import { fxHossz } from './fx.js';

/** Világegység / másodperc. A nyílvessző gyors, de nem azonnali. */
const SEBESSEG = 16.0;
/** Ennél közelebb a célhoz a lövedék becsapódik. */
const TALALAT_TAV = 0.45;
/** Élettartam tickben — ennyi után a lövedék akkor is elenyészik, ha nem ért oda. */
const MAX_ELET = 80;

export class Lovedekek {
  /**
   * @param {number} maxDb egyszerre repülő lövedékek felső korlátja
   * @param {import('./sim.js').Sim} sim
   */
  constructor(maxDb, sim) {
    this.maxDb = maxDb | 0;
    this.sim = sim;
    this.db = 0;
    const m = this.maxDb;

    this.x = new Float64Array(m);
    this.y = new Float64Array(m);
    this.cel = new Int32Array(m);
    /** A célpont generációja (v0.5) — lásd `units.js` slot-újrahasznosítás. */
    this.celGen = new Int32Array(m);
    this.sebzes = new Int32Array(m);
    this.csapat = new Uint8Array(m);
    this.elet = new Int32Array(m);
    /** Az utolsó ismert célpont-irány — a render ebből forgatja a nyilat. */
    this.szogX = new Float64Array(m);
    this.szogY = new Float64Array(m);

    /** Statisztika: hány lövedék indult, hány talált. */
    this.kilott = 0;
    this.talalt = 0;
  }

  nullaz() {
    this.db = 0;
    this.kilott = 0;
    this.talalt = 0;
  }

  /**
   * Kilövés. A `sebzes` MÁR kiszámolt egész — a páncél és az ellensúly a hívó
   * (`harc.js`) dolga volt.
   *
   * Ha betelt a tár, a lövés ELVÉSZ. Ez tudatos: a felső korlát nélkül egy
   * pillanatnyi tömeg-összecsapás korlátlanul allokálna, és a képkocka-büdzsé
   * kiszámíthatatlanná válna. A korlát (`maxDb`) bőven a valós csúcs fölött van.
   */
  lo(fx, fy, cel, sebzes, csapat, celGen) {
    if (this.db >= this.maxDb) return -1;
    const i = this.db++;
    this.celGen[i] = celGen;
    this.x[i] = fx;
    this.y[i] = fy;
    this.cel[i] = cel;
    this.sebzes[i] = sebzes;
    this.csapat[i] = csapat;
    this.elet[i] = MAX_ELET;
    this.szogX[i] = 1; this.szogY[i] = 0;
    this.kilott++;
    return i;
  }

  /**
   * EGY tick — a lövedékek repülnek és becsapódnak.
   *
   * A lövedék RÁVEZETETT: mindig a célpont MOSTANI helye felé tart. Ez azért
   * fontos, mert enélkül egy oldalra lépő egység előtt csapódna be a nyíl, és a
   * távolsági egységek használhatatlanok lennének mozgó cél ellen. A „túllövés"
   * ettől még megmarad: ha a cél MEGHAL repülés közben, a lövedék elenyészik.
   */
  lep() {
    const sim = this.sim;
    const e = sim.egysegek;
    const harc = sim.harc;
    const dt = 0.05;              // egy tick — a `units.js` DT-jével egyezik
    const lepes = SEBESSEG * dt;

    // ⚠️ VISSZAFELÉ: a swap-remove az utolsó elemet hozza ide (lásd a fejlécet).
    for (let i = this.db - 1; i >= 0; i--) {
      const cel = this.cel[i];
      // A cél meghalt, eltűnt, VAGY a slotja új gazdát kapott: a lövedék
      // elenyészik, sebzés nélkül. A generáció-ellenőrzés nélkül a nyíl a
      // frissen kiképzett egységbe csapódna — determinisztikusan, tehát a
      // desync-szonda zölden hallgatna végig.
      if (!e.ervenyes(cel, this.celGen[i])) { this._kivesz(i); continue; }
      if (--this.elet[i] <= 0) { this._kivesz(i); continue; }

      const dx = e.px[cel] - this.x[i];
      const dy = e.py[cel] - this.y[i];
      const d = fxHossz(dx, dy);
      if (d <= TALALAT_TAV || d <= lepes) {
        harc.sebez(cel, this.sebzes[i], this.csapat[i]);
        this.talalt++;
        this._kivesz(i);
        continue;
      }
      const ix = dx / d, iy = dy / d;
      this.x[i] += ix * lepes;
      this.y[i] += iy * lepes;
      this.szogX[i] = ix;
      this.szogY[i] = iy;
    }
  }

  /** Swap-remove: az utolsó elem beugrik a kivett helyére. */
  _kivesz(i) {
    const u = --this.db;
    if (i === u) return;
    this.x[i] = this.x[u];
    this.y[i] = this.y[u];
    this.cel[i] = this.cel[u];
    this.celGen[i] = this.celGen[u];
    this.sebzes[i] = this.sebzes[u];
    this.csapat[i] = this.csapat[u];
    this.elet[i] = this.elet[u];
    this.szogX[i] = this.szogX[u];
    this.szogY[i] = this.szogY[u];
  }
}
