// AGE OF THE CRYSTALS — A FŐMENÜ ÁLLAPOTGÉPE (v0.11/2): DOM-mentes adatréteg.
//
// ── MIÉRT NEM HOZ LÉTRE `Sim`-ET ──────────────────────────────────────────
// EZ A FÁJL LEGFONTOSABB SZABÁLYA. A menü KONFIGURÁCIÓT ad vissza, a világot a
// hívó (`main.js`) építi fel belőle. Két oka van, és egyik sem ízlés kérdése:
//
//   1. A v0.8 LOCKSTEPJE. A meccs-konfigot (seed, pályaméret, preset, civek,
//      nehézség) a `Sim` létrejötte ELŐTT kell egyeztetni a hálózaton — a két
//      gép ugyanabból a számhalmazból építi ugyanazt a világot. Ha a menü maga
//      példányosítana, a hálózati ág kénytelen lenne megkerülni a menüt, és
//      onnantól két külön út vezetne ugyanabba a `Sim`-be. Kettőt pedig nem
//      lehet egyszerre helyesen tartani.
//   2. A DETERMINIZMUS-SZONDA A MENÜT SOSEM FUTTATJA. A `npm run det`
//      forgatókönyvekből dolgozik, és a menü nincs bennük. Ami világot építene
//      itt, az a kapun KÍVÜL maradna — pontosan az a rés, ahol a projekt már
//      háromszor megégett (zöld kapu egy halott rendszer mellett).
//
// Ezért ez a réteg nem importál `Sim`-et, nem ír sim-állapotot, és nem ismer
// DOM-ot sem: NODE-BAN FUT, és a `tools/menu_szonda.mjs` végig is járja.
//
// ── MIÉRT ITT VAN AZ ÉRVÉNYESSÉG-ELLENŐRZÉS ───────────────────────────────
// A `Sim` szándékosan MEGENGEDŐ: az ismeretlen presetre csendben a nyílt mezőt
// adja (`terkepBeallitas`), a seedet `>>> 0`-val vágja, a `civValaszt` a rossz
// csapatot szó nélkül eldobja. Ez a szimuláció szintjén helyes — egy elgépelés
// ne tegyen elérhetetlenné egy meccset —, de azt jelenti, hogy ROSSZ BEMENETRE
// NEM SZÓL SENKI. A menü az UTOLSÓ hely, ahol a játékosnak még el lehet
// mondani, mi a baj; utána már csak egy „miért nem ezt a pályát kaptam" marad.
//
// Ezért itt MINDEN mező saját, NÉVVEL azonosított hibaüzenetet ad, és a
// `terkepErvenyes()`-t meg a `CIV_DB`-t használjuk, nem saját másolt listát:
// egy hetedik preset vagy egy kilencedik nép így magától érvényes lesz.
//
// ── ⚠️ A SEED ALAPÉRTELMEZÉSE NEM JÖHET AZ ÓRÁRÓL ─────────────────────────
// Csábító lenne `Date.now()`-ból vagy `Math.random()`-ból seedelni „hogy minden
// meccs más legyen". A v0.8-ban ez azonnali desync: a két gépnek UGYANAZT a
// seedet kell kapnia, márpedig két gép órája sosem egyezik. A seed ezért a
// HÍVÓTÓL jön (`new MenuAllapot({ seed })`), és ha nem ad, a `core/config.js`
// RÖGZÍTETT `SEED` konstansa lép be. A menü-szonda statikusan is szűri, hogy
// ebben a fájlban ne legyen óra és ne legyen `Math.random`.
//
// ── MIÉRT VEREM A NAVIGÁCIÓ, ÉS NEM RÖGZÍTETT „VISSZA" CÉL ────────────────
// Az indítás-képernyőre KÉT úton lehet eljutni: új játékon és betöltésen át.
// Egy táblázatba írt, rögzített `vissza: CIV_VALASZTO` az egyik ágon hazudna —
// a betöltésből érkező játékos a népválasztóban kötne ki, egy olyan meccshez,
// aminek a civjei a mentésből jönnek. A `vissza` ezért VEREM-pop: mindig oda
// visz, ahonnan jöttünk. A táblázat így csak ELŐRE-lépéseket deklarál, és a
// szonda a valódi `lep()`-et hajtja meg, nem a táblázatot hiszi el.
//
// ── MIÉRT KÜLÖN A BEÁLLÍTÁS ÉS A MECCS-KONFIG ─────────────────────────────
// A hangerő, az árnyék és a kamera-sebesség GÉPENKÉNT MÁS lehet, és pont ezért
// nem szabad a meccs-konfigba keverni: a v0.8-ban a meccs-konfigot a két gép
// egyezteti, és ha benne lenne a hangerő, két azonos meccs „eltérőnek"
// látszana. A `konfig()` és a `beallitasok()` ezért két külön felület.
//
// ── ALLOKÁCIÓ ─────────────────────────────────────────────────────────────
// Ez a réteg SZABADON allokál: menü-időben fut, kattintásonként egyszer, nem
// képkockánként. A rajzoló út (`menu.js`) ezt a szerkezetet EGYSZER építi fel,
// és utána már csak szöveget és `dataset`-et ír — ott marad a nulla per-frame
// allokáció.

