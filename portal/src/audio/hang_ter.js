// PORTAL HUB TYCOON — TÉR ÉS KIMENET.
//
// ── MIÉRT VAN EZ A FÁJL ───────────────────────────────────────────────────
// A `hang.js` eddig egyetlen PONTBÓL szólt. Minden réteg monó volt, minden
// effekt középen ült, és a keverék sztereó-korrelációja pontosan 1,000 volt —
// mérve. Egy dimenziók közötti pályaudvar, amiben ezer lény nyüzsög három
// szinten, nem egy pont: ha annak hangzik, az agy „kis doboz"-ként hallja, és
// húsz perc után fárasztó lesz akkor is, ha külön-külön minden hang szép.
//
// Két dolog hiányzott, és mindkettő a kimeneti fokozat kérdése:
//
//   TÉR      — a hangoknak IRÁNYA és TÁVOLSÁGA van (panoráma), és közös
//              terük van (zengés). A zengés az, amitől a sok külön effekt
//              EGY helyen szól, nem tizenkét különálló szintetizátorként.
//   VÉDELEM  — 24 esemény egyetlen képkockában 1,469-es csúcsot adott, azaz
//              40 mintányi kemény levágást a limiter UTÁN is. A kemény
//              levágás az egyetlen torzítás, amit a fül azonnal „hibának"
//              hall, nem hangszínnek.
//
// Mindkettő a jel ÚTJÁRÓL szól, nem az egyes hangok tartalmáról — ezért van
// külön fájlban, és ezért nem a katalógusban: itt gráf épül, nem adat.
//
// ── MIÉRT PROCEDURÁLIS A ZENGÉS IS ────────────────────────────────────────
// A `ConvolverNode` szokásos használata egy fölvett impulzusválasz betöltése
// — az viszont hangfájl lenne, és a projekt ígérete pont az, hogy a `dist/`
// második hálózati kérés nélkül másolható bárhová. Egy exponenciálisan
// lecsengő, sötétített zajlöket ugyanazt a munkát elvégzi néhány sorban, és
// mivel MI állítjuk elő, a terem méretét egy számmal hangoljuk.
//
// A `Math.random` itt szabad: ez a render oldal, a determinizmus-tilalom a
// `src/sim/`-re vonatkozik. A zengés magja amúgy is csak a hangSZÍNT adja,
// állapotot nem hordoz.

/**
 * Sztereó impulzusválasz — „nagy, sötét csarnok".
 *
 * Három dolog van benne, és mind a háromra szükség van:
 *   1. KORAI VISSZAVERŐDÉSEK — néhány ritka tüske az első 70 ms-ban. Ez
 *      mondja meg a fülnek, hogy a terem NAGY; enélkül a farok önmagában
 *      csak ködöt ad, méretet nem.
 *   2. SŰRŰ FAROK — exponenciálisan halkuló zaj.
 *   3. SÖTÉTÍTÉS — egypólusú aluláteresztő a farkon, ami a lecsengés VÉGE
 *      felé egyre erősebb. Valódi teremben a magas frekvenciák hamarabb
 *      halnak el (a levegő és a falak elnyelik); enélkül a zengés sziszeg,
 *      és pont a fárasztó 2–5 kHz-es sávot dobná vissza.
 *
 * A két csatorna FÜGGETLEN véletlenből épül — ez adja a szélességet. Ha
 * ugyanaz a zaj menne mindkettőre, a zengés is középen ülne.
 *
 * @param {BaseAudioContext} ctx
 * @param {{hossz:number, csillapodas:number, sotetseg:number, koraiDb:number}} t
 * @returns {AudioBuffer}
 */
