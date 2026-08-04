// AGE OF THE CRYSTALS — KIADÁS-ELLENŐRZŐ.
//
// ── MIÉRT VAN EZ, HA MÁR VAN DETERMINIZMUS-SZONDA ─────────────────────────
// A determinizmus-szonda egyetlen kérdésre felel: ugyanaz jön-e ki kétszer.
// Erős kapu, de VAK arra, ami minden gépen EGYFORMÁN rossz. A projekt eddigi
// legdrágább hibái pontosan ilyenek voltak:
//
//   · a v0.9/2 rövid táblája — egy `TIPUS`-indexelt tömb, ami öt elemű maradt,
//     miközben hat típus van. Az olvasás `undefined`-et ad, abból `NaN` lesz,
//     a `NaN` minden összehasonlításban hamis — a rendszer nem elszáll, hanem
//     CSENDBEN nem csinál semmit. Bitre reprodukálhatóan.
//   · a v0.7/2 mentése — egy kimaradt blokk a `betoltes()`-ben. A mentés
//     lefut, a betöltés lefut, csak épp elveszik egy réteg.
//   · a v0.6/1 építési parancsa — 100 kiadott parancsból 1 ház. Minden kapu
//     zöld volt.
//
// Ez az ellenőrző tehát nem a szimulációt vizsgálja, hanem a PROJEKTET: hogy a
// rétegek határai állnak-e, a táblák egyforma hosszúak-e, a terv és a kód
// mond-e egymásnak ellent, és megvan-e minden, amit a `CLAUDE.md` és a
// `PLAN.md` kiköt.
//
// ── MIÉRT STATIKUS ÉS MIÉRT GYORS ─────────────────────────────────────────
// Semmit nem futtat a szimulációból: nincs 16 000 tickes meccs, nincs
// FPS-mérés, nincs böngésző. Forrást olvas és szöveget elemez, ezért
// másodpercek alatt lefut — vagyis a fejlesztés KÖZBEN is elsüthető, nem csak
// a kiadás előtt. Egy kapu, amit a hossza miatt kihagynak, nem kapu.
//
// A tiltott `Math`-hívásokat, a `for…in`-t és a `Date.now`-t SZÁNDÉKOSAN nem
// nézi: azokat a determinizmus-szonda 1. vizsgálata már statikusan szűri, és
// két igazságból előbb-utóbb ellentmondás lesz.
//
// ── HÁROM SZINT ───────────────────────────────────────────────────────────
//   RENDBEN     — az elvárás áll
//   BUKOTT      — az elvárás sérül, a kilépési kód 1
//   ⚠ FIGYELEM  — dokumentált, tudatos eltérés vagy heurisztika, ami tévedhet.
//                 NEM buktat, de kiírja magát, hogy ne felejtődjön el.
//
// A figyelmeztetés-szint nem enyhítés: minden ilyen elvárásnál a fájl megírja,
// MIÉRT nem lehet keményebb. Ha egy figyelmeztetés kemény gáttá tehető, tegyük
// azzá — de hamis riasztásból kettő is elég ahhoz, hogy senki ne higgyen a
// kapunak.
//
// Az emberi olvasat a `qa/KIADAS_ELVARASOK.md`-ben van, UGYANAZOKKAL a
// sorszámokkal — a jelentés és a doksi így egymásra hivatkozhat.
//
// HASZNÁLAT:  node tools/kiadas_ellenorzo.mjs
// Kilépési kód: 0 = rendben (a figyelmeztetések nem buktatnak), 1 = bukás.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const GYOKER = dirname(dirname(fileURLToPath(import.meta.url)));

// ── KIÍRÁS ────────────────────────────────────────────────────────────────

const cim = (t) => console.log('\n' + t + '\n' + '─'.repeat(78));
const sor = (a, b, c) => console.log('  ' + String(a).padEnd(30) + String(b).padEnd(22) + (c ?? ''));

let bukas = 0;
let figyelem = 0;
let db = 0;
/** A sorszám → eredmény, hogy az ÍTÉLET fel tudja sorolni a bukottakat. */
const eredmenyek = [];
/** Legfeljebb ennyi részletet írunk ki egy elvárás alatt — a többit összegezzük. */
const RESZLET_MAX = 8;

/**
 * Egy elvárás lefuttatása.
 *
 * A visszatérés `{ ok, reszletek?, jegyzet? }`. A dobott kivétel BUKÁS, nem
 * összeomlás: egy hibás vizsgálat ne tudja megfúrni a maradék ötvenet, de ne is
 * maradjon némán.
 *
 * @param {string} nev  a `qa/KIADAS_ELVARASOK.md` szövegével azonos cím
 * @param {() => {ok:boolean, reszletek?:string[], jegyzet?:string}} fn
 * @param {boolean} lagy figyelmeztetés-szintű (nem buktat)
 */
function elvar(nev, fn, lagy = false) {
  db++;
  const sorszam = db;
  let r;
  try {
    r = fn();
  } catch (h) {
    r = { ok: false, reszletek: ['a vizsgálat hibára futott: ' + h.message] };
  }
  let allapot;
  if (r.ok) allapot = 'RENDBEN';
  else if (lagy) { allapot = '⚠ FIGYELEM'; figyelem++; }
  else { allapot = 'BUKOTT'; bukas++; }

  console.log('  ' + String(sorszam).padStart(2) + '. '
    + nev.padEnd(56) + allapot);
  if (!r.ok && r.reszletek) {
    for (let i = 0; i < Math.min(r.reszletek.length, RESZLET_MAX); i++) {
      console.log('        · ' + r.reszletek[i]);
    }
    if (r.reszletek.length > RESZLET_MAX) {
      console.log('        · … és még ' + (r.reszletek.length - RESZLET_MAX));
    }
  }
  if (r.ok && r.jegyzet) console.log('        ' + r.jegyzet);
  eredmenyek.push({ sorszam, nev, ok: r.ok, lagy });
  return r.ok;
}

/** Sikeres eredmény, opcionális jegyzettel. */
const jo = (jegyzet) => ({ ok: true, jegyzet });
/** Bukás, a talált esetek listájával. */
const rossz = (reszletek) => ({ ok: reszletek.length === 0, reszletek });

// ── FÁJL-SEGÉDEK ──────────────────────────────────────────────────────────

const olvas = (...r) => readFileSync(join(GYOKER, ...r), 'utf8');
const van = (...r) => existsSync(join(GYOKER, ...r));
const rel = (p) => relative(GYOKER, p).split('\\').join('/');

/** Minden `.js`/`.mjs` egy könyvtár alatt, rekurzívan, NÉV SZERINT RENDEZVE. */
function jsFajlok(...r) {
  const dir = join(GYOKER, ...r);
  const ki = [];
  if (!existsSync(dir)) return ki;
  for (const nev of readdirSync(dir).sort()) {
    const p = join(dir, nev);
    if (statSync(p).isDirectory()) ki.push(...jsFajlok(rel(p)));
    else if (/\.(js|mjs)$/.test(nev)) ki.push(p);
  }
  return ki;
}

const SIM = jsFajlok('src', 'sim');
const RENDER = jsFajlok('src', 'render');
const UI = jsFajlok('src', 'ui');
const NET = jsFajlok('src', 'net');
const SZONDAK = jsFajlok('tools').filter((p) => /_szonda\.mjs$/.test(p));

/**
 * Komment- és (opcionálisan) sztring-mentesítés.
 *
 * ⚠️ EZ NEM SZŐRSZÁLHASOGATÁS. A `civ.js` leírásaiban VESSZŐ van a sztringen
 * belül, az `epuletek.js` fejlécében pedig `[…]` a kommentben — ha nyers
 * szövegen számolnánk tömb-elemet vagy keresnénk értékadást, mindkettő
 * hazudna. A karakterpozíciók megmaradnak (szóközre cserélünk), tehát a
 * sorszámok a nyers fájllal egyeznek.
 *
 * @param {string} sz forrás
 * @param {boolean} sztringNelkul a sztringek TARTALMÁT is szóközzé tesszük
 */
