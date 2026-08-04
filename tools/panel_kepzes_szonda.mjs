// AGE OF THE CRYSTALS — KÉPZÉS-PANEL SZONDA (v0.16).
//
// ── MIÉRT VAN EZ, AMIKOR VAN MÁR DETERMINIZMUS-KAPU ───────────────────────
// Mert a determinizmus-kapu NEM MŰKÖDÉS-KAPU. Egy képzés-panel, ami mind a hat
// gombot tiltottnak mutatja, tökéletesen determinisztikus: a hash bitre egyezik,
// a `npm run det` zöld, és a játékos nem tud egységet képezni. Ez a projekt
// hatszor égett meg pontosan ezen.
//
// Ezért ez a szonda SZÁMOKAT mond, nem pipákat:
//   • hány egységtípus képezhető egy adott állásban,
//   • hány tiltott, és MELYIK OKBÓL (okonként bontva),
//   • és hogy amit „képezhetőnek" mond, abból SZÜLETIK-E VALÓDI EGYSÉG.
//
// ── A KÉT IRÁNY, AMI SZÁMÍT ───────────────────────────────────────────────
// 1. AMIT ENGED, AZ MENJEN ÁT. Minden „képezhető" tételre beadjuk PONTOSAN azt
//    a parancsot, amit a kattintás adna (`kepzesParancs`), végigjáratjuk a
//    képzést, és megnézzük, született-e ILYEN TÍPUSÚ egység. Ha a parancs alakja
//    elcsúszna (`egyseg` helyett `tipus`), a sim csendben MUNKÁST képezne — itt
//    ez kiderül, mert típusonként számolunk.
// 2. AMIT TILT, AZ TÉNYLEG NE MENJEN. A tiltott tételekre IS beadjuk a parancsot,
//    és megköveteljük, hogy semmi ne történjen: se sor, se nyersanyag-mozgás.
//    Egy „óvatosságból letiltott", de valójában működő gomb ugyanúgy hazugság,
//    mint a fordítottja.
//
// ── ÉS A SZONDÁNAK IS VAN FOGA? ───────────────────────────────────────────
// A 8. vizsgálat SZABOTÁL: eljátssza a projekt két valódi hibáját (a hatodik
// típus némán kiesik; a panel mindent képezhetőnek hazudik), és megköveteli,
// hogy a fenti vizsgálatok ELBUKJANAK rá. Ha a szabotált futás is átmegy, a
// szonda értéktelen — és akkor EZ a szonda bukik.
//
// HASZNÁLAT:  npm run p:kepzes     (node tools/panel_kepzes_szonda.mjs)
// Kilépési kód: 0 = rendben, 1 = bukás.

import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const GYOKER = dirname(dirname(fileURLToPath(import.meta.url)));
const be = (...r) => import(pathToFileURL(join(GYOKER, ...r)).href);

const { Sim, KESLELTETES } = await be('src', 'sim', 'sim.js');
const { TIPUS, TIPUS_DB } = await be('src', 'sim', 'units.js');
const { EPULET, EPULET_NEV } = await be('src', 'sim', 'epuletek.js');
const { SOR_HOSSZ } = await be('src', 'sim', 'kepzes.js');
const { CIV, CIV_NEV } = await be('src', 'sim', 'civ.js');
const { ikonSvg, IKON_NEVEK } = await be('src', 'ui', 'ikonok.js');
const A = await be('src', 'ui', 'panel_kepzes_adat.js');
const {
  ujKepzesAllapot, kepzesAdat, kepzesParancs, arSzoveg, idoSzoveg, egysegNev,
  EGYSEG_NEV, EGYSEG_IKON, EPULET_IKON, OK, OK_DB, OK_SZOVEG, OK_TANACS,
} = A;

const SEED = 20260803;

let bukas = 0;
const sor = (a, b, c) => console.log('  ' + String(a).padEnd(32) + String(b).padEnd(30) + (c ?? ''));
const cim = (t) => console.log('\n' + t + '\n' + '─'.repeat(78));
const gat = (all, szoveg, reszlet) => {
  if (all) return true;
  console.log('\n  ⛔ ' + szoveg);
  if (reszlet) console.log('     ' + reszlet);
  bukas++;
  return false;
};

// ── KÖZÖS FELÁLLÁS ────────────────────────────────────────────────────────
// EGYSÉG NÉLKÜL dolgozunk (`szondaFelallas(0)`): így nincs munkás, aki közben
// nyersanyagot hozna be, tehát a készlet-különbségek PONTOSAN a képzés árát
// mutatják. A népességet ott töltjük fel, ahol épp az a vizsgálat tárgya.

function ujSim(civ) {
  const s = new Sim({ seed: SEED, n: 128, maxEgyseg: 400 });
  if (civ !== undefined) s.civValaszt(0, civ);
  s.szondaFelallas(0);
  return s;
}

/** A csapat központjának középpontja — innen keresünk építési helyet. */
function kozpont(sim, csapat = 0) {
  const ep = sim.epuletek;
  for (let i = 0; i < ep.db; i++) {
    if (ep.csapat[i] === csapat && ep.tipus[i] === EPULET.KOZPONT) {
      return { x: ep.x[i] | 0, y: ep.y[i] | 0 };
    }
  }
  return { x: sim.n >> 1, y: sim.n >> 1 };
}

/** Kész épület lerakása a csapat bázisa mellé. @returns {number} index vagy -1 */
function epit(sim, tipus, csapat = 0) {
  const k = kozpont(sim, csapat);
  const hely = sim._szabadEpuletHely(tipus, k.x, k.y);
  if (!hely) return -1;
  return sim.epuletek.lerak(tipus, hely.x, hely.y, csapat, true);
}

/** Tele kassza — ahol nem az ár a vizsgálat tárgya. */
function gazdag(sim, csapat = 0, mennyi = 100000) {
  for (let f = 0; f < 4; f++) sim.gazdasag.keszlet[csapat * 4 + f] = mennyi;
}

function lep(sim, n) { for (let t = 0; t < n; t++) sim.lep(); }

/** Élő egységek száma típusonként egy csapatnál. */
function egysegDb(sim, csapat, tipus) {
  const e = sim.egysegek;
  let n = 0;
  for (let i = 0; i < e.db; i++) {
    if (e.csapat[i] !== csapat || sim.harc.elo[i] === 0) continue;
    if (e.tipus[i] === tipus) n++;
  }
  return n;
}

/** A négy nyersanyag pillanatnyi állása másolatban. */
function keszlet(sim, csapat = 0) {
  const o = csapat * 4;
  return [sim.gazdasag.keszlet[o], sim.gazdasag.keszlet[o + 1],
    sim.gazdasag.keszlet[o + 2], sim.gazdasag.keszlet[o + 3]];
}

