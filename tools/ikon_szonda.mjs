// AGE OF THE CRYSTALS — IKON-SZONDA (v0.16).
//
// ── MIÉRT VAN KÜLÖN KAPUJA EGY IKON-KÉSZLETNEK ────────────────────────────
// Mert a `src/ui/ikonok.js` KÖZÖS FÜGGŐSÉG: mind a hét panel innen kér ikont.
// Egy hiányzó rajz itt nem egy helyen tűnik el, hanem mindenhol egyszerre — és
// némán, mert egy üres gomb ugyanúgy megjelenik, csak nincs rajta semmi.
//
// ── AMIT KÜLÖNÖSEN ŐRZÜNK: A TÁBLA-HOSSZAK ────────────────────────────────
// Ez a projekt ÖTSZÖR égett meg rövid, `TIPUS`- vagy `EPULET`-indexelt táblán:
// `LATOTAV`, `ELENGED`, `LATOTAV_EGYSEG`, `FIGURA`, `SUGAR`. Mind ugyanúgy:
// a tábla eggyel rövidebb maradt, az utolsó tag `undefined` lett, és a hiba
// NÉMA volt — minden gépen egyformán rossz, tehát a determinizmus-kapu vak rá.
//
// Az ikon-készlet pontosan ilyen tábla. Ha a hatodik egységtípusnak vagy a
// tizenegyedik épületnek nincs ikonja, a panel `ikonSvg`-t hív rá, az DOB, és a
// panel konstruktora elszáll — a HUD-váz kikapcsolja, a játékos meg csak annyit
// lát, hogy nincs ott az építés-panel. Ezért itt a SIM ENUMJAIBÓL indulunk ki,
// nem az ikon-készlet saját listájából: az önmagával mindig egyezik.
//
// ── ÉS AMIT MÉG: NINCS KÜLSŐ HIVATKOZÁS ───────────────────────────────────
// Az `ikonok.js` fejléce ígéri, hogy nincs képfájl és nincs külső betűtípus —
// a `dist/` egyetlen JS marad. Egy `<image href="…">` vagy egy `url(…)` ezt
// csendben elrontaná, és a hiba csak a kirakott játékon látszana, 404-ként.
// A projektnek MOST is van egy ilyen szégyene: a hiányzó `favicon.ico`.
//
// HASZNÁLAT: node tools/ikon_szonda.mjs · npm run ikon
// Kilépési kód: 0 = minden gát zöld · 1 = bukott gát.

import { IKON, IKON_NEVEK, NYERS_SZIN, ikonSvg } from '../src/ui/ikonok.js';
import { TIPUS } from '../src/sim/units.js';
import { EPULET } from '../src/sim/epuletek.js';
import { NYERS } from '../src/sim/eroforras.js';

let bukott = 0;
const cim = (s) => console.log('\n' + s + '\n' + '─'.repeat(84));
const sor = (a, b, c = '') => console.log('  ' + String(a).padEnd(26) + String(b).padEnd(30) + c);
function gat(ok, uzenet, reszlet = '') {
  if (ok) return;
  bukott++;
  console.log('  ⛔ ' + uzenet);
  if (reszlet) console.log('     ' + reszlet);
}

console.log('AGE OF THE CRYSTALS — IKON-SZONDA');

// ════════════════════════════════════════════════════════════════════════════
cim('1. VIZSGÁLAT — minden `IKON` kulcsnak VAN rajza, és nincs gazdátlan rajz');

const kulcsok = Object.entries(IKON);
const rajzNelkul = kulcsok.filter(([, ertek]) => !IKON_NEVEK.includes(ertek));
// Gazdátlan rajz: van kép, de nincs `IKON` kulcs, amivel bárki hivatkozna rá.
// Nem hiba, de holt teher, és jelzi, hogy valaki elfelejtett kulcsot felvenni.
const kulcsErtekek = new Set(kulcsok.map(([, e]) => e));
const gazdatlan = IKON_NEVEK.filter((n) => !kulcsErtekek.has(n));

sor('IKON kulcs', kulcsok.length);
sor('rajz', IKON_NEVEK.length);
sor('rajz nélküli kulcs', rajzNelkul.length, rajzNelkul.map(([k]) => k).join(', ') || 'nincs');
sor('gazdátlan rajz', gazdatlan.length, gazdatlan.join(', ') || 'nincs');
gat(rajzNelkul.length === 0, 'VAN OLYAN IKON-KULCS, AMIHEZ NINCS RAJZ.',
  rajzNelkul.map(([k, e]) => k + ' → "' + e + '"').join(', '));
gat(gazdatlan.length === 0, 'VAN GAZDÁTLAN RAJZ (nincs rá `IKON` kulcs).', gazdatlan.join(', '));

// ════════════════════════════════════════════════════════════════════════════
cim('2. VIZSGÁLAT — a SIM ENUMJAI szerint teljes-e a készlet (a rövid tábla ellen)');

// ⚠️ A sim enumjaiból indulunk, NEM az ikon-készlet listájából. Ha innen
// kérdeznénk, a készlet önmagával mindig egyezne — pontosan az a fajta „zöld
// kapu halott rendszer mellett", amiből ez a projekt hatszor égett meg.
const enumok = [
  ['TIPUS', TIPUS, (n) => IKON[n]],
  ['EPULET', EPULET, (n) => IKON[n]],
  ['NYERS', NYERS, (n) => IKON[n]],
];
let hianyzoEnum = 0;
for (const [nev, tabla, ikonja] of enumok) {
  const tagok = Object.keys(tabla);
  const hianyzik = tagok.filter((t) => {
    const i = ikonja(t);
    if (i === undefined) return true;
    try { ikonSvg(i, 16); return false; } catch (e) { return true; }
  });
  hianyzoEnum += hianyzik.length;
  sor(nev, tagok.length + ' tag', hianyzik.length ? '⛔ hiányzik: ' + hianyzik.join(', ') : 'mind kapott ikont ✓');
}
gat(hianyzoEnum === 0, 'A SIM EGY ENUM-TAGJÁHOZ NINCS IKON.',
  'Ez a projekt ötödik rövid-tábla hibája lenne — a panel `ikonSvg`-je dobna, a gomb némán eltűnne.');

