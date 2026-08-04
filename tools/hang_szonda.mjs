// AGE OF THE CRYSTALS — HANG-SZONDA (v0.12/1).
//
// ── MIÉRT VAN EZ EGYÁLTALÁN ───────────────────────────────────────────────
// A hangot semmilyen meglévő kapu nem őrzi. A determinizmus-szonda a
// sim-hash-eket nézi, a hang pedig szándékosan a sim-en KÍVÜL él (nem is
// szabad benne lennie) — vagyis a hash-ek attól még bitre egyeznek, hogy a
// játék néma. Az FPS-szonda a felhőben meg sem szólal (nincs GPU), és
// hangkártya sincs. A hang-réteg tehát pontosan abba a résbe esne, ahol a
// projekt már háromszor megégett: ZÖLD KAPU EGY HALOTT RENDSZER MELLETT.
//
// Ráadásul a hang hibái CSENDESEK. Egy `undefined` frekvenciától a WebAudio
// nem dob kivételt: az `OscillatorNode.frequency.value = undefined` `NaN`-t
// ad, és a csomópont NÉMÁN nem szól. Se konzol-üzenet, se akadás — csak egy
// hang hiányzik, és senki nem tudja, melyik.
//
// ── MIT MÉR — VAGYIS MI AZ A SZÁM, AMI ELÁRULJA, HOGY CSINÁL IS VALAMIT ───
// Hét gát, mindegyik egy KONKRÉT hibát fog meg:
//
//   1. PARAMÉTER-ÉPSÉG. Minden bejegyzés minden rétege: létező hullámforma,
//      pozitív hossz, hallható sávban lévő frekvencia, értelmes burkoló és
//      szűrő. Egy `undefined` itt néma hangot jelentene, hibaüzenet nélkül.
//   2. A KÉT LISTA FEDJE EGYMÁST. Minden katalógus-bejegyzés megnevez egy
//      valódi kiváltó okot, ÉS minden felsorolt eseményhez tartozik hang.
//      Az esemény → hang leképezés kölcsönösen egyértelmű: két hang egy
//      eseményre azt jelentené, hogy az egyik halott kód.
//   3. A KIVÁLTÓ OK NEM PAPÍRON VAN. Ami a simből jön, annak tényleg
//      szerepelnie kell a `SZABALYOK` táblában — különben az esemény sosem
//      keletkezik, akármi is van a leírásában.
//   4. ⚠️ A KEVERŐ TÉNYLEG VÁG. Szintetikus eseményzápor (500 csapás egy
//      ticken, majd három másodpercnyi csata 30 000 csapással), és a kimenő
//      hang-kérések száma NAGYSÁGRENDDEL kevesebb kell legyen. A konkrét
//      számpár ki van írva: bemenet → kimenet.
//   5. AZ ISMÉTLÉSI KÖZ BETARTVA. Tízezer véletlen kérés után két azonos
//      hang indítása között SOHA nincs kevesebb idő az előírtnál.
//   6. AZ EGYIDEJŰSÉG-PLAFON BETARTVA, és a TÁVOLSÁGI VÁGÁS MONOTON — a
//      távolabbi forrás sosem hangosabb, és a vágás nem is konstans (egy
//      „mindig 1" függvény monoton lenne, de nem csinálna semmit).
//   7. AZ ESEMÉNYFOLYAM ÉL. Minden szabályra tényleg keletkezik esemény, ha a
//      megfelelő számláló nő — a v0.3 tanulsága: a semmittevés is tökéletesen
//      reprodukálható.
//
// HASZNÁLAT:  node tools/hang_szonda.mjs
// Kilépési kód: 0 = rendben, 1 = bukás.

import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const GYOKER = dirname(dirname(fileURLToPath(import.meta.url)));
const be = (...r) => import(pathToFileURL(join(GYOKER, ...r)).href);

const K = await be('src', 'audio', 'hang_katalogus.js');
const {
  HANG, HANG_DB, HANG_NEV, KATALOGUS, HANG_HOSSZ_MS,
  ESEMENY, ESEMENY_DB, ESEMENY_OK, FORRAS,
  SZAMLALO, SZAMLALO_DB, SZABALYOK, MAX_ESEMENY, MAX_PLAFON,
  BUSZ_NEV, HELY,
  TAV_TELJES, TAV_VAGAS, tavolsagHangero,
  Kevero, Esemenyfolyam,
  ZENE_MIND, sfxHibak, zeneHibak, felhangFrekvencia,
} = K;

