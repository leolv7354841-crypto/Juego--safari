#!/bin/bash
# uso: [ROOT=carpeta] [SCHEMA_ZOMBIES=0] measure.sh etiqueta puerto [rooms] [latencia]
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="${OUT:-$HERE/out}"; mkdir -p "$OUT"
cd "${ROOT:-$HERE/../../..}"
L=$1; P=$2; R=${3:-5x4}; LAT=${4:-}
if [ -n "$LAT" ]; then export COLYSEUS_LATENCY=$LAT; fi
(cd server && PORT=$P HOST=127.0.0.1 node src/index.ts > "$OUT/srv-$L.log" 2>&1) &
SP=$!
sleep 3
node server/tools/load.ts --url ws://127.0.0.1:$P --secs 60 --rooms $R > "$OUT/load-$L.txt" 2>&1
kill $SP 2>/dev/null
echo done $L
