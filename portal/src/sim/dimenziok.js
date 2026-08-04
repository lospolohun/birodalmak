// PORTAL HUB TYCOON — DIMENZIÓK.
//
// ── MIÉRT VAN EZ A FÁJL ───────────────────────────────────────────────────
// Ez a játék NEM végtelen sandbox. A dimenziók adják a történetet: egyre
// többet fedezünk fel, egyre instabilabbak lesznek, és a játékos dönti el,
// melyiket fejleszti tovább és melyiket zárja be VÉGLEG. A bezárás
// visszafordíthatatlan — ettől lesz a döntésnek súlya, és ettől lesz két
// játszás története különböző.
//
// A dimenzió KATALÓGUS (állandó adat) és ÁLLAPOT (változik) szét van választva:
// a katalógus a tömb, az állapot a `DimenzioAllapot`. Így a mentésbe csak az
// állapot kerül, és egy új dimenzió felvétele nem töri el a régi mentéseket.
//
// ── INSTABILITÁS ──────────────────────────────────────────────────────────
// Minden nyitott kapu folyamatosan instabilabb lesz, és a forgalom gyorsítja.
// A karbantartó műhely + portálmérnök faragja vissza. Ha eléri a határt, a
// kapu ÖSSZEOMLIK: bezár egy időre, pénzbe és hírnévbe kerül. Ez az a nyomás,
// ami miatt a terjeszkedés nem ingyenes — minden új kapu új karbantartási
// terhet is jelent.

/**
 * Mezők:
 *   dij         portálhasználati díj utasonként (a játékos állíthatja ±50 %)
 *   vamKoteles  igaz: az innen érkezők tervébe bekerül a vám
 *   veszely     instabilitás-szorzó; a legendás világok gyorsabban romlanak
 *   nyitasAr    a kapu megnyitásának egyszeri ára (a portál épületén FELÜL)
 *   fajok       súlyozott fajmix — ez adja a dimenzió „arcát"
 *   kezdo       igaz: a játék elején már felfedezve
 */
export const DIMENZIOK = [
  {
    kod: 'zsibvasar', nev: 'Zsibvásár-világ', ikon: '🏮', szin: 0x7fc86a,
    dij: 34, vamKoteles: false, veszely: 1.0, nyitasAr: 0,
    fajok: [{ kod: 'kobold', suly: 6 }, { kod: 'meduza', suly: 2 }, { kod: 'elokonyv', suly: 1 }],
    kezdo: true,
    leiras: 'Zajos kereskedőnegyed-univerzum. Sok kis utas, kevés pénz — de ők az alap.',
  },
  {
    kod: 'kodmocsar', nev: 'Ködmocsár', ikon: '🌫️', szin: 0xa8b8d8,
    dij: 42, vamKoteles: false, veszely: 1.15, nyitasAr: 1800,
    fajok: [{ kod: 'szellem', suly: 6 }, { kod: 'meduza', suly: 3 }, { kod: 'elokonyv', suly: 2 }],
    kezdo: false,
    leiras: 'Ahonnan a szellemek jönnek. Nem tisztelik a falaidat, és nem érnek rá.',
  },
  {
    kod: 'kohegyseg', nev: 'Kőhegység', ikon: '⛰️', szin: 0x9a7a55,
    dij: 55, vamKoteles: true, veszely: 1.0, nyitasAr: 2600,
    fajok: [{ kod: 'troll', suly: 6 }, { kod: 'kobold', suly: 3 }, { kod: 'mimik', suly: 2 }],
    kezdo: false,
    leiras: 'Trollok földje. Lassúak, nagyok, éhesek — és vámkötelesek.',
  },
  {
    kod: 'boszorkanyliget', nev: 'Boszorkányliget', ikon: '🌘', szin: 0x8f6fd0,
    dij: 62, vamKoteles: false, veszely: 1.2, nyitasAr: 3200,
    fajok: [{ kod: 'boszorkany', suly: 6 }, { kod: 'elokonyv', suly: 3 }, { kod: 'szellem', suly: 1 }],
    kezdo: false,
    leiras: 'Seprűforgalom. Költenek, olvasnak, és mindent megjegyeznek.',
  },
  {
    kod: 'parazsmely', nev: 'Parázsmély', ikon: '🔥', szin: 0xe0553f,
    dij: 88, vamKoteles: true, veszely: 1.45, nyitasAr: 4800,
    fajok: [{ kod: 'demon', suly: 7 }, { kod: 'mimik', suly: 2 }, { kod: 'troll', suly: 1 }],
    kezdo: false,
    leiras: 'Démonvilág. Gazdag utasok, forró igények, és időnként tüntetés.',
  },
  {
    kod: 'fagyperem', nev: 'Fagyperem', ikon: '🧊', szin: 0x8fd8ff,
    dij: 84, vamKoteles: false, veszely: 1.35, nyitasAr: 4800,
    fajok: [{ kod: 'jegorias', suly: 7 }, { kod: 'meduza', suly: 2 }, { kod: 'szellem', suly: 1 }],
    kezdo: false,
    leiras: 'A jégóriások pereme. Hűtés nélkül ne is nyisd meg.',
  },
  {
    kod: 'sarkanytronus', nev: 'Sárkánytrónus', ikon: '🐉', szin: 0xffb347,
    dij: 240, vamKoteles: true, veszely: 1.9, nyitasAr: 12000,
    fajok: [{ kod: 'sarkany', suly: 4 }, { kod: 'demon', suly: 3 }, { kod: 'boszorkany', suly: 2 }],
    kezdo: false,
    leiras: 'LEGENDÁS. Kevés utas, iszonyú bevétel — és a leggyorsabban romló kapu az egész hálózatban.',
  },
];

