-- An account that has chosen nothing reads everything of the forecast, as Téo chose: decision 061.
ALTER TABLE "display_preferences" ALTER COLUMN "density" SET DEFAULT 'everything';