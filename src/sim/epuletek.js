// AGE OF THE CRYSTALS — ÉPÜLETEK (v0.3: a lerakatok).
//
// ── MI VAN ITT ÉS MI NINCS ────────────────────────────────────────────────
// A v0.3 gazdasági kör: a nyersanyagot valahova le kell RAKNI, különben a
// munkás-AI-nak nincs értelme. Ezért itt most két épület van:
//
//   KOZPONT  a csapat magja, egyben lerakat is. Minden csapat kap egyet indulásnál.
//   RAKTAR   olcsó, kicsi lerakat — ezt a játékos rakja a lelőhelyek mellé.
//
// A teljes épület-roster és a technológiafa a v0.5, az építő-munkás AI szintén.
// Itt az építés IDŐBE telik, de nem igényel munkást a helyszínen — ez tudatos
// egyszerűsítés, és a `PLAN.md` szerinti sorrendet követi.
//
// ── AMI KÖNNYEN ELROMLIK: A JÁRHATÓSÁG ────────────────────────────────────
// Az épület ZÁRJA a celláit, tehát ugyanaz a csapda, mint a nyersanyagoknál: a
// `MezoTar` gyorsítótárazott mezői egy frissen lerakott raktárról nem tudnak, és
// a sereg átsétálna rajta. Ezért a lerakás jelzi a járhatóság-változást, és a
// `Sim.lep()` üríti a mező-tárat.
//
// Az épület alá szorult egységeket NEM toljuk ki: a lerakás előbb ellenőrzi,
// hogy a hely szabad-e (`lerakhato`). Ez a játékos dolga, nem a simé — és így
// nincs olyan ág, ami egységet mozgatna parancs nélkül.

export const EPULET = {
  KOZPONT: 0, RAKTAR: 1, FAL: 2, KAPU: 3,
  // v0.5 — a képző épületek és a ház
  HAZ: 4, LAKTANYA: 5, IJASZDA: 6, ISTALLO: 7, OSTROMMUHELY: 8,
  // v0.5/3 — a védmű és a kereskedelem
  TORONY: 9, PIAC: 10,
};
export const EPULET_NEV = ['központ', 'raktár', 'fal', 'kapu',
  'ház', 'laktanya', 'íjászda', 'istálló', 'ostromműhely', 'torony', 'piac'];

/** Alapterület cellában (négyzet). */
export const EP_MERET = [3, 2, 1, 1, 2, 3, 3, 3, 3, 2, 3];
/**
 * MAGASSÁG-SZORZÓ a rendernek. A sim SEMMIT nem kezd vele — az alapterületből
 * dolgozik —, csak a doboz kinézetét állítja: a torony 2×2-es alapon áll, de
 * ha az alapterületből nőne a magassága is, alacsonyabb lenne a laktanyánál, és
 * a játékos pont azt nem látná rajta, amiért megépítette. A fal viszont lapos.
 */
export const EP_MAGASSAG = [1, 1, 0.75, 0.75, 1, 1, 1, 1, 1, 2.4, 0.9];
/** Építési idő tickben (20 Hz → a központ 10 mp, a raktár 5 mp, a fal 1,5 mp). */
const EP_IDO = [200, 100, 30, 60, 100, 250, 250, 250, 300, 160, 240];
/** Ára: [étel, fa, kő, kristály]. A központ indulásnál INGYEN jár. */
export const EP_AR = [
  [0, 250, 100, 0],
  [0, 90, 0, 0],
  [0, 0, 12, 0],
  [0, 20, 30, 0],
  [0, 30, 0, 0],      // HAZ
  [0, 150, 0, 0],     // LAKTANYA
  [0, 175, 0, 0],     // IJASZDA
  [0, 175, 0, 0],     // ISTALLO
  [0, 200, 100, 0],   // OSTROMMUHELY
  [0, 50, 125, 0],    // TORONY
  [0, 175, 0, 0],     // PIAC
];
/** Lerakat-e? Csak a központ és a raktár. */
const LERAKO = [1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0];
/**
 * ÉLETERŐ. A fal sokat bír, de az ostrom-támadás 400 %-ot üt rá (lásd
 * `harc.js` ellensúly-táblája) — a fal tehát nem áttörhetetlen, csak drága
 * módon áttörhető. Pont ez a szerepe.
 */
