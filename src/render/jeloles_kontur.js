// AGE OF THE CRYSTALS — TEREP-KÖVETŐ KÖRVONALAK: KERET-HÚZÁS ÉS ÉPÜLET-ALAP.
//
// Két dolog van ebben a fájlban, és nem véletlenül: mindkettő ugyanazt kérdezi
// — „a PÁLYÁN hol van az, amit a képernyőn megjelöltem?" —, és mindkettő
// ugyanazzal a `Szalag`-gal válaszol, ami rásimul a domboldalra.
//
// ── 1. A KERET-HÚZÁS A TEREPEN ────────────────────────────────────────────
// A keret eddig CSAK egy DOM-doboz volt a képernyőn. Ez a v0.2-ben helyes
// döntés volt (nulla GPU-költség, képpont-pontos), és marad is: a DOM-doboz
// mondja meg, MIT jelölök ki. Amit nem mond meg, az az, hogy a keret a PÁLYÁN
// hova esik — pedig egy döntött, forgatható kamera mellett pont ez a kérdés.
// Alacsony kameraállásnál a képernyő alsó harmadában húzott keret a pálya
// tíz egységnyi sávját fedi, a felső harmadban viszont többszázat, és ez a
// képernyő-dobozon SEMMILYEN módon nem látszik. Innen jött a tulajdonos
// panasza, hogy „kijelölök valamit, és nem azt kapom".
//
// Ezért a képernyő-doboz négy oldalát VISSZAVETÍTJÜK a magasságmezőre, és a
// terepen is kirajzoljuk. A visszavetítés a `ui/kijeloles.js` `talajPont()`-ja
// — ugyanaz a függvény, amit a parancs-kattintás használ, tehát a keret ott
// lesz a terepen, ahol a kattintás is landolna. Ha SAJÁT sugármetszést írnék
// ide, a kettő idővel elcsúszna egymástól, és pont az a hiba jönne vissza,
// ami ellen a keret készült.
//
// ⚠️ MIÉRT NEM EGYSZERŰEN A NÉGY SAROKPONTOT KÖTJÜK ÖSSZE: perspektívában a
// képernyő EGYENESE a terepen nem egyenes. Négy sarokból húzott világ-egyenes
// a horizont közelében látványosan elhajlana a valódi kijelöléstől. Ezért
// minden oldalt a KÉPERNYŐN osztunk fel `OSZTAS` pontra, és mindegyiket külön
// vetítjük vissza.
//
// ── 2. AZ ÉPÜLET ALAPTERÜLETE ─────────────────────────────────────────────
// Egy 3×3-as központ alá rajzolt karika hazugság: a játékos azt hiszi, az
// épület akkora, mint a karika, holott az alapterülete négyzet, és a
// járhatóságot IS az zárja. Az épület-jelölés ezért az igazi alapterületet
// rajzolja ki, cellahatárra igazítva — ugyanazokat a cellákat, amiket a sim
// lezárt (`EP_MERET`, `epuletek.cx/cy`).
//
// ── ⚠️ HONNAN TUDJUK, MELYIK ÉPÜLET VAN KIJELÖLVE ────────────────────────
// A kijelölés MODELLJE (`src/ui/kijeloles.js`) MÁSIK AGENT sávja, és MA nem
// ismer épület-kijelölést — csak egység-indexeket tart. Ez a réteg ezért négy
// forrásból dolgozik, ebben a sorrendben, és mindegyiket ÓVATOSAN olvassa:
//
//   a) `kijeloles.epuletek` — index-tömb, ha a modell egyszer ilyet ad
//   b) `kijeloles.epulet`   — egyetlen index, ha inkább ilyet
//   c) `epuletJeloles(idx)` — kézi bekötés bárhonnan (ma senki nem hívja)
//   d) a KIJELÖLÉSEM célépülete (`parancsAllapot.celEpulet`) — ez az egyetlen,
//      ami MA is ad képet: ha a katonáim egy ellenséges központot vernek, vagy
//      egy toronyba készülnek beszállni, annak az alapterülete kirajzolódik.
//
// A d) ág nem pótmegoldás: pont az a visszajelzés, ami eddig hiányzott. Az
// a)–c) ágak pedig azért vannak itt, hogy amikor az épület-kijelölés elkészül,
// EZT A FÁJLT NE KELLJEN ÁTÍRNI.

import { THREE } from './core3d.js';
import { feloldVaszon } from './core3d.js';
import { talajPont } from '../ui/kijeloles.js';
import { EP_MERET } from '../sim/epuletek.js';
import { Szalag, CSAPAT_SZIN, VISZONY_SZIN, VISZONY } from './jeloles_kozos.js';

