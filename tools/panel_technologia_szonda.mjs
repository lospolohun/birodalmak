// AGE OF THE CRYSTALS — TECHNOLÓGIA-PANEL SZONDA (v0.16).
//
// ── MIÉRT VAN EZ EGYÁLTALÁN ───────────────────────────────────────────────
// A technológiafa feliratait semmilyen meglévő kapu nem őrzi. A determinizmus-
// szonda a hash-eket nézi, és a hash-ek attól még bitre egyeznek, hogy a panel
// egy megkutatható technológiát zártnak hirdet, vagy fordítva: egy zártra
// kattinthatót ad, amire aztán a sim NÉMÁN nemet mond. Az FPS-szonda a felhőben
// meg sem szólal (nincs GPU). Vagyis a játékréteg pont abba a résbe esne, ahol
// ez a projekt már hatszor megégett: zöld kapu egy hazug rendszer mellett.
//
// ── ⚠️ AMIT A v0.9-BŐL TANULTUNK ─────────────────────────────────────────
// „Egy gát azért nem sült volna el soha, mert olyat hasonlított össze, ami
// amúgy is mindig eltért." Ezért itt MINDEN érdemi gát meg van SZABOTÁLVA is:
// előállítjuk a hibás bemenetet, és megköveteljük, hogy a gát PIROSRA váltson.
// Egy vizsgálat, amit sosem próbáltak ki hibás bemeneten, maga is hiba.
//
// ── MI AZ A SZÁM, AMI ELÁRULJA, HOGY CSINÁL IS VALAMIT ────────────────────
// Nem az, hogy „lefut". Hét gát van:
//
//   1. TÁBLA-TELJESSÉG. Minden technológiánként indexelt tábla `TECH_DB`
//      hosszú, üres elem nélkül. Egy rövid tábla `undefined`-ot ad, abból pedig
//      NÉMÁN eltűnő tétel lesz a fában. SZABOTÁZS: megcsonkított táblával is
//      lefuttatjuk, és megköveteljük, hogy elkapja.
//   2. A TÜKÖR-TÁBLÁK a SIM-BŐL ellenőrizve. A `TECH_IDO` és a `KORSZAK_IDO`
//      modul-privát a `src/sim/` alatt, a panel tükrözi őket. A tükör csendben
//      elcsúszhat — ezért nem táblát táblához hasonlítunk, hanem ELINDÍTUNK egy
//      kutatást és egy korszakváltást, és a sim visszaszámlálóját olvassuk.
//      SZABOTÁZS: elrontott tükörrel a gátnak buknia kell.
//   3. A NÉGY ZÁROLÁSI OK MINDEGYIKE ELŐFORDUL, SZÁMMAL. Korszakonkénti
//      bontásban hány tétel elérhető és hány zárt, és melyik ok hányszor.
//      Egy soha ki nem futó ág addig maradna hibás, amíg valaki bele nem néz.
//   4. NINCS SZEMÉT A MONDATOKBAN, és MINDEN zárt tételnek van KONKRÉT
//      indoklása. Az „ez most nem elérhető" ugyanolyan használhatatlan, mint a
//      semmi.
//   5. ⚠️ A FŐ GÁT: A FELIRAT ÉS A SIM EGYÜTT MOZOG. Nem hisszük el a panelnek,
//      hogy mi elérhető: minden tételre minden állapotban LEFUTTATJUK a
//      `Technologia.indit()`-et — zártnál MINDEN szóba jöhető épülettel —, és a
//      kettőt hasonlítjuk össze. SZABOTÁZS: egy mindenre „elérhető"-t mondó
//      hamis rétegen a gátnak buknia kell.
//   6. A HIÁNY-SZÁMOK IGAZAK. Amelyik tétel nyersanyag miatt zárt, annak PONT
//      a kiírt hiányt hozzáadva elérhetővé kell válnia — eggyel kevesebbtől nem.
//   7. VÉGIG MŰKÖDIK: a panel parancsa a soron át tényleg elindít egy kutatást,
//      a haladás NŐ, a technológia elkészül, és a korszakváltás is végigfut.
//
// HASZNÁLAT:  npm run p:tech      (node tools/panel_technologia_szonda.mjs)
// Kilépési kód: 0 = rendben, 1 = bukás.

import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const GYOKER = dirname(dirname(fileURLToPath(import.meta.url)));
const be = (...r) => import(pathToFileURL(join(GYOKER, ...r)).href);

const { Sim, TICK_HZ, KESLELTETES } = await be('src', 'sim', 'sim.js');
const {
  TECH, TECH_DB, TECH_NEV, TECH_LEIRAS, KUTAT, techEpulete, techKorszaka, techAra,
} = await be('src', 'sim', 'technologia.js');
const { KORSZAK, KORSZAK_NEV, KORSZAK_AR } = await be('src', 'sim', 'gazdasag.js');
const { EPULET, EPULET_NEV } = await be('src', 'sim', 'epuletek.js');
const { NYERS_NEV } = await be('src', 'sim', 'eroforras.js');
const { IKON_NEVEK } = await be('src', 'ui', 'ikonok.js');
const A = await be('src', 'ui', 'panel_technologia_adat.js');

const {
  KORSZAK_DB, TALLAPOT, TALLAPOT_NEV, ZAR, ZAR_DB, VALTAS,
  TECH_IDO_UI, KORSZAK_IDO_UI, NYERS_IKON,
  technologiaTetelek, korszakOszlopok, ujAllapot, technologiaAllapot,
  technologiaAdat, zarIndok, zarCimke, valtasIndok, tablakEllenorzes,
  kutatasParancs, korszakParancs,
} = A;

const SEED = 20260803;
const ZAR_NEV = ['—', 'korszak', 'épület', 'előfeltétel', 'nyersanyag'];

let bukas = 0;
const sor = (a, b, c) => console.log('  ' + String(a).padEnd(26) + String(b).padEnd(30) + (c ?? ''));
const cim = (t) => console.log('\n' + t + '\n' + '─'.repeat(84));
const gat = (all, szoveg, reszlet) => {
  if (all) return true;
  console.log('\n  ⛔ ' + szoveg);
  if (reszlet) console.log('     ' + reszlet);
  bukas++;
  return false;
};

cim('AGE OF THE CRYSTALS — TECHNOLÓGIA-PANEL SZONDA (v0.16)');

// ════════════════════════════════════════════════════════════════════════════
// KÖZÖS: forgatókönyvek
// ════════════════════════════════════════════════════════════════════════════

