// PORTAL HUB TYCOON — EGYENSÚLY-ELEMZŐ.
//
// ── MIÉRT VAN EZ AZ ESZKÖZ ────────────────────────────────────────────────
// A szimuláció determinisztikus és GPU nélkül fut. Ezt ki KELL használni: a
// v0.1 egyensúlya ma egyetlen forgatókönyv egyetlen seedjén áll, ami körülbelül
// annyit ér, mintha egy kockát egyszer dobnánk fel és abból következtetnénk a
// súlypontjára. Egy tycoonnál pont az egyensúly a termék — a rossz szám nem
// összeomlik, hanem UNALMAT okoz, és az unalom nem bukik el egy zöld szondán.
//
// Ezért itt tömeges, fej nélküli végigjátszás fut: több stratégia × több seed,
// és a végén nem „hibás/hibátlan" jön ki, hanem ÍTÉLET:
//   • megkülönbözteti-e a játék a jó és a rossz döntést,
//   • van-e domináns stratégia (az unalom másik neve),
//   • hol dől el a játszma, és van-e olyan gödör, amiből nincs kiút.
//
// ── AMIT EZ AZ ESZKÖZ NEM MÉR ─────────────────────────────────────────────
// SEBESSÉGET NEM. A `CLAUDE.md` szabálya szerint a felhőben mért tick-idő két
// futás között összehasonlíthatatlan (osztott CPU), FPS pedig egyáltalán nincs.
// Itt kizárólag JÁTÉKMENET-számok születnek — azok viszont a seedtől eltekintve
// bitre reprodukálhatók.
//
// ── v0.5: MIÉRT KELLETT ÁG-ABLÁCIÓ ÉS NEHÉZSÉG-MÉRÉS ──────────────────────
// A stratégiák EGYMÁSSAL való összehasonlítása nem tudja megmondani, hogy
// „megéri-e az emelet": az `emeletes` és a `kiegyensulyozott` húsz számban
// különbözik, tehát a különbségük nem az emeleté. Ezért van a 13. szakasz:
// UGYANAZ a stratégia fut, egyetlen ág be- és kikapcsolva. Ez az egyetlen
// mérés, ami egy alrendszer értékét önmagában adja vissza.
//
// A nehézségi fokozat pedig a `Sim` konstruktorának paramétere, nem parancs —
// ezért kellett a `futas()`-nak külön argumentum. Fokozatot mérni csak úgy
// lehet, hogy MINDEN MÁS azonos: ugyanaz a stratégia, ugyanazok a seedek.
//
// ── HASZNÁLAT ─────────────────────────────────────────────────────────────
//   node portal/tools/egyensuly.mjs [tick] [seedDb] [gyors]
//   alap: 60000 tick (50 játéknap) × 8 seed × 10 stratégia
//   a „gyors" harmadik szó kihagyja a technológia-, díjszabás- és
//   ág-ablációs kísérletet (a nehézség-mérés marad: az a v0.5 fő kérdése).

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Sim } from '../src/sim/sim.js';
import { MAX_UTAS, NAP_TICK, KEZDO_PENZ, NEHEZSEGEK, RACS_SZINT } from '../src/mag/config.js';
import { DIMENZIOK } from '../src/sim/dimenziok.js';
import { EPULETEK, epuletTipus } from '../src/sim/epuletek.js';
import { TECHNOLOGIAK } from '../src/sim/kutatas.js';
import { IGENYEK } from '../src/sim/epuletek.js';
import {
  JATEKOSOK, JATEKOS_NEVEK, kiegyensulyozott, olcso, fuggosegiSor, epuletArak,
} from './jatekosok.mjs';

const GYOKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const TICKEK = Number(process.argv[2] || 60000);
const SEED_DB = Number(process.argv[3] || 8);
const GYORS = process.argv[4] === 'gyors';

/** Rögzített seedek. Nem véletlenek: a mérés legyen megismételhető. */
const ALAP_SEEDEK = [31337, 4242, 90210, 777, 12345, 555001, 8675309, 2718281];
function seedek(db) {
  const l = [];
  for (let i = 0; i < db; i++) l.push(i < ALAP_SEEDEK.length ? ALAP_SEEDEK[i] : (i * 104729 + 13) | 0);
  return l;
}

const AR = epuletArak();
const IGENY_NEV = new Map(IGENYEK.map((i) => [i.kod, i.nev]));

// ══════════════════════════════════════════════════════════════════════════
//  EGY VÉGIGJÁTSZÁS
// ══════════════════════════════════════════════════════════════════════════

/**
 * @param {string} nev a stratégia neve (csak címke)
 * @param {Function} gyar a játékos-gyár (opciókkal már felparaméterezve)
 * @param {number} seed
 * @param {number} tickek
 * @param {string} nehezseg 'konnyu' | 'normal' | 'kemeny'
 */
