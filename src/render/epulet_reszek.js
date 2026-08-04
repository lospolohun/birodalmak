// AGE OF THE CRYSTALS — ÉPÜLET-ALKATRÉSZEK: a közös építőkészlet (v0.16).
//
// Ez a fájl NEM réteg és NEM formakatalógus. Egyetlen dolga, hogy a tizenegy
// sziluett ne primitívekből, hanem ÉPÍTÉSZETI ELEMEKBŐL álljon össze: kőfal
// lábazattal, sátortető ereszdeszkával, gerendavázas emelet, ablakmélyedés,
// pártázat, kémény, hordó, kerítés.
//
// ── MIÉRT KELL KÜLÖN KÉSZLET ──────────────────────────────────────────────
// A v0.10-es sziluettek doboz+kúp szinten álltak meg, és a fő hiány nem a
// részletesség volt, hanem az EGYSÉGES ANYAG-NYELV: minden épület más elvek
// szerint rakódott össze, ezért egymás mellett nem néztek ki egy kultúra
// épületeinek. Ha a kőfal MINDENHOL ugyanúgy kap lábazatot és sarokpillért, a
// tető MINDENHOL ugyanúgy ereszt és gerincgerendát, akkor tizenegy különböző
// épület is egy világ része lesz — és ez többet ér, mint még száz háromszög
// típusonként.
//
// ── AZ ÉLET: HÁROM MOZGÁSFAJTA, NULLA EXTRA RAJZHÍVÁS ─────────────────────
// A lengő zászló, a szálló füst és a forgó köszörűkő NEM külön háló és NEM
// képkockánkénti mátrix-írás. Két csúcs-attribútum hordozza őket:
//
//   eletAdat  (vec2)  x = mozgásfajta (0 áll, 1 zászló, 2 füst, 3 forgás)
//                     y = fázis-eltolás a darabon belül
//   eletKozep (vec3)  a mozgás origója (zászlónál a rúd töve, füstnél és
//                     forgásnál a darab KÖZÉPPONTJA)
//
// A füst- és a forgó darabok geometriája ezért az ORIGÓ KÖRÉ épül, a helyüket
// az `eletKozep` mondja meg — a vertex shader így tudja őket a saját közepük
// körül zsugorítani, illetve forgatni. A zászló ezzel szemben a helyén épül, és
// az `eletKozep` csak a rúd tövét jelöli, amitől távolodva nő a lengés.
//
// ── AZ ÁLLAPOT: EGY GEOMETRIA, TÖBB ARC (v0.16/2) ─────────────────────────
// Két dolog volt eddig láthatatlan az épületeken: hogy a kapu NYITVA van-e, és
// hogy az épület SÉRÜLT-e. Mindkettő ugyanaz a feladat — EGY példány-geometrián
// belül kell két-három változatot tartani —, ezért egy közös csatorna van rá:
//
//   allapotAdat (vec2)  x = sérülés-ablak (`SERULES.*`)
//                       y = kapu-ablak    (`KAPUALL.*`)
//
// A darab akkor rajzolódik ki, ha a PÉLDÁNY állapota beleesik az ablakába; ha
// nem, a vertex shader a darab MINDEN csúcsát egyetlen pontba húzza, tehát a
// háromszögei elfajulnak és nem raszterizálódnak.
//
// Miért ez, és nem külön geometria fokozatonként: fokozatonként külön háló
// típusonként külön `InstancedMesh`-t, külön példány-puffert és külön
// rajzhívást jelentene (11 típus × 3 fokozat), a fokozat-váltás pedig példány-
// átpakolást — vagyis pont azt a képkockánkénti munkát, amit ez a réteg a v0.3
// óta kerül. Így viszont a fokozat EGY float a példány-pufferben: a váltás
// egyetlen szám átírása, geometria-építés nélkül.
//
// ⚠️ A rejtés darab-szemcsés, nem háromszög-szemcsés: egy `elem()`-mel bevitt
// geometria MINDEN csúcsa ugyanazt az ablakot kapja, tehát háromszög sosem
// „lóg át" két darab közt, és az elfajulás mindig teljes.
//
// Egy típus MINDEN példánya ugyanazt a geometriát kapja, tehát önmagában mind
// egyszerre lengene. A shader ezért a PÉLDÁNY-MÁTRIX eltolás-oszlopából is
// hasheli a fázist (ugyanaz a fogás, mint a `props3d.js` fáin) — így nyolc ház
// nyolc külön ütemben füstöl, egyetlen bájt extra adat nélkül.
//
// ── KOORDINÁTA-EGYEZMÉNY ──────────────────────────────────────────────────
// Az origó az alapterület KÖZEPE a talajon, +y felfelé. A `doboz()` és társai
// `y` paramétere a darab TALPA, nem a közepe — így a méretek egymásra rakhatók
// anélkül, hogy fejben feleznénk. A HOMLOKZAT a +z oldal: minden bejárat,
// zászlósáv és ablak alapból oda néz, mert az RTS-kamera alapállásában (dőlés
// 34–58°, forgás −35°) ez az az oldal, amit a játékos lát.

import { THREE } from './core3d.js';

/**
 * Anyag-paletta (sRGB). Szándékosan KÖZÉPTÓNUSÚ: a `toneMapped:false` anyag
 * mellett a napfény (irányfény 2,15 + féggömb 1,05) a teljesen megvilágított
 * lapot nagyjából 1,0-szeresre viszi, tehát a világos pasztell fehérre égne ki.
 *
 * A párok (KO/KO_SOTET, CSEREP/CSEREP_SOTET…) nem díszek: az árnyék nélküli
 * világban a SAJÁT tónus-különbségük pótolja a hiányzó vetett árnyékot. Ezért
 * kap minden fal lábazatot és minden tető gerincgerendát — nem a részletért,
 * hanem hogy a forma a lapos fényben is tagolt maradjon.
 */
