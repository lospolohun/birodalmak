// PORTAL HUB TYCOON — HANG-KATALÓGUS.
//
// ── MIÉRT VAN EZ A FÁJL ───────────────────────────────────────────────────
// Ugyanaz az elv, mint az `epuletek.js`-nél: a hang ADAT, nem kód. Egy új
// effekt EGY bejegyzés ebben az objektumban, és onnantól szól — nem kell
// hozzá se új függvény, se új `switch`-ág a lejátszóban. Ha ehelyett minden
// hangnak saját kódága lenne, a tizedik effektnél a `hang.js` olvashatatlan
// oszcillátor-spagetti lenne, és senki nem merne hozzányúlni a hangoláshoz.
//
// A hangolás ugyanis ITT történik: a játékteszt után az ember egy számot húz
// át (frekvencia, burkoló, szűrő), nem gráfot köt újra. Ez a különbség
// aközött, hogy a hangkép a HUSZADIK próbálkozás után jó lesz, vagy aközött,
// hogy megmarad az elsőnél.
//
// ── NINCS EGYETLEN HANGFÁJL SEM ───────────────────────────────────────────
// A projekt ígérete, hogy a `dist/` bárhová másolható, és nincs második
// hálózati kérés. Ezért minden hang PROCEDURÁLIS: oszcillátor, zajpuffer,
// szűrő, burkológörbe. Ennek mellékhaszna, hogy a teljes hangrendszer néhány
// kilobájt — egy közepes mp3 sokszorosa lenne az egésznek.
//
// ── AMIT A SZONDA ELLENŐRIZ ───────────────────────────────────────────────
// A `tools/hang_szonda.mjs` ezt a fájlt tiszta node-ban importálja, és
// átnézi mezőnként. Ezért NEM importálhat semmit a WebAudióból vagy a DOM-ból,
// és nem lehet benne `Math.random` sem: ez színtiszta adat.

// ══════════════════════════════════════════════════════════════════════════
//  A SZERZŐDÉS: milyen kódokra kell szólnia valaminek
// ══════════════════════════════════════════════════════════════════════════
//
// Ez a lista a `hang.jelez(kod)` teljes felülete. A szonda ehhez méri a
// katalógust: ha ide felveszel egy kódot, de nem írod meg a hangját, a kapu
// pirosra vált — pont fordítva, mint a néma elfelejtett effekt esetében,
// amiről sosem derülne ki, hogy hiányzik.
export const JELZES_KODOK = [
  'gomb',          // UI kattintás
  'epit',          // épület lerakva
  'bont',          // bontás
  'hiba',          // elutasított parancs
  'kassza',        // nagyobb bevétel
  'kapu_nyit',     // új dimenziókapu nyílt
  'omlas',         // a kapu összeomlott — riasztó
  'esemeny',       // esemény indult
  'fejezet',       // fejezetváltás — rövid fanfár
  'gyozelem',
  'csod',
  'kutatas_kesz',
];

// ══════════════════════════════════════════════════════════════════════════
//  A RÉTEG-SÉMA
// ══════════════════════════════════════════════════════════════════════════
//
// Egy hang = rétegek listája. Egy réteg = EGY hangforrás + burkoló + szűrő.
// A rétegzés azért kell, mert a felismerhető hangoknak MINDIG legalább két
// összetevőjük van: egy testet adó alaphang és egy tranziens (koppanás,
// sziszegés), ami elárulja, mi történt. Csak alaphangból „szintetizátor"
// lesz, csak tranziensből „kattogás".
//
//   fajta       'osc' (oszcillátor) | 'zaj' (zajpuffer)
//   hullam      osc esetén: 'sine' | 'triangle' | 'sawtooth' | 'square'
//   barna       zaj esetén: igaz → barna (mély, morajló) zaj a fehér helyett
//   f           alapfrekvencia Hz-ben (zajnál a lejátszási ütem viszonyítása)
//   fVeg        ha van, a hang ide csúszik `hossz` alatt
//   csuszas     'exp' (fülnek egyenletes) | 'lin'
//   elhangolas  finomhangolás centben — két réteg lebegtetéséhez
//   keses       ennyi másodperccel a jelzés UTÁN indul
//   hossz       a kitartott szakasz hossza (utána jön az elengedés)
//   hangero     réteg-szintű szorzó
//   burok       { tamad, lecseng, tart, elenged } — ADSR. A `tart` SZINT
//               (0..1), a többi IDŐ másodpercben. A nulla `tamad` tilos:
//               abból lesz a kattanás, ami az egész hangképet olcsóvá teszi.
//   szuro       null | { fajta, f, fVeg, q } — a színt ez adja
//   jegyek      null | [[keses, frekvencia-szorzó], …] — a réteg ennyiszer
//               szólal meg. Ettől lesz egy fanfár EGY sor, nem négy réteg.
//
// A hang SZINTJÉN (nem rétegenként) még három mező van, és mind a három
// olyan bajra válasz, ami csak HOSSZÚ játék alatt jön elő:
//
//   valtozat    { hangolas, hangero, ido } — megszólalásonkénti véletlen
//               eltérés (arányban, ill. másodpercben). MIÉRT: egy hang, ami
//               ezerszer BITRE ugyanaz, húsz perc alatt idegesítő lesz — a
//               fül a gépies ISMÉTLŐDÉST veszi észre, nem a hangot magát. A
//               dallamos hangoknál a `hangolas` szándékosan pici (±1 %,
//               vagyis ±17 cent): ott a variáció hamis hangnak hallatszana.
//               A szonda 6. vizsgálata méri, hogy tényleg szór.
//   ter         0..1 — mennyit küld a hang a közös zengetőre. A közös tér az,
//               amitől a tizenkét külön effekt EGY helyen szól.
//   torlodas    másodperc — ugyanaz a hang ennyin belül nem szólal meg
//               kétszer. MIÉRT: ha egy képkockában hat kassza fizet ki, hat
//               azonos hang indul azonos időben — az nem hatszor hangosabb
//               kassza, hanem egy fésűszűrt reccsenés.

