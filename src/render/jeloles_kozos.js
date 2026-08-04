// AGE OF THE CRYSTALS — A JELÖLŐ-RÉTEG KÖZÖS ALAPJA.
//
// Ez a fájl nem rajzol semmit. Azt tartja egy helyen, amiből a hat jelölő-
// alréteg (`jeloles_gyuru`, `jeloles_parancs`, `jeloles_eletcsik`,
// `jeloles_kontur`, `jeloles_csoport`) épül: egy példány-raj, egy terep-követő
// szalag, a mozgás-pillanatkép, és a színek.
//
// ── MIÉRT VAN EGYÁLTALÁN „RAJ" OSZTÁLY ────────────────────────────────────
// A `kijeloles3d.js` v0.2-es változata EGY `InstancedMesh`-t kezelt, és a
// mátrix-írás nyers tömb-írás volt a `_rajzol()` törzsében. Most tizenegy ilyen
// raj van (gyűrű, kontraszt-gyűrű, célgyűrű, négy parancs-jelölő, két
// életerő-csík, körvonal-szalagok, tíz csoport-jelvény). Ha mind a tizenegy
// maga másolná ki azt a tizenhat tömb-írást, az a fajta ismétlés lenne, amiben
// a projekt már hatszor elrontott egy indexet — és a hiba NÉMA: rossz helyre
// írt mátrix nem dob kivételt, csak eltűnik vagy szemetel a képernyőn.
//
// A `Raj` ezért a MÁTRIX-ÍRÁST kapja meg, és semmi mást: nincs benne
// játéklogika, nincs benne sim-olvasás. Három írási forma van, mert pontosan
// háromféle jelölő létezik:
//   `helyez`      — vízszintes, forgatás nélküli (talajgyűrű, korong)
//   `helyezForog` — vízszintes, Y körül forgatva (irány-nyíl)
//   `helyezTabla` — a kamerára néző lap (életerő-csík, csoport-jelvény)
//
// ── MIÉRT NEM `Matrix4` / `Object3D` ──────────────────────────────────────
// Ugyanaz az ok, mint a `units3d.js`-ben: egy `Matrix4.compose()` három
// ideiglenes objektumot kér (pozíció, kvaternió, skála), és a jelölők a
// LEGROSSZABB esetben 1600 példányban mennek ki. A per-képkocka allokáció itt
// nem stílus-kérdés: a GC-szünet pont akkor jön, amikor a játékos a seregét
// mozgatja, tehát pont a legrosszabb pillanatban.
//
// ── ⚠️ AMI A LEGKÖNNYEBBEN ELROMLIK: A `count === 0` ESET ─────────────────
// Az FPS-mérés alatt a kijelölés ÜRES, és a v0.1 óta az a szerződés, hogy a
// kijelölés-réteg költsége olyankor NULLA — erre épül az összes eddigi lépcső
// összehasonlíthatósága. Egy nulla példányszámú `InstancedMesh` a rajzoláson
// már nem megy át (a three `renderInstances`-e `count === 0`-ra kilép), de a
// jelenet-bejáráson, a nyírás-tesztelésen és a rendezésen MÉG IGEN. Tizenegy
// ilyen objektum már mérhető. Ezért a `zar()` nem csak a `count`-ot állítja,
// hanem a `visible`-t is — üres rajra a réteg tényleg eltűnik a render-listából.

import { THREE } from './core3d.js';

// ── SZÍNEK ────────────────────────────────────────────────────────────────
// A csapatszín SZÁNDÉKOSAN nem azonos a `units3d.js` `CSAPAT_HEX`-ével: a
// figura tunikája árnyékolt anyag, a gyűrű viszont `MeshBasicMaterial` és
// `toneMapped: false`, tehát ugyanaz a hex sokkal sötétebbnek látszana rajta.
// Ez a sor a figura színének a VILÁGOSABB, telítettebb párja — így a gyűrű
// ránézésre ugyanahhoz a csapathoz tartozik, de kiválik a füves talajból.
export const CSAPAT_SZIN = [0x5b94ff, 0xff6a4d];

/** A viszony, amit a gyűrű színe mond. A tábla hossza = a `VISZONY` kulcsai. */
export const VISZONY = { SAJAT: 0, ELLENSEG: 1, SEMLEGES: 2 };

