// AGE OF THE CRYSTALS — EGYSÉG-KÉPZÉS (sorbanállás + népesség).
//
// ── MIÉRT SOR, ÉS MIÉRT ÉPÜLETENKÉNT ──────────────────────────────────────
// A képzés nem azonnali és nem is korlátlan: minden képző épületnek SAJÁT sora
// van, és egyszerre egy egység készül benne. Ez adja a műfaj egyik alapvető
// döntését — több laktanya vagy több munkás? —, és ez az, amire a v0.6 AI-ja a
// build ordereit építeni fogja. Ha a képzés globális sor lenne, az épületek
// száma nem számítana, és a gazdaság fele értelmét vesztené.
//
// ── AZ ÁR A SORBAÁLLÁSKOR MEGY LE ─────────────────────────────────────────
// Nem a sor végén, hanem a beálláskor. Kétszer is meggondoltuk, mert az AoE
// visszatérítést ad, ha a játékos törli a sort — de a visszatérítés egy MÁSIK
// ág, ami nyersanyagot TEREMT, és a v0.3 óta a gazdaság szigorúan egyirányú.
// A v0.5-ben ezért nincs sor-törlés; ha később kell, a visszatérítést egyben,
// külön paranccsal és külön ellenőrzéssel érdemes bevezetni.
//
// ── NÉPESSÉG ──────────────────────────────────────────────────────────────
// A férőhelyet az épületek adják (`EP_NEPESSEG`), a felhasználást az élő
// egységek. A számot NEM tároljuk hosszan: tickenként újraszámoljuk, mert az
// egységek úgyis meghalnak és születnek, és egy elszámolt „foglalt hely"
// számláló pont az a fajta hiba, ami hónapokig lappang. Néhány száz egység
// végigszámolása tickenként elhanyagolható a mozgás mellett.

import { EP_NEPESSEG, EP_MERET } from './epuletek.js';
import { TIPUS } from './units.js';
import { Civ } from './civ.js';

/** Egységenkénti ár: [étel, fa, kő, kristály]. */
export const EGYSEG_AR = [
  [50, 0, 0, 0],       // MUNKAS
  [35, 25, 0, 0],      // LANDZSAS
  [30, 45, 0, 0],      // IJASZ
  [70, 0, 0, 40],      // LOVAG
  [0, 160, 80, 0],     // OSTROMGEP
  [50, 0, 0, 0],       // EGYEDI — SEMLEGES sor, lásd az `egyedi.js` fejlécét
];
/** Képzési idő tickben (20 Hz). */
const EGYSEG_IDO = [300, 200, 220, 300, 500, 200];
/** Hány népesség-helyet foglal. Az ostromgép hármat. */
export const EGYSEG_NEP = [1, 1, 1, 1, 3, 1];

/**
 * Melyik épület MIT képez. Üres tömb = nem képez semmit.
 * Index = `EPULET.*` (központ, raktár, fal, kapu, ház, laktanya, íjászda,
 * istálló, ostromműhely).
 */
const KEPEZ = [
  [TIPUS.MUNKAS],      // KOZPONT
  [], [], [], [],      // RAKTAR, FAL, KAPU, HAZ
  [TIPUS.LANDZSAS],    // LAKTANYA
  [TIPUS.IJASZ],       // IJASZDA
  [TIPUS.LOVAG],       // ISTALLO
  [TIPUS.OSTROMGEP],   // OSTROMMUHELY
];

/** Egy épület sorába legfeljebb ennyi fér. */
const SOR_HOSSZ = 8;
/** Kemény népesség-plafon csapatonként, épületektől függetlenül. */
export const NEPESSEG_PLAFON = 200;

