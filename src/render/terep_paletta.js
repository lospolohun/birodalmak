// AGE OF THE CRYSTALS — TEREP-PALETTA: hat térkép, hat arculat.
//
// ── MIÉRT KÜLÖN FÁJL, ÉS MIÉRT NEM ISMERI A `three`-T ─────────────────────
// A terep színe eddig öt hexa-szám volt a `terrain3d.js` tetején: cella-típus
// → szín, semmi más. Ennek KÉT baja volt, és a második a súlyosabb:
//   1. A hat térkép-preset (`sim/terkep.js`) MIND ugyanazt az öt színt kapta.
//      A hegyvidék, az erdőség és a szárazföld között a képen SEMMI különbség
//      nem volt — pedig a preset a pálya arculatának a fele.
//   2. A `TEREP.FU` a pálya 80–90 %-a. Egyetlen zöld hexával a pálya egyetlen,
//      egyenletes zöld szőnyeg — a domborzatot csak a fény árnyalta.
//
// Ez a modul ezért a cella-típus MELLETT a MAGASSÁGOT, a LEJTÉST és egy
// levezetett NEDVESSÉGET is beleszámol a színbe, presetenként más palettával.
//
// ⚠️ NINCS BENNE `three` IMPORT, ÉS EZ SZÁNDÉKOS. Így a modul node-ban is fut,
// tehát a paletta ELLENŐRIZHETŐ GPU nélkül: a fejlesztés alatt egy szoftveres
// z-pufferes rasztarizáló mind a hat presetet kirajzolta ebből a fájlból, és
// pont az mutatta meg, hogy a hegyvidék hó-küszöbe (`havasSzint: 8.0`) alatt a
// szikla és a fű között nincs átmenet. A `three`-t importáló modult ehhez
// előbb DOM-ot kellett volna hazudni. A színek ezért LINEÁRIS térben jönnek
// vissza (a sRGB→lineáris átváltás itt van megírva, nem `THREE.Color`-ral) —
// a csúcsszín-attribútum úgyis lineáris munkateret vár.
//
// ── MIÉRT NEM ÍR, ÉS MIT NEM SZABAD BELESZÁMOLNI ──────────────────────────
// A modul CSAK OLVAS a `Racs`-ból. A cella-TÍPUS az úr: a járhatóságot a sim
// dönti el (`TEREP.VIZ` és `TEREP.SZIKLA` járhatatlan), a szín pedig ezen
// BELÜL változik. Ha egy „szebb" átmenet fűnek festene egy szikla-cellát, a
// játékos szeme és a szabály elválna — az a fajta hiba, amit senki nem ért meg
// menet közben, csak azt látja, hogy a sereg nem megy oda, ahova küldi.
//
// ── DETERMINIZMUS ─────────────────────────────────────────────────────────
// A nedvesség-zaj a sim `Zaj`-ából jön, a pálya seedjéből. Két gépen ugyanaz a
// kép — nem azért, mert a lockstep megkövetelné (a render sosem hat a simre),
// hanem mert a hibajelentésekhez ér valamit, ha a képernyőkép reprodukálható.

import { Zaj } from '../sim/rng.js';
import { TEREP, VIZSZINT } from '../sim/grid.js';
import { terkepBeallitas } from '../sim/terkep.js';

/**
 * Ennyi mélységnél számít a víz „mélynek" (világegység). A meder-szín és a
 * vízsík átlátszósága is ehhez skálázódik — egy szám, hogy a kettő ne
 * csússzon el egymáshoz képest.
 */
export const MELYSEG_REF = 5.0;

/**
 * A HAT ARCULAT.
 *
 * A sorrend a `TERKEP.*` indexe. Minden mező sRGB hexa, kivéve a végén lévő
 * skalárokat. Ami itt SZÁM, az mind a látványé: a `sim/terkep.js` paramétereit
 * (havasSzint, sziklaLejto) OLVASSUK, de nem másoljuk ide — különben a kettő
 * előbb-utóbb szétcsúszik, és a hó a képen máshol kezdődne, mint a rácson.
 *
 *   nedvBias   a preset alap-nedvessége (−0,35 = szavanna, +0,26 = esőerdő)
 *   partSzeles ennyi világegység magasságig homokos a fű a vízparton
 *   makroEro   nagy léptékű folt-moduláció a fragment-shaderben
 *   finomEro   sub-cella szemcse (közelről; távolról kifakul)
 *   retegEro   a sziklafal rétegzettsége
 *   falEro     mennyire üti át a kőzet a csúcsszínt meredek felületen
 *   csillam    kristályos szikra a talajban (csak a kristálymezőn)
 */
