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

  // ── NORMÁLÁS: A NÉGYZETÖSSZEGRE, NEM AZ RMS-RE ────────────────────────
  // Egy konvolúció ERŐSÍTÉSE nem a válasz átlagos amplitúdója, hanem a
  // négyzetösszegének gyöke — az energia. Az első változat mintánkénti
  // RMS-re normált 0,045-re, ami 72 000 mintán √(0,045²·72000) ≈ 12-szeres
  // erősítést jelentett: a zengés HÁROMSZOR hangosabb lett a száraz jelnél,
  // és az egész keverék a zengetőn keresztül szólt. Így viszont a zengető
  // egységnyi erősítésű, tehát a szintje ott van, ahol a keverő mondja — és
  // a terem hosszának hangolása nem mozdítja el a hangerőt.
  for (let ch = 0; ch < 2; ch++) {
    const d = puf.getChannelData(ch);
    let ossz = 0;
    for (let i = 0; i < n; i++) ossz += d[i] * d[i];
    const norm = ossz > 0 ? 1 / Math.sqrt(ossz) : 1;
    for (let i = 0; i < n; i++) d[i] *= norm;
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
 * A görbe LÁGY TÉRDŰ: a `kuszob` alatt pontosan egyenes (meredeksége 1),
 * fölötte `tanh`-hal hajlik. Két dolog múlik ezen, és mindkettőt drágán
 * tanultuk meg:
 *
 *   1. A MEREDEKSÉG A NULLÁBAN PONTOSAN 1 LEGYEN. Az első változat
 *      `tanh(x·a)/tanh(a)` volt — az a kis jeleket a/tanh(a) = 1,63-szorosára
 *      ERŐSÍTI. Mérve: a teljes keverék RMS-e 0,160-ról 0,260-ra ugrott
 *      (+4,3 dB) attól a görbétől, ami elvileg csak véd. A védelem, ami
 *      hangosít, nem védelem.
 *   2. A MAXIMUM MARADJON 1,0 ALATT. A `WaveShaper` az 1,0 fölötti bemenetet
 *      a görbe utolsó pontjára szorítja — ha az pont 1,0, akkor a „puha"
 *      vágó pontosan ugyanúgy 1,0-ra vág, mint a hangkártya. A térd 0,62-nél
 *      van, tehát a legnagyobb lehetséges kimenet 0,62 + 0,38·tanh(1) = 0,91.
 *
 * @param {number} n mintaszám (páratlan, hogy a 0 pontosan benne legyen)
 * @param {number} kuszob eddig egyenes; fölötte hajlik (0,4…0,8)
 * @returns {Float32Array}
 */
export function puhaGorbe(n, kuszob) {
  const g = new Float32Array(n);
  const k = kuszob < 0.2 ? 0.2 : kuszob > 0.9 ? 0.9 : kuszob;
  const sav = 1 - k;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    const y = a <= k ? a : k + sav * Math.tanh((a - k) / sav);
    g[i] = x < 0 ? -y : y;
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
