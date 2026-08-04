// AGE OF THE CRYSTALS — ÉPÜLET-SZILUETTEK (v0.10 · a doboz-korszak vége).
//
// Ez a fájl NEM réteg: nincs `frissit()`-je és nem olvas simet. Egyetlen dolgot
// ad a `gazdasag3d.js`-nek — TÍPUSONKÉNT EGY kész `BufferGeometry`-t —, és
// vállalja, hogy a tábla teljes.
//
// ── MIÉRT KÜLÖN FÁJL, ÉS MIÉRT ADAT ───────────────────────────────────────
// Eddig minden épület ugyanaz a doboz volt, mert a v0.3 fejlécében ez tudatos
// döntés volt („egy ideiglenes szép modell csak félrevezetne"). A v0.5 óta
// tizenegy épülettípus van, és a doboz már nem egyszerűsítés, hanem hiányzó
// információ: a játékos a saját bázisán sem tudja megmondani, melyik ház a
// laktanya és melyik az istálló. A formák viszont HOSSZÚ, statikus adatok — ha
// a rajzoló réteg közé keverednének, az a réteg forró ciklusa lenne olvashatatlan.
//
// ── A RÖVID TÁBLA CSAPDÁJA — ITT NEM LEHET ELBÚJNI ────────────────────────
// A projekt legdrágább hibafajtája az `EPULET`-tel indexelt tábla, ami rövidebb
// az enumnál: a `tabla[10]` `undefined`-ot ad, abból `NaN` lesz, a `NaN` minden
// összehasonlításban hamis — és a rendszer CSENDBEN rossz lesz, bitre
// reprodukálhatóan (lásd a v0.9/2 `LATOTAV`-ját).
//
// Ezért a formák NEM tömbben, hanem az `EPULET` KULCSAIVAL nevesített
// objektumban vannak, és a tömböt a modul betöltésekor az enumból építjük fel.
// Egy kimaradt típus ilyenkor nem `undefined`, hanem DOBOTT HIBA az indulásnál —
// a leghangosabb visszajelzés, amit adni tudunk. Ugyanígy hibás egy olyan
// kulcs, ami nincs az enumban (elgépelt név, átnevezett típus).
//
// A `tools/kiadas_ellenorzo.mjs` tábla-listája a `src/sim/` alatti táblákat őrzi;
// ez a fájl a render oldalon ugyanazt a fogadalmat SAJÁT MAGA tartja be.
//
// ── AMI SZERZŐDÉS, ÉS AMIT NEM SZABAD MEGSÉRTENI ──────────────────────────
//   • `EP_MERET` — a sim ebből számol járhatóságot. A sziluett vízszintes
//     kiterjedése ezért SEHOL nem lóghat túl az alapterületén; a `formaOsszefoglalo()`
//     ezt meg is méri, hogy ne ígéret maradjon (az eresz is beleszámít).
//   • `EP_MAGASSAG` — a torony azért kap 2,4-es szorzót, hogy LÁTSZÓDJON, miért
//     építették. A formák a `m · 0,8 · EP_MAGASSAG` keretbe épülnek; ami ezen
//     túlér, az kizárólag zászló vagy zászlórúd (a központé a legmagasabb dísz,
//     mert a bázis magja — de a torony teste így is fölé nő).
//
// ── HOGYAN OLCSÓ ──────────────────────────────────────────────────────────
// Minden típus EGYETLEN, indexeletlen geometriává olvad össze (`osszefuz`),
// tehát típusonként egy `InstancedMesh` és egy rajzhívás elég. A geometriák a
// betöltéskor egyszer épülnek fel; futásidőben SOHA nem keletkezik új geometria
// vagy anyag.
//
// ── SZÍNEZÉS: MIÉRT NEM `instanceColor` ───────────────────────────────────
// A csapatszín eddig az EGÉSZ dobozt festette. Egy tetőt, kőfalat és
// gerendavázat viszont nem lehet egyetlen példány-színnel kifesteni — ha
// mindent a csapatszínnel szorzunk, a barna tető kékesbarna sár lesz.
//
// Ezért két CSÚCS-attribútum van (`alapSzin`, `csapatArany`) és egy PÉLDÁNY-
// attribútum (`csapatAdat`: rgb = csapatszín, a = fényerő), a keverés pedig
// LINEÁRIS INTERPOLÁCIÓ, nem szorzás:
//
//     szin = mix(alapSzin, csapatSzin, csapatArany) · fenyero
//
//   csapatArany = 0     — kő, gerenda, szalma: a saját anyaga marad
//   csapatArany ≈ 0,45  — tetők: felismerhetően csapatszínbe hajlanak, de
//                         tető-anyagúak maradnak (EZ adja a távoli olvashatóságot)
//   csapatArany = 1     — zászló, ponyva, kapu: TISZTA csapatszín
//
// A `fenyero` az építkezés visszajelzése (az épülő ház fakóbb) — ugyanaz a
// jelzés, ami a doboz-korszakban is volt, csak most nem nyeli el a formát.

