import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { HttpStatus, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { CommonResponse } from './utils/swagger/common-response';
import { HttpExceptionFilter } from './utils/exception-filters/http-exception.filter';
import { TransformInterceptor } from './utils/interceptors/transform.interceptor';
import { LoggingInterceptor } from './utils/interceptors/logging.interceptor';
import * as cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const config = new DocumentBuilder()
    .setTitle('Social Media API')
    .setDescription('The Social Media API documentation')
    .setVersion('1.0')
    .addGlobalResponse(
      {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        description: 'Internal server error',
        type: CommonResponse,
      },
      {
        status: HttpStatus.BAD_REQUEST,
        description: 'Bad request',
        type: CommonResponse,
      },
    )
    .build();
  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, documentFactory);

  app.useGlobalInterceptors(
    new TransformInterceptor(),
    new LoggingInterceptor(),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.setGlobalPrefix('api', {
    exclude: ['auth/google/callback', 'auth/github/callback'],
  });
  app.enableCors({
    origin: 'http://localhost:3000',
    credentials: true,
  });
  app.use(cookieParser());

  await app.listen(process.env.PORT ?? 5000);
}
bootstrap();
