// PORTAL HUB TYCOON — MODÁLIS ABLAKOK (történet, döntés, esemény, vég).
//
// ── MIÉRT ÁLLÍTJA MEG AZ IDŐT A TÖRTÉNET, DE AZ ESEMÉNY NEM ───────────────
// A fejezet-bevezető és a döntés az egész játszást befolyásolja, és a
// szövegét el kell olvasni — közben nem szabad, hogy elfogyjon egy kapu
// türelme. Az események viszont SŰRŰN jönnek; ha mindegyik megállítaná a
// játékot, az állandó megszakítás lenne, és a játékos elkezdené vaktában
// elkattintani őket. Ezért az esemény-doboz mellett fut tovább minden.
//
// ── EGYSZERRE EGY ────────────────────────────────────────────────────────
// A sorrend fix: vége > fejezet-döntés > fejezet-bevezető > esemény. A
// „kulcs" mező őrzi, hogy melyik ablak van kint — enélkül minden képkockán
// újraépülne a DOM, és a gombnyomás pont a csere pillanatában veszne el.

import { el, be, ures, szam } from './elemek.js';
import { FEJEZETEK, rang } from '../sim/tortenet.js';
import { ESEMENYEK } from '../sim/esemenyek.js';

export class Modalok {
  constructor(gyoker, sim, hud, vezerlo) {
    this.sim = sim;
    this.hud = hud;
    this.vezerlo = vezerlo;
    this.kulcs = null;
    this.elozoSebesseg = 1;
    /**
     * Amire már válaszoltunk. NÉLKÜLE A JÁTÉK LEFAGY, és ez nem elméleti:
     * a parancs csak a KÖVETKEZŐ tick elején fut le, tehát a bezárás után
     * néhány képkockán át a sim még ugyanabban az állapotban van. A `frissit()`
     * ilyenkor újranyitotta ugyanazt az ablakot — az pedig újra megállította az
     * időt, így a parancs SOSEM futott le. Az ablak örökre kint maradt.
     */
    this.lezart = new Set();

    const f = el('div');
    f.id = 'fatyol';
    const m = el('div');
    m.id = 'modal';
    f.appendChild(m);
    gyoker.appendChild(f);
    this.fatyol = f;
    this.modal = m;
  }

  frissit() {
    const s = this.sim;
    const t = s.tortenet;

    if (s.jatekVege) return this._mutat('vege:' + s.jatekVege, () => this._vege(s.jatekVege), true);
    // A győzelem EGYSZER jelenik meg, és nem állítja meg a világot: utána a
    // végtelen korszakok jönnek. A `lezart` halmaz gondoskodik róla, hogy ne
    // ugorjon fel újra minden képkockában.
    if (s.gyoztel) return this._mutat('gyozelem', () => this._gyozelem(), true);
    if (t.allapot === 'dontes') return this._mutat('dontes:' + t.fejezet, () => this._dontes(), true);
    if (t.allapot === 'bevezeto' && t.fejezet < FEJEZETEK.length) {
      return this._mutat('bevezeto:' + t.fejezet, () => this._bevezeto(), true);
    }
    if (s.varakozoValaszok.length > 0) {
      const e = s.varakozoValaszok[0];
      return this._mutat('esemeny:' + e.azon, () => this._esemeny(e), false);
    }
    this._rejt();
  }

  _mutat(kulcs, epito, megallit) {
    if (this.lezart.has(kulcs)) { this._rejt(); return; }
    if (this.kulcs === kulcs) return;
    this.kulcs = kulcs;
    ures(this.modal);
    this.modal.className = kulcs.startsWith('vege') ? 'vege' : '';
    epito();
    this.fatyol.classList.add('nyitva');
    if (megallit && !this._megallitva) {
      this.elozoSebesseg = this.vezerlo.sebessegIdx();
      this.vezerlo.sebesseg(0);
      this._megallitva = true;
    }
  }

  _rejt() {
    if (!this.kulcs) return;
    this.lezart.add(this.kulcs);
    this.kulcs = null;
    this.fatyol.classList.remove('nyitva');
    if (this._megallitva) {
      this.vezerlo.sebesseg(this.elozoSebesseg || 1);
      this._megallitva = false;
    }
  }

  _fejlec(ikon, alcim, cim) {
    const f = el('div', 'fejlec');
    const jobb = el('div');
    be(jobb, el('div', 'alcim', alcim), el('h1', null, cim));
    be(f, el('div', 'ikon', ikon), jobb);
    return f;
  }

  _bevezeto() {
    const f = FEJEZETEK[this.sim.tortenet.fejezet];
    be(this.modal,
      this._fejlec(f.ikon, 'Fejezet', f.cim),
      el('p', 'torzs', f.bevezeto));
    const cel = el('p', 'torzs');
    cel.innerHTML = `<b style="color:#6fd8ff">Cél:</b> ${f.celSzoveg}`;
    be(this.modal, cel);
    const v = el('div', 'valaszok');
    const g = el('button', 'valasz');
    be(g, el('b', null, 'Lássunk hozzá'), el('span', null, 'A játék folytatódik.'));
    g.onclick = () => { this.sim.parancs({ fajta: 'fejezet_tovabb' }); this._rejt(); };
    be(v, g);
    be(this.modal, v);
  }

