// AGE OF THE CRYSTALS — NYERSANYAG-LELŐHELYEK.
//
// ── A NÉGY NYERSANYAG ─────────────────────────────────────────────────────
//   ÉTEL      bogyós bokrok — a füvön, JÁRHATÓ marad (a munkás ráállhat)
//   FA        erdőfoltok    — JÁRHATATLAN, a sereg megkerüli
//   KŐ        kőfejtők      — JÁRHATATLAN
//   KRISTÁLY  a névadó      — a `racs.kristalyok` már legenerálta, JÁRHATATLAN
//
// A kristály nem itt születik: a `grid.js` a pálya-generálás részeként rakja le,
// mert AKADÁLYKÉNT is szerepel, és a terep járhatóságának már a rács
// felépítésekor késznek kell lennie. Ez a modul csak felveszi a listájába,
// hogy a munkás ugyanazon a felületen érje el mind a négyet.
//
// ── MIÉRT VÁLTOZTAT JÁRHATÓSÁGOT, ÉS MIÉRT VESZÉLYES ──────────────────────
// Az erdő és a kőfejtő zárja a cellát, a kitermelés viszont MEGNYITJA. Ez az
// egyetlen hely a játékban, ahol a pálya futás közben változik — és ez az
// áramlási mezők szempontjából éles kérdés: a `MezoTar` KIGYORSÍTÓTÁRAZZA a
// mezőket, azok pedig a járhatóságra épülnek. Ha egy erdő eltűnik, a régi mező
// továbbra is megkerültetné a sereget egy már nem létező akadállyal.
//
// Ezért a kimerülés ÉRVÉNYTELENÍTI a mező-gyorstárat (`mezotarUrites`). Ez
// ritka esemény (egy cella kimerülése), a tár 8 elemű, tehát a költsége
// elhanyagolható — a hibája viszont „szellem-akadály" lenne, amit senki nem lát.
//
// ── DETERMINIZMUS ─────────────────────────────────────────────────────────
// A lelőhelyek a meccs-seedből származnak (`mulberry32`), nem `Math.random`-ból,
// tehát két gép ugyanazt a gazdaságot kapja. A keresés spirálban, RÖGZÍTETT
// sorrendben jár, és döntetlennél a kisebb cella-index nyer.

import { mulberry32 } from './rng.js';
import { TEREP } from './grid.js';
import { fxSin, fxCos } from './fx.js';

export const NYERS = { ETEL: 0, FA: 1, KO: 2, KRISTALY: 3 };
export const NYERS_NEV = ['étel', 'fa', 'kő', 'kristály'];

/** Egy lelőhely kezdő készlete nyersanyagonként. */
const KESZLET = [220, 120, 320, 260];
/** Zárja-e a cellát? A bogyós bokorra rá lehet állni, az erdőre nem. */
const ZARO = [0, 1, 1, 1];

/** Hány fürt és fürtönként hány cella — a pálya méretétől függetlenül arányos. */
const FURT = {
  ETEL: { db: 13, min: 4, valt: 5, sugar: 3 },
  FA: { db: 11, min: 34, valt: 30, sugar: 6 },
  KO: { db: 7, min: 5, valt: 5, sugar: 3 },
};

export class Eroforrasok {
  /**
   * @param {import('./grid.js').Racs} racs
   * @param {number} seed a meccs-seed
   */
  constructor(racs, seed) {
    this.racs = racs;
    const n = racs.n;
    const maxDb = 4096;

    this.db = 0;
    this.maxDb = maxDb;
    this.cella = new Int32Array(maxDb);
    this.fajta = new Uint8Array(maxDb);
    this.keszlet = new Int32Array(maxDb);
    /** A lelőhely KÖZÉPPONTJA világkoordinátában — ide megy a munkás. */
    this.x = new Float64Array(maxDb);
    this.y = new Float64Array(maxDb);

    /** cella-index → lelőhely-index, vagy -1. A gyors „mi van itt?" kérdéshez. */
    this.cellaNode = new Int32Array(n * n).fill(-1);

    /**
     * Igazra vált, ha a járhatóság megváltozott, és a mezőket el kell dobni.
     * A `Sim.lep()` olvassa ki és nullázza — így egy ticken belül több
     * kimerülés is EGY tár-ürítést jelent.
     */
    this.jarhatosagValtozott = false;

    this._general(seed);
  }

