// PORTAL HUB TYCOON — A SZIMULÁCIÓ.
//
// ── MIÉRT VAN EZ A FÁJL ───────────────────────────────────────────────────
// Ez a világ egyetlen igazsága. A render CSAK OLVASSA; ha hatni akar rá,
// parancsot ad (`sim.parancs({...})`). Ez a szigor nem esztétika:
//
//   • a parancsnapló + a seed = a teljes mentés (nem kell ezer utast menteni),
//   • a hibák újrajátszhatók (lásd `tools/det_szonda.mjs`),
//   • és a UI-t bármikor át lehet írni anélkül, hogy a gazdaság elcsúszna.
//
// ── A TICK SORRENDJE FIX ──────────────────────────────────────────────────
// A lépések sorrendje MAGA IS ÁLLAPOT: ha az épületek előbb szolgálnának ki,
// mint ahogy az utasok beállnak a sorba, egy tick csúszás keletkezne minden
// kiszolgálásban. Ezért a `lep()` sorrendje kommentelt, és NE cserélgesd.
//
// ── AMIT ITT SOSEM SZABAD ─────────────────────────────────────────────────
// `Math.random`, `Date.now`, `Math.sin/cos/atan2/pow/exp/log/hypot`, `window`,
// `three`. A `tools/det_szonda.mjs` ezek egy részét statikusan is kiszűri —
// ha bukik, NE a szondát írd át.

import {
  MAX_UTAS, KEZDO_PENZ, PADLO_AR, BONTAS_TERITES, KRISTALY_AR, KRISTALY_UTASONKENT,
  ARAMSZUNET_HATEKONYSAG, HIRNEV_KEZDO, HIRNEV_TEHETETLENSEG, NAP_TICK,
  KOSZ_KISZOLGALASONKENT, KOSZ_TAKARITAS, ERKEZES_ALAP_TICK, INSTABIL_NOVEKEDES,
  INSTABIL_UTASONKENT, INSTABIL_KARBANTARTAS, INSTABIL_HATAR, OSSZEOMLAS_SZUNET,
  KEZDO_CSARNOK_SZ, KEZDO_CSARNOK_M, RACS_SZ, RACS_M, RACS_SZINT, EMELET_FELAR,
  NEHEZSEGEK, nehezsegIdx, BERLET_RESZESEDES, BERLET_NAPIDIJ,
} from '../mag/config.js';
import { mulberry32, sulyozott, Osszeg } from '../mag/rng.js';
import { Racs } from './racs.js';
import { Utkereso } from './utkereses.js';
import { EPULETEK, epuletTipus, ujEpulet } from './epuletek.js';
import { FAJOK, FAJ_INDEX } from './lenyek.js';
import { DIMENZIOK, DIMENZIO_INDEX, ujDimenzioAllapot, dimenzioDij, dijVonzero } from './dimenziok.js';
import { DOLGOZOK, DOLGOZO_INDEX, ujDolgozo, dolgozoBer, dolgozoEro } from './dolgozok.js';
import { TECHNOLOGIAK, tech } from './kutatas.js';
import { ESEMENYEK } from './esemenyek.js';
import { FEJEZETEK, ujTortenet, vegtelenCel, korszakTerheles, rang } from './tortenet.js';
import { ALLAPOT, ujUtas, utastIndit, utasLep, elhagySort } from './utas.js';

/** Két esemény között ennyi tick telik el (alsó-felső határ). */
const ESEMENY_KOZ_MIN = 1500;
const ESEMENY_KOZ_MAX = 3200;

export class Sim {
  constructor(opciok = {}) {
    const seed = (opciok.seed | 0) || 20260804;
    this.seed = seed;
    /**
     * A nehézségi fokozat a világ ÁLLAPOTA, nem beállítás: a mentés viszi
     * magával, és az ellenőrző-összegben is benne van. Enélkül egy könnyű
     * módban mentett állomás normálon töltődne vissza, és a játékos a saját
     * mentésétől kapna büntetést.
     */
    this.nehezsegIdx = nehezsegIdx(opciok.nehezseg || 'normal');
    this.nehezseg = NEHEZSEGEK[this.nehezsegIdx];
    this.rnd = mulberry32(seed);
    this.tick = 0;
    this.nap = 1;
    /**
     * Csak a CSŐD állítja meg a világot. A győzelem nem: a v0.4-ig
     * megfagyasztotta az állomást, vagyis a jól játszó embertől pont akkor
     * vette el a játékot, amikor végre minden összeállt.
     */
    this.jatekVege = null;   // null | 'csod'
    /** Teljesítette-e a hét fejezetes ívet. */
    this.gyoztel = false;
    this.gyozelemTick = -1;
    /** A végtelen mód nyomás-szorzója (instabilitás, bérek). */
    this.korszakSzorzo = 1;

    this.racs = new Racs(RACS_SZ, RACS_M, RACS_SZINT);
    this.utkereso = new Utkereso(this.racs);

    // ── ÉPÜLETEK ──────────────────────────────────────────────────────────
    /** azon → épület vagy null. Az azonosító SOSEM használódik újra. */
    this.epuletek = [];
    this.kovEpuletAzon = 0;
    /** igénykód → épület-azonosítók tömbje (az utas-AI ezt olvassa). */
    this.igenyLista = new Map();
    this.portalok = [];
    this.csatornak = [];
    this.liftek = [];
    this._peronVerzio = -1;
    this._zonaVerzio = -1;

    // ── UTASOK ────────────────────────────────────────────────────────────
    // Előre feltöltött készlet: futás közben SOHA nem allokálunk utast.
    // Ezer lény mellett a GC-szünet pont a legrosszabb pillanatban jönne.
    this.utasok = new Array(MAX_UTAS);
    this.szabadSlotok = new Int32Array(MAX_UTAS);
    this.szabadDb = MAX_UTAS;
    for (let i = 0; i < MAX_UTAS; i++) {
      const u = ujUtas();
      u.azon = i;
      this.utasok[i] = u;
      this.szabadSlotok[i] = MAX_UTAS - 1 - i;
    }
    this.utasSzam = 0;
    this.csucsUtas = 0;

    // ── DOLGOZÓK ──────────────────────────────────────────────────────────
    this.dolgozok = [];
    this.kovDolgozoAzon = 0;

    // ── DIMENZIÓK ─────────────────────────────────────────────────────────
    this.dimenziok = DIMENZIOK.map((_, i) => ujDimenzioAllapot(i));
    this.erkezesSzorzoDim = new Float64Array(DIMENZIOK.length).fill(1);

    // ── GAZDASÁG ──────────────────────────────────────────────────────────
    this.penz = Math.round(KEZDO_PENZ * this.nehezseg.penz);
    this.hirnev = HIRNEV_KEZDO;
    this.kosz = 0;              // 0..1000
    this.koszTerheles = 0;      // extra hangulat-kopás ezredben
    this.energiaIgeny = 0;
    this.energiaTermeles = 0;
    this.aramszunet = false;
    this.energiaZavar = 1;
    this.hangulatZavar = 0;
    this.idoviharSzorzo = 1;
    this.kristalyArSzorzo = 1;
    this.kutatasKedvezmeny = 1;
    this.napiBevetel = 0;
    this.napiKoltseg = 0;
    this.elozoNap = { bevetel: 0, koltseg: 0 };
    /** Bevételi/kiadási bontás a mai napra: [cimke, összeg] párok. */
    this.tetelek = new Map();

    // ── KUTATÁS ───────────────────────────────────────────────────────────
    this.keszTechek = new Set();
    this.aktivKutatas = null;   // { kod, halad, ido }

    // ── ESEMÉNYEK ─────────────────────────────────────────────────────────
    this.aktivEsemenyek = [];
    this.varakozoValaszok = [];
    this.kovEsemenyAzon = 0;
    this.kovEsemenyTick = 1400;

    // ── TÖRTÉNET ──────────────────────────────────────────────────────────
    this.tortenet = ujTortenet();
    this.tortenetJelzok = new Set();

    // ── STATISZTIKA ───────────────────────────────────────────────────────
    this.elegedettTavozok = 0;
    this.duhosTavozok = 0;
    this.osszTavozo = 0;
    this.vipKiszolgalt = 0;
    this.hianyok = new Map();   // igénykód → hányszor nem volt meg
    this.naplok = [];           // { tick, szoveg, fajta }

    // ── PARANCSOK ─────────────────────────────────────────────────────────
    this.parancsSor = [];
    /** A teljes parancsnapló — ez + a seed a mentés. */
    this.napló = [];
    this.utolsoValasz = null;   // a UI visszajelzése (elutasítás oka)

    this._kezdoAllomas();
  }

  // ══════════════════════════════════════════════════════════════════════
  //  INDULÁS
  // ══════════════════════════════════════════════════════════════════════

