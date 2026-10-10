-- AlterTable
ALTER TABLE "Book" ADD COLUMN     "catalogKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Book_ownerId_catalogKey_key" ON "Book"("ownerId", "catalogKey");