function futas(nev, gyar, seed, tickek, nehezseg = 'normal') {
  const sim = new Sim({ seed, nehezseg });
  const jatekos = gyar();

  const napiSor = [];
  let utasOsszeg = 0, plafonTick = 0, aramTick = 0;
  let penzMin = sim.penz, penzMinTick = 0;
  let osszeomlas = 0;
  /**
   * Tételes bevétel/kiadás a teljes futásra. A `sim.tetelek` naponta ürül, a
   * `sim.elozoNap.tetelek` viszont megmarad a napváltásig — innen gyűjtjük.
   * Enélkül a bérbeadás mérhetetlen: a bérleti díj és a bérlet-részesedés
   * SEHOL máshol nem különül el a többi bevételtől.
   */
  const tetelOsszeg = new Map();
  const elozoSzunet = new Int32Array(sim.dimenziok.length);
  const techIdo = [];
  const keszTech = new Set();
  // Sorhossz épülettípusonként: a szűk keresztmetszet ebből látszik.
  const sorMax = new Map(), sorOsszeg = new Map(), sorMinta = new Map();
  let prevNap = sim.nap;
  let vegTick = tickek;

  for (let t = 0; t < tickek; t++) {
    jatekos(sim, t);
    sim.lep();

    utasOsszeg += sim.utasSzam;
    if (sim.utasSzam >= MAX_UTAS - 5) plafonTick++;
    if (sim.aramszunet) aramTick++;
    if (sim.penz < penzMin) { penzMin = sim.penz; penzMinTick = sim.tick; }
    for (let i = 0; i < sim.dimenziok.length; i++) {
      const sz = sim.dimenziok[i].szunet;
      if (elozoSzunet[i] === 0 && sz > 0) osszeomlas++;
      elozoSzunet[i] = sz;
    }

    if (t % 60 === 0 && keszTech.size !== sim.keszTechek.size) {
      for (let i = 0; i < TECHNOLOGIAK.length; i++) {
        const k = TECHNOLOGIAK[i].kod;
        if (sim.kesz(k) && !keszTech.has(k)) { keszTech.add(k); techIdo.push({ kod: k, tick: sim.tick, nap: sim.nap }); }
      }
    }

    if (t % 100 === 0) {
      for (let a = 0; a < sim.epuletek.length; a++) {
        const ep = sim.epuletek[a];
        if (!ep) continue;
        const t2 = EPULETEK[ep.tipusIdx];
        if (!t2.igeny) continue;
        const h = ep.sor.length;
        if (h > (sorMax.get(ep.kod) || 0)) sorMax.set(ep.kod, h);
        sorOsszeg.set(ep.kod, (sorOsszeg.get(ep.kod) || 0) + h);
        sorMinta.set(ep.kod, (sorMinta.get(ep.kod) || 0) + 1);
      }
    }

    if (sim.nap !== prevNap) {
      prevNap = sim.nap;
      if (sim.elozoNap.tetelek) {
        for (const [k, v] of sim.elozoNap.tetelek) tetelOsszeg.set(k, (tetelOsszeg.get(k) || 0) + v);
      }
      napiSor.push({
        nap: sim.nap - 1,
        penz: Math.round(sim.penz),
        hirnev: Math.round(sim.hirnev * 10) / 10,
        utas: sim.utasSzam,
        epulet: sim.epuletek.reduce((n, e) => n + (e ? 1 : 0), 0),
        dolgozo: sim.dolgozok.length,
        kapu: sim.nyitottDimenziok().length,
        fejezet: sim.tortenet.fejezet,
        bevetel: Math.round(sim.elozoNap.bevetel),
        koltseg: Math.round(sim.elozoNap.koltseg),
      });
    }

    // ⚠️ v0.6: A GYŐZELEM NEM ÁLLÍTJA MEG A VILÁGOT. A hét fejezet után
    // korszakok jönnek, és a `jatekVege` már CSAK a csődöt jelenti. Ha itt a
    // régi módon törnék ki, a jól játszó stratégiák futása a 17-20. napon
    // véget érne, a rosszaké meg az 50-en — és az összes „végállapot" oszlop
    // két különböző hosszúságú játékot hasonlítana össze.
    if (sim.jatekVege) { vegTick = t + 1; break; }
  }

  // ── ÖSSZESÍTÉS ──────────────────────────────────────────────────────────
  const epStat = new Map();
  // v0.5: szintenkénti épületszám, bérbe adott üzletek, csatorna-épületek.
  // Ezek nélkül a három új alrendszerről csak annyit lehetne mondani, hogy
  // „a stratégia állítólag használja" — a mérésnek látnia kell, hogy tényleg.
  const szintDb = new Array(RACS_SZINT).fill(0);
  let berbeadDb = 0, berbeadBevetel = 0, csatornaDb = 0;
  /**
   * Eszközérték: a felépített épületek katalógus-ára összesen.
   *
   * MIÉRT KELL: a végállapot KÉSZPÉNZE önmagában félrevezet egy növekedési
   * szakaszban. Aki 100 000-et beépít, az szegényebbnek látszik annál, aki a
   * párnája alatt tartja — miközben az épület termel. Mérve is: az ág-abláció
   * első változatában MIND a hat ág „nem érte meg" volt, holott a vasutas ág
   * össz. bevétele 51 %-kal nagyobb volt az alapnál. A nettó vagyon
   * (készpénz + eszközérték) az, ami a kettőt egy nevezőre hozza.
   */
  let eszkozErtek = 0;
  for (let a = 0; a < sim.epuletek.length; a++) {
    const ep = sim.epuletek[a];
    if (!ep) continue;
    let e = epStat.get(ep.kod);
    if (!e) { e = { kod: ep.kod, db: 0, bevetel: 0, kiszolgalt: 0 }; epStat.set(ep.kod, e); }
    e.db++;
    e.bevetel += ep.bevetel;
    e.kiszolgalt += ep.kiszolgalt;
    if (ep.z < szintDb.length) szintDb[ep.z]++;
    if (ep.szintek > 1 && ep.z + 1 < szintDb.length) szintDb[ep.z + 1]++;  // az átjáró két szinten áll
    if (ep.berbeadva) { berbeadDb++; berbeadBevetel += ep.bevetel; }
    if (EPULETEK[ep.tipusIdx].csatorna) csatornaDb++;
    eszkozErtek += EPULETEK[ep.tipusIdx].ar;
  }
  const epuletek = [...epStat.values()].map((e) => ({
    ...e,
    ar: AR.get(e.kod),
    megterules: AR.get(e.kod) > 0 ? e.bevetel / (AR.get(e.kod) * e.db) : 0,
    sorMax: sorMax.get(e.kod) || 0,
    sorAtlag: sorMinta.get(e.kod) ? (sorOsszeg.get(e.kod) / sorMinta.get(e.kod)) : 0,
  })).sort((a, b) => b.bevetel - a.bevetel);

  const dimek = sim.dimenziok.map((d) => ({
    kod: d.kod, nyitva: d.nyitva, lezarva: d.lezarva, szint: d.szint,
    dijSzorzo: d.dijSzorzo, osszUtas: d.osszUtas, bevetel: Math.round(d.bevetel),
    instabilitas: Math.round(d.instabilitas),
  }));

  const hianyok = [...sim.hianyok.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, v]);

  const napPenz = (n) => {
    const s = napiSor.find((x) => x.nap === n);
    return s ? s.penz : null;
  };
  const napHirnev = (n) => {
    const s = napiSor.find((x) => x.nap === n);
    return s ? s.hirnev : null;
  };

  let osszBevetel = 0, osszKoltseg = 0;
  for (const n of napiSor) { osszBevetel += n.bevetel; osszKoltseg += n.koltseg; }

  // Csatorna- és kapu-oldal szétválasztva: a „nyugodt ág" kérdése pont ez.
  let kapuUtas = 0, kapuDij = 0, csatornaUtas = 0, csatornaDij = 0;
  let kapuSzintOssz = 0, kapuSzintDb = 0;
  for (let i = 0; i < sim.dimenziok.length; i++) {
    const d = sim.dimenziok[i];
    if (DIMENZIOK[i].csatorna) { csatornaUtas += d.osszUtas; csatornaDij += d.bevetel; }
    else {
      kapuUtas += d.osszUtas; kapuDij += d.bevetel;
      if (d.nyitva) { kapuSzintOssz += d.szint; kapuSzintDb++; }
    }
  }

  return {
    strategia: nev,
    seed,
    nehezseg,
    tickek: vegTick,
    nap: sim.nap,
    veg: sim.jatekVege,
    vegNap: sim.jatekVege ? sim.nap : null,
    gyoztel: !!sim.gyoztel,
    gyozelemNap: sim.gyoztel ? Math.floor(sim.gyozelemTick / NAP_TICK) + 1 : null,
    korszak: sim.tortenet.korszak,
    fejezet: sim.tortenet.fejezet,
    fejezetAllapot: sim.tortenet.allapot,
    penzVeg: Math.round(sim.penz),
    penzMin: Math.round(penzMin),
    penzMinNap: Math.floor(penzMinTick / NAP_TICK) + 1,
    penz5: napPenz(5), penz10: napPenz(10), penz20: napPenz(20), penz30: napPenz(30), penz50: napPenz(50),
    hirnev5: napHirnev(5), hirnev10: napHirnev(10), hirnev20: napHirnev(20), hirnev30: napHirnev(30), hirnev50: napHirnev(50),
    hirnevVeg: Math.round(sim.hirnev * 10) / 10,
    hirnevMin: napiSor.length ? Math.min(...napiSor.map((n) => n.hirnev)) : sim.hirnev,
    negativNapok: napiSor.filter((n) => n.penz < 0).length,
    csodkozeliNapok: napiSor.filter((n) => n.penz < -3000).length,
    tavozo: sim.osszTavozo,
    elegedett: sim.elegedettTavozok,
    duhos: sim.duhosTavozok,
    elegedettArany: sim.osszTavozo > 0 ? sim.elegedettTavozok / sim.osszTavozo : 0,
    duhosArany: sim.osszTavozo > 0 ? sim.duhosTavozok / sim.osszTavozo : 0,
    utasCsucs: sim.csucsUtas,
    utasAtlag: utasOsszeg / vegTick,
    plafonArany: plafonTick / vegTick,
    aramszunetArany: aramTick / vegTick,
    kosz: Math.round(sim.kosz),
    epuletDb: sim.epuletek.reduce((n, e) => n + (e ? 1 : 0), 0),
    dolgozoDb: sim.dolgozok.length,
    nyitottKapu: sim.nyitottDimenziok().length,
    osszeomlas,
    techek: techIdo,
    techDb: sim.keszTechek.size,
    epuletek,
    dimenziok: dimek,
    portaldij: dimek.reduce((n, d) => n + d.bevetel, 0),
    szolgaltatasBevetel: epuletek.reduce((n, e) => n + e.bevetel, 0),
    osszBevetel,
    osszKoltseg,
    hianyok,
    // ── v0.5 ──────────────────────────────────────────────────────────────
    eszkozErtek,
    vagyon: Math.round(sim.penz) + eszkozErtek,
    // Az utolsó három nap átlagos bevétele: a „hol tart most" mérőszám. A
    // végállapot vagyona a MÚLTAT összegzi, ez a JELEN teljesítményt mutatja.
    napiBevetelVeg: napiSor.length
      ? Math.round(napiSor.slice(-3).reduce((n, x) => n + x.bevetel, 0) / Math.min(3, napiSor.length))
      : 0,
    szintDb,
    emeletEpulet: szintDb.slice(1).reduce((a, b) => a + b, 0),
    berbeadDb,
    berbeadBevetel: Math.round(berbeadBevetel),
    csatornaDb,
    kapuUtas, kapuDij: Math.round(kapuDij),
    csatornaUtas, csatornaDij: Math.round(csatornaDij),
    kapuSzintAtlag: kapuSzintDb ? kapuSzintOssz / kapuSzintDb : 0,
    tetelek: [...tetelOsszeg.entries()].map(([k, v]) => [k, Math.round(v)]),
    napiSor,
  };
}

