import { Body, Controller, Get, Patch } from '@nestjs/common';
import { UpdateProfileSchema, type Profile, type UpdateProfile } from '@coach/contracts';
import type { RequestUser } from '../../core/auth/auth.types.js';
import { CurrentUser } from '../../core/auth/decorators.js';
import { ZodValidationPipe } from '../../core/http/zod-validation.pipe.js';
import { UsersService } from './users.service.js';

@Controller('me/profile')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  get(@CurrentUser() user: RequestUser): Promise<Profile> {
    return this.users.getProfile(user.id);
  }

  @Patch()
  update(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(UpdateProfileSchema)) body: UpdateProfile,
  ): Promise<Profile> {
    return this.users.updateProfile(user.id, body);
  }
}
