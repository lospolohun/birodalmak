// AGE OF THE CRYSTALS — A KÉPZÉS-PANEL ADATRÉTEGE (v0.16).
//
// ── MIÉRT VAN EZ KÜLÖN A PANELTŐL ─────────────────────────────────────────
// Ez a modul nem tud a DOM-ról, tehát NODE-BAN FUT, tehát SZONDÁZHATÓ. A panel
// maga csak kirajzolja, amit itt kiszámolunk. A szétválasztás nem elvi
// szépészet: a képzés az a réteg, ahol a „zöld kapu, halott rendszer" hiba a
// legolcsóbban megbújik — a gomb ott van, kattintható, a parancs elmegy, és a
// sim csendben eldobja. Se hibaüzenet, se konzol-log, se hash-változás. Amíg a
// TILTÁS OKA nem szám és nem szöveg, addig senki nem veszi észre.
//
// Ezért ez a réteg nem csak azt mondja meg, hogy MIT lehet képezni, hanem azt
// is, hogy amit nem lehet, azt MIÉRT nem — a sim `Kepzes.sorba()` ELUTASÍTÁSI
// SORRENDJÉBEN. Ha a kettő elcsúszik, a panel hazudik: azt írja ki, hogy
// „nincs elég étel", miközben valójában a népesség-plafon állt az útban.
//
// ── AZ IGAZSÁG EGYETLEN FORRÁSA A SIM ─────────────────────────────────────
// Semmilyen szabályt NEM másolunk le ide. A „képezheti-e ez az épület ezt az
// egységet" kérdésre a `Kepzes.kepezheti(epTipus, egysegTipus, csapat)` felel —
// az az egy hívás kezeli a `KEPEZ` tábla rövidségét (`!lista` őr: a torony és a
// piac nem képez) ÉS a `TIPUS.EGYEDI` civfüggő képző épületét is. Ha itt saját
// táblát tartanánk, az első balansz-változtatás után a panel más világot
// mutatna, mint amiben a játékos játszik.
//
// ⚠️ A `TIPUS` HAT HOSSZÚ, ÉS A HATODIK AZ `EGYEDI`. Ebben a projektben már
// KÉTSZER esett ki némán egy rövid tábla miatt. Ezért itt minden típus-hosszú
// tábla hossza ELLENŐRZÖTT — modul-betöltéskor dobunk, nem a hatodik gombot
// hagyjuk le. Ugyanez az elv, mint az `ikonok.js` ismeretlen-ikon dobásánál.
//
// ── AMIT A SIM NEM TUD, AZT NEM TALÁLJUK KI ───────────────────────────────
// Két dolog HIÁNYZIK a v0.16 simjéből, és ezt a panel nem pótolhatja hazugsággal:
//
//   • KORSZAK-KAPU A KÉPZÉSNÉL NINCS. A `Kepzes.sorba()` nem nézi a korszakot
//     (csak az épület, a sor, a népesség és az ár számít). Ha itt korszak-
//     tiltást találnánk ki, a panel olyat tiltana le, amit a sim megengedne —
//     vagyis a játékostól vennénk el egységeket egy kitalált szabállyal. Az
//     `OK.KORSZAK` kód ezért LÉTEZIK, de csak akkor kerül elő, ha a sim maga
//     kínál korszak-igényt (`Kepzes.korszakIgeny`) — addig sosem.
//   • SOR-TÖRLÉS SINCS. A `kepzes.js` fejléce kimondja: a v0.5-ben nincs
//     sor-törlés, mert a visszatérítés nyersanyagot TEREMTENE. Ezért a törlés
//     KÉPESSÉG-FELISMERÉSSEL megy (`torlesTamogatott`): ha a sim egyszer kap
//     törlést, a panel magától megjeleníti a gombot; addig nem rajzol oda halott
//     gombot. Egy kattintható, de semmit nem csináló ✕ pontosan az a hibafajta,
//     ami ellen ez az egész fájl készült.

