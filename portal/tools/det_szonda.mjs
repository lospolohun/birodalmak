// PORTAL HUB TYCOON — DETERMINIZMUS-SZONDA.
//
// ── MIÉRT VAN EZ AZ ESZKÖZ ────────────────────────────────────────────────
// Ez a projekt legfontosabb kapuja, és az egyetlen, ami a felhőben is
// teljes értékű (tiszta node, nem kell GPU). Hat vizsgálatot futtat:
//
//   1. STATIKUS — tiltott hívások a sim alatt (Math.random, Math.sin, …)
//   2. ISMÉTELHETŐSÉG — ugyanaz a seed kétszer: bitre ugyanaz az állapot
//   3. ÉRZÉKENYSÉG — más seed: MÁS állapot (a mérőeszköz nem konstans)
//   4. SEBESSÉG — ms/tick terhelés alatt
//   5. VISSZAJÁTSZÁS — a parancsnaplóból újrajátszva ugyanaz jön ki
//   6. MŰKÖDÉS — csinál-e egyáltalán valamit a gazdaság
//   7. SZINTEK — a többszintes állomás minden ága lefut-e, és HASZNÁLJÁK-e
//   8. GAZDASÁGI DÖNTÉSEK — bérbeadás és nehézségi fokozat
//   9. CSATORNÁK — vasút, léghajó, űrkapu: megépülnek-e és hoznak-e utast
//  10. VÉGIGJÁTSZÁS — a hét fejezet végigmegy-e, és él-e a végtelen mód
//
// ⚠️ A 6. VIZSGÁLAT NEM DÍSZ. A determinizmus-kapu nem működés-kapu: a
// semmittevés is tökéletesen reprodukálható. Az AoC-nál a v0.3 mind a hat
// vizsgálaton átment, miközben 400 munkásból 285 beragadt. Itt is előfordult:
// egy korábbi változatban az állomás TARTÓS áramszünetben ült, minden épület
// 40 %-on ment, a hírnév spirálba került — és a determinizmus közben hibátlan
// volt. Ha új alrendszert írsz, kérdezd meg: mi az a szám, ami elárulja, hogy
// tényleg CSINÁL is valamit?
//
// ⚠️ HA BUKIK, NE A SZONDÁT ÍRD ÁT.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Sim } from '../src/sim/sim.js';
import { v01Uj, v02Uj, v03Uj, v04Uj, v05Uj } from './forgatokonyv.mjs';
import { vegtelenCel, rang } from '../src/sim/tortenet.js';

const GYOKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const TICKEK = Number(process.env.PHT_TICK || 24000);
const MINTA = 1000;

let hiba = 0;
const cim = (s) => console.log(`\n\x1b[1m${s}\x1b[0m`);
const ok = (s) => console.log(`  \x1b[32m✓\x1b[0m ${s}`);
const rossz = (s) => { console.log(`  \x1b[31m✗ ${s}\x1b[0m`); hiba++; };
const info = (s) => console.log(`    ${s}`);

// ══════════════════════════════════════════════════════════════════════════
//  1. STATIKUS ELLENŐRZÉS
// ══════════════════════════════════════════════════════════════════════════

