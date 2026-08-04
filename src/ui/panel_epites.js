// AGE OF THE CRYSTALS — ÉPÍTÉS-PANEL (v0.16).
//
// ── MIÉRT LÉTEZIK ─────────────────────────────────────────────────────────
// A v0.15-ig MINDEN építés rejtett billentyű volt (`B` raktár, `N` ház, `L`
// laktanya…). A tulajdonos mai próbája ezen bukott meg: a motor v0.10-nél járt,
// a játék viszont „kb. v0.1"-nek érződött, mert nem volt MIT MEGNYOMNI. A mérce
// a TELEPESEK v1.3.1 alsó eszköztára: ikon, ár, idő, és tiltásnál INDOK.
//
// ── AMIT EZ A PANEL NEM CSINÁL ────────────────────────────────────────────
// Nem ír sim-állapotot. Egyetlen hatása van, és az a parancs-soron megy be:
//
//     sim.parancs(epitParancs(csapat, tipus, x, y))
//
// Ami megkerülné a sort, az a v0.8 lockstepjén nem menne át. Ezért nincs itt
// se `epuletek.lerak()`, se `gazdasag.levon()` — a panel KÉRDEZ (az adatréteg
// válaszol), és PARANCSOL, de nem intézkedik.
//
// ── A DÖNTÉS, AMIÉRT KÉT FÁJL VAN ─────────────────────────────────────────
// Minden szabály (mibe kerül, mikor tiltott, miért) a `panel_epites_adat.js`-ben
// van, ami DOM-mentes és node-ban fut. Ez a fájl CSAK rajzol és eseményt kezel.
// Így a szonda (`npm run p:epites`) a valódi logikát tudja számon kérni — egy
// DOM-ba zárt gombsorról csak szemmel derülne ki, hogy hazudik, a felhőben
// pedig nincs szem.
//
// ── LERAKÁSI MÓD ─────────────────────────────────────────────────────────
// Kétlépéses, ahogy a műfajban szokás: gomb → a pálya. Amíg lerakási módban
// vagyunk, a panel ELNYELI a bal gombot a vászon fölött (fogó fázisban), mert
// a `bevitel.js` ugyanarra a gombra kijelöl — enélkül minden építés-kattintás
// egyben elvenné a kijelölést, tehát a KÖVETKEZŐ épület már „nincs paraszt"
// indokkal tiltott lenne. A jobb gomb és az Esc kilép a módból.
//
// A Shift LENYOMVA TARTÁSA a módban marad (sorozatépítés: öt ház egymás után).
// Ez nem kényelmi apróság: a ház-spam a leggyakoribb művelet a korai játékban.
//
// ── ⚠️ A KURZOR-JELZŐ A GYÖKÉREN BELÜL VAN ───────────────────────────────
// A panel-szerződés 2. pontja szerint a `gyoker`-én kívülre nem nyúlhatunk —
// tehát a kurzort követő jelző NEM a `document.body` gyereke, hanem a gyökéré,
// `position: fixed`-del. Így a képernyő bármely pontján megjelenhet, miközben
// egyetlen idegen elemet sem hozunk létre, és a `bont()` egyetlen sorral
// mindent visz.

import './panel_epites.css';
import { IKON, ikonSvg } from './ikonok.js';
import {
  EPULET_DB, INDOK_DB, CSOPORT_NEV,
  ujAllapot, ujLerakas, frissitAllapot, lerakasAllapot, munkasSzam,
  epitParancs, arSzoveg, idoSzoveg, indokSzoveg, lerakasSzoveg, elemTipusbol,
} from './panel_epites_adat.js';

/** Hova kéri magát a HUD-vázon. */
export const PANEL = {
  nev: 'epites',
  hely: 'also_kozep',
  cim: 'Építés',
};

/**
 * Előre gyártott `dataset` sztringek. A `String(szam)` képkockánként allokálna
 * gombonként — tizenegy gombnál 144 Hz-en ez másodpercenként ~1600 apró
 * szemét-objektum, pont a HUD forró útján.
 */
const INDOK_STR = [];
for (let i = 0; i < INDOK_DB; i++) INDOK_STR.push(String(i));

/** A négy nyersanyag ikonja az árcímkékhez — egyszer épül fel, nem képkockánként. */
const NYERS_IKON = [IKON.ETEL, IKON.FA, IKON.KO, IKON.KRISTALY];