/**
 * Az ellenséges és a semleges jelölés NEM a csapatszínből jön.
 *
 * Ha az ellenséges célpont gyűrűje a MÁSIK csapat színét kapná, akkor két
 * kékkel játszó nép meccsén a „kit támadok" jelzés pont ugyanolyan kék lenne,
 * mint a sajátom — vagyis az egyetlen dolog veszne el, amiért a jelölés van.
 * A viszony-szín ezért fix: az ellenség mindig ez a vörös, a semleges ez a
 * borostyán, függetlenül attól, milyen színt választottak a felek.
 */
export const VISZONY_SZIN = [0x000000, 0xff3b30, 0xffc44d];

/** Sötét kontraszt-gyűrű: ettől olvasható a jelölés havon és fövenyen is. */
export const KONTRASZT_SZIN = 0x101418;

// ── PILLANATKÉP ───────────────────────────────────────────────────────────

/**
 * A JELÖLŐK MOZGÁS-PILLANATKÉPE.
 *
 * A jelölőnek PONTOSAN a figura alatt (fölött, mellett) kell lennie. A figurák
 * a `units3d.js` saját `_elozo/_most` pillanatképeiből interpolálnak a tick-ek
 * között; ha a jelölő a sim NYERS állapotát olvasná, 20 Hz-en rángana a 60+
 * Hz-en sikló figura alatt. Ez a v0.2 óta így van, csak eddig a
 * `kijeloles3d.js` törzsében ült — most hat alréteg osztozik rajta, tehát
 * kikerült ide.
 *
 * ── MIÉRT VAN „LUSTA" MÓD ────────────────────────────────────────────────
 * A v0.2-es változat MINDEN tickben végigmásolta mind az 1600 egység
 * pozícióját, akkor is, ha a kijelölés üres volt — vagyis pont az FPS-mérés
 * alatt, ahol a réteg költségének nullának kellene lennie. Két `Float32Array`
 * másolás és egy 1600-as ciklus 20 Hz-en nem sok, de nem is nulla, és a v0.1
 * lépcsőinek összehasonlíthatósága azon áll, hogy tényleg nulla.
 *
 * Ezért a `frissit()` `kell` paramétert kap: ha a rétegnek nincs mit rajzolnia,
 * a pillanatkép ELAVUL (`_ervenyes = false`), és a következő valódi kérésnél
 * ugrás nélkül, teljes újrafelvétellel indul újra. Egyetlen képkocka „nem
 * interpolál" — észrevehetetlen, cserébe a mérés tiszta marad.
 */
export class Pillanatkep {
  /** @param {number} max a legnagyobb egységszám (`sim.maxEgyseg`) */
  constructor(max) {
    this.max = max | 0;
    this.elozoX = new Float32Array(this.max);
    this.elozoY = new Float32Array(this.max);
    this.mostX = new Float32Array(this.max);
    this.mostY = new Float32Array(this.max);
    /** Az utoljára rögzített tick; -1 = nincs érvényes pillanatkép. */
    this.tick = -1;
    /** Igaz, ha EBBEN a hívásban tick-váltás történt. */
    this.ujTick = false;
    /** Az aktuális képkocka interpolációs aránya. */
    this.alfa = 0;
    this._ervenyes = false;
  }

  /** Újrafelállás: az indexek átrendeződtek, minden korábbi adat hazugság. */
  ervenytelenit() { this._ervenyes = false; this.tick = -1; this.ujTick = false; }

  /**
   * @param {import('../sim/sim.js').Sim} sim
   * @param {number} alfa [0,1]
   * @param {boolean} kell van-e egyáltalán mit rajzolni ebben a képkockában
   */
  frissit(sim, alfa, kell) {
    this.alfa = alfa;
    if (!kell) { this.ervenytelenit(); return false; }
    const e = sim.egysegek;
    const db = e.db;
    if (!this._ervenyes || sim.tick < this.tick) {
      // Első kép a szünet után, vagy visszaugrott az idő (újrafelállás,
      // betöltés): nincs mit interpolálni, a két pillanatkép azonos.
      for (let i = 0; i < db; i++) {
        const x = e.px[i], y = e.py[i];
        this.mostX[i] = x; this.mostY[i] = y;
        this.elozoX[i] = x; this.elozoY[i] = y;
      }
      this.tick = sim.tick;
      this._ervenyes = true;
      this.ujTick = true;
      return true;
    }
    if (sim.tick === this.tick) { this.ujTick = false; return true; }
    this.elozoX.set(this.mostX.subarray(0, db));
    this.elozoY.set(this.mostY.subarray(0, db));
    for (let i = 0; i < db; i++) { this.mostX[i] = e.px[i]; this.mostY[i] = e.py[i]; }
    this.tick = sim.tick;
    this.ujTick = true;
    return true;
  }

