// AGE OF THE CRYSTALS — ÉPÜLET-SZILUETTEK (v0.16 · a vázlat-korszak vége).
//
// Ez a fájl NEM réteg: nincs `frissit()`-je és nem olvas simet. Egyetlen dolgot
// ad a `gazdasag3d.js`-nek — TÍPUSONKÉNT EGY kész `BufferGeometry`-t —, és
// vállalja, hogy a tábla teljes. Az építőelemek (kőfal, sátortető, gerendaváz,
// pártázat, hordó, zászló) a `epulet_reszek.js`-ben laknak; itt csak az van,
// hogy melyik épület MIBŐL áll össze.
//
// ── HOL TARTOTTUNK, ÉS MIÉRT NEM VOLT ELÉG ────────────────────────────────
// A v0.3-ban minden épület doboz volt. A v0.10 adott mind a tizenegynek egy
// SZILUETTET — az már megmondta, melyik a laktanya és melyik az istálló, de
// doboz+kúp szinten állt meg: nagy, tagolatlan lapok, nulla anyag-érzet. A
// tulajdonos ezt látva NÉV SZERINT a központ látványát kérte.
//
// A mérce a TELEPESEK v1.3.1 épületei: kőfalú vártorony cseréptetővel, tornácos
// faházak, csíkos piaci ponyva, kémények, kapuk, zászlók. A v0.16 ezt hozza be,
// és három dolgon múlik:
//
//   1. ANYAG-NYELV. Minden kőfal lábazatot, minden tető ereszdeszkát és
//      gerincgerendát kap. Árnyék nélküli világításban ez a tagolás az EGYETLEN,
//      ami egy nagy lapot nem hagy üres foltnak.
//   2. FELISMERHETŐSÉG FELÜLNÉZETBŐL. Az RTS-kamera meredek (34–58°), tehát a
//      játékos a TETŐT és az udvart látja, nem a homlokzatot. Ezért minden típus
//      TETŐFORMÁJA és UDVARI KELLÉKE más — nem a homlokzat-díszek.
//   3. A KÖZPONT KIEMELKEDIK. Ez az egyetlen épület, amit a játékos a meccs
//      minden percében néz. Kap tehát mindent, amit a többi nem: kövezett
//      udvart, boltíves kaput lépcsővel, kiugró gerendavázas emeletet,
//      törésvonalas cseréptetőt tetőablakkal, saroktornyot, füstölő kéményt és
//      a pálya legmagasabb zászlaját.
//
// ── A RÖVID TÁBLA CSAPDÁJA — ITT NEM LEHET ELBÚJNI ────────────────────────
// A projekt legdrágább hibafajtája az `EPULET`-tel indexelt tábla, ami rövidebb
// az enumnál: a `tabla[10]` `undefined`-ot ad, abból `NaN` lesz, a `NaN` minden
// összehasonlításban hamis — és a rendszer CSENDBEN rossz lesz, bitre
// reprodukálhatóan (lásd a v0.9/2 `LATOTAV`-ját). A rajzolónál ez úgy néz ki,
// hogy egy típus némán a régi dobozánál marad.
//
// Ezért a formák NEM tömbben, hanem az `EPULET` KULCSAIVAL nevesített
// objektumban vannak, és a tömböt a modul betöltésekor az enumból építjük fel.
// Egy kimaradt típus ilyenkor nem `undefined`, hanem DOBOTT HIBA az indulásnál.
// Ugyanígy hibás egy olyan kulcs, ami nincs az enumban (elgépelt, átnevezett).
//
// ── AMI SZERZŐDÉS, ÉS AMIT NEM SZABAD MEGSÉRTENI ──────────────────────────
//   • `EP_MERET` — a sim ebből számol járhatóságot. A sziluett vízszintes
//     kiterjedése ezért SEHOL nem lóghat túl az alapterületén; a
//     `formaOsszefoglalo()` ezt meg is méri, hogy ne ígéret maradjon (az eresz
//     és a lobogó is beleszámít).
//   • `EP_MAGASSAG` — a torony azért kap 2,4-es szorzót, hogy LÁTSZÓDJON, miért
//     építették. A formák a `m · 0,8 · EP_MAGASSAG` keretbe épülnek; ami ezen
//     túlér, az kizárólag ZÁSZLÓ vagy ZÁSZLÓRÚD. A központé a legmagasabb dísz
//     (3,1 fölé nyúló zászlórúd) — a torony TESTE viszont így is fölé nő (3,8),
//     tehát a magasság-sorrend megmarad.
//
// ── SZÍNEZÉS: MIÉRT NEM `instanceColor` ───────────────────────────────────
// A csapatszín a doboz-korszakban az EGÉSZ épületet festette. Egy tetőt, kőfalat
// és gerendavázat viszont nem lehet egyetlen példány-színnel kifesteni — ha
// mindent a csapatszínnel szorzunk, a barna tető kékesbarna sár lesz.
//
// Ezért két CSÚCS-attribútum van (`alapSzin`, `csapatArany`) és egy PÉLDÁNY-
// attribútum (`csapatAdat`: rgb = csapatszín, a = fényerő), a keverés pedig
// LINEÁRIS INTERPOLÁCIÓ, nem szorzás:
//
//     szin = mix(alapSzin, csapatSzin, csapatArany) · fenyero
//
//   csapatArany = 0     — kő, gerenda, cserép, szalma: a saját anyaga marad
//   csapatArany ≈ 0,3   — TOMPA tetők (zsindely, nád): felismerhetően a csapat
//                         felé hajlanak, de tető-anyagúak maradnak
//   csapatArany = 1     — zászló, ponyva, kapuszárny, pajzs: TISZTA csapatszín
//
// ⚠️ A telített cserépvörös 0,45-ös keverése a KÉK csapatszínnel LILÁT ad — se
// nem tető, se nem csapatszín. Ez MÉRT eredmény (a v0.10 első változatában a
// központ teteje pont így lett lila). Ezért a cserép keverése 0,1, és a
// csapat-olvashatóságot NAGY, TISZTA csapatszínű felületek viszik: zászló,
// kapuszárny, faliszőnyeg, pajzssor, ponyvacsík.
//
// A `fenyero` az építkezés visszajelzése (az épülő ház fakóbb) — ugyanaz a
// jelzés, ami a doboz-korszakban is volt, csak most nem nyeli el a formát.
//
// ── v0.16/2: AMI EDDIG LÁTHATATLAN VOLT ───────────────────────────────────
// Két sim-állapot nem jutott el a képre, és mindkettő JÁTÉK-információ, nem
// dísz:
//
//   `epuletek.nyitva`   a kapu szárnyai MINDIG csukva álltak. A játékos nem
//                       látta, merre van szabad út a saját falán — miközben a
//                       sim szerint a cella járható. Ez a rosszabbik fajta
//                       hiba: a kép AKTÍVAN mást állít, mint a világ.
//   `epuletek.hp`       az épület vagy állt, vagy eltűnt. Egy 10 %-on álló
//                       központ ugyanúgy nézett ki, mint egy érintetlen —
//                       tehát a védőnek semmi nem szólt, hogy baj van.
//
// Mindkettő ugyanazzal az egy mechanizmussal oldódik meg: a darabok
// ÁLLAPOT-ABLAKOT hoznak magukkal (`epulet_reszek.js` → `SERULES`, `KAPUALL`),
// a példány pedig egy `epAllapot` attribútumban mondja meg, hol tart. Ami nem
// illik az állapotba, azt a vertex shader egyetlen pontba húzza — tehát nincs
// se új háló, se új rajzhívás, se futásidejű geometria-építés.
//
// ⚠️ A sérülés HÁROM fokozat, nem folytonos átmenet, és a fokozatok RÁRAKÓDNAK
// egymásra (a sérült repedése a súlyoson is ott van). Ha fokozatonként
// cserélődne a jelkészlet, a romlás villanásnak látszana, nem halmozódásnak —
// és pont a halmozódásból olvasható ki, merre tart az épület.
//
// ⚠️ A ROM nincs itt, és nem is lehet: a `sim/epuletek.js` `sebez()`-e a
// pusztuláskor FELSZABADÍTJA a cellákat, tehát az épület megszűnik létezni. A
// leomlás látványa ezért az `effekt_esemeny.js`-é (süllyedő rom + por + nyom);
// ide a MÉG ÁLLÓ épület fokozatai tartoznak.