export const SZIN = {
  KO: 0x8b9199,
  KO_SOTET: 0x5e646c,
  KO_VILAG: 0xa7adb4,
  VAKOLAT: 0xb0a184,
  VAKOLAT_VIL: 0xc9bb9c,
  FA: 0x6b4a30,
  FA_SOTET: 0x412c1d,
  DESZKA: 0x93703f,
  CSEREP: 0x9c4028,
  CSEREP_SOTET: 0x6f2b1b,
  NAD: 0x94763f,
  ZSINDELY: 0x574433,
  ZSINDELY_VIL: 0x6e5842,
  SZALMA: 0xa98d45,
  VAS: 0x4e545c,
  REZ: 0x9a6b3a,
  FOLD: 0x6f6046,
  KAVICS: 0x7d7565,
  /** Nyílás (ajtó, ablak, boltív belseje). Majdnem fekete, de nem az: a
   *  féggömb-fény így is megcsillan rajta, és nem lyuknak látszik. */
  NYILAS: 0x241d19,
  /** Vászon alapszíne a csíkos ponyvákhoz — a csík MÁSIK fele csapatszín. */
  VASZON: 0xd6cdb8,
  /** Füst. Világosabb MINDEN épület-anyagnál: ettől lesz pára és nem kavics. */
  FUST: 0xe6e2da,
  /** Csapat-elem: az `alapSzin` ilyenkor közömbös, a `csapatArany` 1. */
  CSAPAT: 0xffffff,
  /**
   * KOROM. Sötét, de NEM fekete és nem is a `NYILAS` tónusa: a korom nem lyuk,
   * hanem bevont felület, tehát a féggömb-fény megcsillan rajta. Hidegebb is a
   * `FA_SOTET`-nél, különben égett gerendának látszana, nem szennyeződésnek.
   */
  KOROM: 0x37322c,
};

/** Tető-keverés: ennyire hajlik egy TOMPA tető a csapatszínbe. */
export const TETO_CS = 0.3;

/** Mozgásfajták — ugyanez a négy szám él a vertex shaderben. */
export const ELET = { ALL: 0, ZASZLO: 1, FUST: 2, FORGAS: 3 };

/**
 * SÉRÜLÉS-ABLAK (`allapotAdat.x`) — melyik fokozatoknál látszik a darab.
 * A példány fokozata: 0 = ép, 1 = sérült, 2 = súlyosan sérült.
 *
 * A három ablak SZÁNDÉKOSAN nem „pontosan ezen a fokozaton" jelentésű, hanem
 * küszöb: a repedés, ami a sérült házon megjelent, a súlyoson is ott van. Ha
 * fokozatonként cserélődne a jelkészlet, a romlás VILLANÁSNAK látszana, nem
 * halmozódásnak — és pont a halmozódás az, ami elárulja, merre tart az épület.
 */
export const SERULES = {
  /** Mindhárom fokozaton. Ez az alapértelmezés, tehát a v0.16-os darabok ide esnek. */
  MINDIG: 0,
  /** Csak sértetlenül (fok = 0). */
  EP: 1,
  /** Amíg nem súlyos (fok < 2) — ami a súlyos fokozaton LEOMLIK vagy leszakad. */
  NEM_SULYOS: 2,
  /** Sérülttől fölfelé (fok ≥ 1) — repedés, korom, omladék. */
  SERULT: 3,
  /** Csak súlyosan (fok = 2) — beszakadt tető, nagy omladék. */
  SULYOS: 4,
};

/** KAPU-ABLAK (`allapotAdat.y`) — a példány `nyitva` állapotához kötve. */
export const KAPUALL = { MINDIG: 0, CSUKVA: 1, NYITVA: 2 };

// ── PROFIL-KIHÚZÁS ─────────────────────────────────────────────────────────

/**
 * 2D profil kihúzása Z mentén. Indexeletlen háromszögek, KÉZZEL helyes
 * körüljárással — a normálisokat úgyis az összefűzés számolja (laposan), de a
 * hátlap-eldobás a körüljáráson múlik: rossz sorrendnél a tető belülről
 * látszana, kívülről nem.
 * @param {number[]} profil `[x0,y0, x1,y1, …]` KONVEX, +Z felől nézve az
 *   óramutatóval ELLENTÉTES körüljárással
 */
export function hasabGeo(profil, melyseg) {
  const db = profil.length / 2;
  const h = melyseg * 0.5;
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

/**
 * SÁTORTETŐ (kontytető): téglalap alap, vízszintes gerinccel. Hat háromszög —
 * ennyiért cserébe olyan tetőt kapunk, amit dobozból és kúpból nem lehet
 * kirakni, és pont ez az egyik jel, amiről az épület fajtája felismerhető.
 *
 * `gerinc = 0` esetén szabályos gúla lesz belőle (négy háromszög).
 * A geometria origója az alap KÖZEPE, y = 0 az eresz síkja.
 */
export function satorGeo(ax, az, mag, gerinc) {
  const g = Math.min(gerinc, ax * 2) * 0.5;
  const poz = [];
  const ki = (x, y, z) => poz.push(x, y, z);
  const A = [-ax, 0, az], B = [ax, 0, az], C = [g, mag, 0], D = [-g, mag, 0];
  const E = [ax, 0, -az], F = [-ax, 0, -az];
  const t = (p, q, r) => { ki(...p); ki(...q); ki(...r); };
  t(A, B, C); t(A, C, D);        // homlok (+z)
  t(E, F, D); t(E, D, C);        // hát (−z)
  t(B, E, C);                    // jobb (+x)
  t(F, A, D);                    // bal (−x)
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(poz), 3));
  return geo;
}