const ARC = [
  // 0 — NYÍLT MEZŐ: napsütötte mérsékelt síkság. Zöld völgyek, kiszáradt,
  //     aranyló hátak — a változatosság maga a nedvesség-zaj.
  {
    nev: 'nyílt mező',
    melyMeder: 0x1f4152, sekelyMeder: 0x6d8b7c,
    nedvesHomok: 0xa08a5f, szarazHomok: 0xd3c08a,
    fuNedves: 0x4a7a34, fuSzaraz: 0x9a9a55, fuMagas: 0x77855e, moha: 0x4f6b38,
    kavics: 0x9c937e, sziklaAlap: 0x7b756a, sziklaVilagos: 0xaba69a,
    ho: 0xeff3f7, hoArnyek: 0xc8d4e2,
    vizSekely: 0x57a6b6, vizMely: 0x2a6d8f, hab: 0xdfeef2,
    nedvBias: 0.06, partSzeles: 2.4,
    makroEro: 0.10, finomEro: 0.070, retegEro: 0.14, falEro: 0.85, csillam: 0,
  },
  // 1 — FOLYAM: ártér. A folyó a főszereplő, ezért SZÉLES a homokpad
  //     (`partSzeles` a legnagyobb) és bujább a part menti fű.
  {
    nev: 'folyam',
    melyMeder: 0x27505c, sekelyMeder: 0x7d9b81,
    nedvesHomok: 0x9c8455, szarazHomok: 0xdccb97,
    fuNedves: 0x3d7a30, fuSzaraz: 0x87964d, fuMagas: 0x6e8a5b, moha: 0x44703a,
    kavics: 0xa89e86, sziklaAlap: 0x817a6d, sziklaVilagos: 0xaea89c,
    ho: 0xeef4f8, hoArnyek: 0xc6d3e3,
    vizSekely: 0x63b2b9, vizMely: 0x2c7896, hab: 0xe6f2f2,
    nedvBias: 0.15, partSzeles: 3.2,
    makroEro: 0.09, finomEro: 0.065, retegEro: 0.12, falEro: 0.80, csillam: 0,
  },
  // 2 — ERDŐSÉG: hűvös, sötét, nyirkos. A `kavics` itt nem kavics, hanem
  //     AVAR: a lejtőn nem törmelék üt át, hanem barna erdőtalaj.
  {
    nev: 'erdőség',
    melyMeder: 0x1b3c42, sekelyMeder: 0x5a7a68,
    nedvesHomok: 0x7d6b48, szarazHomok: 0xbfae82,
    fuNedves: 0x27552a, fuSzaraz: 0x6d7c3c, fuMagas: 0x4c6a45, moha: 0x386137,
    kavics: 0x6d5a3c, sziklaAlap: 0x6c6f64, sziklaVilagos: 0x8d9085,
    ho: 0xe6ecf1, hoArnyek: 0xbfcddc,
    vizSekely: 0x498e92, vizMely: 0x21596a, hab: 0xdbe9e6,
    nedvBias: 0.22, partSzeles: 1.8,
    makroEro: 0.12, finomEro: 0.078, retegEro: 0.11, falEro: 0.75, csillam: 0,
  },
  // 3 — HEGYVIDÉK: a kőzet a főszereplő. Legerősebb rétegzettség, legvilágosabb
  //     csupasz szikla, és a `havasSzint: 8.0` miatt tényleg lesz hó a képen.
  {
    nev: 'hegyvidék',
    melyMeder: 0x23404f, sekelyMeder: 0x6a8285,
    nedvesHomok: 0x93815e, szarazHomok: 0xc6b791,
    fuNedves: 0x466b36, fuSzaraz: 0x7a7c4a, fuMagas: 0x687653, moha: 0x4a6238,
    kavics: 0xa59d8d, sziklaAlap: 0x6b6760, sziklaVilagos: 0xb2ada4,
    ho: 0xf5f8fc, hoArnyek: 0xc6d5e8,
    vizSekely: 0x559cb0, vizMely: 0x276b87, hab: 0xe8f2f8,
    nedvBias: 0.10, partSzeles: 1.6,
    makroEro: 0.13, finomEro: 0.078, retegEro: 0.16, falEro: 0.95, csillam: 0,
  },
  // 4 — KRISTÁLYMEZŐ: hideg türkiz, ibolyás-szürke kőzet. Az EGYETLEN preset,
  //     ahol a talaj szikrázik — a kristály itt nemcsak díszlet, hanem a föld
  //     része. Ez a szikra fragment-oldali, tehát nulla háromszögbe kerül.
  {
    nev: 'kristálymező',
    melyMeder: 0x1e4657, sekelyMeder: 0x6e9490,
    nedvesHomok: 0x9a9070, szarazHomok: 0xd5cba6,
    fuNedves: 0x3d7d5c, fuSzaraz: 0x8b9c68, fuMagas: 0x6b8e83, moha: 0x437a63,
    kavics: 0x9796a3, sziklaAlap: 0x706d7d, sziklaVilagos: 0xa8a3b6,
    ho: 0xecf2fb, hoArnyek: 0xbfd0ea,
    vizSekely: 0x59afc0, vizMely: 0x2a7899, hab: 0xe2f2f6,
    nedvBias: 0.10, partSzeles: 2.2,
    makroEro: 0.11, finomEro: 0.070, retegEro: 0.12, falEro: 0.85, csillam: 0.10,
  },
  // 5 — SZÁRAZFÖLD: szavanna. `tengerTav: 2.0`, tehát nincs tenger — a
  //     part-színek majdnem sosem látszanak, a fű viszont okkerbe hajlik.
  {
    nev: 'szárazföld',
    melyMeder: 0x2c4a52, sekelyMeder: 0x84906c,
    nedvesHomok: 0xa88c5a, szarazHomok: 0xdcc48c,
    fuNedves: 0x5d8a31, fuSzaraz: 0xb2a05a, fuMagas: 0x8f8b4e, moha: 0x647c36,
    kavics: 0xae9670, sziklaAlap: 0x876c53, sziklaVilagos: 0xba9c78,
    ho: 0xeef0ee, hoArnyek: 0xcdd3d6,
    vizSekely: 0x5a9fa2, vizMely: 0x317b96, hab: 0xe4eee4,
    nedvBias: 0.06, partSzeles: 2.0,
    makroEro: 0.12, finomEro: 0.078, retegEro: 0.14, falEro: 0.90, csillam: 0,
  },
];

