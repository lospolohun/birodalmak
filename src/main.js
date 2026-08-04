// AGE OF THE CRYSTALS — BOOT: főmenü → meccs, és a KÉT ÓRA összekötése.
//
// ── A KÉT ÓRA ─────────────────────────────────────────────────────────────
// A játékban KÉT független ütem fut, és ez szándékos:
//
//   SIM    fix 20 Hz, egész tickekben, determinisztikusan (lásd `sim/sim.js`)
//   RENDER amilyen gyorsan a GPU engedi (60, 120, 144 Hz…)
//
// A kettőt egy akkumulátor kapcsolja össze. A render NEM a sim állapotát
// rajzolja ki nyersen, hanem az előző és a mostani tick KÖZÖTT interpolál egy
// `alfa ∈ [0,1)` értékkel. Enélkül 20 Hz-es rándulás látszana 144 Hz-es
// monitoron is — ez a leggyakoribb hiba a fix-tickes motorokban.
//
// A fordítottja is fontos: ha a gép lassú és egy képkocka alatt több tick
// gyűlt fel, azokat egymás után lefuttatjuk — de KORLÁTTAL (`MAX_POTLAS`),
// különben egy pillanatnyi akadás „halál-spirálba" viszi a szimulációt.
//
// ── MIÉRT VAN `window.__aoc` ──────────────────────────────────────────────
// A `tools/fps_szonda.mjs` valódi Chrome-ban, valódi GPU-n méri a játékot, és
// CSAK ezen a horgon keresztül nyúl hozzá. A mérés így ugyanazt a kódot
// terheli, amit a játékos futtat — nincs külön „benchmark mód", ami hazudhat.
//
// ── ⚠️ A FŐMENÜ ÉS A SZONDÁK — A MEGKERÜLŐ ÚT ─────────────────────────────
// A v0.11 óta a játék FŐMENÜVEL indul, a világ pedig csak a menü „Indítás"
// gombjára épül fel. Ez a szondákat megölte volna: azok a `window.__aoc.keszen`
// jelre várnak, és egy kattintásra váró menü mellett soha nem kapnák meg.
//
// Ezért van a `?szonda=1` megkerülő út (és a vele egyenértékű
// `__aoc.menutAtugor()`): ilyenkor a boot AZONNAL felépíti a v0.1 óta mért
// világot — SEED, 256×256, nyílt mező, 1600 egység, civ nélkül, gépi ellenfél
// nélkül, a v0.1-es forgatókönyvvel —, menü nélkül. A `tools/fps_szonda.mjs` és
// a `tools/kep.mjs` ezt a címet nyitja meg. A HANG ilyenkor KIKAPCSOLVA marad:
// gesztus nélkül úgysem szólalna meg, a képkockánkénti súlypont-számolása
// viszont beleszámítana a mérésbe, és a lépcsők elveszítenék az
// összehasonlítási alapjukat.
//
// A `keszen` ezért NEM a lap betöltésére igaz, hanem arra a pillanatra, amikor
// a MECCS fut. Menü-módban a menü indítja el, szonda-módban a boot.

import './ui/alap.css';
import { VERZIO, SEED } from './core/config.js';

import { Mag3D, jegyezdKamera } from './render/core3d.js';
import { Kamera3D } from './render/camera3d.js';
import { Terep3D } from './render/terrain3d.js';
import { Diszlet3D } from './render/props3d.js';
import { Egysegek3D } from './render/units3d.js';
import { Kijeloles3D } from './render/kijeloles3d.js';
import { Gazdasag3D } from './render/gazdasag3d.js';
import { Kod3D } from './render/kod3d.js';
import { Minimap } from './ui/minimap.js';
import { Hud } from './ui/hud.js';
import { Lovedek3D } from './render/lovedek3d.js';
import { Ostrom3D } from './render/ostrom3d.js';
import { Bevitel } from './ui/bevitel.js';
import { Menu } from './ui/menu.js';
import { meccsSim, szondaKonfig, MECCS_ADAG, SZONDA_ADAG } from './ui/meccs.js';
import { Hang } from './audio/hang.js';
import { HangHid } from './ui/hang_hid.js';

/** Egy tick hossza másodpercben — a `sim/sim.js` TICK_HZ-ével egyezik. */
const TICK_HOSSZ = 1 / 20;
/** Egy képkockában legfeljebb ennyi tick pótolható (halál-spirál elleni gát). */
const MAX_POTLAS = 5;

