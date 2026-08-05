// PORTAL HUB TYCOON — A HANGRENDSZER.
//
// ── MIÉRT VAN EZ A RÉTEG ──────────────────────────────────────────────────
// Ennek a játéknak minden fontos állapota SZÁM a HUD-on: hírnév 42,
// instabilitás 780. A számokat olvasni kell, és a játékos nem oda néz —
// oda néz, ahol épp épít. A hang az egyetlen csatorna, ami akkor is elér,
// amikor a szem máshol van. A cél nem „csipogjon valamit", hanem hogy CSUKOTT
// SZEMMEL is meg lehessen mondani, baj van-e az állomáson:
//
//   a portálzúgás lüktetése gyorsul és a felhangja tritónuszba csúszik
//       → valamelyik kapud mindjárt összeomlik,
//   a tömegzaj hangosodik → megtelt az állomás,
//   mély moraj keveredik alá → a vendégeid dühösen távoznak,
//   minden tompa lesz + hálózati zümmögés → áramszünet.
//
// Ez a négy réteg együtt egy TELJES állapotjelentés, és egyetlen pillantást
// sem kér cserébe.
//
// ── MIÉRT NINCS EGYETLEN HANGFÁJL SEM ─────────────────────────────────────
// A `dist/` bárhová másolható kell legyen, második hálózati kérés nélkül —
// ezért minden hang procedurális (oszcillátor, zajpuffer, szűrő, burkoló).
// A `tools/hang_szonda.mjs` statikusan is őrzi ezt: `fetch`, `new Audio(`,
// `.mp3` az `audio/` alatt piros lámpa.
//
// ── MIÉRT NEM INDUL MAGÁTÓL ───────────────────────────────────────────────
// A konstruktor SZÁNDÉKOSAN nem hoz létre AudioContext-et. Minden mai
// böngésző letiltja a felhasználói gesztus nélkül indított hangot, és a
// letiltott, `suspended` állapotban ragadt kontextus a legrosszabb fajta hiba:
// nem dob kivételt, csak néma marad, és órákig lehet keresni. Ezért az
// `inditas()` külön lépés, amit az első kattintásra kell meghívni.
//
// ── MIÉRT ELŐRE MEGÉPÍTETT CSOMÓPONTOK ────────────────────────────────────
// A folyamatos rétegek EGYSZER épülnek fel, és onnantól csak a paramétereik
// mozognak (`setTargetAtTime`). Ezer utasnál a naiv megoldás — utasonként
// vagy eseményenként új oszcillátor — több száz élő csomópontot jelentene, és
// nem a CPU miatt lenne baj: a hangkép mosódna sárrá. Az egylövetű effektek
// ezért is korlátosak (`KEVERES.maxEgyloveses`), és a fölösleget eldobjuk —
// a legalacsonyabb elsőbbségűt, a legrégebbit.
//
// ── A RENDER OLDALON VAGYUNK ──────────────────────────────────────────────
// Ez a fájl SOSEM ír a simbe, csak olvassa. `Math.random` itt szabad (a
// determinizmus-tilalom a `src/sim/`-re vonatkozik) — sőt kell is, a
// generatív zenéhez és a hangfoszlányokhoz.

import { NAP_TICK, INSTABIL_HATAR } from '../mag/config.js';
import { HANGOK, AMBIENS, ZENE, ZENE_HANGNEMEK, KEVERES, TER, VALTOZAT_ALAP } from './hang_katalogus.js';
import { zengetoPuffer, puhaGorbe, panoramazo, terbe } from './hang_ter.js';

const TAU = Math.PI * 2;
/** Exponenciális rámpa nem mehet nulláig — ez a gyakorlati csend. */
const CSEND = 0.00012;
/** Alapértelmezett „egy megszólalás" a `jegyek` nélküli rétegeknek. */
const EGY_JEGY = [[0, 1]];

const kozott = (x, a, b) => (x < a ? a : x > b ? b : x);

export class Hang {
  constructor() {
    // A hangerő-beállítások MÁR MOST élnek, hogy a menü akkor is működjön,
    // ha a játékos még egy kattintást sem tett (nem lehet néma csúszka).
    this._hangero = KEVERES.mester;
    this._zeneHangero = KEVERES.zene;
    this._nemitva = false;
    this._elindult = false;

    this.ctx = null;
    this._offline = false;
    this._ideje = 0;
    this._elozoDuhos = 0;
    this._duhRata = 0;

    // Előre lefoglalt hangszálak: a `jelez()` sosem foglal tömböt.
    this._helyek = new Array(KEVERES.maxEgyloveses);
    for (let i = 0; i < this._helyek.length; i++) {
      this._helyek[i] = { aktiv: false, prio: 0, kezdet: 0, veg: 0, csucs: null, kimenet: [], forrasok: [] };
    }

    // ── TORLÓDÁS-NYILVÁNTARTÁS ────────────────────────────────────────────
    // Kódonként az utolsó megszólalás ideje. A kulcsok ELŐRE bekerülnek, hogy
    // a `jelez()` soha ne bővítsen objektumot — az rejtett osztályt váltana,
    // és pont a legsűrűbb pillanatban kényszerítene újrafordításra.
    this._utoljara = Object.create(null);
    for (const k of Object.keys(HANGOK)) this._utoljara[k] = -1e9;
    this._sorozatKezd = -1e9;
    this._sorozatDb = 0;

    // A duck (háttérhalkítás) legmélyebb aktív értéke és lejárata.
    this._duckVeg = 0;
    this._duckMelyseg = 0;

    // ── KAMERA ────────────────────────────────────────────────────────────
    // A térhatás ehhez viszonyít. A `fo.js` írja képkockánként; ha sosem
    // írja, minden hang középen marad — működik, csak nincs iránya.
    this._kam = { x: 0, z: 0, szog: 0, tav: 46 };
    /** Újrahasznált kimenet a `terbe()`-nek: a `jelez()` nem allokál. */
    this._ter = { pan: 0, tavolsag: 0 };

    // Elorzott kimenetek, amiket csak a rámpa lecsengése UTÁN kötünk le.
    this._temetoCsomopont = [];
    this._temetoMikor = [];

    // Újrahasznált beállítás-objektum a hangfoszlányokhoz: a `frissit()`
    // képkockánként fut, ott nem keletkezhet szemét.
    this._foszlanyOpciok = { hangolas: 1, hangero: 1, pan: 0 };

    // Zene-ütemezés (a kontextus órájához igazítva, indításkor töltjük).
    this._kovAkkord = 0;
    this._kovArp = 0;
    this._hangnem = ZENE_HANGNEMEK[ZENE_HANGNEMEK.length - 1];
  }

