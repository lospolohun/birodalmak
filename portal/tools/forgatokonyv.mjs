// PORTAL HUB TYCOON — SZONDA-FORGATÓKÖNYVEK.
//
// ── MIÉRT KÜLÖN FÁJL ──────────────────────────────────────────────────────
// A determinizmus-szonda nem találja meg magától az új kódot: FORGATÓKÖNYVBŐL
// dolgozik. Ha egy alrendszer nem szerepel egyik forgatókönyvben sem, akkor a
// szonda zöld marad, miközben az az alrendszer szétcsúszhat. Az AoC-nál ez
// többször megtörtént, ezért itt a forgatókönyv KÜLÖN fájl, hogy látszódjon,
// és hogy új parancsfajtánál egyértelmű legyen, hova kell hozzáírni.
//
// ⚠️ HA ÚJ PARANCSFAJTÁT VESZEL FEL, VEDD BELE IDE IS. A legfrissebb kód a
// legkockázatosabb; ha az marad a kapun kívül, a zöld szonda hamis
// biztonságérzetet ad.
//
// ── MIÉRT ÁLLAPOTFÜGGŐ ÉS NEM CSAK IDŐZÍTETT ──────────────────────────────
// Az első változat fix tick-listából dolgozott, és emiatt SOHA nem jutott
// túl a II. fejezeten: a második kaput a 1000. tickben akarta megnyitni, de a
// dimenzió koordinátáját a történet csak a 3000. körül adta meg. A parancs
// elutasításba futott, a szonda meg vidáman zöld maradt — pontosan az a hamis
// biztonságérzet, ami ellen ez a fájl fejléce szól.
//
// Ezért a forgatókönyv FELTÉTELES: azt csinálja, amit egy játékos csinálna
// („ha felfedeztem egy világot és van rá pénzem, megnyitom"). Ettől nem lesz
// kevésbé determinisztikus — a feltételek a sim állapotából jönnek, az pedig
// maga is determinisztikus.
//
// ⚠️ A `v01` FORGATÓKÖNYV SOSEM VÁLTOZHAT. Az a motor-mag regresszió-őre, és
// a `qa/V0.1_EREDMENY.md` számai ehhez vannak kötve. Új próbához új függvényt
// írj (`v02`, `v03`, …).

/** A kutatások sorrendje — egy „normális" játékos fejlesztési íve. */
const KUTATAS_SOR = [
  'gyors_sorok', 'kapu_hangolas', 'fejlett_boltok', 'stabil_kapuk',
  'kristaly_takarek', 'energia_halo', 'takaritorobot', 'auto_poggyasz',
  'vip_ellatas', 'gyogyaszat', 'teleport_lift', 'kapu_szkenner',
  'ido_kotes', 'legendas_kapu',
];

/** Kapuhelyek a bővítményekben, megnyitási sorrendben. */
const KAPU_HELYEK = [
  [22, 1], [26, 1], [22, 17], [26, 17], [-9, 1], [-5, 1], [-9, 9],
];

/**
 * Szolgáltatások a kezdő csarnokban — a kezdő kapu (kx+2,ky+2) és az ingyen
 * energiamag (kx, ky+14) köré tervezve, folyosókat hagyva.
 * [típus, dx, dy, minimum pénz]
 */
const CSARNOK_TERV = [
  ['biztonsag', 6, 2, 0],
  ['wc', 6, 6, 0],
  ['varo', 10, 2, 0],
  ['etterem', 10, 6, 2600],
  ['bolt', 14, 6, 2400],
  ['takarito', 6, 13, 1600],
  ['info', 6, 10, 1400],
  ['seprupark', 2, 6, 1600],
  ['poggyasz', 10, 10, 3000],
  ['konyvesbolt', 17, 6, 2600],
  ['vam', 2, 10, 2400],
  ['karbantarto', 17, 10, 3600],
  ['hoforras', 14, 10, 2200],
  ['jegkamra', 14, 2, 2200],
  ['orvos', 17, 2, 3200],
];

