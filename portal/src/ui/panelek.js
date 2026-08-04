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
import { NEHEZSEGEK } from '../mag/config.js';
import { EPULETEK, IGENYEK } from '../sim/epuletek.js';
import { bestiariumot } from './bestiarium.js';
import * as tarolo from './tarolo.js';

const LAPOK = [
  { kod: 'dimenzio', ikon: '🌀', cim: 'Dimenziók' },
  { kod: 'kutatas', ikon: '🔬', cim: 'Kutatás' },
  { kod: 'dolgozo', ikon: '👷', cim: 'Dolgozók' },
  { kod: 'bestiarium', ikon: '🐾', cim: 'Bestiárium' },
  { kod: 'statisztika', ikon: '📊', cim: 'Statisztika' },
  { kod: 'naplo', ikon: '📜', cim: 'Napló' },
  { kod: 'mentes', ikon: '💾', cim: 'Mentés' },
  { kod: 'sugo', ikon: '❓', cim: 'Súgó' },
];

export class Panelek {
  constructor(gyoker, sim, hud) {
    this.sim = sim;
    this.hud = hud;
    this.lap = null;
    this.kivalasztott = -1;   // épület-azonosító a „kéz" eszközből
    this._ora = 0;

    const oldal = el('div');
    oldal.id = 'oldal';
    this.gombok = [];
    for (const l of LAPOK) {
      const g = el('button', '', l.ikon);
      g.title = l.cim;
      g.onclick = () => this.nyit(l.kod);
      oldal.appendChild(g);
      this.gombok.push({ kod: l.kod, g });
    }
    gyoker.appendChild(oldal);

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

  epuletet(azon) {
    this.kivalasztott = azon;
    this.lap = 'epulet';
    this.panel.classList.add('nyitva');
    for (const { g } of this.gombok) g.classList.remove('aktiv');
    this._epit();
  }

  frissit(dt) {
    this._ora += dt;
    if (this._ora < 0.5 || !this.lap) return;
    this._ora = 0;
    this._epit();
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
    be(p, el('h4', null, 'Elérhető'));
    for (const t of TECHNOLOGIAK) {
      const kesz = sim.kesz(t.kod);
      const lehet = sim.kutathato(t.kod);
      const d = el('div', 'tetel');
      const fej = el('div', 'fej');
      be(fej, el('span', null, t.ikon), el('b', null, t.nev),
        el('span', null, kesz ? '✅' : (lehet ? szam(Math.round(t.ar * sim.kutatasKedvezmeny)) + ' 💎' : '🔒')));
      be(d, fej, el('p', null, t.hatas));
      if (!kesz) {
        if (!lehet) {
          const hianyzo = t.fuggo.filter((f) => !sim.kesz(f)).map((f) => tech(f).nev).join(', ');
          be(d, el('div', 'sorok', 'Előfeltétel: ' + hianyzo));
        } else {
          const ar = Math.round(t.ar * sim.kutatasKedvezmeny);
          const g = el('button', 'mini', `Kutatás indítása (${Math.round(t.ido / 20)} mp)`);
          g.disabled = !!sim.aktivKutatas || sim.penz < ar;
          g.onclick = () => this._parancs({ fajta: 'kutat', kod: t.kod });
          be(d, g);
        }
      }
      p.appendChild(d);
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  _dolgozok(p) {
    const sim = this.sim;
    be(p, el('h2', null, '👷 Dolgozók'));
    let ber = 0;
    for (const d of sim.dolgozok) ber += dolgozoBer(d);
    be(p, el('div', 'sorok')).lastChild.innerHTML =
      `létszám <b>${sim.dolgozok.length}</b> · napi bér <b>${szam(ber)} 💎</b>`;

    be(p, el('h4', null, 'Felvétel'));
    for (const t of DOLGOZOK) {
      const d = el('div', 'tetel');
      const fej = el('div', 'fej');
      const belepo = t.ber * 3;
      be(fej, el('span', null, t.ikon), el('b', null, t.nev), el('span', null, `${t.ber}/nap`));
      be(d, fej, el('p', null, t.leiras));
      const g = el('button', 'mini', `Felvesz — belépő ${szam(belepo)} 💎`);
      g.disabled = sim.penz < belepo;
      g.onclick = () => this._parancs({ fajta: 'felvesz', tipus: t.kod });
      be(d, g);
      p.appendChild(d);
    }

    if (sim.dolgozok.length === 0) return;
    be(p, el('h4', null, 'Csapat'));
    for (const d of sim.dolgozok) {
      const t = DOLGOZOK[d.tipusIdx];
      const sor = el('div', 'tetel');
      const fej = el('div', 'fej');
      be(fej, el('span', null, t.ikon), el('b', null, `${t.nev} · ${d.szint}. szint`), el('span', null, `${dolgozoBer(d)}/nap`));
      be(sor, fej);

      // Beosztás: csak olyan épület jöhet szóba, ami ezt a szakmát kéri.
      const valaszto = el('select');
      valaszto.style.cssText = 'width:100%;margin-top:5px;background:#1a2144;color:#e6ecff;border:1px solid rgba(140,160,230,.25);border-radius:6px;padding:4px;';
      const ures0 = el('option', null, '— tétlen (bér megy, munka nincs)');
      ures0.value = '-1';
      valaszto.appendChild(ures0);
      for (let a = 0; a < sim.epuletek.length; a++) {
        const ep = sim.epuletek[a];
        if (!ep) continue;
        const et = EPULETEK[ep.tipusIdx];
        if (et.fajta !== t.kod || et.szemelyzet === 0) continue;
        const o = el('option', null, `${et.ikon} ${et.nev} (${ep.dolgozok.length}/${et.szemelyzet}) @${ep.x},${ep.y}`);
        o.value = String(ep.azon);
        valaszto.appendChild(o);
      }
      valaszto.value = String(d.epuletAzon);
      valaszto.onchange = () => this._parancs({ fajta: 'beoszt', dolgozo: d.azon, epulet: Number(valaszto.value) });
      be(sor, valaszto);

      const gombok = el('div', 'sorok');
      const ar = t.ber * 8 * d.szint;
      const fejleszt = el('button', 'mini', d.szint >= 3 ? 'Maximum' : `Képzés — ${szam(ar)} 💎`);
      fejleszt.disabled = d.szint >= 3 || sim.penz < ar;
      fejleszt.onclick = () => this._parancs({ fajta: 'dolgozo_fejleszt', azon: d.azon });
      const el2 = el('button', 'mini vesz', 'Elbocsát');
      el2.onclick = () => this._parancs({ fajta: 'elbocsat', azon: d.azon });
      be(gombok, fejleszt, el2);
      be(sor, gombok);
      p.appendChild(sor);
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  _statisztika(p) {
    const sim = this.sim;
    be(p, el('h2', null, '📊 Statisztika'));

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
      be(fej, el('b', null, h.nev), el('span', null, h.adat ? `${h.adat.elonezet.nap}. nap` : 'üres'));
      be(t, fej);
      if (h.adat) {
        const e = h.adat.elonezet;
        be(t, el('div', 'sorok')).lastChild.innerHTML =
          `pénz <b>${szam(e.penz)}</b> · hírnév <b>${e.hirnev}</b> · kapu <b>${e.kapu}</b> · ` +
          `${e.fejezet + 1}. fejezet${e.nehezseg ? ' · ' + e.nehezseg : ''}${e.vege ? ' · <b style="color:#ffd257">vége</b>' : ''}`;
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
    for (const [cim, sz] of reszek) {
      const d = el('div', 'tetel');
      d.innerHTML = `<div class="fej"><b>${cim}</b></div><p>${sz}</p>`;
      p.appendChild(d);
    }
    const v = el('div', 'tetel');
    v.innerHTML = '<div class="fej"><b>Irányítás</b></div><p>' +
      'Bal gomb: építés / vizsgálat · Jobb gomb húzva: tolás · Középső gomb: forgatás · Görgő: nagyítás<br>' +
      'W A S D: mozgás · Q E: forgatás · Szóköz: szünet · 1-4: sebesség · Esc: eszköz elengedése</p>';
    p.appendChild(v);
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

    if (t.igeny && t.dij > 0) {
      const b = el('div', 'tetel');
      b.innerHTML = ep.berbeadva
        ? '<div class="fej"><b>🤝 Bérbe adva</b></div><p>A bérlő üzemelteti: nem kell hozzá személyzet, ' +
          'és napi fix díjat is fizet — cserébe a forgalom bevételének csak 42 %-a a tiéd.</p>'
        : '<div class="fej"><b>🤝 Bérbeadás</b></div><p>Add ki a helyet egy bérlőnek: nem kell hozzá személyzet, ' +
          'és napi fix díjat fizet — cserébe a forgalom bevételének csak 42 %-a marad nálad.</p>';
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
