import type { Game } from '../sim/game';

// The observatory view: Earth, the Moon and the three visiting ships. Ships
// drift closer as trust grows and the Wardens close in when they turn hostile.

let shared: { cv: HTMLCanvasElement; game: Game } | null = null;

/** The observatory canvas. One instance is reused across renders, drawn at ~20 fps while visible. */
export function spaceView(game: Game): HTMLCanvasElement {
  if (shared) {
    shared.game = game;
    return shared.cv;
  }
  const cv = document.createElement('canvas');
  cv.className = 'fc-space';
  cv.setAttribute('role', 'img');
  cv.setAttribute('aria-label', 'Earth, the Moon and the visiting ships');
  const state = { cv, game };
  shared = state;
  let last = 0;
  const stars = Array.from({ length: 140 }, (_, k) => [((k * 7919) % 1000) / 1000, ((k * 104729) % 997) / 997, ((k * 31) % 7) / 7]);
  const draw = (now: number) => {
    requestAnimationFrame(draw);
    if (!cv.isConnected || document.hidden || now - last < 50) return;
    last = now;
    const game = state.game;
    const r = cv.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(r.width * dpr) || cv.height !== Math.round(r.height * dpr)) {
      cv.width = Math.round(r.width * dpr);
      cv.height = Math.round(r.height * dpr);
    }
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = r.width;
    const H = r.height;
    ctx.fillStyle = '#05070d';
    ctx.fillRect(0, 0, W, H);
    for (const [x, y, b] of stars) {
      ctx.fillStyle = `rgba(200,220,255,${0.25 + b * 0.5 + Math.sin(now / 900 + x * 50) * 0.15})`;
      ctx.fillRect(x * W, y * H, 1.2, 1.2);
    }
    const ex = W * 0.3;
    const ey = H * 0.55;
    const er = Math.min(W, H) * 0.16;
    const glow = ctx.createRadialGradient(ex, ey, er * 0.8, ex, ey, er * 1.6);
    glow.addColorStop(0, 'rgba(90,170,255,0.25)');
    glow.addColorStop(1, 'rgba(90,170,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(ex, ey, er * 1.6, 0, Math.PI * 2);
    ctx.fill();
    const earth = ctx.createRadialGradient(ex - er * 0.4, ey - er * 0.4, er * 0.1, ex, ey, er);
    earth.addColorStop(0, '#7fd0ff');
    earth.addColorStop(0.6, '#2a6fc0');
    earth.addColorStop(1, '#0d2c55');
    ctx.fillStyle = earth;
    ctx.beginPath();
    ctx.arc(ex, ey, er, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(120,200,120,0.55)';
    ctx.beginPath();
    ctx.ellipse(ex - er * 0.25, ey - er * 0.1, er * 0.32, er * 0.2, 0.6, 0, Math.PI * 2);
    ctx.ellipse(ex + er * 0.3, ey + er * 0.35, er * 0.22, er * 0.12, -0.4, 0, Math.PI * 2);
    ctx.fill();
    // Moon orbit.
    const orbit = er * 2.6;
    ctx.strokeStyle = 'rgba(160,190,230,0.15)';
    ctx.setLineDash([3, 6]);
    ctx.beginPath();
    ctx.ellipse(ex, ey, orbit, orbit * 0.4, -0.2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    const ma = now / 40000;
    const mx = ex + Math.cos(ma) * orbit * Math.cos(-0.2) - Math.sin(ma) * orbit * 0.4 * Math.sin(-0.2);
    const my = ey + Math.cos(ma) * orbit * Math.sin(-0.2) + Math.sin(ma) * orbit * 0.4 * Math.cos(-0.2);
    ctx.fillStyle = '#c9ccd3';
    ctx.beginPath();
    ctx.arc(mx, my, er * 0.27, 0, Math.PI * 2);
    ctx.fill();
    // Ships.
    const F = game.s.factions;
    const far = W * 0.95;
    const ship = (f: 'archivists' | 'wardens' | 'pilgrims', color: string, size: number, count: number, lane: number) => {
      const st = F[f];
      if (game.s.departed) return;
      const near = f === 'wardens' ? st.aggression / 100 : st.trust / 100;
      const dist = far - (far - (ex + er * 2.2)) * Math.max(0, Math.min(1, near * 1.1));
      for (let k = 0; k < count; k++) {
        const x = dist + k * 14 + Math.sin(now / 2000 + k + lane) * 3;
        const y = H * (0.18 + lane * 0.3) + k * 10 + Math.cos(now / 2500 + k) * 3;
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.25;
        ctx.beginPath();
        ctx.arc(x, y, size * 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.beginPath();
        if (f === 'pilgrims') ctx.ellipse(x, y, size * 1.8, size * 0.7, 0, 0, Math.PI * 2);
        else if (f === 'wardens') {
          ctx.moveTo(x - size, y);
          ctx.lineTo(x + size, y - size * 0.6);
          ctx.lineTo(x + size, y + size * 0.6);
          ctx.closePath();
        } else ctx.arc(x, y, size * 0.7, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(200,215,240,0.7)';
      ctx.font = '11px "JetBrains Mono Variable", monospace';
      ctx.fillText(f[0].toUpperCase() + f.slice(1), dist - 10, H * (0.18 + lane * 0.3) - 14);
    };
    ship('archivists', '#7fe3ff', 5, 1, 0);
    ship('wardens', game.s.factions.wardens.aggression > 70 ? '#ff6b5e' : '#ffb35e', 6, 3, 1);
    ship('pilgrims', '#c9a7ff', 8, 1, 2);
  };
  requestAnimationFrame(draw);
  return cv;
}
