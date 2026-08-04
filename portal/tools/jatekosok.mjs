// PORTAL HUB TYCOON — MESTERSÉGES JÁTÉKOSOK.
//
// ── MIÉRT VAN EZ A FÁJL ───────────────────────────────────────────────────
// Egy tycoon egyensúlyát nem lehet EGY végigjátszásból megítélni. A v0.1
// hangolása egyetlen forgatókönyv egyetlen seedjén állt — az pedig nem méri,
// amit a legfontosabb lenne tudni: hogy a JÓ döntés tényleg jobb-e a rossznál.
// Ehhez több, egymással VERSENGŐ játékos kell, akik ugyanazt a világot
// másképp játsszák meg. Ha a „nemtörődöm" is elboldogul, akkor nem játék,
// hanem képernyővédő; ha egy stratégia minden seeden nyer, akkor nincs döntés.
//
// ── MIÉRT ÁLLAPOTFÜGGŐ MINDEGYIK ──────────────────────────────────────────
// A `forgatokonyv.mjs` fejléce ezt már megtanulta a maga kárán: a fix
// tick-listás forgatókönyv olyan parancsokat ad ki, amiket a világ még nem
// enged meg, azok elutasításba futnak, és a mérés némán elveszti a fél
// játékot. Itt ráadásul VISELKEDÉST mérünk: egy fix tick-lista nem stratégia,
// hanem felvétel — nem tudna reagálni arra, hogy elfogyott a pénz vagy
// összeomlott egy kapu, tehát pont azt nem mérné, amiért létezik.
//
// ── MIT NEM CSINÁLNAK ─────────────────────────────────────────────────────
// A sim belsejébe SOHA nem írnak. Olvasnak (ahogy a játékos is látja a HUD-ot
// és a paneleket), és `sim.parancs(...)`-ot adnak ki — pontosan azt a
// felületet használják, amit egy ember. Ha egy stratégia nem tud valamit
// elérni parancsokkal, az nem a stratégia hibája, hanem a játéké.
//
// ── A TELEKRÁCS ───────────────────────────────────────────────────────────
// Minden gépi játékos ugyanazon a 4×4-es telekrácson épít: 3×3 hasznos hely +
// 1 cella folyosó. Ez nem optimális elrendezés, DE MINDEGYIKNEK UGYANAZ —
// tehát az elrendezés minősége nem szennyezi a stratégiák összehasonlítását.
// (Ha mindegyik saját ügyes térkiosztást kapna, azt mérnénk, melyik
// térkiosztást írtam meg jobban, nem azt, melyik gazdasági döntés jobb.)

import { RACS_SZ, RACS_M } from '../src/mag/config.js';
import { DIMENZIOK } from '../src/sim/dimenziok.js';
import { EPULETEK, epuletTipus } from '../src/sim/epuletek.js';
import { ESEMENYEK } from '../src/sim/esemenyek.js';
import { tech } from '../src/sim/kutatas.js';

// ══════════════════════════════════════════════════════════════════════════
//  KÖZÖS SEGÉDLET
// ══════════════════════════════════════════════════════════════════════════

/** 4×4-es telkek a rácson, a kezdő csarnok közepétől kifelé rendezve. */
function telkek(sim) {
  const kx = sim.kezdoX, ky = sim.kezdoY;
  const cx = kx + 11, cy = ky + 8;
  const l = [];
  for (let y = ky - 16; y <= ky + 28; y += 4) {
    for (let x = kx - 20; x <= kx + 40; x += 4) {
      if (x < 0 || y < 0 || x + 3 > RACS_SZ || y + 3 > RACS_M) continue;
      l.push({ x, y, tav: Math.abs(x + 1 - cx) + Math.abs(y + 1 - cy) });
    }
  }
  l.sort((a, b) => a.tav - b.tav || a.y - b.y || a.x - b.x);
  return l;
}

