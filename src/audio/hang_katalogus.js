// AGE OF THE CRYSTALS — HANG-KATALÓGUS ÉS KEVERÉSI SZABÁLYOK (v0.12/1).
//
// ── MIÉRT PARAMÉTER-TÁBLA, ÉS MIÉRT NINCS EGYETLEN HANGFÁJL SEM ───────────
// Ebben a fájlban NINCS minta, NINCS bináris melléklet, és nem is lesz. Minden
// hangot a WebAudio SZINTETIZÁL: oszcillátor vagy zajpuffer, burkológörbe,
// szűrő. A katalógus ezért nem hangokat tárol, hanem SZÁMOKAT — azt a néhány
// paramétert, amiből a `hang.js` a hangot felépíti.
//
// Ennek három nyeresége van, és mind a három a projekt eddigi fájdalmaiból jön:
//
//   1. NULLA LETÖLTÉS, NULLA ASSET-PIPELINE. Nem kell hangfájlt beszerezni,
//      licencelni, konvertálni, verziózni és a `dist/`-be másolni. A build
//      ugyanaz a `vite build` marad, a játék pedig egyetlen kéréssel sem lesz
//      nehezebb.
//   2. EGY SZÁM ÁTÍRÁSÁVAL HANGOLHATÓ. A kardcsapás mélyebb? `f0: 260 → 190`.
//      Egy WAV-nál ugyanez hangszerkesztő, újraexportálás és új commit lenne.
//   3. NODE-BAN FUT, TEHÁT VIZSGÁLHATÓ. Ez a modul nem tud az `AudioContext`-
//      ről, a DOM-ról és a `three`-ről. A `tools/hang_szonda.mjs` így a
//      teljes döntési láncot végigjáratja GPU és hangkártya nélkül — pont úgy,
//      ahogy a `minimap_adat.js` és a `civ_valaszto_adat.js` esetében.
//
// ── ⚠️ A HANG SOSEM ÍR A SIMBE, ÉS A SIM SEMMIT NEM TUD RÓLA ──────────────
// A `src/sim/` determinizmusa mindent felülír. A hang tehát:
//
//   · nem hív sim-metódust, nem ad be parancsot, nem állít sim-mezőt;
//   · nem kér a simtől visszahívást és nem vezet be új sim-eseményt;
//   · a sim MEGLÉVŐ, HALMOZOTT SZÁMLÁLÓIT olvassa (összsebzés, halottak,
//     elkészült egységek, begyűjtött nyersanyag, korszak), és két képkocka
//     KÜLÖNBSÉGÉBŐL következtet arra, mi történt.
//
// Ez nem kényelmi döntés. Ha a hang bármit visszaírna — akár csak egy „mikor
// szólt utoljára" időbélyeget —, az a v0.8-ban azonnali desync lenne. A
// különbségképzés ára az, hogy az esemény HELYÉT nem ismerjük pontosan (a
// számláló nem hordoz koordinátát); ezt az `ESEMENY_HELY` tábla oldja meg
// súlypontokkal, és ezt a fejléc vállaltan közelítésnek nevezi.
//
// ── ⚠️ A HANG-VIHAR: EZ A FÁJL LEGFONTOSABB MUNKÁJA ───────────────────────
// 1600 egységnél egy összecsapásban TÖBB SZÁZ csapás eshet EGYETLEN ticken.
// Ha mindegyik hangot kérne, a WebAudio másodpercenként több ezer csomópontot
// építene, a keverő kivezérelne, és a játékos fehér zajt hallana — miközben a
// képkocka-idő is elmenne rá. A vihar ellen KÉT, egymás után kapcsolt gát áll:
//
//   1. SZABÁLY-GÁT (`Esemenyfolyam`) — a számláló-növekményből küszöb szerint
//      lesz esemény (40 sebzés = 1 csapás-hang), és képkockánként LEGFELJEBB
//      `maxEsemeny` darab. A maradék NEM halmozódik tovább: egy lezajlott
//      roham után nem akarunk fél percig csörömpölni.
//   2. KEVERŐ-GÁT (`Kevero`) — hangonkénti minimális ismétlési köz, hangonkénti
//      egyidejűség-plafon, globális szólam-plafon, és távolság szerinti
//      hangerő-vágás.
//
// ⚠️ A KEVERŐ GÁTJAINAK SORRENDJE SZÁNDÉKOS, ÉS NEM CSERÉLHETŐ FEL. Előbb
// futnak az O(1) gátak (hallhatóság, ismétlési köz), és csak az azokon átjutott
// — másodpercenként néhány — kérés fut bele a szólam-számlálásba. Így a
// 30 000 kérésből 29 900-at két összehasonlítás dob el. Ha a drága gát kerülne
// előre, a vihar pont a keverőt terhelné le.

/** Hullámformák. A `zaj` a mi sajátunk (zajpuffer), a többi `OscillatorNode`. */
export const HULLAMOK = ['sine', 'triangle', 'sawtooth', 'square', 'zaj'];
/** Szűrő-fajták — `BiquadFilterNode.type` értékek. */
export const SZUROK = ['lowpass', 'highpass', 'bandpass'];

/** Keverő-buszok: a játékos külön szabályozhatja a hangerőt. */
export const BUSZ = { SFX: 0, UI: 1, ZENE: 2 };
export const BUSZ_NEV = ['effekt', 'kezelőfelület', 'zene'];

/**
 * HOL SZÓL? — a számláló-alapú eseménynek nincs koordinátája (lásd a fejlécet),
 * ezért minden esemény megmondja, MELYIK SÚLYPONTHOZ tartozik. A `hang.js`
 * képkockánként EGY menetben számolja ki a három súlypontot, és a keverő ebből
 * kapja a hallgatótól mért távolságot.
 */
export const HELY = {
  /** A hallgatónál szól, távolság-vágás nélkül (kezelőfelület, riasztás). */
  HALLGATO: 0,
  /** A saját harcoló egységek súlypontja. */
  HARC: 1,
  /** A saját dolgozó munkások súlypontja. */
  MUNKA: 2,
  /** A saját épületek súlypontja. */
  BAZIS: 3,
};

// ── ESEMÉNYEK ────────────────────────────────────────────────────────────
// Ez a lista az, AMI TÖRTÉNHET. A katalógus minden bejegyzése pontosan egy
// ilyen eseményre hivatkozik, és minden eseményhez tartozik bejegyzés — a
// szonda mindkét irányban ellenőrzi. Enélkül egy elfelejtett esemény néma
// maradna (semmi nem szólna érte), egy hivatkozás nélküli hang-bejegyzés pedig
// halott kód lenne, amit soha semmi nem szólaltat meg.

export const ESEMENY = {
  // ── a játékos tettei (a kliens adja be, nem a sim) ──────────────────
  KIJELOLES: 0,
  PARANCS_MENET: 1,
  PARANCS_TAMADAS: 2,
  PARANCS_ELUTASITVA: 3,
  // ── harc ────────────────────────────────────────────────────────────
  CSAPAS: 4,
  SEBZODES: 5,
  NYIL_KILOVES: 6,
  NYIL_BECSAPODAS: 7,
  TORONY_SORTUZ: 8,
  HALAL_MI: 9,
  HALAL_OK: 10,
  EPULET_OMLIK_MI: 11,
  EPULET_OMLIK_OK: 12,
  TAMADAS_ALATT: 13,
  // ── építkezés és képzés ─────────────────────────────────────────────
  EPITES_INDUL: 14,
  EPULET_KESZ: 15,
  EGYSEG_KESZ: 16,
  TECH_KESZ: 17,
  // ── gazdaság ────────────────────────────────────────────────────────
  GYUJTES_ETEL: 18,
  GYUJTES_FA: 19,
  GYUJTES_KO: 20,
  GYUJTES_KRISTALY: 21,
  PIACI_CSERE: 22,
  KORSZAKVALTAS: 23,
};
export const ESEMENY_DB = 24;

/** Honnan jön az esemény? */
export const FORRAS = {
  /** A kliens (bevitel, kijelölés) hívja meg — nem a simből jön. */
  KLIENS: 0,
  /** Két képkocka sim-SZÁMLÁLÓJÁNAK különbségéből. */
  SZAMLALO: 1,
};

