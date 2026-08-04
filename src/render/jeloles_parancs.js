// AGE OF THE CRYSTALS — PARANCS-VISSZAJELZÉS („megérkezett a parancsom?").
//
// ── EZ A RÉTEG A v0.16 LEGFONTOSABB HIÁNYA ────────────────────────────────
// A tulajdonos kipróbálta a játékot, és nem tudott semmit csinálni. A fő ok
// nem az irányítás volt: a jobb kattintás v0.2 óta helyesen ad menetparancsot.
// A baj az, hogy a képernyő SEMMIT nem mond róla. Kijelölsz, kattintasz, és a
// következő fél másodpercben nincs egyetlen képpont sem, ami visszaigazolná,
// hogy a gép egyáltalán hallotta a kattintást. Ilyenkor az ember újra kattint,
// aztán megint, aztán leteszi az egeret — és nem a játékot hibáztatja, hanem
// magát.
//
// Ezért ez a réteg egyetlen kérdésre felel: HOVA és MILYEN parancsot adtam.
//
// ── MIÉRT A SIMBŐL OLVASSUK KI, ÉS NEM A KATTINTÁSBÓL ─────────────────────
// Kézenfekvő lenne, hogy a `bevitel.js` szóljon: „most adtam menetparancsot
// ide". Két okból nem ezt csináljuk:
//
//   1. A render SOSEM függhet attól, hogy a UI szólt-e neki. A parancs a v0.8-
//      ban a HÁLÓZATRÓL is érkezhet (a másik játékos, vagy a saját parancsom
//      késleltetve), és a lockstep pont attól működik, hogy MINDENKI ugyanazt
//      a sort látja. Ami csak a helyi egérkattintásból látszik, az a
//      többjátékos módban némán eltűnik.
//   2. A parancs `KESLELTETES` tick múlva HAJTÓDIK VÉGRE, és el is veszhet
//      (járhatatlan cél, nem a mi épületünk, nincs elég nyersanyag). A
//      kattintásra villantott jelölő tehát HAZUDNA: mutatná a parancsot, ami
//      sosem történt meg. A simből olvasott jelölő csak akkor villan, ha az
//      egység célja TÉNYLEG megváltozott.
//
// A jel maga: `parancsAllapot.vegX/vegY/vegMezo` (a menet valódi végpontja,
// amit az üldözés nem írhat felül) és `munkasok.celNode` (a gyűjtés
// lelőhelye). Mindkettőt KIZÁRÓLAG a parancs-végrehajtó írja — az AI-üldözés,
// a szeparáció és az útkövetés nem nyúl hozzájuk. Ezért a változásuk pontosan
// azt jelenti, amit keresünk: „új parancs érkezett erre az egységre".
//
// ── MIÉRT CSAK A KIJELÖLT EGYSÉGEKET FIGYELJÜK ────────────────────────────
// Kettő okból. Az egyik játék-tervezési: a gépi ellenfél parancsairól nem kell
// villogni a képernyőnek. A másik MÉRÉSI, és fontosabb: az FPS-mérés alatt a
// kijelölés ÜRES, viszont a szonda-forgatókönyv 12 másodpercenként az ÖSSZES
// 1600 egységnek menetparancsot ad. Ha ez a réteg minden egységet figyelne,
// mérés közben villogna — vagyis a v0.1 óta érvényes „üres kijelölésnél a
// réteg költsége nulla" szerződés dőlne meg, és az összes eddigi lépcső
// összehasonlíthatatlanná válna.
//
// ── MIÉRT VAN VILLANÁS **ÉS** ÁLLANDÓ CÉLJELÖLŐ ───────────────────────────
// A villanás megmondja, hogy a parancs MEGÉRKEZETT. Azt nem mondja meg, hogy
// hova tart a seregem, ha egy másodperccel később nézek oda. Ezért a kijelölés
// ÉLŐ menetparancsainak a végpontján egy halvány, lélegző jelölő is ül, amíg
// oda nem érnek. A kettő ugyanabból a rajból megy ki (ugyanaz az alak, más
// fényerő), tehát nem kerül külön rajzhívásba.
//
// ── AZ IDŐ A SIM ÓRÁJA ────────────────────────────────────────────────────
// `(tick + alfa) · DT`, nem `performance.now()`. Így a jelölő SZÜNETBEN megáll
// (ami helyes: szünetben semmi nem történik), és lassított menetben lassabban
// hal el — vagyis pontosan annyi ideig látszik, amennyi játékidő eltelt.

