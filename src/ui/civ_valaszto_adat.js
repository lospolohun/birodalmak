// AGE OF THE CRYSTALS — A CIV-VÁLASZTÓ SZÖVEGEI (v0.11/1): DOM-mentes adatréteg.
//
// ── MIÉRT KÜLÖN FÁJL A RAJZOLÁSTÓL ────────────────────────────────────────
// Ugyanaz a szétvágás, mint a `minimap_adat.js`-nél, és ugyanazért: ez a modul
// nem tud a DOM-ról, a `three`-ről és a vászonról, tehát NODE-BAN IS FUTTATHATÓ.
// A civ-választó nehéz része nem a nyolc doboz kirajzolása, hanem a
// `civBonuszai()` nyers `[hatás, index, érték]` hármasainak MONDATTÁ fordítása —
// és pont ezt a részt nem lehetne máshogy vizsgálni, mint szemmel. A felhőben
// pedig nincs szem (nincs GPU), tehát ami csak a képernyőn látszik, az nincs
// őrizve.
//
// ── ⚠️ AZ ELŐJEL NEM ÖNMAGÁBAN BESZÉL ─────────────────────────────────────
// EZ A FÁJL LEGFONTOSABB SZABÁLYA, és a projektben már egyszer megbukott rajta
// egy vizsgálat (a determinizmus-szonda 12. körének első változata).
//
// A bónusz-tábla értékei ELTOLÁSOK, de nem mindegyik ugyanabba az irányba jó:
//
//   · sebzés, páncél, ütem, cipelés, épület-életerő, népesség
//        NAGYOBB = JOBB          → a pozitív szám ELŐNY
//   · épület-ÁR, egység-ÁR, egység-IDŐ
//        NAGYOBB = ROSSZABB      → a pozitív szám HÁTRÁNY
//
// A Kristálykovácsok `+10 %` egység-ára tehát HÁTRÁNY, nem előny — ahogy a
// `civ.js` leírása is mondja: „a jó acél viszont drága". Ha ezt a réteg
// elrontja, a menü a legdrágább civet hirdeti a legolcsóbbnak, és a
// determinizmus-kapu ebből SEMMIT nem vesz észre: a hash-ek attól még bitre
// egyeznek, hogy a felirat hazudik. Ezért van az irány EGYETLEN helyen
// (`_forditott`), és ezért gátja a szonda névvel, civre lebontva.
//
// ── MIÉRT MONDAT, ÉS MIÉRT NEM SZÁM ───────────────────────────────────────
// A választó a MECCS ELŐTT áll: itt a játékos még nem tudja, mi az „UTEM[3]"
// vagy a „TAMADAS.NYIL". Amit tudnia kell, az annyi, hogy ezzel a néppel
// gyorsabban jön a kristály és drágább a katona. A nyers szám a HUD és a QA
// dolga (`Civ.osszesites()`), nem a menüé.
//
// ── NEVEK: A MEGLÉVŐ TÁBLÁKBÓL ────────────────────────────────────────────
// A nyersanyag- és támadás-nevek a `NYERS_NEV` és a `TAMADAS_NEV`-ből jönnek,
// nem másolatból: egy átnevezés így egy helyen történik. Ahol saját tábla van
// (egységnevek, tárgyeset), ott az OK oda van írva — és a tábla `TIPUS.*` /
// `NYERS.*` szerint van INDEXELVE, nem sorrendben feltöltve, tehát a
// konstansok átszámozása sem tudja elcsúsztatni.
//
// ── ALLOKÁCIÓ ─────────────────────────────────────────────────────────────
// Ez a réteg SZABADON allokál: menü-időben fut, egyszer, nem képkockánként. A
// rajzoló út (`civ_valaszto.js`) ezt a listát EGYSZER kéri el a felépítéskor,
// és utána már csak osztályt kapcsolgat — ott marad a nulla per-frame allokáció.

