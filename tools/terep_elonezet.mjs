// AGE OF THE CRYSTALS — SZOFTVERES TEREP-ELŐNÉZET (v0.16).
//
// HASZNÁLAT:  node tools/terep_elonezet.mjs [kimeneti_könyvtár]
// Kilépési kód: mindig 0 — ez NEM kapu, hanem SZEM. Nem ítél, képet ad.
//
// ── MIÉRT VAN EGYÁLTALÁN SAJÁT RASZTERIZÁLÓ ───────────────────────────────
// A terep-paletta munkája FELHŐBEN készült, ahol nincs GPU: a `npm run fps`
// és a `tools/kep.mjs` ott megtagadja a mérést, tehát a látványt SEMMILYEN
// kapu nem tudja megnézni. A determinizmus-szonda zöld marad attól is, hogy a
// pálya egyetlen zöld szőnyeg — pontosan ez volt a v0.10 állapota.
//
// Ez a fájl ezért kirajzolja mind a hat presetet egy egyszerű z-pufferes
// rasztarizálóval, UGYANAZZAL a fény-modellel, amit a `core3d.js` állít be
// (irány- és félgömbfény, ACES tone mapping, sRGB kimenet). Nem pixelpontos
// mása a WebGL-nek, és nem is akar az lenni: azt kell megmutatnia, ELÉG
// VÁLTOZATOS-E a talaj és nincs-e benne szabályos minta.
//
// Amit ténylegesen FOGOTT, és amit egyetlen kapu sem fogott volna meg:
//   • a kristálymező szikrája szabályos fehér PONTRÁCCSÁ állt össze,
//   • a szemcse két szinusz szorzata volt, tehát átlós HÍMZÉS-mintát adott,
//   • a sziklafal rétegzése SZINTVONALAKAT rajzolt a peremgerincre,
//   • a hegyvidék és a szárazföld nedvesség-mediánja 0,00-ra lapult, vagyis
//     az a két pálya egyetlen tömör színfolt lett.
//
// ⚠️ EZ NEM MÉRŐESZKÖZ. A képei nem mondanak semmit sebességről, és nem
// helyettesítik a `npm run fps`-t az iMac-en. Csak azt mutatják meg, mit lát
// majd a játékos.
//
// ⚠️ NINCS VÁGÓSÍK-KEZELÉSE. Ezért van a vízsík rácsra bontva: egy pályányi
// négyszög egyik sarka mindig a kamera mögött van, és vágás nélkül az EGÉSZ
// lap eltűnne — ez a rasztarizáló korlátja, nem a motoré.

import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { Racs, TEREP, VIZSZINT } from '../src/sim/grid.js';
import { TERKEP_NEV, TERKEP_DB } from '../src/sim/terkep.js';
import { talajSzinek, arculat, hexLin, MELYSEG_REF, melysegTerkep }
  from '../src/render/terep_paletta.js';

const KI = process.argv[2] || new URL('../qa', import.meta.url).pathname;
mkdirSync(KI, { recursive: true });
const SEED = 20260803;
const N = 192;

// ── fény (core3d.js) ────────────────────────────────────────────────────────
const NAP_SZIN = hexLin(0xfff0d6).map((c) => c * 2.15);
const EG_SZIN = hexLin(0xbcd9f5).map((c) => c * 1.05);
const FOLD_SZIN = hexLin(0x4d4433).map((c) => c * 1.05);
const L = norm([0.55, 1.0, 0.35]);
const RPI = 1 / Math.PI;

function norm(v) { const d = Math.hypot(v[0], v[1], v[2]); return [v[0] / d, v[1] / d, v[2] / d]; }

function vilagit(nx, ny, nz, r, g, b, ki) {
  const dnl = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
  const hw = 0.5 * ny + 0.5;
  for (let k = 0; k < 3; k++) {
    const nap = NAP_SZIN[k] * dnl;
    const eg = FOLD_SZIN[k] + (EG_SZIN[k] - FOLD_SZIN[k]) * hw;
    ki[k] = (nap + eg) * RPI;
  }
  ki[0] *= r; ki[1] *= g; ki[2] *= b;
}