/** 8×8-as padlóblokkok — a terjeszkedés egysége. A telekráccsal egy vonalban. */
function blokkok(sim) {
  const kx = sim.kezdoX, ky = sim.kezdoY;
  const l = [];
  for (let j = -3; j <= 3; j++) {
    for (let i = -3; i <= 4; i++) {
      const x = kx + 8 * i, y = ky + 8 * j;
      if (x + 8 <= 0 || y + 8 <= 0 || x >= RACS_SZ || y >= RACS_M) continue;
      l.push({ x, y, i, j, tav: Math.abs(i - 1) * 2 + Math.abs(j * 2 - 1) });
    }
  }
  l.sort((a, b) => a.tav - b.tav || a.j - b.j || a.i - b.i);
  return l;
}

/** Az első telek, ahová egy sz×m épület elfér. */
function szabadTelek(lista, sim, sz, m) {
  for (let i = 0; i < lista.length; i++) {
    const p = lista[i];
    if (sim.racs.szabadTerulet(p.x, p.y, sz, m)) return p;
  }
  return null;
}

/** Melyik szakmából hiányzik valaki egy már megépült épületben? */
function hianyzoSzakma(sim) {
  for (let a = 0; a < sim.epuletek.length; a++) {
    const ep = sim.epuletek[a];
    if (!ep) continue;
    const t = sim.epuletTipusa(ep);
    if (!t.fajta || t.szemelyzet === 0) continue;
    if (ep.dolgozok.length < t.szemelyzet) return t.fajta;
  }
  return null;
}

/** Egy kapu megnyitásának teljes ára (portál + nyitási díj + a III. fejezet ága). */
function kapuAr(sim, dimIdx) {
  let nyitas = DIMENZIOK[dimIdx].nyitasAr;
  if (sim.tortenetJelzok.has('megerosites')) nyitas = Math.round(nyitas * 1.6);
  return epuletTipus('portal').ar + nyitas;
}

/** Van-e nyitva vámköteles világ — enélkül a vám halott beruházás. */
function vamKell(sim) {
  for (let i = 0; i < sim.dimenziok.length; i++) {
    if (sim.dimenziok[i].nyitva && DIMENZIOK[i].vamKoteles) return true;
  }
  return false;
}

/** Forgalom-mérőszám: erre méretezik a gépi játékosok a kapacitást. */
function forgalom(sim) {
  const most = sim.utasSzam;
  const csucs = sim.csucsUtas * 0.6;
  return most > csucs ? most : csucs;
}

/** Egy technológia teljes függőségi sora, a végén magával a technológiával. */
export function fuggosegiSor(kod, ki = []) {
  const t = tech(kod);
  if (!t) return ki;
  for (let i = 0; i < t.fuggo.length; i++) fuggosegiSor(t.fuggo[i], ki);
  if (!ki.includes(kod)) ki.push(kod);
  return ki;
}

// ══════════════════════════════════════════════════════════════════════════
//  A KÖZÖS MOTOR
// ══════════════════════════════════════════════════════════════════════════
//
// Minden stratégia ugyanazt a döntési létrát járja be, csak MÁS SZÁMOKKAL és
// más kívánságlistával. Ez szándékos: így a köztük lévő különbség tényleg a
// gazdasági döntés, nem az, hogy az egyiknek írtam okosabb kódot.
//
// A létra fentről lefelé, tickenként EGY lépés:
//   1. történet / esemény válasz      (a modális ablakok kezelése)
//   2. energia                        (az áramszünet mindent lelassít)
//   3. személyzet                     (a félig üzemelő épület pénzt éget)
//   4. épület a kívánságlistából
//   5. új kapu
//   6. kutatás
//   7. kapufejlesztés / dolgozó-képzés
//   8. padlóterjeszkedés, ha elfogyott a hely

