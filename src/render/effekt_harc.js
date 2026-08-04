// AGE OF THE CRYSTALS — HARCI ÉS OSTROM-EFFEKTEK: a `three`-s feltöltő réteg.
//
// SZERZŐDÉS: `frissit(sim, alfa, most)` · `set enabled(v)` · `get haromszog()`
// — plusz `ujraKot(sim)` és `bont()`, ahogy a többi réteg.
//
// ── MI TARTOZIK HOVA ──────────────────────────────────────────────────────
//   `effekt_esemeny.js`   MI történt (sim-olvasás, tickenként) — `three`-mentes
//   `effekt_keszlet.js`   HOGY néz ki és hogyan mozog (részecske-tár) — `three`-mentes
//   `effekt_harc.js`      ez a fájl: a tárat GPU-példányokká írja
//
// A hármas felosztás nem elegancia-kérdés. Ebben a projektben egy réteg akkor
// a legveszélyesebb, ha NÉMÁN nem működik: a build zöld, a determinizmus-szonda
// zöld, a képernyőn semmi. GPU nélkül csak úgy lehet SZÁMMAL igazolni, hogy
// keletkeznek effektek, ha a felismerés és a modell node-ban is fut — ezért van
// a `three` egyetlen fájlba, ebbe szorítva.
//
// ── HÁROM RAJZHÍVÁS, NEM HÁROMSZÁZ ────────────────────────────────────────
// Minden részecske három `InstancedMesh` valamelyikébe kerül:
//
//   IZZO     additív lap    villanás, szikra      (fényt AD, nem takar)
//   LAGY     alfás lap      por, füst, talaj-nyom (sötétít is, ezért nem additív)
//   SZILARD  megvilágított doboz  törmelék, rom, ostromkő
//
// A lapok KÖZÖS, futásidőben generált sugárirányú textúrát kapnak (nincs
// képfájl — a `dist/` egyetlen fájl marad). A példány-alfát egy saját
// `aAlfa` attribútum adja, a `MeshBasicMaterial` shaderébe fűzve: enélkül a
// halványodás csak anyagonként menne, tehát részecskénként külön anyag és külön
// rajzhívás kellene. Ugyanaz az `onBeforeCompile`-minta, amit a `props3d.js` és
// a `terrain3d.js` már használ.
//
// ── MIÉRT A `Lovedek3D` A GAZDÁJA ─────────────────────────────────────────
// A `src/main.js` ebben a körben NEM módosítható (párhuzamosan tizenhat agent
// dolgozik ugyanabban a munkafában), a réteg-táblát pedig az állítja össze.
// Az effektek ezért a `lovedek3d.js` alá kerülnek: az már bent van a táblában,
// és fogalmilag is oda tartozik (a lövedék röppályája és a becsapódása egy
// dolog két fele).
//
// KÖVETKEZMÉNY, amit tudni kell: `__aoc.reteg('lovedek', false)` az effekteket
// is kikapcsolja, és az FPS-szonda réteg-bontásában az effektek költsége a
// `lovedek` soron jelenik meg. Ez így HELYES mérés, csak nevén kell nevezni.
//
// ── AZ IDŐ VALÓS IDŐ ──────────────────────────────────────────────────────
// A `frissit` harmadik paramétere a `performance.now()` ezredmásodperce
// (`main.js` adja). A részecskék ebből lépnek, nem a sim órájából — lásd az
// `effekt_keszlet.js` fejlécét.

import { THREE, aktivKamera } from './core3d.js';
import { EffektKeszlet, CSOPORT, FAJTA_CSOPORT, PLAKAT, FEKVO } from './effekt_keszlet.js';
import { EffektFigyelo } from './effekt_esemeny.js';

/** Egyszerre élő részecskék felső korlátja. Lásd a költség-indoklást lent. */
const KESZLET_MAX = 1400;

/** A sugárirányú textúra felbontása. 48² épp elég egy lágy pamacshoz. */
const TEXTURA_N = 48;

/**
 * Példányonkénti alfa a beépített anyagba fűzve.
 *
 * A `#include <color_fragment>` UTÁN szúrunk be, mert az `instanceColor`-t is
 * az fejti ki — előtte a `diffuseColor` még nem a végleges szín.
 */
function alfaAttributum(anyag) {
  anyag.onBeforeCompile = (sh) => {
    sh.vertexShader = 'attribute float aAlfa;\nvarying float vAlfa;\n'
      + sh.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\n\tvAlfa = aAlfa;');
    sh.fragmentShader = 'varying float vAlfa;\n'
      + sh.fragmentShader.replace('#include <color_fragment>',
        '#include <color_fragment>\n\tdiffuseColor.a *= vAlfa;');
  };
}

