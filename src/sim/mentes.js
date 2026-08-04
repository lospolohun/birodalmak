// AGE OF THE CRYSTALS — MENTÉS ÉS BETÖLTÉS (v0.7/2).
//
// ── AZ ÁLLAPOT-HASH A MENTÉS SPECIFIKÁCIÓJA ───────────────────────────────
// Ez a fájl legfontosabb gondolata, és a projekt egyik szerencséje.
//
// A `Sim.allapotHash()` a v0.1 óta pontosan azt sorolja fel, ami a szimuláció
// állapota — mert ha valami kimaradna belőle, a desync-detektor vak lenne rá.
// A mentésnek UGYANEZT a halmazt kell tárolnia, ugyanabból az okból: ami
// kimarad, attól a betöltött meccs elcsúszik az eredetitől.
//
// A kettő tehát EGYMÁST ELLENŐRZI, és pont ezt használja ki a szonda:
//
//   ments el a T. ticken → tölts be egy FRISS simbe → futtasd mindkettőt
//   T+M-ig → a két hash-nek BITRE egyeznie kell
//
// Ha bármit kifelejtünk a mentésből, ez a vizsgálat azonnal megbukik, és
// megmondja a pontos ticket. Nincs szükség kézzel karbantartott mező-listára:
// a szonda a listát magát vizsgálja.
//
// ── AMI SZÁNDÉKOSAN NINCS BENNE ───────────────────────────────────────────
//   · `MezoTar` mező-TARTALMA — a járhatóságból és a célcellából számolható.
//     ⚠️ A CÉLCELLÁK ÉS AZ LRU-BÉLYEGEK VISZONT BENNE VANNAK, és ez a v0.7/2
//     legdrágább tanulsága. A mező-tár nem tiszta gyorsítótár: az egységek
//     `mezoId`-je INDEX a tár rekeszeibe. Ha betöltéskor csak érvénytelenítjük,
//     minden `mezoId` egy üres rekeszre mutat — a sereg elveszti az útvonalát,
//     és a KÖVETKEZŐ TICKEN más irányba indul. Mérve pontosan ez történt: a
//     mentés pillanatában a hash egyezett, az utána következő EGYETLEN tick
//     után tizenkét egység sebessége már eltért (az eredetiben a mezőből jövő
//     nyolcirányú vektorok, a betöltöttben szabad irányok).
//     Ezért a célcellákat mentjük, és betöltéskor UGYANABBA A REKESZBE
//     számoljuk újra — így a `mezoId` továbbra is oda mutat, ahova mutatott.
//   · `Egysegek._hSzam` / `_hElem` — a térbeli hasítótábla, tickenként épül.
//   · `Eroforrasok.cella` / `fajta` / `x` / `y` — a SEEDBŐL következnek, a
//     konstruktor újragenerálja. Csak a `keszlet` változik futás közben.
//   · `Racs.magassag` — szintén a seedből.
//
// A `Racs.jarhato` VISZONT BENNE VAN, pedig az is „levezethető" lenne (terep +
// nyersanyagok + épületek). Nem vezetjük le: a levezetés SORRENDFÜGGŐ (a v0.5
// felállásánál egyszer már meg is bukott — az épületek után újra le kellett
// zárni a nyersanyag-cellákat), és egy elrontott sorrendből származó egyetlen
// nyitott cella olyan útvonalat ad, ami az eredeti meccsben nem létezett. 64 KB
// a biztonságért olcsó.
//
// ── A PARANCS-SOR IS ÁLLAPOT ──────────────────────────────────────────────
// A `Sim._sor` a MÉG VÉGRE NEM HAJTOTT parancsokat tartja (a `KESLELTETES`
// miatt mindig van benne 1-2 tickre való). Ha kimaradna, a mentés pillanatában
// épp úton lévő kattintások elvesznének — és a v0.8 újracsatlakozásánál pont ez
// lenne a leggyakoribb eset.
//
// ── A RNG ÁLLAPOTA IS ÁLLAPOT ─────────────────────────────────────────────
// A `mulberry32` egyetlen 32 bites számot tart. A meccs közben ma keveset
// használjuk, de ha egyszer is használnánk mentés után, a folytatás más
// sorozatot kapna. Ezért a generátor `allapot()` / `beallit()` felületet kapott.
//
// ── FORMÁTUM ──────────────────────────────────────────────────────────────
// Sima JS objektum, `JSON.stringify`-olható. Nem a legtömörebb — egy 200 fős
// meccs pár száz KB —, de OLVASHATÓ és hibakereshető, és a `db`-ig vágunk, nem
// a `maxDb`-ig. A tömör bináris formátum a v0.8 hálózati kódjának dolga lesz,
// ahol tényleg számít.

