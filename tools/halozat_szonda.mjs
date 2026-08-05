// AGE OF THE CRYSTALS — HÁLÓZATI SZONDA (v0.8/2–3).
//
// ── MIÉRT NEM A DETERMINIZMUS-SZONDÁBAN VAN ───────────────────────────────
// A `npm run det` TISZTA: nincs benne port, nincs időzítés, nincs másik
// folyamat. Pont ez az értéke — ha bukik, a szimuláció a hibás, nem a
// környezet. Egy socketes vizsgálat ebbe beleerőltetve elrontaná ezt a
// tulajdonságot: egy foglalt port vagy egy lassú gép „determinizmus-hibaként"
// jelentkezne, és néhány hamis riasztás után senki nem hinne a kapunak.
//
// Ezért külön szonda, külön paranccsal (`npm run halo`).
//
// ── MIT VIZSGÁL ───────────────────────────────────────────────────────────
// Két KÜLÖN kliens, VALÓDI WebSocket-kapcsolaton, a relayen keresztül,
// ugyanabból a seedből — és a végén a két szimuláció ÁLLAPOT-HASHÉNEK bitre
// egyeznie kell. Ez a v0.8 ígéretének végpontok közötti próbája.
//
// ⚠️ A HASH-EGYEZÉS ÖNMAGÁBAN NEM ELÉG. Két olyan kliens is tökéletesen
// egyezik, amelyik SEMMIT nem csinál: nem küld parancsot, nem lép kört. Ezért
// a szonda azt is megköveteli, hogy tényleg menjen át forgalom (a relay
// továbbított csomagot), hogy fusson kör, és hogy VALÓDI PARANCS hajtódjon
// végre — vagyis hogy a `helyiParancs → socket → relay → fogad →
// parancsTickre` út VÉGIG lefusson.
//
// ⚠️ v0.18: és hogy a MECCS MÉG ÉLJEN a mérés végén. A v0.17 óta a lefutott
// meccsben a `vegrehajt()` minden parancsot eldob — a „végrehajtott parancs"
// gát ilyenkor a hálózatot vádolná egy világ-állapot miatt, a hash-egyezés
// pedig továbbra is tökéletes lenne, mert egy halott meccs bitre
// reprodukálható. A `gyozelem.vegeTick` és a vég miatt eldobott parancsok
// száma ezért ki van írva.
//
// HASZNÁLAT:  node tools/halozat_szonda.mjs [--port=8791] [--kor=200]
// Kilépési kód: 0 = rendben, 1 = bukás.

import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const GYOKER = dirname(dirname(fileURLToPath(import.meta.url)));
const erv = (nev, alap) => {
  const a = process.argv.find((x) => x.startsWith('--' + nev + '='));
  return a === undefined ? alap : Number(a.split('=')[1]);
};
const PORT = erv('port', 8791);
const KOROK = erv('kor', 200);

const { Sim } = await import(pathToFileURL(join(GYOKER, 'src', 'sim', 'sim.js')).href);
const { Lockstep, KOR_TICK } = await import(
  pathToFileURL(join(GYOKER, 'src', 'net', 'lockstep.js')).href);
const { WebSocketSzallitas } = await import(
  pathToFileURL(join(GYOKER, 'src', 'net', 'websocket.js')).href);

let bukas = 0;
const sor = (a, b, c) => console.log('  ' + String(a).padEnd(32) + String(b).padEnd(16) + (c ?? ''));
const cim = (t) => console.log('\n' + t + '\n' + '─'.repeat(78));

const varj = (ms) => new Promise((r) => setTimeout(r, ms));

cim('AGE OF THE CRYSTALS — HÁLÓZATI SZONDA (v0.8/2–3)');

// ── A RELAY INDÍTÁSA KÜLÖN FOLYAMATBAN ────────────────────────────────────
// Külön folyamat, nem import: így a vizsgálat pontosan azt futtatja, amit a
// valódi kiszolgáló futtatna — ugyanazzal a paranccsal, ugyanazokkal az
// argumentumokkal.
const relay = spawn(process.execPath, [join(GYOKER, 'server', 'relay.mjs'), '--port=' + PORT], {
  stdio: ['ignore', 'pipe', 'pipe'],
});
let relayNaplo = '';
relay.stdout.on('data', (d) => { relayNaplo += d.toString(); });
relay.stderr.on('data', (d) => { relayNaplo += d.toString(); });

