# AGE OF THE CRYSTALS — verzió-terv

A cél: **AoE4-léptékű RTS lockstep multiplayerrel.** A döntés tudatos, a
kockázatokkal együtt (lásd „Őszinte kockázatok" alul).

Minden lépcső saját kiadási kapuval zárul — a minta a TELEPESEK
`tools/kiadas_ellenorzo.mjs`-e (67 elvárás).

| Verzió | Tartalom | Állapot |
|---|---|---|
| **v0.1** | **Motor-szonda.** 1600 animált egység, áramlási mező, ütközés-kerülés, fix-tickes determinisztikus sim, determinizmus-szonda, réteg-bontó FPS-mérés. **GO/NO-GO döntés.** | **kész — GO** (`qa/V0.1_EREDMENY.md`) |
| **v0.2** | Irányítás: keret-kijelölés, Ctrl-csoportok, attack-move, alakzatok, állás-parancsok — mind a parancs-soron át | **kész** (`qa/V0.2_EREDMENY.md`) — FPS-mérés az iMac-en még hátravan |
| **v0.3** | Gazdaság: 4 nyersanyag (étel, fa, kő, **kristály**), munkás-AI, lerakatok, korszakváltás | **kész** (`qa/V0.3_EREDMENY.md`) — FPS-mérés az iMac-en még hátravan |
| **v0.4** | Harc: páncéltípusok, repülési idejű lövedékek, fegyvernem-ellensúlyok, ostrom, fal/kapu, beszállásolás | **részben kész** — lásd alább |
| v0.5 | Épület-roster + technológiafa → **első játszható build** | |
| v0.6 | AI ellenfél 3 nehézséggel, build orderekkel, felderítéssel | |
| v0.7 | Hadi köd (GPU-textúra), minimap, mentés/betöltés, rendes HUD | |
| **v0.8** | **Netcode:** WebSocket relay, lockstep, bemenet-késleltetés simítás, újracsatlakozás, desync-detektor az állapot-hashre | |
| v0.9 | 8 aszimmetrikus civilizáció + egyedi egységek | |
| v0.10 | Térkép-presetek, hang, kampány | |
| v1.0 | Kiadási kapu, i18n (hu/en/de), PWA, deploy | |

## A v0.4 állása

A verzió szakaszokra van bontva, és a kész szakaszok külön-külön is megállnak:

| szakasz | tartalom | állapot |
|---|---|---|
| v0.4/1 | életerő, páncéltípusok, fegyvernem-ellensúlyok, halál | **kész** |
| v0.4/2 | repülési idejű lövedékek | **kész** |
| v0.4/3 | épület-életerő, épületek elleni harc | **kész** |
| v0.4/4 | fal és kapu | **kész** (a kapu még nem csapatfüggő) |
| v0.4/6 | ostrom-EGYSÉG (új egységtípus) | hátravan |
| v0.4/5 | beszállásolás | hátravan |

Az épület-oldal kész: az épületnek van életereje, a támadó menetben lévő sereg
célba veszi az ellenséges épületeket (élő katona MINDIG előbbre való), a fal
zárja a celláit, a kapu nyitható. Az ostrom-EGYSÉG viszont még hiányzik — ahhoz
új egységtípus kell, ami a `units3d.js` figura-építését is érinti, tehát nem
puszta adatsor.

⚠️ **A kapu még nem csapatfüggő:** nyitva MINDENKINEK nyitva van. Ennek oka
szerkezeti — az áramlási mező a `racs.jarhato` EGY közös rétegéből épül, és a
csapatonként eltérő járhatóság csapatonként külön mezőkészletet igényelne. Ez a
v0.5 dolga, a roster mellett.

A beszállásolás az `elo` jelzőre épülhet: a beszállásolt egység ugyanúgy kiesik
a hasítótáblából, mint a halott, csak visszahozhatóan.

**Ismert adósság a v0.5 felé:** a halott slot nem szabadul fel. Amint egységet
képezni is lehet, kell a slot-újrahasznosítás, ahhoz pedig **generációs
számláló** — az egység-index a sim legelterjedtebb hivatkozása (`celEgyseg`,
munkás-célok, kijelölés, Ctrl-csoportok), és az elavult hivatkozásnak
elkaphatónak kell lennie, nem csak elromlania.

## Miért ebben a sorrendben

A **determinizmus és a parancs-sor a v0.1-ben** van, nem a v0.8-ban. Ez a terv
legfontosabb döntése. A lockstep nem hálózati funkció, hanem a szimuláció
tulajdonsága: ha a v0.7-ig „normálisan" írnánk a simet, a v0.8 nem netcode-
írás lenne, hanem az egész sim újraírása. Így viszont a v0.8-ban a hálózat
tényleg csak szállítás: ugyanaz a parancs-sor érkezik, csak távolról.

## Őszinte kockázatok

- **A v0.8 önmagában nagy.** A relay-szerver külön futó Node-processzt igényel
  (a SkyNet PHP-je nem elég), tehát VPS vagy legalább egy állandó portot kapó
  szolgáltatás kell hozzá.
- **A v0.9 nem mérnöki munka, hanem balansz.** 8 civ kiegyensúlyozásához
  játszani kell — ez lesz a leghosszabb szakasz, és nem gyorsítható agentekkel.
- **A determinizmus törékeny.** Egyetlen figyelmetlen `Math.sin` a sim-ben
  elrontja. Ezért a szonda statikusan is szűr, és a kapu része lesz.

## Ami a TELEPESEK-ből átjön

Render-módszertan (instancing, LOD, chunkolás), a szonda/mérőpad-kultúra, a
kiadási kapu, a deploy-lánc, az i18n-szerkezet. Ami **nem** jön át: a
szimuláció — az láncalapú gazdaságra készült, nem 200-pop csatákra.
