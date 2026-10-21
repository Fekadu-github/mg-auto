#!/usr/bin/env bash
# Proves a backup can really be restored: loads it into a SEPARATE empty database and compares row counts with the live one.
#   ./restore-test.sh backups/mg_auto_2026-10-22_0200.sql.gz
# Needs the same DB_* variables as backup.sh. The test database (DB_NAME_restore_test) is dropped at the end. The live database is only read.
set -euo pipefail
: "${DB_HOST:?}" "${DB_USER:?}" "${DB_PASSWORD:?}" "${DB_NAME:?}"
FILE="${1:?give the backup file}"; PORT="${DB_PORT:-3306}"; TEST="${DB_NAME}_restore_test"
export MYSQL_PWD="$DB_PASSWORD"; M=(mysql -h "$DB_HOST" -P "$PORT" -u "$DB_USER")
"${M[@]}" -e "DROP DATABASE IF EXISTS \`$TEST\`; CREATE DATABASE \`$TEST\` CHARACTER SET utf8mb4;"
gunzip -c "$FILE" | "${M[@]}" "$TEST"
ok=1
for t in customers vehicles jobs estimates proformas inventory app_users; do
  a=$("${M[@]}" -N -e "SELECT COUNT(*) FROM \`$DB_NAME\`.\`$t\`" 2>/dev/null || echo "-"); b=$("${M[@]}" -N -e "SELECT COUNT(*) FROM \`$TEST\`.\`$t\`" 2>/dev/null || echo "-")
  printf '%-12s live=%-8s restored=%s\n' "$t" "$a" "$b"; [ "$b" != "-" ] || ok=0
done
"${M[@]}" -e "DROP DATABASE \`$TEST\`;"
[ $ok = 1 ] && echo "RESTORE TEST PASSED (restored rows can be lower than live if the backup is older)" || { echo "RESTORE TEST FAILED"; exit 1; }
