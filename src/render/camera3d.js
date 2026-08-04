// AGE OF THE CRYSTALS — RTS-KAMERA.
//
// Klasszikus stratégia-nézet: a kamera egy TALAJPONT (a `cel`) körül kering.
// Nem a kamerát mozgatjuk, hanem a célpontot — ettől lesz a pásztázás és a
// forgatás ugyanaz a mozdulat, és ettől nem lehet „elveszni" a világban.
//
//   WASD / nyilak / képernyőszél   → pásztázás
//   görgő / +,-                    → zoom
//   Q,E vagy JOBB-gomb húzás       → forgatás (+ függőleges húzás: dőlés)
//   szóköz                         → vissza a SAJÁT központhoz
//
// ── MIÉRT NEM A PÁLYA KÖZEPE AZ OTTHON ────────────────────────────────────
// A v0.1-től a v0.6-ig az volt, és jó is volt: köd nélkül a pálya közepén
// terep, fák és kristályok látszottak. A v0.7/1 hadi köde ezt CSENDBEN
// játszhatatlanná tette: a saját központ `n*0.22`-nél áll, a pálya közepe
// felderítetlen, tehát a játék TELJESEN FEKETE KÉPERNYŐVEL indult — 3 %
// felfedezettséggel, a sereg a képen kívül. Se hibaüzenet, se bukó kapu:
// a determinizmus-szonda ezt elvből nem látja, mert minden gépen egyforma.
// Ezért az „otthon" a saját központ, és a szóköz is oda visz vissza.
//
// ── MIÉRT NEM SZABAD PARAMÉTER A DŐLÉS ────────────────────────────────────
// A dőlést a ZOOM-TÁVOLSÁGBÓL számoljuk (közel laposabb, távol madártávlat), a
// jobb-gombos húzás csak ELTOLJA (`_dolesEltolas`). Enélkül a játékos két
// mozdulat után „horizontra néző" állapotba kerül, ahonnan a fél pálya a
// köd mögött van, és fogalma sincs, hogyan másszon vissza.
//
// ── MIÉRT A VÍZSZINTES LÁTÓSZÖGET TARTJUK ─────────────────────────────────
// Fix FÜGGŐLEGES látószöggel egy széles monitoron sokkal többet látni
// oldalra, mint egy 4:3-ason — vagyis a képarány JÁTÉKELŐNY lenne. Ezért a
// `__atmeretez` a vízszintes látószöget tartja állandónak, és a függőlegeset
// számolja hozzá (egy biztonságos sávra vágva, hogy álló képernyőn se váljon
// távcsővé).
//
// ── SIMÍTÁS ───────────────────────────────────────────────────────────────
// Minden állapotnak van CÉL- és AKTUÁLIS értéke, a kettő között keretidő-
// független exponenciális közelítés (`1 - exp(-dt*k)`). A `dt`-t a kamera
// MAGA méri (`performance.now()`), mert a `frissit(sim, alfa)` szerződés nem
// ad keretidőt — a render-rétegnek pedig szabad az órához nyúlnia.
//
// A kamera háromszöget nem rajzol; a `haromszog` így mindig 0. Az `enabled`
// nem bont le semmit, csak süketté teszi a bemenetre (a szonda méréskor ezzel
// zárja ki, hogy egy beragadt billentyű elmozdítsa a képet).

import { THREE, feloldVaszon, jegyezdKamera } from './core3d.js';
import { EPULET } from '../sim/epuletek.js';

const FOK = Math.PI / 180;

/**
 * A csapat központjának helye, vagy `null`, ha nincs (még nem épült fel, vagy
 * a hívó olyan simmel jött, aminek nincs épület-táblája). A KÖZPONT azért jó
 * horgony, mert a felállásból mindig van belőle pontosan egy csapatonként, és
 * a köd is körülötte nyílik ki elsőnek.
 */
function kozpontHelye(sim, csapat) {
  const ep = sim && sim.epuletek;
  if (!ep || !ep.db) return null;
  for (let i = 0; i < ep.db; i++) {
    if (ep.tipus[i] === EPULET.KOZPONT && ep.csapat[i] === csapat && ep.el(i)) {
      return { x: ep.x[i], z: ep.y[i] };
    }
  }
  return null;
}

/** A tartani kívánt VÍZSZINTES látószög. */
const VIZSZINTES_FOV = 68 * FOK;
/** A számolt függőleges látószög biztonsági sávja. */
const FOV_MIN = 34 * FOK, FOV_MAX = 62 * FOK;

