// AGE OF THE CRYSTALS — KIJELÖLÉS-PANEL (v0.16).
//
// ── MIÉRT EZ A PANEL A LEGFONTOSABB A v0.16-BAN ───────────────────────────
// A motor v0.10-nél tart, a prezentáció v0.0-nál, és ez a szakadék EGYETLEN
// helyen fájt igazán: a tulajdonos leült a kész játék elé, kijelölt egy sereget,
// és a képernyő SEMMIT nem mondott róla. Se hogy mik azok, se hogy mennyi az
// életerejük, se hogy mit lehet velük csinálni. A parancsok mind megvoltak
// (állj, tartás, állás, alakzat, támadó menet) — csak REJTETT BILLENTYŰKÉNT.
// Egy RTS-t nem lehet elkezdeni így: nem az hiányzott, hogy a játék tudjon
// valamit, hanem hogy MEGMUTASSA.
//
// A mérce a TELEPESEK v1.3.1 és a klasszikus AoE kijelölés-panelje. Onnan
// három dolgot veszünk át, és mindhárom szándékos:
//
//   1. EGY EGYSÉGNÉL a panel a KÁRTYÁJÁT mutatja — nagy ikon, név, életerő,
//      páncél, sebzés, hatótáv. A játékos ebből tanulja meg a kő-papír-ollót,
//      nem a kézikönyvből.
//   2. TÖBB EGYSÉGNÉL típusonkénti csempék, DARABSZÁMMAL, és a csempe
//      KATTINTHATÓ: al-kijelölés. Enélkül egy vegyes seregből az íjászokat
//      csak új keret-húzással lehetne kiemelni, ami csata közben lehetetlen.
//   3. A PARANCS-GOMBON OTT A BILLENTYŰ. A gomb megtanítja a parancsot, a
//      sarkába írt betű pedig megtanítja a gyorsbillentyűt. Aki csak gombot
//      ad, az örökre kattintóssá teszi a játékát.
//
// ── A PANEL SOSEM ÍR SIM-ÁLLAPOTOT ────────────────────────────────────────
// Minden hatás `sim.parancs({...})`-on megy be, ugyanazon a soron, mint az
// egéré. A `bevitel.alakzat` / `bevitel.allas` / `bevitel.tamadoMod` NEM
// sim-állapot: azok a beviteli réteg kliens-oldali kapcsolói (a `Kijeloles`
// maga sincs a simben, épp ezért). Ezeket azért állítjuk, hogy a következő
// jobb kattintás UGYANAZT az alakzatot küldje, amit a gomb mutat — különben a
// panel és a billentyűzet két különböző igazságot állítana.
//
// ── AMIT A PANEL NEM CSINÁL ───────────────────────────────────────────────
// Nem választ ki épületet. Az épület-kijelölés önálló UI-réteg (kattintható
// épület a 3D-ben), és annak más a gazdája; ez a panel csak FOGADJA, ha valaki
// beteszi a `bevitel.kijeloltEpulet` mezőt. Amíg nincs ilyen, az épület-nézet
// egyszerűen nem jelenik meg — és nem is dob semmit.

import './panel_kijeloles.css';
import { ikonSvg } from './ikonok.js';
import {
  ujModell, kijelolesAdat, csoportIndexek, kovetkezoTetlen,
  GOMBOK, GOMB_DB, GOMB_ALLJ, GOMB_TARTAS, GOMB_TAMADO, GOMB_ALLAS,
  GOMB_ALAKZAT, GOMB_TETLEN,
} from './panel_kijeloles_adat.js';
import { ALAKZAT_NEV } from '../sim/alakzat.js';
import { ALLAS_NEV } from '../sim/parancsallapot.js';

/** Hova kéri magát a HUD-vázon. */
export const PANEL = { nev: 'kijeloles', hely: 'also_bal', cim: 'Kijelölés' };

/**
 * Ennyi ezredmásodpercenként számoljuk újra a modellt, HA a kijelölés mérete
 * nem változott. A kijelölés MEGVÁLTOZÁSA azonnal átfut — ott a késés a
 * játékos saját tettére adott válasz, és azt a kéz megérzi.
 */
const FRISS_MS = 90;

