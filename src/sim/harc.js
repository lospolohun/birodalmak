// AGE OF THE CRYSTALS — HARCRENDSZER: életerő, páncéltípusok, ellensúlyok.
//
// ── MIÉRT MINDEN EGÉSZ SZÁMBAN ────────────────────────────────────────────
// Az életerő és a sebzés `Int32Array`. Ez ugyanaz a determinizmus-döntés, mint
// a gazdaságnál: a szorzós sebzés (2,2× a lándzsástól a lovagra) lebegőpontosan
// gépenként más maradékot hagyna, és egy egységnyi eltérés az életerőben azt
// dönti el, hogy egy katona TÚLÉL-e egy csapást. Onnan pedig már két különböző
// meccs fut a két gépen.
//
// A szorzókat SZÁZALÉKBAN tartjuk (egész), és a sebzés `(alap * szazalek) / 100`
// egész osztással. Nincs kerekítési szabadság, nincs motorfüggés.
//
// ── AZ ELLENSÚLY-HÁROMSZÖG ────────────────────────────────────────────────
// A műfaj alapja: lándzsás veri a lovagot, lovag veri az íjászt, íjász veri a
// lándzsást. Ezt NEM egységtípusok közti táblázat írja le, hanem TÁMADÁSTÍPUS ×
// PÁNCÉLTÍPUS — mert a v0.9-ben nyolc civilizáció jön egyedi egységekkel, és
// egy típus×típus tábla ott 64×64-esre nőne. Így egy új egység csak besorol egy
// meglévő támadás- és páncéltípusba, és az ellensúlyok maguktól működnek rá.
//
// ── AMIT A v0.4 ELSŐ KÖRE MÉG NEM CSINÁL ──────────────────────────────────
// A halott egység HELYE megmarad (nincs tömörítés, nincs slot-újrahasznosítás).
// Ez tudatos: az egység-INDEX a szimuláció legelterjedtebb hivatkozása
// (`celEgyseg`, munkás-célok, kijelölés, Ctrl-csoportok), és ha a halál
// átrendezné az indexeket, MINDEN ilyen hivatkozás csendben másra mutatna.
// A v0.5-ben, amikor egységet képezni is lehet, a slot-újrahasznosítás
// elkerülhetetlen lesz — akkor generációs számláló kell hozzá, hogy az elavult
// hivatkozás ELKAPHATÓ legyen, ne csak elromoljon.

import { TIPUS, ALLAPOT } from './units.js';

/** Támadástípusok — ezekhez tartozik az ellensúly-tábla egy SORA. */
export const TAMADAS = { VAGO: 0, SZURO: 1, NYIL: 2, OSTROM: 3 };
/** Páncéltípusok — ezekhez tartozik egy OSZLOPA. */
export const PANCEL = { GYALOGOS: 0, TAVOLSAGI: 1, LOVAS: 2, EPULET: 3 };

export const TAMADAS_NEV = ['vágó', 'szúró', 'nyíl', 'ostrom'];
export const PANCEL_NEV = ['gyalogos', 'távolsági', 'lovas', 'épület'];

// ── EGYSÉG-ADATOK (index = `TIPUS.*`) ────────────────────────────────────
// MUNKAS · LANDZSAS · IJASZ · LOVAG
const MAX_HP = [40, 55, 35, 100];
const ALAP_SEBZES = [3, 6, 5, 10];
const TAMADAS_TIPUS = [TAMADAS.VAGO, TAMADAS.SZURO, TAMADAS.NYIL, TAMADAS.VAGO];
const PANCEL_TIPUS = [PANCEL.GYALOGOS, PANCEL.GYALOGOS, PANCEL.TAVOLSAGI, PANCEL.LOVAS];
/** Lapos páncél: ennyivel csökken MINDEN beérkező csapás (legalább 1 megy át). */
const PANCEL_ERTEK = [0, 1, 0, 2];
/** Két csapás közti tickek. 20 tick = 1 másodperc. */
const UTEM = [25, 15, 20, 16];

