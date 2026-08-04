// AGE OF THE CRYSTALS — HUD-VÁZ (v0.16).
//
// ── MIÉRT VÁZ, ÉS MIÉRT NEM „A HUD" ───────────────────────────────────────
// A v0.15-ig ez a fájl MAGA volt a HUD: ő szedte össze az adatot, ő formázott,
// ő rajzolt. Amíg egy fejlesztői szöveg-overlay volt (nyolc szám egy sorban),
// ez helyes döntés volt. Játék-HUD-ként viszont nyolc-tíz független dolog kerül
// a képernyőre — nyersanyag-sáv, építés, kijelölés, képzési sor, technológiafa,
// minimap, üzenetek, statisztika —, és ezek külön ütemben, külön adatból élnek.
// Egy fájlban ez összeér; és mivel a v0.16-ot SOK AGENT írja párhuzamosan, egy
// fájlban azonnal torlódási pont is lenne.
//
// Ezért a HUD innentől VÁZ. Ami az övé:
//
//   1. a hat MOUNT-PONT (`hud.helyek`), amibe a panelek beülnek,
//   2. a FELSŐ SÁV — nyersanyag, népesség, korszak, játékidő, sebesség-váltó,
//   3. a TANÁCSADÓ-SÁV (`hud.uzenet`),
//   4. a panelek ÉLETCIKLUSA (mount → frissit → bont).
//
// Amit NEM tud: mi van a panelek belsejében. A panel a `gyoker`-én kívülre nem
// nyúl, a váz a panel belsejébe nem nyúl. Ez a szerződés az `INTERFACES.md`
// „v0.16 — A JÁTÉKRÉTEG SZERZŐDÉSE" szakaszában áll.
//
// ── MIÉRT KAPJA EL A VÁZ A PANEL-HIBÁKAT ──────────────────────────────────
// Mert párhuzamosan írt panelek mountolódnak bele. Ha egy félkész panel
// konstruktora dob, az egy kivédetlen `for`-ciklusban MAGÁVAL VINNÉ az egész
// HUD-ot: nem lenne nyersanyag-sáv, nem lenne sebesség-váltó, és a hibaüzenet
// egy másik agent fájljára mutatna. Ezért minden panel-hívás körül `try` van, a
// hibás panel KIKAPCSOL, és a `hud.panelHibak` megmondja, melyik volt az.
//
// ── ⚠️ SZONDA-MÓD: A HUD NEM DOLGOZIK ─────────────────────────────────────
// A `?szonda=1` úton (`tools/fps_szonda.mjs`, `tools/kep.mjs`) a HUD fel sem
// épül, és a `frissit()` az első sorban visszafordul. A v0.1 óta mért lépcsők
// (100/400/800/1600) csak akkor összehasonlíthatók, ha a mérés ugyanazt a
// munkát tartalmazza — egy közben megjelent panel-sor csendben elvinne pár
// képkockát, és a lépcsők elveszítenék az alapjukat.
//
// ── ⚠️ A ZÖLD KAPU NEM MŰKÖDÉS-KAPU ───────────────────────────────────────
// Ez a projekt HATSZOR égett meg azon, hogy egy tökéletesen reprodukálható
// semmittevés zöld kaput adott. Egy HUD-nál a semmittevés így néz ki: a
// „csak változásra írj DOM-ot" gyorsítótár beragad, a szám a képernyőn 40 marad,
// a simben 4000 lesz — és MINDEN kapu zöld, mert a HUD tökéletesen konzisztens
// önmagával. Ezért van `onellenorzes()`: az nem a gyorsítótárat kérdezi (az
// önmagával mindig egyezik), hanem visszaolvassa a KÉPERNYŐN ÁLLÓ szöveget, és
// a sim MOSTANI állapotához méri. Plusz `irasDb`: ha az nem nő, miközben a
// gazdaság termel, a HUD halott. Szabotázsra mindkettő megszólal.

// ⚠️ A HÉJ CSS-ÉT A `main.js` HOZZA, NEM EZ A FÁJL.
// Nem szépészeti döntés: így ez a modul NODE-BAN IS BETÖLTHETŐ (a DOM-hívások
// mind a `document` létezésére vannak kötve), és a működés-ellenőrzés egy
// DOM-csonkkal, böngésző nélkül is futtatható. Egy `import './alap.css'` ezt
// az utat azonnal elzárná — ugyanaz a csapda, amiért a `meccs.js` sem a
// `main.js`-ben él.
import { KORSZAK_NEV } from '../sim/gazdasag.js';
import { NEHEZSEG_NEV } from '../sim/ai.js';
import { VERZIO } from '../core/config.js';
import { IKON, ikonSvg, NYERS_SZIN } from './ikonok.js';