  /** Az `i` egység interpolált X-e. */
  x(i) { const a = this.elozoX[i]; return a + (this.mostX[i] - a) * this.alfa; }
  /** Az `i` egység interpolált Y-a (a sim vízszintes y-ja, a 3D z-je). */
  y(i) { const a = this.elozoY[i]; return a + (this.mostY[i] - a) * this.alfa; }
}

// ── PÉLDÁNY-RAJ ───────────────────────────────────────────────────────────

/** Munka-szín, hogy a hex → lineáris átváltás se allokáljon képkockánként. */
const _szin = new THREE.Color();

export class Raj {
  /**
   * @param {THREE.Object3D} szinter
   * @param {THREE.BufferGeometry} geo a példány-geometria (a Raj birtokolja)
   * @param {number} max a legnagyobb példányszám
   * @param {{opacitas?:number, sorrend?:number, melyseg?:boolean, kod?:boolean,
   *          terkep?:THREE.Texture}} [opciok]
   */
  constructor(szinter, geo, max, opciok = {}) {
    this.szinter = szinter;
    this.max = Math.max(1, max | 0);
    // A háromszög-szám a geometriából jön, nem kézzel megadott számból: a
    // `haromszog` getter a szonda réteg-bontásának a bemenete, és egy elgépelt
    // konstans ott csendben hamis mérést adna.
    const idx = geo.getIndex();
    this.haromszogPer = (idx ? idx.count : geo.getAttribute('position').count) / 3;

    const anyag = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: opciok.opacitas ?? 0.9,
      // A jelölő SOSEM ír mélységet: átlátszó, és egymást takaró jelölőknél a
      // mélység-írás sorrend-függő lyukakat csinálna.
      depthWrite: false,
      depthTest: opciok.melyseg !== false,
      side: THREE.DoubleSide,
      toneMapped: false,
      fog: opciok.kod !== false,
      map: opciok.terkep || null,
    });
    // ⚠️ A textúrát a hívó adja ÉS a hívó is bontja (a `Raj.bont()` nem nyúl
    // hozzá): egy atlaszon több raj is osztozik (lásd a csoport-jelvényeket),
    // és a duplán hívott `dispose()` némán fekete lapokat hagyna maga után.

    this.halo = new THREE.InstancedMesh(geo, anyag, this.max);
    this.halo.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // A jelölők a kijelölést követik, tehát bárhol lehetnek: a példányonkénti
    // nyírás úgyis kikapcsolt, a befoglaló doboz pedig értelmetlen lenne.
    this.halo.frustumCulled = false;
    this.halo.count = 0;
    this.halo.visible = false;
    this.halo.renderOrder = opciok.sorrend ?? 2;
    this.halo.matrixAutoUpdate = false;
    this.halo.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.max * 3), 3);
    this.halo.instanceColor.setUsage(THREE.DynamicDrawUsage);
    szinter.add(this.halo);

    this._m = this.halo.instanceMatrix.array;
    this._c = this.halo.instanceColor.array;
    this._n = 0;
    /** A `zar()` óta érvényes példányszám — ebből számol a `haromszog`. */
    this.db = 0;
    this._lathato = true;
  }

  /** Új képkocka: a kurzor nullázása. */
  kezd() { this._n = 0; }

  /** Elfér-e még példány? A hívók ezzel kerülik el a csendes túlcsordulást. */
  get tele() { return this._n >= this.max; }

  /**
   * Vízszintes, forgatás nélküli példány.
   * @returns {boolean} sikerült-e (hamis = betelt a raj)
   */
  helyez(x, magas, z, s) {
    if (this._n >= this.max) return false;
    const o = this._n * 16;
    const a = this._m;
    a[o] = s; a[o + 1] = 0; a[o + 2] = 0; a[o + 3] = 0;
    a[o + 4] = 0; a[o + 5] = s; a[o + 6] = 0; a[o + 7] = 0;
    a[o + 8] = 0; a[o + 9] = 0; a[o + 10] = s; a[o + 11] = 0;
    a[o + 12] = x; a[o + 13] = magas; a[o + 14] = z; a[o + 15] = 1;
    this._n++;
    return true;
  }

  /**
   * Vízszintes példány, Y-tengely körül forgatva. A szöget KÉSZEN kapja
   * (`cos`, `sin`) — a hívó egy csoportra egyszer számolja ki, nem
   * példányonként, és így ez a fájl `Math.cos`-mentes marad.
   */
  helyezForog(x, magas, z, s, cos, sin) {
    if (this._n >= this.max) return false;
    const o = this._n * 16;
    const a = this._m;
    a[o] = cos * s; a[o + 1] = 0; a[o + 2] = -sin * s; a[o + 3] = 0;
    a[o + 4] = 0; a[o + 5] = s; a[o + 6] = 0; a[o + 7] = 0;
    a[o + 8] = sin * s; a[o + 9] = 0; a[o + 10] = cos * s; a[o + 11] = 0;
    a[o + 12] = x; a[o + 13] = magas; a[o + 14] = z; a[o + 15] = 1;
    this._n++;
    return true;
  }

  /**
   * KAMERÁRA NÉZŐ LAP. A geometria XY-síkban van; az X tengelye a kamera
   * JOBB, az Y tengelye a kamera FEL iránya lesz.
   *
   * ⚠️ A bázist a hívó adja, mert a kamera-mátrixot képkockánként EGYSZER kell
   * kiolvasni, nem példányonként. Egy 1600 elemű csíksorra a különbség 1600
   * mátrix-olvasás — pont az a fajta költség, ami észrevétlenül nő bele.
   */
  helyezTabla(x, magas, z, sx, sy, b) {
    if (this._n >= this.max) return false;
    const o = this._n * 16;
    const a = this._m;
    a[o] = b[0] * sx; a[o + 1] = b[1] * sx; a[o + 2] = b[2] * sx; a[o + 3] = 0;
    a[o + 4] = b[3] * sy; a[o + 5] = b[4] * sy; a[o + 6] = b[5] * sy; a[o + 7] = 0;
    a[o + 8] = b[6]; a[o + 9] = b[7]; a[o + 10] = b[8]; a[o + 11] = 0;
    a[o + 12] = x; a[o + 13] = magas; a[o + 14] = z; a[o + 15] = 1;
    this._n++;
    return true;
  }

  /** Az UTOLJÁRA lehelyezett példány színe, hex-ből. */
  szinHex(hex, fenyero) {
    if (this._n === 0) return;
    _szin.setHex(hex);
    const c = (this._n - 1) * 3;
    const f = fenyero === undefined ? 1 : fenyero;
    this._c[c] = _szin.r * f; this._c[c + 1] = _szin.g * f; this._c[c + 2] = _szin.b * f;
  }

  /** Az utoljára lehelyezett példány színe, kész lineáris hármasból. */
  szinRgb(r, g, b) {
    if (this._n === 0) return;
    const c = (this._n - 1) * 3;
    this._c[c] = r; this._c[c + 1] = g; this._c[c + 2] = b;
  }

  /** Képkocka vége: a példányszám és a láthatóság rögzítése. */
  zar() {
    const n = this._n;
    this.db = n;
    this.halo.count = n;
    // Lásd a fejléc `count === 0` blokkját: az üres rajnak a jelenet-bejárásból
    // is ki kell esnie, nem csak a rajzolásból.
    const l = n > 0 && this._lathato;
    if (this.halo.visible !== l) this.halo.visible = l;
    if (n > 0) {
      this.halo.instanceMatrix.needsUpdate = true;
      this.halo.instanceColor.needsUpdate = true;
    }
  }

  /** A réteg-kapcsoló. Nem nullázza a példányokat, csak elrejt. */
  set lathato(v) {
    this._lathato = !!v;
    const l = this._lathato && this.db > 0;
    if (this.halo.visible !== l) this.halo.visible = l;
  }
  get lathato() { return this._lathato; }

  get haromszog() { return (this._lathato && this.db > 0) ? this.db * this.haromszogPer : 0; }

  bont() {
    this.szinter.remove(this.halo);
    this.halo.geometry.dispose();
    this.halo.material.dispose();
    this.halo.dispose();
  }
}