  _dontes() {
    const f = FEJEZETEK[this.sim.tortenet.fejezet];
    be(this.modal,
      this._fejlec('⚖️', f.cim, f.dontes.kerdes),
      el('p', 'torzs', 'A választásod maradandó: az egész hátralévő játszásra hat.'));
    const v = el('div', 'valaszok');
    f.dontes.valaszok.forEach((val, i) => {
      const g = el('button', 'valasz');
      be(g, el('b', null, val.cim), el('span', null, val.leiras));
      g.onclick = () => { this.sim.parancs({ fajta: 'dontes', valasz: i }); this._rejt(); };
      be(v, g);
    });
    be(this.modal, v);
  }

  _esemeny(e) {
    const def = ESEMENYEK[e.idx];
    be(this.modal,
      this._fejlec(def.ikon, 'Esemény', e.cim || def.nev),
      el('p', 'torzs', def.leiras));
    const v = el('div', 'valaszok');
    (def.valaszok || []).forEach((val, i) => {
      const g = el('button', 'valasz');
      be(g, el('b', null, val.cim), el('span', null, val.leiras));
      if (val.ar > this.sim.penz) g.disabled = true;
      g.onclick = () => { this.sim.parancs({ fajta: 'esemeny_valasz', azon: e.azon, valasz: i }); this._rejt(); };
      be(v, g);
    });
    be(this.modal, v);
  }

  _gyozelem() {
    const s = this.sim;
    be(this.modal,
      this._fejlec('👑', 'A hét fejezet vége', 'A hálózat közepe'),
      el('p', 'torzs',
        'A Sárkánytrónus kapuja áll, és a hírneved átér a dimenziókon. Az állomásod ' +
        'már nem átszállóhely: a hálózat közepe.'),
      el('p', 'torzs',
        'A játék NEM ér véget. Innentől KORSZAKOK jönnek: mindegyik ad egy célt és egy ' +
        'rangot, és mindegyik nehezebb az előzőnél — az instabilitás és a bérek ' +
        'korszakonként nőnek. Addig játszol, ameddig bírod.'));
    const t = el('p', 'torzs');
    t.innerHTML =
      `<b>${s.nap}</b> nap · <b>${szam(s.osszTavozo)}</b> utas fordult meg nálad<br>` +
      `elégedetten: <b style="color:#63d68a">${szam(s.elegedettTavozok)}</b> · ` +
      `dühösen: <b style="color:#ff5d73">${szam(s.duhosTavozok)}</b><br>` +
      `hírnév: <b>${s.hirnev.toFixed(0)}</b> · csúcsforgalom: <b>${s.csucsUtas}</b> egyszerre`;
    be(this.modal, t);
    const v = el('div', 'valaszok');
    const g = el('button', 'valasz');
    be(g, el('b', null, `Tovább — ${rang(1).ikon} ${rang(1).nev}`),
      el('span', null, 'Kezdődik az 1. korszak. A világ ott folytatódik, ahol abbahagytad.'));
    g.onclick = () => this._rejt();
    be(v, g);
    be(this.modal, v);
  }

  _vege(fajta) {
    const s = this.sim;
    const gyozelem = false;   // a győzelem külön ablak, ez már csak a csőd
    be(this.modal,
      this._fejlec(gyozelem ? '👑' : '💸', gyozelem ? 'Az ív vége' : 'Vége', gyozelem ? 'A hálózat közepe' : 'Csőd'),
      el('p', 'torzs', gyozelem
        ? 'A Sárkánytrónus kapuja áll, és a hírneved átér a dimenziókon. Az állomásod ' +
          'már nem átszállóhely: a hálózat közepe. Innentől a saját történeted írod.'
        : 'A Tanács átvette az állomást. A kapuk nyitva maradtak, de már nem a te nevedben.'));
    const t = el('p', 'torzs');
    t.innerHTML =
      `<b>${s.nap}</b> nap · <b>${szam(s.osszTavozo)}</b> utas fordult meg nálad<br>` +
      `elégedetten: <b style="color:#63d68a">${szam(s.elegedettTavozok)}</b> · dühösen: <b style="color:#ff5d73">${szam(s.duhosTavozok)}</b><br>` +
      `hírnév: <b>${s.hirnev.toFixed(0)}</b> · csúcsforgalom: <b>${s.csucsUtas}</b> egyszerre`;
    be(this.modal, t);
    const v = el('div', 'valaszok');
    const g = el('button', 'valasz');
    be(g, el('b', null, 'Új állomás'), el('span', null, 'Új seed, új világ, új döntések.'));
    g.onclick = () => location.reload();
    be(v, g);
    be(this.modal, v);
  }
}