import { TIPUS, TIPUS_DB } from '../sim/units.js';
import { EPULET_NEV } from '../sim/epuletek.js';
import { SOR_HOSSZ } from '../sim/kepzes.js';
import { Civ } from '../sim/civ.js';
import { TICK_HZ } from '../sim/sim.js';
import { NYERS_NEV } from '../sim/eroforras.js';
import { IKON } from './ikonok.js';

/** A hat egységtípus neve. Az `EGYEDI` neve CSAPATFÜGGŐ — lásd `egysegNev()`. */
export const EGYSEG_NEV = ['munkás', 'lándzsás', 'íjász', 'lovag', 'ostromgép', 'egyedi egység'];
/** Ikonnév típusonként. Az `ikonSvg` ismeretlen névre dob — ez itt szándékos őr. */
export const EGYSEG_IKON = [
  IKON.MUNKAS, IKON.LANDZSAS, IKON.IJASZ, IKON.LOVAG, IKON.OSTROMGEP, IKON.EGYEDI,
];
/** Ikonnév épülettípusonként, az `EPULET.*` sorrendjében (11 tag). */
export const EPULET_IKON = [
  IKON.KOZPONT, IKON.RAKTAR, IKON.FAL, IKON.KAPU, IKON.HAZ, IKON.LAKTANYA,
  IKON.IJASZDA, IKON.ISTALLO, IKON.OSTROMMUHELY, IKON.TORONY, IKON.PIAC,
];
/** Nyersanyag-ikonok a költség-csipeknek. */
export const NYERS_IKON = [IKON.ETEL, IKON.FA, IKON.KO, IKON.KRISTALY];

// ⚠️ A RÖVID TÁBLA ITT HAL MEG, NEM A KÉPERNYŐN. Lásd a fejlécet: a hatodik
// típus (EGYEDI) kétszer tűnt már el némán. Egy dobott hiba a betöltésnél
// olcsóbb, mint egy hiányzó gomb, amit senki nem keres.
if (EGYSEG_NEV.length !== TIPUS_DB || EGYSEG_IKON.length !== TIPUS_DB) {
  throw new Error('panel_kepzes_adat: rövid típus-tábla — nev ' + EGYSEG_NEV.length
    + ', ikon ' + EGYSEG_IKON.length + ', kell ' + TIPUS_DB
    + ' (a hatodik az EGYEDI, és pont az szokott lemaradni)');
}
if (EPULET_IKON.length !== EPULET_NEV.length) {
  throw new Error('panel_kepzes_adat: rövid épület-ikon tábla — ' + EPULET_IKON.length
    + ' a(z) ' + EPULET_NEV.length + ' helyett');
}

/**
 * MIÉRT NEM KÉPEZHETŐ — a `Kepzes.sorba()` elutasítási sorrendjében.
 * A sorrend maga is szerződés: a sim ebben a sorrendben dönt, tehát a panelnek
 * is ezt kell mondania, különben a helyes tiltást rossz indokkal magyarázza.
 */
export const OK = {
  KEPEZHETO: 0,
  NINCS_CIV: 1,      // EGYEDI, de a csapatnak nincs népe
  NINCS_EPULET: 2,   // nincs KÉSZ épülete, ami ezt képezné
  SOR_TELE: 3,       // minden képző épület sora tele (SOR_HOSSZ)
  NEPESSEG: 4,       // nem férne bele a népesség-keretbe
  NYERSANYAG: 5,     // nem telik rá
  KORSZAK: 6,        // csak ha a sim maga kínál korszak-igényt (ma nem)
};
export const OK_DB = 7;

/** Rövid, gombra írható ok. Sosem tartalmaz konstans-nevet és tömbindexet. */
export const OK_SZOVEG = [
  'képezhető',
  'ehhez a néphez nincs egyedi egység',
  'nincs hozzá kész képző épület',
  'a képző épület sora tele van',
  'nincs elég népesség-hely',
  'nincs elég nyersanyag',
  'a korszak még nem engedi',
];
/** Egy mondattal bővebben — a panel lábléce ezt írja ki. */
export const OK_TANACS = [
  'Kattints a gombra, és beáll a sorba.',
  'Az egyedi egység a néphez tartozik: válassz népet a meccs indításakor.',
  'Építsd meg azt az épületet, ami ezt az egységet képzi.',
  'Várd meg, míg elkészül valamelyik a sorban állókból, vagy építs még egy képző épületet.',
  'Építs házat: a ház ad népesség-helyet, és a sorban állók már foglalják.',
  'Gyűjts még nyersanyagot — az ár a SORBAÁLLÁSKOR megy le, nem a végén.',
  'Lépj korszakot, utána válik elérhetővé.',
];

