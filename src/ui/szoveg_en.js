// AGE OF THE CRYSTALS — ENGLISH DICTIONARY (v0.20 groundwork).
//
// ── MIÉRT ANGOL A SZÖVEG, ÉS MIÉRT MAGYAR A KOMMENT ───────────────────────
// A `PLAN.md` v0.19-es szakasza egy mondatban dönti el: „A KÓD magyar marad —
// a SZÖVEG lesz kétnyelvű." Ez a fájl a szöveg, tehát angol; a fejléce a kód
// része, tehát magyar, mint minden más fejléc a projektben.
//
// ── A SZERZŐDÉS: UGYANAZ A KULCS-KÉSZLET, MÁS ALAK ────────────────────────
// A `tools/szoveg_szonda.mjs` első gátja az, hogy ez a fájl és a
// `szoveg_hu.js` PONTOSAN ugyanazokat a kulcsokat tartalmazza. Árva kulcs
// egyik oldalon sem lehet: egy csak-magyar kulcs angol felületen «kulcs.neve»
// jelölőt ír a képernyőre, egy csak-angol kulcs pedig halott szöveg, amit
// senki sem lát — és a kettő közül a második a rosszabb, mert nem is látszik.
//
// ── AMI NYELVENKÉNT MÁS ALAKÚ, ÉS EZ NEM HIBA ─────────────────────────────
// 1. SZÓREND. A `fmt.sorban_kesz` magyarul „sorban: 5 (kész: 3)", angolul
//    „3 done, 5 queued" — ugyanaz a két érték, fordított sorrendben. A szonda
//    ezért a helyőrzők HALMAZÁT veti össze, nem a sorrendjüket.
// 2. TÖBBES SZÁM. A magyar számnév után egyes szám áll („3 egység"), az angol
//    után többes („3 units"). Ezért az `fmt.*_db` kulcsok itt `[egyes, többes]`
//    párok, magyarul viszont egyetlen string. A `szT()` mindkettőt kezeli.
// 3. HATÁROZOTT NÉVELŐ. A magyar „a/az" a KÖVETKEZŐ szó hangzójától függ
//    (`civ_valaszto_adat.js` `_nevelo()`), az angol „the" nem. Ezért a magyar
//    oldalon a névelő része a ragozott kulcsnak (`sim.korszak.*.targy`), az
//    angolon egyszerűen bele van írva a mondatba.
//
// ── FORDÍTÁSI DÖNTÉSEK, AMIK NEM MAGUKTÓL ÉRTETŐDŐK ───────────────────────
// · A NÉP- és EGYEDI EGYSÉG-nevek LEFORDÍTVA szerepelnek, nem átírva: a
//   „Kristálykovácsok" angol játékosnak semmit sem mond, a „Crystalsmiths"
//   viszont ugyanazt a képet adja, mint a magyar az itthoninak.
// · A TÉRKÉP-presetek neve szintén fordítva („Nyílt mező" → „Open Field"),
//   mert a menüben választani kell közülük, nem azonosítani.
// · A „korszak" itt „age", nem „era": az AoE-hagyomány szava, és a játékos
//   pontosan azt a rendszert várja mögé.

