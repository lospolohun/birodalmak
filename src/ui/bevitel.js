// AGE OF THE CRYSTALS — EGÉR ÉS BILLENTYŰ → PARANCS.
//
// ── EZ A RÉTEG NEM DÖNT SEMMIT A VILÁGRÓL ─────────────────────────────────
// Minden, amit a játékos csinál, PARANCCSÁ alakul és a soron megy be
// (`sim.parancs(...)`). Egyetlen helyen sem írunk sim-állapotot közvetlenül —
// se pozíciót, se célt, se állást. Ez unalmasan hangzik, de ez a v0.8 netcode
// előfeltétele: ha a bemenet bármit MEGKERÜLNE, az a hálózaton nem menne át, és
// a két gép azonnal széttartana.
//
// A parancs ráadásul nem is azonnal hat: a `Sim.parancs()` a `tick +
// KESLELTETES`-re sorolja. Egyjátékosban is. Ez szándékos — így a v0.8-ban nem
// derül ki hirtelen, hogy a játék „ragadósnak" érződik a bemenet-késleltetéstől.
//
// ── A JOBB GOMB KÉT GAZDÁJA ───────────────────────────────────────────────
// A `camera3d.js` a jobb gomb HÚZÁSÁRA forgat, az RTS-hagyomány szerint viszont
// a jobb KATTINTÁS a parancs. A kettő megfér, ha nem a lenyomásra, hanem a
// FELENGEDÉSRE döntünk: ha az egér közben alig mozdult, az kattintás (parancs),
// ha sokat, az forgatás volt (a kamera már el is végezte). Így egyetlen sort sem
// kellett a kamerában átírni.
//
// ── BILLENTYŰK ────────────────────────────────────────────────────────────
// A `camera3d.js` már foglalja: W A S D, nyilak, Q E, szóköz, +/-. Az itteni
// kiosztás ezeket szándékosan KERÜLI — ezért nem `A` az attack-move, ahogy a
// műfajban szokás. Egy ütköző billentyű nem „apró kényelmetlenség": menet
// közben a kamera is elindulna, és a játékos azt hinné, elromlott a játék.
//
//   bal gomb húzás    keret-kijelölés          (Shift: hozzáadás)
//   bal gomb kattintás  egy egység kijelölése  (Shift: hozzáadás)
//   jobb gomb         menet a kattintott pontra
//   Shift + jobb gomb támadó menet
//   T                 a következő jobb kattintás támadó menet
//   X                 megállás
//   H                 tartás (állás-parancs)
//   F                 alakzat léptetése   (négyzet → vonal → ék → szórt)
//   G                 állás léptetése     (agresszív → védekező → tartás → tűzszünet)
//   1..9, 0           csoport előhívása   (kétszer gyorsan: kamera oda)
//   Ctrl + 1..9, 0    csoport mentése
//   B                 raktár lerakása a kurzor alá        (v0.3)
//   K                 korszakváltás indítása              (v0.3)
//   N                 ház      (népesség +10)             (v0.5)
//   L                 laktanya (lándzsás)                 (v0.5)
//   J                 íjászda  (íjász)                    (v0.5)
//   I                 istálló  (lovag)                    (v0.5)
//   O                 ostromműhely (ostromgép)            (v0.5)
//   Y                 torony   (magától lő, őrséggel többet)  (v0.5/3)
//   P                 piac     (nyersanyag-csere)          (v0.5/3)
//   M                 piaci csere: 100 fa → 70 kő          (v0.5/3)
//   C                 KÉPZÉS a kurzorhoz legközelebbi saját épületben (v0.5)
//   R                 KUTATÁS ugyanott — a sorban első kutatható (v0.5/4)
//   F5 / F9           mentés / betöltés (v0.7/2)
//
// A jobb gomb v0.3 óta KÉT dolgot jelent, a kattintott dologtól függően:
// nyersanyagra kattintva gyűjtés, minden más esetben menet.