export class PanelEpites {
  /**
   * @param {HTMLElement} gyoker ÜRES `<div>`, a HUD-váz adja; a panel csak ebbe ír
   * @param {import('../sim/sim.js').Sim} sim
   * @param {import('./bevitel.js').Bevitel} bevitel kijelölés olvasása + parancs-beadás
   * @param {{sajatCsapat?:number, uzenet?:(szoveg:string,fajta?:string)=>void,
   *          munkasKell?:boolean, korszakTabla?:number[]}} [opciok]
   */
  constructor(gyoker, sim, bevitel, opciok = {}) {
    this.gyoker = gyoker;
    this.sim = sim;
    this.bevitel = bevitel || null;
    this.csapat = opciok.sajatCsapat
      ?? (bevitel && bevitel.kijeloles ? bevitel.kijeloles.sajatCsapat : 0);
    this._uzenetKi = typeof opciok.uzenet === 'function' ? opciok.uzenet : null;

    /** Az adatréteg opciói — a szonda ugyanezeket tudja befecskendezni. */
    this._opciok = {
      munkasDb: 0,
      munkasKell: opciok.munkasKell !== false,
      korszakTabla: opciok.korszakTabla,
    };

    this._allapot = ujAllapot();
    this._lerakas = ujLerakas();
    /** Melyik típust rakjuk épp le, vagy -1. */
    this.valasztott = -1;
    this._enabled = true;
    /** Kurzor-képpont, a vászonhoz képest. */
    this._kx = 0; this._ky = 0;
    this._kurzorLatszik = false;
    /** A kurzor-jelzőn utoljára kiírt állapot (`ok * 8 + indok`). */
    this._kurzorJel = -1;

    /**
     * Gombonkénti RAJZOLT ÁLLAPOT egyetlen egészben: `indok * 16 + hiány-maszk`.
     * Ha nem változott, a DOM-hoz hozzá sem nyúlunk (panel-szerződés 3. pont).
     */
    this._gombJel = new Int32Array(EPULET_DB).fill(-1);
    /** Ugyanez a lábléc-mondatra: típus, indok és hiány-maszk együtt. */
    this._labJel = -1;

    this._gombok = new Array(EPULET_DB);
    this._bontok = [];

    // ⚠️ AZ ÁLLAPOT A DOM ELŐTT. A gombok ÁRCÍMKÉJE egyszer épül fel (a
    // civ-kedvezmény a meccs alatt nem változik), tehát ha az `ujAllapot()`
    // csupa nullás árával építenénk, MINDEN épület „ingyen"-t írna ki, és a
    // képkockánkénti frissítés — ami csak a tiltás-állapotot nézi — sosem
    // javítaná ki. Pontosan az a hibafajta, ami zöld kapu mellett hazudik.
    frissitAllapot(sim, this.csapat, this._opciok, this._allapot);
    this._epit();
    this._kotesek();
    // Az első kirajzolás azonnal, hogy a panel ne egy képkockányit villogjon.
    this.frissit(sim, 0);
  }

  // ── FELÉPÍTÉS ──────────────────────────────────────────────────────────

  _epit() {
    const gy = this.gyoker;
    gy.classList.add('aoc-epites');

    const fej = document.createElement('div');
    fej.className = 'aoc-epites-fej';
    const cim = document.createElement('span');
    cim.className = 'aoc-epites-cim';
    cim.textContent = 'ÉPÍTÉS';
    const sugo = document.createElement('span');
    sugo.className = 'aoc-epites-sugo';
    sugo.textContent = 'válassz épületet, majd kattints a pályára';
    fej.appendChild(cim);
    fej.appendChild(sugo);
    gy.appendChild(fej);

    const racs = document.createElement('div');
    racs.className = 'aoc-epites-racs';
    this._racs = racs;

    let utolsoCsoport = -1;
    for (let k = 0; k < EPULET_DB; k++) {
      const el = this._allapot.elemek[k];
      // Csoport-elválasztó: a gazdaság, a katonai, a védelem és a kereskedelem
      // vizuálisan elkülönül. Egy tizenegy tagú, tagolatlan gombsor olvashatatlan.
      if (el.csoport !== utolsoCsoport) {
        utolsoCsoport = el.csoport;
        const v = document.createElement('span');
        v.className = 'aoc-epites-valaszto';
        v.title = CSOPORT_NEV[el.csoport];
        racs.appendChild(v);
      }
      const g = this._gomb(el, k);
      this._gombok[k] = g;
      racs.appendChild(g.gomb);
    }
    gy.appendChild(racs);

    const lab = document.createElement('div');
    lab.className = 'aoc-epites-lab';
    this._lab = lab;
    gy.appendChild(lab);

    // A kurzort követő jelző — a gyökéren BELÜL, `position: fixed`-del.
    const kurzor = document.createElement('div');
    kurzor.className = 'aoc-epites-kurzor';
    kurzor.hidden = true;
    this._kurzor = kurzor;
    gy.appendChild(kurzor);
  }

