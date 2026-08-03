// AGE OF THE CRYSTALS — 3D MAG: WebGL2-renderer, jelenet, világítás, méretezés.
//
// Ez a réteg NEM tud a játékszabályokról és NEM olvassa a simet. Csak annyi a
// dolga, hogy legyen egy WebGL2-kontextus, egy jelenet-gráf, néhány fény, és
// hogy az ablak átméretezése ne rontsa el a képarányt.
//
// ── MIÉRT NINCS ÁRNYÉK, ÉS MIÉRT NINCS NAP-ÉJ CIKLUS ──────────────────────
// A v0.1 mérési célja 1600 animált egység mellett 60 FPS egy 2017-es iMac-en.
// Az árnyéktérkép ára SZERKEZETI, nem hangolható: minden árnyékvető geometriát
// MÉGEGYSZER végig kell rajzolni a fény szemszögéből — a rajzhívás-szám és a
// csúcs-terhelés lényegében megduplázódik, ráadásul pont azon a rétegen
// (egységek + fák), ami amúgy is a legdrágább. Ezért itt egy irányfény + egy
// féggömb-fény van, árnyék nélkül, és a napszak fix. A `Mag3D` felkészült rá
// (`opciok.arnyek`), de az alapértelmezés TUDATOSAN kikapcsolt.
//
// A féggömb-fény (ég- és földszín) az, ami a lapos, árnyék nélküli világot
// mégis térbelivé teszi: az égnek néző lapok hidegebbek, a lefelé nézők
// melegebbek — ez pótolja az elmaradó környezeti takarást.
//
// ── HASZNÁLAT ─────────────────────────────────────────────────────────────
//   const mag = new Mag3D(vaszon);
//   const kamera = new Kamera3D(vaszon, sim);
//   mag.kamera = kamera;                     // az átméretezés ettől kezdve él
//   const terep = new Terep3D(mag, sim, { kamera });
//   ...
//   mag.rajzol(kamera);                      // képkockánként egyszer
//
// A rétegek SOHA nem hoznak létre saját renderert és nem hívnak `render()`-t.
//
// ── A `renderer.info` CSAPDÁJA ────────────────────────────────────────────
// A Three alapból MINDEN `render()` elején nullázza a számlálókat. Amint egy
// képkocka több menetből áll (árnyék, tükör, utófeldolgozás), a `info` csak az
// UTOLSÓ menetet mutatná — és a szonda csendben hazudna. Ezért
// `autoReset = false`, és a nullázás a `rajzol()` elején, kézzel történik.

import * as THREE from 'three';

export { THREE };

/** Ég- és ködszín. A köd ugyanez, így a pálya széle nem „elvágva" ér véget. */
export const HATTER_SZIN = 0x9fc6e2;

/** A köd sávja világegységben (a 256-os pálya átlója ~362). */
export const KOD_KOZEL = 140, KOD_TAVOL = 340;

// ── FELOLDÓK ───────────────────────────────────────────────────────────────
// A `main.js` MÁSIK AGENTÉ, ezért nem tudhatjuk biztosan, mit ad át első
// paraméterként (jelenetet? magot?). Ezek a feloldók elnyelik a különbséget —
// egy réteg SOHA ne dőljön el azon, hogy `scene`-t vagy `Mag3D`-t kapott.

/** @param {any} x @returns {THREE.Scene|null} */
export function feloldJelenet(x) {
  if (!x) return null;
  if (x.isScene) return x;
  if (x.jelenet && x.jelenet.isScene) return x.jelenet;
  if (x.scene && x.scene.isScene) return x.scene;
  return null;
}

/** @param {any} x @returns {THREE.Camera|null} */
export function feloldKamera(x) {
  if (!x) return null;
  if (x.isCamera) return x;
  if (x.objektum && x.objektum.isCamera) return x.objektum;
  if (x.kamera) return feloldKamera(x.kamera);
  if (x.cam && x.cam.isCamera) return x.cam;
  return null;
}

// ── AKTÍV KAMERA (rétegek közti, import nélküli kapocs) ────────────────────
// A `main.js` a rétegeket ÜRES opciókkal hozza létre (`new Terep(szinter, sim,
// {})`), tehát a terep- és tájelem-LOD-nak nincs honnan tudnia, hol a kamera.
// Kamera nélkül minden chunk a legrészletesebb változatát rajzolná — vagyis a
// LOD némán kikapcsolna, és a szonda azt mérné. A `Kamera3D` ezért felírja
// magát ide, a rétegek pedig innen veszik, ha nem kaptak jobbat.
let _aktivKamera = null;

/** @param {any} k a kamera-burkoló vagy nyers `THREE.Camera` */
export function jegyezdKamera(k) { _aktivKamera = k; }
/** @returns {THREE.Camera|null} */
export function aktivKamera() { return feloldKamera(_aktivKamera); }

/** @param {any} x @returns {HTMLCanvasElement|null} */
export function feloldVaszon(x) {
  if (x && typeof HTMLCanvasElement !== 'undefined' && x instanceof HTMLCanvasElement) return x;
  if (x && x.vaszon) return feloldVaszon(x.vaszon);
  if (x && x.canvas) return feloldVaszon(x.canvas);
  if (typeof document === 'undefined') return null;
  return document.querySelector('#vaszon') || document.querySelector('canvas');
}

