// PORTAL HUB TYCOON — LÉNY-MÉRTAN (fajonként egyedi test és fej).
//
// ── MIÉRT VAN EZ A FÁJL ───────────────────────────────────────────────────
// A v0.1-ben mind a tíz faj ugyanaz a kapszula + gömb volt, csak más színben
// és más méretben. A szimuláció szintjén a fajok tényleg különböznek — más a
// türelmük, a pénzük, az igényük —, de a képernyőn ebből semmi nem látszott:
// a troll egy nagy kapszula volt, a kobold egy kicsi. Márpedig a játék
// ígérete („vicces karakterek, rengeteg apró részlet") pont a tömegen múlik:
// a csarnok akkor él, ha a szemed KIVÁLASZTJA belőle a sárkányt.
//
// A fajok viselkedésbeli különbségét is a sziluett tanítja meg. A boszorkány
// azért parkolja le először a seprűjét, mert van neki — ha ez nem látszik
// rajta, a `seprupark` épület megmagyarázhatatlan marad. Ugyanez a mimik
// ládája és a jégóriás kristályai.
//
// ── MIÉRT KÜLÖN TEST ÉS FEJ ───────────────────────────────────────────────
// A hívó KÉT InstancedMesh-t rajzol, UGYANAZZAL a példány-mátrixszal: a fej
// világosabb színt kap, mint a test. Ez a kétszínűség adja a „figura" érzetet
// két rajzolási hívásból. Következmény: a két geometriát KÖZÖS igazítás
// normalizálja, különben a fej elcsúszna a testtől.
//
// ── A SZERZŐDÉS ───────────────────────────────────────────────────────────
//   • a TALP az y=0-n áll (a test és a fej UNIÓJÁNAK alja),
//   • a teljes magasság kb. 1,2 egység 1,0-s méretszorzónál — a hívó a faj
//     `meret` mezőjével skáláz, tehát a geometriában nincs abszolút méret,
//   • az ELŐRE a lokális +Z. Ez nem ízlés: a hívó
//     `q.setFromAxisAngle(Y, Math.atan2(dx, dz))`-t használ, ami a +Z tengelyt
//     forgatja a haladás irányába. Aki -Z-re tervez orrot, az hátrafelé
//     sétáló lényeket kap.
//
// ── A KÖLTSÉGKERET ────────────────────────────────────────────────────────
// Fajonként 200 háromszög a test és a fej EGYÜTT. 1200 lénynél ez a fő
// terhelés, tehát itt a kapszula (~96 háromszög önmagában) drága luxus lenne:
// szögletes darabokból építkezünk, és gömb helyett ikozaédert használunk.
// A `tools/mertan_szonda.mjs` méri és kiírja.

const PI = Math.PI;

// ══════════════════════════════════════════════════════════════════════════
//  MÉRTAN-KELLÉKEK
//  Szándékosan itt élnek, nem közös modulban: ez a fájl és az
//  `epulet_mertan.js` egymástól függetlenül beépíthető maradjon.
// ══════════════════════════════════════════════════════════════════════════

/** Forgatás a darab SAJÁT origója körül, aztán elhelyezés. Ebben a sorrendben. */
function helyez(g, cx, cy, cz, rx, ry, rz) {
  if (rx) g.rotateX(rx);
  if (ry) g.rotateY(ry);
  if (rz) g.rotateZ(rz);
  g.translate(cx, cy, cz);
  return g;
}

