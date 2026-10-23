#!/usr/bin/env bash
# Deja lista una máquina Ubuntu 24.04 recién creada con el servidor en línea de Dead Zone:
# Docker, cortafuegos, actualizaciones de seguridad automáticas y el servidor con HTTPS.
# Uso, como root y dentro del repositorio clonado:
#   bash deploy/instalar.sh servidor.tu-dominio.com
set -euo pipefail

DOMAIN="${1:-}"
if [ -z "$DOMAIN" ]; then
  echo "Uso: bash deploy/instalar.sh servidor.tu-dominio.com"
  exit 1
fi
cd "$(dirname "$0")"

echo "== Paquetes =="
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q docker.io docker-compose-v2 ufw unattended-upgrades
systemctl enable --now docker

echo "== Cortafuegos: sólo SSH, 80 (certificado) y 443 (juego) =="
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "== Ajustes =="
[ -f .env ] || cp .env.example .env
sed -i "s|^DOMAIN=.*|DOMAIN=$DOMAIN|" .env
echo "deploy/.env listo (ALLOWED_ORIGINS y capacidad se cambian ahí):"
grep -v '^#' .env | grep -v '^$'

# sin el DNS apuntando aquí, Caddy no puede conseguir el certificado
dns=$(getent ahostsv4 "$DOMAIN" | awk 'NR==1{print $1}' || true)
if [ -z "$dns" ] || ! hostname -I | tr ' ' '\n' | grep -qx "$dns"; then
  echo
  echo "AVISO: $DOMAIN apunta a '${dns:-nada}', y las IP de esta máquina son: $(hostname -I)"
  echo "Crea (o corrige) el registro A del DNS hacia esta IP. Caddy reintentará el certificado solo."
  echo
fi

echo "== Arranque =="
docker compose up -d --build
echo
echo "Listo. En uno o dos minutos comprueba:  curl https://$DOMAIN/health"
echo "Registros:  docker compose -f $(pwd)/docker-compose.yml logs -f"
