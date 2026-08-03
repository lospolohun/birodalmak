// AGE OF THE CRYSTALS — TÁJELEMEK: erdő és a NÉVADÓ KRISTÁLY-LELŐHELYEK.
//
// SZERZŐDÉS: `frissit(sim, alfa)` · `set enabled(v)` · `get haromszog()`
//
// ── MI KERÜL A PÁLYÁRA, ÉS MI NEM ─────────────────────────────────────────
// FA a füves, kristálymentes cellákra kerül, determinisztikus egész-hash
// alapján (nem `Math.random()`): ugyanaz a seed ugyanazt az erdőt adja, tehát
// két mérés A/B-zhető, és egy hibajelentés reprodukálható. A sűrűséget a
// CÉLDARABSZÁM vezérli, nem egy fix százalék: a küszöböt a tényleges
// fűcella-számból számoljuk vissza, így egy másik pályagenerátor mellett sem
// borul fel a képkocka-költség.
//
// KRISTÁLY a `racs.kristalyok` cellákra kerül. Ez a játék nyersanyaga és
// névadója, ezért kap három réteget: tömör tüske (emissive), köré egy additív
// burok, alá egy additív fényfolt a talajon. Mindhárom PULZÁL, egyedi fázissal.
//
// ── AMI SZÁNDÉKOSAN NINCS ─────────────────────────────────────────────────
// Nincs PONTFÉNY a kristályokon. Egy pontfény MINDEN anyag fragment-
// shaderjébe beépül, tehát a képernyő minden képpontján fizetnénk érte — száz
// lelőhelynél ez nem is opció. A „megvilágít" érzetet az additív burok és a
// talajfolt kelti, fix költséggel.
// Nincs fű, bokor és szélben lengő lomb sem: a v0.1 mérési célja a MOTOR, és
// ezek mind a legdrágább (kitöltés-korlátos) oldalon terhelnének.
//
// ── HOGYAN MARAD OLCSÓ ────────────────────────────────────────────────────
// 1. CHUNKONKÉNTI `InstancedMesh` (32×32 cella). Egy chunk = egy befoglaló
//    gömb, tehát a frusztum-kivágás VALÓBAN dolgozik. Egy darab, pálya-méretű
//    InstancedMesh esetén a kivágás mindent vagy semmit tudna — vagyis mindig
//    mindent rajzolnánk.
// 2. LOD egy `visible` flaggel: távolról a TÖRZS eltűnik (a lomb takarja, észre
//    sem venni), még távolabb az egész chunk. Nulla adatmozgatás.
// 3. Per-példány változatosság ATTRIBÚTUM NÉLKÜL. A méret és a szín magját az
//    `instanceMatrix` eltolás-oszlopából (a fa világpozíciójából) hasheljük a
//    vertex shaderben. Így egyetlen közös geometria szolgálja ki mind a 64
//    chunkot — nincs se extra puffer, se geometria-másolat.
// 4. A `frissit()` nem allokál: minden segédobjektum modul-szinten él.

import { THREE, feloldJelenet, feloldKamera, aktivKamera } from './core3d.js';
import { TEREP } from '../sim/grid.js';

/** Tájelem-chunk oldalhossza cellában. */
const PCH = 32;
/** Ezen belül a törzs is látszik. */
const TORZS_TAV = 65;
/** Ennél messzebb a chunk teljesen kimarad (a köd úgyis elnyeli). */
const REJT_TAV = 340;
/** Ezen túl kezd ritkulni az erdő, eddigre éri el a `RITKA_ALJ` arányt. */
const RITKIT_KEZD = 110, RITKIT_VEG = 260, RITKA_ALJ = 0.4;
/** Alapértelmezett fa-céldarabszám az egész pályára. */
const CEL_FA = 2600;

const TAU = 6.283185307179586;

// Képkockánként újrahasznált segédek — a `frissit()` így allokációmentes.
const _m4 = new THREE.Matrix4();
const _frusztum = new THREE.Frustum();
// A felépítéshez (nem a hurokban), de itt is egy példány elég.
const _poz = new THREE.Vector3(), _qt = new THREE.Quaternion();
const _sc = new THREE.Vector3(), _eu = new THREE.Euler(), _mat = new THREE.Matrix4();

