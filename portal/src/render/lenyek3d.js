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
import { MAX_UTAS, SZINT_MAGASSAG } from '../mag/config.js';
import { FAJOK } from '../sim/lenyek.js';
import { DOLGOZOK } from '../sim/dolgozok.js';
import { ALLAPOT } from '../sim/utas.js';
import { lenyMertanok } from './leny_mertan.js';

const MAX_DOLGOZO = 240;
const PIROS = new THREE.Color(0xff3344);

export class Lenyek3d {
  constructor(szinter, sim) {
    this.sim = sim;
    /** A fölötte lévő szintek lényeit nem rajzoljuk — az emeletet takarnánk el. */
    this.aktivSzint = 0;
    this.gyoker = new THREE.Group();
    szinter.jelenet.add(this.gyoker);

    this._m = new THREE.Matrix4();
    this._p = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._sz = new THREE.Color();
    this._tengely = new THREE.Vector3(0, 1, 0);

    // ── FAJONKÉNTI MÉRTAN ─────────────────────────────────────────────────
    // A v0.1-ben minden lény ugyanaz a kapszula+gömb volt. Ez a
    // szimulációnak elég volt, a játéknak nem: a „minden faj másképp
    // viselkedik" ígéretből semmi nem látszott a képernyőn. Fajonként külön
    // InstancedMesh-pár (test + fej) a válasz — a rajzolási hívások száma így
    // a FAJOK számától függ (10 × 2), nem a lényekétől.
    const mertanok = lenyMertanok(THREE);
    /** fajkód → { test, fej, kapacitas, n } */
    this.fajMesh = new Map();
    for (const faj of FAJOK) {
      const m = mertanok.get(faj.kod);
      if (!m) continue;
      const lebeg = faj.lebeg || faj.atmegyFalon;
      this.fajMesh.set(faj.kod, this._fajMesheket(faj.kod, m, lebeg));
    }

    // Dolgozók: fordított kúp, hogy egy pillantással megkülönböztethetők
    // legyenek az utasoktól. Ők nem tömeg, hanem a te embereid.
    const dg = new THREE.ConeGeometry(0.3, 0.95, 6);
    dg.translate(0, 0.48, 0);
    this.dolgozoMesh = this._mesh(dg, false, MAX_DOLGOZO, true);

    // Dühjelző: apró kocka a nagyon rossz hangulatú lények fölött.
    const jg = new THREE.BoxGeometry(0.2, 0.2, 0.2);
    this.duhJelzok = this._mesh(jg, false, 300, false, true);
  }

  /**
   * Egy faj mesh-párja. A kapacitás igény szerint nő: egy utashullám alatt
   * egyetlen fajból is lehet több száz, és egy fix keret vagy pazarol, vagy
   * csendben eltünteti a lények egy részét — az utóbbi a rosszabb, mert
   * hibának se látszik.
   */
  _fajMesheket(kod, mertan, lebeg, kapacitas = 128) {
    const test = this._mesh(mertan.test, lebeg, kapacitas, !lebeg);
    const fej = this._mesh(mertan.fej, lebeg, kapacitas, !lebeg);
    return { kod, test, fej, kapacitas, mertan, lebeg };
  }

  _fajtNovel(b) {
    this.gyoker.remove(b.test); b.test.dispose();
    this.gyoker.remove(b.fej); b.fej.dispose();
    const uj = this._fajMesheket(b.kod, b.mertan, b.lebeg, b.kapacitas * 2);
    this.fajMesh.set(b.kod, uj);
    return uj;
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
    let duhN = 0;
    for (const b of this.fajMesh.values()) { b.test.count = 0; b.fej.count = 0; }

    for (let i = 0; i < sim.utasok.length; i++) {
      const u = sim.utasok[i];
      if (!u.aktiv) continue;
      // A kiszolgálás alatt álló utas BENT van az épületben — nem rajzoljuk.
      // Ez egyben olcsóbb is, és a sorok hossza így őszintén látszik.
      if (u.allapot === ALLAPOT.KISZOLGALAS) continue;
      if (u.z > this.aktivSzint && u.valtasHatra === 0) continue;

      const faj = FAJOK[u.fajIdx];
      let b = this.fajMesh.get(faj.kod);
      if (!b) continue;
      if (b.test.count >= b.kapacitas) b = this._fajtNovel(b);

      const lebeg = faj.lebeg || faj.atmegyFalon;
      const meret = faj.meret;

      // Lengés: a gyaloglás ritmusa. Az `azon` a fáziseltolás, hogy ne
      // egyszerre bólogasson az egész csarnok.
      const megy = u.allapot === ALLAPOT.MEGY || u.allapot === ALLAPOT.INDUL;
      const fazis = ido * (megy ? 7 : 1.6) + u.azon * 0.7;
      // A szintváltás alatt a lény FOLYAMATOSAN emelkedik a két szint közt.
      // Enélkül a mozgólépcső egy teleport lenne, és a negyven tick, amíg
      // tart, semmit nem közvetítene a játékosnak.
      const szintArany = u.valtasHatra > 0
        ? u.z + (u.valtasCel - u.z) * (1 - u.valtasHatra / Math.max(1, u.valtasTeljes))
        : u.z;
      const y = szintArany * SZINT_MAGASSAG
        + (lebeg ? 0.45 + Math.sin(fazis * 0.5) * 0.12 : 0)
        + (megy ? Math.abs(Math.sin(fazis)) * 0.06 : 0);

      p.set(u.x, y, u.y);
      // Nézzen arra, amerre megy. A mértan ELŐRE-iránya a lokális +Z, ezért
      // `atan2(dx, dz)` a helyes szög — a `leny_mertan.js` fejléce is ezt köti ki.
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

      const k = b.test.count++;
      b.fej.count = b.test.count;
      b.test.setMatrixAt(k, mat); b.test.setColorAt(k, sz);
      b.fej.setMatrixAt(k, mat);
      this._sz2 = this._sz2 || new THREE.Color();
      this._sz2.copy(sz).offsetHSL(0, -0.1, 0.22);
      b.fej.setColorAt(k, this._sz2);

      if (h < 0.28 && duhN < 300) {
        p.set(u.x, y + 1.4 * meret + 0.3 + Math.sin(ido * 5 + u.azon) * 0.06, u.y);
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
      const dep = d.epuletAzon >= 0 ? sim.epuletek[d.epuletAzon] : null;
      const dz = dep ? dep.z : 0;
      if (dz > this.aktivSzint) continue;
      p.set(d.x, dz * SZINT_MAGASSAG + 0.05 + Math.sin(ido * 2 + i) * 0.03, d.y);
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

    for (const b of this.fajMesh.values()) { this._zar(b.test, b.test.count); this._zar(b.fej, b.fej.count); }
    this._zar(this.dolgozoMesh, dN);
    this._zar(this.duhJelzok, duhN);
  }

  _zar(mesh, n) {
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
}
