// AGE OF THE CRYSTALS — SIM-NEVEK → SZÖVEG-KULCSOK (v0.20 előkészítés).
//
// ════════════════════════════════════════════════════════════════════════════
// A RÉTEGHATÁR-DÖNTÉS, ÉS MIÉRT ÍGY
// ════════════════════════════════════════════════════════════════════════════
// A kérdés: a `src/sim/` alatt MA magyar feliratok állnak (`EPULET_NEV`,
// `TECH_NEV`, `NYERS_NEV`, `ALLAS_NEV`, `ALAKZAT_NEV`, `CIV_NEV`, …), egy olyan
// rétegben, aminek az `INTERFACES.md` szerint semmilyen megjelenítésről nem
// szabadna tudnia. Két kiút van:
//
//   (A) a SIM ad KULCSOT (`'sim.alakzat.ek'`), a UI oldja fel;
//   (B) a SIM marad, ahogy van, és a UI tart PÁRHUZAMOS név-táblát.
//
// ── A DÖNTÉS: (A). A SIM AD KULCSOT. ──────────────────────────────────────
//
// 1. A PROJEKT MÁR MEGMUTATTA, HOGY A PÁRHUZAMOS TÁBLA SZÉTCSÚSZIK. Nem
//    feltételezés: MA két `EGYSEG_NEV` tábla van a `src/ui/` alatt — a
//    `panel_kepzes_adat.js:54` hat elemű (`'egyedi egység'`-gel a végén), a
//    `civ_valaszto_adat.js:64` viszont csak négyet tölt fel indexenként, és az
//    ötödik-hatodik helyet üresen hagyja. Ugyanaz az enum, két igazság, és
//    egyik sem hazudik hangosan — az `undefined` felirat csak akkor derülne ki,
//    ha valaki pont arra a sorra néz rá. A (B) út ezt SZABÁLLYÁ tenné.
//
// 2. A KULCS NEM FELHASZNÁLÓI SZÖVEG. Az `INTERFACES.md` tiltólistája a simre:
//    `three`, DOM, `performance.now()`, `Math.random`, `Math.sin/cos/…`. Ezek
//    mind KÖRNYEZETI függések. Az `'sim.alakzat.ek'` viszont ugyanolyan
//    környezet-független ASCII azonosító, mint maga az `ALAKZAT.EK = 2` — csak
//    olvashatóbb. Node-ban ugyanaz, a hashben nincs benne, és a képernyőre
//    sosem kerül. Ami a simből KIKERÜL a kulcsosítással, az a MAGYAR NYELV.
//
// 3. A KIADÁS-KAPU 46. ELVÁRÁSA ÍGY MARAD ÉLŐ. A `tools/kiadas_ellenorzo.mjs`
//    `NEV_TABLAK` nyilvántartása kilenc sim-táblát mér össze a saját enumjával
//    („minden név-tábla a saját enumjával egyforma hosszú"). Ha a táblák a UI-ba
//    KÖLTÖZNÉNEK, ez a kilenc gát a levegőbe nyúlna. Ha a helyükön maradnak, és
//    csak az ÉRTÉKÜK lesz kulcs, a kapu egyetlen sor változtatás nélkül tovább
//    őrzi őket — a leghosszabb életű ellenőrzés az, amelyik nem költözik.
//
// 4. A `PLAN.md` v0.19-es szakasza ELŐRE kimondta ugyanezt: „A v0.19 első lépése
//    ezeket KULCSOKKÁ alakítani (`'alakzat.ek'`), és a feloldást a UI-ba tenni."
//
// ── AKKOR EZ A FÁJL MI? HÍD, AMINEK HALÁLDÁTUMA VAN. ──────────────────────
// A sim átírása nem fér ebbe a körbe (öt agent dolgozik párhuzamosan, és a
// `src/sim/` alatt a determinizmus mindent felülír). Amíg a sim magyar szöveget
// ad, ez a fájl tartja az `ENUM-INDEX → KULCS` táblákat, és a UI ezeken megy
// keresztül. Amikor a sim-táblák értéke kulcsra vált, ez a fájl ELTŰNIK: a
// hívások `EPULET_KULCS[t]` helyett `EPULET_NEV[t]`-t adnak `sz()`-nek, és
// minden más marad.
//
// ⚠️ AZ ÁTÁLLÁS NAPJÁN IS ŐRIZ. Az alábbi `tablakEllenorzes()` MINDKÉT állapotot
// ismeri: ha a sim-tábla eleme még magyar mondat, a szótár magyar értékével kell
// BETŰRE egyeznie (különben a fordítás elsodródott a forrástól); ha viszont már
// kulcsnak látszik, akkor annak a kulcsnak kell léteznie mindkét szótárban. Így
// a gát nem az átállás első percében romlik el — akkor, amikor a legjobban kell.
//
// ⚠️ AMIT EZ A HÍD NEM TUD ELLENŐRIZNI: az EGYEDI EGYSÉGEK nevét. Az
// `egyedi.js` `EGYEDI_PROFIL` táblája NEM exportált; a nevek egy sim-METÓDUSON
// jönnek ki (`sim.egyedi.nev(csapat)`), ami közvetlenül magyar szöveget ad
// vissza. Ez a réteghatár legdurvább átlépése a projektben — és a kulcsosításkor
// ez az egyetlen hely, ahol nem elég a tábla értékét átírni, a metódusnak is
// kulcsot kell adnia. A `sim.egyedi.*` kulcsok itt már készen állnak rá.
//
// HASZNÁLAT:
//   import { EPULET_KULCS } from './szoveg_sim.js';
//   cimke.textContent = sz(EPULET_KULCS[ep.tipus[i]]);

