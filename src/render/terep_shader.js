// AGE OF THE CRYSTALS — TEREP- ÉS VÍZ-SHADER FOLTOK.
//
// ── MIÉRT VAN SHADER-RÉTEG A CSÚCSSZÍN FÖLÖTT ─────────────────────────────
// A csúcsszín felbontása a rácsé: EGY világegység. Az RTS-kamera alaptávolsága
// 70 — ott egy cella 25–40 képpont, tehát a csúcsszín önmagában nagy, lapos
// színfoltokat ad. A hiányzó részlet a cellánál KISEBB léptékű, és pont az,
// amitől a talaj felületnek látszik, nem terítőnek.
//
// Textúrát ehhez SZÁNDÉKOSAN nem használunk: egy tisztességes talaj-atlasz
// mipmapekkel több MB, a `dist/` egyetlen fájl marad-elve ellen dolgozik, és
// integrált GPU-n a mintavétel is drágább, mint néhány ALU. Helyette
// szinusz-összeg: három inkommenzurábilis hullám adja a nagy foltokat, kettő a
// szemcsét.
//
// ⚠️ A FINOM OKTÁVOT A KÉPERNYŐ-DERIVÁLTTAL KELL ELHALVÁNYÍTANI. Kizoomolva
// egy hullámhossz pár képpontra esik, és mintavételi zaj (villogó szemcse)
// lesz belőle — mozgó kamerán ez a legfeltűnőbb hibafajta. A `fwidth` mondja
// meg, hány világegység esik egy képpontra; ahol ez nagy, ott a finom réteg
// elhalkul. Ugyanez a trükk már bevált a vízen (`terrain3d.js` `Viz3D`).
//
// ── MIÉRT NEM UNIFORM, HANEM BEÉGETETT SZÁM ──────────────────────────────
// Az arculat-konstansok a shader SZÖVEGÉBE fordulnak. A terep anyaga EGY
// darab, presetenként egyszer fordul, és futás közben SOHA nem változik —
// uniformmal képkockánként kellene írni és a fordító nem tudná összevonni a
// konstansokat. A beégetés ára: preset-váltáskor új shader-fordítás. Ez a
// meccs elején egyszer történik.
//
// ⚠️ A `terep_paletta.js`-hez hasonlóan ez a modul sem importál `three`-t:
// stringeket ad vissza. Így a GLSL szövege node-ban is előállítható és
// átnézhető, ami GPU nélkül az egyetlen ellenőrzési mód.

import { hexLin, MELYSEG_REF } from './terep_paletta.js';

/** GLSL float-literál — a `1` egészet a GLSL nem fogadja el float helyén. */
function f(x) {
  const s = (+x).toFixed(4);
  return s.indexOf('.') < 0 ? s + '.0' : s;
}

/** sRGB hexa → GLSL `vec3(...)` LINEÁRIS térben. */
function v3(hex) {
  const c = hexLin(hex);
  return `vec3(${f(c[0])}, ${f(c[1])}, ${f(c[2])})`;
}

/**
 * A TEREP anyagának shader-foltja.
 *
 * A `vNormO` az OBJEKTUM-TÉR normálisa. A terep gyökere sosem mozdul
 * (`matrixAutoUpdate = false`, egység-mátrix), tehát ez világ-tér normális is
 * egyben — így a meredekség-számítás nem igényel mátrix-szorzást a
 * fragment-shaderben.
 *
 * @param {{vertexShader:string, fragmentShader:string}} sh a `onBeforeCompile` shaderje
 * @param {object} arc `terep_paletta.js` → `arculat()`
 * @param {number} sziklaLejto a preset járhatatlansági küszöbe (`sim/terkep.js`)
 */
