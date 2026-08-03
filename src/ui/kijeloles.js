// AGE OF THE CRYSTALS — KIJELÖLÉS ÉS CTRL-CSOPORTOK.
//
// ── MIÉRT NEM A SIMBEN VAN ────────────────────────────────────────────────
// Az, hogy ÉN mit jelöltem ki, nem a világ állapota — a másik játékos kijelölése
// engem nem érdekel, és a v0.8-ban semmiképp nem szabad átmennie a hálózaton. Ha
// a kijelölés a simben ülne, minden egérhúzás desync-kockázat lenne, és a
// szimuláció nem futna le node-ban.
//
// Ezért itt EGYIRÁNYÚ a viszony: ez a réteg OLVASSA a sim állapotát (hol állnak
// az egységek), és PARANCSOT ad be (`sim.parancs(...)`). Soha nem ír bele.
// A sim csak index-tömböket lát, és sosem tudja meg, hogy volt-e egérhúzás.
//
// ── A KERET-KIJELÖLÉS MATEKJA ─────────────────────────────────────────────
// A 3D→2D vetítéshez nem `Vector3.project()`-et hívunk egységenként: az 1600
// egységnyi ideiglenes objektum pont az a szemét, amit a projekt mindenhol
// kerül. Helyette EGYSZER összeszorozzuk a nézeti és a vetítési mátrixot, és
// utána nyers aritmetikával transzformálunk — nulla allokációval.
//
// ⚠️ A `w` előjelét NÉZNI KELL. A kamera MÖGÖTT lévő pontok `w < 0`-val jönnek
// vissza, és az osztás után pont a képernyő KÖZEPÉN landolnának. Enélkül egy
// hátrafelé húzott keret kijelölné a hátunk mögötti sereget is — klasszikus, és
// játék közben teljesen érthetetlen hiba.

import { THREE } from '../render/core3d.js';

/** Ekkora húzás alatt még KATTINTÁSNAK számít, nem keretnek (képpont). */
export const KERET_KUSZOB = 5;
/** Egy kattintás ekkora képernyő-sugárban keres egységet. */
const KATTINTAS_SUGAR = 26;

export class Kijeloles {
  /**
   * @param {import('../sim/sim.js').Sim} sim
   * @param {number} sajatCsapat a játékos csapata — csak ezt lehet kijelölni
   */
  constructor(sim, sajatCsapat = 0) {
    this.sim = sim;
    this.sajatCsapat = sajatCsapat;

    /**
     * A kijelölt egység-indexek. Sima tömb, mert a `sim.parancs()` úgyis
     * index-tömböt vár, és a mérete ritkán változik — nem a forró út.
     */
    this.lista = [];
    /** Gyors tagsági kérdés a jelölő-rendernek: `benne[i] === 1`. */
    this.benne = new Uint8Array(sim.maxEgyseg);

    /** Ctrl-csoportok: 0..9 → index-tömb. Tömb, nem `Map` — fix, kis méret. */
    this.csoportok = new Array(10);
    for (let i = 0; i < 10; i++) this.csoportok[i] = [];

    /** Munka-mátrix a vetítéshez. Egy darab, újrahasznosítva. */
    this._m = new THREE.Matrix4();
    this._sugarPont = new THREE.Vector3();
  }

  get db() { return this.lista.length; }

  urit() {
    const l = this.lista;
    for (let k = 0; k < l.length; k++) this.benne[l[k]] = 0;
    l.length = 0;
  }

  /**
   * Él-e még az egység? v0.4 óta a halott slot megmarad, de nem jelölhető ki —
   * különben a játékos hullákra adna parancsot, és nem értené, miért nem
   * történik semmi.
   */
  _el(i) {
    const h = this.sim.harc;
    return !h || h.elo[i] === 1;
  }

  /** Egyetlen egység hozzáadása (ismétlés nélkül). */
  hozzaad(i) {
    if (i < 0 || i >= this.sim.egysegek.db) return;
    if (!this._el(i)) return;
    if (this.benne[i]) return;
    this.benne[i] = 1;
    this.lista.push(i);
  }

  /** A halott/eltűnt indexek kiszórása — a `db` csökkenhet újrafelállásnál. */
  rendez() {
    const db = this.sim.egysegek.db;
    const l = this.lista;
    let ir = 0;
    for (let k = 0; k < l.length; k++) {
      const i = l[k];
      if (i < db && this.sim.egysegek.csapat[i] === this.sajatCsapat && this._el(i)) l[ir++] = i;
      else this.benne[i] = 0;
    }
    l.length = ir;
  }

  // ── VETÍTÉS ────────────────────────────────────────────────────────────

  /**
   * A nézet-vetítés mátrix frissítése. A keret- és kattintás-kijelölés előtt
   * EGYSZER kell hívni, utána a `_kepernyore` már csak szoroz.
   * @param {THREE.Camera} kamera
   */
  _matrix(kamera) {
    kamera.updateMatrixWorld();
    this._m.multiplyMatrices(kamera.projectionMatrix, kamera.matrixWorldInverse);
  }