/** Egyetlen közös hangolási alap, hogy a fanfárok ne veszekedjenek. */
const T = {
  g3: 196.00, c4: 261.63, d4: 293.66, f4: 349.23, g4: 392.00,
  a4: 440.00, c5: 523.25, d5: 587.33, e5: 659.25, g5: 783.99,
  c6: 1046.50, e6: 1318.51, g6: 1567.98, c7: 2093.00,
};

/** Félhang-arányok — a `jegyek` szorzói ezekből állnak össze. */
const KISTERC = 1.18921, NAGYTERC = 1.25992, KVART = 1.33484, KVINT = 1.49831, OKTAV = 2;

export const HANGOK = {
  // ── UI ──────────────────────────────────────────────────────────────────
  // Halk és RÖVID. Egy kattanás, amit ezerszer hallasz egy játszás alatt,
  // csak akkor marad elviselhető, ha 40 ms alatt véget ér.
  // A `valtozat` itt a legnagyobb az egész katalógusban: ezt a hangot egy
  // játszás alatt ezerszer hallod, tehát ennek KELL a legjobban változnia.
  // Nem dallamos, tehát a ±4,5 %-os hangolás nem hallatszik hamisnak, csak
  // annyit, hogy „nem gép kattog".
  gomb: {
    nev: 'Kattintás', hangero: 0.30, elsobbseg: 0,
    valtozat: { hangolas: 0.045, hangero: 0.18, ido: 0.002 }, ter: 0.07, torlodas: 0.035,
    retegek: [
      { fajta: 'osc', hullam: 'triangle', f: 900, fVeg: 620, csuszas: 'exp',
        hossz: 0.03, hangero: 0.50, burok: { tamad: 0.002, lecseng: 0.03, tart: 0, elenged: 0.03 } },
      // A sziszegő él 2600-ról 2100-ra: a 2,5–6 kHz-es sáv az, ami ezerszer
      // hallgatva a leghamarabb fáraszt, és ebből pont a kattintás adja a
      // legtöbbet — mert ebből van a legtöbb.
      { fajta: 'zaj', hossz: 0.02, hangero: 0.17,
        szuro: { fajta: 'highpass', f: 2100, q: 0.7 },
        burok: { tamad: 0.001, lecseng: 0.02, tart: 0, elenged: 0.02 } },
    ],
  },

  // ── ÉPÍTÉS ──────────────────────────────────────────────────────────────
  // Mély koppanás + egy világos nyugtázó blipp. A koppanás mondja, hogy
  // „leraktam", a blipp azt, hogy „és el is fogadta".
  epit: {
    nev: 'Épület lerakva', hangero: 0.55, elsobbseg: 1,
    valtozat: { hangolas: 0.050, hangero: 0.16, ido: 0.006 }, ter: 0.30, torlodas: 0.05,
    retegek: [
      { fajta: 'osc', hullam: 'sine', f: 190, fVeg: 70, csuszas: 'exp',
        hossz: 0.10, hangero: 0.90, burok: { tamad: 0.004, lecseng: 0.10, tart: 0, elenged: 0.10 } },
      { fajta: 'zaj', barna: true, hossz: 0.09, hangero: 0.50,
        szuro: { fajta: 'lowpass', f: 1800, fVeg: 300, q: 0.9 },
        burok: { tamad: 0.002, lecseng: 0.09, tart: 0, elenged: 0.06 } },
      { fajta: 'osc', hullam: 'triangle', f: T.e5, keses: 0.05,
        hossz: 0.05, hangero: 0.22, burok: { tamad: 0.004, lecseng: 0.06, tart: 0, elenged: 0.05 } },
    ],
  },

  // ── BONTÁS ──────────────────────────────────────────────────────────────
  // Lefelé söprő zaj + három apró reccsenés. A bontás legyen kicsit
  // kellemetlen: pénzbe kerül.
  bont: {
    nev: 'Bontás', hangero: 0.52, elsobbseg: 1,
    valtozat: { hangolas: 0.055, hangero: 0.16, ido: 0.011 }, ter: 0.34, torlodas: 0.06,
    retegek: [
      { fajta: 'zaj', barna: true, hossz: 0.26, hangero: 0.75,
        szuro: { fajta: 'lowpass', f: 2400, fVeg: 220, q: 1 },
        burok: { tamad: 0.004, lecseng: 0.26, tart: 0.15, elenged: 0.16 } },
      { fajta: 'osc', hullam: 'sawtooth', f: 150, fVeg: 48, csuszas: 'exp',
        hossz: 0.24, hangero: 0.38, szuro: { fajta: 'lowpass', f: 700, q: 1 },
        burok: { tamad: 0.005, lecseng: 0.22, tart: 0, elenged: 0.12 } },
      { fajta: 'zaj', hossz: 0.03, hangero: 0.28,
        szuro: { fajta: 'bandpass', f: 1500, q: 3 },
        burok: { tamad: 0.001, lecseng: 0.03, tart: 0, elenged: 0.02 },
        jegyek: [[0, 1], [0.06, 1.3], [0.13, 0.9]] },
    ],
  },

  // ── ELUTASÍTÁS ──────────────────────────────────────────────────────────
  // Két lefelé lépő, tompa hang. Szándékosan NEM éles csipogás: a játékos
  // hibázni fog, és egy bántó hangtól hamarabb kapcsolja le a hangot, mint
  // ahogy megtanulja a szabályt.
  hiba: {
    nev: 'Elutasított parancs', hangero: 0.40, elsobbseg: 2,
    valtozat: { hangolas: 0.030, hangero: 0.10, ido: 0.007 }, ter: 0.16, torlodas: 0.14,
    retegek: [
      { fajta: 'osc', hullam: 'square', f: 300, hossz: 0.07, hangero: 0.34,
        szuro: { fajta: 'lowpass', f: 1200, q: 0.8 },
        burok: { tamad: 0.003, lecseng: 0.05, tart: 0.6, elenged: 0.05 },
        jegyek: [[0, 1], [0.09, 0.75]] },
      { fajta: 'osc', hullam: 'sawtooth', f: 148, hossz: 0.16, hangero: 0.24,
        szuro: { fajta: 'lowpass', f: 900, q: 0.8 },
        burok: { tamad: 0.004, lecseng: 0.14, tart: 0.2, elenged: 0.10 } },
    ],
  },

  // ── KASSZA ──────────────────────────────────────────────────────────────
  // Felfelé lépő harang-hármas + egy fémes „csing". A tycoon legfontosabb
  // jutalomhangja: ezt kell megkívánni.
  kassza: {
    nev: 'Bevétel', hangero: 0.50, elsobbseg: 1,
    valtozat: { hangolas: 0.015, hangero: 0.15, ido: 0.008 }, ter: 0.36, torlodas: 0.09,
    retegek: [
      { fajta: 'osc', hullam: 'triangle', f: T.c6, hossz: 0.09, hangero: 0.32,
        burok: { tamad: 0.002, lecseng: 0.20, tart: 0.05, elenged: 0.35 },
        jegyek: [[0, 1], [0.07, KVINT], [0.15, OKTAV]] },
      { fajta: 'osc', hullam: 'sine', f: T.c7, hossz: 0.05, hangero: 0.17,
        burok: { tamad: 0.002, lecseng: 0.12, tart: 0, elenged: 0.25 },
        jegyek: [[0.01, 1], [0.08, KVINT]] },
      // A „csing" a 2,5–6 kHz-es sávba viszi a kasszát. Ez az EGYETLEN hang,
      // ami tudatosan oda kerül: ritka, jutalom, és így a nyüzsgés fölött is
      // azonnal felismerhető — a fül a hirtelen megjelenő csillogásra kapja
      // fel a fejét, nem a hangerőre.
      { fajta: 'zaj', hossz: 0.05, hangero: 0.26,
        szuro: { fajta: 'highpass', f: 5200, q: 0.7 },
        burok: { tamad: 0.001, lecseng: 0.06, tart: 0, elenged: 0.09 } },
    ],
  },

  // ── KAPUNYITÁS ──────────────────────────────────────────────────────────
  // Több mint egy másodperces FELFELÉ söprés, a végén csillogással. Ez a
  // játék legnagyobb pillanata (új világ), tehát legyen ideje kibontakozni.
  kapu_nyit: {
    nev: 'Dimenziókapu nyílik', hangero: 0.60, elsobbseg: 2,
    valtozat: { hangolas: 0.018, hangero: 0.10, ido: 0.012 }, ter: 0.58, torlodas: 0.50,
    retegek: [
      { fajta: 'osc', hullam: 'sine', f: 70, fVeg: 620, csuszas: 'exp',
        hossz: 1.10, hangero: 0.50,
        szuro: { fajta: 'bandpass', f: 300, fVeg: 2400, q: 2.5 },
        burok: { tamad: 0.25, lecseng: 0.50, tart: 0.55, elenged: 0.70 } },
      { fajta: 'osc', hullam: 'sawtooth', f: 138, fVeg: 552, csuszas: 'exp',
        elhangolas: 7, hossz: 1.10, hangero: 0.20,
        szuro: { fajta: 'lowpass', f: 400, fVeg: 2600, q: 1.2 },
        burok: { tamad: 0.35, lecseng: 0.50, tart: 0.40, elenged: 0.80 } },
      { fajta: 'zaj', hossz: 1.00, hangero: 0.15,
        szuro: { fajta: 'bandpass', f: 400, fVeg: 3200, q: 1.2 },
        burok: { tamad: 0.40, lecseng: 0.40, tart: 0.50, elenged: 0.60 } },
      { fajta: 'osc', hullam: 'triangle', f: T.a4, keses: 0.75, hossz: 0.16, hangero: 0.16,
        burok: { tamad: 0.01, lecseng: 0.25, tart: 0.10, elenged: 0.50 },
        jegyek: [[0, 1], [0.12, KVINT], [0.24, OKTAV]] },
    ],
  },

  // ── ÖSSZEOMLÁS ──────────────────────────────────────────────────────────
  // A KATASZTRÓFA-HANG. Zuhanó szirénahang + mély moraj + négy riasztó
  // csipogás. Ez az egyetlen effekt, ami átvágja az összes többit
  // (`elsobbseg: 3`), mert ha ez szól, minden mást el kell felejteni.
  omlas: {
    nev: 'Kapu-összeomlás', hangero: 1.05, elsobbseg: 3,
    valtozat: { hangolas: 0.022, hangero: 0.07, ido: 0.008 }, ter: 0.62, torlodas: 0.45,
    retegek: [
      { fajta: 'osc', hullam: 'sawtooth', f: 420, fVeg: 62, csuszas: 'exp',
        hossz: 1.40, hangero: 0.50,
        szuro: { fajta: 'lowpass', f: 2000, fVeg: 260, q: 3 },
        burok: { tamad: 0.01, lecseng: 1.20, tart: 0.25, elenged: 0.60 } },
      { fajta: 'zaj', barna: true, hossz: 1.60, hangero: 0.80,
        szuro: { fajta: 'lowpass', f: 900, fVeg: 120, q: 1 },
        burok: { tamad: 0.05, lecseng: 1.30, tart: 0.35, elenged: 0.90 } },
      { fajta: 'osc', hullam: 'square', f: 620, hossz: 0.16, hangero: 0.24,
        szuro: { fajta: 'bandpass', f: 700, q: 2 },
        burok: { tamad: 0.006, lecseng: 0.05, tart: 0.75, elenged: 0.10 },
        jegyek: [[0.05, 1], [0.30, 0.86], [0.55, 1], [0.80, 0.86]] },
    ],
  },

  // ── ESEMÉNY ─────────────────────────────────────────────────────────────
  // Két hangos „figyelj ide" harang. Nem riasztó, csak felkapod rá a fejed.
  //
  // A hangolás a d5-ről (587 Hz) az a5-re (880 Hz) került, és kapott egy
  // 2,76-szoros felhangot. MIÉRT: a paletta mérve a 400–1000 Hz-es sávba
  // zsúfolódott — a fanfár, a kapunyitás, a győzelem és az esemény MIND oda
  // esett, tehát nyüzsgés közben nem lehetett őket megkülönböztetni. A 2,76
  // nem véletlen szám: a csöves harang jellegzetes, NEM egész számú
  // felhangja. Ettől lesz „harang" és nem „síp", és ez viszi a hangot a
  // magasabb sávba anélkül, hogy élessé válna.
  esemeny: {
    nev: 'Esemény', hangero: 0.52, elsobbseg: 2,
    valtozat: { hangolas: 0.015, hangero: 0.12, ido: 0.009 }, ter: 0.42, torlodas: 0.25,
    retegek: [
      { fajta: 'osc', hullam: 'triangle', f: T.a4 * 2, hossz: 0.20, hangero: 0.30,
        burok: { tamad: 0.006, lecseng: 0.30, tart: 0.12, elenged: 0.50 },
        jegyek: [[0, 1], [0.13, KVINT]] },
      { fajta: 'osc', hullam: 'sine', f: T.a4 * 2 * 2.76, hossz: 0.10, hangero: 0.14,
        burok: { tamad: 0.006, lecseng: 0.22, tart: 0, elenged: 0.35 },
        jegyek: [[0, 1], [0.13, KVINT]] },
      // Egy oktávval lentebbi test: enélkül a harang vékony, „olcsó csengő".
      { fajta: 'osc', hullam: 'sine', f: T.a4, hossz: 0.26, hangero: 0.15,
        burok: { tamad: 0.010, lecseng: 0.40, tart: 0.10, elenged: 0.55 },
        jegyek: [[0, 1], [0.13, KVINT]] },
    ],
  },

  // ── FEJEZETVÁLTÁS ───────────────────────────────────────────────────────
  // Négy hangból álló, felfelé lépő fanfár, alul fűrésszel megtámasztva.
  // A `jegyek` mező pontosan ezért van: ez itt két sor, nem nyolc réteg.
  fejezet: {
    nev: 'Fejezetváltás', hangero: 0.58, elsobbseg: 3,
    valtozat: { hangolas: 0.008, hangero: 0.08, ido: 0.011 }, ter: 0.46, torlodas: 0.60,
    retegek: [
      { fajta: 'osc', hullam: 'triangle', f: T.g4, hossz: 0.13, hangero: 0.38,
        burok: { tamad: 0.008, lecseng: 0.12, tart: 0.60, elenged: 0.28 },
        jegyek: [[0, 1], [0.14, NAGYTERC], [0.28, KVINT], [0.42, OKTAV]] },
      { fajta: 'osc', hullam: 'sawtooth', f: T.g3, hossz: 0.13, hangero: 0.16,
        szuro: { fajta: 'lowpass', f: 1600, q: 0.8 },
        burok: { tamad: 0.010, lecseng: 0.12, tart: 0.50, elenged: 0.30 },
        jegyek: [[0, 1], [0.14, NAGYTERC], [0.28, KVINT], [0.42, OKTAV]] },
      { fajta: 'osc', hullam: 'sine', f: T.g6, keses: 0.44, hossz: 0.50, hangero: 0.10,
        burok: { tamad: 0.02, lecseng: 0.60, tart: 0.20, elenged: 0.80 } },
    ],
  },

  // ── GYŐZELEM ────────────────────────────────────────────────────────────
  gyozelem: {
    nev: 'Győzelem', hangero: 0.78, elsobbseg: 3,
    valtozat: { hangolas: 0.006, hangero: 0.07, ido: 0.012 }, ter: 0.52, torlodas: 1.00,
    retegek: [
      { fajta: 'osc', hullam: 'triangle', f: T.c5, hossz: 0.16, hangero: 0.38,
        burok: { tamad: 0.008, lecseng: 0.16, tart: 0.60, elenged: 0.40 },
        jegyek: [[0, 1], [0.12, NAGYTERC], [0.24, KVINT], [0.36, OKTAV], [0.52, KVINT], [0.64, OKTAV]] },
      { fajta: 'osc', hullam: 'sawtooth', f: T.c4, hossz: 0.16, hangero: 0.18,
        szuro: { fajta: 'lowpass', f: 2000, q: 0.8 },
        burok: { tamad: 0.010, lecseng: 0.16, tart: 0.50, elenged: 0.50 },
        jegyek: [[0, 1], [0.12, NAGYTERC], [0.24, KVINT], [0.36, OKTAV], [0.52, KVINT], [0.64, OKTAV]] },
      { fajta: 'zaj', keses: 0.36, hossz: 0.90, hangero: 0.09,
        szuro: { fajta: 'highpass', f: 3000, q: 0.7 },
        burok: { tamad: 0.30, lecseng: 0.60, tart: 0.25, elenged: 0.90 } },
      { fajta: 'osc', hullam: 'sine', f: T.c6, keses: 0.80, hossz: 1.20, hangero: 0.13,
        burok: { tamad: 0.05, lecseng: 0.90, tart: 0.30, elenged: 1.20 } },
    ],
  },

  // ── CSŐD ────────────────────────────────────────────────────────────────
  // Négy lefelé lépő hang és egy hosszú, mély moraj alattuk. A győzelem
  // tükörképe: ugyanaz a szerkezet, fordított irányban.
  csod: {
    nev: 'Csőd', hangero: 0.72, elsobbseg: 3,
    valtozat: { hangolas: 0.008, hangero: 0.07, ido: 0.012 }, ter: 0.56, torlodas: 1.00,
    retegek: [
      { fajta: 'osc', hullam: 'sawtooth', f: T.f4, hossz: 0.34, hangero: 0.30,
        szuro: { fajta: 'lowpass', f: 1100, fVeg: 380, q: 0.9 },
        burok: { tamad: 0.02, lecseng: 0.30, tart: 0.50, elenged: 0.50 },
        jegyek: [[0, 1], [0.35, 0.8909], [0.70, 0.7937], [1.05, 0.6674]] },
      { fajta: 'osc', hullam: 'sine', f: 87.31, hossz: 1.80, hangero: 0.40,
        burok: { tamad: 0.30, lecseng: 1.20, tart: 0.35, elenged: 1.20 } },
      { fajta: 'zaj', barna: true, hossz: 1.80, hangero: 0.28,
        szuro: { fajta: 'lowpass', f: 320, q: 0.8 },
        burok: { tamad: 0.40, lecseng: 1.00, tart: 0.30, elenged: 1.20 } },
    ],
  },

  // ── KUTATÁS KÉSZ ────────────────────────────────────────────────────────
  // Öt hangos, gyors csillogó felfutás. Rövid: kutatás sok lesz.
  kutatas_kesz: {
    nev: 'Kutatás kész', hangero: 0.44, elsobbseg: 2,
    valtozat: { hangolas: 0.020, hangero: 0.14, ido: 0.008 }, ter: 0.38, torlodas: 0.20,
    retegek: [
      { fajta: 'osc', hullam: 'sine', f: T.a4 * 2, hossz: 0.05, hangero: 0.26,
        burok: { tamad: 0.004, lecseng: 0.10, tart: 0.10, elenged: 0.18 },
        jegyek: [[0, 1], [0.06, 1.2], [0.12, KVINT], [0.18, 1.8], [0.24, 2.25]] },
      { fajta: 'osc', hullam: 'triangle', f: T.a4 * 4, keses: 0.24, hossz: 0.30, hangero: 0.09,
        burok: { tamad: 0.01, lecseng: 0.35, tart: 0.15, elenged: 0.50 } },
    ],
  },

  // ── HANGFOSZLÁNY ────────────────────────────────────────────────────────
  // NEM `jelez()`-kód: a tömegzaj-réteg lövi ki magától, véletlen
  // hangmagasságon. Egy sávszűrt zajlöket annyira hasonlít egy távoli
  // kiáltásra, hogy az agy embernek hallja — ez az a trükk, amitől a szűrt
  // zajból „tömeg" lesz, és nem szellőzőrendszer.
  //
  // ── MIÉRT LETT SZÉLESEBB ÉS MÉLYEBB ─────────────────────────────────────
  // Ez a leggyakoribb hang az egész játékban: teli állomáson másodpercenként
  // többször szól. Az eredeti két sávszűrője 700 és 1900 Hz-en ült, Q 6 és 8
  // jósággal — vagyis két KESKENY, rezonáns csúcs pontosan abban a sávban,
  // ahol a fül a legérzékenyebb. Mérve a teljes keverék A-súlyozott
  // energiájának 37 %-a esett az 1–2,5 kHz-es sávba, és ez az a szám, ami
  // tíz perc után „fáradtságnak" érződik. A szűrők lejjebb és szélesebbre
  // (kisebb Q) kerültek: ugyanaz a „távoli beszéd" érzet, feleannyi
  // rezonáns éllel.
  foszlany: {
    nev: 'Hangfoszlány a tömegből', hangero: 0.16, elsobbseg: 0,
    valtozat: { hangolas: 0.10, hangero: 0.30, ido: 0.010 }, ter: 0.42, torlodas: 0.03,
    retegek: [
      { fajta: 'zaj', hossz: 0.09, hangero: 0.58,
        szuro: { fajta: 'bandpass', f: 560, fVeg: 1000, q: 3.5 },
        burok: { tamad: 0.025, lecseng: 0.05, tart: 0.40, elenged: 0.10 } },
      { fajta: 'zaj', hossz: 0.06, hangero: 0.18,
        szuro: { fajta: 'bandpass', f: 1450, q: 4.5 },
        burok: { tamad: 0.02, lecseng: 0.04, tart: 0.30, elenged: 0.08 } },
    ],
  },

  // ── FURCSA FOSZLÁNY ─────────────────────────────────────────────────────
  // Szintén nem `jelez()`-kód: a tömegzaj lövi ki, minden ötödik-hatodik
  // foszlány helyett.
  //
  // MIÉRT KELL: tíz FAJ jár az állomáson — szellem, troll, lebegő medúza —,
  // és ha mind ugyanazt a szűrt zajmormogást adja, akkor a tömeg egy fajta
  // tömeg. Ez a bejegyzés egy rövid, csúszkáló füttyentés: nem beszéd, hanem
  // „valami MÁS is van itt". Ettől lesz a nyüzsgés abszurd és szerethető, és
  // nem szellőzőrendszer. Ritka, halk, és a hangolása széles — kétszer
  // ugyanúgy sosem szólal meg.
  foszlany_furcsa: {
    nev: 'Furcsa hang a tömegből', hangero: 0.085, elsobbseg: 0,
    valtozat: { hangolas: 0.26, hangero: 0.35, ido: 0.012 }, ter: 0.55, torlodas: 0.05,
    retegek: [
      { fajta: 'osc', hullam: 'triangle', f: 620, fVeg: 940, csuszas: 'exp',
        hossz: 0.11, hangero: 0.30,
        szuro: { fajta: 'bandpass', f: 900, fVeg: 1500, q: 2.4 },
        burok: { tamad: 0.030, lecseng: 0.07, tart: 0.45, elenged: 0.14 },
        jegyek: [[0, 1], [0.15, 0.79]] },
      { fajta: 'osc', hullam: 'sine', f: 248, hossz: 0.16, hangero: 0.16,
        burok: { tamad: 0.035, lecseng: 0.10, tart: 0.35, elenged: 0.18 } },
    ],
  },
};

