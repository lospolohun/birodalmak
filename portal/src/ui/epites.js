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

// A `sug` a fül SAJÁT buborékja: nyolc ikonos felirat között az „Üzem" és a
// „Kötelező" nem mond semmit annak, aki most ült le. Mindegyik azt a KÉRDÉST
// írja le, amire a fül válaszol.
const KATEGORIAK = [
  { kod: 'alap', nev: '🧭 Alap', sug: 'Vizsgálat, padló, bontás — a három szerkesztő-eszköz.', eszkozok: true, epuletek: [] },
  { kod: 'kapuk', nev: '🌀 Kapuk', sug: 'Melyik világot nyitom meg? Innen jönnek az utasok.', kapuk: true, epuletek: [] },
  { kod: 'kotelezo', nev: '🛡️ Kötelező', sug: 'Amin MINDEN utas átmegy. Enélkül csalódottan indul tovább.', epuletek: ['biztonsag', 'vam', 'poggyasz'] },
  { kod: 'kenyelem', nev: '🪑 Kényelem', sug: 'Türelmet és hangulatot tölt vissza. Alig hoz pénzt, mégis ez tartja a hírnevet.', epuletek: ['varo', 'wc', 'info', 'seprupark', 'hoforras', 'jegkamra'] },
  { kod: 'bevetel', nev: '💰 Bevétel', sug: 'Ebből él az állomás. A portáldíj önmagában kevés.', epuletek: ['etterem', 'bolt', 'konyvesbolt', 'reklam', 'vip'] },
  { kod: 'szint', nev: '🪜 Szintek', sug: 'Átjárók az emeletek közt. Emeletre váltani a felső sávban (R / F) lehet.', epuletek: ['lepcso', 'teleportlift'] },
  { kod: 'csatorna', nev: '🚂 Csatornák', sug: 'Utas kapu nélkül: nincs instabilitás, nem fogyaszt kristályt.', epuletek: ['vasut', 'leghajo', 'urkapu'] },
  { kod: 'uzem', nev: '⚙️ Üzem', sug: 'Amitől nem romlik el: áram, kapukarbantartás, takarítás, orvos.', epuletek: ['energiamag', 'karbantarto', 'takarito', 'orvos'] },
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
      g.title = `${k.nev.replace(/^\S+\s/, '')} — ${k.sug}`;
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
      // A csatornák (vasút, léghajó, űrkapu) NEM ide tartoznak: azokat nem
      // megnyitni kell, hanem megépíteni — a saját fülükön.
      if (d.csatorna) continue;
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
    g._nev = nev;
    g._sugo = sugo;
    const s1 = el('div', 'sor1');
    be(s1, el('span', null, ikon), el('span', null, nev));
    be(g, s1);
    if (ar !== undefined) be(g, el('div', 'sor2', szam(ar) + ' 💎'));
    be(g, el('div', 'sor3', alcim));
    // A tiltás OKA külön sor, és nem csak kattintás után derül ki. A szürke
    // gomb önmagában nem információ: a játékos vagy azt hiszi, hogy elromlott
    // valami, vagy — ami rosszabb — azt, hogy az az épület nem is létezik.
    g._ok = el('div', 'sorOk');
    be(g, g._ok);
    g.onclick = () => {
      if (g.classList.contains('tiltott')) { this.hud.uzen(g._okSzoveg || 'Most nem építhető.', 'gond'); return; }
      this.valaszt(eszkoz);
    };
    const buborek = (e) => this.hud.buborekot(this._buborek(g), e.clientX, e.clientY);
    g.onmouseenter = buborek;
    g.onmousemove = buborek;
    g.onmouseleave = () => this.hud.buborekot(null);
    return g;
  }

  _buborek(g) {
    let sz = `<b>${g._nev}</b><br>${g._sugo || ''}`;
    if (g._okSzoveg) sz += `<br><i style="color:#ffc247">${g._okSzoveg}</i>`;
    return sz;
  }

  /** Olcsó, képkockánkénti állapotfrissítés: mire telik, mi van kikutatva. */
  frissit() {
    for (const g of this.lista.children) {
      if (g._ar === undefined) continue;
      const kutatasHianyzik = g._kutatas && !this.sim.kesz(g._kutatas);
      const hianyzoPenz = Math.ceil(g._ar - this.sim.penz);
      const tiltott = kutatasHianyzik || hianyzoPenz > 0;
      const ok = kutatasHianyzik
        ? `🔒 ${tech(g._kutatas).nev} kell hozzá`
        : (hianyzoPenz > 0 ? `még ${szam(hianyzoPenz)} 💎 kell` : '');
      if (g._tiltott !== tiltott) { g.classList.toggle('tiltott', tiltott); g._tiltott = tiltott; }
      if (g._okSzoveg !== ok) { g._okSzoveg = ok; g._ok.textContent = ok; }
    }
  }
}
