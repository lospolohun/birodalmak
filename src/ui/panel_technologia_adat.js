// AGE OF THE CRYSTALS — A TECHNOLÓGIA-PANEL ADATRÉTEGE (v0.16): DOM-mentes.
//
// ── MIÉRT KÜLÖN FÁJL A RAJZOLÁSTÓL ────────────────────────────────────────
// Ugyanaz a szétvágás, mint a `minimap_adat.js`-nél és a `civ_valaszto_adat.js`-
// nél, és ugyanazért: ez a modul nem tud a DOM-ról, a `three`-ről és a vászonról,
// tehát NODE-BAN IS FUTTATHATÓ. A technológiafa nehéz része nem a dobozok
// kirajzolása, hanem a DÖNTÉS: melyik tétel elérhető, melyik zárt, és MIÉRT.
// Ezt a döntést csak szemmel lehetne ellenőrizni — a felhőben pedig nincs szem
// (nincs GPU), tehát ami csak a képernyőn látszik, az nincs őrizve.
//
// ── ⚠️ A LEGFONTOSABB SZABÁLY: A PANEL NEM MONDHAT MÁST, MINT A SIM ────────
// Ennek a rétegnek EGYETLEN igazi szerződése van:
//
//     allapot[t] === TALLAPOT.ELERHETO   ⟺   a `{fajta:'kutatas'}` parancs
//                                            TÉNYLEG el is indulna
//
// Ha a UI engedékenyebb, a játékos kattint és nem történik semmi (a
// `Technologia.indit` némán `false`-t ad — nincs hibaüzenet, nincs napló). Ha a
// UI szigorúbb, egy megkutatható technológia örökre elérhetetlennek látszik.
// Mindkét hiba NÉMA, és a determinizmus-kapu egyikről sem tud: a hash-ek attól
// még bitre egyeznek, hogy a fa hazudik.
//
// Ezért a `_zarolas()` PONTOSAN azokat a feltételeket nézi, amiket a
// `Technologia.indit()`, és a szonda 5. gátja nem a feliratot hiszi el, hanem
// LEFUTTATJA a parancsot egy másolat-simben, és a kettőt hasonlítja össze.
//
// ── A NÉGY ZÁROLÁSI OK ────────────────────────────────────────────────────
// A `Technologia.indit()` négy különböző ponton mondhat nemet, és a játékosnak
// mind a négy MÁST jelent — más a teendő:
//
//   ZAR.KORSZAK       még nem tartasz ott     → korszakot kell váltani
//   ZAR.EPULET        nincs ilyen épületed    → építeni kell
//   ZAR.ELOFELTETEL   van, de MÉG ÉPÜL        → várni kell (`ep.kesz()` hamis)
//   ZAR.NYERSANYAG    nem telik               → gyűjteni kell
//
// A harmadik nem szőrszálhasogatás: a sim ugyanúgy visszautasítja a félkész
// laktanyát, mint a nem létezőt, a játékosnak viszont az egyikre várnia kell, a
// másikra kattintania. Egy közös „nincs laktanyád" felirat a félkész épület
// mellett egyszerűen hazugság lenne.
//
// A SORREND itt KIJELZÉSI sorrend (a legszerkezetibb akadály elöl), nem a sim
// ellenőrzési sorrendje. Ez nem okoz eltérést: a DÖNTÉS („elérhető-e") mindkét
// sorrendből ugyanaz, csak azt választjuk ki máshogy, MELYIK okot írjuk ki, ha
// egyszerre több is fennáll. Az összes fennálló okot a `zarMind` bitmezője adja.
//
// ── ⚠️ A TÜKRÖZÖTT TÁBLÁK ────────────────────────────────────────────────
// A `technologia.js` az árat, az épületet és a korszakot ELÉRHETŐVÉ teszi
// (`techAra`, `techEpulete`, `techKorszaka`), a KUTATÁSI IDŐT viszont nem: a
// `TECH_IDO` modul-privát, és a sávom nem írhat a `src/sim/` alá. Ugyanez a
// helyzet a `KORSZAK_IDO`-val a `gazdasag.js`-ben.
//
// Ezért itt áll két tükör-tábla — és a tükör CSENDBEN ELCSÚSZHAT, ami pontosan
// az a hibafajta, amiből ebben a projektben már öt volt. A szonda 2. gátja
// ezért nem a táblát hasonlítja össze egy másik táblával, hanem ELINDÍT egy
// kutatást és egy korszakváltást, és a sim visszaszámlálójából olvassa ki az
// igazi értéket. Ha valaki átírja a `TECH_IDO`-t, a kapu pirosra vált.
//
// ── ⚠️ RÖVID TÁBLA = NÉMÁN ELTŰNŐ TÉTEL ──────────────────────────────────
// A `TECH_NEV`, `TECH_LEIRAS` és a saját `HATAS_MONDAT` mind `TECH_DB` hosszú
// kell legyen. Egy hetedik technológia felvétele a `TECH`-be, a nevek bővítése
// nélkül `undefined` nevű, néma tételt adna. Ezért a modul BETÖLTÉSKOR ellenőriz
// és DOB — ugyanaz a döntés, mint az `ikonSvg` ismeretlen ikonnévnél: az üres
// string némán tűnik el, a kivétel nem.
//
// ── ALLOKÁCIÓ ─────────────────────────────────────────────────────────────
// Két út van, szándékosan:
//   · `technologiaTetelek()` és `technologiaAdat()` SZABADON allokál — egyszeri
//     felépítéshez és a szondához való.
//   · `technologiaAllapot(sim, csapat, ki)` egy ELŐRE LEFOGLALT objektumba ír,
//     és képkockánként hívható: nulla allokáció, csak számok és kódok. A
//     szöveggé formázás a panel dolga, és ott is csak VÁLTOZÁSKOR fut.