  /**
   * A kezdő csarnok: egy kiépített padlótéglalap a rács közepén, és egy
   * ingyenes kapu a Zsibvásár-világra.
   *
   * MIÉRT KAP INGYEN KAPUT: mert az üres képernyő a legrosszabb első
   * benyomás. Az első percben legyen forgalom, amit a játékos ROSSZUL tud
   * kezelni — abból tanul, nem az üres rácsból.
   */
  _kezdoAllomas() {
    const x0 = ((RACS_SZ - KEZDO_CSARNOK_SZ) >> 1);
    const y0 = ((RACS_M - KEZDO_CSARNOK_M) >> 1);
    for (let j = 0; j < KEZDO_CSARNOK_M; j++) {
      for (let i = 0; i < KEZDO_CSARNOK_SZ; i++) this.racs.padlotLerak(x0 + i, y0 + j, 0);
    }
    this.kezdoX = x0; this.kezdoY = y0;
    const p = this._epuletetLerak('portal', x0 + 2, y0 + 2, 0, true);
    if (p) this._dimenziotKapuhozKot(p, DIMENZIO_INDEX.get('zsibvasar'), true);
    // Egy ingyen energiamag is jár. Nem nagylelkűség: áram nélkül az ELSŐ
    // épület is félsebességgel indulna, és a játékos azt hinné, hogy a
    // szolgáltatás rossz — pedig csak a láthatatlan energiamérleg bukott meg.
    this._epuletetLerak('energiamag', x0, y0 + KEZDO_CSARNOK_M - 2, 0, true);
    this.naplo('Az állomás megnyílt. A Zsibvásár-világ kapuja működik.', 'jo');
  }

  // ══════════════════════════════════════════════════════════════════════
  //  PARANCSOK — ez a világ EGYETLEN bemenete
  // ══════════════════════════════════════════════════════════════════════

  /** @param {object} p */
  parancs(p) {
    this.parancsSor.push(p);
    this.napló.push({ tick: this.tick, p });
  }

  _parancsokFeldolgoz() {
    const sor = this.parancsSor;
    for (let i = 0; i < sor.length; i++) this._parancsVegrehajt(sor[i]);
    sor.length = 0;
  }

  _elutasit(ok) { this.utolsoValasz = { rendben: false, ok }; return false; }
  _rendben(mit) { this.utolsoValasz = { rendben: true, ok: mit || '' }; return true; }

  _parancsVegrehajt(p) {
    switch (p.fajta) {
      case 'padlo': return this._pPadlo(p);
      case 'epit': return this._pEpit(p);
      case 'bont': return this._pBont(p);
      case 'kapcsol': return this._pKapcsol(p);
      case 'berbead': return this._pBerbead(p);
      case 'felvesz': return this._pFelvesz(p);
      case 'elbocsat': return this._pElbocsat(p);
      case 'beoszt': return this._pBeoszt(p);
      case 'dolgozo_fejleszt': return this._pDolgozoFejleszt(p);
      case 'kutat': return this._pKutat(p);
      case 'dim_szint': return this._pDimSzint(p);
      case 'dim_dij': return this._pDimDij(p);
      case 'dim_zar': return this._pDimZar(p);
      case 'esemeny_valasz': return this._pEsemenyValasz(p);
      case 'fejezet_tovabb': return this._pFejezetTovabb(p);
      case 'dontes': return this._pDontes(p);
      default: return this._elutasit('ismeretlen parancs');
    }
  }

  _pPadlo(p) {
    const z = p.z | 0;
    const sz = p.sz || 1, m = p.m || 1;
    let db = 0, alatamasztasHiany = 0;
    for (let j = 0; j < m; j++) {
      for (let i = 0; i < sz; i++) {
        const x = p.x + i, y = p.y + j;
        if (!this.racs.bent(x, y, z)) continue;
        if (this.racs.vanPadlo(x, y, z)) continue;
        if (this.racs.padloLerakhato(x, y, z)) db++;
        else alatamasztasHiany++;
      }
    }
    if (db === 0) {
      return this._elutasit(alatamasztasHiany > 0
        ? 'emeleti padló csak meglévő padló FÖLÉ kerülhet'
        : 'itt már van padló');
    }
    // Az emelet drágább: tartószerkezet kell alá. Ez tartja vissza attól,
    // hogy a felfelé építés mindig olcsóbb legyen az oldalirányúnál.
    const ar = Math.round(db * PADLO_AR * (1 + z * EMELET_FELAR));
    if (this.penz < ar) return this._elutasit('nincs elég pénz');
    for (let j = 0; j < m; j++) {
      for (let i = 0; i < sz; i++) this.racs.padlotLerak(p.x + i, p.y + j, z);
    }
    this.koltseg(ar, 'építkezés');
    return this._rendben();
  }

  _pEpit(p) {
    const t = epuletTipus(p.tipus);
    if (!t) return this._elutasit('ismeretlen épület');
    const z = p.z | 0;
    if (t.kutatas && !this.keszTechek.has(t.kutatas)) return this._elutasit('előbb kutasd ki');
    if (!this.racs.szabadTerulet(p.x, p.y, t.sz, t.m, z)) return this._elutasit('nincs itt hely (padló kell, épület nélkül)');
    // A léghajó-kikötő nem szállhat le a földszintre. A korlát nem
    // szeszély: enélkül az emeletek megépítése soha nem lenne KÖTELEZŐ,
    // csak kényelmes — a legjobb tartalom pedig ne opcionális legyen.
    if (t.minSzint !== undefined && z < t.minSzint) {
      return this._elutasit(`ez csak a(z) ${t.minSzint}. emelettől építhető`);
    }
    // Egy csatornából egy is elég: a második ugyanazt a hálózatot kötné be.
    if (t.csatorna) {
      const di = DIMENZIO_INDEX.get(t.csatorna);
      if (di !== undefined && this.dimenziok[di].nyitva) return this._elutasit('ez a hálózat már be van kötve');
    }
    // Az átjáró KÉT szintet foglal: a fölötte lévő emeletnek is állnia kell.
    if (t.atjaro) {
      if (z + 1 >= this.racs.szintek) return this._elutasit('nincs fölötte szint');
      if (!this.racs.szabadTerulet(p.x, p.y, t.sz, t.m, z + 1)) {
        return this._elutasit('a fölötte lévő szinten is kell hozzá szabad, kiépített padló');
      }
    }

    let ar = t.ar;
    let dimIdx = -1;
    if (p.tipus === 'portal') {
      if (p.dim === undefined || p.dim === null) return this._elutasit('válassz dimenziót a kapuhoz');
      dimIdx = typeof p.dim === 'string' ? DIMENZIO_INDEX.get(p.dim) : p.dim;
      if (dimIdx === undefined) return this._elutasit('ismeretlen dimenzió');
      const d = this.dimenziok[dimIdx];
      if (!d.felfedezve) return this._elutasit('ez a dimenzió még ismeretlen');
      if (d.lezarva) return this._elutasit('ez a világ VÉGLEG lezárult');
      if (d.nyitva) return this._elutasit('erre a világra már áll kapu');
      let nyitas = DIMENZIOK[dimIdx].nyitasAr;
      // A III. fejezet „megerősítés" ága drágábbá teszi a terjeszkedést —
      // ez az ára annak, hogy a hálózat stabil maradt.
      if (this.tortenetJelzok.has('megerosites')) nyitas = Math.round(nyitas * 1.6);
      ar += nyitas;
    }
    if (this.penz < ar) return this._elutasit('nincs elég pénz');

    const ep = this._epuletetLerak(p.tipus, p.x, p.y, z, false);
    if (!ep) return this._elutasit('nem sikerült lerakni');
    this.koltseg(ar, 'építkezés');
    if (dimIdx >= 0) this._dimenziotKapuhozKot(ep, dimIdx, false);
    // A csatorna magával hozza a saját „dimenzióját": nem kell külön
    // megnyitni, a megépített épület MAGA a kapcsolat.
    if (t.csatorna) {
      const di = DIMENZIO_INDEX.get(t.csatorna);
      if (di !== undefined) {
        this.dimenziok[di].felfedezve = true;
        this._dimenziotKapuhozKot(ep, di, false);
      }
    }
    return this._rendben();
  }

  _pBont(p) {
    const z = p.z | 0;
    const azon = this.racs.epuletAzon(p.x, p.y, z);
    if (azon < 0) {
      // Nincs épület: akkor padlót bontunk.
      if (!this.racs.vanPadlo(p.x, p.y, z)) return this._elutasit('itt nincs mit bontani');
      if (!this.racs.padlotBont(p.x, p.y, z)) {
        return this._elutasit(this.racs.vanPadlo(p.x, p.y, z + 1)
          ? 'előbb a fölötte lévő emeletet kell elbontani'
          : 'épület áll rajta');
      }
      this.bevetel(Math.round(PADLO_AR * BONTAS_TERITES * (1 + z * EMELET_FELAR)), 'bontás');
      return this._rendben();
    }
    const ep = this.epuletek[azon];
    if (!ep) return this._elutasit('itt nincs mit bontani');
    const t = EPULETEK[ep.tipusIdx];
    this._epuletetElvesz(ep);
    this.bevetel(Math.round(t.ar * BONTAS_TERITES), 'bontás');
    return this._rendben();
  }

  _pKapcsol(p) {
    const ep = this.epuletek[p.azon];
    if (!ep) return this._elutasit('nincs ilyen épület');
    ep.kikapcsolva = !ep.kikapcsolva;
    return this._rendben();
  }

  /**
   * Bérbeadás ki/be. Csak olyan épületre, aminek VAN díja — a mosdót és a
   * várót nem venné ki senki, a kaput meg végképp nem.
   */
  _pBerbead(p) {
    const ep = this.epuletek[p.azon];
    if (!ep) return this._elutasit('nincs ilyen épület');
    const t = EPULETEK[ep.tipusIdx];
    if (!t.igeny || t.dij <= 0) return this._elutasit('ezt az épületet nem lehet bérbe adni');
    ep.berbeadva = !ep.berbeadva;
    if (ep.berbeadva) {
      // A bérlő hozza a saját embereit: a mi dolgozóink felszabadulnak.
      // Ha bent maradnának, tovább fizetnénk a bérüket egy olyan üzletben,
      // ami már nem is a miénk — ez a fajta némán szivárgó költség a
      // legrosszabb, mert semmi nem hívja fel rá a figyelmet.
      for (let i = ep.dolgozok.length - 1; i >= 0; i--) {
        const d = this._dolgozo(ep.dolgozok[i]);
        if (d) d.epuletAzon = -1;
      }
      ep.dolgozok.length = 0;
    }
    return this._rendben();
  }