// ── ACES (three) + sRGB ─────────────────────────────────────────────────────
function aces(c) {
  const v = [c[0] / 0.6, c[1] / 0.6, c[2] / 0.6];
  let x = 0.59719 * v[0] + 0.35458 * v[1] + 0.04823 * v[2];
  let y = 0.07600 * v[0] + 0.90834 * v[1] + 0.01566 * v[2];
  let z = 0.02840 * v[0] + 0.13383 * v[1] + 0.83777 * v[2];
  const fit = (u) => (u * (u + 0.0245786) - 0.000090537) / (u * (0.983729 * u + 0.432951) + 0.238081);
  x = fit(x); y = fit(y); z = fit(z);
  const o = [
    1.60475 * x - 0.53108 * y - 0.07367 * z,
    -0.10208 * x + 1.10813 * y - 0.00605 * z,
    -0.00327 * x - 0.07276 * y + 1.07602 * z,
  ];
  for (let k = 0; k < 3; k++) o[k] = Math.min(1, Math.max(0, o[k]));
  return o;
}
function srgb(c) { return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; }

// ── mátrix ──────────────────────────────────────────────────────────────────
function nezet(sz, cel, fel) {
  const z = norm([sz[0] - cel[0], sz[1] - cel[1], sz[2] - cel[2]]);
  const x = norm(kereszt(fel, z));
  const y = kereszt(z, x);
  return [
    x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0,
    -(x[0] * sz[0] + x[1] * sz[1] + x[2] * sz[2]),
    -(y[0] * sz[0] + y[1] * sz[1] + y[2] * sz[2]),
    -(z[0] * sz[0] + z[1] * sz[1] + z[2] * sz[2]), 1,
  ];
}
function kereszt(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function perspektiva(fov, ar, kozel, tavol) {
  const t = 1 / Math.tan(fov * 0.5 * Math.PI / 180);
  return [t / ar, 0, 0, 0, 0, t, 0, 0, 0, 0, (tavol + kozel) / (kozel - tavol), -1,
    0, 0, 2 * tavol * kozel / (kozel - tavol), 0];
}
function szoroz(a, b) {
  const k = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let i = 0; i < 4; i++) s += a[i * 4 + r] * b[c * 4 + i];
    k[c * 4 + r] = s;
  }
  return k;
}

