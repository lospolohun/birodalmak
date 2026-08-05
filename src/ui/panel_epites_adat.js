// AGE OF THE CRYSTALS — AZ ÉPÍTÉS-PANEL ADATRÉTEGE (v0.16).
//
// ── MIÉRT VAN EZ KÜLÖN A PANELTŐL ─────────────────────────────────────────
// Ez a modul NEM tud a DOM-ról, a `three`-ről és a CSS-ről. Egyetlen dolgot
// csinál: megmondja, hogy EBBEN A PILLANATBAN mit lehet építeni, mibe kerül,
// mennyi ideig tart, és ha nem lehet, akkor PONTOSAN MIÉRT NEM.
//
// A szétválasztás oka gyakorlati, nem elvi: így NODE-BAN FUT, tehát szondázható
// (`npm run p:epites`). Egy DOM-ba írt gombsorról csak szemmel derülne ki, ha
// elromlik — a felhőben pedig nincs szem (nincs GPU, lásd `CLAUDE.md`). A
// `menu.js` / `menu_adat.js` és a `minimap.js` / `minimap_adat.js` ugyanezt a
// mintát követi.
//
// ── A LEGFONTOSABB SZABÁLY: EZ A RÉTEG NEM ÍR SEMMIT ──────────────────────
// Se sim-állapotot, se DOM-ot. Csak OLVAS és VÉLEMÉNYT MOND. Az egyetlen
// „hatás", amit előállít, az egy parancs-OBJEKTUM (`epitParancs`), amit a hívó
// ad be a `sim.parancs()`-nak. Ami megkerüli a parancs-sort, az a v0.8
// lockstepjén nem megy át.
//
// ── ⚠️ MIT GÁTOL A SIM, ÉS MIT GÁTOL CSAK A UI ────────────────────────────
// Ezt fontos tisztán tartani, mert a kettő NEM ugyanaz, és a különbség egy
// jövőbeli körben csendben félrevihet valakit:
//
//   NYERSANYAG   a sim gátolja (`parancsok.js` → `epit` → `gazdasag.levon`)
//   NINCS_HELY   a sim gátolja (`epuletek.lerakhato`)
//   TELE         a sim gátolja (`epuletek.lerak` → -1, az ár visszajár)
//   NINCS_MUNKAS CSAK A UI gátolja. A sim `epit` parancsa nem kér munkást.
//                Ez UX-szabály (előbb választasz parasztot, aztán építesz),
//                nem balansz — és egy kattintással orvosolható.
//   KORSZAK      a sim gátolja (`parancsok.js` → `epit`, a levonás ELŐTT) —
//                de az ÉLŐ tábla ma csupa nulla, tehát a gyakorlatban egyik
//                épületet sem köti korszakhoz. Az `epuletek.js` mondja el a
//                mért okot; a panel ettől függetlenül MINDIG a simet követi.
//
// ── ⚠️ A KORSZAK-GÁT: A PANEL A SIM PÉLDÁNYÁTÓL KÉRDEZI, NEM MÁSOLATBÓL ────
//
// A v0.16-ban a követelmény CSAK itt létezett (`EP_KORSZAK_JAVASLAT`),
// kikapcsolva — jó okkal: a sim `epit` ága nem nézett korszakot, a gépi
// ellenfél sem, tehát egy UI-oldali gát CSAK AZ EMBERT büntette volna. A v0.18
// óta a szabály a SIMBEN van (`epuletek.js` → `EP_KORSZAK` / `korszakKell()`),
// és ez a réteg onnan olvassa.
//
// ⚠️ A `sim.epuletek.korszakKell()`-t hívjuk, NEM a modul-szintű táblát. A
// követelmény PÉLDÁNYONKÉNTI adat (`Epuletek.korszakIgeny`), amit a
// meccs-felállás és a determinizmus-szonda átállíthat — egy modul-szintű
// másolat pont akkor hazudna, amikor a legfontosabb: egy bekapcsolt gátú
// meccsen a gomb engedné, amit a sim eldob. A képzés-panel ugyanígy kérdez a
// `Kepzes.korszakIgeny`-től.
//
// A modul-szintű `EP_KORSZAK` így már csak TARTALÉK arra az esetre, ha a hívó
// nem ad sim-et (a `frissitAllapot` sim nélkül nem hívható, de a táblát a
// szonda és a hossz-őr olvassa).
//
// ── ⚠️ A TIZENEGY HOSSZÚ TÁBLÁK ───────────────────────────────────────────
// Minden `EPULET`-indexelt tábla PONTOSAN 11 elemű. Egy rövid tábla `undefined`
// értéket ad, abból `NaN` ár és NÉMÁN ELTŰNŐ GOMB lesz — ebből a projektben már
// négy volt. A modul betöltéskor ellenőrzi a hosszakat és DOB, ha eltér: jobb
// egy hangos hiba az indulásnál, mint egy hiányzó gomb a pénztárnál.