  _pFelvesz(p) {
    const idx = DOLGOZO_INDEX.get(p.tipus);
    if (idx === undefined) return this._elutasit('ismeretlen szakma');
    const belepo = DOLGOZOK[idx].ber * 3;
    if (this.penz < belepo) return this._elutasit('nincs elég pénz a belépőre');
    this.koltseg(belepo, 'felvétel');
    const d = ujDolgozo(this.kovDolgozoAzon++, p.tipus, this.kezdoX + 1.5, this.kezdoY + 1.5);
    this.dolgozok.push(d);
    // Ha van illő, alulfoglalkoztatott épület, oda is osztjuk azonnal. A
    // játékos így nem kényszerül két kattintásra a leggyakoribb esetben.
    const cel = this._szabadMunkahely(p.tipus);
    if (cel) this._beoszt(d, cel);
    return this._rendben();
  }

  _pElbocsat(p) {
    for (let i = 0; i < this.dolgozok.length; i++) {
      if (this.dolgozok[i].azon !== p.azon) continue;
      const d = this.dolgozok[i];
      if (d.epuletAzon >= 0) {
        const ep = this.epuletek[d.epuletAzon];
        if (ep) {
          const k = ep.dolgozok.indexOf(d.azon);
          if (k >= 0) ep.dolgozok.splice(k, 1);
        }
      }
      this.dolgozok.splice(i, 1);
      return this._rendben();
    }
    return this._elutasit('nincs ilyen dolgozó');
  }

  _pBeoszt(p) {
    const d = this._dolgozo(p.dolgozo);
    if (!d) return this._elutasit('nincs ilyen dolgozó');
    const ep = p.epulet >= 0 ? this.epuletek[p.epulet] : null;
    if (p.epulet >= 0 && !ep) return this._elutasit('nincs ilyen épület');
    if (ep && ep.berbeadva) return this._elutasit('a bérbe adott üzletbe a bérlő hozza a személyzetet');
    this._beoszt(d, ep);
    return this._rendben();
  }

  _pDolgozoFejleszt(p) {
    const d = this._dolgozo(p.azon);
    if (!d) return this._elutasit('nincs ilyen dolgozó');
    if (d.szint >= 3) return this._elutasit('már a legmagasabb szinten van');
    const ar = DOLGOZOK[d.tipusIdx].ber * 8 * d.szint;
    if (this.penz < ar) return this._elutasit('nincs elég pénz');
    this.koltseg(ar, 'képzés');
    d.szint++;
    return this._rendben();
  }

  _pKutat(p) {
    if (this.aktivKutatas) return this._elutasit('már fut egy kutatás');
    const t = tech(p.kod);
    if (!t) return this._elutasit('ismeretlen technológia');
    if (this.keszTechek.has(p.kod)) return this._elutasit('már kész');
    for (let i = 0; i < t.fuggo.length; i++) {
      if (!this.keszTechek.has(t.fuggo[i])) return this._elutasit('hiányzik egy előfeltétel');
    }
    const ar = Math.round(t.ar * this.kutatasKedvezmeny);
    if (this.penz < ar) return this._elutasit('nincs elég pénz');
    this.koltseg(ar, 'kutatás');
    this.aktivKutatas = { kod: p.kod, halad: 0, ido: t.ido };
    return this._rendben();
  }

  _pDimSzint(p) {
    const i = typeof p.kod === 'string' ? DIMENZIO_INDEX.get(p.kod) : p.kod;
    if (i === undefined) return this._elutasit('ismeretlen dimenzió');
    const d = this.dimenziok[i];
    if (!d.nyitva) return this._elutasit('nincs nyitva ez a kapu');
    if (d.szint >= 5) return this._elutasit('már a legmagasabb szinten');
    // 1800-ról 6000-re: a mérés szerint MINDEN kapu 5/5-ös lett minden
    // stratégiánál (átlag 5,0) — vagyis ez nem volt döntés, csak adminisztráció.
    const ar = Math.round(6000 * d.szint * (1 + DIMENZIOK[i].veszely * 0.3));
    if (this.penz < ar) return this._elutasit('nincs elég pénz');
    this.koltseg(ar, 'kapufejlesztés');
    d.szint++;
    // A fejlesztés meg is rázza a kaput: nagyobb átjáró, nagyobb feszültség.
    // Csatornánál nincs mit megrázni — ott a fejlesztés csak sínt és járatot ad.
    if (!DIMENZIOK[i].csatorna) d.instabilitas = Math.min(INSTABIL_HATAR - 1, d.instabilitas + 60);
    return this._rendben();
  }

  _pDimDij(p) {
    const i = typeof p.kod === 'string' ? DIMENZIO_INDEX.get(p.kod) : p.kod;
    if (i === undefined) return this._elutasit('ismeretlen dimenzió');
    const sz = p.szorzo;
    if (!(sz >= 0.5 && sz <= 1.5)) return this._elutasit('a szorzó 0,5 és 1,5 közé eshet');
    // Két tizedesre kerekítünk: a csúszka folytonos, a szimuláció ne legyen az.
    this.dimenziok[i].dijSzorzo = Math.round(sz * 100) / 100;
    return this._rendben();
  }

  _pDimZar(p) {
    const i = typeof p.kod === 'string' ? DIMENZIO_INDEX.get(p.kod) : p.kod;
    if (i === undefined) return this._elutasit('ismeretlen dimenzió');
    if (!this.dimenziok[i].nyitva) return this._elutasit('ez a kapu nincs nyitva');
    this.dimenziotLezar(i, !!p.vegleg);
    return this._rendben();
  }

  _pEsemenyValasz(p) {
    for (let i = 0; i < this.varakozoValaszok.length; i++) {
      const e = this.varakozoValaszok[i];
      if (e.azon !== p.azon) continue;
      const def = ESEMENYEK[e.idx];
      const v = def.valaszok && def.valaszok[p.valasz];
      if (!v) return this._elutasit('ismeretlen válasz');
      if (v.ar > this.penz) return this._elutasit('nincs elég pénz erre a válaszra');
      if (v.ar > 0) this.koltseg(v.ar, 'esemény');
      v.hatas(this, e);
      this.varakozoValaszok.splice(i, 1);
      return this._rendben();
    }
    return this._elutasit('ez az esemény már lezárult');
  }

  _pFejezetTovabb() {
    if (this.tortenet.allapot !== 'bevezeto') return this._elutasit('nincs mit továbbengedni');
    this.tortenet.allapot = 'fut';
    return this._rendben();
  }

  _pDontes(p) {
    const t = this.tortenet;
    if (t.allapot !== 'dontes') return this._elutasit('most nincs döntés');
    const f = FEJEZETEK[t.fejezet];
    const v = f.dontes && f.dontes.valaszok[p.valasz];
    if (!v) return this._elutasit('ismeretlen válasz');
    v.hatas(this);
    if (f.jutalom) f.jutalom(this);
    this._fejezetTovabb();
    return this._rendben();
  }

  // ══════════════════════════════════════════════════════════════════════
  //  ÉPÜLET-KEZELÉS
  // ══════════════════════════════════════════════════════════════════════

  _epuletetLerak(kod, x, y, z, ingyen) {
    const t = epuletTipus(kod);
    if (!t) return null;
    if (!this.racs.szabadTerulet(x, y, t.sz, t.m, z)) return null;
    if (t.atjaro && !this.racs.szabadTerulet(x, y, t.sz, t.m, z + 1)) return null;
    const azon = this.kovEpuletAzon++;
    const ep = ujEpulet(azon, kod, x, y, z);
    this.epuletek[azon] = ep;
    this.racs.bejegyez(azon, x, y, t.sz, t.m, z, !!t.atjaro);
    // Az átjáró a fölötte lévő szinten is ott van — ugyanazzal az
    // azonosítóval, hogy a bontás és a kijelölés egy egységként kezelje.
    if (t.atjaro) this.racs.bejegyez(azon, x, y, t.sz, t.m, z + 1, true);
    this._listakUjra();
    return ep;
  }

  _epuletetElvesz(ep) {
    // A bent lévő és sorban álló utasokat el kell engedni, különben örökre
    // egy nem létező épületre várnának — ez a fajta szivárgás csak fél óra
    // játék után látszik meg, „miért nem mozdul ez a húsz lény?" alakban.
    for (let i = 0; i < ep.sor.length; i++) {
      const u = this.utasok[ep.sor[i]];
      if (u && u.aktiv) { u.allapot = ALLAPOT.DONT; u.celEpulet = -1; }
    }
    for (let i = 0; i < ep.bent.length; i++) {
      const u = this.utasok[ep.bent[i]];
      if (u && u.aktiv) { u.allapot = ALLAPOT.DONT; u.celEpulet = -1; }
    }
    ep.sor.length = 0; ep.bent.length = 0;
    for (let i = 0; i < ep.dolgozok.length; i++) {
      const d = this._dolgozo(ep.dolgozok[i]);
      if (d) d.epuletAzon = -1;
    }
    if (ep.dimenzio >= 0) {
      const d = this.dimenziok[ep.dimenzio];
      d.nyitva = false;
      d.portalAzon = -1;
    }
    // Csatorna-épület bontása egyben a hálózat lekapcsolása is.
    {
      const t = EPULETEK[ep.tipusIdx];
      if (t.csatorna) {
        const di = DIMENZIO_INDEX.get(t.csatorna);
        if (di !== undefined) { this.dimenziok[di].nyitva = false; this.dimenziok[di].portalAzon = -1; }
      }
    }
    this.racs.torol(ep.x, ep.y, ep.sz, ep.m, ep.z);
    if (ep.szintek > 1) this.racs.torol(ep.x, ep.y, ep.sz, ep.m, ep.z + 1);
    this.epuletek[ep.azon] = null;
    this.utkereso.elfelejt(ep.azon);
    this._listakUjra();
  }

