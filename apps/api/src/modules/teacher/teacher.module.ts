import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { ExtractionService } from './extraction.service.js';
import { IngestionWorker } from './ingestion.worker.js';
import { TeacherController } from './teacher.controller.js';
import { TeacherService } from './teacher.service.js';

@Module({
  imports: [AiModule],
  controllers: [TeacherController],
  providers: [TeacherService, ExtractionService, IngestionWorker],
  exports: [TeacherService],
})
export class TeacherModule {}
