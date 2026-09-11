// Draws and downloads the shareable PNG score card shown after a race.
//
// Pulled out of Play.js and loaded on demand (see the dynamic import in
// Play.js's exportScoreCard handler) because this is pure canvas-drawing
// logic that only runs when a user actually clicks "download/share" -
// there's no reason to ship it in the main Play chunk for every race.
export function renderScoreCard({ raceResult, accentColor, goldColor, isNewPB }) {
  if (!raceResult) return;

  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1080;
  const ctx2d = canvas.getContext('2d');

  // Background
  const bg = ctx2d.createLinearGradient(0, 0, 1080, 1080);
  bg.addColorStop(0, '#0c1018');
  bg.addColorStop(1, '#111827');
  ctx2d.fillStyle = bg;
  ctx2d.fillRect(0, 0, 1080, 1080);

  // Accent left bar
  ctx2d.fillStyle = accentColor;
  ctx2d.fillRect(0, 0, 8, 1080);

  // Subtle grid lines
  ctx2d.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx2d.lineWidth = 1;
  for (let x = 0; x < 1080; x += 60) { ctx2d.beginPath(); ctx2d.moveTo(x, 0); ctx2d.lineTo(x, 1080); ctx2d.stroke(); }
  for (let y = 0; y < 1080; y += 60) { ctx2d.beginPath(); ctx2d.moveTo(0, y); ctx2d.lineTo(1080, y); ctx2d.stroke(); }

  // Glow circle - resolve the actual computed accent color at runtime so
  // the canvas gradient is always valid for hex colors and CSS variables.
  const resolvedAccent = (() => {
    try {
      const tmp = document.createElement('div');
      tmp.style.color = accentColor;
      document.body.appendChild(tmp);
      const computed = window.getComputedStyle(tmp).color; // always returns rgb(...)
      document.body.removeChild(tmp);
      return computed.replace('rgb(', 'rgba(').replace(')', ', 0.08)');
    } catch {
      return 'rgba(34,197,94,0.08)';
    }
  })();
  const glow = ctx2d.createRadialGradient(540, 400, 0, 540, 400, 500);
  glow.addColorStop(0, resolvedAccent);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx2d.fillStyle = glow;
  ctx2d.fillRect(0, 0, 1080, 1080);

  // Brand label
  ctx2d.font = '500 28px monospace';
  ctx2d.fillStyle = accentColor;
  ctx2d.globalAlpha = 0.7;
  ctx2d.fillText('TYPEARENA', 80, 110);
  ctx2d.globalAlpha = 1;

  // Separator line
  ctx2d.fillStyle = accentColor;
  ctx2d.globalAlpha = 0.3;
  ctx2d.fillRect(80, 140, 920, 2);
  ctx2d.globalAlpha = 1;

  // "Race Complete" heading
  ctx2d.font = 'bold 56px sans-serif';
  ctx2d.fillStyle = '#f5f5f5';
  ctx2d.fillText('Race Complete', 80, 230);

  // WPM - big number
  ctx2d.font = 'bold 220px monospace';
  ctx2d.fillStyle = accentColor;
  ctx2d.fillText(Math.round(raceResult.wpm), 80, 490);

  ctx2d.font = '500 40px sans-serif';
  ctx2d.fillStyle = 'rgba(245,245,245,0.55)';
  ctx2d.fillText('WPM', 80, 545);

  // Stats row
  ctx2d.font = 'bold 44px sans-serif';
  ctx2d.fillStyle = '#f5f5f5';
  ctx2d.fillText(`${Number(raceResult.accuracy).toFixed(1)}% accuracy`, 80, 640);
  ctx2d.font = '500 36px sans-serif';
  ctx2d.fillStyle = goldColor;
  ctx2d.fillText(`Net WPM: ${Number(raceResult.netWPM).toFixed(1)}`, 80, 710);

  // Share text
  ctx2d.font = 'italic 32px sans-serif';
  ctx2d.fillStyle = 'rgba(245,245,245,0.6)';
  ctx2d.fillText(raceResult.shareText, 80, 800);

  // PB badge
  if (isNewPB) {
    ctx2d.fillStyle = accentColor;
    ctx2d.globalAlpha = 0.15;
    ctx2d.beginPath();
    ctx2d.roundRect(80, 840, 340, 70, 12);
    ctx2d.fill();
    ctx2d.globalAlpha = 1;
    ctx2d.font = 'bold 30px sans-serif';
    ctx2d.fillStyle = accentColor;
    ctx2d.fillText('New Personal Best!', 100, 883);
  }

  // Footer
  ctx2d.font = '500 26px monospace';
  ctx2d.fillStyle = 'rgba(245,245,245,0.25)';
  ctx2d.fillText('typearena.io', 80, 1040);

  canvas.toBlob((blob) => {
    // blob is null if the canvas is tainted or the encoder fails.
    // createObjectURL(null) throws a TypeError, so guard before proceeding.
    if (!blob) {
      console.error('exportScoreCard: canvas.toBlob returned null - cannot create PNG');
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `typearena-${Math.round(raceResult.wpm)}wpm-${Date.now()}.png`;
    link.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
}