  /** Az igény-, portál- és liftlisták újraépítése. Csak változáskor fut. */
  _listakUjra() {
    this.igenyLista.clear();
    this.portalok.length = 0;
    this.csatornak.length = 0;
    this.liftek.length = 0;
    this.hoForrasok = [];
    for (let a = 0; a < this.epuletek.length; a++) {
      const ep = this.epuletek[a];
      if (!ep) continue;
      const t = EPULETEK[ep.tipusIdx];
      if (t.igeny) {
        let l = this.igenyLista.get(t.igeny);
        if (!l) { l = []; this.igenyLista.set(t.igeny, l); }
        l.push(ep.azon);
      }
      if (ep.kod === 'portal') this.portalok.push(ep.azon);
      if (t.csatorna) this.csatornak.push(ep.azon);
      if (ep.kod === 'teleportlift') this.liftek.push(ep.azon);
      if (t.zona) {
        this.hoForrasok.push({ x: ep.x, y: ep.y, z: ep.z, sz: ep.sz, m: ep.m, ho: t.zona.ho, hideg: t.zona.hideg, sugar: t.zona.sugar });
      }
    }
    this._zonaVerzio = -1;   // a zónamezők újraszámolása kell
    this._peronVerzio = -1;
  }

  /** Peronok újraszámolása, ha változott a rács. */
  _peronokFrissit() {
    if (this._peronVerzio === this.racs.verzio) return;
    for (let a = 0; a < this.epuletek.length; a++) {
      const ep = this.epuletek[a];
      if (!ep) continue;
      this.racs.peron(ep.x, ep.y, ep.sz, ep.m, ep.z, ep.peron);
    }
    this._peronVerzio = this.racs.verzio;
  }

  _zonakFrissit() {
    if (this._zonaVerzio === this.racs.verzio) return;
    this.racs.zonakatSzamol(this.hoForrasok || []);
    this._zonaVerzio = this.racs.verzio;
  }

  _dimenziotKapuhozKot(ep, dimIdx, ingyen) {
    const d = this.dimenziok[dimIdx];
    ep.dimenzio = dimIdx;
    d.nyitva = true;
    d.portalAzon = ep.azon;
    d.szunet = 0;
    if (!ingyen) this.naplo(`Megnyílt a kapu: ${DIMENZIOK[dimIdx].nev}.`, 'jo');
  }

  _szabadMunkahely(tipusKod) {
    for (let a = 0; a < this.epuletek.length; a++) {
      const ep = this.epuletek[a];
      if (!ep) continue;
      // A bérbe adott üzletbe NEM osztunk embert: a bérlő hozza a sajátját.
      // Az első változat ezt nem szűrte, és a felszabadított dolgozó a
      // következő felvételnél azonnal visszakerült ugyanoda — fizettük a
      // bérét egy olyan boltban, ami már nem is a miénk. A szonda 8.
      // vizsgálata pont ezt kapta el.
      if (ep.berbeadva) continue;
      const t = EPULETEK[ep.tipusIdx];
      if (t.fajta !== tipusKod) continue;
      if (ep.dolgozok.length < t.szemelyzet) return ep;
    }
    return null;
  }

  _beoszt(d, ep) {
    if (d.epuletAzon >= 0) {
      const regi = this.epuletek[d.epuletAzon];
      if (regi) {
        const k = regi.dolgozok.indexOf(d.azon);
        if (k >= 0) regi.dolgozok.splice(k, 1);
      }
    }
    d.epuletAzon = ep ? ep.azon : -1;
    if (ep) ep.dolgozok.push(d.azon);
  }

  _dolgozo(azon) {
    for (let i = 0; i < this.dolgozok.length; i++) if (this.dolgozok[i].azon === azon) return this.dolgozok[i];
    return null;
  }

  // ══════════════════════════════════════════════════════════════════════
  //  A TICK
  // ══════════════════════════════════════════════════════════════════════

  lep() {
    if (this.jatekVege) return;
    this._parancsokFeldolgoz();      // 1. a bemenet MINDIG a tick elején
    this._peronokFrissit();          // 2. a rács változásainak leképezése
    this._zonakFrissit();
    this.utkereso.ujTick();
    this._energiaSzamol();           // 3. mit tud ma az állomás
    this._tomegSzamol();             // 4. hol áll a tömeg (a mozgás ezt olvassa)
    this._portalokLep();             // 5. érkezések a kapukon
    this._csatornakLep();            // 5b. …és a vasúton / léghajón / űrkapun
    this._utasokLep();               // 6. az AI
    this._epuletekLep();             // 7. sorok, kiszolgálás, fizetés
    this._dolgozokLep();             // 8. karbantartás, takarítás, mozgás
    this._kutatasLep();              // 9.
    this._esemenyekLep();            // 10.
    this._tortenetLep();             // 11.
    if (this.tick > 0 && this.tick % NAP_TICK === 0) this._napiElszamolas();
    this.tick++;
  }

  // ── ENERGIA ──────────────────────────────────────────────────────────────
  _energiaSzamol() {
    if (this.tick % 10 !== 0) return;
    let igeny = 0, termeles = 0;
    for (let a = 0; a < this.epuletek.length; a++) {
      const ep = this.epuletek[a];
      if (!ep || ep.kikapcsolva) continue;
      const t = EPULETEK[ep.tipusIdx];
      igeny += t.energia || 0;
      if (t.termel) {
        const szereloBonusz = ep.dolgozok.length > 0 ? 1 : 0.78;
        termeles += t.termel * (this.kesz('energia_halo') ? 1.6 : 1) * szereloBonusz;
      }
    }
    this.energiaIgeny = Math.round(igeny);
    this.energiaTermeles = Math.round(termeles * this.energiaZavar);
    this.aramszunet = this.energiaIgeny > this.energiaTermeles;

    // Hatékonyság: személyzet + áram. Egy épület sosem esik 15 % alá, mert a
    // teljesen halott épület a játékosnak nem visszajelzés, hanem büntetés.
    for (let a = 0; a < this.epuletek.length; a++) {
      const ep = this.epuletek[a];
      if (!ep) continue;
      const t = EPULETEK[ep.tipusIdx];
      let h = 1;
      // A bérbe adott üzlet a bérlő gondja: mindig teljes létszámmal megy.
      if (t.szemelyzet > 0 && !ep.berbeadva) {
        let ero = 0;
        for (let i = 0; i < ep.dolgozok.length; i++) {
          const d = this._dolgozo(ep.dolgozok[i]);
          if (d) ero += dolgozoEro(d);
        }
        let kell = t.szemelyzet;
        if (ep.kod === 'poggyasz' && this.kesz('auto_poggyasz')) kell = Math.ceil(kell / 2);
        h = Math.min(1, ero / kell);
      }
      if (this.aramszunet) h *= ARAMSZUNET_HATEKONYSAG;
      if (ep.kikapcsolva) h = 0;
      ep.hatekonysag = Math.max(ep.kikapcsolva ? 0 : 0.15, h);
    }
  }

  _tomegSzamol() {
    const racs = this.racs;
    racs.tomegNullaz();
    for (let i = 0; i < this.utasok.length; i++) {
      const u = this.utasok[i];
      if (!u.aktiv || u.allapot === ALLAPOT.KISZOLGALAS) continue;
      const x = Math.floor(u.x), y = Math.floor(u.y);
      if (!racs.bent(x, y, u.z)) continue;
      const k = (u.z * racs.m + y) * racs.sz + x;
      const uj = racs.tomeg[k] + FAJOK[u.fajIdx].helyIgeny;
      racs.tomeg[k] = uj > 255 ? 255 : uj;
    }
  }

