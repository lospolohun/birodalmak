// PORTAL HUB TYCOON — AZ UTAS-AI.
//
// ── MIÉRT ÍGY ─────────────────────────────────────────────────────────────
// Az „önálló AI-val közlekedő utas" a játék szíve, és pont ezért a
// legveszélyesebb rész: ha utasonként okos akar lenni, ezernél megfullad; ha
// buta, akkor a játékos építkezése nem érződik. A kompromisszum egy SZŰK
// állapotgép, ami minden drága kérdést kiszervez:
//
//   • „hol a legközelebbi étterem?"  → az útkereső távolságmezője válaszol
//   • „várjak-e?"                    → az épület sora dönt, nem az utas
//   • „mit akarok?"                  → egyszer, érkezéskor eldől (terv)
//
// Így egy utas tickje néhány tucat művelet, és a viselkedés mégis olvasható:
// a játékos LÁTJA, hogy a troll az étteremhez tart, sorba áll, és elfogy a
// türelme, ha nincs elég pult.
//
// ── AMI NEM ITT VAN ───────────────────────────────────────────────────────
// Az épületek kiszolgálási ciklusa (sorból beenged, fizettet) a `sim.js`-ben
// fut, mert az EGY épületre nézve hatékony, nem utasonként. Ha az utas
// húzná magát be a sorból, N utas × M épület összehasonlítás lenne belőle.

import { ALAP_TURELEM, SOR_HANGULAT_KOPAS, SETA_HANGULAT_KOPAS, ALAP_SEBESSEG } from '../mag/config.js';
import { FAJOK } from './lenyek.js';
import { DIMENZIOK } from './dimenziok.js';
import { sulyozott } from '../mag/rng.js';
import { DX, DY, IRANY_FEL, IRANY_LE } from './utkereses.js';
import { EPULETEK } from './epuletek.js';

export const ALLAPOT = {
  ERKEZIK: 0,     // most lép ki a kapuból, még nem irányítható
  DONT: 1,        // következő igény kiválasztása
  MEGY: 2,        // úton a cél felé
  SORBAN: 3,      // beállt a peronra, vár a bejutásra
  KISZOLGALAS: 4, // bent van (a render nem rajzolja)
  INDUL: 5,       // az induló kapu felé tart
  KILEP: 6,       // elhagyta az állomást (a slot felszabadítható)
};

export const ALLAPOT_NEV = ['érkezik', 'dönt', 'megy', 'sorban áll', 'kiszolgálás', 'indul', 'kilép'];

/** Üres utas-rekord. A tömb előre feltöltődik ezekkel — futás közben nincs allokáció. */
export function ujUtas() {
  return {
    aktiv: false,
    azon: -1,
    fajIdx: 0,
    dimIdx: 0,      // honnan jött
    celDimIdx: 0,   // hová megy tovább
    x: 0, y: 0,
    /** Melyik szinten van. Ez a világ állapota, nem nézeti beállítás. */
    z: 0,
    /** Az aktuális lépés célcellájának közepe. */
    lx: 0, ly: 0,
    /**
     * Szintváltás közben: hány tick van hátra, és melyik szintre tart.
     * Az átjáró IDŐBE kerül — ez az, ami a mozgólépcsőt lassabbá teszi a
     * liftnél, és ami miatt egy rosszul elhelyezett lépcső valódi torlódás.
     */
    valtasHatra: 0,
    valtasCel: 0,
    /** A szintváltás teljes hossza — a render ebből számol arányt. */
    valtasTeljes: 1,
    allapot: ALLAPOT.ERKEZIK,
    ora: 0,          // az állapotban eltöltött tick
    terv: [],        // igénykódok sorban
    tervIdx: 0,
    celEpulet: -1,
    hangulat: 1000,  // ezred (1000 = tökéletes)
    turelem: 0,
    penz: 0,
    koltott: 0,
    /** Hány igényét nem tudta kielégíteni — a statisztika ezt panaszkodja el. */
    csalodas: 0,
    /** Igaz, ha már nem sikerülhet semmi és csak kifelé tart. */
    duhos: false,
    /** Melyik tickben ér véget a kiszolgálása (KISZOLGALAS állapotban). */
    szolgalatVeg: 0,
  };
}

/**
 * Egy frissen érkező utas felöltöztetése.
 * @param {object} sim
 * @param {object} u
 * @param {number} dimIdx honnan érkezik
 * @param {number} px,py belépési pont (a kapu peronja)
 */
