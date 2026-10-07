import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import {
  CreateBookSchema,
  CreateLessonSchema,
  CreateUnitSchema,
  ImportStructureSchema,
  SetCurrentLessonSchema,
  UpdateBookSchema,
  UpdateLessonSchema,
  UpdateUnitSchema,
  type BookDetail,
  type BookSummary,
  type CreateBook,
  type CreateLesson,
  type CreateUnit,
  type CurrentContext,
  type ImportStructure,
  type ImportStructureResult,
  type SetCurrentLesson,
  type UpdateBook,
  type UpdateLesson,
  type UpdateUnit,
} from '@coach/contracts';
import type { RequestUser } from '../../core/auth/auth.types.js';
import { CurrentUser } from '../../core/auth/decorators.js';
import { ZodValidationPipe } from '../../core/http/zod-validation.pipe.js';
import { CatalogService } from './catalog.service.js';

const uuid = () => new ParseUUIDPipe();

@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('books')
  listBooks(@CurrentUser() user: RequestUser): Promise<BookSummary[]> {
    return this.catalog.listBooks(user.id);
  }

  @Post('books')
  createBook(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(CreateBookSchema)) body: CreateBook,
  ): Promise<BookSummary> {
    return this.catalog.createBook(user.id, body);
  }

  @Get('books/:bookId')
  getBook(@CurrentUser() user: RequestUser, @Param('bookId', uuid()) bookId: string): Promise<BookDetail> {
    return this.catalog.getBook(user.id, bookId);
  }

  @Patch('books/:bookId')
  @HttpCode(204)
  updateBook(
    @CurrentUser() user: RequestUser,
    @Param('bookId', uuid()) bookId: string,
    @Body(new ZodValidationPipe(UpdateBookSchema)) body: UpdateBook,
  ): Promise<void> {
    return this.catalog.updateBook(user.id, bookId, body);
  }

  @Delete('books/:bookId')
  @HttpCode(204)
  deleteBook(@CurrentUser() user: RequestUser, @Param('bookId', uuid()) bookId: string): Promise<void> {
    return this.catalog.deleteBook(user.id, bookId);
  }

  @Post('books/:bookId/import-structure')
  @HttpCode(200)
  importStructure(
    @CurrentUser() user: RequestUser,
    @Param('bookId', uuid()) bookId: string,
    @Body(new ZodValidationPipe(ImportStructureSchema)) body: ImportStructure,
  ): Promise<ImportStructureResult> {
    return this.catalog.importStructure(user.id, bookId, body.text);
  }

  @Post('books/:bookId/units')
  createUnit(
    @CurrentUser() user: RequestUser,
    @Param('bookId', uuid()) bookId: string,
    @Body(new ZodValidationPipe(CreateUnitSchema)) body: CreateUnit,
  ): Promise<{ id: string }> {
    return this.catalog.createUnit(user.id, bookId, body);
  }

  @Patch('units/:unitId')
  @HttpCode(204)
  updateUnit(
    @CurrentUser() user: RequestUser,
    @Param('unitId', uuid()) unitId: string,
    @Body(new ZodValidationPipe(UpdateUnitSchema)) body: UpdateUnit,
  ): Promise<void> {
    return this.catalog.updateUnit(user.id, unitId, body);
  }

  @Delete('units/:unitId')
  @HttpCode(204)
  deleteUnit(@CurrentUser() user: RequestUser, @Param('unitId', uuid()) unitId: string): Promise<void> {
    return this.catalog.deleteUnit(user.id, unitId);
  }

  @Post('units/:unitId/lessons')
  createLesson(
    @CurrentUser() user: RequestUser,
    @Param('unitId', uuid()) unitId: string,
    @Body(new ZodValidationPipe(CreateLessonSchema)) body: CreateLesson,
  ): Promise<{ id: string }> {
    return this.catalog.createLesson(user.id, unitId, body);
  }

  @Patch('lessons/:lessonId')
  @HttpCode(204)
  updateLesson(
    @CurrentUser() user: RequestUser,
    @Param('lessonId', uuid()) lessonId: string,
    @Body(new ZodValidationPipe(UpdateLessonSchema)) body: UpdateLesson,
  ): Promise<void> {
    return this.catalog.updateLesson(user.id, lessonId, body);
  }

  @Delete('lessons/:lessonId')
  @HttpCode(204)
  deleteLesson(
    @CurrentUser() user: RequestUser,
    @Param('lessonId', uuid()) lessonId: string,
  ): Promise<void> {
    return this.catalog.deleteLesson(user.id, lessonId);
  }

  @Get('me/current')
  async current(@CurrentUser() user: RequestUser): Promise<{ current: CurrentContext | null }> {
    return { current: await this.catalog.getCurrent(user.id) };
  }

  @Put('me/current-lesson')
  setCurrent(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(SetCurrentLessonSchema)) body: SetCurrentLesson,
  ): Promise<CurrentContext> {
    return this.catalog.setCurrentLesson(user.id, body.lessonId);
  }
}
