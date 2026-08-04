// PORTAL HUB TYCOON — MESTERSÉGES JÁTÉKOSOK.
//
// ── MIÉRT VAN EZ A FÁJL ───────────────────────────────────────────────────
// Egy tycoon egyensúlyát nem lehet EGY végigjátszásból megítélni. A v0.1
// hangolása egyetlen forgatókönyv egyetlen seedjén állt — az pedig nem méri,
// amit a legfontosabb lenne tudni: hogy a JÓ döntés tényleg jobb-e a rossznál.
// Ehhez több, egymással VERSENGŐ játékos kell, akik ugyanazt a világot
// másképp játsszák meg. Ha a „nemtörődöm" is elboldogul, akkor nem játék,
// hanem képernyővédő; ha egy stratégia minden seeden nyer, akkor nincs döntés.
//
// ── MIÉRT ÁLLAPOTFÜGGŐ MINDEGYIK ──────────────────────────────────────────
// A `forgatokonyv.mjs` fejléce ezt már megtanulta a maga kárán: a fix
// tick-listás forgatókönyv olyan parancsokat ad ki, amiket a világ még nem
// enged meg, azok elutasításba futnak, és a mérés némán elveszti a fél
// játékot. Itt ráadásul VISELKEDÉST mérünk: egy fix tick-lista nem stratégia,
// hanem felvétel — nem tudna reagálni arra, hogy elfogyott a pénz vagy
// összeomlott egy kapu, tehát pont azt nem mérné, amiért létezik.
//
// ── MIT NEM CSINÁLNAK ─────────────────────────────────────────────────────
// A sim belsejébe SOHA nem írnak. Olvasnak (ahogy a játékos is látja a HUD-ot
// és a paneleket), és `sim.parancs(...)`-ot adnak ki — pontosan azt a
// felületet használják, amit egy ember. Ha egy stratégia nem tud valamit
// elérni parancsokkal, az nem a stratégia hibája, hanem a játéké.
//
// ── A TELEKRÁCS ───────────────────────────────────────────────────────────
// Minden gépi játékos ugyanazon a 4×4-es telekrácson épít: 3×3 hasznos hely +
// 1 cella folyosó. Ez nem optimális elrendezés, DE MINDEGYIKNEK UGYANAZ —
// tehát az elrendezés minősége nem szennyezi a stratégiák összehasonlítását.
// (Ha mindegyik saját ügyes térkiosztást kapna, azt mérnénk, melyik
// térkiosztást írtam meg jobban, nem azt, melyik gazdasági döntés jobb.)
//
// ── v0.5: MIÉRT KELLETT NÉGY ÚJ ÁG ────────────────────────────────────────
// A v0.4 három egész alrendszert adott a játékhoz (emeletek, bérbeadás,
// érkezési csatornák), és a régi hat stratégia EGYIKET SEM használta. A
// mérésük ezért nem „gyenge" volt, hanem NEM LÉTEZETT: hat játékos mérte
// ugyanazt a földszinti, bérbeadás nélküli, kapu-alapú játékot. Egy alrendszer,
// amit egyetlen mért játékos sem érint, pontosan annyit ér az egyensúly
// szempontjából, mintha ki sem lenne adva.
//
// A négy új ág (`emeletes`, `berbeado`, `csatornas`, `kutato`) mindegyike EGY
// kérdésre felel: megéri-e a függőleges terjeszkedés · versenyképes-e a passzív
// bevétel · elég-e a „nyugodt" csatorna-ág önmagában · kifizetődik-e a
// technológia. Mindegyik ugyanazt a közös motort járja, más számokkal.

import { RACS_SZ, RACS_M, PADLO_AR, EMELET_FELAR } from '../src/mag/config.js';
import { DIMENZIOK } from '../src/sim/dimenziok.js';
import { EPULETEK, epuletTipus } from '../src/sim/epuletek.js';
import { ESEMENYEK } from '../src/sim/esemenyek.js';
import { tech } from '../src/sim/kutatas.js';

// ══════════════════════════════════════════════════════════════════════════
//  KÖZÖS SEGÉDLET
// ══════════════════════════════════════════════════════════════════════════

/** 4×4-es telkek a rácson, a kezdő csarnok közepétől kifelé rendezve. */
function telkek(sim) {
  const kx = sim.kezdoX, ky = sim.kezdoY;
  const cx = kx + 11, cy = ky + 8;
  const l = [];
  for (let y = ky - 16; y <= ky + 28; y += 4) {
    for (let x = kx - 20; x <= kx + 40; x += 4) {
      if (x < 0 || y < 0 || x + 3 > RACS_SZ || y + 3 > RACS_M) continue;
      l.push({ x, y, tav: Math.abs(x + 1 - cx) + Math.abs(y + 1 - cy) });
    }
  }
  l.sort((a, b) => a.tav - b.tav || a.y - b.y || a.x - b.x);
  return l;
}

/** 8×8-as padlóblokkok — a terjeszkedés egysége. A telekráccsal egy vonalban. */
function blokkok(sim) {
  const kx = sim.kezdoX, ky = sim.kezdoY;
  const l = [];
  for (let j = -3; j <= 3; j++) {
    for (let i = -3; i <= 4; i++) {
      const x = kx + 8 * i, y = ky + 8 * j;
      if (x + 8 <= 0 || y + 8 <= 0 || x >= RACS_SZ || y >= RACS_M) continue;
      l.push({ x, y, i, j, tav: Math.abs(i - 1) * 2 + Math.abs(j * 2 - 1) });
    }
  }
  l.sort((a, b) => a.tav - b.tav || a.j - b.j || a.i - b.i);
  return l;
}

/** Az első telek, ahová egy sz×m épület elfér az adott szinten. */
function szabadTelek(lista, sim, sz, m, z = 0) {
  for (let i = 0; i < lista.length; i++) {
    const p = lista[i];
    if (sim.racs.szabadTerulet(p.x, p.y, sz, m, z)) return p;
  }
  return null;
}

/**
 * Átjárónak (mozgólépcső, lift) KÉT szinten kell hely: a sajátján és a
 * fölötte lévőn. Enélkül a `_pEpit` elutasít, és a stratégia némán elveszti
 * az egész emeletes ágat — pont azt, amit mérni akar.
 */
function szabadTelekAtjaro(lista, sim, sz, m, z) {
  for (let i = 0; i < lista.length; i++) {
    const p = lista[i];
    if (sim.racs.szabadTerulet(p.x, p.y, sz, m, z)
      && sim.racs.szabadTerulet(p.x, p.y, sz, m, z + 1)) return p;
  }
  return null;
}

/**
 * Melyik szakmából hiányzik valaki egy már megépült épületben?
 *
 * ⚠️ A BÉRBE ADOTT ÜZLETET KI KELL HAGYNI. Az első változat nem tette, és a
 * `berbeado` stratégia ettől VÉGTELEN felvételi hurokba került: a bérelt bolt
 * `dolgozok` listája örökre üres marad (a bérlő hozza a sajátját), a bot tehát
 * örökké hiányt látott, felvett valakit — akit a `_szabadMunkahely` nem tudott
 * hová beosztani, mert az is kiszűri a bérelt üzleteket. Fizettük a bérét a
 * semmiért. Ugyanez a hiba a JÁTÉKBAN már javítva van (v0.4), a mérőeszközben
 * itt javul.
 */
function hianyzoSzakma(sim) {
  for (let a = 0; a < sim.epuletek.length; a++) {
    const ep = sim.epuletek[a];
    if (!ep || ep.berbeadva) continue;
    const t = sim.epuletTipusa(ep);
    if (!t.fajta || t.szemelyzet === 0) continue;
    if (ep.dolgozok.length < t.szemelyzet) return t.fajta;
  }
  return null;
}

/** Van-e olyan üres munkahely, ahová ez a szakma beosztható? */
function vanMunkahely(sim, szakma) {
  for (let a = 0; a < sim.epuletek.length; a++) {
    const ep = sim.epuletek[a];
    if (!ep || ep.berbeadva) continue;
    const t = sim.epuletTipusa(ep);
    if (t.fajta !== szakma || t.szemelyzet === 0) continue;
    if (ep.dolgozok.length < t.szemelyzet) return true;
  }
  return false;
}

