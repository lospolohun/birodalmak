// AGE OF THE CRYSTALS — HANG-HÍD (v0.12/2): a kliens tettei → hang-események.
//
// ── MIÉRT KELL HÍD EGYÁLTALÁN ─────────────────────────────────────────────
// A `src/audio/hang.js` a sim HALMOZOTT SZÁMLÁLÓIBÓL dolgozik: két képkocka
// különbségéből tudja, hogy csapás történt, munkás lerakott, épület elkészült.
// Négy esemény viszont NEM a simből jön, mert nem is jöhet: a kijelölés és a
// parancsadás nem világállapot (`INTERFACES.md` — ezért nincs a simben, és
// ezért nem kell a v0.8-ban szinkronizálni). Ezt a négyet valakinek meg kell
// hívnia — ez a valaki ez a fájl.
//
// ── ⚠️ MIÉRT FIGYEL, ÉS NEM A `bevitel.js` HÍVJA ──────────────────────────
// A természetes hely a `bevitel.js` lenne (ő tudja, milyen parancsot adott
// be). A `bevitel.js` viszont a v0.12 sávján KÍVÜL esik — párhuzamosan dolgozik
// rajta másik menet —, és egy „majd ő is meghívja" ígéret pont az a fajta
// adósság, amiből néma rendszer lesz. Ezért ez a réteg MEGFIGYELŐ: a
// `bevitel.js` egyetlen, MÁR MEGLÉVŐ horgát használja (`parancsra`), és onnan
// OLVASSA ki a simből, mi ment be a parancs-sorra.
//
// A híd tehát CSAK OLVAS — se sim-állapotot, se `Bevitel`-mezőt nem ír. Ha a
// `bevitel.js` egyszer maga jelenti a parancs fajtáját, ez a fájl zsugorodni
// fog, nem átíródni.
//
// ── ⚠️ AZ ELUTASÍTÁST NEM MONDJA MEG SENKI ────────────────────────────────
// A `Sim` szándékosan CSENDBEN elnyeli, amire nincs fedezet: a nem járható
// célpontot, a megfizethetetlen épületet, a népesség fölötti képzést
// (`parancsok.js`). Nincs se kivétel, se visszatérési érték — a v0.8-ban nem is
// lehetne, mert a parancs a hálózatról érkezik, és a beadás pillanatában még
// nem tudni, mi lesz belőle.
//
// Ezért az elutasítást UGYANÚGY számláló-különbségből olvassuk ki, ahogy a
// `hang.js` a csapást: a parancs beadásakor feljegyezzük a hozzá tartozó
// MÉRŐSZÁMOT (épület-darabszám, képzési sor, kutatás, csere, korszakváltás), és
// néhány tickkel a végrehajtás után megnézzük, mozdult-e. Ha nem, a parancs
// elveszett — ez az a hang, ami megmondja a játékosnak, hogy hiába kattintott.
//
// ── ⚠️ A HANG NEM INDULHAT EL MAGÁTÓL ─────────────────────────────────────
// A böngésző az `AudioContext`-et felhasználói gesztus nélkül `suspended`
// állapotban tartja — hibaüzenet nélkül. Ez a réteg ezért gesztusra indít
// (`pointerdown` / `keydown`), és amíg nem sikerül, újrapróbálja. A hangerő
// alapból HALK (`main.js` → `HANG_HALKITAS`), és a `Z` billentyű vagy a bal
// alsó kapcsoló bármikor elnémítja.
//
// A némítás SZÁNDÉKOSAN `hangero = 0`, nem `enabled = false`: a kikapcsolt
// réteg nem olvasná a számlálókat, és a visszakapcsoláskor a felgyűlt
// különbségből hang-robbanás lenne. Nulla hangerőn a döntési út végigfut, a
// keverő pedig a hallhatósági küszöbön eldobja a kérést — nem épül egyetlen
// WebAudio-csomópont sem.

import { KESLELTETES } from '../sim/sim.js';
import { ESEMENY } from '../audio/hang_katalogus.js';

const STILUS_ID = 'aoc-hang-stilus';

const STILUS = `
.aoc-hang-kapcsolo {
  position: fixed; left: 10px; bottom: 10px; z-index: 20;
  padding: 5px 10px; cursor: pointer;
  color: #dfe7f5; font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
  background: rgba(6, 10, 18, 0.72);
  border: 1px solid rgba(120, 190, 255, 0.22); border-radius: 6px;
  letter-spacing: 0.3px;
}
.aoc-hang-kapcsolo:hover { border-color: rgba(120, 190, 255, 0.55); }
.aoc-hang-kapcsolo[data-be="0"] { opacity: 0.55; }
`;

