// AGE OF THE CRYSTALS — TANÁCSADÓ-SZABÁLYOK (v0.16): a néma birodalom megszólal.
//
// ── MIÉRT VAN EGYÁLTALÁN ──────────────────────────────────────────────────
// A tulajdonos leült a v0.10-zel és nem tudott vele mit kezdeni. Nem azért,
// mert a motor rossz — a motor jó —, hanem mert a játék SOHA nem szól neki
// semmiről. Négy parasztja húsz percen át tétlenül állt, a népessége az első
// perctől tele volt, a végén elvesztette a központját, és minderről EGYETLEN
// mondat sem jelent meg a képernyőn. A HUD kiírta a számokat; a számok viszont
// nem mondják meg, hogy BAJ VAN.
//
// A mérce a TELEPESEK v1.3.1 tanácsadó-sávja. Ott nem riasztás jelenik meg,
// hanem MEGFIGYELÉS, számmal alátámasztva:
//
//     „A laktanya az idő 100%-ában kard nélkül állt."
//     „A pékség az idő 79%-ában liszt hiányában állt."
//
// Ez a hang a cél. Nem „figyelem: alacsony nyersanyag", hanem egy mondat, ami
// megnevezi a HELYET, a MENNYIT és a MIÓTA-t. Ehhez a rétegnek MÉRNIE kell, nem
// csak küszöböt figyelnie — ezért van itt idő-részarány-számláló, tétlenség-óra
// és bevétel-csend-figyelő, nem pedig egy `if (etel < 50)`.
//
// ── ⚠️ MIÉRT NINCS EZ A SIMBEN ────────────────────────────────────────────
// Csábító lenne a `sim/`-be tenni, hiszen a sim állapotából dolgozik. Nem
// szabad: ez a réteg IDŐT MÉR, RÉSZARÁNYT SZÁMOL LEBEGŐPONTON, és a saját
// kiértékelési ütemétől függő állapotot tart. Mindhárom desync-forrás lenne a
// v0.8 lockstepjében — két gépen más képkocka-ütemmel más elnyomási állapot
// alakulna ki, és ha bármi ebből visszahatna a világra, a két gép elválna.
//
// A védelem: ez a fájl CSAK OLVAS. Nincs benne egyetlen sim-írás sem, és nem
// ad be parancsot sem. A `tools/panel_uzenetek_szonda.mjs` 7. vizsgálata ezt
// hash-összehasonlítással bizonyítja: ugyanaz a meccs a szabályréteggel és
// nélküle bitre azonos `allapotHash()`-t ad 12 000 tick után.
//
// ── ⚠️ A NÉMA SZABÁLY TÖKÉLETESEN ZÖLD ────────────────────────────────────
// Ez a projekt legdrágább tanulsága, és sehol nem élesebb, mint itt. Egy
// szabályréteg, ami soha nem szólal meg, minden kapun átmegy: nem dob, nem
// allokál, nem lassít. Ezért a szonda VALÓDI meccset futtat (`meccs.js` →
// `meccsSim`), 12 000 ticket léptet, és SZÁMOKAT követel: melyik szabály
// hányszor sült el, és — szabotázzsal — a néma szabály tényleg néma marad-e.
//
// ── ⚠️ NE SZEMETELJ: AZ ELNYOMÁS A RÉTEG FELE ─────────────────────────────
// A tétlen paraszt másodpercenként tétlen. Elnyomás nélkül ez a réteg percenként
// hatvan üzenetet írna ugyanarról, és a játékos két perc múlva átnézne rajta —
// vagyis pontosan olyan néma lenne, mint most, csak hangosabban. Három fék van:
//
//   1. IDŐZÁR kulcsonként (`zar`). Nem szabályonként: `ures_kepzo:7` külön zár,
//      mint `ures_kepzo:12` — két külön laktanyáról két külön mondat jár.
//   2. VISSZALÉPTETÉS (`zarSzorzo`): ha ugyanaz a baj MEGMARAD, a zár duplázódik
//      a maximumig. A 20 másodperces „tétlen a parasztod" így 20 → 40 → 80 …
//      → 180 másodpercre ritkul. Ha a baj megszűnik és később visszatér, a zár
//      visszaáll az alapra (`_zarVissza`) — a friss baj friss hangot kap.
//   3. KIÉRTÉKELÉSENKÉNTI KERET (`egyszerreMax`): egy kiértékelésből legfeljebb
//      két üzenet jut ki, és a szabályok SÚLY szerinti sorrendben kérnek szót.
//      Ostrom közben tehát nem a „sok a fád" megy ki, hanem a „támadás alatt a
//      központod" — a maradék úgyis visszajön, mert az állapota megmarad.
//
// ── ALLOKÁCIÓ ─────────────────────────────────────────────────────────────
// A KÉPKOCKÁNKÉNTI út nulla allokáció: a `frissit()` az első sorban kiszáll, ha
// nem telt le a kiértékelési köz. Maga a kiértékelés MÁSODPERCENKÉNT EGYSZER
// fut, és ott a sim összesítői (`gazdasag.allapot`, `nepessegAllapot`) néhány
// objektumot létrehoznak — ez tudatos csere: a saját, párhuzamos számolás
// elcsúszna a simtől, és a v0.11 „MUNKÁS 0" hibája pont ebből a fajtából volt.
// Az üzenet-objektumok viszont ELŐRE lefoglalt gyűrűből jönnek, és a szöveg
// csak MEGSZÓLALÁSKOR épül: az elnyomott szabály egyetlen stringet sem gyárt
// (`_kerhet()` a szöveg ELŐTT dönt).

import { TIPUS, ALLAPOT } from '../sim/units.js';
import { MUNKA } from '../sim/munkas.js';
import { EPULET, EPULET_NEV, EP_AR } from '../sim/epuletek.js';
import { NYERS, NYERS_NEV } from '../sim/eroforras.js';
import { KORSZAK, KORSZAK_NEV } from '../sim/gazdasag.js';
import { TECH_DB, TECH_NEV, TECH_LEIRAS, KUTAT } from '../sim/technologia.js';
import { TICK_HZ } from '../sim/sim.js';

/** Az üzenet fajtája — ugyanaz a három, amit a `hud.uzenet()` ismer. */
export const FAJTA = { INFO: 'info', FIGYELEM: 'figyelem', BAJ: 'baj' };