// Megvárjuk, amíg tényleg figyel. A napló első sora ezt mondja ki — nem
// vakon várunk egy kerek számot.
for (let i = 0; i < 100 && !relayNaplo.includes('figyel a'); i++) await varj(50);
if (!relayNaplo.includes('figyel a')) {
  console.log('\n  ⛔ A RELAY EL SEM INDULT.\n' + relayNaplo);
  relay.kill();
  process.exit(1);
}
sor('relay', 'fut', 'port ' + PORT + ', külön folyamat');

// ── KÉT KLIENS ────────────────────────────────────────────────────────────
/**
 * Egy kliens. A `Sim` CSAK a `rajt`-kor jön létre, a szervertől kapott
 * seeddel — a terep abból épül, tehát előbb nem is lehetne.
 */
function kliens(nev) {
  const k = { nev, sim: null, ls: null, kesz: false, parancsDb: 0, visszatert: false };
  k.kapcsol = () => {
    k.szallitas = new WebSocketSzallitas('ws://127.0.0.1:' + PORT + '?szoba=szonda', {
      rajt: ({ jatekos, jatekosDb, seed }) => {
        k.sim = new Sim({ seed, n: 256, maxEgyseg: 2000 });
        k.sim.szondaFelallasV06(24);
        k.ls = new Lockstep(k.sim, {
          jatekos, jatekosDb, kuld: (u) => k.szallitas.kuld(u),
        });
        // INDÍTÁS a bekötés UTÁN — lásd `Lockstep.indit()` fejlécét.
        k.ls.indit();
        k.kesz = true;
      },
      // ÚJRACSATLAKOZÁS: a világot a pillanatképből kapjuk, nem a seedből
      // építjük. A `Sim`-et attól még ugyanazzal a seeddel hozzuk létre — a
      // terep abból következik, és a `betoltes` külön ellenőrzi is, hogy
      // egyezik-e.
      visszater: (p, { jatekos, jatekosDb, seed }) => {
        k.sim = new Sim({ seed, n: 256, maxEgyseg: 2000 });
        k.ls = new Lockstep(k.sim, {
          jatekos, jatekosDb, kuld: (u) => k.szallitas.kuld(u),
        });
        const e = k.ls.visszaallit(p);
        if (!e.ok) { console.log('  ⛔ VISSZAÁLLÁS BUKOTT: ' + e.hiba); bukas++; }
        k.kesz = true;
        k.visszatert = true;
      },
      pillanatkep: () => (k.ls ? k.ls.pillanatkep() : null),
      fogad: (u) => { if (k.ls) k.ls.fogad(u); },
    });
  };
  k.kapcsol();
  return k;
}

const A = kliens('A');
const B = kliens('B');

for (let i = 0; i < 200 && !(A.kesz && B.kesz); i++) await varj(25);
if (!A.kesz || !B.kesz) {
  console.log('\n  ⛔ A KÉT KLIENS NEM INDULT EL (A: ' + A.kesz + ', B: ' + B.kesz + ').');
  console.log('     A relay `rajt` üzenete nem ért célba, vagy a szoba nem telt be.');
  console.log(relayNaplo);
  relay.kill();
  process.exit(1);
}
sor('kliens', 'kettő elindult', 'közös seed: ' + A.szallitas.seed);
if (A.szallitas.seed !== B.szallitas.seed) {
  console.log('\n  ⛔ A KÉT KLIENS MÁS SEEDET KAPOTT — más pályán játszanának.');
  bukas++;
}

