// PORTAL HUB TYCOON — MÉRTAN-SZONDA.
//
// ── MIÉRT VAN EZ AZ ESZKÖZ ────────────────────────────────────────────────
// Az `epulet_mertan.js` és a `leny_mertan.js` NEM tud elromlani úgy, hogy az
// kivételt dobjon: egy elgépelt koordinátából nem hibaüzenet lesz, hanem egy
// épület, ami félig a szomszéd cellájában áll, vagy egy lény, aki a padló
// alatt sétál. A hiba csak GPU-s gépen, szemmel derülne ki — a felhőben pedig
// egyáltalán nem. Ezért a mértan szerződését SZÁMOKKAL kell őrizni:
//
//   1. TELJESSÉG   — minden épületkódra és fajkódra van geometria
//   2. EGYSÉGDOBOZ — az épületek tényleg a [0..1]³-ban vannak, aljuk y≈0
//   3. TALP        — a lények talpa y≈0, magasságuk 1,0–1,5
//   4. KÖLTSÉGKERET— háromszögszám típusonként/fajonként
//   5. ÉPSÉG       — nincs NaN a csúcsokban
//   6. EGYEDISÉG   — a húsz sziluett tényleg HÚSZFÉLE
//
// ⚠️ A 6. VIZSGÁLAT NEM DÍSZ. Az egész fájl azért létezik, hogy a típusok
// megkülönböztethetők legyenek; egy elcsúszott másolás-beillesztéstől viszont
// két típus némán ugyanazt a dobozt kapná, és mind az öt másik vizsgálat zöld
// maradna. Ez pontosan az a fajta „tökéletesen reprodukálható semmittevés",
// ami ellen a projekt többi szondája is véd.
//
// ⚠️ HA BUKIK, NE A SZONDÁT ÍRD ÁT.
//
// Tiszta node, nem kell GPU: a `three` geometria-készítése nem nyúl a DOM-hoz.

import * as THREE from 'three';
import { EPULETEK } from '../src/sim/epuletek.js';
import { FAJOK } from '../src/sim/lenyek.js';
import { epuletMertanok, epuletDiszek } from '../src/render/epulet_mertan.js';
import { lenyMertanok } from '../src/render/leny_mertan.js';

const EP_KERET = 300;      // háromszög / épülettípus (test + dísz)
const LENY_KERET = 200;    // háromszög / faj (test + fej)
const TURES = 1e-4;        // a lebegőpontos igazítás elkerülhetetlen maradéka
const LENY_MIN = 1.0;
const LENY_MAX = 1.5;

let hiba = 0;
const cim = (s) => console.log(`\n\x1b[1m${s}\x1b[0m`);
const ok = (s) => console.log(`  \x1b[32m✓\x1b[0m ${s}`);
const rossz = (s) => { console.log(`  \x1b[31m✗ ${s}\x1b[0m`); hiba++; };
// Figyelmeztetés: látszik, de nem bukik tőle a kapu. Egyetlen helyen
// használjuk — lásd az 1. vizsgálatot.
const fig = (s) => console.log(`  \x1b[33m⚠\x1b[0m ${s}`);
const info = (s) => console.log(`    ${s}`);
const bal = (s, n) => String(s).padEnd(n);
const jobb = (s, n) => String(s).padStart(n);

const haromszog = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;

function befoglalo(g) {
  g.computeBoundingBox();
  return g.boundingBox;
}

/**
 * Alak-ujjlenyomat: háromszögszám + a csúcsok koordinátáinak súlyozott
 * összege. Két KÜLÖNBÖZŐ terv gyakorlatilag sosem ad egyezést, két
 * ÖSSZEMÁSOLT terv viszont mindig.
 */
function ujjlenyomat(g) {
  const p = g.attributes.position.array;
  let s = 0;
  for (let i = 0; i < p.length; i += 3) {
    s += p[i] * 1.0 + p[i + 1] * 3.7 + p[i + 2] * 11.3;
  }
  return `${haromszog(g)}:${s.toFixed(4)}`;
}

