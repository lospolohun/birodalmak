// PORTAL HUB TYCOON — AZ ÁLLOMÁS RÁCSA.
//
// ── MIÉRT VAN EZ A FÁJL ───────────────────────────────────────────────────
// Az állomás nem szabad térkép, hanem cellarács. Ez nem a kényelem miatt van:
// az útkeresés, a torlódás és az épület-lerakás MIND ugyanazt a rácsot kell
// hogy lássa. Ha a render szabadon rakná le a boltot és a sim máshová
// gondolná, a vendégek a falnak sétálnának — a TELEPESEK-nél ez volt az első
// olyan hiba, amit két rétegen át kellett visszakövetni.
//
// A rács tipizált tömbökből áll, nem cella-objektumokból. 64×48×3 = 9216
// cella; objektumtömbként ez 9216 allokáció és szórt memória, tömbként három
// összefüggő blokk. A különbség a rajzolásnál és az útkeresésnél is meglátszik.
//
// ── SZINTEK (v0.3) ────────────────────────────────────────────────────────
// A rács HÁROM dimenziós: `idx(x, y, z)`. A `z` szint a világ állapotának
// része, nem nézeti beállítás — az utas tényleg egy adott szinten van, és
// csak ÁTJÁRÓN (mozgólépcső, teleport lift) tud másikra lépni.
//
// Két szabály tartja életben az emeleteket:
//   1. **Alátámasztás.** Emeleti padlót csak oda lehet rakni, ahol az alatta
//      lévő szinten VAN padló. Enélkül lebegő szigetek keletkeznének, és a
//      játékos elveszne a saját állomásán.
//   2. **Az átjáró cellája járható.** A mozgólépcső NEM zárja el a helyét:
//      rá lehet lépni, és onnan lehet szintet váltani. Ha az átjáró tömör
//      épület lenne, körbe kellene járni — ami pont a lényegét venné el.
//
// ── ZÓNÁK ─────────────────────────────────────────────────────────────────
// A démonok meleget, a jégóriások hideget akarnak. Ez NEM egy épület-igény,
// hanem KÖRNYEZET: a hőforrás a körülötte lévő cellákat melegíti, és aki ott
// áll, annak javul a hangulata. A zónamezőket ezért a rács tartja, nem az
// utas — így egyetlen cella-lekérdezés dönt, nem N épület távolsága. A hő nem
// terjed szintek között: minden emeletet külön kell temperálni.

import { RACS_SZ, RACS_M, RACS_SZINT } from '../mag/config.js';

export const URES = 0;
export const PADLO = 1;

export class Racs {
  constructor(sz = RACS_SZ, m = RACS_M, szintek = RACS_SZINT) {
    this.sz = sz;
    this.m = m;
    this.szintek = szintek;
    /** Egy szint cellaszáma — az indexelés ezzel lép. */
    this.szintCella = sz * m;
    const n = sz * m * szintek;
    /** 0 = űr (nincs kiépítve), 1 = padló. */
    this.padlo = new Uint8Array(n);
    /** Melyik épület foglalja a cellát; -1 = egyik sem. */
    this.epulet = new Int16Array(n).fill(-1);
    /** 1 = függőleges átjáró (mozgólépcső/lift): járható ÉS szintet vált. */
    this.atjaro = new Uint8Array(n);
    /** Hő- és hidegzóna erőssége 0..255. */
    this.ho = new Uint8Array(n);
    this.hideg = new Uint8Array(n);
    /** Hány utas áll épp a cellán — a torlódás ebből számol. */
    this.tomeg = new Uint8Array(n);
    /**
     * Verziószám: minden szerkezeti változásnál nő. Az útkeresés ebből tudja,
     * hogy a gyorsítótárazott távolságmezői elavultak-e. Verzió nélkül vagy
     * minden tickben újraszámolnánk (drága), vagy sosem (rossz utak).
     */
    this.verzio = 1;
  }

  idx(x, y, z = 0) { return (z * this.m + y) * this.sz + x; }
  bent(x, y, z = 0) {
    return x >= 0 && y >= 0 && z >= 0 && x < this.sz && y < this.m && z < this.szintek;
  }

  /** Cellaindex → koordináták (az útkeresés visszafejtéséhez). */
  cellaX(i) { return i % this.sz; }
  cellaY(i) { return (((i / this.sz) | 0) % this.m); }
  cellaZ(i) { return (i / this.szintCella) | 0; }

  /**
   * Járható-e: van padló, és vagy nem áll rajta épület, vagy az az épület
   * ÁTJÁRÓ (mozgólépcső — arra rá kell tudni lépni).
   */
  jarhato(x, y, z = 0) {
    if (!this.bent(x, y, z)) return false;
    const i = (z * this.m + y) * this.sz + x;
    if (this.padlo[i] !== PADLO) return false;
    return this.epulet[i] < 0 || this.atjaro[i] === 1;
  }

  /** Van-e padló (akkor is, ha épület áll rajta). */
  vanPadlo(x, y, z = 0) {
    if (!this.bent(x, y, z)) return false;
    return this.padlo[(z * this.m + y) * this.sz + x] === PADLO;
  }

  epuletAzon(x, y, z = 0) {
    if (!this.bent(x, y, z)) return -1;
    return this.epulet[(z * this.m + y) * this.sz + x];
  }

