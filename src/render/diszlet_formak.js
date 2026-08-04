// AGE OF THE CRYSTALS — DÍSZLET-FORMÁK: fák, bokrok, sziklák, kristály.
//
// Ez a fájl NEM réteg: nincs `frissit()`-je és nem olvas simet. Két dolgot ad a
// `props3d.js`-nek — kész `BufferGeometry`-ket és a hozzájuk tartozó (nagyon
// kevés) ANYAGOT —, és vállalja, hogy az egész díszlet EGY shaderből él.
//
// ── MIÉRT KÜLÖN FÁJL ──────────────────────────────────────────────────────
// Ugyanaz az ok, ami az `epulet_formak.js`-t leválasztotta a `gazdasag3d.js`-ről:
// a forma HOSSZÚ, STATIKUS ADAT, a réteg viszont forró ciklus. Amíg a díszlet
// egyetlen kúp-fából állt, a kettő elfért egy fájlban. A v0.16-ban hét
// tájelem-forma és négy nyersanyag-öltöztetés van — az már elnyomná a LOD-ot.
//
// ── EGY ANYAG AZ EGÉSZ TÁJRA (ez a fájl legfontosabb döntése) ─────────────
// Fenyő, lombos fa, bokor, szikla, kidőlt rönk, tuskó, a távoli impostor és a
// nyersanyag-öltöztetés MIND ugyanazt az `anyagTaj` Lambert-anyagot használja.
// A különbséget két CSÚCS-attribútum hordozza:
//
//   alapSzin  (vec3)  — a darab saját anyaga (kéreg, kő, fa), vagy lomb esetén
//                       egy szürke SZORZÓ (fény/AO), amit az évszak színez
//   lombArany (float) — 0 = fa/kő · 0,5 = ÖRÖKZÖLD lomb · 1 = LOMBHULLATÓ lomb
//
// Ebből következik minden, amit a réteg tud:
//   • az évszak EGY uniform-négyes (két lomb-szín + két tű-szín), tehát az őszi
//     erdő NEM új anyag, nem új geometria és nem is új rajzhívás — a fenyő
//     zölden marad, a lombos fa vörösre vált, ahogy a valóságban;
//   • a HÓ a felfelé néző lapokra ül (`normal.y`), tehát a téli táj magától
//     havas lesz, a sziklák tetejétől a kidőlt rönk oldaláig;
//   • a példányonkénti színszórás a példány VILÁGPOZÍCIÓJÁBÓL hasholódik, tehát
//     nincs se extra attribútum-puffer, se példány-szín — ugyanaz a trükk, amit
//     a réteg a v0.1 óta használ.
//
// Egy anyag = egy shader-program az egész tájra: a rajzhívások közt nincs
// program-váltás, csak geometria-kötés. Ez a legolcsóbb mód arra, hogy a
// képernyőn hétféle tereptárgy legyen.
//
// ⚠️ Az `anyagTaj` MINDIG `InstancedMesh`-en fut (a `instanceMatrix`-ból hashel).
// Nem-példányosított meshre kötve `#ifdef USE_INSTANCING` miatt nem tör el, de a
// szórás eltűnik — a réteg ezért sosem használja sima `Mesh`-en.
//
// ── MIÉRT INDEXELETLEN, LAPOS ÁRNYALÁSÚ GEOMETRIA ─────────────────────────
// Ugyanaz, mint az épületeknél: a `computeVertexNormals()` indexeletlen
// geometrián LAPONKÉNTI normálist ad, ez adja a makett-stílust, `flatShading`
// nélkül (az képpontonkénti derivált lenne — ez ingyen van).

import { THREE } from './core3d.js';

/** A `lombArany` attribútum három értelmes értéke. */
export const LOMB = { NINCS: 0, OROKZOLD: 0.5, HULLATO: 1 };

/**
 * Anyag-paletta (sRGB). KÖZÉPTÓNUSÚ, mert a nap 2,15-ös intenzitása + az ACES
 * tone mapping a világos pasztellt kifehérítené — ugyanaz a tanulság, ami az
 * `epulet_formak.js` palettáján is oda van írva.
 */