/**
 * A szabályok. SZÁM, nem string — az időzár kulcsa ebből és egy alkulcsból
 * (épület-index, nyersanyag-fajta, technológia) számtani úton áll össze, tehát
 * a kiértékelés nem gyárt kulcs-stringeket. Egy másodpercenkénti stringgyártás
 * még elférne, de az elnyomott ág éppen attól lenne drága, amitől néma.
 */
export const SZABALY = {
  TAMADAS: 0,
  EPULET_ELVESZETT: 1,
  VEDTELEN: 2,
  EGYSEG_ELESETT: 3,
  ELLENSEG_FELDERITVE: 4,
  NEP_KORLAT: 5,
  NYERS_HIANY: 6,
  TETLEN_PARASZT: 7,
  URES_KEPZO: 8,
  NINCS_KEPZO: 9,
  PAZARLAS: 10,
  KORSZAK_KESZ: 11,
  KORSZAK_INDULT: 12,
  KUTATAS_KESZ: 13,
  EPULET_KESZ: 14,
};

/** Olvasható nevek — a szonda és a napló ezt írja ki. Index = `SZABALY.*`. */
export const SZABALY_NEV = [
  'tamadas', 'epulet_elveszett', 'vedtelen', 'egyseg_elesett',
  'ellenseg_felderitve', 'nep_korlat', 'nyers_hiany', 'tetlen_paraszt',
  'ures_kepzo', 'nincs_kepzo', 'pazarlas', 'korszak_kesz', 'korszak_indult',
  'kutatas_kesz', 'epulet_kesz',
];
export const SZABALY_DB = SZABALY_NEV.length;

/**
 * Szabályonkénti elnyomás. `zar` a legrövidebb szünet TICKBEN két azonos kulcsú
 * üzenet között, `zarMax` a visszaléptetés plafonja, `suly` a sorrend (nagyobb
 * előbb kér szót a kiértékelési keretből).
 *
 * ⚠️ AZ ESEMÉNY-SZABÁLYOKNAK NINCS VISSZALÉPTETÉSE (`zarMax === zar`). A kész
 * kutatás, az elkészült épület és a korszakváltás EGYSZER történik meg, és a
 * kulcsuk egyedi (technológia-index, épület-index) — ott a zár csak a
 * kettőzést fogja meg, ritkítani nincs mit. Ha ezeket is ritkítanánk, két
 * gyorsan egymás után elkészült épületből a második néma maradna.
 */
const TABLA = [
  /* TAMADAS             */ { fajta: FAJTA.BAJ, suly: 100, zar: 200, zarMax: 1200 },
  /* EPULET_ELVESZETT    */ { fajta: FAJTA.BAJ, suly: 98, zar: 60, zarMax: 300 },
  /* VEDTELEN            */ { fajta: FAJTA.BAJ, suly: 92, zar: 1200, zarMax: 3600 },
  /* EGYSEG_ELESETT      */ { fajta: FAJTA.BAJ, suly: 88, zar: 300, zarMax: 1800 },
  /* ELLENSEG_FELDERITVE */ { fajta: FAJTA.FIGYELEM, suly: 84, zar: 1200, zarMax: 3600 },
  /* NEP_KORLAT          */ { fajta: FAJTA.FIGYELEM, suly: 78, zar: 600, zarMax: 2400 },
  /* NYERS_HIANY         */ { fajta: FAJTA.FIGYELEM, suly: 74, zar: 600, zarMax: 2400 },
  /* TETLEN_PARASZT      */ { fajta: FAJTA.FIGYELEM, suly: 70, zar: 400, zarMax: 3600 },
  /* URES_KEPZO          */ { fajta: FAJTA.FIGYELEM, suly: 66, zar: 1200, zarMax: 4800 },
  /* NINCS_KEPZO         */ { fajta: FAJTA.FIGYELEM, suly: 62, zar: 2400, zarMax: 7200 },
  /* PAZARLAS            */ { fajta: FAJTA.FIGYELEM, suly: 58, zar: 1200, zarMax: 4800 },
  /* KORSZAK_KESZ        */ { fajta: FAJTA.INFO, suly: 54, zar: 40, zarMax: 40 },
  /* KORSZAK_INDULT      */ { fajta: FAJTA.INFO, suly: 50, zar: 40, zarMax: 40 },
  /* KUTATAS_KESZ        */ { fajta: FAJTA.INFO, suly: 46, zar: 40, zarMax: 40 },
  /* EPULET_KESZ         */ { fajta: FAJTA.INFO, suly: 42, zar: 40, zarMax: 40 },
];

/** A kiértékelés SORRENDJE — súly szerint csökkenő. A keret így a bajra megy el. */
const SORREND = (() => {
  const ix = [];
  for (let i = 0; i < SZABALY_DB; i++) ix.push(i);
  ix.sort((a, b) => TABLA[b].suly - TABLA[a].suly || a - b);
  return ix;
})();

/**
 * MIT KÉPEZ AZ ÉPÜLET — a TELEPESEK-mondathoz („a laktanya … kard nélkül állt").
 *
 * ⚠️ SAJÁT, HELYI TÁBLA, ÉS EZ SZÁNDÉKOS. A `sim/kepzes.js` `KEPEZ` táblája
 * `TIPUS` kódokat ad, egységNEVEK viszont a v0.16-ban sehol nincsenek a
 * projektben. A megjelenítendő névre itt van szükség, és a v0.16-ot sok agent
 * írja párhuzamosan — egy közös név-fájlba írás pont az a torlódás, amit a
 * panel-szerződés kizár. Ha később lesz központi `TIPUS_NEV`, ez a tábla egy
 * importra cserélhető; addig az `ures_kepzo` szonda-vizsgálata őrzi, hogy
 * minden képző épülethez tartozik név.
 */
const KEPZO_MIT = [];
KEPZO_MIT[EPULET.KOZPONT] = 'paraszt';
KEPZO_MIT[EPULET.LAKTANYA] = 'landzsás';
KEPZO_MIT[EPULET.IJASZDA] = 'íjász';
KEPZO_MIT[EPULET.ISTALLO] = 'lovag';
KEPZO_MIT[EPULET.OSTROMMUHELY] = 'ostromgép';

/** Katonai képző épületek — a `nincs_kepzo` ezt a négyet hiányolja. */
const HADI_KEPZO = [EPULET.LAKTANYA, EPULET.IJASZDA, EPULET.ISTALLO, EPULET.OSTROMMUHELY];

