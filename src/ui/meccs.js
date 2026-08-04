// AGE OF THE CRYSTALS — MECCS-INDÍTÁS (v0.11/3): konfig → kész `Sim`.
//
// ── MIÉRT VAN EZ KÜLÖN FÁJLBAN, ÉS MIÉRT NEM A `main.js`-BEN ──────────────
// A menü SZÁNDÉKOSAN nem hoz létre `Sim`-et (lásd `menu_adat.js` fejlécét):
// konfigurációt ad, a világot a hívó építi belőle. Eddig az a „hívó" nem
// létezett — a v0.11 két rétege készen állt, de senki nem kötötte össze őket.
//
// Ha ez az összekötés a `main.js`-be kerülne, a projekt legrégebbi csapdájába
// futnánk: a `main.js` DOM-ot és `three`-t importál, tehát NODE-BAN NEM FUT, és
// így a menü→világ út egyetlen szondával sem lenne járatható. Pontosan az a rés
// nyílna meg, ahol ez a projekt már ötször megégett — zöld kapu egy halott
// rendszer mellett. Ezért a döntési rész itt van, DOM és `three` nélkül, és a
// `tools/menu_szonda.mjs` 8. vizsgálata VALÓDI világot épít vele.
//
// ── A SORREND NEM ÍZLÉS KÉRDÉSE ───────────────────────────────────────────
//   1. `civValaszt()`  — a felállás ELŐTT. A `szondaFelallas` a
//      `civValasztas`-ból állítja vissza a bónuszokat, és a kezdő központ
//      életerejére már a 0. tick előtt hatnia kell (`sim.js` ⚠️ szakasza).
//   2. `szondaFelallas()`
//   3. `ai.beallit()`  — a felállás UTÁN, mert a `szondaFelallas` NULLÁZZA az
//      AI-t (`ai.nullaz()`). Fordított sorrendben a gépi ellenfél csendben
//      kikapcsolva maradna: a meccs elindulna, az ellenfél meg állna. Ugyanaz a
//      hibafajta, mint a v0.9/2 rövid táblája — semmi nem szól érte.
//   4. betöltés — a legvégén, mert a mentés MINDENT felülír, amit fent
//      beállítottunk (a `betoltes()` a seedet, a méretet és a presetet is
//      összeveti; ezért hozza a menü a mentés fejlécéből ezt a hármat).
//
// ── ⚠️ A KEZDŐ EGYSÉGSZÁM NEM A SZONDÁÉ ───────────────────────────────────
// A `main.js` a v0.10-ig 1600 egységgel indult: az a MÉRÉSI felállás, nem
// meccs-kezdés. 1600 egység csapatonként 800 népesség, a központ viszont 10
// férőhelyet ad — ott a képzés MINDEN kérése elutasításba futna, és a játékos
// egyetlen egységet sem tudna kiképezni. A meccs ezért `KEZDO_EGYSEG`-gel
// indul, minden másodikat munkásnak állítva (ugyanaz az arány, amivel a v0.5
// determinizmus-köre fut — annál kevesebb munkásból a gazdaság nem indul be).
//
// A szonda-felállás ettől VÁLTOZATLAN marad: a `szondaKonfig()` + `SZONDA_ADAG`
// páros pontosan azt a világot építi, amit a v0.1 óta mérünk (SEED, 256×256,
// nyílt mező, 2400 egység-korlát, 1600 egység, civ nélkül, AI nélkül) — enélkül
// az FPS-lépcsők elveszítenék az összehasonlítási alapjukat.

import { Sim } from '../sim/sim.js';
import { CIV_NINCS } from '../sim/civ.js';
import { TERKEP } from '../sim/terkep.js';
import { NEHEZSEG } from '../sim/ai.js';
import { betoltesSzoveg } from '../sim/mentes.js';
import { mezoErvenyes } from './menu_adat.js';
import { SEED, PALYA_N, CEL_EGYSEG } from '../core/config.js';

/** Ennyi egységgel indul egy MECCS (a két csapat között elosztva). */
export const KEZDO_EGYSEG = 16;
/** Minden ennyiedik kezdő egység munkás (2 = a fele). */
export const KEZDO_MUNKAS_MINDEN = 2;

/** A meccs-indítás adagolása: hány egység, milyen arányban, gépi ellenféllel. */
export const MECCS_ADAG = {
  egyseg: KEZDO_EGYSEG,
  munkasMinden: KEZDO_MUNKAS_MINDEN,
  gepiEllenfel: true,
};

/**
 * A SZONDA adagolása — a v0.1 mérési felállása, bitre.
 * `munkasMinden` NINCS megadva: a `szondaFelallas` alapértéke (4) az, amivel a
 * v0.1 óta mérünk, és egy másik arány a render-mixet is átrendezné.
 */