/** Hány pontra osztjuk a keret EGY oldalát a képernyőn (a sarkokkal együtt). */
const OSZTAS = 7;
/** A körvonal a talaj fölött ennyivel. */
const MAGASSAG = 0.11;
/** A szalagok világ-vastagsága. */
const KERET_VASTAG = 0.30;
const EPULET_VASTAG = 0.22;

/** Legfeljebb ennyi épület kap egyszerre alapterület-jelölést. */
const MAX_EPULET = 12;

/** A keret-DOM azonosítója. A `bevitel.js` hozza létre — lásd a fejlécet. */
const KERET_ELEM_ID = 'kijelolo-keret';

export class JelolesKontur {
  /**
   * @param {THREE.Object3D} szinter
   * @param {import('../sim/sim.js').Sim} sim
   * @param {{kijeloles:any, sajatCsapat:number, bevitel?:any, vaszon?:any}} opciok
   */
  constructor(szinter, sim, opciok) {
    this.kijeloles = opciok.kijeloles || null;
    this.sajatCsapat = opciok.sajatCsapat | 0;
    this.bevitel = opciok.bevitel || null;
    this._vaszon = opciok.vaszon || null;
    this._keretElem = null;
    this._keresve = false;

    // Három szalag, mert három SZÍN kell, és egy `Szalag` egy anyagot visel.
    // Vertex-színnel egy szalag is elég lenne, de az minden csúcshoz külön
    // színpuffert jelentene — három `Mesh` olcsóbb, és üresen mindhárom
    // kiesik a jelenet-bejárásból.
    this.keret = new Szalag(szinter, 4 * (OSZTAS - 1) + 4, {
      szin: 0x7ce8a0, opacitas: 0.9, sorrend: 4,
    });
    this.sajatEp = new Szalag(szinter, MAX_EPULET * 20, {
      szin: CSAPAT_SZIN[this.sajatCsapat & 1], opacitas: 0.92, sorrend: 4,
    });
    this.idegenEp = new Szalag(szinter, MAX_EPULET * 20, {
      szin: VISZONY_SZIN[VISZONY.ELLENSEG], opacitas: 0.92, sorrend: 4,
    });

    /** Kézi épület-jelölés (lásd a fejléc c) ágát). -1 = nincs. */
    this._kezi = -1;
    /** Már felvett épület-indexek EBBEN a képkockában (számláló-bélyeg). */
    this._belyeg = new Int32Array(sim.epuletek ? sim.epuletek.maxDb : 256);
    this._kepkocka = 0;
    /** Lefutott-e már legalább egyszer az épület-körvonal rajza? */
    this._epKesz = false;
    /** Újrahasznált kimenő pont a `talajPont`-nak — nulla allokáció. */
    this._pont = { x: 0, y: 0 };

    // ── MIÉRT FIGYELÜNK EGÉRGOMBOT ─────────────────────────────────────
    // A keret-doboz kiolvasása `offsetWidth`-t olvas, ami STÍLUS- ÉS
    // ELRENDEZÉS-ÜRÍTÉST kényszeríthet. A HUD-panelek képkockánként írnak
    // DOM-ot, tehát az elrendezés jellemzően „piszkos" — egy ilyen olvasás
    // KÉPKOCKÁNKÉNT kényszerített reflow lenne, ráadásul akkor is, amikor
    // senki nem húz keretet.
    //
    // Egy bal gomb lenyomva/felengedve pár száz eseményt jelent egy meccs
    // alatt; a jelző kiolvasása utána ingyen van. Ez a réteg így a
    // MEGNYOMOTT bal gomb idején (a képkockák töredékén) nyúl csak a DOM-hoz.
    this._gombLent = false;
    this._bontok = null;
    this._egerKotes();
  }

  _egerKotes() {
    if (typeof window === 'undefined') return;
    const le = (ev) => { if (ev.button === 0) this._gombLent = true; };
    const fel = (ev) => { if (ev.button === 0) this._gombLent = false; };
    const vak = () => { this._gombLent = false; };
    window.addEventListener('pointerdown', le, { passive: true });
    window.addEventListener('pointerup', fel, { passive: true });
    window.addEventListener('blur', vak);
    this._bontok = () => {
      window.removeEventListener('pointerdown', le);
      window.removeEventListener('pointerup', fel);
      window.removeEventListener('blur', vak);
    };
  }

  ujraKot() {
    this._belyeg.fill(0); this._kepkocka = 0; this._kezi = -1; this._epKesz = false;
  }

  /** Kézi épület-jelölés bekötése (a HUD/panel hívhatja, ha egyszer akarja). */
  epuletJeloles(idx) { this._kezi = idx === undefined || idx === null ? -1 : (idx | 0); }

