// PORTAL HUB TYCOON — A LÉNYEK 3D-BEN.
//
// ── MIÉRT ÍGY ─────────────────────────────────────────────────────────────
// Ezer lény ezer objektumként kezelhetetlen: ezer rajzolási hívás, ezer
// mátrix-frissítés, és a szemétgyűjtő minden képkockán dolgozik. Ehelyett
// NÉGY példányosított mesh van, és azok mátrixait írjuk felül helyben.
//
// Miért épp négy: test és fej × szilárd és áttetsző. A fej nem díszítés —
// enélkül a lények kapszulák maradnának, és a „szerethető, humoros" világból
// nem lenne semmi. Az áttetsző változat pedig a szellemek és a lebegő
// medúzák miatt kell; egy anyagon belül nem lehet példányonként átlátszóságot
// állítani saját shader nélkül, és egy saját shader itt nem érné meg.
//
// ── A HANGULAT LÁTSZIK ────────────────────────────────────────────────────
// A lény színe a hangulatával a vörös felé csúszik. Ez a játék legfontosabb
// vizuális visszajelzése: a HUD-on lévő „hírnév 42" absztrakt, de egy vörösödő
// tömeg a biztonsági ellenőrzés előtt azonnal elmondja, mit rontottál el.

import * as THREE from 'three';
import { MAX_UTAS } from '../mag/config.js';
import { FAJOK } from '../sim/lenyek.js';
import { DOLGOZOK } from '../sim/dolgozok.js';
import { ALLAPOT } from '../sim/utas.js';

const MAX_DOLGOZO = 240;
const PIROS = new THREE.Color(0xff3344);

export class Lenyek3d {
  constructor(szinter, sim) {
    this.sim = sim;
    this.gyoker = new THREE.Group();
    szinter.jelenet.add(this.gyoker);

    this._m = new THREE.Matrix4();
    this._p = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._sz = new THREE.Color();
    this._tengely = new THREE.Vector3(0, 1, 0);

    const testG = new THREE.CapsuleGeometry(0.3, 0.42, 3, 8);
    testG.translate(0, 0.51, 0);
    const fejG = new THREE.SphereGeometry(0.23, 10, 8);
    fejG.translate(0, 1.1, 0);

    this.szilardTest = this._mesh(testG, false, MAX_UTAS, true);
    this.szilardFej = this._mesh(fejG, false, MAX_UTAS, true);
    this.lebegoTest = this._mesh(testG.clone(), true, MAX_UTAS, false);
    this.lebegoFej = this._mesh(fejG.clone(), true, MAX_UTAS, false);

    // Dolgozók: fordított kúp, hogy egy pillantással megkülönböztethetők
    // legyenek az utasoktól. Ők nem tömeg, hanem a te embereid.
    const dg = new THREE.ConeGeometry(0.3, 0.95, 6);
    dg.translate(0, 0.48, 0);
    this.dolgozoMesh = this._mesh(dg, false, MAX_DOLGOZO, true);

    // Dühjelző: apró kocka a nagyon rossz hangulatú lények fölött.
    const jg = new THREE.BoxGeometry(0.2, 0.2, 0.2);
    this.duhJelzok = this._mesh(jg, false, 300, false, true);
  }

  _mesh(geo, atlatszo, db, arnyek, alapAnyag = false) {
    const anyag = alapAnyag
      ? new THREE.MeshBasicMaterial({ color: 0xffffff })
      : new THREE.MeshLambertMaterial({
        color: 0xffffff,
        transparent: atlatszo,
        opacity: atlatszo ? 0.5 : 1,
        depthWrite: !atlatszo,
      });
    const m = new THREE.InstancedMesh(geo, anyag, db);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.castShadow = !!arnyek;
    m.count = 0;
    m.frustumCulled = false;   // a példányok szórtak; a doboz úgyis mindent lefed
    this.gyoker.add(m);
    return m;
  }