  // ════════════════════════════════════════════════════════════════════════
  //  INDÍTÁS
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Az első felhasználói gesztusra hívandó. Idempotens: nyugodtan rá lehet
   * kötni minden kattintásra — a második hívás csak a `resume()`-ot ismétli
   * meg, ami viszont kell, mert a böngésző fülváltáskor felfüggesztheti a
   * kontextust.
   *
   * ── MIÉRT LEHET KÍVÜLRŐL KONTEXTUST ADNI ────────────────────────────────
   * A hangot élőben nem lehet megmérni: az `AnalyserNode` valós időben
   * pásztáz, tehát a mért csúcs attól is függ, mikor futott le a szonda
   * ciklusa. Egy `OfflineAudioContext`-be viszont ugyanez a gráf BITRE
   * kiszámolható, és a kapott hullámformán már lehet FFT-t, csúcs/RMS-t,
   * levágást és sztereó-korrelációt mérni. Ez a paraméter az a varrat, ami
   * ezt megengedi — a játék sosem adja meg, mindig a saját kontextusát
   * építi.
   * @param {BaseAudioContext} [kulsoCtx] csak mérésre
   */
  inditas(kulsoCtx) {
    if (this._elindult) { this._folytat(); return; }
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!kulsoCtx && !AC) return;          // node, vagy nagyon régi böngésző
    this.ctx = kulsoCtx || new AC();
    /** Offline (mérő) kontextusban nincs mit „folytatni", és a resume() dob. */
    this._offline = typeof this.ctx.startRendering === 'function';

    this._zajFeher = this._zajPuffer(2.0, false);
    this._zajBarna = this._zajPuffer(3.0, true);

    this._keveroGraf();
    this._ambiensGraf();
    this._zeneGraf();

