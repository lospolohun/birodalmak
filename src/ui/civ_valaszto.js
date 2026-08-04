// AGE OF THE CRYSTALS — CIV-VÁLASZTÓ (v0.11/1): a főmenü nép-választó lapja.
//
// ── MIÉRT NEM ÍR A SIMBE ──────────────────────────────────────────────────
// Ez a réteg CSAK azt tudja, melyik kártyára kattintottak, és szól róla az
// `onValaszt(civ)` visszahívásban. A `sim.civValaszt(csapat, civ)` hívása a
// HÍVÓ dolga — ugyanaz a szabály, mint a `Kijeloles`-nél: a UI nem ír a
// szimulációba, mert a v0.8 óta a világ-állapot a lockstep-soron keletkezik.
// A civ-választás ráadásul a MECCS ELŐTT dől el, tehát a hálózaton is
// meccs-indító adatként megy majd át, nem képernyő-eseményként.
//
// ── MIÉRT VAN A SZÖVEG EGY MÁSIK FÁJLBAN ──────────────────────────────────
// A `civ_valaszto_adat.js` DOM-mentes, tehát node-ban vizsgálható. A nehéz
// rész (nyers `[hatás, index, érték]` → magyar mondat, és főleg az ELŐNY/
// HÁTRÁNY szétválasztás fordított olvasatú ár- és idő-hatásokkal) ott van, és
// ott van szondával őrizve is. Ide csak a rajzolás maradt: nyolc kártya, egy
// kiválasztott állapot.
//
// ── ALLOKÁCIÓ ÉS ESEMÉNYEK ────────────────────────────────────────────────
// A kártyák EGYSZER épülnek fel, a szövegek EGYSZER kérdeződnek le. Utána a
// választás váltása csak két `dataset` értékadás — nincs újraépítés, nincs
// allokáció, ahogy a `Hud._ir()`-nél sem. Nyolc kártyához pedig EGY figyelő
// tartozik a rácson (esemény-delegálás), nem nyolc: a `bont()` így egyetlen
// sorral tud maradéktalanul leszerelni, és nem hagy szivárgó figyelőt a menü
// bezárása után.
//
// ── STÍLUS: SAJÁT `<style>`, NEM AZ `alap.css` ────────────────────────────
// A menü-lap a saját stílusát hozza magával, egyetlen, azonosítóval jelölt
// `<style>`-ban, amit csak akkor tesz be, ha még nincs. Így a fájl önmagában
// teljes: aki beemeli, nem tud elfelejteni hozzá egy CSS-t, és két példány sem
// duplázza meg a szabályokat. A színek SZÁNDÉKOSAN az `alap.css` palettájából
// valók — egy szín egy dolgot jelentsen a játék minden felületén.

import { civValasztoLista } from './civ_valaszto_adat.js';
import { CIV_NINCS } from '../sim/civ.js';

const STILUS_ID = 'civ-valaszto-stilus';

const STILUS = `
.civ-valaszto {
  position: fixed; inset: 0; z-index: 30;
  display: flex; flex-direction: column; align-items: center;
  gap: 14px; padding: 26px 20px; overflow-y: auto;
  background: rgba(5, 7, 12, 0.94);
  color: #dfe7f5;
  font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
}
.civ-valaszto h2 {
  font-size: 15px; font-weight: 700; letter-spacing: 1.2px;
  text-transform: uppercase; opacity: 0.75;
}
.civ-racs {
  display: grid; gap: 12px; width: 100%; max-width: 1180px;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
}
.civ-kartya {
  display: flex; flex-direction: column; gap: 7px;
  padding: 12px 14px; text-align: left; cursor: pointer;
  color: inherit; font: inherit;
  background: rgba(6, 10, 18, 0.72);
  border: 1px solid rgba(120, 190, 255, 0.22);
  border-radius: 6px;
  transition: border-color 120ms, background 120ms;
}
.civ-kartya:hover { border-color: rgba(120, 190, 255, 0.55); }
.civ-kartya:focus-visible { outline: 2px solid #ffd479; outline-offset: 2px; }
.civ-kartya[data-valasztott="1"] {
  border-color: #ffd479;
  background: rgba(255, 212, 121, 0.10);
  box-shadow: 0 0 0 1px rgba(255, 212, 121, 0.35) inset;
}
.civ-kartya-nev { font-size: 15px; font-weight: 700; letter-spacing: 0.3px; }
.civ-kartya-leiras { opacity: 0.72; font-size: 12px; }
.civ-kartya ul { list-style: none; display: flex; flex-direction: column; gap: 2px; }
.civ-kartya li { font-size: 12px; padding-left: 15px; text-indent: -15px; }
.civ-elony li::before  { content: '+ '; color: #7fc98c; font-weight: 700; }
.civ-hatrany li::before { content: '− '; color: #e08494; font-weight: 700; }
.civ-elony li  { color: #cfe4d3; }
.civ-hatrany li { color: #e6cdd2; }
.civ-valaszto-labjegyzet { opacity: 0.5; font-size: 11px; }
`;

