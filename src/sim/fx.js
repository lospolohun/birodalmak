// AGE OF THE CRYSTALS — DETERMINIZMUS-BIZTOS MATEK.
//
// ── MIÉRT VAN EZ A FÁJL ───────────────────────────────────────────────────
// A játék lockstep multiplayerre készül: minden gépen UGYANAZ a parancs-sor
// fut, és az eredménynek BITRE azonosnak kell lennie. Ha nem az, a játékok
// széttartanak („desync"), és nincs az a hálózati kód, ami ezt megjavítja.
//
// A JavaScript lebegőpontos alapműveletei (`+ - * /`) és a `Math.sqrt` az
// IEEE-754 szerint HELYESEN KEREKÍTETTEK, tehát motortól és géptől függetlenül
// bitre ugyanazt adják. Ezekre nyugodtan lehet építeni.
//
// A TRANSZCENDENS függvények viszont NEM: a `Math.sin`, `cos`, `tan`, `atan2`,
// `exp`, `pow`, `log` pontosságát a szabvány nyitva hagyja, és a V8 / JSC /
// SpiderMonkey más-más közelítést használ — sőt ugyanaz a V8 is válthat
// verzió között. Egyetlen utolsó bitnyi eltérés egy egység irányszögében
// néhány száz tick alatt látható pozíció-eltéréssé nő.
//
// Ezért a szimuláció SEHOL nem hívhat `Math.sin`-t és társait. Helyettük ezek
// a saját, csak `+ - * /`-ből épített közelítések állnak. Nem a leggyorsabbak,
// de determinisztikusak — és ez a fontosabb.
//
// ⚠️ NE tedd ide táblázatos (lookup) megoldást, ha a táblát `Math.sin`-nel
// töltöd fel! Akkor maga a TÁBLA lesz motorfüggő, és pontosan ugyanoda jutunk.
//
// ── MI TILOS A `src/sim/` ALATT ───────────────────────────────────────────
//   Math.sin, cos, tan, asin, acos, atan, atan2, exp, log, pow, hypot, cbrt
//   Math.random  (helyette: sim/rng.js seedelt generátora)
//   Date.now, performance.now  (a sim csak tick-számot ismer)
//   Objektum-kulcs iteráció (`for…in`, `Object.keys`) sorrendfüggő logikában
// A `tools/determinizmus_szonda.mjs` ezek egy részét statikusan is kiszűri.

/** 2π — literálként, hogy ne számolás eredménye legyen. */
export const TAU = 6.283185307179586;
export const PI = 3.141592653589793;
export const HALF_PI = 1.5707963267948966;

// A sin Taylor-együtthatói 1/(2k+1)! alakban, x¹¹-ig. A [-π/2, π/2]
// tartományon a maradéktag (π/2)¹³/13! ≈ 1,1·10⁻¹¹ — bőven a játék tűrésén
// belül, és ami fontosabb: MINDEN gépen ugyanaz.
const S3 = -0.16666666666666666;   // -1/3!
const S5 = 0.008333333333333333;   //  1/5!
const S7 = -1.984126984126984e-4;  // -1/7!
const S9 = 2.7557319223985893e-6;  //  1/9!
const S11 = -2.505210838544172e-8; // -1/11!

/**
 * Szinusz. Tetszőleges szögre működik: előbb [-π, π]-re redukálunk, majd a
 * [-π/2, π/2] tartományra tükrözünk, mert a polinom ott a legpontosabb.
 * @param {number} x szög radiánban
 * @returns {number} sin(x)
 */
export function fxSin(x) {
  // Tartomány-redukció [-π, π]-re. A `Math.floor` egzakt, a szorzás/kivonás
  // IEEE-helyes, tehát ez a lépés bitre reprodukálható.
  let t = x * (1 / TAU);
  t = t - Math.floor(t + 0.5);
  let a = t * TAU;
  // Tükrözés [-π/2, π/2]-re: sin(a) = sin(π − a), illetve sin(−π − a).
  if (a > HALF_PI) a = PI - a;
  else if (a < -HALF_PI) a = -PI - a;
  const s = a * a;
  return a * (1 + s * (S3 + s * (S5 + s * (S7 + s * (S9 + s * S11)))));
}

/**
 * Koszinusz — a szinuszból, negyed periódus eltolással.
 * @param {number} x szög radiánban
 * @returns {number} cos(x)
 */
export function fxCos(x) { return fxSin(x + HALF_PI); }

// Az atan minimax-együtthatói a [-1, 1] tartományra. Hiba ~10⁻⁵ radián, ami
// egy egység nézésirányánál láthatatlan (0,0006°).
const A1 = 0.9998660;
const A3 = -0.3302995;
const A5 = 0.1801410;
const A7 = -0.0851330;
const A9 = 0.0208351;

/** atan a [-1, 1] tartományon. */
function atanSzuk(z) {
  const s = z * z;
  return z * (A1 + s * (A3 + s * (A5 + s * (A7 + s * A9))));
}

/**
 * Négy-negyedes arkusz tangens. A `Math.atan2` motorfüggő, ezért saját.
 * @param {number} y
 * @param {number} x
 * @returns {number} a vektor szöge [-π, π]
 */
export function fxAtan2(y, x) {
  if (x === 0) {
    if (y > 0) return HALF_PI;
    if (y < 0) return -HALF_PI;
    return 0; // (0,0) — megegyezés szerint 0, NEM NaN, hogy ne mérgezzen
  }
  const ax = x < 0 ? -x : x;
  const ay = y < 0 ? -y : y;
  let r;
  if (ay <= ax) {
    r = atanSzuk(ay / ax);
  } else {
    r = HALF_PI - atanSzuk(ax / ay);
  }
  if (x < 0) r = PI - r;
  return y < 0 ? -r : r;
}

/**
 * Négyzetgyök. A `Math.sqrt` az IEEE-754 szerint helyesen kerekített, tehát
 * determinisztikus — csak azért van itt burkolva, hogy a sim-kód egységesen
 * `fx*`-ot hívjon, és a szonda ne jelezzen rá.
 * @param {number} x
 * @returns {number}
 */
export function fxSqrt(x) { return Math.sqrt(x); }

/**
 * Vektorhossz. A `Math.hypot` pontossága motorfüggő, ezért NEM használjuk.
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
export function fxHossz(x, y) { return Math.sqrt(x * x + y * y); }

/** Szorítás tartományba. Csak összehasonlítás, tehát egzakt. */
export function fxSzorit(v, min, max) { return v < min ? min : (v > max ? max : v); }

/** Lineáris keverés. */
export function fxKever(a, b, t) { return a + (b - a) * t; }