export function utastIndit(sim, u, dimIdx, px, py, pz = 0, fajIdxKenyszer = -1) {
  const dim = DIMENZIOK[dimIdx];
  const dall = sim.dimenziok[dimIdx];
  let fi = fajIdxKenyszer;
  if (fi < 0) {
    const valasztas = sulyozott(sim.rnd, dim.fajok, 'suly');
    fi = sim.fajIndexKod(valasztas.kod);
  }
  const faj = FAJOK[fi];

  u.aktiv = true;
  u.fajIdx = fi;
  u.dimIdx = dimIdx;
  u.x = px; u.y = py; u.z = pz | 0;
  u.lx = px; u.ly = py;
  u.valtasHatra = 0; u.valtasCel = u.z;
  u.allapot = ALLAPOT.ERKEZIK;
  u.ora = 0;
  u.tervIdx = 0;
  u.celEpulet = -1;
  u.hangulat = 1000;
  u.csalodas = 0;
  u.duhos = false;
  u.koltott = 0;
  u.turelem = Math.round(ALAP_TURELEM * faj.turelem * (0.8 + sim.rnd() * 0.4));
  // A szint gazdagabb utasokat is hoz: a fejlesztett kapun a világ jobb módú
  // fele is átjön. Enélkül a szintlépés csak darabszámot adna, és a
  // „fejlesszek vagy nyissak újat?" döntés mindig ugyanaz lenne.
  const szintSzorzo = 1 + (dall.szint - 1) * 0.22;
  // Ünnep a kiinduló világban: jobb kedv és nagyobb pénztárca. Ez az egyetlen
  // esemény, ami az UTAS oldaláról hat — a többi az állomásra.
  const unnep = sim.unnepDim === dimIdx;
  u.penz = Math.round((faj.penz + (sim.rnd() * 2 - 1) * faj.szoras) * szintSzorzo * (unnep ? 1.5 : 1));
  if (u.penz < 10) u.penz = 10;
  if (unnep) u.turelem = Math.round(u.turelem * 1.25);

  tervetKeszit(sim, u, faj, dim);

  // A továbbutazás célja: egy másik nyitott dimenzió, ha van.
  u.celDimIdx = sim.veletlenNyitottDimenzio(dimIdx);
  return u;
}

/**
 * Az igényterv összeállítása. Sorrend: kötelező hatósági lépések, majd a
 * fajspecifikus kényszerek, végül a sorsolt kívánságok.
 *
 * MIÉRT FIX A SORREND ELEJE: mert a biztonsági ellenőrzés és a vám a történet
 * szerint is kapuőr — ha az utas előbb ehetne, a játékos kihagyhatná őket, és
 * a két legkorábbi épület értelmét vesztené.
 */
export function tervetKeszit(sim, u, faj, dim) {
  const t = u.terv;
  t.length = 0;
  t.push('biztonsag');
  if (dim.vamKoteles) t.push('vam');
  for (let i = 0; i < faj.mindig.length; i++) t.push(faj.mindig[i]);
  // 1-3 sorsolt kívánság. A duplikátumot kiszűrjük: kétszer egymás után
  // ugyanabba a boltba menni komikus, de a játékos tervezését zavarja.
  const db = 1 + Math.floor(sim.rnd() * 3);
  for (let i = 0; i < db; i++) {
    const v = sulyozott(sim.rnd, faj.igenyek, 'suly');
    if (!v) break;
    let van = false;
    for (let j = 0; j < t.length; j++) if (t[j] === v.kod) { van = true; break; }
    if (!van) t.push(v.kod);
  }
  // A poggyász mindenkinek jár, ha van hol feladni — apró, de folyamatos
  // bevétel, és vizuálisan is ez köti össze az érkezést az indulással.
  if (sim.rnd() < 0.45) {
    let van = false;
    for (let j = 0; j < t.length; j++) if (t[j] === 'poggyasz') { van = true; break; }
    if (!van) t.push('poggyasz');
  }
}

/**
 * Egy utas egy tickje.
 * @param {object} sim
 * @param {object} u
 */
