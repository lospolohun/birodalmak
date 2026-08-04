// AGE OF THE CRYSTALS — CIVILIZÁCIÓK (v0.9/1): a nyolc nép ADATRÉTEGE.
//
// ── MIÉRT KÜLÖN RÉTEG, ÉS MIÉRT PONT ILYEN ────────────────────────────────
// A civ ugyanabba a bajba futna bele, mint a technológia a v0.5-ben: bele-
// szól a sebzésbe, a páncélba, a gyűjtésbe, az árakba, a képzési időbe és a
// népességbe. Ha mindegyik réteg maga tárolná a saját civ-kivételét, nyolc
// nép × hét hatás = ötvenhat elszórt `if`, és nincs egyetlen hely, ahol meg
// lehetne nézni, mit tud egy csapat. Ez a fájl az a hely — pontosan úgy,
// ahogy a `technologia.js` a kutatásoknál.
//
// A rétegek NEM ide írnak, hanem innen KÉRDEZNEK, és a kérdés alakja ugyanaz,
// mint a technológiánál: `sebzesBonusz(csapat, támadástípus)`,
// `utemSzazalek(csapat, nyersanyag)`. Egy új civ így egyetlen TÁBLÁZAT-SOR,
// nem hét fájl átírása.
//
// ── MIÉRT ELŐRE SZÁMOLT A LEKÉRDEZÉS ──────────────────────────────────────
// A `sebzesBonusz` és a `pancelBonusz` a HARC FORRÓ ÚTJÁN fut: 1600 egységnél
// tickenként több száz hívás. Ezért a civ bónuszait NEM futásidőben járjuk be
// egy listából, hanem a `beallit()` egyszer beírja őket pici tömbökbe, és a
// forró út CSAK OLVAS — egyetlen tömb-indexelés, semmi keresés. A v0.1
// tick-költsége nem mozdulhat egy adatrétegtől.
//
// ── DETERMINIZMUS ─────────────────────────────────────────────────────────
// MINDEN hatás EGÉSZ: vagy egész SZÁZALÉK (alap 100), vagy egész ELTOLÁS.
// Sosem lebegőpontos szorzó. Egy `* 1.15` a gyűjtés-ütemen gépenként más
// maradékot hagyna, és tízezer tick alatt a két gépen más pillanatban esne le
// az utolsó fa — onnan pedig más a korszakváltás ideje, más a hadsereg, és két
// különböző meccs fut. A százalékot mindenhol EGÉSZ OSZTÁS alkalmazza
// (`érték * szazalek / 100 | 0`), ahogy a `harc.js` és a `technologia.js`.
//
// ⚠️ A TECHNOLÓGIA ÉS A CIV SORRENDJE RÖGZÍTETT: előbb a technológia hat, és a
// civ százaléka a MÁR EGÉSZRE VÁGOTT eredményre megy. Nem mindegy — a két
// egész osztás nem felcserélhető (`12*125/100=15`, majd `15*115/100=17`, míg
// fordítva 16). Egy szám, két gép: a sorrendet a beakasztási pontok rögzítik,
// és sosem szabad megcserélni.
//
// ── A BALANSZ-ELV: MINDEN CIVNEK VAN HÁTRÁNYA IS ──────────────────────────
// Ez a fájl legfontosabb szabálya, és szándékosan itt áll, nem a doksiban.
// Ha egy civ csak pozitív bónuszokat kap, akkor nincs választás, csak egy
// „legjobb" civ és hét dísz. A táblázat MINDEN sorában van legalább egy
// negatív tétel, és ez a jövőbeli bővítésre is kötelező.
//
// A számok SZÁNDÉKOSAN szerényebbek, mint amit elsőre gondolna az ember
// (±5–20 %, ±1 páncél). A v0.13 QA-köre fogja finomhangolni, és felfelé húzni
// mindig könnyebb, mint visszavenni: egy túl erős civ köré a játékosok
// stratégiát építenek, és a nyesés utólag mindig „elvétel"-nek érződik.
//
// ── AMI ITT SZÁNDÉKOSAN NINCS: AZ EGYEDI EGYSÉGEK ─────────────────────────
// A v0.9 másik fele az egyedi egység civenként — az NEM adat, hanem roster-
// bővítés, és pont ezért nem fér ebbe a fájlba. Ma öt egységtípus van
// (`TIPUS` a `units.js`-ben), és egy hatodik legalább ezeket érintené:
//
//   · `units.js`      — `TIPUS`, sebesség-, sugár- és animáció-táblák
//   · `harc.js`       — `MAX_HP`, `ALAP_SEBZES`, `TAMADAS_TIPUS`,
//                       `PANCEL_TIPUS`, `PANCEL_ERTEK`, `UTEM`, `HATOTAV`,
//                       `TAVOLSAGI` — mind index-párhuzamos a `TIPUS`-szal
//   · `kepzes.js`     — `EGYSEG_AR`, `EGYSEG_IDO`, `EGYSEG_NEP`, `KEPEZ`
//   · `render/units3d.js` — a `& 3` maszkolás (az ötödik típus már saját
//                       réteget kapott: `ostrom3d.js`)
//   · a mentés és az `allapotHash()` érintetlen marad (a típus már benne van)
//
// Ezért a v0.9/1 CSAK adat: a nyolc civ ugyanazon az öt egységen játszik,
// eltérő számokkal. Az egyedi egységek a v0.9/2 dolga, és ott a `TIPUS`
// bővítése az ELSŐ lépés, nem az utolsó.

