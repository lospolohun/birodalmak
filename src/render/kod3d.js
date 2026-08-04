// AGE OF THE CRYSTALS — HADI KÖD MEGJELENÍTÉSE (v0.7/1).
//
// SZERZŐDÉS: `frissit(sim, alfa)` · `set enabled(v)` · `get haromszog()`
//
// ── EGYETLEN NÉGYSZÖG, EGYETLEN TEXTÚRA ───────────────────────────────────
// A köd látványa csábítóan bonyolítható lenne: cellánkénti geometria, lágy
// peremek, több réteg. A valóság az, hogy KÉT HÁROMSZÖG is elég — egy lap a
// pálya fölött, rajta a `kod.js` durvább rácsából töltött textúrával. A lágy perem
// ingyen jön a textúra lineáris szűréséből: a GPU maga interpolál a
// köd-cellák között, tehát nem kell sem elmosás-shader, sem sűrűbb rács.
//
// A textúra 64×64 egy 256×256-os pályához, vagyis 4 KB. Ennyit képkockánként
// is fel lehetne tölteni, de nem tesszük — lásd lentebb.
//
// ── HÁROM ÁLLAPOT, EGY CSATORNA ───────────────────────────────────────────
// A köd három dolgot mond, és ezt EGYETLEN alfa-értékbe sűrítjük:
//
//   ÉPPEN LÁTOM     → átlátszó (0)          a világ látszik, minden mozog
//   LÁTTAM MÁR      → félig sötét (0,55)    a terep és az épület látszik,
//                                            de az ott mozgó egység nem
//   SOSEM LÁTTAM    → sötét (0,92)          nem tudni, mi van ott
//
// A „láttam már" réteg nem szépészet: ez az, amitől a felderítésnek ÉRTELME
// van. Ha a felfedezett terület visszasötétedne, a felderítés egyszeri
// villanás lenne; így viszont TUDÁS marad, amit a játékos épít.
//
// ⚠️ A SIMET NEM ÍRJUK. A `Kod` rácsát csak olvassuk. A ködnek nincs
// render-oldali állapota — ha lenne, a v0.8 lockstepjében a két kliens
// képernyője eltérhetne attól, amit a szimuláció mond.
//
// ── MIÉRT NEM TÖLTJÜK FEL MINDEN KÉPKOCKÁN ────────────────────────────────
// A `Kod` fél másodpercenként frissül (`KOD_KOZ = 10` tick), a render viszont
// 60-144 Hz-en fut. Feltöltésből tehát a képkockák 95 %-a fölösleges lenne. A
// `Kod.valtozat` számlálója pontosan azt mondja meg, változott-e — ugyanaz a
// minta, amit a `gazdasag3d.js` használ az épületekre, és ugyanabból az okból:
// a `three` textúra-feltöltés az EGÉSZ puffert felküldi.

import { THREE } from './core3d.js';

/** A talaj fölé emelés — a ködlap a legmagasabb hegy fölött is átfedjen. */
const MAGASSAG = 0.9;

/** Alfa-értékek: éppen látom · láttam már · sosem láttam. */
const A_LATHATO = 0;
const A_LATOTT = 140;
const A_ISMERETLEN = 235;