import { TERKEP, TERKEP_DB, TERKEP_NEV, TERKEP_LEIRAS, terkepErvenyes } from '../sim/terkep.js';
import { NEHEZSEG, NEHEZSEG_NEV } from '../sim/ai.js';
import { CIV_DB, CIV_NEV, CIV_NINCS } from '../sim/civ.js';
import { MENTES_VERZIO } from '../sim/mentes.js';
import { SEED, PALYA_N } from '../core/config.js';

// ── KÉPERNYŐK ────────────────────────────────────────────────────────────

/** A menü képernyői. A sorrend az indexük — a nevek tömbje ehhez van kötve. */
export const KEPERNYO = {
  FOMENU: 0,
  UJ_JATEK: 1,
  CIV_VALASZTO: 2,
  INDITAS: 3,
  BETOLTES: 4,
  BEALLITASOK: 5,
};
export const KEPERNYO_DB = 6;

export const KEPERNYO_NEV = [
  'Főmenü',
  'Új játék',
  'Népválasztás',
  'Indítás',
  'Betöltés',
  'Beállítások',
];

/**
 * AZ ELŐRE-LÉPÉSEK, képernyőnként. A `vissza` SZÁNDÉKOSAN nincs benne: az
 * verem-pop, nem táblázat-sor (lásd a fejlécet).
 *
 * A `cim` a gomb felirata — a `menu.js` innen veszi, nem saját listából. Így
 * egy új képernyő EGY táblázat-sor, nem két fájl átírása, és a szonda
 * gráf-bejárása magától megtalálja.
 */
export const ATMENETEK = [
  // FŐMENÜ
  [
    { akcio: 'uj_jatek', cel: KEPERNYO.UJ_JATEK, cim: 'Új játék' },
    { akcio: 'betoltes', cel: KEPERNYO.BETOLTES, cim: 'Betöltés' },
    { akcio: 'beallitasok', cel: KEPERNYO.BEALLITASOK, cim: 'Beállítások' },
  ],
  // ÚJ JÁTÉK (meccs-beállítások)
  [
    { akcio: 'tovabb', cel: KEPERNYO.CIV_VALASZTO, cim: 'Tovább: népválasztás' },
  ],
  // NÉPVÁLASZTÁS
  [
    { akcio: 'tovabb', cel: KEPERNYO.INDITAS, cim: 'Mehet a meccs' },
  ],
  // INDÍTÁS (a konfig kész, a hívó példányosít)
  [],
  // BETÖLTÉS
  [
    { akcio: 'tovabb', cel: KEPERNYO.INDITAS, cim: 'Mentés folytatása' },
  ],
  // BEÁLLÍTÁSOK
  [],
];

// ── MEZŐK ÉS ÉRVÉNYESSÉG ─────────────────────────────────────────────────

/** A meccs-konfig ellenőrzött mezői. A `civ0`/`civ1` külön néven szerepel. */
export const MEZOK = [
  'seed', 'n', 'terkep', 'nehezseg', 'maxEgyseg', 'sajatCsapat', 'civ0', 'civ1',
];

/** A mezők JÁTÉKOSNAK szóló neve — a hibaüzenetek ezt mondják, nem a kulcsot. */
export const MEZO_NEV = {
  seed: 'seed',
  n: 'pályaméret',
  terkep: 'térkép',
  nehezseg: 'nehézség',
  maxEgyseg: 'egység-korlát',
  sajatCsapat: 'a te oldalad',
  civ0: 'a te néped',
  civ1: 'az ellenfél népe',
  mentes: 'mentés',
};

