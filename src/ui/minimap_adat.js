// AGE OF THE CRYSTALS — A MINIMAP KÉPPONTJAI (v0.16/minimap).
//
// ── MIÉRT KÜLÖN FÁJL A RAJZOLÁSTÓL ────────────────────────────────────────
// Ez a modul NEM tud a rajzfelületről, a `three`-ről és a böngészőről. Egyetlen
// dolgot csinál: a szimuláció állapotából feltölt egy RGBA bájt-puffert. A
// `minimap.js` aztán ezt teszi ki a képernyőre, kezeli a bevitelt, és mást nem.
//
// A szétválasztás oka gyakorlati: így a minimap NODE-BAN IS FUTTATHATÓ, tehát
// szondával vizsgálható. Egy rajzfelületre festő minimapról csak SZEMMEL derülne
// ki, ha elromlik — a felhőben pedig nincs szem (nincs GPU).
//
// ── MIÉRT HÁROM RÉTEG, ÉS NEM EGY FÜGGVÉNY ────────────────────────────────
// A v0.7-es változat EGY hívásban rakta össze a terepet, a ködöt, az épületeket
// és az egységeket. Amíg negyed másodpercenként rajzoltunk, ez elég volt. Egy
// játék-minimap viszont ELŐ akar jönni a nézet-keretével és a mozgásával
// képkockánként — és akkor a 192×192 = 36 864 képpont terep-mintavétele
// (magasság, lejtő, terep-típus, lelőhely) képkockánként újra lefutna. Ez per
// képkocka nagyságrendekkel több munka, mint amennyit a mozgó pontok igényelnek.
//
// Ezért három réteg van, és mindegyik MÁS ütemben frissül:
//
//   1. `minimapTerep`   — a TEREP. Statikus. Egyszer sül ki, és csak akkor
//                         megint, ha egy lelőhely kimerült (`valtozat`).
//   2. `minimapHatter`  — terep × HADI KÖD × birtokolt terület. A köd 10
//                         tickenként (fél mp) változik, tehát ennyit is várhat.
//   3. `minimapMozgo`   — épületek, egységek. KÉPKOCKÁNKÉNT, de csak
//                         bájt-írásokkal egy kész háttér MÁSOLATÁRA.
//
// A 3. réteg allokációja nulla: a hívó ad kimeneti objektumot, a képpont-bélyeg
// tömb pedig modul-szintű és nemzedék-számlálóval ürül, nem `fill(0)`-lal.
//
// ── AMIT A MINIMAP MUTATHAT, ÉS AMIT NEM ──────────────────────────────────
// ⚠️ EZ NEM SZÉPÉSZETI KÉRDÉS, HANEM A HADI KÖD ÉRVÉNYESSÉGE.
//
// A minimap a legkönnyebb módja annak, hogy a köd VÉLETLENÜL ÉRTELMÉT VESZÍTSE.
// Egyetlen elfelejtett feltétel, és a játékos a kis térképen látja az ellenség
// minden mozdulatát, miközben a nagy képernyőn sötét van. A köd ilyenkor
// „működik" — a szonda köd-számai nem nullák, a textúra rendben van —, csak épp
// senkit nem érdekel, mert a valódi információ máshol elérhető.
//
// A szabály tehát szigorú, és a szonda is ezt ellenőrzi:
//
//   SAJÁT egység és épület     MINDIG látszik (a sajátunkat mindig tudjuk)
//   IDEGEN egység és épület    CSAK ha a cellája ÉPPEN MOST látható
//   terep és nyersanyag        csak ha VALAHA láttuk (a felfedezett térkép)
//   sosem látott terület       fekete
//
// A nyersanyag a „valaha láttam" rétegben marad — ez a felderítés jutalma: amit
// egyszer megtaláltál, azt később is tudod, hol keresd. Az EGYSÉG viszont nem:
// az azóta elmehetett.
//
// ⚠️ A BIRTOKOLT TERÜLET UGYANEZ ALÁ ESIK. A terület-folt az ÉPÜLETEKBŐL
// származik, tehát ugyanazon a láthatóság-kapun megy át, mint maga az épület.
// Enélkül a köd mögötti ellenséges bázis helyét egy színes folt elárulná —
// a legfinomabb szivárgás, amit csak lehet, mert az épület maga nem is látszik.

import { TEREP, VIZSZINT } from '../sim/grid.js';
import { NYERS } from '../sim/eroforras.js';
import { EP_MERET } from '../sim/epuletek.js';

