// PORTAL HUB TYCOON — FELSŐ SÁV, FEJEZET-KÁRTYA, ÜZENETEK, SÚGÓBUBORÉK.
//
// ── MIÉRT EZ A HAT SZÁM ÉS NEM TÖBB ───────────────────────────────────────
// A HUD nem kimutatás. Minden szám azért van itt, mert VAN RÁ VÁLASZLÉPÉS:
//
//   pénz      → mit engedhetek meg magamnak
//   nap       → mikor jön a következő bérfizetés
//   hírnév    → mennyi utas fog jönni
//   utasszám  → mekkora a terhelés MOST
//   energia   → lassul-e minden (a legalattomosabb hiba: nem hibaüzenet,
//               csak minden rosszabb lesz — ezért van saját, piros jelzése)
//   kosz      → a lassan romló hangulat oka
//
// Ami nem fér ide, az panelbe kerül. Egy tycoonban a HUD hitele azon múlik,
// hogy nem hazudik és nem fecseg — az AoC-nál két HUD-szám hónapokig rossz
// volt, és emiatt az EGÉSZ felületre gyanakodni kellett.
//
// ── ÉS A VÁLASZLÉPÉS LEGYEN EGY KATTINTÁS ─────────────────────────────────
// „Van rá válaszlépés" eddig csak a fejlesztő fejében volt igaz: a játékos
// látta, hogy a hírnév 22, és nem tudta, hova nézzen tovább. Ezért MINDEN
// szám kattintható, és pont abba a panelbe visz, ahol a válasz megszületik
// (pénz → Statisztika, hírnév → Tanácsadó, utas → Bestiárium…). A buborék
// szövege ki is mondja, melyik az.

import { el, be, szoveg, szam, savBeallit } from './elemek.js';
import { JATEK_NEV, VERZIO, SEBESSEGEK, NAP_TICK, RACS_SZINT } from '../mag/config.js';
import { FEJEZETEK, vegtelenCel, rang } from '../sim/tortenet.js';
import { panelNyit } from './panelek.js';
import { tanacsok } from './tanacsado.js';

const SZINEK = ['#ff5d73', '#ffc247', '#63d68a'];

