// AGE OF THE CRYSTALS — NYERSANYAG-LELŐHELYEK ÉS ÉPÜLETEK (v0.3).
//
// SZERZŐDÉS: `frissit(sim, alfa)` · `set enabled(v)` · `get haromszog()`
//
// ── MI EZ, ÉS MI NEM ──────────────────────────────────────────────────────
// Ez a réteg a GAZDASÁGOT teszi láthatóvá: erdő, bogyós bokor, kőfejtő és a
// tizenegy épülettípus. A kristály NEM itt van — azt a `props3d.js` rajzolja
// három rétegű pulzáló tüskeként, mert a játék névadója, és megérdemli a saját
// kezelését.
//
// ── AZ ÉPÜLETEK MÁR NEM DOBOZOK (v0.10) ───────────────────────────────────
// A v0.3-ban minden épület MÉRTANI DOBOZ volt, és ez akkor tudatos döntés volt:
// két épületfajtánál egy „szép" modell csak félrevezetett volna arról, mi
// készült el valójában. A v0.5 óta viszont tizenegy típus van, és ugyanaz a
// doboz már nem egyszerűsítés, hanem HIÁNYZÓ INFORMÁCIÓ: a játékos a saját
// bázisán sem tudja megmondani, melyik a laktanya és melyik az istálló.
//
// A formák a `epulet_formak.js`-ben élnek (hosszú, statikus adat), itt csak a
// rajzolásuk van. Ami a doboz-korszakból VÁLTOZATLANUL megmarad:
//   • az építkezés a MAGASSÁGBÓL olvasható (a forma a készültséggel nő), és
//     az épülő ház fakóbb — plusz most állványt is kap, mert egy lapított
//     sziluett önmagában inkább „eltört modellnek" látszana, mint félkésznek;
//   • a csapatszín egyértelmű (zászló, ponyva, kapu tiszta csapatszín, a tetők
//     bele hajlanak — lásd a `epulet_formak.js` színezés-szakaszát).
//
// ── EGY RAJZHÍVÁS TÍPUSONKÉNT, ÉS MIÉRT MEGENGEDHETŐ ──────────────────────
// Eltérő geometria = eltérő `InstancedMesh`, tehát a korábbi 1 rajzhívás
// helyett legfeljebb 12 (11 típus + állvány). Ez tudatos csere: épületből
// néhány tucat van, míg egységből 1600 — a rajzhívás-keretet nem az épületek
// eszik meg. Az ÜRES típusok nem kerülnek sorra (`count = 0` mellett a Three
// meg sem hívja a rajzolást, ráadásul `visible = false`), tehát a tényleges
// szám az éppen felépített roszter mérete, nem a maximum.
//
// ── MIÉRT NEM ÍR ÚJRA MINDEN KÉPKOCKÁN ────────────────────────────────────
// A lelőhelyek ÁLLNAK. Néhány száz van belőlük, és csak akkor változik a
// kirajzolt halmaz, ha egy kimerül. Ezért példány-mátrixot csak akkor írunk, ha
// a látható darabszám tényleg módosult — a képkockánkénti újratöltés a
// `props3d.js` tanulsága szerint az egyik legolcsóbban elkerülhető pazarlás.
// (A `three` nem tud részleges `instanceMatrix` feltöltést: egyetlen példány
// írása is az EGÉSZ puffert felküldi. Részleges feltöltésre volna API
// [`addUpdateRange`], de az képkockánként OBJEKTUMOT foglal — ezért nem
// használjuk; helyette az ÜRES típusok puffere marad felküldetlen.)
//
// ⚠️ Az épületek jele NÉGY szám (`db`, élők száma, hátralévő tickek összege,
// állapot-hash), nem egy. Egyetlen összeg elrejtené a lerombolást: egy
// elpusztult épület `epulHatra`-ja 0 volt és 0 marad, tehát a v0.3 óta itt
// maradt egy néma hiba — a rommá lőtt ház a képen ottmaradt. Külön számláló,
// külön hiba, nincs ütközés.
//
// ── AZ ÁLLAPOT-CSATORNA RENDES BEKÖTÉSE (v0.17) ───────────────────────────
// A v0.16/2 bevezette az épület-sérülés és a kapu-állás LÁTVÁNYÁT
// (`epulet_formak.js` → `epAllapot` példány-attribútum), de az ADAT nem tudott
// ide jutni: ez a fájl akkor MÁSIK AGENT sávja volt, ezért a puffert egy
// `Material.onBeforeRender`-be tett kerülőút töltötte fel. Az működött, de a
// rossz helyen volt: rajzoláskor futott, típusonként újra végigjárta az összes
// épületet, és egy MÁSODIK, kézzel szinkronban tartott másolatát tartotta ennek
// a huroknak.
//
// Most a példány-hurok viszi tovább a `hp/maxHp`-t és a `nyitva`-t is, ugyanott,
// ahol a mátrixot és a csapatszínt írja — egy bejárás, egy sorrend, egy igazság.
// A kerülőút EL IS TŰNT az `epulet_formak.js`-ből: amíg mindkettő élt, ugyanarra
// a pufferre írtak, és az ilyen ütközés némán romlik el (a későbbi írás győz,
// tehát csak akkor látszik, ha a két forrás elkülönbözik — például egy előnézet
// MÁSIK simmel, mert a kerülőút a globális simet oldotta fel, nem a réteget).
//
// ⚠️ A SORREND-SZERZŐDÉS: a `t` típus
// `k`-adik példánya a `t` típus `k`-adik ÉLŐ épülete, `ep`-index szerint
// növekvő sorrendben. Ez a hurok ÍRJA ezt a sorrendet, tehát ha itt változik,
// a sérülés rossz épületre kerül. Ne rendezd át.
//
// ── ⚠️ AZ ÉPÜLET-KATTINTÁS ITT VAN, ÉS NEM VÉLETLENÜL ─────────────────────
// Az `epuletTalalat()` (a fájl alján) a `bevitel.epuletKereso` horog
// render-oldali válasza: megmondja, melyik épületre mutat az egér. Azért EBBEN
// a fájlban van, mert ez az épületek sávja — itt van leírva, mekkora egy épület
// és milyen magasra nő. Ami fontos: NEM a kirajzolt hálóra vet sugarat, hanem a
// sim igazságára (`EP_MERET` alapterület + `epuletMagassag()` keret), ugyanabból
// az okból, amiért a `talajPont()` sem a terep-hálóra metsz.

