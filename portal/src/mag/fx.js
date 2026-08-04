// PORTAL HUB TYCOON — DETERMINIZMUS-BIZTOS MATEK.
//
// ── MIÉRT VAN EZ A FÁJL ───────────────────────────────────────────────────
// Egy tycoonban nincs lockstep multiplayer, tehát elsőre úgy tűnhet, hogy a
// bitre azonos matek fölösleges luxus. Nem az, két okból:
//
//  1. MENTÉS ÉS VISSZAJÁTSZÁS. A világ állapotát nem lehet ezer utas minden
//     mezőjével elmenteni; a mentés a seed + a parancsnapló. Ha ugyanaz a
//     napló másképp fut le két gépen (vagy ugyanazon a gépen két Chrome-
//     verzióval), a betöltött állomás nem az lesz, amit a játékos otthagyott.
//  2. HIBAKERESÉS. Egy tycoon hibái statisztikaiak: „a 40. percben beragad a
//     forgalom". Ilyet csak akkor lehet vadászni, ha a 40. perc pontosan
//     újrajátszható. A `tools/det_szonda.mjs` pont ezt méri.
//
// A JavaScript `+ - * /` és `Math.sqrt` az IEEE-754 szerint helyesen
// kerekített, tehát motorfüggetlen. A TRANSZCENDENS függvények viszont nem:
// a `Math.sin`, `cos`, `atan2`, `exp`, `pow`, `log` pontosságát a szabvány
// nyitva hagyja. Ezért a sim SEHOL nem hívhatja őket — helyettük ezek a
// csak alapműveletekből épített közelítések állnak.
//
// ── MI TILOS A `portal/src/sim/` ALATT ────────────────────────────────────
//   Math.sin, cos, tan, asin, acos, atan, atan2, exp, log, pow, hypot, cbrt
//   Math.random          (helyette: mag/rng.js seedelt generátora)
//   Date.now, performance.now   (a sim csak tick-számot ismer)
//   three / DOM / window        (a sim nem tud a képernyőről)
//   for…in és Object.keys sorrendfüggő logikában
//
// ⚠️ A lookup-tábla NEM megoldás, ha `Math.sin`-nel töltöd fel: akkor maga a
// tábla lesz motorfüggő, és ugyanoda jutunk.

export const TAU = 6.283185307179586;
export const PI = 3.141592653589793;
export const HALF_PI = 1.5707963267948966;

// A sin Taylor-együtthatói 1/(2k+1)! alakban, x¹¹-ig. A [-π/2, π/2]
// tartományon a maradéktag ≈ 1,1·10⁻¹¹ — a játék tűrésén belül, és ami
// fontosabb: minden gépen ugyanannyi.
const S3 = -0.16666666666666666;
const S5 = 0.008333333333333333;
const S7 = -1.984126984126984e-4;
const S9 = 2.7557319223985893e-6;
const S11 = -2.505210838544172e-8;

/**
 * Szinusz tetszőleges szögre.
 * @param {number} x radián
 * @returns {number}
 */
export function fxSin(x) {
  // Tartomány-redukció [-π, π]-re. A `Math.floor` egzakt, a szorzás és a
  // kivonás IEEE-helyes — ez a lépés bitre reprodukálható.
  let t = x * (1 / TAU);
  t = t - Math.floor(t + 0.5);
  let a = t * TAU;
  // Tükrözés [-π/2, π/2]-re, mert a polinom ott a legpontosabb.
  if (a > HALF_PI) a = PI - a;
  else if (a < -HALF_PI) a = -PI - a;
  const a2 = a * a;
  return a * (1 + a2 * (S3 + a2 * (S5 + a2 * (S7 + a2 * (S9 + a2 * S11)))));
}

/** Koszinusz — a szinusz eltolva, hogy egyetlen közelítés legyen a rendszerben. */
export function fxCos(x) { return fxSin(x + HALF_PI); }

/** Vágás [also, felso] közé. */
export function vag(x, also, felso) { return x < also ? also : (x > felso ? felso : x); }

/** Lineáris keverés. */
export function kever(a, b, t) { return a + (b - a) * t; }

/**
 * Egész osztás maradék nélkül, negatívra is helyesen. A `(a/b)|0` negatívnál
 * nulla felé vág, ami rács-koordinátáknál egy cellás hibát okoz a bal/felső
 * szélen — ez a fajta hiba csak a pálya sarkában jelentkezik, tehát későn.
 */
export function padloOszt(a, b) { return Math.floor(a / b); }

/**
 * Négyzetgyök — a `Math.sqrt` szabvány szerint helyesen kerekített, tehát
 * szabad. Azért van mégis saját neve, hogy a szonda ne kelljen kivételezzen,
 * és hogy egy helyen lehessen lecserélni, ha valaha kiderülne az ellenkezője.
 */
export function fxGyok(x) { return Math.sqrt(x); }

/** Vektor hossza. `Math.hypot` TILOS: az implementációfüggően pontosított. */
export function fxHossz(x, y) { return Math.sqrt(x * x + y * y); }

/**
 * Ezred-egységben tárolt százalék → [0,1] arány. A sim a hangulatot, a
 * koszt és az instabilitást EGÉSZ ezredekben tartja, mert az egész-aritmetika
 * nem sodródik: ezer apró lebegőpontos hozzáadás után a 100,0 már nem 100,0.
 */
export function ezredArany(e) { return e * 0.001; }