/**
 * MINDEN eseményhez oda van írva, MI VÁLTJA KI — nem prózában, hanem
 * ellenőrizhetően: a `mit` a sim KONKRÉT számlálójának neve, illetve a kliens
 * konkrét tette. A szonda ezt két oldalról fogja meg: az üres/hiányzó
 * megnevezés bukás, és a `SZAMLALO` fajtájú eseménynek tényleg szerepelnie
 * kell a `SZABALYOK` táblában — különben csak papíron létezik.
 */
export const ESEMENY_OK = [];
ESEMENY_OK[ESEMENY.KIJELOLES] = { fajta: FORRAS.KLIENS, mit: 'kijeloles.js — új kijelölés jött létre' };
ESEMENY_OK[ESEMENY.PARANCS_MENET] = { fajta: FORRAS.KLIENS, mit: "bevitel.js — 'menet' vagy 'gyujt' parancs beadva" };
ESEMENY_OK[ESEMENY.PARANCS_TAMADAS] = { fajta: FORRAS.KLIENS, mit: "bevitel.js — 'tamado_menet' parancs beadva" };
ESEMENY_OK[ESEMENY.PARANCS_ELUTASITVA] = { fajta: FORRAS.KLIENS, mit: 'bevitel.js — a parancs elutasítva (nyersanyag, népesség, hely)' };
ESEMENY_OK[ESEMENY.CSAPAS] = { fajta: FORRAS.SZAMLALO, mit: 'harc.osszSebzes[saját] nő — mi ütünk' };
ESEMENY_OK[ESEMENY.SEBZODES] = { fajta: FORRAS.SZAMLALO, mit: 'harc.osszSebzes[ellen] nő — minket ütnek' };
ESEMENY_OK[ESEMENY.NYIL_KILOVES] = { fajta: FORRAS.SZAMLALO, mit: 'lovedek.kilott nő' };
ESEMENY_OK[ESEMENY.NYIL_BECSAPODAS] = { fajta: FORRAS.SZAMLALO, mit: 'lovedek.talalt nő' };
ESEMENY_OK[ESEMENY.TORONY_SORTUZ] = { fajta: FORRAS.SZAMLALO, mit: 'harc.toronySortuz[saját] nő' };
ESEMENY_OK[ESEMENY.HALAL_MI] = { fajta: FORRAS.SZAMLALO, mit: 'harc.halottak[saját] nő' };
ESEMENY_OK[ESEMENY.HALAL_OK] = { fajta: FORRAS.SZAMLALO, mit: 'harc.halottak[ellen] nő' };
ESEMENY_OK[ESEMENY.EPULET_OMLIK_MI] = { fajta: FORRAS.SZAMLALO, mit: 'a saját ÁLLÓ épületek száma CSÖKKEN (epuletek.elo)' };
ESEMENY_OK[ESEMENY.EPULET_OMLIK_OK] = { fajta: FORRAS.SZAMLALO, mit: 'az ellenséges ÁLLÓ épületek száma CSÖKKEN (epuletek.elo)' };
ESEMENY_OK[ESEMENY.TAMADAS_ALATT] = { fajta: FORRAS.SZAMLALO, mit: 'harc.osszSebzes[ellen] NAGY ugrása — riasztás-küszöb' };
ESEMENY_OK[ESEMENY.EPITES_INDUL] = { fajta: FORRAS.SZAMLALO, mit: 'a saját LERAKOTT épületek száma nő (epuletek.db)' };
ESEMENY_OK[ESEMENY.EPULET_KESZ] = { fajta: FORRAS.SZAMLALO, mit: 'a saját KÉSZ épületek száma nő (epulHatra 0-ra fut)' };
ESEMENY_OK[ESEMENY.EGYSEG_KESZ] = { fajta: FORRAS.SZAMLALO, mit: 'kepzes.keszult[saját] nő' };
ESEMENY_OK[ESEMENY.TECH_KESZ] = { fajta: FORRAS.SZAMLALO, mit: 'technologia.keszult[saját] nő' };
ESEMENY_OK[ESEMENY.GYUJTES_ETEL] = { fajta: FORRAS.SZAMLALO, mit: 'gazdasag.osszegyujtott[saját*4+ETEL] nő' };
ESEMENY_OK[ESEMENY.GYUJTES_FA] = { fajta: FORRAS.SZAMLALO, mit: 'gazdasag.osszegyujtott[saját*4+FA] nő' };
ESEMENY_OK[ESEMENY.GYUJTES_KO] = { fajta: FORRAS.SZAMLALO, mit: 'gazdasag.osszegyujtott[saját*4+KO] nő' };
ESEMENY_OK[ESEMENY.GYUJTES_KRISTALY] = { fajta: FORRAS.SZAMLALO, mit: 'gazdasag.osszegyujtott[saját*4+KRISTALY] nő' };
ESEMENY_OK[ESEMENY.PIACI_CSERE] = { fajta: FORRAS.SZAMLALO, mit: 'gazdasag.csereDb[saját] nő' };
ESEMENY_OK[ESEMENY.KORSZAKVALTAS] = { fajta: FORRAS.SZAMLALO, mit: 'gazdasag.korszak[saját] nő' };

// ── SZÁMLÁLÓ-PILLANATKÉP ─────────────────────────────────────────────────
// A `hang.js` képkockánként EGY `Float64Array`-be gyűjti a sim halmozott
// számlálóit, és ezt a tömböt adja át. Azért tömb és nem objektum: a
// különbségképzés így egyetlen, elágazás nélküli menet, és NULLA ALLOKÁCIÓ —
// a pillanatkép egyszer, induláskor jön létre.

export const SZAMLALO = {
  SEBZES_MI: 0,
  SEBZES_OK: 1,
  HALOTT_MI: 2,
  HALOTT_OK: 3,
  LOVEDEK_KILOTT: 4,
  LOVEDEK_TALALT: 5,
  TORONY_SORTUZ: 6,
  EGYSEG_KESZULT: 7,
  TECH_KESZULT: 8,
  GYUJT_ETEL: 9,
  GYUJT_FA: 10,
  GYUJT_KO: 11,
  GYUJT_KRISTALY: 12,
  CSERE: 13,
  KORSZAK: 14,
  EPULET_ALAP_MI: 15,
  EPULET_KESZ_MI: 16,
  EPULET_ELO_MI: 17,
  EPULET_ELO_OK: 18,
};
export const SZAMLALO_DB = 19;

/**
 * SZABÁLYOK: számláló-növekmény → esemény.
 *
 * - `irany`  +1 = növekedésre figyel, −1 = csökkenésre (épület elpusztult)
 * - `kuszob` ennyi számláló-egység ad EGY eseményt (40 sebzés = 1 kardcsapás)
 * - `maxEsemeny` képkockánként ennyinél több esemény SOHA nem születik ebből
 *   a szabályból — ez a vihar ELSŐ gátja, és egyben az az érték, amiből a
 *   kimeneti puffer mérete (`MAX_ESEMENY`) FELÜLRŐL becsülhető: a puffer
 *   így nem tud túlcsordulni, és nem kell képkockánként újrafoglalni.
 *
 * ⚠️ Egy számlálóra TÖBB szabály is ülhet: a `SEBZES_OK` sűrű, halk
 * sebződés-hangot ad kis küszöbbel, ÉS egy ritka riasztást nagy küszöbbel.
 * Ez nem duplikáció — a kettő két különböző dolgot jelent a játékosnak.
 */
