# Plan de refactorización (8 etapas)

Una etapa = una rama = PRs pequeños. Cada etapa termina con el juego funcionando y publicable.
Orden: red de seguridad → Vite → tipos → separar sim/dibujo → dividir main.js → red → TypeScript.

## Reglas para todas las etapas
- Nunca se mezcla refactorización con jugabilidad o balance: `js/config.js` no se toca (salvo mover constantes en la Etapa 4).
- Antes de juntar a `main`: CI en verde, preview de Vercel probada en Chrome y Safari iPhone, lista de pruebas manuales (Etapa 0).
- Un push a `main` que toque `js/` actualiza el servidor de Vultr (`servidor.yml`): juntar en horas de poco tráfico.
- `Player.move` sigue determinista y solo depende de la entrada.
- Balas del invitado/cliente online solo visuales; el daño lo calcula quien manda.
- `NET.tickHz` igual en cliente y servidor.
- El servidor nunca confía en posiciones ni impactos del cliente.
- TypeScript: solo sintaxis borrable (sin `enum`, decoradores ni propiedades en parámetros).
- Textos del juego en español.

## Etapas
0. [Preparación](etapa-0.md)
1. [Red de seguridad](etapa-1.md)
2. [Vite](etapa-2.md)
3. [Tipos con checkJs](etapa-3.md)
4. [Separar simulación y dibujo](etapa-4.md)
5. [Dividir main.js](etapa-5.md)
6. [Red](etapa-6.md)
7. [TypeScript real y cierre](etapa-7.md)
8. [Opcional: rendimiento](etapa-opcional-rendimiento.md)
