// AGE OF THE CRYSTALS — EGYSÉG-MOZDULATOK (a figurák „viselkedése").
//
// A `units3d.js` a MOTOR: mátrixokat ír, LOD-ol, gyorstáraz. Ez a modul a
// KOREOGRÁFIA: megmondja, milyen SZÖGEKBEN álljanak a végtagok egy adott
// pillanatban. A kettő szétvágásának oka gyakorlati: a `units3d.js` fejléce
// már így is a projekt leghosszabb magyarázata, a mozdulatok pedig
// tapasztalati számok tucatjai — ha egy fájlban lennének, a mátrix-matek és a
// „mennyire hajoljon a paraszt aratás közben" kérdés összeérne.
//
// ── A MÉRCE: A TELEPESEK ──────────────────────────────────────────────────
// A tulajdonos ítélete a v0.10-ről: „a TELEPESEK grafikájától fényévekre
// van". A TELEPESEK-ben nem a poligonszám a különbség, hanem hogy a figura
// CSINÁL valamit: gyalogol, cipel, megáll dolgozni. Ez a modul pontosan azt a
// négy dolgot adja hozzá, amitől egy stratégiai játék él:
//
//   1. JÁRÁS-CIKLUS      — térd-pótlékkal, váll-csavarral, fej-bólintással
//   2. MUNKA-MOZDULAT    — fejszézés / bányászás / aratás, KÜLÖN mozdulat
//   3. CIPELÉS           — a rakomány a kézben, a szerszám elpakolva
//   4. HARC ÉS HALÁL     — csapás, találat-visszarúgás, eldőlés, süllyedés
//
// ── MIÉRT „PÓZ-OBJEKTUM", ÉS MIÉRT PONT EGY ───────────────────────────────
// A kézenfekvő felület az volna, hogy minden mozdulat VISSZAAD egy pózt. Az
// 1600 egység × 60 kép/mp = 96 000 objektum másodpercenként, azaz garantált
// GC-tüske — a projekt kemény szabálya viszont NULLA per-frame allokáció.
// Ezért a hívó EGYETLEN, előre foglalt `Poz` objektumot tart, és minden
// mozdulat ABBA ír. A modul így is tesztelhető és önmagában olvasható marad,
// de nem szemetel.
//
// ⚠️ A pózok ÖSSZEADÓDNAK, és a sorrend nem mindegy. A `talalat` (visszarúgás)
// szándékosan ADDITÍV: rá kell tudnia ülni a járásra és a munkára is. Ezért őt
// MINDIG utoljára kell hívni, `alapPoz()` nélkül.
//
// ── A FÁZIS A SIM ÓRÁJÁBÓL JÖN, ÉS SOSEM KERÜL VISSZA A SIMBE ─────────────
// Minden itteni fázis bemenete `ido = (tick + alfa) · DT` és egy egységenkénti
// állandó eltolás. Két következménye van:
//   • a járás nem gyorsul be, ha a képkocka-sebesség ingadozik;
//   • NINCS render-oldali animációs állapotgép, amit deszinkronizálni lehetne
//     — a v0.8 lockstepjében a két kliens képernyője nem térhet el attól, amit
//     a szimuláció mond.
// A KIVÉTEL a három ESEMÉNY-bélyeg (csapás, találat, halál): azok render-oldali
// időbélyegek, mert a sim nem tart „mikor ütött utoljára" mezőt. Ezek sem
// kerülnek vissza a simbe — a render sosem ír oda.
//
// ── AMI ITT TILOS ─────────────────────────────────────────────────────────
//   • allokálni (a hívó képkockánként 1600-szor fut le rajtunk)
//   • `Math.sin/cos` — a `szin()/kosz()` táblát használd (lásd lent)
//   • bármit a simbe írni

import {
  KAR_ALAP_BAL, KAR_ALAP_JOBB,
} from './egyseg_figurak.js';

const TAU = Math.PI * 2;

