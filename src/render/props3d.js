// AGE OF THE CRYSTALS — DÍSZLET: erdő, aljnövényzet, szikla, és a NÉVADÓ KRISTÁLY.
//
// SZERZŐDÉS: `frissit(sim, alfa)` · `set enabled(v)` · `get haromszog()`
//
// ── MI VÁLTOZOTT A v0.16-BAN, ÉS MIÉRT ────────────────────────────────────
// A v0.1–v0.10 díszlete EGY kúp-fa volt, ezerszer lemásolva. Motor-szondának ez
// helyes döntés volt (a mérés a MOTORRÓL szólt), játéknak viszont nem: a
// tulajdonos szavával „a TELEPESEK grafikájától fényévekre van". A táj most
// hétféle tereptárgyat ismer — fenyő, lombos fa, facsemete, kidőlt rönk, tuskó,
// bokor, szikla —, plusz a négy nyersanyag-lelőhely öltöztetését.
//
// A KÖLTSÉGE viszont nem hétszeres, mert semmi nem új ANYAG és alig új
// RAJZHÍVÁS. Három szabály tartja ezt:
//
//   1. EGY ANYAG az egész tájra (`diszlet_formak.js` → `anyagTaj`). A lombszín,
//      az évszak, a hó és a példányonkénti szórás mind csúcs-attribútum vagy
//      uniform. Hétféle tereptárgy = hétféle GEOMETRIA, de EGY shader-program.
//   2. A VÁLTOZATOSSÁG PÉLDÁNY-ADATBÓL jön. A facsemete nem új forma, hanem egy
//      lekicsinyített fenyő; a kidőlt fa egy ELDÖNTÖTT rönk; a kavics egy
//      összenyomott szikla. Ezek mind a példány-mátrixban élnek, tehát nulla
//      rajzhívásba kerülnek.
//   3. TÁVOLI IMPOSTOR. 78 világegységen túl minden fa EGY ötháromszögű kúppá
//      esik össze, chunkonként egyetlen rajzhívásban. Ez nem csak a többletet
//      fizeti ki: a v0.10-ben a távoli erdő 24 háromszög/fa volt, most 5 —
//      vagyis a pálya nagy részén a díszlet OLCSÓBB lett, miközben közelről
//      többszörösen gazdagabb.
//
// ── AZ ÉVSZAK: EGY SZÁM, NEM EGY MÁSIK PÁLYA ──────────────────────────────
// `diszlet.evszak = 2.4` — a lombos fák őszbe fordulnak, a fenyő zöld marad, és
// télen hó ül a felfelé néző lapokra. Ez négy uniform átírása, nem geometria-
// csere: a beállítás ára nulla képkocka. A világítás-sáv (`core3d.js`) MÁSIK
// AGENTÉ, ezért a réteg nem nyúl a fényekhez — csak felkínálja az `evszak` és
// az `ejszaka` beállítót, és Lambert-anyagot használ, ami magától követi a
// meglévő fényeket.
//
// ── A NÉGY NYERSANYAG: ÖLTÖZTETÉS, NEM ÚJRARAJZOLÁS ───────────────────────
// A lelőhely-jelet (kúp / bogyó / kavics) a `gazdasag3d.js` rajzolja, és az
// MÁSIK AGENT FÁJLJA. Ezért ez a réteg nem rajzolja újra őket — KÖRÉJÜK épít,
// ugyanabba a cellába:
//
//   FA        törzs + széles, sötét szoknya  → a gazdasági kúp így fa lesz, nem tüske
//   ÉTEL      terebélyes zöld bokor          → a piros bogyó rajta ül
//   KŐ        világos, sarkos szikla-csoport → magasabb, mint bármelyik szórvány kő
//   KRISTÁLY  teljesen a miénk (lásd lent)
//
// Két dolog, amit ez NEM sérthet meg:
//   • A díszlet a sim `eroforras`-tábláját OLVASSA, és pontosan ott áll, ahol a
//     sim mondja. A fa, amit a játékos lát, és a fa, amit a paraszt kivág,
//     ugyanaz. Szépészeti okból SEM tolunk el semmit.
//   • A KIMERÜLT lelőhely öltöztetése ELTŰNIK. Enélkül a letarolt erdő helyén
//     ottmaradna egy díszfa, a játékos meg azt látná, hogy a fa ott van, csak
//     nem lehet kivágni — pontosan az a hibafajta, ami ellen a v0.3 fejléce
//     figyelmeztetett. Az ellenőrzés ugyanaz az olcsó darabszám-összevetés,
//     amit a `gazdasag3d.js` is használ: példány-puffert csak VÁLTOZÁSRA írunk.
//
// ── A KRISTÁLY: A PÁLYA FŐSZEREPLŐJE ──────────────────────────────────────
// A játék névadója öt rétegből áll, és mind az öt fix költségű:
//   talp    — sötét kőgallér, amiből NŐNEK a szilánkok (enélkül a fűbe szúrt
//             mértani testnek látszik)
//   szilánk — hatszög-hasáb hegyes csúccsal; egy MAGAS fő szilánk + 2-4 kísérő
//   burok   — additív, csúcs felé elhalványuló ragyogás (nem pontfény!)
//   folt    — additív fényfolt a talajon
//   lebegő  — a fő szilánk körül keringő szilánk, VERTEX SHADERBŐL animálva:
//             a CPU képkockánként nulla mátrixot ír, mégis mozog a kép
//
// Nincs PONTFÉNY: egy pontfény MINDEN anyag fragment-shaderjébe beépül, tehát a
// képernyő minden képpontján fizetnénk érte — száz lelőhelynél ez nem opció.
//
// ── HOGYAN MARAD OLCSÓ ────────────────────────────────────────────────────
// 1. CHUNKONKÉNTI `InstancedMesh` (fa: 32×32 cella, aljnövényzet: 64×64). Egy
//    chunk = egy befoglaló gömb, tehát a frusztum-kivágás VALÓBAN dolgozik.
// 2. LOD `visible` flaggel és `count` levételével — NULLA adatmozgatás.
// 3. A `frissit()` nem allokál: minden segédobjektum modul-szinten él.
// 4. A példányok hash szerint MEGKEVERVE kerülnek a pufferbe, ezért a puffer
//    bármelyik ELŐTAGJA térben egyenletes minta — a távoli ritkítás így egyetlen
//    `count` csökkentés, nem újratöltés.