/**
 * A minimap oldalhossza képpontban. Négyzetes, mint a pálya.
 *
 * 192 a 256-os pályán 1,33 cella/képpont — épp az a felbontás, ahol egy 3×3-as
 * központ még két képpont széles tömb, egy magányos egység viszont egyetlen
 * pont. Fölé menni (384) azért nem érdemes, mert a képernyőn úgyis ~200 CSS-
 * képpont a hely: a többlet csak munkát jelentene, tájékozódást nem.
 */
export const MINIMAP_MERET = 192;

/**
 * Terep-alapszínek `TEREP.*` szerint: víz, fű, föveny, szikla, havas.
 *
 * Ezek ALAPSZÍNEK: a tényleges képpont ebből a magasság- és lejtő-árnyékolással
 * áll elő (lásd `_terepSzin`). Enélkül a minimap öt színfoltból állna, és pont
 * az veszne el róla, amiért egy RTS-ben ránéz az ember: hol van magaslat.
 */
export const SZIN_TEREP = [
  [34, 62, 100],    // VIZ    — sekély part
  [58, 92, 50],     // FU
  [140, 126, 88],   // FOVENY
  [104, 100, 104],  // SZIKLA
  [208, 212, 220],  // HAVAS
];
/** A legmélyebb víz színe. A part és a mély közt keverünk — így látszik a meder. */
const SZIN_MELYVIZ = [10, 24, 52];

/**
 * Nyersanyag-színek `NYERS.*` szerint: étel, fa, kő, kristály.
 *
 * ⚠️ A NÉGYNEK MEGKÜLÖNBÖZTETHETŐNEK KELL LENNIE EGY 1 KÉPPONTOS FOLTON IS.
 * Ezért nem árnyalatokat használunk, hanem négy külön szín-tartományt: meleg
 * piros, sötét zöld, világos szürke, élénk ibolya. A fa szándékosan SÖTÉTEBB a
 * fűnél (26,62,32 vs 58,92,50) — az erdő így összefüggő tömbként olvasható,
 * nem „kicsit más zöld" pöttyökként.
 */
export const SZIN_NYERS = [
  [192, 76, 88],    // ETEL     — bogyós
  [26, 62, 32],     // FA       — erdő
  [178, 182, 192],  // KO
  [154, 108, 238],  // KRISTALY — a névadó, a legélénkebb
];

/** Csapat-színek. Ugyanaz a két szín, amit a `gazdasag3d.js` használ. */
export const SZIN_CSAPAT = [[63, 127, 208], [208, 106, 63]];
/** Az EGYSÉG-pont világosabb, mint az épület: a mozgó dolog ugorjon ki. */
const SZIN_CSAPAT_VILAGOS = [[126, 186, 255], [255, 164, 110]];

/** A „valaha láttam, de most nem" terület sötétítése SZÁZALÉKBAN. */
const KOD_SOTETITES = 45;
/** A sosem látott terület színe. Nem tiszta fekete: a keret így is látszik. */
const SZIN_SOTET = [7, 9, 14];

/**
 * BIRTOKOLT TERÜLET: mekkora sugárban (világegység) számít egy épület köré a
 * terület. Nem szimulációs fogalom — a sim nem ismer területet —, hanem
 * OLVASOTT származtatás: a játékos ebből látja egy pillantással, meddig ér a
 * bázisa, és hol kezdődik az ellenségé. A központ a legnagyobb, a fal a
 * legkisebb (a fal nem birtokol, csak zár).
 */
const TERULET_SUGAR = [20, 12, 3, 3, 9, 12, 12, 12, 12, 11, 12];
/** A terület-szín keverési aránya SZÁZALÉKBAN a terep fölé. */
const TERULET_ARANY = 16;
/** A terület HATÁRÁN erősebb a keverés — ettől lesz belőle olvasható vonal. */
const TERULET_HATAR_ARANY = 55;

// ── Modul-szintű munkatömbök ────────────────────────────────────────────────
// Egyszer születnek, sosem nőnek, és nem kell nullázni őket: nemzedék-számláló
// dönti el, hogy egy bejegyzés a MOSTANI hívásból való-e. A `fill(0)` egy 36 864
// elemű tömbön képkockánként fölösleges munka lenne.
let _belyeg = null;
let _belyegGen = 0;
let _terulet = null;
let _teruletGen = 0;
let _teruletBelyeg = null;

function _munkatombok() {
  const m = MINIMAP_MERET * MINIMAP_MERET;
  if (_belyeg === null || _belyeg.length !== m) {
    _belyeg = new Int32Array(m);
    _terulet = new Uint8Array(m);
    _teruletBelyeg = new Int32Array(m);
  }
}