import {
  CIV, CIV_DB, CIV_NEV, CIV_LEIRAS, HATAS, MIND, civBonuszai,
} from '../sim/civ.js';
import { NYERS, NYERS_NEV } from '../sim/eroforras.js';
import { TIPUS } from '../sim/units.js';
import { TAMADAS_NEV } from '../sim/harc.js';

/**
 * Egységnevek `TIPUS.*` SZERINT INDEXELVE.
 *
 * A `units.js` nem exportál név-táblát (a sim-nek nincs is rá szüksége: a
 * szimuláció számokkal dolgozik), a sávom pedig csak új fájlokat írhat. Ezért
 * itt áll — de kulcsonként, nem sorrendben: ha a `TIPUS` valaha átszámozódik,
 * ez a tábla vele mozdul, nem csúszik el csendben.
 */
const EGYSEG_NEV = [];
EGYSEG_NEV[TIPUS.MUNKAS] = 'munkás';
EGYSEG_NEV[TIPUS.LANDZSAS] = 'lándzsás';
EGYSEG_NEV[TIPUS.IJASZ] = 'íjász';
EGYSEG_NEV[TIPUS.LOVAG] = 'lovag';
EGYSEG_NEV[TIPUS.OSTROMGEP] = 'ostromgép';
// A civenkénti EGYEDI egységnek nincs egy neve — a `Egyedi.nev(csapat)` adja
// meg („Fénylovag", „Homoki futó"), és az CSAPAThoz kötött. A `bonuszMondat()`
// viszont szándékosan civ-független (egy sor → egy mondat, felállás nélkül),
// ezért itt az általános megnevezés áll. Ha a v0.13 hangolása egyedi-egység
// árat vagy időt ad valamelyik népnek, a kártyán ez a szó jelenik meg — nem
// hibás, csak általánosabb, mint amit a HUD tud.
EGYSEG_NEV[TIPUS.EGYEDI] = 'egyedi egységük';

/**
 * A nyersanyagok TÁRGYESETE („gyorsabban gyűjtenek KÖVET").
 *
 * A magyar rag nem származtatható a szótőből (`fa → fát`, de `kő → követ`),
 * ezért a két szabálytalan alak ki van írva. A szabályosak a `NYERS_NEV`-ből
 * épülnek, hogy egy átnevezés ott is átüssön.
 */
const NYERS_TARGY = [];
NYERS_TARGY[NYERS.ETEL] = NYERS_NEV[NYERS.ETEL] + 't';
NYERS_TARGY[NYERS.FA] = 'fát';
NYERS_TARGY[NYERS.KO] = 'követ';
NYERS_TARGY[NYERS.KRISTALY] = NYERS_NEV[NYERS.KRISTALY] + 't';

/** Magánhangzók a határozott névelőhöz (`a` / `az`). */
const MAGANHANGZO = 'aáeéiíoóöőuúüű';

/** `a` vagy `az` — a szó első betűje dönt. */
function _nevelo(szo) {
  return MAGANHANGZO.indexOf(szo.charAt(0)) >= 0 ? 'az' : 'a';
}

/** Mondatkezdő nagybetű. */
function _nagy(szo) {
  return szo.charAt(0).toUpperCase() + szo.slice(1);
}

/**
 * FORDÍTOTT OLVASATÚ-E EZ A HATÁS? — lásd a fejléc ⚠️ szakaszát.
 *
 * Ez az EGYETLEN hely, ahol az irány el van döntve. Ha egy új hatás kerül a
 * `civ.js`-be, itt kell eldönteni, melyik oldalra tartozik — és a szonda
 * hatás-lefedettség-gátja miatt nem lehet elfelejteni.
 */
function _forditott(hatas) {
  return hatas === HATAS.EPULET_AR
    || hatas === HATAS.EGYSEG_AR
    || hatas === HATAS.EGYSEG_IDO;
}

