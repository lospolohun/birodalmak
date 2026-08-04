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
//
// ── A SZILÁRD RÉSZECSKÉT EL KELL TEMETNI (v0.17) ──────────────────────────
// Az `IZZO` és a `LAGY` csoport a burkológörbe ALFÁJÁN hal el. A `SZILARD`
// csoportnak nincs alfája — átlátszatlan `MeshLambertMaterial` doboz, lásd az
// `effekt_harc.js` `szilardAnyag`-ját, ahova az `aAlfa` attribútum nem is megy
// ki. Vagyis amikor egy törmelék vagy egy rom élettartama lejár, az EGYETLEN
// képkocka alatt, TELJES fényerővel pattan ki a képből.
//
// Ezért a szilárd részecske nem „elhalványul", hanem a föld alá megy — a terep
// átlátszatlan, a takarás ingyen van:
//
//   ROM       a `rom()` a süllyedés-sebességet SZÁMOLJA a saját magasságából,
//   TORMELEK  a `lep()` az utolsó `ELNYELES_IDO` másodpercben elnyeli.
//
// Mérve, a régi `-meret * 0.30 / elet` képlettel (a rom teteje a talaj FÖLÖTT,
// abban a pillanatban, amikor a rekesz felszabadul):
//
//   központ/laktanya/…  +0,764 egység        torony  +1,279 egység
//   raktár/ház          +0,509 egység        fal     +0,186 egység
//
// Egy 3 cellás központnál a régi süllyedés 0,738 volt, a szükséges 1,748 —
// tehát a rom a kellő mélység 42 %-áig jutott, a toronynál 25 %-áig. EZ a
// hibajelentés „nem süllyed elég mélyre" tétele.
//
// A TÖRMELÉK ennél is rosszabbul állt: nem süllyedt SEMENNYIT. Lefeküdt a
// `talaj + 0,04` szintre, és onnan tűnt el. 200 sorsolt szilánkon mérve,
// mindhárom kilövési esetben (épület-omlás, épület-találat, ostromkő) 200/200
// a talaj FÖLÖTT pattant ki, 0,09 és 0,29 egység közötti magasságban.
//
// ── A SZÍNTÉR: A SZILÁRD RECEPTEK sRGB-BEN BESZÉLNEK (v0.17) ──────────────
// A `three` az `instanceColor`-t a MUNKA-TÉRBEN, tehát LINEÁRISAN szorozza a
// diffúz színbe (`color_vertex.glsl`: `vColor.xyz *= instanceColor.xyz`) —
// konverzió nincs sehol. Amit ide beírunk, az lineáris marad.
//
// A SZILÁRD csoport viszont ALBEDÓ-t kap: ugyanaz a Lambert-fényút világítja
// meg, mint az épületet (`gazdasag3d.js` szintén `MeshLambertMaterial` +
// `toneMapped:false`) és a terepet. Az albedó ebben a projektben MINDENHOL
// sRGB-ből konvertálva megy be — `epulet_reszek.js` → `setHex(hex,
// THREE.SRGBColorSpace)`, `terep_paletta.js` → `hexLin()`. A v0.16-os receptek
// ezt kihagyták, tehát a „0,46-os középszürke kő" nem 0,46 sRGB-ként, hanem
// 0,46 LINEÁRISKÉNT ment ki. Mérve a `fenyek_ciklus.lambertKimenet()`-tel,
// 8:30-kor (ez a `tools/kep.mjs` ideje), felfelé néző lapon:
//
//   rom, RÉGI (0,46 lineáris)     képernyőn (138, 140, 133)
//   rom, ÚJ   (0,46 sRGB)         képernyőn ( 89,  90,  79)
//   ép kőfal  SZIN.KO #8b9199     képernyőn (106, 111, 119)
//   száraz fű #8b9c68             képernyőn (106, 120,  80)
//   kavics    #7d7a72             képernyőn ( 95,  93,  88)
//
// A ROM tehát VILÁGOSABB volt, mint az ép fal, amiből lett, és világosabb, mint
// a fű, amire ráomlott. EZ a „túl világos" tétel.
//
// ⚠️ A LAPOK (izzó, lágy) színe SZÁNDÉKOSAN marad lineáris, és ez nem
// feledékenység: az additív villanás FÉNY-hozzájárulás, az alfás por pedig
// `MeshBasicMaterial`-lal megy ki, tehát közvetlen képernyő-érték — egyik sem
// albedó, egyikre sem hat fény. Aki mégis hozzájuk nyúl, annak ezt kell tudnia:
// a `fustGomb()` kommentje „sötét"-et mond, a mai 0,20…0,36 lineáris viszont a
// képernyőn 124…162, a `nyom()` „sötét foltja" (0,16…0,24) pedig 111…134 —
// mindkettő VILÁGOSABB a terepnél. Ugyanaz a félreértés, de NEM a törmelék, és
// a hívási helyek (`effekt_esemeny.js`) hangolásával együtt kell eldönteni.

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
 * Ennyi ideig tart a törmelék ELNYELŐDÉSE az élettartama végén (mp).
 *
 * Nem szépészet: a szilárd csoportnak nincs alfája (lásd a fejlécet), tehát ez
 * az egyetlen mód, amivel egy kőszilánk el tud tűnni pattanás nélkül. A
 * legrövidebb törmelék-élettartam 0,9 mp, tehát ez bőven belefér — és a
 * `lep()` sebesség-képlete önjavító, vagyis egy még repülő szilánkot is
 * egyenletesen visz le, nem ugrat.
 */