/**
 * v0.1 — a teljes v0.1-es parancsfelület egy játszásban.
 *
 * Gyárfüggvény: minden futás SAJÁT állapotot kap, hogy két futás ne
 * befolyásolja egymást. (Ha a „mit építettem már" halmaz modulszintű lenne,
 * a szonda második futása kihagyná az építkezést, és boldogan jelentené, hogy
 * a két futás megegyezik — üres állomásokon.)
 *
 * @returns {(sim: import('../src/sim/sim.js').Sim, t: number) => void}
 */
export function v01Uj() {
  const megtett = new Set();
  let utolsoFelvetel = -999;
  let kapuSzamlalo = 0;

  const egyszer = (kulcs, felt, tenni) => {
    if (megtett.has(kulcs)) return;
    if (!felt()) return;
    megtett.add(kulcs);
    tenni();
  };

  return function v01(sim, t) {
    const kx = sim.kezdoX, ky = sim.kezdoY;

    // ── PADLÓ-TERJESZKEDÉS (fix ütem, hogy legyen hova építeni) ──────────
    if (t === 60) sim.parancs({ fajta: 'padlo', x: kx + 22, y: ky, sz: 10, m: 16 });
    if (t === 900) sim.parancs({ fajta: 'padlo', x: kx, y: ky + 16, sz: 32, m: 8 });
    if (t === 2400) sim.parancs({ fajta: 'padlo', x: kx - 10, y: ky, sz: 10, m: 16 });
    if (t === 5200) sim.parancs({ fajta: 'padlo', x: kx + 22, y: ky + 16, sz: 10, m: 8 });

    // ── A CSARNOK BERENDEZÉSE ────────────────────────────────────────────
    for (let i = 0; i < CSARNOK_TERV.length; i++) {
      const [tipus, dx, dy, kell] = CSARNOK_TERV[i];
      egyszer('ep:' + tipus,
        () => t > 4 + i * 3 && sim.penz > kell,
        () => sim.parancs({ fajta: 'epit', tipus, x: kx + dx, y: ky + dy }));
    }

    // ── SZEMÉLYZET: aki hiányzik, azt felvesszük (60 tickenként egyet) ───
    if (t - utolsoFelvetel > 60 && sim.penz > 3500) {
      const hiany = hianyzoSzakma(sim);
      if (hiany) { sim.parancs({ fajta: 'felvesz', tipus: hiany }); utolsoFelvetel = t; }
    }

    // ── KUTATÁS: csak akkor, ha nem vár megnyitásra való világ ──────────
    // Az első változat mindig kutatott, ha volt 6000 tallér — és ezzel MINDIG
    // elköltötte azt a pénzt, ami a második kapura kellett volna. A szonda
    // húsz játéknapon át egyetlen kapuval futott, tehát a több-kapus kód (a
    // dimenziók fele!) mérés nélkül maradt. A prioritás ezért explicit.
    const varoVilag = sim.dimenziok.some((d) => d.felfedezve && !d.nyitva && !d.lezarva);
    if (!sim.aktivKutatas && t > 400 && sim.penz > (varoVilag ? 14000 : 6000)) {
      const kod = kovetkezoKutatas(sim);
      if (kod) sim.parancs({ fajta: 'kutat', kod });
    }

    // ── ÚJ KAPUK: amint egy világ ismert és van rá pénz ──────────────────
    if (t > 800 && t % 50 === 0 && kapuSzamlalo < KAPU_HELYEK.length) {
      for (let i = 0; i < sim.dimenziok.length; i++) {
        const d = sim.dimenziok[i];
        if (!d.felfedezve || d.nyitva || d.lezarva) continue;
        const hely = KAPU_HELYEK[kapuSzamlalo];
        if (sim.penz < 7000) break;
        sim.parancs({ fajta: 'epit', tipus: 'portal', x: kx + hely[0], y: ky + hely[1], dim: d.kod });
        kapuSzamlalo++;
        break;
      }
    }

    // ── ÁRAMSZÜNET ELLEN: új energiamag ─────────────────────────────────
    // Mérve: enélkül a szonda-állomás TARTÓS áramszünetbe került, és mind a
    // tizenhét épülete 40 %-on ment. A determinizmus közben tökéletes volt —
    // pontosan az az eset, amiről a CLAUDE.md szól: a zöld kapu nem
    // működés-kapu. Egy játékos ilyenkor magot épít, tehát a szonda is.
    if (t > 600 && t % 300 === 0 && sim.aramszunet && sim.penz > 4000) {
      const n = sim.epuletSzam('energiamag');
      if (n < 4) sim.parancs({ fajta: 'epit', tipus: 'energiamag', x: kx + 20 + (n - 1) * 3, y: ky + 20 });
    }

    // ── KUTATÁSHOZ KÖTÖTT ÉPÜLETEK ──────────────────────────────────────
    egyszer('ep:vip', () => sim.kesz('vip_ellatas') && sim.penz > 8000,
      () => sim.parancs({ fajta: 'epit', tipus: 'vip', x: kx + 23, y: ky + 6 }));
    egyszer('ep:lift', () => sim.kesz('teleport_lift') && sim.penz > 8000,
      () => sim.parancs({ fajta: 'epit', tipus: 'teleportlift', x: kx + 9, y: ky + 18 }));

    // ── KAPUFEJLESZTÉS: ha bőven van pénz, szintet lépünk ────────────────
    if (t > 3000 && t % 600 === 0 && sim.penz > 20000) {
      const l = sim.nyitottDimenziok();
      if (l.length > 0) sim.parancs({ fajta: 'dim_szint', kod: l[0].kod });
    }

    // ── DÍJSZABÁS ───────────────────────────────────────────────────────
    if (t === 1200) sim.parancs({ fajta: 'dim_dij', kod: 'zsibvasar', szorzo: 0.8 });
    if (t === 3600) sim.parancs({ fajta: 'dim_dij', kod: 'zsibvasar', szorzo: 1.15 });

    // ── RITKÁBB PARANCSFAJTÁK — legyenek lefedve ────────────────────────
    if (t === 2000) sim.parancs({ fajta: 'epit', tipus: 'reklam', x: kx + 20, y: ky + 14 });
    if (t === 2600) sim.parancs({ fajta: 'kapcsol', azon: sim.portalok[0] });
    if (t === 2660) sim.parancs({ fajta: 'kapcsol', azon: sim.portalok[0] });
    if (t === 2800) sim.parancs({ fajta: 'bont', x: kx + 20, y: ky + 14 });
    if (t === 3000 && sim.dolgozok.length > 2) sim.parancs({ fajta: 'dolgozo_fejleszt', azon: sim.dolgozok[2].azon });
    if (t === 3200 && sim.dolgozok.length > 3) sim.parancs({ fajta: 'beoszt', dolgozo: sim.dolgozok[3].azon, epulet: -1 });
    if (t === 3260 && sim.dolgozok.length > 3) {
      const cel = sim.epuletek.find((e) => e && e.kod === 'etterem');
      if (cel) sim.parancs({ fajta: 'beoszt', dolgozo: sim.dolgozok[3].azon, epulet: cel.azon });
    }
    if (t === 4000 && sim.dolgozok.length > 5) sim.parancs({ fajta: 'elbocsat', azon: sim.dolgozok[5].azon });
    // Padlóbontás: a `bont` másik ága (épület nélküli cella).
    if (t === 4400) sim.parancs({ fajta: 'bont', x: kx + 31, y: ky + 23 });

    // ── VÉGLEGES LEZÁRÁS: a történet legsúlyosabb parancsa ───────────────
    egyszer('zaras', () => t > 9000 && sim.nyitottDimenziok().length >= 3, () => {
      const l = sim.legrosszabbNyitottDimenzio();
      if (l) sim.parancs({ fajta: 'dim_zar', kod: l.kod, vegleg: true });
    });

    // ── TÖRTÉNET ÉS ESEMÉNYEK ───────────────────────────────────────────
    // Ez a v0.1 lelke: a fejezetváltás és az esemény-válasz IS parancs, tehát
    // ha nem futna le a szondában, a történet-ág mérés nélkül maradna.
    if (t % 20 === 0) {
      if (sim.tortenet.allapot === 'bevezeto') sim.parancs({ fajta: 'fejezet_tovabb' });
      else if (sim.tortenet.allapot === 'dontes') {
        // Váltakozó válasz, hogy mindkét ág forduljon elő hosszabb futáson.
        sim.parancs({ fajta: 'dontes', valasz: sim.tortenet.fejezet % 2 });
      }
      for (let i = 0; i < sim.varakozoValaszok.length; i++) {
        const e = sim.varakozoValaszok[i];
        sim.parancs({ fajta: 'esemeny_valasz', azon: e.azon, valasz: e.azon % 2 });
      }
    }
  };
}

