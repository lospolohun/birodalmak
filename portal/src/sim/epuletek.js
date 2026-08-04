// PORTAL HUB TYCOON — ÉPÜLET-KATALÓGUS.
//
// ── MIÉRT VAN EZ A FÁJL ───────────────────────────────────────────────────
// Ez a játék adatvezérelt: egy új szolgáltatás felvétele EGY sor ebben a
// tömbben, és onnantól megjelenik az építés-panelen, az utasok tervében, a
// gazdaságban és a 3D-ben is. Ha ehelyett minden épületnek külön kódága
// lenne, a „könnyen bővíthető új dimenziókkal, fajokkal és szolgáltatásokkal"
// ígéret az első bővítésnél megdőlne.
//
// ⚠️ A KATALÓGUS TÖMB, NEM OBJEKTUM. Az indexe stabil azonosító: a mentés és
// az ellenőrző-összeg is erre épül. Új épület MINDIG a lista VÉGÉRE megy —
// ha közé szúrsz, a régi mentések más épületeket kapnak vissza.
//
// ── AZ IGÉNY-RENDSZER ─────────────────────────────────────────────────────
// Minden épület legfeljebb EGY igényt elégít ki (`igeny`). Az utasnak van egy
// igénylistája, és mindig a legközelebbi olyan épületet keresi, ami az aktuális
// igényét szolgálja. Ez a szándékos egyszerűsítés az, ami miatt az AI ezer
// utasnál is elfut: nincs többkritériumos döntés, csak „hol a legközelebbi X".

/** Amit egy utas akarhat. A sorrend a v0.1-ben csak a HUD-ot érdekli. */
export const IGENYEK = [
  { kod: 'biztonsag', nev: 'Biztonsági ellenőrzés' },
  { kod: 'vam', nev: 'Vám' },
  { kod: 'poggyasz', nev: 'Poggyász' },
  { kod: 'ehseg', nev: 'Étkezés' },
  { kod: 'vasarlas', nev: 'Vásárlás' },
  { kod: 'konyv', nev: 'Könyv' },
  { kod: 'wc', nev: 'Mosdó' },
  { kod: 'pihenes', nev: 'Pihenés' },
  { kod: 'info', nev: 'Információ' },
  { kod: 'sepru', nev: 'Seprűparkoló' },
  { kod: 'vip', nev: 'VIP' },
  { kod: 'melegedes', nev: 'Melegedés' },
  { kod: 'hules', nev: 'Hűsölés' },
];

/**
 * Az épületek. Mezők:
 *   ar          egyszeri építési költség
 *   energia     folyamatos energiaigény (az energiamag termeli)
 *   szemelyzet  hány dolgozó kell a 100 %-os működéshez
 *   fajta       melyik dolgozó-típus illik ide (a beosztás ezt ajánlja)
 *   igeny       melyik utas-igényt elégíti ki (null = nem szolgáltat)
 *   kapacitas   egyszerre ennyi utast szolgál ki
 *   ido         egy kiszolgálás hossza tickben
 *   dij         amit az utas fizet érte
 *   kutatas     null, vagy a technológia kódja, ami feloldja
 */