import { THREE } from './core3d.js';
import { EPULET, EP_MERET, EP_MAGASSAG } from '../sim/epuletek.js';

/** Anyag-paletta (sRGB). Szándékosan KÖZÉPTÓNUSÚ: a `toneMapped:false` anyag
 *  mellett a világos pasztell a 2,15-ös napfényben fehérre égne ki. */
const SZIN = {
  KO: 0x8b9199,
  KO_SOTET: 0x5e646c,
  VAKOLAT: 0xb0a184,
  FA: 0x6b4a30,
  DESZKA: 0x93703f,
  CSEREP: 0x8f3a28,
  NAD: 0x94763f,
  ZSINDELY: 0x574433,
  SZALMA: 0xa98d45,
  VAS: 0x4e545c,
  FOLD: 0x6f6046,
  /** Csapat-elem: az `alapSzin` ilyenkor közömbös, a `csapatArany` 1. */
  CSAPAT: 0xffffff,
};

/** Tető-keverés: ennyire hajlik a tető a csapatszínbe. */
const TETO_CS = 0.45;

// ── FORMA-ÉPÍTŐ ────────────────────────────────────────────────────────────

/**
 * Egy épület alkatrészeinek gyűjtője. A darabok VILÁG-MÉRETBEN épülnek (a
 * geometria már a végleges méretű), így a példány-mátrix tiszta eltolás marad,
 * és a vékony gerendák nem torzulnak el a nem egyenletes skálázástól.
 *
 * Koordináta: az origó az alapterület KÖZEPE a talajon, +y felfelé. A `doboz`
 * és társai `y` paramétere a darab TALPA, nem a közepe — így a méretek
 * egymásra rakhatók anélkül, hogy fejben feleznénk.
 */
class Forma {
  /** @param {number} m alapterület cellában @param {number} magas magasság-keret */
  constructor(m, magas) {
    this.m = m;
    this.H = magas;
    /** Fél-szélesség: az eresz eddig érhet (a cellahatár `m/2`). */
    this.f = m * 0.46;
    this.reszek = [];
  }

  /** Kész, már elhelyezett geometria hozzáadása. */
  elem(geo, szin, cs = 0) {
    this.reszek.push({ geo, szin, cs });
    return this;
  }

  /** Doboz. `x,y,z` a TALP középpontja. */
  doboz(sx, sy, sz, x, y, z, szin, cs = 0) {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    g.translate(x, y + sy * 0.5, z);
    return this.elem(g, szin, cs);
  }

  /**
   * Hasáb: 2D profil kihúzva a Z tengely mentén. Ez adja a nyeregtetőt és a
   * rézsűs falat — dobozból egyik sem rakható ki.
   * @param {number[]} profil `[x0,y0, x1,y1, …]` KONVEX, +Z felől nézve
   *   óramutatóval ELLENTÉTES körüljárással
   * @param {number} forgY forgatás az Y körül (π/2 → a gerinc X irányba fordul)
   */
  hasab(profil, melyseg, x, y, z, szin, cs = 0, forgY = 0) {
    const g = hasabGeo(profil, melyseg);
    if (forgY) g.rotateY(forgY);
    g.translate(x, y, z);
    return this.elem(g, szin, cs);
  }

  /** Henger / csonkakúp álló tengellyel. `y` a talp. */
  henger(rAlso, rFelso, mag, oldal, x, y, z, szin, cs = 0, zart = true) {
    const g = new THREE.CylinderGeometry(rFelso, rAlso, mag, oldal, 1, !zart);
    g.translate(x, y + mag * 0.5, z);
    return this.elem(g, szin, cs);
  }

  /** Gúla (n oldalú kúp). `forgY = π/4` + 4 oldal → tengely-igazított négyzet alap. */
  gula(r, mag, oldal, x, y, z, szin, cs = 0, forgY = 0) {
    const g = new THREE.ConeGeometry(r, mag, oldal, 1, true);
    if (forgY) g.rotateY(forgY);
    g.translate(x, y + mag * 0.5, z);
    return this.elem(g, szin, cs);
  }