// ── FORMA: EGY ÉPÜLET ALKATRÉSZ-GYŰJTŐJE ──────────────────────────────────

/**
 * Egy épület alkatrészeinek gyűjtője. A darabok VILÁG-MÉRETBEN épülnek (a
 * geometria már a végleges méretű), így a példány-mátrix tiszta eltolás marad,
 * és a vékony gerendák nem torzulnak el a nem egyenletes skálázástól.
 */
export class Forma {
  /** @param {number} m alapterület cellában @param {number} magas magasság-keret */
  constructor(m, magas) {
    this.m = m;
    this.H = magas;
    /** Fél-szélesség: a FAL síkja itt van. */
    this.f = m * 0.46;
    /** Az eresz eddig érhet — a cellahatár. Ezen túl a sim járhatósága hazudna. */
    this.eresz = m * 0.5;
    this.reszek = [];
    /** Az ÉPPEN ÉRVÉNYES állapot-ablak — lásd `allapot()`. */
    this._sk = SERULES.MINDIG;
    this._kk = KAPUALL.MINDIG;
  }

  /**
   * ÁLLAPOT-KURZOR: innentől minden hozzáadott darab ebbe az ablakba kerül,
   * amíg vissza nem állítjuk. Paraméter nélkül hívva reset (`MINDIG`).
   *
   * Miért kurzor, és nem paraméter minden elemen: az elemek fele már létező,
   * bevált hívás (`kofal`, `nyeregteto`, `oromzat`), és mindegyikre ráfűzni egy
   * tizenkettedik argumentumot a hívásokat olvashatatlanná tenné. Így viszont a
   * változat egyetlen blokként, láthatóan elkülönül a formaleírásban — és a
   * kurzor alapértéke pontosan a v0.16-os viselkedés, tehát a MEGLÉVŐ darabok
   * egyetlen csúcsa sem mozdul.
   */
  allapot(serules = SERULES.MINDIG, kapu = KAPUALL.MINDIG) {
    this._sk = serules;
    this._kk = kapu;
    return this;
  }

  // ── PRIMITÍVEK ───────────────────────────────────────────────────────────

  /** Kész, már elhelyezett geometria hozzáadása. */
  elem(geo, szin, cs = 0, elet = null) {
    this.reszek.push({ geo, szin, cs, elet, sk: this._sk, kk: this._kk });
    return this;
  }

  /** Doboz. `x,y,z` a TALP középpontja. */
  doboz(sx, sy, sz, x, y, z, szin, cs = 0) {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    g.translate(x, y + sy * 0.5, z);
    return this.elem(g, szin, cs);
  }

  /** Doboz a KÖZEPÉRE illesztve és megdöntve. `t` a forgástengely: 'x'|'y'|'z'. */
  dontDoboz(sx, sy, sz, x, y, z, szog, t, szin, cs = 0) {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    if (t === 'x') g.rotateX(szog); else if (t === 'y') g.rotateY(szog); else g.rotateZ(szog);
    g.translate(x, y, z);
    return this.elem(g, szin, cs);
  }

  /** Hasáb: 2D profil kihúzva a Z tengely mentén (nyeregtető, rézsűs fal). */
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

  /** Fekvő henger (gerenda, tengely) az X tengely mentén. `y` a KÖZÉP. */
  rud(r, hossz, oldal, x, y, z, szin, cs = 0) {
    const g = new THREE.CylinderGeometry(r, r, hossz, oldal, 1, true);
    g.rotateZ(Math.PI / 2);
    g.translate(x, y, z);
    return this.elem(g, szin, cs);
  }

  /** Gúla (n oldalú kúp). `forgY = π/4` + 4 oldal → tengely-igazított négyzet alap. */
  gula(r, mag, oldal, x, y, z, szin, cs = 0, forgY = 0) {
    const g = new THREE.ConeGeometry(r, mag, oldal, 1, true);
    if (forgY) g.rotateY(forgY);
    g.translate(x, y + mag * 0.5, z);
    return this.elem(g, szin, cs);
  }

  // ── ÉPÍTÉSZETI ELEMEK ────────────────────────────────────────────────────

  /**
   * KŐFAL: lábazat + fal + koronapárkány. Ez a készlet legtöbbet használt
   * eleme, és szándékosan HÁROM darab: az árnyék nélküli világításban a
   * vízszintes tagolás az egyetlen, ami egy 1 méter magas falfelületet nem
   * hagy üres foltnak.
   * @param {{labazat?:number, parkany?:number, sarok?:boolean}} [o]
   */
  kofal(sx, sy, sz, x, y, z, o = {}) {
    const lab = o.labazat ?? Math.min(0.16, sy * 0.22);
    const par = o.parkany ?? 0;
    this.doboz(sx + 0.1, lab, sz + 0.1, x, y, z, SZIN.KO_SOTET);
    this.doboz(sx, sy - lab - par, sz, x, y + lab, z, SZIN.KO);
    if (par > 0) this.doboz(sx + 0.09, par, sz + 0.09, x, y + sy - par, z, SZIN.KO_VILAG);
    if (o.sarok !== false) {
      // Sarokpillérek: a saroknál a két fal találkozása egyébként egyetlen él
      // volna, és a lapos fényben két azonos tónusú lap éle eltűnik.
      const w = Math.min(0.2, sx * 0.16, sz * 0.16);
      for (const ux of [-1, 1]) {
        for (const uz of [-1, 1]) {
          this.doboz(w, sy - par, w, x + ux * (sx * 0.5 - w * 0.4),
            y, z + uz * (sz * 0.5 - w * 0.4), SZIN.KO_VILAG);
        }
      }
    }
    return this;
  }

