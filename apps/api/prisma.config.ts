import { defineConfig } from 'prisma/config';
import { loadRootEnv } from './src/core/config/load-env.js';

loadRootEnv();

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
});