/** Ennyi ezredmásodpercenként frissülnek a LASSÚ mezők (nyersanyag, nép). */
const LASSU_MS = 120;
/** Ennyi ezredmásodpercenként veszünk trend-mintát a nyersanyagokból. */
const TREND_MS = 2000;
/** A tanácsadó-üzenet ennyi ideig áll, utána elhalványul. */
const UZENET_MS = 5200;
/** Egy sim-tick hossza másodpercben — a játékidő ebből jön. A sim FIX 20 Hz. */
const TICK_MP = 1 / 20;

/** A hat mount-pont neve. A panel `PANEL.hely`-e ezek egyike. */
export const HELYEK = ['felso', 'also_bal', 'also_kozep', 'also_jobb', 'jobb_also', 'kepernyo'];

/**
 * A sebesség-váltó fokozatai.
 *
 * ⚠️ A 0 SZÜNET, nem „nagyon lassú". És egyik fokozat sem írja át a tick
 * hosszát: a sim FIX 20 Hz-es és determinisztikus, a szorzó CSAK azt mondja
 * meg, hány ticket futtat a gazda egy képkockában (lásd `main.js`). Ha a tick
 * hossza változna, két gép ugyanabból a seedből MÁS világot kapna, és a v0.8
 * lockstepje azonnal desyncelne.
 */
export const SEBESSEGEK = [0, 1, 2, 4];

/** A négy nyersanyag ikonja — a sáv sorrendje (NYERS: ETEL FA KO KRISTALY). */
const NYERS_IKON = [IKON.ETEL, IKON.FA, IKON.KO, IKON.KRISTALY];
const NYERS_KULCS = ['etel', 'fa', 'ko', 'kristaly'];
const NYERS_CIM = ['étel', 'fa', 'kő', 'kristály'];
/** Trend-nyilak. Fix stringek: a `frissit()` nem gyárthat karaktert. */
const TREND_JEL = ['▼', '', '▲'];

/** Az üzenet-fajták — bármi más `info`-ként megy be. */
const UZENET_FAJTAK = { info: 1, figyelem: 1, baj: 1 };
const UZENET_IKON = { info: IKON.INFO, figyelem: IKON.FIGYELEM, baj: IKON.BAJ };

export class Hud {
  /**
   * @param {import('../sim/sim.js').Sim} sim
   * @param {import('./bevitel.js').Bevitel} bevitel
   * @param {{sajatCsapat?:number, szonda?:boolean,
   *          sebessegre?:(szorzo:number)=>void}} [opciok]
   */
  constructor(sim, bevitel, opciok = {}) {
    this.sim = sim;
    this.bevitel = bevitel;
    this.csapat = opciok.sajatCsapat ?? 0;
    /** Szonda-módban a HUD fel sem épül — lásd a fejléc ⚠️ szakaszát. */
    this.szonda = !!opciok.szonda;
    this._sebessegre = opciok.sebessegre || null;

    this._enabled = true;
    this._utolsoLassu = -1e9;
    this._utolsoTrend = -1e9;
    /** Hány DOM-írás történt indulás óta. MŰKÖDÉS-SZÁM, nem statisztika. */
    this.irasDb = 0;
    /** Mezőnként az utoljára KIÍRT szöveg — enélkül minden képkocka újraírna. */
    this._elozo = new Map();
    /** A felmountolt panelek név szerint. */
    this._panelek = new Map();
    /** A mountolás sorrendje — a `frissit()` ezen megy végig (nincs iterátor-alloc). */
    this._panelLista = [];
    /** Amelyik panel dobott: `nev → hibaüzenet`. A jelentés ezt olvassa. */
    this.panelHibak = new Map();

    /** Trend-alap: a legutóbbi minta a négy nyersanyagból. */
    this._trendAlap = new Int32Array(4);
    /** −1 / 0 / +1 nyersanyagonként. */
    this._trendIrany = new Int8Array(4);
    this._trendVolt = false;
    /** Az utoljára KIÍRT számértékek — így a string sem épül fel fölöslegesen. */
    this._szamElozo = new Int32Array(8);
    this._szamVolt = false;

    this._uzenetIdo = -1e9;
    this._uzenetHalvany = true;
    /** A panelek ezt kapják meg; EGYSZER jön létre, nem képkockánként. */
    this.uzenetFv = (szoveg, fajta) => this.uzenet(szoveg, fajta);

    /** Sebesség: index a `SEBESSEGEK`-be. 1 = normál. */
    this._sebIdx = 1;
    /** A szünet ELŐTTI fokozat — a szóköz ide tér vissza. */
    this._sebElozo = 1;
    this._sebGombok = null;
    /** Volt-e már „elfogyott a hely" figyelmeztetés — csak élre szólal meg. */
    this._nepTeleVolt = false;

    this.helyek = null;
    this.gyoker = null;
    if (typeof document === 'undefined') return;
    this.gyoker = document.getElementById('hud');
    if (!this.gyoker) return;
    if (this.szonda) { this.gyoker.textContent = ''; this.gyoker.hidden = true; return; }

    this._epit();
    this._billentyuFv = (ev) => this._billentyu(ev);
    addEventListener('keydown', this._billentyuFv);
  }