  /**
   * Zászlórúd + lobogó. Öt épület használja, és pont ez a legfontosabb
   * csapat-jelölő: kizoomolva a tetők árnyalata még összemosódhat, egy tiszta
   * csapatszínű folt viszont nem.
   */
  zaszlo(x, y, z, rudMag, lobogo = 0.26) {
    this.doboz(0.075, rudMag, 0.075, x, y, z, SZIN.FA, 0);
    this.doboz(0.42, lobogo, 0.05, x + 0.24, y + rudMag - lobogo - 0.06, z, SZIN.CSAPAT, 1);
    return this;
  }
}

/**
 * Profil kihúzása Z mentén. Indexeletlen háromszögek, KÉZZEL helyes
 * körüljárással — a normálisokat úgyis az összefűzés számolja (laposan), de a
 * hátlap-eldobás a körüljáráson múlik: rossz sorrendnél a tető belülről
 * látszana, kívülről nem.
 */
function hasabGeo(profil, melyseg) {
  const db = profil.length / 2;
  const h = melyseg * 0.5;
  // oldalak: db darab négyszög (2 háromszög), lapok: 2 × (db-2) háromszög
  const tri = db * 2 + (db - 2) * 2;
  const poz = new Float32Array(tri * 9);
  let o = 0;
  const ki = (x, y, z) => { poz[o++] = x; poz[o++] = y; poz[o++] = z; };

  for (let i = 0; i < db; i++) {
    const ax = profil[i * 2], ay = profil[i * 2 + 1];
    const j = (i + 1) % db;
    const bx = profil[j * 2], by = profil[j * 2 + 1];
    // A=(a,+h) D=(a,−h) C=(b,−h) B=(b,+h): (A,D,C) és (A,C,B) kifelé néz.
    ki(ax, ay, h); ki(ax, ay, -h); ki(bx, by, -h);
    ki(ax, ay, h); ki(bx, by, -h); ki(bx, by, h);
  }
  for (let i = 1; i < db - 1; i++) {
    ki(profil[0], profil[1], h);
    ki(profil[i * 2], profil[i * 2 + 1], h);
    ki(profil[i * 2 + 2], profil[i * 2 + 3], h);
    ki(profil[0], profil[1], -h);
    ki(profil[i * 2 + 2], profil[i * 2 + 3], -h);
    ki(profil[i * 2], profil[i * 2 + 1], -h);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(poz, 3));
  return geo;
}

const _szinSegito = new THREE.Color();

/**
 * Az alkatrészek EGY indexeletlen geometriává olvasztása, csúcs-attribútumokkal.
 *
 * Indexeletlen, mert a `computeVertexNormals()` így LAPOS árnyalást ad — pont
 * azt, amit a `props3d.js` fáin és a kristályokon látunk. Indexelt geometrián a
 * megosztott csúcsok normálisai átlagolódnának, és az élek elkenődnének.
 */