import { THREE, feloldJelenet, feloldKamera, aktivKamera } from './core3d.js';
import { TEREP } from '../sim/grid.js';
import { NYERS } from '../sim/eroforras.js';
import {
  epitDiszletGeometriak, ujDiszletUniformok, evszakSzinek,
  anyagTaj, anyagKristaly, anyagSzilank, anyagIzzas,
  haromszogDb, keverd,
} from './diszlet_formak.js';

/** Fa-chunk oldalhossza cellában. */
const PCH = 32;
/** Aljnövényzet-chunk: nagyobb, mert úgyis csak közelről látszik — így kevesebb
 *  rajzhívásból kijön ugyanaz a kép. */
const UCH = 64;

/** Ezen belül a fa RÉSZLETES (törzs, emeletek); ezen túl impostor-kúp. */
const RESZLET_TAV = 78;
/** Az aljnövényzet ezen a chunk-PEREM-távolságon belül látszik, és eddigre
 *  fogy `ALJ_RITKA`-ra. A bokor és a kavics 60 világegységnél már néhány
 *  képpont: nem a látványért fizetnénk, hanem a rajzhívásért. */
const ALJ_TAV = 62, ALJ_RITKIT = 26, ALJ_RITKA = 0.3;
/** Ennél messzebb a chunk teljesen kimarad (a köd úgyis elnyeli). */
const REJT_TAV = 340;
/** Ezen túl kezd ritkulni az erdő, eddigre éri el a `RITKA_ALJ` arányt. */
const RITKIT_KEZD = 130, RITKIT_VEG = 270, RITKA_ALJ = 0.42;

/** Cél-darabszámok az EGÉSZ pályára. A küszöb ezekből számolódik vissza, tehát
 *  egy másik pályagenerátor mellett sem borul fel a képkocka-költség. */
const CEL_FA = 2600;
const CEL_BOKOR = 900;
const CEL_KO = 1500;
const CEL_RONK = 170;

/** Hash-magok. Külön mag fajtánként, hogy a szórások ne korreláljanak. */
const MAG = {
  FA: 0x51ed27, FAJ: 0x2c9a11, HELY: 0x9e37b1, KEVER: 0x3f7c1,
  BOKOR: 0x6b18d3, KO: 0x1af02b, RONK: 0x74c5e9, DEP: 0x0b3d5f, KRI: 0xc01dbe,
};

const TAU = 6.283185307179586;

// Képkockánként újrahasznált segédek — a `frissit()` így allokációmentes.
const _m4 = new THREE.Matrix4();
const _frusztum = new THREE.Frustum();
// A felépítéshez (nem a hurokban), de itt is egy példány elég.
const _poz = new THREE.Vector3(), _qt = new THREE.Quaternion(), _qt2 = new THREE.Quaternion();
const _sc = new THREE.Vector3(), _eu = new THREE.Euler(), _mat = new THREE.Matrix4();
const _TENGELY_Y = new THREE.Vector3(0, 1, 0);
const _TENGELY_Z = new THREE.Vector3(0, 0, 1);

export class Diszlet3D {
  /**
   * @param {THREE.Scene|any} jelenet jelenet vagy `Mag3D`
   * @param {import('../sim/sim.js').Sim|any} sim
   * @param {{kamera?:any, faDb?:number, evszak?:number}} [opciok]
   */
  constructor(jelenet, sim, opciok = {}) {
    this.jelenet = feloldJelenet(jelenet);
    if (!this.jelenet) throw new Error('[props3d] nincs jelenet');
    this.racs = sim.racs;
    // Elhagyható: ha nincs (csupasz szonda, régi mentés), a réteg a
    // nyersanyag-öltöztetés nélkül, de hibátlanul fut.
    this._eroforrasok = sim.eroforrasok || null;
    this._n = this.racs.n;
    this._kamera = feloldKamera(opciok.kamera) || aktivKamera();
    this._celFa = opciok.faDb ?? CEL_FA;
    this._enabled = true;
    this._haromszog = 0;
    this._rajzhivas = 0;

    this._u = ujDiszletUniformok();
    this._evszak = opciok.evszak ?? 1;      // 1 = nyár
    evszakSzinek(this._evszak, this._u);
    this._kezdet = performance.now();

    this.gyoker = new THREE.Group();
    this.gyoker.name = 'diszlet';
    this.gyoker.matrixAutoUpdate = false;
    this.gyoker.updateMatrix();
    this.jelenet.add(this.gyoker);

    this._geo = epitDiszletGeometriak();
    this._tri = {};
    for (const nev of Object.keys(this._geo)) this._tri[nev] = haromszogDb(this._geo[nev]);

    this.anyagTaj = anyagTaj(this._u);
    this.anyagKristaly = anyagKristaly(this._u);
    this.anyagSzilank = anyagSzilank(this._u);
    this.anyagBurok = anyagIzzas(this._u, 0x8ff0ff, 1.7);
    this.anyagFolt = anyagIzzas(this._u, 0x6fe6ff, 1.7);
    this.anyagFolt.depthTest = true;

    /** Mindig rajzolt (nem chunkolt) meshek: `{halo, tri}`. */
    this._allandok = [];
    /** Élő lelőhelyek fajtánként — a `frissit()` írja, hogy ne allokáljon. */
    this._eloDb = new Int32Array(4);

    this._tiltottMaszk();
    this._epitFak();
    this._epitAlj();
    this._epitRonkok();
    this._epitLelohelyek();
    this._epitKristalyok();
    this._tiltott = null;        // a felépítés után már nem kell (64 KB)
  }

  // ── TILTOTT CELLÁK ───────────────────────────────────────────────────────

  /**
   * Ahova a DÍSZ nem kerülhet: a kristály-cellák és minden nyersanyag-lelőhely.
   * A dísz és a nyersanyag SOSEM keveredhet — ha díszfát raknánk egy erdő-
   * cellára, a kitermelés után ottmaradna egy kivághatatlan fa.
   */
  _tiltottMaszk() {
    const n = this._n, racs = this.racs;
    const t = new Uint8Array(n * n);
    for (let k = 0; k < racs.kristalyok.length; k++) t[racs.kristalyok[k]] = 1;
    const ef = this._eroforrasok;
    if (ef) for (let i = 0; i < ef.db; i++) t[ef.cella[i]] = 1;
    // A lelőhelyek KÖZVETLEN szomszédja is tiltott: oda áll a munkás, és egy
    // odanőtt bokor pont a gyűjtő figurát takarná el.
    const sz = new Uint8Array(t);
    for (let y = 1; y < n - 1; y++) {
      for (let x = 1; x < n - 1; x++) {
        const i = y * n + x;
        if (!t[i]) continue;
        sz[i - 1] = sz[i + 1] = sz[i - n] = sz[i + n] = 1;
      }
    }
    this._tiltott = sz;
  }