export class Kepzes {
  /**
   * @param {number} maxEpulet
   * @param {import('./sim.js').Sim} sim
   */
  constructor(maxEpulet, sim) {
    this.sim = sim;
    this.maxEpulet = maxEpulet | 0;
    const m = this.maxEpulet;

    /**
     * Épületenkénti sor, LAPOS tömbben: `sor[ep * SOR_HOSSZ + k]` a k-adik
     * várakozó egységtípus. Nem tömbök tömbje — az `maxEpulet` darab JS-tömböt
     * jelentene, amiket a GC végigjár, holott a tartalom mindig néhány szám.
     */
    this.sor = new Int32Array(m * SOR_HOSSZ).fill(-1);
    /** Hány elem áll a sorban. */
    this.sorDb = new Int32Array(m);
    /** A SOR ELEJÉN álló egység hátralévő képzési ideje tickben. */
    this.hatra = new Int32Array(m);

    /** Statisztika: hány egység készült el, és hány sorbaállás bukott el. */
    this.keszult = [0, 0];
    this.elutasitva = [0, 0];

    /**
     * Újrahasznált ár-puffer a civ-szorzóhoz. Azért mező és nem lokális tömb,
     * mert a `sorba()` tickenként sokszor fut, és a `lep()`-ben nulla allokáció
     * a szabály — egy négyelemű tömb újraosztása is szemét.
     */
    this._arPuffer = [0, 0, 0, 0];
    /** Ugyanez az egyedi egység NYERS árához (v0.9/2) — a kettő egyszerre él. */
    this._egyediAr = [0, 0, 0, 0];
  }

  nullaz() {
    this.sor.fill(-1);
    this.sorDb.fill(0);
    this.hatra.fill(0);
    this.keszult[0] = 0; this.keszult[1] = 0;
    this.elutasitva[0] = 0; this.elutasitva[1] = 0;
  }

  /**
   * Képezi-e ez az épülettípus ezt az egységtípust?
   *
   * ⚠️ A CSAPATOT IS TUDNI KELL (v0.9/2). Az egyedi egységet civenként MÁS
   * épület képzi — a Kőtörő az ostromműhelyben, a Sztyeppei portya az
   * istállóban —, tehát a `KEPEZ` tábla erre nem tud felelni. Aki nem ad
   * csapatot, az az egyedi egységre `false`-t kap: inkább utasítsunk el egy
   * érvényes kérést, mint hogy egy hiányos hívás bárhol kiképezze.
   */
  kepezheti(epTipus, egysegTipus, csapat) {
    if (egysegTipus === TIPUS.EGYEDI) {
      if (csapat === undefined) return false;
      return this.sim.egyedi.kepzoEpulet(csapat) === epTipus;
    }
    const lista = KEPEZ[epTipus];
    if (!lista) return false;
    for (let k = 0; k < lista.length; k++) if (lista[k] === egysegTipus) return true;
    return false;
  }

  /**
   * Sorba állítás. Az árat AZONNAL levonjuk (lásd a fejlécet).
   * @returns {boolean} bekerült-e a sorba
   */
  sorba(ep, egysegTipus) {
    const sim = this.sim;
    const epuletek = sim.epuletek;
    if (!epuletek.kesz(ep)) return false;
    const csapat = epuletek.csapat[ep];
    if (!this.kepezheti(epuletek.tipus[ep], egysegTipus, csapat)) {
      // Az egyedi egység elutasítása KÜLÖN is számolódik: a `Kepzes.elutasitva`
      // egy közös vödör, és ha a v0.9/2 ága végig elutasításba futna (rossz
      // képző épület, hiányzó civ), az abban a vödörben elveszne.
      if (egysegTipus === TIPUS.EGYEDI) this.sim.egyedi.elutasitva[csapat & 1]++;
      return false;
    }
    if (this.sorDb[ep] >= SOR_HOSSZ) { this.elutasitva[csapat & 1]++; return false; }

    // A NÉPESSÉGET a sorbaálláskor foglaljuk le — a sorban álló egység már
    // beleszámít. Enélkül tíz laktanya egyszerre indítana a plafon fölé, és a
    // korlát csak a legvégén ütne be, kifizetett nyersanyaggal.
    const nep = this.sim.gazdasag.nepessegAllapot(csapat);
    if (nep.foglalt + this.sorbanNepesseg(csapat) + this.nep(csapat, egysegTipus) > nep.max) {
      this.elutasitva[csapat & 1]++;
      return false;
    }
    const ar = Civ.arSzazalek(this.alapAr(csapat, egysegTipus),
      sim.civ.egysegArSzazalek(csapat, egysegTipus), this._arPuffer);
    if (!sim.gazdasag.levon(csapat, ar)) {
      this.elutasitva[csapat & 1]++;
      return false;
    }

    this.sor[ep * SOR_HOSSZ + this.sorDb[ep]] = egysegTipus;
    this.sorDb[ep]++;
    if (this.sorDb[ep] === 1) this.hatra[ep] = this._ido(csapat, egysegTipus);
    return true;
  }