  // ══════════════════════════════════════════════════════════════════════
  // VÁZ
  // ══════════════════════════════════════════════════════════════════════

  _epit() {
    const gy = this.gyoker;
    gy.textContent = '';
    gy.hidden = false;
    gy.className = 'aoc-hud';

    // Három vízszintes sáv + egy teljes képernyős fedőréteg. A középső sáv
    // nyúlik, így az alsó sáv mindig a képernyő aljára tapad — akkor is, ha
    // egy panel közben megnő.
    const felsoSor = this._div(gy, 'aoc-sor aoc-sor-felso');
    const kozepSor = this._div(gy, 'aoc-sor aoc-sor-kozep');
    const alsoSor = this._div(gy, 'aoc-sor aoc-sor-also');

    /** @type {Record<string, HTMLElement>} a hat mount-pont */
    this.helyek = {
      felso: this._div(felsoSor, 'aoc-hely aoc-hely-felso'),
      also_bal: this._div(alsoSor, 'aoc-hely aoc-hely-also-bal'),
      also_kozep: this._div(alsoSor, 'aoc-hely aoc-hely-also-kozep'),
      also_jobb: this._div(alsoSor, 'aoc-hely aoc-hely-also-jobb'),
      jobb_also: this._div(alsoSor, 'aoc-hely aoc-hely-jobb-also'),
      kepernyo: this._div(gy, 'aoc-hely aoc-hely-kepernyo'),
    };

    // A felső sáv a mount-pont ELSŐ gyereke: a `felso` helyre kérő panelek
    // mellé ülnek, nem alá.
    this._felsoSav(this.helyek.felso);

    // ── Bal oldali oszlop: tanácsadó + fejlesztői mérősor ────────────────
    const bal = this._div(kozepSor, 'aoc-kozep-bal');
    this._tanacsado = this._div(bal, 'aoc-tanacsado aoc-halvany');
    this._tanacsadoIkon = this._div(this._tanacsado, 'aoc-tanacsado-ikon');
    this._tanacsadoSzoveg = this._div(this._tanacsado, 'aoc-tanacsado-szoveg');
    this._mero = this._div(bal, 'aoc-mero');

    // ── Tartalék-kijelzők ────────────────────────────────────────────────
    // Amíg a `panel_kijeloles.js` / `panel_uzenetek.js` nincs felmountolva, a
    // váz maga mutatja a kijelölést és a bevitel üzenetét. Nem lustaság: e
    // nélkül a v0.16 félkész állapotában a játék KEVESEBBET mutatna, mint a
    // v0.15 — a panelek megjelenésekor pedig maguktól eltűnnek.
    this._tartalekKij = this._div(this.helyek.also_bal, 'aoc-tartalek');
  }