  /**
   * Terep-súlyozott szórás: terepfajtánként megadott súlyból és egy CÉL-
   * darabszámból számol ezrelékes elfogadási küszöböt.
   *
   * MIÉRT NEM FIX SZÁZALÉK: a pályák terep-aránya nagyon eltér (erdőség vs.
   * hegyvidék). Fix százalék mellett a példányszám — és vele a képkocka-költség
   * — pályánként ingadozna. A cél-darabszám ezt rögzíti.
   *
   * @param {number[]} suly `TEREP.*` indexű súlyok (0 = ide nem kerül)
   * @param {number} cel hány példányt akarunk az egész pályán
   * @returns {Int32Array} terepfajtánkénti küszöb ezrelékben
   */
  _kuszob(suly, cel) {
    const ter = this.racs.terep, tilt = this._tiltott;
    const cellaDb = this._n * this._n;
    let ossz = 0;
    for (let i = 0; i < cellaDb; i++) if (!tilt[i]) ossz += suly[ter[i]] || 0;
    const k = new Int32Array(suly.length);
    if (ossz <= 0) return k;
    const skala = cel / ossz;
    for (let t = 0; t < suly.length; t++) {
      k[t] = Math.max(0, Math.min(1000, Math.round(1000 * skala * (suly[t] || 0))));
    }
    return k;
  }

  // ── ERDŐ ─────────────────────────────────────────────────────────────────

  _epitFak() {
    const n = this._n, racs = this.racs;
    const ter = racs.terep, kozep = racs.kozepMagassag, tilt = this._tiltott;
    const cellaDb = n * n;
    const suly = []; suly[TEREP.FU] = 1;
    const kuszob = this._kuszob(suly, this._celFa);

    const chDb = Math.ceil(n / PCH);
    const kosarak = new Array(chDb * chDb);

    for (let i = 0; i < cellaDb; i++) {
      if (tilt[i] || ter[i] !== TEREP.FU) continue;
      if (keverd(i, MAG.FA) % 1000 >= kuszob[TEREP.FU]) continue;
      const c = (((i / n) | 0) / PCH | 0) * chDb + ((i % n) / PCH | 0);
      (kosarak[c] || (kosarak[c] = [])).push(i);
    }
    // A példányokat hash szerint MEGKEVERJÜK: így a puffer bármelyik előtagja
    // térben egyenletes minta, és a távoli ritkítás egyetlen `count` levétel.
    for (const k of kosarak) if (k) k.sort((a, b) => keverd(a, MAG.KEVER) - keverd(b, MAG.KEVER));

    this._faChunkok = [];
    const felAtlo = Math.SQRT2 * (PCH * 0.5 + 1);
    for (let c = 0; c < kosarak.length; c++) {
      const lista = kosarak[c];
      if (!lista || !lista.length) continue;

      // Fajta-szétosztás: fenyő és lombos fa. A facsemete NEM külön forma,
      // hanem lekicsinyített példány — ezért nem is külön mesh.
      let fenyoDb = 0;
      for (let s = 0; s < lista.length; s++) if (fenyoE(lista[s])) fenyoDb++;
      const fenyo = ujHalo(this._geo.fenyo, this.anyagTaj, fenyoDb);
      const lombfa = ujHalo(this._geo.lombfa, this.anyagTaj, lista.length - fenyoDb);
      const tavoli = ujHalo(this._geo.tavoli, this.anyagTaj, lista.length);
      for (const m of [fenyo, lombfa, tavoli]) if (m) this.gyoker.add(m);

      let minY = Infinity, maxY = -Infinity;
      let fi = 0, li = 0;
      for (let s = 0; s < lista.length; s++) {
        const i = lista[s], x = i % n, y = (i / n) | 0, my = kozep[i];
        const h = keverd(i, MAG.HELY);
        const fenyoFa = fenyoE(i);
        // Facsemete: minden hetedik fa fiatal. A `0,34` alsó határ nem véletlen
        // — ennél kisebb fa a bokortól nem különböztethető meg.
        const fiatal = (h & 7) === 0;
        const alap = fiatal ? 0.34 + ((h >>> 16) & 255) / 255 * 0.26
          : 0.72 + ((h >>> 16) & 255) / 255 * 0.78;
        const nyujt = 0.85 + ((h >>> 12) & 15) / 15 * 0.45;
        _poz.set(
          x + 0.5 + ((h & 255) / 255 - 0.5) * 0.85,
          my,
          y + 0.5 + (((h >>> 8) & 255) / 255 - 0.5) * 0.85,
        );
        _eu.set(0, ((h >>> 24) & 255) / 255 * TAU, 0);
        _qt.setFromEuler(_eu);
        _sc.set(alap, alap * nyujt, alap);
        _mat.compose(_poz, _qt, _sc);
        if (fenyoFa) fenyo.setMatrixAt(fi++, _mat);
        else lombfa.setMatrixAt(li++, _mat);

        // Az impostor MAGASSÁGA a fajtáéhoz igazodik, hogy a 90-es váltásnál a
        // sziluett ne ugorjon. (fenyő 3,30 · lombos 3,06 · impostor 3,00)
        _sc.set(alap * (fenyoFa ? 1.0 : 1.06),
          alap * nyujt * (fenyoFa ? 1.10 : 1.02),
          alap * (fenyoFa ? 1.0 : 1.06));
        _mat.compose(_poz, _qt, _sc);
        tavoli.setMatrixAt(s, _mat);

        if (my < minY) minY = my;
        if (my > maxY) maxY = my;
      }
      for (const m of [fenyo, lombfa, tavoli]) if (m) m.instanceMatrix.needsUpdate = true;

      // Befoglaló gömb kézzel: megspóroljuk a példányonkénti újraszámolást, és
      // nem zsugorodik akkor sem, amikor a ritkítás lejjebb veszi a `count`-ot.
      const gomb = new THREE.Sphere();
      const fel = (maxY - minY) * 0.5 + 6.0;
      const cx = c % chDb, cy = (c / chDb) | 0;
      gomb.center.set((cx + 0.5) * PCH, (minY + maxY) * 0.5, (cy + 0.5) * PCH);
      gomb.radius = Math.sqrt(felAtlo * felAtlo + fel * fel);
      for (const m of [fenyo, lombfa, tavoli]) if (m) m.boundingSphere = gomb;

      this._faChunkok.push({
        fenyo, lombfa, tavoli, gomb, osszes: lista.length, fenyoDb,
        lombDb: lista.length - fenyoDb, kx: gomb.center.x, kz: gomb.center.z,
      });
    }
  }