// A négy nyersanyagnak SAJÁT színe is kell: a sávban egymás mellett állnak,
// és ott a szín maga az információ, nem díszítés.
const szinNelkul = Object.keys(NYERS).filter((n) => NYERS_SZIN[IKON[n]] === undefined);
sor('nyersanyag saját szín', Object.keys(NYERS).length - szinNelkul.length + '/' + Object.keys(NYERS).length,
  szinNelkul.length ? '⛔ ' + szinNelkul.join(', ') : 'mind ✓');
gat(szinNelkul.length === 0, 'VAN NYERSANYAG SAJÁT SZÍN NÉLKÜL.', szinNelkul.join(', '));

// ════════════════════════════════════════════════════════════════════════════
cim('3. VIZSGÁLAT — a kimenet ép SVG, és NINCS benne külső hivatkozás');

let rosszSvg = 0, kulsoHiv = 0;
const kulsoMinta = /(<image\b|href\s*=|url\s*\(|@import|xlink:)/i;
for (const nev of IKON_NEVEK) {
  const s = ikonSvg(nev, 24);
  const nyit = (s.match(/</g) || []).length;
  const zar = (s.match(/>/g) || []).length;
  const ep = s.startsWith('<svg') && s.endsWith('</svg>') && s.includes('viewBox="0 0 24 24"') && nyit === zar;
  if (!ep) { rosszSvg++; console.log('     ⛔ hibás SVG: ' + nev); }
  if (kulsoMinta.test(s)) { kulsoHiv++; console.log('     ⛔ külső hivatkozás: ' + nev); }
}
sor('ellenőrzött rajz', IKON_NEVEK.length);
sor('hibás SVG', rosszSvg, rosszSvg ? '⛔' : 'mind ép ✓');
sor('külső hivatkozás', kulsoHiv, kulsoHiv ? '⛔' : 'egy sincs ✓ (a dist egy fájl marad)');
gat(rosszSvg === 0, 'HIBÁS SVG-KIMENET.');
gat(kulsoHiv === 0, 'KÜLSŐ HIVATKOZÁS AZ IKONBAN — a kirakott játékon 404 lenne.');

// A méret és a szín tényleg átmegy-e (elgépelt paraméter némán elveszne).
const m = ikonSvg(IKON.ETEL, 37, '#123456');
sor('méret átmegy', m.includes('width="37"') && m.includes('height="37"') ? 'igen ✓' : '⛔ nem');
sor('szín felülírható', m.includes('#123456') ? 'igen ✓' : '⛔ nem');
gat(m.includes('width="37"') && m.includes('#123456'), 'A MÉRET VAGY A SZÍN NEM MEGY ÁT.');

// ════════════════════════════════════════════════════════════════════════════
cim('4. VIZSGÁLAT — SZABOTÁZS: elgépelt névre DOBNI kell, nem üreset adni');

// Ez a készlet legfontosabb tulajdonsága. Üres string esetén az elgépelt
// `IKON.KRISTALJ` némán eltűnő gombot csinálna: a panel működne, a kapu zöld
// lenne, és senki nem venné észre, amíg valaki rá nem néz a képernyőre.
const probak = ['kristalj', 'KOZPONT', '', 'etel ', 'nincs_ilyen'];
let dobott = 0;
for (const p of probak) {
  try { ikonSvg(p, 16); console.log('     ⛔ NEM dobott erre: "' + p + '"'); }
  catch (e) { dobott++; }
}
sor('elgépelt próba', probak.length);
sor('dobott', dobott + '/' + probak.length, dobott === probak.length ? 'mind ✓' : '⛔');
gat(dobott === probak.length, 'ISMERETLEN IKONNÉVRE NEM DOB.',
  'Üres kimenet = némán eltűnő gomb. Ebből a hibafajtából a projektnek már öt volt.');

// A hibaüzenet legyen HASZNÁLHATÓ: mondja meg, mik az ismert nevek.
let uzenetJo = false;
try { ikonSvg('nincs_ilyen'); } catch (e) { uzenetJo = e.message.includes('nincs_ilyen') && e.message.includes('etel'); }
sor('hibaüzenet', uzenetJo ? 'megnevezi a hibást és az ismerteket ✓' : '⛔ szűkszavú');
gat(uzenetJo, 'A HIBAÜZENET NEM SEGÍT.');

// ════════════════════════════════════════════════════════════════════════════
cim('ÖSSZEGZÉS');
sor('ikon', IKON_NEVEK.length);
sor('sim-enum lefedve', 'TIPUS ' + Object.keys(TIPUS).length
  + ' · EPULET ' + Object.keys(EPULET).length + ' · NYERS ' + Object.keys(NYERS).length);

if (bukott) {
  console.log('\n  ⛔ ' + bukott + ' GÁT BUKOTT.\n');
  process.exit(1);
}
console.log('\n  ✅ AZ IKON-KÉSZLET TELJES — minden sim-enum tagnak van ikonja,\n'
  + '     a kimenet ép és önálló, és az elgépelt név DOB, nem tűnik el némán.\n');
