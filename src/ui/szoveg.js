// AGE OF THE CRYSTALS — SZÖVEG-RÉTEG: kulcs → felirat feloldás (v0.20 előkészítés).
//
// ── MIÉRT VAN EGYÁLTALÁN SZÜKSÉG RÁ ───────────────────────────────────────
// A v0.20 két nyelvet ígér, és a felület MA 500+ magyar sztringet fűz össze
// tizenhat fájlban. Ha a nyelvváltás azt jelentené, hogy mind a tizenhat
// fájlban van egy `if (angol)`, akkor a nyelv nem egy réteg lenne, hanem egy
// szokás — és a következő panel írója ugyanúgy beírná a magyar szöveget, mint
// eddig. Egy hely, ahol a szöveg LAKIK: ez a fájl és a két szótár mellette.
//
// ── MIÉRT NEM AD ÜRES STRINGET ISMERETLEN KULCSRA ─────────────────────────
// Mert az üres string NÉMÁN tűnik el. A projektnek ez a leggyakoribb hibafajtája
// (rövid `LATOTAV`, rövid `SUGAR`, néma lövedék-hang, halott civ-horog,
// kirajzolatlan egyedi egység) — az `ikonok.js` ezért DOB ismeretlen névre.
// Itt viszont a `frissit()` HÍVJA, képkockánként: egy dobás a HUD-ot ölné meg
// 144-szer másodpercenként, a játékos szeme előtt. Ezért két üzemmód van, és a
// kettő ugyanazt a hibát mondja el, csak más hangerőn:
//
//   · LAZA (alapértelmezés, futó játék): a válasz «kulcs.neve» — a francia
//     idézőjel a képernyőn ordít, a `console.error` KULCSONKÉNT EGYSZER szól
//     (nincs napló-özön), és a hiány BENNE MARAD a `hianyzoKulcsok()`-ban.
//   · SZIGORÚ (szonda, boot-ellenőrzés): DOB. Itt nincs játékos, akit meg
//     kelljen kímélni, viszont van kapu, aminek pirosat kell mutatnia.
//
// A `hianyzoKulcsok()` a lényeg: egy laza módban elnyelt hiba is SZÁMLÁLÓT
// mozgat, tehát a boot-ellenőrzés és a szonda utólag is megfogja.
//
// ── NULLA PER-FRAME ALLOKÁCIÓ ─────────────────────────────────────────────
// A panelek `frissit()`-jéből hívjuk, tehát a TALÁLAT ága nem allokálhat:
// `sz()` egyetlen tulajdonság-olvasás, és a TÁROLT stringet adja vissza. Nincs
// benne `+`, nincs sablon-literál, nincs `replace`, nincs tömb — a
// `tools/szoveg_szonda.mjs` ezt a forrásból is ellenőrzi, mert egy kényelmi
// `+` később csendben visszacsúszna.
//
// A hiány-ág egyszer allokál (a jelölőt), aztán TÁROLJA: még a hibás kulcs is
// allokáció-mentes lesz a második képkockától. Egy elgépelt kulcs így nem
// fojtja meg a képkockát, csak ordít.
//
// A `szF()` (behelyettesítés) EGY stringet allokál — pontosan annyit, amennyit
// a mai `a + ' mp'` fűzés. Nem ingyen van: a panel-szerződés 3. pontja
// változatlanul él, csak akkor hívd, ha az ÉRTÉK VÁLTOZOTT.
//
// ── HOGYAN TUDJA A PANEL, HOGY ÚJRA KELL RAJZOLNIA ────────────────────────
// `generacio()`: egy szám, ami nyelvváltáskor nő. A panel eltárolja, és a
// `frissit()`-ben összeveti — se eseménykezelő, se figyelő-lista, se objektum,
// tehát a nyelvváltás nem szivárogtat memóriát és nem kerül képkockába.
//
// ── RAGOZÁS ÉS SZÓREND ────────────────────────────────────────────────────
// A `{0} {1} {2}` helyőrzők a SZÓRENDET oldják meg: a magyar „sorban: {0}
// (kész: {1})" és az angol „{1} done, {0} queued" ugyanabból a két értékből
// épül, fordított sorrendben. A szonda ezért nem a helyőrzők SORRENDJÉT, hanem
// a HALMAZÁT veti össze a két nyelv közt: ami az egyik oldalon szerepel és a
// másikon nem, az egy némán eltűnő adat.
//
// A TÖBBES SZÁM viszont nem szórend-, hanem nyelvtan-kérdés, és a két nyelv itt
// NEM szimmetrikus: a magyar számnév után egyes szám áll („3 egység"), az angol
// után többes („3 units"). Ezért egy kulcs ÉRTÉKE nyelvenként lehet más ALAKÚ:
// magyarul egy string, angolul `[egyes, többes]` pár. A `szT()` mindkettőt
// kezeli — a hívó panelnek nem kell tudnia, melyik nyelven melyik a helyzet.
//
// ⚠️ AMI NEM ILYEN, ÉS EZÉRT NINCS ITT GÉPI MEGOLDÁSA: a magyar BIRTOKOS
// szerkezet. A „hajnal kora" nem ragozható toldalékkal („hajnal koraban"
// értelmetlen). A `panel_technologia_adat.js` ezt már ma is úgy oldja meg, hogy
// mind a négy korszak mind a két ragozott alakját KIÍRJA. A szótárban ugyanez a
// szabály: a ragozott alak SAJÁT KULCS (`sim.korszak.hajnal.hely`), nem
// futásidejű toldalékolás. Egy „okos" ragozó itt garantáltan rossz, csak nem
// mindig — és pont a ritkán látott korszakokban törne el.
//
// HASZNÁLAT:
//   import { sz, szF, nyelvValt, generacio } from './szoveg.js';
//   elem.textContent = sz('hud.nepesseg');
//   elem.textContent = szF('fmt.mp', 12);          // „12 mp" · „12 s"

