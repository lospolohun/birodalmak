// AGE OF THE CRYSTALS — MUNKÁS-AI (gyűjtés → szállítás → lerakás → vissza).
//
// ── AZ ÁLLAPOTGÉP ─────────────────────────────────────────────────────────
//
//   NINCS ──gyujt parancs──► MEGY_LELOHELYRE ──megérkezett──► GYUJT
//                                   ▲                            │ megtelt
//                                   │                            ▼
//                              lerakta ◄── MEGY_LERAKATRA ◄──────┘
//
// A kör magától zárul: a lerakás után a munkás VISSZAMEGY ugyanoda. A játékos
// egyetlen parancsot ad, és attól kezdve dolgozik — ez a „munkás-AI" a v0.3-ban.
//
// ── AZ ÚTKERESÉS CSAPDÁJA, MÁSODSZOR ──────────────────────────────────────
// A v0.1-ben azért ugrott 40 ms-ra a tick, mert minden egység a SAJÁT
// végpontjára kért áramlási mezőt, és a 8 elemű gyorstár csapkodott. A
// munkás-AI ugyanebbe a csapdába sétálna bele, csak rosszabbul: 400 munkás, két
// külön úti céllal (lelőhely és lerakat), másodpercenként váltogatva.
//
// A megoldás ugyanaz a szabály, két irányban:
//
//   ODAFELÉ    a `gyujt` parancs EGY mezőt kér a kattintott pontra, és minden
//              munkás azt kapja. A saját lelőhelye csak a VÉGPONTJA — ugyanaz a
//              minta, mint az alakzatnál a v0.2-ben.
//   VISSZAFELÉ a mező kulcsa a LERAKAT cellája. Épületből néhány van, tehát a
//              `MezoTar` magától összevonja: száz munkás egy mezőn osztozik.
//
// Így a mezők száma az ÚTI CÉLOK számával nő, nem a munkásokéval. A
// determinizmus-szonda 4. vizsgálata ezt méri (`kiszámolt áramlási mező`); ha az
// a szám elszáll, ez a szabály sérült.
//
// ── MIÉRT EGÉSZ SZÁMLÁLÓ A GYŰJTÉS ────────────────────────────────────────
// A gyűjtési sebesség nem egész (nem 1 fa/tick), és lebegőpontos összeadásból
// tízezer tick alatt gépenként más maradék jönne. Ezért minden munkásnak van egy
// EGÉSZ „óra"-számlálója: tickenként `UTEM[fajta]`-val nő, és minden teljes
// 100-nál esik le egy egységnyi nyersanyag. Bitre reprodukálható.

import { fxHossz } from './fx.js';
import { ALLAPOT, TIPUS } from './units.js';
import { NYERS } from './eroforras.js';

export const MUNKA = {
  NINCS: 0,
  MEGY_LELOHELYRE: 1,
  GYUJT: 2,
  MEGY_LERAKATRA: 3,
};

/** Mennyit bír el egy munkás. Ennyivel indul vissza a lerakathoz. */
const KAPACITAS = 10;
/**
 * Gyűjtési ütem századokban: tickenként ennyivel nő az óra, és minden 100-nál
 * esik le EGY egységnyi nyersanyag. 12 → ~1 egység / 8,3 tick ≈ 2,4 / mp.
 */
const UTEM = [12, 10, 8, 9];
/**
 * Ennél közelebb az ÁLLÓHELYÉHEZ a munkás megérkezettnek számít.
 *
 * ⚠️ AZ ÁLLÓHELYHEZ MÉRÜNK, NEM A LELŐHELY KÖZEPÉHEZ. Az első változat a
 * lelőhely középpontjától mért, és ez MEGBUKOTT: a munkás egy SZOMSZÉD cellára
 * áll, ami átlósan 1,41 távolságra van, plusz a megérkezési tűrés (0,55) és a
 * szeparáció lökdösődése — együtt bőven 1,7 fölött. A munkás megállt a helyén,
 * a vizsgálat mégis azt mondta, „még nem ért oda", és az állapotgép örökké
 * újraindította. Mérve: 400 munkásból 285 ragadt be, kettő gyűjtött.
 *
 * A `units.js` megérkezési tűrése 0,55; az 1,5 ezen felül elbírja azt is, hogy a
 * szomszédok kicsit kitolják a helyéről.
 */