function tisztit(sz, sztringNelkul = false) {
  const ki = new Array(sz.length);
  let all = 0;               // 0 kód · 1 sor-komment · 2 blokk-komment · 3 sztring
  let hatar = '';
  for (let i = 0; i < sz.length; i++) {
    const c = sz[i], d = sz[i + 1];
    if (all === 0) {
      if (c === '/' && d === '/') { all = 1; ki[i] = ' '; continue; }
      if (c === '/' && d === '*') { all = 2; ki[i] = ' '; continue; }
      if (c === '"' || c === "'" || c === '`') { all = 3; hatar = c; ki[i] = c; continue; }
      ki[i] = c; continue;
    }
    if (all === 1) { if (c === '\n') { all = 0; ki[i] = '\n'; } else ki[i] = ' '; continue; }
    if (all === 2) {
      if (c === '*' && d === '/') { ki[i] = ' '; ki[i + 1] = ' '; i++; all = 0; continue; }
      ki[i] = (c === '\n') ? '\n' : ' '; continue;
    }
    // sztring
    if (c === '\\') { ki[i] = ' '; ki[i + 1] = ' '; i++; continue; }
    if (c === hatar) { all = 0; ki[i] = c; continue; }
    ki[i] = sztringNelkul ? (c === '\n' ? '\n' : ' ') : c;
  }
  return ki.join('');
}

/** Forrás-gyorstár: minden fájlt egyszer olvasunk és egyszer tisztítunk. */
const _tar = new Map();
function forras(p) {
  let e = _tar.get(p);
  if (!e) {
    const nyers = readFileSync(p, 'utf8');
    e = { nyers, kod: tisztit(nyers, false), vaz: tisztit(nyers, true) };
    _tar.set(p, e);
  }
  return e;
}

/** Hányadik sorban áll ez a karakter-pozíció? */
const sorSzam = (sz, i) => sz.slice(0, i).split('\n').length;

// ── LITERÁL-ELEMZŐ ────────────────────────────────────────────────────────
//
// A tábla-hossz vizsgálatokhoz a tömb- és objektum-literálokat MEG KELL
// SZÁMOLNI. Importálni nem tudjuk őket: a projekt táblái nagyrészt
// modul-privátok (`const MAX_HP = …`), és pont ez a helyes — az számít, hogy a
// fájlon belül egyformák legyenek. Ezért szöveg-szinten zárójel-párosítunk.

/**
 * A `NEV = [ … ]` / `NEV = { … }` literál BELSEJE, sztring-mentesített vázból.
 * @returns {{nyit:string, belso:string, poz:number}|null}
 */
function literal(vaz, nev) {
  const re = new RegExp('(?:export\\s+)?(?:const|let|var)\\s+' + nev + '\\s*=\\s*([\\[{])');
  const m = re.exec(vaz);
  if (!m) return null;
  let i = m.index + m[0].length - 1;
  const kezd = i;
  let mely = 0;
  for (; i < vaz.length; i++) {
    const c = vaz[i];
    if (c === '[' || c === '{' || c === '(') mely++;
    else if (c === ']' || c === '}' || c === ')') {
      mely--;
      if (mely === 0) return { nyit: m[1], belso: vaz.slice(kezd + 1, i), poz: m.index };
    }
  }
  return null;
}

/** Egy literál-belső FELSŐ SZINTŰ elemei (a beágyazott zárójeleket átugorva). */
function felsoElemek(belso) {
  const ki = [];
  let mely = 0, kezd = 0;
  for (let i = 0; i < belso.length; i++) {
    const c = belso[i];
    if (c === '[' || c === '{' || c === '(') mely++;
    else if (c === ']' || c === '}' || c === ')') mely--;
    else if (c === ',' && mely === 0) { ki.push(belso.slice(kezd, i)); kezd = i + 1; }
  }
  const u = belso.slice(kezd);
  if (u.trim() !== '') ki.push(u);
  return ki;
}

/** Egy tömb-literál elemszáma, vagy `null`, ha nincs ilyen név. */
function tombHossz(vaz, nev) {
  const l = literal(vaz, nev);
  if (!l || l.nyit !== '[') return null;
  return felsoElemek(l.belso).length;
}

/** Egy enum-objektum `{ KULCS: szám }` párjai, vagy `null`. */
function enumKulcsok(vaz, nev) {
  const l = literal(vaz, nev);
  if (!l || l.nyit !== '{') return null;
  const ki = [];
  for (const e of felsoElemek(l.belso)) {
    const m = /^\s*([A-Za-z_$][\w$]*)\s*:\s*(-?\d+)\s*$/.exec(e);
    if (m) ki.push({ nev: m[1], ertek: Number(m[2]) });
  }
  return ki;
}

/** Egy azonosítóhoz rendelt egész szám (`export const TIPUS_DB = 6;`). */
function szamErtek(vaz, nev) {
  const m = new RegExp('(?:export\\s+)?const\\s+' + nev + '\\s*=\\s*(-?\\d+)').exec(vaz);
  return m ? Number(m[1]) : null;
}

/** Egy metódus/függvény TÖRZSE, zárójel-párosítással. */
function fuggvenyTorzs(kod, fejRegex) {
  const m = fejRegex.exec(kod);
  if (!m) return null;
  let i = kod.indexOf('{', m.index + m[0].length - 1);
  if (i < 0) return null;
  const kezd = i;
  let mely = 0;
  for (; i < kod.length; i++) {
    const c = kod[i];
    if (c === '{') mely++;
    else if (c === '}') { mely--; if (mely === 0) return kod.slice(kezd + 1, i); }
  }
  return null;
}

// ── A TÁBLA-NYILVÁNTARTÁS ─────────────────────────────────────────────────
//
// ⚠️ EZ A FÁJL LEGFONTOSABB ADATA. A v0.9/2 fejléce (`src/sim/egyedi.js`)
// tizennégy `TIPUS`-indexelt táblát sorol fel, és kimondja, hogy egy
// elfelejtett tábla CSENDBEN a 0. típus adatait adja vissza. A lista tehát
// nem kényelem, hanem a tanulság kódba írva.
//
// ÚJ TÁBLA → ÚJ SOR ITT. Ha egy tábla kimarad innen, az ellenőrző pontosan
// arra a hibafajtára lesz vak, amiért megírtuk.

/**
 * `lagy: true` — a rövid tábla itt TUDATOS, mert minden olvasója védi magát.
 * Ilyenkor figyelmeztetünk, nem buktatunk, és a `miert` megmondja, miért.
 */
const TIPUS_TABLAK = [
  ['src/sim/units.js', 'SEBESSEG'],
  ['src/sim/units.js', 'SUGAR'],
  ['src/sim/harc.js', 'MAX_HP'],
  ['src/sim/harc.js', 'ALAP_SEBZES'],
  ['src/sim/harc.js', 'TAMADAS_TIPUS'],
  ['src/sim/harc.js', 'PANCEL_TIPUS'],
  ['src/sim/harc.js', 'PANCEL_ERTEK'],
  ['src/sim/harc.js', 'UTEM'],
  ['src/sim/harc.js', 'HATOTAV'],
  ['src/sim/harc.js', 'TAVOLSAGI'],
  ['src/sim/kepzes.js', 'EGYSEG_AR'],
  ['src/sim/kepzes.js', 'EGYSEG_IDO'],
  ['src/sim/kepzes.js', 'EGYSEG_NEP'],
  ['src/sim/parancsallapot.js', 'LATOTAV'],
  ['src/sim/parancsallapot.js', 'ELENGED'],
  ['src/sim/kod.js', 'LATOTAV_EGYSEG'],
  ['src/render/units3d.js', 'FIGURA'],
];

