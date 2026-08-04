// PORTAL HUB TYCOON — KÖZPONTI ÁLLANDÓK.
//
// ── MIÉRT VAN EZ A FÁJL ───────────────────────────────────────────────────
// Egy tycoon egyensúlya számokból áll, és ha ezek a számok szétszóródnak
// tizenöt fájlban, akkor a hangolás régészet lesz: „hol is van az a 0,7?".
// Ezért MINDEN olyan szám, amit egy játszás után az ember át akar húzni,
// ide kerül — a modulok csak hivatkoznak rá.
//
// A verzió is itt van, nem a `package.json`-ban. A gyökér `package.json` az
// AGE OF THE CRYSTALS-é; ez az alprojekt annak a fájának egy külön ága, és
// az AoC-nál már megégettük magunkat azzal, hogy két helyen állt verziószám.

/** A játék verziója. EZ az igazság, nem a package.json. */
export const VERZIO = '0.1.0';
export const JATEK_NEV = 'PORTAL HUB TYCOON';

// ── IDŐ ───────────────────────────────────────────────────────────────────
// A szimuláció FIX lépésközzel jár. A renderelés ettől független: ha a gép
// lassú, kevesebb képet rajzol, de a tick-ek száma ugyanaz marad — különben
// a gazdaság sebessége a videokártyától függene.
export const TICK_HZ = 20;
export const TICK_MS = 1000 / TICK_HZ;
/** Egy játéknap hossza tickben (60 valós másodperc alapsebességen). */
export const NAP_TICK = TICK_HZ * 60;

// ── RÁCS ──────────────────────────────────────────────────────────────────
// 64×48 cella. Ennél nagyobbnál az útkeresés elosztott mezői már számítanak,
// kisebbnél viszont a „20+ portál, többszintes állomás" végcél nem fér el.
export const RACS_SZ = 64;
export const RACS_M = 48;
/** Egy cella élhossza világegységben — a render ezzel skáláz. */
export const CELLA_MERET = 1;

// ── SZINTEK ───────────────────────────────────────────────────────────────
// Az állomás három szintes lehet. MIÉRT PONT HÁROM: a második szint a
// játékmenet szempontjából az igazi ugrás (a függőleges közlekedés új szűk
// keresztmetszet), a harmadik már csak ismétlés — a negyedik viszont a
// távolságmezők memóriáját és a rajzolási időt is negyedeli-ötödöli feleslegesen.
// A játék ÚGY indul, hogy csak a földszint van kiépítve; aki nem épít felfelé,
// annak a világ pontosan ugyanaz marad, mint egy szinttel.
export const RACS_SZINT = 3;
/** Két szint közti magasság világegységben. */
export const SZINT_MAGASSAG = 7;
/** Az emeleti padló ennyivel drágább szintenként (tartószerkezet). */
export const EMELET_FELAR = 1.1;
/** Egy szintváltás ennyi lépésnyi „útnak" számít az útkeresésben. */
export const ATJARO_KOLTSEG = 4;

/** A kezdő csarnok (kiépített padló) mérete a rács közepén. */
export const KEZDO_CSARNOK_SZ = 22;
export const KEZDO_CSARNOK_M = 16;

// ── GAZDASÁG ──────────────────────────────────────────────────────────────
export const KEZDO_PENZ = 16000;
/** Padlócella lerakásának ára. A terjeszkedés soha ne legyen ingyen. */
export const PADLO_AR = 14;
/** Bontáskor az ár ekkora hányadát kapjuk vissza. */
export const BONTAS_TERITES = 0.45;
/** Egy mágikus kristály piaci ára — a portálok ezt égetik. */
export const KRISTALY_AR = 9;
/** Hány utas érkezésére fogy egy kristály. */
export const KRISTALY_UTASONKENT = 1 / 3;
/** Az energiahiány büntetése: ennyire lassulnak a szolgáltatások. */
export const ARAMSZUNET_HATEKONYSAG = 0.4;

// ── UTASOK ────────────────────────────────────────────────────────────────
/** Egyszerre ennyi utas lehet az állomáson. A tömbök ekkorára foglalódnak. */
export const MAX_UTAS = 1200;
/** Alap türelem tickben (kb. 2,5 perc valós idő). Fajonként szorzódik. */
export const ALAP_TURELEM = 3000;
/** Sorban állás közben ennyi hangulat vész el tickenként (ezred-egységben). */
export const SOR_HANGULAT_KOPAS = 1.1;
/**
 * Séta közben ennyi — de a faj SEBESSÉGÉVEL skálázva (lásd `utas.js`).
 *
 * Az első változat tick-alapon vonta le, és ezzel halálra ítélte a lassú
 * fajokat: mérve, a trollok MINDEGYIKE nulla hangulattal távozott, mert
 * ugyanaz az út nekik háromszor annyi tickig tartott. A kopás azóta
 * távolság-arányos, nem idő-arányos — sétálni ugyanannyiba kerül mindenkinek.
 */
