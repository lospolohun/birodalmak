// AGE OF THE CRYSTALS — STATISZTIKA-PANEL ÉS MECCS-VÉGE KÉPERNYŐ (v0.16).
//
// ── MIT AD EZ A JÁTÉKOSNAK ────────────────────────────────────────────────
// A meccsnek eddig nem volt se mérlege, se vége-képernyője: a játékos
// végigjátszott húsz percet, és nem tudta meg, hogy nyert-e, se azt, hogy min
// múlt. Ez a panel a TELEPESEK v1.3.1 statisztika-képernyőjének mércéjével
// dolgozik: nem egy szám-táblázat, hanem GÖRBÉK — mert a „min múlt" kérdésre
// csak az időbeli lefutás válaszol.
//
// ── AMI ITT VAN, ÉS AMI NINCS ─────────────────────────────────────────────
// Itt CSAK a rajzolás van. Minden szám a `panel_statisztika_adat.js`-ből jön,
// ami DOM-mentes, és amit a `tools/panel_statisztika_szonda.mjs` VALÓDI
// meccsen mér. Ez a szétválasztás nem elegancia: egy grafikon akkor is szépen
// megjelenik, ha a gyűjtés soha nem mintavételezett — vízszintes vonalat rajzol
// és hallgat. A számokat ezért nem itt kell ellenőrizni, hanem node-ban.
//
// ── ⚠️ A PANEL SOSEM ÍR SIM-ÁLLAPOTOT ────────────────────────────────────
// Egyetlen `sim.*` értékadás sincs benne, és `sim.parancs()`-ot sem ad be: a
// statisztika színtiszta olvasó. A meccs-vége képernyő „újra" és „főmenü"
// gombja sem nyúl a világhoz — visszahív a hívóhoz (`opciok.ujra` /
// `opciok.fomenu`), vagy eseményt küld, és a meccs-életciklus gazdája dönt.
// A v0.8 lockstepjén ez a különbség dönti el, hogy két gép ugyanazt látja-e.
//
// ── ⚠️ GYŐZELMI FELTÉTEL: A SIM MA NEM ISMER ILYET ───────────────────────
// A `src/sim/` sehol nem mond ki győztest. A panel ezért ÁLLÁST mutat, nem
// eredményt, és ezt ki is írja. A „Győzelem" szó csak akkor jelenik meg, ha az
// adatréteg de facto kiesést lát (egy csapatnak nincs se egysége, se épülete)
// — minden más esetben „Állás: …". Ez tudatos: egy hamis győzelem-képernyő
// rosszabb, mint a hiánya.
//
// ── A RAJZOLÁS KÖLTSÉGE ───────────────────────────────────────────────────
// A HUD 60–144 Hz-en fut. Három szabály tartja a panelt olcsón:
//   1. Rejtett panel semmit nem rajzol — csak a mintavételt futtatja (egyetlen
//      egész-összehasonlítás), mert az idősornak akkor is gyűlnie kell.
//   2. A görbék CSAK új mintára rajzolódnak újra (`gyujto.valtozat`), nem
//      képkockánként. Új minta 5 másodpercenként van.
//   3. Az élő fejléc-számok 200 ms-onként frissülnek, és csak eltérésre írnak
//      DOM-ot (`_ir`) — ugyanaz az elv, ami a `hud.js`-ben.

import './panel_statisztika.css';
import { IKON, ikonSvg } from './ikonok.js';
import {
  StatisztikaGyujto, SOROZAT, CSOPORT, CSAPAT_NEV,
  allas, merleg, vegallapot, vonalUt, idoSzoveg, szamSzoveg,
  idoTengely, ertekTengely, tengelyTeto,
} from './panel_statisztika_adat.js';

/** Hova kéri magát a HUD-vázon. Teljes képernyős réteg. */
export const PANEL = { nev: 'statisztika', hely: 'kepernyo', cim: 'Statisztika' };

const SVG_NS = 'http://www.w3.org/2000/svg';
/** A grafikon rajzdoboza a `viewBox`-on belül. */
const G = { x: 40, y: 8, sz: 272, mag: 78, teljesSz: 320, teljesMag: 112 };
/** Az élő fejléc-számok frissítési köze ezredmásodpercben. */
const ELO_MS = 200;
/** Ennyi tickenként nézzük meg, véget ért-e a meccs (de facto kiesés). */
const VEG_TICK = 40;