  /**
   * @param {import('../sim/sim.js').Sim} sim
   * @param {THREE.Camera|null} kamera
   * @param {boolean} ujTick volt-e tick-váltás ebben a képkockában
   */
  frissit(sim, kamera, ujTick) {
    // A keret az EGÉRREL mozog, tehát képkockánként kell. Az épület-körvonal
    // a SIM-mel mozog (kijelölés, célépület, pusztulás), tehát elég tickenként
    // — a `Szalag` geometriája megmarad a képkockák között, nem kell újraírni.
    this._keretRajz(sim, kamera);
    if (ujTick || !this._epKesz) { this._epuletRajz(sim); this._epKesz = true; }
  }

  // ── 1. KERET ─────────────────────────────────────────────────────────

  _keretRajz(sim, kamera) {
    this.keret.kezd(KERET_VASTAG);
    const d = this._doboz();
    if (d && kamera) {
      const v = this._vasznat();
      const szel = v ? (v.clientWidth || v.width || 0) : 0;
      const mag = v ? (v.clientHeight || v.height || 0) : 0;
      if (szel > 0 && mag > 0) this._keretSzalag(sim, kamera, d, szel, mag);
    }
    this.keret.zar();
  }

  /**
   * A húzási doboz KÉPPONTBAN, vagy `null`.
   *
   * ⚠️ Ez a réteg NEM ír DOM-ot, csak OLVAS — és kizárólag SZÁM-tulajdonságokat
   * (`offsetLeft/Top/Width/Height`). A `style.left` stringje karakterláncot
   * adna vissza, aminek a `parseFloat`-ja képkockánkénti szemét lenne; a
   * `getBoundingClientRect()` pedig egy friss objektumot. A szám-olvasás
   * nulla allokáció.
   *
   * `display: none` esetén az `offsetWidth` pontosan 0 — ez a „nem húzunk"
   * jelzés, és nem kell hozzá stílus-stringet olvasni.
   */
  _doboz() {
    if (!this._gombLent) return null;
    // Ha egyszer valaki átadja a `bevitel`-t, onnan pontosabb: nem függ attól,
    // hogy a keret-elem hogy van pozicionálva.
    const b = this.bevitel;
    if (b && b._huz) {
      const x0 = Math.min(b._huzX, b._mostX), x1 = Math.max(b._huzX, b._mostX);
      const y0 = Math.min(b._huzY, b._mostY), y1 = Math.max(b._huzY, b._mostY);
      if (x1 - x0 < 3 && y1 - y0 < 3) return null;
      const p = this._pontDoboz || (this._pontDoboz = { x0: 0, y0: 0, x1: 0, y1: 0 });
      p.x0 = x0; p.y0 = y0; p.x1 = x1; p.y1 = y1;
      return p;
    }
    const el = this._elem();
    if (!el) return null;
    const w = el.offsetWidth, h = el.offsetHeight;
    if (w === 0 || h === 0) return null;
    const p = this._pontDoboz || (this._pontDoboz = { x0: 0, y0: 0, x1: 0, y1: 0 });
    p.x0 = el.offsetLeft; p.y0 = el.offsetTop;
    p.x1 = p.x0 + w; p.y1 = p.y0 + h;
    return p;
  }

  _elem() {
    if (this._keretElem) return this._keretElem;
    if (typeof document === 'undefined') return null;
    // A keresés minden képkockában lefutna, ha nincs elem — de a
    // `getElementById` gyorstárazott, és a keret-elem a boot után létezik.
    this._keretElem = document.getElementById(KERET_ELEM_ID);
    return this._keretElem;
  }

  _vasznat() {
    if (this._vaszon) return this._vaszon;
    if (this._keresve) return null;
    this._keresve = true;
    this._vaszon = feloldVaszon(null);
    return this._vaszon;
  }