import { Kijeloles, talajPont, KERET_KUSZOB } from './kijeloles.js';
import { ALAKZAT, ALAKZAT_NEV } from '../sim/alakzat.js';
import { ALLAS, ALLAS_NEV } from '../sim/parancsallapot.js';
import { NYERS, NYERS_NEV } from '../sim/eroforras.js';
import { EPULET, EPULET_NEV } from '../sim/epuletek.js';
import { TECH_DB, TECH_NEV, TECH_LEIRAS, techEpulete } from '../sim/technologia.js';
import { mentesSzoveg, betoltesSzoveg } from '../sim/mentes.js';
import { KORSZAK_NEV } from '../sim/gazdasag.js';
import { TIPUS, TIPUS_DB } from '../sim/units.js';

/** A böngésző-tároló kulcsa a mentéshez. */
const MENTES_KULCS = 'aotc-mentes';

/** Ezen belül két csoport-gombnyomás dupla kattintásnak számít (ms). */
const DUPLA_MS = 350;

export class Bevitel {
  /**
   * @param {HTMLCanvasElement} vaszon
   * @param {import('../sim/sim.js').Sim} sim
   * @param {import('../render/camera3d.js').Kamera3D} kamera
   * @param {{sajatCsapat?:number, parancsra?:()=>void}} [opciok]
   */
  constructor(vaszon, sim, kamera, opciok = {}) {
    this.vaszon = vaszon;
    this.sim = sim;
    this.kamera = kamera;
    this.kijeloles = new Kijeloles(sim, opciok.sajatCsapat ?? 0);
    /** A gazda (main.js) értesítése: a játékos átvette az irányítást. */
    this._parancsra = opciok.parancsra || null;

    /** A kijelölés alakzata és állása — a HUD ezt mutatja, a parancs ezt küldi. */
    this.alakzat = ALAKZAT.NEGYZET;
    this.allas = ALLAS.AGRESSZIV;
    /** A `T` billentyű állította egyszeri támadó-menet mód. */
    this.tamadoMod = false;

    // ── Húzás-állapot ────────────────────────────────────────────────
    this._huz = false;
    this._huzX = 0; this._huzY = 0;
    this._mostX = 0; this._mostY = 0;
    this._jobbX = 0; this._jobbY = 0;
    this._jobbLent = false;
    this._utolsoCsoport = -1;
    this._utolsoCsoportIdo = 0;

    /** Újrahasznosított kimenő pont — hogy a kattintás se allokáljon. */
    this._pont = { x: 0, y: 0 };

    this._keret = this._keretElem();
    this._kotesek();
  }

  /** A kijelölő keret DOM-eleme. Azért DOM és nem 3D: nulla GPU-költség. */
  _keretElem() {
    if (typeof document === 'undefined') return null;
    const d = document.createElement('div');
    d.id = 'kijelolo-keret';
    d.style.display = 'none';
    document.body.appendChild(d);
    return d;
  }

  // ── ESEMÉNYEK ──────────────────────────────────────────────────────────