// ── TEREP-KÖVETŐ SZALAG ───────────────────────────────────────────────────

/**
 * VÍZSZINTES SZALAG EGY TÖRTVONAL MENTÉN.
 *
 * A keret-húzás és az épület-alapterület körvonalát nem lehet `THREE.Line`-nal
 * megoldani: a WebGL vonalvastagsága a legtöbb megvalósításban 1 képpont
 * (a `linewidth` némán hatástalan), tehát a körvonal kizoomolva eltűnne, és
 * pont akkor nem látszana, amikor a legnagyobb keretet húzzuk.
 *
 * Ezért a körvonal HÁROMSZÖGEKBŐL van: minden szakaszra egy vízszintes
 * négyszög, a szakasz irányára merőlegesen `vastag` szélességben. A magasságot
 * a hívó adja pontonként (a terep magasságmezőjéből), így a szalag rásimul a
 * domboldalra, nem lebeg fölötte és nem tűnik el benne.
 *
 * ⚠️ A vertex-puffer ELŐRE lefoglalt és FIX. A `pont()` csak ír bele; ha
 * elfogyna, csendben elnyeli a további pontokat — a geometria újrafoglalása
 * képkockánként pont az az allokáció, amit a réteg tilt.
 */
export class Szalag {
  /**
   * @param {THREE.Object3D} szinter
   * @param {number} maxSzakasz
   * @param {{szin?:number, opacitas?:number, sorrend?:number}} [opciok]
   */
  constructor(szinter, maxSzakasz, opciok = {}) {
    this.szinter = szinter;
    this.maxSzakasz = Math.max(1, maxSzakasz | 0);
    const csucs = this.maxSzakasz * 4;

    this.pozicio = new Float32Array(csucs * 3);
    const index = new Uint16Array(this.maxSzakasz * 6);
    for (let s = 0; s < this.maxSzakasz; s++) {
      const v = s * 4, o = s * 6;
      index[o] = v; index[o + 1] = v + 1; index[o + 2] = v + 2;
      index[o + 3] = v; index[o + 4] = v + 2; index[o + 5] = v + 3;
    }
    const geo = new THREE.BufferGeometry();
    this._attr = new THREE.BufferAttribute(this.pozicio, 3);
    this._attr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this._attr);
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    geo.setDrawRange(0, 0);

