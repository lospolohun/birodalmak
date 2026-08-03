// AGE OF THE CRYSTALS — A SZIMULÁCIÓ MAGJA.
//
// ── A LOCKSTEP SZERZŐDÉS ──────────────────────────────────────────────────
// Ez az osztály a játék EGYETLEN igazságforrása. Amit tud:
//
//   • FIX ÜTEM. Nem `dt`-vel fut, hanem egész tickekkel, 20 Hz-en. A képkocka-
//     sebességtől FÜGGETLEN: 144 Hz-es monitoron ugyanannyi tick fut le, mint
//     30 FPS-en, csak a köztes állapotot a render interpolálja.
//
//   • PARANCS-SOR. A játékos kattintása NEM azonnal hat, hanem a `tick +
//     KESLELTETES`-re kerül sorba. Egyjátékosban is így megy — így amikor a
//     v0.8-ban jön a hálózat, az CSAK SZÁLLÍTÁS lesz: ugyanez a sor érkezik
//     távolról. Ha ezt később vezetnénk be, az újraírás lenne.
//
//   • ÁLLAPOT-HASH. Bármely tick után kérhető egy 32 bites ujjlenyomat. A
//     `tools/determinizmus_szonda.mjs` ezzel hasonlít össze két futást, és
//     desyncnél megmondja a PONTOS ticket. Élesben ugyanez lesz a hálózati
//     desync-detektor.
//
// Amit NEM tud és nem is tudhat: nincs `THREE`, nincs `document`, nincs
// `performance.now()`, nincs `Math.random()`. Ez a fájl és minden, amit
// importál, node-ban fejen állva is le kell fusson — a szonda pontosan ezt
// használja ki.

import { Racs, TEREP } from './grid.js';
import { MezoTar } from './flowfield.js';
import { Egysegek, ALLAPOT, TIPUS, DT } from './units.js';
import { mulberry32 } from './rng.js';

/** Hány tickkel később hat egy parancs. 2 tick = 100 ms — a hálózat ebbe fér. */
export const KESLELTETES = 2;
/** A sim üteme. */
export const TICK_HZ = 20;

export class Sim {
  /**
   * @param {{seed?:number, n?:number, maxEgyseg?:number}} opciok
   */
  constructor(opciok = {}) {
    this.seed = (opciok.seed ?? 20260803) >>> 0;
    this.n = opciok.n ?? 256;
    this.maxEgyseg = opciok.maxEgyseg ?? 2000;

    this.tick = 0;
    this.racs = new Racs(this.n, this.seed);
    this.mezoTar = new MezoTar(this.racs, 8);
    this.egysegek = new Egysegek(this.maxEgyseg, this.racs, this.mezoTar);
    /** A meccs-RNG. MINDEN véletlen ebből jön, sosem a `Math.random`-ból. */
    this.rng = mulberry32(this.seed ^ 0xa5a5a5a5);

    /** tick → parancsok. Kulcs szerint kérdezzük, sosem iteráljuk. */
    this._sor = new Map();
  }

  /**
   * Parancs beadása. A `tick + KESLELTETES`-re kerül — MINDEN játékosnál
   * ugyanoda, tehát a sorrend gépfüggetlen.
   * @param {{fajta:string, [k:string]:any}} parancs
   */
  parancs(parancs) {
    const t = this.tick + KESLELTETES;
    let lista = this._sor.get(t);
    if (!lista) { lista = []; this._sor.set(t, lista); }
    lista.push(parancs);
  }

  /** Egy tick végrehajtása. */
  lep() {
    const lista = this._sor.get(this.tick);
    if (lista) {
      for (let i = 0; i < lista.length; i++) this._vegrehajt(lista[i]);
      this._sor.delete(this.tick);
    }
    this.egysegek.lep(this.tick);
    this.tick++;
  }

  _vegrehajt(p) {
    if (p.fajta === 'menet') {
      const e = this.egysegek;
      const idk = p.egysegek;
      // Alakzat-szerű szórás a cél körül: ha 200 egység UGYANARRA a pontra
      // menne, egymást tolnák örökké. Négyzetrácsos elrendezés a célpont
      // körül — a v0.2-ben ezt váltja a valódi alakzat-rendszer.
      const db = idk.length;
      const oldal = Math.ceil(Math.sqrt(db));
      const koz = 0.95;
      for (let k = 0; k < db; k++) {
        const sx = (k % oldal) - (oldal - 1) * 0.5;
        const sy = ((k / oldal) | 0) - (oldal - 1) * 0.5;
        let cx = p.x + sx * koz;
        let cy = p.y + sy * koz;
        if (!this.racs.jarhatoPont(cx, cy)) { cx = p.x; cy = p.y; }
        e.menetparancs(idk[k], cx, cy, this.tick);
      }
    }
  }

