import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import { LoginRequestSchema, type LoginRequest, type MeResponse } from '@coach/contracts';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  REFRESH_COOKIE_PATH,
  SESSION_COOKIE,
  type RequestUser,
} from '../../core/auth/auth.types.js';
import { CurrentUser, Public } from '../../core/auth/decorators.js';
import { AppConfig } from '../../core/config/env.js';
import { ZodValidationPipe } from '../../core/http/zod-validation.pipe.js';
import { AuthService, type IssuedSession } from './auth.service.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: AppConfig,
  ) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(LoginRequestSchema)) body: LoginRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeResponse> {
    const session = await this.auth.login(body.email, body.password, req.headers['user-agent']);
    this.setSessionCookies(res, session);
    return { user: session.user };
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<MeResponse> {
    const raw = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    try {
      const session = await this.auth.refresh(raw, req.headers['user-agent']);
      this.setSessionCookies(res, session);
      return { user: session.user };
    } catch (error) {
      this.clearSessionCookies(res);
      throw error;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const raw = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    await this.auth.logout(raw);
    this.clearSessionCookies(res);
  }

  @Get('me')
  async me(@CurrentUser() current: RequestUser): Promise<MeResponse> {
    return { user: await this.auth.me(current.id) };
  }

  private baseCookie(): CookieOptions {
    return { httpOnly: true, sameSite: 'lax', secure: this.config.isProduction };
  }

  private setSessionCookies(res: Response, session: IssuedSession): void {
    const { ACCESS_TOKEN_TTL_MIN, REFRESH_TOKEN_TTL_DAYS } = this.config.env;
    res.cookie(ACCESS_COOKIE, session.accessToken, {
      ...this.baseCookie(),
      path: '/',
      maxAge: ACCESS_TOKEN_TTL_MIN * 60_000,
    });
    res.cookie(REFRESH_COOKIE, session.refreshToken, {
      ...this.baseCookie(),
      path: REFRESH_COOKIE_PATH,
      maxAge: REFRESH_TOKEN_TTL_DAYS * 86_400_000,
    });
    res.cookie(SESSION_COOKIE, '1', {
      ...this.baseCookie(),
      path: '/',
      maxAge: REFRESH_TOKEN_TTL_DAYS * 86_400_000,
    });
  }

  private clearSessionCookies(res: Response): void {
    res.clearCookie(ACCESS_COOKIE, { ...this.baseCookie(), path: '/' });
    res.clearCookie(REFRESH_COOKIE, { ...this.baseCookie(), path: REFRESH_COOKIE_PATH });
    res.clearCookie(SESSION_COOKIE, { ...this.baseCookie(), path: '/' });
  }
}
