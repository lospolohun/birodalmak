// AGE OF THE CRYSTALS — MENÜ-SZONDA (v0.11/2).
//
// ── MIÉRT VAN EZ EGYÁLTALÁN ───────────────────────────────────────────────
// A főmenüt EGYETLEN meglévő kapu sem őrzi. A determinizmus-szonda
// forgatókönyvekből dolgozik, és a menü nincs bennük — a menü kódja SOSEM fut
// le a `npm run det` alatt. Az FPS-szonda a felhőben meg sem szólal (nincs
// GPU). A menü tehát pont abba a résbe esne, ahol a projekt már háromszor
// megégett: zöld kapu egy halott vagy hazug rendszer mellett.
//
// ── MIT MÉR — VAGYIS MI AZ A SZÁM, AMI ELÁRULJA, HOGY CSINÁL IS VALAMIT ───
// Nem az, hogy „lefut". Hét gát van, és mindegyik egy KONKRÉT hibát fog meg:
//
//   1. MINDEN KÉPERNYŐ ELÉRHETŐ a főmenüből — és nem a táblázat szerint,
//      hanem VALÓDI `lep()`-ekkel végigjárva. Egy menüpont, ami sehova nem
//      vezet, tökéletesen determinisztikus és teljesen haszontalan. Ugyanitt
//      dől el, hogy a táblázat nem hazudik: minden deklarált lépés tényleg oda
//      visz, ahova írva van.
//   2. MINDEN KÉPERNYŐRŐL VAN VISSZAÚT a főmenübe. A zsákutca a menük
//      klasszikus hibája, és a játékos számára megkülönböztethetetlen a
//      lefagyástól.
//   3. AZ ÉRVÉNYTELEN LÉPÉS ELUTASÍTÁSBA FUT. Enélkül az 1. gát semmit nem
//      érne: egy állapotgép, ami mindent elfogad, „elérhetővé" tesz minden
//      képernyőt — és közben nincs is állapotgép.
//   4. ÉRVÉNYTELEN KONFIG MINDEN MEZŐRE, NÉVVEL. A `Sim` szándékosan megengedő
//      (ismeretlen presetre csendben a nyílt mezőt adja, a seedet vágja) — ha a
//      menü sem szól, a játékos némán kap más pályát, mint amit kért.
//   5. A VÉGIGJÁTSZOTT ÚT VALÓDI KONFIGOT AD: mind a hat térkép-presettel és
//      három civ-párossal, és MIND A TIZENNYOLC KÜLÖNBÖZŐ. Egy menü, ami
//      mindig ugyanazt a konfigot adja vissza, az összes fenti gáton átmenne.
//   6. A MENÜ DETERMINISZTIKUS: ugyanaz a bemenet-sorozat ugyanazt a konfigot
//      adja, két frissen épített menü ugyanazt a seedet hozza, és a forrásban
//      nincs óra (`Date.now`, `performance.now`) meg nincs `Math.random`. A
//      v0.8-ban a két gépnek UGYANAZT a meccs-konfigot kell kapnia; egy
//      óráról seedelő menü ott azonnali desync.
//   7. A BETÖLTÉS-ÁG NEM DÍSZ: a mentés fejlécéből valódi konfig lesz, és a
//      seed/méret/preset a MENTÉSBŐL jön. Enélkül a hívó a menü saját seedjével
//      építene `Sim`-et, és a `betoltes()` minden mentést elutasítana („más
//      seed: a terep nem egyezne").
//
// HASZNÁLAT:  node tools/menu_szonda.mjs
// Kilépési kód: 0 = rendben, 1 = bukás.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const GYOKER = dirname(dirname(fileURLToPath(import.meta.url)));
const be = (...r) => import(pathToFileURL(join(GYOKER, ...r)).href);

const {
  MenuAllapot, KEPERNYO, KEPERNYO_DB, KEPERNYO_NEV, ATMENETEK,
  MEZOK, MEZO_NEV, mezoErvenyes, mentesFejlec,
  terkepLista, nehezsegLista, meretLista,
} = await be('src', 'ui', 'menu_adat.js');
const { TERKEP, TERKEP_DB } = await be('src', 'sim', 'terkep.js');
const { CIV, CIV_NEV, CIV_NINCS } = await be('src', 'sim', 'civ.js');
const { NEHEZSEG } = await be('src', 'sim', 'ai.js');
const { MENTES_VERZIO } = await be('src', 'sim', 'mentes.js');

let bukas = 0;
const sor = (a, b, c) => console.log('  ' + String(a).padEnd(30) + String(b).padEnd(24) + (c ?? ''));
const cim = (t) => console.log('\n' + t + '\n' + '─'.repeat(78));
const gat = (all, szoveg, reszlet) => {
  if (all) return true;
  console.log('\n  ⛔ ' + szoveg);
  if (reszlet) console.log('     ' + reszlet);
  bukas++;
  return false;
};

cim('AGE OF THE CRYSTALS — MENÜ-SZONDA (v0.11/2)');