  /** Egy épület-gomb. Az `index` a megjelenítési sorrendben értendő. */
  _gomb(el, index) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'aoc-epites-gomb';
    b.dataset.k = String(index);
    b.dataset.tipus = String(el.tipus);

    const ikon = document.createElement('span');
    ikon.className = 'aoc-epites-ikon';
    // `ikonSvg` ISMERETLEN névre DOB — ez szándékos, lásd `ikonok.js`. Egy
    // elgépelt ikonnév így az indulásnál bukik, nem egy üres gombként.
    ikon.innerHTML = ikonSvg(el.ikon, 26);
    b.appendChild(ikon);

    const nev = document.createElement('span');
    nev.className = 'aoc-epites-nev';
    nev.textContent = el.nev;
    b.appendChild(nev);

    // ÁR — a nyersanyag-ikonnal, mert a szem a színt olvassa, nem a szót.
    const ar = document.createElement('span');
    ar.className = 'aoc-epites-ar';
    const arTagok = [];
    for (let f = 0; f < 4; f++) {
      if (el.ar[f] <= 0) continue;
      const t = document.createElement('em');
      t.className = 'aoc-epites-ar-tag';
      t.dataset.nyers = String(f);
      t.innerHTML = ikonSvg(NYERS_IKON[f], 12) + '<b>' + el.ar[f] + '</b>';
      ar.appendChild(t);
      arTagok.push({ elem: t, nyers: f });
    }
    if (!arTagok.length) {
      const t = document.createElement('em');
      t.className = 'aoc-epites-ar-tag';
      t.textContent = 'ingyen';
      ar.appendChild(t);
    }
    b.appendChild(ar);

    const ido = document.createElement('span');
    ido.className = 'aoc-epites-ido';
    ido.innerHTML = ikonSvg(IKON.IDO, 11) + '<b>' + idoSzoveg(el) + '</b>';
    b.appendChild(ido);

    // Méret- és szerep-jelzés. A raktár egyetlen létjogosultsága a lerakat-volta;
    // ha ezt nem írjuk ki, a játékos nem tudja, miért építené meg.
    const jel = document.createElement('span');
    jel.className = 'aoc-epites-jel';
    let jelSz = el.meret + '×' + el.meret;
    if (el.lerako) jelSz += ' · lerakat';
    if (el.nepesseg > 0) jelSz += ' · nép +' + el.nepesseg;
    jel.textContent = jelSz;
    b.appendChild(jel);

