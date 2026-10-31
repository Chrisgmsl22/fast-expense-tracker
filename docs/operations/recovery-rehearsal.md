# Local recovery rehearsal

This note shows what the recovery procedure has been tested to do. On 2026-10-30, a local PostgreSQL 17.11 rehearsal used invented data in two newly created scratch databases. It tested `pg_dump` and `pg_restore`; it did not connect to Neon or inspect existing application or test databases.

| Check                                            | Result                                    |
| ------------------------------------------------ | ----------------------------------------- |
| All fixture rows and columns match after restore | Pass                                      |
| Fixture totals                                   | 350.00 charged, 261.00 actual expenditure |
| Foreign key and index                            | Pass                                      |
| Identity sequence continues at 4                 | Pass                                      |
| Temporary archive and scratch databases removed  | Pass                                      |

The dump took 0.085 seconds and the restore took 0.053 seconds for this 4,830-byte fixture. These timings do not estimate production recovery time.

This rehearsal does not prove Neon point-in-time recovery, production grants, application compatibility, cutover, or backup storage. See the [database recovery runbook](./recovery.md) for the owner checks still required.