import { TAMADAS } from './harc.js';
import { NYERS } from './eroforras.js';
import { TIPUS } from './units.js';

/** A civilizációk. A sorrend a tömb-indexük — sosem cseréljük fel. */
export const CIV = {
  KRISTALYKOVACS: 0,
  PUSZTAI_LOVAS: 1,
  ERDEI_VADASZ: 2,
  HEGYI_BANYASZ: 3,
  FOLYAMI_KERESKEDO: 4,
  BASTYAORZO: 5,
  FENYHOZO: 6,
  SIVATAGI_PORTYAZO: 7,
};
export const CIV_DB = 8;

/**
 * „Nincs civ" — a semleges felállás, minden érték az alapon marad.
 *
 * Nem a 0. civ az alapértelmezés: a szonda régi forgatókönyvei és a v0.1-es
 * regresszió-őr civ nélkül futnak, és ha a 0. civ csendben rájuk ülne, a
 * v0.1 hash-számai megváltoznának — azok pedig a `qa/V0.1_EREDMENY.md`-hez
 * vannak kötve.
 */
export const CIV_NINCS = -1;

export const CIV_NEV = [
  'Kristálykovácsok',
  'Pusztai lovasok',
  'Erdei vadászok',
  'Hegyi bányászok',
  'Folyami kereskedők',
  'Bástyaőrzők',
  'Fényhozók',
  'Sivatagi portyázók',
];

/** Rövid, JÁTÉKOSNAK szóló leírás — a civ-választó és a HUD ezt mutatja. */
export const CIV_LEIRAS = [
  'A kristályt ők ismerik a legjobban, és a fegyvereiken meg is látszik: '
  + 'minden katonájuk eggyel vastagabb páncélt hord. A jó acél viszont drága.',
  'Nyeregben nőttek fel: a lovagjuk olcsóbb és gyorsabban kiáll. '
  + 'Cserébe könnyű szerkezetekben laknak — az épületeik hamar leégnek.',
  'Az erdő az otthonuk: gyorsan fát vágnak és jól lőnek. '
  + 'A kőfejtéshez viszont nincs türelmük.',
  'A hegy gyomrában dolgoznak: sokkal gyorsabban fejtik a követ és a kristályt, '
  + 'és olcsóbban építenek. A katonáikat viszont lassan képzik ki.',
  'Kereskedő nép: a munkásaik többet cipelnek, és több embert bírnak el. '
  + 'A közelharchoz nem sok kedvük van.',
  'Falak mögött élnek: az épületeik sokkal többet bírnak, a katonáik '
  + 'páncélosabbak. A gazdaságuk viszont végig lassabb.',
  'A fény papjai gyorsan sorakoztatnak, és sokkal nagyobb hadat tartanak el. '
  + 'A templomaik és a műhelyeik viszont sokba kerülnek.',
  'Portyázó nép: olcsó, sok katona és bőséges élelem. '
  + 'A védelemre viszont nem költenek — a páncéljuk gyenge.',
];

