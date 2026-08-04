// PORTAL HUB TYCOON — BELÉPÉSI PONT.
//
// ── MIT CSINÁL EZ A FÁJL ──────────────────────────────────────────────────
// Összeköti a három réteget, és semmi mást. A világ a `sim`-ben van, a kép a
// `render`-ben, a felület az `ui`-ban; itt csak a huzalozás és a hurok lakik.
//
// ── A HUROK FIX LÉPÉSKÖZŰ ─────────────────────────────────────────────────
// A szimuláció 20 Hz-en jár, a rajzolás annyin, amennyit a gép bír. Ez nem
// stílus kérdése: ha a tick a képkockához lenne kötve, akkor a gazdaság
// sebessége a videokártyától függene, és két gépen máshogy telne a nap. A
// maradékidő gyűlik, és annyi tick fut le belőle, amennyi belefér — de
// legfeljebb 40, hogy egy háttérbe tett fül visszatéréskor ne fagyassza le a
// böngészőt egy órányi felhalmozott tickkel („halálspirál").
//
// ── A BETÖLTÉS ELŐBB VAN, MINT BÁRMI MÁS ──────────────────────────────────
// A mentés visszajátszás, nem visszaállítás (lásd `sim/mentes.js`). Ezért a
// világnak KÉSZEN kell lennie, mielőtt a render és a felület megszületik —
// így egyetlen hivatkozás sem mutathat a régi világra. Emiatt lett az indulás
// aszinkron függvény a korábbi modulszintű kód helyett.

import './ui/stilus.css';
import { Sim } from './sim/sim.js';
import { TICK_MS, SEBESSEGEK, RACS_SZINT, SZINT_MAGASSAG } from './mag/config.js';
import { EPULETEK, epuletTipus } from './sim/epuletek.js';
import { Visszajatszo } from './sim/mentes.js';
import { Szinter } from './render/szinter.js';
import { Allomas3d } from './render/allomas3d.js';
import { Lenyek3d } from './render/lenyek3d.js';
import { Hatasok3d } from './render/hatasok3d.js';
import { Hud } from './ui/hud.js';
import { EpitesSav } from './ui/epites.js';
import { Panelek } from './ui/panelek.js';
import { Modalok } from './ui/modalok.js';
import { Bevezeto } from './ui/bevezeto.js';
import * as tarolo from './ui/tarolo.js';
import { Hang } from './audio/hang.js';

/** Modulszintű, mert a hurok is olvassa (a súgóbuborék helyéhez kell). */
let egerX = 0, egerY = 0;
addEventListener('pointermove', (ev) => { egerX = ev.clientX; egerY = ev.clientY; });

/** A húzott téglalap kezdőcellája (padló/bontás eszköz), vagy null. */
let huzKezdet = null;

indit();

// ══════════════════════════════════════════════════════════════════════════
//  INDULÁS
// ══════════════════════════════════════════════════════════════════════════