/** A hat típus képzőhelyeivel felszerelt bázis. */
function teljesBazis(sim) {
  epit(sim, EPULET.LAKTANYA);
  epit(sim, EPULET.IJASZDA);
  epit(sim, EPULET.ISTALLO);
  epit(sim, EPULET.OSTROMMUHELY);
  epit(sim, EPULET.HAZ);
  epit(sim, EPULET.HAZ);
  epit(sim, EPULET.HAZ);
  return sim;
}

const puffer = ujKepzesAllapot();
const kepAdat = (sim, csapat = 0) => kepzesAdat(sim, csapat, puffer);

cim('AGE OF THE CRYSTALS — KÉPZÉS-PANEL SZONDA (v0.16)');

// ══════════════════════════════════════════════════════════════════════════
// 1. VIZSGÁLAT — A HAT TÍPUS MEGVAN, ÉS MINDEGYIKNEK VAN IKONJA
// ══════════════════════════════════════════════════════════════════════════
// A projekt kétszer vesztette el a hatodik típust (EGYEDI) rövid tábla miatt.
// Itt a hossz NEM feltételezés: összemérjük a `TIPUS_DB`-vel, és minden
// ikonnevet meg is rajzoltatunk — az `ikonSvg` ismeretlen névre DOB.
cim('1. VIZSGÁLAT — hat típus, hat név, hat létező ikon');
sor('típus', 'ikon', 'név');

gat(TIPUS_DB === 6, 'A `TIPUS_DB` NEM 6.', 'kapott: ' + TIPUS_DB);
gat(TIPUS.EGYEDI === TIPUS_DB - 1, 'AZ `EGYEDI` NEM AZ UTOLSÓ TÍPUS.');
gat(EGYSEG_NEV.length === TIPUS_DB && EGYSEG_IKON.length === TIPUS_DB,
  'RÖVID TÍPUS-TÁBLA A PANEL ADATRÉTEGÉBEN.',
  'név ' + EGYSEG_NEV.length + ', ikon ' + EGYSEG_IKON.length + ', kell ' + TIPUS_DB);

for (let t = 0; t < TIPUS_DB; t++) {
  let ikonOk = true;
  try { ikonSvg(EGYSEG_IKON[t], 20); } catch (h) { ikonOk = false; }
  sor(t, EGYSEG_IKON[t] + (ikonOk ? '' : ' ⛔'), EGYSEG_NEV[t]);
  gat(ikonOk, 'A(Z) ' + t + '. TÍPUS IKONJA NEM LÉTEZIK: „' + EGYSEG_IKON[t] + '"',
    'az ismertek: ' + IKON_NEVEK.join(', '));
  gat(!!EGYSEG_NEV[t] && EGYSEG_NEV[t].length > 2,
    'A(Z) ' + t + '. TÍPUSNAK NINCS RENDES NEVE.');
}
gat(EPULET_IKON.length === EPULET_NEV.length,
  'RÖVID ÉPÜLET-IKON TÁBLA.',
  EPULET_IKON.length + ' a(z) ' + EPULET_NEV.length + ' helyett');
let epIkonHiba = 0;
for (let e = 0; e < EPULET_IKON.length; e++) {
  try { ikonSvg(EPULET_IKON[e], 20); } catch (h) { epIkonHiba++; }
}
sor('épület-ikon', EPULET_IKON.length + ' db', epIkonHiba ? epIkonHiba + ' hibás ⛔' : 'mind létezik');
gat(epIkonHiba === 0, 'VAN NEM LÉTEZŐ ÉPÜLET-IKON A TÁBLÁBAN.');
gat(OK_SZOVEG.length === OK_DB && OK_TANACS.length === OK_DB, 'RÖVID OK-TÁBLA.');

// ══════════════════════════════════════════════════════════════════════════
// 2. VIZSGÁLAT — CSUPASZ BÁZIS: MI KÉPEZHETŐ, ÉS MI MIÉRT NEM
// ══════════════════════════════════════════════════════════════════════════
cim('2. VIZSGÁLAT — csupasz bázis (csak központ, tele kassza, nincs nép)');
{
  const s = ujSim();
  gazdag(s);
  const a = kepAdat(s);
  sor('képezhető', a.kepezhetoDb, a.kepezhetoDb === 1 ? '(munkás)' : '⛔');
  sor('tiltott', a.tiltottDb, '');
  for (let o = 1; o < OK_DB; o++) {
    if (a.tiltottOkbol[o]) sor('  ebből: ' + OK_SZOVEG[o], a.tiltottOkbol[o], '');
  }
  sor('képző épület', a.kepzoEpuletDb, '');
  sor('népesség', a.foglalt + ' / ' + a.maxNep, 'sorban ' + a.sorbanNep);

  gat(a.kepezhetoDb === 1 && a.tetelek[TIPUS.MUNKAS].kepezheto,
    'A CSUPASZ KÖZPONT NEM PONT A MUNKÁST KÍNÁLJA.',
    'képezhető: ' + a.kepezhetoDb);
  gat(a.tetelek[TIPUS.EGYEDI].ok === OK.NINCS_CIV,
    'CIV NÉLKÜL NEM „nincs népe" AZ EGYEDI EGYSÉG OKA.',
    'kapott ok: ' + OK_SZOVEG[a.tetelek[TIPUS.EGYEDI].ok]
    + ' — így a játékos laktanyát építene a semmiért');
  gat(a.tiltottOkbol[OK.NINCS_EPULET] === 4,
    'NEM PONT A NÉGY HARCI TÍPUS HIÁNYZIK ÉPÜLET MIATT.',
    'kapott: ' + a.tiltottOkbol[OK.NINCS_EPULET]);
  gat(a.tetelek[TIPUS.MUNKAS].epTipus === EPULET.KOZPONT,
    'A MUNKÁST NEM A KÖZPONTBAN KÉPEZNÉ.');
}

