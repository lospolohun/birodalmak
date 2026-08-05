// AGE OF THE CRYSTALS — STATISZTIKA-SZONDA (v0.16).
//
// ── MIÉRT VAN EZ, ÉS MIÉRT NEM ELÉG A ZÖLD BUILD ─────────────────────────
// Az idősoros statisztika a projekt legcsendesebben hazudó rétege. Egy
// grafikon akkor is szépen megjelenik, ha a gyűjtés SOHA nem mintavételezett:
// vízszintes vonalat rajzol, és senki nem szól. A `npx vite build` lefordítja,
// a determinizmus-szonda nem látja (a UI nem megy át a lockstep-soron), az
// FPS-szonda pedig a felhőben meg sem szólal.
//
// Ez a szonda ezért NEM azt méri, hogy „lefut". Azt méri, hogy a görbék
// TÉNYLEG MOZOGNAK egy VALÓDI meccsen — és hogy egy ÁLLÓ világon tényleg
// laposak maradnak. A második fele legalább olyan fontos, mint az első: egy
// zajt generáló, mindig „mozgó" gyűjtő az első próbán átmenne.
//
// ── ⚠️ AMI A v0.17-BEN MEGVÁLTOZOTT: A JÁTÉKNAK MÁR VAN VÉGE ─────────────
// Ez a szonda a v0.16-ban azzal a kikötéssel született, hogy „a sim nem ismer
// győzelmi feltételt", és ezt ki is írta a jelentésébe. A `src/sim/gyozelem.js`
// landolásával ez MEGSZŰNT IGAZ LENNI: a meccsnek van hivatalos vége, és a
// `panel_statisztika_adat.js` `vegallapot()`-ja `hivatalos: true`-t ad, ha a
// sim kimondta.
//
// Egy szonda, ami egy megszűnt korlátot ismételget, rosszabb az elavult
// doksinál: azt a látszatot kelti, hogy MÉRTE. A 7. gát ezért kettévált. A
// 7. továbbra is azt őrzi, hogy a FUTÓ meccs ne hazudjon eredményt; a 7/b
// pedig azt, hogy a BEFEJEZETT meccs ki is mondja — mindkét hivatalos úton
// (feladás, központ-vesztés), szabotázs-kontrollal arra, hogy a „hivatalos"
// jelző nem egy örökös igen.
//
// ── A NYOLC GÁT ───────────────────────────────────────────────────────────
//   1. A sorozat-táblázat ép: egyedi kulcsok, létező ikonnevek, a mérce
//      súlyainak összege 100.
//   2. ⚠️ VALÓDI MECCS, 9 000 tick, két gépi ellenféllel és kikényszerített
//      összecsapással. A gazdaság, a népesség, a hadsereg, az épületek, a
//      felfedezettség és a harc görbéinek MOZOGNIA kell — számokban.
//      ⚠️ v0.18: a vizsgálat KIÍRJA, hogy a 9 000 mért tickből hány esett a
//      meccs VÉGE UTÁNRA, és gát is van rá. A v0.17 óta a meccsnek van vége,
//      és onnantól az `ai.lep()` kilép — egy átnyúló futásban a görbék halott
//      percekkel hígulnának, miközben a jelentés „valódi meccset" írna.
//   3. ⚠️ SZABOTÁZS-PRÓBA: ugyanaz a felállás AI és parancs nélkül. Ott MINDEN
//      görbének laposnak kell maradnia. Ha itt bármi mozog, a gyűjtő zajt mér,
//      és a 2. gát zöldje semmit nem ér.
//   4. RITKÍTÁS: szűk (16 mintás) gyűjtő ugyanabból a meccsből. A mintaszám
//      sosem lépi túl a korlátot, a mintaköz duplázódik, a lefedett IDŐ mégis
//      a teljes meccs.
//   5. TICK-ALAPÚSÁG: szünetelő meccsen (nem lépünk) ezer `mintaz()` hívás sem
//      csinál új mintát; a minták tickjei a mintaköz többszörösei.
//   6. FORDULÓPONTOK: keletkeznek, nevesítettek, a korlát tartja magát, és a
//      súly szerinti ritkítás a FONTOSAKAT hagyja meg.
//   7. ÁLLÁS / MÉRLEG / VÉGÁLLAPOT: a pontok összege 100, és a FUTÓ meccsen a
//      cím SOHA nem mond győzelmet, amíg a sim nem mondott ki ilyet.
//   7/b. ⚠️ A HIVATALOS VÉG (v0.17): valódi meccs, ami TÉNYLEG véget ér —
//      feladással és a központ elvesztésével is. A `vegeTick` a simé, a mérleg
//      címe „Győzelem"/„Vereség", és a `hivatalos` jelző igaz. Szabotázs-
//      kontroll: ugyanaz a felállás vég nélkül — ott hamisnak KELL lennie.
//   8. GÖRBE-MATEMATIKA: a pontok a dobozon belül vannak, x szigorúan nő, és
//      egy MOZGÓ sorozatból nem lehet vízszintes vonal.
//
// HASZNÁLAT:  npm run p:statisztika
// Kilépési kód: 0 = rendben, 1 = bukás.

import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const GYOKER = dirname(dirname(fileURLToPath(import.meta.url)));
const be = (...r) => import(pathToFileURL(join(GYOKER, ...r)).href);

const { meccsSim, szondaKonfig } = await be('src', 'ui', 'meccs.js');
const { NEHEZSEG } = await be('src', 'sim', 'ai.js');
const { TIPUS } = await be('src', 'sim', 'units.js');
const { NYERS } = await be('src', 'sim', 'eroforras.js');
const { TICK_HZ } = await be('src', 'sim', 'sim.js');
const { IKON_NEVEK } = await be('src', 'ui', 'ikonok.js');
// A v0.17 győzelmi rétege — a 7/b vizsgálat ebből tudja, mit KELLENE kapnia.
const { VEG_OK } = await be('src', 'sim', 'gyozelem.js');
const { EPULET } = await be('src', 'sim', 'epuletek.js');
const A = await be('src', 'ui', 'panel_statisztika_adat.js');
const {
  StatisztikaGyujto, SOROZAT, KULCSOK, MERCE, MAX_FORDULOPONT, MINTA_TICK,
  pillanat, allas, merleg, vegallapot, vonalUt, idoSzoveg, szamSzoveg,
  idoTengely, ertekTengely, tengelyTeto, CSAPAT_NEV,
} = A;

let bukas = 0;
/** Bejegyzett `window` billentyű-figyelők a 9. gát DOM-stubjában. */
let _figyelok = 0;
const sor = (a, b, c) => console.log('  ' + String(a).padEnd(26) + String(b).padStart(14) + '  ' + (c ?? ''));
const cim = (t) => console.log('\n' + t + '\n' + '─'.repeat(78));
const gat = (all, szoveg, reszlet) => {
  if (all) return true;
  console.log('\n  ⛔ ' + szoveg);
  if (reszlet) console.log('     ' + reszlet);
  bukas++;
  return false;
};

