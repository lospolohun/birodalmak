# PORTAL HUB TYCOON — projektterv és állapot

> Egy dimenziók közötti központi átszállóállomás igazgatója vagy.
> Portálokon át furcsa lények érkeznek, és tovább akarnak utazni, enni,
> vásárolni, pihenni. Építsd meg a világ legnagyobb dimenziókapu-állomását.

**Verzió: `portal/src/mag/config.js` → `VERZIO`.** A `package.json` verziója az
AGE OF THE CRYSTALS-é, ne azt nézd.

---

## 1. Mi ez a mappa

A `portal/` egy ÖNÁLLÓ alprojekt a `birodalmak` repóban. Saját `index.html`-je,
saját `vite.config.js`-e és saját szondái vannak; az AGE OF THE CRYSTALS
egyetlen fájljához sem nyúl. A két játék három npm-scripten kívül semmit nem
oszt meg:

```bash
npm run portal:dev        # fejlesztői kiszolgáló (5274)
npm run portal:build      # dist/
npm run portal:det        # determinizmus-szonda — EZ A FŐ KAPU
npm run portal:bongeszo   # böngésző-szonda (indul-e, működik-e)
npm run portal:kep 14000  # képernyőkép egy felépített állomásról
npm run portal:szonda     # det + build + böngésző egyben
```

---

## 2. Rétegek — és a köztük lévő EGYETLEN szabály

```
  src/mag/     config, determinizmus-biztos matek, seedelt véletlen
  src/sim/     A VILÁG. Nincs benne three, DOM, Math.random, Date.now.
  src/render/  three.js. Csak OLVASSA a simet.
  src/ui/      DOM. Csak OLVASSA a simet.
  src/fo.js    huzalozás + fix lépésközű hurok
```

**A render és a UI sosem ír a simbe.** Ha hatni akarnak a világra, parancsot
adnak: `sim.parancs({ fajta: 'epit', tipus: 'etterem', x, y })`. Ennek három
következménye van, és mindhármat használjuk:

1. **A mentés = seed + parancsnapló.** Nem kell ezer utast szerializálni.
   A `det_szonda.mjs` 5. vizsgálata ezt méri: a naplóból újrajátszva bitre
   ugyanaz az állapot jön ki.
2. **A hibák újrajátszhatók.** A `?seed=…` paraméterrel ugyanaz a világ
   indul újra — hibajelentéshez ez az egyetlen használható eszköz.
3. **A felület cserélhető.** A UI teljes átírása nem tudja elmozdítani a
   gazdaságot.

---

## 3. Ami KÉSZ (v0.1)

### Szimuláció
- **Rács** 64×48, padló / épület / hő- / hidegzóna / tömeg rétegekkel.
- **Útkeresés**: épületenkénti BFS-távolságmező, gyorsítótárazva a rács
  verziójához kötve, tickenként korlátozott újraszámolással. Utasonként 8
  tömb-olvasás, nem A*.
- **20 épülettípus**, adatvezérelten (`sim/epuletek.js`): egy új szolgáltatás
  EGY sor a katalógusban.
- **10 faj** (`sim/lenyek.js`) saját sebességgel, türelemmel, pénzzel,
  helyigénnyel, igénylistával és két minőségi különbséggel: a szellem átmegy a
  falakon, a mimik lop.
- **Utas-AI**: érkezik → dönt → megy → sorban áll → kiszolgálás → indul.
  Türelem, hangulat, csalódás, dühös távozás.
- **7 dimenzió** külön fajmixszel, díjjal, veszélyességgel, szinttel és
  instabilitással. A díjszabás visszahat a forgalomra.
- **Gazdaság**: portáldíj, szolgáltatásbevétel, reklám / bérek, energia,
  kristály, üzemeltetés, napi elszámolás tételes bontással.
- **9 dolgozótípus**, beosztással, három szinttel, napi bérrel.
- **14 technológia** függőségi fával.
- **11 esemény**, többségük játékos-válasszal és felkészültség-függő kimenettel.
- **7 fejezetes történet** két visszafordíthatatlan döntéssel, győzelemmel és
  csőddel.

