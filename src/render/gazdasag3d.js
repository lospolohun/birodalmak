// AGE OF THE CRYSTALS — NYERSANYAG-LELŐHELYEK ÉS ÉPÜLETEK (v0.3).
//
// SZERZŐDÉS: `frissit(sim, alfa)` · `set enabled(v)` · `get haromszog()`
//
// ── MI EZ, ÉS MI NEM ──────────────────────────────────────────────────────
// Ez a réteg a GAZDASÁGOT teszi láthatóvá: erdő, bogyós bokor, kőfejtő és a
// két épületfajta. A kristály NEM itt van — azt a `props3d.js` rajzolja három
// rétegű pulzáló tüskeként, mert a játék névadója, és megérdemli a saját
// kezelését.
//
// Az épületek szándékosan MÉRTANI DOBOZOK. A rendes épület-roster a v0.5, és
// egy ideiglenes „szép" modell csak félrevezetne arról, hogy mi készült el
// valójában. Ami viszont NEM ideiglenes: az építkezés magasságból olvasható
// (a doboz a készültséggel nő), tehát ránézésre látszik, mi épül és mi kész.
//
// ── MIÉRT NEM ÍR ÚJRA MINDEN KÉPKOCKÁN ────────────────────────────────────
// A lelőhelyek ÁLLNAK. Néhány száz van belőlük, és csak akkor változik a
// kirajzolt halmaz, ha egy kimerül. Ezért példány-mátrixot csak akkor írunk, ha
// a látható darabszám tényleg módosult — a képkockánkénti újratöltés a
// `props3d.js` tanulsága szerint az egyik legolcsóbban elkerülhető pazarlás.
// (A `three` nem tud részleges `instanceMatrix` feltöltést: egyetlen példány
// írása is az EGÉSZ puffert felküldi.)

import { THREE } from './core3d.js';
import { NYERS } from '../sim/eroforras.js';
import { EP_MERET } from '../sim/epuletek.js';

/** A talaj fölé emelés, hogy a modell ne süllyedjen a terepbe. */
const ULES = 0.05;

const SZIN_FA = 0x2f5d34;
const SZIN_ETEL = 0xb8324a;
const SZIN_KO = 0x8b8f96;
/** Csapat-színek az épületekhez. */
const SZIN_CSAPAT = [0x3f7fd0, 0xd06a3f];

export class Gazdasag3D {
  /**
   * @param {THREE.Scene} szinter
   * @param {import('../sim/sim.js').Sim} sim
   */
  constructor(szinter, sim) {
    this.szinter = szinter;
    this._enabled = true;
    this._haromszog = 0;

    const ef = sim.eroforrasok;
    const maxEp = sim.epuletek.maxDb;

    // Lelőhely-fajtánként egy-egy példánytömb. A darabszám a TELJES lelőhely-
    // szám, mert a kimerülteket csak elrejtjük (a `count` állításával), nem
    // foglalunk újra.
    this._retegek = [];
    this._retegek[NYERS.FA] = this._epit(szinter, new THREE.ConeGeometry(0.46, 1.7, 5), SZIN_FA, ef.db, 5 * 2);
    this._retegek[NYERS.ETEL] = this._epit(szinter, new THREE.IcosahedronGeometry(0.34, 0), SZIN_ETEL, ef.db, 20);
    this._retegek[NYERS.KO] = this._epit(szinter, new THREE.IcosahedronGeometry(0.46, 0), SZIN_KO, ef.db, 20);

    // Épületek: egy doboz-tömb, példány-színnel (csapat + készültség).
    const epGeo = new THREE.BoxGeometry(1, 1, 1);
    const epAnyag = new THREE.MeshLambertMaterial({ toneMapped: false });
    this.epuletHalo = new THREE.InstancedMesh(epGeo, epAnyag, maxEp);
    this.epuletHalo.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.epuletHalo.instanceColor =
      new THREE.InstancedBufferAttribute(new Float32Array(maxEp * 3), 3);
    this.epuletHalo.count = 0;
    this.epuletHalo.castShadow = false;
    this.epuletHalo.frustumCulled = false;
    szinter.add(this.epuletHalo);

    this._szin = new THREE.Color();
    /** Fajtánként hány példány volt látható legutóbb — ebből tudjuk, kell-e írni. */
    this._utolsoDb = [-1, -1, -1, -1];
    this._utolsoEpulet = -1;
    this._utolsoEpulesJel = -1;

    this._elsoToltes(sim);
  }

  _epit(szinter, geo, szin, maxDb, haromszogDb) {
    const anyag = new THREE.MeshLambertMaterial({ color: szin, toneMapped: false });
    const halo = new THREE.InstancedMesh(geo, anyag, Math.max(1, maxDb));
    halo.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    halo.count = 0;
    halo.frustumCulled = false;
    szinter.add(halo);
    return { halo, haromszogDb };
  }

  _elsoToltes(sim) {
    this._lelohelyekFrissit(sim, true);
  }

