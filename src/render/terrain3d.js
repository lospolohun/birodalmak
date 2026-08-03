// AGE OF THE CRYSTALS — TEREP-HÁLÓ és VÍZSÍK.
//
// A `racs.magassag` (N+1)² CSÚCS-magasságából épül a terep, a `racs.terep`
// N² CELLA-típusából a csúcsszín. A két adatréteg felbontása szándékosan
// eltér (lásd `sim/grid.js`), ezért a szín NEM másolható át egy az egyben:
// egy csúcs NÉGY cella sarka, tehát a négy szomszédos cella színének átlagát
// kapja. Ez adja a parton és a hóhatáron a lágy átmenetet — cellánként tömör
// színnel a pálya kockás terítőnek látszana, és négyszer annyi csúcs kellene
// (nem lehetne osztozni a rács csomópontjain).
//
// ── CHUNKOLÁS: MIÉRT NEM EGY DARAB A TEREP ────────────────────────────────
// Egy 256×256-os pálya 131 072 háromszög. EGY meshben ez egyetlen rajzhívás,
// de a frusztum-kivágás mindent vagy semmit tud — vagyis mindig a TELJES
// terepet rajzolnánk, akkor is, ha a képen a tizede látszik. 32×32 cellás
// chunkokra vágva (8×8 = 64 mesh) a kivágás chunk-szinten dolgozik: tipikus
// RTS-nézetből 10–16 chunk marad bent. A rajzhívás-szám nő, a csúcs-terhelés
// viszont a hatodára esik — ezen a méreten ez jó csere.
//
// ── LOD ÉS A REPEDÉS-PROBLÉMA ─────────────────────────────────────────────
// Minden chunkból KÉT geometria készül: teljes felbontású (2048 háromszög) és
// félbevett lépésközű (512 + 128 szoknya). A váltás csak egy `visible` flag,
// nulla adatmozgatás.
//
// A durva chunk éle minden MÁSODIK csúcsot köti össze, a szomszédos finomé
// mindet — a kettő között a terep magassága eltér, és REPEDÉS nyílik, amin
// átlátni az égre. Ez a heightfield-LOD klasszikus csapdája. A megoldás nem
// a felbontások egyeztetése (az láncreakció), hanem SZOKNYA: a durva chunk
// pereme körben lelóg 3 egységgel. A repedésben így nem az ég látszik, hanem
// ugyanaz a terep-szín — a hiba észrevehetetlen, az ára chunkonként 128
// háromszög.
//
// ── NORMÁLISOK: MIÉRT NEM `computeVertexNormals()` ────────────────────────
// A chunk-határon a csúcsok DUPLÁZÓDNAK (mindkét chunk tartalmazza őket). A
// beépített normális-számítás csak a SAJÁT chunk háromszögeit látja, ezért a
// két példány más normálist kap, és a határon VARRAT jelenik meg. Ehelyett a
// normálisokat egyszer, GLOBÁLISAN számoljuk a magasságtérből (középponti
// differencia), és minden chunk onnan másol — varrat nélkül.
//
// ── VÍZ ───────────────────────────────────────────────────────────────────
// A `Viz3D` külön osztály, mert a szonda külön kapcsolja (`reteg('viz', …)`).
// Két háromszög, a pályánál jóval nagyobb, hogy a horizontig tartson. Hullám
// helyett a fragment-shaderben két eltolt szinusz világosítja/sötétíti a
// vizet — geometria nélkül, néhány ALU-műveletért.

import { THREE, feloldJelenet, feloldKamera, aktivKamera } from './core3d.js';
import { TEREP, VIZSZINT } from '../sim/grid.js';

/** Chunk oldalhossza cellában. */
const CH = 32;
/**
 * Ezen belül teljes felbontású a chunk (világegység). 85 nem esztétikai
 * döntés: a kamera alap-távolsága 70, tehát a KURZOR alatti terep még mindig
 * a részletes hálóból van, de a képernyő hátsó harmada már a durvából — ott
 * egy cella pár képpont, a különbség nem látszik.
 */
const LOD_TAV = 85;
/** Ennél messzebb a chunkot ki sem rajzoljuk — a köd (`KOD_TAVOL`) elnyeli. */
const REJT_TAV = 350;
/** A durva chunkok szoknyájának mélysége. */
const SZOKNYA = 3.0;

