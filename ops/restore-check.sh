#!/bin/sh
# Proves a backup can be restored: loads a dump into a scratch database and counts the main tables.
# Usage (on the server): sh ops/restore-check.sh backups/attendance-YYYYMMDD-HHMM.dump
#   COMPOSE="docker compose -f docker-compose.prod.yml" by default; DB user from .env (POSTGRES_USER).
set -eu
dump=${1:?usage: restore-check.sh <file.dump>}
compose=${COMPOSE:-docker compose -f docker-compose.prod.yml}
user=${POSTGRES_USER:-attendance}
scratch=restore_check

$compose exec -T postgres dropdb -U "$user" --if-exists "$scratch"
$compose exec -T postgres createdb -U "$user" "$scratch"
$compose exec -T postgres pg_restore -U "$user" -d "$scratch" --no-owner < "$dump"
$compose exec -T postgres psql -U "$user" -d "$scratch" -At -c \
  'SELECT format($$schools=%s students=%s attendance_records=%s users=%s$$,
     (SELECT count(*) FROM "School"), (SELECT count(*) FROM "Student"),
     (SELECT count(*) FROM "AttendanceRecord"), (SELECT count(*) FROM "User"))'
$compose exec -T postgres dropdb -U "$user" "$scratch"
echo "restore OK: $dump"
