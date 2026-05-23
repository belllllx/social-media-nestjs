import { Module } from '@nestjs/common';
import { CommentController } from './comment.controller';
import { CommentService } from './comment.service';
import { CommentGateway } from './comment.gateway';
import { UserModule } from 'src/user/user.module';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { S3Module } from 'src/s3/s3.module';

@Module({
  imports: [
    S3Module,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('AT_SECRET')!,
      }),
    }),
    UserModule,
  ],
  controllers: [CommentController],
  providers: [CommentService, CommentGateway],
})
export class CommentModule {}
