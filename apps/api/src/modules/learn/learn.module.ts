import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { LearnController } from './learn.controller.js';
import { LearnService } from './learn.service.js';

@Module({
  imports: [AiModule],
  controllers: [LearnController],
  providers: [LearnService],
})
export class LearnModule {}
