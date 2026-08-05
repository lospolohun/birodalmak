// PORTAL HUB TYCOON — BEVEZETŐ.
//
// ── MIÉRT NEM „TUTORIAL" ÉS MIÉRT NEM KATTINTGATÓS ────────────────────────
// A kézenfekvő megoldás egy lépésenkénti bemutató lett volna: kijelöljük a
// gombot, a játékos rákattint, tapsolunk. Ez két dolgot ront el. Egyrészt
// átveszi az irányítást — egy tycoonban pont az a jó, hogy TE döntesz, és a
// bemutató elveszi az első, legfontosabb döntéseket. Másrészt semmit nem
// tanít: aki végigkattintja, az a lépések SORRENDJÉT tanulja meg, nem az OKÁT.
//
// Ez a bevezető ezért CÉLOKAT ad, nem utasításokat. Megmondja, mit érdemes
// most megépíteni ÉS HOGY MIÉRT — aztán békén hagy. A lépés akkor pipálódik
// ki, ha a világ állapota megfelel; hogy a játékos milyen úton jutott oda, az
// az ő dolga. Bármikor eltüntethető, és nem jön vissza.
//
// ── AZ ELSŐ HÁROM LÉPÉS NEM VÉLETLEN ──────────────────────────────────────
// Pontosan az a három hiba, amit a gépi végigjátszások mérése a leggyakrabban
// mutatott: nincs biztonsági ellenőrzés (mindenki csalódottan távozik),
// nincs személyzet (minden 15 %-on megy), és nincs, amiből bevétel lenne.

import { el, be, ures } from './elemek.js';

const KULCS = 'pht:bevezeto-kesz';

/** A lépések. `kesz(sim)` → igaz, ha a világ állapota teljesíti. */
const LEPESEK = [
  {
    kod: 'biztonsag',
    cim: 'Építs biztonsági ellenőrzést',
    szoveg: 'Minden érkező utas tervének ELSŐ tétele a biztonsági ellenőrzés. Amíg nincs, ' +
      'mindenki csalódottan indul tovább — ez a legnagyobb egyetlen hangulatvesztés a játékban. ' +
      'Az építés-sáv „🛡️ Kötelező" fülén találod.',
    kesz: (s) => s.mukodoEpuletVan('biztonsag'),
  },
  {
    kod: 'orok',
    cim: 'Vegyél fel két biztonsági őrt',
    szoveg: 'A személyzet nélküli épület 15 %-on üzemel: helyet foglal, energiát eszik, és sorba ' +
      'állítja a vendégeket. A piros gyémánt az épület fölött pontosan ezt jelenti. ' +
      'A dolgozók a „👷" panelen vannak.',
    kesz: (s) => s.dolgozoSzamTipus('or') >= 2,
  },
  {
    kod: 'kenyelem',
    cim: 'Építs mosdót és várót',
    szoveg: 'A mosdó apró bevétel, a váró semmit nem hoz — de VISSZATÖLTI a türelmet. ' +
      'A türelem a játék valódi valutája: akinek elfogy, dühösen távozik, és a hírnév a ' +
      'TÁVOZÓK hangulatából épül.',
    kesz: (s) => s.mukodoEpuletVan('wc') && s.mukodoEpuletVan('varo'),
  },
  {
    kod: 'bevetel',
    cim: 'Építs éttermet vagy boltot',
    szoveg: 'A portáldíj önmagában nem tart el egy állomást. A pénz a SZOLGÁLTATÁSOKBÓL jön — ' +
      'és minden kiszolgálás javít is a hangulaton. Ne feledd a személyzetet hozzá.',
    kesz: (s) => s.mukodoEpuletVan('etterem') || s.mukodoEpuletVan('bolt'),
  },
  {
    kod: 'tisztasag',
    cim: 'Építs takarítókamrát, és vegyél fel egy koboldot',
    szoveg: 'A kosz ott gyűlik, ahol a tömeg áll, és lassan öl: senki nem panaszkodik rá, ' +
      'mindenki utálja. A takarító kobold odamegy a legkoszosabb épülethez, és ott dolgozik.',
    kesz: (s) => s.mukodoEpuletVan('takarito') && s.dolgozoSzamTipus('kobold') >= 1,
  },
  {
    kod: 'masodik_kapu',
    cim: 'Nyisd meg a második kaput',
    szoveg: 'Egy világgal ez még nem csomópont. Az új kapu több utast és más FAJOKAT hoz — ' +
      'másféle igényekkel. A „🐾 Bestiárium" panelen látod, ki mit akar. ' +
      'Innentől magadtól is boldogulsz: ha elakadsz, a „💡 Tanácsadó" megmondja, mi a szűk keresztmetszet.',
    kesz: (s) => s.nyitottKapuk().length >= 2,
  },
];

export class Bevezeto {
  /**
   * @param {HTMLElement} gyoker
   * @param {import('../sim/sim.js').Sim} sim
   * @param {import('./hud.js').Hud} hud
   */
  constructor(gyoker, sim, hud) {
    this.sim = sim;
    this.hud = hud;
    this.idx = 0;
    this.lathato = !this._keszVolt();
    // Egy betöltött, előrehaladott állomáson ne kezdjen az elejéről: ugorjuk
    // át azt, ami már teljesült. Enélkül a mentés visszatöltése után a
    // bevezető olyasmit kérne, amit a játékos rég megcsinált.
    while (this.idx < LEPESEK.length && LEPESEK[this.idx].kesz(sim)) this.idx++;
    if (this.idx >= LEPESEK.length) this.lathato = false;

    const d = el('div');
    d.id = 'bevezeto';
    // A fejezet-kártyával EGY oszlopba kerül (`#bal`, lásd `hud.js`), nem a
    // gyökérbe fix képpontra: a fejezet célszövege egy sortól négyig terjed,
    // és a régi, abszolút `top: 152px` a hosszabbaknál rácsúszott.
    (document.getElementById('bal') || gyoker).appendChild(d);
    this.doboz = d;
    this._epit();
  }

  _keszVolt() {
    try { return localStorage.getItem(KULCS) === '1'; } catch (e) { return false; }
  }

  _keszrePipal() {
    try { localStorage.setItem(KULCS, '1'); } catch (e) { /* akkor nem */ }
  }

  _epit() {
    const d = ures(this.doboz);
    d.style.display = this.lathato ? 'block' : 'none';
    if (!this.lathato) return;
    const l = LEPESEK[this.idx];
    const fej = el('div', 'fej');
    be(fej, el('span', 'lepes', `${this.idx + 1}/${LEPESEK.length}`), el('b', null, l.cim));
    const be2 = el('button', 'zar', '✕');
    be2.title = 'Bevezető eltüntetése (nem jön vissza)';
    be2.onclick = () => { this.lathato = false; this._keszrePipal(); this._epit(); };
    be(fej, be2);
    be(d, fej, el('p', null, l.szoveg));
  }

  /** Képkockánként. Csak akkor nyúl a DOM-hoz, ha tényleg lépés történt. */
  frissit() {
    if (!this.lathato) return;
    const l = LEPESEK[this.idx];
    if (!l.kesz(this.sim)) return;
    this.hud.uzen(`✓ ${l.cim}`, 'jo');
    this.idx++;
    if (this.idx >= LEPESEK.length) {
      this.lathato = false;
      this._keszrePipal();
      this.hud.uzen('A bevezető véget ért. Innentől a Tanácsadó segít, ha elakadsz.', 'jo');
    }
    this._epit();
  }
}
