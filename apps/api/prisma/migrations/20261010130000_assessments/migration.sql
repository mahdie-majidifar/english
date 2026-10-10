-- CreateEnum
CREATE TYPE "AssessmentKind" AS ENUM ('QUIZ', 'EXAM');

-- CreateEnum
CREATE TYPE "AssessmentPreset" AS ENUM ('LESSON', 'UNIT', 'WEAK_AREAS', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "AssessmentStatus" AS ENUM ('READY', 'IN_PROGRESS', 'GRADED');

-- AlterTable
ALTER TABLE "ExerciseAttempt" ADD COLUMN     "assessmentQuestionId" UUID;

-- CreateTable
CREATE TABLE "Assessment" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" "AssessmentKind" NOT NULL,
    "preset" "AssessmentPreset" NOT NULL,
    "title" TEXT NOT NULL,
    "status" "AssessmentStatus" NOT NULL DEFAULT 'READY',
    "timeLimitSec" INTEGER,
    "startedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "gradedAt" TIMESTAMP(3),
    "score" DOUBLE PRECISION,
    "xpEarned" INTEGER NOT NULL DEFAULT 0,
    "breakdown" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentQuestion" (
    "id" UUID NOT NULL,
    "assessmentId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "exerciseId" UUID NOT NULL,
    "skill" TEXT NOT NULL,
    "points" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "response" JSONB,
    "durationMs" INTEGER,
    "answeredAt" TIMESTAMP(3),

    CONSTRAINT "AssessmentQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Assessment_userId_kind_createdAt_idx" ON "Assessment"("userId", "kind", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentQuestion_assessmentId_position_key" ON "AssessmentQuestion"("assessmentId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "ExerciseAttempt_assessmentQuestionId_key" ON "ExerciseAttempt"("assessmentQuestionId");

-- AddForeignKey
ALTER TABLE "ExerciseAttempt" ADD CONSTRAINT "ExerciseAttempt_assessmentQuestionId_fkey" FOREIGN KEY ("assessmentQuestionId") REFERENCES "AssessmentQuestion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentQuestion" ADD CONSTRAINT "AssessmentQuestion_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentQuestion" ADD CONSTRAINT "AssessmentQuestion_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;
