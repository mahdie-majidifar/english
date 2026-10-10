import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import {
  AnswerAssessmentSchema,
  CreateAssessmentSchema,
  type AnswerAssessment,
  type AnswerSavedDto,
  type AssessmentDto,
  type AssessmentListDto,
  type AssessmentResultDto,
  type AssessmentSummaryDto,
  type CreateAssessment,
} from '@coach/contracts';
import type { RequestUser } from '../../core/auth/auth.types.js';
import { CurrentUser } from '../../core/auth/decorators.js';
import { ZodValidationPipe } from '../../core/http/zod-validation.pipe.js';
import { AssessmentsService } from './assessments.service.js';

const uuid = () => new ParseUUIDPipe();

@Controller('assessments')
export class AssessmentsController {
  constructor(private readonly assessments: AssessmentsService) {}

  /** Chooses and locks the questions. Nothing starts until /start. */
  @Post()
  create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(CreateAssessmentSchema)) body: CreateAssessment,
  ): Promise<AssessmentSummaryDto> {
    return this.assessments.create(user.id, body);
  }

  @Get()
  list(@CurrentUser() user: RequestUser): Promise<AssessmentListDto> {
    return this.assessments.list(user.id);
  }

  @Get(':id')
  get(@CurrentUser() user: RequestUser, @Param('id', uuid()) id: string): Promise<AssessmentDto> {
    return this.assessments.get(user.id, id);
  }

  @Post(':id/start')
  @HttpCode(200)
  start(@CurrentUser() user: RequestUser, @Param('id', uuid()) id: string): Promise<AssessmentDto> {
    return this.assessments.start(user.id, id);
  }

  @Put(':id/questions/:questionId/answer')
  answer(
    @CurrentUser() user: RequestUser,
    @Param('id', uuid()) id: string,
    @Param('questionId', uuid()) questionId: string,
    @Body(new ZodValidationPipe(AnswerAssessmentSchema)) body: AnswerAssessment,
  ): Promise<AnswerSavedDto> {
    return this.assessments.answer(user.id, id, questionId, body);
  }

  @Post(':id/submit')
  @HttpCode(200)
  submit(@CurrentUser() user: RequestUser, @Param('id', uuid()) id: string): Promise<AssessmentResultDto> {
    return this.assessments.submit(user.id, id);
  }

  @Get(':id/result')
  result(@CurrentUser() user: RequestUser, @Param('id', uuid()) id: string): Promise<AssessmentResultDto> {
    return this.assessments.result(user.id, id);
  }
}
