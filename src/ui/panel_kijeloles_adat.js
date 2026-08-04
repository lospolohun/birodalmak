// AGE OF THE CRYSTALS — KIJELÖLÉS-PANEL ADATRÉTEGE (v0.16).
//
// ── MIÉRT VAN KÜLÖN ADATRÉTEG ─────────────────────────────────────────────
// A panel-szerződés 4. kikötése miatt: a panel DOM-ot használ, tehát node-ban
// nem fut, tehát nem szondázható. Amit szondázni ÉRDEMES, az viszont nem a
// `<div>`-ek fája, hanem a KÉRDÉS, hogy „mi van kijelölve, és mit lehet vele
// csinálni" — ez pedig tiszta sim-olvasás. Az itt lévő függvények DOM-mentesek,
// és a `tools/panel_kijeloles_szonda.mjs` közvetlenül ezeket hívja.
//
// ── MIÉRT ÍR ELŐRE LEFOGLALT MODELLBE ─────────────────────────────────────
// A `frissit()` képkockánként fut, 60–144 Hz-en. Ha ez a réteg minden hívásra
// friss objektumokat és tömböket adna vissza, a kijelölés-panel önmagában
// szemetet gyártana másodpercenként százszor — pont az a fajta költség, amit a
// projekt a render `frissit()`-jében is tilt. Ezért `ujModell()` egyszer
// lefoglal mindent (hat típus-csoport, mindegyikhez egy `Int32Array`), és a
// `kijelolesAdat()` CSAK ÍR bele.
//
// ── MIÉRT KÉT ALÁÍRÁS (`szerkezetJel` / `ertekJel`) ───────────────────────
// Két nagyon különböző ütemű dolog van a panelen:
//   SZERKEZET — hány csoport van, milyen típusúak, melyik épület van kiválasztva.
//     Ritkán változik, de amikor változik, DOM-ot kell újraépíteni.
//   ÉRTÉK — életerő, készültség, sorban állók száma. Tickenként változik, de
//     csak szöveget és csík-szélességet mozgat.
// Ha egyetlen aláírás lenne, minden életerő-csökkenés teljes DOM-újraépítést
// kérne — egy csata alatt képkockánként. A kettő szétvágása pont ezt kerüli el.
//
// ── ⚠️ A TÁBLA-HOSSZ, AMIN EZ A PROJEKT MÁR ÖTSZÖR MEGÉGETT ───────────────
// A `TIPUS`-szal indexelt tábla HAT hosszú (MUNKAS LANDZSAS IJASZ LOVAG
// OSTROMGEP EGYEDI), az `EPULET`-tel indexelt TIZENEGY (KOZPONT RAKTAR FAL KAPU
// HAZ LAKTANYA IJASZDA ISTALLO OSTROMMUHELY TORONY PIAC). Egy rövidebb tábla
// `undefined`-ot ad, abból `'undefined'` felirat vagy `NaN` csík-szélesség lesz,
// és SEMMI nem szól érte. (A legutóbbi ilyen épp a kijelölő gyűrű sugara volt.)
// A szonda 1. vizsgálata ezért méri a hosszakat, a 2. pedig végigjárja MIND a
// hat típust és MIND a tizenegy épületet, és megnézi, hogy egyetlen mezőben
// sincs `undefined`, `NaN` vagy üres név.
//
// ── ⚠️ A SIM ALÁHÚZOTT METÓDUSAI ─────────────────────────────────────────
// Az egység harci adatsora (alapsebzés, ütem, páncél) a `harc.js` modul-szintű
// tábláiban ül, és az NINCS exportálva — a hozzáférés a `_alapSebzes`, `_utem`,
// `_pancelErtek`, `_tamadasTipus`, `_pancelTipus`, `_maxHp` metódusokon át
// vezet, a képzési idő pedig a `kepzes._ido`-n. Ez csúnya, de a NÉMÁN NULLA
// szám ennél sokkal rosszabb: a panel „sebzés 0"-t írna ki, és a játékos azt
// hinné, a lovagja nem üt. Ezért minden ilyen olvasás `_szam()`-on megy át, ami
// hiányzó metódusra `NaN`-t ad — a szonda 3. vizsgálata pedig KIFEJEZETTEN azt
// nézi, hogy mind a hat típusra értelmes szám jön-e. Ha valaki átnevezi őket, a
// kapu pirosra vált, nem a képernyő némul el.

import { TIPUS, TIPUS_DB } from '../sim/units.js';
import { HATOTAV, TAMADAS_NEV, PANCEL_NEV } from '../sim/harc.js';
import { EPULET_NEV, EP_NEPESSEG } from '../sim/epuletek.js';
import { KEPEZ, SOR_HOSSZ } from '../sim/kepzes.js';
import { KAPACITAS } from '../sim/beszallas.js';
import { MUNKA } from '../sim/munkas.js';
import { ALLAS_NEV } from '../sim/parancsallapot.js';
import { ALAKZAT_NEV } from '../sim/alakzat.js';
import { NYERS_NEV } from '../sim/eroforras.js';
import { TECH_DB, TECH_NEV, KUTAT } from '../sim/technologia.js';
import { IKON } from './ikonok.js';

