// AGE OF THE CRYSTALS — IKON-KÉSZLET (v0.16).
//
// ── MIÉRT EGY FÁJL, ÉS MIÉRT BEÁGYAZOTT SVG ───────────────────────────────
// A v0.16 játékrétegét sok panel írja, és mind ikont akar: a nyersanyag-sáv, az
// építés-panel, a kijelölés-panel, a képzési sor, a technológiafa. Ha
// mindegyik hoz magának egy készletet, három dolog romlik el egyszerre — a
// stílus szétesik, ugyanaz az ikon két helyen máshogy néz ki, és a `dist/`
// tele lesz majdnem-egyforma rajzokkal.
//
// KÉPFÁJL SINCS és külső betűtípus sincs, szándékosan: a `vite build` így
// egyetlen JS-t ad, a `dist/` másolható bárhová, és nincs második kérés, ami
// 404-re futhat. (A projektnek MOST is van egy ilyen szégyene: a hiányzó
// `favicon.ico` minden szonda-futáson „1 konzol-hibát" jelent.)
//
// ── MIÉRT DOB ISMERETLEN NÉVRE ────────────────────────────────────────────
// Mert az üres string NÉMÁN tűnik el. Egy elgépelt `IKON.KRISTALJ` üres gombot
// adna, a panel működne, a kapu zöld lenne, és senki nem venné észre, amíg
// valaki rá nem néz a képernyőre. Ez a projekt ÖTSZÖR égett meg pontosan
// ezen a hibafajtán (rövid `LATOTAV`, rövid `SUGAR`, néma lövedék-hang, halott
// civ-horog, kirajzolatlan egyedi egység) — itt nem engedjük még egyszer.
//
// ── STÍLUS ───────────────────────────────────────────────────────────────
// 24×24-es rajzterület, lapos foltok, nincs vonalvastagság-játék: ugyanaz a
// low-poly nyelv, amit a `props3d.js` és az `epulet_formak.js` beszél. Az ikon
// a HÍVÓ színét örökli (`currentColor`), kivéve ahol a szín maga az információ
// — a négy nyersanyagnak sajátja van, mert a sávban egymás mellett állnak.
//
// HASZNÁLAT:
//   import { IKON, ikonSvg } from './ikonok.js';
//   elem.innerHTML = ikonSvg(IKON.ETEL, 18);

/** Az ikonnevek. A panelek EZT importálják, nem nyers stringet. */
export const IKON = {
  // nyersanyag és fejléc
  ETEL: 'etel', FA: 'fa', KO: 'ko', KRISTALY: 'kristaly',
  NEP: 'nep', KORSZAK: 'korszak', IDO: 'ido',
  // egységtípusok — a `TIPUS` hat tagja
  MUNKAS: 'munkas', LANDZSAS: 'landzsas', IJASZ: 'ijasz',
  LOVAG: 'lovag', OSTROMGEP: 'ostromgep', EGYEDI: 'egyedi',
  // épületek — az `EPULET` tizenegy tagja
  KOZPONT: 'kozpont', RAKTAR: 'raktar', FAL: 'fal', KAPU: 'kapu',
  HAZ: 'haz', LAKTANYA: 'laktanya', IJASZDA: 'ijaszda', ISTALLO: 'istallo',
  OSTROMMUHELY: 'ostrommuhely', TORONY: 'torony', PIAC: 'piac',
  // parancsok — a kijelölés-panel gombjai és a 3D parancs-jelölők
  ALLJ: 'allj', TARTAS: 'tartas', ALLAS: 'allas', ALAKZAT: 'alakzat',
  MENET: 'menet', TAMADO_MENET: 'tamado_menet', GYUJTES: 'gyujtes',
  // vezérlők és jelzések
  SEBESSEG: 'sebesseg', SZUNET: 'szunet', HANG: 'hang', TETLEN: 'tetlen',
  FIGYELEM: 'figyelem', BAJ: 'baj', INFO: 'info',
};

/**
 * A négy nyersanyag saját színe. A sávban egymás mellett állnak, ezért NEM
 * örökölhetik a szöveg színét: a szín itt maga az információ, és ugyanez a négy
 * érték köszön vissza a `hud.js` számlálóiban.
 */
export const NYERS_SZIN = {
  etel: '#e8756a', fa: '#7ac46a', ko: '#b9bec7', kristaly: '#6fd0e8',
};

