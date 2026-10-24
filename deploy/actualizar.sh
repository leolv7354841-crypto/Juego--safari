#!/usr/bin/env bash
# Baja la última versión del repositorio y reinicia el servidor con ella.
#   bash deploy/actualizar.sh            → actualiza ya (las partidas en curso se pierden)
#   bash deploy/actualizar.sh --esperar  → espera a que no haya salas abiertas (máximo 30 min);
#                                          es lo que usa la publicación automática de GitHub
# Si no cambió nada que use el servidor (server/, js/, deploy/), no reinicia.
set -euo pipefail
cd "$(dirname "$0")"

antes=$(git rev-parse HEAD)
# sigue la rama principal de GitHub aunque cambie de nombre (por ejemplo, al pasar a main)
rama=$(git ls-remote --symref origin HEAD | sed -n 's|^ref: refs/heads/\(.*\)\tHEAD$|\1|p')
git fetch -q origin "$rama"
git checkout -q -B "$rama" --track "origin/$rama"
if [ "$antes" != "$(git rev-parse HEAD)" ] && git diff --quiet "$antes" HEAD -- ../server ../js ../deploy ../package.json; then
  echo "Sin cambios para el servidor: no hace falta reiniciar."
  exit 0
fi

if [ "${1:-}" = "--esperar" ]; then
  salas() {
    docker compose exec -T dz node -e "fetch('http://127.0.0.1:2567/health').then((r) => r.json()).then((j) => console.log(j.rooms), () => console.log(0))" 2>/dev/null || echo 0
  }
  for i in $(seq 1 60); do
    n=$(salas)
    [ "$n" = "0" ] && break
    echo "Hay $n sala(s) abiertas: espero 30 s ($i/60)…"
    sleep 30
  done
fi

docker compose up -d --build
docker image prune -f > /dev/null
docker compose ps
