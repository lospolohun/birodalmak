// AGE OF THE CRYSTALS — KIJELÖLÉS ÉS PARANCS-VISSZAJELZÉS (réteg-gazda).
//
// ── MIÉRT LETT EGY FÁJLBÓL HAT ────────────────────────────────────────────
// A v0.2-ben ez a fájl EGY dolgot csinált: talajgyűrűt rajzolt a kijelölt
// egységek alá, egyetlen `InstancedMesh`-ben. Az akkori döntések (egy raj,
// saját interpoláció, példány-szín) mind helyesek voltak, és egyik sem
// változott. Ami változott, az a FELADAT nagysága.
//
// A v0.16-ban a tulajdonos kipróbálta a játékot, és nem tudott vele mit
// kezdeni. A visszajelzés-hiány konkrét listája:
//   • nem látszik, HOVA adtam parancsot (a legfontosabb hiány)
//   • nem látszik, MELYIK a sajátom (a gyűrű színe állapotot mondott, nem csapatot)
//   • nem látszik, ki mennyire sérült
//   • nem látszik, hova esik a keret a PÁLYÁN, csak a képernyőn
//   • nem látszik, melyik Ctrl-csoportot hívtam elő
//   • az épület alatt karika volt, nem az alapterülete
//
// Hat különböző kérdés, hat különböző adatforrás, hat különböző rajz-módszer.
// Egy fájlban ez néhány verzió alatt olvashatatlan lenne — a projekt ugyanezt
// a hibát már megcsinálta a `hud.js`-szel (lásd az `INTERFACES.md` v0.16-os
// szakaszát). Ezért a rajz `jeloles_*.js` alrétegekbe került, és EZ a fájl
// már csak három dolgot csinál: összeköti őket, egyszer kiszámolja a közös
// bemeneteket (pillanatkép, kamera-bázis, sim-óra), és tartja a
// RÉTEG-SZERZŐDÉST kifelé.
//
// ── A RÉTEG-SZERZŐDÉS, ÉS MIÉRT NEM ALKU TÁRGYA ───────────────────────────
// Kifelé továbbra is EGY réteg vagyunk: `frissit(sim, alfa)` / `set enabled(v)`
// / `get haromszog()`. Az FPS-szonda réteg-bontása ezen áll, és a v0.1 óta
// minden lépcső azért összehasonlítható, mert a bontás nem mozdult. Aki hat
// réteget csinálna a `main.js` `retegek` térképében, az a MÉRÉST rontaná el,
// nem a látványt.
//
// ⚠️ A MÉRÉS ALATT A KIJELÖLÉS ÜRES, TEHÁT ITT NULLA A KÖLTSÉG. Ez nem
// magától igaz, hanem be van tartatva:
//   • üres kijelölésnél a `Pillanatkep` sem másol (a v0.2-ben MÉG másolt,
//     mind az 1600 egységet, minden tickben — az egy valódi, ha kicsi, tétel
//     volt a mérésben)
//   • minden alréteg nulla példányra `visible = false`-ra megy, tehát a
//     jelenet-bejárásból is kiesik, nem csak a rajzolásból
//   • a parancs-figyelő CSAK a kijelölt egységeket nézi, tehát a szonda
//     12 másodpercenkénti tömeges menetparancsa nem indít villanást
//
// ── ⚠️ A `SUGAR` TÁBLA — EBBEN A FÁJLBAN ÉGETT MEG A PROJEKT UTOLJÁRA ────
// A `SUGAR[e.tipus[i]]` EGYENESEN a példány-mátrix három átlós elemébe megy,
// egy `Float32Array`-be. Ha a tábla rövidebb a `TIPUS_DB`-nél, a hiányzó
// típusnál `undefined` jön ki, abból a tömbben NaN lesz — a gyűrű eltűnik vagy
// szemetel, NÉMÁN: nincs kivétel, nincs konzol-üzenet, és a determinizmus-kapu
// is zöld marad, mert a sim nem is tud róla. Pontosan ez történt a nyolc nép
// egyedi egységével (`SUGAR[TIPUS.EGYEDI]` hiányzott), és ugyanez ette meg a
// `LATOTAV`-ot a v0.9/2-ben.
//
// A tábla ezért MARAD ebben a fájlban, nem költözik az alrétegbe: a
// `tools/kiadas_ellenorzo.mjs` `TIPUS_TABLAK` listája ezt a fájlt és ezt a
// nevet őrzi. Az alrétegek PARAMÉTERKÉNT kapják meg — nem importálják —, hogy
// ne keletkezzen körkörös import.
// ÚJ TÍPUS → ÚJ SOR ITT, plusz a `jeloles_eletcsik.js` `CSIK_MAGAS`-ában és a
// `jeloles_csoport.js` `JELVENY_MAGAS`-ában (mindkettő betöltéskor ellenőrzi
// magát, tehát ott hangosan bukik, nem némán).

import { THREE, aktivKamera, feloldJelenet } from './core3d.js';
import { DT } from '../sim/units.js';
import { Pillanatkep, kameraBazis } from './jeloles_kozos.js';
import { JelolesGyuru } from './jeloles_gyuru.js';
import { JelolesParancs, JEL } from './jeloles_parancs.js';
import { JelolesEletcsik } from './jeloles_eletcsik.js';
import { JelolesKontur } from './jeloles_kontur.js';
import { JelolesCsoport } from './jeloles_csoport.js';

/**
 * Egység-típusonkénti gyűrű-sugár — a `units.js` SUGAR tömbjéhez igazítva
 * (ütközési sugár + ~0,12; az ostromgépnél +0,16, hogy a nagy sziluett alól
 * kilátsszon). A hossza KÖTELEZŐEN `TIPUS_DB` — lásd a fejlécet.
 * Sorrend: MUNKAS, LANDZSAS, IJASZ, LOVAG, OSTROMGEP, EGYEDI.
 */