export class Hud {
  /**
   * @param {HTMLElement} gyoker
   * @param {import('../sim/sim.js').Sim} sim
   * @param {{sebesseg:(i:number)=>void}} vezerlo
   */
  constructor(gyoker, sim, vezerlo, hang = null) {
    this.sim = sim;
    this.vezerlo = vezerlo;
    /** A hangréteg — a panelek is innen érik el (`hud.hang`). */
    this.hang = hang;
    this._naploHossz = sim.naplok.length;
    this._riasztasKulcs = null;

    // ── FELSŐ SÁV ────────────────────────────────────────────────────────
    const felso = el('div');
    felso.id = 'felso';

    const nev = el('div', 'cimke');
    nev.id = 'jatek-nev';
    be(nev, el('span', null, JATEK_NEV), el('small', null, ' v' + VERZIO));

    this.penz = this._cimke(felso, '💰', 'pénz', 'statisztika',
      'Készpénz. Ebből épül minden, és ebből mennek a napi bérek is.\nKattints → Statisztika: mi vitte el tegnap.');
    this.nap = this._cimke(felso, '📅', 'nap', 'naplo',
      'Játéknap és napszak. A nap végén jön a bérfizetés és az elszámolás.\nKattints → Napló: mi történt eddig.');
    this.hirnev = this._cimkeSav(felso, '⭐', 'hírnév', 'tanacs',
      'A hírnév a TÁVOZÓK hangulatából épül, és ő szabja meg, hányan jönnek.\nHa csúszik lefelé, nem drágább kapu kell, hanem több pult.\nKattints → Tanácsadó.');
    this.utas = this._cimke(felso, '👥', 'utas', 'bestiarium',
      'Hány lény van MOST az állomáson. Ez a pillanatnyi terhelés.\nKattints → Bestiárium: ki van bent, és mit akar.');
    this.energia = this._cimke(felso, '⚡', 'energia', 'tanacs', '');
    this.kosz = this._cimkeSav(felso, '🧹', 'tisztaság', 'tanacs',
      'A kosz ott gyűlik, ahol a tömeg áll, és lassan viszi a hangulatot.\nVálaszlépés: takarítókamra + takarító kobold.\nKattints → Tanácsadó.');

    felso.insertBefore(nev, felso.firstChild);

    // ── SZINTVÁLASZTÓ ────────────────────────────────────────────────────
    // MIÉRT A FELSŐ SÁVBAN ÉS NEM AZ ÉPÍTÉS-SÁVBAN: mert nem eszköz, hanem
    // NÉZET. Az építés-sávban az ember eszköznek hinné, és azt várná, hogy
    // „szintet rak le" — holott azt választja ki, melyik emeleten dolgozik és
    // meddig lát. A fölötte lévő emeletek el is tűnnek, különben a saját
    // padlójukkal takarnák ki azt, amit épp építesz.
    //
    // A billentyű (R/F) a gomb FELIRATÁN is ott van, nem csak a buborékban:
    // a szintváltás a játék egyik legritkábban felfedezett funkciója volt.
    const szintDoboz = el('div');
    szintDoboz.id = 'szintek';
    be(szintDoboz, el('span', 'sarok', 'szint'));
    this.szintGombok = [];
    const szintNev = ['F', '1', '2', '3', '4'];
    for (let i = 0; i < RACS_SZINT; i++) {
      const g = el('button', i === 0 ? 'aktiv' : '', szintNev[i] || String(i));
      g.title = (i === 0 ? 'Földszint' : `${i}. emelet`) +
        '\nR = egy szinttel feljebb, F = lejjebb.\nA választott szint FÖLÖTT lévő emeletek eltűnnek, hogy lásd, mit építesz.';
      g.onclick = () => vezerlo.szint(i);
      szintDoboz.appendChild(g);
      this.szintGombok.push(g);
    }
    felso.appendChild(szintDoboz);

    // ── SEBESSÉG ─────────────────────────────────────────────────────────
    const seb = el('div');
    seb.id = 'sebesseg';
    this.sebGombok = [];
    const felirat = ['⏸', '▶', '▶▶', '▶▶▶'];
    for (let i = 0; i < SEBESSEGEK.length; i++) {
      const g = el('button', i === 1 ? 'aktiv' : '', felirat[i]);
      g.title = `Sebesség: ${SEBESSEGEK[i]}×\nszóköz = szünet, 1–4 = sebesség`;
      g.onclick = () => vezerlo.sebesseg(i);
      seb.appendChild(g);
      this.sebGombok.push(g);
    }
    // ── HANGKAPCSOLÓ ─────────────────────────────────────────────────────
    // Egyetlen gomb, mert a hangerőt ritkán állítja az ember, a némítást
    // viszont azonnal akarja — például amikor valaki bejön a szobába.
    // A finomhangolás (mester/zene) a Mentés-panelben van.
    if (hang) {
      const h = el('button');
      h.id = 'hangGomb';
      h.textContent = '🔊';
      h.title = 'Hang némítása / visszakapcsolása';
      h.onclick = () => {
        const uj = !hang.be;
        hang.inditas();
        hang.nemit(!uj);
        h.textContent = hang.be ? '🔊' : '🔇';
      };
      seb.appendChild(h);
    }

    felso.appendChild(seb);
    gyoker.appendChild(felso);

    // Minden gombkattintás halk visszajelzést kap. Egyetlen figyelő az egész
    // felületre: nem kell minden gombnál külön gondolni rá, és nem is
    // maradhat ki egy új panelnél sem.
    if (hang) {
      gyoker.addEventListener('click', (e) => {
        if (e.target && e.target.closest && e.target.closest('button')) hang.jelez('gomb');
      });
    }

    // ── BAL OSZLOP ───────────────────────────────────────────────────────
    // MIÉRT OSZLOP ÉS NEM KÉT ABSZOLÚT DOBOZ: a fejezet-kártya magassága a
    // célszövegtől függ (egy sortól négyig), a bevezető pedig fix 152 px-en
    // ült alatta. A hosszabb célszövegeknél a kettő EGYMÁSRA CSÚSZOTT — ezt
    // egy fix szám sosem tudja jól megoldani. Így a doboz alatt a következő
    // magától lejjebb kerül, bármilyen hosszú a szöveg.
    const bal = el('div');
    bal.id = 'bal';
    gyoker.appendChild(bal);
    this.balOszlop = bal;

    // ── FEJEZET-KÁRTYA ───────────────────────────────────────────────────
    const f = el('div');
    f.id = 'fejezet';
    this.fejCim = el('h3');
    this.fejCel = el('p');
    const sav = el('div', 'sav');
    this.fejSav = el('i');
    sav.appendChild(this.fejSav);
    be(f, this.fejCim, this.fejCel, sav);
    bal.appendChild(f);
    this.fejezetDoboz = f;

    // ── RIASZTÁS-CSÍK ────────────────────────────────────────────────────
    // A tanácsadó eddig egy ikon volt a kilenc oldalgomb között — pont akkor
    // volt a legnehezebb észrevenni, amikor a legnagyobb szükség lett volna
    // rá. Ez a csík CSAK a `baj` súlyosságú tanácsnál jelenik meg (áramszünet,
    // személyzet nélküli épület, hírnév-gödör, mínusz), egy sorban, és
    // kattintásra megnyitja a Tanácsadót. Ha minden rendben, nincs is ott —
    // tehát nem zsúfol, viszont amikor megjelenik, azt észre kell venni.
    const r = el('button');
    r.id = 'riasztas';
    r.onclick = () => panelNyit('tanacs');
    r.style.display = 'none';
    bal.appendChild(r);
    this.riasztas = r;

    // ── ÜZENETEK ─────────────────────────────────────────────────────────
    const u = el('div');
    u.id = 'uzenetek';
    gyoker.appendChild(u);
    this.uzenetek = u;

    // ── SÚGÓBUBORÉK ──────────────────────────────────────────────────────
    const b = el('div');
    b.id = 'buborek';
    gyoker.appendChild(b);
    this.buborek = b;

    // A buborékot a `fo.js` az EGÉR CELLÁJA alapján kéri, a cellát viszont
    // csak a vászon fölötti mozgás frissíti. Aki a vászonról a panelre húzta
    // az egeret, annál a cella BENN RAGADT, és az épület-buborék ott maradt a
    // felület fölött — a kezdőképernyőn épp a fejezet-kártyát takarta ki.
    // Ezért a buborék tudja, hogy a mutató a felületen van-e.
    this._uiFolott = false;
    addEventListener('pointermove', (e) => {
      const t = e.target;
      this._uiFolott = !!(t && t.closest && t.closest('#ui > *'));
      if (this._uiFolott && this.buborek.style.display === 'block') this.buborek.style.display = 'none';
    }, { passive: true });
  }

