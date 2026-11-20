-- Add Vacation to each account's existing Disposable Income category.
-- Match the starter kit's exact name within the same owner and category.
-- Accounts without this category receive it through normal provisioning.
-- Additive only: expense history and funding fields stay unchanged. App rollback
-- can retain these rows; check expense references before any later manual delete.
INSERT INTO "Subcategory" (
    "id", "userId", "categoryId", "name", "createdAt", "updatedAt"
)
SELECT gen_random_uuid()::text, c."userId", c."id", 'Vacation', NOW(), NOW()
FROM "Category" c
WHERE c."slug" = 'disposable-income'
  AND NOT EXISTS (
      SELECT 1
      FROM "Subcategory" s
      WHERE s."userId" = c."userId"
        AND s."categoryId" = c."id"
        AND s."name" = 'Vacation'
  );
