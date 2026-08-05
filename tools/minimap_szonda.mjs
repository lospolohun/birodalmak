// AGE OF THE CRYSTALS — MINIMAP-SZONDA (v0.16).
//
// ── MIÉRT VAN EZ EGYÁLTALÁN ───────────────────────────────────────────────
// A minimap az a felület, amit „szemre" szokás elfogadni — és pont ezért a
// projekt legveszélyesebb helye. A felhőben NINCS szem (nincs GPU, lásd
// CLAUDE.md), a determinizmus-szonda pedig hash-eket néz: egy minimap, ami
// egyszínű szürke négyzetet rajzol, bitre ugyanolyan reprodukálható, mint egy
// működő. A zöld kapu itt SEMMIT nem jelentene.
//
// Ezért ez a szonda nem azt kérdezi, hogy „lefut-e", hanem hogy MEKKORA SZÁMOK
// jönnek ki belőle, és — ami fontosabb — hogy a gátak KÉPESEK-E BUKNI. Öt
// vizsgálat SZABOTÁZZSAL dolgozik: elrontjuk a bemenetet, és megköveteljük,
// hogy a szám elromoljon. Egy gát, ami sosem tud pirosat mutatni, díszlet.
//
// ── MIT MÉR ───────────────────────────────────────────────────────────────
//   1. FEDÉS      hány világ-cellát fed egy képpont, és minden képpont kap-e
//                 színt egyáltalán (nincs kitöltetlen folt)
//   2. DOMBORZAT  ugyanaz a terep-típus KÜLÖNBÖZŐ fényerőt kap magasság és
//                 lejtő szerint  ⚠️ SZABOTÁZS: lapos pálya → a szórás essen
//   3. LELŐHELY   mind a négy nyersanyag megkülönböztethető színnel van rajta
//   4. KÖD        sötét / emlékezett / megvilágított képpontok aránya
//                 ⚠️ SZABOTÁZS: mindent-látó köd → a sötét essen nullára
//   5. SZIVÁRGÁS  a ködben álló IDEGEN egység nem kerül a képre
//                 ⚠️ SZABOTÁZS mindkét irányban (rejtve marad / előbukkan)
//   6. TERÜLET    a birtokolt terület látszik, de az ELLENSÉGÉ csak akkor, ha
//                 az épülete is látszik  ⚠️ SZABOTÁZS: ködbe rejtett bázis
//   7. RITKÍTÁS   1600 egység hány KÉPPONT-írássá esik össze
//   8. NÉZET-KERET a trapéz tartalmazza a kamera célpontját, és követi a
//                 forgatást  ⚠️ SZABOTÁZS: felülnézet → szimmetrikus keret
//   9. ÁLLANDÓSÁG kétszer ugyanaz a hívás bitre ugyanazt adja, és a mozgó
//                 réteg nem allokál számláló-objektumot
//
// HASZNÁLAT:  node tools/minimap_szonda.mjs
// Kilépési kód: 0 = rendben, 1 = bukás.

import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const GYOKER = dirname(dirname(fileURLToPath(import.meta.url)));
const be = (...r) => import(pathToFileURL(join(GYOKER, ...r)).href);

const { Sim } = await be('src', 'sim', 'sim.js');
const { TEREP } = await be('src', 'sim', 'grid.js');
const { NYERS_NEV } = await be('src', 'sim', 'eroforras.js');
const M0 = await be('src', 'ui', 'minimap_adat.js');
const {
  MINIMAP_MERET, SZIN_NYERS,
  minimapTerep, minimapHatter, minimapMozgo, minimapSzamlalo,
  minimapVilagra, minimapKeppontra, minimapNezetKeret, minimapAdat,
} = M0;

const M = MINIMAP_MERET;
const KEPPONT = M * M;
const SEED = 20260804;

let bukas = 0;
const sor = (a, b, c) => console.log('  ' + String(a).padEnd(34) + String(b).padEnd(30) + (c ?? ''));
const cim = (t) => console.log('\n' + t + '\n' + '─'.repeat(80));
const gat = (all, szoveg, reszlet) => {
  if (all) return true;
  console.log('\n  ⛔ ' + szoveg);
  if (reszlet) console.log('     ' + reszlet);
  bukas++;
  return false;
};
const sz1 = (x) => (Math.round(x * 10) / 10).toFixed(1);
const sz2 = (x) => (Math.round(x * 100) / 100).toFixed(2);

cim('AGE OF THE CRYSTALS — MINIMAP-SZONDA (v0.16)');

// ══════════════════════════════════════════════════════════════════════════
// VILÁG-FELÁLLÁS
// ══════════════════════════════════════════════════════════════════════════
// Két világ kell, mert két különböző dolgot mérünk:
//   • GAZDASÁG — kevés egység, sok ÉPÜLET (terület, épület-pont, köd)
//   • SEREG    — 1600 egység (ritkítás, teljesítmény)
// Egyben nem megy: 1600 egység 800 népesség csapatonként, ott a képzés és az
// építés MINDIG elutasításba futna (lásd CLAUDE.md).

console.log('\n  világ-felállás…');
const t0 = Date.now();

const gazd = new Sim({ seed: SEED, n: 256, maxEgyseg: 2000 });
gazd.szondaFelallas(60, { munkasMinden: 2 });
for (let kor = 0; kor < 30; kor++) {
  gazd.szondaParancsV05(kor);
  for (let i = 0; i < 120; i++) gazd.lep();
}

const sereg = new Sim({ seed: SEED ^ 0x51, n: 256, maxEgyseg: 2000 });
const seregDb = sereg.szondaFelallas(1600);
sereg.szondaParancs();
for (let i = 0; i < 300; i++) sereg.lep();