async function indit() {
  const uiGyoker = document.getElementById('ui');
  const vaszon = document.getElementById('vaszon');

  // ── A VILÁG ────────────────────────────────────────────────────────────
  const mentes = tarolo.kertBetoltes();
  let sim;
  if (mentes) {
    sim = await visszajatszasFolyamatjelzovel(uiGyoker, mentes);
  } else {
    // A `?seed=` paraméterrel ugyanaz a világ újrajátszható — ez a
    // hibajelentés legfontosabb eszköze. A `Date.now()` itt szabad, mert a
    // RENDER oldalon vagyunk: a sim csak a kész számot kapja meg.
    const url = new URLSearchParams(location.search);
    const seed = (Number(url.get('seed')) | 0) || (Date.now() & 0x7fffffff);
    sim = new Sim({ seed, nehezseg: url.get('nehez') || 'normal' });
  }
  history.replaceState(null, '', `?seed=${sim.seed}&nehez=${sim.nehezseg.kod}`);

  // A betöltés PILLANATÁBAN vett állapot. A hurok azonnal továbblépteti a
  // világot, tehát utólag már nem lehet összevetni a mentéssel — a
  // böngésző-szonda 8. vizsgálata ezt a horgonyt használja annak
  // bizonyítására, hogy a betöltött világ bitre a mentett világ.
  const betoltottAllapot = { tick: sim.tick, osszeg: sim.ellenorzoOsszeg(), betoltve: !!mentes };

  // ── A KÉP ──────────────────────────────────────────────────────────────
  const szinter = new Szinter(vaszon);
  const allomas = new Allomas3d(szinter, sim);
  const lenyek = new Lenyek3d(szinter, sim);
  const hatasok = new Hatasok3d(szinter, sim);
  // A kamera a kezdő kapura néz — az üres rács közepe semmit nem mondana.
  szinter.cel.set(sim.kezdoX + 9, 0, sim.kezdoY + 8);
  szinter.tav = 32;
  szinter._kamerat();

  // ── A FELÜLET ──────────────────────────────────────────────────────────
  let sebIdx = 1;
  let aktivSzint = 0;
  const vezerlo = {
    sebesseg(i) { sebIdx = Math.max(0, Math.min(SEBESSEGEK.length - 1, i)); hud.sebessegJeloles(sebIdx); },
    sebessegIdx() { return sebIdx; },
    /**
     * Szintváltás. Három dolgot kell EGYSZERRE átállítani, és ha bármelyik
     * kimarad, az félrevezető: mit rajzolunk (allomas, lenyek), mire mutat az
     * egér (a talajsík magassága), és mit jelöl a HUD.
     */
    szint(i) {
      aktivSzint = Math.max(0, Math.min(RACS_SZINT - 1, i | 0));
      allomas.szintet(aktivSzint);
      lenyek.aktivSzint = aktivSzint;
      szinter.talajY = aktivSzint * SZINT_MAGASSAG;
      hud.szintJeloles(aktivSzint);
    },
    szintIdx() { return aktivSzint; },
  };
  // ── HANG ───────────────────────────────────────────────────────────────
  // Az AudioContext csak FELHASZNÁLÓI GESZTUSRA indulhat (autoplay-szabály),
  // ezért a példány most jön létre, de némán; az első kattintás kelti életre.
  const hang = new Hang();
  /**
   * Mérési fogantyú. A hangréteg folyamatos sávjait a hurok hangolja a világ
   * állapotához — emiatt viszont egy mérőeszköz nem tud befecskendezni saját
   * álállapotot: a következő képkocka azonnal visszaírná a valódit. (A
   * hang-szonda pontosan ebbe futott bele: az „üres" és a „nyüzsgő" állomás
   * ugyanolyan hangos lett, mert mindkettőt a valódi, üres állomás írta felül.)
   * Ezzel a kapcsolóval a szonda kikapcsolhatja a hurok hangolását a mérés
   * idejére. Egyetlen logikai érték, és a játékmenetre nincs hatása.
   */
  const beallitas = { hangAuto: true };
  const gesztus = () => hang.inditas();
  addEventListener('pointerdown', gesztus, { once: false });
  addEventListener('keydown', gesztus, { once: false });

  const hud = new Hud(uiGyoker, sim, vezerlo, hang);
  const epitesSav = new EpitesSav(uiGyoker, sim, hud);
  const panelek = new Panelek(uiGyoker, sim, hud);
  const modalok = new Modalok(uiGyoker, sim, hud, vezerlo);
  const bevezeto = new Bevezeto(uiGyoker, sim, hud);

  bevitel({ vaszon, sim, szinter, epitesSav, panelek, vezerlo, hang });
  vezerlo.szint(0);
  hurok({ sim, szinter, allomas, lenyek, hatasok, hud, epitesSav, panelek, modalok, bevezeto, vezerlo, hang, beallitas });

  // Kényelmi kapaszkodó hibakereséshez: a konzolból elérhető a világ.
  window.PHT = { sim, szinter, allomas, lenyek, hatasok, hud, panelek, epitesSav, modalok, bevezeto, tarolo, hang, beallitas, betoltottAllapot };
  console.log(`%cPORTAL HUB TYCOON%c  seed=${sim.seed}${mentes ? '  (betöltve)' : ''}`,
    'color:#9b6bff;font-weight:700', 'color:#93a0c8');
  if (mentes) hud.uzen(`Mentés betöltve — ${sim.nap}. nap`, 'jo');
}

