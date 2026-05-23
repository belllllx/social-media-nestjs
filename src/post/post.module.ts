import { Module } from '@nestjs/common';
import { PostController } from './post.controller';
import { PostService } from './post.service';
import { UserModule } from 'src/user/user.module';
import { NotificationModule } from 'src/notification/notification.module';
import { PostGateway } from './post.gateway';
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
    NotificationModule,
  ],
  controllers: [PostController],
  providers: [PostService, PostGateway],
})
export class PostModule {}
