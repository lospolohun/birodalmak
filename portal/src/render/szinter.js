// PORTAL HUB TYCOON — SZÍNTÉR, KAMERA, FÉNY.
//
// ── MIÉRT VAN EZ A FÁJL ───────────────────────────────────────────────────
// A render EGYIRÁNYÚ: olvassa a simet, és soha nem ír bele. Ez a fájl tartja
// azt a keveset, ami tényleg csak a képernyőé — jelenet, kamera, fények, ég.
// Ha valaha kicseréljük a látványt (más motor, más stílus), csak ez a réteg
// megy a kukába; a világ marad.
//
// ── A KAMERA ──────────────────────────────────────────────────────────────
// Saját, kb. 60 soros vezérlő, nem OrbitControls. Nem büszkeségből: a
// tycoon-kamera MÁS, mint a modellnéző. Itt a bal egérgomb ÉPÍT, tehát a
// forgatás/tolás a jobb és a középső gombra kerül, a zoom a talajpont felé
// húz (nem a kamera felé), és a dőlés korlátos, hogy ne lehessen a padló alá
// nézni. Ezt az OrbitControls-ból mind ki kellett volna kapcsolni.
//
// ── A NAPSZAK (v0.7) ──────────────────────────────────────────────────────
// A világ órája eddig csak a HUD-on és a hangban létezett; a kép mindig
// ugyanaz a hideg éjszaka volt. Pedig a napszak az EGYETLEN olyan visszajelzés,
// ami akkor is mozog, ha a játékos nem csinál semmit — ettől lesz az állomás
// hely és nem ábra. A `napszak(tick)` a sim ÓRÁJÁT olvassa (`tick % NAP_TICK`),
// és csak fényt, eget, ködöt és csillagot mozgat: ATMOSZFÉRA, nem szimuláció.
// A render itt sem ír vissza a simbe — a tick csak bemenő szám.

import * as THREE from 'three';
import { RACS_SZ, RACS_M, NAP_TICK } from '../mag/config.js';

const TAU = Math.PI * 2;

/**
 * Napszak-kulcskockák.
 *
 * MIÉRT TÁBLA ÉS NEM KÉPLET: egy szinuszból számolt „nap" fizikailag helyes,
 * de unalmas — a hajnal és az alkony pont attól szép, hogy ott történik a
 * legtöbb színváltás a legrövidebb idő alatt. Kulcskockákkal ez néhány szám
 * átírásával hangolható; képlettel minden hangolás új trigonometria lenne.
 *
 * A `t` PONTOSAN az az arány, amit a HUD órája mutat (`tick % NAP_TICK`):
 * 0 = éjfél, 0,5 = dél. Ha a kettő elcsúszna, a játékos „14:00"-t olvasna egy
 * csillagos égbolt alatt — és onnantól egyik jelzésnek sem hinne.
 *
 * ⚠️ AZ ÉJSZAKA NEM LEHET OLVASHATATLAN. Egy tycoonban éjjel is építeni kell,
 * tehát a félgömbfény sosem megy 0,8 alá, és a földi színe éjjel MELEG — ez a
 * „az állomás saját lámpái égnek" hatás, egyetlen extra fény nélkül.
 */
