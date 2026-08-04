// AGE OF THE CRYSTALS — NAPSZAK-CIKLUS: a világítás MENETRENDJE (v0.16).
//
// Ez a fájl SEMMIT nem világít meg. Egyetlen dolga, hogy a `sim.tick`-ből
// kiszámolja, MILYEN a fény ebben a pillanatban: merről süt, milyen színű,
// milyen erős, milyen az ég és a köd. A `core3d.js` ezt ülteti át `THREE`
// fényekbe, a `fenyek_egbolt.js` ugyanezt a színvilágot rajzolja az égre.
//
// ── MIÉRT NINCS BENNE `three`, ÉS MIÉRT SZÁMÍT EZ ─────────────────────────
// Mert így NODE-BAN FUT. A projekt legdrágább tanulsága az, hogy a zöld kapu
// nem működés-kapu — egy GPU nélküli gépen a világítást SEMMILYEN szonda nem
// fogja meg. Egy tiszta-matek modult viszont ki lehet mintavételezni egy
// napra, és meg lehet nézni számokban, hogy a nap átmegy-e a horizonton
// ugrás nélkül, hogy a köd színe egyezik-e az égbolt aljával, és hogy az
// éjszaka nem lesz-e vaksötét. Amit nem tudok megnézni, azt legalább ki tudom
// számolni.
//
// ── MIÉRT A `sim.tick`-BŐL, ÉS MIÉRT NEM A `performance.now()`-BÓL ────────
// A `sim.tick` determinisztikus, tehát a napszak INGYEN desync-mentes: a v0.8
// lockstepjében mindkét gépen ugyanaz a fény esik ugyanarra a csatára, anélkül
// hogy a napszakot szinkronizálni kellene. Ez az egyetlen ok — a render sosem
// ír vissza a simbe, és `Math.random()` sincs sehol ebben a fájlban.
//
// ── A NAP PÁLYÁJA: MIÉRT NEM MEGY A ZENITEN ÁT ────────────────────────────
// Ha a nap délben pontosan fölöttünk állna, az árnyékok eltűnnének a tárgyak
// alól, és a délelőtt/délután pont a legszebb részét (a hosszú, ferde árnyék)
// veszítenénk el. A pálya ezért 58°-os maximum-magasságon tetőzik: még dél is
// ad annyi ferdeséget, hogy a házaknak és a fáknak legyen vetett árnyékuk.
//
// ── AZ ÉJSZAKA NEM SÖTÉT, HANEM HIDEG ─────────────────────────────────────
// Egy RTS-ben a vaksötét éjszaka nem hangulat, hanem játszhatatlanság: a
// játékos nem látja a seregét. A holdfény ezért nem „nagyon kevés napfény",
// hanem MÁS SZÍNŰ fény — hideg kék irányfény és felhúzott, kékes környezeti
// alap. A szem a színkontrasztból olvassa ki, hogy éjjel van, nem a
// sötétségből.
//
// ── A HORIZONT-ÁTMENET: EGY IRÁNYFÉNY, KÉT ÉGITEST ────────────────────────
// A hold pontosan a nap ELLENPONTJA, tehát ugyanaz az egy irányfény szolgálja
// ki mindkettőt: napnyugtakor az irány 180°-ot fordul. Ez ingyen van (nem lesz
// második fény, tehát nem lesz drágább egyetlen fragment-shader sem), viszont
// a fordulás pillanatában UGRANA az árnyék iránya. Ezért az irányfény
// erőssége a horizont ±0,05-ös sávjában analitikusan nullára fut: mire a
// fordulás megtörténik, nincs mit fordítani. A `_ero()` görbéje az egyetlen
// oka, hogy a napnyugta nem villan.
//
// ── MIÉRT VAN ITT EGY LAMBERT-KÉPLET IS (v0.16/2) ─────────────────────────
// A `core3d.js` azon a döntésen áll, hogy NINCS tónus-leképezés: egyetlen
// görbe sem szedheti szét a jelenetet két családra. Egy ilyen döntésnek két
// ára van, és mindkettőt SZÁMBAN kell tudni:
//
//   1. lent: nem fullad-e feketébe az éjszakai terep,
//   2. fent: nem ég-e ki délben a világos felület (görbe nélkül nincs
//      csúcs-lekerekítés, ami 1,0 fölött megfogná).
//
// Az előző kör fejléce hivatkozott is egy ilyen vizsgálatra („a ciklus
// szondája ellenőrzi…") — csak épp SEHOL NEM VOLT MEG. Pontosan az a fajta
// hivatkozott, de nem létező kapu, amiből ez a projekt már többször ivott.
// Most itt van, és node-ban fut: `lambertKimenet()` egy diffúz lap lineáris
// kimenetét adja, `napiMerleg()` végigjátssza vele az egész napot.
//
// A képlet NEM közelítés, hanem a `three` r170 Lambert-útvonala:
//   irányfény:  dotNL · szín · erő            (`RE_Direct_Lambert`)
//   féggömb:    szín · erő                    (felfelé néző lapra a súly 1)
//   BRDF:       · albedó / π                  (`BRDF_Lambert`)
// Ha valaki a `three`-t frissíti és ez a három sor változik, ITT kell utána
// menni — különben a szám csendben elszakad attól, ami a képernyőn van.
//
// ── HASZNÁLAT ─────────────────────────────────────────────────────────────
//   const all = ujNapAllapot();       // EGYSZER, betöltéskor
//   napAllapot(sim.tick, all);        // képkockánként — NULLA allokáció
//
// A `napAllapot()` mindig UGYANABBA az objektumba ír. Nincs visszaadott új
// objektum, nincs tömb, nincs string — a képkockánkénti hívás szemétmentes.
// A `lambertKimenet()` ugyanígy kimenő tömbbe ír; a `napiMerleg()` viszont
// DIAGNOSZTIKA, nem képkocka-útvonal, ott az allokáció megengedett.