    const anyag = new THREE.MeshBasicMaterial({
      color: opciok.szin ?? 0xffffff,
      transparent: true,
      opacity: opciok.opacitas ?? 0.85,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.halo = new THREE.Mesh(geo, anyag);
    this.halo.frustumCulled = false;
    this.halo.matrixAutoUpdate = false;
    this.halo.renderOrder = opciok.sorrend ?? 3;
    this.halo.visible = false;
    szinter.add(this.halo);

    this._n = 0;           // kész szakaszok
    this._vanElozo = false;
    this._ex = 0; this._ey = 0; this._ez = 0;
    this._felVastag = 0.09;
    this._lathato = true;
    this.db = 0;
  }

  /** Új törtvonal. A `vastag` világegységben értendő. */
  kezd(vastag) {
    this._n = 0;
    this._vanElozo = false;
    this._felVastag = (vastag ?? 0.18) * 0.5;
  }

  /** Új törtvonal ugyanabban a képkockában (pl. a következő épület kerete). */
  szakit() { this._vanElozo = false; }

  /** A törtvonal következő pontja (világkoordinátában, magassággal). */
  pont(x, magas, z) {
    if (!this._vanElozo) {
      this._ex = x; this._ey = magas; this._ez = z;
      this._vanElozo = true;
      return;
    }
    if (this._n < this.maxSzakasz) {
      const dx = x - this._ex, dz = z - this._ez;
      const h = Math.sqrt(dx * dx + dz * dz);
      if (h > 1e-6) {
        const w = this._felVastag / h;
        // A szakasz irányára merőleges vízszintes eltolás.
        const nx = -dz * w, nz = dx * w;
        const p = this.pozicio;
        const o = this._n * 12;
        p[o] = this._ex + nx; p[o + 1] = this._ey; p[o + 2] = this._ez + nz;
        p[o + 3] = this._ex - nx; p[o + 4] = this._ey; p[o + 5] = this._ez - nz;
        p[o + 6] = x - nx; p[o + 7] = magas; p[o + 8] = z - nz;
        p[o + 9] = x + nx; p[o + 10] = magas; p[o + 11] = z + nz;
        this._n++;
      }
    }
    this._ex = x; this._ey = magas; this._ez = z;
  }

  zar() {
    this.db = this._n;
    this.halo.geometry.setDrawRange(0, this._n * 6);
    const l = this._n > 0 && this._lathato;
    if (this.halo.visible !== l) this.halo.visible = l;
    if (this._n > 0) this._attr.needsUpdate = true;
  }

  set lathato(v) {
    this._lathato = !!v;
    const l = this._lathato && this.db > 0;
    if (this.halo.visible !== l) this.halo.visible = l;
  }
  get lathato() { return this._lathato; }

  get haromszog() { return (this._lathato && this.db > 0) ? this.db * 2 : 0; }

  bont() {
    this.szinter.remove(this.halo);
    this.halo.geometry.dispose();
    this.halo.material.dispose();
  }
}

// ── GEOMETRIÁK ────────────────────────────────────────────────────────────
//
// Mind VÍZSZINTES (XZ-sík) vagy TÁBLA (XY-sík), egységnyi méretben: a valódi
// méret a példány-mátrix skálájából jön. A forgatást EGYSZER, itt végezzük el,
// nem példányonként — így a példány-mátrix tiszta eltolás + skála marad, és
// nyers tömb-írással tölthető.

/** Vízszintes gyűrű, egységsugárral (a `kulso` a külső sugár aránya). */
export function gyuruGeo(belso, kulso, szegmens) {
  const g = new THREE.RingGeometry(belso, kulso, szegmens);
  g.rotateX(-Math.PI / 2);
  return g;
}

/** Vízszintes, tömör korong. */
export function korongGeo(szegmens) {
  const g = new THREE.CircleGeometry(1, szegmens);
  g.rotateX(-Math.PI / 2);
  return g;
}

/**
 * Kamerára néző lap. `balrol = true` esetén a bal élénél van az origó — ez
 * kell az életerő-csík TÖLTÉSÉHEZ, hogy balról fogyjon és ne középről.
 */
export function tablaGeo(balrol) {
  const g = new THREE.PlaneGeometry(1, 1);
  if (balrol) g.translate(0.5, 0, 0);
  return g;
}

/**
 * Kamerára néző lap egy ATLASZ egy cellájával. A textúra-koordináta x-e a
 * `[u0, u1]` sávra van szűkítve — így tíz geometria OSZTOZIK egy textúrán és
 * egy anyagon, és a tíz csoport-jelvény nem tíz textúra-váltás.
 */
export function tablaGeoUv(u0, u1) {
  const g = new THREE.PlaneGeometry(1, 1);
  const uv = g.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) {
    uv.setX(i, u0 + uv.getX(i) * (u1 - u0));
  }
  uv.needsUpdate = true;
  return g;
}

