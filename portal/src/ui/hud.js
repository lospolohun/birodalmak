// PORTAL HUB TYCOON — FELSŐ SÁV, FEJEZET-KÁRTYA, ÜZENETEK, SÚGÓBUBORÉK.
//
// ── MIÉRT EZ A HAT SZÁM ÉS NEM TÖBB ───────────────────────────────────────
// A HUD nem kimutatás. Minden szám azért van itt, mert VAN RÁ VÁLASZLÉPÉS:
//
//   pénz      → mit engedhetek meg magamnak
//   nap       → mikor jön a következő bérfizetés
//   hírnév    → mennyi utas fog jönni
//   utasszám  → mekkora a terhelés MOST
//   energia   → lassul-e minden (a legalattomosabb hiba: nem hibaüzenet,
//               csak minden rosszabb lesz — ezért van saját, piros jelzése)
//   kosz      → a lassan romló hangulat oka
//
// Ami nem fér ide, az panelbe kerül. Egy tycoonban a HUD hitele azon múlik,
// hogy nem hazudik és nem fecseg — az AoC-nál két HUD-szám hónapokig rossz
// volt, és emiatt az EGÉSZ felületre gyanakodni kellett.

import { el, be, szoveg, szam, savBeallit } from './elemek.js';
import { JATEK_NEV, VERZIO, SEBESSEGEK, NAP_TICK } from '../mag/config.js';
import { FEJEZETEK } from '../sim/tortenet.js';

const SZINEK = ['#ff5d73', '#ffc247', '#63d68a'];

export class Hud {
  /**
   * @param {HTMLElement} gyoker
   * @param {import('../sim/sim.js').Sim} sim
   * @param {{sebesseg:(i:number)=>void}} vezerlo
   */
  constructor(gyoker, sim, vezerlo) {
    this.sim = sim;
    this.vezerlo = vezerlo;
    this._naploHossz = sim.naplok.length;

    // ── FELSŐ SÁV ────────────────────────────────────────────────────────
    const felso = el('div');
    felso.id = 'felso';

    const nev = el('div', 'cimke');
    nev.id = 'jatek-nev';
    be(nev, el('span', null, JATEK_NEV), el('small', null, ' v' + VERZIO));

    this.penz = this._cimke(felso, '💰', 'pénz');
    this.nap = this._cimke(felso, '📅', 'nap');
    this.hirnev = this._cimkeSav(felso, '⭐', 'hírnév');
    this.utas = this._cimke(felso, '👥', 'utas');
    this.energia = this._cimke(felso, '⚡', 'energia');
    this.kosz = this._cimkeSav(felso, '🧹', 'tisztaság');

    felso.insertBefore(nev, felso.firstChild);

    // ── SEBESSÉG ─────────────────────────────────────────────────────────
    const seb = el('div');
    seb.id = 'sebesseg';
    this.sebGombok = [];
    const felirat = ['⏸', '▶', '▶▶', '▶▶▶'];
    for (let i = 0; i < SEBESSEGEK.length; i++) {
      const g = el('button', i === 1 ? 'aktiv' : '', felirat[i]);
      g.title = `Sebesség: ${SEBESSEGEK[i]}×  (szóköz = szünet, 1-4)`;
      g.onclick = () => vezerlo.sebesseg(i);
      seb.appendChild(g);
      this.sebGombok.push(g);
    }
    felso.appendChild(seb);
    gyoker.appendChild(felso);

    // ── FEJEZET-KÁRTYA ───────────────────────────────────────────────────
    const f = el('div');
    f.id = 'fejezet';
    this.fejCim = el('h3');
    this.fejCel = el('p');
    const sav = el('div', 'sav');
    this.fejSav = el('i');
    sav.appendChild(this.fejSav);
    be(f, this.fejCim, this.fejCel, sav);
    gyoker.appendChild(f);
    this.fejezetDoboz = f;

    // ── ÜZENETEK ─────────────────────────────────────────────────────────
    const u = el('div');
    u.id = 'uzenetek';
    gyoker.appendChild(u);
    this.uzenetek = u;

    // ── SÚGÓBUBORÉK ──────────────────────────────────────────────────────
    const b = el('div');
    b.id = 'buborek';
    gyoker.appendChild(b);
    this.buborek = b;
  }

