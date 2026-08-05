// PORTAL HUB TYCOON — PROCEDURÁLIS TEXTÚRÁK.
//
// ── MIÉRT KÓDBÓL, ÉS MIÉRT NEM KÉPFÁJLBÓL ─────────────────────────────────
// A projekt egyetlen kemény ígérete a `dist/`-re szól: bemásolható bárhová, és
// elindul. Egy .png betöltése HTTP-kérés, vagyis külső fájl — a
// `tools/kiadas_ellenorzo.mjs` 3. vizsgálata pont ezt bukná meg. A hangnál
// ugyanez a döntés született (WebAudio, nulla hangfájl), és bevált: a generált
// anyag hangolható egy szám átírásával, verziókövethető, és nulla bájt a
// repóban. A textúra ugyanez a történet, csak képpontokban.
//
// Ez nem szegénységi bizonyítvány, hanem STÍLUS. Nem PBR-t akarunk, hanem
// olvasható, stilizált felületeket: kőlapot, amin látszik a fuga; fémpanelt,
// amin számolhatók a szegecsek; kristályt, aminek van éle. A cél az, hogy egy
// ferdén felülről nézett csarnokban a szem el tudja választani egymástól az
// anyagokat — nem az, hogy fotó legyen belőle.
//
// ── HÁROM SZABÁLY, AMI VEZETTE A FÁJLT ────────────────────────────────────
//
//  1. EGYSZER GENERÁLUNK. Minden textúra INDULÁSKOR készül el, és a
//     `GYORSTAR` (WeakMap, `THREE`-re kulcsolva) őrzi. A `frissit()`-ben
//     SOHA nem születik textúra — egy `CanvasTexture` létrehozása GPU-feltöltés,
//     az pedig a legrosszabb fajta képkocka-akadás: ritka, nagy, és nem
//     reprodukálható.
//
//  2. ANYAGONKÉNT EGY TEXTÚRA, NEM ÉPÜLETENKÉNT. A 23 épülettípus KILENC
//     felületet oszt szét egymás közt (`EPULET_ANYAG`). Nem takarékosságból:
//     a közös anyaghasználat AZ, ami összetartja a látványt — ha minden ház
//     saját felületet kapna, az állomás mintakatalógus lenne, nem hely.
//     A rajzolási hívások száma ettől nem mozdul: az a MESH-ek számától függ,
//     nem a textúrákétól, és mesh továbbra is típusonként egy van.
//
//  3. DETERMINISZTIKUS RAJZ. Nincs `Math.random`: minden generátor saját
//     magból induló lineáris kongruens sorozatot használ. Így két futás
//     képpontra ugyanazt a textúrát adja — enélkül a szonda képernyőképei
//     futásonként mást mutatnának, és az összehasonlítás értelmét vesztené.
//     (A sim generátorához természetesen SEMMI köze: a render soha nem nyúl
//     a világ véletlenéhez.)
//
// ── AZ UV-KÉRDÉS ──────────────────────────────────────────────────────────
// Az `epulet_mertan.js` és a `leny_mertan.js` összefűzött geometriái
// SZÁNDÉKOSAN uv nélkül készültek — amikor íródtak, egyetlen anyagunk sem
// használt textúrát. Egy textúra uv nélkül nem hiba, hanem ennél rosszabb:
// a hiányzó attribútum minden csúcson (0,0), tehát az egész épület a textúra
// EGYETLEN képpontjának színét veszi fel. Lapos folt, ami úgy néz ki, mintha
// szándék volna.
//
// Ezért van itt az `uvtPotol()`: dobozvetítéssel, a csúcs NORMÁLISA alapján
// választ vetítési síkot, és utólag teszi rá a geometriára. A mértan-fájlokat
// nem írjuk át (más sáv fájljai), és nem is kell: a vetítés a kész
// geometriából ugyanazt az eredményt adja.
//
// ── A PADLÓ KÜLÖN ESET: VILÁG-UV ──────────────────────────────────────────
// A padló 6912 cella szintenként, mind UGYANAZ a példányosított doboz. Ha a
// doboz saját uv-jét használnánk, minden cella pontosan ugyanazt a csempét
// mutatná — 96×72 cellán ez a legunalmasabb felület, amit gépi úton elő lehet
// állítani. A `vilagUvre()` ezért a csúcsárnyalóban a PÉLDÁNY VILÁGKOORDINÁTÁJÁBÓL
// számol uv-t: a textúra nyolc cellánként ismétlődik, és nyolcszor nyolc
// KÜLÖNBÖZŐ kőlap van benne. A rácsvonalak pont a cellahatárokra esnek
// (8 cella = 1024 képpont, cellánként pontosan 128), tehát a „hány cella
// széles ez a folyosó?" kérdésre a padló továbbra is válaszol.

// ══════════════════════════════════════════════════════════════════════════
//  KELLÉKEK
// ══════════════════════════════════════════════════════════════════════════

/**
 * Determinisztikus sorozat. Lineáris kongruens — nem kriptográfia, hanem
 * ismételhető zaj. Ugyanaz a mag ugyanazt a textúrát adja minden futásban.
 */