/**
 * ELŐNY-E ez a bónusz-sor?
 *
 * A nulla SZÁNDÉKOSAN nem előny: egy nulla értékű sor elrontott balansz-sor
 * (nem csinál semmit, de foglalja a helyet), és a hátrány-oldalon látszik is —
 * a szonda pedig külön gátat tart rá.
 *
 * @param {number} hatas `HATAS.*`
 * @param {number} ertek eltolás vagy százalék-eltolás
 * @returns {boolean}
 */
export function elonyE(hatas, ertek) {
  if (ertek === 0) return false;
  return _forditott(hatas) ? ertek < 0 : ertek > 0;
}

/**
 * EGY bónusz-sor MONDATTÁ.
 *
 * @param {number} hatas `HATAS.*`
 * @param {number} index `NYERS.*` / `TIPUS.*` / `TAMADAS.*` / `MIND`
 * @param {number} ertek
 * @returns {string|null} `null`, ha a réteg nem ismeri a sort — a hívó ezt
 *   LÁTHATÓ hibaszöveggé teszi, nem nyeli le
 */
export function bonuszMondat(hatas, index, ertek) {
  // A NAGYSÁG megy a szövegbe, az IRÁNYT a szó hordozza („gyorsabban" /
  // „lassabban"). Így nem lehet kétszer tagadni: egy „-10 %-kal lassabban"
  // ugyanolyan hiba lenne, mint a rossz oldalra sorolás.
  const e = ertek < 0 ? -ertek : ertek;
  const jo = ertek > 0;

  switch (hatas) {
    case HATAS.SEBZES: {
      if (index === MIND) {
        return jo
          ? 'Minden támadásuk +' + e + ' sebzést visz.'
          : 'Minden támadásuk ' + e + ' sebzést veszít.';
      }
      const nev = TAMADAS_NEV[index];
      if (nev === undefined) return null;
      return _nagy(_nevelo(nev)) + ' ' + nev + '-támadásuk '
        + (jo ? '+' + e + ' sebzést visz.' : e + ' sebzést veszít.');
    }

    case HATAS.PANCEL:
      return jo
        ? 'Minden katonájuk +' + e + ' páncélt hord.'
        : 'Minden katonájuk ' + e + ' páncéllal kevesebbet hord.';

    case HATAS.UTEM: {
      const irany = jo ? 'gyorsabban' : 'lassabban';
      if (index === MIND) {
        return 'Minden nyersanyagot ' + e + ' %-kal ' + irany + ' gyűjtenek.';
      }
      const targy = NYERS_TARGY[index];
      if (targy === undefined) return null;
      return e + ' %-kal ' + irany + ' gyűjtenek ' + targy + '.';
    }

    case HATAS.CIPEL:
      return jo
        ? 'A munkásaik egyszerre +' + e + ' nyersanyagot cipelnek.'
        : 'A munkásaik egyszerre ' + e + '-gyel kevesebbet cipelnek.';

    case HATAS.EPULET_HP:
      return 'Az épületeik ' + e + ' %-kal ' + (jo ? 'többet' : 'kevesebbet') + ' bírnak.';

    // ⚠️ INNENTŐL FORDÍTOTT AZ OLVASAT. A pozitív szám DRÁGÁBB/LASSABB.
    case HATAS.EPULET_AR:
      return e + ' %-kal ' + (jo ? 'drágábban' : 'olcsóbban') + ' építkeznek.';

    case HATAS.EGYSEG_AR: {
      const szo = jo ? 'drágább' : 'olcsóbb';
      if (index === MIND) return 'Minden egységük ' + e + ' %-kal ' + szo + '.';
      const nev = EGYSEG_NEV[index];
      if (nev === undefined) return null;
      // „Náluk a lovag…" — a birtokos rag szabálytalan (`lovagjuk`, `íjászuk`,
      // `ostromgépük`), ez a fordulat viszont minden névvel helyes marad.
      return 'Náluk ' + _nevelo(nev) + ' ' + nev + ' ' + e + ' %-kal ' + szo + '.';
    }

    case HATAS.EGYSEG_IDO: {
      const szo = (jo ? 'lassabban' : 'gyorsabban') + ' áll ki';
      if (index === MIND) return 'Minden egységük ' + e + ' %-kal ' + szo + '.';
      const nev = EGYSEG_NEV[index];
      if (nev === undefined) return null;
      return 'Náluk ' + _nevelo(nev) + ' ' + nev + ' ' + e + ' %-kal ' + szo + '.';
    }

    case HATAS.NEPESSEG:
      return e + ' fővel ' + (jo ? 'nagyobb' : 'kisebb') + ' hadat tartanak el.';

    default:
      return null;
  }
}

