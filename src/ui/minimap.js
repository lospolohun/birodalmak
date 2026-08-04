// AGE OF THE CRYSTALS — MINIMAP (v0.16).
//
// ── 2D VÁSZON, NEM 3D RÉTEG ───────────────────────────────────────────────
// A minimap nem a színtér része: külön `<canvas>` a HUD sarkában. Ez nem
// kényelmi döntés. Egy 3D-be tett minimap a fő kamera látóterébe kerülne, tehát
// a rajzhívásokat, a hadi ködöt és az árnyékokat is végig kellene vinni rajta —
// mindezt azért, hogy egy 200 képpontos képet mutassunk. A 2D-s út ezzel
// szemben egy memória-másolás és egy blit, GPU-állapotváltás nélkül.
//
// ── HÁROM ÜTEM, NEM EGY ───────────────────────────────────────────────────
// A v0.7-es minimap negyed másodpercenként ÚJRARAJZOLTA AZ EGÉSZET: terepet,
// ködöt, épületet, egységet. Ez akkor volt helyes, amikor a minimap csak egy
// tájékoztató folt volt. Játék-minimapként viszont a nézet-keretnek a kamerával
// EGYÜTT kell mozognia — negyed másodperces késéssel az a keret hazudik.
//
// Csakhogy ha mindent képkockánként csinálnánk, akkor a 36 864 képpont terep-
// mintavétele (magasság, lejtő, terep-típus, lelőhely) 144 Hz-en futna, azért,
// hogy olyat számoljon újra, ami A MECCS ALATT NEM VÁLTOZIK. Ezért három ütem:
//
//   TEREP     ritkán (5 mp), mert csak lelőhely-kimerülésre változik → `_terep`
//   HÁTTÉR    a köd változatára (fél mp), terep × köd × birtokolt terület
//   MOZGÓ     20 Hz-en, a kész háttér MÁSOLATÁRA — épületek és egységek
//   VEKTOR    KÉPKOCKÁNKÉNT: nézet-keret, riasztás-gyűrűk. Ez pár vonal.
//
// A kettéosztás azért lehetséges, mert a képpont-rétegek egy 192×192-es
// segédvászonra mennek, amit a látható (nagyobb, DPR-hű) vászonra blittelünk —
// így a terep szemcsés-élhű marad, a vonalak viszont élesek.
//
// ── A KATTINTÁS PARANCS-E? A BAL NEM, A JOBB IGEN ─────────────────────────
// A BAL gomb (és a húzás) a KAMERÁT mozgatja, a kamera pedig nem a szimuláció
// része. Ez az egyetlen felhasználói művelet a projektben, ami NEM megy át a
// parancs-soron — és ez helyes: a v0.8-ban a másik játékos kamerája minket nem
// érdekel, a hálózaton semmi keresnivalója.
//
// A JOBB gomb viszont MENETPARANCS, tehát megy a soron: `sim.parancs(...)`.
// ⚠️ A minimap SOSEM ír sim-állapotot közvetlenül. Ha valaha `sim.egysegek.px`-et
// akarnál itt írni, az a v0.8 lockstepjén azonnali desync.

import './minimap.css';
import {
  MINIMAP_MERET, SZIN_CSAPAT,
  minimapTerep, minimapHatter, minimapMozgo, minimapSzamlalo,
  minimapVilagra, minimapKeppontra, minimapNezetKeret,
} from './minimap_adat.js';

/** Hova kéri magát a HUD-vázon. */
export const PANEL = { nev: 'minimap', hely: 'jobb_also', cim: 'Térkép' };

/** A terep újrasütésének köze. Csak lelőhely-kimerülésre változna — lásd lent. */
const TEREP_MS = 5000;
/** A háttér (köd + terület) legsűrűbb frissítése. A köd fél mp-enként változik. */
const HATTER_MS = 200;
/** A mozgó réteg üteme. 20 Hz — a szem ennél gyorsabb pötty-mozgást nem követ. */
const MOZGO_MS = 50;
/** A vektor-réteg plafonja: 60 Hz. 144 Hz-en fölösleges kétszer ugyanazt húzni. */
const RAJZ_MS = 16;
/** Egy riasztás ennyi ideig látszik. */
const RIASZTAS_MS = 2600;
/** Egyszerre ennyi riasztást tartunk nyilván (körpuffer). */
const RIASZTAS_DB = 8;
/** A saját parancs-visszajelzés élettartama — rövidebb, csak nyugta. */
const JELZES_MS = 700;