  /** Képzési idő a civ-százalékkal (v0.9). Egész osztás, mint mindenhol. */
  _ido(csapat, egysegTipus) {
    const alap = egysegTipus === TIPUS.EGYEDI
      ? this.sim.egyedi.ido[csapat & 1] : EGYSEG_IDO[egysegTipus];
    return Civ.szazalek(alap, this.sim.civ.egysegIdoSzazalek(csapat, egysegTipus));
  }

  // ── A CSAPATFÜGGŐ ADATSOR (v0.9/2) ───────────────────────────────────
  // Ugyanaz a szerkezet, mint a `harc.js` `_maxHp`/`_utem` párosánál: az
  // egyedi egység ára, ideje és népesség-igénye a csapat civjéből jön, minden
  // más típusé a modul-szintű tábláiból. Nyilvános metódusok, mert a
  // `gazdasag.js` és a `ai.js` is ezeken keresztül kérdez — a `EGYSEG_NEP`
  // tömb közvetlen olvasása a v0.9/2 óta HIBÁS lenne.

  /** Népesség-igény típus + csapat szerint. */
  nep(csapat, egysegTipus) {
    if (egysegTipus === TIPUS.EGYEDI) return this.sim.egyedi.nep[csapat & 1];
    return EGYSEG_NEP[egysegTipus];
  }

  /**
   * Nyers ár a civ-százalék ELŐTT, négyelemű tömbben.
   *
   * Az egyedi egységnél újrahasznált puffert ad vissza (`_egyediAr`), a
   * többinél a modul-szintű táblát — azt a hívó SEM ÍRHATJA, és nem is írja:
   * a `Civ.arSzazalek` mindig külön kimenő tömbbe dolgozik.
   */
  alapAr(csapat, egysegTipus) {
    if (egysegTipus === TIPUS.EGYEDI) {
      return this.sim.egyedi.arba(csapat, this._egyediAr);
    }
    return EGYSEG_AR[egysegTipus];
  }

  /** Hány népesség-helyet foglalnak a MÁR SORBAN ÁLLÓ egységek egy csapatnál. */
  sorbanNepesseg(csapat) {
    const epuletek = this.sim.epuletek;
    let n = 0;
    for (let ep = 0; ep < epuletek.db; ep++) {
      if (epuletek.csapat[ep] !== csapat || epuletek.elo[ep] === 0) continue;
      for (let k = 0; k < this.sorDb[ep]; k++) {
        const t = this.sor[ep * SOR_HOSSZ + k];
        if (t >= 0) n += this.nep(csapat, t);
      }
    }
    return n;
  }

  /**
   * Hány ADOTT TÍPUSÚ egység áll egy épület sorában.
   *
   * A gépi ellenfélnek (v0.6) kell: a munkás-célszámba a MÁR MEGRENDELT
   * munkásokat is bele kell számolni, különben a gép minden döntési körben
   * újra sorba állítana. Az ár a sorbaálláskor megy le, tehát a fölösleges
   * rendelés valódi nyersanyag-veszteség, nem csak zaj.
   */
  sorbanTipus(ep, egysegTipus) {
    if (ep < 0 || ep >= this.maxEpulet) return 0;
    let n = 0;
    for (let k = 0; k < this.sorDb[ep]; k++) {
      if (this.sor[ep * SOR_HOSSZ + k] === egysegTipus) n++;
    }
    return n;
  }