export class Mag3D {
  /**
   * @param {HTMLCanvasElement|any} vaszon a rajzvászon (vagy bármi, amiből kiderül)
   * @param {{arnyek?:boolean, kepPontArany?:number, kod?:boolean, aa?:boolean}} [opciok]
   */
  constructor(vaszon, opciok = {}) {
    const v = feloldVaszon(vaszon);
    if (!v) throw new Error('[core3d] nincs vászon');
    this.vaszon = v;

    // Élsimítás alapból KI. Az MSAA a leggyengébb láncszemen (integrált GPU)
    // a teljes képet többszörösen mintavételezi — ez pont az a költség, amit
    // 1600 egységnél nem engedhetünk meg. Kapcsolható, mérni lehet vele.
    this.renderer = new THREE.WebGLRenderer({
      canvas: v,
      antialias: opciok.aa === true,
      alpha: false,
      stencil: false,
      depth: true,
      powerPreference: 'high-performance',
      logarithmicDepthBuffer: false,
    });

    // Retina-kijelzőn a natív 2× képpont-arány NÉGYSZERES kitöltési költséget
    // jelent. Egy 5K iMac-en ez önmagában megeszi a képkocka-keretet, mielőtt
    // egyetlen háromszöget rajzoltunk volna. 1,25 a kompromisszum: a szöveg és
    // az élek még nem darabosak, de a kitöltés a felére esik.
    this._maxArany = opciok.kepPontArany ?? 1.25;
    this.renderer.setPixelRatio(this._effektivArany());
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = !!opciok.arnyek;
    this.renderer.info.autoReset = false;   // lásd a fejléc `renderer.info` blokkját

    this.jelenet = new THREE.Scene();
    // A `main.js` `mag.scene || mag.szinter`-t keres. Nem akarunk azon múló
    // integrációt, hogy ki melyik nevet választotta — mindhárom ugyanaz az
    // objektum, nem másolat.
    this.scene = this.jelenet;
    this.szinter = this.jelenet;
    this.jelenet.background = new THREE.Color(HATTER_SZIN);
    if (opciok.kod !== false) {
      // A köd nem hangulat, hanem TELJESÍTMÉNY-ESZKÖZ: ő teszi észrevehetetlenné,
      // hogy a távoli terep-chunkokat és tájelemeket egyáltalán nem rajzoljuk ki.
      this.jelenet.fog = new THREE.Fog(HATTER_SZIN, KOD_KOZEL, KOD_TAVOL);
    }

    // ── VILÁGÍTÁS ─────────────────────────────────────────────────────────
    // Két fény, nem több. Minden további fény MINDEN anyag fragment-shaderébe
    // beépül, tehát a képernyő minden képpontján fizetünk érte.
    const nap = new THREE.DirectionalLight(0xfff0d6, 2.15);
    nap.position.set(0.55, 1.0, 0.35).normalize();
    nap.castShadow = false;
    this.jelenet.add(nap);

    const eg = new THREE.HemisphereLight(0xbcd9f5, 0x4d4433, 1.05);
    this.jelenet.add(eg);

    this.fenyek = { nap, eg };

    /** Képkockánként újrahasznált statisztika-objektum (nulla allokáció). */
    this.statisztika = { rajzhivas: 0, haromszog: 0, ms: 0 };

    this._sz = 1; this._ma = 1;
    this._kamera = feloldKamera(opciok.kamera);
    this._enabled = true;
    this._kontextusElveszett = false;

    this._figyeloket();
    this.atmeretez();
  }

  // ── MÉRETEZÉS ────────────────────────────────────────────────────────────

  _effektivArany() {
    const dpr = (typeof devicePixelRatio === 'number' && devicePixelRatio > 0) ? devicePixelRatio : 1;
    return Math.min(dpr, this._maxArany);
  }

  /** A szonda ezzel tudja lejjebb venni a kitöltési költséget. @param {number} a */
  set kepPontArany(a) {
    this._maxArany = Math.max(0.5, a || 1);
    this.renderer.setPixelRatio(this._effektivArany());
    this.atmeretez();
  }
  get kepPontArany() { return this._maxArany; }

  /**
   * A kamera regisztrálása — innentől az átméretezés a képarányt is javítja.
   * A BURKOLÓT is megtartjuk (`Kamera3D`), nem csak a feloldott `THREE.Camera`-t:
   * a látószög-korrekció a burkoló tudása, a nyers kamerán nincs rajta.
   */
  set kamera(k) {
    this._kameraBurok = k;
    this._kamera = feloldKamera(k);
    if (this._kamera) this._kameraArany();
  }
  get kamera() { return this._kamera; }

  _kameraArany() {
    const k = this._kamera;
    if (!k) return;
    const arany = this._sz / Math.max(1, this._ma);
    // Ha a kamera-osztály tud saját képarány-logikát (látószög-korrekció),
    // AZ dönt — a mag nem írja felül a látószöget.
    const b = this._kameraBurok;
    if (b && typeof b.__atmeretez === 'function') { b.__atmeretez(arany); return; }
    if (k.isPerspectiveCamera) { k.aspect = arany; k.updateProjectionMatrix(); }
  }