/**
 * MIRE ELÉG a felgyűlt nyersanyag — a `pazarlas` mondat konkrétuma.
 * Nyersanyagonként egy „ennyibe kerül" viszonyítás, hogy a szám JELENTSEN is
 * valamit: „420 fa" önmagában nem mond semmit, „14 ház ára" igen.
 */
const VISZONY = [
  { ar: 50, nev: 'paraszt' },                       // ÉTEL
  { ar: EP_AR[EPULET.HAZ][NYERS.FA], nev: 'ház' },  // FA (30)
  { ar: EP_AR[EPULET.TORONY][NYERS.KO], nev: 'torony' }, // KŐ (125)
  { ar: 40, nev: 'lovag' },                         // KRISTÁLY
];

// ── KÜSZÖBÖK ───────────────────────────────────────────────────────────────
/** Ennyi tickenként fut a kiértékelés. 20 = másodpercenként egyszer. */
const ERTEKELES_KOZ = 20;
/** Ennyi tick tétlenség után szólunk a parasztról (10 mp). */
const TETLEN_KUSZOB = 200;
/** Ennyi alatt „kifogyóban" egy nyersanyag. */
const HIANY_KUSZOB = 20;
/** Ennyi tick óta nem érkezett belőle semmi → tényleg elakadt (30 mp). */
const HIANY_CSEND = 600;
/** Ennyi fölött „halmozódik" a másik nyersanyag. */
const BOSEG = 200;
/** Ennyi fölött már pazarlás, ha még nő is. */
const PAZARLAS_KUSZOB = 400;
/** Ennyi minta (= másodperc) kell, mielőtt részarányt merünk állítani. */
const URES_MIN_MINTA = 40;
/** Ekkora részarány fölött szólunk az üres képzőről. */
const URES_SZAZALEK = 70;
/**
 * Ennyi minta után FELEZZÜK a részarány-számlálókat.
 *
 * ⚠️ MIÉRT NEM ÉLETTARTAM-ÁTLAG. Az elsőre kézenfekvő megoldás — „a lerakás óta
 * eltelt idő hány százalékában volt üres" — húsz perc után menthetetlen: a
 * játékos rendbe teszi a laktanyát, az mégis „az idő 90 %-ában üresen állt"
 * marad, mert a régi mérés túlsúlyban van. A felezés csúszó ablakot csinál
 * belőle (hatásos hossza kb. 1,44 × ennyi), tehát a mondat arról szól, ami
 * MOST igaz — és a játékos látja, hogy amit tett, az számított.
 */
const URES_FELEZES = 150;
/** Ennyi tick után hiányoljuk a katonai képzőt (2 perc). */
const NINCS_KEPZO_TICK = 2400;
/** Ennyi tick előtt nem beszélünk védtelenségről (1 perc). */
const VEDTELEN_TICK = 1200;
/** Az üzenet-gyűrű hossza. Ennél régebbi üzenet már nem kérdezhető le. */
const TAR_MERET = 64;

/**
 * HATÁROZOTT NÉVELŐ a szó elejéből.
 *
 * ⚠️ NEM SZÉPÉSZET. Az első változat `'a(z) ' + nev + 'ad'` alakkal dolgozott,
 * és „a(z) laktanyaad" meg „a(z) íjászdaad" lett belőle — a magyar toldalék nem
 * ragasztható konstans stringgel. A mondatok azóta KERÜLIK a birtokos toldalékot
 * a tábla-nevek után, a névelőt pedig ez a két függvény adja helyesen. A szonda
 * 3. vizsgálata tiltja a `(z)` alakot, hogy ez ne csússzon vissza.
 */
const MAGANHANGZO = 'aáeéiíoóöőuúüű';
function nevelovel(szo) {
  return (MAGANHANGZO.indexOf(szo[0]) >= 0 ? 'az ' : 'a ') + szo;
}
function Nevelovel(szo) {
  return (MAGANHANGZO.indexOf(szo[0]) >= 0 ? 'Az ' : 'A ') + szo;
}

/** Másodperc egy tick-különbségből, egészben. */
function mp(tick) { return (tick / TICK_HZ) | 0; }

/** „42 másodperce" / „3 perce" — a hosszú számok olvashatatlanok másodpercben. */
function ota(tick) {
  const s = mp(tick);
  if (s < 90) return s + ' másodperce';
  return ((s / 60) | 0) + ' perce';
}

export class UzenetSzabalyok {
  /**
   * @param {import('../sim/sim.js').Sim} sim
   * @param {{sajatCsapat?:number, ertekelesKoz?:number, egyszerreMax?:number}} [opciok]
   */
  constructor(sim, opciok = {}) {
    this.sim = sim;
    this.csapat = opciok.sajatCsapat ?? 0;
    this.ellenfel = this.csapat === 0 ? 1 : 0;
    this.ertekelesKoz = opciok.ertekelesKoz ?? ERTEKELES_KOZ;
    /** Egy kiértékelésből ennyi üzenet mehet ki. Lásd a fejléc 3. fékjét. */
    this.egyszerreMax = opciok.egyszerreMax ?? 2;

    const maxE = sim.egysegek.maxDb ?? sim.egysegek.px.length;
    const maxEp = sim.epuletek.maxDb;

    // ── ÜZENET-GYŰRŰ (előre lefoglalva) ──────────────────────────────────
    this._tar = new Array(TAR_MERET);
    for (let i = 0; i < TAR_MERET; i++) {
      this._tar[i] = {
        sorszam: -1, szabaly: -1, szabalyNev: '', fajta: FAJTA.INFO,
        szoveg: '', x: -1, y: -1, ugorhato: false, tick: -1, kulcs: -1,
      };
    }
    /** Hány üzenet született összesen. A fogyasztó ehhez tartja a kurzorát. */
    this.kiadott = 0;

    // ── IDŐZÁR ───────────────────────────────────────────────────────────
    // Szám-kulcs → utolsó megszólalás tickje / aktuális zárhossz. `Map`, mert
    // a kulcstér ritka (épület-indexek, technológiák), tömbnek pazarlás lenne.
    this._zarTick = new Map();
    this._zarHossz = new Map();

    // ── STATISZTIKA (a szondáé) ──────────────────────────────────────────
    /** Hány kiértékelésben ÁLLT FENN a feltétel (zár nélkül ennyiszer szólna). */
    this.feltetel = new Int32Array(SZABALY_DB);
    /** Hányszor jutott ki tényleg üzenet. */
    this.sult = new Int32Array(SZABALY_DB);
    /** Hányszor nyomta el az időzár vagy a keret. */
    this.elnyomott = new Int32Array(SZABALY_DB);
    /** Hány kiértékelés futott le. */
    this.ertekelesek = 0;

    // ── ÁLLAPOT-PILLANATKÉPEK ────────────────────────────────────────────
    this._tetlenOta = new Int32Array(maxE).fill(-1);
    this._tetlenGen = new Int32Array(maxE).fill(-1);
    this._epHp = new Int32Array(maxEp);
    this._epElo = new Uint8Array(maxEp);
    this._epKesz = new Uint8Array(maxEp);
    this._epUres = new Int32Array(maxEp);
    this._epMinta = new Int32Array(maxEp);
    this._techAllapot = new Uint8Array(TECH_DB);
    this._keszletElozo = new Int32Array(4);
    this._gyujtottElozo = new Int32Array(4);
    this._bevetelOta = new Int32Array(4);
    this._korszak = 0;
    this._korszakHatra = 0;
    this._halottak = 0;
    this._osszSebzes = 0;
    this._ellensegLatszik = false;
    this._utolsoErtekeles = -1e9;
    this._utolsoTick = 0;
    this._felezesSzamlalo = 0;
    /** Az első kiértékelés csak PILLANATKÉPET vesz — lásd `_ertekel()`. */
    this._elsoKesz = false;

    // Munka-terület, hogy a kiértékelés ne allokáljon. Mindkettőt minden
    // kiértékelés elején nullázzuk.
    this._m = {
      munkas: 0, tetlen: 0, tetlenLeghosszabb: 0, tetlenX: -1, tetlenY: -1,
      katona: 0, harcol: 0, harcX: -1, harcY: -1,
      ellensegLat: 0, ellensegX: -1, ellensegY: -1,
      kozpontX: -1, kozpontY: -1,
      hadiKepzo: 0, vesztettDb: 0, vesztettTipus: -1, vesztettX: -1, vesztettY: -1,
      sebzettEp: -1, keszEp: -1,
    };
  }

