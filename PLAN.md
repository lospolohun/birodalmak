# AGE OF THE CRYSTALS — verzió-terv

A cél: **AoE4-léptékű RTS lockstep multiplayerrel.** A döntés tudatos, a
kockázatokkal együtt (lásd „Őszinte kockázatok" alul).

Minden lépcső saját kiadási kapuval zárul — a minta a TELEPESEK
`tools/kiadas_ellenorzo.mjs`-e (67 elvárás).

| Verzió | Tartalom | Állapot |
|---|---|---|
| **v0.1** | **Motor-szonda.** 1600 animált egység, áramlási mező, ütközés-kerülés, fix-tickes determinisztikus sim, determinizmus-szonda, réteg-bontó FPS-mérés. **GO/NO-GO döntés.** | **kész — GO** (`qa/V0.1_EREDMENY.md`) |
| **v0.2** | Irányítás: keret-kijelölés, Ctrl-csoportok, attack-move, alakzatok, állás-parancsok — mind a parancs-soron át | **kész** (`qa/V0.2_EREDMENY.md`) — FPS-mérés az iMac-en még hátravan |
| v0.3 | Gazdaság: 4 nyersanyag (étel, fa, kő, **kristály**), munkás-AI, lerakatok, korszakváltás | |
| v0.4 | Harc: páncéltípusok, repülési idejű lövedékek, fegyvernem-ellensúlyok, ostrom, fal/kapu, beszállásolás | |
| v0.5 | Épület-roster + technológiafa → **első játszható build** | |
| v0.6 | AI ellenfél 3 nehézséggel, build orderekkel, felderítéssel | |
| v0.7 | Hadi köd (GPU-textúra), minimap, mentés/betöltés, rendes HUD | |
| **v0.8** | **Netcode:** WebSocket relay, lockstep, bemenet-késleltetés simítás, újracsatlakozás, desync-detektor az állapot-hashre | |
| v0.9 | 8 aszimmetrikus civilizáció + egyedi egységek | |
| v0.10 | Térkép-presetek, hang, kampány | |
| v1.0 | Kiadási kapu, i18n (hu/en/de), PWA, deploy | |

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