/**
 * A menü hangerő-csúszkájának FELSŐ HATÁRA a mesterhangerőben.
 *
 * A menü 0…100-at ad; ezt nem 1-re képezzük le, hanem ennyire. A hang sosem
 * indulhat el „teli torokból" egy olyan játékban, amit a játékos épp most
 * nyitott meg — a hangos meglepetés az első dolog, amitől valaki lehalkítja az
 * egész fület, és onnantól a v0.12 egésze halott munka.
 */
const HANG_HALKITAS = 0.45;

class Jatek {
  /**
   * @param {HTMLCanvasElement} vaszon
   * @param {import('./sim/sim.js').Sim} sim KÉSZ világ (lásd `ui/meccs.js`)
   * @param {{sajatCsapat?:number, forgatokonyv?:boolean,
   *          hangero?:number, zene?:boolean, hang?:boolean}} [opciok]
   */
  constructor(vaszon, sim, opciok = {}) {
    this.sim = sim;
    this.sajatCsapat = opciok.sajatCsapat ?? 0;
    /**
     * Jár-e a v0.1-es szonda-forgatókönyv? MECCSBEN NEM: a menüből indított
     * játékban a seregeket a játékos és a gépi ellenfél mozgatja, egy
     * 12 másodpercenként mindenkit átküldő menetparancs pont a játékot venné el.
     */
    this.forgatokonyv = !!opciok.forgatokonyv;
    /** Amíg hamis, a szonda-forgatókönyve masíroztatja a seregeket. */
    this.jatekosVezerel = !this.forgatokonyv;
    /** Az utolsó képkocka ideje — a hang-híd ebből kap órát parancsadáskor. */
    this._most = performance.now();

    this.mag = new Mag3D(vaszon);
    // A `sajatCsapat` nem díszítés: ebből tudja a kamera, MELYIK központhoz
    // nézzen induláskor. A pálya közepe a v0.7-es köddel felderítetlen.
    this.kamera = new Kamera3D(vaszon, this.sim, { sajatCsapat: this.sajatCsapat });
    // A LOD és a látómező-vágás MINDEN rétegnek kell — enélkül a terep, a
    // díszlet és a figurák is teljes felbontáson rajzolódnának, és a mérés
    // értelmetlen lenne. Kétféleképp adjuk át: a `core3d` nyilvántartásába
    // (amit a terep és a díszlet olvas) és az opciókban (amit a figurák
    // várnak). Egyik réteg sem maradhat kamera nélkül.
    jegyezdKamera(this.kamera);
    const opciok3d = { kamera: this.kamera, kameraFv: () => this.kamera.objektum };

    // ── v0.12: a hang ──────────────────────────────────────────────────
    // A rétegek ELŐTT jön létre, mert a bevitel hídja már hivatkozik rá. Az
    // `AudioContext` viszont NEM indul el itt: azt a `HangHid` teszi meg, az
    // első felhasználói gesztusra (lásd annak fejlécét).
    this.hang = new Hang(this.sim, {
      sajatCsapat: this.sajatCsapat,
      mester: opciok.hangero ?? 0,
      zene: opciok.zene === false ? 0 : 1,
    });
    this.hang.enabled = opciok.hang !== false;

    // ── v0.2: az irányítás ─────────────────────────────────────────────
    // A bevitel a rétegek ELŐTT készül el, mert a jelölő-réteg a kijelölés
    // modelljét olvassa. A `parancsra` visszahívás az egyetlen kapcsolat
    // visszafelé: ebből tudjuk meg, hogy a játékos átvette az irányítást.
    this.bevitel = new Bevitel(vaszon, this.sim, this.kamera, {
      sajatCsapat: this.sajatCsapat,
      parancsra: () => {
        this.jatekosVezerel = true;
        if (this.hangHid) this.hangHid.parancsra(this._most);
      },
    });

    this.hangHid = opciok.hang === false ? null : new HangHid(this.hang, this.sim, this.bevitel, {
      sajatCsapat: this.sajatCsapat,
      hangero: opciok.hangero ?? 0,
    });

    const szinter = this.mag.scene;
    this.retegek = {
      terep: new Terep3D(szinter, this.sim, opciok3d),
      props: new Diszlet3D(szinter, this.sim, opciok3d),
      egysegek: new Egysegek3D(szinter, this.sim, opciok3d),
      gazdasag: new Gazdasag3D(szinter, this.sim),
      lovedek: new Lovedek3D(szinter, this.sim),
      ostrom: new Ostrom3D(szinter, this.sim),
      kijeloles: new Kijeloles3D(szinter, this.sim, { kijeloles: this.bevitel.kijeloles }),
      // A köd a LEGUTOLSÓ réteg: átlátszó lap, ami mindenre ráborul. A
      // `renderOrder` amúgy is eldönti a sorrendet, de a felsorolás olvassa is
      // magát — aki ide néz, lássa, hogy ez a réteg mindenek fölött van.
      kod: new Kod3D(szinter, this.sim, { sajatCsapat: this.sajatCsapat }),
      // A minimap NEM a 3D szinterben rajzol (saját 2D vászon), de a réteg-
      // szerződést betartja — így a réteg-kapcsoló és az újrafelállás
      // ugyanúgy éri el, mint bármelyik másikat.
      minimap: new Minimap(this.sim, this.kamera, { sajatCsapat: this.sajatCsapat }),
    };

    // ── Óra-állapot ────────────────────────────────────────────────────
    this._maradek = 0;
    this._utolso = performance.now();
    this._most = this._utolso;
    this._simMs = 0;
    this._renderMs = 0;
    /** Mérés közben ide gyűlnek a képkocka-idők. */
    this._mero = null;

    this._hud = new Hud(this.sim, this.bevitel, { sajatCsapat: this.sajatCsapat });
    this._fpsAblak = [];

    this._kotesek();
    this._hurok = this._hurok.bind(this);
    requestAnimationFrame(this._hurok);
  }

