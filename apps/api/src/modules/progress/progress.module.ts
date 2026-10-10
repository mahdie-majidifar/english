import { Module } from '@nestjs/common';
import { AchievementsService } from './achievements.service.js';
import { ChallengesService } from './challenges.service.js';
import { ProgressController } from './progress.controller.js';
import { ProgressReportService } from './progress-report.service.js';
import { ProgressService } from './progress.service.js';

@Module({
  controllers: [ProgressController],
  providers: [ProgressService, ProgressReportService, AchievementsService, ChallengesService],
  exports: [ProgressService, AchievementsService, ChallengesService],
})
export class ProgressModule {}
