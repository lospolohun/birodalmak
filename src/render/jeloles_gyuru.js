// AGE OF THE CRYSTALS — KIJELÖLŐ GYŰRŰK ÉS CÉLPONT-JELÖLÉS.
//
// ── MI VÁLTOZOTT A v0.2-HÖZ KÉPEST, ÉS MIÉRT ──────────────────────────────
// A v0.2-es gyűrű EGY vékony karika volt, aminek a színe az egység ÁLLAPOTÁT
// mondta (zöld = áll, sárga = megy, vörös = harcol). Akkor ez volt a helyes
// döntés: sebzés még nem volt, tehát a „megtalálta-e az ellenfelét" kérdésre
// máshonnan nem jött volna válasz.
//
// A v0.16-ban viszont a tulajdonos kipróbálta a játékot, és nem tudta
// megmondani, MELYIK a sajátja. Ez súlyosabb baj, mint a hiányzó állapot-szín:
// egy stratégiai játékban a legelső kérdés a „ki vagyok én". Ezért a gyűrű
// alapszíne mostantól a CSAPATSZÍN, és az állapot csak ÁRNYALJA (a harcban
// álló egység gyűrűje a vörös felé húz). A kettő nem zárja ki egymást: a
// csapat-hovatartozás a színezet, az állapot a hőmérséklet.
//
// ── MIÉRT KÉT GYŰRŰ EGY EGYSÉG ALATT ──────────────────────────────────────
// Egy `MeshBasicMaterial` karika a fűben zöld a zöldön, a havon fehér a
// fehéren. Bármelyik EGY színt választjuk, lesz olyan terep, amin eltűnik.
// Ezért a színes gyűrű alatt van egy valamivel nagyobb, SÖTÉT kontraszt-gyűrű:
// a sötét körvonal minden terepen kiválik, és a színes karika azon ül.
//
// ⚠️ A kontraszt-gyűrű MEGDUPLÁZZA a példányszámot, és a „mindent kijelöl"
// 1600 egységet is jelenthet. 460 000 háromszögnyi alapterhelés mellett a
// kétszeres jelölő-költség mérhető. Ezért a kontraszt-gyűrű `KONTRASZT_HATAR`
// fölötti kijelölésnél KIMARAD: annyi egységnél úgyis egybefolyik a kép, a
// karikák olvashatósága már nem az a kérdés, amin a játék múlik.
//
// ── CÉLPONT-GYŰRŰ: AZ „ELLENSÉGES ÉS SEMLEGES" ÁG ─────────────────────────
// A kijelölés MODELLJE (`src/ui/kijeloles.js`) csak SAJÁT egységet enged
// kijelölni — ellenséges gyűrű tehát sosem a kijelölésből jön, hanem abból,
// hogy a kijelölt egységeim KIT TÁMADNAK (`pa.celEgyseg`). Ez a v0.4 óta
// hiányzó visszajelzés: eddig a „támadd meg azt" parancs után semmi nem
// mutatta, hogy a katonáim tényleg megfogták-e a célt.
//
// A célgyűrű LÜKTET (a sim órájából, nem a `performance.now()`-ból). A
// lüktetés nem dísz: egy álló vörös karika összeolvadna a harcban álló saját
// egység árnyalatával, a ritmus viszont a szem perifériáján is más.
//
// ⚠️ A viszony-táblák (`VISZONY_SZIN`) hossza a `VISZONY` kulcsainak száma. Ha
// egyszer lesz harmadik fél (gaia, szövetséges), ITT is új sor kell, különben
// `undefined` szín → NaN a példány-színben → fekete vagy szemetes gyűrű,
// némán.

import { THREE } from './core3d.js';
import {
  Raj, gyuruGeo, CSAPAT_SZIN, VISZONY, VISZONY_SZIN, KONTRASZT_SZIN,
} from './jeloles_kozos.js';

/** Gyűrű-felbontás. 20 szegmens = 40 háromszög; 12 a kontrasztnak elég. */
const SZEGMENS = 20;
const KONTRASZT_SZEGMENS = 12;

/** A gyűrű a talaj FÖLÖTT lebeg ennyivel, hogy ne z-harcoljon a tereppel. */
const MAGASSAG = 0.07;
/** A kontraszt-gyűrű ennyivel lejjebb — külön réteg, nem külön magasság-hiba. */
const KONTRASZT_MAGASSAG = 0.055;

/** E fölött a kijelölés-méret fölött elmarad a kontraszt-gyűrű (lásd fejléc). */
const KONTRASZT_HATAR = 400;

/** A színes gyűrű sávja (a sugár arányában) és a kontraszté. */
const BELSO = 0.68, KULSO = 1.0;
const K_BELSO = 0.60, K_KULSO = 1.09;

