-- CreateEnum
CREATE TYPE "GapRequestStatus" AS ENUM ('open', 'sent');

-- CreateTable
CREATE TABLE "GapRequest" (
    "id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "steps" TEXT[],
    "status" "GapRequestStatus" NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GapRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GapRequest_room_id_idx" ON "GapRequest"("room_id");

-- AddForeignKey
ALTER TABLE "GapRequest" ADD CONSTRAINT "GapRequest_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