/** Azok a mezők, amiket a mentés HOZ MAGÁVAL — a betöltés-ág ezeket felülírja. */
const ALAP_MEZOK = ['seed', 'n', 'terkep', 'nehezseg', 'maxEgyseg', 'sajatCsapat'];

/** A `Sim` a seedet `>>> 0`-val vágja: 32 bites előjeltelen a valódi tartomány. */
const SEED_MAX = 4294967295;
/** Pályaméret-korlátok. Alul a bázisok elférése, felül a memória szab határt. */
const N_MIN = 64;
const N_MAX = 1024;
/** Egység-korlát: a `Sim.maxEgyseg`. Alul értelmetlen, felül mérhetetlen. */
const MAX_EGYSEG_MIN = 200;
const MAX_EGYSEG_MAX = 8000;

/** A menü által FELKÍNÁLT pályaméretek. Az érvényesség ennél tágabb (lásd lent). */
export const PALYA_MERETEK = [
  { n: 128, nev: 'kicsi', leiras: 'Gyors meccs, korai összecsapással.' },
  { n: 192, nev: 'közepes', leiras: 'Van hely terjeszkedni, de nem sok.' },
  { n: PALYA_N, nev: 'nagy', leiras: 'Az alapértelmezett pálya — ezen mérünk.' },
  { n: 384, nev: 'óriás', leiras: 'Hosszú meccs, két teljes gazdasággal.' },
];

/** Az egység-korlát felkínált fokozatai. */
export const EGYSEG_KORLATOK = [1200, 2400, 4000];

/** Emberi alak egy ÉRTÉKRŐL a hibaüzenetben — a nyers `String()` félrevezetne. */
function _mutat(ertek) {
  if (typeof ertek === 'string') return '„' + ertek + '"';
  if (ertek === null) return 'null';
  if (typeof ertek === 'object') return Object.prototype.toString.call(ertek);
  return String(ertek);
}

function _hiba(mezo, ertek, szoveg) {
  return { ok: false, mezo, ertek, hiba: szoveg };
}

/**
 * EGY MEZŐ ÉRVÉNYESSÉGE — az EGYETLEN hely, ahol el van döntve.
 *
 * A `beallit()`, az `ellenoriz()` és a mentés-fejléc olvasása mind ezt hívja:
 * enélkül a menü egy helyen elfogadná, amit a másikon elutasít, és a hiba a
 * `Sim` létrejötte UTÁN jönne elő.
 *
 * @param {string} mezo `MEZOK` egyike
 * @param {*} ertek
 * @returns {{ok:true}|{ok:false, mezo:string, ertek:*, hiba:string}}
 */