// ── A PRÓBA-TÁROLÓ ────────────────────────────────────────────────────────
// A mentés-forrás EGY PICI felület (`kulcsok` / `olvas`), pont azért, hogy itt
// ki lehessen tölteni. Így a betöltés-lap ugyanazon a kódúton fut node-ban,
// mint böngészőben — nem marad „csak élesben futó" ág a kapun kívül.
const MENTESEK = {
  'aotc-mentes': JSON.stringify({
    verzio: MENTES_VERZIO, seed: 424242, n: 192, terkep: TERKEP.ERDOSEG, tick: 1234,
  }),
  'aotc-mentes-2': JSON.stringify({
    verzio: MENTES_VERZIO, seed: 7, n: 256, terkep: TERKEP.FOLYAM, tick: 40,
  }),
  'aotc-mentes-regi': JSON.stringify({
    verzio: MENTES_VERZIO - 1, seed: 1, n: 256, terkep: 0, tick: 5,
  }),
  'aotc-mentes-romlott': '{ez nem json',
};
const TAROLO = {
  kulcsok: () => Object.keys(MENTESEK).sort(),
  olvas: (k) => (Object.prototype.hasOwnProperty.call(MENTESEK, k) ? MENTESEK[k] : null),
};

const ujMenu = (op) => new MenuAllapot(Object.assign({ tarolo: TAROLO }, op || {}));

/**
 * A továbblépéshez szükséges MINIMÁLIS kitöltés az adott képernyőn.
 * Enélkül az őrök jogosan tartanák vissza a bejárást, és a gráf-gát abból nem
 * tudná eldönteni, hogy zsákutca vagy csak hiányzó adat.
 */
function felkeszit(m) {
  m.beallit('civ0', CIV.KRISTALYKOVACS);
  m.beallit('civ1', CIV.PUSZTAI_LOVAS);
  if (m.kepernyo === KEPERNYO.BETOLTES) m.mentesValaszt('aotc-mentes');
}

// ── 1. VIZSGÁLAT — MINDEN KÉPERNYŐ ELÉRHETŐ ───────────────────────────────
cim('1. VIZSGÁLAT — minden képernyő elérhető a főmenüből');

/** Szélességi bejárás az ELŐRE-lépéseken. A `vissza` szándékosan kimarad. */
function bfs() {
  const tav = new Array(KEPERNYO_DB).fill(-1);
  const honnan = new Array(KEPERNYO_DB).fill(null);
  tav[KEPERNYO.FOMENU] = 0;
  const s = [KEPERNYO.FOMENU];
  while (s.length > 0) {
    const k = s.shift();
    const lista = ATMENETEK[k] || [];
    for (let i = 0; i < lista.length; i++) {
      const t = lista[i];
      if (tav[t.cel] >= 0) continue;
      tav[t.cel] = tav[k] + 1;
      honnan[t.cel] = { elozo: k, akcio: t.akcio };
      s.push(t.cel);
    }
  }
  return { tav, honnan };
}
const { tav, honnan } = bfs();

function utvonal(cel) {
  const ki = [];
  let k = cel;
  while (k !== KEPERNYO.FOMENU) {
    const h = honnan[k];
    if (!h) return null;
    ki.unshift(h.akcio);
    k = h.elozo;
  }
  return ki;
}

/** VALÓDI végigjátszás: a táblát nem elhisszük, hanem meghajtjuk. */
function odavezet(cel) {
  const ut = utvonal(cel);
  if (ut === null) return { ok: false, ut: null, hiba: 'nincs út a táblában' };
  const m = ujMenu();
  felkeszit(m);
  for (let i = 0; i < ut.length; i++) {
    const e = m.lep(ut[i]);
    if (!e.ok) {
      return {
        ok: false, ut,
        hiba: 'a(z) „' + ut[i] + '" lépés elakadt itt: ' + KEPERNYO_NEV[m.kepernyo]
          + ' — ' + e.hibak.map((h) => h.mezo + ': ' + h.hiba).join(' · '),
      };
    }
    felkeszit(m);
  }
  if (m.kepernyo !== cel) {
    return { ok: false, ut, hiba: 'az út ide vitt: ' + KEPERNYO_NEV[m.kepernyo] };
  }
  return { ok: true, ut, menu: m };
}

sor('képernyő', 'lépés a főmenüből', 'út');
let elerhetetlen = 0;
const utak = [];
for (let k = 0; k < KEPERNYO_DB; k++) {
  const e = odavezet(k);
  utak[k] = e;
  if (!e.ok) elerhetetlen++;
  sor(KEPERNYO_NEV[k], e.ok ? e.ut.length + ' lépés' : 'ELÉRHETETLEN',
    e.ok ? (e.ut.join(' → ') || '(a kiindulás)') : '⛔ ' + e.hiba);
}
gat(elerhetetlen === 0, elerhetetlen + ' KÉPERNYŐ NEM ÉRHETŐ EL A FŐMENÜBŐL.',
  'Egy menüpont, ami sehova nem vezet, tökéletesen determinisztikus és '
  + 'teljesen haszontalan. Vagy hiányzik egy átmenet az `ATMENETEK`-ből, vagy '
  + 'egy őr olyat követel, amit azon az úton nem lehet megadni.');