/** Egy preset arculata. Ismeretlen indexre a nyílt mező — mint a `terkep.js`-ben. */
export function arculat(terkep) {
  const t = terkep | 0;
  return ARC[(t >= 0 && t < ARC.length) ? t : 0];
}

/**
 * sRGB hexa → lineáris [r,g,b]. Ugyanaz a képlet, amit a `THREE.Color`
 * használ (`SRGBToLinear`), csak `three` nélkül — lásd a fejlécet.
 * @param {number} hex
 * @param {number[]|Float32Array} [ki]
 */
export function hexLin(hex, ki = [0, 0, 0]) {
  ki[0] = szrgbLin(((hex >> 16) & 255) / 255);
  ki[1] = szrgbLin(((hex >> 8) & 255) / 255);
  ki[2] = szrgbLin((hex & 255) / 255);
  return ki;
}

function szrgbLin(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * CELLÁNKÉNTI TALAJSZÍN — lineáris RGB, `n*n*3` hosszan.
 *
 * A hívó (`terrain3d.js`) ebből átlagol csúcsszínt: egy csúcs négy cella
 * sarka, tehát a négy szín átlagát kapja. A puha átmenet ott keletkezik, nem
 * itt — itt minden cella ÖNMAGÁBAN kap színt, hogy a típus-szabály (víz,
 * szikla) cellapontosan érvényesüljön.
 *
 * @param {{n:number, seed:number, terkep:number, magassag:Float64Array,
 *          kozepMagassag:Float64Array, terep:Uint8Array, p?:object}} racs
 * @returns {Float32Array}
 */
export function talajSzinek(racs) {
  const n = racs.n, s = n + 1;
  const p = racs.p || terkepBeallitas(racs.terkep | 0);
  const arc = arculat(racs.terkep | 0);
  const pal = palettaLin(arc);
  const mag = racs.magassag, kozep = racs.kozepMagassag, ter = racs.terep;

  // Két zaj-réteg a nedvességhez: nagy foltok (mely vidék buja, mely kopár) és
  // egy finomabb, ami a foltok szélét szaggatja. A seed a pályáé — ugyanaz a
  // pálya ugyanúgy néz ki.
  const zaj = new Zaj((racs.seed ^ 0x2f6a1c3b) >>> 0);
  const havas = p.havasSzint, sziklaKuszob = p.sziklaLejto;

  const ki = new Float32Array(n * n * 3);
  const c = [0, 0, 0];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      const kh = kozep[i];

      // Cella-lejtés — UGYANÚGY, ahogy a `grid.js` számolja (négy sarok
      // legnagyobb eltérése). Nem közelítjük normálisból: ha a látvány más
      // számot használna, mint a járhatóság, a szikla-küszöb a képen fél
      // cellával odébb lenne.
      const a = mag[y * s + x], b = mag[y * s + x + 1];
      const d = mag[(y + 1) * s + x], e = mag[(y + 1) * s + x + 1];
      let min = a, max = a;
      if (b < min) min = b; if (b > max) max = b;
      if (d < min) min = d; if (d > max) max = d;
      if (e < min) min = e; if (e > max) max = e;
      const lejto = max - min;
      const lejtoN = lejto / sziklaKuszob;   // 1 = pont a járhatatlan határ

      // ── NEDVESSÉG ────────────────────────────────────────────────────────
      // Nem sim-adat, hanem levezetés: a mélyedésekben és a víz mellett
      // gyűlik, a magasban és a meredeken elfolyik. Ez az, ami a nagy zöld
      // szőnyeget tarkára bontja anélkül, hogy egyetlen cellát is átfestene
      // más TÍPUSRA.
      const fx = x / n, fy = y / n;
      const nagy = zaj.fbm(fx * 5.5, fy * 5.5, 3);
      const finom = zaj.zaj2(x * 0.34 + 11.7, y * 0.34 - 4.3);
      // ⚠️ A LEVONÁSOK SÚLYA MÉRT SZÁM, NEM ÉRZÉS. Az első változat 0,34-et
      // vont le a magasságért és 0,50-et a lejtésért: a hegyvidéken és a
      // szárazföldön a nedvesség MEDIÁNJA 0,00 lett, vagyis a képlet a nullára
      // lapult, és a két pálya egyetlen tömör színfolttá vált — pont az a
      // hiba, ami ellen az egész modul készült. A mostani súlyokkal mind a hat
      // preset mediánja 0,3 és 0,7 közé esik, és a 10–90 százalék között
      // legalább 0,3 a szórás.
      let nedv = 0.50 + nagy * 0.40 + finom * 0.15
        + arc.nedvBias
        - simaLepcso(0.5, havas, kh) * 0.20
        - Math.min(1, Math.max(0, lejtoN)) * 0.30
        + (1 - simaLepcso(VIZSZINT, VIZSZINT + 3.5, kh)) * 0.28;
      if (nedv < 0) nedv = 0; else if (nedv > 1) nedv = 1;

      cellaSzin(ter[i], kh, lejtoN, nedv, havas, arc, pal, c);

      const q = i * 3;
      ki[q] = c[0]; ki[q + 1] = c[1]; ki[q + 2] = c[2];
    }
  }
  return ki;
}