  // ── PORTÁLOK / ÉRKEZÉS ──────────────────────────────────────────────────
  _portalokLep() {
    const kapuHangolas = this.kesz('kapu_hangolas') ? 1.25 : 1;
    const terjeszkedes = this.tortenetJelzok.has('terjeszkedes') ? 1.2 : 1;
    const mindetTartom = this.tortenetJelzok.has('mindet_tartom') ? 1.25 : 1;
    // A hírnév alsó padlója 0,45 volt — vagyis egy NULLA hírnevű, mindenkit
    // elkergető állomás is megkapta a forgalom 45 %-át. Mérve: a
    // „terjeszkedő" stratégia 0,3-as hírnévvel, 97 %-ban dühös vendégekkel is
    // a jó játékos vagyonának 59 %-át hozta, a „nemtörődöm" kontroll pedig
    // napi ~375 tallért KERESETT egy üres állomáson. A jutalom megvolt, a
    // büntetés nem. Az új görbe 0-nál 0,12, 100-nál 1,57 — a hírnév végre számít.
    const hirnevSzorzo = 0.12 + this.hirnev / 100 * 1.45;

    for (let i = 0; i < this.portalok.length; i++) {
      const ep = this.epuletek[this.portalok[i]];
      if (!ep || ep.dimenzio < 0 || ep.kikapcsolva) continue;
      const d = this.dimenziok[ep.dimenzio];
      if (!d.nyitva) continue;
      if (DIMENZIOK[d.idx].csatorna) continue;   // azt a `_csatornakLep()` viszi

      // ── INSTABILITÁS ────────────────────────────────────────────────────
      if (d.szunet > 0) { d.szunet--; if (d.szunet === 0) this.naplo(`${DIMENZIOK[d.idx].nev}: a kapu újra működik.`, 'jo'); continue; }
      let nov = INSTABIL_NOVEKEDES * DIMENZIOK[d.idx].veszely * 0.01;
      if (this.kesz('stabil_kapuk')) nov *= 0.65;
      if (this.tortenetJelzok.has('megerosites')) nov *= 0.75;
      if (this.tortenetJelzok.has('terjeszkedes')) nov *= 1.35;
      if (this.tortenetJelzok.has('mindet_tartom')) nov *= 1.5;
      nov *= this.nehezseg.instabil * this.korszakSzorzo;
      d.instabilitas += nov;
      if (d.instabilitas >= INSTABIL_HATAR) { this._kapuOsszeomlas(d); continue; }

      // ── ÉRKEZÉS ─────────────────────────────────────────────────────────
      if (ep.peron.length === 0) continue;
      if (this.szabadDb === 0) continue;
      ep.visszaszamlalo--;
      if (ep.visszaszamlalo > 0) continue;

      const utem = ERKEZES_ALAP_TICK / this.nehezseg.erkezes
        / (d.szint * 0.35 + 0.65)
        / (kapuHangolas * terjeszkedes * mindetTartom)
        / Math.max(0.08, hirnevSzorzo * dijVonzero(d) * this.erkezesSzorzoDim[d.idx])
        / Math.max(0.4, ep.hatekonysag);
      // ±25 % szórás, hogy ne óramű-pontosan érkezzenek.
      ep.visszaszamlalo = Math.max(4, Math.round(utem * (0.75 + this.rnd() * 0.5)));

      this._utastErkeztet(ep, d);
    }
  }

  /**
   * Vasút, léghajó, űrkapu. Ugyanaz az érkezés, három különbséggel: nincs
   * instabilitás, nincs kristályfogyasztás, és az ütemet az ÉPÜLET adja, nem
   * a dimenzió szintje. Ettől lesz a csatorna a „nyugodt" bevételi ág: kevés
   * gond, kiszámítható pénz — cserébe nincs benne a történet.
   */
  _csatornakLep() {
    const hirnevSzorzo = 0.12 + this.hirnev / 100 * 1.45;
    for (let i = 0; i < this.csatornak.length; i++) {
      const ep = this.epuletek[this.csatornak[i]];
      if (!ep || ep.kikapcsolva || ep.peron.length === 0) continue;
      const t = EPULETEK[ep.tipusIdx];
      const di = DIMENZIO_INDEX.get(t.csatorna);
      if (di === undefined) continue;
      const d = this.dimenziok[di];
      if (!d.nyitva) continue;
      if (this.szabadDb === 0) continue;
      ep.visszaszamlalo--;
      if (ep.visszaszamlalo > 0) continue;
      const utem = t.csatornaUtem / this.nehezseg.erkezes
        / (d.szint * 0.6 + 0.4)
        / Math.max(0.1, hirnevSzorzo * dijVonzero(d))
        / Math.max(0.4, ep.hatekonysag);
      ep.visszaszamlalo = Math.max(5, Math.round(utem * (0.75 + this.rnd() * 0.5)));
      this._utastErkeztet(ep, d, -1);
    }
  }

  _utastErkeztet(ep, d, fajKenyszer = -1) {
    // ⚠️ A CSATORNASÁG A DIMENZIÓBÓL JÖN, NEM PARAMÉTERBŐL. Az első változat
    // zászlóként adta át, és a `sarkanytIndit()` — ami a legmagasabb díjú
    // nyitott kaput választja — elfelejtette átadni. A léghajó díja (74)
    // magasabb a kezdő kapukénál, tehát a sárkány a LÉGHAJÓ-kikötőn érkezett
    // be, és instabilitást írt egy olyan hálózatra, aminek definíció szerint
    // nincs. A szonda 9. vizsgálata kapta el („csatorna romlik: leghajo").
    // Egy igazságot egy helyen kell tárolni; ez itt a katalógus.
    const csatorna = !!DIMENZIOK[d.idx].csatorna;
    if (this.szabadDb === 0) return null;
    const cella = ep.peron[(d.osszUtas + ep.azon) % ep.peron.length];
    const x = this.racs.cellaX(cella) + 0.5;
    const y = this.racs.cellaY(cella) + 0.5;
    const z = this.racs.cellaZ(cella);
    const slot = this.szabadSlotok[--this.szabadDb];
    const u = this.utasok[slot];
    utastIndit(this, u, d.idx, x, y, z, fajKenyszer);
    this.utasSzam++;
    if (this.utasSzam > this.csucsUtas) this.csucsUtas = this.utasSzam;

    // Portáldíj + kristályköltség. A kettő itt van egymás mellett, hogy a
    // kapu haszna és ára EGY helyen legyen látható a kódban is.
    d.osszUtas++;
    const dij = dimenzioDij(d);
    this.bevetel(dij, 'portáldíj');
    d.bevetel += dij;
    if (!csatorna) {
      const takarek = this.kesz('kristaly_takarek') ? 0.6 : 1;
      const magusok = this.dolgozoSzamTipus('magus');
      const kristaly = KRISTALY_AR * this.kristalyArSzorzo * KRISTALY_UTASONKENT * takarek / (1 + magusok * 0.12);
      this.koltseg(kristaly, 'kristály');
      d.instabilitas += INSTABIL_UTASONKENT * 0.01 * DIMENZIOK[d.idx].veszely;
    }
    return u;
  }

  _kapuOsszeomlas(d) {
    d.instabilitas = 380;
    d.szunet = OSSZEOMLAS_SZUNET;
    const kar = 900 + Math.round(this.rnd() * 900);
    this.koltseg(kar, 'kapuomlás');
    this.hirnevValt(-11);
    this.naplo(`ÖSSZEOMLOTT a kapu: ${DIMENZIOK[d.idx].nev}. Kár: ${kar}. Kell egy karbantartó.`, 'baj');
  }

  // ── UTASOK ──────────────────────────────────────────────────────────────
  _utasokLep() {
    const utasok = this.utasok;
    for (let i = 0; i < utasok.length; i++) {
      const u = utasok[i];
      if (!u.aktiv) continue;
      if (u.allapot === ALLAPOT.KILEP) { this._utastElenged(u); continue; }
      utasLep(this, u);
      if (u.allapot === ALLAPOT.KILEP) this._utastElenged(u);
    }
    this.koszTerheles = this.kosz * 0.006 + this.hangulatZavar;
  }

  _utastElenged(u) {
    elhagySort(this, u);
    // A hírnév a TÁVOZÓK hangulatából épül, nem a jelenlévőkéből. Aki még
    // bent van, még megnyugodhat — az ítéletet a kijárat mondja ki.
    const cel = u.hangulat / 10;
    // ── A HÍRNÉV LENDÜLETE AZ ÁLLOMÁS MÉRETÉTŐL FÜGG ──────────────────────
    // A hírnév a távozók hangulatából épül, tehát KEVÉS távozó = lassú
    // mozgás. Ez egy fix léptékkel halálspirált csinál: mérve, kilenc olyan
    // futásból, ahol a hírnév 20 alá esett, EGY jött vissza 40 fölé. Aki
    // egyszer elrontotta, annak nem volt visszaút — csak egy hosszú,
    // reménytelen lejtő.
    //
    // A javítás nem ajándék, hanem realizmus: egy kis állomás híre
    // MINDKÉT irányban gyorsabban mozog, mert kevesebb vendég emléke van
    // benne. Nullánál négyszeres, ötszáz utasnál alig másfélszeres lépés.
    const lendulet = HIRNEV_TEHETETLENSEG * (1 + 60 / (20 + this.utasSzam));
    this.hirnev += (cel - this.hirnev) * lendulet;
    if (this.hirnev < 0) this.hirnev = 0;
    if (this.hirnev > 100) this.hirnev = 100;
    this.osszTavozo++;
    if (u.hangulat >= 550) this.elegedettTavozok++;
    else if (u.hangulat < 300) this.duhosTavozok++;
    u.aktiv = false;
    u.terv.length = 0;
    this.szabadSlotok[this.szabadDb++] = u.azon;
    this.utasSzam--;
  }

  // ── ÉPÜLETEK ────────────────────────────────────────────────────────────
  _epuletekLep() {
    const gyorsSorok = this.kesz('gyors_sorok') ? 0.8 : 1;
    const boltBonusz = this.kesz('fejlett_boltok') ? 1.3 : 1;
    const orok = this.dolgozoSzamTipus('or');

    for (let a = 0; a < this.epuletek.length; a++) {
      const ep = this.epuletek[a];
      if (!ep) continue;
      const t = EPULETEK[ep.tipusIdx];
      if (!t.igeny || ep.kikapcsolva) continue;

      // 1. Beengedés a sorból.
      while (ep.bent.length < t.kapacitas && ep.sor.length > 0) {
        const uid = ep.sor.shift();
        const u = this.utasok[uid];
        if (!u || !u.aktiv || u.allapot !== ALLAPOT.SORBAN) continue;
        u.allapot = ALLAPOT.KISZOLGALAS;
        u.ora = 0;
        const ido = Math.max(6, Math.round(t.ido * gyorsSorok / Math.max(0.2, ep.hatekonysag)));
        u.szolgalatVeg = this.tick + ido;
        ep.bent.push(uid);
      }

      // 2. Kiszolgálás vége — hátulról előre, mert közben törlünk.
      for (let i = ep.bent.length - 1; i >= 0; i--) {
        const uid = ep.bent[i];
        const u = this.utasok[uid];
        if (!u || !u.aktiv) { ep.bent.splice(i, 1); continue; }
        if (this.tick < u.szolgalatVeg) continue;
        ep.bent.splice(i, 1);
        this._kiszolgalasVege(ep, t, u, boltBonusz, orok);
      }
    }
  }

