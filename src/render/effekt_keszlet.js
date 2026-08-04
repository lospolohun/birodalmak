// AGE OF THE CRYSTALS — EFFEKT-KÉSZLET: a harci látvány részecske-tára.
//
// ── MIÉRT NEM ISMERI EZ A FÁJL A `three`-T ────────────────────────────────
// Ez a réteg render-oldali (a sim SOHA nem látja, és sosem írunk vissza), de
// szándékosan TISZTA JS: se `three`, se DOM. Egyetlen oka van, és ez a projekt
// legdrágább tanulsága: „a zöld kapu nem működés-kapu". Egy effekt-réteg, ami
// soha nem szólal meg, tökéletesen zöld — a build lefordul, a determinizmus-
// szonda átmegy, a képernyőn pedig semmi. GPU nélkül csak úgy tudom SZÁMMAL
// igazolni, hogy tényleg keletkeznek effektek, ha a részecske-tár és a
// keletkezés-logika node-ban is lefut. A `three` csak a FELTÖLTÉST végzi
// (`effekt_harc.js`), a modellt nem.
//
// Ugyanez a `menu.js` / `menu_adat.js` bevált mintája, csak a render oldalán.
//
// ── MIÉRT KÉSZLET (POOL), ÉS MIÉRT FIX A FELSŐ KORLÁT ─────────────────────
// A v0.8 lockstepjében egyetlen ticken több száz esemény érkezhet (egy sortűz
// becsapódása, egy összeomló épület, húsz egyszerre meghaló katona). Ha
// eseményenként objektumot foglalnánk, a GC pont a csata csúcsán akadna be —
// vagyis ott, ahol a képkocka-idő amúgy is a legszűkebb. Ezért:
//
//   · minden mező ELŐRE FOGLALT `Float32Array` / `Uint8Array` (SoA),
//   · a `szul()` egy szabad rekeszt vesz el, és `-1`-et ad, ha nincs több,
//   · a lejárt részecske helyére az UTOLSÓ ugrik be (swap-remove).
//
// A swap-remove miatt a `lep()` ciklusa VISSZAFELÉ megy — ugyanaz a csapda,
// mint a `sim/lovedek.js`-ben: előrefelé a beugró utolsó elemet kihagynánk.
//
// A felső korlát nem óvatosság, hanem MÉRT büdzsé. A friss mérés (1600 egység,
// AMD Radeon R9 M380, ANGLE/Metal) 460k háromszög és 92 rajzhívás mellett
// 9,3 ms p95-öt adott. A készlet ebből három rajzhívást és legrosszabb esetben
// ~14k háromszöget vesz el (lásd `haromszogBecsles()`), viszont a valódi
// veszély a KITÖLTÉS: az átlátszó, egymásra rétegzett lapok kétszer-háromszor
// írják ugyanazt a képpontot. Ezért a korlát a DARABSZÁMRA megy, nem a
// háromszögre, és ezért van a keletkezésnek távolság-ritkítása is
// (`effekt_esemeny.js`).
//
// ── MIÉRT A KÉSZLETBEN VANNAK A „RECEPTEK" ───────────────────────────────
// A `szul()` tizenöt paramétere olvashatatlan lenne a hívási helyen, egy
// opció-objektum viszont képkockánként allokálna. A megoldás: a KÉSZLET tudja,
// hogy néz ki egy becsapódás-villanás vagy egy összeomlás-porfelhő
// (`villanas()`, `porFelho()`, `tormelekek()`, …), a figyelő-réteg pedig csak
// azt mondja meg, MI történt és HOL. Így a látvány hangolása egyetlen fájlban
// marad, és a felismerő-logika nem hígul fel színkonstansokkal.
//
// ── AZ IDŐ ITT VALÓS IDŐ, NEM SIM-IDŐ ─────────────────────────────────────
// A figurák járása szándékosan a sim órájából megy (`units3d.js`), mert
// különben megcsúszna a talp. A részecskék MÁS: nincs sim-beli megfelelőjük,
// amihez tapadniuk kéne, viszont egy tick-hez kötött porfelhő 20 Hz-en
// lépcsőzne. Ezért a `lep(dt)` valós másodpercet kap. Következmény: szüneteltetett
// simen az utolsó robbanás még leül — ez így helyes.