export const SZABALYOK = [
  { szamlalo: SZAMLALO.SEBZES_MI, irany: 1, kuszob: 40, maxEsemeny: 3, esemeny: ESEMENY.CSAPAS },
  { szamlalo: SZAMLALO.SEBZES_OK, irany: 1, kuszob: 40, maxEsemeny: 3, esemeny: ESEMENY.SEBZODES },
  { szamlalo: SZAMLALO.SEBZES_OK, irany: 1, kuszob: 600, maxEsemeny: 1, esemeny: ESEMENY.TAMADAS_ALATT },
  { szamlalo: SZAMLALO.HALOTT_MI, irany: 1, kuszob: 1, maxEsemeny: 2, esemeny: ESEMENY.HALAL_MI },
  { szamlalo: SZAMLALO.HALOTT_OK, irany: 1, kuszob: 1, maxEsemeny: 2, esemeny: ESEMENY.HALAL_OK },
  { szamlalo: SZAMLALO.LOVEDEK_KILOTT, irany: 1, kuszob: 3, maxEsemeny: 3, esemeny: ESEMENY.NYIL_KILOVES },
  { szamlalo: SZAMLALO.LOVEDEK_TALALT, irany: 1, kuszob: 3, maxEsemeny: 3, esemeny: ESEMENY.NYIL_BECSAPODAS },
  { szamlalo: SZAMLALO.TORONY_SORTUZ, irany: 1, kuszob: 1, maxEsemeny: 2, esemeny: ESEMENY.TORONY_SORTUZ },
  { szamlalo: SZAMLALO.EGYSEG_KESZULT, irany: 1, kuszob: 1, maxEsemeny: 2, esemeny: ESEMENY.EGYSEG_KESZ },
  { szamlalo: SZAMLALO.TECH_KESZULT, irany: 1, kuszob: 1, maxEsemeny: 1, esemeny: ESEMENY.TECH_KESZ },
  { szamlalo: SZAMLALO.GYUJT_ETEL, irany: 1, kuszob: 25, maxEsemeny: 2, esemeny: ESEMENY.GYUJTES_ETEL },
  { szamlalo: SZAMLALO.GYUJT_FA, irany: 1, kuszob: 25, maxEsemeny: 2, esemeny: ESEMENY.GYUJTES_FA },
  { szamlalo: SZAMLALO.GYUJT_KO, irany: 1, kuszob: 25, maxEsemeny: 2, esemeny: ESEMENY.GYUJTES_KO },
  { szamlalo: SZAMLALO.GYUJT_KRISTALY, irany: 1, kuszob: 25, maxEsemeny: 2, esemeny: ESEMENY.GYUJTES_KRISTALY },
  { szamlalo: SZAMLALO.CSERE, irany: 1, kuszob: 1, maxEsemeny: 1, esemeny: ESEMENY.PIACI_CSERE },
  { szamlalo: SZAMLALO.KORSZAK, irany: 1, kuszob: 1, maxEsemeny: 1, esemeny: ESEMENY.KORSZAKVALTAS },
  { szamlalo: SZAMLALO.EPULET_ALAP_MI, irany: 1, kuszob: 1, maxEsemeny: 2, esemeny: ESEMENY.EPITES_INDUL },
  { szamlalo: SZAMLALO.EPULET_KESZ_MI, irany: 1, kuszob: 1, maxEsemeny: 2, esemeny: ESEMENY.EPULET_KESZ },
  { szamlalo: SZAMLALO.EPULET_ELO_MI, irany: -1, kuszob: 1, maxEsemeny: 2, esemeny: ESEMENY.EPULET_OMLIK_MI },
  { szamlalo: SZAMLALO.EPULET_ELO_OK, irany: -1, kuszob: 1, maxEsemeny: 2, esemeny: ESEMENY.EPULET_OMLIK_OK },
];

/** A kimeneti puffer FELSŐ KORLÁTJA — a szabályok összegéből, nem tippből. */
export const MAX_ESEMENY = SZABALYOK.reduce((s, sz) => s + sz.maxEsemeny, 0);

// ── A KATALÓGUS ──────────────────────────────────────────────────────────
// Minden bejegyzés `HANG.*` szerint van INDEXELVE, nem sorrendben feltöltve:
// ha a kódok valaha átszámozódnak, a tábla velük mozdul. A kétszer kiosztott
// kód azonnal dob — betöltéskor, nem a játék közepén.

export const HANG = {
  KIJELOLES: 0,
  PARANCS_MENET: 1,
  PARANCS_TAMADAS: 2,
  ELUTASITVA: 3,
  KARDCSAPAS: 4,
  SEBZODES: 5,
  IJHUR: 6,
  NYIL_BECSAPODAS: 7,
  TORONY_SORTUZ: 8,
  HALAL_MI: 9,
  HALAL_OK: 10,
  EPULET_OMLIK_MI: 11,
  EPULET_OMLIK_OK: 12,
  RIASZTAS: 13,
  EPITES_INDUL: 14,
  EPULET_KESZ: 15,
  EGYSEG_KESZ: 16,
  TECH_KESZ: 17,
  GYUJTES_ETEL: 18,
  FEJSZE: 19,
  CSAKANY: 20,
  KRISTALY_CSENDULES: 21,
  PIACI_CSERE: 22,
  KORSZAKVALTAS: 23,
};
export const HANG_DB = 24;

/**
 * Hangonként ennyi szólam szólhat egyszerre — a `plafon` ennél nem lehet nagyobb.
 *
 * ⚠️ A `plafon` ÉS AZ `ismetlesKoz` NEM FÜGGETLEN. Mivel az ismétlési köz gátja
 * FUT ELŐBB (lásd a fejlécet: előbb az O(1) gátak), egy hangból legfeljebb
 * `floor(hossz / ismetlesKoz) + 1` szólam lehet egyszerre. Ha a `plafon` ennél
 * NAGYOBB, akkor soha nem fog: halott beállítás, ami azt hazudja, hogy védve
 * vagyunk. Ezért a szonda külön gátja ellenőrzi a kettő összhangját, és ezért
 * van minden bejegyzésnél a plafon pontosan erre az elérhető maximumra állítva
 * — így az érték IGAZAT mond, és egy ütem-hangolás után azonnal kiderül, ha
 * újra kell gondolni.
 */
export const MAX_PLAFON = 6;

/** @type {Array<object>} `HANG.*` szerint indexelve. */
export const KATALOGUS = [];

function _be(kod, def) {
  if (KATALOGUS[kod] !== undefined) {
    throw new Error('hang_katalogus: kétszer kiosztott hang-kód (' + kod + ')');
  }
  KATALOGUS[kod] = def;
}

// ── A JÁTÉKOS TETTEI ─────────────────────────────────────────────────────
// Rövidek, halkak, és a HALLGATÓnál szólnak: a saját kattintásunk visszajelzése
// nem függhet attól, hol áll a kamera.

_be(HANG.KIJELOLES, {
  nev: 'kijelölés',
  esemeny: ESEMENY.KIJELOLES,
  busz: BUSZ.UI,
  hely: HELY.HALLGATO,
  hangero: 0.22, prioritas: 1, plafon: 1, ismetlesKoz: 70, hangolas: 4,
  retegek: [
    { hullam: 'triangle', f0: 880, f1: 1180, hossz: 0.055, tamadas: 0.004, hangero: 0.7, szuro: null },
  ],
});

_be(HANG.PARANCS_MENET, {
  nev: 'menetparancs',
  esemeny: ESEMENY.PARANCS_MENET,
  busz: BUSZ.UI,
  hely: HELY.HALLGATO,
  hangero: 0.26, prioritas: 1, plafon: 2, ismetlesKoz: 90, hangolas: 5,
  retegek: [
    { hullam: 'sine', f0: 520, f1: 780, hossz: 0.09, tamadas: 0.004, hangero: 0.8, szuro: null },
    { hullam: 'zaj', f0: 2400, f1: 900, hossz: 0.05, tamadas: 0.002, hangero: 0.22,
      szuro: { tipus: 'bandpass', f: 1800, q: 1.4 } },
  ],
});

_be(HANG.PARANCS_TAMADAS, {
  nev: 'támadó parancs',
  esemeny: ESEMENY.PARANCS_TAMADAS,
  busz: BUSZ.UI,
  hely: HELY.HALLGATO,
  hangero: 0.30, prioritas: 2, plafon: 2, ismetlesKoz: 90, hangolas: 5,
  retegek: [
    { hullam: 'sawtooth', f0: 300, f1: 190, hossz: 0.13, tamadas: 0.005, hangero: 0.55,
      szuro: { tipus: 'lowpass', f: 1500, q: 0.8 } },
    { hullam: 'square', f0: 600, f1: 460, hossz: 0.10, tamadas: 0.004, hangero: 0.28,
      szuro: { tipus: 'lowpass', f: 2200, q: 0.7 } },
  ],
});

