// AGE OF THE CRYSTALS — SZÖVEG-SZONDA (v0.20 előkészítés).
//
// ── MIÉRT KELL EGY SZÓTÁRNAK SAJÁT KAPU ───────────────────────────────────
// Mert a kétnyelvűség pontosan olyan hibafajtát termel, amire se a
// determinizmus-, se a panel-szondák nem tudnak ránézni: a FÉLIG lefordított
// felület. A magyar oldal zöld, a build zöld, a determinizmus zöld — és az
// angol felületen minden ötödik gomb üres vagy magyar. A `PLAN.md` v0.19-es
// szakasza is ezt emeli ki: „enélkül a nyelvváltás felerészben megtörténne,
// ami rosszabb, mint ha egynyelvű maradna."
//
// ── A HAT VIZSGÁLAT, ÉS MELYIK MILYEN HIBÁBÓL SZÜLETETT ───────────────────
// 1. KULCS-KÉSZLET — a két nyelv kulcsai megegyeznek. Az árva kulcs KÉT
//    irányban káros, és a ritkábban emlegetett irány a rosszabb: a csak-magyar
//    kulcs «jelölőt» ír az angol képernyőre (látszik), a csak-angol kulcs
//    viszont halott szöveg, amit SENKI nem lát meg soha.
// 2. FELOLDHATÓSÁG — minden kulcs tényleg feloldódik, SZIGORÚ módban, mindkét
//    nyelven. A laza mód elnyelné a hibát egy jelölővel; itt nem nyelheti el.
// 3. TÁBLA-HOSSZAK — minden enum-indexelt kulcs-tábla pontosan olyan hosszú,
//    mint a saját enumja, és a magyar felirat betűre az, ami MA a simben áll.
//    Ez a `KIADAS_ELVARASOK.md` G) szakasza szövegre alkalmazva.
// 4. A NYELVVÁLTÁS TÉNYLEG CSINÁL VALAMIT — ez a `CLAUDE.md` külön kikötése:
//    „a semmittevés is tökéletesen reprodukálható". Egy szótár, ami mindkét
//    nyelven ugyanazt adja, minden formai gátat teljesít, és használhatatlan.
//    Ezért MEGSZÁMOLJUK, hány kulcs értéke tér el ténylegesen.
// 5. NULLA ALLOKÁCIÓ — a feloldó a panelek `frissit()`-jéből fut. Nem
//    időmérésből döntjük el (a felhő-gép osztott CPU-ján a `ms` semmit nem
//    jelent, lásd a `CLAUDE.md` figyelmeztetését), hanem a FORRÁSBÓL: a `sz()`
//    törzsében nem lehet sztring-építés. Ez determinisztikus, és pont azt a
//    visszacsúszást fogja meg, amit egy „csak egy pluszjel" okozna.
// 6. SZABOTÁZS — tizenkét szándékos rontás, mindegyiknek pirosat KELL adnia.
//    Egy elvárás, ami a szabotázsra nem reagál, nem elvárás (a `KIADAS_
//    ELVARASOK.md` 39. pontja pont ezt a leckét írja le).
//
// HASZNÁLAT: node tools/szoveg_szonda.mjs · npm run szoveg
// ⚠️ Az `npm run szoveg` parancs a `package.json`-ban MÉG NINCS FELVÉVE (az a
// fájl ebben a körben más gazdájáé) — addig kézzel indítandó, és a
// `kiadas_ellenorzo.mjs` 31/33. elvárása emiatt pirosat mutat rá. A felvenni
// való sor: `"szoveg": "node tools/szoveg_szonda.mjs"`, és bele a `szonda`
// láncba is.
// Kilépési kód: 0 = minden gát zöld · 1 = bukott gát.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  sz, szF, szT, van, nyelv, nyelvValt, generacio, szigoruMod,
  hianyDb, hianyzoKulcsok, hianyNullaz, ellenorzes,
  NYELVEK, NYELV_CIMKE,
} from '../src/ui/szoveg.js';
import { HU } from '../src/ui/szoveg_hu.js';
import { EN } from '../src/ui/szoveg_en.js';
import { SIM_TABLAK, tablakEllenorzes, EPULET_KULCS, TIPUS_KULCS } from '../src/ui/szoveg_sim.js';