/** Részecske-fajták. A `FAJTA_CSOPORT` mondja meg, melyik meshbe kerülnek. */
export const EFAJTA = {
  VILLANAS: 0,   // rövid, additív fényfolt (csapás, becsapódás)
  SZIKRA: 1,     // apró additív szilánk, ballisztikus
  POR: 2,        // világos, lágy porfelhő
  FUST: 3,       // sötét, lassan emelkedő füst
  TORMELEK: 4,   // szilárd kőszilánk, ballisztikus + pörgő
  ROM: 5,        // az összeomló épület süllyedő maradványa
  NYOM: 6,       // talajra fektetett, lassan halványuló rombolás-folt
  KO: 7,         // ostromgép köve: ív, majd a becsapódás kiváltása
};

/** Rajzcsoportok — ennyi `InstancedMesh` (és ennyi rajzhívás) megy ki. */
export const CSOPORT = { IZZO: 0, LAGY: 1, SZILARD: 2 };

/** Melyik fajta melyik csoportban rajzolódik. Index = `EFAJTA.*`. */
export const FAJTA_CSOPORT = new Uint8Array([
  CSOPORT.IZZO,     // VILLANAS
  CSOPORT.IZZO,     // SZIKRA
  CSOPORT.LAGY,     // POR
  CSOPORT.LAGY,     // FUST
  CSOPORT.SZILARD,  // TORMELEK
  CSOPORT.SZILARD,  // ROM
  CSOPORT.LAGY,     // NYOM
  CSOPORT.SZILARD,  // KO
]);

/** Nehézkedés hat rá? (világegység/mp²-ben lefelé) */
const GRAVITALIS = new Uint8Array([0, 1, 0, 0, 1, 0, 0, 1]);
/** A talajhoz tapad-e (nem esik át rajta, hanem megáll/pattan)? */
const TALAJRA_ESIK = new Uint8Array([0, 1, 0, 0, 1, 0, 0, 1]);
/** Kamerára forduló lap (1) vagy vízszintesen fektetett/szilárd test (0)? */
export const PLAKAT = new Uint8Array([1, 1, 1, 1, 0, 0, 0, 0]);
/** Vízszintes talajfolt? (a `NYOM` az egyetlen ilyen a lágy csoportban) */
export const FEKVO = new Uint8Array([0, 0, 0, 0, 0, 0, 1, 0]);

const G = 17.0;

/**
 * A méret- és alfa-burkológörbe töréspontja: a részecske az élettartama első
 * `FEL` részében nő be, utána halványul el. Nulláról indul és nullára ér —
 * enélkül a keletkezés és az eltűnés is pattanna, ami pont az a hiba, amit a
 * feladat az épület-pusztulásnál külön nevesít.
 */
const FEL = 0.18;