export function utasLep(sim, u) {
  const faj = FAJOK[u.fajIdx];
  u.ora++;

  // ── TÜRELEM ─────────────────────────────────────────────────────────────
  // A türelem akkor is fogy, ha minden rendben megy — csak lassabban. Ez
  // adja a játék belső óráját: egy nagy, üres csarnokon átsétálni is kerül
  // valamennyibe, tehát a KOMPAKT állomás jobb, mint a nagy.
  if (u.allapot !== ALLAPOT.KISZOLGALAS) u.turelem--;

  const kornyezet = kornyezetHatas(sim, u, faj);

  // ── SZINTVÁLTÁS ─────────────────────────────────────────────────────────
  // Amíg az átjárón van, nem lép és nem dönt — csak fogy az ideje és a
  // hangulata. Ez a „várakozás mozgás közben", ami egy állomáson a
  // legidegesítőbb, és pont ezért kell, hogy a játékos érezze a lépcső árát.
  if (u.valtasHatra > 0) {
    u.valtasHatra--;
    hangulatValt(u, -(SOR_HANGULAT_KOPAS * 0.5 + kornyezet));
    if (u.valtasHatra === 0) {
      u.z = u.valtasCel;
      u.lx = Math.floor(u.x) + 0.5;
      u.ly = Math.floor(u.y) + 0.5;
    }
    return;
  }

  switch (u.allapot) {
    case ALLAPOT.ERKEZIK:
      // Rövid „kilépek a kapuból" pillanat: enélkül az utasok egymás hegyén
      // pattannának ki, és a portál előtti torlódás sosem lenne látható.
      if (u.ora > 14) { u.allapot = ALLAPOT.DONT; u.ora = 0; }
      break;

    case ALLAPOT.DONT:
      dontes(sim, u);
      break;

    case ALLAPOT.MEGY:
      hangulatValt(u, -(setaKopas(faj) + kornyezet));
      megy(sim, u, faj);
      break;

    case ALLAPOT.SORBAN:
      hangulatValt(u, -(SOR_HANGULAT_KOPAS + kornyezet));
      // A sorban állást az épület oldja fel (sim.js), itt csak várunk.
      break;

    case ALLAPOT.KISZOLGALAS:
      // A kiszolgálás alatt semmi dolgunk: az épület számol.
      break;

    case ALLAPOT.INDUL:
      hangulatValt(u, -(setaKopas(faj) + kornyezet));
      megy(sim, u, faj);
      break;
  }

  // ── ELFOGYOTT A TÜRELEM ─────────────────────────────────────────────────
  // Nem tűnik el a helyszínen: dühösen KISÉTÁL. Ez fontos visszajelzés —
  // a játékos látja a kapuk felé özönlő, elégedetlen tömeget, nem csak egy
  // lefelé kúszó számot a HUD-on.
  if (u.turelem <= 0 && !u.duhos && u.allapot !== ALLAPOT.KILEP) {
    u.duhos = true;
    u.hangulat = Math.min(u.hangulat, 120);
    elhagySort(sim, u);
    indulasraKuld(sim, u);
  }
}

/**
 * Séta-kopás egy tickre. A faj sebességével arányos, tehát UGYANANNYI
 * hangulatba kerül átvágni a csarnokon a lassú trollnak és a fürge koboldnak.
 * Enélkül a lassú fajok kiszolgálhatatlanok — nem attól, hogy türelmetlenek,
 * hanem attól, hogy tovább tart nekik ugyanaz az út.
 */
function setaKopas(faj) { return SETA_HANGULAT_KOPAS * (faj.sebesseg / ALAP_SEBESSEG); }

/** A hangulat mindig 0..1000 között marad. */
function hangulatValt(u, delta) {
  u.hangulat += delta;
  if (u.hangulat > 1000) u.hangulat = 1000;
  else if (u.hangulat < 0) u.hangulat = 0;
}

/**
 * Környezeti hangulat-terhelés: kosz, áramszünet, és a faj hő-igénye.
 * @returns {number} extra kopás ezredben
 */
function kornyezetHatas(sim, u, faj) {
  let extra = sim.koszTerheles;
  if (sim.aramszunet) extra += 3;
  if (faj.hoVagy !== 0) {
    const i = sim.racs.idx(Math.floor(u.x), Math.floor(u.y), u.z);
    if (i >= 0 && i < sim.racs.ho.length) {
      const ho = sim.racs.ho[i], hideg = sim.racs.hideg[i];
      // A démon a melegtől JAVUL, a hidegtől romlik — és fordítva.
      const kedves = faj.hoVagy > 0 ? ho : hideg;
      const ellen = faj.hoVagy > 0 ? hideg : ho;
      extra += (ellen * 0.02) - (kedves * 0.012);
    }
  }
  return extra;
}