export class Kod3D {
  /**
   * @param {THREE.Scene} szinter
   * @param {import('../sim/sim.js').Sim} sim
   * @param {{sajatCsapat?:number}} [opciok]
   */
  constructor(szinter, sim, opciok = {}) {
    this.szinter = szinter;
    this._enabled = true;
    /**
     * MELYIK CSAPAT ködjét mutatjuk. A sim MINDEN csapatét számolja (a gépi
     * ellenfélnek is kell), a képernyőn viszont csak a sajátunk van értelme.
     */
    this.csapat = opciok.sajatCsapat ?? 0;

    const kn = sim.kod.kn;
    this.kn = kn;
    /**
     * Egycsatornás (alfa) adat-textúra. `RedFormat` és nem RGBA: a köd egyetlen
     * számot hordoz cellánként, a négyszeres memória semmit nem adna hozzá.
     */
    this._adat = new Uint8Array(kn * kn);
    this._textura = new THREE.DataTexture(this._adat, kn, kn, THREE.RedFormat);
    this._textura.minFilter = THREE.LinearFilter;
    this._textura.magFilter = THREE.LinearFilter;
    this._textura.wrapS = THREE.ClampToEdgeWrapping;
    this._textura.wrapT = THREE.ClampToEdgeWrapping;
    this._textura.needsUpdate = true;

    const meret = sim.n;
    const geo = new THREE.PlaneGeometry(meret, meret, 1, 1);
    // A saját shader itt nem fényűzés: a beépített anyagok az alfát egyetlen
    // csatornából nem tudják kiolvasni fénylés nélkül, és a ködnek NEM szabad
    // reagálnia a világításra — az elárulná, hol van fény a köd alatt.
    const anyag = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        kodTex: { value: this._textura },
        kodSzin: { value: new THREE.Color(0x05070c) },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D kodTex;
        uniform vec3 kodSzin;
        varying vec2 vUv;
        void main() {
          float a = texture2D(kodTex, vUv).r;
          if (a < 0.01) discard;
          gl_FragColor = vec4(kodSzin, a);
        }
      `,
    });

    this.halo = new THREE.Mesh(geo, anyag);
    this.halo.rotation.x = -Math.PI * 0.5;
    // A pálya KÖZEPÉRE, a legmagasabb pont fölé. A geometria középpontos, a
    // világ viszont 0..n között van — innen a fél pálya eltolás.
    // A `Racs`-nak nincs kész magasság-maximuma, és nem is
    // érdemes bevezetni egy render-igény miatt — a magassági rács viszont ott
    // van, egyszer végigjárni olcsó (indításkor, nem képkockánként).
    let max = 0;
    const mag = sim.racs.magassag;
    for (let i = 0; i < mag.length; i++) if (mag[i] > max) max = mag[i];
    this.halo.position.set(meret * 0.5, max + MAGASSAG, meret * 0.5);
    this.halo.renderOrder = 900;
    this.halo.frustumCulled = false;
    szinter.add(this.halo);

    this._utolsoValtozat = -1;
    this._haromszog = 2;
  }

  /**
   * Képkocka. Csak akkor tölt fel, ha a sim ködje TÉNYLEG változott — lásd a
   * fejléc utolsó bekezdését.
   */
  frissit(sim) {
    if (!this._enabled) return;
    const kod = sim.kod;
    if (kod.valtozat === this._utolsoValtozat) return;
    this._utolsoValtozat = kod.valtozat;

    const cs = this.csapat;
    const latott = kod.latott[cs];
    const lathato = kod.lathato[cs];
    const adat = this._adat;
    const kn = this.kn;
    // ⚠️ A SOROKAT MEGFORDÍTJUK. A textúra V tengelye lentről felfelé nő, a
    // köd-rács viszont a világ Z tengelye szerint fentről lefelé — fordítás
    // nélkül a köd TÜKÖRKÉPE lenne annak, ahol a sereg jár, és ez a fajta hiba
    // ránézésre „majdnem jó"-nak látszik.
    for (let y = 0; y < kn; y++) {
      const be = y * kn;
      const ki = (kn - 1 - y) * kn;
      for (let x = 0; x < kn; x++) {
        const i = be + x;
        adat[ki + x] = lathato[i] === 1 ? A_LATHATO : (latott[i] === 1 ? A_LATOTT : A_ISMERETLEN);
      }
    }
    this._textura.needsUpdate = true;
  }

  /** Újrafelállás: a rács mérete nem változik, de a tartalom igen. */
  ujraKot() { this._utolsoValtozat = -1; }

  set enabled(v) {
    this._enabled = !!v;
    this.halo.visible = !!v;
  }
  get enabled() { return this._enabled; }
  get haromszog() { return this._enabled ? this._haromszog : 0; }
}
