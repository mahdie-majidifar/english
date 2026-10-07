import { randomUUID } from 'node:crypto';

/**
 * Minimal in-memory stand-in for PrismaService, covering only what the auth/users flows use.
 * Lets the HTTP layer (guards, cookies, CSRF, error format) be tested without a database.
 */
interface UserRow {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  role: 'STUDENT' | 'TEACHER' | 'ADMIN';
  timezone: string;
}
interface ProfileRow {
  userId: string;
  englishLevel: string | null;
  learningGoal: string | null;
  dailyGoalMinutes: number;
  sessionMinutes: number;
}
interface TokenRow {
  id: string;
  userId: string;
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  userAgent?: string;
}

export class FakePrisma {
  users: UserRow[] = [];
  profiles: ProfileRow[] = [];
  tokens: TokenRow[] = [];

  addUser(row: Omit<UserRow, 'id' | 'role' | 'timezone'> & Partial<UserRow>): UserRow {
    const user: UserRow = { id: randomUUID(), role: 'STUDENT', timezone: 'Asia/Tehran', ...row };
    this.users.push(user);
    return user;
  }

  private withProfile(user: UserRow | undefined, include?: { profile?: boolean }) {
    if (!user) return null;
    return include?.profile
      ? { ...user, profile: this.profiles.find((p) => p.userId === user.id) ?? null }
      : user;
  }

  user = {
    findUnique: async ({
      where,
      include,
    }: {
      where: { id?: string; email?: string };
      include?: { profile?: boolean };
    }) =>
      this.withProfile(
        this.users.find((u) => (where.id ? u.id === where.id : u.email === where.email)),
        include,
      ),

    update: async ({
      where,
      data,
      include,
    }: {
      where: { id: string };
      data: {
        displayName?: string;
        timezone?: string;
        profile?: { upsert: { create: Partial<ProfileRow>; update: Partial<ProfileRow> } };
      };
      include?: { profile?: boolean };
    }) => {
      const user = this.users.find((u) => u.id === where.id);
      if (!user) throw new Error('not found');
      if (data.displayName !== undefined) user.displayName = data.displayName;
      if (data.timezone !== undefined) user.timezone = data.timezone;
      if (data.profile) {
        const existing = this.profiles.find((p) => p.userId === user.id);
        if (existing) Object.assign(existing, data.profile.upsert.update);
        else
          this.profiles.push({
            userId: user.id,
            englishLevel: null,
            learningGoal: null,
            dailyGoalMinutes: 10,
            sessionMinutes: 10,
            ...data.profile.upsert.create,
          });
      }
      return this.withProfile(user, include);
    },
  };

  refreshToken = {
    create: async ({ data }: { data: Omit<TokenRow, 'id' | 'revokedAt'> }) => {
      const row: TokenRow = { id: randomUUID(), revokedAt: null, ...data };
      this.tokens.push(row);
      return row;
    },

    findUnique: async ({
      where,
      include,
    }: {
      where: { tokenHash: string };
      include?: { user?: boolean };
    }) => {
      const row = this.tokens.find((t) => t.tokenHash === where.tokenHash);
      if (!row) return null;
      return include?.user ? { ...row, user: this.users.find((u) => u.id === row.userId) } : row;
    },

    updateMany: async ({
      where,
      data,
    }: {
      where: { id?: string; familyId?: string; revokedAt?: null };
      data: { revokedAt: Date };
    }) => {
      const matches = this.tokens.filter(
        (t) =>
          (where.id === undefined || t.id === where.id) &&
          (where.familyId === undefined || t.familyId === where.familyId) &&
          (where.revokedAt === undefined || t.revokedAt === null),
      );
      for (const t of matches) t.revokedAt = data.revokedAt;
      return { count: matches.length };
    },
  };

  $queryRaw = async () => [{ '?column?': 1 }];
  $connect = async () => undefined;
  $disconnect = async () => undefined;
}