/** Terep-típusonkénti alapszín (sRGB; a THREE.Color lineárisra váltja). */
const SZINEK = [];
SZINEK[TEREP.VIZ] = 0x35596b;      // a víz alatti meder — hidegebb és sötétebb
SZINEK[TEREP.FU] = 0x5f9143;
SZINEK[TEREP.FOVENY] = 0xd9c58f;
SZINEK[TEREP.SZIKLA] = 0x8d8880;
SZINEK[TEREP.HAVAS] = 0xf0f3f6;

const _m4 = new THREE.Matrix4();
const _frusztum = new THREE.Frustum();

export class Terep3D {
  /**
   * @param {THREE.Scene|any} jelenet jelenet vagy `Mag3D`
   * @param {import('../sim/sim.js').Sim|any} sim
   * @param {{kamera?:any}} [opciok]
   */
  constructor(jelenet, sim, opciok = {}) {
    this.jelenet = feloldJelenet(jelenet);
    if (!this.jelenet) throw new Error('[terrain3d] nincs jelenet');
    this.racs = sim.racs;
    this._n = this.racs.n;
    this._kamera = feloldKamera(opciok.kamera) || aktivKamera();
    this._enabled = true;
    this._haromszog = 0;
    this._rajzhivas = 0;

    this.gyoker = new THREE.Group();
    this.gyoker.name = 'terep';
    this.gyoker.matrixAutoUpdate = false;   // sosem mozdul
    this.jelenet.add(this.gyoker);

    this.anyag = new THREE.MeshLambertMaterial({
      vertexColors: true,
      // A Lambert fragment-shaderében nincs PBR-BRDF (se Fresnel, se GGX) —
      // integrált GPU-n mérhetően olcsóbb, és egy stilizált RTS-terephez a
      // fényelnyelés úgyis elég.
      fog: true,
    });

    /** Chunkonként: {kozel, tavol, gomb, triKozel, triTavol} */
    this._chunkok = [];
    this._epit();

    // A globális segédtömbök a felépítés után már nem kellenek — 256-os
    // pályán ez ~1,6 MB, nincs értelme a memóriában tartani.
    this._nrmGlob = null;
    this._szinGlob = null;

    // ── A VÍZ GAZDÁJA ───────────────────────────────────────────────────
    // A `Viz3D` önálló osztály (külön kapcsolható, külön mérhető), de a
    // `main.js` csak HÁROM réteget hoz létre, és a `reteg('viz', …)` hívást a
    // terep `vizLathato` tulajdonságán keresztül várja. Ezért a terep hozza
    // létre és lépteti a vizet — a szonda így is egy kapcsolóval tudja
    // kihagyni, és nem marad víz nélkül a pálya.
    this.viz = opciok.viz === false ? null : new Viz3D(this.jelenet, sim);
  }

  /** A szonda újrafelállásakor a sim új példány, de a pálya (seed) UGYANAZ. */
  ujraKot(sim) {
    if (sim && sim.racs) this.racs = sim.racs;
  }

  // ── FELÉPÍTÉS ────────────────────────────────────────────────────────────

  _epit() {
    const n = this._n;
    this._nrmGlob = this._normalisok();
    this._szinGlob = this._csucsSzinek();

    const chDb = Math.ceil(n / CH);
    for (let cy = 0; cy < chDb; cy++) {
      for (let cx = 0; cx < chDb; cx++) {
        const x0 = cx * CH, y0 = cy * CH;
        const x1 = Math.min(x0 + CH, n), y1 = Math.min(y0 + CH, n);
        if (x1 <= x0 || y1 <= y0) continue;

        const kozelGeo = this._racsGeo(x0, y0, x1, y1, 1, false);
        // A durva változat szoknyája SZOKNYA-val lelóg; a közös befoglaló
        // gömböt ennyivel tágítjuk, különben a chunk pár egységgel korábban
        // esne ki a kivágásból, és a peremen felvillanna a háttér.
        kozelGeo.boundingSphere.radius += SZOKNYA;
        const kozel = new THREE.Mesh(kozelGeo, this.anyag);
        kozel.matrixAutoUpdate = false;
        kozel.updateMatrix();
        this.gyoker.add(kozel);

        // Fél lépésköz csak akkor lehetséges, ha mindkét oldal páros. A pálya
        // szélén ez elmaradhat — ilyenkor a chunknak nincs durva változata.
        let tavol = null, triTavol = 0;
        if (((x1 - x0) & 1) === 0 && ((y1 - y0) & 1) === 0) {
          const tavolGeo = this._racsGeo(x0, y0, x1, y1, 2, true);
          tavol = new THREE.Mesh(tavolGeo, this.anyag);
          tavol.matrixAutoUpdate = false;
          tavol.updateMatrix();
          tavol.visible = false;
          this.gyoker.add(tavol);
          triTavol = tavolGeo.index.count / 3;
        }

        // Közös befoglaló gömb a kivágáshoz és a LOD-távolsághoz.
        const gomb = kozelGeo.boundingSphere.clone();
        if (tavol) tavol.geometry.boundingSphere = gomb.clone();

        this._chunkok.push({
          kozel, tavol, gomb,
          triKozel: kozelGeo.index.count / 3,
          triTavol,
          kx: gomb.center.x, kz: gomb.center.z,
        });
      }
    }

    // A gyökér mátrixa fix — egyszer kell frissíteni.
    this.gyoker.updateMatrix();
    this.gyoker.updateMatrixWorld(true);
  }