import {
  TECH, TECH_DB, TECH_NEV, TECH_LEIRAS, KUTAT,
  techAra, techEpulete, techKorszaka,
} from '../sim/technologia.js';
import { KORSZAK, KORSZAK_NEV, KORSZAK_AR } from '../sim/gazdasag.js';
import { EPULET, EPULET_NEV } from '../sim/epuletek.js';
import { NYERS_NEV } from '../sim/eroforras.js';
import { TICK_HZ } from '../sim/sim.js';
import { IKON } from './ikonok.js';

/** A négy korszak — a fa ennyi oszlopból áll. */
export const KORSZAK_DB = 4;
/** Az épülettípusok száma — a belső segédtömbök mérete. */
const EPULET_DB = EPULET_NEV.length;

/** Egy tétel állapota a fában. */
export const TALLAPOT = { KESZ: 0, FOLYIK: 1, ELERHETO: 2, ZARVA: 3 };
export const TALLAPOT_NEV = ['kész', 'folyik', 'elérhető', 'zárva'];

/** MIÉRT zárt egy tétel. Lásd a fejléc „négy zárolási ok" szakaszát. */
export const ZAR = { NINCS: 0, KORSZAK: 1, EPULET: 2, ELOFELTETEL: 3, NYERSANYAG: 4 };
export const ZAR_DB = 5;

/** A korszakváltás gombjának állapota. */
export const VALTAS = { LEHET: 0, FOLYIK: 1, NYERSANYAG: 2, VEGE: 3 };

/**
 * KUTATÁSI IDŐ tickben — TÜKÖR a `technologia.js` modul-privát `TECH_IDO`-járól.
 * Lásd a fejléc ⚠️ szakaszát: a szonda a SIM visszaszámlálójából ellenőrzi.
 */
export const TECH_IDO_UI = [400, 400, 500, 300, 300, 400];

/**
 * KORSZAKVÁLTÁS IDEJE tickben — tükör a `gazdasag.js` `KORSZAK_IDO`-járól.
 * Három elem: a `FENY`-ből nincs tovább.
 */
export const KORSZAK_IDO_UI = [400, 500, 600];

/**
 * A HATÁS EGÉSZ MONDATBAN, `TECH.*` SZERINT INDEXELVE.
 *
 * A `TECH_LEIRAS` töredék („nyíl-sebzés +1"): a HUD-nak, ahol egy sor fér el.
 * A panelnek egész mondat kell — a fa a meccs közben nyílik ki, és a játékos
 * ott dönt, nem szótárat olvas. A tábla KULCSONKÉNT tölt, nem sorrendben: ha a
 * `TECH` valaha átszámozódik, ez vele mozdul, nem csúszik el csendben.
 */
const HATAS_MONDAT = [];
HATAS_MONDAT[TECH.KOVACSOLAS] =
  'A közelharci egységeid minden csapása eggyel többet sebez.';
HATAS_MONDAT[TECH.ILLESZTETT_IJ] =
  'Az íjászaid nyilai eggyel többet sebeznek.';
HATAS_MONDAT[TECH.PANCELOZAS] =
  'Minden egységed páncélja eggyel nő, tehát minden rájuk mért találat eggyel kevesebbet visz le.';
HATAS_MONDAT[TECH.EKEVAS] =
  'A munkásaid negyedével gyorsabban gyűjtenek mind a négy nyersanyagból.';
HATAS_MONDAT[TECH.TALICSKA] =
  'A munkásaid fordulónként öttel több nyersanyagot cipelnek haza.';
HATAS_MONDAT[TECH.FALAZAS] =
  'Az EZUTÁN épített házaid negyedével több életerővel készülnek el; a már állókra nem hat.';

/**
 * A technológia IKONJA: a kutató épület ikonja.
 *
 * Nincs saját technológia-ikon az `ikonok.js`-ben, és nem is kérünk: a fában
 * pont az a leghasznosabb információ, hogy MELYIK ÉPÜLETBEN kutatható — a
 * játékos így egy pillantással látja, mit kell felhúznia hozzá.
 */
