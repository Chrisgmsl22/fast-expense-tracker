-- CreateTable
CREATE TABLE "BudgetRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "effectiveMonth" TEXT NOT NULL,
    "essentials" INTEGER NOT NULL,
    "discretionary" INTEGER NOT NULL,
    "savings" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BudgetRule_userId_effectiveMonth_key" ON "BudgetRule"("userId", "effectiveMonth");

-- AddForeignKey
ALTER TABLE "BudgetRule" ADD CONSTRAINT "BudgetRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
