// AGE OF THE CRYSTALS — HARCI ESEMÉNY-FIGYELŐ: a simből látvány-eseményt csinál.
//
// SZERZŐDÉS: ez a fájl CSAK OLVAS. Nincs benne `three`, nincs DOM, és — ami a
// legfontosabb — soha, semmilyen ágon nem ír sim-állapotot. Az effektek
// render-oldali állapotok; ha a render visszaírna, a v0.8 lockstepjében a két
// kliens képernyője eltérne attól, amit a szimuláció mond.
//
// ── A PROBLÉMA: A SIMBEN NINCS ESEMÉNY-LISTA ──────────────────────────────
// A `sim` nem küld „nyíl becsapódott" üzenetet, és nem is fog: egy eseménysor
// kihatna a `allapotHash()`-re, vagy — ami rosszabb — csendben nem hatna ki, és
// gépenként más sorrendben állna elő. Ezért a látvány-események a sim ÁLLAPOT-
// KÜLÖNBSÉGÉBŐL derülnek ki, tickenként egyszer. Ugyanaz a módszer, amit a
// `src/audio/hang.js` használ a halmozott számlálókra, csak itt POZÍCIÓ is kell,
// nem elég a darabszám — ezért kell pillanatkép, nem elég egy számláló.
//
// ⚠️ A MEZŐNEVEKET A `src/sim/sim.js`-BŐL ELLENŐRIZTEM, NEM EMLÉKEZETBŐL.
// Ebben a projektben a hang-réteg egyszer `sim.lovedek`-et kérdezett
// `sim.lovedekek` helyett, és két hang ÖRÖKRE néma lett volna — hibaüzenet
// nélkül, mert `undefined?.db` sosem nő. A használt mezők, névre pontosan:
//   `sim.lovedekek` {db, x, y, cel, elet, csapat}   ← TÖBBES SZÁM
//   `sim.harc`      {elo, utemHatra}
//   `sim.epuletek`  {db, x, y, hp, elo, tipus, csapat}
//   `sim.egysegek`  {db, px, py, szog, tipus, generacio, allapot}
//   `sim.parancsAllapot` {celEgyseg, celEpulet}
//
// ── HOGYAN ISMERÜNK FEL EGY BECSAPÓDÁST? ──────────────────────────────────
// A `sim/lovedek.js` SWAP-REMOVE-val tömörít: a befejezett lövedék helyére
// beugrik az utolsó. Az index tehát NEM azonosító, két tick között bármelyik
// rekesz mást jelenthet — pozíció-alapú összevetés itt hamis becsapódásokat
// szülne minden ticken.
//
// Amit viszont a lövedék magával visz: a CÉLPONT indexe és az `elet`
// visszaszámlálója, amit a `lep()` tickenként pontosan eggyel csökkent. Ebből
// stabil kulcs képezhető:
//
//      kulcs = cel * 128 + elet          (az `elet` 1..80, tehát 7 biten elfér)
//
// Egy tickkel később ugyanannak a lövedéknek a kulcsa `cel * 128 + (elet - 1)`.
// Így az előző pillanatkép és a mostani állapot PÁROSÍTHATÓ, előre foglalt
// nyílt címzésű hasítótáblával, O(n)-ben:
//
//   · előző elem, amihez van mostani pár  → repül tovább
//   · előző elem, amihez NINCS pár        → BECSAPÓDOTT (vagy elenyészett)
//   · mostani elem, amihez nincs előző    → most LŐTTÉK KI
//
// Ez pontos, és nem függ a `MAX_ELET` konstanstól (amit a `lovedek.js` nem is
// exportál). A ritka ütközés — két íjász ugyanabban a tickben ugyanarra a
// célra lő — legfeljebb annyit jelent, hogy a két becsapódás-villanás közül az
// egyik a másik helyén jelenik meg; a repülés végén amúgy is egymás mellett
// vannak.
//
// ── HOGYAN ISMERÜNK FEL EGY KÖZELHARCI CSAPÁST? ───────────────────────────
// A `harc.lep()` minden élő egységnél CSÖKKENTI az `utemHatra`-t, és csak az üt,
// akinél elérte a nullát — ilyenkor visszaáll a típus ütemére. Vagyis
// `utemHatra` egyetlen esetben NŐ két tick között: ha az egység ÜTÖTT.
// Egyetlen `Int16Array` pillanatkép, nulla félreértés.
//
// ⚠️ A `szuletik()` szintén felállítja az ütem-számlálót (`i % utem`). Ezért a
// felismerés feltétele, hogy az egység az ELŐZŐ tickben is élt ÉS ugyanaz a
// generáció volt — különben minden frissen kiképzett katona csapás-villanást
// kapna a laktanya ajtajában.
//
// ── AMI SZÁNDÉKOSAN NEM PONTOS ────────────────────────────────────────────
// Ha egy képkocka alatt TÖBB tick futott le (akadás vagy háttérbe tett fül),
// nem próbáljuk visszamenőleg kibogozni az eseményeket: csak újra-pillanatképet
// veszünk. Enélkül a `elet`-kulcsok elcsúsznának, és MINDEN repülő nyíl
// becsapódásnak látszana — egy pillanatnyi akadásból látványrobbanás lenne.