/** Minden darabnál (cx,cy,cz) a darab KÖZEPE — egyetlen konvenció. */
function kellekek(THREE) {
  return {
    doboz: (sx, sy, sz, cx, cy, cz, rx = 0, ry = 0, rz = 0) =>
      helyez(new THREE.BoxGeometry(sx, sy, sz), cx, cy, cz, rx, ry, rz),

    henger: (rf, rl, h, seg, cx, cy, cz, rx = 0, ry = 0, rz = 0) =>
      helyez(new THREE.CylinderGeometry(rf, rl, h, seg), cx, cy, cz, rx, ry, rz),

    /** Kúp: a csúcsa alapból FÖLFELÉ néz. `rx = PI` fordítja lefelé. */
    kup: (r, h, seg, cx, cy, cz, rx = 0, ry = 0, rz = 0) =>
      helyez(new THREE.ConeGeometry(r, h, seg), cx, cy, cz, rx, ry, rz),

    /** Félgömb (kupola/harang): a középpontja (cx,cy,cz), fölfelé domborodik. */
    kupola: (r, seg, sorok, cx, cy, cz) =>
      helyez(new THREE.SphereGeometry(r, seg, sorok, 0, PI * 2, 0, PI * 0.5), cx, cy, cz, 0, 0, 0),

    /** Részleges gömb: a `hanyad` a teljes 180°-ból vett rész (1 = teli félgömb). */
    burok: (r, seg, sorok, hanyad, cx, cy, cz) =>
      helyez(new THREE.SphereGeometry(r, seg, sorok, 0, PI * 2, 0, PI * hanyad), cx, cy, cz, 0, 0, 0),

    okta: (r, cx, cy, cz, reszlet = 0) =>
      helyez(new THREE.OctahedronGeometry(r, reszlet), cx, cy, cz, 0, 0, 0),

    /** Olcsó gömb: 20 háromszög. Ez a lények feje — 1200 példánynál ez a helyes ár. */
    ikoza: (r, cx, cy, cz) =>
      helyez(new THREE.IcosahedronGeometry(r, 0), cx, cy, cz, 0, 0, 0),
  };
}

/** Indexelt összefűzés. Csak `position` és `normal` marad — uv-t nem használunk. */
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
 * Talpra állítás és méretre igazítás — KÖZÖS transzformációval, mert a hívó
 * ugyanazt a példány-mátrixot adja a testnek és a fejnek.
 *
 * A skálázás EGYENLETES: a fajok arányát a saját tervük hordozza, a
 * méretkülönbséget pedig a sim `meret` mezője. Ha itt tengelyenként
 * normalizálnánk, a troll zömöksége és a szellem nyúlánksága egyaránt eltűnne.
 */
function talpraAllit(test, fej, celMagas) {
  test.computeBoundingBox();
  const bb = test.boundingBox.clone();
  fej.computeBoundingBox();
  bb.union(fej.boundingBox);

  const sy = bb.max.y - bb.min.y;
  const sz = sy > 1e-6 ? celMagas / sy : 1;
  const kx = (bb.min.x + bb.max.x) * 0.5;
  const kz = (bb.min.z + bb.max.z) * 0.5;

  for (const g of [test, fej]) {
    g.translate(-kx, -bb.min.y, -kz);
    g.scale(sz, sz, sz);
    g.computeBoundingBox();
    g.computeBoundingSphere();
  }
}

// ══════════════════════════════════════════════════════════════════════════
//  A TERVEK
//  Munkatér: a talp az y≈0-n, az ELŐRE a +Z. A `magas` a kívánt végmagasság;
//  a normalizálás erre igazít, tehát a SZÁMOK ARÁNYA számít.
// ══════════════════════════════════════════════════════════════════════════