export const EPULETEK = [
  {
    kod: 'portal', nev: 'Dimenziókapu', ikon: '🌀', sz: 3, m: 3,
    ar: 2600, energia: 32, szemelyzet: 0, fajta: 'mernok',
    igeny: null, kapacitas: 0, ido: 0, dij: 0,
    szin: 0x9b6bff, magas: 3.2, kutatas: null,
    leiras: 'Innen érkeznek és ide indulnak az utasok. Kristályt éget, és idővel instabillá válik.',
  },
  {
    kod: 'biztonsag', nev: 'Biztonsági ellenőrzés', ikon: '🛡️', sz: 3, m: 2,
    ar: 950, energia: 14, szemelyzet: 2, fajta: 'or',
    igeny: 'biztonsag', kapacitas: 4, ido: 60, dij: 0,
    szin: 0x4f8fd6, magas: 1.5, kutatas: null,
    leiras: 'Kötelező állomás minden érkezőnek. Nélküle senki nem jut tovább — és mindenki dühös lesz.',
  },
  {
    kod: 'vam', nev: 'Vám', ikon: '📜', sz: 2, m: 2,
    ar: 850, energia: 10, szemelyzet: 2, fajta: 'or',
    igeny: 'vam', kapacitas: 3, ido: 75, dij: 22,
    szin: 0xd6a24f, magas: 1.5, kutatas: null,
    leiras: 'Egyes dimenziók utasait vámolni kell. A díj a tiéd, a türelmük nem.',
  },
  {
    kod: 'poggyasz', nev: 'Poggyászkezelő', ikon: '🧳', sz: 3, m: 2,
    ar: 1200, energia: 22, szemelyzet: 2, fajta: 'poggyaszos',
    igeny: 'poggyasz', kapacitas: 6, ido: 80, dij: 34,
    szin: 0x8a7a5c, magas: 1.6, kutatas: null,
    leiras: 'Csomagfeladás és -felvétel. Néha eltűnik egy bőrönd. Néha egy mimik ládája adja fel magát.',
  },
  {
    kod: 'etterem', nev: 'Étterem', ikon: '🍲', sz: 3, m: 2,
    ar: 1000, energia: 18, szemelyzet: 2, fajta: 'pincer',
    igeny: 'ehseg', kapacitas: 5, ido: 110, dij: 48,
    szin: 0xe0704f, magas: 1.8, kutatas: null,
    leiras: 'Meleg étel tizenegy univerzumból. A trollok duplán esznek, de duplán is fizetnek.',
  },
  {
    kod: 'bolt', nev: 'Bolt', ikon: '🛍️', sz: 2, m: 2,
    ar: 780, energia: 12, szemelyzet: 1, fajta: 'pincer',
    igeny: 'vasarlas', kapacitas: 3, ido: 95, dij: 62,
    szin: 0x59c2a5, magas: 1.7, kutatas: null,
    leiras: 'Bérbe adott üzlethelyiség. A legjobb bevétel, ha van, aki ráérjen vásárolni.',
  },
  {
    kod: 'wc', nev: 'Mosdó', ikon: '🚻', sz: 2, m: 2,
    ar: 380, energia: 6, szemelyzet: 0, fajta: 'kobold',
    igeny: 'wc', kapacitas: 4, ido: 45, dij: 6,
    szin: 0x6f8fb0, magas: 1.4, kutatas: null,
    leiras: 'Olcsó, apró bevétel — de ha nincs belőle elég, minden más hiába.',
  },
  {
    kod: 'varo', nev: 'Váró', ikon: '🪑', sz: 3, m: 2,
    ar: 300, energia: 4, szemelyzet: 0, fajta: null,
    igeny: 'pihenes', kapacitas: 8, ido: 130, dij: 0,
    szin: 0x7f8ec4, magas: 0.9, kutatas: null,
    leiras: 'Ülőhely. Nem hoz pénzt, de a türelmet visszatölti — és a türelem a valuta.',
  },
  {
    kod: 'info', nev: 'Információs pult', ikon: 'ℹ️', sz: 2, m: 1,
    ar: 340, energia: 8, szemelyzet: 1, fajta: 'infodemon',
    // Mérve: EZ a legnagyobb áteresztésű épület. Egy pult mellett 195-203 fős
    // sor állt, öt pult mellett 11 — és a hiány-számláló közben semmit nem
    // jelzett, mert az épület LÉTEZETT, csak nem győzte.
    igeny: 'info', kapacitas: 4, ido: 35, dij: 0,
    szin: 0x50b6e0, magas: 1.3, kutatas: null,
    leiras: 'Az eltévedt utasok itt kapnak irányt: a közelben mindenki gyorsabban dönt.',
  },
  {
    kod: 'konyvesbolt', nev: 'Könyvesbolt', ikon: '📚', sz: 2, m: 2,
    ar: 860, energia: 10, szemelyzet: 1, fajta: 'pincer',
    igeny: 'konyv', kapacitas: 3, ido: 105, dij: 57,
    szin: 0xb06fd0, magas: 1.7, kutatas: null,
    leiras: 'Élő könyvek találkozóhelye. Néhányan itt maradnának örökre.',
  },
  {
    kod: 'seprupark', nev: 'Seprűparkoló', ikon: '🧹', sz: 2, m: 2,
    ar: 520, energia: 5, szemelyzet: 0, fajta: null,
    igeny: 'sepru', kapacitas: 6, ido: 40, dij: 18,
    szin: 0x9c8253, magas: 0.8, kutatas: null,
    leiras: 'Boszorkányoknak. Enélkül a seprűjüket a váró közepére állítják.',
  },
  {
    kod: 'hoforras', nev: 'Hőforrás', ikon: '🔥', sz: 2, m: 2,
    ar: 640, energia: 28, szemelyzet: 0, fajta: null,
    igeny: 'melegedes', kapacitas: 4, ido: 60, dij: 0,
    szin: 0xff7a3c, magas: 1.2, kutatas: null,
    zona: { ho: 1, hideg: 0, sugar: 6 },
    leiras: 'Meleg zónát tart a maga körül. A démonok ettől virágoznak, a jégóriások ettől olvadnak.',
  },
  {
    kod: 'jegkamra', nev: 'Jégkamra', ikon: '❄️', sz: 2, m: 2,
    ar: 640, energia: 28, szemelyzet: 0, fajta: null,
    igeny: 'hules', kapacitas: 4, ido: 60, dij: 0,
    szin: 0x6fd8ff, magas: 1.2, kutatas: null,
    zona: { ho: 0, hideg: 1, sugar: 6 },
    leiras: 'Hideg zóna a jégóriásoknak. Ne tedd a hőforrás mellé, mert kioltják egymást.',
  },
  {
    kod: 'karbantarto', nev: 'Portálkarbantartó', ikon: '🔧', sz: 3, m: 2,
    ar: 1500, energia: 20, szemelyzet: 2, fajta: 'mernok',
    igeny: null, kapacitas: 0, ido: 0, dij: 0,
    szin: 0x7d8b99, magas: 1.6, kutatas: null,
    leiras: 'Csökkenti MINDEN kapu instabilitását. Ez a különbség a hosszú játék és a látványos összeomlás között.',
  },
  {
    kod: 'takarito', nev: 'Takarítókamra', ikon: '🧼', sz: 2, m: 2,
    ar: 430, energia: 7, szemelyzet: 2, fajta: 'kobold',
    igeny: null, kapacitas: 0, ido: 0, dij: 0,
    szin: 0x6ec46e, magas: 1.3, kutatas: null,
    leiras: 'Innen indulnak a takarító koboldok. A kosz lassan öl: senki nem panaszkodik rá, mindenki utálja.',
  },
  {
    kod: 'energiamag', nev: 'Energiamag', ikon: '⚡', sz: 2, m: 2,
    ar: 1800, energia: 0, termel: 260, szemelyzet: 1, fajta: 'szerelo',
    igeny: null, kapacitas: 0, ido: 0, dij: 0,
    szin: 0xffd257, magas: 2.4, kutatas: null,
    leiras: 'Az állomás áramot innen kap. Ha a fogyasztás túllépi a termelést, minden lelassul.',
  },
  {
    kod: 'reklam', nev: 'Reklámoszlop', ikon: '📣', sz: 1, m: 1,
    ar: 470, energia: 6, szemelyzet: 0, fajta: null,
    igeny: null, kapacitas: 0, ido: 0, dij: 0, naponta: 95,
    szin: 0xff9ad2, magas: 2.6, kutatas: null,
    leiras: 'Napi bérleti díjat hoz, és picit emeli a hírnevet. Sok belőle már giccs — a vendégek is így látják.',
  },
  {
    kod: 'vip', nev: 'VIP Lounge', ikon: '👑', sz: 3, m: 3,
    ar: 3200, energia: 35, szemelyzet: 2, fajta: 'pincer',
    // Mérve: a VIP megtérülése 12,1× volt a bolt 50,3×-ához képest — a
    // legendás vendég kiszolgálása papíron nagy pénz, de olyan lassú és
    // annyi emberrel, hogy sosem érte meg. Rövidebb kiszolgálás, kevesebb fő.
    igeny: 'vip', kapacitas: 4, ido: 130, dij: 285,
    szin: 0xffd257, magas: 2.1, kutatas: 'vip_ellatas',
    leiras: 'A legendás vendégek ide jönnek. Egy sárkány egyetlen látogatása kifizet egy éttermet.',
  },
  {
    kod: 'orvos', nev: 'Gyengélkedő', ikon: '⚕️', sz: 2, m: 2,
    ar: 1150, energia: 16, szemelyzet: 1, fajta: 'orvos',
    igeny: null, kapacitas: 0, ido: 0, dij: 0,
    szin: 0xff9c9c, magas: 1.5, kutatas: 'gyogyaszat',
    leiras: 'Baleseteknél és pánikoknál csökkenti a kárt. Amíg nem történik semmi, feleslegesnek látszik.',
  },
  {
    kod: 'teleportlift', nev: 'Teleport lift', ikon: '🛗', sz: 2, m: 2,
    ar: 2400, energia: 40, szemelyzet: 0, fajta: null,
    igeny: null, kapacitas: 0, ido: 0, dij: 0,
    szin: 0x8de0ff, magas: 2.8, kutatas: 'teleport_lift',
    // Átjáró: két szintet köt össze, ÉS a környékén gyorsabban jár mindenki.
    // A `atjaroIdo` a szintváltás hossza tickben — a lift ezért drága: azonnal visz.
    atjaro: true, atjaroIdo: 8,
    leiras: 'Két szintet köt össze azonnal, és a környékén mindenki gyorsabban közlekedik. Kell alá és fölé kiépített padló.',
  },
  {
    kod: 'vasut', nev: 'Vasútállomás', ikon: '🚂', sz: 5, m: 3,
    ar: 3200, energia: 26, szemelyzet: 1, fajta: 'poggyaszos',
    igeny: null, kapacitas: 0, ido: 0, dij: 0,
    szin: 0x8a7a5c, magas: 2.2, kutatas: null,
    csatorna: 'vasut', csatornaUtem: 90,
    leiras: 'Helyi vasúti forgalom: sok olcsó utas, karbantartás és kristály nélkül. Az állomás stabil alapzaja.',
  },
  {
    kod: 'leghajo', nev: 'Léghajó-kikötő', ikon: '🎈', sz: 4, m: 4,
    ar: 5200, energia: 34, szemelyzet: 2, fajta: 'szerelo',
    igeny: null, kapacitas: 0, ido: 0, dij: 0,
    szin: 0xff9ad2, magas: 2.8, kutatas: null,
    csatorna: 'leghajo', csatornaUtem: 150, minSzint: 1,
    leiras: 'Csak EMELETEN építhető: a léghajók nem szállnak le a földszintre. Jómódú, ráérős utasokat hoz.',
  },
  {
    kod: 'urkapu', nev: 'Űrkapu', ikon: '🛰️', sz: 4, m: 4,
    ar: 9000, energia: 70, szemelyzet: 2, fajta: 'mernok',
    igeny: null, kapacitas: 0, ido: 0, dij: 0,
    szin: 0x8de0ff, magas: 3.4, kutatas: 'kapu_szkenner',
    csatorna: 'urkapu', csatornaUtem: 320,
    leiras: 'A csillagok közti forgalom fogadóállomása. Kevés utas, óriási díj — és időnként egy sárkány.',
  },
  {
    kod: 'lepcso', nev: 'Mozgólépcső', ikon: '🪜', sz: 2, m: 3,
    ar: 900, energia: 14, szemelyzet: 0, fajta: null,
    igeny: null, kapacitas: 0, ido: 0, dij: 0,
    szin: 0xa8b8d8, magas: 1.0, kutatas: null,
    atjaro: true, atjaroIdo: 40,
    leiras: 'A legolcsóbb út felfelé. Lassabb, mint a lift, de enélkül az emelet halott tér. Kell alá és fölé kiépített padló.',
  },
];

