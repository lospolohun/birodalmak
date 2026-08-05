// AGE OF THE CRYSTALS — ÉPÍTÉS-PANEL SZONDA (v0.16).
//
// ── MIÉRT VAN EZ EGYÁLTALÁN ───────────────────────────────────────────────
// Az építés-panelt SEMMILYEN meglévő kapu nem őrzi. A determinizmus-szonda a
// hash-eket nézi, és a hash bitre ugyanaz marad attól, hogy a panel 90 fát kér
// egy 250 fás épületért, vagy hogy mind a tizenegy gomb tiltott. Az FPS-szonda
// a felhőben meg sem szólal (nincs GPU). A UI-réteg tehát pont abba a résbe
// esne, ahol ez a projekt már hatszor megégett: ZÖLD KAPU EGY HALOTT RENDSZER
// MELLETT.
//
// ── MI AZ A SZÁM, AMI ELÁRULJA, HOGY CSINÁL IS VALAMIT ────────────────────
// Nem az, hogy „lefut". Kilenc gát van, és mindegyik egy KONKRÉT hibát fog meg:
//
//   1. TIZENEGY. Minden `EPULET`-indexelt tábla pontosan 11 hosszú, a sorrend
//      PERMUTÁCIÓ, és minden ikonnév létezik. Egy 10 elemű tábla `undefined`-ot
//      ad a 11. helyen → NaN ár → NÉMÁN ELTŰNŐ GOMB. Ebből már négy volt.
//   2. TÜKÖR-EGYEZÉS. Az `EP_IDO` és a `LERAKO` nincs exportálva a simből, a
//      panelnek viszont kell — ezért másolat van róla. A szonda BEOLVASSA a sim
//      forrását, és összeveti. Aki a simben átírja az építési időt, itt kap
//      piros kaput, nem egy hazug gombfeliratot.
//   3. SZÁMOK. Hány épület építhető adott nyersanyagnál, és hány tiltott,
//      MELYIK INDOKKAL. Ez a működés-szám: ha minden helyzetben ugyanannyi jön
//      ki, a réteg nem számol, csak visszhangzik.
//   4. GÁT-ELSÜTÉS SZABOTÁZZSAL. Mind az öt tiltás-ok ELSÜL legalább egyszer,
//      ÉS a feltétel kikapcsolásával a szám MEGVÁLTOZIK. Egy gát, ami mindig
//      igaz vagy mindig hamis, nem gát — csak dekoráció.
//   5. RANGSOR. Ha több tiltás is igaz, a MARADANDÓBBAT mondjuk. „Nincs elég
//      fa" felirat alatt a játékos vár; „kell hozzá a hajnal kora" alatt tesz
//      valamit.
//   6. ⚠️ A SIM EGYETÉRT. A legfontosabb gát: a panel árát és cella-számítását
//      VALÓDI `sim.parancs()`-csal ellenőrizzük. Pontosan annyi nyersanyaggal,
//      amennyit a panel ír, az épület FELÉPÜL, a készlet NULLÁRA fogy, és
//      ODA kerül, ahova az előnézet mutatta. Eggyel kevesebbel SEMMI nem
//      történik. Ez fogja meg azt, ha a civ-kedvezmény, a kerekítés vagy a
//      bal-felső cella számítása szétcsúszik a `parancsok.js`-től.
//   7. FELIRAT. Egyetlen mondatban sincs `undefined`, `NaN`, `null` vagy nyers
//      konstansnév, az indokok KÜLÖNBÖZNEK, és a nyersanyag-hiány SZÁMOT mond.
//   8. VALÓDI PÁLYA. A lerakhatóság a tényleges terepen: hány cella fogad be
//      egy 3×3-as épületet, és a járhatatlanon tényleg elsül-e a `NINCS_HELY`.
//   9. SZERZŐDÉS. A panel FORRÁSÁN: van-e `PANEL` export, ismert-e a helye,
//      ír-e sim-állapotot (a v0.8 lockstepjén ez desync lenne), `aoc-epites-`
//      előtagú-e minden osztályneve, van-e mindhez CSS, és nincs-e globális
//      szabály a stíluslapján. Tizenhat agent ír egy munkafába.
//
// HASZNÁLAT:  npm run p:epites     (node tools/panel_epites_szonda.mjs)
// Kilépési kód: 0 = rendben, 1 = bukás.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const GYOKER = dirname(dirname(fileURLToPath(import.meta.url)));
const be = (...r) => import(pathToFileURL(join(GYOKER, ...r)).href);

const { Sim, KESLELTETES } = await be('src', 'sim', 'sim.js');
const { EPULET, EPULET_NEV, EP_AR, EP_MERET } = await be('src', 'sim', 'epuletek.js');
const { KORSZAK, KORSZAK_NEV } = await be('src', 'sim', 'gazdasag.js');
const { NYERS_NEV } = await be('src', 'sim', 'eroforras.js');
const { TIPUS } = await be('src', 'sim', 'units.js');
const { IKON_NEVEK } = await be('src', 'ui', 'ikonok.js');
const A = await be('src', 'ui', 'panel_epites_adat.js');

const {
  EPULET_DB, INDOK, INDOK_DB, INDOK_NEV, EP_SORREND, EP_IKON, EP_LEIRAS,
  EP_IDO_TUKOR, EP_LERAKO_TUKOR, EP_KORSZAK, EP_KORSZAK_JAVASLAT,
  epitesLista, lerakasAllapot, ujLerakas, balFelso, epitParancs,
  arSzoveg, idoSzoveg, indokSzoveg, lerakasSzoveg, elemTipusbol, munkasSzam,
} = A;

let bukas = 0;
const sor = (a, b, c) => console.log('  ' + String(a).padEnd(26) + String(b).padEnd(24) + (c ?? ''));
const cim = (t) => console.log('\n' + t + '\n' + '─'.repeat(78));
const gat = (all, szoveg, reszlet) => {
  if (all) return true;
  console.log('\n  ⛔ ' + szoveg);
  if (reszlet) console.log('     ' + reszlet);
  bukas++;
  return false;
};

