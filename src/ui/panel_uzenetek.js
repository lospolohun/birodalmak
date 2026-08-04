// AGE OF THE CRYSTALS — ÜZENET-PANEL (v0.16): a fontos esemény oda is visz.
//
// ── MI EZ, ÉS MI NEM ──────────────────────────────────────────────────────
// A tanácsadó MONDATAIT a `panel_uzenetek_adat.js` gyártja; ez a fájl csak
// megjeleníti őket. A vágás azért itt van, mert a szabályok az érdekesek és
// azok szondázhatók: a DOM node-ban nem fut, tehát ha a mérés a panelre
// támaszkodna, a `npm run p:uzenetek` egyetlen szabályt sem tudna járatni. Ez a
// `menu.js` / `menu_adat.js` bevált mintája.
//
// ── MIÉRT VAN SAJÁT LISTÁJA, AMIKOR A HUD-NAK IS ÁTADJA ───────────────────
// MINDEN üzenet megy a HUD tanácsadó-sávjába (`opciok.uzenet`) — az a folyó
// szöveg, ami elgördül. De a fontos események többsége HELYHEZ kötött: „elveszett
// egy épületed (84, 125)". Egy elgördülő sávban ez zsákutca — a játékos tudja,
// hogy baj van, de nem tudja MEGNÉZNI. Ezért ami koordinátát hoz, az ide is
// bekerül egy rövid, KATTINTHATÓ listába: a kattintás odaviszi a kamerát.
//
// A nem kattintható üzenet (pl. „kész a kutatás: ekevas") SZÁNDÉKOSAN nem kerül
// ide. Ez a lista nem napló, hanem tennivaló-sor; ha minden beleesne, a hatodik
// sor megint az lenne, amit senki nem olvas.
//
// ── ⚠️ EGY KULCS = EGY SOR ────────────────────────────────────────────────
// Az üzenet magával hozza az időzár kulcsát (`u.kulcs`). Ha ugyanaz a kulcs
// szólal meg újra — ugyanaz a laktanya panaszkodik, ugyanaz az épület van
// ostrom alatt —, a MEGLÉVŐ sor frissül és ugrik a lista tetejére, nem születik
// második. Enélkül egy hosszú ostrom hat sornyi ugyanolyan mondattal töltené
// meg a panelt, és kiszorítaná az összes többi bajt.
//
// ── ⚠️ A DOM CSAK VÁLTOZÁSRA MOZDUL ───────────────────────────────────────
// A `frissit()` 60–144 Hz-en fut, a szabályréteg viszont másodpercenként
// egyszer értékel. A hat sor újraírása képkockánként ingyen elvitt munka volna,
// ezért van `_piszkos` jelző: DOM-hoz csak akkor nyúlunk, ha tényleg más lett a
// tartalom vagy lejárt egy sor. A sorok maga a konstruktorban elkészülnek és
// ott is maradnak — a panel élete során egyetlen elem sem születik és nem hal
// meg, csak a szövegük és a láthatóságuk változik.

import './panel_uzenetek.css';
import { IKON, ikonSvg } from './ikonok.js';
import { UzenetSzabalyok, FAJTA } from './panel_uzenetek_adat.js';

/** Hova kéri magát a HUD-vázon. */
export const PANEL = {
  nev: 'uzenetek',
  hely: 'kepernyo',
  cim: 'Üzenetek',
};

/** Ennyi kattintható esemény látszik egyszerre. */
const MAX_SOR = 6;
/** Ennyi ezredmásodperc után kihal egy sor. Ami ennél régebbi, már nem tennivaló. */
const ELETTARTAM_MS = 45000;
/** A lejárat-ellenőrzés ennyi ezredmásodpercenként fut. */
const LEJARAT_KOZ_MS = 500;

/** Fajta → ikon. Ismeretlen fajtára `INFO` — az `ikonSvg` dobna, és egy elgépelt
 *  fajta miatt nem szabad, hogy az egész panel elszálljon. */
const FAJTA_IKON = {
  [FAJTA.INFO]: IKON.INFO,
  [FAJTA.FIGYELEM]: IKON.FIGYELEM,
  [FAJTA.BAJ]: IKON.BAJ,
};

