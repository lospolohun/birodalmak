// AGE OF THE CRYSTALS — WEBAUDIO-RÉTEG (v0.12/1).
//
// ── MIT CSINÁL, ÉS MIT NEM ────────────────────────────────────────────────
// Ez a fájl szólaltatja meg a `hang_katalogus.js` paraméter-tábláit. Semmilyen
// döntést NEM hoz: mit, mikor és milyen hangosan — azt mind a katalógus és a
// keverő mondja meg. Itt csak WebAudio-csomópontok épülnek.
//
// A szétvágás oka ugyanaz, mint a `minimap_adat.js` / `minimap.js` és a
// `civ_valaszto_adat.js` / `civ_valaszto.js` párosnál: a DÖNTÉS node-ban is
// futtatható, tehát szondázható. Ami ebbe a fájlba került, azt csak füllel
// lehetne ellenőrizni — a felhőben pedig se GPU, se hangkártya nincs. Ezért
// van itt a lehető legkevesebb logika.
//
// ── ⚠️ A HANG SOSEM ÍR A SIMBE ────────────────────────────────────────────
// Ez a réteg CSAK OLVAS. Nem ad be parancsot, nem állít sim-mezőt, nem kér
// visszahívást. Amit tud, azt a sim HALMOZOTT SZÁMLÁLÓIBÓL tudja, két képkocka
// különbségéből (`Esemenyfolyam`). A sim nem is tud a létezéséről: nincs benne
// egyetlen hang-hivatkozás sem, és nem is lesz — az a v0.8-ban desync lenne.
//
// Saját órája van (`most`, ezredmásodperc, a hívótól). A `sim.tick`-et
// szándékosan NEM használja ütemezésre: a hangnak valós idő kell, a simnek
// pedig tick-idő, és a kettő összecsúsztatása pont az a hiba, ami a lassuló
// gépen néma játékot adna.
//
// ── HANGFÁJL NINCS ────────────────────────────────────────────────────────
// Minden hang itt születik: oszcillátor vagy zajpuffer → szűrő → burkológörbe.
// A zajpuffer EGYSZER jön létre (egy másodpercnyi fehér zaj), és minden zajos
// réteg ugyanazt olvassa más szűrővel — a fejszecsapást és a nyílvesszőt nem a
// hanganyag, hanem a sávszűrő különbözteti meg.
//
// ── ALLOKÁCIÓ ─────────────────────────────────────────────────────────────
// A `frissit()` DÖNTÉSI útja nulla allokációval fut: a pillanatkép, az
// eseménypuffer és a súlypontok előre lefoglalt `Float64Array`-ek. Csomópontot
// csak akkor építünk, ha a keverő ÁTENGEDTE a kérést — és épp ez a keverő
// dolga: a WebAudio-csomópontok száma másodpercenként néhány tucat marad
// akkor is, amikor 1600 egység csap össze.

import { ALLAPOT, TIPUS } from '../sim/units.js';
import { MUNKA } from '../sim/munkas.js';
import { NYERS } from '../sim/eroforras.js';
import {
  HANG, HANG_DB, KATALOGUS, HELY, BUSZ,
  ESEMENY, ESEMENY_DB,
  SZAMLALO, SZAMLALO_DB,
  Kevero, Esemenyfolyam,
  ZENE, ZENE_HARC, ZENE_ATUSZAS_MS, HARCI_KUSZOB, felhangFrekvencia,
} from './hang_katalogus.js';

/** A zajpuffer hossza másodpercben. Egy másodperc bőven elég: minden zajos
 *  réteg véletlen pontról indul benne, tehát nem hallatszik ismétlődőnek. */
const ZAJ_HOSSZ = 1;

/** A harci sűrűség simítása: ennyi ezredmásodperc alatt feleződik a súlya. */
const SURUSEG_FELEZES_MS = 1800;