// ── A HATÁSOK KÓDJAI ─────────────────────────────────────────────────────
// Számok, nem stringek: a táblázat így nyers `Int32`-szerű adat marad, és a
// `beallit()` egy `switch`-csel osztja szét — pont úgy, mint a
// `Technologia._beall()`. Objektum-kulcsokat sosem járunk be (`for…in` tilos).
const HATAS = {
  SEBZES: 0,       // index = TAMADAS.*      · érték = eltolás
  PANCEL: 1,       // index nem számít       · érték = eltolás
  UTEM: 2,         // index = NYERS.* / MIND · érték = százalék-eltolás
  CIPEL: 3,        // index nem számít       · érték = eltolás
  EPULET_HP: 4,    // index nem számít       · érték = százalék-eltolás
  EPULET_AR: 5,    // index nem számít       · érték = százalék-eltolás
  EGYSEG_AR: 6,    // index = TIPUS.* / MIND · érték = százalék-eltolás
  EGYSEG_IDO: 7,   // index = TIPUS.* / MIND · érték = százalék-eltolás
  NEPESSEG: 8,     // index nem számít       · érték = eltolás (fő)
};

/** „Minden alfajtára" — a `NYERS`/`TIPUS` index helyén. */
const MIND = -1;

/**
 * Hány egységtípusra tartunk ár- és idő-szorzót (`TIPUS` mérete).
 *
 * A v0.9/2-ben 5-ről 6-ra nőtt (`TIPUS.EGYEDI`). Ez fontosabb, mint amilyennek
 * látszik: a `MIND` indexű bónuszok itt terülnek szét, tehát a Kristálykovácsok
 * „minden egység 10 %-kal drágább" tétele az EGYEDI egységükre is hat — ahogy
 * kell. Ha a szám 5 maradt volna, a nyolcból négy nép egyedi egysége csendben
 * kimaradt volna a saját népe hátrányából.
 */
export const EGYSEG_TIPUS_DB = 6;

/**
 * A NYOLC CIV BÓNUSZ-TÁBLÁZATA.
 *
 * Soronként `[hatás, index, érték]` hármasok. A tábla LAPOS számokból áll,
 * hogy a v0.13-as hangolás egyetlen szám átírása legyen, ne kódmódosítás.
 *
 * ⚠️ MINDEN SORBAN VAN LEGALÁBB EGY NEGATÍV TÉTEL. Ha valaki új civet vesz
 * fel csupa pozitívummal, az nem „erős civ", hanem a választás megszüntetése.
 */