// ── PNG ─────────────────────────────────────────────────────────────────────
function crc32(buf) {
  let c, t = crc32.t;
  if (!t) {
    t = crc32.t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
  }
  let r = -1;
  for (let i = 0; i < buf.length; i++) r = t[(r ^ buf[i]) & 255] ^ (r >>> 8);
  return (r ^ -1) >>> 0;
}
function darab(tipus, adat) {
  const h = Buffer.alloc(8);
  h.writeUInt32BE(adat.length, 0); h.write(tipus, 4, 'ascii');
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc32(Buffer.concat([Buffer.from(tipus, 'ascii'), adat])), 0);
  return Buffer.concat([h, adat, c]);
}
function pngIr(ut, sz, ma, rgb) {
  const nyers = Buffer.alloc((sz * 3 + 1) * ma);
  for (let y = 0; y < ma; y++) {
    nyers[y * (sz * 3 + 1)] = 0;
    rgb.copy ? rgb.copy(nyers, y * (sz * 3 + 1) + 1, y * sz * 3, (y + 1) * sz * 3)
      : Buffer.from(rgb.subarray(y * sz * 3, (y + 1) * sz * 3)).copy(nyers, y * (sz * 3 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(sz, 0); ihdr.writeUInt32BE(ma, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  writeFileSync(ut, Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    darab('IHDR', ihdr), darab('IDAT', deflateSync(nyers, { level: 6 })), darab('IEND', Buffer.alloc(0)),
  ]));
}

// ── terep-adat ──────────────────────────────────────────────────────────────
function normalisok(racs) {
  const n = racs.n, s = n + 1, mag = racs.magassag;
  const ki = new Float32Array(s * s * 3);
  for (let j = 0; j <= n; j++) {
    const sor = j * s, fent = (j > 0 ? j - 1 : 0) * s, lent = (j < n ? j + 1 : n) * s;
    for (let i = 0; i <= n; i++) {
      const bal = mag[sor + (i > 0 ? i - 1 : 0)], jobb = mag[sor + (i < n ? i + 1 : n)];
      let nx = (bal - jobb) * 0.5, ny = 1, nz = (mag[fent + i] - mag[lent + i]) * 0.5;
      const h = Math.hypot(nx, ny, nz) || 1;
      const p = (sor + i) * 3;
      ki[p] = nx / h; ki[p + 1] = ny / h; ki[p + 2] = nz / h;
    }
  }
  return ki;
}
function kavar(i, mag) {
  let h = (i ^ mag) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
/** @param {boolean} regi a v0.10 öt-hexás palettája (összehasonlításhoz) */
function csucsSzinek(racs, regi) {
  const n = racs.n, s = n + 1;
  let cella;
  if (regi) {
    const R = [];
    R[TEREP.VIZ] = 0x35596b; R[TEREP.FU] = 0x5f9143; R[TEREP.FOVENY] = 0xd9c58f;
    R[TEREP.SZIKLA] = 0x8d8880; R[TEREP.HAVAS] = 0xf0f3f6;
    cella = new Float32Array(n * n * 3);
    for (let i = 0; i < n * n; i++) {
      const c = hexLin(R[racs.terep[i]]);
      cella[i * 3] = c[0]; cella[i * 3 + 1] = c[1]; cella[i * 3 + 2] = c[2];
    }
  } else cella = talajSzinek(racs);
  const ki = new Float32Array(s * s * 3);
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
    let r = 0, g = 0, b = 0, db = 0;
    for (let dy = -1; dy <= 0; dy++) {
      const cy = j + dy; if (cy < 0 || cy >= n) continue;
      for (let dx = -1; dx <= 0; dx++) {
        const cx = i + dx; if (cx < 0 || cx >= n) continue;
        const p = (cy * n + cx) * 3;
        r += cella[p]; g += cella[p + 1]; b += cella[p + 2]; db++;
      }
    }
    if (!db) { r = cella[0]; g = cella[1]; b = cella[2]; db = 1; }
    const f = (0.97 + (kavar(j * s + i, 0x1b873f) & 1023) / 1023 * 0.06) / db;
    const q = (j * s + i) * 3;
    ki[q] = r * f; ki[q + 1] = g * f; ki[q + 2] = b * f;
  }
  return ki;
}

// ── fragment-folt (terep_shader.js JS-mása) ─────────────────────────────────
function talajFolt(arc, sziklaLejto, wx, wy, wz, nx, ny, nz, pix, ki) {
  const lejt = Math.hypot(nx, nz) / Math.max(ny, 0.08);
  const finomSuly = 1 - simaLepcso(0.35, 1.5, pix);
  const m1 = Math.sin(wx * 0.0731 + wz * 0.0412 + 0.7);
  const m2 = Math.sin(wz * 0.0913 - wx * 0.0281 + 2.3);
  const m3 = Math.sin((wx + wz) * 0.0197 - 1.1);
  const makro = (m1 + m2 + m3) * 0.33333;
  const mk = Math.sin(wx * 0.51 - wz * 0.43 + 1.9);
  const szemcse = Math.sin(wx * 0.79 + wz * 0.63 + mk * 2.6 + m1 * 3.1)
    * Math.sin(wz * 0.71 - wx * 0.55 - mk * 2.2 + m2 * 2.7);
  const m = 1 + makro * arc.makroEro + szemcse * finomSuly * arc.finomEro;
  ki[0] *= m; ki[1] *= m; ki[2] *= m;
  const fal = simaLepcso(sziklaLejto * 0.55, sziklaLejto * 1.15, lejt);
  if (fal > 0.001) {
    const reteg = Math.sin(wy * 1.90 + makro * 3.0 + szemcse * 1.1);
    const sv = hexLin(arc.sziklaVilagos);
    for (let k = 0; k < 3; k++) {
      const kozet = (ki[k] + (sv[k] - ki[k]) * 0.55) * (1 + reteg * arc.retegEro);
      ki[k] += (kozet - ki[k]) * fal * arc.falEro;
    }
  }
  if (arc.csillam > 0) {
    const sz = Math.max(0, makro) * (1 - fal) * arc.csillam;
    const h = hexLin(arc.hab);
    ki[0] += h[0] * sz; ki[1] += h[1] * sz; ki[2] += h[2] * sz;
  }
}
function simaLepcso(a, b, x) {
  let t = (x - a) / (b - a);
  if (!(t > 0)) t = 0; else if (t > 1) t = 1;
  return t * t * (3 - 2 * t);
}

// ── rajzolás ────────────────────────────────────────────────────────────────
function rajzol(racs, sz, ma, kamPoz, kamCel, fov, regi) {
  const n = racs.n, s = n + 1, mag = racs.magassag;
  const nrm = normalisok(racs);
  const szin = csucsSzinek(racs, regi);
  const arc = arculat(racs.terkep | 0);
  const sziklaLejto = racs.p.sziklaLejto;
  const mp = szoroz(perspektiva(fov, sz / ma, 0.5, 2000), nezet(kamPoz, kamCel, [0, 1, 0]));

  const kep = new Float32Array(sz * ma * 3);
  const zp = new Float32Array(sz * ma).fill(Infinity);
  // háttér (core3d HATTER_SZIN közelítése: sötét kékes ég)
  const eg = hexLin(0x121a24);
  for (let i = 0; i < sz * ma; i++) { kep[i * 3] = eg[0]; kep[i * 3 + 1] = eg[1]; kep[i * 3 + 2] = eg[2]; }

  const pxVilag = 2 * Math.tan(fov * 0.5 * Math.PI / 180) / ma;
  const V = [];   // csúcsok képernyőn: [x,y,invW,vilagY,tav]
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
    const g = j * s + i;
    const x = i, y = mag[g], z = j;
    const cx = mp[0] * x + mp[4] * y + mp[8] * z + mp[12];
    const cy = mp[1] * x + mp[5] * y + mp[9] * z + mp[13];
    const cw = mp[3] * x + mp[7] * y + mp[11] * z + mp[15];
    const dx = x - kamPoz[0], dy = y - kamPoz[1], dz = z - kamPoz[2];
    V.push([cx, cy, cw, y, Math.hypot(dx, dy, dz)]);
  }

  const szinTmp = [0, 0, 0], kiTmp = [0, 0, 0];
  const haromszog = (ia, ib, ic) => {
    const a = V[ia], b = V[ib], c = V[ic];
    if (a[2] <= 0.1 || b[2] <= 0.1 || c[2] <= 0.1) return;
    const ax = (a[0] / a[2] * 0.5 + 0.5) * sz, ay = (0.5 - a[1] / a[2] * 0.5) * ma;
    const bx = (b[0] / b[2] * 0.5 + 0.5) * sz, by = (0.5 - b[1] / b[2] * 0.5) * ma;
    const cx = (c[0] / c[2] * 0.5 + 0.5) * sz, cy = (0.5 - c[1] / c[2] * 0.5) * ma;
    const ter = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (ter === 0) return;
    let x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
    let x1 = Math.min(sz - 1, Math.ceil(Math.max(ax, bx, cx)));
    let y0 = Math.max(0, Math.floor(Math.min(ay, by, cy)));
    let y1 = Math.min(ma - 1, Math.ceil(Math.max(ay, by, cy)));
    if (x1 < x0 || y1 < y0) return;
    const iwa = 1 / a[2], iwb = 1 / b[2], iwc = 1 / c[2];
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const fx = px + 0.5, fy = py + 0.5;
        let w0 = ((bx - ax) * (fy - ay) - (by - ay) * (fx - ax)) / ter;
        let w1 = ((fx - ax) * (cy - ay) - (fy - ay) * (cx - ax)) / ter;
        const l2 = w0, l1 = w1, l0 = 1 - w0 - w1;
        if (l0 < 0 || l1 < 0 || l2 < 0) continue;
        const iw = l0 * iwa + l1 * iwb + l2 * iwc;
        const z = 1 / iw;
        const p = py * sz + px;
        if (z >= zp[p]) continue;
        zp[p] = z;
        const pa = l0 * iwa / iw, pb = l1 * iwb / iw, pc = l2 * iwc / iw;
        const na = ia * 3, nb = ib * 3, nc = ic * 3;
        let nx = nrm[na] * pa + nrm[nb] * pb + nrm[nc] * pc;
        let ny = nrm[na + 1] * pa + nrm[nb + 1] * pb + nrm[nc + 1] * pc;
        let nz = nrm[na + 2] * pa + nrm[nb + 2] * pb + nrm[nc + 2] * pc;
        const nh = Math.hypot(nx, ny, nz) || 1; nx /= nh; ny /= nh; nz /= nh;
        kiTmp[0] = szin[na] * pa + szin[nb] * pb + szin[nc] * pc;
        kiTmp[1] = szin[na + 1] * pa + szin[nb + 1] * pb + szin[nc + 1] * pc;
        kiTmp[2] = szin[na + 2] * pa + szin[nb + 2] * pb + szin[nc + 2] * pc;
        const wx = (ia % s) * pa + (ib % s) * pb + (ic % s) * pc;
        const wz = ((ia / s) | 0) * pa + ((ib / s) | 0) * pb + ((ic / s) | 0) * pc;
        const wy = a[3] * pa + b[3] * pb + c[3] * pc;
        const tav = a[4] * pa + b[4] * pb + c[4] * pc;
        if (!regi) talajFolt(arc, sziklaLejto, wx, wy, wz, nx, ny, nz, tav * pxVilag, kiTmp);
        vilagit(nx, ny, nz, kiTmp[0], kiTmp[1], kiTmp[2], szinTmp);
        kep[p * 3] = szinTmp[0]; kep[p * 3 + 1] = szinTmp[1]; kep[p * 3 + 2] = szinTmp[2];
      }
    }
  };

  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = j * s + i, b = a + 1, c = a + s, d = c + 1;
    haromszog(a, c, b); haromszog(b, c, d);
  }

  vizRajz(racs, kep, zp, sz, ma, mp, kamPoz, arc, regi, pxVilag);

  const ki = Buffer.alloc(sz * ma * 3);
  for (let i = 0; i < sz * ma; i++) {
    const c = aces([kep[i * 3], kep[i * 3 + 1], kep[i * 3 + 2]]);
    ki[i * 3] = Math.round(srgb(c[0]) * 255);
    ki[i * 3 + 1] = Math.round(srgb(c[1]) * 255);
    ki[i * 3 + 2] = Math.round(srgb(c[2]) * 255);
  }
  return ki;
}