export class Hang {
  /**
   * @param {import('../sim/sim.js').Sim} sim
   * @param {{sajatCsapat?:number, mester?:number, zene?:number,
   *          osszPlafon?:number}} [opciok]
   */
  constructor(sim, opciok = {}) {
    this.sim = sim;
    this.csapat = opciok.sajatCsapat ?? 0;
    this._enabled = true;

    this.kevero = new Kevero({
      osszPlafon: opciok.osszPlafon ?? 20,
      mester: opciok.mester ?? 1,
    });
    this.folyam = new Esemenyfolyam();

    /** Számláló-pillanatkép — EGYSZER foglaljuk le. */
    this._pillanat = new Float64Array(SZAMLALO_DB);
    /** Súlypontok `HELY.*` szerint: `[x, y]` párok. */
    this._sulypont = new Float64Array(4 * 2);
    /** Esemény → hang gyorstábla; a katalógusból épül, egyszer. */
    this._esemenyHang = new Int32Array(ESEMENY_DB).fill(-1);
    for (let h = 0; h < HANG_DB; h++) {
      const k = KATALOGUS[h];
      if (k !== undefined) this._esemenyHang[k.esemeny] = h;
    }

    this._hallgatoX = 0;
    this._hallgatoY = 0;
    this._utolsoMs = -1;

    /** Csapás-események / másodperc, simítva — ebből vált a zene harcira. */
    this.harcSuruseg = 0;

    // ── WebAudio — CSAK felhasználói gesztusra indul (`inditas`) ───────
    this.ac = null;
    this._mester = null;
    this._buszok = null;
    this._zaj = null;
    this.zeneBe = opciok.zene !== 0;
    this._zeneMost = null;
    this._kovetkezoUtem = 0;
    this._atuszasVeg = 0;

    /** Működés-számok a HUD-nak és a hibakeresésnek. */
    this.stat = { szolam: 0, csomopont: 0, zeneHang: 0 };
  }

  /**
   * A hangmotor indítása. A böngésző csak FELHASZNÁLÓI GESZTUSRA engedi az
   * `AudioContext`-et — ezért nem a konstruktorban van: egy automatikusan
   * létrehozott környezet `suspended` állapotban ragadna, és a játék néma
   * maradna minden hibaüzenet nélkül.
   *
   * Node-ban (szonda, teszt) egyszerűen `false`-szal tér vissza, és a réteg
   * ettől még használható marad: a döntési út fut, csak nem szól semmi.
   *
   * @returns {boolean} sikerült-e
   */
  inditas() {
    if (this.ac) { if (this.ac.state === 'suspended') this.ac.resume(); return true; }
    const AC = (typeof window !== 'undefined')
      ? (window.AudioContext || window.webkitAudioContext) : undefined;
    if (!AC) return false;

    const ac = new AC();
    this.ac = ac;
    this._mester = ac.createGain();
    this._mester.gain.value = 1;
    this._mester.connect(ac.destination);

    // Három busz: effekt, kezelőfelület, zene. A játékos külön halkíthatja
    // őket, és a zene átúsztatása is ezen a csomóponton történik.
    this._buszok = [ac.createGain(), ac.createGain(), ac.createGain()];
    this._buszok[BUSZ.SFX].gain.value = 1;
    this._buszok[BUSZ.UI].gain.value = 1;
    this._buszok[BUSZ.ZENE].gain.value = 0.7;
    for (let b = 0; b < this._buszok.length; b++) this._buszok[b].connect(this._mester);

    // A zajpuffer EGYSZER. Minden zajos hang ezt olvassa, más szűrővel.
    const minta = (ac.sampleRate * ZAJ_HOSSZ) | 0;
    const puffer = ac.createBuffer(1, minta, ac.sampleRate);
    const adat = puffer.getChannelData(0);
    for (let i = 0; i < minta; i++) adat[i] = Math.random() * 2 - 1;
    this._zaj = puffer;

    return true;
  }

  /** A hallgató helye — a kamera célpontja. A távolság-vágás ehhez mér. */
  hallgato(x, y) { this._hallgatoX = x; this._hallgatoY = y; }