const TERVEK = new Map([

  // Kicsi, görnyedt, hegyes fülű. A törzs előredöntése (rotateX) az egész
  // karakter: ettől siet, ahelyett hogy sétálna.
  ['kobold', {
    magas: 1.12,
    epit: (k) => ({
      test: [
        k.doboz(0.12, 0.34, 0.14, -0.11, 0.17, 0),
        k.doboz(0.12, 0.34, 0.14, 0.11, 0.17, 0),
        k.doboz(0.34, 0.4, 0.26, 0, 0.55, 0.03, 0.3),
        k.doboz(0.09, 0.34, 0.1, -0.22, 0.5, 0.06, 0.35),
        k.doboz(0.09, 0.34, 0.1, 0.22, 0.5, 0.06, 0.35),
      ],
      fej: [
        k.ikoza(0.17, 0, 0.87, 0.07),
        k.kup(0.06, 0.2, 4, -0.16, 0.95, 0.05, 0, 0, 0.7),
        k.kup(0.06, 0.2, 4, 0.16, 0.95, 0.05, 0, 0, -0.7),
        k.kup(0.05, 0.13, 4, 0, 0.85, 0.2, PI * 0.5),
      ],
    }),
  }],

  // Lebegő, alul elkeskenyedő „farok", nincs láb. A lefelé fordított kúp
  // csúcsa az y=0-n van: a szerződés szerint a talp ott áll, a lebegést a
  // renderelő emeli meg — így a szellem ugyanazt a mátrixot használja, mint
  // bárki más.
  ['szellem', {
    magas: 1.32,
    epit: (k) => ({
      test: [
        k.kup(0.26, 0.62, 8, 0, 0.31, 0, PI),
        k.kupola(0.28, 8, 3, 0, 0.6, 0),
        k.kup(0.08, 0.24, 4, -0.28, 0.64, 0.02, 0, 0, 1.2),
        k.kup(0.08, 0.24, 4, 0.28, 0.64, 0.02, 0, 0, -1.2),
      ],
      fej: [
        k.burok(0.26, 8, 4, 0.66, 0, 0.92, 0),
      ],
    }),
  }],

  // Hordómellkas, hosszú kar, apró fej. A fej szándékosan pici: a méretarány
  // önmagában komikus, és messziről is olvasható.
  ['troll', {
    magas: 1.16,
    epit: (k) => ({
      test: [
        k.doboz(0.17, 0.3, 0.2, -0.14, 0.15, 0),
        k.doboz(0.17, 0.3, 0.2, 0.14, 0.15, 0),
        k.henger(0.3, 0.24, 0.5, 8, 0, 0.6, 0),
        k.doboz(0.13, 0.62, 0.14, -0.34, 0.52, 0.02, 0, 0, 0.14),
        k.doboz(0.13, 0.62, 0.14, 0.34, 0.52, 0.02, 0, 0, -0.14),
      ],
      fej: [
        k.ikoza(0.14, 0, 0.94, 0.02),
        k.kup(0.04, 0.13, 3, -0.07, 0.92, 0.12, PI),
        k.kup(0.04, 0.13, 3, 0.07, 0.92, 0.12, PI),
      ],
    }),
  }],

  // Csúcsos kalap (a FEJ geometriájában, hogy a világosabb szín a kalapra is
  // ráessen), kúpos köpeny, és a hátára kötött seprű — enélkül a
  // `seprupark` épület megmagyarázhatatlan.
  ['boszorkany', {
    magas: 1.34,
    epit: (k) => ({
      test: [
        k.henger(0.13, 0.34, 0.78, 8, 0, 0.39, 0),
        k.doboz(0.08, 0.34, 0.09, -0.2, 0.62, 0.05, 0.4),
        k.doboz(0.08, 0.34, 0.09, 0.2, 0.62, 0.05, 0.4),
        k.doboz(0.035, 0.56, 0.035, 0.24, 0.52, -0.14, -0.3),
        k.doboz(0.09, 0.13, 0.08, 0.28, 0.24, -0.07, -0.3),
      ],
      fej: [
        k.ikoza(0.15, 0, 0.9, 0.02),
        k.henger(0.3, 0.3, 0.035, 8, 0, 1.0, 0),
        k.kup(0.2, 0.42, 8, 0, 1.22, 0),
      ],
    }),
  }],

  // Szarvak, széles váll, farok. A váll a legszélesebb pont: a démon
  // sziluettje fölfelé nyílik, a trollé lefelé — így két nagy testű faj sem
  // keverhető össze.
  ['demon', {
    magas: 1.26,
    epit: (k) => ({
      test: [
        k.doboz(0.14, 0.3, 0.16, -0.13, 0.15, 0),
        k.doboz(0.14, 0.3, 0.16, 0.13, 0.15, 0),
        k.doboz(0.36, 0.42, 0.26, 0, 0.5, 0),
        k.doboz(0.58, 0.16, 0.28, 0, 0.76, 0),
        k.doboz(0.11, 0.4, 0.12, -0.3, 0.56, 0.02, 0, 0, 0.12),
        k.doboz(0.11, 0.4, 0.12, 0.3, 0.56, 0.02, 0, 0, -0.12),
        k.kup(0.06, 0.4, 4, 0, 0.45, -0.24, -0.9),
      ],
      fej: [
        k.ikoza(0.17, 0, 0.96, 0.02),
        k.kup(0.055, 0.26, 4, -0.12, 1.12, -0.02, 0, 0, 0.45),
        k.kup(0.055, 0.26, 4, 0.12, 1.12, -0.02, 0, 0, -0.45),
      ],
    }),
  }],

  // Szögletes, kristályos, tömör. Egyetlen ferde él sincs rajta a
  // jégtüskéken kívül — a jégóriás a készlet „minden lapos" pólusa.
  ['jegorias', {
    magas: 1.24,
    epit: (k) => ({
      test: [
        k.doboz(0.19, 0.3, 0.22, -0.15, 0.15, 0),
        k.doboz(0.19, 0.3, 0.22, 0.15, 0.15, 0),
        k.doboz(0.5, 0.5, 0.32, 0, 0.62, 0, 0, 0.12, 0),
        k.doboz(0.16, 0.5, 0.18, -0.33, 0.6, 0, 0, 0, 0.08),
        k.doboz(0.16, 0.5, 0.18, 0.33, 0.6, 0, 0, 0, -0.08),
        k.okta(0.13, -0.28, 0.88, 0),
        k.okta(0.13, 0.28, 0.88, 0),
      ],
      fej: [
        k.doboz(0.3, 0.26, 0.28, 0, 1.0, 0.02, 0, 0.25, 0),
        k.kup(0.05, 0.22, 4, 0, 1.22, -0.02),
        k.kup(0.04, 0.16, 4, -0.13, 1.18, -0.06, 0, 0, 0.3),
        k.kup(0.04, 0.16, 4, 0.13, 1.18, -0.06, 0, 0, -0.3),
      ],
    }),
  }],

  // Kupola + lelógó csápok. Itt a FEJ a harang, a TEST a csápok: így a
  // világosabb szín a kupolára esik, ami a medúza egyetlen fényes felülete.
  ['meduza', {
    magas: 1.15,
    epit: (k) => {
      const test = [k.henger(0.3, 0.34, 0.09, 10, 0, 0.68, 0)];
      for (let i = 0; i < 6; i++) {
        const sz = (i / 6) * PI * 2;
        test.push(k.kup(0.045, 0.64, 4, Math.cos(sz) * 0.2, 0.32, Math.sin(sz) * 0.2, PI));
      }
      return {
        test,
        fej: [k.kupola(0.36, 10, 3, 0, 0.72, 0), k.okta(0.07, 0, 1.08, 0)],
      };
    },
  }],

  // Nyitott könyv alak. A TEST a borító, a FEJ a lapok — a világosabb szín
  // így pont oda kerül, ahová való. A lelógó könyvjelző nem dísz: a lebegő
  // fajoknak is le kell érniük az y=0-ig, különben a talp-szerződés bukik,
  // és a lebegtetést a renderelő végzi.
  ['elokonyv', {
    magas: 1.18,
    epit: (k) => ({
      test: [
        k.doboz(0.44, 0.05, 0.52, -0.19, 0.88, 0, 0, 0, -0.42),
        k.doboz(0.44, 0.05, 0.52, 0.19, 0.88, 0, 0, 0, 0.42),
        k.doboz(0.08, 0.1, 0.52, 0, 0.8, 0),
        k.doboz(0.07, 0.8, 0.02, 0.05, 0.4, -0.2),
      ],
      fej: [
        k.doboz(0.4, 0.045, 0.46, -0.18, 0.93, 0, 0, 0, -0.38),
        k.doboz(0.4, 0.045, 0.46, 0.18, 0.93, 0, 0, 0, 0.38),
        k.okta(0.045, -0.09, 0.96, 0.2),
        k.okta(0.045, 0.09, 0.96, 0.2),
      ],
    }),
  }],

  // Láda, felnyíló fedél, fogak. A FEJ a fedél: amikor a hívó világosabbra
  // festi, a nyitott száj belseje világít — ez a faj egyetlen poénja.
  ['mimik', {
    magas: 1.05,
    epit: (k) => {
      const test = [
        k.doboz(0.6, 0.44, 0.46, 0, 0.3, 0),
        k.doboz(0.1, 0.12, 0.1, -0.2, 0.06, 0.16),
        k.doboz(0.1, 0.12, 0.1, 0.2, 0.06, 0.16),
        k.doboz(0.08, 0.46, 0.48, -0.2, 0.3, 0),
        k.doboz(0.08, 0.46, 0.48, 0.2, 0.3, 0),
      ];
      const fej = [
        k.doboz(0.62, 0.11, 0.46, 0, 0.78, -0.1, -0.7),
        k.okta(0.05, -0.14, 0.72, 0.14),
        k.okta(0.05, 0.14, 0.72, 0.14),
      ];
      for (let i = 0; i < 4; i++) {
        const x = -0.18 + i * 0.12;
        test.push(k.kup(0.04, 0.12, 3, x, 0.58, 0.19));
        fej.push(k.kup(0.04, 0.12, 3, x, 0.66, 0.19, PI));
      }
      return { test, fej };
    },
  }],

  // Hosszú nyak, szárnyak, négy láb, farok. A legösszetettebb faj — de
  // ritka és nagy, tehát pont ő az, akin a részlet meglátszik.
  ['sarkany', {
    magas: 1.3,
    epit: (k) => ({
      test: [
        k.doboz(0.11, 0.28, 0.13, -0.19, 0.14, -0.2),
        k.doboz(0.11, 0.28, 0.13, 0.19, 0.14, -0.2),
        k.doboz(0.11, 0.28, 0.13, -0.19, 0.14, 0.2),
        k.doboz(0.11, 0.28, 0.13, 0.19, 0.14, 0.2),
        k.doboz(0.4, 0.32, 0.6, 0, 0.45, 0),
        k.doboz(0.2, 0.3, 0.2, 0, 0.7, 0.2, -0.5),
        k.doboz(0.17, 0.28, 0.17, 0, 0.92, 0.34, -0.9),
        k.kup(0.13, 0.6, 4, 0, 0.5, -0.56, -PI * 0.5),
        k.doboz(0.5, 0.05, 0.34, -0.36, 0.78, -0.05, 0, 0.3, 0.5),
        k.doboz(0.5, 0.05, 0.34, 0.36, 0.78, -0.05, 0, -0.3, -0.5),
      ],
      fej: [
        k.doboz(0.22, 0.2, 0.26, 0, 1.06, 0.46),
        k.doboz(0.15, 0.13, 0.2, 0, 1.02, 0.64),
        k.kup(0.04, 0.2, 4, -0.08, 1.2, 0.4, -0.3),
        k.kup(0.04, 0.2, 4, 0.08, 1.2, 0.4, -0.3),
      ],
    }),
  }],
]);