  /**
   * Lehet-e ide padlót rakni? Az emeleten csak alátámasztás fölé.
   * @returns {boolean}
   */
  padloLerakhato(x, y, z = 0) {
    if (!this.bent(x, y, z)) return false;
    if (this.vanPadlo(x, y, z)) return false;
    if (z === 0) return true;
    return this.vanPadlo(x, y, z - 1);
  }

  padlotLerak(x, y, z = 0) {
    if (!this.padloLerakhato(x, y, z)) return false;
    this.padlo[(z * this.m + y) * this.sz + x] = PADLO;
    this.verzio++;
    return true;
  }

  /**
   * Padló bontása. Nem lehet kihúzni egy fölötte álló emelet alól — az
   * összeomló szerkezet helyett inkább elutasítjuk.
   */
  padlotBont(x, y, z = 0) {
    if (!this.bent(x, y, z)) return false;
    const i = (z * this.m + y) * this.sz + x;
    if (this.padlo[i] !== PADLO || this.epulet[i] >= 0) return false;
    if (z + 1 < this.szintek && this.vanPadlo(x, y, z + 1)) return false;
    this.padlo[i] = URES;
    this.verzio++;
    return true;
  }

  /** Elfér-e egy sz×m épület a bal-felső sarokkal (x,y) a `z` szinten? */
  szabadTerulet(x, y, sz, m, z = 0) {
    for (let j = 0; j < m; j++) {
      for (let i = 0; i < sz; i++) {
        const cx = x + i, cy = y + j;
        if (!this.bent(cx, cy, z)) return false;
        const k = (z * this.m + cy) * this.sz + cx;
        if (this.padlo[k] !== PADLO) return false;
        if (this.epulet[k] >= 0) return false;
      }
    }
    return true;
  }

  bejegyez(azon, x, y, sz, m, z = 0, atjaro = false) {
    for (let j = 0; j < m; j++) {
      for (let i = 0; i < sz; i++) {
        const k = (z * this.m + (y + j)) * this.sz + (x + i);
        this.epulet[k] = azon;
        if (atjaro) this.atjaro[k] = 1;
      }
    }
    this.verzio++;
  }

  torol(x, y, sz, m, z = 0) {
    for (let j = 0; j < m; j++) {
      for (let i = 0; i < sz; i++) {
        const k = (z * this.m + (y + j)) * this.sz + (x + i);
        this.epulet[k] = -1;
        this.atjaro[k] = 0;
      }
    }
    this.verzio++;
  }

  /**
   * Az épület köré rajzolt „peron": a hozzá tartozó járható cellák. Az utas
   * ide sétál, és innen veszi igénybe a szolgáltatást.
   *
   * MIÉRT NEM MAGÁRA AZ ÉPÜLETRE MEGY: mert akkor az épület celláinak
   * járhatónak kellene lenniük, és az utasok ÁTSÉTÁLNÁNAK a boltokon. Az
   * ilyesmi tycoonban azonnal szemet szúr, és a torlódás-modellt is elrontja.
   *
   * @returns {number[]} cellaindexek (nem x,y párok — az útkeresés így kéri)
   */
  peron(x, y, sz, m, z = 0, ki = []) {
    ki.length = 0;
    for (let i = -1; i <= sz; i++) {
      for (let j = -1; j <= m; j++) {
        const szelen = (i === -1 || i === sz || j === -1 || j === m);
        if (!szelen) continue;
        // A sarkok nem jók: átlósan „belógna" az épületbe a beállás.
        if ((i === -1 || i === sz) && (j === -1 || j === m)) continue;
        const cx = x + i, cy = y + j;
        if (this.jarhato(cx, cy, z)) ki.push((z * this.m + cy) * this.sz + cx);
      }
    }
    return ki;
  }

  /** A tömegszámlálót minden tick elején nullázzuk. */
  tomegNullaz() { this.tomeg.fill(0); }

  /**
   * Zónamezők újraszámolása. Csak akkor fut, ha változott a hő/hideg forrás
   * készlete — ezért kell hozzá kívülről a lista, a rács nem ismeri az
   * épületeket. A hő SZINTEN BELÜL terjed: minden emeletet külön kell fűteni.
   * @param {Array<{x,y,z,sz,m,ho,hideg,sugar}>} forrasok
   */
  zonakatSzamol(forrasok) {
    this.ho.fill(0);
    this.hideg.fill(0);
    for (let f = 0; f < forrasok.length; f++) {
      const o = forrasok[f];
      const z = o.z | 0;
      const kx = o.x + (o.sz - 1) * 0.5, ky = o.y + (o.m - 1) * 0.5;
      const r = o.sugar;
      const x0 = Math.max(0, Math.floor(kx - r)), x1 = Math.min(this.sz - 1, Math.ceil(kx + r));
      const y0 = Math.max(0, Math.floor(ky - r)), y1 = Math.min(this.m - 1, Math.ceil(ky + r));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const dx = x - kx, dy = y - ky;
          const t2 = dx * dx + dy * dy;
          if (t2 > r * r) continue;
          // Négyzetes kicsengés — nem kell gyök, és a szélen szépen elhal.
          const ero = (1 - t2 / (r * r));
          const v = Math.round(ero * 255);
          const i = (z * this.m + y) * this.sz + x;
          if (o.ho) this.ho[i] = Math.min(255, this.ho[i] + Math.round(v * o.ho));
          if (o.hideg) this.hideg[i] = Math.min(255, this.hideg[i] + Math.round(v * o.hideg));
        }
      }
    }
  }
}
