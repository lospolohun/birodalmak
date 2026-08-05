// AGE OF THE CRYSTALS — A MECCS MÉRLEGE (v0.16): DOM-mentes adatréteg.
//
// ── MIÉRT VAN EGYÁLTALÁN STATISZTIKA ──────────────────────────────────────
// A motor v0.10-nél tart, a prezentáció v0.0-nál: a meccsnek ma nincs se
// mérlege, se vége-képernyője. A játékos végigjátszik húsz percet, aztán nem
// tudja meg, hogy nyert-e, és főleg NEM TUDJA MEG, MIN MÚLT. Egy RTS-ben a
// tanulás nem a meccs alatt történik, hanem a meccs UTÁN, a görbéken: „a
// tizedik percben lement a nyersanyag/perc, mert a favágóim elfogytak" — ezt
// egyetlen pillanatnyi szám sem mondja meg, csak az IDŐSOR.
//
// ── MIÉRT KÜLÖN FÁJL A RAJZOLÁSTÓL ────────────────────────────────────────
// Ez a modul nem tud a DOM-ról, a `three`-ről és a vászonról. Egyetlen dolgot
// csinál: a `Sim`-ből számokat olvas, és eltárolja őket időben. A rajzolás a
// `panel_statisztika.js` dolga.
//
// A szétválasztás nem ízlés: a panel node-ban NEM fut (DOM-ot használ), tehát
// szondázhatatlan lenne. Ez a projekt hatszor égett meg azon, hogy a zöld kapu
// mögött halott rendszer állt. Az idősor pedig pont az a fajta kód, ami
// csendben tud hazudni: a panel szépen megrajzol egy vízszintes vonalat akkor
// is, ha a gyűjtés SOHA nem mintavételezett. Ezért a számok itt vannak, és a
// `tools/panel_statisztika_szonda.mjs` VALÓDI meccset futtat rájuk — az
// ellenpróba egy ÁLLÓ világ, ahol minden görbének laposnak KELL maradnia.
//
// ── ⚠️ A MINTAVÉTEL TICK-ALAPÚ, NEM ÓRA-ALAPÚ ────────────────────────────
// A mintavétel a `sim.tick`-ből dolgozik, nem `performance.now()`-ból. Három
// okból, és mindhárom konkrét hibafajta:
//
//   1. A meccs FUTHAT GYORSÍTVA vagy szünetelve. Óra-alapú mintavételnél a
//      szünetben is nőne az idősor (lapos farokkal), gyorsításnál pedig
//      ritkulna — vagyis a görbe vízszintes tengelye hazudna.
//   2. A v0.8 lockstepjében két gép ugyanazt a tickszámot látja, de nem
//      ugyanabban a valós pillanatban. Csak a tick-alapú minta hasonlítható
//      össze két játékos statisztikája között.
//   3. Node-ban (szonda) nincs képkocka; ott az óra-alapú gyűjtés soha nem is
//      indulna el.
//
// ── ⚠️ AZ IDŐSOR MEMÓRIÁJA NEM NŐHET KORLÁTLANUL ─────────────────────────
// Egy hosszú meccs órákig tarthat. Ha képkockánként (vagy akár tickenként)
// gyűjtenénk, egy óra alatt 72 000 minta × 19 sorozat × 2 csapat gyűlne össze.
// Ezért:
//
//   • A minta TICK-KÖZzel megy (`MINTA_TICK`, alapból 5 másodpercnyi tick).
//   • Ha betelt a `MAX_MINTA` hely, a gyűjtő RITKÍT: minden második mintát
//     eldob, és megduplázza a mintaközt. A memória így FIX marad, az
//     időfelbontás pedig logaritmikusan romlik — húsz perc után 5 s, negyven
//     perc után 10 s, és így tovább. Ez pontosan az a csere, amit a görbe
//     elbír: senki nem a 3. és 4. másodperc különbségére kíváncsi a 90.
//     percben.
//
// ── ⚠️ GYŐZELMI FELTÉTEL: A SIM MA NEM TUD ILYET ─────────────────────────
// A `src/sim/` sehol nem mond ki győztest (nincs `gyoztes`, nincs `vege`, a
// `sim.lep()` a végtelenségig lép). Ez a réteg SZÁNDÉKOSAN nem pótolja: a
// győzelmi feltétel a világ állapota, annak a hashben a helye, és egy UI-ból
// jött „vége" a lockstepen két különböző gépen két különböző tickre esne.
//
// Amit itt csinálunk helyette: KIOLVASSUK AZ ÁLLÁST (`allas`) és megnézzük a
// de facto kiesést (`vegallapot`) — vagyis hogy egy csapatnak maradt-e
// egyáltalán bármije. Ez tájékoztató UI-olvasat, NEM szabály; ezért van külön
// jelezve (`hivatalos: false`).

import { TICK_HZ } from '../sim/sim.js';
import { NYERS } from '../sim/eroforras.js';
import { TIPUS } from '../sim/units.js';
import { EPULET } from '../sim/epuletek.js';
import { KORSZAK_NEV } from '../sim/gazdasag.js';
import { MUNKA } from '../sim/munkas.js';
// A VÉG OKÁNAK MONDATAI. A sim sosem formáz szöveget (lásd a `gyozelem.js`
// fejlécét) — a kódot adja, a mondatot innen vesszük.
import { VEG_OK_NEV } from '../sim/gyozelem.js';