// ══════════════════════════════════════════════════════════════════════════
// 3. VIZSGÁLAT — TELJES BÁZIS + NÉP: MIND A HAT KÉPEZHETŐ
// ══════════════════════════════════════════════════════════════════════════
// ⚠️ A HATODIK (EGYEDI) MIATT VAN EZ AZ EGÉSZ VIZSGÁLAT. Amíg a képzés csak a
// `C` billentyűn ment, az egyedi egységhez SEMMILYEN úton nem lehetett
// hozzáférni. Itt megköveteljük, hogy a panel mind a hatot kínálja, és hogy az
// egyedi egység a CIV SZERINTI épületben képződjön.
cim('3. VIZSGÁLAT — teljes bázis, néppel: mind a hat típus, a helyes épületben');
sor('típus', 'épület', 'ár · idő · nép');
{
  const s = teljesBazis(ujSim(CIV.HEGYI_BANYASZ));
  gazdag(s);
  const a = kepAdat(s);
  for (let t = 0; t < TIPUS_DB; t++) {
    const e = a.tetelek[t];
    sor(t + ' · ' + e.nev, e.epNev || '—',
      arSzoveg(e.ar) + ' · ' + idoSzoveg(e.ido) + ' · ' + e.nep
      + (e.kepezheto ? '' : '   ⛔ ' + OK_SZOVEG[e.ok]));
  }
  sor('képezhető ÖSSZESEN', a.kepezhetoDb + ' / ' + TIPUS_DB,
    a.kepezhetoDb === TIPUS_DB ? '' : '⛔');
  gat(a.kepezhetoDb === TIPUS_DB,
    'NEM MIND A HAT TÍPUS KÉPEZHETŐ TELJES BÁZISON.',
    'képezhető: ' + a.kepezhetoDb + ' — a hatodik (EGYEDI) szokott kiesni');

  // A Hegyi bányászok egyedi egysége a Kőtörő, és azt az OSTROMMŰHELY képzi.
  //
  // ⚠️ A MÁSOLAT NEM ÓVATOSKODÁS. Az adatréteg ÚJRAHASZNÁLT pufferbe ír (ez a
  // panel nulla allokációjának ára), tehát a következő `kepAdat` hívás
  // ÁTÍRJA ezt a tételt. Aki referenciát tart, az a két nép összehasonlításánál
  // ugyanazt a két értéket hasonlítja össze — a szonda első változata pontosan
  // ezen bukott el, és „ugyanaz a név"-et jelentett két különböző népre.
  const egNev = a.tetelek[TIPUS.EGYEDI].nev;
  const egEpTipus = a.tetelek[TIPUS.EGYEDI].epTipus;
  const egEpNev = a.tetelek[TIPUS.EGYEDI].epNev;
  gat(egEpTipus === EPULET.OSTROMMUHELY,
    'AZ EGYEDI EGYSÉGET NEM A CIV SZERINTI ÉPÜLETBEN KÉPEZNÉ.',
    CIV_NEV[CIV.HEGYI_BANYASZ] + ' → várt: ostromműhely, kapott: ' + (egEpNev || '—'));
  gat(egNev === s.egyedi.nev(0) && egNev !== EGYSEG_NEV[TIPUS.EGYEDI],
    'AZ EGYEDI EGYSÉG A NÉP NEVE HELYETT ÁLTALÁNOS NEVET KAPOTT.',
    'kapott: „' + egNev + '", a sim szerint: „' + s.egyedi.nev(0) + '"');

  // Másik nép, MÁS épület — ha a mezőt egyszer beégetnénk, ez fogná meg.
  const s2 = teljesBazis(ujSim(CIV.PUSZTAI_LOVAS));
  gazdag(s2);
  const a2 = kepAdat(s2);
  sor('másik nép egyedije', a2.tetelek[TIPUS.EGYEDI].nev,
    a2.tetelek[TIPUS.EGYEDI].epNev);
  gat(a2.tetelek[TIPUS.EGYEDI].epTipus === EPULET.ISTALLO,
    'A MÁSIK NÉP EGYEDI EGYSÉGE IS UGYANOTT KÉPZŐDNE — a mező be van égetve?',
    'kapott: ' + (a2.tetelek[TIPUS.EGYEDI].epNev || '—'));
  gat(a2.tetelek[TIPUS.EGYEDI].nev !== egNev,
    'KÉT KÜLÖNBÖZŐ NÉP EGYEDI EGYSÉGE UGYANAZT A NEVET KAPTA.',
    'mindkettő: „' + egNev + '"');
}

// ══════════════════════════════════════════════════════════════════════════
// 4. VIZSGÁLAT — A TORONY ÉS A PIAC NEM KÉPEZ (a rövid `KEPEZ` tábla őre)
// ══════════════════════════════════════════════════════════════════════════
// A `KEPEZ` tábla SZÁNDÉKOSAN rövidebb az `EPULET`-nél: a torony és a piac
// nincs is benne. Aki a táblát közvetlenül indexeli, `undefined`-ot kap, és a
// következő `.length` dob — vagy ami rosszabb, néma hamis eredményt ad.
cim('4. VIZSGÁLAT — a rövid KEPEZ-tábla nem borít fel semmit');
{
  const s = ujSim(CIV.FENYHOZO);
  gazdag(s);
  const torony = epit(s, EPULET.TORONY);
  const piac = epit(s, EPULET.PIAC);
  const fal = epit(s, EPULET.FAL);
  sor('lerakva', 'torony ' + torony + ', piac ' + piac + ', fal ' + fal, '');

  let hiba = 0;
  try {
    const a = kepAdat(s);
    // Egyik típus sem választhatja képzőhelynek a tornyot/piacot/falat.
    for (let t = 0; t < TIPUS_DB; t++) {
      const e = a.tetelek[t];
      if (e.epTipus === EPULET.TORONY || e.epTipus === EPULET.PIAC
        || e.epTipus === EPULET.FAL) {
        hiba++;
        console.log('  ⛔ ' + e.nev + ' képzőhelye: ' + e.epNev);
      }
    }
    sor('csak a központ képez', a.kepzoEpuletDb, a.kepzoEpuletDb === 1 ? '' : '⛔');
    gat(a.kepzoEpuletDb === 1, 'A TORONY VAGY A PIAC KÉPZŐ ÉPÜLETNEK SZÁMÍT.',
      'képző épület: ' + a.kepzoEpuletDb + ', pedig csak a központ az');
  } catch (h) {
    hiba++;
    console.log('  ⛔ KIVÉTEL a rövid táblán: ' + h.message);
  }
  gat(hiba === 0, 'A RÖVID `KEPEZ` TÁBLA HIBÁT OKOZOTT A PANEL ADATRÉTEGÉBEN.');

  // ── A PANEL ÉS A SIM EGYEZTETÉSE, MINDEN ÉPÜLET × MINDEN TÍPUS ────────
  // Két állítást hasonlítunk össze ugyanarról a világról: a panel `epuletDb`-je
  // és a sim `kepezheti()`-je. Teljes bázison csináljuk, hogy legyen mit
  // egyeztetni — és a torony/piac/fal is ott áll közte.
  const s3 = teljesBazis(ujSim(CIV.FENYHOZO));
  gazdag(s3);
  epit(s3, EPULET.TORONY); epit(s3, EPULET.PIAC); epit(s3, EPULET.FAL);
  const a3 = kepAdat(s3);
  const ep = s3.epuletek;
  let elteres = 0, parok = 0, igaz = 0;
  for (let t = 0; t < TIPUS_DB; t++) {
    let simDb = 0, simElso = -1;
    for (let i = 0; i < ep.db; i++) {
      if (ep.csapat[i] !== 0 || !ep.kesz(i)) continue;
      parok++;
      if (!s3.kepzes.kepezheti(ep.tipus[i], t, 0)) continue;
      simDb++; igaz++;
      if (simElso < 0) simElso = i;
    }
    const e = a3.tetelek[t];
    // A panelnek UGYANANNYI képzőhelyet kell látnia, és a választott épületnek
    // magának is át kell mennie a sim vizsgáján.
    const ok = e.epuletDb === simDb
      && (simDb === 0 ? e.epulet < 0 : s3.kepzes.kepezheti(e.epTipus, t, 0));
    if (!ok) {
      elteres++;
      console.log('  ⛔ ' + e.nev + ': panel ' + e.epuletDb + ' képzőhely ('
        + (e.epNev || '—') + '), sim ' + simDb + ' (első: '
        + (simElso >= 0 ? EPULET_NEV[ep.tipus[simElso]] : '—') + ')');
    }
  }
  sor('épület×típus pár', parok, igaz + ' képezhető pár');
  sor('panel↔sim eltérés', elteres, elteres ? '⛔' : 'nincs');
  gat(elteres === 0, 'A PANEL ÉS A SIM MÁST MOND UGYANARRÓL AZ ÉPÜLETRŐL.');
  gat(igaz > 0, 'EGYETLEN KÉPEZHETŐ ÉPÜLET×TÍPUS PÁR SINCS — a vizsgálat vak.');
}

