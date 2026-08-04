// PORTAL HUB TYCOON — FAJKATALÓGUS.
//
// ── MIÉRT VAN EZ A FÁJL ───────────────────────────────────────────────────
// A játék ígérete az, hogy „minden faj másképp viselkedik". Ha ezt kódágakkal
// oldanánk meg (`if (faj === 'szellem')`), akkor a tizedik fajnál az utas-AI
// olvashatatlan lenne, és minden új faj HÁROM fájlt módosítana. Ehelyett a
// viselkedés ADAT: a fajnak vannak SZORZÓI és ZÁSZLÓI, az AI pedig egyetlen
// általános algoritmus, ami ezeket olvassa.
//
// Csak ott van külön kódág, ahol a viselkedés minőségileg más, nem
// mennyiségileg — ilyen a szellem falon-átjárása és a mimik lopása. Ezekből
// szándékosan kevés van; ha egy új fajhoz újabb kellene, előbb gondold végig,
// hogy nem fejezhető-e ki szorzóval.
//
// ⚠️ A TÖMB SORRENDJE STABIL AZONOSÍTÓ (mentés, ellenőrző-összeg). Új faj a
// lista VÉGÉRE megy.

/**
 * Mezők:
 *   sebesseg      cella / tick (0,05 ≈ 1 cella / másodperc 20 Hz-en)
 *   turelem       szorzó az ALAP_TURELEM-re
 *   penz          mennyi költenivalója van (alap ± szoras)
 *   helyIgeny     hány „főnyi" helyet foglal a torlódásban
 *   meret         3D-s méretszorzó
 *   igenyek       súlyozott kívánságlista; ebből sorsol az utas 1-4 tételt
 *   mindig        ezek MINDIG bekerülnek a tervbe (fajspecifikus kényszer)
 *   atmegyFalon   igaz: nem érdekli a rács, egyenesen megy (szellem)
 *   lebeg         igaz: a render a levegőben rajzolja
 *   lop           0..1 — ekkora eséllyel lop egy kiszolgálásnál (mimik)
 *   hoVagy        +1: meleget szeret, -1: hideget, 0: mindegy
 *   ritka         igaz: csak külön eseménnyel/VIP-ként jön
 */