function osszefuz(reszek) {
  let n = 0;
  for (const r of reszek) {
    if (r.geo.index) r.geo = r.geo.toNonIndexed();
    n += r.geo.attributes.position.count;
  }
  const poz = new Float32Array(n * 3);
  const alap = new Float32Array(n * 3);
  const arany = new Float32Array(n);
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
      arany[v + i] = r.cs;
    }
    v += db;
    r.geo.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(poz, 3));
  geo.setAttribute('alapSzin', new THREE.BufferAttribute(alap, 3));
  geo.setAttribute('csapatArany', new THREE.BufferAttribute(arany, 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

// ── A TIZENEGY SZILUETT ────────────────────────────────────────────────────
// Az `EPULET` kulcsaival nevesítve. Minden építő ugyanazt kapja: `(f, m, H)`,
// ahol `f` a fél-szélesség (eresz-határ), `m` az alapterület, `H` a
// magasság-keret. A számok ezekből származnak, nem fixek — így egy `EP_MERET`
// vagy `EP_MAGASSAG` változás magától átméretezi a formát.
//
// A FELISMERHETŐSÉG FELÜLNÉZETBŐL dől el: az RTS-kamera meredek, tehát a
// játékos jellemzően a TETŐT és az udvart látja, nem a homlokzatot. Ezért
// minden típus tetőformája vagy udvari kelléke más — nem a homlokzat-díszek.

const FORMAK = {
  /** KÖZPONT — a bázis magja: gúla-tető + a legmagasabb csapatzászló. */
  KOZPONT(f, m, H) {
    const e = new Forma(m, H);
    e.doboz(2 * f, 0.22, 2 * f, 0, 0, 0, SZIN.KO);
    e.doboz(2 * f - 0.34, 1.0, 2 * f - 0.34, 0, 0.22, 0, SZIN.VAKOLAT);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        e.doboz(0.24, 1.24, 0.24, sx * (f - 0.12), 0, sz * (f - 0.12), SZIN.FA);
      }
    }
    // Négyoldalú gúla 45°-kal elfordítva: a sarkai a négyzet sarkaira esnek,
    // tehát az eresz fél-oldala pont `f`.
    //
    // ⚠️ A csapat-keverés itt SZÁNDÉKOSAN majdnem nulla, és ez MÉRT eredmény:
    // a telített cserépvörös 0,45-ös keverése a kék csapatszínnel LILÁT ad —
    // se nem tető, se nem csapatszín. A sötét, tompa tetők (zsindely, nád)
    // ezzel szemben szépen felveszik a csapat árnyalatát. A központ ezért az
    // EGYETLEN vörös tető a roszterben (önmagában is felismerhető jel), a
    // csapatot pedig a pálya legnagyobb zászlaja és a kapu viszi.
    e.gula(f * 1.4142, 1.1, 4, 0, 1.24, 0, SZIN.CSEREP, 0.12, Math.PI / 4);
    e.zaszlo(0, 2.19, 0, 0.66, 0.36);
    e.doboz(0.55, 0.66, 0.09, 0, 0.22, f - 0.22, SZIN.CSAPAT, 1);
    e.doboz(0.8, 0.12, 0.28, 0, 0, f - 0.06, SZIN.KO);
    return e;
  },

  /** RAKTÁR — félig fedett rakodóudvar: felülről a LÁDÁK látszanak, nem tető. */
  RAKTAR(f, m, H) {
    const e = new Forma(m, H);
    e.doboz(2 * f, 0.14, 2 * f, 0, 0, 0, SZIN.DESZKA);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        e.doboz(0.14, 0.8, 0.14, sx * (f - 0.09), 0.14, sz * (f - 0.09), SZIN.FA);
      }
    }
    // A ponyva csak a bal felét fedi — a jobb oldali rakomány felülről látszik.
    e.hasab([-0.66, 0, 0.66, 0, 0, 0.42], 2 * f + 0.1, -0.24, 0.94, 0, SZIN.NAD, TETO_CS);
    e.doboz(0.44, 0.44, 0.44, 0.48, 0.14, -0.42, SZIN.DESZKA);
    e.doboz(0.34, 0.34, 0.34, 0.5, 0.58, -0.44, SZIN.CSAPAT, 1);
    e.doboz(0.4, 0.4, 0.4, 0.5, 0.14, 0.36, SZIN.FA);
    e.henger(0.19, 0.19, 0.42, 6, 0.02, 0.14, 0.62, SZIN.DESZKA);
    return e;
  },

  /** FAL — rézsűs kőtömb, négy saroktoronnyal: sorba rakva szaggatott pártázat. */
  FAL(f, m, H) {
    const e = new Forma(m, H);
    e.hasab([-f, 0, f, 0, f - 0.08, 0.4, -f + 0.08, 0.4], 2 * f, 0, 0, 0, SZIN.KO);
    // A koszorú az EGYETLEN csapat-jelölő a falon: zászlót nem bír el, de a
    // gazdátlan kőfal a pálya közepén használhatatlan információ.
    e.doboz(2 * f - 0.04, 0.07, 2 * f - 0.04, 0, 0.4, 0, SZIN.KO_SOTET, 0.55);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        e.doboz(0.26, 0.15, 0.26, sx * 0.29, 0.47, sz * 0.29, SZIN.KO);
      }
    }
    return e;
  },

  /** KAPU — két pillér és egy áthidaló: a NYÍLÁS a jel, nem a tömeg. */
  KAPU(f, m, H) {
    const e = new Forma(m, H);
    for (const sx of [-1, 1]) e.doboz(0.28, 0.47, 2 * f, sx * (f - 0.14), 0, 0, SZIN.KO);
    e.doboz(2 * f, 0.12, 0.52, 0, 0.47, 0, SZIN.FA);
    e.doboz(0.34, 0.16, 0.06, 0, 0.59, 0.14, SZIN.CSAPAT, 1);
    return e;
  },

  /** HÁZ — kicsi, meredek nyeregtető + KÉMÉNY. A kémény a fő megkülönböztető. */
  HAZ(f, m, H) {
    const e = new Forma(m, H);
    e.doboz(2 * f, 0.12, 2 * f, 0, 0, 0, SZIN.KO);
    e.doboz(2 * f - 0.12, 0.62, 2 * f - 0.12, 0, 0.12, 0, SZIN.VAKOLAT);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        e.doboz(0.12, 0.68, 0.12, sx * (f - 0.08), 0.12, sz * (f - 0.08), SZIN.FA);
      }
    }
    e.hasab([-f - 0.06, 0, f + 0.06, 0, 0, 0.66], 2 * f + 0.12, 0, 0.74, 0, SZIN.NAD, TETO_CS);
    e.doboz(0.18, 0.44, 0.18, -0.42, 1.02, 0.3, SZIN.KO_SOTET);
    e.doboz(0.28, 0.42, 0.07, 0, 0.12, f - 0.03, SZIN.CSAPAT, 1);
    return e;
  },

  /** LAKTANYA — zárt csarnok + GYAKORLÓUDVAR bábuval és lándzsaállvánnyal. */
  LAKTANYA(f, m, H) {
    const e = new Forma(m, H);
    e.doboz(2 * f, 0.18, 2 * f, 0, 0, 0, SZIN.KO);
    const cz = -0.53;                      // a csarnok középvonala
    e.doboz(2 * f - 0.18, 1.15, 1.5, 0, 0.18, cz, SZIN.VAKOLAT);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        e.doboz(0.2, 1.2, 0.2, sx * (f - 0.13), 0.18, cz + sz * 0.66, SZIN.FA);
      }
    }
    // A gerinc X irányba fordul: a hosszú oldal a bejárat felé néz.
    e.hasab([-0.84, 0, 0.84, 0, 0, 0.68], 2 * f - 0.06, 0, 1.33, cz, SZIN.ZSINDELY, TETO_CS, Math.PI / 2);
    e.doboz(0.52, 0.78, 0.08, 0, 0.95, 0.26, SZIN.CSAPAT, 1);
    // Gyakorlóbábu: felülnézetből egy „T" az udvaron — csak a laktanyán van.
    e.doboz(0.16, 0.82, 0.16, 0.58, 0.18, 0.88, SZIN.FA);
    e.doboz(0.82, 0.13, 0.13, 0.58, 0.82, 0.88, SZIN.FA);
    e.doboz(0.22, 0.22, 0.22, 0.58, 0.94, 0.88, SZIN.SZALMA);
    // Lándzsaállvány.
    e.doboz(0.66, 0.09, 0.12, -0.62, 0.62, 0.92, SZIN.FA);
    for (const dx of [-0.18, 0.18]) e.doboz(0.06, 0.95, 0.06, -0.62 + dx, 0.18, 0.92, SZIN.VAS);
    return e;
  },

  /** ÍJÁSZDA — féltetős lőállás + HÁROM szalma céltábla sorban. */
  IJASZDA(f, m, H) {
    const e = new Forma(m, H);
    e.doboz(2 * f, 0.14, 2 * f, 0, 0, 0, SZIN.FOLD);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        e.doboz(0.16, 1.28, 0.16, sx * (f - 0.16), 0.14, -0.78 + sz * 0.44, SZIN.FA);
      }
    }
    // Ferde deszkatető: dobozból, X körül megdöntve. A lejtés önmagában is
    // elkülöníti a nyeregtetős épületektől.
    const teto = new THREE.BoxGeometry(2 * f - 0.14, 0.1, 1.34);
    teto.rotateX(0.32);
    teto.translate(0, 1.5, -0.78);
    e.elem(teto, SZIN.NAD, TETO_CS);
    e.doboz(2 * f - 0.5, 0.5, 0.14, 0, 0.14, -0.3, SZIN.DESZKA);
    for (const dx of [-0.86, 0, 0.86]) {
      e.gula(0.36, 0.56, 6, dx, 0.14, 0.86, SZIN.SZALMA);
      e.doboz(0.2, 0.06, 0.2, dx, 0.6, 0.86, SZIN.CSAPAT, 1);
    }
    e.zaszlo(-f + 0.2, 1.42, -1.12, 0.55, 0.24);
    return e;
  },

  /** ISTÁLLÓ — hosszú boksz-sor + KARÁM és szénakazal. A kerítés a jel. */
  ISTALLO(f, m, H) {
    const e = new Forma(m, H);
    e.doboz(2 * f, 0.12, 2 * f, 0, 0, 0, SZIN.FOLD);
    const cz = -0.8;
    e.doboz(2 * f - 0.2, 1.0, 1.1, 0, 0.12, cz, SZIN.DESZKA);
    e.hasab([-0.64, 0, 0.64, 0, 0, 0.52], 2 * f - 0.1, 0, 1.12, cz, SZIN.ZSINDELY, TETO_CS, Math.PI / 2);
    for (const dx of [-0.62, 0.62]) e.doboz(0.42, 0.62, 0.07, dx, 0.12, cz + 0.58, SZIN.FA);
    // Karám: két oldalrúd + egy elülső rúd, négy oszloppal. Felülnézetből ez
    // egy körbekerített udvar — semelyik másik épületnél nincs ilyen.
    e.doboz(2 * f - 0.2, 0.08, 0.08, 0, 0.56, 1.2, SZIN.FA);
    for (const sx of [-1, 1]) {
      e.doboz(0.08, 0.08, 1.3, sx * (f - 0.1), 0.56, 0.58, SZIN.FA);
      e.doboz(0.12, 0.68, 0.12, sx * (f - 0.1), 0.12, 1.2, SZIN.FA);
      e.doboz(0.12, 0.68, 0.12, sx * (f - 0.1), 0.12, -0.04, SZIN.FA);
    }
    e.gula(0.44, 0.6, 6, 0.62, 0.12, 0.55, SZIN.SZALMA);
    e.doboz(0.52, 0.18, 0.3, -0.66, 0.12, 0.72, SZIN.FA);
    e.zaszlo(-f + 0.22, 1.12, cz - 0.5, 0.6, 0.26);
    return e;
  },

  /** OSTROMMŰHELY — nyitott ácsváz, két NAGY KERÉK és egy faltörő gerenda. */
  OSTROMMUHELY(f, m, H) {
    const e = new Forma(m, H);
    e.doboz(2 * f, 0.12, 2 * f, 0, 0, 0, SZIN.FOLD);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        e.doboz(0.26, 1.62, 0.26, sx * (f - 0.15), 0.12, sz * (f - 0.15), SZIN.FA);
      }
    }
    for (const sz of [-1, 1]) e.doboz(2 * f, 0.18, 0.22, 0, 1.74, sz * (f - 0.13), SZIN.FA);
    e.doboz(2 * f - 0.2, 0.1, 1.3, 0, 1.92, -0.6, SZIN.DESZKA, TETO_CS);
    // A műhelyben egy FÉLKÉSZ FALTÖRŐ KOS áll: két kerék, köztük a gerenda,
    // a végén a vasalt fej. A kerék az egyetlen KÖR alakú tömeg a roszterben —
    // ez az, ami messziről is elüt minden más épülettől. A két kerék ezért
    // SZÉTHÚZVA áll és világosabb a gerendánál: egymásba olvadva csak barna
    // folt lenne (az első változat pont ezen bukott el).
    for (const dx of [-0.78, 0.78]) {
      const k = new THREE.CylinderGeometry(0.44, 0.44, 0.15, 8);
      k.rotateZ(Math.PI / 2);
      k.translate(dx, 0.56, 0.74);
      e.elem(k, SZIN.DESZKA);
    }
    const tengely = new THREE.CylinderGeometry(0.07, 0.07, 1.6, 6);
    tengely.rotateZ(Math.PI / 2);
    tengely.translate(0, 0.56, 0.74);
    e.elem(tengely, SZIN.VAS);
    const gerenda = new THREE.CylinderGeometry(0.16, 0.16, 1.42, 6);
    gerenda.rotateZ(Math.PI / 2);
    gerenda.translate(0.06, 0.82, 0.74);
    e.elem(gerenda, SZIN.FA);
    e.doboz(0.22, 0.34, 0.34, 0.92, 0.65, 0.74, SZIN.VAS);
    e.zaszlo(-f + 0.2, 1.74, -f + 0.2, 0.6, 0.26);
    return e;
  },

  /** TORONY — nyolcszögű, karcsúsodó kőtest, pártázattal. A MAGASSÁG a lényeg. */
  TORONY(f, m, H) {
    const e = new Forma(m, H);
    e.doboz(2 * f, 0.28, 2 * f, 0, 0, 0, SZIN.KO);
    e.henger(f * 0.94, f * 0.78, 2.5, 8, 0, 0.28, 0, SZIN.KO, 0, false);
    // Csapat-öv derékmagasságban: a torony teteje messziről egy pont, az öv
    // viszont a sziluett közepén ül, ahol a szem megtalálja.
    e.henger(f * 0.9, f * 0.87, 0.16, 8, 0, 1.5, 0, SZIN.CSAPAT, 1, false);
    e.henger(f * 0.98, f * 0.98, 0.3, 8, 0, 2.78, 0, SZIN.KO_SOTET, 0.3);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) e.doboz(0.28, 0.3, 0.28, sx * 0.54, 3.08, sz * 0.54, SZIN.KO);
    }
    e.zaszlo(0, 3.08, 0, 0.5, 0.24);
    return e;
  },

  /** PIAC — három csapatszínű PONYVA: a legszínesebb tető az egész roszterben. */
  PIAC(f, m, H) {
    const e = new Forma(m, H);
    e.doboz(2 * f, 0.1, 2 * f, 0, 0, 0, SZIN.FOLD);
    const stand = (x, z) => {
      e.doboz(1.0, 0.44, 0.5, x, 0.1, z, SZIN.DESZKA);
      for (const sx of [-1, 1]) e.doboz(0.09, 1.02, 0.09, x + sx * 0.46, 0.1, z, SZIN.FA);
      e.hasab([-0.58, 0, 0.58, 0, 0, 0.34], 0.92, x, 1.12, z, SZIN.CSAPAT, 1);
    };
    stand(-0.75, -0.62);
    stand(0.75, -0.62);
    stand(0, 0.76);
    e.henger(0.2, 0.2, 0.44, 6, -0.72, 0.1, 0.62, SZIN.DESZKA);
    e.doboz(0.4, 0.4, 0.4, 0.78, 0.1, 0.7, SZIN.FA);
    return e;
  },
};