export function mezoErvenyes(mezo, ertek) {
  switch (mezo) {
    case 'seed':
      if (!Number.isInteger(ertek)) {
        return _hiba(mezo, ertek, 'a seed csak egész szám lehet, ez meg ' + _mutat(ertek));
      }
      if (ertek < 0 || ertek > SEED_MAX) {
        return _hiba(mezo, ertek, 'a seed 0 és ' + SEED_MAX + ' közé esik (32 bit), ez meg ' + _mutat(ertek));
      }
      return { ok: true };

    case 'n':
      if (!Number.isInteger(ertek)) {
        return _hiba(mezo, ertek, 'a pályaméret csak egész cella-szám lehet, ez meg ' + _mutat(ertek));
      }
      if (ertek < N_MIN || ertek > N_MAX) {
        return _hiba(mezo, ertek, 'a pályaméret ' + N_MIN + ' és ' + N_MAX + ' cella közé esik, ez meg ' + _mutat(ertek));
      }
      return { ok: true };

    case 'terkep':
      // A `terkepErvenyes()` a `terkep.js`-é — saját lista itt SOHA nem lehet,
      // különben egy hetedik preset a menüben ismeretlen maradna.
      if (!terkepErvenyes(ertek)) {
        return _hiba(mezo, ertek, 'ismeretlen térkép-preset: ' + _mutat(ertek)
          + ' (0…' + (TERKEP_DB - 1) + ' az érvényes)');
      }
      return { ok: true };

    case 'nehezseg':
      if (!Number.isInteger(ertek) || ertek < 0 || ertek >= NEHEZSEG_NEV.length) {
        return _hiba(mezo, ertek, 'ismeretlen nehézség: ' + _mutat(ertek)
          + ' (' + NEHEZSEG_NEV.join(' / ') + ')');
      }
      return { ok: true };

    case 'maxEgyseg':
      if (!Number.isInteger(ertek) || ertek < MAX_EGYSEG_MIN || ertek > MAX_EGYSEG_MAX) {
        return _hiba(mezo, ertek, 'az egység-korlát ' + MAX_EGYSEG_MIN + ' és '
          + MAX_EGYSEG_MAX + ' közé esik, ez meg ' + _mutat(ertek));
      }
      return { ok: true };

    case 'sajatCsapat':
      if (ertek !== 0 && ertek !== 1) {
        return _hiba(mezo, ertek, 'a saját oldal csak 0 vagy 1 lehet, ez meg ' + _mutat(ertek));
      }
      return { ok: true };

    case 'civ0':
    case 'civ1':
      // A KI NEM VÁLASZTOTT nép külön üzenetet kap: az nem elgépelés, hanem
      // egy meg nem hozott döntés, és a játékosnak mást kell mondani rá.
      if (ertek === CIV_NINCS) {
        return _hiba(mezo, ertek, MEZO_NEV[mezo] + ' még nincs kiválasztva');
      }
      if (!Number.isInteger(ertek) || ertek < 0 || ertek >= CIV_DB) {
        return _hiba(mezo, ertek, 'ismeretlen nép: ' + _mutat(ertek)
          + ' (0…' + (CIV_DB - 1) + ' az érvényes)');
      }
      return { ok: true };

    default:
      return _hiba(mezo, ertek, 'ismeretlen mező: ' + _mutat(mezo));
  }
}

// ── MENTÉS-FEJLÉC ────────────────────────────────────────────────────────

/**
 * EGY MENTÉS FEJLÉCE — a betöltés-lap ebből dolgozik.
 *
 * ⚠️ MIÉRT VESZI ÁT A MENTÉS A SEEDET, A MÉRETET ÉS A PRESETET: a
 * `mentes.js → betoltes()` HÁROM dolgot vet össze a már létező `Sim`-mel
 * (seed, `n`, `terkep`), és eltérésre elutasít. A hívó viszont a menü konfigja
 * alapján hozza létre a `Sim`-et — ha a menü a saját seedjét adná, a betöltés
 * „más seed: a terep nem egyezne" hibával halna el MINDEN mentésre. A mentés
 * kiválasztása ezért felülírja a három mezőt; ez nem kényelmi funkció, hanem
 * az egyetlen mód, hogy a betöltés egyáltalán működjön.
 *
 * A mentés TELJES épségét nem itt vizsgáljuk — az a `betoltes()` dolga. Itt
 * csak annyi kell, ami a `Sim` MEGÉPÍTÉSÉHEZ szükséges.
 *
 * @param {string} szoveg a `mentesSzoveg()` kimenete
 * @returns {{ok:boolean, hiba?:string, fejlec?:{seed:number,n:number,terkep:number,tick:number,verzio:number}}}
 */
export function mentesFejlec(szoveg) {
  if (typeof szoveg !== 'string' || szoveg.length === 0) {
    return { ok: false, hiba: 'üres mentés' };
  }
  let m;
  try { m = JSON.parse(szoveg); } catch (h) { return { ok: false, hiba: 'olvashatatlan mentés' }; }
  if (!m || typeof m !== 'object') return { ok: false, hiba: 'üres mentés' };
  if (m.verzio !== MENTES_VERZIO) {
    return { ok: false, hiba: 'ismeretlen mentés-verzió: ' + _mutat(m.verzio)
      + ' (a mostani ' + MENTES_VERZIO + ')' };
  }
  for (const mezo of ['seed', 'n', 'terkep']) {
    const e = mezoErvenyes(mezo, m[mezo]);
    if (!e.ok) return { ok: false, hiba: 'a mentés ' + MEZO_NEV[mezo] + '-mezője hibás: ' + e.hiba };
  }
  return {
    ok: true,
    fejlec: {
      seed: m.seed, n: m.n, terkep: m.terkep,
      tick: Number.isInteger(m.tick) ? m.tick : 0,
      verzio: m.verzio,
    },
  };
}