  _kotesek() {
    this._bontok = [];
    const v = this.vaszon;
    if (!v || typeof window === 'undefined') return;

    const le = (ev) => {
      if (ev.button === 0) {
        this._huz = true;
        this._huzX = ev.offsetX; this._huzY = ev.offsetY;
        this._mostX = ev.offsetX; this._mostY = ev.offsetY;
      } else if (ev.button === 2) {
        // Csak megjegyezzük, hol kezdődött — a döntés a felengedésnél lesz.
        this._jobbLent = true;
        this._jobbX = ev.offsetX; this._jobbY = ev.offsetY;
      }
    };

    const mozog = (ev) => {
      this._mostX = ev.offsetX; this._mostY = ev.offsetY;
      if (this._huz) this._keretRajz();
    };

    const fel = (ev) => {
      if (ev.button === 0 && this._huz) {
        this._huz = false;
        this._keretRejt();
        const dx = ev.offsetX - this._huzX, dy = ev.offsetY - this._huzY;
        const hozzaadva = ev.shiftKey;
        if (Math.abs(dx) < KERET_KUSZOB && Math.abs(dy) < KERET_KUSZOB) {
          this._kattintasKijelol(ev.offsetX, ev.offsetY, hozzaadva);
        } else {
          this._keretKijelol(this._huzX, this._huzY, ev.offsetX, ev.offsetY, hozzaadva);
        }
      } else if (ev.button === 2 && this._jobbLent) {
        this._jobbLent = false;
        const dx = ev.offsetX - this._jobbX, dy = ev.offsetY - this._jobbY;
        // Elmozdult → az a kamera forgatása volt, nem parancs (lásd a fejlécet).
        if (Math.abs(dx) < KERET_KUSZOB && Math.abs(dy) < KERET_KUSZOB) {
          this._menetParancs(ev.offsetX, ev.offsetY, ev.shiftKey || this.tamadoMod);
          this.tamadoMod = false;
        }
      }
    };

    // A vászonról kicsúszó húzást is le kell zárni, különben a keret ottmarad.
    const vak = () => {
      if (this._huz) { this._huz = false; this._keretRejt(); }
      this._jobbLent = false;
    };

    const gomb = (ev) => this._billentyu(ev);

    v.addEventListener('pointerdown', le);
    v.addEventListener('pointermove', mozog);
    window.addEventListener('pointerup', fel);
    window.addEventListener('blur', vak);
    window.addEventListener('keydown', gomb);
    this._bontok.push(() => {
      v.removeEventListener('pointerdown', le);
      v.removeEventListener('pointermove', mozog);
      window.removeEventListener('pointerup', fel);
      window.removeEventListener('blur', vak);
      window.removeEventListener('keydown', gomb);
    });
  }

  // ── KIJELÖLÉS ──────────────────────────────────────────────────────────

  _meret() {
    const v = this.vaszon;
    return { szel: v.clientWidth || v.width || 1, mag: v.clientHeight || v.height || 1 };
  }

  _kattintasKijelol(x, y, hozzaadva) {
    const { szel, mag } = this._meret();
    this.kijeloles.kattintasbol(this.kamera.objektum, x, y, szel, mag, hozzaadva);
    this._szinkron();
  }

  _keretKijelol(x0, y0, x1, y1, hozzaadva) {
    const { szel, mag } = this._meret();
    this.kijeloles.keretbol(this.kamera.objektum, x0, y0, x1, y1, szel, mag, hozzaadva);
    this._szinkron();
  }

  /**
   * A kijelölés megváltozott: az alakzat/állás kijelzőt a KIJELÖLÉS első
   * egységéhez igazítjuk, hogy a HUD azt mutassa, ami tényleg érvényes rá —
   * ne azt, amit legutóbb beállítottunk egy másik csoporton.
   */
  _szinkron() {
    const l = this.kijeloles.lista;
    if (!l.length) return;
    const pa = this.sim.parancsAllapot;
    this.alakzat = pa.alakzat[l[0]];
    this.allas = pa.allas[l[0]];
  }

  // ── PARANCSOK ──────────────────────────────────────────────────────────

  /** Világpont a kurzor alatt, vagy `null`, ha az égre mutat. */
  _celPont(x, y) {
    const { szel, mag } = this._meret();
    const ndcX = (x / szel) * 2 - 1;
    const ndcY = -((y / mag) * 2 - 1);
    if (!talajPont(this.kamera.objektum, this.sim.racs, ndcX, ndcY, this._pont)) return null;
    return this._pont;
  }