function mag(kezdo) {
  let s = kezdo >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function vaszon(sz, m) {
  const c = document.createElement('canvas');
  c.width = sz; c.height = m;
  return c;
}

/**
 * Vászon → textúra. Mindig ismétlődő, mindig mipmap-elt.
 *
 * ⚠️ `SRGBColorSpace`: a textúra SZÍN, nem adat. Enélkül a `three` nyers
 * lineárisnak veszi, és a felület érezhetően világosabbra sül ki, mint amit a
 * vászonra rajzoltunk — ugyanaz a hiba, ami az égbolt-shaderben a
 * `colorspace_fragment` nélkül történt.
 */
function texturaz(THREE, c, ismetX = 1, ismetY = 1, nagyFelulet = false) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(ismetX, ismetY);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  // ── A SZŰRÉS ÁRA ────────────────────────────────────────────────────────
  // ⚠️ EZ MÉRÉSSEL DŐLT EL, NEM ÍZLÉSSEL. Az első változat MINDEN textúrának
  // anizotróp (4×) és trilineáris szűrést adott. A/B-ben, egy munkameneten
  // belül ez 210 → 269 ms/képkocka volt a szoftveres raszterizálón, és a
  // különbség NAGYJÁBÓL FELE pusztán az anizotrópiából jött — miközben a
  // haszna egyetlen felületen látszik.
  //
  // Az anizotrópia azt javítja, amit LAPOS SZÖGBŐL nézünk. Egy 96×72-es padló
  // pontosan ilyen; egy épületfal, egy lény bőre vagy egy kapugyűrű soha nem
  // az — azok mindig nagyjából szemből látszanak. Ezért a padló kap 4×-et és
  // trilineárist, minden más 1×-et és a fele annyi mintát kérő
  // `LinearMipmapNearest`-et.
  if (nagyFelulet) {
    t.anisotropy = 4;
    t.minFilter = THREE.LinearMipmapLinearFilter;
  } else {
    t.anisotropy = 1;
    t.minFilter = THREE.LinearMipmapNearestFilter;
  }
  /**
   * A textúra lineáris átlagfényessége — MINDEGYIKEN. A hívó ebből számol
   * fénykompenzációt (lásd `anyagKompenzacio`). Azért itt, egy helyen, mert a
   * „mennyit visz el ez a felület?" kérdésre minden textúránál választ kell
   * adni: a deszkázat mérve 27 %-kal sötétítette a könyvesboltot, és ezt
   * kizárólag a szonda vette észre.
   */
  t.atlag = Number.isFinite(c.phtAtlag) ? c.phtAtlag : atlagFenyesseg(c);
  return t;
}

/** `rgb()` karakterlánc egész összetevőkből — a canvas ezt kéri. */
function sz(r, g, b) { return `rgb(${r | 0},${g | 0},${b | 0})`; }
function sza(r, g, b, a) { return `rgba(${r | 0},${g | 0},${b | 0},${a})`; }

/**
 * Finom szemcse az EGÉSZ vászonra, egyetlen `ImageData`-menetben.
 *
 * MIÉRT NEM `fillRect` pontonként: egymillió képpontnál az több százezer
 * canvas-hívás. Így egyetlen tömbön megyünk végig — nagyságrendekkel olcsóbb,
 * és a `Uint8ClampedArray` a túlcsordulást magától levágja.
 */
function szemcse(r, w, h, v, ero) {
  const kep = r.getImageData(0, 0, w, h);
  const d = kep.data;
  let s = 0;
  for (let i = 0; i < d.length; i += 4) {
    const z = (v() - 0.5) * ero;
    d[i] += z; d[i + 1] += z; d[i + 2] += z;
    // A LINEÁRIS átlagot itt vesszük fel, MENET KÖZBEN. Külön menetben ez a
    // padlónál (1024×1024) újabb négymegabájtos `getImageData` és egymillió
    // képpont lenne — merő indulási idő. Itt viszont a ciklus úgyis fut, és a
    // szemcse UTÁNI, tehát VÉGLEGES értékeket látjuk.
    s += 0.2126 * LINEARIS[d[i]] + 0.7152 * LINEARIS[d[i + 1]] + 0.0722 * LINEARIS[d[i + 2]];
  }
  r.putImageData(kep, 0, 0);
  return s / (w * h);
}

/** Lágy foltok radiális átmenetből — ez adja az „organikus" réteget. */
function foltok(r, w, h, v, db, rMin, rMax, szinFv) {
  for (let i = 0; i < db; i++) {
    const x = v() * w, y = v() * h;
    const su = rMin + v() * (rMax - rMin);
    const g = r.createRadialGradient(x, y, 0, x, y, su);
    const c = szinFv(v);
    g.addColorStop(0, c);
    g.addColorStop(1, c.replace(/[\d.]+\)$/, '0)'));
    r.fillStyle = g;
    r.fillRect(x - su, y - su, su * 2, su * 2);
  }
}

/** sRGB bájt → lineáris, előre kiszámolva. A 8 bites bemenet miatt elég 256 elem. */
const LINEARIS = (() => {
  const t = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const s = i / 255;
    t[i] = s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  }
  return t;
})();

/**
 * A vászon átlagos fényessége 0..1-ben, LINEÁRIS térben.
 *
 * ⚠️ MIÉRT LINEÁRISAN, ÉS MIÉRT NEM A NYERS BÁJTOKON: a szorzás, ami minket
 * érdekel (textúra × példányszín), a GPU-n LINEÁRIS térben történik. Egy 0,36
 * sRGB-jű fugavonal lineárisan 0,10 — vagyis háromszor sötétebb, mint amit a
 * bájtok átlaga sugallna. Az első változat sRGB-ben átlagolt, és emiatt
 * ALULBECSÜLTE a textúra sötétítő hatását.
 *
 * MIÉRT KELL EGYÁLTALÁN: a textúra SZOROZÓDIK a példányszínnel, tehát önmagában
 * mindig sötétít. Ez pont az a fajta csendes romlás, amit a látvány-sáv
 * csillagainál már egyszer elkaptunk — ott a „díszítés" ténylegesen elvitt
 * fényt, és hónapokig senkinek nem tűnt fel. Az `allomas3d.js` ezzel a számmal
 * kompenzál: a textúra mintát ad, nem árnyékot.
 */
function atlagFenyesseg(vasz) {
  // ⚠️ CSAK TARTALÉK ÚT. A textúrák túlnyomó része a `szemcse()`-től kapja meg
  // a PONTOS lineáris átlagot (az a ciklus úgyis végigmegy minden képponton).
  // Ez az ág csak azoknak marad, ahol nincs szemcse — ott kicsinyített
  // másolaton átlagolunk, mert az `getImageData` a nagy vásznakon önmagában
  // mérhető indulási idő.
  //
  // A kicsinyítés sRGB-ben átlagol, tehát KISSÉ fölé lő a lineáris átlagnak.
  // Ahol számít (a padló fénykompenzációja), ott a pontos utat használjuk —
  // mérve: a kicsinyített becslés −6,8 %-ra állította a padlót a −2,4 %
  // helyett.
  const K = 64;
  const kicsi = vaszon(K, K);
  const kr = kicsi.getContext('2d');
  kr.drawImage(vasz, 0, 0, K, K);
  const d = kr.getImageData(0, 0, K, K).data;
  let s = 0;
  for (let i = 0; i < d.length; i += 4) {
    s += 0.2126 * LINEARIS[d[i]] + 0.7152 * LINEARIS[d[i + 1]] + 0.0722 * LINEARIS[d[i + 2]];
  }
  return s / (K * K);
}