  /**
   * @param {HTMLElement} szulo
   * @param {string} ikon
   * @param {string} cim rövid név (a buborék fejléce)
   * @param {string} [lap] melyik panel a VÁLASZLÉPÉS helye
   * @param {string} [magyarazat] mit jelent és mit kezdj vele
   */
  _cimke(szulo, ikon, cim, lap, magyarazat) {
    const c = el('div', 'cimke ertek');
    c.title = magyarazat ? `${cim.toUpperCase()}\n${magyarazat}` : cim;
    const b = el('b', null, '—');
    be(c, el('span', 'ikon', ikon), b);
    szulo.appendChild(c);
    c._ertek = b;
    if (lap) {
      c.classList.add('kattinthato');
      c.onclick = () => panelNyit(lap);
    }
    return c;
  }

  _cimkeSav(szulo, ikon, cim, lap, magyarazat) {
    const c = this._cimke(szulo, ikon, cim, lap, magyarazat);
    const sav = el('div', 'sav');
    const i = el('i');
    sav.appendChild(i);
    c.appendChild(sav);
    c._sav = i;
    return c;
  }

  szintJeloles(i) {
    for (let k = 0; k < this.szintGombok.length; k++) this.szintGombok[k].classList.toggle('aktiv', k === i);
  }

  sebessegJeloles(i) {
    for (let k = 0; k < this.sebGombok.length; k++) this.sebGombok[k].classList.toggle('aktiv', k === i);
  }