const EPULET_TABLAK = [
  ['src/sim/epuletek.js', 'EPULET_NEV'],
  ['src/sim/epuletek.js', 'EP_MERET'],
  ['src/sim/epuletek.js', 'EP_MAGASSAG'],
  ['src/sim/epuletek.js', 'EP_IDO'],
  ['src/sim/epuletek.js', 'EP_AR'],
  ['src/sim/epuletek.js', 'LERAKO'],
  ['src/sim/epuletek.js', 'EP_HP'],
  ['src/sim/epuletek.js', 'EP_NEPESSEG'],
  ['src/sim/kod.js', 'LATOTAV_EPULET'],
  // A `KEPEZ` rövidebb, és ez ITT tudatos: a torony és a piac nem képez semmit,
  // és MINDKÉT olvasója (`kepezheti`, `allapot`) `!lista`-val védi magát.
  // Kemény gátnak hamis riasztás lenne — de némán elhagyni sem szabad, mert egy
  // 11. helyre kerülő KÉPZŐ épület itt esne csendben ki.
  ['src/sim/kepzes.js', 'KEPEZ', { lagy: true, miert: 'a torony és a piac nem képez; az olvasók `!lista`-val védettek' }],
];

const CIV_TABLAK = [
  ['src/sim/civ.js', 'CIV_NEV'],
  ['src/sim/civ.js', 'CIV_LEIRAS'],
  ['src/sim/civ.js', 'CIV_BONUSZ'],
  ['src/sim/egyedi.js', 'EGYEDI_PROFIL'],
];

const TECH_TABLAK = [
  ['src/sim/technologia.js', 'TECH_NEV'],
  ['src/sim/technologia.js', 'TECH_LEIRAS'],
  ['src/sim/technologia.js', 'TECH_AR'],
  ['src/sim/technologia.js', 'TECH_IDO'],
  ['src/sim/technologia.js', 'TECH_EPULET'],
  ['src/sim/technologia.js', 'TECH_KORSZAK'],
];

const TERKEP_TABLAK = [
  ['src/sim/terkep.js', 'TERKEP_NEV'],
  ['src/sim/terkep.js', 'TERKEP_LEIRAS'],
  ['src/sim/terkep.js', 'P'],
];

/** `[fájl, tábla, fájl, enum]` — a név-tábla hossza az enum kulcsainak száma. */
const NEV_TABLAK = [
  ['src/sim/eroforras.js', 'NYERS_NEV', 'src/sim/eroforras.js', 'NYERS'],
  ['src/sim/gazdasag.js', 'KORSZAK_NEV', 'src/sim/gazdasag.js', 'KORSZAK'],
  ['src/sim/alakzat.js', 'ALAKZAT_NEV', 'src/sim/alakzat.js', 'ALAKZAT'],
  ['src/sim/parancsallapot.js', 'ALLAS_NEV', 'src/sim/parancsallapot.js', 'ALLAS'],
  ['src/sim/harc.js', 'TAMADAS_NEV', 'src/sim/harc.js', 'TAMADAS'],
  ['src/sim/harc.js', 'PANCEL_NEV', 'src/sim/harc.js', 'PANCEL'],
  ['src/sim/epuletek.js', 'EPULET_NEV', 'src/sim/epuletek.js', 'EPULET'],
  ['src/sim/technologia.js', 'TECH_NEV', 'src/sim/technologia.js', 'TECH'],
  ['src/sim/terkep.js', 'TERKEP_NEV', 'src/sim/terkep.js', 'TERKEP'],
];

/** Egy tábla-csoport ellenőrzése egy elvárt hosszra. */
function tablaCsoport(lista, elvartHossz, honnan) {
  const hibak = [];
  const lagyak = [];
  for (const [fajl, nev, opt] of lista) {
    if (!van(fajl)) { hibak.push(fajl + ' — nincs ilyen fájl'); continue; }
    const h = tombHossz(forras(join(GYOKER, fajl)).vaz, nev);
    if (h === null) { hibak.push(fajl + ' → `' + nev + '` — nem található tömb-literál'); continue; }
    if (h === elvartHossz) continue;
    const uzenet = fajl + ' → `' + nev + '` hossza ' + h + ', elvárt ' + elvartHossz
      + ' (' + honnan + ')';
    if (opt && opt.lagy) lagyak.push(uzenet + ' — tudatos: ' + opt.miert);
    else hibak.push(uzenet);
  }
  return { hibak, lagyak };
}

// ── PLAN.md ÉS package.json ELEMZÉSE ──────────────────────────────────────

const PLAN = olvas('PLAN.md');
const CLAUDEMD = olvas('CLAUDE.md');
const INTERFACES = olvas('INTERFACES.md');
const PKG = JSON.parse(olvas('package.json'));
const CONFIG = forras(join(GYOKER, 'src', 'core', 'config.js'));

/**
 * A `PLAN.md` verzió-táblázatának sorai.
 *
 * A tábla a terv IGAZSÁGFORRÁSA — és pont ezért kell gépileg olvasni: egy
 * „kész"-nek jelölt sor, ami alatt nincs semmi, hosszabb ideig marad észre-
 * vétlen, mint bármelyik kódhiba.
 */
function planSorok() {
  const ki = [];
  for (const s of PLAN.split('\n')) {
    if (!s.startsWith('|')) continue;
    const cellak = s.split('|').map((c) => c.trim());
    if (cellak.length < 4) continue;
    const m = /^\*{0,2}(v\d+\.\d+)\*{0,2}$/.exec(cellak[1]);
    if (!m) continue;
    ki.push({ verzio: m[1], tartalom: cellak[2], allapot: cellak[3] });
  }
  return ki;
}
const PLAN_SOROK = planSorok();
/** Csak a FŐ táblázat sorai (a szakasz-táblák `v0.4/1` alakúak, azok kiestek). */
const KESZ = PLAN_SOROK.filter((s) => /kész/.test(s.allapot));

/** `VERZIO` a `config.js`-ből. */
const VERZIO = (/(?:export\s+)?const\s+VERZIO\s*=\s*'([^']+)'/.exec(CONFIG.kod) || [])[1] || null;

// ══════════════════════════════════════════════════════════════════════════

console.log('AGE OF THE CRYSTALS — KIADÁS-ELLENŐRZŐ'
  + (VERZIO ? '  ·  v' + VERZIO : ''));
console.log('statikus kapu · a részletes elvárás-lista: qa/KIADAS_ELVARASOK.md');

// ══════════════════════════════════════════════════════════════════════════
cim('A) RÉTEGHATÁROK — a sim nem tudhat a világ többi részéről');

elvar('a src/sim/ nem importál render/ui/net réteget', () => {
  const h = [];
  for (const p of SIM) {
    const k = forras(p).kod;
    for (const m of k.matchAll(/from\s+'([^']+)'/g)) {
      if (/(^|\/)(render|ui|net|core)\//.test(m[1])) {
        h.push(rel(p) + ':' + sorSzam(k, m.index) + ' → ' + m[1]);
      }
    }
  }
  return rossz(h);
});

elvar('a src/sim/ csak relatív modult importál (nincs `three`, `ws`)', () => {
  const h = [];
  for (const p of SIM) {
    const k = forras(p).kod;
    for (const m of k.matchAll(/from\s+'([^']+)'/g)) {
      if (!m[1].startsWith('.')) h.push(rel(p) + ':' + sorSzam(k, m.index) + ' → ' + m[1]);
    }
  }
  return rossz(h);
});

elvar('a src/sim/ nem nyúl DOM-hoz és böngésző-globálishoz', () => {
  const h = [];
  const tiltott = /\b(document|window|navigator|localStorage|sessionStorage|requestAnimationFrame|fetch|WebSocket|process|require)\b/g;
  for (const p of SIM) {
    const k = forras(p).kod;
    for (const m of k.matchAll(tiltott)) {
      h.push(rel(p) + ':' + sorSzam(k, m.index) + ' → ' + m[1]);
    }
  }
  return rossz(h);
});

elvar('a src/sim/ importjai relatívak ÉS `.js`-re végződnek', () => {
  const h = [];
  for (const p of SIM) {
    const k = forras(p).kod;
    for (const m of k.matchAll(/from\s+'(\.[^']*)'/g)) {
      if (!m[1].endsWith('.js')) h.push(rel(p) + ' → ' + m[1] + ' (a böngésző ESM nem told kiterjesztést)');
    }
  }
  return rossz(h);
});

