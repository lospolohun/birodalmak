// AGE OF THE CRYSTALS — TECHNOLÓGIA- ÉS KORSZAK-PANEL (v0.16).
//
// ── MIÉRT VAN EGYÁLTALÁN ──────────────────────────────────────────────────
// A motor v0.10-nél tart, a technológiafa és a négy korszak a v0.5 óta MEGVAN
// és MŰKÖDIK — a játékos viszont semmit nem lát belőle. A HUD annyit ír, hogy
// „TECHNOLÓGIA 0", a kutatás pedig egy dokumentálatlan `R` billentyű, ami a
// kurzor melletti épületben az ELSŐ szabad technológiát indítja el. Vagyis van
// egy kész alrendszer, ami a játék felől nézve nem létezik. Ez a panel az a
// felület, ahol létezni kezd: mi kész, mi folyik, mi elérhető, mi zárt — és
// zártnál MIÉRT.
//
// A mérce a TELEPESEK v1.3.1 Akadémia-képernyője és a klasszikus AoE
// technológiafája: teljes képernyő, korszakok szerint oszlopok, minden tételnél
// ikon, név, hatás, ár, idő, állapot.
//
// ── MIÉRT KÉT FÁJL ────────────────────────────────────────────────────────
// A DÖNTÉS (mi elérhető és miért nem) a `panel_technologia_adat.js`-ben van,
// mert az DOM-mentes, tehát node-ban szondázható. Ez a fájl CSAK rajzol és
// kattintást kezel. A panel-szerződés 4. kikötése pontosan ez, és jó oka van:
// egy „miért zárt" logikát, ami csak a képernyőn látszik, semmilyen kapu nem őriz.
//
// ── AMI A LEGKÖNNYEBBEN ELROMLIK ──────────────────────────────────────────
// 1. A PER-KÉPKOCKA DOM-ÍRÁS. A panel-szerződés 3. kikötése: `frissit()` nem
//    allokál és csak eltérésre nyúl a DOM-hoz. Ezért a DOM EGYSZER épül fel a
//    konstruktorban, a `frissit()` pedig egy előre lefoglalt állapot-objektumba
//    olvas (`technologiaAllapot`), és tételenként ELTÁROLT négy számhoz
//    hasonlít. Ha nincs eltérés, egyetlen DOM-hívás sem fut le.
// 2. A REJTETT PANEL KÖLTSÉGE. Amíg zárva van, még az állapot-olvasás sem fut:
//    egy meccs alatt a fa az idő 99 %-ában nincs a képernyőn.
// 3. A NÉMA GOMB. A kutatás indítása egyetlen úton mehet
//    (`sim.parancs({fajta:'kutatas', …})`), és a sim némán utasítja el, ha nem
//    teljesül valami. Ezért a gomb CSAK akkor kattintható, ha az adatréteg
//    `ELERHETO`-t mond — és a szonda 5. gátja azt méri, hogy ez a két dolog
//    (a felirat és a sim döntése) tényleg együtt mozog.

import './panel_technologia.css';
import { IKON, ikonSvg } from './ikonok.js';
import { TECH_DB } from '../sim/technologia.js';
import { KORSZAK, KORSZAK_NEV } from '../sim/gazdasag.js';
import { NYERS_NEV } from '../sim/eroforras.js';
import {
  KORSZAK_DB, TALLAPOT, TALLAPOT_NEV, VALTAS, NYERS_IKON,
  technologiaTetelek, korszakOszlopok, ujAllapot, technologiaAllapot,
  zarIndok, zarCimke, valtasIndok, mpSzoveg,
  kutatasParancs, korszakParancs,
} from './panel_technologia_adat.js';

/** Hova kéri magát a HUD-vázon. */
export const PANEL = { nev: 'technologia', hely: 'kepernyo', cim: 'Technológia' };

/** Két DOM-írás között eltelő minimális idő ms-ban (≈10 Hz). */
const FRISSITES_MS = 100;

/** Az állapot-osztályok `TALLAPOT.*` szerint. */
const ALLAPOT_OSZTALY = [
  'aoc-tech-allapot-kesz', 'aoc-tech-allapot-folyik',
  'aoc-tech-allapot-elerheto', 'aoc-tech-allapot-zarva',
];