const CIV_BONUSZ = [
  // 0 — KRISTÁLYKOVÁCSOK: páncélos, kristály-erős, de drágán képez.
  [
    [HATAS.UTEM, NYERS.KRISTALY, +15],
    [HATAS.PANCEL, MIND, +1],
    [HATAS.EGYSEG_AR, MIND, +10],
  ],
  // 1 — PUSZTAI LOVASOK: a lovag a nemzeti egységük, a bázisuk viszont papír.
  [
    [HATAS.EGYSEG_AR, TIPUS.LOVAG, -10],
    [HATAS.EGYSEG_IDO, TIPUS.LOVAG, -15],
    [HATAS.EPULET_HP, MIND, -10],
  ],
  // 2 — ERDEI VADÁSZOK: fa és nyíl; kőbe törik a kedvük.
  [
    [HATAS.UTEM, NYERS.FA, +15],
    [HATAS.SEBZES, TAMADAS.NYIL, +1],
    [HATAS.UTEM, NYERS.KO, -10],
  ],
  // 3 — HEGYI BÁNYÁSZOK: a kő ÉS a kristály népe, lassú kaszárnyával fizetve.
  //
  // ⚠️ A +20 A GYAKORLATBAN +12,5 % VOLT. A kő alap-üteme 8
  // (`munkas.js` → `UTEM`), és a százalék EGÉSZ osztással megy: 8·120/100 = 9,6
  // → 9. A tábla tehát húsz százalékot ígért, és tizenkettő és felet adott. A
  // +25 pont egész eredményt ad (8·125/100 = 10), vagyis a leírt szám végre
  // IGAZ is. A kicsi alapütemű nyersanyagoknál ez általános csapda.
  //
  // ⚠️ ÉS EZ MÉG ÍGY IS CSAK A GAZDASÁG HATODA. Mérve (t=8000, nehéz, mindkét
  // oldalon ugyanaz a nép, hogy a pályaoldal kiessen): a Hegyi bányász
  // −4,6 %-kal termelt a semleges felálláshoz képest, a Folyami kereskedő
  // +29,5 %-kal. A KŐ-bónusz a munkaerő ~15 %-ára hat, tehát a teljes
  // gazdaságon +2–4 % — miközben a nép egy MINDENRE ható −10 %-os képzési
  // idővel fizet érte. Egy szűk előny és egy széles hátrány: ez volt a
  // „2050 vs 6885" mögött, nem a gép ügyetlensége.
  //
  // A második ütem-sor ezt teszi helyre, és nem véletlenül a KRISTÁLYON: a
  // kristály a hegy gyomrában terem (téma), a v0.16 óta pedig két korszak ÉS
  // két technológia fizetőeszköze (`technologia.js`) — vagyis a bányász népnek
  // most már van mire váltania a földalatti előnyét. 9·125/100 = 11,25 → 11.
  [
    [HATAS.UTEM, NYERS.KO, +25],
    [HATAS.UTEM, NYERS.KRISTALY, +25],
    [HATAS.EPULET_AR, MIND, -10],
    [HATAS.EGYSEG_IDO, MIND, +10],
  ],
  // 4 — FOLYAMI KERESKEDŐK: logisztika és népesség, gyenge közelharccal.
  //
  // ⚠️ A +5 CIPELÉS A TÁBLA LEGERŐSEBB TÉTELE VOLT, ÉS EZ NEM LÁTSZOTT RAJTA.
  // A munkás alapból 10-et bír el (`munkas.js` → `KAPACITAS`), tehát a +5
  // ÖTVEN SZÁZALÉK — a fejléc viszont ±5–20 %-os sávot mond ki magára a
  // táblázatra nézve. Ráadásul MINDEN nyersanyagra és minden fordulóra hat,
  // vagyis az egyetlen GLOBÁLIS gazdasági szorzó a nyolc nép között, és a nép
  // hátránya (−1 közelharci sebzés) a gazdaságához hozzá sem ér.
  //
  // Mérve (t=8000, ugyanaz a nép mindkét oldalon): +29,5 % összes termelés a
  // semlegeshez képest — a második legjobb gazdaságú nép ennek a töredéke.
  // A +3 (30 % kapacitás) így is a tábla legerősebb gazdasági tétele marad, és
  // a „kereskedő nép" ígéretét is tartja; csak nem kétszer akkora, mint amit a
  // saját fejlécünk megenged.
  [
    [HATAS.CIPEL, MIND, +3],
    [HATAS.NEPESSEG, MIND, +10],
    [HATAS.SEBZES, TAMADAS.VAGO, -1],
    [HATAS.SEBZES, TAMADAS.SZURO, -1],
  ],
  // 5 — BÁSTYAŐRZŐK: a védekezés civje, végig lassabb gazdasággal.
  [
    [HATAS.EPULET_HP, MIND, +20],
    [HATAS.PANCEL, MIND, +1],
    [HATAS.UTEM, MIND, -5],
  ],
  // 6 — FÉNYHOZÓK: nagy had, gyors sorakozó, drága épületekkel.
  [
    [HATAS.EGYSEG_IDO, MIND, -10],
    [HATAS.NEPESSEG, MIND, +20],
    [HATAS.EPULET_AR, MIND, +15],
  ],
  // 7 — SIVATAGI PORTYÁZÓK: sok olcsó katona, semmi páncél.
  [
    [HATAS.EGYSEG_AR, MIND, -10],
    [HATAS.UTEM, NYERS.ETEL, +10],
    [HATAS.PANCEL, MIND, -1],
  ],
];