/**
 * A fénykompenzáció szorzója egy textúra lineáris átlagából.
 *
 * A kompenzációt sRGB-ben adjuk be (`setRGB(..., SRGBColorSpace)`), a hatása
 * viszont lineárisan érvényesül — a 2,2-es kitevő ezt a két teret köti össze.
 * Enélkül a naiv `1/átlag` másfélszeres túlkompenzáció lenne, és a textúra
 * bevezetése KIFEHÉRÍTETTE volna a padlót (mérve: +23 %).
 */
export function fenyKompenzacio(linearisAtlag) {
  const a = Math.max(0.25, Math.min(1, linearisAtlag || 1));
  return Math.min(1.35, Math.pow(a, -1 / 2.2));
}

/**
 * Ugyanez ott, ahol a kompenzáció LINEÁRIS térben hat: a `THREE.Color`
 * `multiplyScalar`-ja a lineáris összetevőket szorozza, tehát ott az egyszerű
 * `1/átlag` a helyes képlet — nem kell a 2,2-es kitevő.
 *
 * ⚠️ A FELSŐ KORLÁT NEM ÓVATOSSÁG. Egy telített típusszínnek (pl. 0x9b6bff)
 * van 1,0-s csatornája; azt bármilyen szorzó levágja, és a levágás HALVÁNYÍTJA
 * a színt. Márpedig a típusszín a legfontosabb felismerési jel az állomáson.
 * Inkább maradjon pár százalék sötétítés, mint hogy a lila szürkéskékké
 * mosódjon. A textúrák ezért eleve VILÁGOSRA vannak rajzolva — a kompenzáció
 * csak a maradékot viszi el.
 */
export function anyagKompenzacio(linearisAtlag) {
  const a = Math.max(0.4, Math.min(1, linearisAtlag || 1));
  return Math.min(1.35, 1 / a);
}

// ══════════════════════════════════════════════════════════════════════════
//  A PADLÓ
// ══════════════════════════════════════════════════════════════════════════

/** A padló cellamérete képpontban, és hány cella van egy textúrában. */
const PADLO_CELLA = 128;
const PADLO_RACS = 8;
/**
 * A padló világ-uv szorzója: ennyivel kell megszorozni a világ x/z-t.
 *
 * ⚠️ EZ A SZÁM KÖTI ÖSSZE A TEXTÚRÁT A RÁCCSAL. `1/8`, mert nyolc cella jut
 * egy textúrára — így a rajzolt fugavonalak PONTOSAN az egész világ-koordinátákra,
 * vagyis a cellahatárokra esnek. Ha ez elcsúszik, a padló mintája elkezd
 * átlógni a cellákon, és a „hány cella széles a folyosó?" leolvasás megszűnik.
 */
export const PADLO_UV_SKALA = 1 / PADLO_RACS;

/**
 * Egyetlen kőlap. A `v` a KÖZÖS, determinisztikus sorozat: minden lap belőle
 * húz, tehát a hatvannégy lap mind más lesz, futásról futásra viszont
 * pontosan ugyanaz. (Ha lapon belül indítanánk új sorozatot, mind a hatvannégy
 * egyforma volna — az meg pont az, amit el akarunk kerülni.)
 */
function koLapot(r, x0, y0, s, v) {
  const b = 3;                     // fugavastagság fele
  const alap = 226 + v() * 24;
  // Hűvös kék alap, néha melegebb homokkő — ettől lesz „több anyagból rakott"
  // a padló ahelyett, hogy egyetlen kőbánya termése volna.
  const meleg = v() < 0.22;
  const rr = alap * (meleg ? 1.0 : 0.95);
  const gg = alap * (meleg ? 0.96 : 0.97);
  const bb = alap * (meleg ? 0.88 : 1.0);

  // Osztott lap: 2×2 kisebb kő. Ez töri meg a modulhatárt — enélkül a
  // nyolcas ismétlődés szabályos rácsnak látszana nagy felületen.
  const oszt = v() < 0.22 ? 2 : 1;
  const m = s / oszt;
  for (let j = 0; j < oszt; j++) {
    for (let i = 0; i < oszt; i++) {
      const e = v() * 10 - 5;
      r.fillStyle = sz(rr + e, gg + e, bb + e);
      r.fillRect(x0 + i * m + b, y0 + j * m + b, m - b * 2, m - b * 2);
    }
  }

  // Élkiemelés: világos a bal-felső, sötét a jobb-alsó perem. Ez a két vonal
  // csinálja a „vastag kőlap" érzetet — enélkül matrica marad.
  r.strokeStyle = sza(255, 255, 255, 0.5);
  r.lineWidth = 1.5;
  r.strokeRect(x0 + b + 0.75, y0 + b + 0.75, s - b * 2 - 1.5, s - b * 2 - 1.5);
  r.strokeStyle = sza(40, 46, 70, 0.28);
  r.beginPath();
  r.moveTo(x0 + s - b, y0 + b);
  r.lineTo(x0 + s - b, y0 + s - b);
  r.lineTo(x0 + b, y0 + s - b);
  r.stroke();

  // Repedés: néhány tört vonal. Nem minden lapon — a mindenhol repedt padló
  // romnak látszik, a néhol repedt HASZNÁLTNAK.
  if (v() < 0.30) {
    r.strokeStyle = sza(70, 78, 104, 0.42);
    r.lineWidth = 1;
    r.beginPath();
    let px = x0 + b + v() * (s - b * 2), py = y0 + b;
    r.moveTo(px, py);
    for (let i = 0; i < 4; i++) {
      px += (v() - 0.5) * s * 0.4;
      py += (s - b * 2) / 4;
      r.lineTo(px, py);
    }
    r.stroke();
  }

  // Lecsorbult sarok: apró világos háromszög. Aprólékos részlet, de ez az,
  // amitől a padló nem gépi rácsnak látszik.
  if (v() < 0.25) {
    const sx = v() < 0.5 ? x0 + b : x0 + s - b, sy = v() < 0.5 ? y0 + b : y0 + s - b;
    const d = 5 + v() * 7;
    r.fillStyle = sza(255, 255, 255, 0.34);
    r.beginPath();
    r.moveTo(sx, sy);
    r.lineTo(sx + (sx > x0 + s * 0.5 ? -d : d), sy);
    r.lineTo(sx, sy + (sy > y0 + s * 0.5 ? -d : d));
    r.fill();
  }

  // ── A VARÁZSLAT ────────────────────────────────────────────────────────
  // Minden tizedik lap kap egy berakott rúnakört. Ez a játék hangulata: az
  // állomás padlója nem beton, hanem egy dimenziókapu-csomópont burkolata.
  // Ritka, mert a mindenhol villogó mágia zajjá válik.
  if (v() < 0.10) {
    const cx = x0 + s * 0.5, cy = y0 + s * 0.5, su = s * (0.2 + v() * 0.1);
    const h = v();
    const szinR = h < 0.5 ? [150, 120, 240] : [110, 210, 200];
    r.strokeStyle = sza(szinR[0], szinR[1], szinR[2], 0.55);
    r.lineWidth = 2.5;
    r.beginPath(); r.arc(cx, cy, su, 0, Math.PI * 2); r.stroke();
    r.lineWidth = 1.2;
    r.beginPath(); r.arc(cx, cy, su * 0.66, 0, Math.PI * 2); r.stroke();
    const agak = 3 + ((v() * 4) | 0);
    r.beginPath();
    for (let i = 0; i < agak; i++) {
      const a = (i / agak) * Math.PI * 2;
      r.moveTo(cx, cy);
      r.lineTo(cx + Math.cos(a) * su, cy + Math.sin(a) * su);
    }
    r.stroke();
  }
}