/** Friss, felállított sim. Kis pálya és kis sereg: itt nem mérünk, hanem döntünk. */
function ujSim() {
  const s = new Sim({ seed: SEED, n: 128, maxEgyseg: 200 });
  s.szondaFelallas(24, { munkasMinden: 2 });
  return s;
}

/** Épület lerakása a 0. csapatnak, a központja közelébe. */
function epuletet(sim, tipus, kesz) {
  const ep = sim.epuletek;
  let kx = (sim.n * 0.3) | 0, ky = (sim.n * 0.5) | 0;
  for (let i = 0; i < ep.db; i++) {
    if (ep.elo[i] === 1 && ep.csapat[i] === 0 && ep.tipus[i] === EPULET.KOZPONT) {
      kx = ep.x[i] | 0; ky = ep.y[i] | 0; break;
    }
  }
  for (let r = 4; r < 40; r += 2) {
    for (let dy = -r; dy <= r; dy += 2) {
      for (let dx = -r; dx <= r; dx += 2) {
        const hely = sim._szabadEpuletHely(tipus, kx + dx, ky + dy);
        if (!hely) continue;
        const i = ep.lerak(tipus, hely.x, hely.y, 0, !!kesz);
        if (i >= 0) return i;
      }
    }
  }
  return -1;
}

/** Készlet beállítása a 0. csapatnak. */
function keszlet(sim, e, f, k, kr) {
  const g = sim.gazdasag;
  g.keszlet[0] = e; g.keszlet[1] = f; g.keszlet[2] = k; g.keszlet[3] = kr;
}

/**
 * A forgatókönyvek. Mindegyik EGY konkrét zárolási okot (vagy feloldást) állít
 * elő — együtt le kell fedniük mind a négyet, és ezt a 3. gát meg is méri.
 */
const FORGATOKONYVEK = [
  {
    nev: 'induló állás (központ, 200/200/100/0)',
    keszit: (s) => s,
  },
  {
    nev: 'üres raktár',
    keszit: (s) => { keszlet(s, 0, 0, 0, 0); return s; },
  },
  {
    nev: 'félkész laktanya (még épül)',
    keszit: (s) => { epuletet(s, EPULET.LAKTANYA, false); keszlet(s, 900, 900, 900, 900); return s; },
  },
  {
    nev: 'kész laktanya + íjászda',
    keszit: (s) => {
      epuletet(s, EPULET.LAKTANYA, true);
      epuletet(s, EPULET.IJASZDA, true);
      keszlet(s, 900, 900, 900, 900);
      return s;
    },
  },
  {
    nev: 'hajnal kora, kész laktanya + torony',
    keszit: (s) => {
      epuletet(s, EPULET.LAKTANYA, true);
      epuletet(s, EPULET.TORONY, true);
      s.gazdasag.korszak[0] = KORSZAK.HAJNAL;
      keszlet(s, 900, 900, 900, 900);
      return s;
    },
  },
  {
    nev: 'hajnal kora, minden épület, ÜRES raktár',
    keszit: (s) => {
      epuletet(s, EPULET.LAKTANYA, true);
      epuletet(s, EPULET.IJASZDA, true);
      epuletet(s, EPULET.TORONY, true);
      s.gazdasag.korszak[0] = KORSZAK.HAJNAL;
      keszlet(s, 0, 0, 0, 0);
      return s;
    },
  },
  {
    nev: 'két kutatás FOLYAMATBAN',
    keszit: (s) => {
      keszlet(s, 900, 900, 900, 900);
      const kp = kozpontId(s);
      s.technologia.indit(0, TECH.EKEVAS, kp);
      s.technologia.indit(0, TECH.TALICSKA, kp);
      return s;
    },
  },
  {
    nev: 'két kutatás KÉSZ',
    keszit: (s) => {
      keszlet(s, 900, 900, 900, 900);
      const kp = kozpontId(s);
      s.technologia.indit(0, TECH.EKEVAS, kp);
      s.technologia.indit(0, TECH.TALICSKA, kp);
      for (let i = 0; i < 400; i++) s.technologia.lep();
      return s;
    },
  },
  {
    nev: 'kristály kora, minden épület, tele raktár',
    keszit: (s) => {
      epuletet(s, EPULET.LAKTANYA, true);
      epuletet(s, EPULET.IJASZDA, true);
      epuletet(s, EPULET.TORONY, true);
      s.gazdasag.korszak[0] = KORSZAK.KRISTALY;
      keszlet(s, 5000, 5000, 5000, 5000);
      return s;
    },
  },
];

function kozpontId(sim) {
  const ep = sim.epuletek;
  for (let i = 0; i < ep.db; i++) {
    if (ep.elo[i] === 1 && ep.csapat[i] === 0 && ep.tipus[i] === EPULET.KOZPONT && ep.kesz(i)) return i;
  }
  return -1;
}

/** Minden forgatókönyv egy-egy friss simmel. */
function osszesAllas() {
  return FORGATOKONYVEK.map((fk) => ({ nev: fk.nev, sim: fk.keszit(ujSim()) }));
}

// ════════════════════════════════════════════════════════════════════════════
// 1. VIZSGÁLAT — TÁBLA-TELJESSÉG (és a szabotázsa)
// ════════════════════════════════════════════════════════════════════════════

cim('1. VIZSGÁLAT — minden technológiánként indexelt tábla teljes');

const hibak = tablakEllenorzes();
sor('technológia', TECH_DB + ' db', 'TECH_NEV / TECH_LEIRAS / HATAS_MONDAT / TECH_IDO_UI');
sor('talált hiba', hibak.length, hibak.length === 0 ? '' : hibak.join('; '));
gat(hibak.length === 0, 'HIÁNYOS TÁBLA A PANEL ADATRÉTEGÉBEN.', hibak.join('; '));

// Az ikonok tényleg léteznek — egy elgépelt ikonnév néma gombot adna.
const tetelek = technologiaTetelek();
let ikonHiba = 0;
for (let t = 0; t < TECH_DB; t++) {
  if (IKON_NEVEK.indexOf(tetelek[t].ikon) < 0) {
    ikonHiba++;
    console.log('  ⛔ ismeretlen ikonnév: ' + tetelek[t].ikon + ' (' + tetelek[t].nev + ')');
  }
}
for (let f = 0; f < 4; f++) {
  if (IKON_NEVEK.indexOf(NYERS_IKON[f]) < 0) {
    ikonHiba++;
    console.log('  ⛔ ismeretlen nyersanyag-ikon: ' + NYERS_IKON[f]);
  }
}
sor('ikonnév-hiba', ikonHiba, ikonHiba === 0 ? 'mind ismert' : '');
gat(ikonHiba === 0, 'A FA ISMERETLEN IKONNEVET HASZNÁL — az `ikonSvg` dobna rá.');