  /**
   * KÉPKOCKA.
   *
   * @param {import('../sim/sim.js').Sim} sim
   * @param {number} most ezredmásodperc (`performance.now()`)
   * @param {number} [hallgatoX] a kamera célpontja
   * @param {number} [hallgatoY]
   */
  frissit(sim, most, hallgatoX, hallgatoY) {
    if (!this._enabled) return;
    if (hallgatoX !== undefined) { this._hallgatoX = hallgatoX; this._hallgatoY = hallgatoY; }

    const dt = this._utolsoMs < 0 ? 16 : most - this._utolsoMs;
    this._utolsoMs = most;

    this._sulypontok(sim);
    this._pillanatKitolt(sim);

    const db = this.folyam.lep(this._pillanat);
    let harci = 0;
    for (let i = 0; i < db; i++) {
      const e = this.folyam.esemeny[i];
      if (e === ESEMENY.CSAPAS || e === ESEMENY.SEBZODES) harci++;
      const hang = this._esemenyHang[e];
      if (hang < 0) continue;
      const k = KATALOGUS[hang];
      const tav = this._tavolsag(k.hely);
      if (this.kevero.ker(hang, most, tav, 1)) this._szolal(hang, this.kevero.kiHangero, k.busz);
    }

    // Harci sűrűség (esemény / mp), exponenciális simítással. A nyers szám
    // képkockánként ugrálna, és a zene ide-oda kapcsolgatna tőle.
    if (dt > 0) {
      const cel = (harci * 1000) / dt;
      const w = dt / (dt + SURUSEG_FELEZES_MS);
      this.harcSuruseg += (cel - this.harcSuruseg) * w;
    }

    this._zeneLepes(sim, most);
  }

  /**
   * A KLIENS eseményei — kijelölés, parancs, elutasítás. Ezek nem a simből
   * jönnek (a sim nem is tud róluk: a kijelölés nem világállapot), ezért a
   * `bevitel.js` / `kijeloles.js` hívja meg közvetlenül.
   *
   * @param {number} kod `ESEMENY.*`
   * @param {number} [x] hol történt (világ); ha nincs, a hallgatónál szól
   * @param {number} [y]
   * @param {number} [most] ezredmásodperc; alapból az utolsó képkocka ideje
   */
  esemeny(kod, x, y, most) {
    if (!this._enabled) return false;
    const hang = this._esemenyHang[kod];
    if (hang === undefined || hang < 0) return false;
    const k = KATALOGUS[hang];
    const t = most === undefined ? this._utolsoMs : most;
    let tav = 0;
    if (x !== undefined && k.hely !== HELY.HALLGATO) {
      const dx = x - this._hallgatoX, dy = y - this._hallgatoY;
      tav = Math.sqrt(dx * dx + dy * dy);
    }
    if (!this.kevero.ker(hang, t, tav, 1)) return false;
    this._szolal(hang, this.kevero.kiHangero, k.busz);
    return true;
  }

  // ── SÚLYPONTOK ─────────────────────────────────────────────────────
  //
  // ⚠️ KÖZELÍTÉS, ÉS ANNAK IS VAN NEVEZVE. A sim halmozott számlálója nem
  // hordoz koordinátát: abból, hogy „az összsebzés 240-nel nőtt", nem derül
  // ki, HOL. Három súlypontot számolunk (harc, munka, bázis), és minden hang
  // ahhoz tartozik, amelyikhez logikailag illik.
  //
  // Ez EGYETLEN menet az egységeken képkockánként, allokáció nélkül. Az
  // alternatíva — esemény-napló koordinátákkal — a simet érintené, tehát a
  // determinizmust; az a v0.12 sávján kívül esik.
  _sulypontok(sim) {
    const sp = this._sulypont;
    const cs = this.csapat;
    let hx = 0, hy = 0, hn = 0;
    let mx = 0, my = 0, mn = 0;

    const e = sim.egysegek;
    const harc = sim.harc;
    const munkasok = sim.munkasok;
    if (e) {
      for (let i = 0; i < e.db; i++) {
        if (harc && harc.elo[i] === 0) continue;
        if (e.csapat[i] !== cs) continue;
        if (e.tipus[i] === TIPUS.MUNKAS) {
          if (munkasok && munkasok.allapot[i] === MUNKA.NINCS) continue;
          mx += e.px[i]; my += e.py[i]; mn++;
        } else if (e.allapot[i] === ALLAPOT.HARCOL) {
          hx += e.px[i]; hy += e.py[i]; hn++;
        }
      }
    }

    let bx = 0, by = 0, bn = 0;
    const ep = sim.epuletek;
    if (ep) {
      for (let k = 0; k < ep.db; k++) {
        if (ep.elo[k] === 0 || ep.csapat[k] !== cs) continue;
        bx += ep.x[k]; by += ep.y[k]; bn++;
      }
    }

    // Ha nincs mihez kötni (nincs harcoló egység, nincs munkás), a hang a
    // hallgatónál szól. Ez jobb, mint a pálya sarkából halkan: a némaság
    // hibának hallatszana.
    sp[HELY.HARC * 2] = hn ? hx / hn : this._hallgatoX;
    sp[HELY.HARC * 2 + 1] = hn ? hy / hn : this._hallgatoY;
    sp[HELY.MUNKA * 2] = mn ? mx / mn : this._hallgatoX;
    sp[HELY.MUNKA * 2 + 1] = mn ? my / mn : this._hallgatoY;
    sp[HELY.BAZIS * 2] = bn ? bx / bn : this._hallgatoX;
    sp[HELY.BAZIS * 2 + 1] = bn ? by / bn : this._hallgatoY;
    sp[HELY.HALLGATO * 2] = this._hallgatoX;
    sp[HELY.HALLGATO * 2 + 1] = this._hallgatoY;
  }