export const SETA_HANGULAT_KOPAS = 0.18;
/** A sebesség-skálázás viszonyítási alapja (kb. az átlagos faj sebessége). */
export const ALAP_SEBESSEG = 0.055;

// ── HÍRNÉV ────────────────────────────────────────────────────────────────
// A hírnév a távozó utasok hangulatának lassan mozgó átlaga. Azért lassú,
// hogy egyetlen balul sült esemény ne törölje el egy óra munkáját, de a
// tartós elhanyagolás igenis meglátszódjon.
export const HIRNEV_KEZDO = 55;
export const HIRNEV_TEHETETLENSEG = 0.004;

// ── KOSZ ──────────────────────────────────────────────────────────────────
/** Ennyi koszt hagy maga után egy kiszolgálás (ezred-egységben). */
export const KOSZ_KISZOLGALASONKENT = 4;
/** Egy takarító kobold ennyi koszt tüntet el tickenként (ezred-egységben). */
export const KOSZ_TAKARITAS = 55;

// ── PORTÁLOK / DIMENZIÓK ──────────────────────────────────────────────────
/** Alap érkezési ütem: ennyi tickenként jön egy utas egy 1. szintű kapun. */
export const ERKEZES_ALAP_TICK = 45;
/** Az instabilitás ennyivel nő tickenként egy nyitott kapun (ezred). */
export const INSTABIL_NOVEKEDES = 8;
/** …és minden áthaladó utas ennyivel told rajta egyet (ezred). */
export const INSTABIL_UTASONKENT = 25;
/** Egy karbantartó műhely + mérnök ennyit farag le tickenként (ezred). */
export const INSTABIL_KARBANTARTAS = 40;
/** Ennél az instabilitásnál omlik össze a kapu (ezred → 1000 = 100 %). */
export const INSTABIL_HATAR = 1000;
/** Összeomlás után ennyi tickig áll a kapu. */
export const OSSZEOMLAS_SZUNET = 1600;

// ── NEHÉZSÉGI FOKOZATOK ───────────────────────────────────────────────────
//
// MIÉRT SZORZÓK ÉS NEM KÜLÖN SZABÁLYOK: mert a szabály-alapú nehézség
// („kemény módban nincs automata mentés") büntetésnek érződik, a szorzó
// viszont ugyanazt a játékot adja más feszességgel. Így a tanulás átvihető
// az egyik fokozatról a másikra — ami egy tycoonnál a lényeg.
//
// A `kod` STABIL AZONOSÍTÓ: a mentés ezt tárolja, és a betöltés ezzel
// állítja vissza a világot. Új fokozat a lista VÉGÉRE megy.
export const NEHEZSEGEK = [
  {
    kod: 'konnyu', nev: 'Könnyű', ikon: '🌤️',
    penz: 1.6, ber: 0.75, instabil: 0.6, erkezes: 1.15, esemeny: 0.6,
    leiras: 'Több kezdőtőke, olcsóbb bérek, lassabban romló kapuk. Az első állomáshoz.',
  },
  {
    kod: 'normal', nev: 'Normál', ikon: '⚖️',
    penz: 1, ber: 1, instabil: 1, erkezes: 1, esemeny: 1,
    leiras: 'A tervezett egyensúly. Így van kitalálva a történet íve.',
  },
  {
    kod: 'kemeny', nev: 'Kemény', ikon: '🔥',
    penz: 0.7, ber: 1.35, instabil: 1.5, erkezes: 0.9, esemeny: 1.5,
    leiras: 'Kevesebb pénz, drágább személyzet, gyorsan romló kapuk, sűrűbb események.',
  },
];

export function nehezsegIdx(kod) {
  for (let i = 0; i < NEHEZSEGEK.length; i++) if (NEHEZSEGEK[i].kod === kod) return i;
  return 1;
}

// ── BÉRBEADÁS ─────────────────────────────────────────────────────────────
/** Bérbe adott üzletnél a bevétel ekkora hányada marad nálunk. */
export const BERLET_RESZESEDES = 0.42;
/** …plusz napi fix bérleti díj az épület árának ekkora hányada. */
export const BERLET_NAPIDIJ = 0.006;

// ── SZIMULÁCIÓS SEBESSÉG (a render kéri, a sim nem tud róla) ──────────────
export const SEBESSEGEK = [0, 1, 2, 4];

// ── SZÍNVILÁG ─────────────────────────────────────────────────────────────
// Egy helyen, mert a HUD, a 3D és az ikonok ugyanazt a palettát használják.
// „Varázslatos, humoros, színes" — tehát telített, meleg alapok, és a
// dimenziónként eltérő, világító kiegészítő színek.
export const SZIN = {
  padlo: 0x3f5274,
  padloVilagos: 0x4d6389,
  ur: 0x0d1020,
  ho: 0xff7a3c,
  hideg: 0x6fd8ff,
  jo: 0x63d68a,
  gond: 0xffc247,
  baj: 0xff5d73,
};
