// AGE OF THE CRYSTALS — HARCRENDSZER: életerő, páncéltípusok, ellensúlyok.
//
// ── MIÉRT MINDEN EGÉSZ SZÁMBAN ────────────────────────────────────────────
// Az életerő és a sebzés `Int32Array`. Ez ugyanaz a determinizmus-döntés, mint
// a gazdaságnál: a szorzós sebzés (2,2× a lándzsástól a lovagra) lebegőpontosan
// gépenként más maradékot hagyna, és egy egységnyi eltérés az életerőben azt
// dönti el, hogy egy katona TÚLÉL-e egy csapást. Onnan pedig már két különböző
// meccs fut a két gépen.
//
// A szorzókat SZÁZALÉKBAN tartjuk (egész), és a sebzés `(alap * szazalek) / 100`
// egész osztással. Nincs kerekítési szabadság, nincs motorfüggés.
//
// ── AZ ELLENSÚLY-HÁROMSZÖG ────────────────────────────────────────────────
// A műfaj alapja: lándzsás veri a lovagot, lovag veri az íjászt, íjász veri a
// lándzsást. Ezt NEM egységtípusok közti táblázat írja le, hanem TÁMADÁSTÍPUS ×
// PÁNCÉLTÍPUS — mert a v0.9-ben nyolc civilizáció jön egyedi egységekkel, és
// egy típus×típus tábla ott 64×64-esre nőne. Így egy új egység csak besorol egy
// meglévő támadás- és páncéltípusba, és az ellensúlyok maguktól működnek rá.
//
// ── AMIT A v0.4 ELSŐ KÖRE MÉG NEM CSINÁL ──────────────────────────────────
// A halott egység HELYE megmarad (nincs tömörítés, nincs slot-újrahasznosítás).
// Ez tudatos: az egység-INDEX a szimuláció legelterjedtebb hivatkozása
// (`celEgyseg`, munkás-célok, kijelölés, Ctrl-csoportok), és ha a halál
// átrendezné az indexeket, MINDEN ilyen hivatkozás csendben másra mutatna.
// A v0.5-ben, amikor egységet képezni is lehet, a slot-újrahasznosítás
// elkerülhetetlen lesz — akkor generációs számláló kell hozzá, hogy az elavult
// hivatkozás ELKAPHATÓ legyen, ne csak elromoljon.

import { TIPUS, ALLAPOT } from './units.js';
import { EPULET } from './epuletek.js';

/** Támadástípusok — ezekhez tartozik az ellensúly-tábla egy SORA. */
export const TAMADAS = { VAGO: 0, SZURO: 1, NYIL: 2, OSTROM: 3 };
/** Páncéltípusok — ezekhez tartozik egy OSZLOPA. */
export const PANCEL = { GYALOGOS: 0, TAVOLSAGI: 1, LOVAS: 2, EPULET: 3, OSTROM: 4 };

export const TAMADAS_NEV = ['vágó', 'szúró', 'nyíl', 'ostrom'];
export const PANCEL_NEV = ['gyalogos', 'távolsági', 'lovas', 'épület', 'ostrom'];

// ── EGYSÉG-ADATOK (index = `TIPUS.*`) ────────────────────────────────────
// MUNKAS · LANDZSAS · IJASZ · LOVAG · OSTROMGEP
//
// Az OSTROMGÉP a v0.4/6. Az adatsora egyetlen dolgot mond: falbontásra való,
// másra nem. 90 alapsebzés × 400 % épületre = 360 egy csapásra, viszont élő
// egység ellen a 70 %-os szorzó és a lassú ütem szinte használhatatlanná teszi.
// SAJÁT páncélosztálya van (`PANCEL.OSTROM`), és ez mért döntés: először az
// épületek oszlopát kapta, de ott minden szorzó 30-70 % (mert az épületnek
// 400-1200 életereje van), és így egy lovag 4 sebzéssel ütötte a 240 életerejű
// gépet — 48 MÁSODPERC egyetlen ostromgépre. Saját oszloppal a vágó 150 %-ot
// visz rá (15 sebzés, ~15 mp), a nyíl viszont csak 40 %-ot: az ostromgép fából
// van, nem húsból. Ellene KÖZELHARCOT kell küldeni, és pont ez a helye a
// kő-papír-ollóban.
const MAX_HP = [40, 55, 35, 100, 240];
const ALAP_SEBZES = [3, 6, 5, 10, 90];
const TAMADAS_TIPUS = [TAMADAS.VAGO, TAMADAS.SZURO, TAMADAS.NYIL, TAMADAS.VAGO, TAMADAS.OSTROM];
const PANCEL_TIPUS = [PANCEL.GYALOGOS, PANCEL.GYALOGOS, PANCEL.TAVOLSAGI, PANCEL.LOVAS, PANCEL.OSTROM];
/** Lapos páncél: ennyivel csökken MINDEN beérkező csapás (legalább 1 megy át). */
const PANCEL_ERTEK = [0, 1, 0, 2, 2];
/** Két csapás közti tickek. 20 tick = 1 másodperc. Az ostromgép LASSAN üt. */
const UTEM = [25, 15, 20, 16, 60];

