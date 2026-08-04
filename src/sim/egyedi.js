// AGE OF THE CRYSTALS — EGYEDI EGYSÉGEK (v0.9/2).
//
// ── MIÉRT NEM NYOLC ÚJ TÍPUS ──────────────────────────────────────────────
// A műfaj hagyománya szerint minden népnek van EGY egysége, ami csak az övé. A
// kézenfekvő megvalósítás nyolc új `TIPUS` bejegyzés lenne — és pont ez a
// legrosszabb, amit ebbe a kódba tehetnénk. A típus-index MINDEN táblában
// megjelenik: `MAX_HP`, `ALAP_SEBZES`, `TAMADAS_TIPUS`, `PANCEL_TIPUS`,
// `PANCEL_ERTEK`, `UTEM`, `HATOTAV`, `TAVOLSAGI`, `SEBESSEG`, `SUGAR`,
// `EGYSEG_AR`, `EGYSEG_IDO`, `EGYSEG_NEP`, `LATOTAV`, `KEPEZ`, és a
// render-rétegek maszkjai. Nyolc új sor mindegyikben tizennégy helyen — az első
// elfelejtett tábla pedig CSENDBEN a 0. típus (a munkás) adatait adná vissza.
//
// Ezért EGYETLEN új típus van (`TIPUS.EGYEDI`), és a mögötte álló SZÁMOK
// csapatfüggők. A csapat civje a meccs alatt nem változik, tehát a számokat a
// `beallit()` egyszer kiteríti csapatonkénti tömbökbe, és a forró út csak
// olvas — pontosan az a szerkezet, ami a `Technologia` és a `Civ` óta a
// projekt idióma.
//
// ── A KERET RÖGZÍTETT, A TARTALOM CIVFÜGGŐ ────────────────────────────────
// Ami civenként VÁLTOZIK: életerő, alapsebzés, támadás- és páncéltípus, lapos
// páncél, ütem, ár, képzési idő, népesség-igény, és hogy melyik épület képzi.
// Ami MINDEN népnél UGYANAZ: sebesség, ütközési sugár, hatótáv, és hogy
// közelharcos.
//
// ⚠️ EZ NEM LUSTASÁG, HANEM A `HATOTAV` FEJLÉCÉNEK BETARTÁSA. A hatótávot két
// réteg olvassa: a `harc.js` (mikor üthet) és a `parancsallapot.js` (hol álljon
// meg az üldöző). A `parancsallapot` a célzás-réteg, ott az egység típusa
// ismert, a CSAPATA viszont nem mindenhol — ha a hatótáv civfüggő lenne, a két
// olvasó elcsúszhatna, és az egység odaállna a célpont mellé anélkül, hogy
// bármit is csinálna. Az a fajta hiba, ami a determinizmus-kapun simán átmegy.
// Ugyanezért közelharcos mind: a lövedék-réteg repülési idővel dolgozik, és a
// csapatfüggő hatótáv ott ugyanezt a szakadékot nyitná ki.
//
// A civ jellegét bőven elbírja a maradék kilenc szám: a Bástyaőrző egysége
// 130 életerejű, 3 páncélos és lassú, a Sivatagi portyázóé 45 életerejű,
// olcsó és gyors ütemű. Ugyanazon a lábon állnak, mégsem cserélhetők fel.
//
// ── AKINEK NINCS CIVJE, ANNAK NINCS EGYEDI EGYSÉGE ────────────────────────
// `CIV_NINCS` mellett a `van()` hamis, és a képzés elutasít. A semleges
// felállás így pontosan az marad, ami a v0.8-ig volt — a v0.1 regresszió-őre
// nem mozdul. A statisztikai tömbök ilyenkor a SEMLEGES sorral töltődnek, nem
// nullával: egy elszabadult olvasás így értelmes számot kap, nem osztást
// nullával vagy egy munkás életerejét.

