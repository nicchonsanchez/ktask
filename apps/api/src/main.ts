import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { Logger as PinoLogger } from 'nestjs-pino';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { env } from './config/env';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  app.useLogger(app.get(PinoLogger));

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

  if (env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('KTask API')
      .setDescription('REST API — gestão de tarefas e fluxos operacionais')
      .setVersion('0.0.1')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  await app.listen(env.PORT, '0.0.0.0');
  const logger = app.get(PinoLogger);
  logger.log(`KTask API running on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  if (env.NODE_ENV !== 'production') {
    logger.log(`Swagger docs: http://localhost:${env.PORT}/docs`);
  }
}

bootstrap().catch((err) => {
  // Logger nem sempre disponível se falhar no bootstrap
  console.error('Bootstrap failed:', err);
  process.exit(1);
});
