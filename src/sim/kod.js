// AGE OF THE CRYSTALS — HADI KÖD (v0.7/1).
//
// ── MIÉRT A SIMBEN VAN, HA EGYSZER LÁTVÁNY ────────────────────────────────
// A hadi köd elsőre render-témának látszik: egy sötét réteg a pálya fölött.
// Három dolog miatt mégis a szimuláció része:
//
//   1. A FELFEDEZETTSÉG NEM SZÁMOLHATÓ ÚJRA. A „hol jártam már" HALMOZOTT
//      tudás: a mostani állapotból (hol állnak az egységeim) nem következik.
//      Ami nem vezethető le, azt tárolni kell — és amit tárolunk, az a világ
//      állapota, tehát mennie kell a mentésbe és az állapot-hashbe is.
//   2. A GÉPI ELLENFÉL EBBŐL TUD. A v0.6/3 óta a gép csak azt tudhatja, amit
//      felderített (lásd `ai.js` fejléce). Ha a köd a kliensben élne, a gép
//      döntése kliens-oldali adatból származna — az a v0.8 lockstepjében
//      azonnali desync.
//   3. A v0.8 ÚJRACSATLAKOZÁSA. A visszatérő játékosnak a SAJÁT felfedezett
//      térképét kell visszakapnia, nem egy üreset. Ez csak akkor lehetséges,
//      ha a köd a mentett állapot része.
//
// A RENDER továbbra sem ír vissza: a `render/kod3d.js` ebből a rácsból tölt
// egy textúrát, és semmi többet nem csinál.
//
// ── MIÉRT DURVÁBB RÁCSON FUT ──────────────────────────────────────────────
// A köd rácsa `KOD_OSZTO`-szor durvább a pályánál. Ez mérés-vezérelt döntés,
// nem lustaság: 1600 egység × ~314 cella (10 sugarú kör) = 500 000 írás
// KÖDFRISSÍTÉSENKÉNT. Négyszeres osztással a sugár is negyedelődik, a kör
// területe tehát TIZENHATODÁRA esik — ugyanaz a munka ~31 000 írás. A v0.1
// tick-költsége (1,15 ms) mellett az előbbi nem fért volna bele, az utóbbi
// elhanyagolható.
//
// A látvány ettől nem lesz rosszabb: a ködöt a render úgyis elmossa, a
// 64×64-es textúra bőven elég egy 256×256-os pályához.
//
// ── DETERMINIZMUS ─────────────────────────────────────────────────────────
// Csak egész számtan, `sqrt` nélkül: négyzetes távolságot hasonlítunk. A
// bejárás rögzített indexsorrendben megy. Nincs `Math.random`, nincs idő.

import { TIPUS } from './units.js';
import { EPULET } from './epuletek.js';

/** Hány pálya-cella esik egy köd-cellára. */
export const KOD_OSZTO = 4;

/**
 * Hány tickenként frissül a látótér. 10 tick = fél másodperc.
 *
 * A ködnek nem kell tickenként pontosnak lennie: az egység fél másodperc alatt
 * legfeljebb egy-két cellát tesz meg, és a köd amúgy is elmosott. A látótér
 * viszont a legdrágább per-tick munka lenne a simben — ez az egyetlen szám,
 * ami eldönti, hogy belefér-e.
 */
const KOD_KOZ = 10;

/**
 * LÁTÓTÁVOLSÁG világegységben, egységtípusonként.
 * Az íjász messzebb lát, mint amennyire lő — a felderítés így nem öngyilkosság.
 */
const LATOTAV_EGYSEG = [8, 9, 12, 11, 7];
/** Épületenként. A torony a legjobb figyelőpont — ez a védelmi értéke. */
const LATOTAV_EPULET = [14, 9, 5, 5, 8, 11, 11, 11, 11, 18, 10];

export class Kod {
  /**
   * @param {number} csapatDb
   * @param {import('./sim.js').Sim} sim
   */
  constructor(csapatDb, sim) {
    this.csapatDb = csapatDb | 0;
    this.sim = sim;
    /** A köd-rács oldalhossza. */
    this.kn = Math.ceil(sim.n / KOD_OSZTO) | 0;
    const m = this.kn * this.kn;
    this.cellaDb = m;

    /**
     * 1 = ezt a köd-cellát a csapat VALAHA látta. Halmozott, sosem törlődik a
     * meccs alatt — ez a „szürke köd", ami alatt a terep látszik, de a mozgás
     * nem.
     */
    this.latott = [];
    /** 1 = ÉPPEN MOST látja. Minden frissítésnél nulláról épül. */
    this.lathato = [];
    for (let cs = 0; cs < this.csapatDb; cs++) {
      this.latott.push(new Uint8Array(m));
      this.lathato.push(new Uint8Array(m));
    }

    /**
     * Statisztika a szondának és a HUD-nak: hány cellát látott már a csapat.
     * Nem számoljuk újra kérésre — a stampelés amúgy is végigmegy rajta.
     */
    this.latottDb = new Int32Array(this.csapatDb);
    this.lathatoDb = new Int32Array(this.csapatDb);
    /** Hányszor futott le a frissítés — a szonda ebből látja, hogy él-e. */
    this.frissitesDb = 0;
    /** A render ebből tudja, kell-e új textúrát tölteni. */
    this.valtozat = 0;
  }

