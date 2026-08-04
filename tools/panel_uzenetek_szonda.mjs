// AGE OF THE CRYSTALS — TANÁCSADÓ-SZONDA (v0.16).
//
// ── MIÉRT VAN EZ, ÉS MIÉRT PONT ÍGY ───────────────────────────────────────
// Ez a projekt hatszor égett meg azon, hogy a zöld kapu nem működés-kapu. Egy
// TANÁCSADÓ-RÉTEGNÉL ez a csapda a lehető legélesebb: egy szabályréteg, ami
// SOHA nem szólal meg, tökéletesen zöld. Nem dob, nem allokál, nem lassít, a
// determinizmus-szonda nem is látja, a build lefordítja. És pontosan olyan
// használhatatlan, mint a jelenlegi néma játék.
//
// Ezért ez a szonda nem azt méri, hogy a kód lefut, hanem hogy MIT MOND EGY
// VALÓDI MECCSEN. Öt forgatókönyvet játszik végig a `src/ui/meccs.js`
// `meccsSim()`-jével — ugyanazzal a világ-építővel, amit a játék használ —,
// 12 000 ticket léptet mindegyikben, és SZÁMOKAT követel:
//
//   1. MEGSZÓLAL-E EGYÁLTALÁN. Szabályonként: hányszor állt fenn a feltétel,
//      hányszor jutott ki üzenet, hányszor nyomta el a zár.
//   2. LEFEDETTSÉG: mind a 15 szabály elsül legalább egy forgatókönyvben.
//      Egyetlen soha meg nem szólaló szabály sem maradhat a fájlban — az
//      halott kód, ami zölden hazudik.
//   3. NINCS SZEMÉT A MONDATBAN: se `undefined`, se `NaN`, se `[object`, se a
//      korábban használt `a(z)` mankó (abból „a(z) laktanyaad" lett).
//   4. AZ ELNYOMÁS TÉNYLEG VÁG: a folyamatos bajoknál az elnyomás aránya
//      magas, két azonos kulcsú üzenet között betartott az időzár, és egyetlen
//      kiértékelésből sem megy ki a keretnél több.
//   5. ⚠️ SZABOTÁZS — A NÉMA SZABÁLY TÉNYLEG NÉMA. Ugyanaz a meccs, de a
//      játékos MINDEN parasztjának ad munkát és épít elég házat. A
//      `tetlen_paraszt` és a `nep_korlat` feltétele ilyenkor NULLASZOR állhat
//      fenn. Enélkül az 1. vizsgálat nem bizonyítana semmit: egy szabály, ami
//      MINDIG szól, ugyanolyan haszontalan, mint amelyik soha.
//   6. A KATTINTHATÓ ÜZENET KOORDINÁTÁJA a pályán belül van — a kamera-ugrás
//      különben a semmibe vinne.
//   7. ⚠️ A RÉTEG NEM ÍR A SIMBE. Ugyanaz a meccs a szabályréteggel és
//      nélküle: az `allapotHash()` 12 000 tick után bitre egyezik. Ez a
//      determinizmus-kockázat egyetlen érvényes cáfolata.
//
// HASZNÁLAT:  npm run p:uzenetek
// Kilépési kód: 0 = rendben, 1 = bukás.

import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const GYOKER = dirname(dirname(fileURLToPath(import.meta.url)));
const be = (...r) => import(pathToFileURL(join(GYOKER, ...r)).href);

const { meccsSim, szondaKonfig, MECCS_ADAG } = await be('src', 'ui', 'meccs.js');
const { UzenetSzabalyok, SZABALY, SZABALY_NEV, SZABALY_DB, FAJTA } =
  await be('src', 'ui', 'panel_uzenetek_adat.js');
const { EPULET, EP_AR, EP_MERET } = await be('src', 'sim', 'epuletek.js');
const { TIPUS } = await be('src', 'sim', 'units.js');
const { MUNKA } = await be('src', 'sim', 'munkas.js');
const { NYERS } = await be('src', 'sim', 'eroforras.js');
const { TECH } = await be('src', 'sim', 'technologia.js');

