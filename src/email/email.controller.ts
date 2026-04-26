import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Request,
  Response,
  UseGuards,
} from '@nestjs/common';
import { EmailService } from './email.service';
import { ApiOkResponse } from '@nestjs/swagger';
import { SendEmailDto } from './dto/send-email.dto';
import { CommonResponse } from 'src/utils/swagger/common-response';
import {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from 'express';
import { ForgotPasswordAuthGuard } from 'src/auth/guards/forgot-password-auth.guard';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { JwtPayload, ResponseFromService } from 'src/utils/types';
import { setCookies } from 'src/utils/helpers/set-cookies';

@Controller('email')
export class EmailController {
  constructor(private emailService: EmailService) {}

  @Post('send')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    description: 'Email send successfully',
    type: CommonResponse,
  })
  async sendEmail(
    @Body() sendEmailDto: SendEmailDto,
    @Response({ passthrough: true })
    res: ExpressResponse,
  ): Promise<ResponseFromService> {
    const { result, token } = await this.emailService.sendEmail(
      sendEmailDto,
    );

    setCookies('forgot_password_token', token, res);
    return {
      message: `Email send to ${result.accepted[0]} successfully`,
    };
  }

  @Post('register/send')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    description: 'Email send successfully',
    type: CommonResponse,
  })
  async sendRegisterEmail(
    @Body() sendEmailDto: SendEmailDto,
    @Response({ passthrough: true })
    res: ExpressResponse,
  ): Promise<ResponseFromService> {
    const { result, token } = await this.emailService.sendEmailRegister(
      {
        ...sendEmailDto,
        createUserDto: sendEmailDto.createUserDto,
      },
    );

    setCookies('register_token', token, res);

    return {
      message: `Email send to ${result.accepted[0]} successfully`,
    };
  }

  @UseGuards(ForgotPasswordAuthGuard)
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    description: 'Otp verified successfully',
    type: CommonResponse,
  })
  async verifyOtp(
    @Body() verifyOtpDto: VerifyOtpDto,
    @Request() req: ExpressRequest,
    @Response({ passthrough: true })
    res: ExpressResponse,
  ): Promise<ResponseFromService> {
    const token = await this.emailService.verifyOtp({
      ...verifyOtpDto,
      email: (
        req.user as JwtPayload<{
          email: string;
        }>
      ).email,
    });

    setCookies('reset_password_token', token, res);
    res.clearCookie('forgot_password_token');

    return {
      message: 'Otp verified successfully',
    };
  }
}
