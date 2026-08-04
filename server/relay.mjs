// AGE OF THE CRYSTALS — WEBSOCKET RELAY (v0.8/2).
//
// ── A SZERVER NEM TUD SEMMIT A JÁTÉKRÓL ───────────────────────────────────
// Ez a fájl nem ismer egységet, nyersanyagot, térképet vagy győzelmi
// feltételt. Egyetlen dolgot csinál: TOVÁBBÍT. Csomagot vesz az egyik
// klienstől, és odaadja a többinek.
//
// Ez nem szegényes megoldás, hanem a lockstep KÖZVETLEN KÖVETKEZMÉNYE. Ha
// minden gép ugyanazt a determinisztikus szimulációt futtatja ugyanarra a
// parancs-sorra, akkor a szervernek nincs mit hitelesítenie: nincs olyan
// állapot, amit ő jobban tudna. Amit ezzel nyerünk:
//
//   • A szerver ELHANYAGOLHATÓ terhelésű. Nem szimulál, nem ütközést vizsgál,
//     nem útvonalat keres. Egy olcsó gépen több száz meccs is elfér.
//   • NEM TUD DESYNCET OKOZNI. Nincs benne játék-logika, amiben eltérhetne a
//     kliensekétől.
//   • KICSERÉLHETŐ. Bármelyik buta továbbító helyettesíti.
//
// ── AMI VISZONT CSAK A SZERVER DOLGA LEHET ────────────────────────────────
// ⚠️ A JÁTÉKOS-AZONOSÍTÓT A SZERVER BÉLYEGZI, NEM A KLIENS MONDJA MEG.
// Ez az EGYETLEN tekintély, amit a relay gyakorol, és el sem hagyható: egy
// hamis kliens különben `jatekos: 0`-val küldhetne csomagot, és a MÁSIK
// játékos nevében parancsolhatna a seregének. A csomag `jatekos` mezőjét
// ezért felülírjuk a kapcsolat sorszámával, akármit is írt bele a feladó.
//
// A parancsok TARTALMÁT viszont NEM vizsgáljuk. Azt minden kliens simje
// úgyis elutasítja, ha érvénytelen (nincs rá nyersanyag, foglalt a hely,
// halott az egység) — és mindenhol UGYANÚGY, mert a szabály a simben van, nem
// itt. Egy szerver-oldali „ellenőrzés" csak egy második, eltérő szabály-
// készletet hozna, vagyis pont desync-forrás lenne.
//
// ── A MECCS INDÍTÁSA BARRIER ──────────────────────────────────────────────
// Mindenkinek UGYANAZZAL A SEEDDEL és a 0. körnél kell kezdenie. A seedet a
// szerver adja (a szoba létrehozásakor), és a `rajt` üzenetet csak akkor
// küldi ki, amikor a szoba betelt. Enélkül az elsőként belépő kliens
// elkezdene köröket futtatni olyan csomagokra várva, amiket még senki nem
// tud elküldeni.
//
// HASZNÁLAT:  node server/relay.mjs [--port=8787] [--jatekos=2]

import { WebSocketServer } from 'ws';
import { randomInt } from 'node:crypto';

const erv = (nev, alap) => {
  const a = process.argv.find((x) => x.startsWith('--' + nev + '='));
  return a === undefined ? alap : Number(a.split('=')[1]);
};

const PORT = erv('port', 8787);
/** Ennyi játékos kell egy szoba indulásához. */
const JATEKOS_DB = erv('jatekos', 2);

/**
 * Egy szoba. A relay egyszerre több szobát is kiszolgál — a kliens a
 * `?szoba=NEV` lekérdezéssel választ, alapból a `fo` szobába kerül.
 */
class Szoba {
  constructor(nev, jatekosDb) {
    this.nev = nev;
    this.jatekosDb = jatekosDb;
    /** Kapcsolatok játékos-index szerint. A kiesett helye `null` marad. */
    this.kapcsolatok = new Array(jatekosDb).fill(null);
    /**
     * A meccs SEEDJE. A szoba létrehozásakor dől el, és minden belépő ezt
     * kapja — a terep, a nyersanyagok és a kezdő felállás ebből következik.
     */
    this.seed = randomInt(1, 0x7fffffff);
    this.elindult = false;
    /**
     * TOVÁBBÍTOTT CSOMAGOK. A szerver egyetlen valódi működés-száma: ha ez
     * nulla, a relay „fut", de semmit nem csinál.
     */
    this.tovabbitott = 0;
  }

  /** Az első szabad hely, vagy -1 ha tele van. */
  szabadHely() {
    for (let i = 0; i < this.jatekosDb; i++) if (this.kapcsolatok[i] === null) return i;
    return -1;
  }