/** A riasztás-fajták: szín és a doboz-keret `data-riado` értéke. */
const RIADO_SZIN = ['rgba(255,80,80,', 'rgba(255,200,90,', 'rgba(150,220,255,', 'rgba(130,255,170,'];
const RIADO_NEV = ['baj', 'figyelem', 'info', ''];

export class Minimap {
  /**
   * KÉT hívási forma, mert két gazdája lehet:
   *
   *   új (panel-szerződés):  new Minimap(gyoker, sim, bevitel, opciok)
   *   régi (v0.7 főhurok):   new Minimap(sim, kamera, opciok)
   *
   * ⚠️ Ez nem szépséghiba, hanem a párhuzamos munka ára: a `main.js` és a
   * `hud.js` MÁS agent fájlja, és amíg a váz nem áll át, a régi hívás is él.
   * Az elágazás egyetlen helyen van, itt — a törzs alatta egyféle.
   *
   * @param {HTMLElement|import('../sim/sim.js').Sim} a
   * @param {import('../sim/sim.js').Sim|any} b
   * @param {import('./bevitel.js').Bevitel|any} [c]
   * @param {{sajatCsapat?:number, kamera?:any, uzenet?:(s:string,f?:string)=>void}} [d]
   */
  constructor(a, b, c, d) {
    const panelMod = !!(a && typeof a.appendChild === 'function');
    /** @type {any} */
    const opciok = (panelMod ? d : c) || {};
    this.sim = panelMod ? b : a;
    this.bevitel = panelMod ? (c || null) : null;
    // A kamerát háromfelől fogadjuk el; a régi hívásnál a 2. paraméter az.
    this.kamera = opciok.kamera
      || (this.bevitel && this.bevitel.kamera)
      || (panelMod ? null : b)
      || null;
    this.csapat = opciok.sajatCsapat
      ?? (this.bevitel && this.bevitel.kijeloles ? this.bevitel.kijeloles.sajatCsapat : 0);
    this._uzenet = opciok.uzenet || null;

    this._enabled = true;
    const M = MINIMAP_MERET;

    // ── Munkapufferek. MIND itt születik: a `frissit()` nem allokál. ────
    this._terepPuffer = new Uint8ClampedArray(M * M * 4);
    this._keret = new Float64Array(8);
    this._vilagPont = { x: 0, y: 0 };
    this._kepPont = { x: 0, y: 0 };
    /** A legutóbbi rétegek működés-számai — a szonda és a HUD ezt olvashatja. */
    this.szamlalo = minimapSzamlalo();
    this._szamTerep = minimapSzamlalo();
    this._szamHatter = minimapSzamlalo();
    this._szamMozgo = minimapSzamlalo();

    // ── Riasztás-körpuffer ──────────────────────────────────────────────
    this._rX = new Float64Array(RIASZTAS_DB);
    this._rY = new Float64Array(RIASZTAS_DB);
    this._rIdo = new Float64Array(RIASZTAS_DB);
    this._rTart = new Float64Array(RIASZTAS_DB);
    this._rFajta = new Uint8Array(RIASZTAS_DB);
    this._rIr = 0;
    this._riadoNev = '';

    // ── Ütem-órák ───────────────────────────────────────────────────────
    this._terepIdo = -1e9;
    this._hatterIdo = -1e9;
    this._mozgoIdo = -1e9;
    this._rajzIdo = -1e9;
    this._kodValtozat = -1;
    this._racs = null;
    this._hatterKell = true;
    this._mozgoKell = true;

    this._huz = false;
    this._bontok = [];

    if (typeof document === 'undefined') { this.gyoker = null; this.vaszon = null; return; }

    // ── DOM ─────────────────────────────────────────────────────────────
    if (panelMod) {
      this.gyoker = a;
      this.gyoker.classList.add('aoc-minimap');
    } else {
      this.gyoker = document.createElement('div');
      this.gyoker.className = 'aoc-minimap aoc-minimap-onallo';
      // A régi `alap.css` `#minimap` szabálya adja a helyet és a méretet, ha
      // ez a fájl önállóan fut (fejlesztői oldal, régi `main.js`).
      this.gyoker.id = 'minimap';
      document.body.appendChild(this.gyoker);
    }

    this.vaszon = document.createElement('canvas');
    this.vaszon.className = 'aoc-minimap-vaszon';
    this.gyoker.appendChild(this.vaszon);
    this.ctx = this.vaszon.getContext('2d');

    // A KÉPPONT-RÉTEG saját, kis vászna. Innen blittelünk — így a terep
    // szemcsés marad, a fölé húzott vonalak viszont a látható vászon teljes
    // (DPR-hű) felbontásán rajzolódnak.
    this._off = document.createElement('canvas');
    this._off.width = M; this._off.height = M;
    this._offCtx = this._off.getContext('2d');
    this._hatterKep = this._offCtx.createImageData(M, M);
    this._kep = this._offCtx.createImageData(M, M);

    this._meret();
    this._kotesek();
  }