/**
 * Lágy, sugárirányban elhaló folt — futásidőben generálva.
 * A négyzetes lecsengés (`k * k`) adja, hogy a pamacs pereme ne legyen éles
 * karika: lineárissal a por széle látható korongnak látszik.
 */
function foltTextura() {
  const n = TEXTURA_N;
  const adat = new Uint8Array(n * n * 4);
  const kozep = (n - 1) * 0.5;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = (x - kozep) / kozep, dy = (y - kozep) / kozep;
      const d = Math.sqrt(dx * dx + dy * dy);
      let k = 1 - d;
      if (k < 0) k = 0;
      const a = Math.round(255 * k * k);
      const o = (y * n + x) * 4;
      adat[o] = 255; adat[o + 1] = 255; adat[o + 2] = 255; adat[o + 3] = a;
    }
  }
  const t = new THREE.DataTexture(adat, n, n, THREE.RGBAFormat);
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

export class EffektHarc3D {
  /**
   * @param {THREE.Scene} szinter
   * @param {import('../sim/sim.js').Sim} sim
   */
  constructor(szinter, sim) {
    this.szinter = szinter;
    this._enabled = true;
    this.keszlet = new EffektKeszlet(KESZLET_MAX);
    this.figyelo = new EffektFigyelo(sim);

    this._textura = foltTextura();
    this._max = KESZLET_MAX;

    // ── IZZO: additív lap ────────────────────────────────────────────────
    // `depthWrite: false` — a villanás nem takarhatja el a mögötte álló
    // figurát, csak hozzáad. A `toneMapped: false` a projekt bevett módja arra,
    // hogy a látvány-fények ne fakuljanak be a tónus-leképezésben.
    const lap = new THREE.PlaneGeometry(1, 1);
    this.izzo = this._plakatHalo(lap, {
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      toneMapped: false,
      map: this._textura,
      side: THREE.DoubleSide,
      fog: false,
    }, 4);

    // ── LAGY: alfás lap ──────────────────────────────────────────────────
    // Ez SÖTÉTÍT is (füst, talaj-nyom), tehát normál keverés kell. A köddel
    // együtt él (`fog: true`): a távoli porfelhő különben átütne a horizonton.
    this.lagy = this._plakatHalo(lap.clone(), {
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      map: this._textura,
      side: THREE.DoubleSide,
      fog: true,
    }, 5);

    // ── SZILARD: megvilágított doboz ─────────────────────────────────────
    // Törmelék, rom, ostromkő. Átlátszatlan, tehát a mélység-pufferben
    // szabályosan részt vesz — a kő tényleg a fal mögé kerül, ha oda esik.
    const doboz = new THREE.BoxGeometry(1, 1, 1);
    const szilardAnyag = new THREE.MeshLambertMaterial({ toneMapped: false });
    this.szilard = new THREE.InstancedMesh(doboz, szilardAnyag, this._max);
    this.szilard.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.szilard.instanceColor =
      new THREE.InstancedBufferAttribute(new Float32Array(this._max * 3), 3);
    this.szilard.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.szilard.frustumCulled = false;
    this.szilard.count = 0;
    szinter.add(this.szilard);

    this._db = [0, 0, 0];
    /** Az előző képkocka ideje — az első képkockán 0 lépés (nincs `dt`). */
    this._elozoMost = 0;
    this._burk = new Float32Array(2);
  }

  /** Egy plakát-`InstancedMesh` a közös beállításokkal. */
  _plakatHalo(geo, anyagOpciok, sorrend) {
    const anyag = new THREE.MeshBasicMaterial({ color: 0xffffff, ...anyagOpciok });
    alfaAttributum(anyag);
    const halo = new THREE.InstancedMesh(geo, anyag, this._max);
    halo.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    halo.instanceColor =
      new THREE.InstancedBufferAttribute(new Float32Array(this._max * 3), 3);
    halo.instanceColor.setUsage(THREE.DynamicDrawUsage);
    const alfa = new THREE.InstancedBufferAttribute(new Float32Array(this._max), 1);
    alfa.setUsage(THREE.DynamicDrawUsage);
    halo.geometry.setAttribute('aAlfa', alfa);
    halo.frustumCulled = false;
    halo.count = 0;
    halo.renderOrder = sorrend;
    this.szinter.add(halo);
    return halo;
  }