// A TÁBLÁZAT NE HAZUDJON: minden deklarált lépés tényleg oda visz, ahova írva van.
let hazug = 0;
let atmenetDb = 0;
for (let k = 0; k < KEPERNYO_DB; k++) {
  const lista = ATMENETEK[k] || [];
  for (let i = 0; i < lista.length; i++) {
    atmenetDb++;
    const t = lista[i];
    const e = odavezet(k);
    if (!e.ok) { hazug++; continue; }
    felkeszit(e.menu);
    const l = e.menu.lep(t.akcio);
    if (!l.ok || e.menu.kepernyo !== t.cel) {
      hazug++;
      console.log('  ⛔ ' + KEPERNYO_NEV[k] + ' — „' + t.akcio + '" → várt: '
        + KEPERNYO_NEV[t.cel] + ', kapott: '
        + (l.ok ? KEPERNYO_NEV[e.menu.kepernyo] : 'ELUTASÍTVA ('
          + l.hibak.map((h) => h.hiba).join(' · ') + ')'));
    }
  }
}
sor('deklarált átmenet', atmenetDb, hazug === 0 ? 'mind oda visz, ahova írva van' : '⛔');
gat(hazug === 0, hazug + ' ÁTMENET NEM ODA VISZ, AHOVA A TÁBLÁZAT MONDJA.',
  'A `menu.js` a gombokat az `ATMENETEK`-ből építi — ha a tábla és a `lep()` '
  + 'elcsúszik, a felirat mást ígér, mint amit a kattintás csinál.');

// Minden képernyőnek legyen ÉRTELME: vagy vezet valahova, vagy kimenete van.
let zsak = 0;
for (let k = 0; k < KEPERNYO_DB; k++) {
  const kifele = (ATMENETEK[k] || []).length;
  const kimenet = k === KEPERNYO.INDITAS || k === KEPERNYO.BEALLITASOK;
  if (kifele === 0 && !kimenet) zsak++;
}
gat(zsak === 0, zsak + ' KÉPERNYŐ SEM ELŐRE NEM VISZ, SEM KIMENETE NINCS.');

// ── 2. VIZSGÁLAT — VISSZAÚT ───────────────────────────────────────────────
cim('2. VIZSGÁLAT — minden képernyőről van visszaút a főmenübe');
sor('képernyő', 'vissza-lépés', 'hova ért');

let zsakutca = 0;
for (let k = 0; k < KEPERNYO_DB; k++) {
  if (!utak[k].ok) { zsakutca++; continue; }
  const m = utak[k].menu;
  let lepes = 0;
  while (m.kepernyo !== KEPERNYO.FOMENU && lepes <= KEPERNYO_DB + 2) {
    const e = m.lep('vissza');
    if (!e.ok) break;
    lepes++;
  }
  const ok = m.kepernyo === KEPERNYO.FOMENU;
  if (!ok) zsakutca++;
  sor(KEPERNYO_NEV[k], lepes + ' × vissza',
    KEPERNYO_NEV[m.kepernyo] + (ok ? '' : '   ⛔'));
}
gat(zsakutca === 0, zsakutca + ' KÉPERNYŐRŐL NEM LEHET VISSZAJUTNI A FŐMENÜBE.',
  'A zsákutca a menük klasszikus hibája: a játékos számára megkülönböztet-'
  + 'hetetlen a lefagyástól, és semmilyen determinizmus-gát nem veszi észre.');

// A verem ALJA is gát: a főmenüben a `vissza` ELUTASÍTÁS, nem összeomlás és
// nem néma semmittevés.
const alja = ujMenu();
const aljaE = alja.lep('vissza');
sor('főmenü → vissza', aljaE.ok ? 'ELFOGADVA ⛔' : 'elutasítva',
  aljaE.ok ? '' : aljaE.hibak[0].hiba);
gat(!aljaE.ok && alja.kepernyo === KEPERNYO.FOMENU,
  'A FŐMENŰBEN A `vissza` NEM FUTOTT ELUTASÍTÁSBA.',
  'A verem alól kilépve a következő `vissza` már `undefined` képernyőre vinne.');

// ── 3. VIZSGÁLAT — AZ ÉRVÉNYTELEN LÉPÉS ELUTASÍTÁSBA FUT ──────────────────
cim('3. VIZSGÁLAT — ami nincs a táblában, azt a menü nem lépi meg');

const OSSZES_AKCIO = new Set(['vissza']);
for (let k = 0; k < KEPERNYO_DB; k++) {
  for (const t of ATMENETEK[k] || []) OSSZES_AKCIO.add(t.akcio);
}
// Kitalált nevek is: egy „mindenre igent mondó" állapotgép ezeken bukik el.
const KITALALT = ['indit', 'kilepes', '', 'TOVABB', 'uj_jatek2', null, undefined, 42];
let elfogadott = 0;
let probaDb = 0;
for (let k = 0; k < KEPERNYO_DB; k++) {
  const e = odavezet(k);
  if (!e.ok) continue;
  const engedett = new Set((ATMENETEK[k] || []).map((t) => t.akcio));
  if (k !== KEPERNYO.FOMENU) engedett.add('vissza');
  const probak = [...OSSZES_AKCIO, ...KITALALT];
  for (const a of probak) {
    if (engedett.has(a)) continue;
    probaDb++;
    const m = ujMenu();
    felkeszit(m);
    for (const lep of e.ut) { m.lep(lep); felkeszit(m); }
    const elotte = m.kepernyo;
    // A KIVÉTEL IS BUKÁS. Az ismeretlen lépésre a menü ELUTASÍTÁSSAL felel,
    // nem dobással: a `menu.js` egyetlen kattintás-figyelője különben az első
    // félreütésre elszállna, és onnantól a MENÜ EGÉSZE halott lenne.
    let r;
    try {
      r = m.lep(a);
    } catch (h) {
      elfogadott++;
      console.log('  ⛔ ' + KEPERNYO_NEV[k] + ': KIVÉTELT DOBOTT a(z) ' + String(a)
        + ' lépésre — ' + h.message);
      continue;
    }
    if (r.ok || m.kepernyo !== elotte) {
      elfogadott++;
      console.log('  ⛔ ' + KEPERNYO_NEV[k] + ': elfogadta a(z) ' + String(a) + ' lépést → '
        + KEPERNYO_NEV[m.kepernyo]);
    }
  }
}
sor('tiltott lépés-próba', probaDb, elfogadott === 0 ? 'mind elutasítva' : '⛔');
gat(elfogadott === 0, elfogadott + ' TILTOTT LÉPÉST MEGLÉPETT A MENÜ.',
  'Egy állapotgép, ami mindent elfogad, nem állapotgép — és az 1. gát '
  + '„elérhetőségei" is értéktelenné válnak tőle.');