import { THREE } from './core3d.js';
import { NYERS } from '../sim/eroforras.js';
import { EP_MERET } from '../sim/epuletek.js';
import {
  epitEpuletGeometriak, epuletAnyag, epuletMagassag, serulesFokozat,
} from './epulet_formak.js';

/** A talaj fölé emelés, hogy a modell ne süllyedjen a terepbe. */
const ULES = 0.05;

const SZIN_FA = 0x2f5d34;
const SZIN_ETEL = 0xb8324a;
const SZIN_KO = 0x8b8f96;
/** Csapat-színek az épületekhez. */
const SZIN_CSAPAT = [0x3f7fd0, 0xd06a3f];
/** Az épülő ház fényereje — ugyanaz a 0,45, ami a doboz-korszakban is volt. */
const EPULO_FENY = 0.45;
/** A legkisebb látható készültség: nulla magasságú épület nem visszajelzés. */
const EPUL_ALJ = 0.12;
/** Az állvány valamivel szűkebb az alapterületnél, hogy ne érjen a szomszédhoz. */
const ALLVANY_SZUK = 0.94;

export class Gazdasag3D {
  /**
   * @param {THREE.Scene} szinter
   * @param {import('../sim/sim.js').Sim} sim
   */
  constructor(szinter, sim) {
    this.szinter = szinter;
    this._enabled = true;
    this._haromszog = 0;

    const ef = sim.eroforrasok;
    const maxEp = sim.epuletek.maxDb;

    // Lelőhely-fajtánként egy-egy példánytömb. A darabszám a TELJES lelőhely-
    // szám, mert a kimerülteket csak elrejtjük (a `count` állításával), nem
    // foglalunk újra.
    this._retegek = [];
    this._retegek[NYERS.FA] = this._epit(szinter, new THREE.ConeGeometry(0.46, 1.7, 5), SZIN_FA, ef.db, 5 * 2);
    this._retegek[NYERS.ETEL] = this._epit(szinter, new THREE.IcosahedronGeometry(0.34, 0), SZIN_ETEL, ef.db, 20);
    this._retegek[NYERS.KO] = this._epit(szinter, new THREE.IcosahedronGeometry(0.46, 0), SZIN_KO, ef.db, 20);

    // ── ÉPÜLETEK: típusonként egy példánytömb ────────────────────────────
    // A geometriák és az anyag EGYSZER épülnek fel, itt. Futásidőben soha nem
    // keletkezik új anyag vagy geometria — csak a példány-pufferek íródnak.
    const formak = epitEpuletGeometriak();
    this._maxEp = maxEp;
    this._epAnyag = epuletAnyag();
    this._epTipus = new Array(formak.tipus.length);
    for (let t = 0; t < formak.tipus.length; t++) {
      this._epTipus[t] = this._epuletHalo(szinter, formak.tipus[t], maxEp, formak.haromszog[t]);
    }
    this._allvany = this._epuletHalo(szinter, formak.allvany, maxEp, formak.allvanyHaromszog);

    /** Magasság-keret típusonként — a `frissit()` ne számoljon szorzatot. */
    this._epMagassag = new Float64Array(formak.tipus.length);
    for (let t = 0; t < formak.tipus.length; t++) this._epMagassag[t] = epuletMagassag(t);

    this._szin = new THREE.Color();
    /** Fajtánként hány példány volt látható legutóbb — ebből tudjuk, kell-e írni. */
    this._utolsoDb = [-1, -1, -1, -1];
    /** Az épület-jel NÉGY tagja (lásd a fejlécet). */
    this._utolsoEpDb = -1;
    this._utolsoEloDb = -1;
    this._utolsoEpulesJel = -1;
    /**
     * A sérülés-fokozatok és a kapu-állások hash-e. KÜLÖN tag, mert egyik
     * meglévő számban sincs benne: egy ostrom alatt álló központ `db`-je,
     * `elo`-ja és `epulHatra`-ja is változatlan, tehát a rajzoló a v0.16-ban
     * SOSEM írta volna újra a puffert — a repedés csak akkor jelent volna meg,
     * ha közben véletlenül épült vagy dőlt valami.
     *
     * ⚠️ A hash a FOKOZATOT hasheli, nem a nyers életerőt. Nyers hp-vel minden
     * egyes találat teljes puffer-újratöltést kérne (ostrom alatt tickenként),
     * miközben a képen semmi nem változna a küszöbök között.
     */
    this._utolsoAllapotJel = -1;
    /** Típusonkénti író-kurzor — előre lefoglalva, a hurok nem allokál. */
    this._kurzor = new Int32Array(formak.tipus.length);
    /**
     * Az építés TELJES ideje épületenként. Az `EP_IDO` nincs exportálva (és nem
     * is a render dolga megismerni), az `epulHatra` viszont monoton fogy — a
     * megfigyelt maximuma tehát maga a teljes idő. A doboz-korszak fix 200-as
     * osztója minden más építési idejű típusnál hazudott: a fal (30 tick) egyből
     * késznek látszott, az ostromműhely (300) a felénél is „alig elkezdett".
     */
    this._epitTeljes = new Int32Array(maxEp);
    this._epHaromszog = 0;
    this._epRajzhivas = 0;

    this._elsoToltes(sim);
  }