elvar('a render és a UI nem ÍR sim-állapotot', () => {
  // A világra hatás EGYETLEN útja a `sim.parancs(...)`. Amit itt keresünk:
  // `sim.mezo = …`, `sim.mezo.almezo = …`, `sim.mezo[i] = …` — a hívásokat
  // (`sim.parancs(...)`) és az összehasonlításokat (`==`, `===`, `>=`) nem.
  const h = [];
  const minta = /\bsim(\.[A-Za-z_$][\w$]*)+(\s*\[[^\];]*\])?\s*(\+|-|\*|\/)?=(?!=)/g;
  for (const p of [...RENDER, ...UI]) {
    const k = forras(p).kod;
    for (const m of k.matchAll(minta)) {
      h.push(rel(p) + ':' + sorSzam(k, m.index) + ' → ' + m[0].trim());
    }
  }
  return rossz(h);
});

elvar('a src/net/ nem importál render/ui réteget (node-ban is fut)', () => {
  const h = [];
  for (const p of NET) {
    const k = forras(p).kod;
    for (const m of k.matchAll(/from\s+'([^']+)'/g)) {
      if (/(^|\/)(render|ui)\//.test(m[1])) h.push(rel(p) + ' → ' + m[1]);
    }
  }
  return rossz(h);
});

elvar('a relay-szerver nem tud a játékról (nincs src/ import)', () => {
  const p = join(GYOKER, 'server', 'relay.mjs');
  if (!existsSync(p)) return rossz(['nincs server/relay.mjs']);
  const k = forras(p).kod;
  const h = [];
  for (const m of k.matchAll(/from\s+'([^']+)'/g)) {
    if (/src\//.test(m[1])) h.push('relay.mjs → ' + m[1]);
  }
  return rossz(h);
});

elvar('az adat-rétegek DOM-mentesek (node-ban szondázhatók)', () => {
  // A `minimap_adat.js` és a `civ_valaszto_adat.js` azért külön fájl, hogy a
  // szonda futtatni tudja őket. Egy becsúszó `document` ezt némán elveszi.
  const h = [];
  for (const nev of ['minimap_adat.js', 'civ_valaszto_adat.js']) {
    const p = join(GYOKER, 'src', 'ui', nev);
    if (!existsSync(p)) { h.push('hiányzik: src/ui/' + nev); continue; }
    const k = forras(p).kod;
    for (const m of k.matchAll(/\b(document|window|HTMLElement|canvas\.getContext)\b/g)) {
      h.push('src/ui/' + nev + ':' + sorSzam(k, m.index) + ' → ' + m[1]);
    }
  }
  return rossz(h);
});

// ══════════════════════════════════════════════════════════════════════════
cim('B) SIM-HIGIÉNIA — amit a determinizmus-szonda NEM néz');

elvar('nincs TODO / FIXME / XXX a src/sim/ alatt', () => {
  const h = [];
  for (const p of SIM) {
    const n = forras(p).nyers;
    for (const m of n.matchAll(/\b(TODO|FIXME|XXX|HACK)\b/g)) {
      h.push(rel(p) + ':' + sorSzam(n, m.index) + ' → ' + m[1]);
    }
  }
  return rossz(h);
});

elvar('nincs console.* a src/sim/ alatt', () => {
  const h = [];
  for (const p of SIM) {
    const k = forras(p).kod;
    for (const m of k.matchAll(/\bconsole\s*\.\s*(\w+)/g)) {
      h.push(rel(p) + ':' + sorSzam(k, m.index) + ' → console.' + m[1]);
    }
  }
  return rossz(h);
});

elvar('nincs objektum-kulcs bejárás a src/sim/ alatt', () => {
  // A `for…in`-t a determinizmus-szonda fogja; az `Object.keys/values/entries`
  // UGYANAZ a motorfüggő sorrend, csak más köntösben — azt itt zárjuk le.
  const h = [];
  for (const p of SIM) {
    const k = forras(p).kod;
    for (const m of k.matchAll(/\bObject\s*\.\s*(keys|values|entries|getOwnPropertyNames)\b/g)) {
      h.push(rel(p) + ':' + sorSzam(k, m.index) + ' → Object.' + m[1]);
    }
  }
  return rossz(h);
});

elvar('minden .sort() kap összehasonlítót a src/sim/ alatt', () => {
  // Az alapértelmezett rendezés SZÖVEGES, és két különböző hosszú számhalmazon
  // más sorrendet ad — pont az a fajta hiba, amit a hash csak sokkal később mutat.
  const h = [];
  for (const p of SIM) {
    const k = forras(p).kod;
    for (const m of k.matchAll(/\.sort\s*\(\s*([^)]?)/g)) {
      if (m[1] === '' || m[1] === ')') h.push(rel(p) + ':' + sorSzam(k, m.index) + ' → .sort() üres');
    }
  }
  return rossz(h);
});

elvar('a src/sim/ nevesített exportokat ad (nincs `export default`)', () => {
  const h = [];
  for (const p of SIM) {
    if (/\bexport\s+default\b/.test(forras(p).kod)) h.push(rel(p));
  }
  return rossz(h);
});

// ══════════════════════════════════════════════════════════════════════════
cim('C) FEJLÉC-KOMMENTEK — a MIÉRT, nem a mit');

/** A fájl legelső blokkjának összefüggő komment-fejléce (`//` vagy `/* … *\/`). */
function fejlec(nyers) {
  const sorok = nyers.split('\n');
  const ki = [];
  let blokkban = false;
  for (const s of sorok) {
    const t = s.trim();
    if (blokkban) { ki.push(t); if (t.includes('*/')) blokkban = false; continue; }
    if (t.startsWith('//')) { ki.push(t); continue; }
    if (t.startsWith('/*')) { ki.push(t); if (!t.includes('*/')) blokkban = true; continue; }
    if (t === '') { if (ki.length === 0) continue; break; }
    break;
  }
  return ki;
}

elvar('minden src/sim/ fájl komment-fejléccel kezdődik', () => {
  const h = [];
  for (const p of SIM) {
    if (fejlec(forras(p).nyers).length === 0) h.push(rel(p));
  }
  return rossz(h);
});

elvar('a sim-fejlécek érdemi hosszúak (≥ 6 sor, ≥ 300 karakter)', () => {
  const h = [];
  for (const p of SIM) {
    const f = fejlec(forras(p).nyers);
    const kar = f.join(' ').length;
    if (f.length < 6 || kar < 300) {
      h.push(rel(p) + ' — ' + f.length + ' sor, ' + kar + ' karakter');
    }
  }
  return rossz(h);
});

elvar('a sim-fejlécek követik a MIÉRT-idiómát (szakaszcím vagy „MIÉRT")', () => {
  // ⚠️ LÁGY, ÉS EZ NEM MEGALKUVÁS. Azt, hogy egy komment a MIÉRT-et magyarázza-e,
  // gép nem tudja eldönteni — csak azt, hogy követi-e a projekt fejléc-IDIÓMÁJÁT
  // (`── CÍM ──` szakaszok, kimondott „MIÉRT"). A `grid.js` és az `rng.js`
  // fejléce például hibátlanul indokol, csak régebbi, mint az idióma. Kemény
  // gátként ez a vizsgálat hamis riasztást adna, és két hamis riasztás után
  // senki nem nézi meg a kimenetet.
  const h = [];
  for (const p of SIM) {
    const f = fejlec(forras(p).nyers).join('\n');
    if (!/MIÉRT|MIERT|──|⚠️/.test(f)) h.push(rel(p) + ' — indokol, de nem az idióma szerint');
  }
  return rossz(h);
}, true);

elvar('minden render/ui fájl komment-fejléccel kezdődik', () => {
  const h = [];
  for (const p of [...RENDER, ...UI]) {
    if (!/\.js$/.test(p)) continue;
    if (fejlec(forras(p).nyers).length === 0) h.push(rel(p));
  }
  return rossz(h);
});

elvar('minden tools/ szonda fejlécében ott a HASZNÁLAT és a kilépési kód', () => {
  const h = [];
  for (const p of SZONDAK) {
    const f = fejlec(forras(p).nyers).join('\n');
    if (!/HASZNÁLAT/.test(f)) h.push(rel(p) + ' — nincs „HASZNÁLAT:" a fejlécben');
    else if (!/[Kk]ilépési kód/.test(f)) h.push(rel(p) + ' — nincs kilépési kód a fejlécben');
  }
  return rossz(h);
});