function motor(profil) {
  return function gyar(opciok = {}) {
    const p = { ...profil, ...opciok };
    let tl = null, bl = null;
    let lerakott = null;
    let utolsoFelvetel = -999;
    let utolsoEpites = -999;
    const dijKesz = new Set();

    return function jatekos(sim, t) {
      if (sim.jatekVege) return;
      if (tl === null) {
        tl = telkek(sim);
        bl = blokkok(sim);
        lerakott = new Set(['0,0', '1,0', '2,0', '0,1', '1,1', '2,1']);
      }

      // ── 1. TÖRTÉNET ÉS ESEMÉNYEK ────────────────────────────────────────
      // Ezek nem „stratégia": egy ember is elengedi a fejezet-ablakot. A
      // KÜLÖNBSÉG a válaszokban van (fizetünk-e az eseményre, melyik ágat
      // választjuk a fejezet-döntésnél) — azt a profil dönti el.
      if (t % 20 === 0) {
        if (sim.tortenet.allapot === 'bevezeto') sim.parancs({ fajta: 'fejezet_tovabb' });
        else if (sim.tortenet.allapot === 'dontes') {
          sim.parancs({ fajta: 'dontes', valasz: p.dontes(sim, sim.tortenet.fejezet) });
        }
        for (let i = 0; i < sim.varakozoValaszok.length; i++) {
          const e = sim.varakozoValaszok[i];
          const def = ESEMENYEK[e.idx];
          if (!def.valaszok) continue;
          sim.parancs({ fajta: 'esemeny_valasz', azon: e.azon, valasz: p.esemeny(sim, def) });
        }
      }

      if (p.tetlen) return;               // a kontrollcsoport itt megáll
      if (t % 10 !== 0) return;           // 10 tickenként egy döntés

      const penz = sim.penz;
      const f = forgalom(sim);

      // ── 2. ENERGIA ──────────────────────────────────────────────────────
      // A tartalék NEM luxus: az áramszünet minden épületet 40 %-ra ejt, és
      // a hangulaton keresztül a hírnevet is viszi. A stratégiák abban
      // különböznek, mekkora tartalékkal járnak (p.energiaTartalek).
      if (sim.energiaTermeles < sim.energiaIgeny * p.energiaTartalek && penz > 1800 + p.tartalek * 0.5) {
        const h = szabadTelek(tl, sim, 2, 2);
        if (h) { sim.parancs({ fajta: 'epit', tipus: 'energiamag', x: h.x, y: h.y }); return; }
        padlot(sim, bl, lerakott, penz);
        return;
      }

      // ── 3. SZEMÉLYZET ───────────────────────────────────────────────────
      if (t - utolsoFelvetel > p.felvetelKoz && penz > p.dolgozoTartalek) {
        const hiany = hianyzoSzakma(sim);
        if (hiany) { sim.parancs({ fajta: 'felvesz', tipus: hiany }); utolsoFelvetel = t; return; }
      }

      // ── 4. ÉPÜLET A KÍVÁNSÁGLISTÁBÓL ────────────────────────────────────
      if (t - utolsoEpites > p.epitesKoz) {
        for (let i = 0; i < p.terv.length; i++) {
          const [kod, celFv] = p.terv[i];
          const tip = epuletTipus(kod);
          if (tip.kutatas && !sim.kesz(tip.kutatas)) continue;
          const cel = typeof celFv === 'function' ? celFv(sim, f) : celFv;
          if (cel <= 0) continue;
          if (sim.epuletSzam(kod) >= cel) continue;
          if (penz < tip.ar + p.tartalek) continue;
          const h = szabadTelek(tl, sim, tip.sz, tip.m);
          if (!h) { padlot(sim, bl, lerakott, penz); return; }
          sim.parancs({ fajta: 'epit', tipus: kod, x: h.x, y: h.y });
          utolsoEpites = t;
          return;
        }
      }

      // ── 5. ÚJ KAPU ──────────────────────────────────────────────────────
      if (t > 300) {
        for (let i = 0; i < sim.dimenziok.length; i++) {
          const d = sim.dimenziok[i];
          if (!d.felfedezve || d.nyitva || d.lezarva) continue;
          if (!p.kaputNyit(sim, i, f)) break;
          const ar = kapuAr(sim, i);
          if (penz < ar + p.kapuTartalek) break;
          const h = szabadTelek(tl, sim, 3, 3);
          if (!h) { padlot(sim, bl, lerakott, penz); return; }
          sim.parancs({ fajta: 'epit', tipus: 'portal', x: h.x, y: h.y, dim: d.kod });
          return;
        }
      }

      // ── 6. KUTATÁS ──────────────────────────────────────────────────────
      if (!sim.aktivKutatas && t > 200 && penz > p.kutatasTartalek) {
        for (let i = 0; i < p.kutatas.length; i++) {
          const kod = p.kutatas[i];
          if (sim.kesz(kod) || !sim.kutathato(kod)) continue;
          if (penz < Math.round(tech(kod).ar * sim.kutatasKedvezmeny) + p.tartalek) break;
          sim.parancs({ fajta: 'kutat', kod });
          return;
        }
      }

      // ── 7. KAPUFEJLESZTÉS ÉS KÉPZÉS ─────────────────────────────────────
      if (penz > p.szintTartalek && t % 200 === 0) {
        const l = sim.nyitottDimenziok();
        let cel = null;
        for (let i = 0; i < l.length; i++) if (l[i].szint < 5 && (!cel || l[i].szint < cel.szint)) cel = l[i];
        if (cel) { sim.parancs({ fajta: 'dim_szint', kod: cel.kod }); return; }
      }
      if (p.kepez && penz > p.szintTartalek && t % 400 === 0) {
        for (let i = 0; i < sim.dolgozok.length; i++) {
          if (sim.dolgozok[i].szint < 2) { sim.parancs({ fajta: 'dolgozo_fejleszt', azon: sim.dolgozok[i].azon }); return; }
        }
      }

      // ── 8. DÍJSZABÁS ────────────────────────────────────────────────────
      // Minden frissen megnyitott kapun beállítjuk a stratégia díjszorzóját.
      for (let i = 0; i < sim.dimenziok.length; i++) {
        const d = sim.dimenziok[i];
        if (!d.nyitva || dijKesz.has(i)) continue;
        dijKesz.add(i);
        if (Math.abs(d.dijSzorzo - p.dij) > 0.001) {
          sim.parancs({ fajta: 'dim_dij', kod: d.kod, szorzo: p.dij });
          return;
        }
      }
    };
  };
}

