// PORTAL HUB TYCOON — ÚTKERESÉS.
//
// ── MIÉRT ÍGY ─────────────────────────────────────────────────────────────
// Ezer utas mindegyikének külön A*-t futtatni nem fér bele: 1000 × 9000 cella
// tickenként. De nem is kell, mert a CÉLOK kevesen vannak. Egy állomáson
// 50-60 épület áll, és minden utas ezek VALAMELYIKÉHEZ tart.
//
// Ezért megfordítjuk a feladatot: minden épülethez EGYSZER kiszámolunk egy
// TÁVOLSÁGMEZŐT (BFS az épület peronjáról kifelé), és az utas onnantól csak
// annyit csinál, hogy a szomszédos cellák közül a kisebb számúra lép. Ez
// utasonként néhány tömb-olvasás, nem útkeresés.
//
// A mező mellékterméke ingyen ad két olyan választ, ami A*-ral drága lenne:
//   • „melyik a LEGKÖZELEBBI étterem?" → az utas cellájában olvasott érték a
//     VALÓDI úthossz, nem légvonal. A légvonal falak mögé küldene embereket.
//   • „egyáltalán elérhető-e?" → ha a mező -1, akkor nincs út. Enélkül az
//     elzárt boltokhoz beragadó utasok némán fogyasztanák a türelmüket.
//
// ── SZINTEK (v0.3) ────────────────────────────────────────────────────────
// A mező három dimenziós. A szintek között csak ÁTJÁRÓ cellákon (mozgólépcső,
// teleport lift) lehet lépni: két egymás fölötti cella akkor szomszéd, ha
// MINDKETTŐ átjáró.
//
// ⚠️ TUDATOS EGYSZERŰSÍTÉS: a BFS minden élt EGY lépésnek számol, a
// szintváltást is — pedig az a valóságban lassabb. Miért nem súlyozzuk? Mert
// a súlyozott mezőhöz Dijkstra kellene vödörsorral, az pedig jóval több kód és
// jóval több hibalehetőség egy olyan különbségért, amit a játékos nem lát. A
// lépcső lassúsága ehelyett ott jelenik meg, AHOL érződik is: az utas valódi
// IDŐT tölt az átjáróval (`utas.js`, `ATJARO_IDO`). A mező tehát kicsit
// alábecsüli az emeleti célok költségét — ez a torzítás jó irányba hat: a
// megépített emelet tényleg kap forgalmat.
//
// ── ÉRVÉNYTELENÍTÉS ───────────────────────────────────────────────────────
// A mező elavul, ha változik a rács (építés, bontás). A rács verziószámot
// léptet, a mező pedig megjegyzi, melyik verzióból készült. Egy építés után
// MINDEN mező elavul egyszerre — ha ezt egyetlen tickben újraszámolnánk, az
// egy látható akadás lenne. Ezért tickenként korlátozott számú mező épül
// újra; addig a régi mező szolgál. Egy tick erejéig kissé rossz út sokkal
// jobb, mint egy megakadó játék.

/** Ennyi mezőt számolunk újra egyetlen tickben. */
const UJRASZAMOLAS_KERET = 4;

/** 8 vízszintes szomszéd: először az egyenesek, aztán az átlók (a sorrend számít!). */
const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DY = [0, 0, 1, -1, 1, -1, 1, -1];
/** A 8. és 9. „irány" a függőleges: fel és le. */
export const IRANY_FEL = 8;
export const IRANY_LE = 9;