const ERKEZETT = 1.5;
/** Ennyire elsodródva már vissza kell mennie a helyére. */
const ELSODRODOTT = 3.2;
/** Ennyi sikertelen megközelítés után másik lelőhelyet keres. */
const MAX_PROBA = 4;
/**
 * PANGÁS-ÉRZÉKELÉS. Ennyi tickenként megnézzük, KÖZELEBB került-e a munkás a
 * céljához, és ha nem, az egy sikertelen próbálkozás.
 *
 * ⚠️ MIÉRT NEM ELÉG A „megállt-e" VIZSGÁLAT: a beragadt egység nem áll meg. A
 * `units.js` fal-csúsztatása oldalazni engedi, tehát végig `MEGY` állapotban
 * marad, miközben ezredegységeket halad. Mérve: 800 tick, 0,01 világegység — és
 * a `probal` számláló egyszer sem lépett, mert az egység formálisan „úton" volt.
 * A haladást tehát MÉRNI kell, nem az állapotból következtetni rá.
 */
const PANGAS_KOZ = 40;
/** Ennyivel kell közelebb kerülnie `PANGAS_KOZ` tick alatt, hogy haladásnak számítson. */
const PANGAS_HALADAS = 0.6;
/** Ha a lelőhely kimerült, ekkora sugárban keresünk másikat ugyanabból. */
const UJRA_SUGAR = 14;

export class Munkasok {
  /**
   * @param {number} maxDb
   * @param {import('./sim.js').Sim} sim
   */
  constructor(maxDb, sim) {
    this.maxDb = maxDb | 0;
    this.sim = sim;
    const m = this.maxDb;

    this.allapot = new Uint8Array(m);
    /** A megcélzott lelőhely, vagy -1. */
    this.celNode = new Int32Array(m);
    /** A megcélzott lerakat, vagy -1. */
    this.celEpulet = new Int32Array(m);
    /** Mit és mennyit cipel. */
    this.cipelFajta = new Uint8Array(m);
    this.cipelDb = new Int32Array(m);
    /**
     * Újrahasznált jelölt-tömb az elakadás utáni lelőhely-kereséshez. Előre
     * lefoglalva, mert a `lep()` forró út — nulla per-tick allokáció.
     */
    this._jeloltek = [];
    /** Az egész gyűjtő-óra (lásd a fejlécet). */
    this.ora = new Int32Array(m);
    /**
     * A csoportos áramlási mező a LELŐHELY felé — a `gyujt` parancs adja, és
     * minden munkás ugyanazt kapja. Nélküle munkásonként egy mező kellene.
     */
    this.nodeMezo = new Int32Array(m);
    /**
     * A munkás SAJÁT állóhelye (a lelőhely vagy az épület mellett). Minden
     * megérkezés-vizsgálat ehhez mér — lásd az `ERKEZETT` indoklását.
     */
    this.alloX = new Float64Array(m);
    this.alloY = new Float64Array(m);
    /** Hányszor próbált már odaérni. Ez töri meg a beragadást. */
    this.probal = new Uint8Array(m);
    /** A cél távolsága a legutóbbi pangás-méréskor — ebből látszik a haladás. */
    this.utolsoTav = new Float64Array(m);

    this.celNode.fill(-1);
    this.celEpulet.fill(-1);
    this.nodeMezo.fill(-1);

    /** Újrahasznált kimenő pont — nulla allokáció tickenként. */
    this._p = { x: 0, y: 0 };
  }

  nullaz() {
    this.allapot.fill(MUNKA.NINCS);
    this.celNode.fill(-1);
    this.celEpulet.fill(-1);
    this.cipelFajta.fill(0);
    this.cipelDb.fill(0);
    this.ora.fill(0);
    this.nodeMezo.fill(-1);
    this.alloX.fill(0);
    this.alloY.fill(0);
    this.probal.fill(0);
    this.utolsoTav.fill(0);
  }