export class EffektKeszlet {
  /**
   * @param {number} max egyszerre élő részecskék felső korlátja
   */
  constructor(max = 1200) {
    this.max = max | 0;
    this.db = 0;
    const m = this.max;

    this.x = new Float32Array(m);
    this.y = new Float32Array(m);
    this.z = new Float32Array(m);
    this.vx = new Float32Array(m);
    this.vy = new Float32Array(m);
    this.vz = new Float32Array(m);
    /** Hátralévő élettartam másodpercben; `maxElet` a teljes. */
    this.elet = new Float32Array(m);
    this.maxElet = new Float32Array(m);
    /** Kezdő és végméret — a kettő között a burkológörbe interpolál. */
    this.meret0 = new Float32Array(m);
    this.meret1 = new Float32Array(m);
    this.r = new Float32Array(m);
    this.g = new Float32Array(m);
    this.b = new Float32Array(m);
    /** Csúcs-átlátszatlanság (a burkológörbe ezt szorozza). */
    this.alfa = new Float32Array(m);
    this.fajta = new Uint8Array(m);
    /** Forgás és pörgés — csak a szilárd testeknél számít. */
    this.forg = new Float32Array(m);
    this.forgS = new Float32Array(m);
    /** A talaj magassága a részecske alatt (a keltő réteg adja a rácsból). */
    this.talaj = new Float32Array(m);
    /** 1 = az élettartam végén törmelék-robbanást hagy maga után (KO). */
    this.robban = new Uint8Array(m);

    /**
     * Csoportonkénti darabszám — ebből tudja a feltöltő réteg, mekkora
     * `count`-ot állítson, és a szonda ebből olvassa a bontást. Előre foglalt
     * tömb: a `lep()` nem allokál.
     */
    this.csoportDb = new Int32Array(3);

    /** Halmozott statisztika — a szonda ezekből igazolja, hogy MŰKÖDIK. */
    this.szuletett = 0;
    /** Hányszor nem fért be részecske (a készlet betelt). */
    this.elutasitott = 0;

    /**
     * SAJÁT véletlen-generátor. Nem `Math.random()`: így a szonda futásai
     * összehasonlíthatók, és a képernyőkép is reprodukálható. A simhez SEMMI
     * köze — a render szórása sosem kerül vissza a világállapotba.
     */
    this._mag = 0x9e3779b9;
  }

  /** Xorshift32 [0,1). Render-oldali szórás, NEM a sim RNG-je. */
  _v() {
    let s = this._mag;
    s ^= s << 13; s |= 0;
    s ^= s >>> 17;
    s ^= s << 5; s |= 0;
    this._mag = s;
    return ((s >>> 0) % 1000000) / 1000000;
  }

  /** Szimmetrikus szórás [-a, a). */
  _sz(a) { return (this._v() * 2 - 1) * a; }

  /**
   * A render-oldali szórás NYILVÁNOS felülete. A figyelő-réteg is ebből kér
   * véletlent (pl. hol csattan a csapás a falon), és fontos, hogy UGYANEBBŐL:
   * két külön generátor két külön sorozata reprodukálhatatlanná tenné a
   * szonda-futásokat és a képernyőképet.
   */
  veletlen() { return this._v(); }
  szoras(a) { return this._sz(a); }

  /** Teljes ürítés — meccs-újraindításkor. */
  nullaz() {
    this.db = 0;
    this.szuletett = 0;
    this.elutasitott = 0;
    this.csoportDb[0] = 0; this.csoportDb[1] = 0; this.csoportDb[2] = 0;
  }

  /** Hány rekesz szabad még? A ritkítás ebből dolgozik. */
  get szabad() { return this.max - this.db; }
  /** Kihasználtság 0..1 — a figyelő ez alapján hagy el mellékes effekteket. */
  get telitettseg() { return this.db / this.max; }

  // ── ALAP-KELTÉS ────────────────────────────────────────────────────────

  /**
   * Egy részecske. Pozicionális paraméterek, mert egy opció-objektum
   * képkockánként több százszor allokálna.
   * @returns {number} index, vagy -1 ha betelt a készlet
   */
  szul(fajta, x, y, z, vx, vy, vz, elet, m0, m1, r, g, b, alfa, talaj) {
    if (this.db >= this.max) { this.elutasitott++; return -1; }
    const i = this.db++;
    this.fajta[i] = fajta;
    this.x[i] = x; this.y[i] = y; this.z[i] = z;
    this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.elet[i] = elet; this.maxElet[i] = elet;
    this.meret0[i] = m0; this.meret1[i] = m1;
    this.r[i] = r; this.g[i] = g; this.b[i] = b;
    this.alfa[i] = alfa;
    this.forg[i] = this._v() * 6.2831853;
    this.forgS[i] = this._sz(6.0);
    this.talaj[i] = talaj;
    this.robban[i] = 0;
    this.szuletett++;
    return i;
  }