/** Két minta között ennyi tick telik el kezdetben. 100 tick = 5 másodperc. */
export const MINTA_TICK = 100;
/** Ennyi mintát tartunk sorozatonként. Betelés után ritkítunk (lásd fejléc). */
export const MAX_MINTA = 240;
/** Ennyi fordulópontot őrzünk. Ha betelt, a LEGKISEBB súlyú esik ki. */
export const MAX_FORDULOPONT = 48;

/** A csapatok neve a szövegekben. A minimap és a `gazdasag3d` színeihez igazítva. */
export const CSAPAT_NEV = ['kék', 'vörös'];

/**
 * A gyűjtött sorozatok. A `kulcs` a tárolás neve, a többi a panel dolga.
 *
 * `halmozott: true` → a szám csak nőhet (összesen begyűjtött, kiképzett,
 * elesett). Ezeknél a görbe alatti terület is értelmes, és a „percenkénti"
 * változás a meredekség. A NEM halmozott sorozat pillanatnyi állapot
 * (népesség, katonai erő) — ott a visszaesés a lényeg.
 */
export const SOROZAT = [
  { kulcs: 'nyersOsszes', nev: 'Nyersanyag összesen', ikon: 'kristaly', csoport: 'gazdasag', halmozott: true },
  { kulcs: 'etel', nev: 'Étel', ikon: 'etel', csoport: 'gazdasag', halmozott: true },
  { kulcs: 'fa', nev: 'Fa', ikon: 'fa', csoport: 'gazdasag', halmozott: true },
  { kulcs: 'ko', nev: 'Kő', ikon: 'ko', csoport: 'gazdasag', halmozott: true },
  { kulcs: 'kristaly', nev: 'Kristály', ikon: 'kristaly', csoport: 'gazdasag', halmozott: true },
  { kulcs: 'percenkent', nev: 'Nyersanyag / perc', ikon: 'ido', csoport: 'gazdasag', halmozott: false },
  { kulcs: 'keszlet', nev: 'Raktáron', ikon: 'raktar', csoport: 'gazdasag', halmozott: false },
  { kulcs: 'korszak', nev: 'Korszak', ikon: 'korszak', csoport: 'gazdasag', halmozott: true },

  { kulcs: 'nepesseg', nev: 'Népesség', ikon: 'nep', csoport: 'nepesseg', halmozott: false },
  { kulcs: 'nepessegMax', nev: 'Férőhely', ikon: 'haz', csoport: 'nepesseg', halmozott: false },
  { kulcs: 'munkas', nev: 'Munkás', ikon: 'munkas', csoport: 'nepesseg', halmozott: false },
  { kulcs: 'tetlen', nev: 'Tétlen munkás', ikon: 'tetlen', csoport: 'nepesseg', halmozott: false },

  { kulcs: 'katona', nev: 'Katona', ikon: 'landzsas', csoport: 'katonai', halmozott: false },
  { kulcs: 'katonaiEro', nev: 'Katonai erő', ikon: 'lovag', csoport: 'katonai', halmozott: false },
  { kulcs: 'kikepzett', nev: 'Kiképzett egység', ikon: 'ijasz', csoport: 'katonai', halmozott: true },
  { kulcs: 'elesett', nev: 'Elesett egység', ikon: 'baj', csoport: 'katonai', halmozott: true },
  { kulcs: 'sebzes', nev: 'Okozott sebzés', ikon: 'figyelem', csoport: 'katonai', halmozott: true },

  { kulcs: 'epulet', nev: 'Álló épület', ikon: 'kozpont', csoport: 'terkep', halmozott: false },
  { kulcs: 'felfedezve', nev: 'Felfedezve (%)', ikon: 'korszak', csoport: 'terkep', halmozott: false },
];

/** A sorozat-kulcsok, a `SOROZAT` sorrendjében. */
export const KULCSOK = SOROZAT.map((s) => s.kulcs);

/** Csoport-fejlécek a panel füleihez. */
export const CSOPORT = [
  { kulcs: 'gazdasag', nev: 'Gazdaság' },
  { kulcs: 'nepesseg', nev: 'Népesség' },
  { kulcs: 'katonai', nev: 'Hadsereg' },
  { kulcs: 'terkep', nev: 'Térkép' },
];

/**
 * A MÉRCE: miből olvassuk ki, ki áll jobban — és melyik mennyit nyom.
 *
 * ⚠️ A súlyok összege 100, hogy a `pont` közvetlenül SZÁZALÉKKÉNT olvasható
 * legyen. A katonai erő a legnagyobb tétel, mert a mai simben egyedül az tud
 * VISSZAFORDÍTHATATLANUL dönteni (a nyersanyagot vissza lehet hozni, a
 * lerombolt központot nem).
 */
export const MERCE = [
  { kulcs: 'katonaiEro', suly: 30 },
  { kulcs: 'nyersOsszes', suly: 20 },
  { kulcs: 'nepesseg', suly: 15 },
  { kulcs: 'korszak', suly: 10 },
  { kulcs: 'epulet', suly: 10 },
  { kulcs: 'sebzes', suly: 5 },
  { kulcs: 'kikepzett', suly: 5 },
  { kulcs: 'felfedezve', suly: 5 },
];