/** Amit a réteg nem tud mondattá tenni — LÁTHATÓAN, nem elnyelve. */
const ISMERETLEN_SZOVEG =
  'Ismeretlen hatás a balansz-táblában — a választó nem tudja megmutatni.';
/** Nulla értékű bónusz-sor: elrontott balansz-sor, nem díszítés. */
const NULLAS_SZOVEG =
  'Ennek a sornak nincs hatása — nulla érték a balansz-táblában.';

/**
 * EGY CIV teljes választó-adata.
 *
 * @param {number} civ `CIV.*`
 * @returns {{
 *   civ:number, nev:string, leiras:string,
 *   elony:string[], hatrany:string[],
 *   tetelek:{hatas:number, index:number, ertek:number, szoveg:string, elony:boolean}[],
 *   ismeretlenDb:number, nullasDb:number
 * }}
 *   Az `ismeretlenDb` és a `nullasDb` a MŰKÖDÉS-SZÁMOK: egy le nem kezelt
 *   `HATAS`-ág vagy egy kiürült balansz-sor különben csendben elveszne — a
 *   kártya egyszerűen eggyel kevesebb sort mutatna, és senki nem venné észre.
 */
export function civValasztoAdat(civ) {
  const c = civ | 0;
  if (c < 0 || c >= CIV_DB) {
    return {
      civ: c, nev: '—', leiras: '', elony: [], hatrany: [], tetelek: [],
      ismeretlenDb: 0, nullasDb: 0,
    };
  }

  const sorok = civBonuszai(c);
  const elony = [];
  const hatrany = [];
  const tetelek = [];
  let ismeretlenDb = 0;
  let nullasDb = 0;

  for (let s = 0; s < sorok.length; s++) {
    const hatas = sorok[s][0];
    const index = sorok[s][1];
    const ertek = sorok[s][2];

    let szoveg;
    if (ertek === 0) { szoveg = NULLAS_SZOVEG; nullasDb++; } else {
      szoveg = bonuszMondat(hatas, index, ertek);
      if (szoveg === null) { szoveg = ISMERETLEN_SZOVEG; ismeretlenDb++; }
    }

    // MINDEN sorból keletkezik tétel, akkor is, ha hibás — a szonda így tudja
    // egyenlőségre vizsgálni a sorok és a mondatok számát.
    const jo = ertek !== 0 && szoveg !== ISMERETLEN_SZOVEG && elonyE(hatas, ertek);
    (jo ? elony : hatrany).push(szoveg);
    tetelek.push({ hatas, index, ertek, szoveg, elony: jo });
  }

  return {
    civ: c,
    nev: CIV_NEV[c],
    leiras: CIV_LEIRAS[c],
    elony,
    hatrany,
    tetelek,
    ismeretlenDb,
    nullasDb,
  };
}

/**
 * MIND A NYOLC nép választó-adata, `CIV.*` sorrendben.
 *
 * A menü ezt kéri el EGYSZER, a felépítéskor. Új tömb minden híváskor — ez itt
 * helyes: a hívó különben a közös listát írhatná át, és a v0.13 hangolása után
 * senki nem találná meg, honnan jött a hamis felirat.
 */
export function civValasztoLista() {
  const ki = [];
  for (let c = 0; c < CIV_DB; c++) ki.push(civValasztoAdat(c));
  return ki;
}

export { CIV, CIV_DB };