import { TIPUS, ALLAPOT } from '../sim/units.js';
import { EPULET, EP_MERET, EP_MAGASSAG } from '../sim/epuletek.js';

/** Csapat-színek a szikrákhoz — a `ostrom3d.js` palettájával egyeznek. */
const CSAPAT_R = [0.36, 0.72];
const CSAPAT_G = [0.55, 0.36];
const CSAPAT_B = [0.95, 0.30];

/**
 * Távolság-küszöbök VILÁGEGYSÉG-NÉGYZETBEN, a kamera céljától mérve.
 *
 * Nem szépészet: nagy csatában a mellékes effektek (csapás-villanás, halál-por)
 * teszik ki a keletkezés túlnyomó részét, és a képernyő túlsó szélén egy
 * képpontnyi felvillanást senki nem lát — a kitöltési költséget viszont
 * megfizetnénk. A NAGY események (épület-omlás, ostrom-becsapódás) SOSEM
 * ritkulnak: azok játék-információt hordoznak.
 */
const TAV2_APRO = 105 * 105;
const TAV2_HALAL = 150 * 150;

/**
 * Efölött a készlet-kihasználtság fölött a mellékes effektek elmaradnak.
 * A készlet így a NAGY eseményeknek marad — egy összeomló központ akkor is
 * látszik, ha közben nyolcszáz katona csépeli egymást.
 */
const TELI_KUSZOB = 0.72;

/** A hasítótábla mérete (2 hatvány). A lövedék-tár ennél sosem nagyobb. */
const HASH = 8192;
const HASH_MASZK = HASH - 1;

