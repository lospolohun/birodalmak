// AGE OF THE CRYSTALS — GÉPI ELLENFÉL (v0.6).
//
// ── MIÉRT A `src/sim/` ALATT VAN ──────────────────────────────────────────
// A kísértés az, hogy az AI a kliens oldalán éljen, hiszen „csak parancsokat
// ad". A v0.8 lockstepje viszont azt jelenti, hogy MINDEN gép ugyanazt a
// szimulációt futtatja — és ha az AI a kliensben lakna, a két gép AI-ja
// eltérő pillanatban, eltérő adatból döntene. Az eredmény nem „kicsit más
// gépi ellenfél" lenne, hanem AZONNALI desync: az egyik gépen elindul egy
// támadás, a másikon nem.
//
// Ezért az AI a sim RÉSZE, és rá is vonatkozik a teljes determinizmus-
// szerződés: nincs `Math.random` (a `sim.rng` van helyette), nincs `Date.now`,
// nincs sorrendfüggő objektum-bejárás. A `npm run det` statikusan is szűri.
//
// ── AZ AI PARANCSOT AD, NEM ÁLLAPOTOT ÍR ──────────────────────────────────
// Minden döntés `sim.parancs(...)`-on megy be, UGYANAZON a soron, amin a
// játékos kattintása. Ez nem szertartás:
//
//   • amit az AI tud, azt a játékos is tudja csinálni — nincs rejtett út;
//   • a szonda ugyanúgy tudja járatni, mint a kézi forgatókönyveket;
//   • a v0.8-ban a hálózat felől semmi különbség: parancs az parancs.
//
// ── A NEHÉZSÉG DÖNTÉSI MINŐSÉG, NEM CSALÁS ────────────────────────────────
// A nehéz AI NEM kap több nyersanyagot és nem lát a hadi ködön át. Két oka
// van, és egyik sem esztétikai:
//
//   1. A csaló gazdaság MÁSODIK gazdasági kódutat jelentene. A v0.3 óta a
//      nyersanyag szigorúan egyirányú (`ad` / `levon`), és minden mennyiség
//      munkából származik. Egy „ingyen 500 fa" ág ezt a garanciát törné meg,
//      és pont a determinizmus-szonda gazdasági számai vakulnának el tőle.
//   2. A csaló AI-ból a játékos semmit nem tanul. Ha a nehéz gép azért nyer,
//      mert dupla ütemben termel, akkor a vereségre nincs válasz — nincs mit
//      jobban csinálni.
//
// Amiben tehát a szintek eltérnek: MILYEN SŰRŰN gondolkodik, HÁNY munkást
// tart, MEKKORA népesség-tartalékot hagy, és (a v0.6/2-től) mennyire mélyen
// megy bele a build orderbe.
//
// ── MIÉRT NEM TICKENKÉNT DÖNT ─────────────────────────────────────────────
// Egy döntési kör végigmegy a csapat egységein — az `O(egység)`. Tickenként
// futtatva ez 20 Hz-en 1600 egységnél ugyanaz a hiba lenne, mint a v0.1-es
// per-egység áramlási mező. Ezért a döntés `DONTES_KOZ` tickenként fut, és a
// csapatok EL VANNAK TOLVA egymáshoz képest (`+ cs * 17`), hogy ne ugyanabban
// a tickben dolgozzon mindenki. Az eltolás fix szám, tehát determinisztikus —
// nem véletlen, csak szétterítés.
//
// ⚠️ AMI A LEGKÖNNYEBBEN ELROMLIK: CSAK A TÉTLEN MUNKÁSNAK ADUNK GYŰJTÉS-
// PARANCSOT. A `gyujt` parancs újraindítja az állapotgépet (`MEGY_LELOHELYRE`),
// tehát ha a döntési kör MINDEN munkásnak kiadná, a már gyűjtő munkás minden
// körben eldobná a rakományát és újraindulna — a gazdaság látszólag működne,
// valójában nulla nyersanyag jönne be. Pontosan ez a v0.3 hibája volt, más
// köntösben.

import { TIPUS } from './units.js';
import { NYERS } from './eroforras.js';
import { EPULET, EP_AR, EP_MERET } from './epuletek.js';
import { MUNKA } from './munkas.js';

export const NEHEZSEG = { KONNYU: 0, KOZEPES: 1, NEHEZ: 2 };
export const NEHEZSEG_NEV = ['könnyű', 'közepes', 'nehéz'];

