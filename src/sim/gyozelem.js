// AGE OF THE CRYSTALS — GYŐZELEM ÉS VERESÉG (P0/1).
//
// ── MIÉRT EZ VOLT A LEGNAGYOBB HIÁNYZÓ DARAB ──────────────────────────────
// A simben eddig NEM VOLT GYŐZTES. Minden más réteg készen állt és mérve volt
// — harc, gazdaság, AI, lockstep, mentés —, de a meccs technikailag örökké
// tartott: a gép addig játszott, amíg le nem állt a szonda. Mérve is ez jött
// ki: a v0.9-es körben a 0. csapat a 12 444. tickre az UTOLSÓ egységéig
// elfogyott, a szimuláció mégis ugyanúgy pörgött tovább 40 000-ig.
//
// ── MI A VERESÉG, ÉS MIÉRT PONT EZ ────────────────────────────────────────
// A csapat elesett, ha NINCS ÉLŐ KÖZPONTJA ÉS NINCS ÉLŐ MUNKÁSA.
//
// Nem önkényes páros: ez a kettő ZÁRJA BE a gazdasági kört, és a bizonyítás a
// projekt saját tábláiból jön.
//
//   · A munkást EGYEDÜL a központ képzi (`kepzes.js` → `KEPEZ[KOZPONT]`, és a
//     tábla minden más sora katona vagy üres).
//   · Gyűjteni EGYEDÜL a munkás tud (`munkas.js` — az állapotgép a
//     `TIPUS.MUNKAS`-ra fut).
//
// Központ nélkül tehát nem lesz új munkás, munkás nélkül nem lesz új
// nyersanyag: a készlet befagy, és attól kezdve a csapat legfeljebb elkölteni
// tud, újratermelni nem. Ez a „nincs több épületed, amiből újat építhetnél"
// pontos alakja EBBEN a szimulációban.
//
// ⚠️ ÉS EZÉRT NEM „AZ ÖSSZES ÉPÜLET". A fal, a torony és a laktanya attól még
// állhat — a meccs mégis eldőlt. Az „összes épület elpusztult" feltétel a
// nyerő felet arra kényszerítené, hogy egyesével kibontson egy tucat falszakaszt
// egy már halott ellenfélnél; a „csak a központ" viszont túl enyhe, mert egy
// megmaradt munkás azonnal újat épít.
//
// ⚠️ AZ ÉPÜLŐ KÖZPONT IS SZÁMÍT (`elo === 1`, nem `kesz()`). Az még nem képez,
// de 200 ticken belül fog — a visszakapaszkodás valódi útja, és a támadónak
// pont az a dolga, hogy szétverje, mielőtt elkészül.
//
// ── ISMERT LYUK, TUDATOSAN NYITVA ─────────────────────────────────────────
// Az `epit` parancs nem igényel munkást a helyszínen, csak nyersanyagot. Egy
// csapat tehát nulla egységgel is lerakhat egy új központot, ha épp van 250 fa
// és 100 köve. Ezt SZÁNDÉKOSAN nem vizsgáljuk:
//
//   · aki a készletet is feltételbe venné, azzal a meccs SOSEM érne véget egy
//     olyan félnél, aki nulla egységgel ül 250 fán — vagyis pont az a baj
//     jönne vissza, ami ellen ez a réteg készült;
//   · a készlet ráadásul nem monoton (a piaci csere átvált fát kővé), tehát a
//     feltétel oda-vissza billegne — a latch mellett ez a rosszabbik hiba.
//
// ── A LATCH: A MECCS VÉGE VISSZAVONHATATLAN ───────────────────────────────
// Amint `vegeTick >= 0`, ez a réteg TÖBBÉ NEM VIZSGÁL semmit. Két oka van:
//
//   1. A győztes nem változhat utólag. A vesztes oldalán maradt lövedék még
//      becsapódhat, és megölheti a győztes utolsó munkását — a meccs attól még
//      eldőlt.
//   2. Determinizmus. Egy latch-elt érték nem tud gépenként szétválni; egy
//      tickenként újraszámolt „ki áll még" viszont igen, ha a két gép akár egy
//      tickre is más világot lát.
//
// ⚠️ A SIM NEM ÁLL MEG. A `lep()` továbbra is végigfut, a tick tovább nő. Ez
// tudatos: a lockstep körei (`net/lockstep.js` → `KOR_TICK`) a tick-számlálóra
// épülnek, és egy magától megálló sim ott azt jelentené, hogy a két végpont
// eltérő számú tickre jutott. A MEGÁLLÁS A KLIENS DOLGA — az olvassa a
// `vegeTick`-et, és az dönti el, mikor nem kér több ticket.
//
// ── AMI A HASHBE KERÜL ────────────────────────────────────────────────────
// `gyoztes`, `vegeTick`, és csapatonként a `vereseg` / `veresegTick` /
// `veresegOk` / `feladott`. Enélkül a lockstep két gépen MÁS TICKRE tehetné a
// meccs végét, és a desync-detektor csak jóval később szólalna meg, egy
// ártatlannak látszó pozíció-eltérésen — vagyis a jelentés a mozgásra mutatna,
// nem a valódi okra.

