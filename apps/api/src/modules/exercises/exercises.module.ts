import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { LearningModule } from '../learning/learning.module.js';
import { ProgressModule } from '../progress/progress.module.js';
import { AttemptsService } from './attempts.service.js';
import { ExercisesController } from './exercises.controller.js';
import { ExercisesService } from './exercises.service.js';

@Module({
  imports: [AiModule, LearningModule, ProgressModule],
  controllers: [ExercisesController],
  providers: [ExercisesService, AttemptsService],
  exports: [ExercisesService, AttemptsService],
})
export class ExercisesModule {}