// ── SZABOTÁZS ──────────────────────────────────────────────────────────
// Megcsonkított táblával a NAGYON hasonló hibát kell elkapnia: egy hetedik
// technológia felvétele a nevek bővítése nélkül pontosan ez.
const csonkNev = TECH_NEV.slice(0, TECH_DB - 1);
const csonkHibak = tablakEllenorzes({ nev: csonkNev });
sor('SZABOTÁZS: rövid TECH_NEV', csonkHibak.length + ' hiba', csonkHibak.length > 0 ? 'elkapta ✓' : 'ÁTENGEDTE');
gat(csonkHibak.length > 0,
  'A TÁBLA-ELLENŐRZŐ ÁTENGEDTE A RÖVID TÁBLÁT.',
  'Ez a gát így semmit nem ér: pont azt a hibafajtát nem fogja meg, amiért van.');

const csonkIdo = TECH_IDO_UI.slice(0, TECH_DB - 1);
gat(tablakEllenorzes({ ido: csonkIdo }).length > 0, 'A RÖVID TECH_IDO_UI ÁTMENT AZ ELLENŐRZŐN.');
gat(tablakEllenorzes({ korszakIdo: [400] }).length > 0, 'A RÖVID KORSZAK_IDO_UI ÁTMENT AZ ELLENŐRZŐN.');
gat(tablakEllenorzes({ korszakTargy: ['a sötét kort'] }).length > 0,
  'A HIÁNYOS KORSZAK-RAGOZÁS ÁTMENT AZ ELLENŐRZŐN.');

// ════════════════════════════════════════════════════════════════════════════
// 2. VIZSGÁLAT — A TÜKÖR-TÁBLÁK A SIM-BŐL
// ════════════════════════════════════════════════════════════════════════════

cim('2. VIZSGÁLAT — a tükrözött időtáblák EGYEZNEK a sim visszaszámlálójával');
sor('tétel', 'panel / sim (tick)', 'mp');

let tukorHiba = 0;
for (let t = 0; t < TECH_DB; t++) {
  const s = ujSim();
  keszlet(s, 5000, 5000, 5000, 5000);
  s.gazdasag.korszak[0] = KORSZAK.FENY;
  const epTipus = techEpulete(t);
  let epId = -1;
  for (let i = 0; i < s.epuletek.db; i++) {
    if (s.epuletek.csapat[i] === 0 && s.epuletek.kesz(i) && s.epuletek.tipus[i] === epTipus) { epId = i; break; }
  }
  if (epId < 0) epId = epuletet(s, epTipus, true);
  const indult = s.technologia.indit(0, t, epId);
  const simIdo = indult ? s.technologia.hatra[0 * TECH_DB + t] : -1;
  const egyezik = indult && simIdo === TECH_IDO_UI[t];
  if (!egyezik) tukorHiba++;
  sor(TECH_NEV[t], TECH_IDO_UI[t] + ' / ' + simIdo,
    Math.round(TECH_IDO_UI[t] / TICK_HZ) + ' mp' + (egyezik ? '' : '   ⛔'));
}
gat(tukorHiba === 0,
  'A `TECH_IDO_UI` TÜKÖR ELCSÚSZOTT A SIM `TECH_IDO`-JÁTÓL.',
  'A panel hamis kutatási időt és hamis haladás-százalékot mutatna. A tükör a '
  + '`panel_technologia_adat.js`-ben van (a sim nem exportálja az időtáblát).');

let korTukorHiba = 0;
for (let k = 0; k < KORSZAK_DB - 1; k++) {
  const s = ujSim();
  keszlet(s, 9000, 9000, 9000, 9000);
  s.gazdasag.korszak[0] = k;
  const indult = s.gazdasag.korszakIndit(0);
  const simIdo = indult ? s.gazdasag.korszakHatra[0] : -1;
  const egyezik = indult && simIdo === KORSZAK_IDO_UI[k];
  if (!egyezik) korTukorHiba++;
  sor(KORSZAK_NEV[k] + ' →', KORSZAK_IDO_UI[k] + ' / ' + simIdo,
    KORSZAK_NEV[k + 1] + (egyezik ? '' : '   ⛔'));
}
gat(korTukorHiba === 0, 'A `KORSZAK_IDO_UI` TÜKÖR ELCSÚSZOTT A SIM `KORSZAK_IDO`-JÁTÓL.');

// ── SZABOTÁZS: elrontott tükör ─────────────────────────────────────────
// Ha a tükör-ellenőrzés bármit is ér, egy elrontott értékkel el KELL buknia.
{
  const rontott = TECH_IDO_UI.slice();
  rontott[0] += 40;
  const s = ujSim();
  keszlet(s, 5000, 5000, 5000, 5000);
  const epId = epuletet(s, techEpulete(0), true);
  s.technologia.indit(0, 0, epId);
  const simIdo = s.technologia.hatra[0];
  const elkapta = simIdo !== rontott[0];
  sor('SZABOTÁZS: +40 tick', rontott[0] + ' / ' + simIdo, elkapta ? 'elkapta ✓' : 'ÁTENGEDTE');
  gat(elkapta, 'AZ IDŐ-TÜKÖR ÖSSZEHASONLÍTÁSA NEM MŰKÖDIK.',
    'Elrontott tükörrel is egyezést jelentett — vagyis a 2. gát vak.');
}

// ════════════════════════════════════════════════════════════════════════════
// 3. VIZSGÁLAT — ÁLLAPOT-ELOSZLÁS ÉS A NÉGY ZÁROLÁSI OK
// ════════════════════════════════════════════════════════════════════════════

cim('3. VIZSGÁLAT — mennyi elérhető és mennyi zárt, korszakonként és okonként');
console.log('  ' + 'forgatókönyv'.padEnd(44)
  + 'kész/folyik/nyitva/zárt'.padEnd(26) + 'zárolási okok');

const zarOsszes = new Int32Array(ZAR_DB);
const oszlopNyitva = new Int32Array(KORSZAK_DB);
const oszlopZarva = new Int32Array(KORSZAK_DB);
let allasokDb = 0;

