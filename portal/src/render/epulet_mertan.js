// PORTAL HUB TYCOON — ÉPÜLET-MÉRTAN (típusonként egyedi sziluett).
//
// ── MIÉRT VAN EZ A FÁJL ───────────────────────────────────────────────────
// A v0.1-ben minden épület UGYANAZ a doboz volt, csak más színben. Ez a
// gazdaságnak elég volt, a játéknak nem: a játékos ferdén felülről néz egy
// csarnokot, és onnan a szín az egyetlen fogódzó — színvakon, kis felbontáson
// vagy egy sűrű állomás közepén viszont az sem. Az „ez ott a mosdó" felismerés
// nem szöveg, hanem SZILUETT kérdése. Ezért kap minden típus saját mértant:
// a ponyvatetőt, a kupolát, a kristályokat és a futószalagot messziről is meg
// lehet különböztetni, a doboz-erdőt nem.
//
// ── MIÉRT NEM MESH-EK, HANEM ÖSSZEFŰZÖTT GEOMETRIA ────────────────────────
// A csábítás az volna, hogy minden épület egy `Group` legyen pár mesh-sel.
// Négyszáz épületnél az több ezer rajzolási hívás — a v0.1 tizenkettő volt.
// Ehelyett típusonként EGY összefűzött (merged) geometria készül, amit a hívó
// egyetlen InstancedMesh-be tesz: a példányosítás megmarad, a rajzolási hívás
// száma nem az épületek számától, hanem a TÍPUSOK számától függ.
//
// ── AZ EGYSÉGDOBOZ-SZERZŐDÉS ──────────────────────────────────────────────
// Minden geometria a [0..1]³ egységdobozba van normalizálva: x és z a 0..1
// alapterület, y a 0-tól felfelé. A geometria SOHA nem tartalmaz abszolút
// méretet — a hívó skálázza `(ep.sz, tipus.magas, ep.m)`-mel. Ezért:
//
//   • az y-t MINDIG pontosan 0..1-re nyújtjuk (a `magas` így értelmes szám),
//   • az x/z-t viszont csak LEFELÉ skálázzuk, arányt tartva. Enélkül a
//     reklámoszlop vékony rúdja fallá hízna, mert a rendszer „töltsd ki a
//     négyzetet" utasítást olvasna ki egy 0,12 széles elemből.
//
// ── A DÍSZ UGYANEBBEN A TÉRBEN VAN ────────────────────────────────────────
// Az `epuletDiszek()` NEM külön egységdobozt ad: a dísz ugyanabban a
// normalizált térben van, mint a test, és UGYANAZZAL a példány-mátrixszal
// rajzolandó, csak világosabb színnel. Így a kiemelés (tető, tábla, kupola,
// gömb) mindig pontosan a helyén ül, és két rajzolási hívásból kétszínű lesz
// az egész állomás. A dísz befoglalója ezért nem tölti ki a [0..1]³-t, csak
// benne van — a szonda pontosan ezt ellenőrzi.
//
// ── A KÖLTSÉGKERET ────────────────────────────────────────────────────────
// Típusonként 300 háromszög alatt (test + dísz). Négyszáz épület így is a
// százezres nagyságrendben marad, ami egy integrált GPU-nak is semmi — de a
// keret nélkül a „még egy kis részlet" tíz épülettípus után észrevétlenül
// elviszi a képkockát. A `tools/mertan_szonda.mjs` méri és kiírja.
//
// ⚠️ A `portal` típusnak SZÁNDÉKOSAN nincs mértana: a forgó kapugyűrű az
// `allomas3d.js` saját objektuma, mert belőle pár tucat van, és a játék arca.

const PI = Math.PI;

// ══════════════════════════════════════════════════════════════════════════
//  MÉRTAN-KELLÉKEK
//  Szándékosan itt élnek, nem közös modulban: ez a fájl és a `leny_mertan.js`
//  egymástól függetlenül beépíthető maradjon. A pár tucat sor duplikálása
//  olcsóbb, mint egy harmadik fájl, amit be kell húzni mindkettőhöz.
// ══════════════════════════════════════════════════════════════════════════

/** Forgatás a darab SAJÁT origója körül, aztán elhelyezés. Ebben a sorrendben. */
function helyez(g, cx, cy, cz, rx, ry, rz) {
  if (rx) g.rotateX(rx);
  if (ry) g.rotateY(ry);
  if (rz) g.rotateZ(rz);
  g.translate(cx, cy, cz);
  return g;
}

/**
 * A darab-készítők. Mindegyiknél (cx,cy,cz) a darab KÖZEPE — egyetlen
 * konvenció, mert a kevert „hol a közép, hol az alja" a legmegbízhatóbb módja
 * annak, hogy egy tetődísz fél méterrel a levegőben maradjon.
 */
