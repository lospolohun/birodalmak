// AGE OF THE CRYSTALS — PARANCS-ÁLLAPOT: állások, célzás, támadó-menet.
//
// ── MIÉRT KÜLÖN FÁJL, ÉS MIÉRT NEM A `units.js`-BEN ───────────────────────
// A `units.js` egyetlen kérdésre felel: hogyan MOZOG egy egység, ha van hova.
// Az, hogy MIÉRT megy oda — parancsot kapott, ellenséget látott, vagy épp
// visszatér az őrhelyére — másik réteg. A kettő szétvágva marad olvasható, és
// a `units.js` mozgás-magja érintetlen maradhatott a v0.2-ben is.
//
// Ez a réteg SoA-ban tárol, ugyanúgy, mint az egységek: index-párhuzamos
// tipizált tömbök, nulla objektum egységenként.
//
// ── A TICK SORRENDJE ──────────────────────────────────────────────────────
// A `Sim.lep()` így fut:
//
//   1. parancs-sor           — a ticket elérő parancsok végrehajtása
//   2. hasítótábla építés    — `Egysegek._hasitoEpit()`
//   3. EZ A RÉTEG            — célzás és állás-logika  ← itt tartunk
//   4. sebességek + mozgatás — `Egysegek._sebessegek/_mozgat`
//
// A 3. azért van a 2. UTÁN, mert a célkeresés a térbeli hasítótáblát olvassa,
// és azért a 4. ELŐTT, mert amit itt eldöntünk (kit üldöz, hol áll meg), annak
// már ebben a tickben hatnia kell a sebességre.
//
// ── DETERMINIZMUS ─────────────────────────────────────────────────────────
// A célkeresés a vödröket RÖGZÍTETT sorrendben járja be, és döntetlennél
// (azonos négyzetes távolság) MINDIG a kisebb egység-index nyer. Nincs `Math`
// transzcendens, nincs véletlen, nincs valós idő. Az itt tárolt mezők a
// `Sim.allapotHash()` részei — egy elcsúszott célpont ugyanúgy desync, mint egy
// elcsúszott koordináta, tehát a szondának látnia kell.
//
// ── EZ A RÉTEG NEM SEBEZ ──────────────────────────────────────────────────
// Itt dől el, KIRE támad az egység és MEDDIG megy el érte; hogy MENNYIT sebez,
// az a `harc.js` dolga (v0.4 óta), és a tickben közvetlenül ezután fut. A két
// kérdés szétvágva marad kezelhető: a célzás a térbeli hasítótáblával és az
// állásokkal dolgozik, a sebzés a páncél- és ellensúly-táblákkal.
//
// A hatótávolság viszont KÖZÖS: a `harc.js` `HATOTAV` tábláját olvassuk, mert
// ha a megállási küszöb és a sebzési hatótáv elcsúszna, az íjász vagy túl közel
// menne, vagy lőtávon kívül állna meg.

import { fxHossz, fxAtan2 } from './fx.js';
import { ALLAPOT } from './units.js';
import { ALAKZAT } from './alakzat.js';
import { HATOTAV } from './harc.js';

/** Mit csinál éppen az egység — a PARANCS szintjén (nem a mozgás szintjén). */
export const PARANCS = {
  NINCS: 0,          // nincs élő parancsa
  MENET: 1,          // menet egy pontra, ellenséggel nem foglalkozik
  TAMADO_MENET: 2,   // menet egy pontra, útközben ellenséget keres
  TARTAS: 3,         // helyben marad, csak a hatósugarába lépőre reagál
  BESZALLAS: 4,      // egy saját épület felé tart, hogy beszálljon (v0.4)
};

/**
 * Állás (stance) — ez dönti el, MENNYIRE megy bele a harcba magától.
 * A `TARTAS` parancs és a `TARTAS` állás nem ugyanaz: az egyik egyszeri
 * utasítás, a másik tartós beállítás. Együtt is használhatók.
 */
export const ALLAS = {
  AGRESSZIV: 0,   // meglátja, üldözi, nem tér vissza
  VEDEKEZO: 1,    // üldözi, de a kötélhossznál visszafordul az őrhelyére
  TARTAS: 2,      // nem mozdul; csak arra reagál, aki hatósugárba lép
  TUZSZUNET: 3,   // nem támad senkit, akkor sem, ha rálépnek
};

