// AGE OF THE CRYSTALS — A MINIMAP KÉPPONTJAI (v0.7/3).
//
// ── MIÉRT KÜLÖN FÁJL A RAJZOLÁSTÓL ────────────────────────────────────────
// Ez a modul NEM tud a DOM-ról, a `three`-ről és a vászonról. Egyetlen dolgot
// csinál: a szimuláció állapotából feltölt egy RGBA bájt-puffert. A `minimap.js`
// aztán ezt a puffert teszi ki a képernyőre, kattintást kezel, és mást nem.
//
// A szétválasztás oka gyakorlati: így a minimap NODE-BAN IS FUTTATHATÓ, tehát a
// determinizmus-szonda vizsgálni tudja. Egy vászonba rajzoló minimapról csak
// szemmel derülne ki, ha elromlik — a felhőben pedig nincs szem (nincs GPU).
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

import { TEREP } from '../sim/grid.js';
import { NYERS } from '../sim/eroforras.js';

/** A minimap oldalhossza képpontban. Négyzetes, mint a pálya. */
export const MINIMAP_MERET = 192;

/** Terep-színek `TEREP.*` szerint: víz, fű, föveny, szikla, havas. */
const SZIN_TEREP = [
  [26, 52, 86], [46, 82, 44], [120, 108, 74], [92, 92, 98], [188, 194, 202],
];
/** Nyersanyag-színek `NYERS.*` szerint. */
const SZIN_NYERS = [
  [176, 58, 74], [40, 104, 52], [150, 154, 162], [128, 96, 200],
];
/** Csapat-színek. Ugyanaz a két szín, amit a `gazdasag3d.js` használ. */
const SZIN_CSAPAT = [[63, 127, 208], [208, 106, 63]];

/** A „valaha láttam, de most nem" terület sötétítése SZÁZALÉKBAN. */
const KOD_SOTETITES = 45;

/**
 * A minimap-puffer feltöltése.
 *
 * @param {import('../sim/sim.js').Sim} sim
 * @param {Uint8ClampedArray} puffer `MINIMAP_MERET * MINIMAP_MERET * 4` bájt
 * @param {number} csapat KINEK a szemével nézzük
 * @returns {{terep:number, nyers:number, egyseg:number, epulet:number,
 *            sotet:number, kodos:number, rejtett:number}}
 *   Működés-számok a szondának és a HUD-nak. A `rejtett` a ködben MARADT
 *   idegen egységek száma — ez bizonyítja, hogy a köd tényleg takar.
 */
export function minimapAdat(sim, puffer, csapat = 0) {
  const M = MINIMAP_MERET;
  const n = sim.n;
  const racs = sim.racs;
  const kod = sim.kod;
  const szamlalo = { terep: 0, nyers: 0, egyseg: 0, epulet: 0, sotet: 0, kodos: 0, rejtett: 0 };

  // ── 1. TEREP ÉS KÖD ────────────────────────────────────────────────
  // Képpontonként EGY mintavétel a pálya közepéből. Nem átlagolunk: a minimap
  // tájékozódásra való, nem szépnek kell lennie, az átlagolás pedig a partokat
  // és a sziklákat egyaránt szürke masszává mosná.
  for (let py = 0; py < M; py++) {
    const wy = ((py * n) / M) | 0;
    for (let px = 0; px < M; px++) {
      const wx = ((px * n) / M) | 0;
      const o = (py * M + px) * 4;
      const ci = racs.idx(wx, wy);
      const lathato = kod.lathatoPont(csapat, wx + 0.5, wy + 0.5);
      const latott = kod.latottPont(csapat, wx + 0.5, wy + 0.5);

      if (!latott) {
        puffer[o] = 6; puffer[o + 1] = 8; puffer[o + 2] = 12; puffer[o + 3] = 255;
        szamlalo.sotet++;
        continue;
      }

      let sz = SZIN_TEREP[ci >= 0 ? racs.terep[ci] : TEREP.VIZ];
      // Van-e itt nyersanyag? A `cellaNode` a kimerüléskor -1-re vált, tehát a
      // kimerült lelőhely magától eltűnik a térképről is.
      const node = ci >= 0 ? sim.eroforrasok.cellaNode[ci] : -1;
      if (node >= 0) { sz = SZIN_NYERS[sim.eroforrasok.fajta[node]]; szamlalo.nyers++; }
      else szamlalo.terep++;

      if (lathato) {
        puffer[o] = sz[0]; puffer[o + 1] = sz[1]; puffer[o + 2] = sz[2];
      } else {
        // Egész osztás — nincs okunk lebegőpontra egy bájt-pufferben.
        puffer[o] = (sz[0] * KOD_SOTETITES / 100) | 0;
        puffer[o + 1] = (sz[1] * KOD_SOTETITES / 100) | 0;
        puffer[o + 2] = (sz[2] * KOD_SOTETITES / 100) | 0;
        szamlalo.kodos++;
      }
      puffer[o + 3] = 255;
    }
  }

  // ── 2. ÉPÜLETEK ────────────────────────────────────────────────────
  // Az épületek az EGYSÉGEK ELŐTT mennek: egy mozgó katona takarja a saját
  // épületét, nem fordítva. Egy bázis képe fontosabb, mint egy járőr pontja.
  const ep = sim.epuletek;
  for (let k = 0; k < ep.db; k++) {
    if (!ep.el(k)) continue;
    const sajat = ep.csapat[k] === csapat;
    if (!sajat && !kod.lathatoPont(csapat, ep.x[k], ep.y[k])) { szamlalo.rejtett++; continue; }
    if (_pont(puffer, M, n, ep.x[k], ep.y[k], SZIN_CSAPAT[ep.csapat[k] & 1], 1)) szamlalo.epulet++;
  }

  // ── 3. EGYSÉGEK ────────────────────────────────────────────────────
  const e = sim.egysegek;
  for (let i = 0; i < e.db; i++) {
    if (!sim.harc.elo[i] || sim.beszallas.bent[i] === 1) continue;
    const sajat = e.csapat[i] === csapat;
    // ⚠️ ITT DŐL EL, HOGY A KÖDNEK VAN-E ÉRTELME. Lásd a fejlécet.
    if (!sajat && !kod.lathatoPont(csapat, e.px[i], e.py[i])) { szamlalo.rejtett++; continue; }
    if (_pont(puffer, M, n, e.px[i], e.py[i], SZIN_CSAPAT[e.csapat[i] & 1], 0)) szamlalo.egyseg++;
  }

  return szamlalo;
}

/**
 * Egy pont (vagy kis négyzet) rajzolása világkoordinátára.
 * @returns {boolean} rákerült-e egyáltalán a képre
 */
function _pont(puffer, M, n, wx, wy, szin, sugar) {
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
      puffer[o] = szin[0]; puffer[o + 1] = szin[1]; puffer[o + 2] = szin[2];
      puffer[o + 3] = 255;
    }
  }
  return true;
}

/** Minimap-képpont → VILÁGKOORDINÁTA. A kattintás ezt használja. */
export function minimapVilagra(sim, px, py) {
  return { x: (px * sim.n) / MINIMAP_MERET, y: (py * sim.n) / MINIMAP_MERET };
}