  _general(seed) {
    const racs = this.racs;
    const n = racs.n;
    const kozep = n * 0.5;

    // A kristály MÁR a rácsban van — csak átvesszük. Elsőként, hogy a
    // lelőhely-indexek sorrendje se függjön a generálás többi ágától.
    for (let k = 0; k < racs.kristalyok.length; k++) {
      this._felvesz(racs.kristalyok[k], NYERS.KRISTALY);
    }

    // Külön RNG-ág, hogy a fürtök elhelyezése ne mozduljon el, ha a rács
    // generálása valaha változik. (A `grid.js` a saját ágát használja.)
    const rng = mulberry32((seed ^ 0x27d4eb2f) >>> 0);

    const furtoz = (leiras, fajta) => {
      for (let f = 0; f < leiras.db; f++) {
        const szog = rng() * 6.283185307179586;
        const r = (0.18 + rng() * 0.60) * kozep;
        const cx = (kozep + fxCos(szog) * r) | 0;
        const cy = (kozep + fxSin(szog) * r) | 0;
        const cellak = leiras.min + ((rng() * leiras.valt) | 0);
        const s = leiras.sugar;
        // Őrszem-számláló: ha a fürt közepe rossz helyre esett (víz, szikla),
        // ne pörögjön végtelenig — inkább legyen kisebb a fürt.
        let orseg = 0;
        let lerakva = 0;
        while (lerakva < cellak && orseg++ < cellak * 12) {
          const ox = cx + ((rng() * (2 * s + 1)) | 0) - s;
          const oy = cy + ((rng() * (2 * s + 1)) | 0) - s;
          if (ox < 2 || oy < 2 || ox >= n - 2 || oy >= n - 2) continue;
          const i = oy * n + ox;
          // Csak füves, szabad cellára. A `cellaNode` szűri ki, hogy két
          // lelőhely ugyanoda kerüljön — abból duplikált készlet lenne.
          if (racs.terep[i] !== TEREP.FU) continue;
          if (this.cellaNode[i] >= 0) continue;
          if (racs.jarhato[i] === 0) continue;
          this._felvesz(i, fajta);
          lerakva++;
        }
      }
    };

    furtoz(FURT.ETEL, NYERS.ETEL);
    furtoz(FURT.FA, NYERS.FA);
    furtoz(FURT.KO, NYERS.KO);
  }

  _felvesz(cella, fajta) {
    if (this.db >= this.maxDb) return -1;
    const i = this.db++;
    const n = this.racs.n;
    this.cella[i] = cella;
    this.fajta[i] = fajta;
    this.keszlet[i] = KESZLET[fajta];
    // A cella KÖZEPE, nem a sarka: a munkás így a lelőhely közepe felé megy.
    this.x[i] = (cella % n) + 0.5;
    this.y[i] = ((cella / n) | 0) + 0.5;
    this.cellaNode[cella] = i;
    if (ZARO[fajta]) this.racs.jarhato[cella] = 0;
    return i;
  }

  /**
   * Teljes visszaállítás kezdőállapotba — az `ujraFelallas` hívja.
   *
   * MIÉRT NEM ÚJRAGENERÁLÁS: a szonda lépcsői (100/400/800/1600) csak akkor
   * összehasonlíthatók, ha a pálya bitre ugyanaz marad. Az újragenerálás
   * ugyanazt adná, de fölöslegesen — és ami fontosabb, a `racs.jarhato`-t
   * kétszer módosítaná, ami könnyen elcsúszna.
   */
  nullaz() {
    for (let i = 0; i < this.db; i++) {
      this.keszlet[i] = KESZLET[this.fajta[i]];
      const c = this.cella[i];
      this.cellaNode[c] = i;
      if (ZARO[this.fajta[i]]) this.racs.jarhato[c] = 0;
    }
    this.jarhatosagValtozott = true;
  }

  /** Van-e még benne? A kimerült lelőhely indexe megmarad, de nem használható. */
  el(i) { return i >= 0 && i < this.db && this.keszlet[i] > 0; }

  /**
   * Kitermelés. A hívó annyit kap, amennyi tényleg van.
   * @param {number} i lelőhely
   * @param {number} mennyi kért mennyiség
   * @returns {number} a ténylegesen kivett mennyiség
   */
  kitermel(i, mennyi) {
    if (i < 0 || i >= this.db) return 0;
    const van = this.keszlet[i];
    if (van <= 0) return 0;
    const vett = mennyi < van ? mennyi : van;
    this.keszlet[i] = van - vett;
    if (this.keszlet[i] === 0) this._kimerult(i);
    return vett;
  }

