import { Global, Module } from '@nestjs/common';
import { AppConfig } from './env.js';

@Global()
@Module({
  providers: [AppConfig],
  exports: [AppConfig],
})
export class ConfigModule {}
