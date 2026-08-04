// AGE OF THE CRYSTALS — HUROK-SZÁLLÍTÁS (v0.8/1).
//
// ── MIÉRT VAN ILYEN EGYÁLTALÁN ────────────────────────────────────────────
// Ez egy „hálózat" hálózat nélkül: több `Lockstep` példányt köt össze
// ugyanabban a folyamatban. Egyetlen célja, hogy a lockstep-mag TELJESEN
// VIZSGÁLHATÓ legyen szerver nélkül — a determinizmus-szonda tiszta node, és a
// v0.8 legkockázatosabb része pont az, amit egy böngésző-szerver páros nélkül
// nem lehetne kipróbálni.
//
// A hurok NEM „egyszerűsített" változata a valódinak. Ugyanazt a felületet
// hajtja meg (`kuld` / `fogad`), ugyanazokkal az üzenetekkel, és tud
// KÉSLELTETNI is — vagyis a lockstep szempontjából megkülönböztethetetlen egy
// lassú hálózattól. Ha valami itt működik, a WebSocket-változat már csak
// szállítás.
//
// ── A KÉSLELTETÉS NEM DÍSZ ────────────────────────────────────────────────
// A `keses` körrel később kézbesíti a csomagot. Ez az, amitől a szonda azt is
// meg tudja nézni, hogy a lockstep tényleg MEGÁLL-E, ha valaki lemarad — és
// hogy utána tényleg TOVÁBBMEGY-E. Egy azonnal kézbesítő hurokban a
// `ALLAPOT.VAR` ág sosem futna le, tehát a kapun kívül maradna.
//
// ⚠️ A KÉSLELTETÉS SORREND-TARTÓ. A valódi hálózat átrendezhet csomagokat, a
// lockstep viszont attól még helyes marad: a csomag a KÖRSZÁMÁT viszi, nem az
// érkezési sorrendjét. Ezt a `Lockstep.fogad` biztosítja, nem a szállítás — és
// pont ezért nem is bonyolítjuk ide az átrendezést.

export class Hurok {
  constructor() {
    /** A csatlakozott végpontok: `{ jatekos, fogad(uzenet) }`. */
    this.vegpontok = [];
    /** Kézbesítésre váró csomagok: `{ mikor, kinek, uzenet }`. */
    this._sor = [];
    /** Belső óra, körökben — a `lep()` lépteti. */
    this.ora = 0;
    /** Statisztika a szondának. */
    this.tovabbitott = 0;
    this.kezbesitett = 0;
  }

  /**
   * Végpont csatlakoztatása.
   * @param {number} jatekos
   * @param {number} keses hány körrel később érkezzenek meg NEKI a csomagok
   */
  csatlakoz(jatekos, fogad, keses = 0) {
    this.vegpontok.push({ jatekos, fogad, keses: keses | 0 });
  }

  /**
   * Küldés — a `Lockstep.kuld` visszahívása ide fut be.
   *
   * A KÜLDŐNEK NEM kézbesítünk: a `Lockstep._csomagKuld` a saját csomagját már
   * közvetlenül átadta magának. Ha itt is megkapná, a `fogad` másodszor is
   * lefutna ugyanarra a körre — az ellene védő „nem írjuk felül" ág elnyelné,
   * de akkor is fölösleges munka lenne, és elfedne egy valódi hibát.
   */
  kuld(uzenet) {
    for (let i = 0; i < this.vegpontok.length; i++) {
      const v = this.vegpontok[i];
      if (v.jatekos === uzenet.jatekos) continue;
      this._sor.push({ mikor: this.ora + v.keses, kinek: i, uzenet });
      this.tovabbitott++;
    }
  }

  /**
   * Egy kör telt el: kézbesítjük, aminek eljött az ideje.
   *
   * A sor VÉGIGJÁRÁSA növekvő index szerint megy, és a kézbesített elemeket
   * egyetlen tömörítéssel dobjuk ki — így nincs `splice` a ciklusban, és a
   * sorrend is rögzített marad.
   */
  lep() {
    this.ora++;
    let ir = 0;
    for (let i = 0; i < this._sor.length; i++) {
      const cs = this._sor[i];
      if (cs.mikor > this.ora) { this._sor[ir++] = cs; continue; }
      this.vegpontok[cs.kinek].fogad(cs.uzenet);
      this.kezbesitett++;
    }
    this._sor.length = ir;
  }

  /** Hány csomag vár még kézbesítésre. */
  get varakozo() { return this._sor.length; }
}
