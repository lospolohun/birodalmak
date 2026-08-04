// AGE OF THE CRYSTALS — FŐMENÜ (v0.11/2): a DOM-réteg.
//
// ── MIÉRT VAN AZ ÉRDEMI RÉSZ EGY MÁSIK FÁJLBAN ────────────────────────────
// Ugyanaz a szétvágás, mint a `civ_valaszto.js` / `civ_valaszto_adat.js`
// párosnál, és ugyanazért: a menü NEHÉZ része nem a gombok kirajzolása, hanem
// az ÁLLAPOTGÉP (milyen képernyők vannak, mi az érvényes átmenet, mikor
// teljes a meccs-konfig) — az pedig `menu_adat.js`-ben van, DOM nélkül, tehát
// node-ban vizsgálhatóan (`tools/menu_szonda.mjs`). Ide csak a rajzolás és a
// kattintás-továbbítás maradt.
//
// ── ⚠️ A MENÜ NEM HOZ LÉTRE `Sim`-ET ──────────────────────────────────────
// Ez a réteg egyetlen dolgot ad ki: az `onIndit(konfig)` visszahívást. A `Sim`
// példányosítása a hívóé (`main.js`), mert a v0.8 lockstepjében a meccs-konfigot
// a HÁLÓZATON kell egyeztetni a világ felépítése előtt. Ugyanaz a szabály, mint
// a `Kijeloles`-nél: a UI sosem ír a szimulációba.
//
// ── MIÉRT NINCS „VÉLETLEN SEED" GOMB ──────────────────────────────────────
// Mert csábító lenne, és desyncet okozna. A v0.8-ban a két gépnek UGYANAZT a
// seedet kell kapnia; egy `Math.random()`-os gomb itt a menüben pont azt a
// számot állítaná elő, amit nem lehet egyeztetni. A seedet be lehet gépelni, és
// a hívó adhat kezdőértéket — mást a menü nem tud róla.
//
// ── A CIV-VÁLASZTÓ A MEGLÉVŐ OSZTÁLY ──────────────────────────────────────
// A nyolc nép kártyáit a `CivValaszto` rajzolja, két példányban (saját nép,
// ellenfél népe), egyszerre csak az egyik látszik. Nem írjuk újra: a kártyák
// szövegei (előny/hátrány, fordított olvasatú ár- és idő-hatások) saját
// szondával őrzött rétegből jönnek, és egy második, „majdnem ugyanolyan"
// másolat pont azt a rést nyitná meg, amit az őrzés bezárt.
//
// ── ALLOKÁCIÓ ÉS ESEMÉNYEK ────────────────────────────────────────────────
// A menünek NINCS képkocka-hurka — nem a `frissit()`-en múlik semmi. A
// szerkezet (hat lap, minden gomb, minden mező) EGYSZER épül fel, és a
// képernyő-váltás utána csak láthatóságot és `disabled`-et kapcsol. Az egész
// menüre EGY kattintás-figyelő és EGY változás-figyelő jut (esemény-delegálás),
// hogy a `bont()` maradéktalanul le tudjon szerelni.

import {
  MenuAllapot, KEPERNYO, KEPERNYO_DB, KEPERNYO_NEV, ATMENETEK,
  terkepLista, nehezsegLista, meretLista, EGYSEG_KORLATOK,
  TERKEP_NEV, TERKEP_LEIRAS, NEHEZSEG_NEV, CIV_NEV, CIV_NINCS,
} from './menu_adat.js';
import { CivValaszto } from './civ_valaszto.js';
import { VERZIO } from '../core/config.js';

/** A `bevitel.js` mentés-rekesze. Egy hely, egy kulcs — a v0.7/2 óta. */
const MENTES_KULCS = 'aotc-mentes';

const STILUS_ID = 'aoc-menu-stilus';