// ══════════════════════════════════════════════════════════════════════════
//  KIÍRÁS
// ══════════════════════════════════════════════════════════════════════════

const cim = (s) => console.log(`\n\x1b[1m${s}\x1b[0m`);
const sor = (s) => console.log(s);

function tabla(fejlec, sorok) {
  if (sorok.length === 0) return;
  const sz = fejlec.map((f, i) => Math.max(String(f).length, ...sorok.map((s) => String(s[i]).length)));
  const vonal = (c) => sz.map((n) => c.repeat(n + 2)).join('');
  sor('  ' + fejlec.map((f, i) => String(f).padEnd(sz[i] + 2)).join(''));
  sor('  ' + vonal('─'));
  for (const s of sorok) sor('  ' + s.map((v, i) => String(v).padEnd(sz[i] + 2)).join(''));
}

const p1 = (x) => (x === null || x === undefined ? '—' : (Math.round(x * 10) / 10).toString());
const sz1 = (x) => (x === null || x === undefined ? '—' : Math.round(x).toString());
const szaz = (x) => `${Math.round(x * 100)}%`;
const atl = (l, f) => (l.length ? l.reduce((n, x) => n + f(x), 0) / l.length : 0);

// ══════════════════════════════════════════════════════════════════════════
//  FŐ MÉRÉS
// ══════════════════════════════════════════════════════════════════════════

const SEEDEK = seedek(SEED_DB);
console.log(`\n\x1b[1mPORTAL HUB TYCOON — EGYENSÚLY-ELEMZÉS\x1b[0m`);
console.log(`${JATEKOS_NEVEK.length} stratégia × ${SEEDEK.length} seed × ${TICKEK} tick (${Math.round(TICKEK / NAP_TICK)} játéknap)`);
console.log(`seedek: ${SEEDEK.join(', ')}`);

const eredmenyek = [];
for (const nev of JATEKOS_NEVEK) {
  process.stdout.write(`  ${nev} …`);
  for (const seed of SEEDEK) {
    eredmenyek.push(futas(nev, JATEKOSOK[nev], seed, TICKEK));
    process.stdout.write('.');
  }
  process.stdout.write('\n');
}

const perStrat = (nev) => eredmenyek.filter((e) => e.strategia === nev);

