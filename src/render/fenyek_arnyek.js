// AGE OF THE CRYSTALS — VETETT ÁRNYÉK: árnyéktérkép-kezelés (v0.16).
//
// A `core3d.js` fejléce a v0.1 óta ezt írta: „az árnyéktérkép ára SZERKEZETI,
// nem hangolható". Ez akkor igaz volt, mert a mérés célja 1600 animált figura
// volt, és a szonda ítéletétől függött, van-e egyáltalán motor. Most van:
// 1600 egységnél p95 9,3 ms, a kapu 16,7 ms. A maradék ~7 ms-ból lehet
// árnyékot venni — de csak úgy, ha PONTOSAN tudjuk, mit veszünk rajta.
//
// ── HÁROM FOKOZAT, MERT AZ ÁR NEM EGYETLEN SZÁM ───────────────────────────
//   KI       nincs árnyéktérkép, nincs második menet, nincs shader-ág
//   KOZEPES  1024², a STATIKUS világ vet (fa, szikla, épület, ostromgép);
//            a terep fogadja. Az egységek NEM vetnek.
//   MAGAS    2048², és az EGYSÉGEK IS vetnek
//
// A lépcső nem a felbontásról szól, hanem arról, hogy MI KERÜL A MÁSODIK
// MENETBE. A felbontás duplázása kitöltés-költség (négyszeres képpont a
// mélységmenetben), az egységek beengedése viszont CSÚCS-költség: 1600 figura
// geometriája megy át mégegyszer. A kettő külön ok, ezért külön fokozat.
//
// ── AMI EBBŐL A LEGTÖBBET HOZZA: AZ ÁRNYÉKTÉRKÉP NEM FRISSÜL MINDEN KÉPKOCKÁN
// KOZEPES fokozaton a vetők NEM MOZOGNAK. Egy fa árnyéka csak akkor változik,
// ha a nap elfordul, vagy ha a fény-kamera arrébb megy (a játékos pásztáz).
// Ezért `shadowMap.autoUpdate = false`, és a menetet csak akkor kérjük, ha
// tényleg történt valami. Álló kamera mellett ez másodpercenként ~4 menet 60
// helyett — a KOZEPES fokozat ára ezzel nagyságrenddel a naiv változaté alá
// esik.
//
// ⚠️ Ez pontosan az a fajta okos gyorstár, amiből néma hiba lesz: ha egy új
// épület felépül és a gyorstár nem tud róla, ÁRNYÉK NÉLKÜL áll ott, örökre.
// Ezért van felső korlát (`KENYSZER_KEPKOCKA`): akármit is gondol a gyorstár,
// negyed másodpercenként úgyis lefut a menet. A gyorstár így csak spórolni
// tud, hibázni nem.
//
// ── MIÉRT PÁSZTÁZZUK A JELENETET, MIÉRT NEM A RÉTEGEK ÁLLÍTJÁK A ZÁSZLÓT ──
// Mert a v0.16-ot tizenhat agent írja párhuzamosan, és a `castShadow` /
// `receiveShadow` zászló tizenhárom rétegfájlban lenne szétszórva. Aki új
// réteget vesz fel, az elfelejtené — és a hiánya NÉMA (a tárgy egyszerűen nem
// vet árnyékot, hibaüzenet nélkül). Így viszont egy helyen, egy szabály
// szerint dől el, és az ÚJ réteg alapból helyesen viselkedik.
//
// A besorolás a jelenet-gráf NEVEIBŐL megy (`terep`, `viz`, `diszlet`,
// `egysegek3d`), ami már megvolt, plusz egy anyag-alapú alapértelmezés. A
// szabály: `MeshBasicMaterial` SOSEM vet és SOSEM fogad. Ebben a projektben a
// megvilágítatlan anyag mindig izzó vagy jelölő (kristály-ragyogás, lövedék,
// kijelölő gyűrű) — annak az árnyéka értelmetlen lenne.
//
// ── TEXEL-RÁCSRA PATTINTÁS ────────────────────────────────────────────────
// A fény-kamera a nézet fókuszát követi. Ha simán követné, az árnyékok
// pásztázás közben SZIKRÁZNÁNAK: a vetett él képkockánként másik texelre
// esne. Ezért a fókuszt a fény síkjában texel-rácsra pattintjuk. Két legyet
// üt: megszűnik a szikrázás, ÉS a kis kameramozgás nem is változtatja meg a
// fény-kamerát, tehát a fenti gyorstár sem esik ki fölöslegesen.