  /**
   * Világpont → képernyő-képpont. A `ki.hatul` jelzi, ha a pont a kamera
   * mögött van — arra a `ki.x/ki.y` értelmetlen, és a hívónak el kell dobnia.
   * @param {number} wx világ x
   * @param {number} wy világ magasság (3D y)
   * @param {number} wz világ z (a sim y-ja)
   */
  _kepernyore(wx, wy, wz, szel, mag, ki) {
    const e = this._m.elements;
    // Oszlopfolytonos (column-major) THREE-mátrix: e[0..3] az első OSZLOP.
    const x = e[0] * wx + e[4] * wy + e[8] * wz + e[12];
    const y = e[1] * wx + e[5] * wy + e[9] * wz + e[13];
    const w = e[3] * wx + e[7] * wy + e[11] * wz + e[15];
    if (w <= 1e-6) { ki.hatul = true; return ki; }
    ki.hatul = false;
    const iw = 1 / w;
    ki.x = (x * iw * 0.5 + 0.5) * szel;
    ki.y = (0.5 - y * iw * 0.5) * mag;
    return ki;
  }

  // ── KIJELÖLÉS ──────────────────────────────────────────────────────────

  /**
   * Keret-kijelölés. A keret a KÉPERNYŐN van megadva, képpontban.
   * @param {THREE.Camera} kamera
   * @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1
   * @param {number} szel a vászon szélessége @param {number} mag magassága
   * @param {boolean} hozzaadva Shift: a meglévő kijelöléshez adjuk
   * @returns {number} a kijelölt egységek száma
   */
  keretbol(kamera, x0, y0, x1, y1, szel, mag, hozzaadva) {
    if (!hozzaadva) this.urit();
    this._matrix(kamera);
    const bx0 = Math.min(x0, x1), bx1 = Math.max(x0, x1);
    const by0 = Math.min(y0, y1), by1 = Math.max(y0, y1);

    const e = this.sim.egysegek;
    const racs = this.sim.racs;
    const ki = { x: 0, y: 0, hatul: false };
    for (let i = 0; i < e.db; i++) {
      if (e.csapat[i] !== this.sajatCsapat) continue;
      const wx = e.px[i], wz = e.py[i];
      // A figura KÖZEPE felé célzunk (a talaj fölött), nem a talpára: alacsony
      // kameraállásnál a talppont a terep mögé kerülhet.
      const wy = racs.magassagPont(wx, wz) + 0.45;
      this._kepernyore(wx, wy, wz, szel, mag, ki);
      if (ki.hatul) continue;
      if (ki.x >= bx0 && ki.x <= bx1 && ki.y >= by0 && ki.y <= by1) this.hozzaad(i);
    }
    return this.lista.length;
  }

  /**
   * Kattintás-kijelölés: a kurzorhoz LEGKÖZELEBBI saját egység egy kis
   * sugáron belül. Döntetlennél a kisebb index nyer — hogy ugyanaz a kattintás
   * mindig ugyanazt válassza.
   * @returns {number} a kiválasztott index, vagy -1
   */
  kattintasbol(kamera, kx, ky, szel, mag, hozzaadva) {
    this._matrix(kamera);
    const e = this.sim.egysegek;
    const racs = this.sim.racs;
    const ki = { x: 0, y: 0, hatul: false };
    let legjobb = -1, legjobbD2 = KATTINTAS_SUGAR * KATTINTAS_SUGAR;
    for (let i = 0; i < e.db; i++) {
      if (e.csapat[i] !== this.sajatCsapat) continue;
      const wx = e.px[i], wz = e.py[i];
      const wy = racs.magassagPont(wx, wz) + 0.45;
      this._kepernyore(wx, wy, wz, szel, mag, ki);
      if (ki.hatul) continue;
      const dx = ki.x - kx, dy = ki.y - ky;
      const d2 = dx * dx + dy * dy;
      if (d2 < legjobbD2) { legjobbD2 = d2; legjobb = i; }
    }
    if (!hozzaadva) this.urit();
    if (legjobb >= 0) this.hozzaad(legjobb);
    return legjobb;
  }

  /**
   * Az összes saját egység kijelölése (a „mindent kijelöl" gyorsbillentyűhöz).
   */
  mind() {
    this.urit();
    const e = this.sim.egysegek;
    for (let i = 0; i < e.db; i++) if (e.csapat[i] === this.sajatCsapat) this.hozzaad(i);
    return this.lista.length;
  }

  // ── CTRL-CSOPORTOK ─────────────────────────────────────────────────────

  /**
   * A mostani kijelölés elmentése a `n`-edik csoportba (0..9). A csoport a
   * kijelölés MÁSOLATA — ha később átjelölök, a csoport nem változik.
   */
  csoportMent(n) {
    if (n < 0 || n > 9) return 0;
    const cs = this.csoportok[n];
    cs.length = 0;
    for (let k = 0; k < this.lista.length; k++) cs.push(this.lista[k]);
    return cs.length;
  }

