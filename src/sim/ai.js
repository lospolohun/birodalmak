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
import { TECH_DB, techEpulete } from './technologia.js';
import { EGYSEG_AR } from './kepzes.js';

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

// ── v0.6/2: BUILD ORDER ──────────────────────────────────────────────────
//
// PRIORITÁS-SOR, NEM ÜTEMTERV. A gép minden döntési körben végigmegy rajta, és
// az ELSŐ olyan tételt rendeli meg, amiből még nincs elég és amire telik. Ez a
// v0.5 szondájának mért tanulsága: az „körönként egy tétel" ütemterv elakadt,
// mert a drága elem elvitte a fát, és a mögötte állók nyolc körrel később
// megint nem fértek bele. Ami már áll, azt a darabszám-korlát ejti; amire nem
// telik, az a következő körben újra próbálkozik.
//
// A HÁROM SZINT ITT VÁLIK EL A LEGLÁTVÁNYOSABBAN. A könnyű gép egyetlen
// laktanyát húz fel, és megáll — a játékos ellene ki tud terjeszkedni. A nehéz
// gép három fegyvernemet nyit, tornyot rak és piacot épít, tehát a kőhöz is
// hozzáfér. Ez nem nehézségi szorzó, hanem MÁS JÁTÉK ugyanazokkal a szabályokkal.
const BUILD_ORDER = [
  // könnyű
  [EPULET.LAKTANYA],
  // közepes
  [EPULET.LAKTANYA, EPULET.IJASZDA, EPULET.PIAC],
  // nehéz
  [EPULET.LAKTANYA, EPULET.IJASZDA, EPULET.ISTALLO, EPULET.PIAC, EPULET.TORONY],
];

/**
 * HÁNY DARAB kell az adott típusból. Az index az `EPULET.*`, tehát az egész
 * roster benne van — ami 0, azt a gép sosem építi (a falat és a kaput a v0.6
 * még nem tudja értelmesen elhelyezni, az a v0.7 minimap/tereprendezés dolga).
 */
const EPULET_CEL = [
  1,  // KOZPONT — a kezdő, újat nem épít
  1,  // RAKTAR
  0, 0,
  99, // HAZ — a népesség-tartalék szabályozza, nem darabszám
  2,  // LAKTANYA
  1,  // IJASZDA
  1,  // ISTALLO
  0,  // OSTROMMUHELY — a v0.6/3 ostrom-döntéséig nem kell
  2,  // TORONY
  1,  // PIAC
];

/**
 * ÉPÜLET-HELYEK a központhoz képest, cellában. Fix eltolások: a bázisnak legyen
 * ALAKJA, ne egyetlen kupac. A `_szabadEpuletHely` spirálja innen indul, tehát
 * az ütközés magától feloldódik — az eltolás csak a kiindulást adja.
 */
const HELY_ELTOLAS = [
  [0, 0], [-8, 4], [0, 0], [0, 0],
  [5, -6],    // HAZ
  [8, 7],     // LAKTANYA
  [-8, 7],    // IJASZDA
  [8, -8],    // ISTALLO
  [-8, -8],   // OSTROMMUHELY
  [11, 0],    // TORONY
  [4, -12],   // PIAC
];

/** Hány katonát tart fenn a gép. A `99`-es ház-cél mellett ez a valódi plafon. */
const SEREG_CEL = [10, 20, 32];

/**
 * Hány technológiát kutat ki. A KÖNNYŰ gép EGYET SEM — és ez nem lustaság:
 * technológia nélkül a serege nyers alapértékeken harcol, tehát a játékos
 * ugyanannyi egységgel is nyer. A szintek közti különbség így nem szám-szorzó,
 * hanem az, hogy a gép mennyire használja ki a saját rendszereit.
 */
const KUTATAS_CEL = [0, 3, 6];

/**
 * Ennél hosszabb sorba nem rendel újat. A v0.6/1 mérése szerint a gép 198
 * képzési parancsot adott ki 15 munkásért — a fölösleg elutasításba futott.
 * A rövid sor egyben jobb JÁTÉK is: a termelés több épület közt oszlik el.
 */
const SOR_KORLAT = 2;

// ── v0.6/3: FELDERÍTÉS ÉS HADMŰVELET ─────────────────────────────────────
//
// ⚠️ A GÉP NEM OLVASHATJA KI, HOL AZ ELLENSÉG. Ez a fájl legfontosabb
// önkorlátozása, és pont azért kell leírni, mert a kód szintjén SEMMI nem
// akadályozná meg: az `epuletek` tömb ott van, egyetlen ciklus, és a gép
// pontosan tudná az ellenséges központ helyét a 0. ticktől.
//
// Miért nem tesszük: a v0.7 hozza a hadi ködöt, és ha a gép addig a teljes
// pályát látná, a köd bevezetése egy csapásra MEGVÁLTOZTATNÁ a viselkedését —
// egy „kész" AI-t kellene újraírni. Ennél is fontosabb viszont a játékos
// oldala: egy ellenfél, aki a bázisod helyét a semmiből tudja, nem nehéz,
// hanem IGAZSÁGTALAN, és a felderítés mint játékmechanika azonnal értelmét
// veszti.
//
// Ezért a gép SAJÁT tudást tart (`ismertX/ismertY`), amit csak úgy szerezhet
// meg, ahogy a játékos: valamelyik EGYSÉGE a látótávon belülre kerül egy
// ellenséges épülethez. A `_felderit` az egyetlen hely, ahol ez a tudás
// keletkezik.
/** Hány tickenként indít új felderítőt, ha az előző odaveszett. */
const FELDERITO_KOZ = [1200, 800, 500];