// ── FELKÍNÁLT LISTÁK (a rajzoló réteg ezekből épít) ──────────────────────

/** A hat térkép-preset, névvel és leírással — a `terkep.js` tábláiból. */
export function terkepLista() {
  const ki = [];
  for (let t = 0; t < TERKEP_DB; t++) {
    ki.push({ terkep: t, nev: TERKEP_NEV[t], leiras: TERKEP_LEIRAS[t] });
  }
  return ki;
}

/** A nehézségi fokozatok — az `ai.js` táblájából. */
export function nehezsegLista() {
  const ki = [];
  for (let i = 0; i < NEHEZSEG_NEV.length; i++) ki.push({ nehezseg: i, nev: NEHEZSEG_NEV[i] });
  return ki;
}

/** A felkínált pályaméretek. */
export function meretLista() { return PALYA_MERETEK.slice(); }

// ── AZ ÁLLAPOTGÉP ────────────────────────────────────────────────────────

export class MenuAllapot {
  /**
   * @param {{
   *   seed?:number, n?:number, terkep?:number, nehezseg?:number,
   *   maxEgyseg?:number, sajatCsapat?:number,
   *   tarolo?:{kulcsok:()=>string[], olvas:(k:string)=>(string|null)}
   * }} [opciok]
   *
   * ⚠️ A KAPOTT ÉRTÉKEKET NEM JAVÍTJUK KI CSENDBEN. Ha a hívó rossz seedet ad,
   * az úgy is marad, és az `ellenoriz()` NÉVVEL utasítja el. Egy „majd
   * behelyettesítem az alapértelmezést" ág pont azt a hibát nyelné el, ami
   * miatt ez a réteg egyáltalán létezik.
   */
  constructor(opciok = {}) {
    this._konfig = {
      // A SEED A HÍVÓTÓL. Ha nem ad, a `config.js` RÖGZÍTETT konstansa jön —
      // nem óra, nem `Math.random`. Lásd a fejléc ⚠️ szakaszát.
      seed: opciok.seed ?? SEED,
      n: opciok.n ?? PALYA_N,
      terkep: opciok.terkep ?? TERKEP.NYILT_MEZO,
      nehezseg: opciok.nehezseg ?? NEHEZSEG.KOZEPES,
      maxEgyseg: opciok.maxEgyseg ?? 2400,
      sajatCsapat: opciok.sajatCsapat ?? 0,
      /** `[saját, ellenfél]` — kezdetben EGYIK SINCS kiválasztva. */
      civ: [CIV_NINCS, CIV_NINCS],
      /** Betöltés-ágon a mentés SZÖVEGE, új játéknál `null`. */
      mentes: null,
      /** A mentés kulcsa a tárolóban — a hívónak diagnosztika, nem a `Sim`-nek. */
      mentesKulcs: null,
    };

    /** GÉPENKÉNTI beállítások. SOSEM mennek át a hálózaton — lásd a fejlécet. */
    this._beallitas = { hangEro: 70, zeneEro: 45, arnyek: true, kameraSebesseg: 100 };

    this._tarolo = opciok.tarolo || null;
    this._kepernyo = KEPERNYO.FOMENU;
    /** A navigációs verem — a `vissza` ebből popol. */
    this._verem = [];
    /** `'uj'` vagy `'betoltes'` — melyik ágon vagyunk. */
    this._mod = 'uj';
    /** Az utolsó elutasítás okai, hogy a felület ki tudja írni. */
    this._hibak = [];
  }

  // ── Navigáció ──────────────────────────────────────────────────────────

  get kepernyo() { return this._kepernyo; }
  get kepernyoNev() { return KEPERNYO_NEV[this._kepernyo]; }
  get mod() { return this._mod; }
  /** A verem MÁSOLATA — a felület mutathatja az utat, de nem írhatja át. */
  get utvonal() { return this._verem.slice(); }
  /** Az utolsó elutasítás okai: `[{mezo, ertek, hiba}]`. */
  get hibak() { return this._hibak.slice(); }