  /** Egy épület-példánytömb: közös anyag, saját geometria, saját csapat-attribútum. */
  _epuletHalo(szinter, geo, maxDb, tri) {
    const adat = new THREE.InstancedBufferAttribute(new Float32Array(maxDb * 4), 4);
    adat.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('csapatAdat', adat);
    // ÁLLAPOT-PUFFER (x = sérülés-fokozat 0/1/2, y = kapu 0/1). A hossza a
    // példány-mátrixéval EGYEZIK: a `k`-adik példány `k`-adik állapota, tehát a
    // két puffert ugyanaz a kurzor indexeli. Rövidebb puffer tartományon kívüli
    // olvasás lenne a shaderben, hosszabb csak pazarlás.
    const allapot = new THREE.InstancedBufferAttribute(new Float32Array(maxDb * 2), 2);
    allapot.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('epAllapot', allapot);
    const halo = new THREE.InstancedMesh(geo, this._epAnyag, maxDb);
    halo.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    halo.count = 0;
    halo.visible = false;
    halo.castShadow = false;
    halo.frustumCulled = false;
    szinter.add(halo);
    return { halo, adat, allapot, tri, elozoDb: 0 };
  }

  _epit(szinter, geo, szin, maxDb, haromszogDb) {
    const anyag = new THREE.MeshLambertMaterial({ color: szin, toneMapped: false });
    const halo = new THREE.InstancedMesh(geo, anyag, Math.max(1, maxDb));
    halo.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    halo.count = 0;
    halo.frustumCulled = false;
    szinter.add(halo);
    return { halo, haromszogDb };
  }