// ══════════════════════════════════════════════════════════════════════════
// 5. VIZSGÁLAT — AZ ÁR ÉS AZ IDŐ IGAZAT MOND (a sim méri vissza)
// ══════════════════════════════════════════════════════════════════════════
// A panel számai a `Kepzes.alapAr` + `Civ` úton jönnek. Ha bármelyik elcsúszna
// (például a nem exportált `EGYSEG_IDO` másolata elavulna), a játékos rosszul
// tervezne. Ezért nem a táblát hasonlítjuk a táblához: BEADJUK a parancsot, és
// megnézzük, mennyi ment le a kasszából, és mennyi maradt hátra a sorban.
cim('5. VIZSGÁLAT — az ár és az idő a sim VALÓDI számai');
sor('típus', 'kiírt ár / levont', 'kiírt idő / mért hátra');
{
  let arHiba = 0, idoHiba = 0;
  for (let t = 0; t < TIPUS_DB; t++) {
    const s = teljesBazis(ujSim(CIV.KRISTALYKOVACS));
    gazdag(s);
    const e = kepAdat(s).tetelek[t];
    if (!e.kepezheto) { gat(false, 'AZ 5. VIZSGÁLAT NEM TUDTA KIPRÓBÁLNI: ' + e.nev); continue; }
    const varhatoAr = [e.ar[0], e.ar[1], e.ar[2], e.ar[3]];
    const varhatoIdo = e.ido;
    const ep = e.epulet;
    const elotte = keszlet(s);
    s.parancs(kepzesParancs(0, ep, t, null));
    // A parancs `KESLELTETES` tick múlva hajtódik végre, és UGYANABBAN a
    // tickben a `Kepzes.lep()` már egyet le is számol a hátralévő időből.
    lep(s, KESLELTETES + 1);
    const utana = keszlet(s);
    const levont = [0, 0, 0, 0];
    let arOk = true;
    for (let f = 0; f < 4; f++) {
      levont[f] = elotte[f] - utana[f];
      if (levont[f] !== varhatoAr[f]) arOk = false;
    }
    const hatra = s.kepzes.hatra[ep];
    const idoOk = hatra === varhatoIdo - 1 || hatra === varhatoIdo;
    sor(e.nev, varhatoAr.join('/') + '  ' + levont.join('/') + (arOk ? '' : ' ⛔'),
      varhatoIdo + ' / ' + hatra + (idoOk ? '' : ' ⛔'));
    if (!arOk) arHiba++;
    if (!idoOk) idoHiba++;
    gat(s.kepzes.sorDb[ep] === 1, 'A PARANCS NEM ÁLLT SORBA: ' + e.nev,
      'sorDb: ' + s.kepzes.sorDb[ep] + ' — a parancs alakja lehet rossz');
  }
  gat(arHiba === 0, 'A PANEL MÁS ÁRAT ÍR KI, MINT AMIT A SIM LEVON.', arHiba + ' típusnál');
  gat(idoHiba === 0, 'A PANEL MÁS IDŐT ÍR KI, MINT AMENNYI A KÉPZÉS.', idoHiba + ' típusnál');
}

// ══════════════════════════════════════════════════════════════════════════
// 6. VIZSGÁLAT — AMIT A PANEL ENGED, ABBÓL SZÜLETIK EGYSÉG (működés-gát)
// ══════════════════════════════════════════════════════════════════════════
// EZ AZ A SZÁM, AMI ELÁRULJA, HOGY A RÉTEG CSINÁL IS VALAMIT. Nem elég, hogy a
// gomb aktív: a parancs végigmegy a soron, elkészül, és MEGSZÜLETIK az az
// egység — típusonként külön számolva, mert egy elrontott parancs-mező csendben
// munkást gyártana mindenből.
cim('6. VIZSGÁLAT — a képezhető gombokból VALÓDI egység lesz');
sor('típus', 'kész egység', 'tick');
const szuletett = new Array(TIPUS_DB).fill(0);
{
  for (let t = 0; t < TIPUS_DB; t++) {
    const s = teljesBazis(ujSim(CIV.HEGYI_BANYASZ));
    gazdag(s);
    const e = kepAdat(s).tetelek[t];
    if (!e.kepezheto) { gat(false, 'A 6. VIZSGÁLAT NEM TUDTA KIPRÓBÁLNI: ' + e.nev); continue; }
    const elotte = egysegDb(s, 0, t);
    const keszultElotte = s.kepzes.keszult[0];
    s.parancs(kepzesParancs(0, e.epulet, t, null));
    const kell = e.ido + KESLELTETES + 40;
    lep(s, kell);
    const utana = egysegDb(s, 0, t);
    szuletett[t] = utana - elotte;
    const keszultDelta = s.kepzes.keszult[0] - keszultElotte;
    sor(e.nev, szuletett[t] + ' db' + (szuletett[t] === 1 ? '' : ' ⛔'), kell);
    gat(szuletett[t] === 1,
      'A KÉPEZHETŐNEK JELÖLT „' + e.nev + '" NEM SZÜLETETT MEG.',
      'típusonkénti darabszám-változás: ' + szuletett[t]
      + ', a sim „kész" számlálója: ' + keszultDelta
      + ' — ha a számláló nőtt, de a típus nem, a parancs MÁS típust képzett');
    if (t === TIPUS.EGYEDI) {
      const ke = s.egyedi.keszult[0];
      sor('  egyedi-számláló', ke, s.egyedi.elutasitva[0] + ' elutasítva');
      gat(ke === 1, 'AZ EGYEDI EGYSÉG SAJÁT SZÁMLÁLÓJA NEM NŐTT.',
        'kész: ' + ke + ', elutasítva: ' + s.egyedi.elutasitva[0]);
    }
  }
  const osszes = szuletett.reduce((a, b) => a + b, 0);
  sor('ÖSSZESEN megszületett', osszes + ' / ' + TIPUS_DB, osszes === TIPUS_DB ? '' : '⛔');
}