/**
 * EGY cella színe. A típus a keret, a magasság/lejtés/nedvesség a tartalom.
 * @param {number[]} ki lineáris RGB ide
 */
function cellaSzin(t, kh, lejtoN, nedv, havas, arc, pal, ki) {
  switch (t) {
    case TEREP.VIZ: {
      // A MEDER színe adja a sekély sávot: a vízsík önmagában egyenletes kék
      // lenne, a partközeli világos meder látszik át rajta. Ezért nem a víz
      // átlátszóságát tekergetjük, hanem a talajt festjük mélység szerint.
      const m = simaLepcso(0.10, MELYSEG_REF * 0.85, VIZSZINT - kh);
      keverd(pal.sekelyMeder, pal.melyMeder, m, ki);
      // A legsekélyebb sávban még a homok üt át.
      keverd(ki, pal.nedvesHomok, (1 - simaLepcso(0.0, 0.7, VIZSZINT - kh)) * 0.55, ki);
      return;
    }
    case TEREP.FOVENY: {
      // A `grid.js` 0,45 világegység magas sávot nevez fövenynek. Alul vizes,
      // felül száraz homok — ez a vonal az, amit a játékos partvonalnak lát.
      const sz = simaLepcso(0.0, 0.45, kh - VIZSZINT);
      keverd(pal.nedvesHomok, pal.szarazHomok, sz, ki);
      return;
    }
    case TEREP.SZIKLA: {
      // Magasabban világosabb (kevesebb rajta a növényzet), meredekebben
      // csupaszabb. Alacsonyan és nyirkosan MOHÁS — a v0.10 képén a szikla
      // ugyanolyan szürke volt a tóparton, mint 12 egységgel feljebb.
      const b = simaLepcso(1.0, Math.max(2.0, havas), kh);
      const csupasz = Math.min(1, Math.max(0, lejtoN - 1) / 0.8);
      keverd(pal.sziklaAlap, pal.sziklaVilagos, 0.35 * b + 0.50 * csupasz, ki);
      keverd(ki, pal.moha, (1 - b) * nedv * 0.32, ki);
      if (kh > havas) {
        keverd(ki, pal.ho, Math.min(1, (kh - havas) / 2.5) * (1 - csupasz) * 0.75, ki);
      }
      return;
    }
    case TEREP.HAVAS: {
      const h = simaLepcso(0, 2.0, kh - havas);
      keverd(pal.hoArnyek, pal.ho, h, ki);
      // A hó a meredeken nem tapad meg: ott a kőzet marad.
      keverd(ki, pal.sziklaVilagos, Math.min(1, Math.max(0, lejtoN - 0.55)) * 0.6, ki);
      return;
    }
    default: {
      // ── FŰ: a pálya 80–90 %-a, tehát ITT dől el, egyszínű-e a térkép ─────
      keverd(pal.fuSzaraz, pal.fuNedves, simaLepcso(0.25, 0.78, nedv), ki);
      // A hóhatár alatt már fakó, alpesi.
      keverd(ki, pal.fuMagas, simaLepcso(havas - 4.5, havas, kh) * 0.85, ki);
      // A járhatatlan meredek ELŐTT törmelék/avar üt át — így a szikla-cella
      // nem éles vágás, hanem egy sáv vége.
      keverd(ki, pal.kavics, simaLepcso(0.35, 0.95, lejtoN) * 0.75, ki);
      // Vízparti homokos sáv: a FÖVENY 0,45-ös sávja túl keskeny ahhoz, hogy
      // partnak lássa a szem. Ez a szín MÉG FŰ (járható), csak homokosnak fest.
      keverd(ki, pal.szarazHomok,
        (1 - simaLepcso(0.45, arc.partSzeles, kh - VIZSZINT)) * 0.80, ki);
    }
  }
}

