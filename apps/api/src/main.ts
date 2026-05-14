import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger as PinoLogger } from 'nestjs-pino';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { env } from './config/env';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  app.useLogger(app.get(PinoLogger));

  // Body parser: 10MB pra suportar imports de CSV grandes do Ummense
  // (JSON-array-of-arrays pode passar de 1MB). Default Express e 100KB.
  // Usamos a API oficial do Nest (useBodyParser) ao inves de
  // `app.use(express.json(...))` porque `express` nao e dep DIRETA do api
  // package — vem via @nestjs/platform-express. Em runtime no Docker,
  // pnpm strict isolation bloquearia `require('express')`.
  app.useBodyParser('json', { limit: '10mb' });
  app.useBodyParser('urlencoded', { extended: true, limit: '10mb' });

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cookieParser());

  app.enableCors({
    origin: env.CORS_ORIGINS,
    credentials: true,
  });

  app.setGlobalPrefix('api', { exclude: ['/healthz', '/readyz'] });
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.enableShutdownHooks();

  // Em prod, /docs e /docs-json ficam protegidos por basic-auth no Caddy
  // (vars KTASK_DOCS_USER / KTASK_DOCS_HASH). Ver docs/api/README.md.
  const swaggerConfig = new DocumentBuilder()
    .setTitle('KTask API')
    .setDescription('REST API — gestão de tarefas e fluxos operacionais')
    .setVersion('0.0.1')
    .addBearerAuth()
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, swaggerDocument, {
    swaggerOptions: { persistAuthorization: true },
  });

  await app.listen(env.PORT, '0.0.0.0');
  const logger = app.get(PinoLogger);
  logger.log(`KTask API running on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  logger.log(`Swagger docs: http://localhost:${env.PORT}/docs`);
}

bootstrap().catch((err) => {
  // Logger nem sempre disponível se falhar no bootstrap
  console.error('Bootstrap failed:', err);
  process.exit(1);
});