// ── A MECCS ───────────────────────────────────────────────────────────────
// A körökhöz `await`-elünk, mert a csomagok VALÓDI socketen jönnek: a
// `lep()` csak akkor lép, ha megérkezett mindenki csomagja, addig vár.
async function meccs(celKor) {
let lepesNelkul = 0;
for (let k = 0; k < celKor * 6 && (A.ls.kor < celKor || B.ls.kor < celKor); k++) {
  // Parancsok: mindkét játékos, körszámból származtatva — determinisztikus
  // „játékos", nem véletlen.
  for (const g of [A, B]) {
    const j = g.ls.jatekos;
    if ((g.ls.kor % 20) === (j * 9) && g.sim.egysegek.db > 0) {
      const e = g.sim.egysegek;
      const kik = [];
      for (let i = 0; i < e.db && kik.length < 4; i++) {
        if (e.csapat[i] === j && g.sim.harc.elo[i]) kik.push(i);
      }
      if (kik.length) {
        g.ls.helyiParancs({
          fajta: 'menet', egysegek: kik,
          x: 50 + ((g.ls.kor * 17) % 150), y: 50 + ((g.ls.kor * 23) % 150),
        });
        g.parancsDb++;
      }
    }
  }
  const a = A.ls.lep();
  const b = B.ls.lep();
  if (a === 0 && b === 0) {
    if (++lepesNelkul > 600) break;   // beragadt — a lenti gátak jelentik
    await varj(2);                     // hagyjuk a socketet dolgozni
  } else {
    lepesNelkul = 0;
    // Az eseményhurok ENGEDÉSE minden körben: enélkül a beérkező csomagok
    // sosem kerülnének feldolgozásra, és a második kör után beállna a meccs.
    await varj(0);
  }
}
}
await meccs(KOROK);

const la = A.ls.osszesites(), lb = B.ls.osszesites();
const ha = A.sim.allapotHash(), hb = B.sim.allapotHash();
const sza = A.szallitas.osszesites(), szb = B.szallitas.osszesites();

sor('lefutott kör', la.vegrehajtottKor + ' / ' + lb.vegrehajtottKor, KOR_TICK + ' tick/kör');
sor('socket-forgalom', sza.kuldott + '↑ ' + sza.fogadott + '↓  ·  '
  + szb.kuldott + '↑ ' + szb.fogadott + '↓', 'küldött / fogadott csomag');
sor('kiadott parancs', A.parancsDb + ' / ' + B.parancsDb,
  'végrehajtva: ' + la.vegrehajtottParancs + ' / ' + lb.vegrehajtottParancs);
sor('hash-vizsgálat', la.hashVizsgalat + ' / ' + lb.hashVizsgalat, 'desync-detektor futásai');
sor('záró hash', '0x' + (ha >>> 0).toString(16).padStart(8, '0')
  + (ha === hb ? '  =  ' : '  ≠  ') + '0x' + (hb >>> 0).toString(16).padStart(8, '0'));

if (la.vegrehajtottKor < KOROK || lb.vegrehajtottKor < KOROK) {
  console.log('\n  ⛔ A MECCS NEM JUTOTT EL A ' + KOROK + '. KÖRIG.');
  console.log('     Beragadt lockstep: valamelyik fél csomagja nem ért célba.');
  bukas++;
}
if (ha !== hb) {
  console.log('\n  ⛔ A KÉT KLIENS SZÉTTARTOTT VALÓDI HÁLÓZATON.');
  console.log('     A hurokban ugyanez a kód egyezett, tehát a szállítás a gyanús:');
  console.log('     elveszett vagy megkettőződött csomag, vagy a relay átírta a tartalmat.');
  bukas++;
}
// A DETERMINIZMUS-KAPU NEM MŰKÖDÉS-KAPU: két néma kliens is tökéletesen
// egyezik. Ezek a számok mondják meg, hogy tényleg volt-e meccs.
if (sza.fogadott === 0 || szb.fogadott === 0) {
  console.log('\n  ⛔ VALAMELYIK KLIENS EGYETLEN CSOMAGOT SEM KAPOTT a socketen.');
  bukas++;
}
if (la.vegrehajtottParancs === 0 || lb.vegrehajtottParancs === 0) {
  console.log('\n  ⛔ EGYETLEN PARANCS SEM HAJTÓDOTT VÉGRE a hálózati úton.');
  console.log('     A két kliens egyezik, de ÜRESEN — a `helyiParancs → socket →');
  console.log('     relay → fogad → parancsTickre` lánc nem futott végig, tehát a');
  console.log('     vizsgálat a hálózatról semmit nem bizonyít.');
  bukas++;
}
if (la.hashVizsgalat === 0 || lb.hashVizsgalat === 0) {
  console.log('\n  ⛔ A DESYNC-DETEKTOR EGYSZER SEM FUTOTT LE a hálózaton át.');
  bukas++;
}

