// PORTAL HUB TYCOON — KUTATÁS.
//
// ── MIÉRT ÍGY ─────────────────────────────────────────────────────────────
// A kutatás itt nem külön valuta: PÉNZBE és IDŐBE kerül. Külön kutatási pont
// bevezetése egy második gazdaságot jelentene, amit külön kell egyensúlyozni,
// és amitől a játékos két, egymással nem beváltható erőforrást tologat. Egy
// tycoonban a pénz-idő váltás önmagában elég feszültséget ad: aki kutat, az
// épp nem épít.
//
// Egyszerre EGY kutatás fut. Ez szándékos szűkösség — így a technológiafa
// sorrendje döntés, nem lista.
//
// A hatások NEM itt hatnak, csak deklarálva vannak: a `sim.js` kérdezi le a
// `sim.kesz(kod)`-dal. Így egy technológia hatása ott van, ahol számít, és
// nem kell átlátni az egész fát ahhoz, hogy egy képletet megérts.

export const TECHNOLOGIAK = [
  {
    kod: 'kapu_hangolas', nev: 'Kapuhangolás', ikon: '🎚️', ar: 1400, ido: 900,
    fuggo: [], hatas: '+25 % érkezési ütem minden kapun.',
    leiras: 'A rezonancia finomhangolása. Több utas ugyanazon a kapun.',
  },
  {
    kod: 'kristaly_takarek', nev: 'Kristálytakarékos fókusz', ikon: '💎', ar: 1600, ido: 1000,
    fuggo: ['kapu_hangolas'], hatas: '−40 % kristályfogyasztás.',
    leiras: 'A kristályok legnagyobb része eddig egyszerűen elpárolgott.',
  },
  {
    kod: 'stabil_kapuk', nev: 'Stabilizáló gyűrű', ikon: '⚙️', ar: 2200, ido: 1300,
    fuggo: ['kapu_hangolas'], hatas: '−35 % instabilitás-növekedés.',
    leiras: 'Nem javítja a kaput, csak lassítja a romlását. Épp ezért nélkülözhetetlen.',
  },
  {
    kod: 'gyors_sorok', nev: 'Rendezett sorok', ikon: '🚦', ar: 1200, ido: 800,
    fuggo: [], hatas: '−20 % kiszolgálási idő mindenhol.',
    leiras: 'Kordonok, jelzések, és egy meglepően hatékony hangosbemondó.',
  },
  {
    kod: 'auto_poggyasz', nev: 'Automata poggyászkezelés', ikon: '🤖', ar: 2400, ido: 1400,
    fuggo: ['gyors_sorok'], hatas: 'A poggyászkezelő fele annyi emberrel is teljes sebességgel megy.',
    leiras: 'Lebegő szalagok. A mimikek imádják, mert végre senki nem nézi meg a ládákat.',
  },
  {
    kod: 'takaritorobot', nev: 'Varázslatos takarítórobot', ikon: '🧽', ar: 1800, ido: 1000,
    fuggo: ['gyors_sorok'], hatas: '+90 % takarítási teljesítmény.',
    leiras: 'Söprögető seprűk. Elvileg engedelmesek.',
  },
  {
    kod: 'fejlett_boltok', nev: 'Fejlettebb boltok', ikon: '🏷️', ar: 2000, ido: 1100,
    fuggo: [], hatas: '+30 % bevétel boltból, könyvesboltból, étteremből.',
    leiras: 'Jobb kirakat, jobb árrés, ugyanaz a vendég.',
  },
  {
    kod: 'vip_ellatas', nev: 'VIP-ellátás', ikon: '👑', ar: 3000, ido: 1500,
    fuggo: ['fejlett_boltok'], hatas: 'Feloldja a VIP Lounge-ot.',
    leiras: 'Külön váró a legendás vendégeknek. Ők amúgy sem állnak sorba.',
  },
  {
    kod: 'energia_halo', nev: 'Energiaháló', ikon: '⚡', ar: 2600, ido: 1200,
    fuggo: [], hatas: '+60 % energiamag-termelés.',
    leiras: 'A magokat összekötve kevesebb megy veszendőbe.',
  },
  {
    kod: 'teleport_lift', nev: 'Teleport liftek', ikon: '🛗', ar: 3400, ido: 1600,
    fuggo: ['energia_halo'], hatas: 'Feloldja a teleport liftet.',
    leiras: 'Rövidre zárja a csarnokot. Nagy állomáson ez a türelem mentőöve.',
  },
  {
    kod: 'gyogyaszat', nev: 'Dimenzióközi gyógyászat', ikon: '⚕️', ar: 2200, ido: 1200,
    fuggo: [], hatas: 'Feloldja a gyengélkedőt, és tompítja a baleseteket.',
    leiras: 'Kilenc anatómia, egy váróterem.',
  },
  {
    kod: 'kapu_szkenner', nev: 'Mélyszkennelés', ikon: '📡', ar: 3600, ido: 1800,
    fuggo: ['stabil_kapuk'], hatas: 'Felfedez egy még ismeretlen dimenziót.',
    leiras: 'A kapuk zaja mögött másik kapuk zaja hallatszik.',
  },
  {
    kod: 'ido_kotes', nev: 'Időkötés', ikon: '⏳', ar: 4200, ido: 2000,
    fuggo: ['kapu_szkenner'], hatas: '−45 % eseménykár, és az idővihar csak feleannyi ideig tart.',
    leiras: 'Nem állítja meg az időt. Csak megkéri, hogy várjon.',
  },
  {
    // ⚠️ AZ ÁR 6 500 VOLT, ÉS EZ NEM DÖNTÉS VOLT, HANEM KÖTELEZŐ LÉPÉS. A
    // technológia-abláció szerint EGYEDÜL ez a kutatás +620 708 tallért ért; a
    // második helyezett (`kristaly_takarek`) +74 244-et — nyolcszoros
    // különbség. Ami minden mást elhomályosít, az kiveszi a fát a
    // technológiafából. 12 000-nél a lépcsőkkel együtt ~28 400 a teljes út,
    // tehát komoly befektetés marad, de nem ingyen nyert játszma.
    kod: 'legendas_kapu', nev: 'Legendás kapunyitás', ikon: '🐉', ar: 12000, ido: 2600,
    fuggo: ['ido_kotes', 'vip_ellatas'], hatas: 'Felfedezi a Sárkánytrónust.',
    leiras: 'Amit eddig háttérzajnak hittünk, az egy cím volt.',
  },
];

export const TECH_INDEX = (() => {
  const m = new Map();
  for (let i = 0; i < TECHNOLOGIAK.length; i++) m.set(TECHNOLOGIAK[i].kod, i);
  return m;
})();

export function tech(kod) {
  const i = TECH_INDEX.get(kod);
  return i === undefined ? null : TECHNOLOGIAK[i];
}
