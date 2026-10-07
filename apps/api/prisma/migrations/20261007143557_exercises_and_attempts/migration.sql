-- CreateEnum
CREATE TYPE "ExerciseLevel" AS ENUM ('RECOGNITION', 'RECALL', 'CONTEXT', 'PRODUCTION');

-- CreateEnum
CREATE TYPE "ExerciseOrigin" AS ENUM ('TEACHER_ORIGINAL', 'TEACHER_DERIVED', 'AI_GENERATED', 'TEMPLATE');

-- CreateEnum
CREATE TYPE "ExerciseStatus" AS ENUM ('ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "EvaluationMode" AS ENUM ('RULE', 'AI');

-- CreateEnum
CREATE TYPE "AttemptContext" AS ENUM ('PRACTICE', 'DAILY_SESSION', 'QUIZ', 'EXAM', 'CHALLENGE');

-- CreateTable
CREATE TABLE "Exercise" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "format" TEXT NOT NULL,
    "level" "ExerciseLevel" NOT NULL,
    "skill" TEXT NOT NULL,
    "origin" "ExerciseOrigin" NOT NULL,
    "status" "ExerciseStatus" NOT NULL DEFAULT 'ACTIVE',
    "content" JSONB NOT NULL,
    "solution" JSONB NOT NULL,
    "evaluationMode" "EvaluationMode" NOT NULL,
    "estimatedSeconds" INTEGER NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "aiRunId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Exercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExerciseItem" (
    "exerciseId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ExerciseItem_pkey" PRIMARY KEY ("exerciseId","itemId")
);

-- CreateTable
CREATE TABLE "ExerciseAttempt" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "exerciseId" UUID NOT NULL,
    "context" "AttemptContext" NOT NULL DEFAULT 'PRACTICE',
    "response" JSONB NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "verdict" TEXT NOT NULL,
    "evaluation" JSONB NOT NULL,
    "evaluatedBy" "EvaluationMode" NOT NULL,
    "durationMs" INTEGER,
    "hintsUsed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExerciseAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttemptItemResult" (
    "attemptId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "errorCodes" TEXT[],

    CONSTRAINT "AttemptItemResult_pkey" PRIMARY KEY ("attemptId","itemId")
);

-- CreateIndex
CREATE INDEX "Exercise_ownerId_status_level_idx" ON "Exercise"("ownerId", "status", "level");

-- CreateIndex
CREATE UNIQUE INDEX "Exercise_ownerId_fingerprint_key" ON "Exercise"("ownerId", "fingerprint");

-- CreateIndex
CREATE INDEX "ExerciseItem_itemId_idx" ON "ExerciseItem"("itemId");

-- CreateIndex
CREATE INDEX "ExerciseAttempt_userId_createdAt_idx" ON "ExerciseAttempt"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ExerciseAttempt_userId_exerciseId_idx" ON "ExerciseAttempt"("userId", "exerciseId");

-- CreateIndex
CREATE INDEX "AttemptItemResult_itemId_idx" ON "AttemptItemResult"("itemId");

-- AddForeignKey
ALTER TABLE "Exercise" ADD CONSTRAINT "Exercise_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseItem" ADD CONSTRAINT "ExerciseItem_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseItem" ADD CONSTRAINT "ExerciseItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "LearningItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseAttempt" ADD CONSTRAINT "ExerciseAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseAttempt" ADD CONSTRAINT "ExerciseAttempt_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttemptItemResult" ADD CONSTRAINT "AttemptItemResult_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "ExerciseAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttemptItemResult" ADD CONSTRAINT "AttemptItemResult_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "LearningItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