import { HU } from './szoveg_hu.js';
import { EN } from './szoveg_en.js';

/** A támogatott nyelvek kódja. A sorrend a nyelvválasztó sorrendje. */
export const NYELVEK = ['hu', 'en'];

/**
 * A nyelvek neve A SAJÁT NYELVÜKÖN — ez az egyetlen szöveg, ami SOSEM kerül a
 * szótárba. Aki angol felületet keres, az az „English" szót ismeri fel, nem az
 * „Angol"-t; a nyelvválasztónak akkor is olvashatónak kell lennie, ha a
 * felhasználó egy szót sem ért az éppen beállított nyelven.
 */
export const NYELV_CIMKE = { hu: 'Magyar', en: 'English' };

/** A szótárak, nyelvkód szerint. */
const SZOTAR = { hu: HU, en: EN };

let _kod = 'hu';
let _tar = HU;
let _generacio = 1;
let _szigoru = false;

/**
 * A HIÁNYZÓ KULCSOK JELÖLŐI, kulcs → «kulcs».
 *
 * Két dolgot csinál egyszerre: (1) a második hívástól nem allokál, tehát egy
 * elgépelt kulcs nem eszi meg a képkockát; (2) ez maga a hiány-NAPLÓ, amit a
 * boot-ellenőrzés és a szonda utólag elkér. `Object.create(null)`, hogy egy
 * `'constructor'` nevű kulcs se találjon véletlenül örökölt értéket.
 */
let _hianyTar = Object.create(null);
let _hianyDb = 0;

/** Az aktív nyelv kódja. */
export function nyelv() { return _kod; }

/**
 * Nyelvváltáskor NŐ. A panel ezt tárolja el, és a `frissit()`-ben hasonlítja:
 * `if (g !== this._nyelvGen) { …újrarajzol…; this._nyelvGen = g; }`
 */
export function generacio() { return _generacio; }