/** Fordulópont-fajták: súly (a ritkításnál ez dönt) és emberi név. */
export const FORDULO = {
  KORSZAK: { kod: 'korszak', suly: 55, ikon: 'korszak' },
  ELSO_VER: { kod: 'elso_ver', suly: 85, ikon: 'figyelem' },
  VESZTESEG: { kod: 'veszteseg', suly: 45, ikon: 'baj' },
  EPULET_VESZT: { kod: 'epulet_veszt', suly: 60, ikon: 'baj' },
  KOZPONT_VESZT: { kod: 'kozpont_veszt', suly: 95, ikon: 'baj' },
  ERO_VALT: { kod: 'ero_valt', suly: 70, ikon: 'lovag' },
  GAZDASAG_VALT: { kod: 'gazdasag_valt', suly: 50, ikon: 'kristaly' },
  KIESETT: { kod: 'kiesett', suly: 120, ikon: 'baj' },
};

/** Ennyi elesett egység egyetlen mintaközben már fordulópont. */
const VESZTESEG_KUSZOB = 4;

// ── PILLANATKÉP ────────────────────────────────────────────────────────────

/**
 * Egy csapat MINDEN mért száma egyetlen pillanatban.
 *
 * ⚠️ A `ki` kimeneti objektum ÚJRAHASZNÁLHATÓ. A panel képkockánként hívhatja
 * (a fejléc élő számaihoz), és egy per-frame objektum-allokáció 144 Hz-en
 * ingyen elvitt szemétgyűjtés. Ezért a hívó ad edényt, mi csak feltöltjük.
 *
 * Egyetlen egység-bejárás van benne, nem öt: a `munkasok.osszesites()`,
 * a `harc.osszesites()` és a katonai erő külön-külön is végigmenne az összes
 * egységen, ráadásul a `harc.osszesites()` `slice()`-ol (allokál).
 *
 * @param {import('../sim/sim.js').Sim} sim
 * @param {number} csapat
 * @param {object} [ki] újrahasznált cél-objektum
 */
export function pillanat(sim, csapat, ki) {
  const p = ki || {};
  const cs = csapat | 0;
  const g = sim.gazdasag;
  const o = cs * 4;

  p.tick = sim.tick;
  p.etel = g.osszegyujtott[o + NYERS.ETEL];
  p.fa = g.osszegyujtott[o + NYERS.FA];
  p.ko = g.osszegyujtott[o + NYERS.KO];
  p.kristaly = g.osszegyujtott[o + NYERS.KRISTALY];
  p.nyersOsszes = p.etel + p.fa + p.ko + p.kristaly;
  p.keszlet = g.keszlet[o] + g.keszlet[o + 1] + g.keszlet[o + 2] + g.keszlet[o + 3];
  p.korszak = g.korszak[cs];
  p.percenkent = 0;                       // a gyűjtő tölti ki, két mintából

  const nep = g.nepessegAllapot(cs);
  p.nepesseg = nep.foglalt;
  p.nepessegMax = nep.max;

  // ── EGYSÉGEK: EGY bejárás mindenre ──────────────────────────────────
  const e = sim.egysegek;
  const harc = sim.harc;
  const mu = sim.munkasok;
  const ellen = cs === 0 ? 1 : 0;
  // Sebzés-referencia TÍPUSONKÉNT, nem egységenként: a `sebzesErtek` a
  // technológiát és a civet is beszámítja, tehát a kutatás tényleg megemeli a
  // görbét — de hatszor kell kiszámolni, nem ezerszer.
  const ref = _REF;
  for (let t = 0; t < 6; t++) ref[t] = harc.sebzesErtek(t, TIPUS.LANDZSAS, cs, ellen);

  let munkas = 0, tetlen = 0, katona = 0, elo = 0, ero = 0;
  for (let i = 0; i < e.db; i++) {
    if (e.csapat[i] !== cs || harc.elo[i] === 0) continue;
    elo++;
    const t = e.tipus[i];
    if (t === TIPUS.MUNKAS) {
      munkas++;
      if (mu.allapot[i] === MUNKA.NINCS) tetlen++;
      continue;
    }
    katona++;
    // Erő = életerő × egy szabványos célpont ellen okozott sebzés. Nem
    // darabszám: húsz sebesült lándzsás nem ér fel öt friss lovaggal, és a
    // puszta létszám pont a döntő pillanatban vezetne félre.
    ero += ((harc.hp[i] * ref[t]) / 10) | 0;
  }
  p.munkas = munkas;
  p.tetlen = tetlen;
  p.katona = katona;
  p.elo = elo;
  p.katonaiEro = ero;

  // ── ÉPÜLETEK ───────────────────────────────────────────────────────
  const ep = sim.epuletek;
  let epulet = 0, epul = 0, kozpont = 0;
  for (let i = 0; i < ep.db; i++) {
    if (ep.elo[i] === 0 || ep.csapat[i] !== cs) continue;
    if (ep.epulHatra[i] === 0) epulet++; else epul++;
    if (ep.tipus[i] === EPULET.KOZPONT) kozpont++;
  }
  p.epulet = epulet;
  p.epul = epul;
  p.kozpont = kozpont;

  p.kikepzett = sim.kepzes.keszult[cs & 1];
  p.elesett = harc.halottak[cs & 1];
  p.sebzes = harc.osszSebzes[cs & 1];
  p.tech = sim.technologia.keszult[cs];
  // A `kod.osszesites()` OBJEKTUMOT ad, és ez a függvény képkockánként futhat —
  // ott egy eldobott objektum per csapat per képkocka már mérhető szemét. A két
  // számláló publikus és ugyanazt a hányadost adja, mint az összesítés.
  p.felfedezve = sim.kod.cellaDb > 0
    ? ((sim.kod.latottDb[cs] * 100) / sim.kod.cellaDb) | 0
    : 0;
  return p;
}

