# Imagen del servidor en línea. Se construye desde la raíz del repositorio porque el servidor
# importa los módulos del juego de js/ (ver deploy/docker-compose.yml).
FROM node:24-alpine

WORKDIR /app
# "type": "module" de la raíz: js/*.js son módulos ES
COPY package.json ./
COPY server/package.json server/package-lock.json server/
RUN npm ci --prefix server --omit=dev && npm cache clean --force
COPY js js
COPY server/src server/src

ENV NODE_ENV=production HOST=0.0.0.0 PORT=2567
USER node
EXPOSE 2567
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:2567/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "server/src/index.ts"]