cim('AGE OF THE CRYSTALS — ÉPÍTÉS-PANEL SZONDA (v0.16)');

// ── KÖZÖS FELÁLLÁS ────────────────────────────────────────────────────────
// Kis pálya, kevés egység: a panel-logika nem függ a mérettől, a szonda
// futásideje viszont igen. A munkás-arány 2, hogy legyen kit kijelölni.
function ujSim() {
  const s = new Sim({ seed: 20260803, n: 128, maxEgyseg: 200 });
  s.szondaFelallas(40, { munkasMinden: 2 });
  return s;
}
const sim = ujSim();

/** Készlet beállítása közvetlenül — CSAK a szonda csinálhat ilyet. */
function keszlet(s, csapat, e, f, k, kr) {
  const o = csapat * 4;
  s.gazdasag.keszlet[o] = e; s.gazdasag.keszlet[o + 1] = f;
  s.gazdasag.keszlet[o + 2] = k; s.gazdasag.keszlet[o + 3] = kr;
}

// ── 1. TIZENEGY ───────────────────────────────────────────────────────────
cim('1. VIZSGÁLAT — minden EPULET-indexelt tábla TIZENEGY hosszú');
sor('tábla', 'hossz', 'várt ' + EPULET_DB);

const tablak = {
  EP_SORREND, EP_IKON, EP_LEIRAS, EP_IDO_TUKOR, EP_LERAKO_TUKOR,
  EP_KORSZAK, EP_KORSZAK_JAVASLAT, EPULET_NEV, EP_AR, EP_MERET,
};
for (const nev of Object.keys(tablak)) {
  const h = tablak[nev].length;
  sor(nev, h, h === EPULET_DB ? '' : '⛔');
  gat(h === EPULET_DB, 'A(Z) ' + nev + ' TÁBLA NEM ' + EPULET_DB + ' HOSSZÚ.',
    'kapott: ' + h + '. A hiányzó elem `undefined` → NaN ár → némán eltűnő gomb.');
}

const kulonbozo = new Set(EP_SORREND);
sor('EP_SORREND permutáció', kulonbozo.size + ' különböző', kulonbozo.size === EPULET_DB ? '' : '⛔');
gat(kulonbozo.size === EPULET_DB, 'AZ EP_SORREND NEM PERMUTÁCIÓ — egy épület kimarad a sorból.');

let ikonBaj = 0;
for (let t = 0; t < EPULET_DB; t++) {
  if (!IKON_NEVEK.includes(EP_IKON[t])) {
    ikonBaj++;
    gat(false, 'ISMERETLEN IKONNÉV a(z) ' + EPULET_NEV[t] + ' gombján: "' + EP_IKON[t] + '"');
  }
  if (!EP_LEIRAS[t] || EP_LEIRAS[t].length < 10) {
    gat(false, 'HIÁNYZÓ LEÍRÁS: ' + EPULET_NEV[t]);
  }
}
sor('ikonnevek', EPULET_DB - ikonBaj + '/' + EPULET_DB, ikonBaj ? '⛔' : 'mind létezik');

// ── 2. TÜKÖR-EGYEZÉS A SIMMEL ─────────────────────────────────────────────
cim('2. VIZSGÁLAT — az EP_IDO és a LERAKO tükre EGYEZIK a sim forrásával');
sor('tábla', 'sim forrása', 'panel tükre');

const forras = readFileSync(join(GYOKER, 'src', 'sim', 'epuletek.js'), 'utf8');
function simTabla(nev) {
  const m = forras.match(new RegExp('const\\s+' + nev + '\\s*=\\s*\\[([^\\]]*)\\]'));
  if (!m) return null;
  return m[1].split(',').map((x) => Number(x.trim())).filter((x) => !Number.isNaN(x));
}
for (const [nev, tukor] of [['EP_IDO', EP_IDO_TUKOR], ['LERAKO', EP_LERAKO_TUKOR]]) {
  const eredeti = simTabla(nev);
  const egyezik = eredeti !== null && eredeti.length === tukor.length
    && eredeti.every((v, i) => v === tukor[i]);
  sor(nev, eredeti ? eredeti.join(',') : '(nem található)', egyezik ? 'egyezik' : '⛔ ELTÉR');
  gat(egyezik, 'A(Z) ' + nev + ' TÜKÖR SZÉTCSÚSZOTT a `src/sim/epuletek.js`-től.',
    'sim: ' + (eredeti ? eredeti.join(',') : '?') + '\n     panel: ' + tukor.join(',')
    + '\n     Írd át a `panel_epites_adat.js` tükrét — a gomb különben hazudik.');
}

// ── 3. SZÁMOK ─────────────────────────────────────────────────────────────
cim('3. VIZSGÁLAT — HÁNY épület építhető adott nyersanyagnál, és mi tiltja a többit');
sor('helyzet', 'építhető / tiltott', 'indokok');

/** Egy paraszt a 0. csapatból — a `munkasSzam` valódi adaton fusson. */
const munkasok = [];
for (let i = 0; i < sim.egysegek.db && munkasok.length < 3; i++) {
  if (sim.egysegek.csapat[i] === 0 && sim.egysegek.tipus[i] === TIPUS.MUNKAS) munkasok.push(i);
}
gat(munkasok.length > 0, 'A FELÁLLÁS NEM ADOTT EGYETLEN MUNKÁST SEM a 0. csapatnak.');
const munkasDb = munkasSzam(sim, 0, munkasok);
sor('kijelölhető paraszt', munkasDb, munkasDb === munkasok.length ? '' : '⛔ a szűrés téved');
gat(munkasDb === munkasok.length, 'A `munkasSzam` NEM a kijelölt parasztokat számolja.',
    'lista: ' + munkasok.length + ', számolt: ' + munkasDb);