/** Melyik szakmából hiányzik valaki egy már megépült épületben? */
function hianyzoSzakma(sim) {
  for (let a = 0; a < sim.epuletek.length; a++) {
    const ep = sim.epuletek[a];
    if (!ep || ep.berbeadva) continue;
    const t = sim.epuletTipusa(ep);
    if (!t.fajta || t.szemelyzet === 0) continue;
    if (ep.dolgozok.length < t.szemelyzet) return t.fajta;
  }
  return null;
}

/** A következő kikutatható technológia a fenti sorrendből. */
function kovetkezoKutatas(sim) {
  for (let i = 0; i < KUTATAS_SOR.length; i++) {
    const kod = KUTATAS_SOR[i];
    if (sim.kesz(kod)) continue;
    if (!sim.kutathato(kod)) continue;
    return kod;
  }
  return null;
}

// ══════════════════════════════════════════════════════════════════════════
//  v0.2 — A TÖBBSZINTES ÁLLOMÁS
// ══════════════════════════════════════════════════════════════════════════
//
// ⚠️ MIÉRT KELLETT ÚJ FORGATÓKÖNYV: a `v01` a motor-mag regresszió-őre, azt
// nem szabad átírni. A szintek viszont ÚJ parancsmezőt hoztak (`z`) és két új
// épületet (mozgólépcső, teleport lift), és ha ezek nem szerepelnének
// forgatókönyvben, a determinizmus-szonda vidáman zöld maradna a v0.3 összes
// új kódja körül. Pontosan az a hamis biztonságérzet, ami ellen a fájl
// fejléce szól.
//
// Ez a forgatókönyv szándékosan KICSI és sűrű: nem gazdaságot mér, hanem azt,
// hogy a függőleges közlekedés minden ága lefusson — emeleti padló, lépcső,
// lift, emeleti szolgáltatás, emeleti kapu, és a tiltott műveletek is
// (alátámasztás nélküli padló, alatta lévő padló bontása).