export class PanelUzenetek {
  /**
   * @param {HTMLElement} gyoker ÜRES div, a HUD-váz adja
   * @param {import('../sim/sim.js').Sim} sim
   * @param {import('./bevitel.js').Bevitel} bevitel kijelölés + kamera
   * @param {{sajatCsapat?:number, uzenet?:(szoveg:string,fajta?:string)=>void}} [opciok]
   */
  constructor(gyoker, sim, bevitel, opciok = {}) {
    this.gyoker = gyoker;
    this.sim = sim;
    this.bevitel = bevitel;
    this.kiir = typeof opciok.uzenet === 'function' ? opciok.uzenet : null;

    /** A szabályréteg. A panel MINDEN tudása innen jön. */
    this.szabalyok = new UzenetSzabalyok(sim, { sajatCsapat: opciok.sajatCsapat ?? 0 });
    /** Hányadik üzenetig olvastuk ki a réteget. */
    this._kurzor = 0;

    this._enabled = true;
    this._piszkos = false;
    this._utolsoLejarat = -1e9;
    this._bontok = [];

    /**
     * A LÁTHATÓ sorok, LEGÚJABB ELÖL. Legfeljebb `MAX_SOR` elem, mind előre
     * lefoglalva — a frissítés csak a mezőiket írja át.
     */
    this._sorok = [];
    /** A DOM-sorok, fixen. Az i-edik DOM-sor a `_sorok[i]`-t mutatja. */
    this._elemek = [];

    if (!gyoker || typeof document === 'undefined') return;
    this._epit();
  }

  // ── FELÜLET ────────────────────────────────────────────────────────────

  _epit() {
    const g = this.gyoker;
    g.classList.add('aoc-uzenet-gyoker');
    const sav = document.createElement('div');
    sav.className = 'aoc-uzenet-sav';
    g.appendChild(sav);
    this._sav = sav;

    for (let i = 0; i < MAX_SOR; i++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'aoc-uzenet-sor';
      b.dataset.ix = String(i);
      b.hidden = true;

      const ikon = document.createElement('span');
      ikon.className = 'aoc-uzenet-ikon';
      const szoveg = document.createElement('span');
      szoveg.className = 'aoc-uzenet-szoveg';
      const ugras = document.createElement('span');
      ugras.className = 'aoc-uzenet-ugras';
      ugras.textContent = '↪';
      ugras.setAttribute('aria-hidden', 'true');

      b.appendChild(ikon);
      b.appendChild(szoveg);
      b.appendChild(ugras);
      sav.appendChild(b);
      this._elemek.push({ gomb: b, ikon, szoveg, fajta: '', mondat: '' });
    }

    // EGY figyelő az egész sávra. Soronkénti figyelővel a `bont()` hatot
    // szedne le, és egy elfelejtett sor csendben életben tartaná a panelt.
    const kattint = (ev) => {
      const gomb = ev.target && ev.target.closest ? ev.target.closest('.aoc-uzenet-sor') : null;
      if (!gomb) return;
      const ix = gomb.dataset.ix | 0;
      this._ugras(ix);
    };
    sav.addEventListener('click', kattint);
    this._bontok.push(() => sav.removeEventListener('click', kattint));
  }

  /**
   * KAMERA ODA. A `bevitel.kamera.kozepre()` ugyanaz az út, amit a Ctrl-csoport
   * dupla lenyomása használ (`bevitel.js`) — nem új mechanizmus, csak új hívó.
   *
   * ⚠️ EZ NEM SIM-ÍRÁS. A kamera a képernyő állapota, nem a világé; a panel
   * továbbra sem ad be parancsot és nem módosít sim-mezőt.
   */
  _ugras(ix) {
    const s = this._sorok[ix];
    if (!s || !s.ugorhato) return;
    const kamera = this.bevitel && this.bevitel.kamera;
    if (kamera && kamera.kozepre) kamera.kozepre(s.x, s.y);
  }

  // ── KÉPKOCKA ───────────────────────────────────────────────────────────