export const DIMENZIO_INDEX = (() => {
  const m = new Map();
  for (let i = 0; i < DIMENZIOK.length; i++) m.set(DIMENZIOK[i].kod, i);
  return m;
})();

/** Egy dimenzió változó állapota. */
export function ujDimenzioAllapot(i) {
  const d = DIMENZIOK[i];
  return {
    idx: i,
    kod: d.kod,
    /** Ismerjük-e egyáltalán (a történet fedi fel). */
    felfedezve: !!d.kezdo,
    /** Áll-e működő kapu rajta. */
    nyitva: false,
    /** VÉGLEG lezárva a játékos döntésével — nem nyitható újra. */
    lezarva: false,
    /** 1..5 — a fejlesztett kapu több és gazdagabb utast hoz. */
    szint: 1,
    /** 0..1000 ezred. */
    instabilitas: 0,
    /** Hány tickig van kényszerszünet összeomlás után. */
    szunet: 0,
    /** A játékos díjszorzója: 0,5 … 1,5. */
    dijSzorzo: 1,
    /** Melyik portál-épület szolgálja ki (-1 = nincs). */
    portalAzon: -1,
    osszUtas: 0,
    bevetel: 0,
  };
}

/** A tényleges portáldíj: alapdíj × játékos-szorzó × szint-bónusz. */
export function dimenzioDij(all) {
  const d = DIMENZIOK[all.idx];
  return Math.round(d.dij * all.dijSzorzo * (1 + (all.szint - 1) * 0.18));
}

/**
 * A díjszabás visszahat a forgalomra: a drága kapu elriaszt, az olcsó vonz.
 * Ez az a fajta visszacsatolás, ami nélkül a „húzd fel a díjat végtelenre"
 * mindig nyerő stratégia lenne — és akkor nincs is döntés.
 * @returns {number} érkezési szorzó
 */
export function dijVonzero(all) {
  const s = all.dijSzorzo;
  // 0,5-nél 1,35×, 1,0-nél 1,0×, 1,5-nél 0,55× forgalom.
  return s <= 1 ? 1 + (1 - s) * 0.7 : 1 - (s - 1) * 0.9;
}
