// PORTAL HUB TYCOON — OLDALPANELEK.
//
// ── MIÉRT EGY PANEL HAT TARTALOMMAL ───────────────────────────────────────
// Hat lebegő ablak helyett EGY doboz van, és váltunk benne. Egy tycoonban a
// képernyő közepe a játék; ha a panelek elfedik az állomást, a játékos a
// táblázatot fogja nézni, nem azt, amit épített. Egy panel egyszerre —
// ez kényszerít arra, hogy mindegyik ELÉG jó legyen önmagában.
//
// A panelek fél másodpercenként épülnek újra, nem képkockánként. Az adat
// lassan változik (pénz, szintek, sorok), a DOM újraépítése viszont drága —
// és a 3D-től veszi el az időt.

import { el, be, ures, szam } from './elemek.js';
import { DIMENZIOK, dimenzioDij } from '../sim/dimenziok.js';
import { TECHNOLOGIAK, tech } from '../sim/kutatas.js';
import { DOLGOZOK, dolgozoBer } from '../sim/dolgozok.js';
import { NEHEZSEGEK, BERLET_RESZESEDES, BERLET_NAPIDIJ } from '../mag/config.js';
import { EPULETEK, IGENYEK } from '../sim/epuletek.js';
import { FAJOK } from '../sim/lenyek.js';
import { bestiariumot } from './bestiarium.js';
import * as tarolo from './tarolo.js';
import { tanacsok } from './tanacsado.js';
import { ESEMENYEK } from '../sim/esemenyek.js';
import { vonal } from './grafikon.js';
import { ALLAPOT_NEV } from '../sim/utas.js';

/** A bérbeadásnál a bérlőé ez a hányad — a szövegek EBBŐL számolnak. */
const BERLO_RESZE = Math.round((1 - BERLET_RESZESEDES) * 100);
const MIENK_RESZE = Math.round(BERLET_RESZESEDES * 100);

const LAPOK = [
  { kod: 'dimenzio', ikon: '🌀', cim: 'Dimenziók', sug: 'Kapuk és csatornák: díjszabás, szint, instabilitás, bezárás.' },
  { kod: 'kutatas', ikon: '🔬', cim: 'Kutatás', sug: 'Technológiafa. A lezárt tételekhez előbb az előfeltételük kell.' },
  { kod: 'dolgozo', ikon: '👷', cim: 'Dolgozók', sug: 'Felvétel, beosztás, képzés. A személyzet nélküli épület 15 %-on megy.' },
  { kod: 'bestiarium', ikon: '🐾', cim: 'Bestiárium', sug: 'Ki van bent, mit akar, milyen a hangulata, honnan jött.' },
  { kod: 'tanacs', ikon: '💡', cim: 'Tanácsadó', sug: 'Mi a szűk keresztmetszet MOST — és mi rá a válaszlépés.' },
  { kod: 'statisztika', ikon: '📊', cim: 'Statisztika', sug: 'Grafikonok, tegnapi mérleg tételesen, és amit hiába kerestek.' },
  { kod: 'naplo', ikon: '📜', cim: 'Napló', sug: 'Minden, ami történt — visszafelé, naponként.' },
  { kod: 'mentes', ikon: '💾', cim: 'Mentés', sug: 'Mentés, betöltés, fájl, hangerő, új játszás.' },
  { kod: 'sugo', ikon: '❓', cim: 'Súgó', sug: 'Hogyan működik a játék, és mit csinál melyik billentyű.' },
];

/**
 * A futó példány — hogy a HUD-ból („kattints a hírnévre") és bárhonnan
 * máshonnan meg lehessen nyitni egy lapot anélkül, hogy a `fo.js`-nek külön
 * huzalt kellene húznia. Egy panelsáv van a képernyőn; a modulszintű
 * hivatkozás ezt a tényt mondja ki, nem megkerül egy réteget.
 */
let peldany = null;

/** @param {string} kod a `LAPOK` egyik kódja */
export function panelNyit(kod) { if (peldany) peldany.nyit(kod); }

export class Panelek {
  constructor(gyoker, sim, hud) {
    this.sim = sim;
    this.hud = hud;
    this.lap = null;
    this.kivalasztott = -1;   // épület-azonosító a „kéz" eszközből
    this._ora = 0;
    /** Kinyitott szakma a Dolgozók panelen (kód vagy null). */
    this.nyitottSzakma = null;
    peldany = this;

    const oldal = el('div');
    oldal.id = 'oldal';
    this.gombok = [];
    for (const l of LAPOK) {
      const g = el('button', '', l.ikon);
      g.title = `${l.cim}\n${l.sug}`;
      g.onclick = () => this.nyit(l.kod);
      oldal.appendChild(g);
      this.gombok.push({ kod: l.kod, g });
    }
    gyoker.appendChild(oldal);

    // ── A TANÁCSADÓ JELZŐPONTJA ────────────────────────────────────────
    // A `.pont` stílus régóta megvolt, de SOHA senki nem tette ki. A
    // tanácsadó így pontosan annyira látszott, mint a súgó — holott ő az
    // egyetlen panel, aminek magától kell szólnia. A pont színe a
    // legsúlyosabb nyitott tanácsot követi.
    const tanacsGomb = this.gombok.find((x) => x.kod === 'tanacs');
    this.tanacsPont = el('span', 'pont');
    this.tanacsPont.style.display = 'none';
    tanacsGomb.g.appendChild(this.tanacsPont);

    const p = el('div');
    p.id = 'panel';
    gyoker.appendChild(p);
    this.panel = p;
  }

  nyit(kod) {
    this.lap = (this.lap === kod) ? null : kod;
    if (kod !== 'epulet') this.kivalasztott = -1;
    this.panel.classList.toggle('nyitva', !!this.lap);
    for (const { kod: k, g } of this.gombok) g.classList.toggle('aktiv', k === this.lap);
    this._epit();
  }

  /** A `fo.js` hívja, ha a kéz eszközzel üres, járható cellára kattintottak. */
  cellat(x, y, z) {
    this.cella = { x, y, z };
    this.lap = 'cella';
    this.panel.classList.add('nyitva');
    for (const { g } of this.gombok) g.classList.remove('aktiv');
    this._epit();
  }

  epuletet(azon) {
    this.kivalasztott = azon;
    this.lap = 'epulet';
    this.panel.classList.add('nyitva');
    for (const { g } of this.gombok) g.classList.remove('aktiv');
    this._epit();
  }

  frissit(dt) {
    this._ora += dt;
    if (this._ora < 0.5) return;
    this._ora = 0;
    // A jelzőpont akkor is számol, ha nincs nyitott panel — épp az a dolga,
    // hogy a ZÁRT tanácsadó szóljon.
    this._jelzot();
    if (!this.lap) return;
    this._epit();
  }