export class EffektFigyelo {
  /**
   * @param {import('../sim/sim.js').Sim} sim
   */
  constructor(sim) {
    const maxE = sim.maxEgyseg | 0;
    const maxL = sim.lovedekek.maxDb | 0;
    const maxEp = sim.epuletek.maxDb | 0;

    // ── LÖVEDÉK-PILLANATKÉP ──────────────────────────────────────────────
    this._lDb = 0;
    this._lX = new Float32Array(maxL);
    this._lY = new Float32Array(maxL);
    this._lCel = new Int32Array(maxL);
    this._lElet = new Int32Array(maxL);
    this._lCsapat = new Uint8Array(maxL);

    // ── HASÍTÓTÁBLA (nyílt címzés, előre foglalva) ───────────────────────
    this._hKulcs = new Int32Array(HASH).fill(-1);
    this._hDb = new Int32Array(HASH);
    this._hMinta = new Int32Array(HASH);
    this._hHasznalt = new Int32Array(HASH);
    this._hHasznaltDb = 0;

    // ── EGYSÉG-PILLANATKÉP ───────────────────────────────────────────────
    this._utem = new Int16Array(maxE);
    this._eElo = new Uint8Array(maxE);
    this._eGen = new Int32Array(maxE);
    this._eX = new Float32Array(maxE);
    this._eY = new Float32Array(maxE);

    // ── ÉPÜLET-PILLANATKÉP ───────────────────────────────────────────────
    this._epElo = new Uint8Array(maxEp);
    this._epHp = new Int32Array(maxEp);

    this._utolsoTick = -1;
    /** Az egység-pillanatkép előző hossza — csak zsugorodáskor kell törölni. */
    this._eDb = 0;
    /**
     * Kamera-pozíció a ritkításhoz, és a „nincs kamera" ág.
     *
     * ⚠️ A `_kamMind` NEM kényelmi kapcsoló. Kamera nélkül (node-os szonda,
     * fejnélküli futás) a távolság `NaN` lenne, a `NaN <= tav2` pedig HAMIS —
     * vagyis MINDEN mellékes effekt elmaradna, és a szonda csendben nullát
     * mérne egy tökéletesen működő rétegre. Pont az a hibafajta, ami ellen ez
     * az egész kör szól.
     */
    this._kamX = 0;
    this._kamZ = 0;
    this._kamMind = true;
    this._apro = true;

    /**
     * ESEMÉNY-SZÁMLÁLÓK. Halmozottak, és ez a lényegük: ebből lehet SZÁMMAL
     * igazolni, hogy a réteg nem néma. A pillanatnyi darabszám nullát mutatna
     * két csata között — pont az a hiba, ami a beszállásolásnál megbukott.
     */
    this.szamlalo = {
      nyilKiloves: 0,
      nyilBecsapodas: 0,
      kozelharc: 0,
      ostromCsapas: 0,
      epuletTalalat: 0,
      epuletOmlas: 0,
      egysegHalal: 0,
      /** Ennyi tickben nem tudtunk párosítani (ugrás) — diagnosztika. */
      kihagyottTick: 0,
    };

    this.ujraKot(sim);
  }

  /** Újrafelállás / meccs-újraindítás: minden pillanatkép érvénytelen. */
  ujraKot(sim) {
    this._lDb = 0;
    this._utem.fill(0);
    this._eElo.fill(0);
    this._eGen.fill(0);
    this._epElo.fill(0);
    this._epHp.fill(0);
    this._utolsoTick = -1;
    this._hashUrit();
    if (sim) this._pillanatkep(sim);
  }

  /**
   * EGY KÉPKOCKA. Csak tick-váltáskor dolgozik: a köztes képkockákon nincs új
   * esemény, és a kétszer feldolgozott tick kétszeres effektet szülne.
   *
   * @param {import('../sim/sim.js').Sim} sim
   * @param {import('./effekt_keszlet.js').EffektKeszlet} keszlet
   * @param {number} kamX a kamera célpontja (világ x) — a ritkítás ehhez mér
   * @param {number} kamZ a kamera célpontja (világ z = sim y)
   * @returns {number} az ezen a ticken felismert esemény-darabszám
   */
  frissit(sim, keszlet, kamX, kamZ) {
    const tick = sim.tick;
    if (tick === this._utolsoTick) return 0;

    // Visszaugrott vagy több ticket ugrott az óra: nem találgatunk (lásd a
    // fejléc utolsó bekezdését), csak új pillanatképet veszünk.
    if (tick !== this._utolsoTick + 1) {
      if (this._utolsoTick >= 0) this.szamlalo.kihagyottTick++;
      this._pillanatkep(sim);
      this._utolsoTick = tick;
      return 0;
    }

    this._kamMind = !(Number.isFinite(kamX) && Number.isFinite(kamZ));
    this._kamX = this._kamMind ? 0 : kamX;
    this._kamZ = this._kamMind ? 0 : kamZ;
    this._apro = keszlet.telitettseg < TELI_KUSZOB;

    let db = 0;
    db += this._lovedekek(sim, keszlet);
    db += this._csapasok(sim, keszlet);
    db += this._halalok(sim, keszlet);
    db += this._epuletek(sim, keszlet);

    this._pillanatkep(sim);
    this._utolsoTick = tick;
    return db;
  }

