// AGE OF THE CRYSTALS — ÉLETERŐ-CSÍKOK.
//
// ── MIÉRT KELL, ÉS MIÉRT NEM ELÉG A PANEL ─────────────────────────────────
// A v0.4 óta van sebzés, a v0.16 óta van kijelölés-panel, ami kiírja a
// kijelölt egység életerejét. Egy csatában viszont nem a panelt nézzük: a szem
// a pályán van, és a kérdés az, hogy MELYIK katonám fog meghalni a következő
// másodpercben. Erre a panel szerkezetileg nem tud válaszolni — egy szám nem
// térkép.
//
// ── ⚠️ MIÉRT NEM KAP CSÍKOT MINDEN SÉRÜLT EGYSÉG ─────────────────────────
// Ez a döntés nem szépészeti, hanem MÉRÉSI, és a projekt legrégebbi
// szerződéséből következik: az FPS-mérés alatt a kijelölés ÜRES, és a v0.1 óta
// azon áll az összes lépcső összehasonlíthatósága, hogy a kijelölés-réteg
// költsége olyankor NULLA.
//
// A szonda-forgatókönyv viszont két sereget masíroztat egymásnak: a mérés
// közepén TÖMEGESEN vannak sérült egységek. Ha a csík a „sérült" feltételre
// menne ki, a réteg pont a mérés alatt lenne a legdrágább — vagyis a v0.10-es
// szám már nem lenne összevethető a v0.1-essel, és a regresszió-őr elveszne.
// Az sem segítene, ha a rajz csak akkor indulna, ha van kijelölés: a
// `for (i < db)` végigjárás önmagában is költség, és mérés közben is lefutna.
//
// Ezért a csík a KIJELÖLÉSHEZ kötött, és csak azt járjuk végig:
//   • a kijelölt egységek, és
//   • akiket a kijelölésem éppen ÜT (`parancsAllapot.celEgyseg`).
// A második ág az, amitől a rendszer játékként is működik: harc közben pont
// azt látom, hogy a célpontom fogy-e — enélkül a „támadd meg" parancs
// eredménye ugyanolyan láthatatlan lenne, mint a v0.16 előtt a menetparancs.
//
// Az ellenséges csík csak a hadi ködön BELÜL látszik. A köd a sim igazsága
// (`sim.kod`), nem a renderé: a ködön kívüli csík ingyen felderítés lenne, és
// pont az a fajta szivárgás, amit a v0.8-as hálózati kör nem tudna visszavenni.
//
// ── MIÉRT VAN TÁVOLSÁG-KORLÁT ─────────────────────────────────────────────
// A csík KÉPERNYŐRE MERŐLEGES lap: kizoomolva néhány képpont magas, tehát
// olvashatatlan, viszont ugyanannyiba kerül, mint közelről. Ugyanaz a
// gondolat, mint a `units3d.js` LOD-ja: amit úgysem látni, azt nem rajzoljuk.
//
// ── ⚠️ A TÁBLA-HOSSZ ──────────────────────────────────────────────────────
// A `CSIK_MAGAS` `TIPUS`-szal indexel, tehát KÖTELEZŐEN `TIPUS_DB` hosszú. Egy
// rövid tábla `undefined` magasságot ad, abból NaN kerül a példány-mátrixba, és
// az egész csík-raj eltűnik — némán, kivétel nélkül, zöld kapuval. Pontosan ez
// történt a `kijeloles3d.js` `SUGAR` táblájával. Ezért ez a modul BETÖLTÉSKOR
// ELLENŐRZI magát, és inkább dob, mint hogy csendben rosszul rajzoljon.

import { THREE } from './core3d.js';
import { TIPUS_DB } from '../sim/units.js';
import { Raj, tablaGeo, CSAPAT_SZIN } from './jeloles_kozos.js';

/**
 * A csík magassága a talaj fölött, egységtípusonként — a figura feje fölé.
 * Sorrend: MUNKAS, LANDZSAS, IJASZ, LOVAG, OSTROMGEP, EGYEDI.
 */
const CSIK_MAGAS = [1.42, 1.52, 1.48, 1.72, 1.95, 1.62];

if (CSIK_MAGAS.length !== TIPUS_DB) {
  throw new Error('[jeloles_eletcsik] CSIK_MAGAS hossza ' + CSIK_MAGAS.length
    + ', elvárt TIPUS_DB = ' + TIPUS_DB + ' — új egységtípusnál ide is kell egy sor');
}

/** A csík világ-szélessége és -magassága. */
const SZELES = 0.92;
const VASTAG = 0.13;
/** A háttér ennyivel lóg túl a töltésen minden irányban (keret-hatás). */
const KERET = 0.035;

/** Ezen a kamera-távolságon túl nincs csík (világegység). */
const TAVOLSAG = 62;
/**
 * Egyszerre ennyi csík mehet ki. A kijelölés lehet 1600 elemű („mindent
 * kijelöl"), de ennyi csík se nem olvasható, se nem ingyen — a korlát azt
 * garantálja, hogy a rétegnek VAN felső költséghatára. Telítődésnél a listában
 * előrébb álló egységek nyernek: determinisztikusan, nem villódzva.
 */
const MAX_CSIK = 384;

const _szin = new THREE.Color();