  _keretSzalag(sim, kamera, d, szel, mag) {
    const racs = sim.racs;
    const ki = this._pont;
    // A négy oldal körbe: bal-felső → jobb-felső → jobb-alsó → bal-alsó → vissza.
    // Az utolsó pont szándékosan ismétli az elsőt, hogy a szalag záruljon.
    for (let oldal = 0; oldal < 4; oldal++) {
      let ax, ay, bx, by;
      if (oldal === 0) { ax = d.x0; ay = d.y0; bx = d.x1; by = d.y0; }
      else if (oldal === 1) { ax = d.x1; ay = d.y0; bx = d.x1; by = d.y1; }
      else if (oldal === 2) { ax = d.x1; ay = d.y1; bx = d.x0; by = d.y1; }
      else { ax = d.x0; ay = d.y1; bx = d.x0; by = d.y0; }
      for (let s = oldal === 0 ? 0 : 1; s < OSZTAS; s++) {
        const t = s / (OSZTAS - 1);
        const px = ax + (bx - ax) * t;
        const py = ay + (by - ay) * t;
        const ndcX = (px / szel) * 2 - 1;
        const ndcY = -((py / mag) * 2 - 1);
        if (!talajPont(kamera, racs, ndcX, ndcY, ki)) {
          // Az égre mutató sarok (nagyon lapos kamera) nem hiba: a körvonal
          // ott egyszerűen megszakad, nem ugrik a pálya közepére.
          this.keret.szakit();
          continue;
        }
        this.keret.pont(ki.x, racs.magassagPont(ki.x, ki.y) + MAGASSAG, ki.y);
      }
    }
  }

  // ── 2. ÉPÜLET-ALAPTERÜLET ────────────────────────────────────────────

  _epuletRajz(sim) {
    this.sajatEp.kezd(EPULET_VASTAG);
    this.idegenEp.kezd(EPULET_VASTAG);
    const ep = sim.epuletek;
    if (ep) {
      this._kepkocka++;
      let db = 0;
      db = this._egyEpulet(sim, this._kezi, db);
      const kj = this.kijeloles;
      if (kj) {
        const tomb = kj.epuletek;
        if (tomb && tomb.length) {
          for (let k = 0; k < tomb.length && db < MAX_EPULET; k++) {
            db = this._egyEpulet(sim, tomb[k], db);
          }
        }
        if (typeof kj.epulet === 'number') db = this._egyEpulet(sim, kj.epulet, db);
        // d) ág: a kijelölésem célépülete (támadás vagy beszállás).
        const pa = sim.parancsAllapot;
        const lista = kj.lista;
        if (pa && lista) {
          const e = sim.egysegek;
          for (let k = 0; k < lista.length && db < MAX_EPULET; k++) {
            const i = lista[k];
            if (i >= e.db) continue;
            db = this._egyEpulet(sim, pa.celEpulet[i], db);
          }
        }
      }
    }
    this.sajatEp.zar();
    this.idegenEp.zar();
  }

  /** @returns {number} az új felvett-darabszám */
  _egyEpulet(sim, idx, db) {
    const ep = sim.epuletek;
    const i = idx | 0;
    if (idx === undefined || idx === null || i < 0 || i >= ep.db) return db;
    if (db >= MAX_EPULET) return db;
    if (!ep.el(i)) return db;
    if (this._belyeg[i] === this._kepkocka) return db;
    this._belyeg[i] = this._kepkocka;

    const m = EP_MERET[ep.tipus[i]];
    // ⚠️ Ha az `EP_MERET` egyszer rövidebb lesz az `EPULET`-nél, itt
    // `undefined` jönne, abból NaN körvonal — a `kiadas_ellenorzo.mjs`
    // `EPULET_TABLAK` listája ezért őrzi a hosszát. Itt még egy hálót
    // teszünk alá, mert a NaN-t a képernyőn semmi nem jelezné.
    if (!(m > 0)) return db;

    const racs = sim.racs;
    const sz = this.sajatCsapat === ep.csapat[i] ? this.sajatEp : this.idegenEp;
    sz.szakit();
    const x0 = ep.cx[i], y0 = ep.cy[i];
    const x1 = x0 + m, y1 = y0 + m;
    // Cellánként egy pont: a körvonal így a domboldalon is a terepre simul.
    for (let c = 0; c <= m; c++) sz.pont(x0 + c, racs.magassagPont(x0 + c, y0) + MAGASSAG, y0);
    for (let c = 1; c <= m; c++) sz.pont(x1, racs.magassagPont(x1, y0 + c) + MAGASSAG, y0 + c);
    for (let c = 1; c <= m; c++) sz.pont(x1 - c, racs.magassagPont(x1 - c, y1) + MAGASSAG, y1);
    for (let c = 1; c <= m; c++) sz.pont(x0, racs.magassagPont(x0, y1 - c) + MAGASSAG, y1 - c);
    return db + 1;
  }

  set enabled(v) {
    this.keret.lathato = v;
    this.sajatEp.lathato = v;
    this.idegenEp.lathato = v;
  }

  get haromszog() {
    return this.keret.haromszog + this.sajatEp.haromszog + this.idegenEp.haromszog;
  }

  bont() {
    if (this._bontok) { this._bontok(); this._bontok = null; }
    this.keret.bont(); this.sajatEp.bont(); this.idegenEp.bont();
  }
}