// ── 4. VIZSGÁLAT — ÉRVÉNYTELEN KONFIG, MEZŐNKÉNT, NÉVVEL ─────────────────
cim('4. VIZSGÁLAT — érvénytelen konfig MINDEN mezőre elutasításba fut');
sor('mező', 'rossz érték', 'elutasítás');

/** Mezőnként: rossz értékek, majd egy jó. A jó ág is gát — lásd lentebb. */
const ROSSZ = {
  seed: [-1, 4294967296, 1.5, NaN, 'húsz', null, undefined, {}],
  n: [0, 63, 1025, 256.5, '256', null],
  terkep: [-1, TERKEP_DB, 99, 1.5, '2', null],
  nehezseg: [-1, 3, 99, 'nehéz', null],
  maxEgyseg: [0, 199, 8001, 2400.5, '2400', null],
  sajatCsapat: [-1, 2, 0.5, '0', null, true],
  civ0: [CIV_NINCS, -2, 8, 99, '0', null],
  civ1: [CIV_NINCS, -2, 8, 99, '0', null],
};
const JO = {
  seed: 20260803, n: 192, terkep: TERKEP.HEGYVIDEK, nehezseg: NEHEZSEG.NEHEZ,
  maxEgyseg: 1200, sajatCsapat: 1, civ0: CIV.FENYHOZO, civ1: CIV.BASTYAORZO,
};

let atengedett = 0;
let nevtelenul = 0;
let joElutasitva = 0;
let rosszDb = 0;
for (const mezo of MEZOK) {
  const m = ujMenu();
  let hibas = 0;
  for (const ertek of ROSSZ[mezo]) {
    rosszDb++;
    const e = m.beallit(mezo, ertek);
    if (e.ok) {
      atengedett++;
      console.log('  ⛔ ' + mezo + ': ÁTENGEDTE a(z) ' + String(ertek) + ' értéket');
      continue;
    }
    hibas++;
    // A hibaüzenet NEVEZZE MEG a mezőt — enélkül a játékos annyit lát, hogy
    // „valami rossz", és a hét mező közül nem tudja, melyik.
    if (e.mezo !== mezo || !e.hiba || e.hiba.length < 8) {
      nevtelenul++;
      console.log('  ⛔ ' + mezo + ': névtelen vagy üres hibaüzenet: ' + JSON.stringify(e));
    }
  }
  // A JÓ ÉRTÉK MENJEN ÁT. Enélkül egy „mindent elutasító" ellenőrzés is
  // hibátlannak látszana — és a menü indíthatatlan lenne.
  const jo = m.beallit(mezo, JO[mezo]);
  if (!jo.ok) { joElutasitva++; console.log('  ⛔ ' + mezo + ': a JÓ értéket is elutasította: ' + jo.hiba); }
  sor(MEZO_NEV[mezo] + ' (' + mezo + ')', hibas + ' / ' + ROSSZ[mezo].length,
    (jo.ok ? 'a jó érték átment' : 'A JÓ ÉRTÉK IS BUKOTT ⛔'));
}
sor('rossz érték összesen', rosszDb, atengedett === 0 ? 'mind elutasítva' : '⛔');
gat(atengedett === 0, atengedett + ' ÉRVÉNYTELEN ÉRTÉK BEKERÜLT A KONFIGBA.',
  'A `Sim` ezt már nem fogja meg: az ismeretlen presetre csendben a nyílt '
  + 'mezőt adja, a seedet `>>> 0`-val vágja. A menü az utolsó hely, ahol még '
  + 'el lehet mondani a játékosnak, mi a baj.');
gat(nevtelenul === 0, nevtelenul + ' ELUTASÍTÁS NEM NEVEZTE MEG A MEZŐT.');
gat(joElutasitva === 0, joElutasitva + ' MEZŐ A HELYES ÉRTÉKET IS ELUTASÍTOTTA.');

// EGY konfig, amiben MINDEN mező rossz — a felsorolás legyen teljes.
const romlott = ujMenu({
  seed: 'x', n: 3, terkep: 99, nehezseg: 7, maxEgyseg: 5, sajatCsapat: 4,
});
const romlottE = romlott.ellenoriz();
const megnevezett = new Set(romlottE.hibak.map((h) => h.mezo));
const hianyzoNev = MEZOK.filter((m) => !megnevezett.has(m));
sor('teljesen romlott konfig', romlottE.hibak.length + ' hiba',
  hianyzoNev.length === 0 ? 'mind a ' + MEZOK.length + ' mező névvel' : '⛔ ' + hianyzoNev.join(', '));