  /** Teljes visszaállítás — az újrafelállás hívja. */
  nullaz() {
    for (let cs = 0; cs < this.csapatDb; cs++) {
      this.latott[cs].fill(0);
      this.lathato[cs].fill(0);
    }
    this.latottDb.fill(0);
    this.lathatoDb.fill(0);
    this.frissitesDb = 0;
    this.valtozat = 0;
  }

  /** Köd-cella index egy VILÁGKOORDINÁTÁHOZ, vagy -1 a pályán kívül. */
  idx(wx, wy) {
    const kx = (wx / KOD_OSZTO) | 0;
    const ky = (wy / KOD_OSZTO) | 0;
    if (kx < 0 || ky < 0 || kx >= this.kn || ky >= this.kn) return -1;
    return ky * this.kn + kx;
  }

  /** Látja-e MOST a csapat ezt a világpontot? */
  lathatoPont(csapat, wx, wy) {
    const i = this.idx(wx, wy);
    return i >= 0 && this.lathato[csapat][i] === 1;
  }

  /** Látta-e VALAHA a csapat ezt a világpontot? */
  latottPont(csapat, wx, wy) {
    const i = this.idx(wx, wy);
    return i >= 0 && this.latott[csapat][i] === 1;
  }

  /**
   * Egy tick. Csak `KOD_KOZ` tickenként dolgozik — lásd a konstans indoklását.
   */
  lep(tick) {
    if ((tick % KOD_KOZ) !== 0) return;
    const sim = this.sim;
    const e = sim.egysegek;
    const ep = sim.epuletek;

    for (let cs = 0; cs < this.csapatDb; cs++) {
      const most = this.lathato[cs];
      most.fill(0);

      // ⚠️ A BESZÁLLÁSOLT EGYSÉG NEM LÁT. Ugyanaz a szabály, ami a v0.4 óta
      // mindenhol: aki bent van, az nincs a világban. Ha látna, a toronyba
      // bújtatott íjász ingyen figyelőpontot adna, és a beszállásolás a
      // felderítés olcsó helyettesítője lenne.
      for (let i = 0; i < e.db; i++) {
        if (e.csapat[i] !== cs || !sim.harc.elo[i] || sim.beszallas.bent[i] === 1) continue;
        this._folt(most, e.px[i], e.py[i], LATOTAV_EGYSEG[e.tipus[i]]);
      }
      for (let k = 0; k < ep.db; k++) {
        if (ep.csapat[k] !== cs || !ep.el(k)) continue;
        this._folt(most, ep.x[k], ep.y[k], LATOTAV_EPULET[ep.tipus[k]]);
      }

      // A látottat a láthatóból frissítjük — EGY végigjárás, nem kettő.
      const volt = this.latott[cs];
      let lat = 0, uj = 0;
      for (let i = 0; i < this.cellaDb; i++) {
        if (most[i] === 0) continue;
        lat++;
        if (volt[i] === 0) { volt[i] = 1; uj++; }
      }
      this.lathatoDb[cs] = lat;
      this.latottDb[cs] += uj;
    }
    this.frissitesDb++;
    this.valtozat = (this.valtozat + 1) | 0;
  }

  /**
   * Kör-folt a köd-rácsra. Négyzetes összehasonlítás, gyökvonás nélkül — a
   * `sqrt` egzaktan definiált ugyan, de itt fölösleges is lenne.
   */
  _folt(cel, wx, wy, sugar) {
    const kn = this.kn;
    const ks = (sugar / KOD_OSZTO) | 0;
    const cx = (wx / KOD_OSZTO) | 0;
    const cy = (wy / KOD_OSZTO) | 0;
    const r2 = ks * ks;
    let y0 = cy - ks, y1 = cy + ks;
    if (y0 < 0) y0 = 0;
    if (y1 >= kn) y1 = kn - 1;
    let x0 = cx - ks, x1 = cx + ks;
    if (x0 < 0) x0 = 0;
    if (x1 >= kn) x1 = kn - 1;
    for (let y = y0; y <= y1; y++) {
      const dy = y - cy;
      const sor = y * kn;
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx;
        if (dx * dx + dy * dy > r2) continue;
        cel[sor + x] = 1;
      }
    }
  }

  /** Olvasható pillanatkép a HUD-nak és a szondának. */
  osszesites(csapat) {
    return {
      latott: this.latottDb[csapat],
      lathato: this.lathatoDb[csapat],
      osszes: this.cellaDb,
      // Egész százalék — a HUD-nak úgyis az kell, és nincs benne lebegőpont.
      szazalek: ((this.latottDb[csapat] * 100) / this.cellaDb) | 0,
    };
  }
}
