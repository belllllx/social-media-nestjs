import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Request,
  Response,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from 'express';
import { ProviderType, User } from 'generated/prisma';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTemporaryRedirectResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CommonResponse } from 'src/utils/swagger/common-response';
import { CreateUserDto } from './dto/create-user.dto';
import { SignInUserDto } from './dto/signin-user.dto';
import { AtAuthGuard } from './guards/at-auth.guard';
import { RtAuthGuard } from './guards/rt-auth.guard';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import {
  ISocialUserPayload,
  ITokenObject,
  ResponseFromService,
} from 'src/utils/types';
import { GithubAuthGuard } from './guards/github-auth.guard';
import { setCookies } from 'src/utils/helpers/set-cookies';
import { clearCookies } from 'src/utils/helpers/clear-cookies';
import { ConfigService } from '@nestjs/config';

@Controller('auth')
export class AuthController {
  private CLIENT_URL: string;
  private CLIENT_REDIRECT_SUCCESS_PATH: string;
  private CLIENT_REDIRECT_SUCCESS_URL: string;

  constructor(
    private authService: AuthService,
    private configService: ConfigService,
  ) {
    this.CLIENT_URL = this.configService.get<string>('CLIENT_URL')!;
    this.CLIENT_REDIRECT_SUCCESS_PATH = this.configService.get<string>(
      'CLIENT_REDIRECT_SUCCESS_PATH',
    )!;
    this.CLIENT_REDIRECT_SUCCESS_URL = `${this.CLIENT_URL}${this.CLIENT_REDIRECT_SUCCESS_PATH}`;
  }

  @UseGuards(LocalAuthGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: SignInUserDto })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized',
    type: CommonResponse,
  })
  @ApiOkResponse({
    description: 'Login successfully',
    type: CommonResponse,
  })
  async login(
    @Request() req: ExpressRequest,
    @Response({ passthrough: true }) res: ExpressResponse,
  ): Promise<ResponseFromService> {
    const { accessToken, refreshToken } = await this.authService.login(
      req.user as Omit<User, 'passwordHash'>,
    );

    setCookies(
      ['access_token', 'refresh_token'],
      [accessToken, refreshToken],
      res,
    );
    return {
      message: 'Login successfully',
    };
  }

  @Post('register')
  @ApiCreatedResponse({
    description: 'User created successfully',
    type: CommonResponse,
  })
  async register(
    @Body() createUserDto: CreateUserDto,
  ): Promise<ResponseFromService<Omit<User, 'passwordHash'>>> {
    const user = await this.authService.register(createUserDto);

    return {
      message: 'User created successfully',
      data: user,
    };
  }

  @UseGuards(AtAuthGuard)
  @Get('profile')
  @ApiUnauthorizedResponse({
    description: 'Unauthorized',
    type: CommonResponse,
  })
  @ApiOkResponse({
    description: 'User profile retrieved successfully',
    type: CommonResponse,
  })
  getProfile(
    @Request() req: ExpressRequest,
  ): ResponseFromService<Omit<User, 'passwordHash'>> {
    const user = req.user as Omit<User, 'passwordHash'>;
    return {
      message: 'User profile retrieved successfully',
      data: user,
    };
  }

  @UseGuards(RtAuthGuard)
  @Post('refresh-token')
  @HttpCode(HttpStatus.OK)
  @ApiUnauthorizedResponse({
    description: 'Unauthorized',
    type: CommonResponse,
  })
  @ApiOkResponse({
    description: 'Tokens refreshed successfully',
    type: CommonResponse,
  })
  async refreshToken(
    @Request() req: ExpressRequest,
    @Response({ passthrough: true }) res: ExpressResponse,
  ): Promise<ResponseFromService<ITokenObject>> {
    const user = req.user as Omit<User, 'passwordHash'>;
    const { accessToken, refreshToken } =
      await this.authService.refreshToken(user);

    setCookies(
      ['access_token', 'refresh_token'],
      [accessToken, refreshToken],
      res,
    );
    return {
      message: 'Tokens refreshed successfully',
      data: {
        accessToken,
        refreshToken,
      },
    };
  }

  @UseGuards(AtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    description: 'Logged out successfully',
    type: CommonResponse,
  })
  logout(
    @Response({ passthrough: true }) res: ExpressResponse,
  ): ResponseFromService {
    clearCookies(res, 'access_token', 'refresh_token');
    return {
      message: 'Logged out successfully',
    };
  }

  @UseGuards(GoogleAuthGuard)
  @Get('google')
  @ApiOperation({ summary: 'Redirect to Google Login' })
  @ApiTemporaryRedirectResponse({
    description: 'Redirect to Google for authentication',
  })
  googleLogin() {}

  @UseGuards(GoogleAuthGuard)
  @Get('google/callback')
  @ApiOperation({ summary: 'Google Login Callback' })
  @ApiFoundResponse({
    description: 'Redirected after google login',
  })
  async googleLoginCallback(
    @Request() req: ExpressRequest,
    @Response() res: ExpressResponse,
  ) {
    const { success, url, token } = await this.authService.socialLogin(
      req.user as ISocialUserPayload,
      ProviderType.GOOGLE,
    );

    if (!success && url && !token) {
      res.redirect(url);
    }
    if (success && !url && token) {
      setCookies(
        ['access_token', 'refresh_token'],
        [token.accessToken, token.refreshToken],
        res,
      );
      res.redirect(this.CLIENT_REDIRECT_SUCCESS_URL);
    }
  }

  @UseGuards(GithubAuthGuard)
  @Get('github')
  @ApiOperation({ summary: 'Redirect to github Login' })
  @ApiTemporaryRedirectResponse({
    description: 'Redirect to Github for authentication',
  })
  githubLogin() {}

  @UseGuards(GithubAuthGuard)
  @Get('github/callback')
  @ApiOperation({ summary: 'Github Login Callback' })
  @ApiFoundResponse({
    description: 'Redirected after Github login',
  })
  async githubLoginCallback(
    @Request() req: ExpressRequest,
    @Response() res: ExpressResponse,
  ) {
    const { success, url, token } = await this.authService.socialLogin(
      req.user as ISocialUserPayload,
      ProviderType.GITHUB,
    );

    if (!success && url && !token) {
      res.redirect(url);
    }
    if (success && !url && token) {
      setCookies(
        ['access_token', 'refresh_token'],
        [token.accessToken, token.refreshToken],
        res,
      );
      res.redirect(this.CLIENT_REDIRECT_SUCCESS_URL);
    }
  }
}
