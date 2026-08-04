// AGE OF THE CRYSTALS — CSAPAT-GAZDASÁG ÉS KORSZAKVÁLTÁS.
//
// ── MIÉRT EGY EGÉSZ TÖMB, ÉS MIÉRT NEM LEBEGŐPONTOS ───────────────────────
// A készlet `Int32Array`, nem `Float64Array`. Ez determinizmus-döntés: a
// gyűjtés részmennyiségeket is adna (0,7 fa / tick), és lebegőpontos
// összeadásból ezerszer ismételve gépenként eltérő maradék jönne. Ezért a
// szimuláció EGÉSZEKKEL számol — a munkás nem „0,7 fát" gyűjt tickenként, hanem
// egy belső, egész számlálót léptet, és csak egész egységeket ad át.
//
// ── A KORSZAKVÁLTÁS IDŐBE TELIK ───────────────────────────────────────────
// A váltás nem azonnali: az árat AZONNAL levonjuk, de a korszak csak a
// visszaszámláló végén lép életbe. Ez nem kozmetika — a v0.6 AI-jának és a
// v0.9 balanszának ez az egyik legfontosabb ütemadója (mikor „sebezhető" egy
// játékos), és ha most azonnali lenne, később az egész időzítést újra kellene
// hangolni.
//
// A visszavonás szándékosan HIÁNYZIK: aki elindította a váltást, annak a
// nyersanyaga elment. Így nincs olyan ág, ami nyersanyagot TEREMTENE — a
// gazdaság egyirányú, és egy desync-vadászatnál ez sokat ér.

import { NYERS } from './eroforras.js';
import { EP_NEPESSEG } from './epuletek.js';
import { EGYSEG_NEP, NEPESSEG_PLAFON } from './kepzes.js';

export const KORSZAK = { SOTET: 0, HAJNAL: 1, KRISTALY: 2, FENY: 3 };
export const KORSZAK_NEV = ['sötét kor', 'hajnal kora', 'kristály kora', 'fény kora'];

/**
 * A KÖVETKEZŐ korszakra lépés ára: [étel, fa, kő, kristály].
 * Az utolsó sor a `FENY`-hez tartozik; onnan nincs tovább.
 */
export const KORSZAK_AR = [
  [500, 0, 0, 0],       // sötét → hajnal
  [800, 0, 0, 200],     // hajnal → kristály
  [1000, 0, 400, 800],  // kristály → fény
];

/** A váltás hossza tickben (20 Hz): 20, 25, 30 másodperc. */
const KORSZAK_IDO = [400, 500, 600];

/** A piaci csere aránya SZÁZALÉKBAN: 100 egységből ennyi lesz a másik fajtából. */
const CSERE_ARANY = 70;

/** Kezdőkészlet — annyi, hogy az első raktár azonnal lerakható legyen. */
const KEZDO = [200, 200, 100, 0];

export class Gazdasag {
  /**
   * @param {number} csapatDb
   */
  constructor(csapatDb = 2) {
    this.csapatDb = csapatDb | 0;
    /** Sorfolytonos: `keszlet[csapat * 4 + fajta]`. */
    this.keszlet = new Int32Array(this.csapatDb * 4);
    this.korszak = new Uint8Array(this.csapatDb);
    /** Hátralévő tick a folyamatban lévő váltásból; 0 = nincs váltás. */
    this.korszakHatra = new Int32Array(this.csapatDb);
    /** Statisztika a jelentésekhez: összesen begyűjtött mennyiség fajtánként. */
    this.osszegyujtott = new Int32Array(this.csapatDb * 4);
    /**
     * HALMOZOTT piaci forgalom (v0.5/3): hány csere ment át, és mennyi jött be
     * belőle. Halmozott, mert a pillanatnyi készlet nem árulja el, hogy a piac
     * dolgozott-e — egy elköltött csere nyoma azonnal eltűnik a raktárban.
     */
    this.csereDb = new Int32Array(this.csapatDb);
    this.csereKapott = new Int32Array(this.csapatDb);
    this.csereElutasitva = new Int32Array(this.csapatDb);

    for (let cs = 0; cs < this.csapatDb; cs++) {
      for (let f = 0; f < 4; f++) this.keszlet[cs * 4 + f] = KEZDO[f];
    }
  }

  /** Teljes visszaállítás — az újrafelállás hívja. */
  nullaz() {
    this.keszlet.fill(0);
    this.korszak.fill(0);
    this.korszakHatra.fill(0);
    this.osszegyujtott.fill(0);
    this.csereDb.fill(0);
    this.csereKapott.fill(0);
    this.csereElutasitva.fill(0);
    for (let cs = 0; cs < this.csapatDb; cs++) {
      for (let f = 0; f < 4; f++) this.keszlet[cs * 4 + f] = KEZDO[f];
    }
  }

  ad(csapat, fajta, mennyi) {
    if (csapat < 0 || csapat >= this.csapatDb) return;
    this.keszlet[csapat * 4 + fajta] += mennyi;
    this.osszegyujtott[csapat * 4 + fajta] += mennyi;
  }

  /** Telik-e? `ar` négyelemű tömb. */
  telik(csapat, ar) {
    const o = csapat * 4;
    return this.keszlet[o] >= ar[0] && this.keszlet[o + 1] >= ar[1]
      && this.keszlet[o + 2] >= ar[2] && this.keszlet[o + 3] >= ar[3];
  }

  /** Levonás. Csak akkor von, ha telik — és jelzi, sikerült-e. */
  levon(csapat, ar) {
    if (!this.telik(csapat, ar)) return false;
    const o = csapat * 4;
    for (let f = 0; f < 4; f++) this.keszlet[o + f] -= ar[f];
    return true;
  }