  // ── LÖVEDÉKEK ──────────────────────────────────────────────────────────

  /**
   * Kilövés és becsapódás a lövedék-tár párosításából (lásd a fejlécet).
   * A tábla az ELŐZŐ pillanatképből épül; a mostani elemek fogyasztják.
   */
  _lovedekek(sim, keszlet) {
    const lv = sim.lovedekek;
    const racs = sim.racs;
    let esemeny = 0;

    this._hashUrit();
    for (let i = 0; i < this._lDb; i++) {
      this._hashBe(this._lCel[i] * 128 + this._lElet[i], i);
    }

    // 1) MOSTANI elemek: akinek van előző párja, az repül tovább.
    const db = lv.db;
    for (let i = 0; i < db; i++) {
      const kulcs = lv.cel[i] * 128 + lv.elet[i] + 1;
      if (this._hashFogyaszt(kulcs) >= 0) continue;
      // Nincs előzménye → most lőtték ki. Az íj elpattanása: apró villanás a
      // lövő kezénél, hogy a nyíl ne a semmiből induljon.
      esemeny++;
      this.szamlalo.nyilKiloves++;
      if (!this._apro || !this._kozel(lv.x[i], lv.y[i], TAV2_APRO)) continue;
      const t = racs.magassagPont(lv.x[i], lv.y[i]);
      keszlet.villanas(lv.x[i], t + 0.62, lv.y[i], 0.62, 1.0, 0.93, 0.72, t, 0.10);
    }

    // 2) A táblában maradt előző elemek: ezek befejeződtek ezen a ticken.
    for (let s = 0; s < this._hHasznaltDb; s++) {
      const slot = this._hHasznalt[s];
      const marad = this._hDb[slot];
      if (marad <= 0) continue;
      const minta = this._hMinta[slot];
      const x = this._lX[minta], y = this._lY[minta];
      const cs = this._lCsapat[minta] & 1;
      esemeny += marad;
      this.szamlalo.nyilBecsapodas += marad;
      if (!this._kozel(x, y, TAV2_HALAL)) continue;
      const t = racs.magassagPont(x, y);
      // Becsapódás: rövid villanás a csapat színében + kiugró szikrák + port ver.
      keszlet.villanas(x, t + 0.55, y, 0.80,
        CSAPAT_R[cs], CSAPAT_G[cs], CSAPAT_B[cs], t, 0.13);
      keszlet.szikrak(2, x, t + 0.5, y, 2.2, 1.0, 0.85, 0.55, t);
      if (this._apro) keszlet.porFelho(1, x, t + 0.14, y, 0.20, 0.75, 0.5, t);
    }
    return esemeny;
  }

  // ── KÖZELHARC ÉS OSTROM ────────────────────────────────────────────────