const NAPSZAK_KULCSOK = napszakKulcsok([
  //  t     ég alsó   ég közép  ég felső  köd       nap színe napEro  égi fény  földi fény felgömb csillag
  { t: 0.00, a: 0x1d1436, k: 0x2c1d54, f: 0x080b20, kod: 0x141a33, ns: 0x8ea6ff, ne: 0.46, ef: 0x3a5490, ff: 0x55392a, fe: 0.86, cs: 1.00 },
  { t: 0.20, a: 0x30204c, k: 0x30245f, f: 0x0a0f28, kod: 0x1a2040, ns: 0xa898e0, ne: 0.56, ef: 0x43589a, ff: 0x55392a, fe: 0.88, cs: 0.90 },
  { t: 0.27, a: 0xff9a5e, k: 0x8a5a9e, f: 0x1a2050, kod: 0x51436d, ns: 0xffb473, ne: 1.05, ef: 0x7f8ac4, ff: 0x5a3a2e, fe: 0.90, cs: 0.30 },
  { t: 0.36, a: 0xa9d6f2, k: 0x5f92d8, f: 0x1f4b95, kod: 0x7ea2c8, ns: 0xfff0d0, ne: 1.45, ef: 0x9fd8ff, ff: 0x2a1f3a, fe: 0.96, cs: 0.00 },
  { t: 0.50, a: 0xd2ebfc, k: 0x77b3ee, f: 0x2467c4, kod: 0x9dc4e6, ns: 0xfff6e2, ne: 1.62, ef: 0xbfe6ff, ff: 0x33294a, fe: 1.04, cs: 0.00 },
  { t: 0.64, a: 0xb8dcf4, k: 0x6a9ee0, f: 0x2154a4, kod: 0x88a9cd, ns: 0xffe9c0, ne: 1.42, ef: 0xa8dcff, ff: 0x2e2340, fe: 0.96, cs: 0.00 },
  { t: 0.74, a: 0xff8a4a, k: 0x9a4f86, f: 0x1c2258, kod: 0x67415e, ns: 0xff9c55, ne: 1.12, ef: 0x8a7ab6, ff: 0x5a3a2e, fe: 0.88, cs: 0.18 },
  { t: 0.82, a: 0x5c3c72, k: 0x39296a, f: 0x0d1130, kod: 0x2c2449, ns: 0xa88ad4, ne: 0.64, ef: 0x4a5aa0, ff: 0x4e3428, fe: 0.88, cs: 0.72 },
  { t: 1.00, a: 0x1d1436, k: 0x2c1d54, f: 0x080b20, kod: 0x141a33, ns: 0x8ea6ff, ne: 0.46, ef: 0x3a5490, ff: 0x55392a, fe: 0.86, cs: 1.00 },
]);

/** A hexákat EGYSZER alakítjuk `THREE.Color`-rá — futás közben nincs allokáció. */
function napszakKulcsok(lista) {
  for (const k of lista) {
    k.a = new THREE.Color(k.a); k.k = new THREE.Color(k.k); k.f = new THREE.Color(k.f);
    k.kod = new THREE.Color(k.kod); k.ns = new THREE.Color(k.ns);
    k.ef = new THREE.Color(k.ef); k.ff = new THREE.Color(k.ff);
  }
  return lista;
}

// A talajsík példányonként van, mert a MAGASSÁGA változik: a szintválasztó
// átteszi az aktív emelet szintjére. Ha modulszintű állandó maradna, az
// emeleten építve a kurzor a földszintre mutatna — vagyis pont oda, ahová a
// játékos NEM épít. (`THREE.Plane` normálisa (0,1,0), a konstans −magasság.)

export class Szinter {
  /** @param {HTMLCanvasElement} vaszon */
  constructor(vaszon) {
    this.vaszon = vaszon;
    this.renderelo = new THREE.WebGLRenderer({ canvas: vaszon, antialias: true, powerPreference: 'high-performance' });
    this.renderelo.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderelo.shadowMap.enabled = true;
    this.renderelo.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderelo.outputColorSpace = THREE.SRGBColorSpace;

    this.jelenet = new THREE.Scene();
    this.jelenet.fog = new THREE.Fog(0x141a33, 55, 165);

    this.kamera = new THREE.PerspectiveCamera(48, 1, 0.5, 400);

    // ── KAMERA-ÁLLAPOT ───────────────────────────────────────────────────
    this.cel = new THREE.Vector3(RACS_SZ * 0.5, 0, RACS_M * 0.5);
    this.tav = 46;
    this.szog = Math.PI * 0.25;   // vízszintes forgás
    this.dolt = Math.PI * 0.30;   // 0 = felülnézet, π/2 = oldalnézet
    this._kamerat();

    this._fenyek();
    this._eg();
    /** 0 = éjfél, 0,5 = dél. A `napszak()` írja, a szonda ezt olvassa. */
    this.napszakArany = 0;
    /** 0 = koromsötét, 1 = tűző dél. A hatásréteg is ezt kérdezi. */
    this.nappal = 0;
    this.napszak(0);

    /** Az aktív szint világ-magassága; a szintválasztó állítja. */
    this.talajY = 0;
    this._talaj = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.egerNdc = new THREE.Vector2(0, 0);
    this.sugar = new THREE.Raycaster();
    this._talajPont = new THREE.Vector3();

    this._vezerles();
    this.meretez();
    addEventListener('resize', () => this.meretez());
  }

