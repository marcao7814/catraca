#!/bin/sh
# Ordem de subida do container app: migrações -> seed (idempotente) -> servidor.
set -e
node dist/db/migrate.js
node dist/seed/seed.js
exec node dist/server.js
