// AGE OF THE CRYSTALS — KIJELÖLÉS-JELÖLŐK (talajgyűrűk).
//
// ── MIÉRT EGY DARAB INSTANCED MESH ────────────────────────────────────────
// A kijelölés 1600 egységre is szólhat („mindent kijelöl és előre"). Egyedi
// `Mesh` egységenként azt jelentené, hogy egy kijelölés 1600 rajzhívást tesz a
// 78-hoz — a v0.1-ben MÉRT teljes képkocka-költséget többszörözné meg egyetlen
// egérmozdulat. Egy `InstancedMesh` ebből EGY rajzhívás marad, és a példányszám
// képkockánként ingyen állítható (`.count`).
//
// ── MIÉRT SAJÁT INTERPOLÁCIÓ ──────────────────────────────────────────────
// A gyűrűnek PONTOSAN a figura alatt kell lennie. A figurák a `units3d.js`
// saját `_elozo/_most` pillanatképeiből interpolálnak a tick-ek között; ha a
// gyűrű a sim NYERS állapotát rajzolná, 20 Hz-en rángana a 60+ Hz-en sikló
// figura alatt — és pont az a fajta apró hiba, amitől egy játék „olcsónak"
// néz ki. Ezért itt ugyanaz a két pillanatkép, ugyanazzal az `alfa`-val.
//
// ── SZÍN ──────────────────────────────────────────────────────────────────
// A gyűrű színe ÁLLAPOTOT mond: zöld, ha az egység a dolgát végzi, sárga, ha
// menetel, vörös, ha harcérintkezésben van. Ez a v0.2-ben az egyetlen
// visszajelzés arról, hogy a támadó menet tényleg megtalálta-e az ellenfelet —
// a sebzés csak a v0.4-ben jön, tehát máshonnan nem látszana.

import { THREE } from './core3d.js';

/** Gyűrű-geometria felbontása. 16 szegmens = 32 háromszög példányonként. */
const SZEGMENS = 16;
/** A gyűrű a talaj FÖLÖTT lebeg ennyivel, hogy ne z-harcoljon a terepel. */
const MAGASSAG = 0.07;

/** Egység-típusonkénti gyűrű-sugár — a `units.js` SUGAR tömbjéhez igazítva. */
const SUGAR = [0.42, 0.46, 0.44, 0.56, 0.78];

const SZIN_ALL = 0x54e07a;
const SZIN_MEGY = 0xe8d24a;
const SZIN_HARC = 0xe8564a;

export class Kijeloles3D {
  /**
   * @param {THREE.Scene} szinter
   * @param {import('../sim/sim.js').Sim} sim
   * @param {{kijeloles:import('../ui/kijeloles.js').Kijeloles}} opciok
   */
  constructor(szinter, sim, opciok = {}) {
    this.szinter = szinter;
    this.kijeloles = opciok.kijeloles || null;
    this._enabled = true;

    const max = sim.maxEgyseg;
    // Vízszintesre forgatott gyűrű: a geometriát EGYSZER forgatjuk el, nem
    // példányonként — így az instance-mátrix tiszta eltolás + méretezés marad,
    // és nyers tömbírással tölthető (lásd `_rajzol`).
    const geo = new THREE.RingGeometry(0.78, 1.0, SZEGMENS);
    geo.rotateX(-Math.PI / 2);
    const anyag = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.halo = new THREE.InstancedMesh(geo, anyag, max);
    this.halo.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.halo.frustumCulled = false;
    this.halo.count = 0;
    this.halo.renderOrder = 2;
    // Példány-szín: enélkül az állapot-visszajelzés külön anyagot (és külön
    // rajzhívást) igényelne állapotonként.
    this.halo.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.halo.instanceColor.setUsage(THREE.DynamicDrawUsage);
    szinter.add(this.halo);

    // ── Interpolációs pillanatképek ──────────────────────────────────
    this._elozoX = new Float32Array(max);
    this._elozoY = new Float32Array(max);
    this._mostX = new Float32Array(max);
    this._mostY = new Float32Array(max);
    this._elozoTick = -1;
    this._szin = new THREE.Color();
    this._db = 0;
  }

