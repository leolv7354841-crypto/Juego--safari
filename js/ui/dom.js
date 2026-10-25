// Ayudas mínimas del DOM para los módulos de interfaz.

/** @param {EventTarget | null} t @param {string} sel @returns {HTMLElement | null} */
export const closest = (t, sel) => /** @type {HTMLElement} */ (t).closest(sel);

/** Conecta el clic de un botón por su id. @param {{ $: (id: string) => any }} game */
export const on = (game, id, fn) => game.$(id).addEventListener('click', fn);