/**
 * HATÓTÁVOLSÁG világegységben — eddig ér el az egység a célpontjához.
 *
 * ⚠️ EZT A `parancsallapot.js` IS OLVASSA: a célzás-réteg ebből tudja, mikor
 * álljon meg az üldöző egység. Ha a kettő elcsúszna, az íjász vagy odasétálna
 * a lándzsás orra elé (és meghalna), vagy megállna lőtávon kívül (és nem
 * csinálna semmit). Egy forrás, két olvasó.
 */
export const HATOTAV = [1.15, 1.45, 6.0, 1.25, 3.2];

/**
 * Távolsági-e? A távolsági egység nem azonnal sebez, hanem LÖVEDÉKET indít
 * (`lovedek.js`), aminek repülési ideje van. Ez nem látvány, hanem
 * játékmechanika: ettől lehet „túllőni" egy visszavonulót, és ezért éri meg a
 * lovasnak berohanni az íjászok közé.
 */
const TAVOLSAGI = [0, 0, 1, 0, 0];

// ── TORONY (v0.5/3) ──────────────────────────────────────────────────────
// A torony az EGYETLEN épület, ami magától lő. Hosszabb a hatótávja, mint az
// íjászé (8,0 vs 6,0) — ettől lesz értelme védműnek: a támadónak be kell
// mennie a tűzbe, hogy egyáltalán viszonozhassa.
const TORONY_HATOTAV = 8.0;
const TORONY_SEBZES = 6;
/** Két sortűz közti tickek. */
const TORONY_UTEM = 30;

/**
 * ELLENSÚLY-TÁBLA: `SZORZO[támadástípus][páncéltípus]` SZÁZALÉKBAN.
 *
 * A háromszög innen olvasható ki:
 *   szúró (lándzsás) → lovas páncél   220 %   ← a lándzsás felnyársalja a lovagot
 *   vágó  (lovag)    → távolsági      150 %   ← a lovag lerohanja az íjászt
 *   nyíl  (íjász)    → gyalogos       130 %   ← az íjász lelövi a lándzsást
 * és a visszairányok mind 100 % alatt vannak.
 */
const SZORZO = [
  // gyalogos, távolsági, lovas, épület, ostrom
  [100, 150, 100, 60, 150],   // VAGO
  [80, 90, 220, 40, 100],     // SZURO
  [130, 100, 70, 30, 40],     // NYIL
  // ⚠️ AZ ÉLŐ CELOK ELLEN SZÁNDÉKOSAN NEVETSÉGESEN GYENGE. Először 70 % volt,
  // és a 90-es alapsebzésből 62 lett — vagyis az ostromgép EGY csapásra megölt
  // egy lándzsást (55 életerő). A faltörő kos nem fegyver a gyalogság ellen; a
  // 6 %-kal 4 sebzést visz 3 másodpercenként, ami nagyjából nulla.
  [6, 6, 6, 400, 100],        // OSTROM
];

export class Harc {
  /**
   * @param {number} maxDb
   * @param {import('./sim.js').Sim} sim
   */
  constructor(maxDb, sim) {
    this.maxDb = maxDb | 0;
    this.sim = sim;
    const m = this.maxDb;

    this.hp = new Int32Array(m);
    this.maxHp = new Int32Array(m);
    /** 1 = él. A halott slot MEGMARAD (lásd a fejlécet). */
    this.elo = new Uint8Array(m);
    /** Hány tick múlva üthet legközelebb. */
    this.utemHatra = new Int32Array(m);

    /** Statisztika a jelentéseknek. */
    this.halottak = [0, 0];
    this.osszSebzes = [0, 0];
    /**
     * HALMOZOTT torony-sortűz csapatonként (v0.5/3). Szándékosan halmozott, nem
     * pillanatnyi: a v0.4 beszállásolásánál pont az bukott meg, hogy a
     * pillanatnyi szám nullát mutatott akkor is, amikor az ág lefutott.
     */
    this.toronySortuz = [0, 0];
    this.toronyNyil = [0, 0];
  }