// ── 1. STRATÉGIÁK EGYMÁS MELLETT ──────────────────────────────────────────
cim('1. STRATÉGIÁK — seedeken átlagolva');
tabla(
  ['stratégia', 'gyŐz', 'gyŐz.nap', 'korszak', 'csŐd', 'fejezet', 'pénz(vég)', 'vagyon(vég)', 'pénz(min)', 'hírnév', 'elég.%', 'düh%', 'utas(csúcs)', 'utas(átl)', 'kapu', 'épület', 'omlás', 'áram%'],
  JATEKOS_NEVEK.map((nev) => {
    const l = perStrat(nev);
    const gy = l.filter((e) => e.gyoztel);
    return [
      nev,
      `${gy.length}/${l.length}`,
      gy.length ? p1(atl(gy, (e) => e.gyozelemNap)) : '—',
      p1(atl(l, (e) => e.korszak)),
      `${l.filter((e) => e.veg === 'csod').length}/${l.length}`,
      p1(atl(l, (e) => e.fejezet + 1)),
      sz1(atl(l, (e) => e.penzVeg)),
      sz1(atl(l, (e) => e.vagyon)),
      sz1(atl(l, (e) => e.penzMin)),
      p1(atl(l, (e) => e.hirnevVeg)),
      szaz(atl(l, (e) => e.elegedettArany)),
      szaz(atl(l, (e) => e.duhosArany)),
      sz1(atl(l, (e) => e.utasCsucs)),
      sz1(atl(l, (e) => e.utasAtlag)),
      p1(atl(l, (e) => e.nyitottKapu)),
      p1(atl(l, (e) => e.epuletDb)),
      p1(atl(l, (e) => e.osszeomlas)),
      szaz(atl(l, (e) => e.aramszunetArany)),
    ];
  }),
);

const plafonos = eredmenyek.filter((e) => e.plafonArany > 0.01);
if (plafonos.length) {
  sor('');
  sor(`  ⚠️ MAX_UTAS (${MAX_UTAS}) PLAFON: ${plafonos.length} futás töltötte a tickek több mint 1 %-át a plafonon.`);
  for (const e of plafonos.slice(0, 12)) sor(`     ${e.strategia} / seed ${e.seed}: a tickek ${szaz(e.plafonArany)}-a, csúcs ${e.utasCsucs}`);
  sor('     Ezekben a futásokban a forgalom MESTERSÉGESEN le van vágva — a bevétel és');
  sor('     a sorhosszak alulbecsültek, a hangulat felülbecsült.');
} else {
  sor(`\n  A MAX_UTAS (${MAX_UTAS}) plafont egyetlen futás sem érte el érdemben — a mérés nincs levágva.`);
}

// ── 1b. A v0.4 HÁROM ÚJ ALRENDSZERE ───────────────────────────────────────
// Ez a tábla nem eredményt mér, hanem LEFEDETTSÉGET: tényleg használja-e a
// stratégia azt, amit használni akar. Ha egy oszlop végig nulla, akkor az
// alrendszer nem „gyengén szerepelt", hanem MÉRETLEN maradt — és a v0.4
// jelentése pont ezért nem tudott mondani róla semmit.
cim('1b. EMELET · BÉRBEADÁS · CSATORNA — használja-e egyáltalán?');
tabla(
  ['stratégia', 'épület össz.', 'ebből emeleten', 'átjáró', 'bérbe adva', 'bérlet-bevétel', 'csatorna db', 'csat. utas', 'csat. portáldíj', 'kapu utas', 'kapu portáldíj', 'kapuszint átl.'],
  JATEKOS_NEVEK.map((nev) => {
    const l = perStrat(nev);
    const epDb = (kod) => atl(l, (e) => { const x = e.epuletek.find((y) => y.kod === kod); return x ? x.db : 0; });
    return [
      nev,
      p1(atl(l, (e) => e.epuletDb)),
      p1(atl(l, (e) => e.emeletEpulet)),
      p1(epDb('lepcso') + epDb('teleportlift')),
      p1(atl(l, (e) => e.berbeadDb)),
      sz1(atl(l, (e) => e.berbeadBevetel)),
      p1(atl(l, (e) => e.csatornaDb)),
      sz1(atl(l, (e) => e.csatornaUtas)),
      sz1(atl(l, (e) => e.csatornaDij)),
      sz1(atl(l, (e) => e.kapuUtas)),
      sz1(atl(l, (e) => e.kapuDij)),
      p1(atl(l, (e) => e.kapuSzintAtlag)),
    ];
  }),
);

// ── 1c. TÉTELES BEVÉTEL ÉS KIADÁS ─────────────────────────────────────────
cim('1c. MIBŐL ÉL AZ ÁLLOMÁS — tételes bontás (seed-átlag, teljes futás)');
{
  const kodok = new Set();
  for (const e of eredmenyek) for (const [k] of e.tetelek) kodok.add(k);
  const lista = [...kodok];
  const ertek = (nev, k) => atl(perStrat(nev), (e) => { const t = e.tetelek.find((x) => x[0] === k); return t ? t[1] : 0; });
  tabla(['tétel', ...JATEKOS_NEVEK],
    lista.map((k) => [k, ...JATEKOS_NEVEK.map((nev) => sz1(ertek(nev, k)))])
      .sort((a, b) => Math.abs(Number(b[6])) - Math.abs(Number(a[6]))));
  sor('  (a negatív szám KIADÁS. A „bérlet" a bérbe adott üzletből ránk eső 42 %,');
  sor('   a „bérleti díj" a napi fix tétel — a kettő együtt a passzív ág teljes hozama.)');
}

// ── 2. PÉNZ IDŐSOR ────────────────────────────────────────────────────────
cim('2. PÉNZ ÉS HÍRNÉV IDŐBEN (seed-átlag)');
tabla(
  ['stratégia', 'nap5', 'nap10', 'nap20', 'nap30', 'nap50', 'hír5', 'hír10', 'hír20', 'hír30', 'hír50', 'neg.nap', 'csődközel'],
  JATEKOS_NEVEK.map((nev) => {
    const l = perStrat(nev);
    const m = (f) => { const v = l.map(f).filter((x) => x !== null); return v.length ? sz1(v.reduce((a, b) => a + b, 0) / v.length) : '—'; };
    const h = (f) => { const v = l.map(f).filter((x) => x !== null); return v.length ? p1(v.reduce((a, b) => a + b, 0) / v.length) : '—'; };
    return [nev, m((e) => e.penz5), m((e) => e.penz10), m((e) => e.penz20), m((e) => e.penz30), m((e) => e.penz50),
      h((e) => e.hirnev5), h((e) => e.hirnev10), h((e) => e.hirnev20), h((e) => e.hirnev30), h((e) => e.hirnev50),
      p1(atl(l, (e) => e.negativNapok)), p1(atl(l, (e) => e.csodkozeliNapok))];
  }),
);

// ── 3. SEEDENKÉNTI BONTÁS ─────────────────────────────────────────────────
cim('3. SEEDENKÉNT — ki nyer melyik világban? (fejezet / vég / pénz)');
tabla(
  ['seed', ...JATEKOS_NEVEK],
  SEEDEK.map((seed) => [
    seed,
    ...JATEKOS_NEVEK.map((nev) => {
      const e = eredmenyek.find((x) => x.strategia === nev && x.seed === seed);
      const jel = e.veg === 'csod' ? '✖' : e.gyoztel ? '★' : ' ';
      return `${e.fejezet + 1}.${jel} ${sz1(e.penzVeg)}`;
    }),
  ]),
);

// ── 4. SZŰK KERESZTMETSZETEK ──────────────────────────────────────────────
cim('4. SZŰK KERESZTMETSZETEK — sorhosszak (minden futás összesítve)');
{
  const agg = new Map();
  for (const e of eredmenyek) {
    for (const ep of e.epuletek) {
      let a = agg.get(ep.kod);
      if (!a) { a = { kod: ep.kod, sorMax: 0, sorAtlag: 0, db: 0 }; agg.set(ep.kod, a); }
      if (ep.sorMax > a.sorMax) a.sorMax = ep.sorMax;
      a.sorAtlag += ep.sorAtlag; a.db++;
    }
  }
  tabla(['épület', 'leghosszabb sor', 'átlagos sor'],
    [...agg.values()].filter((a) => a.sorMax > 0).sort((a, b) => b.sorAtlag / b.db - a.sorAtlag / a.db)
      .map((a) => [a.kod, a.sorMax, p1(a.sorAtlag / a.db)]));
}

cim('   HIÁBA KERESETT IGÉNYEK (hányszor nem volt meg — stratégiánként)');
{
  const kodok = new Set();
  for (const e of eredmenyek) for (const [k] of e.hianyok) kodok.add(k);
  const lista = [...kodok];
  tabla(['igény', ...JATEKOS_NEVEK],
    lista.map((k) => [
      IGENY_NEV.get(k) || k,
      ...JATEKOS_NEVEK.map((nev) => sz1(atl(perStrat(nev), (e) => { const h = e.hianyok.find((x) => x[0] === k); return h ? h[1] : 0; }))),
    ]).sort((a, b) => Number(b[b.length - 1]) - Number(a[a.length - 1])),
  );
}

// ── 5. ÉPÜLETEK JÖVEDELMEZŐSÉGE ───────────────────────────────────────────
cim('5. ÉPÜLETEK — bevétel / építési ár (minden futás összesítve)');
{
  const agg = new Map();
  for (const e of eredmenyek) {
    for (const ep of e.epuletek) {
      let a = agg.get(ep.kod);
      if (!a) { a = { kod: ep.kod, ar: ep.ar, bevetel: 0, db: 0, kiszolgalt: 0 }; agg.set(ep.kod, a); }
      a.bevetel += ep.bevetel; a.db += ep.db; a.kiszolgalt += ep.kiszolgalt;
    }
  }
  tabla(['épület', 'ár', 'példány', 'össz.bevétel', 'bevétel/példány', 'megtérülés (×ár)', 'kiszolgálás/példány'],
    [...agg.values()].sort((a, b) => (b.bevetel / (b.ar * b.db || 1)) - (a.bevetel / (a.ar * a.db || 1)))
      .map((a) => [a.kod, a.ar, a.db, sz1(a.bevetel), sz1(a.bevetel / a.db), p1(a.bevetel / (a.ar * a.db)), sz1(a.kiszolgalt / a.db)]));
  sor('  ⚠️ A 0 megtérülésű épületek (váró, hőforrás, info, takarító, karbantartó) NEM haszontalanok:');
  sor('     türelmet, hangulatot és kapustabilitást adnak — az a hasznuk máshol jelenik meg.');
}

// ── 6. DIMENZIÓK ──────────────────────────────────────────────────────────
cim('6. DIMENZIÓK — utas és portáldíj-bevétel (minden futás összesítve)');
{
  const agg = new Map();
  for (const e of eredmenyek) {
    for (const d of e.dimenziok) {
      let a = agg.get(d.kod);
      if (!a) { a = { kod: d.kod, utas: 0, bevetel: 0, nyitva: 0 }; agg.set(d.kod, a); }
      a.utas += d.osszUtas; a.bevetel += d.bevetel; if (d.nyitva) a.nyitva++;
    }
  }
  tabla(['dimenzió', 'alapdíj', 'nyitásár', 'futás nyitva', 'össz.utas', 'portáldíj', 'díj/utas'],
    DIMENZIOK.map((d) => {
      const a = agg.get(d.kod) || { utas: 0, bevetel: 0, nyitva: 0 };
      return [d.kod, d.dij, d.nyitasAr, `${a.nyitva}/${eredmenyek.length}`, sz1(a.utas), sz1(a.bevetel), a.utas ? p1(a.bevetel / a.utas) : '—'];
    }));
}

// ── 7. TECHNOLÓGIÁK ───────────────────────────────────────────────────────
cim('7. TECHNOLÓGIÁK — mikor készültek el (nap, seed-átlag)');
{
  tabla(['technológia', 'ár', ...JATEKOS_NEVEK.filter((n) => n !== 'nemtorodom')],
    TECHNOLOGIAK.map((tt) => [
      tt.kod, tt.ar,
      ...JATEKOS_NEVEK.filter((n) => n !== 'nemtorodom').map((nev) => {
        const l = perStrat(nev).map((e) => e.techek.find((x) => x.kod === tt.kod)).filter(Boolean);
        return l.length ? `${p1(atl(l, (x) => x.nap))} (${l.length})` : '—';
      }),
    ]));
}

// ══════════════════════════════════════════════════════════════════════════
//  KÜLÖN KÍSÉRLET: A DÍJSZORZÓ HATÁSA
// ══════════════════════════════════════════════════════════════════════════

let dijKiserlet = [];
if (!GYORS) {
  cim('8. DÍJSZORZÓ-KÍSÉRLET — ugyanaz a stratégia, más dim_dij');
  const szorzok = [0.5, 0.7, 0.85, 1.0, 1.15, 1.3, 1.5];
  const kSeedek = SEEDEK.slice(0, Math.min(4, SEEDEK.length));
  const kTick = Math.min(TICKEK, 36000);
  for (const sz of szorzok) {
    const l = [];
    for (const seed of kSeedek) l.push(futas(`dij_${sz}`, () => kiegyensulyozott({ dij: sz }), seed, kTick));
    dijKiserlet.push({
      szorzo: sz,
      penzVeg: atl(l, (e) => e.penzVeg),
      portaldij: atl(l, (e) => e.portaldij),
      szolgaltatas: atl(l, (e) => e.szolgaltatasBevetel),
      utas: atl(l, (e) => e.dimenziok.reduce((n, d) => n + d.osszUtas, 0)),
      hirnev: atl(l, (e) => e.hirnevVeg),
      fejezet: atl(l, (e) => e.fejezet + 1),
      elegedett: atl(l, (e) => e.elegedettArany),
    });
    process.stdout.write('.');
  }
  process.stdout.write('\n');
  tabla(['díjszorzó', 'érkezett utas', 'portáldíj', 'szolgáltatás-bev.', 'össz.bevétel', 'pénz(vég)', 'hírnév', 'fejezet', 'elég.%'],
    dijKiserlet.map((d) => [d.szorzo, sz1(d.utas), sz1(d.portaldij), sz1(d.szolgaltatas), sz1(d.portaldij + d.szolgaltatas),
      sz1(d.penzVeg), p1(d.hirnev), p1(d.fejezet), szaz(d.elegedett)]));
  sor(`  (${kSeedek.length} seed × ${kTick} tick, kiegyensúlyozott stratégia, minden kapun ugyanaz a szorzó)`);
}

// ══════════════════════════════════════════════════════════════════════════
//  KÜLÖN KÍSÉRLET: MELYIK TECHNOLÓGIA ÉR TÖBBET
// ══════════════════════════════════════════════════════════════════════════
//
// A „melyik technológia a legjövedelmezőbb" kérdésre a fő futásból NEM lehet
// válaszolni: ott mindegyik stratégia sorban kikutat mindent, tehát a hatások
// összekeverednek. Ezért külön ABLÁCIÓ fut: ugyanaz a stratégia, de csak EGY
// technológiát (és a hozzá kötelező előfeltételeket) kutatja ki, semmi mást.
// A viszonyítási alap a „semmit nem kutat" futás.
//
// ⚠️ A szám tehát a technológia + az ELŐFELTÉTELEI együttes hatása. A
// többlépcsős technológiák (legendás kapunyitás) így hátrányban vannak — ezt a
// jelentés is kimondja.

let techKiserlet = [];
if (!GYORS) {
  cim('9. TECHNOLÓGIA-ABLÁCIÓ — mit ér egyetlen technológia (+ előfeltételei)');
  const kSeedek = SEEDEK.slice(0, Math.min(4, SEEDEK.length));
  const kTick = Math.min(TICKEK, 30000);
  const meres = (kutatasSor) => {
    const l = [];
    for (const seed of kSeedek) l.push(futas('ablacio', () => kiegyensulyozott({ kutatas: kutatasSor }), seed, kTick));
    return {
      penz: atl(l, (e) => e.penzVeg),
      bevetel: atl(l, (e) => e.portaldij + e.szolgaltatasBevetel),
      utas: atl(l, (e) => e.dimenziok.reduce((n, d) => n + d.osszUtas, 0)),
      hirnev: atl(l, (e) => e.hirnevVeg),
      fejezet: atl(l, (e) => e.fejezet + 1),
    };
  };
  const alap = meres([]);
  process.stdout.write('.');
  for (const tt of TECHNOLOGIAK) {
    const sor2 = fuggosegiSor(tt.kod);
    const ossz = sor2.reduce((n, k) => n + TECHNOLOGIAK.find((x) => x.kod === k).ar, 0);
    const m = meres(sor2);
    techKiserlet.push({ kod: tt.kod, ar: tt.ar, teljesAr: ossz, lepcso: sor2.length, ...m,
      penzDelta: m.penz - alap.penz, bevetelDelta: m.bevetel - alap.bevetel });
    process.stdout.write('.');
  }
  process.stdout.write('\n');
  tabla(['technológia', 'saját ár', 'teljes ár', 'lépcső', 'pénz-Δ', 'bevétel-Δ', 'megtérült?'],
    techKiserlet.sort((a, b) => b.penzDelta - a.penzDelta).map((tt) => [
      tt.kod, tt.ar, tt.teljesAr, tt.lepcso, sz1(tt.penzDelta), sz1(tt.bevetelDelta),
      tt.penzDelta > 0 ? 'IGEN' : 'nem',
    ]));
  sor(`  viszonyítási alap (nulla kutatás): pénz ${sz1(alap.penz)} · bevétel ${sz1(alap.bevetel)} · fejezet ${p1(alap.fejezet)}`);
  sor(`  (${kSeedek.length} seed × ${kTick} tick)`);
  techKiserlet = techKiserlet.map((t2) => ({ ...t2, alapPenz: alap.penz, alapBevetel: alap.bevetel }));
}

// ══════════════════════════════════════════════════════════════════════════
//  HALÁLSPIRÁL ÉS FORDULÓPONT
// ══════════════════════════════════════════════════════════════════════════
//
// A „van-e olyan állapot, ahonnan nincs visszaút" kérdésre nem elég ránézni a
// képletekre: meg kell számolni, hányszor fordult elő a gödör, és hányszor
// jött ki belőle a stratégia. Ugyanez a fordulópontra: ha a 30. napi eredményt
// már az 5. nap eldönti, akkor a játék többi része díszlet.

cim('10. HALÁLSPIRÁL — kijön-e valaki a gödörből?');
const spiral = { hirnevGodor: 0, hirnevKijott: 0, penzGodor: 0, penzKijott: 0, reszletek: [] };
for (const e of eredmenyek) {
  const n = e.napiSor;
  const hi = n.findIndex((x) => x.hirnev < 20);
  if (hi >= 0) {
    spiral.hirnevGodor++;
    const kijott = n.slice(hi + 1).some((x) => x.hirnev > 40);
    if (kijott) spiral.hirnevKijott++;
    spiral.reszletek.push({ strategia: e.strategia, seed: e.seed, fajta: 'hirnev', nap: n[hi].nap, kijott });
  }
  const pi = n.findIndex((x) => x.penz < 0);
  if (pi >= 0) {
    spiral.penzGodor++;
    const kijott = n.slice(pi + 1).some((x) => x.penz > 5000);
    if (kijott) spiral.penzKijott++;
    spiral.reszletek.push({ strategia: e.strategia, seed: e.seed, fajta: 'penz', nap: n[pi].nap, kijott });
  }
}
sor(`  hírnév < 20 előfordult: ${spiral.hirnevGodor}/${eredmenyek.length} futásban — ebből 40 fölé jutott vissza: ${spiral.hirnevKijott}`);
sor(`  pénz  < 0  előfordult: ${spiral.penzGodor}/${eredmenyek.length} futásban — ebből 5000 fölé jutott vissza: ${spiral.penzKijott}`);
{
  const l = spiral.reszletek.filter((r) => r.fajta === 'hirnev');
  if (l.length) tabla(['stratégia', 'seed', 'első nap hírnév<20 alatt', 'visszajött 40 fölé?'],
    l.map((r) => [r.strategia, r.seed, r.nap, r.kijott ? 'IGEN' : 'NEM']));
}

cim('11. FORDULÓPONT — mennyire dönti el a korai állapot a végeredményt');
{
  const korr = (xs, ys) => {
    const n = xs.length;
    if (n < 3) return NaN;
    const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
    return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : NaN;
  };
  const napok = [3, 5, 8, 12, 16, 20, 30, 40];
  const rows = [];
  for (const nap of napok) {
    const l = eredmenyek.filter((e) => e.napiSor.some((x) => x.nap === nap));
    if (l.length < 3) continue;
    const penzN = l.map((e) => e.napiSor.find((x) => x.nap === nap).penz);
    const utasN = l.map((e) => e.napiSor.find((x) => x.nap === nap).utas);
    rows.push([nap, l.length,
      p1(korr(penzN, l.map((e) => e.penzVeg))),
      p1(korr(penzN, l.map((e) => e.fejezet))),
      p1(korr(utasN, l.map((e) => e.penzVeg))),
      p1(korr(utasN, l.map((e) => e.fejezet)))]);
  }
  tabla(['nap', 'futás', 'pénz→végpénz', 'pénz→fejezet', 'utas→végpénz', 'utas→fejezet'], rows);
  sor('  (Pearson-korreláció az összes futáson. 1,0 = a nap már eldöntötte a végét.)');
}

// ══════════════════════════════════════════════════════════════════════════
//  NEHÉZSÉGI FOKOZATOK
// ══════════════════════════════════════════════════════════════════════════
//
// A fokozat a `Sim` konstruktorának paramétere (a világ ÁLLAPOTA, nem
// beállítás), tehát csak így mérhető: ugyanaz a stratégia, ugyanazok a seedek,
// más fokozat. Két stratégia fut, mert egy nem elég: a `kiegyensulyozott` azt
// mutatja meg, hogy a JÓ játékos hol veszít, az `olcso` (tömeg-stratégia,
// alacsony díj, vékony tartalék) azt, hogy a fokozat mennyire bünteti a
// szűkösebb pénzügyi mozgásteret.
//
// Amit ki kell derülnie:
//   • a könnyű ne legyen unalmas — ha ott MINDENKI nyer, méghozzá korán, a
//     fokozat nem „segítség", hanem a játék kikapcsolása;
//   • a kemény ne legyen lehetetlen — ha ott SENKI nem nyer és mindenki
//     csődbe megy, az nem nehézség, hanem fal.

cim('12. NEHÉZSÉGI FOKOZATOK — ugyanaz a stratégia, ugyanazok a seedek');
const nehezsegMeres = [];
for (const nev of ['kiegyensulyozott', 'olcso']) {
  for (const n of NEHEZSEGEK) {
    const l = [];
    for (const seed of SEEDEK) l.push(futas(`${nev}@${n.kod}`, JATEKOSOK[nev], seed, TICKEK, n.kod));
    nehezsegMeres.push({ strategia: nev, nehezseg: n.kod, futasok: l });
    process.stdout.write('.');
  }
}
process.stdout.write('\n');
tabla(
  ['stratégia', 'fokozat', 'győz', 'csőd', 'győzelem napja', 'korszak', 'fejezet', 'pénz(vég)', 'vagyon', 'pénz(min)', 'hírnév', 'elég.%', 'düh%', 'utas(átl)', 'omlás', 'neg.nap'],
  nehezsegMeres.map((m) => {
    const l = m.futasok;
    const gy = l.filter((e) => e.gyoztel);
    return [
      m.strategia, m.nehezseg,
      `${gy.length}/${l.length}`,
      `${l.filter((e) => e.veg === 'csod').length}/${l.length}`,
      gy.length ? p1(atl(gy, (e) => e.gyozelemNap)) : '—',
      p1(atl(l, (e) => e.korszak)),
      p1(atl(l, (e) => e.fejezet + 1)),
      sz1(atl(l, (e) => e.penzVeg)),
      sz1(atl(l, (e) => e.vagyon)),
      sz1(atl(l, (e) => e.penzMin)),
      p1(atl(l, (e) => e.hirnevVeg)),
      szaz(atl(l, (e) => e.elegedettArany)),
      szaz(atl(l, (e) => e.duhosArany)),
      sz1(atl(l, (e) => e.utasAtlag)),
      p1(atl(l, (e) => e.osszeomlas)),
      p1(atl(l, (e) => e.negativNapok)),
    ];
  }),
);
sor('  A fokozat-szorzók (config.js → NEHEZSEGEK):');
for (const n of NEHEZSEGEK) {
  sor(`    ${n.kod.padEnd(7)} pénz×${n.penz} · bér×${n.ber} · instabil×${n.instabil} · érkezés×${n.erkezes} · esemény×${n.esemeny}`);
}

// ══════════════════════════════════════════════════════════════════════════
//  ÁG-ABLÁCIÓ: MEGÉRI-E AZ EMELET, A BÉRBEADÁS, A CSATORNA?
// ══════════════════════════════════════════════════════════════════════════
//
// ⚠️ EZT A KÉRDÉST A STRATÉGIÁK ÖSSZEHASONLÍTÁSA NEM TUDJA MEGVÁLASZOLNI.
// Az `emeletes` és a `kiegyensulyozott` húsz számban különbözik; ha az egyik
// jobb, abból nem következik, hogy az EMELET a jó. Itt ezért ugyanaz a
// stratégia fut, és pontosan EGY ág kapcsolódik hozzá. A viszonyítás a
// „semmi extra" futás.
//
// Ugyanaz a korlát, mint a technológia-ablációnál: a léghajó ága magával
// hozza az emeleti padló árát is (a kikötő csak emeleten áll meg), tehát az ő
// száma a kettő EGYÜTTES hatása — ezt a jelentés is kimondja.

const AG_EMELET_TERV = [
  ['varo', (s, f) => 1 + Math.floor(f / 140)],
  ['bolt', (s, f) => 1 + Math.floor(f / 90)],
  ['konyvesbolt', (s, f) => 1 + Math.floor(f / 180)],
  ['wc', (s, f) => Math.floor(f / 160)],
  ['etterem', (s, f) => Math.floor(f / 160)],
];