  /**
   * GERENDAVÁZAS FAL (fachwerk): vakolt tábla + sötét gerendaháló. A ferde
   * andráskereszt az, amitől középkori lesz és nem „fehér doboz".
   * A gerendák CSAK a ±z lapokon ülnek: az oldalfalakat a kamera úgysem látja,
   * és a háromszögek fele így megspórolható.
   */
  gerendafal(sx, sy, sz, x, y, z, opts = {}) {
    const v = opts.vastag ?? 0.075;
    this.doboz(sx, sy, sz, x, y, z, opts.tabla ?? SZIN.VAKOLAT);
    // Alapból mindkét hosszanti lap kap vázat; ahol a hátsó falat úgysem
    // látni, egy `oldalak: [1]` felezi a darabszámot.
    for (const uz of opts.oldalak ?? [-1, 1]) {
      const pz = z + uz * (sz * 0.5 + v * 0.4);
      this.doboz(sx, v * 1.5, v, x, y, pz, SZIN.FA_SOTET);                 // talpgerenda
      this.doboz(sx, v * 1.5, v, x, y + sy - v * 1.5, pz, SZIN.FA_SOTET);  // koszorú
      const oszlop = opts.oszlop ?? 3;
      for (let i = 0; i < oszlop; i++) {
        const px = x - sx * 0.5 + sx * (i + 0.5) / oszlop;
        this.doboz(v, sy, v, px, y, pz, SZIN.FA_SOTET);
      }
      if (opts.andras !== false) {
        const h = Math.hypot(sx * 0.5, sy * 0.7);
        for (const ux of [-1, 1]) {
          this.dontDoboz(h, v, v * 0.9, x + ux * sx * 0.25, y + sy * 0.5, pz,
            ux * Math.atan2(sy * 0.7, sx * 0.5), 'z', SZIN.FA_SOTET);
        }
      }
    }
    return this;
  }

  /**
   * ABLAK a +z (vagy `-z`) homlokzaton: mélyedés + kőkeret + könyöklő.
   * A mélyedés MINDIG sötét, mert egy lapos, világos folt nem ablaknak látszik,
   * hanem koszos falnak.
   */
  ablak(x, y, z, sz, ma, uz = 1, keret = SZIN.KO_VILAG) {
    this.doboz(sz, ma, 0.06, x, y, z + uz * 0.02, SZIN.NYILAS);
    this.doboz(sz + 0.1, 0.055, 0.09, x, y + ma, z + uz * 0.01, keret);
    this.doboz(sz + 0.14, 0.05, 0.11, x, y - 0.05, z + uz * 0.01, keret);
    return this;
  }

  /** LŐRÉS: keskeny, magas sötét nyílás. A torony és a fal jele. */
  lores(x, y, z, ma, uz = 1) {
    this.doboz(0.09, ma, 0.05, x, y, z + uz * 0.015, SZIN.NYILAS);
    this.doboz(0.28, 0.06, 0.05, x, y + ma * 0.55, z + uz * 0.02, SZIN.NYILAS);
    return this;
  }

  /**
   * KAPUZAT: boltíves nyílás CSAPATSZÍNŰ ajtószárnyakkal. Az ajtó azért tiszta
   * csapatszín, mert a homlokzat közepén van, tehát pont oda esik a szem —
   * ez a legolcsóbb hely, ahol a hovatartozás félreérthetetlenné tehető.
   */
  kapuzat(x, y, z, sz, ma, uz = 1) {
    this.doboz(sz + 0.16, ma + 0.2, 0.1, x, y, z + uz * 0.005, SZIN.KO_VILAG);
    this.doboz(sz, ma, 0.12, x, y, z + uz * 0.05, SZIN.NYILAS);
    for (const ux of [-1, 1]) {
      this.doboz(sz * 0.47, ma * 0.94, 0.07, x + ux * sz * 0.25, y, z + uz * 0.08, SZIN.CSAPAT, 1);
    }
    this.doboz(sz * 0.2, ma * 0.08, 0.06, x, y + ma * 0.5, z + uz * 0.11, SZIN.VAS);
    // Boltív-zárókő: a nyílás fölött, kifelé ugorva.
    this.doboz(0.17, 0.2, 0.13, x, y + ma + 0.02, z + uz * 0.01, SZIN.KO_VILAG);
    return this;
  }

  /**
   * KAPUSZÁRNY EGY PÁNTON — vasalt tábla, ami a pántja körül kifordul.
   *
   * A paraméter a PÁNT x-e, nem a szárny közepe, és ez a lényeg: a nyitott és a
   * csukott változat ugyanabból a pontból indul, tehát a kettő között a szárny
   * FORDUL, nem ugrik. Ha a középpontot adnánk meg, a két állás észrevehetően
   * elcsúszna egymáshoz képest, és a kapu inkább hibásnak látszana, mint
   * nyitottnak.
   *
   * A vasalás nem cifraság: egy sima, egyszínű tábla a nyílásban kitöltésnek
   * látszik. A két keresztpánt teszi SZÁRNNYÁ — és a nyitott állásban ez az,
   * ami elárulja, hogy az a ferde lap ott az ajtó, nem egy fal-darab.
   *
   * @param {number} panx a pánt x-e (a pillér felőli él); a szárny innen −`ux`
   *   irányba nyúlik
   * @param {number} y a szárny TALPA
   * @param {number} ux +1 = jobb szárny, −1 = bal
   * @param {number} szog 0 = csukva (a nyílás síkjában); előjelesen `ux`-szel
   *   szorozva fordul kifelé
   */
  kapuszarny(panx, y, z, sz, ma, vastag, ux, szog, szin = SZIN.CSAPAT, cs = 1) {
    const cx = panx - ux * sz * 0.5 * Math.cos(szog);
    const cz = z + ux * sz * 0.5 * Math.sin(szog);
    this.dontDoboz(sz, ma, vastag, cx, y + ma * 0.5, cz, szog, 'y', szin, cs);
    for (const h of [0.24, 0.76]) {
      this.dontDoboz(sz * 0.94, 0.05, vastag + 0.025, cx, y + ma * h, cz, szog, 'y', SZIN.VAS);
    }
    return this;
  }