/** A vízsík: nagy lap y=VIZSZINT-en, a shader JS-mása. */
function vizRajz(racs, kep, zp, sz, ma, mp, kamPoz, arc, regi, pxVilag) {
  const n = racs.n;
  const mtex = melysegTerkep(racs);
  const R = n * 2;
  const vetit = ([x, z]) => {
    const y = VIZSZINT;
    const cx = mp[0] * x + mp[4] * y + mp[8] * z + mp[12];
    const cy = mp[1] * x + mp[5] * y + mp[9] * z + mp[13];
    const cw = mp[3] * x + mp[7] * y + mp[11] * z + mp[15];
    return [cx, cy, cw, x, z];
  };
  const vSekely = hexLin(arc.vizSekely), vMely = hexLin(arc.vizMely), hab = hexLin(arc.hab);
  const rSekely = hexLin(0x2c6d99);
  const szinTmp = [0, 0, 0];
  const minta = (u, v) => {   // bilineáris a mélység-textúrán
    const x = u * n - 0.5, y = v * n - 0.5;
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const g = (a, b) => {
      a = Math.min(n - 1, Math.max(0, a)); b = Math.min(n - 1, Math.max(0, b));
      return mtex[b * n + a] / 255;
    };
    return (g(ix, iy) * (1 - fx) + g(ix + 1, iy) * fx) * (1 - fy)
      + (g(ix, iy + 1) * (1 - fx) + g(ix + 1, iy + 1) * fx) * fy;
  };
  const tri = (A, B, C) => {
    if (A[2] <= 0.1 || B[2] <= 0.1 || C[2] <= 0.1) return;
    const ax = (A[0] / A[2] * 0.5 + 0.5) * sz, ay = (0.5 - A[1] / A[2] * 0.5) * ma;
    const bx = (B[0] / B[2] * 0.5 + 0.5) * sz, by = (0.5 - B[1] / B[2] * 0.5) * ma;
    const cx = (C[0] / C[2] * 0.5 + 0.5) * sz, cy = (0.5 - C[1] / C[2] * 0.5) * ma;
    const ter = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (ter === 0) return;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
    const x1 = Math.min(sz - 1, Math.ceil(Math.max(ax, bx, cx)));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy)));
    const y1 = Math.min(ma - 1, Math.ceil(Math.max(ay, by, cy)));
    const iwa = 1 / A[2], iwb = 1 / B[2], iwc = 1 / C[2];
    for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
      const fx = px + 0.5, fy = py + 0.5;
      const l2 = ((bx - ax) * (fy - ay) - (by - ay) * (fx - ax)) / ter;
      const l1 = ((fx - ax) * (cy - ay) - (fy - ay) * (cx - ax)) / ter;
      const l0 = 1 - l1 - l2;
      if (l0 < 0 || l1 < 0 || l2 < 0) continue;
      const iw = l0 * iwa + l1 * iwb + l2 * iwc;
      const z = 1 / iw;
      const p = py * sz + px;
      if (z >= zp[p]) continue;
      const pa = l0 * iwa / iw, pb = l1 * iwb / iw, pc = l2 * iwc / iw;
      const wx = A[3] * pa + B[3] * pb + C[3] * pc;
      const wz = A[4] * pa + B[4] * pb + C[4] * pc;
      let alfa, r, g, b;
      if (regi) {
        alfa = 0.82; r = rSekely[0]; g = rSekely[1]; b = rSekely[2];
      } else {
        const u = wx / n, v = wz / n;
        const kint = Math.max(Math.max(-u, u - 1), Math.max(-v, v - 1));
        let mely = minta(Math.min(1, Math.max(0, u)), Math.min(1, Math.max(0, v))) * MELYSEG_REF;
        mely = mely + (MELYSEG_REF - mely) * Math.min(1, Math.max(0, kint * 24));
        const hu = Math.sin(wx * 0.42) * 0.5 + Math.sin(wz * 0.55) * 0.5;
        mely = Math.max(0, mely + hu * 0.11);
        const t = simaLepcso(0.15, 2.6, mely);
        r = vSekely[0] + (vMely[0] - vSekely[0]) * t;
        g = vSekely[1] + (vMely[1] - vSekely[1]) * t;
        b = vSekely[2] + (vMely[2] - vSekely[2]) * t;
        alfa = 0.10 + (0.88 - 0.10) * simaLepcso(0.02, 1.7, mely);
        let part = 1 - simaLepcso(0, 0.34, mely); part *= part;
        const hm = 0.55 + 0.45 * Math.sin(wx * 1.7 + wz * 1.1 + hu * 2.2);
        r += (hab[0] - r) * part * hm * 0.42;
        g += (hab[1] - g) * part * hm * 0.42;
        b += (hab[2] - b) * part * hm * 0.42;
        alfa = Math.max(alfa, part * hm * 0.34);
      }
      vilagit(0, 1, 0, r, g, b, szinTmp);
      kep[p * 3] += (szinTmp[0] - kep[p * 3]) * alfa;
      kep[p * 3 + 1] += (szinTmp[1] - kep[p * 3 + 1]) * alfa;
      kep[p * 3 + 2] += (szinTmp[2] - kep[p * 3 + 2]) * alfa;
    }
  };
  // ⚠️ A vízsíkot RÁCSRA bontjuk, nem két nagy háromszögre: ennek a
  // rasztarizálónak nincs vágósík-kezelése, és egy pályányi négyszög egyik
  // sarka mindig a kamera MÖGÖTT van, amitől az EGÉSZ lap eltűnne. (A valódi
  // WebGL természetesen vág — ez kizárólag az előnézet korlátja.)
  const L = 48, lep = (R * 2) / L, x0 = n / 2 - R, z0 = n / 2 - R;
  for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) {
    const a = vetit([x0 + i * lep, z0 + j * lep]);
    const b = vetit([x0 + (i + 1) * lep, z0 + j * lep]);
    const c = vetit([x0 + (i + 1) * lep, z0 + (j + 1) * lep]);
    const d = vetit([x0 + i * lep, z0 + (j + 1) * lep]);
    tri(a, c, b); tri(a, d, c);
  }
}