const EPULET_IKON = [];
EPULET_IKON[EPULET.KOZPONT] = IKON.KOZPONT;
EPULET_IKON[EPULET.RAKTAR] = IKON.RAKTAR;
EPULET_IKON[EPULET.FAL] = IKON.FAL;
EPULET_IKON[EPULET.KAPU] = IKON.KAPU;
EPULET_IKON[EPULET.HAZ] = IKON.HAZ;
EPULET_IKON[EPULET.LAKTANYA] = IKON.LAKTANYA;
EPULET_IKON[EPULET.IJASZDA] = IKON.IJASZDA;
EPULET_IKON[EPULET.ISTALLO] = IKON.ISTALLO;
EPULET_IKON[EPULET.OSTROMMUHELY] = IKON.OSTROMMUHELY;
EPULET_IKON[EPULET.TORONY] = IKON.TORONY;
EPULET_IKON[EPULET.PIAC] = IKON.PIAC;

/** A négy nyersanyag ikonja, `NYERS.*` sorrendben. */
export const NYERS_IKON = [IKON.ETEL, IKON.FA, IKON.KO, IKON.KRISTALY];

/** Magánhangzók a határozott névelőhöz. */
const MAGANHANGZO = 'aáeéiíoóöőuúüű';
/** `a` vagy `az` — a szó első betűje dönt. */
function nevelo(szo) {
  return MAGANHANGZO.indexOf(String(szo).charAt(0)) >= 0 ? 'az' : 'a';
}

/**
 * A KORSZAKNEVEK RAGOZOTT ALAKJAI, névelővel együtt, `KORSZAK.*` szerint.
 *
 * ⚠️ Nem ragot fűzünk a `KORSZAK_NEV`-hez, mert az BIRTOKOS SZERKEZET: a
 * „sötét kor" ragozható (`sötét kor` + `ban`), a „hajnal kora" viszont nem
 * (`hajnal koraban` értelmetlen — helyesen „hajnal korában"). Az első alakon a
 * naiv fűzés működne, a másik hármon nem, és a hiba pont a szonda-futásokon
 * legritkábban látott korszakokban jelentkezne. Ezért mind a négy ki van írva.
 */
const KORSZAK_TARGY = [];   // „el kell érned A SÖTÉT KORT"
KORSZAK_TARGY[KORSZAK.SOTET] = 'a sötét kort';
KORSZAK_TARGY[KORSZAK.HAJNAL] = 'a hajnal korát';
KORSZAK_TARGY[KORSZAK.KRISTALY] = 'a kristály korát';
KORSZAK_TARGY[KORSZAK.FENY] = 'a fény korát';

const KORSZAK_HELY = [];    // „most A SÖTÉT KORBAN jársz"
KORSZAK_HELY[KORSZAK.SOTET] = 'a sötét korban';
KORSZAK_HELY[KORSZAK.HAJNAL] = 'a hajnal korában';
KORSZAK_HELY[KORSZAK.KRISTALY] = 'a kristály korában';
KORSZAK_HELY[KORSZAK.FENY] = 'a fény korában';

// ════════════════════════════════════════════════════════════════════════════
// TÁBLA-ELLENŐRZÉS — a modul betöltésekor fut, és DOB
// ════════════════════════════════════════════════════════════════════════════

/**
 * Végigméri az összes technológiánként indexelt táblát.
 *
 * Külön exportált függvény, hogy a szonda SZABOTÁZZSAL is meg tudja hívni (egy
 * szándékosan megcsonkított táblával), és lássa, hogy tényleg elkapja. Egy
 * ellenőrzés, amit sosem próbáltak ki hibás bemeneten, maga is hiba.
 *
 * @param {{nev?:string[], leiras?:string[], hatas?:string[], ido?:number[],
 *          korszakIdo?:number[], korszakAr?:number[][]}} [tablak] felülírható a szondának
 * @returns {string[]} a hibák; ÜRES tömb = rendben
 */