  // ── FOGYASZTÓI FELÜLET ──────────────────────────────────────────────────

  /**
   * A `sorszam`-adik üzenet, vagy `null`, ha már kiesett a gyűrűből.
   * @param {number} sorszam 0-tól, a réteg indulása óta folyamatosan
   */
  uzenet(sorszam) {
    if (sorszam < 0 || sorszam >= this.kiadott) return null;
    if (sorszam < this.kiadott - TAR_MERET) return null;
    return this._tar[sorszam % TAR_MERET];
  }

  /** A legutóbbi üzenet, vagy `null`. */
  utolso() { return this.kiadott > 0 ? this.uzenet(this.kiadott - 1) : null; }

  /** Egy szabály statisztikája — a szonda ezt írja ki. */
  statisztika(szabaly) {
    return {
      nev: SZABALY_NEV[szabaly],
      feltetel: this.feltetel[szabaly],
      sult: this.sult[szabaly],
      elnyomott: this.elnyomott[szabaly],
      fajta: TABLA[szabaly].fajta,
    };
  }

  /**
   * KÉPKOCKA. Az első sor a lényeg: ha nem telt le a kiértékelési köz, ez a
   * hívás semmit nem csinál és semmit nem foglal.
   * @param {number} tick `sim.tick`
   * @returns {number} hány ÚJ üzenet született ebben a hívásban
   */
  frissit(tick) {
    // Visszafelé ugró tick = új meccs vagy betöltés. A pillanatképek elavultak,
    // és nélküle az első kiértékelés minden épületet „elveszettnek" látna.
    if (tick < this._utolsoTick) this.nullaz();
    this._utolsoTick = tick;
    if (tick - this._utolsoErtekeles < this.ertekelesKoz) return 0;
    this._utolsoErtekeles = tick;
    const elotte = this.kiadott;
    this._ertekel(tick);
    return this.kiadott - elotte;
  }

  /** Minden mérés és pillanatkép eldobása (új meccs). Az üzenet-gyűrű marad. */
  nullaz() {
    this._tetlenOta.fill(-1);
    this._tetlenGen.fill(-1);
    this._epHp.fill(0); this._epElo.fill(0); this._epKesz.fill(0);
    this._epUres.fill(0); this._epMinta.fill(0);
    this._techAllapot.fill(0);
    this._keszletElozo.fill(0); this._gyujtottElozo.fill(0); this._bevetelOta.fill(0);
    this._zarTick.clear(); this._zarHossz.clear();
    this._korszak = 0; this._korszakHatra = 0;
    this._halottak = 0; this._osszSebzes = 0;
    this._ellensegLatszik = false;
    this._utolsoErtekeles = -1e9;
    this._felezesSzamlalo = 0;
    this._elsoKesz = false;
  }

  // ── ELNYOMÁS ────────────────────────────────────────────────────────────

  /** Szám-kulcs: szabály + alkulcs. Nincs string, tehát nincs allokáció. */
  _kulcs(szabaly, alkulcs) { return szabaly * 65536 + (alkulcs | 0); }

  /**
   * SZABAD-E MEGSZÓLALNI? A szöveg ELŐTT kell hívni — az elnyomott szabály így
   * egyetlen stringet sem gyárt.
   *
   * Mellékhatása van: számolja a feltétel fennállását és az elnyomást. Ezért
   * pontosan egyszer szabad hívni szabályonként és kiértékelésenként, akkor,
   * amikor a feltétel MÁR IGAZ.
   */
  _kerhet(szabaly, alkulcs, tick) {
    this.feltetel[szabaly]++;
    if (this._keret <= 0) { this.elnyomott[szabaly]++; return false; }
    const k = this._kulcs(szabaly, alkulcs);
    const utolso = this._zarTick.get(k);
    if (utolso !== undefined) {
      const hossz = this._zarHossz.get(k);
      if (tick - utolso < hossz) { this.elnyomott[szabaly]++; return false; }
    }
    return true;
  }