// ── GYORS SZINUSZ-TÁBLA ────────────────────────────────────────────────────
//
// ITT LAKIK, ÉS A `units3d.js` INNEN VESZI. Korábban a `units3d.js` saját
// táblát tartott; a mozdulatok kiköltözésével kettő lett volna belőle
// (2 × 16 KB és két külön felbontás), és az ilyen duplikátumból lesz az a
// hibafajta, ahol a járás fázisa fél fokkal máshol van, mint a törzs dőlése.
//
// MIÉRT TÁBLA EGYÁLTALÁN: egységenként ~14 trigonometrikus hívás kell (irány,
// két láb, két kar, fej, mocorgás, munka-ciklus). 1600 egységnél ez
// képkockánként ~22 000 `Math.sin/cos` — mérhető nagyságrend egy gyenge gépen.
// A 4096 osztás = 0,0015 rad = 0,09°: egy 1 egység magas figura szélén ez
// 1,5 ezred egység eltérés, vagyis LÁTHATATLAN.
//
// MELLÉKHASZON: a kvantálás STABILIZÁLJA a `units3d.js` dirty-gyorstárát is,
// mert az apró numerikus zaj nem billenti ki az álló figurákat.
const SZIN_BIT = 12;
const SZIN_DB = 1 << SZIN_BIT;             // 4096
const SZIN_MASZK = SZIN_DB - 1;
const SZIN_SKALA = SZIN_DB / TAU;
const SZIN_TAB = new Float32Array(SZIN_DB);
for (let i = 0; i < SZIN_DB; i++) SZIN_TAB[i] = Math.sin(i / SZIN_SKALA);

/**
 * Szinusz táblából. Negatív szögre is helyes: a `|0` nulla felé csonkol, a
 * `& MASZK` pedig kettes komplemensben körbeforgat.
 * ⚠️ |a| < 100 000 rad legyen (a hívó modulózza a hosszú fázisokat).
 */
export function szin(a) { return SZIN_TAB[((a * SZIN_SKALA) | 0) & SZIN_MASZK]; }
/** Koszinusz ugyanabból a táblából (negyed periódus eltolás). */
export function kosz(a) { return SZIN_TAB[(((a * SZIN_SKALA) | 0) + (SZIN_DB >> 2)) & SZIN_MASZK]; }

/** Simító görbe (smoothstep) — lendületes indulás és megállás. */
function simit(t) { return t * t * (3 - 2 * t); }

// ── GEOMETRIAI KÖTÉSEK ─────────────────────────────────────────────────────

/**
 * Csípő → talp távolság.
 *
 * ⚠️ EZ A SZÁM A `units3d.js` `epitLab()` GEOMETRIÁJÁBÓL JÖN (a talp
 * pontosan ennyivel van a csípő-ízület alatt), és a járás FÜGGŐLEGES
 * KIEGYENLÍTÉSE számol vele. Azért ITT áll és nem ott, mert a kiegyenlítést
 * ez a modul végzi — két helyen tartva előbb-utóbb két KÜLÖNBÖZŐ 0,42 lenne
 * belőle, és a figura lépésenként ki-be süllyedne a földbe.
 */
export const LAB_HOSSZ = 0.42;

// ── A PÓZ ──────────────────────────────────────────────────────────────────

/**
 * Egy figura teljes testtartása EGY képkockán. A hívó EGYETLEN példányt tart
 * belőle és képkockánként 1600-szor felülírja — lásd a fejlécet.
 *
 * Szögek radiánban, az X tengely körül (a végtagok előre-hátra lengenek):
 * NEGATÍV = előre, POZITÍV = hátra. A `fejSzog` pozitívja LEFELÉ néz.
 */
export function ujPoz() {
  return {
    /** Comb-szögek külön — a munka-mozdulatokhoz terpesz kell, nem ellenfázis. */
    labBal: 0, labJobb: 0,
    /**
     * Láb-HOSSZ szorzó. A figurának nincs térde (az két új rajzhívás volna);
     * a lendülő láb MEGRÖVIDÜL, és ettől a talp elemelkedik a földtől. Ez a
     * legolcsóbb létező térd-pótlék: a `reszMatrix` amúgy is kap skálát.
     */
    labSkalaBal: 1, labSkalaJobb: 1,
    karBal: 0, karJobb: 0,
    /** Fej-bólintás. Pozitív = lenéz (a munkás a szerszámát nézi). */
    fejSzog: 0,
    /** Függőleges eltolás (bukkanás, guggolás). */
    bukkan: 0,
    /** Törzs-dőlés előre (pozitív) / hátra (negatív). */
    doles: 0,
    /** Törzs-billenés oldalra. */
    dol: 0,
    /** Nézésirány-korrekció (váll-csavar, körülnézés). */
    iranyPlusz: 0,
    /** Oldalirányú kitérés (merőlegesen a nézésirányra). */
    oldal: 0,
    /** Előre-hátra kitérés a nézésirányban (kitörés, visszarúgás). */
    elore: 0,
    /** 1 = a rakomány látszik a kezében. */
    rakomany: 0,
    /** 0 = a szerszám/fegyver el van pakolva (cipelés közben). */
    fegyver: 1,
    /** Halál: süllyedés a terep alá (világegység, pozitív = lefelé). */
    sullyed: 0,
    /** 1 = a póz képkockánként változik (a dirty-gyorstár ezt olvassa). */
    anim: 0,
  };
}

