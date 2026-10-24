// Entrada unificada: teclado + ratón en computadora, joystick virtual y
// botones en pantalla para móviles (Pointer Events: Safari y Chrome).
import { clamp } from './util.js';

const JOY_RADIUS = 56;

export class Input {
  constructor(root, canvas) {
    this.root = root;
    this.canvas = canvas;
    this.keys = new Set();
    this.mouse = { x: 0, y: 0, down: false };
    this.mode = matchMedia('(pointer: coarse)').matches ? 'touch' : 'mouse';
    this.joy = { id: null, bx: 0, by: 0, x: 0, y: 0 };
    this.touchFire = false;
    this.runToggle = false;
    this.pressed = {};
    this.vec = { x: 0, y: 0 };
    this.listeners = [];
    this.onModeChange = null;
    this.bind();
  }

  setMode(m) {
    if (this.mode === m) return;
    this.mode = m;
    if (this.onModeChange) this.onModeChange(m);
  }

  on(el, ev, fn, opts) {
    el.addEventListener(ev, fn, opts);
  }

  bind() {
    const prevent = (e) => e.preventDefault();
    this.on(window, 'keydown', (e) => {
      // escribiendo en un campo (nombre, PIN): no son atajos del juego
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (e.repeat && this.keys.has(e.code)) return;
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (e.code === 'KeyR') this.pressed.reload = true;
      if (e.code === 'KeyQ' || e.code === 'Tab') this.pressed.swap = true;
      if (e.code === 'KeyF') this.pressed.build = true;
      if (e.code === 'KeyV') this.pressed.cycleBuild = true;
      if (e.code === 'KeyG') this.pressed.grenade = true;
      if (e.code === 'KeyT') this.pressed.molotov = true;
      if (e.code === 'KeyE') this.pressed.robot = true;
      if (e.code === 'KeyU') this.pressed.upgrade = true;
      if (e.code === 'Enter' || e.code === 'NumpadEnter') this.pressed.nextRound = true;
      if (e.code === 'Escape' || e.code === 'KeyP') this.pressed.pause = true;
      const m = /^Digit([1-9])$/.exec(e.code);
      if (m) this.pressed.slot = Number(m[1]);
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) this.setMode('mouse');
    });
    this.on(window, 'keyup', (e) => this.keys.delete(e.code));
    this.on(window, 'blur', () => this.reset());

    const c = this.canvas;
    this.on(c, 'pointerdown', (e) => {
      if (e.pointerType === 'mouse') {
        this.setMode('mouse');
        this.mouse.x = e.clientX;
        this.mouse.y = e.clientY;
        if (e.button === 0) this.mouse.down = true;
      } else {
        this.setMode('touch');
      }
    });
    this.on(window, 'pointermove', (e) => {
      if (e.pointerType === 'mouse') {
        this.mouse.x = e.clientX;
        this.mouse.y = e.clientY;
      }
    });
    this.on(window, 'pointerup', (e) => {
      if (e.pointerType === 'mouse' && e.button === 0) this.mouse.down = false;
    });
    this.on(c, 'contextmenu', prevent);

    // joystick: zona izquierda de la pantalla, aparece donde tocas
    const zone = this.root.querySelector('#joy-zone');
    const base = this.root.querySelector('#joy-base');
    const knob = this.root.querySelector('#joy-knob');
    this.joyEls = { base, knob, zone };
    this.on(zone, 'pointerdown', (e) => {
      e.preventDefault();
      this.setMode('touch');
      if (this.joy.id !== null) return;
      this.joy.id = e.pointerId;
      try {
        zone.setPointerCapture(e.pointerId);
      } catch {
        /* algunos navegadores no lo permiten */
      }
      this.joy.bx = e.clientX;
      this.joy.by = e.clientY;
      this.joy.x = 0;
      this.joy.y = 0;
      base.classList.add('active');
      this.placeJoy();
    });
    this.on(zone, 'pointermove', (e) => {
      if (e.pointerId !== this.joy.id) return;
      e.preventDefault();
      let dx = e.clientX - this.joy.bx;
      let dy = e.clientY - this.joy.by;
      const d = Math.hypot(dx, dy);
      if (d > JOY_RADIUS * 1.6) {
        // la base sigue al dedo si se aleja mucho
        this.joy.bx += (dx / d) * (d - JOY_RADIUS * 1.6);
        this.joy.by += (dy / d) * (d - JOY_RADIUS * 1.6);
        dx = e.clientX - this.joy.bx;
        dy = e.clientY - this.joy.by;
      }
      const dd = Math.hypot(dx, dy);
      const k = dd > JOY_RADIUS ? JOY_RADIUS / dd : 1;
      this.joy.x = (dx * k) / JOY_RADIUS;
      this.joy.y = (dy * k) / JOY_RADIUS;
      this.placeJoy();
    });
    const endJoy = (e) => {
      if (e.pointerId !== this.joy.id) return;
      this.joy.id = null;
      this.joy.x = 0;
      this.joy.y = 0;
      base.classList.remove('active');
      base.style.transform = '';
      knob.style.transform = '';
    };
    this.on(zone, 'pointerup', endJoy);
    this.on(zone, 'pointercancel', endJoy);
    this.on(zone, 'lostpointercapture', endJoy);

