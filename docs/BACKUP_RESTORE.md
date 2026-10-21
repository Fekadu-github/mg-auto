# Backups and restore (step 1)

This part is a setting at your database provider plus one test. It is not application code.

## A. Switch it on (once)
| Provider | Where |
|---|---|
| Aiven / DigitalOcean / PlanetScale / Railway / AWS RDS | Database → **Backups** → enable automatic daily backups, retention **7 days or more** |
| Your own server (Docker) | Use `backend/scripts/backup.sh` from cron (daily, 02:00) and copy the files off the machine |

Tick: [ ] daily backup on  [ ] retention ≥ 7 days  [ ] backup is stored away from the database server

## B. Keep your own second copy
```
DB_HOST=... DB_USER=... DB_PASSWORD=... DB_NAME=mg_auto BACKUP_DIR=/var/backups/mg-auto backend/scripts/backup.sh
```
Writes `mg_auto_<date>.sql.gz` and deletes copies older than 14 days.

## C. Try one restore (do it now, then every quarter)
1. Take or download a backup.
2. `backend/scripts/restore-test.sh <backup file>` loads it into a throw-away database, prints live and restored row counts for the main tables, then removes the test database. It never writes to the live database.
3. Or with the provider: restore the backup into a **new** database and open the app against it (`DB_NAME=...`). Check a recent job card, an invoice and the stock list.
4. Write the date and result below.

| Date | Backup used | Restored by | Result |
|---|---|---|---|
|  |  |  |  |

## D. If the real database is lost
1. Create an empty database, restore the newest backup into it.
2. Point `DB_*` of the app to it and start the app (it adds any missing tables or columns by itself).
3. Everything entered after the backup time must be entered again, so keep the retention and the frequency short enough for that.