import { THREE } from './core3d.js';
import { PARANCS } from '../sim/parancsallapot.js';
import { Raj, ekGeo, keresztGeo, rombuszGeo, keretGeo } from './jeloles_kozos.js';

/** A jelölő-fajták. A táblák hossza KÖTELEZŐEN ennyi — lásd a fejlécet. */
export const JEL = { MENET: 0, TAMADO: 1, GYUJT: 2, ALLJ: 3 };
export const JEL_DB = 4;

/** Fajtánkénti szín. A hossza `JEL_DB`. */
const JEL_SZIN = [0x5ce07a, 0xff4a3d, 0xffc44d, 0x9fb3c8];
/** Fajtánkénti világ-méret (sugár). A hossza `JEL_DB`. */
const JEL_MERET = [1.35, 1.45, 1.05, 0.95];

/** Egy villanás élettartama SIM-másodpercben. */
const ELETTARTAM = 0.85;
/** Egyszerre ennyi villanás élhet. Ennél több egyszerre úgysem olvasható. */
const MAX_VILLANAS = 24;
/** Az állandó céljelölők maximuma — ennyi külön menetparancs-csoport látszik. */
const MAX_CEL = 8;

/** A jelölő a talaj fölött ennyivel lebeg. */
const MAGASSAG = 0.09;

/** Az állandó céljelölő fényereje a villanáshoz képest. */
const CEL_FENY = 0.55;
/** A céljelölő lélegzésének periódusa SIM-másodpercben. */
const CEL_PERIODUS = 1.6;

const _szin = new THREE.Color();

export class JelolesParancs {
  /**
   * @param {THREE.Object3D} szinter
   * @param {import('../sim/sim.js').Sim} sim
   * @param {{kijeloles:any}} opciok
   */
  constructor(szinter, sim, opciok) {
    this.kijeloles = opciok.kijeloles || null;

    // ── Rajok fajtánként ───────────────────────────────────────────────
    // Fajtánként külön geometria kell (nyíl / kereszt / rombusz / négyzet),
    // tehát fajtánként külön raj. Négy rajzhívás a legrosszabb esetben, és
    // NULLA, ha nincs élő jelölő (a `Raj.zar()` elrejti az üres rajt).
    const geo = [ekGeo(), keresztGeo(), rombuszGeo(), keretGeo(0.62)];
    this.rajok = new Array(JEL_DB);
    for (let f = 0; f < JEL_DB; f++) {
      this.rajok[f] = new Raj(szinter, geo[f], MAX_VILLANAS + MAX_CEL, {
        opacitas: 0.92, sorrend: 5,
      });
    }
    this._jelRgb = new Float32Array(JEL_DB * 3);
    for (let f = 0; f < JEL_DB; f++) {
      _szin.setHex(JEL_SZIN[f]);
      this._jelRgb[f * 3] = _szin.r;
      this._jelRgb[f * 3 + 1] = _szin.g;
      this._jelRgb[f * 3 + 2] = _szin.b;
    }

    // ── Villanás-gyűrű (fix méretű, körkörös puffer) ───────────────────
    this._vFajta = new Uint8Array(MAX_VILLANAS);
    this._vX = new Float32Array(MAX_VILLANAS);
    this._vY = new Float32Array(MAX_VILLANAS);
    this._vSzul = new Float32Array(MAX_VILLANAS);
    this._vElo = new Uint8Array(MAX_VILLANAS);
    this._vKovetkezo = 0;

    // ── Állandó céljelölők (tickenként újraszámolva) ───────────────────
    this._cMezo = new Int32Array(MAX_CEL);
    this._cX = new Float32Array(MAX_CEL);
    this._cY = new Float32Array(MAX_CEL);
    this._cDb = new Int32Array(MAX_CEL);
    this._cFajta = new Uint8Array(MAX_CEL);
    this._cN = 0;

    // ── Parancs-alapállás (a változás-figyeléshez) ─────────────────────
    const max = sim.maxEgyseg;
    this._aVegX = new Float64Array(max);
    this._aVegY = new Float64Array(max);
    this._aVegMezo = new Int32Array(max);
    this._aNode = new Int32Array(max);
    /** Van-e érvényes alapállásunk? Enélkül az első tick MINDENT változásnak lát. */
    this._alap = false;

    // Fajtánkénti gyűjtő EGY tickre: darabszám és koordináta-összeg.
    this._gyDb = new Int32Array(JEL_DB);
    this._gyX = new Float64Array(JEL_DB);
    this._gyY = new Float64Array(JEL_DB);
  }

