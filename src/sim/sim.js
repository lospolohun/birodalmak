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

/** Hány tickkel később hat egy parancs. 2 tick = 100 ms — a hálózat ebbe fér. */
export const KESLELTETES = 2;
/** A sim üteme. */
export const TICK_HZ = 20;

export class Sim {
  /**
   * @param {{seed?:number, n?:number, maxEgyseg?:number}} opciok
   */
  constructor(opciok = {}) {
    this.seed = (opciok.seed ?? 20260803) >>> 0;
    this.n = opciok.n ?? 256;
    this.maxEgyseg = opciok.maxEgyseg ?? 2000;

    this.tick = 0;
    this.racs = new Racs(this.n, this.seed);
    // ⚠️ A NYERSANYAGOK A MEZŐ-TÁR ELŐTT. Az erdő és a kőfejtő ZÁRJA a celláját,
    // tehát a `racs.jarhato` csak ezután végleges — és az áramlási mezők arra
    // épülnek. Fordított sorrendben az első kiszámolt mező még a nyersanyagok
    // nélküli pályát látná, és a sereg átsétálna az erdőn.
    this.eroforrasok = new Eroforrasok(this.racs, this.seed);
    this.mezoTar = new MezoTar(this.racs, 8);
    this.egysegek = new Egysegek(this.maxEgyseg, this.racs, this.mezoTar);
    /** A meccs-RNG. MINDEN véletlen ebből jön, sosem a `Math.random`-ból. */
    this.rng = mulberry32(this.seed ^ 0xa5a5a5a5);

    // ── v0.2: az irányítás rétege ───────────────────────────────────────
    // Az alakzat-számoló és a parancs-állapot előre lefoglalt tömbökkel dolgozik,
    // hogy egy 1600 fős menetparancs se allokáljon.
    this.alakzatSzamolo = new AlakzatSzamolo(this.maxEgyseg);
    this.parancsAllapot = new ParancsAllapot(this.maxEgyseg, this.egysegek);

    // ── v0.3: a gazdaság rétege ─────────────────────────────────────────
    this.epuletek = new Epuletek(this.racs);
    this.gazdasag = new Gazdasag(2);
    this.munkasok = new Munkasok(this.maxEgyseg, this);

    /**
     * A tick közbeékelt lépése. EGY objektum, a konstruktorban — az
     * `Egysegek.lep()` egyetlen horgot fogad, és a v0.3 óta ketten kérnek szót
     * ugyanott: a parancs-állapot (célzás, állás) és a munkás-AI. Zárvány
     * tickenkénti gyártása allokáció lenne a forró úton.
     */
    this._tickHorog = {
      lep: (t) => { this.parancsAllapot.lep(t); this.munkasok.lep(t); },
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
    const t = this.tick + KESLELTETES;
    let lista = this._sor.get(t);
    if (!lista) { lista = []; this._sor.set(t, lista); }
    lista.push(parancs);
  }

  /** Egy tick végrehajtása. */
  lep() {
    const lista = this._sor.get(this.tick);
    if (lista) {
      for (let i = 0; i < lista.length; i++) this._vegrehajt(lista[i]);
      this._sor.delete(this.tick);
    }
    this.epuletek.lep();
    this.gazdasag.lep();
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
   */
  szondaFelallas(osszDb) {
    const e = this.egysegek;
    e.db = 0;
    const racs = this.racs;
    const n = this.n;

    // ── v0.3: a gazdaság visszaállítása ─────────────────────────────────
    // SORREND: előbb az épületek (visszaadják a celláikat), utána a
    // nyersanyagok (újra lezárják a sajátjukat). Fordítva egy épület alatti
    // erdő-cella járhatóként maradna ott, ahol erdő van.
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
    const tipusok = [TIPUS.LANDZSAS, TIPUS.IJASZ, TIPUS.LOVAG, TIPUS.MUNKAS];

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
          e.hozzaad(x, y, tipusok[elhelyezve & 3], csapat);
          elhelyezve++;
        }
        if ((orseg & 255) === 0) sugar += 1.5;
      }
    }
    // A parancs-állapotot a felállás UTÁN nullázzuk: a `celEgyseg` egység-
    // INDEXRE mutat, és a felállás újrahasznosítja az indexeket. Enélkül egy
    // korábbi futás célpontja egy vadidegen egységre mutatna tovább.
    this.parancsAllapot.nullaz(e.db);

    // A munkás nem katona: alapból TŰZSZÜNETBEN áll. Enélkül az agresszív
    // alapállás miatt az első ellenség láttán otthagyná a bányát és rohanna
    // harcolni — ami a v0.3 gazdaságát tesztelhetetlenné tenné. (A célzás-réteg
    // a tűzszünetes egységeket érintetlenül hagyja, tehát a munkás-AI-é a
    // teljes irányítás fölöttük.)
    for (let i = 0; i < e.db; i++) {
      if (e.tipus[i] === TIPUS.MUNKAS) this.parancsAllapot.allas[i] = ALLAS.TUZSZUNET;
    }
    // A felállás és a lerakás is nyúlt a járhatósághoz — a mezők mehetnek.
    this._mezoErvenytelenites();
    return e.db;
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
  ujraFelallas(db) {
    this.tick = 0;
    this._sor.clear();
    this.rng = mulberry32(this.seed ^ 0xa5a5a5a5);
    // A mező-gyorstárat is ürítjük, különben az előző lépcső mezői „ingyen"
    // szolgálnák ki az újat, és alábecsülnénk az útkeresés költségét.
    for (const m of this.mezoTar.mezok) { m.cel = -1; m.utoljara = 0; }
    this.mezoTar.szamitasok = 0;
    return this.szondaFelallas(db);
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
    }
    const ef = this.eroforrasok;
    for (let i = 0; i < ef.db; i++) h = fnvSzam(h, ef.keszlet[i]);
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

export { ALLAPOT, TIPUS, TEREP, DT, ALAKZAT, PARANCS, ALLAS, NYERS, EPULET, KORSZAK, MUNKA };
