// AGE OF THE CRYSTALS — EGYSÉGEK 3D-BEN (alkatrész-alapú instancing).
//
// Ez a réteg a v0.1 motor-szonda FŐ KÉRDÉSE: elvisz-e egy 2017-es iMac
// 1600 apró, JÁRÓ figurát 60 FPS-en. A módszer a TELEPESEK `units3d.js`-éből
// jön, ott ~1500 figurát mozgat élesben; itt az RTS-igényekhez igazítva.
//
// ── MIÉRT ALKATRÉSZ-ALAPÚ INSTANCING ──────────────────────────────────────
// Egy figura NEM egy mesh. A figura ALKATRÉSZEKRE bomlik, és minden alkatrész
// egy külön `InstancedMesh` — de a mátrixuk NEM független: mindegyik a TEST
// mátrixából származik:
//
//      M = B · T(ízület) · Rx(szög) · S(skála)
//
// Ezt a `reszMatrix()` írja ki NYERS FLOAT-MATEKKAL: nincs `Matrix4`
// példányosítás, nincs `.multiply()` metódus-lánc, nincs `Quaternion`.
// Egyetlen alkatrész kiírása ~25 szorzás és 16 tömb-írás. Ez az, ami
// megengedi, hogy egy figurának 8 mozgó alkatrésze legyen 1600 példányban:
// alkatrészenként EGY rajzhívás, összesen 12 — nem 1600 × 8.
//
// Az ellentábor (mesh/figura, `Object3D` gyerekekkel) 1600 egységnél 12 800
// mátrix-frissítést, ugyanennyi `matrixWorld` bejárást és 12 800 rajzhívást
// jelentene: ott a 60 FPS meg sem közelíthető.
//
// ── AZ ALKATRÉSZEK (12 InstancedMesh) ─────────────────────────────────────
//   test              tunika + öv + váll   (instanceColor = CSAPAT-szín, típus
//                                           szerint árnyalva)
//   fej               (instanceColor = egyedi bőrszín)
//   sisak             (instanceColor = csapat-szín, típusonként MÁS méret)
//   balLab, jobbLab   a csípő körül, ELLENFÁZISBAN lengenek
//   balKar, jobbKar   külön szögön — a típus tartása így felismerhető
//   csákány · lándzsa · íj · kard   — a JOBB VÁLL ízületére szerelve, tehát
//                     EGYÜTT MOZOG a karral (a fegyver nem lebeg a figura
//                     mellett, hanem a kezében van)
//   pajzs             — a BAL VÁLL ízületén (csak LANDZSAS)
//
// ── MIÉRT NEM TÖMÖRÍTJÜK A FEGYVEREKET (eltérés a TELEPESEK-től) ──────────
// A TELEPESEK-ben a szerszám és a cipelt áru RITKA és FUTÁS KÖZBEN VÁLTOZIK
// (a hordár leteszi a rönköt, felvesz egy zsákot), ezért ott képkockánként
// nulláról induló kurzorra íródnak, „tömörítve". Ennek az ÁRA, hogy a ritka
// alkatrészt AKKOR IS ki kell írni, ha a figura meg sem moccant.
//
// Itt az `e.tipus[i]` a felállás után SOSEM változik. Ezért minden egység
// EGYSZER kap egy állandó helyet a saját fegyver-meshében (`_fegyverIdx`), és
// onnantól a fegyver ugyanúgy slot-indexelt, mint a test — vagyis a
// dirty-gyorstár rá is érvényes. Egy álló figura képkockánként NULLA mátrixot
// ír, nem egyet. Példányszám ugyanannyi (egységenként pontosan egy fegyver),
// a CPU-költség viszont kevesebb. Ha egyszer lesz fegyver-váltás (v0.3
// fejlesztések), a tömörített írásra vissza lehet térni.
//
// ── JÁRÁS: A FÁZIS A MEGTETT ÚTBÓL JÖN, NEM TÁROLT ÁLLAPOTBÓL ─────────────
// A láb- és kar-lengés fázisa:
//
//      faz = (simIdo · |v|) · 2π / (2 · lépéshossz) + fazisEltolas(index)
//
// vagyis a MEGTETT ÚTTAL arányos. Két következménye van, és mindkettő fontos:
//   1. A talp nem csúszik meg a földön, mert a lépés-frekvencia definíció
//      szerint követi a sebességet (a sim `|v|`-je a szeparáció miatt sem
//      ingadozik: `_sebessegek()` NORMALIZÁLJA az irányt, majd `SEBESSEG[tipus]`-
//      szal szoroz — tehát `|v|` pontosan 0 vagy a típus névleges sebessége).
//   2. NINCS render-oldali animációs állapot, amit deszinkronizálni lehetne.
//      Ha a réteget kikapcsolják és visszakapcsolják, ugyanaz a póz jön vissza.
// Az idő is a SIM órája (`(tick + alfa) · DT`), nem a `performance.now()` —
// így a járás akkor sem gyorsul be, ha a képkocka-sebesség ingadozik.
//
// ── TÉTLEN ÉLET ───────────────────────────────────────────────────────────
// Az álló egység sem szobor: 5,5–14,5 másodpercenként (egységenként MÁS
// ütemben és fázisban) 1–2 másodpercre mocorog — körülnéz, súlypontot vált,
// vagy lép egyet oldalra és vissza. A burkológörbe `sin(π·s)`, tehát a
// mozdulat NULLÁRÓL indul és NULLÁRA ér vissza: nincs ugrás és nincs
// elsodródás. A KÖLTSÉG azért kicsi, mert szakaszos: egy időpillanatban az
// álló egységeknek csak ~10-15%-a esik ki a dirty-gyorstárból.
//
// ── INTERPOLÁCIÓ (a sim 20 Hz, a render 60+) ──────────────────────────────
// A `frissit(sim, alfa)` az ELŐZŐ és a MOSTANI tick pozíciója között
// interpolál. Az előző tick pozícióit MI tároljuk (`_elozoX/_elozoY`), mert a
// simhez hozzányúlni tilos — tick-váltáskor csak tömb-referenciát cserélünk
// és egy `TypedArray.set()`-tel átmásoljuk az újat, tehát 20 Hz-en két
// lineáris másolás az egész.
// ⚠️ Ha egy képkocka alatt TÖBB tick futott le (akadás), nem lassítunk le
// mesterségesen: az előző állapot ilyenkor a mostanira ugrik.
//
// ── LOD 3 SZINTEN, A KÉPERNYŐRE MÉRETEZVE ─────────────────────────────────
//   szint 2  közel : teljes figura (fej, sisak, 4 végtag, fegyver, pajzs)
//   szint 1  távol : csak a TEST sziluettje
//   szint 0  rejtve: látómezőn kívül vagy a rejt-küszöbön túl
//
// A küszöb NEM világegység-konstans és NEM a kamera-céltávolság, hanem a
// figura KÉPERNYŐN ELFOGLALT MAGASSÁGA. A TELEPESEK-ben a fix, világegységben
// megadott 110-es küszöb volt a hiba: teljes kizoomon a kép felső harmadára
// esett, és pásztázáskor végigsöpört a képen — a figurák a SZEMÜNK LÁTTÁRA
// cserélték a LOD-szintjüket. Ott ezt a „képernyő sarkára méretezett" nagyobb
// konstans oldotta meg; itt egy lépéssel tovább megyünk, mert az RTS-kamera
// sokkal jobban kizoomol:
//
//     kepernyoHanyad = LOD_FIGURA_MAG · p11 / (2 · tavolsag),   p11 = 1/tan(fov/2)
//
// A `p11` a kamera vetítési mátrixából jön, tehát a küszöb magától követi a
// látószöget és a zoomot. A váltás ott történik, ahol a figura ~15, illetve
// ~3 képpont magas — ilyen méretben a végtagok elhagyása nem látszik, viszont
// pont ilyenkor van a legtöbb figura a képen. A régi „kamera-magasság
// szorzója" szabály itt CSŐDÖT MONDOTT: kizoomolva a küszöb is nőtt, tehát
// épp a legterheltebb pillanatban maradt mind az 1600 figura teljes
// részletességen (mérve: 240 egység kameramagasságon 1600/1600 „közeli").
//
// ── AMI TILOS ITT ─────────────────────────────────────────────────────────
//   • bármit VISSZAÍRNI a simbe (azonnali desync a v0.8 lockstepben)
//   • allokálni a képkocka-hurokban (GC-tüske = eldobott képkocka)
//   • `new THREE.Matrix4()` / `.clone()` / tömb-literál a hurokban
//
// SZERZŐDÉS (INTERFACES.md):
//   new Egysegek3D(scene, sim, opciok)
//   frissit(sim, alfa)   MINDEN képkockán, alfa ∈ [0,1)
//   set enabled(v)
//   get haromszog()
// Extra: `dispose()`, `statisztika(nullaz)`, `kamera` beállító.

import * as THREE from 'three';
// ⚠️ NÉVTÉR-IMPORT, nem nevesített: a `core3d.js`-t párhuzamosan írja egy
// másik réteg, és egy nem létező NEVESÍTETT export ESM-ben LINK-IDEJŰ hiba
// volna, ami az egész alkalmazást ledöntené. Így viszont a hiányzó függvény
// csak `undefined`, és a lenti `?.` ág elnyeli.
// MIÉRT KELL EGYÁLTALÁN: a `main.js` a rétegeket ÜRES opciókkal példányosítja
// (`new EgysegReteg(szinter, sim, {})`), tehát máshonnan nem tudnánk meg, hol
// a kamera — a LOD és a látómező-vágás NÉMÁN kikapcsolna, és a szonda EZT
// mérné 60 FPS-ként vagy annak hiányaként. A `core3d` pontosan erre tartja
// fenn az „aktív kamera" jegyzéket, a `terrain3d` és a `props3d` is innen
// veszi.
import * as mag3d from './core3d.js';
import { TIPUS, ALLAPOT, DT } from '../sim/units.js';

// ── ÁLLANDÓK ───────────────────────────────────────────────────────────────

const TAU = Math.PI * 2;
const FEL_PI = Math.PI * 0.5;

