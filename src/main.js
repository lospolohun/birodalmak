// AGE OF THE CRYSTALS — BOOT és a KÉT ÓRA összekötése.
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

import './ui/alap.css';
import { Sim } from './sim/sim.js';
import { VERZIO, PALYA_N, CEL_EGYSEG, SEED } from './core/config.js';

import { Mag3D, jegyezdKamera } from './render/core3d.js';
import { Kamera3D } from './render/camera3d.js';
import { Terep3D } from './render/terrain3d.js';
import { Diszlet3D } from './render/props3d.js';
import { Egysegek3D } from './render/units3d.js';

/** Egy tick hossza másodpercben — a `sim/sim.js` TICK_HZ-ével egyezik. */
const TICK_HOSSZ = 1 / 20;
/** Egy képkockában legfeljebb ennyi tick pótolható (halál-spirál elleni gát). */
const MAX_POTLAS = 5;

class Jatek {
  constructor(vaszon) {
    this.sim = new Sim({ seed: SEED, n: PALYA_N, maxEgyseg: 2400 });
    this.sim.szondaFelallas(CEL_EGYSEG);

    this.mag = new Mag3D(vaszon);
    this.kamera = new Kamera3D(vaszon, this.sim);
    // A LOD és a látómező-vágás MINDEN rétegnek kell — enélkül a terep, a
    // díszlet és a figurák is teljes felbontáson rajzolódnának, és a mérés
    // értelmetlen lenne. Kétféleképp adjuk át: a `core3d` nyilvántartásába
    // (amit a terep és a díszlet olvas) és az opciókban (amit a figurák
    // várnak). Egyik réteg sem maradhat kamera nélkül.
    jegyezdKamera(this.kamera);
    const opciok = { kamera: this.kamera, kameraFv: () => this.kamera.objektum };

    const szinter = this.mag.scene;
    this.retegek = {
      terep: new Terep3D(szinter, this.sim, opciok),
      props: new Diszlet3D(szinter, this.sim, opciok),
      egysegek: new Egysegek3D(szinter, this.sim, opciok),
    };

    // ── Óra-állapot ────────────────────────────────────────────────────
    this._maradek = 0;
    this._utolso = performance.now();
    this._simMs = 0;
    this._renderMs = 0;
    /** Mérés közben ide gyűlnek a képkocka-idők. */
    this._mero = null;

    this._hud = document.getElementById('hud');
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

    // ── SIM: fix tickek ────────────────────────────────────────────────
    const simKezd = performance.now();
    this._maradek += dt;
    let potolt = 0;
    while (this._maradek >= TICK_HOSSZ && potolt < MAX_POTLAS) {
      if (this.sim.tick >= this._parancsTick) {
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
      if (r.frissit) r.frissit(this.sim, alfa);
    }
    const kam = this.kamera.objektum || this.kamera.kamera || this.kamera;
    this.mag.rajzol ? this.mag.rajzol(kam) : this.mag.renderer.render(this.mag.scene, kam);
    this._renderMs = performance.now() - rKezd;

    this._merestGyujt(dt);
    this._hudFrissit();
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

  _hudFrissit() {
    if (!this._hud) return;
    let osszeg = 0;
    for (let i = 0; i < this._fpsAblak.length; i++) osszeg += this._fpsAblak[i];
    const atlag = osszeg / (this._fpsAblak.length || 1);
    const info = this.mag.renderer ? this.mag.renderer.info.render : { triangles: 0, calls: 0 };
    this._hud.textContent =
      'AGE OF THE CRYSTALS v' + VERZIO +
      '  ·  ' + (1000 / atlag).toFixed(0) + ' FPS (' + atlag.toFixed(1) + ' ms)' +
      '  ·  egység: ' + this.sim.egysegek.db +
      '  ·  tick: ' + this.sim.tick +
      '  ·  sim ' + this._simMs.toFixed(2) + ' ms / render ' + this._renderMs.toFixed(2) + ' ms' +
      '  ·  △ ' + (info.triangles / 1000).toFixed(0) + 'k / ' + info.calls + ' hívás';
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
const jatek = new Jatek(vaszon);

window.__aoc = {
  keszen: true,
  verzio: VERZIO,
  jatek,
  egysegSzam: (n) => jatek.egysegSzam(n),
  reteg: (nev, be) => jatek.reteg(nev, be),
  meres: (mp) => jatek.meres(mp),
  simHash: () => jatek.sim.allapotHash(),
  // Diagnosztika: hány áramlási mezőt kellett tényleg kiszámolni
  mezoSzamitasok: () => jatek.sim.mezoTar.szamitasok,
};