sor('gazdaság-világ', gazd.tick + ' tick',
  gazd.egysegek.db + ' egység · ' + gazd.epuletek.db + ' épület');
sor('sereg-világ', sereg.tick + ' tick', seregDb + ' egység');
sor('felállás ideje', (Date.now() - t0) + ' ms', '');

// ── ⚠️ ÉLŐ VILÁGON MÉRÜNK-E? (v0.18) ──────────────────────────────────────
// A gazdaság-világ 3 600 ticket lép, és a v0.17 óta a meccsnek VÉGE LEHET. Ha
// a mérés közben eldől, az `ai.lep()` kilép, a szondaparancsok elutasításba
// futnak, és a világ MEGDERMED: nem épül új épület, nem születik új egység.
// A minimap fedés-, épület-pont- és ritkítás-számai attól még kijönnének —
// csak épp egy halott világról szólnának, és semmi nem szólna érte.
//
// A `TODO.md` „a munkások VÉGLEG tétlenné válnak" tétele pontosan ezért volt
// TÉVES DIAGNÓZIS: egy 16 000 tickes futás VÉGÉT mérte, holott a meccs a
// 10 740. ticken lezárult. A szám tehát nem elhagyható — ki kell írni.
for (const [nev, s] of [['gazdaság', gazd], ['sereg', sereg]]) {
  const g = s.gyozelem;
  sor(nev + '-világ: él-e a meccs', g.vege ? '⚠️ VÉGE @' + g.vegeTick : 'végig futott',
    g.vege
      ? (s.tick - g.vegeTick) + ' tick esett a VÉG UTÁNRA — dermedt világ'
      : 'mind a ' + s.tick + ' lelépett tick ÉLŐ világból jön');
}
gat(!gazd.gyozelem.vege && !sereg.gyozelem.vege,
  'A MÉRÉS VILÁGA A FELÁLLÁS KÖZBEN VÉGET ÉRT.',
  'gazdaság: ' + (gazd.gyozelem.vege ? '@' + gazd.gyozelem.vegeTick : 'fut') + ' · sereg: '
  + (sereg.gyozelem.vege ? '@' + sereg.gyozelem.vegeTick : 'fut')
  + ' — a v0.17 óta a meccsnek van vége, és onnantól a világ dermedt. A minimap '
  + 'számai ilyenkor nem arról szólnak, amiről a fejléc állítja.');

const terep = new Uint8ClampedArray(KEPPONT * 4);
const hatter = new Uint8ClampedArray(KEPPONT * 4);
const kep = new Uint8ClampedArray(KEPPONT * 4);

// ══════════════════════════════════════════════════════════════════════════
cim('1. VIZSGÁLAT — FEDÉS: mekkora világot fed egy képpont, és kap-e mindegyik színt');

const cellaPerKeppont = (gazd.n * gazd.n) / KEPPONT;
const vilagPerKeppont = gazd.n / M;
const st = minimapTerep(gazd, terep);

let kitoltetlen = 0;
const szinek = new Set();
for (let i = 0; i < KEPPONT; i++) {
  const o = i * 4;
  if (terep[o + 3] !== 255) kitoltetlen++;
  szinek.add((terep[o] << 16) | (terep[o + 1] << 8) | terep[o + 2]);
}

sor('minimap felbontása', M + ' × ' + M, KEPPONT + ' képpont');
sor('pálya', gazd.n + ' × ' + gazd.n + ' cella', (gazd.n * gazd.n) + ' cella');
sor('egy képpont fed', sz2(cellaPerKeppont) + ' cellát', sz2(vilagPerKeppont) + ' világegység oldalhossz');
sor('kitöltetlen képpont', kitoltetlen, kitoltetlen === 0 ? '' : '⛔');
sor('különböző terep-szín', szinek.size, szinek.size > 200 ? '' : '⛔ túl kevés');
sor('terep / víz / erdő / nyers', st.terep + ' / ' + st.viz + ' / ' + st.erdo + ' / ' + st.nyers,
  sz1((st.nyers * 100) / KEPPONT) + ' % lelőhely');

gat(kitoltetlen === 0, 'MARADT KITÖLTETLEN KÉPPONT A TEREPEN.',
  kitoltetlen + ' képpont alfája nem 255. Egy lyukas terep-réteg alatt a '
  + 'háttér-másolás szemetet másolna tovább.');
gat(st.terep + st.viz + st.nyers === KEPPONT, 'A TEREP-SZÁMLÁLÓK NEM ADJÁK KI A KÉPET.',
  'terep ' + st.terep + ' + víz ' + st.viz + ' + nyers ' + st.nyers
  + ' = ' + (st.terep + st.viz + st.nyers) + ', várt ' + KEPPONT);
gat(szinek.size > 200, 'A MINIMAP GYAKORLATILAG EGYSZÍNŰ.',
  'mindössze ' + szinek.size + ' különböző szín. Egy tájékozódásra való térkép '
  + 'nem állhat pár színfoltból.');
gat(st.viz > 0 && st.terep > 0, 'A PÁLYÁN VAGY CSAK VÍZ, VAGY CSAK SZÁRAZFÖLD LÁTSZIK.',
  'víz ' + st.viz + ', szárazföld ' + st.terep);

// ══════════════════════════════════════════════════════════════════════════
cim('2. VIZSGÁLAT — DOMBORZAT: a magasság és a lejtő tényleg színt változtat');