export const SZONDA_ADAG = {
  egyseg: CEL_EGYSEG,
  gepiEllenfel: false,
};

/**
 * A szonda- és alapértelmezett meccs-konfig — ugyanabban az alakban, ahogy a
 * menü adja. Függvény, nem konstans: a hívó szabadon átírhatja a kapott
 * másolatot anélkül, hogy a következő hívás sérülne.
 */
export function szondaKonfig() {
  return {
    seed: SEED,
    n: PALYA_N,
    terkep: TERKEP.NYILT_MEZO,
    civ: [CIV_NINCS, CIV_NINCS],
    nehezseg: NEHEZSEG.KOZEPES,
    maxEgyseg: 2400,
    sajatCsapat: 0,
    mentes: null,
    mentesKulcs: null,
  };
}

/**
 * A konfig ELLENŐRZÉSE — ugyanazzal a `mezoErvenyes()`-szel, amit a menü
 * használ. Nem másolt szabály: egy hetedik preset vagy egy kilencedik nép így
 * magától érvényes lesz mindkét helyen.
 *
 * ⚠️ A KI NEM VÁLASZTOTT NÉP ITT MEGENGEDETT (`CIV_NINCS`), és ez nem lazaság:
 * a szonda-felállásnak és a v0.10-ig futó bootnak SINCS civje, a `Sim` pedig
 * ezt szabályosan kezeli (nincs bónusz). A választás KÖTELEZŐSÉGE a menü
 * új-játék ágának szabálya, nem a világ felépítéséé.
 *
 * @param {object} konfig
 * @returns {{mezo:string, hiba:string}[]} üres tömb, ha rendben
 */
export function meccsHibak(konfig) {
  if (!konfig || typeof konfig !== 'object') {
    return [{ mezo: 'konfig', hiba: 'nincs meccs-konfig' }];
  }
  const h = [];
  for (const mezo of ['seed', 'n', 'terkep', 'nehezseg', 'maxEgyseg', 'sajatCsapat']) {
    const e = mezoErvenyes(mezo, konfig[mezo]);
    if (!e.ok) h.push({ mezo, hiba: e.hiba });
  }
  const civ = konfig.civ;
  if (!Array.isArray(civ) || civ.length < 2) {
    h.push({ mezo: 'civ', hiba: 'a konfigban nincs két elemű `civ` tömb' });
  } else {
    for (let cs = 0; cs < 2; cs++) {
      if (civ[cs] === CIV_NINCS) continue;
      const e = mezoErvenyes('civ' + cs, civ[cs]);
      if (!e.ok) h.push({ mezo: 'civ' + cs, hiba: e.hiba });
    }
  }
  return h;
}

/**
 * KÉSZ VILÁG A KONFIGBÓL.
 *
 * @param {object} konfig a menü `meccsKonfig()`-ja (vagy `szondaKonfig()`)
 * @param {{egyseg?:number, munkasMinden?:number, gepiEllenfel?:boolean}} [adag]
 * @returns {{ok:true, sim:Sim, egyseg:number, gepiCsapat:number, betoltve:boolean}
 *          |{ok:false, hibak:{mezo:string,hiba:string}[]}}
 */
export function meccsSim(konfig, adag = MECCS_ADAG) {
  const hibak = meccsHibak(konfig);
  if (hibak.length) return { ok: false, hibak };

  const sim = new Sim({
    seed: konfig.seed,
    n: konfig.n,
    maxEgyseg: konfig.maxEgyseg,
    terkep: konfig.terkep,
  });

  // 1. CIV — a felállás ELŐTT (lásd a fejlécet).
  for (let cs = 0; cs < 2; cs++) {
    if (konfig.civ[cs] === CIV_NINCS) continue;
    sim.civValaszt(cs, konfig.civ[cs]);
  }

  // 2. FELÁLLÁS.
  const felallas = adag.munkasMinden ? { munkasMinden: adag.munkasMinden } : undefined;
  const egyseg = sim.szondaFelallas(adag.egyseg ?? KEZDO_EGYSEG, felallas);

  // 3. GÉPI ELLENFÉL — a felállás UTÁN, mert az nullázza az AI-t.
  const gepiCsapat = konfig.sajatCsapat === 0 ? 1 : 0;
  if (adag.gepiEllenfel) sim.ai.beallit(gepiCsapat, konfig.nehezseg);

  // 4. BETÖLTÉS — a legvégén, mert mindent felülír.
  let betoltve = false;
  if (konfig.mentes) {
    const e = betoltesSzoveg(sim, konfig.mentes);
    if (!e.ok) return { ok: false, hibak: [{ mezo: 'mentes', hiba: e.hiba }] };
    betoltve = true;
  }

  return {
    ok: true,
    sim,
    egyseg,
    gepiCsapat: adag.gepiEllenfel ? gepiCsapat : -1,
    betoltve,
  };
}
