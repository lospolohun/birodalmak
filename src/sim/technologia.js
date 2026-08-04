// AGE OF THE CRYSTALS — TECHNOLÓGIAFA (v0.5/4).
//
// ── MIÉRT KÜLÖN RÉTEG ─────────────────────────────────────────────────────
// A technológia MINDENHOVA beleszól: a sebzésbe, a páncélba, a gyűjtés
// ütemébe, a cipelt mennyiségbe, az épületek életerejébe. A kísértés az, hogy
// mindegyik réteg maga tárolja a saját bónuszait — és onnantól nincs egyetlen
// hely, ahol meg lehet nézni, mit tud egy csapat. Ez a fájl az a hely.
//
// A rétegek NEM ide írnak, hanem innen KÉRDEZNEK, és mindig ugyanabban a
// formában: `sebzesBonusz(csapat, támadástípus)`, `utemSzazalek(csapat)`. Egy
// új technológia így egyetlen táblázat-sor plusz egy kérdés-metódus, nem
// öt fájl átírása.
//
// ── MIÉRT ELŐRE SZÁMOLT A LEKÉRDEZÉS ──────────────────────────────────────
// A `sebzesBonusz` a HARC FORRÓ ÚTJÁN fut: 1600 egységnél tickenként több száz
// hívás. Ezért nem futásidőben járjuk be a technológia-listát, hanem a
// kutatás BEFEJEZÉSEKOR írjuk be az összesített bónuszt egy pici tömbbe. A
// lekérdezés így egyetlen tömb-olvasás — a v0.1 tick-költsége nem mozdul.
//
// ── DETERMINIZMUS ─────────────────────────────────────────────────────────
// Minden hatás EGÉSZ. A gyűjtés-gyorsítás sem szorzó lebegőponttal, hanem
// SZÁZALÉK egész osztással (`ütem * 125 / 100 | 0`) — ugyanaz a szám minden
// gépen. A visszaszámláló tick, nem másodperc.
//
// ⚠️ AMI A LEGKÖNNYEBBEN ELROMLIK: a technológia állapota A VILÁG ÁLLAPOTA.
// Ha kimarad az `allapotHash()`-ből, két gép ugyanazzal a hash-sel futhat
// szét — az egyiken már kész a kovácsolás, a másikon még nem, és a csata
// máshogy dől el. A hash-be TARTOZIK (lásd `sim.js`).

import { EPULET } from './epuletek.js';
import { TAMADAS } from './harc.js';

/** A technológiák. A sorrend a tömb-indexük — sosem cseréljük fel. */
export const TECH = {
  KOVACSOLAS: 0,
  ILLESZTETT_IJ: 1,
  PANCELOZAS: 2,
  EKEVAS: 3,
  TALICSKA: 4,
  FALAZAS: 5,
};
export const TECH_DB = 6;

export const TECH_NEV = [
  'kovácsolás', 'illesztett íj', 'páncélozás', 'ekevas', 'talicska', 'falazás',
];

/** Rövid, JÁTÉKOSNAK szóló leírás — a HUD ezt mutatja. */
export const TECH_LEIRAS = [
  'közelharci sebzés +1',
  'nyíl-sebzés +1',
  'minden egység páncélja +1',
  'gyűjtés üteme +25 %',
  'a munkás 5-tel többet cipel',
  'az EZUTÁN épült házak életereje +25 %',
];

/**
 * Ára: [étel, fa, kő, kristály].
 *
 * ── MIÉRT KRISTÁLYOS A KÉT KÉSEI TECHNOLÓGIA (v0.16 balansz) ──────────────
 * A kristály a v0.5 óta gyakorlatilag CSAK a korszakváltás pénze volt, és a gép
 * sosem váltott korszakot — vagyis a kristálynak NEM VOLT NYELŐJE. Mérve
 * (12 000 tick, nehéz vs nehéz): a csapatok raktárában 910–1000 kristály állt
 * érintetlenül, miközben az étel végig 0–65 között tengődött. Egy nyersanyag,
 * amit begyűjtünk és sosem költünk el, nem gazdasági döntés, hanem üres munka.
 *
 * A páncélozás és a falazás mostantól a két KRISTÁLYOS korszak jutalma (lásd a
 * `TECH_KORSZAK`-ot), tehát az áruk is oda tartozik. A többi tétel ára
 * változatlan: azok a korai kor technológiái, ott a kristály még nincs is.
 */