const TILTOTT = [
  { re: /\bMath\.random\b/, mit: 'Math.random (helyette: mag/rng.js)' },
  { re: /\bMath\.(sin|cos|tan|asin|acos|atan2?|exp|log2?|pow|hypot|cbrt)\b/, mit: 'transzcendens Math-függvény (helyette: mag/fx.js)' },
  { re: /\bDate\.now\b/, mit: 'Date.now (a sim csak tick-számot ismer)' },
  { re: /\bperformance\.now\b/, mit: 'performance.now' },
  { re: /\bnew Date\b/, mit: 'new Date' },
  { re: /from\s+['"]three['"]/, mit: 'three import (a sim nem tud a képernyőről)' },
  { re: /\b(document|window)\./, mit: 'DOM-hozzáférés' },
  { re: /\bfor\s*\(\s*(?:const|let|var)\s+\w+\s+in\s+/, mit: 'for…in (sorrendfüggő bejárás)' },
  { re: /\bObject\.keys\s*\(/, mit: 'Object.keys (sorrendfüggő bejárás)' },
];

function fajlok(dir) {
  const ki = [];
  for (const n of readdirSync(dir).sort()) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) ki.push(...fajlok(p));
    else if (n.endsWith('.js')) ki.push(p);
  }
  return ki;
}

cim('1. STATIKUS — tiltott hívások a szimulációban');
{
  const cel = [...fajlok(join(GYOKER, 'src/sim')), ...fajlok(join(GYOKER, 'src/mag'))];
  let talalat = 0;
  for (const f of cel) {
    const rovid = relative(GYOKER, f);
    // A `mag/fx.js` MAGA a helyettesítés: ott a `Math.sqrt`/`Math.floor`
    // szabad, és a fejlécében fel is sorolja a tiltottakat — a kommentben
    // szereplő nevekre nem szabad ráugrani.
    const forras = readFileSync(f, 'utf8')
      .split('\n')
      .map((sor) => (sor.trim().startsWith('//') || sor.trim().startsWith('*') || sor.trim().startsWith('/*') ? '' : sor));
    for (let i = 0; i < forras.length; i++) {
      for (const t of TILTOTT) {
        if (t.re.test(forras[i])) { rossz(`${rovid}:${i + 1} — ${t.mit}`); talalat++; }
      }
    }
  }
  if (talalat === 0) ok(`${cel.length} fájl tiszta`);
}

// ══════════════════════════════════════════════════════════════════════════
//  SEGÉD: egy teljes futás
// ══════════════════════════════════════════════════════════════════════════

function futas(seed, tickek = TICKEK, gyujtNaplot = false, fkGyar = v01Uj, nehezseg = 'normal') {
  const sim = new Sim({ seed, nehezseg });
  const fk = fkGyar();
  const minta = [];
  for (let t = 0; t < tickek; t++) {
    fk(sim, t);
    sim.lep();
    if (sim.tick % MINTA === 0) minta.push(sim.ellenorzoOsszeg());
  }
  // ⚠️ A ZÁRÓ ÖSSZEGET ITT KELL ELTENNI, nem később. A 4. vizsgálat tovább
  // lépteti ezt a simet, tehát a `sim.ellenorzoOsszeg()` később MÁST ad — az
  // első változatban emiatt bukott a visszajátszás, holott az volt a helyes.
  return { sim, minta, zaro: sim.ellenorzoOsszeg(), napló: gyujtNaplot ? sim.napló.slice() : null };
}

// ══════════════════════════════════════════════════════════════════════════
//  2. ISMÉTELHETŐSÉG
// ══════════════════════════════════════════════════════════════════════════

cim('2. ISMÉTELHETŐSÉG — ugyanaz a seed kétszer');
const A = futas(31337, TICKEK, true);
const B = futas(31337);
{
  let elso = -1;
  for (let i = 0; i < A.minta.length; i++) {
    if (A.minta[i] !== B.minta[i]) { elso = i; break; }
  }
  if (elso < 0) ok(`${TICKEK} tick, ${A.minta.length} mintavétel — minden összeg egyezik`);
  else rossz(`szétcsúszás a ${elso * MINTA}. ticknél: ${A.minta[elso]} ≠ ${B.minta[elso]}`);
  info(`záró összeg: ${A.zaro}`);
}

// ══════════════════════════════════════════════════════════════════════════
//  3. ÉRZÉKENYSÉG
// ══════════════════════════════════════════════════════════════════════════

cim('3. ÉRZÉKENYSÉG — más seed, más világ');
{
  const C = futas(90210, 6000);
  const D = futas(31337, 6000);
  if (C.zaro !== D.zaro) ok('a két seed külön világot ad');
  else rossz('KÉT KÜLÖNBÖZŐ SEED UGYANAZT ADTA — az összeg nem méri a világot');
}

// ══════════════════════════════════════════════════════════════════════════
//  4. SEBESSÉG
// ══════════════════════════════════════════════════════════════════════════

cim('4. SEBESSÉG — ms/tick terhelés alatt');
{
  const sim = A.sim;
  const fk = v01Uj();
  const t0 = process.hrtime.bigint();
  const N = 2000;
  for (let t = 0; t < N; t++) { fk(sim, TICKEK + t); sim.lep(); }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / N;
  ok(`${ms.toFixed(3)} ms/tick — ${sim.utasSzam} utas, ${sim.epuletek.filter(Boolean).length} épület`);
  info('⚠️ EZ A SZÁM KÉT FUTÁS KÖZÖTT NEM ÖSSZEHASONLÍTHATÓ: a felhő-gép');
  info('   osztott CPU-n fut. A/B-t egy munkameneten belül mérj (git stash).');
  if (ms > 8) rossz(`${ms.toFixed(2)} ms/tick — 20 Hz-en ez a képkocka-idő 16 %-a fölött van`);
}

// ══════════════════════════════════════════════════════════════════════════
//  5. VISSZAJÁTSZÁS — a mentés valójában a parancsnapló
// ══════════════════════════════════════════════════════════════════════════

cim('5. VISSZAJÁTSZÁS — seed + parancsnapló = ugyanaz a világ');
{
  const naplo = A.napló;
  const sim = new Sim({ seed: 31337 });
  let n = 0;
  for (let t = 0; t < TICKEK; t++) {
    while (n < naplo.length && naplo[n].tick === t) { sim.parancs(naplo[n].p); n++; }
    sim.lep();
  }
  if (sim.ellenorzoOsszeg() === A.zaro) {
    ok(`${naplo.length} parancs visszajátszva — azonos végállapot`);
  } else {
    rossz(`a visszajátszás mást adott: ${sim.ellenorzoOsszeg()} ≠ ${A.zaro}`);
  }
}

// ══════════════════════════════════════════════════════════════════════════
//  6. MŰKÖDÉS — csinál-e egyáltalán valamit
// ══════════════════════════════════════════════════════════════════════════

cim('6. MŰKÖDÉS — a zöld determinizmus nem elég');
{
  const s = A.sim;
  const k = s.kivonat();
  info(`nap ${k.nap} · pénz ${k.penz} · hírnév ${k.hirnev} · utas ${k.utas} (csúcs ${k.csucs})`);
  info(`távozó ${k.tavozo} (elégedett ${k.elegedett}, dühös ${k.duhos}) · kapu ${k.nyitottKapu} · fejezet ${k.fejezet}`);

  const varosok = [
    ['érkeztek utasok', k.tavozo > 100],
    ['az utasok többsége elégedetten távozott', k.elegedett > k.duhos],
    ['a szolgáltatások kiszolgáltak', s.epuletek.some((e) => e && e.kiszolgalt > 50)],
    ['a gazdaság termelt bevételt', s.epuletek.some((e) => e && e.bevetel > 500)],
    ['több kapu nyílt meg', k.nyitottKapu >= 2],
    ['a történet haladt', k.fejezet >= 2],
    ['futott kutatás', s.keszTechek.size >= 2],
    ['történtek események', s.naplok.some((n) => n.szoveg.startsWith('ESEMÉNY'))],
    ['nem ült tartós áramszünetben', !s.aramszunet],
    ['nem ment csődbe', s.jatekVege !== 'csod'],
  ];
  for (const [nev, all] of varosok) {
    if (all) ok(nev); else rossz(`NEM teljesült: ${nev}`);
  }

  // Beragadás-ellenőrzés: hány utas nem mozdult az utolsó 200 tickben.
  const elozo = s.utasok.filter((u) => u.aktiv).map((u) => ({ u, x: u.x, y: u.y, a: u.allapot }));
  const fk = v01Uj();
  for (let t = 0; t < 200; t++) { fk(s, TICKEK + 2000 + t); s.lep(); }
  let beragadt = 0;
  for (const e of elozo) {
    if (!e.u.aktiv) continue;
    if (e.u.allapot === 4 || e.u.allapot === 3) continue; // kiszolgálás/sor: állnia KELL
    const d = Math.abs(e.u.x - e.x) + Math.abs(e.u.y - e.y);
    if (d < 0.05) beragadt++;
  }
  const mozgo = elozo.filter((e) => e.u.aktiv && e.u.allapot !== 4 && e.u.allapot !== 3).length;
  if (mozgo === 0) rossz('senki nem volt úton — nincs mit mérni a beragadáson');
  else if (beragadt / mozgo > 0.15) rossz(`a mozgásban lévők ${Math.round(beragadt / mozgo * 100)} %-a beragadt (${beragadt}/${mozgo})`);
  else ok(`beragadás: ${beragadt}/${mozgo} mozgásban lévő utas (${Math.round(beragadt / mozgo * 100)} %)`);
}

// ══════════════════════════════════════════════════════════════════════════
//  7. SZINTEK — a v0.3 új felülete
// ══════════════════════════════════════════════════════════════════════════
//
// Külön vizsgálat, mert a szintek ÚJ parancsmezőt (`z`) és két új épületet
// hoztak. Ha csak a v01 futna, a többszintes kód egésze mérés nélkül maradna —
// és a szonda vidáman zöld lenne körülötte.

cim('7. SZINTEK — emeleti padló, mozgólépcső, lift');
{
  const E = futas(4242, 12000, true, v02Uj);
  const F = futas(4242, 12000, false, v02Uj);
  if (E.zaro === F.zaro) ok('12 000 tick a szint-forgatókönyvvel — két futás azonos');
  else rossz(`a szint-forgatókönyv szétcsúszott: ${E.zaro} ≠ ${F.zaro}`);

  // Visszajátszás is: a `z` mező a parancsnaplóban utazik, és ha ott elveszne,
  // a betöltött állomásnak hiányoznának az emeletei.
  {
    const sim = new Sim({ seed: 4242 });
    let n = 0;
    for (let t = 0; t < 12000; t++) {
      while (n < E.napló.length && E.napló[n].tick === t) { sim.parancs(E.napló[n].p); n++; }
      sim.lep();
    }
    if (sim.ellenorzoOsszeg() === E.zaro) ok(`${E.napló.length} parancs visszajátszva — az emeletek is visszaálltak`);
    else rossz(`a szint-visszajátszás eltért: ${sim.ellenorzoOsszeg()} ≠ ${E.zaro}`);
  }

  // ── MŰKÖDÉS: tényleg HASZNÁLJÁK-E a szinteket? ───────────────────────────
  // Ez a lényeg. Egy emeletet meg lehet építeni úgy is, hogy soha senki nem
  // megy fel rá — akkor a szint csak drága díszlet, és a determinizmus
  // ettől még hibátlan lenne.
  const s = E.sim;
  const utasSzint = [0, 0, 0];
  for (const u of s.utasok) if (u.aktiv) utasSzint[u.z]++;
  const epSzint = [0, 0, 0];
  for (const ep of s.epuletek) if (ep) epSzint[ep.z]++;
  info(`épület szintenként: ${epSzint.join(' / ')} · utas szintenként: ${utasSzint.join(' / ')}`);
  info(`nap ${s.nap} · távozó ${s.osszTavozo} (elégedett ${s.elegedettTavozok})`);

  if (epSzint[1] >= 3) ok('az első emelet beépült'); else rossz(`az első emeleten csak ${epSzint[1]} épület áll`);
  if (epSzint[2] >= 1) ok('a második emelet is épült'); else rossz('a második emeletre nem került semmi');
  if (utasSzint[1] > 0) ok(`${utasSzint[1]} utas tartózkodik az emeleten — a mozgólépcső ÉL`);
  else rossz('senki nem ment fel az emeletre — a függőleges közlekedés halott');
  if (s.epuletek.some((e) => e && e.kod === 'lepcso')) ok('mozgólépcső áll'); else rossz('nincs mozgólépcső');
  const emeletiForgalom = s.epuletek.some((e) => e && e.z === 1 && e.kiszolgalt > 5);
  if (emeletiForgalom) ok('az emeleti szolgáltatások ki is szolgálnak');
  else rossz('az emeleti szolgáltatások nem szolgáltak ki senkit');
}

// ══════════════════════════════════════════════════════════════════════════
//  8. GAZDASÁGI DÖNTÉSEK — bérbeadás és nehézségi fokozat
// ══════════════════════════════════════════════════════════════════════════

cim('8. GAZDASÁGI DÖNTÉSEK — bérbeadás, nehézségi fokozat');
{
  const G = futas(1234, 14000, true, v03Uj, 'kemeny');
  const H = futas(1234, 14000, false, v03Uj, 'kemeny');
  if (G.zaro === H.zaro) ok('14 000 tick kemény fokozaton — két futás azonos');
  else rossz(`a gazdasági forgatókönyv szétcsúszott: ${G.zaro} ≠ ${H.zaro}`);

  const s = G.sim;
  if (s.nehezseg.kod === 'kemeny') ok('a nehézségi fokozat a világ állapota maradt');
  else rossz(`a fokozat elveszett: ${s.nehezseg.kod}`);

  const berelt = s.epuletek.filter((e) => e && e.berbeadva);
  const sajat = s.epuletek.find((e) => e && e.kod === 'etterem');
  info(`bérbe adva: ${berelt.map((e) => e.kod).join(', ') || 'egyik sem'}`);
  info(`saját étterem bevétele ${Math.round(sajat ? sajat.bevetel : 0)} · bérelt bolt ${Math.round((s.epuletek.find((e) => e && e.kod === 'bolt') || {}).bevetel || 0)}`);
  if (berelt.length >= 1) ok('a bérbeadás életben van'); else rossz('egyetlen épület sem került bérbe');
  if (berelt.every((e) => e.dolgozok.length === 0)) ok('a bérelt üzletekben nem fizetünk személyzetet');
  else rossz('bérelt üzletben maradt a mi dolgozónk — némán szivárgó bér');
  if (s.tetelek.has('bérlet') || (s.elozoNap.tetelek && s.elozoNap.tetelek.has('bérlet'))) ok('a bérleti bevétel megjelenik a mérlegben');
  else rossz('a bérlet nem hozott bevételt');

  // Ugyanaz a forgatókönyv KÖNNYŰ fokozaton mérhetően jobban áll —
  // ha nem, akkor a szorzók nem kötnek sehova.
  const K = futas(1234, 14000, false, v03Uj, 'konnyu');
  info(`pénz 14 000 ticknél — könnyű ${Math.round(K.sim.penz)} · kemény ${Math.round(s.penz)}`);
  if (K.sim.penz > s.penz) ok('a könnyű fokozat tényleg könnyebb');
  else rossz('a nehézségi fokozat nem hat a gazdaságra');
}

// ══════════════════════════════════════════════════════════════════════════
//  9. ÉRKEZÉSI CSATORNÁK — vasút, léghajó, űrkapu
// ══════════════════════════════════════════════════════════════════════════

cim('9. CSATORNÁK — vasút, léghajó-kikötő, űrkapu');
{
  const I = futas(555, 26000, false, v04Uj);
  const J = futas(555, 26000, false, v04Uj);
  if (I.zaro === J.zaro) ok('26 000 tick a csatorna-forgatókönyvvel — két futás azonos');
  else rossz(`a csatorna-forgatókönyv szétcsúszott: ${I.zaro} ≠ ${J.zaro}`);

  const s = I.sim;
  const csat = ['vasut', 'leghajo', 'urkapu'].map((k) => {
    const i = s.dimIdxKod(k);
    return { k, all: i >= 0 ? s.dimenziok[i] : null };
  });
  for (const c of csat) {
    info(`${c.k}: ${c.all && c.all.nyitva ? 'bekötve' : 'nincs'} · utas ${c.all ? c.all.osszUtas : 0} · bevétel ${Math.round(c.all ? c.all.bevetel : 0)}`);
  }
  const nyitott = csat.filter((c) => c.all && c.all.nyitva);
  if (nyitott.length >= 2) ok(`${nyitott.length} csatorna üzemel`);
  else rossz(`csak ${nyitott.length} csatorna épült meg — a v0.4 fő ága kimaradt`);
  if (csat.some((c) => c.all && c.all.osszUtas > 50)) ok('a csatornákon tényleg érkeznek utasok');
  else rossz('a csatornák be vannak kötve, de nem hoznak utast');

  // A csatorna ÍGÉRETE: nulla instabilitás. Ha ez nem igaz, akkor a
  // „nyugodt bevételi ág" hazugság, és a játékos rossz döntést hoz miatta.
  const romlo = csat.filter((c) => c.all && c.all.instabilitas > 0);
  if (romlo.length === 0) ok('a csatornák instabilitása nulla maradt — az ígéret áll');
  else rossz(`csatorna romlik: ${romlo.map((c) => c.k).join(', ')}`);

  const leghajoEp = s.epuletek.find((e) => e && e.kod === 'leghajo');
  if (leghajoEp && leghajoEp.z >= 1) ok(`a léghajó-kikötő a ${leghajoEp.z}. emeleten áll`);
  else rossz('a léghajó-kikötő nem emeleten van (vagy meg sem épült)');
}

// ══════════════════════════════════════════════════════════════════════════
//  10. VÉGIGJÁTSZÁS ÉS VÉGTELEN MÓD
// ══════════════════════════════════════════════════════════════════════════
//
// ⚠️ EZ A LEGDRÁGÁBB VIZSGÁLAT, és megéri: a végtelen mód a VII. fejezet UTÁN
// kezdődik, tehát bármilyen rövid forgatókönyv mellett MÉRÉS NÉLKÜL maradna —
// pedig a győzelem utáni kód az, amiben egy sikeres játékos a legtöbb időt
// tölti majd.
//
// ⚠️ RÖGZÍTETT SEED. A `v05` egy KOMPETENS, de nem optimális gépi játékos:
// nem minden világban jut el a VII. fejezetig (a mérés szerint négyből
// kettőben 60 körüli hírnéven ragad, és a fejezet 70-et kér). Ez a szonda nem
// azt hivatott bizonyítani, hogy a játék mindig megnyerhető — azt az
// egyensúly-mérés méri (`qa/EGYENSULY.md`) —, hanem azt, hogy a győzelem és a
// korszakok KÓDJA lefut és determinisztikus.

cim('10. VÉGIGJÁTSZÁS — a hét fejezet és a végtelen korszakok');
{
  const L = futas(90210, 70000, false, v05Uj);
  const M = futas(90210, 70000, false, v05Uj);
  if (L.zaro === M.zaro) ok('70 000 tick teljes végigjátszással — két futás azonos');
  else rossz(`a végigjátszás szétcsúszott: ${L.zaro} ≠ ${M.zaro}`);

  const s = L.sim;
  const t = s.tortenet;
  info(`nap ${s.nap} · fejezet ${t.fejezet} · állapot ${t.allapot} · korszak ${t.korszak}`);
  info(`hírnév ${s.hirnev.toFixed(0)} · elégedett távozó ${s.elegedettTavozok} · csúcs ${s.csucsUtas}`);

  if (s.gyoztel) ok(`a hét fejezetes ív teljesítve (${s.gyozelemTick}. tick)`);
  else rossz('a végigjátszás nem érte el a győzelmet — a végtelen mód mérés nélkül maradt');
  if (t.allapot === 'vegtelen') ok('a világ NEM állt meg a győzelemmel: végtelen módban fut');
  else rossz(`a győzelem után nem indult el a végtelen mód (állapot: ${t.allapot})`);
  if (t.korszak >= 2) ok(`${t.korszak}. korszak — ${rang(t.korszak).nev}`);
  else rossz(`csak a ${t.korszak}. korszakig jutott — a korszakváltás ága nem futott le`);
  if (s.korszakSzorzo > 1) ok(`a nyomás korszakonként nő (szorzó ${s.korszakSzorzo.toFixed(2)})`);
  else rossz('a korszak-szorzó nem nőtt — a végtelen mód nem lesz nehezebb');
  if (s.jatekVege === null) ok('a győzelem nem állítja meg a szimulációt');
  else rossz(`a világ megállt: jatekVege = ${s.jatekVege}`);

  // A korszakcél NŐ — enélkül a végtelen mód a második korszaktól ingyen jönne.
  const c1 = vegtelenCel(1), c5 = vegtelenCel(5);
  if (c5.utas > c1.utas * 3 && c5.hirnev > c1.hirnev) ok(`a korszakcél emelkedik (${c1.utas} → ${c5.utas} utas, ${c1.hirnev} → ${c5.hirnev} hírnév)`);
  else rossz('a korszakcél nem emelkedik érdemben');
}

// ══════════════════════════════════════════════════════════════════════════

console.log('');
if (hiba === 0) {
  console.log('\x1b[42m\x1b[30m  MIND A TÍZ VIZSGÁLAT ZÖLD  \x1b[0m\n');
  process.exit(0);
} else {
  console.log(`\x1b[41m\x1b[37m  ${hiba} HIBA  \x1b[0m\n`);
  process.exit(1);
}