/** Ennyi ticket lép a valódi meccs. 9 000 tick = 7,5 perc játékidő. */
const MECCS_TICK = 9000;
/** Ettől a ticktől kényszerítünk összecsapást, hogy a HARC görbéi is éljenek. */
const HARC_TICKTOL = 3500;
const HARC_KOZ = 500;

cim('AGE OF THE CRYSTALS — STATISZTIKA-SZONDA (v0.16)');
console.log('  ' + MECCS_TICK + ' tick valódi meccs + ' + MECCS_TICK + ' tick álló világ');

// ══ 1. A SOROZAT-TÁBLÁZAT ÉPSÉGE ═══════════════════════════════════════════
cim('1. VIZSGÁLAT — a sorozat-táblázat és a mérce épsége');

const kulcsHalmaz = new Set(KULCSOK);
sor('sorozat', SOROZAT.length, KULCSOK.length + ' kulcs');
gat(kulcsHalmaz.size === SOROZAT.length, 'KÉT SOROZAT UGYANAZON A KULCSON.',
  'Az egyik némán felülírná a másikat a gyűjtőben.');

let rosszIkon = 0, hianyosSor = 0;
for (const s of SOROZAT) {
  if (!IKON_NEVEK.includes(s.ikon)) { rosszIkon++; console.log('     ⛔ ismeretlen ikon: ' + s.kulcs + ' → ' + s.ikon); }
  if (!s.nev || !s.csoport || typeof s.halmozott !== 'boolean') hianyosSor++;
}
sor('ismeretlen ikonnév', rosszIkon, rosszIkon === 0 ? 'mind létezik' : '⛔');
gat(rosszIkon === 0, rosszIkon + ' SOROZAT ISMERETLEN IKONT KÉR.',
  'Az `ikonSvg` DOB ismeretlen névre — a panel az első rajzolásnál elszállna.');
sor('hiányos sor', hianyosSor, hianyosSor === 0 ? 'név + csoport + halmozott' : '⛔');
gat(hianyosSor === 0, hianyosSor + ' SOROZATBÓL HIÁNYZIK LEÍRÓ MEZŐ.');

let sulyOssz = 0, merceHiany = 0;
for (const m of MERCE) { sulyOssz += m.suly; if (!kulcsHalmaz.has(m.kulcs)) merceHiany++; }
sor('mérce súlyösszeg', sulyOssz, sulyOssz === 100 ? 'százalékként olvasható' : '⛔');
gat(sulyOssz === 100, 'A MÉRCE SÚLYAINAK ÖSSZEGE NEM 100 (' + sulyOssz + ').',
  'Az állás-százalék így nem 100-ra jönne ki, és a panel hazudna.');
gat(merceHiany === 0, merceHiany + ' MÉRCE-TÉTEL NEM LÉTEZŐ SOROZATRA HIVATKOZIK.');

// ══ 2. VALÓDI MECCS ════════════════════════════════════════════════════════
cim('2. VIZSGÁLAT — VALÓDI meccs: mozognak-e a görbék');

const meccs = meccsSim(szondaKonfig(), { egyseg: 16, munkasMinden: 2, gepiEllenfel: false });
gat(meccs.ok, 'A MECCS FEL SEM ÉPÜLT.', meccs.ok ? '' : JSON.stringify(meccs.hibak));
const sim = meccs.sim;
sim.ai.beallit(0, NEHEZSEG.NEHEZ);
sim.ai.beallit(1, NEHEZSEG.NEHEZ);

const gyujto = new StatisztikaGyujto(sim);
// Szűk gyűjtő UGYANARRÓL a meccsről — a 4. gát (ritkítás) ezt nézi.
const szuk = new StatisztikaGyujto(sim, { maxMinta: 16 });

gat(gyujto.db === 1 && gyujto.tickek[0] === 0,
  'A 0. TICK ALAPVONALA HIÁNYZIK.', 'db=' + gyujto.db);

/**
 * ⚠️ A MECCS VÉGÉNEK TICKJE, ha a mérés közben eldőlt. Lásd a lenti
 * „élő-e a meccs" blokkot — ez a szám dönti el, hogy a 2. vizsgálat számai
 * miről szólnak.
 */
let meccsVegeTick = -1;
const kezdes = Date.now();
for (let t = 0; t < MECCS_TICK; t++) {
  // Kikényszerített összecsapás: az AI önmagában csak a 12 000. tick körül
  // találkozik, és a harc-görbék addig kapun kívül maradnának.
  if (t >= HARC_TICKTOL && t % HARC_KOZ === 0) _osszecsapas(sim);
  // KORSZAKVÁLTÁS: a mai AI 9 000 ticken belül nem vált korszakot magától, így
  // a `korszak` sorozat és a hozzá tartozó fordulópont kapun kívül maradna. A
  // parancs elutasításba fut, amíg nem telik rá — pont úgy, ahogy a játékosé.
  if (t >= 1000 && t % 500 === 0) {
    sim.parancs({ fajta: 'korszak', csapat: 0 });
    sim.parancs({ fajta: 'korszak', csapat: 1 });
  }
  sim.lep();
  if (meccsVegeTick < 0 && sim.gyozelem.vege) meccsVegeTick = sim.gyozelem.vegeTick;
  gyujto.mintaz(sim);
  szuk.mintaz(sim);
}
// A meccs VÉGÉN kikényszerített minta — a valódi vége-képernyő is ezt teszi,
// különben a ritkított gyűjtő utolsó mintája akár egy percet is késhetne, és a
// mérleg mást mutatna, mint a HUD.
gyujto.mintaz(sim, true);
szuk.mintaz(sim, true);
const futasMs = Date.now() - kezdes;

function _osszecsapas(s) {
  const e = s.egysegek, elo = s.harc.elo, a = [], b = [];
  for (let i = 0; i < e.db; i++) {
    if (elo[i] === 0 || e.tipus[i] === TIPUS.MUNKAS) continue;
    (e.csapat[i] === 0 ? a : b).push(i);
  }
  if (!a.length || !b.length) return;
  let ax = 0, ay = 0, bx = 0, by = 0;
  for (const i of a) { ax += e.px[i]; ay += e.py[i]; }
  for (const i of b) { bx += e.px[i]; by += e.py[i]; }
  const cA = s._jarhatoKozel(bx / b.length, by / b.length);
  const cB = s._jarhatoKozel(ax / a.length, ay / a.length);
  s.parancs({ fajta: 'tamado_menet', egysegek: a, x: cA.x, y: cA.y });
  s.parancs({ fajta: 'tamado_menet', egysegek: b, x: cB.x, y: cB.y });
}

sor('lelépett tick', MECCS_TICK, idoSzoveg(sim.tick) + ' játékidő · ' + futasMs + ' ms');