const V02_TERV = [
  // [tick, parancs]
  [4, { fajta: 'epit', tipus: 'biztonsag', dx: 8, dy: 2, z: 0 }],
  [8, { fajta: 'epit', tipus: 'wc', dx: 8, dy: 6, z: 0 }],
  [12, { fajta: 'epit', tipus: 'etterem', dx: 12, dy: 2, z: 0 }],
  [16, { fajta: 'epit', tipus: 'takarito', dx: 2, dy: 9, z: 0 }],

  // ── ELSŐ EMELET ─────────────────────────────────────────────────────────
  [60, { fajta: 'padlo', dx: 4, dy: 6, sz: 12, m: 8, z: 1 }],
  // Alátámasztás nélküli emeleti padló — ELUTASÍTÁSBA kell futnia.
  [64, { fajta: 'padlo', dx: 40, dy: 40, sz: 2, m: 2, z: 1 }],
  [70, { fajta: 'epit', tipus: 'lepcso', dx: 6, dy: 9, z: 0 }],
  [120, { fajta: 'epit', tipus: 'bolt', dx: 9, dy: 7, z: 1 }],
  [124, { fajta: 'epit', tipus: 'konyvesbolt', dx: 12, dy: 7, z: 1 }],
  [128, { fajta: 'epit', tipus: 'varo', dx: 9, dy: 11, z: 1 }],
  // A lépcső alatti padlót nem szabad kihúzni — ELUTASÍTÁS.
  [140, { fajta: 'bont', dx: 5, dy: 6, z: 0 }],

  // ── MÁSODIK EMELET ──────────────────────────────────────────────────────
  [600, { fajta: 'padlo', dx: 8, dy: 8, sz: 6, m: 4, z: 2 }],
  [640, { fajta: 'epit', tipus: 'seprupark', dx: 8, dy: 8, z: 2 }],

  // ── EMELETI KAPU ────────────────────────────────────────────────────────
  [2400, { fajta: 'epit', tipus: 'portal', dx: 12, dy: 9, z: 1, dim: 'kodmocsar' }],
];