  /**
   * SÁTORTETŐ ereszdeszkával és gerincgerendával. `y` az eresz síkja.
   * A `flare` egy alacsony, szélesebb alsó tetőszakasz: ettől kap a tető
   * TÖRÉSVONALAT, ami messziről is elárulja, hogy cserép van rajta, nem papír.
   */
  satorteto(ax, az, mag, gerinc, x, y, z, szin, cs = 0, o = {}) {
    const flare = o.flare ?? 0;
    let y0 = y, ax0 = ax, az0 = az;
    if (flare > 0) {
      // Az alsó szakasz gerince pont ott ér véget, ahol a felső szakasz ERESZE
      // kezdődik — így a két tetősík folytonos, csak a hajlásszögük tör meg.
      const g = satorGeo(ax, az, flare, gerinc + (ax - ax * 0.9) * 2);
      g.translate(x, y, z);
      this.elem(g, o.also ?? szin, cs);
      y0 = y + flare * 0.92;
      ax0 = ax * 0.9; az0 = az * 0.9;
    }
    this.doboz(ax0 * 2 + 0.05, 0.07, az0 * 2 + 0.05, x, y0 - 0.05, z, o.eresz ?? SZIN.FA_SOTET);
    const g = satorGeo(ax0, az0, mag, gerinc);
    g.translate(x, y0, z);
    this.elem(g, szin, cs);
    if (gerinc > 0.05) {
      this.doboz(gerinc + 0.14, 0.09, 0.14, x, y0 + mag - 0.045, z, o.gerinc ?? SZIN.CSEREP_SOTET);
    } else {
      this.doboz(0.16, 0.1, 0.16, x, y0 + mag - 0.05, z, o.gerinc ?? SZIN.CSEREP_SOTET);
    }
    return this;
  }

  /**
   * NYEREGTETŐ: háromszög-hasáb, ereszdeszkával és gerincgerendával.
   * `forgY = π/2` → a gerinc az X tengely irányába fordul.
   */
  nyeregteto(fel, mag, hossz, x, y, z, szin, cs = 0, forgY = 0, gerincSzin = SZIN.ZSINDELY_VIL) {
    const vx = forgY ? hossz : fel * 2, vz = forgY ? fel * 2 : hossz;
    this.doboz(vx + 0.06, 0.07, vz + 0.06, x, y - 0.06, z, SZIN.FA_SOTET);
    this.hasab([-fel, 0, fel, 0, 0, mag], hossz, x, y, z, szin, cs, forgY);
    // A gerincgerenda NEM lóghat túl az ereszdeszkán: az `EP_MERET`-szerződés
    // az eresznél a legszorosabb, és ez a néhány centi volt az, ami a raktárt
    // és a laktanyát kivitte a cellájából.
    const gx = forgY ? hossz + 0.02 : 0.15, gz = forgY ? 0.15 : hossz + 0.02;
    this.doboz(gx, 0.08, gz, x, y + mag - 0.06, z, gerincSzin);
    return this;
  }

  /** TETŐABLAK (manzárd) a homlokzati tetősíkon — a központ és a raktár jele. */
  tetoablak(x, y, z, sz, ma) {
    this.doboz(sz, ma, 0.34, x, y, z, SZIN.VAKOLAT_VIL);
    this.doboz(sz * 0.5, ma * 0.6, 0.06, x, y + ma * 0.22, z + 0.17, SZIN.NYILAS);
    this.hasab([-sz * 0.58, 0, sz * 0.58, 0, 0, 0.2], 0.42, x, y + ma, z + 0.02, SZIN.CSEREP_SOTET, 0.1);
    return this;
  }

  /**
   * PÁRTÁZAT (oromfogsor) négyzetes koszorún. A fal, a kapu és a torony jele.
   * A négy sarok CSAK EGYSZER kerül ki: a naiv „minden oldalra db darab" a
   * sarkokat duplán rakná le, ami néma háromszög-pazarlás (egy 1 cellás falnál
   * ez a teljes költség harmada volt).
   */
  oromzat(fel, y, magas, db, szin = SZIN.KO_VILAG) {
    const l = fel * 2 / (db * 2 - 1);
    const p = [];
    for (let i = 0; i < db; i++) p.push(-fel + l * i * 2 + l * 0.5);
    for (const q of p) {
      this.doboz(l, magas, l, q, y, -fel + l * 0.5, szin);
      this.doboz(l, magas, l, q, y, fel - l * 0.5, szin);
    }
    for (let i = 1; i < db - 1; i++) {
      this.doboz(l, magas, l, -fel + l * 0.5, y, p[i], szin);
      this.doboz(l, magas, l, fel - l * 0.5, y, p[i], szin);
    }
    return this;
  }