const SZIN = {
  TORZS: 0x6b4a30,
  TORZS_FIATAL: 0x7c5c3a,
  KERE_SOTET: 0x4f3a28,
  RONK: 0x7a5a3c,
  RONK_VEG: 0xa98a5e,     // a fűrészelt/tört véglap világosabb
  KO: 0x8d8880,
  KO_VILAGOS: 0xa8a49c,
  KO_SOTET: 0x625d57,
  KRISTALY_TALP: 0x3d4a5c,
  /** Lomb: SZÜRKE szorzó, a valódi színt az évszak-uniform adja. */
  LOMB_FENY: 0xffffff,
  LOMB_KOZEP: 0xd8ddd2,
  LOMB_ARNY: 0xa8b0a2,
  /** A nyersanyag-erdő SÖTÉTEBB és egyöntetűbb — ettől olvasható „ligetnek". */
  LOMB_LIGET: 0x8f9c88,
  /** Bogyó az ÉTEL-lelőhelyen. Telített, meleg piros — a zöldtől a legtávolabb. */
  BOGYO: 0xc42b3c,
};

// ── ÉVSZAK-PALETTA ─────────────────────────────────────────────────────────
// Négy sor: tavasz · nyár · ősz · tél. A `evszakSzinek()` FOLYTONOSAN interpolál
// köztük, tehát a világítás-sáv egy lassan növő számot is beadhat (2,3 = kora
// ősz), nem csak egészet.
//
// A lombhullató és az örökzöld KÜLÖN sáv: ősszel csak az előbbi vált színt,
// télen az előbbi kopár barna. Ez az a részlet, amitől az évszak nem szűrőnek
// látszik, hanem évszaknak.

const LOMB_PALETTA = [
  [0x4a7a2b, 0xa8c95c],   // tavasz — friss, sárgás zöld
  [0x3d6b2a, 0x8bb256],   // nyár   — a v0.1 óta ez volt az egyetlen lombszín
  [0x8a4718, 0xd6a02f],   // ősz    — vörös-narancs → arany
  [0x5a4633, 0x8f7550],   // tél    — kopár ág, a havat a `uHo` teszi rá
];
const TU_PALETTA = [
  [0x2f5f34, 0x6f9a48],
  [0x2c5730, 0x639044],
  [0x2a4f2c, 0x5a8340],
  [0x27462c, 0x4c7038],
];
/** Mennyi hó ül a felfelé néző lapokra az adott évszakban. */
const HO_PALETTA = [0.05, 0, 0.02, 0.85];
const HO_SZIN = 0xeef3f7;

// ── UNIFORMOK ──────────────────────────────────────────────────────────────

/**
 * A díszlet KÖZÖS uniform-készlete. Egy objektum, minden anyag ugyanezt kapja —
 * így egy `evszak = 2.5` beállítás egyszerre hat a fára, a bokorra és a sziklára,
 * és nulla képkocka-költséggel (a setter csak akkor számol, ha VÁLTOZOTT).
 */
export function ujDiszletUniformok() {
  return {
    uIdo: { value: 0 },
    uLombA: { value: new THREE.Color() },
    uLombB: { value: new THREE.Color() },
    uTuA: { value: new THREE.Color() },
    uTuB: { value: new THREE.Color() },
    uHo: { value: 0 },
    uHoSzin: { value: new THREE.Color().setHex(HO_SZIN, THREE.SRGBColorSpace) },
    /** 0 = nappal, 1 = éjszaka. A kristály ilyenkor ERŐSEBBEN izzik. */
    uEj: { value: 0 },
  };
}

/**
 * Évszak → uniformok. `t` FOLYTONOS: 0 tavasz, 1 nyár, 2 ősz, 3 tél, és körbeér.
 * @param {number} t
 * @param {ReturnType<typeof ujDiszletUniformok>} u
 */
export function evszakSzinek(t, u) {
  const n = LOMB_PALETTA.length;
  let x = t % n; if (x < 0) x += n;
  const a = x | 0, b = (a + 1) % n, k = x - a;
  keverSzin(u.uLombA.value, LOMB_PALETTA[a][0], LOMB_PALETTA[b][0], k);
  keverSzin(u.uLombB.value, LOMB_PALETTA[a][1], LOMB_PALETTA[b][1], k);
  keverSzin(u.uTuA.value, TU_PALETTA[a][0], TU_PALETTA[b][0], k);
  keverSzin(u.uTuB.value, TU_PALETTA[a][1], TU_PALETTA[b][1], k);
  u.uHo.value = HO_PALETTA[a] + (HO_PALETTA[b] - HO_PALETTA[a]) * k;
}