const STILUS = `
.aoc-menu {
  position: fixed; inset: 0; z-index: 35;
  display: flex; flex-direction: column; align-items: center;
  gap: 18px; padding: 34px 20px 96px; overflow-y: auto;
  background:
    radial-gradient(1200px 700px at 50% -10%, rgba(120, 190, 255, 0.10), transparent 70%),
    #05070c;
  color: #dfe7f5;
  font: 13px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace;
}
.aoc-menu-fej { text-align: center; display: flex; flex-direction: column; gap: 4px; }
.aoc-menu-cim {
  font-size: 26px; font-weight: 700; letter-spacing: 5px;
  text-transform: uppercase; color: #ffd479;
}
.aoc-menu-alcim { opacity: 0.55; letter-spacing: 1.5px; }
.aoc-menu-lap { display: none; width: 100%; max-width: 720px; flex-direction: column; gap: 12px; }
.aoc-menu-lap[data-aktiv="1"] { display: flex; }
.aoc-menu-lap h3 {
  font-size: 12px; letter-spacing: 1.4px; text-transform: uppercase; opacity: 0.6;
}
.aoc-mezo {
  display: grid; grid-template-columns: 150px 1fr; gap: 10px; align-items: center;
  padding: 8px 12px;
  background: rgba(6, 10, 18, 0.72);
  border: 1px solid rgba(120, 190, 255, 0.18);
  border-radius: 6px;
}
.aoc-mezo > label { opacity: 0.72; }
.aoc-mezo input, .aoc-mezo select {
  width: 100%; padding: 5px 8px;
  color: inherit; font: inherit;
  background: rgba(2, 4, 8, 0.85);
  border: 1px solid rgba(120, 190, 255, 0.3); border-radius: 4px;
}
.aoc-mezo input[type="range"] { padding: 0; }
.aoc-mezo input[type="checkbox"] { width: auto; }
.aoc-sugo { grid-column: 2; opacity: 0.6; font-size: 12px; }
.aoc-menu-nav { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; }
.aoc-gomb {
  padding: 9px 18px; cursor: pointer;
  color: inherit; font: inherit; letter-spacing: 0.6px;
  background: rgba(6, 10, 18, 0.8);
  border: 1px solid rgba(120, 190, 255, 0.35); border-radius: 6px;
  transition: border-color 120ms, background 120ms;
}
.aoc-gomb:hover:not(:disabled) { border-color: #ffd479; background: rgba(255, 212, 121, 0.10); }
.aoc-gomb:focus-visible { outline: 2px solid #ffd479; outline-offset: 2px; }
.aoc-gomb:disabled { opacity: 0.38; cursor: not-allowed; }
.aoc-gomb-fo { border-color: #ffd479; color: #ffd479; }
.aoc-menu-hiba {
  width: 100%; max-width: 720px;
  display: none; flex-direction: column; gap: 3px;
  padding: 9px 12px;
  color: #e6cdd2; font-size: 12px;
  background: rgba(120, 30, 46, 0.22);
  border: 1px solid rgba(224, 132, 148, 0.45); border-radius: 6px;
}
.aoc-menu-hiba[data-van="1"] { display: flex; }
.aoc-menu-hiba b { color: #e08494; }
.aoc-mentes-lista { display: flex; flex-direction: column; gap: 8px; }
.aoc-mentes {
  display: flex; flex-direction: column; gap: 2px; text-align: left;
  padding: 10px 12px; cursor: pointer; color: inherit; font: inherit;
  background: rgba(6, 10, 18, 0.72);
  border: 1px solid rgba(120, 190, 255, 0.2); border-radius: 6px;
}
.aoc-mentes[data-valasztott="1"] { border-color: #ffd479; background: rgba(255, 212, 121, 0.10); }
.aoc-mentes[data-ervenyes="0"] { border-color: rgba(224, 132, 148, 0.5); opacity: 0.75; cursor: not-allowed; }
.aoc-mentes-cim { font-weight: 700; }
.aoc-mentes-alcim { opacity: 0.6; font-size: 12px; }
.aoc-osszegzes { display: flex; flex-direction: column; gap: 3px; }
.aoc-osszegzes span { display: flex; justify-content: space-between; gap: 12px; }
.aoc-osszegzes i { opacity: 0.6; font-style: normal; }
/* A civ-lap a MEGLÉVŐ CivValaszto-t hordja, ami teljes képernyős. A saját
   sávjaink e fölé kerülnek, és helyet is hagyunk nekik. */
.aoc-menu .civ-valaszto { padding-top: 64px; padding-bottom: 92px; z-index: 30; }
.aoc-civ-sav {
  position: fixed; left: 0; right: 0; top: 0; z-index: 36;
  display: flex; gap: 8px; justify-content: center; align-items: center;
  padding: 10px; background: rgba(4, 6, 11, 0.94);
  border-bottom: 1px solid rgba(120, 190, 255, 0.18);
}
.aoc-civ-ful[data-aktiv="1"] { border-color: #ffd479; color: #ffd479; }
.aoc-menu-lab {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 36;
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  padding: 12px; background: rgba(4, 6, 11, 0.94);
  border-top: 1px solid rgba(120, 190, 255, 0.18);
}
`;