// ══════════════════════════════════════════════════════════════════════════
//  FOLYAMATOS RÉTEGEK
// ══════════════════════════════════════════════════════════════════════════
//
// Ezek nem egylövetűek: a `hang.js` EGYSZER építi fel őket, aztán csak
// modulálja. A számok itt azért vannak, mert a hangolásuk kísérletezés
// kérdése, és nem akarjuk a gráfépítő kódot bolygatni minden próbánál.

export const AMBIENS = {
  /** Portálzúgás. `alapF` a legmélyebb dörej; erre épül minden felhang. */
  portal: {
    alapF: 46,
    lebegtetes: 1.008,      // a második fűrész ennyivel el van hangolva → lüktet
    // A jóság 0,9-ről 0,72-re: a rezonáns csúcs a szűrő nyitásánál ült, és
    // 100 % instabilitásnál pont az 1,5–1,8 kHz-es sávot emelte ki — azt,
    // amelyik a leghamarabb fáraszt. Az instabilitás így is HALLATSZIK, csak
    // nem szúr.
    szuroQ: 0.72,
    szuroMin: 175,          // stabil kapu: tompa, mély dörej
    szuroMax: 1500,         // 100 % instabilitás: éles, kellemetlen
    /** A zúgás lassan vándorol a sztereó képben — a kapuk nem egy pontban vannak. */
    panLfoHz: 0.037,
    panMelyseg: 0.55,
    /** A két elhangolt fűrész ennyire nyílik szét. A mély középen marad. */
    szelesseg: 0.72,
    lfoMin: 0.45,           // lüktetés Hz-ben — nyugodt szívverés
    lfoMax: 3.10,           // …és pánik
    lfoMelysegMin: 0.10,
    lfoMelysegMax: 0.34,
    /**
     * A disszonáns felhang aránya. 1,4983 = tiszta kvint (megnyugtató),
     * 1,4142 = TRITÓNUSZ, a „diabolus in musica". Az instabilitás ezen a
     * két érték között csúsztat: a fül jóval a HUD-szám elolvasása előtt
     * észreveszi, hogy valami elromlott.
     */
    disszKonszonans: 1.4983,
    disszDisszonans: 1.4142,
    disszKuszob: 0.42,      // eddig nem is hallatszik
    disszMax: 0.42,
    szintMin: 0.13,         // egy nyitott kapu
    szintLepes: 0.055,      // minden továbbiért ennyi (telítéssel)
    szintMax: 0.42,
  },

  /**
   * Tömegzaj. A hangerő LOGARITMIKUS az utasszámban: 20 és 1000 utas közt
   * lineárisan a 20 utas hallhatatlan lenne, pedig az is tömeg. A `viszony`
   * a logaritmus normálási pontja.
   */
  tomeg: {
    viszony: 1000,
    szuroF: 520,
    szuroFTeli: 960,
    szuroQ: 0.55,
    szintMax: 0.20,
    /**
     * A tömeg SZÉLESSÉGE. Két külön zajforrás megy két külön panorámázóra —
     * ezer lény nem egy pontban áll. Mérve: enélkül a keverék sztereó-
     * korrelációja pontosan 1,000 volt, azaz a játék monóban szólt.
     */
    szelesseg: 0.78,
    /** Hangfoszlány-esély EGY frissítési lépésben, teli állomásnál. */
    foszlanyEsely: 0.20,
    foszlanyHangolasMin: 0.62,
    foszlanyHangolasMax: 1.62,
    /** Ennyi eséllyel nem foszlány jön, hanem valami furcsa. */
    furcsaEsely: 0.20,
    /** A foszlányok ilyen szélesen szóródnak szét a sztereó képben. */
    foszlanySzelesseg: 0.85,
  },

  /**
   * „Levegő": nagyon halk, magas suhogás a csarnokban.
   *
   * MIÉRT: a hangkép mérve a 400 Hz – 2,5 kHz-es sávban tömörült, fölötte
   * gyakorlatilag semmi. A fül ezt ZÁRT, kicsi térként hallja — mint egy
   * dobozt. Egy alig hallható magas réteg nem hangosít semmit (a szintje két
   * nagyságrenddel a tömegzaj alatt van), de kinyitja a teret: ettől lesz
   * „nagy csarnok" a „kis szoba" helyett. A 2,5 kHz-es felüláteresztő
   * szándékos: ez a sáv NEM fáraszt ilyen halkan, a 4 kHz körüli viszont
   * igen — ezért nincs benne rezonancia.
   */
  levego: {
    szuroF: 4200,
    szuroQ: 0.5,
    szintMax: 0.017,
    szelesseg: 0.85,
  },

  /** Elégedetlenség: mély, sávtalan moraj. Sosem dallam, csak nyomás. */
  elegedetlenseg: {
    szuroF: 210,
    szuroQ: 0.7,
    szintMax: 0.17,
    /** Ennyi dühös távozó MÁSODPERCENKÉNT viszi teljesen fel a réteget. */
    duhRata: 2.2,
    /** Ez alatt a hírnév alatt önmagában is morajlik. */
    hirnevKuszob: 45,
  },

  /** Áramszünet: 50 Hz-es hálózati zümmögés + mindenre ült tompítás. */
  aramszunet: {
    zummF: 50,
    zummQ: 6,
    szint: 0.055,
    /** A globális tompító lowpass-a áramszünet alatt / normál esetben. */
    tompitasBe: 760,
    tompitasKi: 15000,
  },

  /**
   * Nappal/éjszaka. Alig észrevehető — ez a lényege: nem esemény, hanem
   * háttér. Az éjszaka tompább és halkabb.
   */
  napszak: {
    tomegEjjel: 0.72,       // éjjel ennyiszeres a tömegzaj
    szinEjjel: -260,        // …és ennyivel lejjebb a szűrők nyitása Hz-ben
  },
};