/** Egy tick hossza másodpercben — a 20 Hz-es simből. */
const TICK_MP = 0.05;

// ── TÍPUS-INDEXELT TÁBLÁK — MIND PONTOSAN HAT HOSSZÚ ──────────────────────

/** Egységnevek. Az `EGYEDI` neve CSAPATFÜGGŐ: lásd `egysegNev()`. */
export const TIPUS_NEV = [
  'munkás', 'lándzsás', 'íjász', 'lovag', 'ostromgép', 'egyedi egység',
];

/** Melyik ikon jelöli. Az `ikonok.js` hat egységtípus-ikont ad, pont ennyit. */
export const TIPUS_IKON = [
  IKON.MUNKAS, IKON.LANDZSAS, IKON.IJASZ, IKON.LOVAG, IKON.OSTROMGEP, IKON.EGYEDI,
];

// ── ÉPÜLET-INDEXELT TÁBLÁK — MIND PONTOSAN TIZENEGY HOSSZÚ ────────────────

/** Épület-ikonok. A NÉV a sim `EPULET_NEV`-jéből jön, azt nem másoljuk. */
export const EPULET_IKON = [
  IKON.KOZPONT, IKON.RAKTAR, IKON.FAL, IKON.KAPU, IKON.HAZ, IKON.LAKTANYA,
  IKON.IJASZDA, IKON.ISTALLO, IKON.OSTROMMUHELY, IKON.TORONY, IKON.PIAC,
];

/**
 * ÉPÍTÉSI IDŐ tickben — MÁSOLAT az `epuletek.js` `EP_IDO` táblájáról.
 *
 * ⚠️ MIÉRT MÁSOLAT, ÉS MIÉRT NEM BAJ. Az `EP_IDO` nincs exportálva, a félkész
 * épület `epulHatra` mezője pedig csak a HÁTRALÉVŐ időt mondja — abból magától
 * nem jön ki, hogy hány százaléknál tart. A készültség-csík viszont pont az a
 * szám, amiért a játékos ránéz egy épülő házra.
 *
 * A másolat elcsúszhatna az eredetitől, és az csendben hazudna. Ezért a szonda
 * 6. vizsgálata MIND A TIZENEGY épületet lerakja egy éles simbe, és az itteni
 * számot a friss `epulHatra`-hoz hasonlítja. Ha valaki hangol egy építési időt,
 * a kapu pirosra vált — a csík nem kezd el hazudni.
 */
export const EP_EPITES_IDO = [200, 100, 30, 60, 100, 250, 250, 250, 300, 160, 240];

// ── ÁLLAPOT-SZÖVEGEK ──────────────────────────────────────────────────────

/** `ALLAPOT.*` — három hosszú. */
export const ALLAPOT_NEV = ['áll', 'menetel', 'harcol'];
/** `PARANCS.*` — ÖT hosszú (a `BESZALLAS` a v0.4-ben jött hozzá). */
export const PARANCS_NEV = ['—', 'menet', 'támadó menet', 'tartás', 'beszállás'];
/** `MUNKA.*` — négy hosszú. */
export const MUNKA_NEV = ['tétlen', 'lelőhelyre megy', 'gyűjt', 'lerakatra megy'];

// ── PARANCS-GOMBOK ────────────────────────────────────────────────────────
//
// ⚠️ A BILLENTYŰ A GOMBON VAN, ÉS EZ NEM DÍSZ. A v0.16-ig ezek KIZÁRÓLAG
// rejtett gyorsbillentyűk voltak (`bevitel.js` fejléce), vagyis a tulajdonos
// leült a játék elé, kijelölt nyolc katonát, és semmiből nem derült ki, hogy
// egyáltalán meg lehet őket állítani. Egy gomb, amin nincs ott a billentyűje,
// megtanítja a kattintást, de nem tanítja meg a JÁTÉKOT.
//
// ⚠️ AZ IKONOK KÖLCSÖNZÖTTEK, ÉS EZ TUDATOS. Az `ikonok.js` (EGY gazdája van,
// nem én) nem tart „állj"/„alakzat" rajzot. Az `ikonSvg` ismeretlen névre DOB,
// tehát kitalált nevet írni néma helyett hangos hiba lenne — de akkor is hiba.
// Ezért a meglévő készletből választunk metaforát:
//   állj          → SZUNET   (két függőleges hasáb: a megállás egyetemes jele)
//   tartás        → FAL      (a helyben maradás = fal, nem mozdul)
//   támadó menet  → LANDZSAS (fegyver: útközben harcolva megy)
//   állás         → FIGYELEM (mennyire megy bele magától: éberségi szint)
//   alakzat       → NEP      (több figura egymás mellett: a csapat rendje)
//   tétlen paraszt→ TETLEN   (erre VAN saját ikon, pont ehhez készült)
// Ha az `ikonok.js` gazdája később ad rendes rajzokat, itt egyetlen sor cserél.
export const GOMB_ALLJ = 0;
export const GOMB_TARTAS = 1;
export const GOMB_TAMADO = 2;
export const GOMB_ALLAS = 3;
export const GOMB_ALAKZAT = 4;
export const GOMB_TETLEN = 5;