/** Üres működés-számláló. A hívó ezt adja be újra és újra — így nincs allokáció. */
export function minimapSzamlalo(ki) {
  const o = ki || {};
  o.terep = 0; o.nyers = 0; o.viz = 0; o.erdo = 0;
  o.egyseg = 0; o.epulet = 0; o.rejtett = 0; o.pont = 0;
  o.sotet = 0; o.kodos = 0; o.fenyes = 0;
  // A területet CSAPATRA BONTVA is számoljuk. Nem statisztikai kedvtelés: a
  // szivárgás-vizsgálat csak így tud különbséget tenni „a saját területem a
  // felderítetlen sávban" és „az ellenség területe kilátszik a ködből" között.
  // A kettő összege ugyanaz a szám, a JELENTÉSÜK viszont ellentétes.
  o.terulet = 0; o.teruletSajat = 0; o.teruletIdegen = 0;
  return o;
}

// ══════════════════════════════════════════════════════════════════════════
// 1. RÉTEG — TEREP (statikus)
// ══════════════════════════════════════════════════════════════════════════

/**
 * A TEREP kisütése egy RGBA pufferbe, KÖD NÉLKÜL.
 *
 * Ez a réteg a meccs alatt gyakorlatilag állandó: csak akkor változik, ha egy
 * erdő vagy kőfejtő kimerül. A hívó ezért ritkán süti ki újra.
 *
 * A szín három dologból áll össze, és mindhárom kell:
 *   • a TEREP-TÍPUS adja az alapot (víz / fű / föveny / szikla / hó),
 *   • a MAGASSÁG világosít-sötétít (a magaslat világosabb),
 *   • a LEJTŐ árnyékol (fény észak-nyugatról) — ettől lesz DOMBORZATA a képnek.
 * A lelőhely a terep HELYETT jön, nem fölé: egy erdőfolt erdőnek látszik.
 *
 * @param {import('../sim/sim.js').Sim} sim
 * @param {Uint8ClampedArray} puffer `MINIMAP_MERET² * 4` bájt
 * @param {object} [ki] újrahasznált számláló-objektum
 */