  /**
   * @param {number} ido eltelt idő másodpercben (csak a lengéshez)
   */
  frissit(ido) {
    const sim = this.sim;
    const mat = this._m, p = this._p, q = this._q, s = this._s, sz = this._sz;
    let szN = 0, leN = 0, duhN = 0;

    for (let i = 0; i < sim.utasok.length; i++) {
      const u = sim.utasok[i];
      if (!u.aktiv) continue;
      // A kiszolgálás alatt álló utas BENT van az épületben — nem rajzoljuk.
      // Ez egyben olcsóbb is, és a sorok hossza így őszintén látszik.
      if (u.allapot === ALLAPOT.KISZOLGALAS) continue;

      const faj = FAJOK[u.fajIdx];
      const lebeg = faj.lebeg || faj.atmegyFalon;
      const meret = faj.meret;

      // Lengés: a gyaloglás ritmusa. Az `azon` a fáziseltolás, hogy ne
      // egyszerre bólogasson az egész csarnok.
      const megy = u.allapot === ALLAPOT.MEGY || u.allapot === ALLAPOT.INDUL;
      const fazis = ido * (megy ? 7 : 1.6) + u.azon * 0.7;
      const y = (lebeg ? 0.55 + Math.sin(fazis * 0.5) * 0.12 : 0)
        + (megy ? Math.abs(Math.sin(fazis)) * 0.07 : 0);

      p.set(u.x, y, u.y);
      // Nézzen arra, amerre megy. Ha áll, marad az utolsó irány — ezt a
      // lépéscél (`lx`,`ly`) őrzi, tehát nem kell külön tárolni.
      const dx = u.lx - u.x, dz = u.ly - u.y;
      const irany = (dx * dx + dz * dz) > 1e-5 ? Math.atan2(dx, dz) : 0;
      q.setFromAxisAngle(this._tengely, irany);
      s.set(meret, meret, meret);
      mat.compose(p, q, s);

      const h = u.hangulat * 0.001;
      sz.setHex(faj.szin);
      // A vörösödés csak a BAJ jele legyen. Az első változat 0,75 alatt már
      // színezett, és mivel egy átlagos utas ott tölti az idejét, az egész
      // csarnok rózsaszín volt — a fajok saját színe elveszett, a figyelmeztetés
      // pedig épp ott hallgatott el, ahol számított volna.
      if (h < 0.55) sz.lerp(PIROS, Math.min(0.8, (0.55 - h) * 1.5));

      if (lebeg) {
        if (leN < MAX_UTAS) {
          this.lebegoTest.setMatrixAt(leN, mat); this.lebegoTest.setColorAt(leN, sz);
          this.lebegoFej.setMatrixAt(leN, mat);
          this._sz2 = this._sz2 || new THREE.Color();
          this._sz2.copy(sz).offsetHSL(0, -0.1, 0.22);
          this.lebegoFej.setColorAt(leN, this._sz2);
          leN++;
        }
      } else if (szN < MAX_UTAS) {
        this.szilardTest.setMatrixAt(szN, mat); this.szilardTest.setColorAt(szN, sz);
        this.szilardFej.setMatrixAt(szN, mat);
        this._sz2 = this._sz2 || new THREE.Color();
        this._sz2.copy(sz).offsetHSL(0, -0.1, 0.22);
        this.szilardFej.setColorAt(szN, this._sz2);
        szN++;
      }

      if (h < 0.28 && duhN < 300) {
        p.set(u.x, 1.35 * meret + 0.35 + Math.sin(ido * 5 + u.azon) * 0.06, u.y);
        q.identity(); s.set(1, 1, 1);
        mat.compose(p, q, s);
        this.duhJelzok.setMatrixAt(duhN, mat);
        sz.setHex(h < 0.15 ? 0xff2b4a : 0xffb03a);
        this.duhJelzok.setColorAt(duhN, sz);
        duhN++;
      }
    }

    // ── DOLGOZÓK ──────────────────────────────────────────────────────────
    let dN = 0;
    for (let i = 0; i < sim.dolgozok.length && dN < MAX_DOLGOZO; i++) {
      const d = sim.dolgozok[i];
      const t = DOLGOZOK[d.tipusIdx];
      p.set(d.x, 0.05 + Math.sin(ido * 2 + i) * 0.03, d.y);
      q.setFromAxisAngle(this._tengely, ido * 0.6 + i);
      const m = 0.9 + (d.szint - 1) * 0.14;
      s.set(m, m, m);
      mat.compose(p, q, s);
      this.dolgozoMesh.setMatrixAt(dN, mat);
      sz.setHex(t.szin);
      // A beosztás nélküli dolgozó fakó: fizeted, de nem dolgozik.
      if (d.epuletAzon < 0) sz.multiplyScalar(0.45);
      this.dolgozoMesh.setColorAt(dN, sz);
      dN++;
    }

    this._zar(this.szilardTest, szN); this._zar(this.szilardFej, szN);
    this._zar(this.lebegoTest, leN); this._zar(this.lebegoFej, leN);
    this._zar(this.dolgozoMesh, dN);
    this._zar(this.duhJelzok, duhN);
  }

  _zar(mesh, n) {
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
}