// A mérés: kigyűjtjük a FŰ típusú cellák képpont-fényerejét (ott nincs
// lelőhely és nincs víz, tehát AZONOS alapszín), és megnézzük a SZÓRÁST.
// Ha a domborzat nem hat, minden fű-képpont ugyanolyan fényes → szórás 0.
function fuSzoras(sim, puffer) {
  const n = sim.n;
  let db = 0, ossz = 0, ossz2 = 0;
  for (let py = 0; py < M; py++) {
    const wy = ((py * n) / M) | 0;
    for (let px = 0; px < M; px++) {
      const wx = ((px * n) / M) | 0;
      const ci = sim.racs.idx(wx, wy);
      if (ci < 0) continue;
      if (sim.racs.terep[ci] !== TEREP.FU) continue;
      if (sim.eroforrasok.cellaNode[ci] >= 0) continue;
      const o = (py * M + px) * 4;
      const l = puffer[o] * 0.3 + puffer[o + 1] * 0.6 + puffer[o + 2] * 0.1;
      db++; ossz += l; ossz2 += l * l;
    }
  }
  if (db < 2) return { db, atlag: 0, szoras: 0 };
  const atlag = ossz / db;
  const v = ossz2 / db - atlag * atlag;
  return { db, atlag, szoras: Math.sqrt(v > 0 ? v : 0) };
}

const dombor = fuSzoras(gazd, terep);
sor('fű-képpont a mintában', dombor.db, '');
sor('átlagos fényerő', sz1(dombor.atlag), '');
sor('fényerő-SZÓRÁS', sz2(dombor.szoras), dombor.szoras > 4 ? '' : '⛔ lapos');

// ── SZABOTÁZS: laposítsuk a pályát. A domborzat-jelnek EL KELL TŰNNIE.
// Enélkül a fenti szórás bármiből származhatna (zaj, lelőhely-maradék), és a
// gát sosem tudná megmondani, hogy tényleg a magasságot méri-e.
const mentettMagassag = gazd.racs.kozepMagassag;
gazd.racs.kozepMagassag = new Float64Array(mentettMagassag.length).fill(3);
const lapos = new Uint8ClampedArray(KEPPONT * 4);
minimapTerep(gazd, lapos);
const laposSzoras = fuSzoras(gazd, lapos).szoras;
gazd.racs.kozepMagassag = mentettMagassag;

sor('SZABOTÁZS — lapos pálya', 'szórás ' + sz2(laposSzoras),
  laposSzoras < 0.5 ? 'a jel eltűnt ✔' : '⛔ a jel MEGMARADT');

gat(dombor.szoras > 4, 'A TEREPNEK NINCS DOMBORZATA A MINIMAPON.',
  'a fű-képpontok fényerő-szórása ' + sz2(dombor.szoras) + '. A magasság- és '
  + 'lejtő-árnyékolás nem hat: a térkép öt színfoltból áll.');
gat(laposSzoras < 0.5, 'A SZABOTÁZS NEM HATOTT: LAPOS PÁLYÁN IS VAN SZÓRÁS.',
  'szórás lapos pályán: ' + sz2(laposSzoras) + '. Vagyis a 2. vizsgálat nem a '
  + 'domborzatot méri, hanem valami mást — a gát HAMIS biztonságot ad.');
gat(dombor.szoras > laposSzoras * 4, 'A DOMBORZAT-JEL NEM ELÉG ERŐS A ZAJHOZ KÉPEST.',
  'valódi ' + sz2(dombor.szoras) + ' vs lapos ' + sz2(laposSzoras));

// ══════════════════════════════════════════════════════════════════════════
cim('3. VIZSGÁLAT — LELŐHELY: mind a négy nyersanyag külön színnel van rajta');

// Végigmegyünk a képpontokon, és megnézzük, melyik nyersanyag-szín hányszor
// szerepel. Ha egy fajta 0-t kap, vagy két fajta ugyanazt a színt viseli, a
// játékos nem tudja megkülönböztetni őket a térképen.
const nyersDb = [0, 0, 0, 0];
for (let py = 0; py < M; py++) {
  const wy = ((py * gazd.n) / M) | 0;
  for (let px = 0; px < M; px++) {
    const wx = ((px * gazd.n) / M) | 0;
    const ci = gazd.racs.idx(wx, wy);
    if (ci < 0) continue;
    const node = gazd.eroforrasok.cellaNode[ci];
    if (node < 0) continue;
    const f = gazd.eroforrasok.fajta[node];
    const o = (py * M + px) * 4;
    // A lelőhely-szín ÁRNYÉKOLVA kerül ki (a magasság hat rá), ezért nem
    // bitre egyezést kérünk, hanem azt, hogy a NÉGY közül ehhez legyen a
    // legközelebb — pontosan az a kérdés, amit a szem is feltesz.
    let legjobb = -1, legjobbD = 1e18;
    for (let k = 0; k < 4; k++) {
      const c = SZIN_NYERS[k];
      // Irány-eltérés, nem távolság: az árnyékolás a FÉNYERŐT szorozza, a
      // színárnyalatot nem. Egy fényerő-érzékeny összevetés a sötét erdőt a
      // sötét vízre keverné.
      const h = puffSzin(terep, o, c);
      if (h < legjobbD) { legjobbD = h; legjobb = k; }
    }
    if (legjobb === f) nyersDb[f]++;
  }
}
/** Színárnyalat-eltérés: normált vektorok szöge helyett elég a koszinusz-hiány. */
function puffSzin(p, o, c) {
  const ar = p[o], ag = p[o + 1], ab = p[o + 2];
  const h1 = Math.sqrt(ar * ar + ag * ag + ab * ab) || 1;
  const h2 = Math.sqrt(c[0] * c[0] + c[1] * c[1] + c[2] * c[2]) || 1;
  const pont = (ar * c[0] + ag * c[1] + ab * c[2]) / (h1 * h2);
  return 1 - pont;
}