  /** Újrafelállás: az indexek átrendeződtek, az alapállás hazugság lenne. */
  ujraKot() {
    this._alap = false;
    this._vElo.fill(0);
    this._cN = 0;
  }

  /**
   * KÜLSŐ JELÖLÉS-KÉRÉS.
   *
   * A réteg magától is észreveszi a parancsokat (lásd a fejlécet), ez az út
   * azoknak a parancsoknak való, amiknek NINCS egység-oldali nyomuk: épület
   * lerakása, képzés, kutatás. A `bevitel.js` MÁSIK AGENT sávja, tehát ma
   * senki nem hívja — de a kapocs itt van, és nem kell hozzá ezt a fájlt
   * átírni.
   *
   * @param {number} fajta `JEL.*`
   * @param {number} x @param {number} y világkoordináta
   * @param {number} ido a sim órája másodpercben
   */
  jelol(fajta, x, y, ido) {
    const f = fajta | 0;
    if (f < 0 || f >= JEL_DB) return;
    const k = this._vKovetkezo;
    this._vFajta[k] = f;
    this._vX[k] = x;
    this._vY[k] = y;
    this._vSzul[k] = ido;
    this._vElo[k] = 1;
    this._vKovetkezo = (k + 1) % MAX_VILLANAS;
  }

  /**
   * @param {import('../sim/sim.js').Sim} sim
   * @param {import('./jeloles_kozos.js').Pillanatkep} kep
   * @param {number} ido a sim órája másodpercben
   */
  frissit(sim, kep, ido) {
    const lista = this.kijeloles ? this.kijeloles.lista : null;
    if (!lista || lista.length === 0) {
      // Nincs kijelölés → nincs mit figyelni. Az alapállást ELDOBJUK, mert
      // amíg nem nézünk oda, a világ elmozdul, és a következő kijelölés
      // pillanatában a régi alapállás MINDEN egységet változásnak látna —
      // vagyis egy sima „kijelölök egy sereget" villanás-özönt szülne.
      this._alap = false;
      this._cN = 0;
    } else if (kep.ujTick) {
      this._tick(sim, lista, ido);
    }
    this._rajzol(sim, ido);
  }

  /** Él-e még bármi ebben a rétegben? A gazda ebből tudja, kell-e pillanatkép. */
  get van() {
    if (this._cN > 0) return true;
    for (let k = 0; k < MAX_VILLANAS; k++) if (this._vElo[k] === 1) return true;
    return false;
  }

  // ── VÁLTOZÁS-FIGYELÉS ────────────────────────────────────────────────

  _tick(sim, lista, ido) {
    const pa = sim.parancsAllapot;
    if (!pa) return;
    if (this._alap) this._valtozasok(sim, lista, ido);
    this._alapallas(sim);
    this._alap = true;
    this._celokGyujt(sim, lista);
  }

