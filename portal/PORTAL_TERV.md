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
npm run portal:dev         # fejlesztői kiszolgáló (5274)
npm run portal:build       # dist/
npm run portal:det         # determinizmus-szonda — EZ A FŐ KAPU (9 vizsgálat)
npm run portal:mertan      # a 3D-mértan kerete és sziluett-ujjlenyomata
npm run portal:hang        # hangrendszer (katalógus + böngésző + jelszint)
npm run portal:bongeszo    # böngésző-szonda (indul-e, működik-e, ment-e)
npm run portal:kep 16000   # képernyőkép egy felépített állomásról
npm run portal:szonda      # mind egyben
node portal/tools/egyensuly.mjs 60000 8   # egyensúly-mérés (percek)
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

## 3. Ami KÉSZ (v0.4)

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
- Építés-sáv nyolc kategóriával; a kapuk dimenziónként külön gombbal.
- Nyolc panel: dimenziók, kutatás, dolgozók, **bestiárium**, statisztika,
  napló, **mentés/beállítások**, súgó.
- Modális ablakok: fejezet, döntés, esemény, vég.

### v0.2 — mentés, bestiárium
- **Mentés = seed + parancsnapló.** Betöltéskor a világ ÚJRAJÁTSZÓDIK,
  darabokban, folyamatjelzővel. Automata mentés naponta + 3 kézi hely.
  A böngésző-szonda méri, hogy a betöltött világ BITRE azonos a mentettel.
- **Bestiárium**: a fajok állandó tulajdonságai ÉS az élő helyzetkép
  (ki van bent, milyen a hangulatuk, honnan jöttek).
- **Hang**: procedurális WebAudio, nulla hangfájl. A portálzúgás színe az
  instabilitást követi, a tömegzaj az utasszámot.
- **Egyedi sziluett** minden épülettípusnak és minden fajnak.

### v0.3 — a többszintes állomás
- A rács három dimenziós (64×48×3). A `z` a világ állapota, nem nézet.
- **Mozgólépcső** (olcsó, lassú) és **teleport lift** (drága, azonnali) mint
  átjáró; a szintváltás IDŐBE kerül.
- Alátámasztás: emeleti padló csak padló fölé. Az átjáró cellája JÁRHATÓ.
- A szellem átmegy a FALON, de nem a PADLÓN — neki is átjáró kell.
- Szintválasztó a felső sávban (R/F): a fölötte lévő emeletek eltűnnek.

### v0.4 — a hálózat
- **Nehézségi fokozatok** (könnyű / normál / kemény) szorzókkal. A fokozat a
  világ állapota: a mentés viszi, az ellenőrző-összeg tartalmazza.
- **Bérbeadás**: a bolt, étterem, könyvesbolt és VIP kiadható — nincs
  személyzeti gond, napi fix díj, cserébe a bevétel 42 %-a.
- **Érkezési csatornák**: Vasútállomás, Léghajó-kikötő (csak EMELETEN!),
  Űrkapu. Nincs instabilitásuk és nem fogyasztanak kristályt — ez a
  „nyugodt" bevételi ág a kapuk mellett.

---

## 4. Mérések (2026-08-04, felhő)

| mérés | érték |
|---|---|
| determinizmus-szonda | mind a **9** vizsgálat zöld |
| mértan-szonda | 23 épülettípus, 23 különböző sziluett, keret alatt |
| hang-szonda | üres állomás 0,028 → nyüzsgő+instabil 0,427 jelszint |
| böngésző-szonda | 8 vizsgálat zöld, a betöltés bitre azonos |
| ms/tick 1200 utasnál | **0,137 ms** (node, felhő) |
| rajzolási hívás | 14 |
| build | 844 kB / 231 kB gzip (ebből a three.js a nagyobb rész) |

A részletes egyensúly-mérés (6 stratégia × több seed × 50 játéknap) a
[`qa/EGYENSULY.md`](qa/EGYENSULY.md)-ben van.

⚠️ **A tick-idő két futás között NEM összehasonlítható** — a felhő-gép osztott
CPU-n fut. A/B-t egy munkameneten belül mérj (`git stash`).

⚠️ **FPS-t a felhőben nem mértünk és nem is lehet**: nincs GPU, a Chrome
SwiftShaderre esik. A `qa/*.png` képek geometriát és színt mutatnak, sebességet
nem. Az FPS-mérés az iMac dolga.

---

## 5. Ami NINCS kész (v0.5+ ötlettár)

Sorrend nagyjából fontosság szerint.

1. **Végtelen mód a VII. fejezet után.** Ma a győzelem után a történet elfogy,
   a játék viszont megy tovább cél nélkül.
2. **A gépi stratégiák újrahangolása.** A `tools/jatekosok.mjs` botjai a v0.1
   gazdaságához vannak igazítva; a v0.4 hangolása után az eredményeik részben
   mérési műtermékek. Amíg ez nincs meg, az egyensúly-számokat óvatosan kell
   olvasni.
3. **A könnyű/kemény fokozat és a bérbeadás egyensúlya méretlen.** Kell hozzá
   egy-egy külön stratégia a mérőeszközbe.
4. **Negyedik-ötödik szint**, és emeletenként eltérő bérleti díj.
5. **Utas-részletek**: poggyász mint látható tárgy, csoportok (család,
   küldöttség), VIP-kíséret.
6. **Az emeleti látvány**: ma a fölső szintek egyszerűen eltűnnek. Egy
   áttetsző „szellemszint" olvashatóbb lenne.
7. **Több nyelv.** Ma minden magyar, a kód is.

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
