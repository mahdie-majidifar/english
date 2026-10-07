import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module.js';
import { LearningModule } from '../learning/learning.module.js';
import { ProgressModule } from '../progress/progress.module.js';
import { SessionsModule } from '../sessions/sessions.module.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';

@Module({
  imports: [CatalogModule, LearningModule, ProgressModule, SessionsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
