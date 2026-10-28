// Modo de la partida: quién manda y a quién se le piden las cosas.
//
// Antes cada módulo preguntaba por su cuenta si era anfitrión, invitado, partida de grupo o simulación remota.
// Ahora `game.mode` responde con nombres de lo que se quiere saber (¿simulo yo?, ¿puedo construir
// aquí?, ¿se guarda esta partida?) y cada modo sabe cómo pedirle las acciones a quien las ejecuta.
//
//   Solo          todo se calcula aquí (también tras irse el compañero: `detached`, que no se guarda).
//   CoopHost      el anfitrión del cooperativo P2P: simula el mundo para los dos.
//   CoopGuest     el invitado del cooperativo: predice su personaje; el daño lo calcula el anfitrión.
//   OnlineClient  cliente del servidor autoritativo: sólo manda intenciones.
//   ServerMode    el servidor (ServerSim) visto desde los módulos de simulación compartidos.
//
// Sólo importa tipos: carga igual en el navegador y en Node.
import type { GameHost, Vec } from '../core/types.d.ts';
import type { Player } from '../sim/player.ts';

/** Cómo se llama cada modo. */
export type ModeKind = 'solo' | 'coopHost' | 'coopGuest' | 'online' | 'server';
/** Estadísticas de un disparo que el invitado reporta al anfitrión. */
export type ShotStats = { dmgMult: number; pierce: number };
export type ShotWeapon = { id: string; damage: number; pierce: number };

export class Mode {
  declare game: GameHost;
  declare detached: boolean;
  constructor(game: GameHost, detached = false) {
    this.game = game;
    /** Solo tras un cooperativo o una partida en línea: la partida no se guarda ni toca tu progreso. */
    this.detached = detached;
  }

  /** 'solo' | 'coopHost' | 'coopGuest' | 'online' | 'server' */
  get kind(): ModeKind {
    return 'solo';
  }

  /** ¿Este dispositivo calcula el mundo y el daño? (falso: las balas propias son de adorno). */
  authority() {
    return true;
  }

  /** ¿Hay otros jugadores en la partida? (cooperativo, en línea o servidor). */
  inGroup() {
    return false;
  }

  /** ¿Se guarda la partida en solitario del jugador? */
  savesProgress() {
    return !this.detached;
  }

  /** ¿Las compras, el robot, las barricadas y los lanzables los ejecuta un servidor? */
  viaServer() {
    return false;
  }

  /** ¿Coloca las barricadas directamente aquí? (si no, las pide a quien manda). */
  canBuild() {
    return true;
  }

  hasRobot() {
    return true;
  }

  hasHeavy() {
    return true;
  }

  /** El compañero que se simula aquí (sólo el anfitrión del cooperativo). */
  hostedPeer(): Player | null {
    return null;
  }

  /** El otro jugador del cooperativo que se ve en pantalla (anfitrión o invitado). */
  companion(): Player | null {
    return null;
  }

  /* ---------- pedir cosas a quien manda (devuelven true si lo manejaron) ---------- */

  sendAbility(_p: Player, _t: Vec) {}

  sendNextRound() {
    return false;
  }

  sendBuild(_kind: string) {}

  sendThrow(_kind: string, _tx: number, _ty: number) {
    return false;
  }

  /** Disparo del jugador local: el invitado le avisa al anfitrión, que crea las balas con daño. */
  reportShot(_x: number, _y: number, _fired: number[], _d: ShotWeapon, _stats: ShotStats) {}

  /** Ácido en el suelo: el anfitrión avisa a su compañero si le toca. */
  onAcid(_x: number, _y: number, _R: number) {}

  /** Muerte del jugador local. true: el cooperativo la maneja (revive al terminar la oleada). */
  onLocalDeath() {
    return false;
  }

  onGameOver() {}

  /** Motivo por el que no se puede reiniciar aquí, o null. */
  restartBlocked(): string | null {
    return null;
  }

