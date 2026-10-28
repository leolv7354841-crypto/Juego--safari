// Estado de la sala que Colyseus sincroniza solo con todos (lista de jugadores y fase).
// Lo que cambia muchas veces por segundo (posiciones, zombis) va aparte, en mensajes 'snap'.
import { schema, t } from '@colyseus/schema';
import type { LobbyMember } from '../../../js/core/types.d.ts';

export const Member = schema(
  {
    name: t.string(),
    look: t.string(), // colores del personaje (código de dígitos, ver cleanLookCode)
    cls: t.string(), // clase elegida para la partida (bomber, berserker, booster)
    idx: t.uint8(), // número estable del jugador en esta sala (lo usan las fotos)
    ready: t.boolean(),
    connected: t.boolean(),
    inGame: t.boolean(),
    alive: t.boolean(),
    kills: t.uint16(),
    joinedAt: t.number(),
  },
  'Member',
);

// Cuerpo del jugador (lo que mueve Player.move): el cliente lo reconcilia con el módulo predict del SDK.
// Se actualiza en cada paso de la simulación; los cambios viajan como deltas con el ack de las entradas.
export const Body = schema(
  {
    x: t.float32(),
    y: t.float32(),
    vx: t.float32(),
    vy: t.float32(),
    kx: t.float32(),
    ky: t.float32(),
    stamina: t.float32(),
    sinceRun: t.float32(),
    legAngle: t.float32(),
    boostT: t.float32(),
    exhausted: t.boolean(),
  },
  'Body',
);

// Un zombi visible (spike): cada jugador sólo recibe los que tiene en su StateView. Los mismos números
// que viajan en los arreglos z/zx/zh de la foto, pero como campos del Schema (con deltas).
export const ZombieS = schema(
  {
    t: t.uint8(), // tipo (índice en TYPES)
    x: t.int32(),
    y: t.int32(),
    a: t.uint8(), // ángulo en 64 pasos
    fl: t.uint8(), // banderas (zombieFlags)
    hp: t.uint8(), // vida en % de los heridos con barra; 0 = sin barra
    air: t.uint16(),
    sw: t.uint16(), // hinchazón x100
  },
  'ZombieS',
);

export const LobbyState = schema(
  {
    // waiting = esperando · loading = cargando · playing = jugando · finished = finalizada
    phase: t.string(),
    ownerId: t.string(),
    code: t.string(),
    maxPlayers: t.uint8(),
    minPlayers: t.uint8(),
    wave: t.uint16(),
    members: t.map(Member),
    bodies: t.map(Body),
    zombies: t.map(ZombieS).view(),
  },
  'LobbyState',
);

// La forma que ve el cliente (LobbyMember) vive en js/core/types.d.ts; el esquema es la
// fuente de verdad en el servidor. Si dejan de coincidir, estos tipos pasan a `never` y no compila.
type MemberSchema = InstanceType<typeof Member>;
export type MemberT = MemberSchema extends LobbyMember ? MemberSchema : never;
export type LobbyStateT = InstanceType<typeof LobbyState>;