/**
 * v0.2 — szintek. Gyárfüggvény, saját állapottal (lásd a `v01Uj()` fejlécét).
 * @returns {(sim: object, t: number) => void}
 */
export function v02Uj() {
  let utolsoFelvetel = -999;
  let liftKesz = false;
  return function v02(sim, t) {
    const kx = sim.kezdoX, ky = sim.kezdoY;
    for (let i = 0; i < V02_TERV.length; i++) {
      const [tick, p] = V02_TERV[i];
      if (t !== tick) continue;
      const q = Object.assign({}, p);
      q.x = kx + p.dx; q.y = ky + p.dy;
      delete q.dx; delete q.dy;
      sim.parancs(q);
    }
    // Személyzet, hogy a szolgáltatások tényleg működjenek — enélkül a
    // szintek „üzemelnek", de senkit nem szolgálnak ki, és a 6. vizsgálat
    // működés-feltételei üresek maradnának.
    if (t - utolsoFelvetel > 40 && sim.penz > 3000) {
      const hiany = hianyzoSzakma(sim);
      if (hiany) { sim.parancs({ fajta: 'felvesz', tipus: hiany }); utolsoFelvetel = t; }
    }
    // Teleport lift, amint kikutattuk (a második átjáró-fajta lefedése).
    if (!liftKesz && sim.kesz('teleport_lift') && sim.penz > 6000) {
      liftKesz = true;
      sim.parancs({ fajta: 'epit', tipus: 'teleportlift', x: kx + 12, y: ky + 8, z: 1 });
    }
    if (!sim.aktivKutatas && t > 300 && sim.penz > 9000) {
      for (const kod of ['energia_halo', 'teleport_lift', 'gyors_sorok']) {
        if (sim.kutathato(kod)) { sim.parancs({ fajta: 'kutat', kod }); break; }
      }
    }
    if (t % 20 === 0) {
      if (sim.tortenet.allapot === 'bevezeto') sim.parancs({ fajta: 'fejezet_tovabb' });
      else if (sim.tortenet.allapot === 'dontes') sim.parancs({ fajta: 'dontes', valasz: 0 });
      for (let i = 0; i < sim.varakozoValaszok.length; i++) {
        sim.parancs({ fajta: 'esemeny_valasz', azon: sim.varakozoValaszok[i].azon, valasz: 1 });
      }
    }
  };
}

// ══════════════════════════════════════════════════════════════════════════
//  v0.3 — GAZDASÁGI DÖNTÉSEK (bérbeadás, nehézségi fokozat)
// ══════════════════════════════════════════════════════════════════════════
//
// A v0.4 két új felülete: a `berbead` parancs és a nehézségi szorzók. A
// nehézség nem parancs, hanem a világ kezdőállapota — ezért ezt a
// forgatókönyvet a szonda KEMÉNY fokozaton futtatja, hogy a szorzók is
// bekerüljenek a mérésbe. Enélkül a `nehezseg` mező végigmenne az egész
// gazdaságon anélkül, hogy bármi ellenőrizné.

/**
 * v0.3 — bérbeadás kemény fokozaton.
 * @returns {(sim: object, t: number) => void}
 */