  /**
   * A lelőhely-példányok újratöltése — CSAK ha a látható darabszám változott.
   * @param {boolean} kenyszer első töltésnél igaz
   */
  _lelohelyekFrissit(sim, kenyszer) {
    const ef = sim.eroforrasok;
    const racs = sim.racs;

    // Előbb csak SZÁMOLUNK. Ez néhány száz egész összehasonlítás, nagyságrendekkel
    // olcsóbb, mint a mátrix-puffer feltöltése és felküldése a GPU-ra.
    const db = [0, 0, 0, 0];
    for (let i = 0; i < ef.db; i++) if (ef.keszlet[i] > 0) db[ef.fajta[i]]++;

    let kell = kenyszer;
    for (let f = 0; f < 4; f++) if (db[f] !== this._utolsoDb[f]) kell = true;
    if (!kell) return;

    const iro = [0, 0, 0, 0];
    for (let f = 0; f < 4; f++) {
      const r = this._retegek[f];
      if (r) r.halo.count = 0;
    }
    for (let i = 0; i < ef.db; i++) {
      if (ef.keszlet[i] <= 0) continue;
      const f = ef.fajta[i];
      const r = this._retegek[f];
      if (!r) continue;                       // a kristályt a props3d rajzolja
      const x = ef.x[i], y = ef.y[i];
      const magas = racs.magassagPont(x, y) + ULES;
      const o = iro[f]++ * 16;
      const arr = r.halo.instanceMatrix.array;
      // Tiszta eltolás; a méretezést a geometria már tartalmazza. A fa és a kő
      // magasságát félig megemeljük, mert az origójuk a modell KÖZEPÉN van.
      arr[o] = 1; arr[o + 1] = 0; arr[o + 2] = 0; arr[o + 3] = 0;
      arr[o + 4] = 0; arr[o + 5] = 1; arr[o + 6] = 0; arr[o + 7] = 0;
      arr[o + 8] = 0; arr[o + 9] = 0; arr[o + 10] = 1; arr[o + 11] = 0;
      arr[o + 12] = x; arr[o + 13] = magas + (f === NYERS.FA ? 0.85 : 0.3); arr[o + 14] = y;
      arr[o + 15] = 1;
    }
    for (let f = 0; f < 4; f++) {
      const r = this._retegek[f];
      if (!r) continue;
      r.halo.count = iro[f];
      r.halo.instanceMatrix.needsUpdate = true;
      this._utolsoDb[f] = db[f];
    }
  }

  /** Az épületek újratöltése — akkor, ha új épült vagy egy készültsége lépett. */
  _epuletekFrissit(sim) {
    const ep = sim.epuletek;
    // Egyetlen szám, ami MINDEN építkezés állapotát összegzi. Ha ez nem
    // változott, az épületek képe sem — nem kell puffert küldeni.
    let jel = 0;
    for (let i = 0; i < ep.db; i++) jel += ep.epulHatra[i];
    if (ep.db === this._utolsoEpulet && jel === this._utolsoEpulesJel) return;
    this._utolsoEpulet = ep.db;
    this._utolsoEpulesJel = jel;

    const arr = this.epuletHalo.instanceMatrix.array;
    const szinArr = this.epuletHalo.instanceColor.array;
    const racs = sim.racs;
    for (let i = 0; i < ep.db; i++) {
      const m = EP_MERET[ep.tipus[i]];
      // A készültség a MAGASSÁGBAN látszik: a doboz a földből nő ki.
      const teljes = m * 0.8;
      const arany = ep.epulHatra[i] === 0 ? 1 : Math.max(0.12, 1 - ep.epulHatra[i] / 200);
      const mag = teljes * arany;
      const talp = racs.magassagPont(ep.x[i], ep.y[i]) + ULES;
      const o = i * 16;
      const sz = m * 0.92;
      arr[o] = sz; arr[o + 1] = 0; arr[o + 2] = 0; arr[o + 3] = 0;
      arr[o + 4] = 0; arr[o + 5] = mag; arr[o + 6] = 0; arr[o + 7] = 0;
      arr[o + 8] = 0; arr[o + 9] = 0; arr[o + 10] = sz; arr[o + 11] = 0;
      arr[o + 12] = ep.x[i]; arr[o + 13] = talp + mag * 0.5; arr[o + 14] = ep.y[i];
      arr[o + 15] = 1;

      this._szin.setHex(SZIN_CSAPAT[ep.csapat[i] & 1]);
      // Az épülő ház fakóbb — a készültség így színben is olvasható.
      const k = ep.epulHatra[i] === 0 ? 1 : 0.45;
      const c = i * 3;
      szinArr[c] = this._szin.r * k;
      szinArr[c + 1] = this._szin.g * k;
      szinArr[c + 2] = this._szin.b * k;
    }
    this.epuletHalo.count = ep.db;
    this.epuletHalo.instanceMatrix.needsUpdate = true;
    this.epuletHalo.instanceColor.needsUpdate = true;
  }

  /** Újrafelállás: a pálya és az épületek is átrendeződtek. */
  ujraKot(sim) {
    this._utolsoDb = [-1, -1, -1, -1];
    this._utolsoEpulet = -1;
    this._utolsoEpulesJel = -1;
    if (sim) { this._lelohelyekFrissit(sim, true); this._epuletekFrissit(sim); }
  }

  /* eslint-disable no-unused-vars */
  frissit(sim, alfa) {
    if (!this._enabled) return;
    this._lelohelyekFrissit(sim, false);
    this._epuletekFrissit(sim);
    let h = 0;
    for (let f = 0; f < 4; f++) {
      const r = this._retegek[f];
      if (r) h += r.halo.count * r.haromszogDb;
    }
    this._haromszog = h + this.epuletHalo.count * 12;
  }
  /* eslint-enable no-unused-vars */

  set enabled(v) {
    this._enabled = !!v;
    for (let f = 0; f < 4; f++) {
      const r = this._retegek[f];
      if (r) r.halo.visible = this._enabled;
    }
    this.epuletHalo.visible = this._enabled;
  }
  get enabled() { return this._enabled; }
  get haromszog() { return this._enabled ? this._haromszog : 0; }

  bont() {
    for (let f = 0; f < 4; f++) {
      const r = this._retegek[f];
      if (!r) continue;
      this.szinter.remove(r.halo);
      r.halo.geometry.dispose();
      r.halo.material.dispose();
    }
    this.szinter.remove(this.epuletHalo);
    this.epuletHalo.geometry.dispose();
    this.epuletHalo.material.dispose();
  }
}
