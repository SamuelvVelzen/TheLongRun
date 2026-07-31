#!/bin/sh
set -e
if [ ! -d /data/context ] || [ -z "$(ls -A /data/context 2>/dev/null)" ]; then
  mkdir -p /data
  cp -a /app/data-seed/. /data/
fi
mkdir -p /data/runs /data/uploads /data/context
exec node build
