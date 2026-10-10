import { Controller, Get, Inject } from '@nestjs/common';
import type { SystemStatus } from '@coach/contracts';
import { Public } from '../../core/auth/decorators.js';
import { AppConfig } from '../../core/config/env.js';
import { LLM_PROVIDER, type LlmProvider } from '../ai/llm.js';

/** Facts the screens need before anyone is signed in. Nothing secret: no keys, no user data. */
@Controller('system')
export class SystemController {
  constructor(
    private readonly config: AppConfig,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
  ) {}

  @Public()
  @Get('status')
  status(): SystemStatus {
    return {
      registrationOpen: this.config.env.ALLOW_REGISTRATION,
      ai: {
        provider: this.llm.name === 'mock' ? 'mock' : this.llm.isConfigured ? 'openai' : 'none',
        configured: this.llm.isConfigured,
      },
    };
  }
}