import { THREE } from './core3d.js';
import { EPULET, EP_MERET, EP_MAGASSAG } from '../sim/epuletek.js';
import { Forma, SZIN, TETO_CS, SERULES, KAPUALL, osszefuz } from './epulet_reszek.js';

/**
 * A kapuszárny PÁNTJA — a nyílás pereme. A csukott és a nyitott változat
 * ugyanerről a pontról indul, tehát a kettő között a szárny fordul, nem ugrik.
 */
const KAPU_PANT = 0.193;
/**
 * Mennyire fordul ki a szárny. 79° (nem 90°): a derékszögben kifordult szárny
 * a meredek RTS-kamerából ÉLÉRŐL látszik, tehát eltűnik — pont az veszne el,
 * amit meg akarunk mutatni. Ennyinél még van látható lapja, de a nyílás már
 * szabad.
 */
const KAPU_NYITAS = Math.PI * 0.44;

// ── A TIZENEGY SZILUETT ────────────────────────────────────────────────────
// Az `EPULET` kulcsaival nevesítve. Minden építő egy üres `Forma`-t kap, amiben
// már benne van az alapterület (`e.m`), a fél-szélesség (`e.f`), az eresz-határ
// (`e.eresz`) és a magasság-keret (`e.H`). A számok EZEKBŐL származnak, nem
// fixek — így egy `EP_MERET` vagy `EP_MAGASSAG` változás magától átméretezi a
// formát.