/**
 * Visszajátszás folyamatjelzővel.
 *
 * A darabolás nem finomkodás: egy hosszú játszás naplója több tízezer tick, és
 * ha ezt egyetlen ciklusban futtatnánk, a böngésző több másodpercre BEFAGYNA —
 * a felhasználó pedig azt hinné, hogy összeomlott a lap. Így viszont látja,
 * hogy halad, és azt is, hogy hányadik napnál jár.
 */
async function visszajatszasFolyamatjelzovel(uiGyoker, mentes) {
  const doboz = document.createElement('div');
  doboz.id = 'betoltes';
  doboz.innerHTML =
    '<div class="doboz"><h1>Visszajátszás</h1>' +
    '<p>A mentés a parancsnaplód — a világ most újra felépül belőle.</p>' +
    '<div class="sav"><i></i></div><div class="szam">0 %</div></div>';
  uiGyoker.appendChild(doboz);
  const sav = doboz.querySelector('.sav > i');
  const szam = doboz.querySelector('.szam');

  const v = new Visszajatszo(Sim, mentes);
  while (!v.kesz) {
    v.lep(3000);
    const a = v.arany;
    sav.style.width = (a * 100).toFixed(1) + '%';
    szam.textContent = `${Math.round(a * 100)} %  ·  ${v.sim.nap}. nap`;
    await new Promise((r) => requestAnimationFrame(r));
  }
  doboz.remove();
  return v.sim;
}

// ══════════════════════════════════════════════════════════════════════════
//  BEVITEL
// ══════════════════════════════════════════════════════════════════════════

function bevitel({ vaszon, sim, szinter, epitesSav, panelek, vezerlo, hang }) {
  vaszon.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    const cella = szinter.egerCella();
    if (!cella) return;
    const e = epitesSav.eszkoz;

    const z = vezerlo.szintIdx();
    if (e.fajta === 'kez') {
      const azon = sim.racs.epuletAzon(cella.x, cella.y, z);
      if (azon >= 0) panelek.epuletet(azon);
      else if (sim.racs.jarhato(cella.x, cella.y, z)) panelek.cellat(cella.x, cella.y, z);
      else panelek.nyit(null);
      return;
    }
    if (e.fajta === 'padlo' || e.fajta === 'bont') { huzKezdet = cella; return; }
    if (e.fajta === 'epit') {
      const p = { fajta: 'epit', tipus: e.tipus, x: cella.x, y: cella.y, z };
      if (e.dim) p.dim = e.dim;
      sim.parancs(p);
    }
  });

  addEventListener('pointerup', (ev) => {
    if (ev.button !== 0 || !huzKezdet) return;
    const cella = szinter.egerCella() || huzKezdet;
    const r = huzottTeglalap(cella);
    const e = epitesSav.eszkoz;
    const z = vezerlo.szintIdx();
    if (e.fajta === 'padlo') {
      sim.parancs({ fajta: 'padlo', x: r.x, y: r.y, sz: r.sz, m: r.m, z });
    } else if (e.fajta === 'bont') {
      // A bontás cellánként megy: az épület bárhol elkapható, a padló is.
      for (let j = 0; j < r.m; j++) {
        for (let i = 0; i < r.sz; i++) sim.parancs({ fajta: 'bont', x: r.x + i, y: r.y + j, z });
      }
    }
    huzKezdet = null;
  });

  addEventListener('keydown', (ev) => {
    if (ev.target && /INPUT|TEXTAREA|SELECT/.test(ev.target.tagName)) return;
    if (ev.code === 'Space') { ev.preventDefault(); vezerlo.sebesseg(vezerlo.sebessegIdx() === 0 ? 1 : 0); }
    else if (ev.key >= '1' && ev.key <= '4') vezerlo.sebesseg(Number(ev.key) - 1);
    else if (ev.key === 'r' || ev.key === 'R') vezerlo.szint(vezerlo.szintIdx() + 1);
    else if (ev.key === 'f' || ev.key === 'F') vezerlo.szint(vezerlo.szintIdx() - 1);
  });
}