/** A rajzok: 24×24-es koordinátatérben, `<path>`/`<polygon>` törzsek. */
const RAJZ = {
  // ── nyersanyag ──────────────────────────────────────────────────────
  etel: '<path d="M7 3c-2 0-3 2-3 5 0 5 2 13 3 13s1-4 2-4 1 4 2 4c1 0 3-8 3-13 0-3-1-5-3-5-1 0-2 1-2 1s-1-1-2-1z"/>'
    + '<path d="M18 2c2 2 3 5 2 8-1 2-3 3-3 3l1 8h-2l-1-8s-2-1-2-4c0-3 3-7 5-7z" opacity=".75"/>',
  fa: '<polygon points="12,2 18,10 6,10"/><polygon points="12,7 19,16 5,16" opacity=".85"/>'
    + '<rect x="10.5" y="15" width="3" height="7" rx="1" opacity=".55"/>',
  ko: '<polygon points="4,18 8,9 15,8 20,14 18,20 7,21"/>'
    + '<polygon points="8,9 15,8 13,13 7,13" opacity=".5"/>',
  kristaly: '<polygon points="12,1 17,9 12,23 7,9"/><polygon points="12,1 17,9 12,11" opacity=".55"/>'
    + '<polygon points="3,8 6,12 4,19 1,13" opacity=".7"/>',

  // ── fejléc ──────────────────────────────────────────────────────────
  nep: '<circle cx="8" cy="7" r="3.2"/><path d="M2 21c0-4 3-6 6-6s6 2 6 6z"/>'
    + '<circle cx="17" cy="8" r="2.6" opacity=".65"/><path d="M13 21c0-3.4 2.2-5.4 4.6-5.4S22 17.6 22 21z" opacity=".65"/>',
  korszak: '<path d="M3 20h18l-2-5H5z"/><polygon points="12,2 16,9 8,9"/>'
    + '<rect x="10" y="9" width="4" height="6" opacity=".7"/>',
  ido: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/>'
    + '<path d="M12 6v7l4 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',

  // ── egységtípusok ───────────────────────────────────────────────────
  munkas: '<circle cx="12" cy="5" r="3"/><path d="M8 21v-7l-2-2 2-3h8l2 3-2 2v7z"/>'
    + '<path d="M17 3l4 4-2 2-4-4z" opacity=".7"/>',
  landzsas: '<circle cx="10" cy="5" r="3"/><path d="M6 21v-8l-2-2 2-3h7l1 3-1 2v8z"/>'
    + '<rect x="17" y="1" width="1.8" height="21" rx=".9" opacity=".8"/><polygon points="17.9,0 20,4 15.8,4" opacity=".8"/>',
  ijasz: '<circle cx="10" cy="5" r="3"/><path d="M6 21v-8l-2-2 2-3h7l1 3-1 2v8z"/>'
    + '<path d="M17 3a10 10 0 010 18" fill="none" stroke="currentColor" stroke-width="1.8" opacity=".8"/>'
    + '<path d="M17 3v18" stroke="currentColor" stroke-width="1" opacity=".55"/>',
  lovag: '<path d="M4 21c0-5 3-8 7-8h3l4-4 3 3-3 4v5z"/><circle cx="16" cy="6" r="2.4" opacity=".8"/>'
    + '<path d="M6 21v-4M10 21v-3" stroke="currentColor" stroke-width="1.6" opacity=".6"/>',
  ostromgep: '<rect x="3" y="9" width="18" height="5" rx="1"/><circle cx="7" cy="18" r="3.2"/>'
    + '<circle cx="17" cy="18" r="3.2"/><polygon points="19,7 23,11 19,11" opacity=".75"/>',
  egyedi: '<circle cx="10" cy="5" r="3"/><path d="M6 21v-8l-2-2 2-3h7l1 3-1 2v8z"/>'
    + '<rect x="17" y="2" width="1.8" height="20" rx=".9" opacity=".85"/>'
    + '<polygon points="17.9,1 21,5 17.9,7" opacity=".85"/><polygon points="17.9,5 15,8 17.9,9" opacity=".7"/>',

  // ── épületek ────────────────────────────────────────────────────────
  kozpont: '<polygon points="12,1 22,9 2,9"/><rect x="4" y="9" width="16" height="12"/>'
    + '<rect x="10" y="14" width="4" height="7" opacity=".55"/>',
  raktar: '<path d="M3 10l9-6 9 6v11H3z"/><rect x="7" y="14" width="4" height="4" opacity=".55"/>'
    + '<rect x="13" y="14" width="4" height="4" opacity=".55"/>',
  fal: '<rect x="2" y="8" width="20" height="12"/><path d="M2 8V5h4v3M10 8V5h4v3M18 8V5h4v3"/>'
    + '<path d="M2 14h20M8 8v6M16 14v6" stroke="currentColor" stroke-width="1" opacity=".45" fill="none"/>',
  kapu: '<rect x="2" y="4" width="5" height="17"/><rect x="17" y="4" width="5" height="17"/>'
    + '<rect x="2" y="2" width="20" height="4"/><path d="M9 21v-7a3 3 0 016 0v7z" opacity=".5"/>',
  haz: '<polygon points="12,3 21,11 3,11"/><rect x="5" y="11" width="14" height="10"/>'
    + '<rect x="10" y="15" width="4" height="6" opacity=".55"/><rect x="15" y="2" width="3" height="5" opacity=".7"/>',
  laktanya: '<polygon points="12,3 21,10 3,10"/><rect x="4" y="10" width="16" height="11"/>'
    + '<rect x="17" y="1" width="1.4" height="9" opacity=".8"/><polygon points="18.4,1 22,3 18.4,5" opacity=".8"/>'
    + '<rect x="9" y="14" width="6" height="7" opacity=".5"/>',
  ijaszda: '<path d="M3 11l9-7 9 7v10H3z"/><circle cx="12" cy="15" r="4" fill="none" stroke="currentColor" stroke-width="1.6" opacity=".7"/>'
    + '<circle cx="12" cy="15" r="1.3" opacity=".8"/>',
  istallo: '<polygon points="12,3 21,10 3,10"/><rect x="4" y="10" width="16" height="11"/>'
    + '<path d="M8 21v-6M12 21v-6M16 21v-6" stroke="currentColor" stroke-width="1.4" opacity=".5" fill="none"/>'
    + '<path d="M4 15h16" stroke="currentColor" stroke-width="1.4" opacity=".5" fill="none"/>',
  ostrommuhely: '<path d="M2 9h20v2H2z"/><path d="M4 9V6h16v3" fill="none" stroke="currentColor" stroke-width="1.6"/>'
    + '<rect x="6" y="13" width="12" height="3" rx="1" opacity=".8"/><circle cx="8" cy="19" r="2.4" opacity=".7"/>'
    + '<circle cx="16" cy="19" r="2.4" opacity=".7"/>',
  torony: '<path d="M7 21V7l5-5 5 5v14z"/><path d="M6 7V4h3v3M10.5 7V4h3v3M15 7V4h3v3"/>'
    + '<rect x="10.5" y="11" width="3" height="5" opacity=".5"/>',
  piac: '<path d="M2 9h20l-2-5H4z"/><rect x="3" y="9" width="18" height="2" opacity=".8"/>'
    + '<path d="M5 11v10M19 11v10" stroke="currentColor" stroke-width="1.6" fill="none"/>'
    + '<rect x="8" y="14" width="8" height="7" opacity=".55"/>',

  // ── parancsok ───────────────────────────────────────────────────────
  // Ezek a kijelölés-panel gombjai és a 3D parancs-jelölők. Azért kaptak SAJÁT
  // rajzot, mert az első kör kölcsönzött metaforákkal ment (a „tartás" a fal
  // ikonját hordta, az „állás" a népességét) — és a kölcsönzött ikon rosszabb,
  // mint a semmi: a játékos MEGTANULJA rosszul.
  allj: '<rect x="5" y="5" width="14" height="14" rx="2.5"/>',
  tartas: '<path d="M12 2l8 4v6c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10V6z"/>'
    + '<path d="M12 7v9" stroke="#000" stroke-width="1.8" opacity=".4" fill="none"/>',
  allas: '<path d="M12 2l7 3.5v6c0 4.6-3 7.8-7 9-4-1.2-7-4.4-7-9v-6z" opacity=".55"/>'
    + '<polygon points="12,6 15,12 12,18 9,12"/>',
  alakzat: '<circle cx="5" cy="6" r="2.2"/><circle cx="12" cy="6" r="2.2"/><circle cx="19" cy="6" r="2.2"/>'
    + '<circle cx="8.5" cy="13" r="2.2" opacity=".8"/><circle cx="15.5" cy="13" r="2.2" opacity=".8"/>'
    + '<circle cx="12" cy="20" r="2.2" opacity=".6"/>',
  menet: '<path d="M4 20L18 6" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"/>'
    + '<polygon points="21,3 20,10 14,4"/>',
  tamado_menet: '<path d="M3 21L16 8" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"/>'
    + '<polygon points="21,3 19,11 13,5"/>'
    + '<path d="M14 17l7 4-4-7" opacity=".75"/>',
  gyujtes: '<path d="M6 3l3 3-3 3-3-3z" opacity=".8"/>'
    + '<path d="M8 8l11 11-2.5 2.5L5.5 10.5z"/>'
    + '<path d="M15 3h6v6" fill="none" stroke="currentColor" stroke-width="1.8" opacity=".55"/>',

  // ── vezérlők és jelzések ────────────────────────────────────────────
  sebesseg: '<polygon points="2,4 11,12 2,20"/><polygon points="13,4 22,12 13,20" opacity=".8"/>',
  szunet: '<rect x="5" y="4" width="5" height="16" rx="1"/><rect x="14" y="4" width="5" height="16" rx="1"/>',
  hang: '<polygon points="3,9 8,9 13,4 13,20 8,15 3,15"/>'
    + '<path d="M16 8a6 6 0 010 8M18.5 5a10 10 0 010 14" fill="none" stroke="currentColor" stroke-width="1.8" opacity=".75"/>',
  tetlen: '<circle cx="12" cy="6" r="3"/><path d="M7 21v-6l-2-2 2-3h10l2 3-2 2v6z" opacity=".55"/>'
    + '<circle cx="19" cy="18" r="4" opacity=".9"/><path d="M19 16v2.4l1.5 1" fill="none" stroke="#000" stroke-width="1.2" opacity=".5"/>',
  figyelem: '<polygon points="12,2 23,21 1,21"/><rect x="11" y="8" width="2" height="7" fill="#000" opacity=".45"/>'
    + '<rect x="11" y="17" width="2" height="2" fill="#000" opacity=".45"/>',
  baj: '<circle cx="12" cy="12" r="10"/><path d="M8 8l8 8M16 8l-8 8" stroke="#000" stroke-width="2.2" opacity=".45" fill="none"/>',
  info: '<circle cx="12" cy="12" r="10"/><rect x="11" y="10" width="2" height="8" fill="#000" opacity=".45"/>'
    + '<rect x="11" y="6" width="2" height="2" fill="#000" opacity=".45"/>',
};