const FORMAK = {
  /**
   * KÖZPONT — a pálya büszkesége. Négy szint épül egymásra: kövezett udvar,
   * boltíves kapuval nyíló kőföldszint, KIUGRÓ gerendavázas emelet, és fölötte
   * a törésvonalas cseréptető tetőablakokkal. Mellette saroktorony és füstölő
   * kémény, a gerincen a pálya legmagasabb zászlaja.
   *
   * A kiugró emelet (jetty) nem cifraság: ez adja a vízszintes ÁRNYÉKVONALAT a
   * homlokzat közepén, ami nélkül a 2,4 magas tömeg egyetlen sima fal marad.
   */
  KOZPONT(e) {
    const E = e.eresz;                      // 1,5 — az eresz-határ
    const bz = -0.28;                       // a magház középvonala z-ben
    const homlok = bz + 0.89;               // a homlokzat síkja (+z)

    // A magház SZÁNDÉKOSAN kisebb az alapterületnél (2,06 × 1,78 a 3 × 3-ban).
    // Egy 3 cellás alapra ültetett, keretig érő tömeg 2,4 magasan zömöknek
    // látszik; a keskenyebb ház ugyanabban a keretben magasabbnak — a felszabaduló
    // peremre pedig udvar, lépcső, saroktorony és rakomány kerül, ami többet
    // mond az épületről, mint még egy méter fal.
    e.doboz(2 * E - 0.1, 0.13, 2 * E - 0.1, 0, 0, 0, SZIN.KAVICS);
    e.kofal(2.06, 0.98, 1.78, 0, 0.13, bz, { labazat: 0.17, parkany: 0.09 });
    e.lepcso(1.0, 0, 0, homlok + 0.01, 2, 0.065, 0.13);
    e.kapuzat(0, 0.13, homlok, 0.56, 0.76);
    for (const ux of [-1, 1]) e.ablak(ux * 0.7, 0.54, homlok, 0.3, 0.38);
    // Tornác: két oszlop és egy lejtő eresz a bejárat fölé. Ez adja a
    // homlokzat egyetlen VETETT árnyékát — árnyéktérkép nélkül ez az egyetlen
    // eszközünk arra, hogy a bejárat MÉLYEDÉSNEK látsszon, ne festett foltnak.
    for (const ux of [-1, 1]) e.doboz(0.1, 0.86, 0.1, ux * 0.44, 0.13, homlok + 0.34, SZIN.FA);
    e.dontDoboz(1.06, 0.07, 0.5, 0, 1.02, homlok + 0.2, -0.34, 'x', SZIN.CSEREP, 0.1);

    // KIUGRÓ EMELET: 0,08-cal túlnyúlik a földszinten, konzolokra támaszkodva.
    e.gerendafal(2.22, 0.66, 1.94, 0, 1.11, bz, { oszlop: 3 });
    for (const ux of [-1, 1]) {
      for (const uz of [-1, 1]) {
        e.dontDoboz(0.26, 0.1, 0.1, ux * 0.99, 1.12, bz + uz * 0.86, ux * 0.7, 'z', SZIN.FA_SOTET);
      }
    }
    for (const ux of [-1, 1]) e.ablak(ux * 0.68, 1.3, bz + 0.98, 0.3, 0.34, 1, SZIN.FA_SOTET);
    // Faliszőnyeg a kapu fölött: a legnagyobb egybefüggő csapatszín-folt a
    // homlokzaton, pont ott, ahol a szem a bejáratot keresi.
    e.doboz(0.5, 0.56, 0.05, 0, 1.16, bz + 0.99, SZIN.CSAPAT, 1);
    e.doboz(0.58, 0.06, 0.09, 0, 1.72, bz + 0.99, SZIN.FA_SOTET);

    e.satorteto(1.26, 1.12, 0.5, 0.5, 0, 1.77, bz, SZIN.CSEREP, 0.1,
      { flare: 0.13, gerinc: SZIN.CSEREP_SOTET });
    // A tetőablakok a SÚLYOS fokozaton eltűnnek, és a helyükre szakadás kerül.
    // Ez a „hiányzó tetőelem": nem elég sötét foltot rakni a tetőre, LÁTSZANIA
    // kell, hogy valami, ami eddig ott volt, már nincs ott.
    e.allapot(SERULES.NEM_SULYOS);
    for (const ux of [-1, 1]) e.tetoablak(ux * 0.5, 1.9, 0.5, 0.32, 0.22);
    e.allapot();

    // SAROKTORONY az ELÜLSŐ sarkon. A v0.16 első változatában a hátsó sarokban
    // állt — és ott TELJES EGÉSZÉBEN a magház tömegébe temetődött: a kúpja
    // úgy bújt ki a tetőn, mintha modellhiba volna. A saroktorony csak akkor
    // saroktorony, ha a tömegen KÍVÜLRE lép.
    e.henger(0.34, 0.3, 1.8, 8, -1.06, 0.13, 0.5, SZIN.KO, 0, false);
    e.henger(0.38, 0.38, 0.09, 8, -1.06, 1.93, 0.5, SZIN.KO_VILAG);
    e.gula(0.42, 0.34, 8, -1.06, 2.02, 0.5, SZIN.ZSINDELY, TETO_CS);
    e.lores(-1.06, 1.2, 0.84, 0.3);
    e.lores(-1.06, 0.6, 0.84, 0.28);

    e.kemeny(0.78, 1.9, -0.86, 0.24, 0.46, 4, 0.31);
    // A pálya legnagyobb lobogója. Nem dísz: kizoomolva a központ helye és a
    // csapata EBBŐL olvasható le először.
    e.zaszlo(0, 2.32, bz, 0.8, 0.42, 0.62, 3);

    e.hordo(1.22, 0.13, 0.66);
    e.hordo(1.22, 0.13, 0.28, 0.14, 0.3);
    e.lada(1.2, 0.13, 1.06, 0.32);
    e.lada(-1.2, 0.13, -0.62, 0.3);
    e.kazal(-1.16, 0.13, -1.1, 0.26, 0.38);
    e.serulesJelek({
      homlok, falFel: 0.98, falY: 0.2, falMag: 0.84, talpY: 0.13, omladekZ: 0.9,
      tetoX: -0.44, tetoY: 2.02, tetoZ: bz + 0.34, tetoFel: 0.3, tetoMely: 0.26,
    });
    return e;
  },

  /**
   * RAKTÁR — deszkacsarnok RAKODÓ-EMELVÉNNYEL és csigás emelőgerendával. A
   * kiálló gerenda a horoggal az, ami felülnézetből azonnal elárulja, hogy ide
   * rakodnak — semelyik másik épületen nincs ilyen.
   */
  RAKTAR(e) {
    const E = e.eresz;                      // 1,0
    const bz = -0.28;
    const homlok = bz + 0.67;

    e.doboz(2 * E - 0.08, 0.12, 2 * E - 0.08, 0, 0, 0, SZIN.DESZKA);
    e.doboz(1.62, 0.78, 1.34, 0, 0.12, bz, SZIN.DESZKA);
    for (const ux of [-1, 1]) {
      for (const uz of [-1, 1]) {
        e.doboz(0.15, 0.86, 0.15, ux * 0.78, 0.12, bz + uz * 0.62, SZIN.FA);
      }
    }
    e.kapuzat(0, 0.12, homlok, 0.5, 0.6);
    e.nyeregteto(0.86, 0.5, 1.44, 0, 0.9, -0.24, SZIN.ZSINDELY, TETO_CS, 0);
    // Emelőgerenda + kötél + horog az oromfal csúcsán. Ez a raktár JELE: a
    // kiálló gerenda felülnézetből is elárulja, hogy ide rakodnak.
    e.doboz(0.11, 0.11, 0.5, 0, 1.16, 0.7, SZIN.FA);
    e.doboz(0.04, 0.28, 0.04, 0, 0.88, 0.92, SZIN.FA_SOTET);
    e.doboz(0.13, 0.09, 0.13, 0, 0.81, 0.92, SZIN.VAS);
    e.doboz(0.34, 0.28, 0.05, 0, 0.9, 0.47, SZIN.NYILAS);

    e.lada(0.62, 0.12, 0.72, 0.3);
    e.lada(0.62, 0.375, 0.72, 0.24);
    e.lada(-0.66, 0.12, 0.7, 0.3);
    e.hordo(-0.16, 0.12, 0.78, 0.15, 0.32);
    e.zaszlo(-0.82, 0.98, -0.86, 0.44, 0.24, 0.32, 2, 0.4);
    e.serulesJelek({
      homlok, falFel: 0.78, falY: 0.18, falMag: 0.62, talpY: 0.12, omladekZ: 0.6,
      tetoX: 0.24, tetoY: 1.2, tetoZ: -0.1, tetoFel: 0.19, tetoMely: 0.24,
    });
    return e;
  },

  /**
   * FAL — rézsűs kőtömb pártázattal és fa gyilokjáróval. Sorba rakva a
   * szaggatott oromfogsor összefüggő várfallá áll össze, és pont ez a lényeg:
   * a falat SOSEM egyedül nézzük.
   */
  FAL(e) {
    const E = e.eresz;
    e.doboz(2 * E, 0.07, 2 * E, 0, 0, 0, SZIN.KO_SOTET);
    e.hasab([-E + 0.01, 0, E - 0.01, 0, E - 0.09, 0.27, -E + 0.09, 0.27], 2 * E - 0.02,
      0, 0.07, 0, SZIN.KO);
    // A csapat-öv a járószint ALATT fut, tehát csak egy VÉKONY SZEGÉLYVONAL
    // látszik belőle körben. Az első változatban a teli csapatszín-lap volt a
    // legfelső felület: felülnézetből egy nagy kék négyzet lett a kőfalból,
    // amire a pártázat egy „+" jelet rajzolt. A falat a KŐ-nek kell uralnia.
    e.doboz(2 * E - 0.04, 0.04, 2 * E - 0.04, 0, 0.34, 0, SZIN.CSAPAT, 1);
    e.doboz(2 * E - 0.18, 0.05, 2 * E - 0.18, 0, 0.38, 0, SZIN.DESZKA);
    e.oromzat(E - 0.03, 0.43, 0.13, 3);
    // A fal sérülése a GYILOKJÁRÓRA kerül, nem a homlokzatára — és ez nem
    // ízlés kérdése: a fal a celláját HÉZAG NÉLKÜL kitölti (±0,49), tehát a
    // falsík elé nem fér ki egy 5 cm-es repedés az `EP_MERET`-szerződés
    // megsértése nélkül. Fölfelé viszont van hely, és a meredek RTS-kamera
    // úgyis a járószintet látja a falból, nem az oldalát.
    e.allapot(SERULES.SERULT);
    e.doboz(0.5, 0.03, 0.44, -0.08, 0.43, 0.06, SZIN.KOROM);
    e.omladek(0.24, 0.43, -0.1, 0.08);
    e.allapot(SERULES.SULYOS);
    e.doboz(0.62, 0.035, 0.56, 0.1, 0.43, -0.02, SZIN.KOROM);
    e.omladek(-0.2, 0.43, 0.14, 0.1);
    e.allapot();
    return e;
  },

  /**
   * KAPU — két pártázatos pillér és a CSAPATSZÍNŰ kapuszárnyak. A NYÍLÁS a jel,
   * nem a tömeg — és a pillérek koronája SZÁNDÉKOSAN magasabb a szomszédos fal
   * pártázatánál (0,60 vs 0,56): egy kapu, ami nem emelkedik ki a falból, a
   * falsorban észrevehetetlen.
   *
   * ── A NYITOTT ÁLLÁS (v0.16/2) ────────────────────────────────────────────
   * A `sim.epuletek.nyitva` a v0.4 óta él, a rajzon viszont semmi nem mutatta:
   * a szárnyak MINDIG csukva álltak, tehát a játékos a saját kapuját nem tudta
   * megkülönböztetni egy fal-szakasztól, és nem látta, merre van szabad út.
   *
   * A különbség HÁROM jelen múlik, mert egy önmagában kevés a meredek kameránál:
   *   1. a két szárny kifordul a pántja körül (`kapuszarny`),
   *   2. a záró vasrúd eltűnik — csukott kapun van mit zárni, nyitotton nincs,
   *   3. a nyílásban megjelenik a sötét KÜSZÖB. Ez a legfontosabb: felülnézetből
   *      a kifordult szárny keskeny csík, a küszöb viszont egy összefüggő sötét
   *      sáv a falsorban — messziről EZ mondja meg, hogy itt át lehet menni.
   */
  KAPU(e) {
    const E = e.eresz;
    const px = E - 0.18;
    for (const ux of [-1, 1]) {
      e.kofal(0.24, 0.48, 2 * E - 0.16, ux * px, 0, 0, { sarok: false, labazat: 0.1 });
      for (const uz of [-1, 1]) {
        e.doboz(0.24, 0.12, 0.22, ux * px, 0.48, uz * 0.27, SZIN.KO_VILAG);
      }
    }
    e.doboz(2 * E - 0.06, 0.13, 0.5, 0, 0.44, 0, SZIN.FA);
    e.doboz(2 * E - 0.2, 0.05, 0.42, 0, 0.57, 0, SZIN.FA_SOTET);

    e.allapot(SERULES.MINDIG, KAPUALL.NYITVA);
    e.doboz(2 * KAPU_PANT, 0.05, 0.44, 0, 0.02, 0.06, SZIN.NYILAS);
    for (const ux of [-1, 1]) {
      e.kapuszarny(ux * KAPU_PANT, 0.02, 0.13, 0.19, 0.42, 0.07, ux, ux * KAPU_NYITAS);
    }
    e.allapot(SERULES.MINDIG, KAPUALL.CSUKVA);
    for (const ux of [-1, 1]) {
      e.kapuszarny(ux * KAPU_PANT, 0.02, 0.13, 0.19, 0.42, 0.07, ux, 0);
    }
    e.doboz(0.05, 0.42, 0.05, 0, 0.02, 0.17, SZIN.VAS);
    e.allapot();

    e.doboz(0.28, 0.14, 0.05, 0, 0.44, 0.26, SZIN.CSAPAT, 1);
    // A sérülés a PILLÉREKRE megy: a nyílásban nincs mit megrepeszteni.
    e.allapot(SERULES.SERULT);
    for (const ux of [-1, 1]) e.repedes(ux * px, 0.13, 0.42, 0.24);
    e.allapot(SERULES.SULYOS);
    e.korom(-px, 0.26, 0.42, 0.2, 0.18);
    // A LÁBAZATRA, nem a földre: a pillér lábazata 0,1 magasan kiül, tehát a
    // talajra tett omladék belelógna és eltűnne benne.
    e.omladek(px, 0.1, 0.34, 0.09);
    e.allapot();
    return e;
  },

  /**
   * HÁZ — kőlábazat, gerendavázas fal, meredek NÁDTETŐ és FÜSTÖLŐ KÉMÉNY.
   * A füst a ház jele: ez az egyetlen épület, amiből lakik valaki.
   */
  HAZ(e) {
    const E = e.eresz;
    const bz = -0.1, homlok = bz + 0.67;
    e.doboz(2 * E - 0.14, 0.12, 2 * E - 0.14, 0, 0, 0, SZIN.KAVICS);
    e.kofal(1.5, 0.34, 1.34, 0, 0.12, bz, { sarok: false, labazat: 0.1 });
    e.gerendafal(1.54, 0.56, 1.36, 0, 0.46, bz, { oszlop: 2 });
    e.doboz(0.32, 0.5, 0.06, -0.34, 0.12, homlok, SZIN.NYILAS);
    e.doboz(0.27, 0.45, 0.05, -0.34, 0.14, homlok + 0.03, SZIN.CSAPAT, 1);
    e.ablak(0.36, 0.62, homlok, 0.3, 0.26, 1, SZIN.FA_SOTET);
    e.nyeregteto(0.94, 0.5, 1.6, 0, 1.02, bz, SZIN.NAD, TETO_CS, 0, SZIN.FA_SOTET);
    e.kemeny(-0.55, 1.02, -0.42, 0.2, 0.42, 3);
    // Farakás és kerítés: az udvar teszi lakottá, nem a homlokzat.
    e.doboz(0.44, 0.2, 0.24, 0.54, 0.12, 0.76, SZIN.FA);
    e.doboz(0.4, 0.16, 0.2, 0.54, 0.32, 0.76, SZIN.FA_SOTET);
    e.kerites(-0.4, 0.12, 0.86, 0.7, 1, 0.4);
    e.zaszlo(0.6, 1.24, bz + 0.3, 0.34, 0.2, 0.28, 2, 0.7);
    e.serulesJelek({
      homlok, falFel: 0.72, falY: 0.16, falMag: 0.72, talpY: 0.12, omladekZ: 0.7,
      tetoX: 0.3, tetoY: 1.26, tetoZ: bz + 0.2, tetoFel: 0.18, tetoMely: 0.22,
    });
    return e;
  },

  /**
   * LAKTANYA — kőcsarnok PAJZSSORRAL a homlokzatán, előtte GYAKORLÓUDVAR
   * bábuval és lándzsaállvánnyal. A pajzssor a legolcsóbb és legerősebb
   * csapat-jelölő a roszterben: hat tiszta csapatszínű korong egy sorban.
   */
  LAKTANYA(e) {
    const E = e.eresz;
    const cz = -0.62, homlok = cz + 0.7;
    e.doboz(2 * E - 0.1, 0.12, 2 * E - 0.1, 0, 0, 0, SZIN.FOLD);
    e.kofal(2.5, 0.9, 1.4, 0, 0.12, cz, { parkany: 0.08 });
    e.gerendafal(2.56, 0.5, 1.44, 0, 1.02, cz, { oszlop: 4, oldalak: [1] });
    e.nyeregteto(0.84, 0.52, 2.6, 0, 1.52, cz, SZIN.ZSINDELY, TETO_CS, Math.PI / 2);
    e.kapuzat(0, 0.12, homlok, 0.66, 0.72);
    for (let i = 0; i < 3; i++) {
      for (const ux of [-1, 1]) e.pajzs(ux * (0.52 + i * 0.36), 1.22, homlok + 0.06, 0.15);
    }
    // Gyakorlóbábu: felülnézetből egy „T" az udvaron — csak a laktanyán van.
    e.doboz(0.16, 0.8, 0.16, 0.66, 0.12, 0.96, SZIN.FA);
    e.doboz(0.8, 0.13, 0.13, 0.66, 0.8, 0.96, SZIN.FA);
    e.kazal(0.66, 0.9, 0.96, 0.16, 0.26);
    e.pajzs(0.66, 0.6, 1.04, 0.17);
    // Lándzsaállvány.
    e.doboz(0.72, 0.1, 0.14, -0.66, 0.62, 1.0, SZIN.FA);
    for (const dx of [-0.24, 0, 0.24]) {
      e.doboz(0.05, 1.02, 0.05, -0.66 + dx, 0.12, 1.0, SZIN.VAS);
      e.gula(0.06, 0.14, 4, -0.66 + dx, 1.14, 1.0, SZIN.VAS);
    }
    e.hordo(1.24, 0.12, 0.3, 0.15, 0.32);
    e.zaszlo(-1.24, 1.6, cz - 0.5, 0.68, 0.34, 0.5, 3);
    e.serulesJelek({
      homlok, falFel: 1.2, falY: 0.2, falMag: 0.78, talpY: 0.12, omladekZ: 0.5,
      tetoX: -0.7, tetoY: 1.78, tetoZ: cz + 0.32, tetoFel: 0.24, tetoMely: 0.26,
    });
    return e;
  },

  /**
   * ÍJÁSZDA — féltetős LŐÁLLÁS és vele szemben HÁROM szalma céltábla, csapatszínű
   * középpel. A ferde féltető és a célsor együtt semmi máshoz nem hasonlít.
   */
  IJASZDA(e) {
    const E = e.eresz;
    const cz = -0.8;
    e.doboz(2 * E - 0.1, 0.12, 2 * E - 0.1, 0, 0, 0, SZIN.FOLD);
    e.doboz(2 * E - 0.34, 0.06, 1.5, 0, 0.12, cz + 0.1, SZIN.KAVICS);
    // Hátfal deszkából, elöl nyitott állás négy oszlopon.
    e.doboz(2 * E - 0.3, 1.15, 0.16, 0, 0.12, cz - 0.6, SZIN.DESZKA);
    for (const ux of [-1, 1]) {
      for (const uz of [-1, 1]) {
        e.doboz(0.15, 1.3, 0.15, ux * (E - 0.2), 0.12, cz + uz * 0.6, SZIN.FA);
      }
    }
    e.doboz(2 * E - 0.16, 0.09, 1.34, 0, 1.42, cz, SZIN.FA_SOTET);
    e.dontDoboz(2 * E - 0.2, 0.1, 1.38, 0, 1.55, cz + 0.02, 0.3, 'x', SZIN.NAD, TETO_CS);
    // Íjállvány a fedett állásban.
    e.doboz(1.9, 0.09, 0.14, 0, 0.72, cz + 0.42, SZIN.FA);
    for (const dx of [-0.7, -0.24, 0.24, 0.7]) {
      e.dontDoboz(0.06, 0.72, 0.06, dx, 0.5, cz + 0.44, 0.12, 'z', SZIN.FA_SOTET);
    }
    // Céltáblák: szalmakéve, csapatszínű középpel.
    for (const dx of [-0.9, 0, 0.9]) {
      e.kazal(dx, 0.12, 0.94, 0.32, 0.5);
      e.doboz(0.34, 0.34, 0.08, dx, 0.28, 1.02, SZIN.CSAPAT, 1);
      e.doboz(0.12, 0.12, 0.06, dx, 0.39, 1.08, SZIN.VASZON);
    }
    e.hordo(1.26, 0.12, 0.1, 0.16, 0.34);
    for (const dx of [-0.05, 0.05]) {
      e.dontDoboz(0.03, 0.44, 0.03, 1.26 + dx, 0.6, 0.1, dx * 4, 'z', SZIN.VASZON);
    }
    e.zaszlo(-1.24, 1.34, cz - 0.5, 0.6, 0.3, 0.44, 3, 0.2);
    // Az íjászda „homlokzata" a HÁTFAL, mert az az egyetlen zárt lapja.
    e.serulesJelek({
      homlok: cz - 0.52, falFel: 1.16, falY: 0.24, falMag: 0.8, talpY: 0.12,
      omladekZ: cz - 0.3, tetoX: 0.5, tetoY: 1.56, tetoZ: cz + 0.1,
      tetoFel: 0.22, tetoMely: 0.24,
    });
    return e;
  },

  /**
   * ISTÁLLÓ — hosszú boksz-sor OSZTOTT AJTÓKKAL, széna-padlással, előtte KARÁM.
   * A körbekerített udvar felülnézetből egyedi: semelyik másik épület nem
   * foglal el üres területet a saját alapterületén belül.
   */
  ISTALLO(e) {
    const E = e.eresz;
    const cz = -0.78, homlok = cz + 0.57;
    e.doboz(2 * E - 0.1, 0.12, 2 * E - 0.1, 0, 0, 0, SZIN.FOLD);
    e.kofal(2.5, 0.36, 1.2, 0, 0.12, cz, { sarok: false, labazat: 0.1 });
    e.doboz(2.44, 0.66, 1.14, 0, 0.48, cz, SZIN.DESZKA);
    for (const dx of [-1.18, -0.4, 0.4, 1.18]) {
      e.doboz(0.1, 1.02, 0.1, dx, 0.12, homlok - 0.02, SZIN.FA);
    }
    e.nyeregteto(0.68, 0.52, 2.6, 0, 1.14, cz, SZIN.ZSINDELY, TETO_CS, Math.PI / 2);
    // Osztott bokszajtók: az alsó fele csapatszín, a felső nyitva (sötét).
    for (const dx of [-0.79, 0, 0.79]) {
      e.doboz(0.46, 0.3, 0.06, dx, 0.62, homlok, SZIN.NYILAS);
      e.doboz(0.44, 0.34, 0.07, dx, 0.24, homlok + 0.01, SZIN.CSAPAT, 1);
    }
    // Széna-padlás nyílása és a kilógó szénacsomó.
    e.doboz(0.4, 0.3, 0.06, 0, 1.16, cz + 0.6, SZIN.NYILAS);
    e.doboz(0.3, 0.16, 0.2, 0, 1.16, cz + 0.68, SZIN.SZALMA);
    // Karám: elülső rúdsor + két oldalsó. Felülnézetből ez egy körbekerített
    // udvar — semelyik másik épület nem hagy üresen területet a saját
    // alapterületén belül.
    e.kerites(0, 0.12, E - 0.12, 2 * E - 0.3, 1, 0.56);
    for (const ux of [-1, 1]) e.kerites(ux * (E - 0.12), 0.12, homlok + 0.5, 1.1, 0, 0.56);
    e.kazal(1.0, 0.12, 0.62, 0.3, 0.46);
    e.doboz(0.56, 0.2, 0.3, -0.9, 0.12, 0.72, SZIN.FA);
    e.doboz(0.48, 0.06, 0.22, -0.9, 0.26, 0.72, SZIN.VAS);
    e.zaszlo(-1.26, 1.16, cz - 0.44, 0.58, 0.3, 0.44, 3, 0.55);
    e.serulesJelek({
      // A jelek a DESZKA-falra mennek: a kőlábazat homlokzata 3 cm-rel elébb
      // ugrik, tehát ami alatta van, azt a kő elnyelné.
      homlok, falFel: 1.16, falY: 0.52, falMag: 0.56, talpY: 0.12, omladekZ: 0.12,
      tetoX: 0.8, tetoY: 1.42, tetoZ: cz + 0.28, tetoFel: 0.22, tetoMely: 0.24,
    });
    return e;
  },

  /**
   * OSTROMMŰHELY — nyitott ácsváz, alatta FÉLKÉSZ FALTÖRŐ KOS, mellette FORGÓ
   * KÖSZÖRŰKŐ. A kerék az egyetlen KÖR alakú tömeg a roszterben — ez az, ami
   * messziről is elüt minden más épülettől. A két kerék ezért SZÉTHÚZVA áll és
   * világosabb a gerendánál: egymásba olvadva csak barna folt lenne (a v0.10
   * első változata pont ezen bukott el).
   */
  OSTROMMUHELY(e) {
    const E = e.eresz;
    e.doboz(2 * E - 0.1, 0.12, 2 * E - 0.1, 0, 0, 0, SZIN.FOLD);
    e.doboz(2.3, 0.05, 1.5, 0.1, 0.12, 0.3, SZIN.KAVICS);
    for (const ux of [-1, 1]) {
      for (const uz of [-1, 1]) {
        e.doboz(0.26, 1.58, 0.26, ux * (E - 0.18), 0.12, uz * (E - 0.18), SZIN.FA);
        e.dontDoboz(0.42, 0.11, 0.11, ux * (E - 0.42), 1.5, uz * (E - 0.18), ux * -0.7, 'z', SZIN.FA);
      }
    }
    for (const uz of [-1, 1]) {
      e.doboz(2 * E - 0.1, 0.19, 0.22, 0, 1.7, uz * (E - 0.18), SZIN.FA);
    }
    e.doboz(0.22, 0.19, 2 * E - 0.5, 0, 1.7, 0, SZIN.FA);
    e.doboz(2 * E - 0.24, 0.09, 1.2, 0, 1.89, -0.68, SZIN.DESZKA, TETO_CS);
    for (const dz of [-1.05, -0.65, -0.25]) {
      e.doboz(2 * E - 0.2, 0.06, 0.08, 0, 1.98, dz, SZIN.FA_SOTET);
    }
    // A FÉLKÉSZ KOS: két nagy kerék, köztük a gerenda, a végén a vasalt fej.
    for (const dx of [-0.78, 0.78]) {
      const k = new THREE.CylinderGeometry(0.44, 0.44, 0.16, 8);
      k.rotateZ(Math.PI / 2);
      k.translate(dx, 0.56, 0.72);
      e.elem(k, SZIN.DESZKA);
      const ag = new THREE.BoxGeometry(0.2, 0.74, 0.1);
      ag.rotateX(Math.PI / 4);
      ag.translate(dx, 0.56, 0.72);
      e.elem(ag, SZIN.FA_SOTET);
    }
    e.rud(0.07, 1.62, 6, 0, 0.56, 0.72, SZIN.VAS);
    e.rud(0.17, 1.4, 6, 0.06, 0.86, 0.72, SZIN.FA);
    e.doboz(0.24, 0.36, 0.36, 0.9, 0.68, 0.72, SZIN.VAS);
    e.doboz(0.36, 0.05, 0.4, 0.86, 0.86, 0.72, SZIN.CSAPAT, 1);
    // FORGÓ KÖSZÖRŰKŐ állványon — a műhely „életjele".
    e.doboz(0.5, 0.4, 0.36, -0.92, 0.12, -0.62, SZIN.FA);
    e.forgoKerek(-0.92, 0.66, -0.62, 0.24, 0.1, 4, 0, SZIN.KO_VILAG);
    // Faanyag-rakás és bak.
    for (let i = 0; i < 3; i++) e.rud(0.09, 1.0, 6, 0.9, 0.21 + i * 0.17, -1.14 + (i % 2) * 0.2, SZIN.FA);
    e.zaszlo(-E + 0.22, 1.7, -E + 0.22, 0.62, 0.3, 0.44, 3, 0.85);
    // Nyitott ácsváz: nincs falsík, amire repedés kerülhetne. A jel ezért a
    // KORMOS OSZLOP és a földön heverő omladék — az udvar úgyis a látható rész.
    e.allapot(SERULES.SERULT);
    e.korom(-(E - 0.18), 0.5, E - 0.06, 0.22, 0.7);
    e.omladek(0.9, 0.12, 1.16, 0.16);
    e.allapot(SERULES.SULYOS);
    e.korom(E - 0.18, 0.7, E - 0.06, 0.22, 0.62);
    e.omladek(-1.0, 0.12, 0.86, 0.2);
    e.tetoseb(-0.5, 1.92, -0.68, 0.24, 0.26);
    e.allapot();
    return e;
  },

  /**
   * TORONY — rézsűs, nyolcszögű kőtest LŐRÉSEKKEL, kiugró gyilokjáró-koszorúval,
   * pártázattal és zsindelyes sisakkal. A MAGASSÁG a lényeg: ez az egyetlen
   * épület, aminek a teste a központ zászlaja fölé nő.
   */
  TORONY(e) {
    const E = e.eresz;
    e.doboz(2 * E - 0.1, 0.2, 2 * E - 0.1, 0, 0, 0, SZIN.KO_SOTET);
    e.doboz(2 * E - 0.34, 0.13, 2 * E - 0.34, 0, 0.2, 0, SZIN.KO);
    e.henger(0.84, 0.68, 2.52, 8, 0, 0.33, 0, SZIN.KO, 0, false);
    e.henger(0.8, 0.8, 0.11, 8, 0, 1.28, 0, SZIN.KO_VILAG, 0, false);
    // Csapat-öv derékmagasságban: a torony teteje messziről egy pont, az öv
    // viszont a sziluett közepén ül, ahol a szem megtalálja.
    e.henger(0.77, 0.75, 0.17, 8, 0, 1.72, 0, SZIN.CSAPAT, 1, false);
    e.doboz(0.36, 0.5, 0.08, 0, 0.33, 0.79, SZIN.NYILAS);
    e.doboz(0.3, 0.44, 0.06, 0, 0.35, 0.82, SZIN.FA_SOTET);
    // A lőréseknek a fal SÍKJÁBAN kell ülniük. A rézsűs test sugara 0,72-nél
    // már ~0,80 — a 0,72-re tett nyílás az első változatban BENT maradt a
    // kőben, tehát láthatatlan volt.
    for (const [ux, uz] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
      e.lores(ux * 0.79, 0.98, uz * 0.79, 0.34, ux || uz);
      e.lores(ux * 0.74, 2.1, uz * 0.74, 0.3, ux || uz);
    }
    // Kiugró koszorú (machicolatio): a rézsűs testet ez zárja le, és ez adja a
    // torony jellegzetes „gombás" sziluettjét.
    e.henger(0.68, 0.93, 0.26, 8, 0, 2.85, 0, SZIN.KO_VILAG, 0.15, false);
    e.henger(0.93, 0.9, 0.16, 8, 0, 3.11, 0, SZIN.KO, 0, false);
    // A PÁRTÁZAT két foga a súlyos fokozaton leomlik. A torony sziluettjét a
    // fogsor adja — egy hiányzó fog messzebbről is elárulja a bajt, mint bármi,
    // amit a falra festhetnénk.
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      e.allapot(i === 2 || i === 5 ? SERULES.NEM_SULYOS : SERULES.MINDIG);
      e.doboz(0.24, 0.22, 0.24, Math.cos(a) * 0.72, 3.27, Math.sin(a) * 0.72, SZIN.KO_VILAG);
    }
    e.allapot();
    e.gula(0.66, 0.44, 8, 0, 3.27, 0, SZIN.ZSINDELY, TETO_CS);
    e.zaszlo(0, 3.66, 0, 0.5, 0.26, 0.4, 2);
    e.serulesJelek({
      // A torony teste RÉZSŰS, tehát a lapos repedés csak egy rövid szakaszon
      // simul rá — ezért alacsony és rövid a falszakasz, közel a lábazathoz.
      homlok: 0.75, falFel: 0.5, falY: 0.55, falMag: 0.7, talpY: 0.33, omladekZ: 0.66,
      tetoX: 0, tetoY: 3.42, tetoZ: 0.16, tetoFel: 0.2, tetoMely: 0.2,
    });
    return e;
  },

  /**
   * PIAC — három CSÍKOS PONYVA: a legszínesebb tető az egész roszterben. A
   * csíkozás (vászon + csapatszín váltakozva) azért éri meg a néhány extra
   * hasábot, mert a tiszta csapatszínű ponyva nagy foltban már nem ponyvának
   * látszik, hanem festett doboznak — a csík viszont azonnal vászonná teszi.
   */
  PIAC(e) {
    const E = e.eresz;
    e.doboz(2 * E - 0.1, 0.12, 2 * E - 0.1, 0, 0, 0, SZIN.KAVICS);
    const stand = (x, z, szeles) => {
      e.doboz(szeles, 0.46, 0.56, x, 0.12, z, SZIN.DESZKA);
      e.doboz(szeles + 0.08, 0.06, 0.64, x, 0.58, z, SZIN.FA_SOTET);
      for (const ux of [-1, 1]) {
        e.doboz(0.09, 1.0, 0.09, x + ux * (szeles * 0.5 - 0.04), 0.12, z, SZIN.FA);
      }
      // A ponyva CSÍKOKBÓL áll: minden második szelet csapatszín.
      const db = 5, sz = (szeles + 0.24) / db;
      for (let i = 0; i < db; i++) {
        const px = x - (szeles + 0.24) * 0.5 + sz * (i + 0.5);
        const csik = i % 2 === 1;
        e.hasab([-sz * 0.52, 0, sz * 0.52, 0, 0, 0.3], 0.86, px, 1.12, z,
          csik ? SZIN.CSAPAT : SZIN.VASZON, csik ? 1 : 0);
      }
      e.doboz(szeles + 0.3, 0.07, 0.1, x, 1.09, z + 0.44, SZIN.FA_SOTET);
    };
    stand(-0.72, -0.66, 1.1);
    stand(0.76, -0.66, 1.1);
    stand(-0.1, 0.76, 1.2);
    // Áru a pultokon és az udvaron.
    for (const [gx, gz] of [[-0.95, -0.66], [-0.5, -0.62], [0.55, -0.68], [0.98, -0.62]]) {
      e.doboz(0.22, 0.14, 0.22, gx, 0.58, gz, SZIN.CSEREP);
    }
    e.hordo(1.24, 0.12, 0.5, 0.16, 0.36);
    e.hordo(1.24, 0.12, 0.14, 0.14, 0.3);
    e.lada(-1.2, 0.12, 0.3, 0.32);
    e.kazal(1.1, 0.12, 1.06, 0.24, 0.34);
    e.zaszlo(-1.26, 0.12, 1.06, 1.15, 0.32, 0.46, 3, 0.6);
    // A piacnak sincs fala: a jel a KORMOS PULT és a beszakadt ponyva.
    e.allapot(SERULES.SERULT);
    e.korom(-0.1, 0.2, 1.04, 0.4, 0.28);
    e.omladek(1.0, 0.12, 1.24, 0.16);
    e.allapot(SERULES.SULYOS);
    e.korom(0.76, 0.2, -0.38, 0.36, 0.26);
    e.omladek(-1.1, 0.12, -0.24, 0.2);
    e.tetoseb(-0.1, 1.24, 0.76, 0.22, 0.3);
    e.allapot();
    return e;
  },
};

