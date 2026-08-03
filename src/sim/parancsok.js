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
//   { fajta:'gyujt',        egysegek:[…], x, y, nyers? }     ← v0.3
//   { fajta:'epit',         csapat, tipus, x, y }            ← v0.3
//   { fajta:'korszak',      csapat }                         ← v0.3
//   { fajta:'kapu',         csapat, epulet, nyit }           ← v0.4
//   { fajta:'beszallas',    egysegek:[…], epulet }           ← v0.4
//   { fajta:'kiszallas',    csapat, epulet }                 ← v0.4
//   { fajta:'kepzes',       csapat, epulet, egyseg }         ← v0.5
//   { fajta:'csere',        csapat, ad, kap, mennyiseg }     ← v0.5 (piac kell hozzá)
//   { fajta:'kutatas',      csapat, tech, epulet }           ← v0.5/4
//
// ⚠️ A `fajta` a PARANCS típusa. A gyűjtésnél a nyersanyagot ezért `nyers`-nek
// hívjuk, nem `fajta`-nak — a névütközésből `'gyujt' | 0 === 0` lenne, vagyis
// minden gyűjtés csendben étel-gyűjtéssé válna.
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
import { ALLAPOT, TIPUS } from './units.js';
import { ALAKZAT } from './alakzat.js';
import { PARANCS, ALLAS } from './parancsallapot.js';
import { EP_AR, EP_MERET, EPULET } from './epuletek.js';

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
    case 'gyujt': return gyujt(sim, p);
    case 'epit': return epit(sim, p);
    case 'korszak': return korszak(sim, p);
    case 'kapu': return kapu(sim, p);
    case 'beszallas': return beszallas(sim, p);
    case 'kiszallas': return kiszallas(sim, p);
    case 'kepzes': return kepzes(sim, p);
    case 'csere': return csere(sim, p);
    case 'kutatas': return kutatas(sim, p);
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

  // ── A célcella járhatósága ──────────────────────────────────────────
  // ⚠️ v0.4: HA NEM JÁRHATÓ, A LEGKÖZELEBBI JÁRHATÓ PONTRA MEGYÜNK, nem dobjuk
  // el a parancsot. Az eldobás a v0.1-ben helyes volt (vízbe kattintás), de a
  // v0.4-ben MEGBUKOTT: az ellenséges épület közepe definíció szerint zárt
  // cella, tehát „támadd meg azt a központot" némán elveszett — mérve nulla
  // egység indult el egy 1200 életerejű célpont felé, és a hiba semmilyen
  // visszajelzést nem adott. A partra sétálás rosszabb esetben is értelmesebb,
  // mint a néma semmittevés.
  let cx0 = p.x, cy0 = p.y;
  let ci = sim.racs.idx(cx0 | 0, cy0 | 0);
  if (ci < 0 || sim.racs.jarhato[ci] === 0) {
    const kozel = sim._jarhatoKozel(p.x, p.y);
    cx0 = kozel.x; cy0 = kozel.y;
    ci = sim.racs.idx(cx0 | 0, cy0 | 0);
    if (ci < 0 || sim.racs.jarhato[ci] === 0) return;
  }
  const mezoId = sim.mezoTar.kerj(ci, sim.tick);

  // ── Menetirány: a csoport SÚLYPONTJÁBÓL a célpont felé ──────────────
  // Ez adja az alakzat tájolását. Az összegzés növekvő index szerint fut,
  // tehát az összeadás sorrendje — és így a lebegőpontos eredmény — rögzített.
  let sx = 0, sy = 0;
  for (let k = 0; k < db; k++) { sx += e.px[idk[k]]; sy += e.py[idk[k]]; }
  const kx = cx0 - sx / db, ky = cy0 - sy / db;
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
    let cx = cx0 + asz.helyX[h];
    let cy = cy0 + asz.helyY[h];
    // Ha az alakzat-hely falba vagy vízbe esne, az egység a NYERS célpontra
    // megy. Inkább tömörödjön a csoport, mint hogy valaki elérhetetlen helyre
    // induljon és örökre „úton" maradjon.
    if (!sim.racs.jarhatoPont(cx, cy)) { cx = cx0; cy = cy0; }

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
    // v0.3: a menetparancs FELMOND. Ha egy gyűjtő munkást elküldünk valahova,
    // az ne menjen vissza magától a bányához a következő tickben — a játékos
    // parancsa erősebb, mint a munkás-AI köre.
    sim.munkasok.elenged(i);
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
    sim.munkasok.elenged(i);
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

// ════════════════════════════════════════════════════════════════════════════
// v0.3 — GAZDASÁG
// ════════════════════════════════════════════════════════════════════════════

