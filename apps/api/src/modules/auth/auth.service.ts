import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import type { AuthUser } from '@coach/contracts';
import type { AccessTokenPayload } from '../../core/auth/auth.types.js';
import { AppConfig } from '../../core/config/env.js';
import { DomainError, invalidCredentials, unauthenticated } from '../../core/http/domain-error.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import type { User } from '../../generated/prisma/client.js';

export interface IssuedSession {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

/** A rotated token reused within this window is treated as a client race, not theft. */
const REUSE_GRACE_MS = 10_000;

export const hashToken = (raw: string): string => createHash('sha256').update(raw).digest('hex');

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

export function toAuthUser(user: Pick<User, 'id' | 'email' | 'displayName' | 'role' | 'timezone'>): AuthUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    timezone: user.timezone,
  };
}

@Injectable()
export class AuthService {
  /** Verified against when the email is unknown, so response time does not reveal which emails exist. */
  private dummyHash?: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: AppConfig,
  ) {}

  async login(email: string, password: string, userAgent?: string): Promise<IssuedSession> {
    const user = await this.prisma.user.findUnique({ where: { email: normalizeEmail(email) } });
    const hash = user?.passwordHash ?? (await this.getDummyHash());
    const valid = await argon2.verify(hash, password).catch(() => false);
    if (!user || !valid) throw invalidCredentials();
    return this.issueSession(user, randomUUID(), userAgent);
  }

  async refresh(rawToken: string | undefined, userAgent?: string): Promise<IssuedSession> {
    if (!rawToken) throw unauthenticated('No session.');

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
      include: { user: true },
    });
    if (!stored) throw unauthenticated('Session not found.');

    if (stored.revokedAt) {
      if (Date.now() - stored.revokedAt.getTime() > REUSE_GRACE_MS) {
        // A token that was already rotated is being replayed: assume theft, kill the whole family.
        await this.prisma.refreshToken.updateMany({
          where: { familyId: stored.familyId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        throw new DomainError('TOKEN_REUSED', 401, 'Please sign in again.');
      }
      throw unauthenticated('Session was just refreshed.');
    }
    if (stored.expiresAt.getTime() <= Date.now()) throw unauthenticated('Your session has expired.');

    // Atomic claim: only one concurrent request can rotate this token.
    const claimed = await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (claimed.count === 0) throw unauthenticated('Session was just refreshed.');

    return this.issueSession(stored.user, stored.familyId, userAgent);
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
    });
    if (!stored) return;
    await this.prisma.refreshToken.updateMany({
      where: { familyId: stored.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async me(userId: string): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw unauthenticated('Account no longer exists.');
    return toAuthUser(user);
  }

  private async issueSession(user: User, familyId: string, userAgent?: string): Promise<IssuedSession> {
    const payload: AccessTokenPayload = { sub: user.id, role: user.role };
    const accessToken = await this.jwt.signAsync(payload);

    const refreshToken = randomBytes(48).toString('base64url');
    const ttlMs = this.config.env.REFRESH_TOKEN_TTL_DAYS * 86_400_000;
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        familyId,
        expiresAt: new Date(Date.now() + ttlMs),
        userAgent: userAgent?.slice(0, 300),
      },
    });

    return { user: toAuthUser(user), accessToken, refreshToken };
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= argon2.hash(randomBytes(16).toString('hex'));
    return this.dummyHash;
  }
}