const TECH_AR = [
  [0, 100, 60, 0],      // kovácsolás
  [80, 100, 0, 0],      // illesztett íj
  [0, 80, 120, 60],     // páncélozás   — kristály kora
  [120, 60, 0, 0],      // ekevas
  [60, 120, 0, 0],      // talicska
  [0, 60, 180, 120],    // falazás      — fény kora
];

/** Kutatási idő tickben (20 Hz → 15–25 mp). */
const TECH_IDO = [400, 400, 500, 300, 300, 400];

/**
 * MELYIK ÉPÜLET kutatja. Nem kényelmi kérdés: ez köti a technológiát a build
 * orderhez. Kovácsolás laktanya nélkül nincs, tehát a gazdasági nyitás ára,
 * hogy a hadsereg később erősödik — ez az egész műfaj alapfeszültsége.
 */
const TECH_EPULET = [
  EPULET.LAKTANYA,
  EPULET.IJASZDA,
  EPULET.LAKTANYA,
  EPULET.KOZPONT,
  EPULET.KOZPONT,
  EPULET.TORONY,
];

/**
 * MELYIK KORSZAKTÓL kutatható. 0 = az elsőtől.
 *
 * ── MIÉRT NEM ÚJ TECHNOLÓGIÁK, HANEM ÚJRAOSZTÁS (v0.16 balansz) ───────────
 * A kérdés az volt, „mit adjon a kristály és a fény kora", mert azokhoz eddig
 * NULLA technológia tartozott — a fa ezt őszintén ki is írta. A kézenfekvő
 * válasz két új technológia lett volna. Nem az lett, és ennek MÉRT oka van:
 *
 *   1. A hat technológiából NÉGY az első korban nyílt meg, kettő a másodikban.
 *      Vagyis a fa a 2. korra teljesen kifutott, és onnantól a korszakváltás
 *      500 / 800+200 / 1000+400+800 nyersanyagért CSERÉBE SEMMIT nem adott.
 *      Nem az volt a baj, hogy kevés a technológia, hanem hogy mind elöl volt.
 *   2. A `TECH_DB` bővítése a sim-en KÍVÜLRE is átnyúlik: a
 *      `panel_technologia_adat.js` `HATAS_MONDAT` és `TECH_IDO_UI` táblái a
 *      technológia-számra vannak méretezve, és betöltéskor DOBNAK, ha nem
 *      stimmelnek. Egy hetedik sor a simben azonnal betölthetetlenné tenné a
 *      felületet. (Ha később mégis bővül a fa, EZ A KÉT TÁBLA a párja.)
 *
 * Az új osztás: minden kor nyit valamit, és a késeiek a DRÁGÁBBAT.
 *
 *   sötét   (0) — ekevas, kovácsolás   → gazdaság és az első fegyver
 *   hajnal  (1) — illesztett íj, talicska → a második gazdasági és íjász-lépcső
 *   kristály(2) — PÁNCÉLOZÁS           → minden találatból −1; ez a legerősebb
 *                                        egyetlen szám a kő-papír-ollóban,
 *                                        ezért ér meg 800 ételt és 200 kristályt
 *   fény    (3) — FALAZÁS              → a védekező zárókő, torony-kutatással
 *
 * ⚠️ A hatás-értékek SZÁNDÉKOSAN nem változtak (páncél +1, épület-HP +25 %):
 * a `TECH_LEIRAS` és a UI `HATAS_MONDAT`-ja szó szerint ezeket a számokat
 * mondja ki, és a felület a sim-en kívül van. Ami itt változott, az kizárólag
 * a KAPU és az ÁR — vagyis mikor és mennyiért juthatsz hozzá.
 */