export function tablakEllenorzes(tablak) {
  const t = tablak || {};
  const nev = t.nev || TECH_NEV;
  const leiras = t.leiras || TECH_LEIRAS;
  const hatas = t.hatas || HATAS_MONDAT;
  const ido = t.ido || TECH_IDO_UI;
  const korszakIdo = t.korszakIdo || KORSZAK_IDO_UI;
  const korszakAr = t.korszakAr || KORSZAK_AR;
  const hibak = [];

  const hossz = (t2, n, cimke) => {
    if (!t2 || t2.length !== n) {
      hibak.push(cimke + ': ' + (t2 ? t2.length : 'nincs') + ' elem, várt ' + n);
      return false;
    }
    return true;
  };
  hossz(nev, TECH_DB, 'TECH_NEV');
  hossz(leiras, TECH_DB, 'TECH_LEIRAS');
  hossz(hatas, TECH_DB, 'HATAS_MONDAT');
  hossz(ido, TECH_DB, 'TECH_IDO_UI');
  hossz(korszakIdo, KORSZAK_DB - 1, 'KORSZAK_IDO_UI');
  hossz(korszakAr, KORSZAK_DB - 1, 'KORSZAK_AR');

  for (let i = 0; i < TECH_DB; i++) {
    if (typeof nev[i] !== 'string' || nev[i].length === 0) hibak.push('TECH_NEV[' + i + '] üres');
    if (typeof leiras[i] !== 'string' || leiras[i].length === 0) hibak.push('TECH_LEIRAS[' + i + '] üres');
    if (typeof hatas[i] !== 'string' || hatas[i].length < 20) hibak.push('HATAS_MONDAT[' + i + '] hiányzik vagy nem mondat');
    if (!(ido[i] > 0)) hibak.push('TECH_IDO_UI[' + i + '] nem pozitív');
    const ar = techAra(i);
    if (!ar || ar.length !== 4) hibak.push('techAra(' + i + ') nem négyelemű');
    const ep = techEpulete(i);
    if (!(ep >= 0 && ep < EPULET_DB)) hibak.push('techEpulete(' + i + ') érvénytelen: ' + ep);
    else if (EPULET_IKON[ep] === undefined) hibak.push('EPULET_IKON hiányzik: ' + ep);
    const k = techKorszaka(i);
    if (!(k >= 0 && k < KORSZAK_DB)) hibak.push('techKorszaka(' + i + ') érvénytelen: ' + k);
  }
  for (let k = 0; k < KORSZAK_DB - 1; k++) {
    if (!(korszakIdo[k] > 0)) hibak.push('KORSZAK_IDO_UI[' + k + '] nem pozitív');
    if (!korszakAr[k] || korszakAr[k].length !== 4) hibak.push('KORSZAK_AR[' + k + '] nem négyelemű');
  }
  if (KORSZAK_NEV.length !== KORSZAK_DB) {
    hibak.push('KORSZAK_NEV: ' + KORSZAK_NEV.length + ' elem, várt ' + KORSZAK_DB);
  }
  // A ragozott alakok: mind a négy korszakra, mert a naiv rag-fűzés csak az
  // elsőn működne (lásd a `KORSZAK_TARGY` fejlécét).
  const targy = t.korszakTargy || KORSZAK_TARGY;
  const hely = t.korszakHely || KORSZAK_HELY;
  hossz(targy, KORSZAK_DB, 'KORSZAK_TARGY');
  hossz(hely, KORSZAK_DB, 'KORSZAK_HELY');
  for (let k = 0; k < KORSZAK_DB; k++) {
    if (typeof targy[k] !== 'string' || targy[k].length === 0) hibak.push('KORSZAK_TARGY[' + k + '] üres');
    if (typeof hely[k] !== 'string' || hely[k].length === 0) hibak.push('KORSZAK_HELY[' + k + '] üres');
  }
  return hibak;
}

{
  const hibak = tablakEllenorzes();
  if (hibak.length > 0) {
    // SZÁNDÉKOSAN dobunk, nem naplózunk: egy hiányzó név némán eltűnő tételt
    // adna a fában, és a kapu zöld maradna. Lásd az `ikonSvg`-t.
    throw new Error('panel_technologia_adat: hibás tábla — ' + hibak.join('; '));
  }
}

// ════════════════════════════════════════════════════════════════════════════
// STATIKUS RÉTEG — egyszer épül fel, a panel ebből rak DOM-ot
// ════════════════════════════════════════════════════════════════════════════

/**
 * A fa VÁLTOZATLAN adatai: mi micsoda, mibe kerül, meddig tart, hol kutatható.
 * Semmi, ami a meccs állásától függ — az a `technologiaAllapot()` dolga.
 *
 * @returns {Array<{tech:number, nev:string, leiras:string, hatas:string,
 *   ikon:string, epulet:number, epuletNev:string, korszak:number,
 *   korszakNev:string, ar:number[], arSzoveg:string, ido:number,
 *   idoMp:number, idoSzoveg:string}>}
 */
export function technologiaTetelek() {
  const ki = new Array(TECH_DB);
  for (let t = 0; t < TECH_DB; t++) {
    const nyersAr = techAra(t);
    const ar = [nyersAr[0], nyersAr[1], nyersAr[2], nyersAr[3]];   // MÁSOLAT: a sim tábláját nem írjuk
    const ep = techEpulete(t);
    const k = techKorszaka(t);
    const mp = Math.round(TECH_IDO_UI[t] / TICK_HZ);
    ki[t] = {
      tech: t,
      nev: TECH_NEV[t],
      leiras: TECH_LEIRAS[t],
      hatas: HATAS_MONDAT[t],
      ikon: EPULET_IKON[ep],
      epulet: ep,
      epuletNev: EPULET_NEV[ep],
      korszak: k,
      korszakNev: KORSZAK_NEV[k],
      ar,
      arSzoveg: arSzoveg(ar),
      ido: TECH_IDO_UI[t],
      idoMp: mp,
      idoSzoveg: mp + ' mp',
    };
  }
  return ki;
}

/**
 * A NÉGY OSZLOP fejléce: melyik korszak, mi kerül bele, mit nyit meg.
 *
 * @returns {Array<{korszak:number, nev:string, tetelek:number[], ar:number[]|null,
 *   ido:number|null, idoSzoveg:string, nyitMondat:string}>}
 */