  _felsoSav(hely) {
    const sav = this._div(hely, 'aoc-felso-sav');

    // ── Nyersanyagok ──────────────────────────────────────────────────
    this._nyersErtek = [];
    this._nyersTrend = [];
    for (let f = 0; f < 4; f++) {
      const d = this._div(sav, 'aoc-nyers aoc-nyers-' + NYERS_KULCS[f]);
      d.title = NYERS_CIM[f];
      // Az ikon EGYSZER kerül be. `innerHTML` a `frissit()`-ben tilos lenne.
      const ikon = this._div(d, 'aoc-nyers-ikon');
      ikon.innerHTML = ikonSvg(NYERS_IKON[f], 20);
      const b = document.createElement('b');
      b.className = 'aoc-nyers-ertek';
      b.style.color = NYERS_SZIN[NYERS_KULCS[f]];
      d.appendChild(b);
      const t = document.createElement('span');
      t.className = 'aoc-nyers-trend';
      d.appendChild(t);
      this._nyersErtek.push(b);
      this._nyersTrend.push(t);
    }

    this._div(sav, 'aoc-elvalaszto');

    // ── Népesség · korszak · idő ──────────────────────────────────────
    this._nepDoboz = this._div(sav, 'aoc-jelzo aoc-jelzo-nep');
    this._nepErtek = this._jelzo(this._nepDoboz, IKON.NEP, 'népesség');
    this._korszakErtek = this._jelzo(this._div(sav, 'aoc-jelzo aoc-jelzo-korszak'),
      IKON.KORSZAK, 'korszak');
    this._idoErtek = this._jelzo(this._div(sav, 'aoc-jelzo aoc-jelzo-ido'),
      IKON.IDO, 'játékidő');

    // ── Sebesség-váltó ────────────────────────────────────────────────
    const seb = this._div(sav, 'aoc-sebesseg');
    seb.title = 'Játék sebessége — szóköz: szünet, +/−: fokozat';
    this._sebGombok = [];
    for (let i = 0; i < SEBESSEGEK.length; i++) {
      const g = document.createElement('button');
      g.type = 'button';
      g.className = 'aoc-seb-gomb';
      g.dataset.seb = String(SEBESSEGEK[i]);
      if (SEBESSEGEK[i] === 0) {
        g.innerHTML = ikonSvg(IKON.SZUNET, 13);
        g.title = 'Szünet (szóköz)';
      } else {
        g.textContent = SEBESSEGEK[i] + '×';
        g.title = SEBESSEGEK[i] + '× sebesség';
      }
      // A `blur()` NEM kozmetika: kattintás után a gombon marad a fókusz, és a
      // szóköz (szünet) onnantól a GOMBOT nyomná meg — a játékos „elrontott
      // szünet" élményt kapna, ami nem is a HUD hibájának látszana.
      g.addEventListener('click', () => { this._sebGomb(i); if (g.blur) g.blur(); });
      seb.appendChild(g);
      this._sebGombok.push(g);
    }
    this._sebJelol();
  }

  /** Ikonos „jelző" a felső sávban; visszaadja az ÉRTÉK-elemet. */
  _jelzo(doboz, ikonNev, cim) {
    doboz.title = cim;
    const i = this._div(doboz, 'aoc-jelzo-ikon');
    i.innerHTML = ikonSvg(ikonNev, 17);
    const b = document.createElement('b');
    b.className = 'aoc-jelzo-ertek';
    doboz.appendChild(b);
    return b;
  }

  _div(szulo, osztaly) {
    const d = document.createElement('div');
    d.className = osztaly;
    szulo.appendChild(d);
    return d;
  }

  // ══════════════════════════════════════════════════════════════════════
  // PANELEK
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Egy panel felmountolása. A váz csinálja az ÜRES gyökeret és a
   * példányosítást, a panel a `gyoker`-én kívülre nem nyúl.
   *
   * @param {string} nev a panel neve (`PANEL.nev`)
   * @param {Function} Osztaly a panel osztálya
   * @param {{nev?:string, hely?:string, cim?:string}} [leiras] a `PANEL` export
   * @returns {boolean} sikerült-e
   */
  mountol(nev, Osztaly, leiras) {
    if (this.szonda || !this.helyek) return false;
    if (typeof Osztaly !== 'function') {
      this.panelHibak.set(nev, 'nem osztály (export hiányzik?)');
      return false;
    }
    if (this._panelek.has(nev)) return true;
    const l = leiras || {};
    const helyNev = this.helyek[l.hely] ? l.hely : 'also_kozep';
    if (l.hely && !this.helyek[l.hely]) {
      // Nem némán javítjuk: az elgépelt hely-név különben „miért nincs ott a
      // panelem" órákat jelent annak, aki írta.
      console.warn('AOC HUD: a(z) "' + nev + '" panel ismeretlen helyet kért ('
        + l.hely + ') — az ismertek: ' + HELYEK.join(', '));
    }
    const gyoker = document.createElement('div');
    gyoker.className = 'aoc-panel aoc-panel-' + nev;
    if (l.cim) gyoker.dataset.cim = l.cim;
    this.helyek[helyNev].appendChild(gyoker);
    try {
      const p = new Osztaly(gyoker, this.sim, this.bevitel, {
        sajatCsapat: this.csapat,
        uzenet: this.uzenetFv,
      });
      p.__nev = nev;
      p.__gyoker = gyoker;
      this._panelek.set(nev, p);
      this._panelLista.push(p);
      if (nev === 'kijeloles' && this._tartalekKij) this._tartalekKij.hidden = true;
      return true;
    } catch (h) {
      gyoker.remove();
      this.panelHibak.set(nev, String((h && h.message) || h));
      console.error('AOC HUD: a(z) "' + nev + '" panel nem indult el —', h);
      return false;
    }
  }