/** A gomb felirata `TALLAPOT.*` szerint (a zártét a `zarCimke` adja). */
const GOMB_FELIRAT = ['megvan', 'kutatás folyik', 'Kutatás indítása', ''];

export class PanelTechnologia {
  /**
   * @param {HTMLElement} gyoker ÜRES elem, a HUD-váz adja
   * @param {import('../sim/sim.js').Sim} sim
   * @param {import('./bevitel.js').Bevitel} bevitel
   * @param {{sajatCsapat?:number, uzenet?:(sz:string,f?:string)=>void,
   *          billentyu?:string|null, nyitva?:boolean}} [opciok]
   */
  constructor(gyoker, sim, bevitel, opciok = {}) {
    this.gyoker = gyoker;
    this.sim = sim;
    this.bevitel = bevitel;
    this.opciok = opciok;
    this.sajatCsapat = opciok.sajatCsapat !== undefined
      ? (opciok.sajatCsapat | 0)
      : (bevitel && bevitel.kijeloles ? bevitel.kijeloles.sajatCsapat : 0);
    this._uzenet = opciok.uzenet || null;

    /** A meccs állásától FÜGGETLEN adatok — egyszer épülnek fel. */
    this.tetelek = technologiaTetelek();
    this.oszlopokAlap = korszakOszlopok();
    /** Az előre lefoglalt állapot-objektum; a `frissit()` ebbe olvas. */
    this.all = ujAllapot();

    // ── VÁLTOZÁS-GYORSÍTÓTÁR ──────────────────────────────────────────
    // Tételenként négy szám: állapot, zárolási ok, százalék, hiány-lenyomat.
    // Amíg mind a négy egyezik, a kártyához hozzá sem nyúlunk.
    this._cAllapot = new Int32Array(TECH_DB).fill(-1);
    this._cZar = new Int32Array(TECH_DB).fill(-1);
    this._cSzazalek = new Int32Array(TECH_DB).fill(-1);
    this._cHiany = new Int32Array(TECH_DB).fill(-1);
    this._cValtas = -1;
    this._cValtasHiany = -1;
    // ⚠️ KÜLÖN gyorsítótár a váltás-sávnak. Az első változatban a fejléc
    // százalék-gyorsítótárát olvasta — csakhogy a fejléc ELŐBB fut és már be is
    // írta az új értéket, tehát az összehasonlítás MINDIG egyezett, és a sáv
    // befagyott. Pont az a fajta hiba, ami zöld kapu mellett is él.
    this._cValtasSzazalek = -1;
    this._cKorszak = -1;
    this._cKorszakSzazalek = -1;
    this._cOsszesites = -1;

    this._lathato = !!opciok.nyitva;
    this._utolsoIdo = -1e9;
    this._szamlalo = 0;
    this._enabled = true;
    this._kenyszer = true;

    this._epit();
    this._kotesek();
    this._lathatosag();
  }

  // ══════════════════════════════════════════════════════════════════════
  // FELÉPÍTÉS — egyszer fut
  // ══════════════════════════════════════════════════════════════════════