const SUGAR = [0.42, 0.46, 0.44, 0.56, 0.78, 0.48];

export { JEL };

export class Kijeloles3D {
  /**
   * @param {THREE.Scene|any} szinter
   * @param {import('../sim/sim.js').Sim} sim
   * @param {{kijeloles?:import('../ui/kijeloles.js').Kijeloles, bevitel?:any,
   *          kamera?:any, sajatCsapat?:number}} [opciok]
   */
  constructor(szinter, sim, opciok = {}) {
    this.szinter = feloldJelenet(szinter) || szinter;
    this.kijeloles = opciok.kijeloles || null;
    this.kamera = opciok.kamera || null;
    // A saját csapat elsősorban a kijelölés modelljéből jön: az az egyetlen
    // hely, ahol tényleg el van döntve, kinek a szemével nézzük a pályát.
    this.sajatCsapat = (this.kijeloles && this.kijeloles.sajatCsapat !== undefined)
      ? (this.kijeloles.sajatCsapat | 0)
      : ((opciok.sajatCsapat | 0) || 0);
    this._enabled = true;

    this.kep = new Pillanatkep(sim.maxEgyseg);

    const kozos = { kijeloles: this.kijeloles, sajatCsapat: this.sajatCsapat };
    this.gyuru = new JelolesGyuru(this.szinter, sim, { ...kozos, sugar: SUGAR });
    this.parancs = new JelolesParancs(this.szinter, sim, kozos);
    this.eletcsik = new JelolesEletcsik(this.szinter, sim, kozos);
    this.kontur = new JelolesKontur(this.szinter, sim, { ...kozos, bevitel: opciok.bevitel });
    this.csoport = new JelolesCsoport(this.szinter, sim, kozos);
    /** A bontás/kapcsolás sorrendje — a rajz sorrendjét a `renderOrder` dönti. */
    this._reszek = [this.gyuru, this.parancs, this.eletcsik, this.kontur, this.csoport];

    /**
     * A kamera bázisa és helye, képkockánként EGYSZER kiolvasva. A tábla-
     * jelölők (életerő-csík, csoport-jelvény) példányonként ezt olvassák; a
     * mátrixot 1600-szor kiolvasni pont az a fajta észrevétlen költség, ami
     * ebben a projektben már többször bekúszott.
     */
    this._nezet = { bazis: new Float32Array(9), x: 0, y: 0, z: 0 };
  }

  /** Újrafelállás: minden index mást jelent, minden gyorstár hazugság. */
  ujraKot(sim) {
    this.kep.ervenytelenit();
    for (let k = 0; k < this._reszek.length; k++) {
      const r = this._reszek[k];
      if (r.ujraKot) r.ujraKot(sim);
    }
  }

  /**
   * @param {import('../sim/sim.js').Sim} sim
   * @param {number} alfa interpoláció a két tick között, [0,1)
   */
  frissit(sim, alfa) {
    if (!this._enabled) return;

    const a = alfa < 0 ? 0 : (alfa > 1 ? 1 : alfa);
    const lista = this.kijeloles ? this.kijeloles.lista : null;
    // Kell-e egyáltalán interpolált pozíció? Csak akkor, ha van kijelölés,
    // vagy ha még él egy parancs-jelölő a legutóbbi kijelölésből.
    const kell = !!(lista && lista.length) || this.parancs.van;
    this.kep.frissit(sim, a, kell);

    // A sim ÓRÁJA, nem a `performance.now()`: szünetben megáll, lassításban
    // lassul — a jelölő pontosan annyi JÁTÉKIDEIG él, amennyire tervezve van.
    const ido = (sim.tick + a) * DT;

    const kam = this.kamera || aktivKamera();
    const n = this._nezet;
    kameraBazis(kam, n.bazis);
    if (kam) {
      const m = kam.matrixWorld.elements;
      n.x = m[12]; n.y = m[13]; n.z = m[14];
    }

    this.gyuru.frissit(sim, this.kep, ido);
    this.parancs.frissit(sim, this.kep, ido);
    this.eletcsik.frissit(sim, this.kep, n);
    this.kontur.frissit(sim, kam, this.kep.ujTick);
    this.csoport.frissit(sim, this.kep, n, this.kep.ujTick);
  }

  /**
   * KÜLSŐ JELÖLÉS-KÉRÉS — annak a parancsnak, aminek nincs egység-oldali
   * nyoma (épület lerakása, képzés, kutatás). Lásd a `jeloles_parancs.js`
   * fejlécét; ma senki nem hívja, de a kapocs nem igényel átírást.
   */
  jelol(fajta, x, y, sim) {
    const ido = sim ? sim.tick * DT : 0;
    this.parancs.jelol(fajta, x, y, ido);
  }

  /** Épület-alapterület kézi kijelölése (a HUD/panel hívhatja). */
  epuletJeloles(idx) { this.kontur.epuletJeloles(idx); }

  // ── RÉTEG-SZERZŐDÉS ──────────────────────────────────────────────────────

  set enabled(v) {
    this._enabled = !!v;
    for (let k = 0; k < this._reszek.length; k++) this._reszek[k].enabled = this._enabled;
  }
  get enabled() { return this._enabled; }

  get haromszog() {
    if (!this._enabled) return 0;
    let h = 0;
    for (let k = 0; k < this._reszek.length; k++) h += this._reszek[k].haromszog;
    return h;
  }

  bont() {
    for (let k = 0; k < this._reszek.length; k++) this._reszek[k].bont();
  }
}
