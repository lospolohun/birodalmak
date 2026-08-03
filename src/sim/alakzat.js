// AGE OF THE CRYSTALS — ALAKZATOK (formation) ÉS HELY-HOZZÁRENDELÉS.
//
// ── MIÉRT KELL EZ, HA MÁR VAN SZÓRÁS ──────────────────────────────────────
// A v0.1 `Sim._vegrehajt`-ja négyzetrácsba szórta a csoportot a cél körül, és a
// k-adik egység a k-adik rácshelyet kapta. Ez a SORREND viszont az egység-index
// sorrendje volt, aminek semmi köze ahhoz, hogy ki hol ÁLL. Következmény: egy
// 200 fős sereg menetparancsnál átszőtte magát — a bal szélen álló egység a
// jobb szélső helyre indult, és keresztülfurakodott az egész seregen. A
// szeparáció ezt látványos kavarodásként mutatta meg.
//
// Ezért az alakzat KÉT külön kérdés, és mindkettőt itt válaszoljuk meg:
//
//   1. MILYEN a formáció? — hol vannak a helyek a célpont körül (`helyek`)
//   2. KI melyik helyre megy? — a hozzárendelés (`hozzarendel`)
//
// A 2. a fontosabb. Az igazi megoldás a magyar (Hungarian) módszer lenne — az
// O(n³), 1600 egységnél szóba sem jöhet. Helyette RANG-EGYEZTETÉS: az
// egységeket és a helyeket UGYANAZON tengelypár szerint rendezzük (előbb a
// menetirányra merőlegesen, aztán a menetirány mentén), majd az r-edik egység
// az r-edik helyet kapja. Ez O(n log n), és megőrzi a bal-jobb sorrendet: aki
// balról indult, balra érkezik. Nem optimális összúthosszban, de nem is az a
// cél — az a cél, hogy a sereg NE menjen át önmagán.
//
// ── DETERMINIZMUS ─────────────────────────────────────────────────────────
// A forgatás `fxSin`/`fxCos`-szal megy, nem `Math`-tal. A rendezés
// összehasonlítója TELJES rendezés: döntetlennél az INDEX dönt, tehát nem
// támaszkodunk a motor rendezés-stabilitására. A szórt alakzat „véletlenje" egy
// egész-hash az indexből — nincs `Math.random`, és seed nélkül is reprodukálható.
//
// Nulla allokáció menet közben: minden segédtömb a konstruktorban készül el.

import { fxSin, fxCos } from './fx.js';

/** Az alakzatok. A `menet` parancs ezek egyikével számol helyeket. */
export const ALAKZAT = { NEGYZET: 0, VONAL: 1, EK: 2, SZORT: 3 };

/** Emberi nevek — a HUD ezt írja ki, a sim nem használja. */
export const ALAKZAT_NEV = ['négyzet', 'vonal', 'ék', 'szórt'];

/** Alap térköz világegységben. A legnagyobb egység-sugár 0,42 — ez elfér. */
const KOZ_ALAP = 0.95;
/** A szórt alakzat lazább, hogy tényleg lazának LÁTSZÓDJON. */
const KOZ_SZORT = 1.55;
/** A vonal-alakzat legfeljebb ennyi sor mély — efölött már nem „vonal". */
const VONAL_MAX_SOR = 3;

/**
 * Egész-hash a [0,1) tartományra (murmur-keverés). MIÉRT nem `Math.random`:
 * a szórt alakzatnak is bitre reprodukálhatónak kell lennie minden gépen, és
 * a meccs-RNG-t sem akarjuk elhasználni rá — a hely az indexből KÖVETKEZIK.
 * Csak `imul`, xor és eltolás, tehát egészben egzakt.
 * @param {number} k
 * @returns {number} [0,1)
 */