/** Sebzés-referencia a `pillanat`-nak. Modul-szintű, hogy ne allokáljon. */
const _REF = new Int32Array(6);

// ── AZ IDŐSOR ──────────────────────────────────────────────────────────────

export class StatisztikaGyujto {
  /**
   * @param {import('../sim/sim.js').Sim} sim
   * @param {{mintaTick?:number, maxMinta?:number, csapatDb?:number}} [opciok]
   */
  constructor(sim, opciok = {}) {
    this.csapatDb = opciok.csapatDb ?? 2;
    /** Aktuális mintaköz TICKBEN. A ritkítás duplázza. */
    this.mintaTick = Math.max(1, opciok.mintaTick ?? MINTA_TICK);
    this.maxMinta = Math.max(4, opciok.maxMinta ?? MAX_MINTA);
    /** Ennyi minta van a tömbökben. */
    this.db = 0;
    /** Hányszor ritkítottunk. A panel ebből tudja, mennyire durva a felbontás. */
    this.ritkitasDb = 0;
    /** Nő minden mintavételnél — a panel ebből tudja, kell-e újrarajzolni. */
    this.valtozat = 0;
    /** Az utolsó minta tickje; -1 = még nem volt. */
    this.utolsoTick = -1;
    /** A minták tickjei. */
    this.tickek = new Int32Array(this.maxMinta);
    /** `kulcs → [Float64Array(csapat 0), Float64Array(csapat 1)]`. */
    this.adat = new Map();
    for (const k of KULCSOK) {
      const t = [];
      for (let cs = 0; cs < this.csapatDb; cs++) t.push(new Float64Array(this.maxMinta));
      this.adat.set(k, t);
    }
    /** Fordulópontok időrendben. */
    this.fordulopontok = [];

    // Két pillanatkép-készlet csapatonként, felváltva: a fordulópont-vizsgálat
    // az ELŐZŐ mintához hasonlít, allokáció nélkül.
    this._p = [[], []];
    for (let k = 0; k < 2; k++) {
      for (let cs = 0; cs < this.csapatDb; cs++) this._p[k].push({});
    }
    this._most = 0;
    this._vanElozo = false;
    /** Ki vezetett legutóbb — a vezetés-váltás fordulópontjához. */
    this._eroVezet = -2;
    this._gazdasagVezet = -2;
    this._kiesett = [false, false];
    this._elsoVer = false;

    /** A következő minta tickje. A 0. tick alapvonalként azonnal bekerül. */
    this._kovetkezo = 0;
    if (sim) this.mintaz(sim);
  }

  /**
   * MINTAVÉTEL — ha eljött az ideje.
   *
   * A hívó (a panel `frissit()`-je) képkockánként hívhatja: ha még nem jött el
   * a következő tick, ez egyetlen egész-összehasonlítás és `false`.
   *
   * ⚠️ AKKOR IS FUT, HA A PANEL REJTVE VAN. Ha csak nyitott panelnél gyűjtenénk,
   * a meccs végén pont a lényeg hiányozna: a görbe ott kezdődne, ahol a játékos
   * először megnyitotta a statisztikát.
   *
   * @param {import('../sim/sim.js').Sim} sim
   * @param {boolean} [eroltet] mintavétel a tick-köztől függetlenül (meccs vége)
   * @returns {boolean} keletkezett-e minta
   */
  mintaz(sim, eroltet = false) {
    const tick = sim.tick | 0;
    if (!eroltet && tick < this._kovetkezo) return false;
    if (eroltet && tick === this.utolsoTick) return false;

    if (this.db >= this.maxMinta) this._ritkit();

    const most = this._p[this._most];
    const elozo = this._p[1 - this._most];
    const i = this.db;

    for (let cs = 0; cs < this.csapatDb; cs++) {
      const p = pillanat(sim, cs, most[cs]);
      // NYERSANYAG / PERC: két minta különbsége, percre vetítve. A `percenkent`
      // ezért nem olvasható ki egyetlen pillanatból — ez a sorozat születik.
      if (this._vanElozo) {
        const dt = tick - this.utolsoTick;
        p.percenkent = dt > 0
          ? Math.round(((p.nyersOsszes - elozo[cs].nyersOsszes) * TICK_HZ * 60) / dt)
          : 0;
      } else {
        p.percenkent = 0;
      }
      for (const k of KULCSOK) this.adat.get(k)[cs][i] = p[k];
    }

    this.tickek[i] = tick;
    this.db++;
    this.utolsoTick = tick;
    this.valtozat++;
    this._kovetkezo = tick + this.mintaTick;

    this._fordulopontVizsgalat(most, elozo, tick);
    this._most = 1 - this._most;
    this._vanElozo = true;
    return true;
  }

  /**
   * RITKÍTÁS: minden második minta marad, a mintaköz duplázódik.
   *
   * Ez az, ami a memóriát FIXEN tartja tetszőleges hosszú meccsen. A megmaradó
   * minták továbbra is valódi mérések (nem átlagok) — átlagolással a
   * `percenkent` csúcsai elkenődnének, márpedig a görbe éppen a csúcsairól szól.
   */
  _ritkit() {
    const uj = Math.ceil(this.db / 2);
    for (let i = 0; i < uj; i++) this.tickek[i] = this.tickek[i * 2];
    for (const k of KULCSOK) {
      const t = this.adat.get(k);
      for (let cs = 0; cs < this.csapatDb; cs++) {
        const s = t[cs];
        for (let i = 0; i < uj; i++) s[i] = s[i * 2];
      }
    }
    this.db = uj;
    this.mintaTick *= 2;
    this.ritkitasDb++;
  }

