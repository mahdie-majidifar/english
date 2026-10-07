import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { Role } from '@coach/contracts';
import { unauthenticated } from '../http/domain-error.js';
import type { RequestUser } from './auth.types.js';

export const IS_PUBLIC_KEY = 'isPublic';
/** Skips authentication for a route. Everything is protected by default. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = 'roles';
/** Restricts a route to the given roles. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** Injects the authenticated user. `userId` must always come from here, never from the request body. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): RequestUser => {
  const user = ctx.switchToHttp().getRequest<Request>().user;
  if (!user) throw unauthenticated();
  return user;
});