export class Diszlet3D {
  /**
   * @param {THREE.Scene|any} jelenet jelenet vagy `Mag3D`
   * @param {import('../sim/sim.js').Sim|any} sim
   * @param {{kamera?:any, faDb?:number}} [opciok]
   */
  constructor(jelenet, sim, opciok = {}) {
    this.jelenet = feloldJelenet(jelenet);
    if (!this.jelenet) throw new Error('[props3d] nincs jelenet');
    this.racs = sim.racs;
    this._n = this.racs.n;
    this._kamera = feloldKamera(opciok.kamera) || aktivKamera();
    this._celFa = opciok.faDb ?? CEL_FA;
    this._enabled = true;
    this._haromszog = 0;
    this._rajzhivas = 0;

    /** Közös idő-uniform a pulzáláshoz (egy objektum, három anyag). */
    this._ido = { value: 0 };
    this._kezdet = performance.now();

    this.gyoker = new THREE.Group();
    this.gyoker.name = 'diszlet';
    this.gyoker.matrixAutoUpdate = false;
    this.gyoker.updateMatrix();
    this.jelenet.add(this.gyoker);

    this._geo = this._geometriak();
    this._anyagok();
    this._epitFak();
    this._epitKristalyok();
  }

  // ── GEOMETRIA ────────────────────────────────────────────────────────────

  _geometriak() {
    // Törzs: nyitott végű ötszög-henger. A fedőlapokat elhagyjuk — a talpát a
    // föld, a tetejét a lomb takarja, tehát tíz háromszög elég belőle.
    const torzs = new THREE.CylinderGeometry(0.13, 0.21, 1.5, 5, 1, true);
    torzs.translate(0, 0.75, 0);
    torzs.computeBoundingSphere();

    // Lomb: két egymásba csúsztatott kúp. Egy kúp sziluettje szegényes, kettő
    // már „fa" — összesen 24 háromszögért.
    const also = new THREE.ConeGeometry(0.95, 2.0, 6, 1, false); also.translate(0, 2.25, 0);
    const felso = new THREE.ConeGeometry(0.64, 1.5, 6, 1, false); felso.translate(0, 3.30, 0);
    const lomb = osszefuz([also, felso]);

    // Kristály-tüske: oktaéder, magasra nyújtva. A talpa a föld alá kerül, így
    // a talaj egyenetlensége nem lóg ki alóla.
    const tuske = new THREE.OctahedronGeometry(1, 0);
    tuske.scale(0.34, 1.55, 0.34);
    tuske.translate(0, 0.95, 0);
    tuske.computeBoundingSphere();

    // Burok: ugyanaz a forma nagyban, ALFÁS csúcsszínnel — a csúcsok felé
    // átlátszó, az „egyenlítőn" világos. Additívan összegződve ez adja a
    // lágy, hegy felé elhalványuló ragyogást, fényforrás nélkül.
    const burok = new THREE.OctahedronGeometry(1, 0);
    burok.scale(0.78, 2.35, 0.78);
    alfaSzin(burok, (x, y) => (Math.abs(y) > 0.01 ? 0.04 : 0.42), 0.62, 0.93, 1.0);
    burok.translate(0, 0.95, 0);
    burok.computeBoundingSphere();

    // Talajfolt: körlap, középen fényes, a peremén nullára fogyó alfával. A
    // `CircleGeometry` első csúcsa PONT a középpont, tehát a sugárirányú
    // színátmenet ingyen adódik.
    const folt = new THREE.CircleGeometry(1, 12);
    folt.rotateX(-Math.PI / 2);
    alfaSzin(folt, (x, y, z) => Math.max(0, 0.55 * (1 - Math.sqrt(x * x + z * z))), 0.45, 0.88, 1.0);
    folt.computeBoundingSphere();

    return { torzs, lomb, tuske, burok, folt };
  }

  _anyagok() {
    const g = this._geo;
    this._triTorzs = g.torzs.index.count / 3;
    this._triLomb = g.lomb.index.count / 3;
    this._triTuske = g.tuske.attributes.position.count / 3;
    this._triBurok = g.burok.attributes.position.count / 3;
    this._triFolt = g.folt.index.count / 3;

    this.anyagTorzs = new THREE.MeshLambertMaterial({ color: 0x6b4a30 });

    // A lomb színe PÉLDÁNYONKÉNT változik, de nincs hozzá extra attribútum:
    // a magot a fa világpozíciójából (`instanceMatrix` eltolás-oszlopa)
    // hasheljük. Lásd a fejléc 3. pontját.
    this.anyagLomb = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.anyagLomb.onBeforeCompile = (sh) => {
      sh.vertexShader = 'varying float vValt;\n' + sh.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vValt = zajHash(vec2(instanceMatrix[3][0], instanceMatrix[3][2]));`,
      ).replace('void main() {', HASH_GLSL + '\nvoid main() {');
      sh.fragmentShader = 'varying float vValt;\n' + sh.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        diffuseColor.rgb *= mix(${glszin(0x3d6b2a)}, ${glszin(0x8bb256)}, vValt);`,
      );
    };