/**
 * A BÖNGÉSZŐ TÁROLÓJA mentés-forrásként.
 *
 * Külön függvény, és nem a `Menu` belseje: az adatréteg így egy PICI felületet
 * lát (`kulcsok()` / `olvas()`), amit a szonda node-ban ki tud tölteni. A menü
 * logikája ettől ugyanaz marad böngészőben és node-ban — nem lesz egy „csak
 * élesben futó" ág, ami sosem megy át kapun.
 */
export function bongeszoTarolo() {
  if (typeof localStorage === 'undefined') return null;
  return {
    kulcsok() {
      const ki = [];
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.indexOf(MENTES_KULCS) === 0) ki.push(k);
        }
      } catch (h) { return ki; }
      // RÖGZÍTETT SORREND. A tároló bejárási sorrendje böngészőfüggő, a menü
      // viszont mindig ugyanazt a listát kell mutassa ugyanabból a tárolóból.
      ki.sort();
      return ki;
    },
    olvas(kulcs) {
      try { return localStorage.getItem(kulcs); } catch (h) { return null; }
    },
  };
}

export class Menu {
  /**
   * @param {HTMLElement} [szulo] hova kerüljön (alapból a `document.body`)
   * @param {{
   *   seed?:number,
   *   onIndit?:(konfig:object)=>void,
   *   tarolo?:{kulcsok:()=>string[], olvas:(k:string)=>(string|null)}
   * }} [opciok]
   *   Az `onIndit` a menü EGYETLEN kimenete: kap egy kész meccs-konfigot, és
   *   onnantól a hívó dolga a világ felépítése.
   */
  constructor(szulo, opciok = {}) {
    this.allapot = new MenuAllapot({
      seed: opciok.seed,
      tarolo: opciok.tarolo !== undefined ? opciok.tarolo : bongeszoTarolo(),
    });
    this.onIndit = opciok.onIndit || null;
    this._enabled = true;
    this.gyoker = null;
    /** Lap-elemek `KEPERNYO.*` szerint indexelve. */
    this._lapok = [];
    /** Gomb-elemek: `akcio` → gomb, laponként. */
    this._gombok = [];
    this._civValasztok = [];
    this._civFulek = [];
    /** Melyik civ-rekeszt szerkesztjük épp: 0 = saját, 1 = ellenfél. */
    this._civRekesz = 0;

    if (typeof document === 'undefined') return;

    if (!document.getElementById(STILUS_ID)) {
      const st = document.createElement('style');
      st.id = STILUS_ID;
      st.textContent = STILUS;
      document.head.appendChild(st);
    }

    const gy = document.createElement('div');
    gy.className = 'aoc-menu';
    this.gyoker = gy;

    const fej = document.createElement('div');
    fej.className = 'aoc-menu-fej';
    fej.appendChild(this._szoveg('div', 'aoc-menu-cim', 'Age of the Crystals'));
    this._alcim = this._szoveg('div', 'aoc-menu-alcim', 'v' + VERZIO);
    fej.appendChild(this._alcim);
    gy.appendChild(fej);

    for (let k = 0; k < KEPERNYO_DB; k++) {
      const lap = document.createElement('div');
      lap.className = 'aoc-menu-lap';
      lap.dataset.kepernyo = String(k);
      lap.dataset.aktiv = '0';
      this._lapok[k] = lap;
      gy.appendChild(lap);
    }

    this._fomenuLap(this._lapok[KEPERNYO.FOMENU]);
    this._ujJatekLap(this._lapok[KEPERNYO.UJ_JATEK]);
    this._civLap(this._lapok[KEPERNYO.CIV_VALASZTO]);
    this._inditasLap(this._lapok[KEPERNYO.INDITAS]);
    this._betoltesLap(this._lapok[KEPERNYO.BETOLTES]);
    this._beallitasLap(this._lapok[KEPERNYO.BEALLITASOK]);

    // ── LÁBLÉC: hibalista + navigáció ───────────────────────────────────
    const lab = document.createElement('div');
    lab.className = 'aoc-menu-lab';
    this._hibaDoboz = document.createElement('div');
    this._hibaDoboz.className = 'aoc-menu-hiba';
    this._hibaDoboz.dataset.van = '0';
    lab.appendChild(this._hibaDoboz);
    this._nav = document.createElement('div');
    this._nav.className = 'aoc-menu-nav';
    lab.appendChild(this._nav);
    gy.appendChild(lab);
    this._navGombok(this._nav);

    // ── EGY figyelő az egész menüre ─────────────────────────────────────
    this._kattint = (ev) => this._kattintas(ev);
    this._valtozik = (ev) => this._valtozas(ev);
    gy.addEventListener('click', this._kattint);
    gy.addEventListener('change', this._valtozik);
    gy.addEventListener('input', this._valtozik);

    (szulo || document.body).appendChild(gy);
    this._frissit();
  }