  _kiszolgalasVege(ep, t, u, boltBonusz, orok) {
    const faj = FAJOK[u.fajIdx];
    // ── FIZETÉS ─────────────────────────────────────────────────────────
    let dij = t.dij;
    if (dij > 0) {
      if (t.igeny === 'vasarlas' || t.igeny === 'ehseg' || t.igeny === 'konyv' || t.igeny === 'vip') dij *= boltBonusz;
      // A troll duplán eszik. Az ilyen apróságok teszik a fajokat érezhetővé
      // a számokban is, nem csak a látványban.
      if (t.igeny === 'ehseg' && faj.kod === 'troll') dij *= 2;
      dij = Math.round(Math.min(dij, u.penz));
      if (dij > 0) {
        u.penz -= dij;
        u.koltott += dij;
        // Bérbeadásnál a forgalom a bérlőé; nekünk a részesedés marad.
        const nekunk = ep.berbeadva ? Math.round(dij * BERLET_RESZESEDES) : dij;
        this.bevetel(nekunk, ep.berbeadva ? 'bérlet' : t.nev);
        ep.bevetel += nekunk;
      }
    }
    ep.kiszolgalt++;
    this.kosz = Math.min(1000, this.kosz + KOSZ_KISZOLGALASONKENT * 0.25);

    // ── HATÁSOK ─────────────────────────────────────────────────────────
    u.hangulat = Math.min(1000, u.hangulat + 130);
    if (t.igeny === 'pihenes') u.turelem += 900;
    else if (t.igeny === 'info') u.turelem += 420;
    else if (t.igeny === 'melegedes' || t.igeny === 'hules') u.hangulat = Math.min(1000, u.hangulat + 160);
    if (t.igeny === 'vip') {
      this.vipKiszolgalt++;
      u.hangulat = 1000;
      if (faj.kod === 'sarkany') { this.hirnevValt(3); this.naplo('Egy sárkány elégedetten hagyta el a VIP Lounge-ot.', 'jo'); }
    }

    // ── MIMIK ───────────────────────────────────────────────────────────
    if (faj.lop > 0 && this.rnd() < faj.lop / (1 + orok * 1.4)) {
      const kar = 60 + Math.round(this.rnd() * 180);
      this.koltseg(kar, 'lopás');
      if (this.rnd() < 0.3) this.naplo(`Egy mimik lopott a(z) ${t.nev} környékén. Kár: ${kar}.`, 'gond');
    }

    u.tervIdx++;
    u.allapot = ALLAPOT.DONT;
    u.ora = 0;
  }

  // ── DOLGOZÓK ────────────────────────────────────────────────────────────
  _dolgozokLep() {
    // Karbantartás: az összes karbantartóban dolgozó mérnök együtt csökkenti
    // MINDEN nyitott kapu instabilitását. Egy központi műhely tehát az egész
    // hálózatot tartja — ezért éri meg megépíteni akkor is, ha „messze van".
    let karbantartoEro = 0;
    let takaritoEro = 0;
    for (let i = 0; i < this.dolgozok.length; i++) {
      const d = this.dolgozok[i];
      const ep = d.epuletAzon >= 0 ? this.epuletek[d.epuletAzon] : null;
      if (!ep || ep.kikapcsolva) continue;
      const kod = DOLGOZOK[d.tipusIdx].kod;
      if (kod === 'mernok' && ep.kod === 'karbantarto') karbantartoEro += dolgozoEro(d) * ep.hatekonysag;
      if (kod === 'kobold' && ep.kod === 'takarito') takaritoEro += dolgozoEro(d) * ep.hatekonysag;
    }
    if (karbantartoEro > 0) {
      const csokk = INSTABIL_KARBANTARTAS * 0.01 * karbantartoEro;
      for (let i = 0; i < this.dimenziok.length; i++) {
        const d = this.dimenziok[i];
        if (!d.nyitva) continue;
        d.instabilitas = Math.max(0, d.instabilitas - csokk);
      }
    }
    const takaritoSzorzo = this.kesz('takaritorobot') ? 1.9 : 1;
    this.kosz = Math.max(0, this.kosz - takaritoEro * KOSZ_TAKARITAS * 0.01 * takaritoSzorzo);
    // A kosz magától nő a forgalommal — a kiszolgálás mellett a puszta
    // jelenlét is piszkít, különben egy takarító örökre elég lenne.
    this.kosz = Math.min(1000, this.kosz + this.utasSzam * 0.0016);

    // Mozgás: a beosztott dolgozó a munkahelye peronjára áll be. Nincs
    // útkeresésük — a dolgozó nem játékelem, hanem díszlet és szorzó.
    for (let i = 0; i < this.dolgozok.length; i++) {
      const d = this.dolgozok[i];
      const ep = d.epuletAzon >= 0 ? this.epuletek[d.epuletAzon] : null;
      if (!ep) continue;
      const cx = ep.x + ep.sz * 0.5, cy = ep.y + ep.m * 0.5;
      const dx = cx - d.x, dy = cy - d.y;
      const t = Math.sqrt(dx * dx + dy * dy);
      if (t > 0.9) { d.x += (dx / t) * 0.06; d.y += (dy / t) * 0.06; }
    }
  }

  // ── KUTATÁS ─────────────────────────────────────────────────────────────
  _kutatasLep() {
    const k = this.aktivKutatas;
    if (!k) return;
    k.halad++;
    if (k.halad < k.ido) return;
    this.keszTechek.add(k.kod);
    this.aktivKutatas = null;
    const t = tech(k.kod);
    this.naplo(`Kutatás kész: ${t.nev}. ${t.hatas}`, 'jo');
    if (k.kod === 'kapu_szkenner') this._veletlenDimenziotFelfed();
    if (k.kod === 'legendas_kapu') this.dimenziotFelfed('sarkanytronus');
  }

  _veletlenDimenziotFelfed() {
    const jeloltek = [];
    for (let i = 0; i < this.dimenziok.length; i++) {
      const d = this.dimenziok[i];
      if (!d.felfedezve && !d.lezarva && DIMENZIOK[i].kod !== 'sarkanytronus') jeloltek.push(i);
    }
    if (jeloltek.length === 0) return;
    const v = jeloltek[Math.floor(this.rnd() * jeloltek.length)];
    this.dimenziok[v].felfedezve = true;
    this.naplo(`A szkenner új világot talált: ${DIMENZIOK[v].nev}.`, 'jo');
  }

  // ── ESEMÉNYEK ───────────────────────────────────────────────────────────
  _esemenyekLep() {
    for (let i = this.aktivEsemenyek.length - 1; i >= 0; i--) {
      const e = this.aktivEsemenyek[i];
      const def = ESEMENYEK[e.idx];
      if (def.tick) def.tick(this, e);
      if (this.tick - e.kezdet >= e.hossz) {
        if (def.veg) def.veg(this, e);
        this.aktivEsemenyek.splice(i, 1);
        // Ha a játékos nem válaszolt, a lehetőség lejár vele együtt.
        for (let j = this.varakozoValaszok.length - 1; j >= 0; j--) {
          if (this.varakozoValaszok[j].azon === e.azon) this.varakozoValaszok.splice(j, 1);
        }
      }
    }
    if (this.tick < this.kovEsemenyTick) return;
    this._esemenytIndit();
    const koz = (ESEMENY_KOZ_MIN + Math.floor(this.rnd() * (ESEMENY_KOZ_MAX - ESEMENY_KOZ_MIN))) / this.nehezseg.esemeny;
    this.kovEsemenyTick = this.tick + Math.round(koz);
  }

  _esemenytIndit(kenyszerKod = null) {
    const jeloltek = [];
    for (let i = 0; i < ESEMENYEK.length; i++) {
      const def = ESEMENYEK[i];
      if (kenyszerKod && def.kod !== kenyszerKod) continue;
      if (!kenyszerKod && !def.feltetel(this)) continue;
      jeloltek.push({ i, suly: def.suly });
    }
    if (jeloltek.length === 0) return null;
    const v = sulyozott(this.rnd, jeloltek, 'suly');
    if (!v) return null;
    const def = ESEMENYEK[v.i];
    const e = { azon: this.kovEsemenyAzon++, idx: v.i, kod: def.kod, kezdet: this.tick, hossz: def.hossz, cim: def.nev };
    def.indit(this, e);
    if (!e.azonnali) {
      this.aktivEsemenyek.push(e);
      if (def.valaszok) this.varakozoValaszok.push(e);
      this.naplo(`ESEMÉNY — ${e.cim}`, 'gond');
    }
    return e;
  }

  // ── TÖRTÉNET ────────────────────────────────────────────────────────────
  _tortenetLep() {
    const t = this.tortenet;
    if (t.allapot === 'vegtelen') { this._vegtelenLep(); return; }
    if (t.allapot !== 'fut') return;
    const f = FEJEZETEK[t.fejezet];
    if (!f) return;
    if (!f.kesz(this)) return;
    if (f.dontes) { t.allapot = 'dontes'; return; }
    if (f.jutalom) f.jutalom(this);
    this._fejezetTovabb();
  }

