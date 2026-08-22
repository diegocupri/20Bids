-- CreateTable
-- Additive only: one brand-new table. Nothing existing is altered, no data is
-- moved, and there is NO foreign key from "Recommendation"."symbol" — this
-- table is filled lazily by the backfill, so a constraint would reject every
-- recommendation whose issuer has not been fetched yet.
-- IF NOT EXISTS for the same reason as the entry_path migration: this database
-- has drift and the file must be safe to re-run.
CREATE TABLE IF NOT EXISTS "Company" (
    "symbol" TEXT NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "homepageUrl" TEXT,
    "totalEmployees" INTEGER,
    "listDate" DATE,
    "fetchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("symbol")
);