// ── SEGÉDEK (mind allokációmentes, a hívó ad kimeneti tömböt) ─────────────

function palettaLin(arc) {
  const ki = {};
  for (const k of SZIN_MEZOK) ki[k] = hexLin(arc[k], new Float64Array(3));
  return ki;
}

const SZIN_MEZOK = [
  'melyMeder', 'sekelyMeder', 'nedvesHomok', 'szarazHomok',
  'fuNedves', 'fuSzaraz', 'fuMagas', 'moha', 'kavics',
  'sziklaAlap', 'sziklaVilagos', 'ho', 'hoArnyek',
  'vizSekely', 'vizMely', 'hab',
];

/** `smoothstep` — ugyanaz, mint a GLSL-ben, hogy a CPU- és GPU-oldal egyezzen. */
function simaLepcso(a, b, x) {
  if (b <= a) return x >= b ? 1 : 0;
  let t = (x - a) / (b - a);
  if (t < 0) t = 0; else if (t > 1) t = 1;
  return t * t * (3 - 2 * t);
}

/** Lineáris szín-keverés. `ki` lehet azonos `a`-val (helyben keverés). */
function keverd(a, b, t, ki) {
  ki[0] = a[0] + (b[0] - a[0]) * t;
  ki[1] = a[1] + (b[1] - a[1]) * t;
  ki[2] = a[2] + (b[2] - a[2]) * t;
  return ki;
}

/**
 * A VÍZSÍK MÉLYSÉG-TÉRKÉPE — `n×n` bájt, cellánként egy.
 *
 * ⚠️ EZ AZ, AMITŐL A PARTVONAL LÁGY. A vízsík eddig egyetlen, egyenletesen
 * 0,82 átlátszóságú lap volt: a partot élesen elvágta, mert a legsekélyebb
 * bokáig érő víz ugyanolyan tömör kék volt, mint a nyílt tenger. Egy
 * mélység-textúrával a fragment-shader tudja, hány egység víz van alatta —
 * és ebből jön az átlátszóság, a szín ÉS a habos sáv, EGYETLEN textúra-
 * olvasásért. Geometriát nem érint, per-frame munkát nem okoz.
 *
 * 0 = a felszín a vízszinten vagy fölötte, 255 = `MELYSEG_REF` mély.
 * @returns {Uint8Array}
 */
export function melysegTerkep(racs) {
  const n = racs.n, kozep = racs.kozepMagassag;
  const ki = new Uint8Array(n * n);
  for (let i = 0; i < n * n; i++) {
    let m = (VIZSZINT - kozep[i]) / MELYSEG_REF;
    if (m < 0) m = 0; else if (m > 1) m = 1;
    ki[i] = (m * 255) | 0;
  }
  return ki;
}
