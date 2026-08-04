// AGE OF THE CRYSTALS — CTRL-CSOPORT JELVÉNYEK (1..0).
//
// ── MIÉRT LÁTHATATLAN MA A CSOPORT, ÉS MIÉRT BAJ EZ ───────────────────────
// A Ctrl-csoport a v0.2 óta MŰKÖDIK: `Ctrl+3` elmenti a kijelölést, `3`
// előhívja, kétszer nyomva a kamera is odaugrik. A képernyőn viszont semmi nem
// mutatja. Aki lement három csoportot, öt perc múlva már nem tudja, melyik
// melyik volt — vagyis a funkció megvan, de HASZNÁLHATATLAN. Ez pontosan az a
// hibafajta, amit a tulajdonos „nem tudtam semmit csinálni"-nak nevezett: a
// képesség létezik, csak a visszajelzése nincs.
//
// ── MIÉRT CSAK A KIJELÖLTEK KAPNAK JELVÉNYT ───────────────────────────────
// Ha minden csoportba sorolt egység fölött ott ülne a száma, egy 200 fős
// sereg fölött 200 apró szám lebegne — a képernyő olvashatatlan lenne, és a
// jelvény pont azt a figyelmet kötné le, amit a csatára kell fordítani.
//
// A jelvény ezért a KIJELÖLÉSHEZ kötött. Amikor a `3`-at megnyomom, a
// megjelenő sereg fölött megjelenik a `3` — vagyis pontosan akkor és arról,
// amikor és amiről a kérdés felmerül. Mellékhatásként a mérési szerződés is
// megmarad: üres kijelölésnél ez a réteg nem jár be semmit.
//
// ── MIÉRT ATLASZ, ÉS MIÉRT TÍZ GEOMETRIA ─────────────────────────────────
// Tíz külön textúra tíz anyagot és tíz textúra-váltást jelentene. Egy atlasz
// (tíz számjegy egymás mellett) + tíz GEOMETRIA (mindegyik a saját UV-sávjára
// szűkítve) EGY anyagot és EGY textúrát ad. A tíz `InstancedMesh` közül csak az
// megy ki rajzhívásként, amelyikben tényleg van példány — a többi a
// `Raj.zar()`-ban láthatatlanná válik, tehát a jelenet-bejárásból is kiesik.
//
// ── MIÉRT SÖTÉT LAP A SZÁM ALATT ──────────────────────────────────────────
// Ugyanaz az ok, mint a gyűrű kontraszt-karikájánál: egy fehér szám a havon
// nem látszik. A sötét lap minden terepen kiválik, és a szám azon ül.
//
// ── ⚠️ NODE-BAN NINCS CANVAS ──────────────────────────────────────────────
// Az atlasz `<canvas>`-ból készül. A determinizmus-szonda és a fejlesztői
// szoftver-raszterizáló node-ban fut, ahol nincs `document`. Ilyenkor a réteg
// NEM dob, csak nem rajzol jelvényt — a többi jelölő működik tovább. Egy
// kivétel itt az egész render-hurkot megállítaná, márpedig a jelvény a
// legkevésbé fontos elem a fájlban.

import { THREE } from './core3d.js';
import { TIPUS_DB } from '../sim/units.js';
import { Raj, tablaGeo, tablaGeoUv } from './jeloles_kozos.js';

/** Tíz csoport: 0..9, ahogy a `bevitel.js` a `Digit0..9` kódot fordítja. */
const CSOPORT_DB = 10;

/**
 * A jelvény magassága a talaj fölött, egységtípusonként — az életerő-csík
 * FÖLÉ. Sorrend: MUNKAS, LANDZSAS, IJASZ, LOVAG, OSTROMGEP, EGYEDI.
 */
const JELVENY_MAGAS = [1.70, 1.80, 1.76, 2.00, 2.24, 1.90];

if (JELVENY_MAGAS.length !== TIPUS_DB) {
  throw new Error('[jeloles_csoport] JELVENY_MAGAS hossza ' + JELVENY_MAGAS.length
    + ', elvárt TIPUS_DB = ' + TIPUS_DB);
}