import * as THREE from 'three';
// Közvetlenül a `three`-ből — lásd a `fenyek_egbolt.js` azonos megjegyzését
// (a `core3d.js` importálja ezt a fájlt, tehát a visszahivatkozás körkörös).

export const ARNYEK = { KI: 0, KOZEPES: 1, MAGAS: 2 };

/** Fokozatonként: térkép-oldal · maximális fedett sugár · vetnek-e az egységek. */
const FOKOZAT = [
  { meret: 0, sugar: 0, egysegek: false },
  { meret: 1024, sugar: 95, egysegek: false },
  { meret: 2048, sugar: 130, egysegek: true },
];

/** A fedett sugár a kamera-távolságból. Kizoomolva sem nő a végtelenségig. */
const SUGAR_ARANY = 0.85;
const SUGAR_MIN = 34;

/** Ennyi képkockánként MINDENKÉPP újrarajzoljuk a térképet. Lásd a fejlécet. */
const KENYSZER_KEPKOCKA = 15;

/** Ennyi képkockánként pásztázzuk újra a jelenetet új vetőkért. */
const PASZTA_KEPKOCKA = 30;

/** Ennyi világegységnyi elmozdulás alatt a fény-kamerát változatlannak vesszük. */
const FIT_EPS = 0.5;

const SAV = { EGYEB: 0, TEREP: 1, VIZ: 2, DISZLET: 3, EGYSEG: 4, SEMMI: 5 };

/** Jelenet-gráf nevek → sáv. A név a rétegek MEGLÉVŐ szerződése. */
const NEV_SAV = {
  terep: SAV.TEREP,
  viz: SAV.VIZ,
  diszlet: SAV.DISZLET,
  egysegek3d: SAV.EGYSEG,
  egbolt: SAV.SEMMI,
};