export class Civ {
  /**
   * @param {number} csapatDb
   * @param {import('./sim.js').Sim} sim
   */
  constructor(csapatDb, sim) {
    this.csapatDb = csapatDb | 0;
    this.sim = sim;
    const cs = this.csapatDb;

    /** Melyik civ melyik csapaté. `CIV_NINCS` = semleges. */
    this.civ = new Int32Array(cs).fill(CIV_NINCS);

    // ── ELŐRE SZÁMOLT BÓNUSZOK ──────────────────────────────────────────
    // Ezeket CSAK a `beallit()` írja, és a forró út CSAK olvassa.
    /** `sebzes[csapat * 4 + támadástípus]` — a `TAMADAS` négy fajtájára. */
    this.sebzes = new Int32Array(cs * 4);
    /** Lapos páncél-eltolás. LEHET NEGATÍV (portyázók). */
    this.pancel = new Int32Array(cs);
    /** `utem[csapat * 4 + nyersanyag]` SZÁZALÉKBAN (alap: 100). */
    this.utem = new Int32Array(cs * 4).fill(100);
    /** Cipelési kapacitás-többlet. */
    this.cipel = new Int32Array(cs);
    /** Épület-életerő SZÁZALÉKBAN (alap: 100). */
    this.epuletHp = new Int32Array(cs).fill(100);
    /** Épület-ár SZÁZALÉKBAN (alap: 100). */
    this.epuletAr = new Int32Array(cs).fill(100);
    /** `egysegAr[csapat * 5 + típus]` SZÁZALÉKBAN (alap: 100). */
    this.egysegAr = new Int32Array(cs * EGYSEG_TIPUS_DB).fill(100);
    /** `egysegIdo[csapat * 5 + típus]` SZÁZALÉKBAN (alap: 100). */
    this.egysegIdo = new Int32Array(cs * EGYSEG_TIPUS_DB).fill(100);
    /** Népesség-plafon ELTOLÁS fő-ben (a `NEPESSEG_PLAFON`-hoz adódik). */
    this.nepesseg = new Int32Array(cs);

    /**
     * Statisztika a szondának: hány bónusz-sor íródott be, és hányszor
     * utasítottunk el beállítást.
     *
     * ⚠️ EZ NEM DÍSZ. A determinizmus-kapu nem működés-kapu: egy civ-réteg,
     * ami sosem fut le, tökéletesen reprodukálható — a `beallit()` elmaradása
     * vagy egy rossz civ-index csendben a semleges alapon hagyná mind a nyolc
     * népet, és a hash zöld maradna. A szonda ezt a számot kérdezi meg.
     */
    this.bonuszDb = new Int32Array(cs);
    this.elutasitva = new Int32Array(cs);
  }

  /** Teljes visszaállítás — az újrafelállás hívja. */
  nullaz() {
    this.civ.fill(CIV_NINCS);
    this.bonuszDb.fill(0);
    this.elutasitva.fill(0);
    for (let cs = 0; cs < this.csapatDb; cs++) this._alapra(cs);
  }

  /**
   * Egy csapat összes bónuszának visszaállítása alapra.
   *
   * Külön metódus, mert a `beallit()` is ezzel kezd: a civ-választás a meccs
   * ELŐTT akárhányszor módosulhat (menü, szonda-forgatókönyv), és ha csak
   * hozzáadnánk — mint a technológia, ami sosem vonható vissza —, két
   * választás bónuszai összeadódnának. A technológiánál ez helyes, itt
   * hibás lenne.
   */
  _alapra(cs) {
    const n4 = cs * 4;
    for (let k = 0; k < 4; k++) { this.sebzes[n4 + k] = 0; this.utem[n4 + k] = 100; }
    this.pancel[cs] = 0;
    this.cipel[cs] = 0;
    this.epuletHp[cs] = 100;
    this.epuletAr[cs] = 100;
    const n5 = cs * EGYSEG_TIPUS_DB;
    for (let k = 0; k < EGYSEG_TIPUS_DB; k++) {
      this.egysegAr[n5 + k] = 100;
      this.egysegIdo[n5 + k] = 100;
    }
    this.nepesseg[cs] = 0;
  }