export function minimapTerep(sim, puffer, ki) {
  const M = MINIMAP_MERET;
  const n = sim.n;
  const racs = sim.racs;
  const ero = sim.eroforrasok;
  const sz = minimapSzamlalo(ki);

  // ── Magasság-tartomány: enélkül minden preset ugyanolyan lapos lenne.
  // A HEGYVIDÉK 8,5-es kilengése és a SZÁRAZFÖLD 3,8-asa nem hasonlítható
  // rögzített küszöbökhöz — a tartományt magából a pályából vesszük.
  //
  // ⚠️ CSAK A SZÁRAZFÖLDBŐL. Ez elsőre fölösleges szigorításnak látszik, és
  // mérve mégis ez dönt: a peremi tengert a generátor `-120`-as szorzóval húzza
  // le, tehát a `hMin` a nyílt mezőn is −60 körül áll. Ahhoz a minimumhoz
  // képest a valódi szárazföld (2…12) a tartomány felső TIZEDÉBE szorul, és a
  // dombok közti különbség egyetlen fényerő-lépcsőre esik össze. Mérve: a
  // fű-képpontok fényerő-szórása 2,2 volt (2 % — láthatatlan), a vízi cellák
  // kihagyásával 9,7 (11 % — ez már domborzat).
  let hMin = 1e30, hMax = -1e30;
  for (let py = 0; py < M; py++) {
    const wy = ((py * n) / M) | 0;
    for (let px = 0; px < M; px++) {
      const wx = ((px * n) / M) | 0;
      const ci = wy * n + wx;
      if (racs.terep[ci] === TEREP.VIZ) continue;
      const h = racs.kozepMagassag[ci];
      if (h < hMin) hMin = h;
      if (h > hMax) hMax = h;
    }
  }
  let hSzoras = hMax - hMin;
  if (!(hSzoras > 0.001)) { hMin = 0; hSzoras = 1; }

  for (let py = 0; py < M; py++) {
    const wy = ((py * n) / M) | 0;
    for (let px = 0; px < M; px++) {
      const wx = ((px * n) / M) | 0;
      const o = (py * M + px) * 4;
      const ci = racs.idx(wx, wy);
      if (ci < 0) {
        puffer[o] = SZIN_SOTET[0]; puffer[o + 1] = SZIN_SOTET[1];
        puffer[o + 2] = SZIN_SOTET[2]; puffer[o + 3] = 255;
        continue;
      }
      const h = racs.kozepMagassag[ci];
      const t = racs.terep[ci];

      // Van-e itt lelőhely? A `cellaNode` kimerüléskor -1-re vált, tehát a
      // kimerült erdő magától eltűnik a térképről is.
      const node = ero ? ero.cellaNode[ci] : -1;
      const fajta = node >= 0 ? ero.fajta[node] : -1;

      let r, g, b;
      if (fajta >= 0) {
        const s = SZIN_NYERS[fajta];
        r = s[0]; g = s[1]; b = s[2];
        sz.nyers++;
        if (fajta === NYERS.FA) sz.erdo++;
      } else if (t === TEREP.VIZ) {
        // MÉLYSÉG: a vízszint alatti 6 egység a teljes átmenet. A partmenti
        // sáv így világos marad, a beltengerek közepe sötét — a pálya
        // vízrajza egy pillantással olvasható.
        let m = (VIZSZINT - h) / 6;
        if (m < 0) m = 0; else if (m > 1) m = 1;
        const a = SZIN_TEREP[TEREP.VIZ];
        r = (a[0] + (SZIN_MELYVIZ[0] - a[0]) * m) | 0;
        g = (a[1] + (SZIN_MELYVIZ[1] - a[1]) * m) | 0;
        b = (a[2] + (SZIN_MELYVIZ[2] - a[2]) * m) | 0;
        sz.viz++;
      } else {
        const a = SZIN_TEREP[t] || SZIN_TEREP[TEREP.FU];
        r = a[0]; g = a[1]; b = a[2];
        sz.terep++;
      }

      if (t !== TEREP.VIZ) {
        // ── Magasság-fényerő: 0,70 … 1,32 között. A tartomány szándékosan
        // széles: a minimapon a magasság az EGYETLEN mélységi jel, a 3D-s
        // árnyékok és a horizont hiányoznak.
        let mag = (h - hMin) / hSzoras;
        if (mag < 0) mag = 0; else if (mag > 1) mag = 1;
        let f = 0.70 + mag * 0.62;
        // ── Lejtő-árnyékolás. A fény ÉSZAK-NYUGATRÓL jön (−x, −y felől), ezért
        // a nyugat-északi szomszédhoz mért emelkedés világosít. Egyetlen
        // különbség, nem normálvektor: a képpont 1,33 cella széles, egy pontos
        // normálvektor ezen a felbontáson ugyanazt adná, csak drágábban.
        const sx = wx > 0 ? wx - 1 : 0;
        const sy = wy > 0 ? wy - 1 : 0;
        const dh = h - racs.kozepMagassag[sy * n + sx];
        let arny = dh * 0.22;
        if (arny > 0.38) arny = 0.38; else if (arny < -0.38) arny = -0.38;
        f += arny;
        r = (r * f) | 0; g = (g * f) | 0; b = (b * f) | 0;
        if (r > 255) r = 255; if (g > 255) g = 255; if (b > 255) b = 255;
        if (r < 0) r = 0; if (g < 0) g = 0; if (b < 0) b = 0;
      }

      puffer[o] = r; puffer[o + 1] = g; puffer[o + 2] = b; puffer[o + 3] = 255;
    }
  }
  return sz;
}

// ══════════════════════════════════════════════════════════════════════════
// 2. RÉTEG — HÁTTÉR (terep × köd × birtokolt terület)
// ══════════════════════════════════════════════════════════════════════════

/**
 * A kész terep-rétegből HÁTTÉR: ráteszi a hadi ködöt és a birtokolt területet.
 *
 * @param {import('../sim/sim.js').Sim} sim
 * @param {Uint8ClampedArray} terep a `minimapTerep` kimenete (nem írjuk)
 * @param {Uint8ClampedArray} puffer ide írunk
 * @param {number} csapat KINEK a szemével nézzük
 * @param {object} [ki] újrahasznált számláló
 */
