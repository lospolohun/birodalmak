// AGE OF THE CRYSTALS — A MECCS VÉGE (v0.17).
//
// ── MIÉRT VAN EZ A RÉTEG, ÉS MIÉRT A SIMBEN ───────────────────────────────
// A v0.16-ig a játékot NEM LEHETETT MEGNYERNI: a `lep()` a végtelenségig
// lépett, a statisztika-panel ezért ÁLLÁST mutatott, nem eredményt, és ki is
// írta magáról, hogy nem hivatalos. Ez nem kozmetikai hiány volt — egy RTS,
// aminek nincs vége, nem játék, hanem képernyővédő.
//
// A győzelmi feltétel a VILÁG ÁLLAPOTA, nem a felületé. Ha a kliens döntené el
// („nekem már nincs központom, kiírom, hogy vége"), akkor a v0.8 lockstepjében
// a két gép két KÜLÖNBÖZŐ tickre tenné a meccs végét: az egyiken még lefutna
// egy parancs, a másikon már nem, és onnantól két külön meccs menne. Ezért van
// itt, a `src/sim/` alatt, és ezért van a `Sim.allapotHash()`-ben.
//
// ── A SZABÁLY ─────────────────────────────────────────────────────────────
// Egy csapat KIESIK, ha
//   · VOLT központja, és most egy sem áll (`EPULET.KOZPONT`, `elo === 1`), vagy
//   · FELADTA (`{ fajta:'feladas', csapat }` parancs).
// A meccsnek akkor van vége, amikor legfeljebb EGY csapat maradt talpon. Aki
// maradt, az a győztes; ha egyszerre estek ki, döntetlen (`gyoztes === -1`).
//
// ⚠️ „VOLT KÖZPONTJA" ÉS NEM „NINCS KÖZPONTJA". A különbség egy egész
// vizsgálati kör: a `Sim` konstruktora után, felállás ELŐTT egyetlen épület
// sem áll, és a determinizmus-szonda 13. vizsgálata ilyen, felállás nélküli
// simeket gyárt tucatszám. A puszta „nincs központja" szabálytól MINDEN ilyen
// világ a 0. ticken döntetlenre futna — a meccs úgy érne véget, hogy el sem
// kezdődött. A `voltKozpont` jelző ezt zárja ki, és mellesleg a helyes
// játékszabály is: nem veszít az, akinek soha nem is volt mit elveszítenie.
//
// ── A `lep()` NEM ÁLL MEG, CSAK JELEZ — ÉS EZ TUDATOS DÖNTÉS ──────────────
// Három okból nem fagy le a szimuláció a győzelem pillanatában:
//
//   1. A render a két tick KÖZÖTT interpolál. Egy azonnal megálló sim a
//      levegőben álló lövedékkel és félbehagyott csapással merevedne ki —
//      pont az utolsó pillanat lenne a legcsúnyább az egész meccsben.
//   2. A statisztika-panel és a mentés ÉLŐ simből olvas (`vegallapot()`,
//      `mentesSzoveg()`). Ha a sim nem lép, a mérleg és a vége-képernyő egy
//      félig felépült állapotot mutatna.
//   3. A MEGÁLLÁS DÖNTÉS, és a döntés helye a meccs-hurok (`ui/meccs.js`),
//      nem a sim. A simnek egyetlen dolga van: MINDEN gépen ugyanazt mondani
//      arról, hogy mikor és ki nyert. Hogy ezután lép-e még valaki, az a
//      hurok dolga — és ott ez egy sor.
//
// Amit viszont a sim NEM engedhet: PARANCSOT a vége UTÁN. Az már az eredményt
// írná át — egy „vissza a központomat" parancs a meccs eldőlte után pont az a
// hiba, amit a győzelmi feltételnek meg kell akadályoznia.
//
// ── ⚠️ A PARANCS-ELUTASÍTÁS A VÉGREHAJTÁSNÁL VAN, NEM A BEADÁSNÁL ─────────
// Ez a réteg legkönnyebben elrontható pontja, és a hiba NÉMA lenne. A beadás
// (`Sim.parancsTickre`) a hálózatról TETSZŐLEGES helyi pillanatban érkezik: az
// egyik gép még az 1000. ticknél tart, a másik már az 1060.-nál, amikor
// ugyanaz a csomag befut. Ha a BEADÁS dobná el a parancsot a `vege` alapján,
// az egyik gép sorba tenné, a másik nem — és ez pontosan az a desync, ami
// ellen az egész réteg szól. A VÉGREHAJTÁS viszont a tickben történik, tehát
// minden gépen ugyanabban a pillanatban. Ezért a szűrő a `parancsok.js`
// `vegrehajt()`-jának első sorában van, és nem a sorba állításnál.
//
// ── NULLA ALLOKÁCIÓ ───────────────────────────────────────────────────────
// A `lep()` tickenként fut, tehát semmit nem foglal: a központ-számláló egy
// előre lefoglalt `Int32Array`, amit `fill(0)` ürít. Épületből néhány tucat
// van, a végigjárás olcsóbb, mint bármilyen gyorsítótár karbantartása — és
// ami fontosabb, nincs benne érvénytelenítendő állapot.