import { KESLELTETES } from './sim.js';

/** A mentés-formátum verziója. Növeld, ha a mezők halmaza változik. */
export const MENTES_VERZIO = 3;   // v0.9: `civ` (2) és `egyedi` (3) blokk

/** Typed array → sima tömb, csak az első `db` elem. */
function ki(tomb, db) {
  const a = new Array(db);
  for (let i = 0; i < db; i++) a[i] = tomb[i];
  return a;
}

/** Sima tömb → typed array, a maradékot nullázva. */
function be(tomb, forras) {
  tomb.fill(0);
  if (!forras) return;
  const n = Math.min(tomb.length, forras.length);
  for (let i = 0; i < n; i++) tomb[i] = forras[i];
}

/**
 * A teljes szimuláció-állapot kimentése.
 * @param {import('./sim.js').Sim} sim
 * @returns {object} `JSON.stringify`-olható pillanatkép
 */
export function mentes(sim) {
  const e = sim.egysegek;
  const db = e.db;
  const pa = sim.parancsAllapot;
  const h = sim.harc;
  const mu = sim.munkasok;
  const ep = sim.epuletek;
  const epDb = ep.db;
  const lv = sim.lovedekek;
  const g = sim.gazdasag;
  const kp = sim.kepzes;
  const tc = sim.technologia;
  const ai = sim.ai;
  const kd = sim.kod;
  const cv = sim.civ;
  const eg = sim.egyedi;

  // A PARANCS-SOR: csak a JÖVŐBELI tickek érdekesek. A `Map` bejárása itt
  // rendben van — nem a sim állapotát olvassuk belőle sorrendfüggően, hanem
  // kiírjuk, és a betöltés kulcs szerint teszi vissza.
  const sor = [];
  for (const [t, lista] of sim._sor) {
    if (t < sim.tick) continue;
    sor.push({ t, p: lista });
  }
  // RÖGZÍTETT SORREND. A `Map` beszúrási sorrendben jár, ami a mentés
  // pillanatában determinisztikus — de a mentett fájl később szerkeszthető,
  // összefűzhető, és a betöltésnek akkor is ugyanazt kell adnia. A tick
  // szerinti rendezés ezt garantálja.
  sor.sort((a, b) => a.t - b.t);

  return {
    verzio: MENTES_VERZIO,
    seed: sim.seed,
    n: sim.n,
    maxEgyseg: sim.maxEgyseg,
    tick: sim.tick,
    rng: sim.rng.allapot(),

    racs: { jarhato: Array.from(sim.racs.jarhato) },

    // A mező-tár REKESZKIOSZTÁSA (célcella + LRU-bélyeg rekeszenként). A
    // költség-tömböket nem mentjük: azokat a betöltés újraszámolja ugyanabból
    // a járhatóságból, tehát bitre ugyanazok lesznek.
    mezoTar: sim.mezoTar.mezok.map((z) => ({ cel: z.cel, utoljara: z.utoljara })),

    egysegek: {
      db,
      px: ki(e.px, db), py: ki(e.py, db),
      vx: ki(e.vx, db), vy: ki(e.vy, db),
      szog: ki(e.szog, db),
      celX: ki(e.celX, db), celY: ki(e.celY, db),
      mezoId: ki(e.mezoId, db),
      allapot: ki(e.allapot, db),
      tipus: ki(e.tipus, db),
      csapat: ki(e.csapat, db),
      egyenes: ki(e.egyenes, db),
      // ⚠️ A GENERÁCIÓ TELJES HOSSZBAN MEGY, NEM CSAK `db`-IG — és ez mérés
      // eredménye. Minden más réteg értékeit az `egysegKepez()` felülírja az
      // egység SZÜLETÉSEKOR (az az egyetlen hely, ahol egység keletkezik), a
      // generáció viszont SZÁNDÉKOSAN túléli a slot újrahasznosítását: pont az
      // a dolga, hogy egy elavult hivatkozásról kiderüljön, hogy elavult.
      //
      // A `db` fölötti slotok generációja tehát ÉLŐ adat: ha a betöltött
      // világban nullával indulnak, az oda születő következő egység más
      // generációt kap, mint az eredetiben, és egy `ervenyes()` vizsgálat a két
      // futásban MÁS választ ad. Mérve: a mentés pillanatában a hash egyezett,
      // a folytatás a 3100. ticken csúszott szét.
      generacio: Array.from(e.generacio),
      // A SZABAD-LISTA IS ÁLLAPOT: ez dönti el, melyik slotba születik a
      // következő egység, és abból következik minden későbbi index.
      szabad: ki(e._szabad, e._szabadDb),
    },

    parancs: {
      parancs: ki(pa.parancs, db), allas: ki(pa.allas, db), alakzat: ki(pa.alakzat, db),
      celEgyseg: ki(pa.celEgyseg, db), celEpulet: ki(pa.celEpulet, db),
      celGeneracio: ki(pa.celGeneracio, db),
      vegX: ki(pa.vegX, db), vegY: ki(pa.vegY, db), vegMezo: ki(pa.vegMezo, db),
      horgonyX: ki(pa.horgonyX, db), horgonyY: ki(pa.horgonyY, db),
    },

    harc: {
      hp: ki(h.hp, db), maxHp: ki(h.maxHp, db), elo: ki(h.elo, db),
      utemHatra: ki(h.utemHatra, db),
      halottak: h.halottak.slice(), osszSebzes: h.osszSebzes.slice(),
      toronySortuz: h.toronySortuz.slice(), toronyNyil: h.toronyNyil.slice(),
    },

    munkas: {
      allapot: ki(mu.allapot, db), celNode: ki(mu.celNode, db),
      celEpulet: ki(mu.celEpulet, db), cipelFajta: ki(mu.cipelFajta, db),
      cipelDb: ki(mu.cipelDb, db), ora: ki(mu.ora, db), nodeMezo: ki(mu.nodeMezo, db),
      alloX: ki(mu.alloX, db), alloY: ki(mu.alloY, db),
      probal: ki(mu.probal, db), utolsoTav: ki(mu.utolsoTav, db),
    },

    beszallas: {
      bent: ki(sim.beszallas.bent, db), hol: ki(sim.beszallas.hol, db),
      letszam: ki(sim.beszallas.letszam, epDb),
    },

    lovedek: {
      db: lv.db,
      x: ki(lv.x, lv.db), y: ki(lv.y, lv.db), cel: ki(lv.cel, lv.db),
      celGen: ki(lv.celGen, lv.db), sebzes: ki(lv.sebzes, lv.db),
      csapat: ki(lv.csapat, lv.db), elet: ki(lv.elet, lv.db),
      szogX: ki(lv.szogX, lv.db), szogY: ki(lv.szogY, lv.db),
    },

    epuletek: {
      db: epDb,
      cx: ki(ep.cx, epDb), cy: ki(ep.cy, epDb),
      x: ki(ep.x, epDb), y: ki(ep.y, epDb),
      tipus: ki(ep.tipus, epDb), csapat: ki(ep.csapat, epDb),
      epulHatra: ki(ep.epulHatra, epDb),
      hp: ki(ep.hp, epDb), maxHp: ki(ep.maxHp, epDb),
      elo: ki(ep.elo, epDb), nyitva: ki(ep.nyitva, epDb),
      lovesHatra: ki(ep.lovesHatra, epDb),
    },

    eroforras: { keszlet: ki(sim.eroforrasok.keszlet, sim.eroforrasok.db) },

    gazdasag: {
      keszlet: Array.from(g.keszlet), korszak: Array.from(g.korszak),
      korszakHatra: Array.from(g.korszakHatra),
      osszegyujtott: Array.from(g.osszegyujtott),
      csereDb: Array.from(g.csereDb), csereKapott: Array.from(g.csereKapott),
      csereElutasitva: Array.from(g.csereElutasitva),
    },

    kepzes: {
      sor: Array.from(kp.sor), sorDb: Array.from(kp.sorDb), hatra: Array.from(kp.hatra),
      keszult: kp.keszult.slice(), elutasitva: kp.elutasitva.slice(),
    },

    technologia: {
      allapot: Array.from(tc.allapot), hatra: Array.from(tc.hatra), hol: Array.from(tc.hol),
      sebzes: Array.from(tc.sebzes), pancel: Array.from(tc.pancel),
      utem: Array.from(tc.utem), cipel: Array.from(tc.cipel),
      epuletHp: Array.from(tc.epuletHp),
      keszult: Array.from(tc.keszult), elutasitva: Array.from(tc.elutasitva),
    },

    ai: {
      aktiv: Array.from(ai.aktiv), nehezseg: Array.from(ai.nehezseg),
      dontesDb: Array.from(ai.dontesDb), gyujtDb: Array.from(ai.gyujtDb),
      epitDb: Array.from(ai.epitDb), kepzesDb: Array.from(ai.kepzesDb),
      kutatasDb: Array.from(ai.kutatasDb),
      ismertX: Array.from(ai.ismertX), ismertY: Array.from(ai.ismertY),
      felderito: Array.from(ai.felderito), felderitoGen: Array.from(ai.felderitoGen),
      felderitoIdo: Array.from(ai.felderitoIdo),
      had: Array.from(ai.had), frissitesIdo: Array.from(ai.frissitesIdo),
      felderitDb: Array.from(ai.felderitDb), felfedezDb: Array.from(ai.felfedezDb),
      tamadasDb: Array.from(ai.tamadasDb), vedekezesDb: Array.from(ai.vedekezesDb),
    },

    // A CIV-RÉTEG (v0.9). A civ-INDEXEN kívül az ELŐRE SZÁMOLT tömböket is
    // mentjük, pedig a `beallit()` mindet újraszámolná a civ-indexből. Azért
    // így: a `CIV_BONUSZ` táblázat a v0.13 hangolásának FŐ célpontja, és ha a
    // mentés csak az indexet őrizné, egy hangolás után visszatöltött állás
    // MÁS SZÁMOKKAL folytatódna, mint amivel elindult — a hash pedig
    // szétcsúszna a mentés-szonda alatt, ott, ahol a hiba a legnehezebben
    // magyarázható. A mentés a hash specifikációja: legyen önhordó.
    civ: {
      civ: Array.from(cv.civ),
      valasztas: Array.from(sim.civValasztas),
      sebzes: Array.from(cv.sebzes), pancel: Array.from(cv.pancel),
      utem: Array.from(cv.utem), cipel: Array.from(cv.cipel),
      epuletHp: Array.from(cv.epuletHp), epuletAr: Array.from(cv.epuletAr),
      egysegAr: Array.from(cv.egysegAr), egysegIdo: Array.from(cv.egysegIdo),
      nepesseg: Array.from(cv.nepesseg),
      bonuszDb: Array.from(cv.bonuszDb), elutasitva: Array.from(cv.elutasitva),
    },

    // AZ EGYEDI EGYSÉG ADATSORA (v0.9/2). Ugyanaz az indok, mint a `civ`
    // blokknál: a profil-tábla a v0.13 hangolásának célpontja, és a mentés
    // legyen önhordó. A `keszult`/`elutasitva` pedig működés-szám — ha nem
    // jönne át, a betöltött meccs jelentése hazudna a réteg munkájáról.
    egyedi: {
      civ: Array.from(eg.civ), aktiv: Array.from(eg.aktiv),
      hp: Array.from(eg.hp), sebzes: Array.from(eg.sebzes),
      tamadas: Array.from(eg.tamadas), pancel: Array.from(eg.pancel),
      pancelErtek: Array.from(eg.pancelErtek), utem: Array.from(eg.utem),
      ar: Array.from(eg.ar), ido: Array.from(eg.ido),
      nep: Array.from(eg.nep), epulet: Array.from(eg.epulet),
      keszult: Array.from(eg.keszult), elutasitva: Array.from(eg.elutasitva),
    },

    kod: {
      latott: kd.latott.map((t) => Array.from(t)),
      lathato: kd.lathato.map((t) => Array.from(t)),
      latottDb: Array.from(kd.latottDb), lathatoDb: Array.from(kd.lathatoDb),
      frissitesDb: kd.frissitesDb,
    },

    sor,
  };
}

