// AGE OF THE CRYSTALS — HADI KÖD MEGJELENÍTÉSE (v0.16).
//
// SZERZŐDÉS: `frissit(sim, alfa)` · `set enabled(v)` · `get haromszog()`
//
// ── EGYETLEN NÉGYSZÖG, EGYETLEN TEXTÚRA ───────────────────────────────────
// A köd látványa csábítóan bonyolítható lenne: cellánkénti geometria, lágy
// peremek, több réteg. A valóság az, hogy KÉT HÁROMSZÖG is elég — egy lap a
// pálya alatt, rajta a `kod.js` durvább rácsából töltött textúrával. Ami a
// lapból LÁTVÁNY lesz, az mind a fragmens-árnyalóban dől el (`kod_arnyalo.js`):
// ott van a talajra-visszavetítés, a kvintikus texel-simítás, a zajos perem és
// a sodródó felhő. Geometriát ehhez egyet sem kellett hozzátenni: a v0.7 óta
// ugyanaz a KÉT háromszög megy ki.
//
// A textúra 64×64 egy 256×256-os pályához, vagyis 4 KB. Ennyit képkockánként
// is fel lehetne tölteni, de nem tesszük — lásd lentebb.
//
// ── HÁROM ÁLLAPOT, EGY CSATORNA ───────────────────────────────────────────
// A köd három dolgot mond, és ezt EGYETLEN bájtba sűrítjük cellánként:
//
//   ÉPPEN LÁTOM     → 0     a világ látszik, minden mozog
//   LÁTTAM MÁR      → 128   a terep és az épület látszik, a mozgás nem
//   SOSEM LÁTTAM    → 255   nem tudni, mi van ott
//
// ⚠️ A textúra a HÁROM ÁLLAPOTOT hordozza, NEM a kész alfát. A v0.7-ben a
// három alfa-érték maga volt a textúra tartalma, és emiatt a köd
// „hangolása" textúra-újratöltést jelentett volna. Most a bájt SZEMANTIKA
// (0 / ½ / 1), a látvány pedig az árnyalóban készül belőle: alfa ÉS szín is
// sávonként más, és mindkettő uniformból hangolható.
//
// ── AZ „EMLÉK"-SÁVNAK OLVASHATÓNAK KELL LENNIE ────────────────────────────
// A „láttam már" réteg nem szépészet: ez az, amitől a felderítésnek ÉRTELME
// van. Ha a felfedezett terület visszasötétedne, a felderítés egyszeri
// villanás lenne; így viszont TUDÁS marad, amit a játékos épít.
//
// Ezért az emlék-sáv NEM „ugyanaz a fekete, csak halványabban": hideg, kékes
// szürke (`SZIN_EMLEK`) 0,46-os fedéssel, míg az ismeretlen majdnem tömör
// fekete. A kettő így RÁNÉZÉSRE elkülönül — a játékos egy pillantásból tudja,
// hol jár emlékből és hol vakon. Egyetlen sötét folt két fedettséggel ezt nem
// tudta: a v0.7 képein az emlék-sáv „csak egy kicsit világosabb semmi" volt.
//
// ── ⚠️ AMIT A KÖD NEM TUD ELTAKARNI ───────────────────────────────────────
// Az emlék-sávban az ELLENSÉG MOZGÁSA is átdereng 54 %-ban. Helyesen a
// `units3d`/`gazdasag3d` szűrne ködre (a minimap már szűr, lásd
// `minimap_adat.js`); amíg nem, addig a köd fedése egyben csalás-korlát is —
// ezért nem viszem `ALFA_EMLEK`-et 0,46 alá. Magasság-korlát viszont MÁR
// NINCS: a lap mélységteszt nélkül, mindenre rárajzol.
//
// ── A LAP A KAMERÁVAL MEGY, ÉS EZ NEM DÍSZ (v0.16/2) ──────────────────────
// A `kod_arnyalo.js` `LAP_SULLYEDES`-e már azt írta le, hogy a lap „a kamera
// alatt lebeg, és VELE MOZOG" — a `kod3d.js` viszont a pálya KÖZEPÉRE, a terep
// legaljára tette, egyszer, indításkor. A két fájl tehát két különböző dolgot
// állított ugyanarról; a képernyőn a `kod3d.js` verziója futott.
//
// Ennek egy csendes hibája volt, és pont a pálya sarkánál sült el: ott a
// generátor a tengert több száz egységgel lehúzza, a kamera pedig KÖVETI a
// talajt. A fix magasságú lap így a kamera FÖLÉ került. A fragmens-árnyaló a
// kamerából LEFELÉ tartó sugarakkal dolgozik (`if (d.y > -0.02) discard`) —
// azok pedig egy fölöttük lévő lapot soha nem érnek el. Eredmény: NULLA
// ködképpont, hibaüzenet nélkül, csak a sarokban.
//
// Most a lap a kamera alá, `LAP_SULLYEDES`-nyire ül, és vele mozog. A kamera
// definíció szerint fölötte van, tehát a hiba fogalmilag szűnik meg, nem
// hangolással. Amit ez NEM változtat meg: a köd HELYÉT. Azt a visszavetítés
// adja a `cameraPosition`-ból és a magasság-textúrából, a lapnak egyetlen
// dolga eldönteni, MELY KÉPPONTOKAT árnyaljuk (`kod_arnyalo.js` fejléce).
//
// ⚠️ A SIMET NEM ÍRJUK. A `Kod` rácsát csak olvassuk, és a lap mozgatása a
// LÁTHATÓSÁGI ADATHOZ nem nyúl: a textúra tartalma, a három állapot és a
// `kod.valtozat`-hoz kötött feltöltés változatlan. A ködnek nincs render-oldali
// állapota — ha lenne, a v0.8 lockstepjében a két kliens képernyője eltérhetne
// attól, amit a szimuláció mond. (A sodródó felhő az EGYETLEN idő-függő elem,
// és az szándékosan csak fényerőt moduláló dísz: se alakot, se határt nem
// mozdít.)
//
// ── MIÉRT NEM TÖLTJÜK FEL MINDEN KÉPKOCKÁN ────────────────────────────────
// A `Kod` fél másodpercenként frissül (`KOD_KOZ = 10` tick), a render viszont
// 60-144 Hz-en fut. Feltöltésből tehát a képkockák 95 %-a fölösleges lenne. A
// `Kod.valtozat` számlálója pontosan azt mondja meg, változott-e — ugyanaz a
// minta, amit a `gazdasag3d.js` használ az épületekre, és ugyanabból az okból:
// a `three` textúra-feltöltés az EGÉSZ puffert felküldi.
//
// A magasság-textúra ennél is ritkábban változik: a terep a meccs alatt
// állandó, tehát EGYSZER töltjük fel (és újrafelálláskor még egyszer).