    this.anyagKristaly = new THREE.MeshLambertMaterial({
      color: 0x1c5f7c,
      emissive: 0x4fe3ff,
      emissiveIntensity: 1.0,
    });
    this._pulzal(this.anyagKristaly, 1.7,
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= vPulzus;');

    // Additív keverés + kikapcsolt mélységírás: a burok nem takarja el sem a
    // saját tüskéjét, sem a mögötte elhaladó egységeket, csak hozzáad.
    const izzo = {
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      vertexColors: true,
      fog: true,
    };
    this.anyagBurok = new THREE.MeshBasicMaterial({ color: 0x8ff0ff, ...izzo });
    this._pulzal(this.anyagBurok, 1.7,
      '#include <color_fragment>',
      '#include <color_fragment>\n\tdiffuseColor.a *= vPulzus;');

    this.anyagFolt = new THREE.MeshBasicMaterial({ color: 0x6fe6ff, ...izzo, depthTest: true });
    this._pulzal(this.anyagFolt, 1.7,
      '#include <color_fragment>',
      '#include <color_fragment>\n\tdiffuseColor.a *= vPulzus;');
  }

  /**
   * Példányonként eltérő fázisú lüktetés. A fázis a példány világpozíciójából
   * jön, így nem kell hozzá instanced attribútum, és a szomszédos kristályok
   * mégsem villognak egyszerre (az lenne a legrosszabb: karácsonyfa-hatás).
   */
  _pulzal(anyag, sebesseg, horog, csere) {
    anyag.onBeforeCompile = (sh) => {
      sh.uniforms.uIdo = this._ido;
      sh.vertexShader = 'uniform float uIdo;\nvarying float vPulzus;\n' + sh.vertexShader
        .replace('void main() {', HASH_GLSL + '\nvoid main() {')
        .replace('#include <begin_vertex>',
          `#include <begin_vertex>
          float faz = zajHash(vec2(instanceMatrix[3][0], instanceMatrix[3][2])) * 6.2831853;
          vPulzus = 0.58 + 0.42 * sin(uIdo * ${sebesseg.toFixed(2)} + faz);`);
      sh.fragmentShader = 'varying float vPulzus;\n' + sh.fragmentShader.replace(horog, csere);
    };
  }

  // ── ERDŐ ─────────────────────────────────────────────────────────────────