// ── ⚠️ ÉLŐ MECCSEN MÉRTÜNK-E? (v0.18) ─────────────────────────────────────
//
// A v0.17 óta a meccsnek VÉGE LEHET, és a vég után a `parancsok.js`
// `vegrehajt()` ELSŐ sora minden parancsot eldob (`elutasitottParancs++`).
// Ennek itt sajátos következménye van: a fenti „egyetlen parancs sem hajtódott
// végre" gát elsülne — de a HIBAÜZENETE a hálózatot vádolná, holott a lánc
// tökéletesen működött, csak a világ már eldőlt. Egy fél órás hibakeresés a
// socket körül, egy olyan hiba miatt, ami nem is a hálózaté.
//
// Ráadásul a hash-egyezés ilyenkor is tökéletes: EGY HALOTT MECCS BITRE
// REPRODUKÁLHATÓ. Pont az a csapda, amiért a `TODO.md` „a munkások VÉGLEG
// tétlenné válnak" tétele TÉVES DIAGNÓZIS volt.
//
// A mai felállásban ez nem fenyeget (800 tick, csak `menet` parancsok, se AI,
// se harc), de a számot akkor is ki kell írni — a hallgatás az, ami a következő
// olvasót félrevezeti.
const gyA = A.sim.gyozelem.osszesites(), gyB = B.sim.gyozelem.osszesites();
sor('a meccs él-e', (gyA.vege ? '⚠️ VÉGE @' + gyA.vegeTick : 'fut') + ' / '
  + (gyB.vege ? '⚠️ VÉGE @' + gyB.vegeTick : 'fut'),
  'vég miatt eldobott parancs: ' + gyA.elutasitottParancs + ' / ' + gyB.elutasitottParancs);
if (gyA.vege || gyB.vege || gyA.elutasitottParancs > 0 || gyB.elutasitottParancs > 0) {
  console.log('\n  ⛔ A HÁLÓZATI PRÓBA MECCSE VÉGET ÉRT MÉRÉS KÖZBEN.');
  console.log('     A vég után a `vegrehajt()` MINDEN parancsot eldob, tehát a fenti');
  console.log('     „végrehajtott parancs" szám nem a szállításról szól többé — és a');
  console.log('     hash-egyezés sem, mert egy halott meccs bitre reprodukálható.');
  bukas++;
}

// ── ÚJRACSATLAKOZÁS-PRÓBA (v0.8/3) ────────────────────────────────────────
//
// A B kliens KIESIK, majd VISSZATÉR. A szerver nem tud pillanatképet adni (nem
// szimulál), ezért az A klienstől kéri el, és továbbítja. A követelmény:
//
//   • a visszatérő SIMJE a pillanatképből álljon vissza (nem a seedből épüljön
//     újra — az a 0. tick világa lenne);
//   • a meccs MENJEN TOVÁBB, ne ragadjon be;
//   • és a végén a két szimuláció megint BITRE azonos legyen.
//
// ⚠️ A HARMADIK PONT A LÉNYEG. Egy visszatérés, ami „működik", de a világot
// egy hajszálnyival máshogy állítja vissza, PONTOSAN olyan, mint egy desync —
// csak nehezebb észrevenni, mert a kliens szemszögéből minden rendben zajlott.
{
  const korElotte = A.ls.kor;
  B.szallitas.bont();
  await varj(150);

  B.kesz = false;
  B.kapcsol();
  for (let i = 0; i < 200 && !B.kesz; i++) await varj(25);

  sor('újracsatlakozás', B.visszatert ? 'pillanatképből' : 'NEM SIKERÜLT',
    'kiesés a ' + korElotte + '. körnél, visszatérés a ' + (B.ls ? B.ls.kor : -1) + '.-nél');
  if (!B.kesz || !B.visszatert) {
    console.log('\n  ⛔ A VISSZATÉRŐ KLIENS NEM KAPOTT PILLANATKÉPET.');
    console.log('     A relay a `mentes_kell`-t az élő társnak küldi, az pedig a');
    console.log('     `mentes`-t a címzettnek. Nézd meg mindkét irányt.');
    bukas++;
  } else {
    // TOVÁBB A MECCSEL. Ha a visszaállás rossz, ez vagy beragad (hiányzó
    // csomagok), vagy szétcsúszó hash-sel fut tovább — mindkettőt látjuk.
    await meccs(A.ls.kor + 60);
    const ua = A.sim.allapotHash(), ub = B.sim.allapotHash();
    const rla = A.ls.osszesites(), rlb = B.ls.osszesites();
    sor('visszatérés után', rla.vegrehajtottKor + ' / ' + rlb.vegrehajtottKor + ' kör',
      'a visszatérő a ' + B.ls.kor + '. körnél tart');
    sor('hash a folytatás után', '0x' + (ua >>> 0).toString(16).padStart(8, '0')
      + (ua === ub ? '  =  ' : '  ≠  ') + '0x' + (ub >>> 0).toString(16).padStart(8, '0'));
    if (A.ls.kor <= korElotte + 5) {
      console.log('\n  \u26d4 A MECCS BERAGADT A VISSZATÉRÉS UTÁN.');
      console.log('     A visszatérő a bemenet-késleltetés miatt hiányzó SAJÁT csomagjait');
      console.log('     nem küldte el (`indit(kor)`), vagy a pillanatképből hiányoztak a');
      console.log('     társ már elküldött, de még végre nem hajtott csomagjai.');
      bukas++;
    }
    if (ua !== ub) {
      console.log('\n  \u26d4 A VISSZATÉRŐ MÁS VILÁGBAN FOLYTATTA. A pillanatkép nem állította');
      console.log('     vissza pontosan az állapotot — ez ugyanaz a hiba-osztály, amit a');
      console.log('     determinizmus-szonda 10. vizsgálata őriz (mentés → betöltés →');
      console.log('     folytatás). Ott zöld, itt piros: a KÜLÖNBSÉG a hálózati úton van.');
      bukas++;
    }
  }
}