/** Az atlasz egy cellája képpontban. */
const CELLA = 64;
/** A jelvény világ-mérete. */
const MERET = 0.42;
/** Ennél messzebb nincs jelvény (világegység) — olvashatatlan lenne. */
const TAVOLSAG = 48;
/** Egyszerre ennyi jelvény mehet ki. Fölötte a kép úgyis szám-szőnyeg lenne. */
const MAX_JELVENY = 64;
/** E fölötti kijelölésnél egyáltalán nincs jelvény (lásd a fejlécet). */
const KIJELOLES_HATAR = 120;

export class JelolesCsoport {
  /**
   * @param {THREE.Object3D} szinter
   * @param {import('../sim/sim.js').Sim} sim
   * @param {{kijeloles:any}} opciok
   */
  constructor(szinter, sim, opciok) {
    this.kijeloles = opciok.kijeloles || null;
    this.szinter = szinter;

    this.terkep = this._atlasz();
    this.lap = new Raj(szinter, tablaGeo(false), MAX_JELVENY, {
      opacitas: 0.78, sorrend: 8,
    });
    this.szamok = new Array(CSOPORT_DB);
    for (let n = 0; n < CSOPORT_DB; n++) {
      const u0 = n / CSOPORT_DB, u1 = (n + 1) / CSOPORT_DB;
      this.szamok[n] = new Raj(szinter, tablaGeoUv(u0, u1), MAX_JELVENY, {
        opacitas: 1.0, sorrend: 9, terkep: this.terkep,
      });
    }

    /** Egység → csoport (a legkisebb indexű, amiben benne van), vagy -1. */
    this._tag = new Int8Array(sim.maxEgyseg).fill(-1);
    /** A csoportok legutóbb látott aláírása — ebből tudjuk, kell-e újraépíteni. */
    this._alairas = 0;
    this._epitve = false;
  }

  ujraKot() { this._tag.fill(-1); this._alairas = 0; this._epitve = false; }

  /**
   * A számjegy-atlasz. Fehér számok átlátszó háttéren; a kontrasztot a
   * mögéjük tett sötét lap adja, nem a textúra.
   * @returns {THREE.Texture|null}
   */
  _atlasz() {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = CELLA * CSOPORT_DB;
    c.height = CELLA;
    const g = c.getContext('2d');
    if (!g) return null;
    g.clearRect(0, 0, c.width, c.height);
    g.font = 'bold ' + Math.round(CELLA * 0.78) + 'px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    for (let n = 0; n < CSOPORT_DB; n++) {
      const x = n * CELLA + CELLA / 2;
      const y = CELLA / 2 + 1;
      // A vastag sötét körvonal akkor is elválasztja a számot a háttértől, ha
      // a lap alatta épp áttetsző szélén ül.
      g.lineWidth = Math.round(CELLA * 0.16);
      g.strokeStyle = 'rgba(6, 10, 14, 0.95)';
      g.strokeText(String(n), x, y);
      g.fillStyle = '#ffffff';
      g.fillText(String(n), x, y);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    return t;
  }

  /**
   * @param {import('../sim/sim.js').Sim} sim
   * @param {import('./jeloles_kozos.js').Pillanatkep} kep
   * @param {{bazis:Float32Array, x:number, y:number, z:number}} nezet
   * @param {boolean} ujTick
   */
  frissit(sim, kep, nezet, ujTick) {
    this.lap.kezd();
    for (let n = 0; n < CSOPORT_DB; n++) this.szamok[n].kezd();

    const kj = this.kijeloles;
    const lista = kj ? kj.lista : null;
    if (this.terkep && lista && lista.length && lista.length <= KIJELOLES_HATAR
      && kj.csoportok) {
      if (ujTick || !this._epitve) this._tagEpit(kj);
      this._rajzol(sim, kep, nezet, lista);
    }

    this.lap.zar();
    for (let n = 0; n < CSOPORT_DB; n++) this.szamok[n].zar();
  }

