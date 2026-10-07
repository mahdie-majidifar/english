-- CreateEnum
CREATE TYPE "ItemType" AS ENUM ('VOCABULARY', 'COLLOCATION', 'GRAMMAR', 'EXPRESSION', 'WORD_FORMATION', 'IRREGULAR_VERB', 'WORD_DISTINCTION', 'SENTENCE_PATTERN', 'PRONUNCIATION');

-- CreateEnum
CREATE TYPE "ContentSource" AS ENUM ('TEACHER', 'BOOK', 'USER', 'AI_SUGGESTED');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED');

-- CreateTable
CREATE TABLE "Book" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "series" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "levelNumber" INTEGER,
    "cefr" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Book_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Unit" (
    "id" UUID NOT NULL,
    "bookId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT,

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lesson" (
    "id" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,

    CONSTRAINT "Lesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Enrollment" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "bookId" UUID NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "currentLessonId" UUID,
    "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Enrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningItem" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "type" "ItemType" NOT NULL,
    "headword" TEXT NOT NULL,
    "normalizedKey" TEXT NOT NULL,
    "meaningEn" TEXT,
    "meaningFa" TEXT,
    "payload" JSONB NOT NULL,
    "payloadVersion" INTEGER NOT NULL DEFAULT 1,
    "source" "ContentSource" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "LearningItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningItemSource" (
    "id" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "lessonId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearningItemSource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Book_ownerId_idx" ON "Book"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Unit_bookId_number_key" ON "Unit"("bookId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Lesson_unitId_code_key" ON "Lesson"("unitId", "code");

-- CreateIndex
CREATE INDEX "Enrollment_userId_status_activatedAt_idx" ON "Enrollment"("userId", "status", "activatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Enrollment_userId_bookId_key" ON "Enrollment"("userId", "bookId");

-- CreateIndex
CREATE INDEX "LearningItem_ownerId_type_archivedAt_idx" ON "LearningItem"("ownerId", "type", "archivedAt");

-- CreateIndex
CREATE INDEX "LearningItem_ownerId_createdAt_idx" ON "LearningItem"("ownerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LearningItem_ownerId_type_normalizedKey_key" ON "LearningItem"("ownerId", "type", "normalizedKey");

-- CreateIndex
CREATE INDEX "LearningItemSource_lessonId_idx" ON "LearningItemSource"("lessonId");

-- CreateIndex
CREATE UNIQUE INDEX "LearningItemSource_itemId_lessonId_key" ON "LearningItemSource"("itemId", "lessonId");

-- AddForeignKey
ALTER TABLE "Book" ADD CONSTRAINT "Book_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_currentLessonId_fkey" FOREIGN KEY ("currentLessonId") REFERENCES "Lesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningItem" ADD CONSTRAINT "LearningItem_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningItemSource" ADD CONSTRAINT "LearningItemSource_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "LearningItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningItemSource" ADD CONSTRAINT "LearningItemSource_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