/** A gombok leíró táblája. Sorrendje a panelen látott sorrend. */
export const GOMBOK = [
  { kulcs: 'allj', nev: 'Állj', billentyu: 'X', ikon: IKON.SZUNET,
    sugo: 'minden parancs törlése, azonnali megállás' },
  { kulcs: 'tartas', nev: 'Tartás', billentyu: 'H', ikon: IKON.FAL,
    sugo: 'helyben marad, csak a hatósugarába lépőre reagál' },
  { kulcs: 'tamado', nev: 'Támadó menet', billentyu: 'T', ikon: IKON.LANDZSAS,
    sugo: 'a következő jobb kattintás útközben ellenséget keres' },
  { kulcs: 'allas', nev: 'Állás', billentyu: 'G', ikon: IKON.FIGYELEM,
    sugo: 'agresszív → védekező → tartás → tűzszünet' },
  { kulcs: 'alakzat', nev: 'Alakzat', billentyu: 'F', ikon: IKON.NEP,
    sugo: 'négyzet → vonal → ék → szórt' },
  { kulcs: 'tetlen', nev: 'Tétlen paraszt', billentyu: '.', ikon: IKON.TETLEN,
    sugo: 'ugrás a következő munka nélkül álló parasztra' },
];
export const GOMB_DB = GOMBOK.length;

// ── SEGÉDEK ───────────────────────────────────────────────────────────────

/**
 * Egy sim-metódus hívása úgy, hogy a HIÁNYA LÁTSZÓDJON.
 *
 * Ha a metódus eltűnik vagy nevet vált, `NaN` jön vissza, nem 0. A nulla
 * beleolvadna a normális számok közé („nincs páncélja"), a `NaN` viszont
 * végigfut a modellen, és a szonda 2. és 3. vizsgálata elkapja.
 */
function _szam(obj, metodus, ...arg) {
  if (!obj || typeof obj[metodus] !== 'function') return NaN;
  const v = obj[metodus](...arg);
  return typeof v === 'number' ? v : NaN;
}

/** Százalék 0..100 egészben, nulla nevezőre 0. */
function _szazalek(most, max) {
  if (!(max > 0)) return 0;
  const sz = Math.round((most * 100) / max);
  return sz < 0 ? 0 : (sz > 100 ? 100 : sz);
}

/** Tick → egész másodperc, FELFELÉ (a „3 mp múlva kész" sosem hazudhat lefelé). */
function _mp(tick) { return Math.ceil((tick | 0) * TICK_MP); }

/** 32 bites keverés az aláírásokhoz. Nem a simben van, `Math.imul` szabad. */
function _mix(h, v) {
  h = (h ^ ((v | 0) + 0x9e3779b9)) >>> 0;
  return Math.imul(h, 16777619) >>> 0;
}

/**
 * Az egység neve. Az `EGYEDI` névtelen a táblában, mert a hat típusból ez az
 * egy CSAPATFÜGGŐ: a Kőtörő és a Sztyeppei portya ugyanaz a `TIPUS.EGYEDI`.
 * @returns {string} sosem üres, sosem `undefined`
 */
export function egysegNev(sim, tipus, csapat) {
  if (tipus === TIPUS.EGYEDI && sim && sim.egyedi) {
    const n = sim.egyedi.nev(csapat);
    if (n && n !== '—') return n;
    return TIPUS_NEV[TIPUS.EGYEDI];
  }
  return TIPUS_NEV[tipus] || 'ismeretlen egység';
}

/**
 * Egy egységtípus harci adatsora — a nagy ikon melletti számok.
 *
 * A `sebzes` a NYERS alapsebzés (technológia és civ nélkül), a `sebzesGyalog`
 * pedig az, ami egy gyalogos páncélú célponton ténylegesen átmegy — a kettő
 * együtt mondja el, miért gyenge az ostromgép élő cél ellen. Egyik sem
 * helyettesíti a másikat: az elsőt a játékos a saját fejlesztéseivel akarja
 * összevetni, a másodikat a csatában látottakkal.
 */
