// AGE OF THE CRYSTALS — A HADI KÖD ÁRNYALÓJA ÉS SEGÉD-TEXTÚRÁI (v0.16).
//
// Ez a fájl a `kod3d.js` „hogyan néz ki" fele: a GLSL, a hozzá tartozó
// hangolószámok, és a két segéd-textúra (zaj, terep-magasság) előállítása. A
// `kod3d.js` maga csak a réteg-szerződést és a feltöltést intézi.
//
// A szétvágás nem esztétika: a köd shaderét CPU-n is le lehet játszani (egy
// szoftveres ellenőrző-rajzoló pontosan ezt teszi), és ahhoz a HANGOLÓSZÁMOKAT
// egy helyről kell venni. Ha a küszöb a GLSL-ben egy szám, a JS-mellékágban
// meg egy másik, akkor a képen ellenőrzött perem NEM az, ami a képernyőre
// kerül — és pont a köd-sáv volt az, ahol ez a projekt a legdrágábbat bukta.
//
// ── MIÉRT KELL A TEREP-MAGASSÁG A KÖDNEK ──────────────────────────────────
// A v0.7 ködje egy vízszintes lap volt a pálya LEGMAGASABB pontja fölött,
// mélységteszttel — hogy eltakarja a felderítetlen területen álló épületet és
// egységet (a `units3d`/`gazdasag3d` nem szűr ködre, tehát azok kirajzolódnak).
// Ennek a felállásnak három CSENDES hibája volt:
//
//   1. PARALLAXIS. A játékos ferdén néz; a lapon látott pont és az ALATTA lévő
//      talajpont között annyi az eltolódás, amennyi a lap magassága osztva a
//      nézés meredekségének tangensével. 15 egység magasság és 45°-os nézés
//      mellett 15 VILÁGEGYSÉG, majdnem négy köd-cella. Forgatáskor a hiba
//      KÖRBEJÁR: a ködperem elcsúszik a domb mellől.
//   2. KIZOOMOLVA MENNYEZET. Ha a kamera a lap ALÁ került (bezoomolva egy
//      völgyben a kamera a talaj fölött ~5-tel van, a lap meg 15-tel), akkor a
//      lefelé tartó sugarak SOHA nem érték el a lapot — vagyis a kép alsó
//      kétharmadán nem volt köd —, a fölfelé tartók viszont igen: sötét
//      mennyezet a horizont fölött.
//   3. AMI KILÓG, AZ LÁTSZIK. Egy hegytetőre épített torony átnyúlt a lapon.
//
// A mostani felállás mindhármat egyszerre oldja meg, és nem geometriával,
// hanem az árnyalóval: a lap a terep LEGALJÁRA kerül, mélységteszt NÉLKÜL
// (tehát mindent takar, ami alatta van), a fragmens-árnyaló pedig
// VISSZAVETÍTI a képpontot a valódi talajra — a kamerából induló sugarat
// addig igazítja, amíg a magasság-textúrával leírt terepre nem ér, és a KÖDÖT
// AZON A PONTON mintázza.
//
// A közelítés fixpont-iteráció, KÉT textúra-olvasás. Az első tipp nem a
// lap magassága, hanem a KAMERA ALATTI terepmagasság (uniformban, a CPU
// olvassa ki a rácsból) — a játékos jellemzően a maga környékét nézi, tehát ez
// a tipp már eleve közel van, és két lépés után az eltérés cella-tört rész.
//
// ⚠️ AMIT EZ SEM TUD: ha a sugár egy sziklaperem MÖGÉ néz, az iteráció a
// takarásban lévő távoli talajt találja meg, nem a peremet. Ez a klasszikus
// parallax-leképezés korlátja; meredek falak tövében fél cellányit hibázik.
// Az ára egy valódi sugár-menetelés lenne (8-16 olvasás képpontonként) —
// ennyiért nem éri meg.
//
// ── MIÉRT SZŐGLETES EGY BILINEÁRISAN SZŰRT KÖD ────────────────────────────
// A GPU lineáris szűrése texelen belül EGYENES: a köd-cellák között a
// meredekség a cellahatáron UGRIK. Az emberi szem pont az ilyen töréspontot
// veszi észre — innen a „gyémánt" alakú sarkok és a szögletes perem.
// Kvintikus (smootherstep) simítással a texelen belüli arányt előre torzítjuk,
// így a görbe a cellahatáron VÍZSZINTES érintővel megy át: a törés eltűnik,
// és mindez EGY textúra-olvasásból, nem négyből (bikubikus).
//
// A második lépés a ZAJ: a mintavételi pontot egy csempézhető zaj-textúrával
// eltoljuk kb. másfél világegységgel. Ettől a perem nem egy sima matematikai
// görbe, hanem szakadozott, szerves vonal — az agy „festett" pereme.