export const ALLAS_NEV = ['agresszív', 'védekező', 'tartás', 'tűzszünet'];

/**
 * Meddig VESZ ÉSZRE egy egység ellenséget.
 *
 * ⚠️ EZ TELJESÍTMÉNY-DÖNTÉS IS, NEM CSAK JÁTÉKÉRZET. A célkeresés a `units.js`
 * térbeli hasítótábláját olvassa, aminek a cellamérete 2,0 világegység. Egy R
 * sugarú kereséshez `ceil(R/2)` cella-gyűrűt kell bejárni minden irányban:
 *   R = 3,9 → 2 gyűrű → 5×5 = 25 vödör
 *   R = 4,1 → 3 gyűrű → 7×7 = 49 vödör   (majdnem kétszeres költség!)
 * A 3,9 pont a küszöb alatt van. Ha ezt emeled, a vödör-szám UGRIK — előbb mérd.
 */
const LATOTAV_ALAP = 3.9;

/**
 * LÁTÓTÁV TÍPUSONKÉNT (v0.4). Az íjász hatótávja 6,0 — ha a látótáv maradt
 * volna egységesen 3,9, az íjász SOSEM szerzett volna célt a saját lőtávján
 * belül: odasétált volna 3,9-re, ahol viszont már a lándzsás is eléri.
 *
 * ⚠️ A vödör-költség a sugárral UGRIK (lásd fent): 3,9 → 25 vödör, 6,8 → 81.
 * Ezért CSAK az íjász kap nagy sugarat; a többi marad a 25-ösön. Az átlag így
 * ~39 vödör egységenként, és a 4/5-ös fázis-eltolással ez tickenként a sereg
 * ötödére jut. Ha új távolsági egység jön, itt kell mérlegelni, nem a
 * `HATOTAV`-nál.
 */
const LATOTAV = [LATOTAV_ALAP, LATOTAV_ALAP, 6.8, LATOTAV_ALAP];
/**
 * Hiszterézis: a megszerzett célt ennyiszer messzebbig tartjuk, mint amekkorán
 * megszereztük. Enélkül a látótáv peremén tickenként rá-le kapcsolna.
 */
const ELENGED = [LATOTAV_ALAP * 1.6, LATOTAV_ALAP * 1.6, 6.8 * 1.35, LATOTAV_ALAP * 1.6];
/**
 * Ennél közelebb az egység „harcérintkezésben" van: megáll és szembefordul.
 *
 * ⚠️ v0.4 ÓTA TÍPUSFÜGGŐ, és a `harc.js` `HATOTAV` táblájából jön — EGY forrás,
 * két olvasó. Ha a célzás küszöbe és a sebzés hatótávja elcsúszna egymástól, az
 * íjász vagy odasétálna a lándzsás orra elé (és meghalna), vagy megállna
 * lőtávon kívül (és nem csinálna semmit). A `_tav()` a típus szerint felel.
 */
function tamadoTav(tipus) { return HATOTAV[tipus]; }
/** A védekező állás kötélhossza az őrhelytől. */
const KOTELEK = 7.0;
/**
 * Hány tickenként keres célt EGY egység. A fázis egységenként el van tolva
 * (`(tick + i) % P`), tehát tickenként a sereg ~1/5-e keres — ugyanaz a trükk,
 * mint a `units.js` szabad-egyenes vizsgálatánál.
 */
const CELZAS_PERIODUS = 5;