let bukas = 0;
const sor = (a, b, c) => console.log('  ' + String(a).padEnd(26) + String(b).padStart(10) + '   ' + (c ?? ''));
const cim = (t) => console.log('\n' + t + '\n' + '─'.repeat(84));
const gat = (all, szoveg, reszlet) => {
  if (all) return true;
  console.log('\n  ⛔ ' + szoveg);
  if (reszlet) console.log('     ' + reszlet);
  bukas++;
  return false;
};

const TICKEK = 12000;

// ── FORGATÓKÖNYV-MOTOR ─────────────────────────────────────────────────────

/**
 * Egy meccs végigjátszása a szabályréteggel.
 *
 * ⚠️ A RÉTEG A `lep()` UTÁN FRISSÜL, MINDEN TICKEN. A játékban a HUD hívja
 * képkockánként — ott a `frissit()` első sora úgyis kiszáll, ha nem telt le a
 * kiértékelési köz. Ha itt ritkábban hívnánk, a szonda egy MÁSIK ütemet mérne,
 * mint ami éles fut, és pont az elnyomás számai csúsznának el.
 */
function jatszik(nev, { csapat = 0, vezerlo = null, tickek = TICKEK, gepiEllenfel = true } = {}) {
  const konfig = szondaKonfig();
  const adag = { ...MECCS_ADAG, gepiEllenfel };
  const r = meccsSim(konfig, adag);
  if (!r.ok) throw new Error(nev + ': a meccs nem épült fel — ' + JSON.stringify(r.hibak));
  const sim = r.sim;
  const sz = new UzenetSzabalyok(sim, { sajatCsapat: csapat });
  const uzenetek = [];
  /** Kiértékelésenként hány üzenet ment ki — a keret ellenőrzéséhez. */
  let keretCsucs = 0;

  for (let t = 0; t < tickek; t++) {
    if (vezerlo) vezerlo(sim, t, csapat);
    sim.lep();
    const uj = sz.frissit(sim.tick);
    if (uj > keretCsucs) keretCsucs = uj;
    for (let k = sz.kiadott - uj; k < sz.kiadott; k++) {
      const u = sz.uzenet(k);
      uzenetek.push({
        tick: u.tick, szabaly: u.szabaly, nev: u.szabalyNev, fajta: u.fajta,
        szoveg: u.szoveg, x: u.x, y: u.y, ugorhato: u.ugorhato, kulcs: u.kulcs,
      });
    }
  }
  return { nev, sim, sz, uzenetek, keretCsucs, csapat };
}

/** Szabályonkénti darabszám egy futásból. */
function szabalyonkent(futas) {
  const db = new Int32Array(SZABALY_DB);
  for (const u of futas.uzenetek) db[u.szabaly]++;
  return db;
}

// ── JÁTÉKOS-VEZÉRLŐK ───────────────────────────────────────────────────────

/** Szabad épület-hely spirálban a központ körül. `null`, ha nincs. */
function epitHely(sim, tipus, cx, cy) {
  const m = EP_MERET[tipus];
  for (let r = 4; r < 26; r += 2) {
    for (let a = 0; a < 16; a++) {
      // Nyolc irány, két gyűrűvel — egyszerű, és a szondának bőven elég.
      const dx = ((a % 4) - 1.5) * r * 0.7;
      const dy = (((a / 4) | 0) - 1.5) * r * 0.7;
      const x = (cx + dx) | 0, y = (cy + dy) | 0;
      if (sim.epuletek.lerakhato(tipus, x - (m >> 1), y - (m >> 1))) return { x, y };
    }
  }
  return null;
}

/** A csapat első élő központja. */
function kozpont(sim, cs) {
  const ep = sim.epuletek;
  for (let i = 0; i < ep.db; i++) {
    if (ep.csapat[i] === cs && ep.elo[i] && ep.tipus[i] === EPULET.KOZPONT) return i;
  }
  return -1;
}

/** Egy csapat kész épülete adott típusból. */
function keszEpulet(sim, cs, tipus) {
  const ep = sim.epuletek;
  for (let i = 0; i < ep.db; i++) {
    if (ep.csapat[i] === cs && ep.kesz(i) && ep.tipus[i] === tipus) return i;
  }
  return -1;
}

