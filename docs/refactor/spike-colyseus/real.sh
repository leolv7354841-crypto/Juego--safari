#!/bin/bash
# uso: [ROOT=carpeta] real.sh etiqueta puertoServidor puertoWeb [latenciaMs]
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="${OUT:-$HERE/out}"; mkdir -p "$OUT"
cd "${ROOT:-$HERE/../../..}"
L=$1; SP=$2; WP=$3; LAT=${4:-}
if [ -n "$LAT" ]; then export COLYSEUS_LATENCY=$LAT; fi
(cd server && PORT=$SP HOST=127.0.0.1 node src/index.ts > "$OUT/srv-real-$L.log" 2>&1) &
S1=$!
npx vite preview --port $WP --strictPort > "$OUT/web-$L.log" 2>&1 &
S2=$!
sleep 4
node "$HERE/real.mjs" $L $SP $WP > "$OUT/real-$L.json" 2> "$OUT/real-$L.err"
kill $S1 $S2 2>/dev/null
echo done $L
