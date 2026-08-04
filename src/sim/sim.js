// AGE OF THE CRYSTALS — A SZIMULÁCIÓ MAGJA.
//
// ── A LOCKSTEP SZERZŐDÉS ──────────────────────────────────────────────────
// Ez az osztály a játék EGYETLEN igazságforrása. Amit tud:
//
//   • FIX ÜTEM. Nem `dt`-vel fut, hanem egész tickekkel, 20 Hz-en. A képkocka-
//     sebességtől FÜGGETLEN: 144 Hz-es monitoron ugyanannyi tick fut le, mint
//     30 FPS-en, csak a köztes állapotot a render interpolálja.
//
//   • PARANCS-SOR. A játékos kattintása NEM azonnal hat, hanem a `tick +
//     KESLELTETES`-re kerül sorba. Egyjátékosban is így megy — így amikor a
//     v0.8-ban jön a hálózat, az CSAK SZÁLLÍTÁS lesz: ugyanez a sor érkezik
//     távolról. Ha ezt később vezetnénk be, az újraírás lenne.
//
//   • ÁLLAPOT-HASH. Bármely tick után kérhető egy 32 bites ujjlenyomat. A
//     `tools/determinizmus_szonda.mjs` ezzel hasonlít össze két futást, és
//     desyncnél megmondja a PONTOS ticket. Élesben ugyanez lesz a hálózati
//     desync-detektor.
//
// Amit NEM tud és nem is tudhat: nincs `THREE`, nincs `document`, nincs
// `performance.now()`, nincs `Math.random()`. Ez a fájl és minden, amit
// importál, node-ban fejen állva is le kell fusson — a szonda pontosan ezt
// használja ki.

import { Racs, TEREP } from './grid.js';
import { MezoTar } from './flowfield.js';
import { Egysegek, ALLAPOT, TIPUS, DT } from './units.js';
import { mulberry32 } from './rng.js';
import { AlakzatSzamolo, ALAKZAT } from './alakzat.js';
import { ParancsAllapot, PARANCS, ALLAS } from './parancsallapot.js';
import { vegrehajt } from './parancsok.js';
import { Eroforrasok, NYERS } from './eroforras.js';
import { Epuletek, EPULET, EP_MERET } from './epuletek.js';
import { Gazdasag, KORSZAK } from './gazdasag.js';
import { Munkasok, MUNKA } from './munkas.js';
import { Harc, TAMADAS, PANCEL } from './harc.js';
import { Lovedekek } from './lovedek.js';
import { Beszallas } from './beszallas.js';
import { Kepzes } from './kepzes.js';
import { Technologia, TECH, TECH_DB, techEpulete } from './technologia.js';
import { Ai, NEHEZSEG } from './ai.js';
import { Kod } from './kod.js';
import { Civ, CIV, CIV_NINCS } from './civ.js';
import { Egyedi } from './egyedi.js';
import { TERKEP, terkepErvenyes } from './terkep.js';

/** Hány tickkel később hat egy parancs. 2 tick = 100 ms — a hálózat ebbe fér. */
export const KESLELTETES = 2;
/** A sim üteme. */
export const TICK_HZ = 20;

export class Sim {
  /**
   * @param {{seed?:number, n?:number, maxEgyseg?:number, terkep?:number}} opciok
   */
  constructor(opciok = {}) {
    this.seed = (opciok.seed ?? 20260803) >>> 0;
    this.n = opciok.n ?? 256;
    this.maxEgyseg = opciok.maxEgyseg ?? 2000;
    /**
     * A TÉRKÉP-PRESET (v0.10). A terep, a nyersanyag-eloszlás és a
     * járhatóság ebből ÉS a seedből következik — a mentés ezért mindkettőt
     * ellenőrzi, a hálózaton pedig mindkettőt egyeztetni kell.
     */
    this.terkep = terkepErvenyes(opciok.terkep) ? (opciok.terkep | 0) : TERKEP.NYILT_MEZO;

    this.tick = 0;
    this.racs = new Racs(this.n, this.seed, this.terkep);
    // ⚠️ A NYERSANYAGOK A MEZŐ-TÁR ELŐTT. Az erdő és a kőfejtő ZÁRJA a celláját,
    // tehát a `racs.jarhato` csak ezután végleges — és az áramlási mezők arra
    // épülnek. Fordított sorrendben az első kiszámolt mező még a nyersanyagok
    // nélküli pályát látná, és a sereg átsétálna az erdőn.
    this.eroforrasok = new Eroforrasok(this.racs, this.seed, this.terkep);
    this.mezoTar = new MezoTar(this.racs, 8);
    this.egysegek = new Egysegek(this.maxEgyseg, this.racs, this.mezoTar);
    /** A meccs-RNG. MINDEN véletlen ebből jön, sosem a `Math.random`-ból. */
    this.rng = mulberry32(this.seed ^ 0xa5a5a5a5);

    // ── v0.2: az irányítás rétege ───────────────────────────────────────
    // Az alakzat-számoló és a parancs-állapot előre lefoglalt tömbökkel dolgozik,
    // hogy egy 1600 fős menetparancs se allokáljon.
    this.alakzatSzamolo = new AlakzatSzamolo(this.maxEgyseg);
    this.parancsAllapot = new ParancsAllapot(this.maxEgyseg, this.egysegek, this);

    // ── v0.3: a gazdaság rétege ─────────────────────────────────────────
    this.epuletek = new Epuletek(this.racs);
    this.gazdasag = new Gazdasag(2);
    this.munkasok = new Munkasok(this.maxEgyseg, this);

    // ── v0.4: a harc rétege ─────────────────────────────────────────────
    // Az `elo` jelzőt átadjuk a mozgás-magnak: a halott így kimarad a térbeli
    // hasítótáblából, tehát egy csapásra megszűnik lökdösni és célponttá válni.
    this.harc = new Harc(this.maxEgyseg, this);
    this.egysegek.elo = this.harc.elo;
    // A lövedék-tár felső korlátja bőven a valós csúcs fölött van; ha betelne,
    // a lövés elvész, nem allokálunk (lásd `lovedek.js`).
    this.lovedekek = new Lovedekek(this.maxEgyseg, this);
    // A beszállásolás ugyanazon az EGY helyen veszi ki az egységet a világból,
    // mint a halál (a térbeli hasítótáblából) — csak visszafordíthatóan.
    this.beszallas = new Beszallas(this.maxEgyseg, this);
    this.egysegek.bent = this.beszallas.bent;

    // ── v0.5: egység-képzés ─────────────────────────────────────────────
    this.kepzes = new Kepzes(this.epuletek.maxDb, this);
    this.gazdasag.kotSim(this);
    // A technológia MINDEN réteg fölött ül, tehát utoljára jön létre — és az
    // épületek visszakapják a hivatkozást, mert a falazás a LERAKÁSKOR hat.
    this.technologia = new Technologia(2, this);
    this.epuletek.tech = this.technologia;

    // ── v0.6: a gépi ellenfél ───────────────────────────────────────────
    // A sim RÉSZE, nem a kliensé — különben a v0.8 lockstepjében a két gép
    // AI-ja külön döntene, és az azonnali desync (lásd `ai.js` fejléc).
    this.ai = new Ai(2, this);

    // ── v0.7: hadi köd ──────────────────────────────────────────────────
    // A simben él, mert a FELFEDEZETTSÉG halmozott tudás (nem vezethető le a
    // mostani állapotból), a gépi ellenfél ebből tud, és a v0.8 újracsatlakozása
    // a saját felfedezett térképét kell visszakapja. Lásd `kod.js` fejléce.
    this.kod = new Kod(2, this);

    // ── v0.9: civilizációk ──────────────────────────────────────────────
    // A `Technologia` mintájára: előre számolt bónusz-tömbök, a lekérdezés a
    // forró úton egyetlen tömb-olvasás. Az `Epuletek` külön hivatkozást kap,
    // mert nincs `sim` mezője — ugyanúgy, ahogy a `tech`-et is megkapta.
    this.civ = new Civ(2, this);
    this.epuletek.civ = this.civ;
    /**
     * A MECCS civ-választása. A `szondaFelallas` ebből állítja vissza — a civ
     * nem parancs, hanem a FELÁLLÁS része: a kezdő központ életerejére már a
     * 0. tick előtt hatnia kell.
     */
    this.civValasztas = new Int32Array(2).fill(CIV_NINCS);

    // ── v0.9/2: az egyedi egység csapatonkénti adatsora ──────────────────
    // Egyetlen `TIPUS`, nyolc nép. A számokat ez tartja csapatonként — a
    // `harc.js` és a `kepzes.js` innen kérdez, ha a típus `TIPUS.EGYEDI`.
    this.egyedi = new Egyedi(2, this);
    /**
     * A tick közbeékelt lépése. EGY objektum, a konstruktorban — az
     * `Egysegek.lep()` egyetlen horgot fogad, és a v0.3 óta ketten kérnek szót
     * ugyanott: a parancs-állapot (célzás, állás) és a munkás-AI. Zárvány
     * tickenkénti gyártása allokáció lenne a forró úton.
     */
    this._tickHorog = {
      // SORREND: célzás → sebzés → munka. A `Harc` a `ParancsAllapot` UTÁN fut,
      // mert az dönti el, kinek ki a célpontja és ki áll harcérintkezésben; a
      // harc már csak a sebzést végzi. A két kérdés — „kire támadok" és
      // „mennyit sebzek" — így nem keveredik egyetlen ciklusba.
      lep: (t) => {
        this.parancsAllapot.lep(t);
        this.harc.lep();
        this.lovedekek.lep();
        this.munkasok.lep(t);
      },
    };

    /** tick → parancsok. Kulcs szerint kérdezzük, sosem iteráljuk. */
    this._sor = new Map();
  }