/** Az ismert ikonnevek — a szondák és a kiadás-ellenőrző ebből dolgoznak. */
export const IKON_NEVEK = Object.keys(RAJZ);

/**
 * Egy ikon SVG-forrása.
 *
 * @param {string} nev az `IKON` egyik értéke
 * @param {number} [meret=20] él-hossz képpontban
 * @param {string} [szin] felülírja a színt; alapból a hívó `currentColor`-ja,
 *   nyersanyagnál a `NYERS_SZIN` szerinti saját szín
 * @returns {string} beilleszthető `<svg>…</svg>`
 * @throws ismeretlen névre — lásd a fejlécet, ez SZÁNDÉKOS
 */
export function ikonSvg(nev, meret = 20, szin) {
  const rajz = RAJZ[nev];
  if (rajz === undefined) {
    throw new Error('ismeretlen ikon: "' + nev + '" — az ismertek: ' + IKON_NEVEK.join(', '));
  }
  const f = szin || NYERS_SZIN[nev] || 'currentColor';
  return '<svg class="aoc-ikon aoc-ikon-' + nev + '" width="' + meret + '" height="' + meret
    + '" viewBox="0 0 24 24" fill="' + f + '" aria-hidden="true" focusable="false">' + rajz + '</svg>';
}

/**
 * Ugyanaz, de kész DOM-elemként. Akkor kell, ha eseménykezelőt akasztasz rá —
 * `innerHTML`-lel visszaírva minden frissítésnél elveszne a figyelő.
 *
 * @param {string} nev
 * @param {number} [meret]
 * @param {string} [szin]
 * @returns {HTMLSpanElement}
 */
export function ikonElem(nev, meret = 20, szin) {
  const sp = document.createElement('span');
  sp.className = 'aoc-ikon-doboz';
  sp.innerHTML = ikonSvg(nev, meret, szin);
  return sp;
}