  /** Új vászonméret átvétele. Paraméter nélkül a DOM-ból/ablakból méri. */
  atmeretez(sz, ma) {
    let w = sz | 0, h = ma | 0;
    if (!w || !h) {
      const r = this.vaszon.getBoundingClientRect();
      w = Math.round(r.width); h = Math.round(r.height);
    }
    // ⚠️ A vászonnak lehet, hogy MÉG NINCS elrendezése (a `main.js` másik
    // agenté, a CSS-e nem garantált). Ilyenkor a 300×150-es alapértelmezett
    // canvas-méretet kapnánk, és a szonda egy bélyegképen mérne 60 FPS-t.
    // Ezért ablak-méretre esünk vissza, és a vásznat kiterítjük.
    if (w < 4 || h < 4) {
      w = (typeof innerWidth === 'number' ? innerWidth : 1280);
      h = (typeof innerHeight === 'number' ? innerHeight : 720);
      const st = this.vaszon.style;
      if (!st.width) { st.position = 'fixed'; st.left = '0'; st.top = '0'; st.width = '100%'; st.height = '100%'; st.display = 'block'; }
    }
    if (w === this._sz && h === this._ma) return;
    this._sz = w; this._ma = h;
    this.renderer.setPixelRatio(this._effektivArany());
    this.renderer.setSize(w, h, false);
    this._kameraArany();
  }

  /** Rövid név ugyanarra — a `main.js` ezt hívja ablak-átméretezéskor. */
  atmeret() { this.atmeretez(); }

  _figyeloket() {
    this._bontok = [];
    if (typeof window !== 'undefined') {
      const f = () => this.atmeretez();
      window.addEventListener('resize', f, { passive: true });
      this._bontok.push(() => window.removeEventListener('resize', f));
      if (typeof ResizeObserver === 'function') {
        // A `resize` esemény csak az ABLAKRA szól; ha a vászon egy panelben ül,
        // a méretváltozásáról egyedül a ResizeObserver szól.
        const ro = new ResizeObserver(() => this.atmeretez());
        try { ro.observe(this.vaszon); this._bontok.push(() => ro.disconnect()); } catch { /* nem kritikus */ }
      }
    }
    // Kontextus-vesztés: `preventDefault()` NÉLKÜL a böngésző meg sem PRÓBÁLJA
    // helyreállítani — a kép örökre fekete marad, miközben a hurok vidáman fut.
    const el = (e) => { e.preventDefault(); this._kontextusElveszett = true; console.warn('[core3d] a WebGL kontextus elveszett'); };
    const vi = () => { this._kontextusElveszett = false; this.renderer.setPixelRatio(this._effektivArany()); this.atmeretez(); console.warn('[core3d] a WebGL kontextus helyreállt'); };
    this.vaszon.addEventListener('webglcontextlost', el, false);
    this.vaszon.addEventListener('webglcontextrestored', vi, false);
    this._bontok.push(() => {
      this.vaszon.removeEventListener('webglcontextlost', el);
      this.vaszon.removeEventListener('webglcontextrestored', vi);
    });
  }

  // ── RAJZOLÁS ─────────────────────────────────────────────────────────────

  /**
   * Egy képkocka kirajzolása. A statisztikát a hívás UTÁN lehet olvasni.
   * @param {THREE.Camera|any} kamera
   */
  rajzol(kamera) {
    if (this._kontextusElveszett) return;
    const k = feloldKamera(kamera) || this._kamera;
    if (!k) return;
    const info = this.renderer.info;
    info.reset();
    this.renderer.render(this.jelenet, k);
    this.statisztika.rajzhivas = info.render.calls;
    this.statisztika.haromszog = info.render.triangles;
  }

  /**
   * Shader-melegítés. A Three a shadereket az ELSŐ rajzoláskor fordítja le;
   * enélkül a mérés első fél másodperce a fordítást méri, nem a játékot.
   * @param {THREE.Camera|any} kamera
   */
  melegit(kamera) {
    const k = feloldKamera(kamera) || this._kamera;
    if (!k) return;
    try { this.renderer.compile(this.jelenet, k); } catch (e) { console.warn('[core3d] melegítés:', e); }
  }

  // ── RÉTEG-SZERZŐDÉS ──────────────────────────────────────────────────────
  // A mag nem rajzol saját geometriát; a szerződést azért teljesíti, hogy a
  // szonda egységesen kezelhesse a rétegeket.

  /* eslint-disable no-unused-vars */
  frissit(sim, alfa) { /* a magnak nincs képkockánkénti dolga */ }
  /* eslint-enable no-unused-vars */

  set enabled(v) { this._enabled = !!v; }
  get enabled() { return this._enabled; }
  get haromszog() { return 0; }

  bont() {
    for (const f of this._bontok) { try { f(); } catch { /* nem kritikus */ } }
    this._bontok.length = 0;
    try { this.renderer.dispose(); } catch { /* nem kritikus */ }
  }
}
