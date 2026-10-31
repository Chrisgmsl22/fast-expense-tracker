# Database recovery

This runbook helps Christian restore Fast Expense Tracker to a known-good database state after a bad migration, data loss, or other production incident. It covers preparing a recovery point, checking a separate copy, reconnecting the app, and deciding when to reopen writes. Production recovery and changes to production settings remain owner actions. Never put financial data, backups, credentials, or incident details in this public repository.

## Before a risky migration

On 2026-10-30, read-only Neon control-plane metadata reported a configured history window of **6 hours** and one production branch without a reported parent. That suggests a root branch, but Christian must verify the live plan, branch topology, and earliest available recovery timestamp in Neon. No database was queried.

The 6-hour window is shorter than the project's 2-week rollback observation period. Before CHORE-40, CHORE-41, CHORE-43, or another risky migration:

Keep schema migrations additive by default. Run a destructive migration only as a separate change, after a verified recovery point and an approved rollback plan.

1. Block all production writes and pause deployments, migrations, and other writers. Closing signup does not block signed-in users.
2. Record the UTC start time and create a separate recovery branch from production.
3. Verify the branch, its data, and its expiration. Keep it through the full observation period.
4. Take and test a private logical backup. Keep it outside the repository and Neon project.
5. Record the rollback deployment and recovery choice before starting the migration.

If Neon cannot provide the needed timestamp, use a verified private backup or contact Neon support. Increasing retention cannot restore history that has already expired. See [Neon's history window](https://neon.com/docs/postgres/backup-restore/history-window) and [branch controls](https://neon.com/docs/manage/branches).

## Recover and reconnect

Keep writes blocked until Christian accepts the recovery point and the application checks pass. Recovery loses changes made after that point. Decide how to preserve or reconcile legitimate later writes before reopening service.

1. Create a separate branch from the verified production parent at the chosen UTC time. If history is unavailable, restore a verified backup into a new, empty database. Keep the source unchanged.
2. Compare schema and migration history with the deployment that will run against the copy. Check expected records, relationships, expense totals, and settlement balances. Keep account values in private incident notes.
3. Run the application against the copy. Verify login, account isolation, expense history, and a reversible test write. A successful SQL restore alone does not verify application compatibility or permissions.
4. Point both production database settings, runtime and migration, at the same recovered database. Check the exact migrations before deploying. Preview builds have no database and do not prove recovery works.
5. Verify the running deployment uses the recovered endpoint. Repeat login and read checks, then reopen writes and monitor errors, totals, and settlement balances.

If validation fails, block writes again and preserve both branches and any new writes. Rolling back the application does not undo database changes. Use the [deployment convention](../conventions/deployment.md) when reconnecting production.

## In-place restore

Use an in-place restore only when a separate recovery copy is unavailable and Christian accepts that it replaces the **entire branch timeline and every database on that branch**. Neon documentation checked on 2026-10-30 says instant restore is limited to root branches. Confirm both branch topology and the chosen timestamp in the console before acting. See [Neon's restore procedure](https://neon.com/docs/postgres/backup-restore/branch-restore).

Keep writes blocked. Review Time Travel Assist and Schema Diff, confirm the target branch, source, time, and affected databases, then restore. Record the automatic pre-restore backup branch and verify the result before reopening service. If the restore is wrong, keep writes blocked and preserve intervening changes before attempting another restore.

## Private backups

Take a private backup before each risky migration and set a recurring schedule for routine copies. A proposed starting point is weekly with four successful copies retained. Christian still needs to choose the schedule, storage provider, encryption method, access policy, and recovery objectives. This runbook does not install a backup job.

Store encrypted backups outside the repository and Neon project. Keep the decryption key separately. For each copy, record its time, source, Postgres version, application commit, migration state, checksum, and private storage location. Test download, decryption, and restore into a fresh isolated database before relying on it. Logical backups cover one database; preserve required roles, grants, extensions, deployment settings, and secrets separately.

Configure `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, and TLS settings through an approved secure credential source. Use the direct endpoint and confirm the host and database match Neon before each backup or restore. Keep connection strings and passwords out of command arguments and shell history. For each database, create and list a custom-format archive in an encrypted private directory outside the repository:

```sh
set -eu
: "${PGHOST:?}" "${PGDATABASE:?}" "${PGUSER:?}"
: "${RECOVERY_EXPECTED_SOURCE_HOST:?Confirm from Neon}" "${RECOVERY_EXPECTED_SOURCE_DATABASE:?Confirm from Neon}"
: "${BACKUP_FILE:?Set a private archive path}"
test "$PGHOST" = "$RECOVERY_EXPECTED_SOURCE_HOST"
test "$PGDATABASE" = "$RECOVERY_EXPECTED_SOURCE_DATABASE"
test ! -e "$BACKUP_FILE"
umask 077
pg_dump --format=custom --no-owner --no-acl --file="$BACKUP_FILE"
pg_restore --list "$BACKUP_FILE" >/dev/null
```

Test it against a newly created, empty recovery database. Set and confirm that target connection through the same secure credential source:

```sh
set -eu
: "${PGHOST:?}" "${PGDATABASE:?}" "${PGUSER:?}"
: "${RECOVERY_EXPECTED_TARGET_HOST:?Confirm from Neon}" "${RECOVERY_DATABASE:?Set the new empty target}"
test "$PGHOST" = "$RECOVERY_EXPECTED_TARGET_HOST"
test "$PGDATABASE" = "$RECOVERY_DATABASE"
pg_restore --exit-on-error --single-transaction --no-owner --no-acl \
  --dbname="$RECOVERY_DATABASE" "$BACKUP_FILE"
```

These commands do not recreate roles or grants. Do not add `--clean` or `--create`; verify the isolated target and required permissions before cutover.

## Rehearsal and remaining checks

The [local rehearsal](./recovery-rehearsal.md) passed with invented data in two new scratch databases. It checked row equality, totals, a foreign key, an index, and the identity sequence. The scratch databases and temporary archive were removed. This does not prove Neon point-in-time recovery, production permissions, application cutover, or recovery time.

Before relying on this procedure, Christian must confirm the live Neon plan and available history, production branch topology, private backup storage and encryption, recovery objectives, and the cutover procedure. Keep those account details and incident records private.