// ── ⚠️ ÉLŐ MECCSEN MÉRTÜNK-E? (v0.18) ─────────────────────────────────────
// A 7. vizsgálatban ott a gát, hogy a meccs nem érhetett véget — de az öt
// képernyővel lentebb van, és a bukás-üzenete nem mondja meg, MI a baja a
// 2. vizsgálat számainak. Ezért a szám ITT is kiíródik, ott, ahol a MOZGÓ
// GÖRBÉKET mérjük.
//
// A csapda konkrét, nem elméleti. A `TODO.md` „a munkások VÉGLEG tétlenné
// válnak" tétele azért volt TÉVES DIAGNÓZIS, mert egy 16 000 tickes futás
// VÉGÉT mérte, holott a meccs a 10 740. ticken lezárult, és onnantól az
// `ai.lep()` (helyesen) kilép. Ugyanez itt: a vég utáni tickeken nem épül
// épület, nem képződik egység, nem gyűlik nyersanyag — a görbék attól még
// „mozgónak" látszanának a meccs ELSŐ feléből, és a jelentés 9 000 tick
// valódi meccset állítana ott, ahol a fele halott világ volt.
//
// ⚠️ Ez a meccs SZÁNDÉKOSAN kényszerített összecsapásokkal megy (3 500-tól
// 500 tickenként), tehát a központ-vesztés valós lehetőség. A mai mérés
// szerint mindkét központ áll a 9 000. ticken — ez a gát azt őrzi, hogy egy
// balansz-hangolás ezt ne vigye el némán.
const halottTick = meccsVegeTick >= 0 ? MECCS_TICK - meccsVegeTick : 0;
sor('a meccs vége', meccsVegeTick >= 0 ? '⚠️ VÉGE @' + meccsVegeTick : 'végig futott',
  halottTick > 0
    ? halottTick + ' tick (' + Math.round(halottTick * 100 / MECCS_TICK) + ' %) esett a VÉG UTÁNRA'
    : 'mind a ' + MECCS_TICK + ' mért tick ÉLŐ meccsből jön');
gat(halottTick === 0,
  'A MÉRÉS ' + halottTick + ' TICKJE EGY MÁR ELDŐLT MECCSBŐL JÖN (vége @' + meccsVegeTick + ').',
  'A v0.17 óta a meccsnek van hivatalos vége, és a lefutott meccsben az AI '
  + 'kilép. A 2. vizsgálat „mozog a görbe" számai ettől csendben hígulnak, a '
  + '7. vizsgálat pedig ugyanezért fog bukni. Nem a gátat kell kivenni: vagy '
  + 'rövidebb `MECCS_TICK` kell, vagy enyhébb kikényszerített összecsapás.');

sor('minta', gyujto.db, 'mintaköz ' + gyujto.mintaTick + ' tick');
sor('idősor memóriája', szamSzoveg(gyujto.memoriaBajt) + ' B', 'FIX, a meccs hosszától független');

console.log('');
console.log('  ' + 'sorozat'.padEnd(22) + 'kék: kezdet → vég'.padEnd(26)
  + 'vörös: kezdet → vég'.padEnd(26) + 'mozog');
console.log('  ' + '─'.repeat(76));
const mozgo = new Set();
for (const s of SOROZAT) {
  const jel = [];
  for (let cs = 0; cs < 2; cs++) {
    const { tomb, db } = gyujto.sorozat(s.kulcs, cs);
    const m = gyujto.mozog(s.kulcs, cs);
    if (m) mozgo.add(s.kulcs);
    jel.push(szamSzoveg(tomb[0]) + ' → ' + szamSzoveg(tomb[db - 1]) + (m ? '' : '  (áll)'));
  }
  const m = mozgo.has(s.kulcs);
  console.log('  ' + s.nev.padEnd(22) + jel[0].padEnd(26) + jel[1].padEnd(26) + (m ? '✓' : '—'));
}

// ⚠️ EZ A LISTA A LÉNYEG. Ha ezek közül bármelyik áll, a statisztika nem mér.
//
// A `korszak` SZÁNDÉKOSAN nincs benne, és ez MÉRT tény, nem feledékenység: a
// mai AI 9 000 ticken (7,5 perc) belül egyszer sem vált korszakot — a
// begyűjtött ételt elköltik képzésre, mire az 500-as váltási ár összejönne.
// A korszak-sorozat ezért külön, célzott világon van vizsgálva a 6. gátban;
// ha itt kérnénk számon, egy AI-balansz-kérdés miatt állna pirosban a
// statisztika.
const KELL_MOZOGJON = [
  'nyersOsszes', 'etel', 'fa', 'percenkent', 'keszlet', 'nepesseg', 'nepessegMax',
  'munkas', 'katona', 'katonaiEro', 'kikepzett', 'epulet', 'felfedezve',
  'elesett', 'sebzes',
];
const allo = KELL_MOZOGJON.filter((k) => !mozgo.has(k));
console.log('');
sor('mozgó sorozat', mozgo.size + ' / ' + SOROZAT.length,
  allo.length === 0 ? 'minden kötelező görbe él' : 'ÁLL: ' + allo.join(', '));
gat(allo.length === 0, allo.length + ' KÖTELEZŐ GÖRBE VÉGIG LAPOS MARADT.',
  'Álló: ' + allo.join(', ') + '. Vagy a gyűjtés nem mintavételez, vagy a '
  + 'meccs nem csinál semmit — mindkettő a statisztika halála.');

// A HARC külön szó: az volt a legkockázatosabb ág (az AI magától későn ütközik).
const halott = [gyujto.utolso('elesett', 0), gyujto.utolso('elesett', 1)];
const seb = [gyujto.utolso('sebzes', 0), gyujto.utolso('sebzes', 1)];
sor('elesett egység', halott.join(' / '), 'kék / vörös');
sor('okozott sebzés', seb.join(' / '), 'kék / vörös');
gat(halott[0] + halott[1] > 0 && seb[0] + seb[1] > 0,
  'A MECCSEN NEM VOLT HARC.', 'A harc-görbék így vizsgálatlanul maradnának.');

const nyers = [gyujto.utolso('nyersOsszes', 0), gyujto.utolso('nyersOsszes', 1)];
gat(nyers[0] > 200 && nyers[1] > 200,
  'AZ EGYIK CSAPAT GAZDASÁGA NEM INDULT BE.', 'begyűjtve: ' + nyers.join(' / '));

// ══ 3. SZABOTÁZS-PRÓBA: ÁLLÓ VILÁG ═════════════════════════════════════════
cim('3. VIZSGÁLAT — SZABOTÁZS: álló világon minden görbének laposnak kell lennie');

