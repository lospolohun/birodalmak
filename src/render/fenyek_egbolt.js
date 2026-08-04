// AGE OF THE CRYSTALS — ÉGBOLT: gradiens, korong, csillagok (v0.16).
//
// A v0.10-ig a háttér egyetlen konstans szürkéskék volt (`HATTER_SZIN`), és a
// köd is ugyanaz. Ez teljesítményben tökéletes döntés volt, látványban viszont
// pont az veszett el vele, amitől egy kültéri jelenet kültérinek látszik: a
// felfelé sötétedő ég, a napkorong, és az, hogy a horizont MELEGEBB, mint a
// zenit. A lapos háttér előtt a terep is laposnak látszik, akkor is, ha nem az.
//
// ── EGY KUPOLA, 480 HÁROMSZÖG, EGY RAJZHÍVÁS ──────────────────────────────
// A kupola egy befelé fordított gömb a KAMERA KÖRÜL. Nem kell sűrű, mert a
// színt a fragment-shader számolja analitikusan az IRÁNYBÓL — a geometria csak
// a képernyő kitöltésére kell. 20×12 szegmens (480 háromszög) mellett a
// csúcsok közti irány-interpoláció hibája szemmel nem látható, mert a
// fragmentben úgyis újranormalizálunk.
//
// ── MIÉRT AZ OPAQUE MENET VÉGÉN RAJZOLJUK, ÉS NEM AZ ELEJÉN ───────────────
// Ösztönösen az égbolt „a háttér", tehát elsőnek jönne. Csakhogy akkor MINDEN
// képpontját leárnyékoljuk, aztán a terep nagy részüket felülrajzolja — a
// kitöltés-költséget kifizetjük a semmiért. Ezért `renderOrder = 900` és
// `depthWrite = false`: a kupola az átlátszatlan menet UTOLSÓ tétele, tehát a
// mélységteszt már eldobja ott, ahol terep vagy épület van. Egy tipikus RTS-
// nézetben a képernyő 60-70 %-a terep — ennyivel kevesebb égbolt-képpontot
// árnyékolunk. Az átlátszó rétegek (víz, hadi köd) ezután jönnek, tehát őket
// ez nem zavarja.
//
// ⚠️ `depthWrite = false` KELL: a kupola 700 egység sugarú, a `far` 900. Ha
// mélységet írna, a hozzá közeli (nagy `z`-jű) átlátszó geometria kiesne.
//
// ── MIÉRT NEM ÜL RAJTA A KÖD ──────────────────────────────────────────────
// A `THREE.Fog` a kamerától mért távolság szerint kever — a 700 egységre lévő
// kupola MINDEN képpontja teljesen ködszínű lenne, vagyis pontosan azt a
// lapos, egyszínű hátteret kapnánk vissza, ami elől menekülünk. A
// `ShaderMaterial` alapból ködmentes; itt ez nem hanyagság, hanem a lényeg.
// A köd és az égbolt ALJA viszont AZONOS színű (`fenyek_ciklus.js` gondoskodik
// róla), így a pálya széle és az ég találkozásánál nincs látható varrat.
//
// ── SZÍNKEZELÉS ──────────────────────────────────────────────────────────
// A shader LINEÁRIS térben számol, és a végén ugyanazon a két lépcsőn megy át,
// mint minden más anyag (`tonemapping_fragment` + `colorspace_fragment`).
// Enélkül az égbolt a tone mappingot megkerülve mást mutatna, mint a terep —
// és pont a horizonton, egymás mellett látszana a két világ különbsége.

import * as THREE from 'three';
// ⚠️ Közvetlenül a `three`-ből, NEM a `core3d.js`-ből: ezt a fájlt a `core3d`
// importálja, tehát a `from './core3d.js'` körkörös hivatkozás lenne. A Vite
// ugyanazt a modult adja, tehát nem lesz két `three` a csomagban.

