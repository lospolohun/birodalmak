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
import { TERKEP, terkepBeallitas } from './terkep.js';

/** Ez alatt víz van — járhatatlan (hajók majd a v0.4-ben). */
export const VIZSZINT = 0.0;
/** A dombzaj kilengése világegységben. */
const TEREP_AMPLITUDO = 5.0;
/** Ennyivel emeljük a szárazföldet a vízszint fölé — lásd a `_general` indoklását. */
const SZARAZFOLD_EMELES = 2.4;
/** Ennél meredekebb lejtő szikla — járhatatlan. */
export const SZIKLA_LEJTO = 0.55;
/** A gázló fél szélessége a pálya magasságának arányában (v0.10). */
const GAZLO_FEL_SZELES = 0.085;

export const TEREP = { VIZ: 0, FU: 1, FOVENY: 2, SZIKLA: 3, HAVAS: 4 };

export class Racs {
  /**
   * @param {number} n oldalhossz cellában (a pálya n×n világegység)
   * @param {number} seed
   * @param {number} [terkep] `TERKEP.*` — elhagyva a nyílt mező (v0.10)
   */
  constructor(n, seed, terkep = TERKEP.NYILT_MEZO) {
    this.n = n | 0;
    this.seed = seed >>> 0;
    this.terkep = terkep | 0;
    /** A preset SZÁMAI. Egy generátor, hat szám-készlet — lásd `terkep.js`. */
    this.p = terkepBeallitas(this.terkep);
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
    const p = this.p;
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
        let h = zaj.fbm(fx * 4, fy * 4, 5) * p.amplitudo + p.emeles;
        // Gerincek a szélek felé — a pálya közepe maradjon nyílt csatatér
        const dx = (x - kozep) / kozep, dy = (y - kozep) / kozep;
        const tav = Math.sqrt(dx * dx + dy * dy);
        const peremSuly = tav < p.peremTav ? 0 : (tav - p.peremTav) / (1 - p.peremTav);
        h += gerincZaj.gerinc(fx * 3, fy * 3, 4) * p.gerinc * peremSuly * peremSuly;
        // A legszélén tenger, hogy a pálya zárt legyen. A SZÁRAZFÖLD preset
        // `tengerTav`-ja 1 fölött van: a feltétel sosem teljesül, tehát nem
        // kellett külön elágazás a „nincs tenger" esethez.
        if (tav > p.tengerTav) h -= (tav - p.tengerTav) * 120;
        // ── FOLYÓ (v0.10) ────────────────────────────────────────────────
        // Függőleges sáv a pálya közepén, gázlókkal. A gázló nem lyuk a
        // folyóban, hanem MAGASLAT: a mederbe emelünk vissza, tehát a
        // partvonal folytonos marad, és a sereg nem esik bele félúton.
        if (p.folyoSzeles > 0) {
          const meder = kozep + kanyar(fy) * p.folyoSzeles * 1.6;
          const tavMeder = Math.abs(x - meder) / p.folyoSzeles;
          if (tavMeder < 1) {
            const melyseg = (1 - tavMeder) * (p.amplitudo + p.emeles + 2.5);
            h -= melyseg * (1 - gazloEmeles(fy, p.gazloDb));
          }
        }
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
        else if (lejto > p.sziklaLejto) t = TEREP.SZIKLA;
        else if (kh > p.havasSzint) t = TEREP.HAVAS;
        else t = TEREP.FU;

        this.terep[i] = t;
        this.jarhato[i] = (t === TEREP.VIZ || t === TEREP.SZIKLA) ? 0 : 1;
      }
    }

    // ── Kristály-lelőhelyek ─────────────────────────────────────────────
    // Fürtökben állnak, járható füves részen, a középtől kifelé. Ezek a
    // szimulációban AKADÁLYOK is: a sereg megkerüli őket.
    const rng = mulberry32(this.seed ^ 0x5bf03635);
    const furtDb = p.kristalyFurt;
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
/**
 * A FOLYÓ KANYARGÁSA (v0.10) — a meder eltolása a pálya közepéhez képest,
 * a függőleges helyzet (`fy`, 0..1) függvényében, −1..+1 között.
 *
 * Két különböző periódusú hullám összege, hogy ne szabályos szinusz legyen.
 * `Math.sin` itt SEM használható (a `src/sim/` szabálya), a fájl saját
 * `kerekSin` közelítése viszont igen — az adja a `kerekSzogX/Y`-t is.
 */
function kanyar(fy) {
  return kerekSin(fy * 4.6) * 0.62 + kerekSin(fy * 11.3 + 1.7) * 0.38;
}

/**
 * GÁZLÓ-EMELÉS: 0 = teljes mélységű meder, 1 = a folyó itt teljesen kitöltve.
 *
 * ⚠️ A GÁZLÓ NEM LYUK A FOLYÓBAN, HANEM MAGASLAT. Ha a mélységet egyszerűen
 * nem vonnánk le a gázlónál, a partvonal ugrana: a meder széle és a gázló
 * között függőleges fal keletkezne, ami a `SZIKLA_LEJTO` küszöbön
 * járhatatlanná válik — vagyis a gázló pont ott lenne zárva, ahol átjárót
 * kellene adnia. Ezért koszinusz-szerű átmenet visz vissza a teljes
 * magasságig, és a két oldala fokozatosan lejt bele a mederbe.
 */
function gazloEmeles(fy, db) {
  if (db <= 0) return 0;
  let legjobb = 0;
  for (let g = 0; g < db; g++) {
    // Egyenletesen elosztva, a peremet kerülve: 1/(db+1), 2/(db+1), …
    const kozep = (g + 1) / (db + 1);
    const t = Math.abs(fy - kozep) / GAZLO_FEL_SZELES;
    if (t >= 1) continue;
    // Simított koszinusz-harang, a fájl saját sin-közelítésével.
    const e = 0.5 + 0.5 * kerekSin((0.5 - t) * 3.141592653589793);
    if (e > legjobb) legjobb = e;
  }
  return legjobb;
}

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
