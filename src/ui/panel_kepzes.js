// AGE OF THE CRYSTALS — KÉPZÉS-PANEL (v0.16).
//
// ── MIÉRT KELL, ÉS MIÉRT PONT ÍGY ─────────────────────────────────────────
// A v0.15-ig a képzés EGYETLEN REJTETT BILLENTYŰ volt (`C`), és az is csak a
// kurzorhoz legközelebbi épület ELSŐ képezhető egységét rendelte meg. Ez a
// motor kipróbálásához elég volt, játéknak nem: a tulajdonos leült vele, és nem
// tudott egységet képezni. Az `EGYEDI` egységhez — a nyolc nép saját
// egységéhez, a civ-választás egyetlen kézzelfogható jutalmához — pedig SEMMILYEN
// úton nem lehetett hozzáférni, mert a gyorsbillentyű szándékosan az alapegységet
// adja (lásd `bevitel.js` `_kepzesParancs`).
//
// A panel tehát három dolgot csinál, és mást nem:
//   1. MEGMUTATJA mind a hat egységtípust — árral, idővel, népesség-igénnyel.
//   2. MEGMONDJA, mi miért nem megy. A tiltás OKA a gombon van, nem a konzolon.
//   3. MUTATJA A SORT: melyik épületben mi készül, és hol tart.
//
// ── A GOMB NEM HAZUDHAT ───────────────────────────────────────────────────
// Egy aktívnak látszó gomb, ami parancsot küld, amit a sim csendben eldob, a
// játékos szemében ELROMLOTT JÁTÉK. Ezért a panel SOHA nem dönt maga: minden
// ítélet a `panel_kepzes_adat.js`-ből jön, az pedig a sim `Kepzes` osztályát
// kérdezi. Ha egy gomb aktív, arra a parancs át IS megy — ezt a szonda
// (`npm run p:kepzes`) mindkét irányban ellenőrzi.
//
// ── AMIT NEM RAJZOLUNK KI ─────────────────────────────────────────────────
// SOR-TÖRLÉS: a sim v0.16-ban nem tud sort törölni (a `kepzes.js` fejléce
// megindokolja: a visszatérítés nyersanyagot TEREMTENE). Halott ✕ gombot nem
// teszünk ki — az adatréteg `torlesTamogatott` mezője képesség-felismeréssel
// dönt, tehát amint a sim megkapja a törlést, a gomb magától megjelenik. Addig a
// sor-soron egy ZÁRT jelzés áll, tooltippel, hogy miért nem törölhető.
//
// A panel-szerződés (INTERFACES.md, v0.16): saját CSS, `aoc-kepzes-` előtag,
// a gyökerén kívülre nem nyúl, sim-állapotot nem ír, és a `frissit()`
// csak VÁLTOZÁSRA nyúl a DOM-hoz.

import './panel_kepzes.css';
import { IKON, ikonSvg } from './ikonok.js';
import { TIPUS_DB } from '../sim/units.js';
import { SOR_HOSSZ } from '../sim/kepzes.js';
import {
  ujKepzesAllapot, kepzesAdat, kepzesParancs, arSzoveg, idoSzoveg,
  OK, OK_SZOVEG, OK_TANACS, NYERS_IKON,
} from './panel_kepzes_adat.js';

/** Hova kéri magát a HUD-vázon. */
export const PANEL = {
  nev: 'kepzes',
  hely: 'also_kozep',
  cim: 'Képzés',
};

/**
 * Ennyi ezredmásodpercenként számoljuk újra az adatot.
 *
 * A képzés a szimuláció lassú rétege: 20 Hz-en egy lándzsás 200 tick, vagyis 10
 * másodperc — a haladás-csík 100 ms-onként 1 %-ot lép. Képkockánként újraszámolni
 * (`sorbanNepesseg` végigjárja az összes sort) tiszta pazarlás lenne 144 Hz-en.
 */
const FRISSITES_MS = 100;

/** Shift+kattintás ennyit állít sorba egyszerre — az AoE megszokott lépése. */
const KOTEG = 5;