/** Az életerő-csík színküszöbei százalékban. */
const CSIK_KOZEPES = 60;
const CSIK_ROSSZ = 30;

export class PanelKijeloles {
  /**
   * @param {HTMLElement} gyoker ÜRES `<div>`, a HUD-váz adja
   * @param {import('../sim/sim.js').Sim} sim
   * @param {import('./bevitel.js').Bevitel} bevitel
   * @param {{sajatCsapat?:number, uzenet?:(sz:string,f?:string)=>void}} [opciok]
   */
  constructor(gyoker, sim, bevitel, opciok = {}) {
    this.sim = sim;
    this.bevitel = bevitel;
    this.csapat = opciok.sajatCsapat ?? (bevitel && bevitel.kijeloles
      ? bevitel.kijeloles.sajatCsapat : 0);
    this._uzenet = opciok.uzenet || null;
    this._enabled = true;

    this.modell = ujModell(sim ? sim.maxEgyseg : 2000);
    /**
     * ÚJRAHASZNÁLT bemenő objektum. A `frissit()` képkockánként hívja az
     * adatréteget; egy friss `{egysegek, db, …}` literál másodpercenként
     * 60-144 szemetet jelentene, pont abból a fajtából, amit a projekt a
     * render forró útján is tilt.
     */
    this._valasztas = { egysegek: null, db: 0, epulet: -1, csapat: this.csapat, tamadoMod: false };

    this._utolsoFriss = -1e9;
    this._utolsoLista = -1;
    this._utolsoEp = -2;
    this._szerkezet = -1;
    this._ertek = -1;
    /** A tétlen-paraszt körbejárás mutatója. */
    this._tetlenKurzor = -1;
    /** Mezőnként az utoljára KIÍRT szöveg — a fölösleges DOM-írás ellen. */
    this._irt = new Map();

    this.gyoker = gyoker || null;
    if (!this.gyoker || typeof document === 'undefined') return;
    this._epit();
  }

  // ── VÁZ ────────────────────────────────────────────────────────────────

  _epit() {
    const gy = this.gyoker;
    gy.textContent = '';
    gy.classList.add('aoc-kijeloles');
    gy.dataset.fajta = 'ures';

    // Üres állapot: nem eltűnünk, hanem elmondjuk, hogy hogyan kell kijelölni.
    this._suly = this._div(gy, 'aoc-kijeloles-suly');
    this._suly.textContent = 'Nincs kijelölés — húzz keretet a bal gombbal, '
      + 'vagy kattints egy egységre.';

    // ── BAL: ki ez ────────────────────────────────────────────────────
    const bal = this._div(gy, 'aoc-kijeloles-bal');
    const fej = this._div(bal, 'aoc-kijeloles-fej');
    this._portre = this._div(fej, 'aoc-kijeloles-portre');
    const cim = this._div(fej, '');
    this._nev = this._div(cim, 'aoc-kijeloles-nev');
    this._alcim = this._div(cim, 'aoc-kijeloles-alcim');

    this._csik = this._div(bal, 'aoc-kijeloles-csik');
    this._csikBel = document.createElement('i');
    this._csik.appendChild(this._csikBel);

    const hpsor = this._div(bal, 'aoc-kijeloles-hpsor');
    this._hpBal = document.createElement('span');
    this._hpJobb = document.createElement('span');
    hpsor.appendChild(this._hpBal);
    hpsor.appendChild(this._hpJobb);

    this._adatok = this._div(bal, 'aoc-kijeloles-adatok');

    // ── KÖZÉP: csoportok / képzési sor ────────────────────────────────
    const kozep = this._div(gy, 'aoc-kijeloles-kozep');
    this._csoportDoboz = this._div(kozep, 'aoc-kijeloles-csoportok');
    this._sorDoboz = this._div(kozep, 'aoc-kijeloles-sor');
    this._folyik = this._div(kozep, 'aoc-kijeloles-folyik');

    // ── JOBB: parancs-gombok ──────────────────────────────────────────
    // EGYSZER épülnek fel, és soha nem épülnek újra: a gomb-rács helye a
    // játékos izommemóriája. Csak a `disabled`, a `data-jelolt` és az érték-
    // felirat változik.
    this._gombDoboz = this._div(gy, 'aoc-kijeloles-gombok');
    this._gombok = new Array(GOMB_DB);
    for (let g = 0; g < GOMB_DB; g++) {
      const le = GOMBOK[g];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'aoc-kijeloles-gomb';
      b.dataset.gomb = String(g);
      b.title = le.nev + ' (' + le.billentyu + ') — ' + le.sugo;
      // ⚠️ `ikonSvg` ISMERETLEN NÉVRE DOB. Ez itt szándékosan nincs
      // try/catch-ben: ha valaki elgépel egy ikonnevet a `GOMBOK` táblában,
      // a panel HANGOSAN dől el a boot alatt, nem némán ad üres gombot.
      b.innerHTML = ikonSvg(le.ikon, 22);
      const ert = document.createElement('u');
      const bil = document.createElement('i');
      bil.textContent = le.billentyu;
      b.appendChild(ert);
      b.appendChild(bil);
      this._gombok[g] = { elem: b, ertek: ert };
      this._gombDoboz.appendChild(b);
    }

    this._kattint = (ev) => this._kattintas(ev);
    gy.addEventListener('click', this._kattint);
  }