/** Hány egységtípus van (a táblák ekkorák). */
const TIPUS_DB = 4;

// A figura alap-magassága ~1,0 világegység, MÉRET-szorzó nélkül. A pálya egy
// cellája 1 világegység, az ütközési sugarak 0,30–0,42 — egy ~1,0–1,3 magas
// figura ehhez arányos (nem törpe, nem óriás), és a `MERET_Y` skálázza tovább.

/** Ízület-pozíciók a figura LOKÁLIS terében (talp = 0, fej fölfelé). */
const CSIPO_X = 0.088, CSIPO_Y = 0.42;
/** Csípő → talp távolság. A járás függőleges kiegyenlítése ezzel számol. */
const LAB_HOSSZ = 0.42;
const VALL_X = 0.155, VALL_Y = 0.735;
const FEJ_Y = 0.86;
/** A kéz helye a vállízülethez képest — ide kerül a fegyver markolata. */
const MARKOLAT_Y = -0.30, MARKOLAT_Z = 0.035;

/** Bőrszín-alap (egységenként ±20% árnyalattal szórva). */
const BOR_HEX = 0xe0b489;

/**
 * Csapat-színek. 0 = kék, 1 = vörös — az RTS-hagyomány szerint, és mert ez a
 * két szín válik el a legjobban a fűzöld/homok/sziklaszürke terepen.
 */
const CSAPAT_HEX = [0x3f6fe0, 0xd63a2e];

/**
 * Típusonkénti test-árnyalat: [keverőszín, keverő súly, fényerő].
 * A csapat-szín MARAD az uralkodó jel (azt kell 1600 egységnél elsőre
 * felismerni), a típus csak árnyalja — a MUNKAS fakó és barnás, a LOVAG
 * sötétebb és acélosabb.
 */
const TIPUS_KEVER = [
  [0x9a8258, 0.52, 0.94],   // MUNKAS   — durva vászon
  [0xffffff, 0.06, 1.00],   // LANDZSAS — tiszta csapat-szín
  [0x4f7a44, 0.30, 0.92],   // IJASZ    — zöldes köpeny
  [0x2a2f3a, 0.26, 1.06],   // LOVAG    — sötét, telített
];

/** Sisak-árnyalat típusonként (a MUNKAS „sisakja" barna kalap). */
const SISAK_KEVER = [
  [0x8a6a3c, 0.80, 0.90],
  [0xb9bec8, 0.55, 1.00],
  [0x6d7a5a, 0.55, 0.96],
  [0xd2d8e4, 0.62, 1.10],
];

/** Test-méret típusonként: [magasság, szélesség] szorzó. */
const MERET_Y = [1.02, 1.10, 1.06, 1.30];
const MERET_XZ = [1.00, 1.05, 1.00, 1.18];
/** Sisak-méret szorzó (a LOVAG sisakja tömör, a MUNKASé lapos kalap). */
const SISAK_MERET = [0.92, 1.00, 0.94, 1.14];

/**
 * LÉPÉSHOSSZ típusonként (világegység). A járás-fázis ebből és a megtett
 * útból jön — nagyobb figura hosszabbat lép, tehát a LOVAG nem kapálózik.
 */
const LEPES_HOSSZ = [0.72, 0.76, 0.74, 0.98];

/**
 * ALAPTARTÁS: a kar nyugalmi szöge típusonként [bal, jobb], radiánban
 * (negatív = előre emelt). Ettől lesz felismerhető a típus MOZDULATLANUL is:
 *   MUNKAS   — vállra vetett csákány
 *   LANDZSAS — függőlegesen tartott lándzsa, bal karon a pajzs
 *   IJASZ    — a jobb kéz tartja az íjat (a szerződés szerint a fegyver a
 *              JOBB vállon van), a bal az ideget húzza
 *   LOVAG    — leeresztett, harcra kész kard
 */
const KAR_ALAP_BAL = [-0.12, -0.62, -1.05, -0.16];
const KAR_ALAP_JOBB = [-0.90, -0.34, -0.72, -0.28];

// A fegyver-mesh indexe MEGEGYEZIK a típus indexével (0 csákány, 1 lándzsa,
// 2 íj, 3 kard) — így a hurokban egyetlen tömb-olvasás, nincs elágazás.

/** A járás-lengés amplitúdója (rad). */
const LAB_LENGES = 0.62;
const KAR_LENGES = 0.44;

/** Tétlen mocorgás: ennyi időnként (mp), ennyi ideig (mp). */
const MOC_KOZ_MIN = 5.5, MOC_KOZ_MAX = 14.5;
const MOC_HOSSZ_MIN = 0.9, MOC_HOSSZ_MAX = 2.0;

/**
 * LOD alapértelmezések — KÉPERNYŐ-MÉRETRE méretezve (lásd a fejlécet).
 * A küszöb az, hogy a figura a képernyő magasságának hányad részét foglalja:
 *   reszletFrakcio 0,0075 ≈ 8 képpont 1080p-n — ennél kisebb figuránál a kar
 *                           és a láb 1-2 képpont, tehát elhagyható
 *   rejtFrakcio    0,0012 ≈ 1,3 képpont      — gyakorlatilag „csak a látómező
 *                           vág"; egy RTS-ben a sereg a legnagyobb kizoomon is
 *                           látszódjon, ott már úgyis a sziluett-szint megy
 */
const LOD_ALAP = {
  reszletFrakcio: 0.0075,
  rejtFrakcio: 0.0012,
  /** Biztonsági korlátok, ha a vetítési mátrix szokatlan. */
  reszletMin: 12,
  reszletMax: 700,
  frustum: true,
};

/** A figura névleges magassága a LOD-számításhoz (világegység). */
const LOD_FIGURA_MAG = 1.2;

// ── GYORS SZINUSZ-TÁBLA ────────────────────────────────────────────────────
//
// MIÉRT: egységenként ~8 trigonometrikus hívás kell (irány, két láb, két kar,
// fázis, mocorgás). 1600 egységnél ez képkockánként ~13 000 `Math.sin/cos` —
// mérhető, 0,3-0,5 ms nagyságrend egy gyenge gépen. A tábla felbontása
// 4096 osztás = 0,0015 rad = 0,09°: egy 1 egység magas figura szélén ez
// 1,5 ezred egység eltérés, vagyis LÁTHATATLAN.
//
// MELLÉKHASZON: a kvantálás STABILIZÁLJA a dirty-gyorstárat is, mert az apró
// numerikus zaj nem billenti ki az álló figurákat.
const SZIN_BIT = 12;
const SZIN_DB = 1 << SZIN_BIT;             // 4096
const SZIN_MASZK = SZIN_DB - 1;
const SZIN_SKALA = SZIN_DB / TAU;
const SZIN_TAB = new Float32Array(SZIN_DB);
for (let i = 0; i < SZIN_DB; i++) SZIN_TAB[i] = Math.sin(i / SZIN_SKALA);

/** Szinusz táblából. A `|0` miatt |a| < 100 000 rad legyen (fázis modulózva). */
function szin(a) { return SZIN_TAB[((a * SZIN_SKALA) | 0) & SZIN_MASZK]; }
/** Koszinusz ugyanabból a táblából (negyed periódus eltolás). */
function kosz(a) { return SZIN_TAB[(((a * SZIN_SKALA) | 0) + (SZIN_DB >> 2)) & SZIN_MASZK]; }

// ── SEGÉDEK ────────────────────────────────────────────────────────────────

/**
 * EGYSÉGENKÉNTI VÁLTOZAT [0,1) — stabil, olcsó egész-keverés (murmur-finish).
 * Ugyanaz az index MINDIG ugyanazt kapja: enélkül a figura magassága és
 * bőrszíne képkockánként remegne. A szomszédjától viszont eltér.
 * @param {number} i egység-index @param {number} so keverő-konstans
 */