/** Egy kapu megnyitásának teljes ára (portál + nyitási díj + a III. fejezet ága). */
function kapuAr(sim, dimIdx) {
  let nyitas = DIMENZIOK[dimIdx].nyitasAr;
  if (sim.tortenetJelzok.has('megerosites')) nyitas = Math.round(nyitas * 1.6);
  return epuletTipus('portal').ar + nyitas;
}

/** Van-e nyitva vámköteles világ — enélkül a vám halott beruházás. */
function vamKell(sim) {
  for (let i = 0; i < sim.dimenziok.length; i++) {
    if (sim.dimenziok[i].nyitva && DIMENZIOK[i].vamKoteles) return true;
  }
  return false;
}

/**
 * Hány portálkarbantartó kell — MINDEN stratégiának ugyanaz a képlet.
 *
 * ⚠️ EZ A v0.5 EGYIK LEGFONTOSABB BOT-JAVÍTÁSA. A régi profilok a MÁSODIK
 * kaputól kértek karbantartót, mert a v0.1-es `INSTABIL_KARBANTARTAS = 40`
 * mellett egyetlen műhely az egész hálózatot elvitte. A v0.4-es hangolás ezt
 * 14-re vitte le, és ettől az EGYETLEN kezdő kapu is összeomlik magától:
 * alapon 0,08 instabilitás/tick, a határ 1000 — vagyis karbantartó nélkül a
 * Zsibvásár-kapu a ~9. játéknapon leáll. Mérve is: a hangolatlan botoknál 10
 * nap alatt már 1 összeomlás jött, és a `bevetel_maximalizalo` egyik seedben
 * emiatt ült NULLA nyitott kapuval.
 *
 * Két mérnök (erő 2) tickenként 0,28-at farag; egy kapu alapon 0,08-at nő,
 * plusz utasonként 0,25×veszély. Nagy forgalomnál tehát nagyjából KÉT kapu
 * jut egy műhelyre — a képlet ezt követi.
 */
const karbantartoCel = (s) => {
  const k = s.nyitottKapuk().length;
  if (k === 0) return 0;
  return 1 + (k >= 3 ? 1 : 0) + (k >= 5 ? 1 : 0);
};

/** Forgalom-mérőszám: erre méretezik a gépi játékosok a kapacitást. */
function forgalom(sim) {
  const most = sim.utasSzam;
  const csucs = sim.csucsUtas * 0.6;
  return most > csucs ? most : csucs;
}

/** Hány `kod` típusú épület áll az adott SZINTEN. */
function epuletSzamZ(sim, kod, z) {
  let n = 0;
  for (let a = 0; a < sim.epuletek.length; a++) {
    const ep = sim.epuletek[a];
    if (ep && ep.kod === kod && ep.z === z) n++;
  }
  return n;
}

/** Egy technológia teljes függőségi sora, a végén magával a technológiával. */
export function fuggosegiSor(kod, ki = []) {
  const t = tech(kod);
  if (!t) return ki;
  for (let i = 0; i < t.fuggo.length; i++) fuggosegiSor(t.fuggo[i], ki);
  if (!ki.includes(kod)) ki.push(kod);
  return ki;
}

// ── VÁLASZ-SABLONOK ───────────────────────────────────────────────────────

/** Mindig a legolcsóbb válasz (a 0. indexű a fizetős, az 1. rendszerint ingyen). */
const olcsoValasz = () => (sim, def) => {
  let legjobb = 0, ar = Infinity;
  for (let i = 0; i < def.valaszok.length; i++) if (def.valaszok[i].ar < ar) { ar = def.valaszok[i].ar; legjobb = i; }
  return legjobb;
};

/** Fizet, ha a válasz ára a vagyon adott hányada alatt van. */
const fizetosValasz = (hanyad) => (sim, def) => {
  for (let i = 0; i < def.valaszok.length; i++) {
    const v = def.valaszok[i];
    if (v.ar > 0 && v.ar < sim.penz * hanyad) return i;
  }
  return olcsoValasz()(sim, def);
};

// ══════════════════════════════════════════════════════════════════════════
//  ALAPÉRTELMEZETT PROFIL
// ══════════════════════════════════════════════════════════════════════════
//
// MIÉRT VAN: hogy egy stratégia csak azt mondja ki, amiben KÜLÖNBÖZIK. A
// v0.4-es változatban minden profil felsorolta mind a tizenöt mezőt, és a
// hangoláskor ez pont a lényeget rejtette el: nem látszott, hogy két stratégia
// között tényleg csak a díjszorzó a különbség, vagy véletlenül más is elcsúszott.

const ALAP = {
  nev: '?',
  tetlen: false,
  // ── pénzküszöbök ────────────────────────────────────────────────────────
  tartalek: 3000,          // ennyi maradjon egy épület megépítése UTÁN
  dolgozoTartalek: 2500,
  kapuTartalek: 5000,
  kutatasTartalek: 9000,
  szintTartalek: 22000,    // a kapuszint 6000·szint — az 5. szint 24-33 e
  csatornaTartalek: 6000,
  emeletTartalek: 7000,
  energiaTartalek: 1.2,
  // ── ütemezés ────────────────────────────────────────────────────────────
  felvetelKoz: 30,
  epitesKoz: 50,
  szintKoz: 200,
  // ── stílus ──────────────────────────────────────────────────────────────
  dij: 1.0,
  kepez: true,
  kutatasElore: false,     // igaz: a kutatás megelőzi az építkezést
  maxKapuSzint: 5,
  terv: [],
  emeletTerv: [],
  kutatas: [],
  csatorna: [],            // csatorna-épületek kódjai, sorrendben
  emelet: false,
  emeletBlokk: 0,          // hány 8×8-as padlóblokk kerüljön az 1. emeletre
  atjaroCel: (s, f) => 1 + Math.floor(f / 260),
  berbead: null,           // (kod, sim) => bool — mit adjunk bérbe
  kaputNyit: () => false,
  dontes: () => 0,
  esemeny: olcsoValasz(),
};

// ══════════════════════════════════════════════════════════════════════════
//  A KÖZÖS MOTOR
// ══════════════════════════════════════════════════════════════════════════
//
// Minden stratégia ugyanazt a döntési létrát járja be, csak MÁS SZÁMOKKAL és
// más kívánságlistával. Ez szándékos: így a köztük lévő különbség tényleg a
// gazdasági döntés, nem az, hogy az egyiknek írtam okosabb kódot.
//
// A létra fentről lefelé, tickenként EGY lépés:
//    1. történet / esemény válasz      (a modális ablakok kezelése)
//    2. energia                        (az áramszünet mindent lelassít)
//    3. BÉRBEADÁS                      (ELŐBB, mint a felvétel — lásd lent)
//    4. személyzet (felvétel + a fölösleges elbocsátása)
//    5. kutatás, HA a profil előreveszi
//    6. emelet: padló és átjáró
//    7. épület a földszinti, majd az emeleti kívánságlistából
//    8. érkezési csatorna (vasút / léghajó / űrkapu)
//    9. új kapu
//   10. kutatás (ha nincs előrevéve)
//   11. kapufejlesztés / dolgozó-képzés
//   12. díjszabás
//
// ⚠️ A BÉRBEADÁS A FELVÉTEL ELŐTT VAN. Fordítva a bot felvenné a személyzetet
// a frissen megépült boltba, a következő körben bérbe adná, a `_pBerbead`
// kirakná onnan a dolgozót — és attól kezdve egy sehol be nem osztott ember
// bérét fizetnénk. Ez pont az a némán szivárgó költség, amit a v0.4 a
// JÁTÉKBAN javított; a mérőeszközben ugyanígy el kell kerülni, különben a
// „bérbeadás" ág mérése a saját hibáját mérné.