// ══════════════════════════════════════════════════════════════════════════
cim('D) VERZIÓ — egy forrás, és a terv ne mondjon mást');

elvar('a VERZIO a src/core/config.js-ben van, x.y.z alakban', () => {
  if (!VERZIO) return rossz(['nincs `export const VERZIO` a src/core/config.js-ben']);
  if (!/^\d+\.\d+\.\d+$/.test(VERZIO)) return rossz(['a VERZIO nem x.y.z alakú: ' + VERZIO]);
  return jo('VERZIO = ' + VERZIO);
});

elvar('a VERZIO és a PLAN.md utolsó „kész" verziója egyezik', () => {
  if (!VERZIO || KESZ.length === 0) return rossz(['nincs VERZIO vagy nincs „kész" sor a PLAN.md-ben']);
  const utolso = KESZ[KESZ.length - 1].verzio;          // pl. 'v0.9'
  const eleje = 'v' + VERZIO.split('.').slice(0, 2).join('.');
  if (eleje !== utolso) {
    return rossz(['config.js VERZIO = ' + VERZIO + ' (→ ' + eleje + '), '
      + 'a PLAN.md utolsó kész sora viszont ' + utolso]);
  }
  return jo('VERZIO ' + VERZIO + '  ↔  PLAN.md ' + utolso + ' kész');
});

elvar('a kész verziók összefüggő előtagot alkotnak a PLAN.md-ben', () => {
  // Egy „kész" sor egy nem-kész UTÁN azt jelenti, hogy a terv sorrendje és a
  // munka sorrendje elvált — ilyenkor a kiadási kapu nem tudja, mit zár le.
  const h = [];
  let voltNemKesz = null;
  for (const s of PLAN_SOROK) {
    const kesz = /kész/.test(s.allapot);
    if (!kesz && !voltNemKesz) voltNemKesz = s.verzio;
    if (kesz && voltNemKesz) h.push(s.verzio + ' kész, pedig ' + voltNemKesz + ' még nem az');
  }
  return rossz(h);
});

elvar('a VERZIO az egyetlen verzió-forrás (a kód nem olvas package.json-t)', () => {
  const h = [];
  for (const p of [...SIM, ...RENDER, ...UI, ...NET, ...jsFajlok('src', 'core'), join(GYOKER, 'src', 'main.js')]) {
    if (!existsSync(p)) continue;
    if (/package\.json/.test(forras(p).kod)) h.push(rel(p));
  }
  return rossz(h);
});

elvar('nincs beégetett verzió-sztring a src/ alatt (csak a config.js-ben)', () => {
  const h = [];
  const mind = [...SIM, ...RENDER, ...UI, ...NET, join(GYOKER, 'src', 'main.js')];
  for (const p of mind) {
    if (!existsSync(p)) continue;
    const k = forras(p).kod;
    for (const m of k.matchAll(/'v?\d+\.\d+\.\d+'/g)) {
      h.push(rel(p) + ':' + sorSzam(k, m.index) + ' → ' + m[0]);
    }
  }
  return rossz(h);
});

elvar('az INTERFACES.md `__aoc.verzio` példája a mostani VERZIO', () => {
  // ⚠️ LÁGY, és tudatosan: illusztratív kódblokkról van szó, és az FPS-szonda a
  // FUTÓ értéket már összeveti a `config.js`-szel. Attól még doksi-rothadás, ha
  // eltér — a fájl magát nevezi „igazságforrásnak".
  const m = /verzio:\s*'([^']+)'/.exec(INTERFACES);
  if (!m) return jo('nincs verzió-példa az INTERFACES.md-ben');
  if (m[1] !== VERZIO) {
    return rossz(['INTERFACES.md → `verzio: \'' + m[1] + '\'`, a config.js viszont ' + VERZIO]);
  }
  return jo();
}, true);

// ══════════════════════════════════════════════════════════════════════════
cim('E) A TERV ÉS A JELENTÉSEK — ne mondjon készet a semmire');

elvar('a PLAN.md verzió-táblázata hézagmentes (v0.1 … v1.0)', () => {
  const h = [];
  const szamok = PLAN_SOROK.map((s) => s.verzio);
  if (!szamok.includes('v1.0')) h.push('nincs v1.0 sor');
  const minorok = PLAN_SOROK
    .filter((s) => s.verzio.startsWith('v0.'))
    .map((s) => Number(s.verzio.slice(3)))
    .sort((a, b) => a - b);
  for (let i = 1; i < minorok.length; i++) {
    if (minorok[i] !== minorok[i - 1] + 1) {
      h.push('lyuk a táblázatban: v0.' + minorok[i - 1] + ' után v0.' + minorok[i]);
    }
  }
  return rossz(h);
});

elvar('minden „kész" verzió alatt van „állása" szakasz vagy qa-jelentés', () => {
  const h = [];
  for (const s of KESZ) {
    const allasa = new RegExp('^##+\\s+A\\s+' + s.verzio.replace('.', '\\.') + '\\s+állása', 'm').test(PLAN);
    const jelentes = new RegExp('qa/V' + s.verzio.slice(1).replace('.', '\\.')
      + '_EREDMENY\\.md', 'i').test(s.allapot);
    if (!allasa && !jelentes) h.push(s.verzio + ' „kész", de se „állása" szakasz, se qa-jelentés');
  }
  return rossz(h);
});