  _elsoToltes(sim) {
    this._lelohelyekFrissit(sim, true);
  }

  /**
   * A lelőhely-példányok újratöltése — CSAK ha a látható darabszám változott.
   * @param {boolean} kenyszer első töltésnél igaz
   */
  _lelohelyekFrissit(sim, kenyszer) {
    const ef = sim.eroforrasok;
    const racs = sim.racs;

    // Előbb csak SZÁMOLUNK. Ez néhány száz egész összehasonlítás, nagyságrendekkel
    // olcsóbb, mint a mátrix-puffer feltöltése és felküldése a GPU-ra.
    const db = [0, 0, 0, 0];
    for (let i = 0; i < ef.db; i++) if (ef.keszlet[i] > 0) db[ef.fajta[i]]++;

    let kell = kenyszer;
    for (let f = 0; f < 4; f++) if (db[f] !== this._utolsoDb[f]) kell = true;
    if (!kell) return;

    const iro = [0, 0, 0, 0];
    for (let f = 0; f < 4; f++) {
      const r = this._retegek[f];
      if (r) r.halo.count = 0;
    }
    for (let i = 0; i < ef.db; i++) {
      if (ef.keszlet[i] <= 0) continue;
      const f = ef.fajta[i];
      const r = this._retegek[f];
      if (!r) continue;                       // a kristályt a props3d rajzolja
      const x = ef.x[i], y = ef.y[i];
      const magas = racs.magassagPont(x, y) + ULES;
      const o = iro[f]++ * 16;
      const arr = r.halo.instanceMatrix.array;
      // Tiszta eltolás; a méretezést a geometria már tartalmazza. A fa és a kő
      // magasságát félig megemeljük, mert az origójuk a modell KÖZEPÉN van.
      arr[o] = 1; arr[o + 1] = 0; arr[o + 2] = 0; arr[o + 3] = 0;
      arr[o + 4] = 0; arr[o + 5] = 1; arr[o + 6] = 0; arr[o + 7] = 0;
      arr[o + 8] = 0; arr[o + 9] = 0; arr[o + 10] = 1; arr[o + 11] = 0;
      arr[o + 12] = x; arr[o + 13] = magas + (f === NYERS.FA ? 0.85 : 0.3); arr[o + 14] = y;
      arr[o + 15] = 1;
    }
    for (let f = 0; f < 4; f++) {
      const r = this._retegek[f];
      if (!r) continue;
      r.halo.count = iro[f];
      r.halo.instanceMatrix.needsUpdate = true;
      this._utolsoDb[f] = db[f];
    }
  }

  /**
   * Tengely-párhuzamos méretezés + eltolás egyetlen példány-mátrixba.
   * Nyers float-írás `Matrix4` nélkül — ugyanaz az elv, mint a `units3d.js`
   * `reszMatrix()`-ában: a hurokban nem keletkezhet objektum.
   */
  _irMatrix(arr, o, sx, sy, sz, x, y, z) {
    arr[o] = sx; arr[o + 1] = 0; arr[o + 2] = 0; arr[o + 3] = 0;
    arr[o + 4] = 0; arr[o + 5] = sy; arr[o + 6] = 0; arr[o + 7] = 0;
    arr[o + 8] = 0; arr[o + 9] = 0; arr[o + 10] = sz; arr[o + 11] = 0;
    arr[o + 12] = x; arr[o + 13] = y; arr[o + 14] = z; arr[o + 15] = 1;
  }

  /** Egy épület-példánytömb lebontása. Az ANYAG közös, azt a `bont()` zárja. */
  _epuletHaloBont(r) {
    this.szinter.remove(r.halo);
    r.halo.geometry.dispose();
    r.halo.dispose();
  }

