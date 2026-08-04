// PORTAL HUB TYCOON — DOLGOZÓK.
//
// ── MIÉRT VAN EZ A FÁJL ───────────────────────────────────────────────────
// A dolgozó a tycoon egyetlen olyan költsége, ami NEM egyszeri: minden nap
// fizetni kell érte, akkor is, ha nincs forgalom. Ez adja a játék
// kockázatát — a nagy állomás nemcsak drágább, hanem sérülékenyebb is.
//
// A dolgozók egy épülethez vannak BEOSZTVA. Egy épület akkor megy 100 %-on,
// ha megvan a `szemelyzet` létszáma; félig feltöltve félsebességgel dolgozik.
// Szándékosan nincs „szabadon kóborló, munkát kereső" dolgozó: az látványos,
// de a játékos nem tudja irányítani, és a hiba okát sem látja. A beosztás
// legyen explicit, hogy a felelősség is az legyen.

/**
 * Mezők:
 *   ber      napi bér
 *   fajta    melyik épület `fajta` mezőjéhez illik
 *   hatas    külön képesség kódja (a sim ismeri fel)
 */
export const DOLGOZOK = [
  {
    kod: 'mernok', nev: 'Portálmérnök', ikon: '🔧', szin: 0x7fb3ff, ber: 145,
    hatas: 'karbantartas',
    leiras: 'A karbantartóban dolgozva csökkenti minden kapu instabilitását. A kapun állva gyorsítja az érkezést.',
  },
  {
    kod: 'or', nev: 'Biztonsági őr', ikon: '🛡️', szin: 0x4f8fd6, ber: 95,
    hatas: 'biztonsag',
    leiras: 'Gyorsítja az ellenőrzést, és jóval ritkábbá teszi a mimikek lopásait.',
  },
  {
    kod: 'magus', nev: 'Mágus', ikon: '✨', szin: 0xb06fd0, ber: 175,
    hatas: 'magia',
    leiras: 'Kristályt spórol és tompítja az események kárát. Drága, de az idővihart ő állítja meg.',
  },
  {
    kod: 'kobold', nev: 'Takarító kobold', ikon: '🧹', szin: 0x6ec46e, ber: 55,
    hatas: 'takaritas',
    leiras: 'A takarítókamrából indulva folyamatosan viszi le a koszt. A legolcsóbb hangulat-javítás.',
  },
  {
    kod: 'poggyaszos', nev: 'Poggyászkezelő', ikon: '🧳', szin: 0x8a7a5c, ber: 70,
    hatas: null,
    leiras: 'A szalag mellett. Nélküle a csomagfeladás félsebességgel csoszog.',
  },
  {
    kod: 'szerelo', nev: 'Szerelő', ikon: '🪛', szin: 0xffb347, ber: 100,
    hatas: 'javitas',
    leiras: 'Az energiamagnál tartja a rendszert, és lassítja az épületek kopását.',
  },
  {
    kod: 'infodemon', nev: 'Információs démon', ikon: 'ℹ️', szin: 0x50b6e0, ber: 80,
    hatas: 'tajekoztatas',
    leiras: 'Az információs pultnál. A közelben mindenki gyorsabban dönt és kevésbé téved el.',
  },
  {
    kod: 'orvos', nev: 'Orvos', ikon: '⚕️', szin: 0xff9c9c, ber: 150,
    hatas: 'gyogyitas',
    leiras: 'A gyengélkedőben. Baleset és pánik esetén sokkal kisebb a hírnév-kár.',
  },
  {
    kod: 'pincer', nev: 'Éttermi személyzet', ikon: '🍽️', szin: 0xe0704f, ber: 75,
    hatas: null,
    leiras: 'Éttermekbe, boltokba, VIP-be. Ők váltják a forgalmat pénzre.',
  },
];

export const DOLGOZO_INDEX = (() => {
  const m = new Map();
  for (let i = 0; i < DOLGOZOK.length; i++) m.set(DOLGOZOK[i].kod, i);
  return m;
})();

export function ujDolgozo(azon, kod, x, y) {
  return {
    azon,
    kod,
    tipusIdx: DOLGOZO_INDEX.get(kod),
    x, y,
    lx: x, ly: y,
    /** Melyik épületbe van beosztva; -1 = tétlen (de a bér akkor is megy). */
    epuletAzon: -1,
    /** 1..3 — a fejlesztés a hatását és a bérét is emeli. */
    szint: 1,
    /** Takarítónál: melyik épületet takarítja épp (-1 = nincs cél). */
    celEpulet: -1,
    /** Kóborláshoz: hány tick múlva választ új céllal. */
    ora: 0,
  };
}

/** A szinttel a bér is nő — a fejlesztés nem ingyen jár. */
export function dolgozoBer(d) {
  return Math.round(DOLGOZOK[d.tipusIdx].ber * (1 + (d.szint - 1) * 0.55));
}

/** A szint hatás-szorzója. */
export function dolgozoEro(d) { return 1 + (d.szint - 1) * 0.6; }
