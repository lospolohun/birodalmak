// AGE OF THE CRYSTALS — CIV-VÁLASZTÓ SZONDA (v0.11/1).
//
// ── MIÉRT VAN EZ EGYÁLTALÁN ───────────────────────────────────────────────
// A civ-választó feliratait semmilyen meglévő kapu nem őrzi. A determinizmus-
// szonda a hash-eket nézi, és a hash-ek attól még bitre egyeznek, hogy a menü
// a legdrágább népet hirdeti a legolcsóbbnak: a felirat nem megy át a
// lockstep-soron. Az FPS-szonda meg a felhőben meg sem szólal (nincs GPU).
// Vagyis a szöveg-réteg pont abba a résbe esne, ahol a projekt már háromszor
// megégett: zöld kapu egy halott vagy hazug rendszer mellett.
//
// ── MIT MÉR — VAGYIS MI AZ A SZÁM, AMI ELÁRULJA, HOGY CSINÁL IS VALAMIT ───
// Nem az, hogy „lefut". Hat gát van, és mindegyik egy KONKRÉT hibát fog meg:
//
//   1. Nyolc nép, mindegyiknek van neve, leírása, ÉS legalább egy előnye ÉS
//      legalább egy hátránya. Üres lista = vagy hibás olvasás, vagy egy
//      elrontott balansz-sor a `civ.js`-ben — mindkettő fogandó.
//   2. Egyetlen mondatban sincs `undefined`, `NaN`, `null` vagy nyers
//      tömbindex/konstansnév. A hiányzó név-táblázat-elem így nem tud
//      „undefined %-kal gyorsabban"-ként a menübe kerülni.
//   3. MINDEN bónusz-sorból KELETKEZIK mondat (`sorok === előny + hátrány`).
//      Egy le nem kezelt `HATAS`-ág különben csendben elveszne: a kártya
//      eggyel kevesebb sort mutatna, és semmi nem szólna.
//   4. ⚠️ A FORDÍTOTT OLVASAT, NÉVVEL. Az ár és az idő nagyobb értéke ROSSZ.
//      A Kristálykovácsok `+10 %` egység-ára HÁTRÁNY. Ezen a projektben már
//      megbukott egy vizsgálat első változata — itt ezért NÉVVEL megnevezett
//      tételek vannak rögzítve, mindkét irányban, és a döntést közvetlenül
//      (`elonyE`) is megnézzük mind a kilenc hatásra.
//   5. HATÁS-LEFEDETTSÉG: a `civ.js` mind a kilenc `HATAS` kódja szerepel a
//      táblázatban, és mind a kilencre keletkezik mondat. Ez járatja meg a
//      mondat-építő minden ágát — enélkül egy soha meg nem hívott ág addig
//      maradna hibás, amíg a v0.13 hangolása bele nem nyúl a táblázatba.
//   6. A mondatok TÉNYLEG KÜLÖNBÖZNEK: annyi különböző mondat van, ahány
//      különböző `[hatás, index, érték]` hármas. Egy lusta generátor, ami
//      mindenre ugyanazt adja, az összes fenti gáton átmenne.
//
// ── ⚠️ AMIT EZ A SZONDA SZÁNDÉKOSAN NEM MÉR (v0.18-as audit) ──────────────
// Ez a szonda EGYETLEN tickt sem léptet: nincs benne `Sim`, nincs `lep()`. A
// v0.18-as mérés-audit ezért ide nem tett gátat — a „hosszú futás átnyúlik a
// meccs végén, és a halott percek belekerülnek az átlagba" csapda itt nem
// létezik, mert nincs futás. (A csapdáról: a `TODO.md` „a munkások VÉGLEG
// tétlenné válnak" tétele azért volt téves diagnózis, mert egy 16 000 tickes
// futás végét mérte, holott a meccs a 10 740. ticken lezárult.)
//
// A civ-BALANSZ számai — amiket az `ATADO.md` idéz (−1,3 % / +15,8 %) — VISZONT
// hosszú, 16 000 tickes gépi meccsekből jönnek, csak nem itt, hanem a
// determinizmus-szonda civ-körében. Ha valaki azokat újra méri, ELŐBB nézze
// meg a `sim.gyozelem.vegeTick`-et. Mérve (v0.18, SEED 20260803): a v0.9-es
// civ-forgatókönyv 16 000 tickig NEM dől el, tehát a mai számok élő meccsből
// valók — de ez a forgatókönyv tulajdonsága, nem örök igazság.
//
// HASZNÁLAT:  node tools/civ_valaszto_szonda.mjs
// Kilépési kód: 0 = rendben, 1 = bukás.