import { NYERS, NYERS_NEV } from '../sim/eroforras.js';
import { KORSZAK, KORSZAK_NEV } from '../sim/gazdasag.js';
import { ALAKZAT, ALAKZAT_NEV } from '../sim/alakzat.js';
import { ALLAS, ALLAS_NEV } from '../sim/parancsallapot.js';
import { TAMADAS, TAMADAS_NEV, PANCEL, PANCEL_NEV } from '../sim/harc.js';
import { EPULET, EPULET_NEV } from '../sim/epuletek.js';
import { TECH, TECH_NEV, TECH_LEIRAS } from '../sim/technologia.js';
import { TERKEP, TERKEP_NEV, TERKEP_LEIRAS } from '../sim/terkep.js';
import { CIV, CIV_NEV, CIV_LEIRAS } from '../sim/civ.js';
import { TIPUS } from '../sim/units.js';
import { VEG_OK, VEG_OK_NEV } from '../sim/gyozelem.js';
import { NEHEZSEG, NEHEZSEG_NEV } from '../sim/ai.js';
import { HU } from './szoveg_hu.js';
import { EN } from './szoveg_en.js';

// ── ENUM-INDEXELT KULCS-TÁBLÁK ──────────────────────────────────────────────
// Mindegyik PONTOSAN olyan hosszú, mint a saját enumja. A `tablakEllenorzes()`
// ezt méri, mert ez a projekt leggyakoribb néma hibája: a rövid tábla nem dob,
// hanem `undefined`-et ad, amiből a képernyőn „undefined" felirat lesz.

export const NYERS_KULCS = [
  'sim.nyers.etel', 'sim.nyers.fa', 'sim.nyers.ko', 'sim.nyers.kristaly',
];

export const KORSZAK_KULCS = [
  'sim.korszak.sotet', 'sim.korszak.hajnal', 'sim.korszak.kristaly', 'sim.korszak.feny',
];
/** „…el kell érned A HAJNAL KORÁT" — tárgyeset, névelővel. Lásd `szoveg_hu.js`. */
export const KORSZAK_TARGY_KULCS = [
  'sim.korszak.sotet.targy', 'sim.korszak.hajnal.targy',
  'sim.korszak.kristaly.targy', 'sim.korszak.feny.targy',
];
/** „most A HAJNAL KORÁBAN jársz" — helyhatározó, névelővel. */
export const KORSZAK_HELY_KULCS = [
  'sim.korszak.sotet.hely', 'sim.korszak.hajnal.hely',
  'sim.korszak.kristaly.hely', 'sim.korszak.feny.hely',
];

export const ALAKZAT_KULCS = [
  'sim.alakzat.negyzet', 'sim.alakzat.vonal', 'sim.alakzat.ek', 'sim.alakzat.szort',
];

export const ALLAS_KULCS = [
  'sim.allas.agressziv', 'sim.allas.vedekezo', 'sim.allas.tartas', 'sim.allas.tuzszunet',
];

export const TAMADAS_KULCS = [
  'sim.tamadas.vago', 'sim.tamadas.szuro', 'sim.tamadas.nyil', 'sim.tamadas.ostrom',
];

export const PANCEL_KULCS = [
  'sim.pancel.gyalogos', 'sim.pancel.tavolsagi', 'sim.pancel.lovas',
  'sim.pancel.epulet', 'sim.pancel.ostrom',
];

