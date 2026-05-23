import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UserModule } from 'src/user/user.module';
import { PassportModule } from '@nestjs/passport';
import { LocalStrategy } from './strategies/local.strategy';
import { JwtModule } from '@nestjs/jwt';
import { AtStrategy } from './strategies/at.strategy';
import { RtStrategy } from './strategies/rt.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { GithubStrategy } from './strategies/github.strategy';
import { ResetPasswordStrategy } from './strategies/reset-password.strategy';
import { ForgotPasswordStrategy } from './strategies/forgot-password.strategy';
import { RegisterStrategy } from './strategies/register.strategy';
import { EmailModule } from 'src/email/email.module';
import { ConfigService } from '@nestjs/config';
import { CLIENT_REDIRECT_SUCCESS_URL } from 'src/utils/types';

const clientRedirectSuccessUrlProvider = {
  provide: CLIENT_REDIRECT_SUCCESS_URL,
  useFactory: (configService: ConfigService) => {
    const clientUrl = configService.get<string>('CLIENT_URL')!;
    const clientRedirectSuccessPath = configService.get<string>('CLIENT_REDIRECT_SUCCESS_PATH')!;

    return `${clientUrl}${clientRedirectSuccessPath}`;
  },
  inject: [ConfigService],
}

@Module({
  imports: [
    EmailModule,
    UserModule,
    PassportModule,
    JwtModule.register({
      signOptions: {
        expiresIn: '5m',
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    clientRedirectSuccessUrlProvider,
    ConfigService,
    AuthService,
    LocalStrategy,
    AtStrategy,
    RtStrategy,
    GoogleStrategy,
    GithubStrategy,
    ResetPasswordStrategy,
    ForgotPasswordStrategy,
    RegisterStrategy,
  ],
})
export class AuthModule { }
