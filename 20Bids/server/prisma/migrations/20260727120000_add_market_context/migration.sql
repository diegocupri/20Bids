-- Market-context columns for the Reliability crosses.
--
-- Additive only: four nullable Floats, no default, no backfill in the
-- migration itself (that is scripts/backfill_market_context.ts). Written by
-- hand and applied with `migrate resolve --applied` because the schema has
-- drift against the shadow database and `migrate dev` would offer to reset
-- production.
--
--  atrPct    ATR(14) over the 14 sessions BEFORE the pick, as a percent of the
--            prior close. Normalises the target: +0.75% on a 1%-a-day name and
--            on a 6%-a-day name are not the same bet.
--  gapPct    (open - prior close) / prior close * 100. Gap-and-go vs gap-fade.
--  rvol1020  Volume traded 09:30-10:20 divided by the mean of the same window
--            over the 20 prior sessions. 1.0 is an ordinary morning.
--  spyDayPct SPY's own return that session. Denormalised onto every row of the
--            day rather than kept in a MarketDay table: the recommendations
--            endpoint spreads the row wholesale, so this reaches the client
--            with no API change at all.
ALTER TABLE "Recommendation" ADD COLUMN IF NOT EXISTS "atrPct" DOUBLE PRECISION;
ALTER TABLE "Recommendation" ADD COLUMN IF NOT EXISTS "gapPct" DOUBLE PRECISION;
ALTER TABLE "Recommendation" ADD COLUMN IF NOT EXISTS "rvol1020" DOUBLE PRECISION;
ALTER TABLE "Recommendation" ADD COLUMN IF NOT EXISTS "spyDayPct" DOUBLE PRECISION;