for (const { nev, sim } of osszesAllas()) {
  const d = technologiaAdat(sim, 0);
  allasokDb++;
  for (let z = 1; z < ZAR_DB; z++) zarOsszes[z] += d.osszesites.zarOkok[z];
  for (let k = 0; k < KORSZAK_DB; k++) {
    oszlopNyitva[k] += d.oszlopok[k].elerhetoDb;
    oszlopZarva[k] += d.oszlopok[k].zartDb;
  }
  const okok = [];
  for (let z = 1; z < ZAR_DB; z++) {
    if (d.osszesites.zarOkok[z] > 0) okok.push(ZAR_NEV[z] + '×' + d.osszesites.zarOkok[z]);
  }
  console.log('  ' + nev.padEnd(44)
    + (d.osszesites.kesz + ' / ' + d.osszesites.folyik + ' / '
      + d.osszesites.elerheto + ' / ' + d.osszesites.zarva).padEnd(26)
    + (okok.join(', ') || '—'));
  const ossz = d.osszesites.kesz + d.osszesites.folyik + d.osszesites.elerheto + d.osszesites.zarva;
  gat(ossz === TECH_DB, 'A(Z) „' + nev + '" ÁLLÁSBAN ELVESZETT EGY TÉTEL.',
    ossz + ' tétel a várt ' + TECH_DB + ' helyett — pont ez a némán eltűnő tétel.');
}

console.log('');
sor('korszak', 'összesen nyitva / zárt', '(mind a ' + allasokDb + ' álláson)');
for (let k = 0; k < KORSZAK_DB; k++) {
  sor(k + '. ' + KORSZAK_NEV[k], oszlopNyitva[k] + ' / ' + oszlopZarva[k], '');
}
console.log('');
for (let z = 1; z < ZAR_DB; z++) {
  sor('zárolás: ' + ZAR_NEV[z], zarOsszes[z] + ' eset', zarOsszes[z] > 0 ? '' : '⛔ SOSEM FORDULT ELŐ');
  gat(zarOsszes[z] > 0,
    'A(Z) „' + ZAR_NEV[z] + '" ZÁROLÁSI OK EGYSZER SEM FUTOTT KI.',
    'Egy soha meg nem hívott ág addig marad hibás, amíg valaki bele nem néz. '
    + 'Vagy a forgatókönyv hiányos, vagy az ág halott.');
}
// A fa NE legyen mindig ugyanaz: ha egyetlen álláson sincs nyitott tétel, a
// panel tökéletesen reprodukálhatóan mutatna egy használhatatlan képernyőt.
let nyitvaOsszesen = 0;
for (let k = 0; k < KORSZAK_DB; k++) nyitvaOsszesen += oszlopNyitva[k];
gat(nyitvaOsszesen > 0, 'A FÁBAN EGYETLEN ÁLLÁSON SEM VOLT KUTATHATÓ TÉTEL.');
gat(oszlopNyitva[KORSZAK.SOTET] > 0 && oszlopNyitva[KORSZAK.HAJNAL] > 0,
  'CSAK AZ EGYIK KORSZAK TÉTELEI NYÍLTAK MEG VALAHA.',
  'sötét: ' + oszlopNyitva[KORSZAK.SOTET] + ', hajnal: ' + oszlopNyitva[KORSZAK.HAJNAL]);

// ════════════════════════════════════════════════════════════════════════════
// 4. VIZSGÁLAT — A MONDATOK
// ════════════════════════════════════════════════════════════════════════════

cim('4. VIZSGÁLAT — minden mondat magyar, egész, és a zárt tételnek KONKRÉT indoka van');

const SZEMET = [
  [/undefined/i, 'undefined'],
  [/\bNaN\b/, 'NaN'],
  [/\bnull\b/i, 'null'],
  [/\[\s*-?\d+\s*\]/, 'nyers tömbindex'],
  [/\b(TECH|TECH_DB|KUTAT|EPULET|KORSZAK|TAMADAS|NYERS|TIPUS|ZAR|TALLAPOT|VALTAS)\b/, 'konstans-név'],
];

function mondatE(sz, minHossz) {
  return typeof sz === 'string' && sz.length >= minHossz
    && /^[A-ZÁÉÍÓÖŐÚÜŰ0-9]/.test(sz) && /[.!?]$/.test(sz);
}

let mondatDb = 0, szemetes = 0, indokNelkul = 0;
const kulonbozoIndok = new Set();

for (const { nev, sim } of osszesAllas()) {
  const d = technologiaAdat(sim, 0);
  const vizsgalt = [];
  for (const t of d.tetelek) {
    vizsgalt.push([t.nev + ' — hatás', t.hatas, 24]);
    if (t.allapot === TALLAPOT.ZARVA) {
      vizsgalt.push([t.nev + ' — indok', t.indok, 20]);
      kulonbozoIndok.add(t.indok);
      if (!t.indok || t.indok.length < 20) indokNelkul++;
      if (!t.cimke) indokNelkul++;
    }
  }
  vizsgalt.push(['korszakváltás', d.valtas.indok, 20]);
  for (const o of d.oszlopok) vizsgalt.push([o.nev + ' — nyit', o.nyitMondat, 12]);

  for (const [cimke, szoveg, minH] of vizsgalt) {
    mondatDb++;
    for (const [re, mi] of SZEMET) {
      if (re.test(szoveg)) {
        szemetes++;
        console.log('  ⛔ ' + nev + ' / ' + cimke + ': „' + szoveg + '" — ' + mi);
      }
    }
    if (!mondatE(szoveg, minH)) {
      szemetes++;
      console.log('  ⛔ ' + nev + ' / ' + cimke + ': nem mondat alakú: „' + szoveg + '"');
    }
  }
}

sor('vizsgált mondat', mondatDb, '');
sor('szemetes / hiányos', szemetes + ' / ' + indokNelkul, szemetes + indokNelkul === 0 ? 'tiszta' : '⛔');
sor('különböző zár-indok', kulonbozoIndok.size, kulonbozoIndok.size >= 4 ? '' : '⛔ túl kevés');
gat(mondatDb > 40, 'TÚL KEVÉS MONDAT KELETKEZETT — a réteg vélhetően nem futott ki.');
gat(szemetes === 0, 'SZEMÉT VAGY NEM MONDAT ALAKÚ SZÖVEG A FÁBAN.');
gat(indokNelkul === 0, 'ZÁRT TÉTEL KONKRÉT INDOKLÁS NÉLKÜL.');
// Egy lusta generátor, ami mindenre ugyanazt mondja, minden fenti gáton átmenne.
gat(kulonbozoIndok.size >= 4,
  'A ZÁR-INDOKLÁSOK NEM KÜLÖNBÖZNEK ELÉG.',
  'Négy zárolási ok van, tehát legalább négy különböző mondatnak kell lennie; '
  + 'kapott: ' + kulonbozoIndok.size + '.');