/** Kilép a sorból/kiszolgálásból, ha épp benne volt. */
export function elhagySort(sim, u) {
  if (u.celEpulet < 0) return;
  const ep = sim.epuletek[u.celEpulet];
  if (!ep) return;
  const i = ep.sor.indexOf(u.azon);
  if (i >= 0) ep.sor.splice(i, 1);
  const j = ep.bent.indexOf(u.azon);
  if (j >= 0) ep.bent.splice(j, 1);
}

/** A következő igény kiválasztása, vagy indulás. */
function dontes(sim, u) {
  u.celEpulet = -1;
  while (u.tervIdx < u.terv.length) {
    const igeny = u.terv[u.tervIdx];
    const ep = legkozelebbiEpulet(sim, u, igeny);
    if (ep) { u.celEpulet = ep.azon; u.allapot = ALLAPOT.MEGY; u.ora = 0; return; }
    // Nincs ilyen szolgáltatás (vagy nem érhető el): csalódás, és tovább.
    u.tervIdx++;
    u.csalodas++;
    hangulatValt(u, igeny === 'biztonsag' ? -260 : -110);
    sim.hianyRogzit(igeny);
  }
  indulasraKuld(sim, u);
}

/** Az induló kapu felé küldjük. */
function indulasraKuld(sim, u) {
  const p = sim.indulasiPortal(u.celDimIdx);
  if (p) { u.celEpulet = p.azon; } else { u.celEpulet = -1; }
  u.allapot = ALLAPOT.INDUL;
  u.ora = 0;
}

/**
 * A legkedvezőbb épület egy igényre. Nem a legközelebbi, hanem a
 * „legközelebbi + legrövidebb sorú": a puszta távolság az összes utast
 * ugyanabba az étterembe küldené, és a második étterem megépítése nem
 * érződne. A sorhossz beszámítása az, amitől a kapacitásbővítés MŰKÖDIK.
 */
export function legkozelebbiEpulet(sim, u, igeny) {
  const lista = sim.igenyLista.get(igeny);
  if (!lista || lista.length === 0) return null;
  const racs = sim.racs;
  const ux = Math.floor(u.x), uy = Math.floor(u.y);
  if (!racs.bent(ux, uy, u.z)) return null;
  const cella = racs.idx(ux, uy, u.z);
  let legjobb = null, legjobbErtek = 1e9;
  for (let i = 0; i < lista.length; i++) {
    const ep = sim.epuletek[lista[i]];
    if (!ep || ep.kikapcsolva) continue;
    if (ep.peron.length === 0) continue;
    let t;
    // A szellem ÁTMEGY A FALON, de nem megy át a PADLÓN: a szintváltáshoz
    // neki is átjáró kell. Ezért csak az azonos szintű célra használhatja a
    // légvonalat; máshová ugyanúgy a mezőt kell követnie, mint bárki más.
    if (FAJOK[u.fajIdx].atmegyFalon && ep.z === u.z) {
      const dx = (ep.x + ep.sz * 0.5) - u.x, dy = (ep.y + ep.m * 0.5) - u.y;
      t = Math.sqrt(dx * dx + dy * dy);
    } else {
      const mezo = sim.utkereso.mezo(ep.azon, ep.peron);
      t = mezo[cella];
      if (t < 0) continue; // nincs út — ez az épület nem is létezik neki
    }
    const ertek = t + ep.sor.length * 3.5 + ep.bent.length * 1.2;
    if (ertek < legjobbErtek) { legjobbErtek = ertek; legjobb = ep; }
  }
  return legjobb;
}

