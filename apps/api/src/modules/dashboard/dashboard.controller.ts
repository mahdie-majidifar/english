import { Controller, Get } from '@nestjs/common';
import type { DashboardDto } from '@coach/contracts';
import type { RequestUser } from '../../core/auth/auth.types.js';
import { CurrentUser } from '../../core/auth/decorators.js';
import { DashboardService } from './dashboard.service.js';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  get(@CurrentUser() user: RequestUser): Promise<DashboardDto> {
    return this.dashboard.get(user.id);
  }
}