function padloTextura(THREE) {
  const S = PADLO_CELLA * PADLO_RACS;
  const c = vaszon(S, S);
  const r = c.getContext('2d');
  const v = mag(20260805);

  // A fuga az ALAP: erre ülnek rá a lapok, tehát a hézag magától kirajzolódik.
  r.fillStyle = '#59607c';
  r.fillRect(0, 0, S, S);
  for (let y = 0; y < PADLO_RACS; y++) {
    for (let x = 0; x < PADLO_RACS; x++) koLapot(r, x * PADLO_CELLA, y * PADLO_CELLA, PADLO_CELLA, v);
  }
  // Kopásfoltok a lapokon ÁT: ezek nem tisztelik a cellahatárt, és pont ettől
  // nem látszik nyolcas ismétlődésnek a nagy csarnok.
  foltok(r, S, S, v, 26, 40, 150, (g) => sza(255, 252, 240, 0.05 + g() * 0.05));
  foltok(r, S, S, v, 18, 30, 110, (g) => sza(60, 70, 100, 0.05 + g() * 0.05));
  c.phtAtlag = szemcse(r, S, S, v, 13);

  // `nagyFelulet: true` — ez az EGYETLEN felület, amit lapos szögből nézünk,
  // tehát csak ez fizet anizotróp szűrést (lásd a `texturaz` megjegyzését).
  return texturaz(THREE, c, 1, 1, true);
}

// ══════════════════════════════════════════════════════════════════════════
//  ÉPÜLET-FELÜLETEK  (mind 256×256 — egy cellányi felületre bőven elég)
// ══════════════════════════════════════════════════════════════════════════

// ⚠️ MINDEN ÉPÜLET-FELÜLET VILÁGOS. Nem esztétikai szeszély: a textúra
// SZORZÓDIK a típusszínnel, tehát a sötét felület egyszerűen elveszi az
// állomás fényét. A mérés ezt egyszer már kimondta — a korábbi, sötétebb
// deszkázat 27 %-kal fakította a könyvesboltot. A kontrasztot a MINTA adja
// (fuga, szegecs, erezet), nem az alaptónus lehúzása.
const F = 256;

/** Kváderfal: eltolt sorok, mély fuga. A legrégebbi, legnehezebb anyag. */
function kolapTextura(THREE) {
  const c = vaszon(F, F), r = c.getContext('2d'), v = mag(31337);
  r.fillStyle = '#9096ab'; r.fillRect(0, 0, F, F);
  const sorok = 6, mag2 = F / sorok;
  for (let j = 0; j < sorok; j++) {
    const el = (j % 2) * 0.5;
    for (let i = -1; i < 4; i++) {
      const x = (i + el) * (F / 3), y = j * mag2;
      const t = 224 + v() * 28;
      r.fillStyle = sz(t, t * 0.98, t * 0.94);
      r.fillRect(x + 2, y + 2, F / 3 - 4, mag2 - 4);
      r.fillStyle = sza(255, 255, 255, 0.22);
      r.fillRect(x + 2, y + 2, F / 3 - 4, 2);
      r.fillStyle = sza(70, 72, 88, 0.2);
      r.fillRect(x + 2, y + mag2 - 4, F / 3 - 4, 2);
    }
  }
  foltok(r, F, F, v, 20, 8, 34, (g) => sza(120, 124, 140, 0.06 + g() * 0.08));
  c.phtAtlag = szemcse(r, F, F, v, 16);
  return texturaz(THREE, c);
}

/** Vakolat: sima, meleg, apró gödrökkel. A legtöbb szolgáltatóház alapja. */
function vakolatTextura(THREE) {
  const c = vaszon(F, F), r = c.getContext('2d'), v = mag(90210);
  r.fillStyle = '#efeae2'; r.fillRect(0, 0, F, F);
  foltok(r, F, F, v, 60, 10, 48, (g) => sza(214, 206, 196, 0.10 + g() * 0.12));
  foltok(r, F, F, v, 40, 6, 26, (g) => sza(255, 253, 248, 0.10 + g() * 0.14));
  // Gödrök: a vakolat attól vakolat, hogy nem tükör.
  for (let i = 0; i < 240; i++) {
    const x = v() * F, y = v() * F, s = 1 + v() * 2;
    r.fillStyle = sza(180, 172, 162, 0.25 + v() * 0.3);
    r.fillRect(x, y, s, s);
  }
  c.phtAtlag = szemcse(r, F, F, v, 10);
  return texturaz(THREE, c);
}

