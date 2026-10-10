import { Module } from '@nestjs/common';
import { AppConfig } from '../../core/config/env.js';
import { AiGateway } from './ai-gateway.service.js';
import { AnswerEvaluatorService } from './answer-evaluator.service.js';
import { ContentParserService } from './content-parser.service.js';
import { ExerciseGeneratorService } from './exercise-generator.service.js';
import { LLM_PROVIDER, type LlmProvider } from './llm.js';
import { MockProvider } from './providers/mock.provider.js';
import { OpenAiProvider } from './providers/openai.provider.js';
import { UnconfiguredProvider } from './providers/unconfigured.provider.js';

@Module({
  providers: [
    {
      provide: LLM_PROVIDER,
      inject: [AppConfig],
      // The provider is chosen here and nowhere else. Adding another one means adding a branch.
      useFactory: (config: AppConfig): LlmProvider => {
        if (config.env.AI_PROVIDER === 'mock') return new MockProvider();
        return config.env.OPENAI_API_KEY ? new OpenAiProvider(config) : new UnconfiguredProvider();
      },
    },
    AiGateway,
    ContentParserService,
    AnswerEvaluatorService,
    ExerciseGeneratorService,
  ],
  exports: [LLM_PROVIDER, AiGateway, ContentParserService, AnswerEvaluatorService, ExerciseGeneratorService],
})
export class AiModule {}
