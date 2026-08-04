// PORTAL HUB TYCOON — A TÖRTÉNET.
//
// ── MIÉRT VAN EZ A FÁJL ───────────────────────────────────────────────────
// Ez az a rész, amitől a játék NEM végtelen sandbox. Egy tycoon alapból
// könnyen üresedik ki: ha csak annyi a cél, hogy „legyen több", akkor a
// harmadik óra ugyanaz, mint a második, csak nagyobb számokkal.
//
// A megoldás egy FEJEZETES ív: a kapuk egyre instabilabbak, új világok
// nyílnak, ritka lények érkeznek — és a JÁTÉKOS DÖNTÉSEI szabják meg, mely
// dimenziók fejlődnek tovább és melyek zárulnak be VÉGLEG. A bezárás
// visszafordíthatatlan; ettől lesz a döntésnek súlya, és ettől lesz két
// játszás története különböző.
//
// ── FELÉPÍTÉS ─────────────────────────────────────────────────────────────
// Egy fejezet: bevezető szöveg → cél → (opcionális) DÖNTÉS → jutalom → tovább.
// A cél NEM lehet olyasmi, amit az idő magától megold („várj 10 percet"):
// mindig valamilyen ÉPÍTETT állapotot vagy elért teljesítményt kér, hogy a
// történet a játék előrehaladását tükrözze, ne az órát.
//
// A `hatas` függvények a sim-et módosítják. Minden döntés hagy nyomot a
// `sim.tortenetJelzok` halmazban — a későbbi fejezetek és események ezt
// olvassák, így a korábbi választás tényleg számít később is.