  /**
   * Halad-e a munkás a célja felé? `PANGAS_KOZ` tickenként fut, egységenként
   * ELTOLT fázisban — így tickenként a sereg 1/40-e mér, nem mindenki egyszerre.
   * @returns {boolean} igaz, ha PANG (nem halad)
   */
  _pang(i, tav, tick) {
    if (((tick + i) % PANGAS_KOZ) !== 0) return false;
    const elozo = this.utolsoTav[i];
    this.utolsoTav[i] = tav;
    // Az első mérésnek nincs mihez viszonyítania.
    if (elozo === 0) return false;
    return tav > elozo - PANGAS_HALADAS;
  }

  /** Munkára fogás — a `gyujt` parancs hívja, munkásonként. */
  megbiz(i, node, mezoId) {
    this.celNode[i] = node;
    this.nodeMezo[i] = mezoId;
    this.allapot[i] = MUNKA.MEGY_LELOHELYRE;
    this._indulLelohelyre(i);
  }

  /** Leállítás — az `allj`/`tartas`/`menet` parancsok hívják. */
  elenged(i) {
    this.allapot[i] = MUNKA.NINCS;
    this.celNode[i] = -1;
    this.celEpulet[i] = -1;
    this.nodeMezo[i] = -1;
    this.ora[i] = 0;
    this.probal[i] = 0;
    // A cipelt rakományt MEGTARTJA: ha később újra munkába áll, leadja. Így a
    // félbeszakítás nem tüntet el nyersanyagot — a gazdaság egyirányú marad.
  }