  /**
   * A jelenlegi képernyő LÉPÉSEI, mindegyik mellett hogy MEHET-E most.
   * A rajzoló réteg ebből épít gombot, és a tiltott gombhoz kiírja az okot —
   * a menü így sosem „nem csinál semmit" kattintásra.
   */
  akciok() {
    const ki = [];
    const lista = ATMENETEK[this._kepernyo] || [];
    for (let i = 0; i < lista.length; i++) {
      const t = lista[i];
      const o = this._orzo(this._kepernyo, t.akcio);
      ki.push({ akcio: t.akcio, cel: t.cel, cim: t.cim, lehet: o.ok, hibak: o.hibak });
    }
    if (this._verem.length > 0) {
      ki.push({ akcio: 'vissza', cel: this._verem[this._verem.length - 1], cim: 'Vissza', lehet: true, hibak: [] });
    }
    return ki;
  }

  /** Mehet-e most ez a lépés? A gomb tiltásához és a szonda gátjaihoz. */
  lephet(akcio) {
    if (akcio === 'vissza') {
      return this._verem.length > 0
        ? { ok: true, hibak: [] }
        : { ok: false, hibak: [{ mezo: 'kepernyo', ertek: this._kepernyo, hiba: 'a főmenüből nincs hova visszalépni' }] };
    }
    const t = this._talal(this._kepernyo, akcio);
    if (!t) {
      return {
        ok: false,
        hibak: [{
          mezo: 'akcio', ertek: akcio,
          hiba: 'a(z) „' + KEPERNYO_NEV[this._kepernyo] + '" képernyőn nincs ilyen lépés: ' + _mutat(akcio),
        }],
      };
    }
    return this._orzo(this._kepernyo, akcio);
  }

  /**
   * LÉPÉS. Ez az EGYETLEN mód a képernyő megváltoztatására.
   *
   * @param {string} akcio `ATMENETEK` valamelyik akciója, vagy `'vissza'`
   * @returns {{ok:boolean, kepernyo:number, hibak:{mezo:string,ertek:*,hiba:string}[]}}
   */
  lep(akcio) {
    const e = this.lephet(akcio);
    if (!e.ok) {
      this._hibak = e.hibak;
      return { ok: false, kepernyo: this._kepernyo, hibak: e.hibak };
    }
    this._hibak = [];
    if (akcio === 'vissza') {
      this._kepernyo = this._verem.pop();
    } else {
      const t = this._talal(this._kepernyo, akcio);
      this._verem.push(this._kepernyo);
      this._kepernyo = t.cel;
    }
    this._belepes(this._kepernyo);
    return { ok: true, kepernyo: this._kepernyo, hibak: [] };
  }

  /** Kényelmi forma — ugyanaz, mint a `lep('vissza')`. */
  vissza() { return this.lep('vissza'); }

  _talal(kepernyo, akcio) {
    const lista = ATMENETEK[kepernyo] || [];
    for (let i = 0; i < lista.length; i++) if (lista[i].akcio === akcio) return lista[i];
    return null;
  }

  /**
   * BELÉPÉS EGY KÉPERNYŐRE — az ág beállítása.
   *
   * A két ág (új játék / betöltés) ugyanabba az indítás-képernyőbe fut, de MÁS
   * mezőket követel meg. Az ágat ezért a belépés írja, nem a `lep()` hívója:
   * így egy „vissza a főmenübe, aztán mégis új játék" út is tisztán vált.
   */
  _belepes(kepernyo) {
    if (kepernyo === KEPERNYO.UJ_JATEK) {
      this._mod = 'uj';
      this._konfig.mentes = null;
      this._konfig.mentesKulcs = null;
    } else if (kepernyo === KEPERNYO.BETOLTES) {
      this._mod = 'betoltes';
    }
  }

  /**
   * A LÉPÉS ŐRE — mit kell tudni ahhoz, hogy tovább lehessen menni.
   *
   * A meccs-beállítások az ÚJ JÁTÉK lapról továbblépve dőlnek el (ott van
   * felületük), a népek a NÉPVÁLASZTÓBÓL. Így a hibás seedről nem a
   * népválasztás végén derül ki, hogy hibás.
   */
  _orzo(kepernyo, akcio) {
    if (kepernyo === KEPERNYO.UJ_JATEK && akcio === 'tovabb') {
      return this.ellenoriz(ALAP_MEZOK);
    }
    if (akcio === 'tovabb'
      && (kepernyo === KEPERNYO.CIV_VALASZTO || kepernyo === KEPERNYO.BETOLTES)) {
      return this.ellenoriz();
    }
    return { ok: true, hibak: [] };
  }