  // ── ALJNÖVÉNYZET: BOKOR ÉS SZIKLA ────────────────────────────────────────

  _epitAlj() {
    const n = this._n, racs = this.racs;
    const ter = racs.terep, kozep = racs.kozepMagassag, tilt = this._tiltott;
    const cellaDb = n * n;

    const bokorSuly = []; bokorSuly[TEREP.FU] = 1; bokorSuly[TEREP.FOVENY] = 0.35;
    const bK = this._kuszob(bokorSuly, CEL_BOKOR);
    // A KŐ ott sok, ahol a hegy is: sziklás és havas terepen. Füvön csak KAVICS
    // kerül ki (lásd a méret-korlátot lent) — egy fűben álló nagy szikla
    // összetéveszthető lenne a kőfejtő-lelőhellyel, és az félrevezető jel.
    const koSuly = [];
    koSuly[TEREP.SZIKLA] = 1; koSuly[TEREP.HAVAS] = 0.7;
    koSuly[TEREP.FOVENY] = 0.3; koSuly[TEREP.FU] = 0.12;
    const kK = this._kuszob(koSuly, CEL_KO);

    const chDb = Math.ceil(n / UCH);
    const bKosar = new Array(chDb * chDb), kKosar = new Array(chDb * chDb);
    for (let i = 0; i < cellaDb; i++) {
      if (tilt[i]) continue;
      const t = ter[i];
      if (t === TEREP.VIZ) continue;
      const c = (((i / n) | 0) / UCH | 0) * chDb + ((i % n) / UCH | 0);
      if (keverd(i, MAG.BOKOR) % 1000 < bK[t]) (bKosar[c] || (bKosar[c] = [])).push(i);
      if (keverd(i, MAG.KO) % 1000 < kK[t]) (kKosar[c] || (kKosar[c] = [])).push(i);
    }
    for (const k of bKosar) if (k) k.sort((a, b) => keverd(a, MAG.KEVER) - keverd(b, MAG.KEVER));
    for (const k of kKosar) if (k) k.sort((a, b) => keverd(a, MAG.KEVER) - keverd(b, MAG.KEVER));

    this._aljChunkok = [];
    const felAtlo = Math.SQRT2 * (UCH * 0.5 + 1);
    for (let c = 0; c < chDb * chDb; c++) {
      const bl = bKosar[c], kl = kKosar[c];
      if ((!bl || !bl.length) && (!kl || !kl.length)) continue;
      const bokor = ujHalo(this._geo.bokor, this.anyagTaj, bl ? bl.length : 0);
      const szikla = ujHalo(this._geo.szikla, this.anyagTaj, kl ? kl.length : 0);
      for (const m of [bokor, szikla]) if (m) this.gyoker.add(m);

      let minY = Infinity, maxY = -Infinity;
      if (bl) {
        for (let s = 0; s < bl.length; s++) {
          const i = bl[s], h = keverd(i, MAG.BOKOR);
          const m = 0.7 + ((h >>> 16) & 255) / 255 * 0.75;
          this._helyre(i, h, m, m * (0.7 + ((h >>> 10) & 15) / 15 * 0.6), 0);
          bokor.setMatrixAt(s, _mat);
          const my = kozep[i];
          if (my < minY) minY = my; if (my > maxY) maxY = my;
        }
        bokor.instanceMatrix.needsUpdate = true;
      }
      if (kl) {
        for (let s = 0; s < kl.length; s++) {
          const i = kl[s], h = keverd(i, MAG.KO);
          const hegyi = ter[i] === TEREP.SZIKLA || ter[i] === TEREP.HAVAS;
          // Hegyen szikla, füvön kavics. Ugyanaz a húsz háromszög, más példány.
          const m = hegyi ? 0.55 + ((h >>> 16) & 255) / 255 * 1.15
            : 0.20 + ((h >>> 16) & 255) / 255 * 0.24;
          this._helyre(i, h, m, m * (0.45 + ((h >>> 10) & 15) / 15 * 0.85), -0.12 * m);
          szikla.setMatrixAt(s, _mat);
          const my = kozep[i];
          if (my < minY) minY = my; if (my > maxY) maxY = my;
        }
        szikla.instanceMatrix.needsUpdate = true;
      }

      const gomb = new THREE.Sphere();
      const fel = (maxY - minY) * 0.5 + 3.0;
      const cx = c % chDb, cy = (c / chDb) | 0;
      gomb.center.set((cx + 0.5) * UCH, (minY + maxY) * 0.5, (cy + 0.5) * UCH);
      gomb.radius = Math.sqrt(felAtlo * felAtlo + fel * fel);
      for (const m of [bokor, szikla]) if (m) m.boundingSphere = gomb;

      this._aljChunkok.push({
        bokor, szikla, gomb, bokorDb: bl ? bl.length : 0, sziklaDb: kl ? kl.length : 0,
        kx: gomb.center.x, kz: gomb.center.z,
      });
    }
  }

  /** Cella → példány-mátrix a `_mat`-ba: jitterelt hely, Y-forgatás, méret. */
  _helyre(i, h, vizszintes, fuggoleges, dy) {
    const n = this._n;
    const x = i % n, y = (i / n) | 0;
    _poz.set(
      x + 0.5 + ((h & 255) / 255 - 0.5) * 0.8,
      this.racs.kozepMagassag[i] + dy,
      y + 0.5 + (((h >>> 8) & 255) / 255 - 0.5) * 0.8,
    );
    _eu.set(0, ((h >>> 24) & 255) / 255 * TAU, 0);
    _qt.setFromEuler(_eu);
    _sc.set(vizszintes, fuggoleges, vizszintes);
    _mat.compose(_poz, _qt, _sc);
  }

  // ── KIDŐLT FA ÉS TUSKÓ ───────────────────────────────────────────────────