/** Alaphelyzet: a típus nyugalmi tartása. MINDEN mező visszaáll. */
export function alapPoz(poz, mj) {
  poz.labBal = 0; poz.labJobb = 0;
  poz.labSkalaBal = 1; poz.labSkalaJobb = 1;
  poz.karBal = KAR_ALAP_BAL[mj]; poz.karJobb = KAR_ALAP_JOBB[mj];
  poz.fejSzog = 0;
  poz.bukkan = 0; poz.doles = 0; poz.dol = 0;
  poz.iranyPlusz = 0; poz.oldal = 0; poz.elore = 0;
  poz.rakomany = 0; poz.fegyver = 1; poz.sullyed = 0;
  poz.anim = 0;
}

// ── MOZDULAT-KÓDOK ─────────────────────────────────────────────────────────
//
// ⚠️ EZ NEM DÍSZ: a `units3d.js` dirty-gyorstára EZT tárolja. Ha csak a
// „változik-e képkockánként" jelzőt tárolná, egy ÁLLÓ, de MÁS pózba váltó
// figura (pl. leteszi a rakományt és megáll) BENNRAGADNA a régi pózban —
// mindkét állapot `anim = 0`, a pozíciója sem változott, tehát a gyorstár
// eltalálna. Mérve nem lett belőle hiba, mert ez a kód sosem futott hibás
// gyorstárral: a mód-kód az ELSŐ változattól benne van, pont ezért.
export const MOZ = {
  REJTVE: 0,
  ALL: 1,
  TETLEN: 2,
  JAR: 3,
  CIPEL_ALL: 4,
  CIPEL_JAR: 5,
  FEJSZE: 6,
  BANYASZ: 7,
  ARAT: 8,
  HARC_KESZ: 9,
  CSAPAS: 10,
  LOVES: 11,
  HALAL: 12,
};

/**
 * NYERSANYAG → MUNKA-MOZDULAT. A `NYERS` (`sim/eroforras.js`) indexeli:
 * `ETEL=0 FA=1 KO=2 KRISTALY=3`.
 *
 * ⚠️ NÉGY HOSSZÚ, ÉS AZ MARADJON. Ez ugyanaz a tábla-hossz csapda, amiből ez a
 * projekt már ötöt látott (`LATOTAV`, `FIGURA`, `TIPUS_KEVER`): egy rövid
 * tábla `undefined`-ot ad, a `MOZ`-ra kapcsoló `switch` pedig NÉMÁN az `ALL`
 * ágra esne — a kristálybányász mozdulatlanul állna a lelőhelyen, és semmi nem
 * szólna érte. A `_ellenoriz()` a fájl végén ezt betöltéskor leméri.
 */
export const MUNKA_MOZ = [
  MOZ.ARAT,      // 0 ÉTEL     — lehajol, oldalra söpör
  MOZ.FEJSZE,    // 1 FA       — nagy ívű, lassú csapás felülről
  MOZ.BANYASZ,   // 2 KŐ       — rövid, gyors ütések, görnyedten
  MOZ.BANYASZ,   // 3 KRISTÁLY — ugyanaz a mozdulat, más a rakomány színe
];

/**
 * A munka-ciklus üteme (teljes mozdulat / mp), `MOZ`-kóddal indexelve.
 * ⚠️ SŰRŰ TÖMB, `MOZ`-hosszúságú — nem `{[MOZ.FEJSZE]: …}` objektum. Egy ritka
 * kulcsú objektum a képkocka-hurokban szótár-keresés, a rövid tömb pedig
 * `undefined`-ot adna, amiből `NaN` fázis lenne: a figura EGY pózban fagyna be.
 */
