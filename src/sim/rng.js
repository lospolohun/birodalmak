// AGE OF THE CRYSTALS — SEEDELT VÉLETLEN.
//
// ── MIÉRT NEM `Math.random()` ────────────────────────────────────────────
// A `Math.random()` a szimulációban TILOS: gépenként más sorozatot ad, tehát
// azonnal desyncet okoz. Minden véletlen innen jön, a meccs seedjéből.
//
// ── MIÉRT CSAK EGÉSZ-MŰVELETEK ───────────────────────────────────────────
// A generátorok csak egész-műveletekre (`Math.imul`, eltolás, XOR) épülnek,
// azok pedig bitre definiáltak — ez a rész eleve determinizmus-biztos. A
// lebegőpontos `Math.sin/pow` alapú „olcsóbb" hash-ek pont ezért tiltottak a
// `sim/` alatt: a motorok utolsó bitje eltérhet.
// (A minta a TELEPESEK `src/core/rng.js`-éből származik, ott már bizonyított.)

/**
 * Gyors 32 bites PRNG.
 * @param {number} seed
 * @returns {() => number} [0,1) tartományú generátor
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  const gen = function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // ── A GENERÁTOR ÁLLAPOTA KIOLVASHATÓ ÉS VISSZAÁLLÍTHATÓ (v0.7/2) ────────
  // A zárvány szép, de a MENTÉS nem tud belenyúlni — és a generátor egyetlen
  // 32 bites száma ugyanúgy a szimuláció állapota, mint egy egység pozíciója.
  // Ha egy betöltött meccs friss generátorral folytatódna, MÁS sorozatot
  // kapna, és a folytatás elcsúszna az eredetitől. Ez a fajta eltérés
  // ráadásul csak akkor jelentkezne, amikor legközelebb véletlent kérünk —
  // vagyis órákkal a valódi ok után.
  gen.allapot = () => a | 0;
  gen.beallit = (uj) => { a = uj | 0; };
  return gen;
}

/**
 * Egész-hash: stabil, sorrendfüggetlen „véletlen" egy koordinátára.
 * @returns {number} 32 bites előjel nélküli
 */
export function hash2(x, y, seed = 0) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ (seed | 0);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** hash2 → [0,1) */
export function rand2(x, y, seed = 0) { return hash2(x, y, seed) / 4294967296; }

/**
 * 2D értékzaj + fBm a terephez. Csak szorzás/összeadás és egész-hash — nincs
 * benne `Math.sin`, tehát determinizmus-biztos.
 */
export class Zaj {
  constructor(seed = 1) { this.seed = seed >>> 0; }

  _v(ix, iy) { return rand2(ix, iy, this.seed) * 2 - 1; }

  /** Sima értékzaj [-1,1]. */
  zaj2(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const a = this._v(ix, iy), b = this._v(ix + 1, iy);
    const c = this._v(ix, iy + 1), d = this._v(ix + 1, iy + 1);
    const also = a + (b - a) * ux;
    const felso = c + (d - c) * ux;
    return also + (felso - also) * uy;
  }

  /** Fraktál zaj (több oktáv) — dombok. */
  fbm(x, y, oktav = 4, lakunaritas = 2.0, csillapitas = 0.5) {
    let f = 1, amp = 1, osszeg = 0, norma = 0;
    for (let o = 0; o < oktav; o++) {
      osszeg += amp * this.zaj2(x * f, y * f);
      norma += amp; f *= lakunaritas; amp *= csillapitas;
    }
    return osszeg / (norma || 1);
  }

  /** Gerinces zaj — sziklagerincek, hegyláncok. */
  gerinc(x, y, oktav = 4) {
    let f = 1, amp = 1, osszeg = 0, norma = 0;
    for (let o = 0; o < oktav; o++) {
      const n = 1 - Math.abs(this.zaj2(x * f, y * f));
      osszeg += amp * n * n; norma += amp; f *= 2; amp *= 0.5;
    }
    return osszeg / (norma || 1);
  }
}