if (OK_SZOVEG.length !== OK_DB || OK_TANACS.length !== OK_DB) {
  throw new Error('panel_kepzes_adat: rövid ok-tábla');
}

/** Legfeljebb ennyi képző épület sorát mutatjuk egyszerre. */
export const MAX_SOR = 12;

/**
 * A KÉPZÉSI IDŐ TÁBLÁJA — MÁSOLAT, csak vésztartaléknak.
 *
 * ⚠️ A `kepzes.js` `EGYSEG_IDO`-ja NEM exportált, a `_ido()` viszont ott van a
 * példányon, és az a hiteles forrás (civ-százalékkal, egész osztással). Ezt a
 * másolatot CSAK akkor használjuk, ha a `_ido` eltűnne — és a szonda 5.
 * vizsgálata össze is méri a kapott számot a sim VALÓDI hátralévő idejével,
 * tehát ha ez a tábla elcsúszik, az kiderül, nem lappang.
 */
const EGYSEG_IDO_MASOLAT = [300, 200, 220, 300, 500, 200];

/** Egy típus képzési ideje tickben, a csapat civ-módosítójával együtt. */
export function egysegIdo(sim, csapat, tipus) {
  const k = sim.kepzes;
  if (typeof k._ido === 'function') return k._ido(csapat, tipus);
  const alap = tipus === TIPUS.EGYEDI
    ? sim.egyedi.ido[csapat & 1] : (EGYSEG_IDO_MASOLAT[tipus] | 0);
  return Civ.szazalek(alap, sim.civ.egysegIdoSzazalek(csapat, tipus));
}

/** Egy típus neve a csapat szemével: az egyedi egység a NÉP egységének nevén. */
export function egysegNev(sim, csapat, tipus) {
  if (tipus !== TIPUS.EGYEDI) return EGYSEG_NEV[tipus];
  return sim.egyedi.van(csapat) ? sim.egyedi.nev(csapat) : EGYSEG_NEV[TIPUS.EGYEDI];
}

/**
 * Támogatja-e a sim a sor-törlést? KÉPESSÉG-FELISMERÉS, nem feltételezés.
 * Lásd a fejlécet: ma nem támogatja, és halott gombot nem rajzolunk.
 */
export function torlesTamogatott(sim) {
  return !!(sim && sim.kepzes && typeof sim.kepzes.torol === 'function');
}

/**
 * Az állapot-puffer. A panel EGYSZER kéri, aztán minden frissítés ebbe ír —
 * a `frissit()` így nulla allokációval fut (a panel-szerződés 3. pontja).
 * @param {number} [maxSor]
 */