  /** Képkockánként. Csak akkor ír a DOM-ba, ha tényleg változott az érték. */
  frissit() {
    const s = this.sim;
    szoveg(this.penz._ertek, szam(s.penz));
    this.penz.classList.toggle('baj', s.penz < 0);

    const oraArany = (s.tick % NAP_TICK) / NAP_TICK;
    szoveg(this.nap._ertek, `${s.nap}. nap ${Math.floor(oraArany * 24)}:00`);

    szoveg(this.hirnev._ertek, s.hirnev.toFixed(0));
    savBeallit(this.hirnev._sav, s.hirnev / 100, SZINEK);
    // A hírnév ÖNMAGÁBAN félrevezet: a 62 egészen mást jelent 40-ről jövet,
    // mint 85-ről csúszva. A nyíl a legutóbbi teljes nap óta mért irányt
    // mutatja — ennyi elég ahhoz, hogy a játékos tudja, sürgős-e.
    const tort = s.napiTortenet;
    let irany = '';
    if (tort && tort.length > 0) {
      const k = tort[tort.length - 1].hirnev;
      if (typeof k === 'number') irany = s.hirnev > k + 1.5 ? ' ▲' : (s.hirnev < k - 1.5 ? ' ▼' : '');
    }
    if (this.hirnev._irany !== irany) {
      this.hirnev.classList.toggle('fel', irany === ' ▲');
      this.hirnev.classList.toggle('le', irany === ' ▼');
      this.hirnev._irany = irany;
    }

    szoveg(this.utas._ertek, `${s.utasSzam}`);

    // Az energia a legalattomosabb szám, ezért nem elég kiírni: a KÜSZÖB
    // KÖZELÉBEN is szólni kell. Az áramszünet ugyanis nem hibaüzenet, csak
    // annyi, hogy minden 40 %-on megy — utólag pedig senki nem találja ki,
    // mikor kezdődött.
    szoveg(this.energia._ertek, `${s.energiaIgeny} / ${s.energiaTermeles}`);
    const szoros = !s.aramszunet && s.energiaTermeles > 0 && s.energiaIgeny > s.energiaTermeles * 0.88;
    this.energia.classList.toggle('baj', s.aramszunet);
    this.energia.classList.toggle('gond', szoros);
    const energiaCim = s.aramszunet
      ? 'ENERGIA — ÁRAMSZÜNET!\nA fogyasztás meghaladja a termelést, ezért MINDEN szolgáltatás 40 %-on megy.\nVálaszlépés: építs energiamagot, vagy kapcsolj ki egy épületet.'
      : (szoros
        ? 'ENERGIA — kevés a tartalék\nfogyasztás / termelés. A következő épület már áramszünetbe vihet.\nVálaszlépés: energiamag.'
        : 'ENERGIA\nfogyasztás / termelés. Ha a fogyasztás nagyobb, minden 40 %-on megy.\nKattints → Tanácsadó.');
    if (this.energia.title !== energiaCim) this.energia.title = energiaCim;

    const tiszta = 1 - s.kosz / 1000;
    szoveg(this.kosz._ertek, `${Math.round(tiszta * 100)}%`);
    savBeallit(this.kosz._sav, tiszta, SZINEK);
    this.kosz.classList.toggle('gond', tiszta < 0.5);

    this._fejezetet();
    this._riasztast();
    this._naplot();
  }

  /**
   * A legsúlyosabb tanács kiemelése a bal oszlopba.
   *
   * Csak `baj` szinten jelenik meg — ha minden apróságnál kint lenne, két
   * perc alatt megtanulná az ember átnézni rajta, és pont azt veszítenénk el,
   * amiért készült. Fél másodpercenként számol, nem képkockánként: a
   * `tanacsok()` végigmegy az épületeken, és a HUD 60 Hz-en fut.
   */
  _riasztast() {
    const most = this.sim.tick;
    if (this._riasztasTick !== undefined && most - this._riasztasTick < 10) return;
    this._riasztasTick = most;
    // ⚠️ AZ ELSŐ NAPON NINCS RIASZTÁS, ÉS EZ NEM LUSTASÁG. Az állomás az
    // ingyen kapott energiamaggal indul, amiben nincs szerelő — a tanácsadó
    // szabályai szerint ez azonnal `baj` szintű („épület személyzet nélkül").
    // Vagyis a lüktető piros csík a MÁSODPERC NULLÁN megjelent volna, a
    // bevezető kártyája MELLETT, ugyanabban az oszlopban. Két, egymással
    // versengő „ezt csináld most" doboz az első percben pontosan az a
    // zsúfoltság, ami ellen az egész elrendezés készült — és megtanítja a
    // játékost, hogy a piros csík semmit nem jelent. Az első napon a
    // bevezető a kalauz; a jelzőpont (💡 gomb) addig is ott van.
    if (this.sim.nap < 2) { this.riasztas.style.display = 'none'; this._riasztasKulcs = null; return; }
    const lista = tanacsok(this.sim, 3);
    const elso = lista.find((t) => t.sulyossag === 'baj');
    const kulcs = elso ? elso.ikon + elso.cim : null;
    if (kulcs === this._riasztasKulcs) return;
    this._riasztasKulcs = kulcs;
    if (!elso) { this.riasztas.style.display = 'none'; return; }
    this.riasztas.textContent = `${elso.ikon}  ${elso.cim}`;
    this.riasztas.title = elso.szoveg + '\n\nKattints a Tanácsadó megnyitásához.';
    this.riasztas.style.display = 'block';
  }

