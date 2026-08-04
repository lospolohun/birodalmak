// AGE OF THE CRYSTALS — A CIPELT ÁRU (a paraszt kezében látszó rakomány).
//
// ── MIÉRT VAN EGYÁLTALÁN ──────────────────────────────────────────────────
// A TELEPESEK egyik legjobb részlete, hogy a hordár kezében LÁTSZIK, mit visz.
// Ez nem díszítés: ebből olvasható le egy pillantásból, hogy a gazdaság melyik
// ága megy — hol jön a fa, hol a kő, és melyik szállítmány mikor ér be. Nálunk
// eddig minden paraszt ugyanúgy nézett ki tele kézzel és üresen.
//
// ── EGY MESH, NÉGY NYERSANYAG — ÉS MIÉRT NEM NÉGY MESH ────────────────────
// Az egység-réteg a mérés SZŰK KERESZTMETSZETE (1600 egységnél 1,52 ms, a
// képkocka 31 %-a), és a rajzhívás-szám a projekt egyik számon tartott
// mérőszáma. Négy rakomány-geometria négy új `InstancedMesh` és négy új
// rajzhívás lett volna. Ezért EGYETLEN geometria van — egy hatszög-hasáb —, és
// a négy nyersanyag különbsége kizárólag PÉLDÁNYONKÉNTI adat:
//
//   ÉTEL      álló, zömök, széles, meleg barna    → kosár / puttony
//   FA        FEKVŐ, hosszú, közepesen vastag     → vállon vitt rönk
//   KŐ        álló, köpcös, szürke                → durva kőtömb
//   KRISTÁLY  álló, KESKENY és MAGAS, világító    → kristályszilánk
//
// A fekvő/álló különbség ingyen van: a `reszMatrix` amúgy is kap egy X körüli
// forgásszöget, tehát a rönköt csak vízszintesbe kell fordítani. A méret a
// példány-mátrix skálája, a szín az `instanceColor`. Összesen EGY új rajzhívás,
// és az is csak akkor megy ki, ha épp cipel valaki — üres pályán a `count`
// nulla marad, tehát a régi FPS-mérések összehasonlíthatók maradnak.
//
// ── MIÉRT HATSZÖG-HASÁB ───────────────────────────────────────────────────
// Mert MIND A NÉGY szerepet elhiteti, és mindössze 24 háromszög. A henger
// oldalról fekve rönk, állva zömöken puttony, keskenyen szilánk; a hat oldal
// lapos árnyalással elég szögletes ahhoz, hogy kőtömbnek is elmenjen. Egy
// gömb ehhez sima, egy kocka pedig fekve nem lenne rönk.

import * as THREE from 'three';
import { osszevon } from './egyseg_figurak.js';

const FEL_PI = Math.PI * 0.5;

/**
 * A rakomány ízülete a TEST lokális terében: a mellkas ELŐTT, a két előrenyújtott
 * kéz magasságában. (A váll `VALL_Y = 0,735`, a kéz onnan ~0,30-cal lejjebb.)
 */
export const RAK_Y = 0.475, RAK_Z = 0.235;

/**
 * Nyersanyagonkénti megjelenés, a `NYERS` sorrendjében:
 * `ETEL=0 FA=1 KO=2 KRISTALY=3`.
 *
 * ⚠️ MIND A NÉGY TÁBLA PONTOSAN NÉGY HOSSZÚ. Ez ugyanaz a csapda, amiből ebben
 * a projektben már öt volt (`LATOTAV`, `FIGURA`, `TIPUS_KEVER`, `MUNKA_MOZ`):
 * egy rövid tábla `undefined`-ot ad, abból `NaN` skála lesz, a `NaN` mátrixtól
 * pedig a példány NÉMÁN eltűnik — a kristályt cipelő paraszt üres kézzel
 * sétálna, és semmi nem szólna érte. A `_ellenoriz()` a fájl végén leméri.
 */
/** Fél-szélesség, fél-magasság, fél-mélység szorzó (a geometria egység-méretű). */
export const RAK_SX = [0.135, 0.062, 0.115, 0.070];
export const RAK_SY = [0.150, 0.360, 0.130, 0.185];
/** Fekszik-e (rad, X körül). A rönk vízszintes, a többi álló. */
export const RAK_DOL = [0, FEL_PI, 0, 0];
/** Alapszín. A kristály szándékosan túlvilágos: az `instanceColor` szoroz. */
export const RAK_SZIN = [0xb98a4a, 0x7d5a35, 0x8f9298, 0x9fe8ff];
/** Fényerő-szorzó — a kristály világítson ki a kézből. */
export const RAK_FENY = [1.00, 1.00, 1.00, 1.34];

/**
 * A rakomány-geometria. Origó a KÖZEPE, alapmérete 1 × 1 × 1 köré esik, hogy a
 * fenti szorzók közvetlenül világegységet adjanak. ~24 háromszög.
 *
 * Két sávból áll: a hasáb és egy vékonyabb „abroncs" a közepén. Az abroncs a
 * puttony kávája, a rönk kérge és a kőtömb repedése egyszerre — egyetlen sáv,
 * ami mind a négy értelmezést segíti, és nyolc háromszögbe kerül.
 */
export function epitRakomany() {
  const torzs = new THREE.CylinderGeometry(1.0, 0.94, 2.0, 6, 1, false);
  const abroncs = new THREE.CylinderGeometry(1.06, 1.06, 0.34, 6, 1, true);
  return osszevon([
    { g: torzs, k: [1.00, 1.00, 1.00] },
    { g: abroncs, k: [0.68, 0.64, 0.60] },
  ]);
}

// ── ÖNELLENŐRZÉS (BETÖLTÉSKOR) ─────────────────────────────────────────────

function _ellenoriz() {
  const bajok = [];
  const tablak = { RAK_SX, RAK_SY, RAK_DOL, RAK_SZIN, RAK_FENY };
  for (const nev in tablak) {
    const t = tablak[nev];
    if (t.length !== 4) bajok.push(nev + ' hossza ' + t.length + ', a NYERS négy fajtát ad');
    for (let i = 0; i < t.length; i++) {
      if (typeof t[i] !== 'number' || !isFinite(t[i])) bajok.push(nev + '[' + i + '] nem szám');
    }
  }
  if (bajok.length) {
    throw new Error('[egyseg_rakomany] hibás rakomány-tábla:\n  ' + bajok.join('\n  '));
  }
}
_ellenoriz();
