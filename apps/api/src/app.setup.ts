import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppConfig } from './core/config/env.js';
import { originCheck, requestId } from './core/http/request-context.middleware.js';

export const API_PREFIX = 'api/v1';

/** Shared by `main.ts` and the integration tests so both run the same pipeline. */
export function configureApp(app: INestApplication): void {
  const config = app.get(AppConfig);
  app.setGlobalPrefix(API_PREFIX);
  app.use(requestId());
  app.use(helmet());
  app.use(cookieParser());
  app.use(originCheck(config.webOrigins));
  app.enableShutdownHooks();
}