/** kód → index. Egyszer épül fel, utána O(1). */
export const EPULET_INDEX = (() => {
  const m = new Map();
  for (let i = 0; i < EPULETEK.length; i++) m.set(EPULETEK[i].kod, i);
  return m;
})();

export function epuletTipus(kod) {
  const i = EPULET_INDEX.get(kod);
  return i === undefined ? null : EPULETEK[i];
}

/**
 * Egy friss épület-példány. A típus adatai NEM másolódnak bele (a `tipus`
 * mezőn át érhetők el) — csak az, ami példányonként változik.
 */
export function ujEpulet(azon, kod, x, y, z = 0) {
  const t = epuletTipus(kod);
  return {
    azon,
    kod,
    tipusIdx: EPULET_INDEX.get(kod),
    x, y, sz: t.sz, m: t.m,
    /** Melyik szinten áll. Az átjárók a `z` ÉS a `z+1` szinten is ott vannak. */
    z,
    /** Hány szintet foglal (1, vagy 2 az átjáróknál). */
    szintek: t.atjaro ? 2 : 1,
    /** A rács-cellák indexei, ahonnan használható. Az útkeresés célja. */
    peron: [],
    /** Épp kiszolgált utasok azonosítói (kapacitás-korlátig). */
    bent: [],
    /** Sorban állók azonosítói. */
    sor: [],
    /** Ide beosztott dolgozók azonosítói. */
    dolgozok: [],
    /** 0..1 — hány százalékon üzemel (személyzet + áram). */
    hatekonysag: 1,
    /** Összes eddigi bevétel — a statisztika ebből él. */
    bevetel: 0,
    /** Hány utast szolgált ki összesen. */
    kiszolgalt: 0,
    /** Csak portálnál: melyik dimenzióhoz tartozik (index), -1 = nincs kötve. */
    dimenzio: -1,
    /** Csak portálnál: hány tick múlva jön a következő utas. */
    visszaszamlalo: 0,
    /** 0..1000 — állagromlás; a szerelő javítja. */
    kopas: 0,
    /** 0..1000 — kosz. A takarító koboldok ezt viszik le, helyben. */
    szemet: 0,
    /** Ki van-e kapcsolva a játékos által. */
    kikapcsolva: false,
    /**
     * Bérbe adva: a bérlő üzemelteti. Nem kell hozzá személyzet, de a
     * bevételnek csak egy hányada marad nálunk. Ez a tycoon klasszikus
     * döntése: kevesebb pénz, kevesebb gond.
     */
    berbeadva: false,
  };
}