  _div(szulo, osztaly) {
    const d = document.createElement('div');
    if (osztaly) d.className = osztaly;
    szulo.appendChild(d);
    return d;
  }

  /** Írás CSAK változásra. */
  _ir(kulcs, elem, szoveg) {
    if (!elem) return;
    if (this._irt.get(kulcs) === szoveg) return;
    this._irt.set(kulcs, szoveg);
    elem.textContent = szoveg;
  }

  _attr(kulcs, elem, nev, ertek) {
    if (!elem) return;
    const k = kulcs + '|' + nev;
    if (this._irt.get(k) === ertek) return;
    this._irt.set(k, ertek);
    elem.dataset[nev] = ertek;
  }

  // ── KÉPKOCKA ───────────────────────────────────────────────────────────

  /**
   * @param {import('../sim/sim.js').Sim} sim
   * @param {number} most a hívó időbélyege (ms)
   */
  frissit(sim, most) {
    if (!this._enabled || !this.gyoker) return;
    const kij = this.bevitel && this.bevitel.kijeloles ? this.bevitel.kijeloles : null;
    const lista = kij ? kij.lista : null;
    const listaDb = lista ? lista.length : 0;
    // Az épület-kijelölés MÁS réteg dolga; ha nincs, -1 jön, és az épület-nézet
    // egyszerűen nem jelenik meg.
    const epIdx = this.bevitel && this.bevitel.kijeloltEpulet !== undefined
      ? (this.bevitel.kijeloltEpulet | 0) : -1;

    // A kijelölés MEGVÁLTOZÁSA azonnal átfut, minden más ritkábban — lásd a
    // `FRISS_MS` fejlécét.
    const valtozott = listaDb !== this._utolsoLista || epIdx !== this._utolsoEp;
    if (!valtozott && (most - this._utolsoFriss) < FRISS_MS) return;
    this._utolsoFriss = most;
    this._utolsoLista = listaDb;
    this._utolsoEp = epIdx;

    const v = this._valasztas;
    v.egysegek = lista;
    v.db = listaDb;
    v.epulet = epIdx;
    v.csapat = this.csapat;
    v.tamadoMod = !!(this.bevitel && this.bevitel.tamadoMod);

    const m = kijelolesAdat(sim, v, this.modell);

    if (m.szerkezetJel !== this._szerkezet) {
      this._szerkezet = m.szerkezetJel;
      this._ertek = -1;               // az érték-írás mindenképp fusson utána
      this._szerkezetRajz(m);
    }
    if (m.ertekJel !== this._ertek) {
      this._ertek = m.ertekJel;
      this._ertekRajz(m);
    }
  }