/** A tétlen parasztok indexei — újrahasznált tömb. */
const _tetlenek = [];
function tetlenParasztok(sim, cs) {
  const e = sim.egysegek;
  _tetlenek.length = 0;
  for (let i = 0; i < e.db; i++) {
    if (e.csapat[i] !== cs || e.tipus[i] !== TIPUS.MUNKAS) continue;
    if (!sim.harc.elo[i]) continue;
    if (sim.munkasok.allapot[i] === MUNKA.NINCS) _tetlenek.push(i);
  }
  return _tetlenek;
}

/** A legközelebbi lelőhely egy fajtából a központhoz. */
function lelohely(sim, cs, fajta) {
  const k = kozpont(sim, cs);
  if (k < 0) return null;
  const ef = sim.eroforrasok;
  const i = ef.keres(fajta, sim.epuletek.x[k], sim.epuletek.y[k], 70);
  return i < 0 ? null : { x: ef.x[i], y: ef.y[i] };
}

/**
 * „GONDOS JÁTÉKOS" — a tétleneket munkába állítja, házat és laktanyát épít,
 * parasztot képez, kutat, korszakot vált. Ez járatja meg a POZITÍV
 * (`info`) szabályokat, amiket a tehetetlen játékos sosem érne el.
 */
function gondosJatekos(sim, t, cs) {
  if (t % 40 !== 0) return;
  const g = sim.gazdasag;
  const o = cs * 4;
  const k = kozpont(sim, cs);
  if (k < 0) return;

  // 1. TÉTLEN PARASZT → ÉTELRE, amíg nincs meg a korszakváltás ára.
  //    ⚠️ Az első változat „a legszűkösebb nyersanyagra" küldött, és ettől a
  //    négy paraszt négyfelé szóródott: a kristály 400-ra hízott, az étel
  //    viszont sosem érte el az 500-at, tehát a KORSZAK-szabályok soha nem
  //    sültek el, és a szonda 2. vizsgálata joggal bukott. Egy szonda-vezérlő
  //    dolga nem a szép játék, hanem hogy a szabályok ÁLLAPOTÁT előállítsa.
  const tl = tetlenParasztok(sim, cs);
  if (tl.length) {
    const cel = g.keszlet[o + NYERS.ETEL] < 700 ? NYERS.ETEL : NYERS.FA;
    const h = lelohely(sim, cs, cel);
    if (h) sim.parancs({ fajta: 'gyujt', egysegek: tl.slice(), x: h.x, y: h.y, nyers: cel });
  }

  // 2. HÁZ, ha fogy a férőhely.
  const nep = g.nepessegAllapot(cs, sim);
  if (nep.max - nep.foglalt <= 4 && g.keszlet[o + NYERS.FA] >= EP_AR[EPULET.HAZ][NYERS.FA]) {
    const h = epitHely(sim, EPULET.HAZ, sim.epuletek.x[k], sim.epuletek.y[k]);
    if (h) sim.parancs({ fajta: 'epit', csapat: cs, tipus: EPULET.HAZ, x: h.x, y: h.y });
  }

  // 3. LAKTANYA, ha még nincs.
  if (keszEpulet(sim, cs, EPULET.LAKTANYA) < 0
    && g.keszlet[o + NYERS.FA] >= EP_AR[EPULET.LAKTANYA][NYERS.FA] + 60) {
    const h = epitHely(sim, EPULET.LAKTANYA, sim.epuletek.x[k], sim.epuletek.y[k]);
    if (h) sim.parancs({ fajta: 'epit', csapat: cs, tipus: EPULET.LAKTANYA, x: h.x, y: h.y });
  }

  // 4. PARASZT-KÉPZÉS a központból.
  if (g.keszlet[o + NYERS.ETEL] >= 120 && nep.foglalt < nep.max && sim.kepzes.sorDb[k] < 3) {
    sim.parancs({ fajta: 'kepzes', csapat: cs, epulet: k, egyseg: TIPUS.MUNKAS });
  }

  // 5. KUTATÁS — ekevas a központban, kovácsolás a laktanyában.
  if (g.keszlet[o + NYERS.ETEL] >= 220 && g.keszlet[o + NYERS.FA] >= 100) {
    sim.parancs({ fajta: 'kutatas', csapat: cs, tech: TECH.EKEVAS, epulet: k });
  }
  const lak = keszEpulet(sim, cs, EPULET.LAKTANYA);
  if (lak >= 0 && g.keszlet[o + NYERS.FA] >= 160 && g.keszlet[o + NYERS.KO] >= 60) {
    sim.parancs({ fajta: 'kutatas', csapat: cs, tech: TECH.KOVACSOLAS, epulet: lak });
    sim.parancs({ fajta: 'kepzes', csapat: cs, epulet: lak, egyseg: TIPUS.LANDZSAS });
  }

  // 6. KORSZAKVÁLTÁS.
  if (g.keszlet[o + NYERS.ETEL] >= 520) sim.parancs({ fajta: 'korszak', csapat: cs });
}