const EP_HP = [1200, 400, 900, 700, 550, 800, 800, 800, 800, 1000, 700];

/**
 * NÉPESSÉG-FÉRŐHELY épületenként (v0.5).
 *
 * A ház az egyetlen, aminek CSAK ez a szerepe — és pont ettől lesz a
 * népesség-korlát valódi döntés: aki katonát akar, annak házat is kell
 * építenie, tehát fát költ, amit nem költött laktanyára.
 */
export const EP_NEPESSEG = [10, 0, 0, 0, 10, 0, 0, 0, 0, 0, 0];

export class Epuletek {
  /**
   * @param {import('./grid.js').Racs} racs
   * @param {number} maxDb
   */
  constructor(racs, maxDb = 256) {
    this.racs = racs;
    this.maxDb = maxDb | 0;
    this.db = 0;

    /** A bal-felső cella koordinátái (egész). */
    this.cx = new Int32Array(maxDb);
    this.cy = new Int32Array(maxDb);
    /** A KÖZÉPPONT világkoordinátában — a munkás ide tart. */
    this.x = new Float64Array(maxDb);
    this.y = new Float64Array(maxDb);
    this.tipus = new Uint8Array(maxDb);
    this.csapat = new Uint8Array(maxDb);
    /** Hátralévő építési tick. 0 = kész. */
    this.epulHatra = new Int32Array(maxDb);
    /** Életerő — egészben, ugyanazért, amiért az egységeknél (`harc.js`). */
    this.hp = new Int32Array(maxDb);
    this.maxHp = new Int32Array(maxDb);
    /** 1 = áll. A lerombolt épület slotja megmarad, de nem létezik többé. */
    this.elo = new Uint8Array(maxDb);
    /**
     * KAPU: nyitva van-e? A nyitott kapu cellája JÁRHATÓ.
     *
     * ⚠️ A v0.4-ben a kapu MINDENKINEK nyitva vagy MINDENKINEK zárva van, nem
     * csak a sajátjainknak. Ennek oka szerkezeti: az áramlási mező a
     * `racs.jarhato`-ból épül, ami EGY közös réteg — a csapatonként eltérő
     * járhatóság csapatonként külön mezőkészletet igényelne. Az a v0.5 dolga,
     * a roster mellett; addig a kapu egy kézzel nyitható átjáró.
     */
    this.nyitva = new Uint8Array(maxDb);
    /**
     * TORONY: hátralévő tick a következő sortűzig (v0.5/3).
     *
     * Az épület ugyanúgy „üt", mint egy egység, csak nem mozog — ezért a
     * számláló ITT van, nem a `harc.js`-ben: az épület saját tulajdonsága,
     * és az épület-tömbökkel együtt kell nulláznia.
     */
    this.lovesHatra = new Int32Array(maxDb);

    this.jarhatosagValtozott = false;
  }

  /** Kész van-e (áll, és nem építés alatt)? */
  kesz(i) { return i >= 0 && i < this.db && this.elo[i] === 1 && this.epulHatra[i] === 0; }

  /** Áll-e még egyáltalán? */
  el(i) { return i >= 0 && i < this.db && this.elo[i] === 1; }

  /** Alapterület cellában — a megközelítési távolsághoz kell. */
  meret(i) { return EP_MERET[this.tipus[i]]; }

  /**
   * Lerakható-e ide? Minden érintett cellának járhatónak kell lennie — tehát
   * se víz, se szikla, se erdő, se másik épület.
   * @param {number} tipus @param {number} bx bal-felső cella x @param {number} by
   */
  lerakhato(tipus, bx, by) {
    const m = EP_MERET[tipus];
    for (let dy = 0; dy < m; dy++) {
      for (let dx = 0; dx < m; dx++) {
        const ci = this.racs.idx(bx + dx, by + dy);
        if (ci < 0 || this.racs.jarhato[ci] === 0) return false;
      }
    }
    return true;
  }