/** Hány tickenként gondolkodik. 20 Hz → 6 / 4 / 2,5 másodperc. */
const DONTES_KOZ = [120, 80, 50];
/** Hány munkást tart összesen. */
const MUNKAS_CEL = [12, 20, 30];
/**
 * Mekkora SZABAD népességet tart fenn. Ha ez alá esik, házat épít.
 * A nehéz AI előre épít — a könnyű megvárja, amíg tényleg elfogy a hely, és
 * emiatt rendszeresen áll a képzése. Ez a különbség egyetlen szám, de a
 * gyakorlatban ez választja el a „nyugodt" gépet a „nyomás alatt tartó"-tól.
 */
const HAZ_TARTALEK = [3, 8, 14];

/**
 * A MUNKAERŐ CÉLARÁNYA nyersanyagonként, százalékban (étel, fa, kő, kristály).
 *
 * Fa-nehéz, és ez szándékos: a v0.5 mérése szerint az egész építési sor fából
 * megy (ház 30, laktanya 150, piac 175), az étel viszont csak a képzést eteti.
 * A kristály a korszakváltás miatt kell, de keveset és lassan.
 */
const ARANY = [30, 45, 15, 10];

/** Ekkora sugárban keres lelőhelyet a bázis körül. */
const LELOHELY_SUGAR = 60;

export class Ai {
  /**
   * @param {number} csapatDb
   * @param {import('./sim.js').Sim} sim
   */
  constructor(csapatDb, sim) {
    this.csapatDb = csapatDb | 0;
    this.sim = sim;
    /** 1 = ezt a csapatot a gép irányítja. */
    this.aktiv = new Uint8Array(this.csapatDb);
    this.nehezseg = new Uint8Array(this.csapatDb);

    /**
     * MŰKÖDÉS-SZÁMLÁLÓK — halmozottak, csapatonként.
     *
     * A determinizmus-kapu erre sem felel: egy AI, ami minden körben úgy dönt,
     * hogy nem csinál semmit, tökéletesen reprodukálható. A szonda ezekből
     * látja, hogy tényleg dolgozik-e. Halmozott, mert a pillanatnyi állapot
     * (épp hány munkás gyűjt) nulla is lehet olyankor, amikor az ág lefutott —
     * ez a v0.4 beszállásolásának tanulsága.
     */
    this.dontesDb = new Int32Array(this.csapatDb);
    this.gyujtDb = new Int32Array(this.csapatDb);
    this.epitDb = new Int32Array(this.csapatDb);
    this.kepzesDb = new Int32Array(this.csapatDb);

    /**
     * Újrahasznált gyűjtő-tömb a tétlen munkásoknak. A döntési kör így NEM
     * allokál — ugyanaz a szabály, mint a render `frissit()`-jében.
     */
    this._tetlenek = [];
    /** Munkás-eloszlás nyersanyagonként — szintén újrahasznált. */
    this._eloszlas = new Int32Array(4);
  }

  /** Egy csapat átadása a gépnek. */
  beallit(csapat, nehezseg) {
    if (csapat < 0 || csapat >= this.csapatDb) return;
    this.aktiv[csapat] = 1;
    this.nehezseg[csapat] = nehezseg | 0;
  }

  /** Teljes visszaállítás — az újrafelállás hívja. */
  nullaz() {
    this.aktiv.fill(0);
    this.nehezseg.fill(0);
    this.dontesDb.fill(0);
    this.gyujtDb.fill(0);
    this.epitDb.fill(0);
    this.kepzesDb.fill(0);
  }

  /**
   * Egy tick. A csapatokat NÖVEKVŐ index szerint járjuk be — a sorrend fix,
   * tehát a parancsok sorrendje is az.
   */
  lep(tick) {
    for (let cs = 0; cs < this.csapatDb; cs++) {
      if (this.aktiv[cs] === 0) continue;
      const koz = DONTES_KOZ[this.nehezseg[cs]];
      // Az eltolás fix szám, nem véletlen: csak szétteríti a csapatokat, hogy
      // ne egyetlen tickbe torlódjon minden döntés.
      if (((tick + cs * 17) % koz) !== 0) continue;
      this.dontesDb[cs]++;
      this._gazdasag(cs);
    }
  }

