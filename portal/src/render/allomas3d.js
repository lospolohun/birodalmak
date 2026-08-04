// PORTAL HUB TYCOON — AZ ÁLLOMÁS 3D-BEN.
//
// ── MIÉRT ÍGY ─────────────────────────────────────────────────────────────
// Három szabály vezette ezt a fájlt:
//
//  1. NULLA PER-FRAME ALLOKÁCIÓ. Minden mátrix, szín és vektor egyszer jön
//     létre, és utána újra meg újra felhasználódik. Ezer utas mellett a
//     szemétgyűjtő szünete pont a csúcsforgalomban jönne — ott, ahol a
//     legjobban látszana.
//
//  2. ÚJRAÉPÍTÉS CSAK VÁLTOZÁSKOR. A padló és az épületek geometriája a rács
//     `verzio`-jához van kötve. 3072 cella átrajzolása minden képkockán
//     fölösleges munka lenne; a rács viszont csak akkor változik, ha a
//     játékos épít.
//
//  3. EGY MESH TÍPUSONKÉNT, NEM ÉPÜLETENKÉNT. Az összes épület EGY
//     InstancedMesh doboza, példányonkénti mérettel és színnel. Húsz külön
//     mesh húsz rajzolási hívás lenne — így kettő.
//
// A portálok kivételek: ott a forgó gyűrű annyira a játék arca, hogy megéri
// nekik külön objektumot adni. Belőlük legfeljebb pár tucat van.

import * as THREE from 'three';
import { RACS_SZ, RACS_M } from '../mag/config.js';
import { EPULETEK } from '../sim/epuletek.js';
import { DIMENZIOK } from '../sim/dimenziok.js';
import { hash2 } from '../mag/rng.js';

const MAX_EPULET = 400;
const MAX_PORTAL = 24;

export class Allomas3d {
  constructor(szinter, sim) {
    this.szinter = szinter;
    this.sim = sim;
    this.gyoker = new THREE.Group();
    szinter.jelenet.add(this.gyoker);

    // Újrahasznált segédek — soha nem allokálunk ezekből futás közben.
    this._m = new THREE.Matrix4();
    this._p = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._sz = new THREE.Color();

    this._alaplemezt();
    this._padlot();
    this._epuleteket();
    this._portalokat();
    this._elonezetet();

    this._racsVerzio = -1;
  }