  /** Az épületek újratöltése — akkor, ha új épült, egy dőlt le, vagy egy készültsége lépett. */
  _epuletekFrissit(sim) {
    const ep = sim.epuletek;
    // Négy szám, négy független változás — lásd a fejléc figyelmeztetését.
    let jel = 0, eloDb = 0, allJel = 0;
    for (let i = 0; i < ep.db; i++) {
      jel += ep.epulHatra[i];
      eloDb += ep.elo[i];
      // A halott slot állapota nem számít (nem is rajzoljuk) — a 0 tartja
      // stabilan a hash-t, hogy egy rom ne indítson újratöltéseket.
      const fok = ep.elo[i] ? serulesFokozat(ep.hp[i], ep.maxHp[i]) : 0;
      const ny = ep.elo[i] && ep.nyitva[i] ? 1 : 0;
      allJel = (Math.imul(allJel, 31) + fok * 3 + ny) | 0;
    }
    if (ep.db === this._utolsoEpDb && eloDb === this._utolsoEloDb
      && jel === this._utolsoEpulesJel && allJel === this._utolsoAllapotJel) return;
    this._utolsoEpDb = ep.db;
    this._utolsoEloDb = eloDb;
    this._utolsoEpulesJel = jel;
    this._utolsoAllapotJel = allJel;

    const racs = sim.racs;
    const kurzor = this._kurzor;
    kurzor.fill(0);
    const av = this._allvany;
    const avArr = av.halo.instanceMatrix.array, avAdat = av.adat.array;
    let avDb = 0;

    for (let i = 0; i < ep.db; i++) {
      // A ROM nem épület: a `sebez()` felszabadítja a celláit, tehát a sim
      // szerint nincs ott semmi. A v0.3 kirajzolta — most nem.
      if (ep.elo[i] === 0) { this._epitTeljes[i] = 0; continue; }
      const t = ep.tipus[i];
      const r = this._epTipus[t];
      if (!r) continue;                     // nem fordulhat elő: a tábla teljes
      const k = kurzor[t];
      if (k >= this._maxEp) continue;
      kurzor[t] = k + 1;

      const hatra = ep.epulHatra[i];
      if (hatra > this._epitTeljes[i]) this._epitTeljes[i] = hatra;
      const kesz = hatra === 0;
      const teljes = this._epitTeljes[i];
      const arany = kesz ? 1
        : Math.max(EPUL_ALJ, teljes > 0 ? 1 - hatra / teljes : EPUL_ALJ);
      if (kesz) this._epitTeljes[i] = 0;

      const talp = racs.magassagPont(ep.x[i], ep.y[i]) + ULES;
      this._szin.setHex(SZIN_CSAPAT[ep.csapat[i] & 1], THREE.SRGBColorSpace);
      const feny = kesz ? 1 : EPULO_FENY;

      // A forma VILÁG-MÉRETBEN épült, tehát vízszintesen 1 a méretezés; a
      // készültség csak a magasságot fogja vissza.
      this._irMatrix(r.halo.instanceMatrix.array, k * 16, 1, arany, 1,
        ep.x[i], talp, ep.y[i]);
      const c = k * 4;
      r.adat.array[c] = this._szin.r;
      r.adat.array[c + 1] = this._szin.g;
      r.adat.array[c + 2] = this._szin.b;
      r.adat.array[c + 3] = feny;

      // ── ÁLLAPOT: SÉRÜLÉS ÉS KAPU ────────────────────────────────────
      // UGYANEZ A `k`, UGYANEZ A HUROK. Ez maga a sorrend-szerződés: a
      // fokozat pontosan arra az épületre kerül, aminek a mátrixát az imént
      // írtuk. Egy külön bejárás — bárhol is legyen — csak addig egyezne
      // ezzel, amíg valaki hozzá nem nyúl az egyikhez.
      const s = k * 2;
      r.allapot.array[s] = serulesFokozat(ep.hp[i], ep.maxHp[i]);
      r.allapot.array[s + 1] = ep.nyitva[i] ? 1 : 0;

      // Állvány CSAK az épülő ház köré, TELJES magasságban: így egyszerre
      // látszik, mi épül (a forma) és mennyire van kész (meddig ér benne).
      if (!kesz && avDb < this._maxEp) {
        const sz = EP_MERET[t] * ALLVANY_SZUK;
        this._irMatrix(avArr, avDb * 16, sz, this._epMagassag[t], sz,
          ep.x[i], talp, ep.y[i]);
        const ac = avDb * 4;
        avAdat[ac] = this._szin.r;
        avAdat[ac + 1] = this._szin.g;
        avAdat[ac + 2] = this._szin.b;
        avAdat[ac + 3] = 1;
        avDb++;
      }
    }

    let tri = 0, hivas = 0;
    for (let t = 0; t < this._epTipus.length; t++) {
      hivas += this._halotZar(this._epTipus[t], kurzor[t]);
      tri += kurzor[t] * this._epTipus[t].tri;
    }
    hivas += this._halotZar(av, avDb);
    tri += avDb * av.tri;
    this._epHaromszog = tri;
    this._epRajzhivas = hivas;
  }