/**
 * Mekkora sereggel indul TÁMADÁS.
 *
 * ⚠️ A KÜSZÖB NEM LEHET NAGYOBB A `SEREG_CEL`-NÁL. Az első változatban a
 * könnyű gép 14-nél támadott, de csak 8 katonát képzett — vagyis a saját
 * célszámával SOHA nem érte volna el a küszöböt. Hogy mégis támadott, az
 * kizárólag a szonda kezdő felállásának volt köszönhető (15 katona
 * csapatonként): egyetlen hullámot indított az örökölt sereggel, aztán soha
 * többet. Ez a fajta ellentmondás két külön tömb között némán megél.
 *
 * Így viszont a három szint értelmes: a könnyű a teljes (kicsi) seregével
 * támad, a nehéz a nagy seregének kétharmadával, tehát otthon is marad
 * védelem. A nehéz később üt, de sokkal keményebben.
 *
 * ⚠️ A NEHEZEBB SZINT NEM LEHET PASSZÍVABB. A második változat 22-es nehéz
 * küszöbbel ment, és mérve a KÖNNYŰ gép verte meg a nehezet: a könnyű 8-nál
 * már nyomult, a nehéz meg a 16 000. tickig gyűjtögetett, mire a bázisát
 * lerohanták (0 munkás, 0 katona a kör végén). A nehézség nem attól nehéz,
 * hogy tovább vár — attól, hogy több van mögötte, amikor üt. Ezért mindhárom
 * küszöb elérhető közelségben van a saját célszámához.
 */
const TAMADAS_KUSZOB = [9, 14, 20];

/**
 * Ha a hullám ez alá fogy, VISSZAVONUL és újragyűlik. Enélkül a gép a maradék
 * két katonáját is a vesztes csatába küldi utánpótlásként, egyesével — ez a
 * gépi ellenfelek klasszikus, kínos hibája.
 */
const VISSZAVONULAS = [4, 4, 3];

/** Ekkora sugárban számít a bázis VESZÉLYBEN lévőnek. */
const VEDELEM_SUGAR = 28;

/** Hány döntési körönként frissítjük a támadó parancsot (lemaradók begyűjtése). */
const PARANCS_FRISSITES = 8;

