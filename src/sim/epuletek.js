// AGE OF THE CRYSTALS — ÉPÜLETEK (v0.3: a lerakatok).
//
// ── MI VAN ITT ÉS MI NINCS ────────────────────────────────────────────────
// A v0.3 gazdasági kör: a nyersanyagot valahova le kell RAKNI, különben a
// munkás-AI-nak nincs értelme. Ezért itt most két épület van:
//
//   KOZPONT  a csapat magja, egyben lerakat is. Minden csapat kap egyet indulásnál.
//   RAKTAR   olcsó, kicsi lerakat — ezt a játékos rakja a lelőhelyek mellé.
//
// A teljes épület-roster és a technológiafa a v0.5, az építő-munkás AI szintén.
// Itt az építés IDŐBE telik, de nem igényel munkást a helyszínen — ez tudatos
// egyszerűsítés, és a `PLAN.md` szerinti sorrendet követi.
//
// ── AMI KÖNNYEN ELROMLIK: A JÁRHATÓSÁG ────────────────────────────────────
// Az épület ZÁRJA a celláit, tehát ugyanaz a csapda, mint a nyersanyagoknál: a
// `MezoTar` gyorsítótárazott mezői egy frissen lerakott raktárról nem tudnak, és
// a sereg átsétálna rajta. Ezért a lerakás jelzi a járhatóság-változást, és a
// `Sim.lep()` üríti a mező-tárat.
//
// Az épület alá szorult egységeket NEM toljuk ki: a lerakás előbb ellenőrzi,
// hogy a hely szabad-e (`lerakhato`). Ez a játékos dolga, nem a simé — és így
// nincs olyan ág, ami egységet mozgatna parancs nélkül.

export const EPULET = { KOZPONT: 0, RAKTAR: 1 };
export const EPULET_NEV = ['központ', 'raktár'];

/** Alapterület cellában (négyzet). */
export const EP_MERET = [3, 2];
/** Építési idő tickben (20 Hz → a központ 10 mp, a raktár 5 mp). */
const EP_IDO = [200, 100];
/** Ára: [étel, fa, kő, kristály]. A központ indulásnál INGYEN jár. */
export const EP_AR = [
  [0, 250, 100, 0],
  [0, 90, 0, 0],
];
/** Lerakat-e? A v0.3-ban mindkettő az, de a v0.5 rosterben már nem lesz igaz. */
const LERAKO = [1, 1];

export class Epuletek {
  /**
   * @param {import('./grid.js').Racs} racs
   * @param {number} maxDb
   */
  constructor(racs, maxDb = 256) {
    this.racs = racs;
    this.maxDb = maxDb | 0;
    this.db = 0;

    /** A bal-felső cella koordinátái (egész). */
    this.cx = new Int32Array(maxDb);
    this.cy = new Int32Array(maxDb);
    /** A KÖZÉPPONT világkoordinátában — a munkás ide tart. */
    this.x = new Float64Array(maxDb);
    this.y = new Float64Array(maxDb);
    this.tipus = new Uint8Array(maxDb);
    this.csapat = new Uint8Array(maxDb);
    /** Hátralévő építési tick. 0 = kész. */
    this.epulHatra = new Int32Array(maxDb);

    this.jarhatosagValtozott = false;
  }

  /** Kész van-e (nem építés alatt)? */
  kesz(i) { return i >= 0 && i < this.db && this.epulHatra[i] === 0; }

  /**
   * Lerakható-e ide? Minden érintett cellának járhatónak kell lennie — tehát
   * se víz, se szikla, se erdő, se másik épület.
   * @param {number} tipus @param {number} bx bal-felső cella x @param {number} by
   */
  lerakhato(tipus, bx, by) {
    const m = EP_MERET[tipus];
    for (let dy = 0; dy < m; dy++) {
      for (let dx = 0; dx < m; dx++) {
        const ci = this.racs.idx(bx + dx, by + dy);
        if (ci < 0 || this.racs.jarhato[ci] === 0) return false;
      }
    }
    return true;
  }

