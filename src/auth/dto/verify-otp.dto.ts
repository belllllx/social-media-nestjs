import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class VerifyOtpDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{6}$/, {
    message: 'otp must be a 6 digit',
  })
  otp: string;
}