// ══════════════════════════════════════════════════════════════════════════
// 7. VIZSGÁLAT — AMIT A PANEL TILT, AZ TÉNYLEG NEM MEGY (hazugság-gát)
// ══════════════════════════════════════════════════════════════════════════
// Minden tiltási okra külön állás, és mindegyikben BEADJUK a parancsot. Ha
// bármelyikből egység vagy sor lesz, a panel FÖLÖSLEGESEN tilt — a játékostól
// veszünk el egységeket. Ha viszont a tiltás oka rossz, a magyarázat hazudik.
cim('7. VIZSGÁLAT — a tiltott gombok mögött tényleg nincs semmi');
sor('állás', 'ok', 'parancs után');

/** Egy tiltott állás kipróbálása. */
function tiltasProba(nev, s, t, vartOk) {
  const a = kepAdat(s);
  const e = a.tetelek[t];
  // A tiltott tételnek nincs feltétlenül épülete — ilyenkor a KÉZI úton
  // keressük meg a legvalószínűbb célt, hogy a parancs tényleg elmenjen.
  let ep = e.epulet;
  if (ep < 0) {
    for (let i = 0; i < s.epuletek.db; i++) {
      if (s.epuletek.csapat[i] === 0 && s.epuletek.kesz(i)) { ep = i; break; }
    }
  }
  const sorElotte = s.kepzes.sorbanNepesseg(0);
  const dbElotte = egysegDb(s, 0, t);
  const kElotte = keszlet(s);
  s.parancs(kepzesParancs(0, ep, t, null));
  lep(s, 400);
  const dbUtana = egysegDb(s, 0, t);
  const sorUtana = s.kepzes.sorbanNepesseg(0);
  let koltott = false;
  for (let f = 0; f < 4; f++) if (keszlet(s)[f] !== kElotte[f]) koltott = true;
  const semmi = dbUtana === dbElotte && sorUtana === sorElotte && !koltott;
  sor(nev, OK_SZOVEG[e.ok] + (e.ok === vartOk ? '' : ' ⛔'),
    semmi ? 'nem történt semmi' : '⛔ TÖRTÉNT VALAMI (egység ' + (dbUtana - dbElotte)
      + ', sor ' + (sorUtana - sorElotte) + (koltott ? ', költött' : '') + ')');
  gat(e.ok === vartOk, 'ROSSZ INDOKKAL TILT: ' + nev,
    'várt: ' + OK_SZOVEG[vartOk] + ', kapott: ' + OK_SZOVEG[e.ok]);
  gat(semmi, 'A TILTOTT PARANCS MÉGIS TÖRTÉNT VALAMIT: ' + nev);
  return semmi && e.ok === vartOk;
}

{
  // a) nincs képző épület
  {
    const s = ujSim(); gazdag(s);
    tiltasProba('nincs íjászda', s, TIPUS.IJASZ, OK.NINCS_EPULET);
  }
  // b) nincs nyersanyag
  {
    const s = teljesBazis(ujSim(CIV.ERDEI_VADASZ));
    for (let f = 0; f < 4; f++) s.gazdasag.keszlet[f] = 0;
    const a = kepAdat(s);
    const e = a.tetelek[TIPUS.LOVAG];
    sor('  hiányzó nyersanyag', e.hianyzo.join(' / '), 'ár: ' + e.ar.join(' / '));
    gat(e.hianyzo[0] === e.ar[0] && e.hianyzo[3] === e.ar[3],
      'ÜRES KASSZÁNÁL NEM A TELJES ÁR HIÁNYZIK.');
    tiltasProba('üres kassza', s, TIPUS.LOVAG, OK.NYERSANYAG);
  }
  // c) tele népesség
  {
    const s = teljesBazis(ujSim(CIV.SIVATAGI_PORTYAZO));
    gazdag(s);
    const k = kozpont(s);
    const nep = s.gazdasag.nepessegAllapot(0);
    for (let i = 0; i < nep.max; i++) {
      s.egysegKepez(k.x + 8 + (i % 6), k.y + 8 + ((i / 6) | 0), TIPUS.LANDZSAS, 0);
    }
    const a = kepAdat(s);
    sor('  népesség', a.foglalt + ' / ' + a.maxNep, 'szabad: ' + a.szabadNep);
    gat(a.nepTele, 'A PANEL NEM VESZI ÉSZRE A TELE NÉPESSÉGET.');
    tiltasProba('tele népesség', s, TIPUS.LANDZSAS, OK.NEPESSEG);
  }
  // d) tele sor
  {
    const s = teljesBazis(ujSim(CIV.BASTYAORZO));
    gazdag(s);
    // Házakkal biztosítjuk, hogy NE a népesség fogyjon el előbb.
    for (let h = 0; h < 12; h++) epit(s, EPULET.HAZ);
    const e0 = kepAdat(s).tetelek[TIPUS.LANDZSAS];
    for (let k = 0; k < SOR_HOSSZ; k++) {
      s.parancs(kepzesParancs(0, e0.epulet, TIPUS.LANDZSAS, null));
      lep(s, KESLELTETES + 1);
    }
    const a = kepAdat(s);
    sor('  sor hossza', s.kepzes.sorDb[e0.epulet] + ' / ' + SOR_HOSSZ,
      'panel: ' + OK_SZOVEG[a.tetelek[TIPUS.LANDZSAS].ok]);
    gat(s.kepzes.sorDb[e0.epulet] === SOR_HOSSZ,
      'NEM SIKERÜLT TELETÖLTENI A SORT.', 'db: ' + s.kepzes.sorDb[e0.epulet]);
    gat(a.tetelek[TIPUS.LANDZSAS].ok === OK.SOR_TELE,
      'A TELE SORT NEM ISMERI FEL A PANEL.',
      'kapott: ' + OK_SZOVEG[a.tetelek[TIPUS.LANDZSAS].ok]);
    // A haladás-csík is ekkor a legbeszédesebb: legyen 0..100 közötti szám.
    const s0 = a.sorok[0];
    sor('  haladás-csík', s0.szazalek + ' %', s0.epNev + ' — ' + s0.elsoNev
      + ', hátra ' + idoSzoveg(s0.hatra));
    gat(a.sorDb > 0 && s0.szazalek >= 0 && s0.szazalek <= 100,
      'A HALADÁS-CSÍK ÉRTÉKE ÉRTELMETLEN.', 'százalék: ' + s0.szazalek);
    gat(s0.db === SOR_HOSSZ && s0.elsoTipus === TIPUS.LANDZSAS,
      'A SOR TARTALMA NEM EGYEZIK A SIMÉVEL.');
  }
  // e) egyedi egység nép nélkül — a sim SAJÁT elutasítás-számlálója a tanú
  {
    const s = teljesBazis(ujSim());   // nincs civ
    gazdag(s);
    const elotte = s.egyedi.elutasitva[0];
    const ok = tiltasProba('egyedi, nép nélkül', s, TIPUS.EGYEDI, OK.NINCS_CIV);
    const utana = s.egyedi.elutasitva[0];
    sor('  sim elutasítás-számláló', elotte + ' → ' + utana,
      utana > elotte ? 'a sim is elutasította' : '⛔');
    gat(utana > elotte,
      'A SIM NEM IS LÁTTA AZ EGYEDI-PARANCSOT — a szonda vakon állít.',
      'ha a számláló nem nő, a parancs el sem jutott a képzésig');
    if (!ok) gat(false, 'AZ EGYEDI TILTÁSA NEM ÁLLTA MEG A HELYÉT.');
  }
}