const MOZ_DB = 13;
const MUNKA_UTEM = new Float32Array(MOZ_DB);
MUNKA_UTEM[MOZ.FEJSZE] = 0.78;
MUNKA_UTEM[MOZ.BANYASZ] = 1.45;
MUNKA_UTEM[MOZ.ARAT] = 0.62;

// ── ÁLLANDÓK ───────────────────────────────────────────────────────────────

/** A járás-lengés amplitúdója (rad). */
const LAB_LENGES = 0.62;
const KAR_LENGES = 0.44;
/** Mennyivel rövidül a lendülő láb (térd-pótlék). 0,14 × 0,42 ≈ 6 cm talp-emelés. */
const TERD_ROVIDULES = 0.14;
/** Váll-csavar: a felsőtest ellentétesen fordul a csípővel. */
const VALL_CSAVAR = 0.075;

/** Cipelés: a két kar előre, a rakomány alá. */
const CIPEL_KAR = -1.28;

/** Tétlen mocorgás: ennyi időnként (mp), ennyi ideig (mp). */
export const MOC_KOZ_MIN = 5.5, MOC_KOZ_MAX = 14.5;
export const MOC_HOSSZ_MIN = 0.9, MOC_HOSSZ_MAX = 2.0;

/** Egy csapás/lövés mozdulatának hossza (mp). */
export const CSAPAS_IDO = 0.34;
export const LOVES_IDO = 0.46;
/** A találat-visszarúgás hossza (mp). */
export const TALALAT_IDO = 0.24;

/**
 * A HALÁL teljes hossza (mp), és a két belső határ (a teljes hossz arányában).
 *
 * ⚠️ EZ A RÉTEG EGYETLEN OLYAN ÁLLANDÓJA, AMI PÉLDÁNYSZÁMOT NÖVEL. A halott
 * egység a v0.10-ig AZONNAL eltűnt (`elo === 0` → rejtve); most `HALAL_IDO`
 * másodpercig tovább rajzolódik. Egy nagy csata pillanatában ez annyi EXTRA
 * figurát jelent, ahányan az elmúlt 2,4 mp-ben meghaltak. Ezért van itt egy
 * szám és nem „amíg szép": ha a mérés szűkösnek találja, EZT kell csökkenteni,
 * nem a mozdulatot elvenni.
 */
export const HALAL_IDO = 2.4;
/** Eddig tart az eldőlés (a teljes hossz arányában). */
const HALAL_DOL_VEG = 0.30;
/** Innentől süllyed a test a terep alá. */
const HALAL_SULLYED_KEZD = 0.62;
/** Mennyit süllyed összesen (világegység) — a fekvő test vastagságánál több. */
const HALAL_SULLYED = 0.62;

// ── MOZDULATOK ─────────────────────────────────────────────────────────────

/**
 * JÁRÁS. A fázist a hívó a MEGTETT ÚTBÓL számolja (`ido · |v| · π / lépéshossz`),
 * nem az órából — így a talp nem csúszik meg a földön, bármilyen gyors a típus.
 *
 * Négy réteg rakódik egymásra, és mindegyik külön okból van:
 *   1. LÁB-LENGÉS ellenfázisban        — ez maga a lépés
 *   2. TÉRD-PÓTLÉK (láb-rövidülés)     — enélkül a talp SÚROLJA a földet, és a
 *                                        figura „csúszva" halad, nem gyalogol
 *   3. FÜGGŐLEGES KIEGYENLÍTÉS         — szétvetett lábbal a csípő KÖZELEBB van
 *                                        a talajhoz; enélkül a figura minden
 *                                        lépésnél kiemelkedne a földből
 *   4. VÁLL-CSAVAR + FEJ-BÓLINTÁS      — ettől lesz élő teste, nem merev bábu
 */
