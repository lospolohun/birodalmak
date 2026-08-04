# PORTAL HUB TYCOON

> Te vagy egy dimenziók közötti átszállóállomás igazgatója. A kapukon
> szellemek, trollok, boszorkányok és lebegő medúzák érkeznek — mindegyik
> máshogy viselkedik, mindegyiknek célja van, és mindegyiknek fogy a türelme.
> Építsd meg a világ legnagyobb dimenziókapu-állomását.

Böngészőben futó 3D tycoon. Nincs telepítés, nincs külső fájl: a `dist/`
bemásolható bárhová, és elindul.

```bash
npm ci
npm run portal:dev      # → http://localhost:5274
```

---

## Mit csinálsz benne

**Építesz.** Padlót húzol, épületeket raksz le, emeletet nyitsz, mozgólépcsőt
és teleport liftet építesz. Húsz-egynéhány épülettípus, mind saját sziluettel.

**Kaput nyitsz.** Hét dimenzió és három közlekedési csatorna (vasút,
léghajó-kikötő, űrkapu). Mindegyik más fajmixet, más díjat és más kockázatot
hoz. A kapuk romlanak; a csatornák nem.

**Embereket veszel fel.** Kilenc szakma. A személyzet nélküli épület 15 %-on
üzemel — rosszabb, mint a semmi.

**Döntesz.** A hét fejezetes történetben kétszer kell választanod, és a
választás visszafordíthatatlan: amit lezársz, az nem nyílik ki többé. A
győzelem után korszakok jönnek, mindegyik nehezebb az előzőnél.

## Amit érdemes tudni az első órában

| | |
|---|---|
| **A türelem a valuta** | Akinek elfogy, dühösen távozik — és a hírnév a TÁVOZÓK hangulatából épül. A hírnév szabja meg, hányan jönnek. |
| **A kapacitás a hírnév** | A pénz önmagában nem hírnév. Ha csúszik lefelé, nem drágább kapu kell, hanem több pult. |
| **Az áramszünet néma** | Nem hibaüzenettel jelentkezik, csak azzal, hogy minden lassabb. Ha a felső sávban a villám piros, energiamagot építs. |
| **A vám a rejtett szűk keresztmetszet** | Négy vámköteles világ forgalmát egyetlen pult nem viszi el. |
| **A kapu összeomlik** | 100 % instabilitásnál. A portálkarbantartó + mérnök MINDEN kaput karbantart, tehát egy központi műhely az egész hálózatot tartja. |
| **A gödörből nehéz kijönni** | Ha a hírnév 20 alá esik, az építkezés MÉLYÍTI a gödröt: több vendéget hív ugyanabba a sorba. Ilyenkor emelj díjat vagy zárj be egy kaput, amíg a kapacitás utoléri magát. |

Ha elakadsz: **💡 Tanácsadó** panel. Csak olyat mond, ami mérhető, és amire
van válaszlépés.

## Irányítás

| | |
|---|---|
| bal gomb | építés / vizsgálat |
| jobb gomb húzva | tolás |
| középső gomb | forgatás |
| görgő | nagyítás a kurzor alatti pontra |
| W A S D · Q E | mozgás · forgatás |
| R / F | egy szinttel feljebb / lejjebb |
| szóköz | szünet |
| 1–4 | sebesség |
| Esc | eszköz elengedése |

## Mentés

A mentés **nem** a világ pillanatképe, hanem a **seed + a parancsnaplód**.
Betöltéskor a világ újrajátszódik belőle — ezért tart pár másodpercig, és
ezért lesz bitre ugyanaz. Automata mentés minden nap végén, plusz három kézi
hely. A `?seed=…` paraméterrel bármelyik világ újraindítható; hibajelentéshez
ezt írd le.

---

## Fejlesztőknek

```
  src/mag/     config, determinizmus-biztos matek, seedelt véletlen
  src/sim/     A VILÁG. Nincs benne three, DOM, Math.random, Date.now.
  src/render/  three.js. Csak OLVASSA a simet.
  src/ui/      DOM. Csak OLVASSA a simet.
  src/audio/   WebAudio. Csak OLVASSA a simet.
  src/fo.js    huzalozás + fix lépésközű hurok
```

**A render, a felület és a hang sosem ír a simbe.** Ha hatni akarnak a
világra, parancsot adnak. Ebből következik a mentés, az újrajátszhatóság és
az, hogy a felület bármikor átírható anélkül, hogy a gazdaság elcsúszna.

### Kapuk

```bash
npm run portal:det       # determinizmus + működés + végigjátszás (11 vizsgálat)
npm run portal:mertan    # 3D-mértan: keret és sziluett-ujjlenyomat
npm run portal:hang      # hangrendszer: katalógus, jelszint, böngésző
npm run portal:bongeszo  # elindul-e, működik-e, ment-e
npm run portal:latvany   # látvány: napszak, áttetsző szintek, részecskék
npm run portal:kiadas    # kiadhatóság: verzió, nyomok, külső hivatkozás
npm run portal:szonda    # mind egyben
node portal/tools/egyensuly.mjs 60000 8   # egyensúly-mérés (percek)
```

⚠️ **FPS-t a felhőben nem lehet mérni** (nincs GPU, a Chrome SwiftShaderre
esik). Az `npm run portal:kep` képei geometriát és színt mutatnak, sebességet
nem. Az FPS-mérés valódi GPU-s gép dolga.

Részletek: [`PORTAL_TERV.md`](PORTAL_TERV.md) ·
mérések: [`qa/`](qa/) · egyensúly: [`qa/EGYENSULY.md`](qa/EGYENSULY.md)
