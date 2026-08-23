-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('FREE', 'PRO');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT,
    "avatarUrl" TEXT,
    "settings" JSONB,
    "plan" "Plan" NOT NULL DEFAULT 'FREE',
    "planRenewsAt" TIMESTAMP(3),
    "planCancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "isTester" BOOLEAN NOT NULL DEFAULT false,
    "riskProfile" JSONB,
    "company" TEXT,
    "jobTitle" TEXT,
    "country" TEXT,
    "phone" TEXT,
    "timezone" TEXT,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT,
    "platform" TEXT NOT NULL,
    "deviceName" TEXT,
    "appVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BroadcastLog" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "count" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BroadcastLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reveal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reveal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recommendation" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "open" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "high" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "refPrice1020" DOUBLE PRECISION,
    "lowBeforePeak" DOUBLE PRECISION,
    "refPrice1120" DOUBLE PRECISION,
    "highPost1120" DOUBLE PRECISION,
    "refPrice1220" DOUBLE PRECISION,
    "highPost1220" DOUBLE PRECISION,
    "closePost1020" DOUBLE PRECISION,
    "lowAfterPeak" DOUBLE PRECISION,
    "peakAt" TIMESTAMP(3),
    "firstCross" JSONB,
    "maeBeforeCross" JSONB,
    "entryPath" JSONB,
    "low30" DOUBLE PRECISION,
    "high30" DOUBLE PRECISION,
    "atrPct" DOUBLE PRECISION,
    "gapPct" DOUBLE PRECISION,
    "rvol1020" DOUBLE PRECISION,
    "spyDayPct" DOUBLE PRECISION,
    "changePercent" DOUBLE PRECISION NOT NULL,
    "volume" DOUBLE PRECISION NOT NULL,
    "relativeVol" DOUBLE PRECISION NOT NULL,
    "marketCap" DOUBLE PRECISION NOT NULL,
    "sector" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "probability" TEXT NOT NULL,
    "probabilityValue" INTEGER NOT NULL DEFAULT 70,
    "time" TEXT NOT NULL,
    "stopLoss" DOUBLE PRECISION NOT NULL,
    "priceTarget" DOUBLE PRECISION NOT NULL,
    "thesis" TEXT NOT NULL,
    "catalyst" TEXT,
    "rsi" DOUBLE PRECISION NOT NULL,
    "beta" DOUBLE PRECISION NOT NULL,
    "earningsDate" TEXT,
    "analystRating" TEXT NOT NULL,
    "sentiment" TEXT NOT NULL,

    CONSTRAINT "Recommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
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

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "color" TEXT NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Watchlist" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,

    CONSTRAINT "Watchlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradingConfig" (
    "id" SERIAL NOT NULL,
    "takeProfit" DOUBLE PRECISION NOT NULL DEFAULT 3.0,
    "stopLoss" DOUBLE PRECISION NOT NULL DEFAULT 5.0,
    "maxStocks" INTEGER NOT NULL DEFAULT 10,
    "maxPositionPercent" DOUBLE PRECISION NOT NULL DEFAULT 20.0,
    "maxDailySpend" DOUBLE PRECISION NOT NULL DEFAULT 32500,
    "minVolume" DOUBLE PRECISION NOT NULL DEFAULT 2000000,
    "minPrice" DOUBLE PRECISION NOT NULL DEFAULT 5.0,
    "maxGainSkip" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "prioritizeBelowRef" BOOLEAN NOT NULL DEFAULT true,
    "retryIntervalMinutes" INTEGER NOT NULL DEFAULT 1,
    "maxRetries" INTEGER NOT NULL DEFAULT 10,
    "executionHour" INTEGER NOT NULL DEFAULT 10,
    "executionMinute" INTEGER NOT NULL DEFAULT 25,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradingConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeLog" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "entryPrice" DOUBLE PRECISION NOT NULL,
    "takeProfitPrice" DOUBLE PRECISION NOT NULL,
    "stopLossPrice" DOUBLE PRECISION NOT NULL,
    "parentOrderId" INTEGER NOT NULL,
    "tpOrderId" INTEGER NOT NULL,
    "slOrderId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "errorMessage" TEXT,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradeLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "PushToken_token_key" ON "PushToken"("token");

-- CreateIndex
CREATE INDEX "PushToken_userId_idx" ON "PushToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BroadcastLog_kind_date_key" ON "BroadcastLog"("kind", "date");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_email_key" ON "PasswordResetToken"("email");

-- CreateIndex
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");

-- CreateIndex
CREATE INDEX "Reveal_userId_date_idx" ON "Reveal"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Reveal_userId_symbol_date_key" ON "Reveal"("userId", "symbol", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Note_userId_symbol_key" ON "Note"("userId", "symbol");

-- CreateIndex
CREATE UNIQUE INDEX "Recommendation_symbol_date_key" ON "Recommendation"("symbol", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_userId_symbol_key" ON "Tag"("userId", "symbol");

-- CreateIndex
CREATE UNIQUE INDEX "Watchlist_userId_symbol_key" ON "Watchlist"("userId", "symbol");

-- AddForeignKey
ALTER TABLE "PushToken" ADD CONSTRAINT "PushToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reveal" ADD CONSTRAINT "Reveal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Watchlist" ADD CONSTRAINT "Watchlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

