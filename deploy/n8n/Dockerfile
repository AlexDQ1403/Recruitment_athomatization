# n8n para el despliegue de prueba en Render (misma versión que el entorno local)
FROM n8nio/n8n:2.21.7
COPY --chown=node:node start.sh /home/node/start.sh
ENTRYPOINT ["tini", "--", "/bin/sh", "/home/node/start.sh"]
