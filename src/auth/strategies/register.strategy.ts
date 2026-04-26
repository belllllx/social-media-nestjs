import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request as ExpressRequest } from 'express';
import { JwtPayload } from 'src/utils/types';
import { CreateUserDto } from '../dto/create-user.dto';
import { CreateUserWithoutEmailDto } from 'src/email/dto/create-user-with-out-email.dto';

@Injectable()
export class RegisterStrategy extends PassportStrategy(
  Strategy,
  'register-jwt',
) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: ExpressRequest) => {
          const token = req?.cookies?.['register_token'];
          return token;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('REGISTER_SECRET')!,
    });
  }

  validate(
    payload: JwtPayload<{
      email: string;
      createUserDto: CreateUserWithoutEmailDto;
    }>,
  ): JwtPayload<{
    email: string;
    createUserDto: CreateUserWithoutEmailDto;
  }> {
    return payload;
  }
}