  /**
   * Egyetlen, pálya-méretű mesh: kevés példány (~240), az egész pályán
   * szétszórva. A chunkolás és a kivágás többe kerülne, mint amennyit
   * megspórolna — a rönk 30 háromszög, és egy rajzhívás az egész.
   */
  _epitRonkok() {
    const n = this._n, ter = this.racs.terep, kozep = this.racs.kozepMagassag;
    const tilt = this._tiltott;
    const suly = []; suly[TEREP.FU] = 1; suly[TEREP.FOVENY] = 0.25;
    const k = this._kuszob(suly, CEL_RONK);
    const lista = [];
    for (let i = 0; i < n * n; i++) {
      if (tilt[i] || ter[i] === TEREP.VIZ) continue;
      if (keverd(i, MAG.RONK) % 1000 < k[ter[i]]) lista.push(i);
    }
    const halo = ujHalo(this._geo.ronk, this.anyagTaj, lista.length);
    if (!halo) { this._ronk = null; return; }
    halo.frustumCulled = false;
    this.gyoker.add(halo);

    for (let s = 0; s < lista.length; s++) {
      const i = lista[s], h = keverd(i, MAG.RONK);
      const x = i % n, y = (i / n) | 0;
      const kidolt = (h & 3) !== 0;      // háromból kettő fekszik
      const m = 0.7 + ((h >>> 16) & 255) / 255 * 0.6;
      _poz.set(
        x + 0.5 + ((h & 255) / 255 - 0.5) * 0.8,
        kozep[i] + (kidolt ? 0.17 * m : 0),
        y + 0.5 + (((h >>> 8) & 255) / 255 - 0.5) * 0.8,
      );
      const irany = ((h >>> 24) & 255) / 255 * TAU;
      if (kidolt) {
        // Előbb ELDŐL (Z körül), aztán a világ Y-ja körül fordul — ezért a
        // kvaternió-szorzat, nem egy Euler-hármas: a sorrend itt számít.
        _qt.setFromAxisAngle(_TENGELY_Z, Math.PI * 0.5 + (((h >>> 5) & 15) / 15 - 0.5) * 0.18);
        _qt2.setFromAxisAngle(_TENGELY_Y, irany);
        _qt.premultiply(_qt2);
        _sc.set(m * 0.95, m * (1.5 + ((h >>> 12) & 15) / 15 * 0.9), m * 0.95);
      } else {
        _eu.set(0, irany, 0);
        _qt.setFromEuler(_eu);
        _sc.set(m * 1.05, m * (0.22 + ((h >>> 12) & 15) / 15 * 0.2), m * 1.05);
      }
      _mat.compose(_poz, _qt, _sc);
      halo.setMatrixAt(s, _mat);
    }
    halo.instanceMatrix.needsUpdate = true;
    halo.count = lista.length;
    this._ronk = halo;
    this._allandok.push({ halo, tri: this._tri.ronk });
  }

  // ── NYERSANYAG-ÖLTÖZTETÉS ────────────────────────────────────────────────

  /**
   * Fajtánként egy mesh, lelőhelyenként egy példány. A mátrixokat ELŐRE
   * kiszámoljuk egy forrás-tömbbe; a képkockánkénti munka ennyi: ha a LÁTHATÓ
   * darabszám változott, a forrásból tömörítve átmásoljuk a puffert.
   */
  _epitLelohelyek() {
    this._dep = null;
    const ef = this._eroforrasok;
    if (!ef) return;
    const geoNev = []; geoNev[NYERS.FA] = 'dep_fa';
    geoNev[NYERS.ETEL] = 'dep_etel'; geoNev[NYERS.KO] = 'dep_ko';

    const dep = [];
    for (let f = 0; f < 3; f++) {
      let db = 0;
      for (let i = 0; i < ef.db; i++) if (ef.fajta[i] === f) db++;
      if (!db) { dep[f] = null; continue; }
      const halo = ujHalo(this._geo[geoNev[f]], this.anyagTaj, db);
      halo.frustumCulled = false;
      halo.count = 0;
      this.gyoker.add(halo);
      dep[f] = { halo, forras: new Float32Array(db * 16), lelo: new Int32Array(db), db: 0,
        tri: this._tri[geoNev[f]] };
      this._allandok.push({ halo, tri: dep[f].tri });
    }

    for (let i = 0; i < ef.db; i++) {
      const f = ef.fajta[i];
      const d = dep[f];
      if (!d) continue;
      const c = ef.cella[i], h = keverd(c, MAG.DEP);
      const m = 0.85 + ((h >>> 16) & 255) / 255 * 0.42;
      // ⚠️ A CELLA KÖZEPE, ahogy a sim mondja (`ef.x/ef.y`) — jitter NÉLKÜL.
      // A lelőhely-dísz nem csúszhat el a lelőhelytől: a játékos oda kattint,
      // ahol a fát látja.
      _poz.set(ef.x[i], this.racs.kozepMagassag[c], ef.y[i]);
      _eu.set(0, ((h >>> 24) & 255) / 255 * TAU, 0);
      _qt.setFromEuler(_eu);
      _sc.set(m, m * (0.9 + ((h >>> 8) & 15) / 15 * 0.32), m);
      _mat.compose(_poz, _qt, _sc);
      _mat.toArray(d.forras, d.db * 16);
      d.lelo[d.db] = i;
      d.db++;
    }
    this._dep = dep;
    /** Fajtánként hány példány volt látható legutóbb — ebből tudjuk, kell-e írni. */
    this._utolsoDb = new Int32Array(4).fill(-1);
  }

  // ── KRISTÁLYOK ───────────────────────────────────────────────────────────