function motor(profil) {
  return function gyar(opciok = {}) {
    const p = { ...ALAP, ...profil, ...opciok };
    let tl = null, bl = null;
    let foldszint = null;          // lerakott 8×8 blokkok a 0. szinten
    let emeletBlokkok = null;      // …és az 1. emeleten
    let utolsoFelvetel = -999;
    let utolsoEpites = -999;
    let utolsoSzint = -999;
    const dijKesz = new Set();

    return function jatekos(sim, t) {
      if (sim.jatekVege) return;
      if (tl === null) {
        tl = telkek(sim);
        bl = blokkok(sim);
        foldszint = new Set(['0,0', '1,0', '2,0', '0,1', '1,1', '2,1']);
        emeletBlokkok = new Set();
      }

      // ── 1. TÖRTÉNET ÉS ESEMÉNYEK ────────────────────────────────────────
      // Ezek nem „stratégia": egy ember is elengedi a fejezet-ablakot. A
      // KÜLÖNBSÉG a válaszokban van (fizetünk-e az eseményre, melyik ágat
      // választjuk a fejezet-döntésnél) — azt a profil dönti el.
      if (t % 20 === 0) {
        if (sim.tortenet.allapot === 'bevezeto') sim.parancs({ fajta: 'fejezet_tovabb' });
        else if (sim.tortenet.allapot === 'dontes') {
          sim.parancs({ fajta: 'dontes', valasz: p.dontes(sim, sim.tortenet.fejezet) });
        }
        for (let i = 0; i < sim.varakozoValaszok.length; i++) {
          const e = sim.varakozoValaszok[i];
          const def = ESEMENYEK[e.idx];
          if (!def.valaszok) continue;
          sim.parancs({ fajta: 'esemeny_valasz', azon: e.azon, valasz: p.esemeny(sim, def) });
        }
      }

      if (p.tetlen) return;               // a kontrollcsoport itt megáll
      if (t % 10 !== 0) return;           // 10 tickenként egy döntés

      const penz = sim.penz;
      const f = forgalom(sim);

      // ── 2. ENERGIA ──────────────────────────────────────────────────────
      // A tartalék NEM luxus: az áramszünet minden épületet 40 %-ra ejt, és
      // a hangulaton keresztül a hírnevet is viszi. A stratégiák abban
      // különböznek, mekkora tartalékkal járnak (p.energiaTartalek).
      if (sim.energiaTermeles < sim.energiaIgeny * p.energiaTartalek && penz > 1800 + p.tartalek * 0.5) {
        const h = szabadTelek(tl, sim, 2, 2);
        if (h) { sim.parancs({ fajta: 'epit', tipus: 'energiamag', x: h.x, y: h.y }); return; }
        padlot(sim, bl, foldszint, penz, 0);
        return;
      }

      // ── 3. BÉRBEADÁS ────────────────────────────────────────────────────
      if (p.berbead) {
        for (let a = 0; a < sim.epuletek.length; a++) {
          const ep = sim.epuletek[a];
          if (!ep || ep.berbeadva) continue;
          const tip = sim.epuletTipusa(ep);
          // ⚠️ EZ A FELTÉTEL A SIM FELTÉTELÉNEK MÁSOLATA, ÉS EZ VESZÉLYES.
          // Amikor a sim `_pBerbead()`-je szigorodott (`szemelyzet === 0` sem
          // adható bérbe), ez a sor változatlan maradt: a bot átengedte a
          // mosdót, a sim elutasította, a bot pedig a `return` miatt MINDEN
          // tickben ugyanoda ért vissza. A `berbeado` stratégia így 8/8
          // győzelemről 0/8-ra esett, 4 épülettel és 6-os hírnévvel — ami
          // JÁTÉK-REGRESSZIÓNAK látszott, holott a mérőeszköz akadt el.
          // Ha a sim feltétele megint változik, ITT is át kell vezetni.
          if (!tip.igeny || tip.dij <= 0 || tip.szemelyzet === 0) continue;
          if (!p.berbead(ep.kod, sim)) continue;
          sim.parancs({ fajta: 'berbead', azon: ep.azon });
          return;
        }
      }

      // ── 4. SZEMÉLYZET ───────────────────────────────────────────────────
      if (t - utolsoFelvetel > p.felvetelKoz && penz > p.dolgozoTartalek) {
        const hiany = hianyzoSzakma(sim);
        if (hiany) { sim.parancs({ fajta: 'felvesz', tipus: hiany }); utolsoFelvetel = t; return; }
      }
      // Beosztás nélkül maradt dolgozó: a bérét fizetjük, de semmit nem csinál.
      // (Ez akkor keletkezik, ha egy már felszerelt üzletet adunk bérbe.)
      if (t % 100 === 0) {
        for (let i = 0; i < sim.dolgozok.length; i++) {
          const d = sim.dolgozok[i];
          if (d.epuletAzon >= 0) continue;
          if (vanMunkahely(sim, d.kod)) continue;
          sim.parancs({ fajta: 'elbocsat', azon: d.azon });
          return;
        }
      }

      // ── 5. KUTATÁS ELŐRE (csak a `kutato` profilnál) ─────────────────────
      if (p.kutatasElore && kutatast(sim, p, penz)) return;

      // ── 6. EMELET: PADLÓ ÉS ÁTJÁRÓ ──────────────────────────────────────
      // Az emelet háromlépcsős beruházás, és mind a három lépcső KELL:
      // padló (drága: szintenként +110 %), átjáró (a lépcső nélkül az emelet
      // halott tér), és csak utána van értelme oda épületet tenni.
      if (p.emelet && penz > p.emeletTartalek) {
        if (emeletBlokkok.size < p.emeletBlokk) {
          if (padlot(sim, bl, emeletBlokkok, penz, 1, foldszint)) return;
        } else {
          const kellAtjaro = p.atjaroCel(sim, f);
          const vanAtjaro = sim.epuletSzam('lepcso') + sim.epuletSzam('teleportlift');
          if (vanAtjaro < kellAtjaro) {
            // A lift csak kutatás után; amíg nincs, mozgólépcső megy.
            const kod = sim.kesz('teleport_lift') && vanAtjaro > 0 ? 'teleportlift' : 'lepcso';
            const tip = epuletTipus(kod);
            if (penz > tip.ar + p.tartalek) {
              const h = szabadTelekAtjaro(tl, sim, tip.sz, tip.m, 0);
              if (h) { sim.parancs({ fajta: 'epit', tipus: kod, x: h.x, y: h.y, z: 0 }); return; }
            }
          }
        }
      }

      // ── 7. ÉPÜLET A KÍVÁNSÁGLISTÁKBÓL ───────────────────────────────────
      if (t - utolsoEpites > p.epitesKoz) {
        if (epitsunk(sim, p, p.terv, 0, tl, bl, foldszint, penz, f)) { utolsoEpites = t; return; }
        if (p.emelet && emeletBlokkok.size > 0
          && epitsunk(sim, p, p.emeletTerv, 1, tl, bl, emeletBlokkok, penz, f, foldszint)) { utolsoEpites = t; return; }
      }

      // ── 8. ÉRKEZÉSI CSATORNA ────────────────────────────────────────────
      // A vasút/léghajó/űrkapu NEM kapu: nincs instabilitása, nem fogyaszt
      // kristályt, és nem a „Kapuk" fülön nyílik, hanem a megépített épület
      // HOZZA MAGÁVAL a hálózatot. Egy típusból egy van értelme (a második
      // ugyanazt a hálózatot kötné be), ezért a lista egyszer fut végig.
      for (let i = 0; i < p.csatorna.length; i++) {
        const kod = p.csatorna[i];
        const tip = epuletTipus(kod);
        if (!tip) continue;
        if (tip.kutatas && !sim.kesz(tip.kutatas)) continue;
        if (sim.epuletSzam(kod) > 0) continue;
        if (penz < tip.ar + p.csatornaTartalek) continue;
        const z = tip.minSzint || 0;
        // A léghajó-kikötő csak EMELETEN áll meg: ha nincs emeleti padló,
        // előbb azt kell megvenni. Ez a csatorna-ág rejtett belépője.
        if (z > 0 && emeletBlokkok.size === 0) break;
        const h = szabadTelek(tl, sim, tip.sz, tip.m, z);
        if (!h) {
          padlot(sim, bl, z > 0 ? emeletBlokkok : foldszint, penz, z, z > 0 ? foldszint : null);
          return;
        }
        sim.parancs({ fajta: 'epit', tipus: kod, x: h.x, y: h.y, z });
        return;
      }

      // ── 9. ÚJ KAPU ──────────────────────────────────────────────────────
      if (t > 300) {
        for (let i = 0; i < sim.dimenziok.length; i++) {
          const d = sim.dimenziok[i];
          if (!d.felfedezve || d.nyitva || d.lezarva) continue;
          if (DIMENZIOK[i].csatorna) continue;        // azt a 8. lépés viszi
          // ⚠️ `continue`, NEM `break`. A régi változat kilépett a ciklusból,
          // ha a profil egy dimenzióra nemet mondott — így egy olyan
          // stratégia, ami CSAK a Sárkánytrónust akarja megnyitni, soha nem
          // jutott el odáig: a listában előbb álló Ködmocsárnál megállt a
          // vizsgálat. A `csatornas` emiatt 0/8 győzelmet mutatott, és ezt
          // majdnem a JÁTÉK ítéleteként írtam le — holott a mérőeszközöm
          // tiltotta meg neki a győzelmet.
          if (!p.kaputNyit(sim, i, f)) continue;
          const ar = kapuAr(sim, i);
          if (penz < ar + p.kapuTartalek) break;
          const h = szabadTelek(tl, sim, 3, 3);
          if (!h) { padlot(sim, bl, foldszint, penz, 0); return; }
          sim.parancs({ fajta: 'epit', tipus: 'portal', x: h.x, y: h.y, dim: d.kod });
          return;
        }
      }

      // ── 10. KUTATÁS ─────────────────────────────────────────────────────
      if (!p.kutatasElore && kutatast(sim, p, penz)) return;

      // ── 11. KAPUFEJLESZTÉS ÉS KÉPZÉS ────────────────────────────────────
      if (penz > p.szintTartalek && t - utolsoSzint > p.szintKoz) {
        const l = sim.nyitottDimenziok();
        let cel = null;
        for (let i = 0; i < l.length; i++) {
          if (l[i].szint >= p.maxKapuSzint) continue;
          if (!cel || l[i].szint < cel.szint) cel = l[i];
        }
        if (cel) { sim.parancs({ fajta: 'dim_szint', kod: cel.kod }); utolsoSzint = t; return; }
      }
      if (p.kepez && penz > p.szintTartalek && t % 400 === 0) {
        for (let i = 0; i < sim.dolgozok.length; i++) {
          if (sim.dolgozok[i].szint < 2) { sim.parancs({ fajta: 'dolgozo_fejleszt', azon: sim.dolgozok[i].azon }); return; }
        }
      }

      // ── 12. DÍJSZABÁS ───────────────────────────────────────────────────
      // Minden frissen megnyitott kapun beállítjuk a stratégia díjszorzóját.
      for (let i = 0; i < sim.dimenziok.length; i++) {
        const d = sim.dimenziok[i];
        if (!d.nyitva || dijKesz.has(i)) continue;
        dijKesz.add(i);
        if (Math.abs(d.dijSzorzo - p.dij) > 0.001) {
          sim.parancs({ fajta: 'dim_dij', kod: d.kod, szorzo: p.dij });
          return;
        }
      }
    };
  };
}