/** A kupola sugara. A kamera `far`-ja 900 — bőven belül. */
const SUGAR = 700;

const CSUCS_SHADER = /* glsl */`
varying vec3 vIrany;
void main() {
  // Az egységgömb csúcspozíciója MAGA az irány. A kupola sosem forog, csak
  // eltolódik (a kamerára), tehát modell-mátrix nélkül is helyes.
  vIrany = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG_SHADER = /* glsl */`
uniform vec3 uZenit;
uniform vec3 uHorizont;
uniform vec3 uFold;
uniform vec3 uNapIr;
uniform vec3 uKorongSzin;
uniform vec2 uKorongCos;   // x = külső perem koszinusza, y = belső
uniform float uKorongEro;
uniform float uCsillag;

varying vec3 vIrany;

void main() {
  vec3 d = normalize(vIrany);
  float h = d.y;

  // ── ALAPGRADIENS ────────────────────────────────────────────────────────
  // A 0,42-es kitevő nem esztétikai szeszély: lineáris keveréssel a horizont
  // sávja vékony csík lenne, holott a látvány java pont ott van (az RTS-kamera
  // laposan néz, a képernyő felső harmadában a horizont közeli ég van).
  vec3 szin = mix(uHorizont, uZenit, pow(clamp(h, 0.0, 1.0), 0.42));
  // ⚠️ A HORIZONT ALATTI FÉLGÖMB A LEGKÖNNYEBBEN ELRONTHATÓ RÉSZLET.
  // A 256-os pálya átlója 362, a köd 340-nél zár — vagyis a pálya SZÉLÉN
  // ÁTLÁTUNK, és ott a kupola alsó fele látszik. Ha az alsó fél sötétebb,
  // mint a ködbe fulladó terep, a pálya széle egy éles, vízszintes
  // színcsíkkal ér véget. A szoftveres előnézeten pontosan ez jött ki: a
  // ködszínű, halvány terep fölött egy sötétkék sáv. Ezért az alsó félgömb
  // alig sötétebb a horizontnál, és lassan is ér oda.
  szin = mix(szin, uFold, clamp(-h * 1.4, 0.0, 1.0));

  // ── CSILLAGOK ───────────────────────────────────────────────────────────
  // Uniform-vezérelt elágazás: nappal (uCsillag == 0) a hullámfront egyben
  // ugorja át, tehát nem fizetünk érte.
  if (uCsillag > 0.002 && h > 0.0) {
    vec3 sp = d * 300.0;
    vec3 cella = floor(sp);
    float n = fract(sin(dot(cella, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    float cs = smoothstep(0.9970, 0.9995, n);
    // A cella közepétől mért távolság kerekíti pontszerűvé — enélkül
    // KOCKÁK lennének az égen, nem csillagok.
    vec3 fp = fract(sp) - 0.5;
    cs *= smoothstep(0.40, 0.05, length(fp));
    // A horizont fölött halványan: ott a légkör amúgy is elnyelné. A küszöb
    // szándékosan alacsony (0,18): az RTS-kamera laposan néz, a képernyőn
    // szinte CSAK a horizont-sáv ég látszik — magasabb küszöbbel a csillagok
    // létezésének semmi nyoma nem lenne a játékban.
    szin += vec3(cs * uCsillag * smoothstep(0.0, 0.18, h) * 0.85);
  }

  // ── KORONG ÉS GLÓRIA ────────────────────────────────────────────────────
  float cd = max(dot(d, uNapIr), 0.0);
  // A glória adja meg, MERRŐL süt a fény — enélkül a vetett árnyékok iránya
  // magyarázat nélkül maradna a képen.
  float gloria = pow(cd, 200.0) * 0.55 + pow(cd, 9.0) * 0.10;
  float korong = smoothstep(uKorongCos.x, uKorongCos.y, cd);
  szin += uKorongSzin * (korong * 2.2 + gloria) * uKorongEro;

  gl_FragColor = vec4(szin, 1.0);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class Egbolt {
  /**
   * @param {THREE.Scene} jelenet
   */
  constructor(jelenet) {
    this.jelenet = jelenet;
    this._enabled = true;

    // Az uniform-objektumok EGYSZER jönnek létre; a `frissit()` csak a `value`
    // mezőket írja. `THREE.Color`/`Vector3` példányosítás képkockánként pont az
    // a szemét, amit a réteg-szerződés tilt.
    this.uniformok = {
      uZenit: { value: new THREE.Color(0.15, 0.30, 0.70) },
      uHorizont: { value: new THREE.Color(0.60, 0.75, 0.92) },
      uFold: { value: new THREE.Color(0.35, 0.36, 0.38) },
      uNapIr: { value: new THREE.Vector3(0, 1, 0) },
      uKorongSzin: { value: new THREE.Color(1, 0.96, 0.88) },
      uKorongCos: { value: new THREE.Vector2(Math.cos(0.030), Math.cos(0.018)) },
      uKorongEro: { value: 1 },
      uCsillag: { value: 0 },
    };

    const geo = new THREE.SphereGeometry(SUGAR, 20, 12);
    this.anyag = new THREE.ShaderMaterial({
      uniforms: this.uniformok,
      vertexShader: CSUCS_SHADER,
      fragmentShader: FRAG_SHADER,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: true,
      fog: false,
    });

    this.halo = new THREE.Mesh(geo, this.anyag);
    this.halo.name = 'egbolt';
    this.halo.renderOrder = 900;      // lásd a fejléc „opaque menet vége" részét
    this.halo.frustumCulled = false;  // mindig a kamera KÖRÜL van
    this.halo.matrixAutoUpdate = false;
    this._haromszog = geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3;
    jelenet.add(this.halo);
  }

  /**
   * Az égbolt hozzáigazítása a nap-állapothoz és a kamerához.
   *
   * @param {import('./fenyek_ciklus.js').ujNapAllapot extends () => infer T ? T : never} nap
   * @param {THREE.Camera} kamera a kupola erre a pontra ül
   */
  frissit(nap, kamera) {
    const u = this.uniformok;
    u.uZenit.value.setRGB(nap.zenitR, nap.zenitG, nap.zenitB);
    u.uHorizont.value.setRGB(nap.horizontR, nap.horizontG, nap.horizontB);
    // A „föld" félgömb a horizont ALIG tompított változata — lásd a fragment
    // shader ⚠️ megjegyzését arról, miért nem lehet sötétebb.
    u.uFold.value.setRGB(nap.horizontR * 0.88, nap.horizontG * 0.88, nap.horizontB * 0.90);
    u.uNapIr.value.set(nap.irX, nap.irY, nap.irZ);
    u.uKorongSzin.value.setRGB(nap.korongR, nap.korongG, nap.korongB);
    u.uKorongEro.value = nap.korongEro;
    u.uCsillag.value = nap.csillag;
    const m = nap.korongMeret;
    u.uKorongCos.value.set(Math.cos(m * 1.7), Math.cos(m));

    if (kamera) {
      const p = kamera.position;
      const h = this.halo.position;
      // A `matrixAutoUpdate = false` miatt csak akkor számolunk mátrixot, ha
      // tényleg mozdult a kamera.
      if (h.x !== p.x || h.y !== p.y || h.z !== p.z) {
        h.copy(p);
        this.halo.updateMatrix();
      }
    }
  }

  // ── RÉTEG-SZERZŐDÉS ──────────────────────────────────────────────────────

  set enabled(v) { this._enabled = !!v; this.halo.visible = this._enabled; }
  get enabled() { return this._enabled; }
  get haromszog() { return this._enabled ? this._haromszog : 0; }

  bont() {
    this.jelenet.remove(this.halo);
    this.halo.geometry.dispose();
    this.anyag.dispose();
  }
}