/**
 * ÁLLVÁNY — az ÉPÜLŐ ház köré kerül, EGYSÉG-térben (1×1 alapterület, 1 magas),
 * tehát a példány-mátrix méretezi a helyére.
 *
 * Miért kell egyáltalán? A doboz-korszakban az építkezés abból látszott, hogy a
 * doboz alacsonyabb és fakóbb volt. Egy részletes sziluettnél a lapított forma
 * önmagában nem olvasható („eltört a modell?"), a fakóság pedig kevés. Az
 * állvány TELJES magasságban áll, miközben az épület belül nő — így egyszerre
 * látszik, MI épül és MENNYIRE van kész.
 */
function allvanyForma() {
  const e = new Forma(1, 1);
  e.doboz(1, 0.05, 1, 0, 0, 0, SZIN.FOLD);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) e.doboz(0.07, 1.0, 0.07, sx * 0.46, 0, sz * 0.46, SZIN.FA);
  }
  for (const sz of [-1, 1]) e.doboz(1, 0.05, 0.05, 0, 0.62, sz * 0.46, SZIN.FA);
  const pallo = new THREE.BoxGeometry(0.16, 0.05, 1.16);
  pallo.rotateX(0.52);
  pallo.translate(0.3, 0.34, 0);
  e.elem(pallo, SZIN.DESZKA);
  return e;
}

