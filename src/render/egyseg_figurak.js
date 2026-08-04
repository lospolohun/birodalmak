// AGE OF THE CRYSTALS — FIGURA-KATALÓGUS (v0.9/2b).
//
// Ez a modul EGY dolgot tud: megmondani, hogy egy sim-beli egységtípus MILYEN
// figurává rajzolódik, és milyen arányokkal. A `units3d.js` a motor (mátrixok,
// LOD, dirty-gyorstár), ez pedig az ADATLAP. A kettő szétvágásának oka a
// v0.9/2-ben elkövetett hiba, amit ez a fájl hivatott megismételhetetlenné
// tenni — lásd alább.
//
// ── MIÉRT SAJÁT FÁJL, ÉS MIÉRT VAN BENNE ÖNELLENŐRZÉS ─────────────────────
// A `units3d.js` régen `e.tipus[i] & 3`-mal maszkolt, mellette egy „négy fölött
// rejtsd el" feltétellel. A v0.9/2 ezt egy `FIGURA` táblára cserélte — helyesen.
// Csakhogy a tábla `-1`-et ad az ostromgépre („nem én rajzolom"), és a `-1` a
// FELÁLLÁS-útra is kifutott: `TIPUS_KEVER[-1]` → `undefined`, `undefined[0]` →
// **TypeError**, azaz a teljes render-hurok elszállt, amint a gép kiképezte az
// első faltörő kost. A determinizmus-kapu ebből semmit nem lát: a sim tökéletes
// és zöld, csak épp a képernyő fekete.
//
// Ez pontosan az a hibafajta, ami a `LATOTAV`-ot is megette (rövid tábla →
// `undefined` → néma rossz viselkedés). Ezért a fájl végén egy `_ellenoriz()`
// fut BETÖLTÉSKOR, és HANGOSAN dob, ha bármelyik tábla rövidebb, mint amennyi
// sor kell. Szándékosan dob és nem `console.warn`-ol: itt nincs futásidejű
// bemenet, tehát ha egyszer dob, akkor MINDIG dob, mindenkinél, az első
// másodpercben — nem lehet „csak néha" hiba belőle.
//
// ── A KÉT INDEX: `FIGURA` ÉS `MEGJ` ───────────────────────────────────────
//   FIGURA[simTipus] → melyik FIGURA-VÁZ (0..4, vagy -1 = nem ez a réteg).
//                      Ez dönti el, melyik fegyver-mesh és van-e pajzsa.
//   MEGJ (megjelenés) → melyik ARÁNY- ÉS SZÍN-SOR (0..12).
//
// ⚠️ A `FIGURA` TÁBLA SZÁNDÉKOSAN A `units3d.js`-BEN MARADT, nem itt. A
// `tools/kiadas_ellenorzo.mjs` 36. elvárása név szerint ott keresi (a
// `TIPUS`-indexelt táblák nyilvántartásában), és a fájlt SZÖVEGESEN olvassa —
// ha ide költözne, a kapu némán vakká válna pont arra a hibafajtára, ami miatt
// ez az egész átalakítás készült. Az ellenőrzését viszont ez a modul végzi:
// `ellenorizFigura()`, amit a `units3d.js` betöltéskor meghív.
//
// Miért kettő? Mert a bajnok (`TIPUS.EGYEDI`) NYOLC NÉPÉ, és mindegyiké másképp
// néz ki — de mind ugyanazt az alabárdos vázat használja. Ha a nyolc népnek
// nyolc figura-váza lenne, az nyolc új `InstancedMesh` és nyolc rajzhívás
// volna. Így viszont a nép csak SOR-CSERE egy táblában: a különbség kizárólag
// PÉLDÁNYONKÉNTI adat (skála, szín), amit a `reszMatrix` amúgy is kiír.
// Rajzhívásban ez NULLA, a fegyver-mesh az EGYETLEN új rajzhívás az egészben.
//
// ── AMI CIVENKÉNT VÁLTOZIK (és amit ezért a szem is meglát) ───────────────
//   • testmagasság            — a Homoki futó zömök, a Fénylovag toronymagas
//   • sisak Y-skála           — a Bástyaőré csúcsos torony, a Csapdaállítóé lapos
//   • alabárd szélesség/hossz — a Kőtörőé baltányi lap, a Sztyeppei portyáé nyurga
//   • pajzs van/nincs + alak  — a Kristálypajzsosé kerek és nagy, a Bástyaőré magas
//   • jegyszín                — a csapatszínbe kevert nép-akcentus
// Ezek egyike sem geometria: mind a példány-mátrix skálája vagy az
// `instanceColor`. A rajzhívás-szám ettől nem mozdul.

