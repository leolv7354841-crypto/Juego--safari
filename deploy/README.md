# Servidor en línea en una máquina virtual (5 salas × 4 jugadores)

Guía para dejar el servidor del modo **En línea** en una máquina virtual propia, siempre
encendida, con HTTPS (`wss://`) y reinicio automático. Capacidad configurada: **4 jugadores por
sala y 5 salas a la vez** (20 jugadores en total). Si se piden más salas, el juego muestra
«El servidor está lleno»; a una sala existente se puede seguir entrando hasta que tenga 4.

Fecha de referencia de precios: octubre de 2026 (API pública de Vultr).

## Qué comprar

**Recomendado: Vultr · Cloud Compute · High Performance (AMD) · 2 vCPU, 2 GB · Ciudad de México
· 18 USD al mes.** Incluye 60 GB de disco y 4 TB de tráfico al mes.

- **Ciudad de México** porque es donde están los jugadores: cuanto más cerca, menos ping. Si
  juegan sobre todo en otro sitio, elige la región más cercana (Dallas o Los Ángeles para el norte
  de México y EE. UU.; Madrid para España).
- **2 vCPU**: el servidor (Node) usa un núcleo para todas las salas; el otro queda para el
  sistema, el HTTPS y la recolección de memoria, así que un pico nunca frena la partida.
- **High Performance** en vez de *Regular*: núcleos más rápidos por poco más (18 frente a 15 USD);
  la simulación va a 60 pasos por segundo y agradece la CPU rápida.
- No hace falta comprar copias de seguridad: el servidor no guarda nada (todo está en el
  repositorio; las partidas viven en memoria).

Medido en un PC de escritorio con 5 salas de 4 bots durante 60 s: 60 pasos/s en todas las salas,
0 pasos perdidos, paso medio 0,44 ms y peor 4,8 ms (el límite es 16,7 ms), CPU media 18 % de un
núcleo con picos de 51 % al cargar los mapas, 150 MB de RAM y ~22 KB/s por jugador. Con 20
jugadores eso son ~3,5 Mbit/s de salida: 4 horas diarias con el servidor lleno gastan unos
200 GB al mes de los 4 TB incluidos. Un vCPU de servidor es algo más lento que un PC de escritorio,
y para eso está el margen.

| Opción | Precio/mes | ¿Sirve para 5×4? |
| --- | --- | --- |
| **Vultr High Performance AMD 2 vCPU / 2 GB, Ciudad de México** | **18 USD** | **Sí, con margen (recomendado)** |
| Vultr High Performance AMD 1 vCPU / 2 GB, Ciudad de México | 12 USD | Sí, justo: los picos compiten con el sistema |
| Vultr High Performance AMD 2 vCPU / 4 GB, Ciudad de México | 24 USD | Sí; la RAM extra no hace falta hoy |
| Render plan gratis (lo anterior) | 0 | No: 0,1 CPU, se duerme y tarda un minuto en despertar |

## Pasos

### 1. Crear la máquina (en vultr.com)