// ── ⚠️ MÉLY PÁSZTA: az EGÉSZ adat-objektum minden mezője ────────────────
// A fenti kör csak azokat a mondatokat nézi, amikre GONDOLTUNK. Ez a gát a
// teljes szerkezetet bejárja, és minden `undefined`/`NaN` mezőt megfog — a
// megírásakor azonnal ki is bukott vele egy valódi hiba: a korszakváltó doboz
// `arSzoveg`-je `undefined` volt, mert két helyen létezett a mező, és a doboz a
// másikból olvasott. Egy „szemétre" vadászó ellenőrzés, ami csak a felsorolt
// mezőket nézi, pont az ilyet engedi át.
function melyPaszta(ertek, ut, ki) {
  if (ertek === undefined) { ki.push(ut + ' = undefined'); return; }
  if (typeof ertek === 'number' && !Number.isFinite(ertek)) { ki.push(ut + ' = ' + ertek); return; }
  if (typeof ertek === 'string') {
    if (/undefined|\bNaN\b/.test(ertek)) ki.push(ut + ' = „' + ertek + '"');
    return;
  }
  if (ertek === null || typeof ertek !== 'object') return;
  if (Array.isArray(ertek)) {
    for (let i = 0; i < ertek.length; i++) melyPaszta(ertek[i], ut + '[' + i + ']', ki);
    return;
  }
  for (const k of Object.keys(ertek)) melyPaszta(ertek[k], ut + '.' + k, ki);
}

let melyHiba = 0;
for (const { nev, sim } of osszesAllas()) {
  const talalt = [];
  melyPaszta(technologiaAdat(sim, 0), 'adat', talalt);
  for (const h of talalt) { melyHiba++; console.log('  ⛔ ' + nev + ': ' + h); }
}
sor('mély pászta', melyHiba + ' hiba', melyHiba === 0 ? 'egyetlen undefined/NaN mező sincs' : '⛔');
gat(melyHiba === 0, 'AZ ADAT-OBJEKTUMBAN `undefined` VAGY `NaN` MEZŐ VAN.',
  'Ilyen mező a képernyőn „undefined"-ként jelenik meg, vagy némán üresen marad.');

// SZABOTÁZS: pont az a szerkezet, ami a megíráskor valóban előfordult.
{
  const romlott = technologiaAdat(ujSim(), 0);
  romlott.valtas.arSzoveg = undefined;
  romlott.tetelek[0].idoSzoveg = 'NaN mp';
  const talalt = [];
  melyPaszta(romlott, 'adat', talalt);
  sor('SZABOTÁZS: mély pászta', talalt.length + ' hiba', talalt.length >= 2 ? 'elkapta ✓' : 'ÁTENGEDTE');
  gat(talalt.length >= 2, 'A MÉLY PÁSZTA NEM TALÁLTA MEG A SZÁNDÉKOSAN ELRONTOTT MEZŐKET.');
}

console.log('\n  Példa-indoklások:');
let p = 0;
for (const i of kulonbozoIndok) { console.log('    · ' + i); if (++p >= 6) break; }

// ════════════════════════════════════════════════════════════════════════════
// 5. VIZSGÁLAT — ⚠️ A FELIRAT ÉS A SIM EGYÜTT MOZOG
// ════════════════════════════════════════════════════════════════════════════

cim('5. VIZSGÁLAT — „elérhető" ⟺ a `kutatas` parancs TÉNYLEG elindulna');

/**
 * MEGPRÓBÁLJA elindítani a kutatást, majd MINDENT visszaállít.
 * A `Technologia.indit()` háromfélét ír: az állapot-hármast és a készletet —
 * csak ezeket kell visszatenni, tehát a próba nem szennyezi az állást.
 */
function probaIndit(sim, t, epulet) {
  const tec = sim.technologia, g = sim.gazdasag;
  const o = 0 * TECH_DB + t;
  const mAllapot = tec.allapot[o], mHatra = tec.hatra[o], mHol = tec.hol[o];
  const mElut = tec.elutasitva[0];
  const mK = [g.keszlet[0], g.keszlet[1], g.keszlet[2], g.keszlet[3]];
  const ok = tec.indit(0, t, epulet);
  tec.allapot[o] = mAllapot; tec.hatra[o] = mHatra; tec.hol[o] = mHol;
  tec.elutasitva[0] = mElut;
  for (let f = 0; f < 4; f++) g.keszlet[f] = mK[f];
  return ok;
}

/** Elindulna-e BÁRMELYIK épülettel? Zártnál ez a szigorú kérdés. */
function barmelyikkelIndulna(sim, t) {
  for (let i = 0; i < sim.epuletek.db; i++) {
    if (probaIndit(sim, t, i)) return i;
  }
  return -1;
}

/**
 * A panel állítása és a sim döntése egy állásra. Külön függvény, hogy a
 * SZABOTÁZS ugyanezt a logikát tudja lefuttatni egy hazug rétegen.
 * @returns {{osszevetve:number, elteres:number, reszletek:string[]}}
 */
function osszevet(sim, allapotFn) {
  const all = allapotFn(sim);
  const reszletek = [];
  let osszevetve = 0, elteres = 0;
  for (let t = 0; t < TECH_DB; t++) {
    osszevetve++;
    const uiElerheto = all.allapot[t] === TALLAPOT.ELERHETO;
    const simEpulet = barmelyikkelIndulna(sim, t);
    const simElerheto = simEpulet >= 0;
    if (uiElerheto !== simElerheto) {
      elteres++;
      reszletek.push(TECH_NEV[t] + ': a panel „' + TALLAPOT_NEV[all.allapot[t]]
        + '", a sim „' + (simElerheto ? 'elindulna' : 'nem indulna') + '"');
      continue;
    }
    // Ha elérhető, a panel által KIVÁLASZTOTT épülettel is mennie kell —
    // különben a gomb egy olyan épületre küldene parancsot, ami nem kutathat.
    if (uiElerheto) {
      const p = kutatasParancs(all, 0, t);
      if (!p || !probaIndit(sim, t, p.epulet)) {
        elteres++;
        reszletek.push(TECH_NEV[t] + ': a panel gombja rossz épületet célozna ('
          + (p ? p.epulet : 'nincs parancs') + ')');
      }
    } else if (kutatasParancs(all, 0, t) !== null) {
      elteres++;
      reszletek.push(TECH_NEV[t] + ': zárt tételre mégis adna parancsot');
    }
  }
  return { osszevetve, elteres, reszletek };
}