function kellekek(THREE) {
  return {
    doboz: (sx, sy, sz, cx, cy, cz, rx = 0, ry = 0, rz = 0) =>
      helyez(new THREE.BoxGeometry(sx, sy, sz), cx, cy, cz, rx, ry, rz),

    henger: (rf, rl, h, seg, cx, cy, cz, rx = 0, ry = 0, rz = 0) =>
      helyez(new THREE.CylinderGeometry(rf, rl, h, seg), cx, cy, cz, rx, ry, rz),

    /** Kúp: a csúcsa alapból FÖLFELÉ néz. */
    kup: (r, h, seg, cx, cy, cz, rx = 0, ry = 0, rz = 0) =>
      helyez(new THREE.ConeGeometry(r, h, seg), cx, cy, cz, rx, ry, rz),

    /** Félgömb (kupola): a középpontja (cx,cy,cz), fölfelé domborodik. */
    kupola: (r, seg, sorok, cx, cy, cz) =>
      helyez(new THREE.SphereGeometry(r, seg, sorok, 0, PI * 2, 0, PI * 0.5), cx, cy, cz, 0, 0, 0),

    okta: (r, cx, cy, cz, reszlet = 0) =>
      helyez(new THREE.OctahedronGeometry(r, reszlet), cx, cy, cz, 0, 0, 0),

    /** Olcsó gömb: 20 háromszög. Ahol nem kell sima felület, ez a helyes ár. */
    ikoza: (r, cx, cy, cz) =>
      helyez(new THREE.IcosahedronGeometry(r, 0), cx, cy, cz, 0, 0, 0),

    /** Fél henger — ponyvatetőnek. Zárt, mert a Lambert egyoldalú. */
    ponyva: (r, h, seg, cx, cy, cz, rx = 0, ry = 0, rz = 0) =>
      helyez(new THREE.CylinderGeometry(r, r, h, seg, 1, false, 0, PI), cx, cy, cz, rx, ry, rz),
  };
}

/**
 * Indexelt összefűzés. Csak a `position` és a `normal` marad — uv-t egyik
 * anyagunk sem használ, és a fölösleges attribútum 400 példánynál is fölösleges
 * sávszélesség.
 */
function fuz(THREE, darabok) {
  if (!darabok.length) return null;
  let vN = 0, iN = 0;
  for (const g of darabok) {
    vN += g.attributes.position.count;
    iN += g.index ? g.index.count : g.attributes.position.count;
  }
  const poz = new Float32Array(vN * 3);
  const nor = new Float32Array(vN * 3);
  const idx = vN > 65535 ? new Uint32Array(iN) : new Uint16Array(iN);
  let vo = 0, io = 0;
  for (const g of darabok) {
    const p = g.attributes.position, n = g.attributes.normal;
    poz.set(p.array, vo * 3);
    if (n) nor.set(n.array, vo * 3);
    if (g.index) {
      const gi = g.index.array;
      for (let i = 0; i < gi.length; i++) idx[io++] = gi[i] + vo;
    } else {
      for (let i = 0; i < p.count; i++) idx[io++] = i + vo;
    }
    vo += p.count;
  }
  const ki = new THREE.BufferGeometry();
  ki.setAttribute('position', new THREE.BufferAttribute(poz, 3));
  ki.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  ki.setIndex(new THREE.BufferAttribute(idx, 1));
  return ki;
}

/**
 * A [0..1]³-ba igazítás. A test és a dísz KÖZÖS befoglalóból kapja a
 * transzformációt, különben a kettő szétcsúszna — pedig ugyanaz a
 * példány-mátrix mozgatja őket.
 */
function egysegdobozba(test, disz) {
  test.computeBoundingBox();
  const bb = test.boundingBox.clone();
  if (disz) { disz.computeBoundingBox(); bb.union(disz.boundingBox); }

  const sx = bb.max.x - bb.min.x;
  const sy = bb.max.y - bb.min.y;
  const sz = bb.max.z - bb.min.z;
  const vszin = Math.max(sx, sz);
  // Vízszintesen csak LEFELÉ skálázunk: a keskeny elem maradjon keskeny.
  const vsz = vszin > 1 ? 1 / vszin : 1;
  const fsz = sy > 1e-6 ? 1 / sy : 1;
  const kx = (bb.min.x + bb.max.x) * 0.5;
  const kz = (bb.min.z + bb.max.z) * 0.5;

  for (const g of [test, disz]) {
    if (!g) continue;
    g.translate(-kx, -bb.min.y, -kz);   // origóba: x/z közép, y alja
    g.scale(vsz, fsz, vsz);
    g.translate(0.5, 0, 0.5);
    g.computeBoundingBox();
    g.computeBoundingSphere();
  }
}