export class ParancsAllapot {
  /**
   * @param {number} maxDb ugyanaz a felső korlát, mint az `Egysegek`-nél
   * @param {import('./units.js').Egysegek} egysegek
   * @param {import('./sim.js').Sim} [sim] az épület-célzáshoz (v0.4)
   */
  constructor(maxDb, egysegek, sim) {
    this.maxDb = maxDb | 0;
    this.egysegek = egysegek;
    this.sim = sim || null;
    const m = this.maxDb;

    this.parancs = new Uint8Array(m);
    this.allas = new Uint8Array(m);
    /** Az egység által PREFERÁLT alakzat — a következő menetparancs ezt használja. */
    this.alakzat = new Uint8Array(m);
    /** A megszerzett célpont egység-indexe, vagy -1. */
    this.celEgyseg = new Int32Array(m);
    /**
     * A megcélzott ELLENSÉGES ÉPÜLET indexe, vagy -1 (v0.4).
     *
     * Külön mező, nem közös a `celEgyseg`-gel: az egység és az épület más
     * indextérben él, és egy közös mezőben az előjellel vagy eltolással
     * kódolás pont az a fajta trükk, amit egy desync-vadászat közben senki nem
     * akar visszafejteni. Két mező, egyértelmű jelentéssel.
     *
     * Az ÉLŐ ELLENSÉG MINDIG ELŐBBRE VALÓ: épületet csak akkor keresünk, ha
     * nincs elérhető katona. Enélkül a sereg falat verne, miközben hátba
     * támadják.
     */
    this.celEpulet = new Int32Array(m);

    // ── A VÉGSŐ úti cél, amit az üldözés nem írhat felül ──────────────
    // Támadó menetnél az egység útközben letér a célpontra. Ha csak a
    // `celX/celY`-t írnánk át, az EREDETI úti cél elveszne, és az ellenség
    // elengedése után az egység ott maradna, ahol épp volt. Ezért a parancs
    // végpontját külön tartjuk, és üldözés után ebből állítjuk vissza.
    this.vegX = new Float64Array(m);
    this.vegY = new Float64Array(m);
    this.vegMezo = new Int32Array(m);

    /** Őrhely — a védekező állás ide tér vissza a kötélhossz végén. */
    this.horgonyX = new Float64Array(m);
    this.horgonyY = new Float64Array(m);

    this.celEgyseg.fill(-1);
    this.celEpulet.fill(-1);
    this.vegMezo.fill(-1);
  }

  /**
   * Teljes nullázás — a `Sim.ujraFelallas()` hívja. MIÉRT KELL: a felállás
   * újrahasznosítja az egység-indexeket, tehát egy régi `celEgyseg` hirtelen egy
   * ÚJ, teljesen más egységre mutatna. A szonda lépcsői (100/400/800/1600) ezen
   * buknának el elsőként.
   * @param {number} db az új egységszám
   */
  nullaz(db) {
    const n = this.maxDb;
    this.parancs.fill(0);
    this.allas.fill(ALLAS.AGRESSZIV);
    this.alakzat.fill(ALAKZAT.NEGYZET);
    this.celEgyseg.fill(-1);
    this.celEpulet.fill(-1);
    this.vegMezo.fill(-1);
    const e = this.egysegek;
    for (let i = 0; i < n; i++) {
      this.vegX[i] = 0; this.vegY[i] = 0;
      this.horgonyX[i] = i < db ? e.px[i] : 0;
      this.horgonyY[i] = i < db ? e.py[i] : 0;
    }
  }

  /** Az őrhely felvétele a MOSTANI pozícióról (megállás, tartás, új felállás). */
  horgonyz(i) {
    const e = this.egysegek;
    this.horgonyX[i] = e.px[i];
    this.horgonyY[i] = e.py[i];
  }