const allo2 = meccsSim(szondaKonfig(), { egyseg: 16, munkasMinden: 2, gepiEllenfel: false });
const simAllo = allo2.sim;                      // se AI, se parancs
// ⚠️ ELŐBB HAGYJUK LEÜLNI A VILÁGOT. A hadi köd az első tickben nyitja ki a
// kezdő látókört (0 % → 1 %), és ez EGYSZERI, nem folyamatos mozgás. Ha a
// gyűjtő a 0. tickről indulna, a `felfedezve` sorozat ettől az egy lépcsőtől
// „mozgónak" látszana, és a szabotázs-próba örökre pirosban állna egy olyan
// dolog miatt, ami helyes. A próba kérdése az, hogy a LEÜLT világban mozog-e
// bármi — mert ott már semminek nem szabad.
for (let t = 0; t < 200; t++) simAllo.lep();
const gyujtoAllo = new StatisztikaGyujto(simAllo);
for (let t = 0; t < MECCS_TICK; t++) { simAllo.lep(); gyujtoAllo.mintaz(simAllo); }

const mozgoAllo = [];
for (const s of SOROZAT) {
  for (let cs = 0; cs < 2; cs++) {
    if (gyujtoAllo.mozog(s.kulcs, cs)) mozgoAllo.push(s.kulcs + '/cs' + cs);
  }
}
sor('minta az álló világon', gyujtoAllo.db, gyujtoAllo.mintaTick + ' tickenként');
sor('mozgó sorozat', gyujtoAllo.mozgoSorozatok(),
  mozgoAllo.length === 0 ? 'egy sem — a gyűjtő nem zajt mér' : 'MOZOG: ' + mozgoAllo.join(', '));
gat(mozgoAllo.length === 0,
  'ÁLLÓ VILÁGON IS MOZOG ' + mozgoAllo.length + ' GÖRBE.',
  mozgoAllo.join(', ') + ' — ha a gyűjtő magától is „mér", akkor a 2. vizsgálat '
  + 'zöldje nem a meccsről szólt.');
gat(gyujtoAllo.fordulopontok.length === 0,
  'ÁLLÓ VILÁGON FORDULÓPONT KELETKEZETT (' + gyujtoAllo.fordulopontok.length + ' db).',
  gyujtoAllo.fordulopontok.map((f) => f.szoveg).join(' · '));

// ══ 4. RITKÍTÁS ════════════════════════════════════════════════════════════
cim('4. VIZSGÁLAT — a memória nem nő korlátlanul, az idő mégis végig megvan');

sor('szűk gyűjtő korlátja', szuk.maxMinta, 'minta');
sor('tárolt minta', szuk.db, szuk.db <= szuk.maxMinta ? 'a korláton belül' : '⛔');
sor('ritkítás', szuk.ritkitasDb + '×', 'mintaköz ' + MINTA_TICK + ' → ' + szuk.mintaTick + ' tick');
sor('lefedett idő', idoSzoveg(szuk.tickek[0]) + ' … ' + idoSzoveg(szuk.tickek[szuk.db - 1]),
  'a teljes meccs vége: ' + idoSzoveg(sim.tick));
sor('memória', szamSzoveg(szuk.memoriaBajt) + ' B',
  'a nagy gyűjtőé: ' + szamSzoveg(gyujto.memoriaBajt) + ' B');

gat(szuk.db <= szuk.maxMinta, 'A GYŰJTŐ TÚLLÉPTE A MINTA-KORLÁTOT.',
  szuk.db + ' > ' + szuk.maxMinta + ' — hosszú meccsen ez korlátlan memória.');
gat(szuk.ritkitasDb > 0, 'A RITKÍTÁS SOSEM FUTOTT LE.',
  'A korlátozó ág vizsgálatlan maradt — pont az, ami egy órás meccsen számít.');
gat(szuk.mintaTick === MINTA_TICK * Math.pow(2, szuk.ritkitasDb),
  'A MINTAKÖZ NEM A RITKÍTÁSOK SZÁMÁVAL DUPLÁZÓDOTT.',
  szuk.mintaTick + ' ≠ ' + (MINTA_TICK * Math.pow(2, szuk.ritkitasDb)));
gat(szuk.tickek[0] === 0, 'A RITKÍTÁS ELDOBTA A MECCS ELEJÉT.',
  'első minta tickje: ' + szuk.tickek[0]);
gat(sim.tick - szuk.tickek[szuk.db - 1] <= szuk.mintaTick,
  'A RITKÍTOTT IDŐSOR NEM ÉR EL A MECCS VÉGÉIG.');
// A ritkított sorozat is ugyanazt a VÉGEREDMÉNYT mutassa, mint a sűrű.
gat(szuk.utolso('nyersOsszes', 0) === gyujto.utolso('nyersOsszes', 0),
  'A RITKÍTOTT ÉS A SŰRŰ GYŰJTŐ MÁS VÉGÉRTÉKET AD.',
  szuk.utolso('nyersOsszes', 0) + ' ≠ ' + gyujto.utolso('nyersOsszes', 0));
let noTick = true;
for (let i = 1; i < szuk.db; i++) if (szuk.tickek[i] <= szuk.tickek[i - 1]) noTick = false;
gat(noTick, 'A RITKÍTOTT IDŐSOR TICKJEI NEM NŐNEK SZIGORÚAN.');

// ══ 5. TICK-ALAPÚSÁG ═══════════════════════════════════════════════════════
cim('5. VIZSGÁLAT — a mintavétel TICK-alapú, nem óra-alapú');

const elotteDb = gyujto.db;
const elotteMs = Date.now();
for (let i = 0; i < 5000; i++) gyujto.mintaz(sim);      // szünet: nem lépünk
let telt = Date.now() - elotteMs;
if (telt < 2) { const v = Date.now(); while (Date.now() - v < 3); telt = Date.now() - elotteMs; }
for (let i = 0; i < 200; i++) gyujto.mintaz(sim);
sor('mintaz() szünetben', '5 200 hívás', telt + ' ms valós idő alatt');
sor('keletkezett minta', gyujto.db - elotteDb,
  gyujto.db === elotteDb ? 'egy sem — helyes' : '⛔ ÓRA-ALAPÚ GYŰJTÉS');
gat(gyujto.db === elotteDb,
  'SZÜNETELŐ MECCSEN IS KELETKEZETT MINTA (' + (gyujto.db - elotteDb) + ' db).',
  'A gyűjtés óra-alapú — a görbe vízszintes tengelye hazudni fog gyorsításnál '
  + 'és szünetnél egyaránt.');

let rosszTick = 0;
for (let i = 0; i < gyujto.db; i++) if (gyujto.tickek[i] % gyujto.mintaTick !== 0) rosszTick++;
sor('mintaköz-rácson', (gyujto.db - rosszTick) + ' / ' + gyujto.db,
  rosszTick === 0 ? 'minden minta a rácson ül' : '⛔');
gat(rosszTick === 0, rosszTick + ' MINTA NEM A MINTAKÖZ TÖBBSZÖRÖSÉN VAN.');

// ══ 6. FORDULÓPONTOK ═══════════════════════════════════════════════════════
cim('6. VIZSGÁLAT — fordulópontok: keletkeznek, nevesítettek, korlátozottak');