export function v03Uj() {
  let utolsoFelvetel = -999;
  const berbeadva = new Set();
  return function v03(sim, t) {
    const kx = sim.kezdoX, ky = sim.kezdoY;
    if (t === 5) sim.parancs({ fajta: 'epit', tipus: 'biztonsag', x: kx + 8, y: ky + 2 });
    if (t === 9) sim.parancs({ fajta: 'epit', tipus: 'wc', x: kx + 8, y: ky + 6 });
    if (t === 13) sim.parancs({ fajta: 'epit', tipus: 'etterem', x: kx + 12, y: ky + 2 });
    if (t === 17) sim.parancs({ fajta: 'epit', tipus: 'bolt', x: kx + 12, y: ky + 6 });
    if (t === 21) sim.parancs({ fajta: 'epit', tipus: 'konyvesbolt', x: kx + 16, y: ky + 6 });
    if (t === 25) sim.parancs({ fajta: 'epit', tipus: 'varo', x: kx + 16, y: ky + 2 });
    if (t === 29) sim.parancs({ fajta: 'epit', tipus: 'takarito', x: kx + 2, y: ky + 10 });

    // Az étterem marad a miénk, a bolt és a könyvesbolt bérbe megy — így a
    // szonda mindkét ágat méri, és a kettő bevétele össze is hasonlítható.
    if (t > 800 && t % 100 === 0) {
      for (const kod of ['bolt', 'konyvesbolt']) {
        if (berbeadva.has(kod)) continue;
        const ep = sim.epuletek.find((e) => e && e.kod === kod);
        if (ep) { sim.parancs({ fajta: 'berbead', azon: ep.azon }); berbeadva.add(kod); }
      }
    }
    // …és egyet vissza is veszünk, hogy a felmondás ága is fusson.
    if (t === 9000) {
      const ep = sim.epuletek.find((e) => e && e.kod === 'konyvesbolt');
      if (ep) sim.parancs({ fajta: 'berbead', azon: ep.azon });
    }

    if (t - utolsoFelvetel > 50 && sim.penz > 2500) {
      const hiany = hianyzoSzakma(sim);
      if (hiany) { sim.parancs({ fajta: 'felvesz', tipus: hiany }); utolsoFelvetel = t; }
    }
    if (t > 600 && t % 300 === 0 && sim.aramszunet && sim.penz > 3500) {
      const n = sim.epuletSzam('energiamag');
      if (n < 3) sim.parancs({ fajta: 'epit', tipus: 'energiamag', x: kx + 18 + (n - 1) * 3, y: ky + 12 });
    }
    if (t % 20 === 0) {
      if (sim.tortenet.allapot === 'bevezeto') sim.parancs({ fajta: 'fejezet_tovabb' });
      else if (sim.tortenet.allapot === 'dontes') sim.parancs({ fajta: 'dontes', valasz: 1 });
      for (let i = 0; i < sim.varakozoValaszok.length; i++) {
        sim.parancs({ fajta: 'esemeny_valasz', azon: sim.varakozoValaszok[i].azon, valasz: 1 });
      }
    }
  };
}

// ══════════════════════════════════════════════════════════════════════════
//  v0.4 — ÉRKEZÉSI CSATORNÁK (vasút, léghajó, űrkapu)
// ══════════════════════════════════════════════════════════════════════════
//
// A csatornák a kapuk mellé húzódó, MÁSIK gazdasági ág: nincs instabilitás,
// nincs kristály, viszont fix épületár és emeletkényszer. Külön forgatókönyv
// kell hozzájuk, mert a `_csatornakLep()` egy teljesen új tick-ág — és mert a
// léghajó-kikötő az EGYETLEN épület, ami emelet nélkül nem is építhető meg,
// vagyis a szintekkel együtt kell mérni.

/**
 * v0.4 — csatornák. Emeletet is épít, mert a léghajó-kikötő megköveteli.
 * @returns {(sim: object, t: number) => void}
 */