  /**
   * EGY tick. A `Sim.lep()` hívja, a hasítótábla után és a sebességek előtt —
   * ugyanott, ahol a `ParancsAllapot`.
   */
  lep(tick) {
    const sim = this.sim;
    const e = sim.egysegek;
    const db = e.db;
    const ef = sim.eroforrasok;

    for (let i = 0; i < db; i++) {
      const a = this.allapot[i];
      if (a === MUNKA.NINCS) continue;
      if (e.tipus[i] !== TIPUS.MUNKAS) { this.elenged(i); continue; }

      if (a === MUNKA.MEGY_LELOHELYRE) {
        const node = this.celNode[i];
        if (!ef.el(node)) { this._ujLelohely(i); continue; }
        const d = fxHossz(this.alloX[i] - e.px[i], this.alloY[i] - e.py[i]);
        if (d <= ERKEZETT) {
          this.allapot[i] = MUNKA.GYUJT;
          this.probal[i] = 0;
          this.utolsoTav[i] = 0;
          e.allapot[i] = ALLAPOT.ALL;
          e.vx[i] = 0; e.vy[i] = 0;
        } else if (e.allapot[i] !== ALLAPOT.MEGY || this._pang(i, d, tick)) {
          // Megállt vagy nem halad: elakadt, vagy a helyét elfoglalták.
          // Az újrapróbálkozás MÁSIK állóhelyet ad ugyanannál a lelőhelynél
          // (a `probal` beleszámít a változatba), néhány kudarc után pedig
          // másik lelőhelyet keresünk — enélkül egy elérhetetlen cella örökre
          // lekötne egy munkást.
          // ⚠️ A LELŐHELYET KI KELL ZÁRNI. A komment fölötte a v0.3 óta ezt
          // ígéri, a kód viszont nem tartotta be: a `_ujLelohely` a RÉGI
          // lelőhely koordinátáiból keresett, és a legközelebbi találat maga a
          // régi lelőhely lett. A munkás visszakapta ugyanazt az elérhetetlen
          // célt, a `probal` nullázódott, és a kör újraindult — ÖRÖKRE.
          //
          // Mérve (v0.6/2): a nehéz gép mind a HAT étel-munkása ugyanazon a
          // 23,8 egységre lévő, elérhetetlen lelőhelyen ragadt, és 12 000 tick
          // alatt 60 ételt hozott be 890 fa mellett. Étel nélkül nincs képzés:
          // 663 képzési parancsból 658 elutasításba futott. A determinizmus-
          // kapu végig zöld volt — egy livelock tökéletesen reprodukálható.
          if (++this.probal[i] > MAX_PROBA) { this.probal[i] = 0; this._ujLelohely(i, node); }
          else this._indulLelohelyre(i);
        }
        continue;
      }

      if (a === MUNKA.GYUJT) {
        const node = this.celNode[i];
        if (!ef.el(node)) { this._ujLelohely(i); continue; }
        const fajta = ef.fajta[node];
        // Ha közben elsodródott (a szeparáció eltolta), menjen vissza a helyére.
        if (fxHossz(this.alloX[i] - e.px[i], this.alloY[i] - e.py[i]) > ELSODRODOTT) {
          this.allapot[i] = MUNKA.MEGY_LELOHELYRE;
          this._indulLelohelyre(i);
          continue;
        }
        // A gyűjtés üteme a technológiából jön (v0.5/4). Egész osztás — az
        // ekevas +25 %-a minden gépen ugyanazt a számot adja.
        // ⚠️ KÉT KÜLÖN EGÉSZ OSZTÁS, RÖGZÍTETT SORRENDBEN: előbb a technológia,
        // utána a civ. Egyetlen összevont szorzó (`tech% * civ% / 10000`) MÁS
        // számot adna a levágások miatt, és a sorrend felcserélése is — a
        // determinizmushoz nem elég, hogy egész legyen, az is kell, hogy
        // MINDIG UGYANÚGY számoljuk.
        const cs = e.csapat[i];
        let utem = ((UTEM[fajta] * sim.technologia.utemSzazalek(cs)) / 100) | 0;
        utem = ((utem * sim.civ.utemSzazalek(cs, fajta)) / 100) | 0;
        this.ora[i] += utem;
        const kap = KAPACITAS + sim.technologia.cipelTobblet(cs) + sim.civ.cipelTobblet(cs);
        while (this.ora[i] >= 100) {
          const vett = ef.kitermel(node, 1);
          this.ora[i] -= 100;
          if (vett === 0) break;
          // Rakomány-váltás: ha mást cipelt, azt eldobja. A v0.3-ban egy munkás
          // egyszerre egyfélét visz — ez az AoE-hagyomány, és a lerakás így
          // egyetlen fajtára megy, nem kell négyfelé bontani.
          if (this.cipelDb[i] > 0 && this.cipelFajta[i] !== fajta) this.cipelDb[i] = 0;
          this.cipelFajta[i] = fajta;
          this.cipelDb[i]++;
          if (this.cipelDb[i] >= kap) break;
        }
        if (this.cipelDb[i] >= kap) this._indulLerakatra(i);
        else if (!ef.el(node)) this._ujLelohely(i);
        continue;
      }

      // MEGY_LERAKATRA
      const ep = this.celEpulet[i];
      const epuletek = sim.epuletek;
      if (ep < 0 || !epuletek.kesz(ep) || epuletek.csapat[ep] !== e.csapat[i]) {
        this._indulLerakatra(i);
        continue;
      }
      const d = fxHossz(this.alloX[i] - e.px[i], this.alloY[i] - e.py[i]);
      if (d <= ERKEZETT) {
        if (this.cipelDb[i] > 0) {
          sim.gazdasag.ad(e.csapat[i], this.cipelFajta[i], this.cipelDb[i]);
          this.cipelDb[i] = 0;
        }
        this.probal[i] = 0;
        this.utolsoTav[i] = 0;
        // Vissza a lelőhelyre — ha az közben kimerült, keres másikat.
        this.allapot[i] = MUNKA.MEGY_LELOHELYRE;
        if (!ef.el(this.celNode[i])) this._ujLelohely(i);
        else this._indulLelohelyre(i);
      } else if (e.allapot[i] !== ALLAPOT.MEGY || this._pang(i, d, tick)) {
        if (++this.probal[i] > MAX_PROBA) {
          // Nem ér oda ehhez a lerakathoz — a következő körben másikat keres.
          this.probal[i] = 0;
          this.celEpulet[i] = -1;
        }
        this._indulLerakatra(i);
      }
    }
  }

