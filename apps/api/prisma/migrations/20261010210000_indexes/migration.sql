-- CreateIndex
CREATE INDEX "Assessment_userId_status_idx" ON "Assessment"("userId", "status");

-- CreateIndex
CREATE INDEX "AssessmentQuestion_exerciseId_idx" ON "AssessmentQuestion"("exerciseId");

-- CreateIndex
CREATE INDEX "MistakeOccurrence_attemptId_idx" ON "MistakeOccurrence"("attemptId");
