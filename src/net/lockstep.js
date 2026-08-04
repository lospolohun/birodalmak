// AGE OF THE CRYSTALS — LOCKSTEP MAG (v0.8/1).
//
// ── MIT CSINÁL A LOCKSTEP, ÉS MIT NEM ─────────────────────────────────────
// A hálózat NEM világállapotot küld. Nem pozíciókat, nem életerőt, nem
// nyersanyagot. Egyetlen dolgot küld: KI MIT PARANCSOLT, ÉS MELYIK KÖRRE.
// Minden gép ugyanazt a szimulációt futtatja ugyanarra a parancs-sorra, és ha
// a szimuláció determinisztikus, az eredmény bitre azonos.
//
// Ezért volt a determinizmus KAPU a v0.1 óta, nem „majd megnézzük" kérdés: a
// teljes hálózati terv erre az egy feltevésre épül. Ez a fájl csak akkor
// működhet, ha az előző hét verzió tényleg megtartotta az ígéretét.
//
// A sávszélesség-nyereség nem apró: 1600 egység állapota tickenként több száz
// kilobájt lenne, egy környi parancs viszont tipikusan NÉHÁNY TÍZ BÁJT — és a
// kettő aránya nem is romlik, ha a seregek nőnek.
//
// ── A KÖR NEM TICK ────────────────────────────────────────────────────────
// A sim 20 Hz-en fut. Ha tickenként küldenénk csomagot, az másodpercenként 20
// csomag JÁTÉKOSONKÉNT — fölösleges, mert a játékos nem ad másodpercenként 20
// parancsot. Ezért `KOR_TICK` tickenként van EGY kör, és egy csomag egy kör
// összes parancsát viszi. (Az AoE-hagyomány is ez.)
//
// ── SENKI NEM LÉP, AMÍG MINDENKI MEG NEM SZÓLALT ──────────────────────────
// Ez a lockstep DEFINÍCIÓJA, és egyben a legfájdalmasabb tulajdonsága: egyetlen
// lassú játékos MINDENKIT megállít. Nem hiba, hanem következmény — cserébe
// viszont nincs se szerver-hitelesítés, se állapot-javítás, se „gumizás".
//
// A csomag akkor is elmegy, ha a játékos SEMMIT nem csinált (üres parancs-
// listával). Enélkül a „nem csináltam semmit" megkülönböztethetetlen lenne a
// „lefagytam"-tól, és a játék minden tétlen körnél megállna.
//
// ── BEMENET-KÉSLELTETÉS: MIÉRT KELL, ÉS MIÉRT ÉPP ENNYI ───────────────────
// A T. körben KIADOTT parancs a `T + KESLELTETES_KOR`. körben HAJTÓDIK VÉGRE.
// Ez adja azt az időt, amíg a csomag odaér a többiekhez. Enélkül minden gépnek
// meg kellene állnia a saját parancsa után, amíg a többieké megérkezik — az
// pedig szó szerint kattintásonkénti akadás lenne.
//
// A késleltetés ÁRA viszont valódi: a játékos kattint, és a sereg
// `KOR_TICK * KESLELTETES_KOR` tick múlva indul. 4 tick × 2 kör = 8 tick =
// 0,4 másodperc. Ez a felső határa annak, amit egy RTS-ben még nem érzünk
// ragadósnak, és pont ezért futott a sim EGYJÁTÉKOSBAN IS késleltetéssel a
// v0.1 óta: hogy a v0.8-ban ne derüljön ki hirtelen, hogy „elromlott az
// irányítás".
//
// ── A DESYNC-DETEKTOR MŰKÖDÉSE ────────────────────────────────────────────
// Minden csomag viszi a küldő ÁLLAPOT-HASHÉT egy KORÁBBI körről — arról,
// amelyiket már mindenki végrehajtotta. Nem a mostaniról: azt a többiek még ki
// sem számolhatták.
//
// ⚠️ EGY DETEKTOR, AMI SOSEM SÜL EL, ROSSZABB A SEMMINÉL, mert biztonságérzetet
// ad. Ezért a szonda nem csak azt vizsgálja, hogy két egyező futás egyezőnek
// LÁTSZIK-e, hanem SZÁNDÉKOSAN el is rontja az egyik oldalt, és megköveteli,
// hogy a detektor kiszúrja.
//
// ── ADAPTÍV KÖRHOSSZ (v0.8/4) ─────────────────────────────────────────────
// Rossz vonalon a fix körhossz elviselhetetlen: a lockstep körönként megáll,
// és a játék szaggat. A kézenfekvő ötlet — „növeljük a bemenet-késleltetést" —
// viszont NEM JÁRHATÓ:
//
//   ⚠️ A BEMENET-KÉSLELTETÉS AZT SZABJA MEG, MELYIK KÖRBEN HAJTÓDIK VÉGRE EGY
//   PARANCS. Ha az egyik gép 2-vel, a másik 3-mal számolna, ugyanaz a
//   kattintás MÁS KÖRBEN futna le a két gépen — vagyis azonnali desync. Ez nem
//   „ritkán jelentkező hiba", hanem szükségszerű.
//
// Ezért nem a késleltetés-SZÁM változik, hanem a KÖR HOSSZA tickben. Ugyanaz a
// két kör késleltetés hosszabb körökkel több valós időt fed le, tehát a
// csomagnak több ideje van megérkezni — a parancs viszont MINDEN GÉPEN
// ugyanabban a körben hajtódik végre.
//
// A megegyezés menete, és miért determinisztikus:
//
//   1. Minden csomag viszi a küldő KÉRT körhosszát (a saját megállásaiból).
//   2. A `K`. kör végrehajtásakor mindenkinek a kezében van az ÖSSZES játékos
//      `K`-ra szóló csomagja — különben nem is léphetne. Mindenki ugyanabból
//      az adatból veszi a MAXIMUMOT: aki a legrosszabb vonalon ül, az szabja
//      meg a tempót.
//   3. A döntés a `K + VALTAS_LEAD`. körre szól. Ez azért kell, mert a `K`.
//      kör végrehajtásakor a `K + KESLELTETES_KOR`. körre szóló csomag ÉPP
//      MOST megy ki — az arra a körre vonatkozó hossznak tehát már eldöntöttnek
//      kell lennie. A `KESLELTETES_KOR + 1` az első kör, amiről még senki nem
//      küldött.
//
// A körhossz így nem gépenkénti beállítás, hanem a MECCS állapota — ezért a
// kör első tickjét futó összegként tartjuk (`kovetkezoTick`), nem
// `kor * KOR_TICK`-ként.