import * as THREE from 'three';
import { TIPUS, TIPUS_DB as SIM_TIPUS_DB } from '../sim/units.js';
import { CIV_DB } from '../sim/civ.js';

const FEL_PI = Math.PI * 0.5;

// ── FIGURA-VÁZAK ───────────────────────────────────────────────────────────

/** A figura-vázak nevesített indexei. A fegyver-meshek sorrendje UGYANEZ. */
export const FIG = { MUNKAS: 0, LANDZSAS: 1, IJASZ: 2, LOVAG: 3, BAJNOK: 4 };
/** Hány figura-váz van — ennyi fegyver-mesh és ennyi hosszú a `maxFegyver`. */
export const FIGURA_DB = 5;

// ── MEGJELENÉS-SOROK ───────────────────────────────────────────────────────

/** A bajnok-sorok itt kezdődnek: `MEGJ_BAJNOK` a semleges, +1+civ a népeké. */
export const MEGJ_BAJNOK = 4;
/** 4 alapfigura + 1 semleges bajnok + 8 népi bajnok. */
export const MEGJ_DB = MEGJ_BAJNOK + 1 + CIV_DB;

/**
 * `simTipus` + `civ` → megjelenés-sor. A `civ` a csapaté (`sim.egyedi.civ`),
 * `-1` (`CIV_NINCS`) esetén a semleges sor jön.
 * CSAK FELÁLLÁSKOR fut, a képkocka-hurok a kiszámolt sort olvassa.
 * @param {number} tip FIGURA-váz (0..4); a hívó már kiszűrte a `-1`-et
 * @param {number} civ `CIV.*` vagy `CIV_NINCS`
 */
export function megjelenesSor(tip, civ) {
  if (tip !== FIG.BAJNOK) return tip;
  const c = civ | 0;
  if (c < 0 || c >= CIV_DB) return MEGJ_BAJNOK;
  return MEGJ_BAJNOK + 1 + c;
}

/**
 * Típusonkénti test-árnyalat: [keverőszín, keverő súly, fényerő].
 * A csapat-szín MARAD az uralkodó jel (azt kell 1600 egységnél elsőre
 * felismerni), a típus csak árnyalja.
 */
export const TEST_KEVER = [
  [0x9a8258, 0.52, 0.94],   // MUNKAS   — durva vászon
  [0xffffff, 0.06, 1.00],   // LANDZSAS — tiszta csapat-szín
  [0x4f7a44, 0.30, 0.92],   // IJASZ    — zöldes köpeny
  [0x2a2f3a, 0.26, 1.06],   // LOVAG    — sötét, telített
];

/** Sisak-árnyalat (a MUNKAS „sisakja" barna kalap). */
export const SISAK_KEVER = [
  [0x8a6a3c, 0.80, 0.90],
  [0xb9bec8, 0.55, 1.00],
  [0x6d7a5a, 0.55, 0.96],
  [0xd2d8e4, 0.62, 1.10],
];

/** Test-méret: [magasság, szélesség] szorzó — két külön tömb (egy olvasás). */
export const MERET_Y = [1.02, 1.10, 1.06, 1.30];
export const MERET_XZ = [1.00, 1.05, 1.00, 1.18];

/**
 * Sisak-skála KÉT tengelyen, nem egy skaláron.
 * ⚠️ EZ A BAJNOK MIATT VÁLT SZÉT: a sisak egy kúp, és ha csak egyenletesen
 * skálázzuk, minden fej ugyanolyan alakú marad, csak nagyobb. Külön Y-skálával
 * UGYANABBÓL A GEOMETRIÁBÓL lesz lapos bányász-sisak és csúcsos bástyaőr-torony
 * — nulla új rajzhívásért.
 */
export const SISAK_MX = [0.92, 1.00, 0.94, 1.14];
export const SISAK_MY = [0.92, 1.00, 0.94, 1.14];

