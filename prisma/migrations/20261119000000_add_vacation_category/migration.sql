-- One block keeps the category and subcategory inserts atomic on SQL replay.
DO $$
BEGIN
-- Add Vacation for every existing account, matching provisioning by owner + slug.
-- Keep any held category and its budget, color, flags, and history unchanged.
-- Additive only: app rollback can retain these rows. Check expense references
-- before any later manual deletion. Stored names stay English for localization.
INSERT INTO "Category" (
    "id", "userId", "slug", "name", "color", "isRelevant",
    "isSystemCategory", "createdAt", "updatedAt"
)
SELECT gen_random_uuid()::text, u."id", 'vacation', 'Vacation', '#ea580c',
       false, true, NOW(), NOW()
FROM "User" u
ON CONFLICT ("userId", "slug") DO NOTHING;

-- Match exact subcategory names within the same owner and Vacation category.
INSERT INTO "Subcategory" (
    "id", "userId", "categoryId", "name", "createdAt", "updatedAt"
)
SELECT gen_random_uuid()::text, c."userId", c."id", defaults."name", NOW(), NOW()
FROM "Category" c
CROSS JOIN (VALUES
    ('Flights'), ('Lodging'), ('Local transport'), ('Food and snacks'),
    ('Activities'), ('Souvenirs')
) AS defaults("name")
WHERE c."slug" = 'vacation'
  AND NOT EXISTS (
      SELECT 1
      FROM "Subcategory" s
      WHERE s."userId" = c."userId"
        AND s."categoryId" = c."id"
        AND s."name" = defaults."name"
  );
END $$;