  // ── MÉRET ────────────────────────────────────────────────────────────────

  /**
   * A vászon HÁTTÉR-felbontása. Nem a CSS-méret: a vonalak élessége ezen múlik.
   * 512-nél megállunk — a fölött már csak memóriát eszik, információt nem ad.
   */
  _meret() {
    if (!this.vaszon) return;
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    const css = this.vaszon.clientWidth || this.gyoker.clientWidth || 208;
    let b = Math.round(css * dpr);
    if (b < 128) b = 128;
    if (b > 512) b = 512;
    if (this.vaszon.width === b && this.vaszon.height === b) return;
    this.vaszon.width = b; this.vaszon.height = b;
    this._b = b;
    // A képpont-réteget NEM simítjuk: az elmosás pont az információt kenné szét.
    this.ctx.imageSmoothingEnabled = false;
    this._rajzIdo = -1e9;
  }

  // ── BEVITEL ──────────────────────────────────────────────────────────────

  _kotesek() {
    const g = this.gyoker;
    const kot = (elem, nev, fv, opc) => {
      elem.addEventListener(nev, fv, opc);
      this._bontok.push(() => elem.removeEventListener(nev, fv, opc));
    };

    const le = (ev) => {
      if (!this._enabled) return;
      // A jobb gomb menetparancs, a bal kamera. A középső semmi.
      if (ev.button === 2) { this._parancs(ev, ev.shiftKey); ev.preventDefault(); return; }
      if (ev.button !== 0) return;
      this._huz = true;
      if (g.setPointerCapture) { try { g.setPointerCapture(ev.pointerId); } catch (h) { /* nincs mit tenni */ } }
      this._ugras(ev);
      ev.preventDefault();
    };
    const mozog = (ev) => { if (this._huz) { this._ugras(ev); ev.preventDefault(); } };
    const fel = (ev) => {
      if (!this._huz) return;
      this._huz = false;
      if (g.releasePointerCapture) { try { g.releasePointerCapture(ev.pointerId); } catch (h) { /* nincs mit tenni */ } }
    };
    // ⚠️ A HELYI MENÜT LE KELL TILTANI. Enélkül a jobb kattintás menetparancsa
    // mellé a böngésző menüje is felugrik, és a következő bal kattintás azt
    // csukja be — vagyis a kamera-ugrás egyszerűen ELVÉSZ.
    const menu = (ev) => { ev.preventDefault(); };

    kot(g, 'pointerdown', le);
    kot(g, 'pointermove', mozog);
    kot(g, 'pointerup', fel);
    kot(g, 'pointercancel', fel);
    kot(g, 'contextmenu', menu);
    if (typeof window !== 'undefined') kot(window, 'resize', () => this._meret());
  }

  /** Kurzor-pozíció → minimap-képpont. A CSS-méret eltérhet a vászonétól. */
  _kepbol(ev, ki) {
    const r = this.vaszon.getBoundingClientRect();
    if (!(r.width > 0) || !(r.height > 0)) return false;
    let x = ((ev.clientX - r.left) / r.width) * MINIMAP_MERET;
    let y = ((ev.clientY - r.top) / r.height) * MINIMAP_MERET;
    // A húzás kifuthat a dobozból (pointer capture) — a pálya szélén tartjuk.
    if (x < 0) x = 0; else if (x > MINIMAP_MERET - 1) x = MINIMAP_MERET - 1;
    if (y < 0) y = 0; else if (y > MINIMAP_MERET - 1) y = MINIMAP_MERET - 1;
    ki.x = x; ki.y = y;
    return true;
  }