  /** Ami ritkán változik: csempék, sor-elemek, gomb-engedélyezés. */
  _szerkezetRajz(m) {
    const gy = this.gyoker;
    // ⚠️ A GYORSÍTÓTÁRAT ELDOBJUK, MERT AZ ELEMEK ÚJAK.
    // A `_irt` azt jegyzi meg, mit ÍRTUNK KI utoljára — de a csempék és a
    // sor-elemek most épülnek újra, tehát a régi érték egy MÁSIK, azóta
    // eldobott `<div>`-re vonatkozik. Enélkül az új 0. csempe csíkja üresen
    // maradna, mert a „már 50 %-on áll" bejegyzés meggátolná az írást — és ez
    // pont az a néma hiba, amit a képernyőn senki nem kötne a gyorsítótárhoz.
    // Szerkezet-váltás ritka, a teljes újraírás ára itt elhanyagolható.
    this._irt.clear();
    this._attr('gyok', gy, 'fajta', m.fajta);

    // ── BAL OSZLOP ────────────────────────────────────────────────────
    if (m.fajta === 'egy') {
      this._portre.innerHTML = ikonSvg(m.egy.ikon, 34);
      this._ir('nev', this._nev, m.egy.nev);
    } else if (m.fajta === 'epulet') {
      this._portre.innerHTML = ikonSvg(m.ep.ikon, 34);
      this._ir('nev', this._nev, m.ep.nev);
    } else if (m.fajta === 'tobb') {
      // Több egységnél a LEGNÉPESEBB csoport ikonja kerül a portréra: az
      // mondja meg egy pillantásra, hogy „ez egy íjász-sereg".
      let legtobb = m.csoportok[0];
      for (let c = 1; c < m.csoportDb; c++) {
        if (m.csoportok[c].db > legtobb.db) legtobb = m.csoportok[c];
      }
      this._portre.innerHTML = ikonSvg(legtobb.ikon, 34);
      this._ir('nev', this._nev, m.db + ' egység');
    }

    // ── CSOPORT-CSEMPÉK ───────────────────────────────────────────────
    // Csak `tobb` esetén; egyetlen egységnél a bal oszlop úgyis mindent elmond.
    this._csoportDoboz.textContent = '';
    this._csempek = null;
    if (m.fajta === 'tobb') {
      this._csempek = new Array(m.csoportDb);
      for (let c = 0; c < m.csoportDb; c++) {
        const g = m.csoportok[c];
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'aoc-kijeloles-csempe';
        b.dataset.csoport = String(c);
        b.title = g.nev + ' — kattintásra csak ezeket jelöli ki';
        b.innerHTML = ikonSvg(g.ikon, 16);
        const szam = document.createElement('b');
        szam.textContent = String(g.db);
        b.appendChild(szam);
        const csik = document.createElement('div');
        csik.className = 'aoc-kijeloles-csik';
        const bel = document.createElement('i');
        csik.appendChild(bel);
        b.appendChild(csik);
        this._csoportDoboz.appendChild(b);
        this._csempek[c] = { csik, bel };
      }
    }

    // ── ÉPÜLET KÉPZÉSI SORA ───────────────────────────────────────────
    this._sorDoboz.textContent = '';
    if (m.fajta === 'epulet' && m.ep.sorDb > 0) {
      for (let k = 0; k < m.ep.sorDb; k++) {
        const d = document.createElement('div');
        d.className = 'aoc-kijeloles-sorelem';
        d.dataset.most = k === 0 ? '1' : '0';
        d.innerHTML = ikonSvg(m.ep.sorIkon[k], 14);
        const sz = document.createElement('span');
        sz.textContent = m.ep.sorNev[k];
        d.appendChild(sz);
        this._sorDoboz.appendChild(d);
      }
    }

    // ── ADATSOR ───────────────────────────────────────────────────────
    this._adatok.textContent = '';
    if (m.fajta === 'egy') {
      const e = m.egy;
      this._adatPar('sebzés', e.sebzes + ' (' + e.tamadasNev + ')');
      this._adatPar('gyalogos ellen', String(e.sebzesGyalog));
      this._adatPar('páncél', e.pancelErtek + ' (' + e.pancelNev + ')');
      this._adatPar('hatótáv', e.hatotav.toFixed(2));
      this._adatPar('ütem', e.utemMp.toFixed(2) + ' mp');
      this._adatPar('parancs', e.parancsNev);
      this._adatPar('állás', e.allasNev);
      this._adatPar('alakzat', e.alakzatNev);
      if (e.munkasE) {
        this._adatPar('munka', e.munkaNev);
        this._adatPar('cipel', e.cipelDb > 0 ? e.cipelDb + ' ' + e.cipelNyers : '—');
      }
    } else if (m.fajta === 'epulet') {
      const p = m.ep;
      if (!p.kesz) this._adatPar('épül', p.epitSzaz + ' % · ' + p.epitMp + ' mp');
      // ⚠️ Idegen épületnél az adatréteg NULLÁT ad őrségre — az „0 / 5" viszont
      // azt ÁLLÍTANÁ, hogy üres a torony, holott csak nem látunk bele. A hiányzó
      // tudást hiányként kell kiírni, különben a gát hazugsággá válik.
      if (p.orsegMax > 0) {
        this._adatPar('őrség', (p.sajat ? String(p.orseg) : '?') + ' / ' + p.orsegMax);
      }
      if (p.nepesseg > 0) this._adatPar('népesség', '+' + p.nepesseg);
      if (p.lerakat) this._adatPar('szerep', 'lerakat');
      if (p.kepzoE) this._adatPar('szerep', 'képző épület');
    } else if (m.fajta === 'tobb') {
      this._adatPar('csoport', String(m.csoportDb));
    }

    // ── GOMBOK ────────────────────────────────────────────────────────
    for (let g = 0; g < GOMB_DB; g++) {
      const gm = m.gombok[g];
      const el = this._gombok[g].elem;
      el.disabled = !gm.aktiv;
      this._attr('gj' + g, el, 'jelolt', gm.jelolt ? '1' : '0');
    }
  }