/** Egy teljes nap hossza tickben. 20 Hz mellett 12000 tick = 10 valós perc. */
export const NAPHOSSZ_TICK = 12000;

/**
 * Hol áll a nap a 0. tickben — 8:30-nál, délelőtt.
 *
 * Nem esztétikai szeszély: a `tools/kep.mjs` és az FPS-szonda a 0. tick körül
 * kapja el a képet. Ha a ciklus éjfélkor indulna, minden QA-képernyőkép egy
 * sötét pályát mutatna, és a látvány-regressziót senki nem venné észre rajta.
 */
export const KEZDO_FAZIS = 8.5 / 24;

/** A nap legmagasabb állása (fok). Lásd a fejléc „zenit" szakaszát. */
const ELEV_MAX_FOK = 58;
const SIN_ELEV_MAX = Math.sin((ELEV_MAX_FOK * Math.PI) / 180);

/** A horizont-sáv fél-szélessége, amiben az irányfény nullára fut. */
const HORIZONT_SAV = 0.06;

const TAU = Math.PI * 2;

export const NAPSZAK = { EJ: 0, HAJNAL: 1, DELELOTT: 2, DEL: 3, DELUTAN: 4, ALKONY: 5 };

/** Emberi nevek — HUD-hoz és a szonda-jelentéshez. */
export const NAPSZAK_NEV = ['éj', 'hajnal', 'délelőtt', 'dél', 'délután', 'alkony'];