  /** Teljes visszaállítás — a felállás hívja, a típusok ismeretében. */
  nullaz(db) {
    const e = this.sim.egysegek;
    this.hp.fill(0);
    this.maxHp.fill(0);
    this.elo.fill(0);
    this.utemHatra.fill(0);
    this.halottak[0] = 0; this.halottak[1] = 0;
    this.osszSebzes[0] = 0; this.osszSebzes[1] = 0;
    this.toronySortuz[0] = 0; this.toronySortuz[1] = 0;
    this.toronyNyil[0] = 0; this.toronyNyil[1] = 0;
    for (let i = 0; i < db; i++) {
      const t = e.tipus[i];
      this.maxHp[i] = MAX_HP[t];
      this.hp[i] = MAX_HP[t];
      this.elo[i] = 1;
      // Az ütem-számlálót a típusból ÉS az indexből toljuk el, hogy egy
      // összecsapás első csapásai ne EGYETLEN ticken záporozzanak. Ez nem
      // szépészet: az egyszerre leadott 800 csapás egy tickes tüskét csinálna.
      this.utemHatra[i] = i % UTEM[t];
    }
  }

  /** Él-e még? A célzás és a render is ezt kérdezi. */
  el(i) { return i >= 0 && i < this.maxDb && this.elo[i] === 1; }

  /**
   * EGY tick — a harcérintkezésben álló egységek ütnek.
   *
   * A `ParancsAllapot.lep()` UTÁN fut: az dönti el, kinek ki a célpontja és ki
   * van harcérintkezésben. Ez a réteg már csak a sebzést végzi el — így a
   * „kire támadok" és a „mennyit sebzek" kérdés nem keveredik össze.
   */
  lep() {
    const sim = this.sim;
    const e = sim.egysegek;
    const pa = sim.parancsAllapot;
    const db = e.db;

    for (let i = 0; i < db; i++) {
      if (this.elo[i] === 0) continue;
      if (this.utemHatra[i] > 0) this.utemHatra[i]--;

      if (e.allapot[i] !== ALLAPOT.HARCOL) continue;
      if (this.utemHatra[i] > 0) continue;

      const cel = pa.celEgyseg[i];
      if (cel < 0 || cel >= db || this.elo[cel] === 0) {
        // Nincs élő katona-célpont — üthet-e ÉPÜLETET? (v0.4)
        this._epuletUt(i);
        continue;
      }
      if (e.csapat[cel] === e.csapat[i]) continue;

      // Hatótávon belül van-e? Négyzetes összehasonlítás, gyökvonás nélkül.
      const t = e.tipus[i];
      const dx = e.px[cel] - e.px[i], dy = e.py[cel] - e.py[i];
      const hat = HATOTAV[t];
      if (dx * dx + dy * dy > hat * hat) continue;

      const seb = this.sebzesErtek(t, e.tipus[cel]);
      if (TAVOLSAGI[t]) {
        // A sebzés a KILÖVÉSKOR dől el, és a lövedék viszi magával — a
        // becsapódás így olcsó, és a szám nem változik meg út közben.
        this.sim.lovedekek.lo(e.px[i], e.py[i], cel, seb, e.csapat[i], e.generacio[cel]);
      } else {
        this.sebez(cel, seb, e.csapat[i]);
      }
      this.utemHatra[i] = UTEM[t];
    }

    this._tornyokLonek();
  }