  _adatPar(cim, ertek) {
    const a = document.createElement('span');
    a.textContent = cim;
    const b = document.createElement('span');
    b.textContent = ertek;
    this._adatok.appendChild(a);
    this._adatok.appendChild(b);
  }

  /** Ami tickenként változik: életerő, készültség, számok. */
  _ertekRajz(m) {
    if (m.fajta === 'ures') {
      this._ir('hpb', this._hpBal, '');
      this._ir('hpj', this._hpJobb, '');
      this._ir('alcim', this._alcim, '');
      this._ir('folyik', this._folyik, '');
      this._gombErtek(m);
      return;
    }

    let hp = 0, maxHp = 0, alcim = '';
    if (m.fajta === 'epulet') {
      hp = m.ep.hp; maxHp = m.ep.maxHp;
      alcim = m.ep.kesz ? 'kész' : ('épül — ' + m.ep.epitSzaz + ' %');
    } else if (m.fajta === 'egy') {
      hp = m.egy.hp; maxHp = m.egy.maxHp;
      alcim = m.egy.allapotNev + (m.egy.munkasE ? ' · ' + m.egy.munkaNev : '');
    } else {
      hp = m.hp; maxHp = m.maxHp;
      alcim = m.csoportDb + ' fegyvernem';
    }
    this._ir('alcim', this._alcim, alcim);
    this._ir('hpb', this._hpBal, 'életerő');
    this._ir('hpj', this._hpJobb, hp + ' / ' + maxHp);
    this._csikAllit('fo', this._csik, this._csikBel,
      maxHp > 0 ? Math.round((hp * 100) / maxHp) : 0,
      // A félkész épületnél az ÉPÍTÉS a fontos szám, nem az életerő — a
      // csík ilyenkor kék, hogy a kettőt ne lehessen összekeverni.
      m.fajta === 'epulet' && !m.ep.kesz ? m.ep.epitSzaz : -1);

    if (this._csempek) {
      for (let c = 0; c < this._csempek.length && c < m.csoportDb; c++) {
        const g = m.csoportok[c];
        this._csikAllit('cs' + c, this._csempek[c].csik, this._csempek[c].bel,
          g.hpSzaz, -1);
      }
    }

    // „Mi folyik benne" — egyetlen sor, mert a képzési sor csempéi már fent
    // vannak; ide a HÁTRALÉVŐ IDŐ és a kutatás kerül.
    let folyik = '';
    if (m.fajta === 'epulet') {
      const p = m.ep;
      if (p.sorDb > 0) {
        folyik = 'képzés: ' + p.sorNev[0] + ' — ' + p.kepzesSzaz + ' % ('
          + p.kepzesMp + ' mp) · sorban ' + p.sorDb;
      }
      if (p.kutatNev) {
        folyik += (folyik ? '  ·  ' : '') + 'kutatás: ' + p.kutatNev
          + ' (' + p.kutatMp + ' mp)';
      }
      // ⚠️ „Nem folyik benne semmi" csak a SAJÁT épületről mondható ki. Idegen
      // épületnél az adatréteg szándékosan üresen hagyja a sort és a kutatást
      // (a v0.8 lockstepben az ellenfél termelése nem olvasható ki) — ha ide
      // ugyanaz a mondat kerülne, a panel ÁLLÍTANÁ a tétlenséget, ahelyett hogy
      // bevallaná a nem-tudást. Az ellenfél üres laktanyája és a dolgozó
      // laktanyája ugyanúgy néz ki, és ez így helyes.
      if (!folyik && !p.sajat && p.van) folyik = 'idegen épület — a belseje nem látszik';
      else if (!folyik) folyik = p.kesz ? 'nem folyik benne semmi' : '';
    }
    this._ir('folyik', this._folyik, folyik);

    this._gombErtek(m);
  }