  /**
   * Kimerülés: a cella felszabadul. Ez az EGYETLEN hely, ahol a pálya futás
   * közben járhatóbb lesz — és pont ezért kell a mezőket eldobni (lásd fejléc).
   */
  _kimerult(i) {
    const c = this.cella[i];
    this.cellaNode[c] = -1;
    if (ZARO[this.fajta[i]] && this.racs.jarhato[c] === 0) {
      this.racs.jarhato[c] = 1;
      this.jarhatosagValtozott = true;
    }
  }

  /**
   * A LEGKÖZELEBBI élő lelőhely egy adott fajtából, spirális cella-kereséssel.
   *
   * MIÉRT SPIRÁL ÉS NEM VÉGIGPÁSZTÁZÁS: a lelőhelyek száma néhány száz, a
   * cellák száma 65 536. Egy teljes végigjárás egy `gyujt` parancsnál
   * munkásonként futna le — 400 munkásnál az 26 millió lépés. A spirál a
   * TIPIKUS esetben (a kattintás a lelőhely mellé esik) néhány tucat cellát néz
   * meg. A `maxSugar` a legrosszabb esetet is korlátozza.
   *
   * @param {number} fajta `NYERS.*`, vagy -1 = bármelyik
   * @param {number} wx világ x @param {number} wy világ y
   * @param {number} maxSugar keresési sugár cellában
   * @returns {number} lelőhely-index vagy -1
   */
  keres(fajta, wx, wy, maxSugar = 26) {
    const n = this.racs.n;
    const kx = wx | 0, ky = wy | 0;
    const kozepen = this.racs.idx(kx, ky);
    if (kozepen >= 0) {
      const i = this.cellaNode[kozepen];
      if (i >= 0 && this.keszlet[i] > 0 && (fajta < 0 || this.fajta[i] === fajta)) return i;
    }
    for (let r = 1; r <= maxSugar; r++) {
      let legjobb = -1;
      let legjobbD2 = Infinity;
      for (let dy = -r; dy <= r; dy++) {
        const ay = dy < 0 ? -dy : dy;
        for (let dx = -r; dx <= r; dx++) {
          const ax = dx < 0 ? -dx : dx;
          // Csak a gyűrű PEREME — a belsejét az előző kör már megnézte.
          if (ax !== r && ay !== r) continue;
          const cx = kx + dx, cy = ky + dy;
          if (cx < 0 || cy < 0 || cx >= n || cy >= n) continue;
          const i = this.cellaNode[cy * n + cx];
          if (i < 0 || this.keszlet[i] <= 0) continue;
          if (fajta >= 0 && this.fajta[i] !== fajta) continue;
          // A gyűrűn belül a VALÓDI távolság dönt (a gyűrű sarka messzebb van,
          // mint a közepe), döntetlennél a kisebb lelőhely-index.
          const ddx = this.x[i] - wx, ddy = this.y[i] - wy;
          const d2 = ddx * ddx + ddy * ddy;
          if (d2 < legjobbD2 || (d2 === legjobbD2 && legjobb >= 0 && i < legjobb)) {
            legjobbD2 = d2; legjobb = i;
          }
        }
      }
      // ⚠️ Nem lépünk ki az ELSŐ találatnál a gyűrűn belül, de a gyűrű VÉGÉN
      // igen: egy r sugarú gyűrűn talált lelőhelynél közelebbi már nem jöhet.
      if (legjobb >= 0) return legjobb;
    }
    return -1;
  }