/** Fémpanel: függőleges illesztések, szegecssor, csiszolási nyomok. */
function femTextura(THREE) {
  const c = vaszon(F, F), r = c.getContext('2d'), v = mag(4242);
  r.fillStyle = '#e0e5f0'; r.fillRect(0, 0, F, F);
  // Csiszolás: vízszintes karcok. Az irány számít — enélkül a fém szövet lesz.
  for (let i = 0; i < 420; i++) {
    const y = v() * F, h = 1;
    r.fillStyle = v() < 0.5 ? sza(255, 255, 255, 0.10) : sza(120, 128, 148, 0.10);
    r.fillRect(0, y, F, h);
  }
  const panelek = 2, sz2 = F / panelek;
  for (let i = 0; i <= panelek; i++) {
    const x = i * sz2;
    r.fillStyle = sza(96, 104, 128, 0.75); r.fillRect(x - 2, 0, 3, F);
    r.fillStyle = sza(255, 255, 255, 0.5); r.fillRect(x + 1, 0, 1.5, F);
    // Szegecsek: a hitelesség kilenc pöttyön múlik.
    for (let j = 0; j < 9; j++) {
      const y = 12 + j * (F - 24) / 8;
      const g = r.createRadialGradient(x + 7, y - 1, 0, x + 7, y, 4);
      g.addColorStop(0, 'rgba(255,255,255,0.85)');
      g.addColorStop(0.6, 'rgba(150,158,180,0.6)');
      g.addColorStop(1, 'rgba(150,158,180,0)');
      r.fillStyle = g; r.beginPath(); r.arc(x + 7, y, 4, 0, Math.PI * 2); r.fill();
    }
  }
  c.phtAtlag = szemcse(r, F, F, v, 12);
  return texturaz(THREE, c);
}

/** Deszkázat: függőleges pallók, erezet, néhány csomó. */
function faTextura(THREE) {
  const c = vaszon(F, F), r = c.getContext('2d'), v = mag(777001);
  const pallo = 4, w = F / pallo;
  for (let i = 0; i < pallo; i++) {
    const t = 232 + v() * 23;
    r.fillStyle = sz(t, t * 0.90, t * 0.78);
    r.fillRect(i * w, 0, w, F);
    // Erezet: hosszú, enyhén hullámzó vonalak a palló mentén.
    for (let j = 0; j < 16; j++) {
      const x = i * w + 3 + v() * (w - 6);
      r.strokeStyle = sza(150, 112, 72, 0.09 + v() * 0.13);
      r.lineWidth = 0.6 + v() * 1.2;
      r.beginPath(); r.moveTo(x, 0);
      for (let y = 0; y <= F; y += 32) r.lineTo(x + Math.sin((y / F) * 6 + i) * 2.5, y);
      r.stroke();
    }
    if (v() < 0.7) {   // csomó
      const cx = i * w + w * 0.5 + (v() - 0.5) * w * 0.4, cy = v() * F;
      for (let k = 4; k > 0; k--) {
        r.strokeStyle = sza(140, 100, 62, 0.45);
        r.lineWidth = 1;
        r.beginPath(); r.ellipse(cx, cy, k * 2.4, k * 3.4, 0, 0, Math.PI * 2); r.stroke();
      }
    }
    r.fillStyle = sza(112, 78, 46, 0.5); r.fillRect(i * w, 0, 2, F);
    r.fillStyle = sza(255, 244, 228, 0.45); r.fillRect(i * w + 2, 0, 1, F);
  }
  c.phtAtlag = szemcse(r, F, F, v, 12);
  return texturaz(THREE, c);
}

/** Kristály: nagy lapok, éles élek, egy-egy csillanás. */
function kristalyTextura(THREE) {
  const c = vaszon(F, F), r = c.getContext('2d'), v = mag(5150);
  r.fillStyle = '#ebf0ff'; r.fillRect(0, 0, F, F);
  // Ferde hasábsávok: a kristály attól kristály, hogy SÍKOKBÓL áll.
  for (let i = -6; i < 12; i++) {
    const x = i * 26 + v() * 8;
    const t = 226 + v() * 29;
    r.fillStyle = sz(t * 0.9, t * 0.95, t);
    r.beginPath();
    r.moveTo(x, 0); r.lineTo(x + 22, 0); r.lineTo(x + 22 - 60, F); r.lineTo(x - 60, F);
    r.closePath(); r.fill();
    r.strokeStyle = sza(255, 255, 255, 0.55); r.lineWidth = 1.4;
    r.beginPath(); r.moveTo(x, 0); r.lineTo(x - 60, F); r.stroke();
  }
  // Vízszintes törésvonalak — enélkül csíkos tapéta lenne.
  for (let i = 0; i < 7; i++) {
    const y = v() * F;
    r.strokeStyle = sza(160, 180, 230, 0.4); r.lineWidth = 1;
    r.beginPath(); r.moveTo(0, y); r.lineTo(F, y + (v() - 0.5) * 30); r.stroke();
  }
  foltok(r, F, F, v, 14, 8, 30, (g) => sza(255, 255, 255, 0.14 + g() * 0.2));
  c.phtAtlag = szemcse(r, F, F, v, 8);
  return texturaz(THREE, c);
}

/** Üveg: osztott tábla, ferde fénypászmák. A kirakat és a peronüveg anyaga. */
function uvegTextura(THREE) {
  const c = vaszon(F, F), r = c.getContext('2d'), v = mag(1848);
  const g = r.createLinearGradient(0, 0, F, F);
  g.addColorStop(0, '#e8f5ff'); g.addColorStop(0.5, '#cbe0f4'); g.addColorStop(1, '#f2faff');
  r.fillStyle = g; r.fillRect(0, 0, F, F);
  // Pászmák: két széles, ferde világos sáv. Ez a „tükröződik benne az ég".
  for (const [x, w2, a] of [[30, 26, 0.5], [120, 14, 0.34], [186, 34, 0.42]]) {
    r.save(); r.translate(x, 0); r.rotate(-0.4);
    r.fillStyle = sza(255, 255, 255, a); r.fillRect(0, -F, w2, F * 3);
    r.restore();
  }
  // Osztóléc: 2×2 tábla. A keret adja, hogy ez ABLAK, nem tócsa.
  r.fillStyle = sza(120, 132, 156, 0.7);
  r.fillRect(0, F / 2 - 3, F, 6); r.fillRect(F / 2 - 3, 0, 6, F);
  r.fillRect(0, 0, F, 5); r.fillRect(0, F - 5, F, 5);
  r.fillRect(0, 0, 5, F); r.fillRect(F - 5, 0, 5, F);
  c.phtAtlag = szemcse(r, F, F, v, 6);
  return texturaz(THREE, c);
}