  /** Újrafelállás: a pillanatképek érvénytelenek, mert az indexek átrendeződtek. */
  ujraKot(sim) {
    this._elozoTick = -1;
    this.halo.count = 0;
    if (sim) this._pillanatkep(sim, true);
  }

  /**
   * @param {import('../sim/sim.js').Sim} sim
   * @param {number} alfa interpoláció a két tick között, [0,1)
   */
  frissit(sim, alfa) {
    if (!this._enabled || !this.kijeloles) { this.halo.count = 0; return; }
    this._pillanatkep(sim, false);
    this._rajzol(sim, alfa < 0 ? 0 : (alfa > 1 ? 1 : alfa));
  }

  /**
   * A tick-váltás rögzítése. Csak akkor mozdulunk, ha tényleg új tick jött —
   * több képkocka is eshet EGY tickre, és olyankor ugyanazt a két pillanatképet
   * kell interpolálni, különben a mozgás beragadna.
   */
  _pillanatkep(sim, kenyszer) {
    if (!kenyszer && sim.tick === this._elozoTick) return;
    const e = sim.egysegek;
    const db = e.db;
    if (kenyszer || sim.tick < this._elozoTick || this._elozoTick < 0) {
      // Első kép vagy visszaugrott az idő (újrafelállás): nincs mit interpolálni.
      for (let i = 0; i < db; i++) {
        this._mostX[i] = e.px[i]; this._mostY[i] = e.py[i];
        this._elozoX[i] = e.px[i]; this._elozoY[i] = e.py[i];
      }
    } else {
      this._elozoX.set(this._mostX.subarray(0, db));
      this._elozoY.set(this._mostY.subarray(0, db));
      for (let i = 0; i < db; i++) { this._mostX[i] = e.px[i]; this._mostY[i] = e.py[i]; }
    }
    this._elozoTick = sim.tick;
  }

  _rajzol(sim, alfa) {
    const lista = this.kijeloles.lista;
    const e = sim.egysegek;
    const racs = sim.racs;
    const arr = this.halo.instanceMatrix.array;
    const szinArr = this.halo.instanceColor.array;
    const szin = this._szin;

    let n = 0;
    for (let k = 0; k < lista.length; k++) {
      const i = lista[k];
      if (i >= e.db) continue;

      const ex = this._elozoX[i], ey = this._elozoY[i];
      const x = ex + (this._mostX[i] - ex) * alfa;
      const y = ey + (this._mostY[i] - ey) * alfa;
      const magas = racs.magassagPont(x, y) + MAGASSAG;
      const s = SUGAR[e.tipus[i]];

      // Tiszta eltolás + egyenletes méretezés, oszlopfolytonosan. A
      // `Matrix4.compose()` ugyanezt írná, csak három ideiglenes objektummal.
      const o = n * 16;
      arr[o] = s; arr[o + 1] = 0; arr[o + 2] = 0; arr[o + 3] = 0;
      arr[o + 4] = 0; arr[o + 5] = s; arr[o + 6] = 0; arr[o + 7] = 0;
      arr[o + 8] = 0; arr[o + 9] = 0; arr[o + 10] = s; arr[o + 11] = 0;
      arr[o + 12] = x; arr[o + 13] = magas; arr[o + 14] = y; arr[o + 15] = 1;

      const allapot = e.allapot[i];
      szin.setHex(allapot === 2 ? SZIN_HARC : (allapot === 1 ? SZIN_MEGY : SZIN_ALL));
      const c = n * 3;
      szinArr[c] = szin.r; szinArr[c + 1] = szin.g; szinArr[c + 2] = szin.b;
      n++;
    }

    this._db = n;
    this.halo.count = n;
    if (n > 0) {
      this.halo.instanceMatrix.needsUpdate = true;
      this.halo.instanceColor.needsUpdate = true;
    }
  }

  // ── RÉTEG-SZERZŐDÉS ──────────────────────────────────────────────────────

  set enabled(v) {
    this._enabled = !!v;
    this.halo.visible = this._enabled;
  }
  get enabled() { return this._enabled; }

  get haromszog() { return this._enabled ? this._db * SZEGMENS * 2 : 0; }

  bont() {
    this.szinter.remove(this.halo);
    this.halo.geometry.dispose();
    this.halo.material.dispose();
  }
}
