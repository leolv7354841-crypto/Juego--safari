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
  },
  'LobbyState',
);

// La forma que ve el cliente (LobbyMember) vive en js/core/types.d.ts; el esquema es la
// fuente de verdad en el servidor. Si dejan de coincidir, estos tipos pasan a `never` y no compila.
type MemberSchema = InstanceType<typeof Member>;
export type MemberT = MemberSchema extends LobbyMember ? MemberSchema : never;
export type LobbyStateT = InstanceType<typeof LobbyState>;