// ══════════════════════════════════════════════════════════════════════════
// 8. VIZSGÁLAT — SZABOTÁZS: VAN-E FOGA A SZONDÁNAK
// ══════════════════════════════════════════════════════════════════════════
// Eljátsszuk a projekt két valódi hibáját, és MEGKÖVETELJÜK, hogy a fenti
// vizsgálatok elbukjanak rájuk. Ha egy szabotált futás is átmenne, a zöld kapu
// semmit nem érne — akkor inkább EZ a szonda bukjon.
cim('8. VIZSGÁLAT — szabotázs: a fenti gátaknak meg kell fogniuk');
sor('szabotázs', 'mit vártunk', 'eredmény');

{
  // (a) A HATODIK TÍPUS NÉMÁN KIESIK — a projekt kétszer megélt hibája.
  const s = teljesBazis(ujSim(CIV.FENYHOZO));
  gazdag(s);
  const eredeti = s.kepzes.kepezheti.bind(s.kepzes);
  s.kepzes.kepezheti = (epT, egyT, cs) => (egyT === TIPUS.EGYEDI ? false : eredeti(epT, egyT, cs));
  const a = kepAdat(s);
  const megfogta = a.kepezhetoDb === TIPUS_DB - 1
    && a.tetelek[TIPUS.EGYEDI].ok === OK.NINCS_EPULET;
  sor('(a) kiesik az EGYEDI', 'képezhető 5, nem 6',
    'képezhető: ' + a.kepezhetoDb + (megfogta ? ' ✔' : ' ⛔'));
  gat(megfogta, 'A SZABOTÁZS NEM LÁTSZIK A SZÁMOKON — a 3. vizsgálat vak.',
    'képezhető: ' + a.kepezhetoDb + ' (a szabotázs után 5-nek kellene lennie)');
  s.kepzes.kepezheti = eredeti;

  // (b) A PANEL MINDENT KÉPEZHETŐNEK HAZUDIK. A 7. vizsgálat logikáját
  //     futtatjuk rá: ha a „képezhető" állítás után SEM történik semmi, az
  //     hazugság — és ezt észre kell vennünk.
  const s2 = ujSim();          // csupasz bázis: csak munkás menne
  gazdag(s2);
  const a2 = kepAdat(s2);
  for (let t = 0; t < TIPUS_DB; t++) { a2.tetelek[t].kepezheto = true; a2.tetelek[t].ok = OK.KEPEZHETO; }
  // Az „optimista panel" szerint az íjász is képezhető. Adjuk be a parancsot.
  let ep = -1;
  for (let i = 0; i < s2.epuletek.db; i++) {
    if (s2.epuletek.csapat[i] === 0 && s2.epuletek.kesz(i)) { ep = i; break; }
  }
  const elotte = egysegDb(s2, 0, TIPUS.IJASZ);
  s2.parancs(kepzesParancs(0, ep, TIPUS.IJASZ, null));
  lep(s2, 400);
  const lett = egysegDb(s2, 0, TIPUS.IJASZ) - elotte;
  sor('(b) „minden képezhető"', 'a valóságban 0 íjász',
    lett + ' íjász' + (lett === 0 ? ' ✔' : ' ⛔'));
  gat(lett === 0,
    'A HAZUG ÁLLÍTÁS UTÁN MÉGIS SZÜLETETT EGYSÉG — akkor a 7. vizsgálat sem mér.',
    'ez azt jelentené, hogy a központ íjászt képez');

  // (c) RÖVID PUFFER: öt tételre való puffert adunk. A hatodik NEM veszhet el
  //     némán — dobnia kell.
  const rossz = ujKepzesAllapot();
  rossz.tetelek.length = TIPUS_DB - 1;
  let dobott = false;
  try { kepzesAdat(s2, 0, rossz); } catch (h) { dobott = true; }
  sor('(c) öt tételes puffer', 'kivételt kell dobnia', dobott ? 'dobott ✔' : 'ELNYELTE ⛔');
  gat(dobott, 'A RÖVID PUFFER NÉMÁN ÁTMENT — pont ez a hiba esett meg kétszer.');
}

