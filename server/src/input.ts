// Entrada de un jugador por el canal de entradas de Colyseus 0.18 (room.input() en el cliente,
// defineInput en la sala). Reemplaza al mensaje 'in' con arreglos JSON. Sólo viaja lo que cambia
// (codificación delta) y el SDK cuenta las entradas enviadas (su secuencia) sin que la mandemos.
import { schema, t, type SchemaType } from '@colyseus/schema';

export const MoveInput = schema(
  {
    mx: t.float32(), // movimiento, -1..1
    my: t.float32(),
    f: t.uint8(), // bits: IN_RUN, IN_FIRE, IN_RELOAD (js/net/protocol.ts)
    a: t.float32(), // ángulo de la mira
    w: t.int8(), // arma elegida, -1 = la actual
  },
  'MoveInput',
);

export type MoveInputT = SchemaType<typeof MoveInput>;

// Rangos que el servidor impone (la sanitización de defineInput los aplica sin rechazar la entrada).
export const MOVE_SANITIZE = {
  mx: [-1, 1],
  my: [-1, 1],
  f: [0, 7],
  a: [-1000, 1000],
  w: [-1, 8],
} as const;