  _epitKristalyok() {
    const n = this._n, lelo = this.racs.kristalyok, kozep = this.racs.kozepMagassag;
    const ef = this._eroforrasok;
    const helyDb = lelo.length;

    // Lelőhelyenként: 1 talp, 1 folt, 2-4 szilánk (az első a FŐ szilánk),
    // és minden másodikon egy lebegő szilánk.
    let szilankDb = 0, lebegoDb = 0;
    const szilankKezd = new Int32Array(helyDb + 1);
    const lebegoKezd = new Int32Array(helyDb + 1);
    for (let k = 0; k < helyDb; k++) {
      szilankKezd[k] = szilankDb;
      lebegoKezd[k] = lebegoDb;
      szilankDb += 2 + (keverd(lelo[k], MAG.KRI) % 3);
      if ((keverd(lelo[k], MAG.KRI) & 8) === 0) lebegoDb++;
    }
    szilankKezd[helyDb] = szilankDb;
    lebegoKezd[helyDb] = lebegoDb;

    const talp = ujHalo(this._geo.kristaly_talp, this.anyagTaj, helyDb);
    const szilank = ujHalo(this._geo.szilank, this.anyagKristaly, szilankDb);
    const burok = ujHalo(this._geo.burok, this.anyagBurok, szilankDb);
    const folt = ujHalo(this._geo.folt, this.anyagFolt, helyDb);
    const lebego = ujHalo(this._geo.szilank, this.anyagSzilank, lebegoDb);
    const meshek = [talp, szilank, burok, folt, lebego].filter(Boolean);
    // Néhány száz példány, az egész pályán szétszórva: a chunkolás és a kivágás
    // többe kerülne, mint amennyit megspórolna.
    for (const m of meshek) { m.frustumCulled = false; m.count = 0; this.gyoker.add(m); }
    // Az additív rétegek az átlátszó menetben, a tömör tüske UTÁN jönnek.
    if (folt) folt.renderOrder = 2;
    if (burok) burok.renderOrder = 3;

    const forras = {
      talp: new Float32Array(helyDb * 16),
      szilank: new Float32Array(szilankDb * 16),
      folt: new Float32Array(helyDb * 16),
      lebego: new Float32Array(lebegoDb * 16),
    };

    for (let k = 0; k < helyDb; k++) {
      const i = lelo[k];
      const x = i % n, y = (i / n) | 0, my = kozep[i];
      const hh = keverd(i, MAG.KRI);

      // Talp — a sötét kőgallér, amiből a szilánkok nőnek.
      _poz.set(x + 0.5, my - 0.04, y + 0.5);
      _eu.set(0, ((hh >>> 24) & 255) / 255 * TAU, 0);
      _qt.setFromEuler(_eu);
      const tm = 1.05 + ((hh >>> 12) & 255) / 255 * 0.5;
      _sc.set(tm, tm * 0.9, tm);
      _mat.compose(_poz, _qt, _sc);
      _mat.toArray(forras.talp, k * 16);

      // Szilánkok. A 0. a FŐ szilánk: magas, egyenes, középen — ez a
      // felismerhető jel. A többi kisebb, körülötte, megdöntve.
      const db = szilankKezd[k + 1] - szilankKezd[k];
      for (let t = 0; t < db; t++) {
        const h = keverd(i * 7 + t, MAG.KRI ^ 0x5bd1);
        const fo = t === 0;
        _poz.set(
          x + 0.5 + (fo ? 0 : ((h & 255) / 255 - 0.5) * 1.0),
          my - 0.18,
          y + 0.5 + (fo ? 0 : (((h >>> 8) & 255) / 255 - 0.5) * 1.0),
        );
        const m = fo ? 1.05 + ((h >>> 16) & 255) / 255 * 0.5
          : 0.42 + ((h >>> 16) & 255) / 255 * 0.5;
        const dol = fo ? 0.06 : 0.34;
        _eu.set(
          (((h >>> 24) & 255) / 255 - 0.5) * dol,
          ((h >>> 6) & 255) / 255 * TAU,
          (((h >>> 14) & 255) / 255 - 0.5) * dol,
        );
        _qt.setFromEuler(_eu);
        _sc.set(m, m * (fo ? 1.25 + ((h >>> 3) & 15) / 15 * 0.55 : 0.75 + ((h >>> 3) & 15) / 15 * 0.6), m);
        _mat.compose(_poz, _qt, _sc);
        _mat.toArray(forras.szilank, (szilankKezd[k] + t) * 16);
      }

      // Talajfolt — pár centivel a cella magassága fölé emelve, hogy ne
      // süllyedjen a terepbe.
      _poz.set(x + 0.5, my + 0.07, y + 0.5);
      _qt.set(0, 0, 0, 1);
      const fm = 2.3 + ((hh >>> 12) & 255) / 255 * 1.5;
      _sc.set(fm, 1, fm);
      _mat.compose(_poz, _qt, _sc);
      _mat.toArray(forras.folt, k * 16);

      // Lebegő szilánk — a keringést a vertex shader végzi a példány origója
      // körül, ezért a mátrix csak a KIINDULÓ helyet és méretet adja.
      if (lebegoKezd[k + 1] > lebegoKezd[k]) {
        const h = keverd(i, MAG.KRI ^ 0x99a3);
        _poz.set(x + 0.5 + 0.55, my + 1.15 + ((h >>> 16) & 255) / 255 * 0.7, y + 0.5);
        _eu.set(0.35, ((h >>> 6) & 255) / 255 * TAU, 0.2);
        _qt.setFromEuler(_eu);
        const m = 0.3 + ((h >>> 20) & 15) / 15 * 0.2;
        _sc.set(m, m, m);
        _mat.compose(_poz, _qt, _sc);
        _mat.toArray(forras.lebego, lebegoKezd[k] * 16);
      }
    }

    this._kristaly = {
      talp, szilank, burok, folt, lebego, forras,
      lelo, helyDb, szilankKezd, lebegoKezd,
      // cella → lelőhely-index a kimerülés figyeléséhez (vagy -1)
      node: ef ? Int32Array.from(lelo, (c) => ef.cellaNode[c]) : null,
      utolsoDb: -1,
    };
    this._kriIr(helyDb);   // első töltés: minden látszik
  }

  /**
   * A kristály-példányok újratöltése. `eloDb` = hány lelőhely él még; a
   * kimerültek KIMARADNAK — a letermelt kristály nem világíthat tovább.
   */
  _kriIr(eloDb) {
    const k = this._kristaly;
    if (!k) return;
    const el = k.node && this._eroforrasok
      ? (j) => k.node[j] < 0 || this._eroforrasok.keszlet[k.node[j]] > 0
      : () => true;
    let ti = 0, si = 0, li = 0;
    for (let j = 0; j < k.helyDb; j++) {
      if (!el(j)) continue;
      masol(k.forras.talp, j, k.talp, ti++);
      masol(k.forras.folt, j, k.folt, ti - 1);
      for (let t = k.szilankKezd[j]; t < k.szilankKezd[j + 1]; t++) {
        masol(k.forras.szilank, t, k.szilank, si);
        masol(k.forras.szilank, t, k.burok, si);
        si++;
      }
      for (let t = k.lebegoKezd[j]; t < k.lebegoKezd[j + 1]; t++) {
        masol(k.forras.lebego, t, k.lebego, li++);
      }
    }
    if (k.talp) { k.talp.count = ti; k.talp.instanceMatrix.needsUpdate = true; }
    if (k.folt) { k.folt.count = ti; k.folt.instanceMatrix.needsUpdate = true; }
    if (k.szilank) { k.szilank.count = si; k.szilank.instanceMatrix.needsUpdate = true; }
    if (k.burok) { k.burok.count = si; k.burok.instanceMatrix.needsUpdate = true; }
    if (k.lebego) { k.lebego.count = li; k.lebego.instanceMatrix.needsUpdate = true; }
    k.utolsoDb = eloDb;
  }