import { CIV_DB, CIV_NINCS } from './civ.js';
import { TAMADAS, PANCEL } from './harc.js';
import { EPULET } from './epuletek.js';

// A KERET SZÁMAI NEM ITT ÁLLNAK, hanem a saját tábláikban: a sebesség és az
// ütközési sugár a `units.js` `SEBESSEG`/`SUGAR` tömbjének 6. helyén, a hatótáv
// és a „nem távolsági" a `harc.js` `HATOTAV`/`TAVOLSAGI` tömbjében. Ide másolva
// egy körkörös import kellene (`egyedi.js` → `harc.js` → `units.js` → vissza),
// és egy determinisztikus motorban a modul-inicializálási sorrendtől függő
// `undefined` a lehető legrosszabb hibafajta. A tábla marad a tábla helyén.

/**
 * NÉPENKÉNTI ADATSOR. A sorrend a `CIV.*` indexe.
 *
 * ⚠️ MINDEGYIK DRÁGÁBB ÉS ERŐSEBB A HOZZÁ LEGKÖZELEBBI ALAPEGYSÉGNÉL, DE
 * NEM MINDENBEN. Az egyedi egység nem „jobb lándzsás" — akkor a lándzsás
 * halott kód lenne —, hanem MÁS: a portyázó olcsóbb és gyorsabb ütemű, de
 * papírvékony; a bástyaőrzőé kétszer annyit bír, viszont fele olyan gyakran üt
 * és három népességet foglal.
 */
const EGYEDI_PROFIL = [
  // 0 — KRISTÁLYKOVÁCSOK · Kristálypajzsos: a legpáncélosabb gyalogos.
  {
    nev: 'Kristálypajzsos',
    hp: 95, sebzes: 7, tamadas: TAMADAS.VAGO,
    pancel: PANCEL.GYALOGOS, pancelErtek: 4, utem: 18,
    ar: [30, 0, 0, 45], ido: 260, nep: 1, epulet: EPULET.LAKTANYA,
  },
  // 1 — PUSZTAI LOVASOK · Sztyeppei portya: gyors ütemű lovas-vadász.
  {
    nev: 'Sztyeppei portya',
    hp: 80, sebzes: 9, tamadas: TAMADAS.SZURO,
    pancel: PANCEL.LOVAS, pancelErtek: 1, utem: 13,
    ar: [35, 0, 0, 35], ido: 230, nep: 1, epulet: EPULET.ISTALLO,
  },
  // 2 — ERDEI VADÁSZOK · Csapdaállító: olcsó, sokat sebez, keveset bír.
  {
    nev: 'Csapdaállító',
    hp: 50, sebzes: 11, tamadas: TAMADAS.SZURO,
    pancel: PANCEL.GYALOGOS, pancelErtek: 0, utem: 16,
    ar: [25, 60, 0, 0], ido: 190, nep: 1, epulet: EPULET.IJASZDA,
  },
  // 3 — HEGYI BÁNYÁSZOK · Kőtörő: ostrom-csapás GYALOGOS lábon.
  //     Az egyetlen egyedi egység, ami épületre komoly — de élő cél ellen az
  //     ostrom-oszlop 6 %-a sújtja, tehát nem csodafegyver.
  {
    nev: 'Kőtörő',
    hp: 110, sebzes: 40, tamadas: TAMADAS.OSTROM,
    pancel: PANCEL.GYALOGOS, pancelErtek: 2, utem: 34,
    ar: [20, 45, 75, 0], ido: 300, nep: 2, epulet: EPULET.OSTROMMUHELY,
  },
  // 4 — FOLYAMI KERESKEDŐK · Zsoldos: drága, de azonnal kiáll.
  {
    nev: 'Zsoldos',
    hp: 70, sebzes: 8, tamadas: TAMADAS.VAGO,
    pancel: PANCEL.GYALOGOS, pancelErtek: 1, utem: 15,
    ar: [35, 0, 0, 55], ido: 120, nep: 1, epulet: EPULET.LAKTANYA,
  },
  // 5 — BÁSTYAŐRZŐK · Bástyaőr: falnak való, nem rohamnak.
  {
    nev: 'Bástyaőr',
    hp: 130, sebzes: 6, tamadas: TAMADAS.SZURO,
    pancel: PANCEL.GYALOGOS, pancelErtek: 3, utem: 22,
    ar: [30, 0, 75, 0], ido: 280, nep: 2, epulet: EPULET.LAKTANYA,
  },
  // 6 — FÉNYHOZÓK · Fénylovag: a legdrágább és a legerősebb egyben.
  {
    nev: 'Fénylovag',
    hp: 105, sebzes: 12, tamadas: TAMADAS.VAGO,
    pancel: PANCEL.LOVAS, pancelErtek: 2, utem: 15,
    ar: [40, 0, 0, 80], ido: 320, nep: 2, epulet: EPULET.ISTALLO,
  },
  // 7 — SIVATAGI PORTYÁZÓK · Homoki futó: olcsó, sok, törékeny.
  {
    nev: 'Homoki futó',
    hp: 45, sebzes: 7, tamadas: TAMADAS.VAGO,
    pancel: PANCEL.GYALOGOS, pancelErtek: 0, utem: 12,
    ar: [25, 25, 0, 0], ido: 140, nep: 1, epulet: EPULET.LAKTANYA,
  },
];