  /**
   * Épület lerakása. A hívó (a parancs-réteg) már levonta az árát.
   * @returns {number} az épület indexe, vagy -1
   */
  lerak(tipus, bx, by, csapat, azonnalKesz = false) {
    if (this.db >= this.maxDb) return -1;
    if (!this.lerakhato(tipus, bx, by)) return -1;
    const i = this.db++;
    const m = EP_MERET[tipus];
    this.cx[i] = bx; this.cy[i] = by;
    this.x[i] = bx + m * 0.5;
    this.y[i] = by + m * 0.5;
    this.tipus[i] = tipus;
    this.csapat[i] = csapat;
    this.epulHatra[i] = azonnalKesz ? 0 : EP_IDO[tipus];
    for (let dy = 0; dy < m; dy++) {
      for (let dx = 0; dx < m; dx++) {
        this.racs.jarhato[this.racs.idx(bx + dx, by + dy)] = 0;
      }
    }
    this.jarhatosagValtozott = true;
    return i;
  }

  /**
   * Minden épület eltávolítása, a járhatóság visszaadásával. Az
   * `ujraFelallas` hívja — enélkül a szonda lépcsői között az épületek
   * halmozódnának, és a pálya lépcsőről lépcsőre zsugorodna.
   */
  nullaz() {
    for (let i = 0; i < this.db; i++) {
      const m = EP_MERET[this.tipus[i]];
      for (let dy = 0; dy < m; dy++) {
        for (let dx = 0; dx < m; dx++) {
          const ci = this.racs.idx(this.cx[i] + dx, this.cy[i] + dy);
          if (ci >= 0) this.racs.jarhato[ci] = 1;
        }
      }
    }
    this.db = 0;
    this.jarhatosagValtozott = true;
  }

  /** Egy tick: az építkezések haladnak. Olcsó — kevés épület van. */
  lep() {
    for (let i = 0; i < this.db; i++) {
      if (this.epulHatra[i] > 0) this.epulHatra[i]--;
    }
  }

  /**
   * A LEGKÖZELEBBI kész lerakat egy csapatnak. Lineáris keresés: épületből
   * néhány tucat van, és a munkás csak akkor kérdez, amikor megtelt — nem
   * tickenként. Döntetlennél a kisebb index nyer.
   * @returns {number} épület-index vagy -1
   */
  legkozelebbiLerako(csapat, wx, wy) {
    let legjobb = -1, legjobbD2 = Infinity;
    for (let i = 0; i < this.db; i++) {
      if (this.csapat[i] !== csapat) continue;
      if (this.epulHatra[i] !== 0 || !LERAKO[this.tipus[i]]) continue;
      const dx = this.x[i] - wx, dy = this.y[i] - wy;
      const d2 = dx * dx + dy * dy;
      if (d2 < legjobbD2) { legjobbD2 = d2; legjobb = i; }
    }
    return legjobb;
  }

  /**
   * ÁLLÓHELY az épület mellett — ide áll a lerakó munkás.
   *
   * A `valtozat` ugyanazt a bajt orvosolja, mint a lelőhelyeknél: egy központhoz
   * akár száz munkás is tarthat egyszerre, és ha mind ugyanazt a cellát kapná
   * célnak, egyikük sem érne oda — a szeparáció kitolná őket, az állapotgép
   * pedig örökké „szállít" állapotban maradna. A perem RÖGZÍTETT sorrendben
   * gyűlik, tehát a körbeosztás gépfüggetlen.
   *
   * @param {number} i épület
   * @param {{x:number,y:number}} ki
   * @param {number} valtozat körbeosztás (jellemzően a munkás indexe)
   */
  allohely(i, ki, valtozat = 0) {
    if (i < 0 || i >= this.db) return null;
    const m = EP_MERET[this.tipus[i]];
    const bx = this.cx[i], by = this.cy[i];
    const n = this.racs.n;
    const j = this._jeloltCellak || (this._jeloltCellak = []);
    j.length = 0;
    for (let r = 1; r <= 3 && j.length === 0; r++) {
      for (let dy = -r; dy < m + r; dy++) {
        for (let dx = -r; dx < m + r; dx++) {
          // Csak a keret, ne a belső cellák (azok az épület alatt vannak).
          if (dx > -r && dx < m + r - 1 && dy > -r && dy < m + r - 1) continue;
          const ci = this.racs.idx(bx + dx, by + dy);
          if (ci < 0 || this.racs.jarhato[ci] === 0) continue;
          j.push(ci);
        }
      }
    }
    if (j.length === 0) return null;
    const v = valtozat < 0 ? 0 : valtozat;
    const cel = j[v % j.length];
    ki.x = (cel % n) + 0.5;
    ki.y = ((cel / n) | 0) + 0.5;
    return ki;
  }
}
