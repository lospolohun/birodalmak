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

  /** Olvasható pillanatkép a HUD-nak és a jelentéseknek. */
  allapot(csapat) {
    const o = csapat * 4;
    return {
      etel: this.keszlet[o + NYERS.ETEL],
      fa: this.keszlet[o + NYERS.FA],
      ko: this.keszlet[o + NYERS.KO],
      kristaly: this.keszlet[o + NYERS.KRISTALY],
      korszak: this.korszak[csapat],
      valtasHatra: this.korszakHatra[csapat],
    };
  }
}