/**
 * Nyelvváltás. ISMERETLEN NYELVRE DOB — ez nem a `frissit()` útja, hanem egy
 * gombnyomás, és egy elgépelt nyelvkódtól nem szabad félig magyar felületnek
 * maradnia. (A menü a `NYELVEK` listából kínál, tehát elgépelni csak kódban
 * lehet.)
 *
 * @param {string} kod
 * @returns {number} az új generáció-szám
 */
export function nyelvValt(kod) {
  const uj = SZOTAR[kod];
  if (uj === undefined) {
    throw new Error('[szoveg] ismeretlen nyelv: ' + kod + ' (ismertek: ' + NYELVEK.join(', ') + ')');
  }
  if (kod === _kod) return _generacio;
  _kod = kod;
  _tar = uj;
  _generacio++;
  // ⚠️ A jelölő-tár ELDOBANDÓ: ami az egyik nyelvben hiányzott, a másikban
  // meglehet. Ha megmaradna, a nyelvváltás után is «kulcs» jönne vissza, és a
  // hiba a rossz nyelvre íródna a naplóban.
  _hianyTar = Object.create(null);
  return _generacio;
}

/**
 * Szigorú mód: ismeretlen kulcsra DOB, nem jelölőt ad.
 *
 * A szonda és a boot-ellenőrzés kapcsolja be. A futó játékban SOSEM: ott a
 * dobás egy panelt ölne meg a játékos szeme előtt, ráadásul képkockánként.
 *
 * @param {boolean} be
 */
export function szigoruMod(be) { _szigoru = !!be; }

/** Hány KÜLÖNBÖZŐ kulcs hiányzott a legutóbbi nyelvváltás óta. */
export function hianyDb() { return _hianyDb; }

/** A hiányzott kulcsok listája (a nyelvváltás nullázza). Csak jelentéshez. */
export function hianyzoKulcsok() {
  const ki = [];
  for (const k in _hianyTar) ki.push(k);
  ki.sort();
  return ki;
}

/** A számlálók nullázása — a szonda ágai közt kell. */
export function hianyNullaz() { _hianyTar = Object.create(null); _hianyDb = 0; }

/**
 * A HIÁNY-ÁG. Szándékosan külön függvény: így a `sz()` törzse egyetlen
 * tulajdonság-olvasás marad, és a szonda a forrásából is látja, hogy nem
 * allokál.
 */
function _hiany(kulcs, ertek) {
  const miert = ertek === undefined
    ? 'ismeretlen kulcs'
    : 'többes alakú kulcs `sz()`-szel — `szT(kulcs, n)` kell';
  if (_szigoru) throw new Error('[szoveg] ' + miert + ': ' + kulcs + ' (' + _kod + ')');
  const kesz = _hianyTar[kulcs];
  if (kesz !== undefined) return kesz;
  _hianyDb++;
  console.error('[szoveg] ' + miert + ': ' + kulcs + ' (' + _kod + ')');
  const jelolo = '«' + kulcs + '»';
  _hianyTar[kulcs] = jelolo;
  return jelolo;
}

/**
 * FELOLDÁS. Ez fut a `frissit()`-ből, ezért egyetlen tulajdonság-olvasás.
 *
 * @param {string} kulcs
 * @returns {string}
 */
export function sz(kulcs) {
  const v = _tar[kulcs];
  if (typeof v === 'string') return v;
  return _hiany(kulcs, v);
}

/** Van-e ilyen kulcs az aktív nyelvben? (Feltételes felirathoz; nem naplóz.) */
export function van(kulcs) { return _tar[kulcs] !== undefined; }

/**
 * A `{0} {1} {2}` helyőrzők behelyettesítése.
 *
 * ⚠️ EGY undefined ÉRTÉK NEM CSÚSZHAT ÁT. A naiv megoldás az `'undefined'`
 * szót írná a képernyőre — pontosan az a hibafajta, amit a `KIADAS_ELVARASOK`
 * G) szakasza a rövid tábláknál leír: látszik, de senki nem nézi meg. Ezért a
 * hiányzó érték a `«{0}?»` jelölőt kapja, és szigorú módban DOB.
 */