/**
 * Egy mentés visszatöltése egy MEGLÉVŐ simbe.
 *
 * ⚠️ A SIMET UGYANAZZAL A SEEDDEL ÉS MÉRETTEL kell létrehozni, mert a terep, a
 * nyersanyag-elhelyezés és a rács-méret abból következik — azokat nem mentjük.
 * A `hibak` visszatérési érték pont ezt ellenőrzi.
 *
 * @param {import('./sim.js').Sim} sim
 * @param {object} m a `mentes()` eredménye
 * @returns {{ok:boolean, hiba?:string}}
 */
export function betoltes(sim, m) {
  if (!m || typeof m !== 'object') return { ok: false, hiba: 'üres mentés' };
  if (m.verzio !== MENTES_VERZIO) {
    return { ok: false, hiba: 'ismeretlen mentés-verzió: ' + m.verzio };
  }
  if ((m.seed >>> 0) !== sim.seed) {
    return { ok: false, hiba: 'más seed: a terep nem egyezne' };
  }
  if ((m.n | 0) !== sim.n) return { ok: false, hiba: 'más pályaméret' };

  sim.tick = m.tick | 0;
  sim.rng.beallit(m.rng | 0);
  be(sim.racs.jarhato, m.racs.jarhato);

  const e = sim.egysegek;
  const u = m.egysegek;
  const db = u.db | 0;
  // ⚠️ AZ `ujraKezd()` A LEGELSŐ. Az minden generációt LÉPTET, tehát a betöltés
  // előtti világ minden hivatkozása érvénytelenné válik — utána írjuk vissza a
  // MENTETT generációkat. Enélkül egy régi `celEgyseg` a betöltött világ egy
  // vadidegen egységére mutatna, és pont az a hiba jönne vissza, ami ellen a
  // v0.5/1 generációs számlálója készült.
  e.ujraKezd();
  e.db = db;
  be(e.px, u.px); be(e.py, u.py); be(e.vx, u.vx); be(e.vy, u.vy);
  be(e.szog, u.szog); be(e.celX, u.celX); be(e.celY, u.celY);
  be(e.mezoId, u.mezoId); be(e.allapot, u.allapot);
  be(e.tipus, u.tipus); be(e.csapat, u.csapat); be(e.egyenes, u.egyenes);
  be(e.generacio, u.generacio);
  be(e._szabad, u.szabad);
  e._szabadDb = u.szabad ? u.szabad.length : 0;

  const pa = sim.parancsAllapot;
  const p = m.parancs;
  be(pa.parancs, p.parancs); be(pa.allas, p.allas); be(pa.alakzat, p.alakzat);
  be(pa.celEgyseg, p.celEgyseg); be(pa.celEpulet, p.celEpulet);
  be(pa.celGeneracio, p.celGeneracio);
  be(pa.vegX, p.vegX); be(pa.vegY, p.vegY); be(pa.vegMezo, p.vegMezo);
  be(pa.horgonyX, p.horgonyX); be(pa.horgonyY, p.horgonyY);

  const h = sim.harc;
  be(h.hp, m.harc.hp); be(h.maxHp, m.harc.maxHp); be(h.elo, m.harc.elo);
  be(h.utemHatra, m.harc.utemHatra);
  h.halottak = m.harc.halottak.slice();
  h.osszSebzes = m.harc.osszSebzes.slice();
  h.toronySortuz = m.harc.toronySortuz.slice();
  h.toronyNyil = m.harc.toronyNyil.slice();

  const mu = sim.munkasok;
  const w = m.munkas;
  be(mu.allapot, w.allapot); be(mu.celNode, w.celNode); be(mu.celEpulet, w.celEpulet);
  be(mu.cipelFajta, w.cipelFajta); be(mu.cipelDb, w.cipelDb); be(mu.ora, w.ora);
  be(mu.nodeMezo, w.nodeMezo); be(mu.alloX, w.alloX); be(mu.alloY, w.alloY);
  be(mu.probal, w.probal); be(mu.utolsoTav, w.utolsoTav);

  be(sim.beszallas.bent, m.beszallas.bent);
  be(sim.beszallas.hol, m.beszallas.hol);
  be(sim.beszallas.letszam, m.beszallas.letszam);

  const lv = sim.lovedekek;
  lv.db = m.lovedek.db | 0;
  be(lv.x, m.lovedek.x); be(lv.y, m.lovedek.y); be(lv.cel, m.lovedek.cel);
  be(lv.celGen, m.lovedek.celGen); be(lv.sebzes, m.lovedek.sebzes);
  be(lv.csapat, m.lovedek.csapat); be(lv.elet, m.lovedek.elet);
  be(lv.szogX, m.lovedek.szogX); be(lv.szogY, m.lovedek.szogY);

  const ep = sim.epuletek;
  const b = m.epuletek;
  ep.db = b.db | 0;
  be(ep.cx, b.cx); be(ep.cy, b.cy); be(ep.x, b.x); be(ep.y, b.y);
  be(ep.tipus, b.tipus); be(ep.csapat, b.csapat); be(ep.epulHatra, b.epulHatra);
  be(ep.hp, b.hp); be(ep.maxHp, b.maxHp); be(ep.elo, b.elo);
  be(ep.nyitva, b.nyitva); be(ep.lovesHatra, b.lovesHatra);

  be(sim.eroforrasok.keszlet, m.eroforras.keszlet);
  // A KIMERÜLT LELŐHELY CELLA-MUTATÓJÁT is helyre kell tenni: a `cellaNode`
  // a generálásból származik, de a kimerülés `-1`-re állítja. A járhatóságot
  // már visszatöltöttük, ezt viszont csak innen tudjuk.
  const ef = sim.eroforrasok;
  for (let i = 0; i < ef.db; i++) {
    if (ef.keszlet[i] <= 0) ef.cellaNode[ef.cella[i]] = -1;
  }

  const g = sim.gazdasag;
  be(g.keszlet, m.gazdasag.keszlet); be(g.korszak, m.gazdasag.korszak);
  be(g.korszakHatra, m.gazdasag.korszakHatra);
  be(g.osszegyujtott, m.gazdasag.osszegyujtott);
  be(g.csereDb, m.gazdasag.csereDb); be(g.csereKapott, m.gazdasag.csereKapott);
  be(g.csereElutasitva, m.gazdasag.csereElutasitva);

  const kp = sim.kepzes;
  be(kp.sor, m.kepzes.sor); be(kp.sorDb, m.kepzes.sorDb); be(kp.hatra, m.kepzes.hatra);
  kp.keszult = m.kepzes.keszult.slice();
  kp.elutasitva = m.kepzes.elutasitva.slice();

  const tc = sim.technologia;
  be(tc.allapot, m.technologia.allapot); be(tc.hatra, m.technologia.hatra);
  be(tc.hol, m.technologia.hol);
  be(tc.sebzes, m.technologia.sebzes); be(tc.pancel, m.technologia.pancel);
  be(tc.utem, m.technologia.utem); be(tc.cipel, m.technologia.cipel);
  be(tc.epuletHp, m.technologia.epuletHp);
  be(tc.keszult, m.technologia.keszult); be(tc.elutasitva, m.technologia.elutasitva);

  const ai = sim.ai;
  const a = m.ai;
  be(ai.aktiv, a.aktiv); be(ai.nehezseg, a.nehezseg);
  be(ai.dontesDb, a.dontesDb); be(ai.gyujtDb, a.gyujtDb);
  be(ai.epitDb, a.epitDb); be(ai.kepzesDb, a.kepzesDb); be(ai.kutatasDb, a.kutatasDb);
  be(ai.ismertX, a.ismertX); be(ai.ismertY, a.ismertY);
  be(ai.felderito, a.felderito); be(ai.felderitoGen, a.felderitoGen);
  be(ai.felderitoIdo, a.felderitoIdo);
  be(ai.had, a.had); be(ai.frissitesIdo, a.frissitesIdo);
  be(ai.felderitDb, a.felderitDb); be(ai.felfedezDb, a.felfedezDb);
  be(ai.tamadasDb, a.tamadasDb); be(ai.vedekezesDb, a.vedekezesDb);

  const cv = sim.civ;
  be(cv.civ, m.civ.civ); be(sim.civValasztas, m.civ.valasztas);
  be(cv.sebzes, m.civ.sebzes); be(cv.pancel, m.civ.pancel);
  be(cv.utem, m.civ.utem); be(cv.cipel, m.civ.cipel);
  be(cv.epuletHp, m.civ.epuletHp); be(cv.epuletAr, m.civ.epuletAr);
  be(cv.egysegAr, m.civ.egysegAr); be(cv.egysegIdo, m.civ.egysegIdo);
  be(cv.nepesseg, m.civ.nepesseg);
  be(cv.bonuszDb, m.civ.bonuszDb); be(cv.elutasitva, m.civ.elutasitva);

  const eg = sim.egyedi;
  be(eg.civ, m.egyedi.civ); be(eg.aktiv, m.egyedi.aktiv);
  be(eg.hp, m.egyedi.hp); be(eg.sebzes, m.egyedi.sebzes);
  be(eg.tamadas, m.egyedi.tamadas); be(eg.pancel, m.egyedi.pancel);
  be(eg.pancelErtek, m.egyedi.pancelErtek); be(eg.utem, m.egyedi.utem);
  be(eg.ar, m.egyedi.ar); be(eg.ido, m.egyedi.ido);
  be(eg.nep, m.egyedi.nep); be(eg.epulet, m.egyedi.epulet);
  be(eg.keszult, m.egyedi.keszult); be(eg.elutasitva, m.egyedi.elutasitva);

  const kd = sim.kod;
  for (let cs = 0; cs < kd.csapatDb; cs++) {
    be(kd.latott[cs], m.kod.latott[cs]);
    be(kd.lathato[cs], m.kod.lathato[cs]);
  }
  be(kd.latottDb, m.kod.latottDb);
  be(kd.lathatoDb, m.kod.lathatoDb);
  kd.frissitesDb = m.kod.frissitesDb | 0;
  kd.valtozat = (kd.valtozat + 1) | 0;   // a render töltsön újra

  // A PARANCS-SOR visszatöltése. Kulcs szerint, nem beszúrási sorrendben.
  sim._sor.clear();
  for (let i = 0; i < m.sor.length; i++) {
    sim._sor.set(m.sor[i].t | 0, m.sor[i].p.slice());
  }

  // A MEZŐ-TÁR ÚJRAÉPÍTÉSE REKESZHŰEN. Nem elég érvényteleníteni: az egységek
  // `mezoId`-je INDEX ezekbe a rekeszekbe (lásd a fejléc `MezoTar` bekezdését).
  // Ugyanabba a rekeszbe, ugyanarra a célcellára számolunk, tehát a mentett
  // `mezoId` továbbra is arra a mezőre mutat, amire mutatott.
  const mt = sim.mezoTar;
  const mentett = m.mezoTar || [];
  for (let i = 0; i < mt.mezok.length; i++) {
    const z = mt.mezok[i];
    const cel = i < mentett.length ? (mentett[i].cel | 0) : -1;
    z.cel = -1;
    if (cel >= 0) mt._szamol(z, cel);
    // ⚠️ AZ LRU-BÉLYEG A KIÜRÍTETT REKESZEN IS SZÁMÍT. A `_mezoErvenytelenites`
    // csak a `cel`-t nullázza, az `utoljara`-t meghagyja — és a következő
    // mező-kérés a LEGRÉGEBBEN használt rekeszt írja felül. Ha a betöltött
    // világban minden kiürített rekesz nulla bélyeggel indulna, a kiszorítás
    // MÁS rekeszt választana, és onnantól az egységek `mezoId`-je is elcsúszna.
    // Mérve: a folytatás a 115. tick után tért el, egyetlen egység `mezoId`-jén
    // (7 helyett 1) — száz tickkel a valódi ok után.
    z.utoljara = i < mentett.length ? (mentett[i].utoljara | 0) : 0;
  }
  sim.eroforrasok.jarhatosagValtozott = false;
  sim.epuletek.jarhatosagValtozott = false;

  return { ok: true };
}

/** Szöveggé alakítás (localStorage, fájl). */
export function mentesSzoveg(sim) { return JSON.stringify(mentes(sim)); }

/**
 * Szövegből betöltés. A hibás JSON-t itt kapjuk el, nem a mélyben — a
 * betöltés a játékos szempontjából egyetlen művelet, egyetlen hibaüzenettel.
 */
export function betoltesSzoveg(sim, szoveg) {
  let m;
  try { m = JSON.parse(szoveg); } catch (h) { return { ok: false, hiba: 'olvashatatlan mentés' }; }
  return betoltes(sim, m);
}

export { KESLELTETES };