const fp = gyujto.fordulopontok;
const kodok = new Set(fp.map((f) => f.kod));
sor('fordulópont', fp.length, 'korlát: ' + MAX_FORDULOPONT);
sor('különböző fajta', kodok.size, [...kodok].join(', '));
gat(fp.length >= 3, 'ALIG KELETKEZETT FORDULÓPONT (' + fp.length + ').');
gat(fp.length <= MAX_FORDULOPONT, 'A FORDULÓPONT-LISTA TÚLNŐTT A KORLÁTON.');
gat(kodok.has('elso_ver'), 'AZ ELSŐ ÖSSZECSAPÁS NEM LETT FORDULÓPONT.',
  'Pedig a 2. vizsgálat szerint volt harc — vagyis a felismerés nem fut le.');
// ── A KORSZAK-ÁG, CÉLZOTT VILÁGON ───────────────────────────────────────
// A valódi meccsen a mai AI nem vált korszakot (lásd a 2. gát megjegyzését),
// így a `korszak` sorozat ÉS a korszak-fordulópont felismerése egyaránt
// vizsgálatlan maradna. Itt egy eldobható világban kifizetjük a váltást.
{
  const p = meccsSim(szondaKonfig(), { egyseg: 8, munkasMinden: 2, gepiEllenfel: false });
  const s = p.sim;
  const gy = new StatisztikaGyujto(s, { mintaTick: 50 });
  for (let cs = 0; cs < 2; cs++) s.gazdasag.ad(cs, NYERS.ETEL, 600);
  s.parancs({ fajta: 'korszak', csapat: 0 });
  for (let t = 0; t < 600; t++) { s.lep(); gy.mintaz(s); }
  const valt = gy.mozog('korszak', 0);
  const van = gy.fordulopontok.some((f) => f.kod === 'korszak');
  sor('korszak-ág', valt ? 'a görbe lépett' : '⛔ nem lépett',
    van ? 'fordulópont: „' + gy.fordulopontok.find((f) => f.kod === 'korszak').szoveg + '"' : '⛔ nincs fordulópont');
  gat(valt, 'A KORSZAK-SOROZAT AKKOR SEM LÉP, HA A VÁLTÁS TÉNYLEG MEGTÖRTÉNT.');
  gat(van, 'A KORSZAKVÁLTÁS NEM LETT FORDULÓPONT.');
  gat(!gy.mozog('korszak', 1), 'A NEM VÁLTÓ CSAPAT KORSZAKA IS MEGLÉPETT.',
    'A sorozat nem csapatonként olvas — két csapat számai keverednek.');
}