export function v04Uj() {
  let utolsoFelvetel = -999;
  const megtett = new Set();
  const egyszer = (kulcs, felt, tenni) => {
    if (megtett.has(kulcs) || !felt()) return;
    megtett.add(kulcs); tenni();
  };
  return function v04(sim, t) {
    const kx = sim.kezdoX, ky = sim.kezdoY;
    if (t === 5) sim.parancs({ fajta: 'epit', tipus: 'biztonsag', x: kx + 8, y: ky + 2 });
    if (t === 9) sim.parancs({ fajta: 'epit', tipus: 'wc', x: kx + 8, y: ky + 6 });
    if (t === 13) sim.parancs({ fajta: 'epit', tipus: 'etterem', x: kx + 12, y: ky + 2 });
    if (t === 17) sim.parancs({ fajta: 'epit', tipus: 'bolt', x: kx + 12, y: ky + 6 });
    if (t === 21) sim.parancs({ fajta: 'epit', tipus: 'takarito', x: kx + 2, y: ky + 12 });
    if (t === 40) sim.parancs({ fajta: 'padlo', x: kx + 22, y: ky, sz: 10, m: 16 });

    // ── VASÚT: az olcsó alapforgalom ──────────────────────────────────────
    egyszer('vasut', () => t > 300 && sim.penz > 6000,
      () => sim.parancs({ fajta: 'epit', tipus: 'vasut', x: kx + 24, y: ky + 2 }));

    // ── EMELET + LÉGHAJÓ ──────────────────────────────────────────────────
    // A kikötő földszinten ELUTASÍTÁSBA fut — ezt szándékosan meg is
    // próbáljuk, hogy a `minSzint` ága is le legyen mérve.
    egyszer('leghajo_foldszint', () => t > 900,
      () => sim.parancs({ fajta: 'epit', tipus: 'leghajo', x: kx + 24, y: ky + 8, z: 0 }));
    egyszer('emelet', () => t > 1000 && sim.penz > 3000,
      () => sim.parancs({ fajta: 'padlo', x: kx + 22, y: ky, sz: 10, m: 12, z: 1 }));
    egyszer('lepcso', () => t > 1200 && sim.penz > 4000 && sim.racs.vanPadlo(kx + 24, ky + 1, 1),
      () => sim.parancs({ fajta: 'epit', tipus: 'lepcso', x: kx + 23, y: ky + 8, z: 0 }));
    egyszer('leghajo', () => t > 1600 && sim.penz > 9000 && sim.racs.vanPadlo(kx + 24, ky + 1, 1),
      () => sim.parancs({ fajta: 'epit', tipus: 'leghajo', x: kx + 24, y: ky + 1, z: 1 }));

    // ── ŰRKAPU: kutatáshoz kötött ─────────────────────────────────────────
    if (!sim.aktivKutatas && sim.penz > 12000) {
      for (const kod of ['kapu_hangolas', 'stabil_kapuk', 'kapu_szkenner']) {
        if (sim.kutathato(kod)) { sim.parancs({ fajta: 'kutat', kod }); break; }
      }
    }
    egyszer('urkapu', () => sim.kesz('kapu_szkenner') && sim.penz > 16000,
      () => sim.parancs({ fajta: 'epit', tipus: 'urkapu', x: kx + 24, y: ky + 6, z: 1 }));

    if (t - utolsoFelvetel > 45 && sim.penz > 3000) {
      const hiany = hianyzoSzakma(sim);
      if (hiany) { sim.parancs({ fajta: 'felvesz', tipus: hiany }); utolsoFelvetel = t; }
    }
    if (t > 600 && t % 300 === 0 && sim.aramszunet && sim.penz > 4000) {
      const n = sim.epuletSzam('energiamag');
      if (n < 4) sim.parancs({ fajta: 'epit', tipus: 'energiamag', x: kx + 18 + (n - 1) * 3, y: ky + 12 });
    }
    if (t % 20 === 0) {
      if (sim.tortenet.allapot === 'bevezeto') sim.parancs({ fajta: 'fejezet_tovabb' });
      else if (sim.tortenet.allapot === 'dontes') sim.parancs({ fajta: 'dontes', valasz: 0 });
      for (let i = 0; i < sim.varakozoValaszok.length; i++) {
        sim.parancs({ fajta: 'esemeny_valasz', azon: sim.varakozoValaszok[i].azon, valasz: 1 });
      }
    }
  };
}