for (let f = 0; f < 4; f++) {
  sor(NYERS_NEV[f] + ' képpont', nyersDb[f], nyersDb[f] > 0 ? '' : '⛔ NEM AZONOSÍTHATÓ');
}
// A négy szín páronkénti eltérése — a legkisebb dönti el, elválik-e a szem előtt.
let legkozelebb = 1e18, para = '';
for (let i = 0; i < 4; i++) {
  for (let j = i + 1; j < 4; j++) {
    const a = SZIN_NYERS[i], b = SZIN_NYERS[j];
    const d = Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
    if (d < legkozelebb) { legkozelebb = d; para = NYERS_NEV[i] + '↔' + NYERS_NEV[j]; }
  }
}
sor('legközelebbi színpár', para, 'RGB-távolság ' + sz1(legkozelebb));

for (let f = 0; f < 4; f++) {
  gat(nyersDb[f] > 0, 'A(Z) ' + NYERS_NEV[f].toUpperCase() + ' NEM AZONOSÍTHATÓ A TÉRKÉPEN.',
    'egyetlen olyan képpontja sincs, ami a saját színéhez áll a legközelebb — '
    + 'vagy nincs a pályán, vagy egy másik nyersanyag színét viseli.');
}
gat(legkozelebb > 60, 'KÉT NYERSANYAG-SZÍN TÚL KÖZEL VAN EGYMÁSHOZ.',
  para + ' RGB-távolsága ' + sz1(legkozelebb) + '. Egy képpontos folton ez nem válik el.');

// ══════════════════════════════════════════════════════════════════════════
cim('4. VIZSGÁLAT — HADI KÖD: sötét, emlékezett és megvilágított arányok');

const sh = minimapHatter(gazd, terep, hatter, 0);
const kodOssz = sh.sotet + sh.kodos + sh.fenyes;
sor('sosem látott (sötét)', sh.sotet, sz1((sh.sotet * 100) / KEPPONT) + ' %');
sor('emlékezett (tompított)', sh.kodos, sz1((sh.kodos * 100) / KEPPONT) + ' %');
sor('éppen látható', sh.fenyes, sz1((sh.fenyes * 100) / KEPPONT) + ' %');
sor('összeg', kodOssz, kodOssz === KEPPONT ? '' : '⛔ nem a teljes kép');

gat(kodOssz === KEPPONT, 'A KÖD-SZÁMLÁLÓK NEM ADJÁK KI A TELJES KÉPET.',
  kodOssz + ' ≠ ' + KEPPONT);
gat(sh.sotet > 0, 'NINCS SÖTÉT TERÜLET: A KIS TÉRKÉP AZ EGÉSZ PÁLYÁT ELÁRULJA.');
gat(sh.fenyes > 0, 'SEMMI NEM LÁTHATÓ ÉPPEN MOST: a `lathato` rács üres.');
gat(sh.sotet < KEPPONT, 'A TELJES TÉRKÉP SÖTÉT: a `latott` rács üres.');

// ── SZABOTÁZS: mindent-látó köd. A sötétnek NULLÁRA kell esnie.
const eredetiLatott = gazd.kod.latottPont;
const eredetiLathato = gazd.kod.lathatoPont;
gazd.kod.latottPont = () => true;
gazd.kod.lathatoPont = () => true;
const shVak = minimapHatter(gazd, terep, hatter, 0, minimapSzamlalo());
gazd.kod.latottPont = eredetiLatott;
gazd.kod.lathatoPont = eredetiLathato;
sor('SZABOTÁZS — mindent látó köd', 'sötét ' + shVak.sotet,
  shVak.sotet === 0 ? 'a gát bukna ✔' : '⛔ a gát NEM venné észre');
gat(shVak.sotet === 0 && shVak.kodos === 0,
  'A SZABOTÁZS NEM HATOTT: MINDENT-LÁTÓ KÖDDEL IS MARADT SÖTÉT/TOMPÍTOTT KÉPPONT.',
  'sötét ' + shVak.sotet + ', tompított ' + shVak.kodos + '. A háttér-réteg tehát '
  + 'nem a `kod` rácsából dolgozik — a 4. vizsgálat mást mér, mint hiszi.');

// ══════════════════════════════════════════════════════════════════════════
cim('5. VIZSGÁLAT — SZIVÁRGÁS: a ködben álló IDEGEN egység NEM kerül a képre');

// Ez a projekt legkönnyebben elrontható és legnehezebben észrevehető hibája:
// a köd „működik" (a rácsa frissül), de a minimap megkerüli, és a kis térképen
// látszik minden ellenséges mozdulat. Se a hash, se a köd-számok nem fognák meg.
minimapHatter(gazd, terep, hatter, 0);
kep.set(hatter);
const sm = minimapMozgo(gazd, kep, 0);

// Számoljuk meg, HÁNY idegen egység van egyáltalán, és hányat takar a köd.
const e = gazd.egysegek;
let idegen = 0, idegenKodban = 0, idegenLatszik = 0;
let probaEgyseg = -1;
for (let i = 0; i < e.db; i++) {
  if (!gazd.harc.elo[i] || e.csapat[i] === 0) continue;
  idegen++;
  if (gazd.kod.lathatoPont(0, e.px[i], e.py[i])) { idegenLatszik++; continue; }
  idegenKodban++;
  if (probaEgyseg < 0) probaEgyseg = i;
}
sor('idegen egység összesen', idegen, '');
sor('ebből ködben (rejtve)', idegenKodban, '');
sor('ebből éppen látható', idegenLatszik, '');
sor('minimapra került egység', sm.egyseg, 'képpont-írás: ' + sm.pont);
sor('rejtett (egység + épület)', sm.rejtett, sm.rejtett > 0 ? '' : '⛔');