  /**
   * Egy példánytömb lezárása. A puffert CSAK akkor küldjük fel, ha van vagy
   * volt benne példány — egy sosem használt típus (mondjuk az ostromműhely egy
   * korai meccsen) így nulla sávszélességet visz.
   * @returns {number} 1, ha ez a tömb rajzhívást jelent
   */
  _halotZar(r, db) {
    if (db > 0 || r.elozoDb > 0) {
      r.halo.instanceMatrix.needsUpdate = true;
      r.adat.needsUpdate = true;
      // Az ÁLLVÁNY állapot-puffere végig nulla marad (az épülő ház sértetlen,
      // kapuja nincs) — a feltöltése így is olcsóbb, mint egy külön ág, ami
      // egyszer majd elfelejtődik.
      r.allapot.needsUpdate = true;
    }
    r.elozoDb = db;
    r.halo.count = db;
    r.halo.visible = this._enabled && db > 0;
    return db > 0 ? 1 : 0;
  }

  /** Újrafelállás: a pálya és az épületek is átrendeződtek. */
  ujraKot(sim) {
    this._utolsoDb = [-1, -1, -1, -1];
    this._utolsoEpDb = -1;
    this._utolsoEloDb = -1;
    this._utolsoEpulesJel = -1;
    this._utolsoAllapotJel = -1;
    // A slotok újraosztódnak (`Epuletek.nullaz()`), tehát a megfigyelt építési
    // idők elévülnek — különben az új épület egy régi ház készültségét örökölné.
    this._epitTeljes.fill(0);
    if (sim) { this._lelohelyekFrissit(sim, true); this._epuletekFrissit(sim); }
  }

  /* eslint-disable no-unused-vars */
  frissit(sim, alfa) {
    if (!this._enabled) return;
    this._lelohelyekFrissit(sim, false);
    this._epuletekFrissit(sim);
    let h = 0;
    for (let f = 0; f < 4; f++) {
      const r = this._retegek[f];
      if (r) h += r.halo.count * r.haromszogDb;
    }
    this._haromszog = h + this._epHaromszog;
  }
  /* eslint-enable no-unused-vars */

  set enabled(v) {
    this._enabled = !!v;
    for (let f = 0; f < 4; f++) {
      const r = this._retegek[f];
      if (r) r.halo.visible = this._enabled;
    }
    for (let t = 0; t < this._epTipus.length; t++) {
      const r = this._epTipus[t];
      r.halo.visible = this._enabled && r.halo.count > 0;
    }
    this._allvany.halo.visible = this._enabled && this._allvany.halo.count > 0;
  }
  get enabled() { return this._enabled; }
  get haromszog() { return this._enabled ? this._haromszog : 0; }
  /** A lelőhely-fajták + az éppen álló épülettípusok (üres típus nem számít). */
  get rajzhivas() {
    if (!this._enabled) return 0;
    let n = this._epRajzhivas;
    for (let f = 0; f < 4; f++) {
      const r = this._retegek[f];
      if (r && r.halo.count > 0) n++;
    }
    return n;
  }

