// PORTAL HUB TYCOON — ÚTKERESÉS.
//
// ── MIÉRT ÍGY ─────────────────────────────────────────────────────────────
// Ezer utas mindegyikének külön A*-t futtatni nem fér bele: 1000 × 3000 cella
// tickenként. De nem is kell, mert a CÉLOK kevesen vannak. Egy állomáson
// 50-60 épület áll, és minden utas ezek VALAMELYIKÉHEZ tart.
//
// Ezért megfordítjuk a feladatot: minden épülethez EGYSZER kiszámolunk egy
// TÁVOLSÁGMEZŐT (BFS az épület peronjáról kifelé), és az utas onnantól csak
// annyit csinál, hogy a szomszédos cellák közül a kisebb számúra lép. Ez
// utasonként 8 tömb-olvasás, nem útkeresés.
//
// A mező mellékterméke ingyen ad két olyan választ, ami A*-ral drága lenne:
//   • „melyik a LEGKÖZELEBBI étterem?" → az utas cellájában olvasott érték a
//     VALÓDI úthossz, nem légvonal. A légvonal falak mögé küldene embereket.
//   • „egyáltalán elérhető-e?" → ha a mező -1, akkor nincs út. Enélkül az
//     elzárt boltokhoz beragadó utasok némán fogyasztanák a türelmüket.
//
// ── ÉRVÉNYTELENÍTÉS ───────────────────────────────────────────────────────
// A mező elavul, ha változik a rács (építés, bontás). A rács verziószámot
// léptet, a mező pedig megjegyzi, melyik verzióból készült. Egy építés után
// MINDEN mező elavul egyszerre — ha ezt egyetlen tickben újraszámolnánk, az
// egy látható akadás lenne. Ezért tickenként korlátozott számú mező épül
// újra; addig a régi mező szolgál. Egy tick erejéig kissé rossz út sokkal
// jobb, mint egy megakadó játék.

import { RACS_SZ } from '../mag/config.js';

/** Ennyi mezőt számolunk újra egyetlen tickben. */
const UJRASZAMOLAS_KERET = 4;

/** 8 szomszéd: először az egyenesek, aztán az átlók (a sorrend számít!). */
const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DY = [0, 0, 1, -1, 1, -1, 1, -1];

export class Utkereso {
  /** @param {import('./racs.js').Racs} racs */
  constructor(racs) {
    this.racs = racs;
    /** azonosító → { verzio, tav: Int16Array } */
    this.mezok = new Map();
    const n = racs.sz * racs.m;
    // Újrahasznált BFS-sor. Nulla per-tick allokáció: a `lep()`-ben nem
    // keletkezhet szemét, különben a GC pont a csúcsforgalomnál akad meg.
    this._sor = new Int32Array(n);
    this._keret = UJRASZAMOLAS_KERET;
  }

  /** Minden tick elején visszaáll az újraszámolási keret. */
  ujTick() { this._keret = UJRASZAMOLAS_KERET; }

  /** Egy épület megszűnésekor a mezője is mehet. */
  elfelejt(azon) { this.mezok.delete(azon); }

  /**
   * Távolságmező egy cél-cellahalmazhoz.
   * @param {number} azon gyorsítótár-kulcs (épület azonosító)
   * @param {number[]} celok cellaindexek
   * @returns {Int16Array|null} lépésszám cellánként, -1 = elérhetetlen
   */
  mezo(azon, celok) {
    const racs = this.racs;
    let m = this.mezok.get(azon);
    if (m && m.verzio === racs.verzio) return m.tav;
    // Elavult, de van régi és nincs keret: a régivel dolgozunk tovább.
    if (m && this._keret <= 0) return m.tav;
    if (!m) {
      m = { verzio: -1, tav: new Int16Array(racs.sz * racs.m) };
      this.mezok.set(azon, m);
    } else if (this._keret <= 0) {
      return m.tav;
    }
    this._keret--;
    this._bfs(m.tav, celok);
    m.verzio = racs.verzio;
    return m.tav;
  }