/** Ponyva: széles csíkok, varrásokkal. Az étterem és a bolt előtetője. */
function szovetTextura(THREE) {
  const c = vaszon(F, F), r = c.getContext('2d'), v = mag(60606);
  const cs = 6, w = F / cs;
  for (let i = 0; i < cs; i++) {
    r.fillStyle = i % 2 ? '#fdfaf3' : '#f0d2c2';
    r.fillRect(i * w, 0, w, F);
  }
  // Szövésminta: sűrű, halvány kereszthálózat. Enélkül műanyag.
  r.globalAlpha = 0.10;
  for (let i = 0; i < F; i += 3) {
    r.fillStyle = '#9a8a7c';
    r.fillRect(i, 0, 1, F); r.fillRect(0, i, F, 1);
  }
  r.globalAlpha = 1;
  for (let i = 1; i < cs; i++) {
    r.fillStyle = sza(150, 128, 114, 0.32); r.fillRect(i * w - 1, 0, 2, F);
  }
  foltok(r, F, F, v, 16, 10, 40, (g) => sza(200, 172, 152, 0.06 + g() * 0.08));
  c.phtAtlag = szemcse(r, F, F, v, 9);
  return texturaz(THREE, c);
}

/** Csempe: apró négyzetek, fényes máz. Mosdó és orvosi. */
function csempeTextura(THREE) {
  const c = vaszon(F, F), r = c.getContext('2d'), v = mag(31415);
  r.fillStyle = '#c3cdd4'; r.fillRect(0, 0, F, F);
  const n = 8, s = F / n;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const t = 232 + v() * 20;
      // Minden hetedik csempe kap egy halvány színt — ez a „valaki tervezte"
      // jel: egy tökéletesen egyforma csempefal gépi, egy mintás emberi.
      const kek = ((i * 3 + j * 5) % 7) === 0;
      r.fillStyle = kek ? sz(t * 0.78, t * 0.90, t) : sz(t, t, t * 0.98);
      r.fillRect(i * s + 1.5, j * s + 1.5, s - 3, s - 3);
      r.fillStyle = sza(255, 255, 255, 0.6);
      r.fillRect(i * s + 1.5, j * s + 1.5, s - 3, 2);
    }
  }
  c.phtAtlag = szemcse(r, F, F, v, 7);
  return texturaz(THREE, c);
}

/** Szikla: a lebegő sziget alaplemeze. Durva, sötét, rétegzett. */
function sziklaTextura(THREE) {
  const c = vaszon(F, F), r = c.getContext('2d'), v = mag(8080);
  r.fillStyle = '#39405f'; r.fillRect(0, 0, F, F);
  foltok(r, F, F, v, 70, 10, 60, (g) => sza(90, 100, 140, 0.10 + g() * 0.16));
  foltok(r, F, F, v, 50, 8, 40, (g) => sza(20, 24, 44, 0.12 + g() * 0.2));
  // Rétegvonalak: a kőzet vízszintesen ülepedett, és ez a néhány vonal
  // mondja el, hogy a sziget LESZAKADT valahonnan.
  for (let i = 0; i < 9; i++) {
    const y = v() * F;
    r.strokeStyle = sza(150, 160, 200, 0.16); r.lineWidth = 1 + v() * 2;
    r.beginPath(); r.moveTo(0, y);
    for (let x = 0; x <= F; x += 32) r.lineTo(x, y + (v() - 0.5) * 9);
    r.stroke();
  }
  c.phtAtlag = szemcse(r, F, F, v, 22);
  return texturaz(THREE, c);
}

// ══════════════════════════════════════════════════════════════════════════
//  A KAPU
// ══════════════════════════════════════════════════════════════════════════

/**
 * Rúnaszalag a portálgyűrűre. Széles-lapos textúra: a tórusz `u`-ja a gyűrű
 * körül fut, a `v`-je a cső körül — a szalag tehát körbeér.
 */
function runaTextura(THREE) {
  const W = 256, H = 64;
  const c = vaszon(W, H), r = c.getContext('2d'), v = mag(999331);
  const g = r.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#6d6f96'); g.addColorStop(0.42, '#f2f0ff'); g.addColorStop(1, '#5a5c82');
  r.fillStyle = g; r.fillRect(0, 0, W, H);
  // Nyolc rovátka + nyolc glifa, váltakozva. A rovátka adja a „gépezet"
  // olvasatot, a glifa a „varázslat"-ot — a kapu mindkettő.
  for (let i = 0; i < 8; i++) {
    const x = i * (W / 8);
    r.fillStyle = sza(40, 40, 70, 0.55);
    r.fillRect(x, 6, 4, H - 12);
    r.strokeStyle = sza(255, 255, 255, 0.9);
    r.lineWidth = 2.4;
    r.beginPath();
    const cx = x + W / 16;
    // Négy különböző, egyszerű jel — a részletgazdagság itt olcsó.
    const j = i % 4;
    if (j === 0) { r.moveTo(cx - 7, 20); r.lineTo(cx + 7, 20); r.lineTo(cx - 7, 44); r.lineTo(cx + 7, 44); }
    else if (j === 1) { r.arc(cx, H / 2, 8, 0.6, Math.PI * 1.7); }
    else if (j === 2) { r.moveTo(cx, 16); r.lineTo(cx, 48); r.moveTo(cx - 8, 26); r.lineTo(cx + 8, 26); }
    else { r.moveTo(cx - 8, 44); r.lineTo(cx, 18); r.lineTo(cx + 8, 44); }
    r.stroke();
  }
  c.phtAtlag = szemcse(r, W, H, v, 8);
  return texturaz(THREE, c, 12, 1);
}

/**
 * Az örvény: logaritmikus spirálkarok ÁTTETSZŐ résekkel.
 *
 * MIÉRT ALFÁVAL: a kapu közepe „lyuk" — ha tömör korong maradna, a gyűrű egy
 * lefestett tányért keretezne. Az alfa-résekkel viszont átlátszik rajta az
 * állomás, és a forgás (`orveny.rotation.z`) tényleg SODRÁSNAK látszik.
 */
