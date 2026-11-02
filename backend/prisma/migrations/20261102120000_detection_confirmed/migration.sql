-- Muse Spark confirms each object SAM found. Existing rows stay unconfirmed until their clip is re-run.
ALTER TABLE "Detection" ADD COLUMN "confirmed" BOOLEAN NOT NULL DEFAULT false;