  /** Reinicio propio del modo (anfitrión). true: ya está hecho. */
  restart() {
    return false;
  }

  /** Un fotograma de juego. true: el modo lo avanzó él mismo (si no, corre la simulación local). */
  step(_dt: number) {
    return false;
  }

  /** Texto del indicador de conexión (una vez por segundo) o null. */
  netStats(_dt: number): string | null {
    return null;
  }
}

export class Solo extends Mode {}

export class CoopHost extends Mode {
  get kind(): ModeKind {
    return 'coopHost';
  }
  inGroup() {
    return true;
  }
  savesProgress() {
    return false;
  }
  hostedPeer() {
    return this.game.coop.peer;
  }
  companion() {
    return this.game.coop.peer;
  }
  onAcid(x: number, y: number, R: number) {
    this.game.coop.acidAt(x, y, R);
  }
  onLocalDeath() {
    this.game.coop.onLocalDeath();
    return true;
  }
  onGameOver() {
    this.game.coop.send({ t: 'over' });
  }
  restart() {
    this.game.coop.restart();
    return true;
  }
  netStats(dt: number) {
    return this.game.coop.stats(dt);
  }
}

export class CoopGuest extends Mode {
  get kind(): ModeKind {
    return 'coopGuest';
  }
  authority() {
    return false;
  }
  inGroup() {
    return true;
  }
  savesProgress() {
    return false;
  }
  canBuild() {
    return false;
  }
  hasRobot() {
    return false;
  }
  hasHeavy() {
    return false;
  }
  companion() {
    return this.game.coop.peer;
  }
  sendAbility(p: Player, t: Vec) {
    if (p.cls === 'bomber') this.game.coop.guestMissile(t.x, t.y);
  }
  sendNextRound() {
    this.game.coop.send({ t: 'next' });
    return true;
  }
  sendBuild(kind: string) {
    this.game.coop.guestBuild(kind);
  }
  sendThrow(kind: string, tx: number, ty: number) {
    this.game.coop.guestThrow(kind, tx, ty);
    return true;
  }
  reportShot(x: number, y: number, fired: number[], d: ShotWeapon, stats: ShotStats) {
    this.game.coop.sendShot(x, y, fired, d, stats);
  }
  onLocalDeath() {
    this.game.coop.onLocalDeath();
    return true;
  }
  restartBlocked() {
    return 'Espera a que el anfitrión reinicie la partida';
  }
  step(dt: number) {
    this.game.coop.guestUpdate(dt);
    return true;
  }
  netStats(dt: number) {
    return this.game.coop.stats(dt);
  }
}

export class OnlineClient extends Mode {
  get kind(): ModeKind {
    return 'online';
  }
  authority() {
    return false;
  }
  inGroup() {
    return true;
  }
  savesProgress() {
    return false;
  }
  viaServer() {
    return true;
  }
  canBuild() {
    return false;
  }
  sendAbility(_p: Player, t: Vec) {
    this.game.online.act('ab', { tx: Math.round(t.x), ty: Math.round(t.y) });
  }
  sendNextRound() {
    this.game.online.send('next');
    return true;
  }
  sendBuild(kind: string) {
    this.game.online.act('build', { kind });
  }
  sendThrow(kind: string, tx: number, ty: number) {
    this.game.online.act('throw', { kind, tx: Math.round(tx), ty: Math.round(ty) });
    return true;
  }
  restartBlocked() {
    return 'En línea la partida sigue mientras quede alguien vivo';
  }
  // en línea el mundo lo mueve el servidor (Online.update corre aparte, en cada fotograma)
  step(_dt: number) {
    return true;
  }
  netStats(dt: number) {
    return this.game.online.stats(dt);
  }
}

/** El servidor: simula (authority) y hay grupo, pero no guarda, no pide nada ni dibuja. */
export class ServerMode extends Mode {
  get kind(): ModeKind {
    return 'server';
  }
  inGroup() {
    return true;
  }
  savesProgress() {
    return false;
  }
}