/**
 * Ennyi tickkel a végrehajtás UTÁN nézzük meg, hatott-e a parancs.
 * A `KESLELTETES` a beadás és a végrehajtás közti szünet; a ráadás azért kell,
 * mert az építés a lerakás tickjében, a képzés a sorba állításkor mozdul —
 * de a `lep()` sorrendje miatt csak a KÖVETKEZŐ tick végén látszik kívülről.
 */
const ELLENORZES_TICK = KESLELTETES + 2;

export class HangHid {
  /**
   * @param {import('../audio/hang.js').Hang} hang
   * @param {import('../sim/sim.js').Sim} sim
   * @param {{kijeloles:{lista:number[]}}} bevitel
   * @param {{hangero?:number, sajatCsapat?:number, szulo?:HTMLElement}} [opciok]
   */
  constructor(hang, sim, bevitel, opciok = {}) {
    this.hang = hang;
    this.sim = sim;
    this.bevitel = bevitel;
    this.csapat = opciok.sajatCsapat ?? 0;
    /** A játékos által kért hangerő (0..1). A némítás ezt teszi ideiglenesen 0-ra. */
    this.hangero = opciok.hangero ?? 0.35;
    this.be = true;

    // Kijelölés-lenyomat: darabszám + első + utolsó index. Három szám
    // összehasonlítása képkockánként — a lista bejárása fölösleges volna.
    this._db = -1;
    this._elso = -1;
    this._utolso = -1;

    /** A figyelt parancs: fajta, mérőszám és a tick, amikor ránézünk. */
    this._var = null;

    this.gomb = null;
    this._bontok = [];
    this._epit(opciok.szulo);
    this._gesztusok();
    this._kiir();
  }

  // ── FELÜLET ────────────────────────────────────────────────────────────

  _epit(szulo) {
    if (typeof document === 'undefined') return;
    if (!document.getElementById(STILUS_ID)) {
      const st = document.createElement('style');
      st.id = STILUS_ID;
      st.textContent = STILUS;
      document.head.appendChild(st);
    }
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'aoc-hang-kapcsolo';
    const kattint = () => { this.inditas(); this.kapcsol(); };
    b.addEventListener('click', kattint);
    (szulo || document.body).appendChild(b);
    this.gomb = b;
    this._bontok.push(() => {
      b.removeEventListener('click', kattint);
      if (b.parentNode) b.parentNode.removeChild(b);
    });
  }

  /**
   * A hangmotor felébresztése. A böngésző csak gesztusra engedi, ezért minden
   * kattintásnál és billentyűnél újrapróbáljuk, amíg fut. A `Z` egyben a
   * némítás kapcsolója is — a `bevitel.js` és a `camera3d.js` ezt a gombot
   * nem foglalja.
   */
  _gesztusok() {
    if (typeof window === 'undefined') return;
    const ebreszt = () => this.inditas();
    const gomb = (ev) => {
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      this.inditas();
      if (ev.code === 'KeyZ') { this.kapcsol(); ev.preventDefault(); }
    };
    window.addEventListener('pointerdown', ebreszt, true);
    window.addEventListener('keydown', gomb);
    this._bontok.push(() => {
      window.removeEventListener('pointerdown', ebreszt, true);
      window.removeEventListener('keydown', gomb);
    });
  }

  /** @returns {boolean} szól-e már a hangmotor */
  inditas() {
    const ac = this.hang.ac;
    if (ac && ac.state === 'running') return true;
    const jo = this.hang.inditas();
    this._kiir();
    return jo;
  }

  /** Némítás ki/be. @returns {boolean} az ÚJ állapot */
  kapcsol(be) {
    this.be = be === undefined ? !this.be : !!be;
    this.hang.hangero = this.be ? this.hangero : 0;
    this._kiir();
    return this.be;
  }

  _kiir() {
    if (!this.gomb) return;
    const ac = this.hang.ac;
    const all = !this.be ? 'néma'
      : (ac && ac.state === 'running' ? 'halk' : 'kattints a hangért');
    this.gomb.dataset.be = this.be ? '1' : '0';
    this.gomb.textContent = '♪ hang: ' + all + '  (Z)';
  }

  // ── A KLIENS ESEMÉNYEI ─────────────────────────────────────────────────