  /**
   * MEGSZÓLALÁS. Csak `_kerhet()` igaza után hívható.
   *
   * A zár itt lép: ha a baj FOLYAMATOS (a legutóbbi megszólalás óta kevesebb
   * mint két zárhossz telt el), a zár duplázódik a plafonig; ha közben elmúlt
   * és visszatért, visszaáll az alapra.
   */
  _szol(szabaly, alkulcs, szoveg, tick, x = -1, y = -1) {
    const t = TABLA[szabaly];
    const k = this._kulcs(szabaly, alkulcs);
    const utolso = this._zarTick.get(k);
    const regi = this._zarHossz.get(k);
    let hossz = t.zar;
    if (utolso !== undefined && regi !== undefined && tick - utolso < regi * 2) {
      hossz = regi * 2;
      if (hossz > t.zarMax) hossz = t.zarMax;
    }
    this._zarTick.set(k, tick);
    this._zarHossz.set(k, hossz);

    const u = this._tar[this.kiadott % TAR_MERET];
    u.sorszam = this.kiadott;
    u.szabaly = szabaly;
    u.szabalyNev = SZABALY_NEV[szabaly];
    u.fajta = t.fajta;
    u.szoveg = szoveg;
    u.x = x; u.y = y;
    u.ugorhato = x >= 0 && y >= 0;
    u.tick = tick;
    // ⚠️ AZ IDŐZÁR KULCSA IS KIMEGY AZ ÜZENETTEL. Enélkül a szonda csak a
    // helykoordinátából tudná kulcsot képezni — és két KÜLÖNBÖZŐ nyersanyag
    // panasza, ami mindkettő a központra mutat, hamis zársértésnek látszana.
    // A panel is ebből tudja, melyik sor melyiket VÁLTJA FEL a listájában.
    u.kulcs = k;
    this.kiadott++;
    this.sult[szabaly]++;
    this._keret--;
  }

  // ── A KIÉRTÉKELÉS ───────────────────────────────────────────────────────

  _ertekel(tick) {
    this.ertekelesek++;
    this._keret = this.egyszerreMax;
    this._egysegPasz(tick);
    this._epuletPasz(tick);

    // ⚠️ AZ ELSŐ KIÉRTÉKELÉS NÉMA, ÉS EZ NEM LUSTASÁG. A pillanatképek ekkor
    // még nullák: minden meglévő épület „most készült el", minden technológia
    // „most lett kész", és a kezdő központ elvesztésének látszana bármi. A
    // különbség-alapú szabályoknak KELL egy alapállás — ez az.
    if (!this._elsoKesz) {
      this._pillanatkep(tick);
      this._elsoKesz = true;
      return;
    }

    for (let s = 0; s < SORREND.length; s++) {
      switch (SORREND[s]) {
        case SZABALY.TAMADAS: this._rTamadas(tick); break;
        case SZABALY.EPULET_ELVESZETT: this._rEpuletElveszett(tick); break;
        case SZABALY.VEDTELEN: this._rVedtelen(tick); break;
        case SZABALY.EGYSEG_ELESETT: this._rEgysegElesett(tick); break;
        case SZABALY.ELLENSEG_FELDERITVE: this._rEllenseg(tick); break;
        case SZABALY.NEP_KORLAT: this._rNepKorlat(tick); break;
        case SZABALY.NYERS_HIANY: this._rNyersHiany(tick); break;
        case SZABALY.TETLEN_PARASZT: this._rTetlenParaszt(tick); break;
        case SZABALY.URES_KEPZO: this._rUresKepzo(tick); break;
        case SZABALY.NINCS_KEPZO: this._rNincsKepzo(tick); break;
        case SZABALY.PAZARLAS: this._rPazarlas(tick); break;
        case SZABALY.KORSZAK_KESZ: this._rKorszakKesz(tick); break;
        case SZABALY.KORSZAK_INDULT: this._rKorszakIndult(tick); break;
        case SZABALY.KUTATAS_KESZ: this._rKutatasKesz(tick); break;
        case SZABALY.EPULET_KESZ: this._rEpuletKesz(tick); break;
        default: break;
      }
    }
    this._pillanatkep(tick);
  }

  /** A különbség-alapú szabályok alapállása a KÖVETKEZŐ kiértékeléshez. */
  _pillanatkep(tick) {
    const s = this.sim;
    const cs = this.csapat;
    const g = s.gazdasag;
    for (let f = 0; f < 4; f++) {
      const gy = g.osszegyujtott[cs * 4 + f];
      if (gy > this._gyujtottElozo[f]) this._bevetelOta[f] = tick;
      this._gyujtottElozo[f] = gy;
      this._keszletElozo[f] = g.keszlet[cs * 4 + f];
    }
    for (let t = 0; t < TECH_DB; t++) {
      this._techAllapot[t] = s.technologia.allapot[cs * TECH_DB + t];
    }
    this._korszak = g.korszak[cs];
    this._korszakHatra = g.korszakHatra[cs];
    this._halottak = s.harc.halottak[cs];
    this._osszSebzes = s.harc.osszSebzes[this.ellenfel];
    this._ellensegLatszik = this._m.ellensegLat > 0;
    const ep = s.epuletek;
    for (let i = 0; i < ep.db; i++) {
      this._epHp[i] = ep.hp[i];
      this._epElo[i] = ep.elo[i];
      this._epKesz[i] = ep.kesz(i) ? 1 : 0;
    }
  }

  /**
   * EGY végigjárás az egységeken, kiértékelésenként egyszer. Innen jön a
   * paraszt-szám, a tétlenség-óra, a katonai létszám, a harc helye és az
   * ellenség láthatósága — öt szabály egyetlen ciklusból.
   */
  _egysegPasz(tick) {
    const s = this.sim;
    const e = s.egysegek;
    const h = s.harc;
    const mk = s.munkasok;
    const kod = s.kod;
    const cs = this.csapat;
    const m = this._m;
    m.munkas = 0; m.tetlen = 0; m.tetlenLeghosszabb = 0; m.tetlenX = -1; m.tetlenY = -1;
    m.katona = 0; m.harcol = 0; m.harcX = -1; m.harcY = -1;
    m.ellensegLat = 0; m.ellensegX = -1; m.ellensegY = -1;

    for (let i = 0; i < e.db; i++) {
      if (h.elo[i] === 0) continue;
      if (e.csapat[i] !== cs) {
        // ELLENSÉG: csak az számít, amit MOST is látunk. A `latottPont` a
        // felderített múltat adná — abból „ellenséget látsz" üzenet lenne egy
        // rég elhagyott dombról is.
        if (kod.lathatoPont(cs, e.px[i], e.py[i])) {
          if (m.ellensegLat === 0) { m.ellensegX = e.px[i]; m.ellensegY = e.py[i]; }
          m.ellensegLat++;
        }
        continue;
      }
      if (e.allapot[i] === ALLAPOT.HARCOL) {
        if (m.harcol === 0) { m.harcX = e.px[i]; m.harcY = e.py[i]; }
        m.harcol++;
      }
      if (e.tipus[i] !== TIPUS.MUNKAS) { m.katona++; continue; }
      m.munkas++;
      // ⚠️ GENERÁCIÓ-ŐR. A slotok újrahasznosulnak (`units.js` → `felszabadit`),
      // tehát a 12-es index holnap már egy MÁSIK paraszt. Enélkül egy frissen
      // kiképzett paraszt az elődje tétlenség-óráját örökölné, és a réteg
      // „négy perce tétlen" mondattal fogadná a születése pillanatában.
      const gen = e.generacio[i];
      const tetlen = mk.allapot[i] === MUNKA.NINCS;
      if (!tetlen) {
        this._tetlenOta[i] = -1;
      } else if (this._tetlenGen[i] !== gen || this._tetlenOta[i] < 0) {
        this._tetlenOta[i] = tick;
      }
      this._tetlenGen[i] = gen;
      if (!tetlen) continue;
      m.tetlen++;
      const mennyi = tick - this._tetlenOta[i];
      if (mennyi > m.tetlenLeghosszabb) {
        m.tetlenLeghosszabb = mennyi;
        m.tetlenX = e.px[i]; m.tetlenY = e.py[i];
      }
    }
  }

