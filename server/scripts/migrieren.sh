#!/bin/bash
# Spielt alle noch nicht eingespielten Migrationen aus server/db/migrationen/
# in die Datenbank ein (in Dateinamen-Reihenfolge, jede in einer Transaktion).
# Laeuft als postgres, weil 0000 Rollen anlegt -- das Backend selbst
# (workflow_api) hat dafuer bewusst keine Rechte.
#
# Aufruf auf dem Server: sudo -u postgres server/scripts/migrieren.sh [datenbank]
set -euo pipefail

db=${1:-workflow}
ordner=$(cd "$(dirname "$0")/../db/migrationen" && pwd)

tabelle_da=$(psql -At -d "$db" -c "select to_regclass('private.schema_migrationen') is not null")

for datei in "$ordner"/*.sql; do
  name=$(basename "$datei")
  if [ "$tabelle_da" = "t" ]; then
    # Ueber stdin statt -c, weil psql nur dort :'name' sicher einsetzt.
    schon=$(echo "select count(*) from private.schema_migrationen where name = :'name'" | psql -At -d "$db" -v name="$name")
    [ "$schon" = "1" ] && continue
  fi
  echo "Migration: $name"
  psql -q -v ON_ERROR_STOP=1 --single-transaction -d "$db" -f "$datei"
  tabelle_da=$(psql -At -d "$db" -c "select to_regclass('private.schema_migrationen') is not null")
done
echo "Datenbank $db ist aktuell."