  // ── Építés ────────────────────────────────────────────────────────────

  _szoveg(tag, osztaly, szoveg) {
    const d = document.createElement(tag);
    if (osztaly) d.className = osztaly;
    if (szoveg !== undefined) d.textContent = szoveg;
    return d;
  }

  /** Egy „címke + vezérlő" sor. A `mezo` a `MenuAllapot.beallit()` kulcsa. */
  _mezoSor(szulo, mezo, cimke, elem, sugo) {
    const sor = document.createElement('div');
    sor.className = 'aoc-mezo';
    const l = document.createElement('label');
    l.textContent = cimke;
    l.htmlFor = 'aoc-mezo-' + mezo;
    elem.id = 'aoc-mezo-' + mezo;
    elem.dataset.mezo = mezo;
    sor.appendChild(l);
    sor.appendChild(elem);
    if (sugo) sor.appendChild(this._szoveg('div', 'aoc-sugo', sugo));
    szulo.appendChild(sor);
    return sor;
  }

  _valaszto(tetelek) {
    const s = document.createElement('select');
    for (let i = 0; i < tetelek.length; i++) {
      const o = document.createElement('option');
      o.value = String(tetelek[i].ertek);
      o.textContent = tetelek[i].cim;
      s.appendChild(o);
    }
    return s;
  }

  _fomenuLap(lap) {
    lap.appendChild(this._szoveg('h3', null, 'Kristályháború'));
    lap.appendChild(this._szoveg('div', 'aoc-sugo',
      'Két nép, egy pálya, négy nyersanyag. A meccs beállításai a hálózaton is '
      + 'ezek lesznek — ezért nincs véletlen seed: amit itt beírsz, az épül fel.'));
  }