gat(!romlottE.ok && hianyzoNev.length === 0,
  'A ROMLOTT KONFIGBÓL ' + hianyzoNev.length + ' MEZŐ NEM KAPOTT HIBÁT.',
  'Hiányzó nevek: ' + hianyzoNev.join(', ') + '. A konstruktor SZÁNDÉKOSAN nem '
  + 'javítja ki csendben, amit kap — ha itt nem szól, a rossz érték a `Sim`-ig jut.');

// És a továbblépés is ÁLLJON MEG rajta.
const romlott2 = ujMenu({ seed: 'x' });
const tovabbE = romlott2.lep('uj_jatek').ok && romlott2.lep('tovabb');
sor('továbblépés rossz seeddel', tovabbE.ok ? 'ÁTMENT ⛔' : 'elutasítva',
  tovabbE.ok ? '' : tovabbE.hibak.map((h) => h.mezo).join(', '));
gat(!tovabbE.ok, 'A ROSSZ SEEDDEL IS TOVÁBB LEHETETT LÉPNI.',
  'Az érvényességnek a `Sim` MEGSZÜLETÉSE ELŐTT kell fognia, nem utána.');

// A ki nem választott nép ugyanígy: ez nem elgépelés, hanem hiányzó döntés.
const civNelkul = ujMenu();
civNelkul.lep('uj_jatek');
civNelkul.lep('tovabb');
const civE = civNelkul.lep('tovabb');
sor('indítás nép nélkül', civE.ok ? 'ÁTMENT ⛔' : 'elutasítva',
  civE.ok ? '' : civE.hibak.map((h) => h.mezo).join(', '));
gat(!civE.ok && civNelkul.kepernyo === KEPERNYO.CIV_VALASZTO,
  'NÉP NÉLKÜL IS EL LEHETETT INDÍTANI A MECCSET.');

// ── 5. VIZSGÁLAT — A VÉGIGJÁTSZOTT ÚT VALÓDI KONFIGOT AD ─────────────────
cim('5. VIZSGÁLAT — hat térkép × három civ-páros, mind más konfig');
sor('térkép', 'civ-páros', 'konfig');

const CIV_PAROK = [
  [CIV.KRISTALYKOVACS, CIV.PUSZTAI_LOVAS],
  [CIV.ERDEI_VADASZ, CIV.HEGYI_BANYASZ],
  [CIV.FENYHOZO, CIV.SIVATAGI_PORTYAZO],
];

/** Egy teljes „új játék" végigjátszás — pont úgy, ahogy a játékos kattint. */
function vegigjatszas(terkep, civ0, civ1, extra) {
  const m = ujMenu({ seed: 20260803 });
  const l = [];
  l.push(m.lep('uj_jatek').ok);
  l.push(m.beallit('terkep', terkep).ok);
  l.push(m.beallit('n', 192).ok);
  l.push(m.beallit('nehezseg', NEHEZSEG.NEHEZ).ok);
  if (extra) extra(m);
  l.push(m.lep('tovabb').ok);
  l.push(m.beallit('civ0', civ0).ok);
  l.push(m.beallit('civ1', civ1).ok);
  l.push(m.lep('tovabb').ok);
  return { menu: m, lepesekOk: l.every(Boolean), eredmeny: m.meccsKonfig() };
}

const konfigok = new Set();
let hianyos = 0;
let utDb = 0;
for (let t = 0; t < TERKEP_DB; t++) {
  for (let p = 0; p < CIV_PAROK.length; p++) {
    utDb++;
    const v = vegigjatszas(t, CIV_PAROK[p][0], CIV_PAROK[p][1]);
    const e = v.eredmeny;
    const k = e.ok ? e.konfig : null;
    // A KONFIG LEGYEN TELJES: minden mező a HELYÉN, azzal az értékkel, amit
    // beállítottunk. Egy „ok: true" üres objektummal minden más gáton átmenne.
    const teljes = !!k && k.seed === 20260803 && k.n === 192 && k.terkep === t
      && k.civ[0] === CIV_PAROK[p][0] && k.civ[1] === CIV_PAROK[p][1]
      && k.nehezseg === NEHEZSEG.NEHEZ && Number.isInteger(k.maxEgyseg)
      && (k.sajatCsapat === 0 || k.sajatCsapat === 1) && k.mentes === null;
    if (!v.lepesekOk || !teljes) {
      hianyos++;
      console.log('  ⛔ ' + t + '/' + p + ': '
        + (e.ok ? JSON.stringify(k) : e.hibak.map((h) => h.mezo + ': ' + h.hiba).join(' · ')));
      continue;
    }
    konfigok.add(JSON.stringify(k));
    if (p === 0) {
      sor(terkepLista()[t].nev, CIV_NEV[CIV_PAROK[p][0]].slice(0, 18),
        'seed ' + k.seed + ' · ' + k.n + '×' + k.n + ' · preset ' + k.terkep);
    }
  }
}
sor('végigjátszott út', utDb, hianyos === 0 ? 'mind teljes konfigot adott' : '⛔');
sor('különböző konfig', konfigok.size,
  konfigok.size === utDb ? 'mind más' : '⛔ ismétlődés');