export class Kamera3D {
  /**
   * @param {HTMLCanvasElement|any} vaszon vászon (vagy jelenet/mag — feloldjuk)
   * @param {import('../sim/sim.js').Sim|any} [sim] a pálya méretéhez és a talaj-magassághoz
   * @param {{tav?:number, forgas?:number, kozep?:boolean, sajatCsapat?:number}} [opciok]
   */
  constructor(vaszon, sim, opciok = {}) {
    this.vaszon = feloldVaszon(vaszon);

    // A far 900 elég: a pálya átlója 362, a köd 380-nál teljesen bezár. A
    // near 0,6 — a far/near arány így 1500, ami még bőven mélységpuffer-barát.
    this.objektum = new THREE.PerspectiveCamera(48, 1, 0.6, 900);

    const n = (sim && sim.racs && sim.racs.n) ? sim.racs.n : 256;
    this._n = n;
    this.racs = (sim && sim.racs) ? sim.racs : null;

    // Az „otthon": ide nézünk induláskor, és ide visz vissza a szóköz. A saját
    // központ, ha van — pálya-közép csak akkor, ha nincs (lásd a fejlécet).
    const k = n * 0.5;
    const kp = kozpontHelye(sim, opciok.sajatCsapat ?? 0);
    this.otthonX = kp ? kp.x : k;
    this.otthonZ = kp ? kp.z : k;

    // cél-állapot (ide tart) és aktuális (itt van)
    this.celX = this.otthonX; this.celZ = this.otthonZ; this.celY = 0;
    this.x = this.otthonX; this.z = this.otthonZ; this.y = 0;
    this.tTav = opciok.tav ?? 70; this.tav = this.tTav;
    this.tForgas = opciok.forgas ?? (-35 * FOK); this.forgas = this.tForgas;

    this.minTav = 14; this.maxTav = 150;
    this.kozelDoles = 34 * FOK; this.tavolDoles = 58 * FOK;
    this.minDoles = 20 * FOK; this.maxDoles = 78 * FOK;
    this._dolesEltolas = 0; this.maxDolesEltolas = 15 * FOK;
    this.doles = this._celDoles();

    // A pálya peremén túlra ne lehessen kisétálni a célponttal.
    this.hatar = { x0: 2, z0: 2, x1: n - 2, z1: n - 2 };

    this.panSebesseg = 0.95;   // a zoom-távolság szorzója (világegység/mp)
    this.simitas = 12;         // exponenciális közelítés együtthatója

    this._billentyuk = new Set();
    this._egerX = -1; this._egerY = -1; this._egerBent = false;
    this._forgatas = false; this._elozoX = 0; this._elozoY = 0;
    this._enabled = true;
    this._utolsoIdo = 0;

    this._kotesek();
    if (opciok.kozep !== false) this.kozepre(this.otthonX, this.otthonZ);
    this._alkalmaz();
    this.atmeret();
    // Felírjuk magunkat: a terep- és tájelem-réteg innen veszi a kamerát, ha a
    // `main.js` nem adta át neki (lásd `core3d.js` „aktív kamera" blokk).
    jegyezdKamera(this);
  }

  // ── BEMENET ──────────────────────────────────────────────────────────────