  /**
   * Parancs beadása. A `tick + KESLELTETES`-re kerül — MINDEN játékosnál
   * ugyanoda, tehát a sorrend gépfüggetlen.
   * @param {{fajta:string, [k:string]:any}} parancs
   */
  parancs(parancs) {
    this.parancsTickre(this.tick + KESLELTETES, parancs);
  }

  /**
   * Parancs beadása PONTOSAN egy megadott tickre (v0.8).
   *
   * A lockstep-rétegnek ez kell: ott nem „mostantól két tick múlva" a
   * szabály, hanem „a T. KÖR első tickjén, minden gépen ugyanakkor". A
   * `parancs()` a helyi kényelem, ez a hálózat pontossága — és a kettő
   * ugyanabba a sorba ír, tehát a végrehajtás egyetlen úton megy.
   *
   * ⚠️ A MÚLTBA NEM LEHET PARANCSOLNI. Ha egy csomag késve érkezik és a tickje
   * már lefutott, a beadás CSENDBEN elveszne — a `false` visszatérés az, ami
   * ezt láthatóvá teszi a hívónak.
   * @returns {boolean} sikerült-e beütemezni
   */
  parancsTickre(t, parancs) {
    const cel = t | 0;
    if (cel < this.tick) return false;
    let lista = this._sor.get(cel);
    if (!lista) { lista = []; this._sor.set(cel, lista); }
    lista.push(parancs);
    return true;
  }

  /** Egy tick végrehajtása. */
  lep() {
    const lista = this._sor.get(this.tick);
    if (lista) {
      for (let i = 0; i < lista.length; i++) this._vegrehajt(lista[i]);
      this._sor.delete(this.tick);
    }
    // AZ AI A LEGELSŐ a tick-lépések közül, és ez szándékos: a döntései a
    // parancs-soron mennek be, tehát `KESLELTETES` tick múlva hatnak. Ha a
    // sor kiürítése UTÁN gondolkodna, minden döntése egy körrel később érne
    // célba — a gép mérhetően lomhább lenne ugyanannál a beállításnál.
    this.ai.lep(this.tick);
    // A KÖD AZ AI UTÁN, DE A MOZGÁS ELŐTT frissül: a gép abban a körben a
    // legfrissebb látóteret látja, amit az előző tick mozgása alakított ki.
    this.kod.lep(this.tick);
    this.epuletek.lep();
    this.gazdasag.lep();
    this.technologia.lep();
    this.kepzes.lep();
    this.egysegek.lep(this.tick, this._tickHorog);
    this._mezoErvenytelenites();
    this.tick++;
  }

  /**
   * A PÁLYA MEGVÁLTOZOTT — el kell dobni a gyorsítótárazott áramlási mezőket.
   *
   * Ez a v0.3 egyetlen igazán alattomos pontja. A `MezoTar` a járhatóságból
   * számol, és a mezőket cellára gyorsítótárazza. Ha egy erdő kimerül (a cella
   * megnyílik) vagy egy raktár lekerül (a cella bezárul), a régi mező HAZUDIK:
   * megkerültet egy nem létező akadállyal, vagy átvezet egy frissen épült falon.
   *
   * A `cel = -1` annyit jelent, hogy a következő kérés ÚJRASZÁMOL. A már úton
   * lévő egységek egy-két tickig még a régi irányokat olvassák — ez viszont
   * MINDEN gépen ugyanúgy történik, tehát nem desync, és a `units.js` 15
   * tickenkénti szabad-egyenes vizsgálata magától helyre is teszi.
   */
  _mezoErvenytelenites() {
    if (!this.eroforrasok.jarhatosagValtozott && !this.epuletek.jarhatosagValtozott) return;
    this.eroforrasok.jarhatosagValtozott = false;
    this.epuletek.jarhatosagValtozott = false;
    for (let i = 0; i < this.mezoTar.mezok.length; i++) this.mezoTar.mezok[i].cel = -1;
  }

  /**
   * Egy parancs végrehajtása. A v0.2 óta a `sim/parancsok.js` végzi — lásd
   * annak fejlécét arról, miért került ki a sim magjából.
   */
  _vegrehajt(p) {
    vegrehajt(this, p);
  }