  /** Swap-remove: az utolsó rekesz beugrik a kivett helyére. */
  _kivesz(i) {
    const u = --this.db;
    if (i === u) return;
    this.x[i] = this.x[u]; this.y[i] = this.y[u]; this.z[i] = this.z[u];
    this.vx[i] = this.vx[u]; this.vy[i] = this.vy[u]; this.vz[i] = this.vz[u];
    this.elet[i] = this.elet[u]; this.maxElet[i] = this.maxElet[u];
    this.meret0[i] = this.meret0[u]; this.meret1[i] = this.meret1[u];
    this.r[i] = this.r[u]; this.g[i] = this.g[u]; this.b[i] = this.b[u];
    this.alfa[i] = this.alfa[u];
    this.fajta[i] = this.fajta[u];
    this.forg[i] = this.forg[u]; this.forgS[i] = this.forgS[u];
    this.talaj[i] = this.talaj[u];
    this.robban[i] = this.robban[u];
  }

  // ── RECEPTEK ───────────────────────────────────────────────────────────
  // Innentől a látvány. A figyelő-réteg CSAK ezeket hívja, tehát a színek és
  // az arányok egy helyen hangolhatók.

  /** Rövid fényvillanás — csapás, becsapódás, kilövés. */
  villanas(x, y, z, meret, r, g, b, talaj, elet = 0.16) {
    return this.szul(EFAJTA.VILLANAS, x, y, z, 0, 0, 0,
      elet, meret * 0.45, meret, r, g, b, 0.95, talaj);
  }

  /** Szikrák sugárban szét. `db` felfelé korlátozódik a szabad helyre. */
  szikrak(db, x, y, z, ero, r, g, b, talaj) {
    let n = 0;
    for (let k = 0; k < db; k++) {
      const i = this.szul(EFAJTA.SZIKRA, x, y, z,
        this._sz(ero), this._v() * ero * 1.1 + ero * 0.25, this._sz(ero),
        0.30 + this._v() * 0.30, 0.10, 0.03, r, g, b, 1.0, talaj);
      if (i < 0) break;
      n++;
    }
    return n;
  }

  /** Porfelhő — a becsapódás „port ver". Világos, lassan táguló, felszálló. */
  porFelho(db, x, y, z, szorodas, meret, elet, talaj, r = 0.78, g = 0.71, b = 0.58) {
    let n = 0;
    for (let k = 0; k < db; k++) {
      const i = this.szul(EFAJTA.POR,
        x + this._sz(szorodas), y + this._v() * szorodas * 0.6, z + this._sz(szorodas),
        this._sz(0.9), 0.35 + this._v() * 0.6, this._sz(0.9),
        elet * (0.7 + this._v() * 0.6),
        meret * 0.5, meret * (1.4 + this._v() * 0.7),
        r, g, b, 0.42, talaj);
      if (i < 0) break;
      n++;
    }
    return n;
  }

  /** Füstgomb — az összeomló épület fölé. Sötét, lassú, hosszú életű. */
  fustGomb(db, x, y, z, szorodas, meret, elet, talaj) {
    let n = 0;
    for (let k = 0; k < db; k++) {
      const s = 0.20 + this._v() * 0.16;
      const i = this.szul(EFAJTA.FUST,
        x + this._sz(szorodas), y + this._v() * szorodas, z + this._sz(szorodas),
        this._sz(0.55), 0.8 + this._v() * 0.9, this._sz(0.55),
        elet * (0.75 + this._v() * 0.5),
        meret * 0.55, meret * (1.7 + this._v() * 0.8),
        s, s * 0.97, s * 0.95, 0.5, talaj);
      if (i < 0) break;
      n++;
    }
    return n;
  }