import {
  EPULET, EPULET_NEV, EP_AR, EP_MERET, EP_NEPESSEG, EP_KORSZAK as SIM_EP_KORSZAK,
} from '../sim/epuletek.js';
import { KORSZAK, KORSZAK_NEV } from '../sim/gazdasag.js';
import { NYERS_NEV } from '../sim/eroforras.js';
import { TIPUS } from '../sim/units.js';
import { Civ } from '../sim/civ.js';
import { IKON } from './ikonok.js';

/** Hány épülettípus van. Az `EPULET` tizenegy tagja. */
export const EPULET_DB = 11;

/** Egy tick hossza másodpercben (20 Hz) — az építési idő kiírásához. */
const TICK_MP = 0.05;

/**
 * ÉPÍTÉSI IDŐ TICKBEN — TÜKÖR a `src/sim/epuletek.js` `EP_IDO` tömbjéről.
 *
 * ⚠️ MIÉRT MÁSOLAT, ÉS MIÉRT NEM IMPORT: az `EP_IDO` a simben `const`, NINCS
 * exportálva, a `src/sim/` alá pedig ebben a körben nem írhatunk. A
 * `render/gazdasag3d.js` ugyanezt a falat a megfigyelt maximummal kerülte meg —
 * a panelnek viszont AZELŐTT kell tudnia az időt, hogy az épület létezne.
 *
 * A másolat veszélye a SZÉTCSÚSZÁS. Ezért a szonda (`tools/panel_epites_szonda.mjs`)
 * beolvassa a sim forrását, kiszedi belőle az `EP_IDO` sorát, és összeveti
 * ezzel — eltérésnél BUKIK. Aki a simben átírja az időt, itt kap egy piros
 * kaput, nem egy hazug gombfeliratot.
 */
export const EP_IDO_TUKOR = [200, 100, 30, 60, 100, 250, 250, 250, 300, 160, 240];

/**
 * LERAKAT-E? — TÜKÖR a `LERAKO`-ról, ugyanabból az okból, mint fent.
 * A gombon ez a „a munkás ide hordja a nyersanyagot" jelzés forrása, ami a
 * raktár egyetlen létjogosultsága — enélkül a játékos nem tudja, mire jó.
 */
export const EP_LERAKO_TUKOR = [1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0];

/**
 * KORSZAK-KÖVETELMÉNY — A SIM TÁBLÁJA, nem külön másolat (v0.18).
 *
 * ⚠️ EZ A SOR A HÁROM ELŐFELTÉTEL HARMADIKA. Amíg itt saját tömb állt, a panel
 * és a sim két külön igazságot mondott, és a `p:epites` 6. vizsgálata pontosan
 * ezt az elcsúszást mérte ki (11/11 → 5/11 egyezés): a gomb ZÖLD volt olyan
 * épületre, amit a `parancsok.js` `epit` ága a levonás előtt eldobott. A
 * játékos ilyenkor nem hibaüzenetet kap, hanem SEMMIT — kattint, és nem
 * történik semmi.
 *
 * Ez csak a MODUL-szintű alapérték; a futó panel a sim PÉLDÁNYÁTÓL kérdez
 * (`sim.epuletek.korszakKell`), mert a követelmény meccsenként állítható.
 */
export const EP_KORSZAK = SIM_EP_KORSZAK;