  _tavolsag(hely) {
    if (hely === HELY.HALLGATO) return 0;
    const dx = this._sulypont[hely * 2] - this._hallgatoX;
    const dy = this._sulypont[hely * 2 + 1] - this._hallgatoY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // ── A SIM SZÁMLÁLÓI ────────────────────────────────────────────────
  //
  // Minden olvasás védett: ha egy alrendszer épp nincs bekötve (menü, korai
  // képkocka), a hang NEM dobhat kivételt. Egy néma játék bosszantó, egy
  // összeomló képkocka-hurok viszont a játékot viszi el.
  _pillanatKitolt(sim) {
    const p = this._pillanat;
    const cs = this.csapat;
    const ok = 1 - cs;

    const harc = sim.harc;
    if (harc) {
      p[SZAMLALO.SEBZES_MI] = harc.osszSebzes[cs];
      p[SZAMLALO.SEBZES_OK] = harc.osszSebzes[ok];
      p[SZAMLALO.HALOTT_MI] = harc.halottak[cs];
      p[SZAMLALO.HALOTT_OK] = harc.halottak[ok];
      p[SZAMLALO.TORONY_SORTUZ] = harc.toronySortuz[cs];
    }
    const lov = sim.lovedek;
    if (lov) {
      p[SZAMLALO.LOVEDEK_KILOTT] = lov.kilott;
      p[SZAMLALO.LOVEDEK_TALALT] = lov.talalt;
    }
    if (sim.kepzes) p[SZAMLALO.EGYSEG_KESZULT] = sim.kepzes.keszult[cs];
    if (sim.technologia) p[SZAMLALO.TECH_KESZULT] = sim.technologia.keszult[cs];

    const g = sim.gazdasag;
    if (g) {
      p[SZAMLALO.GYUJT_ETEL] = g.osszegyujtott[cs * 4 + NYERS.ETEL];
      p[SZAMLALO.GYUJT_FA] = g.osszegyujtott[cs * 4 + NYERS.FA];
      p[SZAMLALO.GYUJT_KO] = g.osszegyujtott[cs * 4 + NYERS.KO];
      p[SZAMLALO.GYUJT_KRISTALY] = g.osszegyujtott[cs * 4 + NYERS.KRISTALY];
      p[SZAMLALO.CSERE] = g.csereDb[cs];
      p[SZAMLALO.KORSZAK] = g.korszak[cs];
    }

    // Az épületeknek nincs halmozott számlálójuk a simben, ezért itt
    // SZÁMOLJUK meg őket — ugyanabban a menetben mind a négy számot. Az
    // „elpusztult" ebből csökkenésként adódik (`SZABALYOK`, `irany: -1`).
    let alapMi = 0, keszMi = 0, eloMi = 0, eloOk = 0;
    const ep = sim.epuletek;
    if (ep) {
      for (let k = 0; k < ep.db; k++) {
        const sajat = ep.csapat[k] === cs;
        if (sajat) alapMi++;
        if (ep.elo[k] === 0) continue;
        if (sajat) { eloMi++; if (ep.epulHatra[k] === 0) keszMi++; } else eloOk++;
      }
    }
    p[SZAMLALO.EPULET_ALAP_MI] = alapMi;
    p[SZAMLALO.EPULET_KESZ_MI] = keszMi;
    p[SZAMLALO.EPULET_ELO_MI] = eloMi;
    p[SZAMLALO.EPULET_ELO_OK] = eloOk;
  }

  // ── MEGSZÓLALTATÁS ─────────────────────────────────────────────────

  /**
   * Egy katalógus-bejegyzés megszólaltatása.
   *
   * ⚠️ Ide már csak az jut el, amit a keverő ÁTENGEDETT. Ezért szabad itt
   * csomópontot építeni: a keverő garantálja, hogy ez másodpercenként néhány
   * tucatszor fut le, nem több százszor.
   */
  _szolal(hang, hangero, busz) {
    const ac = this.ac;
    if (!ac) return;
    const k = KATALOGUS[hang];
    const cel = this._buszok[busz] ?? this._mester;
    // Hangmagasság-szórás: ugyanaz a kardcsapás húszszor egymás után gépiesen
    // hangzana. A `Math.random()` itt SZABAD — ez a render oldala, a világ
    // állapotát nem érinti.
    const arany = k.hangolas ? 1 + (Math.random() * 2 - 1) * (k.hangolas / 100) : 1;
    const t0 = ac.currentTime + 0.002;
    for (let r = 0; r < k.retegek.length; r++) {
      this._reteg(k.retegek[r], t0, hangero * k.retegek[r].hangero, arany, cel, 0);
    }
    this.stat.szolam++;
  }

  /**
   * EGY réteg: forrás → (szűrő) → burkológörbe → busz.
   *
   * @param {object} r a katalógus réteg-leírója
   * @param {number} t0 indítás `AudioContext` időben
   * @param {number} g csúcs-hangerő
   * @param {number} arany hangmagasság-szorzó
   * @param {AudioNode} cel busz
   * @param {number} felhang félhang-eltolás (a zene használja)
   */
  _reteg(r, t0, g, arany, cel, felhang) {
    const ac = this.ac;
    const veg = t0 + r.tamadas + r.hossz;
    const f0 = felhang ? felhangFrekvencia(r.f0, felhang) * arany : r.f0 * arany;
    const f1 = felhang ? felhangFrekvencia(r.f1, felhang) * arany : r.f1 * arany;

    let forras;
    if (r.hullam === 'zaj') {
      forras = ac.createBufferSource();
      forras.buffer = this._zaj;
      // Véletlen kezdőpont a pufferben — enélkül minden zajos hang ugyanazt a
      // néhány ezredmásodpercnyi mintát ismételné, és ez hallható lenne.
      forras.loop = true;
      forras.loopStart = 0;
      forras.loopEnd = ZAJ_HOSSZ;
    } else {
      forras = ac.createOscillator();
      forras.type = r.hullam;
      forras.frequency.setValueAtTime(f0, t0);
      if (f1 !== f0) forras.frequency.exponentialRampToValueAtTime(f1 < 1 ? 1 : f1, veg);
    }

    let utolso = forras;
    if (r.szuro) {
      const sz = ac.createBiquadFilter();
      sz.type = r.szuro.tipus;
      sz.Q.value = r.szuro.q;
      if (r.hullam === 'zaj') {
        // A ZAJNÁL a szűrő söpör `f0`-ról `f1`-re: ez adja a hang „alakját".
        // Szűrő nélkül minden zajos hang ugyanaz a „pssz" lenne — ezért is
        // kötelező a `zaj` réteghez szűrőt adni (`retegHibak`).
        sz.frequency.setValueAtTime(f0, t0);
        sz.frequency.exponentialRampToValueAtTime(f1 < 20 ? 20 : f1, veg);
      } else {
        sz.frequency.setValueAtTime(r.szuro.f, t0);
      }
      forras.connect(sz);
      utolso = sz;
    }

    const burok = ac.createGain();
    burok.gain.setValueAtTime(0.0001, t0);
    burok.gain.linearRampToValueAtTime(g, t0 + (r.tamadas > 0 ? r.tamadas : 0.001));
    // Exponenciális lecsengés: a lineáris burkoló hallhatóan „elvágja" a
    // hangot, és kattan a végén.
    burok.gain.exponentialRampToValueAtTime(0.0001, veg);
    utolso.connect(burok);
    burok.connect(cel);

    forras.start(t0, r.hullam === 'zaj' ? Math.random() * (ZAJ_HOSSZ * 0.5) : 0);
    forras.stop(veg + 0.02);
    // Nincs `onended` takarítás: a leállított forrás és a rá kötött lánc a
    // böngésző dolga, és egy lezárás (closure) szólamonként fölösleges
    // szemét lenne. A csomópontok száma amúgy is korlátos — erről a keverő
    // gondoskodik.
    this.stat.csomopont += r.szuro ? 3 : 2;
  }

  // ── ZENE ───────────────────────────────────────────────────────────
  //
  // Nem sáv, hanem GENERÁTOR: a korszakhoz tartozó pentaton skálából szemez
  // ki hangokat. Ezért nincs hangfájl, és ezért nincs vágás a korszakváltásnál
  // sem — csak hangnem- és ütemváltás, átúsztatva.
  _zeneLepes(sim, most) {
    if (!this.ac || !this.zeneBe) return;
    const g = sim.gazdasag;
    const korszak = g ? (g.korszak[this.csapat] | 0) : 0;
    const kell = this.harcSuruseg > HARCI_KUSZOB ? ZENE_HARC : (ZENE[korszak] ?? ZENE[0]);

    if (kell !== this._zeneMost) {
      const busz = this._buszok[BUSZ.ZENE];
      const fel = ZENE_ATUSZAS_MS / 2000;
      // Lehalkulás, majd vissza — a téma a halk pontban vált, tehát nincs
      // hallható vágás két hangnem között.
      busz.gain.cancelScheduledValues(this.ac.currentTime);
      busz.gain.setTargetAtTime(0.05, this.ac.currentTime, fel / 3);
      busz.gain.setTargetAtTime(0.7, this.ac.currentTime + fel, fel / 3);
      this._zeneMost = kell;
      this._atuszasVeg = most + ZENE_ATUSZAS_MS;
      this._kovetkezoUtem = most + ZENE_ATUSZAS_MS / 2;
      return;
    }

    const z = this._zeneMost;
    if (z === null) { this._zeneMost = kell; return; }
    if (most < this._kovetkezoUtem) return;
    this._kovetkezoUtem = most + z.utemMs;
    if (Math.random() * 100 >= z.suru) return;

    const t0 = this.ac.currentTime + 0.002;
    const cel = this._buszok[BUSZ.ZENE];
    const felhang = z.skala[(Math.random() * z.skala.length) | 0]
      + (Math.random() < 0.25 ? 12 : 0);
    for (let r = 0; r < z.retegek.length; r++) {
      // A DALLAM-réteg kapja a skála hangját, a többi orgonapont marad az
      // alaphangon. Így egyetlen táblából lesz kíséret is, dallam is.
      this._reteg(z.retegek[r], t0, z.hangero * z.retegek[r].hangero, 1, cel,
        r === z.dallamReteg ? felhang : 0);
    }
    this.stat.zeneHang++;
  }

  // ── FELÜLET ────────────────────────────────────────────────────────

  /** Mester-hangerő 0..1. */
  set hangero(v) {
    this.kevero.mester = v;
    if (this._mester) this._mester.gain.value = v;
  }
  get hangero() { return this.kevero.mester; }

  /** Zene ki/be — a hangeffektek ettől függetlenül szólnak. */
  set zene(v) {
    this.zeneBe = !!v;
    if (this._buszok) this._buszok[BUSZ.ZENE].gain.value = v ? 0.7 : 0;
  }
  get zene() { return this.zeneBe; }

  /** A többi réteggel közös felület — a szonda így tudja kikapcsolni. */
  set enabled(v) {
    this._enabled = !!v;
    if (!v && this.ac && this.ac.state === 'running') this.ac.suspend();
    else if (v && this.ac && this.ac.state === 'suspended') this.ac.resume();
  }
  get enabled() { return this._enabled; }

  /** A hang nem rajzol. A közös réteg-felület miatt van itt. */
  get haromszog() { return 0; }

  /** Pillanatkép a HUD-nak és a hibakeresésnek. */
  osszesites() {
    const s = this.kevero.stat;
    return {
      be: s.bejovo, ki: s.kimeno,
      eldobIsmetles: s.eldobIsmetles, eldobPlafon: s.eldobPlafon,
      eldobOsszPlafon: s.eldobOsszPlafon, eldobTavolsag: s.eldobTavolsag,
      esemeny: this.folyam.stat.osszEsemeny, levagott: this.folyam.stat.levagott,
      szolam: this.stat.szolam, zeneHang: this.stat.zeneHang,
      harcSuruseg: this.harcSuruseg,
      tema: this._zeneMost ? this._zeneMost.nev : '—',
    };
  }
}

export { ESEMENY, HANG };