elvar('minden „állása" szakaszhoz van sor a fő táblázatban', () => {
  const h = [];
  for (const m of PLAN.matchAll(/^##+\s+A\s+(v\d+\.\d+)\s+állása/gm)) {
    if (!PLAN_SOROK.some((s) => s.verzio === m[1])) h.push(m[1] + ' — van szakasza, de nincs táblázat-sora');
  }
  return rossz(h);
});

elvar('a PLAN.md minden hivatkozott qa-fájlja létezik', () => {
  const h = [];
  for (const m of PLAN.matchAll(/qa\/[\w.\-]+\.md/g)) {
    if (!van(m[0])) h.push('hiányzik: ' + m[0]);
  }
  return rossz(h);
});

elvar('minden qa-jelentésre hivatkozik a PLAN.md', () => {
  const h = [];
  for (const nev of readdirSync(join(GYOKER, 'qa')).sort()) {
    if (!/_EREDMENY\.md$/.test(nev)) continue;
    if (!PLAN.includes('qa/' + nev)) h.push('qa/' + nev + ' — a PLAN.md nem hivatkozik rá');
  }
  return rossz(h);
});

elvar('a szakasz-táblák minden sorának ki van töltve az állapota', () => {
  // A `| v0.4/1 | … | |` alakú sor azt jelenti, hogy egy szakasz elkezdődött, és
  // senki nem írta le, hol tart. Ez a féltudás rosszabb, mint a semmi.
  const h = [];
  for (const s of PLAN.split('\n')) {
    if (!s.startsWith('|')) continue;
    const c = s.split('|').map((x) => x.trim());
    if (c.length < 4) continue;
    if (!/^v\d+\.\d+\/\d+$/.test(c[1])) continue;
    if (c[3] === '') h.push(c[1] + ' — üres állapot-cella');
  }
  return rossz(h);
});

// ══════════════════════════════════════════════════════════════════════════
cim('F) SZONDÁK — ami nincs a package.json-ban, azt senki nem futtatja');

elvar('minden tools/*_szonda.mjs-hez tartozik `npm run` parancs', () => {
  const h = [];
  const scriptek = Object.values(PKG.scripts || {}).join(' ; ');
  for (const p of SZONDAK) {
    if (!scriptek.includes(rel(p))) {
      h.push(rel(p) + ' — nincs `npm run` parancs, csak kézzel indítható');
    }
  }
  return rossz(h);
});

elvar('a package.json minden hivatkozott fájlja létezik', () => {
  const h = [];
  for (const [nev, parancs] of Object.entries(PKG.scripts || {})) {
    for (const m of String(parancs).matchAll(/\b((?:tools|server|src)\/[\w.\-/]+)/g)) {
      if (!van(m[1])) h.push('npm run ' + nev + ' → hiányzik: ' + m[1]);
    }
  }
  return rossz(h);
});

elvar('az `npm run szonda` lánc minden szonda-parancsot tartalmaz', () => {
  // A gyűjtő-parancs a projekt „mindent lefuttat" gombja. Ami kimarad belőle,
  // az a gyakorlatban SOSEM fut le — a v0.9/3 civ-szondája pontosan így maradt
  // kívül a kapun.
  const lanc = String((PKG.scripts || {}).szonda || '');
  if (!lanc) return rossz(['nincs `szonda` script a package.json-ban']);
  const h = [];
  for (const [nev, parancs] of Object.entries(PKG.scripts || {})) {
    if (nev === 'szonda') continue;
    if (!/_szonda\.mjs/.test(String(parancs))) continue;
    if (!new RegExp('\\b' + nev + '\\b').test(lanc)) h.push('npm run ' + nev + ' — nincs a `szonda` láncban');
  }
  return rossz(h);
});

elvar('minden szonda kilépési kóddal zár (process.exit)', () => {
  const h = [];
  for (const p of SZONDAK) {
    if (!/process\.exit\s*\(/.test(forras(p).kod)) h.push(rel(p) + ' — nincs process.exit()');
  }
  return rossz(h);
});

elvar('a kiadás-ellenőrzőnek is van `npm run` parancsa', () => {
  const scriptek = Object.values(PKG.scripts || {}).join(' ; ');
  if (!scriptek.includes('kiadas_ellenorzo.mjs')) {
    return rossz(['tools/kiadas_ellenorzo.mjs — nincs `npm run` parancs '
      + '(a package.json-t ez az ellenőrző NEM írja; a sávok diszjunktak)']);
  }
  return jo();
}, true);

// ══════════════════════════════════════════════════════════════════════════
cim('G) TÁBLA-TELJESSÉG — a rövid tábla CSENDBEN a 0. sort adja vissza');

const UNITS = forras(join(GYOKER, 'src', 'sim', 'units.js')).vaz;
const EPULETEK = forras(join(GYOKER, 'src', 'sim', 'epuletek.js')).vaz;
const CIVJS = forras(join(GYOKER, 'src', 'sim', 'civ.js')).vaz;
const TECHJS = forras(join(GYOKER, 'src', 'sim', 'technologia.js')).vaz;
const TERKEPJS = van('src/sim/terkep.js') ? forras(join(GYOKER, 'src', 'sim', 'terkep.js')).vaz : '';

const TIPUS_DB = szamErtek(UNITS, 'TIPUS_DB');
const EPULET_DB = (enumKulcsok(EPULETEK, 'EPULET') || []).length;
const CIV_DB = szamErtek(CIVJS, 'CIV_DB');
const TECH_DB = szamErtek(TECHJS, 'TECH_DB');
const TERKEP_DB = TERKEPJS ? szamErtek(TERKEPJS, 'TERKEP_DB') : null;

elvar('minden TIPUS-indexelt tábla `TIPUS_DB` hosszú', () => {
  if (!TIPUS_DB) return rossz(['nem olvasható a TIPUS_DB a units.js-ből']);
  const { hibak } = tablaCsoport(TIPUS_TABLAK, TIPUS_DB, 'TIPUS_DB');
  return hibak.length ? rossz(hibak) : jo(TIPUS_TABLAK.length + ' tábla · TIPUS_DB = ' + TIPUS_DB);
});

elvar('a TIPUS enum hézagmentes 0 … TIPUS_DB-1', () => {
  const k = enumKulcsok(UNITS, 'TIPUS');
  if (!k) return rossz(['nem olvasható a TIPUS enum']);
  const h = [];
  if (k.length !== TIPUS_DB) h.push('a TIPUS ' + k.length + ' kulcsú, a TIPUS_DB ' + TIPUS_DB);
  k.forEach((e, i) => { if (e.ertek !== i) h.push(e.nev + ' = ' + e.ertek + ', elvárt ' + i); });
  return rossz(h);
});

elvar('minden EPULET-indexelt tábla az épülettípusok számával egyezik', () => {
  if (!EPULET_DB) return rossz(['nem olvasható az EPULET enum']);
  const { hibak, lagyak } = tablaCsoport(EPULET_TABLAK, EPULET_DB, 'EPULET kulcsok');
  if (hibak.length) return rossz(hibak);
  return jo(EPULET_TABLAK.length + ' tábla · ' + EPULET_DB + ' épülettípus'
    + (lagyak.length ? '  (' + lagyak.length + ' tudatos kivétel — lásd lent)' : ''));
});

elvar('a tudatosan rövid EPULET-táblák védettek maradnak', () => {
  const { lagyak } = tablaCsoport(EPULET_TABLAK, EPULET_DB, 'EPULET kulcsok');
  return lagyak.length ? { ok: false, reszletek: lagyak } : jo('nincs kivétel');
}, true);

elvar('az EPULET enum hézagmentes', () => {
  const k = enumKulcsok(EPULETEK, 'EPULET') || [];
  const h = [];
  k.forEach((e, i) => { if (e.ertek !== i) h.push(e.nev + ' = ' + e.ertek + ', elvárt ' + i); });
  return rossz(h);
});

elvar('minden CIV-indexelt tábla `CIV_DB` hosszú', () => {
  if (!CIV_DB) return rossz(['nem olvasható a CIV_DB']);
  const { hibak } = tablaCsoport(CIV_TABLAK, CIV_DB, 'CIV_DB');
  return hibak.length ? rossz(hibak) : jo(CIV_TABLAK.length + ' tábla · CIV_DB = ' + CIV_DB);
});

elvar('a CIV enum hézagmentes és `CIV_DB` méretű', () => {
  const k = enumKulcsok(CIVJS, 'CIV');
  if (!k) return rossz(['nem olvasható a CIV enum']);
  const h = [];
  if (k.length !== CIV_DB) h.push('a CIV ' + k.length + ' kulcsú, a CIV_DB ' + CIV_DB);
  k.forEach((e, i) => { if (e.ertek !== i) h.push(e.nev + ' = ' + e.ertek + ', elvárt ' + i); });
  return rossz(h);
});

/**
 * ⚠️ A FORDÍTOTT OLVASAT. Az ÁR és az IDŐ nagyobb értéke ROSSZ — a
 * Kristálykovácsok `+10 %` egység-ára HÁTRÁNY, nem előny. Ezen a projekten már
 * megbukott a determinizmus-szonda 12. vizsgálatának első változata, és ennek
 * az ellenőrzőnek az első változata is: a „van-e negatív szám a sorban?"
 * kérdésre a Kristálykovácsok sora NEM felel, pedig szabályos népről van szó.
 * A hármas listát ezért NÉV szerint rögzítjük, és külön ellenőrizzük, hogy a
 * nevek léteznek-e — egy átnevezés különben csendben visszahozná a hibát.
 */
const FORDITOTT_HATAS = ['EGYSEG_AR', 'EGYSEG_IDO', 'EPULET_AR'];

elvar('minden népnek van HÁTRÁNYA is (a fordított olvasattal együtt)', () => {
  // A `PLAN.md` v0.9-es szakasza kimondja: egy csupa pozitívumból álló nép nem
  // „erős civ", hanem a választás megszüntetése — a másik hét halott kód lenne.
  const l = literal(CIVJS, 'CIV_BONUSZ');
  if (!l) return rossz(['nem olvasható a CIV_BONUSZ']);
  const hatasok = (enumKulcsok(CIVJS, 'HATAS') || []).map((e) => e.nev);
  const h = [];
  for (const f of FORDITOTT_HATAS) {
    if (!hatasok.includes(f)) h.push('a HATAS-ban nincs `' + f + '` — átnevezték? a fordított olvasat elcsúszott');
  }
  const nevek = felsoElemek((literal(forras(join(GYOKER, 'src', 'sim', 'civ.js')).kod, 'CIV_NEV')
    || { belso: '' }).belso).map((s) => s.replace(/['\s]/g, ''));
  felsoElemek(l.belso).forEach((sorSzoveg, i) => {
    const tetelek = [...sorSzoveg.matchAll(/\[\s*HATAS\s*\.\s*(\w+)\s*,[^,\]]*,\s*([+-]?\d+)\s*\]/g)];
    if (tetelek.length === 0) { h.push((i + 1) + '. nép — nem olvasható bónusz-sor'); return; }
    const hatrany = tetelek.some((t) => (FORDITOTT_HATAS.includes(t[1])
      ? Number(t[2]) > 0 : Number(t[2]) < 0));
    if (!hatrany) {
      h.push((i + 1) + '. nép (' + (nevek[i] || '?') + ') — csupa előny, nincs hátránya');
    }
  });
  return rossz(h);
});

elvar('minden TECH-indexelt tábla `TECH_DB` hosszú', () => {
  if (!TECH_DB) return rossz(['nem olvasható a TECH_DB']);
  const { hibak } = tablaCsoport(TECH_TABLAK, TECH_DB, 'TECH_DB');
  return hibak.length ? rossz(hibak) : jo(TECH_TABLAK.length + ' tábla · TECH_DB = ' + TECH_DB);
});

elvar('minden TERKEP-indexelt tábla `TERKEP_DB` hosszú', () => {
  if (!TERKEPJS) return jo('nincs még src/sim/terkep.js — a v0.10 dolga');
  if (!TERKEP_DB) return rossz(['nem olvasható a TERKEP_DB']);
  const { hibak } = tablaCsoport(TERKEP_TABLAK, TERKEP_DB, 'TERKEP_DB');
  return hibak.length ? rossz(hibak) : jo(TERKEP_TABLAK.length + ' tábla · TERKEP_DB = ' + TERKEP_DB);
});

elvar('minden név-tábla a saját enumjával egyforma hosszú', () => {
  const h = [];
  for (const [tf, tn, ef, en] of NEV_TABLAK) {
    if (!van(tf) || !van(ef)) { h.push(tf + ' / ' + ef + ' — hiányzó fájl'); continue; }
    const hossz = tombHossz(forras(join(GYOKER, tf)).vaz, tn);
    const kulcs = enumKulcsok(forras(join(GYOKER, ef)).vaz, en);
    if (hossz === null || kulcs === null) { h.push(tn + ' / ' + en + ' — nem olvasható'); continue; }
    if (hossz !== kulcs.length) {
      h.push(tn + ' hossza ' + hossz + ', a(z) ' + en + ' enum ' + kulcs.length + ' kulcsú');
    }
  }
  return rossz(h);
});

elvar('a SZORZO ellensúly-mátrix TAMADAS × PANCEL méretű', () => {
  const harc = forras(join(GYOKER, 'src', 'sim', 'harc.js')).vaz;
  const tam = (enumKulcsok(harc, 'TAMADAS') || []).length;
  const pan = (enumKulcsok(harc, 'PANCEL') || []).length;
  const l = literal(harc, 'SZORZO');
  if (!l || !tam || !pan) return rossz(['nem olvasható a SZORZO / TAMADAS / PANCEL']);
  const sorok = felsoElemek(l.belso);
  const h = [];
  if (sorok.length !== tam) h.push('a SZORZO ' + sorok.length + ' soros, a TAMADAS ' + tam + ' fajtájú');
  sorok.forEach((s, i) => {
    const belso = literal('const _ = ' + s.trim(), '_');
    const hossz = belso ? felsoElemek(belso.belso).length : -1;
    if (hossz !== pan) h.push((i + 1) + '. sor ' + hossz + ' oszlopos, a PANCEL ' + pan + ' fajtájú');
  });
  return rossz(h);
});

elvar('az EGYSEG_TIPUS_DB (civ.js) és a TIPUS_DB (units.js) egyezik', () => {
  // A civ ár- és idő-szorzói ekkora tömbökbe terülnek szét. Ha a kettő elválik,
  // a `MIND` indexű bónusz csendben kihagyja a legfelső típust — a v0.9/2
  // fejléce pont ezt írja le.
  const e = szamErtek(CIVJS, 'EGYSEG_TIPUS_DB');
  if (e === null) return rossz(['nem olvasható az EGYSEG_TIPUS_DB']);
  if (e !== TIPUS_DB) return rossz(['EGYSEG_TIPUS_DB = ' + e + ', TIPUS_DB = ' + TIPUS_DB]);
  return jo('mindkettő ' + e);
});

// ══════════════════════════════════════════════════════════════════════════
cim('H) MENTÉS — ami kimarad a betöltésből, az elveszik');

const MENTES = forras(join(GYOKER, 'src', 'sim', 'mentes.js'));

elvar('a `betoltes()` minden `mentes()`-blokkot visszatölt', () => {
  // A v0.7/2 legdrágább hibafajtája: a `mentes()` kiír egy blokkot, a
  // `betoltes()` meg nem olvassa. A mentés lefut, a betöltés lefut, és a
  // hiányzó réteg csak SOKKAL később, a folytatásban mutatkozik meg.
  const torzs = fuggvenyTorzs(MENTES.vaz, /export\s+function\s+mentes\s*\(/);
  const betolt = fuggvenyTorzs(MENTES.vaz, /export\s+function\s+betoltes\s*\(/);
  if (!torzs || !betolt) return rossz(['nem olvasható a mentes()/betoltes() törzse']);
  // A visszaadott objektum-literál felső szintű kulcsai.
  const nyit = torzs.indexOf('return {');
  if (nyit < 0) return rossz(['a mentes() nem objektum-literált ad vissza']);
  const l = literal('const _ = ' + torzs.slice(nyit + 'return '.length), '_');
  if (!l) return rossz(['nem párosítható a mentes() visszatérési literálja']);
  const kulcsok = [];
  for (const e of felsoElemek(l.belso)) {
    const m = /^\s*([A-Za-z_$][\w$]*)\s*[:,]?/.exec(e);
    if (m) kulcsok.push(m[1]);
  }
  const h = [];
  for (const k of kulcsok) {
    if (!new RegExp('\\bm\\s*\\.\\s*' + k + '\\b').test(betolt)) {
      h.push('`' + k + '` — a mentes() kiírja, a betoltes() sosem olvassa');
    }
  }
  return h.length ? rossz(h) : jo(kulcsok.length + ' blokk, mind visszatöltve');
});

elvar('a `betoltes()` ellenőrzi a verziót, a seedet, a méretet és a presetet', () => {
  const betolt = fuggvenyTorzs(MENTES.vaz, /export\s+function\s+betoltes\s*\(/) || '';
  const h = [];
  for (const k of ['verzio', 'seed', 'n', 'terkep']) {
    if (!new RegExp('m\\s*\\.\\s*' + k + '\\b[^;]*(!==|===)').test(betolt)) {
      h.push('`' + k + '` — nincs ellenőrizve a betöltés elején');
    }
  }
  return rossz(h);
});

elvar('a MENTES_VERZIO létezik, és a mentés is, a betöltés is használja', () => {
  const v = szamErtek(MENTES.vaz, 'MENTES_VERZIO');
  if (v === null) return rossz(['nincs MENTES_VERZIO']);
  const h = [];
  const ment = fuggvenyTorzs(MENTES.vaz, /export\s+function\s+mentes\s*\(/) || '';
  const betolt = fuggvenyTorzs(MENTES.vaz, /export\s+function\s+betoltes\s*\(/) || '';
  if (!/MENTES_VERZIO/.test(ment)) h.push('a mentes() nem írja ki a MENTES_VERZIO-t');
  if (!/MENTES_VERZIO/.test(betolt)) h.push('a betoltes() nem ellenőrzi a MENTES_VERZIO-t');
  return h.length ? rossz(h) : jo('MENTES_VERZIO = ' + v);
});

elvar('a MENTES_VERZIO emelése dokumentálva van (melyik blokk mikor jött)', () => {
  // Szám önmagában nem mond semmit. A projekt idiómája az, hogy a `MENTES_VERZIO`
  // mellett ott a sor: melyik verzió melyik blokkot hozta.
  const m = /MENTES_VERZIO\s*=\s*\d+\s*;?\s*(\/\/[^\n]*)?/.exec(MENTES.nyers);
  const megj = (m && m[1]) || '';
  if (!/v\d+\.\d+/.test(megj)) {
    return rossz(['a MENTES_VERZIO mellett nincs verzió-hivatkozású megjegyzés']);
  }
  return jo(megj.trim());
});

elvar('a mentés szöveges párja is megvan (mentesSzoveg / betoltesSzoveg)', () => {
  const h = [];
  for (const f of ['mentesSzoveg', 'betoltesSzoveg']) {
    if (!new RegExp('export\\s+function\\s+' + f + '\\b').test(MENTES.kod)) h.push('hiányzik: ' + f + '()');
  }
  return rossz(h);
});

// ══════════════════════════════════════════════════════════════════════════
cim('I) RENDER-SZERZŐDÉS ÉS HALOTT KÓD');

elvar('minden render-osztály adja a frissit / enabled / haromszog hármast', () => {
  // Az FPS-szonda ezen a hármason kapcsolja ki a rétegeket egyesével — a
  // képkocka-költség bontása ezen múlik. Egy réteg, ami nem adja, kimarad a
  // mérésből, és a hiányzó ezredmásodpercek senkinek nem tűnnek fel.
  const h = [];
  for (const p of RENDER) {
    const k = forras(p).kod;
    for (const m of k.matchAll(/export\s+class\s+(\w+)/g)) {
      const nev = m[1];
      const utan = k.slice(m.index);
      const hiany = [];
      if (!/\n\s{2}frissit\s*\(/.test(utan)) hiany.push('frissit()');
      if (!/\n\s{2}set\s+enabled\s*\(/.test(utan)) hiany.push('set enabled');
      if (!/\n\s{2}get\s+haromszog\s*\(/.test(utan)) hiany.push('get haromszog');
      if (hiany.length) h.push(rel(p) + ' → ' + nev + ': hiányzik ' + hiany.join(', '));
    }
  }
  return rossz(h);
});

elvar('a render `frissit()`-je nem allokál képkockánként', () => {
  // ⚠️ LÁGY, mert heurisztika: egy `new THREE.Vector3()` a `frissit()`-ben
  // biztosan baj, egy `new Map()` egy ritkán futó ágban viszont lehet ártalmatlan.
  // A `CLAUDE.md` szabálya („nulla per-frame allokáció") így is kimondható —
  // csak nem gépi bizonyossággal.
  const h = [];
  for (const p of RENDER) {
    const k = forras(p).kod;
    let i = 0;
    for (;;) {
      const m = /\n\s{2}frissit\s*\([^)]*\)\s*\{/.exec(k.slice(i));
      if (!m) break;
      const torzs = fuggvenyTorzs(k.slice(i + m.index), /frissit\s*\(/);
      i += m.index + m[0].length;
      if (!torzs) continue;
      for (const t of torzs.matchAll(/\bnew\s+([A-Za-z_$][\w$.]*)|(\.(?:map|filter|concat)\s*\()/g)) {
        h.push(rel(p) + ' → frissit(): ' + (t[1] ? 'new ' + t[1] : t[2].trim()));
      }
    }
  }
  return rossz(h);
}, true);

elvar('nincs halott fájl a src/ alatt (main.js-ből vagy szondából elérhető)', () => {
  // ⚠️ LÁGY: a `PLAN.md` maga jelöl be be nem kötött fájlokat (a civ-választó a
  // v0.11-é). A lista mégis kell — egy „kész" alrendszer, amit senki nem
  // importál, a legdrágább fajta önámítás.
  const mind = [...SIM, ...RENDER, ...UI, ...NET, join(GYOKER, 'src', 'main.js'),
    ...jsFajlok('src', 'core')];
  const elert = new Set();
  const sorbanAll = [join(GYOKER, 'src', 'main.js')];
  while (sorbanAll.length) {
    const p = sorbanAll.pop();
    if (elert.has(p) || !existsSync(p)) continue;
    elert.add(p);
    for (const m of forras(p).kod.matchAll(/from\s+'(\.[^']+)'/g)) {
      sorbanAll.push(resolve(dirname(p), m[1]));
    }
  }
  // A szondák dinamikusan importálnak (`join(SIM_DIR, 'sim.js')`), ezért
  // fájlnév szerint nézzük meg őket — a projektben nincs névütközés.
  const szondaSzoveg = jsFajlok('tools').map((p) => forras(p).nyers).join('\n');
  const h = [];
  for (const p of mind) {
    if (elert.has(p)) continue;
    if (szondaSzoveg.includes("'" + basename(p) + "'")) continue;
    h.push(rel(p) + ' — se a main.js, se egy szonda nem importálja');
  }
  return rossz(h);
}, true);

// ══════════════════════════════════════════════════════════════════════════
cim('J) BUILD ÉS KIRAKÁS');

elvar('a vite.config.js `base`-e a verzióhoz illik (v0.15: /aotc/)', () => {
  const vc = forras(join(GYOKER, 'vite.config.js')).kod;
  const m = /base\s*:\s*'([^']*)'/.exec(vc);
  const minor = VERZIO ? Number(VERZIO.split('.')[1]) : 0;
  if (minor >= 15) {
    if (!m || m[1] !== '/aotc/') {
      return rossz(['a v0.15-től `base: \'/aotc/\'` kell — a SkyNet alkönyvtárból szolgál ki']);
    }
    return jo("base = '/aotc/'");
  }
  if (m && m[1] !== '/') {
    return rossz(['a `base` már be van állítva (' + m[1] + '), pedig a kirakás a v0.15 dolga']);
  }
  return jo('a v0.15 előtt gyökérből szolgálunk ki — nincs base');
});

elvar('a .gitignore kizárja a node_modules-t és a dist-et', () => {
  const gi = olvas('.gitignore');
  const h = [];
  for (const k of ['node_modules', 'dist']) {
    if (!new RegExp('^' + k, 'm').test(gi)) h.push('hiányzik a .gitignore-ból: ' + k);
  }
  return rossz(h);
});

elvar('az index.html a src/main.js-t tölti be', () => {
  const ih = olvas('index.html');
  if (!/src\/main\.js/.test(ih)) return rossz(['az index.html nem hivatkozik a src/main.js-re']);
  return jo();
});

elvar('a CLAUDE.md és az INTERFACES.md megvan és nem üres', () => {
  const h = [];
  for (const f of ['CLAUDE.md', 'INTERFACES.md', 'PLAN.md', 'README.md']) {
    if (!van(f)) { h.push('hiányzik: ' + f); continue; }
    if (olvas(f).trim().length < 200) h.push(f + ' — gyanúsan rövid');
  }
  return rossz(h);
});

elvar('a CLAUDE.md által kikötött szondák léteznek', () => {
  const h = [];
  for (const m of CLAUDEMD.matchAll(/tools\/[\w.\-]+\.mjs/g)) {
    if (!van(m[0])) h.push('a CLAUDE.md hivatkozik rá, de nincs: ' + m[0]);
  }
  return rossz(h);
});

// ══════════════════════════════════════════════════════════════════════════
cim('ÍTÉLET');

const bukottak = eredmenyek.filter((e) => !e.ok && !e.lagy);
const figyelmek = eredmenyek.filter((e) => !e.ok && e.lagy);

sor('elvárás összesen', db);
sor('rendben', db - bukottak.length - figyelmek.length);
sor('figyelmeztetés', figyelmek.length, figyelmek.length ? '(nem buktat)' : '');
sor('BUKOTT', bukottak.length);

if (figyelmek.length) {
  console.log('\n  ⚠ FIGYELMEZTETÉSEK:');
  for (const e of figyelmek) console.log('     ' + e.sorszam + '. ' + e.nev);
}
if (bukottak.length) {
  console.log('\n  ⛔ BUKOTT ELVÁRÁSOK:');
  for (const e of bukottak) console.log('     ' + e.sorszam + '. ' + e.nev);
}

console.log('\n  ' + (bukottak.length === 0
  ? '✅ A PROJEKT KIADHATÓ ÁLLAPOTBAN VAN — mind a ' + db + ' elvárás áll.'
  : '❌ ' + bukottak.length + ' elvárás BUKOTT — a kiadás kapuja ZÁRVA.'));
console.log('  (a részletes indoklás: qa/KIADAS_ELVARASOK.md, azonos sorszámokkal)');
console.log('');
process.exit(bukottak.length === 0 ? 0 : 1);