  _valtozasok(sim, lista, ido) {
    const e = sim.egysegek;
    const pa = sim.parancsAllapot;
    const munkasok = sim.munkasok;
    const ef = sim.eroforrasok;
    const gyDb = this._gyDb, gyX = this._gyX, gyY = this._gyY;
    for (let f = 0; f < JEL_DB; f++) { gyDb[f] = 0; gyX[f] = 0; gyY[f] = 0; }

    for (let k = 0; k < lista.length; k++) {
      const i = lista[k];
      if (i >= e.db) continue;

      // ── Menet / támadó menet / megállás ────────────────────────────
      const p = pa.parancs[i];
      const mezoValt = pa.vegMezo[i] !== this._aVegMezo[i];
      const helyValt = pa.vegX[i] !== this._aVegX[i] || pa.vegY[i] !== this._aVegY[i];
      if (mezoValt || helyValt) {
        if (p === PARANCS.MENET || p === PARANCS.TAMADO_MENET) {
          const f = p === PARANCS.TAMADO_MENET ? JEL.TAMADO : JEL.MENET;
          gyDb[f]++; gyX[f] += pa.vegX[i]; gyY[f] += pa.vegY[i];
        } else if ((p === PARANCS.NINCS || p === PARANCS.TARTAS) && pa.vegMezo[i] === -1
          && this._aVegMezo[i] !== -1) {
          // Megállás: a parancs-végrehajtó a végpontot az egység SAJÁT
          // helyére írta és a mezőt elengedte. Az `_aVegMezo !== -1`
          // feltétel zárja ki a megérkezést — az nem parancs, hanem
          // következmény, és nem szabad jelölnie.
          gyDb[JEL.ALLJ]++; gyX[JEL.ALLJ] += pa.vegX[i]; gyY[JEL.ALLJ] += pa.vegY[i];
        }
      }

      // ── Gyűjtés ────────────────────────────────────────────────────
      // A munkás-AI is átrakhatja a munkást másik lelőhelyre (kimerült az
      // erdő). Ezt nem lehet tökéletesen szétválasztani a játékos
      // parancsától — de a téves villanás ára egy fölösleges jelölő, a
      // hiányzóé pedig az, hogy a gyűjtés-parancs láthatatlan marad.
      if (munkasok) {
        const node = munkasok.celNode[i];
        if (node >= 0 && node !== this._aNode[i] && ef && node < ef.db) {
          gyDb[JEL.GYUJT]++; gyX[JEL.GYUJT] += ef.x[node]; gyY[JEL.GYUJT] += ef.y[node];
        }
      }
    }

    // Fajtánként EGY jelölő a súlypontban. A menetparancs alakzat-eltolásai
    // szimmetrikusak a kattintott pontra, tehát a súlypont ≈ a kattintás
    // helye — pont az, ahova a játékos nézett.
    for (let f = 0; f < JEL_DB; f++) {
      if (gyDb[f] > 0) this.jelol(f, gyX[f] / gyDb[f], gyY[f] / gyDb[f], ido);
    }
  }

  /** Az alapállás felvétele MINDEN egységre (nem csak a kijelöltekre). */
  _alapallas(sim) {
    const pa = sim.parancsAllapot;
    const db = sim.egysegek.db;
    // Miért mindenre: mert a kijelölés bármikor bővülhet, és egy frissen
    // kijelölt egység elavult alapállása azonnal hamis villanást adna.
    this._aVegX.set(pa.vegX.subarray(0, db));
    this._aVegY.set(pa.vegY.subarray(0, db));
    this._aVegMezo.set(pa.vegMezo.subarray(0, db));
    if (sim.munkasok) this._aNode.set(sim.munkasok.celNode.subarray(0, db));
  }

  /**
   * ÁLLANDÓ CÉLJELÖLŐK: a kijelölés élő menetparancsainak végpontjai.
   *
   * A csoportosítás kulcsa a `vegMezo` — az áramlási mező azonosítója. Ez nem
   * ötlet, hanem a sim szerkezetéből következik: EGY parancs EGY mezőt kap az
   * egész csoportnak (a v0.1 legdrágább tanulsága), tehát az azonos `vegMezo`
   * pontosan azt jelenti, hogy „ugyanazzal a kattintással küldtem el őket".
   */
  _celokGyujt(sim, lista) {
    const e = sim.egysegek;
    const pa = sim.parancsAllapot;
    let n = 0;
    for (let k = 0; k < lista.length; k++) {
      const i = lista[k];
      if (i >= e.db) continue;
      const p = pa.parancs[i];
      if (p !== PARANCS.MENET && p !== PARANCS.TAMADO_MENET) continue;
      const mezo = pa.vegMezo[i];
      if (mezo < 0) continue;
      let hely = -1;
      for (let c = 0; c < n; c++) if (this._cMezo[c] === mezo) { hely = c; break; }
      if (hely < 0) {
        if (n >= MAX_CEL) continue;
        hely = n++;
        this._cMezo[hely] = mezo;
        this._cX[hely] = 0; this._cY[hely] = 0; this._cDb[hely] = 0;
      }
      this._cX[hely] += pa.vegX[i];
      this._cY[hely] += pa.vegY[i];
      this._cDb[hely]++;
      this._cFajta[hely] = p === PARANCS.TAMADO_MENET ? JEL.TAMADO : JEL.MENET;
    }
    for (let c = 0; c < n; c++) {
      const d = this._cDb[c];
      if (d > 0) { this._cX[c] /= d; this._cY[c] /= d; }
    }
    this._cN = n;
  }