  /**
   * EGY végigjárás az épületeken: részarány-mérés, sebzés-figyelés, elkészülés,
   * pusztulás, központ-hely — hat szabály egyetlen ciklusból.
   */
  _epuletPasz(tick) {
    const ep = this.sim.epuletek;
    const kp = this.sim.kepzes;
    const cs = this.csapat;
    const m = this._m;
    m.kozpontX = -1; m.kozpontY = -1;
    m.hadiKepzo = 0;
    m.vesztettDb = 0; m.vesztettTipus = -1; m.vesztettX = -1; m.vesztettY = -1;
    m.sebzettEp = -1; m.keszEp = -1;

    // Felezés: a részarány csúszó ablak, nem élettartam-átlag (lásd a konstans
    // indoklását). Egyetlen összegzésen dolgozunk, nem minta-gyűrűn.
    let felez = false;
    if (++this._felezesSzamlalo >= URES_FELEZES) { this._felezesSzamlalo = 0; felez = true; }

    for (let i = 0; i < ep.db; i++) {
      if (ep.csapat[i] !== cs) continue;

      if (this._epElo[i] === 1 && ep.elo[i] === 0) {
        m.vesztettDb++;
        // A LEGÉRTÉKESEBBET nevezzük meg: a kisebb típuskód a fontosabb épület
        // (központ = 0). Egy rohamban öt épület is elveszhet egy kiértékelés
        // alatt; a mondatnak a központról kell szólnia, nem a falról.
        if (m.vesztettTipus < 0 || ep.tipus[i] < m.vesztettTipus) {
          m.vesztettTipus = ep.tipus[i];
          m.vesztettX = ep.x[i]; m.vesztettY = ep.y[i];
        }
      }
      if (ep.elo[i] === 0) continue;

      if (ep.hp[i] < this._epHp[i] && m.sebzettEp < 0) m.sebzettEp = i;
      if (this._epKesz[i] === 0 && ep.kesz(i)) m.keszEp = i;
      if (ep.tipus[i] === EPULET.KOZPONT && m.kozpontX < 0) {
        m.kozpontX = ep.x[i]; m.kozpontY = ep.y[i];
      }
      if (!ep.kesz(i)) continue;
      for (let k = 0; k < HADI_KEPZO.length; k++) {
        if (ep.tipus[i] === HADI_KEPZO[k]) { m.hadiKepzo++; break; }
      }
      if (KEPZO_MIT[ep.tipus[i]] === undefined) continue;
      if (felez) { this._epUres[i] >>= 1; this._epMinta[i] >>= 1; }
      this._epMinta[i]++;
      if (kp.sorDb[i] === 0) this._epUres[i]++;
    }
  }

  // ── A SZABÁLYOK ─────────────────────────────────────────────────────────

  _rTamadas(tick) {
    const h = this.sim.harc;
    const seb = h.osszSebzes[this.ellenfel];
    if (seb <= this._osszSebzes) return;
    const m = this._m;
    const ep = this.sim.epuletek;
    if (m.sebzettEp >= 0) {
      const i = m.sebzettEp;
      if (!this._kerhet(SZABALY.TAMADAS, i + 1, tick)) return;
      const szaz = ep.maxHp[i] > 0 ? ((ep.hp[i] * 100) / ep.maxHp[i]) | 0 : 0;
      this._szol(SZABALY.TAMADAS, i + 1,
        'Támadás alatt egy épületed — ' + EPULET_NEV[ep.tipus[i]] + ' a ('
        + (ep.x[i] | 0) + ', ' + (ep.y[i] | 0) + ') pontnál, csak '
        + szaz + ' % életerő van hátra.',
        tick, ep.x[i], ep.y[i]);
      return;
    }
    if (!this._kerhet(SZABALY.TAMADAS, 0, tick)) return;
    const kar = seb - this._osszSebzes;
    if (m.harcol > 0) {
      this._szol(SZABALY.TAMADAS, 0,
        'Harc folyik a birodalmadban a (' + (m.harcX | 0) + ', ' + (m.harcY | 0)
        + ') pontnál — ' + m.harcol + ' egységed vív, ' + kar
        + ' sebzést kaptál az elmúlt másodpercben.',
        tick, m.harcX, m.harcY);
    } else {
      this._szol(SZABALY.TAMADAS, 0,
        'Támadás ér: ' + kar + ' sebzést kaptál, és egyetlen egységed sem '
        + 'harcol vissza.',
        tick, m.kozpontX, m.kozpontY);
    }
  }

  _rEpuletElveszett(tick) {
    const m = this._m;
    if (m.vesztettDb === 0) return;
    if (!this._kerhet(SZABALY.EPULET_ELVESZETT, 0, tick)) return;
    const nev = EPULET_NEV[m.vesztettTipus];
    const hely = ' (' + (m.vesztettX | 0) + ', ' + (m.vesztettY | 0) + ')';
    this._szol(SZABALY.EPULET_ELVESZETT, 0,
      m.vesztettDb === 1
        ? 'Elveszett egy épületed: ' + nev + hely + '.'
        : m.vesztettDb + ' épületed pusztult el, köztük ez: ' + nev + hely + '.',
      tick, m.vesztettX, m.vesztettY);
  }