import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const GYOKER = dirname(dirname(fileURLToPath(import.meta.url)));
const be = (...r) => import(pathToFileURL(join(GYOKER, ...r)).href);

const { CIV, CIV_DB, CIV_NEV, HATAS, MIND, civBonuszai } = await be('src', 'sim', 'civ.js');
const { NYERS } = await be('src', 'sim', 'eroforras.js');
const { TIPUS } = await be('src', 'sim', 'units.js');
const { civValasztoAdat, civValasztoLista, elonyE, bonuszMondat } =
  await be('src', 'ui', 'civ_valaszto_adat.js');

let bukas = 0;
const sor = (a, b, c) => console.log('  ' + String(a).padEnd(30) + String(b).padEnd(22) + (c ?? ''));
const cim = (t) => console.log('\n' + t + '\n' + '─'.repeat(78));
const gat = (all, szoveg, reszlet) => {
  if (all) return true;
  console.log('\n  ⛔ ' + szoveg);
  if (reszlet) console.log('     ' + reszlet);
  bukas++;
  return false;
};

cim('AGE OF THE CRYSTALS — CIV-VÁLASZTÓ SZONDA (v0.11/1)');

const lista = civValasztoLista();

// ── 1. NYOLC NÉP, MINDEGYIKNEK ELŐNY ÉS HÁTRÁNY ───────────────────────────
cim('1. VIZSGÁLAT — nyolc nép, mindegyiknek van erénye ÉS gyengéje');
sor('nép', 'előny / hátrány', 'név');

gat(lista.length === CIV_DB, 'A LISTA NEM A NYOLC NÉPET ADTA.',
  'kapott: ' + lista.length + ', várt: ' + CIV_DB);

let mondatDb = 0;
for (let c = 0; c < lista.length; c++) {
  const a = lista[c];
  const ok = a.elony.length > 0 && a.hatrany.length > 0
    && a.nev.length > 0 && a.leiras.length > 10;
  mondatDb += a.elony.length + a.hatrany.length;
  sor(c, a.elony.length + ' / ' + a.hatrany.length, a.nev + (ok ? '' : '   ⛔'));
  gat(ok, 'A(Z) ' + c + '. NÉPNEK („' + a.nev + '") HIÁNYZIK AZ EGYIK OLDALA.',
    'előny ' + a.elony.length + ', hátrány ' + a.hatrany.length
    + ', leírás ' + a.leiras.length + ' karakter. Vagy a balansz-sor csupa pozitív '
    + '(akkor nincs választás, csak egy „legjobb" civ), vagy az olvasás hibás.');
}
sor('mondat összesen', mondatDb, mondatDb > 0 ? '' : '⛔ EGYETLEN MONDAT SEM');
gat(mondatDb > 0, 'A RÉTEG EGYETLEN MONDATOT SEM ÁLLÍTOTT ELŐ.');

// ── 2. NINCS SZEMÉT A MONDATOKBAN ─────────────────────────────────────────
cim('2. VIZSGÁLAT — nincs `undefined`, `NaN` és nyers tömbindex a szövegben');

// A nyers tömbindex nemcsak `[3]` alakban jelenhet meg: egy elfelejtett
// fordítás a konstans NEVÉT is beírhatná („UTEM", „TAMADAS.NYIL").
const SZEMET = [
  [/undefined/i, 'undefined'],
  [/\bNaN\b/, 'NaN'],
  [/\bnull\b/i, 'null'],
  [/\[\s*-?\d+\s*\]/, 'nyers tömbindex ([n])'],
  [/\b(HATAS|UTEM|SEBZES|PANCEL|CIPEL|NEPESSEG|TAMADAS|NYERS|TIPUS|MIND|EPULET_[A-Z]+|EGYSEG_[A-Z]+)\b/,
    'konstans-név'],
];
let szemetes = 0;
let vizsgaltMondat = 0;
for (let c = 0; c < lista.length; c++) {
  const t = lista[c].tetelek;
  for (let i = 0; i < t.length; i++) {
    vizsgaltMondat++;
    for (let s = 0; s < SZEMET.length; s++) {
      if (SZEMET[s][0].test(t[i].szoveg)) {
        szemetes++;
        console.log('  ⛔ ' + CIV_NEV[c] + ': „' + t[i].szoveg + '" — ' + SZEMET[s][1]);
      }
    }
    // Mondat-forma: nagybetűvel vagy számmal kezdődik, ponttal végződik.
    const forma = /^[A-ZÁÉÍÓÖŐÚÜŰ0-9]/.test(t[i].szoveg) && t[i].szoveg.endsWith('.')
      && t[i].szoveg.length >= 20;
    if (!forma) {
      szemetes++;
      console.log('  ⛔ ' + CIV_NEV[c] + ': nem mondat alakú: „' + t[i].szoveg + '"');
    }
  }
}
sor('vizsgált mondat', vizsgaltMondat, '');
sor('szemetes mondat', szemetes, szemetes === 0 ? 'tiszta' : '⛔');
gat(szemetes === 0, szemetes + ' MONDATBAN SZEMÉT VAGY HIBÁS FORMA VAN.',
  'Ez jellemzően hiányzó név-tábla elem: az index kifutott a `NYERS_NEV` / '
  + '`TAMADAS_NEV` / egységnév-tábla végén, és a `undefined` egyenesen a menübe ment.');