export function ujKepzesAllapot(maxSor = MAX_SOR) {
  const tetelek = new Array(TIPUS_DB);
  for (let t = 0; t < TIPUS_DB; t++) {
    tetelek[t] = {
      tipus: t,
      nev: EGYSEG_NEV[t],
      ikon: EGYSEG_IKON[t],
      /** [étel, fa, kő, kristály] — MÁR a civ-százalékkal. */
      ar: new Int32Array(4),
      /** Mennyi hiányzik még nyersanyagonként (0, ha van elég). */
      hianyzo: new Int32Array(4),
      ido: 0, idoMp: 0, nep: 0,
      /** HOL képződne: a kiválasztott épület indexe és típusa. */
      epulet: -1, epTipus: -1, epNev: '', epIkon: '',
      /** Hány KÉSZ épülete van a csapatnak, ami ezt képezné. */
      epuletDb: 0,
      /** Hány ilyen egység áll ÖSSZESEN sorban a csapatnál. */
      sorbanDb: 0,
      kepezheto: false,
      ok: OK.NINCS_EPULET,
    };
  }
  const sorok = new Array(maxSor);
  for (let s = 0; s < maxSor; s++) {
    sorok[s] = {
      epulet: -1, epTipus: -1, epNev: '', epIkon: '',
      db: 0, elemek: new Int32Array(SOR_HOSSZ),
      elsoTipus: -1, elsoNev: '',
      hatra: 0, hatraMp: 0, teljes: 0, szazalek: 0,
    };
  }
  return {
    csapat: 0,
    /** Népesség: foglalt + a MÁR SORBAN ÁLLÓK, a plafonhoz mérve. */
    foglalt: 0, sorbanNep: 0, maxNep: 0, szabadNep: 0, nepTele: false,
    keszlet: new Int32Array(4),
    tetelek,
    sorok, sorDb: 0, sorOsszes: 0, sorbanOsszes: 0,
    /** Számok a szondának: hány képezhető, hány tiltott, és melyik okból. */
    kepezhetoDb: 0, tiltottDb: 0, tiltottOkbol: new Int32Array(OK_DB),
    kepzoEpuletDb: 0,
    egyediNev: '', egyediVan: false,
    torlesTamogatott: false,
  };
}

/**
 * A teljes képzési kép EGY csapat szemével.
 *
 * @param {import('../sim/sim.js').Sim} sim
 * @param {number} csapat
 * @param {ReturnType<typeof ujKepzesAllapot>} ki  a `ujKepzesAllapot()` puffere
 * @returns {ReturnType<typeof ujKepzesAllapot>} `ki`
 */