  /**
   * CIV BEÁLLÍTÁSA egy csapatnak.
   *
   * A meccs KEZDETE előtt hívandó (a v0.11 menüje, addig a szonda-forgatókönyv
   * és a `Sim` felállása). Futás közbeni váltás technikailag működik — az
   * előre számolt tömbök újraíródnak —, de a JÁTÉK szintjén nem szabad: a már
   * megépült épületek életereje a lerakáskori százalékkal született, és egy
   * menet közbeni váltás azt visszamenőleg nem javítaná ki. Ugyanaz a
   * megfontolás, mint a falazásnál (`epuletek.js`).
   *
   * @param {number} csapat
   * @param {number} civ `CIV.*` vagy `CIV_NINCS`
   * @returns {boolean} beállt-e
   */
  beallit(csapat, civ) {
    if (csapat < 0 || csapat >= this.csapatDb) return false;
    const c = civ | 0;
    if (c !== CIV_NINCS && (c < 0 || c >= CIV_DB)) { this.elutasitva[csapat]++; return false; }

    this._alapra(csapat);
    this.civ[csapat] = c;
    this.bonuszDb[csapat] = 0;
    if (c === CIV_NINCS) return true;

    const sorok = CIV_BONUSZ[c];
    for (let s = 0; s < sorok.length; s++) {
      const sor = sorok[s];
      this._hat(csapat, sor[0], sor[1], sor[2]);
      this.bonuszDb[csapat]++;
    }
    return true;
  }

  /**
   * EGY bónusz-sor beírása az előre számolt tömbökbe.
   *
   * A `MIND` index nem futásidejű elágazás a lekérdezésben, hanem ITT terül
   * szét minden alfajtára — így a forró úton nem kell tudni róla, hogy a
   * bónusz „mindenre" szólt-e vagy egyetlen típusra.
   */
  _hat(cs, hatas, index, ertek) {
    switch (hatas) {
      case HATAS.SEBZES:
        if (index === MIND) {
          for (let k = 0; k < 4; k++) this.sebzes[cs * 4 + k] += ertek;
        } else if (index >= 0 && index < 4) {
          this.sebzes[cs * 4 + index] += ertek;
        }
        break;
      case HATAS.PANCEL:
        this.pancel[cs] += ertek;
        break;
      case HATAS.UTEM:
        if (index === MIND) {
          for (let k = 0; k < 4; k++) this.utem[cs * 4 + k] += ertek;
        } else if (index >= 0 && index < 4) {
          this.utem[cs * 4 + index] += ertek;
        }
        break;
      case HATAS.CIPEL:
        this.cipel[cs] += ertek;
        break;
      case HATAS.EPULET_HP:
        this.epuletHp[cs] += ertek;
        break;
      case HATAS.EPULET_AR:
        this.epuletAr[cs] += ertek;
        break;
      case HATAS.EGYSEG_AR:
        if (index === MIND) {
          for (let k = 0; k < EGYSEG_TIPUS_DB; k++) this.egysegAr[cs * EGYSEG_TIPUS_DB + k] += ertek;
        } else if (index >= 0 && index < EGYSEG_TIPUS_DB) {
          this.egysegAr[cs * EGYSEG_TIPUS_DB + index] += ertek;
        }
        break;
      case HATAS.EGYSEG_IDO:
        if (index === MIND) {
          for (let k = 0; k < EGYSEG_TIPUS_DB; k++) this.egysegIdo[cs * EGYSEG_TIPUS_DB + k] += ertek;
        } else if (index >= 0 && index < EGYSEG_TIPUS_DB) {
          this.egysegIdo[cs * EGYSEG_TIPUS_DB + index] += ertek;
        }
        break;
      case HATAS.NEPESSEG:
        this.nepesseg[cs] += ertek;
        break;
      default: break;
    }
  }

  /** Melyik civet játssza a csapat? `CIV_NINCS`, ha semlegeset. */
  civje(csapat) {
    if (csapat < 0 || csapat >= this.csapatDb) return CIV_NINCS;
    return this.civ[csapat];
  }