import { KESLELTETES } from '../sim/sim.js';
import { mentes, betoltes } from '../sim/mentes.js';

/**
 * A kör ALAP hossza tickben. 20 Hz-en 4 tick = 5 kör másodpercenként.
 *
 * ⚠️ A v0.8/4 ÓTA EZ CSAK A KIINDULÁS. A kör hossza a hálózat minőségéhez
 * igazodik — lásd a fájl végi „ADAPTÍV KÖRHOSSZ" bekezdést.
 */
export const KOR_TICK = 4;

/** A kör hossza soha nem megy ez alá / fölé. */
export const KOR_TICK_MIN = 4;
export const KOR_TICK_MAX = 16;

/**
 * Ennyi körönként értékeljük újra, hogy jó-e a mostani körhossz. Elég ritkán
 * ahhoz, hogy a mérés ne egyetlen zökkenőre ugorjon, és elég sűrűn ahhoz, hogy
 * egy romló vonalra másodperceken belül reagáljon.
 */
const MERES_ABLAK = 20;

/**
 * A körhossz-változás ennyi körrel KÉSŐBB lép életbe, mint amikor eldőlt.
 * `KESLELTETES_KOR + 1`, és ez a legkisebb biztonságos érték — lásd az
 * indoklást a fájl végi bekezdésben.
 */
const VALTAS_LEAD = 3;

/**
 * Hány körrel későbbre szól a most kiadott parancs.
 *
 * KETTŐ a legkisebb értelmes szám: egyet a saját csomagunk útjára, egyet a
 * többiekére. Eggyel a leglassabb résztvevő minden körben megállítaná a
 * meccset; hárommal a 0,6 mp-es késleltetés már érezhetően ragadós.
 */