  /**
   * GAZDASÁGI KÖR (v0.6/1): tétlen munkás munkába, ház ha fogy a hely, munkás
   * képzése a célszámig.
   *
   * A sorrend fontos: előbb a MEGLÉVŐ munkaerőt osztjuk be, és csak utána
   * költünk. Fordítva a gép a nyersanyagot új munkásra költené, miközben a
   * régiek tétlenül állnak — mérhetetlenül rossz nyitás, és pont az a fajta
   * hiba, ami zöld determinizmus-kapu mellett is elrejtőzik.
   */
  _gazdasag(cs) {
    const sim = this.sim;
    const kozp = this._kozpont(cs);
    if (kozp < 0) return;   // nincs központ: a csapat el van intézve
    const bx = sim.epuletek.x[kozp], by = sim.epuletek.y[kozp];

    this._munkaraFog(cs, bx, by);
    this._hazatEpit(cs, bx, by);
    this._munkastKepez(cs, kozp);
  }

  /** A csapat első ÉLŐ központja, vagy -1. */
  _kozpont(cs) {
    const ep = this.sim.epuletek;
    for (let k = 0; k < ep.db; k++) {
      if (ep.csapat[k] === cs && ep.el(k) && ep.tipus[k] === EPULET.KOZPONT) return k;
    }
    return -1;
  }

  /**
   * A TÉTLEN munkásokat munkába állítja, a `ARANY` célarányhoz igazodva.
   *
   * ⚠️ Csak a `MUNKA.NINCS` állapotúak kapnak parancsot — lásd a fejléc utolsó
   * bekezdését. A már gyűjtő munkás újraparancsolása eldobná a rakományát.
   *
   * A tétlenek EGYESÉVEL kapnak célt, és minden kiosztás után frissítjük az
   * eloszlást. Így egy tíz fős újonc-hullám nem megy mind ugyanarra a
   * nyersanyagra — ami látványos, de értéktelen gazdaságot adna.
   */
  _munkaraFog(cs, bx, by) {
    const sim = this.sim;
    const e = sim.egysegek;
    const mu = sim.munkasok;
    const ef = sim.eroforrasok;

    const tetlenek = this._tetlenek;
    tetlenek.length = 0;
    const el = this._eloszlas;
    el[0] = 0; el[1] = 0; el[2] = 0; el[3] = 0;
    let osszes = 0;

    for (let i = 0; i < e.db; i++) {
      if (e.csapat[i] !== cs || e.tipus[i] !== TIPUS.MUNKAS) continue;
      if (!sim.harc.elo[i] || sim.beszallas.bent[i] === 1) continue;
      osszes++;
      if (mu.allapot[i] === MUNKA.NINCS) { tetlenek.push(i); continue; }
      const node = mu.celNode[i];
      if (node >= 0 && node < ef.db) el[ef.fajta[node]]++;
    }
    if (tetlenek.length === 0) return;

    for (let k = 0; k < tetlenek.length; k++) {
      const fajta = this._hianyzoFajta(el, osszes);
      const node = ef.keres(fajta, bx, by, LELOHELY_SUGAR);
      if (node < 0) continue;   // ilyen nyersanyag nincs a közelben
      // EGY egység, EGY parancs. Drágábbnak látszik, mint egy csoportos
      // parancs, de a tétlenek száma egy körben néhány darab — a v0.1-es
      // „egy mező egységenként" csapda ITT nem áll fenn, mert a `gyujt`
      // ugyanarra a lelőhelyre ugyanazt a mezőt kéri.
      sim.parancs({
        fajta: 'gyujt', egysegek: [tetlenek[k]],
        x: ef.x[node], y: ef.y[node], nyers: fajta,
      });
      el[fajta]++;
      this.gyujtDb[cs]++;
    }
  }

  /**
   * Melyik nyersanyagon van a legnagyobb LEMARADÁS a célarányhoz képest?
   *
   * Egész számtan: a cél `(összes * ARANY[f]) / 100 | 0`, a hiány ehhez képest.
   * Döntetlennél a KISEBB index nyer — ugyanaz a szabály, mint a célzásnál,
   * és ugyanabból az okból: a döntetlen feloldásának is gépfüggetlennek kell
   * lennie.
   */
  _hianyzoFajta(el, osszes) {
    let legjobb = NYERS.ETEL, legjobbHiany = -0x7fffffff;
    for (let f = 0; f < 4; f++) {
      const cel = ((osszes * ARANY[f]) / 100) | 0;
      const hiany = cel - el[f];
      if (hiany > legjobbHiany) { legjobbHiany = hiany; legjobb = f; }
    }
    return legjobb;
  }

