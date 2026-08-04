// AGE OF THE CRYSTALS — WEBSOCKET-SZÁLLÍTÁS (v0.8/2).
//
// ── UGYANAZ A FELÜLET, MINT A HUROKÉ ──────────────────────────────────────
// A `Lockstep` felől nézve ez a fájl megkülönböztethetetlen a `hurok.js`-től:
// van egy `kuld(uzenet)`, és a beérkező csomagokat a `fogad` visszahíváson
// adja tovább. A lockstep-mag semmit nem tud arról, hogy socket van alatta —
// és pont ezért volt vizsgálható szerver nélkül a v0.8/1-ben.
//
// Ez a szétválasztás nem elméleti szépség: a v0.8/1 két hibáját (a
// konstruktorból küldő objektumot és a soha meg nem szólaló desync-detektort)
// egy böngésző-szerver páros mellett órákig kerestük volna. Hurokban percek
// alatt kiderültek.
//
// ── AMI ITT MÁS, MINT A HUROKBAN ──────────────────────────────────────────
// A hálózat nem azonnal áll össze. A kapcsolat felépül, a szerver kiosztja a
// játékos-helyet és a SEEDET, és csak amikor a szoba betelt, jön a `rajt`.
// Addig a klienenek NINCS simje — nem is lehet, mert a seedet a szerver adja,
// és abból épül a terep.
//
// Ezért ez az osztály nem kap kész `Sim`-et: `rajt`-kor VISSZAHÍVÁSSAL kéri
// el a gazdától, a kapott seeddel. A sorrend így kimondott, nem a hívó
// jóindulatára bízott — ugyanaz a tanulság, ami a `Lockstep.indit()`-et
// kikényszerítette.
//
// ── ÚJRACSATLAKOZÁS: MÉG NINCS ────────────────────────────────────────────
// Ha a kapcsolat elszakad, a meccs itt megáll. Az újracsatlakozás (a mentés
// átküldése egy visszatérő játékosnak) a v0.8/3 dolga — a `Mentes` réteg már
// megvan hozzá, a szoba pedig fenntartja a kiesett helyét.

export const KAPCSOLAT = { CSATLAKOZIK: 0, VAR: 1, FUT: 2, BONTVA: 3, HIBA: 4 };
export const KAPCSOLAT_NEV = [
  'csatlakozik…', 'vár a többi játékosra', 'fut', 'a kapcsolat megszakadt', 'hiba',
];

export class WebSocketSzallitas {
  /**
   * @param {string} url pl. `ws://localhost:8787?szoba=fo`
   * @param {{
   *   rajt:(adat:{jatekos:number, jatekosDb:number, seed:number}) => void,
   *   fogad:(uzenet:object) => void,
   *   valtozas?:(allapot:number, hiba?:string) => void,
   *   WebSocketOsztaly?:any
   * }} horgok
   */
  constructor(url, horgok) {
    this.url = url;
    this._rajt = horgok.rajt;
    this._fogad = horgok.fogad;
    this._valtozas = horgok.valtozas || (() => {});
    this.allapot = KAPCSOLAT.CSATLAKOZIK;
    this.jatekos = -1;
    this.jatekosDb = 0;
    this.seed = 0;
    this.hiba = '';

    /** Működés-számlálók — a HUD és a hálózati szonda ezekből dolgozik. */
    this.kuldott = 0;
    this.fogadott = 0;

    // A `WebSocket` osztály injektálható: a böngészőben a globális, node-ban
    // szintén (a 22-es óta), de így a szonda tud mást is adni, ha kell.
    const WS = horgok.WebSocketOsztaly || WebSocket;
    this.socket = new WS(url);

    this.socket.onmessage = (ev) => this._uzenet(ev.data);
    this.socket.onclose = () => this._allapot(KAPCSOLAT.BONTVA);
    this.socket.onerror = () => {
      // A `close` a legtöbb esetben úgyis lefut utána; a hiba-állapotot csak
      // akkor tartjuk meg, ha még nem is jártunk futó állapotban.
      if (this.allapot === KAPCSOLAT.CSATLAKOZIK) this._allapot(KAPCSOLAT.HIBA, 'nem sikerült csatlakozni');
    };
  }

  _allapot(uj, hiba) {
    if (this.allapot === uj) return;
    this.allapot = uj;
    if (hiba) this.hiba = hiba;
    this._valtozas(uj, hiba);
  }

  _uzenet(nyers) {
    let u;
    try { u = JSON.parse(typeof nyers === 'string' ? nyers : nyers.toString()); } catch (h) { return; }
    if (!u || !u.fajta) return;

    if (u.fajta === 'udv') {
      this.jatekos = u.jatekos | 0;
      this.jatekosDb = u.jatekosDb | 0;
      this.seed = u.seed >>> 0;
      this._allapot(KAPCSOLAT.VAR);
      return;
    }
    if (u.fajta === 'rajt') {
      this._allapot(KAPCSOLAT.FUT);
      this._rajt({ jatekos: this.jatekos, jatekosDb: this.jatekosDb, seed: this.seed });
      return;
    }
    if (u.fajta === 'hiba') {
      this._allapot(KAPCSOLAT.HIBA, u.ok || 'ismeretlen hiba');
      return;
    }
    if (u.fajta === 'kor') {
      this.fogadott++;
      this._fogad(u);
    }
  }

  /** A `Lockstep.kuld` visszahívása ide fut be. */
  kuld(uzenet) {
    if (!this.socket || this.socket.readyState !== 1) return;
    this.socket.send(JSON.stringify(uzenet));
    this.kuldott++;
  }

  bont() {
    if (this.socket && this.socket.readyState <= 1) this.socket.close();
  }

  osszesites() {
    return {
      allapot: this.allapot,
      allapotNev: KAPCSOLAT_NEV[this.allapot],
      jatekos: this.jatekos,
      jatekosDb: this.jatekosDb,
      seed: this.seed,
      kuldott: this.kuldott,
      fogadott: this.fogadott,
      hiba: this.hiba,
    };
  }
}