export function kepzesAdat(sim, csapat, ki) {
  // ⚠️ A RÖVID PUFFER IS RÖVID TÁBLA. Ha a hívó öt tételre való puffert ad, a
  // hatodik (EGYEDI) csendben elveszne — pont a kétszer megtörtént hiba.
  if (!ki || !ki.tetelek || ki.tetelek.length !== TIPUS_DB) {
    throw new Error('kepzesAdat: a puffer ' + (ki && ki.tetelek ? ki.tetelek.length : '?')
      + ' tételes, kell ' + TIPUS_DB + ' (a hatodik az EGYEDI)');
  }

  const cs = csapat | 0;
  const kepzes = sim.kepzes;
  const epuletek = sim.epuletek;
  const gazdasag = sim.gazdasag;

  ki.csapat = cs;
  ki.torlesTamogatott = torlesTamogatott(sim);
  ki.egyediVan = sim.egyedi.van(cs);
  ki.egyediNev = egysegNev(sim, cs, TIPUS.EGYEDI);

  // ── 1. NÉPESSÉG ÉS KÉSZLET ────────────────────────────────────────────
  // A `sorbanNepesseg` végigjárja az összes sort — EGYSZER kérdezzük meg, nem
  // típusonként hatszor. A sim `sorba()`-ja pontosan ezzel a hárommal számol.
  const nep = gazdasag.nepessegAllapot(cs);
  ki.foglalt = nep.foglalt;
  ki.maxNep = nep.max;
  ki.sorbanNep = kepzes.sorbanNepesseg(cs);
  ki.szabadNep = nep.max - nep.foglalt - ki.sorbanNep;
  ki.nepTele = ki.szabadNep <= 0;
  for (let f = 0; f < 4; f++) ki.keszlet[f] = gazdasag.keszlet[cs * 4 + f];

  // ── 2. TÍPUSONKÉNTI ALAPADAT ──────────────────────────────────────────
  for (let t = 0; t < TIPUS_DB; t++) {
    const e = ki.tetelek[t];
    e.nev = egysegNev(sim, cs, t);
    e.ikon = EGYSEG_IKON[t];
    // Az árat a sim adja (`alapAr` az EGYEDI-nél a civ sorát), a százalékot a
    // `Civ` teszi rá — ugyanaz a két hívás, mint a `sorba()`-ban.
    Civ.arSzazalek(kepzes.alapAr(cs, t), sim.civ.egysegArSzazalek(cs, t), e.ar);
    e.ido = egysegIdo(sim, cs, t);
    e.idoMp = e.ido / TICK_HZ;
    e.nep = kepzes.nep(cs, t);
    e.epulet = -1; e.epTipus = -1; e.epNev = ''; e.epIkon = '';
    e.epuletDb = 0; e.sorbanDb = 0;
    e.kepezheto = false;
    e.ok = OK.NINCS_EPULET;
    for (let f = 0; f < 4; f++) e.hianyzo[f] = 0;
  }
  // Az EGYEDI-nek külön oka van, ha a csapatnak nincs népe: enélkül „nincs
  // képző épület"-et mondanánk, és a játékos építene egy laktanyát a semmiért.
  if (!ki.egyediVan) ki.tetelek[TIPUS.EGYEDI].ok = OK.NINCS_CIV;

  // ── 3. ÉPÜLET-PÁSZTA ──────────────────────────────────────────────────
  // EGY menet az épületeken, és minden épületnél a hat típus. Fordítva (típusonként
  // egy-egy teljes épület-menet) ugyanennyi munka lenne, de hatszor annyi
  // `kesz()`/csapat-szűrés. A `kepezheti()` viseli a `KEPEZ` rövidségét: a
  // toronyra és a piacra `!lista` miatt hamis, nem hiba.
  let sorDb = 0, sorOsszes = 0, sorbanOsszes = 0, kepzoDb = 0;
  const maxSor = ki.sorok.length;
  for (let ep = 0; ep < epuletek.db; ep++) {
    if (epuletek.csapat[ep] !== cs || epuletek.elo[ep] === 0) continue;
    const kesz = epuletek.kesz(ep);
    const epTipus = epuletek.tipus[ep];
    const db = kepzes.sorDb[ep];

    let kepzoE = false;
    for (let t = 0; t < TIPUS_DB; t++) {
      if (!kepzes.kepezheti(epTipus, t, cs)) continue;
      kepzoE = true;
      const e = ki.tetelek[t];
      e.sorbanDb += kepzes.sorbanTipus(ep, t);
      if (!kesz) continue;          // a félkész épület nem dolgozik
      e.epuletDb++;
      // A LEGRÖVIDEBB SOR nyer, holtversenyben a KISEBB INDEX — ugyanaz a
      // rögzített sorrend, amiben a `Kepzes.lep()` is jár, tehát amit a panel
      // ígér, azt a sim ugyanabban a sorrendben hajtja végre.
      if (e.epulet < 0 || db < kepzes.sorDb[e.epulet]) {
        e.epulet = ep; e.epTipus = epTipus;
        e.epNev = EPULET_NEV[epTipus]; e.epIkon = EPULET_IKON[epTipus];
      }
    }
    if (kepzoE && kesz) kepzoDb++;

    if (db > 0) {
      sorOsszes++;
      sorbanOsszes += db;
      if (sorDb < maxSor) {
        const s = ki.sorok[sorDb++];
        s.epulet = ep; s.epTipus = epTipus;
        s.epNev = EPULET_NEV[epTipus]; s.epIkon = EPULET_IKON[epTipus];
        s.db = db;
        for (let k = 0; k < SOR_HOSSZ; k++) {
          s.elemek[k] = k < db ? kepzes.sor[ep * SOR_HOSSZ + k] : -1;
        }
        s.elsoTipus = s.elemek[0];
        s.elsoNev = s.elsoTipus >= 0 ? egysegNev(sim, cs, s.elsoTipus) : '';
        s.hatra = kepzes.hatra[ep];
        s.hatraMp = s.hatra / TICK_HZ;
        s.teljes = s.elsoTipus >= 0 ? egysegIdo(sim, cs, s.elsoTipus) : 0;
        // A csík SOSEM megy 100 fölé és 0 alá: a `hatra` egy tickkel a
        // sorbaállás után már kisebb a teljesnél, de egy elavult `teljes`
        // (civ-váltás) negatív százalékot adna, és a CSS-ben az csúnyán törik.
        let sz = s.teljes > 0 ? (((s.teljes - s.hatra) * 100) / s.teljes) | 0 : 0;
        if (sz < 0) sz = 0; else if (sz > 100) sz = 100;
        s.szazalek = sz;
      }
    }
  }
  ki.sorDb = sorDb;
  ki.sorOsszes = sorOsszes;
  ki.sorbanOsszes = sorbanOsszes;
  ki.kepzoEpuletDb = kepzoDb;

  // ── 4. A TILTÁS OKA — A SIM SORRENDJÉBEN ──────────────────────────────
  ki.kepezhetoDb = 0; ki.tiltottDb = 0;
  ki.tiltottOkbol.fill(0);
  for (let t = 0; t < TIPUS_DB; t++) {
    const e = ki.tetelek[t];
    e.ok = _ok(sim, cs, e, t, ki);
    e.kepezheto = e.ok === OK.KEPEZHETO;
    if (e.kepezheto) ki.kepezhetoDb++;
    else { ki.tiltottDb++; ki.tiltottOkbol[e.ok]++; }
  }
  return ki;
}