  /**
   * A `n`-edik csoport betöltése kijelölésként. Az azóta eltűnt indexeket
   * kiszűri, de a csoportot magát nem írja át — egy újrafelállás után a
   * `frissitCsoportok()` takarít.
   */
  csoportBetolt(n, hozzaadva) {
    if (n < 0 || n > 9) return 0;
    if (!hozzaadva) this.urit();
    const cs = this.csoportok[n];
    const db = this.sim.egysegek.db;
    for (let k = 0; k < cs.length; k++) {
      const i = cs[k];
      if (i < db && this.sim.egysegek.csapat[i] === this.sajatCsapat) this.hozzaad(i);
    }
    return this.lista.length;
  }

  /** Egy csoport súlypontja — a kamera-ugráshoz (dupla csoport-gomb). */
  csoportKozep(n) {
    const cs = this.csoportok[n];
    const e = this.sim.egysegek;
    let sx = 0, sy = 0, db = 0;
    for (let k = 0; k < cs.length; k++) {
      const i = cs[k];
      if (i >= e.db) continue;
      sx += e.px[i]; sy += e.py[i]; db++;
    }
    return db ? { x: sx / db, y: sy / db, db } : null;
  }

  /** A kijelölés súlypontja. */
  kozep() {
    const e = this.sim.egysegek;
    let sx = 0, sy = 0;
    const l = this.lista;
    if (!l.length) return null;
    for (let k = 0; k < l.length; k++) { sx += e.px[l[k]]; sy += e.py[l[k]]; }
    return { x: sx / l.length, y: sy / l.length, db: l.length };
  }

  /** Újrafelállás után: minden csoportból kiesnek a már nem létező indexek. */
  frissitCsoportok() {
    const db = this.sim.egysegek.db;
    for (let n = 0; n < 10; n++) {
      const cs = this.csoportok[n];
      let ir = 0;
      for (let k = 0; k < cs.length; k++) if (cs[k] < db) cs[ir++] = cs[k];
      cs.length = ir;
    }
    this.rendez();
  }
}

/**
 * SUGÁR-METSZÉS A TEREPPEL — hova mutat az egér a pályán.
 *
 * ── MIÉRT NEM `THREE.Raycaster` A TEREP-HÁLÓRA ────────────────────────────
 * A terep chunkokra van bontva és LOD-ol; a raycast a LÁTHATÓ (esetleg
 * egyszerűsített) hálót találná el, tehát kizoomolva MÁS pontot adna, mint
 * bezoomolva. A parancs célpontja nem függhet a kamera távolságától. Ezért a
 * MAGASSÁGMEZŐRE metszünk, ami a sim igazsága — és amiből a háló is épült.
 *
 * Durva menetelés előre az első alámerülésig, aztán felezés. A menetelés
 * lépése azért nem lehet nagy, mert egy vékony sziklagerinc fölött a sugár
 * „átugorhatna", és a mögötte lévő völgyet találná el.
 *
 * @param {THREE.Camera} kamera
 * @param {import('../sim/grid.js').Racs} racs
 * @param {number} ndcX [-1,1] @param {number} ndcY [-1,1]
 * @param {{x:number,y:number}} ki
 * @returns {boolean} talált-e pontot a pályán
 */
export function talajPont(kamera, racs, ndcX, ndcY, ki, _seged) {
  const p = _seged || (talajPont._p || (talajPont._p = new THREE.Vector3()));
  p.set(ndcX, ndcY, 0.5).unproject(kamera);
  const ox = kamera.position.x, oy = kamera.position.y, oz = kamera.position.z;
  let dx = p.x - ox, dy = p.y - oy, dz = p.z - oz;
  const h = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (h < 1e-9) return false;
  dx /= h; dy /= h; dz /= h;

  const n = racs.n;
  const LEPES = 1.25;
  const MAX = 900;
  const magas = (x, z) => {
    if (x < 0 || z < 0 || x > n - 1 || z > n - 1) return -1e9;
    return racs.magassagPont(x, z);
  };

  let t = 0.5;
  let elozoT = t;
  let elozoK = (oy + dy * t) - magas(ox + dx * t, oz + dz * t);
  if (elozoK < 0) {
    // A kamera már a terep alatt indul (meredek fal tövében) — nincs értelmes
    // metszéspont, inkább ne adjunk vissza semmit, mint rosszat.
    return false;
  }

  while (t < MAX) {
    t += LEPES;
    const x = ox + dx * t, z = oz + dz * t;
    const k = (oy + dy * t) - magas(x, z);
    if (k <= 0) {
      // Felezés a két oldal között — 18 lépés bőven pixel-pontos.
      let a = elozoT, b = t;
      for (let it = 0; it < 18; it++) {
        const m = (a + b) * 0.5;
        const km = (oy + dy * m) - magas(ox + dx * m, oz + dz * m);
        if (km > 0) a = m; else b = m;
      }
      const vt = (a + b) * 0.5;
      ki.x = ox + dx * vt;
      ki.y = oz + dz * vt;
      if (ki.x < 0) ki.x = 0; else if (ki.x > n - 1) ki.x = n - 1;
      if (ki.y < 0) ki.y = 0; else if (ki.y > n - 1) ki.y = n - 1;
      return true;
    }
    elozoT = t; elozoK = k;
  }
  return false;
}