  /**
   * Diagnosztika: melyik típusból hány példány van kirajzolva.
   *
   * ⚠️ A `serult` és a `nyitottKapu` NEM dísz. A determinizmus-kapu tanulsága
   * (`CLAUDE.md`): a semmittevés is tökéletesen reprodukálható, tehát minden új
   * alrendszerhez kell egy SZÁM, ami elárulja, hogy tényleg csinál is valamit.
   * Az állapot-csatornánál pont ez az a szám: ha a központot verik és ez marad
   * nulla, akkor az adat nem jut el a pufferig — akkor is, ha minden más zöld.
   */
  get statisztika() {
    let serult = 0, nyitottKapu = 0;
    for (let t = 0; t < this._epTipus.length; t++) {
      const r = this._epTipus[t];
      const a = r.allapot.array;
      for (let k = 0; k < r.halo.count; k++) {
        if (a[k * 2] > 0) serult++;
        if (a[k * 2 + 1] > 0) nyitottKapu++;
      }
    }
    const db = [];
    for (let t = 0; t < this._epTipus.length; t++) db.push(this._epTipus[t].halo.count);
    return {
      epulet: db, allvany: this._allvany.halo.count, rajzhivas: this.rajzhivas,
      serult, nyitottKapu,
    };
  }

  bont() {
    for (let f = 0; f < 4; f++) {
      const r = this._retegek[f];
      if (!r) continue;
      this.szinter.remove(r.halo);
      r.halo.geometry.dispose();
      r.halo.material.dispose();
    }
    for (let t = 0; t < this._epTipus.length; t++) this._epuletHaloBont(this._epTipus[t]);
    this._epuletHaloBont(this._allvany);
    // Az anyag KÖZÖS, tehát pontosan egyszer bontjuk le.
    this._epAnyag.dispose();
  }
}

// ── ÉPÜLET-KATTINTÁS ───────────────────────────────────────────────────────

/**
 * A típusok magasság-kerete, EGYSZER kiszámolva.
 *
 * ⚠️ `EP_MERET`-BŐL SZÁRMAZIK, NEM KÉZZEL ÍRT LISTA. Ebben a projektben ötször
 * égett meg egy rövid, `EPULET`-tel indexelt tábla (legutóbb a kijelölő gyűrű
 * `SUGAR`-ja): a hiányzó elem `undefined`, abból `NaN`, a `NaN` pedig minden
 * összehasonlításban hamis — a kattintás NÉMÁN nem találná el az új típust. Egy
 * származtatott tábla nem tud rövid lenni.
 */
const EP_KERET = EP_MERET.map((_, t) => epuletMagassag(t));

/** Munka-vektor a vetítéshez — modul-szintű, hogy a kattintás se allokáljon. */
const _sugarVeg = new THREE.Vector3();

/**
 * MELYIK ÉPÜLETRE MUTAT AZ EGÉR? — a `bevitel.epuletKereso` render-oldali válasza.
 *
 * ── MIÉRT NEM `THREE.Raycaster` A PÉLDÁNY-HÁLÓKRA ─────────────────────────
 * Ugyanaz az ok, amiért a `talajPont()` sem a terep-hálóra metsz: a kirajzolt
 * háló nem a világ, hanem a világ EGY ÁBRÁZOLÁSA. Itt konkrétan három baja
 * volna: (1) az épülő ház példány-mátrixa a KÉSZÜLTSÉGGEL van lelapítva, tehát
 * a félkész laktanya alig volna eltalálható, miközben az állványa teljes
 * magasságban ott áll; (2) a `Raycaster` az `InstancedMesh`-ből `intersects`
 * OBJEKTUMOKAT gyárt, vagyis minden kattintás szemetel; (3) a példány-index
 * NEM épület-index — vissza kellene fejteni ugyanazt a sorrend-szerződést,
 * amit ez a fájl ír, csak egy másik helyen, ami előbb-utóbb elcsúszik.
 *
 * Ezért a sim IGAZSÁGÁRA vetünk sugarat: az alapterület (`EP_MERET`) és a
 * magasság-keret (`epuletMagassag`) adta tengely-párhuzamos dobozra. Ez pontosan
 * az a doboz, ami köré a sziluett épül, és ami köré az ÁLLVÁNY is kerül —
 * vagyis a kattintható terület és a látható tömeg fedi egymást a félkész
 * épületen is.
 *
 * Találat esetén a LEGKÖZELEBBI épület nyer (a kamerához legközelebbi belépési
 * pont): ha egy fal takar egy központot, a falat jelöljük ki, ahogy a szem is
 * azt látja.
 *
 * ⚠️ AMI SZÁNDÉKOSAN NINCS BENNE: a hadi köd. Az épület-réteg MA nem szűr ködre
 * (`TODO.md` P2), tehát minden épület látszik — ha a kattintás szűrne, a játékos
 * ránézésre ott lévő épületre kattintva „semmit" kapna, ami rosszabb, mint a
 * mostani állapot. Amikor a réteg megkapja a köd-szűrést, ITT IS ugyanazzal a
 * szabállyal kell szűrni, egy lépésben.
 *
 * ⚠️ Az ÉLET-ellenőrzést a hívó (`bevitel.js`) is elvégzi; itt azért van benne,
 * mert a rom celláit a sim felszabadítja — egy halott épület doboza olyan
 * helyet nyelne el, ahol a világ szerint már nincs semmi.
 *
 * NULLA allokáció: egy modul-szintű `Vector3` a vetítéshez, a többi nyers
 * aritmetika. A hurok néhány tucat épületen megy végig, egyetlen kattintáskor.
 *
 * @param {import('../sim/sim.js').Sim} sim
 * @param {THREE.Camera} kamera
 * @param {number} kepX vászon-képpont
 * @param {number} kepY vászon-képpont
 * @param {number} szel a vászon szélessége
 * @param {number} mag a vászon magassága
 * @returns {number} épület-index a `sim.epuletek`-be, vagy -1
 */