  _gombErtek(m) {
    for (let g = 0; g < GOMB_DB; g++) {
      const gm = m.gombok[g];
      this._ir('ge' + g, this._gombok[g].ertek, gm.ertek);
      const el = this._gombok[g].elem;
      el.disabled = !gm.aktiv;
      this._attr('gj' + g, el, 'jelolt', gm.jelolt ? '1' : '0');
    }
    this._attr('gs', this._gombok[GOMB_TETLEN].elem, 'surgos',
      m.tetlenDb > 0 ? '1' : '0');
  }

  /**
   * Egy csík beállítása. `folyamat >= 0` esetén AZT rajzoljuk (kék), különben
   * az életerőt (zöld/sárga/piros).
   */
  _csikAllit(kulcs, doboz, bel, szazalek, folyamat) {
    const sz = folyamat >= 0 ? folyamat : szazalek;
    const allapot = folyamat >= 0 ? 'folyamat'
      : (szazalek > CSIK_KOZEPES ? 'jo' : (szazalek > CSIK_ROSSZ ? 'kozepes' : 'rossz'));
    this._attr('c' + kulcs, doboz, 'allapot', allapot);
    const w = sz + '%';
    if (this._irt.get('w' + kulcs) !== w) {
      this._irt.set('w' + kulcs, w);
      bel.style.width = w;
    }
  }

  // ── KATTINTÁS → PARANCS ────────────────────────────────────────────────

  _kattintas(ev) {
    const cel = ev.target && ev.target.closest ? ev.target.closest('button') : null;
    if (!cel) return;
    if (cel.dataset.gomb !== undefined) {
      ev.preventDefault();
      this._gombNyomas(cel.dataset.gomb | 0);
    } else if (cel.dataset.csoport !== undefined) {
      ev.preventDefault();
      this._alKijeloles(cel.dataset.csoport | 0);
    }
  }

  /** A kijelölés MÁSOLATA — ugyanaz az indok, mint a `bevitel._masolat()`-nál:
   *  a parancs `KESLELTETES` tickig a sorban ül, és addig átjelölhetnek. */
  _masolat() {
    const l = this.bevitel.kijeloles.lista;
    const ki = new Array(l.length);
    for (let k = 0; k < l.length; k++) ki[k] = l[k];
    return ki;
  }