  _epit() {
    const gy = this.gyoker;
    gy.classList.add('aoc-tech-gyoker');

    // ── fejléc ────────────────────────────────────────────────────────
    const fej = this._div('aoc-tech-fejlec', gy);
    this._div('aoc-tech-cim', fej).textContent = 'Technológia';

    const jel = this._div('aoc-tech-korszak-jel', fej);
    const jelIkon = this._div('aoc-tech-ikon', jel);
    jelIkon.innerHTML = ikonSvg(IKON.KORSZAK, 16);
    this._eKorszakNev = document.createElement('span');
    jel.appendChild(this._eKorszakNev);
    this._eKorszakHatra = document.createElement('span');
    this._eKorszakHatra.className = 'aoc-tech-hatra';
    jel.appendChild(this._eKorszakHatra);

    const ossz = this._div('aoc-tech-osszesites', fej);
    this._eKesz = this._szamlaloMezo(ossz, 'kész', 'aoc-tech-szam-kesz');
    this._eFolyik = this._szamlaloMezo(ossz, 'folyik', 'aoc-tech-szam-folyik');
    this._eElerheto = this._szamlaloMezo(ossz, 'elérhető', 'aoc-tech-szam-elerheto');
    this._eZarva = this._szamlaloMezo(ossz, 'zárt', 'aoc-tech-szam-zarva');

    this._eBezar = document.createElement('button');
    this._eBezar.className = 'aoc-tech-bezar';
    this._eBezar.type = 'button';
    this._eBezar.textContent = 'Bezár';
    fej.appendChild(this._eBezar);

    // ── a négy oszlop ─────────────────────────────────────────────────
    const racs = this._div('aoc-tech-racs', gy);
    this._oszlopok = new Array(KORSZAK_DB);
    this._valtasKartyak = new Array(KORSZAK_DB);
    this._kartyak = new Array(TECH_DB);

    for (let k = 0; k < KORSZAK_DB; k++) {
      const alap = this.oszlopokAlap[k];
      const o = this._div('aoc-tech-oszlop', racs);
      const ofej = this._div('aoc-tech-oszlop-fej', o);
      this._div('aoc-tech-oszlop-nev', ofej).textContent = alap.nev;
      const allas = this._div('aoc-tech-oszlop-allas', ofej);
      const nyit = this._div('aoc-tech-oszlop-nyit', o);
      nyit.textContent = alap.nyitMondat;
      this._oszlopok[k] = { elem: o, allas, nyit };

      if (k > 0) this._valtasKartyak[k] = this._valtasKartya(o, k);
      for (let i = 0; i < alap.tetelek.length; i++) {
        const t = alap.tetelek[i];
        this._kartyak[t] = this._techKartya(o, t);
      }
    }

    // ── lábléc ────────────────────────────────────────────────────────
    const bill = this.opciok.billentyu === undefined ? 'KeyU' : this.opciok.billentyu;
    this._div('aoc-tech-lablec', gy).textContent =
      'A kutatás abban az épületben folyik, amelyik a kártyán szerepel; egyszerre több is futhat. '
      + (bill ? 'Nyitás/zárás: ' + this._billNev(bill) + ', bezárás: Esc.' : '');
  }

  /** Egy „NÉV szám" mező a fejlécben. */
  _szamlaloMezo(szulo, cimke, osztaly) {
    const d = document.createElement('span');
    d.textContent = cimke + ' ';
    const sz = document.createElement('span');
    sz.className = 'aoc-tech-szam ' + osztaly;
    sz.textContent = '0';
    d.appendChild(sz);
    szulo.appendChild(d);
    return sz;
  }

  /** A korszakváltó kártya a `k`. oszlopban (a `k-1`-ből ide lépünk). */
  _valtasKartya(szulo, k) {
    const alap = this.oszlopokAlap[k];
    const kartya = this._div('aoc-tech-valtas', szulo);
    this._div('aoc-tech-valtas-cim', kartya).textContent = 'Váltás: ' + alap.nev;
    // A „mit ad" a GOMB mellé tartozik, mert a játékos itt dönt. Az oszlop
    // fejlécében ugyanez a mondat áll — ott ELREJTJÜK, amikor ez a doboz
    // látszik (lásd `_fejlecFrissit`), különben kétszer olvasná ugyanazt.
    // A `nyitMondat` MAGA egész mondat („Megnyitja ezeket a technológiákat: …"),
    // ezért nincs elé címke: a „Mit ad: Megnyitja…" kétszer mondaná ugyanazt.
    this._div('aoc-tech-valtas-mondat', kartya).textContent = alap.nyitMondat;

    const arSor = this._div('aoc-tech-ar', kartya);
    const arElemek = this._arSor(arSor, alap.ar || [0, 0, 0, 0]);
    const ido = this._div('aoc-tech-hol', kartya);
    ido.textContent = 'A váltás ideje: ' + alap.idoSzoveg;

    const sav = this._div('aoc-tech-sav', kartya);
    const savBelso = this._div('aoc-tech-sav-belso', sav);
    const hatra = this._div('aoc-tech-hatra', kartya);
    const mondat = this._div('aoc-tech-indok', kartya);

    const gomb = document.createElement('button');
    gomb.className = 'aoc-tech-gomb';
    gomb.type = 'button';
    gomb.textContent = 'Korszakváltás';
    kartya.appendChild(gomb);

    return { kartya, arElemek, sav, savBelso, hatra, mondat, gomb, korszak: k };
  }