/**
 * Tetszőleges vízszintes háromszöglista `[x,z, x,z, …]` hármasokból.
 * A jelölő-alakzatokat ezzel írjuk le, mert `ExtrudeGeometry`/`ShapeGeometry`
 * behozná a teljes háromszögelőt egy tizenkét háromszögnyi alakzatért.
 */
export function lapGeo(csucsok) {
  const db = csucsok.length / 2;
  const poz = new Float32Array(db * 3);
  for (let i = 0; i < db; i++) {
    poz[i * 3] = csucsok[i * 2];
    poz[i * 3 + 1] = 0;
    poz[i * 3 + 2] = csucsok[i * 2 + 1];
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(poz, 3));
  return g;
}

/**
 * NÉGY BEFELÉ MUTATÓ ÉK — a menetparancs jelölője.
 *
 * Miért ez az alak, és nem egy karika: a karika a talajgyűrűvel téveszthető
 * össze, márpedig a kettő ELLENTÉTES dolgot mond (az egyik: „ez ki van
 * jelölve", a másik: „ide megy"). A befelé mutató ékek iránya önmagában
 * elmondja, hogy egy CÉLPONTRÓL van szó.
 */
export function ekGeo() {
  const cs = [];
  // Egy ék: nyílhegy-alak, kívülről befelé mutatva. Négy csúcsa
  //   bal váll (-0.45, 1.05) · hegy (0, 0.55) · jobb váll (0.45, 1.05) ·
  //   belső horony (0, 0.85)
  // — ettől nem tömör háromszög, hanem felismerhetően NYÍL.
  // Négyszer, 90 fokonként elforgatva; a forgatást kézzel írjuk ki, mert a
  // 90 fok koszinusza/szinusza úgyis egész.
  const ek = [
    -0.45, 1.05, 0.00, 0.55, 0.00, 0.85,
    0.00, 0.55, 0.45, 1.05, 0.00, 0.85,
  ];
  for (let f = 0; f < 4; f++) {
    // (x, z) elforgatva f * 90 fokkal: (x,z) → (z,-x) → (-x,-z) → (-z,x)
    for (let i = 0; i < ek.length; i += 2) {
      const x = ek[i], z = ek[i + 1];
      if (f === 0) cs.push(x, z);
      else if (f === 1) cs.push(z, -x);
      else if (f === 2) cs.push(-x, -z);
      else cs.push(-z, x);
    }
  }
  return lapGeo(cs);
}

