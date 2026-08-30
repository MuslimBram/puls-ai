FROM node:22-alpine

WORKDIR /app
COPY server.mjs /app/server.mjs

ENV NODE_ENV=production \
    PORT=8080 \
    CLAMD_HOST=clamd \
    CLAMD_PORT=3310 \
    MAX_SCAN_BYTES=104857600 \
    CLAMD_TIMEOUT_MS=60000

USER node
EXPOSE 8080
CMD ["node", "/app/server.mjs"]