// ══════════════════════════════════════════════════════════════════════════
//  TÉR — a közös zengető
// ══════════════════════════════════════════════════════════════════════════
//
// A gráfot a `hang_ter.js` építi, a SZÁMOK viszont ide tartoznak: a terem
// méretét hangolni kell, nem újraprogramozni.
//
// MIÉRT VAN EGYÁLTALÁN: tizenkét külön effekt, mindegyik saját burkolóval,
// zengés nélkül tizenkét külön szintetizátornak hallatszik, amiket valaki
// egymás mellé rakott. Egy közös tér az, amitől EGY HELYEN szólnak — ez a
// legolcsóbb trükk, ami „gazdagabbá" tesz egy procedurális hangképet, és
// egyben az egyetlen, ami nem tesz hozzá se hangerőt, se élességet.

export const TER = {
  /** Az impulzusválasz hossza. 1,5 s = nagy csarnok, de még nem templom. */
  hossz: 1.5,
  /** Nagyobb szám = szárazabb, tömöttebb terem. */
  csillapodas: 5.4,
  /** 0 = nagyon sötét farok, 1 = sziszegő. A magasak hamarabb halnak el. */
  sotetseg: 0.34,
  /** A korai visszaverődések ereje — ez mondja meg, mekkora a terem. */
  koraiDb: 0.30,
  /**
   * A zengető busz szintje. Az impulzusválasz egységnyi ENERGIÁRA van
   * normálva (lásd `hang_ter.js`), tehát ez a szám tényleg a zengés/száraz
   * arányt állítja, és nem mozdul el, ha a terem hosszát átírod.
   */
  szint: 0.55,
  /** A folyamatos rétegek (tömeg, portál) ennyit küldenek bele. */
  ambiensKuldes: 0.20,
  /** A kamerától távoli hang ennyivel többet küld — ettől lesz „messze". */
  tavKuldes: 0.55,
};