/**
 * SZABOTÁZS-VEZÉRLŐ: mindenkinek MUNKÁT ad, és bőven épít házat.
 *
 * Ez a `tetlen_paraszt` és a `nep_korlat` cáfolata. Ha a réteg helyes, ebben a
 * futásban EGYSZER SEM állhat fenn a feltételük — nem elég, hogy „nem szólal
 * meg", mert azt az időzár is okozhatná.
 */
function szorgosJatekos(sim, t, cs) {
  if (t % 60 !== 0) return;
  const g = sim.gazdasag;
  const o = cs * 4;
  const k = kozpont(sim, cs);
  if (k < 0) return;
  const tl = tetlenParasztok(sim, cs);
  if (tl.length) {
    let cel = NYERS.ETEL, min = Infinity;
    for (let f = 0; f < 4; f++) if (g.keszlet[o + f] < min) { min = g.keszlet[o + f]; cel = f; }
    const h = lelohely(sim, cs, cel);
    if (h) sim.parancs({ fajta: 'gyujt', egysegek: tl.slice(), x: h.x, y: h.y, nyers: cel });
  }
  // A férőhelyet MINDIG négy fölött tartjuk — a `nep_korlat` „majdnem tele"
  // ága 2-nél szól, tehát ez tartalékkal a küszöb alatt marad.
  const nep = g.nepessegAllapot(cs, sim);
  if (nep.max - nep.foglalt <= 6 && g.keszlet[o + NYERS.FA] >= EP_AR[EPULET.HAZ][NYERS.FA]) {
    const h = epitHely(sim, EPULET.HAZ, sim.epuletek.x[k], sim.epuletek.y[k]);
    if (h) sim.parancs({ fajta: 'epit', csapat: cs, tipus: EPULET.HAZ, x: h.x, y: h.y });
  }
}

// ── A FUTÁSOK ──────────────────────────────────────────────────────────────

cim('AGE OF THE CRYSTALS — TANÁCSADÓ-SZONDA (v0.16)');
console.log('  ' + TICKEK + ' tick (' + (TICKEK / 20) + ' mp) forgatókönyvenként, valódi `meccsSim()` világon.');

const futasok = [
  jatszik('A — tehetetlen játékos (cs0)', { csapat: 0 }),
  jatszik('B — gépi birodalom (cs1)', { csapat: 1 }),
  jatszik('C — gondos játékos (cs0)', { csapat: 0, vezerlo: gondosJatekos }),
];
const szabotazs = jatszik('D — SZABOTÁZS: mindenki dolgozik', { csapat: 0, vezerlo: szorgosJatekos });

// ── 1. VIZSGÁLAT — MEGSZÓLAL-E EGYÁLTALÁN ─────────────────────────────────
cim('1. VIZSGÁLAT — megszólal-e a réteg egy VALÓDI meccsen');