_be(HANG.ELUTASITVA, {
  nev: 'elutasított parancs',
  esemeny: ESEMENY.PARANCS_ELUTASITVA,
  busz: BUSZ.UI,
  hely: HELY.HALLGATO,
  // Hosszú ismétlési köz: a „nincs elég fa" háromszor egymás után nem
  // háromszor tájékoztat, csak háromszor bosszant.
  hangero: 0.28, prioritas: 2, plafon: 1, ismetlesKoz: 400, hangolas: 0,
  retegek: [
    { hullam: 'square', f0: 210, f1: 150, hossz: 0.16, tamadas: 0.004, hangero: 0.5,
      szuro: { tipus: 'lowpass', f: 900, q: 0.9 } },
  ],
});

// ── HARC ─────────────────────────────────────────────────────────────────
// Itt a legszigorúbbak a keverési szabályok: ezek a hangok jönnek százával.

_be(HANG.KARDCSAPAS, {
  nev: 'kardcsapás',
  esemeny: ESEMENY.CSAPAS,
  busz: BUSZ.SFX,
  hely: HELY.HARC,
  hangero: 0.34, prioritas: 1, plafon: 2, ismetlesKoz: 45, hangolas: 12,
  retegek: [
    { hullam: 'zaj', f0: 5200, f1: 1400, hossz: 0.075, tamadas: 0.002, hangero: 0.6,
      szuro: { tipus: 'bandpass', f: 2600, q: 1.1 } },
    { hullam: 'triangle', f0: 420, f1: 260, hossz: 0.06, tamadas: 0.002, hangero: 0.35,
      szuro: { tipus: 'lowpass', f: 1800, q: 0.7 } },
  ],
});

_be(HANG.SEBZODES, {
  nev: 'találat rajtunk',
  esemeny: ESEMENY.SEBZODES,
  busz: BUSZ.SFX,
  hely: HELY.HARC,
  hangero: 0.30, prioritas: 2, plafon: 2, ismetlesKoz: 55, hangolas: 10,
  retegek: [
    { hullam: 'zaj', f0: 1600, f1: 420, hossz: 0.10, tamadas: 0.003, hangero: 0.55,
      szuro: { tipus: 'lowpass', f: 1100, q: 0.9 } },
    { hullam: 'sine', f0: 190, f1: 120, hossz: 0.09, tamadas: 0.003, hangero: 0.4, szuro: null },
  ],
});

_be(HANG.IJHUR, {
  nev: 'íjhúr',
  esemeny: ESEMENY.NYIL_KILOVES,
  busz: BUSZ.SFX,
  hely: HELY.HARC,
  hangero: 0.24, prioritas: 0, plafon: 2, ismetlesKoz: 40, hangolas: 14,
  retegek: [
    { hullam: 'zaj', f0: 3400, f1: 1100, hossz: 0.05, tamadas: 0.001, hangero: 0.5,
      szuro: { tipus: 'highpass', f: 1200, q: 0.8 } },
  ],
});

_be(HANG.NYIL_BECSAPODAS, {
  nev: 'nyíl becsapódása',
  esemeny: ESEMENY.NYIL_BECSAPODAS,
  busz: BUSZ.SFX,
  hely: HELY.HARC,
  hangero: 0.26, prioritas: 1, plafon: 2, ismetlesKoz: 50, hangolas: 12,
  retegek: [
    { hullam: 'zaj', f0: 2600, f1: 700, hossz: 0.06, tamadas: 0.001, hangero: 0.5,
      szuro: { tipus: 'bandpass', f: 1400, q: 1.6 } },
    { hullam: 'triangle', f0: 300, f1: 210, hossz: 0.05, tamadas: 0.002, hangero: 0.25, szuro: null },
  ],
});

_be(HANG.TORONY_SORTUZ, {
  nev: 'torony-sortűz',
  esemeny: ESEMENY.TORONY_SORTUZ,
  busz: BUSZ.SFX,
  hely: HELY.BAZIS,
  hangero: 0.32, prioritas: 2, plafon: 1, ismetlesKoz: 220, hangolas: 6,
  retegek: [
    { hullam: 'zaj', f0: 3000, f1: 900, hossz: 0.14, tamadas: 0.004, hangero: 0.5,
      szuro: { tipus: 'bandpass', f: 1700, q: 0.9 } },
    { hullam: 'sawtooth', f0: 260, f1: 170, hossz: 0.12, tamadas: 0.004, hangero: 0.3,
      szuro: { tipus: 'lowpass', f: 1200, q: 0.8 } },
  ],
});

_be(HANG.HALAL_MI, {
  nev: 'saját egység elesett',
  esemeny: ESEMENY.HALAL_MI,
  busz: BUSZ.SFX,
  hely: HELY.HARC,
  hangero: 0.34, prioritas: 2, plafon: 3, ismetlesKoz: 130, hangolas: 8,
  retegek: [
    { hullam: 'sawtooth', f0: 280, f1: 90, hossz: 0.28, tamadas: 0.006, hangero: 0.45,
      szuro: { tipus: 'lowpass', f: 950, q: 1.0 } },
    { hullam: 'zaj', f0: 900, f1: 260, hossz: 0.22, tamadas: 0.004, hangero: 0.3,
      szuro: { tipus: 'lowpass', f: 800, q: 0.8 } },
  ],
});

_be(HANG.HALAL_OK, {
  nev: 'ellenséges egység elesett',
  esemeny: ESEMENY.HALAL_OK,
  busz: BUSZ.SFX,
  hely: HELY.HARC,
  hangero: 0.24, prioritas: 0, plafon: 2, ismetlesKoz: 130, hangolas: 8,
  retegek: [
    { hullam: 'triangle', f0: 340, f1: 150, hossz: 0.20, tamadas: 0.005, hangero: 0.4,
      szuro: { tipus: 'lowpass', f: 1400, q: 0.8 } },
  ],
});

_be(HANG.EPULET_OMLIK_MI, {
  nev: 'saját épület összeomlik',
  esemeny: ESEMENY.EPULET_OMLIK_MI,
  busz: BUSZ.SFX,
  hely: HELY.BAZIS,
  hangero: 0.48, prioritas: 3, plafon: 2, ismetlesKoz: 600, hangolas: 5,
  retegek: [
    { hullam: 'zaj', f0: 800, f1: 120, hossz: 0.85, tamadas: 0.010, hangero: 0.65,
      szuro: { tipus: 'lowpass', f: 620, q: 1.1 } },
    { hullam: 'sine', f0: 120, f1: 48, hossz: 0.70, tamadas: 0.008, hangero: 0.5, szuro: null },
  ],
});

_be(HANG.EPULET_OMLIK_OK, {
  nev: 'ellenséges épület összeomlik',
  esemeny: ESEMENY.EPULET_OMLIK_OK,
  busz: BUSZ.SFX,
  hely: HELY.HARC,
  hangero: 0.38, prioritas: 2, plafon: 2, ismetlesKoz: 600, hangolas: 5,
  retegek: [
    { hullam: 'zaj', f0: 1000, f1: 180, hossz: 0.70, tamadas: 0.010, hangero: 0.55,
      szuro: { tipus: 'lowpass', f: 780, q: 1.0 } },
  ],
});

_be(HANG.RIASZTAS, {
  nev: 'támadás alatt állsz',
  esemeny: ESEMENY.TAMADAS_ALATT,
  busz: BUSZ.UI,
  hely: HELY.HALLGATO,
  // 12 másodperces ismétlési köz: a riasztás akkor ér valamit, ha ritka. Egy
  // hosszú ostrom alatt így öt percenként huszonötször szól, nem ezerszer.
  hangero: 0.42, prioritas: 3, plafon: 1, ismetlesKoz: 12000, hangolas: 0,
  retegek: [
    { hullam: 'square', f0: 620, f1: 620, hossz: 0.18, tamadas: 0.006, hangero: 0.45,
      szuro: { tipus: 'lowpass', f: 1600, q: 0.9 } },
    { hullam: 'square', f0: 466, f1: 466, hossz: 0.34, tamadas: 0.006, hangero: 0.40,
      szuro: { tipus: 'lowpass', f: 1600, q: 0.9 } },
  ],
});

// ── ÉPÍTKEZÉS, KÉPZÉS, KUTATÁS ───────────────────────────────────────────