export class PanelKepzes {
  /**
   * @param {HTMLElement} gyoker ÜRES div, a HUD-váz adja
   * @param {import('../sim/sim.js').Sim} sim
   * @param {import('./bevitel.js').Bevitel} bevitel
   * @param {{sajatCsapat?:number, uzenet?:(sz:string,f?:string)=>void}} [opciok]
   */
  constructor(gyoker, sim, bevitel, opciok = {}) {
    this.sim = sim;
    this.bevitel = bevitel;
    this.csapat = opciok.sajatCsapat ?? (bevitel && bevitel.kijeloles
      ? bevitel.kijeloles.sajatCsapat : 0);
    this._uzenetHiv = opciok.uzenet || null;
    this._enabled = true;
    this._utolso = -1e9;

    /** Az adatréteg puffere — EGYSZER foglaljuk, aztán csak írjuk. */
    this.allapot = ujKepzesAllapot();
    /** Újrahasznált parancs-objektum: a kattintás se allokáljon. */
    this._parancs = kepzesParancs(this.csapat, -1, -1);
    /** Amit utoljára KIÍRTUNK — enélkül minden frissítés újraírná a DOM-ot. */
    this._elozo = new Map();
    this._bontok = [];

    this.gyoker = gyoker || null;
    if (!this.gyoker || typeof document === 'undefined') return;
    this._epit();
  }

  // ── FELÉPÍTÉS ─────────────────────────────────────────────────────────
  // A szerkezet EGYSZER áll össze, utána már csak szöveg és osztály változik.
  // Ez nem mikro-optimalizálás: hat gomb újraépítése képkockánként a
  // `ikonSvg` SVG-forrásait is újraparszoltatná a böngészővel.

  _epit() {
    const gy = this.gyoker;
    gy.classList.add('aoc-kepzes');

    // ── fejléc: cím + népesség ──────────────────────────────────────────
    const fej = this._div(gy, 'aoc-kepzes-fej');
    const cim = this._div(fej, 'aoc-kepzes-cim');
    cim.innerHTML = ikonSvg(IKON.LAKTANYA, 16) + '<span>' + PANEL.cim + '</span>';
    this._nepMezo = this._div(fej, 'aoc-kepzes-nep');
    this._nepMezo.innerHTML = ikonSvg(IKON.NEP, 15) + '<b></b>';
    this._nepErtek = this._nepMezo.querySelector('b');

    // ── hat gomb ────────────────────────────────────────────────────────
    this._racs = this._div(gy, 'aoc-kepzes-racs');
    this._gombok = new Array(TIPUS_DB);
    for (let t = 0; t < TIPUS_DB; t++) this._gombok[t] = this._gomb(t);

    // ── sor ─────────────────────────────────────────────────────────────
    this._sorLista = this._div(gy, 'aoc-kepzes-sorlista');
    this._sorElemek = [];
    this._sorUres = this._div(this._sorLista, 'aoc-kepzes-ures');
    this._sorUres.textContent = 'Nincs képzés folyamatban.';

    // ── lábléc: a legutóbbi magyarázat ──────────────────────────────────
    this._lab = this._div(gy, 'aoc-kepzes-lab');

    // EGY figyelő az egész rácsra: hat gomb hat figyelője helyett egy. A
    // `bont()` így egyetlen sort takarít, és nem maradhat le egyről.
    const kattint = (ev) => this._kattintas(ev);
    const rajta = (ev) => this._rajta(ev);
    const sorKattint = (ev) => this._sorKattintas(ev);
    this._racs.addEventListener('click', kattint);
    this._racs.addEventListener('mouseover', rajta);
    this._sorLista.addEventListener('click', sorKattint);
    this._bontok.push(() => {
      this._racs.removeEventListener('click', kattint);
      this._racs.removeEventListener('mouseover', rajta);
      this._sorLista.removeEventListener('click', sorKattint);
    });
  }

  _div(szulo, osztaly) {
    const d = document.createElement('div');
    d.className = osztaly;
    szulo.appendChild(d);
    return d;
  }