  /**
   * A jobb kattintás értelmezése. Egyetlen gomb, két jelentés — a KATTINTOTT
   * DOLOG dönt, ahogy a műfajban megszokott:
   *
   *   nyersanyagra + van kijelölt munkás → gyűjtés
   *   minden más esetben                 → menet / támadó menet
   *
   * A „van-e ott nyersanyag" kérdést a sim válaszolja meg (`eroforrasok.keres`),
   * nem a render — így a kattintás ugyanazt találja el, amit a szimuláció lát,
   * és nem a kamera-távolságtól függő látványt.
   */
  _menetParancs(x, y, tamado) {
    if (!this.kijeloles.db) return;
    const p = this._celPont(x, y);
    if (!p) return;

    if (!tamado) {
      const node = this.sim.eroforrasok.keres(-1, p.x, p.y, 3);
      if (node >= 0 && this._vanMunkas()) {
        this._ad({
          fajta: 'gyujt',
          egysegek: this._masolat(),
          x: this.sim.eroforrasok.x[node],
          y: this.sim.eroforrasok.y[node],
          nyers: this.sim.eroforrasok.fajta[node],
        });
        return;
      }
    }

    this._ad({
      fajta: tamado ? 'tamado_menet' : 'menet',
      egysegek: this._masolat(),
      x: p.x, y: p.y,
      alakzat: this.alakzat,
    });
  }

  /** Van-e munkás a kijelölésben? A gyűjtés csak rájuk értelmes. */
  _vanMunkas() {
    const l = this.kijeloles.lista;
    const e = this.sim.egysegek;
    for (let k = 0; k < l.length; k++) if (e.tipus[l[k]] === TIPUS.MUNKAS) return true;
    return false;
  }

  /** Épület lerakása a kurzor alá. Az árat és a helyet a sim ellenőrzi. */
  _epitParancs(tipus) {
    const p = this._celPont(this._mostX, this._mostY);
    if (!p) return;
    this._ad({
      fajta: 'epit', csapat: this.kijeloles.sajatCsapat,
      tipus, x: p.x, y: p.y,
    });
    this._uzenet = EPULET_NEV[tipus] + ' — lerakva (ha telt rá és szabad a hely)';
  }