  _epitFak() {
    const n = this._n, racs = this.racs;
    const ter = racs.terep, kozep = racs.kozepMagassag;
    const cellaDb = n * n;

    // A kristály-cellák tiltottak: ott a lelőhely áll, és a sim szerint amúgy
    // sem járható — nem akarunk fát a kristály belsejébe.
    const tiltott = new Uint8Array(cellaDb);
    for (let k = 0; k < racs.kristalyok.length; k++) tiltott[racs.kristalyok[k]] = 1;

    let fuDb = 0;
    for (let i = 0; i < cellaDb; i++) if (ter[i] === TEREP.FU && !tiltott[i]) fuDb++;
    // A küszöböt a TÉNYLEGES fűcella-számból számoljuk vissza — így a
    // fadarabszám (és vele a képkocka-költség) pályától függetlenül tartható.
    const kuszob = fuDb > 0
      ? Math.min(1000, Math.max(1, Math.round(1000 * this._celFa / fuDb)))
      : 0;

    const chDb = Math.ceil(n / PCH);
    const kosarak = new Array(chDb * chDb);

    // 1. menet — chunkonkénti gyűjtés (innen jön a pontos kapacitás is)
    for (let i = 0; i < cellaDb; i++) {
      if (ter[i] !== TEREP.FU || tiltott[i]) continue;
      if (keverd(i, 0x51ed27) % 1000 >= kuszob) continue;
      const c = (((i / n) | 0) / PCH | 0) * chDb + ((i % n) / PCH | 0);
      (kosarak[c] || (kosarak[c] = [])).push(i);
    }

    // ── A TÁVOLI RITKÍTÁS ELŐKÉSZÍTÉSE ──────────────────────────────────
    // A példányokat hash szerint MEGKEVERJÜK, mielőtt a pufferbe kerülnének.
    // Ettől a puffer bármelyik ELŐTAGJA térben egyenletes mintája a chunknak —
    // vagyis a távoli erdőt egyetlen `count` csökkentéssel ritkíthatjuk, minden
    // adatmozgatás nélkül. Cellasorrendben ez nem működne: az előtag a chunk
    // egyik sarkát tartaná meg, a másikat letarolná.
    for (const k of kosarak) if (k) k.sort((a, b) => keverd(a, 0x3f7c1) - keverd(b, 0x3f7c1));

    // 2. menet — meshek + elhelyezés
    this._faChunkok = [];
    const felAtlo = Math.SQRT2 * (PCH * 0.5 + 1);
    for (let c = 0; c < kosarak.length; c++) {
      const lista = kosarak[c];
      if (!lista || !lista.length) continue;
      const torzs = new THREE.InstancedMesh(this._geo.torzs, this.anyagTorzs, lista.length);
      const lomb = new THREE.InstancedMesh(this._geo.lomb, this.anyagLomb, lista.length);
      for (const m of [torzs, lomb]) {
        m.matrixAutoUpdate = false; m.updateMatrix();
        m.instanceMatrix.setUsage(THREE.StaticDrawUsage);   // felépítés után sosem változik
        this.gyoker.add(m);
      }

      let minY = Infinity, maxY = -Infinity;
      for (let s = 0; s < lista.length; s++) {
        const i = lista[s], x = i % n, y = (i / n) | 0, my = kozep[i];
        const h = keverd(i, 0x9e37b1);
        _poz.set(
          x + 0.5 + ((h & 255) / 255 - 0.5) * 0.85,
          my,
          y + 0.5 + (((h >>> 8) & 255) / 255 - 0.5) * 0.85,
        );
        const m = 0.72 + ((h >>> 16) & 255) / 255 * 0.78;
        _eu.set(0, ((h >>> 24) & 255) / 255 * TAU, 0);
        _qt.setFromEuler(_eu);
        _sc.set(m, m * (0.85 + ((h >>> 12) & 15) / 15 * 0.45), m);
        _mat.compose(_poz, _qt, _sc);
        torzs.setMatrixAt(s, _mat);
        lomb.setMatrixAt(s, _mat);
        if (my < minY) minY = my;
        if (my > maxY) maxY = my;
      }
      torzs.instanceMatrix.needsUpdate = true;
      lomb.instanceMatrix.needsUpdate = true;

      // Befoglaló gömb. Az `InstancedMesh` a sajátját használja a kivágáshoz;
      // kézzel megadva megspóroljuk a példányonkénti újraszámolást — és nem
      // zsugorodik akkor sem, amikor a ritkítás lejjebb veszi a `count`-ot.
      const gomb = new THREE.Sphere();
      const fel = (maxY - minY) * 0.5 + 5.5;   // + a legmagasabb fa
      const cx = c % chDb, cy = (c / chDb) | 0;
      gomb.center.set((cx + 0.5) * PCH, (minY + maxY) * 0.5, (cy + 0.5) * PCH);
      gomb.radius = Math.sqrt(felAtlo * felAtlo + fel * fel);
      torzs.boundingSphere = gomb;
      lomb.boundingSphere = gomb;

      this._faChunkok.push({
        torzs, lomb, gomb, osszes: lista.length,
        kx: gomb.center.x, kz: gomb.center.z,
      });
    }
  }

  // ── KRISTÁLYOK ───────────────────────────────────────────────────────────