const igaziAllapot = (sim) => technologiaAllapot(sim, 0, ujAllapot());

let osszevetve = 0, elteres = 0;
for (const { nev, sim } of osszesAllas()) {
  const r = osszevet(sim, igaziAllapot);
  osszevetve += r.osszevetve; elteres += r.elteres;
  sor(nev.slice(0, 24), r.osszevetve + ' tétel', r.elteres === 0 ? 'egyezik' : '⛔ ' + r.elteres + ' eltérés');
  for (const d of r.reszletek) console.log('      ' + d);
}
sor('ÖSSZESEN', osszevetve + ' összevetés', elteres === 0 ? 'nincs eltérés' : '⛔ ' + elteres);
gat(elteres === 0,
  'A PANEL MÁST MOND, MINT AMIT A SIM CSINÁL.',
  'Ez a legdrágább hibafajta ebben a projektben: a kapu zöld, a hash egyezik, '
  + 'és a játékos vagy hiába kattint, vagy sosem tudja meg, hogy kutathatna.');
gat(osszevetve >= FORGATOKONYVEK.length * TECH_DB,
  'AZ ÖSSZEVETÉS NEM FUTOTT VÉGIG MINDEN TÉTELEN.');

// ── SZABOTÁZS: hazug réteg ─────────────────────────────────────────────
// Mindenre „elérhető"-t mondó adatréteg. Ha a fenti összevetés bármit is ér,
// ezen EL KELL BUKNIA — a v0.9 tanulsága szerint pont ez az a lépés, ami
// kimarad, és utána a gát évekig vakon zöldell.
{
  const hazug = (sim) => {
    const all = technologiaAllapot(sim, 0, ujAllapot());
    for (let t = 0; t < TECH_DB; t++) { all.allapot[t] = TALLAPOT.ELERHETO; all.zar[t] = ZAR.NINCS; }
    return all;
  };
  let hazugElteres = 0;
  for (const { sim } of osszesAllas()) hazugElteres += osszevet(sim, hazug).elteres;
  sor('SZABOTÁZS: hazug réteg', hazugElteres + ' eltérés', hazugElteres > 0 ? 'elkapta ✓' : 'ÁTENGEDTE');
  gat(hazugElteres > 0,
    'AZ 5. GÁT VAK: EGY MINDENRE „ELÉRHETŐ"-T MONDÓ RÉTEG IS ÁTMENT RAJTA.');
}
// A fordított szabotázs is kell: egy mindenre „zárva"-t mondó réteg ugyanígy hibás.
{
  const nema = (sim) => {
    const all = technologiaAllapot(sim, 0, ujAllapot());
    for (let t = 0; t < TECH_DB; t++) { all.allapot[t] = TALLAPOT.ZARVA; all.zar[t] = ZAR.KORSZAK; }
    return all;
  };
  let nemaElteres = 0;
  for (const { sim } of osszesAllas()) nemaElteres += osszevet(sim, nema).elteres;
  sor('SZABOTÁZS: néma réteg', nemaElteres + ' eltérés', nemaElteres > 0 ? 'elkapta ✓' : 'ÁTENGEDTE');
  gat(nemaElteres > 0, 'AZ 5. GÁT VAK: EGY MINDENT ZÁRTNAK MUTATÓ RÉTEG IS ÁTMENT RAJTA.');
}

// A korszakváltás ugyanígy: a gomb állapota és a `korszakIndit` együtt mozog.
{
  let valtasElteres = 0, valtasProba = 0;
  for (const { nev, sim } of osszesAllas()) {
    const all = technologiaAllapot(sim, 0, ujAllapot());
    const g = sim.gazdasag;
    const mK = [g.keszlet[0], g.keszlet[1], g.keszlet[2], g.keszlet[3]];
    const mH = g.korszakHatra[0];
    const simOk = g.korszakIndit(0);
    g.korszakHatra[0] = mH;
    for (let f = 0; f < 4; f++) g.keszlet[f] = mK[f];
    valtasProba++;
    const uiOk = all.valtas === VALTAS.LEHET;
    if (uiOk !== simOk) {
      valtasElteres++;
      console.log('  ⛔ ' + nev + ': a gomb „' + (uiOk ? 'mehet' : 'nem mehet')
        + '", a sim „' + (simOk ? 'elindult' : 'nem indult') + '"');
    }
    if ((korszakParancs(all, 0) !== null) !== simOk) valtasElteres++;
  }
  sor('korszakváltó gomb', valtasProba + ' állás', valtasElteres === 0 ? 'egyezik' : '⛔ ' + valtasElteres);
  gat(valtasElteres === 0, 'A KORSZAKVÁLTÓ GOMB MÁST MOND, MINT A `korszakIndit()`.');
}

// ════════════════════════════════════════════════════════════════════════════
// 6. VIZSGÁLAT — A HIÁNY-SZÁMOK IGAZAK
// ════════════════════════════════════════════════════════════════════════════

cim('6. VIZSGÁLAT — a kiírt hiány PONTOS: annyit hozzáadva megnyílik, eggyel kevesebbtől nem');
sor('tétel', 'hiány', 'eredmény');

