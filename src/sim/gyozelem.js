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
// ── ⚠️ A KIESÉS RAGADÓS — AKI EGYSZER KIESETT, NEM JÖN VISSZA (v0.18/2) ───
// A `kiesett[]` jelzőt a `lep()` tickenként ÚJRASZÁMOLJA, és eredetileg tisztán
// a MOSTANI világból: „volt központja, és most egy sem áll". Két csapatnál ez
// észrevétlenül helyes volt — ott az első kiesés EGYBEN a meccs vége, tehát a
// jelzőnek nincs ideje visszabillenni.
//
// Háromnál viszont van. A meccs megy tovább (a szabály „legfeljebb egy csapat
// maradt talpon"), és ha a kiesett fél ÚJ központot húz fel — van még munkása,
// van még nyersanyaga —, a központ-számlálója megint 1 lesz, és a jelző
// visszaáll nullára. Mérve, ezen az osztályon, három csapaton: `kiesett`
// [1,0,0] → a következő ticken [0,0,0]. A kiesett csapat FELTÁMADT, a meccs
// megint nem tud véget érni, és mivel a jelző a hashben van, egy másik gép
// egyetlen tickkel eltérő építéssel MÁS állapotot lát ugyanarról a meccsről.
//
// Ezért a jelző mostantól magába is visszacsatol. ⚠️ Ez NEM „több csapatos
// mód": a fenti szabály-bekezdés a v0.17 óta KIMONDJA, hogy a szabály három-
// négy félnél is ugyanez marad, és egy kimondott szabály, ami nem igaz,
// rosszabb, mint egy ki nem mondott. Két csapatnál a változás
// BIZONYÍTHATÓAN semleges: `kiesett[cs] === 1` ott csak olyan tickben állhat
// elő, amelyikben `vesztes >= 1`, tehát `csapatDb - vesztes <= 1` — vagyis
// ugyanabban a tickben véget is ér a meccs, és a `lep()` többé nem fut le.
// A determinizmus-szonda mind a 15 vizsgálata bitre ugyanazt adja.
//
// ── ⚠️ A `felad()` KETTŐS VÉDELME: MIÉRT MARAD A `this.vege` ÁG ───────────
// A `felad()`-nak ma PONTOSAN EGY hívója van: a `parancsok.js` `feladas` ága.
// Ott viszont a `vegrehajt()` ELSŐ sora egy általános kapu — a meccs vége után
// minden parancs elvész —, tehát a `felad()`-on belüli `this.vege` vizsgálat
// PARANCSBÓL sosem sül el. Aki lefedettséget mér, holt ágnak fogja látni.
// Mégis marad, és nem kényelemből:
//
//   1. A `feladta[]` HASH-MEZŐ, és a `felad()` az EGYETLEN írója. Egy vég
//      utáni írás tehát elmozdítaná a hasht — miközben a `lep()` a `vege`
//      után azonnal kilép, tehát a belőle következő `kiesett[]`-et már senki
//      nem hozná helyre. Egyetlen gépen elsülve ez azonnali, NÉMA desync, és a
//      legrosszabb fajta: egy MÁR ELDŐLT meccsben keletkezik, ahol senki nem
//      keresi. Kimérve, közvetlen hívással a vég után: gát nélkül a `feladta`
//      [0,0] → [0,1]; a gáttal [0,0] marad, és a hash sem mozdul.
//   2. A védelem az OSZTÁLYÉ, nem a hívóé. A `Gyozelem` exportált, a `felad()`
//      publikus és dokumentált; ha egy jövőbeli hívó (v0.8 hálózati réteg,
//      meccs-hurok, szonda) a parancs-sor mellett nyúl hozzá, az osztálynak
//      akkor is helyesnek kell maradnia. A parancs-úti kapu VISZONT nem
//      költözhet ide: hogy miért pont a `vegrehajt()` első sorában a helye,
//      azt a fenti „A PARANCS-ELUTASÍTÁS…" bekezdés indokolja.
//   3. Az ára egy `||` egy olyan úton, ami meccsenként néhányszor fut.
//
// ⚠️ AMI EBBŐL A MÉRÉSRE KÖVETKEZIK: a `feladasElutasitva` a FUTÓ meccs alatti
// hibás feladást számolja (tartományon kívüli csapatszám, kétszeri feladás) —
// a vég utánit SOHA. Aki a vég utáni elutasításra épít gátat, az
// `elutasitottParancs`-ot nézze. A v0.17 szondája első futásra pont ebbe futott
// bele, és egy örökre nullán álló, ZÖLD gátat kapott volna.
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
   * ⚠️ A `this.vege` VIZSGÁLAT PARANCSBÓL ELÉRHETETLEN, ÉS SZÁNDÉKOSAN AZ. A
   * `parancsok.js` általános kapuja előbb elfogja a vég utáni feladást; ez itt
   * a MÁSODIK védvonal, arra az esetre, ha valaki a parancs-sor mellett hívná
   * a metódust. Az indoklás — és hogy melyik számlálóra szabad gátat építeni —
   * a fejléc „A `felad()` KETTŐS VÉDELME" szakaszában áll. Ne vedd ki: a
   * `feladta[]` hash-mező, és ez az egyetlen írója.
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
      // ⚠️ `this.kiesett[cs] === 1` — A KIESÉS RAGADÓS. Enélkül egy kiesett
      // csapat FELTÁMAD, ha új központot épít; a fejléc „A KIESÉS RAGADÓS"
      // szakasza méri is. Két csapatnál semleges (ott a kiesés tickje egyben
      // a meccs vége), háromnál viszont ez tartja igaznak a szabályt.
      const ki = this.kiesett[cs] === 1 || this.feladta[cs] === 1 || kozpontVesztes;
      this.kiesett[cs] = ki ? 1 : 0;
      if (!ki) { utolsoElo = cs; continue; }
      vesztes++;
      // Az OK a LEGKISEBB indexű kiesett csapatéból jön. Nem ízlés: ha ketten
      // esnek ki ugyanazon a ticken, valamilyen rögzített szabály kell, hogy
      // két gép ne más okot írjon ki ugyanarra a meccsre.
      //
      // ⚠️ A LEVEZETÉS UGYANAZ, MINT AZ `okCsapat()`-BAN, ÉS EZ NEM VÉLETLEN.
      // Két helyen levezetett „miért esett ki" előbb-utóbb elcsúszik, és akkor
      // a `this.ok` mást mondana, mint a csapatonkénti olvasat — ugyanarról a
      // meccsről. A `feladta[]` az ELSŐDLEGES: az a játékos kimondott tette, és
      // ragadós jelző, tehát a vég UTÁN is ugyanaz a válasz jön belőle. A
      // központ-vesztés viszont a világ pillanatnyi ténye, amit a vég után már
      // nem lehet visszakérdezni.
      //
      // ⚠️ SORREND: az `okCsapat()` a `kiesett[cs]`-ből indul, azt pedig két
      // sorral feljebb állítottuk 1-re. Ha a hívás följebb kerülne, `NINCS`-et
      // adna, és a meccs ok nélkül érne véget.
      if (okKod === VEG_OK.NINCS) okKod = this.okCsapat(cs);
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
   * MIÉRT esett ki EZ a csapat — `VEG_OK.*`, vagy `VEG_OK.NINCS`, ha talpon van.
   *
   * ── MIÉRT KELL, HA MÁR VAN `this.ok` ────────────────────────────────────
   * A `this.ok` EGY szám az EGÉSZ meccsre: a legkisebb indexű kiesett csapaté.
   * Két félnél ez majdnem mindig elég — de DÖNTETLENNÉL félrevezet, és a
   * döntetlen elérhető állapot. Mérve, ezen az osztályon: a 0. csapat FELADJA,
   * az 1. UGYANAZON a ticken elveszti a központját → `ok = FELADAS`, a felület
   * pedig azt írja ki, hogy „mindkét fél feladta a meccset". Az egyik félről ez
   * hazugság, és a sim eredmény-jelentése nem hazudhat.
   *
   * ── MIÉRT SZÁRMAZTATOTT, ÉS MIÉRT NINCS HOZZÁ ÚJ MEZŐ ───────────────────
   * A válasz maradéktalanul benne van két, MÁR HASHELT és MÁR MENTETT jelzőben
   * (`kiesett`, `feladta`). Egy csapatonkénti ok-tömb csak a hash-halmazt
   * hizlalná és a mentésben is karbantartandó lenne, holott egyetlen új bitet
   * sem hordozna — a `sim.js` `allapotHash()`-éhez tehát NEM kell hozzányúlni.
   *
   * @param {number} csapat
   * @returns {number} `VEG_OK.*`
   */
  okCsapat(csapat) {
    const cs = csapat | 0;
    if (cs < 0 || cs >= this.csapatDb || this.kiesett[cs] !== 1) return VEG_OK.NINCS;
    return this.feladta[cs] === 1 ? VEG_OK.FELADAS : VEG_OK.KOZPONT;
  }

  /**
   * A réteg mentendő állapota — a `mentes.js` `gyozelem` blokkja ezt írja ki.
   *
   * ⚠️ A HÁROM SZÁMLÁLÓ IS BENNE VAN (v0.18/2). A v0.17-ben szándékosan
   * maradtak ki, azzal az indokkal, hogy „a mentés halmaza pontosan a hash
   * halmaza". Ez a szabály a `mentes.js`-re nézve nem volt igaz: a fájl a
   * v0.6 óta menti az AI, a civ, az egyedi egység, a technológia, a képzés és
   * a harc működés-számait is, egyik sincs a hashben. A helyes szabály — és
   * ami most a `mentes.js` fejlécében is ki van mondva — az, hogy a mentés
   * a HASH-MEZŐKET a folytatás helyessége miatt viszi, a MŰKÖDÉS-SZÁMOKAT
   * pedig azért, hogy a betöltött meccs jelentése ne hazudjon a rétegek
   * munkájáról. A vég miatt eldobott parancsok száma pont ilyen szám.
   */
  mentesAllapot() {
    return {
      gyoztes: this.gyoztes, vegeTick: this.vegeTick, ok: this.ok,
      voltKozpont: Array.from(this.voltKozpont),
      feladta: Array.from(this.feladta),
      kiesett: Array.from(this.kiesett),
      elutasitottParancs: this.elutasitottParancs,
      feladasDb: this.feladasDb,
      feladasElutasitva: this.feladasElutasitva,
    };
  }

  /**
   * @param {ReturnType<Gyozelem['mentesAllapot']>} a
   *
   * ⚠️ MINDEN MEZŐ HIÁNYT TŰR. Egy RÉGI (v5-ös) mentésben a három számláló még
   * nincs benne, és a `mentes.js` az ilyet szándékosan BETÖLTHETŐNEK tartja —
   * ott az indoklás. Itt annyi a dolgunk, hogy a hiányból nulla legyen, ne
   * `NaN`: a számlálókat a szonda és a jelentés olvassa, és egy `NaN` végig
   * fertőzné az összegzést.
   */
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
    this.elutasitottParancs = a.elutasitottParancs | 0;
    this.feladasDb = a.feladasDb | 0;
    this.feladasElutasitva = a.feladasElutasitva | 0;
    return true;
  }

  /** Olvasat a szondának és a UI-nak. Sosem a forró úton hívjuk. */
  osszesites() {
    // CSAPATONKÉNTI OK — döntetlennél a közös `ok` az egyik félről hazudik,
    // lásd az `okCsapat()` fejlécét. A UI ebből tudja megírni az igaz mondatot.
    const okok = new Array(this.csapatDb);
    for (let cs = 0; cs < this.csapatDb; cs++) okok[cs] = this.okCsapat(cs);
    return {
      vege: this.vege,
      gyoztes: this.gyoztes,
      vegeTick: this.vegeTick,
      ok: this.ok,
      okNev: VEG_OK_NEV[this.ok] || '',
      okok,
      kiesett: Array.from(this.kiesett),
      feladta: Array.from(this.feladta),
      elutasitottParancs: this.elutasitottParancs,
      feladasDb: this.feladasDb,
      feladasElutasitva: this.feladasElutasitva,
    };
  }
}