  /**
   * Kezdő felállás a szondához: két sereg a pálya két oldalán.
   * A `Math.random` helyett a meccs-RNG-t használja, tehát seedből
   * reprodukálható.
   * @param {number} osszDb összes egység
   * @param {{ostrom?:number}} [opciok] csapatonként ennyi egység OSTROMGÉP lesz
   *   (alap: 0). Külön kapcsoló, mert a v0.1 mérési felállása NEM változhat —
   *   az az FPS-lépcsők összehasonlítási alapja, és egy ötödik egységtípus a
   *   render-mixet is átrendezné.
   */
  szondaFelallas(osszDb, opciok) {
    const e = this.egysegek;
    // v0.5: nem `db = 0`, hanem teljes újrakezdés — MINDEN generáció lép, tehát
    // egyetlen korábbi hivatkozás sem támadhat fel érvényesként.
    e.ujraKezd();
    const racs = this.racs;
    const n = this.n;

    // ── v0.3: a gazdaság visszaállítása ─────────────────────────────────
    // SORREND: előbb az épületek (visszaadják a celláikat), utána a
    // nyersanyagok (újra lezárják a sajátjukat). Fordítva egy épület alatti
    // erdő-cella járhatóként maradna ott, ahol erdő van.
    // ⚠️ A TECHNOLÓGIA A LEGELSŐ. A falazás az épület LERAKÁSAKOR szorozza az
    // életerőt, és a központok pár sorral lentebb kerülnek le — ha a technológia
    // csak utána nullázódna, az ÚJ meccs központjai a RÉGI meccs bónuszával
    // születnének meg. Egy friss `Sim`-nél ez sosem látszana; az újrafelállásnál
    // viszont csendes desync-forrás lenne.
    this.technologia.nullaz();
    this.ai.nullaz();
    this.kod.nullaz();
    // ⚠️ A CIV IS AZ ÉPÜLETEK ELŐTT, ÉS AZONNAL VISSZA IS ÁLLÍTVA. Ugyanaz az
    // indok, ami a technológiánál: az épület-életerő a LERAKÁSKORI százalékkal
    // születik, a központok pedig pár sorral lentebb kerülnek le. Ha csak
    // nulláznánk, a civ csendben elveszne minden újrafelállásnál — és a bónusz
    // a hash-en kívül tűnne el, tehát semmi nem szólna érte.
    this.civ.nullaz();
    this.egyedi.nullaz();
    for (let cs = 0; cs < this.civValasztas.length; cs++) {
      if (this.civValasztas[cs] === CIV_NINCS) continue;
      this.civ.beallit(cs, this.civValasztas[cs]);
      this.egyedi.beallit(cs, this.civValasztas[cs]);
    }
    this.epuletek.nullaz();
    this.eroforrasok.nullaz();
    this.gazdasag.nullaz();
    this.munkasok.nullaz();

    // Minden csapat kap egy KÉSZ központot — ez a kezdő lerakat. Az egységek
    // ELŐTT rakjuk le, hogy a felállás ne tegyen senkit az épület alá.
    //
    // ⚠️ A KÖZPONT ELTOLVA ÁLL A SEREG KÖZEPÉTŐL, ÉS EZ NEM KOZMETIKA.
    // Először a bázispontra került, vagyis pont a sereg sűrűjébe — és onnan
    // egyetlen munkás sem tudott elindulni. Mérve: 800 egység szorult egy 25×25
    // cellás dobozba (612 járható cellára), és a szeparációs nyomás a
    // szomszédoktól (79 egység 2 egység sugarú körben) NAGYOBB volt, mint a cél
    // iránya — a munkások az épület falának préselődtek, sebességük befelé
    // mutatott, a `_mozgat` fal-csúsztatása pedig csak oldalazni engedte őket.
    // 800 tick alatt 0,01 világegységet haladtak.
    //
    // A `KOZPONT_ELTOLAS` a pálya közepe felé tolja az épületet, ki a tömegből.
    // A sereg így szabadon szétterülhet, a munkásoknak pedig valódi útjuk van a
    // lerakathoz. (A szeparáció felső korlát nélküli összegzése maga is
    // megérne egy vizsgálatot, de az a `units.js` mozgás-magja — a v0.1 mért
    // alapja —, ezért nem ebben a körben nyúlunk hozzá.)
    const KOZPONT_ELTOLAS = 22;
    for (let csapat = 0; csapat < 2; csapat++) {
      const bx = ((csapat === 0 ? n * 0.22 + KOZPONT_ELTOLAS : n * 0.78 - KOZPONT_ELTOLAS)) | 0;
      const by = (n * 0.5) | 0;
      const hely = this._szabadEpuletHely(EPULET.KOZPONT, bx, by);
      if (hely) this.epuletek.lerak(EPULET.KOZPONT, hely.x, hely.y, csapat, true);
    }
    const felenkent = osszDb >> 1;
    const harcosok = [TIPUS.LANDZSAS, TIPUS.IJASZ, TIPUS.LOVAG];
    /**
     * Minden hányadik egység legyen MUNKÁS. Az alapérték 4 — pontosan azt a
     * sorrendet adja vissza, amit a korábbi `tipusok[elhelyezve & 3]` ciklus,
     * tehát a v0.1 regresszió-őre bitre változatlan marad.
     *
     * A v0.5 köre 2-vel fut: mérve a negyedelés ott TÚL KEVÉS munkást adott
     * (csapatonként 7), és a gazdaság sosem gyűjtött annyi fát, hogy a piac
     * (175) felépüljön — piac nélkül pedig se kő, se torony, vagyis a v0.5/3
     * mindkét új alrendszere a kapun kívül maradt volna.
     */
    const munkasMinden = ((opciok && opciok.munkasMinden) | 0) || 4;

    for (let csapat = 0; csapat < 2; csapat++) {
      const bazisX = csapat === 0 ? n * 0.22 : n * 0.78;
      const bazisY = n * 0.5;
      let elhelyezve = 0;
      let sugar = 3;
      let orseg = 0;
      while (elhelyezve < felenkent && orseg++ < 200000) {
        const a = this.rng() * 6.283185307179586;
        const r = this.rng() * sugar;
        // Itt a `Racs` saját szög-közelítőjét nem érjük el, de a felállás
        // csak a kezdőállapotot érinti — ugyanabból a seedből ugyanaz.
        const x = bazisX + kSin(a + 1.5707963267948966) * r;
        const y = bazisY + kSin(a) * r;
        if (racs.jarhatoPont(x, y)) {
          const tip = (elhelyezve % munkasMinden) === munkasMinden - 1
            ? TIPUS.MUNKAS
            : harcosok[((elhelyezve - (elhelyezve / munkasMinden | 0)) % 3)];
          e.hozzaad(x, y, tip, csapat);
          elhelyezve++;
        }
        if ((orseg & 255) === 0) sugar += 1.5;
      }
    }
    // A parancs-állapotot a felállás UTÁN nullázzuk: a `celEgyseg` egység-
    // INDEXRE mutat, és a felállás újrahasznosítja az indexeket. Enélkül egy
    // korábbi futás célpontja egy vadidegen egységre mutatna tovább.
    this.parancsAllapot.nullaz(e.db);
    this.lovedekek.nullaz();
    this.beszallas.nullaz();
    this.kepzes.nullaz();

    // A munkás nem katona: alapból TŰZSZÜNETBEN áll. Enélkül az agresszív
    // alapállás miatt az első ellenség láttán otthagyná a bányát és rohanna
    // harcolni — ami a v0.3 gazdaságát tesztelhetetlenné tenné. (A célzás-réteg
    // a tűzszünetes egységeket érintetlenül hagyja, tehát a munkás-AI-é a
    // teljes irányítás fölöttük.)
    for (let i = 0; i < e.db; i++) {
      if (e.tipus[i] === TIPUS.MUNKAS) this.parancsAllapot.allas[i] = ALLAS.TUZSZUNET;
    }

    // ── v0.4/6: ostromgépek ─────────────────────────────────────────────
    // Csapatonként az UTOLSÓ néhány egységet alakítjuk ostromgéppé. Azért a
    // végéről, mert az elejét a felállás típus-ciklusa (`elhelyezve & 3`)
    // egyenletesen keveri — a végéről vágva a többi fegyvernem aránya nem
    // torzul. Az életerőt a `harc.nullaz()` ELŐTT állítjuk, hogy az az ÚJ
    // típusból számoljon.
    const ostromDb = (opciok && opciok.ostrom) | 0;
    if (ostromDb > 0) {
      for (let csapat = 0; csapat < 2; csapat++) {
        let atalakitva = 0;
        for (let i = e.db - 1; i >= 0 && atalakitva < ostromDb; i--) {
          if (e.csapat[i] !== csapat) continue;
          e.tipus[i] = TIPUS.OSTROMGEP;
          atalakitva++;
        }
      }
    }
    // A felállás és a lerakás is nyúlt a járhatósághoz — a mezők mehetnek.
    // Az életerő a TÍPUSBÓL jön, ezért CSAK az ostromgép-átalakítás UTÁN
    // adható meg — különben a gép a munkás 40 életerejével indulna. (Ez a
    // sorrend egyszer már el is csúszott: a gépek 0 életerővel születtek.)
    this.harc.nullaz(e.db);
    // A felállás és a lerakás is nyúlt a járhatósághoz — a mezők mehetnek.
    this._mezoErvenytelenites();
    return e.db;
  }

  /**
   * ÚJ EGYSÉG a világba (v0.5) — EGYETLEN hely, ahol egység születik.
   *
   * MIÉRT KELL EGY HELY: az egység nem csak az `Egysegek` tömbjeiben él, hanem
   * négy másik rétegben is (parancs-állapot, harc, munkás-AI, beszállásolás).
   * Egy újrahasznosított slotnál MINDEGYIKET nullázni kell — ha bármelyik
   * kimarad, az új katona az előző lakó céljával, rakományával vagy épp
   * „épületben van" jelzőjével születik meg. Ezért nem hívjuk sehol közvetlenül
   * az `egysegek.hozzaad()`-ot.
   *
   * @returns {number} az egység indexe, vagy -1
   */
  egysegKepez(x, y, tipus, csapat) {
    const e = this.egysegek;
    const i = e.hozzaad(x, y, tipus, csapat);
    if (i < 0) return -1;
    const pa = this.parancsAllapot;
    pa.parancs[i] = PARANCS.NINCS;
    pa.allas[i] = tipus === TIPUS.MUNKAS ? ALLAS.TUZSZUNET : ALLAS.AGRESSZIV;
    pa.alakzat[i] = ALAKZAT.NEGYZET;
    pa.celEgyseg[i] = -1;
    pa.celEpulet[i] = -1;
    pa.celGeneracio[i] = -1;
    pa.vegX[i] = x; pa.vegY[i] = y; pa.vegMezo[i] = -1;
    pa.horgonyX[i] = x; pa.horgonyY[i] = y;
    this.munkasok.elenged(i);
    this.beszallas.bent[i] = 0;
    this.beszallas.hol[i] = -1;
    this.harc.szuletik(i);
    return i;
  }

