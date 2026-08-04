// PORTAL HUB TYCOON — GRAFIKONOK.
//
// ── MIÉRT CANVAS ÉS NEM SVG/KÖNYVTÁR ──────────────────────────────────────
// Egy 120 pontos vonaldiagramhoz nem kell diagram-könyvtár: az több
// megabájt függőség lenne egy olyan játékban, ami külső fájl nélkül fut.
// SVG-vel sem érné meg, mert az elemenként DOM-csomópont, és a panel fél
// másodpercenként újraépül — 400 csomópont törlése és újralétrehozása
// másodpercenként pont az, amitől a felület akadni kezd. Egyetlen canvas,
// egyetlen rajzolás.
//
// ── MIÉRT NEM ELÉG A SZÁM ─────────────────────────────────────────────────
// A HUD pillanatnyi állapotot mutat: „hírnév 62". Az viszont EGÉSZEN MÁST
// jelent, ha 40-ről jön fölfelé, mint ha 85-ről csúszik lefelé. A tycoon
// döntései mind trendekről szólnak, és a trend a számból nem látszik.

/**
 * Vonaldiagram rajzolása.
 * @param {HTMLCanvasElement} vaszon
 * @param {Array<object>} adat a `sim.napiTortenet` elemei
 * @param {Array<{mezo:string, szin:string, nev:string}>} sorozatok
 * @param {{nulla?: boolean}} [opciok] `nulla: true` → a 0 mindig látszik
 */
export function vonal(vaszon, adat, sorozatok, opciok = {}) {
  const k = vaszon.getContext('2d');
  const sz = vaszon.width, m = vaszon.height;
  k.clearRect(0, 0, sz, m);
  if (!adat || adat.length < 2) {
    k.fillStyle = '#93a0c8';
    k.font = '12px system-ui, sans-serif';
    k.fillText('Még nem telt el két teljes nap.', 10, m / 2);
    return;
  }

  const bal = 46, jobb = 8, fent = 10, lent = 20;
  const rajzSz = sz - bal - jobb, rajzM = m - fent - lent;

  // ── SKÁLA ─────────────────────────────────────────────────────────────
  let min = Infinity, max = -Infinity;
  for (const sor of sorozatok) {
    for (const p of adat) {
      const v = p[sor.mezo];
      if (typeof v !== 'number') continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  if (!isFinite(min)) { min = 0; max = 1; }
  if (opciok.nulla) { min = Math.min(min, 0); max = Math.max(max, 0); }
  if (max - min < 1e-6) { max = min + 1; }
  const tartalek = (max - min) * 0.08;
  min -= tartalek; max += tartalek;

  const px = (i) => bal + (i / (adat.length - 1)) * rajzSz;
  const py = (v) => fent + rajzM - ((v - min) / (max - min)) * rajzM;

  // ── RÁCS ──────────────────────────────────────────────────────────────
  k.strokeStyle = 'rgba(140,160,230,0.16)';
  k.fillStyle = '#93a0c8';
  k.font = '10px system-ui, sans-serif';
  k.lineWidth = 1;
  for (let i = 0; i <= 3; i++) {
    const v = min + (max - min) * (i / 3);
    const y = Math.round(py(v)) + 0.5;
    k.beginPath(); k.moveTo(bal, y); k.lineTo(sz - jobb, y); k.stroke();
    k.fillText(rovidSzam(v), 4, y + 3);
  }
  // Nulla-vonal külön, ha látszik — a veszteséges nap ettől lesz azonnal olvasható.
  if (min < 0 && max > 0) {
    const y = Math.round(py(0)) + 0.5;
    k.strokeStyle = 'rgba(255,93,115,0.5)';
    k.beginPath(); k.moveTo(bal, y); k.lineTo(sz - jobb, y); k.stroke();
  }

  // ── VONALAK ───────────────────────────────────────────────────────────
  k.lineWidth = 1.8;
  k.lineJoin = 'round';
  for (const sor of sorozatok) {
    k.strokeStyle = sor.szin;
    k.beginPath();
    let elso = true;
    for (let i = 0; i < adat.length; i++) {
      const v = adat[i][sor.mezo];
      if (typeof v !== 'number') continue;
      const x = px(i), y = py(v);
      if (elso) { k.moveTo(x, y); elso = false; } else k.lineTo(x, y);
    }
    k.stroke();
  }

  // ── FELIRATOK ─────────────────────────────────────────────────────────
  k.font = '10px system-ui, sans-serif';
  let x = bal;
  for (const sor of sorozatok) {
    k.fillStyle = sor.szin;
    k.fillRect(x, m - 11, 8, 3);
    k.fillStyle = '#c3cdec';
    k.fillText(sor.nev, x + 11, m - 5);
    x += 13 + k.measureText(sor.nev).width + 10;
  }
  k.fillStyle = '#93a0c8';
  const elsoNap = adat[0].nap, utolsoNap = adat[adat.length - 1].nap;
  k.fillText(`${elsoNap}.`, bal, fent - 1);
  const jobbFelirat = `${utolsoNap}. nap`;
  k.fillText(jobbFelirat, sz - jobb - k.measureText(jobbFelirat).width, fent - 1);
}

/** 12 400 → „12,4 e" — a tengelyfelirat ne törje szét a rajzot. */
function rovidSzam(v) {
  const a = Math.abs(v);
  if (a >= 1e6) return (v / 1e6).toFixed(1).replace('.', ',') + 'M';
  if (a >= 1000) return (v / 1000).toFixed(1).replace('.', ',') + 'e';
  return String(Math.round(v));
}