let hianyProba = 0, hianyHiba = 0;
for (const { sim } of osszesAllas()) {
  const all = technologiaAllapot(sim, 0, ujAllapot());
  for (let t = 0; t < TECH_DB; t++) {
    if (all.allapot[t] !== TALLAPOT.ZARVA || all.zar[t] !== ZAR.NYERSANYAG) continue;
    hianyProba++;
    const g = sim.gazdasag;
    const mK = [g.keszlet[0], g.keszlet[1], g.keszlet[2], g.keszlet[3]];
    const hiany = [all.hiany[t * 4], all.hiany[t * 4 + 1], all.hiany[t * 4 + 2], all.hiany[t * 4 + 3]];

    // (a) Pont a hiányt hozzáadva MEG KELL nyílnia.
    for (let f = 0; f < 4; f++) g.keszlet[f] += hiany[f];
    const a2 = technologiaAllapot(sim, 0, ujAllapot());
    const megnyilt = a2.allapot[t] === TALLAPOT.ELERHETO;

    // (b) Eggyel kevesebbtől NEM. (A legnagyobb hiányzó tételből veszünk el.)
    let legnagyobb = 0;
    for (let f = 1; f < 4; f++) if (hiany[f] > hiany[legnagyobb]) legnagyobb = f;
    g.keszlet[legnagyobb] -= 1;
    const a3 = technologiaAllapot(sim, 0, ujAllapot());
    const meregNyitva = a3.allapot[t] === TALLAPOT.ELERHETO;

    for (let f = 0; f < 4; f++) g.keszlet[f] = mK[f];
    const jo = megnyilt && !meregNyitva;
    if (!jo) hianyHiba++;
    sor(TECH_NEV[t], hiany.join('/'),
      (megnyilt ? 'megnyílt' : '⛔ nem nyílt meg') + (meregNyitva ? ' ⛔ eggyel kevesebbtől is' : ''));
  }
}
gat(hianyProba > 0, 'EGYETLEN NYERSANYAG-ZÁROLT TÉTEL SEM AKADT — a 6. gát ki sem futott.');
gat(hianyHiba === 0, 'A KIÍRT HIÁNY-SZÁM NEM PONTOS.',
  'A játékos a panel száma alapján gyűjt; ha az hazudik, hiába gyűjti össze.');

// ════════════════════════════════════════════════════════════════════════════
// 7. VIZSGÁLAT — VÉGIG MŰKÖDIK (parancs → haladás → kész)
// ════════════════════════════════════════════════════════════════════════════

cim('7. VIZSGÁLAT — a panel parancsa a soron át tényleg elindít és befejez egy kutatást');

{
  const sim = ujSim();
  keszlet(sim, 900, 900, 900, 900);
  epuletet(sim, EPULET.LAKTANYA, true);
  const all = technologiaAllapot(sim, 0, ujAllapot());
  const t = TECH.KOVACSOLAS;
  const p = kutatasParancs(all, 0, t);
  gat(p !== null, 'A KOVÁCSOLÁS NEM VOLT ELÉRHETŐ KÉSZ LAKTANYÁVAL ÉS TELE RAKTÁRRAL.',
    'állapot: ' + TALLAPOT_NEV[all.allapot[t]] + ', ok: ' + ZAR_NEV[all.zar[t]]);

  if (p) {
    sim.parancs(p);
    // A parancs `KESLELTETES` tickig a sorban ül — a panel ezért „rontja el"
    // a gyorsítótárát indításkor; itt ezt a késleltetést mérjük is.
    let indulasTick = -1;
    const szazalekok = [];
    for (let i = 0; i < TECH_IDO_UI[t] + KESLELTETES + 20; i++) {
      sim.lep();
      const a = technologiaAllapot(sim, 0, ujAllapot());
      if (indulasTick < 0 && a.allapot[t] === TALLAPOT.FOLYIK) indulasTick = i;
      if (a.allapot[t] === TALLAPOT.FOLYIK && (i % 80 === 0)) szazalekok.push(a.szazalek[t]);
      if (a.allapot[t] === TALLAPOT.KESZ) break;
    }
    const veg = technologiaAllapot(sim, 0, ujAllapot());
    sor('indulás tick', indulasTick, 'késleltetés: ' + KESLELTETES);
    sor('haladás mintái', szazalekok.join(' → ') + ' %', '');
    sor('végállapot', TALLAPOT_NEV[veg.allapot[t]], veg.allapot[t] === TALLAPOT.KESZ ? '' : '⛔');
    sor('sim keszult', sim.technologia.keszult[0], '');

    gat(indulasTick >= 0, 'A KUTATÁS EL SEM INDULT A PANEL PARANCSÁRA.',
      'A `sim.parancs({fajta:\'kutatas\'})` némán elveszett — ez a néma gomb esete.');
    gat(veg.allapot[t] === TALLAPOT.KESZ, 'A KUTATÁS NEM FEJEZŐDÖTT BE.');
    gat(sim.technologia.keszult[0] >= 1, 'A SIM SZERINT SEMMI NEM KÉSZÜLT EL.');
    // A haladás MOZOG: szigorúan növekvő minták. Egy befagyott sáv minden más
    // gáton átmenne — a százalék a tükör-tábla helyességét is ellenőrzi.
    let novekvo = szazalekok.length >= 3;
    for (let i = 1; i < szazalekok.length; i++) if (szazalekok[i] <= szazalekok[i - 1]) novekvo = false;
    gat(novekvo, 'A HALADÁS-SZÁZALÉK NEM NŐTT SZIGORÚAN.',
      'minták: ' + szazalekok.join(', ') + ' — befagyott vagy rossz nevezővel számol.');
    gat(szazalekok.length > 0 && szazalekok[0] < 40 && szazalekok[szazalekok.length - 1] > 55,
      'A HALADÁS-SZÁZALÉK NEM FUTOTTA BE A TARTOMÁNYT.',
      'minták: ' + szazalekok.join(', '));
  }
}