export const EPULET_KULCS = [
  'sim.epulet.kozpont', 'sim.epulet.raktar', 'sim.epulet.fal', 'sim.epulet.kapu',
  'sim.epulet.haz', 'sim.epulet.laktanya', 'sim.epulet.ijaszda', 'sim.epulet.istallo',
  'sim.epulet.ostrommuhely', 'sim.epulet.torony', 'sim.epulet.piac',
];

/**
 * EGYSÉGTÍPUS-nevek. ⚠️ A simben NINCS `TIPUS_NEV` tábla — ma a UI két
 * KÜLÖNBÖZŐ példányt tart belőle (`panel_kepzes_adat.js`, `civ_valaszto_adat.js`),
 * és a kettő nem egyforma hosszú. Ez az egy tábla a legjobb érv a fenti
 * réteghatár-döntés mellett: itt EGY igazság lesz, a `TIPUS` hosszára mérve.
 */
export const TIPUS_KULCS = [
  'sim.tipus.munkas', 'sim.tipus.landzsas', 'sim.tipus.ijasz',
  'sim.tipus.lovag', 'sim.tipus.ostromgep', 'sim.tipus.egyedi',
];

export const TECH_KULCS = [
  'sim.tech.kovacsolas', 'sim.tech.illesztett_ij', 'sim.tech.pancelozas',
  'sim.tech.ekevas', 'sim.tech.talicska', 'sim.tech.falazas',
];
export const TECH_LEIRAS_KULCS = [
  'sim.tech.leiras.kovacsolas', 'sim.tech.leiras.illesztett_ij',
  'sim.tech.leiras.pancelozas', 'sim.tech.leiras.ekevas',
  'sim.tech.leiras.talicska', 'sim.tech.leiras.falazas',
];

export const TERKEP_KULCS = [
  'sim.terkep.nyilt_mezo', 'sim.terkep.folyam', 'sim.terkep.erdoseg',
  'sim.terkep.hegyvidek', 'sim.terkep.kristalymezo', 'sim.terkep.szarazfold',
];
export const TERKEP_LEIRAS_KULCS = [
  'sim.terkep.leiras.nyilt_mezo', 'sim.terkep.leiras.folyam',
  'sim.terkep.leiras.erdoseg', 'sim.terkep.leiras.hegyvidek',
  'sim.terkep.leiras.kristalymezo', 'sim.terkep.leiras.szarazfold',
];

export const CIV_KULCS = [
  'sim.civ.kristalykovacsok', 'sim.civ.pusztai_lovasok', 'sim.civ.erdei_vadaszok',
  'sim.civ.hegyi_banyaszok', 'sim.civ.folyami_kereskedok', 'sim.civ.bastyaorzok',
  'sim.civ.fenyhozok', 'sim.civ.sivatagi_portyazok',
];
export const CIV_LEIRAS_KULCS = [
  'sim.civ.leiras.kristalykovacsok', 'sim.civ.leiras.pusztai_lovasok',
  'sim.civ.leiras.erdei_vadaszok', 'sim.civ.leiras.hegyi_banyaszok',
  'sim.civ.leiras.folyami_kereskedok', 'sim.civ.leiras.bastyaorzok',
  'sim.civ.leiras.fenyhozok', 'sim.civ.leiras.sivatagi_portyazok',
];
/** Az egyedi egységek neve, `CIV.*` szerint. Lásd a fejléc utolsó figyelmeztetését. */
export const EGYEDI_KULCS = [
  'sim.egyedi.kristalykovacsok', 'sim.egyedi.pusztai_lovasok',
  'sim.egyedi.erdei_vadaszok', 'sim.egyedi.hegyi_banyaszok',
  'sim.egyedi.folyami_kereskedok', 'sim.egyedi.bastyaorzok',
  'sim.egyedi.fenyhozok', 'sim.egyedi.sivatagi_portyazok',
];
/** `CIV_NINCS` mellé — a sim `SEMLEGES` sorának „—" neve. */
export const EGYEDI_NINCS_KULCS = 'sim.egyedi.nincs';

export const NEHEZSEG_KULCS = [
  'sim.nehezseg.konnyu', 'sim.nehezseg.kozepes', 'sim.nehezseg.nehez',
];

export const VEG_OK_KULCS = [
  'sim.vegok.nincs', 'sim.vegok.kozpont', 'sim.vegok.feladas',
];

/**
 * A NYILVÁNTARTÁS — a szonda ebből dolgozik, nem a saját listájából.
 *
 * `enumTagok`: a sim enumja (ebből jön az elvárt hossz — ez az EGYETLEN
 * igazságforrás a hosszra). `simNev`: a mai magyar név-tábla, vagy `null`, ha a
 * simben nincs ilyen tábla (ma: `TIPUS` és az egyedi egységek).
 */
