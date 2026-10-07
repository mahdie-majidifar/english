import { Module } from '@nestjs/common';
import { LearningService } from './learning.service.js';
import { MistakesController } from './mistakes.controller.js';
import { MistakesService } from './mistakes.service.js';

@Module({
  controllers: [MistakesController],
  providers: [LearningService, MistakesService],
  exports: [LearningService, MistakesService],
})
export class LearningModule {}