/** Következő padlóblokk: csak olyat rakunk le, ami a meglévőhöz ér. */
function padlot(sim, bl, lerakott, penz) {
  if (penz < 1400) return;
  for (let i = 0; i < bl.length; i++) {
    const b = bl[i];
    const kulcs = `${b.i},${b.j}`;
    if (lerakott.has(kulcs)) continue;
    if (!lerakott.has(`${b.i - 1},${b.j}`) && !lerakott.has(`${b.i + 1},${b.j}`)
      && !lerakott.has(`${b.i},${b.j - 1}`) && !lerakott.has(`${b.i},${b.j + 1}`)) continue;
    lerakott.add(kulcs);
    sim.parancs({ fajta: 'padlo', x: b.x, y: b.y, sz: 8, m: 8 });
    return;
  }
}

// ── VÁLASZ-SABLONOK ───────────────────────────────────────────────────────

/** Mindig a legolcsóbb válasz (a 0. indexű a fizetős, az 1. rendszerint ingyen). */
const olcsoValasz = () => (sim, def) => {
  let legjobb = 0, ar = Infinity;
  for (let i = 0; i < def.valaszok.length; i++) if (def.valaszok[i].ar < ar) { ar = def.valaszok[i].ar; legjobb = i; }
  return legjobb;
};

/** Fizet, ha a válasz ára a vagyon adott hányada alatt van. */
const fizetosValasz = (hanyad) => (sim, def) => {
  for (let i = 0; i < def.valaszok.length; i++) {
    const v = def.valaszok[i];
    if (v.ar > 0 && v.ar < sim.penz * hanyad) return i;
  }
  return olcsoValasz()(sim, def);
};

// ══════════════════════════════════════════════════════════════════════════
//  A HAT STRATÉGIA
// ══════════════════════════════════════════════════════════════════════════

/**
 * ÓVATOS — előbb a személyzet és az energia, csak utána a terjeszkedés.
 * Keveset kutat, nagy készpénz-tartalékot tart, és a fejezet-döntéseknél
 * mindig a biztonságos (stabilizáló) ágat választja.
 */