export function pozJaras(poz, faz, mj) {
  const sp = szin(faz);
  const cp = kosz(faz);
  const sp2 = szin(faz * 0.5);

  poz.labJobb = sp * LAB_LENGES;
  poz.labBal = -sp * LAB_LENGES;
  // A lendülő láb az, amelyiknek a szöge ÉPP CSÖKKEN (előrefelé halad) — az a
  // `cos` előjeléből olvasható ki. A talp így a lépés közepén emelkedik a
  // legjobban, pont amikor a földet súrolná.
  poz.labSkalaJobb = 1 - TERD_ROVIDULES * (cp < 0 ? -cp : 0);
  poz.labSkalaBal = 1 - TERD_ROVIDULES * (cp > 0 ? cp : 0);

  poz.karJobb = KAR_ALAP_JOBB[mj] - sp * KAR_LENGES;
  poz.karBal = KAR_ALAP_BAL[mj] + sp * KAR_LENGES;

  // A szorzó szándékosan kicsit kevesebb a `LAB_HOSSZ`-nál: a maradék néhány
  // milliméteres játék adja a járás rugalmasságát.
  poz.bukkan = -LAB_HOSSZ * 0.95 * (1 - kosz(sp * LAB_LENGES));
  poz.dol = sp2 * 0.075;
  poz.doles = 0.055;
  poz.iranyPlusz = -sp * VALL_CSAVAR;
  poz.fejSzog = -sp2 * 0.05;
  poz.anim = 1;
}

/**
 * CIPELÉS — a `pozJaras()` UTÁN hívandó, mert csak a felsőtestet írja felül.
 *
 * A TELEPESEK egyik legjobb részlete, hogy LÁTSZIK, mit visz a hordár. Két
 * dolog kell hozzá, és a második legalább olyan fontos:
 *   • a rakomány a kezében legyen (`poz.rakomany`),
 *   • a SZERSZÁM tűnjön el (`poz.fegyver = 0`). Enélkül a paraszt a mellkasa
 *     előtt tartott láda MÖGÜL még kiállna a csákánnyal — a csákány ugyanis a
 *     JOBB VÁLL ízületére van szerelve, tehát együtt fordul az előrenyújtott
 *     karral, és vízszintesen döfne előre.
 *
 * @param {number} jarSuly 1 = megy (a kar még leng kicsit), 0 = áll
 */
export function pozCipel(poz, jarSuly, sp) {
  const leng = jarSuly ? sp * 0.09 : 0;
  poz.karJobb = CIPEL_KAR - leng;
  poz.karBal = CIPEL_KAR + leng;
  // A súly hátradönti — és ettől olvasható messziről is, hogy megrakodva megy.
  poz.doles -= 0.075;
  poz.rakomany = 1;
  poz.fegyver = 0;
  poz.anim = 1;
}

/**
 * MUNKA-MOZDULAT: fejszézés, bányászás vagy aratás.
 *
 * ── MIÉRT HÁROM MOZDULAT ÉS NEM EGY „dolgozik" ────────────────────────────
 * Egy RTS-ben felülről és messziről nézünk. Ilyenkor a SZILUETT az egyetlen
 * jel: a felemelt karú, kiegyenesedett figura (fejsze) és a mélyen előrehajolt
 * figura (aratás) 10 képpont magasan is elválik egymástól. Ugyanaz a mozdulat
 * három nyersanyagra viszont annyit mondana, hogy „valamit csinál" — a
 * TELEPESEK-ben pont ez a különbség adja, hogy egy pillantásból látszik, hol
 * megy a fakitermelés és hol az aratás.
 *
 * A szerszám nem külön kezelendő: a csákány a JOBB VÁLL ízületére van szerelve,
 * tehát a kar mozdulatát MAGÁTÓL követi.
 *
 * @param {number} moz `MOZ.FEJSZE|BANYASZ|ARAT`
 * @param {number} u   ciklus-pozíció [0,1)
 */
