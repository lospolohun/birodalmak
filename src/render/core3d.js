// AGE OF THE CRYSTALS — 3D MAG: WebGL2-renderer, jelenet, világítás, méretezés.
//
// Ez a réteg NEM tud a játékszabályokról. A sim-ből EGYETLEN számot olvas, a
// `tick`-et, és abból is csak azt, hány óra van a világban.
//
// ── A v0.16-OS FORDULAT: MOST MÁR VAN ÁRNYÉK ÉS VAN NAPSZAK ───────────────
// A v0.1 óta ez a fejléc azt írta, hogy nincs árnyék, mert az ára SZERKEZETI:
// minden vetőt mégegyszer végig kell rajzolni a fény szemszögéből. Ez az érv
// nem lett hamis, csak megváltozott a mérleg másik serpenyője. A v0.1 kérdése
// az volt, VAN-E EGYÁLTALÁN MOTOR; erre a válasz 1600 egységnél p95 9,3 ms egy
// 2017-es iMac-en, a 16,7 ms-os kapu mellett. A látvány viszont közben v0.0-n
// maradt: lapos, árnyéktalan, egyszínű szürkéskék háttérrel.
//
// Amit a v0.16 hozzátesz, három külön fájlban, mert három külön ok:
//   `fenyek_ciklus.js`  MIKOR és MILYEN a fény — tiszta matek, node-ban fut
//   `fenyek_egbolt.js`  MI VAN a terep mögött — gradiens, korong, csillagok
//   `fenyek_arnyek.js`  KI VET árnyékot és mibe kerül — három fokozat
//
// A mag ezeket köti össze a `THREE` fényeivel. A szerkezeti ár kezelése az
// árnyék-fájl dolga (fokozatok, frissítés-gyorstár); ide az tartozik, hogy
// EGY irányfény és EGY féggömb-fény van, most is. Minden további fény MINDEN
// anyag fragment-shaderébe beépülne — az árnyék ehhez képest olcsó.
//
// ── MIÉRT A `sim.tick`-BŐL JÖN A NAPSZAK ──────────────────────────────────
// Mert determinisztikus, tehát a v0.8 lockstepjében ingyen ugyanaz a fény esik
// mindkét gépen ugyanarra a csatára. A render TERMÉSZETESEN nem ír vissza a
// simbe — csak a `tick`-et olvassa, és `Math.random()` sincs az útvonalon.
//
// ⚠️ A `main.js` MÁSIK AGENTÉ, és a magot NEM teszi be a `retegek` közé,
// tehát a `frissit()`-ünket senki nem hívja. A képkockánkénti munka ezért a
// `rajzol()`-ban van, ami viszont biztosan lefut. A simet háromféleképp
// fogadjuk el (`opciok.sim`, `set sim`, `frissit()`), és ha egyik sem jött,
// a `window.__aoc.jatek.sim`-ből oldjuk fel — az a szonda dokumentált
// felülete. Sim nélkül sem áll meg semmi: olyankor a 0. tick fénye van.
//
// ── SZÍNKEZELÉS: EGY CSŐVEZETÉK, ÉS MIÉRT AZ A GÖRBÉTLEN ─────────────────
// A v0.16 látvány-sávjai két anyagcsaláddal hagyták itt a jelenetet:
//
//   `toneMapped: false`  épületek, ostromgép, lövedék, jelölés-gyűrűk, effektek
//   `toneMapped: true`   terep, víz, díszlet, ÉS A FIGURÁK
//
// (A figurák a v0.16-os átadóban tévesen a görbétlen oldalon szerepeltek. A
// `units3d.js` anyagai sima `MeshLambertMaterial`-ok, tehát a MÁSIK családban
// vannak. A hibajelentés tünete ettől igaz maradt, csak a magyarázata volt
// fordítva — ezért van itt kiírva, melyik fájl melyik oldalon áll.)
//
// Két család + bármilyen tónus-görbe = KÉT KÜLÖNBÖZŐ FÉNYERŐ-GÖRBE ugyanarra
// a megvilágításra. A `fenyek_ciklus.js` `lambertKimenet()`-jével kiszámolva,
// ugyanaz az éjszakai fény, a `terep_paletta.js` fűszíne (`0x4a7a34`) és egy
// kék tunika:
//
//                        ACES-szel        görbe nélkül
//   fű   (tone mapped)   sRGB (1,12,3)    sRGB (16,37,18)
//   tunika               sRGB (0,4,51)    sRGB (7,23,80)
//
// ACES mellett a TALAJ gyakorlatilag fekete lesz, miközben a görbétlen családba
// tartozó tárgyak (épület, effekt) a nyers értéküket viszik a képre: ez az a
// szétválás, amit a hibajelentés „a terep feketébe fordul, a figurák nem"-ként
// írt le. A `NeutralToneMapping` nem megoldás rá: az egy 0,04-ig terjedő
// fekete-eltolást VON KI, vagyis pont a sötét tónusokat roppantja össze.
//
// ── MELYIK OLDALT VISSZÜK A MÁSIKHOZ, ÉS MIÉRT ────────────────────────────
// A görbétlen oldalt választjuk, két okból:
//
//   1. Ez az EGYETLEN irány, amit a mag EGYEDÜL végre tud hajtani. A
//      `toneMapped: false` nyolc másik fájlban van szétszórva, azokat más
//      sávok birtokolják; a renderer görbéje viszont itt egy sor. A `three`
//      r170 `WebGLPrograms`-a ezt írja:
//        `if ( material.toneMapped ) toneMapping = renderer.toneMapping;`
//      — a zászló CSAK LEFELÉ tud rontani. Ha a renderer görbéje
//      `NoToneMapping`, akkor MINDKÉT ág `NoToneMapping`-ot ad, tehát a két
//      család BIZONYÍTHATÓAN ugyanazt a shader-programot fordítja. Nem
//      „nagyjából ugyanaz": azonos `parameters.toneMapping`, azonos program.
//   2. A görbe hasznát (csúcs-lekerekítés) itt nincs mire fordítani — lásd a
//      kiégés-számot lent.
//
// ── ÉS AMIKOR VALAKI MÉGIS GÖRBÉT AKAR ────────────────────────────────────
// Akkor a szétválás VISSZATÉRNE, mert a nyolc fájl zászlói ott maradtak. Ezért
// a görbe nem szabadon írható mező, hanem a `tonemap` szetteren megy be, és a
// szetter ELŐBB egységesíti a jelenet minden anyagát (`egysegesitAnyagok()`),
// csak utána kapcsol. Egy csővezeték marad akkor is, ha a döntés megfordul.
// A `csovezetekAllapot()` bármikor megmondja, hány anyag melyik oldalon áll —
// ez az a szám, amivel a valódi gépen ellenőrizhető, hogy nem csúszott szét.
//
// ── A KIÉGÉS: MOST MÁR SZÁM IS VAN RÁ ─────────────────────────────────────
// Görbe nélkül nincs csúcs-lekerekítés, tehát 1,0 fölött kőkeményen levág. Az
// előző fejléc hivatkozott egy vizsgálatra, ami SEHOL NEM LÉTEZETT; most a
// `fenyek_ciklus.js` `napiMerleg()`-je számolja, node-ban:
//
//   teljesen fehér lap, felfelé   csúcs 0,852 lineáris  (tartalék 0,148)
//   teljesen fehér lap, a napnak  csúcs 0,950 lineáris  (tartalék 0,050)
//   fű, éjfélkor                  sRGB (16, 37, 18)     — sötét, de nem fekete
//
// Vagyis a legrosszabb eset is 1,0 ALATT marad: nincs mit lekerekíteni. A
// tartalék viszont már csak 5 % — aki a `MENETREND` `napEro`-ját megemeli,
// annak ELŐBB ezt a számot kell megnéznie.
//
// A színTÉR viszont marad sRGB kimenet: az a gamma-helyes megjelenítés, nem
// tone mapping.
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
import { napAllapot, ujNapAllapot, NAPHOSSZ_TICK, NAPSZAK_NEV } from './fenyek_ciklus.js';
import { Egbolt } from './fenyek_egbolt.js';
import { ArnyekKezelo, ARNYEK } from './fenyek_arnyek.js';