/**
 * LÉPÉSHOSSZ (világegység). A járás-fázis ebből és a megtett útból jön —
 * nagyobb figura hosszabbat lép, tehát a LOVAG nem kapálózik.
 */
export const LEPES_HOSSZ = [0.72, 0.76, 0.74, 0.98];

/**
 * ALAPTARTÁS: a kar nyugalmi szöge [bal, jobb], radiánban (negatív = előre
 * emelt). Ettől lesz felismerhető a típus MOZDULATLANUL is.
 */
export const KAR_ALAP_BAL = [-0.12, -0.62, -1.05, -0.16];
export const KAR_ALAP_JOBB = [-0.90, -0.34, -0.72, -0.28];

/** Fegyver-skála [oldalirány, hossz] — a bajnok alabárdját a nép szabja. */
export const FEGY_SXZ = [1.00, 1.00, 1.00, 1.00];
export const FEGY_SY = [1.00, 1.00, 1.00, 1.00];

/** Van-e pajzsa (1/0), és milyen skálán [szélesség, magasság]. */
export const PAJZSOS = [0, 1, 0, 0];
export const PAJZS_SX = [1.00, 1.00, 1.00, 1.00];
export const PAJZS_SY = [1.00, 1.00, 1.00, 1.00];

// ── A NYOLC NÉP BAJNOKA ────────────────────────────────────────────────────
//
// A sorrend a `CIV.*` indexe, a nevek az `egyedi.js` `EGYEDI_PROFIL`-jából
// valók. Az arányok a PROFILT követik, nem a fantáziát: aki sokat bír és
// páncélos, az zömök és pajzsos; aki olcsó és gyors ütemű, az könnyű és
// pajzstalan. Így a képernyőn látott alak ELŐRE JELZI, mivel van dolgunk —
// ez egy RTS-ben nem díszítés, hanem játékinformáció.

/** [jegyszín, testmagasság, sisak Y, alabárd szélesség, alabárd hossz,
 *   pajzs, pajzs szélesség, pajzs magasság] */
const CIV_JEGY = [
  // 0 KRISTÁLYKOVÁCSOK · Kristálypajzsos — 4 páncél: a legvastagabb pajzs.
  { jegy: 0x86dcf5, mag: 1.00, sisakY: 1.02, fSxz: 1.02, fSy: 0.94, pajzs: 1, pSx: 1.24, pSy: 1.16 },
  // 1 PUSZTAI LOVASOK · Sztyeppei portya — gyors ütem, nyurga nyél, nincs pajzs.
  { jegy: 0xb07a3a, mag: 1.03, sisakY: 0.80, fSxz: 0.80, fSy: 1.20, pajzs: 0, pSx: 1.00, pSy: 1.00 },
  // 2 ERDEI VADÁSZOK · Csapdaállító — 50 HP, papírvékony: apró és lapos sisakú.
  { jegy: 0x54903a, mag: 0.93, sisakY: 0.72, fSxz: 0.76, fSy: 0.92, pajzs: 0, pSx: 1.00, pSy: 1.00 },
  // 3 HEGYI BÁNYÁSZOK · Kőtörő — OSTROM-csapás: baltányi lap, rövid nyél.
  { jegy: 0x7d7468, mag: 1.02, sisakY: 0.88, fSxz: 1.42, fSy: 0.86, pajzs: 0, pSx: 1.00, pSy: 1.00 },
  // 4 FOLYAMI KERESKEDŐK · Zsoldos — átlagos mindenben, kis kerek pajzzsal.
  { jegy: 0x27b0a2, mag: 0.99, sisakY: 0.96, fSxz: 0.94, fSy: 1.00, pajzs: 1, pSx: 0.90, pSy: 0.88 },
  // 5 BÁSTYAŐRZŐK · Bástyaőr — 130 HP, falnak való: torony-sisak, torony-pajzs.
  { jegy: 0xc2cede, mag: 1.06, sisakY: 1.34, fSxz: 0.88, fSy: 0.94, pajzs: 1, pSx: 1.02, pSy: 1.38 },
  // 6 FÉNYHOZÓK · Fénylovag — a legdrágább: magas, aranyszínű, teljes felszerelés.
  { jegy: 0xffd257, mag: 1.09, sisakY: 1.24, fSxz: 1.08, fSy: 1.08, pajzs: 1, pSx: 1.06, pSy: 1.06 },
  // 7 SIVATAGI PORTYÁZÓK · Homoki futó — 45 HP, olcsó és sok: könnyű, csupasz.
  { jegy: 0xe6c88a, mag: 0.91, sisakY: 0.70, fSxz: 0.84, fSy: 0.88, pajzs: 0, pSx: 1.00, pSy: 1.00 },
];

