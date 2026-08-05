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
//
// ── A SZELLEMTÖMEG (v0.7) ─────────────────────────────────────────────────
// A fölső szintek lényei eddig eltűntek. Ez pont a legfontosabb információt
// vette el: hogy VAN-E ott fönt forgalom. Egy emeleti üzletsor, amiről nem
// látszik, jár-e oda bárki, nem tervezhető.
//
// A szellemtömeg ezért EGY közös, áttetsző mesh — nem fajonkénti. Két oka van,
// és mindkettő fontosabb, mint a sziluett: (1) 24 %-os átlátszóságnál a
// kobold és a troll formája úgysem különböztethető meg, (2) a lények
// KÉPKOCKÁNKÉNT mozognak, tehát ez a réteg az egyetlen, ami tényleg minden
// frame-ben ír — itt a tíz plusz rajzolási hívás valódi ár lenne, a haszon
// meg nulla. A szín viszont marad fajonkénti: a tömeg SZÍNE messziről is
// elmondja, kik vannak fönt.

import * as THREE from 'three';
import { MAX_UTAS, SZINT_MAGASSAG } from '../mag/config.js';
import { FAJOK } from '../sim/lenyek.js';
import { DOLGOZOK } from '../sim/dolgozok.js';
import { ALLAPOT } from '../sim/utas.js';
import { lenyMertanok } from './leny_mertan.js';
import { texturak, uvtPotol } from './texturak.js';

const MAX_DOLGOZO = 240;
/** A szellemtömeg kerete. Ennél több egyszerre úgysem olvasható ki a képből. */
const MAX_SZELLEM = 600;
const PIROS = new THREE.Color(0xff3344);