/**
 * @deprecated A v0.18 óta a követelmény a SIMÉ (`EP_KORSZAK`). A név azért
 * marad, mert a `p:epites` szondája és a v0.16-os hívások erre hivatkoznak —
 * és mert a szondának KELL egy második, a világtól FÜGGETLEN tábla ahhoz, hogy
 * a befecskendezett gátat (`korszakTabla` opció) egyáltalán ki tudja próbálni.
 * Ma pontosan EZ a helyzet: az éles tábla csupa nulla, tehát ez a tömb az
 * egyetlen bizonyíték arra, hogy a korszak-indok (`INDOK.KORSZAK`) egyáltalán
 * elsül. Töröld le, és a szonda 3. vizsgálata némán zöld marad egy halott ág
 * fölött — a `p:epites` egyik legrégebbi tanulsága.
 */
export const EP_KORSZAK_JAVASLAT = [
  KORSZAK.SOTET,     // KOZPONT
  KORSZAK.SOTET,     // RAKTAR
  KORSZAK.SOTET,     // FAL
  KORSZAK.HAJNAL,    // KAPU
  KORSZAK.SOTET,     // HAZ
  KORSZAK.SOTET,     // LAKTANYA
  KORSZAK.HAJNAL,    // IJASZDA
  KORSZAK.HAJNAL,    // ISTALLO
  KORSZAK.KRISTALY,  // OSTROMMUHELY
  KORSZAK.HAJNAL,    // TORONY
  KORSZAK.HAJNAL,    // PIAC
];

/** Ikonnév épülettípusonként. Az `ikonSvg` ismeretlen névre DOB — szándékosan. */
export const EP_IKON = [
  IKON.KOZPONT, IKON.RAKTAR, IKON.FAL, IKON.KAPU, IKON.HAZ, IKON.LAKTANYA,
  IKON.IJASZDA, IKON.ISTALLO, IKON.OSTROMMUHELY, IKON.TORONY, IKON.PIAC,
];

/**
 * EGYSOROS MAGYARÁZAT — a gomb buboréka. Nem dísz: a tulajdonos mai próbája
 * pont azon bukott meg, hogy semmi nem mondta meg, MIRE JÓ egy épület.
 */
export const EP_LEIRAS = [
  'A csapat magja. Munkást képez, és lerakat is.',
  'Olcsó lerakat — a munkás ide hordja, amit gyűjtött. Rakd a lelőhely mellé.',
  'Lezárja a cellát. Sokat bír, de az ostromgép átüti.',
  'Kézzel nyitható átjáró a falban.',
  'Népesség +10. Katona csak akkor képezhető, ha van hova.',
  'Lándzsásokat képez.',
  'Íjászokat képez.',
  'Lovagokat képez.',
  'Ostromgépet képez — az bontja a falat és az épületet.',
  'Magától lő a közeledő ellenségre.',
  'Nyersanyag-csere 70 %-os aránnyal.',
];

/** Csoportok a gombsor tagolásához. */
export const CSOPORT = { GAZDASAG: 0, KATONAI: 1, VEDELEM: 2, KERESKEDELEM: 3 };
export const CSOPORT_NEV = ['gazdaság', 'katonai', 'védelem', 'kereskedelem'];
export const EP_CSOPORT = [
  CSOPORT.GAZDASAG,      // KOZPONT
  CSOPORT.GAZDASAG,      // RAKTAR
  CSOPORT.VEDELEM,       // FAL
  CSOPORT.VEDELEM,       // KAPU
  CSOPORT.GAZDASAG,      // HAZ
  CSOPORT.KATONAI,       // LAKTANYA
  CSOPORT.KATONAI,       // IJASZDA
  CSOPORT.KATONAI,       // ISTALLO
  CSOPORT.KATONAI,       // OSTROMMUHELY
  CSOPORT.VEDELEM,       // TORONY
  CSOPORT.KERESKEDELEM,  // PIAC
];

/**
 * MEGJELENÍTÉSI SORREND. Nem az `EPULET` számsorrendje: a játékos a gazdaságot
 * építi először, és a szem balról jobbra olvas. A tömb MIND A TIZENEGY tagot
 * tartalmazza — a szonda ezt külön ellenőrzi (hiányzó tag = eltűnt gomb).
 */
export const EP_SORREND = [
  EPULET.HAZ, EPULET.RAKTAR, EPULET.KOZPONT,
  EPULET.LAKTANYA, EPULET.IJASZDA, EPULET.ISTALLO, EPULET.OSTROMMUHELY,
  EPULET.TORONY, EPULET.FAL, EPULET.KAPU,
  EPULET.PIAC,
];