  /**
   * PAJZS a homlokzaton (a +z lapra fektetve). A laktanya fő csapat-jelölője:
   * egy sor tiszta csapatszínű korong a falon messziről is olvasható, és nem
   * kell hozzá a tetőt elszínezni.
   */
  pajzs(x, y, z, r = 0.16) {
    const g = new THREE.CylinderGeometry(r, r, 0.05, 6);
    g.rotateX(Math.PI / 2);
    g.translate(x, y, z);
    this.elem(g, SZIN.CSAPAT, 1);
    const b = new THREE.CylinderGeometry(r * 0.34, r * 0.34, 0.07, 6);
    b.rotateX(Math.PI / 2);
    b.translate(x, y, z + 0.02);
    return this.elem(b, SZIN.VAS);
  }

  /** LÉPCSŐ a +z homlokzat elé. `y` a legalsó fok talpa. */
  lepcso(sz, x, y, z, db, fok = 0.09, melyseg = 0.14) {
    for (let i = 0; i < db; i++) {
      this.doboz(sz - i * 0.1, fok, melyseg * (db - i), x,
        y + i * fok, z + melyseg * (db - i) * 0.5, i === db - 1 ? SZIN.KO_VILAG : SZIN.KO);
    }
    return this;
  }

  /** HORDÓ. Két csonkakúp — az egyetlen forma, ami hasas, tehát messziről is hordó. */
  hordo(x, y, z, r = 0.16, mag = 0.36) {
    this.henger(r * 0.82, r, mag * 0.5, 6, x, y, z, SZIN.DESZKA);
    this.henger(r, r * 0.82, mag * 0.5, 6, x, y + mag * 0.5, z, SZIN.DESZKA);
    this.doboz(r * 2.05, 0.04, r * 2.05, x, y + mag * 0.45, z, SZIN.VAS);
    return this;
  }

  /** LÁDA. */
  lada(x, y, z, s = 0.3, szin = SZIN.DESZKA) {
    this.doboz(s, s * 0.85, s, x, y, z, szin);
    this.doboz(s + 0.03, 0.045, s + 0.03, x, y + s * 0.4, z, SZIN.FA_SOTET);
    return this;
  }

  /** ZSÁK / szénakazal — hatoldalú kúp, tompa csúccsal. */
  kazal(x, y, z, r = 0.34, mag = 0.5, szin = SZIN.SZALMA) {
    this.henger(r, r * 0.62, mag * 0.45, 6, x, y, z, szin);
    this.gula(r * 0.62, mag * 0.6, 6, x, y + mag * 0.45, z, szin);
    return this;
  }

  /** KERÍTÉS-SZAKASZ: két rúd és oszlopok. `vx/vz` az irány (±1 az egyik). */
  kerites(x, y, z, hossz, vx, magas = 0.52) {
    const sx = vx ? hossz : 0.07, sz = vx ? 0.07 : hossz;
    for (const h of [0.42, 0.78]) {
      this.doboz(sx, 0.055, sz, x, y + magas * h, z, SZIN.FA);
    }
    const db = Math.max(2, Math.round(hossz / 0.55));
    for (let i = 0; i <= db; i++) {
      const t = -hossz * 0.5 + hossz * i / db;
      this.doboz(0.1, magas, 0.1, x + (vx ? t : 0), y, z + (vx ? 0 : t), SZIN.FA);
    }
    return this;
  }

  // ── SÉRÜLÉS-JELEK ────────────────────────────────────────────────────────
  //
  // Ugyanaz az elv, mint a kőfal lábazatánál: nem a részletért vannak, hanem
  // hogy az árnyék nélküli, lapos fényben LEGYEN mihez képest sötétebb. Egy
  // sérülés-jel ezért mindig két tónussal dolgozik (nyílás + korom, kavics +
  // kő), és mindig a felület elé ugrik pár centit — egy pontosan a falsíkba
  // rakott sötét folt z-küzdelembe kerülne a fallal, és villódzna.

  /**
   * REPEDÉS a homlokzaton. Két, ellentétesen döntött keskeny sáv, közte egy
   * rövid vízszintes ág.
   *
   * Miért nem egyetlen egyenes: az egyenes csík FESTETTNEK látszik. A törés
   * viszont anyagi hiba — és mivel a szem az egyenestől való eltérésre ugrik,
   * ez a néhány fok döntés többet ér, mint a repedés hossza.
   */
  repedes(x, y, z, ma, uz = 1) {
    const f = ma * 0.52;
    const pz = z + uz * 0.025;
    this.dontDoboz(0.045, f, 0.05, x - ma * 0.05, y + f * 0.5, pz, 0.17, 'z', SZIN.NYILAS);
    this.dontDoboz(0.04, f * 0.92, 0.05, x + ma * 0.07, y + f * 1.34, pz, -0.24, 'z', SZIN.NYILAS);
    this.dontDoboz(0.033, ma * 0.24, 0.05, x + ma * 0.12, y + f * 0.72, pz, 1.15, 'z', SZIN.NYILAS);
    return this;
  }

  /**
   * KOROM-FOLT: széles, halvány bevonat és benne egy sötétebb mag. A mag nélkül
   * a folt egyenletes szürke tábla lenne — a korom viszont a becsapódás körül a
   * legsűrűbb, és ez a sűrűsödés az, ami elárulja, hogy ide ÜTÖTTEK.
   */
  korom(x, y, z, sz, ma, uz = 1) {
    this.doboz(sz, ma, 0.04, x, y, z + uz * 0.018, SZIN.KOROM);
    this.doboz(sz * 0.5, ma * 0.46, 0.05, x + sz * 0.12, y + ma * 0.2, z + uz * 0.024, SZIN.NYILAS);
    return this;
  }