export const KESLELTETES_KOR = 2;

/**
 * Ennyi körrel korábbi hash megy a csomagban.
 *
 * A `P`. körre szóló csomagot akkor küldjük, amikor a `P - KESLELTETES_KOR`.
 * kört épp végrehajtottuk — az a LEGFRISSEBB, amiről már van ujjlenyomatunk.
 *
 * ⚠️ EZ A SZÁM NEM AZ, AMI A VIZSGÁLAT IDEJÉT MEGSZABJA. Az első változatban
 * a `lep()` egy KISZÁMOLT körre nézett rá (`kor - lemaradás`), és mérve SOHA
 * nem talált: mire a társ ujjlenyomata megérkezett arra a körre, a sajátunkat
 * már el is dobtuk. 899 kör futott le, NULLA hash-vizsgálattal — a detektor
 * ott volt, csak sosem szólalt meg. Ezért az összevetés most ESEMÉNYVEZÉRELT
 * (`_osszevet`): akkor fut, amikor a párja MEGÉRKEZIK, akármelyik oldalról.
 */
const HASH_LEMARADAS = KESLELTETES_KOR;

/** Ennyi kör után adjuk fel a várakozást és jelentünk kiesett játékost. */
const TURELEM_KOR = 250;   // 250 kör ≈ 50 másodperc

/** Ennyi környi ujjlenyomatot tartunk meg összevetésre. */
const TAROLT_KOR = 40;

export const ALLAPOT = { FUT: 0, VAR: 1, DESYNC: 2, KIESETT: 3 };
export const ALLAPOT_NEV = ['fut', 'vár a többiekre', 'DESYNC', 'játékos kiesett'];

export class Lockstep {
  /**
   * @param {import('../sim/sim.js').Sim} sim
   * @param {{
   *   jatekos:number, jatekosDb:number,
   *   kuld:(uzenet:object)=>void
   * }} opciok
   */
  constructor(sim, opciok) {
    this.sim = sim;
    this.jatekos = opciok.jatekos | 0;
    this.jatekosDb = opciok.jatekosDb | 0;
    this._kuld = opciok.kuld || (() => {});

    /** A KÖVETKEZŐ végrehajtandó kör sorszáma. */
    this.kor = 0;
    /**
     * A KÖVETKEZŐ kör ELSŐ TICKJE. Futó összeg, nem `kor * KOR_TICK`: a
     * körhossz változhat (v0.8/4), tehát a szorzás hazudna.
     */
    this.kovetkezoTick = 0;
    /** A MOSTANI körhossz, és a jövőre már eldöntött változások. */
    this.korHossz = KOR_TICK;
    this._korHosszTerv = new Map();
    /** Amit MI kérünk. A társak ugyanígy kérnek; a maximum nyer. */
    this._kertKorHossz = KOR_TICK;
    /** Megállások a mostani mérési ablakban. */
    this._ablakVarakozas = 0;
    this._ablakKor = 0;
    /** A helyben gyűjtött parancsok a KIADÁS alatt álló körre. */
    this._helyi = [];
    /**
     * Beérkezett csomagok: `kor → [jatekos] → parancsok`.
     * `Map`-et használunk, mert a körszám monoton nő és a régieket dobjuk —
     * egy tömb itt vagy végtelenül nőne, vagy eltolást kellene karbantartani.
     */
    this._csomagok = new Map();
    /** `kor → [jatekos] → hash`, a desync-vizsgálathoz. */
    this._hashek = new Map();
    /** A SAJÁT hash-eink körönként — ehhez hasonlítunk. */
    this._sajatHash = new Map();

    this.allapot = ALLAPOT.FUT;
    /** Hány körön át várunk már ugyanarra. */
    this._varakozas = 0;

    // ── MŰKÖDÉS-SZÁMLÁLÓK ───────────────────────────────────────────────
    // A determinizmus-kapu erre sem felel: egy lockstep, ami sosem lép és
    // sosem küld, tökéletesen reprodukálható.
    this.kuldottCsomag = 0;
    this.fogadottCsomag = 0;
    this.vegrehajtottKor = 0;
    this.vegrehajtottParancs = 0;
    this.hashVizsgalat = 0;
    /**
     * Hányszor kellett MEGÁLLNI, mert valakinek nem érkezett meg a csomagja.
     * Ez a lockstep legjellemzőbb viselkedése — ha nulla, akkor a vizsgálat
     * végig azonnali hálózaton futott, tehát a `VAR` ág ki sem próbáltatott.
     */
    this.varakozasDb = 0;
    /** Hányszor álltunk vissza pillanatképből (v0.8/3). */
    this.ujracsatlakozasDb = 0;
    /** Hányszor változott a körhossz (v0.8/4) — a szonda működés-száma. */
    this.korHosszValtas = 0;
    /** A desync körszáma, vagy -1. */
    this.desyncKor = -1;
    this.desyncMienk = 0;
    this.desyncOve = 0;
    this.desyncJatekos = -1;

    /** Elindult-e már (lásd `indit()`). */
    this._elindult = false;
  }