gat(munkasSzam(sim, 1, munkasok) === 0, 'A `munkasSzam` IDEGEN csapatnak is számol parasztot.');

function indokSor(a) {
  const r = [];
  for (let i = 1; i < INDOK_DB; i++) if (a.indokDb[i] > 0) r.push(INDOK_NEV[i] + ':' + a.indokDb[i]);
  return r.join('  ') || '—';
}

const HELYZETEK = [
  ['kezdőkészlet', [200, 200, 100, 0], 1],
  ['üres raktár', [0, 0, 0, 0], 1],
  ['csak fa (1000)', [0, 1000, 0, 0], 1],
  ['bőség (5000)', [5000, 5000, 5000, 5000], 1],
  ['bőség, 0 paraszt', [5000, 5000, 5000, 5000], 0],
];
const eredmeny = {};
for (const [nev, k, mDb] of HELYZETEK) {
  keszlet(sim, 0, k[0], k[1], k[2], k[3]);
  const a = epitesLista(sim, 0, { munkasDb: mDb });
  eredmeny[nev] = a;
  sor(nev, a.epithetoDb + ' / ' + a.tiltottDb, indokSor(a));
  gat(a.epithetoDb + a.tiltottDb === EPULET_DB,
    'A(Z) „' + nev + '" HELYZETBEN NEM ' + EPULET_DB + ' ELEM VAN.',
    'építhető ' + a.epithetoDb + ' + tiltott ' + a.tiltottDb);
}

// A számoknak KÜLÖNBÖZNIÜK kell — enélkül a réteg nem számol, csak visszhangzik.
const kulonbozoSzam = new Set(Object.values(eredmeny).map((a) => a.epithetoDb));
sor('különböző eredmény', kulonbozoSzam.size, kulonbozoSzam.size >= 3 ? '' : '⛔');
gat(kulonbozoSzam.size >= 3,
  'MINDEN HELYZETRE (majdnem) UGYANANNYI ÉPÍTHETŐ JÖTT KI — a réteg nem számol.',
  'kapott értékek: ' + [...kulonbozoSzam].join(', '));

gat(eredmeny['üres raktár'].epithetoDb === 0,
  'ÜRES RAKTÁRRAL IS ÉPÍTHETŐ VALAMI.',
  'építhető: ' + eredmeny['üres raktár'].epithetoDb + ' — a nyersanyag-gát nem sül el');
gat(eredmeny['bőség (5000)'].epithetoDb === EPULET_DB,
  'BŐSÉGBEN SEM ÉPÍTHETŐ MIND A ' + EPULET_DB + ' ÉPÜLET.',
  'építhető: ' + eredmeny['bőség (5000)'].epithetoDb + ' — valamelyik gát mindig igaz');

// ── 4. GÁT-ELSÜTÉS SZABOTÁZZSAL ───────────────────────────────────────────
cim('4. VIZSGÁLAT — mind az öt tiltás ELSÜL, és a feltétel kikapcsolásával MEGVÁLTOZIK');
sor('gát', 'bekapcsolva', 'kikapcsolva');

const elsult = new Int32Array(INDOK_DB);
function jegyez(a) { for (let i = 0; i < INDOK_DB; i++) if (a.indokDb[i] > 0) elsult[i]++; }
for (const nev of Object.keys(eredmeny)) jegyez(eredmeny[nev]);

// (a) NINCS_MUNKAS — a UI saját gátja
keszlet(sim, 0, 5000, 5000, 5000, 5000);
const nincsParaszt = epitesLista(sim, 0, { munkasDb: 0 });
const vanParaszt = epitesLista(sim, 0, { munkasDb: 1 });
const kikapcsolva = epitesLista(sim, 0, { munkasDb: 0, munkasKell: false });
jegyez(nincsParaszt);
sor('NINCS_MUNKAS', nincsParaszt.epithetoDb + ' építhető',
  kikapcsolva.epithetoDb + ' építhető (munkasKell:false)');
gat(nincsParaszt.indokDb[INDOK.NINCS_MUNKAS] === EPULET_DB,
  'A PARASZT-GÁT NEM SÜL EL: 0 kijelölt paraszttal is építhető valami.',
  'tiltva: ' + nincsParaszt.indokDb[INDOK.NINCS_MUNKAS] + '/' + EPULET_DB);
gat(vanParaszt.epithetoDb === EPULET_DB,
  'A PARASZT-GÁT AKKOR IS TILT, HA VAN KIJELÖLT PARASZT — vagyis mindig igaz.');
gat(kikapcsolva.epithetoDb === EPULET_DB,
  'A `munkasKell:false` NEM KAPCSOLJA KI A GÁTAT — a kapcsoló halott.');

// (b) KORSZAK — befecskendezett táblával (lásd a fejlécet: alapból csupa nulla)
const korszakosan = epitesLista(sim, 0, { munkasDb: 1, korszakTabla: EP_KORSZAK_JAVASLAT });
jegyez(korszakosan);
let vartKorszakTilt = 0;
for (let t = 0; t < EPULET_DB; t++) if (EP_KORSZAK_JAVASLAT[t] > KORSZAK.SOTET) vartKorszakTilt++;
sim.gazdasag.korszak[0] = KORSZAK.FENY;
const fenyKorban = epitesLista(sim, 0, { munkasDb: 1, korszakTabla: EP_KORSZAK_JAVASLAT });
sim.gazdasag.korszak[0] = KORSZAK.SOTET;
sor('KORSZAK', korszakosan.indokDb[INDOK.KORSZAK] + ' tiltva (sötét kor)',
  fenyKorban.indokDb[INDOK.KORSZAK] + ' tiltva (fény kora)');