export function korszakOszlopok() {
  const ki = new Array(KORSZAK_DB);
  for (let k = 0; k < KORSZAK_DB; k++) {
    const tetelek = [];
    for (let t = 0; t < TECH_DB; t++) if (techKorszaka(t) === k) tetelek.push(t);
    const elozo = k - 1;
    const ar = elozo >= 0 ? [
      KORSZAK_AR[elozo][0], KORSZAK_AR[elozo][1], KORSZAK_AR[elozo][2], KORSZAK_AR[elozo][3],
    ] : null;
    const ido = elozo >= 0 ? KORSZAK_IDO_UI[elozo] : null;
    ki[k] = {
      korszak: k,
      nev: KORSZAK_NEV[k],
      tetelek,
      ar,
      // ⚠️ A kész szöveg IS ide tartozik, nem a hívóhoz. Az első változatban a
      // `technologiaAdat()` a saját másolatában képezte, a korszakváltó doboz
      // viszont EBBŐL az objektumból olvasta — és `undefined`-ot kapott. Egy
      // mező, ami két helyen létezik, előbb-utóbb csak az egyiken létezik.
      arSzoveg: ar ? arSzoveg(ar) : '',
      ido,
      idoSzoveg: ido === null ? '' : Math.round(ido / TICK_HZ) + ' mp',
      nyitMondat: korszakNyitMondat(k),
    };
  }
  return ki;
}

/**
 * MIT AD ez a korszak? Egész mondat, a technológiafából származtatva.
 *
 * ⚠️ Csak TECHNOLÓGIÁT sorol fel, épületet nem — és ez nem hiányosság, hanem
 * hűség: a v0.5 sim-jében az `epit` parancs NEM néz korszakot, tehát minden
 * épület az első perctől lerakható. Ha a fa „a hajnal korában nyílik meg az
 * istálló"-t írna, az egyszerűen nem lenne igaz.
 */
export function korszakNyitMondat(k) {
  const nevek = [];
  for (let t = 0; t < TECH_DB; t++) if (techKorszaka(t) === k) nevek.push(TECH_NEV[t]);
  if (k === 0) {
    return nevek.length === 0
      ? 'Innen indulsz.'
      : 'Innen indulsz; azonnal kutatható: ' + nevek.join(', ') + '.';
  }
  if (nevek.length === 0) {
    return 'Ebben a korban nem nyílik meg új technológia, de a korábbiak tovább kutathatók.';
  }
  if (nevek.length === 1) {
    return 'Megnyitja ezt a technológiát: ' + nevek[0] + '.';
  }
  return 'Megnyitja ezeket a technológiákat: ' + nevek.join(', ') + '.';
}

/**
 * Ár-szöveg egész mondat-részként: „100 fa, 60 kő". A nulla tételek kimaradnak,
 * mert a „0 kristály" nem információ, csak zaj.
 */
export function arSzoveg(ar) {
  let s = '';
  for (let f = 0; f < 4; f++) {
    if (!ar[f]) continue;
    if (s) s += ', ';
    s += ar[f] + ' ' + NYERS_NEV[f];
  }
  return s || 'ingyen';
}

// ════════════════════════════════════════════════════════════════════════════
// DINAMIKUS RÉTEG — képkockánként hívható, NULLA allokációval
// ════════════════════════════════════════════════════════════════════════════

/**
 * Előre lefoglalt állapot-objektum. A panel EGYET tart belőle, és mindig
 * ugyanazt adja át a `technologiaAllapot()`-nak.
 */
export function ujAllapot() {
  return {
    // ── korszak ──
    korszak: 0,
    korszakHatra: 0,
    korszakOsszes: 0,
    korszakSzazalek: 0,
    valtas: VALTAS.LEHET,
    valtasHiany: new Int32Array(4),
    // ── technológiánként ──
    allapot: new Uint8Array(TECH_DB),
    zar: new Uint8Array(TECH_DB),
    /** Bitmező: MINDEN fennálló zárolási ok (`1 << ZAR.*`) — a szondának. */
    zarMind: new Uint8Array(TECH_DB),
    hatra: new Int32Array(TECH_DB),
    szazalek: new Int32Array(TECH_DB),
    /** Melyik épületben indítható (vagy hol folyik); -1, ha nincs ilyen. */
    epuletId: new Int32Array(TECH_DB),
    /** Hány darab hiányzik: `hiany[t * 4 + nyers]`. */
    hiany: new Int32Array(TECH_DB * 4),
    // ── összesítők (a szonda ezekből dolgozik) ──
    keszDb: 0, folyikDb: 0, elerhetoDb: 0, zartDb: 0,
    oszlopElerheto: new Int32Array(KORSZAK_DB),
    oszlopZarva: new Int32Array(KORSZAK_DB),
    oszlopKesz: new Int32Array(KORSZAK_DB),
    oszlopFolyik: new Int32Array(KORSZAK_DB),
    /** Hány tétel zárt melyik okból — `zarDb[ZAR.*]`. */
    zarDb: new Int32Array(ZAR_DB),
    // ── belső munkatömbök, hogy a scan ne allokáljon ──
    _keszEp: new Int32Array(EPULET_DB),
    _epuloEp: new Int32Array(EPULET_DB),
  };
}