  _cimke(szulo, ikon, cim) {
    const c = el('div', 'cimke');
    c.title = cim;
    const b = el('b', null, '—');
    be(c, el('span', 'ikon', ikon), b);
    szulo.appendChild(c);
    c._ertek = b;
    return c;
  }

  _cimkeSav(szulo, ikon, cim) {
    const c = this._cimke(szulo, ikon, cim);
    const sav = el('div', 'sav');
    const i = el('i');
    sav.appendChild(i);
    c.appendChild(sav);
    c._sav = i;
    return c;
  }

  sebessegJeloles(i) {
    for (let k = 0; k < this.sebGombok.length; k++) this.sebGombok[k].classList.toggle('aktiv', k === i);
  }

  /** Képkockánként. Csak akkor ír a DOM-ba, ha tényleg változott az érték. */
  frissit() {
    const s = this.sim;
    szoveg(this.penz._ertek, szam(s.penz));
    this.penz.classList.toggle('baj', s.penz < 0);

    const oraArany = (s.tick % NAP_TICK) / NAP_TICK;
    szoveg(this.nap._ertek, `${s.nap}. nap ${Math.floor(oraArany * 24)}:00`);

    szoveg(this.hirnev._ertek, s.hirnev.toFixed(0));
    savBeallit(this.hirnev._sav, s.hirnev / 100, SZINEK);

    szoveg(this.utas._ertek, `${s.utasSzam}`);

    szoveg(this.energia._ertek, `${s.energiaIgeny}/${s.energiaTermeles}`);
    this.energia.classList.toggle('baj', s.aramszunet);
    this.energia.title = s.aramszunet
      ? 'ÁRAMSZÜNET: minden szolgáltatás 40 %-on megy. Építs energiamagot!'
      : 'Energia: fogyasztás / termelés';

    const tiszta = 1 - s.kosz / 1000;
    szoveg(this.kosz._ertek, `${Math.round(tiszta * 100)}%`);
    savBeallit(this.kosz._sav, tiszta, SZINEK);
    this.kosz.classList.toggle('gond', tiszta < 0.5);

    this._fejezetet();
    this._naplot();
  }

  _fejezetet() {
    const t = this.sim.tortenet;
    if (t.allapot === 'vege' || t.fejezet >= FEJEZETEK.length) {
      szoveg(this.fejCim, '★ Az ív végére értél');
      szoveg(this.fejCel, 'Az állomás a hálózat közepe. Innentől a te történeted.');
      savBeallit(this.fejSav, 1, SZINEK);
      return;
    }
    const f = FEJEZETEK[t.fejezet];
    szoveg(this.fejCim, `${f.ikon} ${f.cim}`);
    szoveg(this.fejCel, f.celSzoveg);
    savBeallit(this.fejSav, f.halad(this.sim), SZINEK);
  }

  /** Az új naplósorok buborékként felúsznak, majd eltűnnek. */
  _naplot() {
    const n = this.sim.naplok;
    if (n.length === this._naploHossz) return;
    for (let i = Math.max(this._naploHossz, n.length - 4); i < n.length; i++) this.uzen(n[i].szoveg, n[i].fajta);
    this._naploHossz = n.length;
  }

  /** @param {string} sz @param {'info'|'jo'|'gond'|'baj'} fajta */
  uzen(sz, fajta = 'info') {
    const e = el('div', 'uzenet ' + fajta, sz);
    this.uzenetek.appendChild(e);
    // Négynél többet nem tartunk: az üzenetsáv nem naplónézet, hanem
    // figyelemfelhívás. A teljes napló a panelben van.
    while (this.uzenetek.childElementCount > 4) this.uzenetek.removeChild(this.uzenetek.firstChild);
    setTimeout(() => { if (e.parentNode) e.parentNode.removeChild(e); }, 6500);
  }

  /** Súgóbuborék az egérnél. `null` szöveggel eltűnik. */
  buborekot(html, x, y) {
    const b = this.buborek;
    if (!html) { b.style.display = 'none'; return; }
    if (b._html !== html) { b.innerHTML = html; b._html = html; }
    b.style.display = 'block';
    const sz = b.offsetWidth, m = b.offsetHeight;
    b.style.left = Math.min(innerWidth - sz - 8, x + 16) + 'px';
    b.style.top = Math.min(innerHeight - m - 8, y + 16) + 'px';
  }
}