_be(HANG.EPITES_INDUL, {
  nev: 'építkezés indul',
  esemeny: ESEMENY.EPITES_INDUL,
  busz: BUSZ.SFX,
  hely: HELY.BAZIS,
  hangero: 0.30, prioritas: 1, plafon: 1, ismetlesKoz: 150, hangolas: 8,
  retegek: [
    { hullam: 'zaj', f0: 1800, f1: 500, hossz: 0.12, tamadas: 0.003, hangero: 0.45,
      szuro: { tipus: 'bandpass', f: 900, q: 1.2 } },
    { hullam: 'triangle', f0: 220, f1: 165, hossz: 0.14, tamadas: 0.004, hangero: 0.35, szuro: null },
  ],
});

_be(HANG.EPULET_KESZ, {
  nev: 'épület elkészült',
  esemeny: ESEMENY.EPULET_KESZ,
  busz: BUSZ.SFX,
  hely: HELY.BAZIS,
  hangero: 0.34, prioritas: 2, plafon: 2, ismetlesKoz: 250, hangolas: 3,
  retegek: [
    { hullam: 'triangle', f0: 392, f1: 392, hossz: 0.16, tamadas: 0.006, hangero: 0.5, szuro: null },
    { hullam: 'triangle', f0: 588, f1: 588, hossz: 0.30, tamadas: 0.010, hangero: 0.42, szuro: null },
  ],
});

_be(HANG.EGYSEG_KESZ, {
  nev: 'egység elkészült',
  esemeny: ESEMENY.EGYSEG_KESZ,
  busz: BUSZ.UI,
  hely: HELY.BAZIS,
  hangero: 0.26, prioritas: 1, plafon: 1, ismetlesKoz: 200, hangolas: 4,
  retegek: [
    { hullam: 'sine', f0: 660, f1: 880, hossz: 0.12, tamadas: 0.005, hangero: 0.55, szuro: null },
  ],
});

_be(HANG.TECH_KESZ, {
  nev: 'kutatás kész',
  esemeny: ESEMENY.TECH_KESZ,
  busz: BUSZ.UI,
  hely: HELY.HALLGATO,
  hangero: 0.36, prioritas: 2, plafon: 1, ismetlesKoz: 800, hangolas: 0,
  retegek: [
    { hullam: 'sine', f0: 523, f1: 523, hossz: 0.20, tamadas: 0.008, hangero: 0.5, szuro: null },
    { hullam: 'sine', f0: 784, f1: 784, hossz: 0.28, tamadas: 0.012, hangero: 0.45, szuro: null },
    { hullam: 'triangle', f0: 1046, f1: 1046, hossz: 0.40, tamadas: 0.016, hangero: 0.30, szuro: null },
  ],
});

// ── GAZDASÁG ─────────────────────────────────────────────────────────────
// Nyersanyagonként MÁS hang: a játékos csukott szemmel is tudja, mi jön be.
// Ez nem dísz — a HUD számai csak akkor mondanak valamit, ha odanézel.

_be(HANG.GYUJTES_ETEL, {
  nev: 'étel begyűjtve',
  esemeny: ESEMENY.GYUJTES_ETEL,
  busz: BUSZ.SFX,
  hely: HELY.MUNKA,
  hangero: 0.18, prioritas: 0, plafon: 1, ismetlesKoz: 260, hangolas: 10,
  retegek: [
    { hullam: 'zaj', f0: 1400, f1: 600, hossz: 0.07, tamadas: 0.003, hangero: 0.4,
      szuro: { tipus: 'bandpass', f: 700, q: 1.0 } },
  ],
});

_be(HANG.FEJSZE, {
  nev: 'fejszecsapás',
  esemeny: ESEMENY.GYUJTES_FA,
  busz: BUSZ.SFX,
  hely: HELY.MUNKA,
  hangero: 0.22, prioritas: 0, plafon: 1, ismetlesKoz: 300, hangolas: 12,
  retegek: [
    { hullam: 'zaj', f0: 2200, f1: 500, hossz: 0.09, tamadas: 0.002, hangero: 0.45,
      szuro: { tipus: 'bandpass', f: 1100, q: 1.3 } },
    { hullam: 'triangle', f0: 240, f1: 160, hossz: 0.08, tamadas: 0.002, hangero: 0.3, szuro: null },
  ],
});

_be(HANG.CSAKANY, {
  nev: 'csákánycsapás',
  esemeny: ESEMENY.GYUJTES_KO,
  busz: BUSZ.SFX,
  hely: HELY.MUNKA,
  hangero: 0.22, prioritas: 0, plafon: 1, ismetlesKoz: 300, hangolas: 12,
  retegek: [
    { hullam: 'zaj', f0: 4200, f1: 1600, hossz: 0.07, tamadas: 0.001, hangero: 0.45,
      szuro: { tipus: 'highpass', f: 1800, q: 1.0 } },
    { hullam: 'square', f0: 330, f1: 250, hossz: 0.05, tamadas: 0.002, hangero: 0.20,
      szuro: { tipus: 'lowpass', f: 1500, q: 0.7 } },
  ],
});

_be(HANG.KRISTALY_CSENDULES, {
  nev: 'kristály csendülése',
  esemeny: ESEMENY.GYUJTES_KRISTALY,
  busz: BUSZ.SFX,
  hely: HELY.MUNKA,
  hangero: 0.24, prioritas: 1, plafon: 1, ismetlesKoz: 340, hangolas: 8,
  retegek: [
    { hullam: 'sine', f0: 1320, f1: 1320, hossz: 0.22, tamadas: 0.002, hangero: 0.4, szuro: null },
    { hullam: 'sine', f0: 1980, f1: 1980, hossz: 0.16, tamadas: 0.002, hangero: 0.22, szuro: null },
  ],
});

_be(HANG.PIACI_CSERE, {
  nev: 'piaci csere',
  esemeny: ESEMENY.PIACI_CSERE,
  busz: BUSZ.UI,
  hely: HELY.BAZIS,
  hangero: 0.26, prioritas: 1, plafon: 1, ismetlesKoz: 350, hangolas: 6,
  retegek: [
    { hullam: 'triangle', f0: 990, f1: 990, hossz: 0.09, tamadas: 0.002, hangero: 0.4, szuro: null },
    { hullam: 'triangle', f0: 740, f1: 740, hossz: 0.13, tamadas: 0.002, hangero: 0.32, szuro: null },
  ],
});

_be(HANG.KORSZAKVALTAS, {
  nev: 'korszakváltás',
  esemeny: ESEMENY.KORSZAKVALTAS,
  busz: BUSZ.UI,
  hely: HELY.HALLGATO,
  // A játék legritkább és legfontosabb hangja: háromszor szólal meg egy
  // meccsen. Ezért kapja a legnagyobb prioritást és a legmagasabb hangerőt.
  hangero: 0.55, prioritas: 3, plafon: 1, ismetlesKoz: 4000, hangolas: 0,
  retegek: [
    { hullam: 'sine', f0: 146, f1: 146, hossz: 2.20, tamadas: 0.040, hangero: 0.55, szuro: null },
    { hullam: 'triangle', f0: 293, f1: 293, hossz: 1.80, tamadas: 0.060, hangero: 0.40,
      szuro: { tipus: 'lowpass', f: 1800, q: 0.7 } },
    { hullam: 'sine', f0: 440, f1: 440, hossz: 1.40, tamadas: 0.220, hangero: 0.28, szuro: null },
    { hullam: 'zaj', f0: 6000, f1: 900, hossz: 1.60, tamadas: 0.006, hangero: 0.18,
      szuro: { tipus: 'highpass', f: 2400, q: 0.7 } },
  ],
});

/** Név-tábla — a szondának és a hibaüzeneteknek. */
export const HANG_NEV = KATALOGUS.map((k) => k.nev);

/**
 * Hangonként a LEGHOSSZABB réteg hossza EZREDMÁSODPERCBEN.
 *
 * Betöltéskor számoljuk ki, egyszer: a keverő ebből tudja, meddig „foglalt" egy
 * szólam. Ha képkockánként számolnánk, az a vihar forró útján lenne, és pont
 * ott nem akarunk se szorzást, se tömb-bejárást.
 */
export const HANG_HOSSZ_MS = KATALOGUS.map((k) => {
  let max = 0;
  for (let r = 0; r < k.retegek.length; r++) {
    const t = k.retegek[r].tamadas + k.retegek[r].hossz;
    if (t > max) max = t;
  }
  return max * 1000;
});