// ══════════════════════════════════════════════════════════════════════════
//  ALÁFESTŐ ZENE
// ══════════════════════════════════════════════════════════════════════════
//
// Generatív, mert egy hurokra vágott zeneszám a harmadik ismétlésnél
// idegesítő lesz, a negyediknél lekapcsolják — és akkor a hangeffektek is
// elvesznek vele. Lassú pad-akkordok + ritka arpeggio: ez a sűrűség még
// órák után is elviselhető.
//
// A HANGNEM A HÍRNÉVTŐL FÜGG. Nem hangerőben jelzi az állapotot (azt a
// portálzúgás csinálja), hanem SZÍNBEN: a jól menő állomás alatt dúr
// pentaton szól, a haldokló alatt mély moll. A játékos ezt nem fogja
// tudatosan észrevenni, és pont ez a cél.

export const ZENE_HANGNEMEK = [
  {
    kod: 'sotet', hirnevAlatt: 32,
    alapF: 130.81,                       // C3 — moll pentaton
    lepesek: [0, 3, 5, 7, 10, 12, 15, 17],
    szuroF: 620, fenyesseg: 0.55,
  },
  {
    kod: 'langyos', hirnevAlatt: 62,
    alapF: 174.61,                       // F3 — dór
    lepesek: [0, 2, 3, 5, 7, 9, 10, 12],
    szuroF: 900, fenyesseg: 0.75,
  },
  {
    kod: 'vilagos', hirnevAlatt: 999,
    alapF: 196.00,                       // G3 — dúr pentaton
    lepesek: [0, 2, 4, 7, 9, 12, 14, 16],
    szuroF: 1350, fenyesseg: 1.0,
  },
];

