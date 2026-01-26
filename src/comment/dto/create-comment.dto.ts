import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
} from 'class-validator';

export class CreateCommentDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  message?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @IsUrl()
  @IsNotEmpty()
  fileUrl?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  @IsNotEmpty()
  replyToUserId?: string;
}
