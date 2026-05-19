-- CreateEnum
CREATE TYPE "SpeciesProfileSource" AS ENUM ('llm', 'manual');

-- CreateTable
CREATE TABLE "SpeciesProfile" (
    "id" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "taxonFamily" TEXT,
    "careDifficulty" TEXT,
    "careSummary" TEXT,
    "source" "SpeciesProfileSource" NOT NULL DEFAULT 'llm',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpeciesProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SpeciesProfile_nameKey_key" ON "SpeciesProfile"("nameKey");