export class CivValaszto {
  /**
   * @param {HTMLElement} [szulo] hova kerüljön (alapból a `document.body`)
   * @param {{
   *   onValaszt?:(civ:number)=>void,
   *   valasztott?:number,
   *   cim?:string
   * }} [opciok]
   *   Az `onValaszt` CSAK VÁLTOZÁSKOR szól: a hívó jellemzően a
   *   `sim.civValaszt()`-ba tolja tovább, ami a bónuszokat újraszámolja —
   *   ugyanarra a civre kétszer meghívni fölösleges munka.
   */
  constructor(szulo, opciok = {}) {
    this.onValaszt = opciok.onValaszt || null;
    this._valasztott = opciok.valasztott ?? CIV_NINCS;
    this._enabled = true;
    /** Kártya-elemek `CIV.*` szerint indexelve — a váltás ezeket kapcsolja. */
    this._kartyak = [];
    this.gyoker = null;

    if (typeof document === 'undefined') return;

    if (!document.getElementById(STILUS_ID)) {
      const st = document.createElement('style');
      st.id = STILUS_ID;
      st.textContent = STILUS;
      document.head.appendChild(st);
    }

    const gyoker = document.createElement('div');
    gyoker.className = 'civ-valaszto';

    const cim = document.createElement('h2');
    cim.textContent = opciok.cim || 'Válassz népet';
    gyoker.appendChild(cim);

    const racs = document.createElement('div');
    racs.className = 'civ-racs';
    gyoker.appendChild(racs);

    // A SZÖVEGEK EGYSZER. Innentől a rajzoló út csak `dataset`-et ír.
    const lista = civValasztoLista();
    for (let i = 0; i < lista.length; i++) this._kartya(racs, lista[i]);

    const lab = document.createElement('div');
    lab.className = 'civ-valaszto-labjegyzet';
    lab.textContent = 'Minden népnek van gyengéje is — a választás a játékstílusról szól.';
    gyoker.appendChild(lab);

    // ── EGY figyelő nyolc kártyára ──────────────────────────────────────
    this._kattint = (ev) => {
      if (!this._enabled) return;
      const kartya = ev.target.closest ? ev.target.closest('.civ-kartya') : null;
      if (!kartya || !racs.contains(kartya)) return;
      this.valaszt(Number(kartya.dataset.civ));
    };
    racs.addEventListener('click', this._kattint);
    this._racs = racs;

    (szulo || document.body).appendChild(gyoker);
    this.gyoker = gyoker;
    this._jeloles();
  }

  /** Egy kártya felépítése. A `<button>` a billentyűzetet is ingyen hozza. */
  _kartya(racs, adat) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'civ-kartya';
    b.dataset.civ = String(adat.civ);
    b.dataset.valasztott = '0';

    const nev = document.createElement('span');
    nev.className = 'civ-kartya-nev';
    nev.textContent = adat.nev;
    b.appendChild(nev);

    const le = document.createElement('span');
    le.className = 'civ-kartya-leiras';
    le.textContent = adat.leiras;
    b.appendChild(le);

    this._lista(b, 'civ-elony', adat.elony);
    this._lista(b, 'civ-hatrany', adat.hatrany);

    racs.appendChild(b);
    this._kartyak[adat.civ] = b;
  }

  _lista(szulo, osztaly, mondatok) {
    if (mondatok.length === 0) return;
    const ul = document.createElement('ul');
    ul.className = osztaly;
    for (let i = 0; i < mondatok.length; i++) {
      const li = document.createElement('li');
      li.textContent = mondatok[i];
      ul.appendChild(li);
    }
    szulo.appendChild(ul);
  }

  /**
   * VÁLASZTÁS — kattintásból és kívülről is (mentett beállítás visszatöltése).
   * @param {number} civ `CIV.*` vagy `CIV_NINCS`
   * @returns {boolean} változott-e
   */
  valaszt(civ) {
    const c = civ | 0;
    if (c !== CIV_NINCS && (c < 0 || c >= this._kartyak.length)) return false;
    if (c === this._valasztott) return false;
    this._valasztott = c;
    this._jeloles();
    if (this.onValaszt) this.onValaszt(c);
    return true;
  }

  /** A kiválasztott állapot kirajzolása. Csak `dataset`, semmi újraépítés. */
  _jeloles() {
    for (let i = 0; i < this._kartyak.length; i++) {
      const k = this._kartyak[i];
      if (!k) continue;
      const be = i === this._valasztott;
      k.dataset.valasztott = be ? '1' : '0';
      k.setAttribute('aria-pressed', be ? 'true' : 'false');
    }
  }

  /** A jelenlegi választás. `CIV_NINCS`, ha még nem választottak. */
  get valasztott() { return this._valasztott; }

  /** Leszerelés: figyelő le, csomópont ki. A menü bezárása ezt hívja. */
  bont() {
    if (this._racs && this._kattint) this._racs.removeEventListener('click', this._kattint);
    if (this.gyoker && this.gyoker.parentNode) this.gyoker.parentNode.removeChild(this.gyoker);
    this.gyoker = null;
    this._racs = null;
  }

  set enabled(v) {
    this._enabled = !!v;
    if (this.gyoker) this.gyoker.style.display = v ? '' : 'none';
  }
  get enabled() { return this._enabled; }
  /** A réteg-szerződés miatt van: a menü nem a 3D szinterben rajzol. */
  get haromszog() { return 0; }
}