export class PanelStatisztika {
  /**
   * @param {HTMLElement} gyoker ÜRES div, a HUD-váz adja
   * @param {import('../sim/sim.js').Sim} sim
   * @param {import('./bevitel.js').Bevitel} bevitel
   * @param {{sajatCsapat?:number, uzenet?:Function, ujra?:Function,
   *          fomenu?:Function, gyujto?:StatisztikaGyujto}} [opciok]
   */
  constructor(gyoker, sim, bevitel, opciok = {}) {
    this.gyoker = gyoker;
    this.sim = sim;
    this.bevitel = bevitel;
    this.csapat = opciok.sajatCsapat ?? 0;
    this._uzenet = typeof opciok.uzenet === 'function' ? opciok.uzenet : null;
    this._ujraHivas = typeof opciok.ujra === 'function' ? opciok.ujra : null;
    this._fomenuHivas = typeof opciok.fomenu === 'function' ? opciok.fomenu : null;

    /**
     * Az idősor. A hívó ADHAT sajátot (`opciok.gyujto`) — így a gyűjtés a
     * meccs kezdetétől mehet akkor is, ha a panelt később mountolják.
     */
    this.gyujto = opciok.gyujto || new StatisztikaGyujto(sim);

    this._enabled = true;
    this._nyitva = false;
    this._vegeMutat = false;
    this._ful = CSOPORT[0].kulcs;
    this._rajzoltValtozat = -1;
    this._rajzoltFul = '';
    this._utolsoElo = -1e9;
    this._utolsoVegTick = -1e9;
    this._elozo = new Map();
    /** Újrahasznált pillanatkép-edény: a fejléc képkockánként sem allokál. */
    this._edeny = { a: {}, b: {} };

    if (typeof document === 'undefined' || !gyoker) return;
    this._epit();
    this._billentyu = (ev) => this._billentyuKezel(ev);
    window.addEventListener('keydown', this._billentyu);
  }

  // ── FELÉPÍTÉS (EGYSZER) ─────────────────────────────────────────────