  /**
   * INDÍTÁS — az első `KESLELTETES_KOR` kör üres csomagjának elküldése.
   *
   * ⚠️ MIÉRT NEM A KONSTRUKTORBÓL. Először onnan ment, és mérve MEGBUKOTT: a
   * hívó a `Lockstep` létrehozása UTÁN köti be a szállítást (előbb kell a
   * `kuld` visszahívás, hogy legyen mit bekötni), tehát a konstruktorból
   * kiment csomagoknak még nem volt hova menniük. Az első gép kezdő csomagjai
   * a semmibe hullottak, a második gépéi nem — az egyik oldal két kört
   * lefutott, a másik egyet sem, és a meccs beragadt.
   *
   * Ez általános szabály, nem ennek az osztálynak a különcsége: EGY OBJEKTUM
   * NE KÜLDJÖN, MIELŐTT A HÍVÓ BEFEJEZTE A BEKÖTÉSÉT. A külön `indit()` teszi
   * ezt a sorrendet kimondottá ahelyett, hogy a hívó jóindulatára bízná.
   */
  indit(kezdoKor = 0) {
    if (this._elindult) return;
    this._elindult = true;
    // A `kezdoKor`. kör végrehajtásához az arra a körre szóló csomagok
    // kellenek — azokat viszont a `KESLELTETES_KOR`-ral előre küldjük, tehát
    // az első köröknek nincs valódi feladójuk. Ezek az üres csomagok töltik ki
    // a rést. ÚJRACSATLAKOZÁSNÁL ugyanez a rés keletkezik, csak nem a 0., hanem
    // a visszatérés körénél — ezért paraméteres a kezdet.
    for (let k = 0; k < KESLELTETES_KOR; k++) this._csomagKuld(kezdoKor + k);
  }