const _szinA = new THREE.Color(), _szinB = new THREE.Color();
function keverSzin(ki, hexA, hexB, k) {
  _szinA.setHex(hexA, THREE.SRGBColorSpace);
  _szinB.setHex(hexB, THREE.SRGBColorSpace);
  ki.copy(_szinA).lerp(_szinB, k);
}

// ── ANYAGOK ────────────────────────────────────────────────────────────────

/** Egész-hash a GPU-n: példányonként állandó, szomszédok közt független [0,1). */
const HASH_GLSL = `
float zajHash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}`;

/**
 * Az EGYETLEN táj-anyag. Lásd a fejléc „egy anyag az egész tájra" szakaszát.
 * @param {ReturnType<typeof ujDiszletUniformok>} u
 */
export function anyagTaj(u) {
  const anyag = new THREE.MeshLambertMaterial({ color: 0xffffff, fog: true });
  anyag.onBeforeCompile = (sh) => {
    sh.uniforms.uLombA = u.uLombA;
    sh.uniforms.uLombB = u.uLombB;
    sh.uniforms.uTuA = u.uTuA;
    sh.uniforms.uTuB = u.uTuB;
    sh.uniforms.uHo = u.uHo;
    sh.uniforms.uHoSzin = u.uHoSzin;
    sh.vertexShader = `
      attribute vec3 alapSzin;
      attribute float lombArany;
      varying vec3 vAlap;
      varying float vLomb;
      varying float vFel;
      varying float vSzoras;
    ` + HASH_GLSL + '\n' + sh.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       vAlap = alapSzin;
       vLomb = lombArany;
       #ifdef USE_INSTANCING
         vFel = normalize(mat3(instanceMatrix) * objectNormal).y;
         vSzoras = zajHash(vec2(instanceMatrix[3][0], instanceMatrix[3][2]));
       #else
         vFel = objectNormal.y;
         vSzoras = 0.5;
       #endif`,
    );
    sh.fragmentShader = `
      uniform vec3 uLombA;
      uniform vec3 uLombB;
      uniform vec3 uTuA;
      uniform vec3 uTuB;
      uniform vec3 uHoSzin;
      uniform float uHo;
      varying vec3 vAlap;
      varying float vLomb;
      varying float vFel;
      varying float vSzoras;
    ` + sh.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
       // lomb: az évszak-szín ÉS a példány-szórás szorozza a szürke alapot;
       // fa/kő: csak egy halk fényerő-szórás, hogy ne legyen két egyforma szikla
       vec3 lombSzin = mix(uLombA, uLombB, vSzoras);
       vec3 tuSzin = mix(uTuA, uTuB, vSzoras);
       float hullato = step(0.75, vLomb);
       float lomb = step(0.25, vLomb);
       vec3 novenySzin = vAlap * mix(tuSzin, lombSzin, hullato);
       vec3 anyagSzin = vAlap * (0.86 + 0.28 * vSzoras);
       diffuseColor.rgb *= mix(anyagSzin, novenySzin, lomb);
       // HÓ: a felfelé néző lapokra ül. A lombon kevesebb marad meg, mint a kövön.
       float ho = uHo * smoothstep(0.28, 0.78, vFel) * mix(1.0, 0.55, lomb);
       diffuseColor.rgb = mix(diffuseColor.rgb, uHoSzin, ho);`,
    );
  };
  return anyag;
}

/**
 * A kristály-tüske anyaga: tömör, izzó. A lüktetés fázisa a példány
 * pozíciójából jön (nem attribútumból), így a szomszédos tüskék nem villognak
 * együtt — az lenne a legrosszabb: karácsonyfa-hatás.
 */
export function anyagKristaly(u) {
  const anyag = new THREE.MeshLambertMaterial({
    color: 0x1c5f7c, emissive: 0x4fe3ff, emissiveIntensity: 1.0, vertexColors: true,
  });
  anyag.onBeforeCompile = (sh) => {
    sh.uniforms.uIdo = u.uIdo;
    sh.uniforms.uEj = u.uEj;
    sh.vertexShader = 'uniform float uIdo;\nvarying float vPulzus;\n' + HASH_GLSL + '\n'
      + sh.vertexShader.replace('#include <begin_vertex>',
        `#include <begin_vertex>
         float faz = zajHash(vec2(instanceMatrix[3][0], instanceMatrix[3][2])) * 6.2831853;
         vPulzus = 0.58 + 0.42 * sin(uIdo * 1.70 + faz);`);
    sh.fragmentShader = 'uniform float uEj;\nvarying float vPulzus;\n' + sh.fragmentShader
      .replace('#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= vPulzus * (1.0 + 1.2 * uEj);');
  };
  return anyag;
}

/**
 * A LEBEGŐ szilánkok anyaga. A keringést és a bólogatást a VERTEX SHADER
 * végzi, a példány saját origója körül — így a CPU képkockánként NULLA mátrixot
 * ír, mégis mozog a kép. Ez az egyetlen animált díszlet-elem; pont ezért kapja
 * a névadó nyersanyag.
 */
export function anyagSzilank(u) {
  const anyag = new THREE.MeshLambertMaterial({
    color: 0x2a7fa0, emissive: 0x6ceaff, emissiveIntensity: 1.0, vertexColors: true,
  });
  anyag.onBeforeCompile = (sh) => {
    sh.uniforms.uIdo = u.uIdo;
    sh.uniforms.uEj = u.uEj;
    sh.vertexShader = 'uniform float uIdo;\nvarying float vPulzus;\n' + HASH_GLSL + '\n'
      + sh.vertexShader.replace('#include <begin_vertex>',
        `#include <begin_vertex>
         float faz = zajHash(vec2(instanceMatrix[3][0], instanceMatrix[3][2])) * 6.2831853;
         vPulzus = 0.55 + 0.45 * sin(uIdo * 1.15 + faz);
         float sz = uIdo * 0.55 + faz;
         float cs = cos(sz), sn = sin(sz);
         transformed.xz = mat2(cs, -sn, sn, cs) * transformed.xz;
         transformed.y += sin(uIdo * 0.9 + faz) * 0.22;`);
    sh.fragmentShader = 'uniform float uEj;\nvarying float vPulzus;\n' + sh.fragmentShader
      .replace('#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= vPulzus * (1.0 + 1.4 * uEj);');
  };
  return anyag;
}

/**
 * Additív burok / talajfolt. Nincs mélységírás: nem takarja sem a saját
 * tüskéjét, sem a mögötte elhaladó egységeket, csak HOZZÁAD.
 *
 * MIÉRT NEM PONTFÉNY: egy pontfény MINDEN anyag fragment-shaderébe beépül,
 * tehát a képernyő minden képpontján fizetnénk érte — száz lelőhelynél ez nem
 * opció. A „megvilágít" érzetet ez a két additív réteg kelti, fix költséggel.
 */
export function anyagIzzas(u, szin, sebesseg) {
  const anyag = new THREE.MeshBasicMaterial({
    color: szin,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    vertexColors: true,
    fog: true,
  });
  anyag.onBeforeCompile = (sh) => {
    sh.uniforms.uIdo = u.uIdo;
    sh.uniforms.uEj = u.uEj;
    sh.vertexShader = 'uniform float uIdo;\nvarying float vPulzus;\n' + HASH_GLSL + '\n'
      + sh.vertexShader.replace('#include <begin_vertex>',
        `#include <begin_vertex>
         float faz = zajHash(vec2(instanceMatrix[3][0], instanceMatrix[3][2])) * 6.2831853;
         vPulzus = 0.58 + 0.42 * sin(uIdo * ${sebesseg.toFixed(2)} + faz);`);
    sh.fragmentShader = 'uniform float uEj;\nvarying float vPulzus;\n' + sh.fragmentShader
      .replace('#include <color_fragment>',
        '#include <color_fragment>\n\tdiffuseColor.a *= vPulzus * (1.0 + 0.55 * uEj);');
  };
  return anyag;
}

// ── FORMA-ÉPÍTŐ ────────────────────────────────────────────────────────────

/**
 * Egy tájelem alkatrészeinek gyűjtője. A darabok VILÁG-MÉRETBEN épülnek, az
 * origó a talajon van (+y felfelé) — így a példány-mátrix tiszta eltolás +
 * Y-forgatás + egyenletes skálázás marad, és semmi nem torzul el.
 *
 * A `y` paraméter mindenhol a darab TALPA, nem a közepe: így a méretek
 * egymásra rakhatók anélkül, hogy fejben feleznénk.
 */
class Forma {
  constructor() { this.reszek = []; }

  elem(geo, szin, lomb = LOMB.NINCS) {
    this.reszek.push({ geo, szin, lomb });
    return this;
  }

  /** Henger / csonkakúp álló tengellyel. `zart=false` → nincs fedőlap. */
  henger(rAlso, rFelso, mag, oldal, x, y, z, szin, lomb = LOMB.NINCS, zart = false) {
    const g = new THREE.CylinderGeometry(rFelso, rAlso, mag, oldal, 1, !zart);
    g.translate(x, y + mag * 0.5, z);
    return this.elem(g, szin, lomb);
  }

  /** Kúp. Nyitott aljjal, mert az alját mindig takarja valami (föld vagy lomb). */
  kup(r, mag, oldal, x, y, z, szin, lomb = LOMB.NINCS, nyitott = true) {
    const g = new THREE.ConeGeometry(r, mag, oldal, 1, nyitott);
    g.translate(x, y + mag * 0.5, z);
    return this.elem(g, szin, lomb);
  }

  /**
   * Gyűrt gömb — ez a lombkorona és a szikla közös alapja. Ikozaéder (20 lap),
   * a csúcsai determinisztikusan behorpasztva. A horpasztás a csúcs EREDETI,
   * kerekített pozíciójából hashel, tehát a közös sarkok EGYÜTT mozdulnak — ha
   * csúcsonként külön hashelnénk, a lapok szétszakadnának.
   */
  /**
   * Bogyó — négy háromszög. Ez a legolcsóbb elem a fájlban, és mégis ez dönti
   * el, hogy az ÉTEL-lelőhely felismerhető-e: egy zöld bokor és egy BOGYÓS
   * bokor között a szem a PIROS FOLTOT keresi, nem a formát.
   */
  bogyo(r, x, y, z, szin) {
    const g = new THREE.TetrahedronGeometry(r, 0);
    g.translate(x, y, z);
    return this.elem(g, szin, LOMB.NINCS);
  }

  gyurt(r, x, y, z, szin, lomb, mag, ero = 0.22, sx = 1, sy = 1, sz = 1) {
    const g = new THREE.IcosahedronGeometry(r, 0);
    gyurdd(g, ero, mag);
    g.scale(sx, sy, sz);
    g.translate(x, y, z);
    return this.elem(g, szin, lomb);
  }
}

/** Ikozaéder-csúcsok determinisztikus behorpasztása (lásd `Forma.gyurt`). */
function gyurdd(geo, ero, mag) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const kx = Math.round(x * 512), ky = Math.round(y * 512), kz = Math.round(z * 512);
    const kulcs = (Math.imul(kx, 73856093) ^ Math.imul(ky, 19349663) ^ Math.imul(kz, 83492791)) | 0;
    const h = keverd(kulcs, mag);
    const k = 1 + ((h & 1023) / 1023 - 0.5) * 2 * ero;
    p.setXYZ(i, x * k, y * k, z * k);
  }
  p.needsUpdate = true;
}

const _szinSegito = new THREE.Color();

/**
 * Az alkatrészek EGY indexeletlen geometriává olvasztása, csúcs-attribútumokkal.
 * Indexeletlen, mert a `computeVertexNormals()` így LAPONKÉNTI normálist ad —
 * pont azt a makett-árnyalást, ami a projekt stílusa.
 */
function osszefuz(reszek) {
  let n = 0;
  for (const r of reszek) {
    if (r.geo.index) r.geo = r.geo.toNonIndexed();
    n += r.geo.attributes.position.count;
  }
  const poz = new Float32Array(n * 3);
  const alap = new Float32Array(n * 3);
  const lomb = new Float32Array(n);
  let v = 0;
  for (const r of reszek) {
    const p = r.geo.attributes.position.array;
    const db = r.geo.attributes.position.count;
    poz.set(p, v * 3);
    _szinSegito.setHex(r.szin, THREE.SRGBColorSpace);
    for (let i = 0; i < db; i++) {
      alap[(v + i) * 3] = _szinSegito.r;
      alap[(v + i) * 3 + 1] = _szinSegito.g;
      alap[(v + i) * 3 + 2] = _szinSegito.b;
      lomb[v + i] = r.lomb;
    }
    v += db;
    r.geo.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(poz, 3));
  geo.setAttribute('alapSzin', new THREE.BufferAttribute(alap, 3));
  geo.setAttribute('lombArany', new THREE.BufferAttribute(lomb, 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * NÉGYKOMPONENSŰ csúcsszín rátétele (az additív burokhoz és a talajfolthoz).
 * A negyedik komponens miatt a Three `USE_COLOR_ALPHA`-t fordít, tehát a csúcs
 * ÁTLÁTSZÓSÁGA is interpolálódik — ettől halványul el a burok pereme, textúra
 * és külön shader nélkül.
 */
function alfaSzin(geo, alfaFv, r, g, b) {
  const p = geo.attributes.position;
  const arr = new Float32Array(p.count * 4);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    arr[i * 4] = r; arr[i * 4 + 1] = g; arr[i * 4 + 2] = b;
    arr[i * 4 + 3] = alfaFv(x, y, z);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 4));
}

// ── A FORMÁK ───────────────────────────────────────────────────────────────
//
// Az arányok a JÁTÉKKAMERÁHOZ vannak igazítva, nem a szép közeliképhez: az RTS-
// kamera meredeken néz le, egy fa 20-40 képpont magas. Ezért a felismerhetőség
// a SZILUETTEN és a SZÍNEN múlik, nem a részleteken — a fenyő keskeny és
// csúcsos, a lombos fa széles és gömbölyű, a bokor lapos folt.

const FORMAK = {
  /** FENYŐ — keskeny, három emelet, örökzöld. A pálya alap-fája. */
  FENYO() {
    const e = new Forma();
    e.henger(0.105, 0.075, 1.05, 5, 0, 0, 0, SZIN.TORZS);
    e.kup(0.92, 1.55, 6, 0, 0.55, 0, SZIN.LOMB_ARNY, LOMB.OROKZOLD);
    e.kup(0.72, 1.35, 6, 0, 1.40, 0, SZIN.LOMB_KOZEP, LOMB.OROKZOLD);
    e.kup(0.48, 1.15, 6, 0, 2.15, 0, SZIN.LOMB_FENY, LOMB.OROKZOLD);
    return e;
  },

  /** LOMBOS FA — széles, gömbölyű korona. ŐSSZEL EZ VÁLT SZÍNT. */
  LOMBFA() {
    const e = new Forma();
    e.henger(0.14, 0.10, 1.35, 5, 0, 0, 0, SZIN.TORZS);
    e.gyurt(0.78, 0, 1.95, 0, SZIN.LOMB_KOZEP, LOMB.HULLATO, 0x2b71, 0.20, 1.1, 0.92, 1.1);
    e.gyurt(0.52, 0.30, 2.55, -0.16, SZIN.LOMB_FENY, LOMB.HULLATO, 0x91c3, 0.24);
    return e;
  },

  /**
   * TÁVOLI IMPOSTOR — a fa 90 világegységen túl. Öt háromszög: nincs törzse,
   * nincs emelete, csak a sziluettje és a SZÍNE (a hash ugyanaz, mint a közeli
   * fáé, tehát a váltás nem villan).
   */
  TAVOLI() {
    const e = new Forma();
    e.kup(0.86, 2.85, 5, 0, 0.15, 0, SZIN.LOMB_KOZEP, LOMB.OROKZOLD);
    return e;
  },

  /** BOKOR — két gyűrt gömb. Lombhullató: ősszel sárgul, télen kopár. */
  BOKOR() {
    const e = new Forma();
    e.gyurt(0.42, 0, 0.30, 0, SZIN.LOMB_KOZEP, LOMB.HULLATO, 0x4d13, 0.26, 1.2, 0.78, 1.2);
    e.gyurt(0.27, 0.24, 0.44, 0.16, SZIN.LOMB_FENY, LOMB.HULLATO, 0x7a55, 0.28);
    return e;
  },

  /** SZIKLA — egy gyűrt tömb. A méretét és a lapultságát a PÉLDÁNY adja: ugyanez
   *  a forma a kavics, a lapos kőlap és a ház méretű szikla. */
  SZIKLA() {
    const e = new Forma();
    e.gyurt(0.5, 0, 0.34, 0, SZIN.KO, LOMB.NINCS, 0x1f7d, 0.42, 1.15, 0.86, 1.0);
    return e;
  },

  /** RÖNK — álló hasáb. A példány dönti el, hogy TUSKÓ (alacsony, álló) vagy
   *  KIDŐLT FA (elfektetve, hosszan nyújtva) lesz belőle. */
  RONK() {
    const e = new Forma();
    e.henger(0.19, 0.165, 1.0, 6, 0, 0, 0, SZIN.RONK, LOMB.NINCS, true);
    // A véglap világosabb: ettől olvasható, hogy TÖRÖTT fa, nem oszlop.
    const lap = new THREE.CircleGeometry(0.155, 6);
    lap.rotateX(-Math.PI / 2);
    lap.translate(0, 1.004, 0);
    e.elem(lap, SZIN.RONK_VEG);
    return e;
  },

  // ── NYERSANYAG-ÖLTÖZTETÉS ────────────────────────────────────────────────
  // Ezek NEM önálló tereptárgyak: a `gazdasag3d.js` által rajzolt lelőhely-jel
  // KÖRÉ épülnek, ugyanabba a cellába. Lásd a `props3d.js` fejlécében, miért
  // öltöztetés és miért nem újrarajzolás.

  /** FA-lelőhely: törzs + széles alsó szoknya a gazdasági kúp alá. */
  DEP_FA() {
    const e = new Forma();
    e.henger(0.155, 0.115, 0.95, 5, 0, 0, 0, SZIN.KERE_SOTET);
    e.kup(0.88, 1.30, 6, 0, 0.22, 0, SZIN.LOMB_LIGET, LOMB.OROKZOLD);
    return e;
  },

  /** ÉTEL-lelőhely: alacsony, terebélyes bogyós bokor a piros bogyók alá. */
  DEP_ETEL() {
    const e = new Forma();
    e.gyurt(0.48, 0, 0.24, 0, SZIN.LOMB_KOZEP, LOMB.HULLATO, 0x3311, 0.26, 1.32, 0.66, 1.32);
    e.gyurt(0.30, 0.28, 0.30, -0.18, SZIN.LOMB_FENY, LOMB.HULLATO, 0xc4e1, 0.30, 1.1, 0.82, 1.1);
    e.bogyo(0.115, -0.22, 0.38, 0.16, SZIN.BOGYO);
    e.bogyo(0.10, 0.16, 0.44, 0.24, SZIN.BOGYO);
    e.bogyo(0.10, 0.30, 0.36, -0.30, SZIN.BOGYO);
    e.bogyo(0.09, -0.05, 0.46, -0.22, SZIN.BOGYO);
    return e;
  },

  /** KŐ-lelőhely: kibukkanó szikla-csoport — sarkos, világos, MAGASABB, mint a
   *  szórvány kavics, hogy messziről is kőfejtőnek lássék. */
  DEP_KO() {
    const e = new Forma();
    e.gyurt(0.46, -0.14, 0.30, 0.08, SZIN.KO_VILAGOS, LOMB.NINCS, 0x5b21, 0.38, 1.0, 1.35, 1.0);
    e.gyurt(0.34, 0.26, 0.18, -0.18, SZIN.KO, LOMB.NINCS, 0x9c74, 0.38, 1.15, 0.9, 1.15);
    return e;
  },

  /** KRISTÁLY-talp: sötét kőgallér, amiből a tüskék NŐNEK. Enélkül a kristály
   *  úgy néz ki, mintha a fűbe lenne szúrva. */
  KRISTALY_TALP() {
    const e = new Forma();
    e.gyurt(0.62, 0, 0.16, 0, SZIN.KRISTALY_TALP, LOMB.NINCS, 0x77b1, 0.34, 1.25, 0.5, 1.25);
    e.gyurt(0.34, 0.34, 0.14, 0.26, SZIN.KRISTALY_TALP, LOMB.NINCS, 0x1e63, 0.34, 1.0, 0.7, 1.0);
    return e;
  },
};

/**
 * KRISTÁLY-SZILÁNK — hatszög-hasáb hegyes csúccsal, a talpa a föld alatt.
 *
 * MIÉRT NEM OKTAÉDER (ez volt a v0.1 óta): az oktaéder minden nézetből
 * ROMBUSZ, tehát a névadó nyersanyag ugyanolyan mértani alapelem volt, mint egy
 * kavics. A hasáb + csúcs sziluettje viszont MÁS, mint bármi másé a pályán —
 * ez az, amitől egy pillantásból tudni, hol van kristály.
 */
function kristalySzilank() {
  const e = new Forma();
  e.henger(0.30, 0.27, 1.15, 6, 0, 0, 0, 0x9fe8ff, LOMB.NINCS);
  e.kup(0.27, 0.62, 6, 0, 1.15, 0, 0xd8f8ff, LOMB.NINCS);
  return e;
}

/**
 * A teljes díszlet-geometria. Egyszer épül fel, futásidőben SOHA nem keletkezik
 * új geometria.
 */
export function epitDiszletGeometriak() {
  const ki = {};
  for (const nev of Object.keys(FORMAK)) {
    ki[nev.toLowerCase()] = osszefuz(FORMAK[nev]().reszek);
  }
  ki.szilank = osszefuz(kristalySzilank().reszek);

  // A szilánk anyaga `vertexColors`-t vár (a Lambert emissive-ját a csúcsszín
  // árnyalja): a `alapSzin` attribútum ehhez nem elég, kell a szabványos
  // `color`. Fehér alfával, mert a tüske TÖMÖR.
  szinbol(ki.szilank);

  // ── Additív burok: ugyanaz a hasáb-sziluett, nagyban ────────────────────
  // A csúcsok felé átlátszó, az „egyenlítőn" világos — additívan összegezve ez
  // adja a lágy, hegy felé elhalványuló ragyogást, fényforrás nélkül.
  const burok = osszefuz(kristalySzilank().reszek);
  burok.deleteAttribute('alapSzin');
  burok.deleteAttribute('lombArany');
  burok.scale(2.05, 1.5, 2.05);
  alfaSzin(burok, (x, y) => (y > 1.2 ? 0.05 : 0.30 * (1 - y / 2.2)), 0.62, 0.93, 1.0);
  burok.computeBoundingSphere();
  ki.burok = burok;

  // ── Talajfolt: körlap, középen fényes, a peremén nullára fogyó alfával ──
  // A `CircleGeometry` első csúcsa PONT a középpont, tehát a sugárirányú
  // színátmenet ingyen adódik.
  const folt = new THREE.CircleGeometry(1, 12);
  folt.rotateX(-Math.PI / 2);
  alfaSzin(folt, (x, y, z) => Math.max(0, 0.55 * (1 - Math.sqrt(x * x + z * z))), 0.45, 0.88, 1.0);
  folt.computeBoundingSphere();
  ki.folt = folt;

  return ki;
}

/** `alapSzin` → szabványos `color` (a kristály-anyagok ezt olvassák). */
function szinbol(geo) {
  const a = geo.attributes.alapSzin;
  const arr = new Float32Array(a.count * 4);
  for (let i = 0; i < a.count; i++) {
    arr[i * 4] = a.getX(i); arr[i * 4 + 1] = a.getY(i); arr[i * 4 + 2] = a.getZ(i);
    arr[i * 4 + 3] = 1;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 4));
}

/**
 * Egy geometria háromszög-száma. Azért függvény, mert a díszletben INDEXELT
 * (körlap) és INDEXELETLEN (minden más) geometria is van — a `position.count/3`
 * az előbbire csendben hazudik, és a szonda réteg-bontása ezen múlik.
 */
export function haromszogDb(geo) {
  return (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
}

/** Egész-hash (Murmur-féle keverés) — determinisztikus, allokációmentes. */
export function keverd(i, mag) {
  let h = (i ^ mag) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * DIAGNOSZTIKA — a formák mérete és költsége. Nem dísz: ebből derül ki, hogy
 * minden forma tényleg MÁS (a `jegy` különbözik), és hogy egyik sem nőtt a
 * költségvetése fölé. A szoftveres kirajzoló és a jelentés is ezt olvassa.
 */
export function formaOsszefoglalo() {
  const geok = epitDiszletGeometriak();
  const ki = [];
  for (const nev of Object.keys(geok)) {
    const geo = geok[nev];
    const p = geo.attributes.position.array;
    let maxXZ = 0, maxY = 0, minY = Infinity, jegy = 0;
    for (let i = 0; i < p.length; i += 3) {
      const ax = Math.abs(p[i]), az = Math.abs(p[i + 2]);
      if (ax > maxXZ) maxXZ = ax;
      if (az > maxXZ) maxXZ = az;
      if (p[i + 1] > maxY) maxY = p[i + 1];
      if (p[i + 1] < minY) minY = p[i + 1];
      jegy = (Math.imul(jegy, 31) + Math.round((p[i] + p[i + 1] * 3 + p[i + 2] * 7) * 1000)) | 0;
    }
    ki.push({
      nev,
      haromszog: haromszogDb(geo),
      szelesFel: +maxXZ.toFixed(3),
      magassag: +maxY.toFixed(3),
      alj: +minY.toFixed(3),
      jegy,
    });
    geo.dispose();
  }
  return ki;
}
