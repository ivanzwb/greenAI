-- AlterEnum
ALTER TYPE "CareTaskType" ADD VALUE IF NOT EXISTS 'repot';
ALTER TYPE "CareTaskType" ADD VALUE IF NOT EXISTS 'inspect';

-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "locationLabel" TEXT;