import { EPULET } from './epuletek.js';
import { TIPUS } from './units.js';

/** MIÉRT ért véget a meccs egy csapat szempontjából. */
export const VEGE_OK = { NINCS: 0, KIIRTAS: 1, FELADAS: 2 };
export const VEGE_OK_NEV = ['—', 'kiirtás', 'feladás'];
/** Nincs győztes: vagy még tart a meccs, vagy döntetlen lett. */
export const NINCS_GYOZTES = -1;

export class Gyozelem {
  /**
   * @param {number} csapatDb
   * @param {import('./sim.js').Sim} sim
   */
  constructor(csapatDb, sim) {
    this.csapatDb = csapatDb | 0;
    this.sim = sim;

    /** 1 = a csapat elesett. */
    this.vereseg = new Uint8Array(this.csapatDb);
    /** Melyik ticken esett el, vagy -1. */
    this.veresegTick = new Int32Array(this.csapatDb);
    /** `VEGE_OK.*` — miért esett el. */
    this.veresegOk = new Uint8Array(this.csapatDb);
    /**
     * FELADÁS-JELZŐ, a parancsból. Külön mező, nem azonnali vereség: a döntés
     * EGY helyen dőljön el (`lep()`), különben a „ki maradt talpon" számolás
     * két úton futna, és a kettő előbb-utóbb elcsúszna egymástól.
     */
    this.feladott = new Uint8Array(this.csapatDb);

    /** A győztes csapat, vagy `NINCS_GYOZTES`. */
    this.gyoztes = NINCS_GYOZTES;
    /** A meccs vége, vagy -1. Ez a LATCH. */
    this.vegeTick = -1;

    /**
     * MŰKÖDÉS-SZÁM: hányszor futott le a DRÁGA (egység-)pásztázás. Nincs a
     * hashben — a világállapotból következik —, de a jelentésben elárulja, hogy
     * a végjáték-ág egyáltalán futott-e. Egy réteg, ami sosem néz egységet,
     * tökéletesen determinisztikus és pontosan semmit nem ér.
     */
    this.melyPasztazas = 0;

    this.nullaz();
  }

  /** Új meccs. A `Sim.szondaFelallas()` hívja, a többi réteg nullázásával együtt. */
  nullaz() {
    this.vereseg.fill(0);
    this.veresegTick.fill(-1);
    this.veresegOk.fill(VEGE_OK.NINCS);
    this.feladott.fill(0);
    this.gyoztes = NINCS_GYOZTES;
    this.vegeTick = -1;
    this.melyPasztazas = 0;
  }

  /** Eldőlt-e már a meccs? */
  vege() { return this.vegeTick >= 0; }

  /**
   * FELADÁS. A `parancsok.js` hívja — tehát a parancs-soron érkezik, nem
   * kliens-oldali gombként. Enélkül a hálózaton nem menne át: a másik gép nem
   * tudná meg, hogy feladtuk, és a két meccs azonnal kettéválna.
   * @returns {boolean} bejegyeztük-e
   */
  feladas(csapat) {
    const cs = csapat | 0;
    if (cs < 0 || cs >= this.csapatDb) return false;
    // A már eldőlt meccsben a feladás értelmetlen — és ha bejegyeznénk, egy
    // késve érkező csomag utólag írná át a hash-t.
    if (this.vegeTick >= 0 || this.vereseg[cs] === 1) return false;
    this.feladott[cs] = 1;
    return true;
  }

