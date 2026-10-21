#!/usr/bin/env bash
# Daily copy of the database, kept for 14 days. Run from cron on any machine that can reach the database:
#   0 2 * * *  DB_HOST=... DB_USER=... DB_PASSWORD=... DB_NAME=mg_auto BACKUP_DIR=/var/backups/mg-auto /path/to/backup.sh
# (Your database provider's own automatic backup is the first line of defence; this is the second copy that you hold yourself.)
set -euo pipefail
: "${DB_HOST:?}" "${DB_USER:?}" "${DB_PASSWORD:?}" "${DB_NAME:?}"
DIR="${BACKUP_DIR:-./backups}"; KEEP_DAYS="${KEEP_DAYS:-14}"; PORT="${DB_PORT:-3306}"
mkdir -p "$DIR"
F="$DIR/${DB_NAME}_$(date +%F_%H%M).sql.gz"
MYSQL_PWD="$DB_PASSWORD" mysqldump --single-transaction --routines -h "$DB_HOST" -P "$PORT" -u "$DB_USER" "$DB_NAME" | gzip > "$F"
[ -s "$F" ] || { echo "Backup is empty: $F" >&2; rm -f "$F"; exit 1; }
find "$DIR" -name "${DB_NAME}_*.sql.gz" -mtime +"$KEEP_DAYS" -delete
echo "Backup written: $F ($(du -h "$F" | cut -f1))"