  /**
   * PILLANATKÉP egy ÚJRACSATLAKOZÓ JÁTÉKOSNAK (v0.8/3).
   *
   * ── MIÉRT PONT ITT LEHET KÉSZÍTENI ─────────────────────────────────────
   * A `Sim` állapota a `kor`-adik kör KEZDETÉN áll — pontosan azon a határon,
   * ahonnan a lockstep-hurok folytatható. Tick közben készített mentésből nem
   * lehetne visszatérni a körökbe: a visszatérő a kör közepén ébredne, és a
   * kör parancsai vagy kimaradnának, vagy másodszor is lefutnának.
   *
   * ── AMIT A MENTÉSEN FELÜL KÜLDÜNK ──────────────────────────────────────
   * ⚠️ A MÁR ELKÜLDÖTT, DE MÉG VÉGRE NEM HAJTOTT CSOMAGOKAT IS. A bemenet-
   * késleltetés miatt minden gép `KESLELTETES_KOR` körrel előre küld: a
   * visszatérés pillanatában tehát mindenkinek van 1-2 környi csomagja
   * „útban". Azokat a visszatérő már nem kaphatja meg a hálózatról (nem volt
   * kapcsolatban, amikor kimentek), és a lockstep nélkülük ÖRÖKRE várna rájuk
   * — a meccs a visszatéréssel állna meg végleg.
   *
   * A mentés a v0.7/2 formátuma. Ott vezettük be, hogy „a v0.8 újracsatlakozása
   * a saját felfedezett térképét kell visszakapja" — ez az a pillanat.
   */
  pillanatkep() {
    const csomagok = [];
    for (const [k, sor] of this._csomagok) {
      if (k < this.kor) continue;
      for (let j = 0; j < this.jatekosDb; j++) {
        if (sor[j] === null) continue;
        csomagok.push({ fajta: 'kor', kor: k, jatekos: j, parancsok: sor[j], hashKor: -1, hash: 0 });
      }
    }
    // RÖGZÍTETT SORREND: kör, azon belül játékos. A `Map` beszúrási sorrendje
    // a hálózat érkezési sorrendjét tükrözi, ami gépenként más — a visszatérő
    // viszont ugyanazt az állapotot kell kapja, akárki adta a pillanatképet.
    csomagok.sort((a, b) => (a.kor - b.kor) || (a.jatekos - b.jatekos));
    // ⚠️ A KÖRHOSSZ ÉS A MÁR ELDÖNTÖTT MENETREND IS ÁLLAPOT (v0.8/4). A
    // visszatérő különben az ALAP hosszal folytatná, miközben a többiek egy
    // megegyezett, hosszabb körrel futnak — és a kör HOSSZA szabja meg, melyik
    // tickre esnek a parancsok. Ez ugyanaz a hiba-osztály, mint a bemenet-
    // késleltetés gépenkénti eltérése: azonnali desync.
    const terv = [];
    for (const [k, h] of this._korHosszTerv) terv.push([k, h]);
    terv.sort((a, b) => a[0] - b[0]);
    return {
      kor: this.kor,
      kovetkezoTick: this.kovetkezoTick,
      korHossz: this.korHossz,
      korHosszTerv: terv,
      mentes: mentes(this.sim),
      csomagok,
    };
  }

  /**
   * VISSZAÁLLÁS egy pillanatképből — az újracsatlakozó oldalán.
   * @returns {{ok:boolean, hiba?:string}}
   */
  visszaallit(p) {
    if (!p || !p.mentes) return { ok: false, hiba: 'üres pillanatkép' };
    const e = betoltes(this.sim, p.mentes);
    if (!e.ok) return e;
    this.kor = p.kor | 0;
    this.kovetkezoTick = p.kovetkezoTick === undefined ? this.sim.tick : (p.kovetkezoTick | 0);
    this.korHossz = p.korHossz === undefined ? KOR_TICK : (p.korHossz | 0);
    this._korHosszTerv.clear();
    if (p.korHosszTerv) for (const [k, h] of p.korHosszTerv) this._korHosszTerv.set(k | 0, h | 0);
    this._kertKorHossz = this.korHossz;
    this._ablakKor = 0;
    this._ablakVarakozas = 0;
    this._csomagok.clear();
    this._hashek.clear();
    this._sajatHash.clear();
    this._helyi.length = 0;
    this.allapot = ALLAPOT.FUT;
    this._varakozas = 0;
    // A kapott csomagok UGYANAZON az úton mennek be, mint a hálózatról jövők.
    for (let i = 0; i < p.csomagok.length; i++) this.fogad(p.csomagok[i]);
    // ⚠️ A SAJÁT csomagjaink a rés köreire MÉG HIÁNYOZNAK: a pillanatkép a
    // TÁRSAKÉT hozta el, a mieinket viszont a kiesésünk alatt senki nem küldte
    // el helyettünk. Az `indit` pontosan ezt a rést tölti ki.
    this._elindult = false;
    this.indit(this.kor);
    this.ujracsatlakozasDb++;
    return { ok: true };
  }

  /**
   * A játékos parancsa. NEM megy azonnal a simbe — a `KESLELTETES_KOR`-ral
   * későbbi körbe kerül, és csak akkor hajtódik végre, ha mindenki csomagja
   * megvan arra a körre.
   */
  helyiParancs(p) {
    this._helyi.push(p);
  }

