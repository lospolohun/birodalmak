// PORTAL HUB TYCOON — HATÁSOK (RÉSZECSKÉK).
//
// ── MIÉRT VAN EZ A FÁJL ───────────────────────────────────────────────────
// A v0.4-ig az állomás NÉMÁN termelt. A HUD mutatta, hogy nő a pénz, a panel
// mutatta, hogy egy bolt 312 utast szolgált ki — de a KÉPEN semmi nem árulta
// el, melyik ház dolgozik és melyik áll üresen. A játékos így a képernyő
// helyett a táblázatokat nézte, pedig a tycoon lényege pont az, hogy a
// működést LÁTNI lehessen.
//
// Négy dolgot mutat meg, mind olyat, ami eddig csak számként létezett:
//   • érkezés-villanás   — a kapu épp KIADOTT egy utast (a forgalom üteme),
//   • portál-örvény      — az instabilitás sűrűsödő szikraként (a veszély),
//   • kiszolgálás-jel    — MELYIK üzlet keresett most pénzt (a haszon),
//   • esemény/összeomlás — most történt valami, ott (a baj).
//
// ── EGY POINTS, ELŐRE LEFOGLALT KERETTEL ──────────────────────────────────
// Minden szikra ugyanannak az egyetlen `THREE.Points`-nak egy sora: egyetlen
// rajzolási hívás, akárhány hatás fut. A részecskeadatok előre lefoglalt
// típusos tömbök, a halott sor helyére az utolsó élő kerül (csere-törlés),
// tehát futás közben NULLA allokáció van — se tömb, se objektum, se `Vector3`.
// Ha a keret betelik, az új szikra ELVÉSZ, és nem nő a puffer: a látvány
// romlása mindig jobb, mint egy csúcsforgalomban meginduló újrafoglalás.
//
// ── AMI TILOS ─────────────────────────────────────────────────────────────
// A hatásréteg CSAK OLVASSA a simet, és SOHA nem hívja a `sim.rnd`-t: ha a
// díszítés fogyasztana a világ véletlenéből, két gép (vagy két képkockaszám!)
// más világot kapna, és a mentés-visszajátszás azonnal elromlana. Saját,
// fix seeddel indított generátorunk van — ez a különbség nem stílus, hanem
// az egész determinizmus-ígéret gerince.

import * as THREE from 'three';
import { SZINT_MAGASSAG, INSTABIL_HATAR } from '../mag/config.js';
import { EPULETEK } from '../sim/epuletek.js';
import { DIMENZIOK } from '../sim/dimenziok.js';
import { mulberry32 } from '../mag/rng.js';

/** Ennyi szikra élhet egyszerre. 1600 utasnál mérve ~250 a csúcs. */
const KERET = 1800;
/** Egy képkockában legfeljebb ennyi új szikra születhet. */
const KVOTA = 260;
const TAU = Math.PI * 2;