  _gombNyomas(g) {
    const kij = this.bevitel ? this.bevitel.kijeloles : null;
    if (!kij) return;
    const vanKij = kij.lista.length > 0;

    switch (g) {
      case GOMB_ALLJ:
        if (vanKij) this.sim.parancs({ fajta: 'allj', egysegek: this._masolat() });
        break;
      case GOMB_TARTAS:
        if (vanKij) this.sim.parancs({ fajta: 'tartas', egysegek: this._masolat() });
        break;
      case GOMB_TAMADO:
        // Nem parancs, hanem MÓD: a következő jobb kattintás lesz támadó menet.
        // Ugyanaz a kapcsoló, amit a `T` billentyű billent — egy igazság.
        this.bevitel.tamadoMod = !this.bevitel.tamadoMod;
        this._szol(this.bevitel.tamadoMod
          ? 'támadó menet: a következő jobb kattintás harcolva megy'
          : 'támadó menet kikapcsolva');
        break;
      case GOMB_ALLAS: {
        const uj = (this.bevitel.allas + 1) & 3;
        this.bevitel.allas = uj;
        if (vanKij) {
          this.sim.parancs({ fajta: 'allas', egysegek: this._masolat(), allas: uj });
        }
        this._szol('állás: ' + ALLAS_NEV[uj]);
        break;
      }
      case GOMB_ALAKZAT: {
        const uj = (this.bevitel.alakzat + 1) & 3;
        this.bevitel.alakzat = uj;
        if (vanKij) {
          this.sim.parancs({ fajta: 'alakzat', egysegek: this._masolat(), alakzat: uj });
        }
        this._szol('alakzat: ' + ALAKZAT_NEV[uj]);
        break;
      }
      case GOMB_TETLEN:
        this._tetlenre();
        break;
      default:
        break;
    }
    // A gomb-nyomás azonnal látszódjon: a következő `frissit()` ne várjon a
    // `FRISS_MS`-re. (A parancs maga csak `KESLELTETES` tick múlva hat, de a
    // gomb ÁLLAPOTA — pl. a bekapcsolt támadó menet — most változott meg.)
    this._utolsoFriss = -1e9;
  }

  /**
   * TÉTLEN PARASZT — a panel egyetlen olyan gombja, ami magától kér szót.
   *
   * Körbejár: minden nyomásra a KÖVETKEZŐ ácsorgó parasztra ugrik, kijelöli, és
   * odaviszi a kamerát. Ez a klasszikus AoE-mozdulat, és RTS-ben ez a
   * legnagyobb egyetlen gazdasági nyereség: egy tétlen paraszt percenként
   * ~140 nyersanyagot NEM hoz be.
   */
  _tetlenre() {
    const i = kovetkezoTetlen(this.sim, this.csapat, this._tetlenKurzor);
    if (i < 0) {
      this._tetlenKurzor = -1;
      this._szol('nincs tétlen paraszt', 'info');
      return;
    }
    this._tetlenKurzor = i;
    const kij = this.bevitel.kijeloles;
    kij.urit();
    kij.hozzaad(i);
    const kam = this.bevitel.kamera;
    if (kam && typeof kam.kozepre === 'function') {
      kam.kozepre(this.sim.egysegek.px[i], this.sim.egysegek.py[i]);
    }
    this._utolsoLista = -1;   // a kijelölés mérete lehet, hogy nem változott
    this._utolsoFriss = -1e9;
  }

  /**
   * AL-KIJELÖLÉS: a kijelölésből csak egy fegyvernem marad.
   *
   * A `Kijeloles` NEM sim-állapot (lásd a fájl fejlécét és az `INTERFACES.md`
   * kliens-oldali szakaszát), ezért ezt szabad írni — a `sim`-hez egyetlen
   * bájt sem megy.
   */
  _alKijeloles(c) {
    const idk = csoportIndexek(this.modell, c);
    if (!idk || idk.length === 0) return;
    const kij = this.bevitel.kijeloles;
    // MÁSOLAT KELL: a `urit()` kinullázza a `benne` jelzőket, és a puffer
    // ugyanazokat az indexeket tartja — de a következő `kijelolesAdat()` már
    // felülírná, ha közben eltelne egy képkocka.
    const masol = new Array(idk.length);
    for (let k = 0; k < idk.length; k++) masol[k] = idk[k];
    kij.urit();
    for (let k = 0; k < masol.length; k++) kij.hozzaad(masol[k]);
    this._utolsoLista = -1;
    this._utolsoFriss = -1e9;
  }

  _szol(szoveg, fajta) {
    if (this._uzenet) this._uzenet(szoveg, fajta || 'info');
  }

  // ── VÁZ-FELÜLET ────────────────────────────────────────────────────────

  set enabled(v) {
    this._enabled = !!v;
    if (this.gyoker) this.gyoker.style.display = v ? '' : 'none';
  }
  get enabled() { return this._enabled; }

  bont() {
    if (this.gyoker && this._kattint) {
      this.gyoker.removeEventListener('click', this._kattint);
      this._kattint = null;
    }
    this._irt.clear();
  }
}