  /** Egy beérkezett csomag. A szállítás (WebSocket, hurok) hívja. */
  fogad(uzenet) {
    if (!uzenet || uzenet.fajta !== 'kor') return;
    const k = uzenet.kor | 0;
    const j = uzenet.jatekos | 0;
    if (j < 0 || j >= this.jatekosDb) return;

    let sor = this._csomagok.get(k);
    if (!sor) { sor = new Array(this.jatekosDb).fill(null); this._csomagok.set(k, sor); }
    // ⚠️ A MÁSODIK CSOMAG UGYANARRA A KÖRRE NEM ÍRHATJA FELÜL AZ ELSŐT. Egy
    // újraküldés vagy egy hibás kliens különben a már végrehajtott kör
    // parancsait cserélhetné le — a többi gépen viszont a régi futott le.
    if (sor[j] !== null) return;
    sor[j] = uzenet.parancsok || [];
    // A KÉRT KÖRHOSSZ a csomag mellékterméke. A `sor` tömbre akasztjuk, hogy a
    // `lep()` egyetlen helyről olvashassa mindenkiét — külön `Map` csak még egy
    // ürítendő tárolót jelentene.
    if (!sor.kertKorHossz) sor.kertKorHossz = KOR_TICK_MIN;
    const kk = uzenet.kertKorHossz | 0;
    if (kk > sor.kertKorHossz) sor.kertKorHossz = kk;
    this.fogadottCsomag++;

    if (uzenet.hashKor !== undefined && uzenet.hashKor >= 0) {
      let h = this._hashek.get(uzenet.hashKor);
      if (!h) { h = new Array(this.jatekosDb).fill(null); this._hashek.set(uzenet.hashKor, h); }
      if (h[j] === null) h[j] = uzenet.hash | 0;
      // AZONNAL összevetjük, ha már megvan a sajátunk arra a körre. A társ
      // lehet előttünk is, mögöttünk is — a vizsgálat mindkét irányban ugyanaz.
      this._osszevet(uzenet.hashKor | 0);
    }
  }