gat(korszakosan.indokDb[INDOK.KORSZAK] === vartKorszakTilt,
  'A KORSZAK-GÁT NEM ANNYIT TILT, AMENNYIT A TÁBLA ELŐÍR.',
  'várt ' + vartKorszakTilt + ', kapott ' + korszakosan.indokDb[INDOK.KORSZAK]);
gat(fenyKorban.indokDb[INDOK.KORSZAK] === 0,
  'A FÉNY KORÁBAN IS TILT A KORSZAK-GÁT — vagyis a korszakot nem is nézi.');

// (c) ⚠️ A PANEL A SIM PÉLDÁNYÁTÓL KÉRDEZ — EZT KÜLÖN BIZONYÍTJUK (v0.18/2).
//
// A v0.16-ban ez a réteg SAJÁT `EP_KORSZAK` tömböt tartott, és az volt a
// kockázat, hogy a kettő szétcsúszik: a gomb ZÖLD egy olyan épületre, amit a
// `parancsok.js` `epit` ága a levonás előtt eldob. A játékos ilyenkor nem
// hibaüzenetet kap, hanem SEMMIT — kattint, és nem történik semmi.
//
// Ezért két külön kérdés van itt, és mindkettőre kell válasz:
//   · az élő TÁBLA (`EP_KORSZAK`) és a gombok viselkedése összefügg-e;
//   · a panel követi-e a sim PÉLDÁNYÁNAK gátját (`Epuletek.korszakGat`),
//     ami meccsenként állítható — a modul-szintű tábla ettől nem mozdul.
const alapTabla = epitesLista(sim, 0, { munkasDb: 1 });
const korszakGatAktiv = EP_KORSZAK.some((x) => x > 0);
sor('EP_KORSZAK alapból', korszakGatAktiv ? 'ÉLESÍTVE' : 'csupa nulla (kikapcsolva)',
  alapTabla.indokDb[INDOK.KORSZAK] + ' tiltva');
gat(korszakGatAktiv === (alapTabla.indokDb[INDOK.KORSZAK] > 0),
  'AZ EP_KORSZAK TÁBLA ÉS A VISELKEDÉS NEM FÜGG ÖSSZE.',
  'tábla: [' + EP_KORSZAK.join(',') + '], tiltva: ' + alapTabla.indokDb[INDOK.KORSZAK]);

// A PÉLDÁNY-KÖVETÉS: a sim gátját átállítjuk, a panel VÁLTOZATLAN modul-szintű
// táblával kérdez — és mégis követnie kell. Ha nem, a panel másolatból él.
const peldanySim = ujSim();
peldanySim.epuletek.korszakGat(EP_KORSZAK_JAVASLAT);
const peldanyLista = epitesLista(peldanySim, 0, { munkasDb: 1 });
let vartPeldanyTilt = 0;
for (let t = 0; t < EPULET_DB; t++) if (EP_KORSZAK_JAVASLAT[t] > KORSZAK.SOTET) vartPeldanyTilt++;
sor('a sim PÉLDÁNYÁNAK gátja', peldanyLista.indokDb[INDOK.KORSZAK] + ' tiltva',
  'várt ' + vartPeldanyTilt + ' (korszakGat a sim-en, nem a panelen)');
gat(peldanyLista.indokDb[INDOK.KORSZAK] === vartPeldanyTilt,
  'A PANEL NEM KÖVETI A SIM PÉLDÁNYÁNAK KORSZAK-GÁTJÁT.',
  'A `frissitAllapot` a modul-szintű táblából dolgozik, nem a '
  + '`sim.epuletek.korszakKell()`-ből — egy meccsenként állított gát mellett '
  + 'a gomb engedné, amit a sim eldob.');
if (!korszakGatAktiv) {
  console.log('     ℹ️  Az `EP_KORSZAK` a SIMÉ (`src/sim/epuletek.js`), és ma csupa nulla —');
  console.log('        MÉRT döntés, nem félkész munka: élesítve a nehéz gép katonai');
  console.log('        épülete 3,4 → 1,9 esne (14 seed, v0.6-os kör), és 28 mért oldalon');
  console.log('        egyszer sem vált korszakot, tehát a kapu SOHA nem nyílna ki előtte.');
  console.log('        Az ág ettől még él: fent befecskendezett táblával, itt pedig a sim');
  console.log('        PÉLDÁNYÁNAK gátjával bizonyítva. Élesíteni egy sor az epuletek.js-ben.');
}

// (d) TELE — az épület-tár betelt
const teleSim = ujSim();
keszlet(teleSim, 0, 5000, 5000, 5000, 5000);
const elotte = teleSim.epuletek.db;
teleSim.epuletek.db = teleSim.epuletek.maxDb;
const tele = epitesLista(teleSim, 0, { munkasDb: 1 });
teleSim.epuletek.db = elotte;
const teleUtan = epitesLista(teleSim, 0, { munkasDb: 1 });
jegyez(tele);
sor('TELE', tele.indokDb[INDOK.TELE] + ' tiltva (db=maxDb)',
  teleUtan.indokDb[INDOK.TELE] + ' tiltva (db=' + elotte + ')');
gat(tele.indokDb[INDOK.TELE] === EPULET_DB,
  'A BETELT ÉPÜLET-TÁR NEM TILT MINDENT.',
  'tiltva: ' + tele.indokDb[INDOK.TELE] + '/' + EPULET_DB);
gat(teleUtan.indokDb[INDOK.TELE] === 0, 'A TELE-GÁT ÜRES TÁRNÁL IS TILT — mindig igaz.');

