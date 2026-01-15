import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserService } from 'src/user/user.service';
import { ProviderType, User } from 'generated/prisma';
import { CreateUserDto } from './dto/create-user.dto';
import { CreateSocialUserDto, ISocialUserPayload } from 'src/utils/types';
import { createJwt } from 'src/utils/helpers/create-jwt';
import { createJwtUser } from 'src/utils/helpers/create-jwt-user';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private userService: UserService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async validateUser(
    username: string,
    password: string,
  ){
    const user = await this.userService.findOne(username);
    if (
      user &&
      user.providerType === ProviderType.LOCAL &&
      user.passwordHash &&
      (await bcrypt.compare(password, user.passwordHash))
    ) {
      const { passwordHash, ...result } = user;
      return result;
    }

    return null;
  }

  login(user: Omit<User, 'passwordHash'>) {
    return createJwtUser(user, this.jwtService, this.configService);
  }

  register(createUserDto: CreateUserDto) {
    return this.userService.createUser(createUserDto);
  }

  refreshToken(user: Omit<User, 'passwordHash'>) {
    return createJwtUser(user, this.jwtService, this.configService);
  }

  async socialLogin(user: ISocialUserPayload, providerType: ProviderType) {
    const userExist = await this.userService.findByEmail(user.email);

    const CLIENT_URL = this.configService.get<string>('CLIENT_URL');
    const CLIENT_REDIRECT_ERROR_PATH = this.configService.get<string>(
      'CLIENT_REDIRECT_ERROR_PATH',
    );
    const CLIENT_REDIRECT_ERROR_URL = `${CLIENT_URL}${CLIENT_REDIRECT_ERROR_PATH}`;
    const msg = 'email already registered with a different provider';

    // กรณีที่ผู้ใช้มีอยู่แล้ว
    if (providerType === ProviderType.GOOGLE && userExist) {
      //กรณี provider ไม่ตรง
      if (userExist.providerType !== ProviderType.GOOGLE) {
        const token = await createJwt(
          {
            socialAuthVerified: true,
          },
          this.configService.get<string>('SOCIAL_LOGIN_ERROR_SECRET')!,
          this.jwtService,
        );
        return {
          success: false,
          url: `${CLIENT_REDIRECT_ERROR_URL}?message=${encodeURIComponent(msg)}&error_token=${token}`,
          token: null,
        };
      }

      const token = await createJwtUser(
        userExist,
        this.jwtService,
        this.configService,
      );
      return {
        success: true,
        token,
        url: null,
      };
    } else if (providerType === ProviderType.GITHUB && userExist) {
      //กรณี provider ไม่ตรง
      if (userExist.providerType !== ProviderType.GITHUB) {
        const token = await createJwt(
          {
            socialAuthVerified: true,
          },
          this.configService.get<string>('SOCIAL_LOGIN_ERROR_SECRET')!,
          this.jwtService,
        );
        return {
          success: false,
          url: `${CLIENT_REDIRECT_ERROR_URL}?message=${encodeURIComponent(msg)}&error_token=${token}`,
          token: null,
        };
      }

      const token = await createJwtUser(
        userExist,
        this.jwtService,
        this.configService,
      );
      return {
        success: true,
        token,
        url: null,
      };
    } else {
      // กรณีที่ผู้ใช้ยังไม่มีในระบบ
      const createSocialUserDto: CreateSocialUserDto = {
        fullname: user.name,
        email: user.email,
        providerType,
        profileUrl: user.avatar,
      };
      const userData = await this.userService.createUser(createSocialUserDto);
      const token = await createJwtUser(
        userData,
        this.jwtService,
        this.configService,
      );
      return {
        success: true,
        token,
        url: null,
      };
    }
  }
}