/** Mozgás a cél felé; ha odaért, sorba áll (vagy kilép). */
function megy(sim, u, faj) {
  const ep = u.celEpulet >= 0 ? sim.epuletek[u.celEpulet] : null;
  if (!ep) {
    // Eltűnt a cél (lebontották). Az induló utas ilyenkor egyszerűen
    // szertefoszlik a legközelebbi kapunál; a szolgáltatást keresőt
    // visszaküldjük dönteni.
    if (u.allapot === ALLAPOT.INDUL) { u.allapot = ALLAPOT.KILEP; return; }
    u.allapot = ALLAPOT.DONT; return;
  }

  const seb = faj.sebesseg * sim.sebessegSzorzo(u);
  if (faj.atmegyFalon && ep.z === u.z) {
    // ── SZELLEM ───────────────────────────────────────────────────────────
    // Nem a rácson jár: egyenesen a cél felé lebeg. Ettől lesz a Ködmocsár
    // megnyitása valódi játékmenet-döntés — a szellemek nem torlódnak, de
    // a folyosóépítés sem segít rajtuk.
    const cx = ep.x + ep.sz * 0.5, cy = ep.y + ep.m * 0.5;
    const dx = cx - u.x, dy = cy - u.y;
    const t = Math.sqrt(dx * dx + dy * dy);
    const kuszob = Math.max(ep.sz, ep.m) * 0.5 + 0.6;
    if (t <= kuszob) { megerkezett(sim, u, ep); return; }
    u.x += (dx / t) * seb;
    u.y += (dy / t) * seb;
    return;
  }

  const racs = sim.racs;
  const tx = Math.floor(u.x), ty = Math.floor(u.y);
  if (!racs.jarhato(tx, ty, u.z)) { kiszabadit(sim, u); return; }
  const mezo = sim.utkereso.mezo(ep.azon, ep.peron);
  const itt = mezo[racs.idx(tx, ty, u.z)];
  if (itt === 0) { megerkezett(sim, u, ep); return; }
  if (itt < 0) {
    // Elzáródott az út (a játékos épp elé épített). Nem ragadunk be: új
    // döntés, és ha semmi sem érhető el, az indulás felé megyünk.
    u.allapot = ALLAPOT.DONT;
    return;
  }

  // A cellaközép felé haladunk; ha elértük, új szomszédot választunk.
  const kozelX = tx + 0.5, kozelY = ty + 0.5;
  const dcx = u.lx - u.x, dcy = u.ly - u.y;
  if (dcx * dcx + dcy * dcy < 0.02) {
    const k = sim.utkereso.irany(mezo, tx, ty, u.z, 2);
    if (k < 0) { u.lx = kozelX; u.ly = kozelY; return; }
    if (k === IRANY_FEL || k === IRANY_LE) {
      // Rálépett az átjáróra: innen IDŐ kell a másik szintre. Az átjáró
      // épülete mondja meg, mennyi — a lift nyolc tick, a mozgólépcső negyven.
      const azon = racs.epuletAzon(tx, ty, u.z);
      const ep2 = azon >= 0 ? sim.epuletek[azon] : null;
      const ido = ep2 ? (EPULETEK[ep2.tipusIdx].atjaroIdo || 30) : 30;
      u.x = kozelX; u.y = kozelY; u.lx = kozelX; u.ly = kozelY;
      u.valtasCel = k === IRANY_FEL ? u.z + 1 : u.z - 1;
      u.valtasHatra = ido;
      u.valtasTeljes = ido;
      return;
    }
    u.lx = tx + DX[k] + 0.5;
    u.ly = ty + DY[k] + 0.5;
  }
  const dx = u.lx - u.x, dy = u.ly - u.y;
  const t = Math.sqrt(dx * dx + dy * dy);
  if (t > 1e-6) {
    const l = Math.min(seb, t);
    u.x += (dx / t) * l;
    u.y += (dy / t) * l;
  }
}

/**
 * Ha az utas alá építettek: a legközelebbi járható cellára toljuk.
 * Kilenc cellás gyűrűkben keresünk, hogy determinisztikus és olcsó legyen.
 */
function kiszabadit(sim, u) {
  const racs = sim.racs;
  const bx = Math.floor(u.x), by = Math.floor(u.y);
  for (let r = 1; r <= 6; r++) {
    for (let j = -r; j <= r; j++) {
      for (let i = -r; i <= r; i++) {
        if (Math.abs(i) !== r && Math.abs(j) !== r) continue;
        const x = bx + i, y = by + j;
        if (racs.jarhato(x, y, u.z)) {
          u.x = x + 0.5; u.y = y + 0.5;
          u.lx = u.x; u.ly = u.y;
          return;
        }
      }
    }
  }
  // Teljesen befalazva — ez már a játékos hibája, de a szimuláció nem
  // fagyhat le tőle: az utas feladja és eltűnik, hírnév-büntetéssel.
  u.hangulat = 0;
  u.allapot = ALLAPOT.KILEP;
}

/** Megérkezett a peronra. */
function megerkezett(sim, u, ep) {
  if (u.allapot === ALLAPOT.INDUL) {
    u.allapot = ALLAPOT.KILEP;
    return;
  }
  u.allapot = ALLAPOT.SORBAN;
  u.ora = 0;
  ep.sor.push(u.azon);
}