export class ArnyekKezelo {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.Scene} jelenet
   * @param {THREE.DirectionalLight} nap az EGYETLEN árnyékvető fény
   * @param {{szint?:number}} [opciok]
   */
  constructor(renderer, jelenet, nap, opciok = {}) {
    this.renderer = renderer;
    this.jelenet = jelenet;
    this.nap = nap;

    // A célpont a jelenetbe kell: `DirectionalLight` a `position - target`
    // irányból süt, és a `target` mátrixa csak akkor frissül, ha a gráf része.
    // Enélkül a fény a világ origója felé nézne, a fény-kamera pedig a pálya
    // sarkát fedné le — árnyék lenne, csak épp nem ott, ahol nézünk.
    if (!nap.target.parent) jelenet.add(nap.target);

    // Előre foglalt munkavektorok — a `frissit()` egyetlen objektumot sem hoz létre.
    this._ir = new THREE.Vector3(0, 1, 0);
    this._jobbra = new THREE.Vector3();
    this._fel = new THREE.Vector3();
    this._fokusz = new THREE.Vector3();
    this._fel0 = new THREE.Vector3(0, 1, 0);

    this._szint = -1;
    this._sugar = 0;
    this._texel = 0;
    this._varakozas = 0;
    this._paszta = 0;
    this._ujraJelolve = false;
    /** Diagnosztika: hány mesh vet, hány fogad. A jelentéshez és a szondához. */
    this.vetok = 0;
    this.fogadok = 0;

    this.szint = opciok.szint ?? ARNYEK.KOZEPES;
  }

  // ── FOKOZAT ──────────────────────────────────────────────────────────────

  /** @param {number} v `ARNYEK.*` */
  set szint(v) {
    const uj = Math.max(0, Math.min(2, v | 0));
    if (uj === this._szint) return;
    this._szint = uj;
    const f = FOKOZAT[uj];

    const r = this.renderer;
    r.shadowMap.enabled = uj > ARNYEK.KI;
    // PCF-soft mindkét bekapcsolt fokozaton: ugyanannyi mintavétel, mint a
    // sima PCF, viszont bilineárisan súlyoz — a lágy perem ingyen van.
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    // Lásd a fejléc gyorstár-szakaszát: a menetet MI kérjük, nem a Three.
    r.shadowMap.autoUpdate = false;
    r.shadowMap.needsUpdate = uj > ARNYEK.KI;

    const sh = this.nap.shadow;
    this.nap.castShadow = uj > ARNYEK.KI;
    if (uj > ARNYEK.KI) {
      // A térkép átméretezéséhez el kell dobni a régi rendercélt, különben a
      // Three a régi méretűt használja tovább — ez a fajta „beállítottam, de
      // nem hatott" hiba órákat visz el.
      if (sh.map && (sh.mapSize.width !== f.meret)) { sh.map.dispose(); sh.map = null; }
      sh.mapSize.set(f.meret, f.meret);
      sh.camera.near = 1;
      sh.bias = -0.0006;
      sh.blurSamples = 8;
    }

    // A fokozatváltás megváltoztatja a shader-definíciókat (`USE_SHADOWMAP`),
    // amit a Three magától csak a fény-állapot verziójából venne észre. Egy
    // sweep olcsóbb, mint egy fél napos hibakeresés amiatt, hogy a terep
    // shadere árnyék nélkül maradt.
    this._anyagFrissites();
    // AZONNAL újrajelölünk, nem a következő pásztázásra bízzuk. KI fokozaton
    // a `frissit()` már az első sorban visszatér, tehát a zászlókat SOSEM
    // takarítaná ki senki: a fa `castShadow = true` maradna örökre. Ez így
    // magában ártalmatlan (a Three nem rajzol árnyékmenetet kikapcsolt
    // `shadowMap` mellett), de pont az a fajta hazug állapot, amiből a
    // következő fokozat-váltásnál lesz megmagyarázhatatlan hiba.
    this._paszta = PASZTA_KEPKOCKA;
    this._pasztaz();
    this._varakozas = KENYSZER_KEPKOCKA;
    this._sugar = 0;   // kényszerítsd a fény-kamera újraszámolását
  }

  get szint() { return this._szint; }

  _anyagFrissites() {
    this.jelenet.traverse((o) => {
      const a = o.material;
      if (!a) return;
      if (Array.isArray(a)) { for (let i = 0; i < a.length; i++) a[i].needsUpdate = true; }
      else a.needsUpdate = true;
    });
  }

  // ── ZÁSZLÓ-PÁSZTÁZÁS ─────────────────────────────────────────────────────

  _pasztaz() {
    this.vetok = 0; this.fogadok = 0;
    const gy = this.jelenet.children;
    for (let i = 0; i < gy.length; i++) this._bejar(gy[i], SAV.EGYEB);
  }

  /** @param {THREE.Object3D} o @param {number} sav */
  _bejar(o, sav) {
    const s = (o.name && NEV_SAV[o.name] !== undefined) ? NEV_SAV[o.name] : sav;
    if (o.isMesh) this._zaszlo(o, s);
    const gy = o.children;
    for (let i = 0; i < gy.length; i++) this._bejar(gy[i], s);
  }

  /** @param {THREE.Mesh} o @param {number} sav */
  _zaszlo(o, sav) {
    const be = this._szint > ARNYEK.KI;
    const nyers = o.material;
    const a = Array.isArray(nyers) ? nyers[0] : nyers;
    // Megvilágítatlan vagy átlátszó → se nem vet, se nem fogad. Lásd a fejlécet.
    const kizart = !a || a.isMeshBasicMaterial === true || a.transparent === true || a.depthWrite === false;

    let vet = false, fogad = false;
    if (be && !kizart) {
      switch (sav) {
        case SAV.TEREP: fogad = true; break;                       // a terep csak fogad
        case SAV.VIZ: break;
        case SAV.DISZLET: vet = true; break;
        case SAV.EGYSEG: vet = FOKOZAT[this._szint].egysegek; break;
        case SAV.SEMMI: break;
        default: vet = true; fogad = true; break;                  // épületek, ostromgép
      }
    }
    o.castShadow = vet;
    o.receiveShadow = fogad;
    if (vet) this.vetok++;
    if (fogad) this.fogadok++;
  }

  // ── KÉPKOCKÁNKÉNTI MUNKA ─────────────────────────────────────────────────

  /**
   * A fény-kamera ráigazítása a nézetre, és annak eldöntése, kell-e egyáltalán
   * árnyék-menet ebben a képkockában.
   *
   * @param {ReturnType<typeof import('./fenyek_ciklus.js').ujNapAllapot>} nap
   * @param {{x:number,y:number,z:number,tav:number}|null} kamBurok a kamera-burkoló
   * @param {THREE.Camera|null} kamera tartalék, ha nincs burkoló
   */
  frissit(nap, kamBurok, kamera) {
    if (this._szint === ARNYEK.KI) return;

    // Új vetők keresése (felépült ház, kilőtt ostromgép) — ritkán.
    if (--this._paszta <= 0) {
      this._paszta = PASZTA_KEPKOCKA;
      const elozoVetok = this.vetok;
      this._pasztaz();
      this._ujraJelolve = this.vetok !== elozoVetok;
    }

    const valtozott = this._fit(nap, kamBurok, kamera);

    let kell = valtozott || this._ujraJelolve;
    if (FOKOZAT[this._szint].egysegek) kell = true;   // a figurák mozognak
    if (++this._varakozas >= KENYSZER_KEPKOCKA) kell = true;
    if (kell) {
      this.renderer.shadowMap.needsUpdate = true;
      this._varakozas = 0;
      this._ujraJelolve = false;
    }
  }

  /**
   * A fény-kamera beállítása. `true`, ha érdemben elmozdult.
   * @returns {boolean}
   */
  _fit(nap, kamBurok, kamera) {
    // ── FÓKUSZ ÉS SUGÁR ────────────────────────────────────────────────────
    let fx, fy, fz, tav;
    if (kamBurok && typeof kamBurok.tav === 'number') {
      fx = kamBurok.x; fy = kamBurok.y; fz = kamBurok.z; tav = kamBurok.tav;
    } else if (kamera) {
      // Tartalék: a kamera alatti talajpont. Pontatlan, de sosem hagyja
      // árnyék nélkül a képet.
      fx = kamera.position.x; fy = 0; fz = kamera.position.z; tav = kamera.position.y || 120;
    } else return false;

    const max = FOKOZAT[this._szint].sugar;
    let R = tav * SUGAR_ARANY;
    if (R < SUGAR_MIN) R = SUGAR_MIN; else if (R > max) R = max;

    const meret = FOKOZAT[this._szint].meret;
    const texel = (2 * R) / meret;

    // ── A FÉNY BÁZISA ──────────────────────────────────────────────────────
    this._ir.set(nap.irX, nap.irY, nap.irZ);
    // A nap sosem áll a zeniten (58° a maximum), tehát a felfelé vektorral
    // vett keresztszorzat nem fajul el. A `normalize` így is biztosít.
    this._jobbra.crossVectors(this._fel0, this._ir);
    if (this._jobbra.lengthSq() < 1e-8) this._jobbra.set(1, 0, 0);
    this._jobbra.normalize();
    this._fel.crossVectors(this._ir, this._jobbra).normalize();

    // ── TEXEL-RÁCSRA PATTINTÁS ─────────────────────────────────────────────
    const fr = fx * this._jobbra.x + fy * this._jobbra.y + fz * this._jobbra.z;
    const fu = fx * this._fel.x + fy * this._fel.y + fz * this._fel.z;
    const dfr = Math.round(fr / texel) * texel - fr;
    const dfu = Math.round(fu / texel) * texel - fu;
    fx += this._jobbra.x * dfr + this._fel.x * dfu;
    fy += this._jobbra.y * dfr + this._fel.y * dfu;
    fz += this._jobbra.z * dfr + this._fel.z * dfu;

    // ── VÁLTOZOTT-E? ───────────────────────────────────────────────────────
    const D = R * 1.7 + 90;
    const px = fx + this._ir.x * D, py = fy + this._ir.y * D, pz = fz + this._ir.z * D;
    const p = this.nap.position;
    const sugarValt = Math.abs(R - this._sugar) > FIT_EPS;
    const helyValt = Math.abs(p.x - px) > FIT_EPS || Math.abs(p.y - py) > FIT_EPS || Math.abs(p.z - pz) > FIT_EPS;
    if (!sugarValt && !helyValt) return false;

    p.set(px, py, pz);
    this.nap.target.position.set(fx, fy, fz);
    this._fokusz.set(fx, fy, fz);

    if (sugarValt) {
      const c = this.nap.shadow.camera;
      c.left = -R; c.right = R; c.top = R; c.bottom = -R;
      c.far = D + R * 1.7 + 90;
      c.updateProjectionMatrix();
      this._sugar = R;
      this._texel = texel;
      // A normál menti eltolás a texel VILÁGMÉRETÉHEZ kötött: 1024-en R=95-nél
      // 0,19 egység, 2048-on R=130-nál 0,13. Fix számmal az egyik fokozat
      // biztosan rossz lenne — vagy csíkos (acne), vagy elszakadt árnyékú.
      this.nap.shadow.normalBias = texel * 1.7;
    }
    return true;
  }

  // ── DIAGNOSZTIKA ─────────────────────────────────────────────────────────

  /** A szonda és a jelentés számai. Nem allokál új objektumot minden hívásra. */
  allapot(ki) {
    const o = ki || {};
    o.szint = this._szint;
    o.meret = FOKOZAT[this._szint].meret;
    o.sugar = this._sugar;
    o.texelVilag = this._texel;
    o.vetok = this.vetok;
    o.fogadok = this.fogadok;
    return o;
  }

  bont() {
    const sh = this.nap.shadow;
    if (sh.map) { sh.map.dispose(); sh.map = null; }
  }
}
