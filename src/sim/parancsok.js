// AGE OF THE CRYSTALS — A PARANCSOK VÉGREHAJTÁSA.
//
// ── MIÉRT ITT, ÉS NEM A `sim.js`-BEN ──────────────────────────────────────
// A v0.1-ben egyetlen parancs volt (`menet`), és elfért a `Sim._vegrehajt`
// törzsében. A v0.2 hatot hoz, a v0.3 gazdasága továbbiakat, és ha mind egy
// `if`-láncba nőne a sim magjában, az a fájl néhány verzió alatt olvashatatlan
// lenne. A `Sim` így annyit tud, hogy VAN egy parancs-sor és van egy
// végrehajtó; hogy mit jelent egy parancs, az ide tartozik.
//
// ── A SZERZŐDÉS ───────────────────────────────────────────────────────────
// Minden parancs egy sima adat-objektum `fajta` mezővel, és MINDEN parancs a
// soron keresztül érkezik (`sim.parancs(...)`), sosem közvetlen hívásként. Ez
// nem formaság: a v0.8-ban ugyanez a sor jön majd a hálózatról, és ami nem
// ment át a soron, az ott azonnal desync lenne.
//
//   { fajta:'menet',        egysegek:[…], x, y, alakzat? }
//   { fajta:'tamado_menet', egysegek:[…], x, y, alakzat? }
//   { fajta:'allj',         egysegek:[…] }
//   { fajta:'tartas',       egysegek:[…] }
//   { fajta:'allas',        egysegek:[…], allas }
//   { fajta:'alakzat',      egysegek:[…], alakzat }
//
// Az `egysegek` INDEX-tömb. Hogy ki van kijelölve, az a kliens dolga (lásd
// `src/ui/kijeloles.js`) — a sim csak indexeket lát, és sosem tudja meg, hogy
// volt-e egérhúzás. Ettől marad a sim node-ban futtatható.
//
// ── AMI A LEGKÖNNYEBBEN ELROMLIK ──────────────────────────────────────────
// EGY áramlási mező jár a CSOPORTNAK, nem egységenként egy. Ez a v0.1 legdrágább
// tanulsága volt (40,1 → 1,15 ms/tick), és a determinizmus-szonda 4. vizsgálata
// azóta is őrzi. Az alakzat CSAK a végpontot tolja el — az odáig vezető utat
// mindenki ugyanabból a közös mezőből olvassa.

import { fxAtan2 } from './fx.js';
import { ALLAPOT } from './units.js';
import { ALAKZAT } from './alakzat.js';
import { PARANCS, ALLAS } from './parancsallapot.js';

/**
 * Egy parancs végrehajtása. A `Sim._vegrehajt` delegál ide.
 * @param {import('./sim.js').Sim} sim
 * @param {{fajta:string, [k:string]:any}} p
 */
export function vegrehajt(sim, p) {
  switch (p.fajta) {
    case 'menet': return menet(sim, p, false);
    case 'tamado_menet': return menet(sim, p, true);
    case 'allj': return allj(sim, p);
    case 'tartas': return tartas(sim, p);
    case 'allas': return allasBeallit(sim, p);
    case 'alakzat': return alakzatBeallit(sim, p);
    default: return;   // ismeretlen parancs: csendben eldobjuk, nem dobunk hibát
  }
}

/**
 * Menet vagy támadó menet. A kettő MOZGÁSBAN azonos — a különbség csak az,
 * hogy útközben keres-e ellenséget (`PARANCS.TAMADO_MENET`), amit a
 * `ParancsAllapot.lep()` értékel ki tickenként.
 *
 * @param {import('./sim.js').Sim} sim
 * @param {{egysegek:number[], x:number, y:number, alakzat?:number}} p
 * @param {boolean} tamado
 */
