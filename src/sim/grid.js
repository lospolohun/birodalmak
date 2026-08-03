// AGE OF THE CRYSTALS — A VILÁG RÁCSA.
//
// A pálya egy N×N-es négyzetrács. Két külön adatréteg fekszik rajta:
//
//   • CSÚCS-magasság  (N+1)×(N+1) — ebből épül a 3D terep-háló
//   • CELLA-járhatóság N×N        — ezen fut az útkeresés és az ütközés
//
// A kettő szándékosan külön van: a látvány finomabb felbontást akar, a
// szimuláció pedig a lehető legkisebb, cache-barát tömböt. A `sim/` réteg a
// csúcs-magasságot CSAK a cella-középpont magasságának kiszámolásához nézi.
//
// A terep teljesen a seedből származik (lásd [rng.js] `Zaj`), tehát két gép
// ugyanabból a seedből bitre ugyanazt a pályát kapja — ez a lockstep első
// feltétele, még a parancsok előtt.

import { Zaj, mulberry32 } from './rng.js';

/** Ez alatt víz van — járhatatlan (hajók majd a v0.4-ben). */
export const VIZSZINT = 0.0;
/** A dombzaj kilengése világegységben. */
const TEREP_AMPLITUDO = 5.0;
/** Ennyivel emeljük a szárazföldet a vízszint fölé — lásd a `_general` indoklását. */
const SZARAZFOLD_EMELES = 2.4;
/** Ennél meredekebb lejtő szikla — járhatatlan. */
export const SZIKLA_LEJTO = 0.55;

export const TEREP = { VIZ: 0, FU: 1, FOVENY: 2, SZIKLA: 3, HAVAS: 4 };

export class Racs {
  /**
   * @param {number} n oldalhossz cellában (a pálya n×n világegység)
   * @param {number} seed
   */
  constructor(n, seed) {
    this.n = n | 0;
    this.seed = seed >>> 0;
    const cs = (n + 1) * (n + 1);

    /** Csúcs-magasságok — a terep-háló ebből épül. */
    this.magassag = new Float64Array(cs);
    /** Cellánként 1 = járható, 0 = nem. */
    this.jarhato = new Uint8Array(n * n);
    /** Cellánkénti terep-típus (látvány + későbbi mozgás-módosítók). */
    this.terep = new Uint8Array(n * n);
    /** Cella-középpont magassága — a figurák ezen állnak. */
    this.kozepMagassag = new Float64Array(n * n);
    /** Kristály-lelőhelyek cella-indexei (a játék fő nyersanyaga). */
    this.kristalyok = [];

    this._general();
  }