export class JelolesEletcsik {
  /**
   * @param {THREE.Object3D} szinter
   * @param {import('../sim/sim.js').Sim} sim
   * @param {{kijeloles:any, sajatCsapat:number}} opciok
   */
  constructor(szinter, sim, opciok) {
    this.kijeloles = opciok.kijeloles || null;
    this.sajatCsapat = opciok.sajatCsapat | 0;

    // A háttér és a töltés két külön raj: a töltés BALRÓL nő, tehát az origója
    // a bal éle (`tablaGeo(true)`), a háttéré ugyanúgy — így a kettő ugyanabból
    // a pontból indul, és nincs elcsúszás a két lap között.
    this.hatter = new Raj(szinter, tablaGeo(true), MAX_CSIK, {
      opacitas: 0.72, sorrend: 6,
    });
    this.toltes = new Raj(szinter, tablaGeo(true), MAX_CSIK, {
      opacitas: 0.98, sorrend: 7,
    });

    this._csapatRgb = new Float32Array(2 * 3);
    for (let cs = 0; cs < 2; cs++) {
      _szin.setHex(CSAPAT_SZIN[cs]);
      this._csapatRgb[cs * 3] = _szin.r;
      this._csapatRgb[cs * 3 + 1] = _szin.g;
      this._csapatRgb[cs * 3 + 2] = _szin.b;
    }
    _szin.setHex(0x0d1014);
    this._hatterRgb = new Float32Array([_szin.r, _szin.g, _szin.b]);

    /** Kire tettünk már csíkot EBBEN a képkockában (számláló-bélyeg). */
    this._belyeg = new Int32Array(sim.maxEgyseg);
    this._kepkocka = 0;
  }

  ujraKot() { this._belyeg.fill(0); this._kepkocka = 0; }

  /**
   * @param {import('../sim/sim.js').Sim} sim
   * @param {import('./jeloles_kozos.js').Pillanatkep} kep
   * @param {{bazis:Float32Array, x:number, y:number, z:number}} nezet
   */
  frissit(sim, kep, nezet) {
    this.hatter.kezd();
    this.toltes.kezd();

    const lista = this.kijeloles ? this.kijeloles.lista : null;
    if (lista && lista.length && sim.harc) this._rajzol(sim, kep, nezet, lista);

    this.hatter.zar();
    this.toltes.zar();
  }

  _rajzol(sim, kep, nezet, lista) {
    const e = sim.egysegek;
    const pa = sim.parancsAllapot;
    this._kepkocka++;
    const kk = this._kepkocka;
    const belyeg = this._belyeg;

    for (let k = 0; k < lista.length; k++) {
      const i = lista[k];
      if (i >= e.db || belyeg[i] === kk) continue;
      belyeg[i] = kk;
      this._csik(sim, kep, nezet, i);
      const cel = pa ? pa.celEgyseg[i] : -1;
      if (cel >= 0 && cel < e.db && belyeg[cel] !== kk) {
        belyeg[cel] = kk;
        this._csik(sim, kep, nezet, cel);
      }
      if (this.toltes.tele) break;
    }
  }

  /** Egy egység csíkja, ha minden feltétel áll. */
  _csik(sim, kep, nezet, i) {
    const e = sim.egysegek;
    const harc = sim.harc;
    if (harc.elo[i] === 0) return;
    const besz = sim.beszallas;
    if (besz && besz.bent[i] === 1) return;
    const maxHp = harc.maxHp[i];
    if (maxHp <= 0) return;
    if (this.toltes.tele) return;

    const bazis = nezet.bazis;
    const x = kep.x(i), y = kep.y(i);
    const magas = sim.racs.magassagPont(x, y);
    const dx = x - nezet.x, dy = magas - nezet.y, dz = y - nezet.z;
    if (dx * dx + dy * dy + dz * dz > TAVOLSAG * TAVOLSAG) return;

    const sajat = this.sajatCsapat;
    if (e.csapat[i] !== sajat && sim.kod && !sim.kod.lathatoPont(sajat, x, y)) return;

    const fejMagas = magas + CSIK_MAGAS[e.tipus[i]];
    // A bal él a középponttól fél szélességgel balra, a kamera JOBB iránya
    // mentén. Enélkül a csík a kamera forgatásakor elcsúszna az egységről.
    const fel = SZELES * 0.5;
    const bx = x - bazis[0] * fel, by = fejMagas - bazis[1] * fel, bz = y - bazis[2] * fel;

    const hr = this._hatterRgb;
    this.hatter.helyezTabla(
      bx - bazis[0] * KERET - bazis[3] * KERET,
      by - bazis[1] * KERET - bazis[4] * KERET,
      bz - bazis[2] * KERET - bazis[5] * KERET,
      SZELES + 2 * KERET, VASTAG + 2 * KERET, bazis,
    );
    this.hatter.szinRgb(hr[0], hr[1], hr[2]);

    let arany = harc.hp[i] / maxHp;
    if (arany > 1) arany = 1; else if (arany < 0) arany = 0;
    // A NULLA szélességű töltés is példány (üres mátrix), ezért a majdnem
    // halott egységnek is marad egy hajszálnyi csíkja — így a csík HELYE
    // megmarad, és nem tűnik el a keret mögül.
    if (arany < 0.02) arany = 0.02;
    const cs = (e.csapat[i] & 1) * 3;
    const cr = this._csapatRgb;
    this.toltes.helyezTabla(bx, by, bz, SZELES * arany, VASTAG, bazis);
    this.toltes.szinRgb(cr[cs], cr[cs + 1], cr[cs + 2]);
  }

  set enabled(v) { this.hatter.lathato = v; this.toltes.lathato = v; }

  get haromszog() { return this.hatter.haromszog + this.toltes.haromszog; }

  bont() { this.hatter.bont(); this.toltes.bont(); }
}