// ── HAMISÍTÁS-PRÓBA ───────────────────────────────────────────────────────
//
// ⚠️ A RELAY EGYETLEN TEKINTÉLYE: Ő BÉLYEGZI A JÁTÉKOS-AZONOSÍTÓT. Ez nem
// elhagyható kényelem — enélkül bárki küldhetne csomagot a MÁSIK játékos
// nevében, és parancsolhatna az ő seregének. Egy lockstep-játékban ez a
// legkézenfekvőbb csalás, és a relay az EGYETLEN hely, ahol megfogható: a
// kliensek nem látják egymás kapcsolatát, tehát nem tudják ellenőrizni,
// kitől jött valójában a csomag.
//
// A próba: az A kliens (0. játékos) `jatekos: 1`-nek HAZUDVA küld. A B
// kliensnek 0-ként kell látnia.
{
  let latott = -99;
  const eredetiFogad = B.szallitas._fogad;
  B.szallitas._fogad = (u) => { latott = u.jatekos; };
  A.szallitas.kuld({ fajta: 'kor', kor: 99999, jatekos: 1, parancsok: [], hashKor: -1, hash: 0 });
  await varj(150);
  B.szallitas._fogad = eredetiFogad;

  sor('hamisított feladó', 'küldve: 1  ·  látott: ' + latott,
    latott === 0 ? 'a relay felülbélyegezte' : 'ÁTMENT');
  if (latott !== 0) {
    console.log('\n  ⛔ A RELAY ÁTENGEDTE A HAMIS JÁTÉKOS-AZONOSÍTÓT.');
    console.log('     Így bárki parancsolhatna a másik játékos seregének. A csomag');
    console.log('     `jatekos` mezőjét a szervernek FELÜL KELL ÍRNIA a kapcsolat');
    console.log('     sorszámával, akármit is írt bele a feladó.');
    bukas++;
  }
}

A.szallitas.bont();
B.szallitas.bont();
await varj(120);
relay.kill();

cim('ÍTÉLET');
if (bukas === 0) {
  console.log('  ✅ VÉGPONTOK KÖZÖTTI LOCKSTEP MŰKÖDIK: két kliens, valódi socket,');
  console.log('     közös relay — a két szimuláció bitre azonos.');
} else {
  console.log('  ❌ ' + bukas + ' vizsgálat BUKOTT.');
}
console.log('');
process.exit(bukas === 0 ? 0 : 1);
