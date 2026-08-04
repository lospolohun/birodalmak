// AGE OF THE CRYSTALS — KIJELÖLÉS-PANEL SZONDA (v0.16).
//
// ── MIÉRT VAN EZ EGYÁLTALÁN ───────────────────────────────────────────────
// A kijelölés-panel adatait SEMMILYEN meglévő kapu nem őrzi. A determinizmus-
// szonda hash-eket hasonlít, és a hash bitre egyezik akkor is, ha a panel
// „undefined" nevű egységet mutat 0 sebzéssel — a felirat nem megy át a
// lockstep-soron. Az FPS-szonda felhőben meg sem szólal. Vagyis a panel pont
// abba a résbe esne, ahol ez a projekt már HATSZOR megégett: zöld kapu egy
// halott vagy hazug rendszer mellett.
//
// ── AZ ALAPSZABÁLY: A ZÖLD KAPU NEM MŰKÖDÉS-KAPU ─────────────────────────
// A semmittevés tökéletesen hibátlan. Egy panel, ami MINDIG üres modellt ad,
// átmenne minden „nem dob kivételt" vizsgálaton. Ezért itt minden vizsgálat
// SZÁMOT mond, és a számnak MOZDULNIA kell:
//   · vegyes kijelölésnél HÁNY csoport keletkezett és HÁNY gomb aktív,
//   · a tétlen parasztok száma megegyezik-e a sim saját számával, ÉS lemegy-e,
//     ha tényleg munkára küldjük őket,
//   · az épület képzési sorába tényleg bekerül-e, amit megrendeltünk.
//
// ── ÉS MINDEN VIZSGÁLATOT MEG IS PRÓBÁLUNK MEGBUKTATNI ───────────────────
// A 8. vizsgálat SZABOTÁZS: halott egységeket, tartományon kívüli indexeket,
// nem létező épületet és a `KEPEZ` KILENC hosszú tábláján túli tornyot ad be.
// Ha a panel ezekre elszáll vagy hazudik, itt derül ki — nem a tulajdonos
// képernyőjén.
//
// ⚠️ A TÁBLA-HOSSZ. A `TIPUS`-szal indexelt tábla HAT hosszú, az `EPULET`-tel
// indexelt TIZENEGY. Rövid tábla → `undefined` → néma hiba (a legutóbbi épp a
// kijelölő gyűrű sugara volt). Az 1. és a 2. vizsgálat ezt méri, típusonként és
// épületenként külön.
//
// HASZNÁLAT:  node tools/panel_kijeloles_szonda.mjs   (npm run p:kijeloles)
// Kilépési kód: 0 = rendben, 1 = bukás.

import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const GYOKER = dirname(dirname(fileURLToPath(import.meta.url)));
const be = (...r) => import(pathToFileURL(join(GYOKER, ...r)).href);

const { Sim } = await be('src', 'sim', 'sim.js');
const { TIPUS, TIPUS_DB, ALLAPOT } = await be('src', 'sim', 'units.js');
const { EPULET, EPULET_NEV } = await be('src', 'sim', 'epuletek.js');
const { KEPEZ, SOR_HOSSZ } = await be('src', 'sim', 'kepzes.js');
const { MUNKA } = await be('src', 'sim', 'munkas.js');
const { ALLAS } = await be('src', 'sim', 'parancsallapot.js');
const { NYERS } = await be('src', 'sim', 'eroforras.js');
const { TECH, TECH_DB, KUTAT } = await be('src', 'sim', 'technologia.js');
const { CIV } = await be('src', 'sim', 'civ.js');
const { IKON_NEVEK } = await be('src', 'ui', 'ikonok.js');
const A = await be('src', 'ui', 'panel_kijeloles_adat.js');

const SEED = 20260804;

let bukas = 0;
const sor = (a, b, c) => console.log('  ' + String(a).padEnd(34) + String(b).padEnd(20) + (c ?? ''));
const cim = (t) => console.log('\n' + t + '\n' + '─'.repeat(80));
const gat = (all, szoveg, reszlet) => {
  if (all) return true;
  console.log('\n  ⛔ ' + szoveg);
  if (reszlet) console.log('     ' + reszlet);
  bukas++;
  return false;
};

console.log('\nAGE OF THE CRYSTALS — KIJELÖLÉS-PANEL SZONDA (v0.16)\n' + '═'.repeat(80));

// ── SEGÉDEK ───────────────────────────────────────────────────────────────

/**
 * Szemét-keresés a modellben: `undefined`, `NaN`, `null`, és az olyan string,
 * ami ezek valamelyikét TARTALMAZZA (mert az kerül a képernyőre).
 * @returns {string[]} a hibás útvonalak
 */