// ── 3. MINDEN BÓNUSZ-SORBÓL KELETKEZIK MONDAT ─────────────────────────────
cim('3. VIZSGÁLAT — egyetlen bónusz-sor sem vész el csendben');
sor('nép', 'sor → mondat', 'ismeretlen / nullás');
let elveszett = 0;
let ismeretlenOsszes = 0;
let nullasOsszes = 0;
for (let c = 0; c < CIV_DB; c++) {
  const a = lista[c];
  const sorok = civBonuszai(c).length;
  const mondatok = a.elony.length + a.hatrany.length;
  ismeretlenOsszes += a.ismeretlenDb;
  nullasOsszes += a.nullasDb;
  const ok = sorok === mondatok && sorok === a.tetelek.length;
  if (!ok) elveszett++;
  sor(CIV_NEV[c], sorok + ' → ' + mondatok,
    a.ismeretlenDb + ' / ' + a.nullasDb + (ok ? '' : '   ⛔'));
}
gat(elveszett === 0, elveszett + ' NÉPNÉL ELVESZETT EGY BÓNUSZ-SOR.',
  'A `civBonuszai()` több sort ad, mint ahány mondat születik — egy `HATAS`-ág '
  + 'nincs lekezelve, és a kártya kevesebbet mutat, mint amit a civ tud.');
gat(ismeretlenOsszes === 0, ismeretlenOsszes + ' BÓNUSZ-SORT NEM ISMER A SZÖVEG-RÉTEG.',
  'Új `HATAS` került a `civ.js`-be a `bonuszMondat()` bővítése nélkül.');
gat(nullasOsszes === 0, nullasOsszes + ' BÓNUSZ-SOR ÉRTÉKE NULLA.',
  'A sor foglalja a helyet, de nem csinál semmit — elrontott balansz-sor.');

// ── 4. A FORDÍTOTT OLVASAT, NÉVVEL ────────────────────────────────────────
cim('4. VIZSGÁLAT — ⚠️ az ÁR és az IDŐ fordítva olvasandó');
console.log('  A nagyobb ár és a hosszabb képzési idő ROSSZ. Ezt az előjel');
console.log('  önmagában nem árulja el — ezért NÉVVEL rögzített tételek állnak itt.\n');
const sor4 = (a, b, c) => console.log('  ' + String(a).padEnd(22) + String(b).padEnd(34) + c);
sor4('nép', 'tétel', 'várt oldal');

