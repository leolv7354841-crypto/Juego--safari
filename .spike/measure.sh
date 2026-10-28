#!/bin/bash
# uso: measure.sh etiqueta puerto [rooms] [latencia]
cd "$(dirname "$0")/../server"
L=$1; P=$2; R=${3:-5x4}; LAT=${4:-}
if [ -n "$LAT" ]; then export COLYSEUS_LATENCY=$LAT; fi
PORT=$P HOST=127.0.0.1 node src/index.ts > ../.spike/srv-$L.log 2>&1 &
SP=$!
sleep 3
cd ..
node server/tools/load.ts --url ws://127.0.0.1:$P --secs 60 --rooms $R > .spike/load-$L.txt 2>&1
kill $SP 2>/dev/null
echo done $L