export const FEJEZETEK = [
  {
    kod: 'elso_kapu', cim: 'I. Az első kapu', ikon: '🌀',
    bevezeto:
      'Az állomás a semmi közepén áll, egyetlen működő kapuval. A Zsibvásár-világ ' +
      'utasai már gyülekeznek odaát. A Tanács három szót írt a kinevezésedre: ' +
      '„lássuk, kibírja-e".',
    celSzoveg: 'Szolgálj ki 30 elégedett utast.',
    halad: (s) => Math.min(1, s.elegedettTavozok / 30),
    kesz: (s) => s.elegedettTavozok >= 30,
    jutalom(s) {
      s.bevetel(2200, 'A Tanács elismerése');
      s.dimenziotFelfed('kodmocsar');
      s.naplo('A Tanács elégedett. Megnyílt a Ködmocsár koordinátája.', 'jo');
    },
  },
  {
    kod: 'masodik_vilag', cim: 'II. A második világ', ikon: '🌫️',
    bevezeto:
      'A Ködmocsár szellemei átjárnak a falakon, és nem szeretnek várni. ' +
      'Nyisd meg a második kapudat — egy csomópont egyetlen világgal még nem csomópont.',
    celSzoveg: 'Legyen két nyitott dimenziókapud egyszerre.',
    halad: (s) => Math.min(1, s.nyitottDimenziok().length / 2),
    kesz: (s) => s.nyitottDimenziok().length >= 2,
    jutalom(s) {
      s.bevetel(2600, 'Átszállási támogatás');
      s.dimenziotFelfed('kohegyseg');
      s.naplo('Az átszálló forgalom beindult. A Kőhegység is jelentkezett.', 'jo');
    },
  },
  {
    kod: 'a_repedes', cim: 'III. A repedés', ikon: '⚡',
    bevezeto:
      'A kapuk körül vékony repedések futnak végig a levegőn. A mérnökök szerint ' +
      'ez nem hiba, hanem a hálózat kora. Kétféleképpen lehet reagálni rá — és ' +
      'a kettő nem fér össze.',
    celSzoveg: 'Építs portálkarbantartót, és vidd 50 fölé a hírnevet.',
    halad: (s) => Math.min(1, (s.mukodoEpuletVan('karbantarto') ? 0.5 : 0) + Math.min(0.5, s.hirnev / 100)),
    kesz: (s) => s.mukodoEpuletVan('karbantarto') && s.hirnev >= 50,
    dontes: {
      kerdes: 'Mit kezdesz a repedésekkel?',
      valaszok: [
        {
          kod: 'megerosites', cim: 'Megerősítés',
          leiras: 'Minden meglévő kapu instabilitása harmadára esik, és tartósan −25 %-kal nő. Cserébe az új kapuk nyitása 60 %-kal drágább lesz.',
          hatas(s) {
            for (let i = 0; i < s.dimenziok.length; i++) s.dimenziok[i].instabilitas = Math.round(s.dimenziok[i].instabilitas / 3);
            s.jelzo('megerosites');
            s.naplo('A hálózat megszilárdult. A terjeszkedés viszont drágább lett.', 'jo');
          },
        },
        {
          kod: 'terjeszkedes', cim: 'Terjeszkedés',
          leiras: 'Két új dimenzió koordinátája nyílik meg azonnal, és az érkezés +20 %. Cserébe minden kapu 35 %-kal gyorsabban romlik.',
          hatas(s) {
            s.dimenziotFelfed('boszorkanyliget');
            s.dimenziotFelfed('parazsmely');
            s.jelzo('terjeszkedes');
            s.naplo('Két új világ koordinátája futott be. A repedések szélesebbek lettek.', 'gond');
          },
        },
      ],
    },
    jutalom(s) { s.bevetel(1500, 'Tanácsi keret'); },
  },
  {
    kod: 'a_tomeg', cim: 'IV. A tömeg', ikon: '🌊',
    bevezeto:
      'Az állomás már nem üres csarnok: egyszerre több száz lény vár, eszik és ' +
      'vásárol. A kérdés innentől nem az, hogy jönnek-e, hanem hogy elférnek-e.',
    celSzoveg: 'Legyen egyszerre 80 utas az állomáson, és maradjon 55 fölött a hírnév.',
    halad: (s) => Math.min(1, s.csucsUtas / 80) * 0.7 + Math.min(0.3, s.hirnev / 100 * 0.3),
    kesz: (s) => s.csucsUtas >= 80 && s.hirnev >= 55,
    jutalom(s) {
      s.bevetel(4000, 'Forgalmi prémium');
      s.dimenziotFelfed('fagyperem');
      s.kutatasKedvezmeny = 0.8;
      s.naplo('A Fagyperem jelentkezett. A kutatások 20 %-kal olcsóbbak lettek.', 'jo');
    },
  },
  {
    kod: 'kuldottseg', cim: 'V. A küldöttség', ikon: '👑',
    bevezeto:
      'Egy sárkány-küldöttség jelentette be magát. Nem azért jönnek, hogy ' +
      'utazzanak — azért, hogy megnézzék, megéri-e ide utazniuk.',
    celSzoveg: 'Szolgálj ki egy legendás vendéget a VIP Lounge-ban.',
    halad: (s) => (s.mukodoEpuletVan('vip') ? 0.5 : 0) + Math.min(0.5, s.vipKiszolgalt * 0.5),
    kesz: (s) => s.vipKiszolgalt >= 1,
    jutalom(s) {
      s.bevetel(6000, 'A küldöttség ajándéka');
      s.naplo('A sárkányok elégedetten távoztak. Ez a hír messzire elér.', 'jo');
      s.hirnevValt(10);
    },
  },
  {
    kod: 'a_valasztas', cim: 'VI. A választás', ikon: '⚖️',
    bevezeto:
      'A hálózat nem bírja el mindet. A Tanács közli: vagy leválasztasz egy ' +
      'világot, vagy vállalod, hogy mindegyik gyorsabban romlik. Amit lezársz, ' +
      'az nem nyílik ki többé.',
    celSzoveg: 'Legyen négy nyitott kapud, és 12 000 tartalékod.',
    halad: (s) => Math.min(1, s.nyitottDimenziok().length / 4) * 0.6 + Math.min(0.4, s.penz / 12000 * 0.4),
    kesz: (s) => s.nyitottDimenziok().length >= 4 && s.penz >= 12000,
    dontes: {
      kerdes: 'Leválasztasz egy világot?',
      valaszok: [
        {
          kod: 'lezaras', cim: 'Lezárok egyet',
          leiras: 'A legkevesebb bevételt hozó nyitott dimenzió VÉGLEG bezárul. Cserébe minden megmaradt kapu instabilitása feleződik, és lassabban nő.',
          hatas(s) {
            const l = s.legrosszabbNyitottDimenzio();
            if (l) s.dimenziotLezar(l.idx, true);
            for (let i = 0; i < s.dimenziok.length; i++) s.dimenziok[i].instabilitas = Math.round(s.dimenziok[i].instabilitas / 2);
            s.jelzo('lezaras');
            s.naplo('Egy világ végleg lekapcsolódott a hálózatról. A többi megnyugodott.', 'gond');
          },
        },
        {
          kod: 'mindet_tartom', cim: 'Mindet megtartom',
          leiras: 'Egy kapu sem zárul be, és az érkezés +25 %. Cserébe az instabilitás 50 %-kal gyorsabban nő, örökre.',
          hatas(s) {
            s.jelzo('mindet_tartom');
            s.naplo('Egyetlen világ sem maradt le. A mérnökök nem néztek rád.', 'gond');
          },
        },
      ],
    },
    jutalom(s) { s.dimenziotFelfed('sarkanytronus'); s.naplo('A Sárkánytrónus koordinátája megnyílt.', 'jo'); },
  },
  {
    kod: 'a_tronus', cim: 'VII. A trónus', ikon: '🐉',
    bevezeto:
      'A Sárkánytrónus kapuja minden eddiginél többet követel és minden eddiginél ' +
      'többet ad. Ha ez áll, az állomásod nem csomópont többé, hanem főváros.',
    celSzoveg: 'Nyisd meg a Sárkánytrónus kapuját, és tartsd 70 fölött a hírnevet.',
    halad: (s) => (s.dimenzioNyitva('sarkanytronus') ? 0.6 : 0) + Math.min(0.4, s.hirnev / 100 * 0.4),
    kesz: (s) => s.dimenzioNyitva('sarkanytronus') && s.hirnev >= 70,
    jutalom(s) {
      s.bevetel(15000, 'A trónus adója');
      s.naplo('A Sárkánytrónus áll. A hálózat közepe innentől TE vagy.', 'jo');
      s.jatekVege = 'gyozelem';
    },
  },
];

/** A történet változó állapota. */
export function ujTortenet() {
  return {
    fejezet: 0,
    /** 'bevezeto' | 'fut' | 'dontes' | 'vege' */
    allapot: 'bevezeto',
    /** Az utolsó fejezetváltás tickje — a UI ebből tudja, hogy újat mutasson. */
    valtasTick: 0,
  };
}