/** @type {[number, number, number, boolean, string][]} */
const VART = [
  // civ,                    hatás,             index,       előny-e, mit mond
  [CIV.KRISTALYKOVACS, HATAS.EGYSEG_AR, MIND, false, '+10 % egység-ár → HÁTRÁNY'],
  [CIV.KRISTALYKOVACS, HATAS.UTEM, NYERS.KRISTALY, true, '+15 % kristály-ütem → előny'],
  [CIV.PUSZTAI_LOVAS, HATAS.EGYSEG_AR, TIPUS.LOVAG, true, '−10 % lovag-ár → ELŐNY'],
  [CIV.PUSZTAI_LOVAS, HATAS.EGYSEG_IDO, TIPUS.LOVAG, true, '−15 % lovag-idő → ELŐNY'],
  [CIV.HEGYI_BANYASZ, HATAS.EPULET_AR, MIND, true, '−10 % épület-ár → ELŐNY'],
  [CIV.HEGYI_BANYASZ, HATAS.EGYSEG_IDO, MIND, false, '+10 % képzési idő → HÁTRÁNY'],
  [CIV.FENYHOZO, HATAS.EPULET_AR, MIND, false, '+15 % épület-ár → HÁTRÁNY'],
  [CIV.SIVATAGI_PORTYAZO, HATAS.EGYSEG_AR, MIND, true, '−10 % egység-ár → ELŐNY'],
  [CIV.SIVATAGI_PORTYAZO, HATAS.PANCEL, MIND, false, '−1 páncél → hátrány'],
];
for (let k = 0; k < VART.length; k++) {
  const [c, hatas, index, vartElony, magyarazat] = VART[k];
  const a = civValasztoAdat(c);
  const t = a.tetelek.find((x) => x.hatas === hatas && x.index === index);
  if (!gat(t !== undefined, 'NINCS ILYEN BÓNUSZ-SOR: ' + CIV_NEV[c] + ' — ' + magyarazat,
    'A balansz-táblázat megváltozott a `civ.js`-ben; a szondát is frissíteni kell.')) continue;

  const lista2 = vartElony ? a.elony : a.hatrany;
  const jolAll = t.elony === vartElony && lista2.indexOf(t.szoveg) >= 0;
  sor4(CIV_NEV[c], magyarazat,
    (t.elony ? 'előny' : 'hátrány') + (jolAll ? '  ✓' : '  ⛔'));
  gat(jolAll, 'ROSSZ OLDALON ÁLL: ' + CIV_NEV[c] + ' — ' + magyarazat,
    'A mondat („' + t.szoveg + '") a ' + (t.elony ? 'ELŐNY' : 'HÁTRÁNY')
    + ' listában van, pedig a ' + (vartElony ? 'ELŐNY' : 'HÁTRÁNY') + 'be való. '
    + 'Az ÁR és az IDŐ fordított olvasatú: nagyobb érték = rosszabb.');
}

// A döntést közvetlenül is megnézzük, nem csak a táblázaton keresztül — így
// a gát akkor is fog, ha valaki a balansz-táblát írja át a logika helyett.
const FORDITOTT_HATASOK = [HATAS.EPULET_AR, HATAS.EGYSEG_AR, HATAS.EGYSEG_IDO];
const EGYENES_HATASOK = [HATAS.SEBZES, HATAS.PANCEL, HATAS.UTEM, HATAS.CIPEL,
  HATAS.EPULET_HP, HATAS.NEPESSEG];
let iranyHiba = 0;
for (const h of FORDITOTT_HATASOK) {
  if (elonyE(h, +10) !== false || elonyE(h, -10) !== true) iranyHiba++;
}
for (const h of EGYENES_HATASOK) {
  if (elonyE(h, +10) !== true || elonyE(h, -10) !== false) iranyHiba++;
}
if (elonyE(HATAS.PANCEL, 0) !== false) iranyHiba++;
sor('irány-döntés (9 hatás)', iranyHiba === 0 ? 'mind helyes' : iranyHiba + ' hibás',
  iranyHiba === 0 ? '' : '⛔');
gat(iranyHiba === 0, iranyHiba + ' HATÁSNÁL AZ ELŐNY/HÁTRÁNY IRÁNYA HIBÁS.');

// ── 5. HATÁS-LEFEDETTSÉG ──────────────────────────────────────────────────
cim('5. VIZSGÁLAT — a mondat-építő MINDEN ága megjárva');
const HATAS_NEV = {
  [HATAS.SEBZES]: 'SEBZES', [HATAS.PANCEL]: 'PANCEL', [HATAS.UTEM]: 'UTEM',
  [HATAS.CIPEL]: 'CIPEL', [HATAS.EPULET_HP]: 'EPULET_HP',
  [HATAS.EPULET_AR]: 'EPULET_AR', [HATAS.EGYSEG_AR]: 'EGYSEG_AR',
  [HATAS.EGYSEG_IDO]: 'EGYSEG_IDO', [HATAS.NEPESSEG]: 'NEPESSEG',
};
const HATAS_KODOK = Object.keys(HATAS).map((k) => HATAS[k]).sort((a, b) => a - b);
const eloszor = new Map();
for (let c = 0; c < CIV_DB; c++) {
  for (const t of lista[c].tetelek) {
    if (!eloszor.has(t.hatas)) eloszor.set(t.hatas, { civ: c, szoveg: t.szoveg });
  }
}
let hianyzo = 0;
for (const kod of HATAS_KODOK) {
  const p = eloszor.get(kod);
  if (!p) { hianyzo++; sor(HATAS_NEV[kod] ?? kod, '— nincs a táblában', '⛔'); continue; }
  sor(HATAS_NEV[kod] ?? kod, CIV_NEV[p.civ].slice(0, 20), '„' + p.szoveg + '"');
}
gat(hianyzo === 0, hianyzo + ' `HATAS` KÓDRA EGYETLEN CIV SEM ÉPÍT.',
  'Az ága sosem fut le, tehát a hibája csak a v0.13 hangolásakor derülne ki. '
  + 'Vedd bele valamelyik nép balansz-sorába, vagy vedd ki a `HATAS`-ból.');