  // ── LEKÉRDEZŐ FELÜLET ────────────────────────────────────────────────
  // Mindegyik EGYETLEN tömb-olvasás. A határellenőrzés szándékosan hiányzik
  // a forró úti metódusokból (`sebzes`, `pancel`): a hívók a `csapat`-ot az
  // egység-tömbből veszik, ami `Uint8Array` 0/1 — érvénytelen index oda nem
  // kerülhet. A ritkán hívott, UI-ból is elérhető metódusok viszont védettek.

  /** Sebzés-eltolás támadástípusonként — a `Harc` forró útja hívja. */
  sebzesBonusz(csapat, tamadasTipus) {
    return this.sebzes[csapat * 4 + tamadasTipus];
  }

  /** Páncél-eltolás — a `Harc` forró útja hívja. LEHET NEGATÍV. */
  pancelBonusz(csapat) { return this.pancel[csapat]; }

  /** Gyűjtés-ütem SZÁZALÉKBAN, NYERSANYAGONKÉNT — a munkás-AI hívja. */
  utemSzazalek(csapat, nyers) {
    return this.utem[csapat * 4 + nyers];
  }

  /** Cipelési kapacitás-többlet — a munkás-AI hívja. */
  cipelTobblet(csapat) { return this.cipel[csapat]; }

  /** Épület-életerő SZÁZALÉKBAN — a lerakás hívja. */
  epuletHpSzazalek(csapat) { return this.epuletHp[csapat]; }

  /** Épület-ár SZÁZALÉKBAN — az `epit` parancs hívja. */
  epuletArSzazalek(csapat) {
    if (csapat < 0 || csapat >= this.csapatDb) return 100;
    return this.epuletAr[csapat];
  }

  /** Egység-ár SZÁZALÉKBAN, TÍPUSONKÉNT — a képzés sorbaállása hívja. */
  egysegArSzazalek(csapat, tipus) {
    if (csapat < 0 || csapat >= this.csapatDb) return 100;
    if (tipus < 0 || tipus >= EGYSEG_TIPUS_DB) return 100;
    return this.egysegAr[csapat * EGYSEG_TIPUS_DB + tipus];
  }

  /** Képzési idő SZÁZALÉKBAN, TÍPUSONKÉNT — a képzés sorbaállása hívja. */
  egysegIdoSzazalek(csapat, tipus) {
    if (csapat < 0 || csapat >= this.csapatDb) return 100;
    if (tipus < 0 || tipus >= EGYSEG_TIPUS_DB) return 100;
    return this.egysegIdo[csapat * EGYSEG_TIPUS_DB + tipus];
  }

  /** Népesség-plafon ELTOLÁS — a `Gazdasag.nepessegAllapot()` hívja. */
  nepessegEltolas(csapat) {
    if (csapat < 0 || csapat >= this.csapatDb) return 0;
    return this.nepesseg[csapat];
  }

  /**
   * SZÁZALÉK ALKALMAZÁSA egészben, egyetlen helyen.
   *
   * Azért van külön, hogy a hét beakasztási pont ugyanazt a kerekítést
   * használja. Két különböző helyen leírt `x * p / 100 | 0` és
   * `Math.floor(x * p / 100)` látszólag ugyanaz — negatív értéknél viszont
   * nem az, és egy elfelejtett zárójel csendben más számot ad az egyik
   * gépen. Egy forrás, hét olvasó.
   *
   * @param {number} ertek @param {number} szazalek
   * @returns {number} egész
   */
  static szazalek(ertek, szazalek) {
    return ((ertek * szazalek) / 100) | 0;
  }