/**
 * ÁLLVÁNY — az ÉPÜLŐ ház köré kerül, EGYSÉG-térben (1×1 alapterület, 1 magas),
 * tehát a példány-mátrix méretezi a helyére.
 *
 * Miért kell egyáltalán? A doboz-korszakban az építkezés abból látszott, hogy a
 * doboz alacsonyabb és fakóbb volt. Egy részletes sziluettnél a lapított forma
 * önmagában nem olvasható („eltört a modell?"), a fakóság pedig kevés. Az
 * állvány TELJES magasságban áll, miközben az épület belül nő — így egyszerre
 * látszik, MI épül és MENNYIRE van kész.
 *
 * ⚠️ Egység-térben épül, tehát a példány-mátrix NEM EGYENLETESEN nyújtja
 * (m × H × m). Ezért nincs benne henger és ferde palló arányfüggő méretben: a
 * ferde darab a nyújtástól elcsúszna a végpontjairól. Doboz és létrafok van —
 * azok bármilyen nyújtás mellett a helyükön maradnak.
 */
function allvanyForma() {
  const e = new Forma(1, 1);
  e.doboz(1, 0.04, 1, 0, 0, 0, SZIN.FOLD);
  for (const ux of [-1, 1]) {
    for (const uz of [-1, 1]) e.doboz(0.07, 1.0, 0.07, ux * 0.46, 0, uz * 0.46, SZIN.FA);
  }
  for (const h of [0.34, 0.68]) {
    for (const uz of [-1, 1]) e.doboz(0.98, 0.035, 0.16, 0, h, uz * 0.46, SZIN.DESZKA);
    for (const ux of [-1, 1]) e.doboz(0.05, 0.03, 0.98, ux * 0.46, h, 0, SZIN.FA);
  }
  // Létra a homlokzat elé: két szár és négy fok.
  for (const ux of [-1, 1]) e.doboz(0.045, 0.92, 0.045, 0.22 + ux * 0.09, 0.02, 0.5, SZIN.FA);
  for (let i = 0; i < 4; i++) e.doboz(0.22, 0.028, 0.045, 0.22, 0.14 + i * 0.22, 0.5, SZIN.FA);
  // Kőrakás és vödör: az építkezés a földön is látszik.
  e.doboz(0.2, 0.11, 0.2, -0.24, 0.04, 0.42, SZIN.KO);
  e.doboz(0.13, 0.09, 0.13, -0.22, 0.15, 0.4, SZIN.KO_VILAG);
  return e;
}