/**
 * A fa PILLANATNYI állapota. Nulla allokáció: mindent a `ki`-be ír.
 *
 * ⚠️ A `TALLAPOT.ELERHETO` döntése PONTOSAN a `Technologia.indit()` feltételeit
 * követi (lásd a fejléc szerződését). Ha az a függvény változik, ez is változik
 * — és a szonda 5. gátja azonnal jelez, ha elcsúsznak.
 *
 * @param {import('../sim/sim.js').Sim} sim
 * @param {number} csapat
 * @param {ReturnType<typeof ujAllapot>} ki
 * @returns {ReturnType<typeof ujAllapot>} ugyanaz a `ki`
 */
export function technologiaAllapot(sim, csapat, ki) {
  const g = sim.gazdasag;
  const tec = sim.technologia;
  const ep = sim.epuletek;

  // ── 1. KORSZAK ──────────────────────────────────────────────────────
  const kor = g.korszak[csapat];
  const korHatra = g.korszakHatra[csapat];
  ki.korszak = kor;
  ki.korszakHatra = korHatra;
  const korOsszes = kor < KORSZAK.FENY ? KORSZAK_IDO_UI[kor] : 0;
  ki.korszakOsszes = korOsszes;
  ki.korszakSzazalek = (korHatra > 0 && korOsszes > 0)
    ? (((korOsszes - korHatra) * 100 / korOsszes) | 0) : 0;

  // A korszakváltás gombja. UGYANAZ a három feltétel, amit a
  // `Gazdasag.korszakIndit()` néz, ugyanabban a sorrendben.
  const o4 = csapat * 4;
  for (let f = 0; f < 4; f++) ki.valtasHiany[f] = 0;
  if (korHatra > 0) ki.valtas = VALTAS.FOLYIK;
  else if (kor >= KORSZAK.FENY) ki.valtas = VALTAS.VEGE;
  else {
    const ar = KORSZAK_AR[kor];
    let hianyzik = 0;
    for (let f = 0; f < 4; f++) {
      const h = ar[f] - g.keszlet[o4 + f];
      if (h > 0) { ki.valtasHiany[f] = h; hianyzik++; }
    }
    ki.valtas = hianyzik > 0 ? VALTAS.NYERSANYAG : VALTAS.LEHET;
  }

  // ── 2. ÉPÜLET-PÁSZTÁZÁS ─────────────────────────────────────────────
  // Egyetlen menet az épületeken, típusonként a LEGKISEBB INDEXŰ saját kész
  // épülettel — a legkisebb index determinisztikus választás, tehát két gépen
  // ugyanoda kerül a parancs `epulet` mezője.
  const keszEp = ki._keszEp, epuloEp = ki._epuloEp;
  keszEp.fill(-1);
  epuloEp.fill(-1);
  for (let i = 0; i < ep.db; i++) {
    if (ep.elo[i] === 0 || ep.csapat[i] !== csapat) continue;
    const tip = ep.tipus[i];
    if (tip < 0 || tip >= EPULET_DB) continue;
    if (ep.kesz(i)) { if (keszEp[tip] < 0) keszEp[tip] = i; }
    else if (epuloEp[tip] < 0) epuloEp[tip] = i;
  }

  // ── 3. TÉTELENKÉNT ──────────────────────────────────────────────────
  ki.keszDb = 0; ki.folyikDb = 0; ki.elerhetoDb = 0; ki.zartDb = 0;
  ki.oszlopElerheto.fill(0); ki.oszlopZarva.fill(0);
  ki.oszlopKesz.fill(0); ki.oszlopFolyik.fill(0);
  ki.zarDb.fill(0);

  for (let t = 0; t < TECH_DB; t++) {
    const o = csapat * TECH_DB + t;
    const simAllapot = tec.allapot[o];
    const kell = techKorszaka(t);
    const epTipus = techEpulete(t);
    const ar = techAra(t);
    ki.zar[t] = ZAR.NINCS;
    ki.zarMind[t] = 0;
    ki.hatra[t] = 0;
    ki.szazalek[t] = 0;
    ki.epuletId[t] = -1;
    for (let f = 0; f < 4; f++) ki.hiany[t * 4 + f] = 0;

    if (simAllapot === KUTAT.KESZ) {
      ki.allapot[t] = TALLAPOT.KESZ;
      ki.szazalek[t] = 100;
      ki.keszDb++; ki.oszlopKesz[kell]++;
      continue;
    }
    if (simAllapot === KUTAT.FOLYIK) {
      const ossz = TECH_IDO_UI[t];
      const h = tec.hatra[o];
      ki.allapot[t] = TALLAPOT.FOLYIK;
      ki.hatra[t] = h;
      ki.szazalek[t] = ossz > 0 ? (((ossz - h) * 100 / ossz) | 0) : 0;
      ki.epuletId[t] = tec.hol[o];
      ki.folyikDb++; ki.oszlopFolyik[kell]++;
      continue;
    }

    // ── ZÁROLÁS: minden fennálló ok, majd a KIÍRANDÓ kiválasztása ──
    let mind = 0;
    if (kor < kell) mind |= (1 << ZAR.KORSZAK);
    if (keszEp[epTipus] < 0) {
      // Van-e egyáltalán ilyen épületed? Ha épül, az VÁRAKOZÁS, nem építés.
      mind |= (epuloEp[epTipus] >= 0) ? (1 << ZAR.ELOFELTETEL) : (1 << ZAR.EPULET);
    }
    let hianyzik = 0;
    for (let f = 0; f < 4; f++) {
      const h = ar[f] - g.keszlet[o4 + f];
      if (h > 0) { ki.hiany[t * 4 + f] = h; hianyzik++; }
    }
    if (hianyzik > 0) mind |= (1 << ZAR.NYERSANYAG);
    ki.zarMind[t] = mind;

    if (mind === 0) {
      ki.allapot[t] = TALLAPOT.ELERHETO;
      ki.epuletId[t] = keszEp[epTipus];
      ki.elerhetoDb++; ki.oszlopElerheto[kell]++;
      continue;
    }
    // KIJELZÉSI sorrend: a legszerkezetibb akadály elöl (lásd a fejlécet).
    const ok = (mind & (1 << ZAR.KORSZAK)) ? ZAR.KORSZAK
      : (mind & (1 << ZAR.EPULET)) ? ZAR.EPULET
        : (mind & (1 << ZAR.ELOFELTETEL)) ? ZAR.ELOFELTETEL
          : ZAR.NYERSANYAG;
    ki.allapot[t] = TALLAPOT.ZARVA;
    ki.zar[t] = ok;
    ki.epuletId[t] = keszEp[epTipus];       // -1, ha nincs — a panel nem indít
    ki.zartDb++; ki.oszlopZarva[kell]++;
    ki.zarDb[ok]++;
  }
  return ki;
}