/**
 * A SEMLEGES SOR — `CIV_NINCS` mellett ez tölti a tömböket.
 *
 * Sosem képezhető (a `van()` hamis), tehát ezek a számok a gyakorlatban nem
 * hatnak. Mégsem nullák: egy elszabadult olvasás így értelmes egységet lát, nem
 * egy nulla életerejű, nulla ütemű szörnyet, ami a következő osztásnál robban.
 */
const SEMLEGES = {
  nev: '—',
  hp: 55, sebzes: 6, tamadas: TAMADAS.VAGO,
  pancel: PANCEL.GYALOGOS, pancelErtek: 1, utem: 15,
  ar: [50, 0, 0, 0], ido: 200, nep: 1, epulet: EPULET.LAKTANYA,
};

export class Egyedi {
  /**
   * @param {number} csapatDb
   * @param {import('./sim.js').Sim} sim
   */
  constructor(csapatDb, sim) {
    this.csapatDb = csapatDb | 0;
    this.sim = sim;
    const cs = this.csapatDb;

    /** Van-e egyáltalán egyedi egysége a csapatnak (van civje)? */
    this.aktiv = new Uint8Array(cs);
    /** Melyik civ sorát terítettük ki — a szondának és a HUD-nak. */
    this.civ = new Int32Array(cs).fill(CIV_NINCS);

    this.hp = new Int32Array(cs);
    this.sebzes = new Int32Array(cs);
    this.tamadas = new Int32Array(cs);
    this.pancel = new Int32Array(cs);
    this.pancelErtek = new Int32Array(cs);
    this.utem = new Int32Array(cs);
    /** `ar[csapat * 4 + nyersanyag]`. */
    this.ar = new Int32Array(cs * 4);
    this.ido = new Int32Array(cs);
    this.nep = new Int32Array(cs);
    this.epulet = new Int32Array(cs);

    /**
     * Hány egyedi egység készült el, és hány képzést utasítottunk el, mert a
     * csapatnak nincs civje vagy nem az az épület képzi.
     *
     * ⚠️ EZ NEM DÍSZ. Egy egyedi egység, amit SOHA senki nem képez ki, teljesen
     * determinisztikus: a hash zöld, a profil-tábla szép, és a réteg pontosan
     * semmit nem csinál. A szonda ezt a számot kérdezi meg.
     */
    this.keszult = new Int32Array(cs);
    this.elutasitva = new Int32Array(cs);

    for (let k = 0; k < cs; k++) this._ir(k, SEMLEGES);
  }