// ── A TÁBLA FELÉPÍTÉSE — ITT BUKIK KI A HIÁNY ──────────────────────────────

/** `EPULET`-indexelt építőfüggvények. Lásd a fejléc „rövid tábla" szakaszát. */
const FORMA_TABLA = [];
{
  const kulcsok = Object.keys(EPULET);
  if (EP_MERET.length !== kulcsok.length || EP_MAGASSAG.length !== kulcsok.length) {
    throw new Error('[epulet_formak] EP_MERET/EP_MAGASSAG nem az EPULET hosszú — '
      + `${EP_MERET.length}/${EP_MAGASSAG.length} vs ${kulcsok.length}`);
  }
  for (const nev of kulcsok) {
    const fn = FORMAK[nev];
    if (typeof fn !== 'function') {
      throw new Error('[epulet_formak] nincs sziluett az EPULET.' + nev + ' típushoz');
    }
    FORMA_TABLA[EPULET[nev]] = fn;
  }
  for (const nev of Object.keys(FORMAK)) {
    if (!(nev in EPULET)) {
      throw new Error('[epulet_formak] ismeretlen épülettípus a formák közt: ' + nev);
    }
  }
}

/** Hány típus van? A rajzoló réteg ennyi példánytömböt nyit. */
export const EPULET_TIPUS_DB = FORMA_TABLA.length;