// (e) NINCS_HELY — a kurzor alatti gát
const helySim = ujSim();
keszlet(helySim, 0, 5000, 5000, 5000, 5000);
const helyAllapot = epitesLista(helySim, 0, { munkasDb: 1 });
const lerakasPuffer = ujLerakas();
let joHely = null, rosszHely = null;
for (let y = 4; y < helySim.n - 4 && (!joHely || !rosszHely); y++) {
  for (let x = 4; x < helySim.n - 4; x++) {
    const l = lerakasAllapot(helySim, helyAllapot, EPULET.LAKTANYA, x + 0.5, y + 0.5, lerakasPuffer);
    if (l.ok && !joHely) joHely = { x: x + 0.5, y: y + 0.5 };
    if (!l.ok && l.indok === INDOK.NINCS_HELY && !rosszHely) rosszHely = { x: x + 0.5, y: y + 0.5 };
    if (joHely && rosszHely) break;
  }
}
sor('NINCS_HELY', rosszHely ? 'elsül (van tiltott cella)' : '⛔ SOSEM SÜL EL',
  joHely ? 'van érvényes cella is' : '⛔ SEHOVA NEM RAKHATÓ');
gat(!!rosszHely, 'A NINCS_HELY GÁT SOSEM SÜL EL — a pálya minden cellája befogad egy 3×3-at.');
gat(!!joHely, 'SEHOVA NEM RAKHATÓ LE ÉPÜLET — a lerakhatóság mindig hamis.');
jegyez({ indokDb: (() => { const t = new Int32Array(INDOK_DB); t[INDOK.NINCS_HELY] = 1; return t; })() });

// Összegzés: MINDEN indok elsült-e?
let nemElsult = [];
for (let i = 1; i < INDOK_DB; i++) if (elsult[i] === 0) nemElsult.push(INDOK_NEV[i]);
sor('elsült indok-kód', (INDOK_DB - 1 - nemElsult.length) + '/' + (INDOK_DB - 1),
  nemElsult.length ? '⛔ néma: ' + nemElsult.join(', ') : 'mind');
gat(nemElsult.length === 0, 'VAN INDOK-KÓD, AMI SOSEM SÜL EL: ' + nemElsult.join(', '),
  'Egy soha meg nem hívott ág addig marad hibás, amíg valaki bele nem fut élesben.');

// ── 5. RANGSOR ────────────────────────────────────────────────────────────
cim('5. VIZSGÁLAT — több egyidejű tiltásból a MARADANDÓBB nyer');
sor('helyzet', 'kapott indok', 'várt');

// üres raktár + 0 paraszt + korszak-tábla → a KORSZAK nyer a másik kettő fölött
keszlet(sim, 0, 0, 0, 0, 0);
const halmozott = epitesLista(sim, 0, { munkasDb: 0, korszakTabla: EP_KORSZAK_JAVASLAT });
const ostrom = elemTipusbol(halmozott, EPULET.OSTROMMUHELY);
sor('nincs pénz+paraszt+korszak', INDOK_NEV[ostrom.indok], INDOK_NEV[INDOK.KORSZAK]);
gat(ostrom.indok === INDOK.KORSZAK,
  'A RANGSOR NEM ÉRVÉNYESÜL: a korszak-hiányt elnyomta egy múlékonyabb ok.',
  'kapott: ' + INDOK_NEV[ostrom.indok]);

// ugyanez, de a korszak megvan → a PARASZT nyer a nyersanyag fölött
const haz = elemTipusbol(halmozott, EPULET.HAZ);
sor('nincs pénz+paraszt', INDOK_NEV[haz.indok], INDOK_NEV[INDOK.NINCS_MUNKAS]);
gat(haz.indok === INDOK.NINCS_MUNKAS,
  'A PARASZT-HIÁNYT ELNYOMTA A NYERSANYAG-HIÁNY — fordított rangsor.');

// és a TELE mindent visz
const teleMind = elemTipusbol(tele, EPULET.HAZ);
sor('betelt tár + minden más', INDOK_NEV[teleMind.indok], INDOK_NEV[INDOK.TELE]);
gat(teleMind.indok === INDOK.TELE, 'A BETELT TÁR NEM ELŐZI MEG A TÖBBI OKOT.');

// ── 6. ⚠️ A SIM EGYETÉRT ──────────────────────────────────────────────────
cim('6. VIZSGÁLAT — a panel ára és cella-számítása EGYEZIK a `sim.parancs()`-csal');
sor('épület', 'pontosan az árból', 'eggyel kevesebből');

/** Szabad hely keresése egy típusnak, a 0. csapat központja körül. */
function szabadHely(s, tipus) {
  const kozp = { x: (s.n * 0.5) | 0, y: (s.n * 0.5) | 0 };
  for (let r = 3; r < 40; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const cx = kozp.x + dx, cy = kozp.y + dy;
        const b = balFelso(tipus, cx + 0.5, cy + 0.5);
        if (b.x < 1 || b.y < 1 || b.x + EP_MERET[tipus] >= s.n || b.y + EP_MERET[tipus] >= s.n) continue;
        if (s.epuletek.lerakhato(tipus, b.x, b.y)) return { wx: cx + 0.5, wy: cy + 0.5, bx: b.x, by: b.y };
      }
    }
  }
  return null;
}

/** Beadja a parancsot, és leléptet annyit, hogy a késleltetés lejárjon. */
function beadEsLep(s, p) {
  s.parancs(p);
  for (let i = 0; i <= KESLELTETES; i++) s.lep();
}