/**
 * KERESZT — a támadó menet jelölője. Az X alak a műfajban évtizedek óta
 * „támadás", és a menet-ékkel a periférián sem téveszthető össze.
 */
export function keresztGeo() {
  const v = 0.20, h = 1.0;
  const cs = [];
  const kar = (ax, az, bx, bz) => {
    // Az (ax,az)-(bx,bz) szakaszra írt vastag négyszög, két háromszöggel.
    const dx = bx - ax, dz = bz - az;
    const l = Math.sqrt(dx * dx + dz * dz);
    const nx = -dz / l * v, nz = dx / l * v;
    cs.push(ax + nx, az + nz, ax - nx, az - nz, bx - nx, bz - nz);
    cs.push(ax + nx, az + nz, bx - nx, bz - nz, bx + nx, bz + nz);
  };
  kar(-h, -h, h, h);
  kar(-h, h, h, -h);
  return lapGeo(cs);
}

/**
 * ROMBUSZ-KERET — a gyűjtés jelölője. Nem tömör: a lelőhely ALATTA marad
 * látható, és a játékos látja, melyik fát/követ jelölte ki.
 */
export function rombuszGeo() {
  const k = 1.0, b = 0.66;
  const cs = [];
  const oldal = (ax, az, bx, bz) => {
    const sx = ax * b / k, sz = az * b / k;
    const tx = bx * b / k, tz = bz * b / k;
    cs.push(ax, az, bx, bz, tx, tz);
    cs.push(ax, az, tx, tz, sx, sz);
  };
  oldal(0, k, k, 0);
  oldal(k, 0, 0, -k);
  oldal(0, -k, -k, 0);
  oldal(-k, 0, 0, k);
  return lapGeo(cs);
}

/**
 * NÉGYZET-KERET — a megállás/tartás jelölője, és a csoport-jelvény háttere.
 * A `b` a belső kivágás aránya.
 */
export function keretGeo(b) {
  const k = 1.0;
  const cs = [];
  const oldal = (ax, az, bx, bz, cx, cz, dx, dz) => {
    cs.push(ax, az, bx, bz, cx, cz);
    cs.push(ax, az, cx, cz, dx, dz);
  };
  oldal(-k, k, k, k, b, b, -b, b);       // felső
  oldal(k, k, k, -k, b, -b, b, b);       // jobb
  oldal(k, -k, -k, -k, -b, -b, b, -b);   // alsó
  oldal(-k, -k, -k, k, -b, b, -b, -b);   // bal
  return lapGeo(cs);
}

// ── KAMERA-BÁZIS ──────────────────────────────────────────────────────────

/**
 * A kamera JOBB / FEL / ELŐRE bázisa egy kilenc elemű pufferbe, a
 * `Raj.helyezTabla` sorrendjében. Képkockánként EGYSZER kell hívni.
 *
 * @param {THREE.Camera|null} kamera
 * @param {Float32Array} ki 9 elemű puffer
 * @returns {Float32Array} ugyanaz a puffer (kamera nélkül: tengelyre állított)
 */
export function kameraBazis(kamera, ki) {
  if (!kamera) {
    ki[0] = 1; ki[1] = 0; ki[2] = 0;
    ki[3] = 0; ki[4] = 1; ki[5] = 0;
    ki[6] = 0; ki[7] = 0; ki[8] = 1;
    return ki;
  }
  const m = kamera.matrixWorld.elements;
  ki[0] = m[0]; ki[1] = m[1]; ki[2] = m[2];
  ki[3] = m[4]; ki[4] = m[5]; ki[5] = m[6];
  ki[6] = m[8]; ki[7] = m[9]; ki[8] = m[10];
  return ki;
}