  /** Egy technológia kártyája. */
  _techKartya(szulo, t) {
    const s = this.tetelek[t];
    const kartya = this._div('aoc-tech-kartya', szulo);
    kartya.setAttribute('data-tech', String(t));

    const fej = this._div('aoc-tech-kartya-fej', kartya);
    this._div('aoc-tech-ikon', fej).innerHTML = ikonSvg(s.ikon, 20);
    this._div('aoc-tech-nev', fej).textContent = s.nev;
    const jelveny = this._div('aoc-tech-jelveny', fej);

    this._div('aoc-tech-hatas', kartya).textContent = s.hatas;
    this._div('aoc-tech-hol', kartya).textContent =
      'Kutatás helye: ' + s.epuletNev + ' · ' + s.idoSzoveg;

    const arSor = this._div('aoc-tech-ar', kartya);
    const arElemek = this._arSor(arSor, s.ar);

    const sav = this._div('aoc-tech-sav', kartya);
    const savBelso = this._div('aoc-tech-sav-belso', sav);
    const hatra = this._div('aoc-tech-hatra', kartya);
    const indok = this._div('aoc-tech-indok', kartya);

    const gomb = document.createElement('button');
    gomb.className = 'aoc-tech-gomb';
    gomb.type = 'button';
    gomb.textContent = GOMB_FELIRAT[TALLAPOT.ELERHETO];
    kartya.appendChild(gomb);

    return { kartya, jelveny, arElemek, sav, savBelso, hatra, indok, gomb, tech: t };
  }

  /**
   * Az ár-sor: csak a NEM NULLA nyersanyagok kerülnek ki. A „0 kristály" nem
   * információ, csak zaj — és négy kártyán négyszer ismételve elveszi a helyet
   * attól a kettőtől, ami tényleg számít.
   */
  _arSor(szulo, ar) {
    const ki = [];
    for (let f = 0; f < 4; f++) {
      if (!ar[f]) continue;
      const d = this._div('aoc-tech-ar-tetel', szulo);
      const ik = document.createElement('span');
      ik.className = 'aoc-tech-ikon';
      ik.innerHTML = ikonSvg(NYERS_IKON[f], 14);
      ik.title = NYERS_NEV[f];
      d.appendChild(ik);
      const sz = document.createElement('span');
      sz.textContent = String(ar[f]);
      d.appendChild(sz);
      ki.push({ nyers: f, elem: d, hianyzik: false });
    }
    if (ki.length === 0) this._div('aoc-tech-ar-tetel', szulo).textContent = 'ingyen';
    return ki;
  }

  _div(osztaly, szulo) {
    const d = document.createElement('div');
    d.className = osztaly;
    if (szulo) szulo.appendChild(d);
    return d;
  }

  /** Ember-olvasható billentyűnév a láblécnek. */
  _billNev(kod) {
    return kod.startsWith('Key') ? kod.slice(3) : kod;
  }

  // ══════════════════════════════════════════════════════════════════════
  // ESEMÉNYEK
  // ══════════════════════════════════════════════════════════════════════

  _kotesek() {
    // Eseménydelegálás: EGY figyelő a gyökéren, nem hét darab. A `bont()` így
    // biztosan mindent leszed — a panelenkénti figyelő-leltár az a fajta dolog,
    // amiből egy elfelejtett sor meccs-váltáskor szivárgó memóriát ad.
    this._kattint = (ev) => this._kattintas(ev);
    this.gyoker.addEventListener('click', this._kattint);

    const bill = this.opciok.billentyu === undefined ? 'KeyU' : this.opciok.billentyu;
    this._billKod = bill;
    if (bill) {
      this._billentyu = (ev) => this._billentyuLe(ev);
      window.addEventListener('keydown', this._billentyu);
    } else {
      this._billentyu = null;
    }
  }