// ════════════════════════════════════════════════════════════════════════════
// MONDATOK — csak VÁLTOZÁSKOR hívja a panel, tehát szabadon allokálhat
// ════════════════════════════════════════════════════════════════════════════

/**
 * MIÉRT nem kutatható? Egész mondat, KONKRÉTAN — a „nem elérhető" felirat
 * ugyanolyan használhatatlan, mint a semmi.
 *
 * @param {ReturnType<typeof technologiaTetelek>[0]} tetel
 * @param {ReturnType<typeof ujAllapot>} all
 * @returns {string} üres, ha a tétel nem zárt
 */
export function zarIndok(tetel, all) {
  const t = tetel.tech;
  if (all.allapot[t] !== TALLAPOT.ZARVA) return '';
  switch (all.zar[t]) {
    case ZAR.KORSZAK:
      return 'Előbb el kell érned ' + KORSZAK_TARGY[tetel.korszak]
        + ' — most ' + KORSZAK_HELY[all.korszak] + ' jársz.';
    case ZAR.EPULET:
      return 'Kell hozzá egy kész ' + tetel.epuletNev + ' — még egy sincs.';
    case ZAR.ELOFELTETEL:
      return 'Az előfeltétele még nem teljesült: ' + nevelo(tetel.epuletNev) + ' '
        + tetel.epuletNev + ' épül, de még nem készült el.';
    case ZAR.NYERSANYAG:
      return 'Nincs elég nyersanyagod: ' + hianySzoveg(all.hiany, t * 4) + ' hiányzik.';
    default:
      return '';
  }
}

/** Rövid, gombra való változat ugyanabból az okból. */
export function zarCimke(all, t) {
  switch (all.zar[t]) {
    case ZAR.KORSZAK: return 'korszak kell';
    case ZAR.EPULET: return 'épület kell';
    case ZAR.ELOFELTETEL: return 'még épül';
    case ZAR.NYERSANYAG: return 'nem telik';
    default: return '';
  }
}

/** „120 étel és 60 kő" — a hiányzó mennyiségek felsorolása. */
export function hianySzoveg(hiany, eltolas) {
  const reszek = [];
  for (let f = 0; f < 4; f++) {
    const h = hiany[eltolas + f];
    if (h > 0) reszek.push(h + ' ' + NYERS_NEV[f]);
  }
  if (reszek.length === 0) return 'semmi';
  if (reszek.length === 1) return reszek[0];
  return reszek.slice(0, -1).join(', ') + ' és ' + reszek[reszek.length - 1];
}

/** A korszakváltás gombjának mondata — mindig megmondja, mi a teendő. */
export function valtasIndok(all) {
  switch (all.valtas) {
    case VALTAS.FOLYIK:
      return 'A korszakváltás folyamatban: ' + mpSzoveg(all.korszakHatra) + ' van hátra.';
    case VALTAS.VEGE:
      return 'Elérted az utolsó korszakot, nincs tovább.';
    case VALTAS.NYERSANYAG:
      return 'Nincs elég nyersanyagod a váltáshoz: ' + hianySzoveg(all.valtasHiany, 0) + ' hiányzik.';
    default:
      return 'Most azonnal elindíthatod a korszakváltást.';
  }
}

/** Tick → olvasható idő. Egész másodperc: a tizedes itt csak zaj lenne. */
export function mpSzoveg(tick) {
  const mp = Math.ceil(tick / TICK_HZ);
  return mp + ' mp';
}

// ════════════════════════════════════════════════════════════════════════════
// EGYSZERI, TELJES PILLANATKÉP — a szondának és az egyszeri lekérdezéseknek
// ════════════════════════════════════════════════════════════════════════════