    this._elindult = true;
    this._kovAkkord = this.ctx.currentTime + 0.2;
    this._kovArp = this.ctx.currentTime + 4;
    this._folytat();
    this._mesterSzint(KEVERES.beuszas);
  }

  _folytat() {
    if (this._offline) return;
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  // ── KEVERŐ ──────────────────────────────────────────────────────────────
  //
  //   fxBusz  (egylövetű) ────────────────────────────────┐
  //   ambBusz  ──┐                                        │
  //   zeneBusz ──┴→ duck →┐                               ├→ mester
  //   zengeto → zengSzint ┴→ tompito (lowpass) ───────────┘
  //                                       mester → limiter → puhaVago → ki
  //
  // Négy döntés van ebben a rajzban, és mind a négy mérésből jött:
  //
  // A TOMPÍTÓ csak a folyamatos ágon van. Áramszünetben a világ legyen
  // fojtott — de a kattintás visszajelzése maradjon éles, különben a játékos
  // azt hiszi, a FELÜLET romlott el, nem az állomás.
  //
  // A DUCK az ambiens és a zene előtt van, az effekteken NINCS. Így egy
  // összeomlás lehalkítja a nyüzsgést, de nem halkítja le önmagát.
  //
  // A ZENGETŐ a duck UTÁN csatlakozik, tehát az esemény saját zengése nem
  // fullad bele a saját duckjába — a farok az, ami a teret elárulja.
  //
  // A PUHA VÁGÓ a limiter után van, utolsó védelemként. A limiternek
  // időállandója van; egyetlen minta alatt felépülő csúcsot nem tud elkapni.
  _keveroGraf() {
    const c = this.ctx;

    this.puhaVago = c.createWaveShaper();
    this.puhaVago.curve = puhaGorbe(KEVERES.vagoMinta, KEVERES.vagoHajlat);
    this.puhaVago.oversample = '2x';
    this.puhaVago.connect(c.destination);

    this.limiter = c.createDynamicsCompressor();
    this.limiter.threshold.value = KEVERES.limitKuszob;
    this.limiter.ratio.value = KEVERES.limitArany;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.22;
    this.limiter.connect(this.puhaVago);

    this.mester = c.createGain();
    this.mester.gain.value = CSEND;
    this.mester.connect(this.limiter);

    this.tompito = c.createBiquadFilter();
    this.tompito.type = 'lowpass';
    this.tompito.frequency.value = AMBIENS.aramszunet.tompitasKi;
    this.tompito.Q.value = 0.6;
    this.tompito.connect(this.mester);

    // A közös tér. Az impulzusválasz futásidőben készül — nincs hangfájl.
    this.zengeto = c.createConvolver();
    this.zengeto.normalize = false;
    this.zengeto.buffer = zengetoPuffer(c, TER);
    this.zengSzint = c.createGain();
    this.zengSzint.gain.value = TER.szint;
    this.zengeto.connect(this.zengSzint);
    this.zengSzint.connect(this.tompito);

    this.duck = c.createGain();
    this.duck.gain.value = 1;
    this.duck.connect(this.tompito);

    this.fxBusz = c.createGain();
    this.fxBusz.gain.value = KEVERES.effekt;
    this.fxBusz.connect(this.mester);

    this.ambBusz = c.createGain();
    this.ambBusz.gain.value = KEVERES.ambiens;
    this.ambBusz.connect(this.duck);

    // Az ambiens küldése a térre a DUCK ELŐTT ágazik le: a tömeg zengése
    // akkor is szól, amikor a tömeg maga le van halkítva. Ettől nem „kapcsol
    // ki" az állomás egy riasztás alatt, csak hátrébb lép.
    this.ambTer = c.createGain();
    this.ambTer.gain.value = TER.ambiensKuldes;
    this.ambBusz.connect(this.ambTer);
    this.ambTer.connect(this.zengeto);

    this.zeneBusz = c.createGain();
    this.zeneBusz.gain.value = this._zeneHangero;
    this.zeneBusz.connect(this.duck);
  }

  /**
   * Zajpuffer. A barna változat egy egypólusú aluláteresztővel „lassított"
   * fehér zaj — ez adja a morajt és a dörejt; a fehér a sziszegést. Két
   * külön puffer olcsóbb, mint minden zajrétegre külön szűrőt tenni.
   */
  _zajPuffer(mp, barna) {
    const c = this.ctx;
    const n = Math.floor(c.sampleRate * mp);
    const p = c.createBuffer(1, n, c.sampleRate);
    const d = p.getChannelData(0);
    let elozo = 0;
    for (let i = 0; i < n; i++) {
      const feher = Math.random() * 2 - 1;
      if (barna) {
        elozo = (elozo + 0.02 * feher) / 1.02;
        d[i] = elozo * 3.2;
      } else {
        d[i] = feher * 0.85;
      }
    }
    return p;
  }

  // ════════════════════════════════════════════════════════════════════════
  //  FOLYAMATOS RÉTEGEK — egyszer épülnek, utána csak modulálódnak
  // ════════════════════════════════════════════════════════════════════════

  _ambiensGraf() {
    const c = this.ctx, A = AMBIENS;

    // ── PORTÁLZÚGÁS ───────────────────────────────────────────────────────
    // Két elhangolt fűrész (lebegés) + egy oktávval mélyebb szinusz (test) +
    // egy hangolható felhang (a disszonancia hordozója). Mind egy közös
    // aluláteresztőn megy át, azt nyitja az instabilitás; a lüktetést egy
    // külön LFO adja, ami a hangerő-paraméterre van kötve — nem a JS-ből
    // moduláljuk, mert az képkocka-pontosságú lenne, és ropogna.
    const p = c.createGain();  p.gain.value = 0.62;     // lüktető fokozat
    const sz = c.createGain(); sz.gain.value = CSEND;   // szint (kapuszám)
    const f = c.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = A.portal.szuroMin; f.Q.value = A.portal.szuroQ;
    // A zúgás lassan vándorol a sztereó képben: a kapuk nem egy pontban
    // állnak, és egy percenként kétszer átsöprő mozgás pont annyi, hogy a
    // fül „élőnek" hallja, de tudatosan ne vegye észre.
    const ppan = panoramazo(c, 0);
    f.connect(p); p.connect(sz); sz.connect(ppan); ppan.connect(this.ambBusz);
    if (ppan.pan) {
      const plfo = c.createOscillator(); plfo.type = 'sine'; plfo.frequency.value = A.portal.panLfoHz;
      const plfoG = c.createGain(); plfoG.gain.value = A.portal.panMelyseg;
      plfo.connect(plfoG); plfoG.connect(ppan.pan); plfo.start();
    }

    const o1 = c.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = A.portal.alapF;
    const o2 = c.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = A.portal.alapF * A.portal.lebegtetes;
    const sub = c.createOscillator(); sub.type = 'sine'; sub.frequency.value = A.portal.alapF * 0.5;
    const subG = c.createGain(); subG.gain.value = 1.4;
    const dissz = c.createOscillator(); dissz.type = 'triangle';
    dissz.frequency.value = A.portal.alapF * A.portal.disszKonszonans * 2;
    const disszG = c.createGain(); disszG.gain.value = CSEND;
    o1.connect(f); o2.connect(f); sub.connect(subG); subG.connect(f);
    dissz.connect(disszG); disszG.connect(f);

    const lfo = c.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = A.portal.lfoMin;
    const lfoG = c.createGain(); lfoG.gain.value = A.portal.lfoMelysegMin;
    lfo.connect(lfoG); lfoG.connect(p.gain);

    o1.start(); o2.start(); sub.start(); dissz.start(); lfo.start();
    this._portal = { szint: sz, szuro: f, dissz, disszG, lfo, lfoG };

    // ── TÖMEGZAJ ──────────────────────────────────────────────────────────
    // KÉT forrásból, két oldalra panorámázva. Ugyanabból a zajpufferből
    // indulnak, de MÁS pontról — így a két csatorna nem korrelál, és a tömeg
    // körülvesz, ahelyett hogy egy hangfalból szólna. Egyetlen monó forrás
    // pontosan 1,000-es sztereó-korrelációt ad; ez volt a mért kiindulás.
    // A szint-szabályzó a panorámázók UTÁN van: így a két oldalnak külön
    // szűrője és külön zajforrása lehet (ez adja a dekorrelációt), miközben
    // a hangerőt továbbra is EGYETLEN csomópont mozgatja a `frissit()`-ben.
    const tg = c.createGain(); tg.gain.value = CSEND;
    tg.connect(this.ambBusz);
    const tszuro = [null, null];
    for (let o = 0; o < 2; o++) {
      const tf = c.createBiquadFilter();
      tf.type = 'bandpass'; tf.frequency.value = A.tomeg.szuroF; tf.Q.value = A.tomeg.szuroQ;
      const pan = panoramazo(c, o === 0 ? -A.tomeg.szelesseg : A.tomeg.szelesseg);
      tf.connect(pan); pan.connect(tg);
      const tsrc = c.createBufferSource();
      tsrc.buffer = this._zajFeher; tsrc.loop = true; tsrc.connect(tf);
      // Ugyanaz a puffer, de a MÁSIK feléről indítva: a két oldal így
      // független zajt hall. Egyetlen monó forrás két panorámázóra kötve nem
      // szélesít semmit — ugyanaz a jel érkezne mindkét oldalra.
      tsrc.start(0, o * this._zajFeher.duration * 0.5);
      tszuro[o] = tf;
    }
    this._tomeg = { szint: tg, szuro: tszuro };

    // ── LEVEGŐ ────────────────────────────────────────────────────────────
    // Alig hallható magas suhogás. Nem hangosít: KINYITJA a teret.
    const L = A.levego;
    const lg = c.createGain(); lg.gain.value = CSEND;
    lg.connect(this.ambBusz);
    for (let o = 0; o < 2; o++) {
      const lf = c.createBiquadFilter();
      lf.type = 'highpass'; lf.frequency.value = L.szuroF; lf.Q.value = L.szuroQ;
      const pan = panoramazo(c, o === 0 ? -L.szelesseg : L.szelesseg);
      lf.connect(pan); pan.connect(lg);
      const src = c.createBufferSource();
      src.buffer = this._zajFeher; src.loop = true; src.connect(lf);
      src.start(0, o * this._zajFeher.duration * 0.37);
    }
    this._levego = { szint: lg };

    // ── ELÉGEDETLENSÉG ────────────────────────────────────────────────────
    const mf = c.createBiquadFilter();
    mf.type = 'lowpass'; mf.frequency.value = A.elegedetlenseg.szuroF; mf.Q.value = A.elegedetlenseg.szuroQ;
    const mg = c.createGain(); mg.gain.value = CSEND;
    mf.connect(mg); mg.connect(this.ambBusz);
    const msrc = c.createBufferSource();
    msrc.buffer = this._zajBarna; msrc.loop = true; msrc.connect(mf); msrc.start();
    this._moraj = { szint: mg, szuro: mf };

    // ── ÁRAMSZÜNET-ZÜMMÖGÉS ───────────────────────────────────────────────
    // 50 Hz + felharmonikus, keskeny sávszűrőn: a fül ezt azonnal
    // „hálózat"-ként ismeri fel, nem hangszerként.
    const zf = c.createBiquadFilter();
    zf.type = 'bandpass'; zf.frequency.value = A.aramszunet.zummF * 2; zf.Q.value = A.aramszunet.zummQ;
    const zg = c.createGain(); zg.gain.value = CSEND;
    zf.connect(zg); zg.connect(this.ambBusz);
    const z1 = c.createOscillator(); z1.type = 'sawtooth'; z1.frequency.value = A.aramszunet.zummF;
    const z2 = c.createOscillator(); z2.type = 'sine'; z2.frequency.value = A.aramszunet.zummF * 2;
    const z2g = c.createGain(); z2g.gain.value = 0.5;
    z1.connect(zf); z2.connect(z2g); z2g.connect(zf);
    z1.start(); z2.start();
    this._zumm = { szint: zg };
  }

  _zeneGraf() {
    const c = this.ctx;
    const f = c.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = this._hangnem.szuroF; f.Q.value = 0.8;
    const g = c.createGain(); g.gain.value = CSEND;
    f.connect(g); g.connect(this.zeneBusz);

    // A pad hangjai VÉGIG szólnak; akkordváltáskor csak áthangolódnak. Így
    // nincs se újraindítás-kattanás, se csomópont-forgalom.
    const hangok = new Array(ZENE.padHangok);
    for (let i = 0; i < ZENE.padHangok; i++) {
      const o = c.createOscillator();
      o.type = ZENE.padHullam;
      o.frequency.value = this._hangnem.alapF;
      o.detune.value = (i - (ZENE.padHangok - 1) / 2) * ZENE.padElhangolas;
      const og = c.createGain();
      og.gain.value = 1 / ZENE.padHangok;
      // A négy pad-hang szétterítve. Egy unisono monó pad „szintetizátornak"
      // hallatszik; ugyanaz a négy hang a sztereó képben elosztva „térnek".
      // A szélső értékek szándékosan mérsékeltek: a zene ne vonja el a
      // figyelmet a hangoktól, amik a világ állapotát mondják.
      const pan = panoramazo(c, ((i / (ZENE.padHangok - 1)) * 2 - 1) * 0.55);
      o.connect(og); og.connect(pan); pan.connect(f);
      o.start();
      hangok[i] = o;
    }

    // Lassú „légzés" a szűrőn — egyetlen akkordon belül ez az egyetlen
    // mozgás, és pont ettől nem hangzik befagyottnak a pad.
    const lfo = c.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = ZENE.legzesHz;
    const lfoG = c.createGain(); lfoG.gain.value = this._hangnem.szuroF * ZENE.legzesMelyseg;
    lfo.connect(lfoG); lfoG.connect(f.frequency);
    lfo.start();

    this._zene = { szuro: f, szint: g, hangok, lfoG, cel: f };
  }

  // ════════════════════════════════════════════════════════════════════════
  //  HANGERŐ
  // ════════════════════════════════════════════════════════════════════════

  /** @param {number} x 0..1 mesterhangerő */
  hangero(x) {
    this._hangero = kozott(Number(x) || 0, 0, 1);
    this._mesterSzint(KEVERES.simitas);
  }

  /** @param {number} x 0..1 — a zene KÜLÖN halkítható az effektektől. */
  zeneHangero(x) {
    this._zeneHangero = kozott(Number(x) || 0, 0, 1);
    if (this._elindult) {
      this.zeneBusz.gain.setTargetAtTime(Math.max(CSEND, this._zeneHangero), this.ctx.currentTime, KEVERES.simitas);
    }
  }

  /** @param {boolean} be igaz = néma */
  nemit(be) {
    this._nemitva = !!be;
    this._mesterSzint(KEVERES.simitas);
  }

  _mesterSzint(ido) {
    if (!this._elindult) return;
    const cel = this._nemitva ? CSEND : Math.max(CSEND, this._hangero);
    this.mester.gain.setTargetAtTime(cel, this.ctx.currentTime, ido);
  }

  /** Igaz, ha tényleg szól valami: fut a kontextus és nincs lehalkítva. */
  get be() { return this._elindult && !this._nemitva && this._hangero > 0.001; }

  /** Igaz, ha az AudioContext létrejött (tehát volt már felhasználói gesztus). */
  get elindult() { return this._elindult; }

  // ════════════════════════════════════════════════════════════════════════
  //  EGYLÖVETŰ EFFEKTEK
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Egyszeri hang lejátszása a katalógusból.
   * @param {string} kod a `JELZES_KODOK` egyike
   * @param {{hangero?:number, hangolas?:number, keses?:number,
   *          pan?:number, x?:number, y?:number}} opciok
   *        hangero  0..1 szorzó (pl. a bevétel nagyságával)
   *        hangolas frekvencia-szorzó — a szűrőkre IS hat, hogy a hangszín
   *                 együtt mozogjon a magassággal
   *        keses    másodperc
   *        pan      −1..1 kézi panoráma (ha nincs világkoordináta)
   *        x, y     RÁCSKOORDINÁTA. Ha megvan, a hang a kamerához képest
   *                 szólal meg: a képernyő jobb oldalán történt esemény a
   *                 jobb fülben, a távoli halkabban és zengősebben.
   */
  jelez(kod, opciok = {}) {
    if (!this._elindult || this._nemitva || this._hangero <= 0.001) return;
    const h = HANGOK[kod];
    if (!h) return;
    this._takarit();

    const c = this.ctx;
    const t0 = c.currentTime + (opciok.keses || 0);

    // ── TORLÓDÁS: ugyanaz a hang nem szólhat kétszer egymás hegyén ────────
    // Hat kassza egyetlen képkockában nem hatszor hangosabb kassza, hanem
    // egy fésűszűrt reccsenés: azonos hullámformák néhány mintányi eltéréssel
    // kioltják egymás sávjait. A második kérést tehát nem halkítjuk, hanem
    // ELDOBJUK — a játékos úgysem tudná megkülönböztetni.
    const koz = h.torlodas == null ? KEVERES.torlodasAlap : h.torlodas;
    if (t0 - this._utoljara[kod] < koz) return;

    const hely = this._helyet(h.elsobbseg);
    if (!hely) return;                     // tele a keverő — ezt eldobjuk
    // Csak a MEGSZÓLALT hang számít: egy eldobott kérés nem némíthatja el a
    // következőt is.
    this._utoljara[kod] = t0;

    // ── VÁLTOZATOSSÁG ─────────────────────────────────────────────────────
    const V = h.valtozat || VALTOZAT_ALAP;
    const hangolas = (opciok.hangolas || 1) * (1 + (Math.random() * 2 - 1) * V.hangolas);
    let szint = h.hangero * (opciok.hangero == null ? 1 : opciok.hangero)
      * (1 + (Math.random() * 2 - 1) * V.hangero);

    // ── SOROZAT-CSILLAPÍTÁS ───────────────────────────────────────────────
    // n egyszerre induló, véletlen fázisú hang összege √n-szeres — nem
    // n-szeres. Az 1/√n szorzó tehát pont azt tartja szinten, amit a fül
    // hangosságnak hall, és közben megszünteti azt a csúcsot, ami a
    // levágásig vitte a keverőt. A 3. elsőbbség kimarad: a katasztrófát nem
    // halkíthatja le az, hogy közben tíz kattintás is elindult.
    if (t0 - this._sorozatKezd > KEVERES.sorozatAblak) { this._sorozatKezd = t0; this._sorozatDb = 0; }
    this._sorozatDb++;
    if (h.elsobbseg < 3 && this._sorozatDb > 1) {
      const cs = 1 / Math.sqrt(this._sorozatDb);
      szint *= cs < KEVERES.sorozatMin ? KEVERES.sorozatMin : cs;
    }

    // ── TÉRHATÁS ──────────────────────────────────────────────────────────
    let terKuld = h.ter == null ? 0.30 : h.ter;
    let pan = opciok.pan == null ? 0 : opciok.pan;
    if (opciok.x != null) {
      terbe(this._kam, opciok.x, opciok.y == null ? 0 : opciok.y, this._ter);
      pan = this._ter.pan;
      // A távolság kétféleképp hat, és a kettő EGYÜTT adja a mélységet:
      // halkul, ÉS arányaiban több zengést kap. Csak a halkítás „kicsi"
      // hangot csinálna, nem távolit.
      const kozel = KEVERES.tavFelezo / (KEVERES.tavFelezo + this._ter.tavolsag);
      szint *= kozel;
      terKuld *= 1 + TER.tavKuldes * (1 - kozel);
    }
    pan *= KEVERES.terSzelesseg;
    if (pan < -1) pan = -1; else if (pan > 1) pan = 1;

    const csucs = c.createGain();
    csucs.gain.value = 1;
    const pano = panoramazo(c, pan);
    csucs.connect(pano);
    pano.connect(this.fxBusz);

    hely.aktiv = true;
    hely.prio = h.elsobbseg;
    hely.kezdet = t0;
    hely.csucs = csucs;
    hely.forrasok.length = 0;
    hely.kimenet.length = 0;
    hely.kimenet.push(csucs, pano);

    // A zengető-küldés a panoráma ELŐTT ágazik le: a tér a saját sztereó
    // képét adja, azt nem kell még egyszer oldalra tolni.
    if (terKuld > 0.001) {
      const tg = c.createGain();
      tg.gain.value = terKuld;
      csucs.connect(tg);
      tg.connect(this.zengeto);
      hely.kimenet.push(tg);
    }

    let veg = t0;
    for (let i = 0; i < h.retegek.length; i++) {
      const v = this._reteget(h.retegek[i], csucs, t0, hangolas, szint, hely, V);
      if (v > veg) veg = v;
    }
    hely.veg = veg;
    this._duckol(h.elsobbseg, t0, veg - t0);
  }

  /**
   * A háttér lehalkítása egy fontos hang idejére.
   *
   * ── MIÉRT NEM HANGOSÍTUNK HELYETTE ────────────────────────────────────
   * Mérve: egy nyüzsgő, instabil állomáson a kapu-összeomlás riasztása
   * mindössze 0,8 dB-lel volt hangosabb a háttérnél — vagyis a játék
   * legfontosabb figyelmeztetése gyakorlatilag nem hallatszott. A kézenfekvő
   * válasz, hogy „legyen hangosabb az omlás", nem működik: a kimeneti
   * limiter pontosan azt húzza vissza, amivel az egészet feljebb tolnánk, és
   * közben a fanfárok is bántóvá válnának. Amit minden rádióadás csinál
   * ehelyett: a fontos jel alatt a HÁTTÉR halkul. Ugyanaz a dB-különbség,
   * fele akkora hangnyomással.
   */
  _duckol(prio, t0, hossz) {
    const m = prio >= 3 ? KEVERES.duckMagas : prio === 2 ? KEVERES.duckKozep : 0;
    if (m <= 0) return;
    const veg = t0 + hossz + KEVERES.duckFarok;
    // Egy halkabb duck nem szakíthatja félbe a mélyebbet: a fanfár alatt
    // beeső esemény nem hozhatja vissza a nyüzsgést.
    if (m < this._duckMelyseg && veg <= this._duckVeg) return;
    if (m > this._duckMelyseg) this._duckMelyseg = m;
    if (veg > this._duckVeg) this._duckVeg = veg;
    const g = this.duck.gain;
    g.cancelScheduledValues(t0);
    g.setTargetAtTime(1 - this._duckMelyseg, t0, KEVERES.duckBe);
    g.setTargetAtTime(1, this._duckVeg, KEVERES.duckKi);
  }

  /**
   * A kamera vízszintes állása — a térhatás ehhez viszonyít.
   * A `fo.js` hívja képkockánként a `szinter` adataiból. Ha sosem hívná,
   * minden hang középen szól: működik, csak nincs iránya.
   * @param {number} x a kamera célpontja rácskoordinátában
   * @param {number} z ugyanaz a másik tengelyen
   * @param {number} szog vízszintes forgás radiánban
   * @param {number} tav kameratávolság — ez adja a „mennyire látunk rá" léptéket
   */
  kamera(x, z, szog, tav) {
    this._kam.x = x; this._kam.z = z; this._kam.szog = szog; this._kam.tav = tav;
  }

  /** Egy réteg felépítése és ütemezése. @returns {number} mikor hallgat el */
  _reteget(r, cel, t0, hangolas, szint, hely, V) {
    const c = this.ctx;
    const jegyek = r.jegyek || EGY_JEGY;
    const hossz = r.hossz;
    let veg = t0;

    for (let i = 0; i < jegyek.length; i++) {
      // Mikro-időzítési szórás jegyenként. Egy fanfár, aminek a négy hangja
      // ezredmásodpercre pontosan egyforma távolságra van, GÉPNEK hangzik;
      // pár ezredmásodpercnyi ingás elég ahhoz, hogy játszottnak.
      const kezd = t0 + (r.keses || 0) + jegyek[i][0] + Math.random() * V.ido;
      const szorzo = jegyek[i][1] * hangolas;

      const g = c.createGain();
      g.connect(cel);

      let be = g;
      if (r.szuro) {
        const sz = c.createBiquadFilter();
        sz.type = r.szuro.fajta;
        sz.Q.value = r.szuro.q || 1;
        sz.frequency.setValueAtTime(kozott(r.szuro.f * szorzo, 20, 18000), kezd);
        if (r.szuro.fVeg) {
          sz.frequency.exponentialRampToValueAtTime(kozott(r.szuro.fVeg * szorzo, 20, 18000), kezd + hossz);
        }
        sz.connect(g);
        be = sz;
      }

      let forras;
      if (r.fajta === 'zaj') {
        forras = c.createBufferSource();
        forras.buffer = r.barna ? this._zajBarna : this._zajFeher;
        forras.loop = true;
        forras.playbackRate.value = kozott(szorzo, 0.25, 4);
        // Véletlen belépési pont: enélkül minden zajlöket UGYANONNAN indulna,
        // és a fül ezt egy ismétlődő minta gépiességeként hallaná meg.
        const ablak = Math.max(0, forras.buffer.duration - hossz - 0.5);
        forras.start(kezd, Math.random() * ablak);
      } else {
        forras = c.createOscillator();
        forras.type = r.hullam;
        if (r.elhangolas) forras.detune.value = r.elhangolas;
        const f0 = kozott(r.f * szorzo, 10, 18000);
        forras.frequency.setValueAtTime(f0, kezd);
        if (r.fVeg) {
          const f1 = kozott(r.fVeg * szorzo, 10, 18000);
          if (r.csuszas === 'lin') forras.frequency.linearRampToValueAtTime(f1, kezd + hossz);
          else forras.frequency.exponentialRampToValueAtTime(f1, kezd + hossz);
        }
        forras.start(kezd);
      }
      forras.connect(be);

      const v = this._burok(g.gain, kezd, r.burok, r.hangero * szint, hossz);
      forras.stop(v + 0.03);
      hely.forrasok.push(forras);
      if (v > veg) veg = v;
    }
    return veg;
  }

  /**
   * ADSR exponenciális rámpákkal. MINDEN hangerő-változás rámpa, sosem ugrás:
   * egy `setValueAtTime`-mal odatett érték kattan, és a kattanás pont az a
   * hiba, amitől az egész hangkép olcsónak hallatszik — az effektek minőségét
   * végül nem a hullámforma dönti el, hanem ez.
   * @returns {number} mikor ér véget az elengedés
   */
  _burok(param, kezd, b, csucs, hossz) {
    const cs = Math.max(CSEND * 2, csucs);
    const a = Math.max(0.0008, b.tamad);
    const l = Math.max(0.0008, b.lecseng);
    const s = Math.max(CSEND, cs * b.tart);
    const e = Math.max(0.005, b.elenged);
    param.setValueAtTime(CSEND, kezd);
    param.exponentialRampToValueAtTime(cs, kezd + a);
    param.exponentialRampToValueAtTime(s, kezd + a + l);
    const vk = kezd + Math.max(hossz, a + l);
    param.setValueAtTime(s, vk);
    param.exponentialRampToValueAtTime(CSEND, vk + e);
    return vk + e;
  }

  /** Lejárt hangszálak felszabadítása. Fix, 12 elemű kör — nem allokál. */
  _takarit() {
    const most = this.ctx.currentTime;
    // A duck lejárt: a mélységet nullázni kell, különben egy régen elhalt
    // fanfár mélysége örökre padlóként maradna az újabb, halkabb duckok alatt.
    if (this._duckMelyseg > 0 && most > this._duckVeg) { this._duckMelyseg = 0; this._duckVeg = 0; }
    for (let i = 0; i < this._helyek.length; i++) {
      const h = this._helyek[i];
      if (h.aktiv && h.veg + 0.06 < most) this._elenged(h);
    }
    // Az elorzott hangszálak kimeneti csomópontja még lecsengeti a rámpát;
    // csak UTÁNA szabad lekötni, különben a lopás pattanna egyet.
    for (let i = this._temetoMikor.length - 1; i >= 0; i--) {
      if (this._temetoMikor[i] > most) continue;
      try { this._temetoCsomopont[i].disconnect(); } catch (e) { /* már bontva */ }
      this._temetoCsomopont.splice(i, 1);
      this._temetoMikor.splice(i, 1);
    }
  }

  _elenged(h) {
    for (let i = 0; i < h.kimenet.length; i++) {
      try { h.kimenet[i].disconnect(); } catch (e) { /* már bontva */ }
    }
    for (let i = 0; i < h.forrasok.length; i++) {
      try { h.forrasok[i].disconnect(); } catch (e) { /* már bontva */ }
    }
    h.kimenet.length = 0;
    h.forrasok.length = 0;
    h.csucs = null;
    h.aktiv = false;
    h.prio = 0;
  }

  /**
   * Szabad hangszál keresése. Ha nincs, a LEGALACSONYABB elsőbbségű,
   * azon belül a legrégebbi hangot lopjuk el — de csak akkor, ha az újnak
   * tényleg nagyobb az elsőbbsége. Így egy kattintás-áradat sosem tudja
   * elnyomni az összeomlás-riasztást, viszont a riasztás sem hallgattatja el
   * végleg a felület visszajelzéseit.
   */
  _helyet(prio) {
    let aldozat = null;
    for (let i = 0; i < this._helyek.length; i++) {
      const h = this._helyek[i];
      if (!h.aktiv) return h;
      if (!aldozat || h.prio < aldozat.prio || (h.prio === aldozat.prio && h.kezdet < aldozat.kezdet)) aldozat = h;
    }
    if (aldozat && aldozat.prio < prio) {
      const most = this.ctx.currentTime;
      // Lopáskor is RÁMPÁZUNK: a hirtelen elvágott hang koppan.
      if (aldozat.csucs) {
        aldozat.csucs.gain.cancelScheduledValues(most);
        aldozat.csucs.gain.setTargetAtTime(CSEND, most, 0.008);
      }
      for (let i = 0; i < aldozat.forrasok.length; i++) {
        try { aldozat.forrasok[i].stop(most + 0.05); } catch (e) { /* már leállt */ }
      }
      for (let i = 0; i < aldozat.kimenet.length; i++) {
        this._temetoCsomopont.push(aldozat.kimenet[i]);
        this._temetoMikor.push(most + 0.25);
      }
      aldozat.forrasok.length = 0;
      aldozat.kimenet.length = 0;
      aldozat.csucs = null;
      aldozat.aktiv = false;
      return aldozat;
    }
    return null;
  }

  // ════════════════════════════════════════════════════════════════════════
  //  KÉPKOCKÁNKÉNTI HANGOLÁS
  // ════════════════════════════════════════════════════════════════════════

  /**
   * A folyamatos rétegek a sim állapotához igazítása. CSAK OLVAS a simből.
   *
   * Nulla allokáció: a ciklusok indexeltek, minden köztes érték szám, és a
   * hangfoszlány beállításai is egy újrahasznált objektumból mennek. A
   * tényleges hangolás nem képkockánként fut, hanem `KEVERES.frissitesHz`
   * ütemben — 60 Hz-en másodpercenként ezernél is több AudioParam-eseményt
   * ütemeznénk, ami se nem hallatszik, se nem ingyenes.
   *
   * @param {import('../sim/sim.js').Sim} sim
   * @param {number} dt másodperc
   */
  frissit(sim, dt) {
    if (!this._elindult || !sim) return;
    this._takarit();
    this._ideje += dt;
    const koz = 1 / KEVERES.frissitesHz;
    if (this._ideje < koz) return;
    const eltelt = this._ideje;
    this._ideje = 0;

    const c = this.ctx;
    const most = c.currentTime;
    const atmenet = KEVERES.ambiensSimitas;
    const A = AMBIENS;

    // ── MIT MOND A VILÁG ──────────────────────────────────────────────────
    let nyitott = 0;
    let instab = 0;
    const dimek = sim.dimenziok;
    for (let i = 0; i < dimek.length; i++) {
      const d = dimek[i];
      if (!d.nyitva) continue;
      nyitott++;
      if (d.instabilitas > instab) instab = d.instabilitas;
    }
    const feszultseg = kozott(instab / INSTABIL_HATAR, 0, 1);

    // Napszak: 0 = éjfél, 1 = dél. Nagyon lassú, alig észrevehető mozgás —
    // nem esemény, hanem az az érzés, hogy telik az idő.
    const fazis = (sim.tick % NAP_TICK) / NAP_TICK;
    const nappal = 0.5 - 0.5 * Math.cos(fazis * TAU);

    // ── PORTÁLZÚGÁS ───────────────────────────────────────────────────────
    const P = A.portal, p = this._portal;
    const kapuSzint = nyitott === 0
      ? CSEND
      : Math.min(P.szintMax, P.szintMin + Math.log(nyitott) * P.szintLepes * 2.2);
    p.szint.gain.setTargetAtTime(kapuSzint, most, atmenet);

    // A négyzetes görbe azért kell, hogy a 40 %-os instabilitás még ne
    // idegesítsen, a 80 %-os viszont már bántson: a veszélyt akkor kell
    // hallani, amikor tenni is lehet ellene, nem előbb.
    const nyitas = P.szuroMin + (P.szuroMax - P.szuroMin) * feszultseg * feszultseg
      + A.napszak.szinEjjel * (1 - nappal) * 0.4;
    p.szuro.frequency.setTargetAtTime(Math.max(90, nyitas), most, atmenet);

    p.lfo.frequency.setTargetAtTime(P.lfoMin + (P.lfoMax - P.lfoMin) * feszultseg, most, atmenet);
    p.lfoG.gain.setTargetAtTime(P.lfoMelysegMin + (P.lfoMelysegMax - P.lfoMelysegMin) * feszultseg, most, atmenet);

    // A felhang a kvintből a tritónusz felé csúszik, és közben hangosodik.
    const disszAr = feszultseg <= P.disszKuszob ? 0 : (feszultseg - P.disszKuszob) / (1 - P.disszKuszob);
    const arany = P.disszKonszonans + (P.disszDisszonans - P.disszKonszonans) * disszAr;
    p.dissz.frequency.setTargetAtTime(P.alapF * arany * 2, most, atmenet);
    p.disszG.gain.setTargetAtTime(Math.max(CSEND, disszAr * P.disszMax), most, atmenet);

    // ── TÖMEGZAJ ──────────────────────────────────────────────────────────
    const M = A.tomeg, t = this._tomeg;
    // Logaritmikus: 20 utas is hallható tömeg, 1000 utas mégsem fal.
    const tomottseg = kozott(Math.log(1 + sim.utasSzam) / Math.log(1 + M.viszony), 0, 1);
    const ejjeliSzorzo = A.napszak.tomegEjjel + (1 - A.napszak.tomegEjjel) * nappal;
    t.szint.gain.setTargetAtTime(Math.max(CSEND, tomottseg * M.szintMax * ejjeliSzorzo), most, atmenet);
    const tszuroF = Math.max(120, M.szuroF + (M.szuroFTeli - M.szuroF) * tomottseg + A.napszak.szinEjjel * (1 - nappal));
    // A két oldal szűrője KICSIT elhangolva jár együtt: a tökéletesen azonos
    // két oldal újra összeolvadna egy középső ponttá.
    t.szuro[0].frequency.setTargetAtTime(tszuroF * 0.94, most, atmenet);
    t.szuro[1].frequency.setTargetAtTime(tszuroF * 1.06, most, atmenet);

    // ── LEVEGŐ ────────────────────────────────────────────────────────────
    // A csarnok „nyitottsága" a tömeggel nő, de sosem sokkal: ez a réteg
    // nem hangosít, csak teret ad.
    this._levego.szint.gain.setTargetAtTime(
      Math.max(CSEND, A.levego.szintMax * (0.35 + 0.65 * tomottseg) * ejjeliSzorzo), most, atmenet,
    );

    // Hangfoszlányok: annál sűrűbben, minél többen vannak. Ez az egyetlen
    // hely, ahol a `frissit()` csomópontot hoz létre — másodpercenként
    // legfeljebb 2-3-at, és a hangszál-korlát ezt is fedezi.
    if (tomottseg > 0.05 && Math.random() < tomottseg * M.foszlanyEsely) {
      this._foszlanyOpciok.hangolas = M.foszlanyHangolasMin
        + Math.random() * (M.foszlanyHangolasMax - M.foszlanyHangolasMin);
      this._foszlanyOpciok.hangero = 0.5 + Math.random() * 0.7;
      // A tömeg körülvesz: minden foszlány máshonnan jön. Ez a legolcsóbb
      // mód arra, hogy ezer lény ne EGY hangfalból nyüzsögjön.
      this._foszlanyOpciok.pan = (Math.random() * 2 - 1) * M.foszlanySzelesseg;
      // Minden ötödik-hatodik foszlány valami egészen más: tíz FAJ jár itt,
      // és ha mind ugyanúgy mormog, az nem tömeg, hanem szellőzőrendszer.
      this.jelez(Math.random() < M.furcsaEsely ? 'foszlany_furcsa' : 'foszlany', this._foszlanyOpciok);
    }

    // ── ELÉGEDETLENSÉG ────────────────────────────────────────────────────
    // Két forrásból: a dühös távozók PILLANATNYI üteme (ez az akut baj) és a
    // tartósan alacsony hírnév (ez a krónikus). A rátát simítjuk, különben
    // egyetlen távozó is megrántaná a réteget.
    const E = A.elegedetlenseg;
    const ujDuhos = sim.duhosTavozok - this._elozoDuhos;
    this._elozoDuhos = sim.duhosTavozok;
    const pillanat = ujDuhos / Math.max(0.001, eltelt);
    this._duhRata += (pillanat - this._duhRata) * 0.25;
    const akut = kozott(this._duhRata / E.duhRata, 0, 1);
    const kronikus = kozott((E.hirnevKuszob - sim.hirnev) / E.hirnevKuszob, 0, 1);
    const rossz = kozott(akut * 0.65 + kronikus * 0.75, 0, 1);
    this._moraj.szint.gain.setTargetAtTime(Math.max(CSEND, rossz * E.szintMax), most, atmenet);
    this._moraj.szuro.frequency.setTargetAtTime(E.szuroF + rossz * 90, most, atmenet);

    // ── ÁRAMSZÜNET ────────────────────────────────────────────────────────
    const Z = A.aramszunet;
    this._zumm.szint.gain.setTargetAtTime(sim.aramszunet ? Z.szint : CSEND, most, 0.5);
    this.tompito.frequency.setTargetAtTime(sim.aramszunet ? Z.tompitasBe : Z.tompitasKi, most, 0.7);

    // ── ZENE ──────────────────────────────────────────────────────────────
    this._zenet(most, sim.hirnev, nappal);
  }

  /**
   * A generatív aláfestés ütemezése. Nem hangszerel: akkordot vált és néha
   * elejt egy hangot. Pont ez a sűrűség az, ami órák után sem fárad el —
   * egy megírt dallam a harmadik ismétlésnél idegesítő lenne, és a játékos a
   * ZENÉVEL EGYÜTT az effekteket is lekapcsolná.
   */
  _zenet(most, hirnev, nappal) {
    const z = this._zene;
    if (this._zeneHangero <= 0.001) {
      z.szint.gain.setTargetAtTime(CSEND, most, 0.4);
      return;
    }
    z.szint.gain.setTargetAtTime(ZENE.padSzint, most, 1.2);

    // Hangnem a hírnévből. A váltás a következő akkordnál lép életbe, nem
    // azonnal — így egy határon billegő hírnév nem kapcsolgat oda-vissza.
    let hn = ZENE_HANGNEMEK[ZENE_HANGNEMEK.length - 1];
    for (let i = 0; i < ZENE_HANGNEMEK.length; i++) {
      if (hirnev < ZENE_HANGNEMEK[i].hirnevAlatt) { hn = ZENE_HANGNEMEK[i]; break; }
    }

    if (most >= this._kovAkkord) {
      this._hangnem = hn;
      const l = hn.lepesek;
      const gyoker = Math.floor(Math.random() * 3) * 2;   // 1., 3. vagy 5. fok
      for (let i = 0; i < z.hangok.length; i++) {
        const lepes = l[(gyoker + i * 2) % l.length] + (gyoker + i * 2 >= l.length ? 12 : 0);
        const f = hn.alapF * Math.pow(2, lepes / 12);
        z.hangok[i].frequency.setTargetAtTime(f, most, ZENE.akkordCsuszas);
      }
      // Éjjel egy árnyalattal sötétebb — ugyanaz a hangnem, kevesebb fény.
      const feny = hn.szuroF * hn.fenyesseg * (0.82 + 0.18 * nappal);
      z.szuro.frequency.setTargetAtTime(feny, most, ZENE.akkordCsuszas);
      z.lfoG.gain.setTargetAtTime(feny * ZENE.legzesMelyseg, most, ZENE.akkordCsuszas);
      this._kovAkkord = most + ZENE.akkordHossz + Math.random() * ZENE.akkordSzoras;
    }

    if (most >= this._kovArp) {
      const l = this._hangnem.lepesek;
      const lepes = l[Math.floor(Math.random() * l.length)] + 12 * ZENE.arpOktav;
      this._arpeggio(this._hangnem.alapF * Math.pow(2, lepes / 12), most);
      this._kovArp = most + ZENE.arpKoz + Math.random() * ZENE.arpSzoras;
    }
  }

  /**
   * Egyetlen pengetett hang a zenei buszra. Külön úton megy, nem az effekt-
   * hangszálakon: egy kapu-összeomlás nem lophatja el a zene hangját, és a
   * zene sem foglalhat helyet az effektek elől.
   */
  _arpeggio(f, most) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = ZENE.arpHullam;
    o.frequency.value = f;
    const g = c.createGain();
    o.connect(g); g.connect(this.zeneBusz);
    const veg = this._burok(g.gain, most + 0.01, ZENE.arpBurok, ZENE.arpSzint, ZENE.arpHossz);
    o.start(most + 0.01);
    o.stop(veg + 0.05);
    o.onended = () => { try { g.disconnect(); } catch (e) { /* már bontva */ } };
  }
}