  /** Újrafelállás: a pillanatképek és a részecskék is érvénytelenek. */
  ujraKot(sim) {
    this.keszlet.nullaz();
    this.figyelo.ujraKot(sim);
    this.izzo.count = 0;
    this.lagy.count = 0;
    this.szilard.count = 0;
    this._db[0] = 0; this._db[1] = 0; this._db[2] = 0;
    this._elozoMost = 0;
  }

  /**
   * KÉPKOCKA.
   * @param {import('../sim/sim.js').Sim} sim
   * @param {number} alfa interpoláció (a részecskéknek nem kell — ld. fejléc)
   * @param {number} most `performance.now()` ezredmásodperc
   */
  /* eslint-disable no-unused-vars */
  frissit(sim, alfa, most) {
    if (!this._enabled) {
      this.izzo.count = 0; this.lagy.count = 0; this.szilard.count = 0;
      return;
    }
    const ido = typeof most === 'number' ? most : 0;
    const dt = this._elozoMost ? (ido - this._elozoMost) / 1000 : 0;
    this._elozoMost = ido;

    // A kamera „talppontja": a nézésirány döfése az y = 0 síkkal. A ritkítás
    // ehhez mér, nem a szemponthoz — RTS-kamerán a kettő 60-100 egységre van
    // egymástól, és a szemponthoz mért küszöb a képernyő közepét ritkítaná.
    const kam = aktivKamera();
    let kx = NaN, kz = NaN;
    if (kam && kam.matrixWorld) {
      kam.updateMatrixWorld();
      const m = kam.matrixWorld.elements;
      const px = m[12], py = m[13], pz = m[14];
      const fx = -m[8], fy = -m[9], fz = -m[10];
      if (fy < -0.05) {
        const t = py / -fy;
        kx = px + fx * t; kz = pz + fz * t;
      } else { kx = px; kz = pz; }
    }

    this.figyelo.frissit(sim, this.keszlet, kx, kz);
    this.keszlet.lep(dt);
    this._kiir(kam);
  }
  /* eslint-enable no-unused-vars */