gat(sm.egyseg > 0 || sm.epulet > 0, 'A MINIMAP ÜRES: sem egység, sem épület nem került rá.');
gat(sm.rejtett > 0, 'A MINIMAP MINDENT KIRAJZOLT, AMI LÉTEZIK.',
  'egyetlen idegen egység vagy épület sem maradt a ködben. Vagy tényleg mindent '
  + 'látunk (akkor a köd a hibás), vagy a minimap MEGKERÜLI a ködöt.');

// ── SZABOTÁZS mindkét irányban, EGY KONKRÉT EGYSÉGEN.
// (a) A ködben álló idegen egység képpontja NEM lehet ellenség-színű.
// (b) Ha ugyanazt a pontot láthatóvá tesszük, MEG KELL JELENNIE.
// A (b) nélkül az (a) semmit nem érne: egy minimap, ami SOSEM rajzol egységet,
// az (a)-t tökéletesen teljesíti.
if (probaEgyseg >= 0) {
  const p = minimapKeppontra(gazd, e.px[probaEgyseg], e.py[probaEgyseg]);
  const px = p.x | 0, py = p.y | 0;
  const o = (py * M + px) * 4;
  const rejtve = [kep[o], kep[o + 1], kep[o + 2]].join(',');

  const eL = gazd.kod.lathatoPont;
  gazd.kod.lathatoPont = () => true;
  minimapHatter(gazd, terep, hatter, 0, minimapSzamlalo());
  kep.set(hatter);
  const smNyilt = minimapMozgo(gazd, kep, 0, minimapSzamlalo());
  const elo = [kep[o], kep[o + 1], kep[o + 2]].join(',');
  gazd.kod.lathatoPont = eL;

  sor('próba-egység (' + probaEgyseg + ')', 'képpont ' + px + ',' + py, 'csapat ' + e.csapat[probaEgyseg]);
  sor('  köddel — a képpont', rejtve, '');
  sor('  köd nélkül — a képpont', elo, elo !== rejtve ? 'megjelent ✔' : '⛔ nem változott');
  sor('  rajzolt egység köddel', sm.egyseg, 'köd nélkül: ' + smNyilt.egyseg);

  gat(elo !== rejtve, 'A SZABOTÁZS NEM HATOTT: A KÖD KIKAPCSOLÁSA UGYANAZT A KÉPET ADTA.',
    'a próba-egység képpontja mindkét esetben ' + rejtve + '. Vagy a minimap egyáltalán '
    + 'nem rajzol egységeket, vagy nem a `kod` felületét kérdezi — az 5. vizsgálat '
    + 'ilyenkor NEM tud bukni, tehát értéktelen.');
  gat(smNyilt.egyseg > sm.egyseg, 'KÖD NÉLKÜL SEM KERÜLT TÖBB EGYSÉG A TÉRKÉPRE.',
    'köddel ' + sm.egyseg + ', köd nélkül ' + smNyilt.egyseg);
  gat(smNyilt.rejtett === 0, 'KÖD NÉLKÜL IS MARADT „REJTETT" EGYSÉG.',
    'rejtett: ' + smNyilt.rejtett + ' — a rejtés nem a láthatóságból következik.');
} else {
  gat(false, 'NINCS KÖDBEN ÁLLÓ IDEGEN EGYSÉG A PRÓBÁHOZ.',
    'a felállás nem alkalmas a szivárgás-vizsgálatra.');
}

// Vissza a valódi állapotra a további vizsgálatokhoz.
minimapHatter(gazd, terep, hatter, 0);

// ══════════════════════════════════════════════════════════════════════════
cim('6. VIZSGÁLAT — BIRTOKOLT TERÜLET: látszik, de az ellenségé nem szivárog');

const shT = minimapHatter(gazd, terep, hatter, 0, minimapSzamlalo());
const ep = gazd.epuletek;
let sajatEp = 0, idegenEp = 0, idegenEpLathato = 0;
for (let k = 0; k < ep.db; k++) {
  if (!ep.el(k)) continue;
  if (ep.csapat[k] === 0) sajatEp++;
  else { idegenEp++; if (gazd.kod.lathatoPont(0, ep.x[k], ep.y[k])) idegenEpLathato++; }
}
sor('saját épület', sajatEp, '');
sor('idegen épület', idegenEp, 'ebből látható: ' + idegenEpLathato);
sor('terület-képpont', shT.terulet, sz1((shT.terulet * 100) / KEPPONT) + ' % a térképből');
sor('  ebből saját / idegen', shT.teruletSajat + ' / ' + shT.teruletIdegen, '');

gat(sajatEp > 0, 'NINCS SAJÁT ÉPÜLET — a terület-vizsgálat nem futtatható.');
gat(shT.terulet > 0, 'NINCS BIRTOKOLT TERÜLET A TÉRKÉPEN.',
  'pedig ' + sajatEp + ' saját épület áll. A terület-folt nem rajzolódik.');
gat(shT.terulet < KEPPONT / 2, 'A TERÜLET A TÉRKÉP FELÉNÉL TÖBBET FED.',
  shT.terulet + ' képpont. Ekkora folt már nem információ, hanem szűrő a térkép fölött.');