function zaj(k) {
  let h = Math.imul(k ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export class AlakzatSzamolo {
  /**
   * @param {number} maxDb a legnagyobb csoportméret, amit ki kell szolgálni
   */
  constructor(maxDb) {
    this.maxDb = maxDb | 0;
    const m = this.maxDb;
    /** A helyek eltolása a célponthoz képest, MÁR elforgatva. */
    this.helyX = new Float64Array(m);
    this.helyY = new Float64Array(m);
    /** Rendezési kulcsok: a menetirányra merőleges, illetve menetirányú vetület. */
    this._kerX = new Float64Array(m);   // egység: merőleges vetület
    this._kerY = new Float64Array(m);   // egység: menetirányú vetület
    this._helyKer = new Float64Array(m);
    this._helyMen = new Float64Array(m);
    /**
     * A rendezéshez sima JS-tömb kell (a `sort` komparátorral), de ÚJRAHASZNÁLJUK:
     * csak a `length`-et állítjuk, nem allokálunk parancsonként újat.
     */
    this._egysegRend = [];
    this._helyRend = [];
    /** hely-sorszám → egység-sorszám a csoporton belül. */
    this.parositas = new Int32Array(m);
  }

  /**
   * A formáció helyeinek KISZÁMÍTÁSA a célpont körül.
   *
   * A helyek a `helyX/helyY`-ba kerülnek, a célponthoz képesti eltolásként, a
   * `szog` irányba forgatva. A 0. hely mindig az alakzat „eleje" felé esik.
   *
   * @param {number} fajta `ALAKZAT.*`
   * @param {number} db hány hely kell
   * @param {number} szog a menetirány radiánban (`fxAtan2`-ból)
   */
  helyek(fajta, db, szog) {
    if (db > this.maxDb) db = this.maxDb;
    const hx = this.helyX, hy = this.helyY;
    // A forgatás bázisa. `elore` a menetirány, `oldal` az arra merőleges.
    const c = fxCos(szog), s = fxSin(szog);

    for (let k = 0; k < db; k++) {
      let ox = 0, oy = 0;   // ox = oldalirány, oy = menetirány (előre pozitív)

      if (fajta === ALAKZAT.VONAL) {
        // Széles, sekély rend: legfeljebb 3 sor, a többi szélességbe megy.
        const sorok = db <= 12 ? 1 : (db <= 48 ? 2 : VONAL_MAX_SOR);
        const oszlop = Math.ceil(db / sorok);
        const sor = (k / oszlop) | 0;
        const osz = k % oszlop;
        ox = (osz - (oszlop - 1) * 0.5) * KOZ_ALAP;
        oy = -sor * KOZ_ALAP;
      } else if (fajta === ALAKZAT.EK) {
        // Ék: az r-edik sorban r+1 hely, hátrafelé szélesedve. A csúcs elöl.
        // A sor kiszámítása zárt alakban: r = floor((sqrt(8k+1) - 1) / 2).
        const r = ((Math.sqrt(8 * k + 1) - 1) * 0.5) | 0;
        const sorKezd = (r * (r + 1)) >> 1;   // az r-edik sor első helyének indexe
        const helySorban = k - sorKezd;
        ox = (helySorban - r * 0.5) * KOZ_ALAP;
        oy = -r * KOZ_ALAP * 0.85;
      } else if (fajta === ALAKZAT.SZORT) {
        // Laza rács + index-hash zörej. A zörej ±0,5 térköz, tehát a helyek
        // sosem esnek egymásra, csak „nem katonásak".
        const oldal = Math.ceil(Math.sqrt(db));
        const gx = (k % oldal) - (oldal - 1) * 0.5;
        const gy = ((k / oldal) | 0) - (oldal - 1) * 0.5;
        ox = (gx + (zaj(k * 2) - 0.5)) * KOZ_SZORT;
        oy = (gy + (zaj(k * 2 + 1) - 0.5)) * KOZ_SZORT;
      } else {
        // NEGYZET — a v0.1 viselkedése, tömör blokk.
        const oldal = Math.ceil(Math.sqrt(db));
        ox = ((k % oldal) - (oldal - 1) * 0.5) * KOZ_ALAP;
        oy = (((k / oldal) | 0) - (oldal - 1) * 0.5) * KOZ_ALAP;
      }

      // Forgatás a menetirányba: az `oy` az `elore`, az `ox` az `oldal` tengely.
      hx[k] = c * oy - s * ox;
      hy[k] = s * oy + c * ox;
    }
  }

  /**
   * KI melyik helyre megy — rang-egyeztetés (lásd a fájl fejlécét).
   *
   * A hívó előbb `helyek()`-et hív, majd ezt. Az eredmény a `parositas`
   * tömbben: `parositas[h] = k`, vagyis a h-adik HELYRE a csoport k-adik
   * egysége megy.
   *
   * @param {number} db a csoport mérete
   * @param {number} szog menetirány (ugyanaz, mint a `helyek`-nél)
   * @param {Int32Array|number[]} idk a csoport egység-indexei
   * @param {Float64Array} px egység-pozíciók
   * @param {Float64Array} py
   */
  hozzarendel(db, szog, idk, px, py) {
    if (db > this.maxDb) db = this.maxDb;
    const c = fxCos(szog), s = fxSin(szog);
    const kerE = this._kerX, menE = this._kerY;
    const kerH = this._helyKer, menH = this._helyMen;

    // Vetületek. `ker` = a menetirányra MERŐLEGES tengely (bal→jobb), `men` =
    // a menetirány. A rendezés elsődleges kulcsa a `ker`: ettől marad meg a
    // sereg bal-jobb rendje, és ettől nem szövi át magát a csoport.
    for (let k = 0; k < db; k++) {
      const i = idk[k];
      const x = px[i], y = py[i];
      kerE[k] = -s * x + c * y;
      menE[k] = c * x + s * y;
    }
    for (let h = 0; h < db; h++) {
      const x = this.helyX[h], y = this.helyY[h];
      kerH[h] = -s * x + c * y;
      menH[h] = c * x + s * y;
    }

    const er = this._egysegRend, hr = this._helyRend;
    er.length = db; hr.length = db;
    for (let k = 0; k < db; k++) { er[k] = k; hr[k] = k; }

    // ⚠️ TELJES rendezés: a harmadik kulcs az INDEX. Enélkül a motor rendezés-
    // stabilitására támaszkodnánk, ami determinizmus-kockázat lenne.
    er.sort((a, b) => (kerE[a] - kerE[b]) || (menE[a] - menE[b]) || (a - b));
    hr.sort((a, b) => (kerH[a] - kerH[b]) || (menH[a] - menH[b]) || (a - b));

    const par = this.parositas;
    for (let r = 0; r < db; r++) par[hr[r]] = er[r];
  }
}