function orvenyTextura(THREE) {
  const S = 512, K = S / 2;
  const c = vaszon(S, S), r = c.getContext('2d'), v = mag(70707);
  r.clearRect(0, 0, S, S);
  const karok = 5;
  for (let a = 0; a < karok; a++) {
    r.beginPath();
    const fazis = (a / karok) * Math.PI * 2;
    // Kifelé szélesedő kar: befelé menet összesűrűsödik, ettől lesz „szippant".
    for (let i = 0; i <= 90; i++) {
      const t = i / 90;
      const su = 18 + t * (K - 26);
      const szog = fazis + t * 5.4;
      const w = 3 + t * 26;
      r.lineTo(K + Math.cos(szog) * su + Math.cos(szog + 1.57) * w, K + Math.sin(szog) * su + Math.sin(szog + 1.57) * w);
    }
    for (let i = 90; i >= 0; i--) {
      const t = i / 90;
      const su = 18 + t * (K - 26);
      const szog = fazis + t * 5.4;
      r.lineTo(K + Math.cos(szog) * su, K + Math.sin(szog) * su);
    }
    r.closePath();
    const g = r.createRadialGradient(K, K, 0, K, K, K);
    g.addColorStop(0, 'rgba(255,255,255,0.98)');
    g.addColorStop(0.45, 'rgba(230,236,255,0.72)');
    g.addColorStop(1, 'rgba(150,170,255,0.06)');
    r.fillStyle = g; r.fill();
  }
  // Izzó mag és néhány szikra a peremen.
  const mg = r.createRadialGradient(K, K, 0, K, K, K * 0.34);
  mg.addColorStop(0, 'rgba(255,255,255,1)');
  mg.addColorStop(0.5, 'rgba(255,255,255,0.55)');
  mg.addColorStop(1, 'rgba(255,255,255,0)');
  r.fillStyle = mg; r.fillRect(0, 0, S, S);
  for (let i = 0; i < 90; i++) {
    const szog = v() * Math.PI * 2, su = K * (0.4 + v() * 0.55);
    r.fillStyle = sza(255, 255, 255, 0.25 + v() * 0.5);
    const s2 = 1 + v() * 3;
    r.fillRect(K + Math.cos(szog) * su, K + Math.sin(szog) * su, s2, s2);
  }
  const t = texturaz(THREE, c);
  t.repeat.set(1, 1);
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// ══════════════════════════════════════════════════════════════════════════
//  A LÉNYEK
// ══════════════════════════════════════════════════════════════════════════

/**
 * Lénybőr: nagy, LÁGY foltok, alacsony kontraszttal.
 *
 * ⚠️ MIÉRT ILYEN VISSZAFOGOTT: egy lény a képernyőn 10-20 képpont, és ezerhatszáz
 * van belőle, mindegyik mozog. Egy nagy frekvenciájú minta ilyenkor nem
 * részlet, hanem VIBRÁLÁS — a kicsinyítés pont azt a mintát nem tudja
 * átlagolni, ami képpontonként váltakozik. A nagy, lágy folt viszont
 * kicsinyítve is szín marad, közelről meg elárulja, hogy a troll bőrös, a
 * kristálylény meg nem.
 */
function borTextura(THREE) {
  const S = 128;
  const c = vaszon(S, S), r = c.getContext('2d'), v = mag(24680);
  r.fillStyle = '#f2f2f2'; r.fillRect(0, 0, S, S);
  foltok(r, S, S, v, 22, 12, 40, (g) => sza(196, 196, 210, 0.20 + g() * 0.18));
  foltok(r, S, S, v, 14, 8, 26, (g) => sza(255, 255, 255, 0.20 + g() * 0.2));
  c.phtAtlag = szemcse(r, S, S, v, 6);
  return texturaz(THREE, c, 1, 1);
}

// ══════════════════════════════════════════════════════════════════════════
//  ÖSSZEÁLLÍTÁS ÉS GYORSTÁR
// ══════════════════════════════════════════════════════════════════════════

const GYORSTAR = new WeakMap();

/**
 * Minden textúra, egyszer. A hívó nyugodtan hívhatja többször — ugyanazt az
 * objektumot kapja vissza, tehát nincs kétszeres GPU-feltöltés.
 *
 * @param {typeof import('three')} THREE
 */
export function texturak(THREE) {
  const kesz = GYORSTAR.get(THREE);
  if (kesz) return kesz;
  // Az előállítás ideje MÉRT ÉRTÉK, nem érzés: ez indulási költség, és a
  // böngésző-szonda pont az első másodpercekben számolja a tick-eket. A
  // textúra-szonda kiírja, tehát nem tud csendben elhízni.
  const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;
  const k = {
    padlo: padloTextura(THREE),
    kolap: kolapTextura(THREE),
    vakolat: vakolatTextura(THREE),
    fem: femTextura(THREE),
    fa: faTextura(THREE),
    kristaly: kristalyTextura(THREE),
    uveg: uvegTextura(THREE),
    szovet: szovetTextura(THREE),
    csempe: csempeTextura(THREE),
    szikla: sziklaTextura(THREE),
    runa: runaTextura(THREE),
    orveny: orvenyTextura(THREE),
    bor: borTextura(THREE),
  };
  // Az alaplemez egyetlen, HATALMAS doboz: a szikla sokszor ismétlődjön rajta,
  // különben egy elmosott folt lesz belőle.
  k.szikla.repeat.set(9, 3);
  /** Az előállítás ideje ms-ban — a szonda ezt olvassa (nem enumerálható). */
  Object.defineProperty(k, 'keszitesMs', {
    value: ((typeof performance !== 'undefined' && performance.now) ? performance.now() : 0) - t0,
    enumerable: false,
  });
  GYORSTAR.set(THREE, k);
  return k;
}

/**
 * Mérési fogantyú a szondának: mekkorák és hányan vannak. Egy textúra-készlet
 * csendben tud elhízni („még egy 2048×2048, az se sok"), és a memóriát nem
 * jelzi semmi — ez a lista teszi mérhetővé.
 *
 * ⚠️ A KÉSZLETET PARAMÉTERBEN KAPJA, nem modulszintű változóból. Ez nem
 * ízléskérdés: a szonda a lapon belül `import('/src/render/texturak.js')`-szel
 * húzza be ezt a fájlt, és a vite bizonyos helyzetekben (időbélyeges URL a
 * modul módosítása után) MÁSIK modulpéldányt ad, mint amit a `fo.js` használ.
 * Egy modulszintű „utolsó készlet" ilyenkor üres, és a leltár némán NULLÁT
 * jelent — vagyis a szonda pont akkor mond zöldet, amikor nem lát semmit.
 * Ez egyszer meg is történt. Tiszta függvényként ez nem fordulhat elő.
 *
 * @param {Record<string, import('three').Texture>} k a `texturak()` eredménye
 * @returns {{nev:string, sz:number, m:number, keppont:number, vaszon:boolean}[]}
 */
export function texturaLista(k) {
  if (!k) return [];
  const ki = [];
  for (const nev of Object.keys(k)) {
    const kep = k[nev].image;
    ki.push({
      nev,
      sz: kep.width,
      m: kep.height,
      keppont: kep.width * kep.height,
      // A procedurális ígéret ellenőrzési pontja: ami nem vászonból jött, az
      // fájlból jött — és onnantól a `dist/` nem másolható bárhová.
      vaszon: typeof HTMLCanvasElement !== 'undefined' && kep instanceof HTMLCanvasElement,
    });
  }
  return ki;
}

/**
 * Melyik épülettípus melyik felületet kapja: `[test, dísz]`.
 *
 * A párosítás nem esztétikai szeszély, hanem OLVASHATÓSÁG: a felület
 * megerősíti azt, amit a sziluett mond. Az étterem vakolat + csíkos ponyva, a
 * karbantartó végig fém, a jégkamra végig kristály. Aki nem szerepel itt, az
 * vakolatot kap — új épülettípus tehát nem marad textúra nélkül.
 */
export const EPULET_ANYAG = new Map([
  ['biztonsag', ['fem', 'uveg']],
  ['vam', ['kolap', 'fa']],
  ['poggyasz', ['fem', 'fem']],
  ['etterem', ['vakolat', 'szovet']],
  ['bolt', ['vakolat', 'szovet']],
  ['konyvesbolt', ['fa', 'fa']],
  ['wc', ['csempe', 'csempe']],
  ['varo', ['fa', 'szovet']],
  ['info', ['vakolat', 'kristaly']],
  ['seprupark', ['fa', 'fa']],
  ['hoforras', ['kolap', 'kristaly']],
  ['jegkamra', ['kristaly', 'kristaly']],
  ['karbantarto', ['fem', 'fem']],
  ['takarito', ['fa', 'fem']],
  ['energiamag', ['fem', 'kristaly']],
  ['reklam', ['fem', 'uveg']],
  ['vip', ['kolap', 'kristaly']],
  ['orvos', ['csempe', 'vakolat']],
  ['lepcso', ['fem', 'fem']],
  ['teleportlift', ['fem', 'kristaly']],
  ['vasut', ['kolap', 'uveg']],
  ['leghajo', ['fem', 'szovet']],
  ['urkapu', ['fem', 'fem']],
]);

/** Ha egy típus kimaradna a táblából, ezt kapja — soha ne legyen textúrátlan. */
export const ALAP_ANYAG = ['vakolat', 'vakolat'];

/**
 * Dobozvetítéses uv utólag, a csúcs NORMÁLISA alapján.
 *
 * Az `epulet_mertan.js` és a `leny_mertan.js` uv nélküli geometriát ad (lásd a
 * fejlécet). Ez a függvény a kész geometriára teszi rá a hiányzó attribútumot:
 * minden csúcsnál megnézi, melyik tengely felé néz leginkább, és a MÁSIK KETTŐ
 * koordinátáját használja uv-nek. Dobozokból és hengerekből összefűzött
 * mértanoknál — márpedig itt minden ilyen — ez pontosan azt adja, amit egy
 * kézzel kicsomagolt modell.
 *
 * IDEMPOTENS: ha már van uv, nem csinál semmit. A geometriák
 * gyorstárazottak, tehát a hívó nyugodtan hívhatja újra (pl. kapacitásnöveléskor).
 *
 * @param {number} ismX hány textúra-ismétlés a teljes x kiterjedésen
 */
export function uvtPotol(THREE, geo, ismX = 1, ismY = 1, ismZ = 1) {
  if (!geo || geo.attributes.uv) return geo;
  const p = geo.attributes.position, n = geo.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const nx = n ? Math.abs(n.getX(i)) : 0;
    const ny = n ? Math.abs(n.getY(i)) : 1;
    const nz = n ? Math.abs(n.getZ(i)) : 0;
    let u, w;
    if (ny >= nx && ny >= nz) { u = x * ismX; w = z * ismZ; }        // fölülnézet
    else if (nx >= nz) { u = z * ismZ; w = y * ismY; }               // oldalnézet
    else { u = x * ismX; w = y * ismY; }                             // elölnézet
    uv[i * 2] = u; uv[i * 2 + 1] = w;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

/**
 * VILÁG-UV a példányosított padlóhoz.
 *
 * ── MIÉRT ÁRNYALÓ-FOLTOZÁS, ÉS MIÉRT NEM ATTRIBÚTUM ───────────────────────
 * A cél az, hogy a textúra a VILÁGHOZ tapadjon, ne a cellához: így nyolc
 * cellánként ismétlődik nyolcszor nyolc különböző kőlap, nem cellánként egy és
 * ugyanaz. Példányonkénti uv-eltolás elvileg megoldaná, de ahhoz a padló és a
 * szellempadló KÖZÖS geometriáját szét kellene választani (az egyik 6912, a
 * másik 0 példány — közös példány-attribútummal ez azonnal elcsúszna).
 *
 * A példány-mátrix viszont MÁR OTT VAN az árnyalóban: `instanceMatrix`. Ebből
 * a világkoordináta egy szorzás, és semmilyen extra pufferbe nem kerül.
 * Nulla attribútum, nulla allokáció, nulla rajzolási hívás.
 *
 * ⚠️ A `customProgramCacheKey` NEM elhagyható. A `three` az anyagokhoz
 * árnyalóprogramot gyorstáraz, és az `onBeforeCompile` szövege alapból NEM
 * része a kulcsnak — egy másik, ugyanolyan beállítású Lambert-anyag ugyanazt a
 * programot kapná meg, és vagy ő kapná meg a mi foltozásunkat, vagy mi az
 * övét. Némán, és csak bizonyos sorrendben.
 *
 * @param {number} skala hány VILÁGEGYSÉG legyen egy textúra-ismétlés reciproka
 */
export function vilagUvre(anyag, skala) {
  const s = skala.toFixed(8);
  anyag.onBeforeCompile = (arnyalo) => {
    arnyalo.vertexShader = arnyalo.vertexShader.replace(
      '#include <uv_vertex>',
      `#include <uv_vertex>
      #if defined( USE_MAP ) && defined( USE_INSTANCING )
        vec4 phtVilagPoz = instanceMatrix * vec4( position, 1.0 );
        vMapUv = phtVilagPoz.xz * ${s};
      #endif`,
    );
  };
  anyag.customProgramCacheKey = () => `pht_vilaguv_${s}`;
  return anyag;
}