  /**
   * Egység → csoport tábla.
   *
   * ⚠️ Nem építjük újra tickenként: a tíz csoport együtt akár ezernél is több
   * indexet tartalmazhat, és ez a tábla ritkán változik (csak `Ctrl+szám`-ra és
   * újrafelállásra). Az ALÁÍRÁS a tíz csoport hossza, első és utolsó eleme —
   * ez minden mentést elkap, kivéve azt a ritka esetet, amikor a csoport
   * hossza, első és utolsó eleme is UGYANAZ marad, de a közepe változik. Az
   * ára akkor is csak annyi, hogy egy jelvény a következő mentésig a régi
   * számot mutatja; nincs NaN, nincs összeomlás.
   */
  _tagEpit(kj) {
    let a = 0;
    for (let n = 0; n < CSOPORT_DB; n++) {
      const cs = kj.csoportok[n];
      if (!cs) continue;
      a = (a * 31 + cs.length) | 0;
      if (cs.length) a = (a * 31 + cs[0] + cs[cs.length - 1] * 7) | 0;
    }
    if (this._epitve && a === this._alairas) return;
    this._alairas = a;
    this._epitve = true;
    this._tag.fill(-1);
    // Visszafelé megyünk, hogy a LEGKISEBB indexű csoport nyerjen: aki a
    // 2-ben és a 7-ben is benne van, a 2-t mutatja.
    for (let n = CSOPORT_DB - 1; n >= 0; n--) {
      const cs = kj.csoportok[n];
      if (!cs) continue;
      for (let k = 0; k < cs.length; k++) {
        const i = cs[k];
        if (i >= 0 && i < this._tag.length) this._tag[i] = n;
      }
    }
  }

  _rajzol(sim, kep, nezet, lista) {
    const e = sim.egysegek;
    const racs = sim.racs;
    const harc = sim.harc;
    const besz = sim.beszallas;
    const bazis = nezet.bazis;
    const tav2 = TAVOLSAG * TAVOLSAG;

    for (let k = 0; k < lista.length; k++) {
      if (this.lap.tele) break;
      const i = lista[k];
      if (i >= e.db) continue;
      const n = this._tag[i];
      if (n < 0) continue;
      if (harc && harc.elo[i] === 0) continue;
      if (besz && besz.bent[i] === 1) continue;

      const x = kep.x(i), y = kep.y(i);
      const magas = racs.magassagPont(x, y);
      const dx = x - nezet.x, dy = magas - nezet.y, dz = y - nezet.z;
      if (dx * dx + dy * dy + dz * dz > tav2) continue;

      const h = magas + JELVENY_MAGAS[e.tipus[i]];
      this.lap.helyezTabla(x, h, y, MERET * 1.18, MERET * 1.18, bazis);
      this.lap.szinRgb(0.02, 0.03, 0.05);
      const raj = this.szamok[n];
      if (raj.tele) continue;
      // A szám egy hajszállal a lap ELŐTT — a `renderOrder` amúgy is eldönti a
      // sorrendet, de a kamera felé tolás a mélységi teszten is átviszi.
      raj.helyezTabla(
        x + bazis[6] * 0.02, h + bazis[7] * 0.02, y + bazis[8] * 0.02,
        MERET, MERET, bazis,
      );
      raj.szinRgb(1, 1, 1);
    }
  }

  set enabled(v) {
    this.lap.lathato = v;
    for (let n = 0; n < CSOPORT_DB; n++) this.szamok[n].lathato = v;
  }

  get haromszog() {
    let h = this.lap.haromszog;
    for (let n = 0; n < CSOPORT_DB; n++) h += this.szamok[n].haromszog;
    return h;
  }

  bont() {
    this.lap.bont();
    for (let n = 0; n < CSOPORT_DB; n++) this.szamok[n].bont();
    if (this.terkep) { this.terkep.dispose(); this.terkep = null; }
  }
}