  /**
   * TÚLERŐ. ⚠️ AZ ELSŐ VÁLTOZAT „nulla katonád van"-t nézett, és a szonda
   * kimutatta, hogy 12 000 ticken át EGYSZER SEM állt fenn: a felállás minden
   * csapatnak ad katonát, és azok nem halnak meg maguktól. Halott szabály volt,
   * tökéletesen zölden. A használható kérdés nem az, hogy van-e katonád, hanem
   * hogy ELÉG-E ANNYI, amennyit az ellenség MUTAT — ez az a mondat, amit egy
   * RTS-ben tényleg tenni kell valamit utána.
   */
  _rVedtelen(tick) {
    if (tick < VEDTELEN_TICK) return;
    const m = this._m;
    // Csak akkor van tétje, ha VAN kitől félni. Enélkül ez a mondat a meccs
    // első percétől szólna, amikor a gyenge hadsereg még szabályos nyitás.
    if (m.ellensegLat === 0) return;
    if (m.ellensegLat <= m.katona) return;
    if (!this._kerhet(SZABALY.VEDTELEN, 0, tick)) return;
    this._szol(SZABALY.VEDTELEN, 0,
      m.ellensegLat + ' ellenséges egység van látótávolban, neked ' + m.katona
      + ' katonád van — a ' + m.munkas + ' parasztod nem fogja megvédeni a bázist.',
      tick, m.ellensegX, m.ellensegY);
  }

  _rEgysegElesett(tick) {
    const most = this.sim.harc.halottak[this.csapat];
    const uj = most - this._halottak;
    if (uj <= 0) return;
    if (!this._kerhet(SZABALY.EGYSEG_ELESETT, 0, tick)) return;
    this._szol(SZABALY.EGYSEG_ELESETT, 0,
      uj + ' egységed esett el (a meccs eleje óta összesen ' + most + ').',
      tick, this._m.harcX, this._m.harcY);
  }

  _rEllenseg(tick) {
    const m = this._m;
    if (m.ellensegLat === 0) return;
    // Csak a MEGJELENÉS hír, a folyamatos látvány nem: enélkül egy patthelyzet
    // két serege percenként újra „felderítené" egymást.
    if (this._ellensegLatszik) return;
    if (!this._kerhet(SZABALY.ELLENSEG_FELDERITVE, 0, tick)) return;
    this._szol(SZABALY.ELLENSEG_FELDERITVE, 0,
      'Ellenséget látsz: ' + m.ellensegLat + ' ellenséges egység a ('
      + (m.ellensegX | 0) + ', ' + (m.ellensegY | 0) + ') pontnál.',
      tick, m.ellensegX, m.ellensegY);
  }

  _rNepKorlat(tick) {
    const nep = this.sim.gazdasag.nepessegAllapot(this.csapat, this.sim);
    const m = this._m;
    if (nep.max <= 0) {
      if (!this._kerhet(SZABALY.NEP_KORLAT, 2, tick)) return;
      this._szol(SZABALY.NEP_KORLAT, 2,
        'A népesség-korlátod 0 — nincs se központod, se házad, tehát '
        + 'egyetlen egységet sem tudsz kiképezni. ' + m.munkas
        + ' parasztod és ' + m.katona + ' katonád maradt.',
        tick, m.kozpontX, m.kozpontY);
      return;
    }
    if (nep.foglalt >= nep.max) {
      if (!this._kerhet(SZABALY.NEP_KORLAT, 0, tick)) return;
      this._szol(SZABALY.NEP_KORLAT, 0,
        'Tele a népesség: ' + nep.foglalt + ' / ' + nep.max
        + ' — amíg nem építesz házat, egyetlen új egység sem születik meg.',
        tick, m.kozpontX, m.kozpontY);
      return;
    }
    if (nep.max - nep.foglalt <= 2) {
      if (!this._kerhet(SZABALY.NEP_KORLAT, 1, tick)) return;
      this._szol(SZABALY.NEP_KORLAT, 1,
        'A népesség majdnem tele: ' + nep.foglalt + ' / ' + nep.max
        + ' — még ' + (nep.max - nep.foglalt) + ' hely maradt, ideje házat építeni.',
        tick, m.kozpontX, m.kozpontY);
    }
  }

  _rNyersHiany(tick) {
    const g = this.sim.gazdasag;
    const o = this.csapat * 4;
    for (let f = 0; f < 4; f++) {
      if (g.keszlet[o + f] > HIANY_KUSZOB) continue;
      if (tick - this._bevetelOta[f] < HIANY_CSEND) continue;
      // „…miközben másikból halmozódik": a bőség adja a mondat élét. Enélkül a
      // meccs elején minden nyersanyag „hiányzik", és a réteg hazudik.
      let boseg = -1;
      for (let k = 0; k < 4; k++) {
        if (k === f) continue;
        if (g.keszlet[o + k] >= BOSEG && (boseg < 0 || g.keszlet[o + k] > g.keszlet[o + boseg])) {
          boseg = k;
        }
      }
      if (boseg < 0) continue;
      if (!this._kerhet(SZABALY.NYERS_HIANY, f, tick)) continue;
      const cel = this._lelohelyHely(f);
      // ⚠️ KÉT KÜLÖN MONDAT, ÉS EZ NEM STÍLUS. Amiből SOHA nem gyűjtöttél, arra
      // a „30 másodperce nem érkezett" félrevezető: az egész meccs 30 másodperce
      // tart. A kristály az első tickben is nulla, és ha ugyanazt a mondatot
      // kapná, a réteg a saját küszöbét jelentené hírként.
      const sose = g.osszegyujtott[o + f] === 0;
      this._szol(SZABALY.NYERS_HIANY, f,
        'Elfogyott ' + nevelovel(NYERS_NEV[f]) + ' (' + g.keszlet[o + f] + '), és '
        + (sose ? 'a meccs kezdete óta egyszer sem gyűjtöttél belőle'
          : ota(tick - this._bevetelOta[f]) + ' nem is érkezett belőle')
        + ' — közben ' + g.keszlet[o + boseg] + ' ' + NYERS_NEV[boseg]
        + ' áll kihasználatlanul. A legközelebbi lelőhely a (' + (cel.x | 0)
        + ', ' + (cel.y | 0) + ') pontnál van, küldj rá parasztot.',
        tick, cel.x, cel.y);
    }
  }