export class Lenyek3d {
  constructor(szinter, sim) {
    this.sim = sim;
    /** Efölött a lények SZELLEMKÉNT látszanak (lásd a fejlécet). */
    this.aktivSzint = 0;
    this.gyoker = new THREE.Group();
    szinter.jelenet.add(this.gyoker);

    this._m = new THREE.Matrix4();
    this._p = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._sz = new THREE.Color();
    this._tengely = new THREE.Vector3(0, 1, 0);
    // Ugyanaz a gyorstárazott készlet, amit az `allomas3d.js` is használ:
    // a `texturak()` másodszorra a MEGLÉVŐ objektumot adja vissza, tehát a
    // lényréteg egyetlen új GPU-feltöltést sem okoz.
    this.tex = texturak(THREE);

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
    // A dolgozó EGYENRUHÁT visel: szövetfelület. Ez a legolcsóbb módja annak,
    // hogy „a te embered" és „vendég" ne csak formában térjen el.
    this.dolgozoMesh = this._mesh(dg, false, MAX_DOLGOZO, true, false, this.tex.szovet);

    // Dühjelző: apró kocka a nagyon rossz hangulatú lények fölött.
    const jg = new THREE.BoxGeometry(0.2, 0.2, 0.2);
    this.duhJelzok = this._mesh(jg, false, 300, false, true);

    // ── SZELLEMTÖMEG ──────────────────────────────────────────────────────
    // `MeshBasicMaterial`, tehát fénytől független: éjjel is látszik, hogy
    // fönt van forgalom. `depthWrite: false` — enélkül az egymás mögötti
    // szellemlények kioltanák egymást, és a tömeg foltokban villogna.
    const szg = new THREE.SphereGeometry(0.36, 7, 5);
    szg.scale(1, 1.55, 1);
    szg.translate(0, 0.55, 0);
    const szm = new THREE.InstancedMesh(szg, new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.28, depthWrite: false,
    }), MAX_SZELLEM);
    szm.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    szm.count = 0;
    szm.frustumCulled = false;
    szm.renderOrder = 4;
    this.gyoker.add(szm);
    this.szellemMesh = szm;
  }

  /**
   * Egy faj mesh-párja. A kapacitás igény szerint nő: egy utashullám alatt
   * egyetlen fajból is lehet több száz, és egy fix keret vagy pazarol, vagy
   * csendben eltünteti a lények egy részét — az utóbbi a rosszabb, mert
   * hibának se látszik.
   */
  _fajMesheket(kod, mertan, lebeg, kapacitas = 128) {
    // Uv utólag, dobozvetítéssel (lásd `texturak.js`): a `leny_mertan.js`
    // uv nélkül fűz össze, és textúra uv nélkül minden lény a textúra EGYETLEN
    // képpontjának színét venné fel. Két ismétlés a teljes magasságon: a lény
    // ~1,2 egység, tehát a folt nagyjából tenyérnyi marad.
    uvtPotol(THREE, mertan.test, 2, 2, 2);
    uvtPotol(THREE, mertan.fej, 2, 2, 2);
    const test = this._mesh(mertan.test, lebeg, kapacitas, !lebeg, false, this.tex.bor);
    const fej = this._mesh(mertan.fej, lebeg, kapacitas, !lebeg, false, this.tex.bor);
    return { kod, test, fej, kapacitas, mertan, lebeg };
  }

  _fajtNovel(b) {
    this.gyoker.remove(b.test); b.test.dispose();
    this.gyoker.remove(b.fej); b.fej.dispose();
    const uj = this._fajMesheket(b.kod, b.mertan, b.lebeg, b.kapacitas * 2);
    this.fajMesh.set(b.kod, uj);
    return uj;
  }

  _mesh(geo, atlatszo, db, arnyek, alapAnyag = false, terkep = null) {
    const anyag = alapAnyag
      ? new THREE.MeshBasicMaterial({ color: 0xffffff })
      : new THREE.MeshLambertMaterial({
        color: 0xffffff,
        map: terkep,
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
    let duhN = 0, szellemN = 0;
    for (const b of this.fajMesh.values()) { b.test.count = 0; b.fej.count = 0; }

    for (let i = 0; i < sim.utasok.length; i++) {
      const u = sim.utasok[i];
      if (!u.aktiv) continue;
      // A kiszolgálás alatt álló utas BENT van az épületben — nem rajzoljuk.
      // Ez egyben olcsóbb is, és a sorok hossza így őszintén látszik.
      if (u.allapot === ALLAPOT.KISZOLGALAS) continue;

      const faj = FAJOK[u.fajIdx];

      // A szintváltás közben lévő lény MINDIG szilárd: ő épp a két emelet
      // között utazik, és pont az a mozgás a lényeg, amit látni kell.
      if (u.z > this.aktivSzint && u.valtasHatra === 0) {
        if (szellemN < MAX_SZELLEM) {
          p.set(u.x, u.z * SZINT_MAGASSAG + (faj.lebeg || faj.atmegyFalon ? 0.45 : 0), u.y);
          q.identity();
          s.set(faj.meret, faj.meret, faj.meret);
          mat.compose(p, q, s);
          this.szellemMesh.setMatrixAt(szellemN, mat);
          sz.setHex(faj.szin);
          this.szellemMesh.setColorAt(szellemN, sz);
          szellemN++;
        }
        continue;
      }

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
      if (dz > this.aktivSzint) {
        // A fönti dolgozó is a szellemtömegbe kerül: enélkül az emeleti
        // üzletsorról nem látszana, hogy egyáltalán VAN-e ott személyzet.
        if (szellemN < MAX_SZELLEM) {
          p.set(d.x, dz * SZINT_MAGASSAG, d.y);
          q.identity(); s.set(0.9, 0.9, 0.9);
          mat.compose(p, q, s);
          this.szellemMesh.setMatrixAt(szellemN, mat);
          sz.setHex(t.szin);
          this.szellemMesh.setColorAt(szellemN, sz);
          szellemN++;
        }
        continue;
      }
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
    this._zar(this.szellemMesh, szellemN);
  }

  _zar(mesh, n) {
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
}