  _kotesek() {
    // A szonda-forgatókönyv: 12 másodpercenként a két sereg átmasírozik a
    // pálya másik felére. Ez tartja a mérést a LEGROSSZABB eseten — álló
    // seregen bárki tud 60 FPS-t mérni.
    this._parancsTick = 0;
    addEventListener('resize', () => {
      if (this.mag.atmeret) this.mag.atmeret();
      if (this.kamera.atmeret) this.kamera.atmeret();
    });
  }

  _hurok(most) {
    requestAnimationFrame(this._hurok);
    const dt = Math.min((most - this._utolso) / 1000, 0.25);
    this._utolso = most;
    this._most = most;

    // ── SIM: fix tickek ────────────────────────────────────────────────
    const simKezd = performance.now();
    this._maradek += dt;
    let potolt = 0;
    while (this._maradek >= TICK_HOSSZ && potolt < MAX_POTLAS) {
      // A szonda-forgatókönyv csak addig jár, amíg a játékos hozzá nem nyúl.
      // Enélkül a saját parancsainkat 12 másodpercenként felülírná egy
      // „mindenki a másik oldalra" menet — és úgy az irányítás tesztelhetetlen.
      if (this.forgatokonyv && !this.jatekosVezerel && this.sim.tick >= this._parancsTick) {
        this.sim.szondaParancs();
        this._parancsTick = this.sim.tick + 240; // 240 tick = 12 s
      }
      this.sim.lep();
      this._maradek -= TICK_HOSSZ;
      potolt++;
    }
    if (potolt >= MAX_POTLAS) this._maradek = 0; // ne gyűljön tovább
    this._simMs = performance.now() - simKezd;

    // ── RENDER ─────────────────────────────────────────────────────────
    const alfa = this._maradek / TICK_HOSSZ;
    const rKezd = performance.now();
    if (this.kamera.frissit) this.kamera.frissit(dt);
    for (const nev in this.retegek) {
      const r = this.retegek[nev];
      if (r.frissit) r.frissit(this.sim, alfa, most);
    }
    const kam = this.kamera.objektum || this.kamera.kamera || this.kamera;
    this.mag.rajzol ? this.mag.rajzol(kam) : this.mag.renderer.render(this.mag.scene, kam);
    this._renderMs = performance.now() - rKezd;

    // ── HANG ───────────────────────────────────────────────────────────
    // A RENDER UTÁN, és szándékosan a `_renderMs` mérésén KÍVÜL: a hang nem
    // rajzol, tehát a réteg-bontásban semmi keresnivalója. A hallgató a kamera
    // célpontja — a távolság-vágás ehhez mér.
    if (this.hang.enabled) {
      this.hang.frissit(this.sim, most, this.kamera.x, this.kamera.z);
      if (this.hangHid) this.hangHid.frissit(most);
    }

    this._merestGyujt(dt);
    this._hudFrissit(most);
  }

  _merestGyujt(dt) {
    const ms = dt * 1000;
    this._fpsAblak.push(ms);
    if (this._fpsAblak.length > 90) this._fpsAblak.shift();
    if (this._mero) {
      this._mero.idok.push(ms);
      this._mero.simOsszeg += this._simMs;
      this._mero.renderOsszeg += this._renderMs;
    }
  }