let simEgyezes = 0;
for (let k = 0; k < EPULET_DB; k++) {
  const tipus = EP_SORREND[k];
  const nev = EPULET_NEV[tipus];

  // (a) PONTOSAN annyi nyersanyaggal, amennyit a panel ír → fel kell épülnie.
  const s = ujSim();
  const a0 = epitesLista(s, 0, { munkasDb: 1 });
  const el = elemTipusbol(a0, tipus);
  keszlet(s, 0, el.ar[0], el.ar[1], el.ar[2], el.ar[3]);
  const a1 = epitesLista(s, 0, { munkasDb: 1 });
  const el1 = elemTipusbol(a1, tipus);
  const hely = szabadHely(s, tipus);
  if (!gat(!!hely, 'NINCS SZABAD HELY a(z) ' + nev + ' szondázásához.')) continue;
  if (!gat(el1.epitheto, 'A PANEL SZERINT PONTOSAN AZ ÁRÁBÓL SEM ÉPÍTHETŐ: ' + nev,
    'ár ' + arSzoveg(el1) + ', indok ' + INDOK_NEV[el1.indok])) continue;

  const dbElotte = s.epuletek.db;
  beadEsLep(s, epitParancs(0, tipus, hely.wx, hely.wy));
  const felepult = s.epuletek.db === dbElotte + 1;
  const uj = s.epuletek.db - 1;
  const joHelyre = felepult && s.epuletek.cx[uj] === hely.bx && s.epuletek.cy[uj] === hely.by;
  const joTipus = felepult && s.epuletek.tipus[uj] === tipus;
  let maradek = 0;
  for (let f = 0; f < 4; f++) maradek += s.gazdasag.keszlet[f];

  // (b) EGGYEL KEVESEBB a legdrágább nyersanyagból → semmi nem történhet.
  const s2 = ujSim();
  let dragabb = -1;
  for (let f = 0; f < 4; f++) if (el1.ar[f] > 0 && (dragabb < 0 || el1.ar[f] > el1.ar[dragabb])) dragabb = f;
  let elutasitva = true;
  if (dragabb >= 0) {
    const k2 = [el1.ar[0], el1.ar[1], el1.ar[2], el1.ar[3]];
    k2[dragabb] -= 1;
    keszlet(s2, 0, k2[0], k2[1], k2[2], k2[3]);
    const a2 = epitesLista(s2, 0, { munkasDb: 1 });
    const el2 = elemTipusbol(a2, tipus);
    const h2 = szabadHely(s2, tipus);
    const db2 = s2.epuletek.db;
    beadEsLep(s2, epitParancs(0, tipus, h2.wx, h2.wy));
    // A panel TILTJA, és a sim SEM építi fel — a kettőnek egyet kell mondania.
    elutasitva = !el2.epitheto && s2.epuletek.db === db2;
    if (!elutasitva) {
      gat(false, 'ÁR-ELTÉRÉS: ' + nev + ' eggyel kevesebb ' + NYERS_NEV[dragabb] + '-ból is átment.',
        'panel szerint építhető: ' + el2.epitheto + ', sim épített: ' + (s2.epuletek.db !== db2));
    }
  }

  const rendben = felepult && joHelyre && joTipus && maradek === 0 && elutasitva;
  if (rendben) simEgyezes++;
  sor(nev, felepult ? (joHelyre ? 'felépült, jó cellán' : '⛔ ROSSZ CELLÁN') : '⛔ NEM ÉPÜLT FEL',
    (maradek === 0 ? 'maradék 0' : '⛔ maradék ' + maradek)
    + (elutasitva ? ' · elutasítva' : ' · ⛔ ÁTMENT'));

  gat(felepult, 'A(Z) ' + nev + ' NEM ÉPÜLT FEL a panel által ígért árból.',
    'ár: ' + arSzoveg(el1) + ' — a panel hazudik, vagy a parancs-objektum rossz.');
  gat(!felepult || joHelyre, 'A(Z) ' + nev + ' NEM ODA ÉPÜLT, AHOVA AZ ELŐNÉZET MUTATTA.',
    'előnézet: (' + hely.bx + ',' + hely.by + '), tényleges: ('
    + s.epuletek.cx[uj] + ',' + s.epuletek.cy[uj] + ') — a `balFelso` szétcsúszott a `parancsok.js`-től.');
  gat(!felepult || joTipus, 'A(Z) ' + nev + ' HELYETT MÁS TÍPUS ÉPÜLT FEL.');
  gat(!felepult || maradek === 0, 'A(Z) ' + nev + ' ÁRA NEM EGYEZIK: maradt ' + maradek + ' nyersanyag.');
}
sor('teljes egyezés', simEgyezes + '/' + EPULET_DB, simEgyezes === EPULET_DB ? '' : '⛔');
gat(simEgyezes === EPULET_DB, 'A PANEL ÉS A SIM NEM MINDEN ÉPÜLETRE EGYEZIK.');

// ── 7. FELIRAT ────────────────────────────────────────────────────────────
cim('7. VIZSGÁLAT — a feliratokban nincs szemét, és az indokok KÜLÖNBÖZNEK');
sor('mit néztünk', 'darab', '');

const SZEMET = ['undefined', 'NaN', 'null', 'INDOK.', 'EPULET.', '[object'];
const mondatok = [];
for (const nev of Object.keys(eredmeny)) {
  const a = eredmeny[nev];
  for (const el of a.elemek) {
    mondatok.push(arSzoveg(el), idoSzoveg(el), indokSzoveg(a, el), el.leiras, el.nev);
  }
}
mondatok.push(lerakasSzoveg(helyAllapot, lerakasAllapot(helySim, helyAllapot,
  EPULET.LAKTANYA, joHely.x, joHely.y, lerakasPuffer)));
if (rosszHely) {
  mondatok.push(lerakasSzoveg(helyAllapot, lerakasAllapot(helySim, helyAllapot,
    EPULET.LAKTANYA, rosszHely.x, rosszHely.y, lerakasPuffer)));
}
for (const a of [korszakosan, tele, nincsParaszt]) {
  for (const el of a.elemek) mondatok.push(indokSzoveg(a, el));
}

let szemetes = 0;
for (const m of mondatok) {
  if (typeof m !== 'string' || m.length === 0) { szemetes++; continue; }
  for (const sz of SZEMET) if (m.includes(sz)) { szemetes++; break; }
}
sor('mondat', mondatok.length, szemetes ? '⛔ ' + szemetes + ' szemetes' : 'tiszta');
gat(szemetes === 0, 'VAN SZEMÉT A FELIRATOKBAN (' + szemetes + ' db).',
  'Egy „még undefined fa" felirat a gombon némán elfér — a játékosnak viszont nem.');