  /**
   * NÉGYELEMŰ ÁR SZÁZALÉKOLÁSA egy előre lefoglalt kimenő tömbbe.
   *
   * A képzés és az építés is `[étel, fa, kő, kristály]` tömböt ad a
   * `Gazdasag.levon()`-nak. A százalékolás új tömböt igényelne — a `sorba()`
   * és az `epit` viszont a parancs-úton fut, ahol nulla allokációt tartunk.
   * Ezért a hívó ad egy újrahasznált négyelemű puffert.
   *
   * Az árak sosem negatívak, tehát a levágás itt LEFELÉ kerekítés — vagyis a
   * kedvezmény egy hajszállal többet ér, a felár egy hajszállal kevesebbet.
   * Ez tudatos: a v0.13 hangolása inkább emeljen, mint vegyen vissza.
   *
   * @param {number[]|Int32Array} ar @param {number} szazalek
   * @param {number[]|Int32Array} ki négyelemű, újrahasznált
   * @returns {number[]|Int32Array} `ki`
   */
  static arSzazalek(ar, szazalek, ki) {
    for (let f = 0; f < 4; f++) ki[f] = ((ar[f] * szazalek) / 100) | 0;
    return ki;
  }

  /**
   * Olvasható pillanatkép a HUD-nak és a szondának.
   *
   * Az `elter` a legfontosabb szám: hány lekérdező érték tér el az alaptól.
   * Ha ez nulla egy civet játszó csapatnál, akkor az adatréteg NEM CSINÁL
   * SEMMIT — pontosan az a fajta hiba, amit a determinizmus-kapu sosem fogna
   * meg, mert a semmittevés tökéletesen reprodukálható.
   */
  osszesites(csapat) {
    if (csapat < 0 || csapat >= this.csapatDb) {
      return { civ: CIV_NINCS, nev: '—', bonuszDb: 0, elter: 0 };
    }
    const n4 = csapat * 4, n5 = csapat * EGYSEG_TIPUS_DB;
    let elter = 0;
    for (let k = 0; k < 4; k++) {
      if (this.sebzes[n4 + k] !== 0) elter++;
      if (this.utem[n4 + k] !== 100) elter++;
    }
    for (let k = 0; k < EGYSEG_TIPUS_DB; k++) {
      if (this.egysegAr[n5 + k] !== 100) elter++;
      if (this.egysegIdo[n5 + k] !== 100) elter++;
    }
    if (this.pancel[csapat] !== 0) elter++;
    if (this.cipel[csapat] !== 0) elter++;
    if (this.epuletHp[csapat] !== 100) elter++;
    if (this.epuletAr[csapat] !== 100) elter++;
    if (this.nepesseg[csapat] !== 0) elter++;

    const c = this.civ[csapat];
    const sebzes = [], utem = [], egysegAr = [], egysegIdo = [];
    for (let k = 0; k < 4; k++) { sebzes.push(this.sebzes[n4 + k]); utem.push(this.utem[n4 + k]); }
    for (let k = 0; k < EGYSEG_TIPUS_DB; k++) {
      egysegAr.push(this.egysegAr[n5 + k]);
      egysegIdo.push(this.egysegIdo[n5 + k]);
    }
    return {
      civ: c,
      nev: c === CIV_NINCS ? 'semleges' : CIV_NEV[c],
      sebzes,
      pancel: this.pancel[csapat],
      utem,
      cipel: this.cipel[csapat],
      epuletHp: this.epuletHp[csapat],
      epuletAr: this.epuletAr[csapat],
      egysegAr,
      egysegIdo,
      nepesseg: this.nepesseg[csapat],
      bonuszDb: this.bonuszDb[csapat],
      elutasitva: this.elutasitva[csapat],
      elter,
    };
  }
}

/**
 * Egy civ bónusz-sorai NYERS SZÁMOKBAN — a UI-nak és a szondának.
 *
 * Másolatot ad, nem a belső táblát: a hívó (HUD, civ-választó) különben
 * véletlenül átírhatná a balansz-táblázatot, és onnantól a két gép más
 * civvel játszana ugyanazon a néven.
 *
 * @param {number} civ
 * @returns {number[][]} `[hatás, index, érték]` hármasok
 */
export function civBonuszai(civ) {
  if (civ < 0 || civ >= CIV_DB) return [];
  const sorok = CIV_BONUSZ[civ];
  const ki = [];
  for (let s = 0; s < sorok.length; s++) {
    ki.push([sorok[s][0], sorok[s][1], sorok[s][2]]);
  }
  return ki;
}

export { HATAS, MIND };
