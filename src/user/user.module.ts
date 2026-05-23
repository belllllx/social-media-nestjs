import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { UserGateway } from './user.gateway';
import { NotificationModule } from 'src/notification/notification.module';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { S3Module } from 'src/s3/s3.module';

@Module({
  imports: [
    S3Module,
    NotificationModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('AT_SECRET')!, 
      }),
    }),
  ],
  providers: [UserService, UserGateway],
  exports: [UserService],
  controllers: [UserController],
})
export class UserModule {}