  /**
   * A tár feltöltése a három példány-pufferbe. EGY bejárás, három kurzor,
   * nulla allokáció — a mátrixokat nyers float-matekkal írjuk, `Matrix4`
   * példányosítás és `.compose()` nélkül (`units3d.js` mintája).
   */
  _kiir(kam) {
    const k = this.keszlet;
    const db = k.db;

    // A plakátok a KAMERA jobb- és felfelé-vektorára feszülnek. A mátrix
    // harmadik oszlopa a lap normálisa; nem használjuk, de nem lehet nulla,
    // különben a mátrix elfajul.
    let rx = 1, ry = 0, rz = 0, ux = 0, uy = 1, uz = 0, nx = 0, ny = 0, nz = 1;
    if (kam && kam.matrixWorld) {
      const m = kam.matrixWorld.elements;
      rx = m[0]; ry = m[1]; rz = m[2];
      ux = m[4]; uy = m[5]; uz = m[6];
      nx = m[8]; ny = m[9]; nz = m[10];
    }

    const izzoM = this.izzo.instanceMatrix.array;
    const izzoC = this.izzo.instanceColor.array;
    const izzoA = this.izzo.geometry.getAttribute('aAlfa').array;
    const lagyM = this.lagy.instanceMatrix.array;
    const lagyC = this.lagy.instanceColor.array;
    const lagyA = this.lagy.geometry.getAttribute('aAlfa').array;
    const szilM = this.szilard.instanceMatrix.array;
    const szilC = this.szilard.instanceColor.array;

    const burk = this._burk || (this._burk = new Float32Array(2));
    let ni = 0, nl = 0, nsz = 0;

    for (let i = 0; i < db; i++) {
      k.burkolo(i, burk);
      const s = burk[0];
      const a = burk[1];
      if (s <= 0) continue;
      const f = k.fajta[i];
      const cs = FAJTA_CSOPORT[f];
      const x = k.x[i], y = k.y[i], z = k.z[i];

      if (cs === CSOPORT.SZILARD) {
        // Y körüli forgás + egyenletes méretezés.
        const c = Math.cos(k.forg[i]) * s, sn = Math.sin(k.forg[i]) * s;
        const o = nsz * 16;
        szilM[o] = c; szilM[o + 1] = 0; szilM[o + 2] = -sn; szilM[o + 3] = 0;
        szilM[o + 4] = 0; szilM[o + 5] = s; szilM[o + 6] = 0; szilM[o + 7] = 0;
        szilM[o + 8] = sn; szilM[o + 9] = 0; szilM[o + 10] = c; szilM[o + 11] = 0;
        szilM[o + 12] = x; szilM[o + 13] = y; szilM[o + 14] = z; szilM[o + 15] = 1;
        const ci = nsz * 3;
        szilC[ci] = k.r[i]; szilC[ci + 1] = k.g[i]; szilC[ci + 2] = k.b[i];
        nsz++;
        continue;
      }

      // Plakát: vagy a kamerára fordul, vagy a talajra fekszik (rombolás-nyom).
      let c0x, c0y, c0z, c1x, c1y, c1z, c2x, c2y, c2z;
      if (PLAKAT[f]) {
        c0x = rx * s; c0y = ry * s; c0z = rz * s;
        c1x = ux * s; c1y = uy * s; c1z = uz * s;
        c2x = nx * s; c2y = ny * s; c2z = nz * s;
      } else if (FEKVO[f]) {
        c0x = s; c0y = 0; c0z = 0;
        c1x = 0; c1y = 0; c1z = s;
        c2x = 0; c2y = s; c2z = 0;
      } else {
        c0x = s; c0y = 0; c0z = 0;
        c1x = 0; c1y = s; c1z = 0;
        c2x = 0; c2y = 0; c2z = s;
      }

      if (cs === CSOPORT.IZZO) {
        const o = ni * 16;
        izzoM[o] = c0x; izzoM[o + 1] = c0y; izzoM[o + 2] = c0z; izzoM[o + 3] = 0;
        izzoM[o + 4] = c1x; izzoM[o + 5] = c1y; izzoM[o + 6] = c1z; izzoM[o + 7] = 0;
        izzoM[o + 8] = c2x; izzoM[o + 9] = c2y; izzoM[o + 10] = c2z; izzoM[o + 11] = 0;
        izzoM[o + 12] = x; izzoM[o + 13] = y; izzoM[o + 14] = z; izzoM[o + 15] = 1;
        const ci = ni * 3;
        izzoC[ci] = k.r[i]; izzoC[ci + 1] = k.g[i]; izzoC[ci + 2] = k.b[i];
        izzoA[ni] = a;
        ni++;
      } else {
        const o = nl * 16;
        lagyM[o] = c0x; lagyM[o + 1] = c0y; lagyM[o + 2] = c0z; lagyM[o + 3] = 0;
        lagyM[o + 4] = c1x; lagyM[o + 5] = c1y; lagyM[o + 6] = c1z; lagyM[o + 7] = 0;
        lagyM[o + 8] = c2x; lagyM[o + 9] = c2y; lagyM[o + 10] = c2z; lagyM[o + 11] = 0;
        lagyM[o + 12] = x; lagyM[o + 13] = y; lagyM[o + 14] = z; lagyM[o + 15] = 1;
        const ci = nl * 3;
        lagyC[ci] = k.r[i]; lagyC[ci + 1] = k.g[i]; lagyC[ci + 2] = k.b[i];
        lagyA[nl] = a;
        nl++;
      }
    }

    this._db[0] = ni; this._db[1] = nl; this._db[2] = nsz;
    this.izzo.count = ni;
    this.lagy.count = nl;
    this.szilard.count = nsz;
    if (ni > 0) {
      this.izzo.instanceMatrix.needsUpdate = true;
      this.izzo.instanceColor.needsUpdate = true;
      this.izzo.geometry.getAttribute('aAlfa').needsUpdate = true;
    }
    if (nl > 0) {
      this.lagy.instanceMatrix.needsUpdate = true;
      this.lagy.instanceColor.needsUpdate = true;
      this.lagy.geometry.getAttribute('aAlfa').needsUpdate = true;
    }
    if (nsz > 0) {
      this.szilard.instanceMatrix.needsUpdate = true;
      this.szilard.instanceColor.needsUpdate = true;
    }
  }

  // ── RÉTEG-SZERZŐDÉS ────────────────────────────────────────────────────

  set enabled(v) {
    this._enabled = !!v;
    this.izzo.visible = this._enabled;
    this.lagy.visible = this._enabled;
    this.szilard.visible = this._enabled;
  }

  get enabled() { return this._enabled; }

  /** Lap = 2 háromszög, doboz = 12. */
  get haromszog() {
    if (!this._enabled) return 0;
    return (this._db[0] + this._db[1]) * 2 + this._db[2] * 12;
  }

  bont() {
    for (const h of [this.izzo, this.lagy, this.szilard]) {
      this.szinter.remove(h);
      h.geometry.dispose();
      h.material.dispose();
    }
    this._textura.dispose();
  }
}
