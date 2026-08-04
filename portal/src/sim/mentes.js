// PORTAL HUB TYCOON — MENTÉS ÉS VISSZAJÁTSZÁS.
//
// ── MIÉRT NEM AZ ÁLLAPOTOT MENTJÜK ────────────────────────────────────────
// A kézenfekvő megoldás az lenne, hogy szerializáljuk a világot: ezer utast,
// azok terveit, minden épület sorát, a generátor állapotát. Ez három okból
// rossz:
//
//   1. TÖRÉKENY. Minden új mező, amit elfelejtesz beletenni, csendben elvész
//      — és csak a betöltés UTÁN, órákkal később derül ki, hogy elcsúszott
//      valami. Pont az a fajta hiba, ami ellen az egész projekt épült.
//   2. NAGY. Ezer utas minden mezőjével megabájtos JSON, minden mentésnél.
//   3. FÖLÖSLEGES. A világ már EGYÉRTELMŰEN meghatározott a seedből és a
//      parancsnaplóból — ezt a determinizmus-szonda 5. vizsgálata méri is.
//
// Ezért a mentés: **seed + tick-szám + parancsnapló**. Betöltéskor a világ
// nem visszaáll, hanem ÚJRAJÁTSZÓDIK. Egy 60 000 tickes játszás naplója
// néhány ezer bejegyzés — kilobájtok.
//
// ── AMIT EZ CSERÉBE KÖVETEL ───────────────────────────────────────────────
// A visszajátszás pontosan annyi ideig tart, amennyi CPU-idő a világ
// előállítása. Ez nem azonnali: ezért a `Visszajatszo` DARABOKBAN lép, hogy a
// felület közben ki tudja rajzolni a haladást. Egy fagyott lap sokkal
// rosszabb élmény, mint egy őszinte folyamatjelző.
//
// ⚠️ EZ A FÁJL A `sim/` ALATT VAN: nincs benne `localStorage`, `window`, se
// semmi böngésző. A tárolás a `ui/tarolo.js` dolga — ez a réteg csak azt
// tudja, MI a mentés, nem azt, HOVA kerül.

/**
 * A mentésformátum verziója. Ha a parancsok szemantikája változik (nem az
 * új parancsfajta hozzáadása, hanem egy MEGLÉVŐ értelmezésének módosítása),
 * ezt léptetni kell — különben a régi mentés némán MÁS világot játszik le.
 */
export const MENTES_VERZIO = 2;
/**
 * Amit még be tudunk tölteni. A v1 nem ismerte a nehézségi fokozatot — az
 * összes ilyen mentés normálon készült, tehát hiánytalanul visszaadható.
 * Egy régi mentés eldobása mindig az utolsó lehetőség: a játékos órái vannak
 * benne, és a formátum bővülése nem az ő hibája.
 */
const OLVASHATO_VERZIOK = [1, 2];

/**
 * Mentés-objektum egy futó világból.
 * @param {object} sim
 * @param {string} [cimke] a játékos által adott név
 */
export function mentesKeszit(sim, cimke = '') {
  return {
    v: MENTES_VERZIO,
    jatek: 'portal-hub-tycoon',
    seed: sim.seed,
    /** A nehézség a világ állapota, tehát a mentésnek vinnie kell. */
    nehezseg: sim.nehezseg.kod,
    tick: sim.tick,
    cimke,
    // A HUD-előnézethez — a betöltő lista ebből tud írni valamit anélkül,
    // hogy le kellene játszania az egész naplót.
    elonezet: {
      nap: sim.nap,
      penz: Math.round(sim.penz),
      hirnev: Math.round(sim.hirnev),
      fejezet: sim.tortenet.fejezet,
      nehezseg: sim.nehezseg.nev,
      kapu: sim.nyitottDimenziok().length,
      utas: sim.utasSzam,
      vege: sim.jatekVege,
    },
    naplo: sim.napló.map((n) => [n.tick, n.p]),
  };
}

/**
 * Ellenőrzés: érvényes-e egy beolvasott mentés.
 * @returns {{rendben: boolean, ok?: string}}
 */
