-- Optional profile fields for the Settings > Account section.
--
-- Additive only: five nullable text columns, no default, no backfill. Applied
-- by hand and registered with `migrate resolve --applied` because the schema
-- has drift against the shadow database and `migrate dev` would offer to reset
-- production.
--
--  company / jobTitle / country / phone   free text the user types
--  timezone                               IANA zone ("Europe/Madrid"). The one
--                                         with real behaviour behind it: every
--                                         session time in the product is quoted
--                                         in ET today, without ever asking.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "company"  TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "jobTitle" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "country"  TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phone"    TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "timezone" TEXT;