/**
 * A SEMLEGES BAJNOK — `CIV_NINCS` mellett ez a sor tölt.
 * A gyakorlatban nem képezhető (`Egyedi.van()` hamis), de a tábla akkor sem
 * lehet hiányos: az `egyedi.js` ugyanezért tart SEMLEGES adatsort.
 */
const SEMLEGES_JEGY =
  { jegy: 0xcfd6e0, mag: 1.00, sisakY: 1.00, fSxz: 1.00, fSy: 1.00, pajzs: 1, pSx: 1.00, pSy: 1.00 };

/** A bajnok-váz ALAPARÁNYAI — a `CIV_JEGY` ezekre szorzódik rá. */
const BAJNOK_ALAP = {
  meretY: 1.19, meretXZ: 1.12,
  sisakX: 1.06, sisakY: 1.30,
  lepes: 0.86,
  karBal: -0.52, karJobb: -0.46,
  jegySuly: 0.40, testFeny: 1.03,
  sisakSuly: 0.62, sisakFeny: 1.10,
};

// A bajnok-sorok GENERÁLÁSA. Kézzel kilencszer kilenc számot leírni pontosan az
// a fajta másolás, amiből a rövid tábla születik; itt a hossz definíció szerint
// jó, és a `_ellenoriz()` ezt le is méri.
for (let k = 0; k <= CIV_DB; k++) {
  const j = k === 0 ? SEMLEGES_JEGY : CIV_JEGY[k - 1];
  TEST_KEVER.push([j.jegy, BAJNOK_ALAP.jegySuly, BAJNOK_ALAP.testFeny]);
  SISAK_KEVER.push([j.jegy, BAJNOK_ALAP.sisakSuly, BAJNOK_ALAP.sisakFeny]);
  MERET_Y.push(BAJNOK_ALAP.meretY * j.mag);
  MERET_XZ.push(BAJNOK_ALAP.meretXZ * (0.5 + 0.5 * j.mag));
  SISAK_MX.push(BAJNOK_ALAP.sisakX);
  SISAK_MY.push(BAJNOK_ALAP.sisakY * j.sisakY);
  LEPES_HOSSZ.push(BAJNOK_ALAP.lepes * j.mag);
  KAR_ALAP_BAL.push(BAJNOK_ALAP.karBal);
  KAR_ALAP_JOBB.push(BAJNOK_ALAP.karJobb);
  FEGY_SXZ.push(j.fSxz);
  FEGY_SY.push(j.fSy);
  PAJZSOS.push(j.pajzs);
  PAJZS_SX.push(j.pSx);
  PAJZS_SY.push(j.pSy);
}

// ── GEOMETRIA-SEGÉDEK (a `units3d.js` is ezeket használja) ─────────────────

const _szinSeged = new THREE.Color();

/** A kéz helye a vállízülethez képest — ide kerül a fegyver markolata. */
export const MARKOLAT_Y = -0.30, MARKOLAT_Z = 0.035;

/** A markolatot a KÉZBE tolja (a vállízület az origó, a kar lefelé lóg). */
export function kezbe(g) {
  g.translate(0, MARKOLAT_Y, MARKOLAT_Z);
  return g;
}

/**
 * Több apró geometria EGYBE olvasztása, részenként BESÜTÖTT vertex-színnel.
 * Így egy alkatrész (nyél + penge + él) EGYETLEN InstancedMesh marad, mégis
 * háromszínű — nem függünk a BufferGeometryUtils-tól.
 *   { g, c: hex }     — abszolút szín
 *   { g, k: [r,g,b] } — NYERS szorzó (ahol az instanceColor-t moduláljuk)
 * @param {Array<{g:THREE.BufferGeometry, c?:number, k?:number[]}>} reszek
 */