  /** Egy egységtípus gombja. A szerkezete állandó, csak az értékek változnak. */
  _gomb(t) {
    const e = this.allapot.tetelek[t];
    const b = document.createElement('button');
    b.className = 'aoc-kepzes-gomb';
    b.type = 'button';
    b.dataset.tipus = String(t);

    const ikon = this._div(b, 'aoc-kepzes-ikon');
    // Az ikonnév ismeretlenre DOB (lásd `ikonok.js`) — egy elgépelt név itt
    // azonnal kiderül, nem egy üres gomb formájában.
    ikon.innerHTML = ikonSvg(e.ikon, 26);

    const jobb = this._div(b, 'aoc-kepzes-torzs');
    const nev = this._div(jobb, 'aoc-kepzes-nev');
    const ar = this._div(jobb, 'aoc-kepzes-ar');
    const also = this._div(jobb, 'aoc-kepzes-also');

    const jelvenyek = this._div(b, 'aoc-kepzes-jelvenyek');
    const sorban = this._div(jelvenyek, 'aoc-kepzes-sorban');

    this._racs.appendChild(b);
    return { b, nev, ar, also, sorban };
  }

  // ── ESEMÉNYEK ─────────────────────────────────────────────────────────

  /** Melyik gombra esett az esemény? A delegálás miatt fel kell sétálni. */
  _tipusEsemenybol(ev) {
    let el = ev.target;
    while (el && el !== this._racs) {
      if (el.dataset && el.dataset.tipus !== undefined) return el.dataset.tipus | 0;
      el = el.parentNode;
    }
    return -1;
  }

  _rajta(ev) {
    const t = this._tipusEsemenybol(ev);
    if (t < 0) return;
    const e = this.allapot.tetelek[t];
    this._labIr(e.ok === OK.KEPEZHETO
      ? e.nev + ' — ' + idoSzoveg(e.ido) + ', ' + e.nep + ' népesség'
        + (e.epNev ? ', itt: ' + e.epNev : '')
      : e.nev + ' — ' + OK_SZOVEG[e.ok] + '. ' + OK_TANACS[e.ok]);
  }

  /**
   * KATTINTÁS → PARANCS. A panel sim-állapotot NEM ír: egyetlen útja van, a
   * parancs-sor. Shift-tel `KOTEG` darab megy, de csak annyi, amennyi a sorba
   * BIZTOSAN befér — a fölösleges parancs néma elutasítás lenne.
   */
  _kattintas(ev) {
    const t = this._tipusEsemenybol(ev);
    if (t < 0) return;
    const e = this.allapot.tetelek[t];
    if (!e.kepezheto) {
      this._uzenet(e.nev + ': ' + OK_SZOVEG[e.ok] + '. ' + OK_TANACS[e.ok], 'figyelem');
      this._labIr(e.nev + ' — ' + OK_SZOVEG[e.ok] + '. ' + OK_TANACS[e.ok]);
      return;
    }
    let db = 1;
    if (ev.shiftKey) {
      const szabadHely = SOR_HOSSZ - this.sim.kepzes.sorDb[e.epulet];
      db = KOTEG < szabadHely ? KOTEG : szabadHely;
      if (db < 1) db = 1;
    }
    for (let k = 0; k < db; k++) {
      this.sim.parancs(kepzesParancs(this.csapat, e.epulet, t, this._parancs));
    }
    const sz = e.nev + (db > 1 ? ' × ' + db : '') + ' → ' + e.epNev;
    this._uzenet(sz, 'info');
    this._labIr(sz + ' · ' + idoSzoveg(e.ido) + ' egyenként');
    // A parancs KÉSLELTETVE hajtódik végre (`Sim.KESLELTETES`), tehát a
    // következő frissítés még a régi sort látná. Kényszerítjük az újraszámolást,
    // hogy a visszajelzés ne késsen fél másodpercet.
    this._utolso = -1e9;
  }