/**
 * HATÓTÁVOLSÁG világegységben — eddig ér el az egység a célpontjához.
 *
 * ⚠️ EZT A `parancsallapot.js` IS OLVASSA: a célzás-réteg ebből tudja, mikor
 * álljon meg az üldöző egység. Ha a kettő elcsúszna, az íjász vagy odasétálna
 * a lándzsás orra elé (és meghalna), vagy megállna lőtávon kívül (és nem
 * csinálna semmit). Egy forrás, két olvasó.
 */
export const HATOTAV = [1.15, 1.45, 6.0, 1.25];

/**
 * Távolsági-e? A távolsági egység nem azonnal sebez, hanem LÖVEDÉKET indít
 * (`lovedek.js`), aminek repülési ideje van. Ez nem látvány, hanem
 * játékmechanika: ettől lehet „túllőni" egy visszavonulót, és ezért éri meg a
 * lovasnak berohanni az íjászok közé.
 */
const TAVOLSAGI = [0, 0, 1, 0];

/**
 * ELLENSÚLY-TÁBLA: `SZORZO[támadástípus][páncéltípus]` SZÁZALÉKBAN.
 *
 * A háromszög innen olvasható ki:
 *   szúró (lándzsás) → lovas páncél   220 %   ← a lándzsás felnyársalja a lovagot
 *   vágó  (lovag)    → távolsági      150 %   ← a lovag lerohanja az íjászt
 *   nyíl  (íjász)    → gyalogos       130 %   ← az íjász lelövi a lándzsást
 * és a visszairányok mind 100 % alatt vannak.
 */
const SZORZO = [
  // gyalogos, távolsági, lovas, épület
  [100, 150, 100, 60],   // VAGO
  [80, 90, 220, 40],     // SZURO
  [130, 100, 70, 30],    // NYIL
  [70, 70, 70, 400],     // OSTROM
];

export class Harc {
  /**
   * @param {number} maxDb
   * @param {import('./sim.js').Sim} sim
   */
  constructor(maxDb, sim) {
    this.maxDb = maxDb | 0;
    this.sim = sim;
    const m = this.maxDb;

    this.hp = new Int32Array(m);
    this.maxHp = new Int32Array(m);
    /** 1 = él. A halott slot MEGMARAD (lásd a fejlécet). */
    this.elo = new Uint8Array(m);
    /** Hány tick múlva üthet legközelebb. */
    this.utemHatra = new Int32Array(m);

    /** Statisztika a jelentéseknek. */
    this.halottak = [0, 0];
    this.osszSebzes = [0, 0];
  }

  /** Teljes visszaállítás — a felállás hívja, a típusok ismeretében. */
  nullaz(db) {
    const e = this.sim.egysegek;
    this.hp.fill(0);
    this.maxHp.fill(0);
    this.elo.fill(0);
    this.utemHatra.fill(0);
    this.halottak[0] = 0; this.halottak[1] = 0;
    this.osszSebzes[0] = 0; this.osszSebzes[1] = 0;
    for (let i = 0; i < db; i++) {
      const t = e.tipus[i];
      this.maxHp[i] = MAX_HP[t];
      this.hp[i] = MAX_HP[t];
      this.elo[i] = 1;
      // Az ütem-számlálót a típusból ÉS az indexből toljuk el, hogy egy
      // összecsapás első csapásai ne EGYETLEN ticken záporozzanak. Ez nem
      // szépészet: az egyszerre leadott 800 csapás egy tickes tüskét csinálna.
      this.utemHatra[i] = i % UTEM[t];
    }
  }

  /** Él-e még? A célzás és a render is ezt kérdezi. */
  el(i) { return i >= 0 && i < this.maxDb && this.elo[i] === 1; }