import { EPULET } from './epuletek.js';

/** Miért ért véget a meccs. Szám, mert a hashbe is bekerül. */
export const VEG_OK = { NINCS: 0, KOZPONT: 1, FELADAS: 2 };
/** A `VEG_OK` magyar mondatai — a UI ebből ír, a sim sosem formáz szöveget. */
export const VEG_OK_NEV = ['', 'elvesztette a központját', 'feladta a meccset'];

export class Gyozelem {
  /**
   * @param {number} csapatDb
   * @param {import('./sim.js').Sim} sim
   */
  constructor(csapatDb, sim) {
    this.csapatDb = csapatDb | 0;
    this.sim = sim;

    /** A győztes csapat, vagy -1 (fut még, VAGY döntetlen — lásd `vege`). */
    this.gyoztes = -1;
    /** A tick, amelyen a meccs eldőlt, vagy -1. EZ mondja meg, hogy vége van-e. */
    this.vegeTick = -1;
    /** `VEG_OK.*` — mi döntötte el. */
    this.ok = VEG_OK.NINCS;

    /** Volt-e valaha álló központja a csapatnak? (Lásd a fejlécet.) */
    this.voltKozpont = new Uint8Array(this.csapatDb);
    /** Feladta-e a csapat? */
    this.feladta = new Uint8Array(this.csapatDb);
    /** Kiesett-e a csapat? Származtatott, de a hashben van: ez a vereség maga. */
    this.kiesett = new Uint8Array(this.csapatDb);

    /** Újrahasznált számláló a `lep()`-hez — nulla allokáció a forró úton. */
    this._kozpontDb = new Int32Array(this.csapatDb);

    /**
     * MŰKÖDÉS-SZÁMOK. A determinizmus-kapu egyikre sem felel: egy réteg, ami
     * sosem mond ki győzelmet, tökéletesen reprodukálható. A szonda ezekből
     * látja, hogy tényleg CSINÁL is valamit.
     */
    /** Hány parancsot dobtunk el azért, mert a meccs már véget ért. */
    this.elutasitottParancs = 0;
    /** Hány feladás-parancs ment át, és hány esett ki (rossz csapat, kész meccs). */
    this.feladasDb = 0;
    this.feladasElutasitva = 0;
  }

  /** Vége van-e a meccsnek? A `vegeTick` a jelző, NEM a `gyoztes` (döntetlen!). */
  get vege() { return this.vegeTick >= 0; }

  /**
   * Teljes visszaállítás. A `Sim.szondaFelallas()` hívja — enélkül egy
   * újrafelállás a RÉGI meccs győztesével indulna, és mivel a mező a hashben
   * van, a szonda lépcsői közt csendes desync-forrás lenne.
   */
  nullaz() {
    this.gyoztes = -1;
    this.vegeTick = -1;
    this.ok = VEG_OK.NINCS;
    this.voltKozpont.fill(0);
    this.feladta.fill(0);
    this.kiesett.fill(0);
    this.elutasitottParancs = 0;
    this.feladasDb = 0;
    this.feladasElutasitva = 0;
  }

  /**
   * FELADÁS. Csak MEGJELÖLI a csapatot — hogy ettől vége lett-e a meccsnek, azt
   * ugyanaz a `lep()` dönti el, mint a központ elvesztésénél.
   *
   * MIÉRT NEM ITT DŐL EL: két helyen kimondott „vége" két helyen elromolható
   * szabály. Így a meccs vége EGYETLEN sorból következik, és a feladás
   * ugyanazon az úton megy, mint a lerombolt központ — beleértve azt is, hogy
   * a `vegeTick` a feladás tickje lesz, nem a következőé.
   *
   * @param {number} csapat
   * @returns {boolean} elfogadtuk-e
   */
  felad(csapat) {
    const cs = csapat | 0;
    if (this.vege || cs < 0 || cs >= this.csapatDb || this.feladta[cs] === 1) {
      this.feladasElutasitva++;
      return false;
    }
    this.feladta[cs] = 1;
    this.feladasDb++;
    return true;
  }