export function harcAdat(sim, tipus, csapat, ki) {
  const h = sim.harc;
  const cs = csapat | 0;
  const o = ki || {};
  o.maxHp = _szam(h, '_maxHp', tipus, cs);
  o.sebzes = _szam(h, '_alapSebzes', tipus, cs);
  o.pancelErtek = _szam(h, '_pancelErtek', tipus, cs);
  const utem = _szam(h, '_utem', tipus, cs);
  o.utemTick = utem;
  // Másodpercre kerekítve két tizedesre: az „ütem 0,75 mp" olvasható, a
  // „15 tick" nem. A kerekítés itt UI-dolog, a simben ilyet nem szabad.
  o.utemMp = Number.isFinite(utem) ? Math.round(utem * TICK_MP * 100) / 100 : NaN;
  const tt = _szam(h, '_tamadasTipus', tipus, cs);
  const pt = _szam(h, '_pancelTipus', tipus, cs);
  o.tamadasNev = TAMADAS_NEV[tt] || '?';
  o.pancelNev = PANCEL_NEV[pt] || '?';
  o.hatotav = HATOTAV[tipus];
  // Mennyi megy át egy gyalogos páncélú célponton? A `sebzesErtek` NYILVÁNOS,
  // és beleszámítja a technológiát meg a civet is.
  o.sebzesGyalog = typeof h.sebzesErtek === 'function'
    ? h.sebzesErtek(tipus, TIPUS.LANDZSAS, cs, 1 - cs) : NaN;
  return o;
}

/**
 * A KÖVETKEZŐ tétlen munkás indexe — a tétlen-paraszt gomb ugrása.
 *
 * Körbejár: az `utana` index UTÁN keres, és ha nem talál, elölről kezdi. Ez a
 * klasszikus AoE-viselkedés — a gomb ismételt nyomkodásával végig lehet menni
 * az összes ácsorgó paraszton, nem ugyanarra ugrik vissza mindig.
 *
 * @param {import('../sim/sim.js').Sim} sim
 * @param {number} csapat
 * @param {number} utana ennél nagyobb indexet keresünk először; -1 = az elejétől
 * @returns {number} egység-index, vagy -1 ha nincs tétlen paraszt
 */
export function kovetkezoTetlen(sim, csapat, utana) {
  const e = sim.egysegek;
  const m = sim.munkasok;
  const h = sim.harc;
  const db = e.db;
  const kezd = (utana | 0) + 1;
  for (let k = 0; k < db; k++) {
    const i = (kezd + k) % db;
    if (e.csapat[i] !== csapat) continue;
    if (e.tipus[i] !== TIPUS.MUNKAS) continue;
    if (h && h.elo[i] === 0) continue;
    if (m.allapot[i] !== MUNKA.NINCS) continue;
    return i;
  }
  return -1;
}

// ── A MODELL ──────────────────────────────────────────────────────────────

/**
 * Előre lefoglalt modell. EGYSZER hívd, a panel élettartamára.
 * @param {number} maxEgyseg a sim felső korlátja — a csoport-pufferek mérete
 */
export function ujModell(maxEgyseg = 2000) {
  // ⚠️ KÉT TÖMB, EGY OBJEKTUM-KÉSZLET, ÉS EZ NEM PAZARLÁS.
  // A `tipusCsoport` TÍPUS szerint indexelt és SOSEM rendeződik át — ide gyűjt
  // a számláló ciklus. A `csoportok` a MEGJELENÍTÉSI sorrend, amiben csak a
  // nem üres csoportok szerepelnek, sűrűn, a tömb elején. Az első változat
  // egyetlen tömböt használt és helyben cserélgetett; ott a következő
  // képkockán a `csoportok[LOVAG]` már az íjászok pufferére mutatott, és a
  // panel a rossz egységeket jelölte volna ki al-kijelöléskor.
  const tipusCsoport = new Array(TIPUS_DB);
  for (let t = 0; t < TIPUS_DB; t++) {
    tipusCsoport[t] = {
      tipus: t, nev: '', ikon: TIPUS_IKON[t], db: 0,
      hp: 0, maxHp: 0, hpSzaz: 0,
      // Saját puffer típusonként. 6 × maxEgyseg × 4 bájt = 48 kB 2000 egységnél
      // — egyszeri ár azért, hogy az al-kijelölés soha ne allokáljon.
      indexek: new Int32Array(maxEgyseg),
    };
  }
  const csoportok = new Array(TIPUS_DB).fill(null);
  const gombok = new Array(GOMB_DB);
  for (let g = 0; g < GOMB_DB; g++) {
    gombok[g] = {
      kulcs: GOMBOK[g].kulcs, nev: GOMBOK[g].nev, billentyu: GOMBOK[g].billentyu,
      ikon: GOMBOK[g].ikon, sugo: GOMBOK[g].sugo,
      aktiv: false, jelolt: false, ertek: '',
    };
  }
  return {
    /** `'ures' | 'egy' | 'tobb' | 'epulet'` */
    fajta: 'ures',
    csapat: 0,
    /** Hány ÉLŐ egység van kijelölve (a halottakat kiszórjuk). */
    db: 0,
    hp: 0, maxHp: 0, hpSzaz: 0,
    /** Hány TÍPUS-csoport keletkezett. A csoportok a tömb elején sűrűn állnak. */
    csoportDb: 0,
    csoportok,
    /** TÍPUS szerint indexelt, sosem rendeződik át — lásd az `ujModell` elejét. */
    tipusCsoport,
    /** Csak `fajta === 'egy'` esetén értelmes. */
    egy: {
      van: false, index: -1, tipus: -1, nev: '', ikon: '',
      hp: 0, maxHp: 0, hpSzaz: 0,
      sebzes: 0, sebzesGyalog: 0, pancelErtek: 0, pancelNev: '', tamadasNev: '',
      hatotav: 0, utemMp: 0, utemTick: 0,
      allapotNev: '', parancsNev: '', allasNev: '', alakzatNev: '',
      munkasE: false, munkaNev: '', cipelDb: 0, cipelNyers: '',
    },
    /** Csak `fajta === 'epulet'` esetén értelmes. */
    ep: {
      van: false, index: -1, tipus: -1, nev: '', ikon: '',
      /** A kijelölő csapaté-e. Hamis esetén a „mi folyik benne" mezők üresek. */
      sajat: false,
      hp: 0, maxHp: 0, hpSzaz: 0,
      kesz: false, epitSzaz: 0, epitMp: 0,
      /** Mi folyik benne — képzési sor. */
      sorDb: 0, sorTipus: new Int32Array(SOR_HOSSZ), sorNev: new Array(SOR_HOSSZ).fill(''),
      sorIkon: new Array(SOR_HOSSZ).fill(''),
      kepzesSzaz: 0, kepzesMp: 0,
      /** Mi folyik benne — kutatás. */
      kutatNev: '', kutatMp: 0,
      /** Őrség (beszállásolás) és egyéb szerepek. */
      orseg: 0, orsegMax: 0, nepesseg: 0, lerakat: false, kepzoE: false,
    },
    gombDb: GOMB_DB,
    gombok,
    /** A tétlen-paraszt gomb számai. */
    munkasDb: 0, tetlenDb: 0,
    /** Változás-detektorok — lásd a fejlécet. */
    szerkezetJel: 0, ertekJel: 0,
  };
}