function huzottTeglalap(cella) {
  const a = huzKezdet, b = cella;
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, sz: Math.abs(a.x - b.x) + 1, m: Math.abs(a.y - b.y) + 1 };
}

// ══════════════════════════════════════════════════════════════════════════
//  HUROK
// ══════════════════════════════════════════════════════════════════════════

function hurok({ sim, szinter, allomas, lenyek, hatasok, hud, epitesSav, panelek, modalok, bevezeto, vezerlo, hang, beallitas }) {
  let utolsoIdo = performance.now();
  let maradek = 0;
  let ido = 0;
  let elozoValasz = null;
  let elozoDimAllapot = '';
  let elozoNap = sim.nap;
  let elozoEpuletSzam = sim.epuletek.length;
  let elozoFejezet = sim.tortenet.fejezet;
  let elozoNaploHossz = sim.naplok.length;
  let elozoVege = sim.jatekVege;
  let hibaVolt = false;

  function eszkozMeret() {
    const e = epitesSav.eszkoz;
    if (e.fajta === 'epit') {
      const t = epuletTipus(e.tipus);
      return t ? { sz: t.sz, m: t.m, magas: t.magas } : { sz: 1, m: 1, magas: 1 };
    }
    return { sz: 1, m: 1, magas: 0.35 };
  }

  function ervenyesE(cella, meret) {
    const e = epitesSav.eszkoz;
    if (e.fajta === 'epit') {
      const t = epuletTipus(e.tipus);
      if (!t) return false;
      if (t.kutatas && !sim.kesz(t.kutatas)) return false;
      if (sim.penz < t.ar) return false;
      const z = vezerlo.szintIdx();
      if (!sim.racs.szabadTerulet(cella.x, cella.y, meret.sz, meret.m, z)) return false;
      if (t.atjaro) {
        if (z + 1 >= RACS_SZINT) return false;
        if (!sim.racs.szabadTerulet(cella.x, cella.y, meret.sz, meret.m, z + 1)) return false;
      }
      return true;
    }
    const z = vezerlo.szintIdx();
    if (e.fajta === 'padlo') return sim.penz > 0 && sim.racs.padloLerakhato(cella.x, cella.y, z);
    if (e.fajta === 'bont') return sim.racs.vanPadlo(cella.x, cella.y, z) || sim.racs.epuletAzon(cella.x, cella.y, z) >= 0;
    return false;
  }

  /**
   * Egy képkocka — kivétel-védelemmel.
   *
   * ── MIÉRT KELL EZ EGY 1.0-HOZ ───────────────────────────────────────────
   * A `requestAnimationFrame` hurokban egy kivétel NEM állítja meg a
   * ciklust, de az adott képkockát félbevágja: a világ leléptetve, a kép nem
   * rajzolva, a felület fele frissítve. A játékos ebből annyit lát, hogy a
   * játék „megfagyott" vagy „megbolondult" — a konzolt pedig nem nézi meg.
   *
   * Itt inkább KIMONDJUK. A szimulációt megállítjuk (a hibás állapotot ne
   * vigyük tovább), a rajzolás megy tovább (legyen mit nézni), és a játékos
   * megkapja a hibaüzenetet meg azt a tanácsot, ami tényleg segít: mentsen
   * fájlba, mert abból a hiba bitre újrajátszható.
   */
  function keret(most) {
    requestAnimationFrame(keret);
    try {
      keretBelso(most);
    } catch (e) {
      if (!hibaVolt) {
        hibaVolt = true;
        vezerlo.sebesseg(0);
        console.error('PORTAL HUB TYCOON — hiba a fő hurokban:', e);
        hud.uzen('Hiba történt, a világ megállt. Mentsd fájlba (💾 panel) — abból a hiba újrajátszható.', 'baj');
      }
      // A rajzolás akkor is fusson le, hogy ne fagyott képernyőt lásson.
      try { szinter.rajzol(); } catch (e2) { /* ha ez sem megy, nincs mit tenni */ }
    }
  }

  function keretBelso(most) {
    const dt = Math.min(0.25, (most - utolsoIdo) / 1000);
    utolsoIdo = most;
    ido += dt;

    szinter.billentyu(dt);

    // ── SZIMULÁCIÓ ──────────────────────────────────────────────────────
    maradek += dt * 1000 * SEBESSEGEK[vezerlo.sebessegIdx()];
    let n = 0;
    while (maradek >= TICK_MS && n < 40) { sim.lep(); maradek -= TICK_MS; n++; }
    if (maradek > TICK_MS * 40) maradek = 0;

    // ── AUTOMATA MENTÉS ─────────────────────────────────────────────────
    // Naponta egyszer. A napváltás jó horgony: ritka, kiszámítható, és pont
    // akkor van, amikor a játékos amúgy is elszámol (bérek, mérleg).
    if (sim.nap !== elozoNap) {
      elozoNap = sim.nap;
      if (sim.elozoNap && sim.elozoNap.bevetel > sim.elozoNap.koltseg) hang.jelez('kassza');
      const v = tarolo.automataMentes(sim);
      if (!v.rendben) hud.uzen('Az automata mentés nem sikerült: ' + v.ok, 'gond');
    }

    // ── PARANCS-VISSZAJELZÉS ────────────────────────────────────────────
    // A parancs a tick elején fut le, tehát az elutasítás oka csak UTÁNA
    // olvasható. Ez a néhány sor az, ami miatt a játékos nem azt látja, hogy
    // „nem történt semmi", hanem azt, hogy MIÉRT nem.
    if (sim.utolsoValasz !== elozoValasz) {
      if (sim.utolsoValasz && !sim.utolsoValasz.rendben) { hud.uzen(sim.utolsoValasz.ok, 'gond'); hang.jelez('hiba'); }
      elozoValasz = sim.utolsoValasz;
    }
    if (sim.epuletek.length !== elozoEpuletSzam) {
      hang.jelez(sim.epuletek.length > elozoEpuletSzam ? 'epit' : 'bont');
      elozoEpuletSzam = sim.epuletek.length;
    }

    // ── ÉPÍTÉSI ELŐNÉZET ────────────────────────────────────────────────
    const cella = szinter.egerCella();
    const e = epitesSav.eszkoz;
    if (cella && e.fajta !== 'kez') {
      let m = eszkozMeret();
      let hely = cella;
      if (huzKezdet && (e.fajta === 'padlo' || e.fajta === 'bont')) {
        const r = huzottTeglalap(cella);
        hely = { x: r.x, y: r.y }; m = { sz: r.sz, m: r.m, magas: 0.35 };
      }
      allomas.elonezet(hely, m.sz, m.m, m.magas, ervenyesE(hely, m));
    } else {
      allomas.elonezet(null);
    }

    // ── SÚGÓBUBORÉK A KÉZ ESZKÖZNÉL ─────────────────────────────────────
    if (cella && e.fajta === 'kez') {
      const azon = sim.racs.epuletAzon(cella.x, cella.y, vezerlo.szintIdx());
      allomas.kiemel(azon);
      if (azon >= 0) {
        const ep = sim.epuletek[azon];
        const t = EPULETEK[ep.tipusIdx];
        hud.buborekot(
          `<b>${t.ikon} ${t.nev}</b><br>` +
          `terhelés ${Math.round(ep.hatekonysag * 100)} % · személyzet ${ep.dolgozok.length}/${t.szemelyzet}<br>` +
          (t.igeny ? `sor ${ep.sor.length} · bent ${ep.bent.length}/${t.kapacitas}<br>` : '') +
          `bevétel ${Math.round(ep.bevetel)} 💎`,
          egerX, egerY,
        );
      } else hud.buborekot(null);
    } else { if (e.fajta !== 'kez') hud.buborekot(null); allomas.kiemel(-1); }

    // ── FELÜLET ─────────────────────────────────────────────────────────
    hud.frissit();
    epitesSav.frissit();
    panelek.frissit(dt);
    modalok.frissit();
    bevezeto.frissit();

    // A „Kapuk" fül tartalma a dimenziók állapotától függ. Csak akkor
    // építjük újra, ha tényleg változott — különben minden képkockán DOM-ot
    // cserélnénk a sáv alatt, és a kattintás elveszne.
    const dimAllapot = sim.dimenziok.map((d) => (d.felfedezve ? 1 : 0) + (d.nyitva ? 2 : 0) + (d.lezarva ? 4 : 0)).join('');
    if (dimAllapot !== elozoDimAllapot) {
      // Csak akkor szóljon, ha tényleg NYÍLT egy kapu — a bezárás és a
      // felfedezés is ezt a jelzőt mozgatja, de azoknak más a hangja.
      if (elozoDimAllapot && dimAllapot.length === elozoDimAllapot.length) {
        for (let i = 0; i < dimAllapot.length; i++) {
          const elotte = Number(elozoDimAllapot[i]), utana = Number(dimAllapot[i]);
          if (!(elotte & 2) && (utana & 2)) { hang.jelez('kapu_nyit'); break; }
        }
      }
      elozoDimAllapot = dimAllapot;
      if (epitesSav.kategoria === 'kapuk') epitesSav.ujraEpit();
    }

    // ── HANG-ESEMÉNYEK A NAPLÓBÓL ───────────────────────────────────────
    // A napló az a hely, ahol a sim MÁR eldöntötte, hogy valami történt.
    // Ebből olvasni olcsóbb és megbízhatóbb, mint minden alrendszerhez külön
    // figyelőt írni — és nem is csúszhat el a kettő egymástól.
    if (sim.naplok.length !== elozoNaploHossz) {
      for (let i = Math.max(elozoNaploHossz, sim.naplok.length - 6); i < sim.naplok.length; i++) {
        const sz = sim.naplok[i].szoveg;
        if (sz.startsWith('ÖSSZEOMLOTT')) hang.jelez('omlas');
        else if (sz.startsWith('ESEMÉNY')) hang.jelez('esemeny');
        else if (sz.startsWith('Kutatás kész')) hang.jelez('kutatas_kesz');
      }
      elozoNaploHossz = sim.naplok.length;
    }
    if (sim.tortenet.fejezet !== elozoFejezet) { elozoFejezet = sim.tortenet.fejezet; hang.jelez('fejezet'); }
    if (sim.jatekVege !== elozoVege) {
      elozoVege = sim.jatekVege;
      if (elozoVege) hang.jelez(elozoVege === 'gyozelem' ? 'gyozelem' : 'csod');
    }
    if (beallitas.hangAuto) hang.frissit(sim, dt);

    // ── RAJZOLÁS ────────────────────────────────────────────────────────
    // A napszak a sim ÓRÁJÁBÓL jön (hányadik tick a napból), nem a valós
    // időből: így a szüneteltetett játékban nem megy tovább az idő, és a
    // gyorsításban sem szalad el az égbolt a gazdaságtól.
    szinter.napszak(sim.tick);
    allomas.frissit(ido);
    lenyek.frissit(ido);
    hatasok.frissit(ido, dt);
    szinter.rajzol();
  }

  requestAnimationFrame(keret);
}