  _kattintas(ev) {
    const cel = ev.target;
    if (!cel || !cel.closest) return;
    if (cel.closest('.aoc-tech-bezar')) { this.nyitva = false; return; }

    // Korszakváltás.
    const vk = cel.closest('.aoc-tech-valtas');
    if (vk && cel.closest('.aoc-tech-gomb')) { this._korszakot(); return; }

    // Kutatás.
    const kk = cel.closest('.aoc-tech-kartya');
    if (kk && cel.closest('.aoc-tech-gomb')) {
      const t = Number(kk.getAttribute('data-tech'));
      if (!Number.isNaN(t)) this._kutat(t);
    }
  }

  _billentyuLe(ev) {
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    // Beviteli mezőben (mentés-név, chat) a gyorsbillentyű ne lőjön el.
    const c = ev.target;
    if (c && c.tagName && (c.tagName === 'INPUT' || c.tagName === 'TEXTAREA' || c.isContentEditable)) return;
    if (ev.code === this._billKod) { this.nyitva = !this._lathato; ev.preventDefault(); return; }
    // Az Esc CSAK akkor nyeli el az eseményt, ha tényleg zárt is valamit —
    // különben elvenné a menütől a saját Esc-jét.
    if (ev.code === 'Escape' && this._lathato) { this.nyitva = false; ev.preventDefault(); }
  }

  /**
   * KUTATÁS INDÍTÁSA. A parancsot az adatréteg állítja elő, és `null`-t ad, ha
   * a tétel nem indítható — így a panel SOSEM küld olyan parancsot, amit a sim
   * némán eldobna.
   */
  _kutat(t) {
    const p = kutatasParancs(this.all, this.sajatCsapat, t);
    if (!p) {
      const s = this.tetelek[t];
      this._szol(s.nev + ': ' + (zarIndok(s, this.all) || 'most nem indítható'), 'figyelem');
      return;
    }
    this.sim.parancs(p);
    // A gyorsítótárat ELRONTJUK, hogy a következő `frissit()` biztosan újraírja
    // a kártyát: a parancs `KESLELTETES` tickig a sorban ül, és addig a kártya
    // változatlannak LÁTSZANA — a játékos meg azt hinné, nem történt semmi.
    this._cAllapot[t] = -1;
    const s = this.tetelek[t];
    this._szol(s.nev + ' — kutatás indul (' + s.hatas + ')', 'info');
  }

  _korszakot() {
    const p = korszakParancs(this.all, this.sajatCsapat);
    if (!p) { this._szol(valtasIndok(this.all), 'figyelem'); return; }
    this.sim.parancs(p);
    this._cValtas = -1;
    const kov = this.all.korszak + 1;
    this._szol('Korszakváltás indul: ' + KORSZAK_NEV[kov] + '.', 'info');
  }

  _szol(szoveg, fajta) {
    if (this._uzenet) this._uzenet(szoveg, fajta);
  }

  // ══════════════════════════════════════════════════════════════════════
  // FRISSÍTÉS — képkockánként hívva, de csak eltérésre ír
  // ══════════════════════════════════════════════════════════════════════

  /**
   * @param {import('../sim/sim.js').Sim} sim
   * @param {number} most ms (a HUD-váz `performance.now()`-ja)
   */
  frissit(sim, most) {
    if (!this._enabled || !this._lathato) return;
    const ido = typeof most === 'number' ? most : (this._szamlalo += 16);
    if (!this._kenyszer && ido - this._utolsoIdo < FRISSITES_MS) return;
    this._utolsoIdo = ido;
    this._kenyszer = false;

    const all = technologiaAllapot(sim || this.sim, this.sajatCsapat, this.all);
    this._fejlecFrissit(all);
    this._valtasFrissit(all);
    for (let t = 0; t < TECH_DB; t++) this._kartyaFrissit(all, t);
  }