  /**
   * Szabad hely egy épületnek egy célpont körül, spirálban keresve.
   * @returns {{x:number,y:number}|null} a BAL-FELSŐ cella
   */
  _szabadEpuletHely(tipus, kx, ky) {
    const m = EP_MERET[tipus];
    // A célpontot az alapterület KÖZEPÉNEK vesszük, ezért told el a sarokra.
    const ox = kx - (m >> 1), oy = ky - (m >> 1);
    if (this.epuletek.lerakhato(tipus, ox, oy)) return { x: ox, y: oy };
    for (let r = 1; r < 40; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const ax = dx < 0 ? -dx : dx, ay = dy < 0 ? -dy : dy;
          if (ax !== r && ay !== r) continue;
          if (this.epuletek.lerakhato(tipus, ox + dx, oy + dy)) {
            return { x: ox + dx, y: oy + dy };
          }
        }
      }
    }
    return null;
  }

  /**
   * Teljes újrafelállás UGYANAZON a pályán, adott egységszámmal.
   *
   * A szonda ezt hívja a 100 / 400 / 800 / 1600-as lépcsők között. Szándékosan
   * NEM új `Sim`-et gyártunk: így a terep, a rács és a mezők bitre azonosak
   * maradnak, és a mérés egyetlen változót mozgat — az egységszámot. Új
   * példánynál a terep-generálás ideje és a memória-elrendezés is beleszólna,
   * és a lépcsők nem lennének összehasonlíthatók.
   * @param {number} db
   * @returns {number} a ténylegesen elhelyezett egységek száma
   */
  ujraFelallas(db, opciok) {
    this.tick = 0;
    this._sor.clear();
    this.rng = mulberry32(this.seed ^ 0xa5a5a5a5);
    // A mező-gyorstárat is ürítjük, különben az előző lépcső mezői „ingyen"
    // szolgálnák ki az újat, és alábecsülnénk az útkeresés költségét.
    for (const m of this.mezoTar.mezok) { m.cel = -1; m.utoljara = 0; }
    this.mezoTar.szamitasok = 0;
    return this.szondaFelallas(db, opciok);
  }

  /**
   * Szonda-forgatókönyv: adott tickenként a két sereg átküldi magát a pálya
   * másik oldalára. Ez a LEGROSSZABB eset az útkeresésnek és a szeparációnak
   * — pont ezt akarjuk mérni.
   */
  szondaParancs() {
    const e = this.egysegek;
    const n = this.n;
    const a = [], b = [];
    for (let i = 0; i < e.db; i++) (e.csapat[i] === 0 ? a : b).push(i);
    // A célt középre, de ellentétes oldalra tesszük — a két sereg ÁTHALAD
    // egymáson, ami a szeparáció legdurvább próbája.
    const celA = this._jarhatoKozel(n * 0.78, n * 0.5);
    const celB = this._jarhatoKozel(n * 0.22, n * 0.5);
    if (a.length) this.parancs({ fajta: 'menet', egysegek: a, x: celA.x, y: celA.y });
    if (b.length) this.parancs({ fajta: 'menet', egysegek: b, x: celB.x, y: celB.y });
  }

  /**
   * v0.2 SZONDA-FORGATÓKÖNYV — a teljes irányítás-felület determinizmus-próbája.
   *
   * ── MIÉRT KELL KÜLÖN A `szondaParancs()` MELLÉ ────────────────────────
   * A v0.1 forgatókönyve EGYETLEN parancsfajtát ismer (`menet`). A v0.2 hatot
   * hozott, és azok új, hasított állapotot írnak (`parancs`, `allas`,
   * `celEgyseg`) — vagyis pont az a kód maradna a kapun KÍVÜL, ami a legfrissebb,
   * tehát a legkockázatosabb. Egy zöld szonda, ami a v0.2-t meg sem nézi, rosszabb
   * a semminél: biztonságérzetet ad.
   *
   * A forgatókönyv körökre jár, és körönként mást csinál, hogy a parancsok
   * EGYMÁSRA hatása is látszódjon (üldözés közben érkező állás-váltás, félbehagyott
   * menet, alakzat-csere menet közben). Minden döntés a `kor` számlálóból és az
   * indexekből következik — nincs benne se véletlen, se valós idő.
   *
   * @param {number} kor hányadik parancs-kör (a hívó lépteti)
   */
  szondaParancsV02(kor) {
    const e = this.egysegek;
    const n = this.n;
    const a = [], b = [];
    for (let i = 0; i < e.db; i++) (e.csapat[i] === 0 ? a : b).push(i);
    if (a.length === 0 && b.length === 0) return;

    const celA = this._jarhatoKozel(n * 0.78, n * 0.5);
    const celB = this._jarhatoKozel(n * 0.22, n * 0.5);
    const kozep = this._jarhatoKozel(n * 0.5, n * 0.5);

    switch (kor & 3) {
      case 0:
        // Két sereg egymásnak, ELTÉRŐ alakzatban. Ez a legdurvább eset: az
        // átfedő seregekben minden egység célt talál, tehát az üldözés-ág és a
        // harcérintkezés-ág egyszerre fut mind az 1600-on.
        if (a.length) this.parancs({ fajta: 'tamado_menet', egysegek: a, x: celA.x, y: celA.y, alakzat: ALAKZAT.EK });
        if (b.length) this.parancs({ fajta: 'tamado_menet', egysegek: b, x: celB.x, y: celB.y, alakzat: ALAKZAT.VONAL });
        break;
      case 1:
        // Állás-váltás MENET KÖZBEN. A védekező kötélhossz és a tartás-állás
        // itt kezd el visszahúzni egységeket, miközben a menet még él.
        if (a.length) this.parancs({ fajta: 'allas', egysegek: a, allas: ALLAS.VEDEKEZO });
        if (b.length) this.parancs({ fajta: 'allas', egysegek: b, allas: ALLAS.TARTAS });
        break;
      case 2: {
        // Részleges kijelölés: minden sereg FELE megáll (tartás), a másik fele
        // középre indul szórt alakzatban. Így egy csapaton belül is keveredik a
        // parancs-fajta — a valódi játékban ez a jellemző állapot.
        const aFel = a.filter((_, k) => (k & 1) === 0);
        const aMas = a.filter((_, k) => (k & 1) === 1);
        const bFel = b.filter((_, k) => (k & 1) === 0);
        const bMas = b.filter((_, k) => (k & 1) === 1);
        if (aFel.length) this.parancs({ fajta: 'tartas', egysegek: aFel });
        if (aMas.length) this.parancs({ fajta: 'menet', egysegek: aMas, x: kozep.x, y: kozep.y, alakzat: ALAKZAT.SZORT });
        if (bFel.length) this.parancs({ fajta: 'allj', egysegek: bFel });
        if (bMas.length) this.parancs({ fajta: 'tamado_menet', egysegek: bMas, x: kozep.x, y: kozep.y, alakzat: ALAKZAT.NEGYZET });
        break;
      }
      default:
        // Vissza agresszívre, és tűzszünet a másik oldalon — a tűzszünet ága
        // (cél azonnali elengedése harc közben) különben sosem futna le.
        if (a.length) this.parancs({ fajta: 'allas', egysegek: a, allas: ALLAS.AGRESSZIV });
        if (b.length) this.parancs({ fajta: 'allas', egysegek: b, allas: ALLAS.TUZSZUNET });
        if (a.length) this.parancs({ fajta: 'tamado_menet', egysegek: a, x: celA.x, y: celA.y, alakzat: ALAKZAT.NEGYZET });
        break;
    }
  }

  /**
   * v0.3 SZONDA-FORGATÓKÖNYV — a gazdaság determinizmus-próbája.
   *
   * A v0.2-es kör a hadsereget járatja, ez a gazdaságot: gyűjtés mind a négy
   * nyersanyagból, raktár-építés (ami MENET KÖZBEN zárja le a cellákat, tehát
   * áramlási mezőt érvénytelenít), korszakváltás, és a munkások félbeszakítása
   * menetparanccsal.
   *
   * Az utolsó kettő a lényeg: a járhatóság futás közbeni változása és a
   * félbeszakított munkás-állapotgép a v0.3 két legkockázatosabb ága.
   *
   * @param {number} kor hányadik parancs-kör
   */
  szondaParancsV03(kor) {
    const e = this.egysegek;
    const munkasok = [[], []];
    for (let i = 0; i < e.db; i++) {
      if (e.tipus[i] === TIPUS.MUNKAS) munkasok[e.csapat[i]].push(i);
    }

    for (let cs = 0; cs < 2; cs++) {
      const mk = munkasok[cs];
      if (mk.length === 0) continue;
      const bx = cs === 0 ? this.n * 0.22 : this.n * 0.78;
      const by = this.n * 0.5;

      switch (kor & 3) {
        case 0: {
          // Mind a négy nyersanyagra küldünk egy negyedet. Így a gyűjtés
          // minden ága fut: a bokor (járható lelőhely) és a három záró is.
          for (let f = 0; f < 4; f++) {
            const resz = mk.filter((_, k) => (k & 3) === f);
            if (resz.length === 0) continue;
            const node = this.eroforrasok.keres(f, bx, by, 90);
            if (node < 0) continue;
            this.parancs({
              fajta: 'gyujt', egysegek: resz,
              x: this.eroforrasok.x[node], y: this.eroforrasok.y[node], nyers: f,
            });
          }
          break;
        }
        case 1: {
          // Raktár a fa mellé. Ez ZÁRJA a celláit → mező-érvénytelenítés
          // MENET KÖZBEN, miközben munkások tartanak arra. Pont ezt akarjuk.
          const node = this.eroforrasok.keres(NYERS.FA, bx, by, 90);
          if (node >= 0) {
            this.parancs({
              fajta: 'epit', csapat: cs, tipus: EPULET.RAKTAR,
              x: (this.eroforrasok.x[node] | 0) + 3, y: (this.eroforrasok.y[node] | 0) + 3,
            });
          }
          break;
        }
        case 2:
          this.parancs({ fajta: 'korszak', csapat: cs });
          break;
        default: {
          // Félbeszakítás: a munkások fele menetparancsot kap (fel kell mondania
          // a gyűjtésnek), a másik fele visszaáll dolgozni.
          const fel = mk.filter((_, k) => (k & 1) === 0);
          const mas = mk.filter((_, k) => (k & 1) === 1);
          const kozep = this._jarhatoKozel(this.n * 0.5, this.n * 0.5);
          if (fel.length) this.parancs({ fajta: 'menet', egysegek: fel, x: kozep.x, y: kozep.y });
          if (mas.length) {
            const node = this.eroforrasok.keres(NYERS.KRISTALY, bx, by, 90);
            if (node >= 0) {
              this.parancs({
                fajta: 'gyujt', egysegek: mas,
                x: this.eroforrasok.x[node], y: this.eroforrasok.y[node],
              });
            }
          }
          break;
        }
      }
    }
  }

  /**
   * v0.4 SZONDA-FORGATÓKÖNYV — a harcrendszer determinizmus-próbája.
   *
   * A két sereg egymásnak megy és HALÁLIG verekszik. Ez a kör azt a két ágat
   * járatja, amit a v0.2-es nem tudott: a sebzés-számítást (páncél, ellensúly,
   * ütem) és a HALÁLT — ami a szimuláció legdurvább állapotváltozása, mert egy
   * egység egyszerre esik ki a mozgásból, a célzásból, a hasítótáblából és a
   * képből, miközben mások épp őt célozták.
   *
   * A körök közt újra parancsot adunk, mert a fogyó sereg egyre ritkul, és a
   * megmaradtaknak újra kell keresniük egymást.
   *
   * @param {number} kor hányadik parancs-kör
   */
  szondaParancsV04(kor) {
    const e = this.egysegek;
    const elo = this.harc.elo;
    const a = [], b = [];
    for (let i = 0; i < e.db; i++) {
      if (elo[i] === 0) continue;
      (e.csapat[i] === 0 ? a : b).push(i);
    }
    if (a.length === 0 || b.length === 0) return;

    // A cél a MÁSIK sereg súlypontja — így a ritkuló seregek is megtalálják
    // egymást, nem egy fix pontra masíroznak, ahol már nincs senki.
    let ax = 0, ay = 0, bx = 0, by = 0;
    for (let k = 0; k < a.length; k++) { ax += e.px[a[k]]; ay += e.py[a[k]]; }
    for (let k = 0; k < b.length; k++) { bx += e.px[b[k]]; by += e.py[b[k]]; }
    const celA = this._jarhatoKozel(bx / b.length, by / b.length);
    const celB = this._jarhatoKozel(ax / a.length, ay / a.length);

    if ((kor & 3) === 1) {
      // FAL és KAPU: a v0.4/3-4 ága. A fal ZÁRJA a celláit (mező-érvénytelenítés
      // menet közben), a kapu nyitása pedig MEGNYITJA — vagyis mindkét irányban
      // változik a pálya, miközben seregek masíroznak rajta.
      for (let cs = 0; cs < 2; cs++) {
        const fx = (cs === 0 ? this.n * 0.34 : this.n * 0.66) | 0;
        const fy = (this.n * 0.5) | 0;
        // Négy fal + egy kapu: a kezdőkészletbe (100 kő) pont belefér. Hattal
        // a kapura már nem maradna kő, és a forgatókönyv csendben kihagyná a
        // kapu-ágat — vagyis a legfrissebb kód maradna ki a vizsgálatból.
        for (let k = -2; k <= 2; k++) {
          if (k === 0) continue;
          this.parancs({ fajta: 'epit', csapat: cs, tipus: EPULET.FAL, x: fx, y: fy + k });
        }
        this.parancs({ fajta: 'epit', csapat: cs, tipus: EPULET.KAPU, x: fx, y: fy });
      }
    }
    if ((kor & 3) === 3) {
      // A kapuk nyitása: a `nyitva` jelző és a járhatóság együtt vált.
      for (let i = 0; i < this.epuletek.db; i++) {
        if (this.epuletek.tipus[i] === EPULET.KAPU && this.epuletek.el(i)) {
          this.parancs({
            fajta: 'kapu', csapat: this.epuletek.csapat[i],
            epulet: i, nyit: ((kor >> 2) & 1) === 0,
          });
        }
      }
    }
    if ((kor & 3) === 2) {
      // Egy körben állást is váltunk: a védekező kötélhossz és a tartás
      // másképp viselkedik, ha közben tényleg fogynak az egységek.
      this.parancs({ fajta: 'allas', egysegek: a, allas: ALLAS.VEDEKEZO });
      this.parancs({ fajta: 'allas', egysegek: b, allas: ALLAS.AGRESSZIV });
    }
    const alakA = (kor & 1) ? ALAKZAT.VONAL : ALAKZAT.EK;
    const alakB = (kor & 1) ? ALAKZAT.NEGYZET : ALAKZAT.VONAL;
    this.parancs({ fajta: 'tamado_menet', egysegek: a, x: celA.x, y: celA.y, alakzat: alakA });
    this.parancs({ fajta: 'tamado_menet', egysegek: b, x: celB.x, y: celB.y, alakzat: alakB });

    // ── BESZÁLLÁSOLÁS ───────────────────────────────────────────────────
    // ⚠️ A SORREND ITT SZÁMÍT, ÉS EZ MÉRT TANULSÁG. Az első változatban ez a
    // blokk a támadó menet ELŐTT állt, és a beszállásolás SOSEM futott le: a
    // menetparancs ugyanabban a körben felülírta, a következő kör pedig 250
    // tickenként újra — mire a katona a központhoz ért volna, már rég másfelé
    // masírozott. A kumulatív számláló (`beDb`) mutatta ki; a pillanatnyi
    // létszám végig 0 volt, és a determinizmus-kapu zölden hallgatott.
    //
    // Ezért a blokk a menet UTÁN van (a később beadott parancs nyer), és csak
    // a központ KÖZELÉBEN álló egységeket küldi be — akik 250 ticken belül
    // tényleg odaérnek.
    if ((kor & 1) === 0) {
      for (let cs = 0; cs < 2; cs++) {
        let kozp = -1;
        for (let k = 0; k < this.epuletek.db; k++) {
          if (this.epuletek.csapat[k] === cs && this.epuletek.kesz(k)
            && this.epuletek.tipus[k] === EPULET.KOZPONT) { kozp = k; break; }
        }
        if (kozp < 0) continue;
        const kx = this.epuletek.x[kozp], ky = this.epuletek.y[kozp];
        const kozel = (cs === 0 ? a : b).filter((i) => {
          const dx = e.px[i] - kx, dy = e.py[i] - ky;
          return dx * dx + dy * dy < 900;   // 30 világegység sugarú kör
        });
        if (kozel.length) this.parancs({ fajta: 'beszallas', egysegek: kozel, epulet: kozp });
        // A KÖVETKEZŐ körben ugyanez a kapu nyílik ki: a kiszállás is fut.
        if ((kor & 3) === 2) this.parancs({ fajta: 'kiszallas', csapat: cs, epulet: kozp });
      }
    }
  }

  /**
   * v0.5 SZONDA-FORGATÓKÖNYV — gazdaság + építkezés + EGYSÉG-KÉPZÉS.
   *
   * ⚠️ KIS KEZDŐSEREGGEL FUT (lásd a szonda `egysegSzam` beállítását). A v0.1
   * stressz-felállása 1600 egységet tesz ki, ami önmagában 800 népesség
   * csapatonként — a képzés ott MINDIG elutasításba futna, és a v0.5 ága ki sem
   * futna. Ez ugyanaz a csapda, mint a v0.4-es falnál: ha a parancs csendben
   * elvész, a legfrissebb kód marad a kapun kívül.
   *
   * A kör: gyűjtés → piaci csere → támadás → képzés, MELLETTE pedig minden
   * körben végigfut a teljes építési sor (`_szondaEpitsor`). Ez egyben a
   * legegyszerűbb valódi build order is, tehát a v0.6 AI-jának mintája.
   *
   * @param {number} kor
   */
  szondaParancsV05(kor) {
    const e = this.egysegek;
    for (let cs = 0; cs < 2; cs++) {
      const bx = (cs === 0 ? this.n * 0.22 : this.n * 0.78) | 0;
      const by = (this.n * 0.5) | 0;
      let kozp = -1;
      for (let k = 0; k < this.epuletek.db; k++) {
        if (this.epuletek.csapat[k] === cs && this.epuletek.el(k)
          && this.epuletek.tipus[k] === EPULET.KOZPONT) { kozp = k; break; }
      }
      if (kozp < 0) continue;

      // ÉPÍTÉSI SOR MINDEN KÖRBEN — nem körönként EGY tétel.
      //
      // Az első változat körönként egy épületet próbált (ház → laktanya →
      // íjászda → piac → torony), és mérve elakadt: a 175 fás íjászda a
      // körfordulat elején elvitte a fát, a piac pedig csak nyolc körrel később
      // került sorra, amikorra megint nem volt miből. Így SOSEM épült piac, a
      // piac nélkül nem volt kő, kő nélkül nem volt torony — a v0.5/3 két új
      // alrendszere együtt maradt a kapun kívül.
      //
      // Az `epit` parancs csendben elutasít, ha nem telik. Ezért a teljes sort
      // minden körben újra beadhatjuk: ami már áll, azt a hely-ütközés dobja,
      // amire nem telik, az elutasításba fut, és a legelső megfizethető tétel
      // épül meg. Ez egyben a v0.6 AI-jának mintája is.
      this._szondaEpitsor(cs, bx, by, kozp);

      // PIACI CSERE fa → kő (v0.5/3) — szintén MINDEN körben, az építési sor
      // UTÁN, tehát a maradékból. A kő ebben a körben nem gyűjthető: a piac az
      // EGYETLEN forrása, és a torony 125-öt kér. Ha ez néma marad, a torony
      // ága sem fut ki — pont ezt őrzi a 8. vizsgálat.
      //
      // A készlet-feltétel nem óvatoskodás: a 200-as vak tétel mérve MINDIG
      // elutasításba futott (a fa sosem gyűlt 140 fölé), a negyedelt körönkénti
      // beadásból pedig 6000 tick alatt összesen EGY csere lett — egyetlen
      // balszerencsés futás elég lett volna, hogy nulla legyen.
      if (this.gazdasag.keszlet[cs * 4 + NYERS.FA] >= 80
        && this.gazdasag.keszlet[cs * 4 + NYERS.KO] < 260) {
        this.parancs({ fajta: 'csere', csapat: cs, ad: NYERS.FA, kap: NYERS.KO, mennyiseg: 60 });
      }

      this._szondaKutat(cs);

      const munkasok = [];
      for (let i = 0; i < e.db; i++) {
        if (e.csapat[i] === cs && e.tipus[i] === TIPUS.MUNKAS && this.harc.elo[i]) munkasok.push(i);
      }

      switch (kor % 3) {
        case 0: {
          // Gyűjtés: EGYHARMAD ételre, KÉTHARMAD fára. A felezés mérve rossz
          // arány volt: 6000 tick alatt 720 étel jött be 460 fa mellett, holott
          // az egész építési sor fából megy. Az étel csak a képzést eteti.
          const etel = munkasok.filter((_, k) => (k % 3) === 0);
          const fa = munkasok.filter((_, k) => (k % 3) !== 0);
          for (const [resz, ny] of [[etel, NYERS.ETEL], [fa, NYERS.FA]]) {
            if (!resz.length) continue;
            const node = this.eroforrasok.keres(ny, bx, by, 90);
            if (node >= 0) {
              this.parancs({
                fajta: 'gyujt', egysegek: resz,
                x: this.eroforrasok.x[node], y: this.eroforrasok.y[node], nyers: ny,
              });
            }
          }
          break;
        }
        case 1: {
          // RITKA, KIS PORTYA az ellenséges torony felé — a tornyok csak akkor
          // lőnek, ha van kire. A gazdaságnak viszont TÚL KELL ÉLNIE: ez a kör
          // nem harc-szonda, az a 7. vizsgálat dolga.
          //
          // Két mérés írta a két számot. Először a TELJES sereg ment: 3000 tick
          // alatt a 0. csapat mind a 35 egysége elesett, a központja is
          // elhullott, és onnantól sem gyűjtött, sem épített, sem képzett.
          // Utána hat egység ment, de MINDEN harmadik körben — 16 portya 12 000
          // tick alatt, vagyis a teljes hadsereg többszöröse a darálóba. Az
          // egyik fél mindig elfogyott, és a MÁSIK tornya sosem kapott
          // célpontot: 1 torony állt, 0 sortűzzel.
          //
          // Kilenc körönként egy portya viszont mindkét oldalnak hagy időt
          // újratermelni, tehát a torony végig kap kire lőni.
          if ((kor % 9) !== 1) { this._szondaKepez(cs); break; }
          const PORTYA = 4;
          const katonak = [];
          // A toronyban ÁLLÓ katona nem megy portyázni: a menetparancs kirántaná
          // az őrséget, és a sortűz-bónusz ága megint kiüresedne. (A v0.4-ben
          // pont ez történt fordítva: a menetparancs írta felül a beszállást.)
          for (let i = 0; i < e.db && katonak.length < PORTYA; i++) {
            if (e.csapat[i] !== cs || e.tipus[i] === TIPUS.MUNKAS) continue;
            if (!this.harc.elo[i] || this.beszallas.bent[i] === 1) continue;
            katonak.push(i);
          }
          if (katonak.length) {
            // A cél az ELLENSÉGES TORONY helye — nem a bázisa. A két portya így
            // egymást találja meg a senkiföldjén, mindkét torony hatótávján
            // belül, a gyűjtő munkások pedig kimaradnak a harcból.
            const t = this.szondaToronyHely(1 - cs);
            const c = this._jarhatoKozel(t.x, t.y);
            this.parancs({ fajta: 'tamado_menet', egysegek: katonak, x: c.x, y: c.y });
          }
          break;
        }
        default:
          this._szondaKepez(cs);
          break;
      }
    }
  }

  /**
   * KUTATÁS (v0.5/4) — minden körben végigpróbáljuk a hat technológiát.
   *
   * Ugyanaz a minta, mint az építési sornál: a `Technologia.indit()` maga dönt
   * mindenről (jó épület-e, megvan-e a korszak, telik-e rá), és csendben
   * elutasít. A szondának így nem kell külön ütemtervet tartania — ami
   * megfizethető, az elindul, a többi a következő körben próbálkozik újra.
   *
   * A kutatás a legdrágább dolog a körben, ezért a FA-TARTALÉK itt is él:
   * enélkül a kovácsolás elvinné a piacra szánt fát, és a v0.5/3 ága esne ki.
   */
  _szondaKutat(cs) {
    if (this.gazdasag.keszlet[cs * 4 + NYERS.FA] < 200) return;
    const ep = this.epuletek;
    for (let t = 0; t < TECH_DB; t++) {
      if (this.technologia.allapot[cs * TECH_DB + t] !== 0) continue;
      const kellEp = techEpulete(t);
      for (let k = 0; k < ep.db; k++) {
        if (ep.csapat[k] !== cs || !ep.kesz(k) || ep.tipus[k] !== kellEp) continue;
        this.parancs({ fajta: 'kutatas', csapat: cs, tech: t, epulet: k });
        break;
      }
    }
  }

  /**
   * KÉPZÉS minden képző épületben. A `Kepzes` dönt arról, telik-e és van-e
   * népesség — a parancs csak sorba állít, az elutasítást a szonda számolja.
   *
   * ⚠️ FA-TARTALÉK. A katona-képzés és az építési sor UGYANABBÓL a fából él (a
   * lándzsás 25-öt kér), és mérve a képzés felfalta a piacra szánt 175-öt: 12
   * 000 tick alatt 65 elutasított sorbaállás mellett egyetlen piac sem épült
   * meg, tehát se kő, se torony. A MUNKÁS kivétel — az csak ételbe kerül, és a
   * gazdaságot épp ő növeli.
   */
  _szondaKepez(cs) {
    const FA_TARTALEK = 220;
    const vanFa = this.gazdasag.keszlet[cs * 4 + NYERS.FA] >= FA_TARTALEK;
    for (let k = 0; k < this.epuletek.db; k++) {
      if (this.epuletek.csapat[k] !== cs || !this.epuletek.kesz(k)) continue;
      const t = this.epuletek.tipus[k];
      if (t !== EPULET.KOZPONT && !vanFa) continue;
      let egyseg = -1;
      if (t === EPULET.KOZPONT) egyseg = TIPUS.MUNKAS;
      else if (t === EPULET.LAKTANYA) egyseg = TIPUS.LANDZSAS;
      else if (t === EPULET.IJASZDA) egyseg = TIPUS.IJASZ;
      if (egyseg < 0) continue;
      for (let n = 0; n < 3; n++) {
        this.parancs({ fajta: 'kepzes', csapat: cs, epulet: k, egyseg });
      }
    }
  }

  /**
   * A v0.5 szonda ÉPÍTÉSI SORA — minden körben végigmegy rajta.
   *
   * A sorrend prioritás, nem ütemterv: a ház adja a népességet (enélkül nincs
   * képzés), a piac a követ, a kő a tornyot, a laktanya pedig a katonát. A
   * helyek FIXEK, tehát a második beadás ugyanoda ütközik és elvész — nem
   * duplázódik.
   *
   * ⚠️ ÍJÁSZDA NINCS BENNE, és ez mérés eredménye: a sor összköltsége 175 fával
   * több lett volna, mint amennyit a kör gazdasága 6000 tick alatt egyáltalán
   * kitermel. Az íjászda ott állt a piac ELŐTT, elvitte a fát, és a piac soha
   * nem épült meg — piac nélkül pedig nincs kő, kő nélkül nincs torony. A
   * képzéshez a laktanya is elég; az íjászt a v0.4 harc-köre járatja.
   *
   * A torony az ellenség FELÉ tolva áll a központtól, hogy a betörő sereg
   * tényleg a hatótávjába érjen. Enélkül a sortűz-ág soha nem futna ki, és a
   * zöld determinizmus-kapu egy néma tornyot igazolna.
   */
  _szondaEpitsor(cs, bx, by, kozp) {
    for (let k = 0; k < 4; k++) {
      this.parancs({ fajta: 'epit', csapat: cs, tipus: EPULET.HAZ, x: bx + 6 + k * 3, y: by - 8 });
    }
    this.parancs({ fajta: 'epit', csapat: cs, tipus: EPULET.PIAC, x: bx + 7, y: by - 13 });
    this.parancs({ fajta: 'epit', csapat: cs, tipus: EPULET.LAKTANYA, x: bx + 7, y: by + 7 });
    const t = this.szondaToronyHely(cs);
    this.parancs({ fajta: 'epit', csapat: cs, tipus: EPULET.TORONY, x: t.x, y: t.y });
    this._szondaToronyOrseg(cs);
  }

  /**
   * ŐRSÉG A TORONYBA (v0.5/3). A torony 1 + a bent állók számával lő — enélkül
   * a sortűz mindig PONTOSAN egy nyilat adna, és a beszállásolási bónusz ága
   * sosem futna le. Mérve pontosan ez történt: 91 sortűz, 91 nyíl.
   *
   * Legfeljebb `ORSEG` katona megy be, és csak akkor, ha a torony még nem
   * telt — a kiszállásra itt nincs szükség, a bónuszt a bent maradás adja.
   */
  _szondaToronyOrseg(cs) {
    const ORSEG = 3;
    let torony = -1;
    for (let k = 0; k < this.epuletek.db; k++) {
      if (this.epuletek.csapat[k] === cs && this.epuletek.kesz(k)
        && this.epuletek.tipus[k] === EPULET.TORONY) { torony = k; break; }
    }
    if (torony < 0 || this.beszallas.letszam[torony] >= ORSEG) return;
    const e = this.egysegek;
    const kell = ORSEG - this.beszallas.letszam[torony];
    const kik = [];
    for (let i = 0; i < e.db && kik.length < kell; i++) {
      if (e.csapat[i] !== cs || e.tipus[i] === TIPUS.MUNKAS) continue;
      if (!this.harc.elo[i] || this.beszallas.bent[i] === 1) continue;
      kik.push(i);
    }
    if (kik.length) this.parancs({ fajta: 'beszallas', egysegek: kik, epulet: torony });
  }

  /**
   * A v0.5 szonda TORONY-HELYE: a pálya közepén, a saját oldalon, hat cellával
   * a senkiföldje közepétől. A portyák is oda mennek — így a torony hatótávja
   * (8,0) biztosan lefedi a találkozási pontot.
   *
   * ⚠️ MIÉRT NEM A BÁZISNÁL ÁLL. Először a központ mellé került, a portya pedig
   * az ellenséges bázisra ment. Mérve ez tette tönkre az egész kört: a hat
   * portyázó egység a GYŰJTŐ MUNKÁSOK közé érkezett (a munkás tűzszünetben áll,
   * tehát vissza sem üt), 12 000 tick alatt MINDKÉT központ elhullott, és a
   * gazdaság a 2000. tick után egyetlen egységnyi nyersanyagot sem termelt.
   * Senkiföldjén viszont a két portya EGYMÁST találja meg, a bázis békében
   * dolgozik, a torony pedig végig kap célpontot.
   */
  szondaToronyHely(cs) {
    const kx = (this.n * 0.5) | 0;
    return { x: kx + (cs === 0 ? -6 : 6), y: (this.n * 0.5) | 0 };
  }
  /**
   * v0.6 SZONDA-FORGATÓKÖNYV — A GÉP JÁTSZIK MINDKÉT OLDALON.
   *
   * Itt nincs kézi parancs-lista: a `szondaFelallasV06` átadja mindkét csapatot
   * az AI-nak, és onnantól a forgatókönyv MAGA az AI. Ez a lényege — a
   * determinizmus-kapunak pont azt kell őriznie, hogy a gép döntései bitre
   * reprodukálhatók.
   *
   * A két csapat KÜLÖNBÖZŐ nehézségen fut. Nem kényelem: ha mindkettő ugyanazon
   * a szinten menne, a döntési ütem és minden célszám azonos lenne, és egy
   * elrontott nehézség-index (rossz tömbindexelés) SEMMIT nem változtatna a
   * hash-en — a hiba a kapun belül maradna.
   */
  szondaFelallasV06(osszDb) {
    // ⚠️ CSUPA MUNKÁSSAL INDUL, ÉS EZ MÉRÉS EREDMÉNYE. A v0.5 felállását
    // örökölve a kör csapatonként 15 KATONÁVAL kezdett, és bármelyik támadási
    // küszöb azonnal teljesült: az első döntési körben (120. tick) elindult egy
    // teljes hadsereg, még mielőtt bármelyik gazdaság létezett volna. A meccset
    // az örökölt sereg döntötte el, nem az AI — a nehéz gép 2 munkással és
    // NULLA katonai épülettel végezte, tehát a build ordere, a képzése és a
    // kutatása gyakorlatilag ki sem futott.
    //
    // A műfaj valódi nyitása is ez: néhány munkás, semmi más. A gépnek végig
    // kell mennie a saját láncán — gyűjtés → ház → laktanya → katona →
    // felderítés → támadás —, és pont ez az, amit a kapun belül akarunk tudni.
    const db = this.szondaFelallas(osszDb, { munkasMinden: 1 });
    this.ai.beallit(0, NEHEZSEG.KONNYU);
    this.ai.beallit(1, NEHEZSEG.NEHEZ);
    return db;
  }

  /**
   * CIV-VÁLASZTÁS egy csapatnak (v0.9).
   *
   * NEM parancs, hanem a MECCS BEÁLLÍTÁSA: a felállás előtt kell megtörténnie,
   * mert a kezdő központ életereje már a civ épület-bónuszával születik. A
   * v0.11 főmenüje és a v0.8 meccs-konfigja innen fog dolgozni.
   */
  civValaszt(csapat, civ) {
    if (csapat < 0 || csapat >= this.civValasztas.length) return;
    this.civValasztas[csapat] = civ;
    this.civ.beallit(csapat, civ);
    // A kettő SOSEM járhat külön: a bónuszok és az egyedi egység ugyanazé a
    // népé. Ezért nincs külön `egyediValaszt()` — egy kapu, egy döntés.
    this.egyedi.beallit(csapat, civ);
  }

  /**
   * v0.9 SZONDA-FELÁLLÁS — két KÜLÖNBÖZŐ civ, mindkét oldalon géppel.
   *
   * Ugyanaz a meccs, mint a v0.6-é (a gép viszi mindkét oldalt), de a két
   * csapat más népet játszik. Két dolog miatt így:
   *
   *   · A civ-réteg minden beakasztási pontja a GÉP láncán fut végig —
   *     gyűjtés-ütem, cipelés, épület-ár, épület-életerő, egység-ár és -idő,
   *     népesség, sebzés, páncél. Kézzel írt parancs-listával ennek a felét
   *     sem járnánk be.
   *   · ⚠️ A KÉT CIV KÜLÖNBÖZŐ. Ha mindkét csapat ugyanazt játszaná, minden
   *     civ-függő szám azonos lenne a két oldalon, és egy elrontott
   *     CSAPAT-INDEXELÉS (`civ[0]` a `civ[1]` helyett) SEMMIT nem változtatna
   *     a hash-en — a hiba a kapun belül maradna. Ugyanaz a megfontolás, mint
   *     a v0.6 két nehézségi szintjénél.
   *
   * A NEHÉZSÉG viszont itt AZONOS mindkét oldalon, szándékosan: így a két
   * gazdaság közti minden eltérés a CIV számlájára írható, nem a döntési ütemre.
   */
  szondaFelallasV09(osszDb) {
    // A civ-választás a felállás ELŐTT: a `szondaFelallas` a `civValasztas`-ból
    // állítja vissza, és a központok az ő épület-százalékával születnek meg.
    this.civValaszt(0, CIV.HEGYI_BANYASZ);
    this.civValaszt(1, CIV.FOLYAMI_KERESKEDO);
    const db = this.szondaFelallas(osszDb, { munkasMinden: 1 });
    this.ai.beallit(0, NEHEZSEG.NEHEZ);
    this.ai.beallit(1, NEHEZSEG.NEHEZ);
    return db;
  }

  /** Legközelebbi járható pont egy célhoz (spirálban keresve). */
  _jarhatoKozel(x, y) {
    if (this.racs.jarhatoPont(x, y)) return { x, y };
    for (let r = 1; r < 40; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const nx = x + dx, ny = y + dy;
          if (this.racs.jarhatoPont(nx, ny)) return { x: nx, y: ny };
        }
      }
    }
    return { x, y };
  }

  /**
   * 32 bites állapot-ujjlenyomat (FNV-1a a nyers bájtokon).
   *
   * Szándékosan a NYERS float-bájtokat hasítjuk, nem kerekített értékeket: a
   * desync-detektálásnak a legapróbb utolsó-bit eltérést is el kell kapnia,
   * mert az néhány száz tick alatt látható szétcsúszássá nő.
   * @returns {number}
   */
  allapotHash() {
    const e = this.egysegek;
    const db = e.db;
    let h = 0x811c9dc5;
    // ⚠️ A TÉRKÉP-PRESET IS BENNE VAN (v0.10). A terep maga nincs a hashben —
    // a seedből épül, tehát fölösleges lenne —, de a preset MEGVÁLTOZTATJA a
    // terepet ugyanabból a seedből. Enélkül két gép, ami más presetet
    // választott, nem a 0. körben bukna ki, hanem néhány tick múlva, amikor az
    // első egység másfelé kerüli meg a folyót — és a desync-jelentés a
    // MOZGÁSRA mutatna, nem a valódi okra. Egy szám, és a hiba megnevezi magát.
    h = fnvSzam(h, this.terkep);
    h = fnvSzam(h, this.tick);
    h = fnvSzam(h, db);
    h = fnvTomb(h, e.px, db);
    h = fnvTomb(h, e.py, db);
    h = fnvTomb(h, e.vx, db);
    h = fnvTomb(h, e.vy, db);
    h = fnvTomb(h, e.szog, db);
    const pa = this.parancsAllapot;
    for (let i = 0; i < db; i++) {
      h = fnvSzam(h, e.allapot[i]);
      h = fnvSzam(h, e.egyenes[i]);
      h = fnvSzam(h, e.mezoId[i]);
      // v0.2 — az irányítás állapota IS a szimuláció állapota. Ha két gépen
      // más egységet céloz meg ugyanaz a katona, az néhány száz tick alatt
      // látható szétcsúszás; a desync-detektornak ezt ugyanúgy el kell kapnia,
      // mint egy elmozdult koordinátát.
      h = fnvSzam(h, pa.parancs[i]);
      h = fnvSzam(h, pa.allas[i]);
      h = fnvSzam(h, pa.celEgyseg[i]);
      h = fnvSzam(h, pa.celEpulet[i]);
      h = fnvSzam(h, pa.celGeneracio[i]);
      h = fnvSzam(h, e.generacio[i]);
      // v0.4 — egyetlen életerő-pont eltérése dönti el, hogy egy katona
      // túlél-e egy csapást; onnantól két különböző meccs fut a két gépen.
      h = fnvSzam(h, this.harc.hp[i]);
      h = fnvSzam(h, this.harc.elo[i]);
      h = fnvSzam(h, this.harc.utemHatra[i]);
      h = fnvSzam(h, this.beszallas.bent[i]);
      h = fnvSzam(h, this.beszallas.hol[i]);
    }

    // v0.3 — a gazdaság is a szimuláció állapota. Egyetlen fával több az egyik
    // gépen ugyanúgy szétviszi a meccset, mint egy elmozdult koordináta: abból
    // más lesz a korszakváltás ideje, abból más a hadsereg, és onnan már nincs
    // visszaút. A munkás-óra (`ora`) is benne van, mert az dönti el, MELYIK
    // ticken esik le a következő egységnyi nyersanyag.
    const mu = this.munkasok;
    for (let i = 0; i < db; i++) {
      h = fnvSzam(h, mu.allapot[i]);
      h = fnvSzam(h, mu.celNode[i]);
      h = fnvSzam(h, mu.cipelDb[i]);
      h = fnvSzam(h, mu.ora[i]);
      h = fnvSzam(h, mu.probal[i]);
    }
    const g = this.gazdasag;
    for (let k = 0; k < g.keszlet.length; k++) h = fnvSzam(h, g.keszlet[k]);
    for (let cs = 0; cs < g.csapatDb; cs++) {
      h = fnvSzam(h, g.korszak[cs]);
      h = fnvSzam(h, g.korszakHatra[cs]);
    }
    const ep = this.epuletek;
    h = fnvSzam(h, ep.db);
    for (let i = 0; i < ep.db; i++) {
      h = fnvSzam(h, ep.cx[i]);
      h = fnvSzam(h, ep.cy[i]);
      h = fnvSzam(h, ep.tipus[i]);
      h = fnvSzam(h, ep.csapat[i]);
      h = fnvSzam(h, ep.epulHatra[i]);
      // v0.4 — az épület életereje és a kapu állása is a világ állapota.
      h = fnvSzam(h, ep.hp[i]);
      h = fnvSzam(h, ep.elo[i]);
      h = fnvSzam(h, ep.nyitva[i]);
      h = fnvSzam(h, ep.lovesHatra[i]);
      // v0.5 — a képzési sor is a világ állapota: eldönti, mikor és mi születik.
      h = fnvSzam(h, this.kepzes.sorDb[i]);
      h = fnvSzam(h, this.kepzes.hatra[i]);
      for (let k = 0; k < this.kepzes.sorDb[i]; k++) {
        h = fnvSzam(h, this.kepzes.sor[i * 8 + k]);
      }
    }
    // v0.5/4 — a technológia a VILÁG állapota. Ha kimaradna, két gép futhatna
    // azonos hash-sel úgy, hogy az egyiken már kész a kovácsolás, a másikon
    // nem — és a következő csata máshogy dőlne el. A ki nem mondott bónusz a
    // legrosszabb fajta desync: a hash zöld, a meccs mégis kettéválik.
    const tech = this.technologia;
    for (let i = 0; i < tech.allapot.length; i++) {
      h = fnvSzam(h, tech.allapot[i]);
      h = fnvSzam(h, tech.hatra[i]);
      h = fnvSzam(h, tech.hol[i]);
    }
    // v0.6 — a gépi ellenfél BEÁLLÍTÁSA és döntés-számlálója. A beállítás azért
    // van benne, mert ha két gép eltérő nehézségen futtatná ugyanazt a csapatot,
    // MINDEN további döntés elcsúszna; a döntés-számláló pedig azt kapja el, ha
    // a gépek eltérő TICKEN gondolkodnak — ezt a világ állapota csak jóval
    // később mutatná meg.
    const ai = this.ai;
    for (let cs = 0; cs < ai.csapatDb; cs++) {
      h = fnvSzam(h, ai.aktiv[cs]);
      h = fnvSzam(h, ai.nehezseg[cs]);
      h = fnvSzam(h, ai.dontesDb[cs]);
      // v0.6/3 — a gép TUDÁSA és hadműveleti állapota is a világ állapota. Ha
      // az egyik gépen már felfedezte az ellenséges bázist, a másikon még nem,
      // akkor az egyiken elindul a támadás, a másikon nem — és onnantól két
      // különböző meccs fut. A felderítő indexe és generációja ugyanígy: abból
      // következik, hogy mikor küld a gép újat.
      h = fnvSzam(h, ai.ismertX[cs]);
      h = fnvSzam(h, ai.ismertY[cs]);
      h = fnvSzam(h, ai.felderito[cs]);
      h = fnvSzam(h, ai.felderitoGen[cs]);
      h = fnvSzam(h, ai.felderitoIdo[cs]);
      h = fnvSzam(h, ai.had[cs]);
      h = fnvSzam(h, ai.frissitesIdo[cs]);
    }
    // v0.7 — a FELFEDEZETTSÉG a világ állapota. Nem vezethető le a pozíciókból
    // (halmozott), a gép ebből dönt, és a v0.8 újracsatlakozásának is ezt kell
    // visszaadnia. A `lathato` viszont SZÁNDÉKOSAN nincs benne: az minden
    // frissítéskor nulláról épül a pozíciókból, tehát a hash már úgyis fedi.
    const kod = this.kod;
    for (let cs = 0; cs < kod.csapatDb; cs++) {
      const t = kod.latott[cs];
      for (let i = 0; i < t.length; i++) h = fnvSzam(h, t[i]);
      h = fnvSzam(h, kod.latottDb[cs]);
    }
    // v0.9 — a CIV-VÁLASZTÁS a világ állapota. A belőle SZÁMOLT bónusz-tömbök
    // nem kellenek a hashbe: azok a választásból egyértelműen levezethetők
    // (`beallit()` determinisztikus). A választás viszont igen — ha két gépen
    // más civet játszana ugyanaz a csapat, minden csapás és minden ár eltérne.
    const cv = this.civ;
    for (let cs = 0; cs < cv.csapatDb; cs++) h = fnvSzam(h, cv.civ[cs]);
    const ef = this.eroforrasok;
    for (let i = 0; i < ef.db; i++) h = fnvSzam(h, ef.keszlet[i]);
    // v0.4 — a repülő lövedék is állapot: a becsapódás ideje és a sebzése
    // eldönti, ki hal meg. A nyers float-bájtokat hasítjuk, mint a pozíciókét.
    const lv = this.lovedekek;
    h = fnvSzam(h, lv.db);
    h = fnvTomb(h, lv.x, lv.db);
    h = fnvTomb(h, lv.y, lv.db);
    for (let i = 0; i < lv.db; i++) {
      h = fnvSzam(h, lv.cel[i]);
      h = fnvSzam(h, lv.sebzes[i]);
      h = fnvSzam(h, lv.elet[i]);
    }
    return h >>> 0;
  }
}

