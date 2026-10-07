import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  CreateSessionSchema,
  type CreateSession,
  type DailySessionDto,
  type DailySessionEnvelope,
  type SessionResultDto,
  type SessionSummaryDto,
} from '@coach/contracts';
import type { RequestUser } from '../../core/auth/auth.types.js';
import { CurrentUser } from '../../core/auth/decorators.js';
import { ZodValidationPipe } from '../../core/http/zod-validation.pipe.js';
import { SessionsService } from './sessions.service.js';

@Controller('daily-sessions')
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  /** Today's session: the one in progress, or a newly planned one. */
  @Post()
  @HttpCode(200)
  open(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(CreateSessionSchema)) body: CreateSession,
  ): Promise<DailySessionEnvelope> {
    return this.sessions.current(user.id, body.extra);
  }

  @Get('today')
  async today(@CurrentUser() user: RequestUser): Promise<{ session: SessionSummaryDto | null }> {
    return { session: await this.sessions.today(user.id) };
  }

  @Get(':sessionId')
  get(@CurrentUser() user: RequestUser, @Param('sessionId', new ParseUUIDPipe()) sessionId: string): Promise<DailySessionDto> {
    return this.sessions.get(user.id, sessionId);
  }

  @Post(':sessionId/complete')
  @HttpCode(200)
  complete(
    @CurrentUser() user: RequestUser,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
  ): Promise<SessionResultDto> {
    return this.sessions.complete(user.id, sessionId);
  }
}