export function pozMunka(poz, moz, u, mj) {
  if (moz === MOZ.ARAT) {
    // ARATÁS — mélyen előrehajolva, oldalra söprő karokkal. A törzs BILLEN is,
    // nemcsak a kar mozog: enélkül a figura derékból merev marad.
    const s = szin(u * TAU);
    const c = kosz(u * TAU);
    poz.doles = 0.52 + 0.06 * c;
    poz.dol = s * 0.20;
    poz.karBal = -1.42 + s * 0.42;
    poz.karJobb = -1.52 - s * 0.42;
    poz.bukkan = -0.11;
    poz.labBal = -0.16; poz.labJobb = 0.14;
    poz.fejSzog = 0.28;
    poz.anim = 1;
    return;
  }

  // FEJSZE és BÁNYÁSZ ugyanaz a három ütem — más amplitúdóval és tartással.
  const banya = moz === MOZ.BANYASZ;
  const emelVeg = banya ? -1.75 : -2.50;   // a kar hátsó holtpontja
  const utesVeg = banya ? 0.25 : 0.55;     // a csapás alsó holtpontja
  const nyugalom = banya ? -0.45 : -0.35;

  let k, csap;
  if (u < 0.52) {
    // 1. EMELÉS — lassuló, mert a szerszám súlya megfogja a mozdulat végén.
    k = nyugalom + (emelVeg - nyugalom) * simit(u / 0.52);
    csap = 0;
  } else if (u < 0.70) {
    // 2. CSAPÁS — gyorsuló (`w²`), ez adja a lendület érzetét.
    const w = (u - 0.52) / 0.18;
    const w2 = w * w;
    k = emelVeg + (utesVeg - emelVeg) * w2;
    csap = w2;
  } else {
    // 3. VISSZAHÚZÁS — egyenletes, a becsapódás utáni ellazulás.
    const w = (u - 0.70) / 0.30;
    k = utesVeg + (nyugalom - utesVeg) * w;
    csap = 1 - w;
  }

  poz.karJobb = k;
  // A bal kar kísér: így két kézre fogottnak látszik a szerszám.
  poz.karBal = k * 0.85 + 0.10;
  poz.doles = (banya ? 0.30 : 0.08) + (banya ? 0.16 : 0.28) * csap;
  poz.bukkan = (banya ? -0.07 : 0) - 0.05 * csap;
  poz.labBal = banya ? -0.28 : -0.20;
  poz.labJobb = (banya ? 0.22 : 0.15) + 0.06 * csap;
  poz.fejSzog = banya ? 0.34 : 0.20;
  poz.anim = 1;
}

/** A munka-ciklus fázisa [0,1) — a sim órájából, egységenként eltolva. */
export function munkaFazis(moz, ido, faz0) {
  const u = (ido * MUNKA_UTEM[moz] + faz0) % 1;
  return u < 0 ? u + 1 : u;
}

/**
 * HARCI KÉSZENLÉT — a két csapás KÖZTI állapot.
 *
 * A v0.10-ig a `HARCOL` állapot egyetlen, szabadon futó szinusszal lengette a
 * kart. Az eredmény az volt, hogy a katona akkor is „csapkodott", amikor épp
 * nem ütött (a `utemHatra` 12-25 tick), és a tényleges csapás pillanata SEMMIT
 * nem jelentett a képernyőn. Most a valódi csapás külön mozdulat
 * (`pozCsapas`), és ez itt csak a fedezékbe húzott, lélegző alaptartás.
 */
export function pozHarcKesz(poz, ido, faz0, mj) {
  const s = szin(ido * 1.8 + faz0);
  poz.karJobb = KAR_ALAP_JOBB[mj] - 0.30 + s * 0.05;
  poz.karBal = KAR_ALAP_BAL[mj] - 0.18 - s * 0.04;
  poz.doles = 0.10;
  poz.labBal = -0.16; poz.labJobb = 0.13;
  poz.bukkan = -0.03 + s * 0.008;
  poz.anim = 1;
}

/**
 * CSAPÁS (közelharc) — hátralendülés, gyors lecsapás, ellazulás.
 * @param {number} u a csapás óta eltelt idő aránya [0,1)
 */
export function pozCsapas(poz, u, mj) {
  const alap = KAR_ALAP_JOBB[mj];
  let k, csap;
  if (u < 0.32) {
    k = alap + (-2.30 - alap) * simit(u / 0.32);
    csap = 0;
  } else if (u < 0.52) {
    const w = (u - 0.32) / 0.20;
    const w2 = w * w;
    k = -2.30 + 2.95 * w2;
    csap = w2;
  } else {
    const w = (u - 0.52) / 0.48;
    k = 0.65 + (alap - 0.65) * w;
    csap = 1 - w;
  }
  poz.karJobb = k;
  poz.karBal = KAR_ALAP_BAL[mj] - 0.20 * csap;
  poz.doles = 0.06 + 0.30 * csap;
  // KITÖRÉS: a csapás mögé odaviszi a testsúlyát. Néhány centi, de ettől lesz
  // ereje a mozdulatnak — enélkül a katona „legyint".
  poz.elore = 0.10 * csap;
  poz.labBal = -0.22 * csap;
  poz.labJobb = 0.14 * csap;
  poz.fejSzog = 0.12 * csap;
  poz.anim = 1;
}

