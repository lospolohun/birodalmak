// PORTAL HUB TYCOON — ÉPÍTÉS-SÁV.
//
// ── MIÉRT KATEGÓRIÁK ──────────────────────────────────────────────────────
// Húsz épület egy sorban nem választék, hanem fal. A hat kategória nem
// esztétikai rendezés: mindegyik egy KÉRDÉSRE válaszol, amit a játékos épp
// föltesz magának — „hogyan terjeszkedjek?", „mi a kötelező?", „miből lesz
// pénz?", „mitől nem romlik el?". Ha az épület nem sorolható be ezek egyikébe
// sem, akkor valószínűleg nem is kell a játékba.
//
// ── A KAPUK KÜLÖN LAPON VANNAK ────────────────────────────────────────────
// A kapu az egyetlen épület, aminek KÉT paramétere van (hely + dimenzió).
// Ezt nem lehet egy gombba sűríteni, ezért a „Kapuk" fül dimenziónként ad egy
// gombot, a teljes árral. Így a döntés — „melyik világot nyitom meg?" — ott
// és akkor születik meg, ahol a következménye is látszik.

import { el, be, ures, szam } from './elemek.js';
import { EPULETEK } from '../sim/epuletek.js';
import { DIMENZIOK } from '../sim/dimenziok.js';
import { tech } from '../sim/kutatas.js';

const KATEGORIAK = [
  { kod: 'alap', nev: '🧭 Alap', eszkozok: true, epuletek: [] },
  { kod: 'kapuk', nev: '🌀 Kapuk', kapuk: true, epuletek: [] },
  { kod: 'kotelezo', nev: '🛡️ Kötelező', epuletek: ['biztonsag', 'vam', 'poggyasz'] },
  { kod: 'kenyelem', nev: '🪑 Kényelem', epuletek: ['varo', 'wc', 'info', 'seprupark', 'hoforras', 'jegkamra'] },
  { kod: 'bevetel', nev: '💰 Bevétel', epuletek: ['etterem', 'bolt', 'konyvesbolt', 'reklam', 'vip'] },
  { kod: 'uzem', nev: '⚙️ Üzem', epuletek: ['energiamag', 'karbantarto', 'takarito', 'orvos', 'teleportlift'] },
];

/** Az „Alap" fül eszközei: ezek nem épületek, hanem szerkesztő-módok. */
const ESZKOZOK = [
  { fajta: 'kez', ikon: '👆', nev: 'Kéz', alcim: 'vizsgálat', sug: 'Kattints egy épületre a részleteiért.' },
  { fajta: 'padlo', ikon: '⬜', nev: 'Padló', alcim: 'húzható', sug: 'Kiépíti a járható padlót. Húzással téglalap.' },
  { fajta: 'bont', ikon: '⛏️', nev: 'Bontás', alcim: 'visszatérítés', sug: 'Épület vagy padló bontása. Az ár 45 %-át visszakapod.' },
];