  /** BAL gomb / húzás: a kamera odaugrik. NEM parancs — lásd a fejlécet. */
  _ugras(ev) {
    if (!this._kepbol(ev, this._kepPont)) return;
    minimapVilagra(this.sim, this._kepPont.x, this._kepPont.y, this._vilagPont);
    if (this.kamera && this.kamera.kozepre) {
      this.kamera.kozepre(this._vilagPont.x, this._vilagPont.y);
    }
  }

  /**
   * JOBB gomb: MENETPARANCS a kijelölt seregnek, Shift-tel támadó menet.
   *
   * ⚠️ Az EGYETLEN út a szimuláció felé: `sim.parancs(...)`. A kijelölést a
   * `bevitel` tartja — a minimap nem ismer kijelölés-modellt, csak elkéri.
   */
  _parancs(ev, tamado) {
    const kij = this.bevitel && this.bevitel.kijeloles;
    if (!kij || !kij.db) {
      if (this._uzenet) this._uzenet('a minimapról parancshoz előbb jelölj ki egységet', 'info');
      return;
    }
    if (!this._kepbol(ev, this._kepPont)) return;
    minimapVilagra(this.sim, this._kepPont.x, this._kepPont.y, this._vilagPont);

    // Másolat: a parancs-sor a listát KÉSŐBB dolgozza fel (KESLELTETES), a
    // kijelölés addig változhat. Kattintásonként EGY allokáció — a `frissit()`
    // nulla-allokáció szabálya a képkockára szól, nem a felhasználói tettre.
    const lista = new Array(kij.lista.length);
    for (let k = 0; k < kij.lista.length; k++) lista[k] = kij.lista[k];

    this.sim.parancs({
      fajta: tamado ? 'tamado_menet' : 'menet',
      egysegek: lista,
      x: this._vilagPont.x, y: this._vilagPont.y,
      alakzat: this.bevitel.alakzat,
    });
    // Visszajelzés a minimapon: enélkül a játékos nem tudja, elment-e a parancs.
    this._jel(this._vilagPont.x, this._vilagPont.y, 3, JELZES_MS);
    if (this._uzenet) {
      this._uzenet((tamado ? 'támadó menet' : 'menet') + ' a térképről — '
        + kij.db + ' egység', 'info');
    }
  }

  // ── RIASZTÁS ─────────────────────────────────────────────────────────────

  /**
   * RIASZTÁS a térképen: villanó gyűrű a megadott VILÁGPONTON.
   *
   * A `panel_uzenetek` hívja, amikor megtámadnak. Miért a minimapon, és miért
   * nem elég a szöveg: a szöveg megmondja, hogy baj van, a minimap megmondja,
   * HOL — és a játékos ettől tud odaugrani egy kattintással.
   *
   * @param {number} x világkoordináta
   * @param {number} y világkoordináta
   * @param {'baj'|'figyelem'|'info'|string} [fajta]
   */
  riasztas(x, y, fajta) {
    let f = 0;
    if (fajta === 'figyelem') f = 1;
    else if (fajta === 'info') f = 2;
    this._jel(x, y, f, RIASZTAS_MS);
  }

  _jel(x, y, fajta, tartam) {
    const i = this._rIr % RIASZTAS_DB;
    this._rIr = (this._rIr + 1) & 0x3fffffff;
    this._rX[i] = x; this._rY[i] = y;
    this._rFajta[i] = fajta;
    this._rTart[i] = tartam;
    // ⚠️ A HÍVÓ ÓRÁJÁT használjuk, ha már járt itt egy képkocka. A minimap nem
    // kérdez időt magától (lásd `frissit`), és ha a riasztás MÁS órából jönne,
    // mint a gyűrű-rajzolás, a villanás vagy azonnal lejárna, vagy sosem.
    this._rIdo[i] = (this._most !== undefined) ? this._most
      : (typeof performance !== 'undefined' ? performance.now() : Date.now());
    this._rajzIdo = -1e9;
  }

  // ── KÉPKOCKA ─────────────────────────────────────────────────────────────