// ── A SZÍN-MENETREND ───────────────────────────────────────────────────────
// A kulcsképek NEM az órához, hanem a NAP MAGASSÁGÁHOZ (a magasság szinuszához)
// vannak kötve. Ez azért fontos, mert a magasság a horizont közelében lassan,
// délben gyorsan változik — órához kötve az aranyóra egy pillanat alatt
// átsuhanna, magassághoz kötve viszont pont annyi ideig tart, ameddig a nap
// tényleg alacsonyan jár.
//
// A számok LINEÁRIS térben értendők (a `THREE.ColorManagement` sRGB-ből ide
// konvertálja a hex-színeket, mi eleve itt dolgozunk).
//
//   mag, napR,G,B, napEro, égR,G,B, földR,G,B, égEro, zenitR,G,B, horR,G,B, csillag
const MENETREND = [
  [-1.00, 0.42, 0.52, 0.95, 0.42, 0.13, 0.18, 0.34, 0.06, 0.06, 0.09, 0.62, 0.012, 0.020, 0.055, 0.050, 0.075, 0.150, 1.00],
  [-0.25, 0.45, 0.55, 0.98, 0.40, 0.14, 0.19, 0.36, 0.06, 0.06, 0.10, 0.64, 0.020, 0.032, 0.080, 0.080, 0.100, 0.190, 1.00],
  [-0.06, 0.75, 0.55, 0.62, 0.30, 0.28, 0.30, 0.46, 0.13, 0.11, 0.11, 0.72, 0.060, 0.090, 0.200, 0.300, 0.240, 0.340, 0.45],
  [0.02, 1.00, 0.46, 0.24, 1.10, 0.42, 0.42, 0.56, 0.20, 0.14, 0.11, 0.80, 0.110, 0.170, 0.350, 0.720, 0.420, 0.300, 0.10],
  [0.15, 1.00, 0.70, 0.42, 1.75, 0.55, 0.60, 0.76, 0.28, 0.21, 0.15, 0.90, 0.150, 0.260, 0.520, 0.850, 0.620, 0.440, 0.00],
  [0.45, 1.00, 0.92, 0.80, 2.15, 0.62, 0.74, 0.92, 0.34, 0.29, 0.21, 0.98, 0.170, 0.340, 0.680, 0.660, 0.780, 0.900, 0.00],
  [1.00, 1.00, 0.97, 0.90, 2.25, 0.66, 0.79, 0.96, 0.36, 0.32, 0.24, 1.00, 0.140, 0.320, 0.720, 0.600, 0.750, 0.920, 0.00],
];

/** @param {number} a @param {number} b @param {number} t */
function keverd(a, b, t) { return a + (b - a) * t; }

/** Sima 0→1 átmenet. Az `x` a két él közé vágva. */
function simal(e0, e1, x) {
  let t = (x - e0) / (e1 - e0);
  if (t < 0) t = 0; else if (t > 1) t = 1;
  return t * t * (3 - 2 * t);
}

/**
 * Egy képkockányi nap-állapot tárolója. EGYSZER hozd létre, aztán csak töltsd.
 * Minden mező szám — nincs `THREE.Color`, nincs `Vector3`, hogy a modul
 * node-ban is futtatható maradjon.
 */
export function ujNapAllapot() {
  return {
    /** A napon belüli fázis [0,1). 0 = éjfél, 0,5 = dél. */
    fazis: 0,
    /** Ugyanaz órában [0,24) — csak kiírásra. */
    ora: 0,
    /** `NAPSZAK.*` */
    napszak: NAPSZAK.DELELOTT,
    /** A NAP magasságának szinusza [-1,1]. Negatív = a nap lement. */
    magassag: 0,
    /** 0 = teljes éj, 1 = teljes nappal (lágy átmenettel). */
    nappal: 1,
    /** Éjjel-e (a hold világít). */
    ej: false,

    // Az irányfény iránya: a FÉNYFORRÁS FELÉ mutat, egységhosszú.
    // (`THREE.DirectionalLight` a `position - target` irányból süt, tehát a
    // fényt ide kell TENNI, nem ebbe az irányba fordítani.)
    irX: 0, irY: 1, irZ: 0,

    napR: 1, napG: 1, napB: 1, napEro: 2.2,
    egR: 0.6, egG: 0.7, egB: 0.9,
    foldR: 0.3, foldG: 0.27, foldB: 0.2, egEro: 1,

    zenitR: 0.15, zenitG: 0.3, zenitB: 0.7,
    horizontR: 0.6, horizontG: 0.75, horizontB: 0.9,

    /** A köd és a háttér színe — SZÁNDÉKOSAN azonos az égbolt aljával. */
    kodR: 0.6, kodG: 0.75, kodB: 0.9,

    /** Csillagok erőssége [0,1] — nappal 0, tehát a shader elágazása kiugrik. */
    csillag: 0,
    /** A korong (nap vagy hold) mérete radiánban és fénye. */
    korongMeret: 0.016, korongEro: 1,
    korongR: 1, korongG: 0.95, korongB: 0.85,
  };
}