const GYOKER = join(dirname(fileURLToPath(import.meta.url)), '..');
/** A réteg fájljai — a forrás-vizsgálathoz és a kiadás-ellenőrző fájl-eléréséhez. */
const FAJLOK = ['szoveg.js', 'szoveg_hu.js', 'szoveg_en.js', 'szoveg_sim.js'];

let bukott = 0;
const cim = (s) => console.log('\n' + s + '\n' + '─'.repeat(84));
const sor = (a, b, c = '') => console.log('  ' + String(a).padEnd(34) + String(b).padEnd(24) + c);
function gat(ok, uzenet, reszlet = '') {
  if (ok) return;
  bukott++;
  console.log('  ⛔ ' + uzenet);
  if (reszlet) console.log('     ' + String(reszlet).split('\n').slice(0, 8).join('\n     '));
}

console.log('AGE OF THE CRYSTALS — SZÖVEG-SZONDA');

const TARAK = { hu: HU, en: EN };
const HU_KULCSOK = Object.keys(HU).sort();
const EN_KULCSOK = Object.keys(EN).sort();

// ════════════════════════════════════════════════════════════════════════════
cim('1. VIZSGÁLAT — a két nyelv KULCS-KÉSZLETE megegyezik (nincs árva kulcs)');

const csakHu = HU_KULCSOK.filter((k) => EN[k] === undefined);
const csakEn = EN_KULCSOK.filter((k) => HU[k] === undefined);

sor('támogatott nyelv', NYELVEK.length, NYELVEK.map((n) => n + ' = ' + NYELV_CIMKE[n]).join(' · '));
sor('magyar kulcs', HU_KULCSOK.length);
sor('angol kulcs', EN_KULCSOK.length);
sor('csak magyarul van meg', csakHu.length, csakHu.slice(0, 5).join(', ') || 'nincs');
sor('csak angolul van meg', csakEn.length, csakEn.slice(0, 5).join(', ') || 'nincs');

gat(csakHu.length === 0, 'VAN CSAK-MAGYAR KULCS — az angol felületen «jelölő» lesz belőle.',
  csakHu.join(', '));
gat(csakEn.length === 0, 'VAN CSAK-ANGOL KULCS — halott szöveg, amit senki sem lát.',
  csakEn.join(', '));

// A réteg saját ellenőrzése ugyanezt (és többet) mond: ha ez eltérne a fenti
// két listától, akkor az `ellenorzes()` a hazug, nem a szótár.
const onEllenorzes = ellenorzes();
sor('szoveg.js ellenorzes()', onEllenorzes.length ? onEllenorzes.length + ' hiba' : 'RENDBEN');
gat(onEllenorzes.length === 0, 'A RÉTEG SAJÁT ELLENŐRZÉSE HIBÁT TALÁLT.', onEllenorzes.join('\n'));

// ════════════════════════════════════════════════════════════════════════════
cim('2. VIZSGÁLAT — MINDEN kulcs feloldható, SZIGORÚ módban, mindkét nyelven');

// ⚠️ Szigorú mód: itt nincs játékos, akit egy dobás zavarna, viszont van kapu,
// aminek pirosat kell mutatnia. Laza módban a hiány jelölővé szelídülne, és a
// szonda zölden futna végig egy félkész szótáron.
szigoruMod(true);
hianyNullaz();

let feloldva = 0;
let ures = 0;
let tobbesAlak = 0;
const feloldasiHibak = [];
for (const kod of NYELVEK) {
  nyelvValt(kod);
  for (const k of HU_KULCSOK) {
    const nyers = TARAK[kod][k];
    try {
      const v = Array.isArray(nyers) ? szT(k, 2) : sz(k);
      if (Array.isArray(nyers)) tobbesAlak++;
      if (typeof v !== 'string' || v.length === 0) { ures++; feloldasiHibak.push(kod + ':' + k); }
      feloldva++;
    } catch (e) {
      feloldasiHibak.push(kod + ':' + k + ' → ' + e.message);
    }
  }
}
nyelvValt('hu');