// A `MIND` és a KONKRÉT index mindkét ága fusson — a `MIND` szétterítése a
// leggyakoribb elfelejtett eset.
let mindDb = 0;
let konkretDb = 0;
for (let c = 0; c < CIV_DB; c++) {
  for (const t of lista[c].tetelek) (t.index === MIND ? mindDb++ : konkretDb++);
}
sor('MIND / konkrét index', mindDb + ' / ' + konkretDb,
  mindDb > 0 && konkretDb > 0 ? 'mindkét ág megjárva' : '⛔');
gat(mindDb > 0 && konkretDb > 0, 'AZ INDEX EGYIK ÁGA SOSEM FUT LE.');

// ── 6. A MONDATOK TÉNYLEG KÜLÖNBÖZNEK ─────────────────────────────────────
cim('6. VIZSGÁLAT — a mondatok nem egy sablonból jönnek');
const kulonMondat = new Set();
const kulonHarmas = new Set();
for (let c = 0; c < CIV_DB; c++) {
  for (const t of lista[c].tetelek) {
    kulonMondat.add(t.szoveg);
    kulonHarmas.add(t.hatas + '|' + t.index + '|' + t.ertek);
  }
}
sor('különböző hármas', kulonHarmas.size, '[hatás, index, érték]');
sor('különböző mondat', kulonMondat.size,
  kulonMondat.size === kulonHarmas.size ? 'egy hármas → egy mondat' : '⛔');
gat(kulonMondat.size === kulonHarmas.size,
  'KÉT KÜLÖNBÖZŐ BÓNUSZ UGYANAZT A MONDATOT ADJA.',
  kulonHarmas.size + ' különböző hármasra csak ' + kulonMondat.size
  + ' különböző mondat jut. Egy sablon-hiba (elfelejtett érték vagy név a '
  + 'szövegben) minden más gáton átmenne — ez fogja meg.');

// Az ismeretlen bemenet NE mondattá váljon, hanem `null`-lá — a hívó ebből
// tudja, hogy hibát kell mutatnia, nem félrevezető szöveget.
const rosszak = [
  [999, MIND, 10], [HATAS.UTEM, 77, 10], [HATAS.SEBZES, 77, 1],
  [HATAS.EGYSEG_AR, 77, -10], [HATAS.EGYSEG_IDO, 77, -10],
];
let elnyelt = 0;
for (const [h, i, e] of rosszak) if (bonuszMondat(h, i, e) !== null) elnyelt++;
sor('érvénytelen bemenet', rosszak.length + ' próba',
  elnyelt === 0 ? 'mind `null`-t ad' : elnyelt + ' MONDATTÁ VÁLT ⛔');
gat(elnyelt === 0, elnyelt + ' ÉRVÉNYTELEN BEMENETRE MONDAT SZÜLETETT.',
  'Egy kifutott index így „undefined"-dal a menübe kerülne, hiba nélkül.');

// ── PÉLDA-KIÍRÁS ──────────────────────────────────────────────────────────
cim('AMIT A JÁTÉKOS LÁTNI FOG');
for (let c = 0; c < CIV_DB; c++) {
  const a = lista[c];
  console.log('\n  ' + a.nev.toUpperCase());
  console.log('    ' + a.leiras.replace(/(.{1,68})(\s|$)/g, '$1\n    ').trimEnd());
  for (const m of a.elony) console.log('    + ' + m);
  for (const m of a.hatrany) console.log('    − ' + m);
}

cim('ÍTÉLET');
if (bukas === 0) {
  console.log('  ✅ A CIV-VÁLASZTÓ ADATRÉTEGE MŰKÖDIK:');
  console.log('     ' + CIV_DB + ' nép · ' + mondatDb + ' mondat · '
    + kulonMondat.size + ' különböző · ' + HATAS_KODOK.length + ' hatás-ág megjárva');
  console.log('     az ÁR és az IDŐ fordított olvasata ' + VART.length
    + ' névvel rögzített tételen ellenőrizve.');
} else {
  console.log('  ❌ ' + bukas + ' vizsgálat BUKOTT.');
}
console.log('');
process.exit(bukas === 0 ? 0 : 1);