import { THREE } from './core3d.js';

// ── HANGOLÓSZÁMOK ─────────────────────────────────────────────────────────
// Ezeket a CPU-s ellenőrző-rajzoló is innen veszi.

/**
 * A ködlap a KAMERA ALATT ennyivel lebeg, és VELE MOZOG.
 *
 * ── MIÉRT NEM ÁLL EGY HELYBEN ─────────────────────────────────────────────
 * A lap már semmit nem jelent a köd HELYÉBŐL — azt a visszavetítés adja —,
 * egyetlen dolga eldönteni, MELY KÉPPONTOKAT árnyaljuk. Ehhez egy feltételnek
 * kell teljesülnie: a kamera legyen FÖLÖTTE, különben a lefelé tartó sugarak
 * el sem érik, és a képen SEMMI köd nem lesz.
 *
 * Egy fix magasságú lap ezt nem tudja garantálni. Az ellenőrző-rajzoló ki is
 * dobta: a pálya sarkában a terep tengerré süllyed (−100 alá), a kamera oda
 * követi a talajt, és a „terep alja alá tett" lap HIRTELEN a kamera FÖLÉ
 * kerül — 100 % ködtelen kép, hibaüzenet nélkül. Pontosan az a fajta csendes
 * hiba, amiből ez a projekt már hatot fizetett.
 *
 * A kamerához kötött lapnál ez definíció szerint nem fordulhat elő. És mivel
 * az árnyaló a `KUSZOB_MEREDEK`-nél laposabb sugarat úgyis eldobja, a lapnak
 * elég `SULLYEDES / KUSZOB_MEREDEK` sugarú körben elérnie — lásd `LAP_SZORZO`.
 */
export const LAP_SULLYEDES = 4.0;
/**
 * A lap OLDALHOSSZA a pálya méretének szorzataként. A kamerához kötött lapnál
 * ez a szám EGY egyenlőtlenség: a lap fél-oldala legyen nagyobb, mint
 * `LAP_SULLYEDES / KUSZOB_MEREDEK` = 4 / 0,02 = 200 világegység — ennél
 * távolabb a lapon már csak olyan sugár csapódna be, amit az árnyaló eldob.
 * 256-os pályán a fél-oldal 256 > 200. ✓
 *
 * ⚠️ Ha a `KUSZOB_MEREDEK` csökken vagy a `LAP_SULLYEDES` nő, ezt is
 * ellenőrizd — máskülönben a kép SZÉLÉN (a laposabb sugarak felé) tűnik el a
 * köd, ami pásztázás közben „villódzó horizontnak" látszik.
 */
export const LAP_SZORZO = 2.0;
/** Ennél laposabb sugárral nem foglalkozunk: az már a horizont, nem a talaj. */
export const KUSZOB_MEREDEK = 0.02;

/** „Láttam már" — ennyire fed. Lásd a `kod3d.js` olvashatóság-blokkját. */
export const ALFA_EMLEK = 0.46;
/** „Sosem láttam" — majdnem tömör, de nem teljesen: a szem így nem lyuknak látja. */
export const ALFA_URES = 0.965;

/** Az emlék-sáv színe: hideg, kékes szürke — „holdfényben látott" hatás. */
export const SZIN_EMLEK = 0x1a2338;
/**
 * Az ismeretlen sáv színe. NEM fekete: a v0.7 `0x05070c`-je mellett a
 * felhő-moduláció matematikailag ugyan megvolt, csak épp három bájtnyi
 * tartományon mozgott, tehát a képen SEMMI nem látszott belőle — halott folt
 * maradt. Ezen a szinten a sodródó felhő már látható szerkezetet ad, viszont
 * az alatta lévő terep még mindig eltűnik (a fedés 0,965).
 */
export const SZIN_URES = 0x090f1b;