/**
 * MIÉRT NEM LEHET ÉPÍTENI. A `NINCS_HELY` sosem gomb-szintű indok: az csak a
 * kurzor alatt derül ki (`lerakasAllapot`).
 */
export const INDOK = {
  OK: 0,
  TELE: 1,
  KORSZAK: 2,
  NINCS_MUNKAS: 3,
  NYERSANYAG: 4,
  NINCS_HELY: 5,
};
export const INDOK_DB = 6;
export const INDOK_NEV = [
  'építhető', 'betelt az épület-tár', 'korszak', 'nincs kijelölt paraszt',
  'nincs elég nyersanyag', 'ide nem rakható le',
];

/**
 * AZ INDOKOK RANGSORA — melyik nyer, ha több is igaz.
 *
 * A sorrend nem esztétika: MARADANDÓSÁG szerint megy. A „betelt a tár" nem
 * múlik el magától, a korszak sokára, a paraszt egy kattintással, a nyersanyag
 * pedig magától. A játékosnak azt kell mondani, ami a legmesszebb van tőle —
 * különben „nincs elég fa" felirat alatt vár percekig valamire, ami sosem jön.
 */
const RANGSOR = [INDOK.TELE, INDOK.KORSZAK, INDOK.NINCS_MUNKAS, INDOK.NYERSANYAG];

// ── ⚠️ HOSSZ-ŐR ─────────────────────────────────────────────────────────
// Betöltéskor fut le, egyszer. Egy 10 elemű tábla `undefined`-ot adna a 11.
// helyen, abból NaN ár és némán eltűnő gomb lenne. Inkább hangos hiba.
{
  const tablak = {
    EPULET_NEV, EP_AR, EP_MERET, EP_NEPESSEG,
    EP_IDO_TUKOR, EP_LERAKO_TUKOR, EP_KORSZAK, EP_KORSZAK_JAVASLAT,
    EP_IKON, EP_LEIRAS, EP_CSOPORT, EP_SORREND,
  };
  const rossz = [];
  for (const nev of Object.keys(tablak)) {
    if (tablak[nev].length !== EPULET_DB) rossz.push(nev + ' (' + tablak[nev].length + ')');
  }
  if (rossz.length) {
    throw new Error('panel_epites_adat: EPULET-indexelt tábla nem ' + EPULET_DB
      + ' hosszú: ' + rossz.join(', '));
  }
  // A sorrend legyen PERMUTÁCIÓ, ne csak ugyanolyan hosszú: két azonos tag
  // ugyanúgy eltüntetne egy gombot, csak nehezebben észrevehetően.
  const latott = new Set(EP_SORREND);
  if (latott.size !== EPULET_DB) {
    throw new Error('panel_epites_adat: az EP_SORREND nem permutáció — '
      + latott.size + ' különböző tag ' + EPULET_DB + ' helyett');
  }
}

/**
 * ÜRES, ELŐRE LEFOGLALT ÁLLAPOT. A panel egyszer hívja, aztán minden képkockán
 * ugyanezt tölti újra — a `frissit()` így NEM ALLOKÁL (a panel-szerződés 3.
 * pontja: a HUD 60-144 Hz-en fut).
 */
export function ujAllapot() {
  const elemek = new Array(EPULET_DB);
  for (let k = 0; k < EPULET_DB; k++) {
    const t = EP_SORREND[k];
    elemek[k] = {
      tipus: t,
      nev: EPULET_NEV[t],
      ikon: EP_IKON[t],
      leiras: EP_LEIRAS[t],
      csoport: EP_CSOPORT[t],
      meret: EP_MERET[t],
      nepesseg: EP_NEPESSEG[t],
      lerako: EP_LERAKO_TUKOR[t] === 1,
      ido: EP_IDO_TUKOR[t],
      idoMp: EP_IDO_TUKOR[t] * TICK_MP,
      korszakKell: 0,
      /** A TÉNYLEGES ár (civ-kedvezménnyel), nem a nyers `EP_AR`. */
      ar: new Int32Array(4),
      /** Mennyi hiányzik fajtánként. Nulla = megvan. */
      hiany: new Int32Array(4),
      hianyDb: 0,
      epitheto: false,
      indok: INDOK.NINCS_MUNKAS,
    };
  }
  return {
    csapat: 0,
    korszak: 0,
    korszakNev: KORSZAK_NEV[0],
    keszlet: new Int32Array(4),
    munkasDb: 0,
    /** Szabad hely az épület-tárban (`maxDb - db`). */
    szabadSlot: 0,
    epithetoDb: 0,
    tiltottDb: 0,
    /** Indokonkénti darabszám — EZ a szonda működés-száma. */
    indokDb: new Int32Array(INDOK_DB),
    elemek,
  };
}