/**
 * Egyetlen típus ítélete. A SORREND a `Kepzes.sorba()` sorrendje:
 * képezheti-e → van-e hely a sorban → népesség → ár. Aki ezt átrendezi, az a
 * panel magyarázatát rontja el, nem a működést — és pont ezért veszélyes.
 */
function _ok(sim, cs, e, t, ki) {
  if (t === TIPUS.EGYEDI && !ki.egyediVan) return OK.NINCS_CIV;
  if (e.epulet < 0) return OK.NINCS_EPULET;
  // Korszak-kapu CSAK akkor, ha a sim maga kínálja — lásd a fejlécet.
  const kepzes = sim.kepzes;
  if (typeof kepzes.korszakIgeny === 'function') {
    const kell = kepzes.korszakIgeny(cs, t) | 0;
    if (sim.gazdasag.korszak[cs] < kell) return OK.KORSZAK;
  }
  if (kepzes.sorDb[e.epulet] >= SOR_HOSSZ) return OK.SOR_TELE;
  if (ki.foglalt + ki.sorbanNep + e.nep > ki.maxNep) return OK.NEPESSEG;
  let hianyzikE = false;
  for (let f = 0; f < 4; f++) {
    const h = e.ar[f] - ki.keszlet[f];
    e.hianyzo[f] = h > 0 ? h : 0;
    if (h > 0) hianyzikE = true;
  }
  return hianyzikE ? OK.NYERSANYAG : OK.KEPEZHETO;
}

/**
 * A KÉPZÉS-PARANCS pontos alakja — `parancsok.js` `kepzes` ága.
 *
 * Azért van itt és nem a panelben, hogy a szonda UGYANAZT az objektumot tudja
 * beadni a simnek, amit a kattintás ad. Ha a parancs alakja elcsúszna (mondjuk
 * `egyseg` helyett `tipus`), a sim CSENDBEN a 0. típust képezné — a szonda
 * viszont munkást kapna lovag helyett, és az kiderül.
 *
 * @param {number} csapat @param {number} epulet @param {number} egyseg
 * @param {object} [ki] újrahasznált objektum (nulla allokáció a kattintás-úton)
 */
export function kepzesParancs(csapat, epulet, egyseg, ki) {
  const p = ki || { fajta: 'kepzes', csapat: 0, epulet: -1, egyseg: -1 };
  p.fajta = 'kepzes';
  p.csapat = csapat | 0;
  p.epulet = epulet | 0;
  p.egyseg = egyseg | 0;
  return p;
}

/** Egy tétel ár-szövege („50 étel · 25 fa"). A panel CSAK változásra hívja. */
export function arSzoveg(ar) {
  let sz = '';
  for (let f = 0; f < 4; f++) {
    if (!ar[f]) continue;
    if (sz) sz += ' · ';
    sz += ar[f] + ' ' + NYERS_NEV[f];
  }
  return sz || 'ingyen';
}

/** „12,5 mp" — a képzési idő emberi alakja. Egy tizedes, magyar tizedesvessző. */
export function idoSzoveg(tick) {
  const mp = tick / TICK_HZ;
  return (mp >= 10 ? mp.toFixed(0) : mp.toFixed(1)).replace('.', ',') + ' mp';
}
