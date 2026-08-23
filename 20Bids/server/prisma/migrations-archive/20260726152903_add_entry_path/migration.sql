-- AlterTable
-- Additive only. IF NOT EXISTS because the Recommendation table has drift
-- (earlier waypoint columns were applied outside this folder), so this file
-- has to be safe to run against a database that may already have them.
ALTER TABLE "Recommendation" ADD COLUMN IF NOT EXISTS "entryPath" JSONB;
ALTER TABLE "Recommendation" ADD COLUMN IF NOT EXISTS "low30" DOUBLE PRECISION;
ALTER TABLE "Recommendation" ADD COLUMN IF NOT EXISTS "high30" DOUBLE PRECISION;
