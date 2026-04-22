import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request as ExpressRequest } from 'express';
import { JwtPayload } from 'src/utils/types';
import { UserService } from 'src/user/user.service';

@Injectable()
export class AtStrategy extends PassportStrategy(Strategy, 'access-token') {
  constructor(
    configService: ConfigService,
    private userService: UserService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: ExpressRequest) => {
          const token = req?.cookies?.['access_token'];
          return token;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('AT_SECRET')!,
    });
  }

  validate(payload: JwtPayload<{ id: string }>) {
    return this.userService.findById(payload.id);
  }
}