/**
 * LÖVÉS (íjász) — húzás, majd ELPATTANÓ elengedés.
 *
 * Az íj a JOBB váll ízületén ül, tehát a jobb kar az ÍJTARTÓ kar: az végig
 * kinyújtva marad. A BAL kar húzza az ideget az arcához, és az elengedés
 * PILLANATSZERŰ — szándékosan nincs simítás a 0,58-as határnál, mert a valódi
 * elengedés is így néz ki, és ez az egyetlen jel, amiből messziről látszik,
 * hogy KILŐTT.
 */
export function pozLoves(poz, u, mj) {
  poz.karJobb = -1.42;
  if (u < 0.58) {
    poz.karBal = -1.35 + 0.72 * simit(u / 0.58);
    poz.doles = -0.02;
  } else {
    const w = (u - 0.58) / 0.42;
    poz.karBal = -1.45 + (KAR_ALAP_BAL[mj] + 1.45) * w;
    poz.doles = -0.05 + 0.05 * w;
  }
  poz.labBal = -0.10; poz.labJobb = 0.10;
  poz.anim = 1;
}

/**
 * TALÁLAT-VISSZARÚGÁS — ADDITÍV, tehát MINDIG utoljára hívandó.
 *
 * A burkoló `sin(π·u)`: nulláról indul és nullára ér vissza, tehát bármire
 * ráülhet (járásra, munkára, harcra) anélkül, hogy ugrást vagy elsodródást
 * okozna. Ez ugyanaz a szabály, mint a tétlen mocorgásnál — és pont ezért nem
 * kell külön „vissza-interpolálni" semmit.
 */
export function pozTalalat(poz, u) {
  const b = szin(u * Math.PI);
  poz.doles -= 0.34 * b;
  poz.elore -= 0.11 * b;
  poz.fejSzog -= 0.30 * b;
  poz.karBal += 0.28 * b;
  poz.karJobb += 0.22 * b;
  poz.bukkan -= 0.03 * b;
  poz.anim = 1;
}

/**
 * HALÁL — eldőlés, fekvés, majd süllyedés a terep alá.
 *
 * ── MIÉRT NEM ELHALVÁNYODIK ───────────────────────────────────────────────
 * Az áttetszőség példányonkénti alfát kívánna; a réteg anyaga `MeshLambert`
 * `vertexColors`-szal, és az `instanceColor` HÁROM komponens — negyediket
 * hozzávenni új attribútum és új shader-változat volna, plusz az átlátszó
 * figurákat rendezni is kellene mélység szerint. A SÜLLYEDÉS ugyanazt a
 * célt éri el (a test folytonosan tűnik el, nem pattan ki a képből) EGYETLEN
 * mátrix-elem árán, és a terep magától kivágja.
 *
 * A dőlés pozitív iránya ELŐRE visz (arccal a földnek); az `oldalra` (±1) egy
 * kis oldalirányú összetevőt ad, hogy egy lekaszabolt sor ne EGYFORMÁN dőljön.
 */
export function pozHalal(poz, u, oldalra, mj) {
  const d = u < HALAL_DOL_VEG ? u / HALAL_DOL_VEG : 1;
  // Gyorsuló zuhanás, a végén apró megállapodás („koppanás") — a lineáris
  // dőlés bábuszerű, ez az egy `sin`-púp teszi súlyossá.
  let f;
  if (d < 0.82) { const w = d / 0.82; f = w * w; }
  else { const w = (d - 0.82) / 0.18; f = 1 + 0.07 * szin(w * Math.PI); }

  poz.doles = 1.52 * f;
  poz.dol = oldalra * 0.34 * f;
  poz.bukkan = -0.06 * f;
  // A végtagok elernyednek: a kar előrenyúlik, a láb enyhén szétnyílik.
  poz.karBal = KAR_ALAP_BAL[mj] * (1 - f) - 0.25 * f;
  poz.karJobb = KAR_ALAP_JOBB[mj] * (1 - f) - 0.18 * f;
  poz.labBal = -0.14 * f;
  poz.labJobb = 0.18 * f;
  poz.fejSzog = 0.22 * f;
  poz.fegyver = 1;
  poz.rakomany = 0;

  if (u > HALAL_SULLYED_KEZD) {
    const w = (u - HALAL_SULLYED_KEZD) / (1 - HALAL_SULLYED_KEZD);
    poz.sullyed = HALAL_SULLYED * w * w;   // gyorsuló, hogy a vége ne lebegjen
  }
  poz.anim = 1;
}

