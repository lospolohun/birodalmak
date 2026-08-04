// PORTAL HUB TYCOON — APRÓ DOM-SEGÉDEK.
//
// Nem keretrendszer, csak az a négy függvény, ami nélkül minden UI-fájl
// tele lenne `document.createElement`-tel. A cél az, hogy a felület-kód a
// TARTALOMRÓL szóljon, ne a DOM-ról.

/**
 * Elem létrehozása.
 * @param {string} tag
 * @param {string} [osztaly] szóközzel elválasztott osztálynevek
 * @param {string} [szoveg]
 */
export function el(tag, osztaly, szoveg) {
  const e = document.createElement(tag);
  if (osztaly) e.className = osztaly;
  if (szoveg !== undefined) e.textContent = szoveg;
  return e;
}

/** Gyerekek hozzáadása egy hívással. */
export function be(szulo, ...gyerekek) {
  for (const g of gyerekek) if (g) szulo.appendChild(g);
  return szulo;
}

/** Kiürítés. */
export function ures(e) { while (e.firstChild) e.removeChild(e.firstChild); return e; }

/**
 * Szöveg beállítása CSAK ha változott.
 *
 * Ez nem korai optimalizálás: a HUD hat számot frissít 60 Hz-en, és a
 * `textContent` írása akkor is layoutot kérhet, ha ugyanaz az érték. Egy
 * összehasonlítás ennél mindig olcsóbb.
 */
export function szoveg(e, ertek) {
  const s = String(ertek);
  if (e._utolso !== s) { e.textContent = s; e._utolso = s; }
}

/** Szám ezres tagolással, magyar módra (szóköz). */
export function szam(n) {
  const x = Math.round(n);
  const jel = x < 0 ? '−' : '';
  return jel + String(Math.abs(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** Sáv (0..1) beállítása színnel együtt. */
export function savBeallit(sav, arany, szinek) {
  const a = Math.max(0, Math.min(1, arany));
  sav.style.width = (a * 100).toFixed(1) + '%';
  if (szinek) {
    const sz = a < 0.3 ? szinek[0] : (a < 0.6 ? szinek[1] : szinek[2]);
    if (sav._szin !== sz) { sav.style.background = sz; sav._szin = sz; }
  }
}