  /**
   * Korszakváltás indítása. Egyszerre egy futhat csapatonként.
   * @returns {boolean} elindult-e
   */
  korszakIndit(csapat) {
    if (csapat < 0 || csapat >= this.csapatDb) return false;
    if (this.korszakHatra[csapat] > 0) return false;      // már folyamatban
    const k = this.korszak[csapat];
    if (k >= KORSZAK.FENY) return false;                  // nincs tovább
    if (!this.levon(csapat, KORSZAK_AR[k])) return false; // nem telik
    this.korszakHatra[csapat] = KORSZAK_IDO[k];
    return true;
  }

  /** Egy tick — a folyamatban lévő váltások haladnak. */
  lep() {
    for (let cs = 0; cs < this.csapatDb; cs++) {
      const h = this.korszakHatra[cs];
      if (h <= 0) continue;
      const uj = h - 1;
      this.korszakHatra[cs] = uj;
      if (uj === 0 && this.korszak[cs] < KORSZAK.FENY) this.korszak[cs]++;
    }
  }

  /**
   * NÉPESSÉG: mennyi a férőhely, és mennyi fogyott el (v0.5).
   *
   * Szándékosan NEM tárolt szám, hanem tickenként újraszámolt. A tárolt
   * számlálót minden halál, születés, épület-pusztulás és beszállásolás
   * karban kellene tartani; egyetlen kimaradó ág pedig olyan hibát ad, ami
   * hónapokig lappang (a játékos „tele van", pedig nincs). Néhány száz egység
   * és néhány tucat épület végigszámolása elhanyagolható a mozgás mellett.
   *
   * @param {number} csapat
   * @param {import('./sim.js').Sim} [sim] ha nincs, a bekötött sim
   */
  nepessegAllapot(csapat, sim) {
    const s = sim || this._sim;
    if (!s) return { foglalt: 0, max: 0 };
    let max = 0;
    const ep = s.epuletek;
    for (let i = 0; i < ep.db; i++) {
      if (ep.elo[i] === 0 || ep.csapat[i] !== csapat) continue;
      if (ep.epulHatra[i] !== 0) continue;     // a félkész ház még nem ad helyet
      max += EP_NEPESSEG[ep.tipus[i]];
    }
    // A civ népesség-eltolása (v0.9) a HÁZAK ÖSSZEGÉHEZ ÉS A PLAFONHOZ IS
    // hozzáadódik. Ha csak az összeghez adnánk, a Fényhozók +10-e a plafon
    // alatt eltűnne, épp ott, ahol a civjük ígéri a nagyobb hadat — vagyis a
    // bónusz a meccs végén, a késői játékban lenne semmi. Ha csak a plafont
    // emelnénk, a korai játékban nem érne semmit. Mindkettő.
    const el = s.civ ? s.civ.nepessegEltolas(csapat) : 0;
    max += el;
    const plafon = NEPESSEG_PLAFON + el;
    if (max > plafon) max = plafon;
    if (max < 0) max = 0;

    let foglalt = 0;
    const e = s.egysegek;
    for (let i = 0; i < e.db; i++) {
      if (e.csapat[i] !== csapat) continue;
      if (s.harc && s.harc.elo[i] === 0) continue;
      foglalt += EGYSEG_NEP[e.tipus[i]];
    }
    return { foglalt, max };
  }

  /**
   * PIACI CSERE (v0.5/3): adok X-ből, kapok Y-ból — veszteséggel.
   *
   * A `CSERE_ARANY` 70 %, vagyis 100 fából 70 kő lesz. A veszteség NEM
   * szépészet: enélkül a piac végtelen átváltó lenne, és a négy nyersanyag
   * gyakorlatilag eggyé olvadna — a v0.9 balanszának pedig pont az a lényege,
   * hogy a kristályt bányászni KELL, nem lehet fából megvenni.
   *
   * Egész osztás, tehát determinisztikus, és a lefelé kerekítés is a veszteség
   * irányába visz — nem teremtünk nyersanyagot.
   *
   * @returns {number} a KAPOTT mennyiség, vagy 0 ha nem sikerült
   */
  csere(csapat, ad, kap, mennyiseg) {
    if (csapat < 0 || csapat >= this.csapatDb) return 0;
    if (ad === kap) return 0;
    if (ad < 0 || ad > 3 || kap < 0 || kap > 3) return 0;
    const m = mennyiseg | 0;
    if (m <= 0) return 0;
    const o = csapat * 4;
    if (this.keszlet[o + ad] < m) { this.csereElutasitva[csapat]++; return 0; }
    const kapott = ((m * CSERE_ARANY) / 100) | 0;
    if (kapott <= 0) { this.csereElutasitva[csapat]++; return 0; }
    this.keszlet[o + ad] -= m;
    this.keszlet[o + kap] += kapott;
    this.csereDb[csapat]++;
    this.csereKapott[csapat] += kapott;
    return kapott;
  }

  /** A `Sim` köti be magát, hogy a népesség-számolás elérje az épületeket. */
  kotSim(sim) { this._sim = sim; }

  /** Olvasható pillanatkép a HUD-nak és a jelentéseknek. */
  allapot(csapat) {
    const o = csapat * 4;
    const nep = this.nepessegAllapot(csapat);
    return {
      nepesseg: nep.foglalt,
      nepessegMax: nep.max,
      etel: this.keszlet[o + NYERS.ETEL],
      fa: this.keszlet[o + NYERS.FA],
      ko: this.keszlet[o + NYERS.KO],
      kristaly: this.keszlet[o + NYERS.KRISTALY],
      korszak: this.korszak[csapat],
      valtasHatra: this.korszakHatra[csapat],
    };
  }
}