export function mentesEllenoriz(adat) {
  if (!adat || typeof adat !== 'object') return { rendben: false, ok: 'nem objektum' };
  if (adat.jatek !== 'portal-hub-tycoon') return { rendben: false, ok: 'másik játék mentése' };
  if (!OLVASHATO_VERZIOK.includes(adat.v)) return { rendben: false, ok: `ismeretlen mentésformátum (v${adat.v}), ez a verzió v${MENTES_VERZIO}-ig olvas` };
  if (!Number.isInteger(adat.seed)) return { rendben: false, ok: 'hiányzó seed' };
  if (!Number.isInteger(adat.tick) || adat.tick < 0) return { rendben: false, ok: 'hibás tick-szám' };
  if (!Array.isArray(adat.naplo)) return { rendben: false, ok: 'hiányzó parancsnapló' };
  for (let i = 0; i < adat.naplo.length; i++) {
    const b = adat.naplo[i];
    if (!Array.isArray(b) || b.length !== 2 || !Number.isInteger(b[0]) || !b[1] || typeof b[1] !== 'object') {
      return { rendben: false, ok: `sérült parancs a naplóban (#${i})` };
    }
  }
  return { rendben: true };
}

/**
 * Darabokban lépő visszajátszó.
 *
 * Használat:
 *   const v = new Visszajatszo(Sim, adat);
 *   while (!v.kesz) { v.lep(2000); await kepkocka(); rajzolHaladast(v.arany); }
 *   const sim = v.sim;
 */
export class Visszajatszo {
  /**
   * @param {Function} SimOsztaly a `sim.js` `Sim` osztálya (befecskendezve,
   *   hogy ez a modul ne függjön tőle körkörösen)
   * @param {object} adat a `mentesKeszit()` kimenete
   */
  constructor(SimOsztaly, adat) {
    const e = mentesEllenoriz(adat);
    if (!e.rendben) throw new Error('Érvénytelen mentés: ' + e.ok);
    this.adat = adat;
    this.sim = new SimOsztaly({ seed: adat.seed, nehezseg: adat.nehezseg || 'normal' });
    this.celTick = adat.tick;
    this._n = 0;
  }

  get kesz() { return this.sim.tick >= this.celTick; }
  get arany() { return this.celTick > 0 ? Math.min(1, this.sim.tick / this.celTick) : 1; }

  /**
   * Legfeljebb `db` tick lejátszása.
   *
   * ⚠️ A parancsokat PONTOSAN abban a tickben kell beadni, amelyikben
   * eredetileg beérkeztek, és pontosan abban a sorrendben. A napló időrendben
   * áll, ezért elég egyetlen mutatóval végigmenni rajta — de ha valaha
   * rendezni kell, STABIL rendezés kell, különben az azonos tickű parancsok
   * sorrendje motorfüggő lenne.
   */
  lep(db = 1000) {
    const naplo = this.adat.naplo;
    const sim = this.sim;
    let n = 0;
    while (n < db && sim.tick < this.celTick) {
      const t = sim.tick;
      while (this._n < naplo.length && naplo[this._n][0] === t) {
        sim.parancs(naplo[this._n][1]);
        this._n++;
      }
      // Ha valamiért maradt korábbi tickű parancs (sérült napló), azt is
      // beadjuk, hogy ne vesszen el — jobb egy tick csúszás, mint egy néma
      // eltérés a mentéshez képest.
      while (this._n < naplo.length && naplo[this._n][0] < t) {
        sim.parancs(naplo[this._n][1]);
        this._n++;
      }
      sim.lep();
      n++;
    }
    return this.arany;
  }
}

/**
 * Egyszerű, blokkoló visszajátszás — a szondák és a node-eszközök ezt kérik.
 * A böngésző NE ezt használja, mert egy hosszú játszásnál befagyasztja a lapot.
 */
export function visszajatszik(SimOsztaly, adat) {
  const v = new Visszajatszo(SimOsztaly, adat);
  while (!v.kesz) v.lep(20000);
  return v.sim;
}