  /** Elindítás a lelőhely melletti SAJÁT állóhelyre, a CSOPORTOS mezővel. */
  _indulLelohelyre(i) {
    const sim = this.sim;
    const e = sim.egysegek;
    const node = this.celNode[i];
    // A változat-szám a munkás indexe: így a csoport körbeáll a lelőhelyen,
    // nem egy cellára tolong (lásd `Eroforrasok.allohely` indoklását).
    const hely = sim.eroforrasok.allohely(node, this._p, i + this.probal[i] * 3);
    if (!hely) { this._ujLelohely(i); return; }
    this.alloX[i] = hely.x; this.alloY[i] = hely.y;
    this.allapot[i] = MUNKA.MEGY_LELOHELYRE;
    e.menetparancs(i, hely.x, hely.y, this.nodeMezo[i]);
  }

  /**
   * Elindítás a legközelebbi lerakathoz.
   *
   * ── A KÉT KÜLÖNBÖZŐ ÁLLÓHELY, ÉS MIÉRT ────────────────────────────────
   * A MEZŐT a 0. változatra kérjük, a VÉGPONTOT viszont a munkás sajátjára.
   * Ez ugyanaz a szétvágás, mint az alakzatnál a v0.2-ben: egy közös mező viszi
   * oda az egész csapatot, és csak az utolsó pár lépés tér el egyénenként.
   * Ha a mezőt is egyénenként kérnénk, száz munkás száz mezőt igényelne, a 8
   * elemű gyorstár csapkodna, és visszakapnánk a v0.1-es 40 ms-os ticket.
   */
  _indulLerakatra(i) {
    const sim = this.sim;
    const e = sim.egysegek;
    const epuletek = sim.epuletek;
    let ep = this.celEpulet[i];
    if (ep < 0 || !epuletek.kesz(ep) || epuletek.csapat[ep] !== e.csapat[i]) {
      ep = epuletek.legkozelebbiLerako(e.csapat[i], e.px[i], e.py[i]);
    }
    if (ep < 0) {
      // Nincs hova lerakni: marad a lelőhelyen és tovább gyűjt, amíg épül egy
      // raktár. Nem áll le, mert akkor a játékos „megfagyott" munkásokat látna.
      this.celEpulet[i] = -1;
      this.allapot[i] = MUNKA.GYUJT;
      return;
    }
    this.celEpulet[i] = ep;
    this.allapot[i] = MUNKA.MEGY_LERAKATRA;

    // ⚠️ A `_p` EGYETLEN újrahasznált objektum, ezért a kanonikus állóhely
    // koordinátáit AZONNAL kimentjük — a második hívás felülírná.
    const kanon = epuletek.allohely(ep, this._p, 0);
    let mezoId = -1;
    if (kanon) {
      const ci = sim.racs.idx(kanon.x | 0, kanon.y | 0);
      if (ci >= 0 && sim.racs.jarhato[ci] === 1) mezoId = sim.mezoTar.kerj(ci, sim.tick);
    }
    const enyem = epuletek.allohely(ep, this._p, i + this.probal[i] * 7);
    if (!enyem) return;
    this.alloX[i] = enyem.x; this.alloY[i] = enyem.y;
    e.menetparancs(i, enyem.x, enyem.y, mezoId);
  }