  _ujJatekLap(lap) {
    lap.appendChild(this._szoveg('h3', null, 'A meccs beállításai'));

    const seed = document.createElement('input');
    seed.type = 'text';
    seed.inputMode = 'numeric';
    seed.value = String(this.allapot.konfig().seed);
    this._mezoSor(lap, 'seed', 'seed', seed,
      'A pálya EBBŐL a számból épül. Ugyanaz a seed + ugyanaz a térkép = ugyanaz a pálya.');
    this._seedMezo = seed;

    const meret = this._valaszto(meretLista().map(
      (m) => ({ ertek: m.n, cim: m.nev + ' — ' + m.n + '×' + m.n })));
    meret.value = String(this.allapot.konfig().n);
    this._mezoSor(lap, 'n', 'pályaméret', meret);

    const terkep = this._valaszto(terkepLista().map(
      (t) => ({ ertek: t.terkep, cim: t.nev })));
    terkep.value = String(this.allapot.konfig().terkep);
    this._terkepLeiras = this._szoveg('div', 'aoc-sugo', '');
    const sor = this._mezoSor(lap, 'terkep', 'térkép', terkep);
    sor.appendChild(this._terkepLeiras);

    const neh = this._valaszto(nehezsegLista().map(
      (h) => ({ ertek: h.nehezseg, cim: h.nev })));
    neh.value = String(this.allapot.konfig().nehezseg);
    this._mezoSor(lap, 'nehezseg', 'gépi ellenfél', neh);

    const korlat = this._valaszto(EGYSEG_KORLATOK.map(
      (e) => ({ ertek: e, cim: e + ' egység' })));
    korlat.value = String(this.allapot.konfig().maxEgyseg);
    this._mezoSor(lap, 'maxEgyseg', 'egység-korlát', korlat,
      'A két csapat EGYÜTTES felső korlátja — a memória ebből foglalódik.');

    const oldal = this._valaszto([
      { ertek: 0, cim: '0 — kék' }, { ertek: 1, cim: '1 — piros' }]);
    oldal.value = String(this.allapot.konfig().sajatCsapat);
    this._mezoSor(lap, 'sajatCsapat', 'a te oldalad', oldal);
  }

  _civLap(lap) {
    // FÜLEK: melyik rekeszt szerkesztjük. Két teljes képernyős választó közül
    // egyszerre csak az egyik látszik — ezért kell a fül, nem díszítés.
    const sav = document.createElement('div');
    sav.className = 'aoc-civ-sav';
    for (let r = 0; r < 2; r++) {
      const f = document.createElement('button');
      f.type = 'button';
      f.className = 'aoc-gomb aoc-civ-ful';
      f.dataset.civRekesz = String(r);
      f.dataset.aktiv = r === 0 ? '1' : '0';
      sav.appendChild(f);
      this._civFulek[r] = f;
    }
    lap.appendChild(sav);

    for (let r = 0; r < 2; r++) {
      const v = new CivValaszto(lap, {
        cim: r === 0 ? 'A te néped' : 'Az ellenfél népe',
        onValaszt: (civ) => { this.allapot.beallit('civ' + r, civ); this._frissit(); },
      });
      v.enabled = r === 0;
      this._civValasztok[r] = v;
    }
  }

  _inditasLap(lap) {
    lap.appendChild(this._szoveg('h3', null, 'Minden megvan'));
    this._osszegzes = document.createElement('div');
    this._osszegzes.className = 'aoc-osszegzes';
    this._osszSorok = {};
    const mezok = [
      ['seed', 'seed'], ['n', 'pályaméret'], ['terkep', 'térkép'],
      ['civ0', 'a te néped'], ['civ1', 'az ellenfél népe'],
      ['nehezseg', 'gépi ellenfél'], ['maxEgyseg', 'egység-korlát'],
      ['sajatCsapat', 'a te oldalad'], ['mentes', 'mentésből'],
    ];
    for (let i = 0; i < mezok.length; i++) {
      const s = document.createElement('span');
      s.appendChild(this._szoveg('i', null, mezok[i][1]));
      const b = document.createElement('b');
      s.appendChild(b);
      this._osszegzes.appendChild(s);
      this._osszSorok[mezok[i][0]] = b;
    }
    lap.appendChild(this._osszegzes);
    lap.appendChild(this._szoveg('div', 'aoc-sugo',
      'Az indítás ezt a konfigurációt adja át — a világot a játék építi fel '
      + 'belőle, nem a menü.'));
  }

