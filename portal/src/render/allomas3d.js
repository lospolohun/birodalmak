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
//
// ── A SZELLEMSZINT (v0.7) ─────────────────────────────────────────────────
// A v0.3-ban az aktív szint FÖLÖTTI emeleteket egyszerűen nem rajzoltuk ki.
// Ez működött, csak hazudott: a földszinten állva úgy tűnt, mintha az emelet
// nem is létezne, és a játékos nem tudta megítélni, hova érdemes átjárót
// tenni, hol lóg ki az emeleti padló, meddig ér a fönti csarnok.
//
// A csere: a fölső szintek HALVÁNYAN, áttetszően látszanak. Három szabály,
// mindhárom fájdalomból tanulva:
//
//  1. `depthWrite: false` a szellemrétegeken. Ha írnának a mélységpufferbe,
//     az egymást átfedő áttetsző lapok a kamera szögétől függően takarnák ki
//     egymást — vagyis a fönti padló VILLOGNA forgatás közben.
//  2. A szellem is PÉLDÁNYOSÍTVA megy: típusonként EGY külön InstancedMesh.
//     A rajzolási hívások száma így továbbra is a TÍPUSOK számától függ.
//     És mivel a `count = 0`-s példányosított mesh-re a three ki sem adja a
//     hívást, aki sosem épít emeletre, az egyet sem fizet érte.
//  3. Az aktív szint ALATTI emeletek teljesen átlátszatlanok maradnak — azok
//     nem kontextus, hanem a szerkezet, amin állunk.

import * as THREE from 'three';
import { RACS_SZ, RACS_M, RACS_SZINT, SZINT_MAGASSAG } from '../mag/config.js';
import { EPULETEK } from '../sim/epuletek.js';
import { DIMENZIOK } from '../sim/dimenziok.js';
import { hash2 } from '../mag/rng.js';
import { epuletMertanok, epuletDiszek } from './epulet_mertan.js';
import {
  texturak, uvtPotol, vilagUvre, EPULET_ANYAG, ALAP_ANYAG, PADLO_UV_SKALA,
} from './texturak.js';

