// AGE OF THE CRYSTALS — OSTROMGÉPEK (v0.4/6).
//
// SZERZŐDÉS: `frissit(sim, alfa)` · `set enabled(v)` · `get haromszog()`
//
// ── MIÉRT NEM A `units3d.js`-BEN VAN ──────────────────────────────────────
// A figuraréteg négy egységtípusra épült, és a forró ciklusában `e.tipus[i] & 3`
// szerepel — a maszk minden ötödik típust a munkásra ejtene vissza. A réteg
// ráadásul emberi alakot épít (test, sisak, kar, fegyver, pajzs), ami egy
// faltörő kosra értelmetlen. Az ötödik típus BŐVÍTÉS helyett saját réteget
// kapott: a `units3d.js` egyetlen feltétellel kihagyja, itt pedig egy sokkal
// egyszerűbb geometria megy — egy test és két kerék.
//
// A `props3d.js` fejléce óta ez a projekt mintája: ha egy új dolog nem fér bele
// a meglévő réteg fogalmi keretébe, akkor NEM a keretet tágítjuk.
//
// ── HOL VAN AZ OSTROM LÁTVÁNYA? NEM ITT (v0.16) ───────────────────────────
// Ez a fájl a GÉPET rajzolja, a CSAPÁSÁT nem. A kilőtt kő íve, a becsapódás
// törmeléke és a falon maradó rombolás-nyom az `effekt_esemeny.js` /
// `effekt_keszlet.js` párosban él, a `lovedek3d.js` alá kötve.
//
// ⚠️ ÉS EGY DOLGOT ÉRDEMES TUDNI RÓLA: a sim ostromgépe KÖZELHARCOS
// (`harc.js` → `HATOTAV[TIPUS.OSTROMGEP] = 3,2`), a sebzést azonnal kiosztja,
// és NEM indít lövedéket. A repülő kő tehát tisztán render-oldali
// megjelenítés — a `sim.lovedekek` tárban SOHA nem keresd.

import { THREE } from './core3d.js';
import { TIPUS } from '../sim/units.js';

const SZIN_CSAPAT = [0x2b4f8f, 0x8f402b];
/** A test a talaj fölött ennyivel ül. */
const ULES = 0.34;

export class Ostrom3D {
  constructor(szinter, sim) {
    this.szinter = szinter;
    this._enabled = true;
    this._db = 0;
    const max = sim.maxEgyseg;

    // Egyetlen doboz: a kos teste. A kerekek külön példánytömbben lennének, és
    // egy 30 fős ostromoszlopnál ez nem éri meg a második rajzhívást.
    const geo = new THREE.BoxGeometry(1.05, 0.68, 1.5);
    const anyag = new THREE.MeshLambertMaterial({ toneMapped: false });
    this.halo = new THREE.InstancedMesh(geo, anyag, Math.max(1, max));
    this.halo.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.halo.instanceColor =
      new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, max) * 3), 3);
    this.halo.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.halo.frustumCulled = false;
    this.halo.count = 0;
    szinter.add(this.halo);
    this._szin = new THREE.Color();
  }

  ujraKot() { this.halo.count = 0; this._db = 0; }

  /* eslint-disable no-unused-vars */
  frissit(sim, alfa) {
    if (!this._enabled) { this.halo.count = 0; return; }
    const e = sim.egysegek;
    const racs = sim.racs;
    const elo = e.elo, bent = e.bent;
    const arr = this.halo.instanceMatrix.array;
    const szinArr = this.halo.instanceColor.array;

    let n = 0;
    for (let i = 0; i < e.db; i++) {
      if (e.tipus[i] !== TIPUS.OSTROMGEP) continue;
      if (elo && elo[i] === 0) continue;
      if (bent && bent[i] === 1) continue;

      // Nyers tick-pozíció, interpoláció nélkül: az ostromgép 1,9 egység/mp-mel
      // döcög, ami 20 Hz-en képkockánként 0,1 világegység — a rángás alatta van
      // a láthatóságnak, és így nem kell külön pillanatkép-pár sem.
      const x = e.px[i], y = e.py[i];
      const sz = e.szog[i];
      const c = Math.cos(-sz + Math.PI / 2), s2 = Math.sin(-sz + Math.PI / 2);
      const o = n * 16;
      arr[o] = c; arr[o + 1] = 0; arr[o + 2] = -s2; arr[o + 3] = 0;
      arr[o + 4] = 0; arr[o + 5] = 1; arr[o + 6] = 0; arr[o + 7] = 0;
      arr[o + 8] = s2; arr[o + 9] = 0; arr[o + 10] = c; arr[o + 11] = 0;
      arr[o + 12] = x;
      arr[o + 13] = racs.magassagPont(x, y) + ULES;
      arr[o + 14] = y;
      arr[o + 15] = 1;

      this._szin.setHex(SZIN_CSAPAT[e.csapat[i] & 1]);
      const ci = n * 3;
      szinArr[ci] = this._szin.r;
      szinArr[ci + 1] = this._szin.g;
      szinArr[ci + 2] = this._szin.b;
      n++;
    }
    this._db = n;
    this.halo.count = n;
    if (n > 0) {
      this.halo.instanceMatrix.needsUpdate = true;
      this.halo.instanceColor.needsUpdate = true;
    }
  }
  /* eslint-enable no-unused-vars */

  set enabled(v) { this._enabled = !!v; this.halo.visible = this._enabled; }
  get enabled() { return this._enabled; }
  get haromszog() { return this._enabled ? this._db * 12 : 0; }

  bont() {
    this.szinter.remove(this.halo);
    this.halo.geometry.dispose();
    this.halo.material.dispose();
  }
}