  _epit() {
    const gy = this.gyoker;
    gy.classList.add('aoc-stat');
    gy.classList.add('aoc-stat-rejtve');

    // ── A LAP ────────────────────────────────────────────────────────
    // A lap SAJÁT rejtő-jelzőt kap, nem csak a gyökérét: a meccs-vége
    // képernyő attól is megjelenhet, hogy a játékos SOSEM nyitotta meg a
    // statisztikát — ilyenkor a mögötte átderengő, sosem kért panel csak zavar.
    const lap = this._div(gy, 'aoc-stat-lap aoc-stat-rejtve');
    this._lap = lap;

    const fej = this._div(lap, 'aoc-stat-fej');
    const cimDoboz = this._div(fej, 'aoc-stat-cim');
    cimDoboz.innerHTML = ikonSvg(IKON.KORSZAK, 20) + '<span>Statisztika</span>';
    this._ido = this._div(fej, 'aoc-stat-ido');
    // ⚠️ AZ ÉRTÉK KÜLÖN ELEM, NEM `innerHTML`-BE ÍRT SZÖVEG. Az `innerHTML`-lel
    // beírt `<b>`-t minden frissítésnél újra ki kellene keresni, és az ikon is
    // újraépülne — másodpercenként ötször, feleslegesen.
    this._ido.innerHTML = ikonSvg(IKON.IDO, 16);
    this._idoErtek = document.createElement('b');
    this._idoErtek.textContent = '0:00';
    this._ido.appendChild(this._idoErtek);

    this._fulek = this._div(fej, 'aoc-stat-fulek');
    this._fulGombok = new Map();
    for (const cs of CSOPORT) this._fulGomb(cs.kulcs, cs.nev);
    this._fulGomb('merleg', 'Mérleg');

    const zar = document.createElement('button');
    zar.type = 'button';
    zar.className = 'aoc-stat-zar';
    zar.title = 'Bezárás (Esc)';
    zar.textContent = '×';
    zar.addEventListener('click', () => this.zar());
    fej.appendChild(zar);

    // ── ÉLŐ FEJLÉC: a két csapat pillanatnyi számai ───────────────────
    this._elo = this._div(lap, 'aoc-stat-elo');
    this._eloMezok = [];
    for (let cs = 0; cs < 2; cs++) {
      const d = this._div(this._elo, 'aoc-stat-elo-csapat aoc-stat-cs' + cs);
      const nev = this._div(d, 'aoc-stat-elo-nev');
      nev.textContent = (cs === this.csapat ? 'Te — ' : '') + CSAPAT_NEV[cs];
      const mezok = {};
      for (const k of ['nyersOsszes', 'nepesseg', 'katonaiEro', 'epulet', 'felfedezve']) {
        const s = SOROZAT.find((x) => x.kulcs === k);
        const m = this._div(d, 'aoc-stat-elo-mezo');
        m.innerHTML = ikonSvg(s.ikon, 15);
        const b = document.createElement('b');
        b.textContent = '0';
        m.appendChild(b);
        m.title = s.nev;
        mezok[k] = b;
      }
      this._eloMezok.push(mezok);
    }

    // ── TEST: grafikon-rács ─────────────────────────────────────────
    this._test = this._div(lap, 'aoc-stat-test');
    this._racs = this._div(this._test, 'aoc-stat-racs');
    this._kartyak = [];
    for (const s of SOROZAT) this._kartyak.push(this._kartya(s));

    // ── TEST: mérleg-fül ───────────────────────────────────────────
    this._merlegDoboz = this._div(this._test, 'aoc-stat-merleg');
    this._merlegDoboz.classList.add('aoc-stat-rejtve');
    this._merlegTabla = this._div(this._merlegDoboz, 'aoc-stat-tabla');
    const fCim = this._div(this._merlegDoboz, 'aoc-stat-alcim');
    fCim.textContent = 'Fordulópontok';
    this._forduloLista = this._div(this._merlegDoboz, 'aoc-stat-fordulok');

    // ── LÁB: az állás-sáv ──────────────────────────────────────────
    const lab = this._div(lap, 'aoc-stat-lab');
    this._allasSav = this._div(lab, 'aoc-stat-sav');
    this._allasA = this._div(this._allasSav, 'aoc-stat-sav-resz aoc-stat-cs0');
    this._allasB = this._div(this._allasSav, 'aoc-stat-sav-resz aoc-stat-cs1');
    this._allasSzoveg = this._div(lab, 'aoc-stat-allas-szoveg');
    const megjegyzes = this._div(lab, 'aoc-stat-megjegyzes');
    // ⚠️ EZ A MONDAT NEM DÍSZ, és a v0.17-ben sem lett azzá. A meccsnek MOST
    // MÁR van hivatalos vége (`gyozelem.js`) — de ez a sáv nem azt mutatja,
    // hanem a MÉRCÉK szerinti állást, ami a futó meccs alatt is olvasható.
    // A kettő nem ugyanaz: vezethet az, aki utána veszít. A hivatalos eredmény
    // a meccs-vége képernyőn jelenik meg, `veg.hivatalos` alapján.
    megjegyzes.textContent =
      'Állás-olvasat a mércék súlyozása szerint — nem ez dönti el a meccset.';

    // ── MECCS VÉGE KÉPERNYŐ ────────────────────────────────────────
    this._vege = this._div(gy, 'aoc-stat-vege aoc-stat-rejtve');
    const vlap = this._div(this._vege, 'aoc-stat-vege-lap');
    this._vegeCim = this._div(vlap, 'aoc-stat-vege-cim');
    this._vegeOk = this._div(vlap, 'aoc-stat-vege-ok');
    this._vegeTabla = this._div(vlap, 'aoc-stat-tabla');
    const vfCim = this._div(vlap, 'aoc-stat-alcim');
    vfCim.textContent = 'Ezen múlt';
    this._vegeFordulok = this._div(vlap, 'aoc-stat-fordulok');
    this._vegeMegjegyzes = this._div(vlap, 'aoc-stat-megjegyzes');
    const gombok = this._div(vlap, 'aoc-stat-gombok');
    this._gomb(gombok, 'Részletes statisztika', 'aoc-stat-gomb-masodlagos', () => {
      this._vege.classList.add('aoc-stat-rejtve');
      this._vegeMutat = false;
      this.nyit('merleg');
    });
    this._gomb(gombok, 'Újra', 'aoc-stat-gomb-elsodleges', () => this._kilep('ujra'));
    this._gomb(gombok, 'Főmenü', 'aoc-stat-gomb-masodlagos', () => this._kilep('fomenu'));
  }