  /**
   * Képkocka.
   *
   * Két hívási forma, ugyanazért, amiért a konstruktoré:
   *   panel-szerződés:  frissit(sim, most)
   *   régi főhurok:     frissit(sim, alfa, most)
   * A `most` a HÍVÓ órája — a minimap nem kérdez időt magától, mert így a
   * szonda is tudja léptetni.
   */
  frissit(sim, a, b) {
    if (!this._enabled || !this.vaszon) return;
    if (sim) this.sim = sim;
    const t = (b !== undefined) ? b
      : (a !== undefined ? a
        : (typeof performance !== 'undefined' ? performance.now() : Date.now()));
    this._most = t;
    if (t - this._rajzIdo < RAJZ_MS) return;
    this._rajzIdo = t;

    this._retegek(t);
    this._vektor(t);
  }

  /** A három képpont-réteg, mindegyik a SAJÁT ütemében. */
  _retegek(t) {
    const s = this.sim;
    if (!s) return;

    // ── 1. TEREP ────────────────────────────────────────────────────────
    // Miért időzítve, és nem eseményre: a `sim.eroforrasok` nem ad változat-
    // számot, a kimerülés viszont ritka (egy erdőfolt percenként). Öt másod-
    // perces újrasütés a legrosszabb esetben ennyi késést jelent egy erdő
    // eltűnésében — cserébe nem kell a sim felületét bővíteni ehhez.
    if (s.racs !== this._racs || t - this._terepIdo > TEREP_MS) {
      this._racs = s.racs;
      minimapTerep(s, this._terepPuffer, this._szamTerep);
      this._terepIdo = t;
      this._hatterKell = true;
    }

    // ── 2. HÁTTÉR (köd + birtokolt terület) ─────────────────────────────
    // A köd `valtozat`-száma pontosan azt mondja meg, változott-e — így álló
    // képnél EGYSZER sem futunk le fölöslegesen.
    const kv = s.kod ? s.kod.valtozat : 0;
    if ((this._hatterKell || kv !== this._kodValtozat) && t - this._hatterIdo >= HATTER_MS) {
      this._kodValtozat = kv;
      this._hatterKell = false;
      this._hatterIdo = t;
      minimapHatter(s, this._terepPuffer, this._hatterKep.data, this.csapat, this._szamHatter);
      this._mozgoKell = true;
    }

    // ── 3. MOZGÓ ────────────────────────────────────────────────────────
    if (this._mozgoKell || t - this._mozgoIdo >= MOZGO_MS) {
      this._mozgoKell = false;
      this._mozgoIdo = t;
      // Egyetlen memória-másolás (147 kB), utána CSAK a mozgó dolgok írnak.
      this._kep.data.set(this._hatterKep.data);
      minimapMozgo(s, this._kep.data, this.csapat, this._szamMozgo);
      this._offCtx.putImageData(this._kep, 0, 0);
      this._osszegzes();
    }
  }

  /** A három réteg számai egy objektumban — a szonda és a HUD ezt olvassa. */
  _osszegzes() {
    const o = this.szamlalo;
    const a = this._szamTerep, h = this._szamHatter, m = this._szamMozgo;
    o.terep = a.terep; o.nyers = a.nyers; o.viz = a.viz; o.erdo = a.erdo;
    o.sotet = h.sotet; o.kodos = h.kodos; o.fenyes = h.fenyes;
    o.terulet = h.terulet; o.teruletSajat = h.teruletSajat; o.teruletIdegen = h.teruletIdegen;
    o.egyseg = m.egyseg; o.epulet = m.epulet; o.rejtett = m.rejtett; o.pont = m.pont;
  }