/**
 * GYŰJTÉS. A kijelölt munkások nekiállnak a kattintott lelőhelynek.
 *
 * ── A KÉT DOLOG, AMIT ITT JÓL KELL CSINÁLNI ──────────────────────────────
 * 1. **EGY áramlási mező az egész csoportnak.** Ugyanaz a szabály, mint a
 *    menetnél: a mezőt a kattintás körüli JÁRHATÓ cellára kérjük, és mindenki
 *    azt kapja. A saját lelőhelye csak a végpontja. Munkásonként külön mező a
 *    v0.1-es 40 ms-os tick visszatérése lenne.
 * 2. **Szétosztás a fürtön.** Nem mindenki a legközelebbi fát kapja, hanem
 *    körbeosztjuk a közeli lelőhelyeket — különben egy cellára tolonganának.
 *
 * A nem-munkás egységeket csendben kihagyjuk: a `gyujt` rájuk értelmetlen, és
 * egy hibaüzenetnek a sim nem a helye.
 *
 * @param {{egysegek:number[], x:number, y:number, fajta?:number}} p
 */
function gyujt(sim, p) {
  const e = sim.egysegek;
  const ef = sim.eroforrasok;
  const idk = p.egysegek;
  if (!idk || idk.length === 0) return;

  // Melyik nyersanyagot gyűjtjük? Ha a parancs nem mondja meg, a kattintott
  // lelőhelyből következik — ez az, amit a játékos csinál egérrel.
  //
  // ⚠️ A mező neve `nyers`, NEM `fajta`. A `fajta` a PARANCS típusa ('gyujt'),
  // és ha a nyersanyagot is annak hívnánk, a `p.fajta | 0` a 'gyujt' stringből
  // csendben 0-t (étel) csinálna — minden gyűjtés étel lenne, hibaüzenet nélkül.
  let nyers = p.nyers === undefined ? -1 : (p.nyers | 0);
  if (nyers < 0) {
    const alatta = ef.keres(-1, p.x, p.y, 6);
    if (alatta < 0) return;
    nyers = ef.fajta[alatta];
  }

  const jeloltek = sim._gyujtJeloltek || (sim._gyujtJeloltek = []);
  jeloltek.length = 0;
  ef.kornyek(nyers, p.x, p.y, jeloltek);
  if (jeloltek.length === 0) return;

  // A CSOPORT közös mezője: a kattintás körüli járható cellára. A lelőhely
  // maga gyakran járhatatlan (erdő, kő, kristály), abból nem lehet mezőt kérni.
  const kozel = sim._jarhatoKozel(p.x, p.y);
  const ci = sim.racs.idx(kozel.x | 0, kozel.y | 0);
  const mezoId = (ci >= 0 && sim.racs.jarhato[ci] === 1) ? sim.mezoTar.kerj(ci, sim.tick) : -1;

  let n = 0;
  for (let k = 0; k < idk.length; k++) {
    const i = idk[k];
    if (i >= e.db || e.tipus[i] !== TIPUS.MUNKAS) continue;
    // Körbeosztás: a k-adik munkás a k-adik lelőhelyet kapja, körbefordulva.
    sim.munkasok.megbiz(i, jeloltek[n % jeloltek.length], mezoId);
    // A gyűjtés a parancs-réteg szempontjából „nincs parancs": a munkás-AI
    // vezeti, nem a menet-logika. Így a `_parancsFolytat` nem rángatja vissza.
    sim.parancsAllapot.parancs[i] = PARANCS.NINCS;
    sim.parancsAllapot.celEgyseg[i] = -1;
    n++;
  }
}

/**
 * ÉPÍTÉS. Az árat AZONNAL levonjuk, az épület viszont idővel készül el.
 *
 * A `x, y` az épület KÖZEPE (oda kattint a játékos); a bal-felső cellát ebből
 * számoljuk. Ha a hely foglalt vagy nem telik, a parancs csendben elvész — a
 * visszajelzés a kliens dolga, a simé az, hogy soha ne kerüljön félkész
 * állapotba (levont ár épület nélkül).
 *
 * @param {{csapat:number, tipus:number, x:number, y:number}} p
 */
