import { Controller, Get, Query } from '@nestjs/common';
import { ProgressQuerySchema, type AchievementsDto, type ChallengesDto, type ProgressDto, type ProgressQuery } from '@coach/contracts';
import type { RequestUser } from '../../core/auth/auth.types.js';
import { CurrentUser } from '../../core/auth/decorators.js';
import { ZodValidationPipe } from '../../core/http/zod-validation.pipe.js';
import { AchievementsService } from './achievements.service.js';
import { ChallengesService } from './challenges.service.js';
import { ProgressReportService } from './progress-report.service.js';

@Controller()
export class ProgressController {
  constructor(
    private readonly report: ProgressReportService,
    private readonly achievements: AchievementsService,
    private readonly challenges: ChallengesService,
  ) {}

  @Get('progress')
  progress(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(ProgressQuerySchema)) query: ProgressQuery,
  ): Promise<ProgressDto> {
    return this.report.report(user.id, query.days);
  }

  /** Today's and this week's challenge. Looking after finishing one pays its reward, once. */
  @Get('challenges')
  challenge(@CurrentUser() user: RequestUser): Promise<ChallengesDto> {
    return this.challenges.current(user.id);
  }

  @Get('achievements')
  list(@CurrentUser() user: RequestUser): Promise<AchievementsDto> {
    return this.achievements.list(user.id);
  }
}
