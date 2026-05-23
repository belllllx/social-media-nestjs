import { Module } from '@nestjs/common';
import { EmailController } from './email.controller';
import { EmailService } from './email.service';
import { JwtModule } from '@nestjs/jwt';
import { UserModule } from 'src/user/user.module';
import { TRANSPORTER } from 'src/utils/types';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

const transporterProvider = {
  provide: TRANSPORTER,
  useFactory: (configService: ConfigService) => {
    return nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: configService.get<string>('GMAIL_USER'),
        pass: configService.get<string>('GMAIL_APP_PASSWORD'),
      },
    });
  },
  inject: [ConfigService],
}

@Module({
  imports: [
    JwtModule.register({
      signOptions: {
        expiresIn: '5m',
      },
    }),
    UserModule,
  ],
  controllers: [EmailController],
  providers: [
    transporterProvider,
    ConfigService,
    EmailService,
  ],
  exports: [EmailService],
})
export class EmailModule { }