export function epuletTalalat(sim, kamera, kepX, kepY, szel, mag) {
  if (!sim || !kamera || !sim.epuletek || !sim.racs) return -1;
  const w = szel || 1, h = mag || 1;
  const ndcX = (kepX / w) * 2 - 1;
  const ndcY = -((kepY / h) * 2 - 1);

  kamera.updateMatrixWorld();
  _sugarVeg.set(ndcX, ndcY, 0.5).unproject(kamera);
  const ox = kamera.position.x, oy = kamera.position.y, oz = kamera.position.z;
  let dx = _sugarVeg.x - ox, dy = _sugarVeg.y - oy, dz = _sugarVeg.z - oz;
  const hossz = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (hossz < 1e-9) return -1;
  dx /= hossz; dy /= hossz; dz /= hossz;

  const ep = sim.epuletek;
  const racs = sim.racs;
  let legjobb = -1, legjobbT = Infinity;

  for (let i = 0; i < ep.db; i++) {
    if (ep.elo[i] === 0) continue;
    const t = ep.tipus[i];
    const fel = EP_MERET[t] * 0.5;
    const talp = racs.magassagPont(ep.x[i], ep.y[i]) + ULES;

    // SÁV-MÓDSZER (slab): tengelyenként belépési és kilépési paraméter, a
    // metszetük a doboz. Az `Infinity` itt nem hiba, hanem a „soha nem lép ki"
    // eset — a tengellyel párhuzamos sugarat külön ág kezeli.
    let be = 0, ki = Infinity;

    let lo = ep.x[i] - fel, hi = ep.x[i] + fel;
    if (dx > -1e-9 && dx < 1e-9) { if (ox < lo || ox > hi) continue; } else {
      let t1 = (lo - ox) / dx, t2 = (hi - ox) / dx;
      if (t1 > t2) { const cs = t1; t1 = t2; t2 = cs; }
      if (t1 > be) be = t1;
      if (t2 < ki) ki = t2;
      if (be > ki) continue;
    }

    lo = talp; hi = talp + EP_KERET[t];
    if (dy > -1e-9 && dy < 1e-9) { if (oy < lo || oy > hi) continue; } else {
      let t1 = (lo - oy) / dy, t2 = (hi - oy) / dy;
      if (t1 > t2) { const cs = t1; t1 = t2; t2 = cs; }
      if (t1 > be) be = t1;
      if (t2 < ki) ki = t2;
      if (be > ki) continue;
    }

    lo = ep.y[i] - fel; hi = ep.y[i] + fel;
    if (dz > -1e-9 && dz < 1e-9) { if (oz < lo || oz > hi) continue; } else {
      let t1 = (lo - oz) / dz, t2 = (hi - oz) / dz;
      if (t1 > t2) { const cs = t1; t1 = t2; t2 = cs; }
      if (t1 > be) be = t1;
      if (t2 < ki) ki = t2;
      if (be > ki) continue;
    }

    // A kamera MÖGÖTTI doboz nem találat (`ki < 0`); ha a kamera a dobozban
    // ül, a `be` nulla marad, és az a legközelebbi lehetséges találat.
    if (ki < 0) continue;
    if (be < legjobbT) { legjobbT = be; legjobb = i; }
  }
  return legjobb;
}