  /**
   * EGY tick — célzás és állás-logika. A `Sim.lep()` hívja, a hasítótábla
   * felépítése UTÁN és a sebesség-számítás ELŐTT.
   * @param {number} tick
   */
  lep(tick) {
    const e = this.egysegek;
    const db = e.db;
    const px = e.px, py = e.py, csapat = e.csapat;
    // v0.4 — a halott nem célpont. A hasítótáblából már kimaradt, de a MÁR
    // MEGSZERZETT célt is el kell engedni, különben az egység egy hullára
    // meredve állna a csata végéig.
    const elo = e.elo;

    const bent = e.bent;
    for (let i = 0; i < db; i++) {
      if (elo && elo[i] === 0) continue;
      // A beszállásolt egység nincs a világban: se nem céloz, se nem mozog.
      if (bent && bent[i] === 1) continue;

      // ── BESZÁLLÁSOLÁS: külön ág, MINDEN más elé ─────────────────────
      // Aki épületbe tart, az nem áll meg harcolni útközben. Ez szándékos: a
      // beszállásolás jellemzően MENEKÜLÉS, és ha a katona a kapu előtt
      // megfordulna verekedni, a parancs pont a lényegét veszítené el.
      if (this.parancs[i] === PARANCS.BESZALLAS) {
        if (this._beszallasLep(i)) continue;
      }

      const allas = this.allas[i];

      // ── Tűzszünet: se célt nem tart, se újat nem keres ──────────────
      if (allas === ALLAS.TUZSZUNET) {
        if (this.celEgyseg[i] >= 0) this._celtElenged(i);
        this.celEpulet[i] = -1;
        continue;
      }

      const x = px[i], y = py[i];
      let cel = this.celEgyseg[i];

      // ── 1. A meglévő cél érvényessége ───────────────────────────────
      // Hiszterézis: a megszerzett célt NAGYOBB távolságig tartjuk, mint
      // amekkorán megszereztük. Enélkül a látótáv peremén álló ellenségre
      // tickenként rá-le kapcsolna, és az egység remegne.
      if (cel >= 0) {
        if (cel >= db || csapat[cel] === csapat[i] || (elo && elo[cel] === 0)) {
          cel = -1;
        } else {
          const d = fxHossz(px[cel] - x, py[cel] - y);
          if (d > ELENGED[e.tipus[i]]) cel = -1;
        }
        if (cel < 0) this.celEgyseg[i] = -1;
      }

      // ── 2. Célkeresés, ha nincs ─────────────────────────────────────
      if (cel < 0 && ((tick + i) % CELZAS_PERIODUS) === 0) {
        // Tartás-állásban csak arra reagálunk, aki BELÉP a hatósugárba —
        // vagyis a keresés sugara maga a harcérintkezés távolsága.
        const sugar = allas === ALLAS.TARTAS ? tamadoTav(e.tipus[i]) : LATOTAV[e.tipus[i]];
        // A tűzszünetet fent már kizártuk; a menet-parancs viszont
        // szándékosan VAK: aki `menet`-et kapott, az megy, nem harcol.
        if (this.parancs[i] !== PARANCS.MENET) {
          cel = this._keres(i, x, y, csapat[i], sugar, db);
          this.celEgyseg[i] = cel;
        }
      }

      // ── 3. Viselkedés a cél alapján ─────────────────────────────────
      if (cel >= 0) {
        const dx = px[cel] - x, dy = py[cel] - y;
        const d = fxHossz(dx, dy);

        if (d <= tamadoTav(e.tipus[i])) {
          // Harcérintkezés: megáll és SZEMBEFORDUL. A sebességet a
          // `units.js` nullázza minden nem-MEGY állapotra.
          e.allapot[i] = ALLAPOT.HARCOL;
          if (dx !== 0 || dy !== 0) e.szog[i] = fxAtan2(dy, dx);
          continue;
        }

        // Üldözzük-e? Ez az állás és a parancs közös döntése.
        let uldoz = false;
        if (this.parancs[i] === PARANCS.TAMADO_MENET) uldoz = true;
        else if (allas === ALLAS.AGRESSZIV) uldoz = true;
        else if (allas === ALLAS.VEDEKEZO) {
          const hd = fxHossz(x - this.horgonyX[i], y - this.horgonyY[i]);
          uldoz = hd < KOTELEK;
        }
        // ALLAS.TARTAS: sosem üldöz — ha kilépett a hatósugárból, elengedi.

        if (uldoz) {
          // Egyenes vonalú üldözés, áramlási mező NÉLKÜL. Ez szándékos: a cél
          // legfeljebb az elengedési távolságon belül van, arra a mező-számítás (egy teljes
          // Dijkstra) pazarlás lenne — pont az a hiba, ami a v0.1-ben 40 ms-os
          // tickeket okozott. Ha akadály kerül közé, a `units.js` fal-csúsztatása
          // viszi tovább, és a következő célkeresés úgyis újraértékel.
          e.celX[i] = px[cel];
          e.celY[i] = py[cel];
          e.mezoId[i] = -1;
          e.egyenes[i] = 1;
          e.allapot[i] = ALLAPOT.MEGY;
          continue;
        }

        // Nem üldözünk: elengedjük a célt, és a lenti ág dönt a folytatásról.
        this.celEgyseg[i] = -1;
        cel = -1;
      }

      // ── 3/b. Nincs élő ellenség: van-e ellenséges ÉPÜLET? ───────────
      // Csak támadó menetben és csak agresszív/védekező állásban — a `menet`
      // szándékosan vak, a tartás pedig nem indul sehova.
      if (this.parancs[i] === PARANCS.TAMADO_MENET
        && (allas === ALLAS.AGRESSZIV || allas === ALLAS.VEDEKEZO)) {
        if (this._epuletCel(i, x, y, tick)) continue;
      } else {
        this.celEpulet[i] = -1;
      }

      // ── 4. Cél nélkül: vissza a parancs szerinti dolgunkra ──────────
      this._parancsFolytat(i, x, y);
    }
  }