  /**
   * A HUD frissítése. A mérőszámokat INNEN kapja — a `Hud` maga nem olvas
   * `performance.now()`-t és nem nyúl a renderelőhöz, hogy egyetlen dolga
   * maradjon: kiírni, amit kap. (Ugyanaz az elv, ami a render-rétegeknél: egy
   * réteg se szerezzen be magának adatot, amit a gazda úgyis tud.)
   */
  _hudFrissit(most) {
    if (!this._hud) return;
    let osszeg = 0;
    for (let i = 0; i < this._fpsAblak.length; i++) osszeg += this._fpsAblak[i];
    const atlag = osszeg / (this._fpsAblak.length || 1);
    const info = this.mag.renderer ? this.mag.renderer.info.render : { triangles: 0, calls: 0 };
    this._hud.frissit(this.sim, most, {
      fps: 1000 / atlag,
      simMs: this._simMs,
      renderMs: this._renderMs,
      haromszog: info.triangles,
      hivas: info.calls,
    });
  }

  // ── A szonda felülete ────────────────────────────────────────────────

  /**
   * Újrafelállás adott egységszámmal — UGYANAZON a sim-példányon és pályán.
   * A terep, a rács és a memória-elrendezés így változatlan marad, tehát a
   * lépcsők (100/400/800/1600) tényleg összehasonlíthatók.
   */
  egysegSzam(n) {
    const tenyleges = this.sim.ujraFelallas(n);
    this._parancsTick = 0;
    this._maradek = 0;
    // A szonda a lépcsők között hívja ezt, tehát vissza is adjuk neki a
    // vezérlést — különben egy korábbi kézi parancs miatt a mérés álló
    // seregen futna, és hamisan alacsony képkocka-időt adna.
    this.jatekosVezerel = !this.forgatokonyv;
    this.bevitel.ujraKot();
    for (const nev in this.retegek) {
      const r = this.retegek[nev];
      if (r.ujraKot) r.ujraKot(this.sim);
    }
    return tenyleges;
  }

  /** Réteg ki/be — a képkocka-költség bontásához. */
  reteg(nev, be) {
    if (nev === 'viz' && this.retegek.terep && 'vizLathato' in this.retegek.terep) {
      this.retegek.terep.vizLathato = !!be;
      return true;
    }
    // A hang nem a `retegek`-ben ül (más a `frissit()` felülete: valós időt és
    // hallgató-pozíciót kap, nem interpolációs alfát), de a szonda ugyanúgy
    // ki tudja kapcsolni.
    if (nev === 'hang') {
      this.hang.enabled = !!be;
      return true;
    }
    const r = this.retegek[nev];
    if (!r) return false;
    r.enabled = !!be;
    return true;
  }

  /** Mérés `mp` másodpercig. A hívó a Promise-t várja meg. */
  meres(mp) {
    return new Promise((kesz) => {
      this._mero = { idok: [], simOsszeg: 0, renderOsszeg: 0 };
      setTimeout(() => {
        const m = this._mero;
        this._mero = null;
        const idok = m.idok.slice().sort((a, b) => a - b);
        const db = idok.length || 1;
        let osszeg = 0;
        for (let i = 0; i < idok.length; i++) osszeg += idok[i];
        const info = this.mag.renderer ? this.mag.renderer.info.render : { triangles: 0, calls: 0 };
        kesz({
          fps: 1000 / (osszeg / db),
          kepkocka: idok.length,
          atlagMs: osszeg / db,
          p95Ms: idok[Math.min(db - 1, Math.floor(db * 0.95))],
          simMs: m.simOsszeg / db,
          renderMs: m.renderOsszeg / db,
          haromszog: info.triangles,
          rajzhivas: info.calls,
          egyseg: this.sim.egysegek.db,
        });
      }, mp * 1000);
    });
  }
}

// ── Boot ────────────────────────────────────────────────────────────────

const vaszon = document.getElementById('vaszon');

/** A szonda-megkerülő út: `?szonda=1`. Lásd a fejléc ⚠️ szakaszát. */
const SZONDA_MOD = (() => {
  try {
    return new URLSearchParams(location.search).get('szonda') === '1';
  } catch (h) {
    return false;
  }
})();

/** A futó meccs, vagy `null`, amíg a menüben vagyunk. */
let jatek = null;
/** A főmenü, amíg áll. */
let menu = null;
/** A menüben beállított GÉPENKÉNTI beállítások (hangerő, zene). */
let beallitasok = { hangEro: 70, zeneEro: 45 };

/**
 * A MECCS INDÍTÁSA — az egyetlen út a világ felépítéséhez.
 *
 * A menü `onIndit`-ja, a `?szonda=1` boot és a `__aoc.menutAtugor()` mind ide
 * fut be. Egy második út csendben eltérő világot építene, és a v0.8-ban a két
 * gép különbözőt kapna.
 *
 * @returns {boolean} elindult-e
 */