  /**
   * SOR-TÖRLÉS — csak ha a sim TUDJA. A gomb amúgy rejtve marad
   * (`torlesTamogatott`), tehát ez az ág ma nem is fut le; azért van itt
   * kész állapotban, hogy a képesség megjelenésekor ne egy néma ✕ fogadja a
   * játékost. A parancs FAJTÁJÁT is a sim mondja meg, ha másképp hívná.
   */
  _sorKattintas(ev) {
    const a = this.allapot;
    if (!a.torlesTamogatott) return;
    let el = ev.target;
    while (el && el !== this._sorLista) {
      const s = this._sorElemek.findIndex((x) => x.torles === el);
      if (s >= 0) {
        if (s >= a.sorDb) return;
        const d = a.sorok[s];
        const fajta = this.sim.kepzes.torlesParancsFajta || 'kepzes_torles';
        this.sim.parancs({ fajta, csapat: this.csapat, epulet: d.epulet, index: d.db - 1 });
        this._uzenet(d.epNev + ': a sor utolsó eleme törölve', 'info');
        this._utolso = -1e9;
        return;
      }
      el = el.parentNode;
    }
  }

  _uzenet(szoveg, fajta) {
    if (this._uzenetHiv) this._uzenetHiv(szoveg, fajta);
  }

  // ── KÉPKOCKA ──────────────────────────────────────────────────────────

  frissit(sim, most) {
    if (!this._enabled || !this.gyoker) return;
    if (most - this._utolso < FRISSITES_MS) return;
    this._utolso = most;

    const a = kepzesAdat(sim, this.csapat, this.allapot);

    // ── népesség ──────────────────────────────────────────────────────
    this._ir('nep', this._nepErtek, a.foglalt + ' / ' + a.maxNep
      + (a.sorbanNep ? '  (+' + a.sorbanNep + ' sorban)' : ''));
    this._osztaly('nepT', this._nepMezo, 'aoc-kepzes-nep-tele', a.nepTele);

    // ── hat gomb ──────────────────────────────────────────────────────
    for (let t = 0; t < TIPUS_DB; t++) {
      const e = a.tetelek[t];
      const g = this._gombok[t];
      this._ir('n' + t, g.nev, e.nev);
      this._ir('a' + t, g.ar, arSzoveg(e.ar));
      this._ir('u' + t, g.also, e.kepezheto
        ? idoSzoveg(e.ido) + ' · ' + e.nep + ' nép · ' + e.epNev
        : OK_SZOVEG[e.ok]);
      this._ir('s' + t, g.sorban, e.sorbanDb ? String(e.sorbanDb) : '');
      // A `disabled` ÉS az osztály is megy: a `disabled` a kattintást tiltja
      // (a böngésző nem is küld eseményt), az osztály a kinézetet adja. A
      // kettő közül egyik sem elég önmagában — de a kattintás-kezelő így is
      // ellenőrzi az `ok`-ot, mert a `disabled` gombra a szonda rákattinthat.
      this._allapotIr(t, g, e);
    }

    // ── sor ───────────────────────────────────────────────────────────
    this._sorIr(a);

    // ── lábléc alapszöveg, ha még nem volt semmi ──────────────────────
    if (!this._elozo.has('lab')) {
      this._labIr(a.kepzoEpuletDb === 0
        ? 'Nincs kész képző épületed. Laktanya, íjászda, istálló, ostromműhely és a központ képez.'
        : 'Kattints egy egységre. Shift+kattintás ' + KOTEG + ' darabot állít sorba.');
    }
  }

  _allapotIr(t, g, e) {
    const kulcs = 'st' + t;
    const ertek = e.ok;
    if (this._elozo.get(kulcs) === ertek) return;
    this._elozo.set(kulcs, ertek);
    g.b.disabled = !e.kepezheto;
    g.b.classList.toggle('aoc-kepzes-tiltott', !e.kepezheto);
    g.b.dataset.ok = String(e.ok);
    g.b.title = e.kepezheto
      ? e.nev + ' — ' + OK_TANACS[OK.KEPEZHETO]
      : e.nev + ': ' + OK_SZOVEG[e.ok] + '. ' + OK_TANACS[e.ok];
  }