  _div(szulo, osztaly) {
    const d = document.createElement('div');
    d.className = osztaly;
    szulo.appendChild(d);
    return d;
  }

  _gomb(szulo, szoveg, osztaly, hivas) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'aoc-stat-gomb ' + osztaly;
    b.textContent = szoveg;
    b.addEventListener('click', hivas);
    szulo.appendChild(b);
    return b;
  }

  _fulGomb(kulcs, nev) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'aoc-stat-ful';
    b.textContent = nev;
    b.addEventListener('click', () => this._fulValt(kulcs));
    this._fulek.appendChild(b);
    this._fulGombok.set(kulcs, b);
  }

  /**
   * Egy grafikon-kártya. Az SVG-t kézzel rajzoljuk: külső könyvtár nincs, hogy
   * a `dist/` egyetlen fájl maradjon (lásd az `ikonok.js` ugyanezen döntését).
   */
  _kartya(leiro) {
    const k = this._div(this._racs, 'aoc-stat-kartya');
    k.dataset.csoport = leiro.csoport;

    const fej = this._div(k, 'aoc-stat-kartya-fej');
    const cim = this._div(fej, 'aoc-stat-kartya-cim');
    cim.innerHTML = ikonSvg(leiro.ikon, 15) + '<span>' + leiro.nev + '</span>';
    const ertekek = this._div(fej, 'aoc-stat-kartya-ertek');
    const ertekElem = [];
    for (let cs = 0; cs < 2; cs++) {
      const e = document.createElement('b');
      e.className = 'aoc-stat-cs' + cs;
      e.textContent = '0';
      ertekek.appendChild(e);
      ertekElem.push(e);
    }

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + G.teljesSz + ' ' + G.teljesMag);
    svg.setAttribute('class', 'aoc-stat-abra');
    svg.setAttribute('preserveAspectRatio', 'none');

    const racsG = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(racsG);

    const rajzG = document.createElementNS(SVG_NS, 'g');
    rajzG.setAttribute('transform', 'translate(' + G.x + ',' + G.y + ')');
    svg.appendChild(rajzG);

    const vonalak = [];
    for (let cs = 0; cs < 2; cs++) {
      const p = document.createElementNS(SVG_NS, 'polyline');
      p.setAttribute('class', 'aoc-stat-vonal aoc-stat-vonal' + cs);
      p.setAttribute('points', '');
      rajzG.appendChild(p);
      vonalak.push(p);
    }
    k.appendChild(svg);

    return { leiro, elem: k, svg, racsG, vonalak, ertekElem };
  }

  // ── NYITÁS / ZÁRÁS ─────────────────────────────────────────────────

  /** @param {string} [ful] melyik füllel nyíljon */
  nyit(ful) {
    if (!this.gyoker) return;
    if (ful) this._ful = ful;
    this._nyitva = true;
    this.gyoker.classList.remove('aoc-stat-rejtve');
    this._lap.classList.remove('aoc-stat-rejtve');
    this._rajzoltValtozat = -1;          // nyitáskor mindig friss kép
    this._fulRajz();
  }

  zar() {
    if (!this.gyoker) return;
    this._nyitva = false;
    this._lap.classList.add('aoc-stat-rejtve');
    if (!this._vegeMutat) this.gyoker.classList.add('aoc-stat-rejtve');
  }

  /** Nyit/zár — a HUD gombja és az F4 ezt hívja. */
  valt() { if (this._nyitva) this.zar(); else this.nyit(); }

  get nyitva() { return this._nyitva; }

  /**
   * MECCS VÉGE KÉPERNYŐ.
   *
   * Külön hívható, hogy a meccs-életciklus gazdája (aki tud a hálózatról és a
   * feladásról) akkor is meg tudja mutatni, ha a de facto kiesés-figyelő nem
   * szólalt meg — például ha a másik játékos kilépett.
   */
  mutatVeget() {
    if (!this.gyoker) return;
    this._vegeMutat = true;
    this.gyujto.mintaz(this.sim, true);        // a legutolsó pillanat is bekerül
    this._vegeRajz();
    this.gyoker.classList.remove('aoc-stat-rejtve');
    this._vege.classList.remove('aoc-stat-rejtve');
  }

  _kilep(mit) {
    if (mit === 'ujra' && this._ujraHivas) { this._ujraHivas(); return; }
    if (mit === 'fomenu' && this._fomenuHivas) { this._fomenuHivas(); return; }
    // Nincs visszahívás: eseményt küldünk. A panel nem tudhatja, ki és hogyan
    // indít új meccset — az a `main.js` dolga, és annak EGY gazdája van.
    this.gyoker.dispatchEvent(new CustomEvent('aoc-meccs-' + mit, { bubbles: true }));
    if (this._uzenet) this._uzenet(mit === 'ujra' ? 'Új meccs kérése' : 'Vissza a főmenübe', 'info');
  }

  _billentyuKezel(ev) {
    if (ev.altKey || ev.ctrlKey || ev.metaKey) return;
    // A beviteli mezőkbe gépelést nem lopjuk el (mentés-név, chat).
    const c = ev.target;
    if (c && (c.tagName === 'INPUT' || c.tagName === 'TEXTAREA' || c.isContentEditable)) return;
    if (ev.key === 'F4') { ev.preventDefault(); this.valt(); return; }
    if (ev.key === 'Escape' && this._nyitva && !this._vegeMutat) { ev.preventDefault(); this.zar(); }
  }

  _fulValt(kulcs) {
    if (this._ful === kulcs) return;
    this._ful = kulcs;
    this._fulRajz();
  }

  _fulRajz() {
    for (const [k, b] of this._fulGombok) b.classList.toggle('aoc-stat-ful-aktiv', k === this._ful);
    const merleg = this._ful === 'merleg';
    this._racs.classList.toggle('aoc-stat-rejtve', merleg);
    this._merlegDoboz.classList.toggle('aoc-stat-rejtve', !merleg);
    for (const k of this._kartyak) {
      k.elem.classList.toggle('aoc-stat-rejtve', merleg || k.leiro.csoport !== this._ful);
    }
    this._rajzoltValtozat = -1;
    this._rajzoltFul = this._ful;
  }

  // ── KÉPKOCKA ───────────────────────────────────────────────────────

  /**
   * @param {import('../sim/sim.js').Sim} sim
   * @param {number} most `performance.now()` — CSAK a DOM-írás ritkítására; a
   *   mintavétel tick-alapú (lásd az adatréteg fejlécét).
   */
  frissit(sim, most) {
    if (!this._enabled || !this.gyoker) return;

    // 1. MINTAVÉTEL — akkor is, ha a panel rejtve van. Egyetlen egész-
    //    összehasonlítás, ha még nem jött el a következő tick.
    this.gyujto.mintaz(sim);

    // 2. VÉGE-FIGYELŐ — másodpercenként kétszer, nem képkockánként: a
    //    `vegallapot` végigjárja az egységeket és az épületeket.
    if (!this._vegeMutat && sim.tick - this._utolsoVegTick >= VEG_TICK) {
      this._utolsoVegTick = sim.tick;
      if (vegallapot(sim).vege) { this.mutatVeget(); return; }
    }

    if (!this._nyitva || this._vegeMutat) return;

    // 3. ÉLŐ SZÁMOK — ritkítva és csak eltérésre.
    if (most - this._utolsoElo >= ELO_MS) {
      this._utolsoElo = most;
      this._eloRajz(sim);
    }

    // 4. GÖRBÉK — CSAK új mintára. Új minta 5 másodpercenként van; e nélkül a
    //    19 kártya SVG-je képkockánként újraíródna.
    if (this._rajzoltValtozat !== this.gyujto.valtozat) {
      this._rajzoltValtozat = this.gyujto.valtozat;
      if (this._ful === 'merleg') this._merlegRajz(sim);
      else this._gorbekRajz();
    }
  }

  _ir(kulcs, elem, szoveg) {
    if (!elem) return;
    if (this._elozo.get(kulcs) === szoveg) return;
    this._elozo.set(kulcs, szoveg);
    elem.textContent = szoveg;
  }

  _eloRajz(sim) {
    this._ir('ido', this._idoErtek, idoSzoveg(sim.tick));
    const a = allas(sim, this._edeny);
    for (let cs = 0; cs < 2; cs++) {
      const p = a.pillanat[cs];
      const m = this._eloMezok[cs];
      this._ir('e' + cs + 'ny', m.nyersOsszes, szamSzoveg(p.nyersOsszes));
      this._ir('e' + cs + 'np', m.nepesseg, p.nepesseg + '/' + p.nepessegMax);
      this._ir('e' + cs + 'er', m.katonaiEro, szamSzoveg(p.katonaiEro));
      this._ir('e' + cs + 'ep', m.epulet, String(p.epulet));
      this._ir('e' + cs + 'fk', m.felfedezve, p.felfedezve + '%');
    }
    const sz = Math.round(a.pont[0]);
    this._allasA.style.width = sz + '%';
    this._allasB.style.width = (100 - sz) + '%';
    this._ir('allas', this._allasSzoveg,
      a.szoveg + ' — ' + Math.round(a.pont[0]) + ' : ' + Math.round(a.pont[1]));
  }

  _gorbekRajz() {
    const gy = this.gyujto;
    for (const k of this._kartyak) {
      if (k.leiro.csoport !== this._ful) continue;
      const kulcs = k.leiro.kulcs;
      const hat = gy.hatar(kulcs);
      // A halmozott sorozat mindig 0-tól indul; a pillanatnyinál a valódi
      // minimum a tengely alja, különben a 8 és 9 közti ingás nem látszana.
      const also = k.leiro.halmozott ? 0 : Math.min(0, hat.min);
      const teto = Math.max(tengelyTeto(gy, kulcs), also + 1);
      this._racsRajz(k, teto, also);
      for (let cs = 0; cs < 2; cs++) {
        const s = gy.sorozat(kulcs, cs);
        k.vonalak[cs].setAttribute('points',
          vonalUt(s.tomb, s.db, G.sz, G.mag, teto, also));
        this._ir('k' + kulcs + cs, k.ertekElem[cs], szamSzoveg(gy.utolso(kulcs, cs)));
      }
    }
  }

  /**
   * A rácsvonalak és a tengely-feliratok. Csak akkor épülnek újra, ha a
   * tengely teteje változott — a rácsnak nincs oka képkockánként újraszületni.
   */
  _racsRajz(k, teto, also) {
    const kulcs = 'r' + k.leiro.kulcs + '|' + teto + '|' + also + '|' + this.gyujto.db;
    if (k._racsKulcs === kulcs) return;
    k._racsKulcs = kulcs;
    while (k.racsG.firstChild) k.racsG.removeChild(k.racsG.firstChild);

    for (const t of ertekTengely(teto, 4)) {
      const y = G.y + G.mag - t.arany * G.mag;
      const v = document.createElementNS(SVG_NS, 'line');
      v.setAttribute('class', 'aoc-stat-racsvonal');
      v.setAttribute('x1', G.x); v.setAttribute('x2', G.x + G.sz);
      v.setAttribute('y1', y); v.setAttribute('y2', y);
      k.racsG.appendChild(v);
      const c = document.createElementNS(SVG_NS, 'text');
      c.setAttribute('class', 'aoc-stat-tengely');
      c.setAttribute('x', G.x - 5); c.setAttribute('y', y + 3);
      c.setAttribute('text-anchor', 'end');
      c.textContent = t.cimke;
      k.racsG.appendChild(c);
    }
    for (const t of idoTengely(this.gyujto, 3)) {
      const c = document.createElementNS(SVG_NS, 'text');
      c.setAttribute('class', 'aoc-stat-tengely');
      c.setAttribute('x', G.x + t.arany * G.sz);
      c.setAttribute('y', G.y + G.mag + 14);
      c.setAttribute('text-anchor', t.arany === 0 ? 'start' : (t.arany === 1 ? 'end' : 'middle'));
      c.textContent = t.cimke;
      k.racsG.appendChild(c);
    }
  }

  // ── MÉRLEG ─────────────────────────────────────────────────────────

  _merlegRajz(sim) {
    const m = merleg(this.gyujto, sim, this.csapat);
    this._tablaRajz(this._merlegTabla, m);
    this._forduloRajz(this._forduloLista, m.fordulopontok);
  }

  _vegeRajz() {
    const m = merleg(this.gyujto, this.sim, this.csapat);
    this._vegeCim.textContent = m.cim;
    this._vegeCim.dataset.allapot = m.veg.vege
      ? (m.veg.gyoztes === this.csapat ? 'gyozelem' : (m.veg.gyoztes < 0 ? 'dontetlen' : 'vereseg'))
      : 'allas';
    this._vegeOk.textContent = (m.veg.ok || m.allas.szoveg) + ' · ' + m.ido + ' játékidő';
    this._tablaRajz(this._vegeTabla, m);
    this._forduloRajz(this._vegeFordulok, m.fordulopontok);
    // A v0.17 óta a `hivatalos: true` a normális eset — akkor nincs mit
    // mentegetni, az eredmény eredmény. A megjegyzés arra a KÉT esetre maradt,
    // amikor a mérleg nem a sim ítélete: a még futó meccsre, és a de facto
    // kiesésre (a sim szabálya nem sült el, de az egyik félnek nem maradt semmi).
    this._vegeMegjegyzes.textContent = m.hivatalos
      ? ''
      : (m.veg.vege
        ? 'Nem hivatalos: a szimuláció győzelmi szabálya nem sült el, ez a kép a de facto kiesésből olvasva.'
        : 'A meccs még tart — ez az állásból olvasott kép, nem végeredmény.');
  }

  /** A táblázat teljes újraépítése. Ritka esemény (fül-váltás, meccs vége). */
  _tablaRajz(doboz, m) {
    while (doboz.firstChild) doboz.removeChild(doboz.firstChild);
    const fej = this._div(doboz, 'aoc-stat-sor aoc-stat-sor-fej');
    this._div(fej, 'aoc-stat-cella-nev').textContent = 'Mutató';
    for (let cs = 0; cs < 2; cs++) {
      const c = this._div(fej, 'aoc-stat-cella aoc-stat-cs' + cs);
      c.textContent = (cs === m.sajatCsapat ? 'Te — ' : '') + CSAPAT_NEV[cs];
    }
    let csoport = '';
    for (const s of m.sorok) {
      if (s.csoport !== csoport) {
        csoport = s.csoport;
        const cs = CSOPORT.find((x) => x.kulcs === csoport);
        const fe = this._div(doboz, 'aoc-stat-csoportfej');
        fe.textContent = cs ? cs.nev : csoport;
      }
      const sor = this._div(doboz, 'aoc-stat-sor');
      const nev = this._div(sor, 'aoc-stat-cella-nev');
      nev.innerHTML = ikonSvg(s.ikon, 14) + '<span>' + s.nev + '</span>';
      for (let cs = 0; cs < 2; cs++) {
        const c = this._div(sor, 'aoc-stat-cella aoc-stat-cs' + cs
          + (s.vezet === cs ? ' aoc-stat-vezet' : ''));
        c.textContent = szamSzoveg(s.ertek[cs]);
      }
    }
  }

  _forduloRajz(doboz, lista) {
    while (doboz.firstChild) doboz.removeChild(doboz.firstChild);
    if (!lista.length) {
      const u = this._div(doboz, 'aoc-stat-ures');
      u.textContent = 'Még nem történt fordulópont.';
      return;
    }
    for (const f of lista) {
      const s = this._div(doboz, 'aoc-stat-fordulo aoc-stat-cs' + f.csapat);
      const i = this._div(s, 'aoc-stat-fordulo-ikon');
      i.innerHTML = ikonSvg(f.ikon, 15);
      const t = this._div(s, 'aoc-stat-fordulo-ido');
      t.textContent = f.ido;
      const sz = this._div(s, 'aoc-stat-fordulo-szoveg');
      sz.textContent = f.szoveg;
    }
  }

  // ── SZERZŐDÉS ──────────────────────────────────────────────────────

  set enabled(v) {
    this._enabled = !!v;
    if (this.gyoker) this.gyoker.style.display = v ? '' : 'none';
  }
  get enabled() { return this._enabled; }

  bont() {
    if (this._billentyu) window.removeEventListener('keydown', this._billentyu);
    this._billentyu = null;
    if (this.gyoker) this.gyoker.textContent = '';
  }
}
