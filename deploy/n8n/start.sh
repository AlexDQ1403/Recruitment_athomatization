#!/bin/sh
# Render asigna el puerto en PORT y la URL pública en RENDER_EXTERNAL_URL.
# n8n necesita esa URL para armar las direcciones de sus webhooks.
export N8N_PORT="${PORT:-5678}"
if [ -n "$RENDER_EXTERNAL_URL" ]; then
  export WEBHOOK_URL="${RENDER_EXTERNAL_URL}/"
  export N8N_EDITOR_BASE_URL="${RENDER_EXTERNAL_URL}/"
fi
exec /docker-entrypoint.sh