// ── A TÁBLA FELÉPÍTÉSE — ITT BUKIK KI A HIÁNY ──────────────────────────────

/** `EPULET`-indexelt építőfüggvények. Lásd a fejléc „rövid tábla" szakaszát. */
const FORMA_TABLA = [];
{
  const kulcsok = Object.keys(EPULET);
  if (EP_MERET.length !== kulcsok.length || EP_MAGASSAG.length !== kulcsok.length) {
    throw new Error('[epulet_formak] EP_MERET/EP_MAGASSAG nem az EPULET hosszú — '
      + `${EP_MERET.length}/${EP_MAGASSAG.length} vs ${kulcsok.length}`);
  }
  for (const nev of kulcsok) {
    const fn = FORMAK[nev];
    if (typeof fn !== 'function') {
      throw new Error('[epulet_formak] nincs sziluett az EPULET.' + nev + ' típushoz');
    }
    FORMA_TABLA[EPULET[nev]] = fn;
  }
  for (const nev of Object.keys(FORMAK)) {
    if (!(nev in EPULET)) {
      throw new Error('[epulet_formak] ismeretlen épülettípus a formák közt: ' + nev);
    }
  }
}

/** Hány típus van? A rajzoló réteg ennyi példánytömböt nyit. */
export const EPULET_TIPUS_DB = FORMA_TABLA.length;