export function minimapHatter(sim, terep, puffer, csapat, ki) {
  const M = MINIMAP_MERET;
  const n = sim.n;
  const kod = sim.kod;
  const sz = minimapSzamlalo(ki);

  _teruletFolt(sim, csapat);
  const ter = _terulet;
  const tb = _teruletBelyeg;
  const gen = _teruletGen;

  for (let py = 0; py < M; py++) {
    const wy = ((py * n) / M) + 0.5;
    for (let px = 0; px < M; px++) {
      const wx = ((px * n) / M) + 0.5;
      const i = py * M + px;
      const o = i * 4;

      const latott = kod ? kod.latottPont(csapat, wx, wy) : true;
      if (!latott) {
        puffer[o] = SZIN_SOTET[0]; puffer[o + 1] = SZIN_SOTET[1];
        puffer[o + 2] = SZIN_SOTET[2]; puffer[o + 3] = 255;
        sz.sotet++;
        continue;
      }
      const lathato = kod ? kod.lathatoPont(csapat, wx, wy) : true;

      let r = terep[o], g = terep[o + 1], b = terep[o + 2];
      if (!lathato) {
        // Egész osztás — nincs okunk lebegőpontra egy bájt-pufferben.
        r = (r * KOD_SOTETITES / 100) | 0;
        g = (g * KOD_SOTETITES / 100) | 0;
        b = (b * KOD_SOTETITES / 100) | 0;
        sz.kodos++;
      } else {
        sz.fenyes++;
      }

      // ── BIRTOKOLT TERÜLET ───────────────────────────────────────────
      if (tb[i] === gen && ter[i] > 0) {
        const csapatE = ter[i] - 1;
        const cs = SZIN_CSAPAT[csapatE & 1];
        // Határ-e? A jobb és az alsó szomszéddal is összevetjük — a kettő
        // együtt zárt vonalat ad, egy irány önmagában szaggatottat.
        const j = px + 1 < M ? i + 1 : i;
        const k = py + 1 < M ? i + M : i;
        const hatar = (tb[j] !== gen || ter[j] !== ter[i])
          || (tb[k] !== gen || ter[k] !== ter[i]);
        const a = hatar ? TERULET_HATAR_ARANY : TERULET_ARANY;
        r = (r + ((cs[0] - r) * a) / 100) | 0;
        g = (g + ((cs[1] - g) * a) / 100) | 0;
        b = (b + ((cs[2] - b) * a) / 100) | 0;
        sz.terulet++;
        if (csapatE === csapat) sz.teruletSajat++; else sz.teruletIdegen++;
      }

      puffer[o] = r; puffer[o + 1] = g; puffer[o + 2] = b; puffer[o + 3] = 255;
    }
  }
  return sz;
}

/**
 * A birtokolt terület kitöltése a `_terulet` bélyeg-rácsba.
 *
 * ⚠️ UGYANAZ A LÁTHATÓSÁG-KAPU, MINT AZ ÉPÜLETNÉL. Lásd a fájl fejlécét: ha egy
 * ködbe rejtett ellenséges bázis körül színes folt jelenne meg, a köd értelmét
 * vesztené — és ezt semmilyen köd-szám nem fogná meg.
 */