/**
 * HÁNY MUNKÁS VAN A KIJELÖLÉSBEN. DOM-mentes, tehát szondázható — a panel a
 * `bevitel.kijeloles.lista`-ját adja át.
 *
 * A halottakat kihagyjuk: a kijelölés-lista egy tickig tarthat halott indexet,
 * és egy hulla nem épít.
 *
 * @param {import('../sim/sim.js').Sim} sim
 * @param {number} csapat
 * @param {number[]|Int32Array} lista egység-indexek
 */
export function munkasSzam(sim, csapat, lista) {
  if (!lista || !lista.length) return 0;
  const e = sim.egysegek;
  const harc = sim.harc;
  let db = 0;
  for (let k = 0; k < lista.length; k++) {
    const i = lista[k];
    if (i < 0 || i >= e.db) continue;
    if (e.csapat[i] !== csapat) continue;
    if (e.tipus[i] !== TIPUS.MUNKAS) continue;
    if (harc && harc.elo[i] === 0) continue;
    db++;
  }
  return db;
}

/**
 * A TELJES ÉPÍTÉS-ÁLLAPOT egy csapatra. Nulla allokáció, ha `ki`-t adsz.
 *
 * @param {import('../sim/sim.js').Sim} sim
 * @param {number} csapat
 * @param {{munkasDb?:number, munkasKell?:boolean, korszakTabla?:number[]}} [opciok]
 * @param {ReturnType<ujAllapot>} [ki] újrahasznált kimenet
 */
export function frissitAllapot(sim, csapat, opciok, ki) {
  const a = ki || ujAllapot();
  const o = opciok || {};
  const g = sim.gazdasag;
  const ep = sim.epuletek;
  // ⚠️ A SORREND A SZERZŐDÉS: a hívó befecskendezett táblája (szonda) legyen
  // az első, utána a sim PÉLDÁNYA, és csak legvégül a modul-szintű alapérték.
  // A példány azért van a tábla ELŐTT, mert a követelmény meccsenként
  // állítható (`Epuletek.korszakGat`) — egy modul-szintű olvasat pont a
  // bekapcsolt gátú meccsen hazudna.
  // ⚠️ NEM ZÁRVÁNY (`(t) => …`), HANEM KÉT HELYI VÁLTOZÓ. A `frissitAllapot`
  // a HUD forró útja, minden képkockán lefut, és a panel-szerződés 3. pontja
  // nulla allokációt ír elő — egy körönként újragyártott nyílfüggvény pont az.
  const korszakTabla = o.korszakTabla || null;
  const korszakForras = (!korszakTabla && typeof ep.korszakKell === 'function') ? ep : null;
  const munkasKell = o.munkasKell !== false;
  const munkasDb = o.munkasDb | 0;

  a.csapat = csapat;
  a.korszak = g.korszak[csapat];
  a.korszakNev = KORSZAK_NEV[a.korszak] || '?';
  for (let f = 0; f < 4; f++) a.keszlet[f] = g.keszlet[csapat * 4 + f];
  a.munkasDb = munkasDb;
  a.szabadSlot = ep.maxDb - ep.db;
  a.epithetoDb = 0;
  a.tiltottDb = 0;
  a.indokDb.fill(0);

  // A civ-kedvezmény (v0.9) ugyanazzal a kerekítéssel, amit a `parancsok.js`
  // `epit` ága használ — különben a gombon más ár állna, mint amit a sim levon.
  const arSzaz = sim.civ ? sim.civ.epuletArSzazalek(csapat) : 100;

  for (let k = 0; k < EPULET_DB; k++) {
    const el = a.elemek[k];
    const t = el.tipus;
    Civ.arSzazalek(EP_AR[t], arSzaz, el.ar);
    el.korszakKell = korszakTabla ? (korszakTabla[t] | 0)
      : (korszakForras ? korszakForras.korszakKell(t) : (EP_KORSZAK[t] | 0));

    let hianyDb = 0;
    for (let f = 0; f < 4; f++) {
      const h = el.ar[f] - a.keszlet[f];
      el.hiany[f] = h > 0 ? h : 0;
      if (h > 0) hianyDb++;
    }
    el.hianyDb = hianyDb;

    // A rangsor szerint az ELSŐ igaz tiltás nyer (lásd `RANGSOR` magyarázata).
    let indok = INDOK.OK;
    for (let r = 0; r < RANGSOR.length; r++) {
      const jelolt = RANGSOR[r];
      if (jelolt === INDOK.TELE && a.szabadSlot <= 0) { indok = jelolt; break; }
      if (jelolt === INDOK.KORSZAK && a.korszak < el.korszakKell) { indok = jelolt; break; }
      if (jelolt === INDOK.NINCS_MUNKAS && munkasKell && munkasDb <= 0) { indok = jelolt; break; }
      if (jelolt === INDOK.NYERSANYAG && hianyDb > 0) { indok = jelolt; break; }
    }
    el.indok = indok;
    el.epitheto = indok === INDOK.OK;
    a.indokDb[indok]++;
    if (el.epitheto) a.epithetoDb++; else a.tiltottDb++;
  }
  return a;
}

