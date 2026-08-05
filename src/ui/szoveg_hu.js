// AGE OF THE CRYSTALS — MAGYAR SZÓTÁR (v0.20 előkészítés).
//
// ── MIÉRT EGY LAPOS OBJEKTUM, ÉS NEM BEÁGYAZOTT FÁK ───────────────────────
// Mert a feloldás a panelek `frissit()`-jéből fut: `_tar[kulcs]` EGY
// tulajdonság-olvasás, míg egy `sim.epulet.kozpont` fa bejárása három, plusz
// egy `split('.')`, ami képkockánként allokálna. A kulcs pontos szöveg, nem út.
//
// ── AMI ITT VAN, ÉS AMI MÉG NINCS ─────────────────────────────────────────
// A v0.20 előkészítése ez, nem a teljes fordítás. Ami BENNE van:
//   · a sim NÉV-TÁBLÁI teljes egészében (nyersanyag, korszak, alakzat, állás,
//     támadás, páncél, épület, technológia, térkép, nép, nehézség, egységtípus,
//     egyedi egység, meccs-vég) — ezek az enum-indexelt táblák, tehát ezek a
//     legveszélyesebbek: egy hiányzó sor `undefined` feliratot ad a képernyőre;
//   · a menü és a HUD felirat-készlete;
//   · a formázó minták (`fmt.*`), amikből ma nyers `+` fűzés van.
// Ami NINCS: a hét panel belső feliratai és a tanácsadó-sáv üzenetei — azok a
// panelek MOST is íródnak, más agentek keze alatt. Az a következő kör, és
// akkor lesz olcsó, ha a szerződés itt már áll.
//
// ── A KULCSNÉVTÉR ─────────────────────────────────────────────────────────
//   sim.*    a sim enumjaihoz tartozó nevek (a `szoveg_sim.js` köti az indexhez)
//   hud.*    a fejléc-sáv és a vezérlők
//   menu.*   a főmenü
//   kozos.*  általános szavak, amiket több panel is használ
//   fmt.*    HELYŐRZŐS minták — csak ezekben van `{0} {1} {2}`
//
// ⚠️ A RAGOZOTT ALAKOK SAJÁT KULCSOK. A `sim.korszak.hajnal` = „hajnal kora",
// a `sim.korszak.hajnal.hely` = „hajnal korában". Nem toldalékolunk futásidőben:
// a „hajnal kora" BIRTOKOS szerkezet, amire a naiv `+ 'ban'` „hajnal koraban"-t
// adna. A `panel_technologia_adat.js` fejléce ezt már egyszer leírta — itt
// ugyanaz a szabály, csak most a szótárban.