/** A perem-zaj hulláma VILÁGEGYSÉGBEN (egy köd-cella 4 egység). */
export const PEREM_ZAJ = 1.7;
/** A perem-zaj hullámhossza világegységben. */
export const PEREM_ZAJ_MERET = 26.0;
/** A sodródó felhő hullámhossza világegységben. */
export const FELHO_MERET = 95.0;
/** A felhő alfa-modulációja az emlék-sávban. */
export const FELHO_ALFA = 0.075;
/** A felhő fényerő-modulációja (ettől nem lesz halott folt az ismeretlen sáv). */
export const FELHO_FENY = 0.9;
/** A felhő sodródási sebessége (világegység/mp). */
export const FELHO_SEBESSEG = 1.1;

/** A zaj-textúra oldalhossza. */
export const ZAJ_N = 64;

// ── ZAJ-TEXTÚRA ───────────────────────────────────────────────────────────

/**
 * Egész-hash. Nem `Math.random`: a zaj-textúrának FUTÁSRÓL FUTÁSRA
 * UGYANANNAK kell lennie, különben a CPU-s ellenőrző-kép és a képernyő nem
 * ugyanazt mutatja, és az összehasonlítás értelmét veszti.
 */
function hash(x, y, mag) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(mag, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/**
 * Csempézhető érték-zaj egy oktávja. A `per` a periódus TEXELBEN — a modulózás
 * miatt a textúra széle folytonosan folytatódik a másik szélén, tehát a
 * `RepeatWrapping` nem csinál varratot.
 */
function oktav(fx, fy, per, mag) {
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const tx = fx - x0, ty = fy - y0;
  const sx = tx * tx * tx * (tx * (tx * 6 - 15) + 10);
  const sy = ty * ty * ty * (ty * (ty * 6 - 15) + 10);
  const ax = ((x0 % per) + per) % per, ay = ((y0 % per) + per) % per;
  const bx = (ax + 1) % per, by = (ay + 1) % per;
  const h00 = hash(ax, ay, mag), h10 = hash(bx, ay, mag);
  const h01 = hash(ax, by, mag), h11 = hash(bx, by, mag);
  const a = h00 + (h10 - h00) * sx;
  const b = h01 + (h11 - h01) * sx;
  return a + (b - a) * sy;
}

/** Három oktáv, csempézhetően. 0..1 közé normálva. */
function fbm(fx, fy, mag) {
  const a = oktav(fx * 4 / ZAJ_N, fy * 4 / ZAJ_N, 4, mag);
  const b = oktav(fx * 8 / ZAJ_N, fy * 8 / ZAJ_N, 8, mag + 17);
  const c = oktav(fx * 16 / ZAJ_N, fy * 16 / ZAJ_N, 16, mag + 41);
  return (a * 0.55 + b * 0.3 + c * 0.15);
}

/**
 * A zaj NYERS bájtjai (RGBA). Két független mező kell: az `r` és a `g` adja a
 * perem-eltolás két komponensét EGYETLEN textúra-olvasásból — két külön
 * egycsatornás textúra két olvasás lenne, ugyanezért az eredményért.
 * A `b` a felhő mezője.
 * @returns {Uint8Array}
 */
export function zajBajtok() {
  const db = ZAJ_N * ZAJ_N;
  const nyers = new Float64Array(db * 3);
  const magok = [1, 101, 251];
  // A három oktáv súlyozott átlaga a 0..1 közepe felé húz (a szélső értékek
  // valószínűtlenek), tehát a NYERS mező tényleges kilengése ~±0,15. Ha ezt
  // tennénk textúrába, a perem-eltolás harmadannyi lenne a hangolt értéknél —
  // csendben, mert a kép attól még „majdnem jó"-nak látszik. Ezért csatornánként
  // KINYÚJTJUK a tényleges szélsőértékekre.
  for (let cs = 0; cs < 3; cs++) {
    let min = Infinity, max = -Infinity;
    for (let y = 0; y < ZAJ_N; y++) {
      for (let x = 0; x < ZAJ_N; x++) {
        const v = fbm(x, y, magok[cs]);
        nyers[(y * ZAJ_N + x) * 3 + cs] = v;
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    const sk = max > min ? 1 / (max - min) : 1;
    for (let i = 0; i < db; i++) nyers[i * 3 + cs] = (nyers[i * 3 + cs] - min) * sk;
  }
  const adat = new Uint8Array(db * 4);
  for (let i = 0; i < db; i++) {
    adat[i * 4] = (nyers[i * 3] * 255) | 0;
    adat[i * 4 + 1] = (nyers[i * 3 + 1] * 255) | 0;
    adat[i * 4 + 2] = (nyers[i * 3 + 2] * 255) | 0;
    adat[i * 4 + 3] = 255;
  }
  return adat;
}

/** A zaj-textúra. RGBA és nem RG: a `RedFormat` bevált, az `RGFormat` nem — nem kockáztatunk 12 KB-ért. */
export function zajTextura() {
  const t = new THREE.DataTexture(zajBajtok(), ZAJ_N, ZAJ_N, THREE.RGBAFormat);
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

// ── MAGASSÁG-TEXTÚRA ──────────────────────────────────────────────────────

/** A vízszint alá ennyinél mélyebbre nem kódolunk — lásd `magassagBajtok`. */
const MELY_VAGAS = -4;

/**
 * A terep magassága 8 bites textúrába kódolva, a köd-textúrával AZONOS
 * sor-fordítással (a V tengely lentről nő, a világ Z-je fentről).
 *
 * Miért elég 8 bit: a magasságot csak a VISSZAVETÍTÉSHEZ használjuk, ahol a
 * hiba a vetítési hosszal arányos. 40 egységnyi tartományon egy lépcső 0,16
 * egység — a köd-cella 4 egység széles, tehát a kvantálás negyvened cellányi
 * hibát ad. Ennyi nem látszik; egy float-textúra viszont négyszeres memória és
 * lassabb szűrés lenne.
 *
 * A pálya PEREMÉN a generátor a tengert több száz egységgel lehúzza; ezt
 * `MELY_VAGAS`-nál levágjuk, különben az egész hasznos tartomány két
 * lépcsőbe szorulna.
 *
 * @param {{n:number, kozepMagassag:Float64Array}} racs
 * @returns {{adat:Uint8Array, n:number, min:number, skala:number}}
 */
export function magassagBajtok(racs) {
  const n = racs.n | 0;
  const m = racs.kozepMagassag;
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < m.length; i++) {
    const h = m[i] < MELY_VAGAS ? MELY_VAGAS : m[i];
    if (h < min) min = h;
    if (h > max) max = h;
  }
  if (!(max > min)) { min = 0; max = 1; }
  const skala = max - min;
  const adat = new Uint8Array(n * n);
  for (let y = 0; y < n; y++) {
    const be = y * n;
    const ki = (n - 1 - y) * n;
    for (let x = 0; x < n; x++) {
      const h = m[be + x] < MELY_VAGAS ? MELY_VAGAS : m[be + x];
      let v = ((h - min) / skala) * 255;
      v = v < 0 ? 0 : (v > 255 ? 255 : v);
      adat[ki + x] = v | 0;
    }
  }
  return { adat, n, min, skala, max };
}

/** @param {{n:number, kozepMagassag:Float64Array}} racs */
export function magassagTextura(racs) {
  const b = magassagBajtok(racs);
  const t = new THREE.DataTexture(b.adat, b.n, b.n, THREE.RedFormat);
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return { textura: t, min: b.min, skala: b.skala, max: b.max };
}

// ── GLSL ──────────────────────────────────────────────────────────────────

export const KOD_VERTEX = `
  varying vec3 vVilag;
  void main() {
    vec4 vp = modelMatrix * vec4(position, 1.0);
    vVilag = vp.xyz;
    gl_Position = projectionMatrix * viewMatrix * vp;
  }
`;

/**
 * A fragmens-árnyaló. A `cameraPosition` a `three` alap-uniformja, a
 * `ShaderMaterial` előtétje adja — nem kell külön deklarálni.
 */
export const KOD_FRAGMENT = `
  uniform sampler2D kodTex;
  uniform sampler2D magTex;
  uniform sampler2D zajTex;
  uniform float kodN;        // a köd-rács oldalhossza texelben
  uniform float palya;       // a pálya oldalhossza világegységben
  uniform float magMin;      // magasság-dekódolás: min + r * skala
  uniform float magSkala;
  uniform float kamMag;      // a KAMERA ALATTI terepmagasság — az iteráció első tippje
  uniform float ido;         // másodperc — a felhő sodródásához
  uniform vec3  emlekSzin;
  uniform vec3  uresSzin;
  uniform float alfaEmlek;
  uniform float alfaUres;
  varying vec3 vVilag;

  /** Világ-XZ → textúra-UV. A V fordítva megy, ahogy a feltöltés is fordít. */
  vec2 uvbol(vec2 xz) {
    return vec2(xz.x / palya, 1.0 - xz.y / palya);
  }

  float terep(vec2 xz) {
    vec2 uv = clamp(uvbol(xz), 0.0005, 0.9995);
    return magMin + texture2D(magTex, uv).r * magSkala;
  }

  /**
   * Köd-minta KVINTIKUS texel-simítással: a texelen belüli arányt előre
   * torzítjuk, így a lineáris szűrés törése eltűnik a cellahatáron.
   */
  float kodMinta(vec2 uv) {
    vec2 t = uv * kodN - 0.5;
    vec2 i = floor(t);
    vec2 f = t - i;
    f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    return texture2D(kodTex, (i + 0.5 + f) / kodN).r;
  }

  void main() {
    vec3 d = vVilag - cameraPosition;
    float hossz = length(d);
    if (hossz < 0.0001) discard;
    d /= hossz;
    // A vízszintes fölé tartó sugár SOSEM ér talajt: ott a köd helye az ég,
    // nem egy sötét mennyezet. (Ez a régi „lap a horizont fölött" hiba.)
    if (d.y > -0.02) discard;

    // ── VISSZAVETÍTÉS A TALAJRA (fixpont-iteráció, két olvasás) ─────────
    // A sugarat a KAMERÁBÓL paraméterezzük; a lap csak azt döntötte el, hogy
    // ezt a képpontot egyáltalán árnyaljuk-e.
    float camY = cameraPosition.y;
    float h = kamMag;
    float s = clamp((camY - h) / (-d.y), 0.0, 6000.0);
    vec2 p = cameraPosition.xz + d.xz * s;
    h = terep(p);
    s = clamp((camY - h) / (-d.y), 0.0, 6000.0);
    p = cameraPosition.xz + d.xz * s;
    h = terep(p);
    s = clamp((camY - h) / (-d.y), 0.0, 6000.0);
    p = clamp(cameraPosition.xz + d.xz * s, 0.0, palya);

    // ── SZERVES PEREM: zajjal eltolt mintavétel ─────────────────────────
    vec4 zaj = texture2D(zajTex, p / ${PEREM_ZAJ_MERET.toFixed(1)});
    vec2 uv = uvbol(p) + (zaj.rg - 0.5) * (${(PEREM_ZAJ * 2).toFixed(3)} / palya);
    float f = kodMinta(uv);

    // ── HÁROM ÁLLAPOT → ALFA + SZÍN ─────────────────────────────────────
    // f: 0 = látom · 0,5 = láttam már · 1 = sosem láttam
    float e = clamp(f * 2.0, 0.0, 1.0);
    float u = clamp(f * 2.0 - 1.0, 0.0, 1.0);
    e = e * e * (3.0 - 2.0 * e);
    u = u * u * (3.0 - 2.0 * u);
    float a = alfaEmlek * e + (alfaUres - alfaEmlek) * u;
    // KORAI KILÉPÉS a látott sávban: a képernyő legnagyobb részén itt vége, és
    // a felhő-olvasást megspóroljuk. A küszöb a felhő-moduláció alatt van,
    // tehát nem vág le olyan képpontot, ami a felhőtől még látszana.
    if (a < 0.004) discard;
    vec3 szin = mix(emlekSzin, uresSzin, u);

    // ── SODRÓDÓ FELHŐ ───────────────────────────────────────────────────
    // Az alfát csak az EMLÉK-sávban moduláljuk; az ismeretlen sávban a
    // FÉNYEREJÉT, mert ott az alfa-ingás információt szivárogtatna arról,
    // mi van alatta.
    float felho = texture2D(zajTex,
      (p + vec2(ido * ${FELHO_SEBESSEG.toFixed(2)}, ido * ${(FELHO_SEBESSEG * 0.62).toFixed(2)}))
      / ${FELHO_MERET.toFixed(1)}).b - 0.5;
    a += felho * ${FELHO_ALFA.toFixed(3)} * e * (1.0 - u);
    szin *= 1.0 + felho * ${FELHO_FENY.toFixed(2)} * u;

    // Finom szórás a 8 bites átmenet sávosodása ellen.
    float sz = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    a += (sz - 0.5) * 0.01;

    if (a < 0.012) discard;
    gl_FragColor = vec4(szin, clamp(a, 0.0, 1.0));
  }
`;