  /**
   * Globális csúcs-normálisok a magasságtérből, középponti differenciával.
   * A rács lépésköze 1 világegység, ezért a gradiens = (hJobb − hBal) / 2.
   */
  _normalisok() {
    const n = this._n, s = n + 1, mag = this.racs.magassag;
    const ki = new Float32Array(s * s * 3);
    for (let j = 0; j <= n; j++) {
      const sor = j * s;
      const fent = (j > 0 ? j - 1 : 0) * s;
      const lent = (j < n ? j + 1 : n) * s;
      for (let i = 0; i <= n; i++) {
        const bal = mag[sor + (i > 0 ? i - 1 : 0)];
        const jobb = mag[sor + (i < n ? i + 1 : n)];
        const hatul = mag[fent + i];
        const elol = mag[lent + i];
        let nx = (bal - jobb) * 0.5, ny = 1, nz = (hatul - elol) * 0.5;
        const h = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        const p = (sor + i) * 3;
        ki[p] = nx / h; ki[p + 1] = ny / h; ki[p + 2] = nz / h;
      }
    }
    return ki;
  }

  /**
   * Globális csúcsszínek: egy csúcs a körülötte lévő (legfeljebb négy) cella
   * színének átlaga. A hash-alapú apró sötétítés töri meg a tömör felületet —
   * textúra nélkül ez adja a talajnak a „szemcsét".
   */
  _csucsSzinek() {
    const n = this._n, s = n + 1, ter = this.racs.terep;
    const paletta = new Float32Array(SZINEK.length * 3);
    const c = new THREE.Color();
    for (let t = 0; t < SZINEK.length; t++) {
      c.setHex(SZINEK[t], THREE.SRGBColorSpace);   // sRGB → lineáris munkatér
      paletta[t * 3] = c.r; paletta[t * 3 + 1] = c.g; paletta[t * 3 + 2] = c.b;
    }
    const ki = new Float32Array(s * s * 3);
    for (let j = 0; j <= n; j++) {
      for (let i = 0; i <= n; i++) {
        let r = 0, g = 0, b = 0, db = 0;
        for (let dy = -1; dy <= 0; dy++) {
          const cy = j + dy;
          if (cy < 0 || cy >= n) continue;
          for (let dx = -1; dx <= 0; dx++) {
            const cx = i + dx;
            if (cx < 0 || cx >= n) continue;
            const p = ter[cy * n + cx] * 3;
            r += paletta[p]; g += paletta[p + 1]; b += paletta[p + 2]; db++;
          }
        }
        if (!db) { r = paletta[0]; g = paletta[1]; b = paletta[2]; db = 1; }
        // ±4% zaj — determinisztikus, tehát két gépen ugyanaz a kép.
        const h = keverd(j * s + i, 0x1b873f);
        const f = (0.96 + (h & 1023) / 1023 * 0.08) / db;
        const q = (j * s + i) * 3;
        ki[q] = r * f; ki[q + 1] = g * f; ki[q + 2] = b * f;
      }
    }
    return ki;
  }