  // ── Konfiguráció ───────────────────────────────────────────────────────

  _ertek(mezo) {
    if (mezo === 'civ0') return this._konfig.civ[0];
    if (mezo === 'civ1') return this._konfig.civ[1];
    return this._konfig[mezo];
  }

  /**
   * EGY MEZŐ BEÁLLÍTÁSA. Érvénytelen érték NEM kerül be — a menü állapota így
   * sosem lesz „félig rossz", és a hívó azonnal megkapja az okot.
   *
   * @returns {{ok:true, mezo:string, ertek:*}|{ok:false, mezo:string, ertek:*, hiba:string}}
   */
  beallit(mezo, ertek) {
    const e = mezoErvenyes(mezo, ertek);
    if (!e.ok) { this._hibak = [e]; return e; }
    if (mezo === 'civ0') this._konfig.civ[0] = ertek;
    else if (mezo === 'civ1') this._konfig.civ[1] = ertek;
    else this._konfig[mezo] = ertek;
    this._hibak = [];
    return { ok: true, mezo, ertek };
  }

  /**
   * A jelenlegi konfiguráció MÁSOLATA — kiírásra és a `meccsKonfig()`-nak.
   *
   * Másolat, nem hivatkozás: a felület különben a menü belső állapotát írná át
   * egy `konfig().civ[0] = …`-val, és a menü érvényesség-ellenőrzése mellett
   * jutna be rossz érték.
   */
  konfig() {
    const k = this._konfig;
    return {
      seed: k.seed,
      n: k.n,
      terkep: k.terkep,
      civ: [k.civ[0], k.civ[1]],
      nehezseg: k.nehezseg,
      maxEgyseg: k.maxEgyseg,
      sajatCsapat: k.sajatCsapat,
      mentes: k.mentes,
      mentesKulcs: k.mentesKulcs,
    };
  }

  /** A GÉPENKÉNTI beállítások másolata. NEM része a meccs-konfignak. */
  beallitasok() {
    const b = this._beallitas;
    return { hangEro: b.hangEro, zeneEro: b.zeneEro, arnyek: b.arnyek, kameraSebesseg: b.kameraSebesseg };
  }

  /**
   * Egy gépenkénti beállítás. Külön kapu, mert MÁS a szabálya: ide a rossz
   * érték is csak korlátozódik, nem utasítjuk el — egy hangerő miatt nem
   * érdemes a játékost megállítani.
   */
  beallitasBeallit(mezo, ertek) {
    const b = this._beallitas;
    if (mezo === 'arnyek') { b.arnyek = !!ertek; return { ok: true, mezo, ertek: b.arnyek }; }
    const szam = Number(ertek);
    if (!Number.isFinite(szam)) return { ok: false, mezo, ertek, hiba: 'nem szám: ' + _mutat(ertek) };
    if (mezo === 'hangEro' || mezo === 'zeneEro') {
      b[mezo] = Math.max(0, Math.min(100, Math.round(szam)));
      return { ok: true, mezo, ertek: b[mezo] };
    }
    if (mezo === 'kameraSebesseg') {
      b.kameraSebesseg = Math.max(25, Math.min(300, Math.round(szam)));
      return { ok: true, mezo, ertek: b.kameraSebesseg };
    }
    return { ok: false, mezo, ertek, hiba: 'ismeretlen beállítás: ' + _mutat(mezo) };
  }

  /**
   * TELJES ELLENŐRZÉS. Ez fut a továbblépés előtt és a `meccsKonfig()`-ban is.
   *
   * @param {string[]} [mezok] csak ezek a mezők (a részleges őrökhöz)
   * @returns {{ok:boolean, hibak:{mezo:string,ertek:*,hiba:string}[]}}
   */
  ellenoriz(mezok) {
    const lista = mezok || this._mezoLista();
    const hibak = [];
    for (let i = 0; i < lista.length; i++) {
      const e = mezoErvenyes(lista[i], this._ertek(lista[i]));
      if (!e.ok) hibak.push({ mezo: e.mezo, ertek: e.ertek, hiba: e.hiba });
    }
    // A betöltés-ág EXTRA feltétele: kell kiválasztott, olvasható mentés.
    if (!mezok && this._mod === 'betoltes' && this._konfig.mentes === null) {
      hibak.push({ mezo: 'mentes', ertek: null, hiba: 'nincs kiválasztott mentés' });
    }
    return { ok: hibak.length === 0, hibak };
  }

