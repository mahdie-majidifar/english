import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { z } from 'zod';
import {
  CommitMaterialSchema,
  CreateTeacherSessionSchema,
  CreateTextMaterialSchema,
  MAX_UPLOAD_BYTES,
  MaterialCategorySchema,
  type CommitMaterial,
  type CommitResult,
  type CreateTeacherSession,
  type CreateTextMaterial,
  type MaterialDto,
  type TeacherSessionDetail,
  type TeacherSessionSummary,
} from '@coach/contracts';
import type { RequestUser } from '../../core/auth/auth.types.js';
import { CurrentUser } from '../../core/auth/decorators.js';
import { ZodValidationPipe } from '../../core/http/zod-validation.pipe.js';
import { TeacherService, type UploadedFileLike } from './teacher.service.js';

const uuid = () => new ParseUUIDPipe();

const FileMetaSchema = z.object({
  category: MaterialCategorySchema.default('CLASS_NOTES'),
  title: z.string().trim().max(120).optional(),
});

/** Content-Disposition value that is safe for any filename, including Persian ones. */
const attachment = (name: string) =>
  `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(name)}`;

@Controller()
export class TeacherController {
  constructor(private readonly teacher: TeacherService) {}

  @Get('teacher-sessions')
  list(@CurrentUser() user: RequestUser): Promise<TeacherSessionSummary[]> {
    return this.teacher.listSessions(user.id);
  }

  @Post('teacher-sessions')
  create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(CreateTeacherSessionSchema)) body: CreateTeacherSession,
  ): Promise<TeacherSessionSummary> {
    return this.teacher.createSession(user.id, body);
  }

  @Get('teacher-sessions/:sessionId')
  get(
    @CurrentUser() user: RequestUser,
    @Param('sessionId', uuid()) sessionId: string,
  ): Promise<TeacherSessionDetail> {
    return this.teacher.getSession(user.id, sessionId);
  }

  @Delete('teacher-sessions/:sessionId')
  @HttpCode(204)
  remove(@CurrentUser() user: RequestUser, @Param('sessionId', uuid()) sessionId: string): Promise<void> {
    return this.teacher.deleteSession(user.id, sessionId);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('teacher-sessions/:sessionId/materials/text')
  addText(
    @CurrentUser() user: RequestUser,
    @Param('sessionId', uuid()) sessionId: string,
    @Body(new ZodValidationPipe(CreateTextMaterialSchema)) body: CreateTextMaterial,
  ): Promise<MaterialDto> {
    return this.teacher.addTextMaterial(user.id, sessionId, body);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('teacher-sessions/:sessionId/materials/file')
  // No dest/storage option: files stay in memory, are checked, and only then written by StorageService.
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  addFile(
    @CurrentUser() user: RequestUser,
    @Param('sessionId', uuid()) sessionId: string,
    @UploadedFile() file: UploadedFileLike | undefined,
    @Body(new ZodValidationPipe(FileMetaSchema)) body: z.infer<typeof FileMetaSchema>,
  ): Promise<MaterialDto> {
    return this.teacher.addFileMaterial(user.id, sessionId, file, body);
  }

  @Get('teacher-materials/:materialId')
  getMaterial(
    @CurrentUser() user: RequestUser,
    @Param('materialId', uuid()) materialId: string,
  ): Promise<MaterialDto> {
    return this.teacher.getMaterial(user.id, materialId);
  }

  /** The original uploaded file, exactly as it was received. */
  @Get('teacher-materials/:materialId/file')
  async file(
    @CurrentUser() user: RequestUser,
    @Param('materialId', uuid()) materialId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { stream, fileName, mimeType } = await this.teacher.openFile(user.id, materialId);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', attachment(fileName));
    res.setHeader('Cache-Control', 'private, no-store');
    stream.pipe(res);
  }

  @Post('teacher-materials/:materialId/reparse')
  @HttpCode(200)
  reparse(
    @CurrentUser() user: RequestUser,
    @Param('materialId', uuid()) materialId: string,
  ): Promise<MaterialDto> {
    return this.teacher.reparse(user.id, materialId);
  }

  @Post('teacher-materials/:materialId/commit')
  @HttpCode(200)
  commit(
    @CurrentUser() user: RequestUser,
    @Param('materialId', uuid()) materialId: string,
    @Body(new ZodValidationPipe(CommitMaterialSchema)) body: CommitMaterial,
  ): Promise<CommitResult> {
    return this.teacher.commit(user.id, materialId, body);
  }

  @Post('teacher-materials/:materialId/discard')
  @HttpCode(204)
  discard(@CurrentUser() user: RequestUser, @Param('materialId', uuid()) materialId: string): Promise<void> {
    return this.teacher.discard(user.id, materialId);
  }
}