  /**
   * Kezdő felállás a szondához: két sereg a pálya két oldalán.
   * A `Math.random` helyett a meccs-RNG-t használja, tehát seedből
   * reprodukálható.
   * @param {number} osszDb összes egység
   */
  szondaFelallas(osszDb) {
    const e = this.egysegek;
    e.db = 0;
    const racs = this.racs;
    const n = this.n;
    const felenkent = osszDb >> 1;
    const tipusok = [TIPUS.LANDZSAS, TIPUS.IJASZ, TIPUS.LOVAG, TIPUS.MUNKAS];

    for (let csapat = 0; csapat < 2; csapat++) {
      const bazisX = csapat === 0 ? n * 0.22 : n * 0.78;
      const bazisY = n * 0.5;
      let elhelyezve = 0;
      let sugar = 3;
      let orseg = 0;
      while (elhelyezve < felenkent && orseg++ < 200000) {
        const a = this.rng() * 6.283185307179586;
        const r = this.rng() * sugar;
        // Itt a `Racs` saját szög-közelítőjét nem érjük el, de a felállás
        // csak a kezdőállapotot érinti — ugyanabból a seedből ugyanaz.
        const x = bazisX + kSin(a + 1.5707963267948966) * r;
        const y = bazisY + kSin(a) * r;
        if (racs.jarhatoPont(x, y)) {
          e.hozzaad(x, y, tipusok[elhelyezve & 3], csapat);
          elhelyezve++;
        }
        if ((orseg & 255) === 0) sugar += 1.5;
      }
    }
    return e.db;
  }

  /**
   * Szonda-forgatókönyv: adott tickenként a két sereg átküldi magát a pálya
   * másik oldalára. Ez a LEGROSSZABB eset az útkeresésnek és a szeparációnak
   * — pont ezt akarjuk mérni.
   */
  szondaParancs() {
    const e = this.egysegek;
    const n = this.n;
    const a = [], b = [];
    for (let i = 0; i < e.db; i++) (e.csapat[i] === 0 ? a : b).push(i);
    // A célt középre, de ellentétes oldalra tesszük — a két sereg ÁTHALAD
    // egymáson, ami a szeparáció legdurvább próbája.
    const celA = this._jarhatoKozel(n * 0.78, n * 0.5);
    const celB = this._jarhatoKozel(n * 0.22, n * 0.5);
    if (a.length) this.parancs({ fajta: 'menet', egysegek: a, x: celA.x, y: celA.y });
    if (b.length) this.parancs({ fajta: 'menet', egysegek: b, x: celB.x, y: celB.y });
  }

  /** Legközelebbi járható pont egy célhoz (spirálban keresve). */
  _jarhatoKozel(x, y) {
    if (this.racs.jarhatoPont(x, y)) return { x, y };
    for (let r = 1; r < 40; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const nx = x + dx, ny = y + dy;
          if (this.racs.jarhatoPont(nx, ny)) return { x: nx, y: ny };
        }
      }
    }
    return { x, y };
  }

  /**
   * 32 bites állapot-ujjlenyomat (FNV-1a a nyers bájtokon).
   *
   * Szándékosan a NYERS float-bájtokat hasítjuk, nem kerekített értékeket: a
   * desync-detektálásnak a legapróbb utolsó-bit eltérést is el kell kapnia,
   * mert az néhány száz tick alatt látható szétcsúszássá nő.
   * @returns {number}
   */
  allapotHash() {
    const e = this.egysegek;
    const db = e.db;
    let h = 0x811c9dc5;
    h = fnvSzam(h, this.tick);
    h = fnvSzam(h, db);
    h = fnvTomb(h, e.px, db);
    h = fnvTomb(h, e.py, db);
    h = fnvTomb(h, e.vx, db);
    h = fnvTomb(h, e.vy, db);
    h = fnvTomb(h, e.szog, db);
    for (let i = 0; i < db; i++) {
      h = fnvSzam(h, e.allapot[i]);
      h = fnvSzam(h, e.egyenes[i]);
      h = fnvSzam(h, e.mezoId[i]);
    }
    return h >>> 0;
  }
}

/** FNV-1a egy 32 bites egészre. */
function fnvSzam(h, v) {
  v = v | 0;
  for (let b = 0; b < 4; b++) {
    h ^= (v >>> (b * 8)) & 0xff;
    h = Math.imul(h, 0x01000193);
  }
  return h;
}

/** FNV-1a egy Float64Array első `db` elemének NYERS bájtjaira. */
function fnvTomb(h, tomb, db) {
  const nyers = new Uint8Array(tomb.buffer, tomb.byteOffset, db * 8);
  for (let i = 0; i < nyers.length; i++) {
    h ^= nyers[i];
    h = Math.imul(h, 0x01000193);
  }
  return h;
}

/** Determinisztikus szinusz a felálláshoz (lásd `sim/fx.js` indoklását). */
function kSin(x) {
  let t = x * (1 / 6.283185307179586);
  t = t - Math.floor(t + 0.5);
  let a = t * 6.283185307179586;
  if (a > 1.5707963267948966) a = 3.141592653589793 - a;
  else if (a < -1.5707963267948966) a = -3.141592653589793 - a;
  const s = a * a;
  return a * (1 + s * (-0.16666666666666666 + s * (0.008333333333333333 +
    s * (-1.984126984126984e-4 + s * (2.7557319223985893e-6 + s * -2.505210838544172e-8)))));
}

export { ALLAPOT, TIPUS, TEREP, DT };
