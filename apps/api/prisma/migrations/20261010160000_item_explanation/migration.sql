-- CreateTable
CREATE TABLE "ItemExplanation" (
    "itemId" UUID NOT NULL,
    "content" JSONB NOT NULL,
    "aiRunId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItemExplanation_pkey" PRIMARY KEY ("itemId")
);

-- AddForeignKey
ALTER TABLE "ItemExplanation" ADD CONSTRAINT "ItemExplanation_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "LearningItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