/**
 * A kijelölés lefordítása képernyőre való adattá.
 *
 * NULLA ALLOKÁCIÓ a második hívástól: mindent a `modell`-be ír.
 *
 * @param {import('../sim/sim.js').Sim} sim
 * @param {{egysegek?:number[]|Int32Array, db?:number, epulet?:number,
 *          csapat?:number, tamadoMod?:boolean}} valasztas
 *   `egysegek` a kijelölt egység-indexek (a `Kijeloles.lista`), `epulet` a
 *   kiválasztott épület indexe vagy -1. A kettő közül az EGYSÉG az erősebb: ha
 *   van kijelölt egység, azt mutatjuk. (Az épület-kijelölés önálló UI-réteg, és
 *   nem az enyém — ez a réteg csak fogadja, ha valaki beadja.)
 * @param {object} modell az `ujModell()` eredménye
 * @returns {object} ugyanaz a `modell`
 */
export function kijelolesAdat(sim, valasztas, modell) {
  const m = modell;
  const e = sim.egysegek;
  const h = sim.harc;
  const pa = sim.parancsAllapot;
  const cs = (valasztas && valasztas.csapat) | 0;
  m.csapat = cs;

  const lista = (valasztas && valasztas.egysegek) || null;
  const listaDb = lista
    ? ((valasztas.db !== undefined ? valasztas.db : lista.length) | 0) : 0;

  // ── 1. CSOPORTOSÍTÁS TÍPUSONKÉNT ────────────────────────────────────
  for (let t = 0; t < TIPUS_DB; t++) {
    const g = m.tipusCsoport[t];
    g.db = 0; g.hp = 0; g.maxHp = 0; g.hpSzaz = 0;
  }
  let osszDb = 0, osszHp = 0, osszMaxHp = 0;
  let elsoIndex = -1;

  for (let k = 0; k < listaDb; k++) {
    const i = lista[k] | 0;
    // ⚠️ HATÁR- ÉS ÉLET-ELLENŐRZÉS. A kijelölés-lista kívülről jön, és a
    // v0.4 óta a halott slot MEGMARAD. Aki ezt kihagyja, hullákat számol
    // bele az életerő-csíkba, és a panel „8 lándzsás"-t mutat, miközben
    // hármat már megöltek.
    if (i < 0 || i >= e.db) continue;
    if (h && h.elo[i] === 0) continue;
    const t = e.tipus[i];
    if (t < 0 || t >= TIPUS_DB) continue;
    const g = m.tipusCsoport[t];
    if (g.db < g.indexek.length) g.indexek[g.db] = i;
    g.db++;
    const hp = h ? h.hp[i] : 0;
    const mx = h ? h.maxHp[i] : 0;
    g.hp += hp; g.maxHp += mx;
    osszHp += hp; osszMaxHp += mx;
    if (elsoIndex < 0) elsoIndex = i;
    osszDb++;
  }

  // A csoportokat SŰRŰN, típus-sorrendben tesszük a tömb elejére: a panel így
  // `0..csoportDb` között jár, és nem kell üres helyeket kihagynia.
  let cdb = 0;
  for (let t = 0; t < TIPUS_DB; t++) {
    const g = m.tipusCsoport[t];
    if (g.db === 0) continue;
    g.nev = egysegNev(sim, t, cs);
    g.ikon = TIPUS_IKON[t];
    g.hpSzaz = _szazalek(g.hp, g.maxHp);
    m.csoportok[cdb++] = g;
  }
  for (let c = cdb; c < TIPUS_DB; c++) m.csoportok[c] = null;
  m.csoportDb = cdb;
  m.db = osszDb;
  m.hp = osszHp;
  m.maxHp = osszMaxHp;
  m.hpSzaz = _szazalek(osszHp, osszMaxHp);

  // ── 2. AZ ÉPÜLET ────────────────────────────────────────────────────
  const epIdx = valasztas && valasztas.epulet !== undefined ? (valasztas.epulet | 0) : -1;
  _epulet(sim, epIdx, m.ep, cs);

  // ── 3. FAJTA ────────────────────────────────────────────────────────
  m.fajta = osszDb === 0
    ? (m.ep.van ? 'epulet' : 'ures')
    : (osszDb === 1 ? 'egy' : 'tobb');

  // ── 4. AZ EGY KIJELÖLT EGYSÉG RÉSZLETEI ─────────────────────────────
  const egy = m.egy;
  if (m.fajta === 'egy') {
    const i = elsoIndex;
    egy.van = true;
    egy.index = i;
    const t = e.tipus[i];
    egy.tipus = t;
    egy.nev = egysegNev(sim, t, cs);
    egy.ikon = TIPUS_IKON[t];
    egy.hp = h ? h.hp[i] : 0;
    egy.maxHp = h ? h.maxHp[i] : 0;
    egy.hpSzaz = _szazalek(egy.hp, egy.maxHp);
    harcAdat(sim, t, cs, egy);
    egy.allapotNev = ALLAPOT_NEV[e.allapot[i]] || '?';
    egy.parancsNev = PARANCS_NEV[pa.parancs[i]] || '?';
    egy.allasNev = ALLAS_NEV[pa.allas[i]] || '?';
    egy.alakzatNev = ALAKZAT_NEV[pa.alakzat[i]] || '?';
    egy.munkasE = t === TIPUS.MUNKAS;
    if (egy.munkasE && sim.munkasok) {
      const mu = sim.munkasok;
      egy.munkaNev = MUNKA_NEV[mu.allapot[i]] || '?';
      egy.cipelDb = mu.cipelDb[i] | 0;
      egy.cipelNyers = egy.cipelDb > 0 ? (NYERS_NEV[mu.cipelFajta[i]] || '') : '';
    } else {
      egy.munkaNev = ''; egy.cipelDb = 0; egy.cipelNyers = '';
    }
  } else {
    egy.van = false;
    egy.index = -1;
    egy.tipus = -1;
  }

  // ── 5. TÉTLEN PARASZTOK ─────────────────────────────────────────────
  const mo = sim.munkasok ? sim.munkasok.osszesites(cs) : null;
  m.munkasDb = mo ? (mo.db | 0) : 0;
  // ⚠️ A `tetlen` mező a v0.16-ban került a `munkas.osszesites`-be. Ha egy
  // régebbi simmel futnánk, a `?? -1` HAZUDNA egy nullát; az `undefined`-ból
  // számolt `NaN` viszont látszik, és a szonda 5. vizsgálata elkapja.
  m.tetlenDb = mo ? Number(mo.tetlen) : NaN;

  // ── 6. GOMBOK ───────────────────────────────────────────────────────
  const vanKijeloles = osszDb > 0;
  const gb = m.gombok;
  gb[GOMB_ALLJ].aktiv = vanKijeloles;
  gb[GOMB_TARTAS].aktiv = vanKijeloles;
  gb[GOMB_TAMADO].aktiv = vanKijeloles;
  gb[GOMB_ALLAS].aktiv = vanKijeloles;
  gb[GOMB_ALAKZAT].aktiv = vanKijeloles;
  gb[GOMB_TETLEN].aktiv = m.tetlenDb > 0;

  gb[GOMB_TAMADO].jelolt = !!(valasztas && valasztas.tamadoMod);
  // Az állás és az alakzat a kijelölés ELSŐ egységéé — ugyanaz a szabály, amit
  // a `bevitel._szinkron()` követ. Így a gomb azt mutatja, ami tényleg
  // érvényes, nem azt, amit legutóbb valahol beállítottunk.
  gb[GOMB_ALLAS].ertek = vanKijeloles ? (ALLAS_NEV[pa.allas[elsoIndex]] || '?') : '—';
  gb[GOMB_ALAKZAT].ertek = vanKijeloles ? (ALAKZAT_NEV[pa.alakzat[elsoIndex]] || '?') : '—';
  gb[GOMB_TETLEN].ertek = Number.isFinite(m.tetlenDb)
    ? String(m.tetlenDb) + ' / ' + m.munkasDb : '?';
  gb[GOMB_ALLJ].ertek = '';
  gb[GOMB_TARTAS].ertek = '';
  gb[GOMB_TAMADO].ertek = '';

  // ── 7. ALÁÍRÁSOK ────────────────────────────────────────────────────
  let sz = 0x811c9dc5;
  sz = _mix(sz, m.fajta.length * 31 + m.fajta.charCodeAt(0));
  sz = _mix(sz, m.csoportDb);
  for (let c = 0; c < m.csoportDb; c++) {
    sz = _mix(sz, m.csoportok[c].tipus);
    sz = _mix(sz, m.csoportok[c].db);
  }
  sz = _mix(sz, egy.van ? egy.index : -1);
  sz = _mix(sz, egy.tipus);
  sz = _mix(sz, m.ep.van ? m.ep.index : -1);
  sz = _mix(sz, m.ep.tipus);
  sz = _mix(sz, m.ep.sorDb);
  for (let k = 0; k < m.ep.sorDb; k++) sz = _mix(sz, m.ep.sorTipus[k]);
  sz = _mix(sz, m.ep.kutatNev.length);
  for (let g = 0; g < GOMB_DB; g++) {
    sz = _mix(sz, (gb[g].aktiv ? 1 : 0) | (gb[g].jelolt ? 2 : 0));
    sz = _mix(sz, gb[g].ertek.length ? gb[g].ertek.charCodeAt(0) : 0);
  }
  m.szerkezetJel = sz;

  let er = 0x01000193;
  er = _mix(er, m.hp);
  er = _mix(er, m.maxHp);
  er = _mix(er, m.db);
  for (let c = 0; c < m.csoportDb; c++) er = _mix(er, m.csoportok[c].hp);
  er = _mix(er, egy.van ? egy.hp : 0);
  er = _mix(er, egy.van ? (e.allapot[egy.index] * 8 + pa.parancs[egy.index]) : 0);
  er = _mix(er, egy.van && egy.munkasE ? (egy.cipelDb * 8 + sim.munkasok.allapot[egy.index]) : 0);
  er = _mix(er, m.ep.hp);
  er = _mix(er, m.ep.epitMp * 4 + m.ep.epitSzaz);
  er = _mix(er, m.ep.kepzesMp * 4 + m.ep.kepzesSzaz);
  er = _mix(er, m.ep.kutatMp);
  er = _mix(er, m.ep.orseg);
  er = _mix(er, Number.isFinite(m.tetlenDb) ? m.tetlenDb : 0xdead);
  er = _mix(er, m.munkasDb);
  m.ertekJel = er;

  return m;
}