/** Kutatás-lépés. Külön függvény, mert két helyről is hívjuk (5. és 10. lépés). */
function kutatast(sim, p, penz) {
  if (sim.aktivKutatas || penz <= p.kutatasTartalek) return false;
  for (let i = 0; i < p.kutatas.length; i++) {
    const kod = p.kutatas[i];
    if (sim.kesz(kod) || !sim.kutathato(kod)) continue;
    if (penz < Math.round(tech(kod).ar * sim.kutatasKedvezmeny) + p.tartalek) break;
    sim.parancs({ fajta: 'kutat', kod });
    return true;
  }
  return false;
}

/**
 * Egy kívánságlista végigjárása egy SZINTEN. Igazat ad, ha kiadott parancsot.
 * @param {Set} sajatBlokk az adott szint lerakott blokkjai (ide terjeszkedünk)
 * @param {Set|null} alapBlokk emeleten: az alatta lévő szint blokkjai
 */
function epitsunk(sim, p, terv, z, tl, bl, sajatBlokk, penz, f, alapBlokk = null) {
  for (let i = 0; i < terv.length; i++) {
    const [kod, celFv] = terv[i];
    const tip = epuletTipus(kod);
    if (!tip) continue;
    if (tip.kutatas && !sim.kesz(tip.kutatas)) continue;
    const cel = typeof celFv === 'function' ? celFv(sim, f) : celFv;
    if (cel <= 0) continue;
    if (epuletSzamZ(sim, kod, z) >= cel) continue;
    if (penz < tip.ar + p.tartalek) continue;
    const h = szabadTelek(tl, sim, tip.sz, tip.m, z);
    if (!h) { padlot(sim, bl, sajatBlokk, penz, z, alapBlokk); return true; }
    sim.parancs({ fajta: 'epit', tipus: kod, x: h.x, y: h.y, z });
    return true;
  }
  return false;
}

/**
 * Következő padlóblokk az adott szinten. Két szabály:
 *   • csak olyat rakunk le, ami a szint MÁR MEGLÉVŐ padlójához ér (különben
 *     lebegő sziget lenne, amire nem vezet út),
 *   • emeleten ráadásul csak oda, ahol ALATTA is van padló — ezt a sim úgyis
 *     kikényszeríti, de ha a bot nem tudná, minden emeleti parancsa elutasításba
 *     futna, és a mérés némán elveszítené az egész ágat.
 * @returns {boolean} adott-e ki parancsot
 */
function padlot(sim, bl, lerakott, penz, z = 0, alapBlokk = null) {
  const ar = 64 * PADLO_AR * (1 + z * EMELET_FELAR);
  if (penz < ar * 1.6) return false;
  for (let i = 0; i < bl.length; i++) {
    const b = bl[i];
    const kulcs = `${b.i},${b.j}`;
    if (lerakott.has(kulcs)) continue;
    if (alapBlokk && !alapBlokk.has(kulcs)) continue;
    if (lerakott.size > 0
      && !lerakott.has(`${b.i - 1},${b.j}`) && !lerakott.has(`${b.i + 1},${b.j}`)
      && !lerakott.has(`${b.i},${b.j - 1}`) && !lerakott.has(`${b.i},${b.j + 1}`)) continue;
    lerakott.add(kulcs);
    sim.parancs({ fajta: 'padlo', x: b.x, y: b.y, sz: 8, m: 8, z });
    return true;
  }
  return false;
}