import { THREE, aktivKamera } from './core3d.js';
import {
  KOD_VERTEX, KOD_FRAGMENT, magassagTextura, zajTextura,
  LAP_SULLYEDES, LAP_SZORZO, ALFA_EMLEK, ALFA_URES, SZIN_EMLEK, SZIN_URES,
} from './kod_arnyalo.js';

/** Cella-állapotok a textúrában. NEM alfa — lásd a fejlécet. */
const A_LATHATO = 0;
const A_LATOTT = 128;
const A_ISMERETLEN = 255;

export class Kod3D {
  /**
   * @param {THREE.Scene} szinter
   * @param {import('../sim/sim.js').Sim} sim
   * @param {{sajatCsapat?:number}} [opciok]
   */
  constructor(szinter, sim, opciok = {}) {
    this.szinter = szinter;
    this._enabled = true;
    /**
     * MELYIK CSAPAT ködjét mutatjuk. A sim MINDEN csapatét számolja (a gépi
     * ellenfélnek is kell), a képernyőn viszont csak a sajátunk van értelme.
     */
    this.csapat = opciok.sajatCsapat ?? 0;

    const kn = sim.kod.kn;
    this.kn = kn;
    /**
     * Egycsatornás adat-textúra. `RedFormat` és nem RGBA: a köd egyetlen
     * számot hordoz cellánként, a négyszeres memória semmit nem adna hozzá.
     */
    this._adat = new Uint8Array(kn * kn);
    this._textura = new THREE.DataTexture(this._adat, kn, kn, THREE.RedFormat);
    this._textura.minFilter = THREE.LinearFilter;
    this._textura.magFilter = THREE.LinearFilter;
    this._textura.wrapS = THREE.ClampToEdgeWrapping;
    this._textura.wrapT = THREE.ClampToEdgeWrapping;
    this._textura.needsUpdate = true;

    this._zaj = zajTextura();
    const mag = magassagTextura(sim.racs);
    this._magTex = mag.textura;

    const meret = sim.n;
    this._meret = meret;
    // Nagyobb a pályánál — lásd a `LAP_SZORZO` indoklását. Két háromszög marad.
    const geo = new THREE.PlaneGeometry(meret * LAP_SZORZO, meret * LAP_SZORZO, 1, 1);
    // A saját shader itt nem fényűzés: a beépített anyagok az alfát egyetlen
    // csatornából nem tudják kiolvasni fénylés nélkül, és a ködnek NEM szabad
    // reagálnia a világításra — az elárulná, hol van fény a köd alatt.
    const anyag = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      // ⚠️ MÉLYSÉGTESZT NÉLKÜL. A köd nem egy tárgy a világban, hanem fátyol a
      // KÉPEN: mindent takar, ami a talajpontja fölött áll — hegyoldalt,
      // tornyot, egységet egyaránt. Mélységteszttel a nálánál magasabb
      // geometria KIVÁGNÁ a ködöt (a hegyoldalon lyuk lenne), és pont az
      // maradna látszó, amit takarni akarunk.
      depthTest: false,
      uniforms: {
        kodTex: { value: this._textura },
        magTex: { value: this._magTex },
        zajTex: { value: this._zaj },
        kodN: { value: kn },
        palya: { value: meret },
        magMin: { value: mag.min },
        magSkala: { value: mag.skala },
        kamMag: { value: 0 },
        ido: { value: 0 },
        emlekSzin: { value: new THREE.Color(SZIN_EMLEK) },
        uresSzin: { value: new THREE.Color(SZIN_URES) },
        alfaEmlek: { value: ALFA_EMLEK },
        alfaUres: { value: ALFA_URES },
      },
      vertexShader: KOD_VERTEX,
      fragmentShader: KOD_FRAGMENT,
    });
    this._uniformok = anyag.uniforms;

    this.halo = new THREE.Mesh(geo, anyag);
    this.halo.rotation.x = -Math.PI * 0.5;
    // 950, tehát az égbolt (`fenyek_egbolt.js`, 900) UTÁN: a horizont fölött
    // ugyan eldobjuk a képpontot, de a pálya pereme mögötti égre már a köd kell.
    this.halo.renderOrder = 950;
    this.halo.frustumCulled = false;
    this._lapY = 0;
    this.racs = sim.racs;
    this._helyre(sim, mag.min);
    szinter.add(this.halo);

    this._utolsoValtozat = -1;
    this._haromszog = 2;
    this._kezdet = 0;
  }

  /**
   * A lap KEZDŐ helye: a pálya közepe, a terep legalja alatt.
   *
   * ⚠️ Ez már csak TARTALÉK — az első képkockára, illetve arra az esetre, ha
   * nincs bejegyzett kamera (`aktivKamera()` üres). Élesben a `_lapKamerara()`
   * viszi a lapot a kamera alá minden képkockán; lásd a fejléc „a lap a
   * kamerával megy" szakaszát.
   */
  _helyre(sim, minMagassag) {
    const meret = sim.n;
    this._lapY = minMagassag - LAP_SULLYEDES;
    this.halo.position.set(meret * 0.5, this._lapY, meret * 0.5);
  }

  /**
   * A lap a kamera alá, `LAP_SULLYEDES`-nyire. NULLA allokáció: három szám
   * összehasonlítása és legfeljebb egy `Vector3.set`.
   *
   * A `kam.position`-t olvassuk, nem a `matrixWorld`-öt: a `main.js`-ben a
   * `kamera.frissit()` a rétegek ELŐTT fut, tehát a pozíció már erre a
   * képkockára érvényes, a `matrixWorld` viszont még az előzőé lenne (a Three
   * a `render()`-ben számolja újra). Ugyanezt a mezőt olvassa a `kamMag` ág is,
   * két sorral feljebb — a kettőnek muszáj ugyanabból dolgoznia.
   *
   * @param {THREE.Camera} kam
   */
  _lapKamerara(kam) {
    const p = kam.position;
    const h = this.halo.position;
    const y = p.y - LAP_SULLYEDES;
    if (h.x !== p.x || h.y !== y || h.z !== p.z) h.set(p.x, y, p.z);
  }

  /**
   * Képkocka. A köd-textúrát csak akkor tölti fel, ha a sim ködje TÉNYLEG
   * változott — lásd a fejléc utolsó bekezdését. Az óra-uniform frissítése
   * viszont képkockánként megy: az egy `float` írás, nem feltöltés.
   *
   * @param {import('../sim/sim.js').Sim} sim
   * @param {number} [alfa] a rétegszerződés miatt van itt; a köd nem használja
   * @param {number} [most] a hívó órája (`performance.now()`), ha van
   */
  /* eslint-disable no-unused-vars */
  frissit(sim, alfa, most) {
    if (!this._enabled) return;

    // A felhő sodródása. Saját óra, ha a hívó nem ad: a render-rétegnek szabad
    // az órához nyúlnia (a sim-nek nem). A KEZDETHEZ képest mérünk, mert a
    // `performance.now()` nagy száma float32 uniformban már durván kvantálódna.
    const t = most === undefined ? performance.now() : most;
    if (!this._kezdet) this._kezdet = t;
    this._uniformok.ido.value = (t - this._kezdet) * 0.001;

    // A visszavetítés első tippje: a KAMERA ALATTI terepmagasság. Egy
    // tömb-olvasás képkockánként, cserébe az árnyaló iterációja már közelről
    // indul. A kamerát a `core3d` jegyzékéből vesszük — a `frissit` szerződése
    // nem ad kamerát, és nem is akarunk új paramétert bevezetni miatta.
    const kam = aktivKamera();
    if (kam) {
      // A LAP A KAMERA ALÁ. Ez az egyetlen dolog, amitől a pálya sarkában is
      // marad köd — lásd a fejléc „a lap a kamerával megy" szakaszát.
      this._lapKamerara(kam);
      if (this.racs) {
        const n = this.racs.n;
        let cx = kam.position.x, cz = kam.position.z;
        cx = cx < 0 ? 0 : (cx > n - 1 ? n - 1 : cx);
        cz = cz < 0 ? 0 : (cz > n - 1 ? n - 1 : cz);
        this._uniformok.kamMag.value = this.racs.magassagPont(cx, cz);
      }
    }

    const kod = sim.kod;
    if (kod.valtozat === this._utolsoValtozat) return;
    this._utolsoValtozat = kod.valtozat;

    const cs = this.csapat;
    const latott = kod.latott[cs];
    const lathato = kod.lathato[cs];
    const adat = this._adat;
    const kn = this.kn;
    // ⚠️ A SOROKAT MEGFORDÍTJUK. A textúra V tengelye lentről felfelé nő, a
    // köd-rács viszont a világ Z tengelye szerint fentről lefelé — fordítás
    // nélkül a köd TÜKÖRKÉPE lenne annak, ahol a sereg jár, és ez a fajta hiba
    // ránézésre „majdnem jó"-nak látszik. (Ugyanez a fordítás van a
    // magasság-textúrában is, különben a visszavetítés a másik dombot nézné.)
    for (let y = 0; y < kn; y++) {
      const be = y * kn;
      const ki = (kn - 1 - y) * kn;
      for (let x = 0; x < kn; x++) {
        const i = be + x;
        adat[ki + x] = lathato[i] === 1 ? A_LATHATO : (latott[i] === 1 ? A_LATOTT : A_ISMERETLEN);
      }
    }
    this._textura.needsUpdate = true;
  }
  /* eslint-enable no-unused-vars */

  /**
   * Újrafelállás. A köd-rács mérete nem változik, a TEREP viszont igen (új
   * seed = új pálya), tehát a magasság-textúrát és a lap magasságát is újra
   * kell húzni — enélkül a visszavetítés a RÉGI domborzattal számolna, és a
   * köd néma fél cellákkal odébb csúszna.
   * @param {import('../sim/sim.js').Sim} [sim]
   */
  ujraKot(sim) {
    this._utolsoValtozat = -1;
    if (!sim || !sim.racs) return;
    this.racs = sim.racs;
    const mag = magassagTextura(sim.racs);
    if (this._magTex) this._magTex.dispose();
    this._magTex = mag.textura;
    this._uniformok.magTex.value = mag.textura;
    this._uniformok.magMin.value = mag.min;
    this._uniformok.magSkala.value = mag.skala;
    this._uniformok.palya.value = sim.n;
    if (sim.n !== this._meret) {
      // Más méretű pálya: a lap geometriája is más. Ritka (a `main.js` inkább
      // új réteget épít), de olcsó lekezelni, és egy néma fél-ködnél jobb.
      this._meret = sim.n;
      this.halo.geometry.dispose();
      this.halo.geometry = new THREE.PlaneGeometry(sim.n * LAP_SZORZO, sim.n * LAP_SZORZO, 1, 1);
    }
    this._helyre(sim, mag.min);
  }

  set enabled(v) {
    this._enabled = !!v;
    this.halo.visible = !!v;
  }
  get enabled() { return this._enabled; }
  get haromszog() { return this._enabled ? this._haromszog : 0; }

  /** Erőforrás-elengedés a meccs végén. */
  bont() {
    this.szinter.remove(this.halo);
    this.halo.geometry.dispose();
    this.halo.material.dispose();
    this._textura.dispose();
    if (this._magTex) this._magTex.dispose();
    if (this._zaj) this._zaj.dispose();
  }
}