export const ovatos = motor({
  nev: 'ovatos',
  tartalek: 6000,
  dolgozoTartalek: 4000,
  kapuTartalek: 14000,
  kutatasTartalek: 16000,
  szintTartalek: 26000,
  energiaTartalek: 1.35,
  felvetelKoz: 40,
  epitesKoz: 120,
  dij: 1.0,
  kepez: true,
  terv: [
    ['biztonsag', (s, f) => 1 + Math.floor(f / 55)],
    ['wc', (s, f) => 1 + Math.floor(f / 90)],
    ['varo', (s, f) => 1 + Math.floor(f / 80)],
    ['takarito', (s, f) => 1 + Math.floor(f / 220)],
    // A karbantartó nála NEM a második kapu után jön, hanem előtte: ez az
    // óvatos stratégia lényege — előbb a tartóváz, aztán a terjeszkedés.
    ['karbantarto', (s) => 1 + (s.nyitottDimenziok().length >= 4 ? 1 : 0)],
    ['info', 1],
    ['etterem', (s, f) => 1 + Math.floor(f / 110)],
    ['bolt', (s, f) => 1 + Math.floor(f / 130)],
    ['poggyasz', (s, f) => 1 + Math.floor(f / 200)],
    ['vam', (s, f) => (vamKell(s) ? 1 + Math.floor(f / 110) : 0)],
    ['seprupark', (s, f) => (f > 60 ? 1 + Math.floor(f / 200) : 0)],
    ['hoforras', (s, f) => (s.dimenzioNyitva('parazsmely') ? 1 + Math.floor(f / 200) : 0)],
    ['jegkamra', (s, f) => (s.dimenzioNyitva('fagyperem') ? 1 + Math.floor(f / 200) : 0)],
    ['konyvesbolt', (s, f) => (f > 80 ? 1 + Math.floor(f / 200) : 0)],
    ['orvos', 1],
    ['vip', 1],
  ],
  kutatas: ['gyors_sorok', 'stabil_kapuk', 'energia_halo', 'kapu_hangolas'],
  // Csak akkor nyit új kaput, ha a meglévők ellátása rendben van.
  kaputNyit: (sim) => sim.mukodoEpuletVan('karbantarto') && !sim.aramszunet && hianyzoSzakma(sim) === null,
  dontes: (sim, fej) => (fej === 2 ? 0 : 0),      // megerősítés, majd lezárás
  esemeny: fizetosValasz(0.18),
});

/**
 * TERJESZKEDŐ — amint egy világ ismert és kifizethető, kaput nyit.
 * A szolgáltatásokra alig költ: a portáldíjból akar élni.
 */
export const terjeszkedo = motor({
  nev: 'terjeszkedo',
  tartalek: 800,
  dolgozoTartalek: 1500,
  kapuTartalek: 500,
  kutatasTartalek: 9000,
  szintTartalek: 18000,
  energiaTartalek: 1.0,
  felvetelKoz: 60,
  epitesKoz: 60,
  dij: 1.0,
  kepez: false,
  terv: [
    ['biztonsag', (s, f) => 1 + Math.floor(f / 90)],
    ['wc', 1],
    ['varo', 1],
    ['takarito', 1],
    ['karbantarto', (s) => (s.nyitottDimenziok().length >= 2 ? 1 : 0)],
    ['etterem', 1],
    ['vam', (s) => (vamKell(s) ? 1 : 0)],
    ['poggyasz', 1],
    ['bolt', 1],
  ],
  kutatas: ['kapu_hangolas', 'stabil_kapuk', 'kristaly_takarek', 'kapu_szkenner', 'ido_kotes', 'fejlett_boltok', 'vip_ellatas', 'legendas_kapu'],
  kaputNyit: () => true,
  dontes: (sim, fej) => 1,                        // terjeszkedés, mindet megtartom
  esemeny: olcsoValasz(),
});

/**
 * BEVÉTEL-MAXIMALIZÁLÓ — sok bolt, étterem, könyvesbolt és VIP, magas díj.
 * A tétel: a kevesebb, de gazdagabb utas többet hoz, mint a tömeg.
 */