  /**
   * @param {import('../sim/sim.js').Sim} sim
   * @param {number} most ezredmásodperc
   */
  frissit(sim, most) {
    if (!this._enabled) return;

    // 1. A SZABÁLYRÉTEG. A `frissit()` első sora kiszáll, ha nem telt le a
    //    kiértékelési köz — képkockánként ez néhány összehasonlítás.
    const uj = this.szabalyok.frissit(sim.tick);
    if (uj > 0) this._olvas(most);

    // 2. LEJÁRAT — nem képkockánként, mert hat időbélyeg összevetése is munka,
    //    és fél másodperces pontosság bőven elég egy 45 másodperces sorhoz.
    if (most - this._utolsoLejarat >= LEJARAT_KOZ_MS) {
      this._utolsoLejarat = most;
      this._lejarat(most);
    }

    if (this._piszkos) { this._piszkos = false; this._rajzol(); }
  }

  /** Az új üzenetek kiolvasása a rétegből. */
  _olvas(most) {
    const sz = this.szabalyok;
    // Ha a gyűrű túlcsordult (nagyon hosszú képkocka-szünet), a legrégebbi
    // elveszett üzenetekre nem várunk — az `uzenet()` úgyis `null`-t adna.
    if (this._kurzor < sz.kiadott - 64) this._kurzor = sz.kiadott - 64;
    for (; this._kurzor < sz.kiadott; this._kurzor++) {
      const u = sz.uzenet(this._kurzor);
      if (!u) continue;
      // MINDEN üzenet megy a HUD tanácsadó-sávjába…
      if (this.kiir) this.kiir(u.szoveg, u.fajta);
      // …de csak a HELYHEZ KÖTÖTT kerül a kattintható listába (lásd a fejlécet).
      if (!u.ugorhato) continue;
      this._beszur(u, most);
    }
  }

  /** Egy sor beszúrása vagy a meglévő frissítése — egy kulcs = egy sor. */
  _beszur(u, most) {
    const l = this._sorok;
    let s = null;
    for (let i = 0; i < l.length; i++) {
      if (l[i].kulcs === u.kulcs) { s = l.splice(i, 1)[0]; break; }
    }
    if (!s) {
      s = l.length >= MAX_SOR ? l.pop() : { kulcs: -1, szoveg: '', fajta: '', x: -1, y: -1, ido: 0, ugorhato: false };
    }
    s.kulcs = u.kulcs;
    s.szoveg = u.szoveg;
    s.fajta = u.fajta;
    s.x = u.x; s.y = u.y;
    s.ugorhato = u.ugorhato;
    s.ido = most;
    l.unshift(s);
    this._piszkos = true;
  }

  /** A kihalt sorok kivétele. */
  _lejarat(most) {
    const l = this._sorok;
    for (let i = l.length - 1; i >= 0; i--) {
      if (most - l[i].ido < ELETTARTAM_MS) continue;
      l.splice(i, 1);
      this._piszkos = true;
    }
  }

  /** DOM-írás — CSAK innen, és csak akkor, ha `_piszkos` volt. */
  _rajzol() {
    for (let i = 0; i < this._elemek.length; i++) {
      const e = this._elemek[i];
      const s = this._sorok[i];
      if (!s) {
        if (!e.gomb.hidden) { e.gomb.hidden = true; e.mondat = ''; e.fajta = ''; }
        continue;
      }
      if (e.gomb.hidden) e.gomb.hidden = false;
      if (e.fajta !== s.fajta) {
        e.fajta = s.fajta;
        e.gomb.dataset.fajta = s.fajta;
        e.ikon.innerHTML = ikonSvg(FAJTA_IKON[s.fajta] || IKON.INFO, 16);
      }
      if (e.mondat !== s.szoveg) {
        e.mondat = s.szoveg;
        e.szoveg.textContent = s.szoveg;
        e.gomb.title = s.szoveg + '  ↪ (' + (s.x | 0) + ', ' + (s.y | 0) + ')';
      }
    }
  }

  // ── PANEL-SZERZŐDÉS ────────────────────────────────────────────────────

  set enabled(v) {
    this._enabled = !!v;
    if (this.gyoker) this.gyoker.style.display = v ? '' : 'none';
  }
  get enabled() { return this._enabled; }

  bont() {
    for (const f of this._bontok) { try { f(); } catch (h) { /* nem kritikus */ } }
    this._bontok.length = 0;
    this._sorok.length = 0;
    this._elemek.length = 0;
    if (this.gyoker) this.gyoker.textContent = '';
  }
}