// ══════════════════════════════════════════════════════════════════════════
//  A TÍZ STRATÉGIA
// ══════════════════════════════════════════════════════════════════════════
//
// ⚠️ A KÜSZÖBSZÁMOK A v0.4-ES GAZDASÁGHOZ VANNAK IGAZÍTVA, nem a v0.1-eshez.
// A hangolás öt számot mozdított el érdemben, és mind az ötnek van
// következménye itt is:
//   • a kapuszint 1 800 → 6 000/szint  → a `szintTartalek` 18-26 e-ről 40 e-re,
//     különben a bot az összes készpénzét szintre költi és nem marad épületre;
//   • az üzemeltetés ár·1,2 % → ár·2,8 % + utas·0,35/nap → a fölösleges épület
//     tényleg fáj, tehát a kapacitás-osztók (`f/50` stb.) szűkültek;
//   • a hírnév-szorzó 0,45…1,55 → 0,12…1,57 → a hírnév-romlás most valódi
//     büntetés, ezért MINDEN stratégia (a kontroll kivételével) tart legalább
//     egy takarítót és annyi biztonságit, amennyi kell;
//   • az INSTABIL_KARBANTARTAS 40 → 14 → egy karbantartó már nem elég az egész
//     hálózatra: a `karbantarto` célszám a nyitott kapuk számától függ;
//   • a MAX_UTAS 1 200 → 1 600 → a kapacitás-célok fölfelé is elérnek.
//
// ⚠️ ÉS EGY MÉRÉSI CSAPDA, AMIT MAJDNEM BENÉZTEM. A `kapuTartalek` (mennyi
// pénz maradjon egy kapu megnyitása UTÁN) nem folytonosan hat: van egy
// SZAKADÁSA. 4 seed × 30 nap, `kiegyensulyozott` + „mindent bérbe adok":
//   kapuTartalek 1 500 → 4/4 győzelem · 3 000 → 4/4 · 5 500 → **0/4**, a
//   II. fejezetnél megrekedve, 1 kapuval, 17 utassal.
// A bérbeadás 58 %-os bevétel-elvonása mellett a bot egyszerűen SOHA nem
// gyűjtött össze 5 500 + 4 400-at, mert közben mindig épített valamit. Ha a
// küszöböt nem sepregettem volna végig, azt jelentettem volna, hogy „a
// bérbeadás játszhatatlan" — holott a bot küszöbe volt rossz, nem a játék
// száma. Ezért van minden aktív stratégián 3 000–3 500 körüli kaputartalék:
// a mérés szerint 500 és 4 000 között MINDEGYIK érték 4/4 győzelmet ad, tehát
// ez a sáv az, ahol a küszöb nem szennyezi az eredményt.
//
// ── ÉS AMIT A v0.6 VÁLTOZTATOTT MEG ───────────────────────────────────────
// A kosz azóta ÉPÜLETENKÉNT gyűlik, és a takarító koboldok tényleg odamennek
// a legkoszosabb épülethez. Ettől a takarítás a v0.4-esnél sokkal drágább és
// sokkal fontosabb lett — mérve, `kiegyensulyozott`, 6 seed × 30 nap:
//   takarítórobot a kutatási sor 7. helyén → 5/6 győzelem, végső hírnév 60
//   takarítórobot a 2. helyen               → 6/6 győzelem, végső hírnév 73,
//                                             +12 % nettó vagyon, 0 mínuszos nap
// Ezért ugrott a `takaritorobot` MINDEN aktív stratégiánál a sor elejére, és
// ezért szűkültek a takarító-osztók (f/170 → f/110).

/**
 * ÓVATOS — előbb a személyzet és az energia, csak utána a terjeszkedés.
 * Keveset kutat, nagy készpénz-tartalékot tart, és a fejezet-döntéseknél
 * mindig a biztonságos (stabilizáló) ágat választja.
 *
 * A v0.4-es hangolás után ez a stratégia BEFAGYOTT: a 14 000-es kaputartalék
 * mellett a második kapura (2 600 + 1 800) 18 400 kellett, amit egyetlen
 * kapuból soha nem gyűjtött össze — a 10. napon 1 kapunál és a II. fejezetnél
 * állt. Az óvatosság nem tétlenség: a tartalékok arányosan csökkentek, a
 * SORREND (előbb karbantartó, aztán terjeszkedés) maradt.
 */
export const ovatos = motor({
  nev: 'ovatos',
  tartalek: 4000,
  dolgozoTartalek: 3000,
  kapuTartalek: 7000,
  kutatasTartalek: 12000,
  szintTartalek: 46000,
  energiaTartalek: 1.35,
  felvetelKoz: 30,
  epitesKoz: 70,
  dij: 1.0,
  kepez: true,
  terv: [
    ['biztonsag', (s, f) => 1 + Math.floor(f / 55)],
    ['wc', (s, f) => 1 + Math.floor(f / 90)],
    ['varo', (s, f) => 1 + Math.floor(f / 80)],
    ['takarito', (s, f) => 1 + Math.floor(f / 140)],
    // A karbantartó nála NEM a második kapu után jön, hanem előtte: ez az
    // óvatos stratégia lényege — előbb a tartóváz, aztán a terjeszkedés.
    ['karbantarto', karbantartoCel],
    ['info', (s, f) => 1 + Math.floor(f / 300)],
    // ⚠️ A VIP ITT VAN, NEM A LISTA VÉGÉN. A kívánságlista szigorú prioritási
    // sor: a motor az ELSŐ olyan tételnél megáll, aminek a célszáma még nincs
    // meg. A forgalom-arányos célok (`f/55`, `f/90`) viszont EGYÜTT NŐNEK a
    // forgalommal, tehát az elején álló tételek SOHA nem telnek be — a lista
    // farka így halott kód. Mérve: az óvatos 8 seedből 8-ban az V. fejezetnél
    // ragadt (0/8 győzelem), mert a VIP Lounge-ot, amit a fejezet megkövetel,
    // a lista végén sosem érte el — pedig 895 891 tallér ült a kasszájában.
    ['vip', 1],
    ['etterem', (s, f) => 1 + Math.floor(f / 110)],
    ['bolt', (s, f) => 1 + Math.floor(f / 120)],
    ['poggyasz', (s, f) => 1 + Math.floor(f / 180)],
    ['vam', (s, f) => (vamKell(s) ? 1 + Math.floor(f / 110) : 0)],
    ['seprupark', (s, f) => (f > 60 ? 1 + Math.floor(f / 200) : 0)],
    ['hoforras', (s, f) => (s.dimenzioNyitva('parazsmely') ? 1 + Math.floor(f / 200) : 0)],
    ['jegkamra', (s, f) => (s.dimenzioNyitva('fagyperem') ? 1 + Math.floor(f / 200) : 0)],
    ['konyvesbolt', (s, f) => (f > 80 ? 1 + Math.floor(f / 200) : 0)],
    ['orvos', 1],
  ],
  // ⚠️ A `kapu_szkenner` NEM luxus nála, hanem MENEKÜLŐÚT. Az óvatos a III.
  // fejezetben a „Megerősítés" ágat választja (ez az identitása), az pedig NEM
  // fedi fel a Parázsmélyt — démon nélkül viszont SOHA nem érkezik VIP-igényű
  // vendég, tehát az V. fejezet („szolgálj ki egy legendás vendéget")
  // teljesíthetetlen. Mérve, 8 seed × 50 nap: szkenner nélkül 0/8 győzelem,
  // mind a nyolc az V. fejezetnél ragadva, ÜRESEN ÁLLÓ VIP Lounge-dzsal és
  // 894 463 tallérral a kasszában; szkennerrel 3/8. Lásd `qa/EGYENSULY.md`.
  kutatas: ['gyors_sorok', 'takaritorobot', 'vip_ellatas', 'fejlett_boltok', 'stabil_kapuk', 'kapu_hangolas', 'kapu_szkenner', 'energia_halo', 'gyogyaszat'],
  // Csak akkor nyit új kaput, ha a meglévők ellátása rendben van.
  kaputNyit: (sim) => sim.mukodoEpuletVan('karbantarto') && !sim.aramszunet && hianyzoSzakma(sim) === null,
  dontes: (sim, fej) => 0,                        // megerősítés, majd lezárás
  esemeny: fizetosValasz(0.18),
});

/**
 * TERJESZKEDŐ — amint egy világ ismert és kifizethető, kaput nyit.
 * A szolgáltatásokra alig költ: a portáldíjból akar élni.
 *
 * ⚠️ Ez SZÁNDÉKOSAN rossz stratégia — de kompetensen rossz: nem azért bukik,
 * mert elfelejt energiát építeni, hanem mert a MINŐSÉGET hagyja el. Ha a
 * hírnév-büntetés jól van hangolva, ennek látszania kell a végszámokban.
 */
export const terjeszkedo = motor({
  nev: 'terjeszkedo',
  tartalek: 800,
  dolgozoTartalek: 1500,
  kapuTartalek: 500,
  kutatasTartalek: 9000,
  szintTartalek: 30000,
  energiaTartalek: 1.05,
  felvetelKoz: 50,
  epitesKoz: 60,
  dij: 1.0,
  kepez: false,
  terv: [
    ['biztonsag', (s, f) => 1 + Math.floor(f / 90)],
    ['wc', 1],
    ['varo', 1],
    ['takarito', 1],
    ['karbantarto', karbantartoCel],
    ['etterem', 1],
    ['vam', (s) => (vamKell(s) ? 1 : 0)],
    ['poggyasz', 1],
    ['bolt', 1],
  ],
  kutatas: ['kapu_hangolas', 'stabil_kapuk', 'kristaly_takarek', 'kapu_szkenner', 'ido_kotes', 'fejlett_boltok', 'vip_ellatas', 'legendas_kapu'],
  kaputNyit: () => true,
  dontes: () => 1,                                // terjeszkedés, mindet megtartom
  esemeny: olcsoValasz(),
});