export const SIM_TABLAK = [
  { nev: 'NYERS_KULCS', kulcsok: NYERS_KULCS, enumNev: 'NYERS', enumTagok: NYERS, simNev: 'NYERS_NEV', simTabla: NYERS_NEV },
  { nev: 'KORSZAK_KULCS', kulcsok: KORSZAK_KULCS, enumNev: 'KORSZAK', enumTagok: KORSZAK, simNev: 'KORSZAK_NEV', simTabla: KORSZAK_NEV },
  { nev: 'KORSZAK_TARGY_KULCS', kulcsok: KORSZAK_TARGY_KULCS, enumNev: 'KORSZAK', enumTagok: KORSZAK, simNev: null, simTabla: null },
  { nev: 'KORSZAK_HELY_KULCS', kulcsok: KORSZAK_HELY_KULCS, enumNev: 'KORSZAK', enumTagok: KORSZAK, simNev: null, simTabla: null },
  { nev: 'ALAKZAT_KULCS', kulcsok: ALAKZAT_KULCS, enumNev: 'ALAKZAT', enumTagok: ALAKZAT, simNev: 'ALAKZAT_NEV', simTabla: ALAKZAT_NEV },
  { nev: 'ALLAS_KULCS', kulcsok: ALLAS_KULCS, enumNev: 'ALLAS', enumTagok: ALLAS, simNev: 'ALLAS_NEV', simTabla: ALLAS_NEV },
  { nev: 'TAMADAS_KULCS', kulcsok: TAMADAS_KULCS, enumNev: 'TAMADAS', enumTagok: TAMADAS, simNev: 'TAMADAS_NEV', simTabla: TAMADAS_NEV },
  { nev: 'PANCEL_KULCS', kulcsok: PANCEL_KULCS, enumNev: 'PANCEL', enumTagok: PANCEL, simNev: 'PANCEL_NEV', simTabla: PANCEL_NEV },
  { nev: 'EPULET_KULCS', kulcsok: EPULET_KULCS, enumNev: 'EPULET', enumTagok: EPULET, simNev: 'EPULET_NEV', simTabla: EPULET_NEV },
  { nev: 'TIPUS_KULCS', kulcsok: TIPUS_KULCS, enumNev: 'TIPUS', enumTagok: TIPUS, simNev: null, simTabla: null },
  { nev: 'TECH_KULCS', kulcsok: TECH_KULCS, enumNev: 'TECH', enumTagok: TECH, simNev: 'TECH_NEV', simTabla: TECH_NEV },
  { nev: 'TECH_LEIRAS_KULCS', kulcsok: TECH_LEIRAS_KULCS, enumNev: 'TECH', enumTagok: TECH, simNev: 'TECH_LEIRAS', simTabla: TECH_LEIRAS },
  { nev: 'TERKEP_KULCS', kulcsok: TERKEP_KULCS, enumNev: 'TERKEP', enumTagok: TERKEP, simNev: 'TERKEP_NEV', simTabla: TERKEP_NEV },
  { nev: 'TERKEP_LEIRAS_KULCS', kulcsok: TERKEP_LEIRAS_KULCS, enumNev: 'TERKEP', enumTagok: TERKEP, simNev: 'TERKEP_LEIRAS', simTabla: TERKEP_LEIRAS },
  { nev: 'CIV_KULCS', kulcsok: CIV_KULCS, enumNev: 'CIV', enumTagok: CIV, simNev: 'CIV_NEV', simTabla: CIV_NEV },
  { nev: 'CIV_LEIRAS_KULCS', kulcsok: CIV_LEIRAS_KULCS, enumNev: 'CIV', enumTagok: CIV, simNev: 'CIV_LEIRAS', simTabla: CIV_LEIRAS },
  { nev: 'EGYEDI_KULCS', kulcsok: EGYEDI_KULCS, enumNev: 'CIV', enumTagok: CIV, simNev: null, simTabla: null },
  { nev: 'NEHEZSEG_KULCS', kulcsok: NEHEZSEG_KULCS, enumNev: 'NEHEZSEG', enumTagok: NEHEZSEG, simNev: 'NEHEZSEG_NEV', simTabla: NEHEZSEG_NEV },
  { nev: 'VEG_OK_KULCS', kulcsok: VEG_OK_KULCS, enumNev: 'VEG_OK', enumTagok: VEG_OK, simNev: 'VEG_OK_NEV', simTabla: VEG_OK_NEV },
];