  /**
   * KÉPZÉS a kurzorhoz legközelebbi SAJÁT, kész épületben.
   *
   * MIÉRT ÍGY, ÉS NEM ÉPÜLET-KIJELÖLÉSSEL: az épület-kijelölés önálló UI-réteg
   * (kattintható épület, panel, gombsor), és az a v0.7-es rendes HUD dolga. Egy
   * gombhoz kötött „a kurzor alatti épület képez" viszont MOST teszi
   * kipróbálhatóvá a v0.5-öt — enélkül a képzés csak a szondából volna látható.
   */
  _kepzesParancs() {
    const p = this._celPont(this._mostX, this._mostY);
    if (!p) return;
    const ep = this.sim.epuletek;
    const cs = this.kijeloles.sajatCsapat;
    let legjobb = -1, legjobbD2 = 40 * 40;
    for (let i = 0; i < ep.db; i++) {
      if (ep.csapat[i] !== cs || !ep.kesz(i)) continue;
      const dx = ep.x[i] - p.x, dy = ep.y[i] - p.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < legjobbD2) { legjobbD2 = d2; legjobb = i; }
    }
    if (legjobb < 0) { this._uzenet = 'nincs saját épület a kurzor közelében'; return; }
    // Mit képez ez az épület? A `Kepzes` tudja — végigpróbáljuk a típusokat.
    //
    // ⚠️ AZ ALAPEGYSÉG VAN ELÖL, AZ EGYEDI (v0.9/2) HÁTUL — fordítva, mint a
    // gépnél. A gyorsbillentyű EGY parancsot ad, és ha az egyedi egységet
    // rendelné meg, a játékos elveszítené a hozzáférést az olcsó lándzsáshoz
    // ugyanazon az épületen. A típus-választó felület a v0.11 menüjének dolga;
    // addig a gyorsbillentyű a megszokottat adja, az egyedi egység pedig ott
    // érhető el, ahol csak ő képezhető.
    for (let t = 0; t < TIPUS_DB; t++) {
      if (this.sim.kepzes.kepezheti(ep.tipus[legjobb], t, cs)) {
        this._ad({ fajta: 'kepzes', csapat: cs, epulet: legjobb, egyseg: t });
        this._uzenet = EPULET_NEV[ep.tipus[legjobb]] + ' — sorba állítva';
        return;
      }
    }
    this._uzenet = EPULET_NEV[ep.tipus[legjobb]] + ' nem képez egységet';
  }

  /**
   * MENTÉS a böngésző tárolójába (v0.7/2).
   *
   * Egyetlen rekesz, felülíródik — a több mentés-hely a v0.11 főmenüjének
   * dolga, mert ott van hozzá felület. Ami itt fontos: a mentés a SIM-ből
   * megy, a UI csak elindítja. A képernyő állapota (kamera, kijelölés) nincs
   * benne, és ez szándékos — a v0.8-ban a mentést a HÁLÓZAT is használni
   * fogja újracsatlakozáshoz, oda pedig nem tartozik, hogy a másik játékos
   * épp hova nézett.
   */
  _mentes() {
    try {
      localStorage.setItem(MENTES_KULCS, mentesSzoveg(this.sim));
      this._uzenet = 'mentve (' + this.sim.tick + '. tick)';
    } catch (h) {
      // A tároló megtelhet vagy tiltott lehet — ez nem összeomlás-ok.
      this._uzenet = 'a mentés nem fért el a böngésző tárolójában';
    }
  }

  /** BETÖLTÉS. A `Sim` maga utasítja el, ami nem hozzá való. */
  _betoltes() {
    const sz = localStorage.getItem(MENTES_KULCS);
    if (!sz) { this._uzenet = 'nincs mentés'; return; }
    const e = betoltesSzoveg(this.sim, sz);
    if (!e.ok) { this._uzenet = 'betöltés: ' + e.hiba; return; }
    // A kijelölés INDEXEKET tart, és a betöltött világban azok mást
    // jelentenek. Eldobjuk — ez a v0.5/1 generációs tanulságának UI-oldali
    // párja: az elavult hivatkozást nem elrontani kell, hanem elengedni.
    this.kijeloles.urit();
    this._uzenet = 'betöltve (' + this.sim.tick + '. tick)';
  }

  /**
   * PIACI CSERE (v0.5/3) — egyetlen billentyűvel: 100 fa → 70 kő.
   *
   * Szándékosan a legegyszerűbb változat, mert a v0.5-ben még nincs épület-
   * panel, ahol fajtát és mennyiséget lehetne választani; az a v0.7 UI-köréé.
   * Enélkül viszont a piac a JÁTÉKOS számára halott épület lenne: a szonda
   * járatja, de kézzel senki nem tudná használni.
   */
  _csereParancs() {
    const cs = this.kijeloles.sajatCsapat;
    let piac = -1;
    const ep = this.sim.epuletek;
    for (let i = 0; i < ep.db; i++) {
      if (ep.csapat[i] === cs && ep.kesz(i) && ep.tipus[i] === EPULET.PIAC) { piac = i; break; }
    }
    if (piac < 0) { this._uzenet = 'nincs kész piac — a csere elveszne'; return; }
    this._ad({ fajta: 'csere', csapat: cs, ad: NYERS.FA, kap: NYERS.KO, mennyiseg: 100 });
    this._uzenet = 'piac: 100 fa → 70 kő';
  }

  /**
   * KUTATÁS (v0.5/4) a kurzorhoz legközelebbi saját épületben — a SORBAN első
   * olyan technológiát indítja, amit az az épület kutathat, és még nincs kész.
   *
   * Ugyanaz a minta, mint a `C` képzésnél: a v0.5-ben még nincs épület-panel,
   * ahol listából lehetne választani (az a v0.7 UI-köre). Ez viszont elég
   * ahhoz, hogy a technológiafa ne csak a szonda számára létezzen.
   */
  _kutatasParancs() {
    const p = this._celPont(this._mostX, this._mostY);
    if (!p) return;
    const ep = this.sim.epuletek;
    const cs = this.kijeloles.sajatCsapat;
    let legjobb = -1, legjobbD2 = 40 * 40;
    for (let i = 0; i < ep.db; i++) {
      if (ep.csapat[i] !== cs || !ep.kesz(i)) continue;
      const dx = ep.x[i] - p.x, dy = ep.y[i] - p.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < legjobbD2) { legjobbD2 = d2; legjobb = i; }
    }
    if (legjobb < 0) { this._uzenet = 'nincs saját épület a kurzor közelében'; return; }
    for (let t = 0; t < TECH_DB; t++) {
      if (techEpulete(t) !== ep.tipus[legjobb]) continue;
      if (this.sim.technologia.allapot[cs * TECH_DB + t] !== 0) continue;
      this._ad({ fajta: 'kutatas', csapat: cs, tech: t, epulet: legjobb });
      this._uzenet = TECH_NEV[t] + ' — kutatás indul (' + TECH_LEIRAS[t] + ')';
      return;
    }
    this._uzenet = EPULET_NEV[ep.tipus[legjobb]] + ': nincs több kutatnivaló';
  }

  /**
   * A parancsba a kijelölés MÁSOLATA megy, nem maga a tömb. MIÉRT: a parancs
   * `KESLELTETES` tickig a sorban ül, és ha közben átjelölök, a végrehajtás már
   * az ÚJ kijelölésre futna le. Ez a fajta hiba játékban „szellem-parancsként"
   * jelentkezik, és nagyon nehéz megtalálni.
   */
  _masolat() {
    const l = this.kijeloles.lista;
    const ki = new Array(l.length);
    for (let k = 0; k < l.length; k++) ki[k] = l[k];
    return ki;
  }

  _ad(parancs) {
    this.sim.parancs(parancs);
    if (this._parancsra) this._parancsra();
  }

  // ── BILLENTYŰK ─────────────────────────────────────────────────────────

  _billentyu(ev) {
    // A csoport-gombok. `ev.code` és nem `ev.key`: a `key` a billentyűkiosztástól
    // függ, a `code` a fizikai gombtól — magyar kiosztáson is ugyanaz.
    if (ev.code.startsWith('Digit')) {
      const n = Number(ev.code.slice(5));
      if (!Number.isNaN(n)) {
        ev.preventDefault();
        if (ev.ctrlKey || ev.metaKey) this._csoportMent(n);
        else this._csoportBetolt(n, ev.shiftKey);
        return;
      }
    }
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;

    switch (ev.code) {
      case 'KeyT':
        this.tamadoMod = !this.tamadoMod;
        break;
      case 'KeyX':
        if (this.kijeloles.db) this._ad({ fajta: 'allj', egysegek: this._masolat() });
        break;
      case 'KeyH':
        if (this.kijeloles.db) this._ad({ fajta: 'tartas', egysegek: this._masolat() });
        break;
      case 'KeyF':
        this.alakzat = (this.alakzat + 1) & 3;
        if (this.kijeloles.db) {
          this._ad({ fajta: 'alakzat', egysegek: this._masolat(), alakzat: this.alakzat });
        }
        break;
      case 'KeyG':
        this.allas = (this.allas + 1) & 3;
        if (this.kijeloles.db) {
          this._ad({ fajta: 'allas', egysegek: this._masolat(), allas: this.allas });
        }
        break;
      case 'KeyB': this._epitParancs(EPULET.RAKTAR); break;
      case 'KeyN': this._epitParancs(EPULET.HAZ); break;
      case 'KeyL': this._epitParancs(EPULET.LAKTANYA); break;
      case 'KeyJ': this._epitParancs(EPULET.IJASZDA); break;
      case 'KeyI': this._epitParancs(EPULET.ISTALLO); break;
      case 'KeyO': this._epitParancs(EPULET.OSTROMMUHELY); break;
      case 'KeyY': this._epitParancs(EPULET.TORONY); break;
      case 'KeyP': this._epitParancs(EPULET.PIAC); break;
      case 'KeyM': this._csereParancs(); break;
      case 'KeyC': this._kepzesParancs(); break;
      case 'KeyR': this._kutatasParancs(); break;
      case 'F5': this._mentes(); break;
      case 'F9': this._betoltes(); break;
      case 'KeyK':
        this._ad({ fajta: 'korszak', csapat: this.kijeloles.sajatCsapat });
        break;
      default:
        return;
    }
    ev.preventDefault();
  }

  _csoportMent(n) {
    this.kijeloles.csoportMent(n);
  }

  _csoportBetolt(n, hozzaadva) {
    this.kijeloles.csoportBetolt(n, hozzaadva);
    this._szinkron();
    // Dupla nyomás UGYANARRA a csoportra: a kamera odaugrik. Klasszikus RTS
    // kényelem, és a `performance.now()` itt szabad — ez nem a sim.
    const most = performance.now();
    if (this._utolsoCsoport === n && (most - this._utolsoCsoportIdo) < DUPLA_MS) {
      const k = this.kijeloles.csoportKozep(n);
      if (k && this.kamera.kozepre) this.kamera.kozepre(k.x, k.y);
    }
    this._utolsoCsoport = n;
    this._utolsoCsoportIdo = most;
  }

  // ── KERET-RAJZ ─────────────────────────────────────────────────────────

  _keretRajz() {
    const d = this._keret;
    if (!d) return;
    const x0 = Math.min(this._huzX, this._mostX), x1 = Math.max(this._huzX, this._mostX);
    const y0 = Math.min(this._huzY, this._mostY), y1 = Math.max(this._huzY, this._mostY);
    if ((x1 - x0) < KERET_KUSZOB && (y1 - y0) < KERET_KUSZOB) { d.style.display = 'none'; return; }
    d.style.display = 'block';
    d.style.left = x0 + 'px';
    d.style.top = y0 + 'px';
    d.style.width = (x1 - x0) + 'px';
    d.style.height = (y1 - y0) + 'px';
  }

  _keretRejt() {
    if (this._keret) this._keret.style.display = 'none';
  }

  // ── HUD ────────────────────────────────────────────────────────────────

  /** Egysoros állapot a HUD-nak. */
  hudSzoveg() {
    const db = this.kijeloles.db;
    if (!db) return 'kijelölés: — · húzz keretet a bal gombbal';
    return 'kijelölés: ' + db
      + ' · alakzat: ' + ALAKZAT_NEV[this.alakzat]
      + ' · állás: ' + ALLAS_NEV[this.allas]
      + (this.tamadoMod ? ' · TÁMADÓ MENET' : '');
  }

  /** A gazdaság sora a HUD-nak (v0.3). */
  /** A legutóbbi visszajelzés a játékosnak (a HUD kérdezi). */
  uzenet() { return this._uzenet || ''; }

  gazdasagSzoveg() {
    const cs = this.kijeloles.sajatCsapat;
    const a = this.sim.gazdasag.allapot(cs);
    const m = this.sim.munkasok.osszesites(cs);
    const h = this.sim.harc.osszesites();
    const k = this.sim.kepzes.osszesites(cs);
    return NYERS_NEV[0] + ' ' + a.etel
      + ' · ' + NYERS_NEV[1] + ' ' + a.fa
      + ' · ' + NYERS_NEV[2] + ' ' + a.ko
      + ' · ' + NYERS_NEV[3] + ' ' + a.kristaly
      + '  |  ' + KORSZAK_NEV[a.korszak]
      + (a.valtasHatra ? ' → vált (' + Math.ceil(a.valtasHatra / 20) + ' mp)' : '')
      + '  |  dolgozó munkás: ' + m.dolgozik
      + '  |  nép: ' + a.nepesseg + '/' + a.nepessegMax
      + '  |  élő: ' + h.elo[cs] + ' (elesett ' + h.halottak[cs] + ')'
      + '  |  sorban: ' + k.sorban + ' (kész: ' + k.keszult + ')'
      + (this._uzenet ? '  |  ' + this._uzenet : '');
  }

  /** Újrafelállás után a kijelölés és a csoportok takarítása. */
  ujraKot() {
    this.kijeloles.frissitCsoportok();
  }

  bont() {
    for (const f of (this._bontok || [])) { try { f(); } catch { /* nem kritikus */ } }
    if (this._bontok) this._bontok.length = 0;
    if (this._keret && this._keret.parentNode) this._keret.parentNode.removeChild(this._keret);
  }
}
