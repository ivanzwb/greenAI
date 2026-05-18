-- AlterTable
ALTER TABLE "CareTask" ADD COLUMN "completedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "CareTask_completedAt_idx" ON "CareTask"("completedAt");