/**
 * BEVÉTEL-MAXIMALIZÁLÓ — sok bolt, étterem, könyvesbolt és VIP, magas díj.
 * A tétel: a kevesebb, de gazdagabb utas többet hoz, mint a tömeg.
 *
 * A v0.4 után ez ment a legrosszabbul (3/4 csőd), de nem a stratégia bukott
 * meg, hanem a SORRENDJE: a drága boltokat FORGALOM ELŐTT húzta fel, és a
 * megnövelt üzemeltetési átalány (ár·2,8 %) az üres boltokon vérzett el. A
 * célszámok most forgalom-arányosak, a magas díj (1,3) marad — az a stratégia
 * lényege, nem a hibája.
 */
export const bevetel_maximalizalo = motor({
  nev: 'bevetel_maximalizalo',
  tartalek: 2500,
  dolgozoTartalek: 3000,
  kapuTartalek: 3500,
  kutatasTartalek: 10000,
  szintTartalek: 42000,
  energiaTartalek: 1.15,
  felvetelKoz: 30,
  epitesKoz: 60,
  dij: 1.3,
  kepez: true,
  terv: [
    ['biztonsag', (s, f) => 1 + Math.floor(f / 60)],
    ['bolt', (s, f) => 1 + Math.floor(f / 45)],
    ['etterem', (s, f) => 1 + Math.floor(f / 55)],
    ['wc', (s, f) => 1 + Math.floor(f / 100)],
    ['varo', (s, f) => 1 + Math.floor(f / 100)],
    ['takarito', (s, f) => 1 + Math.floor(f / 140)],
    ['konyvesbolt', (s, f) => (f > 60 ? 1 + Math.floor(f / 80) : 0)],
    ['poggyasz', (s, f) => 1 + Math.floor(f / 120)],
    ['vam', (s, f) => (vamKell(s) ? 1 + Math.floor(f / 80) : 0)],
    ['karbantarto', karbantartoCel],
    ['info', (s, f) => 1 + Math.floor(f / 300)],
    ['vip', (s, f) => 1 + Math.floor(f / 250)],
    ['seprupark', (s, f) => (f > 60 ? 1 + Math.floor(f / 200) : 0)],
    ['hoforras', (s, f) => (s.dimenzioNyitva('parazsmely') ? 1 + Math.floor(f / 200) : 0)],
    ['jegkamra', (s, f) => (s.dimenzioNyitva('fagyperem') ? 1 + Math.floor(f / 200) : 0)],
    ['reklam', 3],
  ],
  kutatas: ['fejlett_boltok', 'gyors_sorok', 'vip_ellatas', 'kapu_hangolas', 'stabil_kapuk', 'energia_halo', 'kapu_szkenner', 'ido_kotes', 'legendas_kapu'],
  kaputNyit: (sim) => sim.nyitottKapuk().length < 5,
  dontes: () => 1,
  esemeny: fizetosValasz(0.12),
});

/**
 * OLCSÓ — alacsony díj, tömeg-stratégia. Sok kapacitás, gyors sorok.
 * A tétel: a díjvonzerő (0,5-nél +75 % forgalom a v0.4-es görbén) többet hoz,
 * mint amennyit a díjkiesés visz.
 */
export const olcso = motor({
  nev: 'olcso',
  tartalek: 2200,
  dolgozoTartalek: 2500,
  kapuTartalek: 3500,
  kutatasTartalek: 10000,
  szintTartalek: 40000,
  energiaTartalek: 1.2,
  felvetelKoz: 25,
  epitesKoz: 50,
  dij: 0.6,
  kepez: false,
  terv: [
    ['biztonsag', (s, f) => 1 + Math.floor(f / 40)],
    ['wc', (s, f) => 1 + Math.floor(f / 60)],
    ['varo', (s, f) => 1 + Math.floor(f / 55)],
    ['etterem', (s, f) => 1 + Math.floor(f / 75)],
    ['bolt', (s, f) => 1 + Math.floor(f / 80)],
    ['takarito', (s, f) => 1 + Math.floor(f / 100)],
    ['poggyasz', (s, f) => 1 + Math.floor(f / 110)],
    ['info', (s, f) => 1 + Math.floor(f / 250)],
    ['karbantarto', karbantartoCel],
    ['vam', (s, f) => (vamKell(s) ? 1 + Math.floor(f / 70) : 0)],
    ['seprupark', (s, f) => (f > 50 ? 1 + Math.floor(f / 180) : 0)],
    ['konyvesbolt', (s, f) => (f > 90 ? 1 + Math.floor(f / 180) : 0)],
    ['hoforras', (s, f) => (s.dimenzioNyitva('parazsmely') ? 1 + Math.floor(f / 180) : 0)],
    ['jegkamra', (s, f) => (s.dimenzioNyitva('fagyperem') ? 1 + Math.floor(f / 180) : 0)],
    ['vip', 1],
  ],
  kutatas: ['gyors_sorok', 'takaritorobot', 'kapu_hangolas', 'auto_poggyasz', 'fejlett_boltok', 'stabil_kapuk', 'energia_halo', 'vip_ellatas'],
  kaputNyit: (sim) => sim.nyitottKapuk().length < 5,
  dontes: () => 1,
  esemeny: olcsoValasz(),
});

/**
 * NEMTÖRŐDÖM — a KONTROLLCSOPORT. Elengedi a fejezet-ablakokat és a
 * legolcsóbb esemény-választ adja, de SEMMIT nem épít, senkit nem vesz fel.
 *
 * ⚠️ Ennek ROSSZUL kell elsülnie. Ha ez is elboldogul, akkor a játékos
 * döntései nem számítanak — az a legsúlyosabb egyensúly-hiba, ami létezik.
 * SZÁNDÉKOSAN NEM HANGOLTAM ÚJRA: a kontrollcsoport akkor kontroll, ha nem
 * nyúlunk hozzá.
 */
export const nemtorodom = motor({
  nev: 'nemtorodom',
  tetlen: true,
  dontes: () => 0,
  esemeny: olcsoValasz(),
});

/**
 * KIEGYENSÚLYOZOTT — a „jó játékos" referencia. Ehhez képest mérjük a
 * többit: ha egy rossz stratégia is ilyen jól teljesít, nincs mit tanulni
 * a játékban.
 *
 * ⚠️ NEM SZABAD, HOGY SZERENCSÉS LEGYEN. Ezért nem kap semmi olyat, amit egy
 * ember ne látna a felületen: ugyanaz a telekrács, ugyanaz a döntési létra,
 * 10 tickenként egy lépés. A különbség kizárólag az arányokban van — annyi
 * biztonsági, amennyi a forgalomhoz kell, karbantartó a kapuk számához mérve,
 * takarító a koszhoz, és minden bevételre visszaforgatva.
 */