    b.title = el.nev + ' — ' + el.leiras + '\n' + arSzoveg(el) + ' · ' + idoSzoveg(el);
    return { gomb: b, ar: arTagok, elem: el, index };
  }

  // ── ESEMÉNYEK ──────────────────────────────────────────────────────────

  _kotesek() {
    // ESEMÉNY-DELEGÁLÁS: EGY figyelő a rácson, nem tizenegy a gombokon. A
    // `bont()` így egyetlen sorral tud maradéktalanul leszerelni.
    const kattint = (ev) => {
      const g = ev.target.closest ? ev.target.closest('.aoc-epites-gomb') : null;
      if (!g) return;
      this._gombra(g.dataset.tipus | 0);
    };
    this._racs.addEventListener('click', kattint);
    this._bontok.push(() => this._racs.removeEventListener('click', kattint));

    // A gomb fölé húzott egér a láblécbe írja az indokot — a tiltás magyarázata
    // ne csak a kiválasztott elemre járjon.
    const rahuz = (ev) => {
      const g = ev.target.closest ? ev.target.closest('.aoc-epites-gomb') : null;
      this._rahuzott = g ? (g.dataset.tipus | 0) : -1;
    };
    const elhuz = () => { this._rahuzott = -1; };
    this._racs.addEventListener('pointerover', rahuz);
    this._racs.addEventListener('pointerout', elhuz);
    this._bontok.push(() => {
      this._racs.removeEventListener('pointerover', rahuz);
      this._racs.removeEventListener('pointerout', elhuz);
    });
    this._rahuzott = -1;

    const v = this.bevitel && this.bevitel.vaszon;
    if (!v || typeof window === 'undefined') return;

    // ── A VÁSZON FÖLÖTTI EGÉR ────────────────────────────────────────────
    // ⚠️ FOGÓ FÁZIS (`capture`). A `bevitel.js` a `pointerdown`-t a vászonon, a
    // `pointerup`-ot pedig a WINDOW-on figyeli — buborékoló fázisban tehát nem
    // tudnánk elé kerülni. Fogó fázisban igen, és csak akkor nyelünk el
    // bármit, ha tényleg lerakási módban vagyunk.
    const mozog = (ev) => {
      this._kx = ev.offsetX; this._ky = ev.offsetY;
      if (this.valasztott >= 0) this._kurzorFrissit(ev.clientX, ev.clientY);
    };
    const le = (ev) => {
      if (this.valasztott < 0 || !this._enabled) return;
      if (ev.button === 2) { this._megse('jobb gomb'); ev.preventDefault(); ev.stopPropagation(); return; }
      if (ev.button !== 0) return;
      // Elnyeljük, hogy a `bevitel` ne kezdjen keret-kijelölésbe.
      ev.preventDefault();
      ev.stopPropagation();
    };
    const fel = (ev) => {
      if (this.valasztott < 0 || !this._enabled) return;
      if (ev.button !== 0) return;
      if (ev.target !== v) return;          // a HUD fölött felengedve ne építsünk
      ev.preventDefault();
      ev.stopPropagation();
      this._lerak(ev.offsetX, ev.offsetY, ev.shiftKey);
    };
    const menu = (ev) => { if (this.valasztott >= 0) ev.preventDefault(); };
    const gomb = (ev) => {
      if (ev.code === 'Escape' && this.valasztott >= 0) this._megse('Esc');
    };

    v.addEventListener('pointermove', mozog);
    v.addEventListener('pointerdown', le, true);
    window.addEventListener('pointerup', fel, true);
    v.addEventListener('contextmenu', menu);
    window.addEventListener('keydown', gomb);
    this._bontok.push(() => {
      v.removeEventListener('pointermove', mozog);
      v.removeEventListener('pointerdown', le, true);
      window.removeEventListener('pointerup', fel, true);
      v.removeEventListener('contextmenu', menu);
      window.removeEventListener('keydown', gomb);
    });
  }

  /** Gombnyomás: belépés a lerakási módba, vagy kilépés belőle. */
  _gombra(tipus) {
    if (!this._enabled) return;
    const el = elemTipusbol(this._allapot, tipus);
    if (!el) return;
    if (this.valasztott === tipus) { this._megse('újra rákattintás'); return; }
    if (!el.epitheto) {
      // A tiltott gomb sem néma: megmondja, MIÉRT nem megy.
      this._uzenet(el.nev + ': ' + indokSzoveg(this._allapot, el), 'figyelem');
      return;
    }
    this.valasztott = tipus;
    this._jelolesFrissit();
    this._uzenet(el.nev + ' — kattints a pályára (Esc: mégse, Shift: sorozat)', 'info');
  }

  /**
   * Kilépés a lerakási módból. A `miert === null` a SIKERES lerakás útja: ott
   * már ment üzenet („építés indul"), és egy rögtön utána érkező „megszakítva"
   * pont az ellenkezőjét állítaná annak, ami történt.
   */
  _megse(miert) {
    if (this.valasztott < 0) return;
    this.valasztott = -1;
    this._kurzorRejt();
    this._jelolesFrissit();
    if (miert !== null) this._uzenet('építés megszakítva (' + miert + ')', 'info');
  }

  /**
   * A LERAKÁS. Az EGYETLEN hely, ahol a panel hat a világra — és az is a
   * parancs-soron megy be. A sim ugyanezt még egyszer ellenőrzi; a panel
   * ellenőrzése a VISSZAJELZÉSÉRT van, nem a sim helyett.
   */
  _lerak(kepX, kepY, sorozat) {
    const p = this._vilagPont(kepX, kepY);
    if (!p) { this._uzenet('oda nem lehet építeni (nem a pályára mutatsz)', 'figyelem'); return; }
    const tipus = this.valasztott;
    const l = lerakasAllapot(this.sim, this._allapot, tipus, p.x, p.y, this._lerakas);
    if (!l.ok) {
      this._uzenet(lerakasSzoveg(this._allapot, l), 'baj');
      return;
    }
    this.sim.parancs(epitParancs(this.csapat, tipus, p.x, p.y));
    const el = elemTipusbol(this._allapot, tipus);
    this._uzenet(el.nev + ' — építés indul (' + idoSzoveg(el) + ')', 'info');
    if (!sorozat) this._megse(null);
  }

  /**
   * Világpont a vászon-képpontból. A `bevitel` már tud sugarat vetni a talajra;
   * nem írjuk meg még egyszer, mert két különböző vetítésből két különböző hely
   * lenne — a játékos azt látná, hogy „nem oda épült".
   *
   * ⚠️ A `bevitel.celPont()` a v0.16/2 óta PUBLIKUS felület, és a normál út az.
   * Az aláhúzott `_celPont` csak visszaesés, a v0.16 előtti állapotra: akkor a
   * panel egy PRIVÁT metódusra támaszkodott, és egy átnevezés NÉMÁN ölte volna
   * meg a lerakást — a panel nem dobott volna, csak sosem épült volna semmi.
   * Ha a `bevitel` egyiket sem adja, `null`-t adunk vissza, és a `_lerak()`
   * megmondja a játékosnak, hogy nem a pályára mutat; néma elhalás nincs.
   */
  _vilagPont(x, y) {
    const b = this.bevitel;
    if (!b) return null;
    if (typeof b.celPont === 'function') return b.celPont(x, y);
    if (typeof b._celPont === 'function') return b._celPont(x, y);
    return null;
  }

  // ── KÉPKOCKÁNKÉNTI FRISSÍTÉS ───────────────────────────────────────────

  /**
   * Képkockánként. NULLA allokáció, és DOM-írás CSAK változásra.
   * @param {import('../sim/sim.js').Sim} sim
   * @param {number} most
   */
  frissit(sim, most) {
    if (!this._enabled) return;
    const b = this.bevitel;
    this._opciok.munkasDb = b && b.kijeloles
      ? munkasSzam(sim, this.csapat, b.kijeloles.lista)
      : 0;
    const a = frissitAllapot(sim, this.csapat, this._opciok, this._allapot);

    for (let k = 0; k < EPULET_DB; k++) {
      const el = a.elemek[k];
      let maszk = 0;
      for (let f = 0; f < 4; f++) if (el.hiany[f] > 0) maszk |= 1 << f;
      const jel = el.indok * 16 + maszk;
      if (this._gombJel[k] === jel) continue;
      this._gombJel[k] = jel;
      this._gombRajz(this._gombok[k], el, maszk);
    }

    // A választott épület időközben tilthatóvá válhatott (elfogyott a fa, a
    // paraszt meghalt) — ilyenkor magától kilép a mód, különben a következő
    // kattintás csak egy hibaüzenet lenne.
    if (this.valasztott >= 0) {
      const el = elemTipusbol(a, this.valasztott);
      if (el && !el.epitheto) this._megse(indokSzoveg(a, el));
      else if (this._kurzorLatszik) this._kurzorErvenyesit();
    }

    this._labRajz(a);
  }

  /** Egy gomb kinézete. Csak akkor fut, ha az állapota tényleg változott. */
  _gombRajz(g, el, maszk) {
    g.gomb.dataset.indok = INDOK_STR[el.indok] || INDOK_STR[0];
    g.gomb.disabled = !el.epitheto;
    for (let i = 0; i < g.ar.length; i++) {
      const t = g.ar[i];
      const hianyzik = (maszk >> t.nyers) & 1;
      t.elem.dataset.hiany = hianyzik ? '1' : '0';
    }
  }

  /** A lábléc mondata: a rámutatott, különben a választott, különben az összegzés. */
  _labRajz(a) {
    const tipus = this._rahuzott >= 0 ? this._rahuzott : this.valasztott;
    let jel;
    let szoveg;
    if (tipus >= 0) {
      const el = elemTipusbol(a, tipus);
      let maszk = 0;
      for (let f = 0; f < 4; f++) if (el.hiany[f] > 0) maszk |= 1 << f;
      jel = (tipus + 1) * 4096 + el.indok * 16 + maszk;
      if (jel === this._labJel) return;
      szoveg = el.nev + ' — ' + el.leiras + '  ▸  ' + indokSzoveg(a, el);
    } else {
      jel = -(a.epithetoDb * 64 + a.tiltottDb);
      if (jel === this._labJel) return;
      szoveg = a.epithetoDb + ' építhető, ' + a.tiltottDb + ' tiltott'
        + (a.munkasDb > 0 ? ' · ' + a.munkasDb + ' paraszt kijelölve'
          : ' · nincs kijelölt paraszt');
    }
    this._labJel = jel;
    this._lab.textContent = szoveg;
  }

  /** A választott gomb kiemelése. Ritka esemény, itt szabad DOM-ot írni. */
  _jelolesFrissit() {
    for (let k = 0; k < EPULET_DB; k++) {
      const g = this._gombok[k];
      g.gomb.dataset.valasztott = g.elem.tipus === this.valasztott ? '1' : '0';
    }
    this.gyoker.dataset.lerakas = this.valasztott >= 0 ? '1' : '0';
    this._labJel = -1;   // a lábléc mondata a mód váltásakor újra kell
  }

  // ── KURZOR-JELZŐ ───────────────────────────────────────────────────────

  _kurzorFrissit(kepernyoX, kepernyoY) {
    const k = this._kurzor;
    k.style.left = kepernyoX + 'px';
    k.style.top = kepernyoY + 'px';
    if (!this._kurzorLatszik) { k.hidden = false; this._kurzorLatszik = true; }
    this._kurzorErvenyesit();
  }

  /**
   * Érvényes-e a lerakás a kurzor alatt? A `lerakhato` legfeljebb 3×3 cellát
   * néz meg, tehát nyugodtan futhat egérmozgásonként és képkockánként is.
   */
  _kurzorErvenyesit() {
    const p = this._vilagPont(this._kx, this._ky);
    const k = this._kurzor;
    if (!p) {
      k.dataset.ok = '0';
      k.textContent = 'nem a pályára mutatsz';
      return;
    }
    const l = lerakasAllapot(this.sim, this._allapot, this.valasztott, p.x, p.y, this._lerakas);
    const uj = l.ok ? 1 : 0;
    const jel = uj * 8 + l.indok;
    if (jel === this._kurzorJel) return;    // változatlan → nincs DOM-írás
    this._kurzorJel = jel;
    k.dataset.ok = uj ? '1' : '0';
    k.textContent = lerakasSzoveg(this._allapot, l);
  }

  _kurzorRejt() {
    if (!this._kurzorLatszik) return;
    this._kurzor.hidden = true;
    this._kurzorLatszik = false;
    this._kurzorJel = -1;
  }

  _uzenet(szoveg, fajta) {
    if (this._uzenetKi) this._uzenetKi(szoveg, fajta || 'info');
  }

  // ── SZERZŐDÉS ──────────────────────────────────────────────────────────

  set enabled(v) {
    const uj = !!v;
    if (uj === this._enabled) return;
    this._enabled = uj;
    this.gyoker.hidden = !uj;
    if (!uj) {
      // Kikapcsolva ne maradjon aktív lerakási mód: a felhasználó nem látná a
      // panelt, de a következő bal kattintás mégis épületet tenne le.
      this.valasztott = -1;
      this._kurzorRejt();
      this._jelolesFrissit();
    }
  }

  get enabled() { return this._enabled; }

  /** Eseménykezelők leszedése — a meccs végén a váz ezt hívja. */
  bont() {
    for (let i = 0; i < this._bontok.length; i++) this._bontok[i]();
    this._bontok.length = 0;
    this.valasztott = -1;
    this._kurzorRejt();
    this.gyoker.textContent = '';
    this.gyoker.classList.remove('aoc-epites');
  }
}

export default PanelEpites;