/**
 * A teljes fa egyetlen, olvasható objektumban. SZABADON allokál — ez NEM a
 * képkocka-út (arra a `technologiaAllapot()` van), hanem a szonda és a
 * jelentések felülete.
 *
 * @param {import('../sim/sim.js').Sim} sim
 * @param {number} csapat
 */
export function technologiaAdat(sim, csapat = 0) {
  const tetelek = technologiaTetelek();
  const all = technologiaAllapot(sim, csapat, ujAllapot());
  const oszlopokAlap = korszakOszlopok();

  const kiTetelek = new Array(TECH_DB);
  for (let t = 0; t < TECH_DB; t++) {
    const s = tetelek[t];
    kiTetelek[t] = {
      tech: t,
      nev: s.nev,
      leiras: s.leiras,
      hatas: s.hatas,
      ikon: s.ikon,
      epulet: s.epulet,
      epuletNev: s.epuletNev,
      korszak: s.korszak,
      korszakNev: s.korszakNev,
      ar: s.ar,
      arSzoveg: s.arSzoveg,
      ido: s.ido,
      idoSzoveg: s.idoSzoveg,
      allapot: all.allapot[t],
      allapotNev: TALLAPOT_NEV[all.allapot[t]],
      zar: all.zar[t],
      zarMind: all.zarMind[t],
      indok: zarIndok(s, all),
      cimke: all.allapot[t] === TALLAPOT.ZARVA ? zarCimke(all, t) : '',
      hatra: all.hatra[t],
      szazalek: all.szazalek[t],
      epuletId: all.epuletId[t],
      hiany: [all.hiany[t * 4], all.hiany[t * 4 + 1], all.hiany[t * 4 + 2], all.hiany[t * 4 + 3]],
    };
  }

  const oszlopok = new Array(KORSZAK_DB);
  for (let k = 0; k < KORSZAK_DB; k++) {
    const a = oszlopokAlap[k];
    oszlopok[k] = {
      korszak: k,
      nev: a.nev,
      nyitMondat: a.nyitMondat,
      ar: a.ar,
      arSzoveg: a.arSzoveg,
      ido: a.ido,
      idoSzoveg: a.idoSzoveg,
      elert: k <= all.korszak,
      aktiv: k === all.korszak,
      tetelek: a.tetelek.map((t) => kiTetelek[t]),
      keszDb: all.oszlopKesz[k],
      folyikDb: all.oszlopFolyik[k],
      elerhetoDb: all.oszlopElerheto[k],
      zartDb: all.oszlopZarva[k],
    };
  }

  return {
    csapat,
    korszak: all.korszak,
    korszakNev: KORSZAK_NEV[all.korszak],
    korszakHatra: all.korszakHatra,
    korszakOsszes: all.korszakOsszes,
    korszakSzazalek: all.korszakSzazalek,
    valtas: {
      allapot: all.valtas,
      lehet: all.valtas === VALTAS.LEHET,
      kovetkezoNev: all.korszak < KORSZAK.FENY ? KORSZAK_NEV[all.korszak + 1] : 'nincs tovább',
      ar: all.korszak < KORSZAK.FENY ? oszlopokAlap[all.korszak + 1].ar : null,
      arSzoveg: all.korszak < KORSZAK.FENY ? oszlopokAlap[all.korszak + 1].arSzoveg : '',
      idoSzoveg: all.korszak < KORSZAK.FENY ? oszlopokAlap[all.korszak + 1].idoSzoveg : '',
      nyitMondat: all.korszak < KORSZAK.FENY ? oszlopokAlap[all.korszak + 1].nyitMondat : '',
      hiany: [all.valtasHiany[0], all.valtasHiany[1], all.valtasHiany[2], all.valtasHiany[3]],
      indok: valtasIndok(all),
    },
    tetelek: kiTetelek,
    oszlopok,
    osszesites: {
      osszes: TECH_DB,
      kesz: all.keszDb,
      folyik: all.folyikDb,
      elerheto: all.elerhetoDb,
      zarva: all.zartDb,
      zarOkok: [all.zarDb[0], all.zarDb[1], all.zarDb[2], all.zarDb[3], all.zarDb[4]],
    },
  };
}

/**
 * A KUTATÁS-PARANCS előállítása — egyetlen helyen, hogy a panel és a szonda
 * ugyanazt küldje. `null`, ha a tétel nem indítható.
 *
 * ⚠️ A visszaadott objektum ÚJ: a parancs a soron `KESLELTETES` tickig ül, és
 * egy újrahasznált objektum közben átíródhatna.
 */
export function kutatasParancs(all, csapat, tech) {
  if (all.allapot[tech] !== TALLAPOT.ELERHETO) return null;
  const epulet = all.epuletId[tech];
  if (epulet < 0) return null;
  return { fajta: 'kutatas', csapat, tech, epulet };
}

/** A KORSZAK-PARANCS. `null`, ha most nem váltható korszak. */
export function korszakParancs(all, csapat) {
  if (all.valtas !== VALTAS.LEHET) return null;
  return { fajta: 'korszak', csapat };
}
