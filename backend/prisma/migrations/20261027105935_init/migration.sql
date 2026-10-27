-- CreateEnum
CREATE TYPE "ClipStatus" AS ENUM ('uploaded', 'processing', 'done', 'failed');

-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('demand_letter', 'invoice', 'boq');

-- CreateEnum
CREATE TYPE "ItemKind" AS ENUM ('window', 'door');

-- CreateEnum
CREATE TYPE "ClaimItem" AS ENUM ('window', 'door', 'not_countable');

-- CreateEnum
CREATE TYPE "Outcome" AS ENUM ('verified', 'short', 'not_seen');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('queued', 'running', 'done', 'failed');

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "builder" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Flat" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Flat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "flat_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "qr_code" TEXT NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Clip" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "object_key" TEXT NOT NULL,
    "captured_at" TIMESTAMP(3),
    "status" "ClipStatus" NOT NULL DEFAULT 'uploaded',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Clip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "flat_id" TEXT,
    "kind" "DocumentKind" NOT NULL,
    "status" "ClipStatus" NOT NULL DEFAULT 'uploaded',
    "object_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Segment" (
    "id" TEXT NOT NULL,
    "clip_id" TEXT NOT NULL,
    "room_id" TEXT,
    "t_start" DOUBLE PRECISION NOT NULL,
    "t_end" DOUBLE PRECISION NOT NULL,
    "full_sweep" BOOLEAN NOT NULL,

    CONSTRAINT "Segment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Claim" (
    "id" TEXT NOT NULL,
    "doc_id" TEXT NOT NULL,
    "item" "ClaimItem" NOT NULL,
    "qty" INTEGER NOT NULL,
    "unit" TEXT NOT NULL,
    "room_id" TEXT,
    "source_quote" TEXT NOT NULL,
    "quote_verified" BOOLEAN NOT NULL,

    CONSTRAINT "Claim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Detection" (
    "id" TEXT NOT NULL,
    "clip_id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "item" "ItemKind" NOT NULL,
    "track_id" TEXT NOT NULL,
    "best_frame_key" TEXT NOT NULL,
    "mask_key" TEXT NOT NULL,

    CONSTRAINT "Detection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Result" (
    "claim_id" TEXT NOT NULL,
    "counted" INTEGER NOT NULL,
    "outcome" "Outcome" NOT NULL,
    "room_covered" BOOLEAN NOT NULL,
    "evidence_keys" TEXT[],
    "note" TEXT,

    CONSTRAINT "Result_pkey" PRIMARY KEY ("claim_id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "run_after" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMP(3),
    "last_error_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Flat_project_id_idx" ON "Flat"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "Room_qr_code_key" ON "Room"("qr_code");

-- CreateIndex
CREATE INDEX "Room_flat_id_idx" ON "Room"("flat_id");

-- CreateIndex
CREATE UNIQUE INDEX "Clip_object_key_key" ON "Clip"("object_key");

-- CreateIndex
CREATE INDEX "Clip_project_id_idx" ON "Clip"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "Document_object_key_key" ON "Document"("object_key");

-- CreateIndex
CREATE INDEX "Document_project_id_idx" ON "Document"("project_id");

-- CreateIndex
CREATE INDEX "Segment_clip_id_idx" ON "Segment"("clip_id");

-- CreateIndex
CREATE INDEX "Segment_room_id_idx" ON "Segment"("room_id");

-- CreateIndex
CREATE INDEX "Claim_doc_id_idx" ON "Claim"("doc_id");

-- CreateIndex
CREATE INDEX "Claim_room_id_idx" ON "Claim"("room_id");

-- CreateIndex
CREATE INDEX "Detection_room_id_item_idx" ON "Detection"("room_id", "item");

-- CreateIndex
CREATE UNIQUE INDEX "Detection_clip_id_item_track_id_key" ON "Detection"("clip_id", "item", "track_id");

-- CreateIndex
CREATE INDEX "Job_status_run_after_idx" ON "Job"("status", "run_after");

-- AddForeignKey
ALTER TABLE "Flat" ADD CONSTRAINT "Flat_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_flat_id_fkey" FOREIGN KEY ("flat_id") REFERENCES "Flat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Clip" ADD CONSTRAINT "Clip_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_flat_id_fkey" FOREIGN KEY ("flat_id") REFERENCES "Flat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Segment" ADD CONSTRAINT "Segment_clip_id_fkey" FOREIGN KEY ("clip_id") REFERENCES "Clip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Segment" ADD CONSTRAINT "Segment_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_doc_id_fkey" FOREIGN KEY ("doc_id") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Detection" ADD CONSTRAINT "Detection_clip_id_fkey" FOREIGN KEY ("clip_id") REFERENCES "Clip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Detection" ADD CONSTRAINT "Detection_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Result" ADD CONSTRAINT "Result_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;
