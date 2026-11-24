BEGIN;

LOCK TABLE "User" IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE "account" IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE invalid_count integer;
BEGIN
    SELECT count(*) INTO invalid_count FROM "User" WHERE "password" IS NULL OR "password" = '';
    IF invalid_count <> 0 THEN
        RAISE EXCEPTION 'Credential backfill: missing legacy passwords: %', invalid_count;
    END IF;
END $$;

INSERT INTO "account" ("id", "accountId", "providerId", "userId", "password", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, u."id", 'credential', u."id", u."password", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "User" u
WHERE NOT EXISTS (SELECT 1 FROM "account" a WHERE a."userId" = u."id" AND a."providerId" = 'credential');

DO $$
DECLARE invalid_count integer;
BEGIN
    SELECT count(*) INTO invalid_count FROM "User" u
    WHERE (SELECT count(*) FROM "account" a WHERE a."userId" = u."id" AND a."providerId" = 'credential') <> 1
       OR NOT EXISTS (SELECT 1 FROM "account" a WHERE a."userId" = u."id" AND a."providerId" = 'credential'
          AND a."accountId" = u."id" AND a."password" = u."password");
    IF invalid_count <> 0 THEN
        RAISE EXCEPTION 'Credential backfill: invalid credential users: %', invalid_count;
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "account_credential_user_key" ON "account" ("userId") WHERE "providerId" = 'credential';

COMMIT;
