// AGE OF THE CRYSTALS — ÁRAMLÁSI MEZŐ (flow field) ÚTKERESÉS.
//
// ── MIÉRT NEM A*, MINT A TELEPESEKBEN ─────────────────────────────────────
// A TELEPESEK `military/combat.js`-e egységenként tervez A*-ral, csomópont-
// korláttal (`PATH_MAX_NODES = 45000`). Ez ott helyes: néhány tucat lovag megy
// egyszerre, ritkán. Egy AoE-ben viszont egyetlen kattintás 100+ egységnek szól
// — ugyanoda. 100 külön A* futás UGYANARRA a célra 100-szoros pazarlás, és
// egyetlen képkockába zsúfolva látható akadás.
//
// Az áramlási mező megfordítja a kérdést: nem azt számoljuk ki, hogy EGY egység
// hogyan jut a célba, hanem hogy MINDEN cellából merre kell indulni. Egy
// Dijkstra a CÉLBÓL kifelé, és utána bármennyi egység ingyen olvassa. Egy
// 256×256-os pályán ez egy mező ~65 000 csomópont — és a mező ÚJRAHASZNOSUL:
// ha tíz játékos-parancs ugyanarra a cellára mutat, egy mező szolgálja ki mind.
//
// ── DIAL SORBANÁLLÁS, NEM KUPAC ───────────────────────────────────────────
// A lépésköltségek egészek (10 egyenesen, 14 átlósan ≈ 10·√2), így vödrös
// sorbanállás (Dial) használható bináris kupac helyett: O(V+E), nincs
// összehasonlítás-lánc. A vödrök körkörösek; mivel a legnagyobb élköltség 14 <
// 16, egy új csomópont sosem eshet a jelenlegi vödör „mögé".
//
// ── DETERMINIZMUS ─────────────────────────────────────────────────────────
// Minden költség EGÉSZ, tehát a mező bitre reprodukálható. Az irányvektorokat
// `Float32Array`-ben tároljuk: a float64 → float32 kerekítés IEEE-definiált,
// tehát szintén gépfüggetlen. Döntetlennél MINDIG a kisebb szomszéd-index nyer.

import { fxSqrt } from './fx.js';

const KOLT_EGYENES = 10;
const KOLT_ATLOS = 14;
const VODROK = 16;          // > a legnagyobb élköltség (14)
const ELERHETETLEN = 0x7fffffff;

// A nyolc szomszéd — RÖGZÍTETT sorrendben. Ezen a sorrenden múlik a
// döntetlenek feloldása, tehát SOHA ne rendezd át.
const SZ_DX = [1, -1, 0, 0, 1, 1, -1, -1];
const SZ_DY = [0, 0, 1, -1, 1, -1, 1, -1];
const SZ_KOLT = [KOLT_EGYENES, KOLT_EGYENES, KOLT_EGYENES, KOLT_EGYENES,
  KOLT_ATLOS, KOLT_ATLOS, KOLT_ATLOS, KOLT_ATLOS];

/** Egyetlen kiszámolt mező egy célcellára. */
class Mezo {
  constructor(n) {
    this.n = n;
    this.cel = -1;
    this.koltseg = new Int32Array(n * n);
    this.iranyX = new Float32Array(n * n);
    this.iranyY = new Float32Array(n * n);
    /** Hányadik ticken kérték utoljára — az LRU ebből dolgozik. */
    this.utoljara = 0;
  }
}

/**
 * Mező-gyorstár. Néhány mezőt tart életben; a legrégebben használtat dobja.
 * Egy AoE-meccsen egyszerre ritkán van 8-nál több AKTÍV menetcél.
 */
export class MezoTar {
  /**
   * @param {import('./grid.js').Racs} racs
   * @param {number} kapacitas egyszerre életben tartott mezők száma
   */
  constructor(racs, kapacitas = 8) {
    this.racs = racs;
    this.mezok = [];
    for (let i = 0; i < kapacitas; i++) this.mezok.push(new Mezo(racs.n));
    /** Diagnosztika: hány mezőt kellett ténylegesen kiszámolni. */
    this.szamitasok = 0;
    this._vodrok = [];
    for (let i = 0; i < VODROK; i++) this._vodrok.push([]);
  }

  /**
   * Mező kérése egy célcellára. Ha már megvan, ingyen van.
   * @param {number} celIdx cella-index
   * @param {number} tick a mostani tick (az LRU-hoz)
   * @returns {number} a mező sorszáma a tárban
   */
  kerj(celIdx, tick) {
    for (let i = 0; i < this.mezok.length; i++) {
      if (this.mezok[i].cel === celIdx) { this.mezok[i].utoljara = tick; return i; }
    }
    // Nincs meg — a legrégebben használtat írjuk felül
    let legregebbi = 0;
    for (let i = 1; i < this.mezok.length; i++) {
      if (this.mezok[i].utoljara < this.mezok[legregebbi].utoljara) legregebbi = i;
    }
    this._szamol(this.mezok[legregebbi], celIdx);
    this.mezok[legregebbi].utoljara = tick;
    this.szamitasok++;
    return legregebbi;
  }

