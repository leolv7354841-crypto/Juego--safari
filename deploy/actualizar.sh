#!/usr/bin/env bash
# Baja la última versión del repositorio y reinicia el servidor con ella.
# Las partidas en curso se pierden (los jugadores reciben el aviso de reinicio): hazlo cuando no se juegue.
#   bash deploy/actualizar.sh
set -euo pipefail
cd "$(dirname "$0")"
git pull --ff-only
docker compose up -d --build
docker image prune -f > /dev/null
docker compose ps
