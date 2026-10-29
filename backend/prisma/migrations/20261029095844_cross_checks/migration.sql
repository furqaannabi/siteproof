-- CreateTable
CREATE TABLE "CrossCheck" (
    "id" TEXT NOT NULL,
    "clip_id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "item" "ItemKind" NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "CrossCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CrossCheck_room_id_idx" ON "CrossCheck"("room_id");

-- CreateIndex
CREATE UNIQUE INDEX "CrossCheck_clip_id_room_id_item_key" ON "CrossCheck"("clip_id", "room_id", "item");

-- AddForeignKey
ALTER TABLE "CrossCheck" ADD CONSTRAINT "CrossCheck_clip_id_fkey" FOREIGN KEY ("clip_id") REFERENCES "Clip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrossCheck" ADD CONSTRAINT "CrossCheck_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