// ── SZABOTÁZS KÉT LÉPÉSBEN. A kettő EGYÜTT mond valamit; külön-külön egyik
// sem tudná eldönteni, hogy a terület a jó okból hiányzik-e.
//
// (a) FELFEDETT TÉRKÉP, ÉLŐ KÖD (`latottPont` → igaz). A pálya minden pontját
//     „láttuk már", de az ellenséges bázisra ÉPPEN NEM látunk rá. Az IDEGEN
//     területnek ilyenkor NEM szabad megnőnie: ha megnő, a folt elárulja a köd
//     mögötti bázis helyét — a legfinomabb szivárgás, mert maga az épület nem
//     is látszik.
//     ⚠️ Csak az IDEGEN számot nézzük. Az összesített terület MEGNŐ ettől, és
//     az helyes: a saját területem addig nem rajzolódott ki a felderítetlen
//     sávban, ahová a központ hatóköre kilóg. A kettő összekeverése az első
//     változatban HAMIS bukást adott — az összeg nem árul el semmit arról,
//     KINEK a területe nőtt.
// (b) MINDENT LÁTÓ KÖD (mindkettő → igaz). Most MEG KELL nőnie. Enélkül az (a)
//     üres győzelem volna: egy minimap, ami sosem rajzol területet, azt is
//     tökéletesen teljesíti.
const eLat = gazd.kod.latottPont;
const eLath = gazd.kod.lathatoPont;

gazd.kod.latottPont = () => true;
const shTFelfedve = minimapHatter(gazd, terep, hatter, 0, minimapSzamlalo());
gazd.kod.lathatoPont = () => true;
const shTNyilt = minimapHatter(gazd, terep, hatter, 0, minimapSzamlalo());
gazd.kod.latottPont = eLat;
gazd.kod.lathatoPont = eLath;

sor('SZABOTÁZS (a) felfedett térkép',
  'idegen ' + shTFelfedve.teruletIdegen + ' (össz ' + shTFelfedve.terulet + ')',
  shTFelfedve.teruletIdegen <= shT.teruletIdegen ? 'nem nőtt ✔ (nem szivárog)' : '⛔ NŐTT');
sor('SZABOTÁZS (b) mindent látó köd',
  'idegen ' + shTNyilt.teruletIdegen + ' (össz ' + shTNyilt.terulet + ')',
  shTNyilt.teruletIdegen > shTFelfedve.teruletIdegen ? 'nőtt ✔' : '⛔ nem nőtt');

gat(shTFelfedve.teruletIdegen <= shT.teruletIdegen,
  'A FELFEDETT TÉRKÉPEN MEGJELENT AZ ELLENSÉG TERÜLETE — SZIVÁRGÁS.',
  'köddel ' + shT.teruletIdegen + ', felfedett térképen ' + shTFelfedve.teruletIdegen
  + ' idegen terület-képpont. A folt a `latott` rétegből dolgozik, pedig az ÉPÜLET a '
  + '`lathato`-ból: a játékos így egy színes folton látja, hol áll a köd mögötti bázis.');
gat(shTNyilt.teruletIdegen > shTFelfedve.teruletIdegen,
  'A KÖD TELJES KIKAPCSOLÁSA SEM HOZTA ELŐ AZ IDEGEN TERÜLETET.',
  'felfedve ' + shTFelfedve.teruletIdegen + ', mindent látva ' + shTNyilt.teruletIdegen
  + '. Az idegen épületek területe egyáltalán nem rajzolódik — a 6. vizsgálat így '
  + 'nem tud bukni.');
minimapHatter(gazd, terep, hatter, 0);

// ══════════════════════════════════════════════════════════════════════════
cim('7. VIZSGÁLAT — RITKÍTÁS és RÉTEG-KÖLTSÉG 1600 egységgel');

// ⚠️ Az abszolút ms-számok KÉT FUTÁS KÖZÖTT nem összehasonlíthatók (CLAUDE.md:
// osztott CPU). Amit itt állítunk, az EGY FUTÁSON BELÜLI arány: a képkockánként
// futó mozgó réteg legyen nagyságrendekkel olcsóbb a ritkán futó terepnél.
const sTerep = new Uint8ClampedArray(KEPPONT * 4);
const sHatter = new Uint8ClampedArray(KEPPONT * 4);
const sKep = new Uint8ClampedArray(KEPPONT * 4);
const szT = minimapSzamlalo(), szH = minimapSzamlalo(), szM = minimapSzamlalo();

minimapTerep(sereg, sTerep, szT);            // bemelegítés (JIT)
minimapHatter(sereg, sTerep, sHatter, 0, szH);
sKep.set(sHatter);
minimapMozgo(sereg, sKep, 0, szM);

const ISM = 20;
let a1 = process.hrtime.bigint();
for (let i = 0; i < ISM; i++) minimapTerep(sereg, sTerep, szT);
const msTerep = Number(process.hrtime.bigint() - a1) / 1e6 / ISM;

a1 = process.hrtime.bigint();
for (let i = 0; i < ISM; i++) minimapHatter(sereg, sTerep, sHatter, 0, szH);
const msHatter = Number(process.hrtime.bigint() - a1) / 1e6 / ISM;

a1 = process.hrtime.bigint();
for (let i = 0; i < ISM; i++) { sKep.set(sHatter); minimapMozgo(sereg, sKep, 0, szM); }
const msMozgo = Number(process.hrtime.bigint() - a1) / 1e6 / ISM;

let eloDb = 0;
for (let i = 0; i < sereg.egysegek.db; i++) if (sereg.harc.elo[i]) eloDb++;

