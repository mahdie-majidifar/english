import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ConfigModule } from './core/config/config.module.js';
import { StorageModule } from './core/storage/storage.module.js';
import { ProblemFilter } from './core/http/problem.filter.js';
import { PrismaModule } from './core/prisma/prisma.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CatalogModule } from './modules/catalog/catalog.module.js';
import { ContentModule } from './modules/content/content.module.js';
import { ExercisesModule } from './modules/exercises/exercises.module.js';
import { HealthController } from './modules/health/health.controller.js';
import { TeacherModule } from './modules/teacher/teacher.module.js';
import { UsersModule } from './modules/users/users.module.js';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    StorageModule,
    // Global ceiling; sensitive routes (login, AI) tighten it with @Throttle().
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 300 }],
      // Test-only switch so suites that log in many times are not rate limited.
      skipIf: () => process.env['DISABLE_THROTTLE'] === '1',
    }),
    AuthModule,
    UsersModule,
    CatalogModule,
    ContentModule,
    TeacherModule,
    ExercisesModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: ProblemFilter },
  ],
})
export class AppModule {}