  _kotesek() {
    this._bontok = [];
    const v = this.vaszon;
    if (typeof window === 'undefined') return;

    const le = (e) => {
      if (!this._enabled) return;
      this._billentyuk.add(e.code);
      // A szóköz és a nyilak alapból GÖRGETIK az oldalt — a játékvászon fölött
      // ez azt jelenti, hogy a HUD elcsúszik a kamera alól.
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (e.code === 'Space') this.kozepre(this.otthonX, this.otthonZ);
    };
    const fel = (e) => this._billentyuk.delete(e.code);
    // A fókusz elvesztésekor a billentyűk BENT RAGADNAK (a `keyup` már a másik
    // ablakba megy), és a kamera magától elsodródik. Klasszikus, nehezen
    // reprodukálható hibajelentés — ezért ürítjük.
    const vak = () => this._billentyuk.clear();
    // Saját átméretezés-figyelő: a képarány akkor se ferdüljön el, ha a
    // gazda-kód elfelejti szólni.
    const meret = () => this.atmeret();
    window.addEventListener('keydown', le);
    window.addEventListener('keyup', fel);
    window.addEventListener('blur', vak);
    window.addEventListener('resize', meret, { passive: true });
    this._bontok.push(() => {
      window.removeEventListener('keydown', le);
      window.removeEventListener('keyup', fel);
      window.removeEventListener('blur', vak);
      window.removeEventListener('resize', meret);
    });
    if (!v) return;

    const gorgo = (e) => {
      if (!this._enabled) return;
      e.preventDefault();
      // Exponenciális zoom: a görgő egy KATTANÁSA mindig ugyanakkora arányt
      // változtat, akár 15, akár 140 egységről indulunk.
      this.tTav = this._vag(this.tTav * Math.exp(e.deltaY * 0.0012), this.minTav, this.maxTav);
    };
    v.addEventListener('wheel', gorgo, { passive: false });

    const mozog = (e) => {
      this._egerX = e.offsetX; this._egerY = e.offsetY; this._egerBent = true;
      if (this._forgatas && this._enabled) {
        this.tForgas -= (e.clientX - this._elozoX) * 0.005;
        this._dolesEltolas = this._vag(this._dolesEltolas + (e.clientY - this._elozoY) * 0.004,
          -this.maxDolesEltolas, this.maxDolesEltolas);
      }
      this._elozoX = e.clientX; this._elozoY = e.clientY;
    };
    const ki = () => { this._egerBent = false; };
    const nyom = (e) => {
      if (e.button !== 2 && e.button !== 1) return;
      this._forgatas = true; this._elozoX = e.clientX; this._elozoY = e.clientY;
      try { v.setPointerCapture(e.pointerId); } catch { /* nem kritikus */ }
    };
    const enged = (e) => {
      if (e.button !== 2 && e.button !== 1) return;
      this._forgatas = false;
      try { v.releasePointerCapture(e.pointerId); } catch { /* nem kritikus */ }
    };
    const menu = (e) => e.preventDefault();
    v.addEventListener('pointermove', mozog);
    v.addEventListener('pointerleave', ki);
    v.addEventListener('pointerdown', nyom);
    v.addEventListener('pointerup', enged);
    v.addEventListener('contextmenu', menu);
    this._bontok.push(() => {
      v.removeEventListener('wheel', gorgo);
      v.removeEventListener('pointermove', mozog);
      v.removeEventListener('pointerleave', ki);
      v.removeEventListener('pointerdown', nyom);
      v.removeEventListener('pointerup', enged);
      v.removeEventListener('contextmenu', menu);
    });
  }

  // ── KÉPARÁNY ─────────────────────────────────────────────────────────────

  /**
   * Képarány újraszámolása a vászon MAI méretéből. A `main.js` ezt hívja
   * `resize`-kor; a `Mag3D` a `__atmeretez`-t. A kettő ugyanoda fut ki, és
   * idempotens — nem baj, ha mindkettő megtörténik.
   */
  atmeret() {
    const v = this.vaszon;
    if (!v) return;
    const w = v.clientWidth || v.width || 0, h = v.clientHeight || v.height || 0;
    if (w > 4 && h > 4) this.__atmeretez(w / h);
  }

  /**
   * A `Mag3D` hívja átméretezéskor. Lásd a fejléc látószög-blokkját.
   * @param {number} arany szélesség/magasság
   */
  __atmeretez(arany) {
    const a = arany > 0.05 ? arany : 1;
    const fuggoleges = 2 * Math.atan(Math.tan(VIZSZINTES_FOV * 0.5) / a);
    this.objektum.aspect = a;
    this.objektum.fov = this._vag(fuggoleges, FOV_MIN, FOV_MAX) / FOK;
    this.objektum.updateProjectionMatrix();
  }

  // ── MOZGÁS ───────────────────────────────────────────────────────────────

  /** Ugrás egy pontra (simítás nélkül). */
  kozepre(x, z) {
    this.celX = this.x = this._vag(x, this.hatar.x0, this.hatar.x1);
    this.celZ = this.z = this._vag(z, this.hatar.z0, this.hatar.z1);
    this.celY = this.y = this._talaj(this.celX, this.celZ);
    this._alkalmaz();
  }

  /**
   * @param {any} sim a sim (a rács magasságához) — lehet ugyanaz, mint konstruktorban
   * @param {number} alfa a rétegszerződés miatt van itt; a kamera nem használja
   */
  /* eslint-disable no-unused-vars */
  frissit(sim, alfa) {
    if (sim && sim.racs) this.racs = sim.racs;

    // Saját óra: a szerződés nem ad keretidőt. A 0,1 mp-es plafon azért kell,
    // mert egy háttérbe tett fül után `dt` akár több MÁSODPERC is lehet, és a
    // kamera egy képkocka alatt átugrana a pálya túlsó végébe.
    const most = performance.now();
    let dt = this._utolsoIdo ? (most - this._utolsoIdo) * 0.001 : 0.016;
    this._utolsoIdo = most;
    if (dt > 0.1) dt = 0.1;

    if (this._enabled) { this._billentyus(dt); this._szelrol(dt); }

    // exponenciális közelítés — keretidő-független
    const k = 1 - Math.exp(-dt * this.simitas);
    this.celX = this._vag(this.celX, this.hatar.x0, this.hatar.x1);
    this.celZ = this._vag(this.celZ, this.hatar.z0, this.hatar.z1);
    this.x += (this.celX - this.x) * k;
    this.z += (this.celZ - this.z) * k;
    // A talajkövetés LASSABB, mint a pásztázás: így egy sziklaperem fölött
    // elhaladva a kamera nem pattan fel-le, csak lágyan emelkedik.
    this.celY = this._talaj(this.x, this.z);
    this.y += (this.celY - this.y) * (1 - Math.exp(-dt * 4));
    this.tav += (this.tTav - this.tav) * k;
    this.forgas += (this.tForgas - this.forgas) * k;
    this.doles += (this._celDoles() - this.doles) * k;

    this._alkalmaz();
  }
  /* eslint-enable no-unused-vars */