const kulonbozoIndok = new Set();
for (const a of [eredmeny['üres raktár'], korszakosan, tele, nincsParaszt]) {
  for (const el of a.elemek) if (!el.epitheto) kulonbozoIndok.add(indokSzoveg(a, el));
}
sor('különböző indok-mondat', kulonbozoIndok.size, kulonbozoIndok.size >= 5 ? '' : '⛔');
gat(kulonbozoIndok.size >= 5,
  'AZ INDOKOK NEM KÜLÖNBÖZNEK ELÉGGÉ — egy lusta generátor mindenre ugyanazt adja.',
  'különböző mondat: ' + kulonbozoIndok.size);

// A nyersanyag-indok SZÁMOT mondjon, ne csak annyit, hogy „nem telik".
keszlet(sim, 0, 0, 0, 0, 0);
const szegeny = epitesLista(sim, 0, { munkasDb: 1 });
const szegenyHaz = elemTipusbol(szegeny, EPULET.HAZ);
const mondat = indokSzoveg(szegeny, szegenyHaz);
sor('„ház" indoka üres raktárnál', mondat, /\d/.test(mondat) ? '' : '⛔ nincs benne szám');
gat(/\d/.test(mondat), 'A NYERSANYAG-INDOK NEM MOND SZÁMOT: "' + mondat + '"',
  'A játékosnak azt kell tudnia, MENNYI hiányzik, nem azt, hogy „nem elég".');

// ── 8. VALÓDI PÁLYA ───────────────────────────────────────────────────────
cim('8. VIZSGÁLAT — lerakhatóság a TÉNYLEGES terepen');
sor('épület', 'befogadó cella', 'a pálya %-a');

const ossz = (helySim.n - 8) * (helySim.n - 8);
for (const tipus of [EPULET.FAL, EPULET.RAKTAR, EPULET.LAKTANYA]) {
  let jo = 0;
  for (let y = 4; y < helySim.n - 4; y++) {
    for (let x = 4; x < helySim.n - 4; x++) {
      const b = balFelso(tipus, x + 0.5, y + 0.5);
      if (helySim.epuletek.lerakhato(tipus, b.x, b.y)) jo++;
    }
  }
  const szaz = ((jo / ossz) * 1000 | 0) / 10;
  sor(EPULET_NEV[tipus], jo + ' / ' + ossz, szaz + ' %');
  gat(jo > 0, 'A(Z) ' + EPULET_NEV[tipus] + ' SEHOVA NEM RAKHATÓ LE a pályán.');
  gat(jo < ossz, 'A(Z) ' + EPULET_NEV[tipus] + ' MINDENHOVA LERAKHATÓ — a terep nem számít.',
    'Ilyenkor a víz és a szikla is befogadna épületet.');
}

// A nagyobb épület SZIGORÚBB: a 3×3 sosem fér el több helyre, mint az 1×1.
let fal = 0, laktanya = 0;
for (let y = 4; y < helySim.n - 4; y++) {
  for (let x = 4; x < helySim.n - 4; x++) {
    const bf = balFelso(EPULET.FAL, x + 0.5, y + 0.5);
    const bl = balFelso(EPULET.LAKTANYA, x + 0.5, y + 0.5);
    if (helySim.epuletek.lerakhato(EPULET.FAL, bf.x, bf.y)) fal++;
    if (helySim.epuletek.lerakhato(EPULET.LAKTANYA, bl.x, bl.y)) laktanya++;
  }
}
sor('3×3 ≤ 1×1', laktanya + ' ≤ ' + fal, laktanya <= fal ? '' : '⛔');
gat(laktanya <= fal, 'A 3×3-AS ÉPÜLET TÖBB HELYRE FÉR EL, MINT AZ 1×1-ES.',
  'Ez csak úgy lehet, ha a méret nem számít a lerakhatóságban.');

// ── 9. SZERZŐDÉS ──────────────────────────────────────────────────────────
// A `panel_epites.js` NODE-BAN NEM FUT (DOM-ot használ, és CSS-t importál) —
// ezt a panel-szerződés 4. pontja ki is mondja. Amit viszont a FORRÁSÁN
// ellenőrizni lehet, azt ellenőrizzük: ezek a szerződés-sértések mind némák
// lennének, és mind egy másik agent munkáját rontanák el.
cim('9. VIZSGÁLAT — a panel forrása tartja a v0.16-os szerződést');
sor('kikötés', 'eredmény', '');

const panelSzoveg = readFileSync(join(GYOKER, 'src', 'ui', 'panel_epites.js'), 'utf8');
const cssSzoveg = readFileSync(join(GYOKER, 'src', 'ui', 'panel_epites.css'), 'utf8');
/**
 * A KOMMENTEK NÉLKÜLI kód. A fejléc-kommentek példaként LEÍRJÁK a tiltott
 * mintákat is (épp azért, hogy a következő olvasó értse a szabályt) — egy
 * kommentre elsülő gát viszont arra tanítaná a következő agentet, hogy ne
 * dokumentáljon. A szabály a KÓDRA vonatkozik.
 */
const panelKod = panelSzoveg.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const HELYEK = ['felso', 'also_bal', 'also_kozep', 'also_jobb', 'jobb_also', 'kepernyo'];
const panelExport = /export const PANEL = \{[^}]*nev:\s*'([a-z_]+)'[^}]*hely:\s*'([a-z_]+)'/.exec(panelSzoveg);
sor('PANEL export', panelExport ? panelExport[1] + ' / ' + panelExport[2] : '⛔ hiányzik', '');
gat(!!panelExport, 'NINCS SZABÁLYOS `PANEL` EXPORT — a HUD-váz nem tudja, hova tegye.');
gat(!panelExport || panelExport[1] === 'epites',
  'A PANEL NEVE NEM „epites" — a `main.js` PANEL_TERV-je erre a névre keres.');