  /**
   * A TORNYOK sortüze (v0.5/3).
   *
   * Minden benne álló egység EGGYEL több nyilat ad — ez váltja be a v0.4-ben
   * felírt adósságot, hogy a beszállásolás ne csak bújás legyen. A torony
   * MAGÁTÓL is lő egyet, tehát üresen sem haszontalan, csak gyenge.
   *
   * A célt a térbeli hasítótáblából keressük, ugyanazzal a döntetlen-szabállyal,
   * mint az egységeknél (kisebb index nyer). Tornyból kevés van, és a sortűz
   * 30 tickenként megy — a 9×9-es vödör-bejárás így elhanyagolható.
   */
  _tornyokLonek() {
    const sim = this.sim;
    const ep = sim.epuletek;
    for (let k = 0; k < ep.db; k++) {
      if (ep.tipus[k] !== EPULET.TORONY || !ep.kesz(k)) continue;
      if (ep.lovesHatra[k] > 0) { ep.lovesHatra[k]--; continue; }

      const cel = this._pontKeres(ep.x[k], ep.y[k], ep.csapat[k], TORONY_HATOTAV);
      if (cel < 0) continue;

      // 1 alap nyíl + a bent állók. A `letszam` a beszállásolás nyilvántartása.
      const nyilak = 1 + sim.beszallas.letszam[k];
      const e = sim.egysegek;
      const seb = ((TORONY_SEBZES * SZORZO[TAMADAS.NYIL][PANCEL_TIPUS[e.tipus[cel]]]) / 100) | 0;
      for (let n = 0; n < nyilak; n++) {
        sim.lovedekek.lo(ep.x[k], ep.y[k], cel, seb < 1 ? 1 : seb,
          ep.csapat[k], e.generacio[cel]);
      }
      ep.lovesHatra[k] = TORONY_UTEM;
      const cs = ep.csapat[k];
      if (cs < 2) { this.toronySortuz[cs]++; this.toronyNyil[cs] += nyilak; }
    }
  }

  /**
   * A legközelebbi ELLENSÉGES élő egység egy PONT körül. Az egység-alapú
   * kereséstől (`parancsallapot._keres`) az különbözteti meg, hogy nincs
   * „önmagam" kizárás — az épületnek nincs egység-indexe.
   * @returns {number} egység-index vagy -1
   */
  _pontKeres(x, y, csapat, sugar) {
    const e = this.sim.egysegek;
    const szel = e.hSzel, cm = e.hCella;
    const szam = e._hSzam, elem = e._hElem;
    let gx = (x / cm) | 0, gy = (y / cm) | 0;
    if (gx < 0) gx = 0; else if (gx >= szel) gx = szel - 1;
    if (gy < 0) gy = 0; else if (gy >= szel) gy = szel - 1;
    const gyuru = Math.ceil(sugar / cm) | 0;
    let legjobb = -1, legjobbD2 = sugar * sugar;
    for (let oy = -gyuru; oy <= gyuru; oy++) {
      const ny = gy + oy;
      if (ny < 0 || ny >= szel) continue;
      for (let ox = -gyuru; ox <= gyuru; ox++) {
        const nx = gx + ox;
        if (nx < 0 || nx >= szel) continue;
        const vodor = ny * szel + nx;
        for (let t = szam[vodor]; t < szam[vodor + 1]; t++) {
          const j = elem[t];
          if (e.csapat[j] === csapat) continue;
          const dx = e.px[j] - x, dy = e.py[j] - y;
          const d2 = dx * dx + dy * dy;
          if (d2 < legjobbD2 || (d2 === legjobbD2 && legjobb >= 0 && j < legjobb)) {
            legjobbD2 = d2; legjobb = j;
          }
        }
      }
    }
    return legjobb;
  }

  /**
   * Csapás az épület-célpontra, ha van és hatótávon belül van.
   *
   * A megközelítési (és így az ütési) távolság a hatótáv PLUSZ az épület fél
   * átmérője — ugyanaz a szabály, mint a `parancsallapot.js` közelítésénél. A
   * kettőnek egyeznie kell, különben az egység odaáll, de nem üt.
   */
  _epuletUt(i) {
    const sim = this.sim;
    const e = sim.egysegek;
    const ep = sim.epuletek;
    const cel = sim.parancsAllapot.celEpulet[i];
    if (cel < 0 || !ep.el(cel) || ep.csapat[cel] === e.csapat[i]) return;

    const t = e.tipus[i];
    const hat = HATOTAV[t] + 0.5 * ep.meret(cel) + 0.2;
    const dx = ep.x[cel] - e.px[i], dy = ep.y[cel] - e.py[i];
    if (dx * dx + dy * dy > hat * hat) return;

    // Az épület a PANCEL.EPULET oszlopba esik — itt fejti ki az ostrom-támadás
    // a 400 %-át, és itt bünteti a nyíl a 30 %-ával azt, aki íjásszal ostromol.
    const seb = this.sebzesEpuletre(t);
    // A beszállásolás VÉDELMET ad (a bent lévő nem célozható), és ennek ez az
    // ára: az épülettel a benne állók is odavesznek.
    if (ep.sebez(cel, seb)) sim.beszallas.epuletPusztult(cel);
    this.osszSebzes[e.csapat[i] & 1] += seb;
    this.utemHatra[i] = UTEM[t];
  }