  /**
   * OMLADÉK az épület tövében: kihullott kövek és egy letört gerenda.
   *
   * A talpon HEVER, tehát a többi jellel ellentétben felülnézetből is látszik —
   * és az RTS-kamera (34–58°) pont felülnézet. Ez a legfontosabb sérülés-jel:
   * a homlokzati repedést kizoomolva már nem, ezt viszont még igen.
   */
  omladek(x, y, z, r) {
    this.doboz(r * 1.55, r * 0.46, r * 1.2, x, y, z, SZIN.KAVICS);
    this.doboz(r * 0.78, r * 0.6, r * 0.68, x - r * 0.32, y + r * 0.38, z + r * 0.22, SZIN.KO_SOTET);
    this.doboz(r * 0.6, r * 0.48, r * 0.58, x + r * 0.44, y + r * 0.3, z - r * 0.26, SZIN.KO);
    this.dontDoboz(r * 1.7, 0.06, 0.09, x + r * 0.2, y + r * 0.34, z + r * 0.5, 0.22, 'z', SZIN.FA_SOTET);
    return this;
  }

  /**
   * BESZAKADT TETŐ: sötét nyílás a tetősíkban, fölötte a kilátszó szarufák és
   * a peremről lecsúszott cserép.
   *
   * ⚠️ A nyílás lapja SZÁNDÉKOSAN a tetősík alá kerül, a szarufák pedig fölé:
   * a tetőt nem tudjuk kilyukasztani (egyetlen összefűzött geometria, nincs
   * kivonás), tehát a lyukat a fölé nyúló TÖRMELÉK jelzi. Ha csak a sötét lap
   * volna, az árnyékos foltnak látszana; a szarufáktól lesz belőle szakadás.
   */
  tetoseb(x, y, z, fel, mely) {
    this.doboz(fel * 2, 0.06, mely * 2, x, y, z, SZIN.NYILAS);
    for (const ux of [-1, 1]) {
      this.dontDoboz(0.07, fel * 1.6, 0.07, x + ux * fel * 0.52, y + fel * 0.4, z,
        ux * 0.5, 'z', SZIN.FA_SOTET);
    }
    this.doboz(fel * 1.8, 0.06, 0.08, x, y + fel * 0.62, z, SZIN.FA_SOTET);
    this.dontDoboz(fel * 0.8, 0.05, mely * 0.9, x - fel * 0.8, y + 0.07, z + mely * 0.35,
      0.42, 'z', SZIN.CSEREP_SOTET);
    return this;
  }

  /**
   * A HÁROM FOKOZAT KÖZÖS JELKÉSZLETE — ez teszi egységessé a tizenegy típust.
   *
   * A hívó a saját homlokzatának és tetejének néhány számát adja meg; a jelek
   * helye ebből SZÁRMAZIK, nem kézzel van kirakva. Ugyanaz a döntés, mint a
   * `Forma` méreteinél: egy `EP_MERET`-változás így magától átrendezi a
   * sérülést is, és nem marad hátra egy repedés a levegőben.
   *
   * A SÚLYOS fokozat nem cseréli le a sérült jeleit, hanem RÁRAK — lásd a
   * `SERULES` küszöb-magyarázatát.
   *
   * @param {{homlok:number, falFel?:number, falY?:number, falMag?:number,
   *          talpY?:number, omladekZ?:number, tetoY?:number, tetoX?:number,
   *          tetoZ?:number, tetoFel?:number, tetoMely?:number}} o
   */
  serulesJelek(o) {
    const hz = o.homlok;
    const fel = o.falFel ?? this.f;
    const y0 = o.falY ?? 0.12;
    const mag = o.falMag ?? this.H * 0.4;
    const talp = o.talpY ?? y0;
    const oz = o.omladekZ ?? hz - Math.min(0.3, fel * 0.24);

    this.allapot(SERULES.SERULT);
    this.repedes(-fel * 0.5, y0 + mag * 0.1, hz, mag * 0.7);
    this.repedes(fel * 0.66, y0 + mag * 0.3, hz, mag * 0.48);
    this.korom(fel * 0.17, y0 + mag * 0.5, hz, fel * 0.42, mag * 0.42);
    this.omladek(-fel * 0.76, talp, oz, Math.min(0.16, fel * 0.2));

    this.allapot(SERULES.SULYOS);
    this.repedes(-fel * 0.05, y0, hz, mag * 0.92);
    this.korom(-fel * 0.58, y0 + mag * 0.42, hz, fel * 0.46, mag * 0.54);
    this.omladek(fel * 0.7, talp, oz - fel * 0.12, Math.min(0.22, fel * 0.26));
    if (o.tetoY !== undefined) {
      this.tetoseb(o.tetoX ?? 0, o.tetoY, o.tetoZ ?? 0,
        o.tetoFel ?? fel * 0.34, o.tetoMely ?? fel * 0.28);
    }
    return this.allapot();
  }

  // ── ÉLŐ ELEMEK ───────────────────────────────────────────────────────────

  /**
   * ZÁSZLÓRÚD + LENGŐ LOBOGÓ. A lobogó a rúdtól +x felé nyúlik (a shader ezt az
   * irányt feltételezi), és a rúdtól távolodva egyre nagyobbat leng.
   *
   * Miért éri meg külön mozgásfajtát adni neki: kizoomolva a tetők árnyalata
   * összemosódhat, egy MOZGÓ, tiszta csapatszínű folt viszont nem — a szem a
   * mozgásra ugrik, és a csapat-hovatartozás ettől lesz azonnal olvasható.
   * @param {number} szeletek a lobogó hossz menti felosztása (több szelet =
   *   folyamatosabb hullám; 3 elég, mert a lengés kicsi)
   */
  zaszlo(x, y, z, rudMag, lobogoMa = 0.3, hossz = 0.46, szeletek = 3, fazis = 0) {
    this.doboz(0.07, rudMag, 0.07, x, y, z, SZIN.FA_SOTET);
    this.doboz(0.1, 0.09, 0.1, x, y + rudMag, z, SZIN.REZ);
    const yl = y + rudMag - lobogoMa - 0.07;
    const kozep = [x, y, z];
    for (let i = 0; i < szeletek; i++) {
      const l = hossz / szeletek;
      const px = x + 0.045 + l * (i + 0.5);
      const g = new THREE.BoxGeometry(l * 1.02, lobogoMa, 0.035);
      g.translate(px, yl + lobogoMa * 0.5, z);
      this.elem(g, SZIN.CSAPAT, 1, { fajta: ELET.ZASZLO, fazis, kozep });
    }
    return this;
  }