  _fenyek() {
    // Két fény elég: egy meleg „nap" árnyékkal, és egy hideg égi-földi
    // félgömb, ami kitölti az árnyékokat. Több fény szebb lenne, de a
    // stilizált látványnál a KONTRASZT számít, nem a fizikai hűség.
    const nap = new THREE.DirectionalLight(0xfff0d8, 1.45);
    nap.position.set(38, 52, 22);
    nap.castShadow = true;
    nap.shadow.mapSize.set(2048, 2048);
    const k = nap.shadow.camera;
    k.left = -46; k.right = 46; k.top = 46; k.bottom = -46; k.near = 4; k.far = 150;
    nap.shadow.bias = -0.0015;
    nap.target.position.set(RACS_SZ * 0.5, 0, RACS_M * 0.5);
    this.jelenet.add(nap, nap.target);
    this.nap = nap;

    // A félgömbfény szándékosan visszafogott: a `three` r155 óta fizikai
    // egységekkel számol, és a korábbi 1,25-ös érték annyira kivilágította a
    // padlót, hogy az összes cellaszín ugyanarra a világosszürkére mosódott —
    // a hő- és hidegzónák pedig épp emiatt nem látszottak.
    this.egiFeny = new THREE.HemisphereLight(0x9fd8ff, 0x2a1f3a, 0.85);
    this.jelenet.add(this.egiFeny);

    // ── AZ ÁLLOMÁS SAJÁT VILÁGÍTÁSA ────────────────────────────────────────
    // Éjjel a nap gyakorlatilag kialszik, a Lambert-anyagú épületek pedig nem
    // világítanak magukban — enélkül a fél nap egy fekete téglalap volna, és a
    // játékos vagy megvárná a hajnalt, vagy elrontaná az építkezést. Ez a
    // csarnok fölé akasztott meleg lámpa a válasz.
    //
    // `decay = 0`: NEM fizikai hiba, hanem szándék. A négyzetes csillapítás
    // egyetlen pontból nem tud egyenletesen bevilágítani egy 30 cellás
    // csarnokot — a közepe kiégne, a széle sötét maradna. Így a fény a
    // hatótávolságon belül közel egyenletes, a szélén pedig lágyan elfogy.
    this.allomasFeny = new THREE.PointLight(0xffc488, 0, 96, 0);
    this.allomasFeny.position.set(RACS_SZ * 0.5, 13, RACS_M * 0.5);
    this.jelenet.add(this.allomasFeny);
  }

  // ── NAPSZAK ─────────────────────────────────────────────────────────────

  /**
   * A világ órájából napszakot csinál. A hurok hívja képkockánként:
   * `szinter.napszak(sim.tick)`.
   *
   * Nulla allokáció: minden szín a KULCSOK előre elkészített `THREE.Color`-jai
   * közt interpolálódik, egyenesen a cél-objektumba (uniform, fény, köd).
   *
   * @param {number} tick a sim tickszáma — csak OLVASSUK
   */
  napszak(tick) {
    const t = Number.isFinite(tick) ? tick : 0;
    const a = (((t % NAP_TICK) + NAP_TICK) % NAP_TICK) / NAP_TICK;
    this.napszakArany = a;
    // Ugyanaz a görbe, amit a hangréteg használ — a két érzék ne mondjon mást.
    this.nappal = 0.5 - 0.5 * Math.cos(a * TAU);

    const K = NAPSZAK_KULCSOK;
    let i = 0;
    while (i < K.length - 2 && K[i + 1].t <= a) i++;
    const k0 = K[i], k1 = K[i + 1];
    const h = (a - k0.t) / Math.max(1e-6, k1.t - k0.t);

    const u = this.egAnyag.uniforms;
    u.also.value.copy(k0.a).lerp(k1.a, h);
    u.kozep.value.copy(k0.k).lerp(k1.k, h);
    u.felso.value.copy(k0.f).lerp(k1.f, h);

    this.jelenet.fog.color.copy(k0.kod).lerp(k1.kod, h);

    this.nap.color.copy(k0.ns).lerp(k1.ns, h);
    this.nap.intensity = k0.ne + (k1.ne - k0.ne) * h;

    this.egiFeny.color.copy(k0.ef).lerp(k1.ef, h);
    this.egiFeny.groundColor.copy(k0.ff).lerp(k1.ff, h);
    this.egiFeny.intensity = k0.fe + (k1.fe - k0.fe) * h;

    // A csillagok nem tűnnek el egy pillanat alatt: a `cs` görbe a hajnalt és
    // az alkonyt is átíveli, így a hunyorgás fokozatos.
    const cs = k0.cs + (k1.cs - k0.cs) * h;
    this.csillagok.material.opacity = cs * 0.82;
    this.csillagok.visible = cs > 0.02;
    // A ködsáv UGYANAZT a görbét követi, mint a csillagok: ha a kettő
    // külön járna, hajnalban egy csillagtalan galaxis maradna az égen.
    u.por.value = cs;

    this.allomasFeny.intensity = (1 - this.nappal) * 1.25;

    // ── A NAP PÁLYÁJA ─────────────────────────────────────────────────────
    // A magasság ALULRÓL KORLÁTOS (0,14). Ha a fény tényleg a horizont alá
    // menne, az árnyékkamera kifordulna, és éjjel a padló alól világítana —
    // ehelyett a „hold" alacsonyan, hidegen áll. A színt és az erőt úgyis a
    // kulcstábla intézi, tehát a geometriának nem kell fizikailag pontosnak
    // lennie, csak folytonosnak.
    const szog = (a - 0.25) * TAU;
    const magas = Math.sin(szog);
    this.nap.position.set(
      RACS_SZ * 0.5 + Math.cos(szog) * 52,
      14 + Math.max(0.14, magas) * 56,
      RACS_M * 0.5 + 26,
    );
  }