  _fejlecFrissit(all) {
    if (this._cKorszak !== all.korszak) {
      this._cKorszak = all.korszak;
      this._eKorszakNev.textContent = KORSZAK_NEV[all.korszak];
      // Melyik oszlopban látszik a váltás-doboz — ugyanaz a szabály, mint a
      // `_valtasFrissit()`-ben, és csak a korszaktól függ.
      const mutat = all.korszak < KORSZAK.FENY ? all.korszak + 1 : KORSZAK.FENY;
      for (let k = 0; k < KORSZAK_DB; k++) {
        const osz = this._oszlopok[k];
        osz.elem.classList.toggle('aoc-tech-oszlop-aktiv', k === all.korszak);
        osz.elem.classList.toggle('aoc-tech-oszlop-jovo', k > all.korszak);
        osz.nyit.style.display = (k >= 1 && k === mutat) ? 'none' : '';
      }
    }
    const sz = all.korszakHatra > 0 ? all.korszakSzazalek : -1;
    if (this._cKorszakSzazalek !== sz) {
      this._cKorszakSzazalek = sz;
      this._eKorszakHatra.textContent = all.korszakHatra > 0
        ? ' · váltás ' + sz + ' % (' + mpSzoveg(all.korszakHatra) + ')' : '';
    }
    // Egyetlen lenyomat a négy összesítő-számból: így egy összehasonlítás dönt
    // arról, kell-e egyáltalán hozzányúlni a fejléchez.
    const lny = ((all.keszDb * 37 + all.folyikDb) * 37 + all.elerhetoDb) * 37 + all.zartDb;
    if (this._cOsszesites !== lny) {
      this._cOsszesites = lny;
      this._eKesz.textContent = all.keszDb + '/' + TECH_DB;
      this._eFolyik.textContent = String(all.folyikDb);
      this._eElerheto.textContent = String(all.elerhetoDb);
      this._eZarva.textContent = String(all.zartDb);
      for (let k = 0; k < KORSZAK_DB; k++) {
        this._oszlopok[k].allas.textContent =
          all.oszlopKesz[k] + ' kész · ' + all.oszlopElerheto[k] + ' nyitva · ' + all.oszlopZarva[k] + ' zárt';
      }
    }
  }

  _valtasFrissit(all) {
    // Egyszerre EGY váltás-kártya látszik: a következő korszaké. A `FENY`-ben
    // az utolsó marad kint, „nincs tovább" felirattal.
    const mutat = all.korszak < KORSZAK.FENY ? all.korszak + 1 : KORSZAK.FENY;
    const hianyLny = (((all.valtasHiany[0] * 8191 + all.valtasHiany[1]) * 8191
      + all.valtasHiany[2]) * 8191 + all.valtasHiany[3]) | 0;
    const lny = all.valtas * 17 + mutat;
    const szazalek = all.valtas === VALTAS.FOLYIK ? all.korszakSzazalek : -1;
    if (this._cValtas === lny && this._cValtasHiany === hianyLny
      && this._cValtasSzazalek === szazalek) return;
    this._cValtas = lny;
    this._cValtasHiany = hianyLny;
    this._cValtasSzazalek = szazalek;

    for (let k = 1; k < KORSZAK_DB; k++) {
      const v = this._valtasKartyak[k];
      if (!v) continue;
      const latszik = k === mutat;
      v.kartya.style.display = latszik ? '' : 'none';
      if (!latszik) continue;
      v.mondat.textContent = valtasIndok(all);
      v.gomb.disabled = all.valtas !== VALTAS.LEHET;
      v.gomb.textContent = all.valtas === VALTAS.VEGE ? 'Nincs tovább' : 'Korszakváltás';
      const folyik = all.valtas === VALTAS.FOLYIK;
      v.sav.style.display = folyik ? '' : 'none';
      v.savBelso.style.width = folyik ? all.korszakSzazalek + '%' : '0%';
      v.hatra.textContent = folyik ? mpSzoveg(all.korszakHatra) + ' van hátra' : '';
      for (let i = 0; i < v.arElemek.length; i++) {
        const a = v.arElemek[i];
        const h = all.valtasHiany[a.nyers] > 0 && all.valtas !== VALTAS.VEGE;
        if (a.hianyzik !== h) {
          a.hianyzik = h;
          a.elem.classList.toggle('aoc-tech-ar-hianyzik', h);
        }
      }
    }
  }