// ── TÁVOLSÁG ─────────────────────────────────────────────────────────────

/** Ezen belül teljes a hangerő (világegység — a pálya oldala 256). */
export const TAV_TELJES = 26;
/** Ezen túl NÉMA. Ami a képernyőn sincs rajta, azt ne is halljuk. */
export const TAV_VAGAS = 130;
/** Ez alatt a hangerő alatt el sem indítjuk a szólamot. */
export const HALLHATO_KUSZOB = 0.02;

/**
 * TÁVOLSÁG → HANGERŐ-SZORZÓ. Monoton csökkenő, `TAV_VAGAS`-nál pontosan 0.
 *
 * Négyzetes lecsengés, nem lineáris: a lineáris a fél pályányira lévő csatát
 * még a fele hangerőn szólaltatná meg, és a bázis mellett álló játékos a saját
 * munkásait nem hallaná a távoli csihi-puhitól.
 *
 * ⚠️ A MONOTONITÁS NEM ESZTÉTIKAI KÉRDÉS, ezért a szonda külön gátja: ha egy
 * elrontott képlet valahol felfelé kanyarodna, a távolabbi forrás hangosabb
 * lenne a közelinél, és a játékos rossz irányba nézne.
 *
 * @param {number} tav világegységben mért távolság
 * @returns {number} 0..1
 */
export function tavolsagHangero(tav) {
  if (tav <= TAV_TELJES) return 1;
  if (tav >= TAV_VAGAS) return 0;
  const t = (tav - TAV_TELJES) / (TAV_VAGAS - TAV_TELJES);
  const m = 1 - t;
  return m * m;
}

// ── AZ ESEMÉNYFOLYAM: SZÁMLÁLÓ-KÜLÖNBSÉG → ESEMÉNY ───────────────────────

/**
 * A sim halmozott számlálóiból képkockánként eseménylistát képez.
 *
 * ⚠️ NULLA PER-FRAME ALLOKÁCIÓ: a kimenet egy előre lefoglalt `Int32Array`
 * (`MAX_ESEMENY` hosszú, lásd ott), és a hívó a `db` mezőből tudja, meddig
 * érvényes. Nem tömböt adunk vissza, mert ez a metódus képkockánként fut.
 */
export class Esemenyfolyam {
  constructor() {
    /** Az ELŐZŐ képkocka számlálói. */
    this.elozo = new Float64Array(SZAMLALO_DB);
    /** Volt-e már előző képkocka? Az első hívás CSAK rögzít, nem szólaltat meg. */
    this.van = false;
    /**
     * Szabályonkénti MARADÉK: a küszöb alatti növekmény nem vész el, hanem
     * átvihető. Enélkül a lassan csordogáló gyűjtés sosem érné el a küszöböt,
     * és a gazdaság néma maradna — pont az a hiba, amit a v0.3-ban a
     * „minden zöld, de semmi nem történik" eset megtanított.
     */
    this._maradek = new Float64Array(SZABALYOK.length);
    /** Kimenet: `ESEMENY.*` kódok. */
    this.esemeny = new Int32Array(MAX_ESEMENY);
    this.db = 0;
    /** Működés-számok a szondának és a hibakeresésnek. */
    this.stat = { osszEsemeny: 0, levagott: 0 };
  }

  nullaz() {
    this.elozo.fill(0);
    this._maradek.fill(0);
    this.van = false;
    this.db = 0;
    this.stat.osszEsemeny = 0;
    this.stat.levagott = 0;
  }

  /**
   * Egy képkocka.
   * @param {Float64Array} pillanat friss számláló-pillanatkép (`SZAMLALO_DB`)
   * @returns {number} a keletkezett események száma (`this.esemeny[0..db)`)
   */
  lep(pillanat) {
    this.db = 0;
    if (!this.van) {
      // ⚠️ AZ ELSŐ KÉPKOCKA CSAK RÖGZÍT. Betöltés vagy újrafelállás után a
      // számlálók nullából ugranak a mai értékükre; ha ebből eseményt
      // csinálnánk, a mentés visszatöltése egy másodperces hangrobbanás lenne.
      this.elozo.set(pillanat);
      this.van = true;
      return 0;
    }

    for (let s = 0; s < SZABALYOK.length; s++) {
      const sz = SZABALYOK[s];
      const d = (pillanat[sz.szamlalo] - this.elozo[sz.szamlalo]) * sz.irany;
      if (d <= 0) continue;
      const ossz = this._maradek[s] + d;
      let n = (ossz / sz.kuszob) | 0;
      if (n <= 0) { this._maradek[s] = ossz; continue; }

      if (n > sz.maxEsemeny) {
        this.stat.levagott += n - sz.maxEsemeny;
        n = sz.maxEsemeny;
        // ⚠️ A LEVÁGOTT MARADÉK ELVÉSZ, NEM HALMOZÓDIK. Ha átvinnénk, egy
        // 30 másodperces csata után a hangok még percekig csorognának egy üres
        // pályán — a hang a jelenről szól, nem a múltról.
        this._maradek[s] = 0;
      } else {
        this._maradek[s] = ossz - n * sz.kuszob;
      }

      for (let k = 0; k < n; k++) this.esemeny[this.db++] = sz.esemeny;
      this.stat.osszEsemeny += n;
    }

    this.elozo.set(pillanat);
    return this.db;
  }
}

// ── A KEVERŐ ─────────────────────────────────────────────────────────────

/**
 * A vihar második gátja: eldönti, hogy egy hang-kérésből lesz-e szólam.
 *
 * A visszatérés SZÁNDÉKOSAN `boolean`, és az eredő hangerő a `kiHangero`
 * mezőben jön: egy `{ szol, hangero }` objektum képkockánként több százszor
 * keletkezne, és pont a forró úton szemetelne. Ugyanezért nincs itt se `Map`,
 * se `Set`, se `push` — minden előre lefoglalt `Float64Array`/`Int32Array`.
 */
export class Kevero {
  /**
   * @param {{osszPlafon?:number, mester?:number}} [opciok]
   *   `osszPlafon` — ennyi szólam szólhat EGYSZERRE összesen.
   */
  constructor(opciok = {}) {
    this.osszPlafon = opciok.osszPlafon ?? 20;
    this.mester = opciok.mester ?? 1;
    /** Hangonként MIKOR indult utoljára szólam (ms). */
    this._utolso = new Float64Array(HANG_DB).fill(-1e9);
    /** Szólam-nyilvántartás: `[hang * MAX_PLAFON + hely]` = mikor ér véget (ms). */
    this._veg = new Float64Array(HANG_DB * MAX_PLAFON).fill(-1e9);
    /** Körkörös írófej hangonként — nem keresünk szabad helyet, felülírjuk a legrégebbit. */
    this._fej = new Int32Array(HANG_DB);
    /** A LEGUTÓBBI elfogadott kérés eredő hangereje. */
    this.kiHangero = 0;
    /** Működés-számok — ezek árulják el, hogy a gátak tényleg vágnak. */
    this.stat = {
      bejovo: 0, kimeno: 0,
      eldobIsmetles: 0, eldobPlafon: 0, eldobOsszPlafon: 0, eldobTavolsag: 0,
      eldobIsmeretlen: 0,
    };
  }

  nullaz() {
    this._utolso.fill(-1e9);
    this._veg.fill(-1e9);
    this._fej.fill(0);
    this.kiHangero = 0;
    const s = this.stat;
    s.bejovo = 0; s.kimeno = 0; s.eldobIsmetles = 0; s.eldobPlafon = 0;
    s.eldobOsszPlafon = 0; s.eldobTavolsag = 0; s.eldobIsmeretlen = 0;
  }

  /** Mikor indult utoljára ez a hang? (ms; `-1e9`, ha még soha) — a szondának. */
  utoljara(hang) { return this._utolso[hang]; }