function _teruletFolt(sim, csapat) {
  _munkatombok();
  _teruletGen = (_teruletGen + 1) & 0x3fffffff;
  const gen = _teruletGen;
  const M = MINIMAP_MERET;
  const n = sim.n;
  const ep = sim.epuletek;
  const kod = sim.kod;
  if (!ep) return;

  for (let k = 0; k < ep.db; k++) {
    if (!ep.el(k)) continue;
    const cs = ep.csapat[k];
    const sajat = cs === csapat;
    if (!sajat && kod && !kod.lathatoPont(csapat, ep.x[k], ep.y[k])) continue;
    const sugar = TERULET_SUGAR[ep.tipus[k]] ?? (EP_MERET[ep.tipus[k]] * 4);
    // Világ-sugár → minimap-képpont sugár.
    const rs = ((sugar * M) / n) | 0;
    if (rs <= 0) continue;
    const cx = ((ep.x[k] * M) / n) | 0;
    const cy = ((ep.y[k] * M) / n) | 0;
    const r2 = rs * rs;
    let y0 = cy - rs, y1 = cy + rs;
    if (y0 < 0) y0 = 0; if (y1 >= M) y1 = M - 1;
    let x0 = cx - rs, x1 = cx + rs;
    if (x0 < 0) x0 = 0; if (x1 >= M) x1 = M - 1;
    for (let y = y0; y <= y1; y++) {
      const dy = y - cy;
      const sor = y * M;
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx;
        if (dx * dx + dy * dy > r2) continue;
        const i = sor + x;
        // Ütközésnél a KISEBB csapat-index nyer — determinisztikus látvány,
        // nem attól függ, milyen sorrendben épültek a házak.
        if (_teruletBelyeg[i] === gen && _terulet[i] !== 0
          && _terulet[i] - 1 <= cs) continue;
        _teruletBelyeg[i] = gen;
        _terulet[i] = (cs + 1) & 255;
      }
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════
// 3. RÉTEG — MOZGÓ (épület, egység) — KÉPKOCKÁNKÉNT
// ══════════════════════════════════════════════════════════════════════════

/**
 * Épületek és egységek rárajzolása egy KÉSZ háttérre.
 *
 * ── MIÉRT NEM 1600 RAJZOLÁS ────────────────────────────────────────────────
 * 1600 egység mellett egy rajzfelület-hívásonkénti pötty (`fillRect`) 1600
 * állapotváltást jelentene képkockánként. Itt viszont EGY bájt-pufferbe írunk,
 * és képpont-BÉLYEGGEL ritkítunk: ha egy 1,33 cellás képpontra már került azonos
 * csapatú pont, a következő ugyanoda eső egység csak SZÁMÍT, de nem ír. Egy
 * összetömörült 200 fős sereg így ~30 képpont-írás, nem 200.
 *
 * A számláló ezért kettős: `egyseg` = ahány egység átjutott a köd-kapun (ez a
 * régi, szondákhoz kötött jelentés), `pont` = ahány képpontot ténylegesen
 * írtunk. A kettő hányadosa MÉRI a ritkítást.
 *
 * @param {import('../sim/sim.js').Sim} sim
 * @param {Uint8ClampedArray} puffer háttérrel már feltöltve
 * @param {number} csapat
 * @param {object} [ki] újrahasznált számláló
 */
export function minimapMozgo(sim, puffer, csapat, ki) {
  _munkatombok();
  // A nemzedék-számláló körbefordul, mielőtt a `gen * 4` túlcsordulna — a
  // bélyeg-tömböt így SOSEM kell nullázni, se most, se 42 nap múlva.
  _belyegGen = (_belyegGen + 1) & 0x03ffffff;
  const gen = _belyegGen;
  const M = MINIMAP_MERET;
  const n = sim.n;
  const kod = sim.kod;
  const sz = minimapSzamlalo(ki);

  // ── ÉPÜLETEK ────────────────────────────────────────────────────────
  // Az épületek az EGYSÉGEK ELŐTT mennek: egy mozgó katona takarja a saját
  // épületét, nem fordítva. Egy bázis képe fontosabb, mint egy járőr pontja.
  // A méret az ALAPTERÜLETBŐL jön: a 3×3-as központ nagyobb folt, mint a fal.
  const ep = sim.epuletek;
  if (ep) {
    for (let k = 0; k < ep.db; k++) {
      if (!ep.el(k)) continue;
      const sajat = ep.csapat[k] === csapat;
      if (!sajat && kod && !kod.lathatoPont(csapat, ep.x[k], ep.y[k])) {
        sz.rejtett++; continue;
      }
      const m = EP_MERET[ep.tipus[k]] || 1;
      // Világ-cella → képpont: 3 cellás központ 192/256 aránnyal 2,25 képpont,
      // tehát 1 sugár. A fal 1 cellás: 0 sugár, egyetlen pont.
      const sugar = m >= 3 ? 1 : 0;
      // Az ÉPÜLŐ épület halványabb — látszik, hogy még nem áll.
      const kesz = ep.epulHatra ? ep.epulHatra[k] === 0 : true;
      const szin = SZIN_CSAPAT[ep.csapat[k] & 1];
      if (_pont(puffer, M, n, ep.x[k], ep.y[k], szin, sugar, kesz ? 100 : 55, sz)) {
        sz.epulet++;
      }
    }
  }

  // ── EGYSÉGEK ────────────────────────────────────────────────────────
  const e = sim.egysegek;
  if (e) {
    const elo = sim.harc ? sim.harc.elo : null;
    const bent = sim.beszallas ? sim.beszallas.bent : null;
    for (let i = 0; i < e.db; i++) {
      if (elo && !elo[i]) continue;
      if (bent && bent[i] === 1) continue;
      const sajat = e.csapat[i] === csapat;
      // ⚠️ ITT DŐL EL, HOGY A KÖDNEK VAN-E ÉRTELME. Lásd a fejlécet.
      if (!sajat && kod && !kod.lathatoPont(csapat, e.px[i], e.py[i])) {
        sz.rejtett++; continue;
      }
      const px = ((e.px[i] * M) / n) | 0;
      const py = ((e.py[i] * M) / n) | 0;
      if (px < 0 || py < 0 || px >= M || py >= M) continue;
      sz.egyseg++;
      // ── RITKÍTÁS. Egy képpontra csapatonként EGY pont kerül.
      const bi = py * M + px;
      const jel = gen * 4 + (e.csapat[i] & 1);
      if (_belyeg[bi] === jel) continue;
      _belyeg[bi] = jel;
      const o = bi * 4;
      const c = SZIN_CSAPAT_VILAGOS[e.csapat[i] & 1];
      puffer[o] = c[0]; puffer[o + 1] = c[1]; puffer[o + 2] = c[2]; puffer[o + 3] = 255;
      sz.pont++;
    }
  }
  return sz;
}

/**
 * Egy pont (vagy kis négyzet) írása világkoordinátára.
 * @param {number} eros 0..100 — keverési arány a meglévő képpont fölé
 * @returns {boolean} rákerült-e egyáltalán a képre
 */
function _pont(puffer, M, n, wx, wy, szin, sugar, eros, sz) {
  const px = ((wx * M) / n) | 0;
  const py = ((wy * M) / n) | 0;
  if (px < 0 || py < 0 || px >= M || py >= M) return false;
  for (let dy = -sugar; dy <= sugar; dy++) {
    const y = py + dy;
    if (y < 0 || y >= M) continue;
    for (let dx = -sugar; dx <= sugar; dx++) {
      const x = px + dx;
      if (x < 0 || x >= M) continue;
      const o = (y * M + x) * 4;
      if (eros >= 100) {
        puffer[o] = szin[0]; puffer[o + 1] = szin[1]; puffer[o + 2] = szin[2];
      } else {
        puffer[o] = (puffer[o] + ((szin[0] - puffer[o]) * eros) / 100) | 0;
        puffer[o + 1] = (puffer[o + 1] + ((szin[1] - puffer[o + 1]) * eros) / 100) | 0;
        puffer[o + 2] = (puffer[o + 2] + ((szin[2] - puffer[o + 2]) * eros) / 100) | 0;
      }
      puffer[o + 3] = 255;
      if (sz) sz.pont++;
    }
  }
  return true;
}

// ══════════════════════════════════════════════════════════════════════════
// EGYBEN — a régi felület (szondák, egyszerű hívók)
// ══════════════════════════════════════════════════════════════════════════

/**
 * A minimap-puffer feltöltése EGY hívásban: terep + köd + terület + mozgó.
 *
 * ⚠️ EZ A LASSÚ ÚT, és szándékosan az. A determinizmus-szonda v0.7 óta ezt hívja,
 * és a visszaadott kulcsok (`terep nyers egyseg epulet sotet kodos rejtett`) oda
 * vannak kötve — ezért nem tűnhetnek el. A JÁTÉK viszont a három réteget külön
 * hívja, mert csak a harmadiknak kell képkockánként futnia.
 *
 * @param {import('../sim/sim.js').Sim} sim
 * @param {Uint8ClampedArray} puffer `MINIMAP_MERET² * 4` bájt
 * @param {number} csapat KINEK a szemével nézzük
 * @returns {{terep:number, nyers:number, egyseg:number, epulet:number,
 *            sotet:number, kodos:number, rejtett:number, viz:number,
 *            erdo:number, terulet:number, pont:number, fenyes:number}}
 *   Működés-számok a szondának és a HUD-nak. A `rejtett` a ködben MARADT
 *   idegen egységek és épületek száma — ez bizonyítja, hogy a köd tényleg takar.
 */
export function minimapAdat(sim, puffer, csapat = 0) {
  const M = MINIMAP_MERET;
  const kell = M * M * 4;
  // Saját terep-puffer, mert a hívó csak egyet adott. Ez az az allokáció,
  // amiért ez az út nem való képkockánkénti hívásra.
  const terep = new Uint8ClampedArray(kell);
  const t = minimapTerep(sim, terep);
  const h = minimapHatter(sim, terep, puffer, csapat);
  const m = minimapMozgo(sim, puffer, csapat);
  return {
    terep: t.terep, nyers: t.nyers, viz: t.viz, erdo: t.erdo,
    sotet: h.sotet, kodos: h.kodos, fenyes: h.fenyes, terulet: h.terulet,
    teruletSajat: h.teruletSajat, teruletIdegen: h.teruletIdegen,
    egyseg: m.egyseg, epulet: m.epulet, rejtett: m.rejtett, pont: m.pont,
  };
}

// ══════════════════════════════════════════════════════════════════════════
// KOORDINÁTA-VÁLTÁS ÉS A NÉZET-KERET
// ══════════════════════════════════════════════════════════════════════════

/** Minimap-képpont → VILÁGKOORDINÁTA. A kattintás ezt használja. */
export function minimapVilagra(sim, px, py, ki) {
  const o = ki || { x: 0, y: 0 };
  o.x = (px * sim.n) / MINIMAP_MERET;
  o.y = (py * sim.n) / MINIMAP_MERET;
  return o;
}

/** VILÁGKOORDINÁTA → minimap-képpont. */
export function minimapKeppontra(sim, wx, wy, ki) {
  const o = ki || { x: 0, y: 0 };
  o.x = (wx * MINIMAP_MERET) / sim.n;
  o.y = (wy * MINIMAP_MERET) / sim.n;
  return o;
}

/**
 * A KAMERA NÉZET-KERETE minimap-képpontban: négy sarok, nyolc szám.
 *
 * ── MIÉRT NEM TÉGLALAP ────────────────────────────────────────────────────
 * A kamera ferdén néz a talajra, tehát a látott terület TRAPÉZ: a képernyő
 * teteje messzebb van, mint az alja. Egy téglalap-közelítés kis dőlésnél még
 * elmenne, 20°-nál viszont a valós látótér kétszerese lenne a rajzolt keret —
 * és pont az veszne el, amiért a keret ott van: hogy a játékos TUDJA, mit lát.
 *
 * A számítás a kamera négy sarok-sugarát metszi a talajsíkkal. Ha egy sugár a
 * horizont fölé mutat (`dy >= 0`), nincs metszéspont: ilyenkor egy távoli
 * pontot adunk vissza a sugár mentén, és a rajzoló levágja a minimap szélén.
 *
 * ⚠️ Ez a függvény NEM tud a `three`-ről: számokat olvas (`objektum.fov`,
 * `objektum.aspect`) és számokat ír. Így node-ban is szondázható.
 *
 * @param {import('../sim/sim.js').Sim} sim
 * @param {{x:number,y:number,z:number,tav:number,forgas:number,doles:number,
 *          objektum?:{fov:number,aspect:number}}} kamera
 * @param {Float64Array|number[]} ki legalább 8 elem
 * @returns {boolean} sikerült-e (érvényes kamera-számok)
 */
export function minimapNezetKeret(sim, kamera, ki) {
  if (!kamera || !ki) return false;
  const tav = kamera.tav;
  const forgas = kamera.forgas;
  const doles = kamera.doles;
  if (!Number.isFinite(tav) || !Number.isFinite(forgas) || !Number.isFinite(doles)) return false;

  const cd = Math.cos(doles), sd = Math.sin(doles);
  // A kamera HELYE — ugyanaz a képlet, ami a `camera3d.js` `_alkalmaz()`-ában.
  const cx = kamera.x + Math.sin(forgas) * cd * tav;
  const cy = kamera.y + sd * tav;
  const cz = kamera.z + Math.cos(forgas) * cd * tav;

  // Előre-irány a nézőpontból a célpontba.
  let fx = kamera.x - cx, fy = kamera.y - cy, fz = kamera.z - cz;
  const fh = Math.sqrt(fx * fx + fy * fy + fz * fz);
  if (!(fh > 1e-6)) return false;
  fx /= fh; fy /= fh; fz /= fh;

  // Jobb-irány = előre × világ-fel, majd a valódi fel = jobb × előre.
  // A `cross(f, (0,1,0))` kifejtve pontosan `(-fz, 0, fx)`.
  let rx = -fz, ry = 0, rz = fx;
  const rh = Math.sqrt(rx * rx + ry * ry + rz * rz);
  if (!(rh > 1e-6)) return false;
  rx /= rh; ry /= rh; rz /= rh;
  const ux = ry * fz - rz * fy;
  const uy = rz * fx - rx * fz;
  const uz = rx * fy - ry * fx;

  const o = kamera.objektum;
  const fokRad = Math.PI / 180;
  const fov = (o && Number.isFinite(o.fov) ? o.fov : 48) * fokRad;
  const keparany = (o && Number.isFinite(o.aspect) && o.aspect > 0.05) ? o.aspect : 1.6;
  const tv = Math.tan(fov * 0.5);
  const th = tv * keparany;

  // A talajsík magassága: a kamera CÉLPONTJÁÉ. A minimap síkban gondolkodik,
  // a domborzat pár egységnyi eltérése ezen a felbontáson nem látszik.
  const talaj = kamera.y;
  // Ha a sugár a horizont fölé megy, eddig a távolságig követjük.
  const maxT = tav * 8 + sim.n;
  const M = MINIMAP_MERET;
  const pxArany = M / sim.n;

  // Sarok-sorrend: bal-hátsó, jobb-hátsó, jobb-elülső, bal-elülső — így a
  // rajzoló egyszerű sokszögként húzhatja meg, keresztezés nélkül.
  const sarkok = _SARKOK;
  for (let k = 0; k < 4; k++) {
    const sx = sarkok[k * 2], sy = sarkok[k * 2 + 1];
    const dx = fx + rx * sx * th + ux * sy * tv;
    const dy = fy + ry * sx * th + uy * sy * tv;
    const dz = fz + rz * sx * th + uz * sy * tv;
    let t;
    if (dy < -1e-6) {
      t = (talaj - cy) / dy;
      if (!(t > 0)) t = maxT;
      if (t > maxT) t = maxT;
    } else {
      t = maxT;
    }
    ki[k * 2] = (cx + dx * t) * pxArany;
    ki[k * 2 + 1] = (cz + dz * t) * pxArany;
  }
  return true;
}

/** A négy képernyő-sarok NDC-ben. Modul-szintű, hogy ne allokáljunk. */
const _SARKOK = [-1, 1, 1, 1, 1, -1, -1, -1];
