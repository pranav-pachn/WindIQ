#!/bin/sh
set -e

BACKEND_HOST="${BACKEND_HOST:-backend}"
BACKEND_PORT="${BACKEND_PORT:-8000}"

echo "Configuring Nginx reverse proxy: upstream target -> http://${BACKEND_HOST}:${BACKEND_PORT}"
sed -i "s|http://backend:8000|http://${BACKEND_HOST}:${BACKEND_PORT}|g" /etc/nginx/conf.d/default.conf

exec "$@"