let bukas = 0;
const sor = (a, b, c) => console.log('  ' + String(a).padEnd(28) + String(b).padEnd(24) + (c ?? ''));
const cim = (t) => console.log('\n' + t + '\n' + '─'.repeat(78));
const gat = (all, szoveg, reszlet) => {
  if (all) return true;
  console.log('\n  ⛔ ' + szoveg);
  if (reszlet) console.log('     ' + reszlet);
  bukas++;
  return false;
};

/** Determinisztikus álvéletlen — a szonda kimenete futásról futásra ugyanaz. */
function rng(mag) {
  let s = mag >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const ESEMENY_NEV = [];
for (const kulcs of Object.keys(ESEMENY)) ESEMENY_NEV[ESEMENY[kulcs]] = kulcs;
const SZAMLALO_NEV = [];
for (const kulcs of Object.keys(SZAMLALO)) SZAMLALO_NEV[SZAMLALO[kulcs]] = kulcs;

cim('AGE OF THE CRYSTALS — HANG-SZONDA (v0.12/1)');
console.log('  Nincs hangfájl: minden hang paraméter-tábla, a WebAudio szintetizálja.');
console.log('  A szonda a DÖNTÉSI utat járatja meg — GPU és hangkártya nélkül.');

// ── 1. PARAMÉTER-ÉPSÉG ────────────────────────────────────────────────────
cim('1. VIZSGÁLAT — minden bejegyzés minden paramétere ép');
sor('bejegyzés', 'réteg / hossz', 'hullámformák');

let hibaDb = 0;
let retegOssz = 0;
for (let h = 0; h < HANG_DB; h++) {
  const k = KATALOGUS[h];
  const hibak = sfxHibak(k, (HANG_NEV[h] ?? ('#' + h)));
  if (k !== undefined) {
    retegOssz += k.retegek.length;
    const formak = k.retegek.map((r) => r.hullam).join('+');
    sor(k.nev, k.retegek.length + ' réteg / ' + HANG_HOSSZ_MS[h].toFixed(0) + ' ms',
      formak + (hibak.length ? '   ⛔' : ''));
  }
  for (const x of hibak) { console.log('  ⛔ ' + x); hibaDb++; }
}
for (let z = 0; z < ZENE_MIND.length; z++) {
  const hibak = zeneHibak(ZENE_MIND[z], 'zene/' + (ZENE_MIND[z] ? ZENE_MIND[z].nev : z));
  if (ZENE_MIND[z]) {
    retegOssz += ZENE_MIND[z].retegek.length;
    sor('zene: ' + ZENE_MIND[z].nev,
      ZENE_MIND[z].retegek.length + ' réteg / ' + ZENE_MIND[z].utemMs + ' ms ütem',
      ZENE_MIND[z].skala.length + ' hangú skála' + (hibak.length ? '   ⛔' : ''));
  }
  for (const x of hibak) { console.log('  ⛔ ' + x); hibaDb++; }
}
sor('összes réteg', retegOssz, hibaDb === 0 ? 'mind ép' : hibaDb + ' hiba ⛔');
gat(hibaDb === 0, hibaDb + ' PARAMÉTER-HIBA A KATALÓGUSBAN.',
  'Egy `undefined` frekvencia vagy nem létező hullámforma NÉMA hangot ad a '
  + 'WebAudio-ban, kivétel és konzol-üzenet nélkül — ezt semmi más nem venné észre.');

// A félhang-tábla is számol: egy elrontott arány hamis zenét adna.
const oktav = felhangFrekvencia(220, 12);
const kvint = felhangFrekvencia(220, 7);
const also = felhangFrekvencia(220, -12);
sor('félhang-tábla', 'A3=220 → ' + oktav.toFixed(1) + ' / ' + kvint.toFixed(1) + ' / ' + also.toFixed(1),
  'oktáv / kvint / alsó oktáv');
gat(Math.abs(oktav - 440) < 0.5 && Math.abs(kvint - 329.6) < 1 && Math.abs(also - 110) < 0.5,
  'A FÉLHANG-TÁBLA HAMIS.', 'A 220 Hz oktávja 440, kvintje ~329,6, alsó oktávja 110 Hz.');

// ── 2. A KÉT LISTA FEDJE EGYMÁST ──────────────────────────────────────────
cim('2. VIZSGÁLAT — minden hangnak van kiváltó oka, minden eseménynek hangja');

const esemenyHang = new Array(ESEMENY_DB).fill(-1);
let ketszer = 0;
for (let h = 0; h < HANG_DB; h++) {
  const k = KATALOGUS[h];
  if (k === undefined) continue;
  if (esemenyHang[k.esemeny] >= 0) {
    ketszer++;
    console.log('  ⛔ KÉT HANG EGY ESEMÉNYRE: „' + HANG_NEV[esemenyHang[k.esemeny]]
      + '" és „' + k.nev + '" is a(z) ' + ESEMENY_NEV[k.esemeny] + '-hez van kötve.');
  }
  esemenyHang[k.esemeny] = h;
}
gat(ketszer === 0, ketszer + ' ESEMÉNYRE KÉT HANG IS PÁLYÁZIK.',
  'A gyorstábla csak az egyiket tartja meg, a másik HALOTT KÓD lenne: soha nem szólalna meg.');

let nemaEsemeny = 0;
let oktalanHang = 0;
sor('esemény', 'hang', 'kiváltó ok');
for (let e = 0; e < ESEMENY_DB; e++) {
  const h = esemenyHang[e];
  const ok = ESEMENY_OK[e];
  const jo = h >= 0 && ok !== undefined && typeof ok.mit === 'string' && ok.mit.length >= 15;
  if (h < 0) nemaEsemeny++;
  if (ok === undefined || typeof ok.mit !== 'string' || ok.mit.length < 15) oktalanHang++;
  sor(ESEMENY_NEV[e] ?? ('#' + e), h >= 0 ? HANG_NEV[h] : '— NINCS HANG',
    (ok ? ok.mit : '— NINCS OK MEGNEVEZVE') + (jo ? '' : '   ⛔'));
}
gat(nemaEsemeny === 0, nemaEsemeny + ' FELSOROLT ESEMÉNYHEZ NEM TARTOZIK HANG.',
  'Az esemény bekövetkezik, és NEM SZÓL ÉRTE SEMMI. Vagy vedd fel a hangot a '
  + 'katalógusba, vagy vedd ki az eseményt az `ESEMENY` listából.');
gat(oktalanHang === 0, oktalanHang + ' ESEMÉNYNEK NINCS ÉRDEMBEN MEGNEVEZVE A KIVÁLTÓ OKA.',
  'Az `ESEMENY_OK` táblában a `mit` mezőnek a KONKRÉT sim-számlálót vagy a '
  + 'konkrét kliens-tettet kell megneveznie, nem prózát.');

// ── 3. A KIVÁLTÓ OK NEM PAPÍRON VAN ───────────────────────────────────────
cim('3. VIZSGÁLAT — a sim-alapú okok tényleg szerepelnek a szabály-táblában');

const szabalyEsemeny = new Set();
let rosszSzabaly = 0;
for (let s = 0; s < SZABALYOK.length; s++) {
  const sz = SZABALYOK[s];
  szabalyEsemeny.add(sz.esemeny);
  const jo = SZAMLALO_NEV[sz.szamlalo] !== undefined
    && ESEMENY_NEV[sz.esemeny] !== undefined
    && (sz.irany === 1 || sz.irany === -1)
    && sz.kuszob > 0 && sz.maxEsemeny >= 1;
  if (!jo) {
    rosszSzabaly++;
    console.log('  ⛔ HIBÁS SZABÁLY (' + s + '.): ' + JSON.stringify(sz));
  }
}
gat(rosszSzabaly === 0, rosszSzabaly + ' SZABÁLY HIBÁS A `SZABALYOK` TÁBLÁBAN.');

let papiron = 0;
let klienses = 0;
for (let e = 0; e < ESEMENY_DB; e++) {
  const ok = ESEMENY_OK[e];
  if (!ok) continue;
  if (ok.fajta === FORRAS.SZAMLALO) {
    if (!szabalyEsemeny.has(e)) {
      papiron++;
      console.log('  ⛔ CSAK PAPÍRON LÉTEZIK: ' + ESEMENY_NEV[e]
        + ' — sim-számlálóra hivatkozik, de nincs rá szabály, tehát SOHA nem keletkezik.');
    }
  } else klienses++;
}
sor('sim-alapú esemény', szabalyEsemeny.size, 'szabályból keletkezik');
sor('kliens-alapú esemény', klienses, 'a bevitel hívja meg');
sor('szabály összesen', SZABALYOK.length, 'max esemény / képkocka: ' + MAX_ESEMENY);
gat(papiron === 0, papiron + ' ESEMÉNY CSAK PAPÍRON LÉTEZIK.');

// Fordítva is: minden szabály olyan eseményre mutasson, aminek van hangja.
let vakSzabaly = 0;
for (const e of szabalyEsemeny) if (esemenyHang[e] < 0) vakSzabaly++;
gat(vakSzabaly === 0, vakSzabaly + ' SZABÁLY OLYAN ESEMÉNYT AD, AMIHEZ NINCS HANG.');

// ── 4. ⚠️ A KEVERŐ TÉNYLEG VÁG — A ZÁPOR ─────────────────────────────────
cim('4. VIZSGÁLAT — ⚠️ hang-vihar: 1600 egység, több száz csapás egy ticken');
console.log('  Ez az a szám, ami elárulja, hogy a keverési szabály CSINÁL is valamit.\n');

// (a) NYERS ZÁPOR A KEVERŐN: 500 csapás UGYANABBAN a pillanatban.
{
  const kev = new Kevero();
  const BE = 500;
  for (let i = 0; i < BE; i++) kev.ker(HANG.KARDCSAPAS, 1000, 12, 1);
  sor('egy tick, egy pillanat', BE + ' kérés → ' + kev.stat.kimeno + ' szólam',
    'arány 1 : ' + (BE / Math.max(1, kev.stat.kimeno)).toFixed(0));
  gat(kev.stat.kimeno * 10 <= BE,
    'A KEVERŐ NEM VÁG: ' + BE + ' egyidejű kérésből ' + kev.stat.kimeno + ' jött ki.',
    'Egy pillanatban egyetlen hangból legfeljebb egy szólam indulhat — az '
    + 'ismétlési köz gátja nem működik.');
}

// (b) TELJES CSATORNA: három másodperc csata, 20 Hz sim, 60 FPS render.
//     Tickenként 500 csapás, csapásonként 12 sebzés — pontosan az a helyzet,
//     amitől a v0.12 tervezetében tartunk.
{
  const kev = new Kevero();
  const folyam = new Esemenyfolyam();
  const p = new Float64Array(SZAMLALO_DB);

  const CSAPAS_TICKENKENT = 500;
  const SEBZES_CSAPASONKENT = 12;
  const TICK = 60;             // 3 másodperc 20 Hz-en
  const KEPKOCKA = 180;        // ugyanaz 60 FPS-en
  let nyersCsapas = 0;
  let nyersHalal = 0;
  let esemenyDb = 0;
  let maxEgyKepkocka = 0;

  folyam.lep(p);  // az első képkocka csak rögzít

  for (let f = 0; f < KEPKOCKA; f++) {
    const most = (f * 1000) / 60;
    // Három képkockára jut egy tick (60 FPS / 20 Hz).
    if (f % 3 === 0) {
      p[SZAMLALO.SEBZES_MI] += CSAPAS_TICKENKENT * SEBZES_CSAPASONKENT;
      p[SZAMLALO.SEBZES_OK] += CSAPAS_TICKENKENT * SEBZES_CSAPASONKENT;
      p[SZAMLALO.HALOTT_MI] += 8;
      p[SZAMLALO.HALOTT_OK] += 9;
      p[SZAMLALO.LOVEDEK_KILOTT] += 120;
      p[SZAMLALO.LOVEDEK_TALALT] += 90;
      nyersCsapas += CSAPAS_TICKENKENT * 2;
      nyersHalal += 17;
    }
    const n = folyam.lep(p);
    esemenyDb += n;
    if (n > maxEgyKepkocka) maxEgyKepkocka = n;
    for (let i = 0; i < n; i++) {
      const h = esemenyHang[folyam.esemeny[i]];
      if (h >= 0) kev.ker(h, most, 20, 1);
    }
  }

  const nyers = nyersCsapas + nyersHalal + TICK * 210;  // csapás + halál + lövedék
  console.log('  BEMENET  (a sim ' + TICK + ' tickje, 3 másodperc):');
  sor('  nyers csapás', nyersCsapas, CSAPAS_TICKENKENT + ' × 2 oldal × ' + TICK + ' tick');
  sor('  nyers haláleset', nyersHalal, '');
  sor('  nyers lövedék', TICK * 210, 'kilövés + becsapódás');
  sor('  NYERS ESEMÉNY ÖSSZESEN', nyers, '');
  console.log('  SZŰRŐK:');
  sor('  → szabály-gát után', esemenyDb, 'levágva: ' + folyam.stat.levagott);
  sor('  → keverő-gát után', kev.stat.kimeno, 'ez szólal meg ténylegesen');
  console.log('  A KEVERŐ ELDOBÁSAI:');
  sor('  ismétlési köz', kev.stat.eldobIsmetles, '');
  sor('  hangonkénti plafon', kev.stat.eldobPlafon, '');
  sor('  globális plafon', kev.stat.eldobOsszPlafon, '');
  sor('  túl messze', kev.stat.eldobTavolsag, '');
  sor('ARÁNY', nyers + ' → ' + kev.stat.kimeno,
    '1 : ' + (nyers / Math.max(1, kev.stat.kimeno)).toFixed(0));

  gat(kev.stat.kimeno * 10 <= nyers,
    'A TELJES CSATORNA NEM VÁG NAGYSÁGRENDET: ' + nyers + ' → ' + kev.stat.kimeno + '.',
    'A hang-vihar ellen két gát van (szabály + keverő); ha együtt sem visznek le '
    + 'egy nagyságrendet, a WebAudio másodpercenként több száz csomópontot építene.');
  gat(kev.stat.kimeno > 0,
    'A CSATORNA MINDENT ELNYELT: EGYETLEN HANG SEM SZÓLAL MEG A CSATÁBAN.',
    'A némaság is „stabil" — pont ez a v0.3 tanulsága. A gátnak vágnia kell, '
    + 'nem elzárnia.');
  gat(maxEgyKepkocka <= MAX_ESEMENY,
    'AZ ESEMÉNY-PUFFER TÚLCSORDULT: ' + maxEgyKepkocka + ' > ' + MAX_ESEMENY + '.',
    'A `MAX_ESEMENY` a szabályok `maxEsemeny` összegéből jön; ha ez átlépi, a '
    + 'kimeneti `Int32Array` írása kifutna a tömbből.');
  sor('legtöbb egy képkockán', maxEgyKepkocka, 'a puffer mérete: ' + MAX_ESEMENY);
}

// ── 5. AZ ISMÉTLÉSI KÖZ BETARTVA ──────────────────────────────────────────
cim('5. VIZSGÁLAT — két azonos hang között sosem kevesebb az előírt időnél');

{
  const kev = new Kevero({ osszPlafon: 999 });
  const veletlen = rng(20260804);
  /** Hangonként az ELFOGADOTT indítások időpontjai. */
  const indulas = [];
  for (let h = 0; h < HANG_DB; h++) indulas.push([]);

  const KERES = 10000;
  let most = 0;
  for (let i = 0; i < KERES; i++) {
    most += veletlen() * 12;                       // 0..12 ms-onként jön kérés
    const h = (veletlen() * HANG_DB) | 0;
    if (kev.ker(h, most, veletlen() * 30, 1)) indulas[h].push(most);
  }

  let serto = 0;
  let legszorosabb = Infinity;
  let legszorosabbNev = '';
  for (let h = 0; h < HANG_DB; h++) {
    const t = indulas[h];
    for (let i = 1; i < t.length; i++) {
      const koz = t[i] - t[i - 1];
      const arany = koz / KATALOGUS[h].ismetlesKoz;
      if (arany < legszorosabb) { legszorosabb = arany; legszorosabbNev = HANG_NEV[h]; }
      if (koz < KATALOGUS[h].ismetlesKoz) {
        serto++;
        console.log('  ⛔ ' + HANG_NEV[h] + ': két indítás között ' + koz.toFixed(1)
          + ' ms, az előírt ' + KATALOGUS[h].ismetlesKoz + ' ms helyett.');
      }
    }
  }
  const indultOssz = indulas.reduce((s, t) => s + t.length, 0);
  sor('kérés → indítás', KERES + ' → ' + indultOssz, '1 : ' + (KERES / Math.max(1, indultOssz)).toFixed(1));
  sor('legszorosabb köz', (legszorosabb * 100).toFixed(0) + ' % az előírtnak', legszorosabbNev);
  gat(serto === 0, serto + ' HELYEN SÉRÜLT A MINIMÁLIS ISMÉTLÉSI KÖZ.');
  gat(indultOssz > 0, 'A KEVERŐ EGYETLEN KÉRÉST SEM ENGEDETT ÁT 10 000-BŐL.');
  gat(indultOssz < KERES,
    'A KEVERŐ MINDENT ÁTENGEDETT — az ismétlési köz gátja nem is fut le.');
}

// ── 6. EGYIDEJŰSÉG ÉS TÁVOLSÁG ────────────────────────────────────────────
cim('6. VIZSGÁLAT — egyidejűség-plafon és a távolság szerinti vágás');

{
  // (a) EGYIDEJŰSÉG: az elfogadott indításokból visszajátsszuk, hány szólam
  //     szól egyszerre — a hang hossza a katalógusból jön.
  const kev = new Kevero({ osszPlafon: 999 });
  const veletlen = rng(777);
  const esemenyek = [];
  let most = 0;
  for (let i = 0; i < 20000; i++) {
    most += veletlen() * 6;
    const h = (veletlen() * HANG_DB) | 0;
    if (kev.ker(h, most, 5, 1)) esemenyek.push([h, most]);
  }
  let tullepes = 0;
  let csucs = 0;
  for (let i = 0; i < esemenyek.length; i++) {
    const [h, t] = esemenyek[i];
    let egyszerre = 0;
    for (let j = i; j >= 0; j--) {
      if (esemenyek[j][0] !== h) continue;
      if (esemenyek[j][1] + HANG_HOSSZ_MS[h] <= t) break;
      egyszerre++;
    }
    if (egyszerre > csucs) csucs = egyszerre;
    if (egyszerre > KATALOGUS[h].plafon) {
      tullepes++;
      if (tullepes < 4) {
        console.log('  ⛔ ' + HANG_NEV[h] + ': ' + egyszerre + ' szólam egyszerre, a plafon '
          + KATALOGUS[h].plafon + '.');
      }
    }
  }
  sor('elfogadott indítás', esemenyek.length, 'legtöbb egyidejű szólam: ' + csucs);
  gat(tullepes === 0, tullepes + ' HELYEN TÚLLÉPTE A HANGONKÉNTI EGYIDEJŰSÉG-PLAFONT.');
  gat(csucs >= 2, 'EGYSZERRE SOSEM SZÓLT KÉT SZÓLAM — a plafon-ág ki sem futott.');
}

{
  // (b) TÁVOLSÁG: monoton csökkenő, és tényleg VÁG (nem konstans).
  let nemMonoton = 0;
  let elozo = tavolsagHangero(0);
  for (let t = 0; t <= 200; t += 0.25) {
    const v = tavolsagHangero(t);
    if (v > elozo + 1e-12) {
      nemMonoton++;
      if (nemMonoton < 4) {
        console.log('  ⛔ ' + t.toFixed(2) + ' világegységnél HANGOSABB (' + v.toFixed(4)
          + ') mint közelebb (' + elozo.toFixed(4) + ').');
      }
    }
    elozo = v;
  }
  const kozel = tavolsagHangero(TAV_TELJES);
  const kozep = tavolsagHangero((TAV_TELJES + TAV_VAGAS) / 2);
  const tavol = tavolsagHangero(TAV_VAGAS);
  const tulnan = tavolsagHangero(TAV_VAGAS + 50);
  sor('0 .. ' + TAV_TELJES, kozel.toFixed(3), 'teljes hangerő');
  sor('középen', kozep.toFixed(3), 'négyzetes lecsengés');
  sor(TAV_VAGAS + ' felett', tavol.toFixed(3) + ' / ' + tulnan.toFixed(3), 'néma');
  gat(nemMonoton === 0, nemMonoton + ' PONTON NEM MONOTON A TÁVOLSÁGI VÁGÁS.',
    'A távolabbi forrás hangosabb lenne a közelinél — a játékos rossz irányba nézne.');
  gat(kozel === 1 && tavol === 0 && tulnan === 0,
    'A TÁVOLSÁGI VÁGÁS VÉGPONTJAI HIBÁSAK.',
    'Közel 1, a vágási távolságon túl pontosan 0 kell legyen.');
  gat(kozep > 0 && kozep < 0.5,
    'A TÁVOLSÁGI VÁGÁS NEM CSINÁL SEMMIT (' + kozep.toFixed(3) + ' középen).',
    'Egy konstans függvény is monoton — a lecsengésnek érdemben halkítania kell.');

  // A keverőn keresztül is: a messzi forrás kérése el se induljon.
  const kev = new Kevero();
  const kozelSzol = kev.ker(HANG.KARDCSAPAS, 0, 5, 1);
  const kozelG = kev.kiHangero;
  const tavolSzol = kev.ker(HANG.KARDCSAPAS, 100000, TAV_VAGAS + 10, 1);
  sor('keverőn át', 'közel ' + (kozelSzol ? 'szól' : 'NÉMA') + ' / messze '
    + (tavolSzol ? 'SZÓL' : 'néma'), 'közeli hangerő: ' + kozelG.toFixed(3));
  gat(kozelSzol && !tavolSzol,
    'A KEVERŐ NEM VÁGJA LE A TÁVOLI FORRÁST.',
    'A vágási távolságon túli hang-kérésnek el sem szabad indulnia.');
}

// ── 7. AZ ESEMÉNYFOLYAM ÉL ────────────────────────────────────────────────
cim('7. VIZSGÁLAT — minden szabályra tényleg keletkezik esemény');
console.log('  A determinizmus-kapu nem működés-kapu: a semmittevés is stabil.');
console.log('  Ezért szabályonként külön megnézzük, hogy a számláló mozgatása');
console.log('  TÉNYLEG előhív-e eseményt.\n');
sor('szabály', 'számláló-mozgás', 'esemény');

let nema = 0;
const elertEsemeny = new Set();
for (let s = 0; s < SZABALYOK.length; s++) {
  const sz = SZABALYOK[s];
  const folyam = new Esemenyfolyam();
  const p = new Float64Array(SZAMLALO_DB);
  // A csökkenésre figyelő szabályhoz (épület elpusztult) előbb fel kell
  // építeni valamit, hogy legyen mi elpusztuljon.
  if (sz.irany === -1) p[sz.szamlalo] = 10;
  folyam.lep(p);
  const mozgas = sz.kuszob * sz.irany;
  p[sz.szamlalo] += mozgas;
  const n = folyam.lep(p);

  let talalt = 0;
  for (let i = 0; i < n; i++) if (folyam.esemeny[i] === sz.esemeny) talalt++;
  if (talalt > 0) elertEsemeny.add(sz.esemeny);
  else nema++;
  sor(SZAMLALO_NEV[sz.szamlalo], (mozgas > 0 ? '+' : '') + mozgas,
    ESEMENY_NEV[sz.esemeny] + ' × ' + talalt + (talalt > 0 ? '' : '   ⛔ NÉMA'));
}
gat(nema === 0, nema + ' SZABÁLY NEM AD ESEMÉNYT A SAJÁT SZÁMLÁLÓJÁNAK MOZGÁSÁRA.',
  'A szabály ott van a táblában, de halott: a hozzá tartozó hang sosem szólalna meg.');

// Az ELSŐ képkocka NE szólaljon meg: betöltés után a számlálók nulláról
// ugranak a mentett értékre, és abból hangrobbanás lenne.
{
  const folyam = new Esemenyfolyam();
  const p = new Float64Array(SZAMLALO_DB);
  p[SZAMLALO.SEBZES_MI] = 99999;
  p[SZAMLALO.HALOTT_MI] = 400;
  const elso = folyam.lep(p);
  sor('betöltés utáni első kép', elso + ' esemény', elso === 0 ? 'némán rögzít' : '⛔');
  gat(elso === 0, 'A BETÖLTÉS UTÁNI ELSŐ KÉPKOCKA HANGROBBANÁST AD.',
    'A mentés visszatöltésekor a számlálók nulláról ugranak a tárolt értékre; '
    + 'az `Esemenyfolyam` első hívásának CSAK rögzítenie szabad.');
}

// A kliens-oldali események is elérhetők-e a keverőn át (ezek nem szabályból
// jönnek, hanem a bevitel hívja meg őket).
{
  const kev = new Kevero();
  let ki = 0;
  let t = 0;
  for (let e = 0; e < ESEMENY_DB; e++) {
    if (!ESEMENY_OK[e] || ESEMENY_OK[e].fajta !== FORRAS.KLIENS) continue;
    t += 1000;
    if (kev.ker(esemenyHang[e], t, 0, 1)) { ki++; elertEsemeny.add(e); }
  }
  sor('kliens-esemény', klienses + ' → ' + ki, 'a keverőn át megszólal');
  gat(ki === klienses, 'NEM MINDEN KLIENS-ESEMÉNY JUT ÁT A KEVERŐN.');
}

sor('elért esemény', elertEsemeny.size + ' / ' + ESEMENY_DB,
  elertEsemeny.size === ESEMENY_DB ? 'mind megszólaltatható' : '⛔');
gat(elertEsemeny.size === ESEMENY_DB,
  (ESEMENY_DB - elertEsemeny.size) + ' ESEMÉNY SEMMILYEN ÚTON NEM SZÓLALTATHATÓ MEG.');

// ── 8. A WEBAUDIO-RÉTEG BETÖLTHETŐ NODE-BAN ───────────────────────────────
cim('8. VIZSGÁLAT — a `hang.js` node-ban is betölthető (nincs csupasz DOM-hívás)');
{
  let hiba = null;
  let Hang = null;
  try {
    ({ Hang } = await be('src', 'audio', 'hang.js'));
  } catch (x) {
    hiba = x;
  }
  gat(hiba === null, 'A `src/audio/hang.js` NEM TÖLTHETŐ BE NODE-BAN.',
    hiba ? String(hiba && hiba.message) : '');
  if (Hang) {
    // Sim NÉLKÜL is meg kell épülnie, és `AudioContext` nélkül némán futnia.
    const h = new Hang({}, { sajatCsapat: 0 });
    const indult = h.inditas();
    const uressim = {};
    h.frissit(uressim, 0, 0, 0);
    h.frissit(uressim, 16, 0, 0);
    const szolt = h.esemeny(ESEMENY.KIJELOLES, undefined, undefined, 100);
    sor('konstruktor', 'rendben', 'inditas() node-ban: ' + (indult ? 'igaz ⛔' : 'hamis (helyes)'));
    sor('frissit üres simmel', 'nem dobott', 'kliens-esemény átment: ' + szolt);
    gat(!indult, 'AZ `inditas()` NODE-BAN IGAZAT ADOTT — DOM-függés szivárgott be.');
    gat(szolt === true, 'A KLIENS-ESEMÉNY NEM JUTOTT ÁT A RÉTEGEN.');
  }
}

// ── AMIT A JÁTÉKOS HALLANI FOG ────────────────────────────────────────────
cim('AMIT A JÁTÉKOS HALLANI FOG');
const csoport = {};
for (let h = 0; h < HANG_DB; h++) {
  const k = KATALOGUS[h];
  if (!k) continue;
  const nev = BUSZ_NEV[k.busz] ?? '?';
  (csoport[nev] ??= []).push(k);
}
const HELY_NEV = ['hallgatónál', 'a harcnál', 'a munkánál', 'a bázisnál'];
for (const nev of Object.keys(csoport)) {
  console.log('\n  ' + nev.toUpperCase());
  for (const k of csoport[nev]) {
    console.log('    · ' + k.nev.padEnd(28)
      + ('köz ' + k.ismetlesKoz + ' ms').padEnd(16)
      + ('plafon ' + k.plafon).padEnd(11)
      + HELY_NEV[k.hely]);
  }
}
console.log('\n  ZENE (korszakonként, generált — nincs hangfájl)');
for (const z of ZENE_MIND) {
  console.log('    · ' + z.nev.padEnd(28)
    + (z.alap + ' Hz').padEnd(16)
    + (z.skala.length + ' hangú').padEnd(11)
    + z.utemMs + ' ms ütem, ' + z.suru + ' % sűrűség');
}

cim('ÍTÉLET');
if (bukas === 0) {
  console.log('  ✅ A HANG-KATALÓGUS ÉS A KEVERŐ MŰKÖDIK:');
  console.log('     ' + HANG_DB + ' hang · ' + ESEMENY_DB + ' esemény · '
    + SZABALYOK.length + ' szabály · ' + ZENE_MIND.length + ' zene-téma · '
    + retegOssz + ' szintézis-réteg');
  console.log('     minden esemény megszólaltatható, minden hangnak van kiváltó oka,');
  console.log('     és a vihar-gát nagyságrendet vág (lásd a 4. vizsgálat számait).');
} else {
  console.log('  ❌ ' + bukas + ' vizsgálat BUKOTT.');
}
console.log('');
process.exit(bukas === 0 ? 0 : 1);