  /**
   * Épület lerakása. A hívó (a parancs-réteg) már levonta az árát.
   * @returns {number} az épület indexe, vagy -1
   */
  lerak(tipus, bx, by, csapat, azonnalKesz = false) {
    if (this.db >= this.maxDb) return -1;
    if (!this.lerakhato(tipus, bx, by)) return -1;
    const i = this.db++;
    const m = EP_MERET[tipus];
    this.cx[i] = bx; this.cy[i] = by;
    this.x[i] = bx + m * 0.5;
    this.y[i] = by + m * 0.5;
    this.tipus[i] = tipus;
    this.csapat[i] = csapat;
    this.epulHatra[i] = azonnalKesz ? 0 : EP_IDO[tipus];
    this.maxHp[i] = EP_HP[tipus];
    this.hp[i] = EP_HP[tipus];
    this.elo[i] = 1;
    this.nyitva[i] = 0;
    this.lovesHatra[i] = 0;
    for (let dy = 0; dy < m; dy++) {
      for (let dx = 0; dx < m; dx++) {
        this.racs.jarhato[this.racs.idx(bx + dx, by + dy)] = 0;
      }
    }
    this.jarhatosagValtozott = true;
    return i;
  }

  /**
   * Minden épület eltávolítása, a járhatóság visszaadásával. Az
   * `ujraFelallas` hívja — enélkül a szonda lépcsői között az épületek
   * halmozódnának, és a pálya lépcsőről lépcsőre zsugorodna.
   */
  nullaz() {
    for (let i = 0; i < this.db; i++) {
      if (this.elo[i] === 0) continue;   // a rom celláit már felszabadítottuk
      const m = EP_MERET[this.tipus[i]];
      for (let dy = 0; dy < m; dy++) {
        for (let dx = 0; dx < m; dx++) {
          const ci = this.racs.idx(this.cx[i] + dx, this.cy[i] + dy);
          if (ci >= 0) this.racs.jarhato[ci] = 1;
        }
      }
    }
    this.db = 0;
    this.hp.fill(0);
    this.maxHp.fill(0);
    this.elo.fill(0);
    this.nyitva.fill(0);
    this.lovesHatra.fill(0);
    this.jarhatosagValtozott = true;
  }

  /** Az épület celláinak lezárása vagy felszabadítása. */
  _cellak(i, zart) {
    const m = EP_MERET[this.tipus[i]];
    for (let dy = 0; dy < m; dy++) {
      for (let dx = 0; dx < m; dx++) {
        const ci = this.racs.idx(this.cx[i] + dx, this.cy[i] + dy);
        if (ci >= 0) this.racs.jarhato[ci] = zart ? 0 : 1;
      }
    }
    this.jarhatosagValtozott = true;
  }

  /**
   * Sebzés az épületre. A `harc.js` hívja — az ostrom-támadás itt fejti ki a
   * 400 %-os szorzóját.
   * @returns {boolean} elpusztult-e ettől a csapástól
   */
  sebez(i, seb) {
    if (!this.el(i)) return false;
    this.hp[i] -= seb;
    if (this.hp[i] > 0) return false;
    this.hp[i] = 0;
    this.elo[i] = 0;
    // A romok NEM maradnak akadálynak: a cella felszabadul, és a mezőket el
    // kell dobni — különben a sereg egy már nem létező falat kerülgetne.
    this._cellak(i, false);
    return true;
  }

  /**
   * Kapu nyitása/zárása. A nyitott kapu cellája járható MINDENKINEK (lásd a
   * `nyitva` mező megjegyzését arról, miért nem csapatfüggő még).
   */
  kapu(i, nyit) {
    if (!this.kesz(i) || this.tipus[i] !== EPULET.KAPU) return false;
    const uj = nyit ? 1 : 0;
    if (this.nyitva[i] === uj) return false;
    this.nyitva[i] = uj;
    this._cellak(i, !nyit);
    return true;
  }