export const bevetel_maximalizalo = motor({
  nev: 'bevetel_maximalizalo',
  tartalek: 2500,
  dolgozoTartalek: 3000,
  kapuTartalek: 6000,
  kutatasTartalek: 9000,
  szintTartalek: 20000,
  energiaTartalek: 1.15,
  felvetelKoz: 40,
  epitesKoz: 70,
  dij: 1.3,
  kepez: false,
  terv: [
    ['biztonsag', (s, f) => 1 + Math.floor(f / 70)],
    ['bolt', (s, f) => 2 + Math.floor(f / 55)],
    ['etterem', (s, f) => 1 + Math.floor(f / 60)],
    ['konyvesbolt', (s, f) => 1 + Math.floor(f / 90)],
    ['wc', (s, f) => 1 + Math.floor(f / 110)],
    ['varo', (s, f) => 1 + Math.floor(f / 120)],
    ['takarito', (s, f) => 1 + Math.floor(f / 250)],
    ['poggyasz', (s, f) => 1 + Math.floor(f / 130)],
    ['vam', (s, f) => (vamKell(s) ? 1 + Math.floor(f / 80) : 0)],
    ['vip', (s, f) => 1 + Math.floor(f / 200)],
    ['karbantarto', (s) => (s.nyitottDimenziok().length >= 2 ? 1 : 0)],
    ['seprupark', (s, f) => (f > 50 ? 1 + Math.floor(f / 200) : 0)],
    ['hoforras', (s, f) => (s.dimenzioNyitva('parazsmely') ? 1 + Math.floor(f / 200) : 0)],
    ['jegkamra', (s, f) => (s.dimenzioNyitva('fagyperem') ? 1 + Math.floor(f / 200) : 0)],
    ['reklam', 3],
    ['info', 1],
  ],
  kutatas: ['fejlett_boltok', 'vip_ellatas', 'gyors_sorok', 'kapu_hangolas', 'stabil_kapuk', 'energia_halo', 'kapu_szkenner', 'ido_kotes', 'legendas_kapu'],
  kaputNyit: (sim) => sim.nyitottDimenziok().length < 5,
  dontes: (sim, fej) => 1,
  esemeny: fizetosValasz(0.12),
});

/**
 * OLCSÓ — alacsony díj, tömeg-stratégia. Sok kapacitás, gyors sorok.
 * A tétel: a díjvonzerő (0,5-nél +35 % forgalom) többet hoz, mint amennyit
 * a díjkiesés visz.
 */
export const olcso = motor({
  nev: 'olcso',
  tartalek: 2000,
  dolgozoTartalek: 2500,
  kapuTartalek: 6000,
  kutatasTartalek: 10000,
  szintTartalek: 22000,
  energiaTartalek: 1.2,
  felvetelKoz: 35,
  epitesKoz: 60,
  dij: 0.6,
  kepez: false,
  terv: [
    ['biztonsag', (s, f) => 1 + Math.floor(f / 40)],
    ['wc', (s, f) => 1 + Math.floor(f / 60)],
    ['varo', (s, f) => 1 + Math.floor(f / 55)],
    ['etterem', (s, f) => 1 + Math.floor(f / 75)],
    ['bolt', (s, f) => 1 + Math.floor(f / 80)],
    ['takarito', (s, f) => 1 + Math.floor(f / 180)],
    ['poggyasz', (s, f) => 1 + Math.floor(f / 110)],
    ['info', (s, f) => 1 + Math.floor(f / 250)],
    ['karbantarto', (s) => (s.nyitottDimenziok().length >= 2 ? 1 : 0)],
    ['vam', (s, f) => (vamKell(s) ? 1 + Math.floor(f / 70) : 0)],
    ['seprupark', (s, f) => (f > 50 ? 1 + Math.floor(f / 180) : 0)],
    ['konyvesbolt', (s, f) => (f > 90 ? 1 + Math.floor(f / 180) : 0)],
    ['hoforras', (s, f) => (s.dimenzioNyitva('parazsmely') ? 1 + Math.floor(f / 180) : 0)],
    ['jegkamra', (s, f) => (s.dimenzioNyitva('fagyperem') ? 1 + Math.floor(f / 180) : 0)],
    ['vip', 1],
  ],
  kutatas: ['gyors_sorok', 'kapu_hangolas', 'takaritorobot', 'auto_poggyasz', 'fejlett_boltok', 'stabil_kapuk', 'energia_halo', 'vip_ellatas'],
  kaputNyit: (sim) => sim.nyitottDimenziok().length < 5,
  dontes: (sim, fej) => 1,
  esemeny: olcsoValasz(),
});

/**
 * NEMTÖRŐDÖM — a KONTROLLCSOPORT. Elengedi a fejezet-ablakokat és a
 * legolcsóbb esemény-választ adja, de SEMMIT nem épít, senkit nem vesz fel.
 *
 * ⚠️ Ennek ROSSZUL kell elsülnie. Ha ez is elboldogul, akkor a játékos
 * döntései nem számítanak — az a legsúlyosabb egyensúly-hiba, ami létezik.
 */