  /** A vektor-réteg: blit + nézet-keret + riasztás-gyűrűk. KÉPKOCKÁNKÉNT. */
  _vektor(t) {
    const c = this.ctx;
    const b = this.vaszon.width;
    const k = b / MINIMAP_MERET;
    c.clearRect(0, 0, b, b);
    c.imageSmoothingEnabled = false;
    c.drawImage(this._off, 0, 0, b, b);

    // ── NÉZET-KERET ─────────────────────────────────────────────────────
    // Trapéz, nem téglalap: a kamera ferdén néz, tehát a képernyő teteje
    // messzebb van, mint az alja. Lásd `minimapNezetKeret` fejlécét.
    if (this.kamera && minimapNezetKeret(this.sim, this.kamera, this._keret)) {
      const q = this._keret;
      c.beginPath();
      c.moveTo(q[0] * k, q[1] * k);
      c.lineTo(q[2] * k, q[3] * k);
      c.lineTo(q[4] * k, q[5] * k);
      c.lineTo(q[6] * k, q[7] * k);
      c.closePath();
      // Két vonal egymáson: sötét alá, világos fölé. Így a keret a havas
      // hegyen és a mély vízen is látszik — egyetlen színnel az egyik
      // háttéren mindig eltűnne.
      c.lineWidth = Math.max(2.5, k * 1.6);
      c.strokeStyle = 'rgba(0,0,0,0.55)';
      c.stroke();
      c.lineWidth = Math.max(1, k * 0.7);
      c.strokeStyle = 'rgba(255,255,255,0.92)';
      c.stroke();
    }

    // ── RIASZTÁS-GYŰRŰK ─────────────────────────────────────────────────
    let riado = '';
    for (let i = 0; i < RIASZTAS_DB; i++) {
      const tart = this._rTart[i];
      if (tart <= 0) continue;
      const kor = t - this._rIdo[i];
      if (kor < 0 || kor > tart) { this._rTart[i] = 0; continue; }
      const p = kor / tart;
      minimapKeppontra(this.sim, this._rX[i], this._rY[i], this._kepPont);
      const cx = this._kepPont.x * k, cy = this._kepPont.y * k;
      // Két lüktetés a teljes élettartam alatt: a szem a MOZGÁST veszi észre,
      // nem a színt — egyetlen lassú tágulás mellett elsiklana fölötte.
      const uteres = (p * 2) % 1;
      const r = (2 + uteres * 16) * k;
      const alfa = (1 - p) * (1 - uteres * 0.75);
      const szin = RIADO_SZIN[this._rFajta[i]] || RIADO_SZIN[0];
      c.beginPath();
      c.arc(cx, cy, r, 0, Math.PI * 2);
      c.lineWidth = Math.max(1.5, k * 1.1);
      c.strokeStyle = szin + alfa.toFixed(3) + ')';
      c.stroke();
      const nev = RIADO_NEV[this._rFajta[i]];
      if (nev && !riado) riado = nev;
    }
    if (riado !== this._riadoNev) {
      this._riadoNev = riado;
      if (riado) this.gyoker.dataset.riado = riado;
      else delete this.gyoker.dataset.riado;
    }
  }

  // ── ÉLETCIKLUS ───────────────────────────────────────────────────────────

  /** Újrafelállás: a következő képkockán MINDEN réteg sülhet újra. */
  ujraKot() {
    this._terepIdo = -1e9;
    this._hatterIdo = -1e9;
    this._mozgoIdo = -1e9;
    this._rajzIdo = -1e9;
    this._kodValtozat = -1;
    this._racs = null;
    this._hatterKell = true;
    this._mozgoKell = true;
    for (let i = 0; i < RIASZTAS_DB; i++) this._rTart[i] = 0;
    this._meret();
  }

  set enabled(v) {
    this._enabled = !!v;
    if (this.gyoker) this.gyoker.style.display = v ? '' : 'none';
    if (v) this._rajzIdo = -1e9;
  }
  get enabled() { return this._enabled; }

  /** A rétegszerződés miatt van: a minimap nem a 3D színtérben rajzol. */
  get haromszog() { return 0; }

  /** Eseménykezelők leszedése — a meccs végén a váz ezt hívja. */
  bont() {
    for (let i = 0; i < this._bontok.length; i++) this._bontok[i]();
    this._bontok.length = 0;
    if (this.gyoker && this.gyoker.id === 'minimap' && this.gyoker.parentNode) {
      // Csak az ÖNÁLLÓ dobozt szedjük le: a panel-gyökér a HUD-vázé.
      this.gyoker.parentNode.removeChild(this.gyoker);
    } else if (this.vaszon && this.vaszon.parentNode) {
      this.vaszon.parentNode.removeChild(this.vaszon);
    }
  }
}

// A csapat-színt a HUD is kérheti (pl. a riasztás-sáv színezéséhez), és ne
// kelljen az adat-réteget külön importálnia.
export { SZIN_CSAPAT };