  _billentyus(dt) {
    const b = this._billentyuk;
    let ex = 0, ez = 0;
    if (b.has('KeyW') || b.has('ArrowUp')) ez += 1;
    if (b.has('KeyS') || b.has('ArrowDown')) ez -= 1;
    if (b.has('KeyD') || b.has('ArrowRight')) ex += 1;
    if (b.has('KeyA') || b.has('ArrowLeft')) ex -= 1;
    if (ex || ez) this._pan(ex, ez, dt);
    if (b.has('KeyQ')) this.tForgas += dt * 1.2;
    if (b.has('KeyE')) this.tForgas -= dt * 1.2;
    if (b.has('Equal') || b.has('NumpadAdd')) this.tTav = Math.max(this.minTav, this.tTav * Math.exp(-dt * 1.2));
    if (b.has('Minus') || b.has('NumpadSubtract')) this.tTav = Math.min(this.maxTav, this.tTav * Math.exp(dt * 1.2));
  }

  _szelrol(dt) {
    if (!this._egerBent || !this.vaszon || this._forgatas) return;
    const w = this.vaszon.clientWidth, h = this.vaszon.clientHeight;
    if (w < 8 || h < 8) return;
    const S = 14;                     // az érzékeny sáv szélessége képpontban
    let ex = 0, ez = 0;
    if (this._egerX < S) ex -= 1; else if (this._egerX > w - S) ex += 1;
    if (this._egerY < S) ez += 1; else if (this._egerY > h - S) ez -= 1;
    if (ex || ez) this._pan(ex, ez, dt);
  }

  /** Pásztázás a KÉPERNYŐ irányaiban (nem a világ tengelyein). */
  _pan(ex, ez, dt) {
    const h = Math.hypot(ex, ez) || 1;
    // A sebesség a zoom-távolsággal skálázódik: kizoomolva a fél pálya egy
    // mozdulat, bezoomolva viszont képpont-pontos a igazítás.
    const s = this.tav * this.panSebesseg * dt / h;
    const sf = Math.sin(this.forgas), cf = Math.cos(this.forgas);
    // előre = a kamerától elfelé, jobbra = arra merőleges (lásd fejléc)
    this.celX += (-sf * ez + cf * ex) * s;
    this.celZ += (-cf * ez - sf * ex) * s;
  }

  _celDoles() {
    const t = (this.tav - this.minTav) / (this.maxTav - this.minTav);
    const alap = this.kozelDoles + (this.tavolDoles - this.kozelDoles) * this._vag(t, 0, 1);
    return this._vag(alap + this._dolesEltolas, this.minDoles, this.maxDoles);
  }

  _alkalmaz() {
    const cd = Math.cos(this.doles), sd = Math.sin(this.doles);
    const o = this.objektum;
    o.position.set(
      this.x + Math.sin(this.forgas) * cd * this.tav,
      this.y + sd * this.tav,
      this.z + Math.cos(this.forgas) * cd * this.tav,
    );
    o.lookAt(this.x, this.y, this.z);
    // A rétegek (terep-LOD, tájelem-LOD) MÉG EBBEN a képkockában frusztum-
    // tesztet futtatnak a kamerával. Ha nem frissítjük itt a világmátrixot,
    // egy képkockányit késnének — kizoomoláskor ez látható „bevillanás".
    o.updateMatrixWorld(true);
  }

  _talaj(x, z) {
    if (!this.racs) return 0;
    return this.racs.magassagPont(x | 0, z | 0);
  }

  _vag(v, a, b) { return v < a ? a : (v > b ? b : v); }

  // ── RÉTEG-SZERZŐDÉS ──────────────────────────────────────────────────────

  set enabled(v) { this._enabled = !!v; if (!v) this._billentyuk.clear(); }
  get enabled() { return this._enabled; }
  /** A kamera nem rajzol geometriát. */
  get haromszog() { return 0; }

  bont() {
    for (const f of (this._bontok || [])) { try { f(); } catch { /* nem kritikus */ } }
    if (this._bontok) this._bontok.length = 0;
  }
}