// ══════════════════════════════════════════════════════════════════════════
// 9. VIZSGÁLAT — A SZÖVEGEK ÉS AZ ÚJRAHASZNÁLT PUFFER
// ══════════════════════════════════════════════════════════════════════════
// A panel `frissit()`-je 60-144 Hz-en fut, és a szerződés szerint NEM allokál.
// Ezért az adatréteg ugyanabba a pufferbe ír. Itt azt nézzük, hogy tényleg
// ugyanaz az objektum jön vissza (nem épül újra semmi), és hogy a kiírt
// szövegekben nincs `undefined`/`NaN` — az a fajta szemét, ami a képernyőn
// jelenik meg először, nem a naplóban.
cim('9. VIZSGÁLAT — szöveg-higiénia és puffer-újrahasznosítás');
{
  const s = teljesBazis(ujSim(CIV.FOLYAMI_KERESKEDO));
  gazdag(s);
  const a1 = kepAdat(s);
  const t0 = a1.tetelek[0];
  const sor0 = a1.sorok[0];
  for (let k = 0; k < 200; k++) kepAdat(s);
  const a2 = kepAdat(s);
  sor('ugyanaz a puffer', a1 === a2 && a2.tetelek[0] === t0 && a2.sorok[0] === sor0
    ? 'igen' : 'NEM ⛔', '200 hívás után');
  gat(a1 === a2 && a2.tetelek[0] === t0 && a2.sorok[0] === sor0,
    'AZ ADATRÉTEG ÚJ OBJEKTUMOKAT GYÁRT HÍVÁSONKÉNT.',
    'a panel `frissit()`-je nulla allokációt ígér');

  const SZEMET = [/undefined/i, /\bNaN\b/, /\bnull\b/i, /\[object/, /\bTIPUS\b/, /\bEPULET\b/];
  let szemetes = 0, vizsgalt = 0;
  const nezd = (sz, hol) => {
    vizsgalt++;
    for (let i = 0; i < SZEMET.length; i++) {
      if (SZEMET[i].test(sz)) { szemetes++; console.log('  ⛔ ' + hol + ': „' + sz + '"'); return; }
    }
  };
  for (let t = 0; t < TIPUS_DB; t++) {
    const e = a2.tetelek[t];
    nezd(e.nev, 'név');
    nezd(arSzoveg(e.ar), 'ár');
    nezd(idoSzoveg(e.ido), 'idő');
    nezd(OK_SZOVEG[e.ok] + ' ' + OK_TANACS[e.ok], 'ok');
    nezd(egysegNev(s, 0, t), 'egysegNev');
    if (e.epNev) nezd(e.epNev, 'épület');
  }
  for (let k = 0; k < a2.sorDb; k++) nezd(a2.sorok[k].epNev + ' ' + a2.sorok[k].elsoNev, 'sor');
  sor('vizsgált szöveg', vizsgalt, szemetes ? szemetes + ' szemetes ⛔' : 'tiszta');
  gat(szemetes === 0, 'SZEMÉT KERÜLT A KIÍRT SZÖVEGBE.');

  // A sor-törlés KÉPESSÉG-FELISMERÉSSEL megy: ma a sim nem tudja, tehát a
  // panel nem is rajzol törlés-gombot. Ha egyszer megtanulja, ez a sor jelzi.
  sor('sor-törlés a simben', a2.torlesTamogatott ? 'VAN' : 'nincs',
    a2.torlesTamogatott ? 'a panel kirakja a ✕ gombot' : 'a panel zárt jelzést mutat');
}

// ══════════════════════════════════════════════════════════════════════════
// 10. VIZSGÁLAT — MAGA A PANEL: FELÉPÜL-E, ÉS KÉPEZ-E EGY KATTINTÁSRA
// ══════════════════════════════════════════════════════════════════════════
// Eddig az ADATRÉTEGET mértük. De a tulajdonos nem az adatrétegre kattint,
// hanem egy gombra — és a projekt legdrágább tanulsága pont az, hogy a zöld
// kapu nem működés-kapu. Ezért itt a VALÓDI `PanelKepzes` épül fel egy
// papírmasé DOM-on, és egy szimulált kattintás megy végig az egész úton:
// gomb → `sim.parancs` → képzés → megszületett egység.
//
// ⚠️ MIÉRT KELL A FORRÁST ÁTÍRNI: a panel `import './panel_kepzes.css'`-t
// tartalmaz, amit a node nem tud betölteni (a Vite fordítja bele a `dist`-be).
// Ezért a forrást beolvassuk, a CSS-sort kivesszük, a relatív importokat
// abszolút `file://`-ra írjuk, és `data:` modulként importáljuk. Ez nem
// szépészeti megoldás — de a másik lehetőség az volna, hogy a panel DOM-kódját
// SEMMI nem futtatja a kapuk között, és pont az a fajta rés, amiben ez a
// projekt már hatszor elveszett egy „kész" funkciót.
cim('10. VIZSGÁLAT — a VALÓDI panel felépül, és a kattintás egységet képez');
{
  const { readFile } = await import('node:fs/promises');
  const forras = await readFile(join(GYOKER, 'src', 'ui', 'panel_kepzes.js'), 'utf8');
  const alap = pathToFileURL(join(GYOKER, 'src', 'ui', 'x.js'));
  const atirt = forras
    .replace(/^\s*import\s+['"][^'"]+\.css['"];?\s*$/m, '')
    .replace(/from\s+['"](\.[^'"]+)['"]/g, (m, p) => "from '" + new URL(p, alap).href + "'");

  // ── PAPÍRMASÉ DOM ────────────────────────────────────────────────────
  // Csak annyi, amennyit a panel tényleg használ. Ha a panel egyszer többet
  // kérne, ez a shim AZONNAL dob — ami jobb, mint ha csendben elnyelné.
  const ujElem = (tag) => {
    const el = {
      tag, gyerekek: [], parentNode: null, _osztalyok: new Set(),
      dataset: {}, style: {}, _figyelok: new Map(),
      textContent: '', title: '', type: '', disabled: false,
      set className(v) { el._osztalyok = new Set(String(v).split(/\s+/).filter(Boolean)); },
      get className() { return [...el._osztalyok].join(' '); },
      set innerHTML(v) {
        el._html = v;
        // A `<b></b>` tényleg gyerek lesz: a panel `querySelector('b')`-vel
        // keresi meg a népesség-mezőt, és ha itt `null`-t kapna, a vizsgálat
        // némán kihagyná a HUD legfontosabb számát.
        if (/<b\b/.test(v)) { const b = ujElem('b'); b.parentNode = el; el.gyerekek.push(b); }
      },
      get innerHTML() { return el._html || ''; },
      classList: {
        add: (n) => el._osztalyok.add(n),
        remove: (n) => el._osztalyok.delete(n),
        contains: (n) => el._osztalyok.has(n),
        toggle: (n, be) => { if (be) el._osztalyok.add(n); else el._osztalyok.delete(n); },
      },
      appendChild: (gy) => { gy.parentNode = el; el.gyerekek.push(gy); return gy; },
      querySelector: (sel) => {
        const keres = (cs) => {
          for (let i = 0; i < cs.gyerekek.length; i++) {
            if (cs.gyerekek[i].tag === sel) return cs.gyerekek[i];
            const m = keres(cs.gyerekek[i]);
            if (m) return m;
          }
          return null;
        };
        return keres(el);
      },
      addEventListener: (n, f) => {
        if (!el._figyelok.has(n)) el._figyelok.set(n, []);
        el._figyelok.get(n).push(f);
      },
      removeEventListener: (n, f) => {
        const l = el._figyelok.get(n);
        if (l) el._figyelok.set(n, l.filter((x) => x !== f));
      },
      kuld: (n, ev) => { const l = el._figyelok.get(n) || []; for (const f of l) f(ev); },
    };
    return el;
  };
  globalThis.document = { createElement: ujElem };

  const { PanelKepzes, PANEL } = await import('data:text/javascript;charset=utf-8,'
    + encodeURIComponent(atirt));

  sor('panel-szerződés', PANEL.nev + ' / ' + PANEL.hely, '„' + PANEL.cim + '"');
  gat(PANEL.nev === 'kepzes' && PANEL.hely === 'also_kozep' && !!PANEL.cim,
    'A PANEL NEM A SZERZŐDÉS SZERINTI HELYRE KÉRI MAGÁT.',
    JSON.stringify(PANEL));

  const s = teljesBazis(ujSim(CIV.HEGYI_BANYASZ));
  gazdag(s);
  const gyoker = ujElem('div');
  const uzenetek = [];
  const p = new PanelKepzes(gyoker, s, null, {
    sajatCsapat: 0, uzenet: (sz, f) => uzenetek.push(f + ': ' + sz),
  });
  p.frissit(s, 1000);

  // A gombok megkeresése a papírmasé fában — pont úgy, ahogy a játékos látja.
  const gombok = [];
  const bejar = (el) => {
    if (el.tag === 'button' && el.dataset.tipus !== undefined) gombok[el.dataset.tipus | 0] = el;
    for (let i = 0; i < el.gyerekek.length; i++) bejar(el.gyerekek[i]);
  };
  bejar(gyoker);
  sor('gomb a képernyőn', gombok.filter(Boolean).length + ' / ' + TIPUS_DB,
    gombok.filter(Boolean).length === TIPUS_DB ? '' : '⛔');
  gat(gombok.filter(Boolean).length === TIPUS_DB,
    'NEM MIND A HAT EGYSÉGTÍPUSNAK VAN GOMBJA A PANELEN.',
    'ez a hatodik (EGYEDI) szokásos eltűnése — most a DOM-ban');

  const a = kepAdat(s);
  let allapotHiba = 0;
  for (let t = 0; t < TIPUS_DB; t++) {
    const g = gombok[t];
    const varhato = !a.tetelek[t].kepezheto;
    if (!g || g.disabled !== varhato) allapotHiba++;
  }
  sor('gomb-állapot', allapotHiba ? allapotHiba + ' eltérés ⛔' : 'egyezik az adattal', '');
  gat(allapotHiba === 0, 'A GOMB TILTOTTSÁGA NEM EGYEZIK AZ ADATRÉTEGGEL.');

  // ── A KATTINTÁS: EGYEDI EGYSÉG, VÉGIG ────────────────────────────────
  const eGomb = gombok[TIPUS.EGYEDI];
  const elotte = egysegDb(s, 0, TIPUS.EGYEDI);
  const racs = eGomb.parentNode;
  racs.kuld('click', { target: eGomb, shiftKey: false });
  lep(s, 600);
  const lett = egysegDb(s, 0, TIPUS.EGYEDI) - elotte;
  sor('kattintás → egyedi egység', lett + ' db' + (lett === 1 ? '' : ' ⛔'),
    uzenetek[uzenetek.length - 1] || '(nincs üzenet)');
  gat(lett === 1,
    'A PANELRŐL KATTINTVA NEM SZÜLETETT MEG AZ EGYEDI EGYSÉG.',
    'ez a teljes út: gomb → sim.parancs → Kepzes.sorba → egység. '
    + 'Kapott üzenetek: ' + JSON.stringify(uzenetek));
  gat(uzenetek.length > 0, 'A PANEL NEM ADOTT VISSZAJELZÉST A KATTINTÁSRA.');

  // ── SHIFT+KATTINTÁS: KÖTEG ───────────────────────────────────────────
  // A köteg nem díszlet: ötször kattintani egy lándzsásért az a fajta
  // súrlódás, amitől a játék „nyűgös"-nek érződik. Azt viszont követeljük meg,
  // hogy a sorba TÉNYLEG öt kerüljön — se több (elutasított parancsok), se
  // kevesebb (néma elveszés).
  const lGomb = gombok[TIPUS.LANDZSAS];
  const lEp = kepAdat(s).tetelek[TIPUS.LANDZSAS].epulet;
  const sorElotte = s.kepzes.sorDb[lEp];
  lGomb.parentNode.kuld('click', { target: lGomb, shiftKey: true });
  lep(s, KESLELTETES + 1);
  const kotegDb = s.kepzes.sorDb[lEp] - sorElotte;
  sor('shift+kattintás', kotegDb + ' állt sorba' + (kotegDb === 5 ? '' : ' ⛔'),
    'laktanya sora: ' + s.kepzes.sorDb[lEp] + ' / ' + SOR_HOSSZ);
  gat(kotegDb === 5, 'A SHIFT+KATTINTÁS NEM ÖT EGYSÉGET ÁLLÍT SORBA.',
    'kapott: ' + kotegDb);

  // ── ÉS A TILTOTT GOMB? ───────────────────────────────────────────────
  const s2 = ujSim();     // csupasz bázis: nincs íjászda
  gazdag(s2);
  const gyoker2 = ujElem('div');
  const uzenet2 = [];
  const p2 = new PanelKepzes(gyoker2, s2, null, {
    sajatCsapat: 0, uzenet: (sz, f) => uzenet2.push(f + ': ' + sz),
  });
  p2.frissit(s2, 1000);
  const gombok2 = [];
  const bejar2 = (el) => {
    if (el.tag === 'button' && el.dataset.tipus !== undefined) gombok2[el.dataset.tipus | 0] = el;
    for (let i = 0; i < el.gyerekek.length; i++) bejar2(el.gyerekek[i]);
  };
  bejar2(gyoker2);
  const ijaszElotte = egysegDb(s2, 0, TIPUS.IJASZ);
  gombok2[TIPUS.IJASZ].parentNode.kuld('click', { target: gombok2[TIPUS.IJASZ], shiftKey: false });
  lep(s2, 400);
  const ijaszLett = egysegDb(s2, 0, TIPUS.IJASZ) - ijaszElotte;
  sor('tiltott gombra kattintva', ijaszLett + ' íjász' + (ijaszLett === 0 ? '' : ' ⛔'),
    uzenet2[0] || '(néma ⛔)');
  gat(ijaszLett === 0, 'A TILTOTT GOMB MÉGIS KÉPZETT.');
  gat(uzenet2.length > 0 && /figyelem/.test(uzenet2[0]),
    'A TILTOTT GOMB NÉMÁN NYELTE EL A KATTINTÁST — a játékos nem tudja meg, miért.',
    JSON.stringify(uzenet2));

  // A bontás nem hagyhat maga után figyelőt: a meccs végén a váz ezt hívja.
  p.bont(); p2.bont();
  let maradt = 0;
  const szamol = (el) => {
    for (const [, l] of el._figyelok) maradt += l.length;
    for (let i = 0; i < el.gyerekek.length; i++) szamol(el.gyerekek[i]);
  };
  szamol(gyoker); szamol(gyoker2);
  sor('bont() után figyelő', maradt, maradt === 0 ? '' : '⛔');
  gat(maradt === 0, 'A `bont()` OTTHAGYOTT ESEMÉNYKEZELŐKET.', 'maradt: ' + maradt);

  delete globalThis.document;
}

// ══════════════════════════════════════════════════════════════════════════
// ÖSSZEGZÉS
// ══════════════════════════════════════════════════════════════════════════
cim('ÖSSZEGZÉS');
{
  const s = teljesBazis(ujSim(CIV.HEGYI_BANYASZ));
  gazdag(s, 0, 400);
  const a = kepAdat(s);
  sor('képezhető most', a.kepezhetoDb + ' / ' + TIPUS_DB, '400 nyersanyaggal');
  for (let o = 1; o < OK_DB; o++) {
    if (a.tiltottOkbol[o]) sor('  tiltva — ' + OK_SZOVEG[o], a.tiltottOkbol[o], '');
  }
  sor('megszületett a 6. vizsgálatban', szuletett.reduce((x, y) => x + y, 0) + ' / ' + TIPUS_DB, '');
}

console.log('\n' + '═'.repeat(78));
if (bukas === 0) {
  console.log('  ✅ A KÉPZÉS-PANEL ADATRÉTEGE ÁTMENT MIND A TÍZ VIZSGÁLATON.');
  console.log('     Mind a hat típus képezhető a megfelelő épületben, a tiltások');
  console.log('     indoka a sim sorrendjét követi, és a szabotázsokat megfogtuk.');
} else {
  console.log('  ⛔ ' + bukas + ' BUKÁS. A képzés-panel a fentiek szerint hazudik vagy halott.');
}
console.log('═'.repeat(78) + '\n');
process.exit(bukas === 0 ? 0 : 1);