  /** A mező irány-vektora egy cellában (egységhosszú, vagy 0,0 ha nincs út). */
  irany(mezoId, cellaIdx, ki) {
    const m = this.mezok[mezoId];
    ki.x = m.iranyX[cellaIdx];
    ki.y = m.iranyY[cellaIdx];
    return ki;
  }

  /** Elérhető-e egyáltalán a cél ebből a cellából. */
  elerheto(mezoId, cellaIdx) {
    return this.mezok[mezoId].koltseg[cellaIdx] !== ELERHETETLEN;
  }

  /** Dijkstra a CÉLBÓL kifelé, Dial-vödrökkel. */
  _szamol(mezo, celIdx) {
    const racs = this.racs;
    const n = racs.n;
    const jarhato = racs.jarhato;
    const koltseg = mezo.koltseg;
    koltseg.fill(ELERHETETLEN);
    mezo.cel = celIdx;

    const vodrok = this._vodrok;
    for (let i = 0; i < VODROK; i++) vodrok[i].length = 0;

    koltseg[celIdx] = 0;
    vodrok[0].push(celIdx);
    let fuggo = 1;
    let c = 0;

    while (fuggo > 0) {
      const v = vodrok[c % VODROK];
      while (v.length > 0) {
        const csp = v.pop();
        fuggo--;
        // Elavult bejegyzés: azóta olcsóbb utat találtunk ide
        if (koltseg[csp] !== c) continue;
        const cx = csp % n;
        const cy = (csp / n) | 0;
        for (let k = 0; k < 8; k++) {
          const nx = cx + SZ_DX[k];
          const ny = cy + SZ_DY[k];
          if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
          const ni = ny * n + nx;
          if (jarhato[ni] === 0) continue;
          // Átlós lépésnél a két „váll-cella" is legyen szabad, különben az
          // egység sarkon átvágna egy sziklán vagy egy kristály-fürtön.
          if (k >= 4) {
            if (jarhato[cy * n + nx] === 0 || jarhato[ny * n + cx] === 0) continue;
          }
          const uj = c + SZ_KOLT[k];
          if (uj < koltseg[ni]) {
            koltseg[ni] = uj;
            vodrok[uj % VODROK].push(ni);
            fuggo++;
          }
        }
      }
      c++;
    }

    // ── Irányvektorok a költség-lejtőből ──────────────────────────────
    const ix = mezo.iranyX, iy = mezo.iranyY;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const i = y * n + x;
        if (jarhato[i] === 0 || koltseg[i] === ELERHETETLEN || i === celIdx) {
          ix[i] = 0; iy[i] = 0; continue;
        }
        let legjobb = koltseg[i];
        let bk = -1;
        for (let k = 0; k < 8; k++) {
          const nx = x + SZ_DX[k];
          const ny = y + SZ_DY[k];
          if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
          const ni = ny * n + nx;
          if (jarhato[ni] === 0) continue;
          const kk = koltseg[ni];
          // SZIGORÚAN kisebb: döntetlennél a korábbi (kisebb k) marad
          if (kk < legjobb) { legjobb = kk; bk = k; }
        }
        if (bk < 0) { ix[i] = 0; iy[i] = 0; continue; }
        const dx = SZ_DX[bk], dy = SZ_DY[bk];
        const h = fxSqrt(dx * dx + dy * dy);
        ix[i] = dx / h;
        iy[i] = dy / h;
      }
    }
  }
}

/**
 * Szabad-e az egyenes út két pont között? Ez a „sarok-levágás": ha az egység
 * és a célja között nincs akadály, nem kell a rács 8 irányát követnie, hanem
 * mehet egyenesen. Enélkül a sereg látványosan lépcsőzik.
 *
 * Supercover Bresenham — minden ÉRINTETT cellát megnéz, nemcsak a fővonalat.
 * @returns {boolean}
 */
export function szabadVonal(racs, x0, y0, x1, y1) {
  const n = racs.n;
  let cx = x0 | 0, cy = y0 | 0;
  const vx = x1 - x0, vy = y1 - y0;
  const lepX = vx > 0 ? 1 : -1;
  const lepY = vy > 0 ? 1 : -1;
  const axv = vx < 0 ? -vx : vx;
  const ayv = vy < 0 ? -vy : vy;
  // Osztás nullával helyett nagy szám — a ciklus így is helyesen fut
  const dtx = axv < 1e-9 ? 1e18 : 1 / axv;
  const dty = ayv < 1e-9 ? 1e18 : 1 / ayv;
  let tx = dtx * (vx > 0 ? (cx + 1 - x0) : (x0 - cx));
  let ty = dty * (vy > 0 ? (cy + 1 - y0) : (y0 - cy));
  const vegX = x1 | 0, vegY = y1 | 0;
  let orseg = 0;
  const maxLepes = n * 3;
  while (orseg++ < maxLepes) {
    if (cx < 0 || cy < 0 || cx >= n || cy >= n) return false;
    if (racs.jarhato[cy * n + cx] === 0) return false;
    if (cx === vegX && cy === vegY) return true;
    if (tx < ty) { tx += dtx; cx += lepX; } else { ty += dty; cy += lepY; }
  }
  return false;
}