  /**
   * KÉMÉNY + SZÁLLÓ FÜST. A pamacsok az ORIGÓ körül épülnek, a helyüket az
   * `eletKozep` adja — a shader így tudja őket a saját közepük körül nullára
   * zsugorítani, tehát a füst ÁTLÁTSZÓSÁG NÉLKÜL tűnik el. Ez fontos: egy
   * átlátszó anyag külön, rendezett rajzhívást és `depthWrite:false`-t kívánna,
   * és pont az a fajta költség, amit ezen a rétegen nem akarunk.
   */
  kemeny(x, y, z, sz, mag, fust = 3, fazis = 0) {
    this.doboz(sz, mag - 0.1, sz, x, y, z, SZIN.KO);
    this.doboz(sz + 0.07, 0.1, sz + 0.07, x, y + mag - 0.1, z, SZIN.KO_SOTET);
    for (let i = 0; i < fust; i++) {
      // Kicsi és VILÁGOS pamacsok. Az első változat 0,11–0,17-es, vakolatszínű
      // gömbjei a kémény fölött lebegő KÖVEKNEK látszottak — a füstöt a
      // méret és a világosság teszi füstté, nem a forma.
      const g = new THREE.IcosahedronGeometry(0.075 + i * 0.012, 0);
      this.elem(g, SZIN.FUST, 0, {
        fajta: ELET.FUST, fazis: fazis + i / fust,
        kozep: [x, y + mag + 0.05, z],
      });
    }
    return this;
  }

  /**
   * FORGÓ KERÉK (köszörűkő, csigasor): az X tengely körül pörög a saját
   * középpontja körül. A geometria ezért az ORIGÓBAN épül.
   */
  forgoKerek(x, y, z, r, vastag, kullo = 4, fazis = 0, szin = SZIN.DESZKA) {
    const kozep = [x, y, z];
    const t = new THREE.CylinderGeometry(r, r, vastag, 8, 1, false);
    t.rotateZ(Math.PI / 2);
    this.elem(t, szin, 0, { fajta: ELET.FORGAS, fazis, kozep });
    for (let i = 0; i < kullo; i++) {
      const g = new THREE.BoxGeometry(vastag * 1.4, r * 1.85, 0.07);
      g.rotateX(Math.PI * i / kullo);
      this.elem(g, SZIN.FA_SOTET, 0, { fajta: ELET.FORGAS, fazis, kozep });
    }
    return this;
  }
}

// ── ÖSSZEFŰZÉS ─────────────────────────────────────────────────────────────

const _szinSegito = new THREE.Color();

/**
 * Az alkatrészek EGY indexeletlen geometriává olvasztása, csúcs-attribútumokkal.
 *
 * Indexeletlen, mert a `computeVertexNormals()` így LAPOS árnyalást ad — pont
 * azt, amit a `props3d.js` fáin és a kristályokon látunk. Indexelt geometrián a
 * megosztott csúcsok normálisai átlagolódnának, és az élek elkenődnének.
 *
 * ⚠️ A `boundingSphere` az ÉPÍTÉSI pózra érvényes; a füst-pamacsok ilyenkor még
 * az origóban ülnek. Ez nem baj: a réteg `frustumCulled = false`-szal rajzol
 * (épületből néhány tucat van), tehát a befoglaló gömböt senki nem használja
 * kivágásra.
 */
export function osszefuz(reszek) {
  let n = 0;
  for (const r of reszek) {
    if (r.geo.index) r.geo = r.geo.toNonIndexed();
    n += r.geo.attributes.position.count;
  }
  const poz = new Float32Array(n * 3);
  const alap = new Float32Array(n * 3);
  const arany = new Float32Array(n);
  const eletAdat = new Float32Array(n * 2);
  const eletKozep = new Float32Array(n * 3);
  const allapotAdat = new Float32Array(n * 2);
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
      // Az állapot-ablak DARABONKÉNT azonos — ezért fajul el hézagtalanul a
      // rejtett darab minden háromszöge (lásd a fejléc ⚠️ megjegyzését).
      allapotAdat[(v + i) * 2] = r.sk || 0;
      allapotAdat[(v + i) * 2 + 1] = r.kk || 0;
      if (r.elet) {
        eletAdat[(v + i) * 2] = r.elet.fajta;
        eletAdat[(v + i) * 2 + 1] = r.elet.fazis;
        eletKozep[(v + i) * 3] = r.elet.kozep[0];
        eletKozep[(v + i) * 3 + 1] = r.elet.kozep[1];
        eletKozep[(v + i) * 3 + 2] = r.elet.kozep[2];
      }
    }
    v += db;
    r.geo.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(poz, 3));
  geo.setAttribute('alapSzin', new THREE.BufferAttribute(alap, 3));
  geo.setAttribute('csapatArany', new THREE.BufferAttribute(arany, 1));
  geo.setAttribute('eletAdat', new THREE.BufferAttribute(eletAdat, 2));
  geo.setAttribute('eletKozep', new THREE.BufferAttribute(eletKozep, 3));
  geo.setAttribute('allapotAdat', new THREE.BufferAttribute(allapotAdat, 2));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}