// ── mozaik ──────────────────────────────────────────────────────────────────
function mozaik(ut, lapok, sz, ma, oszlop) {
  const sor = Math.ceil(lapok.length / oszlop);
  const SZ = sz * oszlop, MA = ma * sor;
  const ki = Buffer.alloc(SZ * MA * 3);
  lapok.forEach((lap, i) => {
    const ox = (i % oszlop) * sz, oy = ((i / oszlop) | 0) * ma;
    for (let y = 0; y < ma; y++) lap.copy(ki, ((oy + y) * SZ + ox) * 3, y * sz * 3, (y + 1) * sz * 3);
  });
  pngIr(ut, SZ, MA, ki);
}

// ── futtatás ────────────────────────────────────────────────────────────────
const SZ = 620, MA = 400;
const attekint = [], kozeli = [];
for (let t = 0; t < TERKEP_DB; t++) {
  const racs = new Racs(N, SEED, t);
  const k = N * 0.5;
  // áttekintés: az egész pálya
  attekint.push(rajzol(racs, SZ, MA, [k - N * 0.55, N * 0.75, k + N * 0.95], [k, 2, k], 42, false));
  // közeli: játék-kameraszerű, a legközelebbi partvonalra célozva
  const cel = partKozel(racs);
  kozeli.push(rajzol(racs, SZ, MA, [cel[0] - 26, cel[1] + 42, cel[2] + 46], cel, 42, false));
  console.log(TERKEP_NEV[t], '— víz%', (szazalek(racs, TEREP.VIZ) * 100).toFixed(1),
    'fű%', (szazalek(racs, TEREP.FU) * 100).toFixed(1),
    'szikla%', (szazalek(racs, TEREP.SZIKLA) * 100).toFixed(1),
    'havas%', (szazalek(racs, TEREP.HAVAS) * 100).toFixed(1),
    'föveny%', (szazalek(racs, TEREP.FOVENY) * 100).toFixed(1));
}
mozaik(`${KI}/v0.16_terep_presetek.png`, attekint, SZ, MA, 3);

