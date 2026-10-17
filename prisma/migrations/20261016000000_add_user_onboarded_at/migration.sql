-- AlterTable
ALTER TABLE "User" ADD COLUMN "onboardedAt" TIMESTAMP(3);

-- Every account that exists before this release is already set up, so it never
-- sees the onboarding wizard. Accounts created later start with null.
UPDATE "User" SET "onboardedAt" = NOW() WHERE "onboardedAt" IS NULL;