  /** Egy felmountolt panel, vagy `null`. */
  panel(nev) { return this._panelek.get(nev) || null; }

  /** A felmountolt panelek nevei — a jelentéshez és a szondákhoz. */
  get panelNevek() { return Array.from(this._panelek.keys()); }

  // ══════════════════════════════════════════════════════════════════════
  // TANÁCSADÓ-SÁV
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Tanácsadó-üzenet. A `panel_uzenetek.js` eteti, de bárki hívhatja.
   * @param {string} szoveg
   * @param {'info'|'figyelem'|'baj'} [fajta]
   */
  uzenet(szoveg, fajta) {
    if (this.szonda || !this._tanacsado) return;
    const f = UZENET_FAJTAK[fajta] ? fajta : 'info';
    const sz = szoveg == null ? '' : String(szoveg);
    if (!sz) { this._uzenetIdo = -1e9; return; }
    // Ugyanaz az üzenet ugyanazzal a fajtával: csak az órát toljuk, DOM-hoz
    // nem nyúlunk. Egy másodpercenként ismételt figyelmeztetés különben
    // képkockánként újratördelné a sávot.
    if (this._elozo.get('uzenet') !== sz || this._elozo.get('uzenetFajta') !== f) {
      this._elozo.set('uzenet', sz);
      this._tanacsadoSzoveg.textContent = sz;
      this.irasDb++;
      if (this._elozo.get('uzenetFajta') !== f) {
        this._elozo.set('uzenetFajta', f);
        this._tanacsado.dataset.fajta = f;
        this._tanacsadoIkon.innerHTML = ikonSvg(UZENET_IKON[f], 16);
        this.irasDb++;
      }
    }
    this._uzenetIdo = this._most || 0;
    if (this._uzenetHalvany) {
      this._uzenetHalvany = false;
      this._tanacsado.classList.remove('aoc-halvany');
      this.irasDb++;
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // SEBESSÉG
  // ══════════════════════════════════════════════════════════════════════

  /** A jelenlegi sebesség-szorzó (0 = szünet). */
  get sebesseg() { return SEBESSEGEK[this._sebIdx]; }
  set sebesseg(v) {
    let i = SEBESSEGEK.indexOf(v);
    if (i < 0) i = 1;
    this._sebGomb(i);
  }
  get szunet() { return this._sebIdx === 0; }

  _sebGomb(i) {
    if (i === this._sebIdx) return;
    if (this._sebIdx !== 0) this._sebElozo = this._sebIdx;
    this._sebIdx = i;
    this._sebJelol();
    if (this._sebessegre) this._sebessegre(SEBESSEGEK[i]);
  }

  _sebJelol() {
    if (!this._sebGombok) return;
    for (let i = 0; i < this._sebGombok.length; i++) {
      const kell = i === this._sebIdx;
      const g = this._sebGombok[i];
      if (g.classList.contains('aktiv') !== kell) {
        g.classList.toggle('aktiv', kell);
        this.irasDb++;
      }
    }
    if (this.gyoker) this.gyoker.dataset.sebesseg = String(SEBESSEGEK[this._sebIdx]);
  }

  /**
   * Szóköz: szünet ki/be. `+` / `−`: fokozat.
   *
   * A `bevitel.js` billentyűivel szándékosan nincs átfedés (az T/X/H/F/G/K,
   * betű-építés, F5/F9 és Ctrl+számjegy) — ezt kézzel kell tartani, mert a két
   * kezelő egymásról nem tud.
   */
  _billentyu(ev) {
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const c = ev.target && ev.target.tagName;
    if (c === 'INPUT' || c === 'TEXTAREA' || c === 'SELECT') return;
    switch (ev.code) {
      case 'Space':
        this._sebGomb(this._sebIdx === 0 ? this._sebElozo : 0);
        break;
      case 'Equal': case 'NumpadAdd':
        this._sebGomb(Math.min(SEBESSEGEK.length - 1, this._sebIdx + 1));
        break;
      case 'Minus': case 'NumpadSubtract':
        this._sebGomb(Math.max(0, this._sebIdx - 1));
        break;
      default: return;
    }
    ev.preventDefault();
  }

  // ══════════════════════════════════════════════════════════════════════
  // KÉPKOCKA
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Írás CSAK változásra — a `textContent` értékadás az EGÉSZ csomópontot
   * újraépíti és újratördeli, 144 Hz-en ez ingyen elvitt munka.
   */
  _ir(kulcs, elem, szoveg) {
    if (!elem) return;
    if (this._elozo.get(kulcs) === szoveg) return;
    this._elozo.set(kulcs, szoveg);
    elem.textContent = szoveg;
    this.irasDb++;
  }

  /**
   * Képkocka.
   * @param {import('../sim/sim.js').Sim} sim
   * @param {number} most a HÍVÓ órája (a HUD-nak nincs sajátja)
   * @param {{fps:number, simMs:number, renderMs:number,
   *          haromszog:number, hivas:number}} [meres]
   */
  frissit(sim, most, meres) {
    if (this.szonda || !this._enabled || !this.gyoker) return;
    this._most = most;

    // A PANELEK először: a játékos SAJÁT tettére (kattintás, kijelölés) ezek
    // válaszolnak, ott a késés azonnal érződik.
    const lista = this._panelLista;
    for (let i = 0; i < lista.length; i++) {
      const p = lista[i];
      if (p.__hibas) continue;
      try {
        if (p.frissit) p.frissit(sim, most);
      } catch (h) {
        // Egy dobó panel nem viheti magával a HUD-ot. Kikapcsoljuk, és
        // megmondjuk, melyik volt — a hiba MÁS agent fájljában van.
        p.__hibas = true;
        this.panelHibak.set(p.__nev, String((h && h.message) || h));
        console.error('AOC HUD: a(z) "' + p.__nev + '" panel frissítése dobott —', h);
      }
    }

    // Tartalék-kijelölés, amíg nincs `panel_kijeloles`.
    if (this._tartalekKij && !this._panelek.has('kijeloles')) {
      this._ir('tartalekKij', this._tartalekKij, this.bevitel.hudSzoveg());
    }
    // Tartalék-üzenet, amíg nincs `panel_uzenetek`: a bevitel visszajelzése
    // (elutasított parancs, mentés) különben sehol nem látszana.
    if (!this._panelek.has('uzenetek')) {
      const u = this.bevitel.uzenet();
      if (u && this._elozo.get('uzenet') !== u) this.uzenet(u, 'figyelem');
    }

    if (meres) this._meroSor(sim, meres);
    this._uzenetHalvanyit(most);

    // A LASSÚ mezők ritkábban: ezek a szimuláció számai, és a szem úgysem
    // követi képkockánként.
    if (most - this._utolsoLassu < LASSU_MS) return;
    this._utolsoLassu = most;
    this._felsoFrissit(sim, most);
  }

  /** A felső sáv — a HUD lelke. Külön metódus, mert az `onellenorzes` is hívja. */
  _felsoFrissit(sim, most) {
    const cs = this.csapat;
    const g = sim.gazdasag.allapot(cs);
    const sz = this._szamElozo;

    // Nyersanyagok. Előbb SZÁMOT hasonlítunk, csak eltérésre gyártunk stringet
    // — így az állandósult állapotban egyetlen bájt sem allokálódik.
    const e0 = g.etel, e1 = g.fa, e2 = g.ko, e3 = g.kristaly;
    if (!this._szamVolt || sz[0] !== e0) { sz[0] = e0; this._nyersIr(0, e0); }
    if (!this._szamVolt || sz[1] !== e1) { sz[1] = e1; this._nyersIr(1, e1); }
    if (!this._szamVolt || sz[2] !== e2) { sz[2] = e2; this._nyersIr(2, e2); }
    if (!this._szamVolt || sz[3] !== e3) { sz[3] = e3; this._nyersIr(3, e3); }

    // Népesség.
    if (!this._szamVolt || sz[4] !== g.nepesseg || sz[5] !== g.nepessegMax) {
      sz[4] = g.nepesseg; sz[5] = g.nepessegMax;
      this._nepErtek.textContent = g.nepesseg + ' / ' + g.nepessegMax;
      this.irasDb++;
      const tele = g.nepesseg >= g.nepessegMax;
      if (tele !== this._nepTeleVolt) {
        this._nepTeleVolt = tele;
        this._nepDoboz.classList.toggle('tele', tele);
        this.irasDb++;
        // Élre szólal meg, nem folyamatosan: ez tanács, nem szirénázás.
        if (tele) this.uzenet('Elfogyott a hely — építs házat! (N)', 'figyelem');
      }
    }

    // Korszak + hátralévő idő. A `valtasHatra` tickben jön.
    const hatra = g.valtasHatra ? Math.ceil(g.valtasHatra * TICK_MP) : 0;
    if (!this._szamVolt || sz[6] !== g.korszak || sz[7] !== hatra) {
      sz[6] = g.korszak; sz[7] = hatra;
      this._korszakErtek.textContent = hatra
        ? KORSZAK_NEV[g.korszak] + ' → ' + hatra + ' mp'
        : KORSZAK_NEV[g.korszak];
      this.irasDb++;
    }

    // Játékidő a SIM órájából, nem a fal-óráról: szünetben áll, 4×-en négyszer
    // olyan gyorsan telik — a játékos ezt a világ idejének látja, és az is.
    this._ir('ido', this._idoErtek, this._ido(sim.tick));

    this._szamVolt = true;
    this._trend(most, e0, e1, e2, e3);

    // A gépi ellenfél szintje — a `data-ellenfel` a CSS-nek és a szondának is
    // olvasható nyom arról, mi ellen játszunk.
    const ai = sim.ai.osszesites(1 - cs);
    if (ai.aktiv && this._elozo.get('ai') !== ai.nehezseg) {
      this._elozo.set('ai', ai.nehezseg);
      this.gyoker.dataset.ellenfel = NEHEZSEG_NEV[ai.nehezseg];
    }
  }

  _nyersIr(f, ertek) {
    this._nyersErtek[f].textContent = ertek;
    this.irasDb++;
  }

  /** mm:ss (egy óra fölött h:mm:ss) — csak akkor épül string, ha változott. */
  _ido(tick) {
    const mp = (tick * TICK_MP) | 0;
    const s = mp % 60, p = ((mp / 60) | 0) % 60, o = (mp / 3600) | 0;
    const ss = s < 10 ? '0' + s : '' + s;
    if (o > 0) return o + ':' + (p < 10 ? '0' + p : p) + ':' + ss;
    return p + ':' + ss;
  }

  /**
   * Trend-nyilak. Két minta KÜLÖNBSÉGE dönt, nem a pillanatnyi termelés: a
   * készlet minden költésnél megugrik lefelé, egy képkockányi delta ezért
   * villogna. `TREND_MS`-enként veszünk mintát.
   */
  _trend(most, e0, e1, e2, e3) {
    if (most - this._utolsoTrend < TREND_MS) return;
    this._utolsoTrend = most;
    const a = this._trendAlap;
    if (this._trendVolt) {
      this._trendEgy(0, e0 - a[0]);
      this._trendEgy(1, e1 - a[1]);
      this._trendEgy(2, e2 - a[2]);
      this._trendEgy(3, e3 - a[3]);
    }
    a[0] = e0; a[1] = e1; a[2] = e2; a[3] = e3;
    this._trendVolt = true;
  }

  _trendEgy(f, delta) {
    const irany = delta > 0 ? 1 : (delta < 0 ? -1 : 0);
    if (this._trendIrany[f] === irany) return;
    this._trendIrany[f] = irany;
    const t = this._nyersTrend[f];
    t.textContent = TREND_JEL[irany + 1];
    t.dataset.irany = irany > 0 ? 'no' : (irany < 0 ? 'fogy' : 'all');
    this.irasDb++;
  }

  _meroSor(sim, meres) {
    this._ir('mero', this._mero,
      'v' + VERZIO + '  ·  ' + meres.fps.toFixed(0) + ' FPS'
      + '  ·  sim ' + meres.simMs.toFixed(2) + ' / render ' + meres.renderMs.toFixed(2) + ' ms'
      + '  ·  egység ' + sim.egysegek.db + '  ·  tick ' + sim.tick
      + '  ·  △ ' + (meres.haromszog / 1000).toFixed(0) + 'k / ' + meres.hivas + ' hívás');
  }

  _uzenetHalvanyit(most) {
    if (this._uzenetHalvany) return;
    if (most - this._uzenetIdo < UZENET_MS) return;
    this._uzenetHalvany = true;
    this._tanacsado.classList.add('aoc-halvany');
    this.irasDb++;
  }

  // ══════════════════════════════════════════════════════════════════════
  // MŰKÖDÉS-ELLENŐRZÉS  (lásd a fejléc ⚠️ szakaszát)
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Egyezik-e a KÉPERNYŐN ÁLLÓ szöveg a sim MOSTANI állapotával?
   *
   * Szándékosan NEM a `_elozo` gyorsítótárból dolgozik: az önmagával mindig
   * egyezik, tehát pont a legveszélyesebb hibát (beragadt gyorsítótár, rossz
   * mezőre kötött adat) NEM venné észre. Ehelyett kikényszerít egy frissítést,
   * majd a DOM `textContent`-jét olvassa vissza.
   *
   * ELTÉRÉS ESETÉN JAVÍT is: eldobja a gyorsítótárat és újraír. A jelentés
   * ettől függetlenül a javítás ELŐTTI állapotot mondja (`elteres` > 0,
   * `javitva: true`) — a kapunak szólnia KELL, de a játékos képernyője attól
   * még ne maradjon hazug.
   *
   * @returns {{egyezik:boolean, elteres:number, irasDb:number, javitva:boolean,
   *            mezok:Array<{kulcs:string, kepernyo:string, sim:string}>}}
   */
  onellenorzes(sim) {
    const s = sim || this.sim;
    const ki = { egyezik: true, elteres: 0, irasDb: this.irasDb, javitva: false, mezok: [] };
    if (this.szonda || !this.gyoker || !this._nyersErtek) {
      ki.egyezik = false;
      ki.mezok.push({ kulcs: 'hud', kepernyo: '(nincs felépítve)', sim: 'kellene' });
      ki.elteres = 1;
      return ki;
    }
    // Kikényszerített frissítés: a lassú mezők különben 120 ms-ig „elavultak"
    // lehetnének, és az hamis riasztást adna. A gyorsítótárat itt SZÁNDÉKOSAN
    // nem dobjuk el — ha eldobnánk, épp a beragadt gyorsítótárat nem vennénk
    // észre, vagyis a vizsgálat saját magát tenné vakká.
    this._felsoFrissit(s, this._most || 0);

    const g = s.gazdasag.allapot(this.csapat);
    const varhato = [String(g.etel), String(g.fa), String(g.ko), String(g.kristaly)];
    for (let f = 0; f < 4; f++) {
      const van = this._nyersErtek[f].textContent;
      if (van !== varhato[f]) {
        ki.elteres++;
        ki.mezok.push({ kulcs: NYERS_KULCS[f], kepernyo: van, sim: varhato[f] });
      }
    }
    const nepVar = g.nepesseg + ' / ' + g.nepessegMax;
    if (this._nepErtek.textContent !== nepVar) {
      ki.elteres++;
      ki.mezok.push({ kulcs: 'nep', kepernyo: this._nepErtek.textContent, sim: nepVar });
    }
    const korVar = g.valtasHatra
      ? KORSZAK_NEV[g.korszak] + ' → ' + Math.ceil(g.valtasHatra * TICK_MP) + ' mp'
      : KORSZAK_NEV[g.korszak];
    if (this._korszakErtek.textContent !== korVar) {
      ki.elteres++;
      ki.mezok.push({ kulcs: 'korszak', kepernyo: this._korszakErtek.textContent, sim: korVar });
    }
    const idoVar = this._ido(s.tick);
    if (this._idoErtek.textContent !== idoVar) {
      ki.elteres++;
      ki.mezok.push({ kulcs: 'ido', kepernyo: this._idoErtek.textContent, sim: idoVar });
    }
    ki.egyezik = ki.elteres === 0;
    if (!ki.egyezik) {
      // Jelenteni ÉS javítani. A gyorsítótár eldobása után a következő
      // `_felsoFrissit` mindent újraír, tehát a hazug szám nem marad ott a
      // képernyőn a következő értékváltozásig.
      this._szamVolt = false;
      this._elozo.delete('ido');
      this._felsoFrissit(s, this._most || 0);
      ki.javitva = true;
    }
    return ki;
  }

  /** Pillanatkép a vázról — a jelentéshez és a kézi próbához. */
  allapot() {
    return {
      verzio: VERZIO,
      szonda: this.szonda,
      sebesseg: this.sebesseg,
      irasDb: this.irasDb,
      panelek: this.panelNevek,
      hibak: Array.from(this.panelHibak.entries()).map((e) => e[0] + ': ' + e[1]),
    };
  }

  // ══════════════════════════════════════════════════════════════════════

  set enabled(v) {
    this._enabled = !!v;
    if (this.gyoker) this.gyoker.style.display = v ? '' : 'none';
  }
  get enabled() { return this._enabled; }
  /** A réteg-szerződés miatt — a HUD nem rajzol háromszöget. */
  get haromszog() { return 0; }

  /** A meccs végén: a panelek eseménykezelői is lejönnek. */
  bont() {
    if (this._billentyuFv) removeEventListener('keydown', this._billentyuFv);
    for (let i = 0; i < this._panelLista.length; i++) {
      const p = this._panelLista[i];
      try { if (p.bont) p.bont(); } catch (h) { /* a bontás sose dőljön el */ }
    }
    this._panelLista.length = 0;
    this._panelek.clear();
    if (this.gyoker) { this.gyoker.textContent = ''; this.gyoker.className = ''; }
    this.helyek = null;
  }
}