  _epitKristalyok() {
    const n = this._n, lelo = this.racs.kristalyok, kozep = this.racs.kozepMagassag;
    const helyDb = lelo.length;
    const maxTuske = Math.max(1, helyDb * 4);

    const tuske = new THREE.InstancedMesh(this._geo.tuske, this.anyagKristaly, maxTuske);
    const burok = new THREE.InstancedMesh(this._geo.burok, this.anyagBurok, maxTuske);
    const folt = new THREE.InstancedMesh(this._geo.folt, this.anyagFolt, Math.max(1, helyDb));
    // Néhány száz példány, az egész pályán szétszórva: a chunkolás és a
    // kivágás többe kerülne, mint amennyit megspórolna.
    for (const m of [tuske, burok, folt]) {
      m.matrixAutoUpdate = false; m.updateMatrix();
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      m.count = 0;
      this.gyoker.add(m);
    }
    // Az additív rétegek az átlátszó menetben, a tömör tüske UTÁN jönnek.
    folt.renderOrder = 2;
    burok.renderOrder = 3;

    for (let k = 0; k < helyDb; k++) {
      const i = lelo[k];
      const x = i % n, y = (i / n) | 0, my = kozep[i];
      const hh = keverd(i, 0x51ed27);
      const dbTuske = 2 + (hh % 3);

      for (let t = 0; t < dbTuske; t++) {
        const h = keverd(i * 7 + t, 0xc01dbeef | 0);
        _poz.set(
          x + 0.5 + ((h & 255) / 255 - 0.5) * 0.95,
          my - 0.15,
          y + 0.5 + (((h >>> 8) & 255) / 255 - 0.5) * 0.95,
        );
        const m = 0.62 + ((h >>> 16) & 255) / 255 * 0.95;
        // Enyhe billenés — a függőlegesen álló, egyforma tüskék gyárilag
        // gyártott hatást keltenének.
        _eu.set(
          (((h >>> 24) & 255) / 255 - 0.5) * 0.38,
          ((h >>> 6) & 255) / 255 * TAU,
          (((h >>> 14) & 255) / 255 - 0.5) * 0.38,
        );
        _qt.setFromEuler(_eu);
        _sc.set(m, m * (0.8 + ((h >>> 3) & 15) / 15 * 0.7), m);
        _mat.compose(_poz, _qt, _sc);
        tuske.setMatrixAt(tuske.count, _mat);
        burok.setMatrixAt(burok.count, _mat);
        tuske.count++; burok.count++;
      }

      // Talajfolt: a terepbe süllyedést elkerülendő pár centivel a cella
      // magassága fölé emeljük.
      _poz.set(x + 0.5, my + 0.07, y + 0.5);
      _qt.set(0, 0, 0, 1);
      const fm = 2.1 + ((hh >>> 12) & 255) / 255 * 1.4;
      _sc.set(fm, 1, fm);
      _mat.compose(_poz, _qt, _sc);
      folt.setMatrixAt(folt.count, _mat);
      folt.count++;
    }

    tuske.instanceMatrix.needsUpdate = true;
    burok.instanceMatrix.needsUpdate = true;
    folt.instanceMatrix.needsUpdate = true;
    this._kristaly = { tuske, burok, folt };
    this._triKristaly = tuske.count * this._triTuske
      + burok.count * this._triBurok
      + folt.count * this._triFolt;
  }

  // ── KÉPKOCKÁNKÉNTI MUNKA ─────────────────────────────────────────────────

  set kamera(k) { this._kamera = feloldKamera(k); }

  /** A szonda újrafelállásakor a sim új példány, de a pálya (seed) UGYANAZ. */
  ujraKot(sim) { if (sim && sim.racs) this.racs = sim.racs; }