  // ── KÉPKOCKÁNKÉNTI MUNKA ─────────────────────────────────────────────────

  set kamera(k) { this._kamera = feloldKamera(k); }

  /**
   * Évszak: 0 tavasz · 1 nyár · 2 ősz · 3 tél, FOLYTONOSAN (2,4 = derekas ősz).
   * Négy uniform átírása, semmi több — ezért hívható akár képkockánként is.
   */
  set evszak(t) {
    if (t === this._evszak) return;
    this._evszak = t;
    evszakSzinek(t, this._u);
  }
  get evszak() { return this._evszak; }

  /** 0 = nappal, 1 = éjszaka. Csak a kristály-izzás erejét szabja — a fényekhez
   *  ez a réteg nem nyúl, az a `core3d.js` dolga. */
  set ejszaka(v) { this._u.uEj.value = v < 0 ? 0 : (v > 1 ? 1 : v); }
  get ejszaka() { return this._u.uEj.value; }

  /** A szonda újrafelállásakor a sim ÚJ példány, de a pálya (seed) ugyanaz. */
  ujraKot(sim) {
    if (!sim) return;
    if (sim.racs) this.racs = sim.racs;
    if (sim.eroforrasok) this._eroforrasok = sim.eroforrasok;
    if (this._utolsoDb) this._utolsoDb.fill(-1);
    if (this._kristaly) this._kristaly.utolsoDb = -1;
  }

  /* eslint-disable no-unused-vars */
  frissit(sim, alfa) {
    if (!this._enabled) { this._haromszog = 0; this._rajzhivas = 0; return; }
    this._u.uIdo.value = (performance.now() - this._kezdet) * 0.001;

    const ef = (sim && sim.eroforrasok) || this._eroforrasok;
    if (ef) this._lelohelyFrissit(ef);

    let tri = 0, hivas = 0;
    for (let i = 0; i < this._allandok.length; i++) {
      const a = this._allandok[i];
      if (!a.halo || a.halo.count === 0) continue;
      tri += a.halo.count * a.tri; hivas++;
    }
    const k = this._kristaly;
    if (k) {
      if (k.talp && k.talp.count) { tri += k.talp.count * this._tri.kristaly_talp; hivas++; }
      if (k.szilank && k.szilank.count) { tri += k.szilank.count * this._tri.szilank; hivas++; }
      if (k.burok && k.burok.count) { tri += k.burok.count * this._tri.burok; hivas++; }
      if (k.folt && k.folt.count) { tri += k.folt.count * this._tri.folt; hivas++; }
      if (k.lebego && k.lebego.count) { tri += k.lebego.count * this._tri.szilank; hivas++; }
    }

    const kam = this._kamera || (this._kamera = aktivKamera());
    if (!kam) {
      // Kamera nélkül nincs LOD: mindent kirajzolunk. (Fejlesztői eset; a
      // `Kamera3D` a `core3d`-be feliratkozik, tehát élesben nem fordul elő.)
      for (const c of this._faChunkok) {
        c.tavoli.visible = true; c.tavoli.count = c.osszes;
        if (c.fenyo) c.fenyo.visible = false;
        if (c.lombfa) c.lombfa.visible = false;
        tri += c.osszes * this._tri.tavoli; hivas++;
      }
      for (const c of this._aljChunkok) {
        if (c.bokor) c.bokor.visible = false;
        if (c.szikla) c.szikla.visible = false;
      }
      this._haromszog = tri; this._rajzhivas = hivas;
      return;
    }

    const px = kam.position.x, pz = kam.position.z;
    _m4.multiplyMatrices(kam.projectionMatrix, kam.matrixWorldInverse);
    _frusztum.setFromProjectionMatrix(_m4);

    // ── ERDŐ ──────────────────────────────────────────────────────────────
    const fc = this._faChunkok;
    for (let i = 0; i < fc.length; i++) {
      const c = fc[i];
      const dx = c.kx - px, dz = c.kz - pz;
      const tav = Math.sqrt(dx * dx + dz * dz);
      if (tav - c.gomb.radius > REJT_TAV) {
        if (c.fenyo) c.fenyo.visible = false;
        if (c.lombfa) c.lombfa.visible = false;
        c.tavoli.visible = false;
        continue;
      }
      const kozel = tav < RESZLET_TAV;
      if (c.fenyo) c.fenyo.visible = kozel;
      if (c.lombfa) c.lombfa.visible = kozel;
      c.tavoli.visible = !kozel;

      const lathato = _frusztum.intersectsSphere(c.gomb);
      if (kozel) {
        if (c.fenyo) c.fenyo.count = c.fenyoDb;
        if (c.lombfa) c.lombfa.count = c.lombDb;
        if (lathato) {
          if (c.fenyoDb) { tri += c.fenyoDb * this._tri.fenyo; hivas++; }
          if (c.lombDb) { tri += c.lombDb * this._tri.lombfa; hivas++; }
        }
        continue;
      }
      // Ritkítás: a `count` levétele NEM adatmozgatás, csak egy rajzolási
      // paraméter — a megkevert példány-sorrend miatt mégis térben egyenletes
      // mintát hagy. A ramp folytonos, ezért panorámázáskor nem egy SÁVNYI erdő
      // tűnik el egyszerre, hanem chunkonként pár fa.
      let db = c.osszes;
      if (tav > RITKIT_KEZD) {
        const t = Math.min(1, (tav - RITKIT_KEZD) / (RITKIT_VEG - RITKIT_KEZD));
        db = Math.max(1, (c.osszes * (1 - t * (1 - RITKA_ALJ))) | 0);
      }
      c.tavoli.count = db;
      if (lathato) { tri += db * this._tri.tavoli; hivas++; }
    }

    // ── ALJNÖVÉNYZET ──────────────────────────────────────────────────────
    const ac = this._aljChunkok;
    for (let i = 0; i < ac.length; i++) {
      const c = ac[i];
      const dx = c.kx - px, dz = c.kz - pz;
      const tav = Math.sqrt(dx * dx + dz * dz) - c.gomb.radius;
      const latszik = tav < ALJ_TAV;
      if (c.bokor) c.bokor.visible = latszik;
      if (c.szikla) c.szikla.visible = latszik;
      if (!latszik) continue;
      // Ugyanaz a ritkítás, mint az erdőnél: a chunk 64 cella széles, tehát a
      // TÁVOLI FELE úgyis alig látszik. A megkevert példány-sorrend miatt a
      // `count` levétele térben egyenletesen ritkít — és mivel a ramp
      // folytonos, a bokrok nem egyszerre tűnnek el, hanem fogyatkoznak.
      let arany = 1;
      if (tav > ALJ_RITKIT) {
        const t = Math.min(1, (tav - ALJ_RITKIT) / (ALJ_TAV - ALJ_RITKIT));
        arany = 1 - t * (1 - ALJ_RITKA);
      }
      const bDb = c.bokorDb ? Math.max(1, (c.bokorDb * arany) | 0) : 0;
      const sDb = c.sziklaDb ? Math.max(1, (c.sziklaDb * arany) | 0) : 0;
      if (c.bokor) c.bokor.count = bDb;
      if (c.szikla) c.szikla.count = sDb;
      if (!_frusztum.intersectsSphere(c.gomb)) continue;
      if (bDb) { tri += bDb * this._tri.bokor; hivas++; }
      if (sDb) { tri += sDb * this._tri.szikla; hivas++; }
    }

    this._haromszog = tri;
    this._rajzhivas = hivas;
  }
  /* eslint-enable no-unused-vars */