  /**
   * A SOR kirajzolása. A sorok SZÁMA változhat, de a DOM-elemeket
   * újrahasznosítjuk: a felesleg elrejtve marad, nem törlődik. Épület-sor
   * létrejötte és megszűnése másodpercenként többször is előfordul.
   */
  _sorIr(a) {
    while (this._sorElemek.length < a.sorDb) this._sorElemek.push(this._sorElem());
    for (let s = 0; s < this._sorElemek.length; s++) {
      const el = this._sorElemek[s];
      const lathato = s < a.sorDb;
      this._osztaly('sl' + s, el.gyoker, 'aoc-kepzes-rejtett', !lathato);
      if (!lathato) continue;
      const d = a.sorok[s];
      this._ir('sf' + s, el.fej, d.epNev + ' — ' + d.elsoNev
        + (d.db > 1 ? '  (+' + (d.db - 1) + ' vár)' : ''));
      this._ir('sh' + s, el.hatra, idoSzoveg(d.hatra));
      const kulcs = 'sp' + s;
      if (this._elozo.get(kulcs) !== d.szazalek) {
        this._elozo.set(kulcs, d.szazalek);
        el.csik.style.width = d.szazalek + '%';
      }
      this._osztaly('sk' + s, el.torles, 'aoc-kepzes-rejtett', !a.torlesTamogatott);
      this._osztaly('sz' + s, el.zar, 'aoc-kepzes-rejtett', a.torlesTamogatott);
    }
    this._osztaly('ures', this._sorUres, 'aoc-kepzes-rejtett', a.sorDb > 0);
  }

  _sorElem() {
    const gyoker = this._div(this._sorLista, 'aoc-kepzes-sor');
    const fej = this._div(gyoker, 'aoc-kepzes-sorfej');
    const savDoboz = this._div(gyoker, 'aoc-kepzes-sav');
    const csik = this._div(savDoboz, 'aoc-kepzes-csik');
    const hatra = this._div(gyoker, 'aoc-kepzes-hatra');
    // Törlés-gomb CSAK akkor, ha a sim tudja. Lásd a fejlécet: halott gombot
    // nem teszünk ki, de a helyét elkészítjük, hogy a képesség megjelenésekor
    // ne kelljen újraépíteni a panelt.
    const torles = document.createElement('button');
    torles.type = 'button';
    torles.className = 'aoc-kepzes-torles aoc-kepzes-rejtett';
    torles.textContent = '✕';
    torles.title = 'A sorban álló egység törlése';
    gyoker.appendChild(torles);
    const zar = this._div(gyoker, 'aoc-kepzes-zar');
    zar.textContent = '⌛';
    zar.title = 'A sor nem törölhető: az ár a sorbaálláskor lemegy, és a '
      + 'szimuláció nem ad vissza nyersanyagot (lásd a képzés szabályát).';
    return { gyoker, fej, csik, hatra, torles, zar };
  }

  // ── ÍRÁS CSAK VÁLTOZÁSRA ──────────────────────────────────────────────

  _ir(kulcs, elem, szoveg) {
    if (!elem) return;
    if (this._elozo.get(kulcs) === szoveg) return;
    this._elozo.set(kulcs, szoveg);
    elem.textContent = szoveg;
  }

  _osztaly(kulcs, elem, osztaly, be) {
    if (!elem) return;
    if (this._elozo.get(kulcs) === be) return;
    this._elozo.set(kulcs, be);
    elem.classList.toggle(osztaly, be);
  }

  _labIr(szoveg) { this._ir('lab', this._lab, szoveg); }

  set enabled(v) {
    this._enabled = !!v;
    if (this.gyoker) this.gyoker.style.display = v ? '' : 'none';
  }
  get enabled() { return this._enabled; }

  bont() {
    for (let k = 0; k < this._bontok.length; k++) this._bontok[k]();
    this._bontok.length = 0;
    this._elozo.clear();
  }
}