const osszDb = new Int32Array(SZABALY_DB);
for (const f of futasok) {
  const db = szabalyonkent(f);
  for (let s = 0; s < SZABALY_DB; s++) osszDb[s] += db[s];
  console.log('\n  ' + f.nev + '  ·  ' + f.uzenetek.length + ' üzenet · '
    + f.sz.ertekelesek + ' kiértékelés');
  sor('szabály', 'kiadva', 'feltétel / elnyomva');
  for (let s = 0; s < SZABALY_DB; s++) {
    const st = f.sz.statisztika(s);
    if (st.feltetel === 0 && st.sult === 0) continue;
    sor(st.nev, st.sult, st.feltetel + ' / ' + st.elnyomott + '   [' + st.fajta + ']');
  }
  gat(f.uzenetek.length > 0, 'A(Z) „' + f.nev + '" FUTÁSBAN EGYETLEN ÜZENET SEM SZÜLETETT.',
    'Egy tanácsadó, ami egy teljes meccs alatt hallgat, pontosan olyan '
    + 'használhatatlan, mint a mostani néma játék.');
}

// ── 2. VIZSGÁLAT — LEFEDETTSÉG ────────────────────────────────────────────
cim('2. VIZSGÁLAT — mind a ' + SZABALY_DB + ' szabály elsül legalább egyszer');
const nemaSzabalyok = [];
for (let s = 0; s < SZABALY_DB; s++) {
  sor(SZABALY_NEV[s], osszDb[s], osszDb[s] > 0 ? '' : '⛔ SOHA NEM SZÓLALT MEG');
  if (osszDb[s] === 0) nemaSzabalyok.push(SZABALY_NEV[s]);
}
gat(nemaSzabalyok.length === 0,
  nemaSzabalyok.length + ' SZABÁLY SOHA NEM SZÓLALT MEG: ' + nemaSzabalyok.join(', '),
  'Halott kód, ami zölden hazudik: a küszöbe elérhetetlen, vagy az állapot, '
  + 'amit figyel, sosem áll elő. Vagy a küszöb rossz, vagy a szabály fölösleges.');

// ── 3. VIZSGÁLAT — NINCS SZEMÉT A MONDATBAN ───────────────────────────────
cim('3. VIZSGÁLAT — nincs `undefined`, `NaN` és ragasztott toldalék a szövegben');
const TILTOTT = ['undefined', 'NaN', 'null', '[object', 'Infinity', 'a(z)', 'A(z)'];
let szemetes = 0, mondatDb = 0;
const kulonMondat = new Set();
for (const f of [...futasok, szabotazs]) {
  for (const u of f.uzenetek) {
    mondatDb++;
    kulonMondat.add(u.szoveg);
    for (const tilt of TILTOTT) {
      if (u.szoveg.indexOf(tilt) >= 0) {
        szemetes++;
        console.log('    ⛔ [' + u.nev + '] „' + u.szoveg + '"');
        break;
      }
    }
    if (!u.szoveg.length || u.szoveg.length < 20) {
      szemetes++;
      console.log('    ⛔ csonka mondat [' + u.nev + '] „' + u.szoveg + '"');
    }
    if (u.fajta !== FAJTA.INFO && u.fajta !== FAJTA.FIGYELEM && u.fajta !== FAJTA.BAJ) {
      szemetes++;
      console.log('    ⛔ ismeretlen fajta [' + u.nev + '] „' + u.fajta + '"');
    }
  }
}
sor('mondat összesen', mondatDb, kulonMondat.size + ' különböző');
sor('szemetes mondat', szemetes, szemetes === 0 ? 'tiszta' : '⛔');
gat(szemetes === 0, szemetes + ' MONDAT HIBÁS.',
  'Egy `undefined` vagy egy „a(z) laktanyaad" a képernyőn többet ront, mint '
  + 'amennyit az üzenet használ.');
// A számok nélküli mondat a TELEPESEK-mérce bukása: „figyelem, baj van" nem
// megfigyelés. Minden mondatban legyen legalább egy szám.
let szamtalan = 0;
for (const s of kulonMondat) {
  if (/\d/.test(s)) continue;
  szamtalan++;
  console.log('    ⛔ szám nélkül: „' + s + '"');
}
sor('szám nélküli mondat', szamtalan, szamtalan === 0 ? 'mind konkrét' : '⛔');
gat(szamtalan === 0, szamtalan + ' MONDATBAN NINCS EGYETLEN SZÁM SEM.',
  'A mérce a TELEPESEK: „a pékség az idő 79%-ában liszt hiányában állt". '
  + 'Szám nélkül ez csak riasztás, nem megfigyelés.');