sor('feloldott kulcs (2 nyelv)', feloldva, 'ebből többes alakú: ' + tobbesAlak);
sor('üres vagy nem string', ures);
sor('feloldási hiba', feloldasiHibak.length, feloldasiHibak.slice(0, 4).join(' | ') || 'nincs');
gat(feloldasiHibak.length === 0, 'VAN FEL NEM OLDHATÓ KULCS.', feloldasiHibak.join('\n'));
gat(feloldva === HU_KULCSOK.length * NYELVEK.length,
  'NEM MINDEN KULCS OLDÓDOTT FEL MINDKÉT NYELVEN.',
  feloldva + ' / ' + (HU_KULCSOK.length * NYELVEK.length));
gat(tobbesAlak > 0, 'NINCS EGYETLEN TÖBBES ALAKÚ KULCS SEM — a `szT()` ága halott kód.');

// A helyőrzős minták külön: `szF` mindkét nyelven, valódi értékekkel.
const HELYORZOS = HU_KULCSOK.filter((k) => /\{[012]\}/.test(String(HU[k])) || /\{[012]\}/.test(String(EN[k])));
let formazasiHiba = 0;
for (const kod of NYELVEK) {
  nyelvValt(kod);
  for (const k of HELYORZOS) {
    if (Array.isArray(TARAK[kod][k])) continue;
    try {
      const v = szF(k, 'A', 'B', 'C');
      if (v.indexOf('{') >= 0 || v.indexOf('«') >= 0) formazasiHiba++;
    } catch { formazasiHiba++; }
  }
}
nyelvValt('hu');
sor('helyőrzős minta', HELYORZOS.length);
sor('behelyettesítési hiba', formazasiHiba);
gat(formazasiHiba === 0, 'VAN OLYAN MINTA, AMIBEN HELYŐRZŐ MARADT BEHELYETTESÍTÉS UTÁN.');
szigoruMod(false);

// ════════════════════════════════════════════════════════════════════════════
cim('3. VIZSGÁLAT — az ENUM-INDEXELT kulcs-táblák hossza és hűsége');

// ⚠️ A SIM ENUMJAIBÓL indulunk, nem a kulcs-táblák saját hosszából: ha onnan
// kérdeznénk, a tábla önmagával mindig egyezne. Ugyanaz a szabály, amiért az
// `ikon_szonda.mjs` is a sim enumjait olvassa.
const tablaHibak = tablakEllenorzes();
let osszKulcs = 0;
let hidaltTabla = 0;
for (const t of SIM_TABLAK) {
  osszKulcs += t.kulcsok.length;
  if (t.simTabla) hidaltTabla++;
}
sor('kulcs-tábla', SIM_TABLAK.length, 'összesen ' + osszKulcs + ' kulcs');
sor('sim-táblához kötött', hidaltTabla, 'a többi UI-oldali (TIPUS, ragozott alakok)');
sor('tábla-hiba', tablaHibak.length ? tablaHibak.length : 'nincs');
gat(tablaHibak.length === 0, 'HIBÁS KULCS-TÁBLA (hossz, feloldhatóság vagy hűség).',
  tablaHibak.join('\n'));

// Kézzel is megnézünk kettőt, hogy a nyilvántartás maga se hazudhasson.
sor('EPULET_KULCS hossza', EPULET_KULCS.length, 'elvárt 11');
sor('TIPUS_KULCS hossza', TIPUS_KULCS.length, 'elvárt 6');
gat(EPULET_KULCS.length === 11, 'AZ EPULET_KULCS NEM 11 ELEMŰ.');
gat(TIPUS_KULCS.length === 6, 'A TIPUS_KULCS NEM 6 ELEMŰ.');

// ════════════════════════════════════════════════════════════════════════════
cim('4. VIZSGÁLAT — a nyelvváltás TÉNYLEG csinál valamit');