function _behelyettesit(minta, kulcs, a, b, c) {
  let ki = '';
  let i = 0;
  const n = minta.length;
  while (i < n) {
    const k = minta.indexOf('{', i);
    if (k < 0) { ki += minta.slice(i); break; }
    const jegy = minta.charCodeAt(k + 1) - 48;
    if (jegy < 0 || jegy > 2 || minta.charCodeAt(k + 2) !== 125) {
      // Nem helyőrző, csak egy kapcsos zárójel: mehet szövegként.
      ki += minta.slice(i, k + 1);
      i = k + 1;
      continue;
    }
    const ertek = jegy === 0 ? a : (jegy === 1 ? b : c);
    ki += minta.slice(i, k);
    if (ertek === undefined || ertek === null) {
      if (_szigoru) {
        throw new Error('[szoveg] a(z) `' + kulcs + '` {' + jegy + '} helyőrzőjéhez nem jött érték');
      }
      _hianyDb++;
      ki += '«{' + jegy + '}?»';
    } else {
      ki += ertek;
    }
    i = k + 3;
  }
  return ki;
}

/**
 * FORMÁZOTT felirat. EGY stringet allokál — ugyanannyit, mint a mai `+` fűzés.
 * A panel-szerződés 3. pontja miatt csak VÁLTOZÁSKOR hívd.
 *
 * @param {string} kulcs
 * @param {string|number} [a] a `{0}` helyére
 * @param {string|number} [b] a `{1}` helyére
 * @param {string|number} [c] a `{2}` helyére
 * @returns {string}
 */
export function szF(kulcs, a, b, c) {
  const v = _tar[kulcs];
  if (typeof v !== 'string') return _hiany(kulcs, v);
  return _behelyettesit(v, kulcs, a, b, c);
}

/**
 * SZÁMHOZ KÖTÖTT felirat. A `{0}` maga a szám.
 *
 * A kulcs értéke lehet string (magyar: „{0} egység") vagy `[egyes, többes]` pár
 * (angol: „{0} unit" / „{0} units"). A HÍVÓNAK NEM KELL TUDNIA, melyik nyelven
 * melyik — épp ezért van külön függvény: ha a panel maga döntene a többes
 * számról, a döntés magyar nyelvtan szerint születne, és az angol oldal némán
 * lenne agrammatikus.
 *
 * @param {string} kulcs
 * @param {number} n
 * @param {string|number} [b] a `{1}` helyére
 * @returns {string}
 */
export function szT(kulcs, n, b) {
  const v = _tar[kulcs];
  if (typeof v === 'string') return _behelyettesit(v, kulcs, n, b, undefined);
  if (Array.isArray(v)) return _behelyettesit(n === 1 ? v[0] : v[1], kulcs, n, b, undefined);
  return _hiany(kulcs, v === undefined ? undefined : v);
}

/**
 * TELJES SZÓTÁR-ELLENŐRZÉS — ez a réteg SAJÁT kapuja.
 *
 * A boot ezt hívja (és szigorú módban a szonda), mert a hiány-számláló csak
 * arról tud, amit VALAKI MÁR MEGKÉRDEZETT: egy soha meg nem nyitott panel
 * hiányzó kulcsa a játék végéig láthatatlan maradna. Ez a függvény viszont
 * MINDEN kulcsot végignéz, mielőtt bárki bármit kérdezne.
 *
 * ⚠️ Felülírható bemenetet vesz, hogy a szonda SZABOTÁZZSAL is meghívhassa. Egy
 * ellenőrzés, amit sosem próbáltak ki hibás bemeneten, maga is hiba — ez a
 * `panel_technologia_adat.js` `tablakEllenorzes()`-ének bevált mintája.
 *
 * @param {{[nyelv:string]: object}} [tarak] felülírható szótár-készlet
 * @returns {string[]} a hibák; ÜRES tömb = rendben
 */