// ══════════════════════════════════════════════════════════════════════════
//  A TERVEK
//  Munkatér: x,z ∈ [-0,5 .. 0,5], y a 0-tól fölfelé. A normalizálás utólag
//  igazít, tehát a SZÁMOK ARÁNYA számít, nem az abszolút értékük.
// ══════════════════════════════════════════════════════════════════════════

const TERVEK = new Map([

  // Kapuív + két oszlop + alacsony pult: a „röntgenkapu" alakja messziről is
  // egyértelmű, és az ív alatt átlátszik a padló — ettől lesz átjáró, nem fal.
  ['biztonsag', (k) => ({
    test: [
      k.doboz(0.94, 0.08, 0.86, 0, 0.04, 0),
      k.doboz(0.14, 0.74, 0.18, -0.36, 0.45, -0.1),
      k.doboz(0.14, 0.74, 0.18, 0.36, 0.45, -0.1),
      k.doboz(0.62, 0.3, 0.24, 0, 0.23, 0.3),
      k.doboz(0.1, 0.34, 0.1, 0, 0.25, -0.1),
    ],
    disz: [
      k.doboz(0.9, 0.14, 0.22, 0, 0.89, -0.1),
      k.doboz(0.66, 0.06, 0.3, 0, 0.41, 0.3),
      k.okta(0.09, 0, 1.02, -0.1),
    ],
  })],

  // Pultsor + fölötte tábla. A három elválasztó adja a „sorban állsz" érzetet.
  ['vam', (k) => ({
    test: [
      k.doboz(0.92, 0.06, 0.86, 0, 0.03, 0),
      k.doboz(0.92, 0.36, 0.3, 0, 0.24, -0.16),
      k.doboz(0.06, 0.28, 0.26, -0.3, 0.5, -0.16),
      k.doboz(0.06, 0.28, 0.26, 0.3, 0.5, -0.16),
      k.doboz(0.08, 0.62, 0.08, -0.3, 0.31, 0.24),
      k.doboz(0.08, 0.62, 0.08, 0.3, 0.31, 0.24),
    ],
    disz: [
      k.doboz(0.96, 0.06, 0.34, 0, 0.45, -0.16),
      k.doboz(0.82, 0.26, 0.06, 0, 0.74, 0.24),
    ],
  })],

  // Futószalag + görgők + egy magára hagyott bőrönd. A görgők tengelye
  // keresztben áll, mert így a szalag IRÁNYA is látszik.
  ['poggyasz', (k) => ({
    test: [
      k.doboz(0.94, 0.14, 0.44, 0, 0.42, 0),
      k.doboz(0.1, 0.36, 0.1, -0.36, 0.18, -0.14),
      k.doboz(0.1, 0.36, 0.1, 0.36, 0.18, -0.14),
      k.doboz(0.1, 0.36, 0.1, -0.36, 0.18, 0.14),
      k.doboz(0.1, 0.36, 0.1, 0.36, 0.18, 0.14),
      k.henger(0.11, 0.11, 0.46, 8, -0.28, 0.52, 0, PI * 0.5),
      k.henger(0.11, 0.11, 0.46, 8, 0, 0.52, 0, PI * 0.5),
      k.henger(0.11, 0.11, 0.46, 8, 0.28, 0.52, 0, PI * 0.5),
    ],
    disz: [
      k.doboz(0.24, 0.2, 0.3, 0.1, 0.72, 0, 0, 0.2, 0),
      k.doboz(0.06, 0.08, 0.1, 0.1, 0.86, 0, 0, 0.2, 0),
    ],
  })],

  // Íves ponyvatető + kémény: a legkönnyebben felismerhető sziluett az egész
  // állomáson, és az étterem az, amit a játékos a leggyakrabban keres.
  ['etterem', (k) => ({
    test: [
      k.doboz(0.9, 0.56, 0.8, 0, 0.28, -0.06),
      k.henger(0.08, 0.09, 0.34, 6, -0.3, 0.72, -0.24),
      k.doboz(0.5, 0.22, 0.1, 0, 0.42, 0.36),
    ],
    disz: [
      k.ponyva(0.36, 0.94, 12, 0, 0.6, 0.18, 0, 0, PI * 0.5),
      k.doboz(0.11, 0.07, 0.11, -0.3, 0.92, -0.24),
    ],
  })],

  // Kirakatablak-keret + előtető. A keret ÜRES közepe a lényeg: onnan tudod,
  // hogy be lehet menni.
  ['bolt', (k) => ({
    test: [
      k.doboz(0.9, 0.72, 0.56, 0, 0.36, -0.18),
      k.doboz(0.9, 0.1, 0.12, 0, 0.05, 0.3),
      k.doboz(0.9, 0.12, 0.12, 0, 0.66, 0.3),
      k.doboz(0.1, 0.72, 0.12, -0.4, 0.36, 0.3),
      k.doboz(0.1, 0.72, 0.12, 0.4, 0.36, 0.3),
    ],
    disz: [
      k.doboz(0.96, 0.07, 0.34, 0, 0.76, 0.32, -0.34),
      k.doboz(0.42, 0.18, 0.06, 0, 0.9, 0.16),
    ],
  })],

  // Polcok sziluettje + ferde nyeregtető. A kilógó polcok teszik „boltossá"
  // azt, ami különben a mosdó lenne más színben.
  ['konyvesbolt', (k) => ({
    test: [
      k.doboz(0.86, 0.66, 0.76, 0, 0.33, -0.06),
      k.doboz(0.9, 0.05, 0.16, 0, 0.2, 0.34),
      k.doboz(0.9, 0.05, 0.16, 0, 0.4, 0.34),
      k.doboz(0.9, 0.05, 0.16, 0, 0.6, 0.34),
      k.doboz(0.07, 0.62, 0.16, -0.42, 0.4, 0.34),
      k.doboz(0.07, 0.62, 0.16, 0.42, 0.4, 0.34),
    ],
    disz: [
      k.doboz(0.56, 0.07, 0.9, -0.24, 0.82, -0.04, 0, 0, 0.44),
      k.doboz(0.56, 0.07, 0.9, 0.24, 0.82, -0.04, 0, 0, -0.44),
    ],
  })],

  // Kis kocka, dupla ajtókeret. Kicsi és tömör — pont az a jelentése, hogy
  // ebből sok kell, nem hogy ez nagy.
  ['wc', (k) => ({
    test: [
      k.doboz(0.8, 0.66, 0.78, 0, 0.33, 0),
      k.doboz(0.26, 0.5, 0.06, -0.18, 0.25, 0.41),
      k.doboz(0.26, 0.5, 0.06, 0.18, 0.25, 0.41),
    ],
    disz: [
      k.doboz(0.9, 0.1, 0.88, 0, 0.71, 0),
      k.doboz(0.16, 0.16, 0.04, -0.18, 0.58, 0.44),
      k.doboz(0.16, 0.16, 0.04, 0.18, 0.58, 0.44),
    ],
  })],

  // Padok sora, tető nélkül. A váró az EGYETLEN épület, aminek a belseje
  // fontosabb a burkánál: ha dobozt kapna, a játékos nem látná, hogy ez egy
  // nyitott terület, ahová le lehet ülni.
  ['varo', (k) => {
    const d = [];
    for (const z of [-0.24, 0.24]) {
      d.push(k.doboz(0.86, 0.06, 0.2, 0, 0.28, z));
      d.push(k.doboz(0.86, 0.2, 0.05, 0, 0.4, z - 0.1, 0.18));
      d.push(k.doboz(0.07, 0.26, 0.07, -0.35, 0.13, z));
      d.push(k.doboz(0.07, 0.26, 0.07, 0.35, 0.13, z));
    }
    return {
      test: d.concat([k.doboz(0.94, 0.05, 0.9, 0, 0.025, 0)]),
      disz: [
        k.doboz(0.9, 0.05, 0.24, 0, 0.33, -0.24),
        k.doboz(0.9, 0.05, 0.24, 0, 0.33, 0.24),
      ],
    };
  }],

  // Pult + fölötte lebegő gömb. A gömb az egyetlen szabadon lebegő elem az
  // egész készletben — ettől lesz „varázslatos információ", nem recepció.
  ['info', (k) => ({
    test: [
      k.henger(0.4, 0.44, 0.42, 10, 0, 0.21, 0),
      k.henger(0.05, 0.05, 0.3, 6, 0, 0.55, 0),
    ],
    disz: [
      k.henger(0.44, 0.44, 0.07, 10, 0, 0.45, 0),
      k.ikoza(0.19, 0, 0.86, 0),
    ],
  })],

  // Állványsor nekitámasztott seprűkkel. A DŐLÉS a lényeg: egy függőleges
  // rúdsor kerítés lenne, a megdöntött rúd viszont „valaki ide tette le".
  ['seprupark', (k) => {
    const d = [
      k.doboz(0.92, 0.06, 0.66, 0, 0.03, 0),
      k.doboz(0.9, 0.07, 0.07, 0, 0.62, -0.2),
      k.doboz(0.07, 0.62, 0.07, -0.42, 0.31, -0.2),
      k.doboz(0.07, 0.62, 0.07, 0.42, 0.31, -0.2),
    ];
    const f = [];
    for (let i = 0; i < 4; i++) {
      const x = -0.3 + i * 0.2;
      // A nyél teteje hátra dől (−z), az alja előre áll ki — a seprűfej ott
      // van, a padlón.
      d.push(k.henger(0.025, 0.03, 0.8, 4, x, 0.38, -0.08, -0.4));
      f.push(k.doboz(0.11, 0.15, 0.08, x, 0.085, 0.07, -0.4));
    }
    return { test: d, disz: f };
  }],

  // Kráterszáj: fölfelé keskenyedő tálforma, benne izzó korong. A kúpos fal
  // adja, hogy ez FORRÁS, nem kályha.
  ['hoforras', (k) => ({
    test: [
      k.henger(0.46, 0.5, 0.16, 12, 0, 0.08, 0),
      k.henger(0.3, 0.46, 0.44, 12, 0, 0.38, 0),
      k.henger(0.34, 0.34, 0.06, 12, 0, 0.58, 0),
    ],
    disz: [
      k.henger(0.25, 0.25, 0.07, 10, 0, 0.63, 0),
      k.okta(0.13, 0, 0.78, 0),
      k.okta(0.08, 0.16, 0.72, 0.1),
    ],
  })],

  // Kristály-hasábok csoportja. Nincs „épület", csak a jég — a jégkamra a
  // hőforrás vizuális ellentéte, ezért nem kaphat hasonló tömeget.
  ['jegkamra', (k) => {
    const helyek = [
      [0, 0, 1.0], [-0.26, -0.2, 0.72], [0.24, -0.18, 0.66],
      [-0.2, 0.24, 0.58], [0.26, 0.22, 0.8],
    ];
    const test = [k.doboz(0.9, 0.08, 0.86, 0, 0.04, 0)];
    const disz = [];
    for (const [x, z, h] of helyek) {
      test.push(k.henger(0.08, 0.13, h * 0.72, 5, x, 0.08 + h * 0.36, z));
      disz.push(k.kup(0.085, h * 0.34, 5, x, 0.08 + h * 0.72 + h * 0.17, z));
    }
    return { test, disz };
  }],

  // Ipari tömb ferde tetővel, kéménnyel és antennával. A karbantartó az
  // egyetlen épület, aminek szemmel láthatóan GÉP-jellege van.
  ['karbantarto', (k) => ({
    test: [
      k.doboz(0.92, 0.54, 0.84, 0, 0.27, 0),
      k.henger(0.07, 0.09, 0.42, 6, -0.3, 0.75, -0.22),
      k.doboz(0.03, 0.4, 0.03, 0.34, 0.74, 0.2),
      k.doboz(0.3, 0.2, 0.06, 0, 0.24, 0.44),
    ],
    disz: [
      k.doboz(0.98, 0.08, 0.98, 0, 0.62, 0, 0.3),
      k.henger(0.11, 0.11, 0.06, 6, -0.3, 0.97, -0.22),
      k.okta(0.07, 0.34, 0.95, 0.2),
    ],
  })],

  // Bódé + hordó. A hordó a jel: itt tárolnak valamit, nem szolgáltatnak.
  ['takarito', (k) => ({
    test: [
      k.doboz(0.58, 0.62, 0.66, -0.16, 0.31, 0),
      k.doboz(0.2, 0.42, 0.05, -0.16, 0.21, 0.34),
      k.henger(0.17, 0.19, 0.44, 8, 0.3, 0.22, 0.06),
    ],
    disz: [
      k.doboz(0.68, 0.08, 0.76, -0.16, 0.66, 0, 0, 0, -0.2),
      k.henger(0.2, 0.2, 0.05, 8, 0.3, 0.46, 0.06),
    ],
  })],

  // Magas sokszögű oszlop, tetején oktaéder. Ez a legmagasabb épület a
  // pályán — az energiamagot a csarnok bármely pontjáról meg kell találni.
  ['energiamag', (k) => ({
    test: [
      k.henger(0.42, 0.5, 0.14, 8, 0, 0.07, 0),
      k.henger(0.2, 0.28, 0.68, 8, 0, 0.48, 0),
      k.henger(0.26, 0.26, 0.06, 8, 0, 0.85, 0),
    ],
    disz: [
      k.okta(0.2, 0, 1.02, 0),
      k.henger(0.34, 0.34, 0.05, 8, 0, 0.34, 0),
      k.henger(0.3, 0.3, 0.05, 8, 0, 0.62, 0),
    ],
  })],

  // Vékony oszlop + tábla. Szándékosan alig van tömege: sok belőle giccs, és
  // ezt a játék a látványban is elmondja.
  ['reklam', (k) => ({
    test: [
      k.henger(0.2, 0.25, 0.1, 8, 0, 0.05, 0),
      k.henger(0.045, 0.055, 0.76, 6, 0, 0.44, 0),
    ],
    disz: [
      // A tábla szándékosan szélesebb az oszlopnál: ez az egyetlen felület,
      // amit a játékos „elolvas" — és ez tölti ki a cella alapterületét is.
      k.doboz(0.64, 0.38, 0.05, 0, 0.94, 0),
      k.okta(0.06, 0, 1.18, 0),
    ],
  })],

  // Lépcsős talapzat + kupola + oszlopok. A VIP-lounge a jutalom-épület:
  // annak is kell látszania, hogy drága volt.
  ['vip', (k) => {
    const test = [
      k.henger(0.5, 0.5, 0.1, 10, 0, 0.05, 0),
      k.henger(0.42, 0.42, 0.1, 10, 0, 0.15, 0),
      k.henger(0.34, 0.34, 0.1, 10, 0, 0.25, 0),
    ];
    // Az oszlopok szögletesek, nem hengeresek: négy hatszögű oszlop 96
    // háromszög lenne, és a kupolával együtt átlépnénk a 300-as keretet —
    // ekkora méretben a különbség úgysem látszik.
    for (const [x, z] of [[-0.26, -0.26], [0.26, -0.26], [-0.26, 0.26], [0.26, 0.26]]) {
      test.push(k.doboz(0.1, 0.42, 0.1, x, 0.51, z, 0, PI * 0.25, 0));
    }
    return {
      test,
      disz: [
        k.doboz(0.78, 0.07, 0.78, 0, 0.75, 0),
        k.kupola(0.3, 8, 3, 0, 0.78, 0),
        k.okta(0.08, 0, 1.14, 0),
      ],
    };
  }],

  // Lapos épület, a tetején kereszt. A kereszt nemzetközi és azonnal olvasható
  // — itt a felismerhetőség fontosabb, mint az egyediség.
  ['orvos', (k) => ({
    test: [
      k.doboz(0.9, 0.5, 0.84, 0, 0.25, 0),
      k.doboz(0.32, 0.4, 0.06, 0, 0.2, 0.44),
      k.doboz(0.72, 0.1, 0.06, 0, 0.44, 0.44),
    ],
    disz: [
      k.doboz(0.96, 0.08, 0.9, 0, 0.54, 0),
      k.doboz(0.42, 0.13, 0.13, 0, 0.72, 0),
      k.doboz(0.13, 0.42, 0.13, 0, 0.72, 0),
    ],
  })],

  // Ferde szalag korláttal és lépcsőfokokkal. A DŐLÉS a jelentés: ez az
  // egyetlen épület, ami nem a saját szintjén szolgál ki, hanem fölfelé visz.
  // (Ezt a típust a többszintes sáv vette fel a katalógusba; a mértan azért
  // van itt, hogy a készlet ne maradjon lyukas, amint az a sáv beolvad.)
  ['lepcso', (k) => {
    const test = [
      k.doboz(0.58, 0.13, 1.1, 0, 0.5, 0, 0.7),      // a szalag
      k.doboz(0.6, 0.14, 0.22, 0, 0.09, 0.45),       // alsó peron
      k.doboz(0.6, 0.14, 0.22, 0, 0.87, -0.45),      // felső peron
      k.doboz(0.5, 0.8, 0.18, 0, 0.47, -0.45),       // a felső peron lába
    ];
    const disz = [
      k.doboz(0.06, 0.18, 1.1, -0.27, 0.62, 0.1, 0.7),
      k.doboz(0.06, 0.18, 1.1, 0.27, 0.62, 0.1, 0.7),
    ];
    // Lépcsőfokok a szalag felszínén: a haladási irány mentén léptetve, a
    // szalagra merőlegesen kiemelve.
    for (let i = -2; i <= 2; i++) {
      const t = i * 0.2;
      disz.push(k.doboz(0.5, 0.05, 0.15, 0, 0.569 - 0.644 * t, 0.766 * t + 0.058, 0.7));
    }
    return { test, disz };
  }],

  // Henger + gyűrűk. A gyűrűk a portálgyűrűk kistestvérei: a lift ugyanaz a
  // technológia kicsiben, és ezt a formanyelv mondja el.
  ['teleportlift', (k) => ({
    test: [
      k.henger(0.44, 0.48, 0.1, 10, 0, 0.05, 0),
      k.henger(0.32, 0.34, 0.82, 10, 0, 0.51, 0),
      k.henger(0.36, 0.36, 0.07, 10, 0, 0.95, 0),
    ],
    disz: [
      k.henger(0.44, 0.44, 0.05, 10, 0, 0.26, 0),
      k.henger(0.44, 0.44, 0.05, 10, 0, 0.52, 0),
      k.henger(0.44, 0.44, 0.05, 10, 0, 0.78, 0),
    ],
  })],

  // ── A V0.4 ÉRKEZÉSI CSATORNÁI ────────────────────────────────────────────
  // A három csatorna-épület a legnagyobb és legdrágább a katalógusban, tehát
  // ezek a látvány TÁJÉKOZÓDÁSI PONTJAI: nem elég, hogy egymástól
  // különböznek, a saját közlekedési módjukat is el kell mondaniuk egy
  // pillantásból. Ezért mindhárom kap egy olyan formát, amit a játékos a
  // valóságból hoz magával — sín, léghajó, parabolatányér.

  // Peronos csarnok: hosszú íves üvegtető oszlopokon, alatta sínpár.
  //
  // A sínek és a talpfák NEM díszek a szó „el is hagyható" értelmében: a
  // játékos ferdén FELÜLRŐL néz, és onnan a tető eltakarja a csarnok belsejét
  // — a két párhuzamos csík viszont kilátszik az ívek között, és az az
  // egyetlen jel, amitől ez vasút lesz, nem pedig egy hosszú piaccsarnok.
  // Ezért a sín a DÍSZ-be (világosabb szín → megcsillan), a talpfa a TEST-be
  // (sötét) került: a kontraszt maga a felismerés.
  ['vasut', (k) => {
    const test = [
      k.doboz(1.0, 0.06, 0.66, 0, 0.03, 0),          // csarnokpadló
      k.doboz(1.0, 0.16, 0.28, 0, 0.14, -0.18),      // megemelt peron
      k.doboz(1.0, 0.05, 0.32, 0, 0.085, 0.12),      // sínágy (ballaszt)
      k.doboz(0.26, 0.28, 0.22, -0.16, 0.36, -0.2),  // forgalmi bódé a peronon
    ];
    // Hat oszlop tartja a tetőt: három-három a peron és a vágány két oldalán.
    // Páratlan szám lenne olcsóbb, de a szimmetrikus pár adja a „csarnok"-ot;
    // egy sor oszlop csak előtető volna.
    for (const x of [-0.36, 0, 0.36]) {
      for (const z of [-0.3, 0.3]) test.push(k.doboz(0.07, 0.5, 0.07, x, 0.37, z));
    }
    // Talpfák: keresztben állnak, tehát felülnézetből létraként olvashatók.
    for (let i = 0; i < 5; i++) {
      test.push(k.doboz(0.1, 0.035, 0.34, -0.4 + i * 0.2, 0.1175, 0.12));
    }
    return {
      test,
      disz: [
        k.ponyva(0.36, 1.0, 10, 0, 0.62, 0, 0, 0, PI * 0.5),  // íves üvegtető
        k.doboz(1.0, 0.04, 0.09, 0, 0.98, 0),                 // tetőgerinc
        k.doboz(1.0, 0.035, 0.05, 0, 0.152, 0.0),             // sín
        k.doboz(1.0, 0.035, 0.05, 0, 0.152, 0.24),            // sín
        k.doboz(1.0, 0.03, 0.06, 0, 0.235, -0.06),            // peronszegély
      ],
    };
  }],

  // Kikötőtorony kinyúló dokkolókarral, fölötte a léghajó teste.
  //
  // Ez az egyetlen típus, ami CSAK EMELETEN épülhet — a játékos tehát
  // rendszerint MAGASBÓL, felülről néz rá, nem oldalról. A felülnézeti
  // sziluettet ezért a hosszú, orros test és a farokvezérsík KERESZTJE adja:
  // mindkettő akkor is olvasható, amikor a torony maga eltűnik a hajótest
  // alatt. A test a DÍSZ-be került, mert világosabb színnel lebegőnek látszik,
  // a sötét torony pedig a földhöz köti.
  ['leghajo', (k) => ({
    test: [
      k.henger(0.3, 0.36, 0.1, 8, -0.08, 0.05, 0),      // kikötő talapzat
      k.henger(0.13, 0.24, 0.56, 8, -0.08, 0.33, 0),    // szűkülő torony
      k.doboz(0.56, 0.07, 0.13, 0.18, 0.62, 0),         // kinyúló dokkolókar
      k.kup(0.07, 0.2, 6, 0.44, 0.74, 0),               // kikötőcsúcs az orrnak
      k.doboz(0.05, 0.34, 0.05, 0.2, 0.44, 0, 0, 0, -0.6), // ferde támasz
      k.doboz(0.26, 0.08, 0.11, -0.06, 0.68, 0),        // gondola
    ],
    disz: [
      k.henger(0.17, 0.17, 0.48, 8, -0.04, 0.88, 0, 0, 0, PI * 0.5),  // hajótest
      k.kup(0.17, 0.3, 8, 0.35, 0.88, 0, 0, 0, -PI * 0.5),            // orr
      k.kup(0.17, 0.28, 8, -0.42, 0.88, 0, 0, 0, PI * 0.5),           // far
      k.doboz(0.12, 0.3, 0.03, -0.46, 0.88, 0),         // függőleges vezérsík
      k.doboz(0.12, 0.03, 0.3, -0.46, 0.88, 0),         // vízszintes vezérsík
      k.okta(0.05, 0.44, 0.87, 0),                      // kikötőfény
    ],
  })],

  // Ferde parabolatányér állványon, körülötte műszeres talapzatok.
  //
  // ⚠️ SZÁNDÉKOSAN NEM GYŰRŰ. A dimenziókapu forgó gyűrűje az `allomas3d.js`
  // saját objektuma és a játék arca; ha az űrkapu is gyűrűt kapna, a játékos a
  // kettőt ugyanannak olvasná, és a legdrágább épületét keresné a portálok
  // között. Ezért az űrkapu VEVŐ, nem átjáró: a megdöntött tányér az égre néz,
  // és a besugárzófej a legmagasabb pontja — a sziluett a rádiócsillagászatot
  // idézi, nem a teleportot.
  ['urkapu', (k) => {
    const test = [
      k.henger(0.42, 0.46, 0.12, 8, 0, 0.06, 0),     // körbejárható talapzat
      k.henger(0.1, 0.16, 0.44, 8, 0, 0.34, 0),      // állványoszlop
      k.doboz(0.52, 0.05, 0.08, 0, 0.145, 0.3),      // kábelcsatorna
    ];
    // Villa: a tányér az X tengely körül billen, tehát a két kar ±x-en áll.
    for (const x of [-0.2, 0.2]) test.push(k.doboz(0.05, 0.28, 0.05, x, 0.62, -0.02));
    // Három műszerdoboz a talapzat peremén: az aszimmetrikus elhelyezés
    // elárulja a tányér nézési irányát is (a két hátsó közt fut a kábel).
    for (const [x, z] of [[-0.34, 0.3], [0.34, 0.3], [0, -0.4]]) {
      test.push(k.doboz(0.13, 0.16, 0.13, x, 0.2, z));
    }
    // A tányér és minden rátétje UGYANAZZAL a −0,55 rad billentéssel készül,
    // különben a perem és a besugárzó lecsúszna a tálról.
    const dolt = -0.55;
    return {
      test,
      disz: [
        k.henger(0.38, 0.13, 0.12, 12, 0, 0.86, -0.02, dolt),   // tál
        k.henger(0.4, 0.4, 0.03, 10, 0, 0.911, -0.051, dolt),   // perem
        k.henger(0.02, 0.02, 0.3, 4, 0, 0.988, -0.098, dolt),   // besugárzó rúd
        k.okta(0.06, 0, 1.116, -0.177),                         // besugárzófej
      ],
    };
  }],
]);