/** A típus magasság-kerete világegységben (a régi doboz teljes magassága). */
export function epuletMagassag(tipus) {
  return EP_MERET[tipus] * 0.8 * EP_MAGASSAG[tipus];
}

/**
 * A tizenegy geometria + az állvány felépítése. EGYSZER hívandó, a réteg
 * konstruktorából — futásidőben soha.
 * @returns {{tipus: THREE.BufferGeometry[], allvany: THREE.BufferGeometry,
 *            haromszog: number[], allvanyHaromszog: number}}
 */
export function epitEpuletGeometriak() {
  const tipus = [];
  const haromszog = [];
  for (let t = 0; t < FORMA_TABLA.length; t++) {
    const e = FORMA_TABLA[t](EP_MERET[t] * 0.46, EP_MERET[t], epuletMagassag(t));
    const geo = osszefuz(e.reszek);
    tipus[t] = geo;
    haromszog[t] = geo.attributes.position.count / 3;
  }
  const allvany = osszefuz(allvanyForma().reszek);
  return {
    tipus, allvany, haromszog,
    allvanyHaromszog: allvany.attributes.position.count / 3,
  };
}

/**
 * A közös épület-anyag. MINDEN típus ezt az EGY példányt kapja: azonos anyag +
 * azonos attribútum-készlet → a Three egyetlen shader-programot fordít, tehát a
 * tizenegy rajzhívás közt nincs program-váltás.
 *
 * `toneMapped: false` — ez a doboz-korszak öröksége, és tudatos: a
 * csapatszínnek az ACES-görbe alatt is telítettnek kell maradnia.
 */