  /** Kő- és fatörmelék, ballisztikusan szét. */
  tormelekek(db, x, y, z, ero, meret, talaj, r = 0.36, g = 0.32, b = 0.28) {
    let n = 0;
    for (let k = 0; k < db; k++) {
      const i = this.szul(EFAJTA.TORMELEK, x, y, z,
        this._sz(ero), this._v() * ero + ero * 0.35, this._sz(ero),
        0.9 + this._v() * 0.8,
        meret * (0.6 + this._v() * 0.8), meret * (0.6 + this._v() * 0.8),
        r, g, b, 1.0, talaj);
      if (i < 0) break;
      n++;
    }
    return n;
  }

  /**
   * Az összeomló épület MARADVÁNYA: egy süllyedő, zsugorodó test az épület
   * helyén. Ez az, amitől az épület nem PATTANVA tűnik el — a `gazdasag3d.js`
   * a pusztulás pillanatában leveszi a példányt, ez pedig átveszi a helyét.
   */
  rom(x, y, z, meret, elet, r, g, b, talaj) {
    const i = this.szul(EFAJTA.ROM, x, y, z, 0, -meret * 0.30 / elet, 0,
      elet, meret, meret * 0.55, r, g, b, 1.0, talaj);
    if (i >= 0) { this.forg[i] = 0; this.forgS[i] = this._sz(0.35); }
    return i;
  }

  /** Rombolás-nyom a talajon: sötét folt, ami sokáig kint marad és elhalványul. */
  nyom(x, y, z, meret, elet, talaj) {
    const s = 0.16 + this._v() * 0.08;
    return this.szul(EFAJTA.NYOM, x, y, z, 0, 0, 0,
      elet, meret * 0.75, meret, s, s * 0.9, s * 0.82, 0.5, talaj);
  }

  /**
   * OSTROMGÉP KÖVE — látható röppálya.
   *
   * ⚠️ Ez a RENDER találmánya: a sim ostromgépe közelharcos (`HATOTAV[4] = 3,2`),
   * és a csapást AZONNAL kiosztja. A kő tehát nem lövedék, hanem a már megtörtént
   * csapás megjelenítése — pontosan ezért nem is ír vissza semmit. A repülési
   * időt (`ido`) rövidre vesszük, hogy a becsapódás-por ne csússzon el érezhetően
   * a sim sebzésétől.
   */
  koIv(x, y, z, cx, cy, cz, ido, talaj) {
    const vx = (cx - x) / ido;
    const vz = (cz - z) / ido;
    const vy = (cy - y) / ido + 0.5 * G * ido;
    const i = this.szul(EFAJTA.KO, x, y, z, vx, vy, vz, ido,
      0.42, 0.42, 0.40, 0.36, 0.31, 1.0, cy);
    if (i >= 0) this.robban[i] = 1;
    return i;
  }

  // ── LÉPÉS ──────────────────────────────────────────────────────────────