const TECH_KORSZAK = [0, 1, 2, 0, 1, 3];

/** Állapotok. */
export const KUTAT = { NINCS: 0, FOLYIK: 1, KESZ: 2 };

export class Technologia {
  /**
   * @param {number} csapatDb
   * @param {import('./sim.js').Sim} sim
   */
  constructor(csapatDb, sim) {
    this.csapatDb = csapatDb | 0;
    this.sim = sim;
    const n = this.csapatDb * TECH_DB;
    /** `allapot[csapat * TECH_DB + tech]` — lásd `KUTAT`. */
    this.allapot = new Uint8Array(n);
    /** Hátralévő tick a folyamatban lévő kutatásból. */
    this.hatra = new Int32Array(n);
    /** Melyik épületben folyik — hogy az épület pusztulása megszakíthassa. */
    this.hol = new Int32Array(n).fill(-1);

    // ── ELŐRE SZÁMOLT BÓNUSZOK ──────────────────────────────────────────
    // Ezeket a `_beall()` írja, és a forró út CSAK olvassa.
    /** `sebzes[csapat * 4 + támadástípus]` — a TAMADAS négy fajtájára. */
    this.sebzes = new Int32Array(this.csapatDb * 4);
    this.pancel = new Int32Array(this.csapatDb);
    /** Gyűjtés-ütem SZÁZALÉKBAN (alap: 100). */
    this.utem = new Int32Array(this.csapatDb).fill(100);
    /** Cipelési kapacitás-többlet. */
    this.cipel = new Int32Array(this.csapatDb);
    /** Épület-életerő SZÁZALÉKBAN (alap: 100). */
    this.epuletHp = new Int32Array(this.csapatDb).fill(100);

    /** Statisztika a szondának: hány kutatás készült el, hányat utasítottunk el. */
    this.keszult = new Int32Array(this.csapatDb);
    this.elutasitva = new Int32Array(this.csapatDb);
  }

  /** Teljes visszaállítás — az újrafelállás hívja. */
  nullaz() {
    this.allapot.fill(KUTAT.NINCS);
    this.hatra.fill(0);
    this.hol.fill(-1);
    this.sebzes.fill(0);
    this.pancel.fill(0);
    this.utem.fill(100);
    this.cipel.fill(0);
    this.epuletHp.fill(100);
    this.keszult.fill(0);
    this.elutasitva.fill(0);
  }

  /** Kész-e ez a technológia? */
  kesz(csapat, tech) {
    return this.allapot[csapat * TECH_DB + tech] === KUTAT.KESZ;
  }

  /**
   * KUTATÁS INDÍTÁSA. Minden feltételt ITT ellenőrzünk, és az ár is itt megy le
   * — ugyanaz a szabály, mint a képzésnél: a sorbaállás pillanatában fizetsz,
   * különben a játékos ugyanazt a nyersanyagot többször is elköltené.
   *
   * @param {number} csapat @param {number} tech @param {number} epulet
   * @returns {boolean} elindult-e
   */
  indit(csapat, tech, epulet) {
    if (csapat < 0 || csapat >= this.csapatDb) return false;
    if (tech < 0 || tech >= TECH_DB) return false;
    const o = csapat * TECH_DB + tech;
    if (this.allapot[o] !== KUTAT.NINCS) { this.elutasitva[csapat]++; return false; }

    const ep = this.sim.epuletek;
    if (epulet < 0 || epulet >= ep.db || !ep.kesz(epulet)
      || ep.csapat[epulet] !== csapat || ep.tipus[epulet] !== TECH_EPULET[tech]) {
      this.elutasitva[csapat]++;
      return false;
    }
    if (this.sim.gazdasag.korszak[csapat] < TECH_KORSZAK[tech]) {
      this.elutasitva[csapat]++;
      return false;
    }
    if (!this.sim.gazdasag.levon(csapat, TECH_AR[tech])) {
      this.elutasitva[csapat]++;
      return false;
    }

    this.allapot[o] = KUTAT.FOLYIK;
    this.hatra[o] = TECH_IDO[tech];
    this.hol[o] = epulet;
    return true;
  }

