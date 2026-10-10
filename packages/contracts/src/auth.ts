import { z } from 'zod';
import { RoleSchema } from './enums.js';

export const LoginRequestSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(200),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const AuthUserSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  displayName: z.string(),
  role: RoleSchema,
  timezone: z.string(),
});
export type AuthUser = z.infer<typeof AuthUserSchema>;

export const MeResponseSchema = z.object({ user: AuthUserSchema });
export type MeResponse = z.infer<typeof MeResponseSchema>;

/** At least 8 characters, with a letter and a number. Long enough to resist guessing, short enough to remember. */
export const PasswordSchema = z
  .string()
  .min(8, 'Use at least 8 characters.')
  .max(200)
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), 'Use at least one letter and one number.');

const isTimezone = (tz: string) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

export const RegisterRequestSchema = z.object({
  displayName: z.string().trim().min(1, 'Enter your name.').max(60),
  email: z.email().max(254),
  password: PasswordSchema,
  /** The browser's own zone, so "today" is the learner's today from the first day. */
  timezone: z.string().refine(isTimezone, 'Unknown time zone.').optional(),
});
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

/** What the sign-in screens need to know before anyone is signed in. */
export interface SystemStatus {
  registrationOpen: boolean;
  ai: {
    /** "none" when no key is set, so the app can say how to turn the AI features on. */
    provider: 'openai' | 'mock' | 'none';
    configured: boolean;
  };
}