/**
 * Az épület-rész kitöltése. Külön függvény, mert a hívási helyen egy hetven
 * soros blokk lenne, és mert a szonda önmagában is járatni akarja mind a
 * tizenegy épülettípusra.
 *
 * @param {number} idx épület-index, vagy -1
 * @param {object} o a modell `ep` része
 */
function _epulet(sim, idx, o, cs) {
  const ep = sim.epuletek;
  o.sorDb = 0;
  o.kutatNev = ''; o.kutatMp = 0;
  o.kepzesSzaz = 0; o.kepzesMp = 0;
  if (idx < 0 || !ep || idx >= ep.db || ep.elo[idx] === 0) {
    o.van = false; o.index = -1; o.tipus = -1; o.nev = ''; o.ikon = '';
    o.hp = 0; o.maxHp = 0; o.hpSzaz = 0; o.kesz = false;
    o.epitSzaz = 0; o.epitMp = 0;
    o.orseg = 0; o.orsegMax = 0; o.nepesseg = 0;
    o.lerakat = false; o.kepzoE = false; o.sajat = false;
    return o;
  }
  const t = ep.tipus[idx];
  // ── MI LÁTSZIK KÍVÜLRŐL, ÉS MI NEM ──────────────────────────────────
  // A v0.18-ig a panel MINDEN épületről mindent kiírt, csapattól függetlenül —
  // az épület-kattintás pedig ellenségeset is visszaad. A kijelölés kliens-
  // oldali, tehát ez nem desyncet okozott, hanem annál rosszabbat: a v0.8
  // lockstepben az ELLENFÉL TERMELÉSE szivárgott ki. Aki rákattint az ellenség
  // laktanyájára, elolvassa, hogy mit képez és mit kutat — vagyis a felderítés
  // értelmét veszti, méghozzá NÉMÁN, mert a felület ettől még helyesnek látszik.
  //
  // A határ: ami az épületen KÍVÜLRŐL látszik, az mehet (típus, életerő,
  // készültség — az állvány magassága úgyis a képen van). Ami a falon BELÜL
  // van, az nem: képzési sor, kutatás, őrség létszáma.
  const sajat = ep.csapat[idx] === (cs | 0);
  o.sajat = sajat;
  o.van = true;
  o.index = idx;
  o.tipus = t;
  o.nev = EPULET_NEV[t] || 'ismeretlen épület';
  o.ikon = EPULET_IKON[t] || IKON.KOZPONT;
  o.hp = ep.hp[idx] | 0;
  o.maxHp = ep.maxHp[idx] | 0;
  o.hpSzaz = _szazalek(o.hp, o.maxHp);

  const hatra = ep.epulHatra[idx] | 0;
  o.kesz = hatra === 0 && ep.elo[idx] === 1;
  const teljes = EP_EPITES_IDO[t];
  o.epitMp = _mp(hatra);
  // A készültség a MÁSOLT építési időből jön — lásd az `EP_EPITES_IDO`
  // fejlécét és a szonda 6. vizsgálatát.
  o.epitSzaz = o.kesz ? 100
    : (teljes > 0 ? _szazalek(teljes - hatra, teljes) : 0);

  // ── MI FOLYIK BENNE: KÉPZÉS ─────────────────────────────────────────
  const kp = sajat ? sim.kepzes : null;
  if (kp) {
    const db = Math.min(kp.sorDb[idx] | 0, SOR_HOSSZ);
    o.sorDb = db;
    for (let k = 0; k < db; k++) {
      const tip = kp.sor[idx * SOR_HOSSZ + k];
      o.sorTipus[k] = tip;
      o.sorNev[k] = tip >= 0 ? egysegNev(sim, tip, ep.csapat[idx]) : '—';
      o.sorIkon[k] = tip >= 0 ? (TIPUS_IKON[tip] || IKON.EGYEDI) : IKON.IDO;
    }
    if (db > 0) {
      const kHatra = kp.hatra[idx] | 0;
      o.kepzesMp = _mp(kHatra);
      const teljesIdo = _szam(kp, '_ido', ep.csapat[idx], o.sorTipus[0]);
      o.kepzesSzaz = teljesIdo > 0 ? _szazalek(teljesIdo - kHatra, teljesIdo) : 0;
    }
  }

  // ── MI FOLYIK BENNE: KUTATÁS ────────────────────────────────────────
  // A `technologia.hol[]` mondja meg, MELYIK épületben folyik — enélkül a panel
  // csak azt tudná, hogy „valahol kutatnak".
  const te = sajat ? sim.technologia : null;
  if (te) {
    const csap = ep.csapat[idx];
    for (let tech = 0; tech < TECH_DB; tech++) {
      const off = csap * TECH_DB + tech;
      if (te.allapot[off] !== KUTAT.FOLYIK || te.hol[off] !== idx) continue;
      o.kutatNev = TECH_NEV[tech] || 'kutatás';
      o.kutatMp = _mp(te.hatra[off]);
      break;
    }
  }

  // ── SZEREPEK ────────────────────────────────────────────────────────
  // ⚠️ Az őrség LÉTSZÁMA is a falon belül van, tehát ugyanaz a szabály áll rá:
  // egy ellenséges toronyról nem tudható meg, hány íjász ül benne — pedig épp
  // az dönti el, érdemes-e megrohamozni. Az `orsegMax` viszont STATIKUS
  // tábla-adat (a torony mindig ötöt bír), az nem titok.
  o.orseg = (sajat && sim.beszallas) ? (sim.beszallas.letszam[idx] | 0) : 0;
  o.orsegMax = KAPACITAS[t] | 0;
  o.nepesseg = EP_NEPESSEG[t] | 0;
  // ⚠️ A `KEPEZ` tábla KILENC hosszú, nem tizenegy: a torony és a piac nem is
  // szerepel benne. Guard nélkül `KEPEZ[9].length` azonnal dobna — a panel
  // pedig egy torony kijelölésekor halna meg, ami pont az a néma hiba, amiért
  // ez a fejléc-blokk létezik.
  const kepezLista = KEPEZ[t];
  o.kepzoE = !!(kepezLista && kepezLista.length > 0);
  // A lerakat-tábla nincs exportálva; a központ és a raktár az, és pont.
  o.lerakat = t === 0 || t === 1;
  return o;
}

/**
 * Az al-kijelölés indexei egy csoportból. A panel a csoport-csempe
 * kattintásakor hívja, és a kapott tömböt a `Kijeloles`-be tölti.
 *
 * NEM a puffert adja vissza, hanem NÉZETET rá — másolat nélkül, de a hívó így
 * sem tud belenyúlni a következő `kijelolesAdat()` eredményébe (mert az úgyis
 * felülírja). Csak KATTINTÁSRA fut, nem képkockánként, tehát a nézet-objektum
 * allokációja itt rendben van.
 */
export function csoportIndexek(modell, csoportSorszam) {
  if (csoportSorszam < 0 || csoportSorszam >= modell.csoportDb) return null;
  const g = modell.csoportok[csoportSorszam];
  return g.indexek.subarray(0, g.db);
}