/**
 * A horizont-átmenet burkolója. A fejléc „egy irányfény, két égitest"
 * szakasza magyarázza, miért nem lehet ezt a táblázatra bízni.
 * @param {number} mag
 */
function _atmenet(mag) {
  // NÉGYZETRE emelt burkoló, nem sima `smoothstep`. Mérve: sima átmenettel a
  // 180°-os irányfordulás pillanatában az irányfény ereje még 0,023 volt —
  // éjjeli környezeti fény mellett ez a fordulás LÁTSZIK, egy villanásnyi
  // árnyék-átcsapásként. A négyzet ugyanezen a ponton 0,0005-re nyomja, tehát
  // mire fordul, tényleg nincs mit fordítani. A sáv szélét (`HORIZONT_SAV`) ez
  // nem mozdítja el, csak a nulla közelében lapít.
  const s = simal(0, HORIZONT_SAV, mag < 0 ? -mag : mag);
  return s * s;
}

/**
 * A `ki` feltöltése a `tick`-hez tartozó fénnyel.
 *
 * @param {number} tick a sim tickje (egész, monoton)
 * @param {ReturnType<typeof ujNapAllapot>} ki az újrahasznált tároló
 * @param {number} [naphossz] tickben; a szonda ezzel gyorsíthatja a napot
 * @returns {ReturnType<typeof ujNapAllapot>} ugyanaz a `ki`
 */