  _betoltesLap(lap) {
    lap.appendChild(this._szoveg('h3', null, 'Mentett meccsek'));
    this._mentesLista = document.createElement('div');
    this._mentesLista.className = 'aoc-mentes-lista';
    lap.appendChild(this._mentesLista);
    this._mentesUres = this._szoveg('div', 'aoc-sugo',
      'Nincs mentés a böngésző tárolójában. Játék közben az F5 ment.');
    lap.appendChild(this._mentesUres);
  }

  _beallitasLap(lap) {
    lap.appendChild(this._szoveg('h3', null, 'Beállítások'));
    lap.appendChild(this._szoveg('div', 'aoc-sugo',
      'Ezek GÉPENKÉNTI beállítások: nem részei a meccs-konfignak, és a '
      + 'hálózaton sem mennek át.'));
    const b = this.allapot.beallitasok();
    const csuszka = (mezo, cim, ertek, min, max) => {
      const i = document.createElement('input');
      i.type = 'range';
      i.min = String(min); i.max = String(max); i.step = '1';
      i.value = String(ertek);
      const sor = this._mezoSor(lap, mezo, cim, i);
      const ki = this._szoveg('div', 'aoc-sugo', String(ertek));
      sor.appendChild(ki);
      return ki;
    };
    this._beallKi = {
      hangEro: csuszka('hangEro', 'hangerő', b.hangEro, 0, 100),
      zeneEro: csuszka('zeneEro', 'zene', b.zeneEro, 0, 100),
      kameraSebesseg: csuszka('kameraSebesseg', 'kamera-sebesség', b.kameraSebesseg, 25, 300),
    };
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = b.arnyek;
    this._mezoSor(lap, 'arnyek', 'árnyékok', cb);
  }

  /**
   * A NAVIGÁCIÓS GOMBOK — az `ATMENETEK` táblából, nem kézzel felsorolva.
   *
   * Ezért nem lehet olyan menüpont, ami sehova nem vezet, és olyan képernyő
   * sem, amiről lemarad a gomb: a tábla EGY forrás, és a szonda ugyanazt járja
   * be. Az „indítás" gomb az egyetlen kivétel — az nem képernyő-váltás, hanem
   * a menü kimenete.
   */
  _navGombok(nav) {
    for (let k = 0; k < KEPERNYO_DB; k++) {
      this._gombok[k] = {};
      const lista = ATMENETEK[k] || [];
      for (let i = 0; i < lista.length; i++) {
        this._gombok[k][lista[i].akcio] = this._gomb(nav, k, lista[i].akcio, lista[i].cim, true);
      }
      if (k === KEPERNYO.INDITAS) {
        this._gombok[k].indit = this._gomb(nav, k, 'indit', 'Indítás', true);
      }
      if (k !== KEPERNYO.FOMENU) {
        this._gombok[k].vissza = this._gomb(nav, k, 'vissza', 'Vissza', false);
      }
    }
  }

