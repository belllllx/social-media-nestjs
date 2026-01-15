import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/prisma/prisma.service';
import { SendEmailDto } from './dto/send-email.dto';
import { hashSecret } from 'src/utils/helpers/hash-secret';
import { PrismaClientKnownRequestError } from 'generated/prisma/runtime/library';
import { IEmailOptions } from 'src/utils/types';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ProviderType } from 'generated/prisma';
import { JwtService } from '@nestjs/jwt';
import { createJwt } from 'src/utils/helpers/create-jwt';
import { UserService } from 'src/user/user.service';
import * as nodemailer from 'nodemailer';
import * as bcrypt from 'bcrypt';
import SMTPTransport from 'nodemailer/lib/smtp-transport';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter<
    SMTPTransport.SentMessageInfo,
    SMTPTransport.Options
  >;

  constructor(
    configService: ConfigService,
    private prismaService: PrismaService,
    private jwtService: JwtService,
    private configServiceP: ConfigService,
    private userService: UserService,
  ) {
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: configService.get<string>('GMAIL_USER'),
        pass: configService.get<string>('GMAIL_APP_PASSWORD'),
      },
    });
  }

  async sendEmail(sendEmailDto: SendEmailDto) {
    const { email } = sendEmailDto;
    const user = await this.userService.findByEmail(email);
    if (!user) {
      throw new NotFoundException(`Email ${email} not found`);
    }

    const providerTypeUser = user.providerType;
    if (
      providerTypeUser === ProviderType.GOOGLE ||
      providerTypeUser === ProviderType.GITHUB
    ) {
      throw new BadRequestException(
        'Cannot reset password for social login users',
      );
    }

    const oldOtp = await this.prismaService.otp.findFirst({
      where: {
        email,
      },
    });
    if(oldOtp){
      await this.deleteOtp(oldOtp.email);
    }

    const otp = `${Math.floor(Math.random() * 900000 + 100000)}`; // สร้าง OTP 6 หลัก
    const otpHash = await hashSecret(otp);
    try {
      await this.prismaService.otp.create({
        data: {
          otpHash,
          email,
          expiresAt: new Date(Date.now() + 600000), // กำหนดให้ OTP หมดอายุใน 10 นาที
        },
      });
      const mailOptions: IEmailOptions = {
        from: '"bynsocial" <bynsocial@email.com>',
        to: email,
        subject: 'Verify Your Email',
        html: `<p>Enter <b>${otp}</b> in the page to verify your email address and complete to reset password process.</p>
                  <p>This code <b>expires in 10 minutes</b>.</p>`,
      };
      const result = await this.transporter.sendMail(mailOptions);
      const token = await createJwt(
        {
          email,
          sendEmailVerified: true,
        },
        this.configServiceP.get<string>('FORGOT_PASSWORD_SECRET')!,
        this.jwtService,
      );

      return {
        result,
        token,
      };
    } catch (error: unknown) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException('Otp already exist in your email');
      } else if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }

      throw new InternalServerErrorException('Failed to send email');
    }
  }

  async deleteOtp(email: string) {
    try {
      return await this.prismaService.otp.deleteMany({
        where: { email },
      });
    } catch (error: unknown) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException(`OTP for email ${email} not found`);
      }

      throw new InternalServerErrorException('Failed to delete OTP');
    }
  }

  async verifyOtp(verifyOtpDto: VerifyOtpDto & { email: string }) {
    const { email, otp } = verifyOtpDto;
    try {
      const otpRecord = await this.prismaService.otp.findFirst({
        where: {
          email,
          expiresAt: {
            gt: new Date(),
          },
        },
      });

      if (!otpRecord) {
        await this.deleteOtp(email);
        throw new BadRequestException('Otp expried or not found');
      }

      const isOtpValid = await bcrypt.compare(otp, otpRecord.otpHash);

      if (!isOtpValid) {
        throw new BadRequestException('Otp is invalid');
      }

      await this.deleteOtp(email);
      const token = await createJwt(
        {
          email,
          otpVerified: true,
        },
        this.configServiceP.get<string>('RESET_PASSWORD_SECRET')!,
        this.jwtService,
      );

      return token;
    } catch (error: unknown) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      throw new InternalServerErrorException('Failed to verify otp');
    }
  }
}