gat(hianyos === 0, hianyos + ' VÉGIGJÁTSZÁS NEM ADOTT TELJES KONFIGOT.');
gat(konfigok.size === utDb,
  'A ' + utDb + ' KÜLÖNBÖZŐ VÁLASZTÁSRA CSAK ' + konfigok.size + ' KÜLÖNBÖZŐ KONFIG JUTOTT.',
  'A menü elfelejt valamit átvinni a konfigba — a játékos mást állít be, mint '
  + 'amit kap, és a `Sim` erről semmit nem tud.');

// A konfig CSAK az indítás-képernyőn kérhető el: menet közben egy fél konfig
// pont annyira használhatatlan, mint a semmi, de sokkal nehezebb észrevenni.
const felig = ujMenu();
felig.lep('uj_jatek');
const feligE = felig.meccsKonfig();
sor('konfig menet közben', feligE.ok ? 'KIADTA ⛔' : 'elutasítva',
  feligE.ok ? '' : feligE.hibak[0].hiba);
gat(!feligE.ok, 'A MENÜ AZ INDÍTÁS ELŐTT IS KIADTA A MECCS-KONFIGOT.');

// ── 6. VIZSGÁLAT — A MENÜ DETERMINISZTIKUS ───────────────────────────────
cim('6. VIZSGÁLAT — ugyanaz a bemenet ugyanazt a konfigot adja');

const futasok = [];
for (let i = 0; i < 3; i++) {
  const v = vegigjatszas(TERKEP.KRISTALYMEZO, CIV.BASTYAORZO, CIV.FOLYAMI_KERESKEDO);
  futasok.push(v.eredmeny.ok ? JSON.stringify(v.eredmeny.konfig) : 'HIBA');
}
const egyezik = futasok[0] === futasok[1] && futasok[1] === futasok[2];
sor('három azonos futás', egyezik ? 'bitre azonos' : 'ELTÉR ⛔', futasok[0].slice(0, 60) + '…');
gat(egyezik, 'UGYANAZ A BEMENET-SOROZAT MÁS KONFIGOT ADOTT.',
  futasok.join('\n     '));

// Két FRISSEN épített menü ugyanazt a seedet hozza. Ez fogja meg az órából
// vagy `Math.random`-ból származó alapértelmezést — a v0.8-ban az azonnali
// desync, mert a két gép menüje két különböző világot rendelne meg.
const a1 = ujMenu().konfig();
const a2 = ujMenu().konfig();
sor('alapértelmezett seed', a1.seed,
  a1.seed === a2.seed ? 'két menü ugyanazt adja' : '⛔ ' + a1.seed + ' ≠ ' + a2.seed);
gat(a1.seed === a2.seed && Number.isInteger(a1.seed),
  'KÉT FRISSEN ÉPÍTETT MENÜ MÁS SEEDET ADOTT.',
  'A seed alapértelmezése nem jöhet órából vagy véletlenből: a v0.8-ban a két '
  + 'gépnek UGYANAZT kell kapnia. Ha alapértelmezett seed kell, azt a hívó adja.');

/**
 * Kommentek és string-literálok kiürítése a statikus szűréshez.
 * A `tools/determinizmus_szonda.mjs` ugyanezt csinálja, és ugyanazért: a MENÜ
 * FEJLÉCE hosszan magyarázza, miért nem használunk `Date.now()`-t — ha a
 * kommentre buknánk, a szonda a saját dokumentációnkat büntetné. Azért van
 * lemásolva, és nem importálva, mert a determinizmus-szonda a betöltésekor
 * lefuttatja a teljes vizsgálatát (és `process.exit`-el).
 */
function tisztit(f) {
  const ki = new Array(f.length);
  let all = 0;   // 0 kód · 1 sor-komment · 2 blokk-komment · 3 ' · 4 " · 5 `
  for (let i = 0; i < f.length; i++) {
    const c = f[i], k = f[i + 1];
    const ujsor = c === '\n';
    if (all === 0) {
      if (c === '/' && k === '/') { all = 1; ki[i] = ' '; continue; }
      if (c === '/' && k === '*') { all = 2; ki[i] = ' '; continue; }
      if (c === "'") { all = 3; ki[i] = ' '; continue; }
      if (c === '"') { all = 4; ki[i] = ' '; continue; }
      if (c === '`') { all = 5; ki[i] = ' '; continue; }
      ki[i] = c;
      continue;
    }
    if (all === 1) { if (ujsor) all = 0; ki[i] = ujsor ? '\n' : ' '; continue; }
    if (all === 2) {
      if (c === '*' && k === '/') { ki[i] = ' '; ki[++i] = ' '; all = 0; continue; }
      ki[i] = ujsor ? '\n' : ' ';
      continue;
    }
    if (c === '\\') { ki[i] = ' '; ki[++i] = ' '; continue; }
    if ((all === 3 && c === "'") || (all === 4 && c === '"') || (all === 5 && c === '`')) all = 0;
    ki[i] = ujsor ? '\n' : ' ';
  }
  return ki.join('');
}

