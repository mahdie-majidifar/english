import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { SystemController } from './system.controller.js';

@Module({ imports: [AiModule], controllers: [SystemController] })
export class SystemModule {}