/** A típus magasság-kerete világegységben (a régi doboz teljes magassága). */
export function epuletMagassag(tipus) {
  return EP_MERET[tipus] * 0.8 * EP_MAGASSAG[tipus];
}

/** Egy típus nyers alkatrész-gyűjtője. Csak innen és a diagnosztikából hívjuk. */
function epitForma(tipus) {
  const e = new Forma(EP_MERET[tipus], epuletMagassag(tipus));
  FORMA_TABLA[tipus](e);
  return e;
}

/**
 * A tizenegy geometria + az állvány felépítése. EGYSZER hívandó, a réteg
 * konstruktorából — futásidőben soha.
 * @returns {{tipus: THREE.BufferGeometry[], allvany: THREE.BufferGeometry,
 *            haromszog: number[], allvanyHaromszog: number}}
 */
export function epitEpuletGeometriak() {
  const tipus = [];
  const haromszog = [];
  for (let t = 0; t < FORMA_TABLA.length; t++) {
    const geo = osszefuz(epitForma(t).reszek);
    // A típus a GEOMETRIÁN utazik: aki csak a hálót kapja meg (hibakereső
    // eszköz, előnézet), a réteg nyilvántartása nélkül is tudja, mit lát.
    geo.userData.epTipus = t;
    tipus[t] = geo;
    haromszog[t] = geo.attributes.position.count / 3;
  }
  const allvany = osszefuz(allvanyForma().reszek);
  return {
    tipus, allvany, haromszog,
    allvanyHaromszog: allvany.attributes.position.count / 3,
  };
}