  _fejezetet() {
    const s = this.sim;
    const t = s.tortenet;
    // ── VÉGTELEN MÓD ────────────────────────────────────────────────────
    // A hét fejezet után a kártya nem tűnik el és nem lesz üres gratuláció:
    // korszakot és rangot mutat, ugyanazzal a haladásjelzővel. A játékosnak
    // a győzelem után is legyen mit néznie ezen a helyen.
    if (t.allapot === 'vegtelen') {
      const r = rang(t.korszak);
      const cel = vegtelenCel(t.korszak);
      const utas = s.elegedettTavozok - t.korszakAlap;
      szoveg(this.fejCim, `${r.ikon} ${t.korszak}. korszak — ${r.nev}`);
      szoveg(this.fejCel, `${cel.szoveg}  (${szam(utas)}/${szam(cel.utas)})`);
      savBeallit(this.fejSav, s.korszakHalad(), SZINEK);
      this.fejezetDoboz.style.borderLeftColor = s.hirnev >= cel.hirnev ? '#ffd257' : '#ff5d73';
      return;
    }
    if (t.fejezet >= FEJEZETEK.length) {
      szoveg(this.fejCim, '★ Az ív végére értél');
      szoveg(this.fejCel, 'Az állomás a hálózat közepe.');
      savBeallit(this.fejSav, 1, SZINEK);
      return;
    }
    const f = FEJEZETEK[t.fejezet];
    szoveg(this.fejCim, `${f.ikon} ${f.cim}`);
    szoveg(this.fejCel, f.celSzoveg);
    const h = f.halad(s);
    savBeallit(this.fejSav, h, SZINEK);
    // A haladásjelző százaléka a fejezet-kártya buborékjában: a csík
    // önmagában nem árulja el, hogy „majdnem" vagy „még sehol".
    const cim = `${f.cim} — ${Math.round(h * 100)} % kész\n${f.celSzoveg}`;
    if (this.fejezetDoboz.title !== cim) this.fejezetDoboz.title = cim;
  }

  /** Az új naplósorok buborékként felúsznak, majd eltűnnek. */
  _naplot() {
    const n = this.sim.naplok;
    if (n.length === this._naploHossz) return;
    for (let i = Math.max(this._naploHossz, n.length - 4); i < n.length; i++) this.uzen(n[i].szoveg, n[i].fajta);
    this._naploHossz = n.length;
  }

  /** @param {string} sz @param {'info'|'jo'|'gond'|'baj'} fajta */
  uzen(sz, fajta = 'info') {
    const e = el('div', 'uzenet ' + fajta, sz);
    this.uzenetek.appendChild(e);
    // Négynél többet nem tartunk: az üzenetsáv nem naplónézet, hanem
    // figyelemfelhívás. A teljes napló a panelben van.
    while (this.uzenetek.childElementCount > 4) this.uzenetek.removeChild(this.uzenetek.firstChild);
    // A hibaüzenet tovább marad kint, mint az örömhír: azt el KELL olvasni,
    // különben a játékos csak annyit lát, hogy „nem történt semmi".
    const ido = fajta === 'baj' ? 9000 : (fajta === 'gond' ? 7500 : 6000);
    setTimeout(() => { if (e.parentNode) e.parentNode.removeChild(e); }, ido);
  }

  /** Súgóbuborék az egérnél. `null` szöveggel eltűnik. */
  buborekot(html, x, y) {
    const b = this.buborek;
    if (!html || this._uiFolott) { b.style.display = 'none'; return; }
    if (b._html !== html) { b.innerHTML = html; b._html = html; }
    b.style.display = 'block';
    const sz = b.offsetWidth, m = b.offsetHeight;
    b.style.left = Math.min(innerWidth - sz - 8, x + 16) + 'px';
    b.style.top = Math.min(innerHeight - m - 8, y + 16) + 'px';
  }
}