sor('élő egység a pályán', eloDb, '');
sor('köd-kapun átjutott', szM.egyseg, sz1((szM.egyseg * 100) / eloDb) + ' % (a többi ködben)');
sor('KÉPPONT-ÍRÁS', szM.pont,
  'ritkítás: ' + sz1(szM.egyseg / Math.max(1, szM.pont)) + '× tömörítés');
sor('terep-réteg (ritkán)', sz2(msTerep) + ' ms', '5 mp-enként');
sor('háttér-réteg (fél mp)', sz2(msHatter) + ' ms', 'a köd változatára');
sor('MOZGÓ réteg (20 Hz)', sz2(msMozgo) + ' ms', 'ez fut sűrűn');

gat(szM.egyseg > 100, 'ALIG KERÜLT EGYSÉG A TÉRKÉPRE 1600-BÓL.',
  szM.egyseg + ' egység jutott át. Vagy a felállás rossz, vagy a rajzolás kihagy.');
gat(szM.pont < szM.egyseg, 'A RITKÍTÁS NEM MŰKÖDIK.',
  szM.egyseg + ' egységből ' + szM.pont + ' képpont-írás lett. Egy 1,33 cellás '
  + 'képpontra több egység is esik — ha ez nem tömörít, a rajzolás fölösleges '
  + 'munkát végez a sereg méretével arányosan.');
gat(szM.pont <= KEPPONT, 'TÖBB KÉPPONT-ÍRÁS, MINT AMENNYI KÉPPONT VAN.',
  szM.pont + ' > ' + KEPPONT);
gat(msMozgo < msTerep, 'A KÉPKOCKÁNKÉNTI RÉTEG DRÁGÁBB A RITKÁN FUTÓNÁL.',
  'mozgó ' + sz2(msMozgo) + ' ms, terep ' + sz2(msTerep) + ' ms. A háromra bontásnak '
  + 'pont az az értelme, hogy a sűrűn futó legyen az olcsó.');

// ══════════════════════════════════════════════════════════════════════════
cim('8. VIZSGÁLAT — NÉZET-KERET: a trapéz a kamera célpontját fogja közre');

const keret = new Float64Array(8);
/** Sokszög-terület (előjeles) — a nullától eltérő terület a nem-elfajult keret. */
function terulet(q) {
  let t = 0;
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    t += q[i * 2] * q[j * 2 + 1] - q[j * 2] * q[i * 2 + 1];
  }
  return Math.abs(t) * 0.5;
}
/** Benne van-e a pont a négyszögben? Sugár-módszer. */
function benne(q, x, y) {
  let bent = false;
  for (let i = 0, j = 3; i < 4; j = i++) {
    const xi = q[i * 2], yi = q[i * 2 + 1];
    const xj = q[j * 2], yj = q[j * 2 + 1];
    if (((yi > y) !== (yj > y))
      && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)) bent = !bent;
  }
  return bent;
}

const kozep = gazd.n * 0.5;
function kamerat(forgas, doles, tav) {
  return { x: kozep, y: 3, z: kozep, tav, forgas, doles, objektum: { fov: 48, aspect: 1.6 } };
}
const cel = minimapKeppontra(gazd, kozep, kozep);

let keretBukas = 0;
for (const forgas of [-2.4, -1.2, -0.61, 0, 0.9, 2.0]) {
  const k = kamerat(forgas, 0.62, 70);
  const ok = minimapNezetKeret(gazd, k, keret);
  const ter = terulet(keret);
  const bent = benne(keret, cel.x, cel.y);
  sor('forgás ' + sz2(forgas) + ' rad', 'terület ' + sz1(ter) + ' px²',
    (bent ? 'a célpont BENT ✔' : '⛔ a célpont KINT') + (ok ? '' : ' ⛔ nem számolt'));
  if (!ok || !bent || !(ter > 20)) keretBukas++;
}
gat(keretBukas === 0, 'A NÉZET-KERET NEM FOGJA KÖZRE A KAMERA CÉLPONTJÁT.',
  keretBukas + ' forgatásnál hibázott. Egy keret, ami nem ott van, ahová a kamera '
  + 'néz, rosszabb a semminél: elhiteti a játékossal, hogy máshol jár.');

// ── SZABOTÁZS/ellenpróba: FELÜLNÉZET (90°). A keretnek szimmetrikusnak kell
// lennie a célpontra — ha nem az, a vetítés rossz.
const fentrol = kamerat(0, Math.PI * 0.5 - 0.001, 70);
minimapNezetKeret(gazd, fentrol, keret);
let sx = 0, sy = 0;
for (let i = 0; i < 4; i++) { sx += keret[i * 2]; sy += keret[i * 2 + 1]; }
const eltolas = Math.hypot(sx / 4 - cel.x, sy / 4 - cel.y);
sor('felülnézet — súlypont-eltérés', sz2(eltolas) + ' px', eltolas < 1.5 ? '✔' : '⛔');
gat(eltolas < 1.5, 'FELÜLNÉZETBŐL SEM SZIMMETRIKUS A KERET.',
  'a súlypont ' + sz2(eltolas) + ' képponttal áll odébb a célponttól. Merőleges '
  + 'rálátásnál a látott terület a célpontra szimmetrikus téglalap — ha nem az, '
  + 'a sarok-sugár számítása hibás.');

