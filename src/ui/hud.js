// AGE OF THE CRYSTALS — HUD (v0.7/3).
//
// ── MIÉRT KÜLÖN FÁJL, ÉS MIÉRT NEM EGY SZÖVEG ─────────────────────────────
// A v0.2 óta a HUD egyetlen `textContent` volt a `main.js`-ben: minden adat
// egy sorba fűzve, képkockánként újraépítve. Ez három verzióig elég volt, most
// viszont két baja lett:
//
//   1. OLVASHATATLAN. Nyolc szám egy sorban nem HUD, hanem napló. Egy RTS-ben
//      a nyersanyag-számot a szem SAROKKAL olvassa, nem szöveget böngészve —
//      ehhez rögzített HELY kell, nem folyó szöveg.
//   2. MINDEN KÉPKOCKÁN ÚJRA. Egyetlen `textContent` értékadás az EGÉSZ
//      csomópontot újraépíti és újratördeli. 144 Hz-en ez ingyen elvitt
//      munkára megy el, miközben a nyersanyag-szám másodpercenként párszor
//      változik.
//
// Ezért a HUD most rögzített mezőkből áll, és minden mező CSAK AKKOR ír, ha az
// értéke tényleg változott (`_ir`). A mérés ugyanaz az elv, ami a
// `gazdasag3d.js`-ben az épület-mátrixoknál: ne küldj fel semmit, ha nem
// változott.
//
// ── A HUD NEM ÍR A SIMBE ──────────────────────────────────────────────────
// Csak olvas. Semmilyen HUD-állapot (kinyitott panel, kiválasztott fül) nem
// kerülhet a szimulációba — ugyanaz a szabály, mint a rendernél és a ködnél.
// A HUD-nak saját órája sincs: a `frissit` kapja meg a hívó időbélyegét.

import { NYERS_NEV } from '../sim/eroforras.js';
import { KORSZAK_NEV } from '../sim/gazdasag.js';
import { NEHEZSEG_NEV } from '../sim/ai.js';
import { VERZIO } from '../core/config.js';

/** Ennyi ezredmásodpercenként frissülnek a LASSÚ mezők (nyersanyag, nép). */
const LASSU_MS = 120;

export class Hud {
  /**
   * @param {import('../sim/sim.js').Sim} sim
   * @param {import('./bevitel.js').Bevitel} bevitel
   * @param {{sajatCsapat?:number}} [opciok]
   */
  constructor(sim, bevitel, opciok = {}) {
    this.sim = sim;
    this.bevitel = bevitel;
    this.csapat = opciok.sajatCsapat ?? 0;
    this._enabled = true;
    this._utolsoLassu = -1e9;
    /** Mezőnként az utoljára KIÍRT szöveg — enélkül minden képkocka újraírna. */
    this._elozo = new Map();

    if (typeof document === 'undefined') { this.gyoker = null; return; }
    this.gyoker = document.getElementById('hud');
    if (!this.gyoker) return;
    this.gyoker.textContent = '';
    this.gyoker.classList.add('hud-panel');

    this._mezok = {};
    // ── FELSŐ SÁV: nyersanyag és korszak ───────────────────────────────
    const sav = this._sor('hud-eroforras');
    for (let f = 0; f < 4; f++) {
      this._mezok['nyers' + f] = this._cimke(sav, 'hud-nyers hud-nyers-' + f, NYERS_NEV[f]);
    }
    this._mezok.nep = this._cimke(sav, 'hud-nep', 'nép');
    this._mezok.korszak = this._cimke(sav, 'hud-korszak', 'korszak');

    // ── MÁSODIK SOR: hadsereg és termelés ──────────────────────────────
    const sav2 = this._sor('hud-sereg');
    this._mezok.munkas = this._cimke(sav2, 'hud-kicsi', 'munkás');
    this._mezok.katona = this._cimke(sav2, 'hud-kicsi', 'katona');
    this._mezok.sorban = this._cimke(sav2, 'hud-kicsi', 'sorban');
    this._mezok.tech = this._cimke(sav2, 'hud-kicsi', 'technológia');
    this._mezok.felfedezve = this._cimke(sav2, 'hud-kicsi', 'felfedezve');

    // ── KIJELÖLÉS ──────────────────────────────────────────────────────
    this._mezok.kijeloles = this._sor('hud-kijeloles');
    // ── ÜZENET (mentés, elutasított parancs) ───────────────────────────
    this._mezok.uzenet = this._sor('hud-uzenet');
    // ── MÉRŐSZÁMOK ─────────────────────────────────────────────────────
    this._mezok.mero = this._sor('hud-mero');
    // ── BILLENTYŰ-SÚGÓ ─────────────────────────────────────────────────
    const sugo = this._sor('hud-sugo');
    sugo.textContent =
      'bal: kijelölés · jobb: menet/gyűjtés · Shift+jobb vagy T: támadó menet · '
      + 'X állj · H tartás · F alakzat · G állás · K korszak · Ctrl+1..0 csoport\n'
      + 'építés: B raktár · N ház · L laktanya · J íjászda · I istálló · O ostromműhely · '
      + 'Y torony · P piac  ·  M piaci csere · C képzés · R kutatás · F5/F9 mentés/betöltés';
  }