  _fejezetTovabb() {
    const t = this.tortenet;
    t.fejezet++;
    t.valtasTick = this.tick;
    if (t.fejezet >= FEJEZETEK.length) { this._korszakotIndit(1); return; }
    t.allapot = 'bevezeto';
  }

  /** A hét fejezet vége — innentől korszakok jönnek. */
  gyozelem() {
    if (this.gyoztel) return;
    this.gyoztel = true;
    this.gyozelemTick = this.tick;
  }

  _korszakotIndit(korszak) {
    const t = this.tortenet;
    t.allapot = 'vegtelen';
    t.korszak = korszak;
    // A korszak SAJÁT számlálóval megy: az elégedett távozók abszolút száma
    // már ezresekben jár, abból nem látszana a haladás.
    t.korszakAlap = this.elegedettTavozok;
    t.valtasTick = this.tick;
    this.korszakSzorzo = korszakTerheles(korszak);
    if (korszak > 1) {
      this.naplo(`${korszak}. korszak — ${rang(korszak).nev}. A hálózat terhelése tovább nőtt.`, 'jo');
    }
  }

  /** A végtelen mód haladása 0..1 — a HUD és a szonda is ezt kérdezi. */
  korszakHalad() {
    const t = this.tortenet;
    if (t.allapot !== 'vegtelen') return 0;
    const cel = vegtelenCel(t.korszak);
    const utas = this.elegedettTavozok - t.korszakAlap;
    return Math.min(1, utas / cel.utas);
  }

  _vegtelenLep() {
    const t = this.tortenet;
    const cel = vegtelenCel(t.korszak);
    const utas = this.elegedettTavozok - t.korszakAlap;
    if (utas < cel.utas || this.hirnev < cel.hirnev) return;
    // Teljesítve: jutalom, és a következő korszak MINDIG nehezebb.
    // Ugyanaz a szabály, mint a célnál: hatvány helyett szorzás (lásd tortenet.js).
    const jutalom = Math.round(9000 * t.korszak * (1 + (t.korszak - 1) * 0.15));
    this.bevetel(jutalom, 'korszak-jutalom');
    this.naplo(`A ${t.korszak}. korszak teljesítve. Jutalom: ${jutalom}.`, 'jo');
    this._korszakotIndit(t.korszak + 1);
  }