/** Magyar felirat-készlet. Kulcs → felirat vagy [egyes, többes] pár. */
export const HU = {
  // ── SIM: NYERSANYAG ─────────────────────────────────────────────────────
  'sim.nyers.etel': 'étel',
  'sim.nyers.fa': 'fa',
  'sim.nyers.ko': 'kő',
  'sim.nyers.kristaly': 'kristály',

  // ── SIM: KORSZAK (+ tárgyas és helyhatározós alak, lásd a fejlécet) ──────
  'sim.korszak.sotet': 'sötét kor',
  'sim.korszak.hajnal': 'hajnal kora',
  'sim.korszak.kristaly': 'kristály kora',
  'sim.korszak.feny': 'fény kora',
  'sim.korszak.sotet.targy': 'a sötét kort',
  'sim.korszak.hajnal.targy': 'a hajnal korát',
  'sim.korszak.kristaly.targy': 'a kristály korát',
  'sim.korszak.feny.targy': 'a fény korát',
  'sim.korszak.sotet.hely': 'a sötét korban',
  'sim.korszak.hajnal.hely': 'a hajnal korában',
  'sim.korszak.kristaly.hely': 'a kristály korában',
  'sim.korszak.feny.hely': 'a fény korában',

  // ── SIM: ALAKZAT ────────────────────────────────────────────────────────
  'sim.alakzat.negyzet': 'négyzet',
  'sim.alakzat.vonal': 'vonal',
  'sim.alakzat.ek': 'ék',
  'sim.alakzat.szort': 'szórt',

  // ── SIM: ÁLLÁS ──────────────────────────────────────────────────────────
  'sim.allas.agressziv': 'agresszív',
  'sim.allas.vedekezo': 'védekező',
  'sim.allas.tartas': 'tartás',
  'sim.allas.tuzszunet': 'tűzszünet',

  // ── SIM: TÁMADÁS- ÉS PÁNCÉLTÍPUS ────────────────────────────────────────
  'sim.tamadas.vago': 'vágó',
  'sim.tamadas.szuro': 'szúró',
  'sim.tamadas.nyil': 'nyíl',
  'sim.tamadas.ostrom': 'ostrom',
  'sim.pancel.gyalogos': 'gyalogos',
  'sim.pancel.tavolsagi': 'távolsági',
  'sim.pancel.lovas': 'lovas',
  'sim.pancel.epulet': 'épület',
  'sim.pancel.ostrom': 'ostrom',

  // ── SIM: ÉPÜLET ─────────────────────────────────────────────────────────
  'sim.epulet.kozpont': 'központ',
  'sim.epulet.raktar': 'raktár',
  'sim.epulet.fal': 'fal',
  'sim.epulet.kapu': 'kapu',
  'sim.epulet.haz': 'ház',
  'sim.epulet.laktanya': 'laktanya',
  'sim.epulet.ijaszda': 'íjászda',
  'sim.epulet.istallo': 'istálló',
  'sim.epulet.ostrommuhely': 'ostromműhely',
  'sim.epulet.torony': 'torony',
  'sim.epulet.piac': 'piac',

  // ── SIM: EGYSÉGTÍPUS ────────────────────────────────────────────────────
  'sim.tipus.munkas': 'munkás',
  'sim.tipus.landzsas': 'lándzsás',
  'sim.tipus.ijasz': 'íjász',
  'sim.tipus.lovag': 'lovag',
  'sim.tipus.ostromgep': 'ostromgép',
  'sim.tipus.egyedi': 'egyedi egység',

  // ── SIM: TECHNOLÓGIA ────────────────────────────────────────────────────
  'sim.tech.kovacsolas': 'kovácsolás',
  'sim.tech.illesztett_ij': 'illesztett íj',
  'sim.tech.pancelozas': 'páncélozás',
  'sim.tech.ekevas': 'ekevas',
  'sim.tech.talicska': 'talicska',
  'sim.tech.falazas': 'falazás',
  'sim.tech.leiras.kovacsolas': 'közelharci sebzés +1',
  'sim.tech.leiras.illesztett_ij': 'nyíl-sebzés +1',
  'sim.tech.leiras.pancelozas': 'minden egység páncélja +1',
  'sim.tech.leiras.ekevas': 'gyűjtés üteme +25 %',
  'sim.tech.leiras.talicska': 'a munkás 5-tel többet cipel',
  'sim.tech.leiras.falazas': 'az EZUTÁN épült házak életereje +25 %',

  // ── SIM: TÉRKÉP-PRESET ──────────────────────────────────────────────────
  'sim.terkep.nyilt_mezo': 'Nyílt mező',
  'sim.terkep.folyam': 'Folyam',
  'sim.terkep.erdoseg': 'Erdőség',
  'sim.terkep.hegyvidek': 'Hegyvidék',
  'sim.terkep.kristalymezo': 'Kristálymező',
  'sim.terkep.szarazfold': 'Szárazföld',
  'sim.terkep.leiras.nyilt_mezo':
    'Nyílt csatatér, kevés akadállyal. A lovasság itt van otthon, '
    + 'és a bázist nincs mi mögé rejteni.',
  'sim.terkep.leiras.folyam':
    'Széles folyó vágja ketté a pályát, néhány gázlóval. '
    + 'Aki a gázlót tartja, az szabja meg, mikor legyen csata.',
  'sim.terkep.leiras.erdoseg':
    'Sűrű erdő, szűk átjárókkal. A fa bőven van, a manőverezés viszont nem — '
    + 'az ostromgépnek itt kell utat vágni.',
  'sim.terkep.leiras.hegyvidek':
    'Sziklás magaslatok és szorosok. Kevés a járható út, '
    + 'de aki a szorost lezárja, sokáig kitart.',
  'sim.terkep.leiras.kristalymezo':
    'Kristályban gazdag pálya, a legjobb lelőhelyek középen. '
    + 'A gazdaság gyorsan felpörög — és a közép mindenkié.',
  'sim.terkep.leiras.szarazfold':
    'Se folyó, se tenger: összefüggő szárazföld, sok füves területtel. '
    + 'A leghosszabb, legnyugodtabb kezdés.',

  // ── SIM: NÉPEK ──────────────────────────────────────────────────────────
  'sim.civ.kristalykovacsok': 'Kristálykovácsok',
  'sim.civ.pusztai_lovasok': 'Pusztai lovasok',
  'sim.civ.erdei_vadaszok': 'Erdei vadászok',
  'sim.civ.hegyi_banyaszok': 'Hegyi bányászok',
  'sim.civ.folyami_kereskedok': 'Folyami kereskedők',
  'sim.civ.bastyaorzok': 'Bástyaőrzők',
  'sim.civ.fenyhozok': 'Fényhozók',
  'sim.civ.sivatagi_portyazok': 'Sivatagi portyázók',
  'sim.civ.leiras.kristalykovacsok':
    'A kristályt ők ismerik a legjobban, és a fegyvereiken meg is látszik: '
    + 'minden katonájuk eggyel vastagabb páncélt hord. A jó acél viszont drága.',
  'sim.civ.leiras.pusztai_lovasok':
    'Nyeregben nőttek fel: a lovagjuk olcsóbb és gyorsabban kiáll. '
    + 'Cserébe könnyű szerkezetekben laknak — az épületeik hamar leégnek.',
  'sim.civ.leiras.erdei_vadaszok':
    'Az erdő az otthonuk: gyorsan fát vágnak és jól lőnek. '
    + 'A kőfejtéshez viszont nincs türelmük.',
  'sim.civ.leiras.hegyi_banyaszok':
    'A hegy gyomrában dolgoznak: sokkal gyorsabban fejtik a követ és a kristályt, '
    + 'és olcsóbban építenek. A katonáikat viszont lassan képzik ki.',
  'sim.civ.leiras.folyami_kereskedok':
    'Kereskedő nép: a munkásaik többet cipelnek, és több embert bírnak el. '
    + 'A közelharchoz nem sok kedvük van.',
  'sim.civ.leiras.bastyaorzok':
    'Falak mögött élnek: az épületeik sokkal többet bírnak, a katonáik '
    + 'páncélosabbak. A gazdaságuk viszont végig lassabb.',
  'sim.civ.leiras.fenyhozok':
    'A fény papjai gyorsan sorakoztatnak, és sokkal nagyobb hadat tartanak el. '
    + 'A templomaik és a műhelyeik viszont sokba kerülnek.',
  'sim.civ.leiras.sivatagi_portyazok':
    'Portyázó nép: olcsó, sok katona és bőséges élelem. '
    + 'A védelemre viszont nem költenek — a páncéljuk gyenge.',

  // ── SIM: EGYEDI EGYSÉGEK (népenként egy) ────────────────────────────────
  'sim.egyedi.kristalykovacsok': 'Kristálypajzsos',
  'sim.egyedi.pusztai_lovasok': 'Sztyeppei portya',
  'sim.egyedi.erdei_vadaszok': 'Csapdaállító',
  'sim.egyedi.hegyi_banyaszok': 'Kőtörő',
  'sim.egyedi.folyami_kereskedok': 'Zsoldos',
  'sim.egyedi.bastyaorzok': 'Bástyaőr',
  'sim.egyedi.fenyhozok': 'Fénylovag',
  'sim.egyedi.sivatagi_portyazok': 'Homoki futó',
  'sim.egyedi.nincs': '—',

  // ── SIM: NEHÉZSÉG ───────────────────────────────────────────────────────
  'sim.nehezseg.konnyu': 'könnyű',
  'sim.nehezseg.kozepes': 'közepes',
  'sim.nehezseg.nehez': 'nehéz',

  // ── SIM: A MECCS VÉGE ───────────────────────────────────────────────────
  // A `VEG_OK.NINCS` sor a simben ÜRES string (a meccs még megy), és a
  // képernyőre sosem kerül. A szótárban mégis kap feliratot: az üres felirat
  // pont az a néma hiba, amit ez a réteg ki akar irtani.
  'sim.vegok.nincs': '—',
  'sim.vegok.kozpont': 'elvesztette a központját',
  'sim.vegok.feladas': 'feladta a meccset',

  // ── HUD ─────────────────────────────────────────────────────────────────
  'hud.nepesseg': 'népesség',
  'hud.jatekido': 'játékidő',
  'hud.korszak': 'korszak',
  'hud.sebesseg': 'sebesség',
  'hud.sebesseg.tipp': 'Játék sebessége — szóköz: szünet, +/−: fokozat',
  'hud.szunet': 'Szünet (szóköz)',
  'hud.nincs_hely': 'Elfogyott a hely — építs házat! (N)',
  'hud.nincs_felepitve': '(nincs felépítve)',
  'hud.sorban': 'sorban',
  'hud.kesz': 'kész',
  'hud.dolgozo_munkas': 'dolgozó munkás',
  'hud.elo': 'élő',
  'hud.elesett': 'elesett',

  // ── MENÜ ────────────────────────────────────────────────────────────────
  'menu.cim': 'Kristályháború',
  'menu.alcim':
    'Két nép, egy pálya, négy nyersanyag. A meccs beállításai a hálózaton is '
    + 'ezek lesznek — ezért nincs véletlen seed: amit itt beírsz, az épül fel.',
  'menu.fomenu': 'Főmenü',
  'menu.uj_jatek': 'Új játék',
  'menu.betoltes': 'Betöltés',
  'menu.beallitasok': 'Beállítások',
  'menu.nepvalasztas': 'Népválasztás',
  'menu.inditas': 'Indítás',
  'menu.tovabb_nepvalasztas': 'Tovább: népválasztás',
  'menu.mentes_folytatasa': 'Mentés folytatása',
  'menu.meccs_beallitasai': 'A meccs beállításai',
  'menu.seed': 'seed',
  'menu.seed.tipp': 'A pálya EBBŐL a számból épül. Ugyanaz a seed + ugyanaz a térkép = ugyanaz a pálya.',
  'menu.palyameret': 'pályaméret',
  'menu.terkep': 'térkép',
  'menu.nehezseg': 'nehézség',
  'menu.gepi_ellenfel': 'gépi ellenfél',
  'menu.egyseg_korlat': 'egység-korlát',
  'menu.egyseg_korlat.tipp': 'A két csapat EGYÜTTES felső korlátja — a memória ebből foglalódik.',
  'menu.sajat_nep': 'a te néped',
  'menu.ellenfel_nepe': 'az ellenfél népe',
  'menu.mentes': 'mentés',
  'menu.mentesbol': 'mentésből',
  'menu.nincs_mentes': 'Nincs mentés a böngésző tárolójában. Játék közben az F5 ment.',
  'menu.hangero': 'hangerő',
  'menu.kamera_sebesseg': 'kamera-sebesség',
  'menu.arnyekok': 'árnyékok',
  'menu.nyelv': 'nyelv',
  'menu.oldal_kek': '0 — kék',
  'menu.oldal_voros': '1 — vörös',
  'menu.ai_nincs': 'nem — új meccs',
  'menu.beallitasok.tipp':
    'Ezek GÉPENKÉNTI beállítások: nem részei a meccs-konfignak, és a '
    + 'hálózaton sem mennek át.',
  'menu.inditas.tipp':
    'Az indítás ezt a konfigurációt adja át — a világot a játék építi fel '
    + 'belőle, nem a menü.',
  'menu.meret.kicsi': 'kicsi',
  'menu.meret.kozepes': 'közepes',
  'menu.meret.nagy': 'nagy',
  'menu.meret.orias': 'óriás',
  'menu.meret.kicsi.leiras': 'Gyors meccs, korai összecsapással.',
  'menu.meret.kozepes.leiras': 'Van hely terjeszkedni, de nem sok.',
  'menu.meret.nagy.leiras': 'Az alapértelmezett pálya — ezen mérünk.',
  'menu.meret.orias.leiras': 'Hosszú meccs, két teljes gazdasággal.',

  // ── KÖZÖS SZAVAK ────────────────────────────────────────────────────────
  'kozos.igen': 'igen',
  'kozos.nem': 'nem',
  'kozos.be': 'be',
  'kozos.ki': 'ki',
  'kozos.kesz': 'kész',
  'kozos.elerheto': 'elérhető',
  'kozos.zarva': 'zárva',
  'kozos.epul': 'még épül',
  'kozos.epulet_kell': 'épület kell',
  'kozos.nem_telik': 'nem telik',
  'kozos.nincs_tovabb': 'nincs tovább',
  'kozos.kek': 'kék',
  'kozos.voros': 'vörös',
  'kozos.gyozelem': 'Győzelem',
  'kozos.vereseg': 'Vereség',
  'kozos.dontetlen': 'Döntetlen',
  'kozos.vissza': 'Vissza',
  'kozos.megse': 'Mégse',

  // ── FORMÁZÓ MINTÁK ──────────────────────────────────────────────────────
  // Csak ezekben van helyőrző. A `{0} {1} {2}` a SZÓRENDET oldja meg: az angol
  // oldal ugyanezt az adatot más sorrendben teheti a mondatba.
  'fmt.mp': '{0} mp',
  'fmt.nepesseg': '{0} / {1}',
  'fmt.korszak_hatra': '{0} → {1} mp',
  // ⚠️ SZÁNDÉKOS SORREND-CSERE az angol oldalon: magyarul a „sorban" vezet, az
  // angol természetes alakja a „3 done, 5 queued". A helyőrző-HALMAZ egyezik,
  // a sorrend nem — pontosan ezért nem a sorrendet ellenőrzi a szonda.
  'fmt.sorban_kesz': 'sorban: {0} (kész: {1})',
  'fmt.kijelolve': '{0} kijelölve',
  'fmt.sorba_allitva': '{0} — sorba állítva',
  'fmt.nem_kepez': '{0} nem képez egységet',
  'fmt.kutatas_indul': '{0} — kutatás indul ({1})',
  'fmt.elobb_korszak': 'Előbb el kell érned {0}, most {1} jársz.',
  'fmt.nincs_eleg': 'Nincs elég nyersanyagod: {0} hiányzik.',
  'fmt.kell_kesz_epulet': 'Kell hozzá egy kész {0} — még egy sincs.',
  'fmt.meg_epul': '{0} épül, de még nem készült el.',
  'fmt.uj_korszak': 'Új korszakba léptél: {0} ({1}. a négyből)',
  'fmt.korszak_indul': 'Megindult a korszakváltás: {0} — {1}',
  'fmt.vege': 'A meccs véget ért — {0} {1}.',

  // ── SZÁMHOZ KÖTÖTT MINTÁK (`szT`) ───────────────────────────────────────
  // Magyarul a számnév után EGYES szám áll („3 egység"), tehát itt egy alak
  // elég. Angolul kettő kell — a `szoveg_en.js` ugyanezekre a kulcsokra
  // `[egyes, többes]` párt ad. A hívónak ez nem tűnik fel: `szT()` mindkettőt
  // kezeli, és pont ezért nem a panelben van a döntés.
  'fmt.egyseg_db': '{0} egység',
  'fmt.epulet_db': '{0} épület',
  'fmt.masodperc_db': '{0} másodperc',
};