  /**
   * HÁZ, ha fogy a népesség-hely. A `nepessegAllapot` tickenként újraszámol
   * (lásd `gazdasag.js`) — a gép ugyanazt a számot látja, mint a HUD.
   *
   * A sorban álló képzés népességét is beszámítjuk: enélkül a gép a sor
   * hosszáig „szabadnak" hinné a helyet, aztán a kiképzett egységek egyszerre
   * ütköznének a plafonba.
   */
  _hazatEpit(cs, bx, by) {
    const sim = this.sim;
    const nep = sim.gazdasag.nepessegAllapot(cs, sim);
    const foglalt = nep.foglalt + sim.kepzes.sorbanNepesseg(cs);
    const szabad = nep.max - foglalt;
    if (szabad >= HAZ_TARTALEK[this.nehezseg[cs]]) return;
    if (!sim.gazdasag.telik(cs, EP_AR[EPULET.HAZ])) return;

    const hely = this._epitesiHely(EPULET.HAZ, (bx | 0) + 5, (by | 0) - 6);
    if (!hely) return;
    sim.parancs({ fajta: 'epit', csapat: cs, tipus: EPULET.HAZ, x: hely.x, y: hely.y });
    this.epitDb[cs]++;
  }

  /**
   * SZABAD ÉPÍTÉSI HELY, az `epit` parancs koordináta-rendszerében.
   *
   * ⚠️ KÉT KOORDINÁTA-RENDSZER TALÁLKOZIK ITT, ÉS EZ MÁR EGYSZER MEG IS
   * BUKOTT. A `Sim._szabadEpuletHely()` a BAL-FELSŐ cellát adja vissza, az
   * `epit` parancs viszont a KÖZÉPPONTOT várja, és maga tolja vissza a sarokra
   * (`x - (méret >> 1)`). Ha a keresés eredményét nyersen adjuk át, a parancs
   * MÉG EGYSZER eltolja — a ház egy cellával feljebb-balra kerülne, ott pedig
   * jellemzően foglalt a hely, és a parancs CSENDBEN elvész.
   *
   * Mérve pontosan ez történt: a gép 12 000 tick alatt 100 építési parancsot
   * adott ki, és EGYETLEN ház épült meg belőle. A népesség-plafon végig 20-on
   * állt, a képzés minden körben elutasításba futott — a determinizmus-kapu
   * pedig mindeközben zöld volt, mert a semmittevés is reprodukálható.
   *
   * @returns {{x:number,y:number}|null} a parancsnak átadható KÖZÉPPONT
   */
  _epitesiHely(tipus, kx, ky) {
    const sarok = this.sim._szabadEpuletHely(tipus, kx, ky);
    if (!sarok) return null;
    const fel = EP_MERET[tipus] >> 1;
    return { x: sarok.x + fel, y: sarok.y + fel };
  }

  /**
   * MUNKÁS KÉPZÉSE a célszámig. A már SORBAN álló munkásokat is beleszámoljuk,
   * különben a gép minden körben újra sorba állítana, és a sor pillanatok
   * alatt betelne olyan munkásokkal, akikre már nincs is szükség — a
   * nyersanyag pedig a sorbaálláskor megy le, tehát vissza sem jönne.
   */
  _munkastKepez(cs, kozp) {
    const sim = this.sim;
    const e = sim.egysegek;
    let munkas = 0;
    for (let i = 0; i < e.db; i++) {
      if (e.csapat[i] === cs && e.tipus[i] === TIPUS.MUNKAS && sim.harc.elo[i]) munkas++;
    }
    munkas += sim.kepzes.sorbanTipus(kozp, TIPUS.MUNKAS);
    if (munkas >= MUNKAS_CEL[this.nehezseg[cs]]) return;
    sim.parancs({ fajta: 'kepzes', csapat: cs, epulet: kozp, egyseg: TIPUS.MUNKAS });
    this.kepzesDb[cs]++;
  }

  /** Olvasható pillanatkép a HUD-nak és a szondának. */
  osszesites(csapat) {
    return {
      aktiv: this.aktiv[csapat] === 1,
      nehezseg: this.nehezseg[csapat],
      dontes: this.dontesDb[csapat],
      gyujt: this.gyujtDb[csapat],
      epit: this.epitDb[csapat],
      kepzes: this.kepzesDb[csapat],
    };
  }
}