export function napAllapot(tick, ki, naphossz = NAPHOSSZ_TICK) {
  let f = (tick / naphossz + KEZDO_FAZIS) % 1;
  if (f < 0) f += 1;
  ki.fazis = f;
  ki.ora = f * 24;

  // A nap magassága. `f = 0,25` napkelte, `0,5` dél, `0,75` napnyugta.
  const mag = Math.sin((f - 0.25) * TAU);
  ki.magassag = mag;
  ki.nappal = simal(-0.10, 0.12, mag);
  ki.ej = mag < 0;

  // ── IRÁNY ───────────────────────────────────────────────────────────────
  // A magasság szinuszát skálázzuk, hogy a nap ne érje el a zenitet; a
  // vízszintes komponens ebből következik (egységvektor), tehát nincs szükség
  // se `asin`-ra, se második `cos`-ra.
  let y = mag * SIN_ELEV_MAX;
  let vsz = Math.sqrt(Math.max(0, 1 - y * y));
  const azim = Math.PI * 0.5 + (f - 0.25) * TAU;
  let x = vsz * Math.sin(azim);
  let z = vsz * Math.cos(azim);
  // Éjjel a HOLD világít: a nap ellenpontja. Ugyanaz az egy irányfény.
  if (mag < 0) { x = -x; y = -y; z = -z; }
  ki.irX = x; ki.irY = y; ki.irZ = z;

  // ── SZÍNEK a menetrendből ───────────────────────────────────────────────
  let i = 0;
  while (i < MENETREND.length - 2 && mag > MENETREND[i + 1][0]) i++;
  const a = MENETREND[i], b = MENETREND[i + 1];
  const t = simal(a[0], b[0], mag);

  ki.napR = keverd(a[1], b[1], t);
  ki.napG = keverd(a[2], b[2], t);
  ki.napB = keverd(a[3], b[3], t);
  ki.napEro = keverd(a[4], b[4], t) * _atmenet(mag);

  ki.egR = keverd(a[5], b[5], t);
  ki.egG = keverd(a[6], b[6], t);
  ki.egB = keverd(a[7], b[7], t);
  ki.foldR = keverd(a[8], b[8], t);
  ki.foldG = keverd(a[9], b[9], t);
  ki.foldB = keverd(a[10], b[10], t);
  ki.egEro = keverd(a[11], b[11], t);

  ki.zenitR = keverd(a[12], b[12], t);
  ki.zenitG = keverd(a[13], b[13], t);
  ki.zenitB = keverd(a[14], b[14], t);
  ki.horizontR = keverd(a[15], b[15], t);
  ki.horizontG = keverd(a[16], b[16], t);
  ki.horizontB = keverd(a[17], b[17], t);

  // A köd MINDIG az égbolt alja. Ha a kettő elcsúszik, a pálya széle egy
  // látható színcsíkkal ér véget — ez a legolcsóbban elrontható részlet az
  // egész rétegben, ezért nincs is külön hangolható.
  ki.kodR = ki.horizontR; ki.kodG = ki.horizontG; ki.kodB = ki.horizontB;

  ki.csillag = keverd(a[18], b[18], t);

  // ── A KORONG ────────────────────────────────────────────────────────────
  // Nappal a nap: nagy, meleg, glóriás. Éjjel a hold: kisebb, hideg, glória
  // nélkül. Mindkettő a FÉNY IRÁNYÁBAN áll, tehát a képernyőn látszik, honnan
  // jön az árnyék — ez adja a jelenetnek a térbeli olvashatóságát.
  if (mag < 0) {
    ki.korongMeret = 0.011;
    ki.korongEro = 0.85 * simal(-0.02, -0.14, mag);
    ki.korongR = 0.88; ki.korongG = 0.92; ki.korongB = 1.0;
  } else {
    ki.korongMeret = 0.018;
    ki.korongEro = 1;
    ki.korongR = ki.napR; ki.korongG = ki.napG; ki.korongB = ki.napB;
  }

  // ── NAPSZAK-CÍMKE ───────────────────────────────────────────────────────
  const delelott = f < 0.5;
  if (mag < -0.08) ki.napszak = NAPSZAK.EJ;
  else if (mag < 0.22) ki.napszak = delelott ? NAPSZAK.HAJNAL : NAPSZAK.ALKONY;
  else if (mag < 0.85) ki.napszak = delelott ? NAPSZAK.DELELOTT : NAPSZAK.DELUTAN;
  else ki.napszak = NAPSZAK.DEL;

  return ki;
}

// ── A KIMENET MÉRTÉKEGYSÉGE ────────────────────────────────────────────────
// Idáig minden szám LINEÁRIS. A képernyőre viszont sRGB kerül, és a két tér
// között pont a sötét tartományban a legnagyobb a különbség — 0,0146 lineáris
// az sRGB 32/255. Aki a menetrendet lineárisan nézi, azt hiszi, vaksötét van;
// aki sRGB-ben, az látja, hogy nem. Ezért van itt mindkét irány.

/** Lineáris → sRGB [0,1]. Ugyanaz a görbe, amit a `colorspace_fragment` alkalmaz. */
export function linSzrgb(x) {
  if (!(x > 0)) return 0;
  if (x >= 1) return 1;
  return x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
}

/** sRGB → lineáris [0,1]. A hex-palettákból ezzel lesz albedó. */
export function szrgbLin(x) {
  if (!(x > 0)) return 0;
  if (x >= 1) return 1;
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}

/** Nyolcbites képernyő-érték egy lineáris számból — ebben beszél a hibajelentés. */
export function bajt(x) { return Math.round(linSzrgb(x) * 255); }