export const nemtorodom = motor({
  nev: 'nemtorodom',
  tetlen: true,
  tartalek: 0, dolgozoTartalek: 0, kapuTartalek: 0, kutatasTartalek: 0,
  szintTartalek: 0, energiaTartalek: 0, felvetelKoz: 1e9, epitesKoz: 1e9,
  dij: 1.0, kepez: false, terv: [], kutatas: [],
  kaputNyit: () => false,
  dontes: () => 0,
  esemeny: olcsoValasz(),
});

/**
 * KIEGYENSÚLYOZOTT — a „jó játékos" referencia. Ehhez képest mérjük a
 * többit: ha egy rossz stratégia is ilyen jól teljesít, nincs mit tanulni
 * a játékban.
 */
export const kiegyensulyozott = motor({
  nev: 'kiegyensulyozott',
  tartalek: 3000,
  dolgozoTartalek: 3000,
  kapuTartalek: 5000,
  kutatasTartalek: 10000,
  szintTartalek: 24000,
  energiaTartalek: 1.2,
  felvetelKoz: 40,
  epitesKoz: 80,
  dij: 1.0,
  kepez: true,
  terv: [
    ['biztonsag', (s, f) => 1 + Math.floor(f / 50)],
    ['wc', (s, f) => 1 + Math.floor(f / 80)],
    ['varo', (s, f) => 1 + Math.floor(f / 70)],
    ['etterem', (s, f) => 1 + Math.floor(f / 70)],
    ['bolt', (s, f) => 1 + Math.floor(f / 70)],
    ['takarito', (s, f) => 1 + Math.floor(f / 200)],
    ['info', 1],
    ['poggyasz', (s, f) => 1 + Math.floor(f / 120)],
    ['karbantarto', (s) => (s.nyitottDimenziok().length >= 2 ? 1 : 0) + (s.nyitottDimenziok().length >= 4 ? 1 : 0)],
    ['vam', (s, f) => (vamKell(s) ? 1 + Math.floor(f / 80) : 0)],
    ['seprupark', (s, f) => (f > 50 ? 1 + Math.floor(f / 180) : 0)],
    ['konyvesbolt', (s, f) => 1 + Math.floor(f / 150)],
    ['hoforras', (s, f) => (s.dimenzioNyitva('parazsmely') ? 1 + Math.floor(f / 180) : 0)],
    ['jegkamra', (s, f) => (s.dimenzioNyitva('fagyperem') ? 1 + Math.floor(f / 180) : 0)],
    ['vip', (s, f) => 1 + Math.floor(f / 300)],
    ['orvos', 1],
    ['reklam', 2],
  ],
  kutatas: [
    'gyors_sorok', 'kapu_hangolas', 'fejlett_boltok', 'stabil_kapuk',
    'kristaly_takarek', 'energia_halo', 'takaritorobot', 'auto_poggyasz',
    'vip_ellatas', 'gyogyaszat', 'teleport_lift', 'kapu_szkenner',
    'ido_kotes', 'legendas_kapu',
  ],
  kaputNyit: (sim) => sim.nyitottDimenziok().length < 2 || sim.mukodoEpuletVan('karbantarto'),
  dontes: (sim, fej) => 0,
  esemeny: fizetosValasz(0.15),
});

/** A mérésbe bevont stratégiák — a sorrend a jelentés táblázatainak sorrendje. */
export const JATEKOSOK = {
  nemtorodom,
  ovatos,
  terjeszkedo,
  bevetel_maximalizalo,
  olcso,
  kiegyensulyozott,
};

export const JATEKOS_NEVEK = ['nemtorodom', 'ovatos', 'terjeszkedo', 'bevetel_maximalizalo', 'olcso', 'kiegyensulyozott'];

/** Az épület-katalógus a jelentéshez (ár, hogy a megtérülést lehessen számolni). */
export function epuletArak() {
  const m = new Map();
  for (let i = 0; i < EPULETEK.length; i++) m.set(EPULETEK[i].kod, EPULETEK[i].ar);
  return m;
}