// ══════════════════════════════════════════════════════════════════════════
//  A NYILVÁNOS FELÜLET
// ══════════════════════════════════════════════════════════════════════════

// A hívó jó eséllyel MINDKÉT belépési pontot meghívja. A test és a dísz
// közös normalizáláson megy át, tehát egyszerre kell készülniük — a gyorstár
// nemcsak a dupla munkát spórolja meg, hanem azt is garantálja, hogy a
// két Map ugyanabból az igazításból származik.
const GYORSTAR = new WeakMap();

/** A test és a dísz egyszerre készül, mert közös a normalizálásuk. */
function keszlet(THREE) {
  const kesz = GYORSTAR.get(THREE);
  if (kesz) return kesz;
  const k = kellekek(THREE);
  const testek = new Map();
  const diszek = new Map();
  for (const [kod, terv] of TERVEK) {
    const { test, disz } = terv(k);
    const gT = fuz(THREE, test);
    const gD = fuz(THREE, disz || []);
    egysegdobozba(gT, gD);
    testek.set(kod, gT);
    if (gD) diszek.set(kod, gD);
  }
  const ki = { testek, diszek };
  GYORSTAR.set(THREE, ki);
  return ki;
}

/**
 * Épülettípusonként EGY összefűzött (merged) geometria, az [0..1]×[0..1]×[0..1]
 * egységdobozba normalizálva: x és z a 0..1 alapterület, y a 0-tól felfelé.
 * A hívó ezt skálázza (ep.sz, tipus.magas, ep.m) — tehát a geometria SOSEM
 * tartalmazhat abszolút méretet.
 *
 * A `portal` szándékosan hiányzik: azt az `allomas3d.js` külön kezeli.
 *
 * @param {typeof import('three')} THREE
 * @returns {Map<string, import('three').BufferGeometry>} épületkód -> geometria
 */
export function epuletMertanok(THREE) {
  return keszlet(THREE).testek;
}

/**
 * Ugyanez a tetődíszhez/kiegészítőhöz, ha a típusnak van. Lehet üres Map.
 *
 * ⚠️ A dísz UGYANABBAN a normalizált térben van, mint a test — nem külön
 * egységdobozban. Ugyanazzal a példány-mátrixszal kell rajzolni, csak
 * világosabb színnel; így pontosan a helyére ül.
 *
 * @param {typeof import('three')} THREE
 * @returns {Map<string, import('three').BufferGeometry>} épületkód -> geometria
 */
export function epuletDiszek(THREE) {
  return keszlet(THREE).diszek;
}