// ⚠️ Ez a `CLAUDE.md` külön kikötése: „a semmittevés is tökéletesen
// reprodukálható". Egy szótár, amiben az angol oldal a magyar MÁSOLATA, minden
// formai gátat teljesít — és semmit nem fordít le. A v0.3 gazdasága pontosan
// így volt zöld hat vizsgálaton, miközben 400 munkásból 285 beragadt.
let elter = 0;
let azonos = 0;
const azonosak = [];
for (const k of HU_KULCSOK) {
  const a = JSON.stringify(HU[k]);
  const b = JSON.stringify(EN[k]);
  if (a === b) { azonos++; azonosak.push(k); } else elter++;
}
const arany = Math.round((elter / HU_KULCSOK.length) * 100);

const genElott = generacio();
nyelvValt('en');
const enTorony = sz(EPULET_KULCS[9]);
const genUtan = generacio();
nyelvValt('hu');
const huTorony = sz(EPULET_KULCS[9]);

sor('eltérő felirat', elter, arany + ' %');
sor('betűre azonos', azonos, azonosak.slice(0, 6).join(', ') || 'nincs');
sor('torony hu → en', huTorony + ' → ' + enTorony);
sor('generáció nőtt', genElott + ' → ' + genUtan, 'a panelek ebből tudják, hogy újrarajzoljanak');

gat(arany >= 80, 'AZ ANGOL SZÓTÁR TÚL NAGY RÉSZE BETŰRE A MAGYAR MÁSOLATA.',
  arany + ' % tér el, elvárt legalább 80 %');
gat(huTorony !== enTorony, 'A NYELVVÁLTÁS UGYANAZT A FELIRATOT ADJA VISSZA.');
gat(genUtan > genElott, 'A GENERÁCIÓ-SZÁM NEM NŐTT NYELVVÁLTÁSKOR — a panelek nem rajzolnának újra.');
gat(nyelv() === 'hu', 'A NYELVVÁLTÁS NEM ÁLLT VISSZA MAGYARRA.');

// ════════════════════════════════════════════════════════════════════════════
cim('5. VIZSGÁLAT — a feloldó NEM allokál (forrásból, nem időmérésből)');