  /**
   * KÉPKOCKA — a kijelölés változását és a figyelt parancs sorsát nézi.
   * Nulla allokáció: három szám összehasonlítása, és legfeljebb egy
   * mérőszám-lekérdezés parancsonként.
   * @param {number} most ezredmásodperc
   */
  frissit(most) {
    const l = this.bevitel && this.bevitel.kijeloles ? this.bevitel.kijeloles.lista : null;
    if (l) {
      const db = l.length;
      const elso = db > 0 ? l[0] : -1;
      const utolso = db > 0 ? l[db - 1] : -1;
      if (db !== this._db || elso !== this._elso || utolso !== this._utolso) {
        // Csak az ÚJ kijelölés szól, az üresre törlés nem: a jobb kattintás
        // utáni takarítás nem a játékos tette, és hangja sem legyen.
        if (db > 0) this.hang.esemeny(ESEMENY.KIJELOLES, undefined, undefined, most);
        this._db = db; this._elso = elso; this._utolso = utolso;
      }
    }

    const v = this._var;
    if (v && this.sim.tick >= v.tick) {
      this._var = null;
      if (this._merteke(v.fajta) === v.ertek) {
        this.hang.esemeny(ESEMENY.PARANCS_ELUTASITVA, undefined, undefined, most);
      }
    }
  }

  /**
   * A `bevitel.js` `parancsra` horga hívja: épp most ment be egy parancs.
   *
   * A FAJTÁT a sim parancs-sorából olvassuk ki. Ez a sor a v0.8 hálózati sora
   * is: ami nem megy át rajta, az a másik gépen nem történik meg — vagyis épp
   * az a lista, amiből a hang biztosan igazat mond.
   * @param {number} most ezredmásodperc
   */
  parancsra(most) {
    const p = this._utolsoParancs();
    if (!p) return;
    switch (p.fajta) {
      case 'menet':
      case 'gyujt':
        this.hang.esemeny(ESEMENY.PARANCS_MENET, p.x, p.y, most);
        return;
      case 'tamado_menet':
        this.hang.esemeny(ESEMENY.PARANCS_TAMADAS, p.x, p.y, most);
        return;
      case 'allj':
      case 'tartas':
      case 'allas':
      case 'alakzat':
        this.hang.esemeny(ESEMENY.PARANCS_MENET, undefined, undefined, most);
        return;
      default:
        break;
    }
    // A GAZDASÁGI parancsok (építés, képzés, kutatás, csere, korszak) némán
    // el is bukhatnak. Ezért nem szólunk azonnal: feljegyezzük a mérőszámot,
    // és a végrehajtás után derül ki, kell-e elutasítás-hang.
    const ertek = this._merteke(p.fajta);
    if (ertek < 0) return;
    this._var = { fajta: p.fajta, ertek, tick: this.sim.tick + ELLENORZES_TICK };
  }

  /**
   * A LEGUTÓBB BEADOTT parancs. A `Sim.parancs()` a `tick + KESLELTETES`
   * rekeszbe fűzi, tehát a most beadott a rekesz UTOLSÓ eleme.
   */
  _utolsoParancs() {
    const sor = this.sim._sor;
    if (!sor || !sor.get) return null;
    const lista = sor.get(this.sim.tick + KESLELTETES);
    return lista && lista.length ? lista[lista.length - 1] : null;
  }

  /**
   * A parancs fajtájához tartozó MÉRŐSZÁM — ha ez nem mozdul, a parancs
   * elveszett. `-1`, ha ehhez a fajtához nincs mérőszámunk (olyankor nem is
   * mondunk rá semmit: a hamis elutasítás-hang rosszabb a némaságnál).
   */
  _merteke(fajta) {
    const s = this.sim;
    const cs = this.csapat;
    switch (fajta) {
      case 'epit': return s.epuletek.db;
      case 'kepzes': return s.kepzes.osszesites(cs).sorban;
      case 'kutatas': {
        const t = s.technologia.osszesites(cs);
        return t.kesz + t.folyik;
      }
      case 'csere': return s.gazdasag.csereDb[cs];
      case 'korszak': return s.gazdasag.allapot(cs).valtasHatra > 0 ? 1 : 0;
      default: return -1;
    }
  }

  // ── RÉTEG-SZERZŐDÉS ────────────────────────────────────────────────────

  bont() {
    for (const f of this._bontok) { try { f(); } catch (h) { /* nem kritikus */ } }
    this._bontok.length = 0;
    this.gomb = null;
  }

  set enabled(v) { if (this.gomb) this.gomb.style.display = v ? '' : 'none'; }
  get enabled() { return !this.gomb || this.gomb.style.display !== 'none'; }
  /** A híd nem rajzol — a közös réteg-felület miatt van itt. */
  get haromszog() { return 0; }
}