  nullaz() {
    this.aktiv.fill(0);
    this.civ.fill(CIV_NINCS);
    this.keszult.fill(0);
    this.elutasitva.fill(0);
    for (let k = 0; k < this.csapatDb; k++) this._ir(k, SEMLEGES);
  }

  /**
   * A csapat civjének adatsorát kiterítjük. A `Sim.civValaszt()` hívja, a
   * `Civ.beallit()`-tal EGYÜTT — a kettő sosem járhat külön, különben a csapat
   * civ-bónuszai és az egyedi egysége két különböző népé lenne.
   */
  beallit(csapat, civ) {
    if (csapat < 0 || csapat >= this.csapatDb) return false;
    const c = civ | 0;
    if (c === CIV_NINCS) {
      this.civ[csapat] = CIV_NINCS;
      this.aktiv[csapat] = 0;
      this._ir(csapat, SEMLEGES);
      return true;
    }
    if (c < 0 || c >= CIV_DB) { this.elutasitva[csapat]++; return false; }
    this.civ[csapat] = c;
    this.aktiv[csapat] = 1;
    this._ir(csapat, EGYEDI_PROFIL[c]);
    return true;
  }

  /** Egy adatsor kiterítése a csapat helyére. */
  _ir(cs, p) {
    this.hp[cs] = p.hp;
    this.sebzes[cs] = p.sebzes;
    this.tamadas[cs] = p.tamadas;
    this.pancel[cs] = p.pancel;
    this.pancelErtek[cs] = p.pancelErtek;
    this.utem[cs] = p.utem;
    for (let f = 0; f < 4; f++) this.ar[cs * 4 + f] = p.ar[f];
    this.ido[cs] = p.ido;
    this.nep[cs] = p.nep;
    this.epulet[cs] = p.epulet;
  }

  // ── LEKÉRDEZŐ FELÜLET ────────────────────────────────────────────────
  // Mind egyetlen tömb-olvasás. A `harc.js` forró útja hívja őket, tickenként
  // egységenként — a határellenőrzés ezért csak a ritkán hívott, UI-ból is
  // elérhető metódusokban van benne.

  /** Képezhet-e a csapat egyedi egységet (van-e civje)? */
  van(csapat) {
    return csapat >= 0 && csapat < this.csapatDb && this.aktiv[csapat] === 1;
  }

  /** A csapat egyedi egységének NEVE — a HUD-nak és a jelentéseknek. */
  nev(csapat) {
    if (!this.van(csapat)) return SEMLEGES.nev;
    return EGYEDI_PROFIL[this.civ[csapat]].nev;
  }

  /** Melyik épület képzi? `-1`, ha a csapatnak nincs civje. */
  kepzoEpulet(csapat) {
    if (!this.van(csapat)) return -1;
    return this.epulet[csapat];
  }

  /** Négyelemű ár egy ÚJRAHASZNÁLT pufferbe — nulla allokáció a parancs-úton. */
  arba(csapat, ki) {
    const o = (csapat | 0) * 4;
    for (let f = 0; f < 4; f++) ki[f] = this.ar[o + f];
    return ki;
  }

  /** Olvasható pillanatkép a HUD-nak és a szondának. */
  osszesites(csapat) {
    if (csapat < 0 || csapat >= this.csapatDb) {
      return { van: false, nev: '—', keszult: 0, elutasitva: 0 };
    }
    return {
      van: this.aktiv[csapat] === 1,
      civ: this.civ[csapat],
      nev: this.nev(csapat),
      hp: this.hp[csapat],
      sebzes: this.sebzes[csapat],
      utem: this.utem[csapat],
      pancelErtek: this.pancelErtek[csapat],
      nep: this.nep[csapat],
      ido: this.ido[csapat],
      epulet: this.epulet[csapat],
      keszult: this.keszult[csapat],
      elutasitva: this.elutasitva[csapat],
    };
  }
}

export { EGYEDI_PROFIL };