// ⚠️ MIÉRT NEM MÉRÜNK IDŐT: a `CLAUDE.md` kimondja, hogy a felhő-gép osztott
// CPU-ján két futás ms-száma nem összevethető (0,58 reggel, 0,88 este,
// ugyanazzal a koddal). Egy időre épített allokáció-gát vagy hamis riasztást
// adna, vagy elnyelné a valódi romlást. A forrás viszont determinisztikus.
const forras = readFileSync(join(GYOKER, 'src', 'ui', FAJLOK[0]), 'utf8');
const szTorzs = /export function sz\s*\(kulcs\)\s*\{([\s\S]*?)\n\}/.exec(forras);
const TILTOTT = [
  ['sztring-összefűzés (+)', /\+/],
  ['sablon-literál (`)', /`/],
  ['tömb-literál', /\[\s*\]/],
  ['objektum-literál', /\{\s*\w+\s*:/],
  ['.replace(', /\.replace\(/],
  ['.concat(', /\.concat\(/],
  ['.join(', /\.join\(/],
  ['.slice(', /\.slice\(/],
  ['String(', /\bString\(/],
];
const talaltTiltott = [];
if (szTorzs) {
  for (const [nev, minta] of TILTOTT) if (minta.test(szTorzs[1])) talaltTiltott.push(nev);
}
sor('sz() törzse megvan', szTorzs ? 'igen' : 'NEM');
sor('tiltott művelet a törzsben', talaltTiltott.length, talaltTiltott.join(', ') || 'nincs');
gat(!!szTorzs, 'NEM TALÁLHATÓ A `sz()` TÖRZSE — a forrás-vizsgálat vakon futott.');
gat(talaltTiltott.length === 0, 'A `sz()` TÖRZSE ALLOKÁL — a panelek `frissit()`-je ezt hívja.',
  talaltTiltott.join(', '));

// A találat a TÁROLT stringet adja vissza, nem másolatot: érték szerint egyezik
// a szótár sorával. (Ha bármelyik hívás átalakítaná — trim, csere —, itt esne ki.)
let sertetlen = 0;
for (const k of HU_KULCSOK) if (typeof HU[k] === 'string' && sz(k) === HU[k]) sertetlen++;
const varhatoSertetlen = HU_KULCSOK.filter((k) => typeof HU[k] === 'string').length;
sor('sértetlenül visszaadott', sertetlen + ' / ' + varhatoSertetlen);
gat(sertetlen === varhatoSertetlen, 'A `sz()` NEM A TÁROLT FELIRATOT ADJA VISSZA.');

// Minden fájl fejléccel kezdődik (a kiadás-ellenőrző 15./D) elvárása a UI-ra).
const fejlecNelkul = FAJLOK.filter((f) => !readFileSync(join(GYOKER, 'src', 'ui', f), 'utf8').startsWith('//'));
sor('fejléc nélküli fájl', fejlecNelkul.length, fejlecNelkul.join(', ') || 'nincs');
gat(fejlecNelkul.length === 0, 'VAN KOMMENT-FEJLÉC NÉLKÜLI SZÖVEG-FÁJL.', fejlecNelkul.join(', '));

// ════════════════════════════════════════════════════════════════════════════
cim('6. VIZSGÁLAT — SZABOTÁZS: minden gátnak pirosat KELL adnia');

// ⚠️ Ez a szonda legfontosabb szakasza. A fenti öt vizsgálat mind ZÖLD egy
// olyan szótáron is, ami sosem lett kipróbálva hibás bemeneten — a
// `KIADAS_ELVARASOK.md` 39. pontja pontosan ezt a leckét írja le: „egy elvárás,
// ami a szabotázsra nem reagál, nem elvárás".
const masolat = (o) => Object.assign(Object.create(null), o);
const szabotazsok = [];
function szabotazs(nev, fv) {
  let elkapta = false;
  let mit = '';
  try {
    const eredmeny = fv();
    elkapta = Array.isArray(eredmeny) ? eredmeny.length > 0 : !!eredmeny;
    mit = Array.isArray(eredmeny) ? (eredmeny[0] || '') : String(eredmeny || '');
  } catch (e) {
    elkapta = true;
    mit = e.message;
  }
  szabotazsok.push({ nev, elkapta, mit });
}

// (a) hiányzó kulcs az angol oldalon
szabotazs('hiányzó angol kulcs', () => {
  const en = masolat(EN);
  delete en['sim.epulet.torony'];
  return ellenorzes({ hu: HU, en });
});
// (b) árva kulcs az angol oldalon
szabotazs('árva angol kulcs', () => {
  const en = masolat(EN);
  en['csak.angolul.letezik'] = 'orphan';
  return ellenorzes({ hu: HU, en });
});
// (c) üres felirat
szabotazs('üres felirat', () => {
  const en = masolat(EN);
  en['hud.nepesseg'] = '';
  return ellenorzes({ hu: HU, en });
});
// (d) eltűnt helyőrző — némán eltűnő ADAT a képernyőn
szabotazs('eltűnt {1} helyőrző', () => {
  const en = masolat(EN);
  en['fmt.sorban_kesz'] = '{0} queued';
  return ellenorzes({ hu: HU, en });
});
// (e) rossz alakú többes szám
szabotazs('egytagú többes-pár', () => {
  const en = masolat(EN);
  en['fmt.egyseg_db'] = ['{0} unit'];
  return ellenorzes({ hu: HU, en });
});
// (f) nem string és nem pár
szabotazs('szám az érték helyén', () => {
  const en = masolat(EN);
  en['hud.korszak'] = 42;
  return ellenorzes({ hu: HU, en });
});
// (g) RÖVID kulcs-tábla — a projekt legrégebbi néma hibája
szabotazs('rövid EPULET_KULCS', () => {
  const t = SIM_TABLAK.map((x) => (x.nev === 'EPULET_KULCS'
    ? Object.assign({}, x, { kulcsok: x.kulcsok.slice(0, 10) }) : x));
  return tablakEllenorzes({ tablak: t });
});
// (h) HOSSZABB kulcs-tábla (a rövid ellenpárja — a túlcímzés is hiba)
szabotazs('túl hosszú TIPUS_KULCS', () => {
  const t = SIM_TABLAK.map((x) => (x.nev === 'TIPUS_KULCS'
    ? Object.assign({}, x, { kulcsok: x.kulcsok.concat(['sim.tipus.nincs_ilyen']) }) : x));
  return tablakEllenorzes({ tablak: t });
});
// (i) a szótár elsodródott a sim szövegétől
szabotazs('szótár ≠ sim szövege', () => {
  const hu = masolat(HU);
  hu['sim.epulet.ijaszda'] = 'íjászterem';
  return tablakEllenorzes({ hu, en: EN });
});
// (j) a sim MÁR kulcsot ad, de az nincs a szótárban (az átállás napja)
szabotazs('sim kulcsot ad, szótár nem ismeri', () => {
  const t = SIM_TABLAK.map((x) => (x.nev === 'ALAKZAT_KULCS'
    ? Object.assign({}, x, { simTabla: ['sim.alakzat.negyzet', 'sim.alakzat.vonal', 'sim.alakzat.nincs_ilyen', 'sim.alakzat.szort'] }) : x));
  return tablakEllenorzes({ tablak: t });
});
// (k) ismeretlen kulcs SZIGORÚ módban → dobnia kell
szabotazs('ismeretlen kulcs (szigorú)', () => {
  szigoruMod(true);
  try { sz('nincs.ilyen.kulcs'); return false; } finally { szigoruMod(false); }
});
// (l) ismeretlen kulcs LAZA módban → jelölő + számláló, SOSEM üres string
szabotazs('ismeretlen kulcs (laza)', () => {
  hianyNullaz();
  const v = sz('nincs.ilyen.kulcs');
  const rendben = v !== '' && v.indexOf('nincs.ilyen.kulcs') >= 0
    && hianyDb() === 1 && hianyzoKulcsok().length === 1;
  hianyNullaz();
  return rendben ? 'jelölő: ' + v : false;
});
// (m) ismeretlen NYELV → dobnia kell
szabotazs('ismeretlen nyelvkód', () => { nyelvValt('de'); return false; });
// (n) hiányzó behelyettesítendő érték szigorú módban → dobnia kell
szabotazs('hiányzó {1} érték (szigorú)', () => {
  szigoruMod(true);
  try { szF('fmt.sorban_kesz', 5); return false; } finally { szigoruMod(false); }
});

for (const s of szabotazsok) {
  sor(s.nev, s.elkapta ? '✅ elkapva' : '⛔ ÁTMENT', s.elkapta ? s.mit.slice(0, 60) : '');
}
const atment = szabotazsok.filter((s) => !s.elkapta);
sor('szabotázs', szabotazsok.length, atment.length + ' ment át észrevétlenül');
gat(atment.length === 0, 'VAN SZABOTÁZS, AMIT EGYIK GÁT SEM VETT ÉSZRE.',
  atment.map((s) => s.nev).join(', '));

// A szonda a saját mellékhatásait is takarítja: a laza mód és a magyar nyelv
// az alapállapot, és a hiány-számlálónak nullán kell állnia a végén.
szigoruMod(false);
nyelvValt('hu');
gat(hianyDb() === 0, 'A SZONDA VÉGÉN NEM NULLA A HIÁNY-SZÁMLÁLÓ.',
  hianyzoKulcsok().join(', '));
gat(van('hud.korszak') && !van('nincs.ilyen.kulcs'), 'A `van()` rosszul válaszol.');

// ════════════════════════════════════════════════════════════════════════════
cim('ÍTÉLET');
sor('kulcs (nyelvenként)', HU_KULCSOK.length);
sor('enum-indexelt kulcs-tábla', SIM_TABLAK.length);
sor('szabotázs elkapva', (szabotazsok.length - atment.length) + ' / ' + szabotazsok.length);
sor('BUKOTT GÁT', bukott);
console.log('');
console.log(bukott === 0
  ? '  ✅ A SZÖVEG-RÉTEG ÁLL — a két nyelv kulcs-készlete egyezik, és a kapu tud pirosat mutatni.'
  : '  ⛔ ' + bukott + ' GÁT BUKOTT.');
process.exit(bukott === 0 ? 0 : 1);