  _jelzot() {
    const lista = tanacsok(this.sim, 4);
    let baj = 0, gond = 0;
    for (const t of lista) { if (t.sulyossag === 'baj') baj++; else if (t.sulyossag === 'gond') gond++; }
    const kulcs = `${baj}/${gond}`;
    if (this._pontKulcs === kulcs) return;
    this._pontKulcs = kulcs;
    const pont = this.tanacsPont;
    if (baj === 0 && gond === 0) { pont.style.display = 'none'; return; }
    pont.style.display = 'block';
    pont.className = 'pont' + (baj > 0 ? ' baj' : '');
    pont.textContent = String(baj > 0 ? baj : gond);
  }

  _epit() {
    if (!this.lap) return;
    const p = ures(this.panel);
    switch (this.lap) {
      case 'dimenzio': return this._dimenziok(p);
      case 'kutatas': return this._kutatas(p);
      case 'dolgozo': return this._dolgozok(p);
      case 'bestiarium': return bestiariumot(p, this.sim);
      case 'mentes': return this._mentes(p);
      case 'tanacs': return this._tanacs(p);
      case 'cella': return this._cella(p);
      case 'statisztika': return this._statisztika(p);
      case 'naplo': return this._naplo(p);
      case 'sugo': return this._sugo(p);
      case 'epulet': return this._epulet(p);
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  _dimenziok(p) {
    const sim = this.sim;
    be(p, el('h2', null, '🌀 Dimenziók'));
    let volt = false;
    for (let i = 0; i < DIMENZIOK.length; i++) {
      const d = DIMENZIOK[i], all = sim.dimenziok[i];
      if (!all.felfedezve) continue;
      volt = true;
      const t = el('div', 'tetel');
      const fej = el('div', 'fej');
      be(fej, el('span', null, d.ikon), el('b', null, d.nev),
        el('span', null, all.lezarva ? '⛔ VÉGLEG LEZÁRVA' : (all.nyitva ? (all.szunet > 0 ? '⚠️ omlás után' : '✅ nyitva') : '· zárva')));
      if (d.csatorna) be(t, el('div', 'sorok', '🚉 Csatorna — nincs instabilitás és nem fogyaszt kristályt.'));
      be(t, fej, el('p', null, d.leiras));

      if (all.nyitva) {
        const inst = all.instabilitas / 10;
        const sorok = el('div', 'sorok');
        sorok.innerHTML =
          `szint <b>${all.szint}/5</b> · díj <b>${dimenzioDij(all)}</b> · ` +
          (d.csatorna ? '' : `instabilitás <b style="color:${inst > 70 ? '#ff5d73' : inst > 40 ? '#ffc247' : '#63d68a'}">${inst.toFixed(0)}%</b> · `) +
          `utas <b>${all.osszUtas}</b> · bevétel <b>${szam(all.bevetel)}</b>`;
        be(t, sorok);

        // Díjszabás-csúszka. A visszajelzés azonnali: a felirat megmondja,
        // mit tesz a forgalommal — enélkül ez a csúszka vaktában húzogatás.
        const cs = el('input');
        cs.type = 'range'; cs.min = '50'; cs.max = '150'; cs.step = '5';
        cs.value = String(Math.round(all.dijSzorzo * 100));
        const felirat = el('div', 'sorok');
        const frissitFelirat = (v) => {
          const sz = v / 100;
          const von = sz <= 1 ? 1 + (1 - sz) * 0.7 : 1 - (sz - 1) * 0.9;
          felirat.innerHTML = `díjszorzó <b>${sz.toFixed(2)}×</b> → forgalom <b>${Math.round(von * 100)}%</b>`;
        };
        frissitFelirat(Number(cs.value));
        cs.oninput = () => frissitFelirat(Number(cs.value));
        cs.onchange = () => this._parancs({ fajta: 'dim_dij', kod: d.kod, szorzo: Number(cs.value) / 100 });
        be(t, felirat, cs);

        const gombok = el('div', 'sorok');
        const ar = Math.round(1800 * all.szint * (1 + d.veszely * 0.3));
        const fejleszt = el('button', 'mini', all.szint >= 5 ? 'Maximum szint' : `Szint ${all.szint + 1} — ${szam(ar)} 💎`);
        fejleszt.disabled = all.szint >= 5 || sim.penz < ar;
        fejleszt.onclick = () => this._parancs({ fajta: 'dim_szint', kod: d.kod });
        const bezar = el('button', 'mini', d.csatorna ? 'Hálózat lekapcsolása' : 'Kapu bezárása');
        bezar.onclick = () => this._parancs({ fajta: 'dim_zar', kod: d.kod, vegleg: false });
        const vegleg = d.csatorna ? null : el('button', 'mini vesz', 'VÉGLEG lezár');
        if (vegleg) {
          vegleg.title = 'Visszafordíthatatlan. Ez a világ soha többé nem nyílik meg ebben a játszásban.';
          vegleg.onclick = () => {
            if (confirm(`${d.nev} VÉGLEG lezárul. Ez visszafordíthatatlan. Biztos?`)) {
              this._parancs({ fajta: 'dim_zar', kod: d.kod, vegleg: true });
            }
          };
        }
        be(gombok, fejleszt, bezar, vegleg);
        be(t, gombok);
      } else if (!all.lezarva) {
        be(t, el('div', 'sorok', d.csatorna
          ? 'Építsd meg az építés-sáv „🚂 Csatornák" fülén.'
          : 'Nyisd meg az építés-sáv „🌀 Kapuk" fülén.'));
      }
      p.appendChild(t);
    }
    if (!volt) be(p, el('p', null, 'Még egyetlen világot sem ismersz.'));
  }

  // ══════════════════════════════════════════════════════════════════════
  _kutatas(p) {
    const sim = this.sim;
    be(p, el('h2', null, '🔬 Kutatás'));
    if (sim.aktivKutatas) {
      const t = tech(sim.aktivKutatas.kod);
      const d = el('div', 'tetel');
      const arany = sim.aktivKutatas.halad / sim.aktivKutatas.ido;
      be(d, el('div', 'fej')).firstChild.innerHTML = `<span>${t.ikon}</span><b>${t.nev}</b><span>${Math.round(arany * 100)}%</span>`;
      const sav = el('div', 'sav');
      const i = el('i');
      i.style.width = (arany * 100) + '%';
      sav.appendChild(i);
      sav.style.width = '100%';
      be(d, sav);
      be(p, el('h4', null, 'Folyamatban'), d);
    }
    // ── SORREND: ELÉRHETŐ → ZÁRT → KÉSZ ──────────────────────────────────
    // A katalógus-sorrend a fejlesztőnek jó, a játékosnak nem: a lista
    // tetején egy már kikutatott tétel állt, a megvehető pedig valahol a
    // közepén. Aki most nyitja meg a panelt, EGY kérdésre keres választ —
    // „mit tudok most elindítani?" —, tehát az kerül előre. A kikutatottak
    // a végén maradnak, mert azok már csak emlékeztetők.
    const rend = TECHNOLOGIAK.map((t) => {
      const kesz = sim.kesz(t.kod);
      const lehet = sim.kutathato(t.kod);
      return { t, kesz, lehet, rang: kesz ? 2 : (lehet ? 0 : 1) };
    });
    rend.sort((a, b) => a.rang - b.rang || a.t.ar - b.t.ar);

    let elozoRang = -1;
    const fejlec = ['Most elindítható', 'Zárva — előbb az előfeltétele kell', 'Kikutatva'];
    for (const { t, kesz, lehet, rang: r } of rend) {
      if (r !== elozoRang) { be(p, el('h4', null, fejlec[r])); elozoRang = r; }
      const ar = Math.round(t.ar * sim.kutatasKedvezmeny);
      const d = el('div', 'tetel' + (kesz ? ' kesz' : ''));
      const fej = el('div', 'fej');
      be(fej, el('span', null, t.ikon), el('b', null, t.nev),
        el('span', null, kesz ? '✅ kész' : (lehet ? szam(ar) + ' 💎' : '🔒')));
      be(d, fej, el('p', null, t.hatas));
      if (!kesz) {
        if (!lehet) {
          const hianyzo = t.fuggo.filter((f) => !sim.kesz(f));
          be(d, el('div', 'sorok', 'Előbb ki kell kutatni: ' + hianyzo.map((f) => tech(f).nev).join(', ')));
          // A teljes ár ELŐFELTÉTELEKKEL EGYÜTT: enélkül a 12 000-es legendás
          // kapunyitás olcsóbbnak látszik, mint amennyibe tényleg kerül.
          const teljes = ar + hianyzo.reduce((s, f) => s + Math.round(tech(f).ar * sim.kutatasKedvezmeny), 0);
          be(d, el('div', 'sorok', `összesen idáig: ${szam(teljes)} 💎`));
        } else {
          const g = el('button', 'mini', `Kutatás indítása — ${szam(ar)} 💎 · ${Math.round(t.ido / 20)} mp`);
          g.disabled = !!sim.aktivKutatas || sim.penz < ar;
          g.title = sim.aktivKutatas ? 'Egyszerre egy kutatás futhat.'
            : (sim.penz < ar ? `Ehhez ${szam(ar - Math.floor(sim.penz))} 💎 hiányzik.` : t.hatas);
          g.onclick = () => this._parancs({ fajta: 'kutat', kod: t.kod });
          be(d, g);
        }
      }
      p.appendChild(d);
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  /**
   * DOLGOZÓK — szakmánként csoportosítva.
   *
   * ── MIÉRT NEM EGY SOR MINDEN DOLGOZÓNAK ─────────────────────────────────
   * Mert volt, és játszhatatlan. A mérés szerint egy győztes állomáson
   * 51–136 dolgozó van; a régi panel MINDEGYIKHEZ kirakott egy `<select>`-et
   * az összes hozzá illő épülettel — és a panel fél másodpercenként újraépül.
   * Az százas nagyságrendű `<select>`, ezer `<option>`-nel, MÁSODPERCENKÉNT
   * KÉTSZER. Ez nemcsak lassú: a görgetés is elveszett benne, mert az
   * újraépítés visszaugrasztotta a lista tetejére, és a legfontosabb szám —
   * hányan ülnek tétlenül — sehol nem látszott.
   *
   * Most a szakma a rendezőelv, mert a döntés is szakmánként születik
   * („kell-e még egy mérnök?"). Egy szakma van nyitva egyszerre, és azon
   * belül is a TÉTLENEK jönnek elöl: az az egyetlen sor, amire válaszlépés
   * van. A „Tétlenek beosztása" gomb pedig azt csinálja kézzel is
   * megtehető parancsokkal (`beoszt`), amit senki nem akar húszszor
   * végigkattintani.
   */
  _dolgozok(p) {
    const sim = this.sim;
    be(p, el('h2', null, '👷 Dolgozók'));

    // ── ÖSSZKÉP ────────────────────────────────────────────────────────
    let ber = 0, tetlen = 0;
    for (const d of sim.dolgozok) { ber += dolgozoBer(d); if (d.epuletAzon < 0) tetlen++; }
    const ossz = el('div', 'tetel');
    ossz.innerHTML =
      `<div class="sorok"><span>létszám <b>${sim.dolgozok.length}</b></span>` +
      `<span>napi bér <b>${szam(ber)} 💎</b></span>` +
      `<span>tétlen <b style="color:${tetlen > 0 ? '#ffc247' : '#63d68a'}">${tetlen}</b></span></div>`;
    be(p, ossz);

    // ── SZABAD HELYEK SZAKMÁNKÉNT ──────────────────────────────────────
    // Ez adja meg, hogy melyik szakmából ÉRDEMES felvenni: az üres pult
    // 15 %-on megy, a tétlen dolgozó viszont csak a bért viszi.
    const helyek = new Map();   // szakma → { szabad, ossz }
    for (let a = 0; a < sim.epuletek.length; a++) {
      const ep = sim.epuletek[a];
      if (!ep || ep.berbeadva) continue;
      const et = EPULETEK[ep.tipusIdx];
      if (et.szemelyzet === 0) continue;
      const h = helyek.get(et.fajta) || { szabad: 0, ossz: 0 };
      h.ossz += et.szemelyzet;
      h.szabad += Math.max(0, et.szemelyzet - ep.dolgozok.length);
      helyek.set(et.fajta, h);
    }

    for (const t of DOLGOZOK) {
      const sajat = sim.dolgozok.filter((d) => DOLGOZOK[d.tipusIdx].kod === t.kod);
      const sajatTetlen = sajat.filter((d) => d.epuletAzon < 0);
      const h = helyek.get(t.kod) || { szabad: 0, ossz: 0 };
      const nyitva = this.nyitottSzakma === t.kod;

      const d = el('div', 'tetel szakma' + (nyitva ? ' nyitva' : ''));
      const fej = el('div', 'fej');
      const allapot = h.szabad > 0
        ? `<span class="jelzo gond">${h.szabad} üres hely</span>`
        : (sajatTetlen.length > 0 ? `<span class="jelzo gond">${sajatTetlen.length} tétlen</span>` : '');
      fej.innerHTML =
        `<span>${t.ikon}</span><b>${t.nev}</b>${allapot}` +
        `<span class="halk">${sajat.length} fő · ${t.ber}/nap</span><span class="nyil">${nyitva ? '▾' : '▸'}</span>`;
      fej.style.cursor = 'pointer';
      fej.onclick = () => { this.nyitottSzakma = nyitva ? null : t.kod; this._epit(); };
      be(d, fej);

      if (!nyitva) { p.appendChild(d); continue; }

      be(d, el('p', null, t.leiras));
      const sorok = el('div', 'sorok');
      sorok.innerHTML = `<span>beosztható hely: <b>${h.ossz - h.szabad}/${h.ossz}</b></span>`;
      be(d, sorok);

      // ── FELVÉTEL ─────────────────────────────────────────────────────
      const gombok = el('div', 'sorok');
      const belepo = t.ber * 3;
      const felvesz = el('button', 'mini', `Felvesz — belépő ${szam(belepo)} 💎`);
      felvesz.disabled = sim.penz < belepo;
      felvesz.title = `Egyszeri ${szam(belepo)} belépő, utána ${t.ber} 💎 MINDEN NAP, akkor is, ha tétlen.`;
      felvesz.onclick = () => this._parancs({ fajta: 'felvesz', tipus: t.kod });
      be(gombok, felvesz);

      if (sajatTetlen.length > 0 && h.szabad > 0) {
        const auto = el('button', 'mini', `Tétlenek beosztása (${Math.min(sajatTetlen.length, h.szabad)})`);
        auto.title = 'Ugyanazokat a beosztás-parancsokat adja ki, amiket kézzel is kiadnál — csak nem húszszor.';
        auto.onclick = () => this._tetleneketBeoszt(t.kod);
        be(gombok, auto);
      }
      be(d, gombok);
      p.appendChild(d);

      if (sajat.length === 0) continue;

      // A tétlenek elöl: ez az egyetlen sor, amire VAN válaszlépés.
      const rend = sajat.slice().sort((a, b2) => (a.epuletAzon < 0 ? 0 : 1) - (b2.epuletAzon < 0 ? 0 : 1) || a.azon - b2.azon);
      // Százas csapatnál a teljes lista sem olvasható, sem olcsó. Aki
      // konkrét dolgozót keres, az a beosztásán át keresi — az meg az
      // épület-panelen látszik.
      const HATAR = 24;
      for (const dd of rend.slice(0, HATAR)) p.appendChild(this._dolgozoSor(dd, t));
      if (rend.length > HATAR) {
        be(p, el('div', 'sorok', `…és további ${rend.length - HATAR} ${t.nev.toLowerCase()}. ` +
          'A beosztottak az épületük panelján is elérhetők.'));
      }
    }
  }

  /** Egy dolgozó sora: beosztás, képzés, elbocsátás. */
  _dolgozoSor(d, t) {
    const sim = this.sim;
    const sor = el('div', 'tetel dolgozo' + (d.epuletAzon < 0 ? ' tetlen' : ''));
    const fej = el('div', 'fej');
    be(fej, el('span', null, t.ikon),
      el('b', null, `${t.nev} · ${d.szint}. szint`),
      el('span', 'halk', `${dolgozoBer(d)}/nap`));
    be(sor, fej);

    // Beosztás: csak olyan épület jöhet szóba, ami ezt a szakmát kéri.
    const valaszto = el('select');
    const ures0 = el('option', null, '— tétlen (a bér megy, a munka nem)');
    ures0.value = '-1';
    valaszto.appendChild(ures0);
    for (let a = 0; a < sim.epuletek.length; a++) {
      const ep = sim.epuletek[a];
      if (!ep) continue;
      const et = EPULETEK[ep.tipusIdx];
      if (et.fajta !== t.kod || et.szemelyzet === 0) continue;
      const tele = ep.dolgozok.length >= et.szemelyzet && ep.azon !== d.epuletAzon;
      const o = el('option', null,
        `${et.ikon} ${et.nev} (${ep.dolgozok.length}/${et.szemelyzet})${tele ? ' — tele' : ''} @${ep.x},${ep.y}`);
      o.value = String(ep.azon);
      valaszto.appendChild(o);
    }
    valaszto.value = String(d.epuletAzon);
    valaszto.onchange = () => this._parancs({ fajta: 'beoszt', dolgozo: d.azon, epulet: Number(valaszto.value) });
    be(sor, valaszto);

    const gombok = el('div', 'sorok');
    const ar = t.ber * 8 * d.szint;
    const fejleszt = el('button', 'mini', d.szint >= 3 ? 'Maximum szint' : `Képzés ${d.szint + 1}. szintre — ${szam(ar)} 💎`);
    fejleszt.disabled = d.szint >= 3 || sim.penz < ar;
    fejleszt.title = 'A magasabb szintű dolgozó többet teljesít ugyanabban az épületben — de a bére is nő.';
    fejleszt.onclick = () => this._parancs({ fajta: 'dolgozo_fejleszt', azon: d.azon });
    const el2 = el('button', 'mini vesz', 'Elbocsát');
    el2.onclick = () => this._parancs({ fajta: 'elbocsat', azon: d.azon });
    be(gombok, fejleszt, el2);
    be(sor, gombok);
    return sor;
  }

  /**
   * A tétlen dolgozókat sorra beosztja a szabad helyekre.
   *
   * Csak a MEGLÉVŐ `beoszt` parancsot használja, épületazonosító szerinti
   * rögzített sorrendben — tehát ugyanaz, mintha a játékos kattintgatná
   * végig, és a mentés/visszajátszás számára is közönséges parancssorozat.
   */
  _tetleneketBeoszt(szakma) {
    const sim = this.sim;
    const szabad = [];
    for (let a = 0; a < sim.epuletek.length; a++) {
      const ep = sim.epuletek[a];
      if (!ep || ep.berbeadva) continue;
      const et = EPULETEK[ep.tipusIdx];
      if (et.fajta !== szakma || et.szemelyzet === 0) continue;
      for (let k = ep.dolgozok.length; k < et.szemelyzet; k++) szabad.push(ep.azon);
    }
    let n = 0;
    for (const d of sim.dolgozok) {
      if (n >= szabad.length) break;
      if (d.epuletAzon >= 0 || DOLGOZOK[d.tipusIdx].kod !== szakma) continue;
      this.sim.parancs({ fajta: 'beoszt', dolgozo: d.azon, epulet: szabad[n] });
      n++;
    }
    this.hud.uzen(n > 0 ? `${n} dolgozó beosztva.` : 'Nincs kit beosztani.', n > 0 ? 'jo' : 'gond');
    this._ora = 1;
  }

  // ══════════════════════════════════════════════════════════════════════
  _tanacs(p) {
    be(p, el('h2', null, '💡 Tanácsadó'));
    const bev = el('p', null, 'Csak olyat mond, ami mérhető, és amire van válaszlépés.');
    bev.style.cssText = 'font-size:11.5px;color:#93a0c8;margin:0 0 8px';
    be(p, bev);
    for (const t of tanacsok(this.sim)) {
      const d = el('div', 'tetel');
      d.style.borderLeft = `3px solid ${t.sulyossag === 'baj' ? '#ff5d73' : t.sulyossag === 'gond' ? '#ffc247' : '#63d68a'}`;
      d.innerHTML = `<div class="fej"><span>${t.ikon}</span><b>${t.cim}</b></div><p>${t.szoveg}</p>`;
      p.appendChild(d);
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  /**
   * „Ki áll itt?" — a kéz eszközzel egy üres cellára kattintva.
   *
   * MIÉRT KELL: az utas-AI a játék szíve, de eddig CSAK a tömeg mozgása
   * látszott belőle. Ha valaki dühösen távozik, a játékos nem tudta meg,
   * MIT nem kapott meg. Ez a panel megnyitja a fekete dobozt: mi a terve,
   * hol tart benne, mennyi a türelme, mit költött.
   */
  _cella(p) {
    const sim = this.sim;
    const c = this.cella;
    be(p, el('h2', null, `👀 Ki áll itt? (${c.x}, ${c.y}${c.z ? ' · ' + c.z + '. emelet' : ''})`));
    const lista = sim.utasokACellan(c.x, c.y, c.z, 1.6);
    if (lista.length === 0) {
      be(p, el('p', null, 'Ezen a cellán most nincs senki. Kattints oda, ahol tömeg van — vagy egy épületre a részleteiért.'));
      return;
    }
    for (const u of lista) {
      const faj = FAJOK[u.fajIdx];
      const d = el('div', 'tetel');
      const h = Math.round(u.hangulat / 10);
      const hSzin = h < 30 ? '#ff5d73' : h < 60 ? '#ffc247' : '#63d68a';
      const terv = u.terv.map((k, i) => {
        const nev = (IGENYEK.find((x) => x.kod === k) || {}).nev || k;
        if (i < u.tervIdx) return `<s style="opacity:.5">${nev}</s>`;
        if (i === u.tervIdx) return `<b style="color:#6fd8ff">${nev}</b>`;
        return nev;
      }).join(' → ') || '—';
      d.innerHTML =
        `<div class="fej"><span>${faj.ikon}</span><b>${faj.nev}</b>` +
        `<span style="color:${hSzin}">${h} %</span></div>` +
        `<div class="sorok" style="flex-direction:column;gap:3px">` +
        `<div>érkezett: <b>${DIMENZIOK[u.dimIdx].nev}</b> · tovább: <b>${DIMENZIOK[u.celDimIdx].nev}</b></div>` +
        `<div>épp: <b>${ALLAPOT_NEV[u.allapot]}</b>${u.valtasHatra > 0 ? ' (szintet vált)' : ''} · türelem <b>${Math.max(0, Math.round(u.turelem / 20))} mp</b></div>` +
        `<div>terve: ${terv}</div>` +
        `<div>nála van <b>${szam(u.penz)}</b> · elköltött <b>${szam(u.koltott)}</b>` +
        (u.csalodas > 0 ? ` · <b style="color:#ff5d73">${u.csalodas} csalódás</b>` : '') + '</div>' +
        '</div>';
      p.appendChild(d);
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  _statisztika(p) {
    const sim = this.sim;
    be(p, el('h2', null, '📊 Statisztika'));

    // ── GRAFIKONOK ────────────────────────────────────────────────────
    // A HUD pillanatnyi állapotot mutat; a döntések viszont trendekről
    // szólnak. A „hírnév 62" egészen mást jelent 40-ről jövet, mint 85-ről.
    be(p, el('h4', null, 'Az elmúlt napok'));
    const g1 = el('canvas'); g1.width = 344; g1.height = 116;
    g1.style.cssText = 'width:100%;border-radius:8px;background:rgba(0,0,0,.22)';
    const g2 = el('canvas'); g2.width = 344; g2.height = 116;
    g2.style.cssText = 'width:100%;border-radius:8px;background:rgba(0,0,0,.22);margin-top:6px';
    be(p, g1, g2);
    vonal(g1, sim.napiTortenet, [
      { mezo: 'hirnev', szin: '#63d68a', nev: 'hírnév' },
      { mezo: 'utas', szin: '#6fd8ff', nev: 'utas' },
    ]);
    vonal(g2, sim.napiTortenet, [
      { mezo: 'bevetel', szin: '#ffd257', nev: 'bevétel' },
      { mezo: 'koltseg', szin: '#ff5d73', nev: 'költség' },
      { mezo: 'penz', szin: '#9b6bff', nev: 'pénz' },
    ], { nulla: true });

    be(p, el('h4', null, 'Tegnapi mérleg'));
    const m = el('div', 'tetel');
    const e = sim.elozoNap;
    const egyenleg = (e.bevetel || 0) - (e.koltseg || 0);
    m.innerHTML = `<div class="fej"><b>Egyenleg</b><span style="color:${egyenleg >= 0 ? '#63d68a' : '#ff5d73'}">${egyenleg >= 0 ? '+' : ''}${szam(egyenleg)} 💎</span></div>`;
    const tetelek = e.tetelek ? [...e.tetelek.entries()] : [];
    tetelek.sort((a, b) => b[1] - a[1]);
    const lista = el('div', 'sorok');
    lista.style.flexDirection = 'column';
    lista.style.gap = '2px';
    for (const [k, v] of tetelek) {
      const s = el('div');
      s.style.cssText = 'display:flex;justify-content:space-between;width:100%';
      s.innerHTML = `<span>${k}</span><b style="color:${v >= 0 ? '#63d68a' : '#ff5d73'}">${v >= 0 ? '+' : ''}${szam(v)}</b>`;
      lista.appendChild(s);
    }
    if (tetelek.length === 0) lista.textContent = 'Még nem telt el egy teljes nap.';
    be(m, lista);
    p.appendChild(m);

    be(p, el('h4', null, 'Utasforgalom'));
    const f = el('div', 'tetel');
    f.innerHTML =
      `<div class="sorok" style="flex-direction:column;gap:3px">` +
      `<div>jelen van: <b>${sim.utasSzam}</b> (csúcs: <b>${sim.csucsUtas}</b>)</div>` +
      `<div>összes távozó: <b>${sim.osszTavozo}</b></div>` +
      `<div>elégedetten: <b style="color:#63d68a">${sim.elegedettTavozok}</b> · dühösen: <b style="color:#ff5d73">${sim.duhosTavozok}</b></div>` +
      `</div>`;
    p.appendChild(f);

    // Hiányzó szolgáltatások — ez a panel legfontosabb sora. Megmondja,
    // MIT kellene építeni, ahelyett hogy a játékos találgatna.
    be(p, el('h4', null, 'Amit hiába kerestek'));
    const h = el('div', 'tetel');
    const hianyok = [...sim.hianyok.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    if (hianyok.length === 0) {
      h.textContent = 'Semmit — minden igényre volt elérhető szolgáltatás. Szép munka.';
    } else {
      const l = el('div', 'sorok');
      l.style.flexDirection = 'column';
      for (const [kod, db] of hianyok) {
        const nev = (IGENYEK.find((x) => x.kod === kod) || {}).nev || kod;
        const s = el('div');
        s.style.cssText = 'display:flex;justify-content:space-between;width:100%';
        s.innerHTML = `<span>${nev}</span><b style="color:#ffc247">${db}×</b>`;
        l.appendChild(s);
      }
      be(h, l);
    }
    p.appendChild(h);

    // ── ESEMÉNYEK ─────────────────────────────────────────────────────
    // Nem díszlet: a leggyakoribb esemény megmutatja, mi ellen érdemes
    // FELKÉSZÜLNI. Sok mimik-lopás → őrök kellenek; sok áramszünet →
    // tartalék energiamag; sok kapuomlás → karbantartó.
    if (sim.esemenyDb.size > 0) {
      be(p, el('h4', null, 'Ami történt veled'));
      const d = el('div', 'tetel');
      const l = el('div', 'sorok');
      l.style.flexDirection = 'column';
      const rend = [...sim.esemenyDb.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
      for (const [kod, db] of rend) {
        const def = ESEMENYEK.find((x) => x.kod === kod);
        const sor = el('div');
        sor.style.cssText = 'display:flex;justify-content:space-between;width:100%';
        sor.innerHTML = `<span>${def ? def.ikon + ' ' + def.nev : kod}</span><b>${db}×</b>`;
        l.appendChild(sor);
      }
      be(d, l);
      p.appendChild(d);
    }

    be(p, el('h4', null, 'Legjobb üzletek'));
    const sorrend = sim.epuletek.filter(Boolean).slice().sort((a, b) => b.bevetel - a.bevetel).slice(0, 6);
    for (const ep of sorrend) {
      if (ep.bevetel <= 0) continue;
      const t = EPULETEK[ep.tipusIdx];
      const d = el('div', 'tetel');
      d.innerHTML = `<div class="fej"><span>${t.ikon}</span><b>${t.nev}</b><span>${szam(ep.bevetel)} 💎</span></div>` +
        `<div class="sorok">kiszolgált <b>${ep.kiszolgalt}</b> · sor <b>${ep.sor.length}</b> · terhelés <b>${Math.round(ep.hatekonysag * 100)}%</b></div>`;
      p.appendChild(d);
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  _naplo(p) {
    be(p, el('h2', null, '📜 Napló'));
    const n = this.sim.naplok;
    for (let i = n.length - 1; i >= Math.max(0, n.length - 60); i--) {
      const s = n[i];
      const d = el('div', 'tetel');
      d.style.borderLeft = `3px solid ${s.fajta === 'jo' ? '#63d68a' : s.fajta === 'baj' ? '#ff5d73' : s.fajta === 'gond' ? '#ffc247' : '#6fd8ff'}`;
      d.innerHTML = `<div class="sorok" style="margin:0"><b>${s.nap}. nap</b></div><p style="margin-top:2px">${s.szoveg}</p>`;
      p.appendChild(d);
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  _mentes(p) {
    const sim = this.sim;
    be(p, el('h2', null, '💾 Mentés és betöltés'));

    // A mentés a seed + a parancsnapló. Ezt itt ki is mondjuk, mert
    // magyarázza, miért tart a betöltés néhány másodpercig — enélkül a
    // folyamatjelző csak lassúságnak látszana.
    const magy = el('div', 'tetel');
    magy.innerHTML = '<p>A mentés nem a világ pillanatképe, hanem a <b>seed + a parancsnaplód</b> ' +
      '(most ' + szam(sim.napló.length) + ' parancs). Betöltéskor a világ újrajátszódik, ' +
      'ezért néhány másodpercet vesz igénybe — cserébe bitre ugyanaz lesz.</p>';
    be(p, magy);

    be(p, el('h4', null, 'Mentőhelyek'));
    for (const h of tarolo.lista()) {
      const t = el('div', 'tetel');
      const fej = el('div', 'fej');
      be(fej, el('b', null, h.nev),
        el('span', null, h.adat ? `${h.adat.elonezet.nap}. nap` : (h.hiba ? '⚠️ nem olvasható' : 'üres')));
      be(t, fej);
      if (h.adat) {
        const e = h.adat.elonezet;
        be(t, el('div', 'sorok')).lastChild.innerHTML =
          `pénz <b>${szam(e.penz)}</b> · hírnév <b>${e.hirnev}</b> · kapu <b>${e.kapu}</b> · ` +
          `${e.fejezet + 1}. fejezet${e.nehezseg ? ' · ' + e.nehezseg : ''}${e.vege ? ' · <b style="color:#ffd257">vége</b>' : ''}`;
      } else if (h.hiba) {
        // Egy régi (v1/v2) mentés itt SZÁNDÉKOSAN nem tölthető be: a rács
        // 96×72-re nőtt, és a napló abszolút cellakoordinátákat tartalmaz —
        // a régi napló nem hibára futna, hanem NÉMÁN más világot építene.
        // Ezt ki kell mondani, különben a játékos azt hiszi, ő rontotta el.
        be(t, el('div', 'sorok baj', `Ez a hely nem tölthető be: ${h.hiba}. ` +
          'A régi mentések a rács megnövekedése miatt nem olvashatók — a „Törlés" felszabadítja a helyet.'));
        const tg = el('button', 'mini vesz', 'Törlés');
        tg.onclick = () => { tarolo.torol(h.hely); this._ora = 1; };
        be(t, tg);
        be(p, t);
        continue;
      }
      const gombok = el('div', 'sorok');
      if (h.hely !== 'auto') {
        const m = el('button', 'mini', h.adat ? 'Felülír' : 'Mentés ide');
        m.onclick = () => {
          const v = tarolo.ment(sim, h.hely);
          this.hud.uzen(v.rendben ? `Mentve: ${h.nev}${v.ok ? ' (' + v.ok + ')' : ''}` : 'Nem sikerült menteni: ' + v.ok,
            v.rendben ? 'jo' : 'baj');
          this._ora = 1;
        };
        be(gombok, m);
      }
      if (h.adat) {
        const b2 = el('button', 'mini', 'Betöltés');
        b2.onclick = () => {
          if (confirm('A mostani játszás elveszik, ha nem mentetted el. Betöltöd?')) tarolo.betoltestKer(h.hely);
        };
        const tor = el('button', 'mini vesz', 'Törlés');
        tor.onclick = () => { tarolo.torol(h.hely); this._ora = 1; };
        be(gombok, b2, tor);
      }
      be(t, gombok);
      be(p, t);
    }

    // ── HANG ──────────────────────────────────────────────────────────
    if (this.hud && this.hud.hang) {
      const hang = this.hud.hang;
      be(p, el('h4', null, 'Hang'));
      const hd = el('div', 'tetel');
      hd.innerHTML = '<p>A portálzúgás színe az instabilitást követi, a tömegzaj az utasszámot. ' +
        'Ha valami nincs rendben az állomáson, azt hallani is lehet.</p>';
      const csuszka = (cimke, kezdo, ra) => {
        const sor = el('div', 'sorok');
        sor.style.flexDirection = 'column';
        const c = el('input');
        c.type = 'range'; c.min = '0'; c.max = '100'; c.value = String(Math.round(kezdo * 100));
        const f = el('div', null, `${cimke}: ${Math.round(kezdo * 100)} %`);
        c.oninput = () => { f.textContent = `${cimke}: ${c.value} %`; ra(Number(c.value) / 100); };
        be(sor, f, c);
        return sor;
      };
      be(hd, csuszka('Mester', 0.7, (v) => { hang.inditas(); hang.hangero(v); }));
      be(hd, csuszka('Zene', 0.5, (v) => { hang.inditas(); hang.zeneHangero(v); }));
      be(p, hd);
    }

    // ── FÁJL ──────────────────────────────────────────────────────────
    be(p, el('h4', null, 'Fájl'));
    const f = el('div', 'tetel');
    f.innerHTML = '<p>A böngésző tárolója törölhető — egy fájlba mentett állás nem. ' +
      'És mivel a mentés a seed + a parancsnaplód, ez egyben a tökéletes HIBAJELENTÉS is: ' +
      'a fájlból a hiba bitre újrajátszható.</p>';
    const fSor = el('div', 'sorok');
    const le = el('button', 'mini', '⬇ Mentés fájlba');
    le.onclick = () => { tarolo.fajlbaMent(sim); this.hud.uzen('Mentés letöltve.', 'jo'); };
    const fel = el('button', 'mini', '⬆ Betöltés fájlból');
    const mezoF = el('input');
    mezoF.type = 'file';
    mezoF.accept = 'application/json,.json';
    mezoF.style.display = 'none';
    mezoF.onchange = () => {
      if (!mezoF.files || !mezoF.files[0]) return;
      tarolo.fajlbolBetolt(mezoF.files[0], (ok) => {
        if (ok) this.hud.uzen('Nem sikerült: ' + ok, 'baj');
      });
    };
    fel.onclick = () => {
      if (confirm('A mostani játszás elveszik, ha nem mentetted el. Betöltöd a fájlt?')) mezoF.click();
    };
    be(fSor, le, fel);
    be(f, fSor, mezoF);
    be(p, f);

    be(p, el('h4', null, 'Új játszás'));
    const uj = el('div', 'tetel');
    uj.innerHTML = '<p>Minden világ egy seedből nő ki. Ugyanaz a seed ugyanazt a világot adja — ' +
      'hibajelentéshez ezt írd le. A mostani: <b>' + sim.seed + '</b> · fokozat: <b>' + sim.nehezseg.nev + '</b></p>';
    const mezo = el('input');
    mezo.type = 'text';
    mezo.placeholder = 'seed (üresen: véletlen)';
    mezo.style.cssText = 'width:100%;margin:6px 0;background:#1a2144;color:#e6ecff;border:1px solid rgba(140,160,230,.25);border-radius:6px;padding:6px;';
    // Nehézség: a fokozat a világ kezdőállapota, ezért CSAK új játszásnál
    // választható. Menet közben átállítani annyi lenne, mint a saját
    // eredményedet átírni — és a mentés se tudna mit kezdeni vele.
    let valasztott = sim.nehezseg.kod;
    const fokozatSor = el('div', 'sorok');
    const fokozatGombok = [];
    for (const n of NEHEZSEGEK) {
      const g = el('button', 'mini', `${n.ikon} ${n.nev}`);
      g.title = n.leiras;
      g.style.opacity = n.kod === valasztott ? '1' : '0.55';
      g.onclick = () => {
        valasztott = n.kod;
        for (const { g: g2, kod } of fokozatGombok) g2.style.opacity = kod === valasztott ? '1' : '0.55';
      };
      fokozatGombok.push({ g, kod: n.kod });
      be(fokozatSor, g);
    }
    const leiras = el('p', null, NEHEZSEGEK.map((n) => `${n.ikon} ${n.nev}: ${n.leiras}`).join('  '));
    const indit = el('button', 'mini', 'Új állomás indítása');
    indit.onclick = () => {
      if (!confirm('A mostani játszás elveszik, ha nem mentetted el. Új állomást kezdesz?')) return;
      const sz = (Number(mezo.value) | 0);
      location.search = `?nehez=${valasztott}` + (sz ? `&seed=${sz}` : '');
    };
    be(uj, mezo, fokozatSor, leiras, indit);
    be(p, uj);
  }

  // ══════════════════════════════════════════════════════════════════════
  _sugo(p) {
    be(p, el('h2', null, '❓ Hogyan működik'));
    const reszek = [
      ['🌀 A kapu hozza az utast', 'Minden nyitott dimenziókapu folyamatosan ontja az utasokat. Minél jobb a hírnév és minél olcsóbb a díj, annál többen jönnek. A kapu szintje sokszorozza a forgalmat — és a gazdagabb utasokat is ő hozza.'],
      ['🧭 Az utasnak TERVE van', 'Érkezéskor eldől, mit akar: biztonsági ellenőrzés, esetleg vám, aztán étel, vásárlás, mosdó, pihenés. Ha valamelyikre nincs épület, csalódik. Ha elfogy a türelme, dühösen távozik — és a hírnév a TÁVOZÓK hangulatából épül.'],
      ['👷 Épület személyzet nélkül félsebességgel megy', 'A piros gyémánt az épület fölött azt jelenti: nincs benne senki. A sárga azt, hogy kevesen vannak, vagy hosszú a sor.'],
      ['⚡ Az áramszünet a legalattomosabb hiba', 'Nem üzenettel jelentkezik, csak minden lassabb lesz. Ha a felső sávban a villám piros, építs energiamagot.'],
      ['🔧 A kapu romlik', 'Minden kapu instabilabb lesz, és a forgalom gyorsítja. A portálkarbantartó + mérnök MINDEN kaput karbantart, tehát egy központi műhely az egész hálózatot tartja. 100 %-nál a kapu összeomlik.'],
      ['💾 A mentés a naplód', 'A játék automatikusan ment minden nap végén, és három kézi hely is van. A mentés a seedet és a parancsaidat tartalmazza, nem a világ pillanatképét — ezért a betöltés újrajátssza a partit, és ezért lesz bitre ugyanaz.'],
      ['⚖️ A döntéseid maradandók', 'A fejezetek végén választanod kell. A véglegesen lezárt világ soha nem nyílik meg újra — ez nem hiba, hanem a történeted.'],
    ];
    // Az irányítás ELŐRE kerül, nem a szöveges magyarázatok mögé. Aki a
    // súgót megnyitja, az tíz esetből kilencszer azt keresi, melyik gomb mit
    // csinál — a „hogyan működik" olvasmány, ez viszont referencia.
    be(p, el('h4', null, 'Irányítás'));
    const v = el('div', 'tetel');
    v.innerHTML = '<div class="billentyuk">' + [
      ['bal gomb', 'építés / vizsgálat'],
      ['jobb gomb húzva', 'a kamera tolása'],
      ['középső gomb', 'forgatás'],
      ['görgő', 'nagyítás a kurzor alatti pontra'],
      ['W A S D', 'mozgás'],
      ['Q E', 'forgatás'],
      ['<b>R</b> / <b>F</b>', '<b>egy szinttel feljebb / lejjebb</b>'],
      ['szóköz', 'szünet'],
      ['1 2 3 4', 'sebesség'],
      ['Esc', 'az eszköz elengedése'],
    ].map(([k, m]) => `<div><kbd>${k}</kbd><span>${m}</span></div>`).join('') + '</div>' +
      '<p>Padló és bontás <b>húzható</b>: nyomd le, húzd el, engedd fel — téglalapot csinál. ' +
      'A „👆 Kéz" eszközzel egy épületre kattintva a részleteit, egy üres padlóra kattintva pedig azt látod, ' +
      'hogy ki áll ott és mit akar.</p>';
    p.appendChild(v);

    be(p, el('h4', null, 'Hogyan működik'));
    for (const [cim, sz] of reszek) {
      const d = el('div', 'tetel');
      d.innerHTML = `<div class="fej"><b>${cim}</b></div><p>${sz}</p>`;
      p.appendChild(d);
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  _epulet(p) {
    const sim = this.sim;
    const ep = sim.epuletek[this.kivalasztott];
    if (!ep) { be(p, el('p', null, 'Ez az épület már nincs meg.')); return; }
    const t = EPULETEK[ep.tipusIdx];
    be(p, el('h2', null, `${t.ikon} ${t.nev}`));
    const d = el('div', 'tetel');
    d.innerHTML =
      `<p>${t.leiras}</p>` +
      `<div class="sorok" style="flex-direction:column;gap:3px;margin-top:6px">` +
      `<div>helyzet: <b>${ep.x},${ep.y}</b> · méret <b>${ep.sz}×${ep.m}</b></div>` +
      `<div>terhelés: <b>${Math.round(ep.hatekonysag * 100)}%</b> · személyzet <b>${ep.dolgozok.length}/${t.szemelyzet}</b></div>` +
      (t.igeny ? `<div>sorban áll: <b>${ep.sor.length}</b> · bent: <b>${ep.bent.length}/${t.kapacitas}</b></div>` : '') +
      `<div>kiszolgált: <b>${ep.kiszolgalt}</b> · bevétel <b>${szam(ep.bevetel)} 💎</b></div>` +
      `</div>`;
    p.appendChild(d);

    if (ep.kod === 'portal' && ep.dimenzio >= 0) {
      const dim = DIMENZIOK[ep.dimenzio], all = sim.dimenziok[ep.dimenzio];
      const k = el('div', 'tetel');
      k.innerHTML = `<div class="fej"><span>${dim.ikon}</span><b>${dim.nev}</b></div>` +
        `<div class="sorok">szint <b>${all.szint}</b> · instabilitás <b>${(all.instabilitas / 10).toFixed(0)}%</b> · díj <b>${dimenzioDij(all)}</b></div>`;
      p.appendChild(k);
    }

    // A számok a CONFIG-ból jönnek, nem a szövegbe írva. Ez nem finomkodás:
    // a `BERLET_RESZESEDES` 0,42-ről 0,60-ra ment egy egyensúly-hangolásban,
    // és a panel utána is 42 %-ot ígért — vagyis a felület HAZUDOTT egy
    // visszafordítható, de fontos döntésnél.
    if (t.igeny && t.dij > 0 && t.szemelyzet > 0) {
      const napiDij = Math.round(t.ar * BERLET_NAPIDIJ * 10) / 10;
      const b = el('div', 'tetel');
      b.innerHTML = (ep.berbeadva
        ? '<div class="fej"><b>🤝 Bérbe adva</b></div><p>A bérlő üzemelteti: nem kell hozzá személyzet, ' +
          'és nem esik le a teljesítménye személyzethiánytól. '
        : '<div class="fej"><b>🤝 Bérbeadás</b></div><p>Add ki a helyet egy bérlőnek: nem kell hozzá személyzet, ' +
          'és mindig 100 %-on megy. ') +
        `Cserébe a forgalom bevételének <b>${BERLO_RESZE} %-a a bérlőé</b>, <b>${MIENK_RESZE} %-a a tiéd</b>, ` +
        `plusz napi <b>${napiDij} 💎</b> fix bérleti díj.</p>` +
        `<p>Megspórolt bér: <b>${t.szemelyzet * 75} 💎/nap</b> nagyságrend. Nagy forgalomnál a saját üzemeltetés ` +
        'jobban jár — a bérbeadás nyugalmat vesz pénzért.</p>';
      const g = el('button', 'mini', ep.berbeadva ? 'Bérlet felmondása' : 'Bérbeadás');
      g.onclick = () => this._parancs({ fajta: 'berbead', azon: ep.azon });
      be(b, g);
      p.appendChild(b);
    }

    const gombok = el('div', 'sorok');
    const kapcs = el('button', 'mini', ep.kikapcsolva ? 'Bekapcsolás' : 'Kikapcsolás');
    kapcs.onclick = () => this._parancs({ fajta: 'kapcsol', azon: ep.azon });
    const bont = el('button', 'mini vesz', `Bontás (+${szam(Math.round(t.ar * 0.45))})`);
    bont.onclick = () => { this._parancs({ fajta: 'bont', x: ep.x, y: ep.y }); this.nyit(null); };
    be(gombok, kapcs, bont);
    p.appendChild(gombok);
  }

  _parancs(p) {
    this.sim.parancs(p);
    // A parancs a következő tick elején fut le; a visszajelzést a `fo.js`
    // olvassa ki (`sim.utolsoValasz`) és küldi a HUD-ra.
    this._ora = 1;
  }
}

/** A fajok listája — a súgóhoz és a jövőbeli bestiárium-panelhez. */
export function fajLista() { return FAJOK; }