let rosszSzoveg = 0;
for (const f of fp) {
  if (/undefined|NaN|null|\[object/.test(f.szoveg + f.ido)) {
    rosszSzoveg++; console.log('     ⛔ ' + f.ido + ' ' + f.szoveg);
  }
}
gat(rosszSzoveg === 0, rosszSzoveg + ' FORDULÓPONT SZÖVEGÉBEN `undefined`/`NaN` VAN.');

// A súly szerinti ritkítás: a fontosak maradjanak meg.
const fontos = gyujto.fontosFordulopontok(8);
let idorend = true;
for (let i = 1; i < fontos.length; i++) if (fontos[i].tick < fontos[i - 1].tick) idorend = false;
gat(idorend, 'A LEGFONTOSABB FORDULÓPONTOK NEM IDŐRENDBEN JÖNNEK.');
console.log('');
for (const f of fontos) console.log('  ' + f.ido.padStart(6) + '  [' + String(f.suly).padStart(3) + ']  ' + f.szoveg);

// ══ 7. ÁLLÁS / MÉRLEG / VÉGÁLLAPOT ═════════════════════════════════════════
cim('7. VIZSGÁLAT — állás, mérleg és a végállapot ŐSZINTESÉGE');

const all = allas(sim);
const pontOssz = all.pont[0] + all.pont[1];
sor('állás-pont', all.pont[0] + ' : ' + all.pont[1], all.szoveg);
gat(Math.abs(pontOssz - 100) < 1e-9, 'AZ ÁLLÁS-PONTOK ÖSSZEGE NEM 100 (' + pontOssz + ').');
gat(all.hivatalos === false, 'AZ ÁLLÁS HIVATALOS EREDMÉNYNEK ADJA KI MAGÁT.',
  'Az `allas()` MÉRCÉKBŐL pontoz (nyersanyag, sereg, épület) — az sosem eredmény, '
  + 'akkor sem, ha a sim már kimondta a győztest. Vezethet az, aki utána veszít.');
for (const t of all.tetelek) {
  console.log('  ' + t.nev.padEnd(22) + String(szamSzoveg(t.ertek[0])).padStart(10)
    + ' : ' + String(szamSzoveg(t.ertek[1])).padEnd(10)
    + (t.vezet < 0 ? '  —' : '  ' + CSAPAT_NEV[t.vezet] + ' vezet') + '   [' + t.suly + ']');
}

const veg = vegallapot(sim);
const m = merleg(gyujto, sim, 0);
console.log('');
sor('végállapot', veg.vege ? 'VÉGE' : 'fut', veg.ok || 'egyik fél sem esett ki');
sor('mérleg címe', '"' + m.cim + '"', 'sorok: ' + m.sorok.length);
gat(m.sorok.length === SOROZAT.length, 'A MÉRLEGBŐL HIÁNYZIK SOR.',
  m.sorok.length + ' ≠ ' + SOROZAT.length);
gat(veg.vege === false, 'A SZONDA MECCSE VÉGET ÉRT VOLNA, PEDIG MINDKÉT FÉL ÉL.');
gat(veg.hivatalos === false, 'A FUTÓ MECCS VÉGÁLLAPOTA HIVATALOSNAK ADJA KI MAGÁT.',
  'sim.gyozelem.vege = ' + sim.gyozelem.vege + ' — amíg az hamis, nincs mit hivatalossá tenni.');
gat(!/Győzelem|Vereség/.test(m.cim),
  'A MÉRLEG GYŐZELMET HIRDET, PEDIG A SIM NEM MONDOTT KI SEMMIT.',
  'cím: "' + m.cim + '" — ez pontosan az a hazugság, amit a v0.16-ban kerülni kell.');

let rosszMerleg = 0;
for (const s of m.sorok) {
  const sz = s.nev + szamSzoveg(s.ertek[0]) + szamSzoveg(s.ertek[1]);
  if (/undefined|NaN|null/.test(sz)) { rosszMerleg++; console.log('     ⛔ ' + s.kulcs + ': ' + sz); }
}
gat(rosszMerleg === 0, rosszMerleg + ' MÉRLEG-SORBAN `undefined`/`NaN` VAN.');

// A DE FACTO KIESÉS ága: külön, ELDOBHATÓ világon. Nem a fenti meccset rontjuk
// el — a `vegallapot` egyetlen ága maradna különben vizsgálatlanul.
//
// ⚠️ MIÉRT MARAD EZ AZ ÁG A v0.17 UTÁN IS. A `gyozelem.js` óta a simnek VAN
// hivatalos vége — de nem ugyanarra a feltételre. A sim a központ elvesztésére
// és a feladásra köt véget; itt viszont a mezőket KÖZVETLENÜL nullázzuk ki,
// `lep()` nélkül, tehát a sim még nem szólalt meg. Pont ezt a rést méri ez a
// blokk: amíg a sim hallgat, a panel mondhat állást, de HIVATALOSNAK nem
// adhatja ki. A hivatalos ágat a 7/b vizsgálat járja ki, valódi meccsen.
{
  const p = meccsSim(szondaKonfig(), { egyseg: 8, munkasMinden: 2, gepiEllenfel: false });
  const s = p.sim;
  for (let i = 0; i < s.egysegek.db; i++) if (s.egysegek.csapat[i] === 1) s.harc.elo[i] = 0;
  for (let i = 0; i < s.epuletek.db; i++) if (s.epuletek.csapat[i] === 1) s.epuletek.elo[i] = 0;
  const v = vegallapot(s);
  const mm = merleg(new StatisztikaGyujto(s), s, 0);
  sor('de facto kiesés', v.vege ? 'felismerve' : '⛔ NEM ismerte fel', 'győztes: ' + v.gyoztes + ' · "' + mm.cim + '"');
  gat(v.vege === true && v.gyoztes === 0, 'A TELJES KIESÉST NEM ISMERI FEL A VÉGÁLLAPOT.');
  gat(mm.cim === 'Győzelem', 'KIESETT ELLENFÉLNÉL SEM ÍR GYŐZELMET A MÉRLEG.', 'cím: ' + mm.cim);
  gat(s.gyozelem.vege === false, 'A SIM KIMONDTA A VÉGET, PEDIG NEM IS LÉPETT.',
    'a mezőket közvetlenül írtuk át — `lep()` nélkül a `gyozelem` nem szólalhat meg');
  gat(v.hivatalos === false, 'A SIM HALLGAT, A PANEL MÉGIS HIVATALOSNAK MONDJA A KIESÉST.');
}

// ══ 7/b. A HIVATALOS VÉG ═══════════════════════════════════════════════════
//
// ── MIÉRT KELLETT EZ A VIZSGÁLAT (v0.17) ──────────────────────────────────
// A szonda eddig azt őrizte, hogy a mérleg SOHA ne hirdessen eredményt — és ez
// helyes volt, amíg a sim nem ismert győzelmi feltételt. A `gyozelem.js`
// landolásával viszont a gát fél igazsággá vált: a „nem hazudik győzelmet"
// mellé kell a párja, hogy „ki is mondja, amikor tényleg vége". A kettő közül
// a MÁSODIK a drágább hiba: egy panel, ami a megnyert meccs végén is csak
// „Állás: te vezetsz"-t ír, pontosan az élményt veszi el, amiért a v0.17
// egyáltalán megszületett — és a determinizmus-kapu elvből vak rá, mert a
// semmittevés is tökéletesen reprodukálható.
//
// Ezért itt VALÓDI meccs fut, ami TÉNYLEG véget ér, mindkét hivatalos úton
// (feladás és a központ elvesztése), és a mérleget a győztes ÉS a vesztes
// szemszögéből is megnézzük. A szám, ami elárulja, hogy csinál is valamit:
// `veg.hivatalos === true` és a `vegeTick`, amit a sim adott.
cim('7/b. VIZSGÁLAT — a HIVATALOS vég (v0.17): a mérleg eredményt hirdet');

/** Egy eldobható meccs, ami a megadott módon ér véget. */
function vegigJatszott(hogyan) {
  const p = meccsSim(szondaKonfig(), { egyseg: 8, munkasMinden: 2, gepiEllenfel: false });
  const s = p.sim;
  const gy = new StatisztikaGyujto(s);
  for (let t = 0; t < 60; t++) { s.lep(); gy.mintaz(s); }
  if (hogyan === 'feladas') {
    s.parancs({ fajta: 'feladas', csapat: 1 });
  } else {
    // A központ elvesztése — a sebzés útján, nem mező-írással: így ugyanaz a
    // kód dönt, mint egy valódi meccsen.
    for (let i = 0; i < s.epuletek.db; i++) {
      if (s.epuletek.csapat[i] === 1 && s.epuletek.tipus[i] === EPULET.KOZPONT) {
        s.epuletek.sebez(i, 1e9, s);
      }
    }
  }
  for (let t = 0; t < 60 && !s.gyozelem.vege; t++) { s.lep(); gy.mintaz(s); }
  return { s, gy };
}

/** A 7/b mért számai — az ÍTÉLET ebből mondja meg, hogy tényleg csinál valamit. */
const hivatalosVegek = [];

for (const [hogyan, vartOk, vartOkNev] of [['feladas', VEG_OK.FELADAS, 'feladta a meccset'],
  ['kozpont', VEG_OK.KOZPONT, 'elvesztette a központját']]) {
  const { s, gy } = vegigJatszott(hogyan);
  const o = s.gyozelem.osszesites();
  const v = vegallapot(s);
  const nyert = merleg(gy, s, 0);
  const vesztett = merleg(gy, s, 1);

  sor(hogyan + ' → sim', o.vege ? 'VÉGE @' + o.vegeTick : '⛔ nem ért véget',
    'győztes: ' + o.gyoztes + ' · ok: „' + o.okNev + '"');
  sor(hogyan + ' → mérleg', '"' + nyert.cim + '" / "' + vesztett.cim + '"',
    v.hivatalos ? 'HIVATALOS · ' + v.ok : '⛔ nem hivatalos');

  gat(o.vege === true, 'A MECCS NEM ÉRT VÉGET (' + hogyan + '), PEDIG A SZABÁLY ELSÜLT VOLNA.');
  gat(o.gyoztes === 0, 'ROSSZ GYŐZTES (' + hogyan + '): ' + o.gyoztes + ', elvárt 0.');
  gat(o.ok === vartOk, 'ROSSZ VÉG-OK (' + hogyan + '): ' + o.ok + ', elvárt ' + vartOk + '.');
  gat(o.vegeTick > 0 && o.vegeTick <= s.tick,
    'A `vegeTick` NEM A MECCS IDEJÉBE ESIK (' + o.vegeTick + ' / ' + s.tick + ').');
  // EZ A LÉNYEG: a panel a sim szavát HIVATALOSNAK adja tovább.
  gat(v.hivatalos === true, 'A MÉRLEG NEM HIVATALOSNAK MONDJA A SIM ÁLTAL KIMONDOTT VÉGET ('
    + hogyan + ').', 'pont ez volt az az „állás-olvasat", amit a v0.17-nek meg kellett szüntetnie');
  gat(v.vegeTick === o.vegeTick, 'A PANEL MÁS TICKRE TESZI A MECCS VÉGÉT, MINT A SIM.',
    'panel: ' + v.vegeTick + ' · sim: ' + o.vegeTick);
  gat(v.ok.includes(vartOkNev), 'A VÉG OKA NEM A SIM `VEG_OK`-JÁBÓL SZÓL.', 'kapott: "' + v.ok + '"');
  gat(nyert.cim === 'Győzelem', 'A GYŐZTES SZEMSZÖGÉBŐL SEM „Győzelem" A CÍM.', 'cím: ' + nyert.cim);
  gat(vesztett.cim === 'Vereség', 'A VESZTES SZEMSZÖGÉBŐL SEM „Vereség" A CÍM.', 'cím: ' + vesztett.cim);
  gat(nyert.hivatalos === true && vesztett.hivatalos === true,
    'A MÉRLEG `hivatalos` JELZŐJE NEM MEGY ÁT A CÍM MELLETT.');

  hivatalosVegek.push(hogyan + ' → „' + nyert.cim + '" @' + o.vegeTick + ' tick ('
    + o.okNev + ')');
}

// ⚠️ SZABOTÁZS-KONTROLL. A fenti nyolc gát akkor is zöld lenne, ha a
// `vegallapot()` MINDIG `hivatalos: true`-t adna vissza — a semmittevés helyett
// itt a „mindig igent mond" a néma hibafajta. Ezért ugyanazzal a felállással,
// de vég NÉLKÜL is megnézzük: ott hamisnak KELL lennie.
{
  const p = meccsSim(szondaKonfig(), { egyseg: 8, munkasMinden: 2, gepiEllenfel: false });
  const s = p.sim;
  for (let t = 0; t < 120; t++) s.lep();
  const v = vegallapot(s);
  sor('szabotázs-kontroll', v.hivatalos ? '⛔ hivatalos' : 'nem hivatalos',
    'ugyanaz a felállás, csak nem ért véget');
  gat(v.hivatalos === false && v.vege === false,
    'A VÉGÁLLAPOT AKKOR IS HIVATALOS VÉGET MOND, HA A MECCS FUT — a 7/b gátjai vakok.');
}

// ══ 8. GÖRBE-MATEMATIKA ════════════════════════════════════════════════════
cim('8. VIZSGÁLAT — a rajzolt görbe tényleg a számokat követi');

const SZEL = 600, MAG = 200;
let kilog = 0, nemNo = 0, lapos = 0, vizsgalt = 0;
for (const s of SOROZAT) {
  const teto = tengelyTeto(gyujto, s.kulcs);
  for (let cs = 0; cs < 2; cs++) {
    const { tomb, db } = gyujto.sorozat(s.kulcs, cs);
    const ut = vonalUt(tomb, db, SZEL, MAG, teto, gyujto.hatar(s.kulcs).min);
    const pontok = ut.split(' ').map((p) => p.split(',').map(Number));
    vizsgalt++;
    if (pontok.length !== db) { nemNo++; continue; }
    let elozoX = -1;
    const yk = new Set();
    for (const [x, y] of pontok) {
      if (!(x >= -0.01 && x <= SZEL + 0.01 && y >= -0.01 && y <= MAG + 0.01)) kilog++;
      if (x <= elozoX) nemNo++;
      elozoX = x;
      yk.add(y);
    }
    if (gyujto.mozog(s.kulcs, cs) && yk.size < 2) {
      lapos++;
      console.log('     ⛔ ' + s.kulcs + '/cs' + cs + ': a sorozat mozog, a vonal mégis vízszintes');
    }
  }
}
sor('vizsgált görbe', vizsgalt, SZEL + '×' + MAG + ' doboz');
sor('dobozból kilógó pont', kilog, kilog === 0 ? 'egy sem' : '⛔');
sor('nem növekvő x', nemNo, nemNo === 0 ? 'szigorúan balról jobbra' : '⛔');
sor('hazug vízszintes', lapos, lapos === 0 ? 'egy sem' : '⛔');
gat(kilog === 0, kilog + ' GÖRBE-PONT LÓG KI A RAJZDOBOZBÓL.');
gat(nemNo === 0, 'A GÖRBE X-KOORDINÁTÁI NEM NŐNEK SZIGORÚAN.');
gat(lapos === 0, lapos + ' MOZGÓ SOROZATBÓL VÍZSZINTES VONAL LETT.',
  'Ez a leggyakoribb néma hiba: a panel „működik", csak nem mutat semmit.');
gat(vonalUt(null, 0, SZEL, MAG, 1) === '' && vonalUt(new Float64Array(4), 0, SZEL, MAG, 1) === '',
  'ÜRES SOROZATBÓL IS KELETKEZETT VONAL.');
gat(vonalUt(new Float64Array([5]), 1, SZEL, MAG, 10).split(' ').length === 2,
  'EGYETLEN MINTÁBÓL NEM LETT LÁTHATÓ SZAKASZ.');

const it = idoTengely(gyujto, 5), et = ertekTengely(tengelyTeto(gyujto, 'nyersOsszes'), 4);
sor('idő-tengely', it.length + ' osztás', it.map((x) => x.cimke).join(' · '));
sor('érték-tengely', et.length + ' osztás', et.map((x) => x.cimke).join(' · '));
gat(it.length === 5 && et.length === 4, 'A TENGELY-OSZTÁSOK SZÁMA NEM A KÉRT.');
gat(!/undefined|NaN/.test(it.map((x) => x.cimke).join() + et.map((x) => x.cimke).join()),
  'A TENGELY-FELIRATBAN `undefined`/`NaN` VAN.');

// ══ 9. A PANEL FELÉPÜL ═════════════════════════════════════════════════════
// A panel DOM-ot használ, tehát node-ban „nem fut" — de a FELÉPÜLÉSE igenis
// vizsgálható egy minimál DOM-mal, és pont ez a legdrágább hibafajta: egy
// elgépelt ikonnév (`ikonSvg` DOB rá), egy nem létező metódus vagy egy rossz
// mezőnév némán halott panelt csinál, amit csak a képernyőn vennénk észre —
// a felhőben pedig nincs képernyő. A stub SZÁNDÉKOSAN buta: nem HTML-motor,
// csak a hívások épségét bizonyítja.
cim('9. VIZSGÁLAT — a panel felépül és lefut minimál DOM-on');

// A panel a SAJÁT CSS-ét importálja (`import './panel_statisztika.css'`) — ezt
// a böngészőben a vite oldja fel, node-ban viszont ismeretlen kiterjesztés. Egy
// betöltő-horoggal üres modullá tesszük; a stílus vizsgálatához úgysem itt van
// a helye.
const { registerHooks } = await import('node:module');
registerHooks({
  load(url, ctx, next) {
    if (url.endsWith('.css')) return { format: 'module', shortCircuit: true, source: 'export default {}' };
    return next(url, ctx);
  },
});

_domStub();
const { PanelStatisztika, PANEL } = await be('src', 'ui', 'panel_statisztika.js');

gat(PANEL && PANEL.nev === 'statisztika' && PANEL.hely === 'kepernyo' && !!PANEL.cim,
  'A PANEL-LEÍRÓ NEM A SZERZŐDÉS SZERINTI.', JSON.stringify(PANEL));
for (const t of ['frissit', 'bont']) {
  gat(typeof PanelStatisztika.prototype[t] === 'function',
    'A PANELBŐL HIÁNYZIK A SZERZŐDÉS `' + t + '()` METÓDUSA.');
}

const gyoker = document.createElement('div');
const p = new PanelStatisztika(gyoker, sim, null, { sajatCsapat: 0, gyujto: gyujto });
sor('gyökér gyermekei', gyoker.children.length, 'lap + vége-képernyő');
gat(gyoker.children.length >= 2, 'A PANEL NEM ÉPÍTETT FEL SEMMIT.');
gat(gyoker.classList.contains('aoc-stat-rejtve'), 'A PANEL NYITVA INDUL.',
  'Egy induláskor nyitott statisztika eltakarná a meccs első percét.');

// Minden fül végigjárása: a rajzoló ágak így tényleg lefutnak.
let hiba = '';
try {
  p.nyit();
  for (const f of ['gazdasag', 'nepesseg', 'katonai', 'terkep', 'merleg']) {
    p._fulValt(f);
    p._rajzoltValtozat = -1;
    p.frissit(sim, 1e9);
  }
  p.mutatVeget();
  p.zar();
  p.bont();
} catch (e) { hiba = e && e.message ? e.message : String(e); }
sor('öt fül + vége-képernyő', hiba ? 'HIBA' : 'lefutott', hiba || 'kivétel nélkül');
gat(hiba === '', 'A PANEL KIVÉTELT DOBOTT RAJZOLÁS KÖZBEN.', hiba);
gat(_figyelok === 0, 'A `bont()` NEM SZEDTE LE A BILLENTYŰ-FIGYELŐT.',
  'Bennmaradt figyelő: ' + _figyelok + ' — meccsenként egy szivárgás.');

/** Minimál DOM. Csak annyi, amennyit a panel tényleg használ. */
function _domStub() {
  const elem = (tag) => {
    const e = {
      tagName: String(tag).toUpperCase(), children: [], _szoveg: '', _html: '',
      style: {}, dataset: {}, attr: {}, type: '', title: '', isContentEditable: false,
      className: '',
      classList: {
        _h: new Set(),
        add(n) { this._h.add(n); }, remove(n) { this._h.delete(n); },
        contains(n) { return this._h.has(n); },
        toggle(n, f) { const v = f === undefined ? !this._h.has(n) : !!f; if (v) this._h.add(n); else this._h.delete(n); return v; },
      },
      appendChild(c) { this.children.push(c); return c; },
      removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); return c; },
      setAttribute(n, v) { this.attr[n] = String(v); },
      getAttribute(n) { return this.attr[n]; },
      addEventListener() {}, removeEventListener() {},
      dispatchEvent() { return true; },
      get firstChild() { return this.children[0] || null; },
      get textContent() { return this._szoveg; },
      set textContent(v) { this._szoveg = String(v); if (v === '') this.children.length = 0; },
      get innerHTML() { return this._html; },
      set innerHTML(v) { this._html = String(v); this.children.length = 0; },
    };
    return e;
  };
  globalThis.document = {
    createElement: elem,
    createElementNS: (ns, tag) => elem(tag),
  };
  globalThis.window = {
    addEventListener() { _figyelok++; },
    removeEventListener() { _figyelok--; },
  };
  globalThis.CustomEvent = class { constructor(t, o) { this.type = t; this.detail = o; } };
}