  /**
   * EGY tick — a harcérintkezésben álló egységek ütnek.
   *
   * A `ParancsAllapot.lep()` UTÁN fut: az dönti el, kinek ki a célpontja és ki
   * van harcérintkezésben. Ez a réteg már csak a sebzést végzi el — így a
   * „kire támadok" és a „mennyit sebzek" kérdés nem keveredik össze.
   */
  lep() {
    const sim = this.sim;
    const e = sim.egysegek;
    const pa = sim.parancsAllapot;
    const db = e.db;

    for (let i = 0; i < db; i++) {
      if (this.elo[i] === 0) continue;
      if (this.utemHatra[i] > 0) this.utemHatra[i]--;

      const cel = pa.celEgyseg[i];
      if (cel < 0 || cel >= db || this.elo[cel] === 0) continue;
      if (e.csapat[cel] === e.csapat[i]) continue;
      if (e.allapot[i] !== ALLAPOT.HARCOL) continue;
      if (this.utemHatra[i] > 0) continue;

      // Hatótávon belül van-e? Négyzetes összehasonlítás, gyökvonás nélkül.
      const t = e.tipus[i];
      const dx = e.px[cel] - e.px[i], dy = e.py[cel] - e.py[i];
      const hat = HATOTAV[t];
      if (dx * dx + dy * dy > hat * hat) continue;

      const seb = this.sebzesErtek(t, e.tipus[cel]);
      if (TAVOLSAGI[t]) {
        // A sebzés a KILÖVÉSKOR dől el, és a lövedék viszi magával — a
        // becsapódás így olcsó, és a szám nem változik meg út közben.
        this.sim.lovedekek.lo(e.px[i], e.py[i], cel, seb, e.csapat[i]);
      } else {
        this.sebez(cel, seb, e.csapat[i]);
      }
      this.utemHatra[i] = UTEM[t];
    }
  }

  /**
   * A csapás ÉRTÉKE — páncél és ellensúly beszámítva, egészben.
   *
   * A sebzés MINDIG legalább 1: enélkül két erősen páncélozott egység a
   * végtelenségig ütné egymást nulla eredménnyel, és a játékos azt látná, hogy
   * a csata „megállt".
   *
   * Külön metódus, mert KÉT hívója van: a közelharc azonnal alkalmazza, a
   * távolsági viszont a kilövéskor számolja ki, és a lövedék viszi magával.
   * @param {number} tamadoTipus @param {number} celTipus
   * @returns {number} egész sebzés
   */
  sebzesErtek(tamadoTipus, celTipus) {
    const tt = TAMADAS_TIPUS[tamadoTipus];
    const pt = PANCEL_TIPUS[celTipus];
    // Egész osztás — nincs kerekítési szabadság, tehát gépfüggetlen.
    let seb = ((ALAP_SEBZES[tamadoTipus] * SZORZO[tt][pt]) / 100) | 0;
    seb -= PANCEL_ERTEK[celTipus];
    return seb < 1 ? 1 : seb;
  }

  /** A sebzés alkalmazása. A lövedék becsapódása is ide fut be. */
  sebez(cel, seb, tamadoCsapat) {
    if (cel < 0 || this.elo[cel] === 0) return;
    this.hp[cel] -= seb;
    this.osszSebzes[tamadoCsapat & 1] += seb;
    if (this.hp[cel] <= 0) this._meghal(cel);
  }

  /**
   * Halál. A slot megmarad, csak „kiürül": az egység nem mozog, nem üt, nem
   * kerül be a térbeli hasítótáblába (tehát nem lökdösi a többieket és nem is
   * célozható), és a render sem rajzolja ki.
   */
  _meghal(i) {
    const e = this.sim.egysegek;
    const sim = this.sim;
    this.elo[i] = 0;
    this.hp[i] = 0;
    e.allapot[i] = ALLAPOT.ALL;
    e.vx[i] = 0; e.vy[i] = 0;
    e.mezoId[i] = -1;
    sim.parancsAllapot.celEgyseg[i] = -1;
    // Ha munkás volt, a rakománya elvész vele — a gazdaság így is egyirányú
    // marad (nem teremtünk nyersanyagot, csak nem érkezik meg).
    if (e.tipus[i] === TIPUS.MUNKAS) sim.munkasok.elenged(i);
    this.halottak[e.csapat[i] & 1]++;
  }

  /** Élő létszám csapatonként — a jelentésekhez és a HUD-hoz. */
  osszesites() {
    const e = this.sim.egysegek;
    const elo = [0, 0];
    for (let i = 0; i < e.db; i++) if (this.elo[i]) elo[e.csapat[i] & 1]++;
    return { elo, halottak: this.halottak.slice(), sebzes: this.osszSebzes.slice() };
  }
}