// partvonal-közeli: nagyon alacsony kamera egy föveny-cellára
const partok = [];
for (const t of [0, 1, 3]) {
  const racs = new Racs(N, SEED, t);
  const cel = partKozel(racs), ir = vizIrany(racs, cel);
  partok.push(rajzol(racs, SZ, MA,
    [cel[0] - ir[0] * 17, cel[1] + 9, cel[2] - ir[1] * 17], [cel[0] + ir[0] * 8, cel[1] - 1, cel[2] + ir[1] * 8], 42, false));
}
mozaik(`${KI}/v0.16_terep_partvonal.png`, partok, SZ, MA, 3);
mozaik(`${KI}/v0.16_terep_kozeli.png`, kozeli, SZ, MA, 3);

// régi paletta, összehasonlításnak
const regiek = [0, 3, 5].map((t) => {
  const racs = new Racs(N, SEED, t);
  const k = N * 0.5;
  return rajzol(racs, SZ, MA, [k - N * 0.55, N * 0.75, k + N * 0.95], [k, 2, k], 42, true);
});
mozaik(`${KI}/v0.16_terep_regi_palettaval.png`, regiek, SZ, MA, 3);

function szazalek(racs, t) {
  let db = 0;
  for (let i = 0; i < racs.terep.length; i++) if (racs.terep[i] === t) db++;
  return db / racs.terep.length;
}
/** Egy föveny-cella a pálya közepe környékén — ha nincs, a közép. */
function partKozel(racs) {
  const n = racs.n, k = n >> 1;
  let legjobb = -1, legtav = Infinity;
  for (let i = 0; i < n * n; i++) {
    if (racs.terep[i] !== TEREP.FOVENY) continue;
    const x = i % n, y = (i / n) | 0;
    const d = Math.hypot(x - k, y - k);
    if (d < legtav) { legtav = d; legjobb = i; }
  }
  if (legjobb < 0) return [k, racs.kozepMagassag[k * n + k] + 1, k];
  const x = legjobb % n, y = (legjobb / n) | 0;
  return [x, racs.kozepMagassag[legjobb] + 1, y];
}

/** Merre van a víz a `cel` cellától? (egységvektor a vízszintes síkon) */
function vizIrany(racs, cel) {
  const n = racs.n, cx = cel[0] | 0, cy = cel[2] | 0;
  let sx = 0, sy = 0;
  for (let dy = -7; dy <= 7; dy++) for (let dx = -7; dx <= 7; dx++) {
    const x = cx + dx, y = cy + dy;
    if (x < 0 || y < 0 || x >= n || y >= n) continue;
    if (racs.terep[y * n + x] !== TEREP.VIZ) continue;
    sx += dx; sy += dy;
  }
  const d = Math.hypot(sx, sy);
  return d > 0.001 ? [sx / d, sy / d] : [0, 1];
}