// Kizoomolás → nagyobb keret. Ez az a szám, amiért a keret ott van.
minimapNezetKeret(gazd, kamerat(-0.61, 0.62, 30), keret);
const kicsi = terulet(keret);
minimapNezetKeret(gazd, kamerat(-0.61, 0.62, 120), keret);
const nagy = terulet(keret);
sor('közel (tav 30) → távol (120)', sz1(kicsi) + ' → ' + sz1(nagy) + ' px²',
  nagy > kicsi * 3 ? 'nő ✔' : '⛔ nem követi a zoomot');
gat(nagy > kicsi * 3, 'A KERET NEM KÖVETI A ZOOMOT.',
  'közel ' + sz1(kicsi) + ' px², távol ' + sz1(nagy) + ' px². Ha a keret mérete nem '
  + 'függ a kamera-távolságtól, akkor nem a látott területet mutatja.');

// Koordináta oda-vissza.
const vp = minimapVilagra(gazd, 42.5, 137.25);
const kp = minimapKeppontra(gazd, vp.x, vp.y);
const hiba = Math.hypot(kp.x - 42.5, kp.y - 137.25);
sor('koordináta oda-vissza', sz2(hiba) + ' px hiba', hiba < 1e-9 ? '✔' : '⛔');
gat(hiba < 1e-9, 'A KÉPPONT↔VILÁG VÁLTÁS NEM FORDÍTHATÓ MEG.',
  'hiba: ' + hiba + ' képpont. A kattintás máshová vinné a kamerát, mint ahová mutat.');

// ══════════════════════════════════════════════════════════════════════════
cim('9. VIZSGÁLAT — ÁLLANDÓSÁG és ALLOKÁCIÓ');

// (a) Kétszer ugyanaz a hívás bitre ugyanazt adja. Ez fogja meg, ha a modul-
// szintű bélyeg-tömbök nem ürülnek rendesen a hívások között.
const A = new Uint8ClampedArray(KEPPONT * 4);
const B = new Uint8ClampedArray(KEPPONT * 4);
minimapAdat(gazd, A, 0);
minimapAdat(gazd, B, 0);
let elter = 0;
for (let i = 0; i < A.length; i++) if (A[i] !== B[i]) elter++;
sor('két azonos hívás eltérése', elter + ' bájt', elter === 0 ? '✔' : '⛔');
gat(elter === 0, 'UGYANAZ A HÍVÁS KÉTSZER MÁS KÉPET ADOTT.',
  elter + ' bájt tér el. A modul-szintű munkatömbök (bélyeg, terület) átszivárognak '
  + 'a hívások között.');

// (b) A számláló-objektum ÚJRAHASZNÁLT: a `frissit()` nem allokálhat.
const sz = minimapSzamlalo();
const vissza = minimapMozgo(gazd, kep, 0, sz);
sor('számláló újrahasznált', vissza === sz ? 'igen ✔' : 'NEM ⛔', '');
gat(vissza === sz, 'A MOZGÓ RÉTEG ÚJ SZÁMLÁLÓ-OBJEKTUMOT AD VISSZA.',
  'a képkockánként futó réteg így képkockánként allokál — pont az, amit a '
  + 'CLAUDE.md nulla-allokációs szabálya tilt.');

// (c) Nyers heap-növekmény 300 hívásra. Nem gát (a GC ütemezése zajos), de a
// nagyságrend elárulja, ha minden hívás új puffert szül.
const h0 = process.memoryUsage().heapUsed;
for (let i = 0; i < 300; i++) { kep.set(hatter); minimapMozgo(gazd, kep, 0, sz); }
const h1 = process.memoryUsage().heapUsed;
sor('heap 300 hívásra', sz1((h1 - h0) / 1024) + ' kB', '(tájékoztató, nem gát)');

// (d) A csapat-szemszög TÉNYLEG számít: 0-ról és 1-ről más képet kell látni.
const C0 = new Uint8ClampedArray(KEPPONT * 4);
const C1 = new Uint8ClampedArray(KEPPONT * 4);
minimapAdat(gazd, C0, 0);
minimapAdat(gazd, C1, 1);
let csEltero = 0;
for (let i = 0; i < C0.length; i += 4) if (C0[i] !== C1[i] || C0[i + 1] !== C1[i + 1]) csEltero++;
sor('csapat 0 vs 1 — eltérő képpont', csEltero, sz1((csEltero * 100) / KEPPONT) + ' %');
gat(csEltero > KEPPONT / 100, 'A KÉT CSAPAT UGYANAZT A TÉRKÉPET LÁTJA.',
  csEltero + ' eltérő képpont. A `csapat` paraméter nem hat: mindenki mindenki '
  + 'felderített térképét látja.');

// ══════════════════════════════════════════════════════════════════════════
cim('ÖSSZEGZÉS');
sor('minimap', M + ' × ' + M + ' képpont', sz2(cellaPerKeppont) + ' cella / képpont');
sor('terep', st.terep + ' szárazföld · ' + st.viz + ' víz', st.erdo + ' erdő · ' + st.nyers + ' lelőhely');
sor('köd', sh.sotet + ' sötét · ' + sh.kodos + ' emlékezett', sh.fenyes + ' látható');
sor('terület', shT.terulet + ' képpont', sajatEp + ' saját épület');
sor('sereg', szM.egyseg + ' egység a képen', szM.pont + ' képpont-írás');
sor('réteg-költség', sz2(msTerep) + ' / ' + sz2(msHatter) + ' / ' + sz2(msMozgo) + ' ms',
  'terep / háttér / mozgó');

if (bukas === 0) {
  console.log('\n✅ MINIMAP-SZONDA: minden vizsgálat rendben.\n');
  process.exit(0);
}
console.log('\n⛔ MINIMAP-SZONDA: ' + bukas + ' bukás.\n');
process.exit(1);
