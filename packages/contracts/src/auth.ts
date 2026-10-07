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
