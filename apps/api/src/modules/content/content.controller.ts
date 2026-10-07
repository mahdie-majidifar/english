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
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import {
  CreateItemSchema,
  ItemListQuerySchema,
  UpdateItemSchema,
  type CreateItem,
  type Item,
  type ItemListQuery,
  type ItemListResponse,
  type SearchResponse,
  type UpdateItem,
} from '@coach/contracts';
import type { RequestUser } from '../../core/auth/auth.types.js';
import { CurrentUser } from '../../core/auth/decorators.js';
import { ZodValidationPipe } from '../../core/http/zod-validation.pipe.js';
import { ContentService } from './content.service.js';

const SearchQuerySchema = z.object({ q: z.string().trim().max(80).default('') });

@Controller()
export class ContentController {
  constructor(private readonly content: ContentService) {}

  @Get('items')
  list(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(ItemListQuerySchema)) query: ItemListQuery,
  ): Promise<ItemListResponse> {
    return this.content.list(user.id, query);
  }

  @Post('items')
  create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(CreateItemSchema)) body: CreateItem,
  ): Promise<Item> {
    return this.content.create(user.id, body);
  }

  @Get('items/:itemId')
  get(@CurrentUser() user: RequestUser, @Param('itemId', new ParseUUIDPipe()) itemId: string): Promise<Item> {
    return this.content.get(user.id, itemId);
  }

  @Patch('items/:itemId')
  update(
    @CurrentUser() user: RequestUser,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Body(new ZodValidationPipe(UpdateItemSchema)) body: UpdateItem,
  ): Promise<Item> {
    return this.content.update(user.id, itemId, body);
  }

  @Delete('items/:itemId')
  @HttpCode(204)
  archive(
    @CurrentUser() user: RequestUser,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
  ): Promise<void> {
    return this.content.archive(user.id, itemId);
  }

  @Get('search')
  search(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(SearchQuerySchema)) query: { q: string },
  ): Promise<SearchResponse> {
    return this.content.search(user.id, query.q);
  }
}