export function osszevon(reszek) {
  const forras = [];
  for (let i = 0; i < reszek.length; i++) {
    const p = reszek[i];
    if (!p || !p.g || !p.g.attributes || !p.g.attributes.position) continue;
    const nyers = p.g.index ? p.g.toNonIndexed() : p.g;
    if (!nyers.attributes.normal) nyers.computeVertexNormals();
    forras.push({ g: nyers, c: p.c, k: p.k, sajat: nyers !== p.g, eredeti: p.g });
  }
  if (!forras.length) return new THREE.BufferGeometry();

  let ossz = 0;
  for (let i = 0; i < forras.length; i++) ossz += forras[i].g.attributes.position.count;

  const P = new Float32Array(ossz * 3);
  const N = new Float32Array(ossz * 3);
  const C = new Float32Array(ossz * 3);
  let o = 0;
  for (let i = 0; i < forras.length; i++) {
    const g = forras[i].g;
    const db = g.attributes.position.count;
    P.set(g.attributes.position.array.subarray(0, db * 3), o * 3);
    N.set(g.attributes.normal.array.subarray(0, db * 3), o * 3);
    let r = 1, zo = 1, b = 1;
    if (forras[i].k) { r = forras[i].k[0]; zo = forras[i].k[1]; b = forras[i].k[2]; }
    else {
      _szinSeged.setHex(forras[i].c === undefined ? 0xffffff : forras[i].c);
      r = _szinSeged.r; zo = _szinSeged.g; b = _szinSeged.b;
    }
    for (let k = 0; k < db; k++) {
      C[(o + k) * 3] = r; C[(o + k) * 3 + 1] = zo; C[(o + k) * 3 + 2] = b;
    }
    o += db;
  }

  const ki = new THREE.BufferGeometry();
  ki.setAttribute('position', new THREE.BufferAttribute(P, 3));
  ki.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  ki.setAttribute('color', new THREE.BufferAttribute(C, 3));
  ki.computeBoundingSphere();

  for (let i = 0; i < forras.length; i++) {
    forras[i].g.dispose();
    if (forras[i].sajat && forras[i].eredeti.dispose) forras[i].eredeti.dispose();
  }
  return ki;
}

/**
 * ALABÁRD — a bajnok fegyvere. ~36 háromszög.
 *
 * ── MIÉRT ÉPP ALABÁRD ─────────────────────────────────────────────────────
 * A követelmény az volt, hogy a képernyőn RÁ LEHESSEN ISMERNI: „ez nem a sima
 * lándzsás". Egy RTS-kamera messziről néz és felülről; ilyenkor a SZILUETT az
 * egyetlen jel, a részlet elveszik. A lándzsa sziluettje egy függőleges vonal —
 * bármi, ami szintén csak függőleges (hosszabb lándzsa, vastagabb lándzsa),
 * ugyanaz a folt marad. Az alabárd viszont OLDALRA is kilóg: a nyél melletti
 * lap és a vele szemközti tüske egy T-alakot ad, ami 8-10 képpont magasan is
 * elválik a lándzsától.
 *
 * Az oldalirányú kilógás a figura ±X tengelyén van (nem ±Z-n), mert a
 * hadrendbe állt sereget jellemzően SZEMBŐL vagy hátulról látjuk — oldalt
 * kilógva a lap akkor is látszik, amikor a figura felénk fordul.
 *
 * A `FEGY_SXZ`/`FEGY_SY` skála ezt a két méretet feszíti civenként: a Kőtörő
 * lapja 1,42-szeres (bárd), a Sztyeppei portyáé 0,80 × 1,20 (nyurga szálfegyver).
 */