  /**
   * Egy KÖR végrehajtása, ha lehet.
   *
   * @returns {number} hány tickkel léptünk (0 = várunk)
   */
  lep() {
    if (!this._elindult) return 0;   // `indit()` nélkül nincs mire várni
    if (this.allapot === ALLAPOT.DESYNC || this.allapot === ALLAPOT.KIESETT) return 0;

    const sor = this._csomagok.get(this.kor);
    if (!sor || !this._teljes(sor)) {
      this.allapot = ALLAPOT.VAR;
      this.varakozasDb++;
      this._ablakVarakozas++;
      if (++this._varakozas > TURELEM_KOR) this.allapot = ALLAPOT.KIESETT;
      return 0;
    }
    this._varakozas = 0;
    this.allapot = ALLAPOT.FUT;

    // ── A KÖRHOSSZ MEGEGYEZÉSE (v0.8/4) ────────────────────────────────
    // A mostani kör hosszát egy KORÁBBI kör döntötte el; ha nincs rá terv, az
    // eddigi marad. A tervet innen már senki nem írhatja felül — ezért lehet
    // biztos benne minden gép, hogy ugyanannyi ticket futtat.
    if (this._korHosszTerv.has(this.kor)) {
      const uj = this._korHosszTerv.get(this.kor);
      this._korHosszTerv.delete(this.kor);
      if (uj !== this.korHossz) { this.korHossz = uj; this.korHosszValtas++; }
    }
    const hossz = this.korHossz;

    // ── A PARANCSOK BEADÁSA ────────────────────────────────────────────
    // ⚠️ JÁTÉKOS-SORREND SZERINT, NÖVEKVŐ INDEXSZEL. A csomagok érkezési
    // sorrendje gépenként MÁS — az a hálózat dolga —, a végrehajtás sorrendje
    // viszont nem lehet az. Ez a ciklus az egyetlen hely, ahol ez eldől.
    const elsoTick = this.kovetkezoTick;
    for (let j = 0; j < this.jatekosDb; j++) {
      const lista = sor[j];
      for (let i = 0; i < lista.length; i++) {
        if (this.sim.parancsTickre(elsoTick, lista[i])) this.vegrehajtottParancs++;
      }
    }

    // ── A JÖVŐ KÖRHOSSZÁNAK ELDÖNTÉSE ──────────────────────────────────
    // MINDENKI ugyanebből az adatból számol: az összes játékos EBBEN a körben
    // beérkezett csomagjából, a maximumot véve. A legrosszabb vonalon ülő
    // szabja meg a tempót — ez a lockstep alaptermészete, nem külön szabály.
    // ⚠️ A MAXIMUM A SOR-OBJEKTUMON ÜL, NEM A JÁTÉKOSONKÉNTI ELEMEKEN. Első
    // nekifutásra `sor[j].kertKorHossz`-t olvastam — csakhogy `sor[j]` az
    // adott játékos PARANCS-LISTÁJA, azon nincs ilyen mező. A `fogad` a `sor`
    // tömbre teszi, és menet közben már maximumot is képez belőle (a maximum
    // sorrendfüggetlen, tehát az érkezési sorrend nem számít). A hiba csendes
    // volt: a kért hossz szabályosan felment 16-ra, a megegyezés viszont végig
    // a 4-es alapértéket adta vissza, és a kör sosem nyúlt meg.
    const kert = sor.kertKorHossz || KOR_TICK_MIN;
    this._korHosszTerv.set(this.kor + VALTAS_LEAD, kert);

    // ── A TICKEK ───────────────────────────────────────────────────────
    for (let t = 0; t < hossz; t++) this.sim.lep();
    this.kovetkezoTick += hossz;

    // A kör UTÁNI állapot ujjlenyomata. Ezt küldjük majd `HASH_LEMARADAS`
    // körrel később, és ehhez hasonlítjuk a többiekét.
    this._sajatHash.set(this.kor, this.sim.allapotHash());
    // A MÁSIK IRÁNY: lehet, hogy a társ ujjlenyomata már megérkezett erre a
    // körre, mielőtt mi eljutottunk volna ide.
    this._osszevet(this.kor);
    this._regiekTorlese();

    this._csomagok.delete(this.kor);
    this.kor++;
    this.vegrehajtottKor++;
    this._merestZar();
    // A most kiadott parancsok a `KESLELTETES_KOR`-ral későbbi körbe mennek.
    this._csomagKuld(this.kor + KESLELTETES_KOR - 1);
    return hossz;
  }

  /**
   * A MÉRÉSI ABLAK LEZÁRÁSA — mit kérjünk a következő ablakra?
   *
   * A jelzés a MEGÁLLÁSOK ARÁNYA: hányszor kellett várnunk a lefutott körökhöz
   * képest. Nem valós időt mérünk, és ez tudatos — az óra a v0.8-ban is a
   * hálózaté, nem a szimulációé, és egy `performance.now()` alapú szabályozó
   * gépenként MÁS körhosszt kérne. A megállás-szám viszont a saját hurkunk
   * megfigyelése, tehát mindenki a maga vonaláról nyilatkozik, és a
   * MEGEGYEZÉS (maximum) hozza össze őket.
   *
   * A lépés egyszerre EGY fokozat. A hirtelen ugrás oda-vissza lengene: egy
   * hosszabb kör kevesebb megállást ad, amitől azonnal vissza akarnánk rövidre,
   * amitől megint megállnánk.
   */
  _merestZar() {
    if (++this._ablakKor < MERES_ABLAK) return;
    const megallas = this._ablakVarakozas;
    this._ablakKor = 0;
    this._ablakVarakozas = 0;

    // Küszöbök: az ablak negyedénél többször megállni már szaggatás; a
    // huszada alatt viszont pazarlás a hosszú kör (fölösleges késleltetés).
    if (megallas > MERES_ABLAK / 4) {
      this._kertKorHossz = Math.min(KOR_TICK_MAX, this._kertKorHossz + 2);
    } else if (megallas < MERES_ABLAK / 20) {
      this._kertKorHossz = Math.max(KOR_TICK_MIN, this._kertKorHossz - 1);
    }
  }

  /** Megvan-e minden játékos csomagja erre a körre? */
  _teljes(sor) {
    for (let j = 0; j < this.jatekosDb; j++) if (sor[j] === null) return false;
    return true;
  }