export function epuletAnyag() {
  const anyag = new THREE.MeshLambertMaterial({ toneMapped: false });
  anyag.onBeforeCompile = (sh) => {
    sh.vertexShader = `
      attribute vec3 alapSzin;
      attribute float csapatArany;
      attribute vec4 csapatAdat;   // rgb = csapatszín, a = fényerő
      varying vec3 vEpSzin;
    ` + sh.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       vEpSzin = mix(alapSzin, csapatAdat.rgb, csapatArany) * csapatAdat.a;`,
    );
    sh.fragmentShader = 'varying vec3 vEpSzin;\n' + sh.fragmentShader.replace(
      '#include <color_fragment>',
      '#include <color_fragment>\n\tdiffuseColor.rgb *= vEpSzin;',
    );
  };
  return anyag;
}

/**
 * DIAGNOSZTIKA — a formák mérete és költsége, típusonként.
 *
 * Nem dísz: ebből derül ki, hogy tényleg mind a tizenegy típus kapott saját
 * sziluettet (a `haromszog` és a `jegy` külön-külön más), és hogy egyik sem lóg
 * túl az alapterületén (`tullogas <= 0`). A `qa/` szondák és a kézi ellenőrzés
 * ugyanezt olvassa.
 */
export function formaOsszefoglalo() {
  const nevek = Object.keys(EPULET);
  const ki = [];
  for (let t = 0; t < FORMA_TABLA.length; t++) {
    const m = EP_MERET[t], H = epuletMagassag(t);
    const e = FORMA_TABLA[t](m * 0.46, m, H);
    const geo = osszefuz(e.reszek);
    const p = geo.attributes.position.array;
    let maxXZ = 0, maxY = 0, jegy = 0;
    for (let i = 0; i < p.length; i += 3) {
      const ax = Math.abs(p[i]), az = Math.abs(p[i + 2]);
      if (ax > maxXZ) maxXZ = ax;
      if (az > maxXZ) maxXZ = az;
      if (p[i + 1] > maxY) maxY = p[i + 1];
      // Egyszerű ujjlenyomat: két típus formája akkor azonos, ha ez is az.
      jegy = (Math.imul(jegy, 31) + Math.round((p[i] + p[i + 1] * 3 + p[i + 2] * 7) * 1000)) | 0;
    }
    ki.push({
      tipus: t,
      nev: nevek[t],
      meret: m,
      keret: H,
      haromszog: geo.attributes.position.count / 3,
      szelesFel: maxXZ,
      tullogas: maxXZ - m * 0.5,
      magassag: maxY,
      jegy,
    });
    geo.dispose();
  }
  return ki;
}