  /**
   * Csapások: `utemHatra` NŐTT az előző tickhez képest (lásd a fejlécet).
   * Az íjász kimarad — az ő „csapása" a kilőtt nyíl, azt a `_lovedekek()`
   * jelzi. Kétszer villanna, ha itt is szólnánk érte.
   */
  _csapasok(sim, keszlet) {
    const e = sim.egysegek;
    const harc = sim.harc;
    const pa = sim.parancsAllapot;
    const ep = sim.epuletek;
    const racs = sim.racs;
    const db = e.db;
    let esemeny = 0;

    for (let i = 0; i < db; i++) {
      if (harc.elo[i] === 0) continue;
      if (this._eElo[i] === 0 || this._eGen[i] !== e.generacio[i]) continue;
      if (harc.utemHatra[i] <= this._utem[i]) continue;
      if (e.allapot[i] !== ALLAPOT.HARCOL) continue;
      const tip = e.tipus[i];
      if (tip === TIPUS.IJASZ) continue;

      const x = e.px[i], y = e.py[i];
      const sz = e.szog[i];
      const cs = e.csapat[i] & 1;

      if (tip === TIPUS.OSTROMGEP) {
        // OSTROMGÉP: a sim közelharcban sebez (`HATOTAV[4] = 3,2`), a képernyőn
        // viszont KŐ repül — a röppálya teszi olvashatóvá, hogy melyik gép
        // melyik falat bontja. Csak megjelenítés: a sebzés már megtörtént.
        esemeny++;
        this.szamlalo.ostromCsapas++;
        const cel = pa.celEpulet[i];
        const t = racs.magassagPont(x, y);
        keszlet.villanas(x, t + 0.85, y, 1.1, 1.0, 0.88, 0.60, t, 0.14);
        keszlet.porFelho(2, x, t + 0.2, y, 0.5, 1.2, 0.7, t);
        if (cel >= 0 && ep.el(cel)) {
          const cx = ep.x[cel], cz = ep.y[cel];
          const ct = racs.magassagPont(cx, cz);
          const magas = EP_MERET[ep.tipus[cel]] * 0.42 * EP_MAGASSAG[ep.tipus[cel]];
          keszlet.koIv(x, t + 0.9, y, cx, ct + magas, cz, 0.55, ct);
        }
        continue;
      }

      esemeny++;
      this.szamlalo.kozelharc++;
      if (!this._apro || !this._kozel(x, y, TAV2_APRO)) continue;
      // A csapás a figura ELŐTT csattan, nem benne. A `szog` a sim síkján
      // értendő (`fxAtan2(vy, vx)`), és a 3D-ben az x/y pár közvetlenül x/z —
      // ugyanaz a leképezés, amit a `lovedek3d.js` használ.
      const ex = x + Math.cos(sz) * 0.62;
      const ey = y + Math.sin(sz) * 0.62;
      const t = racs.magassagPont(ex, ey);
      keszlet.villanas(ex, t + 0.72, ey, 0.66,
        0.55 + CSAPAT_R[cs] * 0.45, 0.62 + CSAPAT_G[cs] * 0.38, 0.55 + CSAPAT_B[cs] * 0.45,
        t, 0.12);
      keszlet.szikrak(2, ex, t + 0.7, ey, 1.9, 1.0, 0.90, 0.62, t);
    }
    return esemeny;
  }

  // ── EGYSÉG-HALÁL ───────────────────────────────────────────────────────

  /**
   * Halál: az előző tickben élt, most nem — VAGY a slotja már új gazdát kapott
   * (generáció-váltás). A pozíciót az ELŐZŐ pillanatképből vesszük: az
   * újrahasznosított rekeszben már a frissen kiképzett egység áll, és a
   * halál-por a laktanya ajtajában keletkezne.
   */
  _halalok(sim, keszlet) {
    const e = sim.egysegek;
    const harc = sim.harc;
    const racs = sim.racs;
    const db = e.db;
    let esemeny = 0;

    for (let i = 0; i < db; i++) {
      if (this._eElo[i] === 0) continue;
      if (harc.elo[i] === 1 && this._eGen[i] === e.generacio[i]) continue;

      esemeny++;
      this.szamlalo.egysegHalal++;
      const x = this._eX[i], y = this._eY[i];
      if (!this._apro || !this._kozel(x, y, TAV2_HALAL)) continue;
      const t = racs.magassagPont(x, y);
      // Rövid és olcsó: egy tompa porpamacs a földön + egy sötétedő folt.
      // Nem robbanás — egy elesett katona nem vet lángot.
      keszlet.porFelho(2, x, t + 0.25, y, 0.30, 1.05, 0.65, t, 0.62, 0.56, 0.48);
      keszlet.nyom(x, t + 0.02, y, 0.95, 3.2, t);
    }
    return esemeny;
  }

