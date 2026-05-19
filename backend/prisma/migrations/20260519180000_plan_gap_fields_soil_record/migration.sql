-- CreateEnum
CREATE TYPE "SoilFertilityHint" AS ENUM ('unknown', 'depleted', 'adequate', 'rich');

CREATE TYPE "WindowAspect" AS ENUM ('unknown', 'north', 'south', 'east', 'west');

-- AlterTable User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "airConditioning" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "windowAspect" "WindowAspect" NOT NULL DEFAULT 'unknown';

-- AlterTable Plant
ALTER TABLE "Plant" ADD COLUMN IF NOT EXISTS "taxonFamily" TEXT;
ALTER TABLE "Plant" ADD COLUMN IF NOT EXISTS "careDifficulty" TEXT;
ALTER TABLE "Plant" ADD COLUMN IF NOT EXISTS "waterAmountMl" INTEGER;
ALTER TABLE "Plant" ADD COLUMN IF NOT EXISTS "fertilizerType" TEXT;
ALTER TABLE "Plant" ADD COLUMN IF NOT EXISTS "careTips" TEXT;
ALTER TABLE "Plant" ADD COLUMN IF NOT EXISTS "waterSkipStreak" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "SoilRecord" (
    "id" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "soilMoistureHint" "SoilMoistureHint" NOT NULL,
    "soilFertilityHint" "SoilFertilityHint" NOT NULL DEFAULT 'unknown',
    "rationale" TEXT,
    "wateringTip" TEXT,
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SoilRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SoilRecord_plantId_createdAt_idx" ON "SoilRecord"("plantId", "createdAt");

ALTER TABLE "SoilRecord" ADD CONSTRAINT "SoilRecord_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