  _general() {
    const n = this.n;
    const zaj = new Zaj(this.seed);
    const gerincZaj = new Zaj(this.seed ^ 0x9e3779b9);
    const kozep = n * 0.5;

    // ── Csúcs-magasságok ────────────────────────────────────────────────
    for (let y = 0; y <= n; y++) {
      for (let x = 0; x <= n; x++) {
        const fx = x / n, fy = y / n;
        // Alap dombok.
        //
        // A `+ SZARAZFOLD_EMELES` nélkül a zaj nullára centrált, tehát a pálya
        // FELE víz alá kerül — mérve 45,1% víz és mindössze 44% járható. Egy
        // AoE-pályán ez használhatatlan: a seregnek nincs hol manőverezni, és
        // az áramlási mező fél térképnyi elérhetetlen cellát számolna végig.
        // Az emeléssel a víz beltéri tavakra és folyókra szorul, a nyílt tenger
        // pedig a peremre — ahol a `tav > 0.95` levágás úgyis lehúzza.
        let h = zaj.fbm(fx * 4, fy * 4, 5) * TEREP_AMPLITUDO + SZARAZFOLD_EMELES;
        // Gerincek a szélek felé — a pálya közepe maradjon nyílt csatatér
        const dx = (x - kozep) / kozep, dy = (y - kozep) / kozep;
        const tav = Math.sqrt(dx * dx + dy * dy);
        const peremSuly = tav < 0.62 ? 0 : (tav - 0.62) / 0.38;
        h += gerincZaj.gerinc(fx * 3, fy * 3, 4) * 14.0 * peremSuly * peremSuly;
        // A legszélén tenger, hogy a pálya zárt legyen
        if (tav > 0.95) h -= (tav - 0.95) * 120;
        this.magassag[y * (n + 1) + x] = h;
      }
    }

    // ── Cella-szintű származtatás ───────────────────────────────────────
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const i = y * n + x;
        const s = n + 1;
        const a = this.magassag[y * s + x];
        const b = this.magassag[y * s + x + 1];
        const c = this.magassag[(y + 1) * s + x];
        const d = this.magassag[(y + 1) * s + x + 1];
        const kh = (a + b + c + d) * 0.25;
        this.kozepMagassag[i] = kh;

        // Lejtő: a négy sarok legnagyobb eltérése
        let min = a, max = a;
        if (b < min) min = b; if (b > max) max = b;
        if (c < min) min = c; if (c > max) max = c;
        if (d < min) min = d; if (d > max) max = d;
        const lejto = max - min;

        let t;
        if (kh < VIZSZINT) t = TEREP.VIZ;
        else if (kh < VIZSZINT + 0.45) t = TEREP.FOVENY;
        else if (lejto > SZIKLA_LEJTO) t = TEREP.SZIKLA;
        else if (kh > 9.5) t = TEREP.HAVAS;
        else t = TEREP.FU;

        this.terep[i] = t;
        this.jarhato[i] = (t === TEREP.VIZ || t === TEREP.SZIKLA) ? 0 : 1;
      }
    }

    // ── Kristály-lelőhelyek ─────────────────────────────────────────────
    // Fürtökben állnak, járható füves részen, a középtől kifelé. Ezek a
    // szimulációban AKADÁLYOK is: a sereg megkerüli őket.
    const rng = mulberry32(this.seed ^ 0x5bf03635);
    const furtDb = 14;
    for (let f = 0; f < furtDb; f++) {
      const szog = rng() * 6.283185307179586;
      const r = (0.25 + rng() * 0.42) * kozep;
      // A fürt középpontja — fxSin nélkül, mert itt a generálás nem
      // tick-kritikus; de a determinizmus miatt mégis saját közelítés kell.
      const cx = (kozep + kerekSzogX(szog) * r) | 0;
      const cy = (kozep + kerekSzogY(szog) * r) | 0;
      const db = 5 + ((rng() * 7) | 0);
      for (let k = 0; k < db; k++) {
        const ox = cx + ((rng() * 9) | 0) - 4;
        const oy = cy + ((rng() * 9) | 0) - 4;
        if (ox < 1 || oy < 1 || ox >= n - 1 || oy >= n - 1) continue;
        const i = oy * n + ox;
        if (this.terep[i] !== TEREP.FU) continue;
        this.kristalyok.push(i);
        this.jarhato[i] = 0;
      }
    }
  }

  /** Cella-index a rácson; -1 ha kilóg. */
  idx(x, y) {
    const n = this.n;
    if (x < 0 || y < 0 || x >= n || y >= n) return -1;
    return y * n + x;
  }

  /** Járható-e a világkoordinátás pont. */
  jarhatoPont(wx, wy) {
    const i = this.idx(wx | 0, wy | 0);
    return i >= 0 && this.jarhato[i] === 1;
  }

  /** Cella-középpont magassága világkoordinátára (a figura talpa). */
  magassagPont(wx, wy) {
    const i = this.idx(wx | 0, wy | 0);
    return i < 0 ? 0 : this.kozepMagassag[i];
  }
}

// A fürt-elhelyezéshez kell egy szög→irány átváltás. A `sim/fx.js`-t nem
// importáljuk ide, hogy a rács önálló maradjon; ez a két apró segéd ugyanazt
// a Taylor-sort használja, tehát ugyanúgy determinisztikus.
function kerekSzogX(a) { return kerekSin(a + 1.5707963267948966); }
function kerekSzogY(a) { return kerekSin(a); }
function kerekSin(x) {
  let t = x * (1 / 6.283185307179586);
  t = t - Math.floor(t + 0.5);
  let a = t * 6.283185307179586;
  if (a > 1.5707963267948966) a = 3.141592653589793 - a;
  else if (a < -1.5707963267948966) a = -3.141592653589793 - a;
  const s = a * a;
  return a * (1 + s * (-0.16666666666666666 + s * (0.008333333333333333 +
    s * (-1.984126984126984e-4 + s * (2.7557319223985893e-6 + s * -2.505210838544172e-8)))));
}