function valtozat(i, so) {
  let h = (i ^ so) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function vag01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

/**
 * Egy példány elrejtése: csupa nulla mátrix. Az így kapott háromszögek
 * elfajultak, a raszterizáló eldobja őket — de a vertex-shader még lefut
 * rajtuk, ezért a rejtés NEM ingyenes (lásd a jelentés kockázat-részét).
 */
function rejtMatrix(t, i) {
  const o = i * 16;
  t[o] = 0; t[o + 1] = 0; t[o + 2] = 0; t[o + 3] = 0;
  t[o + 4] = 0; t[o + 5] = 0; t[o + 6] = 0; t[o + 7] = 0;
  t[o + 8] = 0; t[o + 9] = 0; t[o + 10] = 0; t[o + 11] = 0;
  t[o + 12] = 0; t[o + 13] = 0; t[o + 14] = 0; t[o + 15] = 1;
}

/**
 * A TEST mátrixa NYERS FLOAT-MATEKKAL, közvetlenül az instance-tömbbe.
 *   M = T(x,y,z) · R_YXZ(doles, irany, dol) · S(sx, sy, sz)
 *
 * MIÉRT NEM `Matrix4.compose()`: az `Euler → Quaternion → Matrix4` úton
 * egységenként három objektum-metódus és ~60 művelet fut, ráadásul a
 * kvaternió-ág mindig a teljes általános esetet számolja. Itt a GYAKORI eset
 * (nincs dőlés) csak KÉT tábla-olvasás és 9 szorzás.
 *
 * A forgatási sorrend szándékosan azonos a `THREE.Euler` 'YXZ'-jével: ha
 * később mégis kell egy `Object3D`-vel egyeztetni, ugyanaz jön ki.
 */
function testMatrix(t, i, x, y, z, doles, irany, dol, sx, sy, sz) {
  const o = i * 16;
  const c = kosz(irany), d = szin(irany);
  if (doles === 0 && dol === 0) {
    // Gyakori eset: csak függőleges tengely körüli forgás.
    t[o] = c * sx; t[o + 1] = 0; t[o + 2] = -d * sx; t[o + 3] = 0;
    t[o + 4] = 0; t[o + 5] = sy; t[o + 6] = 0; t[o + 7] = 0;
    t[o + 8] = d * sz; t[o + 9] = 0; t[o + 10] = c * sz; t[o + 11] = 0;
  } else {
    // R = R_y(irany) · R_x(doles) · R_z(dol), oszlop-folytonos kiírásban.
    // a = cos(doles), b = sin(doles), c/d = irany, e/f = dol.
    // (A négy vegyes tag PÁRBAN szimmetrikus: ce↔df és cf↔de — ha ez elromlik,
    //  a figura oldalra dől, amint lejtőre lép.)
    const a = kosz(doles), b = szin(doles);
    const e = kosz(dol), f = szin(dol);
    const ce = c * e, cf = c * f, de = d * e, df = d * f;
    t[o] = (ce + df * b) * sx;
    t[o + 1] = (a * f) * sx;
    t[o + 2] = (cf * b - de) * sx;
    t[o + 3] = 0;
    t[o + 4] = (de * b - cf) * sy;
    t[o + 5] = (a * e) * sy;
    t[o + 6] = (df + ce * b) * sy;
    t[o + 7] = 0;
    t[o + 8] = (a * d) * sz;
    t[o + 9] = (-b) * sz;
    t[o + 10] = (a * c) * sz;
    t[o + 11] = 0;
  }
  t[o + 12] = x; t[o + 13] = y; t[o + 14] = z; t[o + 15] = 1;
}

/**
 * Egy ALKATRÉSZ mátrixa a TEST mátrixából származtatva:
 *     M = B · T(px,py,pz) · Rx(szög) · S(sx,sy,sz)
 * Se `Matrix4`, se metódushívás, se ideiglenes objektum — 24 szorzás.
 * A forgástengely az X: a végtagok ELŐRE-HÁTRA lengenek a figura saját
 * terében, és mivel `B` már tartalmazza az irányt, a lengés együtt fordul a
 * figurával.
 * @param {Float32Array} cel cél instance-mátrix tömb
 * @param {number} ci cél-slot
 * @param {Float32Array} b a TEST mátrixát tartalmazó tömb
 * @param {number} bo a test-mátrix kezdőindexe `b`-ben
 * @param {number} c,s a forgásszög koszinusza/szinusza
 */
function reszMatrix(cel, ci, b, bo, px, py, pz, c, s, sx, sy, sz) {
  const o = ci * 16;
  const b00 = b[bo], b01 = b[bo + 1], b02 = b[bo + 2];
  const b10 = b[bo + 4], b11 = b[bo + 5], b12 = b[bo + 6];
  const b20 = b[bo + 8], b21 = b[bo + 9], b22 = b[bo + 10];
  cel[o] = b00 * sx; cel[o + 1] = b01 * sx; cel[o + 2] = b02 * sx; cel[o + 3] = 0;
  cel[o + 4] = (b10 * c + b20 * s) * sy;
  cel[o + 5] = (b11 * c + b21 * s) * sy;
  cel[o + 6] = (b12 * c + b22 * s) * sy;
  cel[o + 7] = 0;
  cel[o + 8] = (b20 * c - b10 * s) * sz;
  cel[o + 9] = (b21 * c - b11 * s) * sz;
  cel[o + 10] = (b22 * c - b12 * s) * sz;
  cel[o + 11] = 0;
  cel[o + 12] = b[bo + 12] + b00 * px + b10 * py + b20 * pz;
  cel[o + 13] = b[bo + 13] + b01 * px + b11 * py + b21 * pz;
  cel[o + 14] = b[bo + 14] + b02 * px + b12 * py + b22 * pz;
  cel[o + 15] = 1;
}

// ── GEOMETRIA ──────────────────────────────────────────────────────────────
//
// A háromszög-költségvetés itt dől el, ezért minden darab a MINIMÁLIS
// szegmensszámon készül (4–7), és ami takarásban van, az NYITOTT hengerrel
// megy (`openEnded`), tehát nincs fedőlapja. Lapos árnyalással (flatShading)
// a hét oldalú henger tömör, makett-szerű figurát ad — pont ez a stílus.

const _szinSeged = new THREE.Color();

/**
 * Több apró geometria EGYBE olvasztása, részenként BESÜTÖTT vertex-színnel.
 * Így egy alkatrész (nyél + penge + él) EGYETLEN InstancedMesh marad, mégis
 * háromszínű — nem függünk a BufferGeometryUtils-tól.
 *   { g, c: hex }     — abszolút szín
 *   { g, k: [r,g,b] } — NYERS szorzó (ahol az instanceColor-t moduláljuk)
 * @param {Array<{g:THREE.BufferGeometry, c?:number, k?:number[]}>} reszek
 */
function osszevon(reszek) {
  const forras = [];
  for (let i = 0; i < reszek.length; i++) {
    const p = reszek[i];
    if (!p || !p.g || !p.g.attributes || !p.g.attributes.position) continue;
    const nyers = p.g.index ? p.g.toNonIndexed() : p.g;
    if (!nyers.attributes.normal) nyers.computeVertexNormals();
    forras.push({ g: nyers, c: p.c, k: p.k, sajat: nyers !== p.g, eredeti: p.g });
  }
  if (!forras.length) return new THREE.BufferGeometry();

  let ossz = 0;
  for (let i = 0; i < forras.length; i++) ossz += forras[i].g.attributes.position.count;

  const P = new Float32Array(ossz * 3);
  const N = new Float32Array(ossz * 3);
  const C = new Float32Array(ossz * 3);
  let o = 0;
  for (let i = 0; i < forras.length; i++) {
    const g = forras[i].g;
    const db = g.attributes.position.count;
    P.set(g.attributes.position.array.subarray(0, db * 3), o * 3);
    N.set(g.attributes.normal.array.subarray(0, db * 3), o * 3);
    let r = 1, zo = 1, b = 1;
    if (forras[i].k) { r = forras[i].k[0]; zo = forras[i].k[1]; b = forras[i].k[2]; }
    else {
      _szinSeged.setHex(forras[i].c === undefined ? 0xffffff : forras[i].c);
      r = _szinSeged.r; zo = _szinSeged.g; b = _szinSeged.b;
    }
    for (let k = 0; k < db; k++) {
      C[(o + k) * 3] = r; C[(o + k) * 3 + 1] = zo; C[(o + k) * 3 + 2] = b;
    }
    o += db;
  }

  const ki = new THREE.BufferGeometry();
  ki.setAttribute('position', new THREE.BufferAttribute(P, 3));
  ki.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  ki.setAttribute('color', new THREE.BufferAttribute(C, 3));
  ki.computeBoundingSphere();

  for (let i = 0; i < forras.length; i++) {
    forras[i].g.dispose();
    if (forras[i].sajat && forras[i].eredeti.dispose) forras[i].eredeti.dispose();
  }
  return ki;
}

/** A markolatot a KÉZBE tolja (a vállízület az origó, a kar lefelé lóg). */
function kezbe(g) {
  g.translate(0, MARKOLAT_Y, MARKOLAT_Z);
  return g;
}

/** TEST — tunika + öv + váll. ~49 háromszög. Az origó a TALP. */
function epitTest() {
  // A tunika NYITOTT henger: a tetejét a váll-kúp, az alját a talp-korong zárja.
  const tunika = new THREE.CylinderGeometry(0.150, 0.205, 0.34, 7, 1, true);
  tunika.translate(0, 0.600, 0);
  const also = new THREE.CircleGeometry(0.205, 7);
  also.rotateX(FEL_PI);                       // lefelé néző fedőlap
  also.translate(0, 0.430, 0);
  const ov = new THREE.CylinderGeometry(0.190, 0.196, 0.052, 7, 1, true);
  ov.translate(0, 0.500, 0);
  const vall = new THREE.ConeGeometry(0.168, 0.125, 7);
  vall.translate(0, 0.760, 0);
  // A vertex-szín SZORZÓ: az instanceColor adja a csapat-színt, ez tagolja.
  return osszevon([
    { g: tunika, k: [1.00, 1.00, 1.00] },
    { g: also, k: [0.62, 0.62, 0.62] },
    { g: ov, k: [0.42, 0.38, 0.33] },
    { g: vall, k: [1.16, 1.15, 1.12] },
  ]);
}

/** FEJ — az origó a fej KÖZEPE (a `reszMatrix` oda teszi a tengelyt). */
function epitFej() {
  const koponya = new THREE.SphereGeometry(0.105, 5, 4);
  koponya.scale(0.98, 1.08, 0.96);
  const orr = new THREE.BoxGeometry(0.028, 0.030, 0.032);
  orr.translate(0, -0.012, 0.098);
  return osszevon([
    { g: koponya, k: [1.00, 1.00, 1.00] },
    { g: orr, k: [1.08, 1.00, 0.94] },
  ]);
}

/** SISAK — szintén a fej közepe az origó, hogy a méret típusonként skálázható. */
function epitSisak() {
  const bura = new THREE.ConeGeometry(0.116, 0.145, 6);
  bura.translate(0, 0.082, 0);
  const karima = new THREE.CylinderGeometry(0.126, 0.132, 0.030, 6, 1, true);
  karima.translate(0, 0.014, 0);
  return osszevon([
    { g: bura, k: [1.00, 1.00, 1.00] },
    { g: karima, k: [0.74, 0.75, 0.78] },
  ]);
}

/**
 * LÁB — az origó a CSÍPŐ-ízület. ~22 háromszög.
 * ⚠️ A TALP PONTOSAN `LAB_HOSSZ`-ra van a csípőtől, hogy az álló figura
 * talpa a terepen legyen és ne lebegjen fölötte. (Mérve: 0,04 egység lebegés
 * már látszik, mert a figura mindössze ~1 egység magas.)
 */
function epitLab() {
  const szar = new THREE.CylinderGeometry(0.052, 0.042, 0.37, 5, 1, true);
  szar.translate(0, -0.185, 0);
  const talp = new THREE.BoxGeometry(0.086, 0.055, 0.135);
  talp.translate(0, -0.392, 0.026);
  return osszevon([
    { g: szar, c: 0x6b5942 },
    { g: talp, c: 0x3a3028 },
  ]);
}

/** KAR — az origó a VÁLL-ízület. ~22 háromszög. */
function epitKar() {
  const felkar = new THREE.CylinderGeometry(0.047, 0.034, 0.30, 5, 1, true);
  felkar.translate(0, -0.150, 0);
  const kez = new THREE.BoxGeometry(0.064, 0.076, 0.064);
  kez.translate(0, -0.315, 0.012);
  return osszevon([
    { g: felkar, c: 0xc9a179 },
    { g: kez, c: BOR_HEX },
  ]);
}

/** CSÁKÁNY — vállra vetve, a nyél hátrafelé dől. ~20 háromszög. */
function epitCsakany() {
  const nyel = new THREE.CylinderGeometry(0.019, 0.019, 0.46, 4, 1, true);
  const fej = new THREE.BoxGeometry(0.25, 0.048, 0.055);
  fej.rotateZ(0.10);
  fej.translate(0, 0.215, 0);
  const g = osszevon([{ g: nyel, c: 0x8a6a44 }, { g: fej, c: 0x9aa2ad }]);
  g.rotateX(-0.55);                 // hátradöntött nyél
  g.translate(0, 0.14, 0);          // a markolat a nyél alsó harmadánál
  return kezbe(g);
}

/** LÁNDZSA — függőlegesen tartva, hegye fölfelé. ~16 háromszög. */
function epitLandzsa() {
  const nyel = new THREE.CylinderGeometry(0.017, 0.017, 0.95, 4, 1, true);
  nyel.translate(0, 0.26, 0);
  const hegy = new THREE.ConeGeometry(0.038, 0.145, 4);
  hegy.translate(0, 0.81, 0);
  const g = osszevon([{ g: nyel, c: 0x7d6141 }, { g: hegy, c: 0xb9c0cb }]);
  g.rotateX(0.10);
  return kezbe(g);
}

/** ÍJ — két kar + ideg, oldalról nézve olvasható sziluett. ~36 háromszög. */
function epitIj() {
  const felso = new THREE.BoxGeometry(0.024, 0.30, 0.052);
  felso.rotateZ(-0.22); felso.translate(0.032, 0.155, 0);
  const also = new THREE.BoxGeometry(0.024, 0.30, 0.052);
  also.rotateZ(0.22); also.translate(0.032, -0.155, 0);
  const ideg = new THREE.BoxGeometry(0.010, 0.60, 0.010);
  ideg.translate(0.098, 0, 0);
  const g = osszevon([
    { g: felso, c: 0x7a5a34 }, { g: also, c: 0x7a5a34 }, { g: ideg, c: 0xe8e2d0 },
  ]);
  g.rotateY(FEL_PI);                // az íj síkja a menetiránnyal párhuzamos
  g.rotateX(0.18);
  g.translate(0, 0.10, 0);
  return kezbe(g);
}

/** KARD — penge + keresztvas + markolat. ~32 háromszög. */
function epitKard() {
  const penge = new THREE.BoxGeometry(0.056, 0.44, 0.017);
  penge.translate(0, 0.29, 0);
  const kereszt = new THREE.BoxGeometry(0.20, 0.036, 0.034);
  kereszt.translate(0, 0.055, 0);
  const markolat = new THREE.CylinderGeometry(0.024, 0.021, 0.11, 4, 1, true);
  markolat.translate(0, -0.020, 0);
  const g = osszevon([
    { g: penge, k: [1.30, 1.32, 1.38] },
    { g: kereszt, k: [0.92, 0.86, 0.62] },
    { g: markolat, k: [0.42, 0.34, 0.28] },
  ]);
  g.rotateX(-0.22);
  return kezbe(g);
}

/** PAJZS — a BAL váll ízületére szerelve (csak LANDZSAS). ~24 háromszög. */
function epitPajzs() {
  const lap = new THREE.CylinderGeometry(0.170, 0.170, 0.034, 6, 1, false);
  lap.rotateX(FEL_PI);              // korong, előre néz
  const g = osszevon([{ g: lap, k: [1.00, 1.00, 1.00] }]);
  g.translate(-0.02, -0.19, 0.115);
  return g;
}

// ── AZ OSZTÁLY ─────────────────────────────────────────────────────────────

export class Egysegek3D {
  /**
   * @param {THREE.Scene} scene a jelenet (a `core3d` adja)
   * @param {import('../sim/sim.js').Sim} sim
   * @param {{kamera?:THREE.Camera, kameraFv?:Function, maxEgyseg?:number,
   *          arnyek?:boolean, lejtoIgazitas?:boolean, simaMagassag?:boolean,
   *          lod?:Object}} [opciok]
   */
  constructor(scene, sim, opciok = {}) {
    this._scene = scene || null;
    this._op = opciok || {};

    /** A kamera a LOD-hoz és a látómező-vágáshoz. Utólag is beállítható. */
    this._kamera = opciok.kamera || opciok.camera || null;
    this._kameraFv = typeof opciok.kameraFv === 'function' ? opciok.kameraFv : null;
    this._kameraFigyelmeztetve = false;

    this._lod = Object.assign({}, LOD_ALAP, opciok.lod || {});
    this._arnyek = !!opciok.arnyek;
    /**
     * LEJTŐ-IGAZÍTÁS: a figura a domboldalon ne álljon függőlegesen, mint egy
     * szeg. Négy terep-mintavétel egységenként — CSAK a közeli LOD-on.
     */
    this._lejto = opciok.lejtoIgazitas !== false;
    /**
     * MAGASSÁG: a szerződés `racs.magassagPont(px,py)`-t ír elő, ami CELLA-
     * középpont magasságot ad — az egység a cellán belül mozogva ugrálna, és
     * meredek lejtőn a talpa fél figura-magasságnyit tévedne a terep-hálóhoz
     * képest. Ezért alapból a CSÚCS-magasságokból (`racs.magassag`, amiből a
     * terep-háló is épül) bilineárisan mintavételezünk: a cella KÖZEPÉN ez
     * bitre ugyanazt adja, mint a `magassagPont`, máshol viszont pontosan a
     * háló felszínét. `simaMagassag: false` esetén a nyers cella-értéket
     * használjuk (a szerződés betű szerinti olvasata).
     */
    this._simaMagassag = opciok.simaMagassag !== false;

    this._be = true;
    this._csoport = null;
    this._geo = null;
    this._anyag = null;
    this._meshek = null;      // InstancedMesh[]
    this._triPer = null;      // háromszög / példány meshenként

    this._kap = 0;
    this._db = 0;
    this._e = null;           // az `Egysegek` példány, amit legutóbb láttunk
    this._tarolTick = -1;
    this._elozoTick = -1;

    // mérőszámok
    this._statKocka = 0;
    this._statIrt = 0;
    this._statLathato = 0;
    this._statKozel = 0;

    // előre foglalt munka-objektumok (nulla allokáció a hurokban)
    this._projM = new THREE.Matrix4();
    this._frustum = new THREE.Frustum();
    this._gomb = new THREE.Sphere(new THREE.Vector3(), 0.95);
    this._tipusSzam = new Int32Array(TIPUS_DB);
    this._maxFegyver = new Int32Array(TIPUS_DB);

    const kap = (opciok.maxEgyseg | 0)
      || (sim && sim.egysegek ? sim.egysegek.maxDb | 0 : 0) || 2048;
    this._epit(kap);

    if (sim) this._ujSim(sim);
  }

  // ── SZERZŐDÉS ───────────────────────────────────────────────────────────

  /** @param {boolean} v false → a réteg objektumai `.visible = false` */
  set enabled(v) {
    const uj = !!v;
    if (uj === this._be) return;
    this._be = uj;
    if (this._csoport) this._csoport.visible = uj;
    // Visszakapcsoláskor a gyorstár ELAVULT (a köztes képkockákon nem írtunk
    // mátrixot), ezért mindent érvénytelenítünk.
    if (uj) this._ervenytelenit();
  }

  get enabled() { return this._be; }

  /** A réteg által kirajzolt háromszögek száma az AKTUÁLIS példányszámokkal. */
  get haromszog() {
    if (!this._meshek || !this._be) return 0;
    let ossz = 0;
    for (let k = 0; k < this._meshek.length; k++) {
      ossz += this._triPer[k] * this._meshek[k].count;
    }
    return ossz;
  }

  /** Hány rajzhívás megy ki (a nulla példányszámú mesheket a three átugorja). */
  get rajzhivas() {
    if (!this._meshek || !this._be) return 0;
    let n = 0;
    for (let k = 0; k < this._meshek.length; k++) if (this._meshek[k].count > 0) n++;
    return n;
  }

  /** A kamera utólagos beállítása (ha a boot-sorrend miatt még nem volt meg). */
  set kamera(k) { this._kamera = k || null; }
  get kamera() { return this._aktKamera(); }

  /**
   * A figurák szinkronizálása a szimulációval. MINDEN képkockán fut, ezért
   * itt SEMMIT nem szabad allokálni.
   * @param {import('../sim/sim.js').Sim} sim
   * @param {number} alfa interpoláció a két tick között, [0,1)
   */
  frissit(sim, alfa) {
    if (!this._be || !this._csoport || !sim || !sim.egysegek) return;
    const e = sim.egysegek;
    const racs = sim.racs;

    if (e !== this._e) this._ujSim(sim);

    let db = e.db | 0;
    if (db > this._kap) db = this._kap;

    // ÚJ FELÁLLÁS? A `szondaFelallas` nullázza a `db`-t és újratölti, ilyenkor
    // a típusok és a színek is mások lehetnek. Két jelet nézünk: változott a
    // darabszám, vagy a tick visszaugrott (új meccs).
    if (db !== this._db || sim.tick < this._elozoTick) this._ujFelallas(e, db);
    this._elozoTick = sim.tick;

    this._pillanat(e, db, sim.tick);

    let a = +alfa;
    if (!(a >= 0)) a = 0; else if (a > 1) a = 1;

    this._rajzol(e, racs, db, sim.tick, a);
  }

  /** Mérés a szondának: mátrix-írás / képkocka, LOD-eloszlás. */
  statisztika(nullaz) {
    const k = this._statKocka || 1;
    const ki = {
      kockak: this._statKocka,
      irtMatrixKockank: +(this._statIrt / k).toFixed(1),
      lathatoKockank: +(this._statLathato / k).toFixed(1),
      kozeliKockank: +(this._statKozel / k).toFixed(1),
      haromszog: this.haromszog,
      rajzhivas: this.rajzhivas,
      peldany: this._peldanySzam(),
    };
    if (nullaz) {
      this._statKocka = 0; this._statIrt = 0;
      this._statLathato = 0; this._statKozel = 0;
    }
    return ki;
  }

  /** Teljes takarítás. */
  dispose() {
    if (this._meshek) {
      for (let k = 0; k < this._meshek.length; k++) {
        const im = this._meshek[k];
        if (this._csoport) this._csoport.remove(im);
        if (im.dispose) im.dispose();
      }
    }
    if (this._geo) for (const k in this._geo) {
      const g = this._geo[k];
      if (g && g.dispose) g.dispose();
    }
    if (this._anyag) for (const k in this._anyag) {
      const m = this._anyag[k];
      if (m && m.dispose) m.dispose();
    }
    if (this._csoport && this._csoport.parent) this._csoport.parent.remove(this._csoport);
    this._csoport = null; this._meshek = null; this._geo = null; this._anyag = null;
    this._e = null; this._kap = 0; this._db = 0;
  }

  // ── FELÉPÍTÉS ───────────────────────────────────────────────────────────

  /** A teljes mesh- és puffer-készlet felépítése adott kapacitással. */
  _epit(kap) {
    this._kap = kap | 0;

    this._csoport = new THREE.Group();
    this._csoport.name = 'egysegek3d';
    if (this._scene) this._scene.add(this._csoport);

    this._geo = {
      test: epitTest(),
      fej: epitFej(),
      sisak: epitSisak(),
      balLab: epitLab(),
      jobbLab: epitLab(),
      balKar: epitKar(),
      jobbKar: epitKar(),
      csakany: epitCsakany(),
      landzsa: epitLandzsa(),
      ij: epitIj(),
      kard: epitKard(),
      pajzs: epitPajzs(),
    };

    // ── ANYAGOK ────────────────────────────────────────────────────────────
    // MIÉRT LAMBERT ÉS NEM STANDARD: a `MeshStandardMaterial` fizikai alapú,
    // képpontonként számol BRDF-et; a `MeshLambertMaterial` csúcsonként.
    // 1600 figuránál a képernyő jelentős részét ezek a felületek fedik, és a
    // 2017-es iMac GPU-ja a képpont-oldalon fogy el először. A makett-stílusú,
    // lapos árnyalású figurán a PBR-nek amúgy sincs látható haszna.
    const mk = (opt) => new THREE.MeshLambertMaterial(Object.assign({
      color: 0xffffff, vertexColors: true, flatShading: true,
    }, opt));

    this._anyag = {
      test: mk({}),
      fej: mk({ flatShading: false }),
      sisak: mk({}),
      vegtag: mk({}),
      fegyver: mk({}),
      pajzs: mk({}),
    };

    // ── INSTANCED MESHEK ───────────────────────────────────────────────────
    // A fegyverek példányszáma típusonként legfeljebb a típus darabszáma,
    // ezért nem `kap`-ra foglalunk: 4 fegyver × kap = négyszeres pufferpazarlás
    // lenne. A kapacitás így is bőven fedi a legrosszabb esetet (mindenki
    // ugyanaz a típus), mert a `count` úgyis a valós darabszám lesz.
    const imk = (geo, anyag, meret, szinez) => {
      const im = new THREE.InstancedMesh(geo, anyag, meret);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;      // példányonként MI kultúrálunk
      im.count = 0;
      im.castShadow = this._arnyek;
      im.receiveShadow = false;
      // ⚠️ A frissen foglalt puffer CSUPA NULLA, tehát a homogén sor is 0 —
      // az ilyen mátrix `w = 0`-t ad, a perspektív osztás pedig NaN-t. Minden
      // slot rejtett (nulla skálájú, de érvényes) mátrixszal indul.
      const m = im.instanceMatrix.array;
      for (let s = 0; s < meret; s++) m[s * 16 + 15] = 1;
      if (szinez) {
        const t = new Float32Array(meret * 3);
        t.fill(1);
        im.instanceColor = new THREE.InstancedBufferAttribute(t, 3);
        im.instanceColor.setUsage(THREE.DynamicDrawUsage);
      }
      return im;
    };

    const k = this._kap;
    this._mTest = imk(this._geo.test, this._anyag.test, k, true);
    this._mFej = imk(this._geo.fej, this._anyag.fej, k, true);
    this._mSisak = imk(this._geo.sisak, this._anyag.sisak, k, true);
    this._mBalLab = imk(this._geo.balLab, this._anyag.vegtag, k, false);
    this._mJobbLab = imk(this._geo.jobbLab, this._anyag.vegtag, k, false);
    this._mBalKar = imk(this._geo.balKar, this._anyag.vegtag, k, false);
    this._mJobbKar = imk(this._geo.jobbKar, this._anyag.vegtag, k, false);
    this._mFegyver = [
      imk(this._geo.csakany, this._anyag.fegyver, k, false),
      imk(this._geo.landzsa, this._anyag.fegyver, k, false),
      imk(this._geo.ij, this._anyag.fegyver, k, false),
      imk(this._geo.kard, this._anyag.fegyver, k, false),
    ];
    this._mPajzs = imk(this._geo.pajzs, this._anyag.pajzs, k, true);

    this._meshek = [
      this._mTest, this._mFej, this._mSisak,
      this._mBalLab, this._mJobbLab, this._mBalKar, this._mJobbKar,
      this._mFegyver[0], this._mFegyver[1], this._mFegyver[2], this._mFegyver[3],
      this._mPajzs,
    ];
    for (let i = 0; i < this._meshek.length; i++) {
      this._meshek[i].name = 'egyseg_' + i;
      this._csoport.add(this._meshek[i]);
    }

    // háromszám / példány (a geometria nem indexelt az `osszevon` után)
    this._triPer = new Int32Array(this._meshek.length);
    for (let i = 0; i < this._meshek.length; i++) {
      const g = this._meshek[i].geometry;
      this._triPer[i] = (g.attributes.position.count / 3) | 0;
    }

    // ── GYORS HOZZÁFÉRÉS A NYERS TÖMBÖKHÖZ ────────────────────────────────
    this._aTest = this._mTest.instanceMatrix.array;
    this._aFej = this._mFej.instanceMatrix.array;
    this._aSisak = this._mSisak.instanceMatrix.array;
    this._aBalLab = this._mBalLab.instanceMatrix.array;
    this._aJobbLab = this._mJobbLab.instanceMatrix.array;
    this._aBalKar = this._mBalKar.instanceMatrix.array;
    this._aJobbKar = this._mJobbKar.instanceMatrix.array;
    this._aFegyver = [
      this._mFegyver[0].instanceMatrix.array,
      this._mFegyver[1].instanceMatrix.array,
      this._mFegyver[2].instanceMatrix.array,
      this._mFegyver[3].instanceMatrix.array,
    ];
    this._aPajzs = this._mPajzs.instanceMatrix.array;
    this._cTest = this._mTest.instanceColor.array;
    this._cFej = this._mFej.instanceColor.array;
    this._cSisak = this._mSisak.instanceColor.array;
    this._cPajzs = this._mPajzs.instanceColor.array;

    // ── EGYSÉGENKÉNTI RENDER-ÁLLAPOT (mind előre foglalva) ────────────────
    // Interpolációs pillanatképek — a sim-et TILOS módosítani, tehát az előző
    // tick pozícióit magunk tároljuk.
    this._elozoX = new Float32Array(k);
    this._elozoY = new Float32Array(k);
    this._elozoSzog = new Float32Array(k);
    this._mostX = new Float32Array(k);
    this._mostY = new Float32Array(k);
    this._mostSzog = new Float32Array(k);

    // Felállás-függő, EGYSZER számolt adatok.
    this._fegyverIdx = new Int32Array(k);
    this._meretY = new Float32Array(k);
    this._meretXZ = new Float32Array(k);
    this._faz0 = new Float32Array(k);         // járás fázis-eltolás
    this._mocPer = new Float32Array(k);       // mocorgás periódus (mp)
    this._mocFaz = new Float32Array(k);       // mocorgás fázis-eltolás (mp)
    this._mocHossz = new Float32Array(k);     // egy mocorgás hossza (mp)
    this._mocTip = new Uint8Array(k);         // 0 körülnéz, 1 súlypont, 2 lép

    // Dirty-gyorstár: az UTOLJÁRA KIÍRT állapot.
    // ⚠️ FLOAT64 ÉS NEM FLOAT32. Az összehasonlítás EGZAKT egyenlőség; ha a
    // gyorstár float32-ben tárolna, a kerekítés miatt a `_uSzog[i] === irany`
    // SOSEM teljesülne (az `irany` egy double kifejezés eredménye), és a
    // gyorstár néma módon 0%-os találati aránnyal futna. Mérve: 800 álló
    // egységnél 800 mátrix-írás/képkocka 0 helyett.
    this._uX = new Float64Array(k);
    this._uY = new Float64Array(k);
    this._uSzog = new Float64Array(k);
    this._uVis = new Uint8Array(k);
    this._uAnim = new Uint8Array(k);
    this._ervenytelenit();
  }

  /** Minden slot gyorstárának érvénytelenítése (255 = „sosem írtuk"). */
  _ervenytelenit() {
    if (!this._uVis) return;
    this._uVis.fill(255);
    this._uAnim.fill(1);
  }

  /** Új `Sim` (vagy új `Egysegek`) — minden gyorstár eldobható. */
  _ujSim(sim) {
    this._e = sim.egysegek;
    this._tarolTick = -1;
    this._elozoTick = -1;
    this._db = -1;
    this._nezPx = null;
    this._ervenytelenit();
  }

  /**
   * ÚJ FELÁLLÁS: a típusok és így a fegyver-helyek, méretek, színek és az
   * animációs fázisok újraszámolása. O(db), de csak felálláskor fut — a
   * képkocka-hurokban egyetlen hash-hívás sincs.
   */
  _ujFelallas(e, db) {
    this._db = db;
    this._tipusSzam.fill(0);

    for (let i = 0; i < db; i++) {
      const t = e.tipus[i] & 3;
      const cs = e.csapat[i] & 1;

      // A típuson belüli ÁLLANDÓ hely a fegyver-meshben (lásd fejléc).
      this._fegyverIdx[i] = this._tipusSzam[t]++;

      // TERMET: ±6% magasság, ±4% testesség — a tömeg ne ötven klón legyen.
      const v1 = valtozat(i, 0x27d4eb2f);
      const v2 = valtozat(i, 0x165667b1);
      this._meretY[i] = MERET_Y[t] * (0.94 + 0.12 * v1);
      this._meretXZ[i] = MERET_XZ[t] * (0.96 + 0.08 * v2);

      // ANIMÁCIÓS FÁZISOK — aranymetszéses szórás + egyedi keverés, hogy a
      // sereg ne egy emberként lépjen.
      this._faz0[i] = ((i * 0.6180339887498949) % 1) * TAU;
      const vp = valtozat(i, 0x2545f491);
      this._mocPer[i] = MOC_KOZ_MIN + vp * (MOC_KOZ_MAX - MOC_KOZ_MIN);
      this._mocFaz[i] = valtozat(i, 0x9e3779b9) * this._mocPer[i];
      this._mocHossz[i] = MOC_HOSSZ_MIN
        + valtozat(i, 0x7feb352d) * (MOC_HOSSZ_MAX - MOC_HOSSZ_MIN);
      this._mocTip[i] = (valtozat(i, 0x94d049bb) * 3) | 0;

      // ── SZÍNEK: EGYSZER írjuk, utána a puffer nem mozdul ────────────────
      const ruha = 0.93 + 0.14 * valtozat(i, 0x9e3779b1);
      this._szinKever(CSAPAT_HEX[cs], TIPUS_KEVER[t], ruha, this._cTest, i);
      this._szinKever(CSAPAT_HEX[cs], SISAK_KEVER[t], 1.0, this._cSisak, i);
      // pajzs: tiszta csapat-szín, hogy a falanx messziről is olvasható legyen
      _szinSeged.setHex(CSAPAT_HEX[cs]);
      const pi = this._fegyverIdx[i] * 3;
      if (t === TIPUS.LANDZSAS) {
        this._cPajzs[pi] = _szinSeged.r * 1.05;
        this._cPajzs[pi + 1] = _szinSeged.g * 1.05;
        this._cPajzs[pi + 2] = _szinSeged.b * 1.05;
      }
      // BŐRSZÍN: négy árnyalat közt keverve (világosabb ↔ sötétebb, melegebb)
      _szinSeged.setHex(BOR_HEX);
      const bor = 0.82 + 0.36 * valtozat(i, 0x85ebca6b);
      const meleg = 0.97 + 0.09 * valtozat(i, 0xc2b2ae35);
      this._cFej[i * 3] = vag01(_szinSeged.r * bor * meleg);
      this._cFej[i * 3 + 1] = vag01(_szinSeged.g * bor);
      this._cFej[i * 3 + 2] = vag01(_szinSeged.b * bor * (2 - meleg));
    }

    this._mTest.instanceColor.needsUpdate = true;
    this._mFej.instanceColor.needsUpdate = true;
    this._mSisak.instanceColor.needsUpdate = true;
    this._mPajzs.instanceColor.needsUpdate = true;

    // Példányszámok. A sűrű alkatrészeké a teljes darabszám, a fegyvereké a
    // típusonkénti darabszám — a pajzsé a lándzsásoké.
    this._mTest.count = db;
    this._mFej.count = db;
    this._mSisak.count = db;
    this._mBalLab.count = db;
    this._mJobbLab.count = db;
    this._mBalKar.count = db;
    this._mJobbKar.count = db;
    for (let t = 0; t < TIPUS_DB; t++) this._mFegyver[t].count = this._tipusSzam[t];
    this._mPajzs.count = this._tipusSzam[TIPUS.LANDZSAS];

    this._ervenytelenit();
    this._tarolTick = -1;      // az interpolációs pillanatkép is elavult
  }

  /** csapat-szín × típus-keverő → lineáris rgb az instanceColor pufferbe. */
  _szinKever(csapatHex, kever, fenyeres, cel, i) {
    _szinSeged.setHex(csapatHex);
    const r0 = _szinSeged.r, g0 = _szinSeged.g, b0 = _szinSeged.b;
    _szinSeged.setHex(kever[0]);
    const w = kever[1], f = kever[2] * fenyeres;
    cel[i * 3] = vag01((r0 * (1 - w) + _szinSeged.r * w) * f);
    cel[i * 3 + 1] = vag01((g0 * (1 - w) + _szinSeged.g * w) * f);
    cel[i * 3 + 2] = vag01((b0 * (1 - w) + _szinSeged.b * w) * f);
  }

  // ── INTERPOLÁCIÓ ────────────────────────────────────────────────────────

  /**
   * Tick-váltás észlelése és a pillanatképek léptetése. A tömböket NEM
   * másoljuk egymásba: referenciát cserélünk, és csak az ÚJ állapotot töltjük
   * a simből — két lineáris `TypedArray.set()` 20 Hz-en.
   */
  _pillanat(e, db, tick) {
    if (tick === this._tarolTick) return;

    // A sim tömbjeire mutató nézetek gyorstára — enélkül tickenként négy
    // `subarray()` objektum keletkezne (kis szemét, de fölösleges).
    if (!this._nezPx || this._nezDb !== db || this._nezForras !== e.px) {
      this._nezPx = e.px.subarray(0, db);
      this._nezPy = e.py.subarray(0, db);
      this._nezSzog = e.szog.subarray(0, db);
      this._nezDb = db;
      this._nezForras = e.px;
    }

    const folytonos = (tick === this._tarolTick + 1) && this._tarolTick >= 0;
    if (folytonos) {
      // referencia-csere: a mostaniból lesz az előző
      let t = this._elozoX; this._elozoX = this._mostX; this._mostX = t;
      t = this._elozoY; this._elozoY = this._mostY; this._mostY = t;
      t = this._elozoSzog; this._elozoSzog = this._mostSzog; this._mostSzog = t;
    }
    this._mostX.set(this._nezPx);
    this._mostY.set(this._nezPy);
    this._mostSzog.set(this._nezSzog);
    if (!folytonos) {
      // ⚠️ Több tick futott egy képkocka alatt (akadás), vagy most indultunk:
      // NEM lassítunk le mesterségesen, az előző állapot a mostanira ugrik.
      this._elozoX.set(this._mostX);
      this._elozoY.set(this._mostY);
      this._elozoSzog.set(this._mostSzog);
    }
    this._tarolTick = tick;
  }

  // ── A FŐHUROK ───────────────────────────────────────────────────────────

  _rajzol(e, racs, db, tick, alfa) {
    const aTest = this._aTest, aFej = this._aFej, aSisak = this._aSisak;
    const aBalLab = this._aBalLab, aJobbLab = this._aJobbLab;
    const aBalKar = this._aBalKar, aJobbKar = this._aJobbKar;
    const aPajzs = this._aPajzs, aFegyver = this._aFegyver;
    const elozoX = this._elozoX, elozoY = this._elozoY, elozoSzog = this._elozoSzog;
    const elo = e.elo;
    const mostX = this._mostX, mostY = this._mostY, mostSzog = this._mostSzog;

    /** A SIM órája — nem `performance.now()`, tehát képkocka-független. */
    const ido = (tick + alfa) * DT;

    // ── kamera: LOD-küszöb és látómező ──────────────────────────────────────
    // A KÜSZÖB A KÉPERNYŐ-MÉRETBŐL JÖN, nem világegység-konstansból: a
    // vetítési mátrix [5] eleme perspektívánál 1/tan(fov/2), tehát egy
    // `LOD_FIGURA_MAG` magas figura képernyő-magasság-hányada `tav`
    // távolságban `LOD_FIGURA_MAG · p11 / (2·tav)`. Ezt megfordítva kapjuk a
    // két küszöb-távolságot. Így a LOD-váltás ott történik, ahol a figura
    // néhány képpont — függetlenül a látószögtől, a zoomtól és a felbontástól.
    const kam = this._aktKamera();
    let kx = 0, ky = 0, kz = 0, vagas = false;
    let reszlet2 = Infinity, tavol2 = Infinity;
    let fixSzint = -1;
    if (kam) {
      kx = kam.position.x; ky = kam.position.y; kz = kam.position.z;
      const p11 = Math.abs(kam.projectionMatrix.elements[5]) || 1;
      if (kam.isOrthographicCamera) {
        // Ortográfiánál a méret nem függ a távolságtól: EGY szint mindenkinek.
        const fr = LOD_FIGURA_MAG * p11 * 0.5;
        fixSzint = fr >= this._lod.reszletFrakcio ? 2
          : (fr >= this._lod.rejtFrakcio ? 1 : 0);
      } else {
        const k0 = LOD_FIGURA_MAG * p11 * 0.5;
        // Abszolút felülbírálás, ha a hívó tudja, hol van a köd határa: a
        // `core3d` ködje `KOD_TAVOL`-nál teljesen elnyeli a figurát, azon túl
        // fölösleges rajzolni. (`lod: { reszletTav, rejtTav }`)
        let r = this._lod.reszletTav || (k0 / this._lod.reszletFrakcio);
        if (r < this._lod.reszletMin) r = this._lod.reszletMin;
        else if (r > this._lod.reszletMax) r = this._lod.reszletMax;
        let t = this._lod.rejtTav || (k0 / this._lod.rejtFrakcio);
        if (t < r) t = r;
        else if (t > this._lod.reszletMax * 3) t = this._lod.reszletMax * 3;
        reszlet2 = r * r;
        tavol2 = t * t;
      }
      if (this._lod.frustum) {
        this._projM.multiplyMatrices(kam.projectionMatrix, kam.matrixWorldInverse);
        this._frustum.setFromProjectionMatrix(this._projM);
        vagas = true;
      }
    }

    let piszkos = false;
    let lathato = 0, kozel = 0, irt = 0;

    // ── PÉLDÁNYSZÁM-VÁGÁS ─────────────────────────────────────────────────
    // A rejtett egység nulla-skálájú mátrixot kap: a raszterizáló eldobja, de
    // a VERTEX-SHADER MÉG LEFUT rajta. Ha a kamera a pálya egyik sarkát nézi,
    // ez 1600 figura teljes csúcs-terhelése 100 látható miatt. Mivel a slot-
    // index állandó (ez kell a dirty-gyorstárhoz), tömöríteni nem tudunk — de
    // a `count`-ot le tudjuk vinni a LEGNAGYOBB HASZNÁLT slotra, és a sim a
    // csapatokat összefüggő index-tartományban hozza létre, tehát ha csak az
    // egyik sereget nézzük, ez nagyjából felezi a terhelést.
    let maxTest = -1, maxReszlet = -1;
    const maxFegyver = this._maxFegyver;
    maxFegyver[0] = -1; maxFegyver[1] = -1; maxFegyver[2] = -1; maxFegyver[3] = -1;

    for (let i = 0; i < db; i++) {
      // ── POZÍCIÓ: interpoláció az előző és a mostani tick között ──────────
      const ex = elozoX[i], ey = elozoY[i];
      const x = ex + (mostX[i] - ex) * alfa;
      const wy = ey + (mostY[i] - ey) * alfa;

      // A NÉZÉSIRÁNY körkörös: a −π/+π átfordulásnál a nyers lineáris
      // interpoláció a figurát VISSZAPÖRGETNÉ egy teljes kört.
      const esz = elozoSzog[i];
      let dsz = mostSzog[i] - esz;
      if (dsz > Math.PI) dsz -= TAU; else if (dsz < -Math.PI) dsz += TAU;
      const szog = esz + dsz * alfa;
      // A sim `szog`-ja az XY-síkon `atan2(vy, vx)`; a 3D-ben a modell +Z felé
      // néz, ezért az Y körüli forgás: irany = π/2 − szog.
      const irany = FEL_PI - szog;

      const y = this._magassag(racs, x, wy);

      // ── LÁTHATÓSÁG / LOD ────────────────────────────────────────────────
      // v0.4: a HALOTT egység nem rajzolódik. A `vis = 0` ág már létezett a
      // távolság- és frusztum-vágáshoz (nulla skálájú mátrix), tehát a halál
      // ugyanazon az úton megy ki a képből — nem kellett új mechanizmus.
      let vis = (elo && elo[i] === 0) ? 0 : 2;
      if (kam && vis !== 0) {
        if (fixSzint >= 0) {
          vis = fixSzint;
        } else {
          const ddx = x - kx, ddy = y - ky, ddz = wy - kz;
          const d2 = ddx * ddx + ddy * ddy + ddz * ddz;
          vis = d2 > tavol2 ? 0 : (d2 > reszlet2 ? 1 : 2);
        }
        if (vis !== 0 && vagas) {
          this._gomb.center.set(x, y + 0.6, wy);
          if (!this._frustum.intersectsSphere(this._gomb)) vis = 0;
        }
      }

      if (vis === 0) {
        if (this._uVis[i] !== 0) {
          this._rejtMind(i, e.tipus[i] & 3);
          this._uVis[i] = 0; this._uAnim[i] = 0;
          piszkos = true; irt++;
        }
        continue;
      }
      lathato++;
      if (vis === 2) kozel++;

      const tip = e.tipus[i] & 3;
      const allapot = e.allapot[i];

      // A példányszám-vágás felső határai — a gyorstár-találat ELŐTT, mert a
      // találat is KIRAJZOLT egységet jelent, csak nem kell újraírni.
      if (i > maxTest) maxTest = i;
      if (vis === 2) {
        if (i > maxReszlet) maxReszlet = i;
        const fj = this._fegyverIdx[i];
        if (fj > maxFegyver[tip]) maxFegyver[tip] = fj;
      }

      // ── JÁRÁS-FÁZIS A MEGTETT ÚTBÓL ─────────────────────────────────────
      // `|v|` a sim normalizálása miatt pontosan 0 vagy a típus sebessége,
      // tehát a fázis folytonos: nincs mit deszinkronizálni, és a talp nem
      // csúszik. A modulo azért kell, hogy a szinusz-tábla egész-indexe hosszú
      // meccsen se csorduljon túl.
      const vx = e.vx[i], vy = e.vy[i];
      const seb2 = vx * vx + vy * vy;
      let jarFaz = 0, jarSuly = 0;
      if (seb2 > 1e-6) {
        const seb = Math.sqrt(seb2);
        jarFaz = ((ido * seb * (Math.PI / LEPES_HOSSZ[tip])) % TAU) + this._faz0[i];
        jarSuly = 1;
      }

      // ── MOZDULAT ────────────────────────────────────────────────────────
      let labSzog = 0, karBal = KAR_ALAP_BAL[tip], karJobb = KAR_ALAP_JOBB[tip];
      let bukkan = 0, doles = 0, dol = 0, iranyPlusz = 0, oldal = 0;
      let anim = 0;

      if (jarSuly) {
        // JÁRÁS — a láb ellenfázisban, a kar keresztbe leng
        const sp = szin(jarFaz);
        const sp2 = szin(jarFaz * 0.5);
        labSzog = sp * LAB_LENGES;
        karJobb += -sp * KAR_LENGES;
        karBal += sp * KAR_LENGES;
        // FÜGGŐLEGES KIEGYENLÍTÉS: szétvetett lábbal a csípő KÖZELEBB van a
        // talajhoz (a láb átfogója rövidebb, mint a befogója). Enélkül a
        // figura lépésenként kiemelkedne a földből — és a naiv „bukkanás
        // = sin², felfelé" éppen FORDÍTOTT fázisú lenne: akkor emelné meg a
        // testet, amikor a lábak a legjobban szét vannak vetve.
        // A szorzó szándékosan kicsit kevesebb a `LAB_HOSSZ`-nál: a maradék
        // néhány milliméteres játék adja a járás rugalmasságát.
        bukkan = -LAB_HOSSZ * 0.95 * (1 - kosz(labSzog));
        dol = sp2 * 0.075;
        doles = 0.055;
        anim = 1;
      } else if (allapot === ALLAPOT.HARCOL) {
        // HARC — gyors, egységenként eltolt csapás. (A v0.1 simje még nem
        // állít HARCOL-t, de az ág készen áll a v0.2 közelharcra.)
        const w = ido * 7.5 + this._faz0[i];
        const sw = szin(w);
        karJobb = -0.55 - (0.5 - 0.5 * sw) * 1.6;
        karBal = KAR_ALAP_BAL[tip] - 0.15;
        doles = 0.16 - sw * 0.06;
        anim = 1;
      } else {
        // ── TÉTLEN ÉLET ───────────────────────────────────────────────────
        // Ritka, egységenként eltolt fázisú mocorgás. A burkoló `sin(π·s)`,
        // tehát nullából indul és nullára ér vissza: nincs ugrás, és a figura
        // nem sodródik el a helyéről. CSAK a közeli LOD-on fut — távolról
        // úgysem látszana, viszont kiütné a dirty-gyorstárból.
        if (vis === 2) {
          const per = this._mocPer[i];
          const fp = (ido + this._mocFaz[i]) % per;
          const ho = this._mocHossz[i];
          if (fp < ho) {
            const s = fp / ho;
            // burkoló: sin(π·s) — 0-ból indul, 0-ra ér vissza
            const burkolo = szin(s * Math.PI);
            const w = s * TAU;
            const sw = szin(w);
            const tp = this._mocTip[i];
            if (tp === 0) {
              // KÖRÜLNÉZ
              iranyPlusz = sw * 0.42 * burkolo;
              doles = 0.02 * burkolo;
            } else if (tp === 1) {
              // SÚLYPONT-ÁTHELYEZÉS
              dol = sw * 0.12 * burkolo;
              bukkan = -0.020 * burkolo;
              oldal = sw * 0.05 * burkolo;
              labSzog = sw * 0.10 * burkolo;
              karJobb += -0.10 * sw * burkolo;
              karBal += 0.10 * sw * burkolo;
            } else {
              // LÉP EGYET OLDALRA (és vissza)
              oldal = sw * 0.22 * burkolo;
              labSzog = sw * 0.40 * burkolo;
              dol = sw * 0.05 * burkolo;
              karJobb += -sw * 0.13 * burkolo;
              karBal += sw * 0.13 * burkolo;
            }
            anim = 1;
          }
        }
      }

      // ── DIRTY-GYORSTÁR ──────────────────────────────────────────────────
      // Az álló, nem mocorgó figura MINDEN alkatrésze változatlan — sem a
      // mátrixot, sem a lejtő-mintavételt nem kell újraszámolni. Ez a
      // legfontosabb takarékosság: egy védekező sereg képkockánként nulla
      // mátrixot ír. (Álláskor `elozo === most`, tehát az interpolált x/y
      // BITRE azonos képkockáról képkockára — a lebegőpontos egyezés itt
      // tényleg fennáll, nem véletlen.)
      if (anim === 0 && this._uAnim[i] === 0 && this._uVis[i] === vis
        && this._uX[i] === x && this._uY[i] === wy && this._uSzog[i] === irany) {
        continue;
      }

      // ── LEJTŐ-IGAZÍTÁS ──────────────────────────────────────────────────
      // A figura kövesse a domboldalt. Négy terep-mintavétel a saját
      // irányában; CSAK a közeli LOD-on, mert távolról a dőlés nem olvasható,
      // a négy minta viszont a legdrágább rész az egész hurokban.
      if (this._lejto && vis === 2) {
        const si = szin(szog), co = kosz(szog);
        const hE = this._magassag(racs, x + co * 0.30, wy + si * 0.30);
        const hH = this._magassag(racs, x - co * 0.30, wy - si * 0.30);
        const hJ = this._magassag(racs, x + si * 0.22, wy - co * 0.22);
        const hB = this._magassag(racs, x - si * 0.22, wy + co * 0.22);
        let sp = Math.atan2(hE - hH, 0.60) * 0.80;
        let sr = Math.atan2(hJ - hB, 0.44) * 0.60;
        if (sp > 0.55) sp = 0.55; else if (sp < -0.55) sp = -0.55;
        if (sr > 0.45) sr = 0.45; else if (sr < -0.45) sr = -0.45;
        doles += sp; dol += sr;
      }

      // ── TEST-MÁTRIX ─────────────────────────────────────────────────────
      // Az oldalirányú kitérés MERŐLEGES a nézésirányra; a burkoló nullára ér
      // vissza, tehát a figura nem sodródik el. A magasság-mintát szándékosan
      // ELŐTTE vettük — a pár centis kitérésért nem mintavételezünk újra.
      let px = x, pz = wy;
      if (oldal !== 0) {
        // a haladási irány (cos szog, sin szog) MERŐLEGESE: (sin, −cos)
        px += szin(szog) * oldal;
        pz -= kosz(szog) * oldal;
      }
      const my = this._meretY[i], mxz = this._meretXZ[i];
      testMatrix(aTest, i, px, y + bukkan, pz,
        doles, irany + iranyPlusz, dol, mxz, my, mxz);
      irt++;

      if (vis === 2) {
        const bo = i * 16;
        // FEJ és SISAK — az ízület a fej közepe, forgatás nincs (a sisak
        // mérete típusonként MÁS, ezt a skála-paraméterek adják).
        reszMatrix(aFej, i, aTest, bo, 0, FEJ_Y, 0, 1, 0, 1, 1, 1);
        const sm = SISAK_MERET[tip];
        reszMatrix(aSisak, i, aTest, bo, 0, FEJ_Y, 0, 1, 0, sm, sm, sm);

        // LÁBAK — a csípő körül, ELLENFÁZISBAN
        const lc = kosz(labSzog), ls = szin(labSzog);
        reszMatrix(aBalLab, i, aTest, bo, -CSIPO_X, CSIPO_Y, 0, lc, ls, 1, 1, 1);
        reszMatrix(aJobbLab, i, aTest, bo, CSIPO_X, CSIPO_Y, 0, lc, -ls, 1, 1, 1);

        // KAROK — külön szögön
        const bc = kosz(karBal), bs = szin(karBal);
        const jc = kosz(karJobb), js = szin(karJobb);
        reszMatrix(aBalKar, i, aTest, bo, -VALL_X, VALL_Y, 0, bc, bs, 1, 1, 1);
        reszMatrix(aJobbKar, i, aTest, bo, VALL_X, VALL_Y, 0, jc, js, 1, 1, 1);

        // FEGYVER — a JOBB VÁLL ízületén, a kar SZÖGÉVEL: együtt mozog vele.
        const fi = this._fegyverIdx[i];
        reszMatrix(aFegyver[tip], fi, aTest, bo, VALL_X, VALL_Y, 0, jc, js, 1, 1, 1);
        // PAJZS — a BAL váll ízületén, a bal kar szögével.
        if (tip === TIPUS.LANDZSAS) {
          reszMatrix(aPajzs, fi, aTest, bo, -VALL_X, VALL_Y, 0, bc, bs, 1, 1, 1);
        }
      } else if (this._uVis[i] !== 1) {
        // TÁVOLI LOD: csak a test sziluettje marad. A rejtést CSAK a
        // szintváltás képkockáján végezzük — egy távoli, MOZGÓ figura így
        // képkockánként EGYETLEN mátrixot ír, nem nyolcat.
        this._rejtReszek(i, tip);
      }

      this._uX[i] = x; this._uY[i] = wy; this._uSzog[i] = irany;
      this._uVis[i] = vis; this._uAnim[i] = anim;
      piszkos = true;
    }

    // ── PÉLDÁNYSZÁMOK ─────────────────────────────────────────────────────
    const nTest = maxTest + 1, nReszlet = maxReszlet + 1;
    this._mTest.count = nTest;
    this._mFej.count = nReszlet;
    this._mSisak.count = nReszlet;
    this._mBalLab.count = nReszlet;
    this._mJobbLab.count = nReszlet;
    this._mBalKar.count = nReszlet;
    this._mJobbKar.count = nReszlet;
    for (let t = 0; t < TIPUS_DB; t++) this._mFegyver[t].count = maxFegyver[t] + 1;
    this._mPajzs.count = maxFegyver[TIPUS.LANDZSAS] + 1;

    // ── FELTÖLTÉS ─────────────────────────────────────────────────────────
    // Egyetlen `needsUpdate` képkockánként meshenként; ha SENKI nem mozdult
    // (teljesen álló sereg, mozdulatlan kamera), a GPU-ra semmi nem megy fel.
    if (piszkos) {
      for (let k = 0; k < this._meshek.length; k++) {
        this._meshek[k].instanceMatrix.needsUpdate = true;
      }
    }

    this._statKocka++;
    this._statIrt += irt;
    this._statLathato += lathato;
    this._statKozel += kozel;
  }

  // ── SEGÉDEK (példány-szint) ─────────────────────────────────────────────

  /** A finom alkatrészek elrejtése (távoli LOD). A test marad. */
  _rejtReszek(i, tip) {
    rejtMatrix(this._aFej, i);
    rejtMatrix(this._aSisak, i);
    rejtMatrix(this._aBalLab, i);
    rejtMatrix(this._aJobbLab, i);
    rejtMatrix(this._aBalKar, i);
    rejtMatrix(this._aJobbKar, i);
    const fi = this._fegyverIdx[i];
    rejtMatrix(this._aFegyver[tip], fi);
    if (tip === TIPUS.LANDZSAS) rejtMatrix(this._aPajzs, fi);
  }

  /** A teljes figura elrejtése (látómezőn kívül / túl messze). */
  _rejtMind(i, tip) {
    rejtMatrix(this._aTest, i);
    this._rejtReszek(i, tip);
  }

  /**
   * Terep-magasság világkoordinátára — ezen áll a figura TALPA.
   *
   * Alapból BILINEÁRIS mintavétel a CSÚCS-magasságokból (`racs.magassag`),
   * mert a terep-háló is abból épül: így a talp pontosan a felszínen van, nem
   * a cella-középpont magasságán (ami cellánként lépcsőzne). A cella KÖZEPÉN
   * ez azonos a `racs.magassagPont()`-tal — az a négy sarok átlaga.
   */
  _magassag(racs, x, y) {
    if (!racs) return 0;
    if (!this._simaMagassag) return racs.magassagPont(x, y);
    const n = racs.n;
    const M = racs.magassag;
    if (!M) return racs.magassagPont(x, y);
    let gx = x, gy = y;
    if (gx < 0) gx = 0; else if (gx > n) gx = n;
    if (gy < 0) gy = 0; else if (gy > n) gy = n;
    let x0 = gx | 0, y0 = gy | 0;
    if (x0 >= n) x0 = n - 1;
    if (y0 >= n) y0 = n - 1;
    const fx = gx - x0, fy = gy - y0;
    const s = n + 1;
    const o = y0 * s + x0;
    const a = M[o], b = M[o + 1], c = M[o + s], d = M[o + s + 1];
    const f = a + (b - a) * fx;
    const g = c + (d - c) * fx;
    return f + (g - f) * fy;
  }

  /**
   * NYERS kamera egy tetszőleges „kamera-szerű" objektumból. A `camera3d`
   * rétegben a `Kamera3D` burkoló a `.objektum` mezőben tartja a valódi
   * `PerspectiveCamera`-t, a `core3d` `feloldKamera()`-ja pedig `.cam`-et is
   * elfogad. Szándékosan NEM importáljuk a `core3d`-t: ez a réteg önállóan is
   * használható maradjon, és a párhuzamos munkában ne kössük magunkat egy
   * másik agent épp készülő fájljának API-jához.
   */
  _feloldKamera(x) {
    if (!x) return null;
    if (x.isCamera) return x;
    if (x.objektum && x.objektum.isCamera) return x.objektum;
    if (x.kamera && x.kamera.isCamera) return x.kamera;
    if (x.cam && x.cam.isCamera) return x.cam;
    return null;
  }

  /** A kamera megszerzése (konstruktor-opció → getter → jelenet → globális). */
  _aktKamera() {
    if (this._kamera && this._kamera.isCamera) return this._kamera;
    let k = this._feloldKamera(this._kamera);
    if (k) { this._kamera = k; return k; }
    if (this._kameraFv) {
      k = this._feloldKamera(this._kameraFv());
      if (k) { this._kamera = k; return k; }
    }
    const o = this._op;
    k = this._feloldKamera(o.kamera3d) || this._feloldKamera(o.mag);
    if (k) { this._kamera = k; return k; }
    // A `core3d` réteg-független kamera-jegyzéke — ezt tölti a `Kamera3D`.
    if (mag3d && typeof mag3d.aktivKamera === 'function') {
      k = this._feloldKamera(mag3d.aktivKamera());
      if (k) { this._kamera = k; return k; }
    }
    if (this._scene) {
      k = this._scene.getObjectByProperty('isCamera', true);
      if (k) { this._kamera = k; return k; }
    }
    const g = (typeof globalThis !== 'undefined') ? globalThis : null;
    if (g && g.__aoc) {
      k = this._feloldKamera(g.__aoc.kamera) || this._feloldKamera(g.__aoc.kamera3d);
      if (k) { this._kamera = k; return k; }
    }
    if (!this._kameraFigyelmeztetve) {
      this._kameraFigyelmeztetve = true;
      // Nem hiba, csak drága: kamera nélkül NINCS LOD és nincs látómező-vágás,
      // tehát minden egység teljes részletességgel megy ki.
      if (typeof console !== 'undefined') {
        console.warn('[units3d] nincs kamera — LOD és látómező-vágás kikapcsolva '
          + '(add át `opciok.kamera`-ban vagy állítsd a `.kamera` mezőt)');
      }
    }
    return null;
  }

  /** Összes kirajzolt példány (mérésre). */
  _peldanySzam() {
    let n = 0;
    for (let k = 0; k < this._meshek.length; k++) n += this._meshek[k].count;
    return n;
  }
}

// A `main.js`-t másik réteg írja, ezért több néven is elérhető: a szerződés
// csak a metódusokat rögzíti, a nevet nem.
export { Egysegek3D as Units3D };
export default Egysegek3D;