  /**
   * Egy tick. A `Sim.lep()` a LEGVÉGÉN hívja, a sebzés és a képzés után — így a
   * `vegeTick` pontosan az a tick, amelyiken a központ ledőlt, nem a következő.
   * @param {number} tick
   */
  lep(tick) {
    if (this.vege) return;   // egy meccs egyszer ér véget

    const ep = this.sim.epuletek;
    const kdb = this._kozpontDb;
    kdb.fill(0);
    for (let i = 0; i < ep.db; i++) {
      if (ep.elo[i] !== 1 || ep.tipus[i] !== EPULET.KOZPONT) continue;
      const cs = ep.csapat[i];
      if (cs < this.csapatDb) kdb[cs]++;
    }

    let vesztes = 0;
    let utolsoElo = -1;
    let okKod = VEG_OK.NINCS;
    for (let cs = 0; cs < this.csapatDb; cs++) {
      if (kdb[cs] > 0) this.voltKozpont[cs] = 1;
      // A feladás és a központ-vesztés ugyanaz a kiesés — csak az OKA más.
      const kozpontVesztes = this.voltKozpont[cs] === 1 && kdb[cs] === 0;
      const ki = this.feladta[cs] === 1 || kozpontVesztes;
      this.kiesett[cs] = ki ? 1 : 0;
      if (!ki) { utolsoElo = cs; continue; }
      vesztes++;
      // Az OK a LEGKISEBB indexű kiesett csapatéból jön. Nem ízlés: ha ketten
      // esnek ki ugyanazon a ticken, valamilyen rögzített szabály kell, hogy
      // két gép ne más okot írjon ki ugyanarra a meccsre.
      if (okKod === VEG_OK.NINCS) okKod = kozpontVesztes ? VEG_OK.KOZPONT : VEG_OK.FELADAS;
    }

    // A meccs akkor ér véget, ha legfeljebb EGY csapat maradt talpon. Két
    // csapatnál ez a szokásos „egy kiesett", de a szabály három-négy csapatnál
    // is ugyanez marad — nem kell újraírni, ha a v0.10/2 kampány több felet hoz.
    if (this.csapatDb - vesztes > 1) return;

    this.vegeTick = tick;
    this.ok = okKod;
    // NULLA talpon maradt csapat = döntetlen. Ilyenkor a `gyoztes` -1, és a
    // meccs végét a `vegeTick` mondja — ezért nem a `gyoztes >= 0` a jelző.
    this.gyoztes = (this.csapatDb - vesztes) === 1 ? utolsoElo : -1;
  }

  /**
   * A réteg mentendő állapota. A `mentes.js` ma még NEM tárolja (más gazdája
   * van a fájlnak), és amíg nem teszi, egy KÉSZ meccs mentése a betöltés után
   * futóként támadna fel. Ez a két metódus azért van itt, hogy a bekötés
   * egyetlen hívás legyen, ne egy mező-vadászat.
   */
  mentesAllapot() {
    return {
      gyoztes: this.gyoztes, vegeTick: this.vegeTick, ok: this.ok,
      voltKozpont: Array.from(this.voltKozpont),
      feladta: Array.from(this.feladta),
      kiesett: Array.from(this.kiesett),
    };
  }

  /** @param {ReturnType<Gyozelem['mentesAllapot']>} a */
  betoltesAllapot(a) {
    if (!a) return false;
    this.gyoztes = a.gyoztes | 0;
    this.vegeTick = a.vegeTick | 0;
    this.ok = a.ok | 0;
    for (let cs = 0; cs < this.csapatDb; cs++) {
      this.voltKozpont[cs] = a.voltKozpont && a.voltKozpont[cs] ? 1 : 0;
      this.feladta[cs] = a.feladta && a.feladta[cs] ? 1 : 0;
      this.kiesett[cs] = a.kiesett && a.kiesett[cs] ? 1 : 0;
    }
    return true;
  }

  /** Olvasat a szondának és a UI-nak. Sosem a forró úton hívjuk. */
  osszesites() {
    return {
      vege: this.vege,
      gyoztes: this.gyoztes,
      vegeTick: this.vegeTick,
      ok: this.ok,
      okNev: VEG_OK_NEV[this.ok] || '',
      kiesett: Array.from(this.kiesett),
      feladta: Array.from(this.feladta),
      elutasitottParancs: this.elutasitottParancs,
      feladasDb: this.feladasDb,
      feladasElutasitva: this.feladasElutasitva,
    };
  }
}