  get letszam() {
    let n = 0;
    for (let i = 0; i < this.jatekosDb; i++) if (this.kapcsolatok[i] !== null) n++;
    return n;
  }

  /**
   * Küldés MINDENKI MÁSNAK. A feladó nem kapja vissza a sajátját: a
   * `Lockstep` a saját csomagját már közvetlenül átvette magától (lásd
   * `_csomagKuld`), tehát a visszhang csak fölösleges forgalom lenne.
   */
  tovabbit(kivetel, adat) {
    for (let i = 0; i < this.jatekosDb; i++) {
      const k = this.kapcsolatok[i];
      if (!k || i === kivetel) continue;
      if (k.readyState === 1) { k.send(adat); this.tovabbitott++; }
    }
  }

  kuld(jatekos, uzenet) {
    const k = this.kapcsolatok[jatekos];
    if (k && k.readyState === 1) k.send(JSON.stringify(uzenet));
  }
}

const szobak = new Map();

function szobaKer(nev) {
  let sz = szobak.get(nev);
  if (!sz) { sz = new Szoba(nev, JATEKOS_DB); szobak.set(nev, sz); }
  return sz;
}

const kiszolgalo = new WebSocketServer({ port: PORT });

kiszolgalo.on('connection', (kapcsolat, keres) => {
  // A lekérdezés elemzéséhez kell egy alap-URL: a `keres.url` csak az útvonal.
  const cim = new URL(keres.url, 'http://x');
  const szobaNev = cim.searchParams.get('szoba') || 'fo';
  const szoba = szobaKer(szobaNev);

  const hely = szoba.szabadHely();
  if (hely < 0) {
    // TELE VAN. Nem csendben dobjuk el: a kliensnek tudnia kell, MIÉRT nem
    // jött létre a meccs — a néma bontásból a felhasználó csak annyit lát,
    // hogy „nem működik".
    kapcsolat.send(JSON.stringify({ fajta: 'hiba', ok: 'a szoba tele van' }));
    kapcsolat.close();
    return;
  }
  szoba.kapcsolatok[hely] = kapcsolat;
  console.log(`[relay] ${szobaNev}: belépett a ${hely}. játékos (${szoba.letszam}/${szoba.jatekosDb})`);

  szoba.kuld(hely, {
    fajta: 'udv',
    jatekos: hely,
    jatekosDb: szoba.jatekosDb,
    seed: szoba.seed,
    letszam: szoba.letszam,
  });

  // BETELT A SZOBA → mehet a rajt. Mindenki egyszerre kapja.
  if (!szoba.elindult && szoba.letszam === szoba.jatekosDb) {
    szoba.elindult = true;
    console.log(`[relay] ${szobaNev}: INDUL (seed ${szoba.seed})`);
    for (let i = 0; i < szoba.jatekosDb; i++) szoba.kuld(i, { fajta: 'rajt' });
  }

  kapcsolat.on('message', (nyers) => {
    let u;
    // ⚠️ EGY ROSSZ CSOMAG NEM DÖNTHETI LE A SZERVERT. Minden más szobában
    // futó meccs is ezen a folyamaton él — egy elemzési hiba ott is véget
    // vetne a játéknak.
    try { u = JSON.parse(nyers.toString()); } catch (h) { return; }
    if (!u || u.fajta !== 'kor') return;
    // A JÁTÉKOS-AZONOSÍTÓ BÉLYEGZÉSE — lásd a fejlécet. Amit a kliens írt
    // bele, azt eldobjuk.
    u.jatekos = hely;
    szoba.tovabbit(hely, JSON.stringify(u));
  });

  kapcsolat.on('close', () => {
    if (szoba.kapcsolatok[hely] === kapcsolat) szoba.kapcsolatok[hely] = null;
    console.log(`[relay] ${szobaNev}: kilépett a ${hely}. játékos`
      + ` (${szoba.letszam}/${szoba.jatekosDb}, továbbított: ${szoba.tovabbitott})`);
    // A szoba akkor szűnik meg, ha KIÜRÜL. Amíg valaki bent van, a hely
    // fenntartva marad — erre épül majd a v0.8/3 újracsatlakozása.
    if (szoba.letszam === 0) {
      szobak.delete(szobaNev);
      console.log(`[relay] ${szobaNev}: szoba megszűnt`);
    }
  });

  kapcsolat.on('error', () => { /* a `close` úgyis lefut utána */ });
});

console.log(`[relay] figyel a ${PORT}. porton, ${JATEKOS_DB} játékos/szoba`);

export { kiszolgalo, szobak };
