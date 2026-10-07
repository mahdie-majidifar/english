import { Controller, Get, Query } from '@nestjs/common';
import {
  MistakeListQuerySchema,
  type MistakeDto,
  type MistakeListQuery,
  type MistakeSummary,
} from '@coach/contracts';
import type { RequestUser } from '../../core/auth/auth.types.js';
import { CurrentUser } from '../../core/auth/decorators.js';
import { ZodValidationPipe } from '../../core/http/zod-validation.pipe.js';
import { MistakesService } from './mistakes.service.js';

@Controller('mistakes')
export class MistakesController {
  constructor(private readonly mistakes: MistakesService) {}

  @Get()
  list(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(MistakeListQuerySchema)) query: MistakeListQuery,
  ): Promise<MistakeDto[]> {
    return this.mistakes.list(user.id, query);
  }

  @Get('summary')
  summary(@CurrentUser() user: RequestUser): Promise<MistakeSummary> {
    return this.mistakes.summary(user.id);
  }
}
