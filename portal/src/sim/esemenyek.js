// PORTAL HUB TYCOON — ESEMÉNYEK.
//
// ── MIÉRT VAN EZ A FÁJL ───────────────────────────────────────────────────
// „A játék lényege, hogy folyamatosan történjen valami." Ez a mondat egy
// csapda: ha az események csak véletlen büntetések, a játékos megtanulja
// utálni őket, és pufferre optimalizál. Ezért itt minden eseménynek van
// KÖVETKEZMÉNYE ÉS VÁLASZA — vagy azért, mert az állomás felkészültsége
// eldönti a kimenetet (van-e őr, orvos, hőforrás), vagy azért, mert a
// játékos VÁLASZT, és a választás pénzbe kerül.
//
// A `feltetel` biztosítja, hogy ne kapjon sárkányt az, akinek egy kapuja van.
// A `suly` a relatív gyakoriság — ez a hangolás fő fogantyúja.
//
// ⚠️ MINDEN VÉLETLEN a `sim.rnd`-ből jön. Egy `Math.random()` itt azt
// jelentené, hogy ugyanaz a mentés két különböző történetet játszik le.

export const ESEMENYEK = [
  {
    kod: 'instabil_kapu', nev: 'Instabil kapu', ikon: '🌀', suly: 10, hossz: 900,
    feltetel: (s) => s.nyitottDimenziok().length > 0,
    leiras: 'Az egyik kapu remegni kezdett. Az instabilitása háromszoros ütemben nő, amíg le nem csillapodik.',
    indit(s, e) {
      const lista = s.nyitottDimenziok();
      e.dim = lista[Math.floor(s.rnd() * lista.length)].idx;
      e.cim = `Instabil kapu: ${s.dimenzioNev(e.dim)}`;
    },
    tick(s, e) { s.dimenziok[e.dim].instabilitas += 0.35 * s.eventEro(); },
    valaszok: [
      {
        cim: 'Vészhangolás (−1800)', leiras: 'A mérnökök azonnal lecsillapítják.',
        ar: 1800,
        hatas(s, e) { s.dimenziok[e.dim].instabilitas = Math.max(0, s.dimenziok[e.dim].instabilitas - 350); e.hossz = 0; },
      },
      { cim: 'Hadd remegjen', leiras: 'Nem költünk rá. Vállaljuk a kockázatot.', ar: 0, hatas() {} },
    ],
  },
  {
    kod: 'aramszunet', nev: 'Mágikus áramszünet', ikon: '🔌', suly: 8, hossz: 700,
    feltetel: (s) => s.energiaTermeles > 0,
    leiras: 'Az energiamagok fele kihagy. Amíg tart, minden szolgáltatás vánszorog.',
    indit(s, e) { e.cim = 'Mágikus áramszünet'; s.energiaZavar = 0.5; },
    tick() {},
    veg(s) { s.energiaZavar = 1; },
    valaszok: [
      {
        cim: 'Tartalék kristályok (−2200)', leiras: 'Azonnal helyreáll az ellátás.',
        ar: 2200,
        hatas(s, e) { s.energiaZavar = 1; e.hossz = 0; },
      },
      { cim: 'Kivárjuk', leiras: 'Gyertyafény és bocsánatkérés.', ar: 0, hatas() {} },
    ],
  },
  {
    kod: 'demon_tuntetes', nev: 'Démonok tüntetnek', ikon: '😈', suly: 6, hossz: 1100,
    feltetel: (s) => s.dimenzioNyitva('parazsmely'),
    leiras: 'A Parázsmély utasai a hőforrások hiánya miatt tüntetnek. Mindenki hangulata gyorsabban romlik.',
    indit(s, e) { e.cim = 'Démonok tüntetnek'; s.hangulatZavar += 4; },
    tick() {},
    veg(s) { s.hangulatZavar -= 4; },
    valaszok: [
      {
        cim: 'Ingyen hőforrás-hét (−1500)', leiras: 'Megbékélnek, és a hírnév is javul.',
        ar: 1500,
        hatas(s, e) { s.hirnevValt(6); e.hossz = 0; },
      },
      {
        cim: 'Kivezettetjük őket', leiras: 'Gyorsan véget ér — de a Parázsmély megjegyzi.',
        ar: 0,
        hatas(s, e) { s.hirnevValt(-9); e.hossz = 0; s.dimenziok[s.dimIdxKod('parazsmely')].instabilitas += 120; },
      },
    ],
  },
  {
    kod: 'elveszett_gyermek', nev: 'Elveszett kobold-gyermek', ikon: '🧒', suly: 9, hossz: 600,
    feltetel: (s) => s.utasSzam > 12,
    leiras: 'Egy apró utas elkeveredett. Ha van információs pult személyzettel, maguktól megoldják.',
    indit(s, e) {
      e.cim = 'Elveszett kobold-gyermek';
      e.megoldva = s.mukodoEpuletVan('info');
    },
    tick() {},
    veg(s, e) {
      if (e.megoldva) { s.hirnevValt(4); s.naplo('A kobold-gyermek megkerült. A szülők mindenkinek elmesélték.', 'jo'); }
      else { s.hirnevValt(-7); s.naplo('A kobold-gyermek órákig bolyongott. Ez rossz sajtó.', 'baj'); }
    },
    valaszok: [
      {
        cim: 'Keresőcsapat (−700)', leiras: 'Biztos megoldás, azonnal.',
        ar: 700,
        hatas(s, e) { e.megoldva = true; e.hossz = 0; },
      },
      { cim: 'A személyzetre bízzuk', leiras: 'Ha van információs pult, meglesz.', ar: 0, hatas() {} },
    ],
  },
  {
    kod: 'mimik_lopas', nev: 'Mimik-lopás', ikon: '🧰', suly: 7, hossz: 1,
    feltetel: (s) => s.utasSzam > 8,
    leiras: 'Egy láda elkapott valamit, ami nem az övé.',
    indit(s, e) {
      const orok = s.dolgozoSzamTipus('or');
      const kar = Math.round((320 + s.rnd() * 600) * s.eventEro() / (1 + orok * 0.5));
      s.koltseg(kar, 'lopás');
      s.hirnevValt(orok > 0 ? -1 : -4);
      e.cim = `Mimik-lopás (−${kar})`;
      e.azonnali = true;
      s.naplo(orok > 0
        ? `Egy mimik lopni próbált, az őrök lecsaptak. Kár: ${kar}.`
        : `Egy mimik ellopott egy poggyászt. Kár: ${kar}. Őrök nélkül ez így lesz.`, orok > 0 ? 'gond' : 'baj');
    },
    tick() {},
  },
  {
    kod: 'idovihar', nev: 'Idővihar', ikon: '⏳', suly: 4, hossz: 1200,
    feltetel: (s) => s.nap >= 4,
    leiras: 'Az idő megvastagszik. Mindenki lassabban mozog, a türelem kétszer olyan gyorsan fogy.',
    indit(s, e) { e.cim = 'Idővihar'; s.idoviharSzorzo = 0.55; },
    tick() {},
    veg(s) { s.idoviharSzorzo = 1; },
    valaszok: [
      {
        cim: 'Mágusok kötése (−2600)', leiras: 'A vihar azonnal elül.',
        ar: 2600,
        hatas(s, e) { s.idoviharSzorzo = 1; e.hossz = 0; },
      },
      { cim: 'Átvészeljük', leiras: 'Lassított felvétel, tizenöt percen át.', ar: 0, hatas() {} },
    ],
  },
  {
    kod: 'dimenzio_hullam', nev: 'Utashullám', ikon: '🌊', suly: 9, hossz: 900,
    feltetel: (s) => s.nyitottDimenziok().length > 0,
    leiras: 'Az egyik világban ünnep van: háromszoros forgalom, amíg tart.',
    indit(s, e) {
      const lista = s.nyitottDimenziok();
      e.dim = lista[Math.floor(s.rnd() * lista.length)].idx;
      e.cim = `Utashullám: ${s.dimenzioNev(e.dim)}`;
      s.erkezesSzorzoDim[e.dim] = 3;
    },
    tick() {},
    veg(s, e) { s.erkezesSzorzoDim[e.dim] = 1; },
  },
  {
    kod: 'kristaly_dragulas', nev: 'Kristálydrágulás', ikon: '💠', suly: 6, hossz: 1500,
    feltetel: () => true,
    leiras: 'A kristálypiac megbolondult. A portálok üzemeltetése kétszer annyiba kerül.',
    indit(s, e) { e.cim = 'Kristálydrágulás'; s.kristalyArSzorzo = 2.1; },
    tick() {},
    veg(s) { s.kristalyArSzorzo = 1; },
  },
  {
    kod: 'szellem_ijeszt', nev: 'Szellem ijesztget', ikon: '👻', suly: 6, hossz: 500,
    feltetel: (s) => s.dimenzioNyitva('kodmocsar'),
    leiras: 'Egy unatkozó szellem a váróban rémisztget. A hangulat gyorsabban romlik.',
    indit(s, e) { e.cim = 'Szellem ijesztget'; s.hangulatZavar += 3; },
    tick() {},
    veg(s) { s.hangulatZavar -= 3; },
    valaszok: [
      {
        cim: 'Mágus kiűzi (−900)', leiras: 'Csendben és gyorsan.',
        ar: 900,
        hatas(s, e) { e.hossz = 0; },
      },
      { cim: 'Hadd szórakozzon', leiras: 'Van, akit ez szórakoztat is.', ar: 0, hatas() {} },
    ],
  },
  {
    kod: 'sarkany_latogatas', nev: 'Sárkányküldöttség', ikon: '🐉', suly: 3, hossz: 1,
    feltetel: (s) => s.hirnev >= 62 && s.nyitottDimenziok().length >= 2,
    leiras: 'Egy sárkány érkezik hivatalos látogatásra.',
    indit(s, e) {
      e.azonnali = true;
      const van = s.mukodoEpuletVan('vip');
      e.cim = van ? 'Sárkányküldöttség érkezik' : 'Sárkányküldöttség — VIP nélkül!';
      s.sarkanytIndit();
      s.naplo(van
        ? 'Sárkányküldöttség érkezett. A VIP Lounge készen áll.'
        : 'Sárkányküldöttség érkezett — és nincs VIP Lounge. Ezt meg fogják jegyezni.', van ? 'jo' : 'gond');
      if (!van) s.hirnevValt(-6);
    },
    tick() {},
  },
  {
    kod: 'baleset', nev: 'Baleset a szalagnál', ikon: '🚑', suly: 5, hossz: 1,
    feltetel: (s) => s.mukodoEpuletVan('poggyasz'),
    leiras: 'Egy troll beleesett a poggyászszalagba.',
    indit(s, e) {
      e.azonnali = true;
      const orvos = s.mukodoEpuletVan('orvos') && s.dolgozoSzamTipus('orvos') > 0;
      const kar = Math.round((6 - (orvos ? 4 : 0)) * s.eventEro());
      s.hirnevValt(-kar);
      e.cim = orvos ? 'Baleset — az orvos ellátta' : 'Baleset a szalagnál';
      s.naplo(orvos
        ? 'Baleset történt, de a gyengélkedő pillanatok alatt ellátta.'
        : 'Baleset történt, és nem volt orvos. Ez látszani fog a hírnéven.', orvos ? 'gond' : 'baj');
    },
    tick() {},
  },
];

export const ESEMENY_INDEX = (() => {
  const m = new Map();
  for (let i = 0; i < ESEMENYEK.length; i++) m.set(ESEMENYEK[i].kod, i);
  return m;
})();
