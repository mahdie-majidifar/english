import { Module } from '@nestjs/common';
import { ExercisesModule } from '../exercises/exercises.module.js';
import { LearningModule } from '../learning/learning.module.js';
import { ProgressModule } from '../progress/progress.module.js';
import { SessionsController } from './sessions.controller.js';
import { SessionsService } from './sessions.service.js';

@Module({
  imports: [ExercisesModule, LearningModule, ProgressModule],
  controllers: [SessionsController],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}
