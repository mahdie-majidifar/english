import { Injectable } from '@nestjs/common';
import { isValidTimeZone } from '@coach/domain';
import type { Profile, UpdateProfile } from '@coach/contracts';
import { DomainError, unauthenticated } from '../../core/http/domain-error.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import type { User, UserProfile } from '../../generated/prisma/client.js';

type UserWithProfile = User & { profile: UserProfile | null };

function toProfile(user: UserWithProfile): Profile {
  return {
    displayName: user.displayName,
    timezone: user.timezone,
    englishLevel: (user.profile?.englishLevel ?? null) as Profile['englishLevel'],
    learningGoal: user.profile?.learningGoal ?? null,
    dailyGoalMinutes: user.profile?.dailyGoalMinutes ?? 10,
    sessionMinutes: user.profile?.sessionMinutes ?? 10,
    difficulty: user.profile?.difficulty ?? 'CHALLENGING',
  };
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string): Promise<Profile> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });
    if (!user) throw unauthenticated('Account no longer exists.');
    return toProfile(user);
  }

  async updateProfile(userId: string, patch: UpdateProfile): Promise<Profile> {
    if (patch.timezone !== undefined && !isValidTimeZone(patch.timezone)) {
      throw new DomainError('VALIDATION_FAILED', 400, 'Some fields are invalid.', [
        { path: 'timezone', message: 'Unknown timezone.' },
      ]);
    }

    const { displayName, timezone, ...profileFields } = patch;
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(displayName !== undefined ? { displayName } : {}),
        ...(timezone !== undefined ? { timezone } : {}),
        profile: {
          upsert: { create: profileFields, update: profileFields },
        },
      },
      include: { profile: true },
    });
    return toProfile(user);
  }
}