export class Utkereso {
  /** @param {import('./racs.js').Racs} racs */
  constructor(racs) {
    this.racs = racs;
    /** azonosító → { verzio, tav: Int16Array } */
    this.mezok = new Map();
    const n = racs.sz * racs.m * racs.szintek;
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
   * @returns {Int16Array} lépésszám cellánként, -1 = elérhetetlen
   */
  mezo(azon, celok) {
    const racs = this.racs;
    let m = this.mezok.get(azon);
    if (m && m.verzio === racs.verzio) return m.tav;
    // Elavult, de van régi és nincs keret: a régivel dolgozunk tovább.
    if (m && this._keret <= 0) return m.tav;
    if (!m) {
      m = { verzio: -1, tav: new Int16Array(racs.sz * racs.m * racs.szintek) };
      this.mezok.set(azon, m);
    }
    this._keret--;
    this._bfs(m.tav, celok);
    m.verzio = racs.verzio;
    return m.tav;
  }

  /** Szélességi bejárás a célokból kifelé, szintekkel együtt. */
  _bfs(tav, celok) {
    const racs = this.racs;
    const sz = racs.sz, mm = racs.m, szintCella = racs.szintCella;
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
      const cz = (c / szintCella) | 0;
      const maradek = c - cz * szintCella;
      const cx = maradek % sz, cy = (maradek - cx) / sz;
      const d = tav[c] + 1;

      for (let k = 0; k < 8; k++) {
        const nx = cx + DX[k], ny = cy + DY[k];
        if (nx < 0 || ny < 0 || nx >= sz || ny >= mm) continue;
        const ni = (cz * mm + ny) * sz + nx;
        if (tav[ni] !== -1) continue;
        if (!racs.jarhato(nx, ny, cz)) continue;
        // Átló csak akkor, ha nem vágunk le sarkot — különben az utasok
        // átbújnának két épület érintkező sarka között, és a 3D-ben úgy
        // néznének ki, mintha a falban mennének.
        if (k >= 4) {
          if (!racs.jarhato(cx + DX[k], cy, cz) || !racs.jarhato(cx, cy + DY[k], cz)) continue;
        }
        tav[ni] = d;
        sor[veg++] = ni;
      }

      // ── FÜGGŐLEGES ──────────────────────────────────────────────────────
      // Csak akkor, ha EZ a cella átjáró — a szomszédságot az átjáró teremti,
      // nem a puszta egymás fölött lét.
      if (racs.atjaro[c] === 1) {
        if (cz + 1 < racs.szintek) {
          const fi = c + szintCella;
          if (tav[fi] === -1 && racs.atjaro[fi] === 1 && racs.jarhato(cx, cy, cz + 1)) {
            tav[fi] = d; sor[veg++] = fi;
          }
        }
        if (cz > 0) {
          const li = c - szintCella;
          if (tav[li] === -1 && racs.atjaro[li] === 1 && racs.jarhato(cx, cy, cz - 1)) {
            tav[li] = d; sor[veg++] = li;
          }
        }
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
   * @returns {number} 0..7 vízszintes szomszéd, 8 = fel, 9 = le, -1 = nincs lépés
   */
  irany(tav, x, y, z, tomegKerules = 1) {
    const racs = this.racs;
    const sz = racs.sz, mm = racs.m, szintCella = racs.szintCella;
    const itt0 = (z * mm + y) * sz + x;
    const itt = tav[itt0];
    if (itt <= 0) return -1;
    let legjobb = -1, legjobbErtek = 1e9;
    for (let k = 0; k < 8; k++) {
      const nx = x + DX[k], ny = y + DY[k];
      if (nx < 0 || ny < 0 || nx >= sz || ny >= mm) continue;
      const ni = (z * mm + ny) * sz + nx;
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
        if (!racs.jarhato(x + DX[k], y, z) || !racs.jarhato(x, y + DY[k], z)) continue;
      }
      // A tömeg így már csak DÖNTETLENT bont az egyformán jó lépések közt —
      // ettől terül szét a menet a párhuzamos folyosókra, de senki nem áll meg.
      // A korlát azért kell, hogy egy 200 fős torlódás se nyomja el a távolságot.
      const zsufolt = racs.tomeg[ni] > 10 ? 10 : racs.tomeg[ni];
      const ertek = t * 4 + zsufolt * tomegKerules;
      if (ertek < legjobbErtek) { legjobbErtek = ertek; legjobb = k; }
    }

    // Függőleges lépés — a tömeg itt nem számít, mert az átjáró egy pont,
    // nem folyosó: nincs mellette párhuzamos alternatíva, amire terelni lehetne.
    if (racs.atjaro[itt0] === 1) {
      if (z + 1 < racs.szintek) {
        const fi = itt0 + szintCella;
        const t = tav[fi];
        if (t >= 0 && t < itt && racs.atjaro[fi] === 1 && t * 4 < legjobbErtek) {
          legjobbErtek = t * 4; legjobb = IRANY_FEL;
        }
      }
      if (z > 0) {
        const li = itt0 - szintCella;
        const t = tav[li];
        if (t >= 0 && t < itt && racs.atjaro[li] === 1 && t * 4 < legjobbErtek) {
          legjobbErtek = t * 4; legjobb = IRANY_LE;
        }
      }
    }
    return legjobb;
  }
}

export { DX, DY };