  /**
   * A közeli élő lelőhelyek EGY fajtából, spirális (tehát nagyjából távolság
   * szerinti) sorrendben.
   *
   * MIÉRT KELL: ha egy `gyujt` parancsra mind a 60 munkás UGYANAZT a legközelebbi
   * fát kapná, egyetlen cellára tolongnának, a szeparáció szétlökné őket, és a
   * gyűjtés a fürt egyetlen pontján folyna. Így a parancs szétosztja őket a
   * fürtön — ez a különbség „működik" és „használható" között.
   *
   * @param {number} fajta @param {number} wx @param {number} wy
   * @param {number[]} ki ide gyűjtünk (a hívó üríti)
   * @param {number} maxDb legfeljebb ennyi
   * @param {number} maxSugar keresési sugár cellában
   */
  kornyek(fajta, wx, wy, ki, maxDb = 96, maxSugar = 20) {
    const n = this.racs.n;
    const kx = wx | 0, ky = wy | 0;
    const kozepen = this.racs.idx(kx, ky);
    if (kozepen >= 0) {
      const i = this.cellaNode[kozepen];
      if (i >= 0 && this.keszlet[i] > 0 && (fajta < 0 || this.fajta[i] === fajta)) ki.push(i);
    }
    for (let r = 1; r <= maxSugar && ki.length < maxDb; r++) {
      for (let dy = -r; dy <= r; dy++) {
        const ay = dy < 0 ? -dy : dy;
        for (let dx = -r; dx <= r; dx++) {
          const ax = dx < 0 ? -dx : dx;
          if (ax !== r && ay !== r) continue;
          const cx = kx + dx, cy = ky + dy;
          if (cx < 0 || cy < 0 || cx >= n || cy >= n) continue;
          const i = this.cellaNode[cy * n + cx];
          if (i < 0 || this.keszlet[i] <= 0) continue;
          if (fajta >= 0 && this.fajta[i] !== fajta) continue;
          ki.push(i);
          if (ki.length >= maxDb) return ki;
        }
      }
    }
    return ki;
  }

  /**
   * ÁLLÓHELY a lelőhely mellett — ide áll a munkás.
   *
   * ── MIÉRT KELL A `valtozat` ────────────────────────────────────────────
   * Az első változat („az első járható szomszéd") kipróbálva MEGBUKOTT: ha tíz
   * munkás ugyanahhoz a fához megy, MIND ugyanazt az egy cellát kapja
   * célpontnak. A szeparáció szétlöki őket, egyikük sem ér oda elég közel, és
   * az állapotgép örökké „úton" marad — mérve 285 munkás ragadt be 400-ból,
   * miközben ketten gyűjtöttek.
   *
   * Ezért a jelölteket ÖSSZEGYŰJTJÜK, és a hívó egy változat-számot ad (a
   * munkás indexét). Így a csoport körbeáll, ahelyett hogy egy pontra tolongana.
   * A jelöltek sorrendje rögzített, tehát a választás gépfüggetlen.
   *
   * @param {number} i lelőhely
   * @param {{x:number,y:number}} ki
   * @param {number} valtozat melyik állóhelyet kérjük (körbeosztva)
   * @returns {{x:number,y:number}|null}
   */
  allohely(i, ki, valtozat = 0) {
    if (i < 0 || i >= this.db) return null;
    const n = this.racs.n;
    const c = this.cella[i];
    const cx = c % n, cy = (c / n) | 0;
    const j = this._jeloltCellak || (this._jeloltCellak = []);
    j.length = 0;

    // Bokorra rá lehet állni, erdőre/kőre/kristályra nem.
    if (!ZARO[this.fajta[i]] && this.racs.jarhato[c] === 1) j.push(c);

    // Gyűrűnként kifelé; az ELSŐ gyűrű, ami adott jelöltet, egyben az utolsó is
    // — a távolabbi állóhely már nem „a lelőhelynél" lenne.
    for (let r = 1; r <= 3 && j.length === 0; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const ax = dx < 0 ? -dx : dx, ay = dy < 0 ? -dy : dy;
          if (ax !== r && ay !== r) continue;
          const ci = this.racs.idx(cx + dx, cy + dy);
          if (ci < 0 || this.racs.jarhato[ci] === 0) continue;
          j.push(ci);
        }
      }
    }
    if (j.length === 0) return null;
    const v = valtozat < 0 ? 0 : valtozat;
    const cel = j[v % j.length];
    ki.x = (cel % n) + 0.5;
    ki.y = ((cel / n) | 0) + 0.5;
    return ki;
  }

  /** Összesítés a jelentésekhez és a HUD-hoz. */
  osszesites() {
    const ki = [0, 0, 0, 0];
    const cellak = [0, 0, 0, 0];
    for (let i = 0; i < this.db; i++) {
      ki[this.fajta[i]] += this.keszlet[i];
      if (this.keszlet[i] > 0) cellak[this.fajta[i]]++;
    }
    return { keszlet: ki, cellak };
  }
}