  _sor(osztaly) {
    const d = document.createElement('div');
    d.className = osztaly;
    this.gyoker.appendChild(d);
    return d;
  }

  /** Egy „címke: érték" mező. A címke sosem változik, csak az érték. */
  _cimke(szulo, osztaly, cim) {
    const d = document.createElement('span');
    d.className = osztaly;
    const c = document.createElement('i');
    c.textContent = cim;
    const v = document.createElement('b');
    d.appendChild(c);
    d.appendChild(v);
    szulo.appendChild(d);
    return v;
  }

  /** Írás CSAK változásra — lásd a fejléc 2. pontját. */
  _ir(kulcs, elem, szoveg) {
    if (!elem) return;
    if (this._elozo.get(kulcs) === szoveg) return;
    this._elozo.set(kulcs, szoveg);
    elem.textContent = szoveg;
  }

  /**
   * Képkocka.
   * @param {object} meres `{fps, simMs, renderMs, haromszog, hivas}` a gazdától
   */
  frissit(sim, most, meres) {
    if (!this._enabled || !this.gyoker) return;
    const m = this._mezok;
    const cs = this.csapat;

    // A GYORS mezők minden képkockán mehetnek: a kijelölés és az üzenet a
    // játékos SAJÁT tettére válaszol, ott a késés azonnal érződik.
    this._ir('kij', m.kijeloles, this.bevitel.hudSzoveg());
    this._ir('uzn', m.uzenet, this.bevitel.uzenet());

    if (meres) {
      this._ir('mero', m.mero,
        'v' + VERZIO + '  ·  ' + meres.fps.toFixed(0) + ' FPS'
        + '  ·  sim ' + meres.simMs.toFixed(2) + ' ms / render ' + meres.renderMs.toFixed(2) + ' ms'
        + '  ·  egység ' + sim.egysegek.db + '  ·  tick ' + sim.tick
        + '  ·  △ ' + (meres.haromszog / 1000).toFixed(0) + 'k / ' + meres.hivas + ' hívás');
    }

    // A LASSÚ mezők ritkábban: ezek a szimuláció számai, és a szem úgysem
    // követi képkockánként.
    if (most - this._utolsoLassu < LASSU_MS) return;
    this._utolsoLassu = most;

    const g = sim.gazdasag.allapot(cs);
    const ertek = [g.etel, g.fa, g.ko, g.kristaly];
    for (let f = 0; f < 4; f++) this._ir('ny' + f, m['nyers' + f], String(ertek[f]));
    this._ir('nep', m.nep, g.nepesseg + ' / ' + g.nepessegMax);
    this._ir('kor', m.korszak, KORSZAK_NEV[g.korszak]
      + (g.valtasHatra ? ' → ' + Math.ceil(g.valtasHatra / 20) + ' mp' : ''));

    const mu = sim.munkasok.osszesites(cs);
    const h = sim.harc.osszesites();
    const k = sim.kepzes.osszesites(cs);
    const t = sim.technologia.osszesites(cs);
    const kod = sim.kod.osszesites(cs);
    // ⚠️ MIT ÍRUNK IDE, ÉS MIÉRT PONT EZT
    // A v0.11-ig a „munkás" a `dolgozik`-ot mutatta, a „katona" pedig a csapat
    // ÖSSZES élő egységét. A meccs elején tehát „MUNKÁS 0 · KATONA 8" állt itt,
    // miközben 4 paraszt és 4 katona volt a pályán. Aki ezt elolvasta, azt
    // hitte, nincs parasztja — vagyis a gazdaságot el sem lehet kezdeni. Nem a
    // szám volt rossz, hanem amit a CÍMKE ígért róla.
    // Most: a paraszt-számláló a darabszámot mondja, és zárójelben a tétleneket
    // (az a szám, amiért a játékos egyáltalán ránéz), a katona-számláló pedig
    // tényleg csak a katonákat.
    this._ir('mnk', m.munkas, mu.db + (mu.tetlen ? ' (tétlen ' + mu.tetlen + ')' : ''));
    this._ir('kat', m.katona, Math.max(0, h.elo[cs] - mu.db)
      + ' (elesett ' + h.halottak[cs] + ')');
    this._ir('sor', m.sorban, k.sorban + ' (kész ' + k.keszult + ')');
    this._ir('tec', m.tech, t.kesz + (t.folyik ? ' (+' + t.folyik + ' folyik)' : ''));
    // A felfedezettség a v0.7 hadi ködjéből jön. Nem dísz: ebből látja a
    // játékos, hogy megérte-e felderítőt küldeni.
    this._ir('kod', m.felfedezve, kod.szazalek + ' %');

    // A gépi ellenfél szintje — ha van gép a pályán. A v0.11 főmenüje fogja
    // beállítani; addig legalább LÁTSZIK, mi ellen játszunk.
    const ai = sim.ai.osszesites(1 - cs);
    if (ai.aktiv && this._elozo.get('ai') !== ai.nehezseg) {
      this._elozo.set('ai', ai.nehezseg);
      this.gyoker.dataset.ellenfel = NEHEZSEG_NEV[ai.nehezseg];
    }
  }

  set enabled(v) {
    this._enabled = !!v;
    if (this.gyoker) this.gyoker.style.display = v ? '' : 'none';
  }
  get enabled() { return this._enabled; }
  get haromszog() { return 0; }
}