/** 1/π — a `BRDF_Lambert` osztója. Konstans, hogy a képkocka-úton se legyen osztás. */
const RECIPROK_PI = 0.3183098861837907;

/**
 * Egy DIFFÚZ (Lambert) lap lineáris kimenete adott nap-állapotban.
 *
 * A `dotNL` alapértelmezése a FELFELÉ néző lap esete (`irY`), mert a hibát,
 * ami ezt a függvényt kikényszerítette, a TEREP mutatta meg — és a féggömb-
 * fény súlya is pontosan erre a normálisra 1, tehát a képlet itt zárt alakú.
 *
 * @param {ReturnType<typeof ujNapAllapot>} all
 * @param {number} albR lineáris albedó (a `szrgbLin` adja hexből)
 * @param {number} albG
 * @param {number} albB
 * @param {Float64Array|number[]} ki 3 elemű kimenet — NEM allokálunk
 * @param {number} [dotNL] ha megadod, ezzel számol az irányfény
 * @returns {Float64Array|number[]} ugyanaz a `ki`
 */
export function lambertKimenet(all, albR, albG, albB, ki, dotNL) {
  let d = dotNL === undefined ? all.irY : dotNL;
  if (d < 0) d = 0;
  ki[0] = albR * (all.napR * all.napEro * d + all.egR * all.egEro) * RECIPROK_PI;
  ki[1] = albG * (all.napG * all.napEro * d + all.egG * all.egEro) * RECIPROK_PI;
  ki[2] = albB * (all.napB * all.napEro * d + all.egB * all.egEro) * RECIPROK_PI;
  return ki;
}

/**
 * A NAP VÉGIGJÁTSZÁSA egy albedóval. Ez az a szám, amivel a „nincs tónus-
 * leképezés" döntés GPU nélkül is megvédhető vagy megbuktatható:
 *
 *   `legvilagosabb` ≥ 1  →  görbe nélkül KIÉG (nincs mit lekerekíteni),
 *   `legsotetebb` bájtja 0 →  az éjszaka tényleg vaksötét.
 *
 * A `dotNL = 1` a legrosszabb eset (a lap pont a napnak fordul); a terep
 * valós esete `undefined`, azaz a felfelé néző lap.
 *
 * ⚠️ DIAGNOSZTIKA, nem képkocka-útvonal: allokál, és végigmintázza a napot.
 *
 * @param {number} albR lineáris albedó
 * @param {number} albG
 * @param {number} albB
 * @param {{lepes?:number, dotNL?:number}} [opciok]
 */
export function napiMerleg(albR, albG, albB, opciok = {}) {
  const lepes = opciok.lepes || 480;
  const all = ujNapAllapot();
  const ki = [0, 0, 0];
  let legsotetebb = Infinity, legvilagosabb = -Infinity;
  let sotetOra = 0, vilagosOra = 0;
  for (let i = 0; i < lepes; i++) {
    napAllapot((i / lepes) * NAPHOSSZ_TICK - KEZDO_FAZIS * NAPHOSSZ_TICK, all);
    lambertKimenet(all, albR, albG, albB, ki, opciok.dotNL);
    const m = ki[0] > ki[1] ? (ki[0] > ki[2] ? ki[0] : ki[2]) : (ki[1] > ki[2] ? ki[1] : ki[2]);
    if (m < legsotetebb) { legsotetebb = m; sotetOra = all.ora; }
    if (m > legvilagosabb) { legvilagosabb = m; vilagosOra = all.ora; }
  }
  return {
    legsotetebb, legvilagosabb, sotetOra, vilagosOra,
    /** A képernyőn látott legsötétebb és legfényesebb csatorna-érték. */
    sotetBajt: bajt(legsotetebb), vilagosBajt: bajt(legvilagosabb),
    /** Mennyi hely maradt a kiégésig. Negatív = görbe nélkül levágódik. */
    tartalek: 1 - legvilagosabb,
  };
}