export function terepShaderFolt(sh, arc, sziklaLejto) {
  sh.vertexShader = 'varying vec3 vVilagP;\nvarying vec3 vNormO;\n' + sh.vertexShader
    .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n\tvNormO = objectNormal;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvVilagP = (modelMatrix * vec4(transformed, 1.0)).xyz;');

  // A meredekség a lejtő TANGENSE — ugyanaz a mennyiség, amit a `grid.js`
  // `lejto`-ja mér (magasságkülönbség egy cellányi úton), tehát a preset
  // `sziklaLejto` küszöbe közvetlenül összevethető vele.
  const falAlso = f(sziklaLejto * 0.55);
  const falFelso = f(sziklaLejto * 1.15);

  // ⚠️ A KRISTÁLY-CSILLÁM NEM SZIKRA, HANEM DERENGÉS — ÉS EZ MÉRÉS UTÁNI DÖNTÉS.
  // Az első változat tényleg apró szikrákat rakott a talajba
  // (`pow(sin*sin, 9…16)`), és a szoftveres előnézeten az EGÉSZ kristálymező
  // szabályos, fehér PONTRÁCCSÁ vált. A szorzat-szinusz ugyanis RÁCSOT ad, a
  // hatványozás pedig pontokká szűkíti a rács csomópontjait; a lassú
  // makro-torzítás (periódus ~90 egység) egy 2 egységes rácsot nem tör meg,
  // és a szűkebb távolság-kapu is csak azt érte el, hogy a rács a kamera előtt
  // jelent meg. GPU nélkül ezt EGYETLEN kapu sem fogta volna meg — a képen
  // viszont azonnal látszott.
  //
  // A megoldás nem finomhangolás, hanem más LÉPTÉK: a hideg derengés a
  // `makro` tag pozitív felére kerül, aminek a periódusa ~90 világegység.
  // Ekkora foltot semmilyen zoomon nem lehet alulmintavételezni, tehát
  // szerkezetileg nem tud aliasolni; a pályán pedig nagy, derengő „kristály-
  // erek" lesznek belőle, ami messziről is a preset arculata marad. Extra
  // szinuszba nem kerül: a `makro` amúgy is ki van számolva.
  //
  // (A közbenső változat a `szemcse`-re rakta ugyanezt. Az sem aliasolt, de
  // additívan a szövet-mintát is felerősítette, és a kristálymező ferde
  // hímzésnek látszott — szintén csak a képen látszott, kapun nem.)
  const csillam = arc.csillam > 0 ? `
        diffuseColor.rgb += ${v3(arc.hab)} * max(0.0, makro) * (1.0 - fal)
                          * ${f(arc.csillam)};` : '';

  // ⚠️ A GLSL-BE ÍRT KOMMENTBE NE KERÜLJÖN FORDÍTOTT APOSZTRÓF. A shader
  // sablon-literálban él: egy `visszapipa` a JS-sztringet zárja le, és a
  // fordítás „Expected ','" hibával áll meg — a hibaüzenet a GLSL-ről semmit
  // nem árul el. Az indoklás ezért ITT, JS-kommentben van, a shaderben csak
  // rövid, egyszavas jelölés marad. (Mellékhaszon: nem szállítunk három
  // bekezdésnyi magyar szöveget minden fragment-shaderben.)
  //
  // A SZEMCSE TARTOMÁNY-TORZÍTOTT, NEM KÉT SZINUSZ SZORZATA. A szorzat
  // szeparálható, tehát szabályos kockás szövetet ad — a szoftveres
  // előnézeten a szárazföld-preset átlós hímzésnek látszott. A torzítás
  // MÉRETE dönt, nem a megléte: a makro-tagok periódusa ~90 egység, egy ~8
  // egységes szövetet ezért csak eltolnak, helyben nem bontanak meg (az első
  // javítás után a hímzés halványabb lett, de megmaradt). Az `mk` közepes
  // hullám (periódus ~9 egység) az, ami ténylegesen összekeveri — ez az
  // egyetlen szinusz, amit a réteg kizárólag a szemcse kedvéért fizet.
  //
  // A RÉTEGET IS TÖRNI KELL. Tiszta `sin(y)`-ból SZINTVONAL lesz: a pálya
  // peremgerince az előnézeten térkép-szintvonalas rajznak látszott, mert a
  // sávok pontosan vízszintesek és egyenletesek voltak. A `szemcse` (≈4
  // egységes lépték) hullámossá teszi a réteghatárt, a `makro` pedig
  // vidékenként eltolja.
  sh.fragmentShader = 'varying vec3 vVilagP;\nvarying vec3 vNormO;\n' + sh.fragmentShader.replace(
    '#include <color_fragment>',
    `#include <color_fragment>
        vec3 nO = normalize(vNormO);
        float lejt = length(vec2(nO.x, nO.z)) / max(nO.y, 0.08);
        vec2 w = vVilagP.xz;
        float pix = length(fwidth(w));
        float finomSuly = 1.0 - smoothstep(0.35, 1.50, pix);

        // nagy foltok: harom, egymassal nem osszemerheto frekvencia
        float m1 = sin(w.x * 0.0731 + w.y * 0.0412 + 0.7);
        float m2 = sin(w.y * 0.0913 - w.x * 0.0281 + 2.3);
        float m3 = sin((w.x + w.y) * 0.0197 - 1.1);
        float makro = (m1 + m2 + m3) * 0.33333;

        // szemcse: tartomany-torzitott, kozeprol az mk tori meg a racsot
        float mk = sin(w.x * 0.51 - w.y * 0.43 + 1.9);
        float szemcse = sin(w.x * 0.79 + w.y * 0.63 + mk * 2.6 + m1 * 3.1)
                      * sin(w.y * 0.71 - w.x * 0.55 - mk * 2.2 + m2 * 2.7);
        diffuseColor.rgb *= 1.0 + makro * ${f(arc.makroEro)}
                                + szemcse * finomSuly * ${f(arc.finomEro)};

        // sziklafal: meredeken retegzett kozet, a csucsszin megtartasaval
        float fal = smoothstep(${falAlso}, ${falFelso}, lejt);
        if (fal > 0.001) {
          float reteg = sin(vVilagP.y * 1.90 + makro * 3.0 + szemcse * 1.1);
          vec3 kozet = mix(diffuseColor.rgb, ${v3(arc.sziklaVilagos)}, 0.55)
                     * (1.0 + reteg * ${f(arc.retegEro)});
          diffuseColor.rgb = mix(diffuseColor.rgb, kozet, fal * ${f(arc.falEro)});
        }${csillam}`,
  );
}

