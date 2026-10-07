-- CreateEnum
CREATE TYPE "LearningStatus" AS ENUM ('NEW', 'LEARNING', 'REVIEW', 'MASTERED');

-- CreateEnum
CREATE TYPE "MistakeStatus" AS ENUM ('ACTIVE', 'IMPROVING', 'RESOLVED');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "SessionBlock" AS ENUM ('WARM_UP', 'NEW_CONTENT', 'PRACTICE', 'CONTEXT', 'PRODUCTION', 'REVIEW');

-- CreateEnum
CREATE TYPE "SelectionReason" AS ENUM ('DUE_REVIEW', 'MISTAKE', 'WEAK_AREA', 'NEW_CONTENT', 'TEACHER_ASSIGNED', 'RECOVERY');

-- AlterTable
ALTER TABLE "ExerciseAttempt" ADD COLUMN     "sessionItemId" UUID;

-- CreateTable
CREATE TABLE "UserItemState" (
    "userId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "status" "LearningStatus" NOT NULL DEFAULT 'NEW',
    "isWeak" BOOLEAN NOT NULL DEFAULT false,
    "due" TIMESTAMP(3),
    "stability" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "difficulty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fsrsState" INTEGER NOT NULL DEFAULT 0,
    "reps" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "scheduledDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "learningSteps" INTEGER NOT NULL DEFAULT 0,
    "lastReviewedAt" TIMESTAMP(3),
    "lastReviewLocalDate" DATE,
    "mastery" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "accuracyEwma" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentLevel" "ExerciseLevel" NOT NULL DEFAULT 'RECOGNITION',
    "highestLevelPassed" "ExerciseLevel",
    "levelStreak" INTEGER NOT NULL DEFAULT 0,
    "firstSeenAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserItemState_pkey" PRIMARY KEY ("userId","itemId")
);

-- CreateTable
CREATE TABLE "ReviewLog" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "attemptId" UUID,
    "rating" INTEGER NOT NULL,
    "stabilityAfter" DOUBLE PRECISION NOT NULL,
    "dueAfter" TIMESTAMP(3) NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mistake" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "errorCode" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "status" "MistakeStatus" NOT NULL DEFAULT 'ACTIVE',
    "occurrences" INTEGER NOT NULL DEFAULT 1,
    "priority" DOUBLE PRECISION NOT NULL,
    "correctDays" INTEGER NOT NULL DEFAULT 0,
    "lastCorrectDate" DATE,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Mistake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MistakeOccurrence" (
    "id" UUID NOT NULL,
    "mistakeId" UUID NOT NULL,
    "attemptId" UUID NOT NULL,
    "userAnswer" TEXT NOT NULL,
    "expectedAnswer" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MistakeOccurrence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailySession" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "localDate" DATE NOT NULL,
    "ordinal" INTEGER NOT NULL DEFAULT 1,
    "status" "SessionStatus" NOT NULL DEFAULT 'PLANNED',
    "plannedSeconds" INTEGER NOT NULL,
    "activeSeconds" INTEGER NOT NULL DEFAULT 0,
    "planMeta" JSONB NOT NULL,
    "score" DOUBLE PRECISION,
    "xpEarned" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailySession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailySessionItem" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "block" "SessionBlock" NOT NULL,
    "exerciseId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "reason" "SelectionReason" NOT NULL,

    CONSTRAINT "DailySessionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyActivity" (
    "userId" UUID NOT NULL,
    "localDate" DATE NOT NULL,
    "activeSeconds" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "correct" INTEGER NOT NULL DEFAULT 0,
    "sessionsCompleted" INTEGER NOT NULL DEFAULT 0,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "goalMet" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "DailyActivity_pkey" PRIMARY KEY ("userId","localDate")
);

-- CreateTable
CREATE TABLE "UserGamification" (
    "userId" UUID NOT NULL,
    "totalXp" INTEGER NOT NULL DEFAULT 0,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "longestStreak" INTEGER NOT NULL DEFAULT 0,
    "lastStreakDate" DATE,

    CONSTRAINT "UserGamification_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "XpEvent" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "XpEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserItemState_userId_due_idx" ON "UserItemState"("userId", "due");

-- CreateIndex
CREATE INDEX "UserItemState_userId_status_idx" ON "UserItemState"("userId", "status");

-- CreateIndex
CREATE INDEX "ReviewLog_userId_itemId_idx" ON "ReviewLog"("userId", "itemId");

-- CreateIndex
CREATE INDEX "Mistake_userId_status_priority_idx" ON "Mistake"("userId", "status", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "Mistake_userId_signature_key" ON "Mistake"("userId", "signature");

-- CreateIndex
CREATE INDEX "MistakeOccurrence_mistakeId_createdAt_idx" ON "MistakeOccurrence"("mistakeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DailySession_userId_localDate_ordinal_key" ON "DailySession"("userId", "localDate", "ordinal");

-- CreateIndex
CREATE UNIQUE INDEX "DailySessionItem_sessionId_position_key" ON "DailySessionItem"("sessionId", "position");

-- CreateIndex
CREATE INDEX "XpEvent_userId_createdAt_idx" ON "XpEvent"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "XpEvent_userId_reason_refId_key" ON "XpEvent"("userId", "reason", "refId");

-- CreateIndex
CREATE UNIQUE INDEX "ExerciseAttempt_sessionItemId_key" ON "ExerciseAttempt"("sessionItemId");

-- AddForeignKey
ALTER TABLE "ExerciseAttempt" ADD CONSTRAINT "ExerciseAttempt_sessionItemId_fkey" FOREIGN KEY ("sessionItemId") REFERENCES "DailySessionItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserItemState" ADD CONSTRAINT "UserItemState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserItemState" ADD CONSTRAINT "UserItemState_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "LearningItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewLog" ADD CONSTRAINT "ReviewLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mistake" ADD CONSTRAINT "Mistake_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mistake" ADD CONSTRAINT "Mistake_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "LearningItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MistakeOccurrence" ADD CONSTRAINT "MistakeOccurrence_mistakeId_fkey" FOREIGN KEY ("mistakeId") REFERENCES "Mistake"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailySession" ADD CONSTRAINT "DailySession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailySessionItem" ADD CONSTRAINT "DailySessionItem_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "DailySession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailySessionItem" ADD CONSTRAINT "DailySessionItem_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailySessionItem" ADD CONSTRAINT "DailySessionItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "LearningItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyActivity" ADD CONSTRAINT "DailyActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserGamification" ADD CONSTRAINT "UserGamification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "XpEvent" ADD CONSTRAINT "XpEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