// ── 4. VIZSGÁLAT — AZ ELNYOMÁS VÁG ────────────────────────────────────────
cim('4. VIZSGÁLAT — az elnyomás tényleg vág (időzár + keret)');

// (a) A tartós bajoknál az elnyomás aránya magas kell legyen.
const TARTOS = [SZABALY.TETLEN_PARASZT, SZABALY.NEP_KORLAT, SZABALY.URES_KEPZO];
for (const s of TARTOS) {
  let felt = 0, sult = 0;
  for (const f of futasok) { felt += f.sz.feltetel[s]; sult += f.sz.sult[s]; }
  if (felt === 0) continue;
  const arany = ((felt - sult) * 100 / felt) | 0;
  sor(SZABALY_NEV[s], arany + ' %', 'elnyomva (' + sult + ' / ' + felt + ' kiértékelésből)');
  gat(arany >= 80, 'A(Z) `' + SZABALY_NEV[s] + '` ELNYOMÁSA GYENGE: ' + arany + ' %.',
    'Egy tartósan fennálló baj kiértékelésenként egyszer, tehát másodpercenként '
    + 'szólalna meg. ' + felt + ' fennállásból ' + sult + ' üzenet lett — ez spam.');
}

// (b) Két azonos ZÁRKULCSÚ üzenet között betartott-e a zár. A kulcsot az
//     üzenet hozza magával — a helykoordinátából képzett kulcs hamisan
//     bukna, mert két különböző nyersanyag panasza is a központra mutat.
let zarSertes = 0, kulcsPar = 0;
for (const f of [...futasok, szabotazs]) {
  const utolso = new Map();
  for (const u of f.uzenetek) {
    const e = utolso.get(u.kulcs);
    // A legrövidebb zár a táblában 40 tick; ennél közelebb két azonos kulcsú
    // üzenet nem eshet.
    if (e !== undefined) {
      kulcsPar++;
      if (u.tick - e < 40) {
        zarSertes++;
        console.log('    ⛔ [' + u.nev + '] ' + (u.tick - e) + ' tick a előzőhöz képest');
      }
    }
    utolso.set(u.kulcs, u.tick);
  }
}
sor('azonos kulcsú ismétlés', kulcsPar, 'ennyi párt vizsgáltunk');
sor('zársértés', zarSertes, zarSertes === 0 ? 'nincs' : '⛔');
gat(kulcsPar > 0, 'EGYETLEN ÜZENET SEM ISMÉTLŐDÖTT — a zárnak nem volt mit fognia.',
  'Ha minden kulcs csak egyszer szólal meg, ez a vizsgálat üres: az elnyomás '
  + 'nem bizonyított, csak nem cáfolt.');
gat(zarSertes === 0, zarSertes + ' AZONOS KULCSÚ ÜZENET ESETT A ZÁRON BELÜLRE.');

// (c) Kiértékelésenkénti keret.
for (const f of [...futasok, szabotazs]) {
  sor(f.nev.slice(0, 24), f.keretCsucs, 'üzenet / kiértékelés (keret: ' + f.sz.egyszerreMax + ')');
  gat(f.keretCsucs <= f.sz.egyszerreMax,
    'A KERET ÁTSZAKADT: ' + f.keretCsucs + ' üzenet ment ki egy kiértékelésből.');
}

// ── 5. VIZSGÁLAT — SZABOTÁZS ──────────────────────────────────────────────
cim('5. VIZSGÁLAT — SZABOTÁZS: a néma szabály tényleg néma');
console.log('  Ugyanaz a meccs, de a játékos minden parasztjának ad munkát és házat épít.');