  /**
   * Egy tick. Csak a FOLYAMATBAN lévő kutatásokat nézi, tehát a költsége a
   * csapatszám × technológiaszám felső korlátjával adott — 8 civnél is 48
   * elemű ciklus, ami tickenként elhanyagolható.
   */
  lep() {
    const ep = this.sim.epuletek;
    for (let cs = 0; cs < this.csapatDb; cs++) {
      for (let t = 0; t < TECH_DB; t++) {
        const o = cs * TECH_DB + t;
        if (this.allapot[o] !== KUTAT.FOLYIK) continue;
        // Az épület elpusztult a kutatás alatt? A munka elvész, a nyersanyag is.
        // Ez az ostrom jutalma: a kutató épület lerombolása VALAMIT ér.
        const hol = this.hol[o];
        if (hol < 0 || !ep.el(hol)) {
          this.allapot[o] = KUTAT.NINCS;
          this.hatra[o] = 0;
          this.hol[o] = -1;
          continue;
        }
        if (--this.hatra[o] > 0) continue;
        this.allapot[o] = KUTAT.KESZ;
        this.hol[o] = -1;
        this.keszult[cs]++;
        this._beall(cs, t);
      }
    }
  }

  /**
   * Egy elkészült technológia hatásának BEÍRÁSA az előre számolt tömbökbe.
   * Csak összeadunk — a technológiák nem vonhatók vissza, tehát nincs olyan
   * eset, amikor újra kellene számolni a nulláról.
   */
  _beall(cs, tech) {
    switch (tech) {
      case TECH.KOVACSOLAS:
        this.sebzes[cs * 4 + TAMADAS.VAGO]++;
        this.sebzes[cs * 4 + TAMADAS.SZURO]++;
        break;
      case TECH.ILLESZTETT_IJ:
        this.sebzes[cs * 4 + TAMADAS.NYIL]++;
        break;
      case TECH.PANCELOZAS: this.pancel[cs]++; break;
      case TECH.EKEVAS: this.utem[cs] += 25; break;
      case TECH.TALICSKA: this.cipel[cs] += 5; break;
      case TECH.FALAZAS: this.epuletHp[cs] += 25; break;
      default: break;
    }
  }

  /** Sebzés-többlet — a `Harc` forró útja hívja. */
  sebzesBonusz(csapat, tamadasTipus) {
    return this.sebzes[csapat * 4 + tamadasTipus];
  }

  /** Páncél-többlet — a `Harc` forró útja hívja. */
  pancelBonusz(csapat) { return this.pancel[csapat]; }

  /** Gyűjtés-ütem SZÁZALÉKBAN — a munkás-AI hívja. */
  utemSzazalek(csapat) { return this.utem[csapat]; }

  /** Cipelési kapacitás-többlet — a munkás-AI hívja. */
  cipelTobblet(csapat) { return this.cipel[csapat]; }

  /** Épület-életerő SZÁZALÉKBAN — a lerakás hívja. */
  epuletHpSzazalek(csapat) { return this.epuletHp[csapat]; }

  /** Olvasható pillanatkép a HUD-nak és a szondának. */
  osszesites(csapat) {
    let keszDb = 0, folyik = 0;
    for (let t = 0; t < TECH_DB; t++) {
      const a = this.allapot[csapat * TECH_DB + t];
      if (a === KUTAT.KESZ) keszDb++;
      else if (a === KUTAT.FOLYIK) folyik++;
    }
    return { kesz: keszDb, folyik, keszult: this.keszult[csapat] };
  }
}

/** Melyik épület kutatja — a UI-nak és a szondának. */
export function techEpulete(tech) { return TECH_EPULET[tech]; }
/** Melyik korszaktól — a UI-nak. */
export function techKorszaka(tech) { return TECH_KORSZAK[tech]; }
/** Ára — a UI-nak. */
export function techAra(tech) { return TECH_AR[tech]; }