  /**
   * Ég: egy befelé fordított gömb függőleges színátmenettel, plusz csillagok.
   * Nincs textúra és nincs külső fájl — a `dist/` bárhová másolható marad.
   */
  _eg() {
    const anyag = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        also: { value: new THREE.Color(0x1b1330) },
        kozep: { value: new THREE.Color(0x3d2a6b) },
        felso: { value: new THREE.Color(0x0b1030) },
        // ── CSILLAGPOR ──────────────────────────────────────────────────
        // 0 nappal, 1 éjjel. Az égbolt eddig sima színátmenet volt: a
        // csillagok pontok voltak egy ÜRES vásznon. Egy dimenziókapu-állomás
        // fölött viszont épp az ég a világ ígérete — a ködsáv az, ami elmondja,
        // hogy nem a Földön vagyunk. Nappal ki KELL kapcsolni: fényes égen a
        // ködfolt piszoknak látszik, nem galaxisnak.
        por: { value: 0 },
      },
      vertexShader: `
        varying vec3 vPoz;
        void main() {
          vPoz = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      // ⚠️ A `colorspace_fragment` NEM díszítés. Enélkül a saját shaderünk a
      // LINEÁRIS színt írja ki nyersen, miközben a renderelő kimenete sRGB —
      // vagyis az ég sokkal sötétebb lett, mint amit a hexában beírtunk. Amíg
      // örök éjszaka volt, ez fel sem tűnt (a fekete fekete marad); a nappali
      // égnél viszont azonnal látszott, hogy a „világoskék" szürkéskék lesz.
      // A `linearToOutputTexel`-t a renderelő minden fragment-shaderbe beteszi.
      // A ködsáv PROCEDURÁLIS: érték-zaj három oktávban, egy nagy kör mentén
      // besűrítve. Nincs hozzá képfájl — ugyanaz a szabály, mint a többi
      // felületnél (`render/texturak.js`): a `dist/` bemásolható marad.
      fragmentShader: `
        uniform vec3 also; uniform vec3 kozep; uniform vec3 felso;
        uniform float por;
        varying vec3 vPoz;

        float mag(vec3 p) {
          return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        }
        /** Érték-zaj: rácspontok közt simán interpolálva. */
        float zaj(vec3 p) {
          vec3 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = mix(mix(mix(mag(i + vec3(0,0,0)), mag(i + vec3(1,0,0)), f.x),
                            mix(mag(i + vec3(0,1,0)), mag(i + vec3(1,1,0)), f.x), f.y),
                        mix(mix(mag(i + vec3(0,0,1)), mag(i + vec3(1,0,1)), f.x),
                            mix(mag(i + vec3(0,1,1)), mag(i + vec3(1,1,1)), f.x), f.y), f.z);
          return a;
        }