function meccsIndul(konfig, adag, jatekOpciok) {
  if (jatek) return true;
  const e = meccsSim(konfig, adag);
  if (!e.ok) {
    console.error('AOC: a meccs nem indítható —',
      e.hibak.map((h) => h.mezo + ': ' + h.hiba).join(' · '));
    return false;
  }
  if (menu) { menu.bont(); menu = null; }
  jatek = new Jatek(vaszon, e.sim, Object.assign({
    sajatCsapat: konfig.sajatCsapat,
  }, jatekOpciok || {}));
  window.__aoc.keszen = true;
  return true;
}

/** A menüből indított meccs beállításai — a gépenkénti csúszkákból. */
function jatekOpciok() {
  return {
    forgatokonyv: false,
    hang: true,
    hangero: (beallitasok.hangEro / 100) * HANG_HALKITAS,
    zene: beallitasok.zeneEro > 0,
  };
}

window.__aoc = {
  // ⚠️ CSAK a MECCS futásakor igaz — a menüben álló játék nem mérhető. A
  // szondák a `?szonda=1` címet nyitják meg, ahol a boot azonnal meccset indít.
  keszen: false,
  verzio: VERZIO,
  get jatek() { return jatek; },
  egysegSzam: (n) => (jatek ? jatek.egysegSzam(n) : 0),
  reteg: (nev, be) => (jatek ? jatek.reteg(nev, be) : false),
  meres: (mp) => (jatek ? jatek.meres(mp) : Promise.resolve(null)),
  simHash: () => (jatek ? jatek.sim.allapotHash() : 0),
  // Diagnosztika: hány áramlási mezőt kellett tényleg kiszámolni
  mezoSzamitasok: () => (jatek ? jatek.sim.mezoTar.szamitasok : 0),

  // ── v0.2: az irányítás felülete ─────────────────────────────────────
  // Nem a játékhoz kell, hanem hogy az irányítás KÍVÜLRŐL is hajtható legyen
  // (kézi próba a konzolról, később automata felvétel-visszajátszás). Minden
  // ág ugyanazon a parancs-soron megy be, mint az egéré — nincs kerülőút.
  kijeloles: () => (jatek ? jatek.bevitel.kijeloles.lista.slice() : []),
  kijelolMind: () => (jatek ? jatek.bevitel.kijeloles.mind() : 0),
  parancs: (p) => { if (jatek) { jatek.jatekosVezerel = true; jatek.sim.parancs(p); } },
  vezerles: (be) => {
    if (!jatek) return false;
    jatek.jatekosVezerel = !!be;
    return jatek.jatekosVezerel;
  },

  // ── v0.11: a főmenü ─────────────────────────────────────────────────
  get menu() { return menu; },
  /**
   * A MENÜ MEGKERÜLÉSE — a `?szonda=1`-gyel azonos világot indít el.
   * A GPU-szondáknak van, hogy ne kelljen a kezdőképernyőn kattintaniuk.
   */
  menutAtugor: () => meccsIndul(szondaKonfig(), SZONDA_ADAG, {
    forgatokonyv: true, hang: false,
  }),
  /** Meccs indítása tetszőleges menü-konfigból (kézi próba a konzolról). */
  meccsIndit: (konfig) => meccsIndul(konfig, MECCS_ADAG, jatekOpciok()),

  // ── v0.12: a hang ───────────────────────────────────────────────────
  /** Működés-számok: mennyi esemény keletkezett, mennyi szólalt meg. */
  hangStat: () => (jatek && jatek.hang ? jatek.hang.osszesites() : null),
  /** Némítás ki/be — ugyanaz, amit a `Z` billentyű és a bal alsó gomb csinál. */
  hangKapcsol: (be) => (jatek && jatek.hangHid ? jatek.hangHid.kapcsol(be) : false),
};

if (SZONDA_MOD) {
  // A v0.1 óta mért világ, menü nélkül, HANG NÉLKÜL — lásd a fejlécet.
  meccsIndul(szondaKonfig(), SZONDA_ADAG, { forgatokonyv: true, hang: false });
} else {
  menu = new Menu(document.body, {
    seed: SEED,
    onIndit: (konfig) => {
      // A gépenkénti beállításokat a menü BONTÁSA ELŐTT kell kiolvasni.
      beallitasok = menu.allapot.beallitasok();
      meccsIndul(konfig, MECCS_ADAG, jatekOpciok());
    },
  });
}