  /**
   * Egy chunk geometriája.
   * @param {number} lepes 1 = teljes felbontás, 2 = fele
   * @param {boolean} szoknya kell-e lelógó perem (csak a durva változatnak)
   */
  _racsGeo(x0, y0, x1, y1, lepes, szoknya) {
    const n = this._n, s = n + 1, mag = this.racs.magassag;
    const nrm = this._nrmGlob, szin = this._szinGlob;
    const w = (x1 - x0) / lepes | 0, h = (y1 - y0) / lepes | 0;
    const vw = w + 1, vh = h + 1;
    const racsDb = vw * vh;
    const szDb = szoknya ? 2 * vw + 2 * vh : 0;
    const vDb = racsDb + szDb;

    const poz = new Float32Array(vDb * 3);
    const nor = new Float32Array(vDb * 3);
    const col = new Float32Array(vDb * 3);

    let p = 0;
    for (let j = 0; j < vh; j++) {
      const gy = y0 + j * lepes;
      for (let i = 0; i < vw; i++) {
        const gx = x0 + i * lepes;
        const g = gy * s + gx, g3 = g * 3;
        // VILÁG-KOORDINÁTA SZERZŐDÉS: x → x, y → z, magasság → y.
        poz[p] = gx; poz[p + 1] = mag[g]; poz[p + 2] = gy;
        nor[p] = nrm[g3]; nor[p + 1] = nrm[g3 + 1]; nor[p + 2] = nrm[g3 + 2];
        col[p] = szin[g3]; col[p + 1] = szin[g3 + 1]; col[p + 2] = szin[g3 + 2];
        p += 3;
      }
    }

    const triDb = w * h * 2 + (szoknya ? (w + h) * 4 : 0);
    // vDb legfeljebb 33×33 + szoknya — bőven Uint16 alatt, feleannyi
    // indexpuffer, mint Uint32-vel.
    const ind = (vDb > 65535) ? new Uint32Array(triDb * 3) : new Uint16Array(triDb * 3);
    let q = 0;
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const a = j * vw + i, b = a + 1, c = a + vw, d = c + 1;
        ind[q++] = a; ind[q++] = c; ind[q++] = b;
        ind[q++] = b; ind[q++] = c; ind[q++] = d;
      }
    }

    if (szoknya) {
      // A szoknya-csúcsok a peremcsúcsok másolatai, SZOKNYA-val lejjebb. A
      // színt és a normálist is örökölik, hogy a repedésben a talaj folytatódjon.
      const masol = (cel, forras) => {
        const a = cel * 3, b = forras * 3;
        poz[a] = poz[b]; poz[a + 1] = poz[b + 1] - SZOKNYA; poz[a + 2] = poz[b + 2];
        nor[a] = nor[b]; nor[a + 1] = nor[b + 1]; nor[a + 2] = nor[b + 2];
        col[a] = col[b]; col[a + 1] = col[b + 1]; col[a + 2] = col[b + 2];
      };
      const felso = racsDb, also = racsDb + vw, bal = racsDb + 2 * vw, jobb = bal + vh;
      for (let i = 0; i < vw; i++) { masol(felso + i, i); masol(also + i, (vh - 1) * vw + i); }
      for (let j = 0; j < vh; j++) { masol(bal + j, j * vw); masol(jobb + j, j * vw + vw - 1); }

      // A körüljárás a KIFELÉ néző oldalt adja (a hátlap-kivágás miatt számít).
      for (let i = 0; i < w; i++) {
        const a = i, b = i + 1;                       // felső él (−z felé néz)
        ind[q++] = a; ind[q++] = b; ind[q++] = felso + b;
        ind[q++] = a; ind[q++] = felso + b; ind[q++] = felso + a;
        const c = (vh - 1) * vw + i, d = c + 1;       // alsó él (+z felé néz)
        ind[q++] = c; ind[q++] = also + b; ind[q++] = d;
        ind[q++] = c; ind[q++] = also + a; ind[q++] = also + b;
      }
      for (let j = 0; j < h; j++) {
        const a = j * vw, b = (j + 1) * vw;           // bal él (−x felé néz)
        ind[q++] = a; ind[q++] = bal + (j + 1); ind[q++] = b;
        ind[q++] = a; ind[q++] = bal + j; ind[q++] = bal + (j + 1);
        const c = j * vw + vw - 1, d = (j + 1) * vw + vw - 1;   // jobb él (+x)
        ind[q++] = c; ind[q++] = d; ind[q++] = jobb + (j + 1);
        ind[q++] = c; ind[q++] = jobb + (j + 1); ind[q++] = jobb + j;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(poz, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(new THREE.BufferAttribute(ind, 1));
    geo.computeBoundingSphere();
    return geo;
  }

  // ── KÉPKOCKÁNKÉNTI MUNKA ─────────────────────────────────────────────────

  set kamera(k) { this._kamera = feloldKamera(k); }

  /**
   * A terep statikus: itt csak LOD-választás és háromszög-számlálás történik.
   * 64 chunkra ez ~64 összehasonlítás — allokáció nélkül.
   */
  /* eslint-disable no-unused-vars */
  frissit(sim, alfa) {
    if (this.viz) this.viz.frissit(sim, alfa);
    if (!this._enabled) {
      // A víz KÜLÖN kapcsoló, tehát a terep kikapcsolásakor is rajzolódhat —
      // a jelentésünk ilyenkor is csak azt tartalmazza, ami tényleg a képen van.
      this._haromszog = this.viz ? this.viz.haromszog : 0;
      this._rajzhivas = this.viz ? this.viz.rajzhivas : 0;
      return;
    }
    const kam = this._kamera || (this._kamera = aktivKamera());
    const ch = this._chunkok;
    let tri = this.viz ? this.viz.haromszog : 0;
    let hivas = this.viz ? this.viz.rajzhivas : 0;

    if (!kam) {
      // Kamera nélkül nincs mihez viszonyítani: minden chunk finom marad.
      for (let i = 0; i < ch.length; i++) {
        const c = ch[i];
        c.kozel.visible = true; if (c.tavol) c.tavol.visible = false;
        tri += c.triKozel; hivas++;
      }
      this._haromszog = tri; this._rajzhivas = hivas;
      return;
    }

    const px = kam.position.x, pz = kam.position.z;
    _m4.multiplyMatrices(kam.projectionMatrix, kam.matrixWorldInverse);
    _frusztum.setFromProjectionMatrix(_m4);

    for (let i = 0; i < ch.length; i++) {
      const c = ch[i];
      const dx = c.kx - px, dz = c.kz - pz;
      const tav = Math.sqrt(dx * dx + dz * dz);

      if (tav - c.gomb.radius > REJT_TAV) {
        c.kozel.visible = false; if (c.tavol) c.tavol.visible = false;
        continue;
      }
      const durva = c.tavol && tav > LOD_TAV;
      c.kozel.visible = !durva;
      if (c.tavol) c.tavol.visible = !!durva;

      // A statisztika csak a TÉNYLEG kirajzolt chunkokat számolja — enélkül a
      // szonda a kikapcsolt rétegek költségét sem tudná szétszálazni.
      if (_frusztum.intersectsSphere(c.gomb)) {
        tri += durva ? c.triTavol : c.triKozel;
        hivas++;
      }
    }
    this._haromszog = tri;
    this._rajzhivas = hivas;
  }
  /* eslint-enable no-unused-vars */

  // ── RÉTEG-SZERZŐDÉS ──────────────────────────────────────────────────────

  set enabled(v) {
    this._enabled = !!v;
    this.gyoker.visible = this._enabled;   // NEM bontunk le semmit
    if (!this._enabled) { this._haromszog = 0; this._rajzhivas = 0; }
  }
  get enabled() { return this._enabled; }
  get haromszog() { return this._haromszog; }
  get rajzhivas() { return this._rajzhivas; }

  /** A `reteg('viz', …)` szonda-kapcsoló ezen keresztül ér el a vízsíkig. */
  set vizLathato(v) { if (this.viz) this.viz.enabled = !!v; }
  get vizLathato() { return this.viz ? this.viz.enabled : false; }

  bont() {
    for (const c of this._chunkok) {
      c.kozel.geometry.dispose();
      if (c.tavol) c.tavol.geometry.dispose();
    }
    this._chunkok.length = 0;
    this.anyag.dispose();
    this.jelenet.remove(this.gyoker);
    if (this.viz) { this.viz.bont(); this.viz = null; }
  }
}

// ════════════════════════════════════════════════════════════════════════════

export class Viz3D {
  /**
   * @param {THREE.Scene|any} jelenet
   * @param {import('../sim/sim.js').Sim|any} sim
   * @param {{meret?:number}} [opciok]
   */
  constructor(jelenet, sim, opciok = {}) {
    this.jelenet = feloldJelenet(jelenet);
    if (!this.jelenet) throw new Error('[terrain3d] nincs jelenet');
    const n = sim.racs.n;
    this._enabled = true;
    /** A shader ideje — EGY objektum, amit a `frissit` írogat (nulla allokáció). */
    this._ido = { value: 0 };
    this._kezdet = performance.now();

    // Négyszer akkora, mint a pálya: a peremen túl is víz van, így a világ
    // nem „levágva" ér véget, hanem a ködbe fut. Két háromszög az egész.
    const meret = opciok.meret ?? n * 4;
    const geo = new THREE.PlaneGeometry(meret, meret, 1, 1);
    geo.rotateX(-Math.PI / 2);

    const anyag = new THREE.MeshLambertMaterial({
      color: 0x2c6d99,
      transparent: true,
      opacity: 0.82,
      // A mélységírás MARAD bekapcsolva: a víz az átlátszó menetben, tehát az
      // egységek UTÁN rajzolódik, és a mélységteszt gondoskodik róla, hogy a
      // vízben álló figurák ne tűnjenek el a felszín alatt.
      depthWrite: true,
      fog: true,
    });
    anyag.onBeforeCompile = (sh) => {
      sh.uniforms.uIdo = this._ido;
      sh.vertexShader = 'varying vec2 vVilag;\n' + sh.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n\tvVilag = (modelMatrix * vec4(transformed, 1.0)).xz;',
      );
      // Hullám GEOMETRIA nélkül: eltolt, eltérő irányú szinuszok világosítják
      // és sötétítik a felszínt. Egy felosztott hálónál ez nagyságrendekkel
      // olcsóbb, és kizoomolva (ahol a víz a képernyő nagy részét adja)
      // ugyanúgy „él" a felület.
      //
      // ⚠️ KÉT OKTÁV KELL. Egyetlen, alacsony frekvenciájú hullámmal (az első
      // változat 0,21-gyel ment) a mintázat hulláma ~30 világegység — a
      // bezoomolt kép ettől nem víznek, hanem elmosott felhőfotónak látszott.
      // A finom oktáv adja a „vízfelszín" olvasatot, a durva a lassú hullámzást.
      //
      // A finom oktávot a KÉPERNYŐ-DERIVÁLTTAL halványítjuk el: kizoomolva egy
      // hullámhossz pár képpont lenne, és mintavételi zaj (villogás) lenne
      // belőle. A `fwidth` pont azt mondja meg, hány világegység esik egy
      // képpontra — ahol ez nagy, ott a finom réteg elhalkul. Három utasítás,
      // és nincs se villogás, se textúra, se mipmap-lánc.
      sh.fragmentShader = 'uniform float uIdo;\nvarying vec2 vVilag;\n' + sh.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float durva = sin(vVilag.x * 0.42 + uIdo * 0.85) * 0.5 + sin(vVilag.y * 0.55 - uIdo * 0.65) * 0.5;
        float finom = sin(vVilag.x * 1.85 - vVilag.y * 1.30 + uIdo * 2.1) * 0.5
                    + sin(vVilag.x * 1.10 + vVilag.y * 2.05 - uIdo * 1.6) * 0.5;
        float suly = 1.0 - smoothstep(0.35, 1.6, length(fwidth(vVilag)));
        float hu = durva * 0.55 + finom * 0.45 * suly;
        float csillam = pow(max(0.0, hu), 14.0);
        diffuseColor.rgb *= 1.0 + hu * 0.11;
        diffuseColor.rgb += vec3(0.13, 0.19, 0.22) * csillam;`,
      );
    };

    this.halo = new THREE.Mesh(geo, anyag);
    this.halo.name = 'viz';
    this.halo.position.set(n * 0.5, VIZSZINT, n * 0.5);
    this.halo.matrixAutoUpdate = false;
    this.halo.updateMatrix();
    this.halo.frustumCulled = false;   // két háromszög, a teszt drágább lenne
    this.halo.renderOrder = 1;
    this.jelenet.add(this.halo);
  }

  /* eslint-disable no-unused-vars */
  frissit(sim, alfa) {
    if (!this._enabled) return;
    this._ido.value = (performance.now() - this._kezdet) * 0.001;
  }
  /* eslint-enable no-unused-vars */

  set enabled(v) { this._enabled = !!v; this.halo.visible = this._enabled; }
  get enabled() { return this._enabled; }
  get haromszog() { return this._enabled ? 2 : 0; }
  get rajzhivas() { return this._enabled ? 1 : 0; }

  bont() {
    this.halo.geometry.dispose();
    this.halo.material.dispose();
    this.jelenet.remove(this.halo);
  }
}

/** Egész-hash (Murmur-féle keverés) — determinisztikus, allokációmentes. */
function keverd(i, mag) {
  let h = (i ^ mag) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

// ⚠️ A `main.js` az „első nagybetűs függvény-export" alapján találja meg a
// réteg osztályát. Ezért NEM exportálunk ide semmilyen további nagybetűs
// nevet (pl. a `TEREP` konstans-táblát) — a `Terep3D` maradjon az első.
