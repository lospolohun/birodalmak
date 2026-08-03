// AGE OF THE CRYSTALS — LÖVEDÉKEK (nyílvesszők) kirajzolása.
//
// SZERZŐDÉS: `frissit(sim, alfa)` · `set enabled(v)` · `get haromszog()`
//
// ── MIÉRT NINCS INTERPOLÁCIÓ ──────────────────────────────────────────────
// A többi réteg a két tick KÖZÖTT interpolál, hogy 20 Hz-es sim mellett is
// simán mozogjon a kép. A lövedék más: rövid életű (tipikusan 8-12 tick), és
// KELETKEZIK meg ELTŰNIK. Egy előző-pillanatkép alapú interpoláció itt azt
// jelentené, hogy egy frissen kilőtt nyíl a semmiből húzódik elő, egy
// becsapódó pedig még egy képkockát repül a halott célpont után. A nyers
// tick-pozíció egy 16 egység/mp sebességű nyílon nem látszik rángásnak, viszont
// a keletkezés és az eltűnés pontos marad.
//
// A nyíl a REPÜLÉSI IRÁNYBA fordul. Ehhez a `Lovedekek` eltárolja az utolsó
// egységvektort, tehát a rendernek nem kell visszaszámolnia semmit.

import { THREE } from './core3d.js';

/** A nyíl a talaj fölött ennyivel repül (a figurák mellmagassága). */
const MAGASSAG = 0.55;
const SZIN = 0xf0e2b0;

export class Lovedek3D {
  constructor(szinter, sim) {
    this.szinter = szinter;
    this._enabled = true;
    const max = sim.lovedekek.maxDb;

    // Vékony, hosszúkás henger, +X felé fektetve — így az irányba forgatás
    // egyetlen Y körüli forgás, és a példány-mátrix kézzel is felírható.
    const geo = new THREE.CylinderGeometry(0.045, 0.045, 0.62, 4);
    geo.rotateZ(Math.PI / 2);
    const anyag = new THREE.MeshBasicMaterial({ color: SZIN, toneMapped: false });
    this.halo = new THREE.InstancedMesh(geo, anyag, Math.max(1, max));
    this.halo.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.halo.frustumCulled = false;
    this.halo.count = 0;
    szinter.add(this.halo);
    this._db = 0;
  }

  ujraKot() { this.halo.count = 0; this._db = 0; }

  /* eslint-disable no-unused-vars */
  frissit(sim, alfa) {
    if (!this._enabled) { this.halo.count = 0; return; }
    const lv = sim.lovedekek;
    const racs = sim.racs;
    const arr = this.halo.instanceMatrix.array;
    const db = lv.db;
    for (let i = 0; i < db; i++) {
      const x = lv.x[i], y = lv.y[i];
      const ix = lv.szogX[i], iy = lv.szogY[i];
      // Forgatás az Y tengely körül: a +X irányú hengert a repülési irányba
      // fordítjuk. A 3D-ben a sim `y`-ja a `z`, tehát a forgatásmátrix
      // (cos, -sin; sin, cos) az XZ-síkon dolgozik.
      const o = i * 16;
      arr[o] = ix; arr[o + 1] = 0; arr[o + 2] = iy; arr[o + 3] = 0;
      arr[o + 4] = 0; arr[o + 5] = 1; arr[o + 6] = 0; arr[o + 7] = 0;
      arr[o + 8] = -iy; arr[o + 9] = 0; arr[o + 10] = ix; arr[o + 11] = 0;
      arr[o + 12] = x;
      arr[o + 13] = racs.magassagPont(x, y) + MAGASSAG;
      arr[o + 14] = y;
      arr[o + 15] = 1;
    }
    this._db = db;
    this.halo.count = db;
    if (db > 0) this.halo.instanceMatrix.needsUpdate = true;
  }
  /* eslint-enable no-unused-vars */

  set enabled(v) { this._enabled = !!v; this.halo.visible = this._enabled; }
  get enabled() { return this._enabled; }
  /** Négyoldalú henger: 8 palást + 4 fedél háromszög. */
  get haromszog() { return this._enabled ? this._db * 12 : 0; }

  bont() {
    this.szinter.remove(this.halo);
    this.halo.geometry.dispose();
    this.halo.material.dispose();
  }
}