  // ── RAJZ ─────────────────────────────────────────────────────────────

  _rajzol(sim, ido) {
    for (let f = 0; f < JEL_DB; f++) this.rajok[f].kezd();
    const racs = sim.racs;
    const rgb = this._jelRgb;

    // ── Állandó céljelölők (lélegző, halvány) ─────────────────────────
    let l = (ido / CEL_PERIODUS) % 1;
    if (l < 0) l += 1;
    const lelegzet = 0.94 + 0.12 * (l < 0.5 ? l * 2 : (1 - l) * 2);
    for (let c = 0; c < this._cN; c++) {
      const f = this._cFajta[c];
      const x = this._cX[c], y = this._cY[c];
      const s = JEL_MERET[f] * 0.8 * lelegzet;
      const o = f * 3;
      this.rajok[f].helyez(x, racs.magassagPont(x, y) + MAGASSAG, y, s);
      this.rajok[f].szinRgb(rgb[o] * CEL_FENY, rgb[o + 1] * CEL_FENY, rgb[o + 2] * CEL_FENY);
    }

    // ── Villanások ────────────────────────────────────────────────────
    for (let k = 0; k < MAX_VILLANAS; k++) {
      if (this._vElo[k] === 0) continue;
      const u = (ido - this._vSzul[k]) / ELETTARTAM;
      // A negatív `u` (visszatekert sim-óra: betöltés, újrafelállás) ugyanúgy
      // halált jelent, mint a lejárt idő — különben a jelölő percekig ottmarad.
      if (u < 0 || u >= 1) { this._vElo[k] = 0; continue; }
      const f = this._vFajta[k];
      const x = this._vX[k], y = this._vY[k];
      // Pattanás → megülés → zsugorodás. Három egyenes szakasz: a szem a
      // MOZGÁST veszi észre, nem a görbe simaságát, és így nincs `Math.sin`.
      let s, feny;
      if (u < 0.22) { const t = u / 0.22; s = 0.45 + 0.85 * t; feny = 1.75 - 0.45 * t; }
      else if (u < 0.70) { const t = (u - 0.22) / 0.48; s = 1.30 - 0.35 * t; feny = 1.30 - 0.30 * t; }
      else { const t = (u - 0.70) / 0.30; s = 0.95 * (1 - t); feny = 1.0; }
      const meret = JEL_MERET[f] * s;
      if (meret <= 0.001) continue;
      const o = f * 3;
      // A villanás a céljelölő FÖLÉ kerül (+0.02), hogy az állandó jelölő ne
      // z-harcoljon vele azon a képkockán, amikor egyszerre látszanak.
      this.rajok[f].helyez(x, racs.magassagPont(x, y) + MAGASSAG + 0.02, y, meret);
      this.rajok[f].szinRgb(rgb[o] * feny, rgb[o + 1] * feny, rgb[o + 2] * feny);
    }

    for (let f = 0; f < JEL_DB; f++) this.rajok[f].zar();
  }

  set enabled(v) { for (let f = 0; f < JEL_DB; f++) this.rajok[f].lathato = v; }

  get haromszog() {
    let h = 0;
    for (let f = 0; f < JEL_DB; f++) h += this.rajok[f].haromszog;
    return h;
  }

  bont() { for (let f = 0; f < JEL_DB; f++) this.rajok[f].bont(); }
}