// ══════════════════════════════════════════════════════════════════════════
//  A NYILVÁNOS FELÜLET
// ══════════════════════════════════════════════════════════════════════════

const GYORSTAR = new WeakMap();

/**
 * Fajonkénti test- és fejgeometria. Mindegyik úgy pozicionálva, hogy a lény
 * TALPA az y=0-n álljon, és a magassága kb. 1,2 egység legyen 1,0-s
 * méretszorzónál — a hívó a faj `meret` mezőjével skáláz.
 *
 * ⚠️ A `test` és a `fej` UGYANAZT a példány-mátrixot várja, csak más színt:
 * közös igazításon mentek át. Az ELŐRE a lokális +Z.
 *
 * @param {typeof import('three')} THREE
 * @returns {Map<string, {test: import('three').BufferGeometry,
 *                        fej: import('three').BufferGeometry}>}
 */
export function lenyMertanok(THREE) {
  const kesz = GYORSTAR.get(THREE);
  if (kesz) return kesz;
  const k = kellekek(THREE);
  const ki = new Map();
  for (const [kod, terv] of TERVEK) {
    const { test, fej } = terv.epit(k);
    const gT = fuz(THREE, test);
    const gF = fuz(THREE, fej);
    talpraAllit(gT, gF, terv.magas);
    ki.set(kod, { test: gT, fej: gF });
  }
  GYORSTAR.set(THREE, ki);
  return ki;
}
