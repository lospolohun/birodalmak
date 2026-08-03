// AGE OF THE CRYSTALS — központi beállítások.
//
// ⚠️ A JÁTÉK VERZIÓJA ITT VAN, NEM a `package.json`-ban. A TELEPESEK-nél a
// `package.json` 0.1.0-n ragadt, miközben a játék v1.3.16-nál járt, és ez
// többször félrevezetett a deploy-ellenőrzésnél. Itt egy hely van rá.
export const VERZIO = '0.2.0';

/** A pálya oldalhossza cellában. 1 cella = 1 világegység. */
export const PALYA_N = 256;

/** A v0.1 szonda célszáma — ennyi egységnél kell 60 FPS-t hozni. */
export const CEL_EGYSEG = 1600;

/** Alapértelmezett meccs-seed. */
export const SEED = 20260803;

/** Egységszámok, amiken a szonda skálázást mér. */
export const SZONDA_LEPCSOK = [100, 400, 800, 1600];