export const ZENE = {
  /** Hány pad-hang szól egyszerre. Négynél több már masszává mosódik. */
  padHangok: 4,
  padHullam: 'sawtooth',
  padElhangolas: 6,          // cent — ettől lesz szélessége
  padSzint: 0.085,
  /** Az akkord ennyi másodpercenként vált, ±szórás. */
  akkordHossz: 11,
  akkordSzoras: 5,
  /** Az akkordváltás átcsúszása másodpercben — sose ugorjon. */
  akkordCsuszas: 1.6,
  /** Arpeggio: ennyi másodpercenként egy hang, ±szórás. */
  arpKoz: 2.6,
  arpSzoras: 3.4,
  arpHullam: 'triangle',
  arpSzint: 0.075,
  arpBurok: { tamad: 0.01, lecseng: 0.45, tart: 0.10, elenged: 0.9 },
  arpHossz: 0.18,
  /** Az arpeggio ennyi oktávval a pad fölött szól. */
  arpOktav: 2,
  /** A pad szűrője lassan lélegzik — ez az egyetlen mozgás egy akkordon belül. */
  legzesHz: 0.045,
  legzesMelyseg: 0.30,
};

// ══════════════════════════════════════════════════════════════════════════
//  KEVERÉS
// ══════════════════════════════════════════════════════════════════════════