export function zengetoPuffer(ctx, t) {
  const sr = ctx.sampleRate;
  const n = Math.max(64, Math.floor(sr * t.hossz));
  const puf = ctx.createBuffer(2, n, sr);

  for (let ch = 0; ch < 2; ch++) {
    const d = puf.getChannelData(ch);
    let simitott = 0;
    for (let i = 0; i < n; i++) {
      const arany = i / n;
      // Exponenciális lecsengés. A `csillapodas` a „terem tömöttsége":
      // nagyobb szám = rövidebb, szárazabb tér.
      const burok = Math.exp(-t.csillapodas * arany);
      const nyers = (Math.random() * 2 - 1) * burok;
      // A sötétítés a farok felé erősödik: az együttható 1-ről a `sotetseg`
      // felé csúszik, tehát a vége egyre tompább.
      const a = 1 - (1 - t.sotetseg) * arany;
      simitott += (nyers - simitott) * a;
      d[i] = simitott;
    }
    // Korai visszaverődések: ritkuló tüskék, csatornánként MÁS időpontban —
    // ettől lesz a terem szélesebb, mint amilyen mély.
    let hol = Math.floor(sr * (0.006 + ch * 0.0031));
    let ero = t.koraiDb;
    while (hol < n && hol < sr * 0.075) {
      d[hol] += ero * (Math.random() < 0.5 ? -1 : 1);
      hol += Math.floor(sr * (0.004 + Math.random() * 0.012));
      ero *= 0.78;
    }
  }

  // Normálás energiára: enélkül a zengés hangereje a hossztól függene, és
  // minden hangolásnál újra kellene keverni.
  let ossz = 0;
  for (let ch = 0; ch < 2; ch++) {
    const d = puf.getChannelData(ch);
    for (let i = 0; i < n; i++) ossz += d[i] * d[i];
  }
  const norm = ossz > 0 ? 1 / Math.sqrt(ossz / (2 * n)) : 1;
  for (let ch = 0; ch < 2; ch++) {
    const d = puf.getChannelData(ch);
    for (let i = 0; i < n; i++) d[i] *= norm * 0.045;
  }
  return puf;
}

/**
 * Puha vágógörbe a lánc VÉGÉRE, a limiter után.
 *
 * ── MIÉRT KELL, HA MÁR VAN LIMITER ───────────────────────────────────────
 * A `DynamicsCompressor` időállandóval dolgozik: 2–4 ms alatt húzza le a
 * jelet. Egy fanfár, egy összeomlás és tíz kattintás EGYAZON képkockában
 * viszont nem 4 ms alatt épül fel, hanem egyetlen minta alatt — a limiter
 * még nem is reagált, amikor a csúcs már 1,4-nél jár. Ott a hangkártya
 * KEMÉNYEN vág, és a kemény vágás négyszögjelet csinál: ez az a reccsenés,
 * amit a fül azonnal hibaként hall.
 *
 * A `tanh` alakú görbe ezt úgy előzi meg, hogy a nagy jeleket FOLYAMATOSAN
 * hajlítja az 1,0 felé — sosem éri el, tehát matematikailag nem lehet
 * levágás. Kis jelnél (a játék 99 %-a) a görbe gyakorlatilag egyenes, tehát
 * a normál hangképet nem színezi.
 *
 * @param {number} n mintaszám (páratlan, hogy a 0 pontosan benne legyen)
 * @param {number} hajlat 1 = alig, 3 = telítettebb
 * @returns {Float32Array}
 */
export function puhaGorbe(n, hajlat) {
  const g = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    g[i] = Math.tanh(x * hajlat) / Math.tanh(hajlat);
  }
  return g;
}

/**
 * Panorámázó, ami régi böngészőben sem dől el.
 * A `StereoPannerNode` ma mindenhol megvan, de ha valahol mégsem, akkor egy
 * sima erősítés a helyettesítője: a hang középen marad, de SZÓL — a néma
 * játék sokkal rosszabb, mint a monó játék.
 * @returns {StereoPannerNode|GainNode}
 */
export function panoramazo(ctx, ertek) {
  if (typeof ctx.createStereoPanner === 'function') {
    const p = ctx.createStereoPanner();
    p.pan.value = ertek;
    return p;
  }
  return ctx.createGain();
}

/**
 * Világkoordinátából panoráma és távolság.
 *
 * A kamera a `cel` pont körül kering `szog` szöggel; a nézet JOBB iránya
 * ebből (sin szög, −cos szög). A vetület ezen az irányon adja, hogy a
 * hangforrás a képernyő melyik oldalán van — ugyanaz a szám, amit a szem is
 * lát, tehát a kettő nem csúszhat szét.
 *
 * Nulla allokáció: a hívó ad egy újrahasznált célobjektumot.
 *
 * @param {{x:number,z:number,szog:number,tav:number}} kam
 * @param {number} vx világ-x
 * @param {number} vz világ-z
 * @param {{pan:number, tavolsag:number}} ki újrahasznált kimenet
 */
export function terbe(kam, vx, vz, ki) {
  const dx = vx - kam.x;
  const dz = vz - kam.z;
  const jx = Math.sin(kam.szog);
  const jz = -Math.cos(kam.szog);
  const oldal = dx * jx + dz * jz;
  const sugar = Math.max(8, kam.tav * 0.55);
  let p = oldal / sugar;
  if (p < -1) p = -1; else if (p > 1) p = 1;
  ki.pan = p;
  ki.tavolsag = Math.sqrt(dx * dx + dz * dz);
  return ki;
}
