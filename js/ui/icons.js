// Íconos SVG de la interfaz: corona del podio, objetos del inventario y nombres cortos de armas.

export const CROWN_SVG =
  '<svg viewBox="0 0 48 32" aria-hidden="true"><path d="M4 28 L2 8 L14 17 L24 2 L34 17 L46 8 L44 28 Z" fill="currentColor"/><circle cx="2" cy="8" r="2.5" fill="currentColor"/><circle cx="24" cy="2" r="2.5" fill="currentColor"/><circle cx="46" cy="8" r="2.5" fill="currentColor"/><rect x="4" y="25" width="40" height="5" fill="currentColor" opacity="0.7"/></svg>';

// Nombre corto de cada arma para los botones de la barra de armas.
export const SHORT = {
  pistol: 'Pis',
  smg: 'Smg',
  shotgun: 'Esc',
  rifle: 'Rif',
  ar: 'Fus',
  autoshotgun: 'EscA',
  sniper: 'Fra',
  lmg: 'Amet',
  bazooka: 'Baz',
};
// Un ícono por pieza de construcción o lanzable del inventario.
export const ITEM_ICONS = {
  molotov:
    '<svg viewBox="0 0 12 12"><ellipse cx="5" cy="7.5" rx="3.2" ry="3.4" fill="#7a9660" stroke="#141612" stroke-width=".8"/><rect x="4" y="2" width="2" height="3" fill="#7a9660" stroke="#141612" stroke-width=".6"/><circle cx="5" cy="1.6" r="1.5" fill="#ff9a30"/></svg>',
  grenade:
    '<svg viewBox="0 0 12 12"><ellipse cx="5.5" cy="7" rx="4" ry="4" fill="#5a6b3c" stroke="#141612"/><rect x="7" y="1.5" width="3" height="3" fill="#d9783a"/></svg>',
  wood: '<svg viewBox="0 0 12 12"><rect x="1" y="1" width="10" height="10" fill="#7a5634" stroke="#141612"/><path d="M2 2l8 8" stroke="#4a3220" stroke-width="1.5"/></svg>',
  metal:
    '<svg viewBox="0 0 12 12"><rect x="1" y="1" width="10" height="10" fill="#8a8f93" stroke="#141612"/><path d="M2 10l8-8" stroke="#c9cdd0"/></svg>',
  fence:
    '<svg viewBox="0 0 12 12"><rect x="0.5" y="3.5" width="11" height="5" fill="#3c4146" stroke="#141612"/><path d="M2 4l3 4M5 4l3 4M8 4l3 4" stroke="#9aa1a8" stroke-width=".8"/><rect x="0.5" y="3.5" width="2" height="5" fill="#c7a24a"/></svg>',
  sandbag:
    '<svg viewBox="0 0 12 12"><ellipse cx="3.5" cy="6" rx="3" ry="2.5" fill="#8a7d5c" stroke="#141612" stroke-width=".8"/><ellipse cx="8.5" cy="6" rx="3" ry="2.5" fill="#7f7354" stroke="#141612" stroke-width=".8"/></svg>',
  concrete:
    '<svg viewBox="0 0 12 12"><rect x="0.5" y="3" width="11" height="6" fill="#8c8a84" stroke="#141612"/><rect x="0.5" y="3" width="11" height="2" fill="#a3a19a"/></svg>',
  hesco:
    '<svg viewBox="0 0 12 12"><rect x="0.5" y="2.5" width="11" height="7" fill="#c9b98c" stroke="#141612"/><rect x="1.8" y="3.8" width="3.6" height="4.4" fill="#a8966a"/><rect x="6.6" y="3.8" width="3.6" height="4.4" fill="#a8966a"/><path d="M6 2.5v7" stroke="#6e7070" stroke-width=".8"/></svg>',
  reinforced:
    '<svg viewBox="0 0 12 12"><rect x="0.5" y="2.5" width="11" height="7" fill="#7b7973" stroke="#141612"/><rect x="2.4" y="3.6" width="3.2" height="4.8" fill="#7a4c2c"/><rect x="6.4" y="3.6" width="3.2" height="4.8" fill="#7a4c2c"/><path d="M1.4 2v8M10.6 2v8M6 2v8" stroke="#3f4448" stroke-width="1.2"/></svg>',
  turret:
    '<svg viewBox="0 0 12 12"><rect x="1" y="1" width="10" height="10" fill="#3d4246" stroke="#141612"/><circle cx="6" cy="6" r="3" fill="#5c6268"/><rect x="6" y="5" width="5.5" height="2" fill="#1e2124"/></svg>',
  heavy:
    '<svg viewBox="0 0 12 12"><path d="M6 6L2 1.5M6 6l-4 4.5M6 6l-.5 5" stroke="#141612" stroke-width="1.6"/><rect x="2.5" y="2.5" width="5" height="7" rx="1" fill="#7b838a" stroke="#141612" stroke-width=".8"/><rect x="7.5" y="3.5" width="4.5" height="1.6" fill="#25282b"/><rect x="7.5" y="6.9" width="4.5" height="1.6" fill="#25282b"/><rect x="3" y="5.6" width="4" height=".8" fill="#c9a54a"/></svg>',
  spikes:
    '<svg viewBox="0 0 12 12"><rect x="1" y="1" width="10" height="10" fill="#4a4740" stroke="#141612"/><path d="M3 5l1-2 1 2M7 5l1-2 1 2M3 10l1-2 1 2M7 10l1-2 1 2" fill="#b8b2a4"/></svg>',
  mine: '<svg viewBox="0 0 12 12"><circle cx="6" cy="6" r="4.5" fill="#4a5236" stroke="#141612"/><circle cx="6" cy="6" r="1.4" fill="#ff5a3a"/></svg>',
  wire: '<svg viewBox="0 0 12 12"><path d="M0 6l2-3 2 6 2-6 2 6 2-6 2 3" fill="none" stroke="#c9c4b6" stroke-width="1.2"/></svg>',
};