export const kiegyensulyozott = motor({
  nev: 'kiegyensulyozott',
  tartalek: 3000,
  dolgozoTartalek: 3000,
  kapuTartalek: 3000,
  kutatasTartalek: 9000,
  szintTartalek: 40000,
  energiaTartalek: 1.2,
  felvetelKoz: 30,
  epitesKoz: 55,
  dij: 1.0,
  kepez: true,
  terv: [
    ['biztonsag', (s, f) => 1 + Math.floor(f / 50)],
    ['wc', (s, f) => 1 + Math.floor(f / 80)],
    ['varo', (s, f) => 1 + Math.floor(f / 70)],
    ['etterem', (s, f) => 1 + Math.floor(f / 70)],
    ['bolt', (s, f) => 1 + Math.floor(f / 70)],
    ['takarito', (s, f) => 1 + Math.floor(f / 110)],
    ['info', (s, f) => 1 + Math.floor(f / 280)],
    ['poggyasz', (s, f) => 1 + Math.floor(f / 120)],
    ['karbantarto', karbantartoCel],
    ['vam', (s, f) => (vamKell(s) ? 1 + Math.floor(f / 80) : 0)],
    ['seprupark', (s, f) => (f > 50 ? 1 + Math.floor(f / 180) : 0)],
    ['konyvesbolt', (s, f) => 1 + Math.floor(f / 150)],
    ['hoforras', (s, f) => (s.dimenzioNyitva('parazsmely') ? 1 + Math.floor(f / 180) : 0)],
    ['jegkamra', (s, f) => (s.dimenzioNyitva('fagyperem') ? 1 + Math.floor(f / 180) : 0)],
    ['vip', (s, f) => 1 + Math.floor(f / 300)],
    ['orvos', 1],
    ['reklam', 2],
  ],
  kutatas: ['gyors_sorok', 'takaritorobot', 'kapu_hangolas', 'fejlett_boltok', 'stabil_kapuk', 'kristaly_takarek', 'energia_halo', 'auto_poggyasz', 'vip_ellatas', 'gyogyaszat', 'teleport_lift', 'kapu_szkenner', 'ido_kotes', 'legendas_kapu'],
  kaputNyit: (sim) => sim.nyitottKapuk().length < 2 || sim.mukodoEpuletVan('karbantarto'),
  dontes: () => 0,
  esemeny: fizetosValasz(0.15),
});

// ══════════════════════════════════════════════════════════════════════════
//  A NÉGY ÚJ ÁG (v0.5)
// ══════════════════════════════════════════════════════════════════════════

/**
 * EMELETES — korán épít emeletet, mozgólépcsőt és léghajó-kikötőt.
 *
 * A KÉRDÉS: megéri-e a függőleges terjeszkedés? Az emeleti padló szintenként
 * +110 %-kal drágább, az átjáró külön épület, a mozgólépcsőn a szintváltás
 * 40 tick — az utas türelméből. Cserébe a rács területe megháromszorozódik,
 * és a léghajó-kikötő KIZÁRÓLAG emeleten áll meg.
 *
 * A földszinten marad minden, ami KÖTELEZŐ ÚTVONAL (biztonsági, vám, poggyász):
 * ezeken mindenki átmegy, tehát a lépcső idejét mindenki kétszer fizetné meg.
 * Fölülre a RÁÉRŐS szolgáltatások mennek (bolt, könyvesbolt, VIP, váró) — aki
 * fölmegy, az azért megy, mert akar valamit.
 */
export const emeletes = motor({
  nev: 'emeletes',
  tartalek: 3000,
  dolgozoTartalek: 3000,
  kapuTartalek: 3500,
  kutatasTartalek: 11000,
  szintTartalek: 40000,
  emeletTartalek: 6000,
  energiaTartalek: 1.2,
  felvetelKoz: 30,
  epitesKoz: 55,
  dij: 1.0,
  kepez: true,
  emelet: true,
  emeletBlokk: 3,
  atjaroCel: (s, f) => 1 + Math.floor(f / 180),
  terv: [
    ['biztonsag', (s, f) => 1 + Math.floor(f / 50)],
    ['wc', (s, f) => 1 + Math.floor(f / 90)],
    ['takarito', (s, f) => 1 + Math.floor(f / 110)],
    ['etterem', (s, f) => 1 + Math.floor(f / 90)],
    ['poggyasz', (s, f) => 1 + Math.floor(f / 120)],
    ['karbantarto', karbantartoCel],
    ['vam', (s, f) => (vamKell(s) ? 1 + Math.floor(f / 80) : 0)],
    ['info', (s, f) => 1 + Math.floor(f / 280)],
    ['varo', (s, f) => 1 + Math.floor(f / 140)],
  ],
  emeletTerv: [
    ['varo', (s, f) => 1 + Math.floor(f / 140)],
    ['bolt', (s, f) => 1 + Math.floor(f / 70)],
    ['konyvesbolt', (s, f) => 1 + Math.floor(f / 150)],
    ['wc', (s, f) => Math.floor(f / 160)],
    ['seprupark', (s, f) => (f > 50 ? 1 + Math.floor(f / 180) : 0)],
    ['etterem', (s, f) => Math.floor(f / 160)],
    ['hoforras', (s, f) => (s.dimenzioNyitva('parazsmely') ? 1 : 0)],
    ['jegkamra', (s, f) => (s.dimenzioNyitva('fagyperem') ? 1 : 0)],
    ['vip', (s, f) => 1 + Math.floor(f / 300)],
  ],
  csatorna: ['leghajo'],
  csatornaTartalek: 8000,
  kutatas: ['gyors_sorok', 'takaritorobot', 'kapu_hangolas', 'fejlett_boltok', 'energia_halo', 'teleport_lift', 'stabil_kapuk', 'kristaly_takarek', 'vip_ellatas', 'auto_poggyasz', 'kapu_szkenner', 'ido_kotes', 'legendas_kapu'],
  kaputNyit: (sim) => sim.nyitottKapuk().length < 2 || sim.mukodoEpuletVan('karbantarto'),
  dontes: () => 0,
  esemeny: fizetosValasz(0.15),
});

/**
 * BÉRBEADÓ — mindent bérbe ad, amit lehet.
 *
 * A KÉRDÉS: versenyképes-e a passzív ág? A bérbe adott üzletbe a bérlő hozza a
 * személyzetet (nincs bér, nincs felvétel, és MINDIG 100 %-on megy — a
 * `hatekonysag` nem esik le személyzethiány miatt), cserébe a forgalmi
 * bevételnek csak 42 %-a marad nálunk, plusz napi ár·0,6 % fix bérleti díj.
 *
 * ⚠️ A `_pBerbead` NEM csak a boltra, étteremre, könyvesboltra és VIP-re megy:
 * minden olyan épületre, aminek van igénye ÉS pozitív díja — tehát a VÁM, a
 * POGGYÁSZ, a MOSDÓ és a SEPRŰPARKOLÓ is. Ez a stratégia mindet kiadja, mert
 * pont ezt kell megmérni.
 */
export const berbeado = motor({
  nev: 'berbeado',
  tartalek: 2500,
  dolgozoTartalek: 2500,
  kapuTartalek: 3000,
  kutatasTartalek: 9000,
  szintTartalek: 40000,
  energiaTartalek: 1.2,
  felvetelKoz: 30,
  epitesKoz: 45,
  dij: 1.0,
  kepez: false,           // a bérelt üzletben nincs kit képezni
  berbead: () => true,
  terv: [
    ['biztonsag', (s, f) => 1 + Math.floor(f / 50)],
    ['wc', (s, f) => 1 + Math.floor(f / 80)],
    ['varo', (s, f) => 1 + Math.floor(f / 70)],
    ['bolt', (s, f) => 1 + Math.floor(f / 55)],
    ['etterem', (s, f) => 1 + Math.floor(f / 60)],
    ['takarito', (s, f) => 1 + Math.floor(f / 110)],
    ['poggyasz', (s, f) => 1 + Math.floor(f / 100)],
    ['konyvesbolt', (s, f) => 1 + Math.floor(f / 110)],
    ['karbantarto', karbantartoCel],
    ['vam', (s, f) => (vamKell(s) ? 1 + Math.floor(f / 80) : 0)],
    ['info', (s, f) => 1 + Math.floor(f / 280)],
    ['seprupark', (s, f) => (f > 50 ? 1 + Math.floor(f / 150) : 0)],
    ['hoforras', (s, f) => (s.dimenzioNyitva('parazsmely') ? 1 + Math.floor(f / 180) : 0)],
    ['jegkamra', (s, f) => (s.dimenzioNyitva('fagyperem') ? 1 + Math.floor(f / 180) : 0)],
    ['vip', (s, f) => 1 + Math.floor(f / 250)],
    ['reklam', 3],
  ],
  kutatas: ['fejlett_boltok', 'takaritorobot', 'gyors_sorok', 'kapu_hangolas', 'stabil_kapuk', 'kristaly_takarek', 'energia_halo', 'vip_ellatas', 'kapu_szkenner', 'ido_kotes', 'legendas_kapu'],
  kaputNyit: (sim) => sim.nyitottKapuk().length < 2 || sim.mukodoEpuletVan('karbantarto'),
  dontes: () => 0,
  esemeny: fizetosValasz(0.15),
});