function nanKereses(nev, g) {
  for (const kulcs of ['position', 'normal']) {
    const a = g.attributes[kulcs];
    if (!a) { rossz(`${nev}: hiányzik a(z) ${kulcs} attribútum`); continue; }
    for (let i = 0; i < a.array.length; i++) {
      if (!Number.isFinite(a.array[i])) {
        rossz(`${nev}: NaN/Infinity a(z) ${kulcs}[${i}] helyen`);
        return;
      }
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════
//  A KÉSZLETEK
// ══════════════════════════════════════════════════════════════════════════

const testek = epuletMertanok(THREE);
const diszek = epuletDiszek(THREE);
const lenyek = lenyMertanok(THREE);

// A `portal` kimarad: a forgó kapugyűrű az `allomas3d.js` saját objektuma.
const EP_KODOK = EPULETEK.map((e) => e.kod).filter((k) => k !== 'portal');
const FAJ_KODOK = FAJOK.map((f) => f.kod);

// ══════════════════════════════════════════════════════════════════════════
//  1. TELJESSÉG
// ══════════════════════════════════════════════════════════════════════════

cim('1. TELJESSÉG — van-e minden kódra mértan');
{
  let hiany = 0;
  for (const kod of EP_KODOK) {
    if (!testek.has(kod)) { rossz(`épület '${kod}': nincs geometria`); hiany++; }
  }
  if (!hiany) ok(`mind a ${EP_KODOK.length} épülettípusnak van teste (a 'portal' szándékosan kimarad)`);

  // A HIÁNY hiba, a TÖBBLET csak figyelmeztetés. Több agent dolgozik
  // párhuzamosan: a katalógus új sora és a hozzá tartozó mértan nem
  // feltétlenül ugyanabban a percben landol, és egy kész, de még nem
  // katalogizált sziluettért nem szabad pirosra váltani. Fordítva viszont
  // igen: geometria nélkül az épület láthatatlan lenne.
  let felesleg = 0;
  for (const kod of testek.keys()) {
    if (kod === 'portal') { rossz("a 'portal' geometriáját az allomas3d.js úgyis eldobja — ne készüljön"); felesleg++; }
    else if (!EP_KODOK.includes(kod)) { fig(`'${kod}': van mértan, de a katalógusban nincs ilyen épület — elhagyható`); }
  }
  for (const kod of diszek.keys()) {
    if (!testek.has(kod)) { rossz(`'${kod}': van dísz, de nincs test`); felesleg++; }
  }
  if (!felesleg) ok(`${diszek.size} típusnak van dísze is, fölösleges kód nincs`);

  let fhiany = 0;
  for (const kod of FAJ_KODOK) {
    const l = lenyek.get(kod);
    if (!l) { rossz(`faj '${kod}': nincs mértan`); fhiany++; }
    else if (!l.test || !l.fej) { rossz(`faj '${kod}': hiányzik a ${!l.test ? 'test' : 'fej'}`); fhiany++; }
  }
  if (!fhiany) ok(`mind a ${FAJ_KODOK.length} fajnak van teste és feje`);

  for (const kod of lenyek.keys()) {
    if (!FAJ_KODOK.includes(kod)) rossz(`ismeretlen fajkód a készletben: '${kod}'`);
  }
}

// ══════════════════════════════════════════════════════════════════════════
//  2. EGYSÉGDOBOZ — az épületek szerződése
// ══════════════════════════════════════════════════════════════════════════

cim('2. EGYSÉGDOBOZ — [0..1]³, az alja y≈0');
{
  let baj = 0;
  for (const kod of EP_KODOK) {
    const g = testek.get(kod);
    if (!g) continue;
    const b = befoglalo(g);
    const d = diszek.get(kod);
    const db = d ? befoglalo(d) : null;

    const min = [Math.min(b.min.x, db ? db.min.x : Infinity),
      Math.min(b.min.y, db ? db.min.y : Infinity),
      Math.min(b.min.z, db ? db.min.z : Infinity)];
    const max = [Math.max(b.max.x, db ? db.max.x : -Infinity),
      Math.max(b.max.y, db ? db.max.y : -Infinity),
      Math.max(b.max.z, db ? db.max.z : -Infinity)];

    const t = ['x', 'y', 'z'];
    for (let i = 0; i < 3; i++) {
      if (min[i] < -TURES) { rossz(`'${kod}': a befoglaló kilóg a 0 alá (${t[i]}min = ${min[i].toFixed(4)})`); baj++; }
      if (max[i] > 1 + TURES) { rossz(`'${kod}': a befoglaló kilóg 1 fölé (${t[i]}max = ${max[i].toFixed(4)})`); baj++; }
    }
    if (Math.abs(min[1]) > TURES) { rossz(`'${kod}': nem a talajon áll (ymin = ${min[1].toFixed(4)})`); baj++; }
    if (Math.abs(max[1] - 1) > TURES) { rossz(`'${kod}': nem éri el az y=1-et (ymax = ${max[1].toFixed(4)}) — a 'magas' így hazudna`); baj++; }
    // Az alapterületnek ki KELL töltenie a cellát, különben az épület
    // elveszik a padlón. 0,55 alatt az már nem épület, hanem dísztárgy.
    const szel = Math.max(max[0] - min[0], max[2] - min[2]);
    if (szel < 0.55) { rossz(`'${kod}': túl keskeny alapterület (${szel.toFixed(2)}) — elveszik a cellában`); baj++; }
  }
  if (!baj) ok(`mind a ${EP_KODOK.length} típus a [0..1]³-ban van, alja y=0, teteje y=1`);
}

// ══════════════════════════════════════════════════════════════════════════
//  3. TALP — a lények szerződése
// ══════════════════════════════════════════════════════════════════════════

cim('3. TALP — a lény az y=0-n áll, 1,0–1,5 magas');
{
  let baj = 0;
  for (const kod of FAJ_KODOK) {
    const l = lenyek.get(kod);
    if (!l || !l.test || !l.fej) continue;
    const t = befoglalo(l.test), f = befoglalo(l.fej);
    const alja = Math.min(t.min.y, f.min.y);
    const teteje = Math.max(t.max.y, f.max.y);
    if (Math.abs(alja) > TURES) { rossz(`'${kod}': a talpa nem az y=0-n van (${alja.toFixed(4)})`); baj++; }
    if (teteje < LENY_MIN || teteje > LENY_MAX) {
      rossz(`'${kod}': a magassága ${teteje.toFixed(3)} — a ${LENY_MIN}–${LENY_MAX} sávon kívül`); baj++;
    }
    // A fej legyen tényleg fönt: ha a fej a test aljára kerülne, a hívó
    // világosabb színe a lábfejet emelné ki.
    const fejKozep = (f.min.y + f.max.y) * 0.5;
    if (fejKozep < teteje * 0.5) {
      rossz(`'${kod}': a fej a test alsó felében van (közepe ${fejKozep.toFixed(2)}, magasság ${teteje.toFixed(2)})`);
      baj++;
    }
    // Vízszintesen se lógjon szét: a lény a saját cellájában marad.
    const szel = Math.max(t.max.x - t.min.x, t.max.z - t.min.z, f.max.x - f.min.x, f.max.z - f.min.z);
    if (szel > 1.4) { rossz(`'${kod}': túl széles (${szel.toFixed(2)}) — átlógna a szomszéd utasra`); baj++; }
  }
  if (!baj) ok(`mind a ${FAJ_KODOK.length} faj talpal, és a sávban van`);
}

// ══════════════════════════════════════════════════════════════════════════
//  4. KÖLTSÉGKERET
// ══════════════════════════════════════════════════════════════════════════

cim('4. KÖLTSÉGKERET — háromszögszám');
{
  console.log(`    ${bal('épülettípus', 15)}${jobb('test', 7)}${jobb('dísz', 7)}${jobb('össz.', 8)}   keret ${EP_KERET}`);
  console.log(`    ${'─'.repeat(44)}`);
  let baj = 0, ossz = 0, csucs = 0;
  for (const kod of EP_KODOK) {
    const g = testek.get(kod);
    if (!g) continue;
    const d = diszek.get(kod);
    const tT = haromszog(g), tD = d ? haromszog(d) : 0;
    const s = tT + tD;
    ossz += s;
    if (s > csucs) csucs = s;
    const jel = s > EP_KERET ? '\x1b[31m ✗\x1b[0m' : '';
    console.log(`    ${bal(kod, 15)}${jobb(tT, 7)}${jobb(tD, 7)}${jobb(s, 8)}${jel}`);
    if (s > EP_KERET) { baj++; }
  }
  if (baj) rossz(`${baj} épülettípus lépi túl a ${EP_KERET} háromszöges keretet`);
  else ok(`mind a ${EP_KODOK.length} típus a keret alatt — legnagyobb ${csucs}, összesen ${ossz}`);

  console.log('');
  console.log(`    ${bal('faj', 15)}${jobb('test', 7)}${jobb('fej', 7)}${jobb('össz.', 8)}${jobb('magas', 8)}   keret ${LENY_KERET}`);
  console.log(`    ${'─'.repeat(52)}`);
  let lbaj = 0, lossz = 0, lcsucs = 0;
  for (const kod of FAJ_KODOK) {
    const l = lenyek.get(kod);
    if (!l || !l.test || !l.fej) continue;
    const tT = haromszog(l.test), tF = haromszog(l.fej);
    const s = tT + tF;
    lossz += s;
    if (s > lcsucs) lcsucs = s;
    const m = Math.max(befoglalo(l.test).max.y, befoglalo(l.fej).max.y);
    const jel = s > LENY_KERET ? '\x1b[31m ✗\x1b[0m' : '';
    console.log(`    ${bal(kod, 15)}${jobb(tT, 7)}${jobb(tF, 7)}${jobb(s, 8)}${jobb(m.toFixed(2), 8)}${jel}`);
    if (s > LENY_KERET) lbaj++;
  }
  if (lbaj) rossz(`${lbaj} faj lépi túl a ${LENY_KERET} háromszöges keretet`);
  else ok(`mind a ${FAJ_KODOK.length} faj a keret alatt — legnagyobb ${lcsucs}, összesen ${lossz}`);

  info(`1200 lény × átlag ${Math.round(lossz / FAJ_KODOK.length)} háromszög ≈ ${(1200 * lossz / FAJ_KODOK.length / 1000).toFixed(0)} ezer háromszög a tömegre`);
  info(`400 épület × átlag ${Math.round(ossz / EP_KODOK.length)} háromszög ≈ ${(400 * ossz / EP_KODOK.length / 1000).toFixed(0)} ezer háromszög az állomásra`);
}

// ══════════════════════════════════════════════════════════════════════════
//  5. ÉPSÉG
// ══════════════════════════════════════════════════════════════════════════

cim('5. ÉPSÉG — nincs NaN, van index és normális');
{
  const elott = hiba;
  for (const kod of EP_KODOK) {
    if (testek.has(kod)) nanKereses(`épület '${kod}' test`, testek.get(kod));
    if (diszek.has(kod)) nanKereses(`épület '${kod}' dísz`, diszek.get(kod));
  }
  for (const kod of FAJ_KODOK) {
    const l = lenyek.get(kod);
    if (!l) continue;
    if (l.test) nanKereses(`faj '${kod}' test`, l.test);
    if (l.fej) nanKereses(`faj '${kod}' fej`, l.fej);
  }
  // Indexeltség: példányosított rajzolásnál ez a csúcs-sávszélesség fele.
  let nemIndexelt = 0;
  const mind = [...testek.values(), ...diszek.values()];
  for (const kod of FAJ_KODOK) {
    const l = lenyek.get(kod);
    if (l) mind.push(l.test, l.fej);
  }
  for (const g of mind) if (!g.index) nemIndexelt++;
  if (nemIndexelt) rossz(`${nemIndexelt} geometria nincs indexelve`);
  if (hiba === elott) ok(`${mind.length} geometria ép, indexelt, normálissal`);
}

// ══════════════════════════════════════════════════════════════════════════
//  6. EGYEDISÉG — a zöld szerződés nem elég, ha minden egyforma
// ══════════════════════════════════════════════════════════════════════════

cim('6. EGYEDISÉG — tényleg különbözik-e a húsz sziluett');
{
  const latott = new Map();
  let utkozes = 0;
  for (const kod of EP_KODOK) {
    const g = testek.get(kod);
    if (!g) continue;
    const u = ujjlenyomat(g);
    if (latott.has(u)) { rossz(`'${kod}' mértana azonos ezzel: '${latott.get(u)}'`); utkozes++; }
    else latott.set(u, kod);
  }
  if (!utkozes) ok(`${EP_KODOK.length} különböző épület-sziluett`);

  const lLatott = new Map();
  let lUtkozes = 0;
  for (const kod of FAJ_KODOK) {
    const l = lenyek.get(kod);
    if (!l || !l.test) continue;
    const u = ujjlenyomat(l.test);
    if (lLatott.has(u)) { rossz(`'${kod}' teste azonos ezzel: '${lLatott.get(u)}'`); lUtkozes++; }
    else lLatott.set(u, kod);
  }
  if (!lUtkozes) ok(`${FAJ_KODOK.length} különböző lény-sziluett`);

  // …és tényleg TÖBB-e egy doboznál? A régi állapot (12 háromszög) az a szám,
  // ami elárulja, hogy a részletezés meg is történt.
  const soványak = EP_KODOK.filter((k) => testek.has(k) && haromszog(testek.get(k)) + (diszek.has(k) ? haromszog(diszek.get(k)) : 0) <= 24);
  if (soványak.length) rossz(`csak doboznyi részlet: ${soványak.join(', ')}`);
  else ok('minden típus részletesebb két doboznál');
}

// ══════════════════════════════════════════════════════════════════════════

console.log('');
if (hiba === 0) {
  console.log('\x1b[42m\x1b[30m  MIND A HAT VIZSGÁLAT ZÖLD  \x1b[0m\n');
  process.exit(0);
} else {
  console.log(`\x1b[41m\x1b[37m  ${hiba} HIBA  \x1b[0m\n`);
  process.exit(1);
}