/** FNV-1a egy 32 bites egészre. */
function fnvSzam(h, v) {
  v = v | 0;
  for (let b = 0; b < 4; b++) {
    h ^= (v >>> (b * 8)) & 0xff;
    h = Math.imul(h, 0x01000193);
  }
  return h;
}

/** FNV-1a egy Float64Array első `db` elemének NYERS bájtjaira. */
function fnvTomb(h, tomb, db) {
  const nyers = new Uint8Array(tomb.buffer, tomb.byteOffset, db * 8);
  for (let i = 0; i < nyers.length; i++) {
    h ^= nyers[i];
    h = Math.imul(h, 0x01000193);
  }
  return h;
}

/** Determinisztikus szinusz a felálláshoz (lásd `sim/fx.js` indoklását). */
function kSin(x) {
  let t = x * (1 / 6.283185307179586);
  t = t - Math.floor(t + 0.5);
  let a = t * 6.283185307179586;
  if (a > 1.5707963267948966) a = 3.141592653589793 - a;
  else if (a < -1.5707963267948966) a = -3.141592653589793 - a;
  const s = a * a;
  return a * (1 + s * (-0.16666666666666666 + s * (0.008333333333333333 +
    s * (-1.984126984126984e-4 + s * (2.7557319223985893e-6 + s * -2.505210838544172e-8)))));
}

export { ALLAPOT, TIPUS, TEREP, DT, ALAKZAT, PARANCS, ALLAS, NYERS, EPULET, KORSZAK, MUNKA, TAMADAS, PANCEL };
export { Beszallas };
