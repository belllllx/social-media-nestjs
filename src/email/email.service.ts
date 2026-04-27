import {
  BadRequestException,
  HttpException,
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
import { Logger } from '@nestjs/common';
import { CreateUserWithoutEmailDto } from './dto/create-user-with-out-email.dto';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter<
    SMTPTransport.SentMessageInfo,
    SMTPTransport.Options
  >;
  private readonly logger = new Logger(EmailService.name);

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

    try {
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
      if (oldOtp) {
        await this.deleteOtp(oldOtp.email);
      }

      const otp = `${Math.floor(Math.random() * 900000 + 100000)}`; // สร้าง OTP 6 หลัก
      const otpHash = await hashSecret(otp);

      const mailOptions: IEmailOptions = {
        from: '"bynsocial" <no-reply@bynsocial.com>',
        to: email,
        subject: 'Verify Your Email',
        html: `<p>Enter <b>${otp}</b> in the page to verify your email address and complete to reset password process.</p>
                  <p>This code <b>expires in 10 minutes</b>.</p>`,
      };

      const [_, result, token] = await Promise.all([
        this.prismaService.otp.create({
          data: {
            otpHash,
            email,
            expiresAt: new Date(Date.now() + 600000), // กำหนดให้ OTP หมดอายุใน 10 นาที
          },
        }),
        this.transporter.sendMail(mailOptions),
        createJwt(
          {
            email,
            sendEmailVerified: true,
          },
          this.configServiceP.get<string>('FORGOT_PASSWORD_SECRET')!,
          this.jwtService,
        ),
      ]);

      return {
        result,
        token,
      };
    } catch (error: unknown) {
      if (
        error instanceof PrismaClientKnownRequestError
        &&
        error.code === 'P2002'
      ) {
        this.logger.warn(error.message);

        throw new BadRequestException('Otp already exist in your email');
      }

      if (error instanceof Error) {
        this.logger.error(error.message, error.stack);
      } else {
        this.logger.error('Unknown error', JSON.stringify(error));
      }

      if (error instanceof HttpException) {
        const status = error.getStatus();

        if (status >= 500) {
          this.logger.error(error.message, error.stack);
        } else {
          this.logger.warn(error.message);
        }

        throw error;
      }

      throw new InternalServerErrorException('Failed to send email');
    }
  }

  async sendEmailRegister(
    sendEmailDto: SendEmailDto,
  ) {
    const { email, createUserDto } = sendEmailDto;

    try {
      const oldOtp = await this.prismaService.otp.findFirst({
        where: {
          email,
        },
      });
      if (oldOtp) {
        await this.deleteOtp(oldOtp.email);
      }

      const otp = `${Math.floor(Math.random() * 900000 + 100000)}`; // สร้าง OTP 6 หลัก
      const otpHash = await hashSecret(otp);

      const mailOptions: IEmailOptions = {
        from: '"bynsocial" <no-reply@bynsocial.com>',
        to: email,
        subject: 'Verify Your Email',
        html: `<p>Enter <b>${otp}</b> in the page to verify your email address and complete to register process.</p>
                  <p>This code <b>expires in 10 minutes</b>.</p>`,
      };

      const [_, result, token] = await Promise.all([
        this.prismaService.otp.create({
          data: {
            otpHash,
            email,
            expiresAt: new Date(Date.now() + 600000), // กำหนดให้ OTP หมดอายุใน 10 นาที
          },
        }),
        this.transporter.sendMail(mailOptions),
        createJwt(
          {
            email,
            sendEmailVerified: true,
            createUserDto: {
              ...createUserDto,
              email,
            },
          },
          this.configServiceP.get<string>('REGISTER_SECRET')!,
          this.jwtService,
        ),
      ]);

      return {
        result,
        token,
      };
    } catch (error: unknown) {
      if (
        error instanceof PrismaClientKnownRequestError
        &&
        error.code === 'P2002'
      ) {
        this.logger.warn(error.message);

        throw new BadRequestException('Otp already exist in your email');
      }

      if (
        error instanceof PrismaClientKnownRequestError
        &&
        error.code === 'P2000'
      ) {
        this.logger.warn(error.message);

        if (email && email.length > 30) {
          throw new BadRequestException("Email field is too long");
        }

        throw new BadRequestException("Some field is too long");
      }

      if (error instanceof Error) {
        this.logger.error(error.message, error.stack);
      } else {
        this.logger.error('Unknown error', JSON.stringify(error));
      }

      throw new InternalServerErrorException('Failed to send email register');
    }
  }

  async deleteOtp(email: string) {
    try {
      return await this.prismaService.otp.deleteMany({
        where: { email },
      });
    } catch (error: unknown) {
      if (
        error instanceof PrismaClientKnownRequestError
        &&
        error.code === 'P2025'
      ) {
        this.logger.warn(error.message);

        throw new NotFoundException(`OTP for email ${email} not found`);
      }

      if (error instanceof Error) {
        this.logger.error(error.message, error.stack);
      } else {
        this.logger.error('Unknown error', JSON.stringify(error));
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

      const [_, token] = await Promise.all([
        this.deleteOtp(email),
        createJwt(
          {
            email,
            otpVerified: true,
          },
          this.configServiceP.get<string>('RESET_PASSWORD_SECRET')!,
          this.jwtService,
        ),
      ]);

      return token;
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.error(error.message, error.stack);
      } else {
        this.logger.error('Unknown error', JSON.stringify(error));
      }

      if (error instanceof HttpException) {
        const status = error.getStatus();

        if (status >= 500) {
          this.logger.error(error.message, error.stack);
        } else {
          this.logger.warn(error.message);
        }

        throw error;
      }

      throw new InternalServerErrorException('Failed to verify otp');
    }
  }

  async verifyOtpRegister(
    verifyOtpDto: VerifyOtpDto & { email: string },
    createUserDto: CreateUserWithoutEmailDto,
  ) {
    const { email, otp } = verifyOtpDto;
    const { fullname, username } = createUserDto;

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

      await Promise.all([
        this.deleteOtp(email),
        this.userService.createUser({
          ...createUserDto,
          email,
        }),
      ]);

      return {
        message: 'Otp verified successfully',
      }
    } catch (error: unknown) {
      if (
        error instanceof PrismaClientKnownRequestError
        &&
        error.code === 'P2000'
      ) {
        this.logger.warn(error.message);

        if (fullname && fullname.length > 30) {
          throw new BadRequestException("Fullname field is too long");
        }

        if (username && username.length > 15) {
          throw new BadRequestException("Username field is too long");
        }

        if (email && email.length > 30) {
          throw new BadRequestException("Email field is too long");
        }

        throw new BadRequestException("Some field is too long");
      }

      if (error instanceof Error) {
        this.logger.error(error.message, error.stack);
      } else {
        this.logger.error('Unknown error', JSON.stringify(error));
      }

      if (error instanceof HttpException) {
        const status = error.getStatus();

        if (status >= 500) {
          this.logger.error(error.message, error.stack);
        } else {
          this.logger.warn(error.message);
        }

        throw error;
      }

      throw new InternalServerErrorException('Failed to verify otp register');
    }
  }
}
