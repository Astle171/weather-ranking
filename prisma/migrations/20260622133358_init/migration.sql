-- CreateTable
CREATE TABLE "CityGeocode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cityName" TEXT NOT NULL,
    "lat" REAL NOT NULL,
    "lon" REAL NOT NULL,
    "country" TEXT NOT NULL,
    "cachedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "WeatherCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cityName" TEXT NOT NULL,
    "lat" REAL NOT NULL,
    "lon" REAL NOT NULL,
    "country" TEXT NOT NULL,
    "forecastJson" TEXT NOT NULL,
    "marineJson" TEXT,
    "cachedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "CityGeocode_cityName_key" ON "CityGeocode"("cityName");

-- CreateIndex
CREATE UNIQUE INDEX "WeatherCache_cityName_key" ON "WeatherCache"("cityName");