  /**
   * EGY tick — a sorok elején álló egységek készülnek.
   *
   * Az épületek RÖGZÍTETT index-sorrendben járnak, tehát ha két épület
   * ugyanabban a tickben végez, mindig a kisebb indexű születik meg előbb. Ez
   * nem közömbös: az egység-slotok kiosztása ettől függ.
   */
  lep() {
    const sim = this.sim;
    const epuletek = sim.epuletek;
    for (let ep = 0; ep < epuletek.db; ep++) {
      if (this.sorDb[ep] === 0) continue;
      // A lerombolt vagy félkész épület nem dolgozik. A sor MEGMARAD: ha az
      // épületet újraépítik... nem tudják, mert az épület-slot végleg elveszett.
      // A romban maradt sor tehát holt teher — de nem hazudik, és nem is
      // teremt egységet a semmiből.
      if (!epuletek.kesz(ep)) continue;
      if (--this.hatra[ep] > 0) continue;
      this._kesz(ep);
    }
  }

  /** A sor elején álló egység elkészült. */
  _kesz(ep) {
    const sim = this.sim;
    const epuletek = sim.epuletek;
    const alap = ep * SOR_HOSSZ;
    const tipus = this.sor[alap];
    const csapat = epuletek.csapat[ep];

    // Hova lépjen ki? Az épület körül, körbeosztva — ugyanaz a tanulság, mint a
    // beszállásolásnál: egy pontra mindenki nem fér, és a szeparáció szétdobná
    // őket. A változat a MÁR ELKÉSZÜLT egységek száma, tehát körbejár.
    const hely = epuletek.allohely(ep, this._p || (this._p = { x: 0, y: 0 }),
      this.keszult[csapat & 1]);
    if (hely) {
      const i = sim.egysegKepez(hely.x, hely.y, tipus, csapat);
      // Ha nincs szabad slot (betelt a `maxEgyseg`), az egység NEM születik meg,
      // de a sorból akkor is kikerül. Az árát nem adjuk vissza: a gazdaság
      // egyirányú marad, és a plafon amúgy is a játékos hibája.
      if (i >= 0) {
        this.keszult[csapat & 1]++;
        if (tipus === TIPUS.EGYEDI) sim.egyedi.keszult[csapat & 1]++;
      }
    }

    // Léptetjük a sort.
    for (let k = 1; k < this.sorDb[ep]; k++) this.sor[alap + k - 1] = this.sor[alap + k];
    this.sorDb[ep]--;
    this.sor[alap + this.sorDb[ep]] = -1;
    // ⚠️ ITT IS A CIV-SZÁZALÉKKAL, NEM CSAK A SORBAÁLLÁSNÁL. A `sorba()` a sor
    // ELSŐ elemének idejét állítja, ez pedig a KÖVETKEZŐÉT — ha csak az egyik
    // helyen skáláznánk, a sor első egysége gyorsulna, a többi nem.
    this.hatra[ep] = this.sorDb[ep] > 0
      ? this._ido(epuletek.csapat[ep], this.sor[alap]) : 0;
  }

  /** Összesítés a HUD-nak és a jelentéseknek. */
  osszesites(csapat) {
    const epuletek = this.sim.epuletek;
    let sorban = 0, kepzo = 0;
    for (let ep = 0; ep < epuletek.db; ep++) {
      if (epuletek.csapat[ep] !== csapat || epuletek.elo[ep] === 0) continue;
      if (KEPEZ[epuletek.tipus[ep]] && KEPEZ[epuletek.tipus[ep]].length) kepzo++;
      sorban += this.sorDb[ep];
    }
    return { sorban, kepzo, keszult: this.keszult[csapat & 1] };
  }
}

export { KEPEZ, SOR_HOSSZ, EP_NEPESSEG, EP_MERET };