/** A harc felé húzó árnyalás erőssége — 0 = tiszta csapatszín, 1 = tiszta vörös. */
const HARC_KEVER = 0.55;
const MEGY_KEVER = 0.22;

/** A célgyűrű lüktetésének periódusa másodpercben, és a mérete. */
const LUKTET_PERIODUS = 0.9;
const CEL_SUGAR_SZORZO = 1.5;

/** Munka-szín a lineáris hármasok előszámításához (csak konstruktorban fut). */
const _szin = new THREE.Color();

export class JelolesGyuru {
  /**
   * @param {THREE.Object3D} szinter
   * @param {import('../sim/sim.js').Sim} sim
   * @param {{sugar:number[], kijeloles:any, sajatCsapat:number}} opciok
   */
  constructor(szinter, sim, opciok) {
    this.sim = sim;
    this.kijeloles = opciok.kijeloles || null;
    this.sajatCsapat = opciok.sajatCsapat | 0;
    /**
     * A típusonkénti gyűrű-sugár. A `kijeloles3d.js` adja át, mert a
     * `tools/kiadas_ellenorzo.mjs` `TIPUS_TABLAK` listája ott őrzi a hosszát —
     * és ez a projekt már kétszer égett meg rövid `TIPUS`-táblán.
     */
    this.sugar = opciok.sugar;

    const max = sim.maxEgyseg;
    this.kontraszt = new Raj(szinter, gyuruGeo(K_BELSO, K_KULSO, KONTRASZT_SZEGMENS), max, {
      opacitas: 0.55, sorrend: 2,
    });
    this.gyuru = new Raj(szinter, gyuruGeo(BELSO, KULSO, SZEGMENS), max, {
      opacitas: 0.95, sorrend: 3,
    });
    // A célgyűrűt SAJÁT rajba tesszük, és nem a nagy gyűrű-rajba: a példány-
    // geometriája nagyobb sávú (vastagabb karika), és a példányszáma
    // nagyságrenddel kisebb — egy közös rajban a legrosszabb esethez kellene
    // méretezni, itt viszont pár tucat célpont a valóság.
    this.celGyuru = new Raj(szinter, gyuruGeo(0.72, 1.0, 16), 512, {
      opacitas: 0.9, sorrend: 4,
    });

    // ── Előszámított lineáris színek ───────────────────────────────────
    // A `Color.setHex()` három `Math.pow`-ot költ az sRGB → lineáris váltásra.
    // Példányonként hívva ez 1600 egységnél 4800 `pow` KÉPKOCKÁNKÉNT. A
    // lehetséges színek száma viszont véges és kicsi: két csapat × három
    // állapot, plusz a kontraszt és a két viszony-szín. Egyszer kiszámoljuk.
    this._csapatAllapot = new Float32Array(2 * 3 * 3);
    for (let cs = 0; cs < 2; cs++) {
      _szin.setHex(CSAPAT_SZIN[cs]);
      const br = _szin.r, bg = _szin.g, bb = _szin.b;
      _szin.setHex(VISZONY_SZIN[VISZONY.ELLENSEG]);
      const hr = _szin.r, hg = _szin.g, hb = _szin.b;
      for (let a = 0; a < 3; a++) {
        const k = a === 2 ? HARC_KEVER : (a === 1 ? MEGY_KEVER : 0);
        const o = (cs * 3 + a) * 3;
        this._csapatAllapot[o] = br + (hr - br) * k;
        this._csapatAllapot[o + 1] = bg + (hg - bg) * k;
        this._csapatAllapot[o + 2] = bb + (hb - bb) * k;
      }
    }
    this._viszony = new Float32Array(3 * 3);
    for (let v = 0; v < 3; v++) {
      _szin.setHex(v === VISZONY.SAJAT ? CSAPAT_SZIN[this.sajatCsapat & 1] : VISZONY_SZIN[v]);
      this._viszony[v * 3] = _szin.r;
      this._viszony[v * 3 + 1] = _szin.g;
      this._viszony[v * 3 + 2] = _szin.b;
    }
    _szin.setHex(KONTRASZT_SZIN);
    this._kontrasztRgb = new Float32Array([_szin.r, _szin.g, _szin.b]);

    /**
     * Célpont-bélyeg: melyik egységre tettünk már célgyűrűt EBBEN a
     * képkockában. Számláló-bélyeg, nem `fill(0)` — egy 2000 elemű tömb
     * nullázása képkockánként fölösleges memóriaforgalom.
     */
    this._belyeg = new Int32Array(sim.maxEgyseg);
    this._kepkocka = 0;
  }

  /** Újrafelállás: a bélyegek indexei már mást jelentenek. */
  ujraKot() { this._belyeg.fill(0); this._kepkocka = 0; }