  _gomb(nav, kepernyo, akcio, cim, fo) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'aoc-gomb' + (fo ? ' aoc-gomb-fo' : '');
    b.dataset.akcio = akcio;
    b.dataset.kepernyo = String(kepernyo);
    b.textContent = cim;
    b.style.display = 'none';
    nav.appendChild(b);
    return b;
  }

  // ── Események ─────────────────────────────────────────────────────────

  _kattintas(ev) {
    if (!this._enabled) return;
    const cel = ev.target;
    if (!cel || !cel.closest) return;

    const ful = cel.closest('[data-civ-rekesz]');
    if (ful) { this._civRekeszValt(Number(ful.dataset.civRekesz)); return; }

    const mentes = cel.closest('[data-mentes]');
    if (mentes) { this.allapot.mentesValaszt(mentes.dataset.mentes); this._frissit(); return; }

    const gomb = cel.closest('[data-akcio]');
    if (!gomb) return;
    const akcio = gomb.dataset.akcio;
    if (akcio === 'indit') { this._indit(); return; }
    this.allapot.lep(akcio);
    this._frissit();
  }

  _valtozas(ev) {
    if (!this._enabled) return;
    const elem = ev.target;
    if (!elem || !elem.dataset || !elem.dataset.mezo) return;
    const mezo = elem.dataset.mezo;

    if (this._beallKi && (mezo in this._beallKi || mezo === 'arnyek')) {
      const e = this.allapot.beallitasBeallit(
        mezo, mezo === 'arnyek' ? elem.checked : elem.value);
      if (e.ok && this._beallKi[mezo]) this._beallKi[mezo].textContent = String(e.ertek);
      return;
    }

    // A MEZŐ-ÉRTÉK EGÉSZ. A `<input>` szöveget ad, és a `Number('12abc')` NaN-t
    // — a nem-egészet itt fogjuk meg, hogy az adatréteg NÉVVEL utasíthassa el.
    const nyers = String(elem.value).trim();
    const szam = /^-?\d+$/.test(nyers) ? Number(nyers) : NaN;
    const e = this.allapot.beallit(mezo, szam);
    if (!e.ok) this._hibakKiir([{ mezo, ertek: nyers, hiba: e.hiba }]);
    else this._frissit();
  }

  _civRekeszValt(rekesz) {
    this._civRekesz = rekesz === 1 ? 1 : 0;
    for (let r = 0; r < 2; r++) {
      if (this._civValasztok[r]) this._civValasztok[r].enabled = r === this._civRekesz;
      if (this._civFulek[r]) this._civFulek[r].dataset.aktiv = r === this._civRekesz ? '1' : '0';
    }
  }

  /** A menü KIMENETE: kész konfig a hívónak. `Sim` itt sem születik. */
  _indit() {
    const e = this.allapot.meccsKonfig();
    if (!e.ok) { this._hibakKiir(e.hibak); return; }
    if (this.onIndit) this.onIndit(e.konfig);
  }

  // ── Rajzolás ──────────────────────────────────────────────────────────

  /**
   * A teljes felület a MODELLBŐL. Egyetlen belépési pont: minden állapot-
   * változás után ez fut, tehát nem lehet olyan gomb, ami elfelejtett frissülni.
   * Nincs képkocka-hurok — ez kattintásonként egyszer hívódik.
   */
  _frissit() {
    if (!this.gyoker) return;
    const a = this.allapot;
    const k = a.kepernyo;
    const konfig = a.konfig();

    for (let i = 0; i < KEPERNYO_DB; i++) {
      this._lapok[i].dataset.aktiv = i === k ? '1' : '0';
    }
    this._alcim.textContent = 'v' + VERZIO + '  ·  ' + KEPERNYO_NEV[k];

    // Gombok: csak az aktuális lapéi látszanak, a tiltottak `disabled`-ek.
    const lehet = {};
    const akciok = a.akciok();
    for (let i = 0; i < akciok.length; i++) lehet[akciok[i].akcio] = akciok[i];
    for (let i = 0; i < KEPERNYO_DB; i++) {
      const cs = this._gombok[i];
      for (const akcio in cs) {
        const g = cs[akcio];
        const aktiv = i === k;
        g.style.display = aktiv ? '' : 'none';
        if (!aktiv) continue;
        if (akcio === 'indit') {
          const e = a.meccsKonfig();
          g.disabled = !e.ok;
          g.title = e.ok ? '' : e.hibak.map((h) => h.hiba).join(' · ');
          continue;
        }
        const t = lehet[akcio];
        g.disabled = !t || !t.lehet;
        g.title = t && !t.lehet ? t.hibak.map((h) => h.hiba).join(' · ') : '';
      }
    }

    if (this._terkepLeiras) this._terkepLeiras.textContent = TERKEP_LEIRAS[konfig.terkep] || '';
    if (this._seedMezo && document.activeElement !== this._seedMezo) {
      this._seedMezo.value = String(konfig.seed);
    }

    // Civ-fülek: a választás a fülön is látszik, hogy ne kelljen átlapozni.
    for (let r = 0; r < 2; r++) {
      if (!this._civFulek[r]) continue;
      const c = konfig.civ[r];
      this._civFulek[r].textContent = (r === 0 ? 'A te néped: ' : 'Ellenfél: ')
        + (c === CIV_NINCS ? '—' : CIV_NEV[c]);
      if (this._civValasztok[r]) this._civValasztok[r].valaszt(c);
    }

    if (k === KEPERNYO.BETOLTES) this._mentesekKiir();
    if (k === KEPERNYO.INDITAS) this._osszegzesKiir(konfig);
    this._hibakKiir(k === KEPERNYO.FOMENU ? [] : a.ellenoriz().hibak);
  }

  _osszegzesKiir(konfig) {
    const s = this._osszSorok;
    s.seed.textContent = String(konfig.seed);
    s.n.textContent = konfig.n + '×' + konfig.n;
    s.terkep.textContent = TERKEP_NEV[konfig.terkep] || '—';
    s.civ0.textContent = konfig.civ[0] === CIV_NINCS ? '—' : CIV_NEV[konfig.civ[0]];
    s.civ1.textContent = konfig.civ[1] === CIV_NINCS ? '—' : CIV_NEV[konfig.civ[1]];
    s.nehezseg.textContent = NEHEZSEG_NEV[konfig.nehezseg] || '—';
    s.maxEgyseg.textContent = String(konfig.maxEgyseg);
    s.sajatCsapat.textContent = konfig.sajatCsapat === 0 ? '0 — kék' : '1 — piros';
    s.mentes.textContent = konfig.mentes === null ? 'nem — új meccs' : String(konfig.mentesKulcs);
  }

  /**
   * A mentés-lista ÚJRAÉPÜL a lap megnyitásakor: a tároló tartalma közben
   * változhatott (másik fül, játék közbeni F5). Menü-időben ez olcsó, és a
   * hazug lista sokkal drágább lenne.
   */
  _mentesekKiir() {
    const lista = this.allapot.mentesLista();
    const valasztott = this.allapot.konfig().mentesKulcs;
    this._mentesLista.textContent = '';
    for (let i = 0; i < lista.length; i++) {
      const m = lista[i];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'aoc-mentes';
      b.dataset.mentes = m.kulcs;
      b.dataset.ervenyes = m.ervenyes ? '1' : '0';
      b.dataset.valasztott = m.kulcs === valasztott ? '1' : '0';
      b.disabled = !m.ervenyes;
      b.appendChild(this._szoveg('span', 'aoc-mentes-cim', m.kulcs));
      b.appendChild(this._szoveg('span', 'aoc-mentes-alcim', m.cim));
      this._mentesLista.appendChild(b);
    }
    this._mentesUres.style.display = lista.length === 0 ? '' : 'none';
  }

  /** A hibák MINDIG látszanak, mezőnévvel — nem csak a gomb tooltipjében. */
  _hibakKiir(hibak) {
    const d = this._hibaDoboz;
    d.textContent = '';
    d.dataset.van = hibak.length > 0 ? '1' : '0';
    for (let i = 0; i < hibak.length; i++) {
      const s = document.createElement('div');
      const b = document.createElement('b');
      b.textContent = hibak[i].mezo + ': ';
      s.appendChild(b);
      s.appendChild(document.createTextNode(hibak[i].hiba));
      d.appendChild(s);
    }
  }

  // ── Réteg-szerződés ───────────────────────────────────────────────────

  /** Leszerelés: figyelők le, civ-választók bontva, csomópont ki. */
  bont() {
    for (let r = 0; r < this._civValasztok.length; r++) {
      if (this._civValasztok[r]) this._civValasztok[r].bont();
    }
    this._civValasztok.length = 0;
    if (this.gyoker) {
      this.gyoker.removeEventListener('click', this._kattint);
      this.gyoker.removeEventListener('change', this._valtozik);
      this.gyoker.removeEventListener('input', this._valtozik);
      if (this.gyoker.parentNode) this.gyoker.parentNode.removeChild(this.gyoker);
    }
    this.gyoker = null;
  }

  set enabled(v) {
    this._enabled = !!v;
    if (this.gyoker) this.gyoker.style.display = v ? '' : 'none';
  }
  get enabled() { return this._enabled; }
  /** A réteg-szerződés miatt: a menü nem a 3D szinterben rajzol. */
  get haromszog() { return 0; }
}