  // ── ÉPÜLETEK ───────────────────────────────────────────────────────────

  /**
   * Találat és összeomlás. Az életerő-csökkenés tickenként EGY esemény
   * épületenként (a sim is így összegzi), az összeomlás pedig az `elo` 1→0
   * váltása.
   */
  _epuletek(sim, keszlet) {
    const ep = sim.epuletek;
    const racs = sim.racs;
    const db = ep.db;
    let esemeny = 0;

    for (let k = 0; k < db; k++) {
      const eloMost = ep.elo[k];
      const eloElozo = this._epElo[k];

      if (eloElozo === 1 && eloMost === 0) {
        esemeny++;
        this.szamlalo.epuletOmlas++;
        const x = ep.x[k], z = ep.y[k];
        const t = racs.magassagPont(x, z);
        const tip = ep.tipus[k];
        const m = EP_MERET[tip];
        const magas = m * 0.55 * EP_MAGASSAG[tip];
        // ÖSSZEOMLÁS. A `rom` a lényeg: egy süllyedő, zsugorodó test, ami
        // átveszi az épület helyét, amikor a `gazdasag3d.js` leveszi a
        // példányt — enélkül az épület PATTANVA tűnne el.
        keszlet.rom(x, t + magas * 0.5, z, m * 0.82, 1.5,
          tip === EPULET.FAL || tip === EPULET.KAPU ? 0.52 : 0.46,
          0.46, 0.40, t);
        keszlet.porFelho(10 + m * 2, x, t + magas * 0.4, z, m * 0.45,
          m * 1.35, 1.9, t);
        keszlet.fustGomb(6 + m, x, t + magas * 0.7, z, m * 0.35, m * 1.5, 3.4, t);
        keszlet.tormelekek(8 + m * 2, x, t + magas * 0.45, z, 4.6, 0.28, t);
        keszlet.nyom(x, t + 0.03, z, m * 1.15, 12.0, t);
        continue;
      }

      if (eloMost === 1 && ep.hp[k] < this._epHp[k]) {
        esemeny++;
        this.szamlalo.epuletTalalat++;
        const tip = ep.tipus[k];
        const m = EP_MERET[tip];
        const x = ep.x[k], z = ep.y[k];
        if (!this._kozel(x, z, TAV2_HALAL)) continue;
        const t = racs.magassagPont(x, z);
        // A csapás helye: a falsík valamelyik pontja, mellmagasságban. Az ütő
        // egységet nem keressük vissza — az épületre több oldalról is
        // érkezhet csapás, és a keresés árát tickenként fizetnénk.
        const sx = x + keszlet.szoras(m * 0.5);
        const sz2 = z + keszlet.szoras(m * 0.5);
        const mag = t + 0.35 + keszlet.veletlen() * m * 0.5 * EP_MAGASSAG[tip];
        keszlet.villanas(sx, mag, sz2, 0.75, 1.0, 0.90, 0.68, t, 0.11);
        keszlet.porFelho(2, sx, mag, sz2, 0.30, m * 0.55, 0.85, t);
        keszlet.tormelekek(2, sx, mag, sz2, 2.3, 0.16, t);
        // A ROMBOLÁS NYOMA: az épület tövében sötétedő folt gyűlik. Nem
        // dekoráció — ebből látszik pásztázás közben, melyik falat verik.
        if (keszlet.veletlen() < 0.25) keszlet.nyom(sx, t + 0.02, sz2, m * 0.6, 9.0, t);
      }
    }
    return esemeny;
  }

  // ── PILLANATKÉP ────────────────────────────────────────────────────────