// ── AMIT A JÁTÉKOS LÁTNI FOG ───────────────────────────────────────────────
cim('AMIT A JÁTÉKOS LÁTNI FOG — a görbék ASCII-ben');
const BLOKK = '▁▂▃▄▅▆▇█';
for (const kulcs of ['nyersOsszes', 'percenkent', 'nepesseg', 'katonaiEro', 'epulet', 'elesett']) {
  const s = SOROZAT.find((x) => x.kulcs === kulcs);
  const h = gyujto.hatar(kulcs);
  const tart = h.max - h.min || 1;
  console.log('\n  ' + s.nev + '   (0 … ' + szamSzoveg(h.max) + ')');
  for (let cs = 0; cs < 2; cs++) {
    const { tomb, db } = gyujto.sorozat(kulcs, cs);
    let vonal = '';
    const lepes = Math.max(1, Math.floor(db / 64));
    for (let i = 0; i < db; i += lepes) {
      const a = (tomb[i] - h.min) / tart;
      vonal += BLOKK[Math.min(7, Math.max(0, Math.round(a * 7)))];
    }
    console.log('    ' + CSAPAT_NEV[cs].padEnd(6) + vonal + '  ' + szamSzoveg(tomb[db - 1]));
  }
}

console.log('\n  MÉRLEG (' + m.ido + ' játékidő, ' + sim.tick + ' tick)');
// ⚠️ EZ A MONDAT A v0.17-IG HAZUDOTT. Addig azt írta ide, hogy „a sim nem ismer
// győzelmi feltételt" — ez a `gyozelem.js` landolása óta NEM IGAZ. A meccsnek
// van hivatalos vége, csak ez a konkrét meccs (9 000 tick, két élő központ) nem
// ért véget. A kettő nem ugyanaz, és a különbséget a jelentésnek is meg kell
// mutatnia, különben a szonda tanítja meg a következő olvasót arra, ami már
// nem áll. A hivatalos véget a 7/b vizsgálat járatja ki, valódi meccsen.
console.log('    ' + m.cim + (m.hivatalos
  ? '   — HIVATALOS eredmény (a sim mondta ki)'
  : '   — állás-olvasat: ez a meccs még fut, a sim nem mondott ki véget'));