  /** Szélességi bejárás a célokból kifelé. */
  _bfs(tav, celok) {
    const racs = this.racs;
    const sz = racs.sz, mm = racs.m;
    tav.fill(-1);
    const sor = this._sor;
    let fej = 0, veg = 0;
    for (let i = 0; i < celok.length; i++) {
      const c = celok[i];
      if (tav[c] !== -1) continue;
      tav[c] = 0;
      sor[veg++] = c;
    }
    while (fej < veg) {
      const c = sor[fej++];
      const cx = c % sz, cy = (c - cx) / sz;
      const d = tav[c] + 1;
      for (let k = 0; k < 8; k++) {
        const nx = cx + DX[k], ny = cy + DY[k];
        if (nx < 0 || ny < 0 || nx >= sz || ny >= mm) continue;
        const ni = ny * sz + nx;
        if (tav[ni] !== -1) continue;
        if (!racs.jarhato(nx, ny)) continue;
        // Átló csak akkor, ha nem vágunk le sarkot — különben az utasok
        // átbújnának két épület érintkező sarka között, és a 3D-ben úgy
        // néznének ki, mintha a falban mennének.
        if (k >= 4) {
          if (!racs.jarhato(cx + DX[k], cy) || !racs.jarhato(cx, cy + DY[k])) continue;
        }
        tav[ni] = d;
        sor[veg++] = ni;
      }
    }
  }

  /**
   * A következő lépés iránya a mező gradiense mentén.
   *
   * A `tomegKerules` az, ami a torlódást viselkedéssé teszi: a zsúfolt cella
   * költsége nő, tehát a tömeg magától szétterül a párhuzamos folyosókra.
   * Enélkül minden utas ugyanazt az egy optimális vonalat használná, és a
   * második folyosó megépítése semmit nem érne — ami egy tycoonban a
   * legrosszabb visszajelzés.
   *
   * @returns {number} a szomszéd-index (0..7), vagy -1 ha nincs jobb lépés
   */
  irany(tav, x, y, tomegKerules = 1) {
    const racs = this.racs;
    const sz = racs.sz, mm = racs.m;
    const itt = tav[y * sz + x];
    if (itt <= 0) return -1;
    let legjobb = -1, legjobbErtek = 1e9;
    for (let k = 0; k < 8; k++) {
      const nx = x + DX[k], ny = y + DY[k];
      if (nx < 0 || ny < 0 || nx >= sz || ny >= mm) continue;
      const ni = ny * sz + nx;
      const t = tav[ni];
      if (t < 0) continue;
      // ⚠️ CSAK ELŐRE. Az első változat a tömeget beszámította a döntésbe, és
      // engedte az „oldalra/hátra" lépést is, ha ott kevesebben álltak. Mérve:
      // 800 utasnál a mozgásban lévők 93 %-a MEGÁLLT, mert a zsúfolt cellák
      // körül egyetlen szomszéd sem volt jobb a sajátjánál — a tömegkerülés
      // holtpontra futott, pont ott, ahol a legnagyobb szükség lett volna rá.
      // A szigorúan csökkenő távolság kizárja a holtpontot: a BFS garantálja,
      // hogy létezik `itt-1` értékű szomszéd, ha egyáltalán van út.
      if (t >= itt) continue;
      if (k >= 4) {
        if (!racs.jarhato(x + DX[k], y) || !racs.jarhato(x, y + DY[k])) continue;
      }
      // A tömeg így már csak DÖNTETLENT bont az egyformán jó lépések közt —
      // ettől terül szét a menet a párhuzamos folyosókra, de senki nem áll meg.
      // A korlát azért kell, hogy egy 200 fős torlódás se nyomja el a távolságot.
      const zsufolt = racs.tomeg[ni] > 10 ? 10 : racs.tomeg[ni];
      const ertek = t * 4 + zsufolt * tomegKerules;
      if (ertek < legjobbErtek) { legjobbErtek = ertek; legjobb = k; }
    }
    return legjobb;
  }

  static dx(k) { return DX[k]; }
  static dy(k) { return DY[k]; }
}

export { DX, DY };

/** Cellaindex → x. A rács szélessége állandó, ezért itt is használható. */
export function cellaX(i) { return i % RACS_SZ; }
export function cellaY(i) { return (i - (i % RACS_SZ)) / RACS_SZ; }
