import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { API_PREFIX, configureApp } from './app.setup.js';
import { loadRootEnv } from './core/config/load-env.js';
import { AppConfig } from './core/config/env.js';

loadRootEnv();

const app = await NestFactory.create(AppModule);
configureApp(app);

const { API_PORT } = app.get(AppConfig).env;
await app.listen(API_PORT);
new Logger('Bootstrap').log(`API listening on http://localhost:${API_PORT}/${API_PREFIX}`);
