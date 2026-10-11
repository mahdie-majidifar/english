import { once } from 'node:events';
import { Body, Controller, Delete, Get, HttpCode, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Response } from 'express';
import { DeleteAccountSchema, type DeleteAccount } from '@coach/contracts';
import { ACCESS_COOKIE, REFRESH_COOKIE, REFRESH_COOKIE_PATH, SESSION_COOKIE, type RequestUser } from '../../core/auth/auth.types.js';
import { CurrentUser } from '../../core/auth/decorators.js';
import { AppConfig } from '../../core/config/env.js';
import { ZodValidationPipe } from '../../core/http/zod-validation.pipe.js';
import { AccountService } from './account.service.js';

@Controller('me')
export class AccountController {
  constructor(
    private readonly account: AccountService,
    private readonly config: AppConfig,
  ) {}

  /** Downloads everything the learner owns as one JSON file. */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Get('export')
  async export(@CurrentUser() user: RequestUser, @Res() res: Response): Promise<void> {
    const chunks = this.account.exportChunks(user.id);
    // Read the first piece before any header is sent, so a failure still becomes a normal error response.
    const first = await chunks.next();
    const day = new Date().toISOString().slice(0, 10);
    res.status(200);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="english-coach-export-${day}.json"`);
    res.setHeader('Cache-Control', 'no-store');
    if (!first.done) await this.write(res, first.value);
    try {
      for await (const chunk of chunks) await this.write(res, chunk);
      res.end();
    } catch (error) {
      // Headers are already out: all that is left is to cut the download, so a broken file is never mistaken for a whole one.
      res.destroy(error instanceof Error ? error : undefined);
    }
  }

  /** Deletes the account for good. The learner must type their password again. */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Delete()
  @HttpCode(204)
  async delete(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(DeleteAccountSchema)) body: DeleteAccount,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.account.checkPassword(user.id, body.password);
    await this.account.deleteAccount(user.id);
    const base: CookieOptions = { httpOnly: true, sameSite: 'lax', secure: this.config.isProduction };
    res.clearCookie(ACCESS_COOKIE, { ...base, path: '/' });
    res.clearCookie(REFRESH_COOKIE, { ...base, path: REFRESH_COOKIE_PATH });
    res.clearCookie(SESSION_COOKIE, { ...base, path: '/' });
  }

  /** Writes a piece and waits when the connection is slow, so memory stays flat however big the export is. */
  private async write(res: Response, chunk: string): Promise<void> {
    if (!res.write(chunk)) await once(res, 'drain');
  }
}