  /** Az összes figyelt mező átmásolása. Ciklusonként egy `TypedArray` írás. */
  _pillanatkep(sim) {
    const lv = sim.lovedekek;
    const e = sim.egysegek;
    const harc = sim.harc;
    const ep = sim.epuletek;

    const ld = lv.db;
    for (let i = 0; i < ld; i++) {
      this._lX[i] = lv.x[i];
      this._lY[i] = lv.y[i];
      this._lCel[i] = lv.cel[i];
      this._lElet[i] = lv.elet[i];
      this._lCsapat[i] = lv.csapat[i];
    }
    this._lDb = ld;

    const ed = e.db;
    for (let i = 0; i < ed; i++) {
      this._utem[i] = harc.utemHatra[i];
      this._eElo[i] = harc.elo[i];
      this._eGen[i] = e.generacio[i];
      this._eX[i] = e.px[i];
      this._eY[i] = e.py[i];
    }
    // Ha a sereg ZSUGORODOTT (újrafelállás), a régi rekeszekben ottmaradna az
    // `elo = 1`. Amint a létszám később ismét átlépi őket, mind halálnak
    // látszana. Csak zsugorodáskor törlünk, tehát ez nem tickenkénti költség.
    if (ed < this._eDb) this._eElo.fill(0, ed, this._eDb);
    this._eDb = ed;

    const epd = ep.db;
    for (let k = 0; k < epd; k++) {
      this._epElo[k] = ep.elo[k];
      this._epHp[k] = ep.hp[k];
    }
    // A `nullaz()` visszaviszi a `db`-t nullára, de a régi rekeszek `elo`-ja
    // ottmaradna 1-en, és a következő képkockán mind „összeomlana". Ezért a
    // db fölötti tartományt is töröljük.
    if (epd < this._epElo.length) this._epElo.fill(0, epd);
  }

  // ── HASÍTÓTÁBLA ────────────────────────────────────────────────────────
  //
  // Nyílt címzés lineáris próbálással. A törlés NEM `fill()`: csak a ténylegesen
  // használt rekeszeket állítjuk vissza (`_hHasznalt`), különben tickenként
  // 8192 elemet írnánk 20 lövedék kedvéért.

  _hashUrit() {
    for (let s = 0; s < this._hHasznaltDb; s++) {
      const slot = this._hHasznalt[s];
      this._hKulcs[slot] = -1;
      this._hDb[slot] = 0;
    }
    this._hHasznaltDb = 0;
  }

  _hashBe(kulcs, minta) {
    let s = (Math.imul(kulcs, 0x9e3779b1) >>> 17) & HASH_MASZK;
    for (let p = 0; p < HASH; p++) {
      const k = this._hKulcs[s];
      if (k === kulcs) { this._hDb[s]++; return; }
      if (k === -1) {
        this._hKulcs[s] = kulcs;
        this._hDb[s] = 1;
        this._hMinta[s] = minta;
        this._hHasznalt[this._hHasznaltDb++] = s;
        return;
      }
      s = (s + 1) & HASH_MASZK;
    }
  }

  /** Egy pár elvétele. `-1`, ha nincs ilyen kulcs (vagy már elfogyott). */
  _hashFogyaszt(kulcs) {
    let s = (Math.imul(kulcs, 0x9e3779b1) >>> 17) & HASH_MASZK;
    for (let p = 0; p < HASH; p++) {
      const k = this._hKulcs[s];
      if (k === -1) return -1;
      if (k === kulcs) {
        if (this._hDb[s] <= 0) return -1;
        this._hDb[s]--;
        return this._hMinta[s];
      }
      s = (s + 1) & HASH_MASZK;
    }
    return -1;
  }

  // ── RITKÍTÁS ───────────────────────────────────────────────────────────

  /** Kamerához elég közel van-e? (`x`, `y` a sim síkján: y → világ z) */
  _kozel(x, y, tav2) {
    if (this._kamMind) return true;
    const dx = x - this._kamX, dz = y - this._kamZ;
    return dx * dx + dz * dz <= tav2;
  }
}
