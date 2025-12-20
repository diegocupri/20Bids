-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
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
    "refPrice1120" DOUBLE PRECISION,
    "highPost1120" DOUBLE PRECISION,
    "refPrice1220" DOUBLE PRECISION,
    "highPost1220" DOUBLE PRECISION,
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

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Recommendation_symbol_date_key" ON "Recommendation"("symbol", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_userId_symbol_key" ON "Tag"("userId", "symbol");

-- CreateIndex
CREATE UNIQUE INDEX "Watchlist_userId_symbol_key" ON "Watchlist"("userId", "symbol");

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Watchlist" ADD CONSTRAINT "Watchlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