  /**
   * A hiányzó nyersanyag LEGKÖZELEBBI lelőhelye a központtól — hogy a
   * kattintás ne csak panaszkodjon, hanem oda is vigye a kamerát.
   * Újrahasznált objektum: a kiértékelés nem allokál.
   */
  _lelohelyHely(fajta) {
    const ki = this._hely || (this._hely = { x: -1, y: -1 });
    ki.x = -1; ki.y = -1;
    const m = this._m;
    if (m.kozpontX < 0) return ki;
    const ef = this.sim.eroforrasok;
    const i = ef.keres(fajta, m.kozpontX, m.kozpontY, 60);
    if (i < 0) { ki.x = m.kozpontX; ki.y = m.kozpontY; return ki; }
    ki.x = ef.x[i]; ki.y = ef.y[i];
    return ki;
  }

  _rTetlenParaszt(tick) {
    const m = this._m;
    if (m.tetlen === 0 || m.tetlenLeghosszabb < TETLEN_KUSZOB) return;
    if (!this._kerhet(SZABALY.TETLEN_PARASZT, 0, tick)) return;
    this._szol(SZABALY.TETLEN_PARASZT, 0,
      m.tetlen + ' parasztod tétlenül áll a ' + m.munkas + '-ből — a leghosszabb '
      + ota(m.tetlenLeghosszabb) + '. Jobb gombbal küldd őket erdőre vagy bányára.',
      tick, m.tetlenX, m.tetlenY);
  }

  /** A TELEPESEK-mondat: „a laktanya az idő 84 %-ában landzsás nélkül állt." */
  _rUresKepzo(tick) {
    const ep = this.sim.epuletek;
    for (let i = 0; i < ep.db; i++) {
      if (ep.csapat[i] !== this.csapat || ep.elo[i] === 0) continue;
      const mit = KEPZO_MIT[ep.tipus[i]];
      if (mit === undefined) continue;
      const minta = this._epMinta[i];
      if (minta < URES_MIN_MINTA) continue;
      const szaz = ((this._epUres[i] * 100) / minta) | 0;
      if (szaz < URES_SZAZALEK) continue;
      if (!this._kerhet(SZABALY.URES_KEPZO, i + 1, tick)) continue;
      this._szol(SZABALY.URES_KEPZO, i + 1,
        Nevelovel(EPULET_NEV[ep.tipus[i]]) + ' az idő ' + szaz + ' %-ában '
        + mit + ' nélkül állt — üres épületből nem lesz birodalom.',
        tick, ep.x[i], ep.y[i]);
    }
  }

  _rNincsKepzo(tick) {
    if (tick < NINCS_KEPZO_TICK) return;
    const m = this._m;
    if (m.hadiKepzo > 0) return;
    if (!this._kerhet(SZABALY.NINCS_KEPZO, 0, tick)) return;
    this._szol(SZABALY.NINCS_KEPZO, 0,
      ota(tick) + ' játszol, és nincs egyetlen laktanyád, íjászdád vagy '
      + 'istállód sem — katona kizárólag ezekből jön.',
      tick, m.kozpontX, m.kozpontY);
  }

  _rPazarlas(tick) {
    const g = this.sim.gazdasag;
    const o = this.csapat * 4;
    for (let f = 0; f < 4; f++) {
      const most = g.keszlet[o + f];
      if (most < PAZARLAS_KUSZOB) continue;
      if (most < this._keszletElozo[f]) continue;   // költi — akkor nem pazarlás
      if (!this._kerhet(SZABALY.PAZARLAS, f, tick)) continue;
      const v = VISZONY[f];
      this._szol(SZABALY.PAZARLAS, f,
        most + ' ' + NYERS_NEV[f] + ' gyűlt fel és tovább nő — ennyiből '
        + ((most / v.ar) | 0) + ' ' + v.nev + ' kijönne. Költsd el.',
        tick, this._m.kozpontX, this._m.kozpontY);
    }
  }

  _rKorszakKesz(tick) {
    const k = this.sim.gazdasag.korszak[this.csapat];
    if (k <= this._korszak) return;
    if (!this._kerhet(SZABALY.KORSZAK_KESZ, k, tick)) return;
    this._szol(SZABALY.KORSZAK_KESZ, k,
      'Új korszakba léptél: ' + KORSZAK_NEV[k] + ' (' + (k + 1) + '. a négyből)'
      + ' — új épületek és kutatások nyíltak meg.',
      tick, this._m.kozpontX, this._m.kozpontY);
  }

  _rKorszakIndult(tick) {
    const h = this.sim.gazdasag.korszakHatra[this.csapat];
    if (h <= 0 || this._korszakHatra > 0) return;
    const k = this.sim.gazdasag.korszak[this.csapat];
    if (k >= KORSZAK.FENY) return;
    if (!this._kerhet(SZABALY.KORSZAK_INDULT, k, tick)) return;
    this._szol(SZABALY.KORSZAK_INDULT, k,
      'Megindult a korszakváltás: ' + KORSZAK_NEV[k + 1] + ' — ' + mp(h)
      + ' másodperc, és addig is költhetsz.',
      tick, this._m.kozpontX, this._m.kozpontY);
  }

  _rKutatasKesz(tick) {
    const te = this.sim.technologia;
    const o = this.csapat * TECH_DB;
    for (let t = 0; t < TECH_DB; t++) {
      if (te.allapot[o + t] !== KUTAT.KESZ || this._techAllapot[t] === KUTAT.KESZ) continue;
      if (!this._kerhet(SZABALY.KUTATAS_KESZ, t, tick)) continue;
      this._szol(SZABALY.KUTATAS_KESZ, t,
        'Kész a kutatás: ' + TECH_NEV[t] + ' — ' + TECH_LEIRAS[t] + '.',
        tick, this._m.kozpontX, this._m.kozpontY);
    }
  }

  _rEpuletKesz(tick) {
    const i = this._m.keszEp;
    if (i < 0) return;
    if (!this._kerhet(SZABALY.EPULET_KESZ, i + 1, tick)) return;
    const ep = this.sim.epuletek;
    this._szol(SZABALY.EPULET_KESZ, i + 1,
      'Elkészült ' + nevelovel(EPULET_NEV[ep.tipus[i]]) + ' a (' + (ep.x[i] | 0)
      + ', ' + (ep.y[i] | 0) + ') pontnál.',
      tick, ep.x[i], ep.y[i]);
  }
}
