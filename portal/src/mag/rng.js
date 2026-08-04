// PORTAL HUB TYCOON — SEEDELT VÉLETLEN.
//
// A `Math.random()` a szimulációban TILOS. Egy tycoonban minden érdekes
// dolog véletlenből jön — melyik faj lép ki a kapun, mit akar, mikor csap le
// az idővihar —, tehát ha a véletlen nem reprodukálható, akkor SEMMI sem az:
// se a mentés, se a hibajelentés, se az egyensúly-mérés.
//
// A generátor csak egész-műveletekre épül (`Math.imul`, eltolás, XOR), azok
// pedig bitre definiáltak — ez a rész eleve determinizmus-biztos.

/**
 * Gyors 32 bites PRNG (mulberry32).
 * @param {number} seed
 * @returns {(() => number) & {allapot: () => number, beallit: (n:number)=>void}}
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  const gen = function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // A generátor 32 bitje ugyanúgy a világ állapota, mint egy utas pozíciója.
  // Ha a mentés nem vinné magával, a betöltött állomás MÁS sorozatot kapna —
  // és az eltérés csak a következő véletlennél derülne ki, órákkal az ok után.
  gen.allapot = () => a | 0;
  gen.beallit = (uj) => { a = uj | 0; };
  return gen;
}

/**
 * Egész tartomány [also, felso) — a `|0` vágás miatt egyenletes.
 * @returns {number}
 */
export function egesz(gen, also, felso) {
  return also + Math.floor(gen() * (felso - also));
}

/**
 * Súlyozott választás egy tömbből. A súly a `sulyMezo` nevű mezőből jön.
 *
 * ⚠️ SORRENDFÜGGŐ: a tömb bejárási sorrendje határozza meg az eredményt.
 * Ezért a katalógusok MINDIG tömbök ebben a projektben, sosem objektumok —
 * egy `Object.keys` bejárás motorfüggő sorrendet adhat, és az pont az a fajta
 * hiba, ami hónapokig lappang.
 *
 * @param {() => number} gen
 * @param {Array<object>} tomb
 * @param {string} sulyMezo
 * @returns {object|null}
 */
export function sulyozott(gen, tomb, sulyMezo = 'suly') {
  let osszeg = 0;
  for (let i = 0; i < tomb.length; i++) osszeg += tomb[i][sulyMezo] || 0;
  if (osszeg <= 0) return null;
  let x = gen() * osszeg;
  for (let i = 0; i < tomb.length; i++) {
    x -= tomb[i][sulyMezo] || 0;
    if (x < 0) return tomb[i];
  }
  return tomb[tomb.length - 1];
}

/**
 * Egész-hash: sorrendfüggetlen „véletlen" egy koordinátára. Akkor jó, ha
 * ugyanarra a cellára MINDIG ugyanazt akarjuk (padlómintázat, apró
 * díszítés) — ilyenkor nem kell a generátor állapotát mozgatni, tehát a
 * render is hívhatja anélkül, hogy a simbe beleírna.
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
 * Ellenőrző-összeg akkumulátor. A determinizmus-szonda ezzel hasonlít össze
 * két futást: ha az utolsó tick összege eltér, valahol motorfüggő matek van.
 * Egész-only, tehát maga a mérőeszköz nem sodródhat.
 */
export class Osszeg {
  constructor() { this.h = 0x811c9dc5 | 0; }
  /** @param {number} n egész (a hívó kvantálja, ha lebegőpontos) */
  be(n) {
    this.h = Math.imul(this.h ^ (n | 0), 0x01000193) | 0;
    this.h = (this.h ^ (this.h >>> 13)) | 0;
    return this;
  }
  /** Lebegőpontos érték ezred pontossággal — a pozíciók így kerülnek bele. */
  beF(x) { return this.be(Math.round(x * 1024)); }
  ertek() { return this.h >>> 0; }
}