  /**
   * Beszállásolás felé tartó egység egy tickje.
   * @returns {boolean} igaz, ha az ág elintézte az egységet
   */
  _beszallasLep(i) {
    const sim = this.sim;
    const e = this.egysegek;
    if (!sim) return false;
    const ep = this.celEpulet[i];
    // Az épület elpusztult, elfogyott a férőhely, vagy nem a miénk → a parancs
    // értelmét vesztette; visszaesünk a szokásos viselkedésre.
    if (ep < 0 || !sim.epuletek.kesz(ep) || !sim.beszallas.ferohely(ep)) {
      this.parancs[i] = PARANCS.NINCS;
      this.celEpulet[i] = -1;
      return false;
    }
    if (sim.beszallas.belephet(i, ep)) {
      sim.beszallas.be(i, ep);
      this.parancs[i] = PARANCS.NINCS;
      this.celEpulet[i] = -1;
      return true;
    }
    // Még úton: a végpontot minden tickben ráigazítjuk az épületre. Rövid táv,
    // ezért egyenes vonal — mint az üldözésnél.
    e.celX[i] = sim.epuletek.x[ep];
    e.celY[i] = sim.epuletek.y[ep];
    e.egyenes[i] = 1;
    e.allapot[i] = ALLAPOT.MEGY;
    return true;
  }

  /**
   * ÉPÜLET-CÉLPONT keresése és megközelítése.
   *
   * A megközelítési távolság a hatótáv PLUSZ az épület fél átmérője: az épület
   * a KÖZÉPPONTJÁVAL van nyilvántartva, de a fala már korábban kezdődik. E
   * nélkül egy 3×3-as központot a közelharci egység sosem érne el — beleállna
   * a falába, és a hatótáv-vizsgálat a középponthoz mérve elbukna.
   *
   * @returns {boolean} igaz, ha van épület-célja (és a hívó ne menjen tovább)
   */
  _epuletCel(i, x, y, tick) {
    const e = this.egysegek;
    const ep = this.sim ? this.sim.epuletek : null;
    if (!ep) return false;

    let cel = this.celEpulet[i];
    if (cel >= 0 && (!ep.el(cel) || ep.csapat[cel] === e.csapat[i])) cel = -1;
    if (cel < 0 && ((tick + i) % CELZAS_PERIODUS) === 0) {
      cel = ep.legkozelebbiEllenseges(e.csapat[i], x, y, LATOTAV[e.tipus[i]] * 2);
    }
    this.celEpulet[i] = cel;
    if (cel < 0) return false;

    const felAtmero = 0.5 * (ep.meret ? ep.meret(cel) : 1) + 0.2;
    const hat = tamadoTav(e.tipus[i]) + felAtmero;
    const dx = ep.x[cel] - x, dy = ep.y[cel] - y;
    const d = fxHossz(dx, dy);
    if (d <= hat) {
      e.allapot[i] = ALLAPOT.HARCOL;
      if (dx !== 0 || dy !== 0) e.szog[i] = fxAtan2(dy, dx);
      return true;
    }
    // Odamegyünk. Rövid táv, egyenes vonal — mint az egység-üldözésnél.
    e.celX[i] = ep.x[cel];
    e.celY[i] = ep.y[cel];
    e.mezoId[i] = -1;
    e.egyenes[i] = 1;
    e.allapot[i] = ALLAPOT.MEGY;
    return true;
  }