export const KEVERES = {
  /** Alap mesterhangerő indításkor. */
  mester: 0.7,
  zene: 0.55,
  ambiens: 0.9,
  effekt: 1.0,
  /**
   * Egyszerre ennyi egylövetű hang szólhat. Fölötte a rendszer a
   * legalacsonyabb elsőbbségű, legrégebbi hangot dobja el. Korlát nélkül egy
   * ezer utasos csúcsforgalom pillanatok alatt több száz oszcillátort
   * indítana, és a hangkép sárrá válna — jóval a CPU-határ ELŐTT.
   */
  maxEgyloveses: 12,
  /** Hangerő-változások átcsúszása másodpercben (kattanás ellen). */
  simitas: 0.06,
  /** Az ambiens rétegek modulációjának átcsúszása. */
  ambiensSimitas: 0.35,
  /** Az ambiens rétegek másodpercenkénti újrahangolása. */
  frissitesHz: 12,
  /** Belépéskor ennyi idő alatt úszik be az ambiens. */
  beuszas: 2.5,
  /** Kimenő limiter — a fanfár + omlás + kassza együtt sem torzíthat. */
  limitKuszob: -14,
  limitArany: 12,

  // ── PUHA VÁGÁS ──────────────────────────────────────────────────────────
  // A limiter 3 ms alatt reagál; egy képkockányi eseményáradat egyetlen
  // MINTA alatt épül fel. Mérve: 24 esemény egy képkockában 1,469-es
  // csúcsot adott, azaz 40 mintányi KEMÉNY levágást a limiter után is. A
  // tanh-görbe ezt matematikailag lehetetlenné teszi. Kis jelnél
  // gyakorlatilag egyenes, tehát a normál hangképet nem színezi.
  vagoKuszob: 0.62,
  vagoMinta: 4097,

  // ── TORLÓDÁS ELLEN ──────────────────────────────────────────────────────
  /** Ugyanaz a hang ennyi másodpercen belül nem szólal meg kétszer. */
  torlodasAlap: 0.06,
  /**
   * Sorozat-csillapítás. Ebben az ablakban számoljuk, hány hang indult, és
   * az újakat 1/√n-nel halkítjuk. MIÉRT: n egyforma hang összege nem n-szer
   * hangosabb, hanem — véletlen fázisnál — √n-szer; ez a szorzó tehát pont
   * azt tartja szinten, amit a fül hangosságnak hall. A `sorozatMin` a
   * padló: ennél halkabbra sosem húzzuk, különben a huszadik esemény már
   * hallhatatlan lenne.
   */
  sorozatAblak: 0.13,
  sorozatMin: 0.34,

  // ── DUCK — a fontos hang kap helyet ─────────────────────────────────────
  // Mérve: a kapu-összeomlás mindössze 0,8 dB-lel volt hangosabb egy nyüzsgő,
  // instabil állomás háttérzajánál. Vagyis a játék legfontosabb riasztása
  // GYAKORLATILAG NEM HALLATSZOTT. Hangosítani rossz válasz lett volna (a
  // limiter úgyis visszahúzza); a helyes az, amit minden rádióadás csinál:
  // a fontos jel alatt a háttér HALKUL. Az effekt-busz nem duckol, csak az
  // ambiens és a zene — a visszajelzések élesek maradnak.
  duckMagas: 0.72,        // 3. elsőbbség (omlás, csőd, fanfár): −11,1 dB
  duckKozep: 0.36,        // 2. elsőbbség (esemény, kapunyitás): −3,9 dB
  duckBe: 0.030,
  duckKi: 0.32,
  /** A hang vége után még ennyi ideig tartjuk lent a hátteret. */
  duckFarok: 0.30,

  // ── TÉRHATÁS ────────────────────────────────────────────────────────────
  /** A panoráma-kitérés maximuma. 1,0 fülhallgatóban már fárasztó. */
  terSzelesseg: 0.82,
  /** Ennyi cellányi távolságnál feleződik a hang. */
  tavFelezo: 34,
};

/**
 * Alapértelmezett változatosság azoknak a hangoknak, amelyeknél a katalógus
 * nem mond mást. Nem nulla: a néma alapérték pont azt a hibát engedné vissza,
 * ami ellen az egész mező van.
 */
export const VALTOZAT_ALAP = { hangolas: 0.020, hangero: 0.10, ido: 0.006 };