/** Kulcsnak látszik-e? (`sim.alakzat.ek` igen, „négyzet" nem.) */
function _kulcsAlaku(s) {
  return typeof s === 'string' && /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/.test(s);
}

/**
 * A HÍD ELLENŐRZÉSE. Három dolgot néz, és mindhárom egy-egy konkrét hibából van:
 *
 *   1. HOSSZ — minden kulcs-tábla pontosan olyan hosszú, mint a saját enumja.
 *      Egy rövid tábla `undefined` kulcsot ad `sz()`-nek, abból «undefined»
 *      felirat lesz a képernyőn. (`KIADAS_ELVARASOK.md` G) szakasz.)
 *   2. FELOLDHATÓSÁG — minden kulcs megvan MINDKÉT szótárban.
 *   3. HŰSÉG — a magyar felirat betűre az, ami MA a sim-táblában áll. Ez fogja
 *      meg azt, amikor valaki a sim szövegét javítja, és a szótár ottmarad a
 *      régin: onnantól két magyar szöveg lenne, és a képernyőre a régi kerülne.
 *      Ha a sim-tábla eleme már KULCS (az átállás után), a 3. pont a 2.-ra vált.
 *
 * ⚠️ Felülírható bemenettel, hogy a szonda SZABOTÁZZSAL is meghívhassa — ez a
 * `panel_technologia_adat.js` `tablakEllenorzes()`-ének mintája. Egy ellenőrzés,
 * amit sosem próbáltak ki hibás bemeneten, maga is hiba.
 *
 * @param {{tablak?:Array, hu?:object, en?:object}} [be]
 * @returns {string[]} a hibák; ÜRES tömb = rendben
 */
export function tablakEllenorzes(be) {
  const b = be || {};
  const tablak = b.tablak || SIM_TABLAK;
  const hu = b.hu || HU;
  const en = b.en || EN;
  const hibak = [];

  for (const t of tablak) {
    const vart = Object.keys(t.enumTagok).length;
    if (t.kulcsok.length !== vart) {
      hibak.push(t.nev + ' hossza ' + t.kulcsok.length + ', a(z) ' + t.enumNev
        + ' enum viszont ' + vart + ' tagú');
    }
    for (let i = 0; i < t.kulcsok.length; i++) {
      const k = t.kulcsok[i];
      if (typeof k !== 'string' || !k) {
        hibak.push(t.nev + '[' + i + '] nem kulcs: ' + String(k));
        continue;
      }
      if (hu[k] === undefined) hibak.push(t.nev + '[' + i + '] → a magyar szótárban nincs `' + k + '`');
      if (en[k] === undefined) hibak.push(t.nev + '[' + i + '] → az angol szótárban nincs `' + k + '`');
    }
    if (!t.simTabla) continue;

    for (let i = 0; i < t.kulcsok.length && i < t.simTabla.length; i++) {
      const simSzoveg = t.simTabla[i];
      const k = t.kulcsok[i];
      // ⚠️ Az ÜRES sim-sor kivétel, és pontosan egy ilyen van: a
      // `VEG_OK_NEV[VEG_OK.NINCS]` (a meccs még megy, nincs mit kiírni). A
      // szótár ide is ad feliratot („—"), mert az üres felirat maga a néma hiba.
      if (simSzoveg === '') continue;
      if (_kulcsAlaku(simSzoveg)) {
        // A sim MÁR kulcsot ad — az átállás megtörtént ezen a táblán.
        if (hu[simSzoveg] === undefined || en[simSzoveg] === undefined) {
          hibak.push(t.simNev + '[' + i + '] kulcsot ad (`' + simSzoveg
            + '`), de az nincs meg mindkét szótárban');
        }
        continue;
      }
      if (hu[k] !== simSzoveg) {
        hibak.push(t.simNev + '[' + i + '] = „' + simSzoveg + '", a szótár `' + k
          + '` értéke viszont „' + String(hu[k]) + '" — a fordítás elsodródott a forrástól');
      }
    }
  }
  return hibak;
}

// A modul betöltésekor FUT ÉS DOB. A kulcs-táblák a UI-ban is ugyanolyan néma
// hibaforrások, mint a sim ár-táblái: ha ez itt csak figyelmeztetne, a rossz
// tábla átcsúszna a képernyőre. A hívók (panelek) nem tudnak mit kezdeni vele,
// tehát a betöltésnél kell eldőlnie.
const _indulasiHibak = tablakEllenorzes();
if (_indulasiHibak.length) {
  throw new Error('szoveg_sim: hibás kulcs-tábla —\n  ' + _indulasiHibak.join('\n  '));
}