  /**
   * Cél nélküli egység: vagy megy tovább az eredeti úti célra, vagy — védekező
   * állásban, a kötélhosszon túl — visszasétál az őrhelyére.
   */
  _parancsFolytat(i, x, y) {
    const e = this.egysegek;
    const p = this.parancs[i];

    if (p === PARANCS.MENET || p === PARANCS.TAMADO_MENET) {
      // Az üldözés felülírhatta a `celX/celY`-t — állítsuk vissza a parancs
      // valódi végpontját. Csak akkor, ha tényleg eltér: a fölösleges írás
      // hamis „megy" állapotot adna egy már megérkezett egységnek.
      if (e.celX[i] !== this.vegX[i] || e.celY[i] !== this.vegY[i]) {
        e.celX[i] = this.vegX[i];
        e.celY[i] = this.vegY[i];
        e.mezoId[i] = this.vegMezo[i];
        e.egyenes[i] = 0;   // a következő vizsgálat úgyis eldönti
        e.allapot[i] = ALLAPOT.MEGY;
      } else if (e.allapot[i] === ALLAPOT.HARCOL) {
        // Kiesett a harcból, de a végpontján áll — nincs hova mennie.
        e.allapot[i] = ALLAPOT.ALL;
      }
      return;
    }

    // TARTÁS parancs, vagy nincs parancs.
    if (this.allas[i] === ALLAS.VEDEKEZO) {
      const hd = fxHossz(x - this.horgonyX[i], y - this.horgonyY[i]);
      if (hd > tamadoTav(e.tipus[i])) {
        // Vissza az őrhelyre. Rövid táv, tehát itt is egyenes vonal elég.
        e.celX[i] = this.horgonyX[i];
        e.celY[i] = this.horgonyY[i];
        e.mezoId[i] = -1;
        e.egyenes[i] = 1;
        e.allapot[i] = ALLAPOT.MEGY;
        return;
      }
    }
    if (e.allapot[i] === ALLAPOT.HARCOL) e.allapot[i] = ALLAPOT.ALL;
  }

  /** A cél elengedése — a mozgás-állapotot nem bántja, azt a hívó rendezi. */
  _celtElenged(i) {
    this.celEgyseg[i] = -1;
    const e = this.egysegek;
    if (e.allapot[i] === ALLAPOT.HARCOL) e.allapot[i] = ALLAPOT.ALL;
  }

  /**
   * A LEGKÖZELEBBI ellenség egy sugáron belül, a térbeli hasítótáblából.
   *
   * A táblát a `units.js` építi fel ugyanebben a tickben, közvetlenül ezelőtt.
   * Ugyanaz a sim-réteg, ezért olvassuk közvetlenül — a mezők a konstruktorban
   * készülnek el és sosem cserélődnek ki, tehát a hivatkozás nem avul el.
   *
   * Döntetlennél (bitre azonos négyzetes távolság) a KISEBB index nyer. Ez nem
   * szépészeti kérdés: két egymásra tükrözött sereg tele van pontosan azonos
   * távolságokkal, és e nélkül a szabály nélkül a bejárási sorrend döntene.
   *
   * @returns {number} egység-index, vagy -1
   */
  _keres(i, x, y, sajatCsapat, sugar, db) {
    const e = this.egysegek;
    const szel = e.hSzel, cm = e.hCella;
    const szam = e._hSzam, elem = e._hElem;
    const px = e.px, py = e.py, csapat = e.csapat;

    let gx = (x / cm) | 0, gy = (y / cm) | 0;
    if (gx < 0) gx = 0; else if (gx >= szel) gx = szel - 1;
    if (gy < 0) gy = 0; else if (gy >= szel) gy = szel - 1;
    const gyuru = Math.ceil(sugar / cm) | 0;
    const hatar2 = sugar * sugar;

    let legjobb = -1;
    let legjobbD2 = hatar2;

    for (let oy = -gyuru; oy <= gyuru; oy++) {
      const ny = gy + oy;
      if (ny < 0 || ny >= szel) continue;
      for (let ox = -gyuru; ox <= gyuru; ox++) {
        const nx = gx + ox;
        if (nx < 0 || nx >= szel) continue;
        const vodor = ny * szel + nx;
        const kezd = szam[vodor], veg = szam[vodor + 1];
        for (let k = kezd; k < veg; k++) {
          const j = elem[k];
          if (j === i || j >= db) continue;
          if (csapat[j] === sajatCsapat) continue;
          const ddx = px[j] - x, ddy = py[j] - y;
          const d2 = ddx * ddx + ddy * ddy;
          // `<` és nem `<=`: döntetlennél a KORÁBBAN talált marad. A vödrökbe
          // növekvő index szerint szórunk, de a vödrök bejárása nem index-
          // sorrend — ezért az egyezésnél külön az indexet nézzük.
          if (d2 < legjobbD2 || (d2 === legjobbD2 && legjobb >= 0 && j < legjobb)) {
            legjobbD2 = d2;
            legjobb = j;
          }
        }
      }
    }
    return legjobb;
  }
}