  // ── NAPI ELSZÁMOLÁS ─────────────────────────────────────────────────────
  _napiElszamolas() {
    let ber = 0;
    for (let i = 0; i < this.dolgozok.length; i++) ber += dolgozoBer(this.dolgozok[i]);
    ber = Math.round(ber * this.nehezseg.ber * this.korszakSzorzo);
    if (ber > 0) this.koltseg(ber, 'bérek');

    let reklam = 0;
    for (let a = 0; a < this.epuletek.length; a++) {
      const ep = this.epuletek[a];
      if (!ep || ep.kikapcsolva) continue;
      const t = EPULETEK[ep.tipusIdx];
      if (t.naponta) reklam += t.naponta;
      // Fix napi bérleti díj: az üres bolt is fizet valamennyit, tehát a
      // bérbeadás akkor is hoz, amikor épp nincs forgalom. Ez a kockázat
      // átadásának az ára — és pont ettől lesz valódi döntés.
      if (ep.berbeadva) this.bevetel(Math.round(t.ar * BERLET_NAPIDIJ), 'bérleti díj');
    }
    if (reklam > 0) {
      // A reklám hozama csökkenő: a nyolcadik oszlop már csak zaj.
      const db = reklam / 95;
      const hatas = Math.round(reklam * (db > 1 ? 1 / (1 + (db - 1) * 0.18) : 1));
      this.bevetel(hatas, 'reklám');
      this.hirnevValt(Math.min(1.2, db * 0.25));
    }

    // Karbantartási átalány: minden épület után napidíj. Ez az a lassú
    // szivárgás, ami miatt a fölösleges épület nem semleges, hanem rossz.
    let uzemeltetes = 0;
    for (let a = 0; a < this.epuletek.length; a++) {
      const ep = this.epuletek[a];
      if (!ep) continue;
      uzemeltetes += EPULETEK[ep.tipusIdx].ar * 0.028;
    }
    // …plusz forgalom-arányos rész: takarítás, kopás, felügyelet. Enélkül a
    // költség az épületek SZÁMÁTÓL függött, a forgalomtól nem — így a
    // nagyra hízott állomás fenntartása gyakorlatilag ingyen volt.
    uzemeltetes += this.utasSzam * 0.35;
    if (uzemeltetes > 0) this.koltseg(Math.round(uzemeltetes), 'üzemeltetés');

    this.elozoNap = { bevetel: this.napiBevetel, koltseg: this.napiKoltseg, tetelek: new Map(this.tetelek) };
    this.napiBevetel = 0;
    this.napiKoltseg = 0;
    this.tetelek.clear();
    this.nap++;

    if (this.penz < -6000) {
      this.jatekVege = 'csod';
      this.naplo('CSŐD. A Tanács átvette az állomást.', 'baj');
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  //  A MODULOK KÖZÖS FELÜLETE (utas.js, esemenyek.js, tortenet.js hívja)
  // ══════════════════════════════════════════════════════════════════════

  bevetel(osszeg, cimke) {
    this.penz += osszeg;
    this.napiBevetel += osszeg;
    this._tetel(cimke, osszeg);
  }

  koltseg(osszeg, cimke) {
    this.penz -= osszeg;
    this.napiKoltseg += osszeg;
    this._tetel(cimke, -osszeg);
  }

  _tetel(cimke, osszeg) {
    if (!cimke) return;
    this.tetelek.set(cimke, (this.tetelek.get(cimke) || 0) + osszeg);
  }

  hirnevValt(d) {
    this.hirnev += d;
    if (this.hirnev < 0) this.hirnev = 0;
    if (this.hirnev > 100) this.hirnev = 100;
  }

  naplo(szoveg, fajta = 'info') {
    this.naplok.push({ tick: this.tick, nap: this.nap, szoveg, fajta });
    // A napló nem nőhet a végtelenségig: egy órányi játék több ezer sor.
    if (this.naplok.length > 220) this.naplok.splice(0, this.naplok.length - 220);
  }

  hianyRogzit(igeny) {
    this.hianyok.set(igeny, (this.hianyok.get(igeny) || 0) + 1);
  }

  fajIndexKod(kod) {
    const i = FAJ_INDEX.get(kod);
    return i === undefined ? 0 : i;
  }

  /** Az utas sebesség-szorzója: idővihar és teleport lift. */
  sebessegSzorzo(u) {
    let s = this.idoviharSzorzo;
    for (let i = 0; i < this.liftek.length; i++) {
      const ep = this.epuletek[this.liftek[i]];
      if (!ep || ep.kikapcsolva) continue;
      // A lift a saját szintjén és a fölötte lévőn is gyorsít — az átjáró
      // mindkét végén ugyanaz a szerkezet áll.
      if (u.z !== ep.z && u.z !== ep.z + 1) continue;
      const dx = (ep.x + 1) - u.x, dy = (ep.y + 1) - u.y;
      if (dx * dx + dy * dy < 81) { s *= 2.2; break; }
    }
    return s;
  }

  nyitottDimenziok() {
    const ki = [];
    for (let i = 0; i < this.dimenziok.length; i++) {
      const d = this.dimenziok[i];
      if (d.nyitva && d.szunet === 0) ki.push(d);
    }
    return ki;
  }

  /**
   * Csak a VALÓDI kapuk (a csatornák nélkül). Minden olyan hatásnak ezt kell
   * kérnie, aminek köze van az instabilitáshoz — a vasútnak és a léghajónak
   * definíció szerint nincs romló kapuja, tehát az „instabil kapu" esemény
   * nem is találhatja el őket.
   */
  nyitottKapuk() {
    const ki = [];
    for (let i = 0; i < this.dimenziok.length; i++) {
      const d = this.dimenziok[i];
      if (d.nyitva && d.szunet === 0 && !DIMENZIOK[i].csatorna) ki.push(d);
    }
    return ki;
  }

  veletlenNyitottDimenzio(kizarIdx) {
    const l = this.nyitottDimenziok();
    if (l.length === 0) return kizarIdx;
    if (l.length === 1) return l[0].idx;
    // A továbbutazás célja lehetőleg NEM az, ahonnan jött — attól lesz
    // átszállóállomás, nem körforgalom.
    for (let proba = 0; proba < 4; proba++) {
      const v = l[Math.floor(this.rnd() * l.length)];
      if (v.idx !== kizarIdx) return v.idx;
    }
    return l[0].idx;
  }

  indulasiPortal(dimIdx) {
    const d = this.dimenziok[dimIdx];
    if (d && d.portalAzon >= 0) {
      const ep = this.epuletek[d.portalAzon];
      if (ep && !ep.kikapcsolva && ep.peron.length > 0) return ep;
    }
    for (let i = 0; i < this.portalok.length; i++) {
      const ep = this.epuletek[this.portalok[i]];
      if (ep && !ep.kikapcsolva && ep.peron.length > 0) return ep;
    }
    return null;
  }

  mukodoEpuletVan(kod) {
    for (let a = 0; a < this.epuletek.length; a++) {
      const ep = this.epuletek[a];
      if (ep && ep.kod === kod && !ep.kikapcsolva) return true;
    }
    return false;
  }

  epuletSzam(kod) {
    let n = 0;
    for (let a = 0; a < this.epuletek.length; a++) {
      const ep = this.epuletek[a];
      if (ep && ep.kod === kod) n++;
    }
    return n;
  }

  dolgozoSzamTipus(kod) {
    let n = 0;
    for (let i = 0; i < this.dolgozok.length; i++) if (this.dolgozok[i].kod === kod) n++;
    return n;
  }

  kesz(techKod) { return this.keszTechek.has(techKod); }

  /** Egy épület-példány típusleírója. A UI és a forgatókönyv is ezt kéri. */
  epuletTipusa(ep) { return EPULETEK[ep.tipusIdx]; }

  /** Egy épülettípus alapára — a felület és a forgatókönyvek ebből tervezhetnek. */
  epuletAra(kod) { const t = epuletTipus(kod); return t ? t.ar : 0; }

  /** Melyik technológia oldja fel az épületet (vagy null). */
  epuletKutatasa(kod) { const t = epuletTipus(kod); return t ? (t.kutatas || null) : null; }

  /** Kikutatható-e most: nincs kész, és minden előfeltétele megvan. */
  kutathato(kod) {
    if (this.keszTechek.has(kod)) return false;
    const t = tech(kod);
    if (!t) return false;
    for (let i = 0; i < t.fuggo.length; i++) if (!this.keszTechek.has(t.fuggo[i])) return false;
    return true;
  }

  eventEro() { return this.kesz('ido_kotes') ? 0.55 : 1; }

  dimenzioNev(idx) { return DIMENZIOK[idx].nev; }
  dimIdxKod(kod) { const i = DIMENZIO_INDEX.get(kod); return i === undefined ? -1 : i; }
  dimenzioNyitva(kod) {
    const i = DIMENZIO_INDEX.get(kod);
    return i === undefined ? false : this.dimenziok[i].nyitva;
  }

  dimenziotFelfed(kod) {
    const i = DIMENZIO_INDEX.get(kod);
    if (i === undefined) return;
    if (this.dimenziok[i].lezarva) return;
    this.dimenziok[i].felfedezve = true;
  }

  /**
   * Kapu bezárása. A `vegleg` az, ami a történetnek súlyt ad: a véglegesen
   * lezárt világ SOHA nem nyílik újra ebben a játszásban.
   */
  dimenziotLezar(idx, vegleg) {
    const d = this.dimenziok[idx];
    if (d.portalAzon >= 0) {
      const ep = this.epuletek[d.portalAzon];
      if (ep) this._epuletetElvesz(ep);
    }
    d.nyitva = false;
    d.portalAzon = -1;
    if (vegleg) { d.lezarva = true; d.felfedezve = true; }
    this.naplo(vegleg
      ? `${DIMENZIOK[idx].nev}: a kapu VÉGLEG lezárult.`
      : `${DIMENZIOK[idx].nev}: a kapu bezárt.`, vegleg ? 'baj' : 'gond');
  }

  /**
   * A legkevesebb bevételt hozó nyitott kapu — a VI. fejezet döntése ezt
   * zárja le VÉGLEG.
   *
   * ⚠️ KÉT KIVÉTEL, ÉS MINDKETTŐ EGY MEGTALÁLT HIBA MIATT VAN ITT.
   *
   * 1. A SÁRKÁNYTRÓNUS SOHA. Az egyensúly-mérés nyolc „kiegyensúlyozott"
   *    játszásból NÉGYBEN azt kapta, hogy a frissen megnyitott Sárkánytrónus
   *    volt a legkisebb bevételű — épp mert frissen nyílt —, tehát a döntés
   *    azt zárta le. A VII. fejezet viszont pontosan azt a kaput kéri: a
   *    játszás CSENDBEN megnyerhetetlenné vált, 70 fölötti hírnévvel,
   *    mindenféle visszajelzés nélkül. Ez nem egyensúly-kérdés, hanem hiba.
   * 2. A CSATORNÁK SOHA. A vasút és a léghajó nem kapu: nincs instabilitása,
   *    tehát a „hálózat tehermentesítése" indok se áll rá. A történet
   *    döntése ne bontsa le a játékos vasútállomását.
   */
  legrosszabbNyitottDimenzio() {
    let legrosszabb = null;
    for (let i = 0; i < this.dimenziok.length; i++) {
      const d = this.dimenziok[i];
      if (!d.nyitva) continue;
      if (DIMENZIOK[i].csatorna) continue;
      if (DIMENZIOK[i].kod === 'sarkanytronus') continue;
      if (!legrosszabb || d.bevetel < legrosszabb.bevetel) legrosszabb = d;
    }
    return legrosszabb;
  }

  jelzo(kod) { this.tortenetJelzok.add(kod); }

  /** Egy sárkány beléptetése a legrangosabb nyitott kapun. */
  sarkanytIndit() {
    const l = this.nyitottDimenziok();
    if (l.length === 0) return;
    let legjobb = l[0];
    for (let i = 1; i < l.length; i++) if (DIMENZIOK[l[i].idx].dij > DIMENZIOK[legjobb.idx].dij) legjobb = l[i];
    const ep = this.epuletek[legjobb.portalAzon];
    if (!ep || ep.peron.length === 0) return;
    this._utastErkeztet(ep, legjobb, this.fajIndexKod('sarkany'));
  }

  // ══════════════════════════════════════════════════════════════════════
  //  MÉRÉS
  // ══════════════════════════════════════════════════════════════════════

  /**
   * A világ állapotának ellenőrző-összege. A determinizmus-szonda két futás
   * összegeit hasonlítja — ha eltérnek, valahol motorfüggő matek van.
   *
   * ⚠️ MINDEN, AMI SZÁMÍT, KERÜLJÖN BELE. Ha egy alrendszer kimarad, a szonda
   * zöld marad, miközben az az alrendszer szétcsúszik. (Az AoC-nál pont ez
   * történt a v0.3-ban: hat zöld vizsgálat mellett állt a gazdaság.)
   */
  ellenorzoOsszeg() {
    const o = new Osszeg();
    o.be(this.tick).be(this.nap).be(this.rnd.allapot()).be(this.nehezsegIdx)
      .be(this.gyoztel ? 1 : 0).be(this.tortenet.korszak).be(this.tortenet.korszakAlap);
    o.beF(this.penz).beF(this.hirnev).beF(this.kosz);
    o.be(this.utasSzam).be(this.osszTavozo).be(this.elegedettTavozok).be(this.duhosTavozok);
    o.be(this.energiaIgeny).be(this.energiaTermeles).be(this.aramszunet ? 1 : 0);
    o.be(this.tortenet.fejezet).be(this.tortenet.allapot.length);
    for (let i = 0; i < this.dimenziok.length; i++) {
      const d = this.dimenziok[i];
      o.be(d.nyitva ? 1 : 0).be(d.lezarva ? 1 : 0).be(d.szint).beF(d.instabilitas).be(d.szunet).be(d.osszUtas).beF(d.bevetel);
    }
    for (let a = 0; a < this.epuletek.length; a++) {
      const ep = this.epuletek[a];
      if (!ep) { o.be(-1); continue; }
      o.be(ep.tipusIdx).be(ep.x).be(ep.y).be(ep.z).be(ep.berbeadva ? 1 : 0).be(ep.sor.length).be(ep.bent.length)
        .be(ep.dolgozok.length).be(ep.kiszolgalt).beF(ep.bevetel).beF(ep.hatekonysag);
    }
    for (let i = 0; i < this.dolgozok.length; i++) {
      const d = this.dolgozok[i];
      o.be(d.tipusIdx).be(d.szint).be(d.epuletAzon).beF(d.x).beF(d.y);
    }
    for (let i = 0; i < this.utasok.length; i++) {
      const u = this.utasok[i];
      if (!u.aktiv) { o.be(0); continue; }
      o.be(u.fajIdx).be(u.allapot).be(u.tervIdx).be(u.terv.length).be(u.celEpulet)
        .beF(u.hangulat).be(u.turelem).be(u.penz).beF(u.x).beF(u.y).be(u.z).be(u.valtasHatra).be(u.valtasCel);
    }
    for (let i = 0; i < this.aktivEsemenyek.length; i++) {
      const e = this.aktivEsemenyek[i];
      o.be(e.idx).be(e.kezdet).be(e.hossz);
    }
    // A kész technológiák halmaza sorrendfüggetlenül: a katalógus sorrendjében
    // kérdezzük vissza, nem a Set bejárásával — az utóbbi beszúrási sorrendű,
    // tehát ugyanaz az állapot két különböző összeget adhatna.
    for (let i = 0; i < TECHNOLOGIAK.length; i++) o.be(this.keszTechek.has(TECHNOLOGIAK[i].kod) ? 1 : 0);
    return o.ertek();
  }

  /** Rövid, ember által olvasható állapot — a szonda és a HUD is használja. */
  kivonat() {
    return {
      tick: this.tick,
      nap: this.nap,
      penz: Math.round(this.penz),
      hirnev: Math.round(this.hirnev * 10) / 10,
      utas: this.utasSzam,
      csucs: this.csucsUtas,
      tavozo: this.osszTavozo,
      elegedett: this.elegedettTavozok,
      duhos: this.duhosTavozok,
      kosz: Math.round(this.kosz / 10),
      energia: `${this.energiaIgeny}/${this.energiaTermeles}`,
      epulet: this.epuletek.reduce((n, e) => n + (e ? 1 : 0), 0),
      dolgozo: this.dolgozok.length,
      nyitottKapu: this.nyitottDimenziok().length,
      fejezet: this.tortenet.fejezet,
      korszak: this.tortenet.korszak,
      gyoztel: this.gyoztel,
      osszeg: this.ellenorzoOsszeg(),
    };
  }
}