  /**
   * EGY képkocka. `dt` VALÓS másodperc (lásd a fejlécet), felülről vágva —
   * egy háttérbe tett fül visszatérésekor különben minden részecske egyetlen
   * lépésben a föld alá zuhanna.
   *
   * Nulla allokáció: csak tömb-írás és aritmetika.
   */
  lep(dt) {
    if (dt > 0.1) dt = 0.1;
    if (dt <= 0) return;
    this.csoportDb[0] = 0; this.csoportDb[1] = 0; this.csoportDb[2] = 0;

    // ⚠️ VISSZAFELÉ: a swap-remove az utolsó elemet hozza ide.
    for (let i = this.db - 1; i >= 0; i--) {
      const el = (this.elet[i] -= dt);
      if (el <= 0) {
        // A becsapódó kő maga után törmeléket és port hagy. A `_kivesz` ELŐTT
        // olvassuk ki a pozíciót: utána a rekesz már az utolsó elemé.
        if (this.robban[i] === 1) {
          const bx = this.x[i], by = this.y[i], bz = this.z[i], bt = this.talaj[i];
          this._kivesz(i);
          this.villanas(bx, by, bz, 1.5, 1.0, 0.86, 0.55, bt, 0.13);
          this.tormelekek(6, bx, by, bz, 3.4, 0.20, bt);
          this.porFelho(5, bx, by, bz, 0.55, 1.9, 1.0, bt);
          this.nyom(bx, bt + 0.03, bz, 1.5, 7.0, bt);
          continue;
        }
        this._kivesz(i);
        continue;
      }

      const f = this.fajta[i];
      if (GRAVITALIS[f]) this.vy[i] -= G * dt;
      const nx = this.x[i] + this.vx[i] * dt;
      const ny = this.y[i] + this.vy[i] * dt;
      const nz = this.z[i] + this.vz[i] * dt;
      this.x[i] = nx; this.z[i] = nz;

      if (TALAJRA_ESIK[f] && ny <= this.talaj[i] + 0.04) {
        // Földet ért: kis visszapattanás, majd elfekszik. A törmelék így nem
        // tűnik el a levegőben, és nem is süllyed a terep alá.
        this.y[i] = this.talaj[i] + 0.04;
        if (f === EFAJTA.KO) {
          // A kő nem pattan: a becsapódás a lényeg, ezért azonnal lejár.
          this.elet[i] = 0.0001;
        } else if (this.vy[i] < 0) {
          this.vy[i] *= -0.28;
          this.vx[i] *= 0.55; this.vz[i] *= 0.55;
          if (this.vy[i] > -0.25 && this.vy[i] < 0.25) { this.vy[i] = 0; this.vx[i] = 0; this.vz[i] = 0; }
        }
      } else {
        this.y[i] = ny;
      }

      // A lágy felhők lassulnak (levegő-ellenállás), különben egyenesen
      // elsodródnának a keletkezés helyétől.
      if (f === EFAJTA.POR || f === EFAJTA.FUST) {
        const cs = 1 - 1.35 * dt;
        this.vx[i] *= cs; this.vz[i] *= cs;
        this.vy[i] *= 1 - 0.55 * dt;
      }
      if (f === EFAJTA.ROM || f === EFAJTA.TORMELEK || f === EFAJTA.KO) {
        this.forg[i] += this.forgS[i] * dt;
      }

      this.csoportDb[FAJTA_CSOPORT[f]]++;
    }
  }

  // ── KIOLVASÁS (a feltöltő réteg és a szonda használja) ──────────────────

  /**
   * A burkológörbe egy részecskére: `[méret, alfa]` a `ki` tömbbe.
   * Külön metódus, mert a `three`-s feltöltő és a node-os szonda-rajzoló is
   * ugyanezt akarja látni — két külön képlet garantáltan elcsúszna.
   * @param {number} i @param {Float32Array|number[]} ki 2 elemű kimenet
   */
  burkolo(i, ki) {
    const t = this.maxElet[i] > 0 ? 1 - this.elet[i] / this.maxElet[i] : 1;
    const s = t < 0 ? 0 : (t > 1 ? 1 : t);
    ki[0] = this.meret0[i] + (this.meret1[i] - this.meret0[i]) * s;
    // Háromszög-burkoló: `FEL` alatt felfut, utána lecseng. A `VILLANAS`
    // szándékosan meredekebb (négyzetes lecsengés), hogy csapásnak hasson, ne
    // lámpának.
    let a;
    if (s < FEL) a = s / FEL;
    else { const u = (1 - s) / (1 - FEL); a = u; }
    if (this.fajta[i] === EFAJTA.VILLANAS) a *= a;
    ki[1] = this.alfa[i] * a;
  }

  /**
   * Legrosszabb esetű háromszög-becslés. A plakát 2, a szilárd test 12 —
   * a réteg `haromszog` gettere ebből számol, hogy az FPS-szonda réteg-bontása
   * a készletre is igaz maradjon.
   */
  haromszogBecsles() {
    return (this.csoportDb[CSOPORT.IZZO] + this.csoportDb[CSOPORT.LAGY]) * 2
      + this.csoportDb[CSOPORT.SZILARD] * 12;
  }
}