  /** A csapás értéke ÉPÜLETRE. Az épületnek nincs lapos páncélja. */
  sebzesEpuletre(tamadoTipus) {
    const tt = TAMADAS_TIPUS[tamadoTipus];
    const seb = ((ALAP_SEBZES[tamadoTipus] * SZORZO[tt][PANCEL.EPULET]) / 100) | 0;
    return seb < 1 ? 1 : seb;
  }

  /**
   * A csapás ÉRTÉKE — páncél és ellensúly beszámítva, egészben.
   *
   * A sebzés MINDIG legalább 1: enélkül két erősen páncélozott egység a
   * végtelenségig ütné egymást nulla eredménnyel, és a játékos azt látná, hogy
   * a csata „megállt".
   *
   * Külön metódus, mert KÉT hívója van: a közelharc azonnal alkalmazza, a
   * távolsági viszont a kilövéskor számolja ki, és a lövedék viszi magával.
   * @param {number} tamadoTipus @param {number} celTipus
   * @returns {number} egész sebzés
   */
  sebzesErtek(tamadoTipus, celTipus) {
    const tt = TAMADAS_TIPUS[tamadoTipus];
    const pt = PANCEL_TIPUS[celTipus];
    // Egész osztás — nincs kerekítési szabadság, tehát gépfüggetlen.
    let seb = ((ALAP_SEBZES[tamadoTipus] * SZORZO[tt][pt]) / 100) | 0;
    seb -= PANCEL_ERTEK[celTipus];
    return seb < 1 ? 1 : seb;
  }

  /** A sebzés alkalmazása. A lövedék becsapódása is ide fut be. */
  sebez(cel, seb, tamadoCsapat) {
    if (cel < 0 || this.elo[cel] === 0) return;
    this.hp[cel] -= seb;
    this.osszSebzes[tamadoCsapat & 1] += seb;
    if (this.hp[cel] <= 0) this._meghal(cel);
  }

  /**
   * Halál. A slot megmarad, csak „kiürül": az egység nem mozog, nem üt, nem
   * kerül be a térbeli hasítótáblába (tehát nem lökdösi a többieket és nem is
   * célozható), és a render sem rajzolja ki.
   */
  _meghal(i) {
    const e = this.sim.egysegek;
    const sim = this.sim;
    this.elo[i] = 0;
    this.hp[i] = 0;
    e.allapot[i] = ALLAPOT.ALL;
    e.vx[i] = 0; e.vy[i] = 0;
    e.mezoId[i] = -1;
    sim.parancsAllapot.celEgyseg[i] = -1;
    // Ha munkás volt, a rakománya elvész vele — a gazdaság így is egyirányú
    // marad (nem teremtünk nyersanyagot, csak nem érkezik meg).
    if (e.tipus[i] === TIPUS.MUNKAS) sim.munkasok.elenged(i);
    this.halottak[e.csapat[i] & 1]++;
    // v0.5: a slot felszabadul és a GENERÁCIÓ lép — ettől a pillanattól minden
    // rá mutató hivatkozás (célpont, lövedék, kijelölés) elavult, és a
    // `ervenyes()` el is kapja.
    e.felszabadit(i);
  }

  /**
   * Egy ÚJ egység harc-állapota (v0.5). A `nullaz()` az egész seregre megy;
   * ez egyetlen frissen kiképzett vagy újrahasznosított slotra.
   */
  szuletik(i) {
    const t = this.sim.egysegek.tipus[i];
    this.maxHp[i] = MAX_HP[t];
    this.hp[i] = MAX_HP[t];
    this.elo[i] = 1;
    this.utemHatra[i] = i % UTEM[t];
  }

  /** Élő létszám csapatonként — a jelentésekhez és a HUD-hoz. */
  osszesites() {
    const e = this.sim.egysegek;
    const elo = [0, 0];
    for (let i = 0; i < e.db; i++) if (this.elo[i]) elo[e.csapat[i] & 1]++;
    return { elo, halottak: this.halottak.slice(), sebzes: this.osszSebzes.slice() };
  }
}