function menet(sim, p, tamado) {
  const e = sim.egysegek;
  const pa = sim.parancsAllapot;
  const idk = p.egysegek;
  const db = idk.length;
  if (db === 0) return;

  // A célcella járhatóságát ITT ellenőrizzük, nem egységenként: ha a
  // kattintás vízbe vagy sziklára esett, az egész parancs értelmetlen.
  const ci = sim.racs.idx(p.x | 0, p.y | 0);
  if (ci < 0 || sim.racs.jarhato[ci] === 0) return;
  const mezoId = sim.mezoTar.kerj(ci, sim.tick);

  // ── Menetirány: a csoport SÚLYPONTJÁBÓL a célpont felé ──────────────
  // Ez adja az alakzat tájolását. Az összegzés növekvő index szerint fut,
  // tehát az összeadás sorrendje — és így a lebegőpontos eredmény — rögzített.
  let sx = 0, sy = 0;
  for (let k = 0; k < db; k++) { sx += e.px[idk[k]]; sy += e.py[idk[k]]; }
  const kx = p.x - sx / db, ky = p.y - sy / db;
  // Ha a csoport már a célon áll, nincs értelmes irány — a 0 szög (kelet felé)
  // determinisztikus megegyezés, nem véletlen választás.
  const szog = (kx === 0 && ky === 0) ? 0 : fxAtan2(ky, kx);

  // ── Alakzat ─────────────────────────────────────────────────────────
  // A parancs felülírhatja, különben a csoport ELSŐ egységének beállítása
  // dönt (a kijelölésnek a kliens oldalon egységes az alakzata).
  const fajta = p.alakzat === undefined ? pa.alakzat[idk[0]] : (p.alakzat | 0);
  const asz = sim.alakzatSzamolo;
  asz.helyek(fajta, db, szog);
  asz.hozzarendel(db, szog, idk, e.px, e.py);

  const ujParancs = tamado ? PARANCS.TAMADO_MENET : PARANCS.MENET;
  for (let h = 0; h < db; h++) {
    const i = idk[asz.parositas[h]];
    let cx = p.x + asz.helyX[h];
    let cy = p.y + asz.helyY[h];
    // Ha az alakzat-hely falba vagy vízbe esne, az egység a NYERS célpontra
    // megy. Inkább tömörödjön a csoport, mint hogy valaki elérhetetlen helyre
    // induljon és örökre „úton" maradjon.
    if (!sim.racs.jarhatoPont(cx, cy)) { cx = p.x; cy = p.y; }

    e.menetparancs(i, cx, cy, mezoId);
    pa.parancs[i] = ujParancs;
    pa.alakzat[i] = fajta;
    // A parancs VALÓDI végpontja — az üldözés ezt nem írhatja felül.
    pa.vegX[i] = cx;
    pa.vegY[i] = cy;
    pa.vegMezo[i] = mezoId;
    // Az őrhely a MEGCÉLZOTT hely, nem a mostani pozíció: a védekező állás
    // oda tér vissza, ahova a játékos küldte, nem oda, ahonnan elindult.
    pa.horgonyX[i] = cx;
    pa.horgonyY[i] = cy;
    pa.celEgyseg[i] = -1;
  }
}

/**
 * Megállás. Az egység elfelejti a parancsát és a célpontját, és ott marad,
 * ahol van — de az állása szerint továbbra is reagálhat, ami rá támad.
 */
function allj(sim, p) {
  const e = sim.egysegek;
  const pa = sim.parancsAllapot;
  const idk = p.egysegek;
  for (let k = 0; k < idk.length; k++) {
    const i = idk[k];
    e.allapot[i] = ALLAPOT.ALL;
    e.celX[i] = e.px[i];
    e.celY[i] = e.py[i];
    e.mezoId[i] = -1;
    e.vx[i] = 0; e.vy[i] = 0;
    pa.parancs[i] = PARANCS.NINCS;
    pa.celEgyseg[i] = -1;
    pa.vegX[i] = e.px[i];
    pa.vegY[i] = e.py[i];
    pa.vegMezo[i] = -1;
    pa.horgonyz(i);
  }
}

/**
 * Állás-tartás: mint a megállás, de a parancs is rögzül. A különbség a
 * célkeresésben látszik — `PARANCS.TARTAS` mellett az egység nem indul
 * sehova magától, viszont az állása szerint még védekezhet.
 */
function tartas(sim, p) {
  allj(sim, p);
  const pa = sim.parancsAllapot;
  const idk = p.egysegek;
  for (let k = 0; k < idk.length; k++) pa.parancs[idk[k]] = PARANCS.TARTAS;
}

/** Állás (stance) beállítása. Nem mozgat, nem szakít félbe parancsot. */
function allasBeallit(sim, p) {
  const pa = sim.parancsAllapot;
  const idk = p.egysegek;
  let a = p.allas | 0;
  if (a < 0 || a > ALLAS.TUZSZUNET) a = ALLAS.AGRESSZIV;
  for (let k = 0; k < idk.length; k++) {
    const i = idk[k];
    pa.allas[i] = a;
    // A tűzszünet azonnal hatályos: aki épp harcérintkezésben állt, elengedi.
    if (a === ALLAS.TUZSZUNET && pa.celEgyseg[i] >= 0) {
      pa.celEgyseg[i] = -1;
      if (sim.egysegek.allapot[i] === ALLAPOT.HARCOL) {
        sim.egysegek.allapot[i] = ALLAPOT.ALL;
      }
    }
  }
}

/**
 * Alakzat beállítása. Csak a KÖVETKEZŐ menetparancsra hat — nem rendezi át a
 * sereget a helyén. Ez szándékos: az azonnali átrendezés egy csata közepén
 * kiszámíthatatlanná tenné, hogy hol lesznek az egységeink egy másodperc múlva.
 */
function alakzatBeallit(sim, p) {
  const pa = sim.parancsAllapot;
  const idk = p.egysegek;
  let a = p.alakzat | 0;
  if (a < 0 || a > ALAKZAT.SZORT) a = ALAKZAT.NEGYZET;
  for (let k = 0; k < idk.length; k++) pa.alakzat[idk[k]] = a;
}