/** Kényelmi burkoló a szondának és az egyszeri lekérdezésnek. Allokál. */
export function epitesLista(sim, csapat, opciok) {
  return frissitAllapot(sim, csapat, opciok, ujAllapot());
}

/**
 * A BAL-FELSŐ CELLA egy világkoordinátás kattintásból.
 *
 * ⚠️ BETŰRE ugyanaz a számítás, mint a `src/sim/parancsok.js` `epit` ágában.
 * Ha itt máshogy kerekítenénk, az előnézet-négyzet nem ott lenne, ahova az
 * épület kerül — és a játékos a szomszéd cellába építene, mint amit lát.
 */
export function balFelso(tipus, wx, wy, ki) {
  const m = EP_MERET[tipus];
  const k = ki || { x: 0, y: 0 };
  k.x = (wx | 0) - (m >> 1);
  k.y = (wy | 0) - (m >> 1);
  return k;
}

/** Üres, előre lefoglalt lerakás-eredmény — a mozgó kurzor se allokáljon. */
export function ujLerakas() {
  return { tipus: -1, ok: false, indok: INDOK.NINCS_HELY, bx: 0, by: 0, meret: 1,
    /** Belső, újrahasznált pont a bal-felső cellához. */
    _b: { x: 0, y: 0 } };
}

/**
 * LERAKHATÓ-E IDE? A kurzor alatti visszajelzés forrása.
 *
 * Előbb az általános tiltásokat nézi (ugyanazok, mint a gombon), és csak utána
 * a helyet: ha nem telik rá, akkor hiába szabad a föld — a zöld négyzet
 * hazudna, a sim pedig csendben eldobná a parancsot.
 *
 * @param {import('../sim/sim.js').Sim} sim
 * @param {ReturnType<ujAllapot>} allapot a `frissitAllapot` friss kimenete
 * @param {number} tipus
 * @param {number} wx világkoordináta @param {number} wy
 * @param {ReturnType<ujLerakas>} [ki]
 */
export function lerakasAllapot(sim, allapot, tipus, wx, wy, ki) {
  const r = ki || ujLerakas();
  r.tipus = tipus;
  r.meret = EP_MERET[tipus];
  const b = balFelso(tipus, wx, wy, r._b);
  r.bx = b.x; r.by = b.y;

  let gombIndok = INDOK.OK;
  for (let k = 0; k < allapot.elemek.length; k++) {
    if (allapot.elemek[k].tipus === tipus) { gombIndok = allapot.elemek[k].indok; break; }
  }
  if (gombIndok !== INDOK.OK) { r.indok = gombIndok; r.ok = false; return r; }

  const jo = sim.epuletek.lerakhato(tipus, r.bx, r.by);
  r.indok = jo ? INDOK.OK : INDOK.NINCS_HELY;
  r.ok = jo;
  return r;
}

