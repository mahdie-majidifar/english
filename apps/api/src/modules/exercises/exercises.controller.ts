import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  AttemptRequestSchema,
  PracticeRequestSchema,
  type AttemptRequest,
  type AttemptResult,
  type PracticeRequest,
  type PracticeRun,
} from '@coach/contracts';
import type { RequestUser } from '../../core/auth/auth.types.js';
import { CurrentUser } from '../../core/auth/decorators.js';
import { ZodValidationPipe } from '../../core/http/zod-validation.pipe.js';
import { AttemptsService } from './attempts.service.js';
import { ExercisesService } from './exercises.service.js';

@Controller()
export class ExercisesController {
  constructor(
    private readonly exercises: ExercisesService,
    private readonly attempts: AttemptsService,
  ) {}

  /** A set of exercises to play. Contains no answers. */
  @Post('practice')
  @HttpCode(200)
  practice(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(PracticeRequestSchema)) body: PracticeRequest,
  ): Promise<PracticeRun> {
    return this.exercises.buildPractice(user.id, body);
  }

  /** Check one answer. The verdict and the correct answer come back only now. */
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Post('attempts')
  @HttpCode(200)
  attempt(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(AttemptRequestSchema)) body: AttemptRequest,
  ): Promise<AttemptResult> {
    return this.attempts.submit(user.id, body);
  }

  /** Ask the AI for more exercises for an item. */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('items/:itemId/generate-exercises')
  @HttpCode(200)
  generate(
    @CurrentUser() user: RequestUser,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
  ): Promise<{ created: number; rejected: number }> {
    return this.exercises.generateForItem(user.id, itemId);
  }
}