const tehetetlen = futasok[0].sz;
const dolgos = szabotazs.sz;
for (const s of [SZABALY.TETLEN_PARASZT, SZABALY.NEP_KORLAT]) {
  sor(SZABALY_NEV[s] + ' (tehetetlen)', tehetetlen.sult[s],
    'feltétel ' + tehetetlen.feltetel[s] + '-szor állt fenn');
  sor(SZABALY_NEV[s] + ' (szorgos)', dolgos.sult[s],
    'feltétel ' + dolgos.feltetel[s] + '-szor állt fenn');
  gat(tehetetlen.feltetel[s] > 0,
    'A(Z) `' + SZABALY_NEV[s] + '` A TEHETETLEN JÁTÉKOSNÁL SEM SZÓLALT MEG.');
}
// (a) A TÉTLEN PARASZT: NULLA. Aki mindenkinek munkát ad, egyetlen ilyen
//     mondatot sem kaphat — itt nincs helye ráhagyásnak.
gat(dolgos.feltetel[SZABALY.TETLEN_PARASZT] === 0,
  'A `tetlen_paraszt` A SZABOTÁZS-FUTÁSBAN IS FENNÁLLT ('
  + dolgos.feltetel[SZABALY.TETLEN_PARASZT] + '-szor).',
  'Minden paraszt dolgozik — ha a szabály ilyenkor is szól, akkor nem az '
  + 'állapotot figyeli, hanem a levegőbe beszél. Ez a vizsgálat az, ami az '
  + '1. vizsgálatot bizonyítékká teszi.');

// (b) A NÉPESSÉG: a KEMÉNY ág (`Tele a népesség`) nulla, az előrejelző ág
//     ARÁNYA elenyésző.
//     ⚠️ MIÉRT NEM NULLA AZ ELŐREJELZŐ ÁG IS. A meccs 8 / 10 népességgel INDUL,
//     a ház pedig 100 tickig épül — az első másodpercekben tehát TÉNYLEG két
//     hely van hátra, és a réteg igazat mond. Ha itt nullát követelnénk, a
//     szonda a helyes viselkedést buktatná meg. Amit meg kell követelni: a
//     KEMÉNY blokk (nem születik több egység) soha ne álljon elő, és a
//     figyelmeztetés nagyságrenddel ritkuljon.
let kemenyBlokk = 0;
for (const u of szabotazs.uzenetek) if (u.szoveg.startsWith('Tele a népesség')) kemenyBlokk++;
const nepArany = tehetetlen.feltetel[SZABALY.NEP_KORLAT] > 0
  ? (dolgos.feltetel[SZABALY.NEP_KORLAT] * 100 / tehetetlen.feltetel[SZABALY.NEP_KORLAT])
  : 100;
sor('„Tele a népesség" (szorgos)', kemenyBlokk, kemenyBlokk === 0 ? 'soha' : '⛔');
sor('nep_korlat aránya', nepArany.toFixed(1) + ' %', 'a tehetetlen futáshoz képest');
gat(kemenyBlokk === 0, 'A SZORGOS JÁTÉKOSNÁL IS BETELT A NÉPESSÉG.',
  'Folyamatosan épült ház — ha a kemény korlát mégis előállt, a szabály nem a '
  + 'férőhelyet nézi.');
gat(nepArany <= 5, 'A `nep_korlat` A SZABOTÁZS-FUTÁSBAN IS ' + nepArany.toFixed(1)
  + ' %-ban fennállt.',
  'A házépítésnek nagyságrenddel le kell vinnie — ha nem viszi, a szabály nem '
  + 'a valós férőhelyet méri.');
sor('szabotázs-futás üzenetei', szabotazs.uzenetek.length,
  'a többi szabály ettől még dolgozik');
gat(szabotazs.uzenetek.length > 0,
  'A SZABOTÁZS-FUTÁS TELJESEN NÉMA LETT.',
  'A cél a KÉT szabály elnémítása volt, nem az egész rétegé — ha minden '
  + 'elhallgatott, a vezérlő nem a szabályt cáfolta, hanem a réteget törte el.');

// ── 6. VIZSGÁLAT — A KAMERA-UGRÁS CÉLPONTJA ───────────────────────────────
cim('6. VIZSGÁLAT — a kattintható üzenet a pályán belülre mutat');
const n = futasok[0].sim.n;
let rosszHely = 0, ugorhatoDb = 0;
for (const f of [...futasok, szabotazs]) {
  for (const u of f.uzenetek) {
    if (!u.ugorhato) continue;
    ugorhatoDb++;
    if (!(u.x >= 0 && u.x <= n && u.y >= 0 && u.y <= n)) {
      rosszHely++;
      console.log('    ⛔ [' + u.nev + '] (' + u.x + ', ' + u.y + ')');
    }
  }
}
sor('kattintható üzenet', ugorhatoDb, 'a ' + mondatDb + '-ból');
sor('pályán kívüli célpont', rosszHely, rosszHely === 0 ? 'nincs' : '⛔');
gat(ugorhatoDb > 0, 'EGYETLEN ÜZENET SEM KATTINTHATÓ.',
  'A kamera-ugrás a panel lényege — helykoordináta nélkül a lista csak napló.');