        void main() {
          vec3 ir = normalize(vPoz);
          float h = ir.y * 0.5 + 0.5;
          vec3 sz = mix(also, kozep, smoothstep(0.0, 0.55, h));
          sz = mix(sz, felso, smoothstep(0.55, 1.0, h));

          if (por > 0.01) {
            // A sáv egy megdöntött nagy kör mentén fut — így NEM vízszintes
            // csík, hanem átlósan átíveli az eget, ahogy egy galaxis peremét
            // belülről látni.
            vec3 tengely = normalize(vec3(0.42, 0.78, -0.46));
            float sav = 1.0 - smoothstep(0.0, 0.42, abs(dot(ir, tengely)));
            float f = zaj(ir * 5.0) * 0.55 + zaj(ir * 11.0) * 0.3 + zaj(ir * 23.0) * 0.15;
            f = smoothstep(0.42, 0.92, f);
            // Két szín: hideg ibolya a sáv testében, meleg rózsaszín a
            // csomópontokban. Ez a kettősség adja a mélységet.
            vec3 kod = mix(vec3(0.34, 0.28, 0.62), vec3(0.62, 0.36, 0.58), f);
            sz += kod * sav * f * por * 0.5;
          }

          gl_FragColor = vec4(sz, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.egAnyag = anyag;
    const eg = new THREE.Mesh(new THREE.SphereGeometry(220, 24, 16), anyag);
    eg.frustumCulled = false;
    this.jelenet.add(eg);

    // Csillagok: egyetlen Points, hash-alapú elhelyezéssel. Nem a sim
    // véletlenéből jön, mert a díszítésnek nem szabad a világ állapotát
    // mozgatnia — a render SOHA nem nyúlhat a sim generátorába.
    const db = 1500;
    const poz = new Float32Array(db * 3);
    for (let i = 0; i < db; i++) {
      const a = (i * 2.399963) % (Math.PI * 2);
      const b = Math.acos(1 - 2 * ((i + 0.5) / db)) - Math.PI * 0.5;
      const r = 190;
      poz[i * 3] = Math.cos(a) * Math.cos(b) * r;
      poz[i * 3 + 1] = Math.abs(Math.sin(b)) * r * 0.9 + 10;
      poz[i * 3 + 2] = Math.sin(a) * Math.cos(b) * r;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(poz, 3));
    // A méret 1,1 → 3,2: a régi érték 190 egység távolságból két képpont alatt
    // maradt, vagyis a csillagos ég a gyakorlatban ÜRES volt. Most, hogy a
    // napszak nappalra ki-, éjszakára bekapcsolja őket, ez a különbség
    // információt hordoz — látszania is kell. (A szonda 3. vizsgálata a
    // csillagok BE/KI állapotának képpont-különbségét méri, nem a hitét.)
    // ⚠️ `fog: false` — EZ EGY VALÓDI, MÉRÉSSEL MEGTALÁLT HIBA VOLT. A jelenet
    // ködje 165 egységnél teljesen befed, a csillagok viszont 190-en állnak:
    // MINDEN csillag pontosan a köd színét vette fel. Mivel a köd sötétebb,
    // mint az égbolt fölső sávja, a csillagok nemhogy nem világítottak — még
    // sötétítettek is. A szonda képpont-mérése ezt kapta el (a bekapcsolásuk
    // 35,87-ről 33,90-re VITTE a fényességet); szemmel évekig el lehetett
    // volna nézni fölötte, mert „valami" mindig látszott az égen.
    const csillagok = new THREE.Points(g, new THREE.PointsMaterial({
      color: 0xe8eeff, size: 3.2, sizeAttenuation: true,
      transparent: true, opacity: 0.75, depthWrite: false, fog: false,
    }));
    csillagok.frustumCulled = false;
    this.jelenet.add(csillagok);
    this.csillagok = csillagok;
  }

  // ── KAMERA ──────────────────────────────────────────────────────────────

  _kamerat() {
    const y = Math.cos(this.dolt) * this.tav;
    const v = Math.sin(this.dolt) * this.tav;
    this.kamera.position.set(
      this.cel.x + Math.cos(this.szog) * v,
      this.cel.y + y,
      this.cel.z + Math.sin(this.szog) * v,
    );
    this.kamera.lookAt(this.cel);
  }

  _vezerles() {
    const v = this.vaszon;
    v.addEventListener('contextmenu', (e) => e.preventDefault());

    let huz = 0, ex = 0, ey = 0;
    v.addEventListener('pointerdown', (e) => {
      if (e.button === 2) huz = 2;          // jobb: tolás
      else if (e.button === 1) huz = 1;     // közép: forgatás
      else return;
      ex = e.clientX; ey = e.clientY;
      v.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    v.addEventListener('pointerup', (e) => { huz = 0; try { v.releasePointerCapture(e.pointerId); } catch (_) { /* már elengedve */ } });
    v.addEventListener('pointermove', (e) => {
      const r = v.getBoundingClientRect();
      this.egerNdc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      this.egerNdc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      if (!huz) return;
      const dx = e.clientX - ex, dy = e.clientY - ey;
      ex = e.clientX; ey = e.clientY;
      if (huz === 2) this._tol(dx, dy);
      else { this.szog -= dx * 0.006; this.dolt = korlat(this.dolt - dy * 0.005, 0.12, 1.32); }
      this._kamerat();
    });

    v.addEventListener('wheel', (e) => {
      e.preventDefault();
      // A zoom a kurzor alatti talajpont FELÉ húz, nem a képernyő közepe felé.
      // Ettől lesz „ráközelítek arra a boltra" élmény a „nagyítok" helyett.
      const elotte = this.talajPont();
      this.tav = korlat(this.tav * (e.deltaY > 0 ? 1.11 : 0.9), 9, 130);
      this._kamerat();
      if (elotte) {
        const utana = this.talajPont();
        if (utana) {
          this.cel.x += elotte.x - utana.x;
          this.cel.z += elotte.z - utana.z;
          this._hatarolCel();
          this._kamerat();
        }
      }
    }, { passive: false });

    this.nyomott = new Set();
    addEventListener('keydown', (e) => {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      this.nyomott.add(e.key.toLowerCase());
    });
    addEventListener('keyup', (e) => this.nyomott.delete(e.key.toLowerCase()));
  }

  _tol(dx, dy) {
    const l = this.tav * 0.0016;
    const s = Math.sin(this.szog), c = Math.cos(this.szog);
    this.cel.x += (-dx * s + dy * c) * l;
    this.cel.z += (dx * c + dy * s) * l;
    this._hatarolCel();
  }

  /** A kamera ne tudjon elveszni a semmiben — a rácsot körülvevő sávban marad. */
  _hatarolCel() {
    this.cel.x = korlat(this.cel.x, -14, RACS_SZ + 14);
    this.cel.z = korlat(this.cel.z, -14, RACS_M + 14);
  }

  /** Billentyűs tolás/forgatás — képkockánként hívva. */
  billentyu(dt) {
    const n = this.nyomott;
    if (n.size === 0) return;
    const l = this.tav * dt * 1.5;
    const s = Math.sin(this.szog), c = Math.cos(this.szog);
    let mx = 0, mz = 0;
    if (n.has('w') || n.has('arrowup')) mz -= 1;
    if (n.has('s') || n.has('arrowdown')) mz += 1;
    if (n.has('a') || n.has('arrowleft')) mx -= 1;
    if (n.has('d') || n.has('arrowright')) mx += 1;
    if (mx || mz) {
      this.cel.x += (mx * c - mz * s) * l;
      this.cel.z += (mx * s + mz * c) * l;
      this._hatarolCel();
    }
    if (n.has('q')) this.szog -= dt * 1.1;
    if (n.has('e')) this.szog += dt * 1.1;
    if (mx || mz || n.has('q') || n.has('e')) this._kamerat();
  }

  /** Az egér alatti talajpont világkoordinátában, vagy null. */
  talajPont() {
    this.sugar.setFromCamera(this.egerNdc, this.kamera);
    this._talaj.constant = -this.talajY;
    const p = this.sugar.ray.intersectPlane(this._talaj, this._talajPont);
    return p ? p : null;
  }

  /** Az egér alatti rácscella, vagy null, ha a rácson kívül van. */
  egerCella() {
    const p = this.talajPont();
    if (!p) return null;
    const x = Math.floor(p.x), y = Math.floor(p.z);
    if (x < 0 || y < 0 || x >= RACS_SZ || y >= RACS_M) return null;
    return { x, y };
  }

  meretez() {
    const sz = innerWidth, m = innerHeight;
    this.renderelo.setSize(sz, m, false);
    this.kamera.aspect = sz / Math.max(1, m);
    this.kamera.updateProjectionMatrix();
  }

  rajzol() { this.renderelo.render(this.jelenet, this.kamera); }
}

function korlat(x, a, b) { return x < a ? a : (x > b ? b : x); }