  /**
   * Egy tick. A `Sim.lep()` legvégén fut: addigra a tick minden halála,
   * születése és épület-rombolása megtörtént, tehát a `vegeTick` pontosan arra
   * a tickre esik, amelyiken a döntő csapás elért.
   */
  lep(tick) {
    if (this.vegeTick >= 0) return;                 // LATCH — lásd a fejlécet
    // Egy csapatos meccsben nincs mit megnyerni; enélkül a 0. ticken azonnal
    // „győzelmet" jelentenénk. Élesben mindig 2 csapat van, de a szondák
    // szabadon példányosítanak.
    if (this.csapatDb < 2) return;

    let talponDb = 0;
    let talpon = NINCS_GYOZTES;
    for (let cs = 0; cs < this.csapatDb; cs++) {
      if (this.vereseg[cs] === 1) continue;
      const ok = this._vizsgal(cs);
      if (ok === VEGE_OK.NINCS) { talponDb++; talpon = cs; continue; }
      this.vereseg[cs] = 1;
      this.veresegTick[cs] = tick | 0;
      this.veresegOk[cs] = ok;
    }
    if (talponDb > 1) return;
    this.vegeTick = tick | 0;
    // Talpon maradt EGY csapat → ő a győztes. Ha egyszerre estek el (az utolsó
    // két központ ugyanazon a ticken), az DÖNTETLEN, nem „a kisebb index nyer".
    this.gyoztes = talponDb === 1 ? talpon : NINCS_GYOZTES;
  }

  /**
   * Elesett-e ez a csapat, és miért?
   *
   * ⚠️ A SORREND ITT TELJESÍTMÉNY-DÖNTÉS. Előbb az ÉPÜLETEKET nézzük — azokból
   * néhány tucat van —, és az egység-pásztázás csak akkor indul, ha a csapatnak
   * már NINCS központja. A rendes meccs 99 %-ában tehát tickenként pár tucat
   * lépés fut, nem 1600; a drága ág a végjátékra van fenntartva, ahol úgyis
   * kevés az egység.
   * @returns {number} `VEGE_OK.*` (a `NINCS` azt jelenti: áll még)
   */
  _vizsgal(cs) {
    if (this.feladott[cs] === 1) return VEGE_OK.FELADAS;

    const ep = this.sim.epuletek;
    for (let i = 0; i < ep.db; i++) {
      if (ep.elo[i] === 0 || ep.csapat[i] !== cs) continue;
      // `elo`, NEM `kesz()`: az épülő központ is visszakapaszkodás.
      if (ep.tipus[i] === EPULET.KOZPONT) return VEGE_OK.NINCS;
    }

    this.melyPasztazas++;
    const e = this.sim.egysegek;
    const elo = this.sim.harc.elo;
    for (let i = 0; i < e.db; i++) {
      if (elo[i] === 0 || e.csapat[i] !== cs) continue;
      // A beszállásolt munkás is számít: `bent`, de él, és bármikor kijöhet.
      if (e.tipus[i] === TIPUS.MUNKAS) return VEGE_OK.NINCS;
    }
    return VEGE_OK.KIIRTAS;
  }

  /**
   * Jelentés egy csapatról — a szonda és a HUD ezt olvassa. Allokál, tehát a
   * forró úton nincs helye; tickenként senki nem hívja.
   */
  osszesites(cs) {
    const i = cs | 0;
    if (i < 0 || i >= this.csapatDb) return null;
    let kozpont = 0, epulet = 0;
    const ep = this.sim.epuletek;
    for (let k = 0; k < ep.db; k++) {
      if (ep.elo[k] === 0 || ep.csapat[k] !== i) continue;
      epulet++;
      if (ep.tipus[k] === EPULET.KOZPONT) kozpont++;
    }
    let munkas = 0, egyseg = 0;
    const e = this.sim.egysegek;
    const elo = this.sim.harc.elo;
    for (let k = 0; k < e.db; k++) {
      if (elo[k] === 0 || e.csapat[k] !== i) continue;
      egyseg++;
      if (e.tipus[k] === TIPUS.MUNKAS) munkas++;
    }
    return {
      csapat: i,
      kozpont, epulet, munkas, egyseg,
      elesett: this.vereseg[i] === 1,
      tick: this.veresegTick[i],
      ok: this.veresegOk[i],
      okNev: VEGE_OK_NEV[this.veresegOk[i]] || '—',
      feladta: this.feladott[i] === 1,
    };
  }
}