// Korszakváltás végig.
{
  const sim = ujSim();
  keszlet(sim, 9000, 9000, 9000, 9000);
  const all = technologiaAllapot(sim, 0, ujAllapot());
  const p = korszakParancs(all, 0);
  gat(p !== null, 'A KORSZAKVÁLTÁS NEM VOLT INDÍTHATÓ TELE RAKTÁRRAL.',
    valtasIndok(all));
  if (p) {
    sim.parancs(p);
    const szazalekok = [];
    let kesz = false;
    for (let i = 0; i < KORSZAK_IDO_UI[0] + KESLELTETES + 20; i++) {
      sim.lep();
      const a = technologiaAllapot(sim, 0, ujAllapot());
      if (a.valtas === VALTAS.FOLYIK && i % 100 === 0) szazalekok.push(a.korszakSzazalek);
      if (a.korszak === KORSZAK.HAJNAL) { kesz = true; break; }
    }
    const veg = technologiaAllapot(sim, 0, ujAllapot());
    sor('korszak a végén', KORSZAK_NEV[veg.korszak], kesz ? '' : '⛔');
    sor('váltás haladása', szazalekok.join(' → ') + ' %', '');
    gat(kesz, 'A KORSZAKVÁLTÁS NEM FUTOTT VÉGIG.');
    // ⚠️ A váltás UTÁN a hajnal kora technológiáinak MEG KELL nyílniuk —
    // enélkül a korszakváltás a fa felől nézve nem csinálna semmit.
    const s2 = sim;
    epuletet(s2, EPULET.TORONY, true);
    keszlet(s2, 900, 900, 900, 900);
    const a4 = technologiaAllapot(s2, 0, ujAllapot());
    sor('falazás a váltás után', TALLAPOT_NEV[a4.allapot[TECH.FALAZAS]],
      a4.allapot[TECH.FALAZAS] === TALLAPOT.ELERHETO ? '' : '⛔ ' + ZAR_NEV[a4.zar[TECH.FALAZAS]]);
    gat(a4.allapot[TECH.FALAZAS] === TALLAPOT.ELERHETO,
      'A KORSZAKVÁLTÁS UTÁN SEM NYÍLT MEG A HAJNAL KORÁNAK TECHNOLÓGIÁJA.',
      'A korszak-zárolás vagy nem oldódik fel, vagy rossz korszakot néz.');
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 8. VIZSGÁLAT — A KÉPKOCKA-ÚT NEM ALLOKÁL
// ════════════════════════════════════════════════════════════════════════════

cim('8. VIZSGÁLAT — a `technologiaAllapot()` képkockánként hívható: nulla allokáció');

// MIÉRT MÉRJÜK: a panel-szerződés 3. kikötése szerint a `frissit()` nem
// allokálhat. Ezt kijelenteni könnyű, betartani nem: egyetlen `[a,b,c,d]` vagy
// egy sablon-string a forró úton 60–144 Hz-en szemetel. A halom-növekedés
// SOKKAL stabilabb mérőszám, mint az idő (lásd a CLAUDE.md tick-idő-tanulságát):
// ha hívásonként akár egy pici objektum keletkezne, a különbség nagyságrendi.
// ⚠️ MIÉRT TÖBB KÖR ÉS MIÉRT A MAXIMUM
// Az első változat EGY halom-mintát vett útonként, és ettől a gát HULLÁMZOTT:
// nyolc futásból kettő-három bukott, mert a szemétgyűjtő épp a mérés közben
// söpört, és az allokáló útra `-261 bájt/hívás` jött ki. A negatív számból a
// gát azt olvasta, hogy a mérce vak — vagyis a szabotázs-kontroll maga adott
// hamis riasztást, miközben a VALÓDI mérés (0,03 B/hívás) végig stabil volt.
//
// A hullámzó kapu rosszabb, mint a bukó: megtanulja az ember újrafuttatni.
//
// A javítás abból indul, hogy a GC csak LEFELÉ torzíthat: elvihet szemetet a
// két minta között, de a semmiből nem növeli a halmot. Tehát több körből a
// MAXIMUM a valósághoz legközelebbi becslés — és ez mindkét úton konzervatív:
// a nulla-allokációs útnál szigorúbbá teszi a gátat, az allokálónál pedig
// megszünteti a hamis riasztást.
const KOROK = 5;
function bajtHivasMax(fv, kor) {
  let max = -Infinity;
  for (let k = 0; k < KOROK; k++) {
    const e = process.memoryUsage().heapUsed;
    for (let i = 0; i < kor; i++) fv();
    const u = process.memoryUsage().heapUsed;
    const b = (u - e) / kor;
    if (b > max) max = b;
  }
  return max;
}

{
  const sim = ujSim();
  const cel = ujAllapot();
  const KOR = 200000;
  // Bemelegítés: a JIT és a rejtett osztályok álljanak be, különben az első
  // ezer hívás fordítási szemete a mérésbe folyna.
  for (let i = 0; i < 20000; i++) technologiaAllapot(sim, 0, cel);
  const bajtHivas = bajtHivasMax(() => technologiaAllapot(sim, 0, cel), KOR);
  sor('hívás', KOR * KOROK, KOROK + ' kör, a legrosszabb számít');
  sor('bájt / hívás', bajtHivas.toFixed(2), bajtHivas < 8 ? 'nulla allokáció ✓' : '⛔ SZEMETEL');

  // SZABOTÁZS: az allokáló út UGYANEZZEL a mércével mérve nagyságrenddel
  // többet ad — enélkül nem tudnánk, hogy a mérőszám egyáltalán érzékeny.
  const bajtHivas2 = bajtHivasMax(() => technologiaAdat(sim, 0), 20000);
  sor('SZABOTÁZS: allokáló út', bajtHivas2.toFixed(2) + ' bájt/hívás',
    bajtHivas2 > bajtHivas * 10 ? 'a mérce érzékeny ✓' : 'ÉRZÉKETLEN MÉRCE');

  gat(bajtHivas < 8, 'A KÉPKOCKA-ÚT SZEMETEL.',
    Math.round(bajtHivas) + ' bájt hívásonként — a panel-szerződés 3. kikötése sérül.');
  gat(bajtHivas2 > bajtHivas * 10,
    'A MÉRŐSZÁM ÉRZÉKETLEN: MÉG AZ ALLOKÁLÓ ÚT SEM LÁTSZIK RAJTA.',
    'nulla-allokációs: ' + bajtHivas.toFixed(2) + ' B/hívás, allokáló: '
    + bajtHivas2.toFixed(2) + ' B/hívás — így a 8. gát semmit nem őriz.');
}

// ════════════════════════════════════════════════════════════════════════════
// ÖSSZEGZÉS
// ════════════════════════════════════════════════════════════════════════════

cim('ÖSSZEGZÉS');
{
  const sim = ujSim();
  const d = technologiaAdat(sim, 0);
  sor('technológia a fában', TECH_DB, d.tetelek.map((x) => x.nev).join(', '));
  sor('oszlop', KORSZAK_DB, d.oszlopok.map((o) => o.nev + ' (' + o.tetelek.length + ')').join(', '));
  sor('nyitó állás', d.osszesites.elerheto + ' nyitva, ' + d.osszesites.zarva + ' zárt', '');
  sor('korszakváltás', d.valtas.arSzoveg + ' / ' + d.valtas.idoSzoveg, d.valtas.nyitMondat);
}

console.log('');
if (bukas === 0) {
  console.log('  ✅ MINDEN GÁT ZÖLD — a fa azt mutatja, amit a sim csinál.');
  process.exit(0);
} else {
  console.log('  ⛔ ' + bukas + ' GÁT BUKOTT.');
  process.exit(1);
}
