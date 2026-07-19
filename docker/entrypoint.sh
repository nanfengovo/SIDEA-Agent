#!/bin/sh
set -e

mkdir -p /app/uploads /app/sandbox_workspace /app/database /app/output /app/logs /data

# Persist config.db on the named volume
if [ -L /app/config.db ]; then
  :
elif [ -f /app/config.db ]; then
  cp /app/config.db /data/config.db
  rm -f /app/config.db
  ln -sfn /data/config.db /app/config.db
else
  ln -sfn /data/config.db /app/config.db
fi

if [ ! -f /app/sandbox_workspace/sidea_sdk.py ] && [ -f /app/tools/sidea_sdk_template.py ]; then
  cp /app/tools/sidea_sdk_template.py /app/sandbox_workspace/sidea_sdk.py
fi

exec "$@"