### Látvány
- Példányosított padló (sakktábla + zónaszínezés), épületek, utasok
  (szilárd/áttetsző), dolgozók, állapotjelzők — **12 rajzolási hívás** az egész
  jelenetre, 1200 lénnyel is.
- Forgó, instabilitással vörösödő portálgyűrűk, saját fénnyel.
- Színátmenetes ég + csillagok, alaplemez a lebegő sziget alatt.
- A hangulat LÁTSZIK: a lény színe a vörös felé csúszik, ha rossz a kedve.

### Felület
- Felső sáv hat számmal, mindegyikre van válaszlépés.
- Fejezet-kártya haladásjelzővel.
- Építés-sáv hat kategóriával; a kapuk dimenziónként külön gombbal.
- Hat panel: dimenziók, kutatás, dolgozók, statisztika, napló, súgó.
- Modális ablakok: fejezet, döntés, esemény, vég.

---

## 4. Mérések (2026-08-04, felhő)

| mérés | érték |
|---|---|
| determinizmus-szonda | mind a 6 vizsgálat zöld |
| ms/tick 1200 utasnál | **0,137 ms** (node, felhő) |
| rajzolási hívás | 12 |
| csúcsforgalom a szondában | 1200 egyszerre jelenlévő utas |
| build | 599 kB / 162 kB gzip |

⚠️ **A tick-idő két futás között NEM összehasonlítható** — a felhő-gép osztott
CPU-n fut. A/B-t egy munkameneten belül mérj (`git stash`).

⚠️ **FPS-t a felhőben nem mértünk és nem is lehet**: nincs GPU, a Chrome
SwiftShaderre esik. A `qa/*.png` képek geometriát és színt mutatnak, sebességet
nem. Az FPS-mérés az iMac dolga.

---

## 5. Ami NINCS kész (v0.2+ ötlettár)

Sorrend nagyjából fontosság szerint.

1. **Mentés/betöltés.** A gépezet kész (seed + parancsnapló), a felület nincs.
   Egy `localStorage`-ba írt napló + „Folytatás" gomb elég lenne.
2. **Hang.** Jelenleg néma. Portálzúgás, tömegzaj, kassza, riasztás.
3. **Több szint.** A leírásban szereplő „többszintes állomás": a rácsnak
   `szint` dimenziót kellene kapnia, a teleport lift pedig valódi átjáró lenne.
4. **Bestiárium-panel.** A fajok viselkedése ma csak a kódban olvasható; egy
   panel, ami megmutatja, ki mit akar, sokat segítene a tervezésben.
5. **Épület-sziluettek.** Ma minden épület doboz + tetődísz. Típusonkénti
   egyedi mértan (kupola, oszlopok, ponyva) sokat adna a hangulathoz.
6. **Vasút, léghajó, űrkapu** — a leírás hosszú távú céljai; mindegyik egy-egy
   új épülettípus + egy új érkezési csatorna.
7. **Nehézségi fokozatok** és **végtelen mód** a VII. fejezet után.
8. **Bérleti szerződések**: a boltokat ne mi üzemeltessük, hanem adjuk bérbe —
   ez egy második, passzív bevételi ág lenne.

---

## 6. Ha hozzányúlsz — checklist

- `npm run portal:det` és `npm run portal:build` fusson hibátlanul.
- **Új parancsfajta → vedd bele a `tools/forgatokonyv.mjs` v01-be.** Különben a
  legfrissebb kód marad a kapun kívül, és a zöld szonda hamis biztonságérzetet
  ad. (Ez már megtörtént: az első forgatókönyv fix tick-listából dolgozott, és
  emiatt a második kapu SOHA nem nyílt meg — a több-kapus kód mérés nélkül
  maradt.)
- **Új alrendszer → kérdezd meg: mi az a szám, ami elárulja, hogy tényleg
  CSINÁL is valamit?** Tedd bele a 6. vizsgálatba. A determinizmus-kapu nem
  működés-kapu: az állomás egy ponton TARTÓS áramszünetben ült, minden épület
  40 %-on ment, a hírnév spirálba került — és a determinizmus közben hibátlan
  volt.
- A `v01` forgatókönyv a motor-mag regresszió-őre. Ne írd át; új próbához új
  függvényt írj (`v02`, …).
