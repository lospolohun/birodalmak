// AGE OF THE CRYSTALS — TÉRKÉP-PRESETEK (v0.10/1).
//
// ── MIÉRT PARAMÉTER-TÁBLA, ÉS NEM HAT GENERÁTOR ───────────────────────────
// A kézenfekvő megvalósítás hat `_general()` változat lenne — külön kódút a
// nyílt mezőnek, a folyamnak, az erdőségnek. Ez a projektben mérgező: a
// terep-generálás a lockstep LEGELSŐ feltétele (két gép ugyanabból a seedből
// bitre ugyanazt a pályát kapja), és hat kódút azt jelenti, hogy hat helyen
// lehet elrontani, öt helyen pedig észrevétlenül — a szonda mindig azt az
// egyet járatná, amelyiket a forgatókönyv beállít.
//
// Ezért EGY generátor van, és a preset SZÁMOKAT ad neki. Amit egy preset
// állíthat: a domborzat kilengése, a szárazföld emelése, a peremgerincek
// súlya, a sziklaküszöb, a folyó-sáv, és a nyersanyag-fürtök darabszáma és
// mérete. Ami NEM állítható: maga az algoritmus. Így a determinizmus-szonda
// egyetlen kódutat őriz, a hat preset pedig hat SZÁM-készlet ugyanazon.
//
// ── AMI SZÁNDÉKOSAN NINCS: SZIGETEK ───────────────────────────────────────
// A műfaj klasszikus térképe a szigetes, és pont ezért kell kimondani, miért
// hiányzik: NINCS HAJÓ. Egy vízzel elválasztott pályán a két bázis között
// nincs járható út, az áramlási mező fél térképnyi elérhetetlen cellát
// számolna végig, a gépi ellenfél pedig örökké „támadásra készülne" úgy, hogy
// a serege el sem indul. A szigetes térkép nem preset-kérdés, hanem a hajók
// kérdése — és az nem a v0.10 dolga.
//
// ── A PRESET A MENTÉS RÉSZE ───────────────────────────────────────────────
// A terepet NEM mentjük (a seedből épül), és a betöltés eddig a seedet és a
// pályaméretet ellenőrizte. A presettel ez KEVÉS lett: ugyanaz a seed, ugyanaz
// a méret, MÁS preset — más pálya, és a betöltött sereg a vízben állna. A
// `mentes.js` ezért a presetet is tárolja és ellenőrzi.

/** A hat térkép-preset. A sorrend az indexük — sosem cseréljük fel. */
export const TERKEP = {
  NYILT_MEZO: 0,
  FOLYAM: 1,
  ERDOSEG: 2,
  HEGYVIDEK: 3,
  KRISTALYMEZO: 4,
  SZARAZFOLD: 5,
};
export const TERKEP_DB = 6;

export const TERKEP_NEV = [
  'Nyílt mező',
  'Folyam',
  'Erdőség',
  'Hegyvidék',
  'Kristálymező',
  'Szárazföld',
];

/** Rövid, JÁTÉKOSNAK szóló leírás — a v0.11 menüje ezt mutatja. */
export const TERKEP_LEIRAS = [
  'Nyílt csatatér, kevés akadállyal. A lovasság itt van otthon, '
  + 'és a bázist nincs mi mögé rejteni.',
  'Széles folyó vágja ketté a pályát, néhány gázlóval. '
  + 'Aki a gázlót tartja, az szabja meg, mikor legyen csata.',
  'Sűrű erdő, szűk átjárókkal. A fa bőven van, a manőverezés viszont nem — '
  + 'az ostromgépnek itt kell utat vágni.',
  'Sziklás magaslatok és szorosok. Kevés a járható út, '
  + 'de aki a szorost lezárja, sokáig kitart.',
  'Kristályban gazdag pálya, a legjobb lelőhelyek középen. '
  + 'A gazdaság gyorsan felpörög — és a közép mindenkié.',
  'Se folyó, se tenger: összefüggő szárazföld, sok füves területtel. '
  + 'A leghosszabb, legnyugodtabb kezdés.',
];

/**
 * PRESET-PARAMÉTEREK.
 *
 * ⚠️ A 0. SOR SZÁMAI NEM MÓDOSÍTHATÓK. A `NYILT_MEZO` pontosan azokat az
 * értékeket viseli, amik a v0.1 óta a `grid.js`-ben és az `eroforras.js`-ben
 * álltak — ez az alapértelmezés, és a `qa/V0.1_EREDMENY.md` minden száma,
 * valamint a determinizmus-szonda összes rögzített hashe ehhez van kötve. Egy
 * „csak egy hajszállal szebb" hangolás itt a motor-mag regresszió-őrét törné el.
 *
 * A mezők:
 *   amplitudo    a dombzaj kilengése világegységben
 *   emeles       ennyivel emeljük a szárazföldet a vízszint fölé
 *   gerinc       a peremgerincek súlya (0 = teljesen sík perem)
 *   peremTav     ez alatt a normált középtávolság alatt nincs gerinc
 *   tengerTav    e fölött húzzuk le a peremet tengerré (1-nél nagyobb = nincs)
 *   sziklaLejto  ennél meredekebb lejtő szikla, tehát járhatatlan
 *   havasSzint   e fölött havas (látvány; a járhatóságot nem érinti)
 *   folyoSzeles  a folyó fél szélessége cellában; 0 = nincs folyó
 *   gazloDb      hány gázló szakítja meg a folyót
 *   kristalyFurt hány kristály-fürt
 *   etel/fa/ko   fürt-leírás: `[darab, minimum cella, szórás, sugár]`
 */
