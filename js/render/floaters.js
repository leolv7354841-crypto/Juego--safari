// Números que saltan sobre las bajas (+$ y +XP): suben, se desvanecen y se juntan si caen cerca,
// así una explosión que mata a diez deja un solo número grande en vez de diez chicos.
const LIFE = 0.9;
const MAX = 40;
const STYLE = {
  money: { color: '#ffd36a', size: 17, dy: 0 },
  xp: { color: '#8fd3ff', size: 12.5, dy: 15 },
};

export class Floaters {
  constructor() {
    this.list = [];
  }

  clear() {
    this.list.length = 0;
  }

  // kind: 'money' | 'xp'
  add(x, y, n, kind) {
    if (!(n > 0)) return;
    for (const f of this.list) {
      if (f.kind !== kind || f.t > 0.35 || Math.abs(f.x - x) > 60 || Math.abs(f.y - y) > 60) continue;
      f.n += n;
      f.t = 0;
      f.pop = 1;
      return;
    }
    if (this.list.length >= MAX) this.list.shift();
    this.list.push({ x, y, n, kind, t: 0, pop: 1 });
  }

  update(dt) {
    const l = this.list;
    for (let i = l.length - 1; i >= 0; i--) {
      const f = l[i];
      f.t += dt;
      f.pop = Math.max(0, f.pop - dt * 6);
      if (f.t >= LIFE) l.splice(i, 1);
    }
  }

  draw(ctx) {
    if (!this.list.length) return;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const f of this.list) {
      const st = STYLE[f.kind];
      const k = f.t / LIFE;
      // sube rápido y frena; los montos grandes se ven más grandes
      const y = f.y - 18 + st.dy - 34 * (1 - (1 - k) * (1 - k));
      const big = Math.min(1.6, 1 + Math.log10(Math.max(1, f.n)) * 0.25);
      const size = st.size * big * (1 + f.pop * 0.4);
      ctx.globalAlpha = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
      ctx.font = `800 ${size.toFixed(1)}px "Barlow Condensed", "Arial Narrow", sans-serif`;
      const text = f.kind === 'money' ? `+$${f.n}` : `+${f.n} XP`;
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = 'rgba(10,8,6,0.85)';
      ctx.strokeText(text, f.x, y);
      ctx.fillStyle = st.color;
      ctx.fillText(text, f.x, y);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }
}