/**
 * A VÍZSÍK shader-foltja: mélységfüggő szín, átlátszóság és habos partvonal.
 *
 * ⚠️ A `uMelyseg` textúra a PÁLYA négyzetét fedi, a vízsík viszont négyszer
 * akkora. A pályán KÍVÜL nincs mélység-adat, és a `CLAMP_TO_EDGE` a perem
 * értékét nyújtaná ki — a szárazföld-preseten (ahol a perem magasan van) ettől
 * a nyílt tenger is átlátszó, tehát láthatatlan lenne. Ezért a pályán kívül a
 * mélységet erőltetetten a maximumra visszük: a világ a ködbe futó, mély
 * tengerben ér véget, ahogy eddig is.
 *
 * @param {{vertexShader:string, fragmentShader:string}} sh
 * @param {object} arc
 * @param {number} n pályaméret cellában
 * @param {{value:number}} idoUniform
 * @param {{value:any}} melysegUniform
 */
export function vizShaderFolt(sh, arc, n, idoUniform, melysegUniform) {
  sh.uniforms.uIdo = idoUniform;
  sh.uniforms.uMelyseg = melysegUniform;

  sh.vertexShader = 'varying vec2 vVilag;\n' + sh.vertexShader.replace(
    '#include <begin_vertex>',
    '#include <begin_vertex>\n\tvVilag = (modelMatrix * vec4(transformed, 1.0)).xz;',
  );

  sh.fragmentShader = 'uniform float uIdo;\nuniform sampler2D uMelyseg;\nvarying vec2 vVilag;\n'
    + sh.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
        // ── HULLÁM GEOMETRIA NÉLKÜL ─────────────────────────────────────────
        // Két oktáv kell: egyetlen alacsony frekvenciájú hullámmal a mintázat
        // hulláma ~30 világegység, és a bezoomolt kép nem víznek, hanem
        // elmosott felhőfotónak látszik. A finomat itt is a képernyő-derivált
        // halkítja el, különben kizoomolva villog.
        float durva = sin(vVilag.x * 0.42 + uIdo * 0.85) * 0.5
                    + sin(vVilag.y * 0.55 - uIdo * 0.65) * 0.5;
        float finom = sin(vVilag.x * 1.85 - vVilag.y * 1.30 + uIdo * 2.1) * 0.5
                    + sin(vVilag.x * 1.10 + vVilag.y * 2.05 - uIdo * 1.6) * 0.5;
        float suly = 1.0 - smoothstep(0.35, 1.6, length(fwidth(vVilag)));
        float hu = durva * 0.55 + finom * 0.45 * suly;

        // ── MÉLYSÉG ────────────────────────────────────────────────────────
        vec2 uv = vVilag / ${f(n)};
        float kint = max(max(-uv.x, uv.x - 1.0), max(-uv.y, uv.y - 1.0));
        float mely = texture2D(uMelyseg, clamp(uv, 0.0, 1.0)).r * ${f(MELYSEG_REF)};
        mely = mix(mely, ${f(MELYSEG_REF)}, clamp(kint * 24.0, 0.0, 1.0));
        // A hullám a partvonalat is mozgatja — enélkül a habsáv mértani
        // görbe lenne, ami sosem néz ki víznek.
        mely = max(0.0, mely + hu * 0.11);

        diffuseColor.rgb = mix(${v3(arc.vizSekely)}, ${v3(arc.vizMely)},
                               smoothstep(0.15, 2.60, mely));
        diffuseColor.rgb *= 1.0 + hu * 0.11;
        float csillam = pow(max(0.0, hu), 14.0);
        diffuseColor.rgb += vec3(0.13, 0.19, 0.22) * csillam;

        // Sekélyen majdnem átlátszó: a világos meder üt át, és ettől lesz a
        // partvonal átmenet, nem vágás.
        float alfa = mix(0.10, 0.88, smoothstep(0.02, 1.70, mely));

        // ── HAB ────────────────────────────────────────────────────────────
        // ⚠️ A HAB KESKENY. A 0,60-as sávval a hegyvidék sekély tavai FEHÉR
        // KERETET kaptak, és a tó matricának látszott, nem víznek. 0,34 az a
        // szélesség, ami a partot még lágyítja, de nem rajzolja körbe.
        float part = 1.0 - smoothstep(0.0, 0.34, mely);
        part *= part;
        float habMinta = 0.55 + 0.45 * sin(vVilag.x * 1.7 + vVilag.y * 1.1
                                           + uIdo * 1.4 + hu * 2.2);
        diffuseColor.rgb = mix(diffuseColor.rgb, ${v3(arc.hab)}, part * habMinta * 0.42);
        alfa = max(alfa, part * habMinta * 0.34);

        diffuseColor.a = alfa;`,
    );
}