  /* eslint-disable no-unused-vars */
  frissit(sim, alfa) {
    if (!this._enabled) { this._haromszog = 0; this._rajzhivas = 0; return; }
    this._ido.value = (performance.now() - this._kezdet) * 0.001;

    const ch = this._faChunkok;
    const kam = this._kamera || (this._kamera = aktivKamera());
    let tri = this._triKristaly, hivas = 3;

    if (!kam) {
      for (let i = 0; i < ch.length; i++) {
        const c = ch[i];
        c.torzs.visible = true; c.lomb.visible = true;
        c.torzs.count = c.lomb.count = c.osszes;
        tri += c.osszes * (this._triTorzs + this._triLomb); hivas += 2;
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
        c.torzs.visible = false; c.lomb.visible = false;
        continue;
      }
      // Távolról a törzs egy-két képpont a lomb alatt — a kihagyása
      // észrevehetetlen, viszont felezi a rajzhívást és negyedeli a csúcsokat.
      const kozel = tav < TORZS_TAV;
      c.torzs.visible = kozel;
      c.lomb.visible = true;

      // Ritkítás: a `count` levétele NEM adatmozgatás, csak egy rajzolási
      // paraméter — a megkevert példány-sorrend miatt mégis térben egyenletes
      // mintát hagy. A ramp folytonos, ezért panorámázáskor nem egy SÁVNYI
      // erdő tűnik el egyszerre, hanem chunkonként pár fa.
      let db = c.osszes;
      if (tav > RITKIT_KEZD) {
        const t = Math.min(1, (tav - RITKIT_KEZD) / (RITKIT_VEG - RITKIT_KEZD));
        db = Math.max(1, (c.osszes * (1 - t * (1 - RITKA_ALJ))) | 0);
      }
      c.lomb.count = db;
      c.torzs.count = kozel ? c.osszes : db;

      if (_frusztum.intersectsSphere(c.gomb)) {
        tri += db * this._triLomb; hivas++;
        if (kozel) { tri += c.torzs.count * this._triTorzs; hivas++; }
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

  /** Diagnosztika a szondának / a HUD-nak. */
  get statisztika() {
    let fa = 0;
    for (const c of (this._faChunkok || [])) fa += c.osszes;
    return {
      fa,
      kristalyTuske: this._kristaly ? this._kristaly.tuske.count : 0,
      chunk: this._faChunkok ? this._faChunkok.length : 0,
    };
  }

  bont() {
    for (const g of Object.values(this._geo)) g.dispose();
    for (const a of [this.anyagTorzs, this.anyagLomb, this.anyagKristaly, this.anyagBurok, this.anyagFolt]) a.dispose();
    this.gyoker.clear();
    this.jelenet.remove(this.gyoker);
    this._faChunkok = [];
    this._kristaly = null;
  }
}

// ── SEGÉDEK ────────────────────────────────────────────────────────────────

/**
 * Egész-hash a GPU-n. Ugyanaz a szerepe, mint a CPU-oldali `keverd`-nek:
 * példányonként állandó, de szomszédok közt független álvéletlen [0,1).
 */
const HASH_GLSL = `
float zajHash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}`;

/** sRGB hexa → GLSL `vec3` literál a lineáris munkatérben. */
function glszin(hex) {
  const c = new THREE.Color().setHex(hex, THREE.SRGBColorSpace);
  return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`;
}

/**
 * NÉGYKOMPONENSŰ csúcsszín rátétele. A negyedik komponens miatt a Three
 * `USE_COLOR_ALPHA`-t fordít, tehát a csúcs ÁTLÁTSZÓSÁGA is interpolálódik —
 * ez az, amitől az additív burok és a talajfolt pereme elhalványul, textúra
 * és külön shader nélkül.
 * @param {THREE.BufferGeometry} geo
 * @param {(x:number,y:number,z:number)=>number} alfaFv
 */
function alfaSzin(geo, alfaFv, r, g, b) {
  const p = geo.attributes.position;
  const arr = new Float32Array(p.count * 4);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    arr[i * 4] = r; arr[i * 4 + 1] = g; arr[i * 4 + 2] = b;
    arr[i * 4 + 3] = alfaFv(x, y, z);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 4));
}

/**
 * Indexelt geometriák összefűzése (csak pozíció + normális — a mi anyagainknak
 * nincs textúrájuk, tehát az UV-t nem visszük tovább). Így egy fából EGY
 * rajzhívás lesz kettő helyett.
 * @param {THREE.BufferGeometry[]} geok
 */
function osszefuz(geok) {
  let vDb = 0, iDb = 0;
  for (const g of geok) { vDb += g.attributes.position.count; iDb += g.index.count; }
  const poz = new Float32Array(vDb * 3), nor = new Float32Array(vDb * 3);
  const ind = vDb > 65535 ? new Uint32Array(iDb) : new Uint16Array(iDb);
  let vo = 0, io = 0;
  for (const g of geok) {
    const gp = g.attributes.position.array, gn = g.attributes.normal.array, gi = g.index.array;
    poz.set(gp, vo * 3); nor.set(gn, vo * 3);
    for (let k = 0; k < gi.length; k++) ind[io + k] = gi[k] + vo;
    vo += g.attributes.position.count; io += gi.length;
    g.dispose();
  }
  const ki = new THREE.BufferGeometry();
  ki.setAttribute('position', new THREE.BufferAttribute(poz, 3));
  ki.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  ki.setIndex(new THREE.BufferAttribute(ind, 1));
  ki.computeBoundingSphere();
  return ki;
}

/** Egész-hash (Murmur-féle keverés) — determinisztikus, allokációmentes. */
function keverd(i, mag) {
  let h = (i ^ mag) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