const MAX_EPULET = 600;
const MAX_PORTAL = 24;
/** A szellemréteg átlátszósága. 0,3 fölött már versenyez az aktív szinttel. */
const SZELLEM_ATLATSZO = 0.24;
const SZELLEM_PADLO = 0.18;

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

    // ── A FELÜLETEK ────────────────────────────────────────────────────────
    // Egyszer, indulás előtt. A `texturak()` gyorstáraz, tehát ha a lényréteg
    // is elkéri, ugyanazt a készletet kapja — nem lesz belőle második
    // GPU-feltöltés. A `frissit()` SOHA nem nyúl ide.
    this.tex = texturak(THREE);
    /**
     * A padlótextúra átlagos fényessége. A textúra SZOROZÓDIK a cellaszínnel,
     * tehát önmagában sötétítene — ezzel osztunk vissza. (A látvány-sáv
     * csillagai pont ezen buktak el: a „dísz" ténylegesen elvitt fényt.)
     * A felső korlát azért van, hogy egy elrontott, sötét textúra ne tudja
     * kiégetni a padlót.
     */
    this.padloFenyKomp = Math.min(1.35, 1 / Math.max(0.5, this.tex.padlo.atlag || 1));

    this._alaplemezt();
    this._padlot();
    this._epuleteket();
    this._portalokat();
    this._elonezetet();
    this._kiemelest();

    this._racsVerzio = -1;
    /**
     * Az aktív szint. A FÖLÖTTE lévő emeletek SZELLEMKÉNT látszanak (lásd a
     * fejlécet), az alattiak teljes fényben. Enélkül a földszinten dolgozó
     * játékos a saját emeletének a padlóját nézné, és nem látná, hová épít.
     */
    this.aktivSzint = 0;
    this._rajzoltSzint = -1;
  }

  /** A szintválasztó hívja. Újraépítést kényszerít, mert a láthatóság változik. */
  szintet(z) {
    const uj = Math.max(0, Math.min(RACS_SZINT - 1, z | 0));
    if (uj === this.aktivSzint) return;
    this.aktivSzint = uj;
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
    // Szikla-felület: a lemez a nyers kőzet, amiről az állomás leszakadt. A
    // textúra sokszorosan ismétlődik rajta (`repeat` a `texturak.js`-ben), mert
    // ez az egyetlen olyan objektum, ami harminc cellányi is lehet.
    // A szín VILÁGOSABB, mint a régi 0x171c33 — mert most szorzóként működik:
    // a textúra maga hozza a sötét kőzetszínt, és a kettő szorzata adja ki
    // ugyanazt a mélységet, amit eddig egyetlen hex.
    this.alaplemez = new THREE.Mesh(g, new THREE.MeshLambertMaterial({
      color: 0x8a93b8, map: this.tex.szikla,
    }));
    this.alaplemez.visible = false;
    this.gyoker.add(this.alaplemez);
  }

  // ── PADLÓ ───────────────────────────────────────────────────────────────
  //
  // Két mesh, EGY geometria: a szilárd (aktív szint és alatta) és a szellem
  // (fölötte). Azért nem egy mesh példányonkénti átlátszósággal, mert az
  // WebGL-ben csak saját shaderrel megy — és a szellemréteg amúgy is más
  // rendezési szakaszba tartozik (áttetsző, mélységírás nélkül).
  _padlot() {
    const g = new THREE.BoxGeometry(0.98, 0.24, 0.98);
    g.translate(0, -0.12, 0);
    const kapacitas = RACS_SZ * RACS_M * RACS_SZINT;
    // ── A KŐLAPBURKOLAT ────────────────────────────────────────────────────
    // A `vilagUvre` a példány VILÁGKOORDINÁTÁJÁBÓL számol uv-t (lásd a
    // `texturak.js` fejlécét): nyolc cellánként ismétlődik a textúra, és nyolcszor
    // nyolc KÜLÖNBÖZŐ kőlap van benne. Enélkül mind a 6912 cella ugyanazt az
    // egy csempét mutatná — 96×72-n ez volna a lehető legunalmasabb felület.
    const a = vilagUvre(new THREE.MeshLambertMaterial({
      color: 0xffffff, map: this.tex.padlo,
    }), PADLO_UV_SKALA);
    const m = new THREE.InstancedMesh(g, a, kapacitas);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.receiveShadow = true;
    m.count = 0;
    this.gyoker.add(m);
    this.padlo = m;

    const sza = new THREE.MeshLambertMaterial({
      color: 0xffffff, transparent: true, opacity: SZELLEM_PADLO, depthWrite: false,
    });
    const sm = new THREE.InstancedMesh(g, sza, kapacitas);
    sm.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    sm.count = 0;
    sm.renderOrder = 2;
    this.gyoker.add(sm);
    this.padloSzellem = sm;
  }

  // ── ÉPÜLETEK ────────────────────────────────────────────────────────────
  //
  // TÍPUSONKÉNT egy test- és egy dísz-InstancedMesh. Miért nem egyetlen közös
  // doboz, mint a v0.1-ben: mert a példányosítás EGY geometriát tud sokszorozni,
  // és ha minden épület ugyanaz a doboz, akkor minden épület úgy is néz ki.
  // A csere ára a rajzolási hívások száma — de az a TÍPUSOK számától függ
  // (~20 × 2), nem az épületekétől. Négyszáz épület is ugyanannyi hívás.
  _epuleteket() {
    const mertanok = epuletMertanok(THREE);
    const diszek = epuletDiszek(THREE);
    /** épületkód → { test, disz, kapacitas } */
    this.tipusMesh = new Map();
    for (const [kod, geo] of mertanok) {
      // ── UV UTÓLAG ────────────────────────────────────────────────────────
      // A mértan-fájl szándékosan uv nélkül fűz össze (akkor még nem volt
      // textúra). Textúra uv NÉLKÜL nem hiba, hanem csendes hazugság: minden
      // csúcs (0,0)-t kapna, és az épület a textúra egyetlen képpontjának
      // színét venné fel — lapos folt, ami szándéknak látszik.
      //
      // Az ismétlődés a típus VALÓDI méretéhez igazodik (`t.sz`, `t.magas`,
      // `t.m`), mert a geometria a [0..1]³-ban van: enélkül egy 3×3-as vasúti
      // csarnokon ugyanannyi csempe lenne, mint egy 1×1-es mosdón, vagyis
      // háromszorosra nyúlt téglák.
      const t = EPULETEK.find((e) => e.kod === kod);
      const magas = t ? (t.magas || 1) : 1;
      uvtPotol(THREE, geo, t ? t.sz : 1, magas, t ? t.m : 1);
      const dg = diszek.get(kod);
      if (dg) uvtPotol(THREE, dg, t ? t.sz : 1, magas, t ? t.m : 1);
      this.tipusMesh.set(kod, this._tipusMesheket(kod, geo, dg));
    }

    // Állapotjelző az épület fölött: ez mondja meg egy pillantásra,
    // hogy hiányzik a személyzet vagy ki van kapcsolva. Szöveg helyett szín,
    // mert a szöveg 3D-ben vagy olvashatatlan, vagy elveszi a képet.
    const jg = new THREE.OctahedronGeometry(0.34);
    const jelzo = new THREE.InstancedMesh(jg, new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX_EPULET);
    jelzo.count = 0;
    this.gyoker.add(jelzo);
    this.jelzok = jelzo;
  }

  /**
   * Egy típus mesh-párja. A kapacitás igény szerint NŐ: egy tycoonban nem
   * tudjuk előre, hány mosdót épít valaki, egy fix keret pedig vagy pazarol,
   * vagy csendben elnyeli a huszonötödik épületet.
   */
  _tipusMesheket(kod, geo, diszGeo, kapacitas = 48) {
    // TÍPUSONKÉNT egy anyag, tehát típusonként egy textúra-hivatkozás — a
    // textúra maga viszont KILENC felület közül való, közösen használva
    // (`EPULET_ANYAG`). Példányonkénti anyag itt halálos volna: az szüntetné meg
    // a példányosítást, amiért ez az egész fájl így néz ki.
    const [testAnyag, diszAnyag] = EPULET_ANYAG.get(kod) || ALAP_ANYAG;
    const test = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({
      color: 0xffffff, map: this.tex[testAnyag],
    }), kapacitas);
    test.castShadow = true; test.receiveShadow = true;
    test.count = 0;
    test.frustumCulled = false;
    this.gyoker.add(test);
    let disz = null;
    if (diszGeo) {
      disz = new THREE.InstancedMesh(diszGeo, new THREE.MeshLambertMaterial({
        color: 0xffffff, map: this.tex[diszAnyag],
      }), kapacitas);
      disz.castShadow = true;
      disz.count = 0;
      disz.frustumCulled = false;
      this.gyoker.add(disz);
    }
    // A SZELLEM-változat csak a TESTET viszi, díszt nem: 24 %-os
    // átlátszóságnál a kémény és a cégér amúgy is beleolvad, cserébe ez
    // huszonhárom rajzolási hívást spórol azon a szinten, ahol a játékos
    // épp NEM dolgozik.
    const szellem = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({
      color: 0xffffff, transparent: true, opacity: SZELLEM_ATLATSZO, depthWrite: false,
    }), kapacitas);
    szellem.count = 0;
    szellem.frustumCulled = false;
    szellem.renderOrder = 3;
    this.gyoker.add(szellem);
    return { kod, test, disz, szellem, kapacitas, geo, diszGeo };
  }

  /** Kapacitás-növelés: a régi mesh-ek helyére kétszer akkorák kerülnek. */
  _tipustNovel(bejegyzes) {
    this.gyoker.remove(bejegyzes.test);
    bejegyzes.test.dispose();
    if (bejegyzes.disz) { this.gyoker.remove(bejegyzes.disz); bejegyzes.disz.dispose(); }
    this.gyoker.remove(bejegyzes.szellem);
    bejegyzes.szellem.dispose();
    const uj = this._tipusMesheket(bejegyzes.kod, bejegyzes.geo, bejegyzes.diszGeo, bejegyzes.kapacitas * 2);
    this.tipusMesh.set(bejegyzes.kod, uj);
    return uj;
  }

  // ── PORTÁLOK ────────────────────────────────────────────────────────────
  _portalokat() {
    this.portalok = [];
    for (let i = 0; i < MAX_PORTAL; i++) {
      const cs = new THREE.Group();
      // A gyűrűn RÚNASZALAG fut körbe (a tórusz `u`-ja a gyűrű mentén megy,
      // tehát a szalag magától körbeér). Ez az, amitől a kapu forgása
      // LÁTSZIK: egy egyszínű tórusz forgatva mozdulatlannak tűnik.
      const gyuru = new THREE.Mesh(
        new THREE.TorusGeometry(1.32, 0.17, 10, 32),
        new THREE.MeshBasicMaterial({ color: 0xffffff, map: this.tex.runa }),
      );
      gyuru.position.y = 1.75;
      // Külső, ellentétes irányban forgó gyűrű — ettől „jár" a kapu ahelyett,
      // hogy csak világítana. Hatszögletű, hogy a forgása látszódjon is.
      const kulso = new THREE.Mesh(
        new THREE.TorusGeometry(1.72, 0.07, 6, 6),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }),
      );
      kulso.position.y = 1.75;
      // Az örvény spirálkarjai ALFÁVAL vannak kivágva: a kapu közepén tényleg
      // átlátszik az állomás, és a forgás sodrásnak látszik, nem egy festett
      // tányér pörgésének.
      const orveny = new THREE.Mesh(
        new THREE.CircleGeometry(1.16, 28),
        new THREE.MeshBasicMaterial({
          color: 0xffffff, map: this.tex.orveny,
          transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false,
        }),
      );
      orveny.position.y = 1.75;
      const talp = new THREE.Mesh(
        new THREE.CylinderGeometry(1.45, 1.6, 0.3, 16),
        new THREE.MeshLambertMaterial({ color: 0x8892c0, map: this.tex.fem }),
      );
      talp.position.y = 0.15;
      talp.receiveShadow = true;
      const feny = new THREE.PointLight(0xffffff, 0, 12);
      feny.position.y = 1.8;
      cs.add(talp, kulso, gyuru, orveny, feny);
      cs.visible = false;
      this.gyoker.add(cs);
      this.portalok.push({ cs, gyuru, kulso, orveny, feny, talp, szellem: false });
    }
  }

  /**
   * A fölső szint kapuja szellemként. A `transparent` átbillentése SHADERT
   * fordíttat újra a three-vel, ezért ez CSAK szintváltáskor futhat — nem
   * képkockánként. (A hívó, a `_epuleteketEpit`, a rács verziójához van kötve,
   * tehát ez teljesül; ha valaha képkockánkénti hívóhelyet kap, az akadozni fog.)
   */
  _portaltSzellemit(o, szellem) {
    if (o.szellem === szellem) return;
    o.szellem = szellem;
    for (const r of [o.gyuru, o.kulso, o.talp]) {
      r.material.transparent = szellem || r === o.kulso;
      r.material.opacity = szellem ? SZELLEM_ATLATSZO : (r === o.kulso ? 0.7 : 1);
      r.material.depthWrite = !szellem;
      r.material.needsUpdate = true;
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
    e.position.set(cella.x + sz * 0.5, this.aktivSzint * SZINT_MAGASSAG + 0.02, cella.y + m * 0.5);
    e.scale.set(sz * 0.96, magas, m * 0.96);
    e.material.color.setHex(ervenyes ? 0x63d68a : 0xff5d73);
  }

  // ── KIJELÖLÉS-KIEMELÉS ──────────────────────────────────────────────────
  //
  // MIÉRT KELL: a „kéz" eszközzel az épületre mutatva eddig CSAK a súgóbuborék
  // változott — a képernyő túloldalán. A játékos így nem tudta, melyik házra
  // vonatkozik, amit olvas; sűrűn beépített csarnokban ez rendszeresen rossz
  // épület elbontásához vezetett.
  //
  // MIÉRT GYŰRŰ ÉS NEM SZÍNEZÉS: az épület színe INFORMÁCIÓ (a típusé), a
  // példányszíne pedig a példányosított mesh-ben lakik — kiemeléshez át kellene
  // írni, majd visszaállítani, és egy elmaradt visszaállítás tartósan hazudna.
  // A gyűrű független objektum: nem tud „beragadni" egy épület színébe.
  _kiemelest() {
    const cs = new THREE.Group();
    const gy = new THREE.Mesh(
      new THREE.TorusGeometry(0.5, 0.055, 8, 40),
      new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.9, depthWrite: false }),
    );
    gy.rotation.x = -Math.PI * 0.5;
    // Álló keret: a gyűrű a talpat jelöli, ez a magasságot. Az `EdgesGeometry`
    // egyetlen vonal-hívás, és nem takarja el, amit körberajzol.
    const keret = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
      new THREE.LineBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.75, depthWrite: false }),
    );
    keret.position.y = 0.5;
    cs.add(gy, keret);
    cs.visible = false;
    cs.renderOrder = 6;
    this.gyoker.add(cs);
    this.kiemeles = cs;
    this.kiemelesGyuru = gy;
    this.kiemelesKeret = keret;
    /** A kiemelt épület azonosítója, vagy −1. */
    this.kiemeltAzon = -1;
  }

  /**
   * Kiemelés be/ki. A `fo.js` hívja a „kéz" eszköznél:
   *   `allomas.kiemel(azon)`  — az egér alatti épület azonosítója
   *   `allomas.kiemel(-1)`    — nincs mit kiemelni
   * Nem hibázik ismeretlen azonosítóra, és nem tart hivatkozást a sim
   * objektumaira: minden képkockában újra megkérdezi, létezik-e még.
   * @param {number|null} azon
   */
  kiemel(azon) {
    this.kiemeltAzon = (azon === null || azon === undefined) ? -1 : (azon | 0);
  }

  _kiemelestFrissit(ido) {
    const cs = this.kiemeles;
    const ep = this.kiemeltAzon >= 0 ? this.sim.epuletek[this.kiemeltAzon] : null;
    if (!ep) { cs.visible = false; return; }
    const t = EPULETEK[ep.tipusIdx];
    const magas = t.atjaro ? SZINT_MAGASSAG : (t.magas || 1.4);
    cs.visible = true;
    cs.position.set(ep.x + ep.sz * 0.5, ep.z * SZINT_MAGASSAG + 0.06, ep.y + ep.m * 0.5);
    // Lüktetés: a szem a MOZGÁST veszi észre, nem a színt. Egy statikus gyűrű
    // beleolvad a sok apró geometriába, egy lélegző nem.
    const p = 1 + Math.sin(ido * 4.2) * 0.05;
    this.kiemelesGyuru.scale.set((ep.sz + 0.5) * p, (ep.m + 0.5) * p, 1);
    this.kiemelesKeret.scale.set(ep.sz + 0.16, magas + 0.16, ep.m + 0.16);
    this.kiemelesGyuru.material.opacity = 0.72 + Math.sin(ido * 4.2) * 0.22;
  }

  // ── KÉPKOCKÁNKÉNT ───────────────────────────────────────────────────────

  frissit(ido) {
    const sim = this.sim;
    if (sim.racs.verzio !== this._racsVerzio || this.aktivSzint !== this._rajzoltSzint) {
      this._rajzoltSzint = this.aktivSzint;
      this._padlotEpit();
      this._epuleteketEpit();
      this._racsVerzio = sim.racs.verzio;
    }
    this._jelzoketFrissit();
    this._portalokatAnimal(ido);
    this._kiemelestFrissit(ido);
  }

  _padlotEpit() {
    const racs = this.sim.racs;
    const m = this.padlo, szm = this.padloSzellem;
    const mat = this._m, p = this._p, q = this._q, s = this._s, sz = this._sz;
    const kompenzacio = this.padloFenyKomp;
    q.identity(); s.set(1, 1, 1);
    let n = 0, szn = 0;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let z = 0; z < RACS_SZINT; z++) {
    const szellem = z > this.aktivSzint;
    const magas = z * SZINT_MAGASSAG;
    for (let y = 0; y < RACS_M; y++) {
      for (let x = 0; x < RACS_SZ; x++) {
        const i = (z * RACS_M + y) * RACS_SZ + x;
        if (racs.padlo[i] !== 1) continue;
        if (z === 0) {
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
        p.set(x + 0.5, magas, y + 0.5);
        mat.compose(p, q, s);
        if (szellem) {
          // A szellempadló EGYSZÍNŰ, hűvös derengés: a zónaszínek és a
          // sakktábla itt csak zajt adnának, hiszen nem azon a szinten
          // tervezünk. Az alakja viszont — meddig ér, hol lyukas — pont az,
          // amiért ez a réteg egyáltalán van.
          szm.setMatrixAt(szn, mat);
          sz.setRGB(0.42, 0.56, 0.86, THREE.SRGBColorSpace);
          szm.setColorAt(szn, sz);
          szn++;
          continue;
        }
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
        // Az emeleti padló hidegebb és világosabb: így egy pillantással
        // látszik, melyik szintet nézed, akkor is, ha a kamera lapos szögben áll.
        if (z > 0) { r = r * 0.86 + 0.10; g2 = g2 * 0.9 + 0.12; b = b * 0.95 + 0.16; }
        // A kőlaptextúra SZORZÓDIK ezzel a színnel, tehát önmagában sötétítene.
        // Ez az osztás adja vissza a fényt: a textúra mintát ad, nem árnyékot.
        r *= kompenzacio; g2 *= kompenzacio; b *= kompenzacio;
        sz.setRGB(clamp01(r), clamp01(g2), clamp01(b), THREE.SRGBColorSpace);
        m.setColorAt(n, sz);
        n++;
      }
    }
    }
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    szm.count = szn;
    szm.instanceMatrix.needsUpdate = true;
    if (szm.instanceColor) szm.instanceColor.needsUpdate = true;

    if (n > 0) {
      this.alaplemez.visible = true;
      this.alaplemez.position.set((x0 + x1 + 1) * 0.5, -0.24, (y0 + y1 + 1) * 0.5);
      this.alaplemez.scale.set(x1 - x0 + 1.6, 2.4, y1 - y0 + 1.6);
    } else this.alaplemez.visible = false;
  }

  _epuleteketEpit() {
    const sim = this.sim;
    const mat = this._m, p = this._p, q = this._q, s = this._s, sz = this._sz;
    q.identity();
    for (const b of this.tipusMesh.values()) { b.test.count = 0; if (b.disz) b.disz.count = 0; b.szellem.count = 0; }
    let portalN = 0;
    this._portalHozzarendeles = [];

    for (let a = 0; a < sim.epuletek.length; a++) {
      const ep = sim.epuletek[a];
      if (!ep) continue;
      const t = EPULETEK[ep.tipusIdx];
      const szellem = ep.z > this.aktivSzint;
      const magas = ep.z * SZINT_MAGASSAG;

      if (ep.kod === 'portal') {
        if (portalN < MAX_PORTAL) {
          const o = this.portalok[portalN];
          o.cs.visible = true;
          o.cs.position.set(ep.x + ep.sz * 0.5, magas, ep.y + ep.m * 0.5);
          this._portaltSzellemit(o, szellem);
          this._portalHozzarendeles.push({ o, ep, szellem });
          portalN++;
        }
        continue;
      }

      let b = this.tipusMesh.get(ep.kod);
      if (!b) continue;
      // ⚠️ A növelés ELDOBJA a régi mesh-eket, tehát utána SEMMILYEN korábbi
      // hivatkozást nem szabad használni — ezért kérdezzük le a számlálót
      // közvetlenül a bejegyzésből, és nem tartunk el egy `cel` változót.
      if ((szellem ? b.szellem.count : b.test.count) >= b.kapacitas) b = this._tipustNovel(b);

      // Az átjáró a két szint közti teret tölti ki, nem a saját magasságát:
      // a mozgólépcsőnek FEL kell érnie, különben ránézésre nem vezet sehová.
      const testMagas = t.atjaro ? SZINT_MAGASSAG : t.magas;
      p.set(ep.x, magas + 0.02, ep.y);
      s.set(ep.sz, testMagas, ep.m);
      // A mértan a [0..1]³-ban van, az origója a bal-felső sarok alja — ezért
      // a pozíció a SAROK, nem a közép, és a skála a teljes alapterület.
      mat.compose(p, q, s);

      if (szellem) {
        const i = b.szellem.count++;
        b.szellem.setMatrixAt(i, mat);
        // Hidegebb, fakóbb változat: a szellemszint legyen felismerhető, de
        // ne versenyezzen az aktív szint telített színeivel.
        sz.setHex(t.szin).lerp(SZELLEM_SZIN, 0.45);
        b.szellem.setColorAt(i, sz);
        continue;
      }

      const i = b.test.count++;
      b.test.setMatrixAt(i, mat);
      // A típusszín itt is SZORZÓ a felület fölött, ezért egy hajszálnyival
      // világosabban adjuk be — különben a textúra bevezetése az egész
      // állomást tompította volna, és a típusszínek (a legfontosabb
      // felismerési jel) egymáshoz csúsznának.
      sz.setHex(t.szin).offsetHSL(0, 0, 0.07);
      b.test.setColorAt(i, sz);
      if (b.disz) {
        b.disz.count = b.test.count;
        b.disz.setMatrixAt(i, mat);
        sz.setHex(t.szin).offsetHSL(0, 0.04, 0.24);
        b.disz.setColorAt(i, sz);
      }
    }
    for (let i = portalN; i < MAX_PORTAL; i++) this.portalok[i].cs.visible = false;

    for (const b of this.tipusMesh.values()) {
      b.test.instanceMatrix.needsUpdate = true;
      if (b.test.instanceColor) b.test.instanceColor.needsUpdate = true;
      b.szellem.instanceMatrix.needsUpdate = true;
      if (b.szellem.instanceColor) b.szellem.instanceColor.needsUpdate = true;
      if (b.disz) {
        b.disz.instanceMatrix.needsUpdate = true;
        if (b.disz.instanceColor) b.disz.instanceColor.needsUpdate = true;
      }
    }
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
      if (ep.z > this.aktivSzint) continue;
      let szin = 0;
      if (ep.kikapcsolva) szin = 0xff5d73;
      else if (t.szemelyzet > 0 && ep.dolgozok.length === 0) szin = 0xff5d73;
      else if (t.szemelyzet > 0 && ep.dolgozok.length < t.szemelyzet) szin = 0xffc247;
      else if (ep.sor.length > 12) szin = 0xffc247;
      if (!szin) continue;
      p.set(ep.x + ep.sz * 0.5, ep.z * SZINT_MAGASSAG + (t.magas || 2) + 1.1, ep.y + ep.m * 0.5);
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
      const { o, ep, szellem } = lista[i];
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
      // A szellemszint kapuja nem világít bele az aktív emeletbe: a
      // pontfénynek nincs „ez az emelet" fogalma, tehát a fönti kapu fénye
      // a földszinti padlón jelenne meg — pont ott, ahol semmi sem áll.
      o.feny.intensity = (all2 && !szellem) ? 6 + inst * 10 : 0;
      o.orveny.material.opacity = szellem
        ? SZELLEM_ATLATSZO
        : (all2 ? 0.45 + Math.sin(ido * 2.2) * 0.08 : 0.08);

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
/** A szellemréteg felé húzott hideg alapszín (lásd `_epuleteketEpit`). */
const SZELLEM_SZIN = new THREE.Color(0x8fb4ff);
function clamp01(x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }
