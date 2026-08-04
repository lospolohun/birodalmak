// PORTAL HUB TYCOON — TANÁCSADÓ.
//
// ── MIÉRT VAN EZ A FÁJL ───────────────────────────────────────────────────
// Egy tycoon legnehezebb pillanata nem az, amikor valami elromlik, hanem
// amikor MINDEN LASSAN romlik, és nem derül ki, miért. A hírnév csúszik, a
// pénz fogy, és a képernyőn húsz szám van, amiből tizenkilenc rendben van.
//
// Ez a modul azt mondja meg, amit a MÉRÉS mondott meg nekünk fejlesztés
// közben. Minden szabály mögött egy konkrét eset áll, amit a gépi
// végigjátszásokon láttunk:
//
//   • a bot 115 épülettel is 25-ös hírnéven állt — 126 fős sor a VÁMNÁL,
//   • egy állomás tartósan áramszünetben ült, és minden 40 %-on ment,
//   • a kapuk összeomlottak, mert soha senki nem épített karbantartót,
//   • a személyzet nélküli épület rosszabb, mint a semmi.
//
// ── AMI NEM TARTOZIK IDE ──────────────────────────────────────────────────
// A tanácsadó NEM játszik helyetted, és nem mond véleményt a stratégiádról.
// Csak olyat mond, ami MÉRHETŐ és amire VAN válaszlépés. Ha egy tanács nem
// fogalmazható meg „építs X-et" / „vegyél fel Y-t" alakban, akkor nem tanács,
// hanem zaj — és a zajos tanácsadót két perc alatt megtanulja az ember
// figyelmen kívül hagyni. Épp azt veszítenénk el, amiért készült.

import { EPULETEK, IGENYEK } from '../sim/epuletek.js';
import { DIMENZIOK } from '../sim/dimenziok.js';

/** @typedef {{ sulyossag: 'baj'|'gond'|'jo', ikon: string, cim: string, szoveg: string }} Tanacs */

/**
 * A legfontosabb tanácsok, sorrendben.
 * @param {import('../sim/sim.js').Sim} sim
 * @param {number} [max]
 * @returns {Tanacs[]}
 */
export function tanacsok(sim, max = 6) {
  const ki = [];
  const ep = sim.epuletek;

  // ── 1. ÁRAMSZÜNET — a legalattomosabb, mert nem hibaüzenet ─────────────
  if (sim.aramszunet) {
    ki.push({
      sulyossag: 'baj', ikon: '⚡', cim: 'Áramszünet',
      szoveg: `A fogyasztás (${sim.energiaIgeny}) meghaladja a termelést (${sim.energiaTermeles}). ` +
        'Minden szolgáltatás 40 %-on megy — ez nem üzenetben jelentkezik, csak abban, hogy minden rosszabb. Építs energiamagot.',
    });
  }

  // ── 2. SZEMÉLYZET NÉLKÜLI ÉPÜLETEK ────────────────────────────────────
  const ures = [];
  for (let a = 0; a < ep.length; a++) {
    const e = ep[a];
    if (!e || e.berbeadva || e.kikapcsolva) continue;
    const t = EPULETEK[e.tipusIdx];
    if (t.szemelyzet > 0 && e.dolgozok.length === 0) ures.push(t.nev);
  }
  if (ures.length > 0) {
    ki.push({
      sulyossag: 'baj', ikon: '👷', cim: `${ures.length} épület személyzet nélkül`,
      szoveg: `${ures.slice(0, 3).join(', ')}${ures.length > 3 ? ' és mások' : ''} 15 %-on üzemel. ` +
        'A személyzet nélküli épület rosszabb, mint a semmi: helyet foglal, energiát eszik, és sorba állítja a vendégeket.',
    });
  }

  // ── 3. SZŰK KERESZTMETSZET — a leghosszabb sor ─────────────────────────
  let leghosszabb = null;
  for (let a = 0; a < ep.length; a++) {
    const e = ep[a];
    if (!e || !EPULETEK[e.tipusIdx].igeny) continue;
    if (!leghosszabb || e.sor.length > leghosszabb.sor.length) leghosszabb = e;
  }
  if (leghosszabb && leghosszabb.sor.length >= 12) {
    const t = EPULETEK[leghosszabb.tipusIdx];
    ki.push({
      sulyossag: leghosszabb.sor.length >= 40 ? 'baj' : 'gond', ikon: t.ikon,
      cim: `${leghosszabb.sor.length} fős sor: ${t.nev}`,
      szoveg: `Ez a szűk keresztmetszeted. Egy második ${t.nev.toLowerCase()} többet ér, mint bármi új — ` +
        'a sorban álló vendég hangulata háromszor olyan gyorsan romlik, mint a sétálóé.',
    });
  }

  // ── 4. INSTABIL KAPU ───────────────────────────────────────────────────
  let legrosszabbKapu = null;
  for (let i = 0; i < sim.dimenziok.length; i++) {
    const d = sim.dimenziok[i];
    if (!d.nyitva || DIMENZIOK[i].csatorna) continue;
    if (!legrosszabbKapu || d.instabilitas > legrosszabbKapu.instabilitas) legrosszabbKapu = d;
  }
  if (legrosszabbKapu && legrosszabbKapu.instabilitas > 550) {
    const szazalek = Math.round(legrosszabbKapu.instabilitas / 10);
    const vanKarbantarto = sim.mukodoEpuletVan('karbantarto') && sim.dolgozoSzamTipus('mernok') > 0;
    ki.push({
      sulyossag: szazalek > 80 ? 'baj' : 'gond', ikon: '🌀',
      cim: `${DIMENZIOK[legrosszabbKapu.idx].nev}: ${szazalek} % instabilitás`,
      szoveg: vanKarbantarto
        ? 'A karbantartód nem győzi. Több mérnök vagy még egy karbantartó műhely kell — 100 %-nál a kapu összeomlik.'
        : 'Nincs működő portálkarbantartód mérnökkel. 100 %-nál a kapu összeomlik, ami pénzbe és hírnévbe kerül.',
    });
  }

  // ── 5. HIÁNYZÓ SZOLGÁLTATÁS ────────────────────────────────────────────
  let hianyKod = null, hianyDb = 0;
  for (const [kod, db] of sim.hianyok) {
    if (db > hianyDb) { hianyDb = db; hianyKod = kod; }
  }
  if (hianyKod && hianyDb >= 25) {
    const nev = (IGENYEK.find((x) => x.kod === hianyKod) || {}).nev || hianyKod;
    ki.push({
      sulyossag: 'gond', ikon: '❓', cim: `${hianyDb}× hiába keresték: ${nev}`,
      szoveg: 'Ennyiszer indult el valaki egy szolgáltatásért, amit nem talált meg. Minden ilyen csalódás hangulatot visz.',
    });
  }

  // ── 6. KOSZ ────────────────────────────────────────────────────────────
  if (sim.kosz > 380) {
    const koboldok = sim.dolgozoSzamTipus('kobold');
    ki.push({
      sulyossag: sim.kosz > 620 ? 'baj' : 'gond', ikon: '🧹',
      cim: `Tisztaság: ${Math.round(100 - sim.kosz / 10)} %`,
      szoveg: koboldok === 0
        ? 'Nincs egyetlen takarító koboldod sem. A kosz lassan öl: senki nem panaszkodik rá, mindenki utálja.'
        : `${koboldok} takarítód van, és kevés. A kosz ott gyűlik, ahol a tömeg áll.`,
    });
  }

  // ── 7. PÉNZÜGYI VÉSZJELZÉS ─────────────────────────────────────────────
  const e = sim.elozoNap;
  if (sim.penz < 0) {
    ki.push({
      sulyossag: 'baj', ikon: '💸', cim: 'Mínuszban vagy',
      szoveg: `−6 000 alatt a Tanács átveszi az állomást. Bocsáss el tétlen dolgozókat, adj bérbe egy üzletet, ` +
        'vagy kapcsolj ki egy energiafaló épületet.',
    });
  } else if (e && e.bevetel > 0 && e.koltseg > e.bevetel) {
    ki.push({
      sulyossag: 'gond', ikon: '📉', cim: 'Tegnap veszteséges volt a nap',
      szoveg: `Bevétel ${Math.round(e.bevetel)}, költség ${Math.round(e.koltseg)}. A bérek és az üzemeltetés akkor is mennek, ` +
        'ha nincs forgalom — a Statisztika panel tételesen megmutatja, mi viszi el.',
    });
  }

  // ── 7/b. A HÍRNÉV-GÖDÖR — az egyetlen állapot, amiből MÉRVE nincs kiút ──
  //
  // Ez a szabály másképp működik, mint a többi: nem építeni mond, hanem
  // VISSZAVENNI. Mérve, 80 futás: 18-ban esett a hírnév 20 alá, és onnan
  // EGYETLENEGY sem jött vissza 40 fölé — köztük a `bevetel_maximalizalo`
  // két futása, ami 68 épülettel egyáltalán nem volt hanyag játék.
  //
  // Az ok nem pénzhiány (a pénz-gödörből 41/41 kilábalt), hanem hurok: a
  // hírnév a TÁVOZÓK hangulatából épül, tehát amíg többen távoznak dühösen,
  // mint elégedetten, addig minden új vendég MÉLYÍTI a gödröt. Aki ilyenkor
  // épít, az még több vendéget hív be ugyanabba a sorba. A kiút a
  // forgalom átmeneti visszafogása — díjemelés vagy egy kapu bezárása —,
  // amíg a meglévő kapacitás utoléri magát.
  if (sim.hirnev < 25 && sim.osszTavozo > 60 && sim.duhosTavozok > sim.elegedettTavozok) {
    ki.push({
      sulyossag: 'baj', ikon: '🕳️', cim: 'Hírnév-gödörben vagy — ne építs, VEGYÉL VISSZA',
      szoveg: `${Math.round(sim.hirnev)}-ös hírnév, és a vendégek többsége dühösen távozik. Több épület most ` +
        'NEM segít: még több vendéget hív ugyanabba a sorba, és mélyíti a gödröt. Emeld meg a kapudíjakat ' +
        'vagy zárj be átmenetileg egy kaput — kevesebb vendég, rövidebb sor, elégedettebb távozók. Ha a ' +
        'hírnév fölfelé indult, engedheted vissza a forgalmat.',
    });
  }

  // ── 8. HA MINDEN RENDBEN ───────────────────────────────────────────────
  if (ki.length === 0) {
    ki.push({
      sulyossag: 'jo', ikon: '✅', cim: 'Nincs sürgős tennivaló',
      szoveg: sim.hirnev > 80
        ? 'Az állomás jól megy. Ilyenkor érdemes terjeszkedni: új kapu, emelet vagy kutatás.'
        : 'Nincs égő probléma. A hírnév a kapacitáson múlik — több szolgáltatás, rövidebb sorok.',
    });
  }

  return ki.slice(0, max);
}