// ── ÁLLAPOT: A SIM-BŐL A PÉLDÁNY-PUFFERBE ──────────────────────────────────

/**
 * A sérülés-fokozat KÜSZÖBEI az életerő százalékában.
 *
 * Két küszöb van, nem folytonos átmenet, és ez szándékos: a repedés vagy ott
 * van, vagy nincs — egy „30 %-ban látszó" repedés csak halványabb festék volna,
 * nem több információ. A küszöb viszont ESEMÉNY: a játékos látja, hogy az
 * épülete átlépett egy határt. A számok a `harc.js` ütemével együtt élnek: 70 %
 * még néhány csapás, 33 % már az utolsó harmad.
 */
export const SERULT_SZAZ = 70;
export const SULYOS_SZAZ = 33;

/**
 * Az épület sérülés-fokozata: 0 = ép, 1 = sérült, 2 = súlyosan sérült.
 *
 * ⚠️ Egészben osztunk vissza százalékra, ahogy a sim is (`Int32Array` életerő).
 * Nincs hiszterézis, mert nincs is rá szükség: a sim NEM javít épületet, tehát
 * a fokozat monoton — oda-vissza villogás nem keletkezhet.
 */
export function serulesFokozat(hp, maxHp) {
  if (maxHp <= 0 || hp >= maxHp) return 0;
  const szaz = (hp * 100) / maxHp;
  if (szaz <= SULYOS_SZAZ) return 2;
  return szaz <= SERULT_SZAZ ? 1 : 0;
}

/**
 * A közös épület-anyag. MINDEN típus ezt az EGY példányt kapja: azonos anyag +
 * azonos attribútum-készlet → a Three egyetlen shader-programot fordít, tehát a
 * tizenegy rajzhívás közt nincs program-váltás.
 *
 * `toneMapped: false` — ez a doboz-korszak öröksége, és tudatos: a
 * csapatszínnek az ACES-görbe alatt is telítettnek kell maradnia.
 *
 * ── AZ ÉLET A VERTEX SHADERBEN VAN, ÉS EZ SZÁNDÉKOS ──────────────────────
 * A lengő zászló, a szálló füst és a forgó köszörűkő megoldható volna külön
 * hálóval és képkockánkénti mátrix-írással is — az viszont rajzhívást, példány-
 * puffert és CPU-munkát kérne minden képkockán. Itt ehelyett két statikus
 * csúcs-attribútum (`eletAdat`, `eletKozep`) hordozza a mozgás leírását, és a
 * shader számolja ki. A költség: egy `float` uniform frissítése képkockánként,
 * és néhány utasítás azon a pár ezer csúcson, ami az épületeké. NULLA extra
 * rajzhívás, NULLA allokáció.
 *
 * A fázist a PÉLDÁNY-MÁTRIX eltolás-oszlopából is hasheljük (ugyanaz a fogás,
 * mint a `props3d.js` fáin), különben egy típus minden példánya vezényszóra
 * lengene — nyolc ház nyolc külön ütemben füstöl, extra adat nélkül.
 *
 * A füst NEM átlágszó: a pamacs a saját középpontja körül zsugorodik NULLÁRA.
 * Egy átlátszó anyag külön, rendezett rajzhívást és `depthWrite:false`-t kérne.
 *
 * ── AZ ÁLLAPOT-CSATORNA (v0.16/2) ────────────────────────────────────────
 * A kapu nyitottsága és az épület sérülése egyetlen PÉLDÁNY-attribútumon megy
 * be (`epAllapot`: x = sérülés-fokozat 0/1/2, y = kapu 0/1), a darabok pedig a
 * saját ablakukat hozzák magukkal (`allapotAdat`, lásd `epulet_reszek.js`).
 * Az ablakán kívüli darab minden csúcsa egyetlen pontba esik, tehát a
 * háromszögei elfajulnak. NULLA extra rajzhívás, NULLA geometria-építés.
 *
 * ⚠️ Ha az attribútum nincs feltöltve, a WebGL az általános alapértéket adja,
 * amit a `defaultAttributeValues` állít 0-ra: ép épület, csukott kapu — vagyis
 * PONTOSAN a v0.16-os kép. A rendszer tehát nem tud „elromlani láthatatlanul":
 * hiba esetén a régi látvány jön vissza, nem egy üres épület.
 *
 * @returns {THREE.MeshLambertMaterial} `userData.ido` az idő-uniform.
 *   Az `epAllapot` példány-puffert a `gazdasag3d.js` foglalja és tölti.
 */