export class Hatasok3d {
  /**
   * @param {import('./szinter.js').Szinter} szinter
   * @param {object} sim  CSAK olvassuk
   */
  constructor(szinter, sim) {
    this.szinter = szinter;
    this.sim = sim;
    /** A hívó állíthatja: efölött nem rajzolunk hatást (lásd a `fo.js` bekötést). */
    this.aktivSzint = 0;

    this.keret = KERET;
    /** Élő szikrák száma. A szonda ezt méri a keret ellen. */
    this.db = 0;
    /** Hányszor esett ki szikra keretszűke miatt — diagnosztika, nem hiba. */
    this.eldobott = 0;

    // ── RÉSZECSKE-TÁROLÓ ──────────────────────────────────────────────────
    // A `poz`, `szin`, `meret` és `alfa` EGYBEN a geometria attribútumai és a
    // szimuláció állapota. Nincs másolás a kettő közt: ami a fizikában mozdul,
    // az már a GPU-nak szánt pufferben mozdul.
    this.poz = new Float32Array(KERET * 3);
    this.szin = new Float32Array(KERET * 3);
    this.meret = new Float32Array(KERET);
    this.alfa = new Float32Array(KERET);
    this._seb = new Float32Array(KERET * 3);
    this._elet = new Float32Array(KERET);
    this._eletTeljes = new Float32Array(KERET);
    this._alapMeret = new Float32Array(KERET);
    this._gravi = new Float32Array(KERET);
    this._huzas = new Float32Array(KERET);

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.poz, 3));
    g.setAttribute('szikraSzin', new THREE.BufferAttribute(this.szin, 3));
    g.setAttribute('szikraMeret', new THREE.BufferAttribute(this.meret, 1));
    g.setAttribute('szikraAlfa', new THREE.BufferAttribute(this.alfa, 1));
    g.setDrawRange(0, 0);
    this.geometria = g;

    // Saját shader, mert a `PointsMaterial` nem tud PONTONKÉNTI méretet és
    // átlátszóságot — márpedig a kihunyó szikra pont attól szikra, hogy
    // egyszerre zsugorodik és halványul. Külső könyvtár nélkül, húsz sorban.
    this.anyag = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute vec3 szikraSzin;
        attribute float szikraMeret;
        attribute float szikraAlfa;
        varying vec3 vSzin;
        varying float vAlfa;
        void main() {
          vSzin = szikraSzin;
          vAlfa = szikraAlfa;
          vec4 nezet = modelViewMatrix * vec4(position, 1.0);
          // A 620-as szorzót MÉRÉS állította be: 320-nál egy szikra a szokásos
          // 44 egységes kameratávolságból két képpont alatt maradt, vagyis a
          // hatások formálisan futottak, de a képen nem voltak ott. 760 viszont
          // közeli kamerával már összemosott fehér foltot adott a kapu előtt.
          gl_PointSize = szikraMeret * (620.0 / max(1.0, -nezet.z));
          gl_Position = projectionMatrix * nezet;
        }`,
      fragmentShader: `
        varying vec3 vSzin;
        varying float vAlfa;
        void main() {
          vec2 d = gl_PointCoord - vec2(0.5);
          float r2 = dot(d, d);
          if (r2 > 0.25) discard;
          gl_FragColor = vec4(vSzin, vAlfa * (1.0 - r2 * 4.0));
          #include <colorspace_fragment>
        }`,
    });

    this.pontok = new THREE.Points(g, this.anyag);
    this.pontok.frustumCulled = false;   // a szikrák szórtak, a doboz értelmetlen
    this.pontok.renderOrder = 8;
    szinter.jelenet.add(this.pontok);

    // ── FIGYELŐK ──────────────────────────────────────────────────────────
    // A hatás mindig egy SZÁM NÖVEKMÉNYÉBŐL születik, nem eseményből: a sim
    // nem küld jelzéseket, és nem is fog — a render dolga megnézni, mi
    // változott. Ez egyben azt is jelenti, hogy a réteg bármikor bekapcsolható
    // menet közben (a szonda ezt csinálja), csak az első képkockán nem villan.
    const dn = DIMENZIOK.length;
    this._dimUtas = new Int32Array(dn);
    this._dimUj = new Int32Array(dn);
    this._dimSzunet = new Uint8Array(dn);
    this._dimOmlas = new Uint8Array(dn);
    this._epKiszolgalt = new Int32Array(256);
    this._epAkku = new Float32Array(256);
    this._esemenySzam = -1;
    this._elsoKor = true;

    // Saját véletlen, FIX seeddel. Nem a `sim.rnd` — lásd a fejlécet.
    this._rnd = mulberry32(0x9b6bff);
    this._sz = new THREE.Color();
  }

  // ── KÉPKOCKÁNKÉNT ───────────────────────────────────────────────────────

  /**
   * @param {number} ido eltelt idő másodpercben (folytonos, a lengésekhez)
   * @param {number} dt  az előző képkocka óta eltelt idő másodpercben
   */
  frissit(ido, dt) {
    // A `dt` felülről vágva: egy háttérbe tett fül visszatéréskor akár
    // másodperces képkockát ad, és a szikrák egyetlen lépésben a semmibe
    // repülnének — a hatás helyett egy rándulás látszana.
    const d = dt > 0.05 ? 0.05 : (dt > 0 ? dt : 0);
    this._kvota = KVOTA;
    this._lep(d);
    this._figyel(d, ido);
    this._feltolt();
  }

  /** Mozgatás, öregedés, csere-törlés. Ez a rész a keret méretével arányos. */
  _lep(dt) {
    const poz = this.poz, seb = this._seb, elet = this._elet, teljes = this._eletTeljes;
    let n = this.db;
    for (let i = 0; i < n; i++) {
      const e = elet[i] - dt;
      if (e <= 0) {
        // Csere-törlés: az utolsó élő sor ide költözik. Így a tömbök elején
        // mindig tömör az élő halmaz, tehát a `setDrawRange` egyetlen sávot ad.
        n--;
        if (i !== n) this._masol(n, i);
        i--;
        continue;
      }
      elet[i] = e;
      const i3 = i * 3;
      poz[i3] += seb[i3] * dt;
      poz[i3 + 1] += seb[i3 + 1] * dt;
      poz[i3 + 2] += seb[i3 + 2] * dt;
      seb[i3 + 1] += this._gravi[i] * dt;
      const h = 1 - this._huzas[i] * dt;
      const hu = h < 0 ? 0 : h;
      seb[i3] *= hu; seb[i3 + 1] *= hu; seb[i3 + 2] *= hu;
      // Az élet utolsó harmadában halványul és zsugorodik — a hirtelen eltűnő
      // szikra pattogásnak látszik, nem kialvásnak.
      const arany = e / teljes[i];
      this.alfa[i] = arany > 0.55 ? 1 : arany / 0.55;
      this.meret[i] = this._alapMeret[i] * (0.35 + 0.65 * arany);
    }
    this.db = n;
  }

  _masol(honnan, hova) {
    const h3 = honnan * 3, c3 = hova * 3;
    this.poz[c3] = this.poz[h3]; this.poz[c3 + 1] = this.poz[h3 + 1]; this.poz[c3 + 2] = this.poz[h3 + 2];
    this.szin[c3] = this.szin[h3]; this.szin[c3 + 1] = this.szin[h3 + 1]; this.szin[c3 + 2] = this.szin[h3 + 2];
    this._seb[c3] = this._seb[h3]; this._seb[c3 + 1] = this._seb[h3 + 1]; this._seb[c3 + 2] = this._seb[h3 + 2];
    this.meret[hova] = this.meret[honnan];
    this.alfa[hova] = this.alfa[honnan];
    this._elet[hova] = this._elet[honnan];
    this._eletTeljes[hova] = this._eletTeljes[honnan];
    this._alapMeret[hova] = this._alapMeret[honnan];
    this._gravi[hova] = this._gravi[honnan];
    this._huzas[hova] = this._huzas[honnan];
  }

  _feltolt() {
    const a = this.geometria.attributes;
    a.position.needsUpdate = true;
    a.szikraSzin.needsUpdate = true;
    a.szikraMeret.needsUpdate = true;
    a.szikraAlfa.needsUpdate = true;
    this.geometria.setDrawRange(0, this.db);
  }

  /**
   * Egy szikra születése. A `szinHex` sRGB — a `THREE.Color` konvertálja
   * lineárisra, a shader végén a `colorspace_fragment` alakítja vissza.
   * @returns {boolean} sikerült-e (keret és kvóta)
   */
  szikra(x, y, z, vx, vy, vz, szinHex, meret, elet, gravi = -1.4, huzas = 1.1) {
    if (this.db >= this.keret || this._kvota <= 0) { this.eldobott++; return false; }
    // NaN-védelem a HATÁRON: ha egy sim-érték valaha értelmetlen lenne, itt áll
    // meg, és nem a GPU-pufferben — egyetlen NaN pozíció az EGÉSZ Points-t
    // eltünteti, és órákig kereshetnénk, melyik hatás rontotta el.
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return false;
    const i = this.db++;
    this._kvota--;
    const i3 = i * 3;
    this.poz[i3] = x; this.poz[i3 + 1] = y; this.poz[i3 + 2] = z;
    this._seb[i3] = vx; this._seb[i3 + 1] = vy; this._seb[i3 + 2] = vz;
    this._sz.setHex(szinHex);
    this.szin[i3] = this._sz.r; this.szin[i3 + 1] = this._sz.g; this.szin[i3 + 2] = this._sz.b;
    this.meret[i] = meret;
    this._alapMeret[i] = meret;
    this.alfa[i] = 1;
    this._elet[i] = elet;
    this._eletTeljes[i] = elet;
    this._gravi[i] = gravi;
    this._huzas[i] = huzas;
    return true;
  }

  // ── A SIM FIGYELÉSE ─────────────────────────────────────────────────────

  // Az ELSŐ kör csak horgonyt vesz, és nem szül semmit. Enélkül egy 17. napi
  // mentés betöltésekor egyszerre robbanna ki több ezer kiszolgálás-jel —
  // pontosan az a „minden villog egyszerre" hatás, amitől a visszajelzés
  // használhatatlanná válik. Ugyanez véd a menet közbeni bekapcsolástól is.
  _figyel(dt, ido) {
    this._dimeket();
    this._epuleteket(dt, ido);
    this._esemenyeket();
    this._elsoKor = false;
  }

  /** Dimenziónkénti növekmények: hány utas jött, és omlott-e össze a kapu. */
  _dimeket() {
    const d = this.sim.dimenziok;
    for (let i = 0; i < d.length && i < this._dimUtas.length; i++) {
      const uj = d[i].osszUtas - this._dimUtas[i];
      this._dimUtas[i] = d[i].osszUtas;
      this._dimUj[i] = (this._elsoKor || uj < 0) ? 0 : uj;
      const sz = d[i].szunet > 0 ? 1 : 0;
      this._dimOmlas[i] = (!this._elsoKor && sz === 1 && this._dimSzunet[i] === 0) ? 1 : 0;
      this._dimSzunet[i] = sz;
    }
  }

  _epuletKeret(kell) {
    if (kell <= this._epKiszolgalt.length) return;
    let uj = this._epKiszolgalt.length;
    while (uj < kell) uj *= 2;
    const k = new Int32Array(uj); k.set(this._epKiszolgalt); this._epKiszolgalt = k;
    const a = new Float32Array(uj); a.set(this._epAkku); this._epAkku = a;
  }

  _epuleteket(dt, ido) {
    const sim = this.sim;
    const lista = sim.epuletek;
    this._epuletKeret(lista.length);
    const rnd = this._rnd;

    for (let i = 0; i < lista.length; i++) {
      const ep = lista[i];
      if (!ep) continue;
      if (ep.z > this.aktivSzint) continue;
      const t = EPULETEK[ep.tipusIdx];
      const kx = ep.x + ep.sz * 0.5;
      const kz = ep.y + ep.m * 0.5;
      const ky = ep.z * SZINT_MAGASSAG;

      if (ep.kod === 'portal') {
        this._portalt(ep, kx, ky, kz, dt, ido, rnd);
        continue;
      }

      // ── KISZOLGÁLÁS-VISSZAJELZÉS ────────────────────────────────────────
      // EZ a fájl legfontosabb hatása: eddig semmi nem mutatta, melyik üzlet
      // termel. Egy apró arany jel az épület fölött minden fizetésnél — ha
      // egy ház fölött nem száll semmi, az a ház nem keres.
      const uj = ep.kiszolgalt - this._epKiszolgalt[i];
      this._epKiszolgalt[i] = ep.kiszolgalt;
      if (this._elsoKor || uj <= 0) continue;
      const db = uj > 3 ? 3 : uj;
      // Ingyenes szolgáltatásnál (váró, info) hűvös jel: ott nem pénz
      // keletkezett, hanem türelem — a kettőt nem szabad összemosni.
      const szin = t.dij > 0 ? 0xffd166 : 0x7fd8ff;
      const teto = ky + (t.magas || 1.4) + 0.35;
      for (let k = 0; k < db; k++) {
        const sz = (rnd() - 0.5) * ep.sz * 0.7;
        const sm = (rnd() - 0.5) * ep.m * 0.7;
        this.szikra(kx + sz, teto, kz + sm, 0, 1.5 + rnd() * 0.7, 0, szin, 0.30, 0.9, 0.4, 0.6);
      }
    }
  }

  /**
   * A kapu két hatása. Az örvény FOLYAMATOS és az instabilitással sűrűsödik —
   * ez az egyetlen olyan jel a képen, ami akkor is figyelmeztet, ha a HUD-ot
   * épp nem nézi senki. Az érkezés-villanás ehhez képest esemény: egy utas
   * KILÉPETT, és ezt a kapu előtti szikrakör mondja el.
   */
  _portalt(ep, kx, ky, kz, dt, ido, rnd) {
    const di = ep.dimenzio;
    const all = di >= 0 ? this.sim.dimenziok[di] : null;
    const alap = di >= 0 ? DIMENZIOK[di].szin : 0x8f8fb0;
    const inst = all ? Math.min(1, all.instabilitas / INSTABIL_HATAR) : 0;
    const mukodik = !!all && all.szunet === 0 && !ep.kikapcsolva && all.nyitva;
    const kozepY = ky + 1.75;

    // ── ÖRVÉNY ───────────────────────────────────────────────────────────
    if (mukodik) {
      const i = ep.azon >= 0 && ep.azon < this._epAkku.length ? ep.azon : -1;
      if (i >= 0) {
        // Az ütem MÉRÉSSEL állt be: 5/mp mellett egyszerre 3-4 szikra élt egy
        // kapu körül, ami képernyőképen és mozgásban is a semmivel egyenlő.
        // 14-nél a nyugodt kapu is „jár", és az instabilitás sűrűsödése
        // (14 → 54/mp) tényleg érzékelhető változás, nem árnyalat.
        this._epAkku[i] += dt * (14 + inst * 40);
        while (this._epAkku[i] >= 1) {
          this._epAkku[i] -= 1;
          const a = rnd() * TAU;
          const r = 1.05 + rnd() * 0.35;
          // Érintőleges sebesség: a szikra a gyűrű mentén sodródik, nem
          // szétrepül. Ettől látszik, hogy ÖRVÉNY, és nem robbanás.
          const s = 0.9 + inst * 2.6;
          this.szikra(
            kx + Math.cos(a) * r, kozepY + (rnd() - 0.5) * 1.5, kz + Math.sin(a) * r,
            -Math.sin(a) * s, 0.25 + rnd() * 0.4, Math.cos(a) * s,
            inst > 0.6 ? 0xff5540 : alap, 0.22 + inst * 0.16, 0.6 + rnd() * 0.4, 0.2, 0.8,
          );
        }
      }
    }

    // ── ÉRKEZÉS-VILLANÁS ─────────────────────────────────────────────────
    // A növekményt a DIMENZIÓ tartja, ezért itt elfogyasztjuk: ha ugyanarra a
    // világra több kapu is áll, ne villanjon mindegyik ugyanattól az utastól.
    if (di >= 0 && this._dimUj[di] > 0) {
      const n = this._dimUj[di] > 2 ? 2 : this._dimUj[di];
      this._dimUj[di] = 0;
      for (let v = 0; v < n; v++) {
        for (let k = 0; k < 11; k++) {
          const a = (k / 11) * TAU + rnd() * 0.4;
          this.szikra(
            kx + Math.cos(a) * 0.3, kozepY + (rnd() - 0.5) * 0.5, kz + Math.sin(a) * 0.3,
            Math.cos(a) * 2.6, 0.6 + rnd() * 1.2, Math.sin(a) * 2.6,
            0xffffff, 0.28, 0.5 + rnd() * 0.22, -1.2, 2.4,
          );
        }
      }
    }

    // ── ÖSSZEOMLÁS ───────────────────────────────────────────────────────
    if (di >= 0 && this._dimOmlas[di]) {
      for (let k = 0; k < 90; k++) {
        const a = rnd() * TAU;
        const m = rnd() * 2 - 1;
        const s = 4 + rnd() * 7;
        this.szikra(
          kx, kozepY, kz,
          Math.cos(a) * s, m * s * 0.7 + 2, Math.sin(a) * s,
          k & 1 ? 0xff3a2a : 0xffb060, 0.44, 0.9 + rnd() * 0.6, -3.4, 0.7,
        );
      }
    }
  }

  /**
   * Esemény-jelzés. Az esemény nem egy helyhez kötődik (időzuhatag, sztrájk,
   * ellenőrzés), ezért a csarnok fölött szól — ott, ahová a kamera amúgy néz.
   */
  _esemenyeket() {
    const sim = this.sim;
    const n = sim.aktivEsemenyek.length;
    if (this._esemenySzam < 0 || this._elsoKor) { this._esemenySzam = n; return; }
    if (n <= this._esemenySzam) { this._esemenySzam = n; return; }
    this._esemenySzam = n;
    const rnd = this._rnd;
    const cx = sim.kezdoX + 11, cz = sim.kezdoY + 8;
    for (let k = 0; k < 70; k++) {
      const a = rnd() * TAU;
      const r = rnd() * 9;
      this.szikra(
        cx + Math.cos(a) * r, 1 + rnd() * 2, cz + Math.sin(a) * r,
        Math.cos(a) * 0.6, 5 + rnd() * 4, Math.sin(a) * 0.6,
        0xffc247, 0.40, 1.1 + rnd() * 0.7, -1.6, 0.5,
      );
    }
  }
}
