// PORTAL HUB TYCOON — BESTIÁRIUM.
//
// ── MIÉRT KELL EZ A PANEL ─────────────────────────────────────────────────
// A játék ígérete az, hogy „minden faj másképp viselkedik" — de a v0.1-ben ez
// az ígéret CSAK A KÓDBAN volt olvasható. A játékos látta, hogy a trollok
// lassan mennek és elfogy a türelmük, de nem tudta meg, hogy azért, mert négy
// utas helyét foglalják a folyosón. Egy rendszer, amit nem lehet megérteni,
// nem stratégia, hanem szerencsejáték.
//
// Ezért ez a panel KÉT dolgot mutat egyszerre:
//   • a faj ÁLLANDÓ tulajdonságait (mit akar, mit bír, mennyit költ), és
//   • azt, hogy ÉPP MOST hányan vannak bent, és milyen a hangulatuk.
//
// A második fele a fontosabb: abból derül ki, hogy a bajt melyik faj hozza.

import { el, be, szam } from './elemek.js';
import { FAJOK } from '../sim/lenyek.js';
import { DIMENZIOK } from '../sim/dimenziok.js';
import { IGENYEK } from '../sim/epuletek.js';

/** Igénykód → olvasható név. */
function igenyNev(kod) {
  const i = IGENYEK.find((x) => x.kod === kod);
  return i ? i.nev : kod;
}

/**
 * Melyik felfedezett dimenzióból érkezhet ez a faj, és milyen súllyal.
 * Ez köti össze a két panelt: „ha nem akarsz trollt, ne nyisd meg a Kőhegységet".
 */
function honnan(sim, fajKod) {
  const ki = [];
  for (let i = 0; i < DIMENZIOK.length; i++) {
    if (!sim.dimenziok[i].felfedezve) continue;
    const d = DIMENZIOK[i];
    let ossz = 0, sajat = 0;
    for (const f of d.fajok) { ossz += f.suly; if (f.kod === fajKod) sajat = f.suly; }
    if (sajat > 0) ki.push(`${d.ikon} ${d.nev} ${Math.round(sajat / ossz * 100)} %`);
  }
  return ki;
}

/**
 * A panel felépítése.
 * @param {HTMLElement} p a kiürített panel-elem
 * @param {import('../sim/sim.js').Sim} sim
 */
export function bestiariumot(p, sim) {
  be(p, el('h2', null, '🐾 Bestiárium'));

  // ── ÉLŐ SZÁMLÁLÁS ─────────────────────────────────────────────────────
  // Egy végigfutás az utaskészleten. 1200 elem — a panel fél másodpercenként
  // épül újra, ez elhanyagolható, cserébe a szám MINDIG igaz.
  const db = new Int32Array(FAJOK.length);
  const hangulatOssz = new Float64Array(FAJOK.length);
  const sorban = new Int32Array(FAJOK.length);
  let jelen = 0;
  for (let i = 0; i < sim.utasok.length; i++) {
    const u = sim.utasok[i];
    if (!u.aktiv) continue;
    db[u.fajIdx]++;
    hangulatOssz[u.fajIdx] += u.hangulat;
    if (u.allapot === 3) sorban[u.fajIdx]++;
    jelen++;
  }

  const osszes = el('div', 'tetel');
  osszes.innerHTML = `<div class="fej"><b>Jelenleg az állomáson</b><span>${jelen} lény</span></div>`;
  be(p, osszes);

  // Sorrend: aki most bent van, az előre. A bestiárium ne lexikon legyen,
  // hanem helyzetjelentés — ami épp számít, azt kelljen legkevesebbet keresni.
  const sorrend = FAJOK.map((f, i) => i).sort((a, b) => db[b] - db[a]);

  for (const i of sorrend) {
    const f = FAJOK[i];
    const t = el('div', 'tetel');
    const hangulat = db[i] > 0 ? hangulatOssz[i] / db[i] / 10 : -1;
    const hSzin = hangulat < 0 ? '#93a0c8' : (hangulat < 35 ? '#ff5d73' : hangulat < 60 ? '#ffc247' : '#63d68a');

    const fej = el('div', 'fej');
    be(fej, el('span', null, f.ikon), el('b', null, f.nev),
      el('span', null, db[i] > 0 ? `${db[i]} bent` : '—'));
    be(t, fej, el('p', null, f.leiras));

    const s = el('div', 'sorok');
    s.style.flexDirection = 'column';
    s.style.gap = '3px';
    const sebPerc = (f.sebesseg / 0.055);
    s.innerHTML =
      `<div>sebesség <b>${sebPerc.toFixed(2)}×</b> · türelem <b>${f.turelem.toFixed(2)}×</b> · ` +
      `pénz <b>~${szam(f.penz)}</b> · helyigény <b>${f.helyIgeny}</b></div>` +
      `<div>mindig kell neki: <b>${f.mindig.length ? f.mindig.map(igenyNev).join(', ') : 'semmi kötelező'}</b></div>` +
      `<div>gyakran kér: <b>${f.igenyek.slice().sort((a, b) => b.suly - a.suly).slice(0, 3).map((x) => igenyNev(x.kod)).join(', ')}</b></div>` +
      (f.atmegyFalon ? '<div><b style="color:#6fd8ff">Átmegy a falakon</b> — a folyosóépítés nem segít rajta, a torlódás nem fogja meg.</div>' : '') +
      (f.lop > 0 ? `<div><b style="color:#ff5d73">Lop</b> — ${Math.round(f.lop * 100)} % esély kiszolgálásonként, őrökkel jóval kevesebb.</div>` : '') +
      (f.hoVagy > 0 ? '<div><b style="color:#ff7a3c">Meleget igényel</b> — hideg zónában gyorsan romlik a hangulata.</div>' : '') +
      (f.hoVagy < 0 ? '<div><b style="color:#6fd8ff">Hideget igényel</b> — meleg zónában gyorsan romlik a hangulata.</div>' : '') +
      (f.ritka ? '<div><b style="color:#ffd257">Ritka vendég</b> — csak eseménnyel vagy legendás kapun át érkezik.</div>' : '') +
      (db[i] > 0
        ? `<div>most: átlagos hangulat <b style="color:${hSzin}">${hangulat.toFixed(0)} %</b> · sorban áll <b>${sorban[i]}</b></div>`
        : '');
    be(t, s);

    const h = honnan(sim, f.kod);
    if (h.length) be(t, el('div', 'sorok', 'Érkezik: ' + h.join(' · ')));

    be(p, t);
  }
}
