#!/bin/sh
# Runs in the `backup` container: one compressed dump per night at ~03:00 (container time, UTC by
# default; set TZ to change it), keeps the last 14. Restore check: ops/restore-check.sh.
set -eu
while true; do
  now=$(date +%H%M)
  if [ "$now" = "0300" ] || [ ! -e /backups/.first-done ]; then
    file="/backups/attendance-$(date +%Y%m%d-%H%M).dump"
    if pg_dump -Fc -f "$file.tmp" && mv "$file.tmp" "$file"; then
      echo "[backup] wrote $file ($(du -h "$file" | cut -f1))"
      touch /backups/.first-done
    else
      echo "[backup] FAILED" >&2
      rm -f "$file.tmp"
    fi
    find /backups -name 'attendance-*.dump' -mtime +14 -delete
    sleep 61
  fi
  sleep 30
done