1. Crea la cuenta en [vultr.com](https://www.vultr.com) y añade un método de pago.
2. **Deploy → Cloud Compute → Shared CPU → High Performance (AMD)**.
3. Ubicación: **Mexico City**. Sistema: **Ubuntu 24.04 LTS x64**. Plan: **2 vCPU, 2 GB (18 USD)**.
4. Desactiva *Auto Backups* (no hacen falta). Si tienes una clave SSH, añádela; si no, Vultr te
   muestra la contraseña de `root` en la ficha del servidor.
5. Nombre: `dead-zone`. **Deploy**. Cuando diga *Running*, copia su **IP**.

### 2. Apuntar un nombre a la máquina (en tu proveedor de dominio)

En el panel DNS de `yeyo.games` crea un registro **A**: nombre `servidor`, valor **la IP** de la
máquina (TTL bajo, por ejemplo 300). La dirección del servidor será `servidor.yeyo.games`. Hace
falta un nombre porque los navegadores sólo aceptan `wss://` con certificado, y el certificado
se pide para un nombre, no para una IP.

### 3. Instalar el servidor (en la máquina)

Desde PowerShell en tu PC:

```bash
ssh root@LA-IP-DE-LA-MAQUINA
```

Ya dentro de la máquina:

```bash
apt-get update && apt-get install -y git
git clone https://github.com/leolv7354841-crypto/Juego--safari.git dead-zone
cd dead-zone
bash deploy/instalar.sh servidor.yeyo.games
```

El script instala Docker, abre en el cortafuegos sólo SSH, 80 y 443, activa las actualizaciones
de seguridad automáticas, crea `deploy/.env` y arranca dos contenedores que se reinician solos
(también tras reiniciar la máquina): el servidor del juego y Caddy, que consigue y renueva el
certificado HTTPS. Si el repositorio es privado, `git clone` te pedirá usuario y un token de
GitHub.

### 4. Comprobar

En el navegador abre `https://servidor.yeyo.games/health`. Debe responder algo como
`{"ok":true,"rooms":0,"maxRooms":5,"maxPlayers":4,...}`. La primera vez puede tardar un minuto
mientras Caddy consigue el certificado.

Prueba el juego sin publicar nada abriendo tu página con `?servidor=wss://servidor.yeyo.games`
(por ejemplo `https://yeyo.games/deadzone/?servidor=wss://servidor.yeyo.games`).

Prueba de carga con 20 bots desde tu PC (5 salas de 4, contra el servidor real):

```bash
node server/tools/load.ts --url wss://servidor.yeyo.games --origin https://yeyo.games --secs 60
```

Mira que «pasos/s por sala» quede en 60 y «descartados» en 0.

### 5. Hacer que el juego use el servidor nuevo (en tu PC)

1. En `js/config.js` cambia `NET.server` a `'wss://servidor.yeyo.games'`.
2. Haz commit y push: Vercel publica el juego.
3. Cuando todo funcione, puedes borrar el servicio de Render.

## Mantenimiento

- **Actualizar a mano** (si no configuraste la publicación automática): en la máquina,
  `cd ~/dead-zone && bash deploy/actualizar.sh --esperar`. Espera a que no haya salas abiertas
  (como mucho 30 minutos); sin `--esperar` reinicia ya y las partidas en curso se pierden. Si no
  cambió nada que use el servidor (`server/`, `js/`, `deploy/`), no reinicia.
- **Ver registros:** `cd ~/dead-zone/deploy && docker compose logs -f dz`
- **Estado:** `docker compose ps` (en `deploy/`) o `https://servidor.yeyo.games/health`.
- **Cambiar capacidad o páginas permitidas:** edita `deploy/.env` (`MAX_PLAYERS`, `MAX_ROOMS`,
  `ALLOWED_ORIGINS`…) y ejecuta `docker compose up -d` en `deploy/`. Si subes la capacidad,
  repite la prueba de carga con más salas (`--rooms 8x4`) antes de anunciarlo.
- Si añades otro dominio para el juego, agrégalo a `ALLOWED_ORIGINS`; si no, el servidor rechaza
  esa página con el error «origen».

## Publicación automática

Con esto, cada push a `main` que cambie `server/`, `js/` o `deploy/` actualiza la
máquina solo (`.github/workflows/servidor.yml`), esperando a que no haya salas abiertas.
Hace falta la cuenta dueña del repositorio, porque los secretos de GitHub sólo los puede
crear un administrador.

1. En la máquina (`ssh root@LA-IP`), crea una clave que **sólo** pueda ejecutar la actualización:

   ```bash
   ssh-keygen -t ed25519 -N "" -C github-deploy -f ~/.ssh/github-deploy
   echo "command=\"bash /root/dead-zone/deploy/actualizar.sh --esperar\",no-pty,no-port-forwarding,no-agent-forwarding,no-X11-forwarding $(cat ~/.ssh/github-deploy.pub)" >> ~/.ssh/authorized_keys
   cat ~/.ssh/github-deploy
   ```

   Copia todo lo que muestra el último comando, desde `-----BEGIN` hasta `END … KEY-----`.

2. En GitHub, en el repositorio: **Settings → Secrets and variables → Actions → New repository
   secret**. Crea dos:
   - `SERVER_HOST`: `servidor.yeyo.games`
   - `SERVER_SSH_KEY`: la clave que copiaste.

3. Vuelve a la máquina y borra la copia de la clave privada: `rm ~/.ssh/github-deploy`.

4. Pruébalo en GitHub: **Actions → Publicar servidor → Run workflow**. Debe terminar en verde
   mostrando la respuesta de `/health`.

Aunque alguien consiguiera esa clave, sólo podría lanzar la actualización desde el repositorio:
no da una terminal en la máquina. Para revocarla, borra su línea (`github-deploy`) de
`~/.ssh/authorized_keys`.

## Cómo protege los 5 cupos

- Una sala sin partida (esperando o en resultados) se cierra a los 20 minutos
  (`IDLE_ROOM_MINUTES`): una pestaña olvidada no ocupa un cupo para siempre.
- Una sala vacía se borra a los 30 s; una sala creada a la que nunca entra nadie, al caducar la
  reserva (unos 15 s).
- El origen de la página se comprueba antes de crear la sala: otra web no puede ocupar cupos.
  Un programa que no sea un navegador sí puede falsear el origen; para un juego entre amigos es
  suficiente, pero no es una protección contra ataques.