export function ellenorzes(tarak) {
  const t = tarak || SZOTAR;
  const hibak = [];
  const kodok = [];
  for (const k in t) kodok.push(k);
  kodok.sort();
  if (kodok.length < 2) {
    hibak.push('legalább két nyelv kell az összevetéshez, most ' + kodok.length + ' van');
    return hibak;
  }

  // 1. Kulcs-halmazok — árva kulcs egyik oldalon sem lehet.
  const alap = kodok[0];
  const alapKulcsok = Object.keys(t[alap]).sort();
  for (const kod of kodok) {
    if (kod === alap) continue;
    const masikKulcsok = new Set(Object.keys(t[kod]));
    for (const k of alapKulcsok) {
      if (!masikKulcsok.has(k)) hibak.push(kod + ': hiányzó kulcs — ' + k + ' (megvan itt: ' + alap + ')');
    }
    const alapHalmaz = new Set(alapKulcsok);
    for (const k of Object.keys(t[kod]).sort()) {
      if (!alapHalmaz.has(k)) hibak.push(alap + ': hiányzó kulcs — ' + k + ' (megvan itt: ' + kod + ')');
    }
  }

  // 2. Érték-alak és üres felirat.
  for (const kod of kodok) {
    for (const k of Object.keys(t[kod]).sort()) {
      const v = t[kod][k];
      if (typeof v === 'string') {
        if (v.length === 0) hibak.push(kod + ': ÜRES felirat — ' + k);
        continue;
      }
      if (Array.isArray(v)) {
        if (v.length !== 2) {
          hibak.push(kod + ': a többes alak nem [egyes, többes] pár (' + v.length + ' elem) — ' + k);
          continue;
        }
        if (typeof v[0] !== 'string' || typeof v[1] !== 'string') {
          hibak.push(kod + ': a többes alak nem két string — ' + k);
        } else if (!v[0] || !v[1]) {
          hibak.push(kod + ': ÜRES felirat a többes alakban — ' + k);
        }
        continue;
      }
      hibak.push(kod + ': az érték nem string és nem [egyes, többes] pár — ' + k);
    }
  }

  // 3. Helyőrző-HALMAZOK. Nem a sorrendet nézzük — az épp a szórend, és
  //    nyelvenként másnak KELL lennie. Azt nézzük, hogy ugyanaz az ADAT
  //    jelenik-e meg mindkét nyelven: egy lemaradt `{1}` némán eltűnő szám.
  for (const k of alapKulcsok) {
    let elso = null;
    for (const kod of kodok) {
      const v = t[kod][k];
      if (v === undefined) continue;
      const h = _helyorzok(v);
      if (elso === null) { elso = { kod, h }; continue; }
      if (h !== elso.h) {
        hibak.push('eltérő helyőrző-készlet — ' + k + ': ' + elso.kod + ' „' + _jegyek(elso.h)
          + '" ≠ ' + kod + ' „' + _jegyek(h) + '"');
      }
    }
  }

  return hibak;
}

/** A `{0} {1} {2}` jelenléte bitmaszkban — tömb-értékre a két alak UNIÓJA. */
function _helyorzok(ertek) {
  if (Array.isArray(ertek)) return _helyorzok(ertek[0]) | _helyorzok(ertek[1]);
  let m = 0;
  const s = String(ertek);
  for (let i = 0; i + 2 < s.length; i++) {
    if (s.charCodeAt(i) !== 123 || s.charCodeAt(i + 2) !== 125) continue;
    const j = s.charCodeAt(i + 1) - 48;
    if (j >= 0 && j <= 2) m |= 1 << j;
  }
  return m;
}

/** Bitmaszk → olvasható „{0} {1}" a hibaüzenethez. */
function _jegyek(m) {
  let s = '';
  for (let j = 0; j <= 2; j++) if (m & (1 << j)) s += (s ? ' ' : '') + '{' + j + '}';
  return s || '(nincs)';
}