  /**
   * Kérés egy hangra.
   *
   * A gátak sorrendje: ismeretlen kód → hallhatóság (távolság) → ismétlési köz
   * → hangonkénti plafon → globális plafon. Az első három O(1); a viharból
   * ide érkező kérések gyakorlatilag mind ott hullanak ki, tehát a drága
   * szólam-számlálás másodpercenként csak néhányszor fut le.
   *
   * @param {number} hang `HANG.*`
   * @param {number} most ezredmásodperc (a HANG saját órája — a sim óráját NEM
   *   ismeri és nem is ismerheti)
   * @param {number} tav a hallgatótól mért távolság világegységben
   * @param {number} [szorzo] külső hangerő-szorzó (busz, halkítás)
   * @returns {boolean} szóljon-e; az eredő hangerő a `kiHangero` mezőben
   */
  ker(hang, most, tav, szorzo = 1) {
    const s = this.stat;
    s.bejovo++;
    const k = KATALOGUS[hang];
    if (k === undefined) { s.eldobIsmeretlen++; return false; }

    const g = k.hangero * szorzo * this.mester * tavolsagHangero(tav);
    if (g < HALLHATO_KUSZOB) { s.eldobTavolsag++; return false; }

    if (most - this._utolso[hang] < k.ismetlesKoz) { s.eldobIsmetles++; return false; }

    // Innentől ritka az út — itt már szabad bejárni.
    const alap = hang * MAX_PLAFON;
    let sajat = 0;
    for (let i = 0; i < MAX_PLAFON; i++) if (this._veg[alap + i] > most) sajat++;
    if (sajat >= k.plafon) { s.eldobPlafon++; return false; }

    let ossz = 0;
    for (let i = 0; i < this._veg.length; i++) if (this._veg[i] > most) ossz++;
    if (ossz >= this.osszPlafon) {
      // A globális plafonnál a PRIORITÁS dönt: a korszakváltás és a saját
      // épület összeomlása akkor is átjön, ha épp ezer nyílvessző repül.
      if (k.prioritas < 3) { s.eldobOsszPlafon++; return false; }
    }

    this._utolso[hang] = most;
    this._veg[alap + this._fej[hang]] = most + HANG_HOSSZ_MS[hang];
    this._fej[hang] = (this._fej[hang] + 1) % MAX_PLAFON;
    this.kiHangero = g;
    s.kimeno++;
    return true;
  }
}

// ── ZENE ─────────────────────────────────────────────────────────────────
//
// A zene ugyanúgy SZINTETIZÁLT, és ugyanúgy paraméter-tábla: korszakonként egy
// hangnem, egy skála és egy ütem. A `hang.js` ebből szemez ki hangokat — nem
// dallamot játszik le, hanem generál. Ez megint a „nincs asset" szabályból
// következik, de van egy második haszna is: a korszakváltás így nem sávváltás,
// hanem HANGNEMVÁLTÁS, tehát nincs vágás a zenében.
//
// A skála félhang-lépésekben van megadva az alaphangtól. Mind a négy pentaton
// vagy hexaton: a pentaton skálán VÉLETLEN sorrendben leütött hangok is
// összecsengenek, tehát nem kell dallamot komponálni ahhoz, hogy ne szóljon
// hamisan. Ez a legolcsóbb módja egy hallgatható, végtelen aláfestésnek.

/** Félhang → frekvencia-arány. Tábla, hogy ne kelljen `Math.pow` a forró úton. */
export const FELHANG_ARANY = [
  1, 1.059463, 1.122462, 1.189207, 1.259921, 1.334840,
  1.414214, 1.498307, 1.587401, 1.681793, 1.781797, 1.887749,
];

/**
 * Félhang → frekvencia. A tábla 12 elemű, az oktávot kettő-hatványozás adja
 * (egész léptetéssel, tehát `Math.pow` nélkül).
 * @param {number} alap Hz
 * @param {number} felhang egész, lehet negatív is
 */
export function felhangFrekvencia(alap, felhang) {
  let f = felhang | 0;
  let szorzo = 1;
  while (f < 0) { f += 12; szorzo *= 0.5; }
  while (f >= 12) { f -= 12; szorzo *= 2; }
  return alap * FELHANG_ARANY[f] * szorzo;
}

/**
 * Korszakonkénti zene-tábla, `KORSZAK.*` szerint indexelve (sötét, hajnal,
 * kristály, fény). Az ötödik bejegyzés a HARCI aláfestés.
 *
 * - `alap`      a hangnem alapja Hz-ben
 * - `skala`     félhang-lépések az alaptól
 * - `utemMs`    ennyi ezredmásodpercenként dől el, szólal-e meg hang
 * - `suru`      %-os esély, hogy egy ütemre tényleg jut hang (a ritkaság a
 *               lényeg: egy folyamatos csilingelés fél óra alatt elviselhetetlen)
 * - `dallamReteg` melyik réteg játssza a skála hangjait; a többi ORGONAPONT
 *                 (folyamatos alaphang)
 */
export const ZENE = [];

ZENE[0] = {
  nev: 'sötét kor',
  ok: 'gazdasag.korszak[saját] === 0 — a réteg a korszakból választ, váltáskor átúsztat',
  alap: 110, skala: [0, 3, 5, 7, 10], utemMs: 700, suru: 45, hangero: 0.16,
  dallamReteg: 1,
  retegek: [
    { hullam: 'sine', f0: 110, f1: 110, hossz: 3.2, tamadas: 0.9, hangero: 0.35,
      szuro: { tipus: 'lowpass', f: 420, q: 0.7 } },
    { hullam: 'triangle', f0: 220, f1: 220, hossz: 1.1, tamadas: 0.06, hangero: 0.30,
      szuro: { tipus: 'lowpass', f: 1400, q: 0.8 } },
  ],
};

ZENE[1] = {
  nev: 'hajnal kora',
  ok: 'gazdasag.korszak[saját] === 1',
  alap: 131, skala: [0, 2, 4, 7, 9], utemMs: 620, suru: 52, hangero: 0.17,
  dallamReteg: 1,
  retegek: [
    { hullam: 'sine', f0: 131, f1: 131, hossz: 3.0, tamadas: 0.8, hangero: 0.32,
      szuro: { tipus: 'lowpass', f: 520, q: 0.7 } },
    { hullam: 'triangle', f0: 262, f1: 262, hossz: 0.9, tamadas: 0.04, hangero: 0.32,
      szuro: { tipus: 'lowpass', f: 1800, q: 0.8 } },
  ],
};

ZENE[2] = {
  nev: 'kristály kora',
  ok: 'gazdasag.korszak[saját] === 2',
  alap: 147, skala: [0, 2, 4, 6, 9, 11], utemMs: 540, suru: 58, hangero: 0.18,
  dallamReteg: 1,
  retegek: [
    { hullam: 'triangle', f0: 147, f1: 147, hossz: 2.6, tamadas: 0.7, hangero: 0.30,
      szuro: { tipus: 'lowpass', f: 700, q: 0.8 } },
    { hullam: 'sine', f0: 588, f1: 588, hossz: 0.8, tamadas: 0.02, hangero: 0.28, szuro: null },
  ],
};

ZENE[3] = {
  nev: 'fény kora',
  ok: 'gazdasag.korszak[saját] === 3',
  alap: 165, skala: [0, 2, 4, 7, 9, 12], utemMs: 480, suru: 62, hangero: 0.19,
  dallamReteg: 1,
  retegek: [
    { hullam: 'triangle', f0: 165, f1: 165, hossz: 2.4, tamadas: 0.6, hangero: 0.30,
      szuro: { tipus: 'lowpass', f: 900, q: 0.8 } },
    { hullam: 'sine', f0: 660, f1: 660, hossz: 0.7, tamadas: 0.02, hangero: 0.30, szuro: null },
  ],
};

/**
 * HARCI aláfestés. Nem külön szám, hanem a korszak-zene helyére lépő,
 * sötétebb és sűrűbb változat — a `hang.js` akkor kapcsol rá, ha a
 * csapás-események sűrűsége átlép egy küszöböt, és halkulva enged vissza.
 */
export const ZENE_HARC = {
  nev: 'csata',
  ok: 'a CSAPAS és SEBZODES események sűrűsége átlépi a HARCI_KUSZOB-öt',
  alap: 98, skala: [0, 1, 5, 7, 8], utemMs: 340, suru: 78, hangero: 0.22,
  dallamReteg: 1,
  retegek: [
    { hullam: 'sawtooth', f0: 98, f1: 98, hossz: 1.6, tamadas: 0.35, hangero: 0.28,
      szuro: { tipus: 'lowpass', f: 380, q: 1.1 } },
    { hullam: 'square', f0: 196, f1: 196, hossz: 0.5, tamadas: 0.02, hangero: 0.22,
      szuro: { tipus: 'lowpass', f: 1100, q: 0.9 } },
  ],
};