export { THREE, ARNYEK, NAPHOSSZ_TICK };

/**
 * Ég- és ködszín — INDULÓ érték. A napszak-ciklus az első képkockától
 * felülírja; a konstans azért marad, mert a v0.1 óta több réteg fejléce
 * hivatkozik rá, és mert sim nélkül is legyen valami a képen.
 */
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
    // Lásd a fejléc „egy csővezeték" szakaszát. Nem felejtés: MÉRT döntés, és
    // a `fenyek_ciklus.js` `napiMerleg()`-je számolja hozzá a kiégés-tartalékot.
    /** A tónus-görbe. CSAK a `tonemap` szetteren át változhat — az egységesít is. */
    this._gorbe = opciok.tonemap ?? THREE.NoToneMapping;
    this.renderer.toneMapping = this._gorbe;
    // ⚠️ Az expozíció `NoToneMapping` mellett a `three`-ben NEM HAT (a
    // `tonemapping_fragment` chunk üres). Beállítjuk, hogy görbe-váltáskor
    // már a helyes érték legyen bent, de aki fényerőt akar hangolni, az a
    // `fenyek_ciklus.js` `MENETREND`-jét keresse, ne ezt.
    this.renderer.toneMappingExposure = opciok.expozicio ?? 1.0;
    /** Az utolsó egységesítéskor látott gyerek-szám — ebből tudjuk, nőtt-e a jelenet. */
    this._gyerekSzam = -1;
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
    // beépül, tehát a képernyő minden képpontján fizetünk érte. A napszak
    // ezért NEM új fényekkel készül, hanem ennek a kettőnek a színével.
    //
    // Az irányfény egyszerre NAP és HOLD: éjjel a `fenyek_ciklus.js` az
    // ellenpontba fordítja. Így az éjszakának is van vetett árnyéka, és mégsem
    // került egyetlen fragment-shaderbe sem plusz ág.
    const nap = new THREE.DirectionalLight(0xfff0d6, 2.15);
    nap.position.set(0.55, 1.0, 0.35).normalize();
    this.jelenet.add(nap);

    const eg = new THREE.HemisphereLight(0xbcd9f5, 0x4d4433, 1.05);
    this.jelenet.add(eg);

    this.fenyek = { nap, eg };

    // ── NAPSZAK, ÉGBOLT, ÁRNYÉK ───────────────────────────────────────────
    /** A képkockánként újratöltött nap-állapot. EGY példány, nulla allokáció. */
    this.napAll = ujNapAllapot();
    /** `null` = a sim tickje hajtja; szám [0,1) = befagyasztott napszak. */
    this._napFix = opciok.napFix ?? null;
    this._naphossz = opciok.naphossz ?? NAPHOSSZ_TICK;
    this._sim = opciok.sim || null;
    this._simKeres = 0;

    this.egbolt = (opciok.egbolt === false) ? null : new Egbolt(this.jelenet);
    this.arnyek = new ArnyekKezelo(this.renderer, this.jelenet, nap, {
      // Alapértelmezés: KOZEPES. A MAGAS (egységek is vetnek) 1600 figuránál
      // a teljes figura-geometriát mégegyszer áttolja a csúcs-feldolgozón —
      // azt csak MÉRÉS után szabad alapértelmezéssé tenni.
      szint: opciok.arnyek === false ? ARNYEK.KI
        : (opciok.arnyek === true ? ARNYEK.MAGAS : (opciok.arnyekSzint ?? ARNYEK.KOZEPES)),
    });

    /** Képkockánként újrahasznált statisztika-objektum (nulla allokáció). */
    this.statisztika = { rajzhivas: 0, haromszog: 0, ms: 0 };

    this._sz = 1; this._ma = 1;
    this._kamera = feloldKamera(opciok.kamera);
    this._enabled = true;
    this._kontextusElveszett = false;

    // ── A CSŐVEZETÉK-EGYSÉGESÍTŐ LÁTOGATÓJA ───────────────────────────────
    // EGYSZER jön létre. A `traverse()` függvényt vár; ha képkockánként adnánk
    // neki friss nyílfüggvényt, az képkockánkénti lezárás-allokáció lenne —
    // pont az, amit a réteg-szerződés tilt.
    /** [0] = már egységes, [1] = átállítva ebben a menetben. */
    this._csoSzam = new Int32Array(2);
    this._csoLatogato = (o) => {
      const a = o.material;
      if (!a) return;
      if (Array.isArray(a)) { for (let i = 0; i < a.length; i++) this._csoAnyag(a[i]); }
      else this._csoAnyag(a);
    };
    if (this._gorbe !== THREE.NoToneMapping) this.egysegesitAnyagok();

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
    // A napszak, az égbolt és a fény-kamera frissítése ITT történik, nem a
    // `frissit()`-ben — lásd a fejléc ⚠️ megjegyzését arról, hogy a magot a
    // `main.js` nem tartja réteg-nyilván.
    this._fenyFrissit(k);
    // A jelenet MENET KÖZBEN nő (a rétegek a mag után épülnek fel, a
    // `gazdasag3d` új épület-hálót akaszt be). Görbe mellett egy frissen
    // érkezett `toneMapped: false` anyag azonnal visszahozná a szétválást,
    // ezért figyeljük a gyerek-számot. Görbe NÉLKÜL a zászló bizonyítottan
    // hatástalan (lásd a fejlécet), tehát ilyenkor ez egy egész-összehasonlítás
    // és semmi több — nem sepregetünk feleslegesen.
    if (this._gorbe !== THREE.NoToneMapping
        && this.jelenet.children.length !== this._gyerekSzam) this.egysegesitAnyagok();
    const info = this.renderer.info;
    info.reset();
    this.renderer.render(this.jelenet, k);
    this.statisztika.rajzhivas = info.render.calls;
    this.statisztika.haromszog = info.render.triangles;
  }

  // ── EGY CSŐVEZETÉK ───────────────────────────────────────────────────────

  /** @param {THREE.Material} a */
  _csoAnyag(a) {
    if (a.toneMapped === true) { this._csoSzam[0]++; return; }
    a.toneMapped = true;
    // A zászló a program-kulcs része; enélkül a Three a RÉGI, görbétlen
    // programot használná tovább — „beállítottam, de nem hatott".
    a.needsUpdate = true;
    this._csoSzam[1]++;
  }

  /**
   * Minden anyag ugyanarra a csővezetékre. A `toneMapped: false` zászlók nyolc
   * másik fájlban ülnek, és mind egy RÉGI feltevést kódolnak (hogy fut ACES,
   * amit ki kell kerülni). Innentől nem ők döntenek: a görbe a rendereré, és
   * a jelenet EGYBEN követi.
   *
   * Nem képkocka-útvonal — a `rajzol()` csak akkor hívja, ha görbe van BE, ÉS
   * a jelenet gyerek-száma változott.
   *
   * @returns {number} hány anyagot kellett átállítani
   */
  egysegesitAnyagok() {
    this._csoSzam[0] = 0; this._csoSzam[1] = 0;
    this.jelenet.traverse(this._csoLatogato);
    this._gyerekSzam = this.jelenet.children.length;
    return this._csoSzam[1];
  }

  /**
   * Diagnosztika: hány anyag áll melyik oldalon. Ez az a SZÁM, amivel valódi
   * gépen ellenőrizhető, hogy a jelenet nem szakadt két családra — a
   * `kulon > 0` görbe mellett azonnali látvány-hiba.
   * @param {{egyseges:number, kulon:number, gorbe:number}} [ki]
   */
  csovezetekAllapot(ki) {
    const o = ki || { egyseges: 0, kulon: 0, gorbe: 0 };
    o.egyseges = 0; o.kulon = 0;
    this.jelenet.traverse((n) => {
      const a = n.material;
      if (!a) return;
      const t = Array.isArray(a) ? a : [a];
      for (let i = 0; i < t.length; i++) {
        if (t[i].toneMapped === true) o.egyseges++; else o.kulon++;
      }
    });
    o.gorbe = this._gorbe;
    return o;
  }

  /**
   * A tónus-görbe. Az EGYETLEN út, amin változhat — mert előbb egységesíti a
   * jelenetet, és csak utána kapcsol. Aki a `renderer.toneMapping`-ot közvetlenül
   * írja, az visszahozza a két családot, és vele az éjszakai fekete terepet.
   */
  set tonemap(g) {
    const uj = (g === undefined || g === null) ? THREE.NoToneMapping : g;
    if (uj === this._gorbe) return;
    this._gorbe = uj;
    if (uj !== THREE.NoToneMapping) this.egysegesitAnyagok();
    this.renderer.toneMapping = uj;
  }
  get tonemap() { return this._gorbe; }

  // ── NAPSZAK ──────────────────────────────────────────────────────────────

  /**
   * A sim felkutatása, ha nem kaptuk meg. A `window.__aoc` a szonda
   * DOKUMENTÁLT felülete (`INTERFACES.md`), tehát nem kerülőút — de csak
   * olvassuk, és csak akkor keressük, ha még nincs meg.
   */
  _simFelold() {
    if (this._sim) return this._sim;
    // Ne kérdezgessük képkockánként: a `Jatek` konstruktora alatt a globális
    // hivatkozás még üres, tehát az első néhány képkockán úgyis hiába.
    if (--this._simKeres > 0) return null;
    this._simKeres = 20;
    if (typeof window === 'undefined') return null;
    const g = window.__aoc;
    const s = g && g.jatek && g.jatek.sim;
    if (s && typeof s.tick === 'number') this._sim = s;
    return this._sim;
  }

  /** @param {THREE.Camera} k */
  _fenyFrissit(k) {
    const a = this.napAll;
    if (this._napFix === null) {
      const sim = this._simFelold();
      napAllapot(sim ? sim.tick : 0, a, this._naphossz);
    } else {
      napAllapot(this._napFix * this._naphossz, a, this._naphossz);
    }

    const nap = this.fenyek.nap, eg = this.fenyek.eg;
    nap.color.setRGB(a.napR, a.napG, a.napB);
    nap.intensity = a.napEro;
    eg.color.setRGB(a.egR, a.egG, a.egB);
    eg.groundColor.setRGB(a.foldR, a.foldG, a.foldB);
    eg.intensity = a.egEro;

    // Árnyék nélkül senki nem állítaná a fény HELYÉT — pedig az irányfény
    // iránya abból jön. Bekapcsolt árnyéknál ugyanezt az `ArnyekKezelo`
    // számolja a nézethez igazítva, ezért ott nem nyúlunk hozzá.
    if (this.arnyek.szint === ARNYEK.KI) nap.position.set(a.irX * 100, a.irY * 100, a.irZ * 100);

    // A köd és a háttér EGYÜTT mozog az égbolt aljával; ez az, ami miatt a
    // pálya széle nem egy látható vízszintes csíkban ér véget.
    if (this.jelenet.fog) this.jelenet.fog.color.setRGB(a.kodR, a.kodG, a.kodB);
    if (this.jelenet.background && this.jelenet.background.isColor) {
      this.jelenet.background.setRGB(a.kodR, a.kodG, a.kodB);
    }

    if (this.egbolt) this.egbolt.frissit(a, k);
    this.arnyek.frissit(a, _aktivKamera, k);
  }

  /** A sim beadása kívülről (a felkutatás helyett). */
  set sim(s) { if (s && typeof s.tick === 'number') this._sim = s; }
  get sim() { return this._sim; }

  /**
   * Napszak befagyasztása képernyőképhez és összehasonlító méréshez.
   * @param {number|null} f `null` = fusson a ciklus; `[0,1)` = ennél áll meg
   */
  set napFix(f) { this._napFix = (f === null || f === undefined) ? null : (f % 1 + 1) % 1; }
  get napFix() { return this._napFix; }

  /** Árnyék-fokozat: `ARNYEK.KI | KOZEPES | MAGAS`. A beállítás-panel ezt hívja. */
  set arnyekSzint(v) { this.arnyek.szint = v; }
  get arnyekSzint() { return this.arnyek.szint; }

  /** Az égbolt-kupola ki/be — a réteg-bontású méréshez. */
  set egboltLathato(v) { if (this.egbolt) this.egbolt.enabled = !!v; }
  get egboltLathato() { return this.egbolt ? this.egbolt.enabled : false; }

  /**
   * Egy sornyi diagnosztika a HUD-nak és a jelentésnek. Ugyanabba az
   * objektumba ír, ha kap egyet.
   */
  fenyAllapot(ki) {
    const o = this.arnyek.allapot(ki);
    const a = this.napAll;
    o.ora = a.ora;
    o.napszak = NAPSZAK_NEV[a.napszak];
    o.napEro = a.napEro;
    o.egEro = a.egEro;
    return o;
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
  /**
   * Ha a `main.js` egyszer mégis réteg-nyilvántartásba veszi a magot, innen
   * megkapjuk a simet — és onnantól nem kell felkutatni. A képkockánkénti
   * munka viszont NEM itt van (lásd a `rajzol()`-t): erre a metódusra nem
   * szabad számítani.
   */
  frissit(sim, alfa) { if (sim && typeof sim.tick === 'number') this._sim = sim; }
  /* eslint-enable no-unused-vars */

  set enabled(v) {
    this._enabled = !!v;
    if (this.egbolt) this.egbolt.enabled = this._enabled;
  }
  get enabled() { return this._enabled; }
  /** A mag egyetlen saját geometriája az égbolt-kupola. */
  get haromszog() { return this.egbolt ? this.egbolt.haromszog : 0; }

  bont() {
    for (const f of this._bontok) { try { f(); } catch { /* nem kritikus */ } }
    this._bontok.length = 0;
    try { if (this.egbolt) this.egbolt.bont(); } catch { /* nem kritikus */ }
    try { this.arnyek.bont(); } catch { /* nem kritikus */ }
    try { this.renderer.dispose(); } catch { /* nem kritikus */ }
  }
}