function epit(sim, p) {
  const tipus = p.tipus | 0;
  if (tipus < 0 || tipus >= EP_AR.length) return;
  const csapat = p.csapat | 0;
  const m = EP_MERET[tipus];
  const bx = (p.x | 0) - (m >> 1);
  const by = (p.y | 0) - (m >> 1);
  if (!sim.epuletek.lerakhato(tipus, bx, by)) return;
  // ⚠️ ELŐBB a hely, UTÁNA a pénz. Fordított sorrendben egy foglalt helyre
  // adott parancs levonná az árat, és nem adna érte semmit.
  if (!sim.gazdasag.levon(csapat, EP_AR[tipus])) return;
  const i = sim.epuletek.lerak(tipus, bx, by, csapat, false);
  if (i < 0) {
    // Nem sikerült (betelt a tömb) — az árat visszaadjuk, hogy a gazdaság
    // egyirányúsága ne sérüljön a másik irányba sem.
    const ar = EP_AR[tipus];
    for (let f = 0; f < 4; f++) sim.gazdasag.keszlet[csapat * 4 + f] += ar[f];
  }
}

/**
 * KAPU nyitása/zárása. A kapu a saját csapatáé kell legyen — különben egy
 * ellenséges kapu kinyitása ingyenes áttörés lenne.
 * @param {{csapat:number, epulet:number, nyit:boolean}} p
 */
function kapu(sim, p) {
  const i = p.epulet | 0;
  if (!sim.epuletek.el(i)) return;
  if (sim.epuletek.csapat[i] !== (p.csapat | 0)) return;
  sim.epuletek.kapu(i, !!p.nyit);
}

/**
 * BESZÁLLÁSOLÁS. Az egységek elindulnak a saját épületük felé, és amint
 * odaérnek, belépnek. A parancs NEM azonnali: az odajutás a lényeg — a
 * beszállásolás jellemzően menekülés, és annak van ideje.
 * @param {{egysegek:number[], epulet:number}} p
 */
function beszallas(sim, p) {
  const ep = p.epulet | 0;
  if (!sim.epuletek.kesz(ep)) return;
  const e = sim.egysegek;
  const pa = sim.parancsAllapot;
  const idk = p.egysegek;
  for (let k = 0; k < idk.length; k++) {
    const i = idk[k];
    if (i >= e.db) continue;
    if (sim.epuletek.csapat[ep] !== e.csapat[i]) continue;
    if (sim.beszallas.bent[i] === 1) continue;
    pa.parancs[i] = PARANCS.BESZALLAS;
    pa.celEpulet[i] = ep;
    pa.celEgyseg[i] = -1;
    sim.munkasok.elenged(i);
  }
}

/** KISZÁLLÁS: mindenki ki egy saját épületből, körbeosztott állóhelyekre. */
function kiszallas(sim, p) {
  const ep = p.epulet | 0;
  if (!sim.epuletek.el(ep)) return;
  if (sim.epuletek.csapat[ep] !== (p.csapat | 0)) return;
  sim.beszallas.mindKi(ep);
}

/**
 * EGYSÉG-KÉPZÉS sorba állítása. A `Kepzes` dönt mindenről: képezheti-e az
 * épület, van-e hely a sorban, van-e népesség-férőhely, és telik-e rá.
 * @param {{csapat:number, epulet:number, egyseg:number}} p
 */
function kepzes(sim, p) {
  const ep = p.epulet | 0;
  if (!sim.epuletek.kesz(ep)) return;
  if (sim.epuletek.csapat[ep] !== (p.csapat | 0)) return;
  sim.kepzes.sorba(ep, p.egyseg | 0);
}

/**
 * PIACI CSERE. Kell hozzá egy KÉSZ piac — enélkül a parancs elvész.
 * @param {{csapat:number, ad:number, kap:number, mennyiseg:number}} p
 */
function csere(sim, p) {
  const cs = p.csapat | 0;
  let vanPiac = false;
  for (let i = 0; i < sim.epuletek.db; i++) {
    if (sim.epuletek.csapat[i] === cs && sim.epuletek.kesz(i)
      && sim.epuletek.tipus[i] === EPULET.PIAC) { vanPiac = true; break; }
  }
  if (!vanPiac) return;
  sim.gazdasag.csere(cs, p.ad | 0, p.kap | 0, p.mennyiseg | 0);
}

/**
 * TECHNOLÓGIA KUTATÁSA. A `Technologia` dönt mindenről: jó épület-e, elérte-e
 * a korszakot, nincs-e már kész, és telik-e rá. Itt szándékosan NINCS előzetes
 * szűrés — egy helyen legyen a szabály, különben a két ellenőrzés elcsúszik.
 * @param {{csapat:number, tech:number, epulet:number}} p
 */
function kutatas(sim, p) {
  sim.technologia.indit(p.csapat | 0, p.tech | 0, p.epulet | 0);
}

/** KORSZAKVÁLTÁS indítása. A `Gazdasag` dönt arról, hogy telik-e. */
function korszak(sim, p) {
  sim.gazdasag.korszakIndit(p.csapat | 0);
}