export class EpitesSav {
  constructor(gyoker, sim, hud) {
    this.sim = sim;
    this.hud = hud;
    /** A jelenlegi eszköz. A `fo.js` ezt olvassa a kattintásoknál. */
    this.eszkoz = { fajta: 'kez', tipus: null, dim: null };
    this.kategoria = 'alap';

    const doboz = el('div');
    doboz.id = 'epites';
    const kat = el('div');
    kat.id = 'kategoriak';
    this.katGombok = [];
    for (const k of KATEGORIAK) {
      const g = el('button', k.kod === this.kategoria ? 'aktiv' : '', k.nev);
      g.onclick = () => { this.kategoria = k.kod; this._katJeloles(); this.ujraEpit(); };
      kat.appendChild(g);
      this.katGombok.push({ kod: k.kod, g });
    }
    this.lista = el('div');
    this.lista.id = 'epuletek';
    be(doboz, kat, this.lista);
    gyoker.appendChild(doboz);

    addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.valaszt({ fajta: 'kez', tipus: null, dim: null });
    });

    this.ujraEpit();
  }

  _katJeloles() {
    for (const { kod, g } of this.katGombok) g.classList.toggle('aktiv', kod === this.kategoria);
  }

  valaszt(eszkoz) {
    this.eszkoz = eszkoz;
    this._gombJeloles();
  }

  _gombJeloles() {
    for (const g of this.lista.children) {
      const e = g._eszkoz;
      const aktiv = e && e.fajta === this.eszkoz.fajta && e.tipus === this.eszkoz.tipus && e.dim === this.eszkoz.dim;
      g.classList.toggle('aktiv', !!aktiv);
    }
  }

  /** A gombok újraépítése — csak fülváltáskor és dimenzió-változáskor. */
  ujraEpit() {
    const k = KATEGORIAK.find((x) => x.kod === this.kategoria);
    ures(this.lista);
    if (k.eszkozok) {
      for (const e of ESZKOZOK) {
        this.lista.appendChild(this._gomb({ fajta: e.fajta, tipus: null, dim: null }, e.ikon, e.nev, e.alcim, e.sug));
      }
    }
    if (k.kapuk) this._kapuGombok();
    for (const kod of k.epuletek) {
      const t = EPULETEK.find((x) => x.kod === kod);
      if (!t) continue;
      const alcim = `${t.sz}×${t.m} · ⚡${t.energia}${t.szemelyzet ? ' · 👷' + t.szemelyzet : ''}`;
      this.lista.appendChild(this._gomb(
        { fajta: 'epit', tipus: kod, dim: null }, t.ikon, t.nev, alcim, t.leiras, t.ar, t.kutatas,
      ));
    }
    this._gombJeloles();
    this.frissit();
  }

  _kapuGombok() {
    const sim = this.sim;
    let volt = false;
    for (let i = 0; i < DIMENZIOK.length; i++) {
      const d = DIMENZIOK[i];
      const all = sim.dimenziok[i];
      if (!all.felfedezve || all.lezarva || all.nyitva) continue;
      const portalAr = EPULETEK.find((x) => x.kod === 'portal').ar;
      let nyitas = d.nyitasAr;
      if (sim.tortenetJelzok.has('megerosites')) nyitas = Math.round(nyitas * 1.6);
      const ar = portalAr + nyitas;
      this.lista.appendChild(this._gomb(
        { fajta: 'epit', tipus: 'portal', dim: d.kod }, d.ikon, d.nev,
        `3×3 · díj ${d.dij} · veszély ${d.veszely.toFixed(2)}×`, d.leiras, ar,
      ));
      volt = true;
    }
    if (!volt) {
      const u = el('div', 'epgomb tiltott');
      be(u,
        el('div', 'sor1', '🌀 Nincs nyitható világ'),
        el('div', 'sor3', 'Haladj a történettel, vagy kutasd ki a Mélyszkennelést.'));
      this.lista.appendChild(u);
    }
  }

  _gomb(eszkoz, ikon, nev, alcim, sugo, ar, kutatasKod) {
    const g = el('button', 'epgomb');
    g._eszkoz = eszkoz;
    g._ar = ar;
    g._kutatas = kutatasKod;
    const s1 = el('div', 'sor1');
    be(s1, el('span', null, ikon), el('span', null, nev));
    be(g, s1);
    if (ar !== undefined) be(g, el('div', 'sor2', szam(ar) + ' 💎'));
    be(g, el('div', 'sor3', alcim));
    g.onclick = () => {
      if (g.classList.contains('tiltott')) {
        this.hud.uzen(kutatasKod && !this.sim.kesz(kutatasKod)
          ? `Előbb ki kell kutatni: ${tech(kutatasKod).nev}`
          : 'Nincs rá elég pénz.', 'gond');
        return;
      }
      this.valaszt(eszkoz);
    };
    g.onmouseenter = (e) => this.hud.buborekot(`<b>${nev}</b><br>${sugo || ''}`, e.clientX, e.clientY);
    g.onmousemove = (e) => this.hud.buborekot(`<b>${nev}</b><br>${sugo || ''}`, e.clientX, e.clientY);
    g.onmouseleave = () => this.hud.buborekot(null);
    return g;
  }

  /** Olcsó, képkockánkénti állapotfrissítés: mire telik, mi van kikutatva. */
  frissit() {
    for (const g of this.lista.children) {
      if (g._ar === undefined) continue;
      const kutatasHianyzik = g._kutatas && !this.sim.kesz(g._kutatas);
      const tiltott = kutatasHianyzik || this.sim.penz < g._ar;
      if (g._tiltott !== tiltott) { g.classList.toggle('tiltott', tiltott); g._tiltott = tiltott; }
    }
  }
}
