import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  LearnContextQuerySchema,
  SuggestLessonContentSchema,
  type ExplanationResponse,
  type LearnContextDto,
  type LearnContextQuery,
  type SuggestLessonContent,
  type SuggestLessonContentResult,
} from '@coach/contracts';
import type { RequestUser } from '../../core/auth/auth.types.js';
import { CurrentUser } from '../../core/auth/decorators.js';
import { ZodValidationPipe } from '../../core/http/zod-validation.pipe.js';
import { LearnService } from './learn.service.js';

const uuid = () => new ParseUUIDPipe();

@Controller()
export class LearnController {
  constructor(private readonly learn: LearnService) {}

  @Get('learn/context')
  context(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(LearnContextQuerySchema)) query: LearnContextQuery,
  ): Promise<LearnContextDto> {
    return this.learn.context(user.id, query);
  }

  @Get('items/:itemId/explanation')
  explanation(@CurrentUser() user: RequestUser, @Param('itemId', uuid()) itemId: string): Promise<ExplanationResponse> {
    return this.learn.getExplanation(user.id, itemId);
  }

  /** AI call. Returns the kept explanation unless `?refresh=1`. */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('items/:itemId/explain')
  @HttpCode(200)
  explain(
    @CurrentUser() user: RequestUser,
    @Param('itemId', uuid()) itemId: string,
    @Query('refresh') refresh?: string,
  ): Promise<ExplanationResponse> {
    return this.learn.explain(user.id, itemId, refresh === '1');
  }

  /** AI call. Parks the suggestions as a draft to review; saves nothing to the library. */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('lessons/:lessonId/suggest-content')
  @HttpCode(200)
  suggest(
    @CurrentUser() user: RequestUser,
    @Param('lessonId', uuid()) lessonId: string,
    @Body(new ZodValidationPipe(SuggestLessonContentSchema)) body: SuggestLessonContent,
  ): Promise<SuggestLessonContentResult> {
    return this.learn.suggestForLesson(user.id, lessonId, body);
  }
}