let agKiserlet = [];
if (!GYORS) {
  cim('13. ÁG-ABLÁCIÓ — ugyanaz a stratégia, egyetlen ág be- vagy kikapcsolva');
  // 6 seed, nem 4: az első futásban a szórás elnyomta a hatást — a nettó
  // vagyont az döntötte el, hogy az adott seedben megnyílt-e a Sárkánytrónus
  // (utasonként 397 tallér), nem az, hogy be volt-e kapcsolva az ág.
  const kSeedek = SEEDEK.slice(0, Math.min(6, SEEDEK.length));
  const kTick = Math.min(TICKEK, 36000);
  // Az űrkapu `kapu_szkenner`-hez kötött, azt viszont a kiegyensúlyozott
  // 12. helyen kutatja — 30 nap alatt oda sem ér. Ezért kap SAJÁT
  // viszonyítási alapot: ugyanaz a stratégia, ugyanúgy előrevett szkennerrel,
  // csak űrkapu nélkül. Enélkül a szkenner ára az űrkapu számlájára menne.
  const KORAI_SZKENNER = [
    'kapu_hangolas', 'stabil_kapuk', 'kapu_szkenner', 'gyors_sorok',
    'fejlett_boltok', 'kristaly_takarek', 'energia_halo', 'takaritorobot',
    'auto_poggyasz', 'vip_ellatas', 'gyogyaszat', 'ido_kotes', 'legendas_kapu',
  ];
  const agak = [
    ['alap (semmi extra)', {}, 0],
    ['+ emelet (3 blokk + üzletek)', { emelet: true, emeletBlokk: 3, emeletTerv: AG_EMELET_TERV }, 0],
    ['+ bérbeadás (mindent)', { berbead: () => true }, 0],
    // A mosdónak és a seprűparkolónak NINCS személyzete: ott a bérbeadás
    // 58 %-ot ad oda a semmiért. Ez a sor azt méri, mennyit ér a válogatás.
    ['+ bérbeadás (csak személyzetes)', { berbead: (k) => epuletTipus(k).szemelyzet > 0 }, 0],
    ['+ vasútállomás', { csatorna: ['vasut'] }, 0],
    ['+ léghajó (emelettel)', { emelet: true, emeletBlokk: 2, csatorna: ['leghajo'] }, 0],
    ['mind együtt', {
      emelet: true, emeletBlokk: 3, emeletTerv: AG_EMELET_TERV,
      berbead: () => true, csatorna: ['vasut', 'leghajo', 'urkapu'],
      kutatas: KORAI_SZKENNER,
    }, 7],
    ['alap, korai szkenner (kontroll)', { kutatas: KORAI_SZKENNER }, 7],
    ['+ űrkapu (korai szkennerrel)', { csatorna: ['urkapu'], kutatas: KORAI_SZKENNER }, 7],
  ];
  for (const [cimke, opciok, alapIdx] of agak) {
    const l = [];
    for (const seed of kSeedek) l.push(futas('ag', () => kiegyensulyozott(opciok), seed, kTick));
    agKiserlet.push({
      cimke,
      alapIdx,
      vagyon: atl(l, (e) => e.vagyon),
      eszkoz: atl(l, (e) => e.eszkozErtek),
      napiVeg: atl(l, (e) => e.napiBevetelVeg),
      penz: atl(l, (e) => e.penzVeg),
      bevetel: atl(l, (e) => e.osszBevetel),
      koltseg: atl(l, (e) => e.osszKoltseg),
      utas: atl(l, (e) => e.kapuUtas + e.csatornaUtas),
      hirnev: atl(l, (e) => e.hirnevVeg),
      elegedett: atl(l, (e) => e.elegedettArany),
      fejezet: atl(l, (e) => e.fejezet + 1),
      gyozelem: l.filter((e) => e.gyoztel).length,
      korszak: atl(l, (e) => e.korszak),
      epulet: atl(l, (e) => e.epuletDb),
      emeletEpulet: atl(l, (e) => e.emeletEpulet),
      berbeadDb: atl(l, (e) => e.berbeadDb),
      csatornaUtas: atl(l, (e) => e.csatornaUtas),
      dolgozo: atl(l, (e) => e.dolgozoDb),
    });
    process.stdout.write('.');
  }
  process.stdout.write('\n');
  tabla(['ág', 'nettó vagyon', 'vagyon-Δ', 'ebből eszköz', 'napi bev. (vég)', 'napi bev.-Δ', 'győz', 'korszak', 'utas', 'épület', 'emeleten', 'bérelt', 'dolgozó', 'hírnév', 'elég.%', 'megérte?'],
    agKiserlet.map((a) => {
      const b = agKiserlet[a.alapIdx];
      return [
        a.cimke, sz1(a.vagyon), a === b ? '—' : sz1(a.vagyon - b.vagyon), sz1(a.eszkoz),
        sz1(a.napiVeg), a === b ? '—' : sz1(a.napiVeg - b.napiVeg),
        `${a.gyozelem}/${kSeedek.length}`, p1(a.korszak), sz1(a.utas),
        p1(a.epulet), p1(a.emeletEpulet), p1(a.berbeadDb), p1(a.dolgozo), p1(a.hirnev), szaz(a.elegedett),
        a === b ? 'alap' : (a.vagyon > b.vagyon ? 'IGEN' : 'nem'),
      ];
    }));
  sor(`  (${kSeedek.length} seed × ${kTick} tick, kiegyensúlyozott stratégia, normál nehézség)`);
  sor('  NETTÓ VAGYON = készpénz + a felépített épületek katalógus-ára. A puszta készpénz');
  sor('  növekedési szakaszban félrevezet: aki beépíti a pénzét, attól szegényebbnek látszik.');
  sor('  ⚠️ A léghajó sora az EMELETI PADLÓ árát is viseli — a kikötő csak emeleten épülhet.');
  sor('  ⚠️ Az űrkapu sorának SAJÁT alapja van (korai szkenner), mert a `kapu_szkenner`');
  sor('     kutatás nélkül meg sem építhető — az ő ára nem az űrkapué.');
}

// ══════════════════════════════════════════════════════════════════════════
//  GÉPI KIMENET
// ══════════════════════════════════════════════════════════════════════════

const ki = {
  keszult: 'egyensuly.mjs',
  tickek: TICKEK,
  napok: Math.round(TICKEK / NAP_TICK),
  seedek: SEEDEK,
  kezdoPenz: KEZDO_PENZ,
  maxUtas: MAX_UTAS,
  strategiak: JATEKOS_NEVEK,
  futasok: eredmenyek,
  dijKiserlet,
  techKiserlet,
  agKiserlet,
  nehezsegek: NEHEZSEGEK.map((n) => ({ ...n })),
  nehezsegMeres: nehezsegMeres.map((m) => ({
    strategia: m.strategia,
    nehezseg: m.nehezseg,
    futasok: m.futasok.map((e) => ({ ...e, napiSor: undefined })),
  })),
  spiral,
};
mkdirSync(join(GYOKER, 'qa'), { recursive: true });
writeFileSync(join(GYOKER, 'qa', 'egyensuly.json'), JSON.stringify(ki, null, 1));
console.log(`\n  → portal/qa/egyensuly.json (${eredmenyek.length} fő + ${nehezsegMeres.reduce((n, m) => n + m.futasok.length, 0)} nehézség- + ${agKiserlet.length} ág- + ${dijKiserlet.length} díj- + ${techKiserlet.length} technológia-mérés)\n`);