export function epuletAnyag() {
  const anyag = new THREE.MeshLambertMaterial({ toneMapped: false });

  // ── AZ ÓRA ───────────────────────────────────────────────────────────────
  // A `value` KIOLVASOTT, nem beírt: a Three képkockánként lekérdezi az uniform
  // értékét, tehát a getter maga az óra. Így a lengő zászló, a szálló füst és a
  // forgó köszörűkő akkor is él, ha a rajzoló réteg (`gazdasag3d.js`, MÁSIK
  // AGENT SÁVJA) sosem írja be az időt — a v0.16-ban pont ez történt, és a
  // három mozgásfajta ezért állt egy helyben, némán, zöld kapuk mellett.
  // A setter megmarad: aki beírja az időt, attól kezdve az övé az óra.
  const kezdet = typeof performance !== 'undefined' ? performance.now() : 0;
  let kezi = -1;
  const ido = {
    get value() {
      if (kezi >= 0) return kezi;
      return typeof performance !== 'undefined' ? (performance.now() - kezdet) * 0.001 : 0;
    },
    set value(v) { kezi = v; },
  };
  anyag.userData.ido = ido;

  // ── AZ ÁLLAPOT-PUFFER ALAPÉRTÉKE ─────────────────────────────────────────
  // Az `epAllapot`-ot a RAJZOLÓ RÉTEG tölti (`gazdasag3d.js` példány-hurka);
  // ez a fájl csak a formát és az alapértéket adja hozzá.
  //
  // ⚠️ A v0.17-ben volt itt egy `Material.onBeforeRender`-es KERÜLŐÚT, ami maga
  // töltötte a puffert a `window.__aoc.jatek.sim`-ből — akkor még nem volt kinek
  // átadnia. Amint a réteg átvette, a kettő UGYANARRA A PUFFERRE írt, és ez a
  // fajta ütközés némán romlik el: két helyes írás közül a későbbi győz, tehát a
  // hiba csak akkor látszik, ha a két forrás elkülönbözik (pl. egy szonda-előnézet
  // MÁSIK simmel — a kerülőút a globális simet oldotta fel, nem a réteget). Ezért
  // a kerülőút megszűnt: EGY írója van a puffernek.
  anyag.defaultAttributeValues = { epAllapot: [0, 0], allapotAdat: [0, 0] };

  anyag.onBeforeCompile = (sh) => {
    sh.uniforms.aocIdo = ido;
    sh.vertexShader = `
      attribute vec3 alapSzin;
      attribute float csapatArany;
      attribute vec2 eletAdat;     // x = mozgásfajta, y = fázis
      attribute vec3 eletKozep;    // a mozgás origója
      attribute vec2 allapotAdat;  // x = sérülés-ablak, y = kapu-ablak
      attribute vec4 csapatAdat;   // rgb = csapatszín, a = fényerő
      attribute vec2 epAllapot;    // PÉLDÁNY: x = sérülés-fokozat, y = kapu
      uniform float aocIdo;
      varying vec3 vEpSzin;
    ` + sh.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       vEpSzin = mix(alapSzin, csapatAdat.rgb, csapatArany) * csapatAdat.a;
       float aocFajta = eletAdat.x;
       if (aocFajta > 0.5) {
         // Példányonkénti fázis a világpozícióból — így nem vezényszóra leng minden.
         float aocF = eletAdat.y * 6.2831853
           + fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831853;
         if (aocFajta < 1.5) {
           // ZÁSZLÓ: a rúdtól távolodva nő a lengés (a lobogó +x felé nyúlik).
           float d = transformed.x - eletKozep.x;
           float w = clamp(abs(d) * 2.2, 0.0, 1.0);
           transformed.z += sin(aocIdo * 3.1 + d * 7.5 + aocF) * 0.075 * w;
           transformed.y += cos(aocIdo * 3.1 + d * 7.5 + aocF) * 0.03 * w;
         } else if (aocFajta < 2.5) {
           // FÜST: emelkedik és a saját közepe körül nullára zsugorodik.
           // Épülő házon nincs füst (a fényerő ilyenkor 1 alatt van).
           float ph = fract(aocIdo * 0.2 + eletAdat.y + aocF * 0.16);
           float s = (1.0 - ph) * (0.5 + ph * 1.9) * step(0.99, csapatAdat.a);
           transformed = eletKozep + vec3(
             sin(aocIdo * 0.7 + aocF) * 0.26 * ph,
             ph * 1.15,
             cos(aocIdo * 0.55 + aocF) * 0.18 * ph) + transformed * s;
         } else {
           // FORGÁS az X tengely körül, a saját középpontja körül.
           float a = aocIdo * 1.15 + aocF;
           float ca = cos(a), sa = sin(a);
           transformed = eletKozep + vec3(transformed.x,
             transformed.y * ca - transformed.z * sa,
             transformed.y * sa + transformed.z * ca);
         }
       }
       // ── ÁLLAPOT-ABLAK ───────────────────────────────────────────────
       // A darab az ablakán kívül egyetlen pontba esik, tehát MINDEN
       // háromszöge elfajul (nulla terület → nincs raszterizálás). A pont a
       // talp alatt van, hogy egy esetleges vastagító hatás se ússzon ki a
       // földből. Ez a rejtés ága: a MEGJELENÍTETT darab számítása változatlan.
       float aocSA = allapotAdat.x;
       float aocKA = allapotAdat.y;
       float aocLat = 1.0;
       if (aocSA > 0.5) {
         float f = epAllapot.x;
         if (aocSA < 1.5)      aocLat = step(f, 0.5);   // csak ÉP
         else if (aocSA < 2.5) aocLat = step(f, 1.5);   // amíg nem SÚLYOS
         else if (aocSA < 3.5) aocLat = step(0.5, f);   // SÉRÜLT-től
         else                  aocLat = step(1.5, f);   // csak SÚLYOS
       }
       if (aocKA > 0.5) {
         float ny = epAllapot.y;
         aocLat *= (aocKA < 1.5) ? step(ny, 0.5) : step(0.5, ny);
       }
       if (aocLat < 0.5) transformed = vec3(0.0, -0.6, 0.0);`,
    );
    sh.fragmentShader = 'varying vec3 vEpSzin;\n' + sh.fragmentShader.replace(
      '#include <color_fragment>',
      '#include <color_fragment>\n\tdiffuseColor.rgb *= vEpSzin;',
    );
  };
  return anyag;
}

/**
 * DIAGNOSZTIKA — a formák mérete és költsége, típusonként.
 *
 * Nem dísz: ebből derül ki, hogy tényleg mind a tizenegy típus kapott saját
 * sziluettet (a `haromszog` és a `jegy` külön-külön más), és hogy egyik sem lóg
 * túl az alapterületén (`tullogas <= 0`). A `qa/` szondák és a kézi ellenőrzés
 * ugyanezt olvassa.
 *
 * ⚠️ A FÜST- és FORGÓ darabok az origó körül épülnek (a helyüket az `eletKozep`
 * adja), tehát a `tullogas`-ba nem számítanak bele. Ez helyes: a füst nem
 * foglal területet, és a köszörűkő a saját közepe körül pörög — de tudni kell
 * róla, mielőtt valaki a mérésre hivatkozva tesz oda egy nagy forgó elemet.
 */
export function formaOsszefoglalo() {
  const nevek = Object.keys(EPULET);
  const ki = [];
  for (let t = 0; t < FORMA_TABLA.length; t++) {
    const geo = osszefuz(epitForma(t).reszek);
    const p = geo.attributes.position.array;
    const el = geo.attributes.eletAdat.array;
    const al = geo.attributes.allapotAdat.array;
    let maxXZ = 0, maxY = 0, jegy = 0, eloDb = 0, serultDb = 0, kapuDb = 0;
    for (let i = 0; i < p.length; i += 3) {
      const fajta = el[(i / 3) * 2];
      if (fajta > 0.5) eloDb++;
      // A két állapot-csatorna KÜLÖN számlálva: ebből derül ki, hogy a típus
      // tényleg kapott sérülés-jeleket, és hogy a kapu tényleg két arcú.
      if (al[(i / 3) * 2] > 0.5) serultDb++;
      if (al[(i / 3) * 2 + 1] > 0.5) kapuDb++;
      // A ZÁSZLÓ a helyén épül, tehát MÉRENDŐ (egy hosszú lobogó könnyen
      // kilóg a cellából). A füst és a forgó darab az origóban épül — azokat a
      // mérés nem látná értelmesen, és területet sem foglalnak.
      if (fajta > 1.5) continue;
      const ax = Math.abs(p[i]), az = Math.abs(p[i + 2]);
      if (ax > maxXZ) maxXZ = ax;
      if (az > maxXZ) maxXZ = az;
      if (p[i + 1] > maxY) maxY = p[i + 1];
      // Egyszerű ujjlenyomat: két típus formája akkor azonos, ha ez is az.
      jegy = (Math.imul(jegy, 31) + Math.round((p[i] + p[i + 1] * 3 + p[i + 2] * 7) * 1000)) | 0;
    }
    ki.push({
      tipus: t,
      nev: nevek[t],
      meret: EP_MERET[t],
      keret: epuletMagassag(t),
      haromszog: geo.attributes.position.count / 3,
      eloCsucs: eloDb,
      serulesCsucs: serultDb,
      kapuCsucs: kapuDb,
      szelesFel: maxXZ,
      tullogas: maxXZ - EP_MERET[t] * 0.5,
      magassag: maxY,
      jegy,
    });
    geo.dispose();
  }
  return ki;
}