  /** Egy sorozat egy csapatra: `{tomb, db}`. A tömb NEM másolat. */
  sorozat(kulcs, csapat) {
    const t = this.adat.get(kulcs);
    if (!t) return { tomb: null, db: 0 };
    return { tomb: t[csapat | 0], db: this.db };
  }

  /** Az utolsó mért érték. Ha nincs minta, 0. */
  utolso(kulcs, csapat) {
    const t = this.adat.get(kulcs);
    if (!t || this.db === 0) return 0;
    return t[csapat | 0][this.db - 1];
  }

  /**
   * A sorozat szélső értékei MINDKÉT csapatra — a görbék így közös
   * tengelyre kerülnek, és tényleg összehasonlíthatók.
   */
  hatar(kulcs) {
    const t = this.adat.get(kulcs);
    if (!t || this.db === 0) return { min: 0, max: 0 };
    let min = Infinity, max = -Infinity;
    for (let cs = 0; cs < this.csapatDb; cs++) {
      const s = t[cs];
      for (let i = 0; i < this.db; i++) {
        const v = s[i];
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    if (min === Infinity) return { min: 0, max: 0 };
    return { min, max };
  }

  /**
   * MOZOG-E EGYÁLTALÁN A GÖRBE? Ez a szonda szabotázs-próbájának alapja: álló
   * világon minden `false`, élő meccsen a gazdaság és a népesség `true`.
   */
  mozog(kulcs, csapat) {
    const t = this.adat.get(kulcs);
    if (!t || this.db < 2) return false;
    const s = t[csapat | 0];
    const e = s[0];
    for (let i = 1; i < this.db; i++) if (s[i] !== e) return true;
    return false;
  }

  /** Hány sorozat mozdult meg legalább az egyik csapatnál. */
  mozgoSorozatok() {
    let db = 0;
    for (const k of KULCSOK) {
      let m = false;
      for (let cs = 0; cs < this.csapatDb; cs++) if (this.mozog(k, cs)) m = true;
      if (m) db++;
    }
    return db;
  }

  /** A gyűjtő memória-lábnyoma bájtban — a szonda ezt is kiírja. */
  get memoriaBajt() {
    return (KULCSOK.length * this.csapatDb + 1) * this.maxMinta * 8;
  }

  // ── FORDULÓPONTOK ───────────────────────────────────────────────────

  /**
   * A meccs FORDULÓPONTJAI: azok a minták, ahol valami visszafordíthatatlan
   * vagy sorsdöntő történt.
   *
   * ⚠️ Miért nem a nyers számokból számoljuk ezt utólag? Mert a ritkítás
   * eldobja a minták felét, és pont a rövid, éles események (egy elvesztett
   * központ) tűnnének el elsőként. A fordulópont ezért a mintavétel
   * PILLANATÁBAN keletkezik, és külön listában él tovább.
   */
  _fordulopontVizsgalat(most, elozo, tick) {
    if (!this._vanElozo) {
      // A 0. minta: még nincs mihez hasonlítani, de a kezdő vezetést rögzítjük.
      this._eroVezet = _vezet(most[0].katonaiEro, most[1].katonaiEro);
      this._gazdasagVezet = _vezet(most[0].nyersOsszes, most[1].nyersOsszes);
      return;
    }
    for (let cs = 0; cs < this.csapatDb; cs++) {
      const m = most[cs], e = elozo[cs];

      if (m.korszak > e.korszak) {
        // Ragozás nélkül, kettősponttal: a korszaknevek („hajnal kora",
        // „fény kora") toldalékolva mind más alakot kérnének, és a
        // „belépett a hajnal koraba" pont az a hanyagság, amit egy vége-
        // képernyőn a játékos elsőként vesz észre.
        this._fordulo(tick, cs, FORDULO.KORSZAK,
          _nev(cs) + ' korszakot váltott: ' + KORSZAK_NEV[m.korszak], m.korszak);
      }
      if (!this._elsoVer && m.sebzes > 0 && e.sebzes === 0) {
        this._elsoVer = true;
        this._fordulo(tick, cs, FORDULO.ELSO_VER, 'Első összecsapás — ' + _nev(cs) + ' sebzett', m.sebzes);
      }
      const halt = m.elesett - e.elesett;
      if (halt >= VESZTESEG_KUSZOB) {
        this._fordulo(tick, cs, FORDULO.VESZTESEG,
          _nev(cs) + ' ' + halt + ' egységet vesztett', halt);
      }
      if (m.kozpont < e.kozpont) {
        this._fordulo(tick, cs, FORDULO.KOZPONT_VESZT,
          _nev(cs) + ' központja elesett', e.kozpont - m.kozpont);
      } else if (m.epulet + m.epul < e.epulet + e.epul) {
        this._fordulo(tick, cs, FORDULO.EPULET_VESZT,
          _nev(cs) + ' épületet vesztett', (e.epulet + e.epul) - (m.epulet + m.epul));
      }
      const kiesett = m.elo === 0 && m.epulet + m.epul === 0;
      if (kiesett && !this._kiesett[cs]) {
        this._kiesett[cs] = true;
        this._fordulo(tick, cs, FORDULO.KIESETT, _nev(cs) + ' mindent elvesztett', 0);
      }
    }

    const eroV = _vezet(most[0].katonaiEro, most[1].katonaiEro);
    if (eroV >= 0 && eroV !== this._eroVezet && this._eroVezet !== -2) {
      this._fordulo(tick, eroV, FORDULO.ERO_VALT, _nev(eroV) + ' átvette a katonai vezetést',
        most[eroV].katonaiEro);
    }
    if (eroV !== -1) this._eroVezet = eroV;

    const gazdV = _vezet(most[0].nyersOsszes, most[1].nyersOsszes);
    if (gazdV >= 0 && gazdV !== this._gazdasagVezet && this._gazdasagVezet !== -2) {
      this._fordulo(tick, gazdV, FORDULO.GAZDASAG_VALT,
        _nev(gazdV) + ' átvette a gazdasági vezetést', most[gazdV].nyersOsszes);
    }
    if (gazdV !== -1) this._gazdasagVezet = gazdV;
  }

  _fordulo(tick, csapat, fajta, szoveg, ertek) {
    this.fordulopontok.push({
      tick, csapat, kod: fajta.kod, suly: fajta.suly, ikon: fajta.ikon,
      ido: idoSzoveg(tick), szoveg, ertek,
    });
    if (this.fordulopontok.length <= MAX_FORDULOPONT) return;
    // ⚠️ NEM a legrégebbit dobjuk, hanem a LEGKISEBB SÚLYÚT. Egy húszperces
    // meccsen az első percek apró korszakváltásai különben kiszorítanák az
    // utolsó percek döntő központ-vesztéseit — vagyis pont a lényeg veszne el.
    let rossz = 0;
    for (let i = 1; i < this.fordulopontok.length; i++) {
      if (this.fordulopontok[i].suly < this.fordulopontok[rossz].suly) rossz = i;
    }
    this.fordulopontok.splice(rossz, 1);
  }

  /** A legfontosabb fordulópontok súly szerint, majd időrendben. */
  fontosFordulopontok(db = 8) {
    const t = this.fordulopontok.slice();
    t.sort((a, b) => (b.suly - a.suly) || (a.tick - b.tick));
    const v = t.slice(0, db);
    v.sort((a, b) => a.tick - b.tick);
    return v;
  }
}

// ── ÁLLÁS ÉS VÉGÁLLAPOT ────────────────────────────────────────────────────

/** -1 = döntetlen, egyébként a vezető csapat. */
function _vezet(a, b) { return a === b ? -1 : (a > b ? 0 : 1); }
function _nev(cs) { return 'A ' + (CSAPAT_NEV[cs] || ('' + cs)) + ' csapat'; }

/**
 * KI ÁLL JOBBAN, ÉS MIBEN.
 *
 * ⚠️ EZ NEM GYŐZELEM. A sim ma nem ismer győztest (lásd a fejlécet), tehát ez
 * kizárólag olvasat. A visszaadott `hivatalos: false` pont ezért van benne: a
 * panel köteles jelezni, hogy állást mutat, nem eredményt.
 *
 * @param {import('../sim/sim.js').Sim} sim
 * @param {{a?:object, b?:object}} [edeny] újrahasznált pillanatkép-objektumok
 */
export function allas(sim, edeny) {
  const p0 = pillanat(sim, 0, edeny && edeny.a);
  const p1 = pillanat(sim, 1, edeny && edeny.b);
  const tetelek = [];
  const pont = [0, 0];
  for (const m of MERCE) {
    const a = p0[m.kulcs], b = p1[m.kulcs];
    const v = _vezet(a, b);
    if (v < 0) { pont[0] += m.suly / 2; pont[1] += m.suly / 2; }
    else pont[v] += m.suly;
    const leiro = SOROZAT.find((s) => s.kulcs === m.kulcs);
    tetelek.push({
      kulcs: m.kulcs, nev: leiro ? leiro.nev : m.kulcs, ikon: leiro ? leiro.ikon : 'info',
      suly: m.suly, ertek: [a, b], vezet: v,
    });
  }
  const vezet = _vezet(pont[0], pont[1]);
  return {
    tetelek, pont, vezet, hivatalos: false,
    szoveg: vezet < 0 ? 'Fej-fej mellett' : _nev(vezet) + ' vezet',
    pillanat: [p0, p1],
  };
}

/**
 * VÉGÁLLAPOT — v0.17 óta HIVATALOS EREDMÉNY, ha a sim kimondta.
 *
 * ── MIÉRT KÉT ÁG, ÉS MIÉRT MARAD MEG A RÉGI ───────────────────────────────
 * A v0.16-ig a sim nem ismert győztest, ezért ez a függvény BECSÜLT: azt
 * nézte, maradt-e egy csapatnak bármije. Az a becslés tájékoztató volt, és a
 * `hivatalos: false` pont ezt vallotta be.
 *
 * A v0.17-ben a `gyozelem.js` megmondja a választ, és az a MÉRVADÓ — az van a
 * hashben, azon áll a lockstep. Ezért ha a sim kimondta a véget, azt adjuk
 * vissza, `hivatalos: true`-val.
 *
 * A de facto ág viszont NEM törlendő, és ez nem óvatoskodás: a két feltétel
 * NEM ugyanaz. A sim a KÖZPONT elvesztésére és a feladásra köt véget; egy
 * csapat viszont elveszítheti az összes egységét és épületét úgy is, hogy a
 * központja épp az utolsó pillanatban dőlt le — illetve a de facto kiesés
 * ELŐBB látszik, mint ahogy a szabály elsülne. Amíg a sim hallgat, a panelnek
 * van mit mondania, csak nem eredményként. Egy hazug „még fut" rosszabb, mint
 * egy bevallottan nem hivatalos állás-olvasat.
 *
 * @returns {{vege:boolean, gyoztes:number, ok:string, kiesett:boolean[],
 *            hivatalos:boolean, vegeTick:number}}
 */
export function vegallapot(sim) {
  const ki = [_kiesett(sim, 0), _kiesett(sim, 1)];

  // 1) A SIM SZAVA. Mezőket olvasunk, nem `osszesites()`-t hívunk: az objektumot
  //    allokálna, ezt meg a panel minden frissítésen kérdezi.
  const gy = sim.gyozelem;
  if (gy && gy.vege) {
    const okNev = VEG_OK_NEV[gy.ok] || '';
    // A vesztes az, aki KIESETT — a győztes -1 is lehet (döntetlen: mindkét fél
    // ugyanazon a ticken esett ki). A szöveg ezért a vesztesből épül, nem a
    // győztesből: döntetlennél nincs kiről beszélni.
    let ok = 'A meccs véget ért';
    if (gy.gyoztes >= 0) {
      const vesztes = 1 - gy.gyoztes;
      ok = _nev(vesztes) + ' ' + (okNev || 'kiesett');
    } else {
      // ⚠️ A `gy.ok` EGY szám az EGÉSZ meccsre, a döntetlen viszont VEGYES is
      // lehet: a 0. csapat feladja, az 1. ugyanabban a tickben elveszti a
      // központját. Egyetlen okot kiírva a panel az egyik félről HAZUDNA
      // („mindkét fél feladta a meccset", holott az egyiket lerombolták).
      // A sim ezért ad csapatonkénti okot (`okCsapat()`), ami a MÁR HASHELT
      // `kiesett`+`feladta`-ból származik — nulla új állapot.
      const o0 = VEG_OK_NEV[gy.okCsapat(0)] || 'kiesett';
      const o1 = VEG_OK_NEV[gy.okCsapat(1)] || 'kiesett';
      ok = o0 === o1
        ? 'Döntetlen — mindkét fél ' + o0 + ' ugyanazon a ticken'
        : 'Döntetlen — ' + _nev(0) + ' ' + o0 + ', ' + _nev(1) + ' ' + o1;
    }
    return {
      vege: true, gyoztes: gy.gyoztes, ok, kiesett: ki,
      hivatalos: true, vegeTick: gy.vegeTick,
    };
  }

  // 2) DE FACTO OLVASAT, amíg a sim hallgat. Változatlanul `hivatalos: false`.
  if (ki[0] && ki[1]) {
    return {
      vege: true, gyoztes: -1, ok: 'mindkét fél elveszett mindent',
      kiesett: ki, hivatalos: false, vegeTick: -1,
    };
  }
  for (let cs = 0; cs < 2; cs++) {
    if (!ki[cs]) continue;
    const g = cs === 0 ? 1 : 0;
    return {
      vege: true, gyoztes: g,
      ok: _nev(cs) + ' minden egységét és épületét elvesztette',
      kiesett: ki, hivatalos: false, vegeTick: -1,
    };
  }
  return { vege: false, gyoztes: -1, ok: '', kiesett: ki, hivatalos: false, vegeTick: -1 };
}

function _kiesett(sim, csapat) {
  const ep = sim.epuletek;
  for (let i = 0; i < ep.db; i++) {
    if (ep.elo[i] === 1 && ep.csapat[i] === csapat) return false;
  }
  const e = sim.egysegek;
  const harc = sim.harc;
  for (let i = 0; i < e.db; i++) {
    if (harc.elo[i] === 1 && e.csapat[i] === csapat) return false;
  }
  return true;
}

/**
 * A MECCS MÉRLEGE — ez kerül a vége-képernyőre.
 *
 * @param {StatisztikaGyujto} gyujto
 * @param {import('../sim/sim.js').Sim} sim
 * @param {number} [sajatCsapat]
 */
export function merleg(gyujto, sim, sajatCsapat = 0) {
  const a = allas(sim);
  const veg = vegallapot(sim);
  const sorok = [];
  for (const s of SOROZAT) {
    const ertek = [a.pillanat[0][s.kulcs], a.pillanat[1][s.kulcs]];
    // A „percenkent" pillanatból nem olvasható (két mintából születik) —
    // ott az UTOLSÓ mért értéket vesszük.
    if (s.kulcs === 'percenkent') {
      ertek[0] = gyujto.utolso('percenkent', 0);
      ertek[1] = gyujto.utolso('percenkent', 1);
    }
    sorok.push({
      kulcs: s.kulcs, nev: s.nev, ikon: s.ikon, csoport: s.csoport,
      ertek, vezet: _vezet(ertek[0], ertek[1]),
    });
  }
  return {
    tick: sim.tick,
    ido: idoSzoveg(sim.tick),
    sorok,
    allas: a,
    veg,
    sajatCsapat,
    fordulopontok: gyujto.fontosFordulopontok(8),
    // ⚠️ A CÍM SOSEM mond „győzelmet", ha a sim nem mondta ki. Lásd a fejlécet.
    cim: veg.vege
      ? (veg.gyoztes < 0 ? 'Döntetlen' : (veg.gyoztes === sajatCsapat ? 'Győzelem' : 'Vereség'))
      : (a.vezet < 0 ? 'Állás: fej-fej mellett'
        : (a.vezet === sajatCsapat ? 'Állás: te vezetsz' : 'Állás: az ellenfél vezet')),
    hivatalos: veg.hivatalos,
  };
}

// ── SZÖVEG ÉS GÖRBE ────────────────────────────────────────────────────────

/** Tick → `perc:mp`. A `TICK_HZ`-ből, nem a fali órából (lásd a fejlécet). */
export function idoSzoveg(tick) {
  const mp = Math.floor((tick | 0) / TICK_HZ);
  const p = Math.floor(mp / 60);
  const m = mp % 60;
  return p + ':' + (m < 10 ? '0' : '') + m;
}

/**
 * Szám emberi alakban: ezres csoportosítás keskeny szóközzel, a nagyok
 * rövidítve. A HUD-on és a mérlegen ugyanaz a szabály — a 12 483 négy
 * karakterrel többet foglal, mint a „12,5 e", és a táblázat elcsúszna tőle.
 */
export function szamSzoveg(n) {
  const v = Math.round(n || 0);
  if (Math.abs(v) < 10000) {
    return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }
  if (Math.abs(v) < 1000000) return (v / 1000).toFixed(1).replace('.', ',') + ' e';
  return (v / 1000000).toFixed(1).replace('.', ',') + ' M';
}

/**
 * A GÖRBE PONTJAI egy `<polyline points="…">`-hoz.
 *
 * Miért itt, és miért string? Mert így a rajzolás matematikája DOM nélkül
 * vizsgálható: a szonda meg tudja nézni, hogy a pontok tényleg a doboz belül
 * vannak, és hogy nem egy vízszintes vonal jött ki egy mozgó sorozatból.
 * Külső könyvtár nincs — a `dist/` egyetlen fájl marad.
 *
 * @param {Float64Array} tomb
 * @param {number} db hány elem érvényes
 * @param {number} szel doboz szélessége
 * @param {number} mag doboz magassága
 * @param {number} max a KÖZÖS tengely teteje (mindkét csapatra ugyanaz)
 * @param {number} [min] a közös tengely alja
 * @returns {string} `"x,y x,y …"`, üres ha nincs mit rajzolni
 */
export function vonalUt(tomb, db, szel, mag, max, min = 0) {
  if (!tomb || db <= 0) return '';
  const tart = max - min;
  const oszto = tart > 0 ? tart : 1;
  let s = '';
  // Egyetlen mintából is látszódjon valami: vízszintes szakasz a teljes dobozon.
  const n = db === 1 ? 2 : db;
  for (let i = 0; i < n; i++) {
    const v = tomb[db === 1 ? 0 : i];
    const x = n === 1 ? 0 : (i * szel) / (n - 1);
    const y = mag - ((v - min) * mag) / oszto;
    s += (i ? ' ' : '') + _kerek(x) + ',' + _kerek(y);
  }
  return s;
}

/** Két tizedes elég egy SVG-koordinátának; a hosszú tizedes csak fájlt hizlal. */
function _kerek(v) {
  const r = Math.round(v * 100) / 100;
  return String(Number.isFinite(r) ? r : 0);
}

/**
 * A vízszintes tengely feliratai: hány osztás, és mi az idejük.
 * @returns {{arany:number, cimke:string}[]}
 */
export function idoTengely(gyujto, db = 5) {
  const ki = [];
  if (!gyujto || gyujto.db === 0) return ki;
  const utolso = gyujto.tickek[gyujto.db - 1];
  const elso = gyujto.tickek[0];
  const n = Math.max(2, db | 0);
  for (let i = 0; i < n; i++) {
    const a = i / (n - 1);
    ki.push({ arany: a, cimke: idoSzoveg(elso + (utolso - elso) * a) });
  }
  return ki;
}

/**
 * A függőleges tengely osztásai: kerek számok a 0 és a `max` között.
 * @returns {{arany:number, cimke:string, ertek:number}[]}
 */
export function ertekTengely(max, db = 4) {
  const ki = [];
  const n = Math.max(2, db | 0);
  const lepes = _kerekLepes(max / (n - 1));
  const teto = lepes * (n - 1);
  for (let i = 0; i < n; i++) {
    const v = lepes * i;
    ki.push({ arany: teto > 0 ? v / teto : 0, ertek: v, cimke: szamSzoveg(v) });
  }
  return ki;
}

/** Kerek osztásköz (1 / 2 / 5 × 10^k) — a tengely így olvasható marad. */
function _kerekLepes(nyers) {
  if (!(nyers > 0)) return 1;
  const nagysag = Math.pow(10, Math.floor(Math.log10(nyers)));
  const arany = nyers / nagysag;
  const v = arany <= 1 ? 1 : arany <= 2 ? 2 : arany <= 5 ? 5 : 10;
  return v * nagysag;
}

/** A közös tengely teteje egy sorozathoz — sosem 0, hogy legyen mihez skálázni. */
export function tengelyTeto(gyujto, kulcs) {
  const h = gyujto.hatar(kulcs);
  const m = h.max > 0 ? h.max : 1;
  const n = ertekTengely(m, 4);
  return n[n.length - 1].ertek || m;
}