  /**
   * A helyi csomag elküldése egy körre. AKKOR IS ELMEGY, HA ÜRES — lásd a
   * fejlécet: a néma játékos különben megkülönböztethetetlen a lefagyottól.
   */
  _csomagKuld(kor) {
    const hashKor = kor - KESLELTETES_KOR - HASH_LEMARADAS;
    const uzenet = {
      fajta: 'kor',
      kor,
      jatekos: this.jatekos,
      parancsok: this._helyi,
      hashKor: this._sajatHash.has(hashKor) ? hashKor : -1,
      hash: this._sajatHash.has(hashKor) ? this._sajatHash.get(hashKor) : 0,
      kertKorHossz: this._kertKorHossz,
    };
    this._helyi = [];
    this.kuldottCsomag++;
    // A SAJÁT csomagunkat is a `fogad`-on át vesszük magunkhoz. Így pontosan
    // ugyanaz az út fut le rá, mint a többiekére — nincs „helyi rövidzár",
    // ami a hálózaton máshogy viselkedne.
    this.fogad(uzenet);
    this._kuld(uzenet);
  }

  /**
   * DESYNC-VIZSGÁLAT egy körre. AKKOR fut, amikor az összevetéshez szükséges
   * MÁSODIK adat megérkezik — akár a miénk (végrehajtottuk a kört), akár a
   * társé (befutott a csomagja). Így a sorrend nem számít, és nem kell
   * eltalálni, mikor van egyszerre mindkettő a kezünkben.
   */
  _osszevet(kor) {
    if (kor < 0) return;
    const ovek = this._hashek.get(kor);
    const mienk = this._sajatHash.get(kor);
    if (!ovek || mienk === undefined) return;
    let mind = true;
    for (let j = 0; j < this.jatekosDb; j++) {
      if (j === this.jatekos) continue;
      if (ovek[j] === null) { mind = false; continue; }
      this.hashVizsgalat++;
      if ((ovek[j] | 0) !== (mienk | 0)) {
        this.allapot = ALLAPOT.DESYNC;
        this.desyncKor = kor;
        this.desyncMienk = mienk | 0;
        this.desyncOve = ovek[j] | 0;
        this.desyncJatekos = j;
        return;
      }
      // A már összevetett ujjlenyomatot kivesszük, hogy ne számoljuk kétszer.
      ovek[j] = null;
    }
    if (mind) { this._hashek.delete(kor); this._sajatHash.delete(kor); }
  }

  /**
   * A két ujjlenyomat-tár a meccs hosszával nőne, ha csak az összevetéskor
   * ürülne: egy kiesett játékos ujjlenyomata sosem érkezik meg, tehát a köre
   * sosem zárul le. Ezért mindent eldobunk, ami `TAROLT_KOR`-nál régebbi — ha
   * addig nem volt mivel összevetni, később sem lesz.
   */
  _regiekTorlese() {
    const hatar = this.kor - TAROLT_KOR;
    if (hatar < 0) return;
    for (const k of this._sajatHash.keys()) if (k < hatar) this._sajatHash.delete(k);
    for (const k of this._hashek.keys()) if (k < hatar) this._hashek.delete(k);
  }

  /** Olvasható pillanatkép a HUD-nak és a szondának. */
  osszesites() {
    return {
      kor: this.kor,
      allapot: this.allapot,
      allapotNev: ALLAPOT_NEV[this.allapot],
      kuldott: this.kuldottCsomag,
      fogadott: this.fogadottCsomag,
      vegrehajtottKor: this.vegrehajtottKor,
      vegrehajtottParancs: this.vegrehajtottParancs,
      hashVizsgalat: this.hashVizsgalat,
      varakozas: this.varakozasDb,
      ujracsatlakozas: this.ujracsatlakozasDb,
      korHossz: this.korHossz,
      korHosszValtas: this.korHosszValtas,
      kertKorHossz: this._kertKorHossz,
      desyncKor: this.desyncKor,
      desyncJatekos: this.desyncJatekos,
      desyncMienk: this.desyncMienk,
      desyncOve: this.desyncOve,
    };
  }
}

export { KESLELTETES };