  /**
   * Alaplemez: egy sötét hasáb a kiépített padló alatt.
   *
   * MIÉRT KELL: enélkül az állomás egy hajszálvékony lap a semmiben, és a
   * „lebegő szigeten álló csomópont" képből nem marad semmi. Egyetlen doboz,
   * a padló befoglalójára húzva — nulla példány, nulla extra rajzolási hívás.
   */
  _alaplemezt() {
    const g = new THREE.BoxGeometry(1, 1, 1);
    g.translate(0, -0.5, 0);
    this.alaplemez = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0x171c33 }));
    this.alaplemez.visible = false;
    this.gyoker.add(this.alaplemez);
  }

  // ── PADLÓ ───────────────────────────────────────────────────────────────
  _padlot() {
    const g = new THREE.BoxGeometry(0.98, 0.24, 0.98);
    g.translate(0, -0.12, 0);
    const a = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const m = new THREE.InstancedMesh(g, a, RACS_SZ * RACS_M);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.receiveShadow = true;
    m.count = 0;
    this.gyoker.add(m);
    this.padlo = m;
  }

  // ── ÉPÜLETEK ────────────────────────────────────────────────────────────
  _epuleteket() {
    const g = new THREE.BoxGeometry(1, 1, 1);
    g.translate(0, 0.5, 0);   // a doboz alja a talajon áll
    const test = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ color: 0xffffff }), MAX_EPULET);
    test.castShadow = true; test.receiveShadow = true;
    test.count = 0;
    this.gyoker.add(test);
    this.testek = test;

    // Tetődísz: világosabb sáv a tetején. Ettől lesz „épület" a dobozból.
    const teto = new THREE.InstancedMesh(g.clone(), new THREE.MeshLambertMaterial({ color: 0xffffff }), MAX_EPULET);
    teto.castShadow = true;
    teto.count = 0;
    this.gyoker.add(teto);
    this.tetok = teto;

    // Állapotjelző kocka az épület fölött: ez mondja meg egy pillantásra,
    // hogy hiányzik a személyzet vagy ki van kapcsolva. Szöveg helyett szín,
    // mert a szöveg 3D-ben vagy olvashatatlan, vagy elveszi a képet.
    const jg = new THREE.OctahedronGeometry(0.34);
    const jelzo = new THREE.InstancedMesh(jg, new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX_EPULET);
    jelzo.count = 0;
    this.gyoker.add(jelzo);
    this.jelzok = jelzo;
  }

  // ── PORTÁLOK ────────────────────────────────────────────────────────────
  _portalokat() {
    this.portalok = [];
    for (let i = 0; i < MAX_PORTAL; i++) {
      const cs = new THREE.Group();
      const gyuru = new THREE.Mesh(
        new THREE.TorusGeometry(1.32, 0.17, 10, 32),
        new THREE.MeshBasicMaterial({ color: 0xffffff }),
      );
      gyuru.position.y = 1.75;
      // Külső, ellentétes irányban forgó gyűrű — ettől „jár" a kapu ahelyett,
      // hogy csak világítana. Hatszögletű, hogy a forgása látszódjon is.
      const kulso = new THREE.Mesh(
        new THREE.TorusGeometry(1.72, 0.07, 6, 6),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }),
      );
      kulso.position.y = 1.75;
      const orveny = new THREE.Mesh(
        new THREE.CircleGeometry(1.16, 28),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
      );
      orveny.position.y = 1.75;
      const talp = new THREE.Mesh(
        new THREE.CylinderGeometry(1.45, 1.6, 0.3, 16),
        new THREE.MeshLambertMaterial({ color: 0x2b3350 }),
      );
      talp.position.y = 0.15;
      talp.receiveShadow = true;
      const feny = new THREE.PointLight(0xffffff, 0, 12);
      feny.position.y = 1.8;
      cs.add(talp, kulso, gyuru, orveny, feny);
      cs.visible = false;
      this.gyoker.add(cs);
      this.portalok.push({ cs, gyuru, kulso, orveny, feny, talp });
    }
  }

  // ── ÉPÍTÉSI ELŐNÉZET ────────────────────────────────────────────────────
  _elonezetet() {
    const g = new THREE.BoxGeometry(1, 1, 1);
    g.translate(0, 0.5, 0);
    this.elonezetMesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      color: 0x63d68a, transparent: true, opacity: 0.42, depthWrite: false,
    }));
    this.elonezetMesh.visible = false;
    this.gyoker.add(this.elonezetMesh);
  }

  /**
   * Az építési szellemkép beállítása.
   * @param {{x:number,y:number}|null} cella
   * @param {number} sz szélesség cellában
   * @param {number} m mélység cellában
   * @param {number} magas
   * @param {boolean} ervenyes
   */
  elonezet(cella, sz, m, magas, ervenyes) {
    const e = this.elonezetMesh;
    if (!cella) { e.visible = false; return; }
    e.visible = true;
    e.position.set(cella.x + sz * 0.5, 0.02, cella.y + m * 0.5);
    e.scale.set(sz * 0.96, magas, m * 0.96);
    e.material.color.setHex(ervenyes ? 0x63d68a : 0xff5d73);
  }

  // ── KÉPKOCKÁNKÉNT ───────────────────────────────────────────────────────

  frissit(ido) {
    const sim = this.sim;
    if (sim.racs.verzio !== this._racsVerzio) {
      this._padlotEpit();
      this._epuleteketEpit();
      this._racsVerzio = sim.racs.verzio;
    }
    this._jelzoketFrissit();
    this._portalokatAnimal(ido);
  }

  _padlotEpit() {
    const racs = this.sim.racs;
    const m = this.padlo;
    const mat = this._m, p = this._p, q = this._q, s = this._s, sz = this._sz;
    q.identity(); s.set(1, 1, 1);
    let n = 0;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let y = 0; y < RACS_M; y++) {
      for (let x = 0; x < RACS_SZ; x++) {
        const i = y * RACS_SZ + x;
        if (racs.padlo[i] !== 1) continue;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
        p.set(x + 0.5, 0, y + 0.5);
        mat.compose(p, q, s);
        m.setMatrixAt(n, mat);
        // Alapszín + cellánkénti apró eltérés, hogy a padló ne legyen lapos
        // egyszínű felület. A `hash2` sorrendfüggetlen, tehát ugyanaz a cella
        // MINDIG ugyanolyan — nincs villogás építés után.
        const v = (hash2(x, y, 7) % 1000) / 1000;
        // Sakktábla + cellazaj. A sakktábla nem díszítés: enélkül a nagy
        // csarnok egyetlen összemosódó felület, és nem lehet megbecsülni,
        // hány cella széles egy folyosó — pedig pont ez a tervezés alapja.
        const sakk = ((x + y) & 1) ? 1.09 : 0.93;
        let r = (0.176 + v * 0.03) * sakk, g2 = (0.227 + v * 0.035) * sakk, b = (0.33 + v * 0.045) * sakk;
        // Zónaszínezés: a hő és a hideg LÁTSZIK a padlón. Enélkül a démon
        // panasza megmagyarázhatatlan lenne — nem látnád, hol van meleg.
        const ho = racs.ho[i] / 255, hideg = racs.hideg[i] / 255;
        if (ho > 0) { r += ho * 0.42; g2 += ho * 0.12; b -= ho * 0.14; }
        if (hideg > 0) { r -= hideg * 0.10; g2 += hideg * 0.18; b += hideg * 0.34; }
        sz.setRGB(clamp01(r), clamp01(g2), clamp01(b), THREE.SRGBColorSpace);
        m.setColorAt(n, sz);
        n++;
      }
    }
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;

    if (n > 0) {
      this.alaplemez.visible = true;
      this.alaplemez.position.set((x0 + x1 + 1) * 0.5, -0.24, (y0 + y1 + 1) * 0.5);
      this.alaplemez.scale.set(x1 - x0 + 1.6, 2.4, y1 - y0 + 1.6);
    } else this.alaplemez.visible = false;
  }

  _epuleteketEpit() {
    const sim = this.sim;
    const test = this.testek, teto = this.tetok;
    const mat = this._m, p = this._p, q = this._q, s = this._s, sz = this._sz;
    q.identity();
    let n = 0;
    let portalN = 0;
    this._portalHozzarendeles = [];
    for (let a = 0; a < sim.epuletek.length; a++) {
      const ep = sim.epuletek[a];
      if (!ep) continue;
      const t = EPULETEK[ep.tipusIdx];

      if (ep.kod === 'portal') {
        if (portalN < MAX_PORTAL) {
          const o = this.portalok[portalN];
          o.cs.visible = true;
          o.cs.position.set(ep.x + ep.sz * 0.5, 0, ep.y + ep.m * 0.5);
          this._portalHozzarendeles.push({ o, ep });
          portalN++;
        }
        continue;
      }

      if (n >= MAX_EPULET) break;
      p.set(ep.x + ep.sz * 0.5, 0.02, ep.y + ep.m * 0.5);
      s.set(ep.sz * 0.9, t.magas, ep.m * 0.9);
      mat.compose(p, q, s);
      test.setMatrixAt(n, mat);
      sz.setHex(t.szin);
      test.setColorAt(n, sz);

      p.set(ep.x + ep.sz * 0.5, t.magas + 0.02, ep.y + ep.m * 0.5);
      s.set(ep.sz * 0.66, 0.2, ep.m * 0.66);
      mat.compose(p, q, s);
      teto.setMatrixAt(n, mat);
      sz.setHex(t.szin).offsetHSL(0, 0.05, 0.22);
      teto.setColorAt(n, sz);
      n++;
    }
    for (let i = portalN; i < MAX_PORTAL; i++) this.portalok[i].cs.visible = false;

    test.count = n; teto.count = n;
    test.instanceMatrix.needsUpdate = true;
    teto.instanceMatrix.needsUpdate = true;
    if (test.instanceColor) test.instanceColor.needsUpdate = true;
    if (teto.instanceColor) teto.instanceColor.needsUpdate = true;
  }

  /**
   * Állapotjelzők. Ezek minden képkockában újraépülnek — nem a rács
   * verziójához vannak kötve, mert a személyzet és a ki/be kapcsolás
   * bármikor változhat, és pont ez az a két dolog, amit AZONNAL látni kell.
   * Néhány tucat példány: olcsóbb újraszámolni, mint nyilvántartani.
   */
  _jelzoketFrissit() {
    const sim = this.sim;
    const j = this.jelzok;
    const mat = this._m, p = this._p, q = this._q, s = this._s, sz = this._sz;
    q.identity(); s.set(1, 1, 1);
    let n = 0;
    for (let a = 0; a < sim.epuletek.length; a++) {
      const ep = sim.epuletek[a];
      if (!ep || n >= MAX_EPULET) continue;
      const t = EPULETEK[ep.tipusIdx];
      let szin = 0;
      if (ep.kikapcsolva) szin = 0xff5d73;
      else if (t.szemelyzet > 0 && ep.dolgozok.length === 0) szin = 0xff5d73;
      else if (t.szemelyzet > 0 && ep.dolgozok.length < t.szemelyzet) szin = 0xffc247;
      else if (ep.sor.length > 12) szin = 0xffc247;
      if (!szin) continue;
      p.set(ep.x + ep.sz * 0.5, (t.magas || 2) + 1.1, ep.y + ep.m * 0.5);
      mat.compose(p, q, s);
      j.setMatrixAt(n, mat);
      sz.setHex(szin);
      j.setColorAt(n, sz);
      n++;
    }
    j.count = n;
    j.instanceMatrix.needsUpdate = true;
    if (j.instanceColor) j.instanceColor.needsUpdate = true;
  }

  _portalokatAnimal(ido) {
    const lista = this._portalHozzarendeles || [];
    for (let i = 0; i < lista.length; i++) {
      const { o, ep } = lista[i];
      const dim = ep.dimenzio >= 0 ? DIMENZIOK[ep.dimenzio] : null;
      const all = ep.dimenzio >= 0 ? this.sim.dimenziok[ep.dimenzio] : null;
      const alap = dim ? dim.szin : 0x6a6a8a;
      const all2 = all && all.szunet === 0 && !ep.kikapcsolva;

      // Az instabilitás LÁTSZIK: a gyűrű a saját színéből a vörös felé megy,
      // és egyre idegesebben pörög. A HUD százaléka mellett ez a zsigeri jel.
      const inst = all ? Math.min(1, all.instabilitas / 1000) : 0;
      this._sz.setHex(alap).lerp(PIROS, inst * 0.85);
      o.gyuru.material.color.copy(this._sz);
      o.kulso.material.color.copy(this._sz);
      o.orveny.material.color.copy(this._sz);
      o.feny.color.copy(this._sz);
      o.feny.intensity = all2 ? 6 + inst * 10 : 0;
      o.orveny.material.opacity = all2 ? 0.45 + Math.sin(ido * 2.2) * 0.08 : 0.08;

      o.gyuru.rotation.z = ido * (0.5 + inst * 3.4);
      o.kulso.rotation.z = -ido * (0.35 + inst * 2.2);
      o.orveny.rotation.z = -ido * (0.9 + inst * 4.5);
      // A gyűrű a nézővel szemben áll — a kamera bármerre fordulhat.
      const k = this.szinter.kamera.position;
      const sz2 = Math.atan2(k.x - o.cs.position.x, k.z - o.cs.position.z);
      o.gyuru.rotation.y = 0; o.orveny.rotation.y = 0;
      o.cs.rotation.y = sz2;
      o.cs.scale.setScalar(all2 ? 1 : 0.82);
    }
  }
}

const PIROS = new THREE.Color(0xff3355);
function clamp01(x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }
