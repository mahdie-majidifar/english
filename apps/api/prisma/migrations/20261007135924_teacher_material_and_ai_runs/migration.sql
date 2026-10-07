-- CreateEnum
CREATE TYPE "MaterialCategory" AS ENUM ('CLASS_NOTES', 'EXERCISE', 'HANDOUT');

-- CreateEnum
CREATE TYPE "IngestionStatus" AS ENUM ('UPLOADED', 'EXTRACTING', 'PARSING', 'AWAITING_REVIEW', 'COMMITTED', 'FAILED', 'DISCARDED');

-- AlterTable
ALTER TABLE "LearningItemSource" ADD COLUMN     "teacherSessionId" UUID;

-- CreateTable
CREATE TABLE "StoredFile" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoredFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherSession" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "classDate" DATE NOT NULL,
    "lessonId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeacherSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherMaterial" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "sessionId" UUID,
    "category" "MaterialCategory" NOT NULL DEFAULT 'CLASS_NOTES',
    "title" TEXT NOT NULL,
    "rawText" TEXT,
    "fileId" UUID,
    "extractedText" TEXT,
    "status" "IngestionStatus" NOT NULL DEFAULT 'UPLOADED',
    "errorMessage" TEXT,
    "proposal" JSONB,
    "aiRunId" UUID,
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeacherMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherExercise" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "materialId" UUID NOT NULL,
    "sessionId" UUID,
    "originalText" TEXT NOT NULL,
    "skill" TEXT NOT NULL,
    "topic" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeacherExercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiRun" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "task" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "promptVersion" INTEGER NOT NULL,
    "success" BOOLEAN NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "latencyMs" INTEGER NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StoredFile_storageKey_key" ON "StoredFile"("storageKey");

-- CreateIndex
CREATE INDEX "StoredFile_userId_sha256_idx" ON "StoredFile"("userId", "sha256");

-- CreateIndex
CREATE INDEX "TeacherSession_userId_classDate_idx" ON "TeacherSession"("userId", "classDate");

-- CreateIndex
CREATE INDEX "TeacherMaterial_userId_createdAt_idx" ON "TeacherMaterial"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "TeacherMaterial_status_lockedAt_idx" ON "TeacherMaterial"("status", "lockedAt");

-- CreateIndex
CREATE INDEX "TeacherExercise_userId_createdAt_idx" ON "TeacherExercise"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AiRun_userId_createdAt_idx" ON "AiRun"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AiRun_task_createdAt_idx" ON "AiRun"("task", "createdAt");

-- CreateIndex
CREATE INDEX "LearningItemSource_teacherSessionId_idx" ON "LearningItemSource"("teacherSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "LearningItemSource_itemId_teacherSessionId_key" ON "LearningItemSource"("itemId", "teacherSessionId");

-- AddForeignKey
ALTER TABLE "LearningItemSource" ADD CONSTRAINT "LearningItemSource_teacherSessionId_fkey" FOREIGN KEY ("teacherSessionId") REFERENCES "TeacherSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoredFile" ADD CONSTRAINT "StoredFile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherSession" ADD CONSTRAINT "TeacherSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherSession" ADD CONSTRAINT "TeacherSession_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherMaterial" ADD CONSTRAINT "TeacherMaterial_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherMaterial" ADD CONSTRAINT "TeacherMaterial_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TeacherSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherMaterial" ADD CONSTRAINT "TeacherMaterial_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "StoredFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherExercise" ADD CONSTRAINT "TeacherExercise_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherExercise" ADD CONSTRAINT "TeacherExercise_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "TeacherMaterial"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherExercise" ADD CONSTRAINT "TeacherExercise_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TeacherSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