  _kartyaFrissit(all, t) {
    const k = this._kartyak[t];
    if (!k) return;
    const a = all.allapot[t];
    const z = all.zar[t];
    const sz = all.szazalek[t];
    const o = t * 4;
    const hianyLny = (((all.hiany[o] * 8191 + all.hiany[o + 1]) * 8191
      + all.hiany[o + 2]) * 8191 + all.hiany[o + 3]) | 0;
    if (this._cAllapot[t] === a && this._cZar[t] === z
      && this._cSzazalek[t] === sz && this._cHiany[t] === hianyLny) return;

    const allapotValt = this._cAllapot[t] !== a || this._cZar[t] !== z;
    this._cAllapot[t] = a; this._cZar[t] = z;
    this._cSzazalek[t] = sz; this._cHiany[t] = hianyLny;
    const s = this.tetelek[t];

    if (allapotValt) {
      k.kartya.className = 'aoc-tech-kartya ' + ALLAPOT_OSZTALY[a];
      k.jelveny.textContent = a === TALLAPOT.ZARVA
        ? zarCimke(all, t) : TALLAPOT_NEV[a];
      k.indok.textContent = a === TALLAPOT.ZARVA ? zarIndok(s, all) : '';
      k.indok.style.display = a === TALLAPOT.ZARVA ? '' : 'none';
      k.gomb.disabled = a !== TALLAPOT.ELERHETO;
      k.gomb.textContent = a === TALLAPOT.ZARVA
        ? zarCimke(all, t) : GOMB_FELIRAT[a];
      k.gomb.style.display = a === TALLAPOT.KESZ ? 'none' : '';
      const folyik = a === TALLAPOT.FOLYIK;
      k.sav.style.display = folyik ? '' : 'none';
    }
    if (a === TALLAPOT.FOLYIK) {
      k.savBelso.style.width = sz + '%';
      k.hatra.textContent = mpSzoveg(all.hatra[t]) + ' van hátra (' + sz + ' %)';
    } else if (allapotValt) {
      k.hatra.textContent = a === TALLAPOT.KESZ ? 'Megkutatva.' : '';
    }
    // A hiány-jelzés akkor is frissül, ha az állapot NEM változott: a
    // nyersanyag folyamatosan gyűlik, és a piros szám ettől lesz élő.
    if (a === TALLAPOT.ZARVA || a === TALLAPOT.ELERHETO) {
      for (let i = 0; i < k.arElemek.length; i++) {
        const ae = k.arElemek[i];
        const h = all.hiany[o + ae.nyers] > 0;
        if (ae.hianyzik !== h) {
          ae.hianyzik = h;
          ae.elem.classList.toggle('aoc-tech-ar-hianyzik', h);
        }
      }
      // Zártnál az indoklás számot is tartalmazhat („60 kő hiányzik"), tehát a
      // hiány változásakor újra kell írni.
      if (!allapotValt && a === TALLAPOT.ZARVA) k.indok.textContent = zarIndok(s, all);
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // LÁTHATÓSÁG
  // ══════════════════════════════════════════════════════════════════════

  /** Nyitva van-e a fa. A HUD-váz és a billentyű ezt állítja. */
  get nyitva() { return this._lathato; }
  set nyitva(v) {
    const uj = !!v;
    if (uj === this._lathato) return;
    this._lathato = uj;
    // Nyitáskor KÉNYSZERÍTETT teljes újraírás: amíg zárva volt, nem olvastunk
    // állapotot, tehát a gyorsítótár elavult.
    if (uj) this._kenyszer = true;
    this._lathatosag();
  }
  /** Kényelmi kapcsoló a HUD-nak. */
  valt() { this.nyitva = !this._lathato; }

  set enabled(v) {
    this._enabled = !!v;
    this._lathatosag();
  }
  get enabled() { return this._enabled; }

  _lathatosag() {
    this.gyoker.classList.toggle('aoc-tech-rejtve', !(this._enabled && this._lathato));
  }

  /** Eseménykezelők leszedése — a meccs végén a váz ezt hívja. */
  bont() {
    this.gyoker.removeEventListener('click', this._kattint);
    if (this._billentyu) window.removeEventListener('keydown', this._billentyu);
    this._billentyu = null;
    this.gyoker.textContent = '';
    this.gyoker.classList.remove('aoc-tech-gyoker', 'aoc-tech-rejtve');
  }
}