/**
 * AZ ÉPÍTÉS-PARANCS OBJEKTUMA. Egyetlen helyen áll össze, hogy a mezőnevek ne
 * csússzanak el: a `tipus` az `EPULET.*`, az `x`/`y` pedig az épület KÖZEPE
 * világkoordinátában — a sim ebből számol bal-felső cellát.
 *
 * A hívó dolga beadni: `sim.parancs(epitParancs(...))`. Ez a réteg nem hívja.
 */
export function epitParancs(csapat, tipus, wx, wy) {
  return { fajta: 'epit', csapat: csapat | 0, tipus: tipus | 0, x: wx, y: wy };
}

// ── SZÖVEGEK ─────────────────────────────────────────────────────────────
// Külön függvények, mert a panel csak formáz, és mert így a szonda a
// FELIRATOT is meg tudja nézni — az `undefined`/`NaN` a gombon némán elfér.

/** „250 fa · 100 kő" — a nulla tételek kimaradnak. */
export function arSzoveg(elem) {
  let sz = '';
  for (let f = 0; f < 4; f++) {
    if (elem.ar[f] <= 0) continue;
    if (sz) sz += ' · ';
    sz += elem.ar[f] + ' ' + NYERS_NEV[f];
  }
  return sz || 'ingyen';
}

/** „10 mp" / „1,5 mp" — magyar tizedesvesszővel, felesleges nulla nélkül. */
export function idoSzoveg(elem) {
  const mp = elem.ido * TICK_MP;
  const egesz = Math.round(mp * 10) / 10;
  return String(egesz).replace('.', ',') + ' mp';
}

/**
 * MIÉRT NEM LEHET — KONKRÉTAN. Nem „nem építhető", hanem „még 120 fa kell".
 * A tulajdonos mai próbájának pont ez hiányzott: a tiltás önmagában nem
 * információ, csak elutasítás.
 */
export function indokSzoveg(allapot, elem, indokFelul) {
  // A felülírás a kurzor-visszajelzésé: ott az `elem` a gomb állapotát hozza,
  // az indok viszont a HELYRŐL szól. Objektum-másolás helyett paraméter — a
  // `{ ...elem }` képkockánként allokálna, és pont ez a réteg forró útja.
  const indok = indokFelul === undefined ? elem.indok : indokFelul;
  switch (indok) {
    case INDOK.OK:
      return 'építhető';
    case INDOK.TELE:
      return 'betelt az épület-tár (szabad hely: ' + allapot.szabadSlot
        + ') — bonts vagy veszíts el egyet';
    case INDOK.KORSZAK:
      return 'kell hozzá: ' + (KORSZAK_NEV[elem.korszakKell] || '?')
        + ' (most: ' + allapot.korszakNev + ')';
    case INDOK.NINCS_MUNKAS:
      return 'jelölj ki egy parasztot, aki felépíti';
    case INDOK.NYERSANYAG: {
      let sz = '';
      for (let f = 0; f < 4; f++) {
        if (elem.hiany[f] <= 0) continue;
        if (sz) sz += ', ';
        sz += 'még ' + elem.hiany[f] + ' ' + NYERS_NEV[f];
      }
      return sz || 'nincs elég nyersanyag';
    }
    case INDOK.NINCS_HELY:
      return 'ide nem fér el ' + elem.meret + '×' + elem.meret + ' cella';
    default:
      return 'ismeretlen ok';
  }
}

/** A kurzor alatti visszajelzés mondata. */
export function lerakasSzoveg(allapot, lerakas) {
  const el = elemTipusbol(allapot, lerakas.tipus);
  if (!el) return '';
  if (lerakas.ok) return el.nev + ' ide — kattints';
  return el.nev + ': ' + indokSzoveg(allapot, el, lerakas.indok);
}

/** Egy elem a megjelenítési listából, típus szerint. */
export function elemTipusbol(allapot, tipus) {
  for (let k = 0; k < allapot.elemek.length; k++) {
    if (allapot.elemek[k].tipus === tipus) return allapot.elemek[k];
  }
  return null;
}