/** A gép hadműveleti állapota. */
const HAD = { GYULT: 0, TAMAD: 1, VEDEKEZIK: 2 };

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
    this.kutatasDb = new Int32Array(this.csapatDb);

    // ── v0.6/3: a gép SAJÁT TUDÁSA és hadműveleti állapota ──────────────
    /** A felfedezett ellenséges bázis, vagy -1 ha még nem tudjuk. */
    this.ismertX = new Int32Array(this.csapatDb).fill(-1);
    this.ismertY = new Int32Array(this.csapatDb).fill(-1);
    /** A kiküldött felderítő INDEXE és GENERÁCIÓJA (lásd v0.5/1). */
    this.felderito = new Int32Array(this.csapatDb).fill(-1);
    this.felderitoGen = new Int32Array(this.csapatDb);
    /** Ez előtt a tick előtt nem küldünk új felderítőt. */
    this.felderitoIdo = new Int32Array(this.csapatDb);
    /** `HAD.*` — gyülekezik, támad, vagy védekezik. */
    this.had = new Int32Array(this.csapatDb);
    /** Hány döntési kör telt el az utolsó támadó-parancs frissítés óta. */
    this.frissitesIdo = new Int32Array(this.csapatDb);

    this.felderitDb = new Int32Array(this.csapatDb);
    this.felfedezDb = new Int32Array(this.csapatDb);
    this.tamadasDb = new Int32Array(this.csapatDb);
    this.vedekezesDb = new Int32Array(this.csapatDb);

    /**
     * Újrahasznált gyűjtő-tömb a tétlen munkásoknak. A döntési kör így NEM
     * allokál — ugyanaz a szabály, mint a render `frissit()`-jében.
     */
    this._tetlenek = [];
    /** Munkás-eloszlás nyersanyagonként — szintén újrahasznált. */
    this._eloszlas = new Int32Array(4);
    /** A kör elején egyszer megszámolt létszámok (lásd `_szamlal`). */
    this._munkasDb = 0;
    this._seregDb = 0;
    /** Újrahasznált jelölt-tömb és pont — a döntési kör nem allokál. */
    this._jeloltek = [];
    this._pont = { x: 0, y: 0 };
    /** Újrahasznált sereg-tömb a hadműveleti parancsokhoz. */
    this._sereg = [];
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
    this.kutatasDb.fill(0);
    this.ismertX.fill(-1);
    this.ismertY.fill(-1);
    this.felderito.fill(-1);
    this.felderitoGen.fill(0);
    this.felderitoIdo.fill(0);
    this.had.fill(0);
    this.frissitesIdo.fill(0);
    this.felderitDb.fill(0);
    this.felfedezDb.fill(0);
    this.tamadasDb.fill(0);
    this.vedekezesDb.fill(0);
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

    // EGYETLEN VÉGIGJÁRÁS az egységeken, a kör legelején. A v0.6/2 első
    // változatában három lépés is végigment rajtuk külön-külön (munkába
    // állítás, munkás-képzés, katona-képzés) — ugyanaz a `O(egység)` munka
    // háromszor. Egy döntési kör nem forró út, de a v0.1 óta tudjuk, hogy a
    // „csak egy kis ciklus" hozzáállásból lesz a 40 ms-os tick.
    this._szamlal(cs);
    this._munkaraFog(cs, bx, by);
    this._atcsoportosit(cs, bx, by);
    this._hazatEpit(cs, bx, by);
    this._munkastKepez(cs, kozp);
    // v0.6/2 — SORREND: előbb a ház és a munkás (a gazdaság), és csak utána a
    // hadsereg meg a kutatás. Fordítva a gép a laktanyára költené azt a fát,
    // ami a következő házra kellene, és a saját népesség-plafonjába ütközne —
    // a v0.5 szondája pontosan ezt a hibát mérte ki kézi forgatókönyvön.
    this._buildOrder(cs, bx, by);
    this._katonatKepez(cs);
    this._kutat(cs);
    // v0.6/3 — a felderítés a HADMŰVELET ELŐTT fut: a támadási döntés arra a
    // tudásra épül, amit a felderítés ebben a körben szerzett.
    this._felderit(cs, bx, by);
    this._hadmuvelet(cs, bx, by);
  }

  /**
   * FELDERÍTÉS — a gép megtudja, hol az ellenség.
   *
   * Két része van, és a sorrend számít:
   *
   *   1. LÁTÁS: ha egy ellenséges épület cellája a HADI KÖD szerint éppen
   *      látható a csapatnak, a helyét megjegyezzük. Ez az EGYETLEN hely, ahol
   *      a gép tudása keletkezik — lásd a fájl fejlécének indoklását arról,
   *      miért nem olvassuk ki egyszerűen az `epuletek`-et.
   *   2. FELDERÍTŐ: ha még nem tudjuk, hol az ellenség, kiküldünk EGY egységet
   *      a pálya túloldalára. Egyet, nem többet: a felderítő jellemzően meghal,
   *      és egy egész szakasz elvesztése a gazdaság elején végzetes.
   */
  _felderit(cs, bx, by) {
    const sim = this.sim;
    const e = sim.egysegek;
    const ep = sim.epuletek;

    // ── 1. LÁTÁS ───────────────────────────────────────────────────────
    //
    // ⚠️ A v0.7 ÓTA A HADI KÖD A FORRÁS, nem egy külön sugár-vizsgálat. A
    // v0.6/3-ban a gép a saját egységeitől mért `LATOTAV`-val nézte, lát-e
    // ellenséges épületet — ami ugyanazt jelentette, de KÉT külön igazsággal:
    // a gép láthatott olyat, ami a játékos ködtérképén sötét volt, és
    // fordítva. Két igazságból előbb-utóbb ellentmondás lesz, és az ilyen
    // ellentmondás pont az a fajta, ami némán megél (lásd a v0.6/3 támadási
    // küszöbét, ami a sereg-célszámmal került szembe).
    //
    // Most egyetlen kérdés van: LÁTHATÓ-E az épület cellája. A köd ugyanazt a
    // választ adja a gépnek és a rendernek.
    if (this.ismertX[cs] < 0) {
      for (let k = 0; k < ep.db; k++) {
        if (ep.csapat[k] === cs || !ep.el(k)) continue;
        if (!sim.kod.lathatoPont(cs, ep.x[k], ep.y[k])) continue;
        this.ismertX[cs] = ep.x[k] | 0;
        this.ismertY[cs] = ep.y[k] | 0;
        this.felfedezDb[cs]++;
        break;
      }
    }
    if (this.ismertX[cs] >= 0) return;

    // ── 2. FELDERÍTŐ KIKÜLDÉSE ─────────────────────────────────────────
    // Csak akkor, ha az előző már nincs meg. A GENERÁCIÓ dönti el, hogy a
    // tárolt index még ugyanazt az egységet jelenti-e — a v0.5/1 slot-
    // újrahasznosítása miatt egy nyers index néhány száz tick múlva egy
    // vadidegen katonára mutatna, és a gép azt hinné, még felderít valaki.
    const f = this.felderito[cs];
    if (f >= 0 && e.ervenyes(f, this.felderitoGen[cs])) return;
    if (sim.tick < this.felderitoIdo[cs]) return;

    let jelolt = -1;
    for (let i = 0; i < e.db; i++) {
      if (e.csapat[i] !== cs || !sim.harc.elo[i] || sim.beszallas.bent[i] === 1) continue;
      if (e.tipus[i] === TIPUS.MUNKAS) continue;   // a munkás dolgozzon
      jelolt = i;
      break;
    }
    if (jelolt < 0) return;

    // A felderítő a pálya TÚLOLDALÁRA megy, a saját bázisunk tükörképére. Nem
    // véletlen irány: a v0.1 óta a két bázis a pálya két oldalán van, és a
    // felderítésnek nem az a dolga, hogy a térképet felfedezze, hanem hogy az
    // ELLENFELET megtalálja. (A v0.10 térkép-presetjeinél ez általánosítandó.)
    const c = sim._jarhatoKozel(sim.n - (bx | 0), by | 0);
    this.felderito[cs] = jelolt;
    this.felderitoGen[cs] = e.generacio[jelolt];
    this.felderitoIdo[cs] = sim.tick + FELDERITO_KOZ[this.nehezseg[cs]];
    this.felderitDb[cs]++;
    // Sima menet, NEM támadó: a felderítő ne álljon meg minden ellenséggel
    // verekedni, mert akkor sosem ér oda.
    sim.parancs({ fajta: 'menet', egysegek: [jelolt], x: c.x, y: c.y });
  }

  /**
   * HADMŰVELET — védekezés, gyülekezés, támadás.
   *
   * ⚠️ PARANCSOT CSAK ÁLLAPOTVÁLTÁSKOR ADUNK (plusz ritka frissítést). Ez
   * ugyanaz a szabály, ami a munkásoknál a fejlécben áll: a menetparancs
   * ÚJRAINDÍTJA az egységet, tehát ha a gép minden körben kiadná ugyanazt a
   * támadási parancsot, a sereg minden döntési körben újratervezné az útját,
   * és a helyben toporgás lenne az eredmény.
   */
  _hadmuvelet(cs, bx, by) {
    const sim = this.sim;
    const e = sim.egysegek;
    const n = this.nehezseg[cs];

    // ── VÉDEKEZÉS mindenek előtt ───────────────────────────────────────
    // Ha ellenség van a bázison, a hadsereg helye OTTHON van. A gép különben
    // boldogan rohamozna tovább, miközben a munkásait lemészárolják — ez a
    // fajta hiba nem látszik semmilyen összesített számon, csak a meccs végén.
    // KETTŐ ellenség kell, nem egy — és ezt mérni kellett. Egyetlen betévedt
    // FELDERÍTŐ is átlépi a védelmi sugarat, és az első változat ettől
    // hazarendelte a teljes hadsereget. A nehéz gép háromszor váltott
    // védekezésre 12 000 tick alatt, a serege gyakorlatilag végig hazafelé
    // menetelt, és a KÖNNYŰ gép verte meg. Egy magányos kém nem invázió.
    let ellensegDb = 0;
    for (let i = 0; i < e.db && ellensegDb < 2; i++) {
      if (e.csapat[i] === cs || !sim.harc.elo[i] || sim.beszallas.bent[i] === 1) continue;
      if (e.tipus[i] === TIPUS.MUNKAS) continue;
      const dx = e.px[i] - bx, dy = e.py[i] - by;
      if (dx * dx + dy * dy < VEDELEM_SUGAR * VEDELEM_SUGAR) ellensegDb++;
    }
    if (ellensegDb >= 2) {
      if (this.had[cs] !== HAD.VEDEKEZIK) {
        this.had[cs] = HAD.VEDEKEZIK;
        this.vedekezesDb[cs]++;
        this._seregParancs(cs, bx, by, true);
      }
      return;
    }

    if (this.had[cs] === HAD.VEDEKEZIK) this.had[cs] = HAD.GYULT;

    // ── TÁMADÁS ────────────────────────────────────────────────────────
    if (this.ismertX[cs] < 0) return;   // nem tudjuk, hova
    if (this.had[cs] === HAD.GYULT) {
      if (this._seregDb < TAMADAS_KUSZOB[n]) return;
      this.had[cs] = HAD.TAMAD;
      this.tamadasDb[cs]++;
      this.frissitesIdo[cs] = 0;
      this._seregParancs(cs, this.ismertX[cs], this.ismertY[cs], true);
      return;
    }

    // Fut a hullám: elfogyott-e?
    if (this._seregDb < VISSZAVONULAS[n]) {
      this.had[cs] = HAD.GYULT;
      this._seregParancs(cs, bx, by, false);
      return;
    }
    // Ritka frissítés: a közben kiképzett katonák és a lemaradók is
    // csatlakozzanak. Ritkán, mert minden parancs újratervezteti az utat.
    if (++this.frissitesIdo[cs] >= PARANCS_FRISSITES) {
      this.frissitesIdo[cs] = 0;
      this._seregParancs(cs, this.ismertX[cs], this.ismertY[cs], true);
    }
  }

  /**
   * A teljes hadsereg EGY parancsot kap — egy csoport, egy áramlási mező.
   * Ez a v0.1 legdrágább tanulsága (`parancsok.js` fejléce), és a gépnél
   * ugyanúgy érvényes: egységenkénti parancs itt is mezőt kérne fejenként.
   */
  _seregParancs(cs, x, y, tamado) {
    const sim = this.sim;
    const e = sim.egysegek;
    const sereg = this._sereg;
    sereg.length = 0;
    for (let i = 0; i < e.db; i++) {
      if (e.csapat[i] !== cs || !sim.harc.elo[i] || sim.beszallas.bent[i] === 1) continue;
      if (e.tipus[i] === TIPUS.MUNKAS) continue;
      sereg.push(i);
    }
    if (sereg.length === 0) return;
    // ⚠️ A FELDERÍTŐ IS A SEREG RÉSZE, tehát ez a parancs LEVETTE a felderítő
    // útjáról. Ha ezt nem jegyeznénk fel, a gép azt hinné, még mindig kint van
    // egy kém (az index érvényes, az egység él), és SOSEM küldene újat. Mérve:
    // a nehéz gép egyetlen felderítőt indított 12 000 tick alatt, a hazarendelés
    // után pedig soha nem tudta meg, hol az ellenfél — így támadni sem tudott.
    this.felderito[cs] = -1;
    const c = sim._jarhatoKozel(x, y);
    sim.parancs({
      fajta: tamado ? 'tamado_menet' : 'menet',
      egysegek: sereg.slice(), x: c.x, y: c.y,
    });
  }

  /**
   * BUILD ORDER (v0.6/2) — az első olyan tétel, amiből még nincs elég.
   *
   * KÖRÖNKÉNT EGY ÉPÜLET indul el, nem az egész sor. Ez itt más döntés, mint a
   * v0.5 szondájában (ahol a teljes sort minden körben beadtuk): ott a cél az
   * volt, hogy MINDEN ág lefusson a kapun belül, itt viszont a gép gazdálkodik.
   * Ha egyszerre rendelne laktanyát, íjászdát és piacot, mind levonná az árát,
   * és a gazdaság egy körre kiürülne — a házra nem maradna, a népesség beállna.
   */
  _buildOrder(cs, bx, by) {
    const sim = this.sim;
    const sor = BUILD_ORDER[this.nehezseg[cs]];
    for (let k = 0; k < sor.length; k++) {
      const tipus = sor[k];
      if (this._epuletDb(cs, tipus) >= EPULET_CEL[tipus]) continue;
      if (!sim.gazdasag.telik(cs, EP_AR[tipus])) return;   // erre gyűjtünk, nem lépünk tovább
      const el = HELY_ELTOLAS[tipus];
      const hely = this._epitesiHely(tipus, (bx | 0) + el[0], (by | 0) + el[1]);
      if (!hely) continue;
      sim.parancs({ fajta: 'epit', csapat: cs, tipus, x: hely.x, y: hely.y });
      this.epitDb[cs]++;
      return;
    }
  }

  /**
   * Hány ilyen épülete van a csapatnak — az ÉPÜLŐFÉLBEN LÉVŐT IS BELESZÁMÍTVA.
   *
   * ⚠️ A `kesz()` itt hibás lenne. A laktanya 250 tickig épül, a gép viszont
   * 50-120 tickenként dönt: ha csak a késznek számítana, két-öt laktanyát
   * rendelne meg egymás után, mielőtt az első felépül — és mindegyik ára
   * levonódna. Ez a fajta hiba nem látszik a hash-en, csak azon, hogy a gép
   * szegény marad.
   */
  _epuletDb(cs, tipus) {
    const ep = this.sim.epuletek;
    let n = 0;
    for (let k = 0; k < ep.db; k++) {
      if (ep.csapat[k] === cs && ep.el(k) && ep.tipus[k] === tipus) n++;
    }
    return n;
  }

  /**
   * KATONA-KÉPZÉS a sereg-célszámig, minden képző épületben.
   *
   * Az épület dönti el, mit képez (`Kepzes.kepezheti`) — a gép nem tart külön
   * összetétel-tervet. Ez tudatosan egyszerű: a fegyvernem-arányt a v0.6/3
   * felderítése fogja szabályozni, amikor már LÁTJA, mi ellen harcol. Addig a
   * több épület magától ad vegyes sereget, ami a kő-papír-ollóban nem rossz
   * alapállás.
   */
  _katonatKepez(cs) {
    const sim = this.sim;
    const n = this.nehezseg[cs];
    if (this._seregDb >= SEREG_CEL[n]) return;

    // ⚠️ A GAZDASÁG ELŐBB VAN, MINT A HADSEREG — és ezt mérni kellett.
    // A v0.6/2 első változata a munkás-célszámtól függetlenül képzett katonát,
    // és a nehéz gép gazdasága ÖSSZEOMLOTT tőle: 30 helyett 19 munkás, és
    // 3890 helyett 1770 összegyűjtött nyersanyag ugyanannyi tick alatt. A
    // katona ételbe kerül, az étel munkásból jön, és a kettő ugyanabból a
    // készletből eszik — aki előbb költ hadseregre, az a saját utánpótlását
    // fojtja meg. Ez az a hiba, amit se a hash, se egy „csinált-e valamit"
    // szám nem mutat meg: a gép SZORGALMASAN dolgozik, csak rosszul.
    //
    // A küszöb kétharmad, nem száz százalék: teljes gazdaságra várni azt
    // jelentené, hogy a gép a meccs feléig védtelen.
    if (this._munkasDb * 3 < MUNKAS_CEL[n] * 2) return;

    const ep = sim.epuletek;
    for (let k = 0; k < ep.db; k++) {
      if (ep.csapat[k] !== cs || !ep.kesz(k)) continue;
      if (ep.tipus[k] === EPULET.KOZPONT) continue;   // az a munkásé
      if (sim.kepzes.sorDb[k] >= SOR_KORLAT) continue;
      for (let t = 0; t < 5; t++) {
        if (t === TIPUS.MUNKAS) continue;
        if (!sim.kepzes.kepezheti(ep.tipus[k], t)) continue;
        // ELŐZETES ÁR-VIZSGÁLAT. A `Kepzes.sorba` úgyis elutasít, ha nem telik,
        // de a vak rendelés zajt csinál: mérve 978 képzési parancsot adott ki a
        // nehéz gép, aminek a túlnyomó része elutasításba futott. A v0.8-ban
        // ezek a parancsok a HÁLÓZATON is átmennének — egy AI, ami másodpercenként
        // tucat halott parancsot küld, ott már nem csak zaj.
        if (!sim.gazdasag.telik(cs, EGYSEG_AR[t])) break;
        sim.parancs({ fajta: 'kepzes', csapat: cs, epulet: k, egyseg: t });
        this.kepzesDb[cs]++;
        break;
      }
    }
  }

  /**
   * KUTATÁS a szint szerinti darabszámig. A `Technologia.indit()` dönt mindenről
   * (jó épület-e, megvan-e a korszak, telik-e rá) — a gép csak ajánl.
   *
   * A KÖNNYŰ szint egyet sem kutat, tehát a serege nyers alapértékeken harcol.
   * Ez a szintek közti legőszintébb különbség: nem a gép kap kevesebbet, hanem
   * kevesebbet HOZ KI ugyanabból a rendszerből.
   */
  _kutat(cs) {
    const cel = KUTATAS_CEL[this.nehezseg[cs]];
    if (cel === 0) return;
    const tech = this.sim.technologia;
    const ossz = tech.osszesites(cs);
    if (ossz.kesz + ossz.folyik >= cel) return;

    const ep = this.sim.epuletek;
    for (let t = 0; t < TECH_DB; t++) {
      if (tech.allapot[cs * TECH_DB + t] !== 0) continue;
      const kellEp = techEpulete(t);
      for (let k = 0; k < ep.db; k++) {
        if (ep.csapat[k] !== cs || !ep.kesz(k) || ep.tipus[k] !== kellEp) continue;
        this.sim.parancs({ fajta: 'kutatas', csapat: cs, tech: t, epulet: k });
        this.kutatasDb[cs]++;
        return;   // körönként EGY kutatás — ugyanaz a spórolás, mint a build ordernél
      }
    }
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
  _szamlal(cs) {
    const sim = this.sim;
    const e = sim.egysegek;
    const mu = sim.munkasok;
    const ef = sim.eroforrasok;

    const tetlenek = this._tetlenek;
    tetlenek.length = 0;
    const el = this._eloszlas;
    el[0] = 0; el[1] = 0; el[2] = 0; el[3] = 0;
    this._munkasDb = 0;
    this._seregDb = 0;

    for (let i = 0; i < e.db; i++) {
      if (e.csapat[i] !== cs || !sim.harc.elo[i]) continue;
      if (e.tipus[i] !== TIPUS.MUNKAS) { this._seregDb++; continue; }
      // A beszállásolt munkás ÉL, de nincs a világban — nem lehet munkába
      // állítani, viszont a népességet és a célszámot foglalja. Ezért a
      // létszámba beszámít, a tétlenek közé nem kerül.
      this._munkasDb++;
      if (sim.beszallas.bent[i] === 1) continue;
      if (mu.allapot[i] === MUNKA.NINCS) { tetlenek.push(i); continue; }
      const node = mu.celNode[i];
      if (node >= 0 && node < ef.db) el[ef.fajta[node]]++;
    }
  }

  _munkaraFog(cs, bx, by) {
    const sim = this.sim;
    const ef = sim.eroforrasok;
    const tetlenek = this._tetlenek;
    const el = this._eloszlas;
    const osszes = this._munkasDb;
    if (tetlenek.length === 0) return;

    for (let k = 0; k < tetlenek.length; k++) {
      if (!this._munkaraKuld(cs, tetlenek[k], el, osszes, bx, by)) break;
    }
  }

  /**
   * EGY munkás elküldése a legjobban HIÁNYZÓ nyersanyagra.
   *
   * ⚠️ HA A LEGSZŰKÖSEBB FAJTÁT NEM TALÁLJUK, LÉPÜNK A KÖVETKEZŐRE. Az első
   * változat ilyenkor `continue`-val átugrotta a munkást — és ez CSENDES
   * HOLTPONT volt: a hiány attól nem szűnt meg, hogy nincs a közelben lelőhely,
   * tehát a következő körben ugyanaz a fajta jött ki győztesnek, ugyanúgy nem
   * volt hol gyűjteni, és a munkás ÖRÖKRE tétlen maradt. A gép szorgalmasan
   * gondolkodott volna, miközben áll a gazdasága.
   *
   * @returns {boolean} sikerült-e bárhova elküldeni
   */
  _munkaraKuld(cs, egyseg, el, osszes, bx, by) {
    const ef = this.sim.eroforrasok;
    // Legfeljebb négy próbálkozás: minden körben a LEGNAGYOBB hiányú fajta jön,
    // és amelyikhez nincs lelőhely, azt kizárjuk ebből a keresésből.
    let kizart = 0;
    for (let proba = 0; proba < 4; proba++) {
      const fajta = this._hianyzoFajta(el, osszes, kizart);
      if (fajta < 0) return false;
      const node = this._elerhetoLelohely(fajta, bx, by, egyseg);
      if (node < 0) { kizart |= (1 << fajta); continue; }
      // EGY egység, EGY parancs. Drágábbnak látszik, mint egy csoportos
      // parancs, de a tétlenek száma egy körben néhány darab — a v0.1-es
      // „egy mező egységenként" csapda ITT nem áll fenn, mert a `gyujt`
      // ugyanarra a lelőhelyre ugyanazt a mezőt kéri.
      this.sim.parancs({
        fajta: 'gyujt', egysegek: [egyseg],
        x: ef.x[node], y: ef.y[node], nyers: fajta,
      });
      el[fajta]++;
      this.gyujtDb[cs]++;
      return true;
    }
    return false;
  }

  /**
   * Melyik nyersanyagon van a legnagyobb LEMARADÁS a célarányhoz képest?
   *
   * Egész számtan: a cél `(összes * ARANY[f]) / 100 | 0`, a hiány ehhez képest.
   * Döntetlennél a KISEBB index nyer — ugyanaz a szabály, mint a célzásnál,
   * és ugyanabból az okból: a döntetlen feloldásának is gépfüggetlennek kell
   * lennie.
   *
   * @param {number} kizart bitmaszk: ezeket a fajtákat ne adja vissza
   * @returns {number} `NYERS.*`, vagy -1 ha mind ki van zárva
   */
  _hianyzoFajta(el, osszes, kizart = 0) {
    let legjobb = -1, legjobbHiany = -0x7fffffff;
    for (let f = 0; f < 4; f++) {
      if (kizart & (1 << f)) continue;
      const cel = ((osszes * ARANY[f]) / 100) | 0;
      const hiany = cel - el[f];
      if (hiany > legjobbHiany) { legjobbHiany = hiany; legjobb = f; }
    }
    return legjobb;
  }

  /**
   * A legközelebbi olyan lelőhely, ahova a bázisból EL IS LEHET JUTNI.
   *
   * ⚠️ EZ NEM ÓVATOSSÁG, HANEM MÉRT HIBA JAVÍTÁSA. A `Eroforrasok.keres` a
   * TÁVOLSÁGOT nézi, az útvonalat nem. A nehéz gép bázisától 24 egységre volt
   * egy három lelőhelyből álló étel-fürt, amit vízen túl — vagyis sehogy — nem
   * lehetett megközelíteni. Mind a hat étel-munkás oda indult, sosem ért oda,
   * és 12 000 tick alatt 100 ÉTEL jött be 890 fa mellett. Étel nélkül nincs
   * képzés: 658 képzési parancs futott elutasításba. A determinizmus-kapu
   * végig zöld volt — egy elérhetetlen bogyós ugyanolyan reprodukálható, mint
   * egy elérhető.
   *
   * AZ ÁRAMLÁSI MEZŐ INGYEN TUDJA A VÁLASZT: Dijkstra a célból kifelé, tehát
   * az elérhetetlen cellák költsége végtelen marad. A mezőt ráadásul úgyis
   * kikérjük — a `gyujt` parancs ugyanezt a célcellát kéri majd, és a
   * `MezoTar` gyorstárából ugyanazt kapja. A vizsgálat tehát nem drágább, mint
   * amit enélkül is kifizetnénk.
   *
   * @returns {number} lelőhely-index, vagy -1 ha egyik sem érhető el
   */
  _elerhetoLelohely(fajta, bx, by, egyseg) {
    const sim = this.sim;
    const ef = sim.eroforrasok;
    const racs = sim.racs;
    // ⚠️ A KIINDULÁS A MUNKÁS, NEM A KÖZPONT. Első nekifutásra a központ
    // világkoordinátáját adtam át — és MINDEN lelőhely elérhetetlennek
    // bizonyult, mert az épület LEZÁRJA a saját celláit, a Dijkstra pedig a
    // zárt cellának sosem ad költséget. A gazdaság egy csapásra teljesen
    // leállt: nulla begyűjtött nyersanyag mindkét oldalon. A keresés KÖZEPE
    // marad a bázis (a fürtök ott vannak), az ELÉRHETŐSÉG viszont onnan
    // kérdés, ahol a munkás tényleg áll.
    const e = sim.egysegek;
    const honnan = racs.idx(e.px[egyseg] | 0, e.py[egyseg] | 0);
    if (honnan < 0) return -1;

    const jeloltek = this._jeloltek;
    jeloltek.length = 0;
    ef.kornyek(fajta, bx, by, jeloltek, 8, LELOHELY_SUGAR);
    for (let k = 0; k < jeloltek.length; k++) {
      const node = jeloltek[k];
      // A lelőhely SAJÁT cellája zárt (az erdő és a kőfejtő lezárja) — az
      // állóhelyre kell mezőt kérni, oda megy a munkás is.
      const hely = ef.allohely(node, this._pont, 0);
      if (!hely) continue;
      const cel = racs.idx(hely.x | 0, hely.y | 0);
      if (cel < 0) continue;
      const mezo = sim.mezoTar.kerj(cel, sim.tick);
      if (sim.mezoTar.elerheto(mezo, honnan)) return node;
    }
    return -1;
  }

  /**
   * ÁTCSOPORTOSÍTÁS — körönként EGY munkás a legbővebb nyersanyagról a
   * legszűkösebbre.
   *
   * ⚠️ EZ A LÉPÉS KELL A LEGKEVÉSBÉ NYILVÁNVALÓAN, ÉS MÉRVE A LEGFONTOSABB.
   * A gép csak a TÉTLEN munkást osztja be, a beosztott pedig magától dolgozik
   * tovább — de a lelőhely KIMERÜL, és a munkás-AI ilyenkor a legközelebbi
   * MÁSIK lelőhelyre áll át, akármilyen fajta is az. Néhány ezer tick alatt az
   * eredeti arány szétcsúszik, és a gép nem veszi észre, mert senki nem lesz
   * tétlen. Mérve: a nehéz gép 12 000 tick alatt 890 fát gyűjtött és 60 ÉTELT,
   * miközben a célaránya 30 % étel lett volna. Étel nélkül nincs képzés — 663
   * képzési parancsából 658 elutasításba futott.
   *
   * KÖRÖNKÉNT EGY munkás mozdul, és ez tudatos: a `gyujt` parancs eldobja a
   * cipelt rakományt, tehát a tömeges átcsoportosítás ugyanaz a hiba lenne,
   * ami ellen a fejléc figyelmeztet. Egy munkás körönként néhány perc alatt
   * helyreteszi az arányt, és közben semmit nem tör el.
   */
  _atcsoportosit(cs, bx, by) {
    const el = this._eloszlas;
    const osszes = this._munkasDb;
    if (osszes < 4) return;

    let hianyF = -1, hianyMax = 0;
    let tobblF = -1, tobblMax = 0;
    for (let f = 0; f < 4; f++) {
      const cel = ((osszes * ARANY[f]) / 100) | 0;
      const d = cel - el[f];
      if (d > hianyMax) { hianyMax = d; hianyF = f; }
      if (-d > tobblMax) { tobblMax = -d; tobblF = f; }
    }
    // Csak VALÓDI aránytalanságra mozdulunk: két munkásnyi eltérés alatt a
    // mozgatás többe kerülne (eldobott rakomány, út oda-vissza), mint amennyit
    // az arány javulása ér.
    if (hianyF < 0 || tobblF < 0 || hianyMax < 2 || tobblMax < 2) return;

    const sim = this.sim;
    const e = sim.egysegek;
    const mu = sim.munkasok;
    const ef = sim.eroforrasok;
    for (let i = 0; i < e.db; i++) {
      if (e.csapat[i] !== cs || e.tipus[i] !== TIPUS.MUNKAS) continue;
      if (!sim.harc.elo[i] || sim.beszallas.bent[i] === 1) continue;
      const node = mu.celNode[i];
      if (node < 0 || node >= ef.db || ef.fajta[node] !== tobblF) continue;
      const uj = this._elerhetoLelohely(hianyF, bx, by, i);
      if (uj < 0) return;
      sim.parancs({
        fajta: 'gyujt', egysegek: [i],
        x: ef.x[uj], y: ef.y[uj], nyers: hianyF,
      });
      this.gyujtDb[cs]++;
      return;   // KÖRÖNKÉNT EGY
    }
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
    const munkas = this._munkasDb + sim.kepzes.sorbanTipus(kozp, TIPUS.MUNKAS);
    if (munkas >= MUNKAS_CEL[this.nehezseg[cs]]) return;
    if (sim.kepzes.sorDb[kozp] >= SOR_KORLAT) return;
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
      kutatas: this.kutatasDb[csapat],
      felderit: this.felderitDb[csapat],
      felfedez: this.felfedezDb[csapat],
      tamadas: this.tamadasDb[csapat],
      vedekezes: this.vedekezesDb[csapat],
      ismertX: this.ismertX[csapat],
      ismertY: this.ismertY[csapat],
      had: this.had[csapat],
    };
  }
}