  /**
   * A lelőhely-öltöztetés újratöltése — CSAK ha a látható darabszám változott.
   * Előbb csak SZÁMOLUNK: néhány száz egész-összehasonlítás nagyságrendekkel
   * olcsóbb, mint a példány-puffer feltöltése és felküldése a GPU-ra.
   */
  _lelohelyFrissit(ef) {
    const dep = this._dep;
    const kri = this._kristaly;
    // Előre lefoglalt számláló: egy `[a,b,c,d]` literál itt képkockánkénti
    // allokáció lenne — mérve 1,3 KB/képkocka, vagyis 80 KB szemét másodpercenként.
    const elo = this._eloDb;
    elo[0] = elo[1] = elo[2] = elo[3] = 0;
    for (let i = 0; i < ef.db; i++) {
      if (ef.keszlet[i] > 0) elo[ef.fajta[i]]++;
    }
    const el3 = elo[3];
    if (dep) {
      for (let f = 0; f < 3; f++) {
        const d = dep[f];
        if (!d || elo[f] === this._utolsoDb[f]) continue;
        let ir = 0;
        for (let s = 0; s < d.db; s++) {
          if (ef.keszlet[d.lelo[s]] <= 0) continue;
          masol(d.forras, s, d.halo, ir++);
        }
        d.halo.count = ir;
        d.halo.instanceMatrix.needsUpdate = true;
        this._utolsoDb[f] = elo[f];
      }
    }
    if (kri && kri.node && el3 !== kri.utolsoDb) this._kriIr(el3);
  }

  // ── RÉTEG-SZERZŐDÉS ──────────────────────────────────────────────────────

  set enabled(v) {
    this._enabled = !!v;
    this.gyoker.visible = this._enabled;   // NEM bontunk le semmit
    if (!this._enabled) { this._haromszog = 0; this._rajzhivas = 0; }
  }
  get enabled() { return this._enabled; }
  get haromszog() { return this._haromszog; }
  get rajzhivas() { return this._rajzhivas; }

  /** Diagnosztika a szondának / a HUD-nak. */
  get statisztika() {
    let fenyo = 0, lombfa = 0, bokor = 0, szikla = 0;
    for (const c of (this._faChunkok || [])) { fenyo += c.fenyoDb; lombfa += c.lombDb; }
    for (const c of (this._aljChunkok || [])) { bokor += c.bokorDb; szikla += c.sziklaDb; }
    const k = this._kristaly;
    return {
      fa: fenyo + lombfa, fenyo, lombfa, bokor, szikla,
      ronk: this._ronk ? this._ronk.count : 0,
      lelohely: this._dep ? this._dep.reduce((s, d) => s + (d ? d.halo.count : 0), 0) : 0,
      kristalySzilank: k && k.szilank ? k.szilank.count : 0,
      kristalyHely: k ? k.helyDb : 0,
      faChunk: this._faChunkok ? this._faChunkok.length : 0,
      aljChunk: this._aljChunkok ? this._aljChunkok.length : 0,
      evszak: this._evszak,
    };
  }

  bont() {
    for (const g of Object.values(this._geo)) g.dispose();
    for (const a of [this.anyagTaj, this.anyagKristaly, this.anyagSzilank,
      this.anyagBurok, this.anyagFolt]) a.dispose();
    this.gyoker.clear();
    this.jelenet.remove(this.gyoker);
    this._faChunkok = [];
    this._aljChunkok = [];
    this._allandok = [];
    this._dep = null;
    this._kristaly = null;
    this._ronk = null;
  }
}

// ── SEGÉDEK ────────────────────────────────────────────────────────────────

/** Fenyő vagy lombos fa? Cella-indexből, tehát a felállástól független. */
function fenyoE(i) { return keverd(i, MAG.FAJ) % 100 < 58; }

/**
 * Példány-háló a díszlet közös beállításaival. `db = 0` esetén `null` — üres
 * `InstancedMesh`-t nem hozunk létre, mert az is puffert foglalna.
 */
function ujHalo(geo, anyag, db) {
  if (!db) return null;
  const m = new THREE.InstancedMesh(geo, anyag, db);
  m.matrixAutoUpdate = false; m.updateMatrix();
  m.instanceMatrix.setUsage(THREE.StaticDrawUsage);   // felépítés után sosem változik
  m.count = db;
  return m;
}

/**
 * Egy 16 floatos mátrix átmásolása forrás-tömbből a mesh példány-pufferébe.
 * Nyers tömb-írás `Matrix4` nélkül: a tömörítés így nem allokál.
 */
function masol(forras, fi, halo, ci) {
  if (!halo) return;
  const cel = halo.instanceMatrix.array;
  const a = fi * 16, b = ci * 16;
  for (let j = 0; j < 16; j++) cel[b + j] = forras[a + j];
}
