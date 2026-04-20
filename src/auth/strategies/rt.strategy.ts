import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request as ExpressRequest } from 'express';
import { JwtPayload } from 'src/utils/types';
import { UserService } from 'src/user/user.service';
import { Follower, User } from 'generated/prisma';

@Injectable()
export class RtStrategy extends PassportStrategy(Strategy, 'refresh-token') {
  constructor(
    configService: ConfigService,
    private userService: UserService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: ExpressRequest) => {
          const token = req?.cookies?.['refresh_token'];
          return token;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('RT_SECRET')!,
    });
  }

  validate(payload: JwtPayload<{ id: string }>): Promise<
    Omit<User, 'passwordHash'> &
    {
      followings: (Follower & { following: Omit<User, 'passwordHash'> })[];
      followers: (Follower & { follower: Omit<User, 'passwordHash'> })[];
    }
  > {
    return this.userService.findById(payload.id);
  }
}