  /**
   * @param {import('../sim/sim.js').Sim} sim
   * @param {import('./jeloles_kozos.js').Pillanatkep} kep
   * @param {number} ido a SIM órája másodpercben (nem `performance.now()`)
   */
  frissit(sim, kep, ido) {
    this.kontraszt.kezd();
    this.gyuru.kezd();
    this.celGyuru.kezd();

    const lista = this.kijeloles ? this.kijeloles.lista : null;
    if (lista && lista.length) this._rajzol(sim, kep, lista, ido);

    this.kontraszt.zar();
    this.gyuru.zar();
    this.celGyuru.zar();
  }

  _rajzol(sim, kep, lista, ido) {
    const e = sim.egysegek;
    const racs = sim.racs;
    const pa = sim.parancsAllapot;
    const harc = sim.harc;
    const besz = sim.beszallas;
    const sugar = this.sugar;
    const db = lista.length;
    const kellKontraszt = db <= KONTRASZT_HATAR;
    const kAllapot = this._csapatAllapot;
    const kRgb = this._kontrasztRgb;

    this._kepkocka++;
    const belyeg = this._belyeg;
    const kk = this._kepkocka;

    for (let k = 0; k < db; k++) {
      const i = lista[k];
      // ⚠️ A lista a KIJELÖLÉS modelljéé, és az csak a `rendez()` hívásakor
      // takarít. Egy időközben elesett vagy épületbe szállt egység indexe
      // ottmaradhat — a gyűrűje a semmi fölött lebegne, vagy egy már nem
      // létező slot koordinátáit olvasná.
      if (i >= e.db) continue;
      if (harc && harc.elo[i] === 0) continue;
      if (besz && besz.bent[i] === 1) continue;

      const x = kep.x(i), y = kep.y(i);
      const magas = racs.magassagPont(x, y);
      const s = sugar[e.tipus[i]];

      if (kellKontraszt) {
        this.kontraszt.helyez(x, magas + KONTRASZT_MAGASSAG, y, s);
        this.kontraszt.szinRgb(kRgb[0], kRgb[1], kRgb[2]);
      }

      const cs = e.csapat[i] & 1;
      // Az `allapot` 0..2 (ALL / MEGY / HARCOL). A `& 3` és a felső ág
      // szándékos: egy jövőbeli negyedik állapot itt nem `undefined` színt
      // adna, hanem az állót — látszik, hogy nem tudjuk, de nem NaN.
      let a = e.allapot[i];
      if (a > 2) a = 0;
      const o = (cs * 3 + a) * 3;
      this.gyuru.helyez(x, magas + MAGASSAG, y, s);
      this.gyuru.szinRgb(kAllapot[o], kAllapot[o + 1], kAllapot[o + 2]);

      // ── Célpont ────────────────────────────────────────────────────
      const cel = pa ? pa.celEgyseg[i] : -1;
      if (cel >= 0 && cel < e.db && belyeg[cel] !== kk) {
        belyeg[cel] = kk;
        if (!harc || harc.elo[cel] === 1) this._celJelol(sim, kep, cel, ido);
      }
    }
  }

  /** Egy ellenséges (vagy semleges) célpont lüktető gyűrűje. */
  _celJelol(sim, kep, cel, ido) {
    if (this.celGyuru.tele) return;
    const e = sim.egysegek;
    const x = kep.x(cel), y = kep.y(cel);
    const magas = sim.racs.magassagPont(x, y) + MAGASSAG + 0.01;
    // Fűrészfog-lüktetés: NINCS `Math.sin`. Nem determinizmus-kényszer (ez
    // render), hanem következetesség — a projekt trigonometria-mentesen
    // számol mindent, ami időfüggő, és így a görbe alakja is látszik a kódból.
    let f = (ido / LUKTET_PERIODUS) % 1;
    if (f < 0) f += 1;
    const p = f < 0.5 ? f * 2 : (1 - f) * 2;   // 0 → 1 → 0 háromszögjel
    const s = this.sugar[e.tipus[cel]] * CEL_SUGAR_SZORZO * (0.86 + 0.20 * p);

    const viszony = e.csapat[cel] === this.sajatCsapat ? VISZONY.SEMLEGES : VISZONY.ELLENSEG;
    const v = viszony * 3;
    const feny = 0.75 + 0.45 * p;
    this.celGyuru.helyez(x, magas, y, s);
    this.celGyuru.szinRgb(
      this._viszony[v] * feny, this._viszony[v + 1] * feny, this._viszony[v + 2] * feny,
    );
  }

  set enabled(v) {
    this.kontraszt.lathato = v;
    this.gyuru.lathato = v;
    this.celGyuru.lathato = v;
  }

  get haromszog() {
    return this.kontraszt.haromszog + this.gyuru.haromszog + this.celGyuru.haromszog;
  }

  bont() { this.kontraszt.bont(); this.gyuru.bont(); this.celGyuru.bont(); }
}