/** English label set. Key → label, or [singular, plural] pair. */
export const EN = {
  // ── SIM: RESOURCES ──────────────────────────────────────────────────────
  'sim.nyers.etel': 'food',
  'sim.nyers.fa': 'wood',
  'sim.nyers.ko': 'stone',
  'sim.nyers.kristaly': 'crystal',

  // ── SIM: AGES (+ the two Hungarian inflected forms, see the header) ──────
  'sim.korszak.sotet': 'Dark Age',
  'sim.korszak.hajnal': 'Dawn Age',
  'sim.korszak.kristaly': 'Crystal Age',
  'sim.korszak.feny': 'Age of Light',
  'sim.korszak.sotet.targy': 'the Dark Age',
  'sim.korszak.hajnal.targy': 'the Dawn Age',
  'sim.korszak.kristaly.targy': 'the Crystal Age',
  'sim.korszak.feny.targy': 'the Age of Light',
  'sim.korszak.sotet.hely': 'the Dark Age',
  'sim.korszak.hajnal.hely': 'the Dawn Age',
  'sim.korszak.kristaly.hely': 'the Crystal Age',
  'sim.korszak.feny.hely': 'the Age of Light',

  // ── SIM: FORMATIONS ─────────────────────────────────────────────────────
  'sim.alakzat.negyzet': 'box',
  'sim.alakzat.vonal': 'line',
  'sim.alakzat.ek': 'wedge',
  'sim.alakzat.szort': 'scattered',

  // ── SIM: STANCES ────────────────────────────────────────────────────────
  'sim.allas.agressziv': 'aggressive',
  'sim.allas.vedekezo': 'defensive',
  'sim.allas.tartas': 'hold ground',
  'sim.allas.tuzszunet': 'no attack',

  // ── SIM: ATTACK AND ARMOUR CLASSES ──────────────────────────────────────
  'sim.tamadas.vago': 'slashing',
  'sim.tamadas.szuro': 'piercing',
  'sim.tamadas.nyil': 'arrow',
  'sim.tamadas.ostrom': 'siege',
  'sim.pancel.gyalogos': 'infantry',
  'sim.pancel.tavolsagi': 'ranged',
  'sim.pancel.lovas': 'cavalry',
  'sim.pancel.epulet': 'building',
  'sim.pancel.ostrom': 'siege',

  // ── SIM: BUILDINGS ──────────────────────────────────────────────────────
  'sim.epulet.kozpont': 'town centre',
  'sim.epulet.raktar': 'storehouse',
  'sim.epulet.fal': 'wall',
  'sim.epulet.kapu': 'gate',
  'sim.epulet.haz': 'house',
  'sim.epulet.laktanya': 'barracks',
  'sim.epulet.ijaszda': 'archery range',
  'sim.epulet.istallo': 'stable',
  'sim.epulet.ostrommuhely': 'siege workshop',
  'sim.epulet.torony': 'tower',
  'sim.epulet.piac': 'market',

  // ── SIM: UNIT TYPES ─────────────────────────────────────────────────────
  'sim.tipus.munkas': 'worker',
  'sim.tipus.landzsas': 'spearman',
  'sim.tipus.ijasz': 'archer',
  'sim.tipus.lovag': 'knight',
  'sim.tipus.ostromgep': 'siege engine',
  'sim.tipus.egyedi': 'unique unit',

  // ── SIM: TECHNOLOGIES ───────────────────────────────────────────────────
  'sim.tech.kovacsolas': 'forging',
  'sim.tech.illesztett_ij': 'composite bow',
  'sim.tech.pancelozas': 'plating',
  'sim.tech.ekevas': 'ploughshare',
  'sim.tech.talicska': 'wheelbarrow',
  'sim.tech.falazas': 'masonry',
  'sim.tech.leiras.kovacsolas': 'melee damage +1',
  'sim.tech.leiras.illesztett_ij': 'arrow damage +1',
  'sim.tech.leiras.pancelozas': 'every unit gets +1 armour',
  'sim.tech.leiras.ekevas': 'gathering rate +25 %',
  'sim.tech.leiras.talicska': 'workers carry 5 more',
  'sim.tech.leiras.falazas': 'houses built FROM NOW ON get +25 % hit points',

  // ── SIM: MAP PRESETS ────────────────────────────────────────────────────
  'sim.terkep.nyilt_mezo': 'Open Field',
  'sim.terkep.folyam': 'Great River',
  'sim.terkep.erdoseg': 'Deep Forest',
  'sim.terkep.hegyvidek': 'Highlands',
  'sim.terkep.kristalymezo': 'Crystal Fields',
  'sim.terkep.szarazfold': 'Mainland',
  'sim.terkep.leiras.nyilt_mezo':
    'An open battlefield with few obstacles. Cavalry is at home here, '
    + 'and there is nothing to hide your base behind.',
  'sim.terkep.leiras.folyam':
    'A wide river cuts the map in two, with a handful of fords. '
    + 'Whoever holds a ford decides when the battle happens.',
  'sim.terkep.leiras.erdoseg':
    'Dense woods with narrow passes. Wood is plentiful, manoeuvring is not — '
    + 'this is where siege engines cut the roads.',
  'sim.terkep.leiras.hegyvidek':
    'Rocky heights and gorges. Few roads are passable, '
    + 'but whoever seals a gorge holds it for a long time.',
  'sim.terkep.leiras.kristalymezo':
    'A crystal-rich map with the best deposits in the middle. '
    + 'Economies spin up fast — and the centre belongs to everyone.',
  'sim.terkep.leiras.szarazfold':
    'No river, no sea: one connected landmass with plenty of grass. '
    + 'The longest, calmest opening.',

  // ── SIM: CIVILISATIONS ──────────────────────────────────────────────────
  'sim.civ.kristalykovacsok': 'Crystalsmiths',
  'sim.civ.pusztai_lovasok': 'Steppe Riders',
  'sim.civ.erdei_vadaszok': 'Forest Hunters',
  'sim.civ.hegyi_banyaszok': 'Mountain Miners',
  'sim.civ.folyami_kereskedok': 'River Traders',
  'sim.civ.bastyaorzok': 'Bastion Wardens',
  'sim.civ.fenyhozok': 'Lightbringers',
  'sim.civ.sivatagi_portyazok': 'Desert Raiders',
  'sim.civ.leiras.kristalykovacsok':
    'Nobody knows crystal like they do, and it shows on their weapons: '
    + 'every soldier wears one step heavier armour. Good steel is expensive, though.',
  'sim.civ.leiras.pusztai_lovasok':
    'Born in the saddle: their knights are cheaper and reach the field faster. '
    + 'In exchange they live in light structures — their buildings burn quickly.',
  'sim.civ.leiras.erdei_vadaszok':
    'The forest is their home: they fell wood fast and shoot well. '
    + 'They have no patience for quarrying stone.',
  'sim.civ.leiras.hegyi_banyaszok':
    'They work inside the mountain: far faster at stone and crystal, '
    + 'and they build cheaper. Their soldiers, however, train slowly.',
  'sim.civ.leiras.folyami_kereskedok':
    'A trading people: their workers carry more, and they support more mouths. '
    + 'They have little appetite for melee.',
  'sim.civ.leiras.bastyaorzok':
    'They live behind walls: their buildings take far more punishment and their '
    + 'soldiers are better armoured. Their economy stays slower throughout.',
  'sim.civ.leiras.fenyhozok':
    'The priests of light muster quickly and support a much larger army. '
    + 'Their temples and workshops, however, cost dearly.',
  'sim.civ.leiras.sivatagi_portyazok':
    'A raiding people: cheap, numerous soldiers and plentiful food. '
    + 'They do not spend on defence — their armour is weak.',

  // ── SIM: UNIQUE UNITS (one per civilisation) ────────────────────────────
  'sim.egyedi.kristalykovacsok': 'Crystal Shieldbearer',
  'sim.egyedi.pusztai_lovasok': 'Steppe Raider',
  'sim.egyedi.erdei_vadaszok': 'Trapsetter',
  'sim.egyedi.hegyi_banyaszok': 'Stonebreaker',
  'sim.egyedi.folyami_kereskedok': 'Mercenary',
  'sim.egyedi.bastyaorzok': 'Bastion Guard',
  'sim.egyedi.fenyhozok': 'Light Knight',
  'sim.egyedi.sivatagi_portyazok': 'Sand Runner',
  'sim.egyedi.nincs': '—',

  // ── SIM: DIFFICULTY ─────────────────────────────────────────────────────
  'sim.nehezseg.konnyu': 'easy',
  'sim.nehezseg.kozepes': 'medium',
  'sim.nehezseg.nehez': 'hard',

  // ── SIM: END OF MATCH ───────────────────────────────────────────────────
  'sim.vegok.nincs': '—',
  'sim.vegok.kozpont': 'lost their town centre',
  'sim.vegok.feladas': 'resigned the match',

  // ── HUD ─────────────────────────────────────────────────────────────────
  'hud.nepesseg': 'population',
  'hud.jatekido': 'match time',
  'hud.korszak': 'age',
  'hud.sebesseg': 'speed',
  'hud.sebesseg.tipp': 'Game speed — space: pause, +/−: step',
  'hud.szunet': 'Pause (space)',
  'hud.nincs_hely': 'Out of population space — build a house! (N)',
  'hud.nincs_felepitve': '(not built yet)',
  'hud.sorban': 'in queue',
  'hud.kesz': 'done',
  'hud.dolgozo_munkas': 'working villagers',
  'hud.elo': 'alive',
  'hud.elesett': 'lost',

  // ── MENU ────────────────────────────────────────────────────────────────
  'menu.cim': 'Crystal War',
  'menu.alcim':
    'Two peoples, one map, four resources. These match settings are the ones '
    + 'that go over the network too — that is why there is no random seed: '
    + 'what you type here is what gets built.',
  'menu.fomenu': 'Main menu',
  'menu.uj_jatek': 'New game',
  'menu.betoltes': 'Load',
  'menu.beallitasok': 'Settings',
  'menu.nepvalasztas': 'Choose a people',
  'menu.inditas': 'Start',
  'menu.tovabb_nepvalasztas': 'Next: choose a people',
  'menu.mentes_folytatasa': 'Continue save',
  'menu.meccs_beallitasai': 'Match settings',
  'menu.seed': 'seed',
  'menu.seed.tipp': 'The map is built FROM this number. Same seed + same map = same terrain.',
  'menu.palyameret': 'map size',
  'menu.terkep': 'map',
  'menu.nehezseg': 'difficulty',
  'menu.gepi_ellenfel': 'computer opponent',
  'menu.egyseg_korlat': 'unit cap',
  'menu.egyseg_korlat.tipp': 'The COMBINED cap for both teams — memory is reserved from it.',
  'menu.sajat_nep': 'your people',
  'menu.ellenfel_nepe': "the opponent's people",
  'menu.mentes': 'save',
  'menu.mentesbol': 'from save',
  'menu.nincs_mentes': 'No save in browser storage. Press F5 during a match to save.',
  'menu.hangero': 'volume',
  'menu.kamera_sebesseg': 'camera speed',
  'menu.arnyekok': 'shadows',
  'menu.nyelv': 'language',
  'menu.oldal_kek': '0 — blue',
  'menu.oldal_voros': '1 — red',
  'menu.ai_nincs': 'no — new match',
  'menu.beallitasok.tipp':
    'These are PER-MACHINE settings: they are not part of the match config, '
    + 'and they do not travel over the network.',
  'menu.inditas.tipp':
    'Starting hands over this configuration — the world is built from it by '
    + 'the game, not by the menu.',
  'menu.meret.kicsi': 'small',
  'menu.meret.kozepes': 'medium',
  'menu.meret.nagy': 'large',
  'menu.meret.orias': 'huge',
  'menu.meret.kicsi.leiras': 'A quick match with an early clash.',
  'menu.meret.kozepes.leiras': 'Room to expand, but not much of it.',
  'menu.meret.nagy.leiras': 'The default map — this is what we measure on.',
  'menu.meret.orias.leiras': 'A long match with two full economies.',

  // ── COMMON WORDS ────────────────────────────────────────────────────────
  'kozos.igen': 'yes',
  'kozos.nem': 'no',
  'kozos.be': 'on',
  'kozos.ki': 'off',
  'kozos.kesz': 'done',
  'kozos.elerheto': 'available',
  'kozos.zarva': 'locked',
  'kozos.epul': 'still building',
  'kozos.epulet_kell': 'building required',
  'kozos.nem_telik': 'cannot afford',
  'kozos.nincs_tovabb': 'no further',
  'kozos.kek': 'blue',
  'kozos.voros': 'red',
  'kozos.gyozelem': 'Victory',
  'kozos.vereseg': 'Defeat',
  'kozos.dontetlen': 'Draw',
  'kozos.vissza': 'Back',
  'kozos.megse': 'Cancel',

  // ── FORMAT PATTERNS ─────────────────────────────────────────────────────
  'fmt.mp': '{0} s',
  'fmt.nepesseg': '{0} / {1}',
  'fmt.korszak_hatra': '{0} → {1} s',
  // ⚠️ DELIBERATE ORDER SWAP against the Hungarian side: „sorban: 5 (kész: 3)"
  // reads naturally as „3 done, 5 queued" in English. Same placeholder SET,
  // different order — this is the pair that proves the mechanism.
  'fmt.sorban_kesz': '{1} done, {0} queued',
  'fmt.kijelolve': 'selected: {0}',
  'fmt.sorba_allitva': '{0} — queued',
  'fmt.nem_kepez': 'the {0} trains no units',
  'fmt.kutatas_indul': 'researching {0} ({1})',
  'fmt.elobb_korszak': 'You need to reach {0} first; you are in {1}.',
  'fmt.nincs_eleg': 'Not enough resources: {0} short.',
  'fmt.kell_kesz_epulet': 'Needs a finished {0} — you have none.',
  'fmt.meg_epul': 'The {0} is still under construction.',
  'fmt.uj_korszak': 'You advanced to a new age: {0} ({1} of four)',
  'fmt.korszak_indul': 'Age advance started: {0} — {1}',
  'fmt.vege': 'The match is over — {0} {1}.',

  // ── COUNT-DRIVEN PATTERNS (`szT`) ───────────────────────────────────────
  // English needs both forms; Hungarian gets one string for the same key.
  'fmt.egyseg_db': ['{0} unit', '{0} units'],
  'fmt.epulet_db': ['{0} building', '{0} buildings'],
  'fmt.masodperc_db': ['{0} second', '{0} seconds'],
};
