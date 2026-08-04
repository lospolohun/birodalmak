// AGE OF THE CRYSTALS — MINIMAP (v0.7/3).
//
// ── 2D VÁSZON, NEM 3D RÉTEG ───────────────────────────────────────────────
// A minimap nem a szinter része: külön `<canvas>` a képernyő sarkában. Ez nem
// kényelmi döntés. Egy 3D-be tett minimap a fő kamera látóterébe kerülne, tehát
// a rajzhívásokat, a hadi ködöt és az árnyékokat is végig kellene vinni rajta —
// mindezt azért, hogy egy 192×192-es képet mutassunk. A 2D vászon `putImageData`
// hívása ezzel szemben egyetlen memória-másolás, GPU-állapotváltás nélkül.
//
// ── MIÉRT NEM KÉPKOCKÁNKÉNT FRISSÜL ───────────────────────────────────────
// A minimap `MINIMAP_MERET²` képpontot ír, és a `minimapAdat` végigmegy a
// terepen, az épületeken és az egységeken. 144 Hz-en ez a v0.1 óta védett
// képkocka-büdzsé jelentős részét elvinné, miközben a kis térképen fél
// másodpercnyi késés ÉSZREVEHETETLEN. Ezért `FRISSITES_MS`-enként rajzolunk.
//
// ── A KATTINTÁS PARANCS-E? NEM ────────────────────────────────────────────
// A minimapra kattintás a KAMERÁT mozgatja, és a kamera nem a szimuláció része.
// Ezért ez az egyetlen felhasználói művelet a projektben, ami NEM megy át a
// parancs-soron — és ez helyes: a v0.8-ban a másik játékos kamerája minket nem
// érdekel, a hálózaton semmi keresnivalója.
//
// (Egységeket a minimapról parancsolni MÁS kérdés lenne — az már parancs, és a
// soron menne. A v0.7 ezt nem tudja; a v0.11 UI-köre hozhatja.)

import { minimapAdat, minimapVilagra, MINIMAP_MERET } from './minimap_adat.js';

/** Ennyi ezredmásodpercenként rajzolunk újra. */
const FRISSITES_MS = 250;

export class Minimap {
  /**
   * @param {import('../sim/sim.js').Sim} sim
   * @param {{kozepre?:(x:number,y:number)=>void}} kamera
   * @param {{sajatCsapat?:number}} [opciok]
   */
  constructor(sim, kamera, opciok = {}) {
    this.sim = sim;
    this.kamera = kamera;
    this.csapat = opciok.sajatCsapat ?? 0;
    this._enabled = true;
    this._utolso = -1e9;
    /** A legutóbbi rajzolás működés-számai — a HUD ezt is mutathatja. */
    this.szamlalo = { terep: 0, nyers: 0, egyseg: 0, epulet: 0, sotet: 0, kodos: 0, rejtett: 0 };

    if (typeof document === 'undefined') { this.vaszon = null; return; }
    const v = document.createElement('canvas');
    v.id = 'minimap';
    v.width = MINIMAP_MERET;
    v.height = MINIMAP_MERET;
    document.body.appendChild(v);
    this.vaszon = v;
    this.ctx = v.getContext('2d');
    this._kep = this.ctx.createImageData(MINIMAP_MERET, MINIMAP_MERET);
    this._puffer = this._kep.data;

    const kattint = (ev) => {
      const r = v.getBoundingClientRect();
      // A vászon MEGJELENÍTETT mérete eltérhet a képpont-méretétől (CSS), ezért
      // a kattintást a téglalap arányából számoljuk, nem az `offsetX`-ből.
      const px = ((ev.clientX - r.left) / r.width) * MINIMAP_MERET;
      const py = ((ev.clientY - r.top) / r.height) * MINIMAP_MERET;
      const p = minimapVilagra(this.sim, px, py);
      if (this.kamera && this.kamera.kozepre) this.kamera.kozepre(p.x, p.y);
    };
    v.addEventListener('pointerdown', kattint);
    this._bont = () => v.removeEventListener('pointerdown', kattint);
  }

  /**
   * Képkocka. A `most` a hívó órája (`performance.now()`) — a minimap NEM
   * kérdez időt magától, mert így a szonda is tudja léptetni.
   */
  frissit(sim, alfa, most) {
    if (!this._enabled || !this.vaszon) return;
    const t = most === undefined ? performance.now() : most;
    if (t - this._utolso < FRISSITES_MS) return;
    this._utolso = t;
    this.szamlalo = minimapAdat(sim, this._puffer, this.csapat);
    this.ctx.putImageData(this._kep, 0, 0);
  }

  /** Újrafelállás: a következő képkockán mindenképp rajzoljunk. */
  ujraKot() { this._utolso = -1e9; }

  set enabled(v) {
    this._enabled = !!v;
    if (this.vaszon) this.vaszon.style.display = v ? '' : 'none';
  }
  get enabled() { return this._enabled; }
  /** A szerződés miatt van: a minimap nem a 3D szinterben rajzol. */
  get haromszog() { return 0; }
}