  /** A lelőhely kimerült — keresünk másikat UGYANABBÓL a fajtából a közelben. */
  _ujLelohely(i, kizart = -1) {
    const sim = this.sim;
    const e = sim.egysegek;
    const ef = sim.eroforrasok;
    const regi = this.celNode[i];
    // A keresés közepe a RÉGI lelőhely, nem a munkás: így a csapat együtt marad
    // a fürtön, és nem szóródik szét a pályán az első kimerülésnél.
    const kx = regi >= 0 ? ef.x[regi] : e.px[i];
    const ky = regi >= 0 ? ef.y[regi] : e.py[i];
    const fajta = regi >= 0 ? ef.fajta[regi] : this.cipelFajta[i];
    let uj;
    if (kizart < 0) {
      uj = ef.keres(fajta, kx, ky, UJRA_SUGAR);
    } else {
      // ELAKADÁS miatt keresünk újat: a mostani lelőhelyet KI KELL HAGYNI,
      // különben ugyanazt kapjuk vissza (a keresés a saját koordinátájából
      // indul, tehát ő a legközelebbi találat). A `kornyek` gyűrűnkénti
      // sorrendben ad jelölteket, tehát az első NEM kizárt találat egyben a
      // legközelebbi is — és a sorrend gépfüggetlen.
      const jeloltek = this._jeloltek;
      jeloltek.length = 0;
      ef.kornyek(fajta, kx, ky, jeloltek, 16, UJRA_SUGAR);
      uj = -1;
      for (let k = 0; k < jeloltek.length; k++) {
        if (jeloltek[k] !== kizart) { uj = jeloltek[k]; break; }
      }
    }
    if (uj < 0) {
      // Elfogyott a környéken: ha van rakománya, vigye be, aztán álljon le.
      if (this.cipelDb[i] > 0) { this.celNode[i] = -1; this._indulLerakatra(i); }
      else this.elenged(i);
      return;
    }
    this.celNode[i] = uj;
    // ⚠️ ÚJ MEZŐ KELL — ÉS EZ A LEGDRÁGÁBB TANULSÁG EBBEN A FÁJLBAN.
    //
    // Az első változat itt `nodeMezo[i] = -1`-et írt, azzal az indoklással,
    // hogy a táv rövid (`UJRA_SUGAR`), tehát elég az egyenes vonal, és így
    // elkerüljük a v0.1-es „mező munkásonként" csapdát. Két hiba volt benne:
    //
    //   1. A TÁV NEM RÖVID. A keresés a RÉGI LELŐHELYBŐL indul, nem a
    //      munkásból — az új lelőhely 14 egységen belül van a RÉGIHEZ képest,
    //      a munkás viszont lehet 33 egységre tőle.
    //   2. HA AZ EGYENES VONAL ZÁRT, NINCS SEMMI. A `units.js` ilyenkor törli
    //      az `egyenes` jelzőt, és `mezoId = -1` mellett a munkásnak nem marad
    //      SEMMILYEN navigációja. Nem elakad — MEG SEM MOZDUL.
    //
    // Mérve (v0.6/2): egy munkás 3000 ticken át egyetlen század világegységet
    // sem mozdult (206,0 → 206,0), miközben a `probal` 0..4 között körözött, és
    // a lelőhelye 138 és 141 közt váltakozott. Hat étel-munkás állt így; a gép
    // 12 000 tick alatt 100 ételt gyűjtött 890 fa mellett, és a képzése
    // gyakorlatilag leállt.
    //
    // A megoldás UGYANAZ A MINTA, amit a `gyujt` parancs használ: a mező a
    // lelőhely melletti JÁRHATÓ cellára megy, nem a munkás állóhelyére. Így a
    // mezők száma a LELŐHELYEK számával nő, nem a munkásokéval — a v0.1-es
    // szabály sértetlen marad.
    const kozel = sim._jarhatoKozel(ef.x[uj], ef.y[uj]);
    const ci = sim.racs.idx(kozel.x | 0, kozel.y | 0);
    this.nodeMezo[i] = (ci >= 0 && sim.racs.jarhato[ci] === 1)
      ? sim.mezoTar.kerj(ci, sim.tick) : -1;
    this.probal[i] = 0;
    this.utolsoTav[i] = 0;
    this.allapot[i] = MUNKA.MEGY_LELOHELYRE;
    const hely = ef.allohely(uj, this._p, i);
    if (hely) {
      this.alloX[i] = hely.x; this.alloY[i] = hely.y;
      // A mezőt ADJUK ÁT: az egyenes vonal továbbra is gyorsítás marad (a
      // `units.js` 15 tickenként újraértékeli), de ha az zárt, van mire
      // visszaesni.
      e.menetparancs(i, hely.x, hely.y, this.nodeMezo[i]);
    }
  }

  /** Statisztika a jelentésekhez. */
  osszesites(csapat) {
    const e = this.sim.egysegek;
    let dolgozik = 0, cipel = 0;
    for (let i = 0; i < e.db; i++) {
      if (e.csapat[i] !== csapat || e.tipus[i] !== TIPUS.MUNKAS) continue;
      if (this.allapot[i] !== MUNKA.NINCS) dolgozik++;
      cipel += this.cipelDb[i];
    }
    return { dolgozik, cipel };
  }
}

export { NYERS };