/**
 * TÉTLEN ÉLET — ritka, egységenként eltolt mocorgás.
 *
 * Az álló egység sem szobor: 5,5–14,5 másodpercenként 1–2 másodpercre
 * körülnéz, súlypontot vált, vagy lép egyet oldalra és vissza. A burkoló
 * `sin(π·s)`, tehát a mozdulat NULLÁRÓL indul és NULLÁRA ér vissza: nincs
 * ugrás és nincs elsodródás. A KÖLTSÉG azért kicsi, mert szakaszos: egy
 * időpillanatban az álló egységeknek csak ~10-15%-a esik ki a dirty-gyorstárból.
 *
 * @returns {boolean} igaz, ha épp mocorog (a hívó ebből tudja a mód-kódot)
 */
export function pozTetlen(poz, ido, mocFaz, mocPer, mocHossz, mocTip) {
  const fp = (ido + mocFaz) % mocPer;
  if (fp >= mocHossz) return false;
  const s = fp / mocHossz;
  const burkolo = szin(s * Math.PI);
  const sw = szin(s * TAU);
  if (mocTip === 0) {
    // KÖRÜLNÉZ
    poz.iranyPlusz = sw * 0.42 * burkolo;
    poz.doles = 0.02 * burkolo;
    poz.fejSzog = -sw * 0.10 * burkolo;
  } else if (mocTip === 1) {
    // SÚLYPONT-ÁTHELYEZÉS
    poz.dol = sw * 0.12 * burkolo;
    poz.bukkan = -0.020 * burkolo;
    poz.oldal = sw * 0.05 * burkolo;
    poz.labBal = sw * 0.10 * burkolo;
    poz.labJobb = -sw * 0.10 * burkolo;
    poz.karJobb += -0.10 * sw * burkolo;
    poz.karBal += 0.10 * sw * burkolo;
  } else {
    // LÉP EGYET OLDALRA (és vissza)
    poz.oldal = sw * 0.22 * burkolo;
    poz.labBal = sw * 0.40 * burkolo;
    poz.labJobb = -sw * 0.40 * burkolo;
    poz.dol = sw * 0.05 * burkolo;
    poz.karJobb += -sw * 0.13 * burkolo;
    poz.karBal += sw * 0.13 * burkolo;
  }
  poz.anim = 1;
  return true;
}

// ── ÖNELLENŐRZÉS (BETÖLTÉSKOR) ─────────────────────────────────────────────
//
// Ugyanaz a minta, mint az `egyseg_figurak.js`-ben, ugyanabból az okból: itt
// nincs futásidejű bemenet, tehát ha egyszer dob, akkor MINDIG dob,
// mindenkinél, az első másodpercben — nem lehet „csak néha" hiba belőle.
function _ellenoriz() {
  const bajok = [];
  // A `NYERS` négy értéke: ÉTEL, FA, KŐ, KRISTÁLY. Nem importáljuk (a render
  // ne függjön a sim modul-gráfjától), de a hosszat kötelezővé tesszük.
  if (MUNKA_MOZ.length !== 4) {
    bajok.push('MUNKA_MOZ hossza ' + MUNKA_MOZ.length + ', a NYERS négy fajtát ad');
  }
  for (let i = 0; i < MUNKA_MOZ.length; i++) {
    const m = MUNKA_MOZ[i];
    if (m !== MOZ.FEJSZE && m !== MOZ.BANYASZ && m !== MOZ.ARAT) {
      bajok.push('MUNKA_MOZ[' + i + '] = ' + m + ' — nem munka-mozdulat');
    }
    if (!(MUNKA_UTEM[m] > 0)) bajok.push('MUNKA_UTEM[' + m + '] hiányzik vagy nulla');
  }
  // A `MOZ` legnagyobb kódja férjen bele az ütem-tömbbe.
  for (const nev in MOZ) {
    if (MOZ[nev] >= MOZ_DB) bajok.push('MOZ.' + nev + ' túllóg a MOZ_DB-n (' + MOZ_DB + ')');
  }
  if (!(HALAL_DOL_VEG < HALAL_SULLYED_KEZD && HALAL_SULLYED_KEZD < 1)) {
    bajok.push('a halál-szakaszok sorrendje hibás');
  }
  if (bajok.length) {
    throw new Error('[egyseg_animacio] hibás mozdulat-tábla:\n  ' + bajok.join('\n  '));
  }
}
_ellenoriz();
