// Teclado, ratón y controles táctiles (joystick virtual y botones).
export class Input {
  constructor(root, canvas) {
    this.keys = new Set();
    this.queue = new Set();
    this.mouse = { x: 0, y: 0, active: false };
    this.mode = 'mouse';
    this.joy = { x: 0, y: 0, id: null, ox: 0, oy: 0 };
    this.touchBoost = false;
    this.onModeChange = null;
    const press = (k) => this.queue.add(k);
    addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'tab'].includes(k)) e.preventDefault();
      if (!e.repeat) {
        if (k === ' ') press('sonic');
        if (k === 'j' || k === 'k') press('punch');
        if (k === 'escape' || k === 'p') press('pause');
        if (k === 'enter') press('enter');
      }
      this.keys.add(k);
      this.setMode('mouse');
    });
    addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.mouse.active = true;
      this.setMode('mouse');
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) press('punch');
      if (e.button === 2) press('sonic');
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // táctil
    const zone = root.querySelector('#joy-zone');
    const base = root.querySelector('#joy-base');
    const knob = root.querySelector('#joy-knob');
    const R = 52;
    const setKnob = () => {
      knob.style.transform = `translate(${this.joy.x * R}px, ${this.joy.y * R}px)`;
    };
    zone.addEventListener('touchstart', (e) => {
      this.setMode('touch');
      const t = e.changedTouches[0];
      this.joy.id = t.identifier;
      this.joy.ox = t.clientX;
      this.joy.oy = t.clientY;
      base.style.left = t.clientX + 'px';
      base.style.top = t.clientY + 'px';
      base.classList.add('on');
      e.preventDefault();
    }, { passive: false });
    zone.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== this.joy.id) continue;
        let dx = (t.clientX - this.joy.ox) / R;
        let dy = (t.clientY - this.joy.oy) / R;
        const l = Math.hypot(dx, dy);
        if (l > 1) (dx /= l), (dy /= l);
        this.joy.x = dx;
        this.joy.y = dy;
        setKnob();
      }
      e.preventDefault();
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== this.joy.id) continue;
        this.joy.id = null;
        this.joy.x = this.joy.y = 0;
        setKnob();
        base.classList.remove('on');
      }
    };
    zone.addEventListener('touchend', end);
    zone.addEventListener('touchcancel', end);
    const btn = (id, down, up) => {
      const el = root.querySelector(id);
      el.addEventListener('touchstart', (e) => {
        this.setMode('touch');
        el.classList.add('down');
        down();
        e.preventDefault();
      }, { passive: false });
      const off = () => {
        el.classList.remove('down');
        if (up) up();
      };
      el.addEventListener('touchend', off);
      el.addEventListener('touchcancel', off);
    };
    btn('#btn-boost', () => (this.touchBoost = true), () => (this.touchBoost = false));
    btn('#btn-sonic', () => press('sonic'));
    btn('#btn-punch', () => press('punch'));
  }

  setMode(m) {
    if (m === this.mode) return;
    this.mode = m;
    if (this.onModeChange) this.onModeChange(m);
  }

  move() {
    if (this.joy.id !== null) return { x: this.joy.x, y: this.joy.y };
    const k = this.keys;
    let x = 0;
    let y = 0;
    if (k.has('a') || k.has('arrowleft')) x -= 1;
    if (k.has('d') || k.has('arrowright')) x += 1;
    if (k.has('w') || k.has('arrowup')) y -= 1;
    if (k.has('s') || k.has('arrowdown')) y += 1;
    const l = Math.hypot(x, y);
    return l ? { x: x / l, y: y / l } : { x: 0, y: 0 };
  }

  get boost() {
    return this.keys.has('shift') || this.touchBoost;
  }

  consume(k) {
    if (this.queue.has(k)) {
      this.queue.delete(k);
      return true;
    }
    return false;
  }
  clear() {
    this.queue.clear();
  }
}