/**
 * CSATORNÁS — kapuk helyett vasútra, léghajóra és űrkapura épít.
 *
 * A KÉRDÉS: elég-e önmagában a „nyugodt" ág? A csatornáknak nincs
 * instabilitásuk, nem fogyasztanak kristályt, és nem kell hozzájuk
 * karbantartó. Cserébe fixek: az ütemüket az épület adja, nem a kapuszint,
 * és nincs belőlük több, mint három.
 *
 * ⚠️ EGY KAPUT NEM TUD ELKERÜLNI: a Zsibvásár ingyen kapuja a játék kezdetén
 * már áll. Ez a stratégia tehát nem „nulla kapu", hanem „egy kapu és három
 * csatorna" — és pont ez a kérdés lényege.
 */
export const csatornas = motor({
  nev: 'csatornas',
  tartalek: 2500,
  dolgozoTartalek: 2500,
  kutatasTartalek: 9000,
  szintTartalek: 40000,
  csatornaTartalek: 4000,
  emeletTartalek: 6000,
  energiaTartalek: 1.25,
  felvetelKoz: 30,
  epitesKoz: 55,
  dij: 1.0,
  kepez: true,
  emelet: true,
  emeletBlokk: 2,          // csak annyi, amennyi a léghajó-kikötőhöz kell
  atjaroCel: () => 1,
  csatorna: ['vasut', 'leghajo', 'urkapu'],
  terv: [
    ['biztonsag', (s, f) => 1 + Math.floor(f / 50)],
    ['wc', (s, f) => 1 + Math.floor(f / 80)],
    ['varo', (s, f) => 1 + Math.floor(f / 70)],
    ['etterem', (s, f) => 1 + Math.floor(f / 70)],
    ['bolt', (s, f) => 1 + Math.floor(f / 70)],
    ['takarito', (s, f) => 1 + Math.floor(f / 110)],
    ['poggyasz', (s, f) => 1 + Math.floor(f / 120)],
    ['vam', (s, f) => (vamKell(s) ? 1 + Math.floor(f / 80) : 0)],
    ['info', (s, f) => 1 + Math.floor(f / 280)],
    ['konyvesbolt', (s, f) => 1 + Math.floor(f / 150)],
    ['karbantarto', karbantartoCel],
    ['seprupark', (s, f) => (f > 50 ? 1 + Math.floor(f / 180) : 0)],
    ['vip', (s, f) => 1 + Math.floor(f / 300)],
    ['reklam', 2],
  ],
  emeletTerv: [
    ['varo', (s, f) => Math.floor(f / 200)],
    ['bolt', (s, f) => Math.floor(f / 200)],
  ],
  kutatas: ['gyors_sorok', 'takaritorobot', 'kapu_hangolas', 'fejlett_boltok', 'energia_halo', 'kristaly_takarek', 'stabil_kapuk', 'kapu_szkenner', 'vip_ellatas', 'auto_poggyasz', 'ido_kotes', 'legendas_kapu'],
  // ⚠️ EGYETLEN KIVÉTEL A SÁRKÁNYTRÓNUS. Az első változat semmilyen kaput nem
  // nyitott, és ettől a stratégia DEFINÍCIÓ SZERINT nem tudott nyerni: a VII.
  // fejezet feltétele a Sárkánytrónus nyitott kapuja. A 0/8 győzelem így nem
  // a csatorna-ágról mondott volna semmit, csak arról, hogy tiltottam neki a
  // győzelmet. Aki csatornákra épít, a történet végén ugyanúgy megnyitja azt
  // az egy legendás kaput — mást nem.
  kaputNyit: (sim, i) => DIMENZIOK[i].kod === 'sarkanytronus',
  // A VI. fejezet „lezárok egyet" ága a `legrosszabbNyitottDimenzio()`-t zárja
  // VÉGLEG — az pedig kihagyja a csatornákat, tehát nála az EGYETLEN valódi
  // kapuját (Zsibvásár) zárná be. Ezért ő a „mindet megtartom" ágat választja.
  dontes: (sim, fej) => (fej === 5 ? 1 : 0),
  esemeny: fizetosValasz(0.15),
});

/**
 * KUTATÓ — technológiára optimalizál, későn épít.
 *
 * A KÉRDÉS: kifizetődik-e a technológia? A kutatás pénzbe ÉS időbe kerül,
 * egyszerre csak egy fut, és amíg fut, a pénz nem épületben van. A v0.4-es
 * abláció szerint a legjobb öt technológia mind a KAPUKRÓL szól — ez a
 * stratégia ezt a sorrendet játssza ki maximálisan.
 */
export const kutato = motor({
  nev: 'kutato',
  tartalek: 1800,
  dolgozoTartalek: 2200,
  kapuTartalek: 3500,
  kutatasTartalek: 4000,           // szinte mindig kutat, ha van mit
  szintTartalek: 44000,
  energiaTartalek: 1.15,
  felvetelKoz: 35,
  epitesKoz: 90,                   // ritkábban épít: a pénz a laborban van
  dij: 1.0,
  kepez: true,
  kutatasElore: true,
  terv: [
    ['biztonsag', (s, f) => 1 + Math.floor(f / 70)],
    ['wc', (s, f) => 1 + Math.floor(f / 110)],
    ['varo', (s, f) => 1 + Math.floor(f / 100)],
    ['takarito', (s, f) => 1 + Math.floor(f / 140)],
    ['etterem', (s, f) => 1 + Math.floor(f / 100)],
    ['bolt', (s, f) => 1 + Math.floor(f / 100)],
    ['karbantarto', karbantartoCel],
    ['poggyasz', (s, f) => 1 + Math.floor(f / 150)],
    ['vam', (s, f) => (vamKell(s) ? 1 + Math.floor(f / 100) : 0)],
    ['info', (s, f) => 1 + Math.floor(f / 300)],
    ['konyvesbolt', (s, f) => (f > 90 ? 1 + Math.floor(f / 200) : 0)],
    ['seprupark', (s, f) => (f > 60 ? 1 + Math.floor(f / 200) : 0)],
    ['hoforras', (s, f) => (s.dimenzioNyitva('parazsmely') ? 1 + Math.floor(f / 200) : 0)],
    ['jegkamra', (s, f) => (s.dimenzioNyitva('fagyperem') ? 1 + Math.floor(f / 200) : 0)],
    ['orvos', 1],
    ['vip', 1],
  ],
  // A v0.4-es abláció rangsora, elölről: kapu_hangolas (+216 e), kristaly_takarek,
  // stabil_kapuk, kapu_szkenner (+300 e), ido_kotes — mind a KAPUKRÓL szól.
  kutatas: ['kapu_hangolas', 'takaritorobot', 'gyors_sorok', 'kristaly_takarek', 'stabil_kapuk', 'fejlett_boltok', 'energia_halo', 'kapu_szkenner', 'auto_poggyasz', 'ido_kotes', 'vip_ellatas', 'gyogyaszat', 'teleport_lift', 'legendas_kapu'],
  kaputNyit: (sim) => sim.nyitottKapuk().length < 2 || sim.mukodoEpuletVan('karbantarto'),
  dontes: () => 0,
  esemeny: fizetosValasz(0.15),
});

/** A mérésbe bevont stratégiák — a sorrend a jelentés táblázatainak sorrendje. */
export const JATEKOSOK = {
  nemtorodom,
  ovatos,
  terjeszkedo,
  bevetel_maximalizalo,
  olcso,
  kiegyensulyozott,
  emeletes,
  berbeado,
  csatornas,
  kutato,
};

export const JATEKOS_NEVEK = [
  'nemtorodom', 'ovatos', 'terjeszkedo', 'bevetel_maximalizalo', 'olcso',
  'kiegyensulyozott', 'emeletes', 'berbeado', 'csatornas', 'kutato',
];

/** Az épület-katalógus a jelentéshez (ár, hogy a megtérülést lehessen számolni). */
export function epuletArak() {
  const m = new Map();
  for (let i = 0; i < EPULETEK.length; i++) m.set(EPULETEK[i].kod, EPULETEK[i].ar);
  return m;
}