const TILTOTT = [
  [/\bMath\s*\.\s*random\b/g, 'Math.random — a meccs-konfig nem lehet gépenként más'],
  [/\bDate\s*\.\s*now\b/g, 'Date.now — a két gép órája sosem egyezik'],
  [/\bnew\s+Date\b/g, 'new Date — ugyanaz a baj'],
  [/\bperformance\s*\.\s*now\b/g, 'performance.now — valós idő a konfigban'],
];
const FIGYELT = ['src/ui/menu_adat.js', 'src/ui/menu.js'];
let tiltottDb = 0;
for (const rel of FIGYELT) {
  const forras = tisztit(readFileSync(join(GYOKER, rel), 'utf8'));
  let talalat = 0;
  for (const [minta, mit] of TILTOTT) {
    minta.lastIndex = 0;
    let t;
    while ((t = minta.exec(forras)) !== null) {
      talalat++;
      const sorszam = forras.slice(0, t.index).split('\n').length;
      console.log('  ⛔ ' + rel + ':' + sorszam + ' — ' + mit);
    }
  }
  tiltottDb += talalat;
  sor(rel, talalat === 0 ? 'tiszta' : talalat + ' találat', talalat === 0 ? '' : '⛔');
}
gat(tiltottDb === 0, tiltottDb + ' ÓRA- VAGY VÉLETLEN-HÍVÁS A MENÜ FORRÁSÁBAN.');

// A GÉPENKÉNTI beállítás NE szivárogjon a meccs-konfigba: a hangerő nem megy
// át a hálózaton, és ha mégis a konfig része lenne, két azonos meccs
// „eltérőnek" látszana az egyeztetéskor.
const bA = vegigjatszas(TERKEP.NYILT_MEZO, CIV.FENYHOZO, CIV.BASTYAORZO);
const bB = vegigjatszas(TERKEP.NYILT_MEZO, CIV.FENYHOZO, CIV.BASTYAORZO, (m) => {
  m.beallitasBeallit('hangEro', 0);
  m.beallitasBeallit('zeneEro', 100);
  m.beallitasBeallit('arnyek', false);
  m.beallitasBeallit('kameraSebesseg', 300);
});
const beallEgyez = JSON.stringify(bA.eredmeny.konfig) === JSON.stringify(bB.eredmeny.konfig);
const beallValt = JSON.stringify(bA.menu.beallitasok()) !== JSON.stringify(bB.menu.beallitasok());
sor('beállítás ↔ meccs-konfig', beallEgyez ? 'nem szivárog' : 'SZIVÁROG ⛔',
  beallValt ? 'a beállítás viszont tényleg változott' : '⛔ a beállítás sem változott');
gat(beallEgyez, 'A GÉPENKÉNTI BEÁLLÍTÁS BEKERÜLT A MECCS-KONFIGBA.');
// …és fordítva: ha a beállítás SEM változott, akkor nem bizonyítottunk semmit.
gat(beallValt, 'A BEÁLLÍTÁSOK NEM VÁLTOZTAK — A SZIVÁRGÁS-PRÓBA ÜRES VOLT.');

// ── 7. VIZSGÁLAT — A BETÖLTÉS-ÁG ─────────────────────────────────────────
cim('7. VIZSGÁLAT — a betöltés valódi konfigot ad, és a rosszat elutasítja');
sor('mentés', 'állapot', 'fejléc');

const lista = ujMenu().mentesLista();
for (const m of lista) {
  sor(m.kulcs, m.ervenyes ? 'olvasható' : 'HIBÁS',
    m.ervenyes ? (m.seed + ' · ' + m.n + '×' + m.n + ' · preset ' + m.terkep) : m.hiba);
}
const ervenyesDb = lista.filter((m) => m.ervenyes).length;
gat(lista.length === Object.keys(MENTESEK).length,
  'A MENTÉS-LISTA NEM MUTATTA MEG MINDEN REKESZT.',
  'A hibás mentést sem szabad elrejteni: egy eltűnt mentés-sor sokkal '
  + 'rosszabb, mint egy „régi verziójú" felirat.');
gat(ervenyesDb === 2, 'AZ ÉRVÉNYES MENTÉSEK SZÁMA ' + ervenyesDb + ', NEM 2.');

// A KIVÁLASZTÁS ÁTVESZI A FEJLÉCET — ez a betöltés működésének feltétele.
const bt = ujMenu();
bt.lep('betoltes');
const btV = bt.mentesValaszt('aotc-mentes');
const btK = bt.konfig();
const atvett = btK.seed === 424242 && btK.n === 192 && btK.terkep === TERKEP.ERDOSEG;
sor('fejléc átvéve', atvett ? 'seed/méret/preset' : '⛔ ' + JSON.stringify(btK),
  btV.ok ? '' : btV.hiba);
gat(btV.ok && atvett, 'A KIVÁLASZTOTT MENTÉS FEJLÉCE NEM KERÜLT A KONFIGBA.',
  'A `mentes.js → betoltes()` a seedet, a méretet ÉS a presetet is összeveti a '
  + 'már létező `Sim`-mel. Ha a menü a saját seedjét adná tovább, MINDEN '
  + 'betöltés „más seed: a terep nem egyezne" hibával halna el.');

const btTovabb = bt.lep('tovabb');
const btKonfig = bt.meccsKonfig();
sor('betöltés → indítás', btTovabb.ok ? KEPERNYO_NEV[bt.kepernyo] : 'ELAKADT ⛔',
  btKonfig.ok ? 'a mentés a konfigban van' : '⛔');
gat(btTovabb.ok && btKonfig.ok && btKonfig.konfig.mentes === MENTESEK['aotc-mentes'],
  'A BETÖLTÉS-ÁG NEM ADOTT HASZNÁLHATÓ KONFIGOT.',
  'A hívónak a mentés SZÖVEGÉRE is szüksége van: a `Sim` a konfigból épül, a '
  + 'világot pedig a `betoltesSzoveg()` tölti bele.');