gat(!panelExport || HELYEK.includes(panelExport[2]),
  'ISMERETLEN HELY: ' + (panelExport ? panelExport[2] : '?'), 'ismertek: ' + HELYEK.join(', '));

for (const nev of ['export class PanelEpites', 'frissit(', 'set enabled(', 'bont(']) {
  gat(panelSzoveg.includes(nev), 'A PANELBŐL HIÁNYZIK A SZERZŐDÉS EGY TAGJA: ' + nev);
}
sor('osztály + frissit/enabled/bont', 'megvan', '');

// ⚠️ A PANEL SOSEM ÍR SIM-ÁLLAPOTOT. Ez a szerződés 1. pontja, és ez az, ami a
// v0.8 lockstepjén desyncet okozna — ott már senki nem keresné a UI-ban.
const TILTOTT_IRAS = [
  /\.epuletek\.lerak\s*\(/, /\.gazdasag\.levon\s*\(/, /\.gazdasag\.ad\s*\(/,
  /keszlet\s*\[[^\]]*\]\s*[-+]?=/, /\.korszak\s*\[[^\]]*\]\s*=/,
  /\.epuletek\.db\s*=/, /parancsAllapot\.[a-zA-Z]+\s*\[[^\]]*\]\s*=/,
];
let simIras = 0;
for (const r of TILTOTT_IRAS) if (r.test(panelKod)) { simIras++; gat(false, 'A PANEL SIM-ÁLLAPOTOT ÍR: ' + r); }
const parancsDb = (panelKod.match(/sim\.parancs\s*\(/g) || []).length;
sor('sim-írás / sim.parancs()', simIras + ' / ' + parancsDb, simIras ? '⛔' : 'csak a parancs-soron hat');
gat(simIras === 0, 'A PANEL MEGKERÜLI A PARANCS-SORT.');
gat(parancsDb === 1, 'NEM PONTOSAN EGY `sim.parancs()` HÍVÁS VAN A PANELBEN.',
  'kapott: ' + parancsDb + ' — egy hatás, egy hely; több belépési pont több elcsúszási lehetőség.');

// Minden osztálynév `aoc-epites` előtaggal, ÉS mindegyik létezik a CSS-ben.
const jsOsztalyok = new Set();
for (const m of panelKod.matchAll(/(?:className\s*=|classList\.add\()\s*'([^']+)'/g)) {
  for (const o of m[1].split(/\s+/)) if (o) jsOsztalyok.add(o);
}
const cssOsztalyok = new Set();
for (const m of cssSzoveg.matchAll(/\.([a-zA-Z][\w-]*)/g)) cssOsztalyok.add(m[1]);

const rosszElotag = [...jsOsztalyok].filter((o) => o !== 'aoc-epites' && !o.startsWith('aoc-epites-'));
const nincsCss = [...jsOsztalyok].filter((o) => !cssOsztalyok.has(o));
sor('JS-osztálynév', jsOsztalyok.size, rosszElotag.length ? '⛔ ' + rosszElotag.join(', ') : 'mind aoc-epites-');
sor('van hozzá CSS', (jsOsztalyok.size - nincsCss.length) + '/' + jsOsztalyok.size,
  nincsCss.length ? '⛔ hiányzik: ' + nincsCss.join(', ') : '');
gat(rosszElotag.length === 0,
  'IDEGEN OSZTÁLYNÉV A PANELBEN: ' + rosszElotag.join(', '),
  'Tizenhat agent dolgozik egy munkafában — egy `.gomb` szabály a szomszéd panelt is átfestené.');
gat(nincsCss.length === 0, 'OSZTÁLYNÉV CSS NÉLKÜL: ' + nincsCss.join(', '),
  'Az elgépelt osztálynév némán stílustalan elemet hagy — nem hibát.');

// A CSS-ben NINCS globális szabály: minden szelektor az `aoc-epites`-ből indul.
const globalis = [];
for (const blokk of cssSzoveg.replace(/\/\*[\s\S]*?\*\//g, '').split('}')) {
  const fej = blokk.split('{')[0].trim();
  if (!fej || fej.startsWith('@') || blokk.indexOf('{') < 0) continue;
  for (const sz of fej.split(',')) {
    const t = sz.trim();
    if (t && !t.startsWith('.aoc-epites')) globalis.push(t);
  }
}
sor('globális CSS-szabály', globalis.length, globalis.length ? '⛔ ' + globalis.join(' | ') : 'nincs');
gat(globalis.length === 0, 'GLOBÁLIS CSS-SZABÁLY A PANEL FÁJLJÁBAN: ' + globalis.join(', '),
  'A saját CSS-ed nem festheti át a többi panelt és a HUD-vázat.');

// ── ÖSSZEGZÉS ─────────────────────────────────────────────────────────────
cim('ÖSSZEGZÉS');
sor('épülettípus', EPULET_DB, 'mind gombot kap');
sor('kezdőkészletből építhető', eredmeny['kezdőkészlet'].epithetoDb + '/' + EPULET_DB,
  indokSor(eredmeny['kezdőkészlet']));
sor('bőségben építhető', eredmeny['bőség (5000)'].epithetoDb + '/' + EPULET_DB, '');
sor('sim-egyezés', simEgyezes + '/' + EPULET_DB, 'ár + cella + parancs');
sor('elsült indok-kód', (INDOK_DB - 1) + '/' + (INDOK_DB - 1), INDOK_NEV.slice(1).join(', '));
sor('korszak-gát', korszakGatAktiv ? 'AKTÍV' : 'kikapcsolva (sim-egyezés)', 'ág bizonyítva');

console.log('');
if (bukas) {
  console.log('⛔ BUKÁS — ' + bukas + ' gát nem ment át.\n');
  process.exit(1);
}
console.log('✅ RENDBEN — mind a kilenc vizsgálat átment.\n');