// ── ÍTÉLET ────────────────────────────────────────────────────────────────
cim('ÍTÉLET');
if (bukas === 0) {
  console.log('  ✅ A STATISZTIKA MÉR:');
  console.log('     ' + MECCS_TICK + ' tick valódi meccs → ' + gyujto.db + ' minta, '
    + mozgo.size + '/' + SOROZAT.length + ' sorozat mozog, ' + fp.length + ' fordulópont');
  console.log('     ugyanez ÁLLÓ világon → ' + gyujtoAllo.mozgoSorozatok()
    + ' mozgó sorozat, ' + gyujtoAllo.fordulopontok.length + ' fordulópont (szabotázs-próba)');
  console.log('     memória: ' + szamSzoveg(gyujto.memoriaBajt) + ' B FIX ('
    + szuk.ritkitasDb + '× ritkítás a szűk gyűjtőn, ' + MINTA_TICK + ' → '
    + szuk.mintaTick + ' tick mintaköz)');
  console.log('     begyűjtve: ' + nyers.join(' / ') + ' · elesett: ' + halott.join(' / ')
    + ' · sebzés: ' + seb.join(' / ') + ' · ' + TICK_HZ + ' Hz');
  console.log('     HIVATALOS VÉG (v0.17): ' + hivatalosVegek.join(' · '));
} else {
  console.log('  ❌ ' + bukas + ' vizsgálat BUKOTT.');
}
console.log('');
process.exit(bukas === 0 ? 0 : 1);