export function epitAlabard() {
  // NYÉL — hosszabb és vaskosabb a lándzsáénál, hogy a fej súlya elhihető legyen.
  const nyel = new THREE.CylinderGeometry(0.022, 0.019, 1.10, 4, 1, true);
  nyel.translate(0, 0.29, 0);
  // FEJSZE-LAP — a nyél JOBB oldalán, enyhén megdöntve.
  const lap = new THREE.BoxGeometry(0.215, 0.185, 0.022);
  lap.rotateZ(-0.14);
  lap.translate(0.122, 0.735, 0);
  // HÁTSÓ TÜSKE — a lap ellensúlya. Ez teszi a sziluettet T-alakúvá.
  const tuske = new THREE.ConeGeometry(0.032, 0.155, 4);
  tuske.rotateZ(FEL_PI);            // a hegy -X felé áll
  tuske.translate(-0.098, 0.715, 0);
  // FELSŐ HEGY — hogy szúrni is lehessen vele, és a nyél ne csonkán végződjön.
  const hegy = new THREE.ConeGeometry(0.030, 0.185, 4);
  hegy.translate(0, 0.925, 0);
  const g = osszevon([
    { g: nyel, c: 0x5c4630 },
    { g: lap, k: [1.34, 1.36, 1.42] },
    { g: tuske, k: [1.26, 1.28, 1.34] },
    { g: hegy, k: [1.30, 1.32, 1.38] },
  ]);
  g.rotateX(0.07);
  return kezbe(g);
}

// ── ÖNELLENŐRZÉS (BETÖLTÉSKOR) ─────────────────────────────────────────────

/**
 * Minden `MEGJ`-gyel indexelt tábla pontosan `MEGJ_DB` hosszú-e, és a `FIGURA`
 * lefedi-e a sim MINDEN típusát.
 *
 * ⚠️ A HIÁNYZÓ SOR NEM HIBÁT OKOZ, HANEM NÉMA ROSSZ VISELKEDÉST. A `LATOTAV`
 * ugyanígy maradt rövid: `LATOTAV[TIPUS.EGYEDI]` `undefined` lett, a
 * `d <= undefined` mindig hamis, és az egyedi egység két verzión át vak volt —
 * végig zöld determinizmus-kapu mellett. Egy tábla-hossz ellenőrzés két sor,
 * és pontosan ezt a hibafajtát zárja ki.
 */
function _ellenoriz() {
  const bajok = [];
  const tablak = {
    TEST_KEVER, SISAK_KEVER, MERET_Y, MERET_XZ, SISAK_MX, SISAK_MY,
    LEPES_HOSSZ, KAR_ALAP_BAL, KAR_ALAP_JOBB, FEGY_SXZ, FEGY_SY,
    PAJZSOS, PAJZS_SX, PAJZS_SY,
  };
  for (const nev in tablak) {
    const t = tablak[nev];
    if (t.length !== MEGJ_DB) {
      bajok.push(nev + ' hossza ' + t.length + ', kell ' + MEGJ_DB);
    }
    for (let i = 0; i < t.length; i++) {
      if (t[i] === undefined || t[i] === null) bajok.push(nev + '[' + i + '] üres');
    }
  }
  if (bajok.length) {
    throw new Error('[egyseg_figurak] hiányos figura-katalógus:\n  ' + bajok.join('\n  '));
  }
}
_ellenoriz();

/**
 * A `units3d.js` `FIGURA` táblájának ellenőrzése — a hívó adja át, mert a
 * tábla ott lakik (lásd a fejléc ⚠️ szakaszát a kiadás-ellenőrzőről).
 *
 * Amit néz: minden sim-típusnak VAN sora, minden sor vagy `-1`, vagy érvényes
 * figura-váz, és az `EGYEDI` tényleg a bajnokra megy (nem maradt a lándzsáson,
 * ahogy a v0.9/2-ben).
 * @param {number[]} figura a `units3d.js` `FIGURA` táblája
 */
export function ellenorizFigura(figura) {
  const bajok = [];
  if (!figura || figura.length !== SIM_TIPUS_DB) {
    bajok.push('FIGURA hossza ' + (figura ? figura.length : 'nincs')
      + ', a sim TIPUS_DB-je ' + SIM_TIPUS_DB
      + ' — van olyan sim-típus, aminek nincs figura-sora');
  }
  if (figura) {
    for (let t = 0; t < figura.length; t++) {
      const f = figura[t];
      if (f !== -1 && !(f >= 0 && f < FIGURA_DB)) {
        bajok.push('FIGURA[' + t + '] = ' + f + ' — nem érvényes figura-váz');
      }
    }
    if (figura[TIPUS.EGYEDI] !== FIG.BAJNOK) {
      bajok.push('FIGURA[TIPUS.EGYEDI] nem a bajnok-vázra megy');
    }
  }
  if (bajok.length) {
    throw new Error('[egyseg_figurak] hibás FIGURA tábla:\n  ' + bajok.join('\n  '));
  }
  return true;
}
