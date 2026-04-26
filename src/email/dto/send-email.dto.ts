import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, ValidateNested } from 'class-validator';
import { CreateUserWithoutEmailDto } from './create-user-with-out-email.dto';

export class SendEmailDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @ApiProperty({ type: CreateUserWithoutEmailDto })
  @ValidateNested()
  @Type(() => CreateUserWithoutEmailDto)
  createUserDto: CreateUserWithoutEmailDto;
}