const ELNYELES_IDO = 0.40;

/**
 * sRGB [0..1] → lineáris. Ugyanaz a képlet, amit a `THREE.Color.setHex(hex,
 * SRGBColorSpace)` és a `terep_paletta.szrgbLin()` használ — csak `three`
 * nélkül, mert ez a fájl szándékosan nem ismeri a `three`-t.
 *
 * CSAK a szilárd (megvilágított) receptek hívják; a miértje a fejlécben.
 */
function szrgbLin(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Az ostromkő színe. Modul-betöltéskor váltjuk át, nem kövenként. */
const KO_R = szrgbLin(0.40), KO_G = szrgbLin(0.36), KO_B = szrgbLin(0.31);

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

  /**
   * Kő- és fatörmelék, ballisztikusan szét.
   *
   * ⚠️ A szín sRGB-ben értendő (fejléc). Az alapérték 0,36/0,32/0,28 mint
   * LINEÁRIS albedó a képernyőn (123, 118, 112)-t adott — világosabb kavicsot,
   * mint maga a kavics-terep (95, 93, 88). sRGB-ként olvasva (69, 61, 54):
   * sötét kő- és faszilánk, ami elüt attól, amire ráhullott.
   */
  tormelekek(db, x, y, z, ero, meret, talaj, r = 0.36, g = 0.32, b = 0.28) {
    const lr = szrgbLin(r), lg = szrgbLin(g), lb = szrgbLin(b);
    let n = 0;
    for (let k = 0; k < db; k++) {
      // EGY sorsolás a kezdő- ÉS a végméretre: a kőszilánk merev test, nem
      // lélegzik. Régen a két méret külön sorsolt ugyanabból a képletből, tehát
      // egy szilánk az élete alatt akár 0,43-szorosára zsugorodott vagy
      // 2,3-szeresére nőtt — és az elnyelődés sem tudná, mekkora testet kell
      // eltemetnie (a `lep()` a `meret0`-ból számol).
      const m = meret * (0.6 + this._v() * 0.8);
      const i = this.szul(EFAJTA.TORMELEK, x, y, z,
        this._sz(ero), this._v() * ero + ero * 0.35, this._sz(ero),
        0.9 + this._v() * 0.8,
        m, m, lr, lg, lb, 1.0, talaj);
      if (i < 0) break;
      n++;
    }
    return n;
  }

  /**
   * Az összeomló épület MARADVÁNYA: egy süllyedő, zsugorodó test az épület
   * helyén. Ez az, amitől az épület nem PATTANVA tűnik el — a `gazdasag3d.js`
   * a pusztulás pillanatában leveszi a példányt, ez pedig átveszi a helyét.
   *
   * ⚠️ A SÜLLYEDÉS MÉRTÉKE SZÁMÍTOTT, NEM ÍZLÉS. A rom akkor tűnik el
   * észrevétlenül, ha az élettartama végére a doboz TETEJE a talaj alatt van —
   * különben pont az a pattanás jön vissza, ami ellen az egész recept szól
   * (a szilárd csoportnak nincs alfája, lásd a fejlécet). A régi
   * `-meret * 0.30 / elet` ezt nem az induló magasságból számolta, hanem a
   * méretből, ezért a magas épületeknél messze alulmaradt: a központ 0,738-at
   * süllyedt 1,748 helyett, a torony 0,492-t 1,935 helyett.
   *
   * @param {number} y a rom KÖZEPE (világ y), a hívó az épület fél-magasságát adja
   * @param {number} r sRGB [0..1] — a szilárd receptek színtere, lásd a fejlécet
   * @param {number} talaj a terep magassága a rom alatt
   */
  rom(x, y, z, meret, elet, r, g, b, talaj) {
    const vegMeret = meret * 0.55;
    // Kezdő emelkedés + a végméret fele = ennyivel van a doboz teteje a talaj
    // fölött a lejáratkor, ha nem süllyedne. A ráhagyás (méret 10 %-a) a
    // lejtőnek szól: a `talaj` a rom KÖZEPE alatti magasság, a doboz sarka
    // ennél magasabb terepre is eshet.
    const sullyed = (y - talaj) + vegMeret * 0.5 + meret * 0.10;
    const i = this.szul(EFAJTA.ROM, x, y, z, 0, -sullyed / elet, 0,
      elet, meret, vegMeret,
      szrgbLin(r), szrgbLin(g), szrgbLin(b), 1.0, talaj);
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
    // A szín sRGB-ből váltva (`KO_*`), különben a repülő kő VILÁGOSABB lenne,
    // mint a törmelék, amit a becsapódásakor maga után hagy.
    const i = this.szul(EFAJTA.KO, x, y, z, vx, vy, vz, ido,
      0.42, 0.42, KO_R, KO_G, KO_B, 1.0, cy);
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

      // ── ELNYELŐDÉS ────────────────────────────────────────────────────────
      // A törmelék az utolsó `ELNYELES_IDO` másodpercben a talaj alá csúszik.
      // Ez nem dísz: a szilárd csoportnak nincs alfája, tehát máskülönben
      // teljes fényerővel, egyetlen képkocka alatt pattanna ki a képből.
      //
      // A sebesség a HÁTRALÉVŐ időből jön, ezért ÖNJAVÍTÓ: `v = (cél − y) / el`
      // mellett `y − cél` az `el`-lel arányosan fogy, vagyis a szilánk
      // EGYENLETESEN ér a cél-mélységbe pontosan a lejáratkor — akkor is, ha
      // épp a levegőben volt, amikor az elnyelődés elkezdődött. Egy fix
      // sebesség ilyenkor a föld fölött hagyná, egy egyszeri „tedd le" pedig
      // ugratná.
      //
      // A cél-mélység a doboz fél-magasságánál (`meret0 * 0.5`) mélyebb: az
      // Y körüli forgás a függőleges kiterjedést nem változtatja, tehát a
      // 0,62-es szorzó a TETEJÉT is a terep alá viszi. A fix 0,20 azért van
      // ráadásul, mert a `talaj` a KELETKEZÉS pontján mért magasság, a szilánk
      // viszont több egységet is elrepülhet — lejtőn a valódi terep ennyivel
      // a feltételezett szint fölé kerülhet.
      const elnyel = f === EFAJTA.TORMELEK && el < ELNYELES_IDO;
      if (elnyel) {
        const cel = this.talaj[i] - this.meret0[i] * 0.62 - 0.20;
        this.vx[i] = 0; this.vz[i] = 0;
        this.vy[i] = (cel - this.y[i]) / el;
      } else if (GRAVITALIS[f]) this.vy[i] -= G * dt;

      const nx = this.x[i] + this.vx[i] * dt;
      const ny = this.y[i] + this.vy[i] * dt;
      const nz = this.z[i] + this.vz[i] * dt;
      this.x[i] = nx; this.z[i] = nz;

      // Az elnyelődő szilánk NEM tapad a talajhoz — különben a clamp azonnal
      // visszatolná arra a szintre, ahonnan épp el akar tűnni.
      if (!elnyel && TALAJRA_ESIK[f] && ny <= this.talaj[i] + 0.04) {
        // Földet ért: kis visszapattanás, majd elfekszik. A törmelék így nem
        // tűnik el a levegőben, és a terepen fekve várja meg az elnyelődését
        // (azt a fenti ág intézi — CSAK az viheti a talaj alá).
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