  /**
   * A LEGKÖZELEBBI ellenséges épület egy ponthoz, sugáron belül. Az épületekből
   * néhány tucat van, tehát lineáris keresés — és csak akkor fut, ha az egység
   * NEM talált élő ellenséget, tehát ritkán. Döntetlennél a kisebb index nyer.
   * @returns {number} épület-index vagy -1
   */
  legkozelebbiEllenseges(csapat, wx, wy, sugar) {
    let legjobb = -1, legjobbD2 = sugar * sugar;
    for (let i = 0; i < this.db; i++) {
      if (this.elo[i] === 0 || this.csapat[i] === csapat) continue;
      const dx = this.x[i] - wx, dy = this.y[i] - wy;
      const d2 = dx * dx + dy * dy;
      if (d2 < legjobbD2) { legjobbD2 = d2; legjobb = i; }
    }
    return legjobb;
  }

  /** Egy tick: az építkezések haladnak. Olcsó — kevés épület van. */
  lep() {
    for (let i = 0; i < this.db; i++) {
      if (this.elo[i] === 1 && this.epulHatra[i] > 0) this.epulHatra[i]--;
    }
  }

  /**
   * A LEGKÖZELEBBI kész lerakat egy csapatnak. Lineáris keresés: épületből
   * néhány tucat van, és a munkás csak akkor kérdez, amikor megtelt — nem
   * tickenként. Döntetlennél a kisebb index nyer.
   * @returns {number} épület-index vagy -1
   */
  legkozelebbiLerako(csapat, wx, wy) {
    let legjobb = -1, legjobbD2 = Infinity;
    for (let i = 0; i < this.db; i++) {
      if (this.csapat[i] !== csapat || this.elo[i] === 0) continue;
      if (this.epulHatra[i] !== 0 || !LERAKO[this.tipus[i]]) continue;
      const dx = this.x[i] - wx, dy = this.y[i] - wy;
      const d2 = dx * dx + dy * dy;
      if (d2 < legjobbD2) { legjobbD2 = d2; legjobb = i; }
    }
    return legjobb;
  }

  /**
   * ÁLLÓHELY az épület mellett — ide áll a lerakó munkás.
   *
   * A `valtozat` ugyanazt a bajt orvosolja, mint a lelőhelyeknél: egy központhoz
   * akár száz munkás is tarthat egyszerre, és ha mind ugyanazt a cellát kapná
   * célnak, egyikük sem érne oda — a szeparáció kitolná őket, az állapotgép
   * pedig örökké „szállít" állapotban maradna. A perem RÖGZÍTETT sorrendben
   * gyűlik, tehát a körbeosztás gépfüggetlen.
   *
   * @param {number} i épület
   * @param {{x:number,y:number}} ki
   * @param {number} valtozat körbeosztás (jellemzően a munkás indexe)
   */
  allohely(i, ki, valtozat = 0) {
    if (i < 0 || i >= this.db) return null;
    const m = EP_MERET[this.tipus[i]];
    const bx = this.cx[i], by = this.cy[i];
    const n = this.racs.n;
    const j = this._jeloltCellak || (this._jeloltCellak = []);
    j.length = 0;
    for (let r = 1; r <= 3 && j.length === 0; r++) {
      for (let dy = -r; dy < m + r; dy++) {
        for (let dx = -r; dx < m + r; dx++) {
          // Csak a keret, ne a belső cellák (azok az épület alatt vannak).
          if (dx > -r && dx < m + r - 1 && dy > -r && dy < m + r - 1) continue;
          const ci = this.racs.idx(bx + dx, by + dy);
          if (ci < 0 || this.racs.jarhato[ci] === 0) continue;
          j.push(ci);
        }
      }
    }
    if (j.length === 0) return null;
    const v = valtozat < 0 ? 0 : valtozat;
    const cel = j[v % j.length];
    ki.x = (cel % n) + 0.5;
    ki.y = ((cel / n) | 0) + 0.5;
    return ki;
  }
}