const P = [
  // 0 — NYÍLT MEZŐ (az EREDETI számok, lásd a figyelmeztetést)
  {
    amplitudo: 5.0, emeles: 2.4, gerinc: 14.0, peremTav: 0.62, tengerTav: 0.95,
    sziklaLejto: 0.55, havasSzint: 9.5, folyoSzeles: 0, gazloDb: 0,
    kristalyFurt: 14,
    etel: [13, 4, 5, 3], fa: [11, 34, 30, 6], ko: [7, 5, 5, 3],
  },
  // 1 — FOLYAM: laposabb pálya, hogy a folyó legyen az EGYETLEN valódi akadály.
  {
    amplitudo: 3.4, emeles: 3.0, gerinc: 9.0, peremTav: 0.70, tengerTav: 0.95,
    sziklaLejto: 0.62, havasSzint: 11.0, folyoSzeles: 5, gazloDb: 3,
    kristalyFurt: 13,
    etel: [14, 4, 5, 3], fa: [10, 32, 26, 6], ko: [7, 5, 5, 3],
  },
  // 2 — ERDŐSÉG: kevés domb, RENGETEG fa. A szűk átjárókat az erdő adja, nem
  //     a szikla — így a fa kitermelése ténylegesen utat NYIT, ami a v0.3
  //     `jarhatosagValtozott` ágának az egyetlen igazi játékbeli jelentése.
  {
    amplitudo: 3.0, emeles: 3.2, gerinc: 7.0, peremTav: 0.72, tengerTav: 0.96,
    sziklaLejto: 0.66, havasSzint: 12.0, folyoSzeles: 0, gazloDb: 0,
    kristalyFurt: 12,
    etel: [12, 4, 4, 3], fa: [26, 46, 34, 7], ko: [6, 5, 4, 3],
  },
  // 3 — HEGYVIDÉK: nagy kilengés és ALACSONY sziklaküszöb → sok járhatatlan
  //     gerinc, tehát szorosok. Több kő, mert a hegy azt adja.
  {
    amplitudo: 8.5, emeles: 3.4, gerinc: 18.0, peremTav: 0.52, tengerTav: 0.94,
    sziklaLejto: 0.44, havasSzint: 8.0, folyoSzeles: 0, gazloDb: 0,
    kristalyFurt: 15,
    etel: [12, 4, 5, 3], fa: [10, 30, 26, 6], ko: [13, 7, 6, 4],
  },
  // 4 — KRISTÁLYMEZŐ: nyílt, mint a nyílt mező, de dupla kristály-fürttel.
  {
    amplitudo: 4.2, emeles: 2.8, gerinc: 11.0, peremTav: 0.66, tengerTav: 0.95,
    sziklaLejto: 0.58, havasSzint: 10.0, folyoSzeles: 0, gazloDb: 0,
    kristalyFurt: 28,
    etel: [13, 4, 5, 3], fa: [11, 32, 28, 6], ko: [8, 5, 5, 3],
  },
  // 5 — SZÁRAZFÖLD: se folyó, se tenger. A `tengerTav: 2.0` az a szám, ami
  //     kikapcsolja a peremi levágást — a feltétel sosem teljesül, tehát nem
  //     kell külön elágazás a generátorba.
  {
    amplitudo: 3.8, emeles: 6.0, gerinc: 8.0, peremTav: 0.74, tengerTav: 2.0,
    sziklaLejto: 0.64, havasSzint: 13.0, folyoSzeles: 0, gazloDb: 0,
    kristalyFurt: 14,
    etel: [15, 5, 5, 3], fa: [12, 34, 30, 6], ko: [8, 5, 5, 3],
  },
];

/**
 * Egy preset paraméterei. Ismeretlen indexre a NYÍLT MEZŐ jön vissza.
 *
 * Az alapértelmezés nem véletlen: aki `terkep` nélkül hoz létre `Sim`-et
 * (a v0.1 óta minden szonda, a `main.js`, a hálózati kliens), pontosan a
 * régi pályát kapja. Egy elgépelt preset-név sem tehet elérhetetlenné egy
 * meccset — csak a megszokott térképet adja.
 *
 * @param {number} terkep `TERKEP.*`
 */
export function terkepBeallitas(terkep) {
  const t = terkep | 0;
  if (t < 0 || t >= TERKEP_DB) return P[TERKEP.NYILT_MEZO];
  return P[t];
}

/** Érvényes preset-index-e? A mentés betöltése és a menü kérdezi. */
export function terkepErvenyes(terkep) {
  return Number.isInteger(terkep) && terkep >= 0 && terkep < TERKEP_DB;
}

export { P as TERKEP_PARAM };
