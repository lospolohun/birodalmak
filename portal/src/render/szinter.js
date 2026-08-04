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

import * as THREE from 'three';
import { RACS_SZ, RACS_M } from '../mag/config.js';

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
    this.jelenet.add(new THREE.HemisphereLight(0x9fd8ff, 0x2a1f3a, 0.85));
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
      },
      vertexShader: `
        varying vec3 vPoz;
        void main() {
          vPoz = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 also; uniform vec3 kozep; uniform vec3 felso;
        varying vec3 vPoz;
        void main() {
          float h = normalize(vPoz).y * 0.5 + 0.5;
          vec3 sz = mix(also, kozep, smoothstep(0.0, 0.55, h));
          sz = mix(sz, felso, smoothstep(0.55, 1.0, h));
          gl_FragColor = vec4(sz, 1.0);
        }`,
    });
    const eg = new THREE.Mesh(new THREE.SphereGeometry(220, 24, 16), anyag);
    eg.frustumCulled = false;
    this.jelenet.add(eg);

    // Csillagok: egyetlen Points, hash-alapú elhelyezéssel. Nem a sim
    // véletlenéből jön, mert a díszítésnek nem szabad a világ állapotát
    // mozgatnia — a render SOHA nem nyúlhat a sim generátorába.
    const db = 900;
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
    const csillagok = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xd8e4ff, size: 1.1, sizeAttenuation: true, transparent: true, opacity: 0.75 }));
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