    const hold = (sel, set) => {
      const el = this.root.querySelector(sel);
      const ids = new Set();
      this.on(el, 'pointerdown', (e) => {
        e.preventDefault();
        this.setMode('touch');
        ids.add(e.pointerId);
        try {
          el.setPointerCapture(e.pointerId);
        } catch {
          /* sin captura */
        }
        set(true);
        el.classList.add('down');
      });
      const up = (e) => {
        ids.delete(e.pointerId);
        if (!ids.size) {
          set(false);
          el.classList.remove('down');
        }
      };
      this.on(el, 'pointerup', up);
      this.on(el, 'pointercancel', up);
      this.on(el, 'lostpointercapture', up);
    };
    hold('#btn-fire', (v) => (this.touchFire = v));
    const tap = (sel, fn) => {
      const el = this.root.querySelector(sel);
      this.on(el, 'pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.setMode('touch');
        fn(el);
      });
    };
    tap('#btn-run', () => this.setRun(!this.runToggle));
    tap('#btn-reload', () => (this.pressed.reload = true));
    tap('#btn-swap', () => (this.pressed.swap = true));
    tap('#btn-build', () => (this.pressed.build = true));
    tap('#btn-grenade', () => (this.pressed.grenade = true));
    tap('#btn-molotov', () => (this.pressed.molotov = true));
    tap('#btn-robot', () => (this.pressed.robot = true));

    // evita zoom por gestos y menú contextual en iOS
    this.on(document, 'gesturestart', prevent);
    this.on(document, 'dblclick', prevent);
    this.on(this.root, 'touchmove', (e) => {
      if (e.cancelable && !e.target.closest('.screen')) e.preventDefault();
    }, { passive: false });
  }

  setRun(v) {
    this.runToggle = v;
    this.root.querySelector('#btn-run').classList.toggle('on', v);
  }

  placeJoy() {
    const { base, knob } = this.joyEls;
    const rect = this.joyEls.zone.getBoundingClientRect();
    base.style.transform = `translate(${this.joy.bx - rect.left}px, ${this.joy.by - rect.top}px)`;
    knob.style.transform = `translate(${this.joy.x * JOY_RADIUS}px, ${this.joy.y * JOY_RADIUS}px)`;
  }

  move() {
    let x = 0;
    let y = 0;
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) y -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (x || y) {
      const d = Math.hypot(x, y);
      this.vec.x = x / d;
      this.vec.y = y / d;
      return this.vec;
    }
    // zona muerta del joystick
    const jl = Math.hypot(this.joy.x, this.joy.y);
    if (jl < 0.15) {
      this.vec.x = 0;
      this.vec.y = 0;
    } else {
      const m = clamp((jl - 0.15) / 0.85, 0, 1);
      this.vec.x = (this.joy.x / jl) * m;
      this.vec.y = (this.joy.y / jl) * m;
    }
    return this.vec;
  }

  get run() {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.runToggle;
  }

  get firing() {
    return this.mouse.down || this.touchFire || this.keys.has('Space');
  }

  consume(name) {
    const v = this.pressed[name];
    this.pressed[name] = false;
    return v;
  }

  reset() {
    this.keys.clear();
    this.mouse.down = false;
    this.touchFire = false;
    this.pressed = {};
    this.root.querySelectorAll('.tbtn.down').forEach((el) => el.classList.remove('down'));
  }
}