  /**
   * MELY MEZŐK KÖTELEZŐEK EBBEN AZ ÁGBAN.
   *
   * Betöltéskor a népeket a MENTÉS hozza (`civValasztas` benne van), tehát a
   * menü nem követelheti meg őket — különben a betöltés-ág soha nem indulna el.
   */
  _mezoLista() {
    return this._mod === 'betoltes' ? ALAP_MEZOK.slice() : MEZOK.slice();
  }

  /**
   * A MECCS-KONFIG — a menü egyetlen KIMENETE.
   *
   * Csak az indítás-képernyőn, csak érvényes állapotból. A hívó ebből épít
   * `Sim`-et; a menü magától sosem tesz ilyet (lásd a fejlécet).
   *
   * @returns {{ok:true, konfig:object}|{ok:false, hibak:{mezo:string,ertek:*,hiba:string}[]}}
   */
  meccsKonfig() {
    if (this._kepernyo !== KEPERNYO.INDITAS) {
      return {
        ok: false,
        hibak: [{
          mezo: 'kepernyo', ertek: this._kepernyo,
          hiba: 'a meccs-konfig csak az indítás képernyőn kérhető el, most itt vagyunk: '
            + KEPERNYO_NEV[this._kepernyo],
        }],
      };
    }
    const e = this.ellenoriz();
    if (!e.ok) return { ok: false, hibak: e.hibak };
    return { ok: true, konfig: this.konfig() };
  }

  // ── Mentések ───────────────────────────────────────────────────────────

  /**
   * A TÁROLÓBAN LÉVŐ MENTÉSEK — mindegyik a saját fejlécével VAGY a hibájával.
   *
   * A hibás mentést NEM rejtjük el: egy eltűnt mentés-sor sokkal rosszabb, mint
   * egy „ez a mentés régi verziójú" felirat — a játékos az elsőnél azt hiszi,
   * elveszett a meccse.
   */
  mentesLista() {
    const ki = [];
    if (!this._tarolo) return ki;
    const kulcsok = this._tarolo.kulcsok() || [];
    for (let i = 0; i < kulcsok.length; i++) {
      const kulcs = kulcsok[i];
      const szoveg = this._tarolo.olvas(kulcs);
      const f = mentesFejlec(szoveg);
      if (f.ok) {
        ki.push({
          kulcs, ervenyes: true, hiba: null,
          seed: f.fejlec.seed, n: f.fejlec.n, terkep: f.fejlec.terkep,
          tick: f.fejlec.tick, verzio: f.fejlec.verzio,
          cim: TERKEP_NEV[f.fejlec.terkep] + ' · ' + f.fejlec.n + '×' + f.fejlec.n
            + ' · ' + f.fejlec.tick + '. tick',
        });
      } else {
        ki.push({ kulcs, ervenyes: false, hiba: f.hiba, cim: kulcs + ' — ' + f.hiba });
      }
    }
    return ki;
  }

  /**
   * EGY MENTÉS KIVÁLASZTÁSA. A fejléce felülírja a seedet, a méretet és a
   * presetet — lásd a `mentesFejlec()` ⚠️ szakaszát.
   */
  mentesValaszt(kulcs) {
    if (!this._tarolo) {
      const e = { ok: false, mezo: 'mentes', ertek: kulcs, hiba: 'nincs mentés-tároló' };
      this._hibak = [e]; return e;
    }
    const szoveg = this._tarolo.olvas(kulcs);
    const f = mentesFejlec(szoveg);
    if (!f.ok) {
      const e = { ok: false, mezo: 'mentes', ertek: kulcs, hiba: f.hiba };
      this._hibak = [e]; return e;
    }
    this._konfig.seed = f.fejlec.seed;
    this._konfig.n = f.fejlec.n;
    this._konfig.terkep = f.fejlec.terkep;
    this._konfig.mentes = szoveg;
    this._konfig.mentesKulcs = kulcs;
    this._hibak = [];
    return { ok: true, mezo: 'mentes', ertek: kulcs, fejlec: f.fejlec };
  }
}

export { TERKEP, TERKEP_DB, TERKEP_NEV, TERKEP_LEIRAS, NEHEZSEG, NEHEZSEG_NEV, CIV_NEV, CIV_NINCS, CIV_DB };