function szemet(ertek, ut = 'modell', ki = [], melyseg = 0) {
  if (melyseg > 6) return ki;
  if (ertek === undefined) { ki.push(ut + ' = undefined'); return ki; }
  if (ertek === null) { ki.push(ut + ' = null'); return ki; }
  const t = typeof ertek;
  if (t === 'number') {
    if (!Number.isFinite(ertek)) ki.push(ut + ' = ' + String(ertek));
    return ki;
  }
  if (t === 'string') {
    if (/undefined|NaN|\[object|null/.test(ertek)) ki.push(ut + ' = "' + ertek + '"');
    return ki;
  }
  if (t === 'boolean' || t === 'function') return ki;
  if (ArrayBuffer.isView(ertek)) {
    for (let i = 0; i < ertek.length; i++) {
      if (!Number.isFinite(ertek[i])) ki.push(ut + '[' + i + '] = ' + ertek[i]);
    }
    return ki;
  }
  if (Array.isArray(ertek)) {
    for (let i = 0; i < ertek.length; i++) {
      if (ertek[i] === null) continue;      // a `csoportok` farka szándékosan null
      szemet(ertek[i], ut + '[' + i + ']', ki, melyseg + 1);
    }
    return ki;
  }
  for (const k of Object.keys(ertek)) szemet(ertek[k], ut + '.' + k, ki, melyseg + 1);
  return ki;
}

/** Egy meccs-szerű sim: két sereg, sok munkás, néhány ostromgép. */
function ujSim(egysegDb = 240) {
  const s = new Sim({ seed: SEED, n: 256, maxEgyseg: 800 });
  s.civValaszt(0, CIV.HEGYI_BANYASZ);
  s.civValaszt(1, CIV.FOLYAMI_KERESKEDO);
  s.szondaFelallas(egysegDb, { munkasMinden: 3, ostrom: 6 });
  return s;
}

/** A csapat összes élő egység-indexe. */
function mindenEgyseg(s, csapat) {
  const ki = [];
  for (let i = 0; i < s.egysegek.db; i++) {
    if (s.egysegek.csapat[i] === csapat && s.harc.elo[i]) ki.push(i);
  }
  return ki;
}

/** Épület lerakása egy szabad helyre. `-1`, ha nem fért el. */
function epit(s, tipus, kx, ky, keszen) {
  const h = s._szabadEpuletHely(tipus, kx | 0, ky | 0);
  if (!h) return -1;
  return s.epuletek.lerak(tipus, h.x, h.y, 0, !!keszen);
}

// ══════════════════════════════════════════════════════════════════════════
// 1. VIZSGÁLAT — TÁBLA-HOSSZAK ÉS IKON-NEVEK
// ══════════════════════════════════════════════════════════════════════════
cim('1. VIZSGÁLAT — a táblák hossza (TIPUS = 6, EPULET = 11) és az ikonnevek');
sor('tábla', 'hossz', 'elvárt');

const EPULET_DB = EPULET_NEV.length;
const hosszak = [
  ['TIPUS_NEV', A.TIPUS_NEV.length, TIPUS_DB],
  ['TIPUS_IKON', A.TIPUS_IKON.length, TIPUS_DB],
  ['EPULET_IKON', A.EPULET_IKON.length, EPULET_DB],
  ['EP_EPITES_IDO', A.EP_EPITES_IDO.length, EPULET_DB],
  ['ALLAPOT_NEV', A.ALLAPOT_NEV.length, Object.keys(ALLAPOT).length],
  ['PARANCS_NEV', A.PARANCS_NEV.length, 5],
  ['MUNKA_NEV', A.MUNKA_NEV.length, Object.keys(MUNKA).length],
];
for (const [nev, van, kell] of hosszak) {
  sor(nev, van, kell + (van === kell ? '' : '   ⛔'));
  gat(van === kell, 'A(Z) `' + nev + '` TÁBLA HOSSZA ' + van + ', PEDIG ' + kell + ' KELL.',
    'Rövid tábla → `undefined` a kiírásban vagy `NaN` a csík szélességében, '
    + 'és SEMMI nem szól érte. Ez a projekt ötödik ilyen hibája lenne.');
}
gat(TIPUS_DB === 6, 'A `TIPUS_DB` MÁR NEM 6 — az egész adatréteget át kell nézni.',
  'kapott: ' + TIPUS_DB);
gat(EPULET_DB === 11, 'AZ `EPULET_NEV` MÁR NEM 11 HOSSZÚ.', 'kapott: ' + EPULET_DB);

// Minden ikonnév LÉTEZIK-e? Az `ikonSvg` ismeretlen névre DOB — a panel a
// boot alatt dőlne el, ha itt elgépelés van.
let ikonHiba = 0;
const ikonLista = [...A.TIPUS_IKON, ...A.EPULET_IKON, ...A.GOMBOK.map((g) => g.ikon)];
for (const ik of ikonLista) if (!IKON_NEVEK.includes(ik)) { ikonHiba++; console.log('     ismeretlen ikon: ' + ik); }
sor('hivatkozott ikonnév', ikonLista.length, ikonHiba === 0 ? 'mind létezik' : ikonHiba + ' HIÁNYZIK ⛔');
gat(ikonHiba === 0, 'A PANEL NEM LÉTEZŐ IKONRA HIVATKOZIK.',
  'Az `ikonSvg` dob rá, tehát a panel a felépüléskor dőlne el.');

sor('parancs-gomb', A.GOMB_DB, A.GOMBOK.map((g) => g.billentyu).join(' '));
gat(A.GOMB_DB === 6, 'NEM HAT PARANCS-GOMB VAN.', 'kapott: ' + A.GOMB_DB);
// A billentyű a gombon MUST — ez a panel egyik létoka.
const billHiany = A.GOMBOK.filter((g) => !g.billentyu || !g.nev || !g.sugo).length;
gat(billHiany === 0, 'VAN GOMB BILLENTYŰ / NÉV / SÚGÓ NÉLKÜL.',
  'A rejtett gyorsbillentyű volt a v0.16 előtti állapot legnagyobb baja — '
  + 'egy felirat nélküli gomb ugyanezt hozná vissza.');

// ══════════════════════════════════════════════════════════════════════════
// 2. VIZSGÁLAT — MIND A HAT TÍPUS ÉS MIND A TIZENEGY ÉPÜLET, SZEMÉT NÉLKÜL
// ══════════════════════════════════════════════════════════════════════════
cim('2. VIZSGÁLAT — mind a 6 típus és mind a 11 épület végigjárva');
sor('mit', 'név', 'szemét a modellben');

const s2 = ujSim(240);
const m2 = A.ujModell(s2.maxEgyseg);

// Egy EGYEDI egységet is a világba teszünk — az a 6. típus, és a neve
// CSAPATFÜGGŐ (a `sim.egyedi` tartja). Enélkül a hatodik sor sosem futna.
{
  const minta = mindenEgyseg(s2, 0)[0];
  const p = s2._jarhatoKozel(s2.egysegek.px[minta] + 2, s2.egysegek.py[minta] + 2);
  const uj = s2.egysegKepez(p.x, p.y, TIPUS.EGYEDI, 0);
  gat(uj >= 0, 'AZ EGYEDI EGYSÉGET NEM SIKERÜLT LÉTREHOZNI — a 6. típus vizsgálatlan marad.');
}

let tipusSzemet = 0;
for (let t = 0; t < TIPUS_DB; t++) {
  // Keressünk egy ilyen típusú élő egységet.
  let idx = -1;
  for (let i = 0; i < s2.egysegek.db; i++) {
    if (s2.egysegek.csapat[i] === 0 && s2.egysegek.tipus[i] === t && s2.harc.elo[i]) { idx = i; break; }
  }
  if (idx < 0) { sor(t + '. típus', '—', 'NINCS A PÁLYÁN ⛔'); bukas++; continue; }
  A.kijelolesAdat(s2, { egysegek: [idx], db: 1, epulet: -1, csapat: 0 }, m2);
  const hibak = szemet(m2.egy, 'egy');
  tipusSzemet += hibak.length;
  const nev = m2.egy.nev;
  sor(t + '. ' + nev, m2.egy.hp + '/' + m2.egy.maxHp,
    hibak.length ? hibak.join(', ') + ' ⛔' : 'tiszta');
  gat(hibak.length === 0, 'A(Z) ' + t + '. TÍPUS MODELLJÉBEN SZEMÉT VAN.', hibak.join('; '));
  gat(nev.length > 1, 'A(Z) ' + t + '. TÍPUSNAK NINCS OLVASHATÓ NEVE.', 'kapott: "' + nev + '"');
  gat(m2.fajta === 'egy', 'EGY EGYSÉG KIJELÖLÉSÉNÉL A FAJTA NEM `egy`.', 'kapott: ' + m2.fajta);
}
gat(tipusSzemet === 0, 'ÖSSZESEN ' + tipusSzemet + ' SZEMÉT-MEZŐ A TÍPUS-MODELLEKBEN.');

// ── és mind a tizenegy épület ──────────────────────────────────────────
const s2b = ujSim(80);
let epSzemet = 0, epKesz = 0;
for (let t = 0; t < EPULET_DB; t++) {
  const kx = 40 + (t % 4) * 14;
  const ky = 40 + ((t / 4) | 0) * 14;
  const idx = epit(s2b, t, kx, ky, true);
  if (idx < 0) { sor(t + '. ' + EPULET_NEV[t], '—', 'NEM FÉRT EL ⛔'); bukas++; continue; }
  epKesz++;
  A.kijelolesAdat(s2b, { egysegek: null, db: 0, epulet: idx, csapat: 0 }, m2);
  const hibak = szemet(m2.ep, 'ep');
  epSzemet += hibak.length;
  sor(t + '. ' + m2.ep.nev, m2.ep.hp + '/' + m2.ep.maxHp,
    hibak.length ? hibak.join(', ') + ' ⛔' : 'tiszta · ikon ' + m2.ep.ikon);
  gat(hibak.length === 0, 'A(Z) ' + t + '. ÉPÜLET MODELLJÉBEN SZEMÉT VAN.', hibak.join('; '));
  gat(m2.fajta === 'epulet', 'ÉPÜLET KIJELÖLÉSÉNÉL A FAJTA NEM `epulet`.', 'kapott: ' + m2.fajta);
  gat(m2.ep.nev === EPULET_NEV[t], 'AZ ÉPÜLET NEVE NEM EGYEZIK A SIM NEVÉVEL.',
    'panel: "' + m2.ep.nev + '", sim: "' + EPULET_NEV[t] + '"');
}
sor('épület végigjárva', epKesz, EPULET_DB + ' közül');
gat(epKesz === EPULET_DB, 'NEM MIND A TIZENEGY ÉPÜLET LETT MEGVIZSGÁLVA.',
  'megvizsgálva: ' + epKesz);
gat(epSzemet === 0, 'ÖSSZESEN ' + epSzemet + ' SZEMÉT-MEZŐ AZ ÉPÜLET-MODELLEKBEN.');

// ══════════════════════════════════════════════════════════════════════════
// 3. VIZSGÁLAT — A HARCI ADATSOR ÉL (a `harc.js` aláhúzott metódusai)
// ══════════════════════════════════════════════════════════════════════════
cim('3. VIZSGÁLAT — harci adatsor mind a 6 típusra (életerő, sebzés, ütem, páncél)');
sor('típus', 'hp / sebzés / ütem', 'páncél · támadás · hatótáv');

let harcHiba = 0;
for (let t = 0; t < TIPUS_DB; t++) {
  const h = A.harcAdat(s2, t, 0, {});
  const jo = Number.isFinite(h.maxHp) && h.maxHp > 0
    && Number.isFinite(h.sebzes) && h.sebzes > 0
    && Number.isFinite(h.utemTick) && h.utemTick > 0
    && Number.isFinite(h.hatotav) && h.hatotav > 0
    && Number.isFinite(h.pancelErtek)
    && Number.isFinite(h.sebzesGyalog) && h.sebzesGyalog > 0
    && h.tamadasNev !== '?' && h.pancelNev !== '?';
  if (!jo) harcHiba++;
  sor(t + '. ' + A.egysegNev(s2, t, 0),
    h.maxHp + ' / ' + h.sebzes + ' / ' + h.utemMp + ' mp',
    h.pancelNev + ' (' + h.pancelErtek + ') · ' + h.tamadasNev + ' · '
    + h.hatotav + (jo ? '' : '   ⛔'));
}
gat(harcHiba === 0, harcHiba + ' TÍPUS HARCI ADATSORA HIÁNYOS VAGY NULLA.',
  'Ezek a `harc.js` NEM EXPORTÁLT tábláiból jönnek, a `_alapSebzes` / `_utem` / '
  + '`_pancelErtek` / `_maxHp` / `_tamadasTipus` / `_pancelTipus` metódusokon át. '
  + 'Ha valaki átnevezte őket, a panel „sebzés 0"-t írna ki, és a játékos azt '
  + 'hinné, hogy nem üt a lovagja. Ezért van itt kapu, és nem `?? 0`.');

// Az ostromgép élő cél ellen NEVETSÉGESEN gyenge — ez balansz-döntés, és a
// panelnek meg is kell mutatnia. Ha a két szám egyforma lenne, a `sebzesGyalog`
// nem az ellensúly-táblából jönne.
{
  const og = A.harcAdat(s2, TIPUS.OSTROMGEP, 0, {});
  sor('ostromgép nyers / gyalogos ellen', og.sebzes + ' / ' + og.sebzesGyalog,
    og.sebzesGyalog < og.sebzes ? 'az ellensúly-tábla hat' : 'GYANÚS ⛔');
  gat(og.sebzesGyalog < og.sebzes,
    'AZ OSTROMGÉP „GYALOGOS ELLEN" SZÁMA NEM MEGY ÁT AZ ELLENSÚLY-TÁBLÁN.',
    'nyers ' + og.sebzes + ', gyalogos ellen ' + og.sebzesGyalog
    + ' — a 6 %-os szorzónak látszania kell.');
}

// ══════════════════════════════════════════════════════════════════════════
// 4. VIZSGÁLAT — VEGYES KIJELÖLÉS: HÁNY CSOPORT, HÁNY AKTÍV GOMB
// ══════════════════════════════════════════════════════════════════════════
cim('4. VIZSGÁLAT — vegyes kijelölés SZÁMOKBAN');
sor('mérés', 'érték', 'megjegyzés');

const s4 = ujSim(240);
{
  const p = s4._jarhatoKozel(s4.egysegek.px[0] + 3, s4.egysegek.py[0] + 3);
  s4.egysegKepez(p.x, p.y, TIPUS.EGYEDI, 0);
}
const m4 = A.ujModell(s4.maxEgyseg);
const mind0 = mindenEgyseg(s4, 0);
A.kijelolesAdat(s4, { egysegek: mind0, db: mind0.length, epulet: -1, csapat: 0 }, m4);

// Kézzel újraszámolt igazság — a panel NEM lehet a saját tanúja.
const kezi = new Map();
let keziHp = 0, keziMax = 0;
for (const i of mind0) {
  const t = s4.egysegek.tipus[i];
  kezi.set(t, (kezi.get(t) || 0) + 1);
  keziHp += s4.harc.hp[i];
  keziMax += s4.harc.maxHp[i];
}

sor('kijelölt egység', m4.db, 'kézzel: ' + mind0.length);
gat(m4.db === mind0.length, 'A PANEL MÁS DARABSZÁMOT MOND, MINT A SIM.',
  'panel ' + m4.db + ', kézzel ' + mind0.length);

sor('TÍPUS-CSOPORT', m4.csoportDb, 'kézzel: ' + kezi.size);
gat(m4.csoportDb === kezi.size, 'A CSOPORTOK SZÁMA NEM EGYEZIK.',
  'panel ' + m4.csoportDb + ', kézzel ' + kezi.size);
gat(m4.csoportDb >= 4, 'A VEGYES KIJELÖLÉS NEM ADOTT LEGALÁBB NÉGY FEGYVERNEMET.',
  'Ha csak egy-két csoport van, a csempe-logika érdemben nincs is járatva. '
  + 'kapott: ' + m4.csoportDb);

for (let c = 0; c < m4.csoportDb; c++) {
  const g = m4.csoportok[c];
  const kell = kezi.get(g.tipus) || 0;
  sor('  ' + g.nev, g.db + ' db', 'kézzel ' + kell + ' · hp ' + g.hp + '/' + g.maxHp
    + ' (' + g.hpSzaz + ' %)' + (g.db === kell ? '' : '   ⛔'));
  gat(g.db === kell, 'A(Z) „' + g.nev + '" CSOPORT DARABSZÁMA HIBÁS.',
    'panel ' + g.db + ', kézzel ' + kell);
  // Az al-kijelölés tényleg AZOKAT az indexeket adja?
  const idk = A.csoportIndexek(m4, c);
  let rossz = 0;
  for (const i of idk) if (s4.egysegek.tipus[i] !== g.tipus) rossz++;
  gat(idk.length === kell && rossz === 0,
    'AZ AL-KIJELÖLÉS ROSSZ INDEXEKET AD A(Z) „' + g.nev + '" CSOPORTRA.',
    'hossz ' + idk.length + ' (' + kell + ' kellene), idegen típus: ' + rossz
    + ' — ez pont az a hiba, ami a típus-tömb helyben cserélgetéséből jönne.');
}

sor('összesített életerő', m4.hp + ' / ' + m4.maxHp, 'kézzel: ' + keziHp + ' / ' + keziMax);
gat(m4.hp === keziHp && m4.maxHp === keziMax, 'AZ ÖSSZESÍTETT ÉLETERŐ NEM EGYEZIK.',
  'panel ' + m4.hp + '/' + m4.maxHp + ', kézzel ' + keziHp + '/' + keziMax);

const aktiv4 = m4.gombok.filter((g) => g.aktiv).length;
sor('AKTÍV GOMB', aktiv4 + ' / ' + A.GOMB_DB,
  m4.gombok.map((g) => g.billentyu + (g.aktiv ? '+' : '−')).join(' '));
gat(aktiv4 >= 5, 'VEGYES KIJELÖLÉS MELLETT NEM AKTÍV AZ ÖT PARANCS-GOMB.',
  'aktív: ' + aktiv4 + ' — az állj/tartás/támadó/állás/alakzat mindegyikének '
  + 'élnie kell, amint van kijelölés.');
sor('állás gomb értéke', m4.gombok[A.GOMB_ALLAS].ertek, '');
sor('alakzat gomb értéke', m4.gombok[A.GOMB_ALAKZAT].ertek, '');
gat(m4.gombok[A.GOMB_ALLAS].ertek !== '—' && m4.gombok[A.GOMB_ALAKZAT].ertek !== '—',
  'AZ ÁLLÁS/ALAKZAT GOMB NEM MUTATJA A JELENLEGI ÉRTÉKET.');

// Az állás-gomb TÉNYLEG a simből olvas? Adjunk be egy állás-parancsot.
{
  const elozo = m4.gombok[A.GOMB_ALLAS].ertek;
  s4.parancs({ fajta: 'allas', egysegek: mind0.slice(), allas: ALLAS.VEDEKEZO });
  for (let k = 0; k < 4; k++) s4.lep();
  A.kijelolesAdat(s4, { egysegek: mind0, db: mind0.length, epulet: -1, csapat: 0 }, m4);
  const most = m4.gombok[A.GOMB_ALLAS].ertek;
  sor('állás parancs után', most, 'előtte: ' + elozo);
  gat(most === 'védekező', 'AZ ÁLLÁS-GOMB NEM KÖVETI A PARANCS-SORT.',
    'A panel a `parancsAllapot.allas`-t olvassa; ha nem mozdul, a felirat '
    + 'kitalált, nem mért. kapott: "' + most + '"');
}

// ══════════════════════════════════════════════════════════════════════════
// 5. VIZSGÁLAT — TÉTLEN PARASZT: EGYEZIK-E, ÉS MOZDUL-E
// ══════════════════════════════════════════════════════════════════════════
cim('5. VIZSGÁLAT — tétlen-paraszt gomb (a panel egyetlen magától szóló eleme)');
sor('mérés', 'panel', 'sim / megjegyzés');

const s5 = ujSim(240);
const m5 = A.ujModell(s5.maxEgyseg);
A.kijelolesAdat(s5, { egysegek: [], db: 0, epulet: -1, csapat: 0 }, m5);
const mu5 = s5.munkasok.osszesites(0);

sor('paraszt összesen', m5.munkasDb, mu5.db);
sor('TÉTLEN paraszt', m5.tetlenDb, mu5.tetlen);
gat(Number.isFinite(m5.tetlenDb), 'A `munkas.osszesites()` NEM AD `tetlen` MEZŐT.',
  'A v0.16-ban került bele. `NaN` jött vissza — a panel „?"-et írna ki, '
  + 'és a gomb sosem gyulladna ki.');
gat(m5.tetlenDb === mu5.tetlen && m5.munkasDb === mu5.db,
  'A PANEL TÉTLEN-SZÁMA NEM EGYEZIK A SIMÉVEL.',
  'panel ' + m5.tetlenDb + '/' + m5.munkasDb + ', sim ' + mu5.tetlen + '/' + mu5.db);
gat(mu5.db > 10, 'TÚL KEVÉS PARASZT A VIZSGÁLATHOZ.', 'kapott: ' + mu5.db);

// A gomb aktív-e, ha VAN tétlen paraszt?
sor('tétlen gomb aktív', m5.gombok[A.GOMB_TETLEN].aktiv,
  'érték: ' + m5.gombok[A.GOMB_TETLEN].ertek);
gat(m5.gombok[A.GOMB_TETLEN].aktiv === (m5.tetlenDb > 0),
  'A TÉTLEN-GOMB AKTIVITÁSA NEM KÖVETI A SZÁMOT.');

// A körbejárás LEFEDI-E az összes tétlent, és tényleg tétlenek-e?
{
  const latott = new Set();
  let k = -1;
  for (let n = 0; n < mu5.db + 5; n++) {
    k = A.kovetkezoTetlen(s5, 0, k);
    if (k < 0) break;
    if (latott.has(k)) break;
    latott.add(k);
  }
  let nemTetlen = 0;
  for (const i of latott) {
    if (s5.egysegek.tipus[i] !== TIPUS.MUNKAS || s5.munkasok.allapot[i] !== MUNKA.NINCS) nemTetlen++;
  }
  sor('körbejárás lefedte', latott.size, 'tétlen: ' + m5.tetlenDb
    + ' · nem tétlen köztük: ' + nemTetlen);
  gat(latott.size === m5.tetlenDb, 'A KÖRBEJÁRÁS NEM ÉRI EL AZ ÖSSZES TÉTLEN PARASZTOT.',
    'lefedett ' + latott.size + ', tétlen ' + m5.tetlenDb + ' — a gomb ismételt '
    + 'nyomkodásával minden ácsorgóhoz el kell jutni.');
  gat(nemTetlen === 0, 'A KÖRBEJÁRÁS DOLGOZÓ PARASZTRA IS RÁUGRIK.',
    'hibás: ' + nemTetlen);
}

// ⚠️ MŰKÖDÉS-KAPU: a szám MOZDULJON. Küldjük őket gyűjteni, és nézzük meg,
// hogy a tétlenek száma tényleg lemegy. Egy panel, ami mindig ugyanazt a
// számot mondja, minden fenti gáton átment volna.
{
  const parasztok = mindenEgyseg(s5, 0).filter((i) => s5.egysegek.tipus[i] === TIPUS.MUNKAS);
  const node = s5.eroforrasok.keres(NYERS.FA, s5.egysegek.px[parasztok[0]], s5.egysegek.py[parasztok[0]], 90);
  gat(node >= 0, 'NINCS FA-LELŐHELY A KÖZELBEN — a működés-kapu nem futtatható.');
  if (node >= 0) {
    s5.parancs({
      fajta: 'gyujt', egysegek: parasztok.slice(),
      x: s5.eroforrasok.x[node], y: s5.eroforrasok.y[node], nyers: NYERS.FA,
    });
    for (let k = 0; k < 40; k++) s5.lep();
    const elotte = m5.tetlenDb;
    A.kijelolesAdat(s5, { egysegek: [], db: 0, epulet: -1, csapat: 0 }, m5);
    sor('TÉTLEN gyűjtés-parancs után', m5.tetlenDb, 'előtte: ' + elotte);
    gat(m5.tetlenDb < elotte,
      'A TÉTLEN-SZÁM NEM CSÖKKENT, PEDIG MINDEN PARASZT MUNKÁRA KAPOTT PARANCSOT.',
      'előtte ' + elotte + ', utána ' + m5.tetlenDb + ' — vagy a panel nem olvassa '
      + 'újra a simet, vagy a gyűjtés-parancs nem ért be. Egy mozdulatlan szám '
      + 'a legjobb kamuflázs: minden „nem dob kivételt" vizsgálaton átmegy.');
    gat(m5.tetlenDb === s5.munkasok.osszesites(0).tetlen,
      'A CSÖKKENÉS UTÁN SEM EGYEZIK A SIMMEL.');
  }
}

// ══════════════════════════════════════════════════════════════════════════
// 6. VIZSGÁLAT — AZ ÉPÍTÉSI-IDŐ MÁSOLAT NEM CSÚSZOTT EL
// ══════════════════════════════════════════════════════════════════════════
cim('6. VIZSGÁLAT — `EP_EPITES_IDO` másolat = az éles sim `epulHatra`-ja');
sor('épület', 'panel-tábla', 'friss `epulHatra`');

{
  const s6 = ujSim(60);
  let elteres = 0;
  for (let t = 0; t < EPULET_DB; t++) {
    const kx = 40 + (t % 4) * 14, ky = 100 + ((t / 4) | 0) * 14;
    const idx = epit(s6, t, kx, ky, false);
    if (idx < 0) { sor(EPULET_NEV[t], A.EP_EPITES_IDO[t], 'NEM FÉRT EL ⛔'); bukas++; continue; }
    const eles = s6.epuletek.epulHatra[idx];
    const jo = eles === A.EP_EPITES_IDO[t];
    if (!jo) elteres++;
    sor(EPULET_NEV[t], A.EP_EPITES_IDO[t], eles + (jo ? '' : '   ⛔'));
  }
  gat(elteres === 0, 'AZ ÉPÍTÉSI-IDŐ MÁSOLAT ' + elteres + ' HELYEN ELCSÚSZOTT.',
    'Az `EP_IDO` nincs exportálva a `epuletek.js`-ből, ezért a készültség-csík '
    + 'másolatból dolgozik. Ha valaki hangol egy építési időt, a csík CSENDBEN '
    + 'hazudna — ezért van itt kapu. Frissítsd az `EP_EPITES_IDO`-t.');

  // És a csík TÉNYLEG mozog-e építés közben?
  const idx = epit(s6, EPULET.LAKTANYA, 150, 150, false);
  const m6 = A.ujModell(s6.maxEgyseg);
  A.kijelolesAdat(s6, { egysegek: null, db: 0, epulet: idx, csapat: 0 }, m6);
  const sz0 = m6.ep.epitSzaz, mp0 = m6.ep.epitMp;
  for (let k = 0; k < 100; k++) s6.lep();
  A.kijelolesAdat(s6, { egysegek: null, db: 0, epulet: idx, csapat: 0 }, m6);
  sor('készültség 0 → 100 tick', sz0 + ' % → ' + m6.ep.epitSzaz + ' %',
    mp0 + ' mp → ' + m6.ep.epitMp + ' mp');
  gat(m6.ep.epitSzaz > sz0 && m6.ep.epitMp < mp0,
    'A KÉSZÜLTSÉG-CSÍK NEM MOZDUL ÉPÍTÉS KÖZBEN.',
    sz0 + ' % → ' + m6.ep.epitSzaz + ' %');
  gat(sz0 === 0, 'A FRISSEN LERAKOTT ÉPÜLET NEM 0 %-RÓL INDUL.', 'kapott: ' + sz0 + ' %');
}

// ══════════════════════════════════════════════════════════════════════════
// 7. VIZSGÁLAT — „MI FOLYIK BENNE": KÉPZÉS ÉS KUTATÁS
// ══════════════════════════════════════════════════════════════════════════
cim('7. VIZSGÁLAT — az épületben folyó képzés és kutatás LÁTSZIK-e');
sor('mérés', 'érték', 'megjegyzés');

{
  // ⚠️ SAJÁT, KICSI FELÁLLÁS — ÉS EZ NEM SZÉPÍTÉS.
  // Az első változat a közös `ujSim(60)`-nal futott: csapatonként 30 egység,
  // a központ viszont 10 népességet ad. A `Kepzes.sorba()` MINDIG elutasításba
  // futott, a sor üres maradt, és a vizsgálat úgy nézett ki, mintha a PANEL
  // nem látná a sort — holott a sim mondott nemet. (Ugyanez a csapda áll a
  // `CLAUDE.md`-ben: a v0.1 stressz-felállása mellett a v0.5 képzés-ága ki sem
  // futna.) A második változat 8 egységgel ment, de a közös felállás
  // `ostrom: 6`-ot kér, és négy egységből mind a négy ostromgép lett — az
  // pedig HÁROM népességet foglal, tehát 12 > 10, megint elutasítás.
  // Ezért itt: kevés egység, NULLA ostromgép, és két ház a plafon fölé.
  const s7 = new Sim({ seed: SEED, n: 256, maxEgyseg: 200 });
  s7.szondaFelallas(12, { munkasMinden: 3 });
  for (let f = 0; f < 4; f++) s7.gazdasag.ad(0, f, 8000);
  epit(s7, EPULET.HAZ, 50, 100, true);
  epit(s7, EPULET.HAZ, 54, 100, true);
  const lak = epit(s7, EPULET.LAKTANYA, 60, 120, true);
  const kozpont = (() => {
    for (let i = 0; i < s7.epuletek.db; i++) {
      if (s7.epuletek.csapat[i] === 0 && s7.epuletek.tipus[i] === EPULET.KOZPONT) return i;
    }
    return -1;
  })();
  gat(lak >= 0 && kozpont >= 0, 'NINCS LAKTANYA VAGY KÖZPONT A VIZSGÁLATHOZ.');

  const m7 = A.ujModell(s7.maxEgyseg);
  A.kijelolesAdat(s7, { egysegek: null, db: 0, epulet: lak, csapat: 0 }, m7);
  sor('üres laktanya sora', m7.ep.sorDb, 'képző épület: ' + m7.ep.kepzoE);
  gat(m7.ep.sorDb === 0, 'AZ ÜRES SOR NEM NULLA.');
  gat(m7.ep.kepzoE === true, 'A LAKTANYÁRÓL NEM DERÜL KI, HOGY KÉPZŐ ÉPÜLET.');

  // Három lándzsás megrendelése.
  for (let k = 0; k < 3; k++) {
    s7.parancs({ fajta: 'kepzes', csapat: 0, epulet: lak, egyseg: TIPUS.LANDZSAS });
  }
  for (let k = 0; k < 6; k++) s7.lep();
  // Előbb azt nézzük meg, hogy a MEGRENDELÉS ment-e át. Ha nem, a panel
  // hibátlanul mutat egy üres sort, és a vizsgálat rá fogná a panelre.
  const nep = s7.gazdasag.nepessegAllapot(0, s7);
  sor('népesség / elutasított képzés', nep.foglalt + ' / ' + nep.max,
    'elutasítva: ' + s7.kepzes.elutasitva[0]);
  gat(s7.kepzes.elutasitva[0] === 0, 'A KÉPZÉS-PARANCSOT A SIM UTASÍTOTTA EL.',
    'Nem a panel a hibás: népesség ' + nep.foglalt + '/' + nep.max
    + ', elutasítva ' + s7.kepzes.elutasitva[0] + '.');
  A.kijelolesAdat(s7, { egysegek: null, db: 0, epulet: lak, csapat: 0 }, m7);
  sor('SORBAN ÁLL', m7.ep.sorDb, 'elöl: ' + m7.ep.sorNev[0]
    + ' · ' + m7.ep.kepzesSzaz + ' % · ' + m7.ep.kepzesMp + ' mp');
  gat(m7.ep.sorDb === 3, 'A KÉPZÉSI SOR NEM MUTATJA A HÁROM MEGRENDELT EGYSÉGET.',
    'kapott: ' + m7.ep.sorDb + ' — ez a „mi folyik benne" kérdés lényege.');
  gat(m7.ep.sorNev[0] === 'lándzsás', 'A SOR ELSŐ ELEMÉNEK NEVE HIBÁS.',
    'kapott: "' + m7.ep.sorNev[0] + '"');
  gat(m7.ep.kepzesMp > 0, 'A HÁTRALÉVŐ KÉPZÉSI IDŐ NULLA, PEDIG FOLYIK A KÉPZÉS.');
  gat(m7.ep.kepzesSzaz >= 0 && m7.ep.kepzesSzaz < 100,
    'A KÉPZÉS SZÁZALÉKA ÉRTELMETLEN.', 'kapott: ' + m7.ep.kepzesSzaz
    + ' % — ez a `kepzes._ido()`-ból jön; ha a metódus eltűnt, itt 0 vagy 100 áll.');

  // A százalék MOZDULJON.
  const elotte = m7.ep.kepzesSzaz;
  for (let k = 0; k < 60; k++) s7.lep();
  A.kijelolesAdat(s7, { egysegek: null, db: 0, epulet: lak, csapat: 0 }, m7);
  sor('képzés 60 tick múlva', m7.ep.kepzesSzaz + ' %', 'előtte: ' + elotte + ' %');
  gat(m7.ep.kepzesSzaz > elotte, 'A KÉPZÉSI CSÍK NEM HALAD.',
    elotte + ' % → ' + m7.ep.kepzesSzaz + ' %');

  // ── KUTATÁS a központban (ekevas) ────────────────────────────────────
  s7.parancs({ fajta: 'kutatas', csapat: 0, tech: TECH.EKEVAS, epulet: kozpont });
  for (let k = 0; k < 6; k++) s7.lep();
  A.kijelolesAdat(s7, { egysegek: null, db: 0, epulet: kozpont, csapat: 0 }, m7);
  sor('kutatás a központban', m7.ep.kutatNev || '(semmi)', m7.ep.kutatMp + ' mp');
  gat(s7.technologia.allapot[0 * TECH_DB + TECH.EKEVAS] === KUTAT.FOLYIK,
    'A KUTATÁS EL SEM INDULT — a vizsgálat nem mond semmit.');
  gat(m7.ep.kutatNev === 'ekevas', 'A PANEL NEM MUTATJA A FOLYÓ KUTATÁST.',
    'kapott: "' + m7.ep.kutatNev + '" — a `technologia.hol[]`-ból kell kiderülnie, '
    + 'hogy MELYIK épületben folyik.');
  gat(m7.ep.kutatMp > 0, 'A KUTATÁS HÁTRALÉVŐ IDEJE NULLA.');

  // A LAKTANYÁBAN viszont NEM folyik kutatás — a panel nem keverheti össze.
  A.kijelolesAdat(s7, { egysegek: null, db: 0, epulet: lak, csapat: 0 }, m7);
  sor('laktanya kutatása', m7.ep.kutatNev || '(semmi)', 'a központé nem szivároghat át');
  gat(m7.ep.kutatNev === '', 'A KUTATÁS EGY MÁSIK ÉPÜLETNÉL IS MEGJELENIK.',
    'kapott: "' + m7.ep.kutatNev + '" — a `hol[]` szűrés hiányzik.');
}

// ══════════════════════════════════════════════════════════════════════════
// 8. VIZSGÁLAT — SZABOTÁZS
// ══════════════════════════════════════════════════════════════════════════
cim('8. VIZSGÁLAT — SZABOTÁZS: hulla, szemét-index, nem létező épület, torony');
sor('szabotázs', 'eredmény', 'elvárás');

const s8 = ujSim(240);
const m8 = A.ujModell(s8.maxEgyseg);
const mind8 = mindenEgyseg(s8, 0);

// (a) HULLÁK. A halott slot a v0.4 óta MEGMARAD — aki nem szűri, hullákat
//     számol bele az életerő-csíkba.
{
  A.kijelolesAdat(s8, { egysegek: mind8, db: mind8.length, epulet: -1, csapat: 0 }, m8);
  const elotte = m8.db;
  let oltem = 0;
  for (let k = 0; k < mind8.length; k += 3) { s8.harc.elo[mind8[k]] = 0; oltem++; }
  A.kijelolesAdat(s8, { egysegek: mind8, db: mind8.length, epulet: -1, csapat: 0 }, m8);
  sor('(a) ' + oltem + ' hulla a listában', m8.db, 'kell: ' + (elotte - oltem));
  gat(m8.db === elotte - oltem, 'A PANEL HULLÁKAT IS SZÁMOL.',
    'panel ' + m8.db + ', kellene ' + (elotte - oltem));
}

// (b) SZEMÉT-INDEXEK. A kijelölés-lista kívülről jön; egy betöltés vagy egy
//     újrafelállás után elavult indexeket tarthat.
{
  const meregzett = [-1, -999, 0, 99999, s8.egysegek.db + 5, 3.7, mind8[1]];
  let dobott = null;
  try {
    A.kijelolesAdat(s8, { egysegek: meregzett, db: meregzett.length, epulet: -1, csapat: 0 }, m8);
  } catch (h) { dobott = h; }
  sor('(b) mérgezett index-lista', dobott ? 'DOBOTT ⛔' : 'túlélte',
    'db = ' + (dobott ? '?' : m8.db) + ' (csak az érvényesek)');
  gat(!dobott, 'A PANEL ELSZÁLL ÉRVÉNYTELEN KIJELÖLÉS-INDEXEN.',
    dobott ? String(dobott && dobott.message) : '');
  gat(!dobott && m8.db <= 3, 'A PANEL ÉRVÉNYTELEN INDEXEKET IS BESZÁMOLT.',
    'db = ' + m8.db);
  gat(!dobott && szemet(m8).length === 0, 'MÉRGEZETT LISTA UTÁN SZEMÉT VAN A MODELLBEN.',
    szemet(m8).join('; '));
}

// (c) NEM LÉTEZŐ ÉPÜLET.
{
  let dobott = null;
  try {
    A.kijelolesAdat(s8, { egysegek: [], db: 0, epulet: 4242, csapat: 0 }, m8);
  } catch (h) { dobott = h; }
  sor('(c) épület #4242', dobott ? 'DOBOTT ⛔' : ('fajta: ' + m8.fajta),
    'kell: ures, ep.van = false');
  gat(!dobott, 'A PANEL ELSZÁLL NEM LÉTEZŐ ÉPÜLET-INDEXEN.', String(dobott && dobott.message));
  gat(!dobott && m8.ep.van === false && m8.fajta === 'ures',
    'A NEM LÉTEZŐ ÉPÜLET MÉGIS MEGJELENIK.', 'fajta: ' + m8.fajta);
}

// (d) A KEPEZ TÁBLA KILENC HOSSZÚ — a torony és a piac nincs benne.
//     Guard nélkül `KEPEZ[9].length` AZONNAL dob: a panel egy torony
//     kijelölésekor halna meg. Pontosan az a hibafajta, amiért ez a szonda van.
{
  sor('(d) KEPEZ tábla hossza', KEPEZ.length, 'EPULET: ' + EPULET_DB + ' → rövid!');
  gat(KEPEZ.length < EPULET_DB,
    'A `KEPEZ` TÁBLA MÁR NEM RÖVID — ez a vizsgálat elavult, nézd át.',
    'KEPEZ.length = ' + KEPEZ.length);
  const s8b = ujSim(40);
  let dobott = null, torony = -1, piac = -1;
  try {
    torony = epit(s8b, EPULET.TORONY, 70, 70, true);
    piac = epit(s8b, EPULET.PIAC, 90, 70, true);
    A.kijelolesAdat(s8b, { egysegek: null, db: 0, epulet: torony, csapat: 0 }, m8);
    const t = { kepzoE: m8.ep.kepzoE, orsegMax: m8.ep.orsegMax, nev: m8.ep.nev };
    A.kijelolesAdat(s8b, { egysegek: null, db: 0, epulet: piac, csapat: 0 }, m8);
    sor('   torony / piac', t.nev + ' → ' + m8.ep.nev,
      'képző: ' + t.kepzoE + ' / ' + m8.ep.kepzoE + ' · őrség max ' + t.orsegMax);
    gat(t.kepzoE === false && m8.ep.kepzoE === false,
      'A TORONY VAGY A PIAC KÉPZŐ ÉPÜLETNEK LÁTSZIK.');
    gat(t.orsegMax === 5, 'A TORONY ŐRSÉG-KAPACITÁSA HIBÁS.', 'kapott: ' + t.orsegMax);
  } catch (h) { dobott = h; }
  gat(!dobott, 'A PANEL ELSZÁLL A `KEPEZ` TÁBLA VÉGÉN TÚLI ÉPÜLETEN (torony/piac).',
    String(dobott && dobott.message));
}

// (e) ÜRES KIJELÖLÉS — hány gomb marad aktív?
{
  const s8c = ujSim(60);
  A.kijelolesAdat(s8c, { egysegek: [], db: 0, epulet: -1, csapat: 0 }, m8);
  const aktiv = m8.gombok.filter((g) => g.aktiv).length;
  const parancsGomb = [A.GOMB_ALLJ, A.GOMB_TARTAS, A.GOMB_TAMADO, A.GOMB_ALLAS, A.GOMB_ALAKZAT]
    .filter((g) => m8.gombok[g].aktiv).length;
  sor('(e) üres kijelölés', aktiv + ' aktív gomb',
    'parancs-gomb: ' + parancsGomb + ' (kell: 0)');
  gat(parancsGomb === 0, 'ÜRES KIJELÖLÉS MELLETT IS AKTÍV EGY PARANCS-GOMB.',
    'aktív parancs-gomb: ' + parancsGomb + ' — a gomb kattintható lenne, és '
    + 'a parancs egy üres index-tömbbel menne be a sorra.');
  gat(m8.fajta === 'ures', 'ÜRES KIJELÖLÉSNÉL A FAJTA NEM `ures`.', m8.fajta);
  gat(m8.csoportDb === 0, 'ÜRES KIJELÖLÉSNÉL IS VAN CSOPORT.', String(m8.csoportDb));
}

// (f) HAMIS CSAPAT — egy másik csapat kijelölése nem eshet szét.
{
  const s8d = ujSim(60);
  const mind1 = mindenEgyseg(s8d, 1);
  let dobott = null;
  try {
    A.kijelolesAdat(s8d, { egysegek: mind1, db: mind1.length, epulet: -1, csapat: 1 }, m8);
  } catch (h) { dobott = h; }
  sor('(f) 1-es csapat kijelölése', dobott ? 'DOBOTT ⛔' : m8.db + ' egység',
    'csoport: ' + (dobott ? '?' : m8.csoportDb));
  gat(!dobott && m8.db === mind1.length, 'A MÁSIK CSAPAT KIJELÖLÉSE HIBÁS.',
    String(dobott && dobott.message));
}

// ══════════════════════════════════════════════════════════════════════════
// 9. VIZSGÁLAT — ALÁÍRÁS-FEGYELEM ÉS NULLA ALLOKÁCIÓ
// ══════════════════════════════════════════════════════════════════════════
cim('9. VIZSGÁLAT — aláírás-fegyelem (a DOM-írás ára) és a puffer-stabilitás');
sor('mérés', 'érték', 'megjegyzés');

{
  const s9 = ujSim(240);
  const m9 = A.ujModell(s9.maxEgyseg);
  const mind9 = mindenEgyseg(s9, 0);
  const v = { egysegek: mind9, db: mind9.length, epulet: -1, csapat: 0 };

  A.kijelolesAdat(s9, v, m9);
  const sz1 = m9.szerkezetJel, er1 = m9.ertekJel;
  A.kijelolesAdat(s9, v, m9);
  sor('kétszer ugyanaz', 'szerk ' + (m9.szerkezetJel === sz1) + ' / ért ' + (m9.ertekJel === er1),
    'változatlan állapot → változatlan aláírás');
  gat(m9.szerkezetJel === sz1 && m9.ertekJel === er1,
    'AZONOS ÁLLAPOTRA MÁS ALÁÍRÁS JÖTT.',
    'A panel minden képkockán újraírná a DOM-ot — pont az a költség, amiért '
    + 'a HUD annak idején mezőkre lett bontva.');

  // Egyetlen sebzés: az ÉRTÉK változzon, a SZERKEZET NE.
  s9.harc.hp[mind9[0]] -= 1;
  A.kijelolesAdat(s9, v, m9);
  sor('egy egység sebződik', 'szerk ' + (m9.szerkezetJel === sz1 ? 'változatlan' : 'VÁLTOZOTT ⛔')
    + ' / ért ' + (m9.ertekJel !== er1 ? 'változott' : 'VÁLTOZATLAN ⛔'), '');
  gat(m9.szerkezetJel === sz1, 'EGY SEBZÉS ÁTRENDEZI A SZERKEZETI ALÁÍRÁST.',
    'Ilyenkor a panel teljes DOM-újraépítést kérne — csata közben képkockánként.');
  gat(m9.ertekJel !== er1, 'EGY SEBZÉS NEM LÁTSZIK AZ ÉRTÉK-ALÁÍRÁSON.',
    'Az életerő-csík befagyna.');

  // Egy típus eltűnése: a SZERKEZET változzon.
  const t0 = m9.csoportok[0].tipus;
  for (const i of mind9) if (s9.egysegek.tipus[i] === t0) s9.harc.elo[i] = 0;
  A.kijelolesAdat(s9, v, m9);
  sor('egy fegyvernem kihal', 'csoport ' + m9.csoportDb,
    m9.szerkezetJel !== sz1 ? 'szerkezet változott' : 'VÁLTOZATLAN ⛔');
  gat(m9.szerkezetJel !== sz1, 'EGY FEGYVERNEM ELTŰNÉSE NEM VÁLTOZTATJA A SZERKEZETET.',
    'A csempe ottmaradna a képernyőn, nulla darabszámmal.');

  // PUFFER-STABILITÁS: ezer hívás után ugyanazok az objektumok és tömbök —
  // vagyis a `frissit()` nem allokál.
  const objRef = m9.tipusCsoport.map((g) => g);
  const bufRef = m9.tipusCsoport.map((g) => g.indexek);
  const gombRef = m9.gombok.map((g) => g);
  for (let k = 0; k < 1000; k++) A.kijelolesAdat(s9, v, m9);
  let vandorolt = 0;
  for (let t = 0; t < TIPUS_DB; t++) {
    if (m9.tipusCsoport[t] !== objRef[t]) vandorolt++;
    if (m9.tipusCsoport[t].indexek !== bufRef[t]) vandorolt++;
  }
  for (let g = 0; g < A.GOMB_DB; g++) if (m9.gombok[g] !== gombRef[g]) vandorolt++;
  sor('1000 hívás után', vandorolt === 0 ? 'stabil' : vandorolt + ' cserélt ⛔',
    'a modell objektumai és pufferei nem cserélődhetnek');
  gat(vandorolt === 0, 'A MODELL ÚJRA ALLOKÁL HÍVÁSONKÉNT.',
    'cserélt hivatkozás: ' + vandorolt + ' — a `frissit()` képkockánként fut, '
    + 'ez másodpercenként 60-144 szemét-adag lenne.');

  // És a TÍPUS-INDEXELÉS nem csúszhat el: a `tipusCsoport[t].tipus === t`.
  let elcsuszott = 0;
  for (let t = 0; t < TIPUS_DB; t++) if (m9.tipusCsoport[t].tipus !== t) elcsuszott++;
  gat(elcsuszott === 0, 'A TÍPUS-INDEXELT CSOPORT-TÁBLA ELCSÚSZOTT.',
    'elcsúszott: ' + elcsuszott + ' — az al-kijelölés más fegyvernemet jelölne ki, '
    + 'mint amire a játékos kattintott.');
}

// ══════════════════════════════════════════════════════════════════════════
// 10. VIZSGÁLAT — PANEL-SZERZŐDÉS ÉS CSS-EGYEZÉS (forrás-szintű)
// ══════════════════════════════════════════════════════════════════════════
//
// ⚠️ MIÉRT FORRÁS-SZINTŰ, ÉS MIÉRT NEM DOM-TESZT. A `panel_kijeloles.js`
// CSS-t importál, tehát node-ban NEM tölthető be — pont ezért van külön
// adatréteg. A panel DOM-fele viszont így kapu nélkül maradna, és a
// leggyakoribb hibája nem is logikai: egy ELGÉPELT OSZTÁLYNÉV. A `<div>`
// felépül, a szonda zöld, a panel meg formázatlan szöveghalom a képernyő
// sarkában. Ez pontosan az a „zöld kapu halott rendszer mellett", amiből ennek
// a projektnek már hat volt.
//
// Amit tehát statikusan MÉG EL LEHET KAPNI, azt itt elkapjuk: minden JS-ben
// használt osztálynévnek van CSS-szabálya, minden CSS-szabályt használ is
// valaki, minden név a saját előtagot viseli, és a panel nem nyúl se a
// gyökerén kívülre, se a sim állapotába.
cim('10. VIZSGÁLAT — panel-szerződés és CSS-egyezés (forrás-szintű)');
sor('mérés', 'érték', 'megjegyzés');

{
  const { readFileSync } = await import('node:fs');
  const jsSzoveg = readFileSync(join(GYOKER, 'src', 'ui', 'panel_kijeloles.js'), 'utf8');
  const cssSzoveg = readFileSync(join(GYOKER, 'src', 'ui', 'panel_kijeloles.css'), 'utf8');
  const ELOTAG = 'aoc-kijeloles';

  // ── PANEL export ──────────────────────────────────────────────────
  const panelSor = /export const PANEL = \{([^}]*)\}/.exec(jsSzoveg);
  const hely = panelSor && /hely:\s*'([a-z_]+)'/.exec(panelSor[1]);
  const nev = panelSor && /nev:\s*'([a-z_]+)'/.exec(panelSor[1]);
  sor('PANEL export', nev ? nev[1] : 'HIÁNYZIK ⛔', hely ? hely[1] : '');
  gat(!!panelSor, 'NINCS `export const PANEL` — a HUD-váz nem tudja felmountolni.');
  gat(nev && nev[1] === 'kijeloles', 'A PANEL NEVE NEM `kijeloles`.');
  gat(hely && hely[1] === 'also_bal', 'A PANEL HELYE NEM `also_bal`.',
    'kapott: ' + (hely ? hely[1] : '—'));
  for (const m of ['frissit(', 'bont()', 'set enabled(']) {
    gat(jsSzoveg.includes(m), 'A PANEL-SZERZŐDÉSBŐL HIÁNYZIK: `' + m + '`.');
  }
  gat(/export class PanelKijeloles/.test(jsSzoveg), 'NINCS `PanelKijeloles` OSZTÁLY.');

  // ── Osztálynevek: JS ↔ CSS ────────────────────────────────────────
  const jsOszt = new Set((jsSzoveg.match(/'aoc-[a-z0-9-]+'/g) || [])
    .map((s) => s.slice(1, -1)));
  const cssOszt = new Set((cssSzoveg.match(/\.aoc-[a-z0-9-]+/g) || [])
    .map((s) => s.slice(1)));

  const nincsStilus = [...jsOszt].filter((c) => !cssOszt.has(c));
  const holtSzabaly = [...cssOszt].filter((c) => !jsOszt.has(c));
  sor('osztálynév JS-ben', jsOszt.size, [...jsOszt].join(' '));
  sor('osztálynév CSS-ben', cssOszt.size,
    nincsStilus.length + ' stílus nélkül · ' + holtSzabaly.length + ' holt szabály');
  gat(nincsStilus.length === 0, 'VAN JS-BEN HASZNÁLT OSZTÁLY, AMIRE NINCS CSS-SZABÁLY.',
    nincsStilus.join(', ') + ' — elgépelt osztálynévtől a panel formázatlan '
    + 'szöveghalommá esik szét, és semmilyen logikai vizsgálat nem szól érte.');
  gat(holtSzabaly.length === 0, 'VAN CSS-SZABÁLY, AMIT SENKI NEM HASZNÁL.',
    holtSzabaly.join(', ') + ' — vagy elgépelés, vagy egy törölt elem maradéka.');

  // ── Előtag-fegyelem (a szerződés 2. kikötése) ─────────────────────
  const idegen = [...jsOszt, ...cssOszt].filter((c) => !c.startsWith(ELOTAG));
  sor('idegen előtagú osztály', idegen.length, idegen.join(', ') || 'nincs');
  gat(idegen.length === 0, 'VAN `' + ELOTAG + '-` ELŐTAG NÉLKÜLI OSZTÁLYNÉV.',
    idegen.join(', ') + ' — tizenhat párhuzamosan írt panel mellett ez '
    + 'átfestené valaki más felületét.');

  // A CSS nem szólhat bele globális elembe és más panelbe.
  const globalis = (cssSzoveg.match(/^\s*(html|body|\*|#hud|#vaszon|#minimap)[\s,{]/gm) || []);
  sor('globális CSS-szabály', globalis.length, globalis.join(' ') || 'nincs');
  gat(globalis.length === 0, 'A PANEL CSS-E GLOBÁLIS ELEMET FEST ÁT.', globalis.join(' '));

  // ── A panel nem nyúl a gyökerén kívülre ───────────────────────────
  const kifele = (jsSzoveg.match(/document\.(querySelector|getElementById|body)/g) || []);
  sor('gyökéren kívüli DOM-hívás', kifele.length, kifele.join(' ') || 'nincs');
  gat(kifele.length === 0, 'A PANEL A GYÖKERÉN KÍVÜLRE NYÚL.', kifele.join(' '));

  // ── A panel SOSEM ír sim-állapotot ────────────────────────────────
  // Ez a szerződés 1. kikötése, és a v0.8 lockstepjének előfeltétele.
  const simIras = (jsSzoveg.match(
    /sim\.(egysegek|harc|munkasok|epuletek|gazdasag|parancsAllapot|kepzes|technologia|racs)\.[A-Za-z]+\s*(\[[^\]]*\])?\s*=[^=]/g,
  ) || []);
  sor('sim-állapot írása', simIras.length, simIras.join(' ') || 'nincs');
  gat(simIras.length === 0, 'A PANEL SIM-ÁLLAPOTOT ÍR — EZ A v0.8-ON AZONNALI DESYNC.',
    simIras.join(' '));
  gat(jsSzoveg.includes('sim.parancs({'), 'A PANEL NEM AD BE EGYETLEN PARANCSOT SEM.',
    'Akkor viszont mihez a hat gomb? Minden hatás a parancs-soron megy be.');

  // Hány parancsfajtát ad be, és tényleg azokat-e?
  const fajtak = [...new Set((jsSzoveg.match(/fajta: '([a-z_]+)'/g) || [])
    .map((s) => s.slice(8, -1)))];
  sor('beadott PARANCSFAJTA', fajtak.length, fajtak.join(', '));
  for (const kell of ['allj', 'tartas', 'allas', 'alakzat']) {
    gat(fajtak.includes(kell), 'A PANEL NEM AD BE `' + kell + '` PARANCSOT.',
      'beadott fajták: ' + fajtak.join(', '));
  }
}

// ══════════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(80));
if (bukas === 0) {
  console.log('✅ KIJELÖLÉS-PANEL SZONDA: MINDEN VIZSGÁLAT RENDBEN');
  console.log('   ⚠️ Ez ADAT-kapu, nem LÁTVÁNY-kapu: a panel DOM-ja node-ban nem fut.');
  console.log('      A tördelést és a gombok kattintását böngészőben kell megnézni.');
  process.exit(0);
} else {
  console.log('⛔ KIJELÖLÉS-PANEL SZONDA: ' + bukas + ' BUKÁS');
  process.exit(1);
}
