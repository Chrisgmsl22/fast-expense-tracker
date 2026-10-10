-- Emails match case-insensitively, so every stored email is lowercased and trimmed,
-- the same rule as normalizeEmail for ASCII addresses. A second run changes nothing.

-- Abort before any write if two users would end up with one address. The message
-- carries a count only: emails are personal data and this runs in the build log.
DO $$
DECLARE
  collisions integer;
BEGIN
  SELECT count(*) INTO collisions
  FROM (
    SELECT lower(regexp_replace(email, '^[[:space:]]+|[[:space:]]+$', '', 'g'))
    FROM "User"
    GROUP BY 1
    HAVING count(*) > 1
  ) AS shared;

  IF collisions > 0 THEN
    RAISE EXCEPTION
      'email normalisation aborted: % email address(es) belong to more than one user once lowercased and trimmed. Merge or rename those accounts before migrating.',
      collisions;
  END IF;
END $$;

UPDATE "User"
SET email = lower(regexp_replace(email, '^[[:space:]]+|[[:space:]]+$', '', 'g')),
    "updatedAt" = NOW()
WHERE email <> lower(regexp_replace(email, '^[[:space:]]+|[[:space:]]+$', '', 'g'));