gat(rosszHely === 0, rosszHely + ' ÜZENET A PÁLYÁN KÍVÜLRE UGRATNÁ A KAMERÁT.');

// ── 7. VIZSGÁLAT — A RÉTEG NEM ÍR A SIMBE ─────────────────────────────────
cim('7. VIZSGÁLAT — a szabályréteg nem nyúl a világhoz (determinizmus)');
{
  const r = meccsSim(szondaKonfig(), MECCS_ADAG);
  const tiszta = r.sim;
  for (let t = 0; t < TICKEK; t++) tiszta.lep();
  const h1 = tiszta.allapotHash() >>> 0;
  const h2 = futasok[0].sim.allapotHash() >>> 0;
  sor('hash szabályréteg nélkül', '0x' + h1.toString(16));
  sor('hash szabályréteggel', '0x' + h2.toString(16), h1 === h2 ? 'egyezik' : '⛔ ELTÉR');
  gat(h1 === h2, 'A SZABÁLYRÉTEG MEGVÁLTOZTATTA A VILÁGOT.',
    'A tanácsadó CSAK OLVASHAT. Ha ír, az a v0.8 lockstepjén azonnali desync — '
    + 'és a leglassabban felderíthető fajtából.');
}

// ── AMIT A JÁTÉKOS LÁTNI FOG ──────────────────────────────────────────────
cim('AMIT A JÁTÉKOS LÁTNI FOG');
for (const f of futasok) {
  console.log('\n  ── ' + f.nev + ' ' + '─'.repeat(Math.max(0, 60 - f.nev.length)));
  // Szabályonként az ELSŐ üzenet — így minden hang megjelenik, nem csak a
  // leggyakoribbé.
  const latott = new Set();
  for (const u of f.uzenetek) {
    if (latott.has(u.szabaly)) continue;
    latott.add(u.szabaly);
    const jel = u.fajta === FAJTA.BAJ ? '🔴' : (u.fajta === FAJTA.FIGYELEM ? '🟡' : '🔵');
    const mp = (u.tick / 20) | 0;
    console.log('    ' + jel + ' ' + String(((mp / 60) | 0)) + ':'
      + String(mp % 60).padStart(2, '0') + '  ' + u.szoveg
      + (u.ugorhato ? '   ↪(' + (u.x | 0) + ', ' + (u.y | 0) + ')' : ''));
  }
}

// ── ÍTÉLET ────────────────────────────────────────────────────────────────
cim('ÍTÉLET');
if (bukas === 0) {
  let ossz = 0;
  for (const f of futasok) ossz += f.uzenetek.length;
  console.log('  ✅ A TANÁCSADÓ-RÉTEG MŰKÖDIK:');
  console.log('     ' + SZABALY_DB + ' szabály · mind a ' + SZABALY_DB
    + ' elsült valódi meccsen · ' + ossz + ' üzenet ' + futasok.length
    + ' forgatókönyvben · ' + kulonMondat.size + ' különböző mondat');
  console.log('     az elnyomás a tartós bajoknál 80 % fölött vág; a szabotázs-futásban a');
  console.log('     `tetlen_paraszt` feltétele NULLASZOR állt fenn, a `nep_korlat` '
    + nepArany.toFixed(1) + ' %-ra esett,');
  console.log('     és a kemény népesség-blokk egyszer sem állt elő.');
  console.log('     A világ hash-e a réteggel és nélküle bitre egyezik.');
} else {
  console.log('  ❌ ' + bukas + ' vizsgálat BUKOTT.');
}
console.log('');
process.exit(bukas === 0 ? 0 : 1);