export const FAJOK = [
  {
    kod: 'kobold', nev: 'Kobold', ikon: '👺', szin: 0x7fc86a,
    sebesseg: 0.075, turelem: 0.9, penz: 70, szoras: 40, helyIgeny: 1, meret: 0.72,
    igenyek: [
      { kod: 'ehseg', suly: 3 }, { kod: 'vasarlas', suly: 3 },
      { kod: 'wc', suly: 2 }, { kod: 'pihenes', suly: 1 }, { kod: 'info', suly: 1 },
    ],
    mindig: [], atmegyFalon: false, lebeg: false, lop: 0, hoVagy: 0, ritka: false,
    leiras: 'Gyors, olcsó, mindig siet. Az állomás alapzaja.',
  },
  {
    kod: 'szellem', nev: 'Szellem', ikon: '👻', szin: 0xcfe6ff,
    sebesseg: 0.062, turelem: 0.55, penz: 90, szoras: 60, helyIgeny: 0, meret: 0.88,
    igenyek: [
      { kod: 'info', suly: 3 }, { kod: 'pihenes', suly: 2 },
      { kod: 'vasarlas', suly: 1 }, { kod: 'konyv', suly: 2 },
    ],
    mindig: [], atmegyFalon: true, lebeg: true, lop: 0, hoVagy: 0, ritka: false,
    leiras: 'Átsétál a falakon, tehát sosem áll sorban a folyosóért — de a türelme a legrövidebb.',
  },
  {
    kod: 'troll', nev: 'Troll', ikon: '🗿', szin: 0x9a7a55,
    sebesseg: 0.033, turelem: 1.6, penz: 210, szoras: 90, helyIgeny: 4, meret: 1.75,
    igenyek: [
      { kod: 'ehseg', suly: 6 }, { kod: 'pihenes', suly: 3 },
      { kod: 'wc', suly: 2 }, { kod: 'vasarlas', suly: 2 },
    ],
    mindig: ['ehseg'], atmegyFalon: false, lebeg: false, lop: 0, hoVagy: 0, ritka: false,
    leiras: 'Lassú és testes: négy utas helyét foglalja a folyosón. Viszont mindig éhes, és jól fizet.',
  },
  {
    kod: 'boszorkany', nev: 'Boszorkány', ikon: '🧙', szin: 0x8f6fd0,
    sebesseg: 0.068, turelem: 1.0, penz: 190, szoras: 70, helyIgeny: 1, meret: 1.05,
    igenyek: [
      { kod: 'vasarlas', suly: 4 }, { kod: 'konyv', suly: 3 },
      { kod: 'ehseg', suly: 2 }, { kod: 'pihenes', suly: 1 },
    ],
    mindig: ['sepru'], atmegyFalon: false, lebeg: false, lop: 0, hoVagy: 0, ritka: false,
    leiras: 'Először a seprűjét parkolja le. Ha nincs hol, azt nagyon hosszan meséli el mindenkinek.',
  },
  {
    kod: 'demon', nev: 'Démon', ikon: '😈', szin: 0xe0553f,
    sebesseg: 0.058, turelem: 0.85, penz: 260, szoras: 110, helyIgeny: 2, meret: 1.25,
    igenyek: [
      { kod: 'ehseg', suly: 3 }, { kod: 'vasarlas', suly: 3 },
      { kod: 'vip', suly: 2 }, { kod: 'pihenes', suly: 1 },
    ],
    mindig: ['melegedes'], atmegyFalon: false, lebeg: false, lop: 0, hoVagy: 1, ritka: false,
    leiras: 'Meleg környezetet igényel. Hideg zónában a hangulata kétszer olyan gyorsan romlik.',
  },
  {
    kod: 'jegorias', nev: 'Jégóriás', ikon: '🧊', szin: 0x8fd8ff,
    sebesseg: 0.040, turelem: 1.35, penz: 240, szoras: 100, helyIgeny: 3, meret: 1.6,
    igenyek: [
      { kod: 'ehseg', suly: 3 }, { kod: 'pihenes', suly: 3 }, { kod: 'vasarlas', suly: 2 },
    ],
    mindig: ['hules'], atmegyFalon: false, lebeg: false, lop: 0, hoVagy: -1, ritka: false,
    leiras: 'Hideg zóna nélkül olvad, és az olvadó jégóriás lassan, de biztosan tönkreteszi a hírnevet.',
  },
  {
    kod: 'meduza', nev: 'Lebegő medúza', ikon: '🎐', szin: 0xff9ad2,
    sebesseg: 0.046, turelem: 1.8, penz: 130, szoras: 60, helyIgeny: 1, meret: 0.95,
    igenyek: [
      { kod: 'pihenes', suly: 4 }, { kod: 'konyv', suly: 2 },
      { kod: 'vasarlas', suly: 2 }, { kod: 'info', suly: 1 },
    ],
    mindig: [], atmegyFalon: false, lebeg: true, lop: 0, hoVagy: 0, ritka: false,
    leiras: 'Ráérős és békés. A leghosszabb türelmű vendég: vele lehet elnézőbb a csúcsforgalom.',
  },
  {
    kod: 'elokonyv', nev: 'Élő könyv', ikon: '📕', szin: 0xd06f8f,
    sebesseg: 0.052, turelem: 1.1, penz: 160, szoras: 70, helyIgeny: 1, meret: 0.85,
    igenyek: [
      { kod: 'konyv', suly: 6 }, { kod: 'info', suly: 2 }, { kod: 'pihenes', suly: 2 },
    ],
    mindig: ['konyv'], atmegyFalon: false, lebeg: true, lop: 0, hoVagy: 0, ritka: false,
    leiras: 'Egyenesen a könyvesboltba tart. Ha nincs, sértődötten továbbutazik.',
  },
  {
    kod: 'mimik', nev: 'Mimik láda', ikon: '🧰', szin: 0xb08050,
    sebesseg: 0.050, turelem: 1.2, penz: 40, szoras: 30, helyIgeny: 2, meret: 1.0,
    igenyek: [
      { kod: 'poggyasz', suly: 5 }, { kod: 'vasarlas', suly: 3 }, { kod: 'ehseg', suly: 2 },
    ],
    mindig: [], atmegyFalon: false, lebeg: false, lop: 0.35, hoVagy: 0, ritka: false,
    leiras: 'Ládának adja ki magát a poggyászszalagon. Néha ellop valamit — őrökkel ez sokkal ritkább.',
  },
  {
    kod: 'sarkany', nev: 'Sárkány', ikon: '🐉', szin: 0xffb347,
    sebesseg: 0.055, turelem: 0.7, penz: 1400, szoras: 400, helyIgeny: 6, meret: 2.3,
    igenyek: [
      { kod: 'vip', suly: 6 }, { kod: 'ehseg', suly: 3 }, { kod: 'vasarlas', suly: 2 },
    ],
    mindig: ['vip'], atmegyFalon: false, lebeg: false, lop: 0, hoVagy: 1, ritka: true,
    leiras: 'Legendás vendég. Óriási bevétel — de ha VIP Lounge nélkül várakoztatod, arról egész univerzumok fognak beszélni.',
  },
];

export const FAJ_INDEX = (() => {
  const m = new Map();
  for (let i = 0; i < FAJOK.length; i++) m.set(FAJOK[i].kod, i);
  return m;
})();

export function fajIdx(kod) {
  const i = FAJ_INDEX.get(kod);
  return i === undefined ? -1 : i;
}