// Kiválasztás NÉLKÜL viszont ne lehessen továbblépni.
const btUres = ujMenu();
btUres.lep('betoltes');
const btUresE = btUres.lep('tovabb');
sor('betöltés választás nélkül', btUresE.ok ? 'ÁTMENT ⛔' : 'elutasítva',
  btUresE.ok ? '' : btUresE.hibak.map((h) => h.mezo).join(', '));
gat(!btUresE.ok, 'MENTÉS KIVÁLASZTÁSA NÉLKÜL IS EL LEHETETT INDULNI.');

// Romlott fejlécek — mind elutasítás, névvel.
const ROSSZ_MENTES = [
  ['nem létező kulcs', 'nincs-ilyen'],
  ['régi verzió', 'aotc-mentes-regi'],
  ['olvashatatlan JSON', 'aotc-mentes-romlott'],
];
let mentesAtengedett = 0;
for (const [nev, kulcs] of ROSSZ_MENTES) {
  const m = ujMenu();
  m.lep('betoltes');
  const e = m.mentesValaszt(kulcs);
  if (e.ok) { mentesAtengedett++; console.log('  ⛔ ' + nev + ': ÁTENGEDVE'); }
  sor(nev, e.ok ? 'ÁTENGEDVE ⛔' : 'elutasítva', e.ok ? '' : e.hiba);
}
// A fejléc-olvasó közvetlenül is: a mezők ellenőrzése nem maradhat ki.
const NYERS_ROSSZ = [
  ['üres szöveg', ''],
  ['null', null],
  ['nem objektum', '42'],
  ['hiányzó seed', JSON.stringify({ verzio: MENTES_VERZIO, n: 256, terkep: 0, tick: 0 })],
  ['ismeretlen preset', JSON.stringify({ verzio: MENTES_VERZIO, seed: 1, n: 256, terkep: 42, tick: 0 })],
  ['képtelen pályaméret', JSON.stringify({ verzio: MENTES_VERZIO, seed: 1, n: 4, terkep: 0, tick: 0 })],
];
for (const [nev, szoveg] of NYERS_ROSSZ) {
  const f = mentesFejlec(szoveg);
  if (f.ok) { mentesAtengedett++; console.log('  ⛔ ' + nev + ': ÁTENGEDVE'); }
  sor(nev, f.ok ? 'ÁTENGEDVE ⛔' : 'elutasítva', f.ok ? '' : f.hiba);
}
gat(mentesAtengedett === 0, mentesAtengedett + ' ROSSZ MENTÉST ELFOGADOTT A MENÜ.',
  'A hibás fejléc a `Sim` megépítése UTÁN derülne ki, amikor már nincs mit '
  + 'mondani a játékosnak.');

// ── A FELKÍNÁLT LISTÁK ───────────────────────────────────────────────────
cim('AMIT A JÁTÉKOS VÁLASZTHAT');
const tl = terkepLista();
for (const t of tl) console.log('  · ' + String(t.nev).padEnd(16) + t.leiras.slice(0, 56) + '…');
console.log('  · pályaméret: ' + meretLista().map((m) => m.nev + ' (' + m.n + ')').join(', '));
console.log('  · nehézség:   ' + nehezsegLista().map((h) => h.nev).join(', '));
const nevek = new Set(tl.map((t) => t.nev));
const leirasok = new Set(tl.map((t) => t.leiras));
gat(tl.length === TERKEP_DB && nevek.size === TERKEP_DB && leirasok.size === TERKEP_DB
  && tl.every((t) => t.nev.length > 2 && t.leiras.length > 20),
  'A TÉRKÉP-LISTA HIÁNYOS VAGY ISMÉTLŐDŐ.',
  'Hat presetnek hat KÜLÖNBÖZŐ neve és leírása van a `terkep.js`-ben — ha itt '
  + 'kevesebb jön ki, a menü nem a valódi táblából dolgozik.');
gat(nehezsegLista().length === 3 && meretLista().length >= 3,
  'A NEHÉZSÉG- VAGY MÉRET-LISTA HIÁNYOS.');

// ── ÍTÉLET ───────────────────────────────────────────────────────────────
cim('ÍTÉLET');
if (bukas === 0) {
  console.log('  ✅ A MENÜ ÁLLAPOTGÉPE MŰKÖDIK:');
  console.log('     ' + KEPERNYO_DB + ' képernyő · ' + atmenetDb + ' átmenet · mind elérhető ÉS '
    + 'mind visszavezet a főmenübe');
  console.log('     ' + probaDb + ' tiltott lépés elutasítva · ' + rosszDb
    + ' érvénytelen mezőérték elutasítva, mind a ' + MEZOK.length + ' mezőre névvel');
  console.log('     ' + utDb + ' végigjátszott út · ' + konfigok.size
    + ' KÜLÖNBÖZŐ teljes meccs-konfig (' + TERKEP_DB + ' preset × '
    + CIV_PAROK.length + ' civ-páros)');
  console.log('     a menü determinisztikus: három azonos futás bitre azonos, '
    + 'és a forrásban nincs óra');
} else {
  console.log('  ❌ ' + bukas + ' vizsgálat BUKOTT.');
}
console.log('');
process.exit(bukas === 0 ? 0 : 1);