/** Minden zene-bejegyzés egy tömbben — a szonda és a `hang.js` ezt járja be. */
export const ZENE_MIND = [ZENE[0], ZENE[1], ZENE[2], ZENE[3], ZENE_HARC];

/** Ennyi csapás-esemény / másodperc felett vált a zene harcira. */
export const HARCI_KUSZOB = 2.5;
/** Ennyi ezredmásodperc alatt úszik át a zene egyik témáról a másikra. */
export const ZENE_ATUSZAS_MS = 2500;

// ── ÉPSÉG-ELLENŐRZÉS ─────────────────────────────────────────────────────

/**
 * EGY réteg paramétereinek épsége — hibalista, nem `boolean`.
 *
 * ⚠️ EZ NEM PEDANTÉRIA. Egy `undefined` frekvencia a WebAudio-ban NEM dob
 * kivételt: az `OscillatorNode.frequency.value = undefined` `NaN`-t ad, a
 * csomópont pedig NÉMÁN nem szól. Semmilyen konzol-üzenet nem jön róla, a
 * játék tökéletesen fut — csak egy hang hiányzik. Pont az a hibafajta, amit
 * csak egy szonda talál meg.
 *
 * @returns {string[]} üres tömb = ép
 */
export function retegHibak(r, utvonal) {
  const h = [];
  const p = utvonal + ': ';
  if (r === null || typeof r !== 'object') return [p + 'a réteg nem objektum'];
  if (HULLAMOK.indexOf(r.hullam) < 0) h.push(p + 'ismeretlen hullámforma: ' + r.hullam);
  for (const kulcs of ['f0', 'f1', 'hossz', 'tamadas', 'hangero']) {
    const v = r[kulcs];
    if (typeof v !== 'number' || !isFinite(v)) h.push(p + kulcs + ' nem véges szám: ' + v);
  }
  if (typeof r.f0 === 'number' && (r.f0 <= 0 || r.f0 > 20000)) h.push(p + 'f0 hallható sávon kívül: ' + r.f0);
  if (typeof r.f1 === 'number' && (r.f1 <= 0 || r.f1 > 20000)) h.push(p + 'f1 hallható sávon kívül: ' + r.f1);
  if (typeof r.hossz === 'number' && r.hossz <= 0) h.push(p + 'a hossz nem pozitív: ' + r.hossz);
  if (typeof r.tamadas === 'number' && r.tamadas < 0) h.push(p + 'negatív felfutás: ' + r.tamadas);
  if (typeof r.hangero === 'number' && (r.hangero <= 0 || r.hangero > 1)) {
    h.push(p + 'a réteg hangereje nem (0,1]: ' + r.hangero);
  }
  if (r.szuro !== null) {
    if (typeof r.szuro !== 'object') h.push(p + 'a szűrő nem objektum és nem null');
    else {
      if (SZUROK.indexOf(r.szuro.tipus) < 0) h.push(p + 'ismeretlen szűrő-fajta: ' + r.szuro.tipus);
      if (typeof r.szuro.f !== 'number' || r.szuro.f <= 0 || r.szuro.f > 20000) {
        h.push(p + 'szűrő-frekvencia hallható sávon kívül: ' + r.szuro.f);
      }
      if (typeof r.szuro.q !== 'number' || r.szuro.q <= 0) h.push(p + 'szűrő Q nem pozitív: ' + r.szuro.q);
    }
  } else if (r.hullam === 'zaj') {
    // A szűretlen zaj minden hangnál ugyanaz a „pssz" — az egyetlen dolog,
    // ami a fejszecsapást a nyílvesszőtől megkülönbözteti, a szűrő.
    h.push(p + 'a `zaj` réteghez KÖTELEZŐ a szűrő');
  }
  return h;
}

/**
 * EGY katalógus-bejegyzés épsége.
 * @returns {string[]} üres tömb = ép
 */
export function bejegyzesHibak(k, utvonal) {
  const h = [];
  const p = utvonal + ': ';
  if (k === null || typeof k !== 'object') return [p + 'nincs bejegyzés (undefined)'];
  if (typeof k.nev !== 'string' || k.nev.length < 3) h.push(p + 'hiányzó vagy túl rövid név');
  if (!Array.isArray(k.retegek) || k.retegek.length === 0) h.push(p + 'nincs egyetlen rétege sem');
  if (typeof k.hangero !== 'number' || k.hangero <= 0 || k.hangero > 1) {
    h.push(p + 'a bejegyzés hangereje nem (0,1]: ' + k.hangero);
  }
  if (Array.isArray(k.retegek)) {
    for (let r = 0; r < k.retegek.length; r++) {
      const hh = retegHibak(k.retegek[r], utvonal + '/' + r + '. réteg');
      for (let i = 0; i < hh.length; i++) h.push(hh[i]);
    }
  }
  return h;
}

/**
 * EGY SFX-bejegyzés épsége — a keverési paraméterekkel együtt.
 * @returns {string[]}
 */
export function sfxHibak(k, utvonal) {
  const h = bejegyzesHibak(k, utvonal);
  const p = utvonal + ': ';
  if (k === null || typeof k !== 'object') return h;
  if (!Number.isInteger(k.plafon) || k.plafon < 1 || k.plafon > MAX_PLAFON) {
    h.push(p + 'a plafon nem 1..' + MAX_PLAFON + ': ' + k.plafon);
  }
  if (typeof k.ismetlesKoz !== 'number' || k.ismetlesKoz <= 0) {
    h.push(p + 'az ismétlési köz nem pozitív: ' + k.ismetlesKoz);
  }
  if (!Number.isInteger(k.prioritas) || k.prioritas < 0 || k.prioritas > 3) {
    h.push(p + 'a prioritás nem 0..3: ' + k.prioritas);
  }
  if (typeof k.hangolas !== 'number' || k.hangolas < 0 || k.hangolas > 50) {
    h.push(p + 'a hangolás-szórás nem 0..50 %: ' + k.hangolas);
  }
  if (BUSZ_NEV[k.busz] === undefined) h.push(p + 'ismeretlen busz: ' + k.busz);
  if (k.hely !== HELY.HALLGATO && k.hely !== HELY.HARC
      && k.hely !== HELY.MUNKA && k.hely !== HELY.BAZIS) {
    h.push(p + 'ismeretlen hely-kód: ' + k.hely);
  }
  if (ESEMENY_OK[k.esemeny] === undefined) {
    h.push(p + 'a bejegyzés nem nevez meg érvényes kiváltó eseményt: ' + k.esemeny);
  }
  return h;
}

/** Zene-bejegyzés épsége. */
export function zeneHibak(z, utvonal) {
  const h = bejegyzesHibak(z, utvonal);
  const p = utvonal + ': ';
  if (z === null || typeof z !== 'object') return h;
  if (typeof z.ok !== 'string' || z.ok.length < 10) h.push(p + 'nincs megnevezve a kiváltó ok');
  if (typeof z.alap !== 'number' || z.alap < 30 || z.alap > 2000) h.push(p + 'az alaphang sávon kívül: ' + z.alap);
  if (!Array.isArray(z.skala) || z.skala.length < 3) h.push(p + 'a skála rövidebb három hangnál');
  else for (let i = 0; i < z.skala.length; i++) {
    if (!Number.isInteger(z.skala[i])) h.push(p + 'a skála ' + i + '. eleme nem egész félhang');
  }
  if (typeof z.utemMs !== 'number' || z.utemMs < 60) h.push(p + 'az ütem túl rövid: ' + z.utemMs);
  if (typeof z.suru !== 'number' || z.suru <= 0 || z.suru > 100) h.push(p + 'a sűrűség nem (0,100]: ' + z.suru);
  if (!Number.isInteger(z.dallamReteg) || !Array.isArray(z.retegek)
      || z.dallamReteg < 0 || z.dallamReteg >= z.retegek.length) {
    h.push(p + 'a dallamReteg nem mutat létező rétegre: ' + z.dallamReteg);
  }
  return h;
}
